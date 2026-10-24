'use strict';

/**
 * 种子数据：用户 / 卡片（含程序化生成的高质量 SVG QSL 卡片）/ 点赞 / 换卡申请。
 * 仅在显式开启 QSL_SEED_DEMO=true 且数据库不存在时由 server.js 调用；生产禁止。
 *
 * SVG 设计说明：每张卡片一个独立函数，模拟真实 QSL 卡排版——大号衬线呼号、
 * TO RADIO / 确认通联、日期/UTC/频率/模式/RST 信息表、邮戳圆环与注销波纹、
 * 山峦/海浪/星空/城市/电路等装饰；纸张底色 #fdfdf8 + 双层细边框。
 * 正反两面均生成，写入 data/uploads/seed-<n>.svg 与 seed-<n>-back.svg。
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { hashPassword } = require('./lib/auth');
const { createId, randomString } = require('./lib/db');

const DEMO_PASSWORD = 'Demo@123456';
const ADMIN_PASSWORD = 'Admin@123456';

/* =========================================================================
 * 一、SVG 基础工具
 * ========================================================================= */

const PAPER = '#fdfdf8';
const INK = '#1f2a33';
const SERIF = "Georgia, 'DejaVu Serif', 'Times New Roman', serif";
const SANS = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const MONO = "'Courier New', Consolas, monospace";
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/** 确定性伪随机（mulberry32），保证每次 seed 生成的装饰位置一致 */
function seededRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad2(number) {
  return String(number).padStart(2, '0');
}

function daysAgoDate(days, utcHour = 12, utcMinute = 0) {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  date.setUTCHours(utcHour, utcMinute, 0, 0);
  return date;
}

function formatCardDate(date) {
  return `${pad2(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function formatCardUTC(date) {
  return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())} UTC`;
}

function svgDoc(width, height, body) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `width="${width}" height="${height}" role="img">${body}</svg>`
  );
}

/** 纸张渐变 + 点阵纹理 + 品牌渐变 */
function commonDefs({ accent, soft }) {
  return `<defs>
    <radialGradient id="paperGrad" cx="30%" cy="18%" r="92%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".95"/>
      <stop offset="55%" stop-color="${PAPER}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${soft}" stop-opacity=".25"/>
    </radialGradient>
    <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${soft}"/>
    </linearGradient>
    <pattern id="dotGrid" width="17" height="17" patternUnits="userSpaceOnUse">
      <circle cx="1.4" cy="1.4" r="1.05" fill="${INK}" opacity=".09"/>
    </pattern>
  </defs>`;
}

/** 双层细边框 + 四角装饰 */
function frame(width, height, accent, { ink = INK } = {}) {
  const outer = 12;
  const inner = 20;
  const len = 26;
  const corners = [
    `M${outer} ${outer + len} V${outer} H${outer + len}`,
    `M${width - outer - len} ${outer} H${width - outer} V${outer + len}`,
    `M${width - outer} ${height - outer - len} V${height - outer} H${width - outer - len}`,
    `M${outer + len} ${height - outer} H${outer} V${height - outer - len}`,
  ];
  return `
    <rect x="${outer}" y="${outer}" width="${width - 2 * outer}" height="${height - 2 * outer}"
      fill="none" stroke="${ink}" stroke-opacity=".2" stroke-width="1"/>
    <rect x="${inner}" y="${inner}" width="${width - 2 * inner}" height="${height - 2 * inner}"
      fill="none" stroke="${accent}" stroke-opacity=".5" stroke-width="1.6"/>
    <g fill="none" stroke="${ink}" stroke-opacity=".5" stroke-width="1.3">
      ${corners.map((d) => `<path d="${d}"/>`).join('')}
    </g>`;
}

/** 顶部品牌行：QSLink 标识 + ITU 区域信息 */
function headerLine(width, accent, { ink = INK, right = 'ITU ZONE 44 · CQ ZONE 24' } = {}) {
  return `
    <text x="34" y="44" font-family="${SANS}" font-size="10.5" letter-spacing="3.4"
      fill="${ink}" fill-opacity=".55">QSLink · AMATEUR RADIO QSL SERVICE</text>
    <text x="${width - 34}" y="44" text-anchor="end" font-family="${MONO}" font-size="10"
      letter-spacing="1.6" fill="${ink}" fill-opacity=".45">${esc(right)}</text>
    <path d="M34 54 H${width - 34}" stroke="${accent}" stroke-opacity=".35" stroke-width="1"/>`;
}

function callSignText(x, y, callSign, options = {}) {
  const { size = 100, fill = INK, anchor = 'start', tracking = 4 } = options;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${SERIF}"
    font-size="${size}" letter-spacing="${tracking}" fill="${fill}">${esc(callSign)}</text>`;
}

function chineseTitle(x, y, text, options = {}) {
  const {
    size = 19, fill = INK, anchor = 'start', opacity = 0.62, tracking = 7,
  } = options;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${SERIF}"
    font-size="${size}" letter-spacing="${tracking}" fill="${fill}" fill-opacity="${opacity}">${esc(text)}</text>`;
}

/** 信息小格：标签 + 值 + 下划线 */
function infoCell(x, y, label, value, color) {
  return `
    <text x="${x}" y="${y}" font-family="${SANS}" font-size="9" letter-spacing="2.4"
      fill="${INK}" fill-opacity=".48">${esc(label)}</text>
    <text x="${x}" y="${y + 20}" font-family="${SERIF}" font-size="15"
      fill="${INK}">${esc(value)}</text>
    <path d="M${x} ${y + 28} H${x + 152}" stroke="${color}" stroke-opacity=".28" stroke-width=".9"/>`;
}

/** TO RADIO 区块：收件呼号 + 确认通联说明 */
function toRadioBlock(x, y, ctx, color, options = {}) {
  const { partnerSize = 28, ink = INK } = options;
  return `
    <text x="${x}" y="${y}" font-family="${SANS}" font-size="9" letter-spacing="3"
      fill="${color}">TO RADIO</text>
    <text x="${x}" y="${y + partnerSize + 8}" font-family="${SERIF}"
      font-size="${partnerSize}" letter-spacing="2.5" fill="${ink}">${esc(ctx.toRadio)}</text>
    <text x="${x}" y="${y + partnerSize + 30}" font-family="${SANS}" font-size="9"
      letter-spacing="1.6" fill="${ink}" fill-opacity=".5">CONFIRMING 2-WAY QSO · 确认双方通联</text>`;
}

/** 邮戳：双圆环 + 弧形文字 + 日期 */
function postmark(id, cx, cy, radius, color, ctx) {
  const inner = radius - 14;
  return `<g transform="translate(${cx} ${cy})" opacity=".78">
    <circle r="${radius}" fill="none" stroke="${color}" stroke-width="2"/>
    <circle r="${radius - 7}" fill="none" stroke="${color}" stroke-width="1"
      stroke-dasharray="2.6 4.2" opacity=".85"/>
    <defs><path id="pm${id}" d="M${-inner} 0 A${inner} ${inner} 0 0 1 ${inner} 0"/></defs>
    <text font-family="${SANS}" font-size="8.5" letter-spacing="1.8" fill="${color}">
      <textPath href="#pm${id}" startOffset="50%" text-anchor="middle">QSLINK · QSL BUREAU · 73</textPath>
    </text>
    <path d="M${-(radius - 24)} -12 H${radius - 24}" stroke="${color}" stroke-width="1" opacity=".8"/>
    <text y="6" text-anchor="middle" font-family="${MONO}" font-size="11.5"
      fill="${color}">${esc(ctx.date)}</text>
    <text y="21" text-anchor="middle" font-family="${SANS}" font-size="8"
      letter-spacing="1.2" fill="${color}">${esc(formatCardUTC(new Date(ctx.qsoAt)).replace(' UTC', ''))} UTC · ${esc(ctx.callSign)}</text>
  </g>`;
}

/** 邮戳旁的波浪注销线 */
function cancelLines(x, y, width, color) {
  let out = '';
  for (let i = 0; i < 4; i += 1) {
    const offset = y + i * 9;
    const opacity = round(0.5 - i * 0.07);
    out += `<path d="M${x} ${offset} q ${round(width / 8)} -5 ${round(width / 4)} 0
      t ${round(width / 4)} 0 t ${round(width / 4)} 0 t ${round(width / 4)} 0"
      fill="none" stroke="${color}" stroke-width="1.1" opacity="${opacity}"/>`;
  }
  return out;
}

/* ---------------- 装饰图形助手 ---------------- */

/** 山脊路径（贝塞尔峰） */
function ridgeD({ prng, width = 900, baseY, peaks = 5, minH = 60, maxH = 140, bottom = 620 }) {
  const step = width / peaks;
  let d = `M0 ${bottom} L0 ${baseY}`;
  for (let i = 0; i < peaks; i += 1) {
    const x2 = (i + 1) * step;
    const peakX = x2 - step / 2;
    const peakY = baseY - (minH + prng() * (maxH - minH));
    const midY = baseY - minH * 0.25 - prng() * minH * 0.25;
    d += ` Q${round(peakX)} ${round(peakY)} ${round(x2)} ${round(midY)}`;
  }
  d += ` L${width} ${bottom} Z`;
  return d;
}

/** 正弦波带（可填充成海浪） */
function waveBand({ x = 0, y, width, amp = 10, periods = 3, color, opacity = 1, fill = false, bottom = 620 }) {
  const step = Math.max(4, width / (periods * 10));
  const points = [];
  for (let px = x; px <= x + width; px += step) {
    const yy = y + Math.sin(((px - x) / width) * periods * Math.PI * 2) * amp;
    points.push(`${round(px)} ${round(yy)}`);
  }
  let d = `M${points.join(' L')}`;
  if (fill) d += ` L${round(x + width)} ${bottom} L${x} ${bottom} Z`;
  return `<path d="${d}" fill="${fill ? color : 'none'}" stroke="${fill ? 'none' : color}"
    stroke-width="1.2" opacity="${opacity}"/>`;
}

/** 沙丘 / 平滑地块 */
function duneD({ prng, width = 900, baseY, amp = 46, segments = 4, bottom = 620 }) {
  const step = width / segments;
  let d = `M0 ${baseY + amp * 0.4}`;
  for (let i = 0; i < segments; i += 1) {
    const x1 = i * step + step / 2;
    const y1 = baseY - amp * (0.25 + prng());
    d += ` Q${round(x1)} ${round(y1)} ${round((i + 1) * step)} ${round(baseY + (prng() - 0.5) * 12)}`;
  }
  d += ` L${width} ${bottom} L0 ${bottom} Z`;
  return d;
}

/** 山脊松树 */
function pine(x, baseY, height, color, opacity = 1) {
  const half = height * 0.34;
  return `<g fill="${color}" opacity="${opacity}">
    <path d="M${x} ${baseY - height} L${x + half} ${baseY} H${x - half} Z"/>
    <path d="M${x} ${baseY - height * 0.6} L${x + half * 0.72} ${baseY - height * 0.06}
      H${x - half * 0.72} Z"/>
    <rect x="${x - 1.4}" y="${baseY - height * 0.06}" width="2.8" height="${height * 0.1}"/>
  </g>`;
}

/** 云朵（多层椭圆） */
function cloud(x, y, scale, color, opacity) {
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="${color}" opacity="${opacity}">
    <ellipse cx="0" cy="0" rx="46" ry="17"/>
    <ellipse cx="34" cy="6" rx="36" ry="13"/>
    <ellipse cx="-30" cy="7" rx="32" ry="12"/>
    <ellipse cx="6" cy="-10" rx="25" ry="14"/>
  </g>`;
}

/** 飞鸟 */
function birds(x, y, color, count = 3, scale = 1) {
  let out = '';
  for (let i = 0; i < count; i += 1) {
    const bx = x + i * 22 * scale;
    const by = y - (i % 2) * 9 * scale;
    out += `<path d="M${round(bx)} ${round(by)} q ${round(5 * scale)} ${round(-5 * scale)}
      ${round(10 * scale)} 0 q ${round(5 * scale)} ${round(-5 * scale)}
      ${round(10 * scale)} 0" fill="none" stroke="${color}" stroke-width="${round(1.3 * scale)}"
      stroke-linecap="round" opacity=".7"/>`;
  }
  return out;
}

/** 星空 */
function starField(prng, { x, y, width, height, count = 70, color = '#ffffff', maxR = 1.7 }) {
  let out = '';
  for (let i = 0; i < count; i += 1) {
    const cx = round(x + prng() * width);
    const cy = round(y + prng() * height);
    const r = round(0.4 + prng() * maxR);
    out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"
      opacity="${round(0.25 + prng() * 0.7)}"/>`;
  }
  return out;
}

