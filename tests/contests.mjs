import assert from 'node:assert/strict';
import { fixture } from './helpers/database.mjs';
import { withLegalConsent } from './helpers/legal.mjs';
import contests from '../server/lib/api/contests.js';
import cards from '../server/lib/api/cards.js';
import admin from '../server/lib/api/admin.js';
import database from '../server/lib/db.js';

async function testContestMigration() {
  const legacy = await fixture();
  const schema = '"' + legacy.databaseSchema + '"';
  try {
    await legacy.db.transaction(unit => {
      const now = new Date().toISOString();
      unit.insert('announcements', { id: 'legacy_contest_notice', title: '旧全站公告', body: '升级前正文', status: 'published', eventKey: null, displaySeconds: 30, publishedAt: now, createdAt: now, updatedAt: now });
    }, { write: true });
    // DDL stays outside UnitOfWork: its current collection loader requires the new table.
    await legacy.db.pool.query(`DROP TABLE ${schema}."contestEntries"; ALTER TABLE ${schema}.announcements DROP COLUMN "eventKey"; DELETE FROM ${schema}.schema_migrations WHERE version >= 14`);
    assert.equal((await legacy.db.pool.query(`SELECT max(version) AS version FROM ${schema}.schema_migrations`)).rows[0].version, 13);
    await legacy.db.migrate();
    await legacy.db.migrate();
    await legacy.db.transaction(unit => {
      const announcement = unit.find('announcements', item => item.id === 'legacy_contest_notice');
      assert.equal(announcement.eventKey, null);
      assert.equal(announcement.body, '升级前正文');
      assert.deepEqual(unit.data.contestEntries, []);
    });
  } finally {
    await legacy.cleanup();
  }
}

const eventKey = 'qsl-design-2026-11';
const publicPath = '/api/contests/:eventKey';
const entryPath = publicPath + '/entry';
const adminPath = '/api/admin/contests/:eventKey/entries';
const detailPath = adminPath + '/:id';
const reviewPath = detailPath + '/review';

