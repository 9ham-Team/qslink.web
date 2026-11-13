'use strict';

const { notFound, badRequest } = require('./errors');
const { createId } = require('./db');

const CONTEST = { key: 'qsl-design-2026-11', title: '第一届QSLink杯QSL卡片设计大赛' };
const AUTO_ENTRY_LIMIT = 2;
const CONTENT_FIELDS = ['title', 'callSign', 'band', 'mode', 'notes', 'ratio', 'frontImage', 'backImage'];
const REVIEW_FIELDS = [...CONTENT_FIELDS, 'contestOptIn', 'contestDescription'];

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
  return REVIEW_FIELDS.some((key) => JSON.stringify(before[key]) !== JSON.stringify(card[key]));
}

function entryWorks(db, entry) {
  return db.data.contestWorks.filter((work) => work.entryId === entry.id && work.active)
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.number - b.number);
}

function activeWorksForUser(db, userId, eventKey = CONTEST.key) {
  const entry = db.find('contestEntries', (item) => item.eventKey === eventKey && item.userId === userId);
  return entry ? entryWorks(db, entry) : [];
}

/** 自动参赛与手动报名共用 2 件作品上限；已在报名中的卡片可以继续更新。 */
function canAutoEnter(db, userId, cardId, eventKey = CONTEST.key) {
  const works = activeWorksForUser(db, userId, eventKey);
  if (cardId && works.some((work) => work.cardId === cardId)) return true;
  return works.length < AUTO_ENTRY_LIMIT;
}

function nextWorkNumber(db, eventKey) {
  return db.data.contestWorks.reduce((max, work) => work.eventKey === eventKey ? Math.max(max, work.number) : max, 0) + 1;
}

/**
 * 卡片审核通过时，把勾选自动参赛的卡片同步为赛事作品。
 * 自动参赛的说明随卡片一起审核；只有所有当前作品都来自自动参赛时，才整份报名自动通过。
 */
function syncAutoEntry(db, card, reviewerId, now = new Date().toISOString()) {
  if (card.status !== 'approved' || card.contestOptIn !== true) return null;
  const description = typeof card.contestDescription === 'string' ? card.contestDescription.trim() : '';
  if (!description || Array.from(description).length > 2000) return { status: 'skipped', reason: 'description' };
  const user = db.find('users', (item) => item.id === card.ownerId);
  if (!user || user.status !== 'active') return { status: 'skipped', reason: 'user' };
  const eventKey = CONTEST.key;
  let entry = db.find('contestEntries', (item) => item.eventKey === eventKey && item.userId === user.id);
  const existingWork = db.find('contestWorks', (item) => item.eventKey === eventKey && item.cardId === card.id);
  if (entry) {
    const activeOthers = entryWorks(db, entry).filter((work) => !existingWork || work.id !== existingWork.id);
    if ((!existingWork || !existingWork.active) && activeOthers.length >= AUTO_ENTRY_LIMIT) {
      return { status: 'skipped', reason: 'limit' };
    }
  }
  let changed = false;
  if (!entry) {
    entry = db.insert('contestEntries', {
      id: createId('ce'), eventKey, userId: user.id, contactEmail: user.email,
      status: 'pending', reviewReason: null, reviewedBy: null, reviewedAt: null,
      revision: 1, createdAt: now, updatedAt: now,
    });
    changed = true;
  }
  let work = existingWork;
  if (!work) {
    work = db.insert('contestWorks', {
      id: createId('cw'), eventKey, entryId: entry.id, cardId: card.id,
      number: nextWorkNumber(db, eventKey), description, submittedAt: now, active: true,
    });
    changed = true;
  } else if (work.entryId !== entry.id || !work.active || work.description !== description) {
    Object.assign(work, { entryId: entry.id, description, active: true });
    changed = true;
  }
  const works = entryWorks(db, entry);
  const allAuto = works.length > 0 && works.every((item) => {
    const itemCard = db.find('cards', (candidate) => candidate.id === item.cardId);
    const reviewedDescription = itemCard && typeof itemCard.contestDescription === 'string'
      ? itemCard.contestDescription.trim() : '';
    return itemCard && itemCard.ownerId === entry.userId &&
      itemCard.contestOptIn === true && itemCard.status === 'approved' &&
      item.description === reviewedDescription;
  });
  if (entry.status !== 'approved' && allAuto) {
    Object.assign(entry, {
      status: 'approved', reviewReason: null, reviewedBy: reviewerId, reviewedAt: now,
      revision: entry.revision + 1, updatedAt: now,
    });
    changed = true;
  } else if (changed) {
    entry.revision += 1;
    entry.updatedAt = now;
  }
  return { status: 'entered', entryStatus: entry.status, workId: work.id, number: work.number };
}

/** 用户取消自动参赛时，同时撤回该卡片的参赛作品。 */
function removeAutoEntry(db, card, now = new Date().toISOString()) {
  const work = db.find('contestWorks', (item) => item.eventKey === CONTEST.key &&
    item.cardId === card.id && item.active);
  if (!work) return false;
  work.active = false;
  const entry = db.find('contestEntries', (item) => item.id === work.entryId);
  if (entry) resetEntry(entry, now);
  return true;
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

module.exports = { requireContest, announcementScope, resetEntry, cardContentChanged, invalidateCardEntries,
  entryWorks, entryView, activeWorksForUser, canAutoEnter, syncAutoEntry, removeAutoEntry };
