#!/usr/bin/env node
/**
 * QSLink E2E smoke tests — zero dependencies, Node >= 18 (uses global fetch).
 *
 * The script starts its own isolated server instance:
 *   QSL_PORT=<random high port> QSL_DATA_DIR=<fresh temp dir> node server/server.js
 * waits for /api/health (max 20s), runs all checks against it, then kills the
 * process and removes the temp data dir. Every run starts from a brand-new
 * data directory, so the suite is repeatable.
 *
 * Usage:
 *   node tests/smoke.mjs                 # full run
 *   node tests/smoke.mjs --filter=admin  # only run checks whose name contains "admin" (setup still runs)
 *   node tests/smoke.mjs --keep          # keep the temp data dir for debugging
 *   node tests/smoke.mjs --verbose       # also stream server stdout/stderr
 *
 * Exit codes: 0 = all checks passed, 1 = one or more checks failed, 2 = server could not start.
 *
 * Env overrides:
 *   QSL_SMOKE_ADMIN_USER / QSL_SMOKE_ADMIN_PASS  (default: admin / Admin@123456, per docs/CONTRACT.md)
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './helpers/database.mjs';
import { withLegalConsent } from './helpers/legal.mjs';
import { testShortTokens } from './short-tokens.mjs';
import { testExchangeCardChoice } from './exchange-card-choice.mjs';
import { testCardStock } from './card-stock.mjs';
import { testAnnouncements } from './announcements.mjs';
import { testLogbook } from './logbook.mjs';
import { testExchangeContactLog } from './exchange-contact-log.mjs';

// ---------------------------------------------------------------------------
// Configuration / globals
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// QSL_SMOKE_ENTRY is a debugging aid (e.g. point the harness at a stub server).
const ENTRY = process.env.QSL_SMOKE_ENTRY
  ? path.resolve(ROOT, process.env.QSL_SMOKE_ENTRY)
  : path.join(ROOT, 'tests', 'helpers', 'mail-server.cjs');
const mailCodes = new Map();
const ARGS = process.argv.slice(2);
const FILTER = (ARGS.find((a) => a.startsWith('--filter=')) || '').slice('--filter='.length).toLowerCase();
const KEEP_DATA = ARGS.includes('--keep');
const VERBOSE = ARGS.includes('--verbose');
const START_TS = Date.now();
const RUN_ID = (Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(-9);

const ADMIN_USERNAME = process.env.QSL_SMOKE_ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.QSL_SMOKE_ADMIN_PASS || 'Admin@123456';

const COLORS = { green: '32', red: '31', yellow: '33', cyan: '36', dim: '2', bold: '1' };
const USE_COLOR = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code, text) => (USE_COLOR ? `\x1b[${code}m${text}\x1b[0m` : text);

let BASE = '';
let server = null;
let dataDir = '';
let databaseFixture;
let portUsed = 0;

const checks = [];
let setupFailureCount = 0;
const softNotes = [];
const responseLog = []; // { label, text } for the password-leak scan
const secrets = []; // plaintext passwords that must never be echoed
const users = {}; // key -> { id, username, email, password, token, user }
const cards = {}; // key -> CardPublic (as returned by POST /api/cards)
const cardTitles = {}; // key -> unique title
const exchanges = {}; // key -> ExchangeItem

// ---------------------------------------------------------------------------
// Tiny assertion framework
// ---------------------------------------------------------------------------

class CheckError extends Error {}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function snip(value, max = 700) {
  if (value === undefined || value === null) return '<empty>';
  if (typeof value !== 'string') {
    try {
      value = JSON.stringify(value);
    } catch {
      value = String(value);
    }
  }
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…(${flat.length} chars)` : flat;
}

function indent(text, pad = '           ') {
  return String(text).split('\n').join(`\n${pad}`);
}

function resInfo(res) {
  if (!res) return '';
  const where = res.method ? `${res.method} ${res.path}` : '';
  const head = [where, `HTTP ${res.status}`].filter(Boolean).join(' -> ');
  const body = res.text !== undefined ? `\n           body: ${snip(res.text)}` : '';
  return `\n           ${head}${body}`;
}

function softNote(message) {
  softNotes.push(message);
}

function assert(cond, message, res) {
  if (!cond) throw new CheckError(`${message}${resInfo(res)}`);
}

function expectTruthy(value, label, res) {
  if (!value) throw new CheckError(`${label}: 期望真值，实际 ${snip(value)}${resInfo(res)}`);
  return value;
}

function expectEqual(actual, expected, label, res) {
  if (!Object.is(actual, expected)) {
    throw new CheckError(`${label}: 期望 ${snip(expected, 120)}，实际 ${snip(actual, 120)}${resInfo(res)}`);
  }
  return actual;
}

function expectMatch(value, pattern, label, res) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new CheckError(`${label}: 字符串 ${snip(value, 120)} 不匹配 ${pattern}${resInfo(res)}`);
  }
  return value;
}

function expectArray(value, label, res) {
  if (!Array.isArray(value)) throw new CheckError(`${label}: 期望数组，实际 ${snip(value, 120)}${resInfo(res)}`);
  return value;
}

function expectObject(value, label, res) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CheckError(`${label}: 期望对象，实际 ${snip(value, 120)}${resInfo(res)}`);
  }
  return value;
}

function expectNumber(value, label, res) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CheckError(`${label}: 期望数字，实际 ${snip(value, 120)}${resInfo(res)}`);
  }
  return value;
}

function expectString(value, label, res) {
  if (typeof value !== 'string') throw new CheckError(`${label}: 期望字符串，实际 ${snip(value, 120)}${resInfo(res)}`);
  return value;
}

function expectStatus(res, expected, label) {
  if (!res || res.status !== expected) {
    throw new CheckError(`${label}: 期望 HTTP ${expected}，实际 ${res ? res.status : '<无响应>'}${resInfo(res)}`);
  }
  return res;
}

/** status + JSON error envelope ({ error: { message, code, fields } }). */
function expectError(res, expectedStatus, expectedCode, label) {
  expectStatus(res, expectedStatus, label);
  const envelope = res.json && res.json.error;
  if (!expectObject(envelope, `${label}: 响应缺少 error 对象`, res)) return;
  if (expectedCode && envelope.code !== expectedCode) {
    throw new CheckError(`${label}: 期望 error.code=${expectedCode}，实际 ${snip(envelope.code)}${resInfo(res)}`);
  }
  if (!envelope.message) softNote(`${label}: 错误响应缺少 error.message`);
  return envelope;
}

/** status hard-check, error code only soft-noted (for 401/403/404 where doc wording is generic). */
function expectStatusSoftCode(res, expectedStatus, expectedCode, label) {
  expectStatus(res, expectedStatus, label);
  const code = res.json && res.json.error && res.json.error.code;
  if (expectedCode && code !== expectedCode) softNote(`${label}: error.code=${snip(code)}（期望 ${expectedCode}）`);
  if (!res.json || !res.json.error || !res.json.error.message) softNote(`${label}: 错误响应缺少 error.message`);
  return res;
}

/** Paginated envelope: { items, total, page, limit, pages }. */
function expectPaginated(res, label, expectedStatus = 200) {
  expectStatus(res, expectedStatus, label);
  const body = expectObject(res.json, `${label}: 响应不是 JSON 对象`, res);
  expectArray(body.items, `${label}.items`, res);
  expectNumber(body.total, `${label}.total`, res);
  expectNumber(body.page, `${label}.page`, res);
  expectNumber(body.limit, `${label}.limit`, res);
  expectNumber(body.pages, `${label}.pages`, res);
  return body;
}

function findById(items, id) {
  return (items || []).find((item) => item && item.id === id);
}

// ---------------------------------------------------------------------------
// Test / setup / phase bookkeeping
// ---------------------------------------------------------------------------

function phase(title) {
  const line = `── ${title} `;
  console.log(`\n${paint('36', line + '─'.repeat(Math.max(4, 74 - line.length)))}`);
}

async function test(name, fn) {
  if (FILTER && !name.toLowerCase().includes(FILTER)) return;
  const started = Date.now();
  try {
    await fn();
    const ms = Date.now() - started;
    checks.push({ name, ok: true, ms });
    console.log(`  ${paint('32', 'PASS')} ${name} ${paint('2', `(${ms}ms)`)}`);
  } catch (err) {
    const ms = Date.now() - started;
    const error = err instanceof CheckError ? err : new CheckError(`未捕获异常: ${err && err.stack ? err.stack : err}`);
    checks.push({ name, ok: false, ms, error });
    console.log(`  ${paint('31', 'FAIL')} ${name} ${paint('2', `(${ms}ms)`)}`);
    console.log(indent(error.message, '       '));
  }
}

/** Runs always (also under --filter) and does not count as a check. */
async function setup(name, fn) {
  try {
    await fn();
    console.log(`  ${paint('2', `SETUP ok: ${name}`)}`);
  } catch (err) {
    setupFailureCount += 1;
    const message = err instanceof CheckError ? err.message : String(err && err.stack ? err.stack : err);
    console.log(`  ${paint('33', `SETUP-FAIL: ${name}`)} ${message.split('\n')[0]}`);
    softNotes.push(`setup 失败: ${name} — ${message.split('\n')[0]}`);
  }
}

function needUser(key) {
  const u = users[key];
  if (!u) throw new CheckError(`前置条件缺失: 用户 "${key}" 未就绪（注册/setup 失败）`);
  return u;
}

function needCard(key) {
  const card = cards[key];
  if (!card) throw new CheckError(`前置条件缺失: 卡片 "${key}" 未创建`);
  return card;
}

function needExchange(key) {
  const exchange = exchanges[key];
  if (!exchange) throw new CheckError(`前置条件缺失: 换卡申请 "${key}" 未创建`);
  return exchange;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function api(method, pathname, opts = {}) {
  const { token, body, rawBody, headers = {}, redirect = 'follow', timeout = 20000 } = opts;
  const init = { method, redirect, headers: { ...headers }, signal: AbortSignal.timeout(timeout) };
  if (token) init.headers.authorization = `Bearer ${token}`;
  if (rawBody !== undefined) {
    init.body = rawBody;
  } else if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(withLegalConsent(method, pathname, body));
  }
  const started = Date.now();
  let response;
  try {
    response = await fetch(BASE + pathname, init);
  } catch (err) {
    const cause = err && err.cause ? ` (${err.cause.code || err.cause.message})` : '';
    throw new CheckError(`请求失败 ${method} ${pathname}: ${err && err.message}${cause}`);
  }
  const text = await response.text();
  const res = {
    method,
    path: pathname,
    status: response.status,
    headers: response.headers,
    text,
    json: undefined,
    ms: Date.now() - started,
  };
  if (text) {
    try {
      res.json = JSON.parse(text);
    } catch {
      /* not JSON (html/static) */
    }
  }
  responseLog.push({ label: `${method} ${pathname}`, text: snip(text, 20000) });
  return res;
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

function safeRm(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* best effort */
  }
}

function waitForExit(child, ms) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve(true);
    const timer = setTimeout(() => resolve(false), ms);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function startServer() {
  if (!fs.existsSync(ENTRY)) {
    throw new Error(`找不到后端入口 ${path.relative(ROOT, ENTRY)}。后端尚未交付（等待 backend-dev）。`);
  }
  const attempts = [];
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const port = 22000 + Math.floor(Math.random() * 25000);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qsl-smoke-'));
    databaseFixture = await fixture();
    let logs = '';
    const child = spawn(process.execPath, [ENTRY], {
      cwd: ROOT,
      env: { ...process.env, QSL_PORT: String(port), QSL_DATA_DIR: dir, NODE_ENV: 'test', QSL_SEED_DEMO: 'true', QSL_PUBLIC_ORIGIN: '',
        DATABASE_URL: databaseFixture.databaseUrl, QSL_DB_SCHEMA: databaseFixture.databaseSchema },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    });
    child.on('message', ({ email, code, kind }) => { if (!kind) mailCodes.set(email, code); });
    let exitInfo = null;
    child.once('exit', (code, signal) => {
      exitInfo = { code, signal };
    });
    const onData = (buf) => {
      logs = (logs + buf.toString()).slice(-30000);
      if (VERBOSE) process.stdout.write(`[server] ${buf.toString()}`);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    const base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 20000;
    let ready = false;
    while (Date.now() < deadline) {
      if (exitInfo) break;
      try {
        const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) });
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {
        /* not up yet */
      }
      await sleep(150);
    }

    if (ready) {
      BASE = base;
      server = child;
      dataDir = dir;
      portUsed = port;
      return;
    }

    try {
      child.kill();
    } catch {
      /* ignore */
    }
    await waitForExit(child, 3000);
    if (!KEEP_DATA) safeRm(dir);
    await databaseFixture.cleanup();
    databaseFixture = null;
    attempts.push(`attempt #${attempt} port=${port} exit=${JSON.stringify(exitInfo)}\n${indent(snip(logs, 4000))}`);
    const portConflict = /EADDRINUSE/i.test(logs);
    if (!portConflict) break; // deterministic startup failure — retrying won't help
  }
  throw new Error(`隔离服务实例启动失败（20s 内 /api/health 未就绪）:\n\n${attempts.join('\n\n')}`);
}

