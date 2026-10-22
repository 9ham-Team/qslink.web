'use strict';

/**
 * QSLink 后端入口。
 * - HTTP 服务：/api/* 走 JSON 路由；其余走 public/ 静态服务与 SPA history 回退；
 * - /uploads/* 提供上传的卡片图片（长缓存）；
 * - 环境变量：QSL_PORT（默认 8787）、QSL_HOST（默认 127.0.0.1）、
 *   QSL_DATA_DIR（默认项目 data/）、NODE_ENV；
 * - 首次启动（data/db.json 不存在）自动建库 + seed，存在则直接加载。
 */

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { ApiError, badRequest, notFound, payloadTooLarge, methodNotAllowed } = require('./lib/errors');
const auth = require('./lib/auth');
const { Database } = require('./lib/db');
const { seed, DEMO_ACCOUNTS } = require('./seed');

const authApi = require('./lib/api/auth');
const meApi = require('./lib/api/me');
const cardsApi = require('./lib/api/cards');
const exchangesApi = require('./lib/api/exchanges');
const adminApi = require('./lib/api/admin');

const MAX_BODY_BYTES = 25 * 1024 * 1024;
const VERSION = '1.0.0';
const startedAt = Date.now();

const ROUTES = [
  { method: 'GET', pattern: '/api/health', handler: health },
  ...authApi.routes,
  ...meApi.routes,
  ...cardsApi.routes,
  ...exchangesApi.routes,
  ...adminApi.routes,
];

/* =========================================================================
 * 路由匹配与请求体
 * ========================================================================= */

function health() {
  return {
    body: {
      ok: true,
      name: 'QSLink',
      version: VERSION,
      uptime: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
      time: new Date().toISOString(),
    },
  };
}

/** 用 :param 模式匹配路径，返回参数对象；不匹配返回 null */
function matchPath(pattern, pathname) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const part = patternParts[i];
    if (part.startsWith(':')) {
      try {
        params[part.slice(1)] = decodeURIComponent(pathParts[i]);
      } catch (err) {
        return null;
      }
    } else if (part !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

/** 读取并解析 JSON 请求体（上限 25MB，超限 413） */
function readJsonBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (Number.isFinite(declared) && declared > limit) {
      req.resume();
      reject(payloadTooLarge('请求体不能超过 25MB'));
      return;
    }
    const chunks = [];
    let size = 0;
    let exceeded = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        exceeded = true;
        chunks.length = 0;
        return;
      }
      if (!exceeded) chunks.push(chunk);
    });
    req.on('aborted', () => reject(badRequest(null, '请求被中断')));
    req.on('error', (err) => reject(err));
    req.on('end', () => {
      if (exceeded) {
        reject(payloadTooLarge('请求体不能超过 25MB'));
        return;
      }
      if (!size) {
        resolve(null);
        return;
      }
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(text));
      } catch (err) {
        reject(badRequest(null, '请求体不是合法的 JSON'));
      }
    });
  });
}

/* =========================================================================
 * 响应输出
 * ========================================================================= */

function sendJson(res, status, data) {
  if (res.writableEnded || res.destroyed) return;
  const payload = Buffer.from(JSON.stringify(data), 'utf8');
  try {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': payload.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(payload);
  } catch (err) {
    res.destroy();
  }
}

function sendText(res, status, text) {
  if (res.writableEnded || res.destroyed) return;
  const payload = Buffer.from(text, 'utf8');
  try {
    res.writeHead(status, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': payload.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(payload);
  } catch (err) {
    res.destroy();
  }
}

function sendError(res, err) {
  if (res.writableEnded || res.destroyed) return;
  if (err instanceof ApiError) {
    const error = { message: err.message, code: err.code };
    if (err.fields) error.fields = err.fields;
    sendJson(res, err.status, { error });
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('[server] 未处理异常：', err && err.message ? err.message : err);
  } else {
    console.error('[server] 未处理异常：', err);
  }
  sendJson(res, 500, { error: { message: '服务器内部错误', code: 'INTERNAL' } });
}

/* =========================================================================
 * API 处理
 * ========================================================================= */

async function handleApi(req, res, { db, config, url, host }) {
  const pathname = url.pathname;
  let matched = null;
  let params = {};
  const allowed = [];

  for (const route of ROUTES) {
    const found = matchPath(route.pattern, pathname);
    if (!found) continue;
    if (route.method === req.method) {
      matched = route;
      params = found;
      break;
    }
    allowed.push(route.method);
  }

  if (!matched) {
    if (allowed.length) {
      res.setHeader('Allow', [...new Set(allowed)].join(', '));
      throw methodNotAllowed();
    }
    throw notFound('接口不存在');
  }

  let body = null;
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    body = await readJsonBody(req, MAX_BODY_BYTES);
  }

  const authState = auth.resolveAuth(db, req);
  const ctx = {
    req,
    res,
    db,
    config,
    dataDir: config.dataDir,
    uploadsDir: config.uploadsDir,
    url,
    query: url.searchParams,
    params,
    path: pathname,
    body,
    host,
    auth: authState,
    user: authState.user,
    token: authState.token,
  };

  const result = (await matched.handler(ctx)) || {};
  const status = result.status || 200;
  sendJson(res, status, result.body === undefined ? {} : result.body);
}

/* =========================================================================
 * 静态资源
 * ========================================================================= */

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.avif': 'image/avif',
};

function contentTypeFor(file) {
  return MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

/** 拼接并校验路径，阻止目录穿越（越界返回 null） */
function safeJoin(root, relative) {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relative);
  if (target === resolvedRoot) return target;
  const prefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  return target.startsWith(prefix) ? target : null;
}

