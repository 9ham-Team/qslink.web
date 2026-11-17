export const CARD_LIMITS_VUE3 = {
  title: 60,
  callSign: 20,
  notes: 300,
  ratio: 1000,
  stockMax: 2147483647,
  contestDescription: 2000,
  maxImageBytes: 8 * 1024 * 1024,
} as const;

export const ALLOWED_IMAGE_TYPES_VUE3 = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const RATIO_PRESETS_VUE3 = [
  { w: 3, h: 2, label: '3 : 2', desc: '横版标准' },
  { w: 2, h: 3, label: '2 : 3', desc: '竖版标准' },
  { w: 4, h: 3, label: '4 : 3', desc: '横版方寸' },
  { w: 16, h: 9, label: '16 : 9', desc: '宽幅风景' },
] as const;

export function codePointLengthVue3(value: string | null | undefined): number {
  return Array.from(String(value ?? '')).length;
}

export function formatFileSizeVue3(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

export function validateImageFileVue3(
  file: Pick<File, 'type' | 'name' | 'size'> | null | undefined,
  t: (source: string) => string,
): string {
  if (!file) return t('没有读取到文件');
  const typeOk =
    (ALLOWED_IMAGE_TYPES_VUE3 as readonly string[]).includes(file.type) ||
    /\.(png|jpe?g|webp)$/i.test(file.name || '');
  if (!typeOk) return t('仅支持 PNG / JPG / WebP 格式的图片');
  if (file.size > CARD_LIMITS_VUE3.maxImageBytes) {
    return t('图片超过 8MB，请压缩后重新上传（当前') + ' ' + formatFileSizeVue3(file.size) + '）';
  }
  if (file.size === 0) return t('图片文件为空，请重新选择');
  return '';
}

export function parseStockInputVue3(
  raw: string | number | null | undefined,
  badInput = false,
): { ok: true; value: number | null } | { ok: false } {
  if (badInput) return { ok: false };
  const trimmed = raw == null ? '' : String(raw).trim();
  if (trimmed === '') return { ok: true, value: null };
  if (!/^\d+$/.test(trimmed)) return { ok: false };
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num) || num < 0 || num > CARD_LIMITS_VUE3.stockMax) {
    return { ok: false };
  }
  return { ok: true, value: num };
}

export function sanitizeRatioInputVue3(raw: string): number | null {
  const cleaned = String(raw).replace(/[^0-9]/g, '');
  if (!cleaned) return null;
  const num = Number.parseInt(cleaned, 10);
  if (!Number.isFinite(num) || num < 1 || num > CARD_LIMITS_VUE3.ratio) return null;
  return num;
}

export function cardUserKeyVue3(user: { id?: string; uid?: string } | null | undefined): string {
  if (!user) return '';
  return String(user.id || user.uid || '');
}
