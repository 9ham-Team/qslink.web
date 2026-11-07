'use strict';

const auth = require('../auth');
const { badRequest, notFound } = require('../errors');
const { parsePagination, parseEnum } = require('../validate');
const { createId, paginate } = require('../db');
const { announcementScope } = require('../contests');

function validate(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest(null, '请提交公告内容');
  const patch = {};
  const fields = {};
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'displaySeconds')) {
    const seconds = body.displaySeconds === undefined && !partial ? 30 : body.displaySeconds;
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) fields.displaySeconds = '请输入 1–3600 秒的整数';
    patch.displaySeconds = seconds;
  }
  for (const [key, max] of [['title', 120], ['body', 10000]]) {
    if (partial && !Object.prototype.hasOwnProperty.call(body, key)) continue;
    const value = typeof body[key] === 'string' ? body[key].trim() : '';
    if (!value || Array.from(value).length > max || value.includes('\0')) fields[key] = `请输入 1–${max} 个字符`;
    patch[key] = value;
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'status')) {
    patch.status = body.status === undefined && !partial ? 'draft' : body.status;
    if (!['draft', 'published'].includes(patch.status)) fields.status = '状态须为 draft 或 published';
  }
  if (Object.keys(fields).length) throw badRequest(fields);
  return patch;
}

function list(ctx, admin = false) {
  if (admin) auth.requireAdmin(ctx);
  const { page, limit } = parsePagination(ctx.query);
  const eventKey = announcementScope(ctx.query.get('eventKey'));
  if (ctx.query.get('reminder') === '1' && eventKey !== null) throw badRequest({ eventKey: '提醒仅支持全站公告' });
  const status = admin ? parseEnum(ctx.query, 'status', ['all', 'draft', 'published'], 'all') : 'published';
  const dismissed = new Set(!admin && ctx.query.get('reminder') === '1' && ctx.user
    ? ctx.db.data.announcementDismissals.filter((item) => item.userId === ctx.user.id).map((item) => item.announcementId) : []);
  const items = ctx.db.data.announcements.filter((item) => (item.eventKey || null) === eventKey && (status === 'all' || item.status === status) && !dismissed.has(item.id));
  items.sort((a, b) => (admin ? b.updatedAt.localeCompare(a.updatedAt) : b.publishedAt.localeCompare(a.publishedAt)) || b.id.localeCompare(a.id));
  return { body: paginate(items, page, limit) };
}

async function create(ctx) {
  auth.requireAdmin(ctx);
  const patch = validate(ctx.body);
  patch.eventKey = announcementScope(ctx.body.eventKey);
  const now = new Date().toISOString();
  const announcement = ctx.db.insert('announcements', {
    id: createId('a'), ...patch, publishedAt: patch.status === 'published' ? now : null,
    createdAt: now, updatedAt: now,
  });
  await ctx.db.save();
  return { status: 201, body: { announcement } };
}

async function update(ctx) {
  auth.requireAdmin(ctx);
  const announcement = ctx.db.find('announcements', (item) => item.id === ctx.params.id);
  if (!announcement) throw notFound('公告不存在');
  const patch = validate(ctx.body, true);
  if (Object.prototype.hasOwnProperty.call(ctx.body, 'eventKey') && announcementScope(ctx.body.eventKey) !== (announcement.eventKey || null)) {
    throw badRequest({ eventKey: '不能修改公告所属范围' });
  }
  const now = new Date().toISOString();
  if (patch.status === 'published' && announcement.status !== 'published') announcement.publishedAt = now;
  Object.assign(announcement, patch, { updatedAt: now });
  await ctx.db.save();
  return { body: { announcement } };
}

async function dismiss(ctx) {
  const user = auth.requireUser(ctx);
  const announcement = ctx.db.find('announcements', (item) => item.id === ctx.params.id && item.status === 'published' && !item.eventKey);
  if (!announcement) throw notFound('公告不存在');
  if (!ctx.db.find('announcementDismissals', (item) => item.userId === user.id && item.announcementId === announcement.id)) {
    ctx.db.insert('announcementDismissals', {
      id: createId('ad'), userId: user.id, announcementId: announcement.id, createdAt: new Date().toISOString(),
    });
    await ctx.db.save();
  }
  return { body: { dismissed: true } };
}

module.exports = {
  routes: [
    { method: 'GET', pattern: '/api/announcements', handler: (ctx) => list(ctx) },
    { method: 'POST', pattern: '/api/announcements/:id/dismiss', handler: dismiss },
    { method: 'GET', pattern: '/api/admin/announcements', handler: (ctx) => list(ctx, true) },
    { method: 'POST', pattern: '/api/admin/announcements', handler: create },
    { method: 'PUT', pattern: '/api/admin/announcements/:id', handler: update },
  ],
};
