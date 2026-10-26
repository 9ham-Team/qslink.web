/* ============================================================
 * public/js/pages/explore.js — 卡片广场（cards-ui）
 * v3：只保留呼号搜索（后端 callSign 参数）+ 排序 / 加载更多 / 骨架 / 空态 / 错误态
 * 卡片列表使用共享组件 QSL.cardTile（内置点赞交互、彩纸与心跳）。
 * ============================================================ */
(function () {
  'use strict';

  const QSL = window.QSL;
  if (!QSL) return;
  const esc = QSL.escapeHtml;
  const PAGE_SIZE = 12;

  function ic(name, size) {
    return QSL.icon ? QSL.icon(name, size) : '';
  }

  const SORTS = [
    { key: 'latest', label: '最新' },
    { key: 'popular', label: '最热' },
    { key: 'oldest', label: '最早' }
  ];

  function skeletonGrid(count) {
    let html = '';
    for (let i = 0; i < count; i++) {
      html +=
        '<div class="g-skeleton-card">' +
        '<div class="g-skeleton g-skeleton-media"></div>' +
        '<div class="g-skeleton g-skeleton-line" style="width:68%"></div>' +
        '<div class="g-skeleton g-skeleton-line" style="width:44%"></div>' +
        '</div>';
    }
    return html;
  }

  /* ---------------- 页面骨架 ---------------- */
  function pageHtml(initial) {
    const sortHtml = SORTS.map(function (item) {
      const active = initial.sort === item.key;
      return '<button type="button" data-sort-key="' + item.key + '" class="' + (active ? 'is-active' : '') +
        '" aria-pressed="' + (active ? 'true' : 'false') + '">' + esc(item.label) + '</button>';
    }).join('');

    return (
      '<div class="g-explore">' +
      '<section class="g-explore__head">' +
      '<div class="container">' +
      '<div class="g-explore__intro" data-reveal>' +
      '<p class="eyebrow">EXPLORE · 卡片广场</p>' +
      '<h1 class="g-explore__title">在电波里，<span class="g-explore__title-em">交换一张卡片</span></h1>' +
      '<p class="g-explore__desc">输入呼号，找到那位火腿的 QSL 卡片；也可以按最新或最热，慢慢逛。</p>' +
      '</div>' +
      '<div class="g-explore__toolbar g-panel" data-reveal data-reveal-delay="80">' +
      '<div class="g-search">' +
      '<span class="g-search__icon" aria-hidden="true">' + ic('search', 18) + '</span>' +
      '<input class="g-search__input" type="search" inputmode="search" autocomplete="off" ' +
      'autocapitalize="characters" spellcheck="false" ' +
      'placeholder="输入呼号搜索" aria-label="按呼号搜索卡片" value="' + esc(initial.callSign || '') + '">' +
      '<button class="g-search__clear" type="button" data-search-clear aria-label="清空搜索"' +
      (initial.callSign ? '' : ' hidden') + '>' + ic('x', 15) + '</button>' +
      '</div>' +
      '<div class="g-explore__sortbar">' +
      '<span class="g-filter-label">排序</span>' +
      '<div class="segmented" data-sort-group>' + sortHtml + '</div>' +
      '<span class="g-explore__count" data-count-text>正在寻找卡片…</span>' +
      '<button class="g-reset-filter" type="button" data-reset hidden>' + ic('refresh', 14) + '<span>清空搜索</span></button>' +
      '</div>' +
      '</div>' +
      '<div class="g-explore__grid" data-grid aria-live="polite">' + skeletonGrid(8) + '</div>' +
      '<div class="g-explore__more" data-more-wrap hidden>' +
      '<button class="btn btn-soft btn-lg" type="button" data-more>加载更多' + ic('chevron-down', 16) + '</button>' +
      '</div>' +
      '<p class="g-explore__end" data-end hidden>已经看完全部卡片了 · 73!</p>' +
      '</div>' +
      '</section>' +
      '</div>'
    );
  }

  /* ---------------- 状态 ---------------- */
  function readInitial(ctx) {
    const query = (ctx && ctx.query) || new URLSearchParams(location.search);
    const sort = query.get('sort') || 'latest';
    return {
      callSign: (query.get('callSign') || '').trim(),
      sort: ['latest', 'popular', 'oldest'].indexOf(sort) >= 0 ? sort : 'latest',
      page: 1,
      pages: 1,
      total: 0,
      loading: false,
      reqId: 0,
      cancelled: false
    };
  }

  function activeFilterCount(state) {
    return state.callSign ? 1 : 0;
  }

  function syncUrl(state) {
    if (typeof QSL.setQuery !== 'function') return;
    try {
      QSL.setQuery({
        callSign: state.callSign || null,
        sort: state.sort === 'latest' ? null : state.sort
      });
    } catch (err) { /* URL 同步失败不影响页面 */ }
  }

  function setCountText(root, state) {
    const el = root.querySelector('[data-count-text]');
    if (!el) return;
    if (state.loading) {
      el.textContent = '正在寻找卡片…';
      return;
    }
    if (!state.total) {
      el.textContent = activeFilterCount(state) ? '没有匹配的呼号' : '广场还没有卡片';
      return;
    }
    const suffix = state.total > PAGE_SIZE ? ' · 已展示 ' + Math.min(state.items.length, state.total) + ' 张' : '';
    el.textContent = (activeFilterCount(state) ? '找到 ' : '共 ') + QSL.formatNumber(state.total) + ' 张卡片' + suffix;
  }

  function updateResetBtn(root, state) {
    const btn = root.querySelector('[data-reset]');
    if (!btn) return;
    btn.hidden = !state.callSign && state.sort === 'latest';
  }

  function markSort(root, state) {
    root.querySelectorAll('[data-sort-key]').forEach(function (btn) {
      const active = btn.getAttribute('data-sort-key') === state.sort;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function renderEmpty(root, state) {
    const grid = root.querySelector('[data-grid]');
    if (!grid) return;
    grid.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'g-grid-empty';
    const filtered = activeFilterCount(state) > 0;
    if (typeof QSL.emptyState === 'function') {
      wrap.appendChild(QSL.emptyState({
        icon: filtered ? 'search' : 'cards',
        title: filtered ? '没有找到这个呼号的卡片' : '广场还空着',
        desc: filtered
          ? '检查一下呼号是否填写正确，或者换个呼号试试，也许那位火腿还没上传卡片。'
          : '还没有已审核通过的卡片，成为第一个分享 QSL 卡片的人吧。',
        actionLabel: filtered ? '清空搜索' : '上传我的卡片',
        onAction: filtered
          ? function () { resetFilters(root, state); }
          : function () {
            const user = QSL.state && QSL.state.user;
            QSL.navigate(user ? '/dashboard/cards/new' : '/login?next=' + encodeURIComponent('/dashboard/cards/new'));
          }
      }));
    } else {
      wrap.innerHTML = '<div class="g-error-panel"><h3>' + (filtered ? '没有找到这个呼号的卡片' : '广场还空着') +
        '</h3><p>' + (filtered ? '换个呼号试试。' : '还没有已审核的卡片。') + '</p>' +
        (filtered ? '<button class="btn btn-primary" type="button" data-empty-reset>清空搜索</button>' : '') +
        '</div>';
      const reset = wrap.querySelector('[data-empty-reset]');
      if (reset) reset.addEventListener('click', function () { resetFilters(root, state); });
    }
    grid.appendChild(wrap);
  }

  function renderError(root, retry, message) {
    const grid = root.querySelector('[data-grid]');
    if (!grid) return;
    grid.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'g-grid-empty';
    wrap.innerHTML =
      '<div class="g-error-panel">' +
      '<span class="empty-state-icon">' + ic('alert', 30) + '</span>' +
      '<h3>卡片加载失败</h3>' +
      '<p>' + esc(message || '电波暂时有点杂音，请稍后重试。') + '</p>' +
      '<button class="btn btn-primary" type="button" data-retry>重新加载</button>' +
      '</div>';
    grid.appendChild(wrap);
    const btn = wrap.querySelector('[data-retry]');
    if (btn) btn.addEventListener('click', retry);
  }

  function appendTiles(root, cards, append) {
    const grid = root.querySelector('[data-grid]');
    if (!grid) return;
    if (!append) grid.innerHTML = '';
    cards.forEach(function (card, i) {
      let tile = null;
      try {
        tile = QSL.cardTile ? QSL.cardTile(card) : null;
      } catch (err) {
        tile = null;
      }
      if (!tile) return;
      if (!append) {
        tile.setAttribute('data-reveal', '');
        tile.setAttribute('data-reveal-delay', String(Math.min(i * 55, 400)));
      }
      grid.appendChild(tile);
    });
    if (QSL.fx && typeof QSL.fx.enhance === 'function') {
      try { QSL.fx.enhance(grid); } catch (err) { /* 动效失败忽略 */ }
    }
  }

  /* ---------------- 数据加载 ---------------- */
  function load(root, state, options) {
    const opts = options || {};
    const append = !!opts.append;
    if (state.loading) return;
    const cardsApi = QSL.api && QSL.api.cards;
    if (!cardsApi || typeof cardsApi.list !== 'function') {
      renderError(root, function () { load(root, state); }, '接口尚未就绪，请稍后再试。');
      return;
    }
    const reqId = ++state.reqId;
    state.loading = true;
    const moreBtn = root.querySelector('[data-more]');
    if (append && moreBtn && QSL.setBusy) QSL.setBusy(moreBtn, true, '加载中…');
    if (!append) {
      const grid = root.querySelector('[data-grid]');
      if (grid) grid.innerHTML = skeletonGrid(8);
      const moreWrap = root.querySelector('[data-more-wrap]');
      if (moreWrap) moreWrap.hidden = true;
      const endEl = root.querySelector('[data-end]');
      if (endEl) endEl.hidden = true;
      setCountText(root, state);
    }

    cardsApi.list({
      callSign: state.callSign || undefined,
      sort: state.sort,
      page: state.page,
      limit: PAGE_SIZE
    }).then(function (res) {
      if (state.cancelled || reqId !== state.reqId) return;
      const items = (res && res.items) || [];
      state.total = (res && res.total) || items.length;
      state.pages = (res && res.pages) || 1;
      state.items = append ? state.items.concat(items) : items;
      if (!state.items.length) {
        renderEmpty(root, state);
      } else {
        appendTiles(root, items, append);
      }
      const moreWrap = root.querySelector('[data-more-wrap]');
      const endEl = root.querySelector('[data-end]');
      const hasMore = state.page < state.pages && state.items.length < state.total;
      if (moreWrap) moreWrap.hidden = !hasMore;
      if (endEl) endEl.hidden = !(!hasMore && state.items.length > 0);
      if (append && QSL.toast && items.length) {
        QSL.toast('又找到 ' + items.length + ' 张卡片', 'info', 1800);
      }
    }).catch(function (err) {
      if (state.cancelled || reqId !== state.reqId) return;
      if (append) {
        if (QSL.toast) QSL.toast((err && err.message) || '加载更多失败，请稍后重试', 'error');
      } else {
        renderError(root, function () { load(root, state); }, err && err.message);
      }
    }).finally(function () {
      if (state.cancelled || reqId !== state.reqId) return;
      state.loading = false;
      setCountText(root, state);
      if (moreBtn && QSL.setBusy) QSL.setBusy(moreBtn, false);
    });
  }

  function resetFilters(root, state) {
    state.callSign = '';
    state.sort = 'latest';
    state.page = 1;
    const input = root.querySelector('.g-search__input');
    if (input) input.value = '';
    const clearBtn = root.querySelector('[data-search-clear]');
    if (clearBtn) clearBtn.hidden = true;
    markSort(root, state);
    updateResetBtn(root, state);
    syncUrl(state);
    load(root, state);
  }

  /* ---------------- 页面注册 ---------------- */
  QSL.registerPage('explore', {
    title: '卡片广场',
    render: function (container, ctx) {
      const state = readInitial(ctx);
      container.innerHTML = pageHtml(state);
      markSort(container, state);
      updateResetBtn(container, state);

      const searchInput = container.querySelector('.g-search__input');
      const clearBtn = container.querySelector('[data-search-clear]');
      const moreBtn = container.querySelector('[data-more]');
      const resetBtn = container.querySelector('[data-reset]');
      const sortHost = container.querySelector('[data-sort-group]');

      const applySearch = QSL.debounce(function (value) {
        state.callSign = String(value || '').trim();
        state.page = 1;
        if (clearBtn) clearBtn.hidden = !state.callSign;
        syncUrl(state);
        updateResetBtn(container, state);
        load(container, state);
      }, 320);

      function onSearchInput(e) {
        applySearch(e.target.value);
      }

      function onClearSearch() {
        if (!searchInput) return;
        searchInput.value = '';
        if (clearBtn) clearBtn.hidden = true;
        searchInput.focus();
        state.callSign = '';
        state.page = 1;
        syncUrl(state);
        updateResetBtn(container, state);
        load(container, state);
      }

      function onSortClick(e) {
        const btn = e.target.closest ? e.target.closest('[data-sort-key]') : null;
        if (!btn) return;
        const key = btn.getAttribute('data-sort-key');
        if (!key || key === state.sort) return;
        state.sort = key;
        state.page = 1;
        markSort(container, state);
        updateResetBtn(container, state);
        syncUrl(state);
        load(container, state);
      }

      function onMoreClick() {
        if (state.loading) return;
        state.page += 1;
        load(container, state, { append: true });
      }

      function onResetClick() {
        resetFilters(container, state);
      }

      if (searchInput) searchInput.addEventListener('input', onSearchInput);
      if (clearBtn) clearBtn.addEventListener('click', onClearSearch);
      if (sortHost) sortHost.addEventListener('click', onSortClick);
      if (moreBtn) moreBtn.addEventListener('click', onMoreClick);
      if (resetBtn) resetBtn.addEventListener('click', onResetClick);

      load(container, state);

      return function cleanup() {
        state.cancelled = true;
        state.reqId += 1;
      };
    }
  });
})();
