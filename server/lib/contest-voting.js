'use strict';

const crypto = require('crypto');
const auth = require('./auth');
const { badRequest, conflict, forbidden, notFound } = require('./errors');
const { createId } = require('./db');
const { requireContest } = require('./contests');
const { cardPublic } = require('./serialize');
const { isObj } = require('./validate');

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const beijingDate = (now) => new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function secret(db) {
  return (await db.client.query("SELECT value FROM app_meta WHERE key = 'contestVotingSecret'")).rows[0].value;
}

function digest(key, purpose, eventKey, value) {
  return crypto.createHmac('sha256', key).update(JSON.stringify([purpose, eventKey, value])).digest('hex');
}

function visibleWork(db, work) {
  if (!work || !work.active) return false;
  const entry = db.find('contestEntries', (item) => item.id === work.entryId);
  const card = db.find('cards', (item) => item.id === work.cardId);
  const user = entry && db.find('users', (item) => item.id === entry.userId);
  return !!(entry && entry.status === 'approved' && card && card.status === 'approved' && user && user.status === 'active' && card.ownerId === user.id);
}

function targetWork(ctx) {
  requireContest(ctx.params.eventKey);
  const work = ctx.db.find('contestWorks', (item) => item.eventKey === ctx.params.eventKey && item.id === ctx.params.id);
  if (!visibleWork(ctx.db, work)) throw notFound('作品不存在');
  return work;
}

async function voteCounts(db, eventKey) {
  const { rows } = await db.client.query('SELECT "workId", count(*)::integer AS count FROM "contestVotes" WHERE "eventKey"=$1 GROUP BY "workId"', [eventKey]);
  return new Map(rows.map((row) => [row.workId, row.count]));
}

function workView(ctx, work, voteCount) {
  return { id: work.id, number: work.number, description: work.description, submittedAt: work.submittedAt,
    card: cardPublic(ctx.db, ctx.db.find('cards', (item) => item.id === work.cardId), ctx.user), voteCount };
}

async function voting(ctx, now = Date.now()) {
  const eventKey = ctx.params.eventKey;
  const settings = (await ctx.db.client.query('SELECT "startsAt", "endsAt" FROM "contestVotingSettings" WHERE id=$1', [eventKey])).rows[0];
  const startsAt = settings && settings.startsAt ? settings.startsAt.toISOString() : null;
  const endsAt = settings && settings.endsAt ? settings.endsAt.toISOString() : null;
  const eligible = !!(ctx.user && ctx.user.status === 'active');
  const votes = ctx.user ? (await ctx.db.client.query('SELECT "workId" FROM "contestVotes" WHERE "eventKey"=$1 AND "voterKey"=$2 ORDER BY slot',
    [eventKey, digest(await secret(ctx.db), 'voter', eventKey, ctx.user.id)])).rows : [];
  return { startsAt, endsAt, isOpen: !!(startsAt && endsAt && now >= settings.startsAt.getTime() && now < settings.endsAt.getTime()),
    eligible, votesUsed: votes.length, votedWorkIds: votes.map((vote) => vote.workId) };
}

async function detail(ctx) {
  const work = targetWork(ctx);
  const counts = await voteCounts(ctx.db, ctx.params.eventKey);
  return { body: { work: workView(ctx, work, counts.get(work.id) || 0), voting: await voting(ctx) } };
}

async function vote(ctx) {
  const user = auth.requireUser(ctx);
  const work = targetWork(ctx);
  const body = isObj(ctx.body) ? ctx.body : {};
  if (typeof body.fingerprint !== 'string' || !body.fingerprint.trim() || body.fingerprint.length > 8192) throw badRequest({ fingerprint: '无法读取投票浏览器标识，请允许本站存储后重试' });
  const now = Date.now();
  const state = await voting(ctx, now);
  if (!state.isOpen) throw conflict('VOTING_CLOSED', '当前不在投票时间内');
  if (!state.eligible) throw forbidden('须为已登录的可用账号');
  if (state.votedWorkIds.includes(work.id)) throw conflict('WORK_ALREADY_VOTED', '已投过该作品');
  if (state.votesUsed >= 5) throw conflict('TOTAL_VOTE_LIMIT', '本赛事最多投五票');
  const key = await secret(ctx.db);
  const fingerprintHash = digest(key, 'fingerprint', ctx.params.eventKey, body.fingerprint);
  // Writes are serialized by Database.transaction, including across server instances.
  const deviceVotes = (await ctx.db.client.query('SELECT count(*)::integer AS count FROM "contestVotes" WHERE "eventKey"=$1 AND "fingerprintHash"=$2 AND "fingerprintExpiresAt">now()', [ctx.params.eventKey, fingerprintHash])).rows[0].count;
  if (deviceVotes >= 5) throw conflict('BROWSER_VOTE_LIMIT', '此浏览器本赛事的五票额度已用完，请勿切换账号重复投票；如有疑问请联系管理员');
  await ctx.db.client.query('INSERT INTO "contestVotes" (id,"eventKey","workId","userId","voterKey","voteDate",slot,"createdAt","fingerprintHash","fingerprintExpiresAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [createId('cv'), ctx.params.eventKey, work.id, user.id, digest(key, 'voter', ctx.params.eventKey, user.id), beijingDate(now), state.votesUsed + 1,
      new Date(now).toISOString(), fingerprintHash, new Date(Date.parse(state.endsAt) + RETENTION_MS).toISOString()]);
  return detail(ctx);
}

function audit(ctx, action) {
  const record = { action, eventKey: ctx.params.eventKey, actorId: ctx.user.id, at: new Date().toISOString() };
  return () => console.info('[admin:contest]', JSON.stringify(record));
}

