'use strict';

// Explicit maintenance command; never runs during application startup.
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { Pool } = require('pg');
const { readConfig } = require('./lib/config');

const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const urlPattern = /^\/uploads\/([A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:png|jpe?g|webp))$/i;
const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep);

async function regularFile(dir, name) {
  if (path.basename(name) !== name || name.includes('..')) throw new Error('Unsafe image filename');
  const file = path.join(dir, name);
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Image must be a regular file');
  return file;
}

async function writeManifest(dir, manifest) {
  const temporary = path.join(dir, 'manifest.json.tmp');
  await fs.writeFile(temporary, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(temporary, path.join(dir, 'manifest.json'));
}

async function migrateImages({ config, mode = 'dry-run', backupDir }) {
  if (!['dry-run', 'apply', 'verify', 'prune', 'rollback'].includes(mode)) throw new Error('Unknown migration mode');
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(config.databaseSchema)) throw new Error('Invalid schema');
  const uploads = await fs.realpath(config.uploadsDir);
  const pool = new Pool({ connectionString: config.databaseUrl, max: 1 });
  const client = await pool.connect();
  const schema = config.databaseSchema;
  const table = '"' + schema + '".cards';
  const rows = async () => (await client.query(`SELECT id, "frontImage", "backImage" FROM ${table} ORDER BY id`)).rows;
  const begin = async () => {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['qslink:write:' + schema]);
    await client.query(`LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE`);
  };
  const summary = manifest => ({
    mode, state: manifest.state, images: manifest.entries.length,
    references: manifest.entries.reduce((n, entry) => n + entry.refs.length, 0),
    originalBytes: manifest.entries.reduce((n, entry) => n + entry.originalBytes, 0),
    webpBytes: manifest.entries.reduce((n, entry) => n + entry.webpBytes, 0),
    ...(backupDir ? { backupDir } : {}),
  });
  try {
    // Serialize maintenance commands without holding the application's write lock during encoding.
    const lock = await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked', ['qslink:images:' + schema]);
    if (!lock.rows[0].locked) throw new Error('Another image maintenance command is running');
    if (mode === 'dry-run' || mode === 'apply') {
      const cards = await rows();
      const sources = new Map();
      for (const card of cards) for (const field of ['frontImage', 'backImage']) {
        const url = card[field];
        const match = urlPattern.exec(url);
        if (!match) continue;
        if (!sources.has(url)) sources.set(url, { name: match[1], refs: [] });
        sources.get(url).refs.push({ id: card.id, field });
      }
      if (mode === 'apply') {
        if (!backupDir || !path.isAbsolute(backupDir)) throw new Error('Apply requires an absolute new --backup-dir');
        backupDir = path.resolve(backupDir);
        // Require an existing parent so symlink resolution cannot hide a public backup directory.
        const parent = await fs.realpath(path.dirname(backupDir));
        backupDir = path.join(parent, path.basename(backupDir));
        if (inside(uploads, backupDir) || inside(path.resolve(config.publicDir), backupDir)) throw new Error('Backup directory must not be public');
        await fs.mkdir(backupDir, { mode: 0o700 });
        await fs.mkdir(path.join(backupDir, 'originals'), { mode: 0o700 });
        await fs.mkdir(path.join(backupDir, 'converted'), { mode: 0o700 });
      }
      const manifest = { version: 1, schema, uploads, state: 'prepared', createdAt: new Date().toISOString(), entries: [] };
      for (const [url, source] of sources) {
        const input = await fs.readFile(await regularFile(uploads, source.name));
        const metadata = await sharp(input, { limitInputPixels: false }).metadata();
        if (metadata.format === 'webp' && Math.max(metadata.width, metadata.height) <= 3840) continue;
        const output = await sharp(input, { limitInputPixels: false, sequentialRead: true })
          .rotate().resize({ width: 3840, height: 3840, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82, effort: 4 }).toBuffer();
        const info = await sharp(output).metadata();
        if (info.format !== 'webp' || Math.max(info.width, info.height) > 3840) throw new Error('Invalid converted image');
        const name = crypto.randomUUID() + '.webp';
        manifest.entries.push({ oldUrl: url, newUrl: '/uploads/' + name, oldName: source.name, newName: name,
          originalHash: hash(input), webpHash: hash(output), originalBytes: input.length, webpBytes: output.length,
          width: info.width, height: info.height, refs: source.refs });
        if (mode === 'apply') {
          await fs.writeFile(path.join(backupDir, 'originals', source.name), input, { flag: 'wx', mode: 0o600 });
          await fs.writeFile(path.join(backupDir, 'converted', name), output, { flag: 'wx', mode: 0o600 });
          await writeManifest(backupDir, manifest);
        }
      }
      if (mode === 'dry-run') return summary(manifest);
      await writeManifest(backupDir, manifest);
      // Publish unique immutable files before atomically updating references.
      for (const entry of manifest.entries) {
        await fs.copyFile(path.join(backupDir, 'converted', entry.newName), path.join(uploads, entry.newName), fs.constants.COPYFILE_EXCL);
        await fs.chmod(path.join(uploads, entry.newName), 0o644);
      }
      await begin();
      const current = await rows();
      if (JSON.stringify(current) !== JSON.stringify(cards)) throw new Error('Card image references changed during preparation; retry with a new backup directory');
      for (const entry of manifest.entries) {
        if (hash(await fs.readFile(await regularFile(uploads, entry.oldName))) !== entry.originalHash) throw new Error('Source image changed during preparation');
        for (const ref of entry.refs) {
          await client.query(`UPDATE ${table} SET "${ref.field}"=$1 WHERE id=$2 AND "${ref.field}"=$3`, [entry.newUrl, ref.id, entry.oldUrl]);
        }
      }
      await client.query('COMMIT');
      manifest.state = 'applied';
      await writeManifest(backupDir, manifest);
      return summary(manifest);
    }

    if (!backupDir || !path.isAbsolute(backupDir)) throw new Error('An absolute --backup-dir is required');
    const manifest = JSON.parse(await fs.readFile(path.join(backupDir, 'manifest.json'), 'utf8'));
    if (manifest.version !== 1 || manifest.schema !== schema || manifest.uploads !== uploads) throw new Error('Backup belongs to another database or uploads directory');
    for (const entry of manifest.entries) {
      if (!['/uploads/' + entry.oldName, '/uploads/' + entry.newName].every(url => urlPattern.test(url))) throw new Error('Invalid manifest image path');
      if (entry.oldUrl !== '/uploads/' + entry.oldName || entry.newUrl !== '/uploads/' + entry.newName || !entry.refs.every(ref => ['frontImage', 'backImage'].includes(ref.field))) throw new Error('Invalid manifest references');
      const original = await fs.readFile(await regularFile(path.join(backupDir, 'originals'), entry.oldName));
      const converted = await fs.readFile(await regularFile(uploads, entry.newName));
      if (hash(original) !== entry.originalHash || hash(converted) !== entry.webpHash) throw new Error('Backup or converted image checksum mismatch');
      const info = await sharp(converted).metadata();
      if (info.format !== 'webp' || info.width !== entry.width || info.height !== entry.height || Math.max(info.width, info.height) > 3840) throw new Error('Converted image metadata mismatch');
    }
    await begin();
    const cards = await rows();
    for (const entry of manifest.entries) {
      if (mode !== 'rollback') {
        if (cards.some(card => card.frontImage === entry.oldUrl || card.backImage === entry.oldUrl)) throw new Error('Original image is still referenced; do not prune');
        for (const ref of entry.refs) {
          const card = cards.find(card => card.id === ref.id);
          if (!card || card[ref.field] !== entry.newUrl) throw new Error('References changed since migration; manual review required');
        }
      }
      if (mode === 'prune') {
        try {
          const oldFile = await regularFile(uploads, entry.oldName);
          if (hash(await fs.readFile(oldFile)) !== entry.originalHash) throw new Error('Original image changed; do not prune');
          await fs.unlink(oldFile);
        } catch (err) { if (err.code !== 'ENOENT') throw err; }
      }
      if (mode === 'rollback') {
        const oldFile = path.join(uploads, entry.oldName);
        try {
          if (hash(await fs.readFile(await regularFile(uploads, entry.oldName))) !== entry.originalHash) throw new Error('Existing original differs from backup');
        } catch (err) {
          if (err.code !== 'ENOENT') throw err;
          await fs.copyFile(path.join(backupDir, 'originals', entry.oldName), oldFile, fs.constants.COPYFILE_EXCL);
          await fs.chmod(oldFile, 0o644);
        }
        // Preserve edits/deletions made after migration, reverting only unchanged image fields.
        for (const ref of entry.refs) await client.query(`UPDATE ${table} SET "${ref.field}"=$1 WHERE id=$2 AND "${ref.field}"=$3`, [entry.oldUrl, ref.id, entry.newUrl]);
      }
    }
    await client.query('COMMIT');
    if (mode !== 'verify') {
      manifest.state = mode === 'prune' ? 'pruned' : 'rolled-back';
      await writeManifest(backupDir, manifest);
    }
    return summary(manifest);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.query('SELECT pg_advisory_unlock_all()').catch(() => {});
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const modes = ['dry-run', 'apply', 'verify', 'prune', 'rollback'].filter(mode => args.includes('--' + mode));
  const index = args.indexOf('--backup-dir');
  if (modes.length > 1 || (index >= 0 && !args[index + 1]) || args.some((arg, i) => !['--dry-run', '--apply', '--verify', '--prune', '--rollback', '--backup-dir'].includes(arg) && !(index >= 0 && i === index + 1))) {
    console.error('Usage: node server/migrate-images.js [--dry-run|--apply|--verify|--prune|--rollback] [--backup-dir /absolute/new/directory]');
    process.exitCode = 1;
  } else {
    migrateImages({ config: readConfig(), mode: modes[0] || 'dry-run', backupDir: index < 0 ? undefined : args[index + 1] })
      .then(result => console.log(JSON.stringify(result)))
      .catch(err => { console.error('Image maintenance failed: ' + err.message); process.exitCode = 1; });
  }
}
module.exports = { migrateImages };
