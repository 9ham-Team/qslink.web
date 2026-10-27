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
      let sort = 'latest';
      let requestId = 0;
      let resetPending = false;
      let profileShown = false;
      let view = 'grid';
      try { if (localStorage.getItem('qsl_space_view') === 'large') view = 'large'; } catch (_) {}
      let shareModal = null;
      container.innerHTML = '<div class="container g-space"><p role="status">正在接收这位火腿的电波…</p></div>';

      function showProfile(res) {
        const user = res.user;
        const own = QSL.state.user && QSL.state.user.uid === uid;
        const bio = (user.bio || '').trim() || '在电波中相遇，73！';
        const collapsibleBio = bio.length > 40 || /[\r\n]/.test(bio);
        document.title = (user.displayName || '火腿') + '的个人主页 · QSLink';
        container.innerHTML = '<div class="container g-space">' +
          '<nav class="g-crumbs" aria-label="面包屑"><a href="/explore" data-link>卡片广场</a><span>/</span><span>个人主页</span></nav>' +
          '<section class="g-space__hero">' +
          '<div class="g-space__identity">' + QSL.avatar(user, 48) + '<div>' +
          '<div class="g-space__name"><h1>' + esc(user.displayName || '火腿') + '</h1>' +
          (user.callSign ? '<span class="g-space__call mono">' + esc(user.callSign) + '</span>' : '') + '</div>' +
          '<p id="space-bio" class="g-space__bio' + (collapsibleBio ? ' is-collapsed' : '') + '">' + esc(bio) + '</p>' +
          (collapsibleBio ? '<button class="g-space__bio-toggle" type="button" aria-expanded="false" aria-controls="space-bio" data-space-bio-toggle>展开简介</button>' : '') +
          '</div></div></section>' +
          '<section class="g-space__collection" aria-labelledby="space-cards-title"><header class="g-space__heading">' +
          '<div class="g-space__title"><h2 id="space-cards-title">公开卡片</h2>' +
          '<div class="g-space__stats"><span><b>' + esc(String(user.stats.cards)) + '</b> 张公开卡片</span>' +
          '<span><b>' + esc(String(user.stats.likesReceived)) + '</b> 次喜欢</span></div></div>' +
          '<div class="g-space__controls"><div class="g-space__views" role="group" aria-label="卡片显示模式">' +
          '<button type="button" data-space-view="grid" aria-pressed="' + (view === 'grid') + '">紧凑</button>' +
          '<button type="button" data-space-view="large" aria-pressed="' + (view === 'large') + '">大图</button></div>' +
          '<select class="g-space__sort" data-space-sort aria-label="卡片排序"><option value="latest">最新</option><option value="popular">最热</option></select></div></header>' +
          '<div class="g-space__grid" data-space-grid data-view="' + view + '"></div><p class="g-space__status" data-space-status role="status"></p>' +
          '<div class="g-space__more"><button class="btn btn-soft" type="button" data-space-more hidden>加载更多</button></div></section>' +
          '<footer class="g-space__foot"><div class="g-space__meta"><span class="mono">UID ' + esc(user.uid) + '</span>' +
          '<span>' + esc(QSL.formatDate(user.joinedAt)) + ' 加入 QSLink</span></div>' +
          '<div class="g-space__actions">' +
          (own ? '<a class="btn btn-ghost" href="/dashboard/profile" data-link>编辑资料</a><a class="btn btn-ghost" href="/dashboard" data-link>个人中心</a>' : '') +
          '<button class="btn btn-primary" type="button" data-space-share>' + QSL.icon('share', 17) + '分享主页</button></div></footer></div>';
        const bioToggle = container.querySelector('[data-space-bio-toggle]');
        if (bioToggle) bioToggle.addEventListener('click', function () {
          const expanded = bioToggle.getAttribute('aria-expanded') !== 'true';
          container.querySelector('#space-bio').classList.toggle('is-collapsed', !expanded);
          bioToggle.setAttribute('aria-expanded', String(expanded));
          bioToggle.textContent = expanded ? '收起简介' : '展开简介';
        });
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
        container.querySelector('[data-space-more]').addEventListener('click', function () { load(); });
        const sortSelect = container.querySelector('[data-space-sort]');
        sortSelect.value = sort;
        sortSelect.addEventListener('change', function () {
          sort = sortSelect.value === 'popular' ? 'popular' : 'latest';
          load(true);
        });
        container.querySelectorAll('[data-space-view]').forEach(function (button) {
          button.addEventListener('click', function () {
            view = button.dataset.spaceView;
            container.querySelector('[data-space-grid]').dataset.view = view;
            container.querySelectorAll('[data-space-view]').forEach(function (item) {
              item.setAttribute('aria-pressed', String(item.dataset.spaceView === view));
            });
            try { localStorage.setItem('qsl_space_view', view); } catch (_) {}
          });
        });
        profileShown = true;
      }

      async function load(reset) {
        if (cancelled || (loading && !reset)) return;
        reset = Boolean(reset || resetPending);
        resetPending = false;
        const currentRequest = ++requestId;
        const sortSelect = container.querySelector('[data-space-sort]');
        if (reset) {
          page = 0;
          const grid = container.querySelector('[data-space-grid]');
          grid.setAttribute('aria-busy', 'true');
          if (!grid.children.length) container.querySelector('[data-space-status]').textContent = '正在加载卡片…';
          if (sortSelect) sortSelect.disabled = true;
        }
        loading = true;
        const more = container.querySelector('[data-space-more]');
        if (more) { more.disabled = true; more.textContent = '加载中…'; }
        try {
          const res = await QSL.api.spaces.get(uid, { sort: sort, page: page + 1, limit: 12 });
          if (cancelled || currentRequest !== requestId) return;
          if (!profileShown) showProfile(res);
          page = res.cards.page;
          const grid = container.querySelector('[data-space-grid]');
          const tiles = res.cards.items.map(function (card) { return QSL.cardTile(card); });
          if (reset) grid.replaceChildren.apply(grid, tiles);
          else tiles.forEach(function (tile) { grid.appendChild(tile); });
          const status = container.querySelector('[data-space-status]');
          status.textContent = res.cards.total ? '' : '这里的卡片故事，正等待第一张开始。';
          container.querySelector('[data-space-more]').hidden = page >= res.cards.pages;
        } catch (err) {
          if (cancelled || currentRequest !== requestId) return;
          if (!profileShown) {
            container.innerHTML = '<div class="container g-space"><div class="g-error-panel"><h1>' +
              (err.status === 404 ? '这个主页暂时无法访问' : '主页加载失败') + '</h1><p>' +
              (err.status === 404 ? '请检查九位 UID，或到广场发现更多同好。' : '电波暂时有点杂音，请稍后重试。') +
              '</p><a class="btn btn-soft" href="/explore" data-link>逛逛卡片广场</a>' +
              (err.status === 404 ? '' : '<button class="btn btn-primary" type="button" data-space-retry>重新加载</button>') + '</div></div>';
            const retry = container.querySelector('[data-space-retry]');
            if (retry) retry.addEventListener('click', function () { load(); });
          } else {
            resetPending = reset;
            container.querySelector('[data-space-status]').textContent = '加载失败，请点击加载更多重试。';
            container.querySelector('[data-space-more]').hidden = false;
          }
        } finally {
          if (!cancelled && currentRequest === requestId) {
            loading = false;
            const grid = container.querySelector('[data-space-grid]');
            if (grid) grid.removeAttribute('aria-busy');
            const select = container.querySelector('[data-space-sort]');
            if (select) select.disabled = false;
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
