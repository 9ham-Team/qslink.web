#!/usr/bin/env node
/**
 * QSLink 批量截图脚本（阶段二视觉验收用）— 零依赖，Node >= 18。
 *
 * 前置条件：开发服务器已启动（默认 http://127.0.0.1:8787，由 Lead 启动），
 * 且已加载种子数据（bg7mom / Demo@123456、admin / Admin@123456）。
 *
 * 用法：
 *   node tests/shots.mjs                        # 全部路由 × 桌面(1440x1000) + 手机(390x844)
 *   node tests/shots.mjs --only=home,admin      # 只截 slug 匹配的路由
 *   node tests/shots.mjs --base=http://127.0.0.1:8787
 *   node tests/shots.mjs --public-only          # 不登录（只截公开页）
 *   node tests/shots.mjs --out=qa-shots         # 输出目录（默认 qa-shots）
 *   node tests/shots.mjs --spawn                # 8787 未就绪时自起隔离实例（全新种子数据，不占 8787）
 *   node tests/shots.mjs --parallel=3           # 并行截图（每张一个浏览器进程，速度约翻倍）
 *
 * 输出：qa-shots/<slug>-desktop.png、qa-shots/<slug>-mobile.png、qa-shots/manifest.json
 * 退出码：0 全部成功；1 有截图失败；2 开发服务器未就绪 / 无法登录。
 *
 * 登录态技巧：把 ?devToken=<token> 拼到 URL 上（前端 boot 时读取后写入 localStorage 并清理 URL）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT = path.join(ROOT, 'tools', 'shot.mjs');
const ARGS = process.argv.slice(2);
const argValue = (name) => {
  const hit = ARGS.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
let BASE = (argValue('base') || process.env.QSL_SHOT_BASE || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const OUT_DIR = path.resolve(ROOT, argValue('out') || 'qa-shots');
const ONLY = (argValue('only') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const PUBLIC_ONLY = ARGS.includes('--public-only');
const BUDGET = parseInt(argValue('budget') || '8000', 10);
const SKIP = ARGS.includes('--skip-existing');
const PARALLEL = Math.max(1, parseInt(argValue('parallel') || '1', 10) || 1);
const SPAWN = ARGS.includes('--spawn'); // 8787 未就绪时，自起隔离服务实例（全新种子数据）

const spawnedServer = { child: null, dataDir: null };

const VIEWPORTS = [
  { tag: 'desktop', width: 1440, height: 1000 },
  { tag: 'mobile', width: 390, height: 844 },
];

const USER_CREDS = { identifier: 'bg7mom', password: 'Demo@123456' };
const ADMIN_CREDS = { identifier: 'admin', password: 'Admin@123456' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(method, pathname, { token, body, timeout = 8000 } = {}) {
  const init = { method, headers: {}, signal: AbortSignal.timeout(timeout) };
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

async function waitForServerAt(base, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body && body.ok) return true;
      }
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  return false;
}

async function spawnIsolated() {
  const entry = path.join(ROOT, 'server', 'server.js');
  if (!fs.existsSync(entry)) throw new Error(`找不到后端入口 ${entry}，无法使用 --spawn`);
  const port = 23000 + Math.floor(Math.random() * 24000);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qsl-shots-'));
  const child = spawn(process.execPath, [entry], {
    cwd: ROOT,
    env: { ...process.env, QSL_PORT: String(port), QSL_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let logs = '';
  const capture = (buf) => {
    logs = (logs + buf.toString()).slice(-8000);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  spawnedServer.child = child;
  spawnedServer.dataDir = dataDir;
  const base = `http://127.0.0.1:${port}`;
  if (!(await waitForServerAt(base, 25000))) {
    await cleanupSpawned();
    throw new Error(`隔离服务实例启动失败:\n${logs.slice(-1500)}`);
  }
  console.log(`  隔离实例: ${base} (data: ${dataDir})`);
  return base;
}

async function cleanupSpawned() {
  const child = spawnedServer.child;
  if (child) {
    spawnedServer.child = null;
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    await new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      const timer = setTimeout(resolve, 3000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  const dir = spawnedServer.dataDir;
  if (dir) {
    spawnedServer.dataDir = null;
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* best effort */
    }
  }
}

