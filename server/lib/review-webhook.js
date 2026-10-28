'use strict';

function readReviewWebhookUrl(env = process.env) {
  const value = (env.QSL_REVIEW_WEBHOOK_URL || '').trim();
  if (!value) return '';
  const invalid = () => new Error('QSL_REVIEW_WEBHOOK_URL 必须是 HTTP(S) 地址，且不含用户名、密码或片段');
  let url;
  try { url = new URL(value); } catch { throw invalid(); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw invalid();
  return url.href;
}

// WeCom also parses <@userid> inside text; user fields must not add mentions.
function line(value, limit = 100) {
  return Array.from(String(value || '').replace(/[\r\n\t\u0000-\u001f\u007f]/g, ' ')
    .replace(/</g, '＜').replace(/>/g, '＞')).slice(0, limit).join('');
}

function createReviewWebhookTransport(url, { fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  if (!url) return null;
  return async notification => {
    const content = [
      'QSLink 卡片待审核',
      '提交类型：' + (notification.reason === 'created' ? '新卡片' : '重新送审'),
      '卡片：' + line(notification.title),
      '呼号：' + line(notification.callSign || '未填写'),
      '提交者：' + line(notification.ownerName),
      '卡片 ID：' + line(notification.cardId),
      notification.url ? '审核入口：' + notification.url : '请登录 QSLink 管理后台审核卡片。',
    ].join('\n');
    // WeCom text messages are limited to 2048 UTF-8 bytes.
    if (Buffer.byteLength(content, 'utf8') > 2048) throw new Error('Webhook message too long');
    const text = { content };
    const response = await fetchImpl(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text }),
      redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      if (response.body) await response.body.cancel();
      throw new Error('Webhook HTTP failure');
    }
    const result = await response.json();
    if (!result || result.errcode !== 0) throw new Error('Webhook receiver failure');
  };
}

function reviewAfterCommit(ctx, card, reason) {
  if (card.status !== 'pending' || !ctx.config.sendReviewWebhook) return undefined;
  const owner = ctx.db.find('users', user => user.id === card.ownerId);
  // Only a minimal snapshot leaves the site; no email, address, image or share token.
  const notification = {
    reason, cardId: card.id, title: card.title, callSign: card.callSign,
    ownerName: owner && (owner.displayName || owner.username) || '',
    url: ctx.config.publicOrigin ? ctx.config.publicOrigin + '/admin?tab=cards' : null,
  };
  return async () => {
    try { await ctx.config.sendReviewWebhook(notification); }
    catch {
      // Never log the endpoint/key, user data, response or provider error.
      console.warn('[webhook] 卡片审核提醒发送失败');
    }
  };
}

module.exports = { readReviewWebhookUrl, createReviewWebhookTransport, reviewAfterCommit };
