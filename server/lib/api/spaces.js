'use strict';

const { notFound } = require('../errors');
const { parsePagination, parseEnum } = require('../validate');
const { paginate } = require('../db');
const { cardPublic } = require('../serialize');

async function space(ctx) {
  const uid = ctx.params.uid;
  if (!/^[0-9]{9}$/.test(uid) || uid === '000000000') throw notFound('主页不存在');
  const owner = ctx.db.find('users', user => user.uid === uid && user.status !== 'banned');
  if (!owner) throw notFound('主页不存在');
  const { page, limit } = parsePagination(ctx.query);
  const sort = parseEnum(ctx.query, 'sort', ['latest', 'popular'], 'latest');
  const likeCounts = new Map();
  for (const like of ctx.db.data.likes) likeCounts.set(like.cardId, (likeCounts.get(like.cardId) || 0) + 1);
  const cards = ctx.db.filter('cards', card => card.ownerId === owner.id && card.status === 'approved')
    .sort((a, b) => (sort === 'popular' ? (likeCounts.get(b.id) || 0) - (likeCounts.get(a.id) || 0) : 0)
      || b.createdAt.localeCompare(a.createdAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  const ids = new Set(cards.map(card => card.id));
  const likesReceived = ctx.db.count('likes', like => ids.has(like.cardId));
  const result = paginate(cards, page, limit);
  return { body: {
    // Explicit allowlist: the same public profile for guests, members and the owner.
    user: {
      uid: owner.uid, displayName: owner.displayName, callSign: owner.callSign || '',
      bio: owner.bio || '', avatarColor: owner.avatarColor, joinedAt: owner.createdAt,
      stats: { cards: cards.length, likesReceived },
    },
    cards: { ...result, items: result.items.map(card => cardPublic(ctx.db, card, ctx.user)) },
    url: ctx.config.publicOrigin ? ctx.config.publicOrigin + '/space/' + uid : null,
  } };
}

module.exports = { routes: [{ method: 'GET', pattern: '/api/public/spaces/:uid', handler: space }] };
