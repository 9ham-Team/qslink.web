/* ============================================================
 * public/js/pages/card-detail.js — 卡片详情（cards-ui）
 * 左：3D 大查看器（内置控制条）；右：信息与操作。
 * 申请换卡通过运行时调用 window.QSL.exchangeRequest.open(card)（flows-ui 提供）。
 * ============================================================ */
(function () {
  'use strict';

  const QSL = window.QSL;
  if (!QSL) return;
  const esc = QSL.escapeHtml;

  function ic(name, size) {
    return QSL.icon ? QSL.icon(name, size) : '';
  }

  function toNextLogin() {
    const next = encodeURIComponent(location.pathname + location.search);
    QSL.navigate('/login?next=' + next);
  }

  /* 换卡申请：flows-ui 在 exchanges.js 中注册 QSL.exchangeRequest（脚本加载即注册），
     但本文件先于 exchanges.js 加载，因此只能在运行时判断，且未就绪时重试一次。 */
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
      '<div class="g-detail__viewer-skel">' +
      '<div class="g-skeleton g-detail__skel-card"></div>' +
      '<div class="g-skeleton g-skeleton-line" style="width:150px;margin-top:26px"></div>' +
      '</div>'
    );
  }

  function infoSkeleton() {
    return (
      '<div class="g-detail__info-skel">' +
      '<div class="g-skeleton g-skeleton-line" style="width:120px;height:22px"></div>' +
      '<div class="g-skeleton g-skeleton-line" style="width:76%;height:38px;margin-top:18px"></div>' +
      '<div class="g-skeleton g-skeleton-line" style="width:44%;height:18px;margin-top:16px"></div>' +
      '<div class="g-skeleton g-skeleton-line" style="width:100%;height:82px;margin-top:26px"></div>' +
      '<div class="g-skeleton g-skeleton-line" style="width:100%;height:64px;margin-top:24px"></div>' +
      '</div>'
    );
  }

  function pageShell() {
    return (
      '<div class="g-detail">' +
      '<div class="container">' +
      '<nav class="g-crumbs" aria-label="面包屑" data-reveal>' +
      '<a href="/" data-link>首页</a><span class="g-crumbs__sep">/</span>' +
      '<a href="/explore" data-link>卡片广场</a><span class="g-crumbs__sep">/</span>' +
      '<span class="g-crumbs__current" data-crumb-current>卡片详情</span>' +
      '</nav>' +
      '<div class="g-detail__grid">' +
      '<div class="g-detail__viewer g-panel" data-detail-viewer>' + viewerSkeleton() + '</div>' +
      '<div class="g-detail__info" data-detail-info>' + infoSkeleton() + '</div>' +
      '</div>' +
      '<section class="g-detail__reco" data-detail-reco hidden>' +
      '<div class="g-sec-head" data-reveal>' +
      '<div><p class="eyebrow">MORE CARDS</p><h2 class="g-sec-title">同好推荐</h2>' +
      '<p class="g-sec-desc">广场里，也许还有你想交换的卡片。</p></div>' +
      '<a class="g-sec-link" href="/explore" data-link>去广场看看' + ic('arrow-right', 16) + '</a>' +
      '</div>' +
      '<div class="g-detail__reco-grid" data-reco-grid></div>' +
      '</section>' +
      '</div>' +
      '</div>'
    );
  }

  /* ---------------- 详情主视图 ---------------- */
  function renderViewer(panel, card) {
    panel.classList.add('is-ready');
    panel.innerHTML =
      '<div class="g-detail__viewer-deco" aria-hidden="true"></div>' +
      '<div class="g-detail__viewer-stage" data-viewer-mount aria-label="3D 卡片查看器"></div>' +
      '<div class="g-detail__viewer-foot">' +
      '<span class="badge badge-mint">' + ic('3d', 13) + ' 3D 可交互</span>' +
      '<span class="g-detail__ratio">' + esc(QSL.ratioLabel(card.ratio)) + '</span>' +
      '<span class="g-detail__viewer-note">拖拽旋转 · 双击翻面</span>' +
      '</div>';
    const mount = panel.querySelector('[data-viewer-mount]');
    if (!mount || !QSL.card3d) return null;
    return QSL.card3d.create(mount, {
      front: card.frontImage || '',
      back: card.backImage || '',
      ratio: card.ratio || { w: 3, h: 2 },
      width: 430,
      autoRotate: true,
      autoRotateSpeed: 4.6,
      idleDelay: 3200,
      initialYaw: -16,
      initialPitch: 4,
      interactive: true,
      showControls: true,
      initialSide: 'front',
      ambient: true
    });
  }

  function metaItem(label, value) {
    return '<div class="g-detail__meta-item"><dt>' + esc(label) + '</dt><dd>' + value + '</dd></div>';
  }

  function renderInfo(info, card, owner) {
    const user = QSL.state && QSL.state.user;
    const isOwner = !!(card.isOwner || (user && card.owner && user.id === card.owner.id) || (user && owner && user.id === owner.id));
    const ownerData = owner || card.owner || {};
    const myExchange = card.myExchange || null;
    const canApply = card.canApply !== false;
    const status = card.status || 'approved';

    let applyHtml = '';
    let noticeHtml = '';

    if (isOwner) {
      applyHtml =
        '<a class="btn btn-primary btn-lg" href="/dashboard/cards/' + encodeURIComponent(card.id) + '/edit" data-link>' +
        ic('edit', 17) + '<span>编辑这张卡片</span></a>' +
        '<a class="btn btn-soft" href="/dashboard/cards" data-link>' + ic('cards', 16) + '<span>我的卡片</span></a>';
      noticeHtml =
        '<div class="g-detail__notice is-owner">' + ic('user', 16) +
        '<span>这是你的卡片，你可以编辑它、查看分享链接，或等待火腿们的换卡申请。' +
        '<a href="/dashboard/exchanges" data-link>查看换卡申请</a></span></div>';
      if (status !== 'approved') {
        noticeHtml =
          '<div class="g-detail__notice is-warn">' + ic('clock', 16) +
          '<span>这张卡片' + esc(QSL.statusText ? QSL.statusText(status) : status) +
          '中，仅你自己可见；审核通过后才会出现在卡片广场。</span></div>' + noticeHtml;
      }
    } else if (myExchange && myExchange.status === 'pending') {
      applyHtml = '<button class="btn btn-soft btn-lg" type="button" disabled>' + ic('clock', 17) +
        '<span>申请处理中</span></button>';
      noticeHtml =
        '<div class="g-detail__notice is-pending">' + ic('clock', 16) +
        '<span>你已提交换卡申请，等待对方处理 · ' +
        '<a href="/dashboard/exchanges" data-link>查看我的申请</a></span></div>';
    } else if (myExchange && myExchange.status === 'approved') {
      applyHtml = '<a class="btn btn-primary btn-lg" href="/dashboard/exchanges" data-link>' + ic('check-circle', 17) +
        '<span>已达成交换</span></a>';
      noticeHtml =
        '<div class="g-detail__notice is-ok">' + ic('check-circle', 16) +
        '<span>对方已同意你的换卡申请，去换卡申请页查看地址并寄出卡片吧。</span></div>';
    } else if (!canApply) {
      applyHtml = '<button class="btn btn-ghost btn-lg" type="button" disabled>' + ic('send', 17) +
        '<span>暂不可申请</span></button>';
    } else {
      applyHtml = '<button class="btn btn-primary btn-lg" type="button" data-apply>' + ic('send', 17) +
        '<span>申请换卡</span></button>';
      if (myExchange && (myExchange.status === 'rejected' || myExchange.status === 'cancelled')) {
        noticeHtml =
          '<div class="g-detail__notice is-muted">' + ic('info', 16) +
          '<span>你之前的申请' + esc(QSL.exchangeText ? QSL.exchangeText(myExchange.status) : '已结束') +
          '，可以重新申请。</span></div>';
      }
    }

    const notes = card.notes
      ? '<p class="g-detail__notes">' + esc(card.notes) + '</p>'
      : '<p class="g-detail__notes is-empty">这张卡片的主人还没有留下简介。</p>';

    info.innerHTML =
      '<div class="g-detail__badges">' +
      (QSL.badge && (card.callSign || ownerData.callSign)
        ? QSL.badge(card.callSign || ownerData.callSign, 'sky')
        : '') +
      (QSL.badge ? QSL.badge(QSL.ratioLabel(card.ratio), 'slate') : '') +
      (status !== 'approved' && QSL.statusBadge ? QSL.statusBadge(status) : '') +
      '</div>' +
      '<h1 class="g-detail__title">' + esc(card.title || '未命名卡片') + '</h1>' +
      '<div class="g-detail__owner">' +
      (ownerData.uid ? '<a href="/space/' + esc(ownerData.uid) + '" data-link aria-label="查看上传者的公开主页">' : '') +
      (QSL.ownerLine ? QSL.ownerLine(ownerData) : esc(ownerData.displayName || ownerData.username || '未知火腿')) +
      (ownerData.uid ? '</a>' : '') +
      '<span class="g-detail__owner-time">' + esc(QSL.timeAgo(card.createdAt)) + '发布</span>' +
      '</div>' +
      notes +
      '<dl class="g-detail__meta">' +
      metaItem('卡片比例', esc(QSL.ratioLabel(card.ratio))) +
      metaItem('换卡次数', esc(String(card.exchangeCount || 0)) + ' 次') +
      metaItem('发布时间', esc(QSL.formatDate(card.createdAt))) +
      '</dl>' +
      '<div class="g-detail__actions">' + applyHtml +
      '<button class="btn btn-ghost g-like-btn' + (card.liked ? ' is-liked' : '') + '" type="button" data-like ' +
      'aria-pressed="' + (card.liked ? 'true' : 'false') + '" aria-label="点赞这张卡片">' +
      ic('heart', 17) + '<span data-like-count>' + esc(QSL.formatNumber(card.likeCount || 0)) + '</span></button>' +
      '<button class="btn btn-ghost" type="button" data-share aria-label="复制分享链接">' +
      ic('share', 17) + '<span' + (isOwner ? '' : ' class="hide-sm"') + '>分享</span></button>' +
      '</div>' +
      '<p class="g-detail__hint">' + ic('lock', 13) +
      '<span>交换地址仅在双方同意后互相可见 · 73</span></p>' +
      noticeHtml;
  }

  /* ---------------- 404 / 错误 ---------------- */
  function renderMissing(container, isNotFound, retry) {
    const host = container.querySelector('.g-detail .container') || container;
    const title = isNotFound ? '这张卡片不见了' : '卡片加载失败';
    const desc = isNotFound
      ? '它可能尚未通过审核、已被删除，或者链接抄错了一个字符。去广场看看其它卡片吧。'
      : '电波暂时有点杂音，请稍后重试。';
    host.innerHTML =
      '<nav class="g-crumbs" aria-label="面包屑">' +
      '<a href="/" data-link>首页</a><span class="g-crumbs__sep">/</span>' +
      '<a href="/explore" data-link>卡片广场</a><span class="g-crumbs__sep">/</span>' +
      '<span class="g-crumbs__current">' + (isNotFound ? '卡片不存在' : '加载失败') + '</span></nav>' +
      '<div class="g-detail__missing">' +
      '<div class="g-detail__missing-art">' + (isNotFound ? '404' : ic('alert', 40)) + '</div>' +
      '<h1 class="g-display">' + esc(title) + '</h1>' +
      '<p>' + esc(desc) + '</p>' +
      '<div class="btn-group">' +
      (isNotFound ? '' : '<button class="btn btn-primary" type="button" data-retry>重新加载</button>') +
      '<a class="btn ' + (isNotFound ? 'btn-primary' : 'btn-ghost') + '" href="/explore" data-link>' +
      ic('grid', 16) + '<span>去卡片广场</span></a>' +
      '<a class="btn btn-ghost" href="/" data-link>返回首页</a>' +
      '</div></div>';
    const btn = host.querySelector('[data-retry]');
    if (btn && retry) btn.addEventListener('click', retry);
  }

  /* ---------------- 推荐 ---------------- */
  function renderReco(container, card, cardsApi) {
    const section = container.querySelector('[data-detail-reco]');
    const grid = container.querySelector('[data-reco-grid]');
    if (!section || !grid || !cardsApi) return;
    cardsApi.list({ sort: 'popular', limit: 8 }).catch(function () { return null; }).then(function (res) {
      const merged = [];
      const seen = new Set([card.id]);
      const items = (res && res.items) || [];
      items.forEach(function (item) {
        if (!item || seen.has(item.id)) return;
        seen.add(item.id);
        merged.push(item);
      });
      const picks = merged.slice(0, 4);
      if (!picks.length) return;
      grid.innerHTML = '';
      picks.forEach(function (item, i) {
        let tile = null;
        try {
          tile = QSL.cardTile ? QSL.cardTile(item) : null;
        } catch (err) {
          tile = null;
        }
        if (!tile) return;
        tile.setAttribute('data-reveal', '');
        tile.setAttribute('data-reveal-delay', String(i * 60));
        grid.appendChild(tile);
      });
      section.hidden = false;
      if (QSL.fx && typeof QSL.fx.enhance === 'function') {
        try { QSL.fx.enhance(grid); } catch (err) { /* 忽略 */ }
      }
    });
  }

  /* ---------------- 绑定操作 ---------------- */
  function bindActions(container, card, state) {
    const info = container.querySelector('[data-detail-info]');
    if (!info) return;
    const user = QSL.state && QSL.state.user;

    function syncLike(btn) {
      if (!btn) return;
      btn.classList.toggle('is-liked', !!card.liked);
      btn.setAttribute('aria-pressed', card.liked ? 'true' : 'false');
      info.querySelectorAll('[data-like-count]').forEach(function (el) {
        el.textContent = QSL.formatNumber(card.likeCount || 0);
      });
    }

    function onLike(e) {
      const btn = e.currentTarget;
      if (!user) {
        if (QSL.toast) QSL.toast('登录后即可点赞收藏', 'info');
        toNextLogin();
        return;
      }
      if (btn.disabled) return;
      btn.disabled = true;
      QSL.api.cards.like(card.id).then(function (res) {
        card.liked = !!res.liked;
        card.likeCount = Number(res.likeCount) || 0;
        syncLike(btn);
        if (res.liked) {
          if (QSL.fx && QSL.fx.heartbeat) QSL.fx.heartbeat(btn);
          if (QSL.fx && QSL.fx.confetti) QSL.fx.confetti(e.clientX, e.clientY);
        }
      }).catch(function (err) {
        if (QSL.toast) QSL.toast((err && err.message) || '点赞失败', 'error');
      }).finally(function () {
        btn.disabled = false;
      });
    }

    function onApply() {
      const current = QSL.state && QSL.state.user;
      if (!current) {
        if (QSL.toast) QSL.toast('登录后即可申请换卡', 'info');
        toNextLogin();
        return;
      }
      openExchange(card);
    }

    const likeBtn = info.querySelector('[data-like]');
    const applyBtn = info.querySelector('[data-apply]');
    const shareBtns = info.querySelectorAll('[data-share]');
    if (likeBtn) likeBtn.addEventListener('click', onLike);
    if (applyBtn) applyBtn.addEventListener('click', onApply);
    shareBtns.forEach(function (btn) { state.shareCleanup = QSL.cardShare.bind(btn, card); });
  }

  /* ---------------- 页面注册 ---------------- */
  QSL.registerPage('card-detail', {
    title: '卡片详情',
    render: function (container, ctx) {
      const params = (ctx && ctx.params) || {};
      const id = params.id || (location.pathname.split('/')[2] || '');
      const state = { cancelled: false, viewer: null };

      container.innerHTML = pageShell();

      function load() {
        if (state.cancelled) return;
        if (state.viewer) {
          try { state.viewer.destroy(); } catch (err) { /* 忽略 */ }
          state.viewer = null;
        }
        const cardsApi = QSL.api && QSL.api.cards;
        if (!cardsApi || typeof cardsApi.get !== 'function') {
          renderMissing(container, false, load);
          return;
        }
        cardsApi.get(id).then(function (res) {
          if (state.cancelled) return;
          const card = (res && res.card) || null;
          const owner = (res && res.owner) || (card && card.owner) || {};
          if (!card) {
            renderMissing(container, true, load);
            return;
          }
          container.querySelector('.g-detail').classList.add('is-loaded');
          const crumb = container.querySelector('[data-crumb-current]');
          if (crumb) crumb.textContent = card.title || '卡片详情';
          const viewerPanel = container.querySelector('[data-detail-viewer]');
          const infoPanel = container.querySelector('[data-detail-info]');
          if (viewerPanel) state.viewer = renderViewer(viewerPanel, card);
          if (infoPanel) {
            renderInfo(infoPanel, card, owner);
            bindActions(container, card, state);
          }
          renderReco(container, card, cardsApi);
          try { document.title = (card.title || '卡片详情') + ' · QSLink'; } catch (err) { /* 忽略 */ }
        }).catch(function (err) {
          if (state.cancelled) return;
          const notFound = !!err && (err.status === 404 || err.code === 'NOT_FOUND');
          if (notFound) {
            renderMissing(container, true, load);
          } else {
            renderMissing(container, false, load);
            if (QSL.toast) QSL.toast((err && err.message) || '卡片加载失败，请稍后重试', 'error');
          }
        });
      }

      load();

      return function cleanup() {
        state.cancelled = true;
        if (state.shareCleanup) state.shareCleanup();
        if (state.viewer) {
          try { state.viewer.destroy(); } catch (err) { /* 忽略 */ }
          state.viewer = null;
        }
      };
    }
  });
})();