/** 电波弧：以某点为圆心的虚线同心圆 */
function radioArcs(cx, cy, color, count = 3, start = 46) {
  let out = '';
  for (let i = 1; i <= count; i += 1) {
    out += `<circle cx="${cx}" cy="${cy}" r="${start + i * 32}" fill="none" stroke="${color}"
      stroke-width="1" stroke-dasharray="3 8" opacity="${round(0.42 - i * 0.09)}"/>`;
  }
  return out;
}

/** 天线塔（桁架） */
function antennaTower(x, baseY, height, color) {
  const half = height * 0.15;
  const levels = 4;
  let out = `<g stroke="${color}" fill="none" stroke-width="1.3" opacity=".8">
    <path d="M${x - half} ${baseY} L${x} ${baseY - height} L${x + half} ${baseY}"/>`;
  for (let i = 1; i < levels; i += 1) {
    const t = i / levels;
    const yy = baseY - height * t;
    const ww = half * (1 - t);
    out += `<path d="M${round(x - ww)} ${round(yy)} H${round(x + ww)}"/>
      <path d="M${round(x - ww * 1.35)} ${round(yy + height / levels * 0.45)}
        L${round(x + ww * 0.75)} ${round(yy - height / levels * 0.12)}" stroke-width=".8" opacity=".55"/>`;
  }
  out += `<circle cx="${x}" cy="${baseY - height}" r="2.4" fill="${color}" stroke="none"/></g>`;
  return out;
}

/** 城市天际线 */
function cityLine(prng, { baseY, fromX = 20, toX = 880, color, opacity = 0.5, minH = 26, maxH = 120, windows = true }) {
  let out = '';
  let x = fromX;
  while (x < toX) {
    const width = round(16 + prng() * 30);
    const height = round(minH + prng() * (maxH - minH));
    out += `<rect x="${round(x)}" y="${round(baseY - height)}" width="${width}"
      height="${height}" fill="${color}" opacity="${opacity}"/>`;
    if (windows && prng() > 0.35) {
      const rows = Math.floor(height / 16);
      for (let r = 1; r < rows; r += 1) {
        for (let c = 0; c < Math.floor(width / 13); c += 1) {
          if (prng() > 0.58) {
            out += `<rect x="${round(x + 4 + c * 13)}" y="${round(baseY - height + 7 + r * 15)}"
              width="3" height="4" fill="${PAPER}" opacity=".6"/>`;
          }
        }
      }
    }
    x += width + round(2 + prng() * 8);
  }
  return out;
}

/** 罗盘玫瑰 */
function compassRose(cx, cy, radius, color) {
  return `<g stroke="${color}" fill="none" opacity=".6">
    <circle cx="${cx}" cy="${cy}" r="${radius}" stroke-width="1.1"/>
    <circle cx="${cx}" cy="${cy}" r="${radius * 0.72}" stroke-width=".8" stroke-dasharray="2 4"/>
    <path d="M${cx} ${cy - radius * 0.58} L${cx + radius * 0.12} ${cy - radius * 0.12}
      L${cx + radius * 0.58} ${cy} L${cx + radius * 0.12} ${cy + radius * 0.12}
      L${cx} ${cy + radius * 0.58} L${cx - radius * 0.12} ${cy + radius * 0.12}
      L${cx - radius * 0.58} ${cy} L${cx - radius * 0.12} ${cy - radius * 0.12} Z"
      fill="${color}" fill-opacity=".16" stroke-width="1"/>
    <text x="${cx}" y="${cy - radius - 6}" text-anchor="middle" font-family="${SANS}"
      font-size="9" letter-spacing="1.6" fill="${color}" stroke="none">N</text>
  </g>`;
}

/* =========================================================================
 * 二、横向卡片版式（900 × 600，ratio 3:2）
 * ========================================================================= */

/** 横向信息面板（纸张半透明，保证文字可读） */
function landscapePanel(ctx, accent) {
  return `<g>
    <rect x="36" y="404" width="828" height="166" rx="10" fill="${PAPER}" fill-opacity=".9"/>
    <rect x="36" y="404" width="828" height="166" rx="10" fill="none" stroke="${accent}"
      stroke-opacity=".3" stroke-width="1"/>
    <path d="M46 404 H854" stroke="${accent}" stroke-opacity=".5" stroke-width="2"/>
    ${infoCell(60, 434, 'DATE', ctx.date, accent)}
    ${infoCell(330, 434, 'UTC', ctx.utc, accent)}
    ${infoCell(600, 434, 'FREQ', ctx.freq, accent)}
    ${infoCell(60, 480, 'RST', ctx.rst, accent)}
    ${infoCell(330, 480, 'QTH', ctx.qth, accent)}
    ${infoCell(600, 480, 'QSL VIA', 'BUREAU', accent)}
    <text x="60" y="544" font-family="${SERIF}" font-style="italic" font-size="26"
      fill="${INK}">73 de ${esc(ctx.callSign)}</text>
    <path d="M60 554 q 66 7 132 0" fill="none" stroke="${accent}" stroke-width="1.3"
      stroke-linecap="round" opacity=".75"/>
    <text x="300" y="544" font-family="${SANS}" font-size="9" letter-spacing="1.8"
      fill="${INK}" fill-opacity=".5">OP. ${esc(ctx.opName)} · QSL VIA BUREAU</text>
    <text x="300" y="560" font-family="${SANS}" font-size="9" letter-spacing="1.8"
      fill="${INK}" fill-opacity=".4">${esc(ctx.qth)} · GRID ${esc(ctx.grid)}</text>
  </g>`;
}

function landscapeCommon(ctx, accent, options = {}) {
  const ink = options.ink || INK;
  return `
    ${headerLine(900, accent, { ink })}
    <text x="48" y="172" font-family="${MONO}" font-size="9" letter-spacing="2.4"
      fill="${accent}">QSL CARD NO. ${esc(ctx.serial)}</text>
    ${callSignText(46, 262, ctx.callSign, { size: 98, fill: ink, tracking: 4 })}
    ${chineseTitle(50, 296, ctx.title, { fill: ink, opacity: 0.6 })}
    <text x="52" y="320" font-family="${SANS}" font-size="9" letter-spacing="2"
      fill="${ink}" fill-opacity=".5">CONFIRMING 2-WAY QSO · 确认双方通联</text>
    ${toRadioBlock(520, 300, ctx, accent, { ink, partnerSize: 28 })}
    ${cancelLines(596, 104, 148, accent)}
    ${postmark('L', 780, 150, 60, accent, ctx)}
    ${landscapePanel(ctx, accent)}`;
}

/** 统一渲染横向卡片：design = { accent, soft, defs, body, dark? } */
function renderLandscape(ctx, design) {
  const { accent, soft, defs = '', body } = design;
  const ink = design.dark ? '#f8fafc' : INK;
  const allDefs = `${commonDefs({ accent, soft })}${defs}
    <clipPath id="board"><rect x="20" y="20" width="860" height="560" rx="3"/></clipPath>`;
  return svgDoc(900, 600, [
    allDefs,
    `<rect width="900" height="600" fill="${PAPER}"/>`,
    `<g clip-path="url(#board)">${body}</g>`,
    landscapeCommon(ctx, accent, { ink }),
    frame(900, 600, accent, { ink: design.dark ? '#e2e8f0' : INK }),
  ].join(''));
}

/* =========================================================================
 * 三、纵向卡片版式（600 × 900，ratio 2:3）
 * ========================================================================= */

function portraitPanel(ctx, accent) {
  return `<g>
    <rect x="20" y="556" width="560" height="316" fill="${PAPER}" fill-opacity=".94"/>
    <path d="M20 556 H580" stroke="${accent}" stroke-opacity=".55" stroke-width="2"/>
    <text x="52" y="590" font-family="${SANS}" font-size="9" letter-spacing="2.6"
      fill="${INK}" fill-opacity=".45">QSO CONFIRMATION · 通联记录</text>
    ${infoCell(52, 620, 'DATE', ctx.date, accent)}
    ${infoCell(316, 620, 'UTC', ctx.utc, accent)}
    ${infoCell(52, 668, 'FREQ', ctx.freq, accent)}
    ${infoCell(316, 668, 'QTH', ctx.qth, accent)}
    ${infoCell(52, 716, 'RST', ctx.rst, accent)}
    ${infoCell(316, 716, 'QSL VIA', 'BUREAU', accent)}
    <text x="52" y="800" font-family="${SERIF}" font-style="italic" font-size="28"
      fill="${INK}">73 de ${esc(ctx.callSign)}</text>
    <path d="M52 810 q 74 7 148 0" fill="none" stroke="${accent}" stroke-width="1.3"
      stroke-linecap="round" opacity=".75"/>
    <text x="52" y="834" font-family="${SANS}" font-size="9" letter-spacing="1.8"
      fill="${INK}" fill-opacity=".5">OP. ${esc(ctx.opName)} · QSL VIA BUREAU</text>
    <text x="52" y="852" font-family="${SANS}" font-size="9" letter-spacing="1.8"
      fill="${INK}" fill-opacity=".4">${esc(ctx.qth)} · GRID ${esc(ctx.grid)}</text>
    <text x="548" y="852" text-anchor="end" font-family="${MONO}" font-size="8.5"
      fill="${INK}" fill-opacity=".35">${esc(ctx.serial)}</text>
  </g>`;
}

function portraitCommon(ctx, accent, options = {}) {
  const ink = options.ink || INK;
  return `
    ${headerLine(600, accent, { ink, right: 'QSL CARD · 73' })}
    ${callSignText(300, 150, ctx.callSign, { size: 70, anchor: 'middle', fill: ink, tracking: 3 })}
    ${chineseTitle(300, 186, ctx.title, { anchor: 'middle', fill: ink, opacity: 0.62, size: 18, tracking: 6 })}
    <text x="300" y="208" text-anchor="middle" font-family="${SANS}" font-size="9"
      letter-spacing="2.4" fill="${ink}" fill-opacity=".5">CONFIRMING 2-WAY QSO · 确认双方通联</text>
    ${toRadioBlock(48, 344, ctx, accent, { ink, partnerSize: 26 })}
    ${postmark('P', 470, 452, 56, accent, ctx)}
    ${portraitPanel(ctx, accent)}`;
}

function renderPortrait(ctx, design) {
  const { accent, soft, defs = '', body } = design;
  const allDefs = `${commonDefs({ accent, soft })}${defs}
    <clipPath id="board"><rect x="20" y="20" width="560" height="536" rx="3"/></clipPath>`;
  return svgDoc(600, 900, [
    allDefs,
    `<rect width="600" height="900" fill="${PAPER}"/>`,
    `<g clip-path="url(#board)">${body}</g>`,
    portraitCommon(ctx, accent, { ink: design.dark ? '#f8fafc' : INK }),
    frame(600, 900, accent, { ink: design.dark ? '#e2e8f0' : INK }),
  ].join(''));
}

/* =========================================================================
 * 四、九张卡片的具体美术设计（每张风格不同）
 * ========================================================================= */

