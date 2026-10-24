'use strict';
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { readConfig, assertProductionData } = require('./lib/config');
const { Database, COLLECTIONS } = require('./lib/db');
const { hashPassword } = require('./lib/auth');

async function main() {
  const args = process.argv.slice(2);
  const fileAt = args.indexOf('--file');
  if (fileAt < 0 || !args[fileAt + 1])
    throw new Error(
      '用法: npm run db:import-json -- --file /path/db.json [--dry-run] [--allow-demo]',
    );
  const config = readConfig();
  const data = JSON.parse(
    await fs.readFile(path.resolve(args[fileAt + 1]), 'utf8'),
  );
  if (
    data.version !== 1 ||
    COLLECTIONS.some((name) => !Array.isArray(data[name]))
  )
    throw new Error('只支持完整的 version=1 JSON 数据库');
  for (const name of COLLECTIONS) {
    const key = name === 'sessions' ? 'token' : 'id';
    const seen = new Set();
    for (const row of data[name]) {
      if (
        !row ||
        typeof row[key] !== 'string' ||
        !row[key] ||
        seen.has(row[key])
      )
        throw new Error(`${name} 包含缺失或重复主键`);
      seen.add(row[key]);
    }
  }
  let demo = data.demo === true;
  try {
    assertProductionData({ data }, { requireAdmin: false });
  } catch {
    demo = true;
  }
  data.demo = demo;
  if (demo && (config.production || !args.includes('--allow-demo')))
    throw new Error('演示 JSON 仅允许在非生产环境显式 --allow-demo 导入');
  // Old demo likes referenced nonexistent synthetic users. Repair only that
  // explicitly allowed demo fixture, never silently discard real records.
  const userIds = new Set(data.users.map((user) => user.id));
  const syntheticHash = hashPassword(crypto.randomBytes(32).toString('hex'));
  for (const like of data.likes) {
    if (userIds.has(like.userId)) continue;
    if (!demo || !/^u_like_\d+$/.test(like.userId))
      throw new Error('点赞引用不存在的用户，请先修复源数据');
    const name = 'demo_like_' + like.userId.slice(7);
    data.users.push({
      id: like.userId,
      username: name,
      email: name + '@example.invalid',
      displayName: '演示点赞用户',
      callSign: '',
      bio: '',
      avatarColor: '#0eaf8f',
      role: 'user',
      status: 'banned',
      address: null,
      passwordHash: syntheticHash,
      createdAt: like.createdAt,
      updatedAt: like.createdAt,
    });
    userIds.add(like.userId);
  }
  for (const card of data.cards) {
    for (const value of [card.frontImage, card.backImage].filter(Boolean)) {
      if (!/^\/uploads\/[a-zA-Z0-9._-]+$/.test(value) || value.includes('..'))
        throw new Error('卡片图片路径无效');
      await fs.access(
        path.join(config.uploadsDir, value.slice('/uploads/'.length)),
      );
    }
  }
  const database = new Database(config);
  const dryRun = new Error('DRY_RUN_ROLLBACK');
  try {
    await database.migrate();
    try {
      await database.transaction(
        async (unit) => {
          if (
            unit.initialized ||
            COLLECTIONS.some((name) => unit.data[name].length)
          )
            throw new Error('目标数据库必须为空；不会覆盖或合并已有数据');
          unit.data = data;
          // Check all SQL constraints in both dry-run and real import.
          if (args.includes('--dry-run')) {
            await unit.persist();
            throw dryRun;
          }
        },
        { write: true },
      );
    } catch (err) {
      if (err !== dryRun) throw err;
    }
    console.log(
      args.includes('--dry-run')
        ? '校验通过，数据已回滚（表结构已建立）；源 JSON 未修改。'
        : '导入完成，源 JSON 和上传文件未修改。',
    );
    console.log(
      COLLECTIONS.map((name) => `${name}: ${data[name].length}`).join(', '),
    );
  } finally {
    await database.close();
  }
}
if (require.main === module)
  main().catch((err) => {
    console.error('[db:import-json]', err.message);
    process.exitCode = 1;
  });
module.exports = { main };
