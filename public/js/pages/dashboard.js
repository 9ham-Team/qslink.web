/* ============================================================
 * QSLink · 个人中心概览 Dashboard（flows-ui）
 * 依赖：core.js / api.js / ui.js。数据：GET /api/me/overview
 * ============================================================ */
(function () {
  'use strict';
  const QSL = window.QSL;
  const esc = (v) => QSL.escapeHtml(v == null ? '' : v);
  const ico = (name, size) => (typeof QSL.icon === 'function' ? QSL.icon(name, size || 18) : '');
  const timeAgo = (iso) => (typeof QSL.timeAgo === 'function' ? QSL.timeAgo(iso) : '');

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return { text: QSL.t("早上好"), icon: 'sun', hint: QSL.t("新的一天，从一张 QSL 卡片开始。") };
    if (hour < 18) return { text: QSL.t("下午好"), icon: 'sun', hint: QSL.t("电波正暖，来看看有没有新的换卡申请。") };
    return { text: QSL.t("晚上好"), icon: 'moon', hint: QSL.t("夜深了，适合整理今天的通联收藏。") };
  }

  function todayLabel() {
    try {
      return new Intl.DateTimeFormat(QSL.i18n.language, { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
    } catch (e) {
      return QSL.formatDate(new Date().toISOString());
    }
  }

  function userDisplayName(user) {
    if (!user) return QSL.t("火腿");
    return user.displayName || user.username || QSL.t("火腿");
  }

  /* ---------------- 统计卡 ---------------- */
  function statCard(opts) {
    const value = Number(opts.value) || 0;
    return (
      '<a class="f-stat f-stat-' + esc(opts.tone) + '" href="' + esc(opts.href) + '">' +
      '<span class="f-stat-icon">' + ico(opts.icon, 20) + '</span>' +
      '<span class="f-stat-info">' +
      '<span class="f-stat-top"><b class="f-stat-num" data-count="' + value + '">' + value + '</b>' +
      (opts.badge ? '<span class="f-stat-badge">' + opts.badge + '</span>' : '') + '</span>' +
      '<span class="f-stat-label">' + esc(opts.label) + '</span>' +
      '<span class="f-stat-sub">' + esc(opts.sub) + '</span>' +
      '</span>' +
      '<span class="f-stat-arrow">' + ico('arrow-right', 16) + '</span>' +
      '</a>'
    );
  }

  function statsSkeleton() {
    let html = '';
    for (let i = 0; i < 4; i++) {
      html +=
        '<div class="f-stat is-skeleton" aria-hidden="true">' +
        '<span class="skeleton f-skeleton-icon"></span>' +
        '<span class="f-stat-info"><span class="skeleton skeleton-line" style="width:56%"></span>' +
        '<span class="skeleton skeleton-line" style="width:80%"></span></span>' +
        '</div>';
    }
    return html;
  }

  /* ---------------- 待处理申请 ---------------- */
  function pendingRow(ex) {
    const card = ex.card || {};
    const from = ex.fromUser || {};
    const thumb = card.frontImage || QSL.PLACEHOLDER_IMAGE;
    const ratio = card.ratio || { w: 3, h: 2 };
    return (
      '<article class="f-req" data-exchange-id="' + esc(ex.id) + '">' +
      '<a class="f-req-thumb" href="/card/' + esc(card.id || '') + ("\" aria-label=\"" + QSL.t("查看卡片") + " ") + esc(card.title || '') + '">' +
      '<span style="aspect-ratio:' + esc(QSL.ratioCss(ratio)) + '"><img src="' + esc(thumb) + '" alt="" loading="lazy"></span>' +
      '</a>' +
      '<div class="f-req-main">' +
      '<div class="f-req-head">' +
      '<span class="f-req-avatar">' + QSL.avatar(from, 38) + '</span>' +
      '<span class="f-req-who">' +
      '<span class="f-req-name">' + esc(from.displayName || from.username || QSL.t("未知用户")) +
      '<b class="f-req-call mono">' + esc(from.callSign || '') + '</b></span>' +
      ("<span class=\"f-req-desc\">" + QSL.escapeHtml(QSL.t("想交换你的卡片「"))) + esc(card.title || QSL.t("未命名卡片")) + '」</span>' +
      '</span>' +
      '<time class="f-req-time" datetime="' + esc(ex.createdAt || '') + '">' + esc(timeAgo(ex.createdAt)) + '</time>' +
      '</div>' +
      (ex.message ? '<p class="f-req-msg">' + ico('send', 14) + '<span>' + esc(ex.message) + '</span></p>' : '') +
      QSL.exchangeRequest.recordsHtml(ex) +
      '<div class="f-req-foot">' +
      '<span class="f-req-tags">' +
      '<span class="f-req-note">' + ico('clock', 13) + (" " + QSL.escapeHtml(QSL.t("待处理")) + "</span></span>") +
      '<span class="f-req-actions">' +
      '<button class="btn btn-sm btn-primary" type="button" data-act="approve">' + ico('check', 15) + (QSL.escapeHtml(QSL.t("同意")) + "</button>") +
      '<button class="btn btn-sm btn-ghost" type="button" data-act="reject">' + ico('x', 15) + (QSL.escapeHtml(QSL.t("拒绝")) + "</button>") +
      '</span>' +
      '</div>' +
      '</div>' +
      '</article>'
    );
  }

  function emptyPending() {
    return (
      '<div class="f-empty-inline f-empty-inline-success">' +
      '<span class="f-empty-ico">' + ico('check-circle', 26) + '</span>' +
      ("<div><b>" + QSL.escapeHtml(QSL.t("暂时没有待处理的申请")) + "</b><p>" + QSL.escapeHtml(QSL.t("新的换卡申请会第一时间出现在这里。")) + "</p></div>") +
      ("<a class=\"btn btn-sm btn-ghost\" href=\"/explore\">" + QSL.escapeHtml(QSL.t("浏览卡片广场"))) + ico('arrow-right', 15) + '</a>' +
      '</div>'
    );
  }

  /* ---------------- 快捷入口 ---------------- */
  function quickLinks(user, canJudgeContest = false) {
    const links = [
      { href: '/dashboard/cards/new', icon: 'upload', title: QSL.t("上传新卡片"), desc: QSL.t("正反两面，提交审核") },
      { href: '/dashboard/cards', icon: 'cards', title: QSL.t("我的卡片"), desc: QSL.t("管理、编辑与分享") },
      { href: '/dashboard/exchanges', icon: 'inbox', title: QSL.t("换卡申请"), desc: QSL.t("处理收到的申请") },
      { href: '/dashboard/profile', icon: 'settings', title: QSL.t("个人资料"), desc: QSL.t("地址、密码与头像") }
    ];
    if (user && user.role === 'user' && canJudgeContest) {
      links.push({ href: '/events/qsl-design-2026-11/judging', icon: 'star', title: QSL.t('评委工作台'), desc: QSL.t('指定评委专用，权限由服务器核验') });
    }
    if (user && user.role === 'admin') {
      links.push({ href: '/admin', icon: 'shield', title: QSL.t("管理后台"), desc: QSL.t("审核卡片与用户"), admin: true });
    }
    return links.map((item) => {
      return (
        '<a class="f-quick' + (item.admin ? ' f-quick-admin' : '') + '" href="' + esc(item.href) + '">' +
        '<span class="f-quick-icon">' + ico(item.icon, 20) + '</span>' +
        '<span class="f-quick-text"><b>' + esc(item.title) + '</b><small>' + esc(item.desc) + '</small></span>' +
        '<span class="f-quick-arrow">' + ico('arrow-right', 15) + '</span>' +
        '</a>'
      );
    }).join('');
  }

  function recentCardEl(card) {
    const tile = QSL.cardTile(card, { href: '/card/' + (card.id || ''), showStatus: true });
    tile.classList.add('f-recent-tile');
    return tile;
  }

  /* ---------------- 渲染 ---------------- */
  function render(container) {
    const user = QSL.state.user;
    if (!user) {
      QSL.navigate('/login?next=' + encodeURIComponent('/dashboard'), { replace: true });
      return function cleanup() {};
    }

    const hello = greeting();
    const name = userDisplayName(user);
    const callSign = user.callSign || '';
    const joined = user.joinedAt ? QSL.formatDate(user.joinedAt) : '';

    container.innerHTML =
      '<div class="f-dash container">' +
      '<section class="f-dash-hero" data-reveal>' +
      '<div class="f-dash-hero-deco" aria-hidden="true">' +
      '<span class="f-hero-orb f-hero-orb-a"></span><span class="f-hero-orb f-hero-orb-b"></span>' +
      '<svg class="f-hero-wave" viewBox="0 0 420 180" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round">' +
      '<path d="M2 150 Q 70 96 140 150 T 280 150 T 418 150" stroke-width="1.4" opacity=".5"/>' +
      '<path d="M2 168 Q 70 114 140 168 T 280 168 T 418 168" stroke-width="1.1" opacity=".32"/>' +
      '<circle cx="352" cy="44" r="26" stroke-width="1.2" opacity=".5"/>' +
      '<circle cx="352" cy="44" r="44" stroke-width="1" opacity=".3" stroke-dasharray="2 8"/>' +
      '<circle cx="352" cy="44" r="4" fill="currentColor" stroke="none" opacity=".7"/>' +
      '</g></svg>' +
      '</div>' +
      '<div class="f-dash-hero-main">' +
      '<span class="f-dash-eyebrow">' + ico(hello.icon, 14) + ' DASHBOARD · ' + esc(todayLabel()) + '</span>' +
      '<h1 class="f-dash-title">' + esc(hello.text) + '，<span class="f-dash-name">' + esc(name) + '</span>' +
      (callSign ? '<span class="f-dash-call mono">' + esc(callSign) + '</span>' : '') + '</h1>' +
      '<p class="f-dash-sub">' + esc(hello.hint) + '</p>' +
      '<div class="f-dash-hero-actions">' +
      '<a class="btn btn-primary" href="/dashboard/cards/new">' + ico('upload', 17) + (QSL.escapeHtml(QSL.t("上传新卡片")) + "</a>") +
      '<a class="btn btn-ghost" href="/explore">' + ico('compass', 17) + (QSL.escapeHtml(QSL.t("逛逛卡片广场")) + "</a>") +
      (user.uid ? '<a class="btn btn-ghost" href="/space/' + esc(user.uid) + '" data-link>' + ico('user', 17) + (QSL.escapeHtml(QSL.t("我的公开主页")) + "</a>") : '') +
      '</div>' +
      '</div>' +
      '<div class="f-dash-hero-user">' +
      '<span class="f-dash-avatar">' + QSL.avatar(user, 64) + '</span>' +
      '<span class="f-dash-user-info">' +
      '<b>' + esc(name) + '</b>' +
      '<span class="mono">' + esc(callSign || QSL.t("未填写呼号")) + '</span>' +
      (joined ? '<small>' + ico('calendar', 12) + ' ' + esc(joined) + (" " + QSL.escapeHtml(QSL.t("加入")) + "</small>") : '') +
      '</span>' +
      ("<a class=\"f-dash-user-edit\" href=\"/dashboard/profile\" title=\"" + QSL.escapeHtml(QSL.t("编辑个人资料")) + "\" aria-label=\"" + QSL.escapeHtml(QSL.t("编辑个人资料")) + "\">") + ico('edit', 15) + '</a>' +
      '</div>' +
      '</section>' +

      ("<section class=\"f-stats\" id=\"fDashStats\" aria-label=\"" + QSL.escapeHtml(QSL.t("数据概览")) + "\">") + statsSkeleton() + '</section>' +

      '<div class="f-dash-cols">' +
      '<section class="f-panel f-dash-pending" data-reveal data-reveal-delay="60">' +
      '<header class="f-panel-head">' +
      ("<div><h2 class=\"f-panel-title\">" + QSL.escapeHtml(QSL.t("待我处理的申请")) + "</h2><p class=\"f-panel-desc\">" + QSL.escapeHtml(QSL.t("同意后双方地址将互相可见")) + "</p></div>") +
      ("<a class=\"f-panel-link\" href=\"/dashboard/exchanges?box=incoming\">" + QSL.escapeHtml(QSL.t("查看全部"))) + ico('arrow-right', 15) + '</a>' +
      '</header>' +
      '<div class="f-panel-body" id="fDashPending" aria-live="polite">' + QSL.skeletonRows(2) + '</div>' +
      '</section>' +

      '<section class="f-panel f-dash-quick-panel" data-reveal data-reveal-delay="120">' +
      ("<header class=\"f-panel-head\"><div><h2 class=\"f-panel-title\">" + QSL.escapeHtml(QSL.t("快捷入口")) + "</h2><p class=\"f-panel-desc\">" + QSL.escapeHtml(QSL.t("常用操作一步直达")) + "</p></div></header>") +
      '<div class="f-quick-grid">' + quickLinks(user) + '</div>' +
      '</section>' +
      '</div>' +

      '<section class="f-panel f-dash-recent" data-reveal data-reveal-delay="160">' +
      '<header class="f-panel-head">' +
      ("<div><h2 class=\"f-panel-title\">" + QSL.escapeHtml(QSL.t("最近卡片")) + "</h2><p class=\"f-panel-desc\">" + QSL.escapeHtml(QSL.t("你最近上传或更新的 QSL 卡片")) + "</p></div>") +
      ("<a class=\"f-panel-link\" href=\"/dashboard/cards\">" + QSL.escapeHtml(QSL.t("管理卡片"))) + ico('arrow-right', 15) + '</a>' +
      '</header>' +
      '<div class="f-panel-body" id="fDashRecent">' + QSL.skeletonCards(3) + '</div>' +
      '</section>' +
      '</div>';

    const statsEl = container.querySelector('#fDashStats');
    const pendingEl = container.querySelector('#fDashPending');
    const recentEl = container.querySelector('#fDashRecent');
    let alive = true;
    const offViewer = QSL.on('auth', function () {
      if (QSL.state.user?.id === user.id) return;
      alive = false;
      container.textContent = '';
      QSL.navigate('/dashboard', { replace: true });
    });
    let loading = false;

    function paintStats(stats) {
      const s = stats || {};
      const approved = Number(s.approvedCards) || 0;
      const pendingCards = Number(s.pendingCards) || 0;
      const incoming = Number(s.incomingPending) || 0;
      const outgoing = Number(s.outgoingPending) || 0;
      let cardBadge = '';
      if (pendingCards > 0) cardBadge = '<span class="f-stat-badge is-amber">' + pendingCards + (" " + QSL.escapeHtml(QSL.t("审核中")) + "</span>");
      statsEl.innerHTML =
        statCard({
          href: '/dashboard/cards', tone: 'mint', icon: 'cards', value: s.cards,
          label: QSL.t("我的卡片"), sub: approved + (" " + QSL.t("张已通过")) + (pendingCards ? ' · ' + pendingCards + (" " + QSL.t("张审核中")) : ''),
          badge: cardBadge
        }) +
        statCard({
          href: '/dashboard/cards', tone: 'rose', icon: 'heart', value: s.likesReceived,
          label: QSL.t("获得点赞"), sub: QSL.t("来自同好的收藏与喜欢")
        }) +
        statCard({
          href: '/dashboard/exchanges?box=incoming', tone: 'amber', icon: 'inbox', value: s.incomingPending,
          label: QSL.t("待处理申请"), sub: incoming > 0 ? (QSL.t("收到") + " ") + incoming + (" " + QSL.t("条，尽快处理吧")) : QSL.t("全部处理完毕"),
          badge: incoming > 0 ? ("<span class=\"f-stat-badge is-rose\">" + QSL.escapeHtml(QSL.t("新")) + "</span>") : ''
        }) +
        statCard({
          href: '/dashboard/exchanges?box=outgoing', tone: 'sky', icon: 'send', value: s.completedExchanges,
          label: QSL.t("已完成换卡"), sub: outgoing > 0 ? (QSL.t("有") + " ") + outgoing + (" " + QSL.t("条申请等待对方回应")) : QSL.t("每一次交换都值得纪念")
        });
    }

    function paintPending(list) {
      // 后端 recentIncoming 可能包含非 pending 的历史记录，这里只展示真正待处理的申请
      const items = (Array.isArray(list) ? list : [])
        .filter((item) => item && item.status === 'pending')
        .slice(0, 3);
      if (!items.length) {
        pendingEl.innerHTML = emptyPending();
        return;
      }
      pendingEl.innerHTML = items.map(pendingRow).join('');
      pendingEl.querySelectorAll('[data-act]').forEach((btn) => {
        const row = btn.closest('[data-exchange-id]');
        const id = row ? row.dataset.exchangeId : '';
        const ex = items.find((item) => item.id === id);
        if (!ex) return;
        btn.addEventListener('click', () => {
          if (btn.dataset.act === 'approve') approveExchange(ex, row);
          else rejectExchange(ex, row);
        });
      });
    }

    function paintRecent(cards) {
      const items = Array.isArray(cards) ? cards.slice(0, 3) : [];
      if (!items.length) {
        recentEl.innerHTML = '';
        const empty = QSL.emptyState({
          icon: 'cards',
          title: QSL.t("还没有 QSL 卡片"),
          desc: QSL.t("上传你的第一张双面卡片，等待审核通过后就能在广场被同好发现。"),
          actionLabel: QSL.t("上传第一张卡片"),
          onAction: () => QSL.navigate('/dashboard/cards/new')
        });
        empty.classList.add('f-empty-panel');
        recentEl.appendChild(empty);
        return;
      }
      recentEl.innerHTML = '<div class="f-grid-cards"></div>';
      const grid = recentEl.firstElementChild;
      items.forEach((card) => {
        try { grid.appendChild(recentCardEl(card)); } catch (err) { console.error('[dashboard] cardTile', err); }
      });
    }

    function setRowBusy(row, busy, action) {
      if (!row) return;
      row.classList.toggle('is-busy', !!busy);
      row.querySelectorAll('button').forEach((btn) => { btn.disabled = !!busy; });
      if (busy && action) {
        const target = row.querySelector('[data-act="' + action + '"]');
        if (target) QSL.setBusy(target, true, QSL.t("处理中"));
      }
    }

    async function approveExchange(ex, row) {
      const ok = await QSL.confirm({
        title: QSL.t("同意换卡申请"),
        message: QSL.t("同意后，你与「") + ((ex.fromUser && (ex.fromUser.displayName || ex.fromUser.username)) || QSL.t("对方")) + QSL.t("」的收件地址将互相可见，请尽快寄出卡片。"),
        confirmText: QSL.t("同意并交换"),
        cancelText: QSL.t("再想想")
      });
      if (!ok || !alive) return;
      setRowBusy(row, true, 'approve');
      try {
        await QSL.api.exchanges.approve(ex.id);
        QSL.toast(QSL.t("已同意换卡申请，双方地址已解锁"), 'success');
        wave();
        await load();
      } catch (err) {
        setRowBusy(row, false);
        QSL.toast((err && err.message) || QSL.t("操作失败，请稍后重试"), 'error');
      }
    }

    function rejectExchange(ex, row) {
      const card = ex.card || {};
      let busy = false;
      const modal = QSL.modal({
        title: QSL.t("拒绝换卡申请"),
        size: 'sm',
        content:
          ("<p class=\"modal-text\">" + QSL.escapeHtml(QSL.t("来自「"))) + esc((ex.fromUser && (ex.fromUser.displayName || ex.fromUser.username)) || QSL.t("对方")) +
          QSL.t("」的换卡申请：") + esc(card.title || '') + '</p>' +
          ("<label class=\"f-modal-field\"><span class=\"label\">" + QSL.escapeHtml(QSL.t("拒绝理由")) + "<span class=\"f-optional\">" + QSL.escapeHtml(QSL.t("选填")) + "</span></span>") +
          ("<textarea class=\"textarea\" data-reject-reason rows=\"3\" maxlength=\"200\" placeholder=\"" + QSL.escapeHtml(QSL.t("例如：这张卡暂时不互换，抱歉啦")) + "\"></textarea>") +
          '<span class="f-counter" data-reject-counter>0 / 200</span></label>' +
          '<p class="f-modal-error" data-modal-error hidden></p>',
        actions: [
          { label: QSL.t("取消"), type: 'ghost' },
          {
            label: QSL.t("确认拒绝"), type: 'danger', closeOnClick: false,
            onClick: async (inst) => {
              if (busy) return false;
              busy = true;
              const btn = inst.el.querySelector('.modal-actions .btn-danger');
              const errorEl = inst.body.querySelector('[data-modal-error]');
              const reasonEl = inst.body.querySelector('[data-reject-reason]');
              if (errorEl) errorEl.hidden = true;
              QSL.setBusy(btn, true, QSL.t("提交中"));
              try {
                await QSL.api.exchanges.reject(ex.id, { reason: reasonEl ? reasonEl.value.trim() : '' });
                QSL.toast(QSL.t("已拒绝该换卡申请"), 'info');
                inst.close();
                if (alive) load();
              } catch (err) {
                if (errorEl) {
                  errorEl.hidden = false;
                  errorEl.textContent = (err && err.message) || QSL.t("操作失败，请稍后重试");
                }
                QSL.setBusy(btn, false);
                busy = false;
                return false;
              }
              return undefined;
            }
          }
        ]
      });
      const reasonEl = modal.body.querySelector('[data-reject-reason]');
      const counter = modal.body.querySelector('[data-reject-counter]');
      if (reasonEl && counter) {
        reasonEl.addEventListener('input', () => {
          counter.textContent = reasonEl.value.length + ' / 200';
        });
        setTimeout(() => { try { reasonEl.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 120);
      }
    }

    function wave() {
      if (QSL.fx && typeof QSL.fx.confetti === 'function') {
        try { QSL.fx.confetti(); } catch (e) { /* ignore */ }
      }
    }

    async function load() {
      if (!alive || loading) return;
      loading = true;
      try {
        const data = await QSL.api.me.overview();
        if (!alive) return;
        if (data && data.user) {
          QSL.state.user = data.user;
          QSL.emit('auth', data.user);
        }
        paintStats((data && data.stats) || {});
        container.querySelector('.f-quick-grid').innerHTML = quickLinks(data.user, data.canJudgeContest === true);
        paintPending((data && data.recentIncoming) || []);
        paintRecent((data && data.recentCards) || []);
      } catch (err) {
        if (!alive) return;
        console.error(QSL.t("[dashboard] 加载失败"), err);
        const message = (err && err.message) || QSL.t("加载失败");
        statsEl.innerHTML = '';
        pendingEl.innerHTML =
          '<div class="f-empty-inline is-error"><span class="f-empty-ico">' + ico('alert', 24) + '</span>' +
          ("<div><b>" + QSL.escapeHtml(QSL.t("数据加载失败")) + "</b><p>") + esc(message) + '</p></div>' +
          ("<button class=\"btn btn-sm btn-ghost\" type=\"button\" data-retry>" + QSL.escapeHtml(QSL.t("重试")) + "</button></div>");
        const retry = pendingEl.querySelector('[data-retry]');
        if (retry) retry.addEventListener('click', () => { loading = false; load(); });
        recentEl.innerHTML = '';
        QSL.toast(message, 'error');
      } finally {
        loading = false;
      }
    }

    load();
    return function cleanup() { alive = false; offViewer(); };
  }

  QSL.registerPage('dashboard', { title: QSL.t("个人中心"), render: render });
})();
