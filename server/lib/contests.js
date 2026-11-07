'use strict';

const { notFound, badRequest } = require('./errors');

const CONTEST = { key: 'qsl-design-2026-11', title: '第一届QSLink杯QSL卡片设计大赛' };
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
    if (entryWorks(db, entry).some((work) => work.cardId === card.id)) resetEntry(entry);
  }
}

function cardView(card) {
  return Object.fromEntries(['id', 'ownerId', ...CONTENT_FIELDS, 'status'].map((key) => [key, card[key]]));
}

function entryWorks(db, entry) {
  return db.data.contestWorks.filter((work) => work.entryId === entry.id && work.active)
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.number - b.number);
}

function entryView(db, entry) {
  if (!entry) return null;
  const works = entryWorks(db, entry).map((work) => {
    const card = db.find('cards', (item) => item.id === work.cardId);
    return { id: work.id, cardId: work.cardId, number: work.number, description: work.description,
      submittedAt: work.submittedAt, card: card ? cardView(card) : null };
  });
  const cards = works.map((work) => work.card).filter(Boolean);
  const user = db.find('users', (item) => item.id === entry.userId);
  return {
    user: user ? Object.fromEntries(['id', 'uid', 'username', 'displayName', 'callSign', 'avatarColor', 'status'].map((key) => [key, user[key]])) : null,
    id: entry.id, eventKey: entry.eventKey, userId: entry.userId,
    works, cardIds: works.map((work) => work.cardId), cards,
    contactEmail: entry.contactEmail,
    status: entry.status, reviewReason: entry.reviewReason, reviewedBy: entry.reviewedBy,
    reviewedAt: entry.reviewedAt, revision: entry.revision,
    createdAt: entry.createdAt, updatedAt: entry.updatedAt,
  };
}

module.exports = { requireContest, announcementScope, resetEntry, cardContentChanged, invalidateCardEntries, entryWorks, entryView };
