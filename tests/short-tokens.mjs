import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fixture } from './helpers/database.mjs';

const require = createRequire(import.meta.url);
const { createShortToken } = require('../server/lib/short-token');
const { Database, cascadeDeleteCard } = require('../server/lib/db');
const serialize = require('../server/lib/serialize');
const routes = require('../server/lib/api/cards').routes;

export async function testShortTokens() {
  const original = crypto.randomInt;
  let calls = 0;
  try {
    crypto.randomInt = max => {
      assert.equal(max, 52, 'crypto.randomInt uses an unbiased 52-letter range');
      return Math.floor(calls++ / 6);
    };
    assert.equal(createShortToken([{ shortToken: 'AAAAAA' }, { shareToken: 'BBBBBB' }]), 'CCCCCC');
    assert.equal(calls, 18, 'both new and historical collisions are retried');
  } finally {
    crypto.randomInt = original;
  }
  const random = Array.from({ length: 2000 }, () => createShortToken([]));
  random.forEach(token => assert.match(token, /^[A-Za-z]{6}$/));
  assert.ok(random.some(token => /[a-z]/.test(token)) && random.some(token => /[A-Z]/.test(token)));

  const f = await fixture();
  const second = new Database(f);
  try {
    const now = new Date().toISOString();
    await f.db.transaction(unit => {
      unit.insert('users', { id: 'owner', username: 'owner', email: 'owner@example.test', displayName: 'Owner', callSign: '', bio: '', avatarColor: '#123456', role: 'user', status: 'active', passwordHash: 'test-only', address: null, createdAt: now, updatedAt: now });
      for (const [id, shareToken, shortToken] of [['first', 'AbCdEf', 'AAAAAA'], ['second', 'legacy_second', 'aaaaaa']]) {
        unit.insert('cards', { id, ownerId: 'owner', title: id, callSign: '', band: '', mode: '', notes: '', ratio: { w: 3, h: 2 }, frontImage: '', backImage: '', shareToken, shortToken, status: 'approved', rejectReason: null, createdAt: now, updatedAt: now });
      }
    }, { write: true });
    const publicRoute = routes.find(route => route.pattern === '/api/public/cards/:shareToken').handler;
    async function lookup(token) {
      return f.db.transaction(db => publicRoute({ db, params: { shareToken: token }, user: null }));
    }
    assert.equal((await lookup('AAAAAA')).body.card.id, 'first');
    assert.equal((await lookup('aaaaaa')).body.card.id, 'second', 'tokens are case-sensitive');
    assert.equal((await lookup('AbCdEf')).body.card.id, 'first', 'six-letter historical tokens keep their card');
    assert.equal((await lookup('legacy_second')).body.card.shareToken, 'aaaaaa');
    const shareRoute = routes.find(route => route.pattern === '/api/cards/:id/share').handler;
    const shared = await Promise.all(Array.from({ length: 12 }, () => f.db.transaction(db => shareRoute({ db, params: { id: 'first' }, user: db.data.users[0], config: { publicOrigin: 'https://example.test' } }))));
    shared.forEach(result => assert.equal(result.body.url, 'https://example.test/s/AAAAAA'));
    await assert.rejects(f.db.transaction(db => shareRoute({ db, params: { id: 'first' }, user: { id: 'stranger', role: 'user' } })), err => err.status === 403);
    await f.db.transaction(unit => {
      const card = unit.data.cards[0];
      assert.equal(serialize.exchangeItem(unit, { id: 'exchange', cardId: card.id, fromUserId: 'owner', toUserId: 'owner', status: 'pending' }, null).card.shareToken, card.shortToken);
    });
    for (const patch of [{ shortToken: 'AAAAAA' }, { shortToken: 'AbCdEf' }, { shareToken: 'AAAAAA' }]) {
      await assert.rejects(f.db.transaction(unit => Object.assign(unit.data.cards[1], patch), { write: true }), err => err.status === 409);
    }
    for (const shortToken of ['', 'abc123', 'abcde', 'abcdefg', '中文中文中文']) {
      await assert.rejects(f.db.transaction(unit => { unit.data.cards[1].shortToken = shortToken; }, { write: true }), err => err.status === 400);
    }
    const originalCards = await f.db.transaction(unit => unit.data.cards);
    await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? f.db : second).transaction(unit => {
      unit.insert('cards', { ...unit.data.cards[0], id: 'parallel_' + i, shareToken: 'legacy_parallel_' + i, shortToken: undefined });
    }, { write: true })));
    const all = await f.db.transaction(unit => unit.data.cards);
    assert.equal(new Set(all.map(card => card.shortToken)).size, 22);
    all.forEach(card => assert.match(card.shortToken, /^[A-Za-z]{6}$/));
    await Promise.all([f.db.migrate(), second.migrate()]);
    assert.deepEqual(await f.db.transaction(unit => unit.data.cards), all, 'restarting preserves tokens');

    const schema = '"' + f.databaseSchema + '"';
    await f.db.pool.query(`DROP TRIGGER cards_share_tokens_sync ON ${schema}.cards; DROP FUNCTION ${schema}.sync_card_share_tokens(); DROP TABLE ${schema}.card_share_tokens; ALTER TABLE ${schema}.cards DROP COLUMN "shortToken"; DELETE FROM ${schema}.schema_migrations WHERE version=8`);
    await Promise.all([f.db.migrate(), second.migrate()]);
    const migrated = await f.db.transaction(unit => unit.data.cards);
    assert.equal(migrated.length, all.length);
    assert.deepEqual(migrated.map(card => [card.id, card.shareToken]).sort(), all.map(card => [card.id, card.shareToken]).sort());
    assert.equal(new Set(migrated.map(card => card.shortToken)).size, all.length);
    assert.ok(!migrated.some(card => migrated.some(other => other.id !== card.id && other.shareToken === card.shortToken)));
    await f.db.migrate();
    assert.deepEqual(await f.db.transaction(unit => unit.data.cards), migrated);
    assert.equal((await lookup(originalCards[0].shareToken)).body.card.id, 'first');
    for (const status of ['pending', 'rejected']) {
      await f.db.transaction(unit => { unit.data.cards[0].status = status; }, { write: true });
      for (const token of [migrated[0].shortToken, migrated[0].shareToken]) await assert.rejects(lookup(token), err => err.status === 404);
    }
    await f.db.transaction(unit => { unit.data.cards[0].status = 'approved'; unit.data.users[0].status = 'banned'; }, { write: true });
    for (const token of [migrated[0].shortToken, migrated[0].shareToken]) await assert.rejects(lookup(token), err => err.status === 404);
    await f.db.transaction(unit => { unit.data.users[0].status = 'active'; cascadeDeleteCard(unit, 'first'); }, { write: true });
    for (const token of [migrated[0].shortToken, migrated[0].shareToken]) await assert.rejects(lookup(token), err => err.status === 404);
    const registry = await f.db.pool.query(`SELECT * FROM ${schema}.card_share_tokens WHERE "cardId"='first'`);
    assert.equal(registry.rowCount, 0);
  } finally {
    await second.close();
    await f.cleanup();
  }

  const QSL = { escapeHtml: value => String(value), escapeAttr: value => String(value) };
  const context = { window: { QSL }, location: { origin: 'https://example.test' }, document: { addEventListener() {} }, navigator: {}, console, setTimeout, clearTimeout };
  vm.runInNewContext(await fs.readFile(new URL('../public/js/ui.js', import.meta.url), 'utf8'), context);
  let copied;
  QSL.copyText = async text => { copied = text; return true; };
  await QSL.shareCard({ id: 'first', shareToken: 'AbCdEf' });
  assert.equal(copied, 'https://example.test/s/AbCdEf');
  QSL.api = { cards: { share: async () => ({ shareToken: 'AbCdEf', url: 'https://configured.test/s/AbCdEf' }) } };
  await QSL.shareCard({ id: 'first' });
  assert.equal(copied, 'https://configured.test/s/AbCdEf');
  QSL.api.cards.share = async () => { throw new Error('not owner'); };
  await QSL.shareCard({ id: 'first' });
  assert.equal(copied, 'https://example.test/card/first');
}
