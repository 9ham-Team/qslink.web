#!/usr/bin/env node
/**
 * tests/console.mjs — 逐路由检查浏览器控制台报错（零依赖，Node >= 18）。
 *
 * 复用本机 Edge/Chrome 的 CDP：单浏览器实例依次打开所有页面路由，收集
 *   - Runtime.exceptionThrown  未捕获 JS 异常
 *   - Runtime.consoleAPICalled console.error（含参数摘要）
 *   - Log.entryAdded           error 级日志（含资源 404 / 网络失败）
 * 输出每路由结果与汇总；有未捕获异常/console.error/资源错误时退出码 1。
 *
 * 用法：
 *   node tests/console.mjs                  # 检查全部路由（含登录态）
 *   node tests/console.mjs --only=admin     # 只检查匹配路由
 *   node tests/console.mjs --base=http://127.0.0.1:8787
 *   node tests/console.mjs --mobile         # 390x844 移动视口
 *   node tests/console.mjs --forbid=波段,模式  # 页面可见文本中出现这些词即报错（v3 回归用）
 *
 * 除控制台报错/横向溢出外，还会检查页面 img / background-image 是否出现
 * `bg7mom-front` / `bg7mom-back` 真实卡图路径（v3 隐私要求：公开平台不展示）。
 *
 * 说明：页面在 8787 上只读访问，不执行任何写操作。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const argValue = (name) => {
  const hit = ARGS.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const BASE = (argValue('base') || process.env.QSL_SHOT_BASE || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const ONLY = (argValue('only') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const MOBILE = ARGS.includes('--mobile');
const FORBID = (argValue('forbid') || '')
  .split(',')
  .map((term) => term.trim())
  .filter(Boolean);
const WIDTH = MOBILE ? 390 : 1440;
const HEIGHT = MOBILE ? 844 : 1000;
const WAIT_BUDGET = parseInt(argValue('budget') || '9000', 10);
const USER_CREDS = { identifier: 'bg7mom', password: 'Demo@123456' };
const ADMIN_CREDS = { identifier: 'admin', password: 'Admin@123456' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(method, pathname, { token, body } = {}) {
  const init = { method, headers: {}, signal: AbortSignal.timeout(8000) };
  if (token) init.headers.authorization = `Bearer ${token}`;
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + pathname, init);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text };
}

async function login(creds) {
  const res = await fetchJson('POST', '/api/auth/login', { body: creds });
  if (res.status !== 200 || !res.json || !res.json.token) {
    throw new Error(`登录 ${creds.identifier} 失败: HTTP ${res.status}`);
  }
  return res.json.token;
}

async function resolveFixtures(userToken) {
  const fixtures = { cardId: null, shareToken: null };
  try {
    const mine = await fetchJson('GET', '/api/me/cards', { token: userToken });
    const items = (mine.json && mine.json.items) || [];
    const approved = items.find((item) => item.status === 'approved') || items[0];
    if (approved) {
      fixtures.cardId = approved.id;
      fixtures.shareToken = approved.shareToken || null;
    }
    if (!fixtures.shareToken && fixtures.cardId) {
      const share = await fetchJson('GET', `/api/cards/${fixtures.cardId}/share`, { token: userToken });
      if (share.status === 200 && share.json) fixtures.shareToken = share.json.shareToken;
    }
  } catch {
    /* ignore */
  }
  return fixtures;
}

