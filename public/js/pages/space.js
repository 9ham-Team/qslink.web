(function () {
  'use strict';
  const QSL = window.QSL;
  const esc = QSL.escapeHtml;

  QSL.registerPage('space', {
    title: '个人主页',
    render: function (container, ctx) {
      const uid = ctx.params.uid;
      let cancelled = false;
      let loading = false;
      let page = 0;
      let shareModal = null;
      container.innerHTML = '<div class="container g-space"><p role="status">正在接收这位火腿的电波…</p></div>';

      function showProfile(res) {
        const user = res.user;
        const own = QSL.state.user && QSL.state.user.uid === uid;
        document.title = (user.displayName || '火腿') + '的个人主页 · QSLink';
        container.innerHTML = '<div class="container g-space">' +
          '<nav class="g-crumbs" aria-label="面包屑"><a href="/explore" data-link>卡片广场</a><span>/</span><span>个人主页</span></nav>' +
          '<section class="g-space__hero">' +
          '<div class="g-space__stamp" aria-hidden="true">CQ<br><small>WORLD</small></div>' +
          '<div class="g-space__identity">' + QSL.avatar(user, 88) + '<div>' +
          '<p class="eyebrow">ON THE AIR · 个人主页</p><h1>' + esc(user.displayName || '火腿') + '</h1>' +
          (user.callSign ? '<p class="g-space__call mono">' + esc(user.callSign) + '</p>' : '') +
          '<p class="g-space__uid mono">UID ' + esc(user.uid) + '</p></div></div>' +
          '<p class="g-space__bio">' + esc(user.bio || '每一张 QSL，都是一次相遇的纪念。欢迎来我的卡片小站坐坐，73！') + '</p>' +
          '<div class="g-space__foot"><span>' + esc(QSL.formatDate(user.joinedAt)) + ' 加入 QSLink</span>' +
          '<div class="g-space__actions"><button class="btn btn-primary" type="button" data-space-share>' + QSL.icon('share', 17) + '分享主页</button>' +
          (own ? '<a class="btn btn-ghost" href="/dashboard/profile" data-link>编辑资料</a><a class="btn btn-ghost" href="/dashboard" data-link>个人中心</a>' : '') +
          '</div></div></section>' +
          '<section class="g-space__collection" aria-labelledby="space-cards-title"><header class="g-space__heading">' +
          '<div><p class="eyebrow">QSL COLLECTION</p><h2 id="space-cards-title">电波留下的足迹</h2></div>' +
          '<div class="g-space__stats"><span><b>' + esc(String(user.stats.cards)) + '</b> 张公开卡片</span>' +
          '<span><b>' + esc(String(user.stats.likesReceived)) + '</b> 次喜欢</span></div></header>' +
          '<div class="g-space__grid" data-space-grid></div><p class="g-space__status" data-space-status role="status"></p>' +
          '<div class="g-space__more"><button class="btn btn-soft" type="button" data-space-more hidden>加载更多</button></div></section></div>';
        container.querySelector('[data-space-share]').addEventListener('click', function () {
          const url = res.url || location.origin + '/space/' + uid;
          if (shareModal) shareModal.close();
          shareModal = QSL.modal({
            title: '分享主页',
            content: '<p>把你的卡片小站分享给朋友，任何人都可以直接访问。</p>' +
              '<label class="field"><span class="label">主页链接</span><input class="input" type="text" readonly data-space-url value="' + esc(url) + '"></label>',
            actions: [{ label: '复制链接', type: 'primary', closeOnClick: false, onClick: function () { return QSL.copyText(url, '主页链接已复制'); } }]
          });
          const input = shareModal.body.querySelector('[data-space-url]');
          input.addEventListener('click', function () { input.select(); });
        });
        container.querySelector('[data-space-more]').addEventListener('click', load);
      }

      async function load() {
        if (loading || cancelled) return;
        loading = true;
        const more = container.querySelector('[data-space-more]');
        if (more) { more.disabled = true; more.textContent = '加载中…'; }
        try {
          const res = await QSL.api.spaces.get(uid, { page: page + 1, limit: 12 });
          if (cancelled) return;
          if (!page) showProfile(res);
          page = res.cards.page;
          const grid = container.querySelector('[data-space-grid]');
          res.cards.items.forEach(function (card) { grid.appendChild(QSL.cardTile(card)); });
          const status = container.querySelector('[data-space-status]');
          status.textContent = res.cards.total ? '' : '这里的卡片故事，正等待第一张开始。';
          container.querySelector('[data-space-more]').hidden = page >= res.cards.pages;
        } catch (err) {
          if (cancelled) return;
          if (!page) {
            container.innerHTML = '<div class="container g-space"><div class="g-error-panel"><h1>' +
              (err.status === 404 ? '这个主页暂时无法访问' : '主页加载失败') + '</h1><p>' +
              (err.status === 404 ? '请检查九位 UID，或到广场发现更多同好。' : '电波暂时有点杂音，请稍后重试。') +
              '</p><a class="btn btn-soft" href="/explore" data-link>逛逛卡片广场</a>' +
              (err.status === 404 ? '' : '<button class="btn btn-primary" type="button" data-space-retry>重新加载</button>') + '</div></div>';
            const retry = container.querySelector('[data-space-retry]');
            if (retry) retry.addEventListener('click', load);
          } else {
            container.querySelector('[data-space-status]').textContent = '加载失败，请点击加载更多重试。';
          }
        } finally {
          loading = false;
          if (!cancelled) {
            const button = container.querySelector('[data-space-more]');
            if (button) { button.disabled = false; button.textContent = '加载更多'; }
          }
        }
      }
      load();
      return function () { cancelled = true; if (shareModal) shareModal.close(); };
    }
  });
})();
