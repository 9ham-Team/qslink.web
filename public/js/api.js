/* ============================================================
 * QSLink api.js — 与后端通信的唯一客户端（Lead 维护）
 * 依赖：core.js。契约见 docs/API.md。
 * ============================================================ */
(function () {
  'use strict';
  const QSL = window.QSL;
  const TOKEN_KEY = 'qsl_token';

  class ApiError extends Error {
    constructor(message, opts) {
      super(message);
      this.name = 'ApiError';
      const o = opts || {};
      this.status = o.status || 0;
      this.code = o.code || 'ERROR';
      this.fields = o.fields || null;
      this.isNetwork = !!o.isNetwork;
    }
  }
  QSL.ApiError = ApiError;

  let token = null;
  try { token = localStorage.getItem(TOKEN_KEY) || null; } catch (e) { token = null; }

  const STATUS_MESSAGE = {
    400: '请求参数有误',
    401: '请先登录后再操作',
    403: '没有权限执行此操作',
    404: '内容不存在或已被删除',
    409: '操作发生冲突，请刷新后重试',
    413: '文件或数据过大',
    429: '操作太频繁，请稍后再试',
    500: '服务器开小差了，请稍后再试'
  };

  function buildQuery(params) {
    if (!params) return '';
    const sp = new URLSearchParams();
    Object.keys(params).forEach((key) => {
      const val = params[key];
      if (val === null || val === undefined || val === '') return;
      sp.set(key, String(val));
    });
    const q = sp.toString();
    return q ? '?' + q : '';
  }

  async function request(method, path, body, options) {
    const opts = options || {};
    const headers = { Accept: 'application/json' };
    if (body !== undefined && body !== null) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;

    let res;
    try {
      res = await fetch(path, {
        method,
        headers,
        body: body === undefined || body === null ? undefined : JSON.stringify(body)
      });
    } catch (err) {
      throw new ApiError('网络连接失败，请确认服务已启动', { isNetwork: true });
    }

    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch (e) { data = null; }
    }

    if (!res.ok) {
      const info = (data && data.error) || {};
      const apiErr = new ApiError(
        info.message || STATUS_MESSAGE[res.status] || ('请求失败（' + res.status + '）'),
        { status: res.status, code: info.code || 'HTTP_' + res.status, fields: info.fields || null }
      );
      // 登录态失效统一处理（登录/注册接口除外，避免误清）
      const isAuthCall = path.startsWith('/api/auth/login') || path.startsWith('/api/auth/register');
      if (res.status === 401 && token && !opts.skipAuthClear && !isAuthCall) {
        setToken(null);
        QSL.state.user = null;
        QSL.emit('auth', null);
        if (QSL.toast) QSL.toast('登录已过期，请重新登录', 'error');
      }
      throw apiErr;
    }
    return data === null ? {} : data;
  }

  function setToken(next) {
    token = next || null;
    try {
      if (next) localStorage.setItem(TOKEN_KEY, next);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* 隐私模式下忽略 */ }
  }

  const api = (QSL.api = {
    request,
    get: (path, opts) => request('GET', path, null, opts),
    post: (path, body, opts) => request('POST', path, body, opts),
    put: (path, body, opts) => request('PUT', path, body, opts),
    del: (path, opts) => request('DELETE', path, null, opts),
    token: () => token,
    setToken,
    buildQuery,

    health: () => request('GET', '/api/health'),

    auth: {
      register: (payload) => request('POST', '/api/auth/register', payload),
      login: (payload) => request('POST', '/api/auth/login', payload),
      logout: () => request('POST', '/api/auth/logout', {}),
      me: (opts) => request('GET', '/api/auth/me', null, opts)
    },

    me: {
      overview: () => request('GET', '/api/me/overview'),
      updateProfile: (payload) => request('PUT', '/api/me/profile', payload),
      updatePassword: (payload) => request('PUT', '/api/me/password', payload)
    },

    cards: {
      list: (params) => request('GET', '/api/cards' + buildQuery(params)),
      get: (id) => request('GET', '/api/cards/' + encodeURIComponent(id)),
      create: (payload) => request('POST', '/api/cards', payload),
      update: (id, payload) => request('PUT', '/api/cards/' + encodeURIComponent(id), payload),
      remove: (id) => request('DELETE', '/api/cards/' + encodeURIComponent(id)),
      like: (id) => request('POST', '/api/cards/' + encodeURIComponent(id) + '/like', {}),
      mine: () => request('GET', '/api/me/cards'),
      share: (id) => request('GET', '/api/cards/' + encodeURIComponent(id) + '/share'),
      publicGet: (shareToken) => request('GET', '/api/public/cards/' + encodeURIComponent(shareToken))
    },

    exchanges: {
      mine: (params) => request('GET', '/api/me/exchanges' + buildQuery(params)),
      detail: (id) => request('GET', '/api/exchanges/' + encodeURIComponent(id)),
      create: (cardId, payload) => request('POST', '/api/cards/' + encodeURIComponent(cardId) + '/exchanges', payload),
      approve: (id) => request('POST', '/api/exchanges/' + encodeURIComponent(id) + '/approve', {}),
      reject: (id, payload) => request('POST', '/api/exchanges/' + encodeURIComponent(id) + '/reject', payload || {}),
      complete: (id) => request('POST', '/api/exchanges/' + encodeURIComponent(id) + '/complete', {}),
      cancel: (id) => request('POST', '/api/exchanges/' + encodeURIComponent(id) + '/cancel', {})
    },

    admin: {
      stats: () => request('GET', '/api/admin/stats'),
      users: (params) => request('GET', '/api/admin/users' + buildQuery(params)),
      updateUser: (id, payload) => request('PUT', '/api/admin/users/' + encodeURIComponent(id), payload),
      deleteUser: (id) => request('DELETE', '/api/admin/users/' + encodeURIComponent(id)),
      cards: (params) => request('GET', '/api/admin/cards' + buildQuery(params)),
      updateCard: (id, payload) => request('PUT', '/api/admin/cards/' + encodeURIComponent(id), payload),
      deleteCard: (id) => request('DELETE', '/api/admin/cards/' + encodeURIComponent(id)),
      exchanges: (params) => request('GET', '/api/admin/exchanges' + buildQuery(params))
    }
  });
})();
