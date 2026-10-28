'use strict';

const path = require('path');

function readConfig(env = process.env) {
  if (!env.DATABASE_URL)
    throw new Error(
      '必须设置 DATABASE_URL，JSON 数据需通过 db:import-json 显式迁移',
    );
  const database = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(database.protocol))
    throw new Error('DATABASE_URL 必须为 PostgreSQL 连接地址');
  const databaseSchema = env.QSL_DB_SCHEMA || 'public';
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(databaseSchema))
    throw new Error('QSL_DB_SCHEMA 无效');
  const mode = env.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(mode))
    throw new Error('NODE_ENV 必须为 development/test/production');
  const production = mode === 'production';
  if (!['true', 'false'].includes(env.QSL_TRUST_PROXY || 'false'))
    throw new Error('QSL_TRUST_PROXY 必须为 true 或 false');
  const demoFlag = env.QSL_SEED_DEMO || 'false';
  if (!['true', 'false'].includes(demoFlag))
    throw new Error('QSL_SEED_DEMO 必须为 true 或 false');
  if (production && demoFlag === 'true')
    throw new Error('生产环境禁止 QSL_SEED_DEMO=true');
  if (production && (!env.QSL_DATA_DIR || !path.isAbsolute(env.QSL_DATA_DIR))) {
    throw new Error('生产环境必须设置绝对路径 QSL_DATA_DIR');
  }
  const port = Number(env.QSL_PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('QSL_PORT 无效');
  let publicOrigin = '';
  if (env.QSL_PUBLIC_ORIGIN) {
    const url = new URL(env.QSL_PUBLIC_ORIGIN);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        'QSL_PUBLIC_ORIGIN 必须是纯站点地址，例如 https://qsl.example.com',
      );
    }
    if (production && url.protocol !== 'https:')
      throw new Error('生产环境 QSL_PUBLIC_ORIGIN 必须使用 HTTPS');
    publicOrigin = url.origin;
  } else if (production) {
    throw new Error('生产环境必须设置 QSL_PUBLIC_ORIGIN');
  }
  const dataDir = path.resolve(
    env.QSL_DATA_DIR || path.join(__dirname, '..', '..', 'data'),
  );
  const publicDir = path.resolve(__dirname, '..', '..', 'public');
  if (dataDir === publicDir || dataDir.startsWith(publicDir + path.sep))
    throw new Error('数据目录不能位于 public 内');
  return {
    env: mode,
    production,
    demo: demoFlag === 'true',
    trustProxy: env.QSL_TRUST_PROXY === 'true',
    port,
    publicOrigin,
    host: (env.QSL_HOST || '127.0.0.1').trim(),
    dataDir,
    publicDir,
    uploadsDir: path.join(dataDir, 'uploads'),
    databaseUrl: env.DATABASE_URL,
    databaseSchema,
    mail: require('./mail').readMailConfig(env),
    reviewWebhookUrl: require('./review-webhook').readReviewWebhookUrl(env),
  };
}

function assertProductionData(db, { requireAdmin = true } = {}) {
  const auth = require('./auth');
  const demoImages = db.data.cards.some((card) =>
    /^\/uploads\/seed-/.test(card.frontImage || ''),
  );
  const defaultPassword = db.data.users.some(
    (user) =>
      user.role === 'admin' &&
      (auth.verifyPassword('Admin@123456', user.passwordHash) ||
        auth.verifyPassword('Demo@123456', user.passwordHash)),
  );
  if (db.data.demo === true || demoImages || defaultPassword) {
    throw new Error(
      '检测到演示数据或默认密码；生产必须使用独立、干净的数据目录，不会自动删除已有数据',
    );
  }
  if (
    requireAdmin &&
    !db.data.users.some(
      (user) => user.role === 'admin' && user.status === 'active',
    )
  ) {
    throw new Error(
      '生产数据库缺少管理员，请先停止服务并运行 npm run admin:init',
    );
  }
}

module.exports = { readConfig, assertProductionData };