/** 01 · 森林绿：层叠山峦、日出、松林与电波 */
function designForest(seed) {
  const prng = seededRandom(seed);
  const accent = '#0eaf8f';
  const soft = '#99f6e4';
  const defs = `
    <linearGradient id="fSky" x1="0" y1="0" x2="0.25" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="55%" stop-color="#f0fdfa"/>
      <stop offset="100%" stop-color="#ccfbf1"/>
    </linearGradient>
    <radialGradient id="fSun" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fefce8"/>
      <stop offset="58%" stop-color="#fde68a"/>
      <stop offset="100%" stop-color="#fbbf24" stop-opacity=".2"/>
    </radialGradient>
    <linearGradient id="fRidgeFar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#a7f3d0"/><stop offset="100%" stop-color="#6ee7b7"/>
    </linearGradient>
    <linearGradient id="fRidgeMid" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6ee7b7"/><stop offset="100%" stop-color="#34d399"/>
    </linearGradient>
    <linearGradient id="fRidgeNear" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#34d399"/><stop offset="100%" stop-color="#0f766e"/>
    </linearGradient>`;
  const body = `
    <rect x="20" y="20" width="860" height="560" fill="url(#fSky)"/>
    <circle cx="726" cy="212" r="96" fill="url(#fSun)"/>
    <circle cx="726" cy="212" r="118" fill="none" stroke="#fcd34d" stroke-width="1"
      stroke-dasharray="3 9" opacity=".65"/>
    ${radioArcs(360, 300, '#0eaf8f', 3, 40)}
    <rect x="20" y="20" width="860" height="560" fill="url(#dotGrid)" opacity=".45"/>
    <path d="${ridgeD({ prng, width: 900, baseY: 392, peaks: 5, minH: 80, maxH: 150 })}"
      fill="url(#fRidgeFar)" opacity=".75"/>
    <path d="${ridgeD({ prng, width: 900, baseY: 448, peaks: 6, minH: 100, maxH: 190 })}"
      fill="url(#fRidgeMid)" opacity=".82"/>
    <path d="${ridgeD({ prng, width: 900, baseY: 512, peaks: 4, minH: 130, maxH: 220 })}"
      fill="url(#fRidgeNear)" opacity=".9"/>
    <path d="M60 402 q 120 -26 240 0 t 240 0 t 240 0" fill="none" stroke="#047857"
      stroke-width="1" opacity=".22"/>
    <path d="M120 372 q 130 -22 260 0" fill="none" stroke="#047857" stroke-width=".9" opacity=".18"/>
    ${pine(92, 400, 66, '#0f766e', 0.55)}
    ${pine(126, 402, 84, '#0f766e', 0.5)}
    ${pine(158, 400, 58, '#0f766e', 0.5)}
    ${pine(742, 396, 72, '#0f766e', 0.45)}
    ${birds(240, 152, '#0f766e', 3, 1)}
    ${birds(300, 128, '#0f766e', 2, 0.8)}`;
  return { accent, soft, defs, body };
}

/** 02 · 天空蓝：晨雾、云层与水平电波线（纵向） */
function designMist(seed) {
  const prng = seededRandom(seed);
  const accent = '#38bdf8';
  const soft = '#bae6fd';
  const defs = `
    <linearGradient id="mSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f0f9ff"/>
      <stop offset="45%" stop-color="#e0f2fe"/>
      <stop offset="100%" stop-color="#f8fafc"/>
    </linearGradient>
    <radialGradient id="mSun" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fffbeb"/>
      <stop offset="60%" stop-color="#fef3c7"/>
      <stop offset="100%" stop-color="#fde68a" stop-opacity=".25"/>
    </radialGradient>
    <linearGradient id="mRidge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#bae6fd"/><stop offset="100%" stop-color="#7dd3fc"/>
    </linearGradient>`;
  const body = `
    <rect x="20" y="20" width="560" height="536" fill="url(#mSky)"/>
    <circle cx="436" cy="286" r="62" fill="url(#mSun)"/>
    <circle cx="436" cy="286" r="80" fill="none" stroke="#7dd3fc" stroke-width="1"
      stroke-dasharray="2 8" opacity=".6"/>
    <path d="M20 20 L560 20 L560 250 L20 420 Z" fill="#ffffff" opacity=".18"/>
    ${cloud(140, 306, 1.5, '#ffffff', 0.88)}
    ${cloud(410, 372, 1.85, '#ffffff', 0.82)}
    ${cloud(180, 452, 1.25, '#ffffff', 0.75)}
    ${Array.from({ length: 7 }, (_, i) => `<path d="M40 ${268 + i * 20} H560" stroke="#7dd3fc"
      stroke-opacity=".22" stroke-width=".8"/>`).join('')}
    <path d="${ridgeD({ prng, width: 600, baseY: 476, peaks: 5, minH: 30, maxH: 82, bottom: 580 })}"
      fill="url(#mRidge)" opacity=".45"/>
    <path d="${ridgeD({ prng, width: 600, baseY: 502, peaks: 4, minH: 18, maxH: 52, bottom: 580 })}"
      fill="#7dd3fc" opacity=".35"/>
    ${waveBand({ y: 508, width: 600, amp: 9, periods: 2.6, color: '#38bdf8', opacity: 0.35 })}
    ${waveBand({ y: 526, width: 600, amp: 7, periods: 3.2, color: '#0ea5e9', opacity: 0.25, fill: true, bottom: 560 })}
    ${waveBand({ y: 542, width: 600, amp: 5, periods: 2.2, color: '#0284c7', opacity: 0.18, fill: true, bottom: 560 })}
    ${birds(392, 246, '#0369a1', 2, 0.9)}
    ${birds(96, 320, '#0369a1', 2, 0.7)}
    ${antennaTower(500, 470, 92, '#0369a1')}`;
  return { accent, soft, defs, body };
}

/** 03 · 琥珀金：沙漠落日、沙丘与天线塔 */
function designDunes(seed) {
  const prng = seededRandom(seed);
  const accent = '#f59e0b';
  const soft = '#fde68a';
  const defs = `
    <linearGradient id="dSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fffdf7"/>
      <stop offset="55%" stop-color="#fff7ed"/>
      <stop offset="100%" stop-color="#fef3c7"/>
    </linearGradient>
    <radialGradient id="dSun" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fffbeb"/>
      <stop offset="55%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#f59e0b" stop-opacity=".18"/>
    </radialGradient>
    <linearGradient id="dDuneFar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fde68a"/><stop offset="100%" stop-color="#fcd34d"/>
    </linearGradient>
    <linearGradient id="dDuneMid" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fcd34d"/><stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
    <linearGradient id="dDuneNear" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#b45309"/>
    </linearGradient>`;
  const body = `
    <rect x="20" y="20" width="860" height="560" fill="url(#dSky)"/>
    <circle cx="712" cy="206" r="76" fill="url(#dSun)"/>
    <circle cx="712" cy="206" r="94" fill="none" stroke="#fbbf24" stroke-width="1"
      stroke-dasharray="3 10" opacity=".55"/>
    <rect x="20" y="20" width="860" height="560" fill="url(#dotGrid)" opacity=".35"/>
    <path d="${duneD({ prng, width: 900, baseY: 322, amp: 34, segments: 4 })}"
      fill="url(#dDuneFar)" opacity=".85"/>
    <path d="${duneD({ prng, width: 900, baseY: 358, amp: 40, segments: 5 })}"
      fill="url(#dDuneMid)" opacity=".9"/>
    <path d="${duneD({ prng, width: 900, baseY: 400, amp: 46, segments: 4 })}"
      fill="url(#dDuneNear)" opacity=".95"/>
    <path d="M40 338 q 160 -26 320 0 t 320 0 t 180 0" fill="none" stroke="#92400e"
      stroke-width="1" opacity=".22"/>
    <path d="M120 374 q 150 -20 300 0" fill="none" stroke="#78350f" stroke-width=".9" opacity=".18"/>
    ${antennaTower(700, 404, 96, '#92400e')}
    ${radioArcs(700, 320, '#b45309', 2, 30)}
    ${birds(560, 150, '#b45309', 3, 0.9)}
    ${birds(500, 128, '#b45309', 2, 0.7)}`;
  return { accent, soft, defs, body };
}

/** 04 · 珊瑚粉：城市夜航、落日拱环与天际线（纵向） */
function designCityNights(seed) {
  const prng = seededRandom(seed);
  const accent = '#fb7185';
  const soft = '#fecdd3';
  const defs = `
    <linearGradient id="cSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff7f8"/>
      <stop offset="45%" stop-color="#ffe4e6"/>
      <stop offset="100%" stop-color="#fecdd3"/>
    </linearGradient>
    <linearGradient id="cSun" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fda4af"/><stop offset="100%" stop-color="#fb7185"/>
    </linearGradient>`;
  const arcs = [0, 1, 2, 3, 4].map((i) => {
    const radius = 84 + i * 38;
    return `<circle cx="300" cy="500" r="${radius}" fill="none" stroke="#fb7185"
      stroke-width="${round(2.4 - i * 0.35)}" opacity="${round(0.5 - i * 0.08)}"/>`;
  }).join('');
  const petals = Array.from({ length: 14 }, () => {
    const x = round(40 + prng() * 520);
    const y = round(250 + prng() * 240);
    const r = round(2.5 + prng() * 3);
    return `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${round(r * 0.45)}"
      transform="rotate(${round(prng() * 180)} ${x} ${y})" fill="#fb7185" opacity=".35"/>`;
  }).join('');
  const body = `
    <rect x="20" y="20" width="560" height="536" fill="url(#cSky)"/>
    <circle cx="300" cy="500" r="118" fill="url(#cSun)" opacity=".8"/>
    ${arcs}
    <rect x="20" y="20" width="560" height="536" fill="url(#dotGrid)" opacity=".3"/>
    ${cityLine(prng, { baseY: 512, fromX: 20, toX: 580, color: '#9f1239', opacity: 0.26, minH: 40, maxH: 150 })}
    ${cityLine(prng, { baseY: 528, fromX: 20, toX: 580, color: '#be123c', opacity: 0.24, minH: 26, maxH: 96 })}
    ${petals}
    ${birds(150, 262, '#9f1239', 2, 0.9)}
    ${birds(420, 228, '#9f1239', 2, 0.7)}
    ${Array.from({ length: 5 }, (_, i) => `<path d="M40 ${250 + i * 26} H560" stroke="#fb7185"
      stroke-opacity=".16" stroke-width=".8"/>`).join('')}`;
  return { accent, soft, defs, body };
}

/** 05 · 湖海青：层叠海浪、帆船与罗盘 */
function designOcean(seed) {
  const prng = seededRandom(seed);
  const accent = '#0eaf8f';
  const soft = '#a7f3d0';
  const defs = `
    <linearGradient id="oSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="60%" stop-color="#ecfeff"/>
      <stop offset="100%" stop-color="#cffafe"/>
    </linearGradient>
    <radialGradient id="oSun" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fffbeb"/>
      <stop offset="60%" stop-color="#fef3c7"/>
      <stop offset="100%" stop-color="#fde68a" stop-opacity=".2"/>
    </radialGradient>
    <linearGradient id="oSea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5eead4"/>
      <stop offset="60%" stop-color="#2dd4bf"/>
      <stop offset="100%" stop-color="#0f766e"/>
    </linearGradient>`;
  const body = `
    <rect x="20" y="20" width="860" height="560" fill="url(#oSky)"/>
    <circle cx="206" cy="182" r="58" fill="url(#oSun)"/>
    <circle cx="206" cy="182" r="74" fill="none" stroke="#5eead4" stroke-width="1"
      stroke-dasharray="2 9" opacity=".55"/>
    <rect x="20" y="20" width="860" height="560" fill="url(#dotGrid)" opacity=".35"/>
    <path d="M20 306 H880 V580 H20 Z" fill="url(#oSea)" opacity=".5"/>
    ${waveBand({ y: 314, width: 900, amp: 11, periods: 3, color: '#99f6e4', opacity: 0.55 })}
    ${waveBand({ y: 340, width: 900, amp: 13, periods: 2.6, color: '#5eead4', opacity: 0.5 })}
    ${waveBand({ y: 372, width: 900, amp: 15, periods: 3.4, color: '#2dd4bf', opacity: 0.42 })}
    ${waveBand({ y: 410, width: 900, amp: 17, periods: 2.4, color: '#14b8a6', opacity: 0.4 })}
    ${waveBand({ y: 452, width: 900, amp: 19, periods: 3.2, color: '#0f766e', opacity: 0.35 })}
    <path d="M652 306 L652 206 L602 306 Z" fill="#f0fdfa" stroke="#0f766e"
      stroke-opacity=".55" stroke-width="1.2"/>
    <path d="M660 306 L660 222 L706 306 Z" fill="#ccfbf1" stroke="#0f766e"
      stroke-opacity=".5" stroke-width="1.2"/>
    <path d="M640 306 V196" stroke="#0f766e" stroke-width="2"/>
    <path d="M612 312 H706 L692 332 H626 Z" fill="#134e4a" opacity=".85"/>
    ${compassRose(768, 330, 36, '#0f766e')}
    ${birds(320, 148, '#0f766e', 3, 1)}
    ${birds(268, 128, '#0f766e', 2, 0.75)}`;
  return { accent, soft, defs, body };
}

