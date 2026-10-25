/* ============================================================
 * public/js/pages/share.js — 公开分享页（cards-ui）
 * 无需登录即可欣赏 3D 卡片；顶部品牌横幅 + 醒目 CTA 引导注册/登录，
 * next 指回当前分享页。owner 打开时显示「这是你的卡片」。
 * ============================================================ */
(function () {
  'use strict';

  const QSL = window.QSL;
  if (!QSL) return;
  const esc = QSL.escapeHtml;

  function ic(name, size) {
    return QSL.icon ? QSL.icon(name, size) : '';
  }

  function sharePath() {
    return location.pathname + location.search;
  }

  function nextParam(path) {
    return encodeURIComponent(path);
  }

  function goLogin() {
    QSL.navigate('/login?next=' + nextParam(sharePath()));
  }

  function goRegister() {
    QSL.navigate('/register?next=' + nextParam(sharePath()));
  }

  /* flows-ui 提供的换卡弹窗：运行时判断，未就绪 toast + 重试一次 */
  function openExchange(card) {
    const api = window.QSL && window.QSL.exchangeRequest;
    if (api && typeof api.open === 'function') {
      api.open(card);
      return;
    }
    if (QSL.toast) QSL.toast('换卡申请加载中，请稍后再试', 'info');
    setTimeout(function () {
      const retryApi = window.QSL && window.QSL.exchangeRequest;
      if (retryApi && typeof retryApi.open === 'function') {
        retryApi.open(card);
      } else if (QSL.toast) {
        QSL.toast('换卡功能尚未就绪，请刷新页面后重试', 'error');
      }
    }, 900);
  }

  function viewerSkeleton() {
    return (
      '<div class="g-share__viewer-skel">' +
      '<div class="g-skeleton g-share__skel-card"></div>' +
      '<div class="g-skeleton g-skeleton-line" style="width:160px;margin-top:26px"></div>' +
      '</div>'
    );
  }

  function asideSkeleton() {
    return (
      '<div class="g-share__aside-skel">' +
      '<div class="g-skeleton g-skeleton-line" style="width:110px;height:20px"></div>' +
      '<div class="g-skeleton g-skeleton-line" style="width:82%;height:40px;margin-top:18px"></div>' +
      '<div class="g-skeleton g-skeleton-line" style="width:46%;height:16px;margin-top:16px"></div>' +
      '<div class="g-skeleton g-skeleton-line" style="width:100%;height:120px;margin-top:26px"></div>' +
      '</div>'
    );
  }

  function shell() {
    return (
      '<div class="g-share">' +
      '<div class="g-share__crumb">' +
      '<div class="container g-share__crumb-inner">' +
      '<nav class="g-crumbs g-share__breadcrumb" aria-label="面包屑">' +
      '<a href="/" data-link>首页</a><span class="g-crumbs__sep">/</span>' +
      '<a href="/explore" data-link>卡片广场</a><span class="g-crumbs__sep">/</span>' +
      '<span class="g-crumbs__current">QSL 卡片分享</span></nav>' +
      '<span class="g-share__crumb-note">' + ic('globe', 14) +
      '<span>公开分享 · 无需登录即可欣赏 3D 卡片</span></span>' +
      '</div>' +
      '</div>' +
      '<div class="g-share__main container" data-share-main>' +
      '<div class="g-share__lead" data-share-lead hidden></div>' +
      '<div class="g-share__grid">' +
      '<div class="g-share__viewer g-panel" data-share-viewer>' + viewerSkeleton() + '</div>' +
      '<div class="g-share__aside" data-share-aside>' + asideSkeleton() + '</div>' +
      '</div>' +
      '</div>' +
      '<div class="g-share__missing" data-share-missing hidden></div>' +
      '</div>'
    );
  }

  /* ---------------- 查看器 ---------------- */
  function renderViewer(panel, card) {
    panel.classList.add('is-ready');
    panel.innerHTML =
      '<div class="g-share__viewer-deco" aria-hidden="true"></div>' +
      '<div class="g-share__viewer-stage" data-share-viewer-mount aria-label="3D 卡片查看器"></div>' +
      '<div class="g-share__viewer-foot">' +
      '<span class="badge badge-mint">' + ic('3d', 13) + ' 3D 可交互</span>' +
      '<span class="g-share__ratio">' + esc(QSL.ratioLabel(card.ratio)) + '</span>' +
      '<span class="g-share__viewer-note">拖拽旋转 · 双击翻面 · 可切换正反面</span>' +
      '</div>';
    const mount = panel.querySelector('[data-share-viewer-mount]');
    if (!mount || !QSL.card3d) return null;
    return QSL.card3d.create(mount, {
      front: card.frontImage || '',
      back: card.backImage || '',
      ratio: card.ratio || { w: 3, h: 2 },
      width: 480,
      autoRotate: true,
      autoRotateSpeed: 4.2,
      idleDelay: 3400,
      initialYaw: -16,
      initialPitch: 4,
      interactive: true,
      showControls: true,
      initialSide: 'front',
      ambient: true
    });
  }

  /* ---------------- 信息与 CTA ---------------- */
  function ctaHtml(card, owner, user) {
    const isOwner = !!(user && owner && user.id === owner.id) ||
      !!(user && card.owner && user.id === card.owner.id) ||
      !!(card.isOwner);
    const myExchange = card.myExchange || null;
    const ownerName = owner.callSign || owner.displayName || owner.username || '卡片主人';

    if (!user) {
      return (
        '<div class="g-share__cta is-guest">' +
        '<div class="g-share__cta-icon">' + ic('send', 22) + '</div>' +
        '<h2>喜欢这张卡片？</h2>' +
        '<p>注册 QSLink 账号，就能向 ' + esc(ownerName) + ' 申请换卡，收集属于你的 QSL 卡片。</p>' +
        '<div class="g-share__cta-actions">' +
        '<button class="btn btn-primary btn-lg" type="button" data-guest-register>' +
        ic('sparkles', 17) + '<span>注册并申请换卡</span></button>' +
        '<button class="btn btn-ghost" type="button" data-guest-login>已有账号，登录</button>' +
        '</div>' +
        '<span class="g-share__cta-hint">' + ic('lock', 13) + ' 地址只在双方同意后可见</span>' +
        '</div>'
      );
    }

    if (isOwner) {
      return (
        '<div class="g-share__cta is-owner">' +
        '<div class="g-share__cta-icon">' + ic('user', 22) + '</div>' +
        '<h2>这是你的卡片</h2>' +
        '<p>朋友正在欣赏你的 QSL 卡片。把链接分享给更多火腿，让这张卡片抵达对的人。</p>' +
        '<div class="g-share__cta-actions">' +
        '<button class="btn btn-primary" type="button" data-copy-share>' + ic('copy', 16) + '复制分享链接</button>' +
        '<a class="btn btn-ghost" href="/dashboard/cards/' + encodeURIComponent(card.id) + '/edit" data-link>' +
        ic('edit', 16) + '编辑卡片</a>' +
        '<a class="btn btn-ghost" href="/dashboard/cards" data-link>' + ic('cards', 16) + '我的卡片</a>' +
        '</div>' +
        '</div>'
      );
    }

    if (myExchange && myExchange.status === 'pending') {
      return (
        '<div class="g-share__cta is-pending">' +
        '<div class="g-share__cta-icon">' + ic('clock', 22) + '</div>' +
        '<h2>申请已送达</h2>' +
        '<p>你已向 ' + esc(ownerName) + ' 提交换卡申请，耐心等待对方回应吧。</p>' +
        '<div class="g-share__cta-actions">' +
        '<a class="btn btn-primary" href="/dashboard/exchanges" data-link>' + ic('send', 16) + '查看我的申请</a>' +
        '<a class="btn btn-ghost" href="/explore" data-link>继续逛广场</a>' +
        '</div>' +
        '</div>'
      );
    }

    if (myExchange && myExchange.status === 'approved') {
      return (
        '<div class="g-share__cta is-ok">' +
        '<div class="g-share__cta-icon">' + ic('check-circle', 22) + '</div>' +
        '<h2>已达成交换</h2>' +
        '<p>对方已经同意了你的换卡申请，去换卡申请页查看地址并寄出卡片吧。</p>' +
        '<div class="g-share__cta-actions">' +
        '<a class="btn btn-primary" href="/dashboard/exchanges" data-link>' + ic('send', 16) + '查看地址</a>' +
        '</div>' +
        '</div>'
      );
    }

    return (
      '<div class="g-share__cta is-user">' +
      '<div class="g-share__cta-icon">' + ic('send', 22) + '</div>' +
      '<h2>想和 ' + esc(ownerName) + ' 交换这张卡片吗？</h2>' +
      '<p>提交换卡申请并填写邮寄地址，对方同意后即可互相查看地址、互寄卡片。</p>' +
      '<div class="g-share__cta-actions">' +
      '<button class="btn btn-primary btn-lg" type="button" data-apply>' + ic('send', 17) + '<span>申请换卡</span></button>' +
      '<a class="btn btn-ghost" href="/explore" data-link>再看看其它卡片</a>' +
      '</div>' +
      '<span class="g-share__cta-hint">' + ic('lock', 13) + ' 地址只在双方同意后可见 · 73</span>' +
      '</div>'
    );
  }

  function renderAside(container, card, owner, state) {
    const aside = container.querySelector('[data-share-aside]');
    if (!aside) return;
    const user = QSL.state && QSL.state.user;
    const isOwner = !!(user && owner && user.id === owner.id) ||
      !!(user && card.owner && user.id === card.owner.id) ||
      !!(card.isOwner);
    const status = card.status || 'approved';

    let notice = '';
    if (isOwner && status !== 'approved') {
      notice =
        '<div class="g-share__notice is-warn">' + ic('clock', 15) +
        '<span>这张卡片' + esc(QSL.statusText ? QSL.statusText(status) : status) +
        '中，分享链接暂时只对你有意义；审核通过后所有人可见。</span></div>';
    }

    aside.innerHTML =
      '<div class="g-share__badges">' +
      (QSL.badge && ((owner && owner.callSign) || card.callSign)
        ? QSL.badge((owner && owner.callSign) || card.callSign, 'sky')
        : '') +
      (QSL.badge ? QSL.badge(QSL.ratioLabel(card.ratio), 'slate') : '') +
      '<span class="badge badge-mint">' + ic('share', 12) + ' 公开分享</span>' +
      (status !== 'approved' && QSL.statusBadge ? QSL.statusBadge(status) : '') +
      '</div>' +
      '<h1 class="g-share__title">' + esc(card.title || '未命名卡片') + '</h1>' +
      '<div class="g-share__owner">' +
      (QSL.ownerLine ? QSL.ownerLine(owner || card.owner || {}) : esc((owner && (owner.displayName || owner.username)) || '未知火腿')) +
      '<span class="g-share__date">' + esc(QSL.timeAgo(card.createdAt)) + '分享</span>' +
      '</div>' +
      (card.notes
        ? '<p class="g-share__notes">' + esc(card.notes) + '</p>'
        : '<p class="g-share__notes is-empty">这张卡片的主人还没有留下简介。</p>') +
      '<dl class="g-share__meta">' +
      '<div><dt>卡片比例</dt><dd>' + esc(QSL.ratioLabel(card.ratio)) + '</dd></div>' +
      '<div><dt>点赞</dt><dd>' + esc(QSL.formatNumber(card.likeCount || 0)) + '</dd></div>' +
      '<div><dt>换卡</dt><dd>' + esc(String(card.exchangeCount || 0)) + ' 次</dd></div>' +
      '<div><dt>发布时间</dt><dd>' + esc(QSL.formatDate(card.createdAt)) + '</dd></div>' +
      '</dl>' +
      notice +
      ctaHtml(card, owner || card.owner || {}, user);

    // 访客注册引导在手机端单列时会被排到卡片下方，额外放一份到顶部，由 CSS 按屏宽切换显示。
    const lead = container.querySelector('[data-share-lead]');
    if (lead) {
      lead.innerHTML = user ? '' : ctaHtml(card, owner || card.owner || {}, user);
      lead.hidden = !!user;
    }

    container.querySelectorAll('[data-guest-register]').forEach(function (btn) {
      btn.addEventListener('click', goRegister);
    });
    container.querySelectorAll('[data-guest-login]').forEach(function (btn) {
      btn.addEventListener('click', goLogin);
    });
    const applyBtn = aside.querySelector('[data-apply]');
    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        if (!QSL.state || !QSL.state.user) {
          goLogin();
          return;
        }
        openExchange(card);
      });
    }
    const copyBtn = aside.querySelector('[data-copy-share]');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        const url = location.origin + sharePath();
        if (QSL.copyText) QSL.copyText(url, '分享链接已复制，快发给朋友吧');
      });
    }
    void state;
  }

  /* ---------------- 404 / 错误 ---------------- */
  function renderMissing(container, isNotFound, retry) {
    const main = container.querySelector('[data-share-main]');
    const missing = container.querySelector('[data-share-missing]');
    if (main) main.hidden = true;
    if (!missing) return;
    missing.hidden = false;
    missing.innerHTML =
      '<div class="g-share__missing-inner">' +
      '<div class="g-share__missing-art">' +
      (isNotFound ? '404' : ic('alert', 40)) +
      '</div>' +
      '<h1 class="g-display">' + (isNotFound ? '这张分享卡片不在了' : '分享页加载失败') + '</h1>' +
      '<p>' + (isNotFound
        ? '链接可能已失效、卡片尚未通过审核，或者已经被主人删除。去卡片广场看看其它卡片吧。'
        : '电波暂时有点杂音，请稍后重试。') +
      '</p>' +
      '<div class="btn-group">' +
      (isNotFound ? '' : '<button class="btn btn-primary" type="button" data-retry>重新加载</button>') +
      '<a class="btn ' + (isNotFound ? 'btn-primary' : 'btn-ghost') + '" href="/explore" data-link>' +
      ic('grid', 16) + '<span>去卡片广场</span></a>' +
      '<a class="btn btn-ghost" href="/" data-link>返回首页</a>' +
      '</div>' +
      '<p class="g-share__missing-tip">' + ic('sparkles', 14) +
      '<span>在 QSLink，每一张 QSL 卡片都值得被看见。</span></p>' +
      '</div>';
    const btn = missing.querySelector('[data-retry]');
    if (btn && retry) btn.addEventListener('click', retry);
  }

  /* ---------------- 页面注册 ---------------- */
  QSL.registerPage('share', {
    title: 'QSL 卡片分享',
    render: function (container, ctx) {
      const params = (ctx && ctx.params) || {};
      const token = params.token || (location.pathname.split('/')[2] || '');
      const state = { cancelled: false, viewer: null };

      container.innerHTML = shell();

      function load() {
        if (state.cancelled) return;
        if (!token) {
          renderMissing(container, true, null);
          return;
        }
        const cardsApi = QSL.api && QSL.api.cards;
        if (!cardsApi || typeof cardsApi.publicGet !== 'function') {
          renderMissing(container, false, load);
          return;
        }
        cardsApi.publicGet(token).then(function (res) {
          if (state.cancelled) return;
          const card = (res && res.card) || null;
          const owner = (res && res.owner) || (card && card.owner) || {};
          if (!card) {
            renderMissing(container, true, null);
            return;
          }
          const viewerPanel = container.querySelector('[data-share-viewer]');
          if (viewerPanel) state.viewer = renderViewer(viewerPanel, card);
          renderAside(container, card, owner, state);
          try { document.title = (card.title || 'QSL 卡片分享') + ' · QSLink'; } catch (err) { /* 忽略 */ }
        }).catch(function (err) {
          if (state.cancelled) return;
          const notFound = !!err && (err.status === 404 || err.code === 'NOT_FOUND');
          renderMissing(container, notFound, load);
          if (!notFound && QSL.toast) QSL.toast((err && err.message) || '分享页加载失败，请稍后重试', 'error');
        });
      }

      load();

      return function cleanup() {
        state.cancelled = true;
        if (state.viewer) {
          try { state.viewer.destroy(); } catch (err) { /* 忽略 */ }
          state.viewer = null;
        }
      };
    }
  });
})();
