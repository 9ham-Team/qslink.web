import assert from 'node:assert/strict';
import { fixture } from './helpers/database.mjs';
import cards from '../server/lib/api/cards.js';
import exchanges from '../server/lib/api/exchanges.js';
import database from '../server/lib/db.js';
import validate from '../server/lib/validate.js';
import serialize from '../server/lib/serialize.js';

export async function testCardStock() {
  for (const stock of [-1, 0.1, 2147483648, '2', '', true, {}, [], undefined]) {
    assert.throws(() => validate.validateStock(stock), err => err.status === 400 && !!err.fields.stock);
  }
  for (const stock of [0, 1, 2147483647, null]) assert.equal(validate.validateStock(stock), stock);
  const input = { title: 'stock', ratio: { w: 3, h: 2 }, frontImage: '/uploads/test.png' };
  assert.equal(validate.validateCardCreate(input).stock, null);
  assert.equal(validate.validateCardCreate({ ...input, stock: 5 }).stock, 5);
  assert.deepEqual(validate.validateCardUpdate({ stock: 0 }), { stock: 0 });
  assert.deepEqual(validate.validateCardUpdate({ title: 'new' }), { title: 'new' });

  const f = await fixture();
  const second = new database.Database(f);
  const now = new Date().toISOString();
  const user = id => ({ id, username: id, email: id + '@example.test', displayName: id, callSign: '', bio: '', avatarColor: '#123456', role: 'user', status: 'active', passwordHash: 'test-only', address: null, createdAt: now, updatedAt: now });
  const pending = (id, fromUserId) => ({ id, cardId: 'target', fromUserId, toUserId: 'owner', status: 'pending', message: '', contactName: 'test', fromAddress: { name: 'test' }, createdAt: now, updatedAt: now });
  async function call(routes, pattern, { viewer = 'owner', id = 'target', body = {}, db = f.db, method } = {}) {
    const route = routes.find(r => r.pattern === pattern && (!method || r.method === method));
    return db.transaction(unit => route.handler({ db: unit, user: viewer ? unit.find('users', u => u.id === viewer) : null, params: { id, cardId: id }, body, query: new URLSearchParams(), config: {} }), { write: route.method !== 'GET' });
  }
  const stock = (value, options = {}) => call(cards.routes, '/api/cards/:id/stock', { ...options, body: { stock: value } });
  const approve = (id, db = f.db, body = { confirmNoCards: true }) => call(exchanges.routes, '/api/exchanges/:id/approve', { id, db, body });
  const read = () => f.db.transaction(unit => ({ card: unit.find('cards', c => c.id === 'target'), exchanges: unit.data.exchanges }));
  try {
    await f.db.transaction(unit => {
      ['owner', 'alice', 'bob', 'stranger'].forEach(id => unit.insert('users', user(id)));
      unit.insert('cards', { id: 'target', ownerId: 'owner', title: 'stock', callSign: '', band: '', mode: '', notes: '', backImage: '', ratio: { w: 3, h: 2 }, frontImage: '/uploads/test.png', shareToken: 'legacy_stock', status: 'approved', rejectReason: null, createdAt: now, updatedAt: now });
      unit.insert('exchanges', pending('a', 'alice'));
      unit.insert('exchanges', pending('b', 'bob'));
    }, { write: true });
    // Upgrade an actual pre-stock table without inventing inventory for existing cards.
    await f.db.transaction(async unit => {
      await unit.client.query('ALTER TABLE cards DROP COLUMN stock');
      await unit.client.query('DELETE FROM schema_migrations WHERE version=13');
    }, { write: true });
    await f.db.migrate();
    assert.equal((await read()).card.stock, null);
    await assert.rejects(stock(3, { viewer: null }), err => err.status === 401);
    await assert.rejects(stock(3, { viewer: 'stranger' }), err => err.status === 403);
    await assert.rejects(stock(3, { id: 'missing' }), err => err.status === 404);
    await assert.rejects(stock(-1), err => err.status === 400);
    for (const body of [null, {}, [], { stock: '2' }]) {
      await assert.rejects(call(cards.routes, '/api/cards/:id/stock', { body }), err => err.status === 400);
    }
    const saved = (await stock(1)).body.card;
    assert.equal(saved.stock, 1);
    assert.equal(saved.status, 'approved', 'manual stock changes preserve moderation');
    await assert.rejects(approve('a', f.db, { preferredCardId: 'missing', confirmNoCards: true }), err => err.status === 400);
    assert.equal((await read()).card.stock, 1, 'failed selection never consumes stock');
    const results = await Promise.allSettled([approve('a'), approve('b', second)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1, 'one remaining card can be approved once across connections');
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'OUT_OF_STOCK');
    let state = await read();
    assert.equal(state.card.stock, 0);
    const approved = state.exchanges.find(e => e.status === 'approved');
    const waiting = state.exchanges.find(e => e.status === 'pending');
    await assert.rejects(approve(approved.id), err => err.status === 400);
    await assert.rejects(approve(waiting.id), err => err.code === 'OUT_OF_STOCK');
    await f.db.transaction(unit => {
      assert.equal(serialize.cardDetail(unit, unit.data.cards[0], null).canApply, false);
      assert.equal(serialize.cardPublic(unit, unit.data.cards[0], null).stock, 0);
    });
    await assert.rejects(call(exchanges.routes, '/api/cards/:cardId/exchanges', { viewer: 'stranger', body: { contactName: 'Test', address: { name: 'Test', line1: 'Test', city: 'Test' } } }), err => err.code === 'OUT_OF_STOCK');
    await call(exchanges.routes, '/api/exchanges/:id/complete', { id: approved.id });
    assert.equal((await read()).card.stock, 0, 'completion does not deduct twice');
    await stock(2);
    assert.equal((await second.transaction(unit => unit.data.cards[0])).stock, 2, 'stock persists across database instances');
    await f.db.transaction(unit => {
      unit.insert('cards', { ...unit.data.cards[0], id: 'preferred', ownerId: waiting.fromUserId, shareToken: 'legacy_preferred', shortToken: undefined, stock: 3 });
    }, { write: true });
    await approve(waiting.id, f.db, { preferredCardId: 'preferred' });
    assert.equal((await read()).card.stock, 1);
    assert.equal(await f.db.transaction(unit => unit.find('cards', c => c.id === 'preferred').stock), 3, 'a preferred card does not consume the applicant inventory');
    await stock(null);
    await f.db.transaction(unit => {
      unit.find('exchanges', e => e.id === waiting.id).status = 'completed';
      unit.insert('exchanges', pending('unset', 'stranger'));
    }, { write: true });
    await approve('unset');
    assert.equal((await read()).card.stock, null, 'unset stock preserves legacy exchanges');
    await f.db.transaction(unit => { unit.insert('exchanges', pending('cancel', 'alice')); }, { write: true });
    await stock(4);
    await call(exchanges.routes, '/api/exchanges/:id/cancel', { id: 'cancel', viewer: 'alice' });
    assert.equal((await read()).card.stock, 4, 'pending cancellation never changes stock');
    await assert.rejects(f.db.transaction(unit => { unit.data.cards[0].stock = -1; }, { write: true }));
    assert.equal((await read()).card.stock, 4, 'database rejects negative inventory and rolls back');
    console.log('[card-stock] migration, validation, ownership, persistence, concurrent approvals, zero stock and lifecycle passed');
  } finally { await second.close(); await f.cleanup(); }
}
