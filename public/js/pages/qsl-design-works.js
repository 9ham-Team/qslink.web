/* QSLink · 公开参赛作品 */
(function () {
  'use strict';
  const QSL = window.QSL;
  const esc = QSL.escapeHtml;
  const text = (source) => esc(QSL.t(source));

  QSL.registerPage('qsl-design-works', {
    title: QSL.t('参赛作品'),
    render(container, ctx) {
      let alive = true;
      let request = 0;
      let timer;
      let page = 0;
      let pages = 0;
      let busy = false;
      let q = (ctx.query.get('q') || '').trim();
      const events = new AbortController();
      container.innerHTML = '<div class="g-explore"><section class="g-explore__head"><div class="container">' +
        '<div class="g-explore__intro"><p class="eyebrow">QSL DESIGN CONTEST · 2026.11</p><h1 class="g-explore__title">' + text('参赛作品') + '</h1>' +
        '<p class="g-explore__desc">' + text('按首次参赛提交顺序，发现每一张卡片的设计故事。') + '</p></div>' +
        '<div class="g-explore__toolbar g-panel"><div class="g-search"><span class="g-search__icon" aria-hidden="true">' + QSL.icon('search', 18) + '</span>' +
        '<input class="g-search__input" type="search" autocomplete="off" spellcheck="false" placeholder="' + text('搜索呼号或作品编号') + '" aria-label="' + text('搜索呼号或作品编号') + '" value="' + esc(q) + '">' +
        '<button class="g-search__clear" type="button" data-clear aria-label="' + text('清空搜索') + '"' + (q ? '' : ' hidden') + '>' + QSL.icon('x', 15) + '</button></div>' +
        '<div class="g-explore__sortbar"><span class="g-filter-label">' + text('按参赛提交时间从早到晚') + '</span><span class="g-explore__count" data-count role="status"></span></div></div>' +
        '<div class="g-explore__grid" data-grid aria-live="polite"></div><div class="g-explore__more"><button class="btn btn-soft btn-lg" type="button" data-more hidden>' + text('加载更多') + '</button></div></div></section></div>';
      const grid = container.querySelector('[data-grid]');
      const count = container.querySelector('[data-count]');
      const input = container.querySelector('input');
      const clear = container.querySelector('[data-clear]');
      const more = container.querySelector('[data-more]');

      async function load(append) {
        if (append && busy) return;
        const id = ++request;
        const nextPage = append ? page + 1 : 1;
        busy = true;
        grid.setAttribute('aria-busy', 'true');
        more.hidden = !append;
        QSL.setBusy(more, true);
        if (!append) { QSL.loading(grid); count.textContent = QSL.t('加载中…'); }
        try {
          const data = await QSL.api.get('/api/contests/qsl-design-2026-11/works?' + new URLSearchParams({ q, page: nextPage, limit: 12 }));
          if (!alive || id !== request) return;
          if (!append) grid.replaceChildren();
          data.items.forEach((work) => {
            const number = String(work.number).padStart(3, '0');
            const tile = QSL.cardTile(work.card, { href: '/events/qsl-design-2026-11/works/' + encodeURIComponent(work.id), contestVoteCount: Number(work.voteCount) || 0, footerHtml: '<div class="g-contest-work"><strong>' + esc(QSL.t('作品编号：{n}', { n: number })) + '</strong>' +
              (work.description ? '<details><summary>' + text('作品说明') + '</summary><p>' + esc(work.description) + '</p></details>' : '<p class="hint">' + text('作品说明审核通过后展示，不影响图片展示与投票。') + '</p>') + '</div>' });
            grid.appendChild(tile);
          });
          if (!data.total) {
            const empty = document.createElement('div');
            empty.className = 'g-grid-empty';
            empty.appendChild(QSL.emptyState({ icon: q ? 'search' : 'cards', title: QSL.t(q ? '没有匹配的参赛作品' : '暂无公开参赛作品'), desc: QSL.t(q ? '试试其他呼号或作品编号。' : '使用已通过广场审核的卡片报名后，即可在这里展示并参与投票。') }));
            grid.appendChild(empty);
          }
          page = data.page;
          pages = data.pages;
          count.textContent = QSL.t('共 {n} 件参赛作品', { n: data.total });
          more.hidden = page >= pages;
          if (QSL.fx) QSL.fx.enhance(grid);
        } catch (err) {
          if (!alive || id !== request) return;
          if (!append) QSL.renderError(grid, err, () => load(false));
          else QSL.toast(err.message || QSL.t('加载失败'), 'error');
          count.textContent = QSL.t('加载失败');
        } finally {
          if (alive && id === request) {
            busy = false;
            grid.removeAttribute('aria-busy');
            QSL.setBusy(more, false);
          }
        }
      }
      function search() {
        q = input.value.trim();
        clear.hidden = !q;
        QSL.setQuery({ q: q || null });
        load(false);
      }
      input.addEventListener('input', () => {
        clearTimeout(timer);
        // Invalidate in-flight results immediately, before the debounce expires.
        request++;
        busy = false;
        more.hidden = true;
        timer = setTimeout(search, 320);
      }, { signal: events.signal });
      clear.addEventListener('click', () => { clearTimeout(timer); input.value = ''; input.focus(); search(); }, { signal: events.signal });
      more.addEventListener('click', () => load(true), { signal: events.signal });
      load(false);
      return () => { alive = false; request++; clearTimeout(timer); events.abort(); };
    }
  });
})();
