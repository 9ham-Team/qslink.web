/* ============================================================
 * QSLink app.js — 应用启动、导航壳、页脚（Lead 维护）
 * 依赖：core.js / api.js / ui.js / effects.js / 各页面模块
 * ============================================================ */
(function () {
  'use strict';
  const QSL = window.QSL;

  /* ---------------- 启动闪屏 ---------------- */
  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.innerHTML =
      '<div class="boot-splash"><span class="spinner spinner-lg"></span>' +
      '<span>正在连接 QSLink 电波…</span></div>';
  }

  /* ---------------- 顶部导航 ---------------- */
  const headerEl = document.getElementById('site-header');
  const footerEl = document.getElementById('site-footer');

  function navLinks(user) {
    const path = location.pathname;
    const links = [
      { href: '/', label: '首页', icon: 'sparkles', match: '/' },
      { href: '/explore', label: '卡片广场', icon: 'grid', match: '/explore' }
    ];
    if (user) links.push({ href: '/dashboard/exchanges', label: '换卡申请', icon: 'send', match: '/dashboard/exchanges' });
    return links
      .map(function (link) {
        const active = path === link.match || (link.match === '/explore' && path.startsWith('/explore'));
        return (
          '<a href="' + link.href + '" data-link class="' + (active ? 'is-active' : '') + '">' +
          QSL.icon(link.icon, 17) + '<span>' + link.label + '</span></a>'
        );
      })
      .join('');
  }

  function pendingBadge(user) {
    if (!user || !user.stats) return '';
    const count = user.stats.pendingExchanges || 0;
    if (!count) return '';
    return '<span class="nav-badge" title="待处理的换卡申请">' + (count > 99 ? '99+' : count) + '</span>';
  }

  function renderHeader() {
    if (!headerEl) return;
    const user = QSL.state.user;
    const isAdmin = user && user.role === 'admin';
    const avatarHtml = user ? QSL.avatar(user, 30) : '';

    const actionHtml = user
      ? '<a class="btn btn-soft btn-sm nav-upload-btn" href="/dashboard/cards/new" data-link>' +
        QSL.icon('plus', 16) + '<span class="hide-sm">上传卡片</span></a>' +
        '<div class="nav-user dropdown" id="nav-user">' +
        '<button class="nav-avatar-btn" type="button" aria-haspopup="menu" aria-expanded="false">' +
        avatarHtml +
        '<span class="nav-user-name">' + QSL.escapeHtml(user.displayName || user.username) + '</span>' +
        QSL.icon('chevron-down', 15) +
        '</button>' +
        '<div class="nav-user-menu nav-menu" role="menu">' +
        '<div class="nav-menu-head">' + QSL.avatar(user, 38) +
        '<span class="who"><b>' + QSL.escapeHtml(user.displayName || user.username) + '</b>' +
        '<small>' + (user.callSign ? QSL.escapeHtml(user.callSign) : '@' + QSL.escapeHtml(user.username)) + '</small></span></div>' +
        '<a href="/dashboard" data-link>' + QSL.icon('layout', 17) + '个人中心</a>' +
        '<a href="/dashboard/cards" data-link>' + QSL.icon('cards', 17) + '我的卡片</a>' +
        '<a href="/dashboard/exchanges" data-link>' + QSL.icon('send', 17) + '换卡申请' + pendingBadge(user) + '</a>' +
        '<a href="/dashboard/profile" data-link>' + QSL.icon('user', 17) + '个人资料</a>' +
        (isAdmin ? '<div class="menu-sep"></div><a class="menu-admin" href="/admin" data-link>' + QSL.icon('shield', 17) + '管理后台</a>' : '') +
        '<div class="menu-sep"></div>' +
        '<button type="button" class="menu-danger" data-logout>' + QSL.icon('logout', 17) + '退出登录</button>' +
        '</div></div>'
      : '<div class="nav-guest">' +
        '<a class="btn btn-ghost btn-sm" href="/login" data-link>登录</a>' +
        '<a class="btn btn-primary btn-sm" href="/register" data-link>免费注册</a>' +
        '</div>';

    const mobileLinks =
      '<a href="/" data-link class="' + (location.pathname === '/' ? 'is-active' : '') + '">' + QSL.icon('sparkles', 18) + '首页</a>' +
      '<a href="/explore" data-link class="' + (location.pathname.startsWith('/explore') ? 'is-active' : '') + '">' + QSL.icon('grid', 18) + '卡片广场</a>' +
      (user
        ? '<a href="/dashboard" data-link>' + QSL.icon('layout', 18) + '个人中心</a>' +
          '<a href="/dashboard/cards" data-link>' + QSL.icon('cards', 18) + '我的卡片</a>' +
          '<a href="/dashboard/exchanges" data-link>' + QSL.icon('send', 18) + '换卡申请' + pendingBadge(user) + '</a>' +
          '<a href="/dashboard/profile" data-link>' + QSL.icon('user', 18) + '个人资料</a>' +
          (isAdmin ? '<a href="/admin" data-link>' + QSL.icon('shield', 18) + '管理后台</a>' : '') +
          '<button type="button" class="btn btn-ghost btn-block" data-logout>' + QSL.icon('logout', 18) + '退出登录</button>'
        : '<a href="/login" data-link>' + QSL.icon('log-in', 18) + '登录</a>' +
          '<a class="btn btn-primary btn-block" href="/register" data-link>免费注册</a>');

    headerEl.innerHTML =
      '<div class="nav-shell container">' +
      '<a class="brand" href="/" data-link aria-label="QSLink 首页">' +
      '<img class="brand-mark" src="/assets/logo-mark.svg" alt="" width="38" height="38">' +
      '<span class="brand-text"><b>QSLink</b><small>QSL 卡片交换站</small></span></a>' +
      '<nav class="nav-links" aria-label="主导航">' + navLinks(user) + '</nav>' +
      '<div class="nav-actions">' + actionHtml + '</div>' +
      '<button class="nav-toggle" type="button" aria-label="打开菜单" aria-expanded="false">' + QSL.icon('menu', 21) + '</button>' +
      '</div>' +
      '<div class="nav-mobile" id="nav-mobile">' + mobileLinks + '</div>';

    bindHeader();
  }

  function bindHeader() {
    const userEl = document.getElementById('nav-user');
    const userBtn = userEl && userEl.querySelector('.nav-avatar-btn');
    if (userBtn) {
      userBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const open = userEl.classList.toggle('is-open');
        userBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
    const toggle = document.querySelector('.nav-toggle');
    const mobile = document.getElementById('nav-mobile');
    if (toggle && mobile) {
      toggle.addEventListener('click', function () {
        const open = mobile.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        const header = document.querySelector('.site-header');
        if (header) header.classList.toggle('is-menu-open', open);
      });
    }
    document.querySelectorAll('[data-logout]').forEach(function (btn) {
      btn.addEventListener('click', async function (e) {
        e.preventDefault();
        if (btn.disabled) return;
        btn.disabled = true;
        try { await QSL.api.auth.logout(); } catch (err) { /* 忽略网络错误 */ }
        QSL.api.setToken(null);
        QSL.setUser(null);
        QSL.toast('已退出登录，期待下次电波相遇', 'success');
        QSL.navigate('/');
      });
    });
  }

  function closeNav() {
    const mobile = document.getElementById('nav-mobile');
    if (mobile) mobile.classList.remove('is-open');
    const toggle = document.querySelector('.nav-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    const header = document.querySelector('.site-header');
    if (header) header.classList.remove('is-menu-open');
    const userEl = document.getElementById('nav-user');
    if (userEl) {
      userEl.classList.remove('is-open');
      const btn = userEl.querySelector('.nav-avatar-btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  }

  document.addEventListener('click', function (e) {
    const userEl = document.getElementById('nav-user');
    if (userEl && !userEl.contains(e.target)) closeNav();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNav();
  });

  /* ---------------- 页脚 ---------------- */
  function renderFooter() {
    if (!footerEl) return;
    const user = QSL.state.user;
    const accountLinks = user
      ? '<a href="/dashboard" data-link>个人中心</a><a href="/dashboard/cards" data-link>我的卡片</a>' +
        '<a href="/dashboard/exchanges" data-link>换卡申请</a>'
      : '<a href="/login" data-link>登录账号</a><a href="/register" data-link>注册加入</a>' +
        '<a href="/explore" data-link>逛逛广场</a>';
    footerEl.innerHTML =
      '<div class="container">' +
      '<div class="footer-grid">' +
      '<div class="footer-brand">' +
      '<a class="brand" href="/" data-link>' +
      '<img class="brand-mark" src="/assets/logo-mark.svg" alt="" width="38" height="38">' +
      '<span class="brand-text"><b>QSLink</b><small>QSL 卡片交换站</small></span></a>' +
      '<p>收集电波那端的风景，交换一张有温度的卡片。QSLink 为业余无线电爱好者提供 QSL 卡片的展示、点赞与换卡服务。</p>' +
      '</div>' +
      '<div class="footer-col"><h4>探索</h4>' +
      '<a href="/explore" data-link>卡片广场</a>' +
      '<a href="/explore?sort=popular" data-link>热门卡片</a>' +
      '<a href="/explore?sort=latest" data-link>最新上传</a>' +
      '<a href="/#how-it-works" data-link>换卡流程</a></div>' +
      '<div class="footer-col"><h4>我的</h4>' + accountLinks + '</div>' +
      '<div class="footer-col"><h4>关于</h4>' +
      '<a href="/#features" data-link>平台特性</a>' +
      '<a href="/#showcase" data-link>精选展示</a>' +
      '<a href="/#join" data-link>加入我们</a>' +
      '<a href="/#faq" data-link>常见问题</a></div>' +
      '</div>' +
      '<div class="footer-bottom">' +
      '<span>© 2026 QSLink · 由业余无线电爱好者共同建设</span>' +
      '<span>让每一张 QSL 卡片，都抵达对的人 <span class="seventy-three">73!</span></span>' +
      '</div></div>';
  }

  /* ---------------- 路由联动 ---------------- */
  function syncRouteState() {
    closeNav();
    renderFooter(); // 登录态可能变化导致「我的」列变化
    // 更新导航激活态
    const user = QSL.state.user;
    document.querySelectorAll('.nav-links a').forEach(function (a) {
      const href = a.getAttribute('href');
      const path = location.pathname;
      let active = false;
      if (href === '/') active = path === '/';
      else if (href === '/explore') active = path.startsWith('/explore');
      else if (href === '/dashboard/exchanges') active = path.startsWith('/dashboard/exchanges');
      a.classList.toggle('is-active', active);
    });
    document.querySelectorAll('.nav-mobile a').forEach(function (a) {
      const href = a.getAttribute('href');
      if (!href || !href.startsWith('/')) return;
      const path = location.pathname;
      a.classList.toggle('is-active', href === '/' ? path === '/' : path === href);
    });
    void user;
    maybeRefreshUser();
  }

  let lastUserRefresh = 0;
  function maybeRefreshUser() {
    if (!QSL.state.user) return;
    if (!location.pathname.startsWith('/dashboard') && !location.pathname.startsWith('/admin')) return;
    const now = Date.now();
    if (now - lastUserRefresh < 4000) return;
    lastUserRefresh = now;
    QSL.refreshUser().then(function (user) {
      if (user && user.stats) {
        const badgeHost = document.querySelectorAll('.nav-links a[href="/dashboard/exchanges"]');
        // 数量角标在下次 renderHeader 时刷新，这里只做轻量更新
        if (badgeHost.length) {
          const count = user.stats.pendingExchanges || 0;
          badgeHost.forEach(function (a) {
            let badge = a.querySelector('.nav-badge');
            if (count > 0) {
              if (!badge) {
                badge = document.createElement('span');
                badge.className = 'nav-badge';
                a.appendChild(badge);
              }
              badge.textContent = count > 99 ? '99+' : String(count);
            } else if (badge) {
              badge.remove();
            }
          });
        }
      }
    }).catch(function () {});
  }

  /* ---------------- 启动 ---------------- */
  async function boot() {
    try {
      await QSL.boot();
    } catch (err) {
      console.error('[QSL] boot error:', err);
    }
    renderHeader();
    renderFooter();
    if (QSL.fx && typeof QSL.fx.init === 'function') {
      try { QSL.fx.init(); } catch (err) { console.error('[QSL] fx init error:', err); }
    }
    QSL.on('auth', function () {
      renderHeader();
      renderFooter();
    });
    QSL.on('route', function () {
      closeNav();
    });
    QSL.on('route:rendered', syncRouteState);
    if (QSL.router) QSL.router.start();

    // 头部滚动阴影
    let ticking = false;
    const header = document.querySelector('.site-header');
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // 全局未处理异常：只记录，避免打断页面
    window.addEventListener('unhandledrejection', function (e) {
      console.error('[QSL] unhandled rejection:', e.reason);
    });
  }

  boot();
})();
