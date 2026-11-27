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

const codeId = (email, reset) => reset ? 'reset:' + email : email;

function accountBinding(user) {
  return crypto.createHash('sha256').update(JSON.stringify([user.id, user.passwordHash])).digest('hex');
}

function consumeCode(unit, email, code, user) {
  const row = unit.find('emailVerifications', item => item.id === codeId(email, !!user));
  if (user && row?.accountBinding !== accountBinding(user)) return false;
  if (!row || row.status !== 'ready' || row.attempts >= 5 || Date.parse(row.expiresAt) <= Date.now()) return false;
  row.attempts++;
  const valid = typeof code === 'string' && /^\d{6}$/.test(code) && auth.verifyPassword(code, row.codeHash);
  if (valid || row.attempts === 5) {
    row.status = valid ? 'consumed' : 'failed';
    row.codeHash = null;
  }
  return valid;
}

async function sendCode({ db, config, req, res, body }, reset = false) {
  const email = validateEmail(body && body.email);
  if (!config.sendMail) throw unavailable();
  const id = codeId(email, reset);
  const peer = req.socket.remoteAddress;
  const forwarded = req.headers['x-real-ip'];
  const ip = config.trustProxy && typeof forwarded === 'string' && net.isIP(forwarded) ? forwarded : peer;
  const now = Date.now();
  const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  const nonce = crypto.randomBytes(16).toString('hex');
  const eligible = await db.transaction(unit => {
    unit.removeWhere('mailQuotas', row => Date.parse(row.windowAt) + HOUR <= now);
    unit.removeWhere('emailVerifications', row => Date.parse(row.expiresAt) + HOUR <= now);
    const user = unit.find('users', user => (user.email || '').toLowerCase() === email);
    if (!reset && user)
      throw conflict('EMAIL_TAKEN', '邮箱已被注册', { email: '该邮箱已被注册' });
    const previous = unit.find('emailVerifications', row => row.id === id);
    if (previous && Date.parse(previous.sentAt) + 60000 > now) {
      res.setHeader('Retry-After', String(Math.ceil((Date.parse(previous.sentAt) + 60000 - now) / 1000)));
      throw new ApiError(429, 'MAIL_COOLDOWN', '请在60秒后重新获取验证码');
    }
    const quotas = [['email:' + id, 5], ['ip:' + ip, 20]];
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
    const binding = reset && user?.status === 'active' ? accountBinding(user) : null;
    const row = { id, nonce, codeHash: null, attempts: 0, status: reset && !binding ? 'failed' : 'pending', accountBinding: binding,
      sentAt: new Date(now).toISOString(), expiresAt: new Date(now + TTL).toISOString() };
    if (previous) Object.assign(previous, row);
    else unit.insert('emailVerifications', row);
    return !reset || !!binding;
  }, { write: true });

  // Network I/O must not hold the application's write lock. A pending row is never usable.
  async function deliver() {
    let delivered = false;
    try { await config.sendMail(email, code, reset ? 'reset' : 'register'); delivered = true; } catch { /* Never expose SDK errors or credentials. */ }
    const codeHash = delivered ? auth.hashPassword(code) : null;
    return db.transaction(unit => {
      const row = unit.find('emailVerifications', item => item.id === id && item.nonce === nonce);
      if (!row) return false;
      row.status = delivered ? 'ready' : 'failed';
      row.codeHash = codeHash;
      return delivered;
    }, { write: true });
  }
  if (reset) {
    // Reply before contacting the mail provider so delivery timing and errors
    // cannot distinguish a registered address from an unknown one.
    if (eligible) res.once('finish', () => {
      void deliver().catch(() => console.error('[mail] 无法更新密码找回验证码状态'));
    });
  } else if (!await deliver()) throw unavailable();
  return { body: { ok: true, expiresIn: 1800, retryAfter: 60 } };
}

module.exports = { sendCode, consumeCode, invalidCode };