/** 06 · 紫罗兰：高原星空、银河与雪山剪影（纵向，深色设计区） */
function designStarry(seed) {
  const prng = seededRandom(seed);
  const accent = '#8b5cf6';
  const soft = '#c4b5fd';
  const defs = `
    <linearGradient id="nSky" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="55%" stop-color="#312e81"/>
      <stop offset="100%" stop-color="#4c1d95"/>
    </linearGradient>
    <linearGradient id="nMilky" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#c4b5fd" stop-opacity="0"/>
      <stop offset="45%" stop-color="#e9d5ff" stop-opacity=".22"/>
      <stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="nMoon" cx="45%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#faf5ff"/>
      <stop offset="80%" stop-color="#ddd6fe"/>
      <stop offset="100%" stop-color="#c4b5fd" stop-opacity=".2"/>
    </radialGradient>
    <linearGradient id="nRidge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e1b4b"/><stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>`;
  const body = `
    <rect x="20" y="20" width="560" height="536" fill="url(#nSky)"/>
    <g transform="rotate(-24 300 300)">
      <rect x="-120" y="230" width="840" height="120" fill="url(#nMilky)"/>
      <rect x="-120" y="272" width="840" height="36" fill="#e9d5ff" opacity=".08"/>
    </g>
    ${starField(prng, { x: 20, y: 20, width: 560, height: 500, count: 120, maxR: 1.6 })}
    <g stroke="#f5f3ff" stroke-width="1" opacity=".7">
      <path d="M96 118 h12 M102 112 v12"/>
      <path d="M448 300 h10 M453 295 v10"/>
      <path d="M220 84 h9 M224.5 79 v9"/>
    </g>
    <circle cx="492" cy="104" r="30" fill="url(#nMoon)"/>
    <circle cx="480" cy="96" r="28" fill="#1e1b4b" opacity=".55"/>
    <path d="${ridgeD({ prng, width: 600, baseY: 462, peaks: 5, minH: 60, maxH: 140, bottom: 580 })}"
      fill="#0f172a" opacity=".8"/>
    <path d="${ridgeD({ prng, width: 600, baseY: 512, peaks: 4, minH: 50, maxH: 110, bottom: 580 })}"
      fill="url(#nRidge)"/>
    <g>
      <path d="M150 500 L170 468 L190 500 Z" fill="#1e293b"/>
      <path d="M168 486 L172 460 L178 486 Z" fill="#0f172a"/>
      <circle cx="172" cy="492" r="2.2" fill="#fbbf24"/>
    </g>
    ${radioArcs(300, 404, '#a78bfa', 2, 24)}
    <path d="M300 404 V380" stroke="#c4b5fd" stroke-width="1.2" opacity=".8"/>
    <circle cx="300" cy="378" r="2.4" fill="#fb7185"/>`;
  return { accent, soft, defs, body, dark: true };
}

/** 07 · 雪山：雪峰、冷杉与晨光（横向） */
function designSnow(seed) {
  const prng = seededRandom(seed);
  const accent = '#38bdf8';
  const soft = '#e0f2fe';
  const defs = `
    <linearGradient id="sSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="55%" stop-color="#f0f9ff"/>
      <stop offset="100%" stop-color="#e0f2fe"/>
    </linearGradient>
    <radialGradient id="sSun" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fffbeb"/>
      <stop offset="60%" stop-color="#fef3c7"/>
      <stop offset="100%" stop-color="#fde68a" stop-opacity=".18"/>
    </radialGradient>
    <linearGradient id="sPeakFar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#bae6fd"/>
    </linearGradient>
    <linearGradient id="sPeakMid" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e0f2fe"/><stop offset="100%" stop-color="#7dd3fc"/>
    </linearGradient>
    <linearGradient id="sPeakNear" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7dd3fc"/><stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>`;
  const body = `
    <rect x="20" y="20" width="860" height="560" fill="url(#sSky)"/>
    <circle cx="730" cy="164" r="56" fill="url(#sSun)"/>
    <circle cx="730" cy="164" r="72" fill="none" stroke="#7dd3fc" stroke-width="1"
      stroke-dasharray="2 9" opacity=".5"/>
    <rect x="20" y="20" width="860" height="560" fill="url(#dotGrid)" opacity=".35"/>
    <path d="M20 380 L170 214 L320 380 Z" fill="url(#sPeakFar)"/>
    <path d="M170 214 L226 292 L204 300 L178 264 L152 300 L130 292 Z" fill="#ffffff" opacity=".95"/>
    <path d="M250 396 L430 178 L610 396 Z" fill="url(#sPeakMid)" opacity=".85"/>
    <path d="M430 178 L500 274 L472 284 L440 240 L404 284 L374 274 Z" fill="#ffffff" opacity=".9"/>
    <path d="M560 404 L720 246 L880 404 Z" fill="url(#sPeakFar)" opacity=".9"/>
    <path d="M720 246 L772 318 L748 324 L722 290 L694 324 L672 318 Z" fill="#ffffff" opacity=".95"/>
    <path d="${ridgeD({ prng, width: 900, baseY: 470, peaks: 3, minH: 70, maxH: 130 })}"
      fill="url(#sPeakNear)" opacity=".55"/>
    ${waveBand({ y: 402, width: 900, amp: 9, periods: 2.2, color: '#ffffff', opacity: 0.55 })}
    ${pine(70, 404, 62, '#0f766e', 0.55)}
    ${pine(108, 408, 84, '#0f766e', 0.5)}
    ${pine(148, 404, 54, '#0f766e', 0.5)}
    ${birds(280, 130, '#0369a1', 3, 0.9)}
    ${birds(348, 110, '#0369a1', 2, 0.7)}`;
  return { accent, soft, defs, body };
}

/** 08 · 落日海：暖色黄昏、落日与倒影（纵向，待审核卡片） */
function designSunset(seed) {
  const prng = seededRandom(seed);
  const accent = '#fb7185';
  const soft = '#fed7aa';
  const defs = `
    <linearGradient id="uSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fffdf8"/>
      <stop offset="45%" stop-color="#fff7ed"/>
      <stop offset="100%" stop-color="#ffe4e6"/>
    </linearGradient>
    <linearGradient id="uSun" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fde68a"/>
      <stop offset="55%" stop-color="#fdba74"/>
      <stop offset="100%" stop-color="#fb7185"/>
    </linearGradient>
    <linearGradient id="uSea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fb7185"/><stop offset="100%" stop-color="#fdba74"/>
    </linearGradient>`;
  const reflection = Array.from({ length: 9 }, (_, i) => {
    const width = 26 + i * 8;
    return `<path d="M${round(300 - width / 2)} ${434 + i * 13} H${round(300 + width / 2)}"
      stroke="#ffffff" stroke-width="${round(2.2 - i * 0.15)}" stroke-linecap="round"
      opacity="${round(0.5 - i * 0.04)}"/>`;
  }).join('');
  const body = `
    <rect x="20" y="20" width="560" height="536" fill="url(#uSky)"/>
    <circle cx="300" cy="414" r="94" fill="url(#uSun)" opacity=".92"/>
    <circle cx="300" cy="414" r="114" fill="none" stroke="#fb7185" stroke-width="1"
      stroke-dasharray="3 10" opacity=".4"/>
    <path d="M20 430 H580 V560 H20 Z" fill="url(#uSea)" opacity=".72"/>
    ${reflection}
    ${waveBand({ y: 452, width: 600, amp: 7, periods: 2.4, color: '#ffffff', opacity: 0.4 })}
    ${waveBand({ y: 486, width: 600, amp: 9, periods: 3, color: '#ffffff', opacity: 0.3 })}
    ${waveBand({ y: 520, width: 600, amp: 8, periods: 2.2, color: '#ffffff', opacity: 0.22 })}
    ${cloud(140, 250, 1.4, '#ffffff', 0.72)}
    ${cloud(430, 220, 1.1, '#ffffff', 0.6)}
    ${birds(180, 300, '#9f1239', 2, 0.9)}
    ${birds(400, 322, '#9f1239', 2, 0.7)}
    <g fill="#9f1239" opacity=".55">
      <path d="M420 420 L448 420 L444 428 L422 428 Z"/>
      <path d="M436 420 L436 384 L452 420 Z"/>
    </g>`;
  return { accent, soft, defs, body };
}