async function ensureServer() {
  if (await waitForServerAt(BASE, 5000)) return true;
  if (!SPAWN) {
    console.error(`开发服务器未就绪: ${BASE}`);
    console.error('请等待 Lead 启动 8787 开发服务器（npm start）后重试，或加 --spawn 使用隔离实例截图。');
    return false;
  }
  console.log('  8787 未就绪，--spawn 启动隔离服务实例...');
  BASE = await spawnIsolated();
  return true;
}

async function login(creds) {
  const res = await fetchJson('POST', '/api/auth/login', { body: creds });
  if (res.status !== 200 || !res.json || !res.json.token) {
    throw new Error(`登录 ${creds.identifier} 失败: HTTP ${res.status} ${String(res.text).slice(0, 300)}`);
  }
  return res.json;
}

function pngSize(file) {
  try {
    const buf = fs.readFileSync(file);
    if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } catch {
    return null;
  }
}

function slugFromRoute(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function resolveFixtures(userToken) {
  const fixtures = { user: USER_CREDS.identifier, cardId: null, cardTitle: null, shareToken: null, pendingCardId: null };
  try {
    const mine = await fetchJson('GET', '/api/me/cards', { token: userToken });
    const items = (mine.json && mine.json.items) || [];
    const approved = items.find((item) => item.status === 'approved') || items[0];
    if (approved) {
      fixtures.cardId = approved.id;
      fixtures.cardTitle = approved.title;
      fixtures.shareToken = approved.shareToken || null;
      fixtures.pendingCardId = (items.find((item) => item.status === 'pending') || {}).id || null;
    }
    if (!fixtures.shareToken && fixtures.cardId) {
      const share = await fetchJson('GET', `/api/cards/${fixtures.cardId}/share`, { token: userToken });
      if (share.status === 200 && share.json) fixtures.shareToken = share.json.shareToken;
    }
  } catch (err) {
    console.error(`[fixtures] 读取 /api/me/cards 失败: ${err.message}`);
  }
  if (!fixtures.cardId) {
    try {
      const res = await fetchJson('GET', '/api/cards?limit=1');
      const first = res.json && res.json.items && res.json.items[0];
      if (first) {
        fixtures.cardId = first.id;
        fixtures.cardTitle = first.title;
        fixtures.shareToken = first.shareToken || null;
        if (!fixtures.shareToken) {
          const detail = await fetchJson('GET', `/api/cards/${first.id}`);
          if (detail.json && detail.json.card) fixtures.shareToken = detail.json.card.shareToken || null;
        }
      }
    } catch (err) {
      console.error(`[fixtures] 读取 /api/cards 失败: ${err.message}`);
    }
  }
  return fixtures;
}

function buildRoutes({ userToken, adminToken, fixtures }) {
  const token = encodeURIComponent(userToken || '');
  const routes = [
    { name: 'home', url: '/' },
    { name: 'explore', url: '/explore' },
    // v3：探索页只按呼号搜索（callSign 参数），额外截一张输入 bg7 的结果
    { name: 'explore-search', url: '/explore?callSign=bg7' },
    { name: 'login', url: '/login' },
    { name: 'register', url: '/register' },
    { name: 'not-found', url: '/this-route-does-not-exist' },
  ];
  if (fixtures.cardId) routes.push({ name: 'card-detail', url: `/card/${fixtures.cardId}` });
  if (fixtures.shareToken) routes.push({ name: 'share', url: `/share/${fixtures.shareToken}` });
  if (userToken && !PUBLIC_ONLY) {
    routes.push(
      { name: 'dashboard', url: `/dashboard?devToken=${token}` },
      { name: 'my-cards', url: `/dashboard/cards?devToken=${token}` },
      { name: 'card-new', url: `/dashboard/cards/new?devToken=${token}` },
      { name: 'exchanges', url: `/dashboard/exchanges?devToken=${token}` },
      { name: 'exchanges-outgoing', url: `/dashboard/exchanges?box=outgoing&devToken=${token}` },
      { name: 'profile', url: `/dashboard/profile?devToken=${token}` },
    );
    if (fixtures.pendingCardId || fixtures.cardId) {
      routes.push({ name: 'card-edit', url: `/dashboard/cards/${fixtures.pendingCardId || fixtures.cardId}/edit?devToken=${token}` });
    }
  }
  if (adminToken && !PUBLIC_ONLY) {
    const adminTokenEnc = encodeURIComponent(adminToken);
    routes.push({ name: 'admin', url: `/admin?devToken=${adminTokenEnc}` });
    // admin.js 支持 ?tab=overview|users|cards|exchanges
    for (const tab of ['overview', 'users', 'cards', 'exchanges']) {
      routes.push({ name: `admin-${tab}`, url: `/admin?tab=${tab}&devToken=${adminTokenEnc}` });
    }
  }
  return routes;
}

function runShot(url, outFile, width, height) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SHOT, url, outFile, String(width), String(height), String(BUDGET)], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (buf) => {
      stdout += buf.toString();
    });
    child.stderr.on('data', (buf) => {
      stderr += buf.toString();
    });
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }, 150000);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout: (stdout || '').trim(), stderr: `${(stderr || '').trim()} ${String(err)}`.trim() });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0 && fs.existsSync(outFile), stdout: (stdout || '').trim(), stderr: (stderr || '').trim() });
    });
  });
}

