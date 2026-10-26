'use strict';

/** 换卡申请路由：创建 / 详情 / 同意 / 拒绝 / 撤回 / 完成 */

const { badRequest, conflict, forbidden, notFound } = require('../errors');
const { validateExchangeCreate, validateRejectReason } = require('../validate');
const auth = require('../auth');
const { createId } = require('../db');
const serialize = require('../serialize');

function findExchange(ctx) {
  const exchange = ctx.db.find('exchanges', (item) => item.id === ctx.params.id);
  if (!exchange) throw notFound('换卡申请不存在');
  return exchange;
}

/** POST /api/cards/:cardId/exchanges：发起换卡申请 */
async function create(ctx) {
  const user = auth.requireUser(ctx);
  const card = ctx.db.find('cards', (item) => item.id === ctx.params.cardId);
  if (!card) throw notFound('卡片不存在');

  const payload = validateExchangeCreate(ctx.body || {});

  if (card.ownerId === user.id) {
    throw badRequest({ cardId: '不能申请自己的卡片' }, '不能申请自己的卡片');
  }
  if (card.status !== 'approved') {
    throw badRequest(null, '该卡片尚未通过审核，暂不可申请');
  }
  const owner = serialize.findUser(ctx.db, card.ownerId);
  if (!owner || owner.status === 'banned') {
    throw badRequest(null, '该卡片暂不可申请');
  }
  const duplicated = ctx.db.find(
    'exchanges',
    (item) =>
      item.cardId === card.id &&
      item.fromUserId === user.id &&
      (item.status === 'pending' || item.status === 'approved')
  );
  if (duplicated) {
    throw conflict('CONFLICT', '你已申请过这张卡片，请等待对方处理');
  }

  const now = new Date().toISOString();
  const exchange = {
    id: createId('e'),
    cardId: card.id,
    fromUserId: user.id,
    toUserId: card.ownerId,
    status: 'pending',
    message: payload.message,
    rejectReason: null,
    contactName: payload.contactName,
    fromAddress: payload.address,
    createdAt: now,
    updatedAt: now,
    decidedAt: null,
  };
  ctx.db.insert('exchanges', exchange);
  await ctx.db.save();
  return {
    status: 201,
    body: { exchange: serialize.exchangeItem(ctx.db, exchange, user) },
  };
}

/** GET /api/exchanges/:id：参与者或管理员 */
async function detail(ctx) {
  const user = auth.requireUser(ctx);
  const exchange = findExchange(ctx);
  const isParticipant = exchange.fromUserId === user.id || exchange.toUserId === user.id;
  if (!isParticipant && user.role !== 'admin') {
    throw forbidden('无权查看该换卡申请');
  }
  return { body: { exchange: serialize.exchangeItem(ctx.db, exchange, user) } };
}

/** POST /api/exchanges/:id/approve：仅卡片主人；每笔申请独立审批 */
async function approve(ctx) {
  const user = auth.requireUser(ctx);
  const exchange = findExchange(ctx);
  if (exchange.toUserId !== user.id) throw forbidden('只有卡片主人可以处理申请');
  if (exchange.status !== 'pending') throw badRequest(null, '该申请已处理，无法再次审批');

  const now = new Date().toISOString();
  exchange.status = 'approved';
  exchange.decidedAt = now;
  exchange.updatedAt = now;
  await ctx.db.save();
  return { body: { exchange: serialize.exchangeItem(ctx.db, exchange, user) } };
}

/** POST /api/exchanges/:id/reject：仅卡片主人，可附拒绝原因 */
async function reject(ctx) {
  const user = auth.requireUser(ctx);
  const exchange = findExchange(ctx);
  if (exchange.toUserId !== user.id) throw forbidden('只有卡片主人可以处理申请');
  if (exchange.status !== 'pending') throw badRequest(null, '该申请已处理，无法再次审批');

  const reason = validateRejectReason(ctx.body || {});
  const now = new Date().toISOString();
  exchange.status = 'rejected';
  exchange.rejectReason = reason || null;
  exchange.decidedAt = now;
  exchange.updatedAt = now;
  await ctx.db.save();
  return { body: { exchange: serialize.exchangeItem(ctx.db, exchange, user) } };
}

/** POST /api/exchanges/:id/cancel：仅申请人，仅 pending */
async function cancel(ctx) {
  const user = auth.requireUser(ctx);
  const exchange = findExchange(ctx);
  if (exchange.fromUserId !== user.id) throw forbidden('只有申请人可以撤回申请');
  if (exchange.status !== 'pending') throw badRequest(null, '该申请已处理，无法撤回');

  const now = new Date().toISOString();
  exchange.status = 'cancelled';
  exchange.decidedAt = now;
  exchange.updatedAt = now;
  await ctx.db.save();
  return { body: { exchange: serialize.exchangeItem(ctx.db, exchange, user) } };
}

/** POST /api/exchanges/:id/complete：参与者双方，仅 approved */
async function complete(ctx) {
  const user = auth.requireUser(ctx);
  const exchange = findExchange(ctx);
  const isParticipant = exchange.fromUserId === user.id || exchange.toUserId === user.id;
  if (!isParticipant) throw forbidden('只有换卡双方可以确认完成');
  if (exchange.status !== 'approved') throw badRequest(null, '仅已同意的申请可以确认完成');

  const now = new Date().toISOString();
  exchange.status = 'completed';
  exchange.updatedAt = now;
  await ctx.db.save();
  return { body: { exchange: serialize.exchangeItem(ctx.db, exchange, user) } };
}

module.exports = {
  routes: [
    { method: 'POST', pattern: '/api/cards/:cardId/exchanges', handler: create },
    { method: 'GET', pattern: '/api/exchanges/:id', handler: detail },
    { method: 'POST', pattern: '/api/exchanges/:id/approve', handler: approve },
    { method: 'POST', pattern: '/api/exchanges/:id/reject', handler: reject },
    { method: 'POST', pattern: '/api/exchanges/:id/cancel', handler: cancel },
    { method: 'POST', pattern: '/api/exchanges/:id/complete', handler: complete },
  ],
};
