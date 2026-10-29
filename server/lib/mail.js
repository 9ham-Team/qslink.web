'use strict';

const DM = require('@alicloud/dm20151123');
const { Config } = require('@alicloud/openapi-client');
const { RuntimeOptions } = require('@alicloud/tea-util');
const { ApiError } = require('./errors');
const { validateEmail } = require('./validate');

const ENDPOINTS = {
  'cn-hangzhou': 'dm.aliyuncs.com',
  'ap-southeast-1': 'dm.ap-southeast-1.aliyuncs.com',
  'ap-southeast-2': 'dm.ap-southeast-2.aliyuncs.com',
  'us-east-1': 'dm.us-east-1.aliyuncs.com',
  'eu-central-1': 'dm.eu-central-1.aliyuncs.com',
};

function readMailConfig(env) {
  const region = env.QSL_MAIL_REGION || 'cn-hangzhou';
  const endpoint = env.QSL_MAIL_ENDPOINT || ENDPOINTS[region];
  if (!Object.hasOwn(ENDPOINTS, region) || endpoint !== ENDPOINTS[region])
    throw new Error('QSL_MAIL_REGION / QSL_MAIL_ENDPOINT 不在 Direct Mail 白名单中');
  const from = env.QSL_MAIL_FROM ? validateEmail(env.QSL_MAIL_FROM) : '';
  const fromName = env.QSL_MAIL_FROM_NAME || 'QSLink';
  if (fromName.length > 60 || /[\r\n]/.test(fromName)) throw new Error('QSL_MAIL_FROM_NAME 无效');
  return { region, endpoint, from, fromName,
    accessKeyId: env.ALIBABA_CLOUD_ACCESS_KEY_ID || '',
    accessKeySecret: env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || '' };
}

function unavailable() {
  return new ApiError(503, 'MAIL_UNAVAILABLE', '验证码邮件暂时无法发送，请稍后重试');
}

function createMessageTransport(config) {
  if (!config.from || !config.accessKeyId || !config.accessKeySecret) return null;
  const client = new DM.default(new Config({
    accessKeyId: config.accessKeyId, accessKeySecret: config.accessKeySecret,
    regionId: config.region, endpoint: config.endpoint, protocol: 'https',
  }));
  return async (email, message) => {
    await client.singleSendMailWithOptions(new DM.SingleSendMailRequest({
      accountName: config.from, addressType: 1, replyToAddress: false,
      fromAlias: config.fromName, toAddress: email,
      ...message,
    }), new RuntimeOptions({ connectTimeout: 5000, readTimeout: 10000, autoretry: false }));
  };
}