/** 截一张图并返回 { shot, failure?, warnings? }；不直接改全局数组，便于并行。 */
async function captureOne(route, viewport, index, total) {
  const slug = slugFromRoute(route.name);
  const outFile = path.join(OUT_DIR, `${slug}-${viewport.tag}.png`);
  const label = `${slug}-${viewport.tag}`;
  const fullUrl = BASE + route.url;
  const baseShot = { slug, viewport: viewport.tag, url: fullUrl, file: outFile, width: viewport.width, height: viewport.height };
  if (SKIP && fs.existsSync(outFile)) {
    console.log(`  [${index}/${total}] SKIP ${label} — 已存在`);
    return { shot: { ...baseShot, ok: true, skipped: true } };
  }
  const started = Date.now();
  const result = await runShot(fullUrl, outFile, viewport.width, viewport.height);
  const ms = Date.now() - started;
  if (!result.ok) {
    console.log(`  [${index}/${total}] FAIL ${label} (${ms}ms) — ${result.stderr.split('\n').slice(-2).join(' ')}`);
    return {
      shot: { ...baseShot, ok: false },
      failure: { label, url: fullUrl, error: result.stderr.split('\n').slice(-6).join(' | ') || result.stdout },
    };
  }
  const bytes = fs.statSync(outFile).size;
  const size = pngSize(outFile);
  const warnings = [];
  let note = `${(bytes / 1024).toFixed(0)} KB`;
  if (size) note += ` ${size.width}x${size.height}`;
  if (bytes < 6000) {
    warnings.push(`${label}: 截图仅 ${(bytes / 1024).toFixed(1)} KB，疑似空白/错误页`);
    note += ' [WARN 疑似空白]';
  }
  if (size && (size.width !== viewport.width || size.height !== viewport.height)) {
    warnings.push(`${label}: 截图尺寸 ${size.width}x${size.height} 与请求 ${viewport.width}x${viewport.height} 不一致`);
    note += ' [WARN 尺寸不符]';
  }
  console.log(`  [${index}/${total}] OK   ${label} (${ms}ms) ${note}`);
  return { shot: { ...baseShot, bytes, png: size, ok: true }, warnings };
}

