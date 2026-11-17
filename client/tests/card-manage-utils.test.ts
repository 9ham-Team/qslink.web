import { describe, expect, it } from 'vitest';
import {
  codePointLengthVue3,
  formatFileSizeVue3,
  parseStockInputVue3,
  sanitizeRatioInputVue3,
  validateImageFileVue3,
} from '../src/card-manage-utils';

const t = (s: string) => s;

describe('card-manage-utils', () => {
  it('counts Unicode code points rather than UTF-16 code units', () => {
    const emojiTitle = '📻'.repeat(60);
    expect(emojiTitle.length).toBe(120);
    expect(codePointLengthVue3(emojiTitle)).toBe(60);
    expect(codePointLengthVue3('BG4JEC 🇨🇳')).toBe(9);
  });

  it('parses stock values strictly for null, 0, and 0..2147483647 integers', () => {
    expect(parseStockInputVue3('')).toEqual({ ok: true, value: null });
    expect(parseStockInputVue3('   ')).toEqual({ ok: true, value: null });
    expect(parseStockInputVue3('0')).toEqual({ ok: true, value: 0 });
    expect(parseStockInputVue3('2147483647')).toEqual({ ok: true, value: 2147483647 });
    expect(parseStockInputVue3('2147483648')).toEqual({ ok: false });
    expect(parseStockInputVue3('-1')).toEqual({ ok: false });
    expect(parseStockInputVue3('1.5')).toEqual({ ok: false });
    expect(parseStockInputVue3('1e2')).toEqual({ ok: false });
    expect(parseStockInputVue3('abc')).toEqual({ ok: false });
    expect(parseStockInputVue3('', true)).toEqual({ ok: false });
  });

  it('validates image type, non-empty size, and 8MB upper bound', () => {
    expect(validateImageFileVue3(null, t)).toBe('没有读取到文件');
    expect(validateImageFileVue3({ type: 'image/gif', name: 'a.gif', size: 100 }, t)).toBe('仅支持 PNG / JPG / WebP 格式的图片');
    expect(validateImageFileVue3({ type: 'image/png', name: 'a.png', size: 0 }, t)).toBe('图片文件为空，请重新选择');
    expect(validateImageFileVue3({ type: 'image/webp', name: 'a.webp', size: 8 * 1024 * 1024 + 1 }, t)).toContain('图片超过 8MB');
    expect(validateImageFileVue3({ type: 'image/jpeg', name: 'a.jpg', size: 1024 }, t)).toBe('');
    expect(formatFileSizeVue3(512)).toBe('512 B');
    expect(formatFileSizeVue3(2048)).toBe('2 KB');
  });

  it('sanitizes ratio inputs to 1..1000 integers', () => {
    expect(sanitizeRatioInputVue3('3')).toBe(3);
    expect(sanitizeRatioInputVue3('1000')).toBe(1000);
    expect(sanitizeRatioInputVue3('0')).toBeNull();
    expect(sanitizeRatioInputVue3('1001')).toBeNull();
    expect(sanitizeRatioInputVue3('abc')).toBeNull();
  });
});
