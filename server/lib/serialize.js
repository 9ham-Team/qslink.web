'use strict';

/**
 * 数据序列化：把数据库原始记录转换为 API 契约中的公开对象。
 * - 绝不返回 passwordHash；
 * - 统计字段现算（卡片数 / 收到点赞 / 换卡数）；
 * - 地址可见性：pending/rejected/cancelled 不返回双方地址，approved/completed 返回，
 *   管理员全部可见。
 */

function findUser(db, id) {
  return db.data.users.find((user) => user.id === id) || null;
}

function findCard(db, id) {
  return db.data.cards.find((card) => card.id === id) || null;
}

/* ---------------- 用户 ---------------- */

function userStats(db, user) {
  let cards = 0;
  const ownedCardIds = new Set();
  for (const card of db.data.cards) {
    if (card.ownerId !== user.id) continue;
    cards++;
    ownedCardIds.add(card.id);
  }
  let likesReceived = 0;
  for (const like of db.data.likes) {
    if (ownedCardIds.has(like.cardId)) likesReceived++;
  }
  let exchanges = 0;
  let pendingExchanges = 0;
  for (const exchange of db.data.exchanges) {
    if (exchange.fromUserId === user.id || exchange.toUserId === user.id) exchanges++;
    if (exchange.toUserId === user.id && exchange.status === 'pending') pendingExchanges++;
  }
  return { cards, likesReceived, exchanges, pendingExchanges };
}

/** UserPublic（对他人可见） */
function publicUser(db, user) {
  if (!user) return null;
  const stats = userStats(db, user);
  return {
    id: user.id,
    uid: user.uid,
    username: user.username,
    displayName: user.displayName,
    callSign: user.callSign || '',
    bio: user.bio || '',
    avatarColor: user.avatarColor,
    role: user.role,
    joinedAt: user.createdAt,
    stats: {
      cards: stats.cards,
      likesReceived: stats.likesReceived,
      exchanges: stats.exchanges,
    },
  };
}

/** UserSelf（本人）：UserPublic + email/status/address/时间戳 + stats.pendingExchanges */
function selfUser(db, user) {
  const stats = userStats(db, user);
  const base = publicUser(db, user);
  base.stats.pendingExchanges = stats.pendingExchanges;
  return {
    ...base,
    email: user.email,
    status: user.status,
    address: user.address || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt || user.createdAt,
  };
}

/** UserAdmin（管理后台用户列表）：UserPublic + email/status/createdAt/cardCount/exchangeCount */
function adminUser(db, user) {
  const stats = userStats(db, user);
  return {
    ...publicUser(db, user),
    email: user.email,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt || user.createdAt,
    cardCount: stats.cards,
    exchangeCount: stats.exchanges,
  };
}

/** 卡片上的 owner 摘要 */
function cardOwner(db, card) {
  const owner = findUser(db, card.ownerId);
  if (!owner) {
    return {
      id: card.ownerId,
      username: 'unknown',
      displayName: '已注销用户',
      callSign: '',
      avatarColor: '#94a3b8',
    };
  }
  return {
    id: owner.id,
    uid: owner.uid,
    username: owner.username,
    displayName: owner.displayName,
    callSign: owner.callSign || '',
    avatarColor: owner.avatarColor,
  };
}

/* ---------------- 卡片 ---------------- */

function likeCountForCard(db, cardId) {
  let count = 0;
  for (const like of db.data.likes) if (like.cardId === cardId) count++;
  return count;
}

function isLiked(db, cardId, userId) {
  if (!userId) return false;
  return db.data.likes.some((like) => like.cardId === cardId && like.userId === userId);
}

function exchangeCountForCard(db, cardId) {
  let count = 0;
  for (const exchange of db.data.exchanges) {
    if (exchange.cardId !== cardId) continue;
    if (exchange.status === 'approved' || exchange.status === 'completed') count++;
  }
  return count;
}

/**
 * CardPublic。
 * @param {object} options { shareToken, rejectReason, ownerStatus }
 */
function cardPublic(db, card, viewer, options = {}) {
  const owner = cardOwner(db, card);
  if (options.ownerStatus) {
    const rawOwner = findUser(db, card.ownerId);
    owner.status = rawOwner ? rawOwner.status : 'banned';
  }
  const result = {
    id: card.id,
    title: card.title,
    callSign: card.callSign || '',
    band: card.band,
    mode: card.mode,
    notes: card.notes || '',
    stock: card.stock == null ? null : card.stock,
    ratio: card.ratio,
    frontImage: card.frontImage,
    backImage: card.backImage || '',
    likeCount: likeCountForCard(db, card.id),
    liked: viewer ? isLiked(db, card.id, viewer.id) : false,
    status: card.status,
    exchangeCount: exchangeCountForCard(db, card.id),
    createdAt: card.createdAt,
    owner,
  };
  if (options.shareToken) result.shareToken = card.shortToken;
  if (options.rejectReason) result.rejectReason = card.rejectReason || null;
  return result;
}

