'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { ApiError } = require('./errors');

// Keep the derivative space finite and never upscale saved images.
const WIDTHS = [160, 320, 480, 640, 960, 1280, 1600, 1920, 2560, 3840];
const pending = new Map();
let active = 0;
const waiting = [];
sharp.cache(false);
sharp.concurrency(1);

function imageWidth(value) {
  if (!/^\d+$/.test(value || '') || Number(value) < 1 || Number(value) > 3840) {
    throw new ApiError(400, 'INVALID_IMAGE_WIDTH', '图片宽度须为 1–3840 的整数');
  }
  return WIDTHS.find(width => width >= Number(value));
}

async function slot(task) {
  if (active >= 2) {
    if (waiting.length >= 64) throw new ApiError(503, 'IMAGE_BUSY', '图片处理中，请稍后重试');
    await new Promise(resolve => waiting.push(resolve));
  } else active++;
  try { return await task(); }
  finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

async function exists(file) {
  try { return (await fs.stat(file)).isFile(); } catch { return false; }
}

async function imageVariant(file, cacheDir, width) {
  if (!/\.(?:png|jpe?g|webp)$/i.test(file)) return file;
  const stat = await fs.stat(file);
  const key = crypto.createHash('sha256')
    .update(`webp-v1:${file}:${stat.size}:${stat.mtimeMs}:${width}`).digest('hex');
  const output = path.join(cacheDir, key + '.webp');
  if (await exists(output)) return output;
  if (pending.has(output)) return pending.get(output);
  const job = slot(async () => {
    if (await exists(output)) return output;
    await fs.mkdir(cacheDir, { recursive: true, mode: 0o700 });
    const temporary = output + '.' + crypto.randomUUID() + '.tmp';
    try {
      await sharp(file, { limitInputPixels: false, sequentialRead: true })
        .rotate().resize({ width, withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 }).toFile(temporary);
      await fs.rename(temporary, output);
      return output;
    } finally {
      await fs.unlink(temporary).catch(() => {});
    }
  });
  pending.set(output, job);
  try { return await job; }
  finally { pending.delete(output); }
}

module.exports = { imageWidth, imageVariant, WIDTHS, withImageSlot: slot };
