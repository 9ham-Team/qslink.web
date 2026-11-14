import type {
  AddressVue3,
  ContactLogSummaryVue3,
  ExchangeItemVue3,
  LegacyQslVue3,
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

export function submittedLogsHtmlVue3(
  ex: ExchangeItemVue3 | null | undefined,
  qsl: Pick<LegacyQslVue3, 't' | 'escapeHtml' | 'icon'>,
): string {
  const rows = ex && Array.isArray(ex.selectedContactLogs) ? ex.selectedContactLogs : [];
  if (!rows.length) return '';
  const esc = qsl.escapeHtml;
  const ico = typeof qsl.icon === 'function' ? qsl.icon('clock', 15) : '';
  const summaryPrefix =
    ex?.direction === 'incoming' ? qsl.t('申请人附上的通联记录') : qsl.t('本次申请附上的通联记录');
  const itemsHtml = rows
    .map(row => {
      const pairs = formatContactLogPairsVue3(row, qsl.t)
        .map(([k, v]) => '<span><b>' + esc(k) + '</b> ' + esc(v) + '</span>')
        .join('');
      const confirmedText = row.lotwConfirmed ? qsl.t('是') : qsl.t('否');
      return (
        '<li><span class="f-ex-log-record">' +
        pairs +
        '<span>' +
        esc(qsl.t('LoTW 确认：')) +
        esc(confirmedText) +
        '</span></span></li>'
      );
    })
    .join('');

  return (
    '<details class="f-ex-submitted-logs"><summary>' +
    ico +
    esc(summaryPrefix) +
    '（' +
    rows.length +
    ' ' +
    esc(qsl.t('条）')) +
    '</summary><p class="muted">' +
    esc(qsl.t('由申请人自主选择，请自行核对。')) +
    '</p><ol>' +
    itemsHtml +
    '</ol></details>'
  );
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