async function stopServer() {
  const child = server;
  server = null;
  if (child) {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    if (!(await waitForExit(child, 3000))) {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      await waitForExit(child, 2000);
    }
    await sleep(100);
  }
  if (databaseFixture) { await databaseFixture.cleanup(); databaseFixture = null; }
  if (!dataDir) return;
  if (KEEP_DATA) {
    console.log(`\n[keep] 临时数据目录: ${dataDir}`);
    return;
  }
  try {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (err) {
    console.log(`\n[cleanup] 临时目录删除失败（可忽略）: ${err.message}`);
    console.log(`[cleanup] 残留路径: ${dataDir}`);
  }
}

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

function svgDataUrl(label, width = 300, height = 200, color = '#0eaf8f') {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="${color}"/>` +
    `<text x="16" y="${Math.round(height / 2)}" font-size="24" fill="#ffffff" font-family="sans-serif">${label}</text>` +
    '</svg>';
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

const addressFor = (name) => ({
  name,
  phone: '13800001111',
  line1: 'QA 测试路 1 号 5 单元 602',
  city: '北京市',
  province: '北京市',
  postalCode: '100080',
  country: '中国',
});

async function login(identifier, password) {
  return api('POST', '/api/auth/login', { body: { identifier, password } });
}

async function emailCode(email) {
  const sent = await api('POST', '/api/auth/email-code', { body: { email } });
  expectStatus(sent, 200, 'send email code');
  for (let i = 0; i < 100 && !mailCodes.has(email); i++) await sleep(10);
  return mailCodes.get(email);
}

async function registerUser(key, payload) {
  const body = {
    username: payload.username,
    email: payload.email,
    password: payload.password,
  };
  if (payload.displayName !== undefined) body.displayName = payload.displayName;
  if (payload.callSign !== undefined) body.callSign = payload.callSign;
  secrets.push(payload.password);
  body.emailCode = await emailCode(body.email);
  const res = await api('POST', '/api/auth/register', { body });
  if (res.status !== 201) {
    throw new CheckError(`注册用户 ${key} 失败: 期望 201，实际 ${res.status}${resInfo(res)}`);
  }
  const u = {
    id: res.json.user.id,
    username: body.username,
    email: body.email,
    password: body.password,
    token: res.json.token,
    user: res.json.user,
    res,
  };
  users[key] = u;
  return u;
}

async function createCard(key, opts = {}) {
  const owner = needUser('owner');
  const title = opts.title || `QA Smoke ${key} ${RUN_ID}`;
  const body = {
    title,
    notes: opts.notes !== undefined ? opts.notes : `QA smoke test card ${key}`,
    ratio: opts.ratio || { w: 3, h: 2 },
    frontImage: opts.frontImage !== undefined ? opts.frontImage : svgDataUrl(`${key} FRONT`),
    backImage: opts.backImage !== undefined ? opts.backImage : svgDataUrl(`${key} BACK`, 300, 200, '#38bdf8'),
  };
  // v3: callSign/band/mode 均为可选字段
  if (!opts.omitCallSign) body.callSign = opts.callSign !== undefined ? opts.callSign : 'QA0OWN';
  if (opts.includeBandMode) {
    body.band = opts.band || '20m';
    body.mode = opts.mode || 'SSB';
  }
  const res = await api('POST', '/api/cards', { token: opts.token || owner.token, body });
  if (res.status !== 201) throw new CheckError(`创建卡片 ${key} 失败: 期望 201，实际 ${res.status}${resInfo(res)}`);
  cards[key] = res.json.card;
  cardTitles[key] = title;
  return res;
}

function exchangePayload(tag, overrides = {}) {
  return {
    message: `QA exchange ${tag}`,
    contactName: 'QA 收件人',
    address: addressFor(`QA ${tag}`),
    ...overrides,
  };
}

async function applyExchange(userKey, cardKey, tag) {
  const user = needUser(userKey);
  const card = needCard(cardKey);
  const res = await api('POST', `/api/cards/${card.id}/exchanges`, {
    token: user.token,
    body: exchangePayload(tag),
  });
  if (res.status !== 201) throw new CheckError(`创建换卡申请 ${tag} 失败: 期望 201，实际 ${res.status}${resInfo(res)}`);
  exchanges[tag] = res.json.exchange;
  return res;
}

// ---------------------------------------------------------------------------
// Phase: health, static files & SPA history fallback
// ---------------------------------------------------------------------------

async function phaseStatic() {
  phase('Health / static assets / SPA fallback');

  await test('health: GET /api/health -> 200 { ok:true, name:"QSLink" }', async () => {
    const res = await api('GET', '/api/health');
    expectStatus(res, 200, 'GET /api/health');
    expectEqual(res.json && res.json.ok, true, 'health.ok', res);
    expectEqual(res.json && res.json.name, 'QSLink', 'health.name', res);
    if (typeof res.json.version !== 'string') softNote('health: 缺少 version 字段');
    if (typeof res.json.uptime !== 'number') softNote('health: 缺少数值 uptime 字段');
  });

  await test('static: GET / -> 200 HTML containing the #app mount point', async () => {
    const res = await api('GET', '/', { redirect: 'manual' });
    expectStatus(res, 200, 'GET /');
    const contentType = res.headers.get('content-type') || '';
    expectMatch(contentType, /text\/html/i, 'GET / content-type', res);
    // index.html may use <div id="app"> or <main id="app">; the contract only fixes the id.
    assert(/<(?:div|main)[^>]*\bid=["']app["']/.test(res.text), 'index.html 中缺少 id="app" 挂载点', res);
  });

  await test('static: GET /index.html -> 200 HTML', async () => {
    const res = await api('GET', '/index.html', { redirect: 'manual' });
    expectStatus(res, 200, 'GET /index.html');
    assert(/id=["']app["']/.test(res.text), 'index.html 缺少 id="app"', res);
  });

  await test('spa: GET /share/:token falls back to index.html (200 HTML)', async () => {
    const res = await api('GET', '/share/xxxQAxxx', { redirect: 'manual' });
    expectStatus(res, 200, 'GET /share/xxxQAxxx');
    assert(/id=["']app["']/.test(res.text), '/share/:token 未回退到 index.html', res);
  });

  await test('spa: GET /dashboard falls back to index.html (200 HTML)', async () => {
    const res = await api('GET', '/dashboard', { redirect: 'manual' });
    expectStatus(res, 200, 'GET /dashboard');
    assert(/id=["']app["']/.test(res.text), '/dashboard 未回退到 index.html', res);
  });

  await test('spa: /card/:id, /dashboard/cards/new, /admin, /login also fall back to index.html', async () => {
    for (const pathname of ['/card/c_xxx', '/dashboard/cards/new', '/admin', '/login', '/register', '/explore', '/dashboard/profile']) {
      const res = await api('GET', pathname, { redirect: 'manual' });
      expectStatus(res, 200, `GET ${pathname}`);
      assert(/id=["']app["']/.test(res.text), `${pathname} 未回退到 index.html`, res);
    }
  });

  await test('static: unknown file with an extension -> 404', async () => {
    const res = await api('GET', '/nope-does-not-exist.js', { redirect: 'manual' });
    expectStatus(res, 404, 'GET /nope-does-not-exist.js');
  });
}

// ---------------------------------------------------------------------------
// Phase: seed data v3 (10 public / 13 total; real BG7MOM image never public)
// ---------------------------------------------------------------------------

const REAL_IMAGE_RE = /bg7mom-(front|back)/i;

function imageUrls(card) {
  return [card && card.frontImage, card && card.backImage].filter((url) => typeof url === 'string');
}

async function phaseSeedData() {
  phase('Seed data v3: 10 public / 13 total / privacy / band-mode removed');

  await test('seed: GET /api/cards -> exactly 10 public cards', async () => {
    const res = await api('GET', '/api/cards?limit=48');
    const body = expectPaginated(res, 'GET /api/cards');
    expectEqual(body.total, 10, '公共卡片 total（v3 种子）', res);
    expectEqual(body.items.length, 10, '公共卡片 items.length（v3 种子）', res);
    assert(body.items.every((item) => item.status === 'approved'), '公共列表包含非 approved 卡片', res);
  });

  await test('seed: admin/cards -> exactly 13 cards in total', async () => {
    const admin = needUser('admin');
    const res = await api('GET', '/api/admin/cards?limit=48', { token: admin.token });
    const body = expectPaginated(res, 'GET /api/admin/cards');
    expectEqual(body.total, 13, '全部卡片 total（v3 种子）', res);
  });

  await test('privacy: public list never exposes BG7MOM real-image paths', async () => {
    const res = await api('GET', '/api/cards?limit=48');
    const body = expectPaginated(res, 'GET /api/cards');
    const leaks = [];
    for (const card of body.items) {
      for (const url of imageUrls(card)) {
        if (REAL_IMAGE_RE.test(url)) leaks.push(`${card.id}: ${url}`);
      }
    }
    expectEqual(leaks.length, 0, `公共列表出现 BG7MOM 真实图路径: ${leaks.join('; ')}`, res);
  });

  await test('privacy: every public detail + share-token endpoint has no real-image path', async () => {
    const list = await api('GET', '/api/cards?limit=48');
    const body = expectPaginated(list, 'GET /api/cards');
    const leaks = [];
    for (const item of body.items) {
      const detail = await api('GET', `/api/cards/${item.id}`);
      expectStatus(detail, 200, `GET /api/cards/${item.id} (anonymous)`);
      const card = detail.json && detail.json.card;
      for (const url of imageUrls(card)) if (REAL_IMAGE_RE.test(url)) leaks.push(`detail ${item.id}: ${url}`);
      const token = card && card.shareToken;
      expectString(token, `card ${item.id} shareToken`, detail);
      const pub = await api('GET', `/api/public/cards/${token}`);
      expectStatus(pub, 200, `GET /api/public/cards/<token> (${item.id})`);
      for (const url of imageUrls(pub.json && pub.json.card)) {
        if (REAL_IMAGE_RE.test(url)) leaks.push(`public ${item.id}: ${url}`);
      }
    }
    expectEqual(leaks.length, 0, `公开详情/分享接口出现真实图路径: ${leaks.join('; ')}`, list);
  });

  await test('seed: public cards carry empty band/mode (feature removed)', async () => {
    const res = await api('GET', '/api/cards?limit=48');
    const body = expectPaginated(res, 'GET /api/cards');
    const bad = body.items.filter((item) => item.band !== '' || item.mode !== '');
    expectEqual(
      bad.length,
      0,
      `公共种子卡 band/mode 应为空字符串，实际非空: ${bad.slice(0, 3).map((c) => `${c.id}(band=${snip(c.band)},mode=${snip(c.mode)})`).join('; ')}`,
      res,
    );
  });

  await test('seed: card faces do not print empty MODE/BAND fields (v3.1)', async () => {
    const admin = needUser('admin');
    const list = await api('GET', '/api/admin/cards?limit=48', { token: admin.token });
    const body = expectPaginated(list, 'GET /api/admin/cards');
    const pattern = /MODE\s*(—|–|-)|BAND\s*(—|–|-)|>(MODE|BAND)</;
    const bad = [];
    let scanned = 0;
    for (const item of body.items) {
      for (const url of imageUrls(item)) {
        const res = await api('GET', url);
        expectStatus(res, 200, `GET ${url}`);
        scanned += 1;
        if (pattern.test(res.text)) bad.push(url);
      }
    }
    assert(scanned >= 26, `应扫描 13 张卡的正反面图（≥26 张），实际 ${scanned}`, list);
    expectEqual(bad.length, 0, `卡面 SVG 仍含 MODE/BAND 空字段: ${bad.slice(0, 5).join(', ')}`, list);
  });

  await test('seed: callSign search works against seed data (BG7MOM)', async () => {
    const res = await api('GET', '/api/cards?callSign=BG7MOM&limit=48');
    const body = expectPaginated(res, 'GET /api/cards?callSign=BG7MOM');
    for (const item of body.items) {
      const cardSign = String(item.callSign || '').toUpperCase();
      const ownerSign = String((item.owner && item.owner.callSign) || '').toUpperCase();
      assert(cardSign.includes('BG7MOM') || ownerSign.includes('BG7MOM'), `callSign=BG7MOM 返回了不相关卡片 ${item.id}`, res);
    }
    if (!body.items.length) softNote('callSign=BG7MOM 在 v3 种子中未命中任何公共卡片（若种子无公开 BG7MOM 卡则正常）');
  });
}

// ---------------------------------------------------------------------------
// Phase: registration
// ---------------------------------------------------------------------------

async function phaseRegister() {
  phase('Auth: registration');

  await test('auth/register: success -> 201 { token, user:UserSelf } without password', async () => {
    const ownerPayload = {
      username: `qa_owner_${RUN_ID}`,
      email: `qa_owner_${RUN_ID}@qalink.test`,
      password: 'QaOwner123!',
      displayName: 'QA Owner',
      callSign: 'QA0OWN',
    };
    const { res } = await (async () => {
      secrets.push(ownerPayload.password);
      ownerPayload.emailCode = await emailCode(ownerPayload.email);
      const r = await api('POST', '/api/auth/register', { body: ownerPayload });
      if (r.status !== 201) throw new CheckError(`owner 注册失败: 期望 201，实际 ${r.status}${resInfo(r)}`);
      users.owner = {
        id: r.json.user.id,
        username: ownerPayload.username,
        email: ownerPayload.email,
        password: ownerPayload.password,
        token: r.json.token,
        user: r.json.user,
      };
      return { res: r };
    })();
    expectStatus(res, 201, 'POST /api/auth/register');
    expectString(res.json && res.json.token, 'register.token', res);
    const user = expectObject(res.json && res.json.user, 'register.user', res);
    expectEqual(user.username, ownerPayload.username, 'register.user.username', res);
    expectEqual(user.email, ownerPayload.email, 'register.user.email', res);
    expectEqual(user.role, 'user', 'register.user.role', res);
    expectEqual(user.status, 'active', 'register.user.status', res);
    expectString(user.displayName, 'register.user.displayName', res);
    expectString(user.joinedAt, 'register.user.joinedAt', res);
    assert(!Object.prototype.hasOwnProperty.call(user, 'password'), 'user 对象不应包含 password 字段', res);
    assert(!res.text.includes(ownerPayload.password), '注册响应体泄露了明文密码', res);
  });

  await test('auth/register: displayName defaults to username, callSign defaults to ""', async () => {
    const u2 = needUser('u2');
    expectEqual(u2.user.displayName, u2.username, 'displayName 默认值');
    expectEqual(u2.user.callSign, '', 'callSign 默认值');
  });

  await test('auth/register: duplicate username -> 409 USERNAME_TAKEN', async () => {
    const owner = needUser('owner');
    const res = await api('POST', '/api/auth/register', {
      body: { username: owner.username, email: `qa_dup_u_${RUN_ID}@qalink.test`, password: 'QaPass123!' },
    });
    expectError(res, 409, 'USERNAME_TAKEN', 'duplicate username');
  });

  await test('auth/register: duplicate email -> 409 EMAIL_TAKEN', async () => {
    const owner = needUser('owner');
    const res = await api('POST', '/api/auth/register', {
      body: { username: `qa_dup_e_${RUN_ID}`.slice(0, 20), email: owner.email, password: 'QaPass123!' },
    });
    expectError(res, 409, 'EMAIL_TAKEN', 'duplicate email');
  });

  await test('auth/register: weak passwords -> 400 VALIDATION', async () => {
    const variants = [
      ['too short', 'Ab1'],
      ['no digit', 'abcdefghij'],
      ['no letter', '12345678'],
    ];
    for (let i = 0; i < variants.length; i += 1) {
      const [label, password] = variants[i];
      const res = await api('POST', '/api/auth/register', {
        body: {
          username: `qa_weak${i}_${RUN_ID.slice(-6)}`,
          email: `qa_weak${i}_${RUN_ID.slice(-6)}@qalink.test`,
          password,
        },
      });
      expectError(res, 400, 'VALIDATION', `weak password (${label})`);
      if (!res.json.error.fields || !('password' in res.json.error.fields)) {
        softNote(`weak password (${label}): 400 响应未在 error.fields 标注 password`);
      }
    }
  });

  await test('auth/register: missing required fields -> 400 VALIDATION', async () => {
    const res = await api('POST', '/api/auth/register', {
      body: { username: `qa_missing_${RUN_ID.slice(-6)}`, email: `qa_missing_${RUN_ID.slice(-6)}@qalink.test` },
    });
    expectError(res, 400, 'VALIDATION', 'missing password field');
    if (!res.json.error.fields || !('password' in res.json.error.fields)) {
      softNote('missing password: 400 响应未在 error.fields 标注 password');
    }
  });

  await test('auth/register: invalid username/email formats -> 400 VALIDATION', async () => {
    const badUsername = await api('POST', '/api/auth/register', {
      body: { username: 'a', email: `qa_badname_${RUN_ID.slice(-6)}@qalink.test`, password: 'QaPass123!' },
    });
    expectError(badUsername, 400, 'VALIDATION', 'username too short');
    const badEmail = await api('POST', '/api/auth/register', {
      body: { username: `qa_bademail_${RUN_ID.slice(-6)}`, email: 'not-an-email', password: 'QaPass123!' },
    });
    expectError(badEmail, 400, 'VALIDATION', 'invalid email');
  });
}

// ---------------------------------------------------------------------------
// Phase: login / session
// ---------------------------------------------------------------------------

async function phaseLogin() {
  phase('Auth: login / me / logout');

  await test('auth/login: correct credentials -> 200 { token, user }', async () => {
    const owner = needUser('owner');
    const res = await login(owner.username, owner.password);
    expectStatus(res, 200, 'POST /api/auth/login');
    expectString(res.json && res.json.token, 'login.token', res);
    expectEqual(res.json.user.username, owner.username, 'login.user.username', res);
    assert(!res.text.includes(owner.password), '登录响应体泄露了明文密码', res);
  });

  await test('auth/login: identifier is case-insensitive (username & email)', async () => {
    const owner = needUser('owner');
    const byUsername = await login(owner.username.toUpperCase(), owner.password);
    expectStatus(byUsername, 200, 'login with UPPERCASE username');
    const byEmail = await login(owner.email.toUpperCase(), owner.password);
    expectStatus(byEmail, 200, 'login with UPPERCASE email');
  });

  await test('auth/login: wrong password -> 401 INVALID_CREDENTIALS', async () => {
    const owner = needUser('owner');
    const res = await login(owner.username, 'WrongPass123!');
    expectError(res, 401, 'INVALID_CREDENTIALS', 'login wrong password');
  });

  await test('auth/login: unknown user -> 401 INVALID_CREDENTIALS', async () => {
    const res = await login(`qa_ghost_${RUN_ID}`, 'SomePass123!');
    expectError(res, 401, 'INVALID_CREDENTIALS', 'login unknown user');
  });

  await test('auth/me: valid token -> 200 { user:UserSelf }', async () => {
    const owner = needUser('owner');
    const res = await api('GET', '/api/auth/me', { token: owner.token });
    expectStatus(res, 200, 'GET /api/auth/me');
    expectEqual(res.json.user.id, owner.id, 'me.user.id', res);
    expectEqual(res.json.user.username, owner.username, 'me.user.username', res);
    expectEqual(res.json.user.email, owner.email, 'me.user.email', res);
    assert(!res.text.includes(owner.password), 'me 响应体泄露了明文密码', res);
  });

  await test('auth/me: invalid token -> 401', async () => {
    const res = await api('GET', '/api/auth/me', { token: 'qa.invalid.token' });
    expectStatusSoftCode(res, 401, 'UNAUTHORIZED', 'me with garbage token');
  });

  await test('auth/me: missing Authorization header -> 401', async () => {
    const res = await api('GET', '/api/auth/me');
    expectStatusSoftCode(res, 401, 'UNAUTHORIZED', 'me without token');
  });

  await test('auth/logout: token is invalid afterwards (me -> 401)', async () => {
    const owner = needUser('owner');
    const fresh = await login(owner.username, owner.password);
    expectStatus(fresh, 200, 'fresh login before logout');
    const token = fresh.json.token;
    const out = await api('POST', '/api/auth/logout', { token });
    expectStatus(out, 200, 'POST /api/auth/logout');
    expectEqual(out.json && out.json.ok, true, 'logout.ok', out);
    const me = await api('GET', '/api/auth/me', { token });
    expectStatusSoftCode(me, 401, 'UNAUTHORIZED', 'me after logout');
    // Contract: logout deletes only the current token; other sessions stay valid.
    const meOwner = await api('GET', '/api/auth/me', { token: owner.token });
    if (meOwner.status !== 200) softNote('logout 后注册时的 token 也失效了（契约只要求删除当前 token）');
  });

  // Must run before the exchange phases: approved exchanges expose the card owner's
  // profile address as `toAddress`, so the owner needs an address on file.
  await test('me: PUT /api/me/profile sets address (needed so approved exchanges expose toAddress)', async () => {
    const owner = needUser('owner');
    const res = await api('PUT', '/api/me/profile', { token: owner.token, body: { address: addressFor('QA Owner') } });
    expectStatus(res, 200, 'PUT /api/me/profile {address}');
    const address = expectObject(res.json.user.address, 'profile.user.address', res);
    expectEqual(address.name, 'QA Owner', 'profile address.name', res);
    expectEqual(address.line1, 'QA 测试路 1 号 5 单元 602', 'profile address.line1', res);
  });
}

// ---------------------------------------------------------------------------
// Phase: cards (create / validation / visibility)
// ---------------------------------------------------------------------------

async function phaseCards() {
  phase('Cards: create / validation / visibility');

  await test('cards: POST /api/cards without auth -> 401', async () => {
    const res = await api('POST', '/api/cards', {
      body: {
        title: 'unauth card',
        band: '20m',
        mode: 'SSB',
        ratio: { w: 3, h: 2 },
        frontImage: svgDataUrl('x'),
        backImage: svgDataUrl('y'),
      },
    });
    expectStatusSoftCode(res, 401, 'UNAUTHORIZED', 'create card without token');
  });

  await test('cards: create with dataURL SVG -> 201, status=pending, shareToken, /uploads/ image', async () => {
    const res = await createCard('card1');
    const card = res.json.card;
    expectString(card.id, 'card.id', res);
    expectEqual(card.status, 'pending', 'new card status', res);
    expectString(card.shareToken, 'new card shareToken', res);
    expectMatch(card.frontImage, /^\/uploads\//, 'new card frontImage', res);
    expectMatch(card.backImage, /^\/uploads\//, 'new card backImage', res);
    expectEqual(card.ratio.w, 3, 'new card ratio.w', res);
    expectEqual(card.ratio.h, 2, 'new card ratio.h', res);
    expectEqual(card.likeCount, 0, 'new card likeCount', res);
    expectEqual(card.title, cardTitles.card1, 'new card title', res);
    expectString(card.createdAt, 'new card createdAt', res);
    expectObject(card.owner, 'new card owner', res);
    expectEqual(card.owner.username, needUser('owner').username, 'new card owner.username', res);
  });

  await test('cards: create with dataURL SVG -> 201, status=pending, shareToken, /uploads/ image', async () => {
    // v2 兼容：仍可传 band/mode；callSign 用与 owner 不同的值，便于后续区分 callSign 搜索来源
    const res = await createCard('card1', { includeBandMode: true, callSign: 'QA0C1' });
    const card = res.json.card;
    expectString(card.id, 'card.id', res);
    expectEqual(card.status, 'pending', 'new card status', res);
    expectString(card.shareToken, 'new card shareToken', res);
    expectMatch(card.frontImage, /^\/uploads\//, 'new card frontImage', res);
    expectMatch(card.backImage, /^\/uploads\//, 'new card backImage', res);
    expectEqual(card.ratio.w, 3, 'new card ratio.w', res);
    expectEqual(card.ratio.h, 2, 'new card ratio.h', res);
    expectEqual(card.likeCount, 0, 'new card likeCount', res);
    expectEqual(card.title, cardTitles.card1, 'new card title', res);
    expectEqual(card.callSign, 'QA0C1', 'new card callSign', res);
    expectString(card.createdAt, 'new card createdAt', res);
    expectObject(card.owner, 'new card owner', res);
    expectEqual(card.owner.username, needUser('owner').username, 'new card owner.username', res);
    // v3：band/mode 已从产品中移除，但后端仍兼容旧客户端传值（传了应原样返回/至少不报错）
    if (card.band !== '20m' || card.mode !== 'SSB') {
      softNote(`传 band/mode 的建卡响应为 band=${snip(card.band)} mode=${snip(card.mode)}（兼容语义，不强制回显）`);
    }
  });

  await test('cards: create without band/mode -> 201 and band/mode are empty strings', async () => {
    const res = await createCard('card2', { callSign: 'QA0C2' });
    const card = res.json.card;
    expectEqual(card.status, 'pending', 'card2.status', res);
    expectEqual(card.band, '', 'card2.band（未传时应为 ""）', res);
    expectEqual(card.mode, '', 'card2.mode（未传时应为 ""）', res);
    expectEqual(card.callSign, 'QA0C2', 'card2.callSign', res);
  });

  await test('cards: create without callSign/band/mode (all optional) -> 201', async () => {
    const res = await createCard('card4', { omitCallSign: true });
    const card = res.json.card;
    expectEqual(card.status, 'pending', 'card4.status', res);
    expectEqual(card.band, '', 'card4.band（未传时应为 ""）', res);
    expectEqual(card.mode, '', 'card4.mode（未传时应为 ""）', res);
    // callSign 默认值契约未规定：可能为 "" 或继承 owner.callSign，二者都接受
    expectString(card.callSign, 'card4.callSign（应为字符串）', res);
    if (card.callSign && card.callSign !== needUser('owner').user.callSign) {
      softNote(`未传 callSign 时后端默认值为 ${snip(card.callSign)}（owner.callSign=${snip(needUser('owner').user.callSign)}）`);
    }
    expectEqual(card.owner.username, needUser('owner').username, 'card4.owner.username', res);
  });

  await test('cards: create additional pending card (card3) without band/mode', async () => {
    const res = await createCard('card3');
    expectEqual(res.json.card.status, 'pending', 'card3.status', res);
    if (res.json.card.band !== '') softNote(`card3.band=${snip(res.json.card.band)}（未传 band 时预期 ""）`);
  });

  await test('cards: invalid ratio -> 400 VALIDATION', async () => {
    const owner = needUser('owner');
    for (const ratio of [{ w: 0, h: 2 }, { w: 1001, h: 2 }, { w: 3.5, h: 2 }]) {
      const res = await api('POST', '/api/cards', {
        token: owner.token,
        body: {
          title: `QA invalid ratio ${RUN_ID}`,
          callSign: 'QA0OWN',
          band: '20m',
          mode: 'SSB',
          ratio,
          frontImage: svgDataUrl('front'),
          backImage: svgDataUrl('back'),
        },
      });
      expectError(res, 400, 'VALIDATION', `invalid ratio ${JSON.stringify(ratio)}`);
    }
  });

  await test('cards: missing frontImage -> 400', async () => {
    const owner = needUser('owner');
    const res = await api('POST', '/api/cards', {
      token: owner.token,
      body: {
        title: `QA missing front ${RUN_ID}`,
        band: '20m',
        mode: 'SSB',
        ratio: { w: 3, h: 2 },
        backImage: svgDataUrl('back'),
      },
    });
    expectStatus(res, 400, 'create card without frontImage');
  });

  await test('cards: GET /api/me/cards contains my pending cards with shareToken', async () => {
    const owner = needUser('owner');
    const res = await api('GET', '/api/me/cards', { token: owner.token });
    expectStatus(res, 200, 'GET /api/me/cards');
    const items = expectArray(res.json && res.json.items, 'me/cards.items', res);
    for (const key of ['card1', 'card2', 'card3', 'card4']) {
      const card = needCard(key);
      const found = findById(items, card.id);
      assert(found, `我的卡片列表缺少 ${key}`, res);
      expectEqual(found.status, 'pending', `${key}.status in /api/me/cards`, res);
      expectString(found.shareToken, `${key}.shareToken in /api/me/cards`, res);
    }
    assert(
      items.every((item) => item.owner && item.owner.username === owner.username),
      '我的卡片列表中出现了其他用户的卡片',
      res,
    );
  });

  await test('cards: public list hides pending cards', async () => {
    const res = await api('GET', '/api/cards?limit=48');
    const body = expectPaginated(res, 'GET /api/cards');
    for (const key of ['card1', 'card2', 'card3', 'card4']) {
      assert(!findById(body.items, needCard(key).id), `pending 卡片 ${key} 出现在公共列表`, res);
    }
    assert(body.items.every((item) => item.status === 'approved'), '公共列表包含非 approved 卡片', res);
  });

  await test('cards: unauthenticated GET pending card detail -> 404', async () => {
    const card2 = needCard('card2');
    const res = await api('GET', `/api/cards/${card2.id}`);
    expectStatusSoftCode(res, 404, 'NOT_FOUND', 'pending card detail without auth');
  });

  await test('cards: non-owner GET pending card detail -> 404', async () => {
    const card2 = needCard('card2');
    const res = await api('GET', `/api/cards/${card2.id}`, { token: needUser('u2').token });
    expectStatusSoftCode(res, 404, 'NOT_FOUND', 'pending card detail as non-owner');
  });

  await test('cards: owner GET own pending card detail -> 200 (isOwner, canApply=false)', async () => {
    const owner = needUser('owner');
    const card2 = needCard('card2');
    const res = await api('GET', `/api/cards/${card2.id}`, { token: owner.token });
    expectStatus(res, 200, 'GET own pending card detail');
    expectEqual(res.json.card.status, 'pending', 'pending detail status', res);
    expectEqual(res.json.card.isOwner, true, 'pending detail isOwner', res);
    expectEqual(res.json.card.canApply, false, 'pending detail canApply', res);
    expectEqual(res.json.card.myExchange, null, 'pending detail myExchange', res);
    expectObject(res.json.owner, 'pending detail owner', res);
  });
}

// ---------------------------------------------------------------------------
// Phase: admin login & moderation
// ---------------------------------------------------------------------------

async function phaseAdminModeration() {
  phase('Admin: seed login / stats / card approval');

  await test('admin: seed admin account logs in with role=admin', async () => {
    const admin = needUser('admin');
    expectEqual(admin.user.role, 'admin', 'admin.role');
    expectString(admin.token, 'admin.token');
  });

  await test('admin/stats: GET /api/admin/stats -> 200 with users/cards/exchanges/likes + arrays', async () => {
    const admin = needUser('admin');
    const res = await api('GET', '/api/admin/stats', { token: admin.token });
    expectStatus(res, 200, 'GET /api/admin/stats');
    const body = expectObject(res.json, 'admin/stats body', res);
    expectObject(body.users, 'stats.users', res);
    expectNumber(body.users.total, 'stats.users.total', res);
    expectNumber(body.users.active, 'stats.users.active', res);
    expectNumber(body.users.banned, 'stats.users.banned', res);
    expectObject(body.cards, 'stats.cards', res);
    expectNumber(body.cards.total, 'stats.cards.total', res);
    expectNumber(body.cards.pending, 'stats.cards.pending', res);
    assert(body.cards.pending >= 3, `stats.cards.pending 应 >= 3（本次创建了 3 张 pending 卡），实际 ${body.cards.pending}`, res);
    expectObject(body.exchanges, 'stats.exchanges', res);
    expectNumber(body.likes, 'stats.likes', res);
    expectArray(body.recentUsers, 'stats.recentUsers', res);
    expectArray(body.pendingCards, 'stats.pendingCards', res);
    expectArray(body.recentExchanges, 'stats.recentExchanges', res);
    assert(findById(body.pendingCards, needCard('card1').id), 'stats.pendingCards 缺少 card1', res);
  });

  await test('admin/cards: status=pending contains new pending cards with owner.status & shareToken', async () => {
    const admin = needUser('admin');
    const res = await api('GET', '/api/admin/cards?status=pending&limit=48', { token: admin.token });
    const body = expectPaginated(res, 'GET /api/admin/cards?status=pending');
    assert(
      body.items.every((item) => item.status === 'pending'),
      'status=pending 过滤返回了非 pending 卡片',
      res,
    );
    for (const key of ['card1', 'card2', 'card3']) {
      const found = findById(body.items, needCard(key).id);
      assert(found, `admin pending 列表缺少 ${key}`, res);
      expectString(found.shareToken, `${key}.shareToken in admin list`, res);
      if (!found.owner || typeof found.owner.status !== 'string') {
        softNote(`admin/cards 列表项 ${key} 缺少 owner.status 字段`);
      }
    }
  });

  await test('admin/cards: approve card1 -> 200 status=approved, rejectReason cleared', async () => {
    const admin = needUser('admin');
    const card1 = needCard('card1');
    const res = await api('PUT', `/api/admin/cards/${card1.id}`, { token: admin.token, body: { status: 'approved' } });
    expectStatus(res, 200, 'PUT /api/admin/cards/:id {status:approved}');
    expectEqual(res.json.card.status, 'approved', 'approved card status', res);
    cards.card1 = res.json.card;
    if (res.json.card.rejectReason != null) softNote('审核通过后 rejectReason 未清空');
  });

  await test('admin/cards: approve card2 -> 200 status=approved', async () => {
    const admin = needUser('admin');
    const card2 = needCard('card2');
    const res = await api('PUT', `/api/admin/cards/${card2.id}`, { token: admin.token, body: { status: 'approved' } });
    expectStatus(res, 200, 'PUT /api/admin/cards/:id (card2)');
    expectEqual(res.json.card.status, 'approved', 'card2 approved status', res);
    cards.card2 = res.json.card;
  });

  await test('admin/cards: approve card4 -> 200 status=approved', async () => {
    const admin = needUser('admin');
    const card4 = needCard('card4');
    const res = await api('PUT', `/api/admin/cards/${card4.id}`, { token: admin.token, body: { status: 'approved' } });
    expectStatus(res, 200, 'PUT /api/admin/cards/:id (card4)');
    expectEqual(res.json.card.status, 'approved', 'card4 approved status', res);
    cards.card4 = res.json.card;
  });


  await test('admin/cards: admin can read pending card detail via public endpoint (200)', async () => {
    const admin = needUser('admin');
    const card3 = needCard('card3');
    const res = await api('GET', `/api/cards/${card3.id}`, { token: admin.token });
    expectStatus(res, 200, 'GET pending card detail as admin');
    expectEqual(res.json.card.status, 'pending', 'admin pending detail status', res);
    expectEqual(res.json.card.isOwner, false, 'admin pending detail isOwner', res);
  });

  await test('cards: approved card appears in public list (only approved cards)', async () => {
    const res = await api('GET', '/api/cards?limit=48');
    const body = expectPaginated(res, 'GET /api/cards');
    const found = findById(body.items, needCard('card1').id);
    assert(found, '公共列表缺少已通过审核的 card1', res);
    expectEqual(found.status, 'approved', 'public list card status', res);
    assert(body.items.every((item) => item.status === 'approved'), '公共列表包含非 approved 卡片', res);
  });

  await test('cards: public detail of approved card works without auth', async () => {
    const card1 = needCard('card1');
    const res = await api('GET', `/api/cards/${card1.id}`);
    expectStatus(res, 200, 'GET approved card detail (anonymous)');
    const card = expectObject(res.json.card, 'detail.card', res);
    expectEqual(card.id, card1.id, 'detail.card.id', res);
    expectEqual(card.status, 'approved', 'detail.card.status', res);
    expectEqual(card.likeCount, 0, 'detail.card.likeCount', res);
    expectString(card.shareToken, 'detail.card.shareToken', res);
    expectObject(res.json.owner, 'detail.owner', res);
    expectEqual(res.json.owner.username, needUser('owner').username, 'detail.owner.username', res);
  });

  // ---- v3：呼号搜索（后端新增 callSign 参数；匹配卡片 callSign 与 owner.callSign，大小写不敏感） ----
  await test('cards: callSign search matches card callSign', async () => {
    const res = await api('GET', '/api/cards?callSign=QA0C1&limit=48');
    const body = expectPaginated(res, 'GET /api/cards?callSign=QA0C1');
    const card1 = findById(body.items, needCard('card1').id);
    assert(card1, 'callSign=QA0C1 未命中 card1（其 callSign=QA0C1）', res);
    expectEqual(card1.callSign, 'QA0C1', '命中卡片的 callSign', res);
    assert(body.items.every((item) => item.status === 'approved'), 'callSign 搜索结果包含非 approved 卡片', res);
  });

  await test('cards: callSign search matches owner.callSign (card callSign differs)', async () => {
    const ownerCallSign = needUser('owner').user.callSign; // QA0OWN
    const res = await api('GET', `/api/cards?callSign=${encodeURIComponent(ownerCallSign)}&limit=48`);
    const body = expectPaginated(res, `GET /api/cards?callSign=${ownerCallSign}`);
    const card1 = findById(body.items, needCard('card1').id);
    assert(card1, `callSign=${ownerCallSign} 未命中 card1（应通过 owner.callSign 命中）`, res);
    expectEqual(card1.callSign, 'QA0C1', 'card1.callSign 与 owner.callSign 不同（验证匹配来源）', res);
    for (const item of body.items) {
      const cardSign = String(item.callSign || '').toUpperCase();
      const ownerSign = String((item.owner && item.owner.callSign) || '').toUpperCase();
      assert(
        cardSign === ownerCallSign.toUpperCase() || ownerSign === ownerCallSign.toUpperCase(),
        `callSign 搜索返回了不相关卡片 ${item.id}（card=${cardSign}, owner=${ownerSign}）`,
        res,
      );
    }
  });

  await test('cards: callSign search is case-insensitive', async () => {
    const upper = await api('GET', '/api/cards?callSign=QA0C1&limit=48');
    const lower = await api('GET', '/api/cards?callSign=qa0c1&limit=48');
    expectPaginated(upper, 'GET /api/cards?callSign=QA0C1');
    const lowerBody = expectPaginated(lower, 'GET /api/cards?callSign=qa0c1');
    assert(findById(lowerBody.items, needCard('card1').id), '小写 callSign 搜索未命中 card1', lower);
    if (lowerBody.total !== upper.json.total) {
      softNote(`callSign 搜索大小写结果数不一致: 大写 ${upper.json.total} / 小写 ${lowerBody.total}`);
    }
  });

  await test('cards: callSign search with no match -> empty result', async () => {
    const res = await api('GET', `/api/cards?callSign=ZZZ_NOMATCH_${RUN_ID}&limit=48`);
    const body = expectPaginated(res, 'GET /api/cards?callSign=<no match>');
    expectEqual(body.total, 0, '无匹配 callSign 的 total', res);
    expectEqual(body.items.length, 0, '无匹配 callSign 的 items', res);
  });

  await test('cards: callSign search tolerates illegal/odd parameter values', async () => {
    for (const value of ['', 'x'.repeat(300), '%E4%B8%AD%E6%96%87', 'a b/c']) {
      const res = await api('GET', `/api/cards?callSign=${encodeURIComponent(value)}&limit=12`);
      expectStatus(res, 200, `GET /api/cards?callSign=${snip(value, 20)}`);
      expectArray(res.json && res.json.items, 'callSign 非法参数响应 items', res);
    }
  });

  await test('cards: q search still matches title (contract regression)', async () => {
    const res = await api('GET', `/api/cards?q=${encodeURIComponent(cardTitles.card1)}&limit=48`);
    const body = expectPaginated(res, 'GET /api/cards?q=<title>');
    assert(findById(body.items, needCard('card1').id), 'q 搜索未命中已通过的 card1 标题', res);
  });
}

// ---------------------------------------------------------------------------
// Phase: likes
// ---------------------------------------------------------------------------

async function phaseLikes() {
  phase('Likes: toggle / permission');

  await test('likes: like toggles liked=true and increments likeCount by 1', async () => {
    const u2 = needUser('u2');
    const card1 = needCard('card1');
    const before = await api('GET', `/api/cards/${card1.id}`, { token: u2.token });
    expectStatus(before, 200, 'GET card detail before like');
    const baseCount = before.json.card.likeCount;
    const res = await api('POST', `/api/cards/${card1.id}/like`, { token: u2.token });
    expectStatus(res, 200, 'POST /api/cards/:id/like');
    expectEqual(res.json.liked, true, 'like.liked', res);
    expectEqual(res.json.likeCount, baseCount + 1, 'like.likeCount', res);
  });

  await test('likes: second click unlikes (liked=false, count restored)', async () => {
    const u2 = needUser('u2');
    const card1 = needCard('card1');
    const res = await api('POST', `/api/cards/${card1.id}/like`, { token: u2.token });
    expectStatus(res, 200, 'POST /api/cards/:id/like (toggle off)');
    expectEqual(res.json.liked, false, 'unlike.liked', res);
    expectEqual(res.json.likeCount, 0, 'unlike.likeCount', res);
  });

  await test('likes: unauthenticated like -> 401', async () => {
    const card1 = needCard('card1');
    const res = await api('POST', `/api/cards/${card1.id}/like`);
    expectStatusSoftCode(res, 401, 'UNAUTHORIZED', 'like without token');
  });
}

// ---------------------------------------------------------------------------
// Phase: exchanges — first card (independent approvals for different applicants)
// ---------------------------------------------------------------------------

async function phaseExchangesApprove() {
  phase('Exchanges: create / duplicate / independent approvals');

  await test('exchanges: applying to own card is rejected (400 or 403)', async () => {
    const owner = needUser('owner');
    const card1 = needCard('card1');
    const res = await api('POST', `/api/cards/${card1.id}/exchanges`, { token: owner.token, body: exchangePayload('self') });
    assert([400, 403].includes(res.status), `期望 400 或 403，实际 ${res.status}${resInfo(res)}`);
  });

  await test('exchanges: unauthenticated application -> 401', async () => {
    const card1 = needCard('card1');
    const res = await api('POST', `/api/cards/${card1.id}/exchanges`, { body: exchangePayload('anon') });
    expectStatusSoftCode(res, 401, 'UNAUTHORIZED', 'exchange without token');
  });

  await test('exchanges: missing address -> 400 VALIDATION', async () => {
    const u3 = needUser('u3');
    const card1 = needCard('card1');
    const res = await api('POST', `/api/cards/${card1.id}/exchanges`, {
      token: u3.token,
      body: { message: 'no address', contactName: 'QA' },
    });
    expectError(res, 400, 'VALIDATION', 'exchange without address');
    const res2 = await api('POST', `/api/cards/${card1.id}/exchanges`, {
      token: u3.token,
      body: { message: 'bad address', contactName: 'QA', address: { name: 'QA' } },
    });
    expectError(res2, 400, 'VALIDATION', 'exchange with incomplete address');
  });

  await test('exchanges: valid application -> 201 pending, addresses hidden while pending', async () => {
    const res = await applyExchange('u2', 'card1', 'e2');
    const exchange = res.json.exchange;
    expectEqual(exchange.status, 'pending', 'new exchange status', res);
    expectString(exchange.id, 'new exchange id', res);
    expectEqual(exchange.fromAddress, null, 'pending fromAddress', res);
    expectEqual(exchange.toAddress, null, 'pending toAddress', res);
    expectEqual(exchange.card.id, needCard('card1').id, 'exchange.card.id', res);
    expectEqual(exchange.fromUser.username, needUser('u2').username, 'exchange.fromUser', res);
    expectEqual(exchange.contactName, 'QA 收件人', 'exchange.contactName', res);
    if (exchange.direction !== 'outgoing') softNote(`申请创建响应 direction=${snip(exchange.direction)}（期望 outgoing）`);
  });

  await test('exchanges: duplicate active application -> 409 CONFLICT', async () => {
    const u2 = needUser('u2');
    const card1 = needCard('card1');
    const res = await api('POST', `/api/cards/${card1.id}/exchanges`, { token: u2.token, body: exchangePayload('dup') });
    expectError(res, 409, 'CONFLICT', 'duplicate exchange application');
    if (!/已申请/.test(String(res.json.error.message))) softNote('重复申请 409 message 未包含"已申请"提示');
  });

  await test('exchanges: second user application to same card -> 201 pending', async () => {
    const res = await applyExchange('u3', 'card1', 'e3');
    expectEqual(res.json.exchange.status, 'pending', 'e3 status', res);
  });

  await test('exchanges: owner incoming list contains pending applications with hidden addresses', async () => {
    const owner = needUser('owner');
    const res = await api('GET', '/api/me/exchanges?box=incoming', { token: owner.token });
    expectStatus(res, 200, 'GET /api/me/exchanges?box=incoming');
    const items = expectArray(res.json && res.json.items, 'me/exchanges.items', res);
    const e2 = needExchange('e2');
    const e3 = needExchange('e3');
    for (const exchange of [e2, e3]) {
      const found = findById(items, exchange.id);
      assert(found, `owner 收到的申请列表缺少 ${exchange.id}`, res);
      expectEqual(found.direction, 'incoming', 'incoming direction', res);
      expectEqual(found.fromAddress, null, 'incoming pending fromAddress', res);
      expectEqual(found.toAddress, null, 'incoming pending toAddress', res);
    }
    const counts = expectObject(res.json && res.json.counts, 'me/exchanges.counts', res);
    expectNumber(counts.incomingPending, 'counts.incomingPending', res);
    assert(counts.incomingPending >= 2, `incomingPending 应 >= 2，实际 ${counts.incomingPending}`, res);
    expectNumber(counts.total, 'counts.total', res);
  });

  await test('exchanges: owner approves -> approved with both addresses in response', async () => {
    const owner = needUser('owner');
    const e2 = needExchange('e2');
    const res = await api('POST', `/api/exchanges/${e2.id}/approve`, { token: owner.token, body: { confirmNoCards: true } });
    expectStatus(res, 200, 'POST /api/exchanges/:id/approve');
    const exchange = res.json.exchange;
    expectEqual(exchange.status, 'approved', 'approved exchange status', res);
    const fromAddress = expectObject(exchange.fromAddress, 'approved fromAddress', res);
    const toAddress = expectObject(exchange.toAddress, 'approved toAddress', res);
    expectEqual(fromAddress.name, 'QA e2', 'approved fromAddress.name', res);
    expectEqual(toAddress.name, 'QA Owner', 'approved toAddress.name (owner profile address)', res);
    exchanges.e2 = exchange;
  });

  await test('exchanges: approving one application leaves other pending ones unchanged', async () => {
    const u3 = needUser('u3');
    const e3 = needExchange('e3');
    const res = await api('GET', `/api/exchanges/${e3.id}`, { token: u3.token });
    expectStatus(res, 200, 'GET other pending exchange');
    expectEqual(res.json.exchange.status, 'pending', 'other application stays pending', res);
    expectEqual(res.json.exchange.rejectReason, null, 'pending rejectReason', res);
    expectEqual(res.json.exchange.decidedAt, null, 'pending decidedAt', res);
    expectEqual(res.json.exchange.fromAddress, null, 'pending fromAddress', res);
    expectEqual(res.json.exchange.toAddress, null, 'pending toAddress', res);
  });

  await test('exchanges: applicant sees both addresses after approval', async () => {
    const u2 = needUser('u2');
    const e2 = needExchange('e2');
    const res = await api('GET', `/api/exchanges/${e2.id}`, { token: u2.token });
    expectStatus(res, 200, 'GET approved exchange as applicant');
    expectEqual(res.json.exchange.status, 'approved', 'applicant view status', res);
    expectObject(res.json.exchange.fromAddress, 'applicant view fromAddress', res);
    expectObject(res.json.exchange.toAddress, 'applicant view toAddress', res);
    if (res.json.exchange.direction !== 'outgoing') {
      softNote(`申请者视角 direction=${snip(res.json.exchange.direction)}（期望 outgoing）`);
    }
  });

  await test('exchanges: card owner sees both addresses after approval', async () => {
    const owner = needUser('owner');
    const e2 = needExchange('e2');
    const res = await api('GET', `/api/exchanges/${e2.id}`, { token: owner.token });
    expectStatus(res, 200, 'GET approved exchange as owner');
    expectObject(res.json.exchange.fromAddress, 'owner view fromAddress', res);
    expectObject(res.json.exchange.toAddress, 'owner view toAddress', res);
    expectEqual(res.json.exchange.direction, 'incoming', 'owner view direction', res);
  });

  await test('exchanges: re-applying while an approved application exists -> 409 CONFLICT', async () => {
    const u2 = needUser('u2');
    const card1 = needCard('card1');
    const res = await api('POST', `/api/cards/${card1.id}/exchanges`, { token: u2.token, body: exchangePayload('dup2') });
    expectError(res, 409, 'CONFLICT', 're-apply after approval');
  });

  await test('cards: detail exposes myExchange for applicant (approved)', async () => {
    const u2 = needUser('u2');
    const card1 = needCard('card1');
    const res = await api('GET', `/api/cards/${card1.id}`, { token: u2.token });
    expectStatus(res, 200, 'GET card1 detail as applicant');
    const mine = res.json.card.myExchange;
    expectObject(mine, 'card detail myExchange', res);
    expectEqual(mine.id, needExchange('e2').id, 'myExchange.id', res);
    expectEqual(mine.status, 'approved', 'myExchange.status', res);
    expectEqual(res.json.card.canApply, false, 'canApply with approved exchange', res);
    expectEqual(res.json.card.isOwner, false, 'isOwner for applicant', res);
  });

  await test('cards: detail exposes pending myExchange for another applicant', async () => {
    const u3 = needUser('u3');
    const card1 = needCard('card1');
    const res = await api('GET', `/api/cards/${card1.id}`, { token: u3.token });
    expectStatus(res, 200, 'GET card1 detail as pending applicant');
    const mine = res.json.card.myExchange;
    expectObject(mine, 'pending applicant myExchange', res);
    expectEqual(mine.status, 'pending', 'myExchange.status (pending)', res);
    expectEqual(res.json.card.canApply, false, 'pending applicant cannot duplicate application', res);
  });

  await test('exchanges: a second applicant can also be approved for the same card', async () => {
    const res = await api('POST', `/api/exchanges/${needExchange('e3').id}/approve`, { token: needUser('owner').token, body: { confirmNoCards: true } });
    expectStatus(res, 200, 'approve another applicant');
    expectEqual(res.json.exchange.status, 'approved', 'second approval status', res);
    expectObject(res.json.exchange.fromAddress, 'second approved fromAddress', res);
    expectObject(res.json.exchange.toAddress, 'second approved toAddress', res);
    const first = await api('GET', `/api/exchanges/${needExchange('e2').id}`, { token: needUser('owner').token });
    expectEqual(first.json.exchange.status, 'approved', 'first approval remains approved', first);
    const other = await api('GET', `/api/exchanges/${needExchange('e2').id}`, { token: needUser('u3').token });
    expectStatusSoftCode(other, 403, 'FORBIDDEN', 'another applicant cannot view first exchange addresses');
  });

  await test('exchanges: a later application can be approved while earlier exchanges remain active', async () => {
    const created = await applyExchange('u4', 'card1', 'eLate');
    expectStatus(created, 201, 'create later application');
    const id = needExchange('eLate').id;
    const approved = await api('POST', `/api/exchanges/${id}/approve`, { token: needUser('owner').token, body: { confirmNoCards: true } });
    expectStatus(approved, 200, 'approve later application');
    const completed = await api('POST', `/api/exchanges/${id}/complete`, { token: needUser('u4').token });
    expectStatus(completed, 200, 'complete later exchange independently');
    for (const key of ['e2', 'e3']) {
      const res = await api('GET', `/api/exchanges/${needExchange(key).id}`, { token: needUser('owner').token });
      expectEqual(res.json.exchange.status, 'approved', 'other exchange remains active', res);
    }
  });
}

// ---------------------------------------------------------------------------
// Phase: exchanges — second card (reject / cancel / complete state machine)
// ---------------------------------------------------------------------------

async function phaseExchangesLifecycle() {
  phase('Exchanges: reject / cancel / complete / guards');

  await test('exchanges: application to second approved card -> 201 pending', async () => {
    const res = await applyExchange('u3', 'card2', 'e4');
    expectEqual(res.json.exchange.status, 'pending', 'e4 status', res);
  });

  await test('exchanges: non-owner cannot approve/reject someone else application (403)', async () => {
    const u2 = needUser('u2');
    const e4 = needExchange('e4');
    const approveRes = await api('POST', `/api/exchanges/${e4.id}/approve`, { token: u2.token, body: { confirmNoCards: true } });
    expectStatusSoftCode(approveRes, 403, 'FORBIDDEN', 'non-owner approve');
    const rejectRes = await api('POST', `/api/exchanges/${e4.id}/reject`, { token: u2.token, body: { reason: 'nope' } });
    expectStatusSoftCode(rejectRes, 403, 'FORBIDDEN', 'non-owner reject');
  });

  await test('exchanges: non-participant cannot read exchange detail (403/404)', async () => {
    const u2 = needUser('u2');
    const e4 = needExchange('e4');
    const res = await api('GET', `/api/exchanges/${e4.id}`, { token: u2.token });
    // Contract does not pin 404 vs 403 for non-participants; both hide the payload.
    assert([403, 404].includes(res.status), `非参与者读取申请详情应被拒绝(403/404)，实际 ${res.status}${resInfo(res)}`);
  });

  await test('exchanges: owner rejects pending application -> rejected with rejectReason', async () => {
    const owner = needUser('owner');
    const e4 = needExchange('e4');
    const res = await api('POST', `/api/exchanges/${e4.id}/reject`, { token: owner.token, body: { reason: 'QA 地址太远' } });
    expectStatus(res, 200, 'POST /api/exchanges/:id/reject');
    expectEqual(res.json.exchange.status, 'rejected', 'rejected exchange status', res);
    expectTruthy(res.json.exchange.rejectReason, 'rejected rejectReason', res);
    if (res.json.exchange.rejectReason !== 'QA 地址太远') {
      softNote(`reject 的 reason 未原样回显: ${snip(res.json.exchange.rejectReason)}`);
    }
    exchanges.e4 = res.json.exchange;
  });

  await test('exchanges: applicant sees rejected status and reason, addresses hidden', async () => {
    const u3 = needUser('u3');
    const e4 = needExchange('e4');
    const res = await api('GET', `/api/exchanges/${e4.id}`, { token: u3.token });
    expectStatus(res, 200, 'GET rejected exchange as applicant');
    expectEqual(res.json.exchange.status, 'rejected', 'rejected applicant view', res);
    expectTruthy(res.json.exchange.rejectReason, 'rejected applicant view rejectReason', res);
    expectEqual(res.json.exchange.fromAddress, null, 'rejected fromAddress', res);
    expectEqual(res.json.exchange.toAddress, null, 'rejected toAddress', res);
  });

  await test('exchanges: re-application allowed after rejection -> 201 pending', async () => {
    const res = await applyExchange('u3', 'card2', 'e5');
    expectEqual(res.json.exchange.status, 'pending', 'e5 status', res);
  });

  await test('exchanges: applicant cancels pending application -> cancelled', async () => {
    const u3 = needUser('u3');
    const e5 = needExchange('e5');
    const res = await api('POST', `/api/exchanges/${e5.id}/cancel`, { token: u3.token });
    expectStatus(res, 200, 'POST /api/exchanges/:id/cancel');
    expectEqual(res.json.exchange.status, 'cancelled', 'cancelled status', res);
    exchanges.e5 = res.json.exchange;
  });

  await test('exchanges: owner sees cancelled status', async () => {
    const owner = needUser('owner');
    const e5 = needExchange('e5');
    const res = await api('GET', `/api/exchanges/${e5.id}`, { token: owner.token });
    expectStatus(res, 200, 'GET cancelled exchange as owner');
    expectEqual(res.json.exchange.status, 'cancelled', 'cancelled owner view', res);
    expectEqual(res.json.exchange.fromAddress, null, 'cancelled fromAddress', res);
    expectEqual(res.json.exchange.toAddress, null, 'cancelled toAddress', res);
  });

  await test('exchanges: re-application allowed after cancel -> 201 pending', async () => {
    const res = await applyExchange('u3', 'card2', 'e6');
    expectEqual(res.json.exchange.status, 'pending', 'e6 status', res);
  });

  await test('exchanges: owner approves third attempt -> approved with addresses', async () => {
    const owner = needUser('owner');
    const e6 = needExchange('e6');
    const res = await api('POST', `/api/exchanges/${e6.id}/approve`, { token: owner.token, body: { confirmNoCards: true } });
    expectStatus(res, 200, 'approve e6');
    expectEqual(res.json.exchange.status, 'approved', 'e6 approved status', res);
    expectObject(res.json.exchange.fromAddress, 'e6 fromAddress', res);
    expectObject(res.json.exchange.toAddress, 'e6 toAddress', res);
    exchanges.e6 = res.json.exchange;
  });

  await test('exchanges: participant completes approved exchange -> completed with addresses', async () => {
    const u3 = needUser('u3');
    const e6 = needExchange('e6');
    const res = await api('POST', `/api/exchanges/${e6.id}/complete`, { token: u3.token });
    expectStatus(res, 200, 'POST /api/exchanges/:id/complete');
    expectEqual(res.json.exchange.status, 'completed', 'completed status', res);
    expectObject(res.json.exchange.fromAddress, 'completed fromAddress', res);
    expectObject(res.json.exchange.toAddress, 'completed toAddress', res);
    exchanges.e6 = res.json.exchange;
  });

  await test('exchanges: owner sees completed exchange with addresses', async () => {
    const owner = needUser('owner');
    const e6 = needExchange('e6');
    const res = await api('GET', `/api/exchanges/${e6.id}`, { token: owner.token });
    expectStatus(res, 200, 'GET completed exchange as owner');
    expectEqual(res.json.exchange.status, 'completed', 'completed owner view', res);
    expectObject(res.json.exchange.fromAddress, 'completed owner view fromAddress', res);
    expectObject(res.json.exchange.toAddress, 'completed owner view toAddress', res);
  });

  await test('exchanges: cannot complete a pending exchange (400/409)', async () => {
    const u2 = needUser('u2');
    const res = await applyExchange('u2', 'card2', 'e7'); // u2 has no activity on card2 -> allowed, stays pending
    expectEqual(res.json.exchange.status, 'pending', 'e7 status', res);
    const completeRes = await api('POST', `/api/exchanges/${exchanges.e7.id}/complete`, { token: u2.token });
    assert([400, 409].includes(completeRes.status), `complete 一个 pending 申请应失败(400/409)，实际 ${completeRes.status}${resInfo(completeRes)}`);
  });

  await test('exchanges: cannot cancel a completed exchange (400/409)', async () => {
    const u3 = needUser('u3');
    const e6 = needExchange('e6');
    const res = await api('POST', `/api/exchanges/${e6.id}/cancel`, { token: u3.token });
    assert([400, 409].includes(res.status), `cancel 一个 completed 申请应失败(400/409)，实际 ${res.status}${resInfo(res)}`);
  });

  await test('exchanges: applying to a non-approved card fails (400/403/404)', async () => {
    const u2 = needUser('u2');
    const card3 = needCard('card3'); // still pending at this point
    const res = await api('POST', `/api/cards/${card3.id}/exchanges`, { token: u2.token, body: exchangePayload('pending-card') });
    assert([400, 403, 404].includes(res.status), `申请 pending 卡片应失败，实际 ${res.status}${resInfo(res)}`);
  });

  await test('exchanges: /api/me/exchanges box filters and counts envelope', async () => {
    const owner = needUser('owner');
    const incoming = await api('GET', '/api/me/exchanges?box=incoming', { token: owner.token });
    expectStatus(incoming, 200, 'GET me/exchanges?box=incoming');
    expectArray(incoming.json.items, 'incoming.items', incoming);
    const counts = expectObject(incoming.json.counts, 'incoming.counts', incoming);
    expectNumber(counts.incomingPending, 'counts.incomingPending', incoming);
    expectNumber(counts.outgoingPending, 'counts.outgoingPending', incoming);
    expectNumber(counts.total, 'counts.total', incoming);
    const outgoing = await api('GET', '/api/me/exchanges?box=outgoing', { token: needUser('u2').token });
    expectStatus(outgoing, 200, 'GET me/exchanges?box=outgoing');
    const outItems = expectArray(outgoing.json.items, 'outgoing.items', outgoing);
    for (const item of outItems) expectEqual(item.direction, 'outgoing', 'outgoing item direction', outgoing);
    assert(findById(outItems, needExchange('e2').id), 'u2 发出的申请列表缺少 e2', outgoing);
    assert(findById(outItems, needExchange('e7').id), 'u2 发出的申请列表缺少 e7', outgoing);
  });
}

// ---------------------------------------------------------------------------
// Phase: share tokens
// ---------------------------------------------------------------------------

async function phaseShare() {
  phase('Share: token endpoint / public endpoint / route');

  await test('share: owner GET /api/cards/:id/share -> { shareToken, url }', async () => {
    const owner = needUser('owner');
    const card1 = needCard('card1');
    const res = await api('GET', `/api/cards/${card1.id}/share`, { token: owner.token });
    expectStatus(res, 200, 'GET /api/cards/:id/share');
    expectString(res.json.shareToken, 'share.shareToken', res);
    expectEqual(res.json.shareToken, card1.shareToken, 'share token matches card shareToken', res);
    expectString(res.json.url, 'share.url', res);
    assert(/^[A-Za-z]{6}$/.test(res.json.shareToken), 'shareToken 应为六位大小写字母', res);
    assert(res.json.url.includes(`/s/${res.json.shareToken}`), `share.url 应包含 /s/<token>，实际 ${res.json.url}`, res);
    if (!/^https?:\/\//.test(res.json.url)) softNote(`share.url 不是绝对 URL: ${res.json.url}`);
  });

  await test('share: unauthenticated share endpoint -> 401', async () => {
    const card1 = needCard('card1');
    const res = await api('GET', `/api/cards/${card1.id}/share`);
    expectStatusSoftCode(res, 401, 'UNAUTHORIZED', 'share without token');
  });

  await test('share: non-owner share endpoint -> 403', async () => {
    const card1 = needCard('card1');
    const res = await api('GET', `/api/cards/${card1.id}/share`, { token: needUser('u2').token });
    expectStatusSoftCode(res, 403, 'FORBIDDEN', 'share as non-owner');
  });

  await test('share: public card endpoint works without auth for approved card', async () => {
    const card1 = needCard('card1');
    const res = await api('GET', `/api/public/cards/${card1.shareToken}`);
    expectStatus(res, 200, 'GET /api/public/cards/:token (anonymous)');
    expectEqual(res.json.card.id, card1.id, 'public card id', res);
    expectEqual(res.json.card.status, 'approved', 'public card status', res);
    expectObject(res.json.owner, 'public card owner', res);
    expectEqual(res.json.owner.username, needUser('owner').username, 'public card owner.username', res);
  });

  await test('share: public card endpoint hides pending card -> 404', async () => {
    const owner = needUser('owner');
    const card3 = needCard('card3');
    const shareRes = await api('GET', `/api/cards/${card3.id}/share`, { token: owner.token });
    expectStatus(shareRes, 200, 'GET share token for pending card');
    const token = shareRes.json.shareToken;
    expectString(token, 'pending card shareToken', shareRes);
    const res = await api('GET', `/api/public/cards/${token}`);
    expectStatusSoftCode(res, 404, 'NOT_FOUND', 'public pending card by token');
  });

  await test('share: unknown public token -> 404', async () => {
    const res = await api('GET', '/api/public/cards/qa-no-such-token');
    expectStatusSoftCode(res, 404, 'NOT_FOUND', 'unknown share token');
  });

  await test('share: GET /share/:token route falls back to index.html', async () => {
    const card1 = needCard('card1');
    const short = await api('GET', `/s/${card1.shareToken}`, { redirect: 'manual' });
    expectStatus(short, 200, 'GET /s/<real token>');
    assert(/id=["']app["']/.test(short.text), '/s/:token 应回退到 index.html', short);
    const res = await api('GET', `/share/${card1.shareToken}`, { redirect: 'manual' });
    expectStatus(res, 200, 'GET /share/<real token>');
    assert(/id=["']app["']/.test(res.text), '分享页路由未回退到 index.html', res);
  });
}

// ---------------------------------------------------------------------------
// Phase: admin panel (users / ban / cards / exchanges / permissions)
// ---------------------------------------------------------------------------

async function phaseAdminPanel() {
  phase('Admin panel: users / ban / cards / exchanges / permissions');

  await test('admin/users: paginated list envelope + expected fields', async () => {
    const admin = needUser('admin');
    const res = await api('GET', '/api/admin/users?page=1&limit=2', { token: admin.token });
    const body = expectPaginated(res, 'GET /api/admin/users');
    expectEqual(body.page, 1, 'users.page', res);
    expectEqual(body.limit, 2, 'users.limit', res);
    assert(body.items.length <= 2, `limit=2 时 items 应 <= 2，实际 ${body.items.length}`, res);
    assert(body.total >= 4, `users.total 应 >= 4（种子 + 测试用户），实际 ${body.total}`, res);
    const first = expectObject(body.items[0], 'users.items[0]', res);
    expectString(first.id, 'user.id', res);
    expectString(first.username, 'user.username', res);
    expectString(first.email, 'user.email', res);
    expectString(first.status, 'user.status', res);
    expectString(first.createdAt, 'user.createdAt', res);
    expectNumber(first.cardCount, 'user.cardCount', res);
    expectNumber(first.exchangeCount, 'user.exchangeCount', res);
    expectString(first.role, 'user.role', res);
  });

  await test('admin/users: search q returns the matching user', async () => {
    const admin = needUser('admin');
    const u4 = needUser('u4');
    const res = await api('GET', `/api/admin/users?q=${encodeURIComponent(u4.username)}&limit=48`, { token: admin.token });
    const body = expectPaginated(res, 'GET /api/admin/users?q=');
    assert(findById(body.items, u4.id), `用户搜索未找到 ${u4.username}`, res);
  });

  await test('admin/users: edit displayName -> 200', async () => {
    const admin = needUser('admin');
    const u4 = needUser('u4');
    const res = await api('PUT', `/api/admin/users/${u4.id}`, { token: admin.token, body: { displayName: 'QA 改名测试' } });
    expectStatus(res, 200, 'PUT /api/admin/users/:id {displayName}');
    expectEqual(res.json.user.displayName, 'QA 改名测试', 'edited displayName', res);
  });

  await test('me/password: change password -> old fails, new works', async () => {
    const u4 = needUser('u4');
    const newPassword = 'QaNewPass456!';
    const res = await api('PUT', '/api/me/password', {
      token: u4.token,
      body: { currentPassword: u4.password, newPassword },
    });
    expectStatus(res, 200, 'PUT /api/me/password');
    expectEqual(res.json.ok, true, 'password change ok', res);
    const oldLogin = await login(u4.username, u4.password);
    expectError(oldLogin, 401, 'INVALID_CREDENTIALS', 'login with old password');
    const newLogin = await login(u4.username, newPassword);
    expectStatus(newLogin, 200, 'login with new password');
    u4.password = newPassword;
    secrets.push(newPassword);
    if (newLogin.json && newLogin.json.token) u4.token = newLogin.json.token;
    u4.user = newLogin.json.user;
  });

  await test('admin/users: ban user -> 200 status=banned', async () => {
    const admin = needUser('admin');
    const u4 = needUser('u4');
    const res = await api('PUT', `/api/admin/users/${u4.id}`, { token: admin.token, body: { status: 'banned' } });
    expectStatus(res, 200, 'PUT /api/admin/users/:id {status:banned}');
    expectEqual(res.json.user.status, 'banned', 'banned user status', res);
  });

  await test('auth/login: banned user -> 403 BANNED', async () => {
    const u4 = needUser('u4');
    const res = await login(u4.username, 'QaNewPass456!');
    expectError(res, 403, 'BANNED', 'banned user login');
  });

  await test('auth/me: existing token of banned user is invalidated -> 401', async () => {
    const u4 = needUser('u4');
    const res = await api('GET', '/api/auth/me', { token: u4.token });
    expectStatusSoftCode(res, 401, 'UNAUTHORIZED', 'me with banned user token');
  });

  await test('admin/users: cannot ban self -> 400', async () => {
    const admin = needUser('admin');
    const res = await api('PUT', `/api/admin/users/${admin.id}`, { token: admin.token, body: { status: 'banned' } });
    expectStatus(res, 400, 'admin bans self');
  });

  await test('admin/users: cannot demote the last admin -> 400', async () => {
    const admin = needUser('admin');
    const res = await api('PUT', `/api/admin/users/${admin.id}`, { token: admin.token, body: { role: 'user' } });
    expectStatus(res, 400, 'admin demotes self');
  });

  await test('admin/users: cannot delete the last admin -> 400', async () => {
    const admin = needUser('admin');
    const res = await api('DELETE', `/api/admin/users/${admin.id}`, { token: admin.token });
    expectStatus(res, 400, 'DELETE last admin');
  });

  await test('admin/users: status=banned filter contains banned user', async () => {
    const admin = needUser('admin');
    const u4 = needUser('u4');
    const res = await api('GET', '/api/admin/users?status=banned&limit=48', { token: admin.token });
    const body = expectPaginated(res, 'GET /api/admin/users?status=banned');
    assert(body.items.every((item) => item.status === 'banned'), 'status=banned 过滤返回了非 banned 用户', res);
    assert(findById(body.items, u4.id), 'banned 列表缺少被禁用的用户', res);
  });

  await test('admin/users: delete normal user -> 200 ok, record gone and login -> 401', async () => {
    const admin = needUser('admin');
    const u4 = needUser('u4');
    const res = await api('DELETE', `/api/admin/users/${u4.id}`, { token: admin.token });
    expectStatus(res, 200, 'DELETE /api/admin/users/:id');
    expectEqual(res.json.ok, true, 'delete user ok', res);
    const search = await api('GET', `/api/admin/users?q=${encodeURIComponent(u4.username)}&limit=48`, { token: admin.token });
    expectPaginated(search, 'GET /api/admin/users?q=<deleted user>');
    assert(!findById(search.json.items, u4.id), '删除后用户仍出现在管理员用户列表中（记录未被真正删除）', search);
    const loginRes = await login(u4.username, 'QaNewPass456!');
    expectStatusSoftCode(loginRes, 401, 'INVALID_CREDENTIALS', 'login after user deletion');
  });

  await test('admin/cards: status=approved filter contains approved cards with owner.status', async () => {
    const admin = needUser('admin');
    const res = await api('GET', '/api/admin/cards?status=approved&limit=48', { token: admin.token });
    const body = expectPaginated(res, 'GET /api/admin/cards?status=approved');
    assert(body.items.every((item) => item.status === 'approved'), 'approved 过滤返回了非 approved 卡片', res);
    for (const key of ['card1', 'card2']) {
      const found = findById(body.items, needCard(key).id);
      assert(found, `admin approved 列表缺少 ${key}`, res);
      if (!found.owner || typeof found.owner.status !== 'string') softNote(`admin approved 列表项 ${key} 缺少 owner.status`);
    }
  });

  await test('admin/cards: edit fields keeps status (admin edit does not reset to pending)', async () => {
    const admin = needUser('admin');
    const card2 = needCard('card2');
    const res = await api('PUT', `/api/admin/cards/${card2.id}`, { token: admin.token, body: { notes: 'QA admin edited notes' } });
    expectStatus(res, 200, 'PUT /api/admin/cards/:id {notes}');
    expectEqual(res.json.card.notes, 'QA admin edited notes', 'admin edited notes', res);
    expectEqual(res.json.card.status, 'approved', 'status after admin edit', res);
    cards.card2 = res.json.card;
  });

  await test('admin/cards: status=pending filter contains pending card3', async () => {
    const admin = needUser('admin');
    const res = await api('GET', '/api/admin/cards?status=pending&limit=48', { token: admin.token });
    const body = expectPaginated(res, 'GET /api/admin/cards?status=pending');
    assert(findById(body.items, needCard('card3').id), 'admin pending 列表缺少 card3', res);
  });

  await test('admin/cards: delete card -> 200 ok, card is gone afterwards', async () => {
    const admin = needUser('admin');
    const card3 = needCard('card3');
    const res = await api('DELETE', `/api/admin/cards/${card3.id}`, { token: admin.token });
    expectStatus(res, 200, 'DELETE /api/admin/cards/:id');
    expectEqual(res.json.ok, true, 'delete card ok', res);
    const detail = await api('GET', `/api/cards/${card3.id}`);
    expectStatusSoftCode(detail, 404, 'NOT_FOUND', 'deleted card detail');
    const adminList = await api('GET', '/api/admin/cards?limit=48', { token: admin.token });
    const adminBody = expectPaginated(adminList, 'GET /api/admin/cards');
    assert(!findById(adminBody.items, card3.id), '已删除卡片仍出现在管理后台卡片列表', adminList);
    const publicList = await api('GET', '/api/cards?limit=48');
    const publicBody = expectPaginated(publicList, 'GET /api/cards');
    assert(!findById(publicBody.items, card3.id), '已删除卡片仍出现在公共列表', publicList);
  });

  await test('admin/exchanges: list has direction=admin and visible addresses for pending', async () => {
    const admin = needUser('admin');
    const res = await api('GET', '/api/admin/exchanges?limit=48', { token: admin.token });
    const body = expectPaginated(res, 'GET /api/admin/exchanges');
    assert(body.items.length >= 5, `admin 换卡记录应 >= 5，实际 ${body.items.length}`, res);
    for (const item of body.items) {
      if (item.direction !== 'admin') {
        softNote(`admin/exchanges 列表项 direction=${snip(item.direction)}（契约要求固定为 admin）`);
        break;
      }
    }
    const e7 = findById(body.items, needExchange('e7').id);
    assert(e7, 'admin 换卡记录缺少 pending 的 e7', res);
    expectObject(e7.fromAddress, 'admin view pending fromAddress', res);
    expectObject(e7.toAddress, 'admin view pending toAddress', res);
    const e6 = findById(body.items, needExchange('e6').id);
    assert(e6, 'admin 换卡记录缺少 completed 的 e6', res);
    expectEqual(e6.status, 'completed', 'admin view e6 status', res);
  });

  await test('admin: non-admin user gets 403 on admin endpoints', async () => {
    const owner = needUser('owner');
    const stats = await api('GET', '/api/admin/stats', { token: owner.token });
    expectStatusSoftCode(stats, 403, 'FORBIDDEN', 'non-admin GET /api/admin/stats');
    const usersRes = await api('GET', '/api/admin/users', { token: needUser('u2').token });
    expectStatusSoftCode(usersRes, 403, 'FORBIDDEN', 'non-admin GET /api/admin/users');
    const cardsRes = await api('GET', '/api/admin/cards', { token: owner.token });
    expectStatusSoftCode(cardsRes, 403, 'FORBIDDEN', 'non-admin GET /api/admin/cards');
  });

  await test('admin: unauthenticated request gets 401 on admin endpoints', async () => {
    for (const pathname of ['/api/admin/stats', '/api/admin/users', '/api/admin/cards', '/api/admin/exchanges']) {
      const res = await api('GET', pathname);
      expectStatusSoftCode(res, 401, 'UNAUTHORIZED', `anonymous GET ${pathname}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Phase: current-user endpoints
// ---------------------------------------------------------------------------

async function phaseMe() {
  phase('Current user: overview / profile / exchanges');

  await test('me/overview: stats + recent arrays for owner', async () => {
    const owner = needUser('owner');
    const res = await api('GET', '/api/me/overview', { token: owner.token });
    expectStatus(res, 200, 'GET /api/me/overview');
    expectEqual(res.json.user.id, owner.id, 'overview.user.id', res);
    const stats = expectObject(res.json.stats, 'overview.stats', res);
    for (const key of [
      'cards',
      'approvedCards',
      'pendingCards',
      'likesReceived',
      'incomingPending',
      'outgoingPending',
      'completedExchanges',
    ]) {
      expectNumber(stats[key], `overview.stats.${key}`, res);
    }
    assert(stats.approvedCards >= 2, `approvedCards 应 >= 2，实际 ${stats.approvedCards}`, res);
    assert(stats.completedExchanges >= 1, `completedExchanges 应 >= 1，实际 ${stats.completedExchanges}`, res);
    expectArray(res.json.recentIncoming, 'overview.recentIncoming', res);
    expectArray(res.json.recentCards, 'overview.recentCards', res);
  });

  await test('me/profile: update displayName/callSign/bio persists', async () => {
    const owner = needUser('owner');
    const res = await api('PUT', '/api/me/profile', {
      token: owner.token,
      body: { displayName: 'QA 新名字', callSign: 'QA0NEW', bio: 'QA bio 简介' },
    });
    expectStatus(res, 200, 'PUT /api/me/profile');
    expectEqual(res.json.user.displayName, 'QA 新名字', 'profile displayName', res);
    expectEqual(res.json.user.callSign, 'QA0NEW', 'profile callSign', res);
    expectEqual(res.json.user.bio, 'QA bio 简介', 'profile bio', res);
    const me = await api('GET', '/api/auth/me', { token: owner.token });
    expectStatus(me, 200, 'GET /api/auth/me after profile update');
    expectEqual(me.json.user.displayName, 'QA 新名字', 'persisted displayName', me);
    owner.user = me.json.user;
  });

  await test('me/exchanges: status=completed filter for owner works', async () => {
    const owner = needUser('owner');
    const res = await api('GET', '/api/me/exchanges?box=incoming&status=completed', { token: owner.token });
    expectStatus(res, 200, 'GET /api/me/exchanges?box=incoming&status=completed');
    const items = expectArray(res.json.items, 'completed filter items', res);
    assert(items.every((item) => item.status === 'completed'), 'status=completed 过滤返回了其它状态', res);
    assert(findById(items, needExchange('e6').id), 'completed 过滤缺少 e6', res);
  });
}

// ---------------------------------------------------------------------------
// Phase: edge cases
// ---------------------------------------------------------------------------

async function phaseEdge() {
  phase('Edge cases: 404 / invalid JSON / oversized body');

  await test('edge: GET /api/cards/:id for unknown id -> 404', async () => {
    const res = await api('GET', '/api/cards/c_qa_no_such_card');
    expectStatusSoftCode(res, 404, 'NOT_FOUND', 'unknown card detail');
  });

  await test('edge: GET /api/exchanges/:id for unknown id -> 404', async () => {
    const res = await api('GET', '/api/exchanges/e_qa_no_such_exchange', { token: needUser('owner').token });
    expectStatusSoftCode(res, 404, 'NOT_FOUND', 'unknown exchange');
  });

  await test('edge: unknown /api endpoint -> 404', async () => {
    const res = await api('GET', '/api/qa-does-not-exist');
    expectStatusSoftCode(res, 404, 'NOT_FOUND', 'unknown api endpoint');
  });

  await test('edge: unknown admin user update -> 404', async () => {
    const res = await api('PUT', '/api/admin/users/u_qa_no_such_user', { token: needUser('admin').token, body: { displayName: 'x' } });
    expectStatusSoftCode(res, 404, 'NOT_FOUND', 'admin update unknown user');
  });

  await test('edge: malformed JSON body -> 400', async () => {
    const res = await api('POST', '/api/auth/login', {
      rawBody: '{"identifier": "broken", "password": ',
      headers: { 'content-type': 'application/json' },
    });
    expectStatus(res, 400, 'POST /api/auth/login with invalid JSON');
    const code = res.json && res.json.error && res.json.error.code;
    if (code !== 'VALIDATION') softNote(`非法 JSON 的 error.code=${snip(code)}（期望 VALIDATION）`);
  });

  await test('edge: oversized JSON body (30MB) -> 413 PAYLOAD_TOO_LARGE', async () => {
    const huge = JSON.stringify({ identifier: 'a'.repeat(30 * 1024 * 1024), password: 'x' });
    const res = await api('POST', '/api/auth/login', {
      rawBody: huge,
      headers: { 'content-type': 'application/json' },
      timeout: 30000,
    });
    expectStatus(res, 413, '30MB body');
    expectError(res, 413, 'PAYLOAD_TOO_LARGE', '30MB body');
  });

  await test('edge: server still healthy after oversized request', async () => {
    const res = await api('GET', '/api/health');
    expectStatus(res, 200, 'GET /api/health after 30MB request');
    expectEqual(res.json.ok, true, 'health.ok after oversized request', res);
  });

  await test('security: plaintext passwords never appear in any response body', async () => {
    const leaks = [];
    for (const record of responseLog) {
      for (const secret of secrets) {
        if (secret && record.text.includes(secret)) leaks.push(`${record.label} (secret=${snip(secret, 24)})`);
      }
    }
    expectEqual(leaks.length, 0, `发现密码泄露: ${leaks.join('; ')}`);
  });
}

// ---------------------------------------------------------------------------
// Fixture setup (always runs, even with --filter)
// ---------------------------------------------------------------------------

async function prepareFixtures() {
  await setup('register fixture users u2/u3/u4', async () => {
    await registerUser('u2', {
      username: `qa_u2_${RUN_ID}`,
      email: `qa_u2_${RUN_ID}@qalink.test`,
      password: 'QaPass123!',
    });
    await registerUser('u3', {
      username: `qa_u3_${RUN_ID}`,
      email: `qa_u3_${RUN_ID}@qalink.test`,
      password: 'QaPass123!',
      displayName: 'QA U3',
      callSign: 'QA0U3',
    });
    await registerUser('u4', {
      username: `qa_u4_${RUN_ID}`,
      email: `qa_u4_${RUN_ID}@qalink.test`,
      password: 'QaPass123!',
      displayName: 'QA U4',
      callSign: 'QA0U4',
    });
  });

  await setup(`login seed admin account (${ADMIN_USERNAME}/${ADMIN_PASSWORD})`, async () => {
    const res = await login(ADMIN_USERNAME, ADMIN_PASSWORD);
    if (res.status !== 200) {
      throw new CheckError(
        `种子管理员登录失败: 期望 200，实际 ${res.status}${resInfo(res)}（docs/CONTRACT.md §6.4 规定种子账号 admin/Admin@123456）`,
      );
    }
    users.admin = {
      id: res.json.user.id,
      username: res.json.user.username,
      email: res.json.user.email,
      password: ADMIN_PASSWORD,
      token: res.json.token,
      user: res.json.user,
    };
  });
}

// ---------------------------------------------------------------------------
// Runner / summary
// ---------------------------------------------------------------------------

function summarize() {
  const passed = checks.filter((check) => check.ok);
  const failed = checks.filter((check) => !check.ok);
  const durationS = ((Date.now() - START_TS) / 1000).toFixed(1);

  if (softNotes.length) {
    console.log(`\n${paint('33', `SOFT NOTES (${softNotes.length}) — 契约建议项，不计入失败:`)}`);
    for (const note of softNotes) console.log(`  - ${note}`);
  }
  if (failed.length) {
    console.log(`\n${paint('31', `FAILURES (${failed.length} / ${checks.length}):`)}`);
    failed.forEach((check, index) => {
      console.log(`\n  ${index + 1}) ${check.name}`);
      console.log(indent(check.error.message, '     '));
    });
  }
  const setupPart = setupFailureCount ? `, ${setupFailureCount} setup failure(s)` : '';
  const verdict = failed.length === 0 && setupFailureCount === 0;
  console.log(
    `\n${verdict ? paint('32', 'RESULT: PASS') : paint('31', 'RESULT: FAIL')} — ` +
      `${passed.length} passed, ${failed.length} failed${setupPart}, ${checks.length} checks, ${durationS}s`,
  );
  return verdict;
}

async function runPhases() {
  await prepareFixtures();
  await phaseStatic();
  await phaseSeedData();
  await phaseRegister();
  await phaseLogin();
  await phaseCards();
  await phaseAdminModeration();
  await phaseLikes();
  await phaseExchangesApprove();
  await phaseExchangesLifecycle();
  await phaseShare();
  await phaseAdminPanel();
  await phaseMe();
  await phaseEdge();
}

async function main() {
  console.log(paint('1', 'QSLink smoke test'));
  console.log(`  node:    ${process.version}`);
  console.log(`  project: ${ROOT}`);
  console.log(`  run id:  ${RUN_ID}${FILTER ? `\n  filter:  "${FILTER}"` : ''}`);

  try {
    await startServer();
  } catch (err) {
    console.error(paint('31', '\n无法启动隔离服务实例:'));
    console.error(err && err.message ? err.message : String(err));
    process.exitCode = 2;
    return;
  }

  console.log(`  server:  ${BASE} (pid ${server.pid}, port ${portUsed})`);
  console.log(`  data:    ${KEEP_DATA ? `${dataDir} (kept)` : dataDir}`);

  try {
    await test('short tokens: collision, concurrency, migration and legacy protection', testShortTokens);
    await test('exchange card choice: permissions, selection and confirmation', testExchangeCardChoice);
    await test('card stock: migration, ownership, persistence and concurrent approvals', testCardStock);
    await test('announcements: permissions, validation, publishing, pagination and persistence', testAnnouncements);
    await test('logbook: TQ8 signatures, LoTW download, privacy, deduplication and persistence', testLogbook);
    await test('exchange contact logs: manual selection, snapshots and privacy', testExchangeContactLog);
    await runPhases();
  } finally {
    await stopServer();
  }

  const ok = summarize();
  process.exitCode = ok ? 0 : 1;
}

main().catch(async (err) => {
  console.error(paint('31', '\nUNEXPECTED ERROR:'));
  console.error(err && err.stack ? err.stack : String(err));
  await stopServer();
  process.exitCode = 1;
});
