'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseArgs } = require('node:util');
const sharp = require('sharp');
const { Pool } = require('pg');
const { readConfig } = require('./lib/config');
const { requireContest } = require('./lib/contests');
const { encodeJudgingImage, MAX_IMAGE_BYTES, MAX_FROZEN_BYTES, MAX_FROZEN_WORKS } = require('./lib/contest-judging');

const DEFAULT_EVENT = 'qsl-design-2026-11';
const MAX_SOURCE = 64 * 1024 * 1024;
const fields = { front: 'frontImage', back: 'backImage' };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceName = url => {
  const match = /^\/uploads\/([A-Za-z0-9_-][A-Za-z0-9._-]*)$/.exec(url || '');
  return match && !match[1].includes('..') ? match[1] : null;
};
const inside = (parent, child) => {
  const rel = path.relative(parent, child);
  return !rel || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep));
};

async function readImage(dir, name, limit) {
  const file = path.join(dir, name);
  const stat = await fs.lstat(file);
  if (!stat.isFile()) throw new Error('不是普通文件（不读取符号链接）');
  if (stat.size > limit) throw new Error(`文件超过 ${limit / 1024 ** 2} MiB`);
  if (await fs.realpath(file) !== file) throw new Error('文件真实路径与预期不符');
  const input = await fs.readFile(file);
  if (input.length > limit) throw new Error(`文件超过 ${limit / 1024 ** 2} MiB`);
  return input;
}

async function probeSource(uploads, url) {
  const name = sourceName(url);
  if (!name) return { error: '缺少图片或不是有效的站内上传路径' };
  let original;
  try { original = await readImage(uploads, name, MAX_SOURCE); }
  catch (err) { return { error: err.code === 'ENOENT' ? '原图不存在' : err.code ? '原图无法读取' : err.message }; }
  let problem = '原图超过评审读取上限 10 MiB';
  if (original.length <= MAX_IMAGE_BYTES) {
    try { return { bytes: (await encodeJudgingImage(original)).length }; }
    catch (err) {
      if (![400, 413].includes(err.status)) throw err;
      problem = err.fields?.images || err.message;
    }
  }
  try {
    // Permit decoder warnings while still rejecting truncated files and decode errors.
    const opts = { limitInputPixels: 128 * 1024 * 1024, failOn: 'error' };
    const meta = await sharp(original, opts).metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format) || (meta.pages ?? 1) !== 1) {
      return { error: `${problem}；格式或页数不支持自动修复` };
    }
    for (const size of [3840, 1920]) {
      const converted = await sharp(original, opts).rotate()
        .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 }).toBuffer();
      if (converted.length <= MAX_IMAGE_BYTES) {
        const frozen = await encodeJudgingImage(converted);
        return { problem, original, converted, bytes: frozen.length };
      }
    }
    return { error: `${problem}；重新编码后仍超限` };
  } catch { return { error: `${problem}；无法安全重新编码，需找回原图` }; }
}

async function checkFrozen(dataDir, row, side) {
  const image = row.images[side];
  if (!image) return side === 'front' ? '冻结材料缺少正面' : null;
  const key = image.storageKey || row.storageKey;
  if (!/^[a-f0-9-]{36}$/.test(key) || image.file !== `${row.number}-${side}.webp`) return '冻结材料路径无效';
  try {
    const dir = path.join(dataDir, 'judging', key);
    const input = await readImage(dir, image.file, MAX_IMAGE_BYTES);
    if (input.length !== image.bytes || hash(input) !== image.sha256) return '冻结图片与原始校验和或大小不符';
  } catch { return '冻结图片缺失、不可读或超限'; }
  return null;
}

