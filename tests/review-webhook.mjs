import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fixture } from './helpers/database.mjs';
import { withLegalConsent } from './helpers/legal.mjs';
import webhook from '../server/lib/review-webhook.js';
import cards from '../server/lib/api/cards.js';
import admin from '../server/lib/api/admin.js';
import config from '../server/lib/config.js';

const endpoint = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-only-secret';

test('review webhook accepts relay and WeCom endpoints without exposing URL secrets', () => {
  assert.equal(webhook.readReviewWebhookUrl({}), '');
  assert.equal(webhook.readReviewWebhookUrl({ QSL_REVIEW_WEBHOOK_URL: endpoint }), endpoint);
  assert.equal(config.readConfig({ DATABASE_URL: 'postgresql://localhost/test', QSL_REVIEW_WEBHOOK_URL: endpoint }).reviewWebhookUrl, endpoint);
  for (const url of ['https://relay.example.test/hooks/qslink?token=test-only-secret', 'http://127.0.0.1:9000/hooks/qslink']) {
    assert.equal(webhook.readReviewWebhookUrl({ QSL_REVIEW_WEBHOOK_URL: url }), url);
  }
  for (const url of ['invalid-secret', 'ftp://relay.example.test/hook', endpoint + '#secret', endpoint.replace('https://', 'https://user:secret@')]) {
    assert.throws(() => webhook.readReviewWebhookUrl({ QSL_REVIEW_WEBHOOK_URL: url }), error => {
      assert.ok(!error.message.includes('test-only-secret') && !error.message.includes('invalid-secret'));
      return true;
    });
  }
  assert.equal(webhook.createReviewWebhookTransport(''), null);
});

test('review webhook sends only message text; mentions belong to the relay', async () => {
  const env = { DATABASE_URL: 'postgresql://localhost/test', QSL_REVIEW_WEBHOOK_AT_LIST: 'zhangsan,@all' };
  assert.ok(!Object.hasOwn(config.readConfig(env), 'reviewWebhookAtList'));
  for (const url of [endpoint, 'https://relay.example.test/hooks/qslink']) {
    let sent;
    const send = webhook.createReviewWebhookTransport(url, { fetchImpl: async (target, options) => {
      assert.equal(target, url);
      sent = JSON.parse(options.body);
      return new Response('{"errcode":0}');
    } });
    await send({ title: 'Title <@unexpected>', ownerName: '<@all>', callSign: '<@other>', cardId: 'c1' });
    assert.deepEqual(Object.keys(sent), ['msgtype', 'text']);
    assert.deepEqual(Object.keys(sent.text), ['content']);
    assert.ok(!sent.text.content.includes('<@'), 'user content cannot inject additional mentions');
    assert.match(sent.text.content, /Title ＜@unexpected＞/);
  }
});

test('review webhook sends WeCom text and checks HTTP/robot errors and timeouts', async () => {
  let sent;
  const notification = { reason: 'created', title: '卡😀'.repeat(200), callSign: 'QA0TEST', ownerName: '名字\n伪造行', cardId: 'c1', url: 'https://qsl.example.test/admin?tab=cards' };
  const send = webhook.createReviewWebhookTransport(endpoint, { fetchImpl: async (url, options) => {
    assert.equal(url, endpoint); assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.ok(options.signal instanceof AbortSignal);
    sent = JSON.parse(options.body);
    return new Response('{"errcode":0}');
  } });
  await send(notification);
  assert.deepEqual(Object.keys(sent), ['msgtype', 'text']); assert.equal(sent.msgtype, 'text');
  assert.match(sent.text.content, /QSLink 卡片待审核/); assert.match(sent.text.content, /名字 伪造行/);
  assert.ok(Buffer.byteLength(sent.text.content, 'utf8') <= 2048);
  for (const response of [new Response('secret-error', { status: 500 }), new Response('{"errcode":93000,"errmsg":"secret"}'), new Response('invalid JSON'), new Response('null')]) {
    await assert.rejects(webhook.createReviewWebhookTransport(endpoint, { fetchImpl: async () => response })(notification));
  }
  const timeoutSend = webhook.createReviewWebhookTransport(endpoint, { timeoutMs: 10, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }) });
  const keepAlive = setTimeout(() => {}, 1000);
  try { await assert.rejects(timeoutSend(notification), error => error.name === 'TimeoutError'); }
  finally { clearTimeout(keepAlive); }
});

