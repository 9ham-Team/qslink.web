import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
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
    await legacy.db.pool.query(`DROP TABLE ${schema}."contestJudgingChanges"; DROP TABLE ${schema}."contestScores"; DROP TABLE ${schema}."contestMaterials"; DROP TABLE ${schema}."contestJudges"; DROP TABLE ${schema}."contestJudging"; DROP TABLE ${schema}."contestVotes"; DROP TABLE ${schema}."contestVotingSettings"; DROP TABLE ${schema}."contestWorks"; DROP TRIGGER contest_works_card_delete ON ${schema}.cards; DROP TABLE ${schema}."contestEntries"; DROP FUNCTION ${schema}.scrub_contest_works(); ALTER TABLE ${schema}.announcements DROP COLUMN "eventKey"; DELETE FROM ${schema}.schema_migrations WHERE version >= 14`);
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

async function testContestVoting() {
  const f = await fixture();
  const second = new database.Database(f);
  const now = Date.now();
  const iso = offset => new Date(now + offset).toISOString();
  const day = 24 * 60 * 60 * 1000;
  const worksPath = publicPath + '/works';
  const workPath = worksPath + '/:id';
  const votePath = workPath + '/vote';
  const settingsPath = '/api/admin/contests/:eventKey/voting';
  const exportPath = '/api/admin/contests/:eventKey/votes.xlsx';
  const fingerprint = 'private-device-fingerprint';
  const privateEmail = 'private-voting-entry@example.test';
  const formulaTitle = '=HYPERLINK("https://example.test","card")';
  const formulaUser = '+SUM(1,2)';
  const formulaCallSign = '@SUM(1,2)';
  async function call(method, pattern, { viewer = 'voter', id, body, db = f.db, routes = contests.routes } = {}) {
    const route = routes.find(item => item.method === method && item.pattern === pattern);
    assert.ok(route, method + ' ' + pattern + ' is registered');
    return db.transaction(unit => route.handler({ db: unit, user: viewer ? unit.find('users', item => item.id === viewer) : null,
      params: { eventKey, id }, body, query: new URLSearchParams(), config: {} }), { write: method !== 'GET' });
  }
  const rejects = (promise, status, code) => assert.rejects(promise, err => err.status === status && (!code || err.code === code));
  const vote = (id, options = {}) => call('POST', votePath, { id, body: { fingerprint: options.viewer === 'racer' ? fingerprint + '-racer' : fingerprint }, ...options });
  const detail = (id, options = {}) => call('GET', workPath, { id, ...options }).then(result => result.body);
  const rows = () => f.db.transaction(async unit => (await unit.client.query('SELECT *, "voteDate"::text AS "voteDate" FROM "contestVotes" ORDER BY slot, id')).rows);
  const settings = () => call('GET', settingsPath, { viewer: 'admin' }).then(result => result.body.voting);
  async function configure(startsAt, endsAt) {
    const previous = await settings();
    const result = await call('PUT', settingsPath, { viewer: 'admin', body: { startsAt, endsAt, expectedRevision: previous.revision } });
    assert.equal(result.body.voting.revision, previous.revision + 1);
    return result.body.voting;
  }
  try {
    await f.db.transaction(unit => {
      for (const id of ['admin', 'author', 'author2', 'author3', 'voter', 'racer', 'ineligible']) {
        unit.insert('users', { id, username: id === 'voter' ? formulaUser : id, email: id + '@example.test', displayName: id,
          callSign: id === 'voter' ? formulaCallSign : '', bio: '', avatarColor: '#123456', role: id === 'admin' ? 'admin' : 'user',
          status: 'active', passwordHash: 'private-password-hash', address: null, createdAt: iso(0), updatedAt: iso(0) });
      }
      for (const [id, ownerId, status] of [['work1', 'author', 'approved'], ['work2', 'author', 'approved'], ['work3', 'author2', 'approved'],
        ['work4', 'author2', 'approved'], ['work5', 'author3', 'approved'], ['work6', 'author3', 'approved']]) {
        unit.insert('cards', { id, ownerId, title: id === 'work1' ? formulaTitle : id, callSign: '', band: '', mode: '', notes: '', stock: null,
          backImage: '', ratio: { w: 3, h: 2 }, frontImage: '/uploads/test.png', shareToken: 'private-share-' + id, status,
          rejectReason: null, createdAt: iso(0), updatedAt: iso(0) });
      }
    }, { write: true });
    const works = [];
    for (const [viewer, cardIds] of [['author', ['work1', 'work2']], ['author2', ['work3', 'work4']], ['author3', ['work5', 'work6']]]) {
      const entry = (await call('PUT', entryPath, { viewer, body: { contactEmail: privateEmail,
        works: cardIds.map(cardId => ({ cardId, description: '投票测试作品' })) } })).body.entry;
      const approved = (await call('PUT', reviewPath, { viewer: 'admin', id: entry.id,
        body: { status: 'approved', expectedRevision: entry.revision } })).body.entry;
      works.push(...approved.works);
    }
    const ids = works.map(work => work.id);
    assert.equal(ids.length, 6);
    assert.deepEqual(await settings(), { startsAt: null, endsAt: null, isOpen: false, eligible: true,
      votesUsed: 0, votedWorkIds: [], revision: 0 });
    await rejects(vote(ids[0], { viewer: null }), 401);
    for (const [method, pattern] of [['GET', settingsPath], ['PUT', settingsPath], ['GET', exportPath]]) {
      await rejects(call(method, pattern, { viewer: null }), 401);
      await rejects(call(method, pattern), 403);
    }
    await rejects(vote(ids[0]), 409, 'VOTING_CLOSED');
    assert.equal((await detail(ids[0], { viewer: null })).work.voteCount, 0);
    await configure(iso(day), iso(2 * day));
    await rejects(vote(ids[0]), 409, 'VOTING_CLOSED');
    await configure(iso(-2 * day), iso(-day));
    await rejects(vote(ids[0]), 409, 'VOTING_CLOSED');
    const closed = await configure(null, null);
    assert.equal(closed.startsAt, null);
    assert.equal(closed.endsAt, null);
    assert.equal(closed.isOpen, false);
    await rejects(vote(ids[0]), 409, 'VOTING_CLOSED');
    const open = await configure(iso(-30 * day), iso(30 * day));
    assert.equal(open.revision, closed.revision + 1);
    assert.equal(open.isOpen, true);
    for (const body of [{ startsAt: iso(0), endsAt: iso(0), expectedRevision: open.revision },
      { startsAt: '2026-11-07T12:00:00', endsAt: iso(day), expectedRevision: open.revision },
      { startsAt: iso(-day), endsAt: iso(day) }]) {
      await rejects(call('PUT', settingsPath, { viewer: 'admin', body }), 400);
    }
    await rejects(call('PUT', settingsPath, { viewer: 'admin', body: { startsAt: iso(-day), endsAt: iso(day), expectedRevision: 0 } }), 409, 'REVISION_CONFLICT');
    assert.equal((await detail(ids[0], { viewer: 'voter' })).voting.eligible, true, 'active accounts without cards can vote');
    await f.db.transaction(unit => { unit.find('users', user => user.id === 'ineligible').status = 'banned'; }, { write: true });
    assert.equal((await detail(ids[0], { viewer: 'ineligible' })).voting.eligible, false);
    await rejects(vote(ids[0], { viewer: 'ineligible' }), 403);
    for (const body of [{}, { fingerprint: '' }, { fingerprint: '   ' }, { fingerprint: 123 }, { fingerprint: 'x'.repeat(8193) }]) await rejects(vote(ids[0], { body }), 400);
    const authorEntryId = await f.db.transaction(unit => unit.find('contestWorks', work => work.id === ids[0]).entryId);
    for (const status of ['pending', 'rejected']) {
      // Exercise actual vote SQL, then roll back to leave the quota fixtures intact.
      const rollback = new Error('rollback preview vote');
      await assert.rejects(f.db.transaction(async unit => {
        unit.find('contestEntries', entry => entry.id === authorEntryId).status = status;
        const route = contests.routes.find(item => item.method === 'POST' && item.pattern === votePath);
        const response = await route.handler({ db: unit, user: unit.find('users', u => u.id === 'voter'),
          params: { eventKey, id: ids[0] }, body: { fingerprint: 'preview-vote-' + status } });
        assert.equal(response.body.work.description, '', 'unreviewed text is absent even in the vote response');
        assert.equal(response.body.work.voteCount, 1, 'pending/rejected descriptions do not block voting');
        assert.ok(response.body.work.card.frontImage);
        throw rollback;
      }, { write: true }), error => error === rollback);
    }
    for (const [collection, targetId, field, hidden, visible] of [
      ['contestWorks', ids[0], 'active', false, true],
      ['cards', 'work1', 'status', 'pending', 'approved'], ['users', 'author', 'status', 'banned', 'active'],
    ]) {
      await f.db.transaction(unit => { unit.find(collection, item => item.id === targetId)[field] = hidden; }, { write: true });
      await rejects(detail(ids[0]), 404);
      await rejects(vote(ids[0]), 404);
      assert.equal((await call('GET', worksPath, { viewer: null })).body.items.some(work => work.id === ids[0]), false);
      await f.db.transaction(unit => { unit.find(collection, item => item.id === targetId)[field] = visible; }, { write: true });
    }
    await rejects(detail('missing'), 404);
    await rejects(vote('missing'), 404);
    await call('POST', '/api/cards/:id/like', { id: 'work1', routes: cards.routes });
    const likesBefore = await f.db.transaction(unit => structuredClone(unit.data.likes));
    await f.db.transaction(async unit => {
      await unit.client.query('ALTER TABLE "contestVotes" DROP CONSTRAINT "contestVotes_slot_check", ADD CONSTRAINT "contestVotes_slot_check" CHECK (slot BETWEEN 1 AND 3), ADD CONSTRAINT "contestVotes_eventKey_voterKey_voteDate_key" UNIQUE ("eventKey", "voterKey", "voteDate")');
      await unit.client.query('DELETE FROM schema_migrations WHERE version=18');
    }, { write: true });
    for (let index = 0; index < 3; index++) {
      await vote(ids[index], { viewer: 'racer' });
      await f.db.transaction(unit => unit.client.query('UPDATE "contestVotes" SET "voteDate"="voteDate"-1, "createdAt"="createdAt"-interval \'1 day\' WHERE "userId"=$1', ['racer']), { write: true });
    }
    const legacyVotes = await rows();
    const legacySettings = await settings();
    const legacyWorks = await f.db.transaction(unit => structuredClone(unit.data.contestWorks));
    const legacySecret = await f.db.transaction(async unit => (await unit.client.query("SELECT value FROM app_meta WHERE key='contestVotingSecret'")).rows[0].value);
    await f.db.migrate();
    await f.db.migrate();
    assert.deepEqual(await rows(), legacyVotes, '018 replay preserves every historical audit column');
    assert.deepEqual(await settings(), legacySettings, '018 preserves voting settings and revision');
    assert.deepEqual(await f.db.transaction(unit => unit.data.contestWorks), legacyWorks, '018 preserves work identities');
    assert.equal(await f.db.transaction(async unit => (await unit.client.query("SELECT value FROM app_meta WHERE key='contestVotingSecret'")).rows[0].value), legacySecret);
    assert.equal((await detail(ids[0], { viewer: 'racer' })).voting.votesUsed, 3, 'historical votes occupy the new quota');
    await rejects(vote(ids[0], { viewer: 'racer' }), 409, 'WORK_ALREADY_VOTED');
    const first = (await vote(ids[0])).body;
    assert.equal(first.work.voteCount, 2);
    assert.equal(first.work.card.likeCount, 1);
    assert.deepEqual(first.voting.votedWorkIds, [ids[0]]);
    assert.equal(first.voting.votesUsed, 1);
    assert.equal(Object.hasOwn(first.voting, 'votedToday'), false);
    assert.equal(first.voting.eligible, true);
    assert.deepEqual(await f.db.transaction(unit => unit.data.likes), likesBefore, 'votes never mutate likes');
    await rejects(vote(ids[0]), 409, 'WORK_ALREADY_VOTED');
    for (let index = 1; index < 5; index++) assert.equal((await vote(ids[index])).body.voting.votesUsed, index + 1);
    await rejects(vote(ids[5], { viewer: 'author' }), 409, 'BROWSER_VOTE_LIMIT');
    await rejects(vote(ids[5], { viewer: 'author2' }), 409, 'BROWSER_VOTE_LIMIT');
    const sameDayVotes = (await rows()).filter(row => row.userId === 'voter');
    assert.equal(new Set(sameDayVotes.map(row => row.voteDate)).size, 1, 'five different works can be voted on the same day');
    await rejects(vote(ids[5]), 409, 'TOTAL_VOTE_LIMIT');
    await f.db.transaction(unit => unit.client.query('UPDATE "contestVotes" SET "voteDate"="voteDate"-10, "createdAt"="createdAt"-interval \'10 days\' WHERE "userId"=$1', ['voter']), { write: true });
    await rejects(vote(ids[5]), 409, 'TOTAL_VOTE_LIMIT');
    await rejects(vote(ids[0]), 409, 'WORK_ALREADY_VOTED');
    const duplicate = await Promise.allSettled([vote(ids[3], { viewer: 'racer' }), vote(ids[3], { viewer: 'racer', db: second })]);
    assert.equal(duplicate.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(duplicate.find(result => result.status === 'rejected').reason.code, 'WORK_ALREADY_VOTED');
    const concurrent = await Promise.allSettled([vote(ids[4], { viewer: 'racer' }), vote(ids[5], { viewer: 'racer', db: second })]);
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(concurrent.find(result => result.status === 'rejected').reason.code, 'TOTAL_VOTE_LIMIT');
    const votes = await rows();
    assert.equal(votes.length, 10);
    assert.equal(votes.filter(item => item.userId === 'racer').length, 5);
    for (const userId of ['voter', 'racer']) assert.deepEqual(votes.filter(row => row.userId === userId).map(row => row.slot), [1, 2, 3, 4, 5]);
    assert.deepEqual(votes.filter(row => legacyVotes.some(legacy => legacy.id === row.id)), legacyVotes, 'new votes retain legacy audit records unchanged');
    const secret = await f.db.transaction(async unit => (await unit.client.query("SELECT value FROM app_meta WHERE key='contestVotingSecret'")).rows[0].value);
    assert.match(secret, /^[a-f0-9]{64}$/);
    const hmac = (purpose, value) => crypto.createHmac('sha256', secret).update(JSON.stringify([purpose, eventKey, value])).digest('hex');
    for (const row of votes) {
      assert.equal(row.voterKey, hmac('voter', row.userId));
      assert.equal(row.fingerprintHash, hmac('fingerprint', row.userId === 'racer' ? fingerprint + '-racer' : fingerprint));
      assert.notEqual(row.voterKey, row.fingerprintHash);
      assert.equal(row.voteDate, new Date(row.createdAt.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10));
      assert.equal(row.fingerprintExpiresAt.toISOString(), new Date(Date.parse(open.endsAt) + 90 * day).toISOString());
    }
    await f.db.migrate();
    assert.equal(await f.db.transaction(async unit => (await unit.client.query("SELECT value FROM app_meta WHERE key='contestVotingSecret'")).rows[0].value), secret, 'migration preserves the HMAC key');
    const publicWorks = (await call('GET', worksPath, { viewer: null })).body;
    for (const work of publicWorks.items) assert.equal(work.voteCount, votes.filter(v => v.workId === work.id).length);
    for (const viewer of [null, 'voter']) {
      for (const [pattern, id] of [[publicPath], [worksPath], [workPath, ids[0]]]) {
        const body = (await call('GET', pattern, { viewer, id })).body;
        const text = JSON.stringify(body);
        assert.ok(!/contactEmail|fingerprint|voterKey|passwordHash|fingerprintExpiresAt/.test(text));
        for (const value of [privateEmail, fingerprint, secret, 'private-password-hash', ...votes.flatMap(v => [v.voterKey, v.fingerprintHash])]) assert.ok(!text.includes(value), 'public responses exclude private voting data');
      }
    }
    const exported = await call('GET', exportPath, { viewer: 'admin' });
    assert.equal(exported.headers['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.match(exported.headers['Content-Disposition'], /votes\.xlsx/);
    assert.ok(Buffer.isBuffer(exported.body));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.body);
    assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['作品汇总', '逐票明细']);
    const summary = workbook.getWorksheet('作品汇总');
    const details = workbook.getWorksheet('逐票明细');
    assert.equal(summary.rowCount, ids.length + 1);
    assert.equal(details.rowCount, votes.length + 1);
    assert.equal(summary.getRow(1).getCell(10).value, '票数');
    assert.equal(details.getRow(1).getCell(9).value, '投票日期（北京时间）');
    for (let index = 2; index <= summary.rowCount; index++) {
      const row = summary.getRow(index);
      assert.equal(row.getCell(10).value, votes.filter(v => v.workId === row.getCell(1).value).length);
      assert.equal(row.getCell(3).value, '公开');
      if (row.getCell(1).value === ids[0]) {
        assert.equal(row.getCell(5).value, formulaTitle);
        assert.equal(row.getCell(5).type, ExcelJS.ValueType.String);
      }
    }
    for (let index = 2; index <= details.rowCount; index++) {
      const row = details.getRow(index);
      const stored = votes.find(v => v.id === row.getCell(1).value);
      assert.ok(stored);
      assert.equal(row.getCell(2).value, stored.workId);
      assert.equal(row.getCell(4).value, stored.userId);
      assert.equal(row.getCell(8).value, stored.voterKey);
      assert.equal(row.getCell(9).value, stored.voteDate);
      assert.equal(row.getCell(10).value, stored.createdAt.toISOString());
      assert.equal(row.getCell(11).value, stored.fingerprintHash);
      if (stored.userId === 'voter') {
        assert.equal(row.getCell(5).value, formulaUser);
        assert.equal(row.getCell(6).value, formulaCallSign);
        assert.equal(row.getCell(5).type, ExcelJS.ValueType.String);
        assert.equal(row.getCell(6).type, ExcelJS.ValueType.String);
      }
    }
    for (const sheet of workbook.worksheets) sheet.eachRow(row => row.eachCell(cell => assert.notEqual(cell.type, ExcelJS.ValueType.Formula)));
    const expiringVote = votes.find(row => row.userId === 'voter');
    const votingBeforeExpiry = (await detail(expiringVote.workId)).voting;
    await f.db.transaction(unit => unit.client.query('UPDATE "contestVotes" SET "fingerprintExpiresAt"=now()-interval \'1 day\' WHERE id=$1', [expiringVote.id]), { write: true });
    const expiredExport = new ExcelJS.Workbook();
    await expiredExport.xlsx.load((await call('GET', exportPath, { viewer: 'admin' })).body);
    const expiredRows = [];
    expiredExport.getWorksheet('逐票明细').eachRow((row, index) => {
      if (index > 1 && row.getCell(1).value === expiringVote.id) expiredRows.push(row);
    });
    assert.equal(expiredRows.length, 1);
    assert.ok(!expiredRows[0].getCell(11).value, 'export omits an expired fingerprint before physical cleanup');
    assert.equal((await rows()).find(row => row.id === expiringVote.id).fingerprintHash, expiringVote.fingerprintHash, 'read-only export leaves the stored digest intact');
    const { default: contestVoting } = await import('../server/lib/contest-voting.js');
    await f.db.transaction(unit => contestVoting.cleanup(unit), { write: true });
    const cleanedVotes = await rows();
    assert.equal(cleanedVotes.find(row => row.id === expiringVote.id).fingerprintHash, null);
    assert.deepEqual(cleanedVotes.map(row => [row.id, row.voterKey, row.workId, row.slot]), votes.map(row => [row.id, row.voterKey, row.workId, row.slot]), 'cleanup preserves vote identity, counts and occupied slots');
    assert.deepEqual((await detail(expiringVote.workId)).voting, votingBeforeExpiry, 'digest expiry does not restore voting quota');
    for (const work of (await call('GET', worksPath, { viewer: null })).body.items) {
      assert.equal(work.voteCount, votes.filter(row => row.workId === work.id).length);
    }
    await rejects(vote(ids[5]), 409, 'TOTAL_VOTE_LIMIT');
    await call('DELETE', '/api/admin/users/:id', { viewer: 'admin', id: 'voter', routes: admin.routes });
    assert.ok((await rows()).filter(row => votes.some(v => v.id === row.id && v.userId === 'voter')).every(row => row.userId === null));
    await call('DELETE', '/api/cards/:id', { viewer: 'author', id: 'work1', routes: cards.routes });
    for (const id of ['author', 'author2', 'author3']) await call('DELETE', '/api/admin/users/:id', { viewer: 'admin', id, routes: admin.routes });
    const retained = await rows();
    assert.deepEqual(retained.map(row => row.id), votes.map(row => row.id));
    assert.deepEqual(retained.map(row => [row.voterKey, row.workId]), votes.map(row => [row.voterKey, row.workId]));
    await f.db.transaction(unit => {
      for (const id of ids) {
        const tombstone = unit.find('contestWorks', work => work.id === id);
        assert.ok(tombstone);
        assert.equal(tombstone.active, false);
        assert.equal(tombstone.cardId, null);
        assert.equal(tombstone.entryId, null);
        assert.equal(tombstone.description, '');
      }
    });
    assert.equal((await call('GET', worksPath, { viewer: null })).body.total, 0);
    const historical = new ExcelJS.Workbook();
    await historical.xlsx.load((await call('GET', exportPath, { viewer: 'admin' })).body);
    assert.equal(historical.getWorksheet('作品汇总').rowCount, ids.length + 1);
    assert.equal(historical.getWorksheet('逐票明细').rowCount, votes.length + 1);
    const deletedVoterRows = [];
    historical.getWorksheet('逐票明细').eachRow((row, index) => { if (index > 1 && row.getCell(7).value === '已注销') deletedVoterRows.push(row); });
    assert.equal(deletedVoterRows.length, 5);
    for (const row of deletedVoterRows) {
      assert.ok(!row.getCell(4).value);
      assert.ok(!row.getCell(5).value);
      assert.ok(row.getCell(8).value);
    }
  } finally {
    await second.close();
    await f.cleanup();
  }
}

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
    const { contest, voting } = result.body;
    assert.deepEqual(contest, { key: eventKey, title: '第一届QSLink杯QSL卡片设计大赛', approvedRegistrationCount: count });
    assert.deepEqual(Object.keys(voting).sort(), ['eligible', 'endsAt', 'isOpen', 'startsAt', 'votedWorkIds', 'votesUsed']);
    assert.ok(!/contactEmail|fingerprint|voterKey|passwordHash/.test(JSON.stringify(result.body)), 'public contest excludes private registration and vote data');
  };
  const description = '<script>alert(1)</script> 作品说明';
  const selected = (ids, text = description) => ids.map(cardId => ({ cardId, description: text }));
  const payload = { works: selected(['target']), contactEmail: 'contest-private@example.test' };
  const worksPath = publicPath + '/works';
  const publicWorks = (query = '') => call(contests.routes, 'GET', worksPath, { viewer: null, query }).then(result => result.body);
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
      [card('target'), card('replacement'), card('extra1'), card('extra2'), card('foreign', 'other'), card('race', 'racer'), card('race2', 'racer'), card('pending', 'owner', 'pending'), card('rejected', 'owner', 'rejected')].forEach(item => unit.insert('cards', item));
    }, { write: true });
    await testContestMigration();
    const migration = await fixture();
    try {
      await f.db.transaction(async unit => {
        await migration.db.transaction(target => { target.data.users = structuredClone(unit.data.users); target.data.cards = structuredClone(unit.data.cards); }, { write: true });
      });
      const client = await migration.db.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL search_path TO "${migration.databaseSchema}"`);
        await client.query('DROP TABLE "contestJudgingChanges"; DROP TABLE "contestScores"; DROP TABLE "contestMaterials"; DROP TABLE "contestJudges"; DROP TABLE "contestJudging"; DROP TABLE "contestVotes"; DROP TABLE "contestVotingSettings"; DROP TABLE "contestWorks"; DROP TRIGGER contest_works_card_delete ON cards; DROP TRIGGER contest_works_entry_delete ON "contestEntries"; DROP FUNCTION scrub_contest_works(); ALTER TABLE "contestEntries" ADD COLUMN "cardIds" jsonb, ADD COLUMN description text; DELETE FROM schema_migrations WHERE version >= 16');
        await client.query(`INSERT INTO "contestEntries" (id,"eventKey","userId","cardIds",description,"contactEmail",status,revision,"createdAt","updatedAt") VALUES
          ('older',$1,'owner','["replacement","target"]','旧多卡说明','old@example.test','pending',1,'2026-01-01','2026-01-01'),
          ('newer',$1,'other','["foreign"]','旧单卡说明','old@example.test','pending',1,'2026-02-01','2026-02-01')`, [eventKey]);
        await client.query('COMMIT');
      } finally { client.release(); }
      await migration.db.migrate();
      await migration.db.migrate();
      await migration.db.transaction(unit => {
        assert.deepEqual(unit.data.contestWorks.sort((a, b) => a.number - b.number).map(work => [work.cardId, work.number, work.description]),
          [['replacement', 1, '旧多卡说明'], ['target', 2, '旧多卡说明'], ['foreign', 3, '旧单卡说明']]);
        assert.equal(unit.data.contestEntries[0].description, undefined);
      });
      await migration.db.pool.query(`DELETE FROM "${migration.databaseSchema}".users WHERE id = 'owner'`);
      await migration.db.transaction(unit => {
        const tombstones = unit.data.contestWorks.filter(work => work.number <= 2);
        assert.ok(tombstones.every(work => work.cardId === null && work.entryId === null && work.description === '' && !work.active));
      });
    } finally { await migration.cleanup(); }
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
    for (const body of [null, [], {}, { ...payload, works: selected(['target'], '') }, { ...payload, works: selected(['target'], 'x\0') }, { ...payload, works: selected(['target'], 'x'.repeat(2001)) }, { ...payload, contactEmail: 'invalid' }, { ...payload, contactEmail: 'x'.repeat(121) + '@example.test' }, { ...payload, contactEmail: 'a@example.test\nBcc:x@example.test' }]) {
      await rejects(submit(body), 400);
    }
    await rejects(submit({ ...payload, works: selected(['missing']) }), 400);
    await rejects(submit({ ...payload, works: selected(['foreign']) }), 400);
    for (const cardId of ['pending', 'rejected']) await rejects(submit({ ...payload, works: selected([cardId]) }), 400);
    for (const cardIds of [[], ['target', 'target'], ['target', 'replacement', 'extra1'], ['target', 'replacement', 'extra1', 'extra2'], ['target', 7]]) await rejects(submit({ ...payload, works: selected(cardIds) }), 400);
    let entry = await submit({ ...payload, userId: 'other', status: 'approved', revision: 99, reviewReason: 'forged' });
    assert.equal(entry.userId, 'owner');
    assert.deepEqual(entry.cardIds, ['target']);
    assert.equal(entry.status, 'pending');
    await assertApprovedCount(0);
    assert.equal(entry.revision, 1);
    assert.equal(entry.contactEmail, payload.contactEmail);
    assert.equal(entry.description, undefined);
    assert.equal(entry.works[0].description, description, 'API stores plain text; rendering is responsible for escaping');
    assert.equal(entry.works[0].number, 1);
    const originalWork = entry.works[0];
    assert.equal((await publicWorks()).total, 1, 'gallery-approved images are public before description approval');
    assert.equal((await publicWorks()).items[0].description, '');
    assert.ok(!JSON.stringify(await publicWorks()).includes(description), 'unreviewed description never leaves the public API');
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
    await rejects(submit({ ...payload, works: selected(['target', 'replacement', 'extra1']), expectedRevision: entry.revision }), 400);
    assert.equal((await get()).revision, entry.revision, 'over-limit update leaves the entry unchanged');
    const multi = await submit({ ...payload, works: selected(['target', 'replacement']), expectedRevision: entry.revision });
    assert.deepEqual(multi.cardIds, ['target', 'replacement']);
    assert.equal(multi.cards.length, 2);
    const approvedMulti = await review(multi);
    assert.equal(multi.works[0].submittedAt, originalWork.submittedAt);
    assert.deepEqual(approvedMulti.works.map(work => work.number), [1, 2]);
    await f.db.transaction(unit => {
      unit.find('cards', item => item.id === 'target').callSign = 'BH1AbC';
      unit.find('cards', item => item.id === 'replacement').callSign = 'BH2XYZ';
    }, { write: true });
    await f.db.transaction(unit => { unit.find('users', item => item.id === 'owner').status = 'banned'; }, { write: true });
    assert.equal((await publicWorks()).total, 0);
    await f.db.transaction(unit => {
      unit.find('users', item => item.id === 'owner').status = 'active';
      unit.find('cards', item => item.id === 'target').status = 'pending';
    }, { write: true });
    assert.equal((await publicWorks()).total, 1);
    await f.db.transaction(unit => { unit.find('cards', item => item.id === 'target').status = 'approved'; }, { write: true });
    const firstPage = await publicWorks('limit=1');
    assert.equal(firstPage.total, 2);
    assert.equal(firstPage.items[0].description, description, 'approval publishes the description');
    assert.equal(firstPage.pages, 2);
    assert.deepEqual(Object.keys(firstPage.items[0]).sort(), ['card', 'description', 'id', 'number', 'submittedAt', 'voteCount']);
    assert.equal(firstPage.items[0].card.owner.id, 'owner');
    assert.ok(firstPage.items[0].card.frontImage);
    assert.equal(firstPage.items[0].card.owner.email, undefined);
    assert.ok(!JSON.stringify(firstPage).includes('contactEmail'));
    assert.ok(!JSON.stringify(firstPage).includes('reviewReason'));
    assert.equal((await publicWorks('page=2&limit=1')).items[0].number, 2);
    assert.equal((await publicWorks('q=bh1a')).items[0].number, 1);
    assert.equal((await publicWorks('q=001')).items[0].number, 1);
    assert.equal((await publicWorks('q=1')).items[0].number, 1);
    assert.equal((await publicWorks('q=not-found')).total, 0);
    assert.equal((await publicWorks('page=4&limit=1')).items.length, 0);
    await assertApprovedCount(1);
    entry = await submit({ ...payload, expectedRevision: approvedMulti.revision });
    assert.deepEqual(entry.cardIds, ['target']);
    assertPending(entry, approvedMulti);
    await assertApprovedCount(0);
    assert.equal((await publicWorks()).total, 1, 'resubmission keeps the remaining image visible');
    assert.equal((await publicWorks()).items[0].description, '');
    const readded = await submit({ ...payload, works: selected(['target', 'replacement']), expectedRevision: entry.revision });
    assert.equal(readded.works[1].number, multi.works[1].number);
    assert.equal(readded.works[1].submittedAt, multi.works[1].submittedAt);
    entry = await submit({ ...payload, expectedRevision: readded.revision });
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
    entry = await submit({ ...payload, works: selected(['target'], '修改后的作品说明'), expectedRevision: entry.revision });
    assertPending(entry, approved);
    await assertApprovedCount(0);
    assert.equal((await publicWorks()).items[0].description, '', 'editing an approved description hides the new text pending review');
    await rejects(review(approved), 409);
    await rejects(submit({ ...payload, expectedRevision: approved.revision }), 409);
    await rejects(call(contests.routes, 'PUT', reviewPath, { viewer: 'admin', id: entry.id, body: { status: 'rejected', reviewReason: '', expectedRevision: entry.revision } }), 400);
    for (const body of [{ status: 'approved' }, { status: 'pending', expectedRevision: entry.revision }, { status: 'approved', expectedRevision: '1' }]) {
      await rejects(call(contests.routes, 'PUT', reviewPath, { viewer: 'admin', id: entry.id, body }), 400);
    }
    entry = await review(entry, 'rejected');
    assert.equal(entry.status, 'rejected');
    await assertApprovedCount(0);
    assert.equal((await publicWorks()).total, 1, 'rejecting text does not hide an approved image');
    assert.equal((await publicWorks()).items[0].description, '');
    assert.equal(entry.reviewReason, '请完善作品说明');
    const rejected = entry;
    entry = await submit({ ...payload, works: selected(['target'], '完善作品说明后重提'), expectedRevision: entry.revision });
    assertPending(entry, rejected);
    assert.equal(entry.id, rejected.id);
    const beforeEmail = entry;
    entry = await submit({ ...payload, works: selected(['target'], '完善作品说明后重提'), contactEmail: 'changed@example.test', expectedRevision: entry.revision });
    assertPending(entry, beforeEmail);
    const unicode = await submit({ ...payload, works: selected(['target'], String.fromCodePoint(0x1f600).repeat(2000)), expectedRevision: entry.revision });
    assert.equal(Array.from(unicode.works[0].description).length, 2000);
    await rejects(submit({ ...payload, works: [{ cardId: 'target' }], expectedRevision: unicode.revision }), 400);
    await rejects(submit({ ...payload, works: selected(['target', 'replacement'], ' '), expectedRevision: unicode.revision }), 400);
    entry = await submit({ ...payload, expectedRevision: unicode.revision });

    const racing = await Promise.allSettled([submit({ ...payload, works: selected(['race']) }, { viewer: 'racer' }), submit({ ...payload, works: selected(['race']) }, { viewer: 'racer', db: second })]);
    assert.ok(racing.some(result => result.status === 'fulfilled'));
    for (const result of racing.filter(item => item.status === 'rejected')) assert.ok([400, 409].includes(result.reason.status));
    assert.equal(await f.db.transaction(unit => unit.data.contestEntries.filter(item => item.userId === 'racer').length), 1, 'concurrent creation keeps one entry per account');
    await Promise.all([
      submit({ ...payload, works: selected(['foreign']) }, { viewer: 'other' }),
      submit({ ...payload, works: selected(['race', 'race2']), expectedRevision: (await get({ viewer: 'racer' })).revision }, { viewer: 'racer', db: second }),
    ]);
    await f.db.transaction(unit => {
      const numbers = unit.data.contestWorks.map(work => work.number);
      assert.equal(new Set(numbers).size, numbers.length);
    });
    const concurrent = await Promise.allSettled([
      submit({ ...payload, works: selected(['target'], '并发更新 A'), expectedRevision: entry.revision }),
      submit({ ...payload, works: selected(['target'], '并发更新 B'), expectedRevision: entry.revision }, { db: second }),
    ]);
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(concurrent.find(result => result.status === 'rejected').reason.status, 409);
    entry = await get();
    const list = (await call(contests.routes, 'GET', adminPath, { viewer: 'admin', query: 'status=pending&limit=1' })).body;
    assert.equal(list.total, 3);
    assert.equal(list.pages, 3);
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
    assert.equal((await publicWorks()).items.some(item => item.card.id === 'target'), false);
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
    await f.db.transaction(unit => {
      const tombstone = unit.find('contestWorks', work => work.number === originalWork.number);
      assert.equal(tombstone.cardId, null);
      assert.equal(tombstone.entryId, null);
      assert.equal(tombstone.description, '');
      assert.equal(tombstone.active, false);
    });
    assertPending(updated, entry);
    await rejects(review(updated), 400);
    entry = await submit({ ...payload, works: selected(['replacement']), expectedRevision: updated.revision });
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
    const maxNumber = await f.db.transaction(unit => Math.max(...unit.data.contestWorks.map(work => work.number)));
    let otherEntry = await get({ viewer: 'other' });
    await f.db.transaction(unit => { unit.insert('cards', card('after_tombstone', 'other')); }, { write: true });
    otherEntry = await submit({ ...payload, works: selected(['after_tombstone']), expectedRevision: otherEntry.revision }, { viewer: 'other' });
    assert.equal(otherEntry.works[0].number, maxNumber + 1);
    await f.db.transaction(unit => {
      assert.ok(unit.data.contestWorks.filter(work => [1, 2].includes(work.number)).every(work => work.cardId === null && work.entryId === null && work.description === ''));
    });
    await testContestVoting();
    console.log('[contests] migration, numbered works, permissions, privacy, search, pagination, revisions, moderation, tombstones and voting passed');
  } finally {
    await second.close();
    await f.cleanup();
  }
}