/** 09 · 石墨电路：线路板、载波与手键（横向，已拒绝卡片） */
function designCircuit(seed) {
  const prng = seededRandom(seed);
  const accent = '#38bdf8';
  const soft = '#cbd5e1';
  const defs = `
    <pattern id="boardGrid" width="42" height="42" patternUnits="userSpaceOnUse">
      <path d="M0 21 H42 M21 0 V42" stroke="#94a3b8" stroke-opacity=".18" stroke-width=".8"/>
    </pattern>
    <linearGradient id="qFade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8fafc" stop-opacity=".9"/>
      <stop offset="100%" stop-color="#e2e8f0" stop-opacity=".35"/>
    </linearGradient>`;
  const nodes = [
    [200, 344], [330, 320], [330, 352], [540, 352], [540, 376], [700, 376], [200, 376],
  ]
    .map(
      ([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="${PAPER}" stroke="#38bdf8"
        stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="1.4" fill="#38bdf8"/>`
    )
    .join('');
  const waveform = (() => {
    let d = 'M100 356';
    for (let x = 100; x <= 540; x += 6) {
      const y = 356 + Math.sin((x - 100) / 22) * 18 * Math.exp(-(x - 100) / 900);
      d += ` L${x} ${round(y)}`;
    }
    return `<path d="${d}" fill="none" stroke="#0eaf8f" stroke-width="1.8" opacity=".55"/>`;
  })();
  const body = `
    <rect x="20" y="20" width="860" height="560" fill="#f8fafc"/>
    <rect x="20" y="20" width="860" height="560" fill="url(#boardGrid)" opacity=".8"/>
    <rect x="20" y="20" width="860" height="560" fill="url(#qFade)"/>
    <path d="M560 20 A200 200 0 0 1 860 320" fill="none" stroke="#38bdf8" stroke-width="2"
      opacity=".4"/>
    <path d="M60 344 H200 V320 H330 V352 H540 V376 H700"
      fill="none" stroke="#334155" stroke-width="1.6" opacity=".45"/>
    <path d="M200 376 V420 H420 M540 352 V180 H760" fill="none" stroke="#38bdf8"
      stroke-width="1.4" opacity=".5"/>
    ${nodes}
    ${waveform}
    <g transform="translate(690 250)">
      <rect x="-34" y="20" width="96" height="34" rx="4" fill="#e2e8f0" stroke="#64748b"
        stroke-width="1.2"/>
      <rect x="-22" y="0" width="72" height="20" rx="3" fill="#f1f5f9" stroke="#94a3b8"
        stroke-width="1"/>
      ${Array.from({ length: 6 }, (_, i) => `<path d="M${-26 + i * 12} 54 v10" stroke="#64748b"
        stroke-width="2"/>`).join('')}
      ${Array.from({ length: 6 }, (_, i) => `<path d="M${-26 + i * 12} 10 v-10" stroke="#64748b"
        stroke-width="2"/>`).join('')}
    </g>
    ${starField(prng, { x: 620, y: 60, width: 240, height: 120, count: 16, color: '#38bdf8', maxR: 1.2 })}
    ${radioArcs(760, 120, '#38bdf8', 2, 26)}`;
  return { accent, soft, defs, body };
}

/** 10 · 极光青：北境夜空、极光帷幕与雪地营帐（横向，深色设计区） */
function designAurora(seed) {
  const prng = seededRandom(seed);
  const accent = '#22d3ee';
  const soft = '#a5f3fc';
  const defs = `
    <linearGradient id="aSky" x1="0" y1="0" x2="0.15" y2="1">
      <stop offset="0%" stop-color="#070d1a"/>
      <stop offset="48%" stop-color="#0d2438"/>
      <stop offset="100%" stop-color="#134e4a"/>
    </linearGradient>
    <linearGradient id="aRibbonGreen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#34d399" stop-opacity=".75"/>
      <stop offset="55%" stop-color="#22d3ee" stop-opacity=".28"/>
      <stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="aRibbonViolet" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#a78bfa" stop-opacity=".6"/>
      <stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="aFadeLeft" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#070d1a" stop-opacity=".82"/>
      <stop offset="70%" stop-color="#070d1a" stop-opacity=".35"/>
      <stop offset="100%" stop-color="#070d1a" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="aCampGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fbbf24" stop-opacity=".9"/>
      <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="aSnow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e2e8f0"/>
      <stop offset="100%" stop-color="#64748b"/>
    </linearGradient>`;
  const aurora = (() => {
    const ribbons = [
      { y: 118, amp: 30, color: 'url(#aRibbonGreen)', opacity: 0.9, phase: 0.2 },
      { y: 165, amp: 42, color: 'url(#aRibbonViolet)', opacity: 0.6, phase: 1.3 },
      { y: 96, amp: 20, color: 'url(#aRibbonGreen)', opacity: 0.55, phase: 2.4 },
    ];
    return ribbons
      .map((ribbon) => {
        let d = `M-20 ${ribbon.y}`;
        for (let x = -20; x <= 920; x += 30) {
          const y =
            ribbon.y +
            Math.sin(x / 150 + ribbon.phase) * ribbon.amp +
            Math.sin(x / 63 + ribbon.phase) * 10;
          d += ` L${round(x)} ${round(y)}`;
        }
        d += ' L920 300 L-20 300 Z';
        return `<path d="${d}" fill="${ribbon.color}" opacity="${ribbon.opacity}"/>`;
      })
      .join('');
  })();
  const body = `
    <rect x="20" y="20" width="860" height="560" fill="url(#aSky)"/>
    ${starField(prng, { x: 20, y: 20, width: 860, height: 300, count: 90, maxR: 1.4 })}
    ${aurora}
    <rect x="20" y="96" width="620" height="330" fill="url(#aFadeLeft)"/>
    <circle cx="796" cy="96" r="26" fill="#f8fafc" opacity=".9"/>
    <circle cx="786" cy="88" r="25" fill="#070d1a" opacity=".65"/>
    <path d="${ridgeD({ prng, width: 900, baseY: 402, peaks: 5, minH: 60, maxH: 130 })}"
      fill="#0f172a" opacity=".95"/>
    <path d="${ridgeD({ prng, width: 900, baseY: 430, peaks: 4, minH: 40, maxH: 90 })}"
      fill="url(#aSnow)" opacity=".35"/>
    <circle cx="300" cy="392" r="46" fill="url(#aCampGlow)"/>
    <path d="M268 404 L300 358 L332 404 Z" fill="#f59e0b" opacity=".92"/>
    <path d="M300 358 L300 404" stroke="#b45309" stroke-width="1.2" opacity=".6"/>
    <path d="M262 404 L300 358 L338 404" fill="none" stroke="#fde68a" stroke-width="1.4"
      stroke-linecap="round" opacity=".8"/>
    <circle cx="300" cy="408" r="3.4" fill="#fbbf24"/>
    ${pine(120, 404, 64, '#0f172a', 0.85)}
    ${pine(160, 408, 84, '#0f172a', 0.9)}
    ${pine(196, 404, 56, '#0f172a', 0.8)}
    ${pine(760, 404, 70, '#0f172a', 0.8)}
    ${pine(800, 408, 92, '#0f172a', 0.85)}`;
  return { accent, soft, defs, body, dark: true };
}

/** 11 · 海蓝：黄昏海岛灯塔、光束与浪花（纵向） */
function designLighthouse(seed) {
  const prng = seededRandom(seed);
  const accent = '#0ea5e9';
  const soft = '#bae6fd';
  const defs = `
    <linearGradient id="lSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff7ed"/>
      <stop offset="42%" stop-color="#fef3c7"/>
      <stop offset="100%" stop-color="#fde68a"/>
    </linearGradient>
    <radialGradient id="lSun" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fffbeb"/>
      <stop offset="55%" stop-color="#fdba74"/>
      <stop offset="100%" stop-color="#fb7185" stop-opacity=".15"/>
    </radialGradient>
    <linearGradient id="lSea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7dd3fc"/>
      <stop offset="55%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#0369a1"/>
    </linearGradient>
    <linearGradient id="lBeam" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#fff7ed" stop-opacity=".8"/>
      <stop offset="100%" stop-color="#fff7ed" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="lTowerClip">
      <path d="M282 496 L292 352 H308 L318 496 Z"/>
    </clipPath>`;
  const body = `
    <rect x="20" y="20" width="560" height="536" fill="url(#lSky)"/>
    <circle cx="300" cy="330" r="66" fill="url(#lSun)"/>
    ${cloud(130, 258, 1.3, '#ffffff', 0.8)}
    ${cloud(430, 236, 1.05, '#ffffff', 0.68)}
    <path d="M20 400 H580 V560 H20 Z" fill="url(#lSea)" opacity=".9"/>
    ${waveBand({ y: 412, width: 600, amp: 8, periods: 2.4, color: '#e0f2fe', opacity: 0.6 })}
    ${waveBand({ y: 438, width: 600, amp: 10, periods: 3, color: '#f0f9ff', opacity: 0.4 })}
    ${waveBand({ y: 468, width: 600, amp: 12, periods: 2.6, color: '#e0f2fe', opacity: 0.32 })}
    <path d="M300 350 L60 300 L60 420 Z" fill="url(#lBeam)" opacity=".32"/>
    <path d="M300 350 L540 300 L540 420 Z" fill="url(#lBeam)" opacity=".32"/>
    <g clip-path="url(#lTowerClip)">
      <rect x="270" y="360" width="60" height="136" fill="#f8fafc"/>
      <rect x="270" y="390" width="60" height="16" fill="#fb7185"/>
      <rect x="270" y="430" width="60" height="16" fill="#fb7185"/>
      <rect x="270" y="470" width="60" height="16" fill="#fb7185"/>
    </g>
    <path d="M282 496 L292 352 H308 L318 496 Z" fill="none" stroke="#475569" stroke-width="1.6"/>
    <rect x="288" y="334" width="24" height="20" fill="#fef9c3" stroke="#475569" stroke-width="1.4"/>
    <path d="M284 334 L300 314 L316 334 Z" fill="#fb7185" stroke="#475569" stroke-width="1.2"/>
    <circle cx="300" cy="318" r="2.2" fill="#fbbf24"/>
    <rect x="270" y="496" width="60" height="10" rx="2" fill="#475569"/>
    <path d="M210 520 Q258 480 320 508 Q382 486 430 520 L430 556 L210 556 Z" fill="#334155"
      opacity=".9"/>
    <path d="M196 536 Q260 508 330 534 Q400 512 460 536 L460 556 L196 556 Z" fill="#1e293b"
      opacity=".75"/>
    ${waveBand({ y: 540, width: 600, amp: 6, periods: 2.2, color: '#e0f2fe', opacity: 0.5 })}
    ${birds(430, 292, '#9f1239', 2, 0.8)}
    ${birds(120, 320, '#9f1239', 2, 0.7)}
    ${starField(prng, { x: 20, y: 20, width: 560, height: 150, count: 20, color: '#f59e0b', maxR: 0.8 })}`;
  return { accent, soft, defs, body };
}

/** 12 · 胡桃木：老式电子管收音机、城市天际线与黄昏（横向） */
function designVintageRadio(seed) {
  const prng = seededRandom(seed);
  const accent = '#b45309';
  const soft = '#fde68a';
  const defs = `
    <linearGradient id="vSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fffdf8"/>
      <stop offset="55%" stop-color="#fff7ed"/>
      <stop offset="100%" stop-color="#fef3c7"/>
    </linearGradient>
    <radialGradient id="vSun" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fffbeb"/>
      <stop offset="55%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#f59e0b" stop-opacity=".15"/>
    </radialGradient>
    <linearGradient id="vWood" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0%" stop-color="#9a5b2c"/>
      <stop offset="45%" stop-color="#7c3f16"/>
      <stop offset="100%" stop-color="#5c2c0d"/>
    </linearGradient>`;
  const radio = (() => {
    const x = 54;
    const y = 322;
    const w = 366;
    const h = 78;
    const grille = Array.from({ length: 6 }, (_, i) =>
      `<path d="M${x + 22} ${y + 22 + i * 9} H${x + 150}" stroke="#7c3f16"
        stroke-width="2.4" opacity=".35"/>`
    ).join('');
    const ticks = Array.from({ length: 9 }, (_, i) => {
      const angle = (Math.PI * (i + 1)) / 10;
      const cx = x + 256 + Math.cos(angle) * 26;
      const cy = y + 34 - Math.sin(angle) * 26;
      return `<path d="M${round(cx)} ${round(cy)} l${round(Math.cos(angle) * 5)}
        ${round(-Math.sin(angle) * 5)}" stroke="#92400e" stroke-width="1.1"/>`;
    }).join('');
    return `<g>
      <ellipse cx="${x + w / 2}" cy="${y + h + 8}" rx="${w * 0.46}" ry="8"
        fill="#78350f" opacity=".16"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="url(#vWood)"
        stroke="#4a2409" stroke-width="1.6"/>
      <rect x="${x + 9}" y="${y + 9}" width="${w - 18}" height="${h - 18}" rx="6"
        fill="#f6ead6" stroke="#b45309" stroke-opacity=".4"/>
      <rect x="${x + 18}" y="${y + 17}" width="144" height="${h - 34}" rx="4" fill="#e7d3b3"/>
      ${grille}
      <circle cx="${x + 256}" cy="${y + 34}" r="30" fill="#fef3c7" stroke="#92400e"
        stroke-width="1.6"/>
      ${ticks}
      <path d="M${x + 256} ${y + 34} L${x + 272} ${y + 18}" stroke="#b91c1c"
        stroke-width="1.8" stroke-linecap="round"/>
      <circle cx="${x + 256}" cy="${y + 34}" r="3" fill="#92400e"/>
      <text x="${x + 256}" y="${y + 74}" text-anchor="middle" font-family="${SERIF}"
        font-size="11" letter-spacing="2" fill="#92400e">QSLINK</text>
      <circle cx="${x + 232}" cy="${y + 66}" r="7" fill="#7c3f16" stroke="#4a2409"/>
      <circle cx="${x + 286}" cy="${y + 66}" r="7" fill="#7c3f16" stroke="#4a2409"/>
      <path d="M${x + 330} ${y + 2} L${x + 392} ${y - 34}" stroke="#7c3f16" stroke-width="2"/>
    </g>`;
  })();
  const body = `
    <rect x="20" y="20" width="860" height="560" fill="url(#vSky)"/>
    <circle cx="742" cy="182" r="62" fill="url(#vSun)"/>
    <circle cx="742" cy="182" r="82" fill="none" stroke="#fbbf24" stroke-width="1"
      stroke-dasharray="2 9" opacity=".5"/>
    <rect x="20" y="20" width="860" height="560" fill="url(#dotGrid)" opacity=".3"/>
    ${cityLine(prng, { baseY: 408, fromX: 20, toX: 880, color: '#b45309', opacity: 0.2, minH: 30, maxH: 120 })}
    <path d="M20 408 H880" stroke="#b45309" stroke-opacity=".28" stroke-width="1"/>
    ${birds(560, 140, '#b45309', 3, 0.9)}
    ${birds(620, 118, '#b45309', 2, 0.7)}
    ${radio}
    <path d="M470 402 H870" stroke="#b45309" stroke-opacity=".18" stroke-width="1"/>`;
  return { accent, soft, defs, body };
}

