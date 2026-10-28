import assert from 'node:assert/strict';
import { fixture } from './helpers/database.mjs';
import { parseAdif, normalizeRecord } from '../server/lib/adif.js';
import { downloadLotw } from '../server/lib/lotw.js';
import logbook from '../server/lib/api/logbook.js';
import auth from '../server/lib/auth.js';
import { parseTq8 } from '../server/lib/tq8.js';
import { tq8Fixture } from './helpers/tq8.mjs';
import { testTq8 } from './tq8.mjs';

const field = (name, value) => `<${name}:${[...value].length}>${value}`;
const record = (overrides = {}) => Object.entries({ CALL: 'JA1ABC', STATION_CALLSIGN: 'B1AAA', QSO_DATE: '20261028', TIME_ON: '1234', BAND: '20m', MODE: 'FT8', ...overrides }).map(([k,v]) => field(k,v)).join('') + '<EOR>';

export async function testLogbook() {
  testTq8();
  const data = '<ADIF_VER:5>3.1.4<EOH>' + record({ NAME: '测试<EOR>😀' });
  assert.equal(parseAdif(data).records[0].NAME, '测试<EOR>😀');
  assert.equal(normalizeRecord(parseAdif(data).records[0], 'adif').qsoAt, '2026-10-28T12:34:00.000Z');
  for (const text of ['<CALL:99>A', record() + '<CALL:1>X', '<CALL:2>X', '<CALL:x>A<EOR>', '<ADX/>']) assert.throws(() => parseAdif(text), err => err.status === 400);
  for (const patch of [{ QSO_DATE: '20260230' }, { TIME_ON: '2460' }, { CALL: 'bad' }, { BAND: '' }, { NAME: '\0' }]) assert.throws(() => normalizeRecord(parseAdif(record(patch)).records[0], 'adif'));
  assert.equal(normalizeRecord(parseAdif(record({ QSL_RCVD: 'Y' })).records[0], 'adif').lotwConfirmed, false, 'paper QSL is not LoTW confirmation');
  let requests = 0;
  const fakeFetch = async (url, opts) => {
    requests++;
    assert.equal(url.origin, 'https://lotw.arrl.org');
    assert.equal(url.searchParams.get('password'), 'private&secret');
    assert.equal(url.searchParams.get('qso_qsorxsince'), '1900-01-01');
    assert.equal(url.searchParams.get('qso_withown'), 'yes');
    assert.equal(opts.redirect, 'error');
    return new Response('<EOH>' + record({ QSL_RCVD: 'Y' }) + '<APP_LoTW_EOF>');
  };
  const downloaded = await downloadLotw({ username: 'B1AAA', password: 'private&secret' }, fakeFetch);
  assert.equal(requests, 1);
  for (const response of [new Response('invalid private&secret'), new Response('<EOH>' + record()), new Response('error', { status: 403 })]) {
    await assert.rejects(downloadLotw({ username: 'B1AAA', password: 'private&secret' }, async () => response), err => err.status === 502 && !err.message.includes('private&secret'));
  }
  await assert.rejects(downloadLotw({}, fakeFetch), err => err.status === 400);
  await assert.rejects(downloadLotw({ username: 'x', password: 'x' }, async () => { throw new Error('secret url'); }), err => err.status === 502 && !err.message.includes('secret'));
  assert.equal((await downloadLotw({ username: 'x', password: 'x' }, async () => new Response('<EOH><APP_LoTW_EOF>'))).records.length, 0);
  const signedFixture = tq8Fixture();
  const signedData = adif => ({ tq8: signedFixture.make(parseAdif(adif).records) });
  const testFileImport = logbook.createFileImport((encoded, callSign) => parseTq8(encoded, callSign, signedFixture.trust));
  const database = await fixture();
  const member = { id: 'u_logbook', role: 'user', callSign: ' b1aaa ' }, other = { id: 'u_other', role: 'user', callSign: 'B1AAA' };
  async function call(method, suffix = '', user = member, body, query = '') {
    const route = logbook.routes.find(row => row.method === method && row.pattern === '/api/me/logbook' + suffix);
    return database.db.transaction(db => (suffix === '/import' ? testFileImport : route.handler)({ db, user, body, query: new URLSearchParams(query) }), { write: method !== 'GET' });
  }
  try {
    await database.db.transaction(async db => {
      for (const user of [member, other]) {
        const now = new Date().toISOString();
        db.insert('users', { ...user, username: user.id, email: user.id + '@example.invalid', displayName: '测试', bio: '', avatarColor: '#0eaf8f', status: 'active', address: null, passwordHash: 'test-only', createdAt: now, updatedAt: now });
      }
      await db.save();
    }, { write: true });
    await assert.rejects(call('GET', '', null), err => err.status === 401);
    await assert.rejects(call('POST', '/import', null, signedData(data)), err => err.status === 401);
    await assert.rejects(call('POST', '/import', { ...member, callSign: ' ' }, { ...signedData(data), callSign: 'B1AAA' }), err => err.status === 400 && !!err.fields.callSign);
    await assert.rejects(call('POST', '/import', member, {}), err => err.status === 400 && !!err.fields.file);
    await assert.rejects(call('POST', '/import', member, { adif: data, ...signedData(data) }), err => err.status === 400 && !!err.fields.file);
    await assert.rejects(call('POST', '/import', { ...member, callSign: 'B2BBB' }, signedData(data)), err => err.status === 400 && !!err.fields.tq8);
    assert.equal((await call('GET')).body.total, 0, 'mismatched certificate rejects the whole batch');
    const initial = (await call('POST', '/import', member, { ...signedData(data), userId: other.id })).body;
    assert.equal(initial.added, 1);
    assert.equal((await call('GET', '', other)).body.total, 0);
    assert.equal((await call('POST', '/import', member, signedData(data))).body.duplicates, 1);
    const updated = await database.db.transaction(async db => {
      const result = logbook.importRecords(db, member, downloaded, 'lotw');
      await db.save(); return result;
    }, { write: true });
    assert.equal(updated.updated, 1);
    await call('POST', '/import', member, signedData(data));
    const saved = (await call('GET')).body;
    assert.equal(saved.stats.confirmed, 1);
    assert.equal(saved.items[0].source, 'lotw');
    assert.equal(saved.items[0].name, '', 'unsigned TQ8 metadata is ignored');
    assert.equal(saved.items[0].userId, undefined);
    assert.equal((await call('GET', '', member, null, 'q=missing')).body.total, 0);
    await assert.rejects(call('POST', '/import', member, signedData(record({ CALL: 'JA7ZZZ' }) + record({ CALL: '' }))), err => err.status === 400);
    assert.equal((await call('GET')).body.total, 1, 'invalid signed batch is atomic');
    await assert.rejects(call('POST', '/import', member, signedData(record({ CALL: '' }))), err => err.status === 400);
    await assert.rejects(call('POST', '/import', member, { tq8: signedFixture.encode(signedFixture.text(parseAdif(record()).records) + '<CALL:99>x') }), err => err.status === 400);
    assert.equal((await call('GET')).body.total, 1, 'malformed upload is atomic');
    assert.equal((await call('POST', '/import', other, signedData(record()))).body.added, 1, 'dedup is scoped per account');
    const many = Array.from({ length: 26 }, (_, i) => record({ CALL: 'JA' + (i + 2) + 'ABC' })).join('');
    await call('POST', '/import', member, signedData(many));
    assert.equal((await call('GET')).body.items.length, 25);
    assert.equal((await call('GET', '', member, null, 'page=2')).body.items.length, 2);
    await assert.rejects(call('POST', '/import', { ...member, callSign: '' }, { adif: data, callSign: 'B1AAA' }), err => err.status === 400 && !!err.fields.callSign);
    const plainAdif = record({ CALL: 'JA8ADI', STATION_CALLSIGN: '' }).replace('<STATION_CALLSIGN:0>', '');
    assert.equal((await call('POST', '/import', member, { adif: plainAdif, userId: other.id, callSign: 'B2BBB' })).body.added, 1);
    const plainSaved = (await call('GET', '', member, null, 'q=JA8ADI')).body.items[0];
    assert.equal(plainSaved.stationCallSign, 'B1AAA', 'ADIF without station uses the profile callsign');
    assert.equal(plainSaved.source, 'adif');
    assert.equal((await call('GET', '', other, null, 'q=JA8ADI')).body.total, 0);
    assert.equal((await call('POST', '/import', member, { adif: record({ CALL: 'JA8ADI', STATION_CALLSIGN: 'B2BBB', OPERATOR: 'B9ZZZ' }) })).body.duplicates, 1, 'ADIF station and operator cannot override the profile');
    assert.equal((await call('POST', '/import', member, signedData(record({ CALL: 'JA8ADI' })))).body.updated, 1, 'TQ8 support and cross-format dedup remain available');
    await call('POST', '/import', member, { adif: plainAdif });
    assert.equal((await call('GET', '', member, null, 'q=JA8ADI')).body.items[0].source, 'tq8', 'ADIF does not downgrade a signed source');
    await call('POST', '/import', { ...member, callSign: ' b3ccc ' }, { adif: record({ CALL: 'JA8CHG' }) });
    assert.equal((await call('GET', '', member, null, 'q=JA8CHG')).body.items[0].stationCallSign, 'B3CCC');
    const countBeforeInvalid = (await call('GET')).body.total;
    await assert.rejects(call('POST', '/import', member, { adif: record({ CALL: 'JA8BAD' }) + '<CALL:99>x' }), err => err.status === 400);
    assert.equal((await call('GET')).body.total, countBeforeInvalid, 'malformed ADIF does not partially persist');
    const token = await database.db.transaction(async db => { const value = auth.createSession(db, member.id); await db.save(); return value; }, { write: true });
    const lotwRoute = logbook.routes.find(row => row.pattern.endsWith('/lotw'));
    assert.equal(lotwRoute.outsideTransaction, true);
    const req = { headers: { authorization: 'Bearer ' + token } };
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        // This must be possible while the remote download is pending: no write lock is held.
        await database.db.transaction(async db => { auth.destroySession(db, token); await db.save(); }, { write: true });
        return new Response('<EOH>' + record({ CALL: 'JA9ZZZ' }) + '<APP_LoTW_EOF>');
      };
      await assert.rejects(lotwRoute.handler({ db: database.db, req, res: { setHeader() {} }, body: { username: 'B1AAA', password: 'private' } }), err => err.status === 401);
      assert.equal((await call('GET', '', member, null, 'q=JA9ZZZ')).body.total, 0, 'revoked session cannot save downloaded records');
      await assert.rejects(lotwRoute.handler({ db: database.db, req: { headers: {} }, res: {}, body: {} }), err => err.status === 401);
      const otherToken = await database.db.transaction(async db => { const value = auth.createSession(db, other.id); await db.save(); return value; }, { write: true });
      await database.db.transaction(async db => { db.find('users', row => row.id === other.id).callSign = ''; await db.save(); }, { write: true });
      globalThis.fetch = async () => { throw new Error('must not fetch without profile callsign'); };
      const ctx = { db: database.db, req: { headers: { authorization: 'Bearer ' + otherToken } }, res: { setHeader() {} }, body: { username: 'B1AAA', password: 'private' } };
      await assert.rejects(lotwRoute.handler(ctx), err => err.status === 400 && !!err.fields.callSign);
      await database.db.transaction(async db => { db.find('users', row => row.id === other.id).callSign = 'B1AAA'; await db.save(); }, { write: true });
      let fetchCount = 0;
      globalThis.fetch = async () => { fetchCount++; return new Response('<EOH>' + record({ CALL: 'JA9ZZZ', QSL_RCVD: 'Y' }) + '<APP_LoTW_EOF>'); };
      assert.equal((await lotwRoute.handler(ctx)).body.added, 1);
      assert.equal((await call('GET', '', other)).body.stats.confirmed, 1);
      await assert.rejects(lotwRoute.handler(ctx), err => err.status === 429);
      assert.equal(fetchCount, 1, 'cooldown prevents another upstream request');
    } finally { globalThis.fetch = originalFetch; }
    await database.db.transaction(async db => { db.removeWhere('users', row => row.id === member.id); await db.save(); }, { write: true });
    assert.equal(await database.db.transaction(db => db.data.contactLogs.filter(row => row.userId === member.id).length), 0, 'database cascades user deletion');
  } finally { await database.cleanup(); }
}