async function getSettings(ctx) {
  auth.requireAdmin(ctx);
  requireContest(ctx.params.eventKey);
  return { body: { voting: await adminVoting(ctx) } };
}

async function adminVoting(ctx) {
  const result = await ctx.db.client.query('SELECT revision FROM "contestVotingSettings" WHERE id=$1', [ctx.params.eventKey]);
  return { ...await voting(ctx), revision: result.rows.length ? result.rows[0].revision : 0 };
}

function parseTime(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw badRequest({ [field]: '请输入含时区的 ISO 时间' });
  }
  const day = value.slice(0, 10);
  if (Number(value.slice(11, 13)) > 23 || new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) !== day) {
    throw badRequest({ [field]: '请输入有效的日历日期' });
  }
  return new Date(value).toISOString();
}

async function putSettings(ctx) {
  auth.requireAdmin(ctx);
  requireContest(ctx.params.eventKey);
  const body = isObj(ctx.body) ? ctx.body : {};
  const clearing = body.startsAt === null && body.endsAt === null;
  const startsAt = clearing ? null : parseTime(body.startsAt, 'startsAt');
  const endsAt = clearing ? null : parseTime(body.endsAt, 'endsAt');
  if (!clearing && Date.parse(startsAt) >= Date.parse(endsAt)) throw badRequest({ endsAt: '结束时间须晚于开始时间' });
  const current = (await ctx.db.client.query('SELECT revision FROM "contestVotingSettings" WHERE id=$1', [ctx.params.eventKey])).rows[0];
  if (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 0) throw badRequest({ expectedRevision: '请提交当前投票配置版本' });
  if (body.expectedRevision !== (current ? current.revision : 0)) throw conflict('REVISION_CONFLICT', '投票配置已更新，请刷新后重试');
  await ctx.db.client.query('INSERT INTO "contestVotingSettings" (id,"startsAt","endsAt") VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET "startsAt"=EXCLUDED."startsAt", "endsAt"=EXCLUDED."endsAt", revision="contestVotingSettings".revision+1', [ctx.params.eventKey, startsAt, endsAt]);
  if (!clearing) await ctx.db.client.query('UPDATE "contestVotes" SET "fingerprintExpiresAt"=LEAST("fingerprintExpiresAt",$2::timestamptz + interval \'90 days\') WHERE "eventKey"=$1', [ctx.params.eventKey, endsAt]);
  await cleanup(ctx.db);
  return { body: { voting: await adminVoting(ctx) }, afterCommit: audit(ctx, 'voting.update') };
}

async function cleanup(db) {
  await db.client.query('UPDATE "contestVotes" SET "fingerprintHash"=NULL WHERE "fingerprintHash" IS NOT NULL AND "fingerprintExpiresAt" <= now()');
}

async function exportVotes(ctx) {
  auth.requireAdmin(ctx);
  requireContest(ctx.params.eventKey);
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet('作品汇总');
  summary.addRow(['作品ID', '作品编号', '作品状态', '报名状态', '卡片标题', '参赛账号ID', '参赛账号', '呼号', '提交时间（UTC）', '票数']);
  const counts = await voteCounts(ctx.db, ctx.params.eventKey);
  for (const work of ctx.db.data.contestWorks.filter((item) => item.eventKey === ctx.params.eventKey).sort((a, b) => a.number - b.number)) {
    const entry = ctx.db.find('contestEntries', (item) => item.id === work.entryId);
    const card = ctx.db.find('cards', (item) => item.id === work.cardId);
    const user = entry && ctx.db.find('users', (item) => item.id === entry.userId);
    summary.addRow([work.id, work.number, visibleWork(ctx.db, work) ? '公开' : '隐藏', entry ? entry.status : '', card ? card.title : '', user ? user.id : '', user ? user.username : '', card ? card.callSign : '', work.submittedAt, counts.get(work.id) || 0]);
  }
  const sheet = workbook.addWorksheet('逐票明细');
  sheet.addRow(['票ID', '作品ID', '作品编号', '投票账号ID', '投票账号', '呼号', '账号状态', '用户假名键', '投票日期（北京时间）', '投票时间（UTC）', '指纹摘要（HMAC-SHA256）']);
  const { rows } = await ctx.db.client.query('SELECT v.id,v."workId",w.number,v."userId",u.username,u."callSign",u.status,v."voterKey",v."voteDate"::text,v."createdAt",CASE WHEN v."fingerprintExpiresAt">now() THEN v."fingerprintHash" ELSE NULL END AS "fingerprintHash" FROM "contestVotes" v JOIN "contestWorks" w ON w.id=v."workId" LEFT JOIN users u ON u.id=v."userId" WHERE v."eventKey"=$1 ORDER BY v."createdAt",v.id', [ctx.params.eventKey]);
  for (const row of rows) sheet.addRow([row.id, row.workId, row.number, row.userId || '', row.username || '', row.callSign || '', row.status || '已注销', row.voterKey, row.voteDate, row.createdAt.toISOString(), row.fingerprintHash || '']);
  for (const page of [summary, sheet]) {
    page.views = [{ state: 'frozen', ySplit: 1 }];
    page.getRow(1).font = { bold: true };
    page.columns.forEach((column) => { column.width = 24; });
  }
  return { body: Buffer.from(await workbook.xlsx.writeBuffer()), headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${ctx.params.eventKey}-votes.xlsx"`,
  }, afterCommit: audit(ctx, 'votes.export') };
}

module.exports = { visibleWork, voteCounts, workView, voting, detail, vote, getSettings, putSettings, exportVotes, cleanup };
