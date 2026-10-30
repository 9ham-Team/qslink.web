'use strict';

/**
 * 输入校验。所有校验函数返回「规范化后的数据」，失败时 throw 400 VALIDATION，
 * fields 携带逐字段错误（前端用于表单旁提示）。
 */

const { badRequest } = require('./errors');

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const AVATAR_PALETTE = [
  '#0eaf8f', '#38bdf8', '#fb7185', '#f59e0b', '#8b5cf6',
  '#14b8a6', '#ec4899', '#6366f1', '#22c55e', '#f97316',
];

const LIMITS = {
  username: 20,
  email: 120,
  password: 200,
  displayName: 30,
  callSign: 20,
  bio: 200,
  title: 60,
  band: 20,
  mode: 20,
  notes: 300,
  ratio: 1000,
  message: 500,
  rejectReason: 200,
  contactName: 30,
};

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isObj(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 按字符数（而非 UTF-16 码元）计数，中文更准确 */
function size(text) {
  return Array.from(text).length;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function randomAvatarColor() {
  return AVATAR_PALETTE[Math.floor(Math.random() * AVATAR_PALETTE.length)];
}

/** 密码强度：≥8 位且同时包含字母与数字 */
function passwordProblem(password) {
  if (size(password) < 8) return '密码至少需要 8 位';
  if (size(password) > LIMITS.password) return `密码不能超过 ${LIMITS.password} 位`;
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return '密码需同时包含字母和数字';
  return '';
}

function requiredText(value, field, max, label, fields, min = 1) {
  const text = str(value);
  if (size(text) < min || size(text) > max) {
    fields[field] = `${label}需为 ${min}-${max} 个字符`;
  }
  return text;
}

function optionalText(value, field, max, label, fields) {
  const text = str(value);
  if (size(text) > max) fields[field] = `${label}不能超过 ${max} 个字符`;
  return text;
}

function parseRatio(raw, fields, field = 'ratio') {
  if (
    !isObj(raw) ||
    !Number.isInteger(raw.w) ||
    !Number.isInteger(raw.h) ||
    raw.w < 1 || raw.h < 1 ||
    raw.w > LIMITS.ratio || raw.h > LIMITS.ratio
  ) {
    fields[field] = `宽高比需为 { w, h }，取 ${1}-${LIMITS.ratio} 的整数`;
    return { w: 3, h: 2 };
  }
  return { w: raw.w, h: raw.h };
}

/* ---------------- 地址 ---------------- */

/**
 * 校验地址对象。字段错误键形如 address.name / address.line1。
 * 返回 { name, phone, line1, city, province, postalCode, country } 或 null。
 */
function validateAddress(raw, fields, prefix = 'address') {
  if (!isObj(raw)) {
    fields[prefix] = '请填写完整的收件地址';
    return null;
  }
  const out = {};
  const key = (name) => `${prefix}.${name}`;

  out.name = requiredText(raw.name, key('name'), LIMITS.contactName, '收件人姓名', fields);
  out.line1 = requiredText(raw.line1, key('line1'), 100, '详细地址', fields);
  out.city = requiredText(raw.city, key('city'), 50, '城市', fields);
  out.phone = optionalText(raw.phone, key('phone'), 30, '联系电话', fields);
  out.province = optionalText(raw.province, key('province'), 50, '省份', fields);
  out.postalCode = optionalText(raw.postalCode, key('postalCode'), 20, '邮编', fields);
  out.country = optionalText(raw.country, key('country'), 50, '国家/地区', fields) || '中国';

  return out;
}

/* ---------------- 注册 / 登录 ---------------- */

function validateEmail(value) {
  const email = str(value).toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > LIMITS.email)
    throw badRequest({ email: '请输入有效的邮箱地址' });
  return email;
}

function validateRegister(input) {
  const body = isObj(input) ? input : {};
  const fields = {};

  const username = str(body.username);
  if (!USERNAME_RE.test(username)) {
    fields.username = '用户名需为 3-20 位字母、数字或下划线';
  }
  const email = str(body.email).toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > LIMITS.email) {
    fields.email = '请输入有效的邮箱地址';
  }
  const password = typeof body.password === 'string' ? body.password : '';
  const pwdError = passwordProblem(password);
  if (pwdError) fields.password = pwdError;
  const displayName = str(body.displayName) || username;
  if (size(displayName) < 1 || size(displayName) > LIMITS.displayName) {
    fields.displayName = `昵称需为 1-${LIMITS.displayName} 个字符`;
  }
  const callSign = optionalText(body.callSign, 'callSign', LIMITS.callSign, '呼号', fields);

  if (Object.keys(fields).length) throw badRequest(fields, '请检查注册信息');
  return { username, email, password, displayName, callSign };
}

function validateLogin(input) {
  const body = isObj(input) ? input : {};
  const fields = {};
  const identifier = str(body.identifier);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!identifier) fields.identifier = '请输入用户名或邮箱';
  if (!password) fields.password = '请输入密码';
  if (identifier.length > 120) fields.identifier = '用户名或邮箱过长';
  if (size(password) > LIMITS.password) fields.password = '密码过长';
  if (Object.keys(fields).length) throw badRequest(fields, '请输入用户名和密码');
  return { identifier, password };
}

