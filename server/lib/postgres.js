'use strict';
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const { ApiError } = require('./errors');
const MIGRATIONS = ['001_initial.sql', '002_json_shapes.sql'];
const SCHEMA_VERSION = MIGRATIONS.length;
const COLLECTIONS = ['users', 'cards', 'exchanges', 'likes', 'sessions'];
const FIELDS = {
  users: [
    'id',
    'username',
    'email',
    'displayName',
    'callSign',
    'bio',
    'avatarColor',
    'role',
    'status',
    'address',
    'passwordHash',
    'createdAt',
    'updatedAt',
  ],
  cards: [
    'id',
    'ownerId',
    'title',
    'callSign',
    'band',
    'mode',
    'notes',
    'ratio',
    'frontImage',
    'backImage',
    'shareToken',
    'status',
    'rejectReason',
    'createdAt',
    'updatedAt',
  ],
  exchanges: [
    'id',
    'cardId',
    'fromUserId',
    'toUserId',
    'status',
    'message',
    'rejectReason',
    'contactName',
    'fromAddress',
    'createdAt',
    'updatedAt',
    'decidedAt',
  ],
  likes: ['id', 'cardId', 'userId', 'createdAt'],
  sessions: ['token', 'userId', 'createdAt', 'expiresAt'],
};
const quote = (name) => '"' + name + '"'; // Constants or schema-validated identifiers only.
const keyFor = (name) => (name === 'sessions' ? 'token' : 'id');
const emptyData = () =>
  Object.fromEntries([
    ['version', 1],
    ['demo', false],
    ...COLLECTIONS.map((name) => [name, []]),
  ]);
