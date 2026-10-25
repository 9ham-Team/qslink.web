'use strict';

/** 认证路由：/api/auth/* */

const { conflict, banned, invalidCredentials } = require('../errors');
const { validateRegister, validateLogin, randomAvatarColor } = require('../validate');
const auth = require('../auth');
const { createId } = require('../db');
const serialize = require('../serialize');

/** POST /api/auth/register */
async function register(ctx) {
  const payload = validateRegister(ctx.body || {});
  const legalConsent = require('../legal').requireAcceptance(ctx.body);
  const users = ctx.db.data.users;

  if (users.some((user) => user.username.toLowerCase() === payload.username.toLowerCase())) {
    throw conflict('USERNAME_TAKEN', '用户名已被占用', { username: '该用户名已被占用' });
  }
  if (users.some((user) => (user.email || '').toLowerCase() === payload.email)) {
    throw conflict('EMAIL_TAKEN', '邮箱已被注册', { email: '该邮箱已被注册' });
  }

  if (!require('../email-verification').consumeCode(ctx.db, payload.email, ctx.body.emailCode)) {
    return require('../email-verification').invalidCode();
  }

  const now = new Date().toISOString();
  const user = {
    id: createId('u'),
    username: payload.username,
    email: payload.email,
    displayName: payload.displayName,
    callSign: payload.callSign,
    bio: '',
    avatarColor: randomAvatarColor(),
    role: 'user',
    status: 'active',
    address: null,
    passwordHash: auth.hashPassword(payload.password),
    legalConsent,
    createdAt: now,
    updatedAt: now,
  };
  ctx.db.insert('users', user);
  const token = auth.createSession(ctx.db, user.id);
  await ctx.db.save();
  return { status: 201, body: { token, user: serialize.selfUser(ctx.db, user) } };
}

/** POST /api/auth/login */
async function login(ctx) {
  const { identifier, password } = validateLogin(ctx.body || {});
  const key = identifier.toLowerCase();
  const user = ctx.db.find(
    'users',
    (item) =>
      item.username.toLowerCase() === key || (item.email || '').toLowerCase() === key
  );
  if (!user || !auth.verifyPassword(password, user.passwordHash)) {
    throw invalidCredentials();
  }
  if (user.status === 'banned') throw banned();

  const token = auth.createSession(ctx.db, user.id);
  await ctx.db.save();
  return { body: { token, user: serialize.selfUser(ctx.db, user) } };
}

/** POST /api/auth/logout */
async function logout(ctx) {
  auth.requireUser(ctx);
  auth.destroySession(ctx.db, ctx.token);
  await ctx.db.save();
  return { body: { ok: true } };
}

/** GET /api/auth/me */
async function me(ctx) {
  const user = auth.requireUser(ctx);
  return { body: { user: serialize.selfUser(ctx.db, user) } };
}

module.exports = {
  routes: [
    { method: 'POST', pattern: '/api/auth/email-code', outsideTransaction: true, handler: require('../email-verification').sendCode },
    { method: 'POST', pattern: '/api/auth/register', handler: register },
    { method: 'POST', pattern: '/api/auth/login', handler: login },
    { method: 'POST', pattern: '/api/auth/logout', handler: logout },
    { method: 'GET', pattern: '/api/auth/me', handler: me },
  ],
};
