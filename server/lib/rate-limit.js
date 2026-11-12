'use strict';

const net = require('net');
const { ApiError } = require('./errors');

function createAuthLimiter({ trustProxy = false } = {}) {
  const buckets = new Map();
  const windowMs = 15 * 60 * 1000;
  function consume(key, limit, res) {
    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || entry.until <= now) {
      if (buckets.size >= 10000) {
        for (const [id, item] of buckets) if (item.until <= now) buckets.delete(id);
        if (buckets.size >= 10000) buckets.delete(buckets.keys().next().value);
      }
      entry = { count: 0, until: now + windowMs };
      buckets.set(key, entry);
    }
    if (++entry.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
      throw new ApiError(429, 'RATE_LIMITED', '请求过于频繁，请稍后再试');
    }
  }
  return (req, res, pathname, body) => {
    const vote = /^\/api\/contests\/[^/]+\/works\/[^/]+\/vote$/.test(pathname);
    if (req.method !== 'POST' || (!vote && !['/api/auth/login', '/api/auth/register'].includes(pathname))) return;
    const peer = req.socket.remoteAddress;
    const forwarded = req.headers['x-real-ip'];
    // Only trust the configured local reverse proxy, never arbitrary clients.
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer);
    const ip = (loopback || trustProxy) && typeof forwarded === 'string' && net.isIP(forwarded) ? forwarded : peer;
    if (vote) { consume('vote:' + ip, 30, res); return; }
    consume('ip:' + ip, 100, res);
    const identifier = body && typeof body.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
    if (pathname.endsWith('/login') && identifier) consume('login:' + identifier.slice(0, 120), 15, res);
    if (pathname.endsWith('/register')) consume('register:' + ip, 10, res);
  };
}

module.exports = { createAuthLimiter };
