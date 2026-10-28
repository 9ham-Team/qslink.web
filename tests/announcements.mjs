import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { fixture } from './helpers/database.mjs';
import announcements from '../server/lib/api/announcements.js';

// 可由 smoke 调用；独立执行：node tests/announcements.mjs（自动启动隔离 PostgreSQL）。
export async function testAnnouncements() {
  const database = await fixture();
  const admin = { role: 'admin' };
  const member = { id: 'u_reminder_member', role: 'user' };
  async function call(method, pattern, { user = admin, body, query = '', id } = {}) {
    const route = announcements.routes.find((item) => item.method === method && item.pattern === pattern);
    return database.db.transaction((db) => route.handler({ db, user, body, query: new URLSearchParams(query), params: { id } }), { write: method !== 'GET' });
  }
  const publicPath = '/api/announcements';
  const adminPath = '/api/admin/announcements';
  const updatePath = adminPath + '/:id';
  const rejects = (promise, status) => assert.rejects(promise, (err) => err.status === status);
  try {
    await database.db.transaction(async (db) => {
      const now = new Date().toISOString();
      db.insert('users', { ...member, username: 'reminder_member', email: 'reminder@example.invalid', displayName: '测试用户', callSign: '', bio: '', avatarColor: '#0eaf8f', status: 'active', address: null, passwordHash: 'test-only', createdAt: now, updatedAt: now });
      await db.save();
    }, { write: true });
    for (const [method, pattern] of [['GET', adminPath], ['POST', adminPath], ['PUT', updatePath]]) {
      await rejects(call(method, pattern, { user: null }), 401);
      await rejects(call(method, pattern, { user: member }), 403);
    }
    assert.equal((await call('GET', publicPath, { user: null })).body.total, 0);
    for (const body of [null, [], {}, { title: 'x', body: ' ' }, { title: 1, body: 'x' }, { title: 'x'.repeat(121), body: 'x' }, { title: 'x', body: 'x'.repeat(10001) }, { title: 'x', body: 'x', status: 'hidden' }, { title: 'x\0', body: 'x' }]) {
      await rejects(call('POST', adminPath, { body }), 400);
    }
    const created = await call('POST', adminPath, { body: { title: ' 草稿 ', body: '<script>alert(1)</script>\n纯文本', id: 'forged', createdAt: '2000-01-01', publishedAt: '2000-01-01' } });
    assert.equal(created.status, 201);
    const draft = created.body.announcement;
    assert.equal(draft.displaySeconds, 30);
    for (const displaySeconds of [null, '30', 0, -1, 3601, 1.5]) {
      await rejects(call('PUT', updatePath, { id: draft.id, body: { displaySeconds } }), 400);
    }
    for (const displaySeconds of [1, 3600, 45]) {
      assert.equal((await call('PUT', updatePath, { id: draft.id, body: { displaySeconds } })).body.announcement.displaySeconds, displaySeconds);
    }
    const dismissPath = publicPath + '/:id/dismiss';
    await rejects(call('POST', dismissPath, { id: draft.id, user: null }), 401);
    await rejects(call('POST', dismissPath, { id: draft.id, user: member }), 404);
    await rejects(call('POST', dismissPath, { id: 'missing', user: member }), 404);
    assert.equal(draft.title, '草稿');
    assert.equal(draft.status, 'draft');
    assert.equal(draft.publishedAt, null);
    assert.notEqual(draft.id, 'forged');
    assert.notEqual(draft.createdAt, '2000-01-01');
    assert.equal((await call('GET', publicPath, { query: 'status=all' })).body.total, 0);
    await rejects(call('PUT', updatePath, { id: 'missing', body: { title: 'x' } }), 404);
    await rejects(call('PUT', updatePath, { id: draft.id, body: { status: null } }), 400);
    const published = (await call('PUT', updatePath, { id: draft.id, body: { status: 'published' } })).body.announcement;
    assert.ok(published.publishedAt);
    const edited = (await call('PUT', updatePath, { id: draft.id, body: { title: '已编辑', publishedAt: '2000-01-01' } })).body.announcement;
    assert.equal(edited.publishedAt, published.publishedAt);
    assert.equal(edited.createdAt, draft.createdAt);
    assert.equal((await call('GET', publicPath)).body.items[0].body, draft.body);
    await call('PUT', updatePath, { id: draft.id, body: { status: 'draft' } });
    assert.equal((await call('GET', publicPath)).body.total, 0);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const republished = (await call('PUT', updatePath, { id: draft.id, body: { status: 'published' } })).body.announcement;
    assert.ok(republished.publishedAt > published.publishedAt);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newest = (await call('POST', adminPath, { body: { title: '最新', body: '公告', status: 'published' } })).body.announcement;
    const first = (await call('GET', publicPath, { user: null, query: 'limit=1' })).body;
    assert.equal(first.total, 2);
    assert.equal(first.pages, 2);
    assert.equal(first.items[0].id, newest.id);
    assert.equal((await call('GET', publicPath, { query: 'limit=1&page=2' })).body.items[0].id, draft.id);
    assert.equal((await call('GET', adminPath, { query: 'status=published' })).body.total, 2);
    assert.equal((await call('GET', adminPath, { query: 'status=invalid' })).body.total, 2);
    for (let i = 0; i < 2; i++) {
      assert.equal((await call('POST', dismissPath, { id: newest.id, user: member, body: { userId: 'forged' } })).body.dismissed, true);
    }
    const reminders = (await call('GET', publicPath, { user: member, query: 'reminder=1&limit=1' })).body;
    assert.equal(reminders.total, 1);
    assert.equal(reminders.items[0].id, draft.id);
    assert.equal((await call('GET', publicPath, { user: member })).body.total, 2);
    assert.equal((await call('GET', publicPath, { user: null, query: 'reminder=1' })).body.total, 2);
    assert.equal((await call('GET', publicPath, { user: admin, query: 'reminder=1' })).body.total, 2);
    await call('PUT', updatePath, { id: newest.id, body: { status: 'draft' } });
    await call('PUT', updatePath, { id: newest.id, body: { status: 'published', title: '重新发布' } });
    assert.equal((await call('GET', publicPath, { user: member, query: 'reminder=1' })).body.total, 1);
    await database.db.transaction((db) => {
      assert.equal(db.find('announcements', (item) => item.id === draft.id).title, '已编辑');
      assert.equal(db.find('announcements', (item) => item.id === draft.id).displaySeconds, 45);
      assert.equal(db.data.announcementDismissals.length, 1);
      assert.equal(db.data.announcementDismissals[0].userId, member.id);
    });
    console.log('[announcements] 公告路由、权限、校验、发布撤下、分页与数据库持久化通过');
  } finally {
    await database.cleanup();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let embedded;
  let directory;
  try {
    if (!process.env.QSL_TEST_DATABASE_URL) {
      const { default: EmbeddedPostgres } = await import('embedded-postgres');
      const fs = await import('node:fs/promises');
      const os = await import('node:os');
      const path = await import('node:path');
      const net = await import('node:net');
      const crypto = await import('node:crypto');
      const socket = net.createServer();
      await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
      const port = socket.address().port;
      await new Promise((resolve) => socket.close(resolve));
      directory = await fs.mkdtemp(path.join(os.tmpdir(), 'qslink-announcements-'));
      const password = crypto.randomBytes(24).toString('hex');
      embedded = new EmbeddedPostgres({ databaseDir: directory, port, user: 'postgres', password, authMethod: 'scram-sha-256', persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} });
      await embedded.initialise();
      await embedded.start();
      process.env.QSL_TEST_DATABASE_URL = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
    }
    await testAnnouncements();
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    if (embedded) await embedded.stop();
    if (directory) await (await import('node:fs/promises')).rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
