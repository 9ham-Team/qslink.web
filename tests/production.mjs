import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { readConfig } = require('../server/lib/config');
const { Database } = require('../server/lib/db');
const { hashPassword } = require('../server/lib/auth');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const credentials = { username: 'operator', email: 'operator@example.test', password: 'Unique-Production-42!' };

async function temp(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qsl-production-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return dir;
}
function env(dir, overrides = {}) {
  return { ...process.env, NODE_ENV: 'production', QSL_SEED_DEMO: 'false', QSL_TRUST_PROXY: 'false',
    QSL_PUBLIC_ORIGIN: 'https://qsl.example.test', QSL_DATA_DIR: dir, QSL_HOST: '127.0.0.1', ...overrides };
}
function processFor(entry, config, input = '') {
  const child = spawn(process.execPath, [entry], { cwd: ROOT, env: config, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const ended = once(child, 'exit').then(([code]) => ({ code, output }));
  child.stdin.end(input);
  return { child, ended, logs: () => output };
}
async function init(dir, data = credentials) {
  return processFor('server/init-admin.js', env(dir), JSON.stringify(data)).ended;
}
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function start(t, dir, overrides = {}) {
  const port = await freePort();
  const proc = processFor('server/server.js', env(dir, { QSL_PORT: String(port), ...overrides }));
  const base = `http://127.0.0.1:${port}`;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    proc.child.kill();
    await proc.ended;
    // Windows terminates processes without delivering Node SIGTERM handlers.
    if (process.platform === 'win32') await fs.unlink(path.join(dir, 'db.json.lock')).catch(() => {});
  };
  t.after(stop);
  for (let attempt = 0; attempt < 150; attempt++) {
    if (proc.child.exitCode !== null) throw new Error(proc.logs());
    try {
      const res = await fetch(base + '/api/health');
      if (res.ok) return { ...proc, base, stop };
    } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error('Server did not become ready: ' + proc.logs());
}
async function request(base, route, { token, body, headers = {}, method = 'GET' } = {}) {
  return fetch(base + route, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
}

test('production config fails closed for missing paths/origin/demo flag and insecure origins', () => {
  const valid = { NODE_ENV: 'production', QSL_DATA_DIR: os.tmpdir(), QSL_PUBLIC_ORIGIN: 'https://qsl.example.test' };
  for (const config of [
    { NODE_ENV: 'production' }, { ...valid, QSL_DATA_DIR: 'relative' },
    { ...valid, QSL_SEED_DEMO: 'true' }, { ...valid, QSL_PUBLIC_ORIGIN: '' },
    { ...valid, QSL_PUBLIC_ORIGIN: 'http://qsl.example.test' },
    { ...valid, QSL_PUBLIC_ORIGIN: 'https://user:password@qsl.example.test' },
    { ...valid, QSL_PUBLIC_ORIGIN: 'https://qsl.example.test/path' },
    { ...valid, QSL_SEED_DEMO: 'tru' }, { ...valid, QSL_PORT: 'invalid' },
  ]) assert.throws(() => readConfig(config));
  assert.equal(readConfig(valid).demo, false);
});

test('default development startup has no implicit demo accounts', async t => {
  const dir = await temp(t);
  const app = await start(t, dir, { NODE_ENV: 'development', QSL_PUBLIC_ORIGIN: '' });
  assert.deepEqual(await (await fetch(app.base + '/api/config')).json(), { demo: false, demoAccounts: [] });
  const db = JSON.parse(await fs.readFile(path.join(dir, 'db.json'), 'utf8'));
  assert.equal(db.users.length, 0);
  assert.equal(db.cards.length, 0);
});

test('production requires an administrator and rejects legacy demo databases without altering them', async t => {
  const dir = await temp(t);
  let result = await processFor('server/server.js', env(dir)).ended;
  assert.notEqual(result.code, 0);
  assert.match(result.output, /缺少管理员/);
  await assert.rejects(fs.access(path.join(dir, 'db.json')));
  const db = new Database(path.join(dir, 'db.json'));
  db.data.users.push({ username: 'admin', role: 'admin', status: 'active', passwordHash: hashPassword('Admin@123456') });
  await db.save();
  const original = await fs.readFile(db.file, 'utf8');
  result = await processFor('server/server.js', env(dir)).ended;
  assert.match(result.output, /演示数据或默认密码/);
  assert.equal(await fs.readFile(db.file, 'utf8'), original);
  db.data.users = [];
  db.data.demo = true;
  await db.save();
  assert.notEqual((await init(dir)).code, 0);
});

test('offline initialization is idempotent, never stores plaintext, and production has no demo access', async t => {
  const dir = await temp(t);
  const result = await init(dir);
  assert.equal(result.code, 0, result.output);
  assert.ok(!result.output.includes(credentials.password));
  const original = await fs.readFile(path.join(dir, 'db.json'), 'utf8');
  assert.ok(!original.includes(credentials.password));
  assert.equal(JSON.parse(original).users.length, 1);
  assert.notEqual((await init(dir)).code, 0);
  assert.equal(await fs.readFile(path.join(dir, 'db.json'), 'utf8'), original);

  const app = await start(t, dir);
  assert.deepEqual(await (await fetch(app.base + '/api/config')).json(), { demo: false, demoAccounts: [] });
  assert.equal((await (await fetch(app.base + '/api/cards')).json()).total, 0);
  for (const identifier of ['admin', 'bg7mom']) {
    assert.equal((await request(app.base, '/api/auth/login', { method: 'POST', body: { identifier, password: 'Admin@123456' } })).status, 401);
  }
  const login = await request(app.base, '/api/auth/login', { method: 'POST', body: { identifier: credentials.username, password: credentials.password } });
  const { token, user } = await login.json();
  assert.equal(user.role, 'admin');
  const html = await fetch(app.base + '/login');
  assert.match(html.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(html.headers.get('x-frame-options'), 'DENY');
  const loginScript = await (await fetch(app.base + '/js/pages/login.js')).text();
  assert.ok(!/Admin@123456|Demo@123456|bg7mom/.test(loginScript));
  assert.ok(!/Admin@123456|Demo@123456|Unique-Production/.test(app.logs()));
  assert.equal((await request(app.base, '/api/auth/logout', { token, method: 'POST', body: {}, headers: { Origin: 'https://evil.example' } })).status, 403);

  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
  const cardRes = await request(app.base, '/api/cards', { token, method: 'POST', body: { title: 'Production card', ratio: { w: 3, h: 2 }, frontImage: svg } });
  assert.equal(cardRes.status, 201);
  const { card } = await cardRes.json();
  const upload = await fetch(app.base + card.frontImage);
  assert.match(upload.headers.get('content-security-policy'), /sandbox/);
  const shared = await (await request(app.base, `/api/cards/${card.id}/share`, { token, headers: { 'X-Forwarded-Proto': 'http' } })).json();
  assert.ok(shared.url.startsWith('https://qsl.example.test/share/'));
  assert.notEqual((await init(dir)).code, 0, 'live data directory must be locked');
  const second = await processFor('server/server.js', env(dir, { QSL_PORT: String(await freePort()) })).ended;
  assert.match(second.output, /数据目录已锁定/);
  await app.stop();
  const restarted = await start(t, dir);
  const persisted = await request(restarted.base, '/api/auth/me', { token });
  assert.equal(persisted.status, 200);
});

test('production throttles repeated login attempts, including spoofed forwarding headers', async t => {
  const dir = await temp(t);
  assert.equal((await init(dir)).code, 0);
  const app = await start(t, dir);
  let res;
  for (let attempt = 0; attempt < 16; attempt++) {
    res = await request(app.base, '/api/auth/login', { method: 'POST', body: { identifier: credentials.username, password: 'incorrect' },
      headers: { 'X-Real-IP': `203.0.113.${attempt + 1}` } });
  }
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get('retry-after')) > 0);
  assert.equal((await fetch(app.base + '/api/health')).status, 200);
});

test('database writes fail visibly and retain the last good file', async t => {
  const dir = await temp(t);
  const file = path.join(dir, 'db.json');
  const db = new Database(file);
  await db.save();
  const original = await fs.readFile(file, 'utf8');
  // A missing parent simulates write failure without relying on root/OS chmod behavior.
  db.file = path.join(dir, 'missing', 'db.json');
  await assert.rejects(db.save());
  assert.ok(db.writeError);
  assert.equal(await fs.readFile(file, 'utf8'), original);
  db.file = file;
  await assert.rejects(db.save(), 'storage stays failed until operator restarts');
  const blocked = path.join(dir, 'blocked');
  await fs.mkdir(blocked);
  await fs.writeFile(path.join(blocked, 'sentinel'), 'keep');
  const renameFailure = new Database(blocked);
  await assert.rejects(renameFailure.save());
  assert.equal(await fs.readFile(path.join(blocked, 'sentinel'), 'utf8'), 'keep');
});

test('production frontend ignores devToken and does not render demo login UI', async () => {
  const source = await fs.readFile(path.join(ROOT, 'public/js/core.js'), 'utf8');
  const context = { console, URLSearchParams, Intl, Map, Set, location: { search: '?devToken=attacker', pathname: '/', hash: '' },
    history: { replaceState() {} }, window: {}, document: {} };
  vm.createContext(context);
  vm.runInContext(source, context);
  const QSL = context.window.QSL;
  let tokenWasSet = false;
  QSL.api = { config: async () => ({ demo: false, demoAccounts: [] }), setToken: () => { tokenWasSet = true; }, token: () => null };
  await QSL.boot();
  assert.equal(tokenWasSet, false);
  const loginSource = await fs.readFile(path.join(ROOT, 'public/js/pages/login.js'), 'utf8');
  const loginContext = { window: { QSL: { state: { config: { demo: false } }, registerPage: (name, page) => { loginContext.page = page; },
    safeNext: () => null, escapeHtml: text => String(text ?? ''), icon: () => '' } } };
  vm.createContext(loginContext);
  vm.runInContext(loginSource, loginContext);
  const container = { innerHTML: '', querySelector() { throw new Error('render captured'); } };
  assert.throws(() => loginContext.page.render(container, {}), /render captured/);
  assert.ok(!container.innerHTML.includes('data-demo-user'));
  assert.ok(!container.innerHTML.includes('演示账号'));
});
