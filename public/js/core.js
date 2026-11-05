/* ============================================================
 * QSLink core.js — 全局状态、路由、工具函数（Lead 维护）
 * 依赖：无。加载顺序：第一个。
 * ============================================================ */
(function () {
  'use strict';
  const QSL = (window.QSL = window.QSL || {});
  QSL.t = QSL.t || (source => source);
  QSL.i18n = QSL.i18n || { language: 'zh-CN' };
  QSL.version = '1.0.0';

  /* ---------------- 事件总线 ---------------- */
  const listeners = new Map();
  QSL.on = function (event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => QSL.off(event, fn);
  };
  QSL.off = function (event, fn) {
    const set = listeners.get(event);
    if (!set) return;
    set.delete(fn);
    if (!set.size) listeners.delete(event);
  };
  QSL.emit = function (event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try { fn(payload); } catch (err) { console.error('[QSL] listener error:', event, err); }
    }
  };

  /* ---------------- 全局状态 ---------------- */
  QSL.state = { user: null, booted: false, ready: Promise.resolve() };
  QSL.setUser = function (user) {
    QSL.state.user = user || null;
    QSL.emit('auth', QSL.state.user);
  };
  QSL.refreshUser = async function () {
    if (!QSL.api || !QSL.api.token()) { QSL.setUser(null); return null; }
    try {
      const data = await QSL.api.auth.me({ skipAuthClear: true });
      QSL.setUser(data.user);
      return data.user;
    } catch (err) {
      return null;
    }
  };

  /* ---------------- 页面注册 ---------------- */
  QSL.pages = Object.create(null);
  QSL.registerPage = function (name, def) {
    if (!name || !def || typeof def.render !== 'function') {
      console.error('[QSL] registerPage 参数无效:', name);
      return;
    }
    QSL.pages[name] = def;
  };

  /* ---------------- 路由表 ---------------- */
  QSL.routes = [
    { path: '/', page: 'home' },
    { path: '/explore', page: 'explore' },
    { path: '/space/:uid', page: 'space' },
    { path: '/card/:id', page: 'card-detail' },
    { path: '/share/:token', page: 'share' },
    { path: '/s/:token', page: 'share' },
    { path: '/login', page: 'login', guest: true },
    { path: '/register', page: 'register', guest: true },
    { path: '/dashboard', page: 'dashboard', auth: true },
    { path: '/dashboard/cards', page: 'my-cards', auth: true },
    { path: '/dashboard/cards/new', page: 'card-editor', auth: true },
    { path: '/dashboard/cards/:id/edit', page: 'card-editor', auth: true },
    { path: '/dashboard/exchanges', page: 'exchanges', auth: true },
    { path: '/dashboard/logbook', page: 'logbook', auth: true },
    { path: '/dashboard/profile', page: 'profile', auth: true },
    { path: '/admin', page: 'admin', auth: true, admin: true }
  ];

  function normalizePath(p) {
    if (!p) return '/';
    let path = p.split('?')[0].split('#')[0];
    if (!path.startsWith('/')) path = '/' + path;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return path;
  }

  function matchRoute(pathname) {
    const parts = normalizePath(pathname).split('/').filter(Boolean);
    for (const route of QSL.routes) {
      const rParts = route.path.split('/').filter(Boolean);
      if (rParts.length !== parts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < rParts.length; i++) {
        const r = rParts[i];
        if (r.startsWith(':')) params[r.slice(1)] = decodeURIComponent(parts[i]);
        else if (r !== parts[i]) { ok = false; break; }
      }
      if (ok) return { route, params };
    }
    return null;
  }
  QSL.matchRoute = matchRoute;

  /* ---------------- 导航 ---------------- */
  let routeToken = 0;

  QSL.scrollToHash = function () {
    if (!location.hash) return false;
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (err) { return false; }
    const target = document.getElementById(id);
    if (!target) return false;
    // Use layout coordinates: the page entrance transform must not shift the
    // destination while a cross-page navigation is still animating.
    let top = 0;
    for (let node = target; node; node = node.offsetParent) top += node.offsetTop;
    const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    window.scrollTo({
      top: Math.max(0, top - padding),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
    return true;
  };

  QSL.navigate = function (to, options) {
    const opts = options || {};
    const target = typeof to === 'string' ? to : '/';
    const next = new URL(target, location.href);
    const samePage = next.pathname === location.pathname && next.search === location.search;
    if (opts.replace) history.replaceState({}, '', target);
    else history.pushState({}, '', target);
    // Anchor links within the current page must preserve its loaded layout.
    if (samePage && next.hash && QSL.scrollToHash()) {
      if (QSL.router.current) QSL.router.current.hash = next.hash;
      QSL.emit('route', QSL.router.current);
      return;
    }
    renderRoute({ scroll: !opts.keepScroll });
  };

  QSL.currentPath = function () {
    return location.pathname + location.search;
  };

  QSL.goBack = function (fallback) {
    if (history.length > 1) history.back();
    else QSL.navigate(fallback || '/');
  };

  function safeNext(raw) {
    if (!raw) return null;
    try {
      const decoded = decodeURIComponent(raw);
      if (!decoded.startsWith('/') || decoded.startsWith('//')) return null;
      if (decoded.startsWith('/login') || decoded.startsWith('/register')) return null;
      return decoded;
    } catch (e) { return null; }
  }
  QSL.safeNext = safeNext;

  function renderPendingPage(pageName) {
    const big = (QSL.ui && QSL.ui.loading) ? '' : '';
    return (
      '<section class="container section route-placeholder" data-reveal>' +
      '<div class="skeleton skeleton-title" style="width:min(320px,60%)"></div>' +
      '<div class="skeleton skeleton-block" style="height:220px;margin-top:24px;border-radius:24px"></div>' +
      ("<p class=\"muted\" style=\"margin-top:18px\">" + QSL.escapeHtml(QSL.t("页面模块加载中…")) + "</p>") +
      '</section>'
    );
  }

  function renderForbidden(payload) {
    return (
      '<section class="container section route-forbidden" data-reveal>' +
      '<div class="empty-state" style="margin:8vh auto 0">' +
      '<div class="empty-state-icon">' + (QSL.icon ? QSL.icon('shield', 34) : '') + '</div>' +
      ("<h2>" + QSL.escapeHtml(QSL.t("没有访问权限")) + "</h2>") +
      ("<p>" + QSL.escapeHtml(QSL.t("此页面仅限管理员访问。如需管理权限，请联系站点管理员。")) + "</p>") +
      ("<a class=\"btn btn-primary\" href=\"/\" data-link>" + QSL.escapeHtml(QSL.t("返回首页")) + "</a>") +
      '</div></section>'
    );
  }

  function renderNotFound(payload) {
    if (QSL.pages['not-found']) {
      try { return QSL.pages['not-found'].render(document.getElementById('app'), payload); } catch (e) { console.error(e); }
    }
    return (
      '<section class="container section route-notfound" data-reveal>' +
      '<div class="empty-state" style="margin:8vh auto 0">' +
      '<div class="empty-state-emoji">404</div>' +
      ("<h2>" + QSL.escapeHtml(QSL.t("这里没有信号")) + "</h2>") +
      ("<p>" + QSL.escapeHtml(QSL.t("你访问的页面不存在，或卡片已被移除。")) + "</p>") +
      ("<a class=\"btn btn-primary\" href=\"/\" data-link>" + QSL.escapeHtml(QSL.t("返回首页")) + "</a>") +
      '</div></section>'
    );
  }

  async function renderRoute(options) {
    const opts = options || {};
    const token = ++routeToken;
    const root = document.getElementById('app');
    if (!root) return;
    const payloadBase = {
      path: location.pathname,
      query: new URLSearchParams(location.search),
      hash: location.hash
    };
    const matched = matchRoute(location.pathname);

    // 旧页面清理
    if (QSL.router.cleanup) {
      try { QSL.router.cleanup(); } catch (err) { console.error('[QSL] cleanup error:', err); }
      QSL.router.cleanup = null;
    }
    QSL.emit('route:before', payloadBase);

    if (!matched) {
      root.innerHTML = renderNotFound(payloadBase);
      document.title = QSL.t("页面不存在 · QSLink");
      finishRoute(payloadBase, opts);
      return;
    }

    const { route, params } = matched;
    const payload = Object.assign({ route, params }, payloadBase);
    QSL.router.current = payload;

    // 守卫：需要登录
    if (route.auth && !QSL.state.user) {
      const next = encodeURIComponent(location.pathname + location.search);
      QSL.navigate('/login?next=' + next, { replace: true });
      return;
    }
    // 守卫：游客页，已登录跳走
    if (route.guest && QSL.state.user) {
      const next = safeNext(payload.query.get('next'));
      QSL.navigate(next || '/', { replace: true });
      return;
    }
    // 守卫：管理员
    if (route.admin && (!QSL.state.user || QSL.state.user.role !== 'admin')) {
      root.innerHTML = renderForbidden(payload);
      document.title = QSL.t("没有访问权限 · QSLink");
      finishRoute(payload, opts);
      return;
    }

    // 页面进入过渡前的准备
    QSL.emit('route', payload);
    const page = QSL.pages[route.page];
    root.innerHTML = '';
    root.className = 'app-main';

    if (!page) {
      root.innerHTML = renderPendingPage(route.page);
      document.title = QSL.t("加载中 · QSLink");
      finishRoute(payload, opts);
      return;
    }

    try {
      const cleanup = await page.render(root, payload);
      if (token !== routeToken) return; // 已被更新的路由取代
      QSL.router.cleanup = typeof cleanup === 'function' ? cleanup : null;
      document.title = page.title ? page.title + ' · QSLink' : QSL.t("QSLink · QSL 卡片交换站");
    } catch (err) {
      console.error('[QSL] page render error:', route.page, err);
      if (err && err.status === 401) {
        QSL.toast && QSL.toast(QSL.t("登录已过期，请重新登录"), 'error');
        QSL.navigate('/login?next=' + encodeURIComponent(location.pathname));
        return;
      }
      root.innerHTML =
        '<section class="container section route-error" data-reveal>' +
        '<div class="empty-state" style="margin:8vh auto 0">' +
        '<div class="empty-state-icon">' + (QSL.icon ? QSL.icon('alert', 34) : '') + '</div>' +
        ("<h2>" + QSL.escapeHtml(QSL.t("页面加载失败")) + "</h2><p>") + QSL.escapeHtml((err && err.message) || QSL.t("未知错误")) + '</p>' +
        ("<button class=\"btn btn-primary\" data-retry>" + QSL.escapeHtml(QSL.t("重试")) + "</button>") +
        ("<a class=\"btn btn-ghost\" href=\"/\" data-link>" + QSL.escapeHtml(QSL.t("返回首页")) + "</a></div></section>");
      const retry = root.querySelector('[data-retry]');
      if (retry) retry.addEventListener('click', () => renderRoute());
      document.title = QSL.t("出错了 · QSLink");
    }
    finishRoute(payload, opts);
  }

  function finishRoute(payload, opts) {
    if (opts.scroll !== false && !location.hash) {
      try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (e) { window.scrollTo(0, 0); }
    }
    QSL.emit('route:rendered', payload);
    QSL.emit('route:after', payload);
  }

  QSL.router = {
    current: null,
    cleanup: null,
    render: renderRoute,
    start: function () {
      window.addEventListener('popstate', () => renderRoute({ scroll: false }));
      // 内部链接统一走前端路由
      document.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = e.target.closest('a[href]');
        if (!a) return;
        const href = a.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
        if (a.target === '_blank' || a.hasAttribute('download') || a.hasAttribute('data-native')) return;
        e.preventDefault();
        QSL.navigate(href);
      });
      renderRoute();
      QSL.emit('router:ready');
    }
  };

  /* ---------------- 工具函数 ---------------- */
  const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  QSL.escapeHtml = function (value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => HTML_ESC[ch]);
  };
  QSL.escapeAttr = QSL.escapeHtml;

  const dateFmt = new Intl.DateTimeFormat(QSL.i18n.language, { year: 'numeric', month: 'long', day: 'numeric' });
  const dateTimeFmt = new Intl.DateTimeFormat(QSL.i18n.language, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  });
  QSL.formatDate = function (iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return dateFmt.format(d);
  };
  QSL.formatDateTime = function (iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return dateTimeFmt.format(d).replace(/\//g, '-');
  };
  QSL.timeAgo = function (iso) {
    if (!iso) return '—';
    const d = new Date(iso).getTime();
    if (isNaN(d)) return '—';
    const diff = Math.max(0, Date.now() - d);
    const min = 60 * 1000, hour = 60 * min, day = 24 * hour;
    if (diff < min) return QSL.t("刚刚");
    if (QSL.i18n.language === 'en') {
      const [size, unit] = diff < hour ? [min, 'minute'] : diff < day ? [hour, 'hour'] :
        diff < 30 * day ? [day, 'day'] : diff < 365 * day ? [30 * day, 'month'] : [365 * day, 'year'];
      return new Intl.RelativeTimeFormat('en', { numeric: 'always' }).format(-Math.floor(diff / size), unit);
    }
    if (diff < hour) return Math.floor(diff / min) + (" " + QSL.t("分钟前"));
    if (diff < day) return Math.floor(diff / hour) + (" " + QSL.t("小时前"));
    if (diff < 30 * day) return Math.floor(diff / day) + (" " + QSL.t("天前"));
    if (diff < 365 * day) return Math.floor(diff / (30 * day)) + (" " + QSL.t("个月前"));
    return Math.floor(diff / (365 * day)) + (" " + QSL.t("年前"));
  };
  QSL.formatNumber = function (n) {
    const num = Number(n) || 0;
    if (QSL.i18n.language === 'en') return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(num);
    if (num >= 10000) return (num / 10000).toFixed(num >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'w';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(num);
  };
  QSL.debounce = function (fn, ms) {
    let timer = null;
    return function () {
      const ctx = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(ctx, args), ms || 300);
    };
  };
  QSL.ratioCss = function (ratio) {
    const w = (ratio && ratio.w) || 3, h = (ratio && ratio.h) || 2;
    return w + ' / ' + h;
  };
  QSL.ratioLabel = function (ratio) {
    const w = (ratio && ratio.w) || 3, h = (ratio && ratio.h) || 2;
    return w + ' : ' + h;
  };
  QSL.qs = function (name) {
    const params = new URLSearchParams(location.search);
    return name === undefined ? params : params.get(name);
  };
  QSL.setQuery = function (patch, options) {
    const params = new URLSearchParams(location.search);
    Object.keys(patch || {}).forEach((key) => {
      const val = patch[key];
      if (val === null || val === undefined || val === '') params.delete(key);
      else params.set(key, String(val));
    });
    const search = params.toString();
    const url = location.pathname + (search ? '?' + search : '') + location.hash;
    history.replaceState(history.state || {}, '', url);
    if (options && options.navigate) renderRoute({ scroll: false });
    return url;
  };
  QSL.img = function (src) {
    return src || (QSL.PLACEHOLDER_IMAGE || '');
  };
  // 优雅的占位图（渐变 + QSL 字样）
  QSL.PLACEHOLDER_IMAGE =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#d8f7ee"/><stop offset=".55" stop-color="#dbeefe"/><stop offset="1" stop-color="#ecdcfb"/></linearGradient></defs>' +
      '<rect width="600" height="400" fill="url(#g)"/>' +
      '<g fill="none" stroke="#0eaf8f" stroke-opacity=".28" stroke-width="2">' +
      '<circle cx="300" cy="200" r="86"/><circle cx="300" cy="200" r="54"/><circle cx="300" cy="200" r="122" stroke-dasharray="4 10"/></g>' +
      '<text x="300" y="214" text-anchor="middle" font-family="Georgia,serif" font-size="44" fill="#0b8f77" fill-opacity=".55" letter-spacing="6">QSL</text></svg>'
    );

  /* ---------------- 页脚构建信息 ---------------- */
  QSL.footerBuildText = function (build) {
    if (!build || typeof build.revision !== 'string' || typeof build.created !== 'string' ||
        !/^[a-f0-9]{40}$/.test(build.revision) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(build.created)) {
      return QSL.t("开发版 · 镜像构建时间未知");
    }
    const date = new Date(build.created);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== build.created.replace('Z', '.000Z')) {
      return QSL.t("开发版 · 镜像构建时间未知");
    }
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return (QSL.t("版本") + " ") + build.revision.slice(0, 7) + (" " + QSL.t("· 镜像构建于") + " ") + values.year + '-' + values.month + '-' +
      values.day + ' ' + values.hour + ':' + values.minute + ' HKT';
  };

  /* ---------------- 启动辅助 ---------------- */
  QSL.boot = async function () {
    // Server-controlled, fail-closed feature configuration. No demo credentials
    // are shipped in the production frontend bundle.
    QSL.state.config = { demo: false, demoAccounts: [] };
    try { QSL.state.config = await QSL.api.config(); } catch (err) { /* safe defaults */ }
    // 截图/测试便利：URL 带 devToken 时写入本地并清理地址栏（仅本人 token 有效，不产生额外权限）
    const devToken = QSL.qs('devToken');
    if (devToken) {
      if (QSL.state.config.demo) QSL.api.setToken(devToken);
      QSL.setQuery({ devToken: null });
    }
    const token = QSL.api.token();
    if (token) {
      try {
        const data = await QSL.api.auth.me({ skipAuthClear: true });
        QSL.state.user = data.user || null;
      } catch (err) {
        if (err && (err.status === 401 || err.status === 403)) QSL.api.setToken(null);
        QSL.state.user = null;
      }
    }
    QSL.state.booted = true;
    QSL.emit('auth', QSL.state.user);
  };
})();