/* ---------------- 个人资料 ---------------- */

/** PUT /api/me/profile：只处理出现的字段（address 整体替换，可传 null 清空） */
function validateProfile(input) {
  const body = isObj(input) ? input : {};
  const fields = {};
  const patch = {};

  if (hasOwn(body, 'displayName')) {
    patch.displayName = requiredText(body.displayName, 'displayName', LIMITS.displayName, '昵称', fields);
  }
  if (hasOwn(body, 'callSign')) {
    patch.callSign = optionalText(body.callSign, 'callSign', LIMITS.callSign, '呼号', fields);
  }
  if (hasOwn(body, 'bio')) {
    patch.bio = optionalText(body.bio, 'bio', LIMITS.bio, '个人简介', fields);
  }
  if (hasOwn(body, 'avatarColor')) {
    const color = str(body.avatarColor);
    if (!COLOR_RE.test(color)) fields.avatarColor = '头像颜色需为 #RRGGBB 格式';
    else patch.avatarColor = color.toLowerCase();
  }
  if (hasOwn(body, 'address')) {
    patch.address = body.address === null ? null : validateAddress(body.address, fields, 'address');
  }

  if (Object.keys(fields).length) throw badRequest(fields, '请检查个人资料');
  return patch;
}

/* ---------------- 卡片 ---------------- */

function validateStock(value) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0 || value > 2147483647) {
    throw badRequest({ stock: '库存需为 0–2147483647 的整数，或 null（未设置）' });
  }
  return value;
}

function validateCardImages(rawFront, rawBack, fields) {
  const front = typeof rawFront === 'string' ? rawFront.trim() : '';
  if (!front) fields.frontImage = '请上传卡片正面图片';
  let back = '';
  if (rawBack === undefined || rawBack === null) back = '';
  else if (typeof rawBack !== 'string') fields.backImage = '卡片背面图片格式不正确';
  else back = rawBack.trim();
  return { frontImage: front, backImage: back };
}

/** POST /api/cards */
function validateCardCreate(input) {
  const body = isObj(input) ? input : {};
  const fields = {};

  const title = requiredText(body.title, 'title', LIMITS.title, '卡片标题', fields);
  const callSign = optionalText(body.callSign, 'callSign', LIMITS.callSign, '呼号', fields);
  // v3：波段/模式不再作为卡片必填内容，缺省或空字符串均合法（保留长度上限校验）
  const band = optionalText(body.band, 'band', LIMITS.band, '波段', fields);
  const mode = optionalText(body.mode, 'mode', LIMITS.mode, '模式', fields);
  const notes = optionalText(body.notes, 'notes', LIMITS.notes, '备注', fields);
  const ratio = parseRatio(body.ratio, fields);
  const images = validateCardImages(body.frontImage, body.backImage, fields);

  if (Object.keys(fields).length) throw badRequest(fields, '请检查卡片信息');
  return { title, callSign, band, mode, notes, ratio, stock: hasOwn(body, 'stock') ? validateStock(body.stock) : null, ...images };
}

/** PUT /api/cards/:id 与 PUT /api/admin/cards/:id（allowStatus 仅管理员） */
function validateCardUpdate(input, { allowStatus = false } = {}) {
  const body = isObj(input) ? input : {};
  const fields = {};
  const patch = {};

  if (hasOwn(body, 'stock')) patch.stock = validateStock(body.stock);

  if (hasOwn(body, 'title')) patch.title = requiredText(body.title, 'title', LIMITS.title, '卡片标题', fields);
  if (hasOwn(body, 'callSign')) patch.callSign = optionalText(body.callSign, 'callSign', LIMITS.callSign, '呼号', fields);
  if (hasOwn(body, 'band')) patch.band = optionalText(body.band, 'band', LIMITS.band, '波段', fields);
  if (hasOwn(body, 'mode')) patch.mode = optionalText(body.mode, 'mode', LIMITS.mode, '模式', fields);
  if (hasOwn(body, 'notes')) patch.notes = optionalText(body.notes, 'notes', LIMITS.notes, '备注', fields);
  if (hasOwn(body, 'ratio')) patch.ratio = parseRatio(body.ratio, fields);

  if (hasOwn(body, 'frontImage')) {
    if (typeof body.frontImage !== 'string' || !body.frontImage.trim()) {
      fields.frontImage = '请上传卡片正面图片';
    } else {
      patch.frontImage = body.frontImage.trim();
    }
  }
  if (hasOwn(body, 'backImage')) {
    if (typeof body.backImage !== 'string') fields.backImage = '卡片背面图片格式不正确';
    else patch.backImage = body.backImage.trim();
  }

  if (allowStatus) {
    if (hasOwn(body, 'status')) {
      const status = str(body.status);
      if (!['pending', 'approved', 'rejected'].includes(status)) fields.status = '卡片状态不合法';
      else patch.status = status;
    }
    if (hasOwn(body, 'rejectReason')) {
      patch.rejectReason = optionalText(body.rejectReason, 'rejectReason', LIMITS.rejectReason, '拒绝原因', fields);
    }
  }

  if (Object.keys(fields).length) throw badRequest(fields, '请检查卡片信息');
  return patch;
}

