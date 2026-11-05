'use strict';

const auth = require('../auth');
const { badRequest, conflict, notFound } = require('../errors');
const { isObj, str, parsePagination, parseEnum } = require('../validate');
const { createId, paginate } = require('../db');
const { requireContest, resetEntry, entryView } = require('../contests');

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
    throw badRequest({ cardIds: '请选择本人已通过广场审核的卡片，且账号须可用' });
  }
  return card;
}

function parseCardIds(db, value, userId) {
  const raw = Array.isArray(value) ? value : [];
  const ids = raw.map((id) => str(id));
  if (ids.length < 1 || ids.length > 3 || ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw badRequest({ cardIds: '请选择 1–3 张不重复的本人卡片' });
  }
  return ids.map((cardId) => eligibleCard(db, cardId, userId));
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
  const patch = { cardIds: parseCardIds(ctx.db, body.cardIds, user.id).map((card) => card.id), description: str(body.description), contactEmail: str(body.contactEmail) };
  const fields = {};
  if (!patch.description || Array.from(patch.description).length > 2000 || patch.description.includes('\0')) fields.description = '请输入 1–2000 个字符';
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
  } else if (Object.keys(patch).some((key) => JSON.stringify(patch[key]) !== JSON.stringify(entry[key]))) {
    Object.assign(entry, patch);
    resetEntry(entry, now);
  }
  await ctx.db.save();
  return { status: entry ? 200 : 201, body: { entry: entryView(ctx.db, saved) } };
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
    if (!(entry.cardIds || []).length) throw badRequest({ cardIds: '报名未关联可用卡片，不能批准' });
    for (const cardId of entry.cardIds) eligibleCard(ctx.db, cardId, entry.userId);
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
    { method: 'GET', pattern: '/api/contests/:eventKey', handler: (ctx) => ({ body: { contest: requireContest(ctx.params.eventKey) } }) },
    { method: 'GET', pattern: '/api/contests/:eventKey/entry', handler: ownEntry },
    { method: 'PUT', pattern: '/api/contests/:eventKey/entry', handler: saveEntry },
    { method: 'GET', pattern: '/api/admin/contests/:eventKey/entries', handler: listEntries },
    { method: 'GET', pattern: '/api/admin/contests/:eventKey/entries/:id', handler: (ctx) => ({ body: { entry: entryView(ctx.db, adminEntry(ctx)) } }) },
    { method: 'PUT', pattern: '/api/admin/contests/:eventKey/entries/:id/review', handler: reviewEntry },
  ],
};
