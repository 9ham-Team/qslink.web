'use strict';

/** 卡片路由：公共广场、详情、分享页、创建/编辑/删除、点赞、分享链接 */

const { notFound, forbidden, badRequest } = require('../errors');
const {
  isObj,
  str,
  parsePagination,
  parseEnum,
  validateCardCreate,
  validateCardUpdate,
  validateStock,
} = require('../validate');
const { saveImage } = require('../uploads');
const { createId, randomString, paginate, cascadeDeleteCard } = require('../db');
const auth = require('../auth');
const serialize = require('../serialize');
const { createShortToken } = require('../short-token');
const { reviewAfterCommit } = require('../review-webhook');
const { approvedMailAfterCommit } = require('../card-review-mail');
const contests = require('../contests');

function byCreatedDesc(a, b) {
  return (b.createdAt || '').localeCompare(a.createdAt || '');
}

function requestProtocol(ctx) {
  const forwarded = ctx.req.headers['x-forwarded-proto'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return ctx.req.socket && ctx.req.socket.encrypted ? 'https' : 'http';
}

/** GET /api/cards：公共卡片广场（仅 approved 且 owner 未被禁用） */
async function list(ctx) {
  const { page, limit } = parsePagination(ctx.query);
  const q = str(ctx.query.get('q')).toLowerCase();
  const band = str(ctx.query.get('band')).toLowerCase();
  const mode = str(ctx.query.get('mode')).toLowerCase();
  // v3 新增呼号搜索：大小写不敏感 contains，匹配卡片呼号或卡片 owner 呼号
  const callSign = str(ctx.query.get('callSign') || ctx.query.get('callsign')).toLowerCase();
  const sort = parseEnum(ctx.query, 'sort', ['latest', 'popular', 'oldest'], 'latest');
  const viewer = ctx.user;

  const usersById = new Map(ctx.db.data.users.map((user) => [user.id, user]));
  const cards = ctx.db.data.cards.filter((card) => {
    if (card.status !== 'approved') return false;
    const owner = usersById.get(card.ownerId);
    if (!owner || owner.status === 'banned') return false;
    if (band && String(card.band).toLowerCase() !== band) return false;
    if (mode && String(card.mode).toLowerCase() !== mode) return false;
    if (callSign) {
      const cardCallSign = String(card.callSign || '').toLowerCase();
      const ownerCallSign = String(owner.callSign || '').toLowerCase();
      if (!cardCallSign.includes(callSign) && !ownerCallSign.includes(callSign)) return false;
    }
    if (q) {
      const haystack = [card.title, card.callSign, owner.displayName, owner.username]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const items = cards.map((card) => serialize.cardPublic(ctx.db, card, viewer));
  if (sort === 'popular') {
    items.sort((a, b) => b.likeCount - a.likeCount || byCreatedDesc(a, b));
  } else if (sort === 'oldest') {
    items.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  } else {
    items.sort(byCreatedDesc);
  }
  return { body: paginate(items, page, limit) };
}

/** GET /api/cards/:id：详情（pending/rejected 仅 owner/admin 可见，其他一律 404） */
async function detail(ctx) {
  const card = ctx.db.find('cards', (item) => item.id === ctx.params.id);
  if (!card) throw notFound('卡片不存在');
  const viewer = ctx.user;
  const isOwner = !!viewer && viewer.id === card.ownerId;
  const isAdmin = !!viewer && viewer.role === 'admin';
  if (card.status !== 'approved' && !isOwner && !isAdmin) throw notFound('卡片不存在');

  const owner = serialize.findUser(ctx.db, card.ownerId);
  if ((!owner || owner.status === 'banned') && !isOwner && !isAdmin) throw notFound('卡片不存在');
  return {
    body: {
      card: serialize.cardDetail(ctx.db, card, viewer),
      owner: serialize.publicUser(ctx.db, owner),
    },
  };
}

/** GET /api/public/cards/:shareToken：分享页（无需登录，卡片必须 approved） */
async function publicByShareToken(ctx) {
  const card = ctx.db.find('cards', (item) => item.shortToken === ctx.params.shareToken || item.shareToken === ctx.params.shareToken);
  if (!card || card.status !== 'approved') throw notFound('卡片不存在或未通过审核');
  const owner = serialize.findUser(ctx.db, card.ownerId);
  if (!owner || owner.status === 'banned') throw notFound('卡片不存在或未通过审核');
  return {
    body: {
      card: serialize.cardDetail(ctx.db, card, ctx.user),
      owner: serialize.publicUser(ctx.db, owner),
    },
  };
}

/** POST /api/cards：新建卡片（status=pending，等待人工审核） */
async function create(ctx) {
  const user = auth.requireUser(ctx);
  const payload = validateCardCreate(ctx.body || {});
  if (payload.contestOptIn && !contests.canAutoEnter(ctx.db, user.id)) {
    throw badRequest({ contestOptIn: '每个账号最多提交 2 件参赛作品，请先在比赛报名页调整' });
  }
  const contentConsent = { ...require('../legal').requireAcceptance(ctx.body, true), userId: user.id };

  const frontImage = await saveImage(payload.frontImage, ctx.uploadsDir, 'frontImage');
  const backImage = payload.backImage
    ? await saveImage(payload.backImage, ctx.uploadsDir, 'backImage')
    : '';

  const now = new Date().toISOString();
  const card = {
    id: createId('c'),
    ownerId: user.id,
    contentConsent,
    title: payload.title,
    callSign: payload.callSign,
    band: payload.band,
    mode: payload.mode,
    notes: payload.notes,
    stock: payload.stock,
    contestOptIn: payload.contestOptIn,
    contestDescription: payload.contestDescription,
    ratio: payload.ratio,
    frontImage,
    backImage,
    status: 'pending',
    rejectReason: null,
    shareToken: randomString(24),
    shortToken: createShortToken(ctx.db.data.cards),
    createdAt: now,
    updatedAt: now,
  };
  ctx.db.insert('cards', card);
  await ctx.db.save();
  return {
    status: 201,
    afterCommit: reviewAfterCommit(ctx, card, 'created'),
    body: {
      card: serialize.cardPublic(ctx.db, card, user, { shareToken: true, rejectReason: true }),
    },
  };
}

/** PUT /api/cards/:id：owner（重置为 pending）或 admin（不重置，除非显式传 status） */
async function update(ctx) {
  const user = auth.requireUser(ctx);
  const card = ctx.db.find('cards', (item) => item.id === ctx.params.id);
  if (!card) throw notFound('卡片不存在');

  const isOwner = card.ownerId === user.id;
  const isAdmin = user.role === 'admin';
  if (!isOwner && !isAdmin) throw forbidden('只能修改自己的卡片');

  const patch = validateCardUpdate(isObj(ctx.body) ? ctx.body : {}, { allowStatus: isAdmin });
  if (patch.contestOptIn === true && !contests.canAutoEnter(ctx.db, card.ownerId, card.id)) {
    throw badRequest({ contestOptIn: '每个账号最多提交 2 件参赛作品，请先在比赛报名页调整' });
  }
  // An administrator moderating someone else's card cannot consent for its owner.
  if (isOwner) {
    patch.contentConsent = { ...require('../legal').requireAcceptance(ctx.body, true), userId: user.id };
  }

  if (patch.frontImage) {
    patch.frontImage = await saveImage(patch.frontImage, ctx.uploadsDir, 'frontImage');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'backImage')) {
    patch.backImage = patch.backImage
      ? await saveImage(patch.backImage, ctx.uploadsDir, 'backImage')
      : '';
  }

  const previousStatus = card.status;
  const wasContestOptIn = card.contestOptIn === true;
  const before = structuredClone(card);
  Object.assign(card, patch);
  if (!isAdmin) {
    // 普通用户提交编辑后重新进入审核队列；库存使用独立接口维护
    card.status = 'pending';
    card.rejectReason = null;
  } else if (patch.status === 'approved' || patch.status === 'pending') {
    card.rejectReason = null;
  }
  card.updatedAt = new Date().toISOString();
  if (wasContestOptIn && patch.contestOptIn === false) {
    contests.removeAutoEntry(ctx.db, card, card.updatedAt);
  }
  contests.invalidateCardEntries(ctx.db, before, card);
  const autoEntry = card.status === 'approved'
    ? contests.syncAutoEntry(ctx.db, card, user.id, card.updatedAt)
    : null;
  await ctx.db.save();

  return {
    afterCommit: approvedMailAfterCommit(ctx, card, previousStatus) ||
      (!isAdmin || previousStatus !== 'pending' ? reviewAfterCommit(ctx, card, 'resubmitted') : undefined),
    body: {
      card: serialize.cardPublic(ctx.db, card, user, { shareToken: true, rejectReason: true, contest: true }),
      ...(autoEntry ? { contestAutoEntry: autoEntry } : {}),
    },
  };
}

/** PUT /api/cards/:id/stock：仅发卡者，独立维护库存，不改变内容审核。 */
async function updateStock(ctx) {
  const user = auth.requireUser(ctx);
  const card = ctx.db.find('cards', item => item.id === ctx.params.id);
  if (!card) throw notFound('卡片不存在');
  if (card.ownerId !== user.id) throw forbidden('只能调整自己的卡片库存');
  card.stock = validateStock(isObj(ctx.body) ? ctx.body.stock : undefined);
  card.updatedAt = new Date().toISOString();
  await ctx.db.save();
  return { body: { card: serialize.cardPublic(ctx.db, card, user, { shareToken: true, rejectReason: true }) } };
}

/** DELETE /api/cards/:id：owner/admin，级联删除点赞与换卡申请 */
async function remove(ctx) {
  const user = auth.requireUser(ctx);
  const card = ctx.db.find('cards', (item) => item.id === ctx.params.id);
  if (!card) throw notFound('卡片不存在');
  if (card.ownerId !== user.id && user.role !== 'admin') {
    throw forbidden('只能删除自己的卡片');
  }
  cascadeDeleteCard(ctx.db, card.id);
  await ctx.db.save();
  return { body: { ok: true } };
}

/** POST /api/cards/:id/like：切换点赞 */
async function toggleLike(ctx) {
  const user = auth.requireUser(ctx);
  const card = ctx.db.find('cards', (item) => item.id === ctx.params.id);
  if (!card) throw notFound('卡片不存在');
  const canView =
    card.status === 'approved' || card.ownerId === user.id || user.role === 'admin';
  if (!canView) throw notFound('卡片不存在');

  const existing = ctx.db.find(
    'likes',
    (like) => like.cardId === card.id && like.userId === user.id
  );
  if (existing) {
    ctx.db.removeWhere('likes', (like) => like.id === existing.id);
  } else {
    ctx.db.insert('likes', {
      id: createId('l'),
      cardId: card.id,
      userId: user.id,
      createdAt: new Date().toISOString(),
    });
  }
  await ctx.db.save();
  return {
    body: {
      liked: !existing,
      likeCount: ctx.db.count('likes', (like) => like.cardId === card.id),
    },
  };
}

/** GET /api/cards/:id/share：owner/admin 获取分享 token 与完整链接 */
async function share(ctx) {
  const user = auth.requireUser(ctx);
  const card = ctx.db.find('cards', (item) => item.id === ctx.params.id);
  if (!card) throw notFound('卡片不存在');
  if (card.ownerId !== user.id && user.role !== 'admin') {
    throw forbidden('只有卡片主人或管理员可以获取分享链接');
  }
  return {
    body: {
      shareToken: card.shortToken,
      url: `${ctx.config.publicOrigin || requestProtocol(ctx) + '://' + ctx.host}/s/${card.shortToken}`,
    },
  };
}

module.exports = {
  routes: [
    { method: 'GET', pattern: '/api/cards', handler: list },
    { method: 'GET', pattern: '/api/cards/:id', handler: detail },
    { method: 'GET', pattern: '/api/public/cards/:shareToken', handler: publicByShareToken },
    { method: 'POST', pattern: '/api/cards', handler: create },
    { method: 'PUT', pattern: '/api/cards/:id', handler: update },
    { method: 'PUT', pattern: '/api/cards/:id/stock', handler: updateStock },
    { method: 'DELETE', pattern: '/api/cards/:id', handler: remove },
    { method: 'POST', pattern: '/api/cards/:id/like', handler: toggleLike },
    { method: 'GET', pattern: '/api/cards/:id/share', handler: share },
  ],
};