export async function testContests() {
  const f = await fixture();
  const second = new database.Database(f);
  const now = new Date().toISOString();
  const user = (id, role = 'user') => ({ id, username: id, email: id + '@example.test', displayName: id, callSign: '', bio: '', avatarColor: '#123456', role, status: 'active', passwordHash: 'test-only', address: null, createdAt: now, updatedAt: now });
  const card = (id, ownerId = 'owner', status = 'approved') => ({ id, ownerId, title: id, callSign: '', band: '', mode: '', notes: '', stock: null, backImage: '', ratio: { w: 3, h: 2 }, frontImage: '/uploads/test.png', shareToken: 'contest_' + id, status, rejectReason: null, createdAt: now, updatedAt: now });
  async function call(routes, method, pattern, { viewer = 'owner', id, body, query = '', db = f.db, key = eventKey } = {}) {
    const route = routes.find(item => item.method === method && item.pattern === pattern);
    assert.ok(route, method + ' ' + pattern + ' is registered');
    return db.transaction(unit => route.handler({ db: unit, user: viewer ? unit.find('users', item => item.id === viewer) : null, params: { eventKey: key, id }, body, query: new URLSearchParams(query), config: {} }), { write: method !== 'GET' });
  }
  const get = (options = {}) => call(contests.routes, 'GET', entryPath, options).then(result => result.body.entry);
  const assertApprovedCount = async (count) => {
    const result = await call(contests.routes, 'GET', publicPath, { viewer: null });
    assert.deepEqual(result.body, { contest: { key: eventKey, title: '第一届QSLink QSL 卡片设计大赛', approvedRegistrationCount: count } }, 'public contest exposes only its key, title and approved registration count');
  };
  const payload = { cardIds: ['target'], description: '<script>alert(1)</script> 作品说明', contactEmail: 'contest-private@example.test' };
  const submit = (body = payload, options = {}) => call(contests.routes, 'PUT', entryPath, { ...options, body }).then(result => result.body.entry);
  const review = (entry, status = 'approved', options = {}) => call(contests.routes, 'PUT', reviewPath, { viewer: 'admin', id: entry.id, body: { status, reviewReason: status === 'rejected' ? '请完善作品说明' : '', expectedRevision: entry.revision }, ...options }).then(result => result.body.entry);
  const rejects = (promise, status, message) => assert.rejects(promise, err => err.status === status, message);
  const assertPending = (entry, previous) => {
    assert.equal(entry.status, 'pending');
    assert.equal(entry.revision, previous.revision + 1);
    assert.ok(!entry.reviewReason);
    assert.ok(!entry.reviewedAt);
    assert.ok(!entry.reviewedBy);
  };
  try {
    await f.db.transaction(unit => {
      ['owner', 'other', 'racer'].forEach(id => unit.insert('users', user(id)));
      unit.insert('users', user('admin', 'admin'));
      [card('target'), card('replacement'), card('extra1'), card('extra2'), card('foreign', 'other'), card('race', 'racer'), card('pending', 'owner', 'pending'), card('rejected', 'owner', 'rejected')].forEach(item => unit.insert('cards', item));
    }, { write: true });
    await testContestMigration();
    const publicContest = (await call(contests.routes, 'GET', publicPath, { viewer: null })).body;
    assert.ok(publicContest.contest);
    assert.equal(publicContest.entry, undefined);
    await assertApprovedCount(0);
    for (const pattern of [publicPath, entryPath, adminPath]) {
      await rejects(call(contests.routes, 'GET', pattern, { viewer: 'admin', key: 'missing-event' }), 404);
    }
    assert.equal(await get(), null);
    await rejects(get({ viewer: null }), 401);
    await rejects(submit(payload, { viewer: null }), 401);
    for (const [method, pattern] of [['GET', adminPath], ['GET', detailPath], ['PUT', reviewPath]]) {
      await rejects(call(contests.routes, method, pattern, { viewer: null, id: 'missing' }), 401);
      await rejects(call(contests.routes, method, pattern, { viewer: 'other', id: 'missing' }), 403);
    }
    for (const body of [null, [], {}, { ...payload, description: '' }, { ...payload, description: 'x\0' }, { ...payload, description: 'x'.repeat(2001) }, { ...payload, contactEmail: 'invalid' }, { ...payload, contactEmail: 'x'.repeat(121) + '@example.test' }, { ...payload, contactEmail: 'a@example.test\nBcc:x@example.test' }]) {
      await rejects(submit(body), 400);
    }
    await rejects(submit({ ...payload, cardIds: ['missing'] }), 400);
    await rejects(submit({ ...payload, cardIds: ['foreign'] }), 400);
    for (const cardId of ['pending', 'rejected']) await rejects(submit({ ...payload, cardIds: [cardId] }), 400);
    for (const cardIds of [[], ['target', 'target'], ['target', 'replacement', 'extra1', 'extra2'], ['target', 7]]) await rejects(submit({ ...payload, cardIds }), 400);
    let entry = await submit({ ...payload, userId: 'other', status: 'approved', revision: 99, reviewReason: 'forged' });
    assert.equal(entry.userId, 'owner');
    assert.deepEqual(entry.cardIds, ['target']);
    assert.equal(entry.status, 'pending');
    await assertApprovedCount(0);
    assert.equal(entry.revision, 1);
    assert.equal(entry.contactEmail, payload.contactEmail);
    assert.equal(entry.description, payload.description, 'API stores plain text; rendering is responsible for escaping');
    assert.equal(entry.cards.length, 1);
    assert.equal(entry.cards[0].id, 'target');
    assert.equal(entry.user.id, 'owner');
    assert.equal(entry.user.passwordHash, undefined);
    assert.equal(entry.user.email, undefined);
    assert.equal(entry.user.address, undefined);
    assert.equal(await get({ viewer: 'other' }), null, 'another account cannot read the owner entry');
    assert.equal((await get()).id, entry.id);
    assert.equal((await second.transaction(unit => unit.find('contestEntries', item => item.id === entry.id))).contactEmail, payload.contactEmail);
    assert.equal(await f.db.transaction(unit => unit.find('users', item => item.id === 'owner').email), 'owner@example.test', 'entry contact does not change account email');
    const multi = await submit({ ...payload, cardIds: ['target', 'replacement', 'extra1'], expectedRevision: entry.revision });
    assert.deepEqual(multi.cardIds, ['target', 'replacement', 'extra1']);
    assert.equal(multi.cards.length, 3);
    const approvedMulti = await review(multi);
    await assertApprovedCount(1);
    entry = await submit({ ...payload, expectedRevision: approvedMulti.revision });
    assert.deepEqual(entry.cardIds, ['target']);
    assertPending(entry, approvedMulti);
    await assertApprovedCount(0);
    await rejects(submit(payload), 400);
    await rejects(submit({ ...payload, expectedRevision: 0 }), 400);
    for (const expectedRevision of ['1', -1, 1.5, null]) await rejects(submit({ ...payload, expectedRevision }), 400);
    const unchanged = await submit({ ...payload, expectedRevision: entry.revision });
    assert.equal(unchanged.id, entry.id);
    assert.equal(unchanged.revision, entry.revision);
    entry = await review(entry);
    assert.equal(entry.status, 'approved');
    await assertApprovedCount(1);
    assert.equal(await f.db.transaction(unit => unit.find('cards', item => item.id === 'target').status), 'approved');
    const approved = entry;
    const saved = await submit({ ...payload, expectedRevision: entry.revision });
    assert.equal(saved.status, 'approved');
    assert.equal(saved.revision, approved.revision);
    assert.equal(saved.updatedAt, approved.updatedAt, 'idempotent save preserves review and timestamps');
    await assertApprovedCount(1);
    entry = await submit({ ...payload, description: '修改后的作品说明', expectedRevision: entry.revision });
    assertPending(entry, approved);
    await assertApprovedCount(0);
    await rejects(review(approved), 409);
    await rejects(submit({ ...payload, expectedRevision: approved.revision }), 409);
    await rejects(call(contests.routes, 'PUT', reviewPath, { viewer: 'admin', id: entry.id, body: { status: 'rejected', reviewReason: '', expectedRevision: entry.revision } }), 400);
    for (const body of [{ status: 'approved' }, { status: 'pending', expectedRevision: entry.revision }, { status: 'approved', expectedRevision: '1' }]) {
      await rejects(call(contests.routes, 'PUT', reviewPath, { viewer: 'admin', id: entry.id, body }), 400);
    }
    entry = await review(entry, 'rejected');
    assert.equal(entry.status, 'rejected');
    await assertApprovedCount(0);
    assert.equal(entry.reviewReason, '请完善作品说明');
    const rejected = entry;
    entry = await submit({ ...payload, description: '完善作品说明后重提', expectedRevision: entry.revision });
    assertPending(entry, rejected);
    assert.equal(entry.id, rejected.id);

    const racing = await Promise.allSettled([submit({ ...payload, cardIds: ['race'] }, { viewer: 'racer' }), submit({ ...payload, cardIds: ['race'] }, { viewer: 'racer', db: second })]);
    assert.ok(racing.some(result => result.status === 'fulfilled'));
    for (const result of racing.filter(item => item.status === 'rejected')) assert.ok([400, 409].includes(result.reason.status));
    assert.equal(await f.db.transaction(unit => unit.data.contestEntries.filter(item => item.userId === 'racer').length), 1, 'concurrent creation keeps one entry per account');
    const concurrent = await Promise.allSettled([
      submit({ ...payload, description: '并发更新 A', expectedRevision: entry.revision }),
      submit({ ...payload, description: '并发更新 B', expectedRevision: entry.revision }, { db: second }),
    ]);
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(concurrent.find(result => result.status === 'rejected').reason.status, 409);
    entry = await get();
    const list = (await call(contests.routes, 'GET', adminPath, { viewer: 'admin', query: 'status=pending&limit=1' })).body;
    assert.equal(list.total, 2);
    assert.equal(list.pages, 2);
    assert.equal(list.items.length, 1);
    const page2 = (await call(contests.routes, 'GET', adminPath, { viewer: 'admin', query: 'status=pending&limit=1&page=2' })).body;
    assert.notEqual(page2.items[0].id, list.items[0].id);
    assert.equal(list.items[0].status, 'pending');
    assert.ok(Number.isInteger(list.items[0].revision));
    assert.equal(list.items[0].entry, undefined, 'admin list entries are flat');
    assert.ok(list.items[0].user);
    assert.equal(list.items[0].user.passwordHash, undefined);
    assert.equal(list.items[0].user.email, undefined);
    assert.equal(list.items[0].user.address, undefined);
    const detail = (await call(contests.routes, 'GET', detailPath, { viewer: 'admin', id: entry.id })).body.entry;
    assert.equal(detail.contactEmail, payload.contactEmail);
    assert.equal(detail.user.id, 'owner');
    assert.equal(detail.user.email, undefined);
    assert.equal(detail.user.passwordHash, undefined);
    await rejects(call(contests.routes, 'GET', detailPath, { viewer: 'admin', id: 'missing' }), 404);
    await rejects(call(contests.routes, 'PUT', reviewPath, { viewer: 'admin', id: 'missing', body: { status: 'approved', expectedRevision: 1 } }), 404);

    entry = await review(entry);
    await call(cards.routes, 'PUT', '/api/cards/:id/stock', { id: 'target', body: { stock: 4 } });
    assert.equal((await get()).revision, entry.revision, 'stock-only endpoint never invalidates contest approval');
    assert.equal((await get()).status, 'approved');
    await call(admin.routes, 'PUT', '/api/admin/cards/:id', { viewer: 'admin', id: 'target', body: { stock: 3 } });
    assert.equal((await get()).revision, entry.revision, 'admin stock-only change preserves revision');
    assert.equal((await get()).status, 'approved');
    await call(admin.routes, 'PUT', '/api/admin/cards/:id', { viewer: 'admin', id: 'target', body: { title: '管理员编辑作品' } });
    let updated = await get();
    assertPending(updated, entry);
    await rejects(review(entry), 409);
    entry = await review(updated);
    await call(cards.routes, 'PUT', '/api/cards/:id', { viewer: 'admin', id: 'target', body: { notes: '通用编辑入口管理员修改' } });
    updated = await get();
    assertPending(updated, entry);
    entry = await review(updated);
    await call(cards.routes, 'PUT', '/api/cards/:id', { id: 'target', body: withLegalConsent('PUT', '/api/cards/target', { title: '作者编辑作品' }) });
    updated = await get();
    assertPending(updated, entry);
    await rejects(review(updated), 400, 'pending gallery card cannot be approved for contest');
    await call(admin.routes, 'PUT', '/api/admin/cards/:id', { viewer: 'admin', id: 'target', body: { status: 'approved' } });
    entry = await review(await get());
    await call(admin.routes, 'PUT', '/api/admin/cards/:id', { viewer: 'admin', id: 'target', body: { status: 'rejected', rejectReason: '广场重新审核' } });
    updated = await get();
    assertPending(updated, entry);
    await rejects(review(updated), 400);
    await call(admin.routes, 'PUT', '/api/admin/cards/:id', { viewer: 'admin', id: 'target', body: { status: 'approved' } });
    entry = await get();
    await call(admin.routes, 'PUT', '/api/admin/users/:id', { viewer: 'admin', id: 'owner', body: { status: 'banned' } });
    await rejects(review(entry), 400, 'admin approval rechecks user availability');
    await call(admin.routes, 'PUT', '/api/admin/users/:id', { viewer: 'admin', id: 'owner', body: { status: 'active' } });
    await f.db.transaction(unit => { unit.find('cards', item => item.id === 'target').ownerId = 'other'; }, { write: true });
    await rejects(review(entry), 400, 'admin approval rechecks current card ownership');
    await f.db.transaction(unit => { unit.find('cards', item => item.id === 'target').ownerId = 'owner'; }, { write: true });
    entry = await review(await get());

    for (const [routes, method, pattern, options] of [
      [contests.routes, 'GET', publicPath, {}],
      [cards.routes, 'GET', '/api/cards', {}],
      [cards.routes, 'GET', '/api/cards/:id', { id: 'target' }],
    ]) {
      const response = await call(routes, method, pattern, { ...options, viewer: null });
      assert.ok(!JSON.stringify(response.body).includes(payload.contactEmail), 'public response never discloses contest contact email');
      assert.ok(!JSON.stringify(response.body).includes('contactEmail'));
    }
    await assertApprovedCount(1);
    await call(cards.routes, 'DELETE', '/api/cards/:id', { id: 'target' });
    await assertApprovedCount(0);
    updated = await get();
    assert.equal(updated.id, entry.id);
    assert.deepEqual(updated.cardIds, []);
    assert.deepEqual(updated.cards, []);
    assertPending(updated, entry);
    await rejects(review(updated), 400);
    entry = await submit({ ...payload, cardIds: ['replacement'], expectedRevision: updated.revision });
    assert.equal(entry.id, updated.id, 'deleting a card does not free the unique account entry');
    assert.deepEqual(entry.cardIds, ['replacement']);
    entry = await review(entry);
    await assertApprovedCount(1);
    await call(admin.routes, 'DELETE', '/api/admin/cards/:id', { viewer: 'admin', id: 'replacement' });
    await assertApprovedCount(0);
    updated = await get();
    assert.deepEqual(updated.cardIds, []);
    assertPending(updated, entry);
    await call(admin.routes, 'DELETE', '/api/admin/users/:id', { viewer: 'admin', id: 'owner' });
    assert.equal((await call(contests.routes, 'GET', adminPath, { viewer: 'admin', query: 'status=approved' })).body.total, 0);
    console.log('[contests] permissions, privacy, revisions, concurrent submissions, moderation, card lifecycle and deletion passed');
  } finally {
    await second.close();
    await f.cleanup();
  }
}