/* ---------------- 换卡申请 ---------------- */

function validateExchangeCreate(input) {
  const body = isObj(input) ? input : {};
  const fields = {};

  let message = '';
  if (hasOwn(body, 'message')) {
    message = optionalText(body.message, 'message', LIMITS.message, '留言', fields);
  }
  const contactName = requiredText(body.contactName, 'contactName', LIMITS.contactName, '联系人姓名', fields);
  const address = validateAddress(body.address, fields, 'address');
  const contactLogIds = hasOwn(body, 'contactLogIds') ? body.contactLogIds : [];
  if (!Array.isArray(contactLogIds) || contactLogIds.length > 100 ||
      contactLogIds.some(id => typeof id !== 'string' || !id || id.length > 100) ||
      new Set(contactLogIds).size !== contactLogIds.length) {
    fields.contactLogIds = '请选择最多 100 条不重复的本人通联记录';
  }

  if (Object.keys(fields).length) throw badRequest(fields, '请检查换卡申请信息');
  return { message, contactName, address, contactLogIds };
}

function validateRejectReason(input) {
  const body = isObj(input) ? input : {};
  const reason = hasOwn(body, 'reason') ? str(body.reason) : '';
  if (size(reason) > LIMITS.rejectReason) {
    throw badRequest({ reason: `拒绝原因不能超过 ${LIMITS.rejectReason} 个字符` }, '拒绝原因过长');
  }
  return reason;
}

/* ---------------- 管理后台 ---------------- */

/** PUT /api/admin/users/:id */
function validateAdminUserUpdate(input) {
  const body = isObj(input) ? input : {};
  const fields = {};
  const patch = {};

  if (hasOwn(body, 'displayName')) {
    patch.displayName = requiredText(body.displayName, 'displayName', LIMITS.displayName, '昵称', fields);
  }
  if (hasOwn(body, 'callSign')) {
    patch.callSign = optionalText(body.callSign, 'callSign', LIMITS.callSign, '呼号', fields);
  }
  if (hasOwn(body, 'bio')) {
    patch.bio = optionalText(body.bio, 'bio', LIMITS.bio, '个人简介', fields);
  }
  if (hasOwn(body, 'avatarColor')) {
    const color = str(body.avatarColor);
    if (!COLOR_RE.test(color)) fields.avatarColor = '头像颜色需为 #RRGGBB 格式';
    else patch.avatarColor = color.toLowerCase();
  }
  if (hasOwn(body, 'email')) {
    const email = str(body.email).toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > LIMITS.email) fields.email = '请输入有效的邮箱地址';
    else patch.email = email;
  }
  if (hasOwn(body, 'role')) {
    const role = str(body.role);
    if (!['user', 'admin'].includes(role)) fields.role = '角色只能是 user 或 admin';
    else patch.role = role;
  }
  if (hasOwn(body, 'status')) {
    const status = str(body.status);
    if (!['active', 'banned'].includes(status)) fields.status = '状态只能是 active 或 banned';
    else patch.status = status;
  }
  if (hasOwn(body, 'address')) {
    patch.address = body.address === null ? null : validateAddress(body.address, fields, 'address');
  }
  if (hasOwn(body, 'newPassword')) {
    const pwdError = passwordProblem(typeof body.newPassword === 'string' ? body.newPassword : '');
    if (pwdError) fields.newPassword = pwdError;
    else patch.newPassword = body.newPassword;
  }

  if (Object.keys(fields).length) throw badRequest(fields, '请检查用户信息');
  return patch;
}

/* ---------------- 查询参数 ---------------- */

/** 解析分页参数：page 默认 1，limit 默认 12、上限 48 */
function parsePagination(searchParams) {
  const rawPage = Number.parseInt(searchParams.get('page'), 10);
  const rawLimit = Number.parseInt(searchParams.get('limit'), 10);
  let page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  let limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 12;
  if (limit > 48) limit = 48;
  return { page, limit };
}

/** 读取枚举查询参数，非法值回退默认值 */
function parseEnum(searchParams, key, allowed, fallback) {
  const value = str(searchParams.get(key));
  return allowed.includes(value) ? value : fallback;
}

module.exports = {
  AVATAR_PALETTE,
  LIMITS,
  str,
  isObj,
  size,
  hasOwn,
  randomAvatarColor,
  passwordProblem,
  validateAddress,
  validateRegister,
  validateEmail,
  validateLogin,
  validateProfile,
  validateCardCreate,
  validateStock,
  validateCardUpdate,
  validateExchangeCreate,
  validateRejectReason,
  validateAdminUserUpdate,
  parsePagination,
  parseEnum,
};
