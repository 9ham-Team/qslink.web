import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { fixture } from './helpers/database.mjs';
import auth from '../server/lib/auth.js';
import judging from '../server/lib/contest-judging.js';
import admin from '../server/lib/api/admin.js';
import me from '../server/lib/api/me.js';
import { Database } from '../server/lib/db.js';

const eventKey = 'qsl-design-2026-11';
const adminPath = '/api/admin/contests/:eventKey/judging';
const judgePath = '/api/contests/:eventKey/judging';

// All files live in an OS-temp directory, never an application's uploads/data.
export async function createJudgingFixture() {
  const f = await fixture();
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qslink-judging-'));
  const uploadsDir = path.join(dataDir, 'uploads');
  await fs.mkdir(uploadsDir);
  const image = await sharp({ create: { width: 2200, height: 1100, channels: 3, background: '#347799' } }).png().toBuffer();
  await fs.writeFile(path.join(uploadsDir, 'original.png'), image);
  const adminToken = crypto.randomBytes(24).toString('hex');
  const judgeTokens = Array.from({ length: 5 }, () => crypto.randomBytes(24).toString('hex'));
  const ids = ['judge1','judge2','judge3','judge4','judge5'];
  const now = new Date().toISOString();
  await f.db.transaction(unit => {
    for (const id of ['admin', 'author', 'outsider', ...ids]) {
      unit.insert('users', { id, username: id, email: id + '@example.test', displayName: id, callSign: '', bio: '', avatarColor: '#123456',
        role: id === 'admin' ? 'admin' : 'user', status: 'active', passwordHash: auth.hashPassword('JudgingFixture!2026'), address: null, createdAt: now, updatedAt: now });
    }
    for (const [userId, token] of [['admin', adminToken], ...ids.map((id,i) => [id, judgeTokens[i]])]) {
      unit.insert('sessions', { userId, token, createdAt: now, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    }
    unit.insert('contestEntries', { id: 'entry', eventKey, userId: 'author', contactEmail: 'secret-author-contact@example.test', status: 'approved',
      reviewReason: null, reviewedBy: 'admin', reviewedAt: now, revision: 1, createdAt: now, updatedAt: now });
    for (let number = 1; number <= 2; number++) {
      unit.insert('cards', { id: 'card' + number, ownerId: 'author', title: number === 1 ? '=HYPERLINK("https://invalid.test")' : 'Frozen second title', callSign: '',
        band: '', mode: '', notes: '', stock: null, ratio: { w: 2, h: 1 }, frontImage: '/uploads/original.png',
        backImage: number === 1 ? '/uploads/original.png' : '', shareToken: 'private-share-token-' + number,
        status: 'approved', rejectReason: null, createdAt: now, updatedAt: now });
      unit.insert('contestWorks', { id: 'work' + number, eventKey, entryId: 'entry', cardId: 'card' + number,
        number, description: 'Frozen description ' + number, submittedAt: now, active: true });
    }
  }, { write: true });
  return { ...f, eventKey, dataDir, uploadsDir, config: { dataDir, uploadsDir }, adminToken, judgeTokens, ids,
    async cleanup() { await fs.rm(dataDir, { recursive: true, force: true }); await f.cleanup(); } };
}

export async function testContestJudging() {
  const f = await createJudgingFixture();
  const second = new Database(f);
  const rejects = (promise, status, code) => assert.rejects(promise, error => error.status === status && (!code || error.code === code));
  async function call(method, pattern, { viewer = 'admin', id, side, body, query = '', db = f.db, reqToken } = {}) {
    const route = judging.routes.find(route => route.method === method && route.pattern === pattern);
    assert.ok(route, method + ' ' + pattern);
    if (route.outsideTransaction) {
      const token = reqToken || (viewer === 'admin' ? f.adminToken : f.judgeTokens[f.ids.indexOf(viewer)]);
      return route.handler({ db, config: f.config, req: { headers: { authorization: token ? 'Bearer ' + token : '' } }, params: { eventKey, id }, body });
    }
    return db.transaction(unit => route.handler({ db: unit, config: f.config, dataDir: f.dataDir, uploadsDir: f.uploadsDir,
      user: viewer ? unit.find('users', u => u.id === viewer) : null, params: { eventKey, id, side }, body, query: new URLSearchParams(query) }), { write: method !== 'GET' });
  }
  const settings = () => call('GET', adminPath).then(r => r.body.judging);
  const own = (viewer = 'judge1') => call('GET', judgePath, { viewer }).then(r => r.body);
  const score = (viewer, id, value, revision = 0, options = {}) => call('PUT', judgePath + '/materials/:id/score', {
    viewer, id, body: { expectedRevision: revision, score: value, comment: 'private-comment-' + viewer }, ...options,
  });
  const configure = async (extra = {}) => call('PUT', adminPath, { body: { expectedRevision: (await settings()).revision,
    deadline: new Date(Date.now() + 3600000).toISOString(), judgeUserIds: f.ids, ...extra } });
  const start = () => settings().then(s => call('POST', adminPath + '/start', { body: { expectedRevision: s.revision } }));
  const zip = query => call('GET', adminPath + '/materials.zip', { query });
  const result = () => call('GET', adminPath + '/results').then(r => r.body);
  const setDeadline = time => f.db.transaction(unit => unit.client.query('UPDATE "contestJudging" SET deadline=$2 WHERE id=$1', [eventKey, time]), { write: true });
  try {
    await f.db.transaction(async unit => {
      const judge = unit.find('users', u => u.id === 'judge1');
      const list = admin.routes.find(r => r.method === 'GET' && r.pattern === '/api/admin/users');
      const found = await list.handler({ db: unit, user: unit.find('users', u => u.id === 'admin'), query: new URLSearchParams({ q: judge.uid, role: 'user', status: 'active' }) });
      assert.deepEqual(found.body.items.map(u => u.id), ['judge1'], 'admin judge picker supports UID');
    });
    assert.deepEqual(await settings(), { revision: 0, deadline: null, frozenAt: null, materialVersion: null, totalWorks: 0, judges: [], canViewResults: false });
    for (const pattern of [adminPath, adminPath + '/results', adminPath + '/scores.xlsx', adminPath + '/materials.zip']) {
      await rejects(call('GET', pattern, { viewer: null }), 401);
      await rejects(call('GET', pattern, { viewer: 'outsider' }), 403);
    }
    await rejects(call('GET', judgePath, { viewer: 'admin' }), 403);
    await rejects(call('GET', judgePath, { viewer: 'outsider' }), 403);
    await rejects(configure({ judgeUserIds: [...f.ids.slice(0,4), 'admin'] }), 400);
    await rejects(configure({ judgeUserIds: [...f.ids.slice(0,4), 'judge1'] }), 400);
    await rejects(configure({ deadline: '2026-02-30T00:00:00Z' }), 400);
    await rejects(configure({ deadline: '2026-12-01T00:00:00' }), 400);
    await rejects(configure({ expectedRevision: 1 }), 409, 'REVISION_CONFLICT');
    await configure();
    assert.equal((await own()).judging.isOpen, false);
    assert.deepEqual((await own()).items, []);
    await rejects(score('judge1','work1',1), 409, 'JUDGING_NOT_STARTED');
    await rejects(result(), 403);
    await rejects(call('GET', adminPath + '/scores.xlsx'), 403);
    await rejects(call('POST', judgePath + '/submit', { viewer: 'judge1', body: { expectedRevision: 0 } }), 409);
    // Only own preparation directories are removed; no source uploads touched.
    await f.db.transaction(unit => { unit.find('cards', c => c.id === 'card1').frontImage = 'https://invalid.test/private.png'; }, { write: true });
    await rejects(start(), 400);
    assert.deepEqual(await fs.readdir(path.join(f.dataDir,'judging')), []);
    assert.ok(await fs.stat(path.join(f.uploadsDir,'original.png')));
    await f.db.transaction(unit => { unit.find('cards', c => c.id === 'card1').frontImage = '/uploads/../outside.png'; }, { write: true });
    await rejects(start(), 400);
    await f.db.transaction(unit => { unit.find('cards', c => c.id === 'card1').frontImage = '/uploads/original.png'; }, { write: true });
    const originalBytes = await fs.readFile(path.join(f.uploadsDir, 'original.png'));
    await fs.truncate(path.join(f.uploadsDir, 'original.png'), 10 * 1024 * 1024 + 1);
    await rejects(start(), 400);
    await fs.writeFile(path.join(f.uploadsDir, 'original.png'), originalBytes);
    const competingStarts = await Promise.allSettled([start(), start()]);
    assert.equal(competingStarts.filter(r => r.status === 'fulfilled').length, 1, 'only one concurrent start can finalize');
    assert.equal(competingStarts.filter(r => r.status === 'rejected').length, 1);
    assert.equal((await fs.readdir(path.join(f.dataDir, 'judging'))).length, 1, 'losing preparation cleans only its own directory');
    const started = competingStarts.find(r => r.status === 'fulfilled').value.body.judging;
    assert.equal(started.revision, 2);
    assert.match(started.materialVersion, /^[a-f0-9]{64}$/);
    assert.equal(started.totalWorks, 2);
    await configure({ judgeUserIds: [...f.ids].reverse() });
    assert.equal((await settings()).materialVersion, started.materialVersion);
    assert.equal((await own()).judging.slot, 1, 'reordering preserves judge slots');
    for (const [viewer, allowed] of [['judge1', true], ['outsider', false], ['admin', false]]) {
      const overview = await f.db.transaction(unit => me.routes.find(r => r.pattern === '/api/me/overview').handler({ db: unit, user: unit.find('users', u => u.id === viewer) }));
      assert.equal(overview.body.canJudgeContest, allowed);
    }
    await rejects(start(), 409, 'JUDGING_STARTED');
    const ownBefore = await own();
    assert.equal(ownBefore.judging.slot, 1);
    assert.equal(ownBefore.judging.revision, 0);
    assert.ok(ownBefore.items.every(w => w.score === null));
    assert.equal(ownBefore.items[1].backUrl, null);
    assert.ok(!JSON.stringify(ownBefore).includes('private-share'));
    const updateUser = (id, body) => f.db.transaction(unit => admin.routes.find(r => r.method === 'PUT' && r.pattern === '/api/admin/users/:id').handler({
      db: unit, user: unit.find('users', u => u.id === 'admin'), params: { id }, body,
    }), { write: true });
    await rejects(updateUser('judge1', { newPassword: 'Replacement!2026' }), 409, 'JUDGING_ACCOUNT_LOCKED');
    await updateUser('judge1', { role: 'admin' });
    await rejects(updateUser('judge1', { newPassword: 'Replacement!2026' }), 409, 'JUDGING_ACCOUNT_LOCKED');
    await updateUser('judge1', { role: 'user' });
    await updateUser('outsider', { newPassword: 'Replacement!2026' });
    const imageRoute = judgePath + '/materials/:id/:side';
    await rejects(call('GET', imageRoute, { viewer: null, id: 'work1', side: 'front' }), 401);
    await rejects(call('GET', imageRoute, { viewer: 'outsider', id: 'work1', side: 'front' }), 403);
    await rejects(call('GET', imageRoute, { viewer: 'judge1', id: 'work1', side: 'nope' }), 404);
    const imageBefore = (await call('GET', imageRoute, { viewer: 'judge1', id: 'work1', side: 'front' })).body;
    assert.equal((await sharp(imageBefore).metadata()).width, 1920);
    assert.equal((await sharp(imageBefore).metadata()).height, 960);
    for (const body of [{ score: 10.1 }, { score: -1 }, { score: 0.11 }, { score: '5' }, { comment: 'x'.repeat(1001) }, { comment: '\0' }, { expectedRevision: -1 }]) {
      await rejects(score('judge1','work1',5,0,{ body: { expectedRevision: 0, score: 5, comment: '', ...body } }), 400);
    }
    await rejects(score('admin','work1',5), 403);
    await rejects(score('outsider','work1',5), 403);
    await rejects(score('judge1','missing',5), 404);
    const concurrent = await Promise.allSettled([score('judge1','work1',0), score('judge1','work1',10,0,{ db: second })]);
    assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(concurrent.find(r => r.status === 'rejected').reason.code, 'REVISION_CONFLICT');
    assert.equal((await own()).judging.revision, 1);
    await rejects(call('POST', judgePath + '/submit', { viewer: 'judge1', body: { expectedRevision: 1 } }), 409, 'JUDGING_INCOMPLETE');
    assert.equal((await own('judge2')).items[0].score, null);
    const progressText = JSON.stringify(await settings());
    assert.ok(!progressText.includes('private-comment') && !progressText.includes('value') && !progressText.includes('humanScore'));
    assert.equal((await settings()).judges[0].scoredCount, 1);
    await rejects(result(), 403);
    await rejects(call('GET', adminPath + '/scores.xlsx'), 403);
    // The material export has no input from the private score collection.
    const firstZip = (await zip('from=1&to=2')).body;
    const archive = await JSZip.loadAsync(firstZip);
    const manifest = JSON.parse(await archive.file('manifest.json').async('string'));
    const template = JSON.parse(await archive.file('template.json').async('string'));
    assert.equal(manifest.materialVersion, started.materialVersion);
    assert.equal(manifest.items.length, 2);
    assert.equal(template.items[0].aiScore, null);
    const allZipText = (await Promise.all(Object.values(archive.files).filter(file => !file.dir && !file.name.endsWith('.webp')).map(file => file.async('string')))).join('');
    for (const secret of ['private-comment','private-share','secret-author-contact','storageKey','userId','submittedAt','judge1','passwordHash','humanScore']) assert.ok(!allZipText.includes(secret), secret + ' excluded');
    assert.deepEqual(await archive.file('1/front.webp').async('nodebuffer'), imageBefore);
    for (const query of ['', 'from=1&to=21', 'from=2&to=1', 'from=0&to=2', 'from=1.2&to=2']) await rejects(zip(query), 400);
    await rejects(zip('from=50&to=51'), 404);
    // Mutating or deleting source records and bytes cannot alter frozen judging.
    await f.db.transaction(unit => {
      unit.find('cards', c => c.id === 'card1').title = 'changed source title';
      unit.find('contestWorks', w => w.id === 'work1').description = 'changed source description';
      unit.removeWhere('cards', c => c.id === 'card2');
    }, { write: true });
    await fs.unlink(path.join(f.uploadsDir,'original.png'));
    assert.deepEqual((await own()).items.map(({ title, description }) => ({ title, description })), ownBefore.items.map(({ title, description }) => ({ title, description })));
    assert.deepEqual((await call('GET', imageRoute, { viewer: 'judge1', id: 'work1', side: 'front' })).body, imageBefore);
    const laterArchive = await JSZip.loadAsync((await zip('from=1&to=2')).body);
    assert.deepEqual(Object.keys(laterArchive.files), Object.keys(archive.files));
    for (const name of Object.keys(archive.files)) {
      assert.deepEqual(await laterArchive.file(name)?.async('nodebuffer'), await archive.file(name)?.async('nodebuffer'), 'frozen ZIP content stays fixed: ' + name);
    }
    // Completion confirmation is optional progress, not a lock or a condition for scoring results.
    const values = [0, 6.1, 7.2, 8.3, 10];
    for (const [index, viewer] of f.ids.entries()) {
      const before = await own(viewer);
      await score(viewer, 'work1', values[index], before.items[0].score?.revision || 0);
      if (index < 4) await score(viewer, 'work2', 10);
      const ready = await own(viewer);
      await rejects(call('POST', judgePath + '/submit', { viewer, body: { expectedRevision: ready.judging.revision - 1 } }), 409, 'REVISION_CONFLICT');
      if (index === 0) {
        const confirmed = (await call('POST', judgePath + '/submit', { viewer, body: { expectedRevision: ready.judging.revision } })).body.judging;
        assert.ok(confirmed.submittedAt);
        assert.equal(confirmed.isOpen, true);
        await rejects(call('POST', judgePath + '/submit', { viewer, body: { expectedRevision: ready.judging.revision } }), 409, 'REVISION_CONFLICT');
        const repeated = (await call('POST', judgePath + '/submit', { viewer, body: { expectedRevision: confirmed.revision } })).body.judging;
        assert.equal(repeated.revision, confirmed.revision + 1, 'current revision permits repeated confirmation');
        const edited = await score(viewer, 'work1', 1, ready.items[0].score.revision);
        assert.equal(edited.body.score.value, 1, 'a confirmed score can actually change before cutoff');
        assert.equal(edited.body.judging.submittedAt, null, 'editing after confirmation clears the marker');
        assert.equal(edited.body.judging.revision, repeated.revision + 1);
        assert.equal(edited.body.judging.isOpen, true);
        assert.equal((await own(viewer)).judging.submittedAt, null, 'marker clear persists');
        assert.equal((await settings()).judges[0].submittedAt, null);
        await rejects(call('POST', judgePath + '/submit', { viewer, body: { expectedRevision: repeated.revision } }), 409, 'REVISION_CONFLICT');
        await score(viewer, 'work1', values[index], edited.body.score.revision);
      }
    }
    assert.ok((await settings()).judges.every(j => j.submittedAt === null));
    await rejects(result(), 403);
    await rejects(call('GET', adminPath + '/scores.xlsx'), 403);
    // Hold the shared writer lock across the deadline; queued writes must use actual time, not BEGIN now().
    await setDeadline(new Date(Date.now() + 180).toISOString());
    let locked;
    const hasLock = new Promise(resolve => { locked = resolve; });
    let release;
    const releaseLock = new Promise(resolve => { release = resolve; });
    const blocker = f.db.transaction(async () => { locked(); await releaseLock; }, { write: true });
    await hasLock;
    const waiting = score('judge5', 'work1', 2, 1, { db: second });
    // Attach the rejection handler immediately to avoid an unhandled rejection while releasing the lock.
    const closedWrite = rejects(waiting, 409, 'JUDGING_CLOSED');
    await new Promise(resolve => setTimeout(resolve, 260));
    release();
    await blocker;
    await closedWrite;
    const partial = await result();
    assert.equal(partial.items[0].complete, true);
    assert.equal(partial.items[0].humanScore, 36, 'five saved scores count even when no judge has a completion marker');
    assert.ok(partial.items[0].scores.every(s => s.submittedAt === null));
    assert.equal(partial.items[1].complete, false);
    assert.equal(partial.items[1].humanScore, null, 'missing score is never filled with zero');
    assert.equal(partial.items[1].scores.length, 4);
    await rejects(score('judge5','work1',2,1), 409, 'JUDGING_CLOSED');
    await rejects(score('judge5','work2',10), 409, 'JUDGING_CLOSED');
    await rejects(call('POST', judgePath + '/submit', { viewer: 'judge5', body: { expectedRevision: 1 } }), 409, 'JUDGING_CLOSED');
    assert.equal((await own('judge5')).judging.isOpen, false);
    assert.equal((await own('judge5')).items[0].score.value, 10);
    // Fixture-only clock rewind adds the missing saved score without any completion confirmation.
    await setDeadline(new Date(Date.now() + 3600000).toISOString());
    await score('judge5', 'work2', 10);
    await setDeadline(new Date(Date.now() - 1).toISOString());
    const complete = await result();
    await updateUser('judge2', { newPassword: 'Replacement!2026' });
    assert.equal(complete.items[0].humanScore, 36);
    assert.equal(complete.items[1].humanScore, 50);
    assert.equal(complete.items[0].complete, true);
    assert.deepEqual(complete.items.map(i => i.number), [1,2], 'no ranking');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await call('GET', adminPath + '/scores.xlsx')).body);
    assert.equal(workbook.getWorksheet('人工评审').getCell('C2').value, ownBefore.items[0].title, 'formula-like user text is a string');
    assert.equal(workbook.getWorksheet('人工评审').getCell('F2').value, 36);
    assert.match(workbook.getWorksheet('评审说明').getCell('B4').value, /截止前可提前评分并随时修改/);
    assert.match(workbook.getWorksheet('评审说明').getCell('B4').value, /缺分不补0/);
    assert.ok(complete.judges.every(j => j.submittedAt === null));
    await f.db.transaction(unit => { unit.find('users', u => u.id === 'judge1').status = 'banned'; }, { write: true });
    await rejects(own('judge1'), 403);
    await rejects(call('GET', imageRoute, { viewer: 'judge1', id: 'work1', side: 'front' }), 403);
    await f.db.transaction(unit => { unit.removeWhere('users', u => u.id === 'judge1'); }, { write: true });
    const retained = await result();
    assert.equal(retained.items[0].humanScore, 36);
    assert.equal(retained.items[0].scores[0].comment, 'private-comment-judge1');
    assert.equal(retained.judges[0].userId, 'judge1');
    const replacementIds = ['outsider', ...f.ids.slice(1)];
    const oldRevision = (await settings()).revision;
    await configure({ judgeUserIds: replacementIds });
    await rejects(configure({ judgeUserIds: replacementIds, expectedRevision: oldRevision }), 409, 'REVISION_CONFLICT');
    await rejects(own('judge1'), 401);
    const replacement = await own('outsider');
    assert.ok(replacement.items.every(item => item.score === null), 'replacement never inherits scores');
    assert.equal((await own('judge2')).items[0].score.value, 6.1, 'retained judge keeps saved score');
    assert.equal((await settings()).materialVersion, started.materialVersion);
    await rejects(result(), 403, 'FORBIDDEN');
    await rejects(call('GET', adminPath + '/scores.xlsx'), 403);
    const archived = await f.db.transaction(async unit => (await unit.client.query('SELECT * FROM "contestJudgingChanges" WHERE "eventKey"=$1 ORDER BY id DESC LIMIT 1', [eventKey])).rows[0]);
    assert.ok(archived.previousScores.some(score => score.slot === 1 && score.comment === 'private-comment-judge1'));
    await setDeadline(new Date(Date.now() - 1).toISOString());
    assert.equal((await result()).items[0].complete, false, 'removed scores do not contribute to results');
    await configure({ judgeUserIds: ['outsider', 'author', ...f.ids.slice(2)] });
    await rejects(own('judge2'), 403);
    await rejects(score('judge2', 'work1', 9), 403);
    assert.ok((await own('author')).items.every(item => item.score === null));
    assert.equal((await own('judge3')).items[0].score.value, 7.2);
    const frozenDir = path.join(f.dataDir, 'judging', (await fs.readdir(path.join(f.dataDir,'judging')))[0]);
    await fs.writeFile(path.join(frozenDir,'1-front.webp'), 'corrupt');
    await rejects(call('GET', imageRoute, { viewer: 'judge3', id: 'work1', side: 'front' }), 409, 'MATERIAL_INTEGRITY');
  } finally { await second.close(); await f.cleanup(); }
}
