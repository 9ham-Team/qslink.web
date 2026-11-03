import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { fixture } from './helpers/database.mjs';
import { migrateImages } from '../server/migrate-images.js';

test('legacy image maintenance dry-run, atomic references, verified pruning and reversible backup', async t => {
  const database = await fixture();
  t.after(() => database.cleanup());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qslink-image-migration-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const uploads = path.join(dir, 'uploads');
  await fs.mkdir(uploads);
  const config = { ...database, dataDir: dir, uploadsDir: uploads, publicDir: path.join(dir, 'public') };
  const png = await sharp({ create: { width: 4800, height: 2400, channels: 4, background: '#18b59b80' } }).png().toBuffer();
  await fs.writeFile(path.join(uploads, 'legacy.png'), png);
  const now = new Date().toISOString();
  await database.db.transaction(unit => {
    unit.insert('users', { id: 'owner', uid: '123456789', username: 'owner', email: 'owner@example.test', displayName: '', callSign: '', bio: '', avatarColor: '#fff', role: 'user', status: 'active', passwordHash: 'unused', createdAt: now, updatedAt: now });
    for (const [id, status] of [['pending', 'pending'], ['approved', 'approved']]) unit.insert('cards', {
      id, ownerId: 'owner', title: id, callSign: '', band: '', mode: '', notes: '', stock: null,
      ratio: { w: 2, h: 1 }, frontImage: '/uploads/legacy.png', backImage: id === 'pending' ? '/uploads/legacy.png' : '',
      shareToken: 'legacy_' + id, status, createdAt: now, updatedAt: now,
    });
  }, { write: true });
  const dry = await migrateImages({ config });
  assert.equal(dry.images, 1);
  assert.equal(dry.references, 3);
  assert.deepEqual(await fs.readdir(uploads), ['legacy.png']);
  const backupDir = path.join(dir, 'backup');
  await assert.rejects(migrateImages({ config, mode: 'apply', backupDir: path.join(uploads, 'public-backup') }), /must not be public/);
  const applied = await migrateImages({ config, mode: 'apply', backupDir });
  assert.equal(applied.state, 'applied');
  const manifest = JSON.parse(await fs.readFile(path.join(backupDir, 'manifest.json')));
  const entry = manifest.entries[0];
  assert.equal(entry.width, 3840);
  assert.equal(entry.height, 1920);
  const cards = await database.db.transaction(unit => unit.data.cards);
  assert.ok(cards.every(card => card.frontImage === entry.newUrl));
  assert.equal(cards.find(card => card.id === 'pending').backImage, entry.newUrl);
  assert.equal(cards.find(card => card.id === 'pending').status, 'pending');
  assert.deepEqual(cards.map(card => card.updatedAt), [now, now]);
  const newFile = path.join(uploads, entry.newName);
  const goodWebp = await fs.readFile(newFile);
  await fs.writeFile(newFile, 'corrupt converted file');
  await assert.rejects(migrateImages({ config, mode: 'prune', backupDir }), /checksum mismatch/);
  assert.deepEqual(await fs.readFile(path.join(uploads, 'legacy.png')), png, 'failed verification never prunes originals');
  await fs.writeFile(newFile, goodWebp);
  await migrateImages({ config, mode: 'verify', backupDir });
  await migrateImages({ config, mode: 'prune', backupDir });
  await assert.rejects(fs.stat(path.join(uploads, 'legacy.png')), { code: 'ENOENT' });
  assert.deepEqual(await fs.readFile(path.join(backupDir, 'originals', 'legacy.png')), png);
  assert.equal((await migrateImages({ config })).images, 0, 'repeat scan skips compliant WebP');
  await database.db.transaction(unit => { unit.find('cards', card => card.id === 'pending').backImage = ''; }, { write: true });
  await migrateImages({ config, mode: 'rollback', backupDir });
  assert.deepEqual(await fs.readFile(path.join(uploads, 'legacy.png')), png);
  const restored = await database.db.transaction(unit => unit.data.cards);
  assert.ok(restored.every(card => card.frontImage === '/uploads/legacy.png'));
  assert.equal(restored.find(card => card.id === 'pending').backImage, '', 'rollback preserves later image edits');
  // A broken source must not switch any references or delete originals.
  await fs.writeFile(path.join(uploads, 'legacy.png'), 'invalid png');
  await assert.rejects(migrateImages({ config, mode: 'apply', backupDir: path.join(dir, 'invalid-backup') }));
  assert.ok((await database.db.transaction(unit => unit.data.cards)).every(card => card.frontImage === '/uploads/legacy.png'));
});