async function repairJudgingImages({ config, mode = 'dry-run', eventKey = DEFAULT_EVENT, number, backupDir }) {
  requireContest(eventKey);
  if (!['dry-run', 'apply', 'rollback'].includes(mode) || (number !== undefined && (!Number.isSafeInteger(number) || number < 1 || number > 2147483647))) throw new Error('无效的模式或作品编号');
  if (mode === 'rollback' && number !== undefined) throw new Error('回退按备份清单执行，不能指定作品编号');
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(config.databaseSchema)) throw new Error('无效的数据库 schema');
  const dataDir = await fs.realpath(config.dataDir);
  const uploads = await fs.realpath(config.uploadsDir);
  const dbUrl = new URL(config.databaseUrl);
  const target = hash(JSON.stringify([dbUrl.host, dbUrl.pathname, config.databaseSchema, uploads]));
  if (mode !== 'dry-run') {
    if (!backupDir || !path.isAbsolute(backupDir)) throw new Error('需要绝对路径 --backup-dir');
    backupDir = path.resolve(backupDir);
    backupDir = path.join(await fs.realpath(path.dirname(backupDir)), path.basename(backupDir));
    const publicDir = await fs.realpath(config.publicDir);
    if ([uploads, publicDir, path.join(dataDir, 'judging')].some(dir => inside(dir, backupDir))) throw new Error('备份目录不能位于公开目录、uploads 或 judging 内');
    if (mode === 'rollback' && await fs.realpath(backupDir) !== backupDir) throw new Error('备份目录不能是符号链接');
  }

  const schema = `"${config.databaseSchema}"`;
  const pool = new Pool({ connectionString: config.databaseUrl, max: 1 });
  let client;
  try {
    client = await pool.connect();
    const snapshot = async () => (await client.query(`
      SELECT w.id, w.number, c.id AS "cardId", c."frontImage", c."backImage",
        COALESCE(w.active AND c.status='approved' AND e.status='approved' AND u.status='active' AND c."ownerId"=u.id, false) AS eligible,
        m.images, j."storageKey"
      FROM ${schema}."contestWorks" w
      LEFT JOIN ${schema}.cards c ON c.id=w."cardId"
      LEFT JOIN ${schema}."contestEntries" e ON e.id=w."entryId"
      LEFT JOIN ${schema}.users u ON u.id=e."userId"
      LEFT JOIN ${schema}."contestMaterials" m ON m."eventKey"=w."eventKey" AND m.id=w.id
      LEFT JOIN ${schema}."contestJudging" j ON j.id=w."eventKey"
      WHERE w."eventKey"=$1 AND ($2::integer IS NULL OR w.number=$2)
      ORDER BY w.number`, [eventKey, number ?? null])).rows;
    const begin = async () => {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='10s'");
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['qslink:write:' + config.databaseSchema]);
      await client.query(`LOCK TABLE ${schema}.cards IN SHARE ROW EXCLUSIVE MODE`);
    };
    const setImage = async (entry, from, to) => {
      const field = fields[entry.side];
      const result = await client.query(`UPDATE ${schema}.cards SET "${field}"=$1 WHERE id=$2 AND "${field}"=$3`, [to, entry.cardId, from]);
      return result.rowCount;
    };
    if (mode !== 'dry-run') {
      const lock = await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked', ['qslink:images:' + config.databaseSchema]);
      if (!lock.rows[0].locked) throw new Error('已有图片维护命令在运行');
    }
    if (mode === 'rollback') {
      const saved = JSON.parse(await fs.readFile(path.join(backupDir, 'manifest.json'), 'utf8'));
      if (saved.version !== 1 || saved.target !== target || saved.eventKey !== eventKey || !Array.isArray(saved.entries)) throw new Error('备份不属于当前数据库、赛事或上传目录');
      for (const e of saved.entries) {
        if (!Object.hasOwn(fields, e.side) || !sourceName(e.oldUrl) || !/^\/uploads\/[a-f0-9-]{36}\.webp$/.test(e.newUrl)) throw new Error('备份包含无效的图片引用');
        const original = await readImage(backupDir, `${sourceName(e.newUrl)}.original`, MAX_SOURCE);
        if (hash(original) !== e.originalHash || hash(await readImage(uploads, sourceName(e.oldUrl), MAX_SOURCE)) !== e.originalHash) throw new Error('原图与备份不同或不可读，须先人工恢复原图');
      }
      await begin();
      let reverted = 0;
      for (const e of saved.entries) reverted += await setImage(e, e.newUrl, e.oldUrl);
      await client.query('COMMIT');
      return { mode, reverted, skipped: saved.entries.length - reverted };
    }

    const rows = await snapshot();
    if (number !== undefined && !rows.length) throw new Error(`找不到作品 #${number}`);
    const findings = [], entries = [];
    let checked = 0, skipped = 0, bytes = 0, count = 0;
    for (const row of rows) {
      if (row.images) {
        count++;
        bytes += Number(row.images.front?.bytes ?? 0) + Number(row.images.back?.bytes ?? 0);
      }
      if (!row.eligible) { skipped++; continue; }
      checked++;
      if (!row.images) count++;
      for (const [side, field] of Object.entries(fields)) {
        if (row.images) {
          const error = await checkFrozen(dataDir, row, side);
          if (error) findings.push({ number: row.number, side, status: 'manual', reason: error });
        } else if (side === 'front' || row[field]) {
          const result = await probeSource(uploads, row[field]);
          bytes += result.bytes ?? 0;
          if (result.error) findings.push({ number: row.number, side, status: 'manual', reason: result.error });
          if (!result.converted) continue;
          findings.push({ number: row.number, side, status: 'repairable', reason: result.problem });
          if (mode !== 'apply') continue;
          if (!entries.length) await fs.mkdir(backupDir, { mode: 0o700 });
          const name = crypto.randomUUID() + '.webp';
          await fs.writeFile(path.join(backupDir, `${name}.original`), result.original, { flag: 'wx', mode: 0o600 });
          await fs.writeFile(path.join(backupDir, name), result.converted, { flag: 'wx', mode: 0o600 });
          entries.push({ number: row.number, side, cardId: row.cardId, oldUrl: row[field], newUrl: '/uploads/' + name, originalHash: hash(result.original), newHash: hash(result.converted) });
        }
      }
    }
    if (number === undefined && count > MAX_FROZEN_WORKS) findings.push({ status: 'manual', reason: '冻结作品及待同步作品合计超过 1000 件' });
    if (number === undefined && bytes > MAX_FROZEN_BYTES) findings.push({ status: 'manual', reason: '预计冻结图片总量超过 256 MiB' });
    if (entries.length) {
      await fs.writeFile(path.join(backupDir, 'manifest.json'), JSON.stringify({ version: 1, target, eventKey, entries }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      for (const e of entries) {
        if (hash(await readImage(uploads, sourceName(e.oldUrl), MAX_SOURCE)) !== e.originalHash) throw new Error('原图在扫描期间被修改，请重新扫描');
        const name = sourceName(e.newUrl);
        const output = await readImage(backupDir, name, MAX_IMAGE_BYTES);
        if (hash(output) !== e.newHash) throw new Error('转换文件在发布前校验失败');
        await fs.writeFile(path.join(uploads, name), output, { flag: 'wx', mode: 0o644 });
      }
      await begin();
      // Recheck eligibility, frozen state and references under the app's writer lock.
      const current = new Map((await snapshot()).map(row => [row.number, row]));
      for (const e of entries) {
        const row = current.get(e.number);
        if (!row?.eligible || row.images || row.cardId !== e.cardId || await setImage(e, e.oldUrl, e.newUrl) !== 1) throw new Error('作品已变更或已冻结，未切换任何引用；请重新扫描');
      }
      await client.query('COMMIT');
      for (const item of findings) if (item.status === 'repairable') item.status = 'repaired';
    }
    return { mode, eventKey, scanned: rows.length, checked, skipped, repaired: entries.length, ...(entries.length ? { backupDir } : {}), findings };
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client?.release(true);
    await pool.end();
  }
}

if (require.main === module) {
  const help = 'Usage: node server/repair-judging-images.js [--dry-run|--apply|--rollback] [--event KEY] [--number N] [--backup-dir ABSOLUTE_PATH]';
  (async () => {
    const { values } = parseArgs({ options: { help: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, apply: { type: 'boolean' }, rollback: { type: 'boolean' }, event: { type: 'string' }, number: { type: 'string' }, 'backup-dir': { type: 'string' } } });
    if (values.help) return console.log(help);
    const modes = ['dry-run', 'apply', 'rollback'].filter(mode => values[mode]);
    if (modes.length > 1 || (values.number !== undefined && !/^[1-9]\d*$/.test(values.number))) throw new Error(help);
    const result = await repairJudgingImages({ config: readConfig(), mode: modes[0], eventKey: values.event, number: values.number === undefined ? undefined : Number(values.number), backupDir: values['backup-dir'] });
    console.log(JSON.stringify(result, null, 2));
    if (result.findings?.some(item => item.status === 'manual')) process.exitCode = 2;
  })().catch(err => { console.error('评审图片维护失败：' + err.message); process.exitCode = 1; });
}

module.exports = { repairJudgingImages };
