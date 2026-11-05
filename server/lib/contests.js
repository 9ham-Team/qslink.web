'use strict';

const { notFound, badRequest } = require('./errors');

const CONTEST = { key: 'qsl-design-2026-11', title: '第一届QSLink QSL 卡片设计大赛' };
const CONTENT_FIELDS = ['title', 'callSign', 'band', 'mode', 'notes', 'ratio', 'frontImage', 'backImage'];

function requireContest(key) {
  if (key !== CONTEST.key) throw notFound('赛事不存在');
  return CONTEST;
}

function announcementScope(value) {
  if (value == null) return null;
  if (value !== CONTEST.key) throw badRequest({ eventKey: '赛事不存在' });
  return value;
}

function resetEntry(entry, now = new Date().toISOString()) {
  Object.assign(entry, {
    status: 'pending', reviewReason: null, reviewedBy: null, reviewedAt: null,
    revision: entry.revision + 1, updatedAt: now,
  });
}

function cardContentChanged(before, card) {
  return CONTENT_FIELDS.some((key) => JSON.stringify(before[key]) !== JSON.stringify(card[key]));
}

function invalidateCardEntries(db, before, card) {
  if (!cardContentChanged(before, card) && !(before.status === 'approved' && card.status !== 'approved')) return;
  for (const entry of db.data.contestEntries) {
    if ((entry.cardIds || []).includes(card.id)) resetEntry(entry);
  }
}

function cardView(card) {
  return Object.fromEntries(['id', 'ownerId', ...CONTENT_FIELDS, 'status'].map((key) => [key, card[key]]));
}

function entryView(db, entry) {
  if (!entry) return null;
  const cards = (entry.cardIds || [])
    .map((id) => db.find('cards', (item) => item.id === id))
    .filter(Boolean)
    .map(cardView);
  const user = db.find('users', (item) => item.id === entry.userId);
  return {
    user: user ? Object.fromEntries(['id', 'uid', 'username', 'displayName', 'callSign', 'avatarColor', 'status'].map((key) => [key, user[key]])) : null,
    id: entry.id, eventKey: entry.eventKey, userId: entry.userId,
    cardIds: entry.cardIds || [], cards,
    description: entry.description, contactEmail: entry.contactEmail,
    status: entry.status, reviewReason: entry.reviewReason, reviewedBy: entry.reviewedBy,
    reviewedAt: entry.reviewedAt, revision: entry.revision,
    createdAt: entry.createdAt, updatedAt: entry.updatedAt,
  };
}

module.exports = { requireContest, announcementScope, resetEntry, cardContentChanged, invalidateCardEntries, entryView };
