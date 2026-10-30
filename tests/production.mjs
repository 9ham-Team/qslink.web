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
import { fixture } from './helpers/database.mjs';
import { withLegalConsent } from './helpers/legal.mjs';
import './profile-address.mjs';
import './review-webhook.mjs';
import { testExchangeCardChoice } from './exchange-card-choice.mjs';
test('exchange card choice: privacy, validation, empty confirmation and persistence', testExchangeCardChoice);
import './poster-palette.mjs';
import './qr.mjs';
import { testShortTokens } from './short-tokens.mjs';
import { testAnnouncements } from './announcements.mjs';
import { testLogbook } from './logbook.mjs';
import { testExchangeContactLog } from './exchange-contact-log.mjs';
test('exchange contact logs: manual selection, snapshots and privacy', testExchangeContactLog);
test('logbook: TQ8 signatures, private persistence, LoTW transport and deduplication', testLogbook);
test('short tokens: collision, concurrent allocation, migration and legacy protection', testShortTokens);
test('announcements: permissions, validation, publishing, pagination and persistence', testAnnouncements);

const require = createRequire(import.meta.url);
const sharp = require('sharp');

test('responsive upload variants resize, cache, deduplicate and preserve original/vector files', async t => {
  const dir = await temp(t);
  assert.equal((await init(dir)).code, 0);
  const app = await start(t, dir);
  const uploads = path.join(dir, 'uploads');
  const original = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#18b59b' } }).png().toBuffer();
  await fs.writeFile(path.join(uploads, 'responsive.png'), original);
  const url = app.base + '/uploads/responsive.png';
  assert.deepEqual(Buffer.from(await (await fetch(url)).arrayBuffer()), original);
  const responses = await Promise.all(Array.from({ length: 8 }, () => fetch(url + '?w=321')));
  const bodies = await Promise.all(responses.map(r => r.arrayBuffer().then(b => Buffer.from(b))));
  responses.forEach(r => { assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/webp'); assert.match(r.headers.get('cache-control'), /immutable/); });
  bodies.forEach(b => assert.deepEqual(b, bodies[0]));
  const metadata = await sharp(bodies[0]).metadata();
  assert.equal(metadata.width, 480);
  assert.equal(metadata.height, 320);
  assert.ok(bodies[0].length < original.length);
  const files = await fs.readdir(path.join(dir, 'image-cache'));
  assert.equal(files.length, 1, 'concurrent requests produce one reusable cache file');
  const cached = path.join(dir, 'image-cache', files[0]);
  const before = (await fs.stat(cached)).mtimeMs;
  assert.deepEqual(Buffer.from(await (await fetch(url + '?w=480')).arrayBuffer()), bodies[0]);
  assert.equal((await fs.stat(cached)).mtimeMs, before, 'warm request does not regenerate');
  const head = await fetch(url + '?w=480', { method: 'HEAD' });
  assert.equal(head.headers.get('content-length'), String(bodies[0].length));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  for (const width of ['', '-1', '0', 'NaN', '3.5', '2561', '999999999999'])
    assert.equal((await fetch(url + '?w=' + width)).status, 400);
  assert.equal((await fetch(app.base + '/uploads/missing.png?w=320')).status, 404);
  await fs.writeFile(path.join(uploads, 'tiny.png'), await sharp({ create: { width: 32, height: 16, channels: 3, background: '#fff' } }).png().toBuffer());
  assert.equal((await sharp(Buffer.from(await (await fetch(app.base + '/uploads/tiny.png?w=1280')).arrayBuffer())).metadata()).width, 32);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';
  await fs.writeFile(path.join(uploads, 'vector.svg'), svg);
  const vector = await fetch(app.base + '/uploads/vector.svg?w=320');
  assert.match(vector.headers.get('content-type'), /svg/);
  assert.match(vector.headers.get('content-security-policy'), /sandbox/);
  assert.equal(await vector.text(), svg);
  await fs.writeFile(path.join(uploads, 'legacy.png'), 'legacy invalid raster');
  const legacy = await fetch(app.base + '/uploads/legacy.png?w=320');
  assert.equal(legacy.status, 200);
  assert.equal(legacy.headers.get('cache-control'), 'no-cache');
  assert.equal(await legacy.text(), 'legacy invalid raster');
  assert.deepEqual(await fs.readFile(path.join(uploads, 'responsive.png')), original);
});
const { readConfig } = require('../server/lib/config');
const { Database } = require('../server/lib/db');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const credentials = { username: 'operator', email: 'operator@example.test', password: 'Unique-Production-42!' };
const databases = new Map();

test('public spaces preserve nine-digit UIDs, paginate approved cards and protect private data', async t => {
  const dir = await temp(t);
  assert.equal((await init(dir)).code, 0);
  const app = await start(t, dir);
  const db = databases.get(dir).db;
  const body = await withCode(app, { username: 'spaceuser', email: 'space@example.test', password: 'Space-Password-42!' });
  const registration = await request(app.base, '/api/auth/register', { method: 'POST', body: { ...body, uid: '000000000' } });
  assert.equal(registration.status, 201);
  const { user, token } = await registration.json();
  assert.match(user.uid, /^[0-9]{9}$/);
  assert.notEqual(user.uid, '000000000');
  const uid = user.uid;
  const admin = await db.transaction(unit => unit.data.users.find(u => u.role === 'admin'));
  assert.match(admin.uid, /^[0-9]{9}$/);
  assert.notEqual(uid, admin.uid);
  await request(app.base, '/api/me/profile', { token, method: 'PUT', body: { bio: 'Hello <script>world</script>', uid: '999999999' } });
  assert.equal((await (await request(app.base, '/api/auth/me', { token })).json()).user.uid, uid);
  const cardBody = { title: 'Space card', ratio: { w: 3, h: 2 }, frontImage: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64') };
  const created = await request(app.base, '/api/cards', { token, method: 'POST', body: cardBody });
  assert.equal(created.status, 201);
  const { card } = await created.json();
  const path = '/api/public/spaces/' + uid;
  const pending = await (await request(app.base, path, { token })).json();
  assert.equal(pending.cards.total, 0, 'owner also sees only approved cards');
  await db.transaction(unit => {
    const saved = unit.find('cards', c => c.id === card.id);
    saved.status = 'approved';
    for (let i = 0; i < 13; i++) unit.insert('cards', { ...saved, id: 'space_' + i, shareToken: 'space_token_' + i, shortToken: undefined });
  }, { write: true });
  const guest = await (await request(app.base, path + '?limit=12')).json();
  const own = await (await request(app.base, path + '?limit=12', { token })).json();
  assert.deepEqual(guest.user, own.user);
  assert.equal(guest.user.uid, uid);
  assert.equal(guest.user.stats.cards, 14);
  assert.equal(guest.cards.items.length, 12);
  assert.equal(guest.cards.pages, 2);
  assert.equal(guest.url, 'https://qsl.example.test/space/' + uid);
  for (const field of ['email', 'address', 'passwordHash', 'legalConsent', 'status']) assert.equal(guest.user[field], undefined);
  assert.equal(guest.cards.items[0].owner.uid, uid);
  const second = await (await request(app.base, path + '?page=2&limit=12')).json();
  assert.equal(second.cards.items.length, 2);
  assert.ok(second.cards.items.every(c => !guest.cards.items.some(first => first.id === c.id)));
  assert.equal((await fetch(app.base + '/space/' + uid)).status, 200);
  for (const bad of ['000000000', '1', '1234567890', 'abcdefghi']) assert.equal((await request(app.base, '/api/public/spaces/' + bad)).status, 404);
  await app.stop();
  const restarted = await start(t, dir);
  assert.equal((await (await request(restarted.base, path)).json()).user.uid, uid);
  await db.transaction(unit => { unit.find('users', u => u.id === user.id).status = 'banned'; }, { write: true });
  assert.equal((await request(restarted.base, path)).status, 404);
});

test('UID migration backfills existing users and enforces uniqueness and format', async t => {
  const dir = await temp(t);
  assert.equal((await init(dir)).code, 0);
  const { db, databaseSchema } = databases.get(dir);
  // Recreate the pre-005 column layout in this isolated fixture only.
  await db.pool.query(`ALTER TABLE "${databaseSchema}".users DROP COLUMN uid`);
  await db.pool.query(`DELETE FROM "${databaseSchema}".schema_migrations WHERE version=5`);
  await db.migrate();
  const before = await db.transaction(unit => unit.data.users);
  assert.ok(before.every(user => /^[0-9]{9}$/.test(user.uid) && user.uid !== '000000000'));
  await db.migrate();
  assert.deepEqual(await db.transaction(unit => unit.data.users), before);
  for (const uid of ['000000000', '123', '1234567890', 'abcdefghi']) {
    await assert.rejects(db.transaction(unit => { unit.data.users[0].uid = uid; }, { write: true }), err => err.status === 400);
  }
  await assert.rejects(db.transaction(unit => { unit.insert('users', { ...unit.data.users[0], id: 'duplicate_uid', username: 'different', email: 'different@example.test' }); }, { write: true }), err => err.status === 409);
});

test('legal acceptance: explicit version, persistence, content authorization and public pages', async (t) => {
  const dir = await temp(t);
  assert.equal((await init(dir)).code, 0);
  const app = await start(t, dir);
  for (const page of ['terms.html', 'privacy.html', 'agpl-3.0.txt']) {
    const res = await fetch(app.base + '/legal/' + page);
    assert.equal(res.status, 200);
    assert.match(await res.text(), page.endsWith('.txt') ? /GNU AFFERO GENERAL PUBLIC LICENSE/ : /QSLink/);
  }
  assert.equal((await fetch(app.base + '/legal/software.html')).status, 404);
  const body = await withCode(app, { username: 'legaluser', email: 'legal@example.test', password: 'Legal-Password-42!' });
  for (const patch of [{ acceptTerms: undefined }, { acceptTerms: false }, { acceptTerms: 'true' }, { termsVersion: 'old' }]) {
    const rejected = await request(app.base, '/api/auth/register', { method: 'POST', body: { ...body, ...patch } });
    assert.equal(rejected.status, 400);
    assert.ok((await rejected.json()).error.fields.legalConsent);
  }
  const registered = await request(app.base, '/api/auth/register', { method: 'POST', body });
  assert.equal(registered.status, 201, 'refused consent does not consume email code');
  const { token, user } = await registered.json();
  const db = databases.get(dir).db;
  const saved = await db.transaction(unit => unit.find('users', item => item.id === user.id));
  assert.equal(saved.legalConsent.version, '2026-10-25');
  assert.ok(Number.isFinite(Date.parse(saved.legalConsent.acceptedAt)));
  assert.equal(user.legalConsent, undefined);
  assert.equal(await db.transaction(unit => unit.find('users', item => item.username === credentials.username).legalConsent), null);
  const cardBody = { title: 'Authorized', ratio: { w: 3, h: 2 }, frontImage: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64') };
  const rejected = await request(app.base, '/api/cards', { token, method: 'POST', body: { ...cardBody, acceptContentLicense: false } });
  assert.equal(rejected.status, 400);
  assert.equal(await db.transaction(unit => unit.data.cards.length), 0);
  const created = await request(app.base, '/api/cards', { token, method: 'POST', body: cardBody });
  assert.equal(created.status, 201);
  const { card } = await created.json();
  assert.equal(card.contentConsent, undefined);
  const record = await db.transaction(unit => unit.find('cards', item => item.id === card.id));
  assert.equal(record.contentConsent.userId, user.id);
  assert.equal(record.contentConsent.version, '2026-10-25');
  assert.equal(record.contentConsent.contentLicense, true);
  const edit = await request(app.base, '/api/cards/' + card.id, { token, method: 'PUT', body: { title: 'Changed', acceptContentLicense: undefined } });
  assert.equal(edit.status, 400);
  assert.equal((await db.transaction(unit => unit.find('cards', item => item.id === card.id))).title, 'Authorized');
  const login = await request(app.base, '/api/auth/login', { method: 'POST', body: { identifier: credentials.username, password: credentials.password } });
  const admin = await login.json();
  const moderated = await request(app.base, '/api/cards/' + card.id, { token: admin.token, method: 'PUT', body: { status: 'approved', acceptTerms: undefined, acceptContentLicense: undefined } });
  assert.equal(moderated.status, 200);
  assert.deepEqual((await db.transaction(unit => unit.find('cards', item => item.id === card.id))).contentConsent, record.contentConsent);
});

async function temp(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qsl-production-'));
  const database = await fixture();
  databases.set(dir, database);
  t.after(() => database.cleanup());
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return dir;
}
function env(dir, overrides = {}) {
  return { ...process.env, NODE_ENV: 'production', QSL_SEED_DEMO: 'false', QSL_TRUST_PROXY: 'false',
    QSL_PUBLIC_ORIGIN: 'https://qsl.example.test', QSL_DATA_DIR: dir, QSL_HOST: '127.0.0.1',
    DATABASE_URL: databases.get(dir).databaseUrl, QSL_DB_SCHEMA: databases.get(dir).databaseSchema, ...overrides };
}
function processFor(entry, config, input = '') {
  const child = spawn(process.execPath, [entry], { cwd: ROOT, env: config, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
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
  let port;
  do {
    const server = net.createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
    await new Promise(resolve => server.close(resolve));
  } while (port <= 10080); // Fetch's restricted ports are all at or below 10080.
  return port;
}
async function start(t, dir, overrides = {}) {
  const port = await freePort();
  const proc = processFor('tests/helpers/mail-server.cjs', env(dir, { QSL_PORT: String(port), ...overrides }));
  const codes = new Map();
  const exchangeMails = [];
  const cardReviewMails = [];
  proc.child.on('message', message => {
    if (message.kind === 'exchangeMail') exchangeMails.push(message);
    else if (message.kind === 'cardReviewMail') cardReviewMails.push(message);
    else codes.set(message.email, message.code);
  });
  const base = `http://127.0.0.1:${port}`;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    proc.child.kill();
    await proc.ended;
  };
  t.after(stop);
  for (let attempt = 0; attempt < 150; attempt++) {
    if (proc.child.exitCode !== null) throw new Error(proc.logs());
    try {
      const res = await fetch(base + '/api/health');
      if (res.ok) return { ...proc, base, stop, codes, exchangeMails, cardReviewMails };
    } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error('Server did not become ready: ' + proc.logs());
}
async function request(base, route, { token, body, headers = {}, method = 'GET' } = {}) {
  body = withLegalConsent(method, route, body);
  return fetch(base + route, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
}

async function withCode(app, body) {
  assert.equal((await request(app.base, '/api/auth/email-code', { method: 'POST', body: { email: body.email } })).status, 200);
  for (let i = 0; i < 100 && !app.codes.has(body.email); i++) await new Promise(resolve => setTimeout(resolve, 10));
  return { ...body, emailCode: app.codes.get(body.email) };
}

test('email codes persist attempts, expire, consume once, throttle across processes and fail closed', async t => {
  const dir = await temp(t);
  assert.equal((await init(dir)).code, 0);
  const a = await start(t, dir), b = await start(t, dir);
  const db = databases.get(dir).db;
  const payload = { username: 'verified', email: 'verified@example.test', password: 'Verified-Password-42!' };
  const register = (app, body) => request(app.base, '/api/auth/register', { method: 'POST', body });
  assert.equal((await register(a, payload)).status, 400);
  for (const email of ['abc', 'a@b.c', 'a b@c.test', 'a@@c.test'])
    assert.equal((await request(a.base, '/api/auth/email-code', { method: 'POST', body: { email } })).status, 400);
  const verified = await withCode(a, payload);
  assert.match(verified.emailCode, /^\d{6}$/);
  const row = await db.transaction(unit => unit.data.emailVerifications[0]);
  assert.ok(row.codeHash.startsWith('scrypt$'));
  assert.notEqual(row.codeHash, verified.emailCode);
  assert.equal(Date.parse(row.expiresAt) - Date.parse(row.sentAt), 1800000);
  assert.equal((await request(b.base, '/api/auth/email-code', { method: 'POST', body: { email: payload.email.toUpperCase() } })).status, 429);
  const wrong = verified.emailCode === '000000' ? '000001' : '000000';
  for (let i = 0; i < 5; i++) assert.equal((await register(i % 2 ? a : b, { ...payload, emailCode: wrong })).status, 400);
  assert.equal(await db.transaction(unit => unit.data.emailVerifications[0].attempts), 5);
  assert.equal((await register(a, verified)).status, 400);
  await db.transaction(unit => { unit.data.emailVerifications[0].sentAt = new Date(Date.now() - 61000).toISOString(); }, { write: true });
  const renewed = await withCode(b, payload);
  assert.equal((await register(a, { ...renewed, email: 'other@example.test' })).status, 400);
  await db.transaction(unit => { unit.data.emailVerifications[0].expiresAt = new Date(Date.now() - 1).toISOString(); }, { write: true });
  assert.equal((await register(a, renewed)).status, 400);
  await db.transaction(unit => { unit.data.emailVerifications[0].expiresAt = new Date(Date.now() + 1800000).toISOString(); }, { write: true });
  const results = await Promise.all([a, b].map((app, i) => register(app, { ...renewed, username: 'verified' + i })));
  assert.deepEqual(results.map(res => res.status).sort(), [201, 409]);
  assert.equal(await db.transaction(unit => unit.data.emailVerifications[0].status), 'consumed');
  const { sendCode } = require('../server/lib/email-verification');
  const context = { db, req: { socket: { remoteAddress: '192.0.2.1' }, headers: {} }, res: { setHeader() {} }, body: { email: 'fail@example.test' } };
  await assert.rejects(sendCode({ ...context, config: {} }), err => err.status === 503);
  await assert.rejects(sendCode({ ...context, config: { sendMail: async () => {
    // This transaction would deadlock if the network operation held the write lock.
    await db.transaction(() => {}, { write: true });
    throw new Error('provider secret details');
  } } }), err => err.status === 503 && !err.message.includes('provider'));
  assert.equal(await db.transaction(unit => unit.find('emailVerifications', item => item.id === 'fail@example.test').codeHash), null);
  await db.transaction(unit => unit.insert('mailQuotas', { id: 'email:quota@example.test', count: 5, windowAt: new Date().toISOString() }), { write: true });
  await assert.rejects(sendCode({ ...context, body: { email: 'quota@example.test' }, config: { sendMail: async () => assert.fail('must not send') } }), err => err.status === 429);
  for (const settings of [{ QSL_MAIL_ENDPOINT: 'attacker.test' }, { QSL_MAIL_REGION: 'invalid' }])
    assert.throws(() => readConfig({ DATABASE_URL: 'postgresql://localhost/test', ...settings }));
});

test('exchange mail uses escaped templates and the existing bounded Direct Mail transport', async () => {
  const DM = require('@alicloud/dm20151123');
  const { createMailTransport, createExchangeMailTransport, createCardReviewMailTransport, readMailConfig } = require('../server/lib/mail');
  assert.equal(createExchangeMailTransport(readMailConfig({})), null);
  assert.equal(createCardReviewMailTransport(readMailConfig({})), null);
  const original = DM.default.prototype.singleSendMailWithOptions;
  const sent = [];
  DM.default.prototype.singleSendMailWithOptions = async (message, options) => sent.push({ message, options });
  try {
    const config = readMailConfig({ QSL_MAIL_FROM: 'sender@example.test', ALIBABA_CLOUD_ACCESS_KEY_ID: 'test-only', ALIBABA_CLOUD_ACCESS_KEY_SECRET: 'test-only' });
    await createMailTransport(config)('new@example.test', '001234');
    await createExchangeMailTransport(config)('owner@example.test', {
      applicantName: '<img src=x onerror=alert(1)>', callSign: 'A&B', cardTitle: '<script>card</script>',
      url: 'https://qsl.example.test/dashboard/exchanges?box=incoming&status=pending',
    });
    assert.match(sent[0].message.htmlBody, /001234/);
    assert.match(sent[0].message.subject, /注册邮箱验证码/);
    const { message, options } = sent[1];
    assert.equal(message.toAddress, 'owner@example.test');
    assert.equal(message.subject, 'QSLink 收到新的换卡申请');
    assert.match(message.htmlBody, /&lt;img/);
    assert.match(message.htmlBody, /&lt;script&gt;card/);
    assert.match(message.htmlBody, /A&amp;B/);
    assert.match(message.htmlBody, /box=incoming&amp;status=pending/);
    assert.ok(!message.htmlBody.includes('<script>') && !message.htmlBody.includes('<img '));
    assert.match(message.textBody, /<script>card<\/script>/);
    assert.equal(options.autoretry, false);
    assert.equal(options.connectTimeout, 5000);
    assert.equal(options.readTimeout, 10000);
    for (const status of ['approved', 'rejected']) {
      await createExchangeMailTransport(config)('applicant@example.test', {
        status, ownerName: '<script>owner</script>', callSign: 'A&B', cardTitle: '<b>card</b>',
        url: 'https://qsl.example.test/dashboard/exchanges?box=outgoing&status=' + status,
      });
      const decision = sent.at(-1).message;
      assert.equal(decision.toAddress, 'applicant@example.test');
      assert.equal(decision.subject, status === 'approved' ? 'QSLink 换卡申请已被同意' : 'QSLink 换卡申请已被拒绝');
      assert.match(decision.htmlBody, /&lt;script&gt;owner/);
      assert.match(decision.htmlBody, /&lt;b&gt;card/);
      assert.match(decision.htmlBody, /box=outgoing&amp;status=/);
      assert.ok(!decision.htmlBody.includes('<script>'));
      assert.match(decision.textBody, /我发出的申请/);
    }
    await createCardReviewMailTransport(config)('cardowner@example.test', {
      cardTitle: '<script>Title</script> & test', url: 'https://qsl.example.test/card/c1',
    });
    const cardMail = sent.at(-1);
    assert.equal(cardMail.message.subject, 'QSLink 卡片审核已通过');
    assert.equal(cardMail.message.toAddress, 'cardowner@example.test');
    assert.match(cardMail.message.htmlBody, /&lt;script&gt;Title&lt;\/script&gt; &amp; test/);
    assert.ok(!cardMail.message.htmlBody.includes('<script>'));
    assert.match(cardMail.message.textBody, /已通过审核/);
    assert.match(cardMail.message.textBody, /https:\/\/qsl.example.test\/card\/c1/);
    assert.equal(cardMail.options.autoretry, false);
    assert.equal(cardMail.options.connectTimeout, 5000);
    assert.equal(cardMail.options.readTimeout, 10000);
  } finally { DM.default.prototype.singleSendMailWithOptions = original; }
});

test('new exchange mails only the owner after commit; rejection, duplicates and mail failures preserve semantics', async t => {
  const dir = await temp(t);
  assert.equal((await init(dir)).code, 0);
  const app = await start(t, dir);
  const db = databases.get(dir).db;
  const owner = await (await request(app.base, '/api/auth/login', { method: 'POST', body: { identifier: credentials.username, password: credentials.password } })).json();
  const applicant = await (await request(app.base, '/api/auth/register', { method: 'POST', body: await withCode(app, {
    username: 'mailapplicant', email: 'applicant@example.test', displayName: '申请人', callSign: 'QA0TEST', password: 'Applicant-Password-42!',
  }) })).json();
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64');
  const card = (await (await request(app.base, '/api/cards', { token: owner.token, method: 'POST', body: { title: '<b>Mail card</b>', ratio: { w: 3, h: 2 }, frontImage: svg } })).json()).card;
  const route = `/api/cards/${card.id}/exchanges`;
  const body = { contactName: 'Private contact', address: { name: 'Private recipient', line1: 'Private road', city: 'Private city', country: 'Test' }, message: 'Private message' };
  const apply = (target = app, token = applicant.token) => request(target.base, route, { token, method: 'POST', body });
  assert.equal((await apply(app, '')).status, 401);
  assert.equal((await apply(app, owner.token)).status, 400);
  assert.equal((await apply()).status, 400, 'unapproved cards cannot trigger mail');
  assert.equal(app.exchangeMails.length, 0);
  await request(app.base, `/api/admin/cards/${card.id}`, { token: owner.token, method: 'PUT', body: { status: 'approved' } });
  await db.transaction(unit => { unit.find('users', row => row.id === owner.user.id).status = 'banned'; }, { write: true });
  assert.equal((await apply()).status, 400);
  await db.transaction(unit => { unit.find('users', row => row.id === owner.user.id).status = 'active'; }, { write: true });
  const createExchange = require('../server/lib/api/exchanges').routes.find(route => route.pattern === '/api/cards/:cardId/exchanges').handler;
  await assert.rejects(db.transaction(async unit => {
    await createExchange({ db: unit, user: unit.find('users', row => row.id === applicant.user.id), params: { cardId: card.id }, body,
      config: { publicOrigin: 'https://qsl.example.test', sendExchangeMail: () => assert.fail('rolled-back requests must not send mail') } });
    throw new Error('simulate rollback');
  }, { write: true }), /simulate rollback/);
  assert.equal(await db.transaction(unit => unit.data.exchanges.length), 0);
  const results = await Promise.all([apply(), apply()]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  const exchange = (await results.find(result => result.status === 201).json()).exchange;
  for (let i = 0; i < 100 && !app.exchangeMails.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(app.exchangeMails.length, 1);
  const mail = app.exchangeMails[0];
  assert.equal(mail.email, credentials.email);
  assert.equal(mail.committed, true);
  assert.deepEqual(mail.notification, { exchangeId: exchange.id, applicantName: '申请人', callSign: 'QA0TEST', cardTitle: '<b>Mail card</b>', contactLogCount: 0, url: 'https://qsl.example.test/dashboard/exchanges?box=incoming&status=pending' });
  assert.ok(!JSON.stringify(mail).includes('Private'), 'addresses, contact names and private messages never enter mail');
  assert.ok(!JSON.stringify(exchange).includes(credentials.email), 'owner email is not added to the public response');
  assert.equal((await request(app.base, `/api/exchanges/${exchange.id}/cancel`, { token: applicant.token, method: 'POST', body: {} })).status, 200);
  const failing = await start(t, dir, { QSL_TEST_FAIL_EXCHANGE_MAIL: 'true' });
  const retry = await apply(failing);
  assert.equal(retry.status, 201, 'provider failure does not undo the committed request');
  assert.ok(!(await retry.text()).includes('provider-secret'));
  assert.equal(failing.exchangeMails.length, 1);
  assert.ok(!failing.logs().includes('provider-secret') && !failing.logs().includes(credentials.email));
  const saved = await db.transaction(unit => unit.data.exchanges.find(row => row.status === 'pending'));
  assert.ok(saved);
  assert.equal((await apply(failing)).status, 409, 'retry after a mail failure does not send a second notification');
  assert.equal(failing.exchangeMails.length, 1);
  await request(app.base, `/api/exchanges/${saved.id}/cancel`, { token: applicant.token, method: 'POST', body: {} });
  const unconfigured = await start(t, dir, { NODE_ENV: 'development', QSL_PUBLIC_ORIGIN: '' });
  assert.equal((await apply(unconfigured)).status, 201, 'missing public origin does not break exchanges or trust Host');
  assert.equal(unconfigured.exchangeMails.length, 0);
  await db.transaction(async unit => {
    unit.data.exchanges.filter(row => row.status === 'pending').forEach(row => { row.status = 'cancelled'; });
    const created = await createExchange({ db: unit, user: unit.find('users', row => row.id === applicant.user.id), params: { cardId: card.id }, body, config: { publicOrigin: 'https://qsl.example.test' } });
    assert.equal(created.status, 201);
    assert.equal(created.afterCommit, undefined, 'missing mail transport does not break application creation');
  }, { write: true });
});

test('approve/reject notify only the applicant after commit; repeated decisions and mail failures stay safe', async t => {
  const dir = await temp(t);
  assert.equal((await init(dir)).code, 0);
  const app = await start(t, dir);
  const db = databases.get(dir).db;
  const owner = await (await request(app.base, '/api/auth/login', { method: 'POST', body: { identifier: credentials.username, password: credentials.password } })).json();
  const applicant = await (await request(app.base, '/api/auth/register', { method: 'POST', body: await withCode(app, {
    username: 'decisionapplicant', email: 'decision@example.test', password: 'Applicant-Password-42!',
  }) })).json();
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64');
  const card = (await (await request(app.base, '/api/cards', { token: owner.token, method: 'POST', body: { title: 'Decision card', ratio: { w: 3, h: 2 }, frontImage: svg } })).json()).card;
  await request(app.base, `/api/admin/cards/${card.id}`, { token: owner.token, method: 'PUT', body: { status: 'approved' } });
  async function apply() {
    const response = await request(app.base, `/api/cards/${card.id}/exchanges`, { token: applicant.token, method: 'POST', body: {
      contactName: 'Private contact', address: { name: 'Private recipient', line1: 'Private road', city: 'Private city', country: 'Test' }, message: 'Private message',
    } });
    assert.equal(response.status, 201);
    return (await response.json()).exchange;
  }
  const decide = (id, status, target = app, token = owner.token, body = { confirmNoCards: true }) => request(target.base,
    `/api/exchanges/${id}/${status === 'approved' ? 'approve' : 'reject'}`, { token, method: 'POST', body });
  const complete = id => request(app.base, `/api/exchanges/${id}/complete`, { token: owner.token, method: 'POST', body: {} });
  async function waitMails(target, count) {
    for (let i = 0; i < 100 && target.exchangeMails.length < count; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(target.exchangeMails.length, count);
  }
  for (const status of ['approved', 'rejected']) {
    const exchange = await apply();
    const before = app.exchangeMails.length;
    assert.equal((await decide(exchange.id, status, app, '')).status, 401);
    assert.equal((await decide(exchange.id, status, app, applicant.token)).status, 403);
    if (status === 'rejected') assert.equal((await decide(exchange.id, status, app, owner.token, { reason: 'x'.repeat(10000) })).status, 400);
    const handler = require('../server/lib/api/exchanges').routes.find(route => route.pattern.endsWith(status === 'approved' ? '/approve' : '/reject')).handler;
    await assert.rejects(db.transaction(async unit => {
      await handler({ db: unit, user: unit.find('users', row => row.id === owner.user.id), params: { id: exchange.id }, body: { confirmNoCards: true },
        config: { publicOrigin: 'https://qsl.example.test', sendExchangeMail: () => assert.fail('rollback must not mail') } });
      throw new Error('decision rollback');
    }, { write: true }), /decision rollback/);
    assert.equal(await db.transaction(unit => unit.find('exchanges', row => row.id === exchange.id).status), 'pending');
    assert.equal(app.exchangeMails.length, before);
    const responses = await Promise.all([decide(exchange.id, status), decide(exchange.id, status)]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 400]);
    await waitMails(app, before + 1);
    const mail = app.exchangeMails.at(-1);
    assert.equal(mail.email, applicant.user.email);
    assert.equal(mail.committed, true);
    assert.equal(mail.notification.status, status);
    assert.equal(mail.notification.exchangeId, exchange.id);
    assert.equal(mail.notification.ownerName, owner.user.displayName);
    assert.equal(mail.notification.url, 'https://qsl.example.test/dashboard/exchanges?box=outgoing&status=' + status);
    assert.ok(!JSON.stringify(mail).includes('Private'));
    if (status === 'approved') assert.equal((await complete(exchange.id)).status, 200);
  }
  const failing = await start(t, dir, { QSL_TEST_FAIL_EXCHANGE_MAIL: 'true' });
  for (const [i, status] of ['approved', 'rejected'].entries()) {
    const exchange = await apply();
    const response = await decide(exchange.id, status, failing, owner.token, status === 'rejected' ? { reason: 'Private reason' } : { confirmNoCards: true });
    assert.equal(response.status, 200);
    assert.ok(!(await response.text()).includes('provider-secret'));
    assert.equal(await db.transaction(unit => unit.find('exchanges', row => row.id === exchange.id).status), status);
    await waitMails(failing, i + 1);
    assert.ok(!JSON.stringify(failing.exchangeMails.at(-1)).includes('Private reason'));
    assert.equal((await decide(exchange.id, status, failing)).status, 400);
    assert.equal(failing.exchangeMails.length, i + 1);
    if (status === 'approved') await complete(exchange.id);
  }
  const exchange = await apply();
  const before = app.exchangeMails.length;
  await db.transaction(unit => { unit.find('users', row => row.id === applicant.user.id).status = 'banned'; }, { write: true });
  assert.equal((await decide(exchange.id, 'approved')).status, 200);
  assert.equal(app.exchangeMails.length, before, 'banned recipients are not emailed');
  assert.ok(!failing.logs().includes('provider-secret') && !failing.logs().includes(applicant.user.email));
});

test('card approval mails the owner after commit through both routes, without duplicates or rollback leaks', async t => {
  const dir = await temp(t);
  assert.equal((await init(dir)).code, 0);
  const app = await start(t, dir);
  const db = databases.get(dir).db;
  const admin = await (await request(app.base, '/api/auth/login', { method: 'POST', body: { identifier: credentials.username, password: credentials.password } })).json();
  const owner = await (await request(app.base, '/api/auth/register', { method: 'POST', body: await withCode(app, {
    username: 'cardmailowner', email: 'cardowner@example.test', password: 'Card-Owner-Password-42!',
  }) })).json();
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64');
  const created = await request(app.base, '/api/cards', { token: owner.token, method: 'POST', body: {
    title: '<b>Approved card</b>', notes: 'Private notes', ratio: { w: 3, h: 2 }, frontImage: svg,
  } });
  assert.equal(created.status, 201);
  const card = (await created.json()).card;
  assert.equal(app.cardReviewMails.length, 0);
  const edit = (route, body, target = app, token = admin.token) => request(target.base, route, { method: 'PUT', token, body });
  async function waitMails(target, count) {
    for (let i = 0; i < 100 && target.cardReviewMails.length < count; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(target.cardReviewMails.length, count);
  }
  let expected = 0;
  for (const pattern of ['/api/admin/cards/:id', '/api/cards/:id']) {
    const route = pattern.replace(':id', card.id);
    const handler = require(pattern.startsWith('/api/admin') ? '../server/lib/api/admin' : '../server/lib/api/cards').routes.find(r => r.method === 'PUT' && r.pattern === pattern).handler;
    assert.equal((await edit(route, { status: 'approved' }, app, '')).status, 401);
    if (pattern.startsWith('/api/admin')) assert.equal((await edit(route, { status: 'approved' }, app, owner.token)).status, 403);
    else {
      assert.equal((await edit(route, { status: 'approved' }, app, owner.token)).status, 200);
      assert.equal(await db.transaction(unit => unit.find('cards', row => row.id === card.id).status), 'pending', 'owners cannot approve their own cards');
    }
    assert.equal((await edit(route, { status: 'invalid' })).status, 400);
    await assert.rejects(db.transaction(async unit => {
      await handler({ db: unit, user: unit.find('users', u => u.id === admin.user.id), params: { id: card.id }, body: { status: 'approved' }, config: {
        publicOrigin: 'https://qsl.example.test', sendCardReviewMail: () => assert.fail('rollback must not mail'),
      } });
      throw new Error('approval rollback');
    }, { write: true }), /approval rollback/);
    assert.equal(await db.transaction(unit => unit.find('cards', row => row.id === card.id).status), 'pending');
    assert.equal(app.cardReviewMails.length, expected);
    const responses = await Promise.all([edit(route, { status: 'approved' }), edit(route, { status: 'approved' })]);
    assert.ok(responses.every(response => response.status === 200));
    await waitMails(app, ++expected);
    assert.deepEqual(app.cardReviewMails.at(-1), { kind: 'cardReviewMail', email: owner.user.email, committed: true,
      notification: { cardId: card.id, cardTitle: '<b>Approved card</b>', url: 'https://qsl.example.test/card/' + card.id } });
    assert.equal((await edit(route, { title: '<b>Approved card</b>' })).status, 200);
    assert.equal(app.cardReviewMails.length, expected);
    assert.equal((await edit(route, { status: 'rejected', rejectReason: 'Private reason' })).status, 200);
    assert.equal(app.cardReviewMails.length, expected);
    assert.equal((await edit(route, { status: 'approved' })).status, 200);
    await waitMails(app, ++expected);
    // A fresh owner edit resubmits the card and permits a later approval reminder.
    assert.equal((await edit('/api/cards/' + card.id, {}, app, owner.token)).status, 200);
  }
  const failing = await start(t, dir, { QSL_TEST_FAIL_CARD_REVIEW_MAIL: 'true' });
  const route = '/api/admin/cards/' + card.id;
  const approved = await edit(route, { status: 'approved' }, failing);
  assert.equal(approved.status, 200);
  assert.ok(!(await approved.text()).includes(owner.user.email));
  await waitMails(failing, 1);
  assert.equal(await db.transaction(unit => unit.find('cards', row => row.id === card.id).status), 'approved');
  assert.equal((await edit(route, { status: 'approved' }, failing)).status, 200);
  assert.equal(failing.cardReviewMails.length, 1);
  assert.ok(!failing.logs().includes('provider-secret') && !failing.logs().includes(owner.user.email));
  await edit(route, { status: 'pending' });
  await db.transaction(unit => { unit.find('users', u => u.id === owner.user.id).status = 'banned'; }, { write: true });
  assert.equal((await edit(route, { status: 'approved' })).status, 200);
  assert.equal(app.cardReviewMails.length, expected);
  const { approvedMailAfterCommit } = require('../server/lib/card-review-mail');
  const context = { db: { find: () => ({ email: 'owner@example.test', status: 'active' }) }, config: {} };
  assert.equal(approvedMailAfterCommit(context, { ...card, status: 'approved' }, 'pending'), undefined);
  context.config = { sendCardReviewMail: () => assert.fail('missing public origin must skip mail') };
  assert.equal(approvedMailAfterCommit(context, { ...card, status: 'approved' }, 'pending'), undefined);
  context.config = { publicOrigin: 'https://qsl.example.test' };
  assert.equal(approvedMailAfterCommit(context, { ...card, status: 'approved' }, 'pending'), undefined);
});

test('production config fails closed for missing paths/origin/demo flag and insecure origins', () => {
  const valid = { DATABASE_URL: 'postgresql://localhost/test', NODE_ENV: 'production', QSL_DATA_DIR: os.tmpdir(), QSL_PUBLIC_ORIGIN: 'https://qsl.example.test' };
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
  assert.deepEqual(await (await fetch(app.base + '/api/config')).json(), { demo: false, demoAccounts: [], build: null });
  const db = await databases.get(dir).db.transaction(unit => unit.data);
  assert.equal(db.users.length, 0);
  assert.equal(db.cards.length, 0);
});

test('production requires an administrator and rejects demo databases without altering them', async t => {
  const dir = await temp(t);
  let result = await processFor('server/server.js', env(dir)).ended;
  assert.notEqual(result.code, 0);
  assert.match(result.output, /缺少管理员/);
  await assert.rejects(fs.access(path.join(dir, 'db.json')));
  const db = databases.get(dir).db;
  await db.transaction(unit => { unit.data.demo = true; }, { write: true });
  const original = await db.transaction(unit => unit.data);
  result = await processFor('server/server.js', env(dir)).ended;
  assert.match(result.output, /演示数据或默认密码/);
  assert.deepEqual(await db.transaction(unit => unit.data), original);
  assert.notEqual((await init(dir)).code, 0);
});

test('offline initialization is idempotent, never stores plaintext, and production has no demo access', async t => {
  const dir = await temp(t);
  const result = await init(dir);
  assert.equal(result.code, 0, result.output);
  assert.ok(!result.output.includes(credentials.password));
  const original = JSON.stringify(await databases.get(dir).db.transaction(unit => unit.data));
  assert.ok(!original.includes(credentials.password));
  assert.equal(JSON.parse(original).users.length, 1);
  assert.notEqual((await init(dir)).code, 0);
  assert.equal(JSON.stringify(await databases.get(dir).db.transaction(unit => unit.data)), original);

  const app = await start(t, dir);
  assert.deepEqual(await (await fetch(app.base + '/api/config')).json(), { demo: false, demoAccounts: [], build: null });
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
  assert.match(shared.shareToken, /^[A-Za-z]{6}$/);
  assert.equal(shared.url, 'https://qsl.example.test/s/' + shared.shareToken);
  assert.notEqual((await init(dir)).code, 0, 'existing administrator is never overwritten');
  const second = await start(t, dir);
  assert.equal((await request(second.base, '/api/auth/me', { token })).status, 200, 'separate processes read the same committed state');
  await second.stop();
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

test('build metadata is validated from the fixed build file and footer uses HKT', async () => {
  const serverSource = await fs.readFile(path.join(ROOT, 'server/server.js'), 'utf8');
  const buildSource = serverSource.slice(serverSource.indexOf('const publicBuild ='), serverSource.indexOf('\nfunction publicConfig'));
  const revision = '8c3f2c1'.padEnd(40, '0');
  const created = '2026-10-27T18:35:00Z';
  function readBuild(value) {
    const context = { __dirname: path.join(ROOT, 'server'), path, process: { env: { QSL_BUILD_REVISION: revision, QSL_BUILD_CREATED: created } },
      fs: { readFileSync(file) { assert.equal(file, path.join(ROOT, 'build-info.json')); if (value === undefined) throw new Error('missing'); return value; } } };
    return vm.runInNewContext(buildSource + '\nJSON.stringify(publicBuild)', context);
  }
  assert.equal(readBuild(JSON.stringify({ revision, created, private: 'not public' })), JSON.stringify({ revision, created }));
  for (const value of [undefined, 'broken', 'null', '{}', JSON.stringify({ revision: revision.slice(0, 7), created }),
    JSON.stringify({ revision, created: '2026-02-30T00:00:00Z' }), JSON.stringify({ revision, created: '2026-10-27T18:35:00+00:00' })]) {
    assert.equal(readBuild(value), 'null');
  }
  const source = await fs.readFile(path.join(ROOT, 'public/js/core.js'), 'utf8');
  const context = { window: {}, document: {}, console, URLSearchParams, Intl, Map, Set };
  vm.runInNewContext(source, context);
  const format = context.window.QSL.footerBuildText;
  assert.equal(format({ revision, created }), '版本 ' + revision.slice(0, 7) + ' · 镜像构建于 2026-10-28 02:35 HKT');
  for (const build of [null, {}, { revision, created: '2026-02-30T00:00:00Z' }]) assert.match(format(build), /^开发版/);
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

test('PostgreSQL transactions roll back exceptions and enforce unique users across connections', async t => {
  const dir = await temp(t);
  assert.equal((await init(dir)).code, 0);
  const db = databases.get(dir).db;
  const before = await db.transaction(unit => unit.data);
  await assert.rejects(db.transaction(unit => { unit.data.users[0].displayName = 'rolled back'; throw new Error('abort'); }, { write: true }), /abort/);
  assert.deepEqual(await db.transaction(unit => unit.data), before);
  await assert.rejects(db.transaction(unit => { unit.data.users.push({ ...unit.data.users[0], id: 'u_duplicate', username: credentials.username.toUpperCase() }); }, { write: true }), err => err.status === 409);
  assert.deepEqual(await db.transaction(unit => unit.data), before);
  const other = new Database(databases.get(dir));
  t.after(() => other.close());
  await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? db : other).transaction(async unit => {
    const user = unit.data.users[0];
    const count = Number(user.bio || '0');
    await new Promise(resolve => setTimeout(resolve, 5));
    user.bio = String(count + 1);
  }, { write: true })));
  assert.equal(await db.transaction(unit => unit.data.users[0].bio), '8', 'no lost updates across connections');
});

test('concurrent registration and independent exchange approvals remain atomic across app processes', async t => {
  const dir = await temp(t);
  assert.equal((await init(dir)).code, 0);
  const a = await start(t, dir), b = await start(t, dir);
  const registration = await withCode(a, { username: 'concurrent', email: 'concurrent@example.test', password: 'Concurrent-Password-42!' });
  const results = await Promise.all([a, b].map(app => request(app.base, '/api/auth/register', { method: 'POST', body: registration })));
  assert.deepEqual(results.map(res => res.status).sort(), [201, 409]);
  const token = (await (await request(a.base, '/api/auth/login', { method: 'POST', body: { identifier: credentials.username, password: credentials.password } })).json()).token;
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64');
  const card = (await (await request(a.base, '/api/cards', { token, method: 'POST', body: { title: 'Concurrent', ratio: { w: 3, h: 2 }, frontImage: svg } })).json()).card;
  await request(a.base, `/api/admin/cards/${card.id}`, { token, method: 'PUT', body: { status: 'approved' } });
  const address = { name: 'Test', line1: 'Test road', city: 'Test', country: 'Test' };
  assert.equal((await request(a.base, '/api/me/profile', { token, method: 'PUT', body: { address } })).status, 200);
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const user = await (await request(a.base, '/api/auth/register', { method: 'POST', body: await withCode(a, { username: 'applicant' + i, email: `applicant${i}@example.test`, password: 'Applicant-Password-42!' }) })).json();
    const response = await request(a.base, `/api/cards/${card.id}/exchanges`, { token: user.token, method: 'POST', body: { contactName: 'Test', address, message: '' } });
    assert.equal(response.status, 201);
    ids.push((await response.json()).exchange.id);
  }
  const { db, databaseSchema } = databases.get(dir);
  // Exercise an upgrade of an existing database with the old index and pending rows.
  await db.pool.query(`CREATE UNIQUE INDEX exchanges_approved_unique ON "${databaseSchema}".exchanges("cardId") WHERE status='approved'`);
  await db.pool.query(`DELETE FROM "${databaseSchema}".schema_migrations WHERE version=6`);
  const beforeMigration = await db.transaction(unit => unit.data.exchanges);
  await db.migrate();
  assert.deepEqual(await db.transaction(unit => unit.data.exchanges), beforeMigration, 'migration preserves existing applications');
  const approvals = await Promise.all(ids.map((id, i) => request((i ? a : b).base, `/api/exchanges/${id}/approve`, { token, method: 'POST', body: { confirmNoCards: true } })));
  assert.deepEqual(approvals.map(res => res.status), [200, 200]);
  const exchanges = await db.transaction(unit => unit.data.exchanges);
  assert.equal(exchanges.filter(row => row.status === 'approved').length, 2);
  assert.equal(exchanges.filter(row => row.status === 'rejected').length, 0);
  await assert.rejects(db.transaction(unit => {
    unit.insert('exchanges', { ...unit.data.exchanges[0], id: 'duplicate_application', status: 'pending' });
  }, { write: true }), err => err.status === 409, 'database still rejects duplicate active applications for the same applicant');

  const later = await (await request(a.base, '/api/auth/register', { method: 'POST', body: await withCode(a, {
    username: 'laterapplicant', email: 'later@example.test', password: 'Later-Applicant-42!',
  }) })).json();
  const lateResponse = await request(a.base, `/api/cards/${card.id}/exchanges`, { token: later.token, method: 'POST', body: { contactName: 'Later', address } });
  assert.equal(lateResponse.status, 201, 'new applicants may apply after earlier approvals');
  const lateExchange = (await lateResponse.json()).exchange;
  const repeated = await Promise.all([a, b].map(app => request(app.base, `/api/exchanges/${lateExchange.id}/approve`, { token, method: 'POST', body: { confirmNoCards: true } })));
  assert.deepEqual(repeated.map(res => res.status).sort(), [200, 400], 'same application can only be approved once');
  const ownExchange = await request(a.base, `/api/exchanges/${lateExchange.id}`, { token: later.token });
  assert.equal(ownExchange.status, 200);
  assert.ok((await ownExchange.json()).exchange.toAddress);
  assert.equal((await request(a.base, `/api/exchanges/${ids[0]}`, { token: later.token })).status, 403, 'another applicant cannot access a different exchange');
  assert.equal((await request(a.base, `/api/exchanges/${lateExchange.id}/complete`, { token: later.token, method: 'POST', body: {} })).status, 200);
  assert.equal(await db.transaction(unit => unit.data.exchanges.filter(row => row.status === 'approved').length), 2, 'completion leaves other approvals active');
  await assert.rejects(db.transaction(unit => {
    unit.data.likes.push({ id: 'l_bad', cardId: card.id, userId: 'nonexistent', createdAt: new Date().toISOString() });
  }, { write: true }), err => err.status === 400, 'foreign keys reject orphan likes');
  const applicant = await db.transaction(unit => unit.data.users.find(row => row.username === 'applicant0'));
  await db.transaction(unit => {
    unit.data.likes.push({ id: 'l_first', cardId: card.id, userId: applicant.id, createdAt: new Date().toISOString() });
  }, { write: true });
  await assert.rejects(db.transaction(unit => {
    unit.data.likes.push({ id: 'l_second', cardId: card.id, userId: applicant.id, createdAt: new Date().toISOString() });
  }, { write: true }), err => err.status === 409, 'database rejects duplicate likes');
});

test('JSON import supports dry-run, preserves source, refuses overwrite, and rolls back invalid references', async t => {
  const sourceDir = await temp(t), targetDir = await temp(t), invalidDir = await temp(t);
  assert.equal((await init(sourceDir)).code, 0);
  const source = await databases.get(sourceDir).db.transaction(unit => unit.data);
  const now = new Date().toISOString();
  source.cards.push({ id: 'legacy_card', ownerId: source.users[0].id, title: 'Legacy', callSign: '', band: '', mode: '', notes: '', ratio: { w: 3, h: 2 }, frontImage: '', backImage: '', shareToken: 'AbCdEf', status: 'approved', rejectReason: null, contentConsent: null, createdAt: now, updatedAt: now });
  const file = path.join(sourceDir, 'legacy.json');
  await fs.writeFile(file, JSON.stringify(source));
  const runImport = async (dir, flags = []) => {
    const child = spawn(process.execPath, ['server/import-json.js', '--file', file, ...flags], { cwd: ROOT, env: env(dir), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stderr.on('data', data => { output += data; });
    child.stdout.on('data', data => { output += data; });
    const [code] = await once(child, 'exit');
    return { code, output };
  };
  assert.equal((await runImport(targetDir, ['--dry-run'])).code, 0);
  assert.equal(await databases.get(targetDir).db.transaction(unit => unit.data.users.length), 0);
  assert.equal((await runImport(targetDir)).code, 0);
  const imported = await databases.get(targetDir).db.transaction(unit => unit.data);
  assert.match(imported.cards[0].shortToken, /^[A-Za-z]{6}$/);
  assert.notEqual(imported.cards[0].shortToken, source.cards[0].shareToken);
  delete imported.cards[0].shortToken;
  assert.deepEqual(imported, { ...source, cards: source.cards.map(card => ({ ...card, stock: null })) });
  assert.notEqual((await runImport(targetDir)).code, 0);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), source);
  source.likes.push({ id: 'l_orphan', userId: 'missing', cardId: 'missing', createdAt: new Date().toISOString() });
  await fs.writeFile(file, JSON.stringify(source));
  assert.notEqual((await runImport(invalidDir)).code, 0);
  assert.equal(await databases.get(invalidDir).db.transaction(unit => unit.data.users.length), 0);
  source.likes = [];
  source.users.push({ ...source.users[0], id: 'u_duplicate_name' });
  await fs.writeFile(file, JSON.stringify(source));
  assert.notEqual((await runImport(invalidDir)).code, 0, 'a SQL constraint must roll back the complete import');
  assert.equal(await databases.get(invalidDir).db.transaction(unit => unit.data.users.length), 0);
});
