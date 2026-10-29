'use strict';
const fs = require('fs');
const path = require('path');
const { gunzipSync } = require('zlib');
const { X509Certificate, verify } = require('crypto');
const { badRequest, payloadTooLarge } = require('./errors');
const { MAX_RECORDS, normalizeRecord } = require('./adif');

const MAX_COMPRESSED = 5 * 1024 * 1024;
const MAX_EXPANDED = 20 * 1024 * 1024;
const fail = message => badRequest({ tq8: message || 'TQ8 文件格式有误，请用 TQSL 重新签名并保存' });
function loadCertificates(file) {
  return fs.readFileSync(path.join(__dirname, '../certs', file), 'utf8')
    .match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g).map(pem => new X509Certificate(pem));
}
const trust = { roots: loadCertificates('lotw-roots.pem'), intermediates: loadCertificates('lotw-intermediates.pem') };
const contactFields = ['BAND', 'BAND_RX', 'CALL', 'FREQ', 'FREQ_RX', 'MODE', 'PROP_MODE', 'QSO_DATE', 'QSO_TIME', 'SAT_NAME'];
const stationFields = {
  '1.0': ['CA_PROVINCE', 'CA_US_PARK', 'CQZ', 'DX_US_PARK', 'GRIDSQUARE', 'IOTA', 'ITUZ', 'US_COUNTY', 'US_PARK', 'US_STATE'],
  '2.0': ['AU_STATE', 'CA_PROVINCE', 'CA_US_PARK', 'CN_PROVINCE', 'CQZ', 'DX_US_PARK', 'FI_KUNTA', 'GRIDSQUARE', 'IOTA', 'ITUZ', 'JA_CITY_GUN_KU', 'JA_PREFECTURE', 'RU_OBLAST', 'US_COUNTY', 'US_PARK', 'US_STATE'],
};
function base64(value, limit) {
  if (typeof value !== 'string' || !value) throw fail();
  if (value.length > Math.ceil(limit / 3) * 4 + 4096) throw payloadTooLarge('TQ8 内容超过大小限制');
  const clean = value.replace(/[\t\r\n ]/g, '');
  if (clean.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw fail();
  const data = Buffer.from(clean, 'base64');
  if (data.length > limit) throw payloadTooLarge('TQ8 内容超过大小限制');
  if (!data.length || data.toString('base64') !== clean) throw fail();
  return data;
}

// GABBI uses byte lengths and permits '.' in signature field names and ':6' data types.
function gabbi(data) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  const records = [];
  let pos = 0, record = Object.create(null), ident = false;
  while (pos < data.length) {
    if (/\s/.test(String.fromCharCode(data[pos]))) { pos++; continue; }
    if (data[pos] !== 60) throw fail();
    const end = data.indexOf(62, pos);
    if (end < 0 || end - pos > 100) throw fail();
    const tag = data.subarray(pos + 1, end).toString('ascii').toUpperCase();
    pos = end + 1;
    if (tag === 'EOR') {
      if (!record.REC_TYPE) throw fail();
      records.push(record); record = Object.create(null);
      if (records.length > MAX_RECORDS + 320) throw payloadTooLarge('TQ8 记录数量超限');
      continue;
    }
    const match = /^([A-Z][A-Z0-9_.]*):(\d+)(?::[A-Z0-9])?$/.exec(tag);
    if (!match) throw fail();
    const length = Number(match[2]);
    if (!Number.isSafeInteger(length) || length > MAX_EXPANDED || pos + length > data.length) throw fail();
    const value = new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(pos, pos + length));
    pos += length;
    if (match[1] === 'TQSL_IDENT') {
      if (ident || records.length || Object.keys(record).length || !value.trim()) throw fail();
      ident = true;
    } else {
      if (!ident || Object.hasOwn(record, match[1]) || Object.keys(record).length >= 80) throw fail();
      record[match[1]] = value;
    }
  }
  if (!ident || Object.keys(record).length || !records.length || text.includes('\0')) throw fail();
  return records;
}
function uid(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,8})$/.test(value)) throw fail('TQ8 的证书或台站引用无效');
  return value;
}
function validNow(cert) {
  return Date.parse(cert.validFrom) <= Date.now() && Date.now() <= Date.parse(cert.validTo);
}
function certificate(raw, authorities) {
  const cert = new X509Certificate(base64(raw, 16384));
  if (cert.ca || cert.publicKey.asymmetricKeyType !== 'rsa' || !validNow(cert)) throw fail('签名证书无效或已过期，请使用有效呼号证书重新签名');
  const chain = authorities.intermediates.some(intermediate => intermediate.ca && validNow(intermediate) && cert.checkIssued(intermediate) && cert.verify(intermediate.publicKey) &&
    authorities.roots.some(root => root.ca && validNow(root) && intermediate.checkIssued(root) && intermediate.verify(root.publicKey)));
  if (!chain) throw fail('签名证书不属于受信任的 ARRL LoTW 证书链');
  // ARRL's AROcallsign OID, never the free-text common name or station record.
  const matches = [...cert.subject.matchAll(/^1\.3\.6\.1\.4\.1\.12348\.1\.1=(.*)$/gm)];
  const callSign = matches.length === 1 ? matches[0][1].trim().toUpperCase() : '';
  if (!/^[A-Z0-9/]{1,32}$/.test(callSign) || !/\d/.test(callSign)) throw fail('签名证书中缺少有效的呼号');
  return { cert, callSign };
}
function canonical(record, fields) {
  return fields.map(field => {
    const value = (record[field] || '').trim();
    if (/[\u0000-\u001f\u007f]/.test(value)) throw fail();
    // Signed zone values are normalized as integers by TQSL.
    if (value && ['CQZ', 'ITUZ'].includes(field)) {
      if (!/^\d+$/.test(value)) throw fail();
      return String(Number(value));
    }
    return value;
  }).join('');
}

