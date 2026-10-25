'use strict';

const { badRequest } = require('./errors');
const VERSION = '2026-10-25';

// Only an explicit boolean and the displayed version count as acceptance.
// Keep legacy records null; never infer consent from login or continued use.
function requireAcceptance(body, content = false) {
  if (!body || body.acceptTerms !== true || body.termsVersion !== VERSION ||
      (content && body.acceptContentLicense !== true)) {
    throw badRequest({ legalConsent: content
      ? '请阅读用户条款和隐私说明，并确认本次卡片的内容授权'
      : '请阅读并同意用户条款，确认已阅读隐私说明' });
  }
  return { version: VERSION, acceptedAt: new Date().toISOString(),
    ...(content ? { contentLicense: true } : {}) };
}

module.exports = { VERSION, requireAcceptance };