function buildRoutes({ userToken, adminToken, fixtures }) {
  const token = encodeURIComponent(userToken || '');
  const adminTokenEnc = encodeURIComponent(adminToken || '');
  const routes = [
    { name: 'home', path: '/' },
    { name: 'explore', path: '/explore' },
    { name: 'login', path: '/login' },
    { name: 'register', path: '/register' },
    { name: 'not-found', path: '/this-route-does-not-exist' },
  ];
  if (fixtures.cardId) routes.push({ name: 'card-detail', path: `/card/${fixtures.cardId}` });
  if (fixtures.shareToken) routes.push({ name: 'share', path: `/share/${fixtures.shareToken}` });
  if (userToken) {
    routes.push(
      { name: 'dashboard', path: `/dashboard?devToken=${token}` },
      { name: 'my-cards', path: `/dashboard/cards?devToken=${token}` },
      { name: 'card-new', path: `/dashboard/cards/new?devToken=${token}` },
      { name: 'exchanges', path: `/dashboard/exchanges?devToken=${token}` },
      { name: 'exchanges-outgoing', path: `/dashboard/exchanges?box=outgoing&devToken=${token}` },
      { name: 'profile', path: `/dashboard/profile?devToken=${token}` },
    );
    if (fixtures.cardId) {
      routes.push({ name: 'card-edit', path: `/dashboard/cards/${fixtures.cardId}/edit?devToken=${token}` });
    }
  }
  if (adminToken) {
    routes.push(
      { name: 'admin', path: `/admin?devToken=${adminTokenEnc}` },
      { name: 'admin-users', path: `/admin?tab=users&devToken=${adminTokenEnc}` },
      { name: 'admin-cards', path: `/admin?tab=cards&devToken=${adminTokenEnc}` },
      { name: 'admin-exchanges', path: `/admin?tab=exchanges&devToken=${adminTokenEnc}` },
    );
  }
  return routes;
}