async function runMain() {
  console.log('QSLink 批量截图');
  console.log(`  base:  ${BASE}`);
  console.log(`  out:   ${OUT_DIR}`);
  console.log(`  budget: ${BUDGET}ms`);
  if (!fs.existsSync(SHOT)) {
    console.error(`缺少截图工具: ${SHOT}`);
    process.exitCode = 2;
    return;
  }
  if (!(await ensureServer())) {
    process.exitCode = 2;
    return;
  }
  console.log(`  base:  ${BASE}`);

  let userToken = null;
  let adminToken = null;
  if (!PUBLIC_ONLY) {
    try {
      const session = await login(USER_CREDS);
      userToken = session.token;
      console.log(`  登录: ${USER_CREDS.identifier} (role=${session.user && session.user.role})`);
    } catch (err) {
      console.error(`[setup] ${err.message}`);
      console.error('种子用户不可用，登录态页面无法截图；可用 --public-only 只截公开页。');
      process.exitCode = 2;
      return;
    }
    try {
      const adminSession = await login(ADMIN_CREDS);
      adminToken = adminSession.token;
      console.log(`  登录: ${ADMIN_CREDS.identifier} (role=${adminSession.user && adminSession.user.role})`);
    } catch (err) {
      console.error(`[setup] 管理员登录失败（/admin 截图将跳过）: ${err.message}`);
    }
  }

  const fixtures = await resolveFixtures(userToken);
  console.log(
    `  fixtures: card=${fixtures.cardId || '-'} (${fixtures.cardTitle || '-'}) share=${fixtures.shareToken || '-'} pending=${fixtures.pendingCardId || '-'}`,
  );

  const routes = buildRoutes({ userToken, adminToken, fixtures }).filter((route) => {
    if (!ONLY.length) return true;
    return ONLY.some((needle) => route.name.includes(needle));
  });
  if (!routes.length) {
    console.error('没有匹配的路由（检查 --only）');
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const shots = [];
  const failures = [];
  const warnings = [];
  const tasks = [];
  for (const route of routes) {
    for (const viewport of VIEWPORTS) tasks.push({ route, viewport });
  }
  const total = tasks.length;
  const captured = new Array(total);
  let nextTask = 0;
  const worker = async () => {
    for (;;) {
      const index = nextTask;
      nextTask += 1;
      if (index >= total) return;
      captured[index] = await captureOne(tasks[index].route, tasks[index].viewport, index + 1, total);
    }
  };
  const workerCount = Math.min(PARALLEL, total);
  console.log(`  并发: ${workerCount}，共 ${total} 张`);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  for (const result of captured) {
    if (!result) continue;
    shots.push(result.shot);
    if (result.failure) failures.push(result.failure);
    if (result.warnings) warnings.push(...result.warnings);
  }

  const manifest = {
    base: BASE,
    generatedAt: new Date().toISOString(),
    viewports: VIEWPORTS,
    fixtures,
    user: { identifier: USER_CREDS.identifier, token: userToken },
    admin: { identifier: ADMIN_CREDS.identifier, token: adminToken },
    shots,
    failures,
    warnings,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('');
  if (warnings.length) {
    console.log(`WARN (${warnings.length}):`);
    for (const warning of warnings) console.log(`  - ${warning}`);
  }
  if (failures.length) {
    console.log(`FAIL (${failures.length}/${shots.length}):`);
    for (const failure of failures) console.log(`  - ${failure.label}: ${failure.error}`);
  }
  const okCount = shots.filter((shot) => shot.ok).length;
  console.log(`RESULT: ${failures.length ? 'FAIL' : 'PASS'} — ${okCount}/${shots.length} screenshots, manifest: ${path.join(OUT_DIR, 'manifest.json')}`);
  process.exitCode = failures.length ? 1 : 0;
}

async function main() {
  try {
    await runMain();
  } finally {
    await cleanupSpawned();
  }
}

main().catch((err) => {
  console.error('UNEXPECTED ERROR:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
