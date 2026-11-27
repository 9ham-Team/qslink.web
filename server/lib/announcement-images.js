'use strict';

const { randomUUID } = require('crypto');
const sharp = require('sharp');
const auth = require('./auth');
const { withImageSlot } = require('./image-variants');
const { badRequest, notFound, payloadTooLarge } = require('./errors');

const MAX_IMAGES = 8;
const MAX_BYTES = 3 * 1024 * 1024;
const PREFIX = '/api/announcement-images/';
const ID = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}';
const imageIds = (body) => Array.from(body.matchAll(
  new RegExp('!\\[[^\\[\\]\\r\\n]{0,120}\\]\\(' + PREFIX + '(' + ID + ')\\.webp\\)', 'g'),
), match => match[1]);

async function validateImages(unit, body) {
  const ids = imageIds(body);
  if (ids.length > MAX_IMAGES) throw badRequest({ body: '每条公告最多插入 8 张图片' });
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const { rowCount } = await unit.client.query('SELECT id FROM "announcementImages" WHERE id = ANY($1::uuid[])', [unique]);
  if (rowCount !== unique.length) throw badRequest({ body: '公告图片已失效，请重新上传' });
}

async function upload({ db, req, body }) {
  function requireAdmin(unit) {
    const identity = auth.resolveAuth(unit, req);
    auth.requireAdmin({ user: identity.user, auth: identity });
  }
  await db.transaction(requireAdmin);
  const match = typeof body?.image === 'string' && /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.image);
  if (!match) throw badRequest({ image: '请选择 PNG、JPEG 或 WebP 图片' });
  const input = Buffer.from(match[2], 'base64');
  if (input.length > MAX_BYTES) throw payloadTooLarge('公告图片不能超过 3 MB');
  const content = await withImageSlot(async () => {
    try {
      const image = sharp(input, { limitInputPixels: 24_000_000 });
      const { format, pages } = await image.metadata();
      if (format !== match[1] || (pages || 1) > 1) throw new Error('Unsupported image');
      return await image.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 }).toBuffer();
    } catch {
      throw badRequest({ image: '请选择可解码的静态图片（不超过 2400 万像素）' });
    }
  });
  const id = randomUUID();
  await db.transaction(async unit => {
    requireAdmin(unit);
    await unit.client.query(`DELETE FROM "announcementImages" AS image
      WHERE "createdAt" < now() - interval '7 days'
        AND NOT EXISTS (SELECT 1 FROM announcements WHERE strpos(body, $1 || image.id::text || '.webp') > 0)`, [PREFIX]);
    await unit.client.query('INSERT INTO "announcementImages" (id, content) VALUES ($1, $2)', [id, content]);
  }, { write: true });
  return { status: 201, body: { url: PREFIX + id + '.webp' } };
}

async function get(ctx) {
  const match = new RegExp('^(' + ID + ')\\.webp$').exec(ctx.params.file);
  if (!match) throw notFound('公告图片不存在');
  const [, id] = match;
  const src = PREFIX + match[0];
  if (ctx.user?.role !== 'admin' && !ctx.db.data.announcements.some(
    item => item.status === 'published' && item.body.includes(src) && imageIds(item.body).includes(id),
  )) throw notFound('公告图片不存在');
  const { rows } = await ctx.db.client.query('SELECT content FROM "announcementImages" WHERE id = $1', [id]);
  if (!rows.length) throw notFound('公告图片不存在');
  return { headers: { 'Content-Type': 'image/webp' }, body: rows[0].content };
}

module.exports = { upload, get, validateImages };