/** CardDetail：CardPublic + canApply / isOwner / shareToken / myExchange */
function cardDetail(db, card, viewer) {
  const base = cardPublic(db, card, viewer);
  const rawOwner = findUser(db, card.ownerId);
  const ownerActive = !!rawOwner && rawOwner.status !== 'banned';
  const isOwner = !!viewer && viewer.id === card.ownerId;

  let myExchangeRecord = null;
  if (viewer) {
    for (const exchange of db.data.exchanges) {
      if (exchange.cardId !== card.id || exchange.fromUserId !== viewer.id) continue;
      if (!myExchangeRecord || exchange.createdAt > myExchangeRecord.createdAt) myExchangeRecord = exchange;
    }
  }
  const hasActiveExchange =
    !!myExchangeRecord && (myExchangeRecord.status === 'pending' || myExchangeRecord.status === 'approved');

  // canApply：卡片可被申请（申请动作本身需登录）。匿名访问分享页时为 true，便于前端展示 CTA。
  const canApply =
    card.status === 'approved' && ownerActive && card.stock !== 0 && !isOwner && !hasActiveExchange;

  return {
    ...base,
    canApply,
    isOwner,
    shareToken: card.shortToken,
    myExchange: myExchangeRecord ? { id: myExchangeRecord.id, status: myExchangeRecord.status } : null,
  };
}

/* ---------------- 换卡申请 ---------------- */

function exchangeCardBrief(db, card) {
  if (!card) return null;
  return {
    id: card.id,
    title: card.title,
    callSign: card.callSign || '',
    ratio: card.ratio,
    frontImage: card.frontImage,
    backImage: card.backImage || '',
    shareToken: card.shortToken,
  };
}

function exchangeUserBrief(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    callSign: user.callSign || '',
    avatarColor: user.avatarColor,
  };
}

/**
 * ExchangeItem。direction 由当前请求者视角决定（incoming/outgoing/admin）。
 * 地址可见性：管理员全部可见；参与者仅在 approved/completed 后可见。
 */
function exchangeItem(db, exchange, viewer) {
  const card = findCard(db, exchange.cardId);
  const fromUser = findUser(db, exchange.fromUserId);
  const toUser = findUser(db, exchange.toUserId);
  const preferred = exchange.preferredCardId ? findCard(db, exchange.preferredCardId) : null;
  const preferredOwner = preferred ? findUser(db, preferred.ownerId) : null;
  const viewerIsAdmin = !!viewer && viewer.role === 'admin';

  let direction = 'admin';
  if (viewer) {
    if (viewer.id === exchange.fromUserId) direction = 'outgoing';
    else if (viewer.id === exchange.toUserId) direction = 'incoming';
  }

  const addressesVisible =
    viewerIsAdmin || exchange.status === 'approved' || exchange.status === 'completed';

  return {
    id: exchange.id,
    status: exchange.status,
    message: exchange.message || '',
    rejectReason: exchange.rejectReason || null,
    contactName: exchange.contactName || '',
    createdAt: exchange.createdAt,
    updatedAt: exchange.updatedAt || exchange.createdAt,
    decidedAt: exchange.decidedAt || null,
    direction,
    ...(['incoming', 'outgoing'].includes(direction) ? { selectedContactLogs: exchange.selectedContactLogs || [] } : {}),
    card: exchangeCardBrief(db, card),
    preferredCardId: exchange.preferredCardId || null,
    preferredCardTitle: exchange.preferredCardTitle || null,
    preferredCard: preferred && preferred.ownerId === exchange.fromUserId && preferred.status === 'approved' && preferredOwner && preferredOwner.status !== 'banned'
      ? exchangeCardBrief(db, preferred) : null,
    fromUser: exchangeUserBrief(fromUser),
    toUser: exchangeUserBrief(toUser),
    fromAddress: addressesVisible ? exchange.fromAddress || null : null,
    toAddress: addressesVisible ? (toUser && toUser.address ? toUser.address : null) : null,
  };
}

/* ---------------- 统计 ---------------- */

/** GET /api/me/exchanges 的 counts */
function exchangeCounts(db, user) {
  let incomingPending = 0;
  let outgoingPending = 0;
  let total = 0;
  for (const exchange of db.data.exchanges) {
    if (exchange.fromUserId !== user.id && exchange.toUserId !== user.id) continue;
    total++;
    if (exchange.status !== 'pending') continue;
    if (exchange.toUserId === user.id) incomingPending++;
    if (exchange.fromUserId === user.id) outgoingPending++;
  }
  return { incomingPending, outgoingPending, total };
}

/** GET /api/me/overview 的 stats */
function overviewStats(db, user) {
  let cards = 0;
  let approvedCards = 0;
  let pendingCards = 0;
  const ownedCardIds = new Set();
  for (const card of db.data.cards) {
    if (card.ownerId !== user.id) continue;
    cards++;
    ownedCardIds.add(card.id);
    if (card.status === 'approved') approvedCards++;
    if (card.status === 'pending') pendingCards++;
  }
  let likesReceived = 0;
  for (const like of db.data.likes) if (ownedCardIds.has(like.cardId)) likesReceived++;

  let incomingPending = 0;
  let outgoingPending = 0;
  let completedExchanges = 0;
  for (const exchange of db.data.exchanges) {
    if (exchange.fromUserId !== user.id && exchange.toUserId !== user.id) continue;
    if (exchange.status === 'completed') completedExchanges++;
    if (exchange.status !== 'pending') continue;
    if (exchange.toUserId === user.id) incomingPending++;
    if (exchange.fromUserId === user.id) outgoingPending++;
  }
  return {
    cards,
    approvedCards,
    pendingCards,
    likesReceived,
    incomingPending,
    outgoingPending,
    completedExchanges,
  };
}

module.exports = {
  findUser,
  findCard,
  publicUser,
  selfUser,
  adminUser,
  cardPublic,
  cardDetail,
  exchangeItem,
  exchangeCounts,
  overviewStats,
  userStats,
};