function createMailTransport(config) {
  const send = createMessageTransport(config);
  if (!send) return null;
  return async (email, code) => {
    await send(email, {
      subject: 'QSLink 注册邮箱验证码',
      textBody: `完成邮箱验证\n\n您正在注册 QSLink。请在您打开的注册页面中输入以下验证码，以完成邮箱验证并创建账号。\n\n${code}\n\n此验证码将在 30 分钟后过期，仅可使用一次。\n请勿将验证码透露给他人。如果您没有尝试注册 QSLink，可以安全地忽略此邮件。`,
      htmlBody: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>完成邮箱验证 · QSLink</title>
<style>
body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
@media only screen and (max-width:520px) {
  .mail-wrap { padding:16px 12px !important; }
  .mail-card { padding:24px 20px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background-color:#f7f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',Helvetica,Arial,sans-serif;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">您的 QSLink 注册验证码将在 30 分钟后过期。如非本人操作，请忽略此邮件。</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f7f7f4">
<tr><td class="mail-wrap" align="center" style="padding:32px 16px 24px;">
<!--[if mso]><table role="presentation" width="642" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:642px;border-collapse:separate;">
<tr><td class="mail-card" bgcolor="#ffffff" style="padding:32px 40px 36px;border:1px solid #e1e1e1;border-radius:12px;color:#1f1f1f;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td style="padding:0 0 24px;font-size:24px;font-weight:700;line-height:32px;letter-spacing:-0.5px;">QSLink</td></tr>
<tr><td style="padding:0 0 16px;"><h1 style="margin:0;font-size:24px;font-weight:600;line-height:32px;">完成邮箱验证</h1></td></tr>
<tr><td style="padding:0 0 24px;font-size:16px;line-height:26px;">您正在注册 QSLink。请在您打开的注册页面中输入以下验证码，以完成邮箱验证并创建账号。</td></tr>
<tr><td style="padding:0 0 32px;font-size:28px;font-weight:400;letter-spacing:4px;line-height:36px;">${code}</td></tr>
<tr><td style="border-top:1px solid #d9d9d9;padding:28px 0 0;font-size:12px;line-height:20px;color:#636363;">此验证码将在 <strong>30 分钟</strong>后过期，仅可使用一次。</td></tr>
<tr><td style="padding:12px 0 0;font-size:12px;line-height:20px;color:#636363;">请勿将验证码透露给他人。如果您没有尝试注册 QSLink，可以安全地忽略此邮件。</td></tr>
</table>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`,
    });
  };
}

function notificationMessage({ title, summary, instruction, buttonLabel, footer, url }) {
  const escape = value => String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
  return {
    subject: 'QSLink ' + title,
    textBody: `${title}\n\n${summary}\n${instruction}\n${url}\n\n${footer}`,
    htmlBody: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#f7f7f4;font-family:'Microsoft YaHei',Arial,sans-serif;color:#1f1f1f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e1e1e1;border-radius:12px"><tr><td style="padding:28px 24px;overflow-wrap:anywhere">
<p style="font-size:24px;font-weight:bold">QSLink</p><h1 style="font-size:22px">${escape(title)}</h1>
<p style="line-height:1.8">${escape(summary)}</p>
<p style="line-height:1.8">${escape(instruction)}</p>
<p style="padding:12px 0"><a href="${escape(url)}" style="background:#0a816e;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${escape(buttonLabel)}</a></p>
<p style="font-size:12px;line-height:1.8;color:#636363">如果按钮无法打开，请复制链接到浏览器：<br>${escape(url)}</p>
<p style="border-top:1px solid #e1e1e1;padding-top:16px;font-size:12px;line-height:1.8;color:#636363">${escape(footer)}</p>
</td></tr></table></td></tr></table></body></html>`,
  };
}

function exchangeRequestMessage({ applicantName, callSign, cardTitle, url, contactLogCount }) {
  const applicant = applicantName + (callSign ? `（${callSign}）` : '');
  return notificationMessage({
    title: '收到新的换卡申请',
    summary: `${applicant} 希望与您交换卡片「${cardTitle}」。`,
    instruction: (contactLogCount > 0 ? `申请人附上了 ${contactLogCount} 条通联记录，请自行核对。` : '') + '请登录 QSLink，在“收到的申请”中查看并处理。',
    buttonLabel: '查看收到的申请',
    footer: '此邮件仅为申请提醒，不代表您已同意交换。寄送地址仅在双方同意后可见。',
    url,
  });
}

function exchangeDecisionMessage({ status, ownerName, callSign, cardTitle, url }) {
  const approved = status === 'approved';
  const owner = ownerName + (callSign ? `（${callSign}）` : '');
  return notificationMessage({
    title: approved ? '换卡申请已被同意' : '换卡申请已被拒绝',
    summary: `${owner} ${approved ? '同意' : '拒绝'}了您对卡片「${cardTitle}」的换卡申请。`,
    instruction: approved ? '请登录 QSLink，在“我发出的申请”中查看寄送信息并安排换卡。' : '请登录 QSLink，在“我发出的申请”中查看详情及可能的拒绝原因。',
    buttonLabel: '查看我发出的申请',
    footer: '寄送地址及申请私信不会通过邮件发送，请登录 QSLink 查看有权访问的信息。',
    url,
  });
}

function createExchangeMailTransport(config) {
  const send = createMessageTransport(config);
  return send ? (email, notification) => send(email,
    ['approved', 'rejected'].includes(notification.status) ? exchangeDecisionMessage(notification) : exchangeRequestMessage(notification)) : null;
}

function cardApprovedMessage({ cardTitle, url }) {
  return notificationMessage({
    title: '卡片审核已通过',
    summary: `您的卡片「${cardTitle}」已通过审核，现已公开展示。`,
    instruction: '您可以查看卡片、分享给朋友，或等待其他成员发起换卡申请。',
    buttonLabel: '查看我的卡片',
    footer: '此邮件仅通知卡片审核结果，不代表已达成换卡。请在 QSLink 站内处理换卡申请。',
    url,
  });
}

function createCardReviewMailTransport(config) {
  const send = createMessageTransport(config);
  return send ? (email, notification) => send(email, cardApprovedMessage(notification)) : null;
}

module.exports = { readMailConfig, createMailTransport, createExchangeMailTransport, createCardReviewMailTransport, cardApprovedMessage, exchangeRequestMessage, unavailable };
