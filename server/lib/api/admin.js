'use strict';

/** 管理后台路由：/api/admin/*（均需 admin 权限） */

const { badRequest, conflict, notFound } = require('../errors');
const {
  str,
  parsePagination,
  parseEnum,
  validateAdminUserUpdate,
  validateCardUpdate,
} = require('../validate');
const auth = require('../auth');
const { paginate, cascadeDeleteCard, cascadeDeleteUser } = require('../db');
const { saveImage } = require('../uploads');
const serialize = require('../serialize');
const { reviewAfterCommit } = require('../review-webhook');
const { approvedMailAfterCommit } = require('../card-review-mail');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CARD_STATUSES = ['all', 'pending', 'approved', 'rejected'];
const EXCHANGE_STATUSES = ['all', 'pending', 'approved', 'rejected', 'completed', 'cancelled'];

function byCreatedDesc(a, b) {
  return (b.createdAt || '').localeCompare(a.createdAt || '');
}

function byUpdatedDesc(a, b) {
  return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
}

function alwaysVisible() {
  return { shareToken: true, rejectReason: true, ownerStatus: true };
}

/** 当前管理员尝试禁用/降级时，保证站点始终至少有一个管理员 */
function ensureAdminRemains(db, target, patch) {
  const admins = db.data.users.filter((user) => user.role === 'admin');
  const demote = target.role === 'admin' && patch.role === 'user';
  const ban = target.status !== 'banned' && patch.status === 'banned' && target.role === 'admin';
  if ((demote || ban) && admins.length <= 1) {
    throw badRequest(null, '不能降级或禁用最后一个管理员');
  }
}

/** GET /api/admin/stats */
async function stats(ctx) {
  auth.requireAdmin(ctx);
  const { users, cards, exchanges, likes } = ctx.db.data;
  const now = Date.now();
  const newThisWeek = users.filter((user) => {
    const created = Date.parse(user.createdAt);
    return Number.isFinite(created) && now - created <= WEEK_MS;
  }).length;

  const recentUsers = [...users]
    .sort(byCreatedDesc)
    .slice(0, 5)
    .map((user) => serialize.publicUser(ctx.db, user));
  const pendingCards = cards
    .filter((card) => card.status === 'pending')
    .sort(byUpdatedDesc)
    .slice(0, 10)
    .map((card) => serialize.cardPublic(ctx.db, card, null, alwaysVisible()));
  const recentExchanges = [...exchanges]
    .sort(byCreatedDesc)
    .slice(0, 5)
    .map((exchange) => serialize.exchangeItem(ctx.db, exchange, ctx.user));

  return {
    body: {
      users: {
        total: users.length,
        active: users.filter((user) => user.status === 'active').length,
        banned: users.filter((user) => user.status === 'banned').length,
        newThisWeek,
      },
      cards: {
        total: cards.length,
        pending: cards.filter((card) => card.status === 'pending').length,
        approved: cards.filter((card) => card.status === 'approved').length,
        rejected: cards.filter((card) => card.status === 'rejected').length,
      },
      exchanges: {
        total: exchanges.length,
        pending: exchanges.filter((exchange) => exchange.status === 'pending').length,
        approved: exchanges.filter((exchange) => exchange.status === 'approved').length,
        completed: exchanges.filter((exchange) => exchange.status === 'completed').length,
        rejected: exchanges.filter((exchange) => exchange.status === 'rejected').length,
      },
      likes: likes.length,
      recentUsers,
      pendingCards,
      recentExchanges,
    },
  };
}

