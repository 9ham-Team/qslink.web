'use strict';

const auth = require('../auth');
const { badRequest, conflict, notFound } = require('../errors');
const { isObj, str, parsePagination, parseEnum } = require('../validate');
const { createId, paginate } = require('../db');
const { requireContest, resetEntry, entryWorks, entryView } = require('../contests');
const contestVoting = require('../contest-voting');

function checkRevision(body, entry) {
  if (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 1) {
    throw badRequest({ expectedRevision: '请提交当前报名版本' });
  }
  if (body.expectedRevision !== entry.revision) throw conflict('REVISION_CONFLICT', '报名已更新，请刷新后重试');
}

function eligibleCard(db, cardId, userId) {
  const card = db.find('cards', (item) => item.id === cardId);
  const user = db.find('users', (item) => item.id === userId);
  if (!card || card.ownerId !== userId || card.status !== 'approved' || !user || user.status !== 'active') {
    throw badRequest({ works: '请选择本人已通过广场审核的卡片，且账号须可用' });
  }
  return card;
}

function parseWorks(db, value, userId) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) throw badRequest({ works: '请选择 1–2 张不重复的本人卡片' });
  const works = value.map((work, index) => {
    if (!isObj(work) || !str(work.cardId)) throw badRequest({ works: '请选择有效卡片' });
    const description = str(work.description);
    if (!description || Array.from(description).length > 2000 || description.includes('\0')) {
      throw badRequest({ [`works.${index}.description`]: '请输入 1–2000 个字符' });
    }
    return { cardId: eligibleCard(db, str(work.cardId), userId).id, description };
  });
  if (new Set(works.map((work) => work.cardId)).size !== works.length) throw badRequest({ works: '请选择 1–2 张不重复的本人卡片' });
  return works;
}

function ownEntry(ctx) {
  const user = auth.requireUser(ctx);
  requireContest(ctx.params.eventKey);
  return { body: { entry: entryView(ctx.db, ctx.db.find('contestEntries', (item) => item.eventKey === ctx.params.eventKey && item.userId === user.id)) } };
}

async function saveEntry(ctx) {
  const user = auth.requireUser(ctx);
  requireContest(ctx.params.eventKey);
  const body = isObj(ctx.body) ? ctx.body : {};
  const entry = ctx.db.find('contestEntries', (item) => item.eventKey === ctx.params.eventKey && item.userId === user.id);
  if (entry) checkRevision(body, entry);
  else if (body.expectedRevision !== undefined) throw conflict('REVISION_CONFLICT', '报名不存在，请刷新后重试');
  const works = parseWorks(ctx.db, body.works, user.id);
  const patch = { contactEmail: str(body.contactEmail) };
  const fields = {};
  if (patch.contactEmail.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(patch.contactEmail) || patch.contactEmail.includes('\0')) fields.contactEmail = '请输入有效邮箱（最多 120 字符）';
  if (Object.keys(fields).length) throw badRequest(fields);
  const now = new Date().toISOString();
  let saved = entry;
  if (!entry) {
    saved = ctx.db.insert('contestEntries', {
      id: createId('ce'), eventKey: ctx.params.eventKey, userId: user.id, ...patch,
      status: 'pending', reviewReason: null, reviewedBy: null, reviewedAt: null,
      revision: 1, createdAt: now, updatedAt: now,
    });
  } else {
    const current = entryWorks(ctx.db, entry);
    if (patch.contactEmail !== entry.contactEmail || current.length !== works.length ||
      works.some((work) => !current.some((item) => item.cardId === work.cardId && item.description === work.description))) {
      Object.assign(entry, patch);
      resetEntry(entry, now);
    }
  }
  for (const work of ctx.db.data.contestWorks) {
    if (work.entryId === saved.id) work.active = false;
  }
  let number = ctx.db.data.contestWorks.reduce((max, work) => work.eventKey === saved.eventKey ? Math.max(max, work.number) : max, 0);
  for (const selected of works) {
    const existing = ctx.db.find('contestWorks', (work) => work.eventKey === saved.eventKey && work.cardId === selected.cardId);
    if (existing) Object.assign(existing, { entryId: saved.id, description: selected.description, active: true });
    else ctx.db.insert('contestWorks', { id: createId('cw'), eventKey: saved.eventKey, entryId: saved.id,
      ...selected, number: ++number, submittedAt: now, active: true });
  }
  await ctx.db.save();
  return { status: entry ? 200 : 201, body: { entry: entryView(ctx.db, saved) } };
}

