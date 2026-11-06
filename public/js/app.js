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
      ("<span>" + QSL.escapeHtml(QSL.t("正在连接 QSLink 电波…")) + "</span></div>");
  }

  /* ---------------- 顶部导航 ---------------- */
  const headerEl = document.getElementById('site-header');
  const footerEl = document.getElementById('site-footer');

  const contestPath = '/events/qsl-design-2026-11';
  function isContestRoute() {
    return location.pathname === contestPath || location.pathname === contestPath + '/registration' ||
      location.pathname === contestPath + '/works';
  }
  let contestOpen = isContestRoute();
  let lastContestRoute = location.pathname;

  function contestToggle(size, mobile) {
    return '<button type="button" class="nav-contest-toggle" data-contest-toggle aria-expanded="' +
      contestOpen + '" aria-controls="nav-contest-' + (mobile ? 'mobile' : 'desktop') + '">' +
      QSL.icon('trophy', size) + '<span>' + QSL.escapeHtml(QSL.t('QSL设计大赛-2026.11')) +
      '</span>' + QSL.icon('chevron-down', 14) + '</button>';
  }

  function contestPanel(mobile) {
    const links = [
      { href: contestPath, label: '比赛信息' },
      { href: contestPath + '/registration', label: '比赛报名' },
      { href: contestPath + '/works', label: '参赛作品' }
    ];
    return '<div class="nav-contest-panel" data-contest-panel id="nav-contest-' +
      (mobile ? 'mobile' : 'desktop') + '"><div class="nav-contest-clip"><nav class="nav-contest-links" aria-label="' +
      QSL.escapeHtml(QSL.t('QSL设计大赛-2026.11')) + '">' + links.map(function (link) {
        const active = location.pathname === link.href;
        return '<a href="' + link.href + '" data-link class="' + (active ? 'is-active' : '') + '"' +
          (active ? ' aria-current="page"' : '') + '>' + QSL.escapeHtml(QSL.t(link.label)) + '</a>';
      }).join('') + '</nav></div></div>';
  }

  function mobileContestMenu() {
    return '<div class="nav-contest-group">' + contestToggle(18, true) + contestPanel(true) + '</div>';
  }

  function setContestOpen(open) {
    contestOpen = open;
    if (!headerEl) return;
    headerEl.classList.toggle('is-contest-open', open);
    headerEl.querySelectorAll('[data-contest-toggle]').forEach(function (button) {
      button.setAttribute('aria-expanded', String(open));
      button.classList.toggle('is-active', isContestRoute());
    });
    headerEl.querySelectorAll('[data-contest-panel]').forEach(function (panel) {
      if (!open && panel.contains(document.activeElement)) {
        headerEl.querySelector('[aria-controls="' + panel.id + '"]').focus();
      }
      panel.inert = !open;
      panel.setAttribute('aria-hidden', String(!open));
      panel.querySelectorAll('a').forEach(function (link) {
        const active = location.pathname === link.getAttribute('href');
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    });
  }

  function contestMenuLink(size) {
    return '<a href="' + contestPath + '" data-link class="nav-contest' +
      (location.pathname === contestPath ? ' is-active' : '') + '">' + QSL.icon('trophy', size) +
      '<span>' + QSL.escapeHtml(QSL.t('QSL设计大赛-2026.11')) + '</span></a>';
  }

  function logbookMenuLink(size) {
    return '<a href="/dashboard/logbook" data-link>' + QSL.icon('list', size) + (QSL.escapeHtml(QSL.t("通联日志")) + "</a>");
  }

  function navLinks(user) {
    const path = location.pathname;
    const links = [
      { href: '/', label: QSL.t("首页"), icon: 'sparkles', match: '/' },
      { href: '/explore', label: QSL.t("卡片广场"), icon: 'grid', match: '/explore' }
    ];
    if (user) links.push({ href: '/dashboard/exchanges', label: QSL.t("换卡申请"), icon: 'send', match: '/dashboard/exchanges' });
    if (user) links.push({ href: '/dashboard/logbook', label: QSL.t("通联日志"), icon: 'list', match: '/dashboard/logbook' });
    return links
      .map(function (link) {
        const active = path === link.match || (link.match === '/explore' && path.startsWith('/explore'));
        return (
          '<a href="' + link.href + '" data-link class="' + (active ? 'is-active' : '') + '">' +
          QSL.icon(link.icon, 17) + '<span>' + link.label + '</span></a>'
        );
      })
      .join('') + contestToggle(17, false);
  }

  function pendingBadge(user) {
    if (!user || !user.stats) return '';
    const count = user.stats.pendingExchanges || 0;
    if (!count) return '';
    return ("<span class=\"nav-badge\" title=\"" + QSL.escapeHtml(QSL.t("待处理的换卡申请")) + "\">") + (count > 99 ? '99+' : count) + '</span>';
  }

  function languageButton() {
    const english = QSL.i18n.language === 'en';
    const label = english ? '切换到中文' : 'Switch to English';
    return '<button class="btn btn-ghost btn-sm nav-language" type="button" data-language ' +
      'aria-label="' + label + '" title="' + label + '">' +
      '<span lang="' + (english ? 'zh-CN' : 'en') + '">' + (english ? '中文' : 'EN') + '</span></button>';
  }

  function renderHeader() {
    if (!headerEl) return;
    const user = QSL.state.user;
    const isAdmin = user && user.role === 'admin';
    const avatarHtml = user ? QSL.avatar(user, 30) : '';

    const actionHtml = user
      ? '<a class="btn btn-soft btn-sm nav-upload-btn" href="/dashboard/cards/new" data-link>' +
        QSL.icon('plus', 16) + ("<span class=\"hide-sm\">" + QSL.escapeHtml(QSL.t("上传卡片")) + "</span></a>") +
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
        '<a href="/dashboard" data-link>' + QSL.icon('layout', 17) + (QSL.escapeHtml(QSL.t("个人中心")) + "</a>") +
        '<a href="/dashboard/cards" data-link>' + QSL.icon('cards', 17) + (QSL.escapeHtml(QSL.t("我的卡片")) + "</a>") +
        '<a href="/dashboard/exchanges" data-link>' + QSL.icon('send', 17) + QSL.t("换卡申请") + pendingBadge(user) + '</a>' +
        logbookMenuLink(17) + contestMenuLink(17) +
        '<a href="/dashboard/profile" data-link>' + QSL.icon('user', 17) + (QSL.escapeHtml(QSL.t("个人资料")) + "</a>") +
        (isAdmin ? '<div class="menu-sep"></div><a class="menu-admin" href="/admin" data-link>' + QSL.icon('shield', 17) + (QSL.escapeHtml(QSL.t("管理后台")) + "</a>") : '') +
        '<div class="menu-sep"></div>' +
        '<button type="button" class="menu-danger" data-logout>' + QSL.icon('logout', 17) + (QSL.escapeHtml(QSL.t("退出登录")) + "</button>") +
        '</div></div>'
      : '<div class="nav-guest">' +
        ("<a class=\"btn btn-ghost btn-sm\" href=\"/login\" data-link>" + QSL.escapeHtml(QSL.t("登录")) + "</a>") +
        ("<a class=\"btn btn-primary btn-sm\" href=\"/register\" data-link>" + QSL.escapeHtml(QSL.t("免费注册")) + "</a>") +
        '</div>';

    const mobileLinks =
      '<a href="/" data-link class="' + (location.pathname === '/' ? 'is-active' : '') + '">' + QSL.icon('sparkles', 18) + (QSL.escapeHtml(QSL.t("首页")) + "</a>") +
      '<a href="/explore" data-link class="' + (location.pathname.startsWith('/explore') ? 'is-active' : '') + '">' + QSL.icon('grid', 18) + (QSL.escapeHtml(QSL.t("卡片广场")) + "</a>") +
      (user
        ? '<a href="/dashboard" data-link>' + QSL.icon('layout', 18) + (QSL.escapeHtml(QSL.t("个人中心")) + "</a>") +
          '<a href="/dashboard/cards" data-link>' + QSL.icon('cards', 18) + (QSL.escapeHtml(QSL.t("我的卡片")) + "</a>") +
          '<a href="/dashboard/exchanges" data-link>' + QSL.icon('send', 18) + QSL.t("换卡申请") + pendingBadge(user) + '</a>' +
          logbookMenuLink(18) + mobileContestMenu() +
          '<a href="/dashboard/profile" data-link>' + QSL.icon('user', 18) + (QSL.escapeHtml(QSL.t("个人资料")) + "</a>") +
          (isAdmin ? '<a href="/admin" data-link>' + QSL.icon('shield', 18) + (QSL.escapeHtml(QSL.t("管理后台")) + "</a>") : '') +
          '<button type="button" class="btn btn-ghost btn-block" data-logout>' + QSL.icon('logout', 18) + (QSL.escapeHtml(QSL.t("退出登录")) + "</button>")
        : mobileContestMenu() + '<a href="/login" data-link>' + QSL.icon('log-in', 18) + (QSL.escapeHtml(QSL.t("登录")) + "</a>"));

    headerEl.innerHTML =
      '<div class="nav-shell container"><div class="nav-main-row">' +
      ("<a class=\"brand\" href=\"/\" data-link aria-label=\"" + QSL.escapeHtml(QSL.t("QSLink 首页")) + "\">") +
      '<img class="brand-mark" src="/assets/logo-mark.svg" alt="" width="38" height="38">' +
      ("<span class=\"brand-text\"><b>QSLink</b><small>" + QSL.escapeHtml(QSL.t("QSL 卡片交换站")) + "</small></span></a>") +
      ("<nav class=\"nav-links\" aria-label=\"" + QSL.escapeHtml(QSL.t("主导航")) + "\">") + navLinks(user) + '</nav>' +
      '<div class="nav-actions">' + languageButton() + actionHtml + '</div>' +
      ("<button class=\"nav-toggle\" type=\"button\" aria-label=\"" + QSL.escapeHtml(QSL.t("打开菜单")) + "\" aria-expanded=\"false\">") + QSL.icon('menu', 21) + '</button>' +
      '</div>' + contestPanel(false) + '</div>' +
      '<div class="nav-mobile" id="nav-mobile">' + mobileLinks + '</div>';

    setContestOpen(contestOpen);
    bindHeader();
  }

  function bindHeader() {
    headerEl.querySelectorAll('[data-contest-toggle]').forEach(function (button) {
      button.addEventListener('click', function () {
        const open = !contestOpen;
        setContestOpen(open);
        if (open) QSL.navigate(contestPath);
      });
      button.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowDown') return;
        event.preventDefault();
        setContestOpen(true);
        document.getElementById(button.getAttribute('aria-controls')).querySelector('a').focus();
      });
    });
    headerEl.querySelector('[data-language]').addEventListener('click', function () {
      QSL.i18n.switchLanguage();
    });
    const userEl = document.getElementById('nav-user');
    const userBtn = userEl && userEl.querySelector('.nav-avatar-btn');
    if (userBtn) {
      userBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        // Anchor the unfolding panel to the avatar, including when the name
        // is hidden on narrow screens or changes the trigger's width.
        const avatar = userBtn.querySelector('.avatar');
        if (avatar) {
          const buttonRect = userBtn.getBoundingClientRect();
          const avatarRect = avatar.getBoundingClientRect();
          userEl.style.setProperty('--nav-menu-anchor-right',
            (buttonRect.right - avatarRect.left - avatarRect.width / 2) + 'px');
        }
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
        QSL.toast(QSL.t("已退出登录，期待下次电波相遇"), 'success');
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
    if (userEl && !userEl.contains(e.target)) {
      userEl.classList.remove('is-open');
      const btn = userEl.querySelector('.nav-avatar-btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
    if (!e.target.closest('[data-contest-toggle], [data-contest-panel], .nav-toggle')) setContestOpen(false);
    if (!e.target.closest('.site-header')) closeNav();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      const panel = document.activeElement && document.activeElement.closest('[data-contest-panel]');
      if (panel) headerEl.querySelector('[aria-controls="' + panel.id + '"]').focus();
      setContestOpen(false);
      const mobile = document.getElementById('nav-mobile');
      if (mobile && mobile.contains(document.activeElement)) {
        headerEl.querySelector('.nav-toggle').focus();
      }
      closeNav();
    }
  });

  /* ---------------- 页脚 ---------------- */
  function renderFooter() {
    if (!footerEl) return;
    const user = QSL.state.user;
    const accountLinks = user
      ? ("<a href=\"/dashboard\" data-link>" + QSL.escapeHtml(QSL.t("个人中心")) + "</a><a href=\"/dashboard/cards\" data-link>" + QSL.escapeHtml(QSL.t("我的卡片")) + "</a>") +
        ("<a href=\"/dashboard/exchanges\" data-link>" + QSL.escapeHtml(QSL.t("换卡申请")) + "</a>")
      : ("<a href=\"/login\" data-link>" + QSL.escapeHtml(QSL.t("登录账号")) + "</a><a href=\"/register\" data-link>" + QSL.escapeHtml(QSL.t("注册加入")) + "</a>") +
        ("<a href=\"/explore\" data-link>" + QSL.escapeHtml(QSL.t("逛逛广场")) + "</a>");
    footerEl.innerHTML =
      '<div class="container">' +
      '<div class="footer-grid">' +
      '<div class="footer-brand">' +
      '<a class="brand" href="/" data-link>' +
      '<img class="brand-mark" src="/assets/logo-mark.svg" alt="" width="38" height="38">' +
      ("<span class=\"brand-text\"><b>QSLink</b><small>" + QSL.escapeHtml(QSL.t("QSL 卡片交换站")) + "</small></span></a>") +
      ("<p>" + QSL.escapeHtml(QSL.t("收集电波那端的风景，交换一张有温度的卡片。QSLink 为业余无线电爱好者提供 QSL 卡片的展示、点赞与换卡服务。")) + "</p>") +
      '</div>' +
      ("<div class=\"footer-col\"><h4>" + QSL.escapeHtml(QSL.t("探索")) + "</h4>") +
      ("<a href=\"/explore\" data-link>" + QSL.escapeHtml(QSL.t("卡片广场")) + "</a>") +
      ("<a href=\"/explore?sort=popular\" data-link>" + QSL.escapeHtml(QSL.t("热门卡片")) + "</a>") +
      ("<a href=\"/explore?sort=latest\" data-link>" + QSL.escapeHtml(QSL.t("最新上传")) + "</a>") +
      ("<a href=\"/#how-it-works\" data-link>" + QSL.escapeHtml(QSL.t("换卡流程")) + "</a></div>") +
      ("<div class=\"footer-col\"><h4>" + QSL.escapeHtml(QSL.t("我的")) + "</h4>") + accountLinks + '</div>' +
      ("<div class=\"footer-col\"><h4>" + QSL.escapeHtml(QSL.t("关于")) + "</h4>") +
      ("<a href=\"/#features\" data-link>" + QSL.escapeHtml(QSL.t("平台特性")) + "</a>") +
      ("<a href=\"/#showcase\" data-link>" + QSL.escapeHtml(QSL.t("精选展示")) + "</a>") +
      ("<a href=\"/#join\" data-link>" + QSL.escapeHtml(QSL.t("加入我们")) + "</a>") +
      ("<a href=\"/#faq\" data-link>" + QSL.escapeHtml(QSL.t("常见问题")) + "</a>") +
      ("<a href=\"/legal/terms.html\" target=\"_blank\" rel=\"noopener\">" + QSL.escapeHtml(QSL.t("用户条款")) + "</a>") +
      ("<a href=\"/legal/privacy.html\" target=\"_blank\" rel=\"noopener\">" + QSL.escapeHtml(QSL.t("隐私说明")) + "</a></div>") +
      '</div>' +
      '<div class="footer-bottom">' +
      ("<span>" + QSL.escapeHtml(QSL.t("© 2026 QSLink · 9ham.net · 联系我们：")) + "<a href=\"mailto:services@9ham.net\">services@9ham.net</a></span>") +
      ("<div class=\"footer-signoff\"><span>" + QSL.escapeHtml(QSL.t("让每一张 QSL 卡片，都抵达对的人")) + " <span class=\"seventy-three\">73!</span></span>") +
      '<small class="footer-build">' + QSL.escapeHtml(QSL.footerBuildText(QSL.state.config && QSL.state.config.build)) + '</small></div>' +
      '</div></div>';
  }

  /* ---------------- 路由联动 ---------------- */
  function syncRouteState() {
    const changed = lastContestRoute !== location.pathname;
    lastContestRoute = location.pathname;
    if (changed) setContestOpen(isContestRoute());
    else setContestOpen(contestOpen);
    if (!isContestRoute()) closeNav();
    renderFooter(); // 登录态可能变化导致「我的」列变化
    // 更新导航激活态
    const user = QSL.state.user;
    document.querySelectorAll('.nav-links a').forEach(function (a) {
      const href = a.getAttribute('href');
      const path = location.pathname;
      let active = false;
      if (href === '/') active = path === '/';
      else if (href === '/explore') active = path.startsWith('/explore');
      else if (href === '/dashboard/logbook' || href === contestPath) active = path === href;
      else if (href === '/dashboard/exchanges') active = path.startsWith('/dashboard/exchanges');
      a.classList.toggle('is-active', active);
    });
    document.querySelectorAll('.nav-mobile a, .nav-user-menu a').forEach(function (a) {
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
      if (!isContestRoute()) closeNav();
    });
    QSL.on('route:before', QSL.i18n.resetEdits);
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

  const skip = document.querySelector('.skip-link');
  if (skip) skip.textContent = QSL.t('跳到主要内容');
  const description = document.querySelector('meta[name="description"]');
  if (description && QSL.i18n.language === 'en') description.content =
    'A QSL card exchange community for amateur radio operators. Upload double-sided cards, explore them in 3D, and exchange cards with fellow hams.';
  boot();
})();
