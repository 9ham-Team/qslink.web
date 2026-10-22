'use strict';

/**
 * 认证工具：scrypt 密码哈希、会话（Bearer token）、鉴权辅助函数。
 * 会话有效期 7 天，持久化在 db.sessions。
 */

const crypto = require('crypto');
const { unauthorized, forbidden, banned } = require('./errors');

const SCRYPT_KEYLEN = 64;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;

/** 生成 "scrypt$salt$hash" 格式的密码哈希 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

/** 校验密码（常量时间比较） */
function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !parts[1] || !parts[2]) return false;
  try {
    const actual = crypto.scryptSync(password, parts[1], SCRYPT_KEYLEN);
    const expected = Buffer.from(parts[2], 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (err) {
    return false;
  }
}

/** 生成 32 字节随机 token（hex） */
function createToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

/** 从 Authorization 头解析 Bearer token */
function readBearerToken(req) {
  const header = req.headers && req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+([A-Za-z0-9._-]+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/** 惰性清理过期会话（内存），返回清理数量 */
function pruneSessions(db) {
  const now = Date.now();
  const before = db.data.sessions.length;
  db.data.sessions = db.data.sessions.filter((session) => {
    const expires = Date.parse(session.expiresAt);
    return Number.isFinite(expires) && expires > now;
  });
  return before - db.data.sessions.length;
}

/** 新建会话并返回 token */
function createSession(db, userId) {
  pruneSessions(db);
  const token = createToken();
  const now = Date.now();
  db.data.sessions.push({
    token,
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  });
  return token;
}

/** 删除指定 token 的会话 */
function destroySession(db, token) {
  if (!token) return;
  db.removeWhere('sessions', (session) => session.token === token);
}

/** 删除某个用户的全部会话（禁用/删除用户时调用） */
function destroyUserSessions(db, userId) {
  db.removeWhere('sessions', (session) => session.userId === userId);
}

/**
 * 解析请求身份（不抛错）：返回 { user, token, banned }
 * - 无 token / token 失效 → user=null
 * - token 对应账号被禁用 → banned=true
 */
function resolveAuth(db, req) {
  const token = readBearerToken(req);
  if (!token) return { user: null, token: null, session: null, banned: false };
  const session = db.find('sessions', (item) => item.token === token);
  if (!session) return { user: null, token, session: null, banned: false };
  const expires = Date.parse(session.expiresAt);
  if (!Number.isFinite(expires) || expires <= Date.now()) {
    db.removeWhere('sessions', (item) => item.token === token);
    return { user: null, token, session: null, banned: false };
  }
  const user = db.data.users.find((item) => item.id === session.userId) || null;
  if (!user) {
    db.removeWhere('sessions', (item) => item.token === token);
    return { user: null, token, session: null, banned: false };
  }
  if (user.status === 'banned') {
    return { user: null, token, session, banned: true };
  }
  return { user, token, session, banned: false };
}

/** 要求已登录，返回当前用户记录（数据库原始对象） */
function requireUser(ctx) {
  if (ctx.user) return ctx.user;
  if (ctx.auth && ctx.auth.banned) throw banned();
  throw unauthorized();
}

/** 要求管理员权限 */
function requireAdmin(ctx) {
  const user = requireUser(ctx);
  if (user.role !== 'admin') throw forbidden('需要管理员权限');
  return user;
}

module.exports = {
  hashPassword,
  verifyPassword,
  createToken,
  createSession,
  destroySession,
  destroyUserSessions,
  resolveAuth,
  requireUser,
  requireAdmin,
  pruneSessions,
  SESSION_TTL_MS,
};