async function publicWorks(ctx) {
  requireContest(ctx.params.eventKey);
  const { page, limit } = parsePagination(ctx.query);
  const q = str(ctx.query.get('q')).toLowerCase();
  const numeric = /^\d+$/.test(q) ? Number(q) : null;
  const items = [];
  const counts = await contestVoting.voteCounts(ctx.db, ctx.params.eventKey);
  for (const work of ctx.db.data.contestWorks) {
    if (work.eventKey !== ctx.params.eventKey || !contestVoting.visibleWork(ctx.db, work)) continue;
    const card = ctx.db.find('cards', (item) => item.id === work.cardId);
    if (q && !(card.callSign || '').toLowerCase().includes(q) && work.number !== numeric) continue;
    items.push(contestVoting.workView(ctx, work, counts.get(work.id) || 0));
  }
  items.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.number - b.number);
  return { body: paginate(items, page, limit) };
}

function adminEntry(ctx) {
  auth.requireAdmin(ctx);
  requireContest(ctx.params.eventKey);
  const entry = ctx.db.find('contestEntries', (item) => item.id === ctx.params.id && item.eventKey === ctx.params.eventKey);
  if (!entry) throw notFound('报名不存在');
  return entry;
}

function listEntries(ctx) {
  auth.requireAdmin(ctx);
  requireContest(ctx.params.eventKey);
  const { page, limit } = parsePagination(ctx.query);
  const status = parseEnum(ctx.query, 'status', ['all', 'pending', 'approved', 'rejected'], 'all');
  const entries = ctx.db.data.contestEntries.filter((item) => item.eventKey === ctx.params.eventKey && (status === 'all' || item.status === status));
  entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
  const result = paginate(entries, page, limit);
  result.items = result.items.map((entry) => entryView(ctx.db, entry));
  return { body: result };
}

async function reviewEntry(ctx) {
  const entry = adminEntry(ctx);
  const body = isObj(ctx.body) ? ctx.body : {};
  checkRevision(body, entry);
  if (!['approved', 'rejected'].includes(body.status)) throw badRequest({ status: '请选择 approved 或 rejected' });
  const reason = str(body.reviewReason);
  if (Array.from(reason).length > 200 || reason.includes('\0') || (body.status === 'rejected' && !reason)) throw badRequest({ reviewReason: '驳回原因需为 1–200 个字符' });
  if (body.status === 'approved') {
    const works = entryWorks(ctx.db, entry);
    if (!works.length) throw badRequest({ works: '报名未关联可用卡片，不能批准' });
    if (works.length > 2) throw badRequest({ works: '每人最多提交 2 件参赛作品，不能批准' });
    for (const work of works) eligibleCard(ctx.db, work.cardId, entry.userId);
  }
  const reviewReason = body.status === 'rejected' ? reason : null;
  if (entry.status !== body.status || entry.reviewReason !== reviewReason) {
    Object.assign(entry, {
      status: body.status, reviewReason, reviewedBy: ctx.user.id,
      reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revision: entry.revision + 1,
    });
    await ctx.db.save();
  }
  return { body: { entry: entryView(ctx.db, entry) } };
}

module.exports = {
  routes: [
    { method: 'GET', pattern: '/api/contests/:eventKey', handler: async (ctx) => ({ body: { contest: {
      ...requireContest(ctx.params.eventKey),
      approvedRegistrationCount: ctx.db.data.contestEntries.filter((item) => item.eventKey === ctx.params.eventKey && item.status === 'approved').length,
    }, voting: await contestVoting.voting(ctx) } }) },
    { method: 'GET', pattern: '/api/contests/:eventKey/works', handler: publicWorks },
    { method: 'GET', pattern: '/api/contests/:eventKey/works/:id', handler: contestVoting.detail },
    { method: 'POST', pattern: '/api/contests/:eventKey/works/:id/vote', handler: contestVoting.vote },
    { method: 'GET', pattern: '/api/admin/contests/:eventKey/voting', handler: contestVoting.getSettings },
    { method: 'PUT', pattern: '/api/admin/contests/:eventKey/voting', handler: contestVoting.putSettings },
    { method: 'GET', pattern: '/api/admin/contests/:eventKey/votes.xlsx', handler: contestVoting.exportVotes },
    { method: 'GET', pattern: '/api/contests/:eventKey/entry', handler: ownEntry },
    { method: 'PUT', pattern: '/api/contests/:eventKey/entry', handler: saveEntry },
    { method: 'GET', pattern: '/api/admin/contests/:eventKey/entries', handler: listEntries },
    { method: 'GET', pattern: '/api/admin/contests/:eventKey/entries/:id', handler: (ctx) => ({ body: { entry: entryView(ctx.db, adminEntry(ctx)) } }) },
    { method: 'PUT', pattern: '/api/admin/contests/:eventKey/entries/:id/review', handler: reviewEntry },
  ],
};
