#!/usr/bin/env node
/**
 * tests/forms.mjs — 表单字段级校验的交互验证（零依赖，Node >= 18）。
 *
 * 用本机 Edge/Chrome 的 CDP 真实操作页面（填值/提交），检查：
 *   1) /register 空提交：是否出现字段级校验提示（或原生 required 拦截）
 *   2) /register 非法值（用户名过短/邮箱非法/弱密码）：字段旁是否出现错误提示
 *   3) /login 错误密码：是否出现 toast/错误提示且不跳转
 *   4) /dashboard/cards/new 空提交：是否提示缺少标题/图片
 *
 * 用法：node tests/forms.mjs [--base=http://127.0.0.1:8787]
 * 退出码：0 全部符合预期；1 有场景失败；2 服务不可用。
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(method, pathname, { token, body } = {}) {
  const init = { method, headers: {}, signal: AbortSignal.timeout(8000) };
  if (token) init.headers.authorization = `Bearer ${token}`;
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + pathname, init);
  return { status: res.status, json: await res.json().catch(() => null) };
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
      }
    });
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
      }, 20000);
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error('页面脚本异常: ' + (res.exceptionDetails.text || 'unknown'));
    return res.result ? res.result.value : undefined;
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `\n       ${detail}` : ''}`);
}

const COLLECT_ERRORS = `(() => {
  const texts = new Set();
  document.querySelectorAll('[class*="error" i], [role="alert"], .toast, .f-field-error, .field-error, .a-error, .g-error, [aria-invalid="true"]').forEach((el) => {
    const t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    if (t && t.length <= 140) texts.add(t);
  });
  const invalid = document.querySelectorAll('form :invalid, [aria-invalid="true"]').length;
  const toastRoot = document.querySelector('#toast-root');
  return { texts: Array.from(texts).slice(0, 8), invalid, toast: toastRoot ? (toastRoot.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160) : '' };
})()`;

const SET_BY_PLACEHOLDER = (placeholderPart, value) => `(() => {
  const el = Array.from(document.querySelectorAll('input, textarea')).find((i) => (i.placeholder || '').includes(${JSON.stringify(placeholderPart)}));
  if (!el) return false;
  el.focus();
  el.value = ${JSON.stringify(value)};
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

const CLICK_PRIMARY = (labels) => `(() => {
  const labels = ${JSON.stringify(labels)};
  const btn = Array.from(document.querySelectorAll('button, [role="button"]')).find((b) => {
    const t = (b.textContent || '').replace(/\\s+/g, '');
    return labels.some((l) => t.includes(l)) && !b.disabled;
  });
  if (!btn) return false;
  btn.click();
  return true;
})()`;

async function main() {
  console.log('QSLink 表单校验交互检查');
  console.log(`  base: ${BASE}`);
  const health = await fetchJson('GET', '/api/health').catch(() => ({ status: 0 }));
  if (health.status !== 200) {
    console.error('开发服务器未就绪: ' + BASE);
    process.exitCode = 2;
    return;
  }
  const login = await fetchJson('POST', '/api/auth/login', { body: { identifier: 'bg7mom', password: 'Demo@123456' } });
  const userToken = login.json && login.json.token;

  const browser = BROWSER_CANDIDATES.find((p) => fs.existsSync(p));
  if (!browser) {
    console.error('未找到 Edge / Chrome');
    process.exitCode = 2;
    return;
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qsl-forms-'));
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
    console.error('校验检查超时（150s）');
    killTree();
    cleanup();
    process.exit(1);
  }, 150000);
  hardTimeout.unref();

  let cdp;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    let port = 0;
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline && !port) {
      if (fs.existsSync(portFile)) {
        try {
          port = parseInt(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0], 10) || 0;
        } catch { /* retry */ }
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
      } catch { /* retry */ }
      if (!target) await sleep(150);
    }
    if (!target) throw new Error('未找到可调试页面');

    cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 1000 });

    const goto = async (url) => {
      await cdp.send('Page.navigate', { url: BASE + url });
      const started = Date.now();
      while (Date.now() - started < 12000) {
        try {
          const v = await cdp.evaluate(`(() => {
            const app = document.querySelector('#app');
            const skeletons = document.querySelectorAll('.skeleton, .loading-block, .boot-splash').length;
            return { ready: document.readyState, app: app ? app.children.length : -1, skeletons };
          })()`);
          if (v && v.ready === 'complete' && v.skeletons === 0 && v.app > 0) break;
        } catch { /* ignore */ }
        await sleep(200);
      }
      await sleep(500);
    };

    // ---- 场景 1：注册空提交 ----
    await goto('/register');
    const registerConsent = await cdp.evaluate(`(() => {
      const input = document.querySelector('[name="legalConsent"]');
      return !!input && !input.checked && input.required &&
        !!document.querySelector('a[href="/legal/terms.html"]') &&
        !!document.querySelector('a[href="/legal/privacy.html"]');
    })()`);
    record('register 条款确认默认未勾选且提供条款链接', registerConsent);
    await cdp.evaluate(CLICK_PRIMARY(['创建账号', '注册']));
    await sleep(900);
    const emptyRes = await cdp.evaluate(COLLECT_ERRORS);
    record(
      'register 空提交出现校验提示',
      emptyRes.texts.length > 0 || emptyRes.invalid > 0,
      `字段错误提示: ${JSON.stringify(emptyRes.texts)}; invalid 控件=${emptyRes.invalid}; toast=${JSON.stringify(emptyRes.toast)}`,
    );

    // ---- 场景 2：注册非法值 ----
    await goto('/register');
    await cdp.evaluate(SET_BY_PLACEHOLDER('3-20', 'ab'));
    await cdp.evaluate(SET_BY_PLACEHOLDER('you@example.com', 'not-an-email'));
    const pw1 = await cdp.evaluate(SET_BY_PLACEHOLDER('至少 8 位', '123'));
    const pw2 = await cdp.evaluate(SET_BY_PLACEHOLDER('再次输入密码', '123'));
    await cdp.evaluate(CLICK_PRIMARY(['创建账号', '注册']));
    await sleep(1200);
    const badRes = await cdp.evaluate(COLLECT_ERRORS);
    const badText = `${badRes.texts.join(' ')} ${badRes.toast}`;
    record(
      'register 非法值出现字段/提交错误（用户名/邮箱/密码）',
      badRes.texts.length > 0 && /用户名|邮箱|密码|格式|非法|至少|有效/.test(badText),
      `placeholder 填值=${pw1 && pw2}; 错误提示=${JSON.stringify(badRes.texts)}; invalid=${badRes.invalid}; toast=${JSON.stringify(badRes.toast)}`,
    );

    // ---- 场景 3：登录错误密码 ----
    await goto('/login');
    await cdp.evaluate(`(() => {
      for (const [name, value] of [['identifier', 'bg7mom'], ['password', 'DefinitelyWrong123!']]) {
        const input = document.querySelector('input[name="' + name + '"]');
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await cdp.evaluate(CLICK_PRIMARY(['登录']));
    await sleep(1800);
    const wrongRes = await cdp.evaluate(COLLECT_ERRORS);
    const stillLogin = await cdp.evaluate(`location.pathname`);
    const wrongText = `${wrongRes.texts.join(' ')} ${wrongRes.toast}`;
    record(
      'login 错误密码出现错误提示且不跳转',
      /密码|错误|不正确|失败/.test(wrongText) && String(stillLogin).includes('/login'),
      `当前路由=${stillLogin}; 提示=${JSON.stringify(wrongRes.texts)}; toast=${JSON.stringify(wrongRes.toast)}`,
    );

    // ---- 场景 4：新建卡片空提交（登录态） ----
    await goto(`/dashboard/cards/new?devToken=${encodeURIComponent(userToken || '')}`);
    await sleep(800);
    const contentConsent = await cdp.evaluate(`(() => {
      const input = document.querySelector('[name="contentConsent"]');
      return !!input && !input.checked;
    })()`);
    record('card-new 内容授权默认未勾选', contentConsent);
    await cdp.evaluate(CLICK_PRIMARY(['提交审核']));
    const consentRefused = await cdp.evaluate(`(() => {
      const error = document.querySelector('[data-consent-error]');
      return !!error && !error.hidden && /授权/.test(error.textContent);
    })()`);
    record('card-new 未授权时阻止提交并提示', consentRefused);
    await cdp.evaluate(`document.querySelector('[name="contentConsent"]').click()`);
    await cdp.evaluate(CLICK_PRIMARY(['提交审核']));
    await sleep(1200);
    const cardRes = await cdp.evaluate(COLLECT_ERRORS);
    const cardText = `${cardRes.texts.join(' ')} ${cardRes.toast}`;
    record(
      'card-new 空提交提示缺少标题/图片',
      /标题|图片|上传|正面|必填/.test(cardText) || cardRes.invalid > 0,
      `提示=${JSON.stringify(cardRes.texts)}; invalid=${cardRes.invalid}; toast=${JSON.stringify(cardRes.toast)}`,
    );

    const failed = results.filter((r) => !r.ok);
    console.log(`\nRESULT: ${failed.length ? 'FAIL' : 'PASS'} — ${results.length - failed.length}/${results.length} 场景通过`);
    if (failed.length) console.log(`FAILED: ${failed.map((r) => r.name).join(' | ')}`);
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
