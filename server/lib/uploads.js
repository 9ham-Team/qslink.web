'use strict';

/**
 * 图片上传：把 JSON body 中的 data URL（png/jpeg/webp/svg+xml）解码落盘到
 * data/uploads/<uuid>.<ext>，返回 /uploads/<uuid>.<ext>。
 * 也支持传入已保存的 /uploads/... URL（编辑卡片时沿用旧图）。
 * 单张图片解码后上限 8MB（整个请求体上限 25MB 由 server.js 控制）。
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { badRequest, payloadTooLarge } = require('./errors');

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const MIME_TO_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

const DATA_URL_RE = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([\s\S]+)$/i;
const UPLOAD_URL_RE = /^\/uploads\/([A-Za-z0-9._-]+)$/;
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

async function fileExists(file) {
  try {
    const stat = await fsp.stat(file);
    return stat.isFile();
  } catch (err) {
    return false;
  }
}

/**
 * 保存单张图片。
 * @param {string} value data URL 或已存在的 /uploads/... URL
 * @param {string} uploadsDir 上传目录
 * @param {string} field 字段名（用于错误 fields）
 * @returns {Promise<string>} 形如 /uploads/xxx.webp 的公开 URL
 */
async function saveImage(value, uploadsDir, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw badRequest({ [field]: '请上传图片' }, '请上传图片');
  }
  const raw = value.trim();

  // 编辑时沿用已保存的图片
  if (raw.startsWith('/uploads/')) {
    const match = UPLOAD_URL_RE.exec(raw);
    if (!match || match[1].includes('..')) {
      throw badRequest({ [field]: '图片地址无效，请重新上传' }, '图片地址无效');
    }
    const exists = await fileExists(path.join(uploadsDir, match[1]));
    if (!exists) throw badRequest({ [field]: '图片已失效，请重新上传' }, '图片已失效');
    return raw;
  }

  // data URL
  const match = DATA_URL_RE.exec(raw);
  if (!match) {
    throw badRequest(
      { [field]: '图片需为 PNG / JPEG / WEBP / SVG 的 data URL' },
      '图片格式不支持'
    );
  }
  const mime = match[1].toLowerCase();
  const ext = MIME_TO_EXT[mime];
  if (!ext) {
    throw badRequest(
      { [field]: '图片格式不支持，仅支持 PNG / JPEG / WEBP / SVG' },
      '图片格式不支持'
    );
  }

  const base64 = match[2].replace(/\s+/g, '');
  if (!base64 || !BASE64_RE.test(base64)) {
    throw badRequest({ [field]: '图片数据无效，请重新上传' }, '图片数据无效');
  }
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) {
    throw badRequest({ [field]: '图片数据为空，请重新上传' }, '图片数据为空');
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw payloadTooLarge('单张图片不能超过 8MB');
  }

  const filename = `${crypto.randomUUID()}.${ext}`;
  await fsp.writeFile(path.join(uploadsDir, filename), buffer);
  return `/uploads/${filename}`;
}

module.exports = { saveImage, MAX_IMAGE_BYTES };