/** GET /api/admin/users */
async function listUsers(ctx) {
  auth.requireAdmin(ctx);
  const { page, limit } = parsePagination(ctx.query);
  const q = str(ctx.query.get('q')).toLowerCase();
  const status = parseEnum(ctx.query, 'status', ['all', 'active', 'banned'], 'all');
  const role = parseEnum(ctx.query, 'role', ['all', 'user', 'admin'], 'all');

  const filtered = ctx.db.data.users
    .filter((user) => {
      if (status !== 'all' && user.status !== status) return false;
      if (role !== 'all' && user.role !== role) return false;
      if (q) {
        const haystack = [
          user.username,
          user.displayName,
          user.callSign,
          user.email,
          user.bio,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    })
    .sort(byCreatedDesc);

  const paged = paginate(filtered, page, limit);
  return {
    body: {
      ...paged,
      items: paged.items.map((user) => serialize.adminUser(ctx.db, user)),
    },
  };
}

/** PUT /api/admin/users/:id */
async function updateUser(ctx) {
  const admin = auth.requireAdmin(ctx);
  const target = ctx.db.find('users', (user) => user.id === ctx.params.id);
  if (!target) throw notFound('用户不存在');

  const patch = validateAdminUserUpdate(ctx.body || {});
  const isSelf = target.id === admin.id;

  // 不能修改自己的角色/状态（传相同值视为无操作）
  if (isSelf && patch.role !== undefined && patch.role !== target.role) {
    throw badRequest({ role: '不能修改自己的角色' }, '不能修改自己的角色');
  }
  if (isSelf && patch.status !== undefined && patch.status !== target.status) {
    throw badRequest({ status: '不能修改自己的状态' }, '不能修改自己的状态');
  }
  if (isSelf) {
    delete patch.role;
    delete patch.status;
  }
  ensureAdminRemains(ctx.db, target, patch);

  if (patch.email !== undefined) {
    const taken = ctx.db.find(
      'users',
      (user) =>
        user.id !== target.id && (user.email || '').toLowerCase() === patch.email.toLowerCase()
    );
    if (taken) {
      throw conflict('EMAIL_TAKEN', '邮箱已被其它账号使用', { email: '该邮箱已被注册' });
    }
  }

  const { newPassword, ...rest } = patch;
  Object.assign(target, rest);
  if (newPassword) target.passwordHash = auth.hashPassword(newPassword);
  if (patch.status === 'banned') auth.destroyUserSessions(ctx.db, target.id);
  target.updatedAt = new Date().toISOString();
  await ctx.db.save();

  return { body: { user: serialize.adminUser(ctx.db, target) } };
}

/** DELETE /api/admin/users/:id */
async function deleteUser(ctx) {
  const admin = auth.requireAdmin(ctx);
  const target = ctx.db.find('users', (user) => user.id === ctx.params.id);
  if (!target) throw notFound('用户不存在');
  if (target.id === admin.id) throw badRequest(null, '不能删除自己');
  if (target.role === 'admin') {
    const admins = ctx.db.data.users.filter((user) => user.role === 'admin');
    if (admins.length <= 1) throw badRequest(null, '不能删除最后一个管理员');
  }
  cascadeDeleteUser(ctx.db, target.id);
  await ctx.db.save();
  return { body: { ok: true } };
}

/** GET /api/admin/cards */
async function listCards(ctx) {
  auth.requireAdmin(ctx);
  const { page, limit } = parsePagination(ctx.query);
  const q = str(ctx.query.get('q')).toLowerCase();
  const status = parseEnum(ctx.query, 'status', CARD_STATUSES, 'all');

  const filtered = ctx.db.data.cards
    .filter((card) => {
      if (status !== 'all' && card.status !== status) return false;
      if (q) {
        const haystack = [card.title, card.callSign, card.band, card.mode]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    })
    .sort(byUpdatedDesc);

  const paged = paginate(filtered, page, limit);
  return {
    body: {
      ...paged,
      items: paged.items.map((card) =>
        serialize.cardPublic(ctx.db, card, null, alwaysVisible())
      ),
    },
  };
}

/** PUT /api/admin/cards/:id：审核/编辑卡片；设为 approved 时清空 rejectReason */
async function updateCard(ctx) {
  const admin = auth.requireAdmin(ctx);
  const card = ctx.db.find('cards', (item) => item.id === ctx.params.id);
  if (!card) throw notFound('卡片不存在');

  const patch = validateCardUpdate(ctx.body || {}, { allowStatus: true });
  if (patch.frontImage) {
    patch.frontImage = await saveImage(patch.frontImage, ctx.uploadsDir, 'frontImage');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'backImage')) {
    patch.backImage = patch.backImage
      ? await saveImage(patch.backImage, ctx.uploadsDir, 'backImage')
      : '';
  }

  const previousStatus = card.status;
  Object.assign(card, patch);
  if (patch.status === 'approved' || patch.status === 'pending') card.rejectReason = null;
  card.updatedAt = new Date().toISOString();
  await ctx.db.save();

  return {
    body: { card: serialize.cardPublic(ctx.db, card, admin, alwaysVisible()) },
    afterCommit: approvedMailAfterCommit(ctx, card, previousStatus) ||
      (previousStatus !== 'pending' ? reviewAfterCommit(ctx, card, 'resubmitted') : undefined),
  };
}

/** DELETE /api/admin/cards/:id */
async function deleteCard(ctx) {
  auth.requireAdmin(ctx);
  const card = ctx.db.find('cards', (item) => item.id === ctx.params.id);
  if (!card) throw notFound('卡片不存在');
  cascadeDeleteCard(ctx.db, card.id);
  await ctx.db.save();
  return { body: { ok: true } };
}

/** GET /api/admin/exchanges */
async function listExchanges(ctx) {
  auth.requireAdmin(ctx);
  const { page, limit } = parsePagination(ctx.query);
  const status = parseEnum(ctx.query, 'status', EXCHANGE_STATUSES, 'all');

  const filtered = ctx.db.data.exchanges
    .filter((exchange) => status === 'all' || exchange.status === status)
    .sort(byCreatedDesc);
  const paged = paginate(filtered, page, limit);
  return {
    body: {
      ...paged,
      items: paged.items.map((exchange) =>
        serialize.exchangeItem(ctx.db, exchange, ctx.user)
      ),
    },
  };
}

module.exports = {
  routes: [
    { method: 'GET', pattern: '/api/admin/stats', handler: stats },
    { method: 'GET', pattern: '/api/admin/users', handler: listUsers },
    { method: 'PUT', pattern: '/api/admin/users/:id', handler: updateUser },
    { method: 'DELETE', pattern: '/api/admin/users/:id', handler: deleteUser },
    { method: 'GET', pattern: '/api/admin/cards', handler: listCards },
    { method: 'PUT', pattern: '/api/admin/cards/:id', handler: updateCard },
    { method: 'DELETE', pattern: '/api/admin/cards/:id', handler: deleteCard },
    { method: 'GET', pattern: '/api/admin/exchanges', handler: listExchanges },
  ],
};