test('review reminders run after commit, cover resubmission and exclude failed/unauthorized writes', async () => {
  const f = await fixture();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qslink-webhook-'));
  const notifications = [];
  const now = new Date().toISOString();
  const cfg = { publicOrigin: 'https://qsl.example.test', sendReviewWebhook: async notification => {
    // A second write transaction would block if outbound I/O held the application lock.
    await f.db.transaction(db => {
      assert.equal(db.find('cards', c => c.id === notification.cardId).status, 'pending');
    }, { write: true });
    notifications.push(notification);
  } };
  const routes = [...cards.routes, ...admin.routes];
  async function call(method, pattern, body = {}, viewer = 'owner', id, rollback = false, override = cfg) {
    const route = routes.find(r => r.method === method && r.pattern === pattern);
    const result = await f.db.transaction(async db => {
      const result = await route.handler({ db, user: db.find('users', u => u.id === viewer), params: { id }, body: withLegalConsent(method, pattern.replace(':id', id), body), uploadsDir: dir, config: override });
      assert.equal(notifications.length, before, 'no delivery before commit');
      if (rollback) throw new Error('rollback');
      return result;
    }, { write: true });
    if (result.afterCommit) await result.afterCommit();
    return result;
  }
  let before = 0;
  try {
    await fs.writeFile(path.join(dir, 'test.png'), 'fixture');
    await f.db.transaction(db => {
      for (const id of ['owner', 'admin', 'other']) db.insert('users', { id, username: id, displayName: id, email: id + '@example.test', callSign: '', bio: '', avatarColor: '#123456', address: null, passwordHash: 'secret', role: id === 'admin' ? 'admin' : 'user', status: 'active', createdAt: now, updatedAt: now });
    }, { write: true });
    const payload = { title: 'Test card', frontImage: '/uploads/test.png', ratio: { w: 3, h: 2 }, notes: 'private notes' };
    const created = await call('POST', '/api/cards', payload);
    assert.equal(created.status, 201); assert.equal(notifications.length, 1);
    const id = created.body.card.id;
    assert.deepEqual(notifications[0], { reason: 'created', cardId: id, title: 'Test card', callSign: '', ownerName: 'owner', url: cfg.publicOrigin + '/admin?tab=cards' });
    before = notifications.length;
    await assert.rejects(call('POST', '/api/cards', payload, 'owner', undefined, true), /rollback/);
    await assert.rejects(call('POST', '/api/cards', { title: '' }));
    await assert.rejects(call('POST', '/api/cards', payload, 'missing'), error => error.status === 401);
    await assert.rejects(call('PUT', '/api/cards/:id', { title: 'bad' }, 'other', id), error => error.status === 403);
    for (const pattern of ['/api/cards/:id', '/api/admin/cards/:id']) {
      for (const status of ['approved', 'rejected', 'pending']) {
        await call('PUT', pattern, { status }, 'admin', id);
        if (status === 'pending') before++;
        assert.equal(notifications.length, before);
      }
      await call('PUT', pattern, { title: 'admin edit' }, 'admin', id);
      assert.equal(notifications.length, before, 'editing already pending card as admin is silent');
    }
    await call('PUT', '/api/cards/:id', { title: 'owner edit' }, 'owner', id);
    assert.equal(notifications.length, ++before);
    await call('PUT', '/api/admin/cards/:id', { status: 'approved' }, 'admin', id);
    await call('PUT', '/api/cards/:id', {}, 'owner', id);
    assert.equal(notifications.length, ++before);
    assert.equal(notifications.at(-1).reason, 'resubmitted');
    await call('PUT', '/api/cards/:id', {}, 'owner', id, false, {});
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = message => warnings.push(message);
    try {
      const result = await call('PUT', '/api/cards/:id', {}, 'owner', id, false, { ...cfg, sendReviewWebhook: async () => { throw new Error(endpoint); } });
      assert.equal(result.body.card.status, 'pending');
      assert.deepEqual(warnings, ['[webhook] 卡片审核提醒发送失败']);
    } finally { console.warn = originalWarn; }
    assert.equal(notifications.length, before);
  } finally { await f.cleanup(); await fs.rm(dir, { recursive: true, force: true }); }
});
