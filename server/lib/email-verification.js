'use strict';

const crypto = require('crypto');
const net = require('net');
const auth = require('./auth');
const { validateEmail } = require('./validate');
const { ApiError, conflict } = require('./errors');
const { unavailable } = require('./mail');

const TTL = 30 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function invalidCode() {
  return { status: 400, body: { error: { code: 'EMAIL_CODE_INVALID',
    message: '邮箱验证码无效、已过期或尝试次数已用尽', fields: { emailCode: '请重新获取或检查验证码' } } } };
}

function consumeCode(unit, email, code) {
  const row = unit.find('emailVerifications', item => item.id === email);
  if (!row || row.status !== 'ready' || row.attempts >= 5 || Date.parse(row.expiresAt) <= Date.now()) return false;
  row.attempts++;
  const valid = typeof code === 'string' && /^\d{6}$/.test(code) && auth.verifyPassword(code, row.codeHash);
  if (valid || row.attempts === 5) {
    row.status = valid ? 'consumed' : 'failed';
    row.codeHash = null;
  }
  return valid;
}

async function sendCode({ db, config, req, res, body }) {
  const email = validateEmail(body && body.email);
  if (!config.sendMail) throw unavailable();
  const peer = req.socket.remoteAddress;
  const forwarded = req.headers['x-real-ip'];
  const ip = config.trustProxy && typeof forwarded === 'string' && net.isIP(forwarded) ? forwarded : peer;
  const now = Date.now();
  const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  const nonce = crypto.randomBytes(16).toString('hex');
  const codeHash = auth.hashPassword(code);
  await db.transaction(unit => {
    unit.removeWhere('mailQuotas', row => Date.parse(row.windowAt) + HOUR <= now);
    unit.removeWhere('emailVerifications', row => Date.parse(row.expiresAt) + HOUR <= now);
    if (unit.data.users.some(user => (user.email || '').toLowerCase() === email))
      throw conflict('EMAIL_TAKEN', '邮箱已被注册', { email: '该邮箱已被注册' });
    const previous = unit.find('emailVerifications', row => row.id === email);
    if (previous && Date.parse(previous.sentAt) + 60000 > now) {
      res.setHeader('Retry-After', String(Math.ceil((Date.parse(previous.sentAt) + 60000 - now) / 1000)));
      throw new ApiError(429, 'MAIL_COOLDOWN', '请在60秒后重新获取验证码');
    }
    const quotas = [['email:' + email, 5], ['ip:' + ip, 20]];
    for (const [id, limit] of quotas) {
      const quota = unit.find('mailQuotas', row => row.id === id);
      if (quota && quota.count >= limit) {
        res.setHeader('Retry-After', String(Math.ceil((Date.parse(quota.windowAt) + HOUR - now) / 1000)));
        throw new ApiError(429, 'MAIL_RATE_LIMITED', '验证码请求过于频繁，请稍后再试');
      }
    }
    for (const [id] of quotas) {
      const quota = unit.find('mailQuotas', row => row.id === id);
      if (quota) quota.count++;
      else unit.insert('mailQuotas', { id, count: 1, windowAt: new Date(now).toISOString() });
    }
    const row = { id: email, nonce, codeHash: null, attempts: 0, status: 'pending',
      sentAt: new Date(now).toISOString(), expiresAt: new Date(now + TTL).toISOString() };
    if (previous) Object.assign(previous, row);
    else unit.insert('emailVerifications', row);
  }, { write: true });

  // Network I/O must not hold the application's write lock. A pending row is never usable.
  let delivered = false;
  try { await config.sendMail(email, code); delivered = true; } catch { /* Never expose SDK errors or credentials. */ }
  const activated = await db.transaction(unit => {
    const row = unit.find('emailVerifications', item => item.id === email && item.nonce === nonce);
    if (!row) return false;
    row.status = delivered ? 'ready' : 'failed';
    row.codeHash = delivered ? codeHash : null;
    return delivered;
  }, { write: true });
  if (!activated) throw unavailable();
  return { body: { ok: true, expiresIn: 1800, retryAfter: 60 } };
}

module.exports = { sendCode, consumeCode, invalidCode };