/** 13 · 触感银卡：镭射银箔、全息圆环与雪线（纵向，头图卡） */
function designSilver(seed) {
  const prng = seededRandom(seed);
  const accent = '#6366f1';
  const soft = '#e0e7ff';
  const defs = `
    <linearGradient id="sSilver" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="28%" stop-color="#eef2f7"/>
      <stop offset="52%" stop-color="#f5e9ff"/>
      <stop offset="74%" stop-color="#e0f2fe"/>
      <stop offset="100%" stop-color="#f8fafc"/>
    </linearGradient>
    <linearGradient id="sFoil" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f0abfc" stop-opacity=".5"/>
      <stop offset="35%" stop-color="#a5b4fc" stop-opacity=".5"/>
      <stop offset="65%" stop-color="#7dd3fc" stop-opacity=".5"/>
      <stop offset="100%" stop-color="#fbcfe8" stop-opacity=".45"/>
    </linearGradient>
    <linearGradient id="sRing" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#c084fc"/>
      <stop offset="50%" stop-color="#818cf8"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>
    <linearGradient id="sRidge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#cbd5e1"/>
      <stop offset="100%" stop-color="#94a3b8"/>
    </linearGradient>`;
  const sparkles = Array.from({ length: 34 }, () => {
    const x = round(30 + prng() * 540);
    const y = round(30 + prng() * 500);
    const r = round(0.6 + prng() * 1.7);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#a5b4fc" opacity="${round(0.25 + prng() * 0.5)}"/>`;
  }).join('');
  const crosses = [[120, 260, 1.1], [470, 300, 1.3], [200, 470, 0.9], [420, 220, 0.8]]
    .map(
      ([cx, cy, scale]) => `<g stroke="#818cf8" stroke-width="1" opacity=".55"
        transform="translate(${cx} ${cy}) scale(${scale})">
        <path d="M-10 0 H10 M0 -10 V10"/>
        <path d="M-4 -4 L4 4 M4 -4 L-4 4" opacity=".6"/>
      </g>`
    )
    .join('');
  const body = `
    <rect x="20" y="20" width="560" height="536" fill="url(#sSilver)"/>
    <g transform="rotate(-22 300 300)">
      <rect x="-120" y="146" width="840" height="92" fill="url(#sFoil)"/>
      <rect x="-120" y="322" width="840" height="44" fill="url(#sFoil)" opacity=".6"/>
      <rect x="-120" y="428" width="840" height="26" fill="url(#sFoil)" opacity=".4"/>
    </g>
    ${Array.from({ length: 9 }, (_, i) => `<path d="M${40 + i * 66} 20 V556" stroke="#94a3b8"
      stroke-opacity=".1" stroke-width=".8"/>`).join('')}
    ${Array.from({ length: 7 }, (_, i) => `<path d="M20 ${60 + i * 78} H580" stroke="#94a3b8"
      stroke-opacity=".1" stroke-width=".8"/>`).join('')}
    <circle cx="320" cy="386" r="146" fill="none" stroke="url(#sRing)" stroke-width="2.4"
      opacity=".55"/>
    <circle cx="320" cy="386" r="122" fill="none" stroke="url(#sRing)" stroke-width="1"
      stroke-dasharray="3 7" opacity=".5"/>
    <circle cx="320" cy="386" r="96" fill="none" stroke="#c7d2fe" stroke-width="7"
      opacity=".5"/>
    <circle cx="320" cy="386" r="72" fill="#ffffff" fill-opacity=".35" stroke="#a5b4fc"
      stroke-width="1" opacity=".8"/>
    ${radioArcs(320, 386, '#818cf8', 2, 26)}
    <text x="300" y="246" text-anchor="middle" font-family="${SANS}" font-size="10"
      letter-spacing="4.2" fill="#6366f1" opacity=".85">TOUCH SILVER · 触感银卡</text>
    <path d="M220 258 H380" stroke="#818cf8" stroke-opacity=".4" stroke-width="1"/>
    <text x="320" y="384" text-anchor="middle" font-family="${SERIF}" font-size="112"
      fill="#c7d2fe" opacity=".35">73</text>
    ${sparkles}
    ${crosses}
    <path d="${ridgeD({ prng, width: 600, baseY: 496, peaks: 4, minH: 34, maxH: 74, bottom: 580 })}"
      fill="url(#sRidge)" opacity=".5"/>
    <path d="${ridgeD({ prng, width: 600, baseY: 522, peaks: 3, minH: 24, maxH: 54, bottom: 580 })}"
      fill="#cbd5e1" opacity=".55"/>`;
  return { accent, soft, defs, body };
}

/* =========================================================================
 * 五、卡片背面版式（QSO 表格 / 收件地址 / 回卡方式）
 * ========================================================================= */

function formLine(x, y, width, color) {
  return `<path d="M${x} ${y} H${x + width}" stroke="${color}" stroke-opacity=".3"
    stroke-width="1" stroke-dasharray="1 3"/>`;
}

/** 邮票装饰：锯齿边框 + 电波 + 面值 */
function stamp(x, y, size, accent) {
  const width = size;
  const height = Math.round(size * 1.28);
  return `<g transform="translate(${x} ${y})">
    <rect width="${width}" height="${height}" rx="3" fill="${PAPER}" stroke="${accent}"
      stroke-opacity=".6" stroke-width="1.4" stroke-dasharray="5 4"/>
    <rect x="7" y="7" width="${width - 14}" height="${height - 14}" fill="#ffffff"
      fill-opacity=".7" stroke="${accent}" stroke-opacity=".5"/>
    <circle cx="${width / 2}" cy="${round(height * 0.38)}" r="${round(width * 0.16)}"
      fill="none" stroke="${accent}" stroke-opacity=".8" stroke-width="1.2"/>
    <path d="M${round(width * 0.18)} ${round(height * 0.56)} q ${round(width * 0.16)} -8
      ${round(width * 0.32)} 0 t ${round(width * 0.32)} 0" fill="none"
      stroke="${accent}" stroke-opacity=".7" stroke-width="1.2"/>
    <text x="${width / 2}" y="${height - 22}" text-anchor="middle" font-family="${SANS}"
      font-size="7.5" letter-spacing="1.4" fill="${accent}">QSLINK</text>
    <text x="${width / 2}" y="${height - 9}" text-anchor="middle" font-family="${MONO}"
      font-size="10" fill="${INK}">1.20</text>
  </g>`;
}

function renderBackLandscape(ctx, palette) {
  const accent = palette.accent;
  const defs = commonDefs({ accent, soft: palette.soft });
  const body = `
    <text x="60" y="132" font-family="${SERIF}" font-size="52" letter-spacing="3"
      fill="${INK}">${esc(ctx.callSign)}</text>
    <text x="62" y="158" font-family="${SANS}" font-size="9.5" letter-spacing="3"
      fill="${INK}" fill-opacity=".5">QSL CARD · 通联确认卡 · NO. ${esc(ctx.serial)}</text>
    ${stamp(788, 54, 72, accent)}
    <path d="M60 180 H840" stroke="${accent}" stroke-opacity=".38"/>
    <text x="60" y="218" font-family="${SANS}" font-size="9" letter-spacing="2.6"
      fill="${INK}" fill-opacity=".45">TO RADIO · 收件电台</text>
    <text x="60" y="248" font-family="${SERIF}" font-size="22"
      fill="${INK}">${esc(ctx.toRadio)}</text>
    <text x="60" y="278" font-family="${SANS}" font-size="8.5" letter-spacing="1.8"
      fill="${INK}" fill-opacity=".38">NAME / ADDRESS / CITY / COUNTRY</text>
    ${[302, 328, 354, 380].map((y) => formLine(60, y, 330, accent)).join('')}
    <text x="462" y="218" font-family="${SANS}" font-size="9" letter-spacing="2.6"
      fill="${INK}" fill-opacity=".45">QSO CONFIRMATION · 通联记录</text>
    ${infoCell(462, 248, 'DATE', ctx.date, accent)}
    ${infoCell(662, 248, 'UTC', ctx.utc, accent)}
    ${infoCell(462, 314, 'FREQ', ctx.freq, accent)}
    ${infoCell(662, 314, 'QTH', ctx.qth, accent)}
    ${infoCell(462, 380, 'RST', ctx.rst, accent)}
    ${infoCell(662, 380, 'QSL VIA', 'BUREAU', accent)}
    <text x="60" y="452" font-family="${SANS}" font-size="9" letter-spacing="2.4"
      fill="${INK}" fill-opacity=".45">PLEASE QSL</text>
    <g font-family="${SANS}" font-size="11" fill="${INK}" fill-opacity=".72">
      <rect x="170" y="442" width="12" height="12" fill="none" stroke="${accent}" stroke-width="1.2"/>
      <path d="M173 448 l3 3 l6 -7" fill="none" stroke="${accent}" stroke-width="1.6"/>
      <text x="192" y="453">DIRECT · 直邮</text>
      <rect x="312" y="442" width="12" height="12" fill="none" stroke="${accent}" stroke-width="1.2"/>
      <text x="334" y="453">BUREAU · 卡片局</text>
    </g>
    <text x="60" y="512" font-family="${SERIF}" font-style="italic" font-size="30"
      fill="${INK}">73 de ${esc(ctx.callSign)}</text>
    <path d="M60 522 q 70 8 140 0" fill="none" stroke="${accent}" stroke-width="1.3"
      stroke-linecap="round" opacity=".75"/>
    <text x="60" y="548" font-family="${SANS}" font-size="9" letter-spacing="1.8"
      fill="${INK}" fill-opacity=".5">OP. ${esc(ctx.opName)} · ${esc(ctx.qth)} · GRID ${esc(ctx.grid)}</text>
    <text x="840" y="548" text-anchor="end" font-family="${SANS}" font-size="9"
      letter-spacing="1.8" fill="${INK}" fill-opacity=".38">TNX QSO · 感谢通联 · 73</text>`;
  return svgDoc(
    900,
    600,
    `${defs}
    <rect width="900" height="600" fill="${PAPER}"/>
    <rect width="900" height="600" fill="url(#paperGrad)"/>
    ${body}
    ${frame(900, 600, accent)}`
  );
}

function renderBackPortrait(ctx, palette) {
  const accent = palette.accent;
  const defs = commonDefs({ accent, soft: palette.soft });
  const boxes = [
    ['对方电台', 'CALL', ctx.toRadio],
    ['UTC 时间', 'TIME', ctx.utc],
    ['频率', 'FREQ', ctx.freq],
    ['通联地点', 'QTH', ctx.qth],
    ['设备', 'RIG', 'IC-7300 · 100W'],
    ['天线', 'ANT', 'DP · 偶极'],
    ['功率', 'PWR', '100W'],
    ['信号报告', 'RST', ctx.rst],
  ];
  const cells = boxes
    .map(([cn, en, value], index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = 48 + col * 264;
      const y = 196 + row * 116;
      return `<g>
        <rect x="${x}" y="${y}" width="240" height="104" rx="6" fill="#ffffff"
          fill-opacity=".6" stroke="${accent}" stroke-opacity=".32" stroke-width="1.1"/>
        <text x="${x + 16}" y="${y + 30}" font-family="${SANS}" font-size="13"
          letter-spacing="2" fill="${INK}" fill-opacity=".8">${esc(cn)}</text>
        <text x="${x + 16}" y="${y + 46}" font-family="${SANS}" font-size="8"
          letter-spacing="2" fill="${INK}" fill-opacity=".4">${esc(en)}</text>
        <text x="${x + 16}" y="${y + 78}" font-family="${SERIF}" font-size="19"
          fill="${INK}">${esc(value)}</text>
        ${formLine(x + 16, y + 88, 208, accent)}
      </g>`;
    })
    .join('');
  const body = `
    <text x="300" y="104" text-anchor="middle" font-family="${SERIF}" font-size="46"
      letter-spacing="3" fill="${INK}">${esc(ctx.callSign)}</text>
    <text x="300" y="130" text-anchor="middle" font-family="${SANS}" font-size="9.5"
      letter-spacing="3" fill="${INK}" fill-opacity=".5">QSL CARD · 业余无线电通联确认卡</text>
    ${stamp(470, 56, 72, accent)}
    <path d="M48 172 H552" stroke="${accent}" stroke-opacity=".35"/>
    ${cells}
    <text x="48" y="690" font-family="${SANS}" font-size="9" letter-spacing="2.6"
      fill="${INK}" fill-opacity=".45">TO RADIO · 收件地址</text>
    <text x="48" y="718" font-family="${SERIF}" font-size="21"
      fill="${INK}">${esc(ctx.toRadio)}</text>
    ${[736, 762, 788].map((y) => formLine(48, y, 500, accent)).join('')}
    <text x="48" y="826" font-family="${SERIF}" font-style="italic" font-size="30"
      fill="${INK}">73 de ${esc(ctx.callSign)}</text>
    <path d="M48 836 q 74 8 148 0" fill="none" stroke="${accent}" stroke-width="1.3"
      stroke-linecap="round" opacity=".75"/>
    <text x="48" y="860" font-family="${SANS}" font-size="9" letter-spacing="1.8"
      fill="${INK}" fill-opacity=".5">OP. ${esc(ctx.opName)} · ${esc(ctx.qth)} · GRID ${esc(ctx.grid)}</text>
    <text x="552" y="860" text-anchor="end" font-family="${SANS}" font-size="9"
      letter-spacing="1.8" fill="${INK}" fill-opacity=".38">TNX QSO · 73</text>`;
  return svgDoc(
    600,
    900,
    `${defs}
    <rect width="600" height="900" fill="${PAPER}"/>
    <rect width="600" height="900" fill="url(#paperGrad)"/>
    ${body}
    ${frame(600, 900, accent)}`
  );
}

