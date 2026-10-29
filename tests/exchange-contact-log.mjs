import assert from 'node:assert/strict';
import { fixture } from './helpers/database.mjs';
import exchanges from '../server/lib/api/exchanges.js';
import me from '../server/lib/api/me.js';
import { Database } from '../server/lib/db.js';
import { exchangeRequestMessage } from '../server/lib/mail.js';

export async function testExchangeContactLog() {
  const f = await fixture();
  const now = new Date().toISOString(), sent = [];
  const body = { contactName: '测试', address: { name: '测试', line1: '测试路', city: '测试市', country: '测试' }, message: '' };
  const config = { publicOrigin: 'https://example.test', sendExchangeMail: async (email, notification) => sent.push({ email, notification }) };
  const invoke = (routes, pattern, viewer, params = {}, payload = body) => f.db.transaction(db => {
    const route = routes.find(row => row.pattern === pattern);
    return route.handler({ db, user: viewer ? db.find('users', row => row.id === viewer) : null, params, body: payload, query: new URLSearchParams(), config });
  }, { write: pattern === '/api/cards/:cardId/exchanges' });
  const create = (ids, cardId = 'target', viewer = 'applicant', extra = {}) => invoke(exchanges.routes, '/api/cards/:cardId/exchanges', viewer, { cardId }, { ...body, ...(ids === undefined ? {} : { contactLogIds: ids }), ...extra });
  const detail = (id, viewer = 'owner') => invoke(exchanges.routes, '/api/exchanges/:id', viewer, { id });
  const list = viewer => invoke(me.routes, '/api/me/exchanges', viewer);
  const update = change => f.db.transaction(change, { write: true });
  try {
    await update(db => {
      for (const [id, callSign] of [['owner', 'B1AAA'], ['applicant', ''], ['stranger', 'JA1ABC'], ['admin', 'B2BBB']]) {
        db.insert('users', { id, callSign, username: id, email: id + '@example.test', displayName: id, bio: '', avatarColor: '#123456', role: id === 'admin' ? 'admin' : 'user', status: 'active', passwordHash: 'test-only', address: null, createdAt: now, updatedAt: now });
      }
      for (const id of ['target', 'empty', 'limit', 'legacy']) db.insert('cards', { id, ownerId: 'owner', title: id, callSign: 'B1AAA', band: '', mode: '', notes: '', ratio: { w: 3, h: 2 }, frontImage: '/uploads/test.png', backImage: '', shareToken: 'legacy_' + id, status: 'approved', createdAt: now, updatedAt: now });
      db.insert('exchanges', { id: 'old', cardId: 'legacy', fromUserId: 'applicant', toUserId: 'owner', status: 'pending', message: '', contactName: '', fromAddress: {}, createdAt: now, updatedAt: now });
      for (const [id, userId, callSign] of [['one', 'applicant', 'UNRELATED/P'], ['two', 'applicant', 'DIFFERENT'], ['unselected', 'applicant', 'B1AAA'], ['private', 'owner', 'JA1ABC']]) {
        db.insert('contactLogs', { id, userId, callSign, qsoAt: now, dedupKey: id, details: { callSign, stationCallSign: 'OLD-STATION', qsoAt: now, band: '20M', mode: 'FT8', source: 'adif', name: '<img src=x onerror=alert(1)>', privateExtra: 'must-not-share' }, createdAt: now, updatedAt: now });
      }
    });
    assert.deepEqual((await detail('old')).body.exchange.selectedContactLogs, [], 'legacy exchanges start without attachments');
    for (const ids of [null, {}, 'one', [42], [''], ['one', 'one'], ['x'.repeat(101)], Array(101).fill('one'), ['missing'], ['private'], ['one', 'private']]) {
      await assert.rejects(create(ids), err => err.status === 400 && !!err.fields?.contactLogIds);
    }
    await assert.rejects(create(['one'], 'target', null), err => err.status === 401);
    assert.equal((await list('owner')).body.items.length, 1, 'failed selection never creates a partial request');
    const created = await create(['two', 'one'], 'target', 'applicant', { selectedContactLogs: [{ callSign: 'spoof' }] });
    const snapshot = created.body.exchange.selectedContactLogs;
    assert.deepEqual(snapshot.map(row => row.id), ['two', 'one'], 'preserve user-selected order without callsign matching');
    assert.equal(snapshot[0].callSign, 'DIFFERENT');
    assert.equal(snapshot[0].stationCallSign, 'OLD-STATION', 'do not change station to current profile');
    assert.equal(snapshot[1].name, '<img src=x onerror=alert(1)>');
    assert.ok(!JSON.stringify(snapshot).includes('must-not-share'));
    assert.ok(!Object.hasOwn(created.body.exchange, 'hasContactLog'));
    assert.equal(sent.length, 0);
    await created.afterCommit();
    assert.equal(sent[0].email, 'owner@example.test');
    assert.equal(sent[0].notification.contactLogCount, 2);
    assert.ok(!JSON.stringify(sent).includes('UNRELATED'), 'mail contains only the attachment count');
    const id = created.body.exchange.id;
    const incoming = (await detail(id)).body.exchange;
    assert.deepEqual(incoming.selectedContactLogs, snapshot);
    assert.equal(incoming.fromAddress, null);
    assert.equal((await list('owner')).body.items.find(row => row.id === id).selectedContactLogs.length, 2);
    assert.equal((await list('applicant')).body.items.find(row => row.id === id).selectedContactLogs.length, 2);
    assert.ok(!Object.hasOwn((await detail(id, 'admin')).body.exchange, 'selectedContactLogs'), 'outside admin gets no log attachments');
    await assert.rejects(detail(id, 'stranger'), err => err.status === 403);
    await assert.rejects(detail(id, null), err => err.status === 401);
    await assert.rejects(create(['one']), err => err.status === 409);
    const empty = await create(undefined, 'empty', 'applicant', { selectedContactLogs: [{ id: 'private' }] });
    assert.deepEqual(empty.body.exchange.selectedContactLogs, [], 'omitted IDs never attach or match anything');
    await empty.afterCommit();
    assert.equal(sent[1].notification.contactLogCount, 0);
    for (const count of [0, 2]) {
      const message = exchangeRequestMessage({ ...sent[0].notification, contactLogCount: count });
      for (const text of [message.textBody, message.htmlBody]) {
        assert.equal(text.includes('申请人附上了 2 条通联记录'), count === 2);
        assert.ok(!text.includes('本次换卡有通联纪录'));
      }
    }
    await update(db => {
      db.find('contactLogs', row => row.id === 'one').details.callSign = 'CHANGED';
      db.data.contactLogs = db.data.contactLogs.filter(row => row.id !== 'two');
      db.find('users', row => row.id === 'applicant').callSign = 'NEW-CALL';
    });
    assert.deepEqual((await detail(id)).body.exchange.selectedContactLogs, snapshot, 'later log/profile changes never alter submitted snapshots');
    const reopened = new Database(f);
    try { assert.deepEqual(await reopened.transaction(db => db.find('exchanges', row => row.id === id).selectedContactLogs), snapshot); }
    finally { await reopened.close(); }
    await update(db => {
      for (let i = 0; i < 100; i++) db.insert('contactLogs', { id: 'limit_' + i, userId: 'applicant', callSign: 'ANY', qsoAt: now, dedupKey: 'limit_' + i, details: { callSign: 'ANY', qsoAt: now }, createdAt: now, updatedAt: now });
    });
    assert.equal((await create(Array.from({ length: 100 }, (_, i) => 'limit_' + i), 'limit')).body.exchange.selectedContactLogs.length, 100);
    // Reapply only migration 12 to an existing schema-11 exchange, preserving data.
    const schema = '"' + f.databaseSchema + '"';
    await f.db.pool.query(`ALTER TABLE ${schema}.exchanges DROP COLUMN "selectedContactLogs"; DELETE FROM ${schema}.schema_migrations WHERE version=12`);
    await f.db.migrate();
    assert.deepEqual((await detail(id)).body.exchange.selectedContactLogs, []);
    assert.equal((await detail(id)).body.exchange.status, 'pending');
  } finally { await f.cleanup(); }
}