function parseTq8(encoded, expectedCallSign, authorities = trust) {
  try {
    const compressed = base64(encoded, MAX_COMPRESSED);
    if (compressed[0] !== 0x1f || compressed[1] !== 0x8b) throw fail('请选择 TQSL 签名生成的 .tq8 文件，不接受 ADI 文本或改名文件');
    let data;
    try { data = gunzipSync(compressed, { maxOutputLength: MAX_EXPANDED }); }
    catch (err) {
      if (err.code === 'ERR_BUFFER_TOO_LARGE') throw payloadTooLarge('TQ8 解压后不能超过 20MB');
      throw fail('TQ8 压缩数据损坏或不完整');
    }
    const certs = new Map(), stations = new Map(), contacts = [];
    for (const record of gabbi(data)) {
      const type = record.REC_TYPE.toUpperCase();
      if (type === 'TCERT') {
        const id = uid(record.CERT_UID);
        if (certs.has(id) || certs.size >= 64) throw fail('TQ8 证书编号重复或数量超限');
        const entry = certificate(record.CERTIFICATE, authorities);
        if (entry.callSign !== expectedCallSign.trim().toUpperCase()) throw fail('TQ8 签名证书呼号与个人资料中的呼号不一致，整批未导入');
        certs.set(id, entry);
      } else if (type === 'TSTATION') {
        const id = uid(record.STATION_UID);
        if (stations.has(id) || stations.size >= 256 || !certs.has(uid(record.CERT_UID))) throw fail('TQ8 台站编号重复或引用了不存在的证书');
        const entry = certs.get(record.CERT_UID);
        for (const key of ['CALL', 'STATION_CALLSIGN']) if (record[key] && record[key].trim().toUpperCase() !== entry.callSign) throw fail('TQ8 台站呼号与签名证书不一致');
        stations.set(id, record);
      } else if (type === 'TCONTACT') {
        const station = stations.get(uid(record.STATION_UID));
        if (!station) throw fail('TQ8 通联引用了不存在的台站');
        const entry = certs.get(station.CERT_UID);
        const keys = Object.keys(record).filter(key => key.startsWith('SIGN_'));
        const version = keys.length === 1 && /^SIGN_LOTW_V?([12]\.0)$/.exec(keys[0]);
        if (!version) throw fail('缺少签名或签名版本不受支持，请用当前 TQSL 重新签名');
        const signed = (canonical(station, stationFields[version[1]]) + canonical(record, contactFields)).toUpperCase();
        if (signed !== record.SIGNDATA || !verify('sha1', Buffer.from(signed, 'utf8'), entry.cert.publicKey, base64(record[keys[0]], 1024))) throw fail(`第 ${contacts.length + 1} 条通联签名校验失败，文件可能已被修改，整批未导入`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(record.QSO_DATE || '') || !/^\d{2}:\d{2}:\d{2}Z?$/.test(record.QSO_TIME || '')) throw fail('TQ8 通联日期或时间格式无效');
        // Only import signature-covered fields. A TQ8 submission is not a LoTW confirmation.
        const normalized = {
          CALL: record.CALL, STATION_CALLSIGN: entry.callSign, BAND: record.BAND, MODE: record.MODE,
          // TQSL may append UTC 'Z'. Keep it in the verified signature text above,
          // and remove it only when adapting the verified value to ADIF TIME_ON.
          QSO_DATE: (record.QSO_DATE || '').replace(/-/g, ''), TIME_ON: (record.QSO_TIME || '').replace(/Z$/, '').replace(/:/g, ''),
          FREQ: record.FREQ, PROP_MODE: record.PROP_MODE, SAT_NAME: record.SAT_NAME,
        };
        normalizeRecord(normalized, 'tq8'); // Reject malformed QSOs before any database writes.
        contacts.push(normalized);
        if (contacts.length > MAX_RECORDS) throw payloadTooLarge('每次最多导入 10000 条通联，请分批签名');
      } else throw fail('TQ8 包含不受支持的记录类型');
    }
    if (!contacts.length) throw fail('TQ8 中没有可导入的已签名通联');
    return { records: contacts };
  } catch (err) {
    if (err.status) throw err;
    throw fail('TQ8 文件、证书或签名无效，请用 TQSL 重新签名');
  }
}
module.exports = { parseTq8, MAX_COMPRESSED, MAX_EXPANDED };
