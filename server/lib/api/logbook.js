'use strict';
const crypto = require('crypto');
const auth = require('../auth');
const { createId, paginate } = require('../db');
const { ApiError, badRequest, payloadTooLarge } = require('../errors');
const { parseAdif, normalizeRecord } = require('../adif');
const { parseTq8 } = require('../tq8');
const { downloadLotw } = require('../lotw');

function requireCallSign(user) {
  const callSign = typeof user.callSign === 'string' ? user.callSign.trim().toUpperCase() : '';
  if (!callSign) throw badRequest({ callSign: '请先在个人资料中设置呼号，再导入通联日志' });
  return callSign;
}

function importRecords(db, user, parsed, source) {
  const callSign = requireCallSign(user);
  // Validate the whole batch before merging any rows, including otherwise invalid QSOs.
  for (const [index, raw] of parsed.records.entries()) {
    const station = typeof raw.STATION_CALLSIGN === 'string' ? raw.STATION_CALLSIGN.trim().toUpperCase() : '';
    if (!station) throw badRequest({ adif: `第 ${index + 1} 条日志缺少 STATION_CALLSIGN（本站呼号），整批未导入` });
    if (station !== callSign) throw badRequest({ adif: `第 ${index + 1} 条日志的本站呼号与个人资料中的呼号不一致，整批未导入` });
  }
  const existing = new Map(db.data.contactLogs.filter(row => row.userId === user.id).map(row => [row.dedupKey, row]));
  const result = { added: 0, updated: 0, duplicates: 0, skipped: 0, total: parsed.records.length, issues: [] };
  const now = new Date().toISOString();
  parsed.records.forEach((raw, index) => {
    let details;
    try { details = normalizeRecord(raw, source); } catch (err) {
      result.skipped++;
      if (result.issues.length < 10) result.issues.push({ record: index + 1, message: err.message });
      return;
    }
    const dedupKey = crypto.createHash('sha256').update(JSON.stringify([
      details.stationCallSign, details.callSign, details.qsoAt, details.band, details.mode, details.submode, details.propagation, details.satellite,
    ])).digest('hex');
    const old = existing.get(dedupKey);
    if (old) {
      // Fill missing metadata and promote confirmations, never erase an existing confirmation.
      const merged = { ...old.details };
      const sourceRank = { adif: 0, tq8: 1, lotw: 2 };
      for (const [key, value] of Object.entries(details)) if (value && (key !== 'source' || sourceRank[source] > (sourceRank[old.details.source] || 0))) merged[key] = value;
      if (JSON.stringify(merged) !== JSON.stringify(old.details)) {
        old.details = merged; old.updatedAt = now; result.updated++;
      } else result.duplicates++;
    } else {
      if (existing.size >= 50000) throw payloadTooLarge('每个账号最多保存 50000 条通联日志');
      const row = { id: createId('qso'), userId: user.id, dedupKey, qsoAt: details.qsoAt, callSign: details.callSign, details, createdAt: now, updatedAt: now };
      db.insert('contactLogs', row); existing.set(dedupKey, row); result.added++;
    }
  });
  if (result.total && result.skipped === result.total) throw badRequest({ adif: '没有有效通联记录：' + result.issues[0].message });
  return result;
}

function list(ctx) {
  const user = auth.requireUser(ctx);
  const q = (ctx.query.get('q') || '').trim().toUpperCase().slice(0, 32);
  const exactCallSign = ctx.query.has('callSign') ? ctx.query.get('callSign').trim().toUpperCase() : null;
  const page = Math.max(1, Math.min(100000, Number.parseInt(ctx.query.get('page'), 10) || 1));
  const all = ctx.db.data.contactLogs.filter(row => row.userId === user.id);
  const rows = all.filter(row => exactCallSign === null || (exactCallSign && row.callSign.trim().toUpperCase() === exactCallSign))
    .filter(row => !q || row.callSign.toUpperCase().includes(q)).sort((a, b) => b.qsoAt.localeCompare(a.qsoAt) || b.id.localeCompare(a.id));
  const data = paginate(rows.map(row => ({ id: row.id, ...row.details })), page, 25);
  return { body: { ...data, stats: { total: all.length, confirmed: all.filter(row => row.details.lotwConfirmed).length } } };
}
function createFileImport(parser = parseTq8) {
  return async function importFile(ctx) {
    const user = auth.requireUser(ctx);
    const callSign = requireCallSign(user);
    const hasAdif = !!ctx.body && Object.hasOwn(ctx.body, 'adif');
    const hasTq8 = !!ctx.body && Object.hasOwn(ctx.body, 'tq8');
    if (hasAdif === hasTq8) throw badRequest({ file: '请提交一种日志文件：ADI / ADIF 或 TQ8' });
    const parsed = hasAdif ? parseAdif(ctx.body.adif) : parser(ctx.body.tq8, callSign);
    // Plain ADIF belongs to the selected account station; signed TQ8 retains
    // its certificate-derived station and must still match the profile.
    if (hasAdif) parsed.records = parsed.records.map(raw => ({ ...raw, STATION_CALLSIGN: callSign }));
    const result = importRecords(ctx.db, user, parsed, hasAdif ? 'adif' : 'tq8');
    await ctx.db.save();
    return { body: result };
  };
}

const attempts = new Map();
async function importLotw(ctx) {
  // Network I/O runs without holding the global database write lock.
  const userId = await ctx.db.transaction(db => {
    const state = auth.resolveAuth(db, ctx.req);
    const user = auth.requireUser({ user: state.user, auth: state });
    requireCallSign(user);
    return user.id;
  }, { write: false });
  const now = Date.now();
  for (const [id, until] of attempts) if (until <= now) attempts.delete(id);
  if (attempts.has(userId)) {
    ctx.res.setHeader('Retry-After', '60');
    throw new ApiError(429, 'RATE_LIMITED', '每分钟只能从 LoTW 导入一次，请稍后重试');
  }
  attempts.set(userId, now + 60000);
  const parsed = await downloadLotw(ctx.body);
  return ctx.db.transaction(async db => {
    const state = auth.resolveAuth(db, ctx.req);
    const user = auth.requireUser({ user: state.user, auth: state });
    if (user.id !== userId) throw new ApiError(401, 'UNAUTHORIZED', '请重新登录');
    const result = importRecords(db, user, parsed, 'lotw');
    await db.save();
    return { body: result };
  }, { write: true });
}

module.exports = { importRecords, createFileImport, routes: [
  { method: 'GET', pattern: '/api/me/logbook', handler: list },
  { method: 'POST', pattern: '/api/me/logbook/import', handler: createFileImport() },
  { method: 'POST', pattern: '/api/me/logbook/lotw', handler: importLotw, outsideTransaction: true },
] };
