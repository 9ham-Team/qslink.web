'use strict';

/**
 * 统一 API 错误。
 * 路由处理器中 throw ApiError，由 server.js 统一捕获并序列化为：
 * { "error": { "message": "...", "code": "...", "fields": { ... } } }
 */
class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (fields && Object.keys(fields).length) this.fields = fields;
  }
}

/** 400 参数校验失败；fields 用于前端逐字段提示 */
function badRequest(fields, message = '提交的内容有误，请检查后重试') {
  return new ApiError(400, 'VALIDATION', message, fields);
}

/** 401 未登录 / token 失效 */
function unauthorized(message = '请先登录') {
  return new ApiError(401, 'UNAUTHORIZED', message);
}

/** 401 账号或密码错误 */
function invalidCredentials(message = '用户名或密码不正确') {
  return new ApiError(401, 'INVALID_CREDENTIALS', message);
}

/** 403 已登录但无权限 */
function forbidden(message = '没有权限执行此操作') {
  return new ApiError(403, 'FORBIDDEN', message);
}

/** 403 账号被禁用 */
function banned(message = '账号已被禁用，请联系管理员') {
  return new ApiError(403, 'BANNED', message);
}

/** 404 资源不存在 */
function notFound(message = '资源不存在') {
  return new ApiError(404, 'NOT_FOUND', message);
}

/** 405 方法不允许 */
function methodNotAllowed(message = '不支持的请求方法') {
  return new ApiError(405, 'METHOD_NOT_ALLOWED', message);
}

/** 409 业务冲突（如用户名占用、重复申请） */
function conflict(code, message, fields) {
  return new ApiError(409, code || 'CONFLICT', message, fields);
}

/** 413 请求体 / 图片过大 */
function payloadTooLarge(message = '上传内容过大') {
  return new ApiError(413, 'PAYLOAD_TOO_LARGE', message);
}

module.exports = {
  ApiError,
  badRequest,
  unauthorized,
  invalidCredentials,
  forbidden,
  banned,
  notFound,
  methodNotAllowed,
  conflict,
  payloadTooLarge,
};
