'use strict';

const { badRequest, payloadTooLarge } = require('./errors');
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_RECORDS = 10000;
const fail = () => badRequest({ adif: 'ADIF 字段格式或长度有误，请重新导出 .adi 文件' });

// Read declared character lengths; embedded tags in values are ordinary text.
function parseAdif(text) {
  if (typeof text !== 'string' || !text.trim()) throw badRequest({ adif: '请选择 ADIF 文件' });
  if (Buffer.byteLength(text) > MAX_BYTES) throw payloadTooLarge('ADIF 文件不能超过 5MB');
  const records = [];
  let record = Object.create(null), pos = 0, sawHeader = false, eof = false;
  while (pos < text.length) {
    const start = text.indexOf('<', pos);
    if (start < 0) break;
    const end = text.indexOf('>', start);
    if (end < 0 || end - start > 100) throw fail();
    const tag = text.slice(start + 1, end).trim().toUpperCase();
    pos = end + 1;
    if (tag === 'EOH') {
      if (sawHeader || records.length) throw fail();
      sawHeader = true;
      record = Object.create(null);
    } else if (tag === 'EOR') {
      if (eof) throw fail();
      records.push(record);
      record = Object.create(null);
      if (records.length > MAX_RECORDS) throw payloadTooLarge('每次最多导入 10000 条通联，请分批导出');
    } else if (tag === 'APP_LOTW_EOF') {
      eof = true;
    } else {
      const match = /^([A-Z][A-Z0-9_]*):(\d+)(?::[A-Z])?$/.exec(tag);
      if (!match || eof) throw fail();
      const length = Number(match[2]);
      if (!Number.isSafeInteger(length) || length > MAX_BYTES) throw fail();
      const valueStart = pos;
      for (let i = 0; i < length; i++) {
        if (pos >= text.length) throw fail();
        pos += text.codePointAt(pos) > 0xffff ? 2 : 1;
      }
      record[match[1]] = text.slice(valueStart, pos).trim();
    }
  }
  if (Object.keys(record).length) throw fail();
  if (!records.length && !sawHeader) throw fail();
  return { records, eof };
}

function normalizeRecord(raw, source) {
  const get = (key, max = 80) => {
    const value = raw[key] || '';
    if (value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('字段过长或含控制字符');
    return value;
  };
  const callSign = get('CALL', 32).toUpperCase();
  const stationCallSign = get('STATION_CALLSIGN', 32).toUpperCase();
  const date = get('QSO_DATE');
  const time = get('TIME_ON');
  const band = get('BAND', 16).toUpperCase();
  const mode = (get('MODE', 32) || get('APP_LOTW_MODE', 32)).toUpperCase();
  const submode = get('SUBMODE', 32).toUpperCase();
  if (!/^[A-Z0-9/]+$/.test(callSign) || !/\d/.test(callSign) || !/^[0-9]{8}$/.test(date) || !/^(?:[0-9]{4}|[0-9]{6})$/.test(time) || !band || !mode) {
    throw new Error('缺少或无效的 CALL、QSO_DATE、TIME_ON、BAND、MODE');
  }
  const padded = time.padEnd(6, '0');
  const iso = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T${padded.slice(0,2)}:${padded.slice(2,4)}:${padded.slice(4,6)}.000Z`;
  if (!Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString() !== iso) throw new Error('UTC 日期或时间无效');
  return {
    callSign, stationCallSign, qsoAt: iso, band, mode, submode,
    frequency: get('FREQ', 24), rstSent: get('RST_SENT', 16), rstReceived: get('RST_RCVD', 16),
    name: get('NAME', 120), country: get('COUNTRY', 120), grid: get('GRIDSQUARE', 16).toUpperCase(),
    propagation: get('PROP_MODE', 16).toUpperCase(), satellite: get('SAT_NAME', 32).toUpperCase(),
    lotwConfirmed: (source === 'lotw' ? get('QSL_RCVD') : get('LOTW_QSL_RCVD')).toUpperCase() === 'Y',
    source,
  };
}

module.exports = { parseAdif, normalizeRecord, MAX_BYTES, MAX_RECORDS };