async function isFile(file) {
  try {
    const stat = await fsp.stat(file);
    return stat.isFile();
  } catch (err) {
    return false;
  }
}

async function sendFile(res, file, { method, cache }) {
  let stat;
  try {
    stat = await fsp.stat(file);
  } catch (err) {
    sendText(res, 404, 'Not Found');
    return;
  }
  if (!stat.isFile()) {
    sendText(res, 404, 'Not Found');
    return;
  }
  const headers = {
    'Content-Type': contentTypeFor(file),
    'Content-Length': stat.size,
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff',
  };
  if (method === 'HEAD') {
    res.writeHead(200, headers);
    res.end();
    return;
  }
  res.writeHead(200, headers);
  const stream = fs.createReadStream(file);
  stream.on('error', () => {
    if (!res.writableEnded) res.destroy();
  });
  stream.pipe(res);
}

async function serveStatic(req, res, { config, pathname }) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (err) {
    sendText(res, 400, 'Bad Request');
    return;
  }
  if (decoded.includes('\0')) {
    sendText(res, 400, 'Bad Request');
    return;
  }

  // /uploads/*：上传的卡片图片，长缓存
  if (decoded === '/uploads' || decoded.startsWith('/uploads/')) {
    const relative = decoded.slice('/uploads/'.length);
    const file = relative ? safeJoin(config.uploadsDir, relative) : null;
    if (!file) {
      sendText(res, 404, 'Not Found');
      return;
    }
    await sendFile(res, file, {
      method: req.method,
      cache: 'public, max-age=31536000, immutable',
    });
    return;
  }

  let relative = decoded.replace(/^\/+/, '');
  if (relative === '') relative = 'index.html';
  const file = safeJoin(config.publicDir, relative);
  if (file && (await isFile(file))) {
    const noCache = /\.(?:html|css|js|mjs|json)$/i.test(file);
    await sendFile(res, file, {
      method: req.method,
      cache: noCache ? 'no-cache' : 'public, max-age=3600',
    });
    return;
  }

  // 带扩展名未命中 → 404；无扩展名 → SPA history 回退 index.html
  if (path.extname(decoded)) {
    sendText(res, 404, 'Not Found');
    return;
  }
  await sendFile(res, path.join(config.publicDir, 'index.html'), {
    method: req.method,
    cache: 'no-cache',
  });
}

/* =========================================================================
 * 服务启动
 * ========================================================================= */

function createRequestHandler(db, config) {
  return async function handleRequest(req, res) {
    try {
      const host = req.headers.host || `${config.host}:${config.port}`;
      const url = new URL(req.url, `http://${host}`);
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        await handleApi(req, res, { db, config, url, host });
      } else {
        await serveStatic(req, res, { config, pathname: url.pathname });
      }
    } catch (err) {
      sendError(res, err);
    }
  };
}

function normalizePort(raw, fallback) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1 || value > 65535) return fallback;
  return value;
}

function printBanner({ config, seeded }) {
  const lines = [
    '',
    '  QSLink · QSL 卡片交换站  服务已启动',
    `  环境:      ${config.env}`,
    `  监听地址:  http://${config.host}:${config.port}`,
    `  数据文件:  ${config.dbFile}${seeded ? '（新生成）' : '（已加载）'}`,
    `  上传目录:  ${config.uploadsDir}`,
    '  种子账号（演示密码，若已修改请以实际为准）:',
  ];
  for (const account of DEMO_ACCOUNTS) {
    lines.push(
      `    ${account.username.padEnd(8)}${account.password.padEnd(15)}` +
        `${account.role === 'admin' ? '管理员  ' : '普通用户'}${account.displayName}`
    );
  }
  lines.push('  提示: 删除 data/db.json 后重启即可重新生成演示数据');
  lines.push('');
  console.log(lines.join('\n'));
}

async function start() {
  const port = normalizePort(process.env.QSL_PORT, 8787);
  const host = (process.env.QSL_HOST || '127.0.0.1').trim() || '127.0.0.1';
  const env = process.env.NODE_ENV || 'development';
  const dataDir = path.resolve(process.env.QSL_DATA_DIR || path.join(__dirname, '..', 'data'));
  const uploadsDir = path.join(dataDir, 'uploads');
  const publicDir = path.join(__dirname, '..', 'public');
  const dbFile = path.join(dataDir, 'db.json');

  await fsp.mkdir(uploadsDir, { recursive: true });

  const db = new Database(dbFile);
  const existed = await db.load();
  let seeded = false;
  if (!existed) {
    const summary = await seed(db, { uploadsDir, dataDir });
    await db.save();
    seeded = true;
    console.log(
      `[seed] 首次启动，已生成演示数据：${summary.users} 位用户 / ${summary.cards} 张卡片 / ` +
        `${summary.exchanges} 条换卡申请 / ${summary.likes} 个点赞`
    );
  } else {
    auth.pruneSessions(db);
  }

  const config = { port, host, env, dataDir, uploadsDir, publicDir, dbFile };
  const server = http.createServer(createRequestHandler(db, config));

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`[server] 端口 ${port} 已被占用，请设置 QSL_PORT 换一个端口后重试。`);
    } else {
      console.error('[server] 服务启动失败：', err && err.message ? err.message : err);
    }
    process.exit(1);
  });

  server.listen(port, host, () => printBanner({ config, seeded }));

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[server] 收到 ${signal}，正在关闭…`);
    server.close();
    try {
      await db.flush();
    } catch (err) {
      /* 忽略退出阶段写入错误 */
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    console.error('[server] 未处理的 Promise 拒绝：', reason);
  });

  return server;
}

if (require.main === module) {
  start().catch((err) => {
    console.error('[server] 启动失败：', err && err.stack ? err.stack : err);
    process.exit(1);
  });
}

module.exports = { start };