const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败')));
    });
    this.ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || 'CDP 错误'));
        else resolve(msg.result);
      } else if (msg.method) {
        const list = this.handlers.get(msg.method);
        if (list) for (const fn of list) fn(msg.params);
      }
    });
  }

  on(method, fn) {
    const list = this.handlers.get(method) || [];
    list.push(fn);
    this.handlers.set(method, list);
  }

  send(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 超时: ${method}`));
        }
      }, 30000);
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

function previewArg(arg) {
  if (!arg) return '';
  if (arg.value !== undefined) return typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value);
  if (arg.description) return arg.description;
  return arg.type || '?';
}

function shorten(text, max = 220) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

async function main() {
  console.log('QSLink 控制台报错检查');
  console.log(`  base: ${BASE}  viewport: ${WIDTH}x${HEIGHT}${FORBID.length ? `  forbid: ${FORBID.join(',')}` : ''}`);

  // 1) 服务可达性
  const health = await fetchJson('GET', '/api/health').catch((err) => ({ status: 0, error: err }));
  if (health.status !== 200) {
    console.error(`开发服务器未就绪: ${BASE}（${health.status || health.error}）`);
    process.exitCode = 2;
    return;
  }

  // 2) 登录 & fixtures
  const userToken = await login(USER_CREDS).catch((err) => {
    console.error(`[setup] ${err.message}`);
    return null;
  });
  const adminToken = await login(ADMIN_CREDS).catch(() => null);
  const fixtures = userToken ? await resolveFixtures(userToken) : { cardId: null, shareToken: null };
  let routes = buildRoutes({ userToken, adminToken, fixtures });
  if (ONLY.length) routes = routes.filter((route) => ONLY.some((needle) => route.name.includes(needle)));
  if (!routes.length) {
    console.error('没有匹配的路由');
    process.exitCode = 1;
    return;
  }

  // 3) 启动浏览器（复用同一实例依次访问）
  const browser = BROWSER_CANDIDATES.find((p) => fs.existsSync(p));
  if (!browser) {
    console.error('未找到 Edge / Chrome');
    process.exitCode = 2;
    return;
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qsl-console-'));
  const child = spawn(
    browser,
    ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--no-default-browser-check',
      '--disable-search-engine-choice-screen', '--mute-audio', '--remote-debugging-port=0',
      `--user-data-dir=${profile}`, 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const killTree = () => {
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
    try { execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' }); } catch { /* ignore */ }
  };
  const cleanup = () => {
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  };
  const hardTimeout = setTimeout(() => {
    console.error('控制台检查超时（180s）');
    killTree();
    cleanup();
    process.exit(1);
  }, 180000);
  hardTimeout.unref();

  let cdp;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    let port = 0;
    const portDeadline = Date.now() + 25000;
    while (Date.now() < portDeadline && !port) {
      if (fs.existsSync(portFile)) {
        try {
          port = parseInt(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0], 10) || 0;
        } catch {
          /* retry */
        }
      }
      if (!port) await sleep(120);
    }
    if (!port) throw new Error('等待 DevTools 端口超时');
    let target = null;
    const listDeadline = Date.now() + 10000;
    while (Date.now() < listDeadline && !target) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      } catch {
        /* retry */
      }
      if (!target) await sleep(150);
    }
    if (!target) throw new Error('未找到可调试页面');

    cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: MOBILE,
      screenWidth: WIDTH,
      screenHeight: HEIGHT,
    });
    if (MOBILE) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

    // 4) 逐路由收集控制台报错
    const results = [];
    for (const route of routes) {
      const buffer = { exceptions: [], errors: [], resourceErrors: [], logErrors: [] };
      const onConsole = (params) => {
        if (params.type === 'error') {
          buffer.errors.push(shorten(params.args.map(previewArg).join(' ')));
        }
      };
      const onException = (params) => {
        const details = params.exceptionDetails || {};
        const text = details.exception && details.exception.description
          ? details.exception.description
          : details.text || 'unknown exception';
        buffer.exceptions.push(shorten(text));
      };
      const onLog = (params) => {
        const entry = params.entry || {};
        if (entry.level !== 'error') return;
        const text = `${entry.source || ''}: ${entry.text || ''} ${entry.url ? `(${entry.url})` : ''}`;
        if (/favicon\.ico/.test(entry.url || '')) return;
        if (/Failed to load resource/.test(entry.text || '')) buffer.resourceErrors.push(shorten(text));
        else buffer.logErrors.push(shorten(text));
      };
      cdp.on('Runtime.consoleAPICalled', onConsole);
      cdp.on('Runtime.exceptionThrown', onException);
      cdp.on('Log.entryAdded', onLog);
      try {
        await cdp.send('Page.navigate', { url: BASE + route.path });
        const started = Date.now();
        let rendered = false;
        while (Date.now() - started < WAIT_BUDGET) {
          try {
            const res = await cdp.send('Runtime.evaluate', {
              expression: `(() => {
                const app = document.querySelector('#app');
                const skeletons = document.querySelectorAll('.skeleton, .loading-block, .boot-splash').length;
                const text = (document.body && document.body.innerText || '').trim().length;
                return { ready: document.readyState, app: app ? app.children.length : -1, skeletons, text };
              })()`,
              returnByValue: true,
            });
            const v = res && res.result && res.result.value;
            if (v && v.ready === 'complete' && v.skeletons === 0 && (v.app > 0 || v.app === -1) && v.text > 0) {
              rendered = true;
              break;
            }
          } catch {
            /* ignore */
          }
          await sleep(200);
        }
        await sleep(rendered ? 600 : 1200); // 留时间给异步请求/动效回调报错

        // 布局溢出检查 + 禁用词检查 + 真实图路径泄漏检查
        try {
          const probeRes = await cdp.send('Runtime.evaluate', {
            expression: `(() => {
              const doc = document.documentElement;
              const vw = window.innerWidth;
              const bodyOverflow = Math.max(0, doc.scrollWidth - vw);
              const offenders = [];
              const els = document.querySelectorAll('body *');
              for (const el of els) {
                const r = el.getBoundingClientRect();
                if (r.width <= 0 || r.right <= vw + 2) continue;
                let p = el.parentElement;
                let scrollable = false;
                while (p && p !== document.body) {
                  const s = getComputedStyle(p);
                  if (/(auto|scroll|hidden)/.test(s.overflowX)) { scrollable = true; break; }
                  p = p.parentElement;
                }
                if (scrollable) continue;
                const cn = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
                offenders.push(el.tagName.toLowerCase() + (cn ? '.' + cn : '') + ' right=' + Math.round(r.right) + ' w=' + Math.round(r.width));
                if (offenders.length >= 6) break;
              }
              const text = document.body ? document.body.innerText || '' : '';
              const forbidden = [];
              for (const term of ${JSON.stringify(FORBID)}) {
                if (!term) continue;
                const idx = text.indexOf(term);
                if (idx >= 0) forbidden.push(term + ' @ ' + text.slice(Math.max(0, idx - 30), idx + 40).replace(/\\s+/g, ' ').trim());
              }
              const realImageRe = /bg7mom-(front|back)/i;
              const imageLeaks = [];
              const pushIfLeak = (url) => {
                if (url && realImageRe.test(url) && imageLeaks.length < 6) imageLeaks.push(url);
              };
              for (const img of Array.from(document.images || [])) pushIfLeak(img.currentSrc || img.src);
              for (const el of Array.from(document.querySelectorAll('[style*="background"]'))) {
                const bg = getComputedStyle(el).backgroundImage || '';
                const match = bg.match(/url\\(["']?([^"')]+)["']?\\)/);
                if (match) pushIfLeak(match[1]);
              }
              return { vw, bodyOverflow, offenders, forbidden, imageLeaks };
            })()`,
            returnByValue: true,
          });
          buffer.layout = (probeRes && probeRes.result && probeRes.result.value) || null;
        } catch {
          buffer.layout = null;
        }
      } finally {
        const remove = (method, fn) => {
          const list = cdp.handlers.get(method);
          if (!list) return;
          const idx = list.indexOf(fn);
          if (idx >= 0) list.splice(idx, 1);
        };
        remove('Runtime.consoleAPICalled', onConsole);
        remove('Runtime.exceptionThrown', onException);
        remove('Log.entryAdded', onLog);
      }
      const layout = buffer.layout;
      const bodyOverflow = layout && layout.bodyOverflow > 1 ? layout.bodyOverflow : 0;
      const forbidden = (layout && layout.forbidden) || [];
      const imageLeaks = (layout && layout.imageLeaks) || [];
      const issueCount =
        buffer.exceptions.length +
        buffer.errors.length +
        buffer.resourceErrors.length +
        buffer.logErrors.length +
        (bodyOverflow ? 1 : 0) +
        forbidden.length +
        imageLeaks.length;
      results.push({ name: route.name, path: route.path, ...buffer, bodyOverflow, forbidden, imageLeaks, ok: issueCount === 0 });
      if (issueCount === 0) {
        console.log(`  PASS ${route.name}${layout && layout.offenders && layout.offenders.length ? `  (提示: ${layout.offenders.length} 个越界元素，均在滚动容器内)` : ''}`);
      } else {
        console.log(`  FAIL ${route.name}`);
        for (const item of buffer.exceptions) console.log(`       [uncaught] ${item}`);
        for (const item of buffer.errors) console.log(`       [console.error] ${item}`);
        for (const item of buffer.resourceErrors) console.log(`       [resource] ${item}`);
        for (const item of buffer.logErrors) console.log(`       [log.error] ${item}`);
        if (bodyOverflow) console.log(`       [layout] body 横向溢出 ${bodyOverflow}px (viewport ${layout.vw}px)`);
        for (const item of forbidden) console.log(`       [forbidden-text] ${item}`);
        for (const item of imageLeaks) console.log(`       [real-image] ${item}`);
      }
    }

    const failed = results.filter((r) => !r.ok);
    console.log('');
    if (failed.length) {
      console.log(`FAILURES (${failed.length}/${results.length}): ${failed.map((r) => r.name).join(', ')}`);
    }
    console.log(`RESULT: ${failed.length ? 'FAIL' : 'PASS'} — ${results.length - failed.length}/${results.length} 路由无控制台报错`);
    process.exitCode = failed.length ? 1 : 0;
  } catch (err) {
    console.error('检查失败:', err && err.message ? err.message : err);
    process.exitCode = 2;
  } finally {
    clearTimeout(hardTimeout);
    if (cdp) cdp.close();
    killTree();
    cleanup();
  }
}

main().catch((err) => {
  console.error('UNEXPECTED ERROR:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