/* =========================================================================
 * 六、种子数据定义
 * ========================================================================= */

const DAY_MS = 24 * 60 * 60 * 1000;

const USER_DEFS = [
  {
    key: 'admin',
    username: 'admin',
    email: 'admin@qslink.site',
    password: ADMIN_PASSWORD,
    role: 'admin',
    displayName: '站点管理员',
    callSign: '',
    bio: 'QSLink 站点管理员，负责卡片审核与社区维护。愿每一张卡片都抵达对的人。',
    avatarColor: '#475569',
    daysAgo: 200,
    qth: '北京',
    grid: 'OM89',
    address: {
      name: '管理员',
      phone: '13800000000',
      line1: '海淀区中关村大街 1 号 5 单元 602',
      city: '北京市',
      province: '北京市',
      postalCode: '100080',
      country: '中国',
    },
  },
  {
    key: 'bg7mom',
    username: 'bg7mom',
    email: 'bg7mom@qslink.site',
    password: DEMO_PASSWORD,
    displayName: '小刻',
    callSign: 'BG7MOM',
    bio: '在 20 米波段等你的信号。喜欢甜品、收藏卡和一切好看的东西，收到卡片一定会认真回寄。',
    avatarColor: '#0eaf8f',
    daysAgo: 120,
    qth: '深圳 · 广东',
    grid: 'OL72',
    address: {
      name: '张小刻',
      phone: '13900000001',
      line1: '南山区科技园南区 8 栋 502',
      city: '深圳市',
      province: '广东省',
      postalCode: '518057',
      country: '中国',
    },
  },
  {
    key: 'ba1aa',
    username: 'ba1aa',
    email: 'ba1aa@qslink.site',
    password: DEMO_PASSWORD,
    displayName: '老北京',
    callSign: 'BA1AA',
    bio: '1989 年开始玩短波的老火腿，偏爱 CW 与手键，QSL 一律 100% 回卡。',
    avatarColor: '#38bdf8',
    daysAgo: 180,
    qth: '北京 · 西城',
    grid: 'OM89',
    address: {
      name: '陈建国',
      phone: '13900000002',
      line1: '西城区德胜门外大街 12 号 3 单元 401',
      city: '北京市',
      province: '北京市',
      postalCode: '100088',
      country: '中国',
    },
  },
  {
    key: 'bd7abc',
    username: 'bd7abc',
    email: 'bd7abc@qslink.site',
    password: DEMO_PASSWORD,
    displayName: '湘江电波',
    callSign: 'BD7ABC',
    bio: '长沙火腿，周末常驻 7.060 MHz。手里攒了三百多张 QSL，欢迎来换。',
    avatarColor: '#fb7185',
    daysAgo: 90,
    qth: '长沙 · 湖南',
    grid: 'OL68',
    address: {
      name: '李湘',
      phone: '13900000003',
      line1: '岳麓区麓山南路 32 号 2 栋 301',
      city: '长沙市',
      province: '湖南省',
      postalCode: '410012',
      country: '中国',
    },
  },
  {
    key: 'bh4xyz',
    username: 'bh4xyz',
    email: 'bh4xyz@qslink.site',
    password: DEMO_PASSWORD,
    displayName: '沪上小周',
    callSign: 'BH4XYZ',
    bio: '上海 2 米中继常客，也在收集全国各地的卡片。换卡请直接申请，必回。',
    avatarColor: '#8b5cf6',
    daysAgo: 6,
    qth: '上海 · 浦东',
    grid: 'PM01',
    address: {
      name: '周海',
      phone: '13900000004',
      line1: '浦东新区张江路 88 弄 6 号 1202',
      city: '上海市',
      province: '上海市',
      postalCode: '201203',
      country: '中国',
    },
  },
  {
    key: 'bh8abc',
    username: 'bh8abc',
    email: 'bh8abc@qslink.site',
    password: DEMO_PASSWORD,
    displayName: '滇西阿木',
    callSign: 'BH8ABC',
    bio: '在云南山里架台，海拔 2400 米，云比信号多。QSL via bureau。',
    avatarColor: '#f59e0b',
    daysAgo: 4,
    qth: '昆明 · 云南',
    grid: 'OL14',
    address: {
      name: '木洱',
      phone: '13900000005',
      line1: '五华区翠湖南路 9 号 1 单元 602',
      city: '昆明市',
      province: '云南省',
      postalCode: '650021',
      country: '中国',
    },
  },
  {
    key: 'ja1abc',
    username: 'ja1abc',
    email: 'ja1abc@qslink.site',
    password: DEMO_PASSWORD,
    displayName: '山田太郎',
    callSign: 'JA1ABC',
    bio: '東京から QRV。QSL via JARL bureau. 中国語を勉強中です、73！',
    avatarColor: '#14b8a6',
    daysAgo: 5,
    qth: '东京 · 日本',
    grid: 'PM95',
    address: {
      name: '山田 太郎',
      phone: '+81-90-0000-0000',
      line1: '杉並区高円寺北 3-12-5',
      city: '東京都',
      province: '東京都',
      postalCode: '166-0002',
      country: '日本',
    },
  },
  {
    key: 'k2xyz',
    username: 'k2xyz',
    email: 'k2xyz@qslink.site',
    password: DEMO_PASSWORD,
    displayName: 'John Miller',
    callSign: 'K2XYZ',
    bio: 'QRV on 20m most evenings from Portland, Oregon. QSL direct or via bureau. 73!',
    avatarColor: '#6366f1',
    daysAgo: 3,
    qth: 'Portland · USA',
    grid: 'CN85',
    address: {
      name: 'John Miller',
      phone: '+1-503-000-0000',
      line1: '2210 NE Broadway St, Apt 4B',
      city: 'Portland, OR',
      province: 'Oregon',
      postalCode: '97232',
      country: '美国',
    },
  },
];

/**
 * 银卡定义：v3 起用程序化生成的「触感银卡」替代原真实图片收藏卡（bg7mom 名下）。
 * 注意：首页 Hero 取「点赞最高的已审核卡片」，最高赞刻意放在 bh8abc 的生成卡片上。
 */
const SILVER_CARD_DEF = {
  design: designSilver,
  portrait: true,
  owner: 'bg7mom',
  title: 'BG7MOM · 触感银卡｜雪线之上的电波',
  callSign: 'BG7MOM',
  freq: '14.270 MHz',
  rst: '59',
  toRadio: 'JA1ABC',
  ser: '001',
  daysAgo: 52,
  qsoDaysAgo: 52,
  utc: '12:30',
  status: 'approved',
  notes:
    '这张银卡是自己画的双面 QSL：正面是镭射银箔、全息圆环与雪线，背面留好了回卡区。从墨尔本到漠河，它替我走过很多个夜晚，73！',
};

/** 程序化 SVG 卡片定义（owner 用 username） */
const SVG_CARD_DEFS = [
  {
    design: designForest,
    portrait: false,
    owner: 'bg7mom',
    title: '山与电波的约定',
    callSign: 'BG7MOM',
    freq: '14.255 MHz',
    rst: '59',
    toRadio: 'BH4XYZ',
    ser: '002',
    daysAgo: 32,
    qsoDaysAgo: 32,
    utc: '13:42',
    status: 'approved',
    notes: '去年秋天在梅林后山架台，日落时分量表突然跳到 59。这张卡就是那晚的纪念。',
  },
  {
    design: designMist,
    portrait: true,
    owner: 'ba1aa',
    title: '晨雾里的二十米',
    callSign: 'BA1AA',
    freq: '14.030 MHz',
    rst: '579',
    toRadio: 'BG7MOM',
    ser: '007',
    daysAgo: 27,
    qsoDaysAgo: 27,
    utc: '02:18',
    status: 'approved',
    notes: '清晨五点的 20 米像一条安静的河。用手键敲了二十分钟，对面是深圳的 BG7MOM。',
  },
  {
    design: designDunes,
    portrait: false,
    owner: 'ba1aa',
    title: '戈壁黄昏的信号',
    callSign: 'BA1AA',
    freq: '7.060 MHz',
    rst: '59+',
    toRadio: 'K2XYZ',
    ser: '011',
    daysAgo: 24,
    qsoDaysAgo: 23,
    utc: '11:05',
    status: 'approved',
    notes: '敦煌自驾途中在戈壁滩上临时架台，天线只用了一根 5 米鱼竿，居然通了北美。',
  },
  {
    design: designCityNights,
    portrait: true,
    owner: 'bd7abc',
    title: '城市夜航',
    callSign: 'BD7ABC',
    freq: '7.074 MHz',
    rst: '-12 / -09',
    toRadio: 'JA1ABC',
    ser: '018',
    daysAgo: 30,
    qsoDaysAgo: 29,
    utc: '14:22',
    status: 'approved',
    notes: '晚上十一点的长沙，窗外霓虹和 FT8 的水声混在一起。这张卡拍了三个晚上才满意。',
  },
  {
    design: designOcean,
    portrait: false,
    owner: 'bh4xyz',
    title: '太平洋上的电波',
    callSign: 'BH4XYZ',
    freq: '21.280 MHz',
    rst: '59',
    toRadio: 'BD7ABC',
    ser: '004',
    daysAgo: 14,
    qsoDaysAgo: 13,
    utc: '07:36',
    status: 'approved',
    notes: '在东海边住了一晚，凌晨开通了 15 米，海浪声和噪声一起灌进耳机。',
  },
  {
    design: designStarry,
    portrait: true,
    owner: 'bh8abc',
    title: '高原星空下的守候',
    callSign: 'BH8ABC',
    freq: '14.020 MHz',
    rst: '559',
    toRadio: 'BG7MOM',
    ser: '021',
    daysAgo: 9,
    qsoDaysAgo: 9,
    utc: '15:48',
    status: 'approved',
    notes: '海拔 2400 米的山顶，银河从雪线升起。守了两个小时，终于等到那一串清脆的 CQ。',
  },
  {
    design: designSnow,
    portrait: false,
    owner: 'ja1abc',
    title: '雪线之上',
    callSign: 'JA1ABC',
    freq: '14.180 MHz',
    rst: '55',
    toRadio: 'BH8ABC',
    ser: '009',
    daysAgo: 2,
    qsoDaysAgo: 2,
    utc: '23:10',
    status: 'pending',
    notes: '富士山麓的清晨，天线结了一层霜。信号穿越日本海，到达云南的山里。',
  },
  {
    design: designSunset,
    portrait: true,
    owner: 'k2xyz',
    title: '落日与海',
    callSign: 'K2XYZ',
    freq: '28.500 MHz',
    rst: '57',
    toRadio: 'BA1AA',
    ser: '003',
    daysAgo: 1,
    qsoDaysAgo: 1,
    utc: '00:42',
    status: 'pending',
    notes: 'Portland 的黄昏，太平洋就在天线西边。等一个来自北京的 57 信号。',
  },
  {
    design: designCircuit,
    portrait: false,
    owner: 'bd7abc',
    title: '电路与网格的午后',
    callSign: 'BD7ABC',
    freq: '7.020 MHz',
    rst: '599',
    toRadio: 'K2XYZ',
    ser: '026',
    daysAgo: 6,
    qsoDaysAgo: 6,
    utc: '09:50',
    status: 'rejected',
    rejectReason: '图片分辨率不足，且背面缺少通联信息，请补充后重新提交。',
    notes: '把手键和电路板拼成一张卡，致敬那些在深夜里调试机器的时光。',
  },
  {
    design: designAurora,
    portrait: false,
    owner: 'bg7mom',
    title: '极光下的营地',
    callSign: 'BG7MOM',
    freq: '14.195 MHz',
    rst: '59',
    toRadio: 'K2XYZ',
    ser: '031',
    daysAgo: 11,
    qsoDaysAgo: 11,
    utc: '14:05',
    status: 'approved',
    notes:
      '在漠河雪原上守了一夜，绿色极光像窗帘一样垂下来。K2XYZ 的信号从太平洋那头穿过来，帐篷里全是呵出的白气。',
  },
  {
    design: designLighthouse,
    portrait: true,
    owner: 'ja1abc',
    title: '黄昏灯塔',
    callSign: 'JA1ABC',
    freq: '21.030 MHz',
    rst: '579',
    toRadio: 'BH4XYZ',
    ser: '014',
    daysAgo: 8,
    qsoDaysAgo: 8,
    utc: '09:15',
    status: 'approved',
    notes:
      '北海道小岛的灯塔旁架台，黄昏的光落在海面上，和电台的刻度灯是同一个颜色。手键敲到第七分钟，上海回来了。',
  },
  {
    design: designVintageRadio,
    portrait: false,
    owner: 'k2xyz',
    title: '老收音机里的城市',
    callSign: 'K2XYZ',
    freq: '7.290 MHz',
    rst: '58',
    toRadio: 'BD7ABC',
    ser: '005',
    daysAgo: 5,
    qsoDaysAgo: 5,
    utc: '02:30',
    status: 'approved',
    notes:
      '祖父留下的电子管收音机还能响。夜里调到 40 米，整座城市像被装进了木壳里，声音暖得发黄。',
  },
];

