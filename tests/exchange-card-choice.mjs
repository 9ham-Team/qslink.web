import assert from 'node:assert/strict';
import { fixture } from './helpers/database.mjs';
import exchanges from '../server/lib/api/exchanges.js';
import database from '../server/lib/db.js';

export async function testExchangeCardChoice() {
  const f = await fixture();
  const now = new Date().toISOString();
  const user = id => ({ id, username: id, email: id + '@example.test', displayName: id, callSign: '', bio: '', avatarColor: '#123456', role: 'user', status: 'active', passwordHash: 'test-only', address: null, createdAt: now, updatedAt: now });
  const card = (id, ownerId, status = 'approved') => ({ id, ownerId, title: id, callSign: '', band: '', mode: '', notes: '', backImage: '', ratio: { w: 3, h: 2 }, frontImage: '/uploads/test.png', shareToken: 'legacy_' + id, status, createdAt: now, updatedAt: now });
  const pending = id => ({ id, cardId: 'target', fromUserId: 'applicant', toUserId: 'owner', status: 'pending', message: '', contactName: 'private', fromAddress: { name: 'private' }, createdAt: now, updatedAt: now });
  async function call(action, { viewer = 'owner', id = 'empty', body = {}, query = '' } = {}) {
    const route = exchanges.routes.find(r => r.pattern === '/api/exchanges/:id' + (action ? '/' + action : ''));
    return f.db.transaction(db => route.handler({ db, user: viewer ? db.find('users', u => u.id === viewer) : null, params: { id }, body, query: new URLSearchParams(query), config: {} }), { write: route.method === 'POST' });
  }
  const rejects = (promise, status) => assert.rejects(promise, err => err.status === status);
  try {
    await f.db.transaction(db => {
      ['owner', 'applicant', 'stranger'].forEach(id => db.insert('users', user(id)));
      db.insert('cards', card('target', 'owner'));
      db.insert('exchanges', pending('empty'));
    }, { write: true });
    const empty = (await call('applicant-cards')).body;
    assert.equal(empty.hasUploadedCards, false); assert.equal(empty.total, 0);
    for (const [viewer, status] of [[null, 401], ['applicant', 403], ['stranger', 403]]) await rejects(call('applicant-cards', { viewer }), status);
    await assert.rejects(call('approve'), err => err.code === 'APPLICANT_HAS_NO_CARDS');
    await rejects(call('approve', { body: { confirmNoCards: 'true' } }), 400);
    assert.equal((await call('approve', { body: { confirmNoCards: true } })).body.exchange.preferredCardId, null);
    await rejects(call('applicant-cards'), 400);
    await f.db.transaction(db => {
      db.insert('cards', card('hidden', 'applicant', 'pending'));
      db.insert('exchanges', { ...pending('hiddenonly'), status: 'cancelled' });
      db.find('exchanges', e => e.id === 'empty').status = 'completed';
      db.find('exchanges', e => e.id === 'hiddenonly').status = 'pending';
    }, { write: true });
    const hidden = (await call('applicant-cards', { id: 'hiddenonly' })).body;
    assert.equal(hidden.hasUploadedCards, true); assert.equal(hidden.total, 0);
    assert.equal((await call('approve', { id: 'hiddenonly' })).body.exchange.preferredCard, null);
    await f.db.transaction(db => {
      db.find('exchanges', e => e.id === 'hiddenonly').status = 'completed';
      db.insert('cards', card('public_a', 'applicant')); db.insert('cards', card('public_b', 'applicant'));
      db.insert('exchanges', pending('choice'));
    }, { write: true });
    const first = (await call('applicant-cards', { id: 'choice', query: 'limit=1' })).body;
    const second = (await call('applicant-cards', { id: 'choice', query: 'limit=1&page=2' })).body;
    assert.equal(first.total, 2); assert.equal(first.pages, 2);
    assert.equal(first.items[0].id, 'public_b'); assert.equal(second.items[0].id, 'public_a');
    assert.ok(!JSON.stringify(first).includes('passwordHash')); assert.ok(!JSON.stringify(first).includes('@example.test'));
    for (const preferredCardId of ['target', 'hidden', 'missing', 42, '']) await rejects(call('approve', { id: 'choice', body: { preferredCardId } }), 400);
    const approved = (await call('approve', { id: 'choice', body: { preferredCardId: 'public_b' } })).body.exchange;
    assert.equal(approved.preferredCard.id, 'public_b'); assert.equal(approved.preferredCardTitle, 'public_b');
    assert.equal((await call('', { id: 'choice', viewer: 'applicant' })).body.exchange.preferredCard.id, 'public_b');
    await rejects(call('approve', { id: 'choice' }), 400);
    await f.db.transaction(db => { db.find('users', u => u.id === 'applicant').status = 'banned'; }, { write: true });
    assert.equal((await call('', { id: 'choice' })).body.exchange.preferredCard, null);
    await f.db.transaction(db => {
      db.find('users', u => u.id === 'applicant').status = 'active';
      database.cascadeDeleteCard(db, 'public_b');
    }, { write: true });
    const deleted = (await call('', { id: 'choice' })).body.exchange;
    assert.equal(deleted.preferredCardId, null); assert.equal(deleted.preferredCardTitle, 'public_b'); assert.equal(deleted.preferredCard, null);
    console.log('[exchange-card-choice] 权限、公开卡片分页、无卡确认、选择持久化与删除历史通过');
  } finally { await f.cleanup(); }
}
