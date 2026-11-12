'use strict';

/** 当前用户路由：/api/me/* */

const { badRequest, invalidCredentials } = require('../errors');
const { isObj, passwordProblem, validateProfile, parseEnum } = require('../validate');
const auth = require('../auth');
const serialize = require('../serialize');

const EXCHANGE_STATUS = ['pending', 'approved', 'rejected', 'completed', 'cancelled', 'all'];

function byCreatedDesc(a, b) {
  return (b.createdAt || '').localeCompare(a.createdAt || '');
}

function byUpdatedDesc(a, b) {
  return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
}

/** GET /api/me/overview */
async function overview(ctx) {
  const user = auth.requireUser(ctx);
  const recentIncoming = ctx.db.data.exchanges
    .filter((exchange) => exchange.toUserId === user.id)
    .sort(byCreatedDesc)
    .slice(0, 3)
    .map((exchange) => serialize.exchangeItem(ctx.db, exchange, user));
  const recentCards = ctx.db.data.cards
    .filter((card) => card.ownerId === user.id)
    .sort(byUpdatedDesc)
    .slice(0, 3)
    .map((card) => serialize.cardPublic(ctx.db, card, user));

  return {
    body: {
      user: serialize.selfUser(ctx.db, user),
      canJudgeContest: user.role === 'user' && user.status === 'active' && (await ctx.db.client.query(
        'SELECT 1 FROM "contestJudges" WHERE "eventKey"=$1 AND "userId"=$2', ['qsl-design-2026-11', user.id])).rowCount > 0,
      stats: serialize.overviewStats(ctx.db, user),
      recentIncoming,
      recentCards,
    },
  };
}

/** PUT /api/me/profile */
async function updateProfile(ctx) {
  const user = auth.requireUser(ctx);
  const patch = validateProfile(ctx.body || {});
  Object.assign(user, patch);
  user.updatedAt = new Date().toISOString();
  await ctx.db.save();
  return { body: { user: serialize.selfUser(ctx.db, user) } };
}

/** PUT /api/me/password */
async function updatePassword(ctx) {
  const user = auth.requireUser(ctx);
  const body = isObj(ctx.body) ? ctx.body : {};
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  const fields = {};
  if (!currentPassword) fields.currentPassword = '请输入当前密码';
  const pwdError = passwordProblem(newPassword);
  if (pwdError) fields.newPassword = pwdError;
  if (Object.keys(fields).length) throw badRequest(fields, '请检查密码');

  if (!auth.verifyPassword(currentPassword, user.passwordHash)) {
    throw invalidCredentials('当前密码不正确');
  }
  user.passwordHash = auth.hashPassword(newPassword);
  user.updatedAt = new Date().toISOString();
  await ctx.db.save();
  return { body: { ok: true } };
}

/** GET /api/me/cards：我的全部卡片（含 pending/rejected），按更新时间倒序 */
async function myCards(ctx) {
  const user = auth.requireUser(ctx);
  const items = ctx.db.data.cards
    .filter((card) => card.ownerId === user.id)
    .sort(byUpdatedDesc)
    .map((card) =>
      serialize.cardPublic(ctx.db, card, user, { shareToken: true, rejectReason: true })
    );
  return { body: { items } };
}

/** GET /api/me/exchanges?box=incoming|outgoing|all&status=... */
async function myExchanges(ctx) {
  const user = auth.requireUser(ctx);
  const box = parseEnum(ctx.query, 'box', ['incoming', 'outgoing', 'all'], 'all');
  const status = parseEnum(ctx.query, 'status', EXCHANGE_STATUS, 'all');

  const items = ctx.db.data.exchanges
    .filter((exchange) => exchange.fromUserId === user.id || exchange.toUserId === user.id)
    .filter((exchange) => {
      if (box === 'incoming') return exchange.toUserId === user.id;
      if (box === 'outgoing') return exchange.fromUserId === user.id;
      return true;
    })
    .filter((exchange) => status === 'all' || exchange.status === status)
    .sort(byCreatedDesc)
    .map((exchange) => serialize.exchangeItem(ctx.db, exchange, user));

  return { body: { items, counts: serialize.exchangeCounts(ctx.db, user) } };
}

module.exports = {
  routes: [
    { method: 'GET', pattern: '/api/me/overview', handler: overview },
    { method: 'PUT', pattern: '/api/me/profile', handler: updateProfile },
    { method: 'PUT', pattern: '/api/me/password', handler: updatePassword },
    { method: 'GET', pattern: '/api/me/cards', handler: myCards },
    { method: 'GET', pattern: '/api/me/exchanges', handler: myExchanges },
  ],
};
