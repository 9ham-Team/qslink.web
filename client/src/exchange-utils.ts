import type {
  AddressVue3,
  ContactLogSummaryVue3,
  PublicUserVue3,
} from './contracts';

export function displayNameVue3(user: PublicUserVue3 | null | undefined, t: (s: string) => string): string {
  if (!user) return t('未知用户');
  return user.displayName || user.username || t('未知用户');
}

export function personLabelVue3(user: PublicUserVue3 | null | undefined, t: (s: string) => string): string {
  if (!user) return t('未知用户');
  return displayNameVue3(user, t) + (user.callSign ? '（' + user.callSign + '）' : '');
}

export function formatUtcQsoTimeVue3(raw: string | undefined): string {
  return String(raw || '').replace('T', ' ').replace(/\.000Z$/, ' UTC');
}

export function formatContactLogPairsVue3(
  row: ContactLogSummaryVue3,
  t: (s: string) => string,
): Array<[string, string]> {
  const fields: Array<[string, string | undefined]> = [
    ['UTC', formatUtcQsoTimeVue3(row.qsoAt || row.workedAt || row.utcTime)],
    [t('本站'), row.stationCallSign],
    [t('对方'), row.callSign],
    [t('波段'), row.band],
    [t('模式'), row.mode],
    [t('子模式'), row.submode],
    [t('频率 MHz'), row.frequency],
    [t('发送信号'), row.rstSent],
    [t('接收信号'), row.rstReceived],
    [t('姓名'), row.name],
    [t('国家'), row.country],
    [t('网格'), row.grid],
    [t('传播'), row.propagation],
    [t('卫星'), row.satellite],
    [t('来源'), row.source],
  ];
  return fields.filter((pair): pair is [string, string] => !!pair[1]);
}

export function formatAddressTextVue3(address: AddressVue3 | null | undefined): string {
  if (!address) return '';
  const lines: string[] = [];
  const head = [address.name, address.phone].filter(Boolean).join(' ');
  if (head) lines.push(head);
  const region = [address.province, address.city, address.line1].filter(Boolean).join(' ');
  if (region) lines.push(region);
  const tail = [address.postalCode, address.country].filter(Boolean).join(' · ');
  if (tail) lines.push(tail);
  return lines.join('\n');
}

export function exchangeStatusToneVue3(status: string): 'mint' | 'sky' | 'amber' | 'rose' | 'slate' {
  switch (status) {
    case 'approved':
      return 'mint';
    case 'completed':
      return 'sky';
    case 'pending':
      return 'amber';
    case 'rejected':
      return 'rose';
    default:
      return 'slate';
  }
}

export function isSecureLotwOriginVue3(
  loc: { protocol: string; hostname: string } = typeof location !== 'undefined'
    ? location
    : { protocol: 'https:', hostname: 'localhost' },
): boolean {
  return loc.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(loc.hostname);
}

export function decodeAdifUtf8Vue3(bytes: ArrayBuffer, t: (s: string) => string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(t('无法读取 UTF-8 文件，请从日志软件重新导出 ADI / ADIF'));
  }
}

export function encodeTq8Base64Vue3(bytes: ArrayBuffer): string {
  const data = new Uint8Array(bytes);
  const chunks: string[] = [];
  for (let i = 0; i < data.length; i += 32768) {
    chunks.push(String.fromCharCode(...data.subarray(i, i + 32768)));
  }
  return btoa(chunks.join(''));
}
