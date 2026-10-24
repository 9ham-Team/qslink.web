'use strict';

/**
 * JSON 持久化层。
 * - 单文件 data/db.json，内存缓存 + 串行写队列；
 * - 原子写：先写同目录临时文件，再 rename 覆盖，避免半截文件；
 * - 集合助手：users / cards / exchanges / sessions / likes 均为数组；
 * - 级联删除助手：删卡片/用户时清理点赞、换卡申请、会话。
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = 1;
const COLLECTIONS = ['users', 'cards', 'exchanges', 'sessions', 'likes'];

function emptyData() {
  const data = { version: SCHEMA_VERSION };
  for (const name of COLLECTIONS) data[name] = [];
  return data;
}

function normalizeData(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  for (const name of COLLECTIONS) {
    if (!Array.isArray(data[name])) data[name] = [];
  }
  if (typeof data.version !== 'number') data.version = SCHEMA_VERSION;
  return data;
}

/** 生成短 ID，如 u_1a2b3c4d / c_... / e_... */
function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

/** 生成 URL 安全的随机字符串（分享 token 等） */
function randomString(length = 10) {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** 原子写入：tmp 文件 + rename；Windows 上偶发 EPERM/EBUSY 时重试 */
async function writeAtomic(file, content) {
  const dir = path.dirname(file);
  const tmp = path.join(
    dir,
    `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`
  );
  await fsp.writeFile(tmp, content, { encoding: 'utf8', mode: 0o600 });
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await fsp.rename(tmp, file);
      return;
    } catch (err) {
      lastError = err;
      // EPERM/EBUSY 常见于 Windows 杀毒软件瞬时占用，短暂重试
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
  // Never remove the last good database to work around a failed rename.
  await fsp.unlink(tmp).catch(() => {});
  throw lastError;
}

class Database {
  constructor(file) {
    this.file = file;
    this.data = emptyData();
    this.exists = false;
    this._queue = Promise.resolve();
  }

  /** 加载数据文件；不存在返回 false（由调用方决定是否 seed） */
  async load() {
    let raw;
    try {
      raw = await fsp.readFile(this.file, 'utf8');
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        this.data = emptyData();
        this.exists = false;
        return false;
      }
      throw err;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`数据文件不是合法 JSON，请检查或删除重建：${this.file}`);
    }
    this.data = normalizeData(parsed);
    this.exists = true;
    return true;
  }

  /** 串行持久化；调用方必须收到写入失败，不能向客户端假报成功。 */
  save() {
    const content = JSON.stringify(this.data, null, 2);
    const file = this.file;
    const write = this._queue.then(() => {
      if (this.writeError) throw this.writeError;
      return writeAtomic(file, content);
    });
    this._queue = write.catch(err => { this.writeError = err; });
    return write;
  }

  /** 等待队列中所有写入完成（优雅退出时使用） */
  async flush() {
    await this._queue;
  }

  /* ---------------- 集合助手 ---------------- */

  col(name) {
    return this.data[name];
  }

  find(name, predicate) {
    return this.data[name].find(predicate) || null;
  }

  filter(name, predicate) {
    return this.data[name].filter(predicate);
  }

  count(name, predicate) {
    return predicate ? this.filter(name, predicate).length : this.data[name].length;
  }

  insert(name, doc) {
    this.data[name].push(doc);
    return doc;
  }

  removeWhere(name, predicate) {
    const removed = this.data[name].filter(predicate);
    this.data[name] = this.data[name].filter((doc) => !predicate(doc));
    return removed;
  }

  updateWhere(name, predicate, patch) {
    let changed = 0;
    for (const doc of this.data[name]) {
      if (!predicate(doc)) continue;
      Object.assign(doc, typeof patch === 'function' ? patch(doc) : patch);
      changed++;
    }
    return changed;
  }
}

/** 分页切片，返回接口约定的分页结构 */
function paginate(items, page, limit) {
  const total = items.length;
  const pages = Math.ceil(total / limit) || 0;
  const start = (page - 1) * limit;
  return {
    items: start >= total ? [] : items.slice(start, start + limit),
    total,
    page,
    limit,
    pages,
  };
}

/** 删除卡片时级联清理：卡片记录本身、点赞与换卡申请 */
function cascadeDeleteCard(db, cardId) {
  db.data.cards = db.data.cards.filter((card) => card.id !== cardId);
  db.data.likes = db.data.likes.filter((like) => like.cardId !== cardId);
  db.data.exchanges = db.data.exchanges.filter((ex) => ex.cardId !== cardId);
}

/** 删除用户时级联清理：其卡片、相关点赞/申请、会话，最后移除用户记录本身 */
function cascadeDeleteUser(db, userId) {
  const ownedCardIds = new Set(
    db.data.cards.filter((card) => card.ownerId === userId).map((card) => card.id)
  );
  db.data.cards = db.data.cards.filter((card) => card.ownerId !== userId);
  db.data.likes = db.data.likes.filter((like) => !ownedCardIds.has(like.cardId));
  db.data.exchanges = db.data.exchanges.filter(
    (ex) => !ownedCardIds.has(ex.cardId) && ex.fromUserId !== userId && ex.toUserId !== userId
  );
  db.data.sessions = db.data.sessions.filter((session) => session.userId !== userId);
  db.data.users = db.data.users.filter((user) => user.id !== userId);
}

module.exports = {
  Database,
  createId,
  randomString,
  paginate,
  cascadeDeleteCard,
  cascadeDeleteUser,
  SCHEMA_VERSION,
  COLLECTIONS,
};
