import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthLimiter } from '../server/lib/rate-limit.js';

test('vote rate limiter blocks bursts across accounts and rejects spoofed proxy headers', () => {
  const limit = createAuthLimiter();
  const headers = {};
  const res = { setHeader(key, value) { headers[key] = value; } };
  const request = ip => ({ method: 'POST', socket: { remoteAddress: ip }, headers: {} });
  const path = '/api/contests/qsl-design-2026-11/works/one/vote';
  for (let i = 0; i < 30; i++) {
    const req = request('192.0.2.1');
    req.headers['x-real-ip'] = '203.0.113.' + i;
    limit(req, res, path, { fingerprint: String(i) });
  }
  assert.throws(() => limit(request('192.0.2.1'), res, path, {}), err => err.status === 429 && err.code === 'RATE_LIMITED');
  assert.ok(Number(headers['Retry-After']) > 0);
  assert.doesNotThrow(() => limit(request('192.0.2.2'), res, path, {}));
  assert.doesNotThrow(() => limit({ ...request('192.0.2.1'), method: 'GET' }, res, path, {}));
});
