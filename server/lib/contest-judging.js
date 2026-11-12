'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const auth = require('./auth');
const { requireContest } = require('./contests');
const { visibleWork } = require('./contest-voting');
const { withImageSlot } = require('./image-variants');
const { badRequest, conflict, forbidden, notFound, payloadTooLarge } = require('./errors');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_BYTES = 64 * 1024 * 1024;
const MAX_WORKS_PER_ZIP = 20;
const MAX_FROZEN_BYTES = 256 * 1024 * 1024;
const MAX_FROZEN_WORKS = 1000;
function audit(ctx, action) {
  const record = { action, eventKey: scope(ctx), actorId: ctx.user.id, at: new Date().toISOString() };
  return () => console.info('[admin:contest-judging]', JSON.stringify(record));
}
const iso = value => value ? new Date(value).toISOString() : null;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const bodyOf = ctx => ctx.body && typeof ctx.body === 'object' && !Array.isArray(ctx.body) ? ctx.body : {};
function expected(value, revision) {
  if (!Number.isInteger(value) || value < 0) throw badRequest({ expectedRevision: '请提交当前版本' });
  if (value !== revision) throw conflict('REVISION_CONFLICT', '数据已更新，请刷新后重试');
}
function scope(ctx) { requireContest(ctx.params.eventKey); return ctx.params.eventKey; }
async function setting(ctx) {
  return (await ctx.db.client.query('SELECT * FROM "contestJudging" WHERE id=$1', [scope(ctx)])).rows[0] || null;
}
async function judges(ctx) {
  return (await ctx.db.client.query('SELECT * FROM "contestJudges" WHERE "eventKey"=$1 ORDER BY slot', [scope(ctx)])).rows;
}
async function materials(ctx) {
  return (await ctx.db.client.query('SELECT * FROM "contestMaterials" WHERE "eventKey"=$1 ORDER BY number', [scope(ctx)])).rows;
}
async function total(ctx) {
  return (await ctx.db.client.query('SELECT count(*)::integer AS count FROM "contestMaterials" WHERE "eventKey"=$1', [scope(ctx)])).rows[0].count;
}
async function requireJudge(ctx) {
  const user = auth.requireUser(ctx);
  if (user.status !== 'active' || user.role !== 'user') throw forbidden('仅授权的普通用户评委可访问');
  const judge = (await judges(ctx)).find(item => item.userId === user.id);
  if (!judge) throw forbidden('未获本赛事评委授权');
  return judge;
}
function isOpen(config) {
  return !!(config && config.frozenAt && Date.now() < new Date(config.deadline).getTime());
}
function writable(config) {
  if (!config || !config.frozenAt) throw conflict('JUDGING_NOT_STARTED', '评审尚未开始');
  if (Date.now() >= new Date(config.deadline).getTime()) throw conflict('JUDGING_CLOSED', '评审已截止');
}
async function judgeState(ctx, config, judge) {
  return { deadline: iso(config.deadline), frozenAt: iso(config.frozenAt), materialVersion: config.materialVersion,
    totalWorks: await total(ctx), submittedAt: iso(judge.submittedAt), isOpen: isOpen(config), slot: judge.slot, revision: judge.revision };
}
async function adminState(ctx) {
  const config = await setting(ctx);
  const counts = (await ctx.db.client.query('SELECT slot,count(*)::integer AS count FROM "contestScores" WHERE "eventKey"=$1 GROUP BY slot', [scope(ctx)])).rows;
  return { revision: config ? config.revision : 0, deadline: config ? iso(config.deadline) : null,
    frozenAt: config ? iso(config.frozenAt) : null, materialVersion: config ? config.materialVersion : null, totalWorks: await total(ctx),
    judges: (await judges(ctx)).map(j => ({ slot: j.slot, userId: j.userId, username: j.username, uid: j.uid,
      displayName: j.displayName, scoredCount: counts.find(c => c.slot === j.slot)?.count || 0, submittedAt: iso(j.submittedAt) })),
    canViewResults: !!(config && config.frozenAt && Date.now() >= new Date(config.deadline).getTime()) };
}
async function getSettings(ctx) {
  auth.requireAdmin(ctx);
  return { body: { judging: await adminState(ctx) } };
}
function parseDeadline(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value)) || Number(value.slice(11,13)) > 23 || Number(value.slice(14,16)) > 59 || Number(value.slice(17,19)) > 59 ||
    (value.endsWith('Z') === false && (Number(value.slice(-5,-3)) > 23 || Number(value.slice(-2)) > 59)) ||
    new Date(value.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) !== value.slice(0, 10)) {
    throw badRequest({ deadline: '请输入含时区的有效 ISO 截止时间' });
  }
  if (Date.parse(value) <= Date.now()) throw badRequest({ deadline: '截止时间须晚于当前时间' });
  return new Date(value).toISOString();
}
async function putSettings(ctx) {
  auth.requireAdmin(ctx);
  const config = await setting(ctx);
  const body = bodyOf(ctx);
  expected(body.expectedRevision, config ? config.revision : 0);
  const deadline = parseDeadline(body.deadline);
  const ids = body.judgeUserIds;
  if (!Array.isArray(ids) || ids.length !== 5 || ids.some(id => typeof id !== 'string') || new Set(ids).size !== 5) {
    throw badRequest({ judgeUserIds: '必须选择五名不同的可用普通用户' });
  }
  const selected = ids.map(id => ctx.db.find('users', u => u.id === id));
  if (selected.some(u => !u || u.role !== 'user' || u.status !== 'active')) throw badRequest({ judgeUserIds: '评委须为可用普通用户，不能选择管理员' });
  await ctx.db.client.query('INSERT INTO "contestJudging" (id,deadline) VALUES ($1,$2) ON CONFLICT(id) DO UPDATE SET deadline=$2,revision="contestJudging".revision+1', [scope(ctx), deadline]);
  const previous = await judges(ctx);
  if (config && config.frozenAt) {
    await ctx.db.client.query('INSERT INTO "contestJudgingChanges" ("eventKey","actorId","previousConfig","previousJudges","previousScores") VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb)',
      [scope(ctx), ctx.user.id, JSON.stringify(config), JSON.stringify(previous), JSON.stringify((await ctx.db.client.query('SELECT * FROM "contestScores" WHERE "eventKey"=$1', [scope(ctx)])).rows)]);
  }
  const removed = previous.filter(judge => !ids.includes(judge.userId));
  for (const judge of removed) {
    await ctx.db.client.query('DELETE FROM "contestScores" WHERE "eventKey"=$1 AND slot=$2', [scope(ctx), judge.slot]);
    await ctx.db.client.query('DELETE FROM "contestJudges" WHERE "eventKey"=$1 AND slot=$2', [scope(ctx), judge.slot]);
  }
  const retained = previous.filter(judge => ids.includes(judge.userId));
  const free = [1,2,3,4,5].filter(slot => !retained.some(judge => judge.slot === slot));
  for (const user of selected) {
    if (retained.some(judge => judge.userId === user.id)) continue;
    await ctx.db.client.query('INSERT INTO "contestJudges" ("eventKey",slot,"userId",username,uid,"displayName") VALUES ($1,$2,$3,$4,$5,$6)',
      [scope(ctx), free.shift(), user.id, user.username, user.uid, user.displayName || '']);
  }
  return { ...await getSettings(ctx), afterCommit: audit(ctx, 'settings.update') };
}
function publicSnapshot(ctx) {
  return ctx.db.data.contestWorks.filter(w => w.eventKey === scope(ctx) && visibleWork(ctx.db, w)).sort((a,b) => a.number-b.number).map(w => {
    const card = ctx.db.find('cards', c => c.id === w.cardId);
    return { id: w.id, number: w.number, title: card.title, description: w.description, front: card.frontImage, back: card.backImage || null };
  });
}
function checkStart(ctx, config) {
  auth.requireAdmin(ctx);
  expected(bodyOf(ctx).expectedRevision, config ? config.revision : 0);
  if (!config) throw conflict('JUDGING_NOT_CONFIGURED', '请先配置评委和截止时间');
  if (config.frozenAt) throw conflict('JUDGING_STARTED', '评审已经开始');
  if (Date.now() >= new Date(config.deadline).getTime()) throw conflict('JUDGING_CLOSED', '评审截止时间已过');
}
async function sourceBuffer(url, uploadsDir) {
  // No HTTP, arbitrary filesystem path, URL query, encoded separators or symlink escape.
  const match = typeof url === 'string' && /^\/uploads\/([A-Za-z0-9_-][A-Za-z0-9._-]*)$/.exec(url);
  if (!match || match[1].includes('..')) throw badRequest({ images: '冻结图片必须使用有效站内上传路径' });
  try {
    const root = await fs.realpath(uploadsDir);
    const file = await fs.realpath(path.join(root, match[1]));
    if (path.dirname(file) !== root) throw new Error('outside');
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) throw new Error('size');
    const bytes = await fs.readFile(file);
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error('size');
    return bytes;
  } catch { throw badRequest({ images: '冻结图片不可读取或超过 10MiB' }); }
}
async function freezeImage(url, uploadsDir, directory, name) {
  const input = await sourceBuffer(url, uploadsDir);
  let bytes;
  try {
    bytes = await withImageSlot(() => sharp(input, { limitInputPixels: 80 * 1024 * 1024 }).rotate()
      .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer());
  } catch { throw badRequest({ images: '冻结图片解码失败' }); }
  if (bytes.length > MAX_IMAGE_BYTES) throw payloadTooLarge('冻结单图超过 10MiB');
  await fs.writeFile(path.join(directory, name), bytes, { flag: 'wx', mode: 0o600 });
  return { file: name, sha256: hash(bytes), bytes: bytes.length };
}
function independentContext(base, unit) {
  const state = auth.resolveAuth(unit, base.req);
  return { ...base, db: unit, auth: state, user: state.user, dataDir: base.config.dataDir, uploadsDir: base.config.uploadsDir };
}
async function start(base) {
  // Expensive decoding/file IO never holds the global advisory writer lock.
  const prepared = await base.db.transaction(async unit => {
    const ctx = independentContext(base, unit);
    const config = await setting(ctx);
    checkStart(ctx, config);
    const selected = await judges(ctx);
    if (selected.length !== 5 || selected.some(j => !unit.find('users', u => u.id === j.userId && u.role === 'user' && u.status === 'active'))) {
      throw badRequest({ judgeUserIds: '五名评委须仍为可用普通用户' });
    }
    const works = publicSnapshot(ctx);
    if (!works.length) throw conflict('NO_PUBLIC_WORKS', '没有可冻结的公开作品');
    if (works.length > MAX_FROZEN_WORKS) throw payloadTooLarge('冻结作品超过 1000 件');
    return { works, selected, config };
  });
  const storageKey = crypto.randomUUID();
  const directory = path.join(base.config.dataDir, 'judging', storageKey);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  let committed = false;
  try {
    const frozen = [];
    let frozenBytesTotal = 0;
    for (const work of prepared.works) {
      const images = { front: await freezeImage(work.front, base.config.uploadsDir, directory, `${work.number}-front.webp`),
        back: work.back ? await freezeImage(work.back, base.config.uploadsDir, directory, `${work.number}-back.webp`) : null };
      frozenBytesTotal += images.front.bytes + (images.back ? images.back.bytes : 0);
      if (frozenBytesTotal > MAX_FROZEN_BYTES) throw payloadTooLarge('冻结图片总量超过 256MiB');
      frozen.push({ id: work.id, number: work.number, title: work.title, description: work.description, images });
    }
    const materialVersion = hash(JSON.stringify(frozen));
    const result = await base.db.transaction(async unit => {
      const ctx = independentContext(base, unit);
      const config = await setting(ctx);
      checkStart(ctx, config); // actual time AFTER advisory lock acquisition, not transaction now().
      if (JSON.stringify(publicSnapshot(ctx)) !== JSON.stringify(prepared.works) || JSON.stringify(await judges(ctx)) !== JSON.stringify(prepared.selected)) {
        throw conflict('MATERIALS_CHANGED', '公开作品或评委已变更，请重新开始');
      }
      if (prepared.selected.some(j => !unit.find('users', u => u.id === j.userId && u.role === 'user' && u.status === 'active'))) throw conflict('JUDGES_CHANGED', '评委账号状态已变化');
      for (const work of frozen) {
        await unit.client.query('INSERT INTO "contestMaterials" ("eventKey",id,number,title,description,images) VALUES ($1,$2,$3,$4,$5,$6)',
          [scope(ctx), work.id, work.number, work.title, work.description, JSON.stringify(work.images)]);
      }
      // Recheck actual cutoff immediately before publishing the frozen set.
      checkStart(ctx, config);
      const published = await unit.client.query('UPDATE "contestJudging" SET "frozenAt"=clock_timestamp(),"materialVersion"=$2,"storageKey"=$3,revision=revision+1 WHERE id=$1 AND deadline>clock_timestamp() RETURNING id', [scope(ctx), materialVersion, storageKey]);
      if (!published.rows.length) throw conflict('JUDGING_CLOSED', '评审截止时间已过');
      return { ...await getSettings(ctx), afterCommit: audit(ctx, 'judging.start') };
    }, { write: true });
    committed = true;
    if (result.afterCommit) result.afterCommit();
    return { body: result.body };
  } finally {
    if (!committed) await fs.rm(directory, { recursive: true, force: true });
  }
}
async function own(ctx) {
  const judge = await requireJudge(ctx);
  const config = await setting(ctx);
  const scores = (await ctx.db.client.query('SELECT "materialId",value,comment,revision FROM "contestScores" WHERE "eventKey"=$1 AND slot=$2', [scope(ctx), judge.slot])).rows;
  const prefix = `/api/contests/${encodeURIComponent(scope(ctx))}/judging/materials/`;
  return { body: { judging: await judgeState(ctx, config, judge), items: (await materials(ctx)).map(m => {
    const score = scores.find(s => s.materialId === m.id);
    return { id: m.id, number: m.number, title: m.title, description: m.description,
      frontUrl: `${prefix}${encodeURIComponent(m.id)}/front`, backUrl: m.images.back ? `${prefix}${encodeURIComponent(m.id)}/back` : null,
      score: score ? { value: Number(score.value), comment: score.comment, revision: score.revision } : null };
  }) } };
}
// Append new eligible works without replacing any material that already has a
// frozen identity. Image preparation stays outside the shared writer lock.
function withNewMaterials(handler, authorize) {
  return async base => {
    const prepared = await base.db.transaction(async unit => {
      const ctx = independentContext(base, unit);
      await authorize(ctx);
      const config = await setting(ctx);
      if (!isOpen(config)) return null;
      const existing = await materials(ctx);
      const works = publicSnapshot(ctx).filter(w => !existing.some(m => m.id === w.id));
      if (!works.length) return null;
      if (existing.length + works.length > MAX_FROZEN_WORKS) throw payloadTooLarge('冻结作品超过 1000 件');
      return { config, works, actorId: ctx.user.id, bytes: existing.reduce((sum, m) => sum + m.images.front.bytes + (m.images.back?.bytes || 0), 0) };
    });
    if (prepared) {
      const storageKey = crypto.randomUUID();
      const directory = path.join(base.config.dataDir, 'judging', storageKey);
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      let committed = false;
      try {
        const frozen = [];
        let bytes = prepared.bytes;
        for (const work of prepared.works) {
          const images = { front: await freezeImage(work.front, base.config.uploadsDir, directory, `${work.number}-front.webp`),
            back: work.back ? await freezeImage(work.back, base.config.uploadsDir, directory, `${work.number}-back.webp`) : null };
          for (const image of Object.values(images)) if (image) image.storageKey = storageKey;
          bytes += images.front.bytes + (images.back?.bytes || 0);
          if (bytes > MAX_FROZEN_BYTES) throw payloadTooLarge('冻结图片总量超过 256MiB');
          frozen.push({ id: work.id, number: work.number, title: work.title, description: work.description, images });
        }
        committed = await base.db.transaction(async unit => {
          const ctx = independentContext(base, unit);
          await authorize(ctx);
          const config = await setting(ctx);
          // A competing sync/configuration change wins; the next read can retry.
          if (!isOpen(config) || config.revision !== prepared.config.revision) return false;
          const existing = await materials(ctx);
          const works = publicSnapshot(ctx).filter(w => !existing.some(m => m.id === w.id));
          if (JSON.stringify(works) !== JSON.stringify(prepared.works)) return false;
          const combined = [...existing, ...frozen].sort((a, b) => a.number - b.number);
          const bytes = combined.reduce((sum, m) => sum + m.images.front.bytes + (m.images.back?.bytes || 0), 0);
          if (bytes > MAX_FROZEN_BYTES) throw payloadTooLarge('冻结图片总量超过 256MiB');
          for (const work of frozen) {
            await unit.client.query('INSERT INTO "contestMaterials" ("eventKey",id,number,title,description,images) VALUES ($1,$2,$3,$4,$5,$6)',
              [scope(ctx), work.id, work.number, work.title, work.description, JSON.stringify(work.images)]);
          }
          const version = hash(JSON.stringify(combined.map(({ id, number, title, description, images }) => ({ id, number, title, description, images }))));
          const published = await unit.client.query('UPDATE "contestJudging" SET "materialVersion"=$2,revision=revision+1 WHERE id=$1 AND deadline>clock_timestamp() RETURNING id', [scope(ctx), version]);
          if (!published.rows.length) throw conflict('JUDGING_CLOSED', '评审已截止');
          await unit.client.query('UPDATE "contestJudges" SET "submittedAt"=NULL,revision=revision+1 WHERE "eventKey"=$1', [scope(ctx)]);
          return true;
        }, { write: true });
        if (committed) console.info('[admin:contest-judging]', JSON.stringify({ action: 'materials.append', eventKey: base.params.eventKey, actorId: prepared.actorId, at: new Date().toISOString() }));
      } finally {
        if (!committed) await fs.rm(directory, { recursive: true, force: true });
      }
    }
    return base.db.transaction(async unit => handler(independentContext(base, unit)));
  };
}
async function putScore(ctx) {
  const judge = await requireJudge(ctx);
  const config = await setting(ctx);
  writable(config);
  const body = bodyOf(ctx);
  if (typeof body.score !== 'number' || !Number.isFinite(body.score) || body.score < 0 || body.score > 10 || Math.round(body.score * 10) / 10 !== body.score) {
    throw badRequest({ score: '评分须为 0–10，最多一位小数' });
  }
  if (typeof body.comment !== 'string' || Array.from(body.comment).length > 1000 || body.comment.includes('\0')) throw badRequest({ comment: '评语最多 1000 字符' });
  if (!(await materials(ctx)).some(m => m.id === ctx.params.id)) throw notFound('冻结作品不存在');
  const current = (await ctx.db.client.query('SELECT revision FROM "contestScores" WHERE "eventKey"=$1 AND "materialId"=$2 AND slot=$3', [scope(ctx), ctx.params.id, judge.slot])).rows[0];
  expected(body.expectedRevision, current ? current.revision : 0);
  writable(config);
  const revision = current ? current.revision + 1 : 1;
  const saved = await ctx.db.client.query('INSERT INTO "contestScores" ("eventKey","materialId",slot,value,comment,revision,"updatedAt") SELECT $1,$2,$3,$4,$5,$6,clock_timestamp() WHERE EXISTS (SELECT 1 FROM "contestJudging" WHERE id=$1 AND deadline>clock_timestamp()) ON CONFLICT ("eventKey","materialId",slot) DO UPDATE SET value=$4,comment=$5,revision=$6,"updatedAt"=clock_timestamp() RETURNING revision',
    [scope(ctx), ctx.params.id, judge.slot, body.score, body.comment, revision]);
  if (!saved.rows.length) throw conflict('JUDGING_CLOSED', '评审已截止');
  await ctx.db.client.query('UPDATE "contestJudges" SET "submittedAt"=NULL,revision=revision+1 WHERE "eventKey"=$1 AND slot=$2', [scope(ctx), judge.slot]);
  judge.revision++;
  judge.submittedAt = null;
  return { body: { score: { value: body.score, comment: body.comment, revision }, judging: await judgeState(ctx, config, judge) } };
}
async function submit(ctx) {
  const judge = await requireJudge(ctx);
  const config = await setting(ctx);
  writable(config);
  expected(bodyOf(ctx).expectedRevision, judge.revision);
  const count = (await ctx.db.client.query('SELECT count(*)::integer AS count FROM "contestScores" WHERE "eventKey"=$1 AND slot=$2', [scope(ctx), judge.slot])).rows[0].count;
  if (count !== await total(ctx)) throw conflict('JUDGING_INCOMPLETE', '请先完成全部作品评分');
  writable(config);
  const result = await ctx.db.client.query('UPDATE "contestJudges" SET "submittedAt"=clock_timestamp(),revision=revision+1 WHERE "eventKey"=$1 AND slot=$2 AND EXISTS (SELECT 1 FROM "contestJudging" WHERE id=$1 AND deadline>clock_timestamp()) RETURNING *', [scope(ctx), judge.slot]);
  if (!result.rows.length) throw conflict('JUDGING_CLOSED', '评审已截止');
  return { body: { judging: await judgeState(ctx, config, result.rows[0]) }, afterCommit: audit(ctx, 'judging.submit') };
}
async function results(ctx) {
  auth.requireAdmin(ctx);
  const state = await adminState(ctx);
  if (!state.canViewResults) throw forbidden('截止后才可查看结果或导出评分');
  const allJudges = await judges(ctx);
  const scores = (await ctx.db.client.query('SELECT "materialId",slot,value,comment FROM "contestScores" WHERE "eventKey"=$1 ORDER BY slot', [scope(ctx)])).rows;
  const items = (await materials(ctx)).map(m => {
    const rows = scores.filter(s => s.materialId === m.id).map(s => ({ slot: s.slot, score: Number(s.value), comment: s.comment,
      submittedAt: iso(allJudges.find(j => j.slot === s.slot).submittedAt) }));
    const complete = rows.length === 5 && allJudges.length === 5;
    const sorted = rows.map(s => Math.round(s.score * 10)).sort((a,b) => a-b);
    // Integer tenths avoid binary rounding of the trimmed three-score mean * 5.
    const humanScore = complete ? Math.round((sorted[1] + sorted[2] + sorted[3]) * 50 / 3) / 100 : null;
    return { id: m.id, number: m.number, title: m.title, scores: rows, humanScore, complete };
  });
  return { body: { materialVersion: state.materialVersion, deadline: state.deadline, judges: state.judges, items } };
}
async function exportScores(ctx) {
  const data = (await results(ctx)).body;
  const ExcelJS = require('exceljs');
  const book = new ExcelJS.Workbook();
  const metadata = book.addWorksheet('评审说明');
  metadata.addRow(['材料版本', data.materialVersion]);
  metadata.addRow(['截止时间（UTC）', data.deadline]);
  metadata.addRow(['算法', '每件作品五位评委均有已保存评分时，去掉一个最高分和一个最低分，余下三位评委的评分取平均后乘5，四舍五入到两位小数；不生成总排名。']);
  metadata.addRow(['保存与确认', '截止前可提前评分并随时修改；完成确认仅为可选进度标记，修改后清除。截止时按已保存评分计算，不要求完成确认；缺分不补0，不计算该作品人工分。']);
  metadata.addRow(['槽位', '用户ID（审计保留）', '用户名', 'UID', '显示名', '完成确认时间（UTC）']);
  for (const j of data.judges) metadata.addRow([j.slot, j.userId, j.username, j.uid, j.displayName, j.submittedAt]);
  metadata.columns.forEach(c => { c.width = 28; });
  const sheet = book.addWorksheet('人工评审');
  sheet.addRow(['作品编号', '作品ID', '标题', '材料版本', '五人评分齐全', '人工分（50分）', ...data.judges.flatMap(j => [`评委${j.slot}分数`, `评委${j.slot}评语`, `评委${j.slot}完成确认时间`])]);
  for (const item of data.items) sheet.addRow([item.number, item.id, item.title, data.materialVersion, item.complete ? '是' : '否', item.humanScore,
    ...data.judges.flatMap(j => { const s = item.scores.find(s => s.slot === j.slot); return [s ? s.score : null, s ? s.comment : '', s ? s.submittedAt : '']; })]);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach(c => { c.width = 24; });
  return { body: Buffer.from(await book.xlsx.writeBuffer()), headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${scope(ctx)}-scores.xlsx"` }, afterCommit: audit(ctx, 'scores.export') };
}
async function frozenBytes(ctx, config, image) {
  if (!image) throw notFound('该作品没有此面图片');
  const storageKey = image.storageKey || config.storageKey;
  if (!/^[a-f0-9-]{36}$/.test(storageKey) || !/^\d+-(front|back)\.webp$/.test(image.file)) throw notFound('材料不可用');
  let bytes;
  try {
    const root = await fs.realpath(path.join(ctx.dataDir, 'judging', storageKey));
    const file = await fs.realpath(path.join(root, image.file));
    if (path.dirname(file) !== root) throw new Error('outside');
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) throw new Error('size');
    bytes = await fs.readFile(file);
  } catch { throw notFound('冻结图片不可用'); }
  if (bytes.length > MAX_IMAGE_BYTES || hash(bytes) !== image.sha256) throw conflict('MATERIAL_INTEGRITY', '冻结材料校验失败');
  return bytes;
}
async function image(ctx) {
  // Admin may inspect already-public frozen artwork, never the judge's score endpoint.
  if (!ctx.user || ctx.user.role !== 'admin') await requireJudge(ctx);
  else auth.requireAdmin(ctx);
  const config = await setting(ctx);
  const material = (await materials(ctx)).find(m => m.id === ctx.params.id);
  if (!config || !config.frozenAt || !material || !['front', 'back'].includes(ctx.params.side)) throw notFound('冻结作品不存在');
  return { body: await frozenBytes(ctx, config, material.images[ctx.params.side]), headers: { 'Content-Type': 'image/webp' } };
}
async function exportMaterials(ctx) {
  auth.requireAdmin(ctx);
  const config = await setting(ctx);
  if (!config || !config.frozenAt) throw conflict('JUDGING_NOT_STARTED', '评审尚未开始');
  const fromText = ctx.query.get('from'), toText = ctx.query.get('to');
  const from = Number(fromText), to = Number(toText);
  if (!/^[1-9]\d*$/.test(fromText || '') || !/^[1-9]\d*$/.test(toText || '') || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to < from || to-from+1 > MAX_WORKS_PER_ZIP) {
    throw badRequest({ range: '请指定作品编号闭区间 from/to，每包最多 20 件作品' });
  }
  const selected = (await materials(ctx)).filter(m => m.number >= from && m.number <= to);
  if (!selected.length) throw notFound('范围内没有冻结作品');
  const JSZip = require('jszip');
  const zip = new JSZip();
  let size = 0;
  function add(name, value) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += bytes.length;
    if (size > MAX_ZIP_BYTES) throw payloadTooLarge('材料包超过 64MiB，请缩小作品编号范围');
    zip.file(name, bytes, { date: new Date(config.frozenAt) });
  }
  // Explicit allowlist: no user IDs, contacts, judge identities, comments, scores, tokens or storage keys.
  const manifest = { materialVersion: config.materialVersion, frozenAt: iso(config.frozenAt), from, to, items: [] };
  for (const m of selected) {
    const item = { id: m.id, number: m.number, title: m.title, description: m.description, images: {} };
    for (const side of ['front', 'back']) {
      if (!m.images[side]) { item.images[side] = null; continue; }
      const name = `${m.number}/${side}.webp`;
      add(name, await frozenBytes(ctx, config, m.images[side]));
      item.images[side] = { file: name, sha256: m.images[side].sha256, bytes: m.images[side].bytes };
    }
    add(`${m.number}/text.txt`, `${m.title}\n\n${m.description}\n`);
    manifest.items.push(item);
  }
  add('manifest.json', JSON.stringify(manifest, null, 2));
  add('README.txt', 'QSLink 冻结作品材料包\n仅供独立离线 AI 评审；本服务不向任何外部系统发送材料，不执行评分。\n下载不代表第三方上传或再授权许可；卡面可能含呼号、地址等个人信息，外发前须核对作者授权和平台条款。\n三名 AI 各自独立评审每件作品，0–10 分，允许 0.5 分档。模板仅为空白输入，不包含人工分数、评语或身份。\n保留 manifest 的 materialVersion 和图片 SHA-256 以核对材料一致性。本包不生成 AI 分数或总排名。\n');
  add('template.json', JSON.stringify({ materialVersion: config.materialVersion, items: selected.map(m => ({ id: m.id, number: m.number, aiScore: null, comment: '' })) }, null, 2));
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
  if (bytes.length > MAX_ZIP_BYTES) throw payloadTooLarge('材料包超过 64MiB，请缩小范围');
  return { body: bytes, headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${scope(ctx)}-materials-${from}-${to}.zip"` }, afterCommit: audit(ctx, 'materials.export') };
}
const adminPrefix = '/api/admin/contests/:eventKey/judging';
const judgePrefix = '/api/contests/:eventKey/judging';
const routes = [
  { method: 'GET', pattern: adminPrefix, handler: withNewMaterials(getSettings, auth.requireAdmin), outsideTransaction: true },
  { method: 'PUT', pattern: adminPrefix, handler: putSettings },
  { method: 'POST', pattern: adminPrefix + '/start', handler: start, outsideTransaction: true },
  { method: 'GET', pattern: adminPrefix + '/results', handler: results },
  { method: 'GET', pattern: adminPrefix + '/scores.xlsx', handler: exportScores },
  { method: 'GET', pattern: adminPrefix + '/materials.zip', handler: withNewMaterials(exportMaterials, auth.requireAdmin), outsideTransaction: true },
  { method: 'GET', pattern: judgePrefix, handler: withNewMaterials(own, requireJudge), outsideTransaction: true },
  { method: 'PUT', pattern: judgePrefix + '/materials/:id/score', handler: putScore },
  { method: 'POST', pattern: judgePrefix + '/submit', handler: submit },
  { method: 'GET', pattern: judgePrefix + '/materials/:id/:side', handler: image },
];
module.exports = { routes, MAX_IMAGE_BYTES, MAX_ZIP_BYTES, MAX_WORKS_PER_ZIP };
