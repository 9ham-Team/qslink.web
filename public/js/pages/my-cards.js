/* ============================================================
 * QSLink · 我的卡片 My Cards（flows-ui）
 * 依赖：core.js / api.js / ui.js。数据：GET /api/me/cards
 * ============================================================ */
(function () {
  'use strict';
  const QSL = window.QSL;
  const esc = (v) => QSL.escapeHtml(v == null ? '' : v);
  const ico = (name, size) => (typeof QSL.icon === 'function' ? QSL.icon(name, size || 18) : '');

  const FILTERS = [
    { key: 'all', label: QSL.t("全部") },
    { key: 'approved', label: QSL.t("已通过") },
    { key: 'pending', label: QSL.t("审核中") },
    { key: 'rejected', label: QSL.t("已拒绝") }
  ];

  function countBy(items, status) {
    return items.filter((item) => item.status === status).length;
  }

  function statusNote(card) {
    if (card.status === 'rejected') {
      return (
        '<div class="f-card-reject">' +
        '<span class="f-card-reject-ico">' + ico('alert', 15) + '</span>' +
        ("<span><b>" + QSL.escapeHtml(QSL.t("审核未通过")) + "</b>") + (card.rejectReason ? '：' + esc(card.rejectReason) : QSL.t("，请修改后重新提交。")) + '</span>' +
        '</div>'
      );
    }
    if (card.status === 'pending') {
      return '<p class="f-card-pending-hint">' + ico('clock', 14) + (" " + QSL.escapeHtml(QSL.t("正在审核中，通过后将出现在卡片广场")) + "</p>");
    }
    return '';
  }

  function buildCardCell(card, handlers) {
    const cell = document.createElement('article');
    cell.className = 'f-card-cell';
    cell.dataset.cardId = card.id || '';

    const pin = document.createElement('span');
    pin.className = 'f-status-pin';
    pin.innerHTML = QSL.statusBadge(card.status);
    cell.appendChild(pin);

    let tile = null;
    try {
      tile = QSL.cardTile(card, { href: '/card/' + encodeURIComponent(card.id || ''), showStatus: false });
    } catch (err) {
      console.error('[my-cards] cardTile', err);
    }
    if (!tile) {
      tile = document.createElement('article');
      tile.className = 'qsl-tile';
      tile.innerHTML =
        '<div class="qsl-tile-frame"><a class="qsl-tile-media" href="/card/' + esc(card.id || '') + '">' +
        '<span class="qsl-tile-img" style="aspect-ratio:' + esc(QSL.ratioCss(card.ratio)) + '">' +
        '<img ' + QSL.images.attributes(card.frontImage || QSL.PLACEHOLDER_IMAGE) + ' alt="' + esc(card.title || '') + '" loading="lazy">' +
        '</span></a></div>' +
        '<div class="qsl-tile-info"><span class="qsl-tile-title">' + esc(card.title || QSL.t("未命名卡片")) + '</span></div>';
    }
    cell.appendChild(tile);

    const foot = document.createElement('div');
    foot.className = 'f-card-foot';
    foot.innerHTML =
      '<div class="f-card-meta">' +
      '<span class="f-card-status">' + QSL.statusBadge(card.status) + '</span>' +
      ("<span class=\"f-card-time\">" + QSL.escapeHtml(QSL.t("更新于")) + " ") + esc(QSL.timeAgo(card.updatedAt || card.createdAt)) + '</span>' +
      '</div>' +
      '<div class="f-card-actions">' +
      '<a class="f-card-act" href="/card/' + esc(card.id || '') + '">' + ico('external', 15) + ("<span>" + QSL.escapeHtml(QSL.t("查看")) + "</span></a>") +
      '<a class="f-card-act" href="/dashboard/cards/' + esc(card.id || '') + '/edit">' + ico('edit', 15) + ("<span>" + QSL.escapeHtml(QSL.t("编辑")) + "</span></a>") +
      '<button class="f-card-act" type="button" data-act="share">' + ico('share', 15) + ("<span>" + QSL.escapeHtml(QSL.t("分享")) + "</span></button>") +
      '<button class="f-card-act" type="button" data-act="stock">' + ico('cards', 15) + ("<span>" + QSL.escapeHtml(QSL.t("库存")) + "</span></button>") +
      '<button class="f-card-act is-danger" type="button" data-act="delete">' + ico('trash', 15) + ("<span>" + QSL.escapeHtml(QSL.t("删除")) + "</span></button>") +
      '</div>' +
      statusNote(card);
    cell.appendChild(foot);
    foot.querySelector('[data-act="stock"]').addEventListener('click', () => handlers.onStock(card));

    const shareBtn = foot.querySelector('[data-act="share"]');
    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        if (shareBtn.disabled) return;
        shareBtn.disabled = true;
        try {
          await QSL.shareCard(card);
        } catch (err) {
          QSL.toast((err && err.message) || QSL.t("分享失败"), 'error');
        } finally {
          shareBtn.disabled = false;
        }
      });
    }

    const delBtn = foot.querySelector('[data-act="delete"]');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        const ok = await QSL.confirm({
          title: QSL.t("删除卡片"),
          message: QSL.t("确定要删除「") + (card.title || QSL.t("未命名卡片")) + QSL.t("」吗？删除后不可恢复，相关点赞与换卡申请也会一并移除。"),
          confirmText: QSL.t("删除卡片"),
          cancelText: QSL.t("保留"),
          danger: true
        });
        if (!ok) return;
        cell.classList.add('is-busy');
        foot.querySelectorAll('button, a').forEach((el) => { el.style.pointerEvents = 'none'; el.setAttribute('aria-disabled', 'true'); });
        try {
          await QSL.api.cards.remove(card.id);
          QSL.toast(QSL.t("卡片已删除"), 'success');
          if (handlers && handlers.onDeleted) handlers.onDeleted(card);
        } catch (err) {
          cell.classList.remove('is-busy');
          foot.querySelectorAll('button, a').forEach((el) => { el.style.pointerEvents = ''; el.removeAttribute('aria-disabled'); });
          QSL.toast((err && err.message) || QSL.t("删除失败，请稍后重试"), 'error');
        }
      });
    }

    return cell;
  }

  function render(container, ctx) {
    if (!QSL.state.user) {
      QSL.navigate('/login?next=' + encodeURIComponent('/dashboard/cards'), { replace: true });
      return function cleanup() {};
    }

    const requestedFilter = ctx && ctx.query ? ctx.query.get('status') : null;
    let filter = FILTERS.some((f) => f.key === requestedFilter) ? requestedFilter : 'all';

    container.innerHTML =
      '<div class="f-page f-my-cards container">' +
      QSL.pageHeader({
        eyebrow: 'MY COLLECTION',
        title: QSL.t("我的卡片"),
        desc: QSL.t("管理你上传的双面 QSL 卡片：编辑、分享，或查看审核状态。"),
        actions: '<a class="btn btn-primary" href="/dashboard/cards/new">' + ico('upload', 17) + ("<span>" + QSL.escapeHtml(QSL.t("上传新卡片")) + "</span></a>")
      }) +
      '<div class="f-cards-toolbar" data-reveal>' +
      ("<div class=\"f-filters\" role=\"tablist\" aria-label=\"" + QSL.escapeHtml(QSL.t("卡片状态筛选")) + "\">") +
      FILTERS.map((f) =>
        '<button class="f-filter' + (f.key === filter ? ' is-active' : '') + '" type="button" role="tab" aria-selected="' +
        (f.key === filter ? 'true' : 'false') + '" data-filter="' + f.key + '">' + esc(f.label) +
        '<b class="f-filter-count" data-count-for="' + f.key + '">0</b></button>'
      ).join('') +
      '</div>' +
      ("<span class=\"f-cards-total\" data-cards-total>" + QSL.escapeHtml(QSL.t("加载中…")) + "</span>") +
      '</div>' +
      '<div class="f-cards-grid-wrap" id="fMyCardsGrid">' + QSL.skeletonCards(4) + '</div>' +
      '</div>';

    const gridWrap = container.querySelector('#fMyCardsGrid');
    const totalEl = container.querySelector('[data-cards-total]');
    let items = [];
    let alive = true;
    let stockModal = null;
    let deleted = false;

    function editStock(card) {
      if (stockModal) return;
      stockModal = QSL.openCardStock(card, {
        isActive: () => alive,
        onSaved: () => paint(),
        onClose: () => { stockModal = null; }
      });
    }

    function counts() {
      return {
        all: items.length,
        approved: countBy(items, 'approved'),
        pending: countBy(items, 'pending'),
        rejected: countBy(items, 'rejected')
      };
    }

    function paintFilters() {
      const map = counts();
      container.querySelectorAll('[data-count-for]').forEach((el) => {
        el.textContent = String(map[el.dataset.countFor] || 0);
      });
      container.querySelectorAll('.f-filter').forEach((btn) => {
        const active = btn.dataset.filter === filter;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      totalEl.textContent = (QSL.t("共") + " ") + items.length + (" " + QSL.t("张卡片"));
    }

    function visibleItems() {
      if (filter === 'all') return items;
      return items.filter((item) => item.status === filter);
    }

    function paintEmpty(filtered) {
      gridWrap.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'f-my-cards-empty';
      let empty;
      if (!items.length) {
        empty = QSL.emptyState({
          icon: 'cards',
          title: QSL.t("还没有 QSL 卡片"),
          desc: QSL.t("上传你的第一张双面卡片（正面 + 背面），审核通过后就能在卡片广场被同好发现。"),
          actionLabel: QSL.t("上传第一张卡片"),
          onAction: () => QSL.navigate('/dashboard/cards/new')
        });
      } else {
        empty = QSL.emptyState({
          icon: 'search',
          title: QSL.t("没有符合条件的卡片"),
          desc: QSL.t("试试切换上方的状态筛选，查看其它卡片。"),
          actionLabel: QSL.t("查看全部卡片"),
          onAction: () => {
            filter = 'all';
            QSL.setQuery({ status: null });
            paintFilters();
            paint();
          }
        });
      }
      wrap.appendChild(empty);
      gridWrap.appendChild(wrap);
      void filtered;
    }

    function paint() {
      if (!alive) return;
      paintFilters();
      const list = visibleItems();
      if (!list.length) {
        paintEmpty(true);
        return;
      }
      gridWrap.innerHTML = '<div class="f-grid-cards"></div>';
      const grid = gridWrap.firstElementChild;
      list.forEach((card, index) => {
        const cell = buildCardCell(card, {
          onStock: editStock,
          onDeleted: (deletedCard) => {
            items = items.filter((item) => item.id !== deletedCard.id);
            paint();
          }
        });
        cell.style.setProperty('--f-delay', (index * 40) + 'ms');
        grid.appendChild(cell);
      });
    }

    container.querySelectorAll('.f-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (filter === btn.dataset.filter) return;
        filter = btn.dataset.filter;
        QSL.setQuery({ status: filter === 'all' ? null : filter });
        paint();
      });
    });

    async function load() {
      try {
        const data = await QSL.api.cards.mine();
        if (!alive) return;
        items = Array.isArray(data && data.items) ? data.items : [];
        paint();
      } catch (err) {
        if (!alive) return;
        deleted = true;
        console.error(QSL.t("[my-cards] 加载失败"), err);
        gridWrap.innerHTML = '';
        const empty = QSL.emptyState({
          icon: 'alert',
          title: QSL.t("卡片加载失败"),
          desc: (err && err.message) || QSL.t("网络异常，请稍后重试"),
          actionLabel: QSL.t("重新加载"),
          onAction: () => {
            gridWrap.innerHTML = QSL.skeletonCards(4);
            load();
          }
        });
        gridWrap.appendChild(empty);
        totalEl.textContent = QSL.t("加载失败");
      }
    }

    load();
    void deleted;
    return function cleanup() { alive = false; if (stockModal) stockModal.close(); };
  }

  QSL.registerPage('my-cards', { title: QSL.t("我的卡片"), render: render });
})();
