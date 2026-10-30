/* ============================================================
 * QSLink ui.js — 共享 UI 组件库（Lead 维护）
 * 依赖：core.js、api.js、设计系统 CSS。
 * 所有组件返回 HTML 字符串或 HTMLElement，详见 docs/CONTRACT.md §4.3
 * ============================================================ */
(function () {
  'use strict';
  const QSL = window.QSL;
  const esc = QSL.escapeHtml;

  /* ---------------- 图标库（手写线性图标） ---------------- */
  const ICONS = {
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.6l6.8-4.2M8.6 13.4l6.8 4.2"/>',
    cards: '<rect x="3" y="6" width="14" height="10" rx="2.5"/><path d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3H19a2 2 0 0 1 2 2v9.5a1.5 1.5 0 0 1-1.5 1.5H18"/>',
    upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    camera: '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.4"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.4 2.4 4.8-5"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6M5.5 6l1 13a2 2 0 0 0 2 1.9h7a2 2 0 0 0 2-1.9l1-13"/><path d="M10 11v5M14 11v5"/>',
    'arrow-right': '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
    'arrow-left': '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>',
    'arrow-up': '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
    'chevron-down': '<path d="M6 9l6 6 6-6"/>',
    'chevron-right': '<path d="M9 6l6 6-6 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    filter: '<path d="M4 5h16l-6 7.5V20l-4-2v-5.5z"/>',
    sort: '<path d="M8 4v16M8 20l-3-3M8 20l3-3M16 20V4M16 4l-3 3M16 4l3 3"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="M16 5.6a3.2 3.2 0 0 1 0 6.2"/><path d="M17.6 14.6A6.2 6.2 0 0 1 21.2 20"/>',
    shield: '<path d="M12 3l7 3v5.5c0 4.4-2.9 7.7-7 9.5-4.1-1.8-7-5.1-7-9.5V6z"/><path d="M9.2 12.2l2 2 3.8-4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    'map-pin': '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l7.4 5.6a2 2 0 0 0 2.2 0L20.5 7"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9"/>',
    eye: '<path d="M1.8 12S5.6 5.3 12 5.3 22.2 12 22.2 12 18.4 18.7 12 18.7 1.8 12 1.8 12z"/><circle cx="12" cy="12" r="3.2"/>',
    'eye-off': '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.7 9.7 0 0 1 12 6c6.4 0 10.2 6 10.2 6a17 17 0 0 1-3.3 3.8M6.6 6.7A16 16 0 0 0 1.8 12S5.6 18 12 18a9.6 9.6 0 0 0 4.4-1"/><path d="M9.9 10a3 3 0 0 0 4.2 4.2"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    flame: '<path d="M12 3s5.5 4.2 5.5 9A5.5 5.5 0 0 1 12 17.5 5.5 5.5 0 0 1 6.5 12c0-1.5.5-2.8 1.2-3.9C8.5 10 9.5 10.6 10 11c-.4-3 1-6 2-8z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3.5 9.5h17M3.5 14.5h17"/><path d="M12 3c2.6 2.4 4 5.5 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.5-4-9s1.4-6.6 4-9z"/>',
    radio: '<circle cx="12" cy="12" r="2"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 16.5a6.4 6.4 0 0 0 0-9M4.5 4.5a10.6 10.6 0 0 0 0 15M19.5 19.5a10.6 10.6 0 0 0 0-15"/>',
    antenna: '<path d="M12 21V10"/><path d="M8 13a5.6 5.6 0 0 1 8 0"/><path d="M5 10a10 10 0 0 1 14 0"/><circle cx="12" cy="6.5" r="1.4"/>',
    wave: '<path d="M2 12c2.5 0 2.5-6 5-6s2.5 12 5 12 2.5-12 5-12 2.5 6 5 6"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-7A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v4.5A2.5 2.5 0 0 1 15.5 21h-9A2.5 2.5 0 0 1 4 18.5v-9A2.5 2.5 0 0 1 6.5 7H11"/>',
    refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M20.5 4v5h-5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="M3.5 17l4.8-4.6a2 2 0 0 1 2.8.1L21 20"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.5"/>',
    alert: '<path d="M12 4L2.8 20h18.4z"/><path d="M12 10v4.5M12 17.6v.4"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.9l-5.3 2.7 1.1-5.8-4.3-4.1 5.9-.8z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 12a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.5 2.7a7.5 7.5 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7.5 7.5 0 0 0 2 1.2l.5 2.7h5l.5-2.7a7.5 7.5 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>',
    inbox: '<path d="M4.5 4.5h15L21 13a2 2 0 0 1-2 2h-3l-1.5 3h-5L8 15H5a2 2 0 0 1-2-2z"/><path d="M4.5 4.5L3 11"/>',
    send: '<path d="M21 3L10.5 13.5"/><path d="M21 3l-7 18-3.5-7.5L3 10z"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M4.3 4.3l1.4 1.4M18.3 18.3l1.4 1.4M2.5 12h2M19.5 12h2M4.3 19.7l1.4-1.4M18.3 5.7l1.4-1.4"/>',
    moon: '<path d="M20.5 14.5A8.6 8.6 0 0 1 9.5 3.5a8.6 8.6 0 1 0 11 11z"/>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M3 9h18M9 9v12"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    download: '<path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    '3d': '<path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z"/><path d="M12 12l8-4.6M12 12v9.2M12 12L4 7.4"/>',
    flip: '<path d="M3 8.5A4.5 4.5 0 0 1 7.5 4h9"/><path d="M14 1.8L17.6 4 14 6.2"/><path d="M21 15.5a4.5 4.5 0 0 1-4.5 4.5h-9"/><path d="M10 22.2L6.4 20 10 17.8"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    tag: '<path d="M20.5 13.3l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.5 7.5a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
    calendar: '<rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M3.5 9h17M8 3v3M16 3v3"/>',
    key: '<circle cx="8" cy="15.5" r="4"/><path d="M11 12.5L20 3.5M17 6.5l2.5 2.5M14.5 9l2 2"/>',
    play: '<path d="M7 4.5l12 7.5-12 7.5z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    more: '<circle cx="5.5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18.5" cy="12" r="1"/>',
    'log-in': '<path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14"/><path d="M10 8l4 4-4 4M3 12h11"/>'
  };

  QSL.icon = function (name, size, cls) {
    const body = ICONS[name];
    if (!body) return '';
    const s = size || 20;
    return (
      '<svg class="icon ' + esc(cls || '') + '" width="' + s + '" height="' + s +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      body + '</svg>'
    );
  };
  const icon = QSL.icon;

  /* ---------------- 常量 ---------------- */
  QSL.BANDS = ['160m', '80m', '40m', '30m', '20m', '17m', '15m', '12m', '10m', '6m', '2m', '70cm', '其它'];
  QSL.MODES = ['SSB', 'CW', 'FT8', 'FT4', 'AM', 'FM', 'RTTY', 'PSK31', 'JT65', '其它'];
  QSL.AVATAR_COLORS = ['#0eaf8f', '#14b8a6', '#38bdf8', '#6366f1', '#8b5cf6', '#ec4899', '#fb7185', '#f59e0b', '#84cc16', '#0ea5e9'];
  const TONES = ['mint', 'sky', 'amber', 'rose', 'violet', 'slate'];
  function hashTone(text, salt) {
    const str = String(text || '') + (salt || '');
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return TONES[h % TONES.length];
  }
  QSL.bandTone = (band) => hashTone(band, 'band');
  QSL.modeTone = (mode) => hashTone(mode, 'mode');

  /* ---------------- Toast ---------------- */
  QSL.toast = function (message, type, duration) {
    const root = document.getElementById('toast-root');
    if (!root) {
      console.log('[toast]', message);
      return function () {};
    }
    const kind = type || 'success';
    const iconName = kind === 'success' ? 'check-circle' : kind === 'error' ? 'alert' : kind === 'info' ? 'info' : 'sparkles';
    const el = document.createElement('div');
    el.className = 'toast qsl-notification toast-' + kind;
    el.innerHTML =
      '<span class="toast-icon">' + icon(iconName, 18) + '</span>' +
      '<span class="toast-msg">' + esc(message) + '</span>' +
      '<button class="toast-close" type="button" aria-label="关闭">' + icon('close', 14) + '</button>';
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-show'));
    let closed = false;
    const close = function () {
      if (closed) return;
      closed = true;
      el.classList.remove('is-show');
      el.classList.add('is-hide');
      setTimeout(() => el.remove(), 280);
    };
    el.querySelector('.toast-close').addEventListener('click', close);
    setTimeout(close, duration || (kind === 'error' ? 4800 : 3200));
    return close;
  };

  /* ---------------- Modal ---------------- */
  QSL.modal = function (options) {
    const opts = options || {};
    const root = document.getElementById('modal-root');
    if (!root) return { close() {}, body: document.createElement('div'), el: null };
    document.body.classList.add('modal-open');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const size = opts.size || 'md';
    overlay.innerHTML =
      '<div class="modal modal-' + esc(size) + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head">' +
      '<h3 class="modal-title">' + esc(opts.title || '') + '</h3>' +
      '<button class="modal-x" type="button" aria-label="关闭">' + icon('close', 18) + '</button>' +
      '</div>' +
      '<div class="modal-body"></div>' +
      '<div class="modal-actions"></div>' +
      '</div>';
    const modalEl = overlay.querySelector('.modal');
    const body = overlay.querySelector('.modal-body');
    const actionsEl = overlay.querySelector('.modal-actions');
    root.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-show'));

    let closed = false;
    const instance = {
      el: modalEl,
      body,
      close: function () {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey);
        overlay.classList.remove('is-show');
        setTimeout(() => overlay.remove(), 220);
        if (!document.querySelector('.modal-overlay.is-show')) document.body.classList.remove('modal-open');
        if (typeof opts.onClose === 'function') opts.onClose();
      }
    };

    if (typeof opts.content === 'string') body.innerHTML = opts.content;
    else if (opts.content instanceof HTMLElement) body.appendChild(opts.content);
    else if (opts.content) body.appendChild(opts.content);

    const actions = opts.actions || [];
    actions.forEach((action) => {
      const btn = document.createElement('button');
      const variant = action.type || 'ghost';
      btn.type = 'button';
      btn.className = 'btn btn-' + variant;
      btn.textContent = action.label || '确定';
      if (action.disabled) btn.disabled = true;
      btn.addEventListener('click', async function () {
        if (typeof action.onClick === 'function') {
          try {
            const result = await action.onClick(instance);
            if (result === false) return;
          } catch (err) {
            console.error(err);
            return;
          }
        }
        if (action.closeOnClick !== false) instance.close();
      });
      actionsEl.appendChild(btn);
    });
    if (!actions.length) actionsEl.remove();

    overlay.querySelector('.modal-x').addEventListener('click', instance.close);
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay && opts.dismissible !== false) instance.close();
    });
    const onKey = function (e) {
      if (root.lastElementChild !== overlay) return;
      if (e.key === 'Escape' && opts.dismissible !== false) {
        instance.close();
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);
    overlay._onKey = onKey;
    return instance;
  };

  QSL.confirm = function (options) {
    const opts = options || {};
    return new Promise(function (resolve) {
      let settled = false;
      const done = function (val) {
        if (settled) return;
        settled = true;
        resolve(val);
      };
      const modal = QSL.modal({
        title: opts.title || '请确认',
        size: 'sm',
        content: '<p class="modal-text">' + esc(opts.message || '') + '</p>',
        onClose: () => done(false),
        actions: [
          { label: opts.cancelText || '取消', type: 'ghost', onClick: () => { done(false); } },
          {
            label: opts.confirmText || '确认',
            type: opts.danger ? 'danger' : 'primary',
            onClick: () => { done(true); }
          }
        ]
      });
      // 点击 × 或遮罩会触发 onClose → done(false)
      void modal;
    });
  };

  /* ---------------- 头像 / 徽章 / 标签 ---------------- */
  QSL.avatar = function (user, size) {
    const u = user || {};
    const px = size || 36;
    const name = u.displayName || u.username || '?';
    const raw = (u.callSign && u.callSign.length >= 2 ? u.callSign : name).replace(/[^0-9A-Za-z\u4e00-\u9fa5]/g, '');
    const initial = (raw.slice(0, 2) || 'Q').toUpperCase();
    const color = u.avatarColor || '#0eaf8f';
    return (
      '<span class="avatar" style="--av-size:' + px + 'px;--av-color:' + esc(color) + ';" title="' + esc(name) + '">' +
      '<span class="avatar-initial">' + esc(initial) + '</span></span>'
    );
  };

  QSL.badge = function (text, tone) {
    if (text === null || text === undefined || text === '') return '';
    return '<span class="badge badge-' + esc(tone || 'mint') + '">' + esc(text) + '</span>';
  };

  const STATUS_MAP = {
    pending: { text: '审核中', tone: 'amber' },
    approved: { text: '已通过', tone: 'mint' },
    rejected: { text: '已拒绝', tone: 'rose' },
    draft: { text: '草稿', tone: 'slate' }
  };
  QSL.statusBadge = function (status) {
    const s = STATUS_MAP[status] || { text: status || '未知', tone: 'slate' };
    return QSL.badge(s.text, s.tone);
  };
  QSL.statusText = (status) => (STATUS_MAP[status] || {}).text || status || '未知';

  const EXCHANGE_MAP = {
    pending: { text: '待处理', tone: 'amber' },
    approved: { text: '已同意', tone: 'mint' },
    rejected: { text: '已拒绝', tone: 'rose' },
    completed: { text: '已完成', tone: 'sky' },
    cancelled: { text: '已取消', tone: 'slate' }
  };
  QSL.exchangeBadge = function (status) {
    const s = EXCHANGE_MAP[status] || { text: status || '未知', tone: 'slate' };
    return QSL.badge(s.text, s.tone);
  };
  QSL.exchangeText = (status) => (EXCHANGE_MAP[status] || {}).text || status || '未知';

  /* ---------------- 按钮 ---------------- */
  QSL.button = function (options) {
    const opts = options || {};
    const btn = document.createElement(opts.href ? 'a' : 'button');
    btn.className = 'btn btn-' + (opts.variant || 'primary') + (opts.size ? ' btn-' + opts.size : '') + (opts.block ? ' btn-block' : '');
    if (opts.href) btn.href = opts.href;
    else btn.type = opts.type || 'button';
    if (opts.icon) btn.innerHTML = icon(opts.icon, opts.size === 'sm' ? 16 : 18) + '<span>' + esc(opts.label || '') + '</span>';
    else btn.textContent = opts.label || '';
    if (opts.disabled) btn.disabled = true;
    if (typeof opts.onClick === 'function') btn.addEventListener('click', opts.onClick);
    if (opts.title) btn.title = opts.title;
    if (opts.attrs) Object.keys(opts.attrs).forEach((k) => btn.setAttribute(k, opts.attrs[k]));
    return btn;
  };

  QSL.setBusy = function (btn, busy, busyText) {
    if (!btn) return;
    if (busy) {
      if (!btn.dataset.origHtml) btn.dataset.origHtml = btn.innerHTML;
      btn.disabled = true;
      btn.classList.add('is-busy');
      btn.innerHTML = '<span class="spinner"></span><span>' + esc(busyText || '处理中…') + '</span>';
    } else {
      btn.disabled = false;
      btn.classList.remove('is-busy');
      if (btn.dataset.origHtml) {
        btn.innerHTML = btn.dataset.origHtml;
        delete btn.dataset.origHtml;
      }
    }
  };

  /* ---------------- 复制 / 分享 ---------------- */
  QSL.copyText = async function (text, successMsg) {
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch (e) { ok = false; }
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
    }
    if (ok) QSL.toast(successMsg || '已复制到剪贴板', 'success');
    else QSL.toast('复制失败，请手动选择复制', 'error');
    return ok;
  };

  QSL.cardShareUrl = async function (card) {
    const c = card || {};
    let token = c.shareToken;
    if (c.canShare !== false && !token && c.id) {
      try {
        const res = await QSL.api.cards.share(c.id);
        if (res && res.url) return res.url;
        token = res && res.shareToken;
      } catch (err) { /* 非 owner 时回退到普通链接 */ }
    }
    const url = token ? location.origin + '/s/' + encodeURIComponent(token) : location.origin + '/card/' + (c.id || '');
    return url;
  };

  QSL.shareCard = async function (card) {
    return QSL.copyText(await QSL.cardShareUrl(card), '分享链接已复制，快发给朋友吧');
  };

  /* ---------------- 页面结构 ---------------- */
  QSL.pageHeader = function (options) {
    const opts = options || {};
    return (
      '<header class="page-head" data-reveal>' +
      (opts.eyebrow ? '<p class="eyebrow">' + esc(opts.eyebrow) + '</p>' : '') +
      '<div class="page-head-row">' +
      '<div class="page-head-main">' +
      '<h1 class="page-title">' + esc(opts.title || '') + '</h1>' +
      (opts.desc ? '<p class="page-desc">' + esc(opts.desc) + '</p>' : '') +
      '</div>' +
      (opts.actions ? '<div class="page-head-actions">' + opts.actions + '</div>' : '') +
      '</div></header>'
    );
  };

  QSL.sectionHead = function (options) {
    const opts = options || {};
    return (
      '<div class="section-head" data-reveal>' +
      '<div><h2 class="section-title">' + esc(opts.title || '') + '</h2>' +
      (opts.desc ? '<p class="section-desc">' + esc(opts.desc) + '</p>' : '') + '</div>' +
      (opts.actionLabel
        ? '<a class="section-link" href="' + esc(opts.actionHref || '#') + '" data-link>' + esc(opts.actionLabel) + icon('arrow-right', 16) + '</a>'
        : '') +
      '</div>'
    );
  };

  const EMPTY_ART = {
    cards: '/assets/empty-cards.svg',
    requests: '/assets/empty-requests.svg',
    inbox: '/assets/empty-requests.svg',
    send: '/assets/empty-requests.svg',
    users: '/assets/empty-users.svg',
    user: '/assets/empty-users.svg',
    search: '/assets/empty-search.svg',
    filter: '/assets/empty-search.svg',
    alert: '/assets/404.svg',
    'alert-triangle': '/assets/404.svg'
  };

  QSL.emptyState = function (options) {
    const opts = options || {};
    const el = document.createElement('div');
    el.className = 'empty-state';
    const art = opts.image || (opts.illustration === false ? '' : EMPTY_ART[opts.icon]);
    const media = art
      ? '<img class="empty-state-img" src="' + esc(art) + '" alt="" width="180" height="140" loading="lazy">'
      : '<div class="empty-state-icon">' + icon(opts.icon || 'cards', 32) + '</div>';
    el.innerHTML =
      media +
      '<h3>' + esc(opts.title || '暂无内容') + '</h3>' +
      (opts.desc ? '<p>' + esc(opts.desc) + '</p>' : '') +
      (opts.actionLabel ? '<button class="btn btn-primary" type="button" data-empty-action>' + esc(opts.actionLabel) + '</button>' : '') +
      (opts.extraHtml || '');
    if (opts.actionLabel && typeof opts.onAction === 'function') {
      el.querySelector('[data-empty-action]').addEventListener('click', opts.onAction);
    }
    return el;
  };

  /* ---------------- 加载 / 骨架 ---------------- */
  QSL.loading = function (container, text) {
    if (!container) return;
    container.innerHTML =
      '<div class="loading-block"><span class="spinner spinner-lg"></span><p>' + esc(text || '正在加载…') + '</p></div>';
  };
  QSL.skeletonCards = function (count) {
    const n = count || 6;
    let html = '';
    for (let i = 0; i < n; i++) {
      html +=
        '<div class="skeleton-card"><div class="skeleton skeleton-media"></div>' +
        '<div class="skeleton skeleton-line" style="width:72%"></div>' +
        '<div class="skeleton skeleton-line" style="width:44%"></div></div>';
    }
    return html;
  };
  QSL.skeletonRows = function (count) {
    const n = count || 4;
    let html = '';
    for (let i = 0; i < n; i++) {
      html +=
        '<div class="skeleton-row"><div class="skeleton skeleton-avatar"></div>' +
        '<div class="skeleton skeleton-line" style="width:34%"></div>' +
        '<div class="skeleton skeleton-line" style="width:18%"></div>' +
        '<div class="skeleton skeleton-line" style="width:14%;margin-left:auto"></div></div>';
    }
    return html;
  };
  QSL.skeletonTable = function (rows, cols) {
    const r = rows || 5, c = cols || 5;
    let html = '<div class="skeleton-table"><div class="skeleton-table-row skeleton-table-head">';
    for (let j = 0; j < c; j++) html += '<div class="skeleton skeleton-line" style="width:' + (j === 0 ? 80 : 50) + 'px"></div>';
    html += '</div>';
    for (let i = 0; i < r; i++) {
      html += '<div class="skeleton-table-row">';
      for (let j = 0; j < c; j++) html += '<div class="skeleton skeleton-line" style="width:' + (40 + ((i * 13 + j * 17) % 50)) + '%"></div>';
      html += '</div>';
    }
    return html + '</div>';
  };

  /* ---------------- 表单辅助 ---------------- */
  QSL.formData = function (formEl) {
    const out = {};
    if (!formEl) return out;
    const fd = new FormData(formEl);
    fd.forEach(function (value, key) {
      if (typeof value === 'string') out[key] = value.trim();
    });
    return out;
  };
  QSL.showFieldErrors = function (formEl, fields) {
    QSL.clearFieldErrors(formEl);
    if (!fields || !formEl) return null;
    let firstMsg = null;
    Object.keys(fields).forEach(function (name) {
      const input = formEl.querySelector('[name="' + name + '"]');
      const msg = fields[name];
      if (!msg) return;
      if (!firstMsg) firstMsg = msg;
      if (input) {
        input.classList.add('is-invalid');
        const holder = input.closest('.field') || input.parentElement;
        if (holder) {
          const err = document.createElement('p');
          err.className = 'field-error';
          err.textContent = msg;
          holder.appendChild(err);
        }
      }
    });
    return firstMsg;
  };
  QSL.clearFieldErrors = function (formEl) {
    if (!formEl) return;
    formEl.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
    formEl.querySelectorAll('.field-error').forEach((el) => el.remove());
    formEl.querySelectorAll('.form-error').forEach((el) => el.remove());
  };
  QSL.field = function (options) {
    const o = options || {};
    return (
      '<label class="field">' +
      '<span class="label">' + esc(o.label || '') + (o.required ? '<i class="req">*</i>' : '') + '</span>' +
      (o.input || '') +
      (o.hint ? '<span class="hint">' + esc(o.hint) + '</span>' : '') +
      '</label>'
    );
  };

  /* ---------------- 卡片缩略图 / 列表项 ---------------- */
  QSL.cardThumb = function (card, options) {
    const c = card || {};
    const opts = options || {};
    const ratio = c.ratio || { w: 3, h: 2 };
    const height = opts.height || 64;
    const src = c.frontImage || QSL.PLACEHOLDER_IMAGE;
    return (
      '<span class="card-thumb" style="height:' + height + 'px;aspect-ratio:' + esc(QSL.ratioCss(ratio)) + '">' +
      '<img ' + QSL.images.attributes(src, Math.ceil(height * ratio.w / ratio.h) + 'px') + ' alt="' + esc(c.title || '卡片') + '" loading="lazy">' +
      '</span>'
    );
  };

  QSL.ownerLine = function (user) {
    const u = user || {};
    return (
      '<span class="owner-line">' + QSL.avatar(u, 26) +
      '<span class="owner-name">' + esc(u.displayName || u.username || '未知用户') + '</span>' +
      (u.callSign ? '<b class="owner-call">' + esc(u.callSign) + '</b>' : '') +
      '</span>'
    );
  };

  QSL.cardTile = function (card, options) {
    const c = card || {};
    const opts = options || {};
    const ratio = c.ratio || { w: 3, h: 2 };
    const href = opts.href || '/card/' + c.id;
    const liked = !!c.liked;
    const tile = document.createElement('article');
    tile.className = 'qsl-tile' + (opts.className ? ' ' + opts.className : '');
    tile.dataset.cardId = c.id || '';
    tile.setAttribute('data-tilt', '');
    const statusHtml = opts.showStatus && c.status && c.status !== 'approved' ? '<span class="qsl-tile-status">' + QSL.statusBadge(c.status) + '</span>' : '';
    tile.innerHTML =
      '<div class="qsl-tile-frame">' +
      '<a class="qsl-tile-media" href="' + esc(href) + '" data-link aria-label="' + esc(c.title || '查看卡片') + '">' +
      '<span class="qsl-tile-img" style="aspect-ratio:' + esc(QSL.ratioCss(ratio)) + '">' +
      '<img ' + QSL.images.attributes(c.frontImage || QSL.PLACEHOLDER_IMAGE) + ' alt="' + esc(c.title || '') + '" loading="lazy" decoding="async">' +
      '</span>' +
      '<span class="qsl-tile-sheen"></span>' +
      '<span class="qsl-tile-3d">' + icon('3d', 15) + '<span>3D 预览</span></span>' +
      statusHtml +
      '</a>' +
      '<button class="qsl-like' + (liked ? ' is-liked' : '') + '" type="button" aria-label="点赞" title="点赞">' +
      icon('heart', 18) + '<span class="qsl-like-count">' + QSL.formatNumber(c.likeCount || 0) + '</span></button>' +
      '</div>' +
      '<div class="qsl-tile-info">' +
      '<a class="qsl-tile-title" href="' + esc(href) + '" data-link>' + esc(c.title || '未命名卡片') + '</a>' +
      '<div class="qsl-tile-meta">' +
      QSL.ownerLine(c.owner) +
      '</div>' +
      '<p class="hint">' + (c.stock == null ? '库存未设置' : c.stock === 0 ? '暂无库存' : '剩余 ' + esc(c.stock) + ' 张') + '</p>' +
      (opts.footerHtml || '') +
      '</div>';

    const likeBtn = tile.querySelector('.qsl-like');
    likeBtn.addEventListener('click', async function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof opts.onLike === 'function') {
        opts.onLike(c, likeBtn, e);
        return;
      }
      if (!QSL.state.user) {
        QSL.toast('登录后即可点赞收藏', 'info');
        QSL.navigate('/login?next=' + encodeURIComponent(location.pathname + location.search));
        return;
      }
      if (likeBtn.disabled) return;
      likeBtn.disabled = true;
      try {
        const res = await QSL.api.cards.like(c.id);
        c.liked = res.liked;
        c.likeCount = res.likeCount;
        likeBtn.classList.toggle('is-liked', res.liked);
        likeBtn.querySelector('.qsl-like-count').textContent = QSL.formatNumber(res.likeCount);
        if (res.liked) {
          if (QSL.fx && QSL.fx.heartbeat) QSL.fx.heartbeat(likeBtn);
          if (QSL.fx && QSL.fx.confetti) QSL.fx.confetti(e.clientX, e.clientY);
        }
      } catch (err) {
        QSL.toast(err.message || '点赞失败', 'error');
      } finally {
        likeBtn.disabled = false;
      }
    });
    return tile;
  };

  /* ---------------- 其他 ---------------- */
  QSL.renderError = function (container, err, retry) {
    if (!container) return;
    container.innerHTML = '';
    const el = QSL.emptyState({
      icon: 'alert',
      title: '加载失败',
      desc: (err && err.message) || '网络异常，请稍后重试',
      actionLabel: retry ? '重试' : '',
      onAction: retry || undefined
    });
    container.appendChild(el);
  };

  QSL.emptyStateEl = QSL.emptyState;
})();
