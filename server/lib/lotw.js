'use strict';
const { ApiError, badRequest, payloadTooLarge } = require('./errors');
const { MAX_BYTES, parseAdif } = require('./adif');

async function downloadLotw(body, fetcher = fetch) {
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const fields = {};
  if (!username || username.length > 80 || /[\u0000-\u001f]/.test(username)) fields.username = '请输入 LoTW 用户名（最多 80 字符）';
  if (!password || password.length > 256) fields.password = '请输入 LoTW 网站登录密码（最多 256 字符）';
  if (Object.keys(fields).length) throw badRequest(fields);
  const url = new URL('https://lotw.arrl.org/lotwuser/lotwreport.adi');
  url.search = new URLSearchParams({ login: username, password, qso_query: '1', qso_qsl: 'no', qso_qsorxsince: '1900-01-01', qso_withown: 'yes', qso_qsldetail: 'yes', qso_mydetail: 'yes' }).toString();
  try {
    const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(30000), headers: { Accept: 'text/plain' } });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ApiError(502, 'LOTW_UNAVAILABLE', 'LoTW 请求失败，请检查账号密码或稍后重试');
    }
    if (Number(response.headers.get('content-length')) > MAX_BYTES) {
      await response.body?.cancel();
      throw payloadTooLarge('LoTW 日志超过 5MB，请在 LoTW 分批导出 ADIF 文件后导入');
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_BYTES) throw payloadTooLarge('LoTW 日志超过 5MB，请分批导出 ADIF 文件后导入');
      chunks.push(Buffer.from(chunk));
    }
    const text = Buffer.concat(chunks).toString('utf8');
    // Do not echo LoTW errors or request URLs: they may contain credentials.
    let parsed;
    try { parsed = parseAdif(text); } catch (err) {
      if (err.status === 413) throw payloadTooLarge('LoTW 日志超过导入限制，请分批导出 ADIF 文件后导入');
      throw new ApiError(502, 'LOTW_RESPONSE', 'LoTW 未返回完整日志，请检查账号密码或稍后重试');
    }
    if (!parsed.eof) throw new ApiError(502, 'LOTW_RESPONSE', 'LoTW 日志不完整，请稍后重试或手动导入 ADIF');
    return parsed;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(502, 'LOTW_UNAVAILABLE', '连接 LoTW 失败或超时，请稍后重试');
  }
}
module.exports = { downloadLotw };