/** 换卡申请种子（cardIndex 对应 cards 数组下标：0 为「触感银卡」生成卡，1..12 为 SVG 卡片顺序） */
const EXCHANGE_DEFS = [
  {
    cardIndex: 1,
    from: 'bh4xyz',
    fromDaysAgo: 2,
    decidedDaysAgo: null,
    status: 'pending',
    message: '小刻你好，这张山峦卡太好看了，想用我的上海夜景卡交换，收到必回！73 de BH4XYZ',
  },
  {
    cardIndex: 2,
    from: 'bg7mom',
    fromDaysAgo: 5,
    decidedDaysAgo: null,
    status: 'pending',
    message: '陈老师好，想换一张晨雾卡。我回寄深圳的海边卡片，73！',
  },
  {
    cardIndex: 5,
    from: 'bd7abc',
    fromDaysAgo: 12,
    decidedDaysAgo: 10,
    status: 'approved',
    message: '海边的卡太漂亮了，换一张！我这边有长沙的风景卡。',
  },
  {
    cardIndex: 0,
    from: 'ja1abc',
    fromDaysAgo: 20,
    decidedDaysAgo: 19,
    status: 'rejected',
    rejectReason: '抱歉，这张是自留收藏卡，暂时不交换，73！',
    message: 'こんにちは！这张银卡非常漂亮，可以交换吗？73 de JA1ABC',
  },
  {
    cardIndex: 4,
    from: 'k2xyz',
    fromDaysAgo: 14,
    decidedDaysAgo: 12,
    completedDaysAgo: 10,
    status: 'completed',
    message: 'Beautiful card! Would love to exchange. 73 de K2XYZ',
  },
  {
    cardIndex: 6,
    from: 'bg7mom',
    fromDaysAgo: 6,
    decidedDaysAgo: 5,
    status: 'rejected',
    rejectReason: '这张卡只和 8 区朋友交换，抱歉啦，73！',
    message: '阿木老师好，星空卡太美了，求换一张！',
  },
  {
    cardIndex: 10,
    from: 'k2xyz',
    fromDaysAgo: 8,
    decidedDaysAgo: 6,
    status: 'approved',
    message: '小刻你好！极光卡太美了，想用我的老收音机卡换一张，73 de K2XYZ',
  },
];

/**
 * 每张卡片的展示点赞数（13 张：0 为替代真实卡的「触感银卡」，1..12 为 SVG 卡片顺序）。
 * 总点赞 208；最高赞 46 放在 bh8abc 的《高原星空下的守候》（非 bg7mom 卡，供首页 Hero）。
 * bg7mom 名下三张卡（0/1/10）保持 22-26 赞。
 */
const CARD_LIKE_COUNTS = [22, 24, 17, 14, 25, 15, 46, 0, 0, 0, 26, 11, 8];

/* =========================================================================
 * 七、写入种子数据
 * ========================================================================= */

/** 从候选用户里确定性地挑出 n 个点赞者 */
function pickLikers(users, ownerId, count, seed) {
  const candidates = users.filter((user) => user.id !== ownerId);
  const prng = seededRandom(seed);
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(prng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.slice(0, Math.min(count, candidates.length));
}

async function seed(db, { uploadsDir }) {
  const now = Date.now();
  const isoAgo = (days) => new Date(now - days * DAY_MS).toISOString();
  const userByKey = new Map();
  const users = [];

  for (const def of USER_DEFS) {
    const createdAt = isoAgo(def.daysAgo);
    const user = {
      id: createId('u'),
      username: def.username,
      email: def.email,
      displayName: def.displayName,
      callSign: def.callSign,
      bio: def.bio,
      avatarColor: def.avatarColor,
      role: def.role || 'user',
      status: 'active',
      address: { ...def.address },
      passwordHash: hashPassword(def.password),
      createdAt,
      updatedAt: createdAt,
    };
    users.push(user);
    userByKey.set(def.key, user);
  }

  const cards = [];

  // 0..12 · 全部为程序化生成的双面 SVG 卡片（v3 起不再引用真实图片素材）。
  // 第 0 张是替代原真实图片的「触感银卡」，其余 12 张沿用既有设计；
  // 卡片下标与 EXCHANGE_DEFS 的 cardIndex 保持一致。
  const GENERATED_CARD_DEFS = [SILVER_CARD_DEF, ...SVG_CARD_DEFS];
  for (let cardIndex = 0; cardIndex < GENERATED_CARD_DEFS.length; cardIndex += 1) {
    const def = GENERATED_CARD_DEFS[cardIndex];
    const owner = userByKey.get(def.owner);
    const qsoDate = daysAgoDate(
      def.qsoDaysAgo,
      Number(def.utc.slice(0, 2)),
      Number(def.utc.slice(3, 5))
    );
    const ctx = {
      callSign: def.callSign,
      toRadio: def.toRadio,
      title: def.title,
      date: formatCardDate(qsoDate),
      utc: `${def.utc} UTC`,
      qsoAt: qsoDate.toISOString(),
      freq: def.freq,
      rst: def.rst,
      opName: owner.displayName,
      qth: USER_DEFS.find((item) => item.key === def.owner).qth,
      grid: USER_DEFS.find((item) => item.key === def.owner).grid,
      serial: `${def.callSign}-${def.ser}`,
    };
    const design = def.design(101 + cardIndex * 37);
    const frontSvg = def.portrait ? renderPortrait(ctx, design) : renderLandscape(ctx, design);
    const backSvg = def.portrait
      ? renderBackPortrait(ctx, design)
      : renderBackLandscape(ctx, design);
    const frontName = `seed-${cardIndex + 1}.svg`;
    const backName = `seed-${cardIndex + 1}-back.svg`;
    await fsp.writeFile(path.join(uploadsDir, frontName), frontSvg, 'utf8');
    await fsp.writeFile(path.join(uploadsDir, backName), backSvg, 'utf8');

    const createdAt = isoAgo(def.daysAgo);
    cards.push({
      id: createId('c'),
      ownerId: owner.id,
      title: def.title,
      callSign: def.callSign,
      band: '',
      mode: '',
      notes: def.notes,
      ratio: def.portrait ? { w: 2, h: 3 } : { w: 3, h: 2 },
      frontImage: `/uploads/${frontName}`,
      backImage: `/uploads/${backName}`,
      status: def.status,
      rejectReason: def.status === 'rejected' ? def.rejectReason : null,
      shareToken: randomString(10),
      createdAt,
      updatedAt: createdAt,
    });
  }

  // 点赞：真实种子用户占 2-5 个（保证 liked 状态有差异），其余显示为站内其他爱好者的历史点赞
  const likes = [];
  // Legacy seeds used likes from nonexistent users. Keep demo totals while
  // making every like reference a real, disabled, synthetic demonstration user.
  const syntheticPasswordHash = hashPassword(require('crypto').randomBytes(32).toString('hex'));
  let guestLikeSeq = 0;
  CARD_LIKE_COUNTS.forEach((count, cardIndex) => {
    if (!count) return;
    const card = cards[cardIndex];
    const realCount = Math.min(count, 2 + (cardIndex % 4));
    for (const user of pickLikers(users, card.ownerId, realCount, 900 + cardIndex)) {
      likes.push({
        id: createId('l'),
        cardId: card.id,
        userId: user.id,
        createdAt: card.createdAt,
      });
    }
    for (let i = realCount; i < count; i += 1) {
      guestLikeSeq += 1;
      const actorId = `u_like_${String(guestLikeSeq).padStart(4, '0')}`;
      users.push({ id: actorId, username: 'demo_like_' + guestLikeSeq, email: `demo_like_${guestLikeSeq}@example.invalid`,
        displayName: '演示点赞用户', callSign: '', bio: '', avatarColor: '#0eaf8f', role: 'user', status: 'banned',
        address: null, passwordHash: syntheticPasswordHash, createdAt: card.createdAt, updatedAt: card.createdAt });
      likes.push({
        id: createId('l'),
        cardId: card.id,
        userId: `u_like_${String(guestLikeSeq).padStart(4, '0')}`,
        createdAt: card.createdAt,
      });
    }
  });

  // 换卡申请
  const exchanges = [];
  for (const def of EXCHANGE_DEFS) {
    const card = cards[def.cardIndex];
    const fromUser = userByKey.get(def.from);
    const createdAt = isoAgo(def.fromDaysAgo);
    const decidedAt = def.decidedDaysAgo == null ? null : isoAgo(def.decidedDaysAgo);
    const updatedAt = def.completedDaysAgo != null ? isoAgo(def.completedDaysAgo) : decidedAt || createdAt;
    exchanges.push({
      id: createId('e'),
      cardId: card.id,
      fromUserId: fromUser.id,
      toUserId: card.ownerId,
      status: def.status,
      message: def.message,
      rejectReason: def.rejectReason || null,
      contactName: fromUser.address.name,
      fromAddress: { ...fromUser.address },
      createdAt,
      updatedAt,
      decidedAt,
    });
  }

  db.data.users = users;
  db.data.cards = cards;
  db.data.likes = likes;
  db.data.exchanges = exchanges;
  db.data.sessions = [];

  return { users: users.length, cards: cards.length, likes: likes.length, exchanges: exchanges.length };
}

/** 启动日志与交付说明中使用的演示账号 */
const DEMO_ACCOUNTS = [
  { username: 'admin', password: ADMIN_PASSWORD, role: 'admin', displayName: '站点管理员' },
  { username: 'bg7mom', password: DEMO_PASSWORD, role: 'user', displayName: '小刻' },
  { username: 'ba1aa', password: DEMO_PASSWORD, role: 'user', displayName: '老北京' },
  { username: 'bd7abc', password: DEMO_PASSWORD, role: 'user', displayName: '湘江电波' },
  { username: 'bh4xyz', password: DEMO_PASSWORD, role: 'user', displayName: '沪上小周' },
  { username: 'bh8abc', password: DEMO_PASSWORD, role: 'user', displayName: '滇西阿木' },
  { username: 'ja1abc', password: DEMO_PASSWORD, role: 'user', displayName: '山田太郎' },
  { username: 'k2xyz', password: DEMO_PASSWORD, role: 'user', displayName: 'John Miller' },
];

module.exports = { seed, DEMO_ACCOUNTS, DEMO_PASSWORD, ADMIN_PASSWORD };