function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}
function randomString(length = 16) {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

// Request-local domain snapshot, not a process cache. Cooperating writers are
// serialized in PostgreSQL, and persistence applies only inserted/changed/deleted
// rows. Keep this small-community compatibility layer out of large-scale designs.
class UnitOfWork {
  constructor(client, write) {
    this.client = client;
    this.write = write;
    this.data = emptyData();
  }
  async load() {
    for (const name of COLLECTIONS) {
      this.data[name] = (
        await this.client.query(`SELECT * FROM ${quote(name)}`)
      ).rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            value instanceof Date ? value.toISOString() : value,
          ]),
        ),
      );
    }
    const meta = (await this.client.query('SELECT key,value FROM app_meta'))
      .rows;
    this.initialized = meta.some(
      (row) => row.key === 'initialized' && row.value === true,
    );
    this.data.demo = meta.some(
      (row) => row.key === 'demo' && row.value === true,
    );
    this.before = structuredClone(this.data);
    return this;
  }
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
    return predicate
      ? this.filter(name, predicate).length
      : this.data[name].length;
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
    let count = 0;
    for (const doc of this.data[name])
      if (predicate(doc)) {
        Object.assign(doc, typeof patch === 'function' ? patch(doc) : patch);
        count++;
      }
    return count;
  }
  async save() {
    if (!this.write) throw new Error('Cannot save a read-only transaction');
  }
  async persist() {
    for (const name of [...COLLECTIONS].reverse()) {
      const key = keyFor(name),
        remaining = new Set(this.data[name].map((row) => row[key]));
      const removed = this.before[name]
        .filter((row) => !remaining.has(row[key]))
        .map((row) => row[key]);
      if (removed.length)
        await this.client.query(
          `DELETE FROM ${quote(name)} WHERE ${quote(key)}=ANY($1::text[])`,
          [removed],
        );
    }
    for (const name of COLLECTIONS) {
      const key = keyFor(name),
        previous = new Map(this.before[name].map((row) => [row[key], row]));
      const changed = this.data[name].filter(
        (row) => JSON.stringify(previous.get(row[key])) !== JSON.stringify(row),
      );
      changed.sort(
        (a, b) =>
          Number(['pending', 'approved'].includes(a.status)) -
          Number(['pending', 'approved'].includes(b.status)),
      );
      for (const row of changed) {
        const fields = FIELDS[name],
          updates = fields
            .filter((f) => f !== key)
            .map((f) => `${quote(f)}=EXCLUDED.${quote(f)}`)
            .join(',');
        await this.client.query(
          `INSERT INTO ${quote(name)} (${fields.map(quote).join(',')}) VALUES (${fields.map((_, i) => '$' + (i + 1)).join(',')}) ON CONFLICT(${quote(key)}) DO UPDATE SET ${updates}`,
          fields.map((field) => (row[field] === undefined ? null : row[field])),
        );
      }
    }
    await this.client.query(
      "INSERT INTO app_meta(key,value) VALUES ('initialized','true'),('demo',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",
      [JSON.stringify(this.data.demo === true)],
    );
  }
}
class Database {
  constructor({ databaseUrl, databaseSchema = 'public' }) {
    if (!databaseUrl) throw new Error('必须设置 DATABASE_URL');
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(databaseSchema))
      throw new Error('QSL_DB_SCHEMA 无效');
    this.schema = databaseSchema;
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      application_name: 'qslink',
    });
    this.pool.on('error', () =>
      console.error('[db] PostgreSQL 空闲连接断开，后续请求将重新连接'),
    );
  }
  async migrate() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        ['qslink:migrate:' + this.schema],
      );
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${quote(this.schema)}`);
      await client.query(`SET LOCAL search_path TO ${quote(this.schema)}`);
      await client.query(
        'CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())',
      );
      const versions = (
        await client.query('SELECT version FROM schema_migrations')
      ).rows.map((row) => row.version);
      if (versions.some((v) => v > SCHEMA_VERSION))
        throw new Error('数据库版本高于程序版本，禁止自动降级');
      for (const [index, filename] of MIGRATIONS.entries()) {
        const version = index + 1;
        if (versions.includes(version)) continue;
        await client.query(
          await fs.readFile(
            path.join(__dirname, '..', 'migrations', filename),
            'utf8',
          ),
        );
        await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [version]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
  async transaction(callback, { write = false } = {}) {
    let client;
    try {
      client = await this.pool.connect();
      await client.query(
        write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
      );
      await client.query(`SET LOCAL search_path TO ${quote(this.schema)}`);
      await client.query("SET LOCAL statement_timeout='15s'");
      await client.query("SET LOCAL lock_timeout='10s'");
      if (write)
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          ['qslink:write:' + this.schema],
        );
      const unit = await new UnitOfWork(client, write).load();
      const result = await callback(unit);
      if (write) await unit.persist();
      await client.query('COMMIT');
      return result;
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      if (err.code === '23505')
        throw new ApiError(409, 'CONFLICT', '数据冲突，请刷新后重试');
      if (['23503', '23514', '23502'].includes(err.code))
        throw new ApiError(
          400,
          'DATA_CONSTRAINT',
          '数据不满足关联或完整性约束',
        );
      if (err instanceof ApiError) throw err;
      if (err.code || !client)
        throw new ApiError(
          503,
          'STORAGE_UNAVAILABLE',
          '数据库暂时不可用，请稍后重试',
        );
      throw err;
    } finally {
      if (client) client.release();
    }
  }
  async ping() {
    await this.pool.query('SELECT 1');
  }
  async close() {
    await this.pool.end();
  }
}
function paginate(items, page, limit) {
  const total = items.length;
  return {
    items: items.slice((page - 1) * limit, page * limit),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 0,
  };
}
function cascadeDeleteCard(db, cardId) {
  for (const name of ['cards', 'likes', 'exchanges'])
    db.data[name] = db.data[name].filter((row) =>
      name === 'cards' ? row.id !== cardId : row.cardId !== cardId,
    );
}
function cascadeDeleteUser(db, userId) {
  for (const card of [...db.data.cards])
    if (card.ownerId === userId) cascadeDeleteCard(db, card.id);
  db.data.likes = db.data.likes.filter((row) => row.userId !== userId);
  db.data.exchanges = db.data.exchanges.filter(
    (row) => row.fromUserId !== userId && row.toUserId !== userId,
  );
  db.data.sessions = db.data.sessions.filter((row) => row.userId !== userId);
  db.data.users = db.data.users.filter((row) => row.id !== userId);
}
module.exports = {
  Database,
  UnitOfWork,
  createId,
  randomString,
  paginate,
  cascadeDeleteCard,
  cascadeDeleteUser,
  SCHEMA_VERSION,
  COLLECTIONS,
};
