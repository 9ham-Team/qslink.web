/* ============================================================
 * QSLink · 管理后台 Admin（admin-ui）
 * 依赖：core.js / api.js / ui.js / card3d.js（可选）
 * 路由：/admin?tab=overview|users|cards|exchanges|announcements|contest
 * 数据：GET /api/admin/stats、/users、/cards、/exchanges
 * 说明：仅写 public/js/pages/admin.js、public/css/admin.css；共享层只使用不修改。
 * ============================================================ */
(function () {
  'use strict';
  const QSL = window.QSL;
  if (!QSL || typeof QSL.registerPage !== 'function') return;

  const esc = (v) => QSL.escapeHtml(v == null ? '' : v);
  const escAttr = (v) => (typeof QSL.escapeAttr === 'function' ? QSL.escapeAttr(v) : esc(v));
  const ico = (name, size) => (typeof QSL.icon === 'function' ? QSL.icon(name, size || 18) : '');

  const CONTEST_KEY = 'qsl-design-2026-11';
  const CONTEST_API = '/api/admin/contests/' + CONTEST_KEY + '/entries';
  const TABS = ['overview', 'users', 'cards', 'exchanges', 'announcements', 'contest'];
  const TAB_META = {
    overview: { label: QSL.t("概览"), icon: 'layout' },
    users: { label: QSL.t("用户管理"), icon: 'users' },
    cards: { label: QSL.t("卡片审核"), icon: 'cards' },
    exchanges: { label: QSL.t("换卡记录"), icon: 'send' },
    announcements: { label: QSL.t("公告管理"), icon: 'info' },
    contest: { label: QSL.t("比赛审核"), icon: 'trophy' }
  };
  const LIMITS = { users: 10, cards: 8, exchanges: 12 };
  const CARD_STATUS_TABS = [
    { key: 'all', label: QSL.t("全部") },
    { key: 'pending', label: QSL.t("待审核") },
    { key: 'approved', label: QSL.t("已通过") },
    { key: 'rejected', label: QSL.t("已拒绝") }
  ];
  const EXCHANGE_STATUS_OPTIONS = [
    { key: '', label: QSL.t("全部状态") },
    { key: 'pending', label: QSL.t("待处理") },
    { key: 'approved', label: QSL.t("已同意") },
    { key: 'rejected', label: QSL.t("已拒绝") },
    { key: 'completed', label: QSL.t("已完成") },
    { key: 'cancelled', label: QSL.t("已取消") }
  ];
  const COLOR_LIST = (QSL.AVATAR_COLORS && QSL.AVATAR_COLORS.slice()) || ['#0eaf8f', '#14b8a6', '#38bdf8', '#6366f1', '#8b5cf6', '#ec4899', '#fb7185', '#f59e0b', '#84cc16', '#0ea5e9'];

  /* ============================================================
   * 通用小工具
   * ============================================================ */
  function toast(message, type) {
    if (typeof QSL.toast === 'function') QSL.toast(message, type || 'success');
  }
  function toastError(err) {
    const msg = err && err.message ? err.message : QSL.t("操作失败，请稍后重试");
    toast(msg, 'error');
  }
  function enhanceScope(scope) {
    if (!scope) return;
    try {
      if (QSL.fx && typeof QSL.fx.enhance === 'function') QSL.fx.enhance(scope);
    } catch (err) { /* 动效失败不影响功能 */ }
  }
  function celebrate(el) {
    if (!QSL.fx || typeof QSL.fx.confetti !== 'function') return;
    try {
      let x, y;
      if (el && typeof el.getBoundingClientRect === 'function') {
        const r = el.getBoundingClientRect();
        x = r.left + r.width / 2;
        y = r.top + r.height / 2;
      }
      QSL.fx.confetti(x, y);
    } catch (err) { /* 忽略 */ }
  }
  function fmtDateTime(iso) { return typeof QSL.formatDateTime === 'function' ? QSL.formatDateTime(iso) : (iso || '—'); }
  function fmtDate(iso) { return typeof QSL.formatDate === 'function' ? QSL.formatDate(iso) : (iso || '—'); }
  function timeAgo(iso) { return typeof QSL.timeAgo === 'function' ? QSL.timeAgo(iso) : (iso || '—'); }
  function ratioCss(ratio) { return typeof QSL.ratioCss === 'function' ? QSL.ratioCss(ratio) : ((ratio && ratio.w) || 3) + ' / ' + ((ratio && ratio.h) || 2); }
  function ratioLabel(ratio) { return typeof QSL.ratioLabel === 'function' ? QSL.ratioLabel(ratio) : ((ratio && ratio.w) || 3) + ' : ' + ((ratio && ratio.h) || 2); }
  function badge(text, tone) { return typeof QSL.badge === 'function' ? QSL.badge(text, tone) : '<span class="badge badge-' + esc(tone || 'mint') + '">' + esc(text) + '</span>'; }
  function statusBadge(status) { return typeof QSL.statusBadge === 'function' ? QSL.statusBadge(status) : badge(status, 'slate'); }
  function exchangeBadge(status) { return typeof QSL.exchangeBadge === 'function' ? QSL.exchangeBadge(status) : badge(status, 'slate'); }
  function exchangeText(status) {
    if (typeof QSL.exchangeText === 'function') return QSL.exchangeText(status);
    const map = { pending: QSL.t("待处理"), approved: QSL.t("已同意"), rejected: QSL.t("已拒绝"), completed: QSL.t("已完成"), cancelled: QSL.t("已取消") };
    return map[status] || status || QSL.t("未知");
  }
  function statusText(status) {
    if (typeof QSL.statusText === 'function') return QSL.statusText(status);
    const map = { pending: QSL.t("审核中"), approved: QSL.t("已通过"), rejected: QSL.t("已拒绝") };
    return map[status] || status || QSL.t("未知");
  }
  function roleBadge(role) {
    return role === 'admin' ? badge(QSL.t("管理员"), 'violet') : badge(QSL.t("普通用户"), 'slate');
  }
  function accountBadge(status) {
    return status === 'banned' ? badge(QSL.t("已禁用"), 'rose') : badge(QSL.t("正常"), 'mint');
  }
  function imageSrc(src) { return src || QSL.PLACEHOLDER_IMAGE || ''; }

  function userCell(user, isSelf) {
    const u = user || {};
    const name = u.displayName || u.username || QSL.t("未知用户");
    return (
      '<div class="cell-user a-user-cell">' + QSL.avatar(u, 38) +
      '<div class="a-user-cell-text"><b>' + esc(name) +
      (isSelf ? (" <span class=\"badge badge-sky a-self-badge\">" + QSL.escapeHtml(QSL.t("本人")) + "</span>") : '') + '</b>' +
      '<small>@' + esc(u.username || '—') + '</small></div></div>'
    );
  }

  function userInline(user, size) {
    if (!user) return ("<span class=\"muted\">" + QSL.escapeHtml(QSL.t("用户已删除")) + "</span>");
    const u = user;
    return (
      '<span class="a-user-inline">' + QSL.avatar(u, size || 30) +
      '<span class="a-user-inline-text"><b>' + esc(u.displayName || u.username || QSL.t("未知用户")) + '</b>' +
      '<small>@' + esc(u.username || '') + '</small></span></span>'
    );
  }

  function callCell(callSign) {
    return callSign ? '<span class="a-call">' + esc(callSign) + '</span>' : '<span class="a-cell-muted">—</span>';
  }

  function thumbPair(card, opts) {
    const c = card || {};
    const o = opts || {};
    const ar = escAttr(ratioCss(c.ratio));
    const front = imageSrc(c.frontImage);
    const back = c.backImage || '';
    const extraCls = o.className ? ' ' + o.className : '';
    return (
      '<div class="a-thumbs' + extraCls + '">' +
      '<figure class="a-thumb" style="--ar:' + ar + '">' +
      '<img ' + QSL.images.attributes(front, o.sizes || '240px') + ' alt="' + escAttr((c.title || QSL.t("卡片")) + (" " + QSL.t("正面"))) + '" loading="lazy" decoding="async">' +
      ("<figcaption>" + QSL.escapeHtml(QSL.t("正面")) + "</figcaption></figure>") +
      '<figure class="a-thumb' + (back ? '' : ' a-thumb--empty') + '" style="--ar:' + ar + '">' +
      (back
        ? '<img ' + QSL.images.attributes(back, o.sizes || '240px') + ' alt="' + escAttr((c.title || QSL.t("卡片")) + (" " + QSL.t("背面"))) + ("\" loading=\"lazy\" decoding=\"async\"><figcaption>" + QSL.escapeHtml(QSL.t("背面")) + "</figcaption>")
        : '<span class="a-thumb-none">' + ico('image', 16) + ("<span>" + QSL.escapeHtml(QSL.t("无背面")) + "</span></span>")) +
      '</figure></div>'
    );
  }

  function miniThumb(src, title) {
    return '<span class="a-mini-thumb"><img ' + QSL.images.attributes(imageSrc(src), '56px') + ' alt="' + escAttr(title || QSL.t("卡片缩略图")) + '" loading="lazy" decoding="async"></span>';
  }

  function emptyInto(container, options) {
    if (!container) return;
    container.innerHTML = '';
    try {
      const el = QSL.emptyState(options || {});
      if (el) container.appendChild(el);
    } catch (err) { /* 极端情况下退化为纯文本 */ }
  }

  function renderLoadError(container, err, retry) {
    const forbidden = err && (err.status === 403 || err.code === 'FORBIDDEN');
    emptyInto(container, {
      icon: forbidden ? 'shield' : 'alert',
      title: forbidden ? QSL.t("没有访问权限") : QSL.t("数据加载失败"),
      desc: forbidden ? QSL.t("当前账号没有管理权限，请使用管理员账号登录。") : ((err && err.message) || QSL.t("网络异常，请稍后重试。")),
      actionLabel: forbidden ? '' : QSL.t("重新加载"),
      onAction: forbidden ? undefined : retry
    });
  }

  function pagerInner(data) {
    const page = Math.max(1, (data && data.page) || 1);
    const pages = Math.max(1, (data && data.pages) || 1);
    const total = (data && data.total) || 0;
    let start = Math.max(1, page - 2);
    let end = Math.min(pages, start + 4);
    start = Math.max(1, end - 4);
    let btns = '';
    btns += '<button type="button" data-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + (" aria-label=\"" + QSL.escapeHtml(QSL.t("上一页")) + "\">") + ico('arrow-left', 15) + '</button>';
    for (let i = start; i <= end; i++) {
      btns += '<button type="button" data-page="' + i + '" class="' + (i === page ? 'is-active' : '') + '"' +
        (i === page ? ' aria-current="page"' : '') + '>' + i + '</button>';
    }
    btns += '<button type="button" data-page="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + (" aria-label=\"" + QSL.escapeHtml(QSL.t("下一页")) + "\">") + ico('arrow-right', 15) + '</button>';
    return (
      ("<span class=\"a-pager-info\">" + QSL.escapeHtml(QSL.t("共")) + " <b>") + total + ("</b> " + QSL.escapeHtml(QSL.t("条 · 第")) + " ") + page + ' / ' + pages + (" " + QSL.escapeHtml(QSL.t("页")) + "</span>") +
      '<span class="a-pager-btns">' + btns + '</span>'
    );
  }

  function renderPager(el, data, onGo) {
    if (!el) return;
    el.innerHTML = pagerInner(data);
    el.querySelectorAll('[data-page]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        const target = parseInt(btn.getAttribute('data-page'), 10);
        if (!target || target < 1) return;
        onGo(target);
      });
    });
  }

  function animateBusy(btn, busy, text) {
    if (typeof QSL.setBusy === 'function') QSL.setBusy(btn, busy, text);
    else if (btn) btn.disabled = !!busy;
  }

  /* ============================================================
   * 页面状态
   * ============================================================ */
  let S = null;

  function createState(tab) {
    return {
      tab: tab,
      me: QSL.state.user,
      root: null,
      pageEl: null,
      disposed: false,
      stats: null,
      announcementPage: 1,
      announcementModal: null,
      contestModal: null,
      contest: { status: 'pending', page: 1, announcementPage: 1, detailJob: 0 },
      jobs: { overview: 0, users: 0, cards: 0, exchanges: 0, announcements: 0, contest: 0, stats: 0 },
      users: { q: '', status: '', role: '', page: 1, data: null, map: Object.create(null) },
      cards: { status: 'all', q: '', page: 1, data: null, map: Object.create(null) },
      exchanges: { status: '', page: 1, data: null, map: Object.create(null) }
    };
  }

  function isLive(root, tab) {
    return !!S && !S.disposed && S.tab === tab && root && root.isConnected;
  }
  function aliveRoot(root, tab, job) {
    return isLive(root, tab) && S.jobs[tab] === job;
  }

  function tabRoot(panel, html) {
    panel.innerHTML = '<div class="a-tab-body" data-root>' + html + '</div>';
    const root = panel.firstElementChild;
    S.root = root;
    return root;
  }

  function redrawTab() {
    if (!S || S.disposed) return;
    const panel = document.getElementById('a-panel');
    if (panel) drawTab(S.tab, panel);
  }

  /* ============================================================
   * 根渲染 / 权限占位
   * ============================================================ */
  function normalizeTab(value) {
    return TABS.indexOf(value) >= 0 ? value : 'overview';
  }

  function renderDenied(container, kind) {
    const guest = kind === 'guest';
    container.innerHTML =
      '<div class="a-page container a-denied-wrap">' +
      '<section class="a-denied glass" data-reveal>' +
      '<span class="a-denied-seal">' + ico(guest ? 'lock' : 'shield', 34) + '</span>' +
      '<h1 class="a-denied-title">' + (guest ? QSL.t("请先登录") : QSL.t("没有访问权限")) + '</h1>' +
      '<p class="a-denied-desc">' + (guest
        ? QSL.t("管理后台需要管理员账号登录后访问。")
        : QSL.t("当前账号不是管理员，无法进入管理后台。如需管理权限，请联系站点管理员。")) + '</p>' +
      '<div class="a-denied-actions">' +
      (guest ? '<a class="btn btn-primary" href="/login?next=' + encodeURIComponent('/admin') + ("\">" + QSL.escapeHtml(QSL.t("去登录")) + "</a>") : '') +
      ("<a class=\"btn btn-ghost\" href=\"/\">" + QSL.escapeHtml(QSL.t("返回首页")) + "</a>") +
      '</div></section></div>';
  }

  function heroHtml() {
    const me = S.me || {};
    return (
      '<header class="a-hero glass">' +
      '<div class="a-hero-main">' +
      '<span class="a-hero-seal">' + ico('shield', 30) + '</span>' +
      '<div class="a-hero-text">' +
      '<p class="eyebrow">ADMIN CONSOLE</p>' +
      ("<h1 class=\"a-hero-title\">" + QSL.escapeHtml(QSL.t("管理后台")) + "</h1>") +
      ("<p class=\"a-hero-desc\">" + QSL.escapeHtml(QSL.t("审核卡片、管理用户、查看换卡记录 · 以")) + " <b>") + esc(me.displayName || me.username || QSL.t("管理员")) + ("</b> " + QSL.escapeHtml(QSL.t("身份登录")) + "</p>") +
      '</div></div>' +
      '<div class="a-hero-actions">' +
      '<button class="btn btn-ghost btn-sm" type="button" data-act="admin-refresh">' + ico('refresh', 16) + (QSL.escapeHtml(QSL.t("刷新数据")) + "</button>") +
      '<a class="btn btn-soft btn-sm" href="/">' + ico('arrow-left', 16) + (QSL.escapeHtml(QSL.t("返回前台")) + "</a>") +
      '</div></header>'
    );
  }

  function tabsHtml(active) {
    return (
      ("<nav class=\"a-tabs-wrap\" aria-label=\"" + QSL.escapeHtml(QSL.t("管理后台导航")) + "\"><div class=\"tabs tabs-lg a-tabs\" role=\"tablist\">") +
      TABS.map(function (key) {
        const meta = TAB_META[key];
        const on = key === active;
        const count = key === 'cards' || key === 'exchanges'
          ? '<b class="tab-count" data-tab-badge="' + key + '" hidden></b>'
          : '';
        return '<button class="tab' + (on ? ' is-active' : '') + '" type="button" role="tab" aria-selected="' +
          (on ? 'true' : 'false') + '" data-tab="' + key + '">' + ico(meta.icon, 17) +
          '<span>' + esc(meta.label) + '</span>' + count + '</button>';
      }).join('') +
      '</div></nav>'
    );
  }

  function paintPage(container, tab) {
    S = createState(tab);
    S.me = QSL.state.user;
    container.innerHTML =
      '<div class="a-page container">' +
      heroHtml() + tabsHtml(tab) +
      ("<section class=\"a-panel\" id=\"a-panel\" role=\"tabpanel\" aria-label=\"" + QSL.escapeHtml(QSL.t("管理后台内容")) + "\"></section>") +
      '</div>';
    S.pageEl = container.querySelector('.a-page');
    bindShell(S.pageEl);
    switchTab(tab, { sync: false });
  }

  function bindShell(pageEl) {
    const tabsEl = pageEl.querySelector('.a-tabs');
    if (tabsEl) {
      tabsEl.addEventListener('click', function (ev) {
        const btn = ev.target.closest('[data-tab]');
        if (!btn) return;
        const tab = btn.getAttribute('data-tab');
        if (TABS.indexOf(tab) < 0 || !S) return;
        switchTab(tab, { sync: true });
      });
    }
    const refreshBtn = pageEl.querySelector('[data-act="admin-refresh"]');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        if (!S) return;
        redrawTab();
        refreshStatsQuiet();
        toast(QSL.t("数据已刷新"), 'info');
      });
    }
  }

  function switchTab(tab, opts) {
    if (!S || S.disposed) return;
    const o = opts || {};
    const next = normalizeTab(tab);
    S.tab = next;
    const pageEl = S.pageEl;
    if (pageEl) {
      pageEl.querySelectorAll('.a-tabs [data-tab]').forEach(function (btn) {
        const on = btn.getAttribute('data-tab') === next;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
        btn.tabIndex = on ? 0 : -1;
      });
    }
    if (o.sync !== false) {
      try { if (typeof QSL.setQuery === 'function') QSL.setQuery({ tab: next }); } catch (err) { /* 忽略 */ }
      // 从页面下方切换 Tab 时回到内容顶部，避免停留在半截位置
      try {
        const top = pageEl ? pageEl.getBoundingClientRect().top + window.scrollY - 8 : 0;
        if (window.scrollY > top + 80) window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      } catch (err) { /* 忽略 */ }
    }
    const panel = document.getElementById('a-panel');
    if (!panel) return;
    drawTab(next, panel);
    if (next !== 'overview' && !S.stats) refreshStatsQuiet();
    updateTabBadges();
  }

  function drawTab(tab, panel) {
    closeAnnouncementModal();
    closeContestModal();
    S.root = null;
    if (tab === 'overview') drawOverview(panel);
    else if (tab === 'users') drawUsers(panel);
    else if (tab === 'cards') drawCards(panel);
    else if (tab === 'announcements') drawAnnouncements(panel);
    else if (tab === 'contest') drawContest(panel);
    else drawExchanges(panel);
  }

  function closeAnnouncementModal() {
    if (!S || !S.announcementModal) return;
    const modal = S.announcementModal;
    const overlay = modal.el.closest('.modal-overlay');
    modal.close();
    if (overlay) overlay.remove();
    S.announcementModal = null;
  }

  function editAnnouncement(root, item, eventKey) {
    closeContestModal();
    closeAnnouncementModal();
    const owner = S;
    const tab = eventKey ? 'contest' : 'announcements';
    let closed = false;
    let busy = false;
    const modal = QSL.modal({
      title: eventKey ? (item ? QSL.t("编辑赛事动态") : QSL.t("新建赛事动态")) : (item ? QSL.t("编辑公告") : QSL.t("新建公告")),
      size: 'lg',
      content: ("<form class=\"a-announcement-form\"><div class=\"a-announcement-field\"><label>" + QSL.escapeHtml(QSL.t("标题")) + "<input class=\"input\" name=\"title\" required aria-describedby=\"a-ann-count-title\" value=\"") + escAttr(item ? item.title : '') + ("\"></label><small class=\"muted a-announcement-count\" id=\"a-ann-count-title\" data-count-for=\"title\" data-max=\"120\"></small></div><div class=\"a-announcement-field\"><label>" + QSL.escapeHtml(QSL.t("正文（纯文本）")) + "<textarea class=\"textarea\" name=\"body\" required aria-describedby=\"a-ann-count-body\">") + esc(item ? item.body : '') + ("</textarea></label><small class=\"muted a-announcement-count\" id=\"a-ann-count-body\" data-count-for=\"body\" data-max=\"10000\"></small></div><label>" + QSL.escapeHtml(QSL.t("弹窗停留时长（秒）")) + "<input class=\"input\" type=\"number\" name=\"displaySeconds\" min=\"1\" max=\"3600\" step=\"1\" required value=\"") + escAttr(item ? item.displaySeconds : 30) + ("\"></label><small class=\"muted\">" + QSL.escapeHtml(QSL.t("默认 30 秒，可设置 1–3600 秒；读条结束后自动关闭。")) + "</small><label>" + QSL.escapeHtml(QSL.t("状态")) + "<select class=\"select\" name=\"status\"><option value=\"draft\">" + QSL.escapeHtml(QSL.t("草稿 / 已撤下")) + "</option><option value=\"published\"") + (item && item.status === 'published' ? ' selected' : '') + (">" + QSL.escapeHtml(QSL.t("已发布")) + "</option></select></label><p class=\"a-hint-error\" data-error role=\"alert\"></p><button class=\"btn btn-primary\" type=\"submit\">" + QSL.escapeHtml(QSL.t("保存公告")) + "</button></form>"),
      onClose: function () {
        closed = true;
        const overlay = modal.el.closest('.modal-overlay');
        if (overlay) document.removeEventListener('keydown', overlay._onKey);
        if (owner.announcementModal === modal) owner.announcementModal = null;
      }
    });
    owner.announcementModal = modal;
    const form = modal.body.querySelector('form');
    if (eventKey) {
      const durationLabel = form.elements.displaySeconds.closest('label');
      durationLabel.nextElementSibling.remove();
      durationLabel.remove();
      form.querySelector('[type="submit"]').textContent = QSL.t("保存赛事动态");
    }
    form.querySelectorAll('[data-count-for]').forEach(function (counter) {
      const field = form.elements[counter.dataset.countFor];
      const max = Number(counter.dataset.max);
      const update = function () {
        const length = Array.from(field.value.trim()).length;
        counter.textContent = length + ' / ' + max;
        counter.classList.toggle('is-over', length > max);
      };
      field.addEventListener('input', update);
      update();
    });
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (busy || closed || S !== owner || !isLive(root, tab)) return;
      busy = true;
      const btn = form.querySelector('[type="submit"]');
      animateBusy(btn, true);
      form.querySelector('[data-error]').textContent = '';
      const values = Object.fromEntries(new FormData(form));
      if (!eventKey) values.displaySeconds = Number(values.displaySeconds);
      if (eventKey && !item) values.eventKey = eventKey;
      try {
        if (item) await QSL.api.put('/api/admin/announcements/' + encodeURIComponent(item.id), values);
        else await QSL.api.post('/api/admin/announcements', values);
        if (closed || S !== owner || !isLive(root, tab)) return;
        modal.close();
        toast(eventKey ? QSL.t("赛事动态已保存") : QSL.t("公告已保存"));
        redrawTab();
      } catch (err) {
        if (!closed && S === owner && isLive(root, tab)) {
          form.querySelector('[data-error]').textContent = err.message || QSL.t("保存失败");
          if (err.fields) QSL.showFieldErrors(form, err.fields);
        }
      } finally {
        busy = false;
        if (!closed) animateBusy(btn, false);
      }
    });
  }

  function drawAnnouncements(panel, eventKey, host) {
    const owner = S;
    const tab = eventKey ? 'contest' : 'announcements';
    const html = ("<div class=\"toolbar a-toolbar\"><h2>" + QSL.escapeHtml(QSL.t("公告管理")) + "</h2><span class=\"a-toolbar-spacer\"></span><button class=\"btn btn-primary btn-sm\" data-ann-new type=\"button\">" + QSL.escapeHtml(QSL.t("新建公告")) + "</button></div><div data-ann-list>" + QSL.escapeHtml(QSL.t("正在加载公告…")) + "</div><div class=\"pagination a-pager\" data-ann-pager></div>");
    const root = host || tabRoot(panel, html);
    if (host) host.innerHTML = html;
    if (eventKey) {
      root.querySelector('h2').textContent = QSL.t("赛事动态");
      root.querySelector('[data-ann-new]').textContent = QSL.t("新建赛事动态");
      root.querySelector('[data-ann-list]').textContent = QSL.t("正在加载赛事动态…");
    }
    const job = ++S.jobs.announcements;
    const page = eventKey ? S.contest.announcementPage : S.announcementPage;
    const live = function () { return S === owner && isLive(root, tab) && S.jobs.announcements === job; };
    root.querySelector('[data-ann-new]').addEventListener('click', function () { editAnnouncement(root, null, eventKey); });
    QSL.api.get('/api/admin/announcements?page=' + page + '&limit=8' + (eventKey ? '&eventKey=' + encodeURIComponent(eventKey) : '')).then(function (res) {
      if (!live()) return;
      const list = root.querySelector('[data-ann-list]');
      list.innerHTML = res.items.length ? res.items.map(function (item) {
        return '<article class="a-announcement-row"><h3>' + esc(item.title) + '</h3>' + badge(item.status === 'published' ? QSL.t("已发布") : QSL.t("草稿 / 已撤下"), item.status === 'published' ? 'mint' : 'slate') + '<p class="a-announcement-body">' + esc(item.body) + ("</p><small class=\"muted\">" + QSL.escapeHtml(QSL.t("更新："))) + esc(fmtDateTime(item.updatedAt)) + (eventKey ? (' · ' + esc(QSL.t("发布时间："))) : (" " + esc(QSL.t("· 停留："))) + esc(item.displaySeconds) + (" " + esc(QSL.t("秒 · 发布时间：")))) + esc(item.publishedAt ? fmtDateTime(item.publishedAt) : QSL.t("未发布")) + '</small><div class="a-announcement-actions"><button class="btn btn-ghost btn-sm" type="button" data-ann-edit="' + escAttr(item.id) + ("\">" + QSL.escapeHtml(QSL.t("编辑")) + "</button><button class=\"btn btn-soft btn-sm\" type=\"button\" data-ann-toggle=\"") + escAttr(item.id) + '">' + (item.status === 'published' ? QSL.t("撤下") : QSL.t("发布")) + '</button></div></article>';
      }).join('') : ("<p class=\"muted\">" + esc(eventKey ? QSL.t("暂无赛事动态，点击「新建赛事动态」开始。") : QSL.t("暂无公告，点击「新建公告」开始。")) + "</p>");
      list.onclick = async function (event) {
        const btn = event.target.closest('[data-ann-edit], [data-ann-toggle]');
        if (!btn || btn.disabled || !live()) return;
        const item = res.items.find(function (row) { return row.id === (btn.dataset.annEdit || btn.dataset.annToggle); });
        if (!item) return;
        if (btn.dataset.annEdit) { editAnnouncement(root, item, eventKey); return; }
        if (item.status === 'published') {
          const ok = await QSL.confirm({
            title: eventKey ? QSL.t("撤下赛事动态") : QSL.t("撤下公告"),
            message: eventKey ? QSL.t("确定撤下这条赛事动态吗？可稍后重新发布。") : QSL.t("确定撤下公告「") + item.title + QSL.t("」吗？撤下后首页不再显示，可稍后重新发布。"),
            confirmText: QSL.t("撤下"),
            cancelText: QSL.t("取消"),
            danger: true
          });
          if (!ok || S !== owner || !isLive(root, tab)) return;
        }
        animateBusy(btn, true);
        try {
          await QSL.api.put('/api/admin/announcements/' + encodeURIComponent(item.id), { status: item.status === 'published' ? 'draft' : 'published' });
          if (S === owner && isLive(root, tab)) { toast(eventKey ? QSL.t("赛事动态状态已更新") : QSL.t("公告状态已更新")); redrawTab(); }
        } catch (err) {
          if (S === owner && isLive(root, tab)) { toastError(err); animateBusy(btn, false); }
        }
      };
      renderPager(root.querySelector('[data-ann-pager]'), res, function (next) {
        if (!live()) return;
        if (eventKey) owner.contest.announcementPage = next;
        else owner.announcementPage = next;
        redrawTab();
      });
    }).catch(function (err) {
      if (live()) renderLoadError(root.querySelector('[data-ann-list]'), err, redrawTab);
    });
  }

  function closeContestModal() {
    if (!S) return;
    S.contest.detailJob++;
    if (!S.contestModal) return;
    const modal = S.contestModal;
    const overlay = modal.el.closest('.modal-overlay');
    modal.close();
    if (overlay) overlay.remove();
    S.contestModal = null;
  }

  function drawContest(panel) {
    const owner = S;
    const state = owner.contest;
    const root = tabRoot(panel,
      '<section class="a-contest-section"><div class="toolbar a-toolbar"><h2>' + esc(QSL.t("报名审核")) +
      '</h2><span class="a-toolbar-spacer"></span><label class="a-filter">' + esc(QSL.t("报名状态")) +
      '<select class="select a-select" data-contest-status>' + CARD_STATUS_TABS.map(function (item) {
        return '<option value="' + item.key + '"' + (item.key === state.status ? ' selected' : '') + '>' + esc(item.label) + '</option>';
      }).join('') + '</select></label></div><p class="muted">' + esc(QSL.t("比赛审核与广场卡片审核独立；作品变更后需重新审核。")) +
      '</p><div class="a-cardlist" data-contest-list></div><div class="pagination a-pager" data-contest-pager></div></section>' +
      '<section class="a-contest-section" data-contest-announcements></section>');
    const job = ++owner.jobs.contest;
    const live = function () { return S === owner && aliveRoot(root, 'contest', job); };
    root.querySelector('[data-contest-status]').addEventListener('change', function (event) {
      if (!live()) return;
      state.status = event.target.value;
      state.page = 1;
      redrawTab();
    });
    const list = root.querySelector('[data-contest-list]');
    QSL.loading(list);
    QSL.api.get(CONTEST_API + '?status=' + encodeURIComponent(state.status) + '&page=' + state.page + '&limit=8').then(function (res) {
      if (!live()) return;
      list.innerHTML = res.items.length ? res.items.map(function (entry) {
        const entryCards = entry.cards || [];
        return '<article class="a-cardrow"><div class="a-cardrow-thumbs">' + (entryCards.length ? entryCards.map(function (card) { return thumbPair(card); }).join('') : '<p class="muted">' + esc(QSL.t("关联卡片已删除，请等待参赛者重新选卡。")) + '</p>') +
          '</div><div class="a-cardrow-main"><div class="a-cardrow-head"><h3 class="a-cardrow-title">' + esc(entryCards.length ? entryCards.map(function (card) { return card.title; }).join('、') : QSL.t("未关联卡片")) +
          '</h3>' + statusBadge(entry.status) + '</div>' + userInline(entry.user) + '<p class="a-contest-excerpt">' + esc(entry.description) +
          '</p><span class="a-time">' + esc(fmtDateTime(entry.updatedAt)) + '</span></div><div class="a-cardrow-actions"><button class="a-act a-act--wide" type="button" data-contest-detail="' +
          escAttr(entry.id) + '">' + ico('eye', 16) + esc(QSL.t("查看报名 / 审核")) + '</button></div></article>';
      }).join('') : '<p class="a-inline-empty">' + esc(QSL.t("暂无符合条件的报名。")) + '</p>';
      list.onclick = function (event) {
        const btn = event.target.closest('[data-contest-detail]');
        if (!btn || btn.disabled || !live()) return;
        openContestEntry(root, btn.dataset.contestDetail);
      };
      renderPager(root.querySelector('[data-contest-pager]'), res, function (page) {
        if (!live()) return;
        state.page = page;
        redrawTab();
      });
    }).catch(function (err) {
      if (live()) renderLoadError(list, err, redrawTab);
    });
    drawAnnouncements(panel, CONTEST_KEY, root.querySelector('[data-contest-announcements]'));
  }

  function openContestEntry(root, id) {
    closeAnnouncementModal();
    closeContestModal();
    const owner = S;
    const job = ++owner.contest.detailJob;
    let closed = false;
    let busy = false;
    let stale = false;
    const live = function () {
      return !closed && S === owner && isLive(root, 'contest') && owner.contest.detailJob === job;
    };
    const modal = QSL.modal({
      title: QSL.t("比赛报名详情"),
      size: 'lg',
      content: '<div data-contest-detail-body></div>',
      onClose: function () {
        closed = true;
        const overlay = modal.el.closest('.modal-overlay');
        if (overlay) document.removeEventListener('keydown', overlay._onKey);
        if (owner.contestModal === modal) owner.contestModal = null;
      }
    });
    owner.contestModal = modal;
    const body = modal.body.querySelector('[data-contest-detail-body]');
    QSL.loading(body);
    QSL.api.get(CONTEST_API + '/' + encodeURIComponent(id)).then(function (res) {
      if (!live()) return;
      const entry = res.entry;
      const cards = entry.cards || [];
      const canApprove = cards.length > 0 && cards.every(function (item) { return item.status === 'approved'; });
      body.innerHTML = '<div class="a-contest-detail">' + (cards.length ? cards.map(function (card) {
        return '<h3>' + esc(card.title) + '</h3><div class="a-contest-artwork">' + thumbPair(card, { sizes: '(max-width: 620px) 90vw, 380px' }) + '</div><div>' +
          esc(QSL.t("广场审核状态")) + ' ' + statusBadge(card.status) + '</div>';
      }).join('') : '<p class="a-reject-note">' + esc(QSL.t("关联卡片已删除，请等待参赛者重新选卡。")) + '</p>') +
        '<div class="a-cardrow-meta">' + userInline(entry.user) + statusBadge(entry.status) + '<span class="a-time">' + esc(fmtDateTime(entry.updatedAt)) + '</span></div>' +
        '<div class="a-info-block"><h4>' + esc(QSL.t("作品说明")) + '</h4><p class="a-quote a-contest-text">' + esc(entry.description) + '</p></div>' +
        '<div class="a-info-block"><h4>' + esc(QSL.t("联系邮箱")) + '</h4><p class="a-contest-text">' + esc(entry.contactEmail) + '</p><small class="muted">' + esc(QSL.t("仅参赛者本人及管理员可见，不修改账号邮箱。")) + '</small></div>' +
        (entry.reviewReason ? '<div class="a-info-block"><h4>' + esc(QSL.t("审核原因")) + '</h4><p class="a-quote a-contest-text">' + esc(entry.reviewReason) + '</p></div>' : '') +
        '<form class="a-announcement-form" novalidate><label>' + esc(QSL.t("审核原因（驳回必填）")) + '<textarea class="textarea" name="reviewReason" maxlength="200"></textarea></label>' +
        (!canApprove ? '<p class="a-hint-error">' + esc(QSL.t("关联卡片未通过广场审核，不能批准报名。")) + '</p>' : '') +
        '<p class="a-hint-error" data-error role="alert"></p><div class="a-announcement-actions"><button class="btn btn-primary" type="submit" value="approved"' + (!canApprove ? ' disabled' : '') + '>' +
        esc(QSL.t("通过报名")) + '</button><button class="btn btn-danger" type="submit" value="rejected">' + esc(QSL.t("驳回报名")) +
        '</button><button class="btn btn-ghost" type="button" data-contest-reload>' + esc(QSL.t("刷新详情")) + '</button></div></form></div>';
      body.querySelector('[data-contest-reload]').addEventListener('click', function () {
        if (live() && !busy) openContestEntry(root, id);
      });
      const form = body.querySelector('form');
      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (busy || stale || !live() || !event.submitter) return;
        const status = event.submitter.value;
        if (status !== 'approved' && status !== 'rejected') return;
        const reason = form.elements.reviewReason.value.trim();
        const error = form.querySelector('[data-error]');
        error.textContent = '';
        if (status === 'rejected' && !reason) {
          error.textContent = QSL.t("请填写驳回原因。");
          form.elements.reviewReason.focus();
          return;
        }
        busy = true;
        const buttons = form.querySelectorAll('button');
        buttons.forEach(function (btn) { btn.disabled = true; });
        animateBusy(event.submitter, true);
        try {
          await QSL.api.put(CONTEST_API + '/' + encodeURIComponent(id) + '/review', {
            status: status, reviewReason: reason, expectedRevision: entry.revision
          });
          if (!live()) return;
          modal.close();
          toast(QSL.t("报名审核已更新"));
          redrawTab();
        } catch (err) {
          if (!live()) return;
          stale = err.status === 409;
          error.textContent = stale ? QSL.t("报名已更新，请刷新详情后重新审核。") : (err.message || QSL.t("操作失败，请稍后重试"));
          if (err.fields) QSL.showFieldErrors(form, err.fields);
        } finally {
          busy = false;
          if (live()) {
            animateBusy(event.submitter, false);
            buttons.forEach(function (btn) { btn.disabled = stale && btn.type === 'submit'; });
            form.querySelector('[value="approved"]').disabled = stale || !canApprove;
          }
        }
      });
    }).catch(function (err) {
      if (live()) renderLoadError(body, err, function () { if (live()) openContestEntry(root, id); });
    });
  }

  function updateTabBadges() {
    if (!S) return;
    const stats = S.stats || {};
    const cards = stats.cards || {};
    const exchanges = stats.exchanges || {};
    document.querySelectorAll('[data-tab-badge]').forEach(function (el) {
      const key = el.getAttribute('data-tab-badge');
      const raw = key === 'cards' ? cards.pending : key === 'exchanges' ? exchanges.pending : 0;
      const n = Number(raw) || 0;
      if (n > 0) {
        el.textContent = n > 99 ? '99+' : String(n);
        el.hidden = false;
      } else {
        el.textContent = '';
        el.hidden = true;
      }
    });
    document.querySelectorAll('[data-count-key]').forEach(function (el) {
      const keys = String(el.getAttribute('data-count-key') || '').split('.');
      let value = S.stats;
      for (let i = 0; i < keys.length; i++) value = value == null ? null : value[keys[i]];
      const n = Number(value) || 0;
      if (n > 0) { el.textContent = String(n); el.hidden = false; }
      else { el.textContent = ''; el.hidden = true; }
    });
  }

  function refreshStatsQuiet() {
    if (!S || S.disposed) return;
    const job = ++S.jobs.stats;
    QSL.api.admin.stats().then(function (stats) {
      if (!S || S.disposed || S.jobs.stats !== job) return;
      S.stats = stats;
      updateTabBadges();
    }).catch(function () { /* 后台统计失败不打扰用户 */ });
  }

  /* ============================================================
   * 概览 Overview
   * ============================================================ */
  function drawOverview(panel) {
    const root = tabRoot(panel, overviewSkeletonHtml());
    bindOverview(root);
    loadOverview(root);
  }

  function overviewSkeletonHtml() {
    let stats = '';
    for (let i = 0; i < 7; i++) {
      stats += '<div class="stat-card a-stat a-stat-skel">' +
        '<div class="skeleton skeleton-line" style="width:52%"></div>' +
        '<div class="skeleton" style="height:30px;width:38%;margin-top:14px"></div>' +
        '<div class="skeleton skeleton-line" style="width:66%;margin-top:12px"></div></div>';
    }
    return (
      '<div class="stats-grid a-stats">' + stats + '</div>' +
      '<section class="a-block glass"><div class="a-skel-head"><div class="skeleton skeleton-line" style="width:180px"></div>' +
      '<div class="skeleton skeleton-line" style="width:70px"></div></div><div class="a-pending-row">' +
      [0, 1].map(function () {
        return '<div class="a-pending a-pending--skel"><div class="skeleton" style="height:118px;border-radius:14px"></div>' +
          '<div class="skeleton skeleton-line" style="width:70%;margin-top:14px"></div>' +
          '<div class="skeleton skeleton-line" style="width:48%;margin-top:9px"></div></div>';
      }).join('') + '</div></section>' +
      '<div class="a-split">' + [0, 1].map(function () {
        return '<section class="a-block glass"><div class="a-skel-head"><div class="skeleton skeleton-line" style="width:150px"></div></div>' +
          QSL.skeletonRows(4) + '</section>';
      }).join('') + '</div>'
    );
  }

  async function loadOverview(root) {
    const job = ++S.jobs.overview;
    try {
      const stats = await QSL.api.admin.stats();
      if (!aliveRoot(root, 'overview', job)) return;
      S.stats = stats;
      S.stats.pendingCards = Array.isArray(stats.pendingCards) ? stats.pendingCards : [];
      root.innerHTML = overviewHtml(stats);
      enhanceScope(root);
      updateTabBadges();
    } catch (err) {
      if (!aliveRoot(root, 'overview', job)) return;
      root.innerHTML = '';
      renderLoadError(root, err, function () {
        if (!isLive(root, 'overview')) return;
        root.innerHTML = overviewSkeletonHtml();
        loadOverview(root);
      });
      toastError(err);
    }
  }

  function overviewHtml(stats) {
    const pending = Array.isArray(stats.pendingCards) ? stats.pendingCards : [];
    const pendingTotal = (stats.cards && stats.cards.pending) || pending.length;
    return (
      '<div class="a-overview">' +
      statsGridHtml(stats) +
      pendingSectionHtml(pending, pendingTotal) +
      '<div class="a-split">' + recentUsersBlock(stats) + recentExchangesBlock(stats) + '</div>' +
      '</div>'
    );
  }

  function statCardHtml(item) {
    const value = Number(item.value) || 0;
    return (
      '<article class="stat-card a-stat a-tone-' + item.tone + (item.hero ? ' a-stat--hero' : '') + '">' +
      '<div class="stat-label"><span class="stat-icon">' + ico(item.icon, 18) + '</span><span>' + esc(item.label) + '</span></div>' +
      '<div class="stat-value" data-count="' + value + '">' + esc(String(value)) + '</div>' +
      '<div class="stat-foot">' + esc(item.foot || '') + '</div>' +
      '</article>'
    );
  }

  function statsGridHtml(stats) {
    const users = stats.users || {};
    const cards = stats.cards || {};
    const exchanges = stats.exchanges || {};
    const total = Number(users.total) || 0;
    const active = Number(users.active) || 0;
    const activeRate = total > 0 ? Math.round((active / total) * 100) : 0;
    const items = [
      {
        label: QSL.t("用户总数"), value: total, icon: 'users', tone: 'mint', hero: true,
        foot: (QSL.t("活跃") + " ") + active + (" " + QSL.t("· 禁用") + " ") + (Number(users.banned) || 0) + (" " + QSL.t("· 本周新增") + " ") + (Number(users.newThisWeek) || 0)
      },
      { label: QSL.t("活跃用户"), value: active, icon: 'radio', tone: 'sky', foot: (QSL.t("活跃率") + " ") + activeRate + QSL.t("% · 正常账号") },
      { label: QSL.t("卡片总数"), value: Number(cards.total) || 0, icon: 'cards', tone: 'violet', foot: (QSL.t("已通过") + " ") + (Number(cards.approved) || 0) + (" " + QSL.t("· 待审核") + " ") + (Number(cards.pending) || 0) },
      { label: QSL.t("待审核卡片"), value: Number(cards.pending) || 0, icon: 'clock', tone: 'amber', foot: QSL.t("需要管理员处理的卡片") },
      { label: QSL.t("待处理换卡"), value: Number(exchanges.pending) || 0, icon: 'send', tone: 'rose', foot: (QSL.t("累计") + " ") + (Number(exchanges.total) || 0) + (" " + QSL.t("条换卡申请")) },
      { label: QSL.t("点赞总数"), value: Number(stats.likes) || 0, icon: 'heart', tone: 'rose', foot: QSL.t("来自广场访客的喜欢") },
      { label: QSL.t("本周新增用户"), value: Number(users.newThisWeek) || 0, icon: 'sparkles', tone: 'mint', foot: QSL.t("最近 7 天注册的爱好者") }
    ];
    return '<div class="stats-grid a-stats">' + items.map(statCardHtml).join('') + '</div>';
  }

  function allClearHtml() {
    return (
      '<div class="a-all-clear">' +
      '<span class="a-all-clear-ico">' + ico('check-circle', 26) + '</span>' +
      ("<div><b>" + QSL.escapeHtml(QSL.t("审核队列已清空")) + "</b><p class=\"muted\">" + QSL.escapeHtml(QSL.t("当前没有待审核的卡片，新的上传会出现在这里。")) + "</p></div>") +
      '</div>'
    );
  }

  function pendingCardHtml(card) {
    const id = card.id || '';
    const title = card.title || QSL.t("未命名卡片");
    return (
      '<article class="a-pending" data-card-id="' + escAttr(id) + '">' +
      '<div class="a-pending-thumbs">' + thumbPair(card) +
      '<span class="a-ratio-chip">' + esc(ratioLabel(card.ratio)) + '</span></div>' +
      '<div class="a-pending-body">' +
      '<h3 class="a-pending-title" title="' + escAttr(title) + '">' + esc(title) + '</h3>' +
      '<div class="a-pending-owner">' + QSL.ownerLine(card.owner) + '</div>' +
      '<div class="a-pending-meta">' +
      '<span class="a-meta-item">' + ico('clock', 14) + (QSL.t("提交于") + " ") + esc(timeAgo(card.createdAt)) + '</span>' +
      (card.callSign ? badge(card.callSign, 'slate') : '') +
      '</div>' +
      '<div class="a-pending-actions">' +
      '<button class="btn btn-primary btn-sm" type="button" data-act="approve-card" data-id="' + escAttr(id) + '">' +
      ico('check', 15) + (QSL.escapeHtml(QSL.t("通过")) + "</button>") +
      '<button class="a-act a-act--danger" type="button" data-act="reject-card" data-id="' + escAttr(id) + '">' +
      ico('x', 15) + (QSL.escapeHtml(QSL.t("拒绝")) + "</button>") +
      '</div></div></article>'
    );
  }

  function pendingSectionHtml(cards, total) {
    const list = Array.isArray(cards) ? cards : [];
    const pendingTotal = Number(total) || list.length;
    const desc = pendingTotal > 0
      ? (QSL.escapeHtml(QSL.t("共")) + " <b data-role=\"pending-count\">") + pendingTotal + ("</b> " + QSL.escapeHtml(QSL.t("张卡片等待审核 · 通过后将立即出现在卡片广场")))
      : QSL.t("当前没有等待审核的卡片");
    return (
      '<section class="a-block glass">' +
      '<div class="section-head a-block-head"><div>' +
      ("<h2 class=\"section-title\">" + QSL.escapeHtml(QSL.t("待审核卡片")) + "</h2>") +
      '<p class="section-desc">' + desc + '</p></div>' +
      ("<button class=\"section-link\" type=\"button\" data-goto=\"cards\" data-goto-status=\"pending\">" + QSL.escapeHtml(QSL.t("查看全部"))) + ico('arrow-right', 16) + '</button>' +
      '</div>' +
      (list.length
        ? '<div class="a-pending-row" data-role="pending-row">' + list.map(pendingCardHtml).join('') + '</div>'
        : allClearHtml()) +
      '</section>'
    );
  }

  function recentUsersBlock(stats) {
    const users = Array.isArray(stats.recentUsers) ? stats.recentUsers.slice(0, 5) : [];
    let body;
    if (!users.length) {
      body = '<div class="a-inline-empty">' + ico('users', 20) + ("<span>" + QSL.escapeHtml(QSL.t("最近还没有新用户注册")) + "</span></div>");
    } else {
      body = '<ul class="a-list">' + users.map(function (u) {
        const name = u.displayName || u.username || QSL.t("未知用户");
        return (
          '<li class="a-list-row">' +
          '<span class="a-list-user">' + QSL.avatar(u, 34) +
          '<span class="a-list-main"><b>' + esc(name) + '</b>' +
          '<small>@' + esc(u.username || '') + (u.callSign ? ' · ' + esc(u.callSign) : '') + '</small></span></span>' +
          '<span class="a-list-side">' + (u.role === 'admin' ? roleBadge('admin') : '') +
          '<time>' + esc(timeAgo(u.joinedAt)) + '</time></span></li>'
        );
      }).join('') + '</ul>';
    }
    return blockHtml(QSL.t("最近注册用户"), QSL.t("刚刚加入 QSLink 的业余无线电爱好者"), 'users', '', body);
  }

  function recentExchangesBlock(stats) {
    const items = Array.isArray(stats.recentExchanges) ? stats.recentExchanges.slice(0, 5) : [];
    let body;
    if (!items.length) {
      body = '<div class="a-inline-empty">' + ico('send', 20) + ("<span>" + QSL.escapeHtml(QSL.t("最近还没有换卡申请")) + "</span></div>");
    } else {
      body = '<ul class="a-list">' + items.map(function (item) {
        const card = item.card || {};
        const from = item.fromUser || {};
        const to = item.toUser || {};
        return (
          '<li class="a-list-row a-list-row--exch">' + miniThumb(card.frontImage, card.title) +
          '<span class="a-list-main"><b>' + esc(card.title || QSL.t("卡片已删除")) + '</b>' +
          '<small>' + esc(from.displayName || from.username || QSL.t("未知")) + ' → ' +
          esc(to.displayName || to.username || QSL.t("未知")) + ' · ' + esc(timeAgo(item.createdAt)) + '</small></span>' +
          '<span class="a-list-side">' + exchangeBadge(item.status) + '</span></li>'
        );
      }).join('') + '</ul>';
    }
    return blockHtml(QSL.t("最近换卡申请"), QSL.t("最新发生的 QSL 卡片交换动态"), 'exchanges', '', body);
  }

  function blockHtml(title, desc, gotoTab, gotoStatus, body) {
    return (
      '<section class="a-block glass">' +
      '<div class="section-head a-block-head"><div>' +
      '<h2 class="section-title">' + esc(title) + '</h2>' +
      '<p class="section-desc">' + esc(desc) + '</p></div>' +
      '<button class="section-link" type="button" data-goto="' + escAttr(gotoTab) + '"' +
      (gotoStatus ? ' data-goto-status="' + escAttr(gotoStatus) + '"' : '') + (">" + QSL.escapeHtml(QSL.t("查看全部"))) + ico('arrow-right', 16) + '</button>' +
      '</div>' + body + '</section>'
    );
  }

  function findPendingCard(id) {
    if (!S || !S.stats) return null;
    const list = Array.isArray(S.stats.pendingCards) ? S.stats.pendingCards : [];
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function bindOverview(root) {
    root.addEventListener('click', async function (ev) {
      const gotoBtn = ev.target.closest('[data-goto]');
      if (gotoBtn) {
        const tab = gotoBtn.getAttribute('data-goto');
        const gstatus = gotoBtn.getAttribute('data-goto-status');
        if (tab === 'cards' && gstatus) S.cards.status = gstatus;
        if (tab === 'exchanges' && gstatus) S.exchanges.status = gstatus;
        switchTab(tab, { sync: true });
        return;
      }
      const actor = ev.target.closest('[data-act]');
      if (!actor) return;
      const act = actor.getAttribute('data-act');
      if (act !== 'approve-card' && act !== 'reject-card') return;
      const card = findPendingCard(actor.getAttribute('data-id'));
      if (!card) return;
      await auditPendingCard(root, card, act, actor);
    });
  }

  async function auditPendingCard(root, card, act, btn) {
    if (act === 'approve-card') {
      if (btn.disabled) return;
      animateBusy(btn, true, QSL.t("通过中…"));
      try {
        await QSL.api.admin.updateCard(card.id, { status: 'approved' });
        toast('「' + (card.title || QSL.t("卡片")) + QSL.t("」已通过审核"), 'success');
        celebrate(btn);
        removePendingTile(root, card.id, 'approved');
        refreshStatsQuiet();
      } catch (err) {
        animateBusy(btn, false);
        toastError(err);
      }
      return;
    }
    const reason = await askRejectReason({ title: QSL.t("拒绝卡片"), cardTitle: card.title || QSL.t("未命名卡片"), confirmText: QSL.t("确认拒绝") });
    if (!reason) return;
    if (btn.disabled) return;
    animateBusy(btn, true, QSL.t("拒绝中…"));
    try {
      await QSL.api.admin.updateCard(card.id, { status: 'rejected', rejectReason: reason });
      toast(QSL.t("已拒绝「") + (card.title || QSL.t("卡片")) + '」', 'info');
      removePendingTile(root, card.id, 'rejected');
      refreshStatsQuiet();
    } catch (err) {
      animateBusy(btn, false);
      toastError(err);
    }
  }

  function removePendingTile(root, cardId, newStatus) {
    if (!root || !root.isConnected) return;
    if (S && S.stats && S.stats.cards) {
      const cards = S.stats.cards;
      cards.pending = Math.max(0, (Number(cards.pending) || 0) - 1);
      if (newStatus === 'approved') cards.approved = (Number(cards.approved) || 0) + 1;
      if (newStatus === 'rejected') cards.rejected = (Number(cards.rejected) || 0) + 1;
    }
    if (S && S.stats && Array.isArray(S.stats.pendingCards)) {
      S.stats.pendingCards = S.stats.pendingCards.filter(function (c) { return c.id !== cardId; });
    }
    const row = root.querySelector('[data-role="pending-row"]');
    let tile = null;
    if (row) {
      Array.prototype.forEach.call(row.querySelectorAll('.a-pending[data-card-id]'), function (el) {
        if (!tile && el.getAttribute('data-card-id') === cardId) tile = el;
      });
    }
    if (tile) {
      tile.classList.add('is-leaving');
      setTimeout(function () {
        if (!tile.isConnected) return;
        tile.remove();
        const countEl = root.querySelector('[data-role="pending-count"]');
        if (countEl) {
          const current = parseInt(countEl.textContent, 10);
          countEl.textContent = String(Math.max(0, (isFinite(current) ? current : 1) - 1));
        }
        if (row && row.isConnected && !row.querySelector('.a-pending')) row.outerHTML = allClearHtml();
      }, 260);
    }
    if (S && S.stats) {
      const grid = root.querySelector('.a-stats');
      if (grid) {
        const holder = document.createElement('div');
        holder.innerHTML = statsGridHtml(S.stats);
        const nextGrid = holder.firstElementChild;
        grid.replaceWith(nextGrid);
        enhanceScope(nextGrid);
      }
    }
  }

  /* ============================================================
   * 拒绝原因弹窗（卡片 / 通用）
   * ============================================================ */
  function askRejectReason(options) {
    const opts = options || {};
    return new Promise(function (resolve) {
      let settled = false;
      const finish = function (val) {
        if (settled) return;
        settled = true;
        resolve(val);
      };
      const content =
        '<div class="modal-form a-reason-form">' +
        '<p class="modal-text">' + (opts.cardTitle
          ? (QSL.escapeHtml(QSL.t("即将拒绝卡片「")) + "<b>") + esc(opts.cardTitle) + ("</b>" + QSL.escapeHtml(QSL.t("」，请填写原因，卡片作者会看到这段说明。")))
          : QSL.t("请填写拒绝原因，申请人会看到这段说明。")) + '</p>' +
        ("<div class=\"field\"><span class=\"label\">" + QSL.escapeHtml(QSL.t("拒绝原因")) + "<i class=\"req\">*</i></span>") +
        '<textarea class="textarea" name="rejectReason" rows="3" maxlength="200" ' +
        ("placeholder=\"" + QSL.escapeHtml(QSL.t("例如：正反面图片不够清晰，或呼号信息与卡片不一致。")) + "\"></textarea>") +
        ("<span class=\"hint\" data-role=\"reason-hint\">" + QSL.escapeHtml(QSL.t("至少 2 个字，请尽量说明具体原因。")) + "</span></div>") +
        '</div>';
      QSL.modal({
        title: opts.title || QSL.t("填写拒绝原因"),
        size: 'sm',
        content: content,
        onClose: function () { finish(null); },
        actions: [
          { label: QSL.t("取消"), type: 'ghost', onClick: function () { finish(null); } },
          {
            label: opts.confirmText || QSL.t("确认拒绝"),
            type: 'danger',
            closeOnClick: false,
            onClick: function (inst) {
              const ta = inst.body.querySelector('textarea[name="rejectReason"]');
              const hint = inst.body.querySelector('[data-role="reason-hint"]');
              const value = ta ? ta.value.trim() : '';
              if (value.length < 2) {
                if (ta) { ta.classList.add('is-invalid'); ta.focus(); }
                if (hint) { hint.textContent = QSL.t("拒绝原因至少需要 2 个字"); hint.classList.add('a-hint-error'); }
                return false;
              }
              finish(value);
              inst.close();
              return false;
            }
          }
        ]
      });
    });
  }

  /* ============================================================
   * 用户管理 Users
   * ============================================================ */
  function drawUsers(panel) {
    const root = tabRoot(panel, usersShellHtml());
    bindUsers(root);
    loadUsers(root, 1);
  }

  function usersShellHtml() {
    const statusOptions = [
      { key: '', label: QSL.t("全部状态") },
      { key: 'active', label: QSL.t("正常") },
      { key: 'banned', label: QSL.t("已禁用") }
    ];
    const roleOptions = [
      { key: '', label: QSL.t("全部角色") },
      { key: 'user', label: QSL.t("普通用户") },
      { key: 'admin', label: QSL.t("管理员") }
    ];
    return (
      '<div class="toolbar a-toolbar">' +
      '<div class="search-box a-search">' + ico('search', 18) +
      ("<input class=\"input\" type=\"search\" data-role=\"users-q\" aria-label=\"" + QSL.escapeHtml(QSL.t("搜索用户")) + "\" ") +
      ("placeholder=\"" + QSL.t("搜索用户名 / 显示名 / 呼号 / 邮箱") + "\" value=\"") + escAttr(S.users.q) + '"></div>' +
      ("<label class=\"a-filter\"><span>" + QSL.escapeHtml(QSL.t("状态")) + "</span><select class=\"select a-select\" data-role=\"users-status\" aria-label=\"" + QSL.escapeHtml(QSL.t("按状态筛选")) + "\">") +
      statusOptions.map(function (o) {
        return '<option value="' + escAttr(o.key) + '"' + (S.users.status === o.key ? ' selected' : '') + '>' + esc(o.label) + '</option>';
      }).join('') + '</select></label>' +
      ("<label class=\"a-filter\"><span>" + QSL.escapeHtml(QSL.t("角色")) + "</span><select class=\"select a-select\" data-role=\"users-role\" aria-label=\"" + QSL.escapeHtml(QSL.t("按角色筛选")) + "\">") +
      roleOptions.map(function (o) {
        return '<option value="' + escAttr(o.key) + '"' + (S.users.role === o.key ? ' selected' : '') + '>' + esc(o.label) + '</option>';
      }).join('') + '</select></label>' +
      '<span class="a-toolbar-spacer"></span>' +
      '<span class="a-toolbar-count" data-role="users-count">—</span>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-act="users-refresh">' + ico('refresh', 16) + (QSL.escapeHtml(QSL.t("刷新")) + "</button>") +
      '</div>' +
      '<section class="a-table-shell glass">' +
      '<p class="a-scroll-hint">' + ico('arrow-right', 14) + ("<span>" + QSL.escapeHtml(QSL.t("左右滑动查看完整表格")) + "</span></p>") +
      '<div class="table-wrap a-table-wrap" data-role="users-area">' + QSL.skeletonTable(6, 6) + '</div>' +
      '<div class="pagination a-pager" data-role="users-pager"></div>' +
      '</section>'
    );
  }

  function bindUsers(root) {
    let timer = null;
    root.addEventListener('input', function (ev) {
      const input = ev.target.closest('[data-role="users-q"]');
      if (!input) return;
      const value = input.value;
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (!isLive(root, 'users')) return;
        S.users.q = value.trim();
        loadUsers(root, 1);
      }, 300);
    });
    root.addEventListener('change', function (ev) {
      const statusSel = ev.target.closest('[data-role="users-status"]');
      if (statusSel) {
        S.users.status = statusSel.value;
        loadUsers(root, 1);
        return;
      }
      const roleSel = ev.target.closest('[data-role="users-role"]');
      if (roleSel) {
        S.users.role = roleSel.value;
        loadUsers(root, 1);
      }
    });
    root.addEventListener('click', function (ev) {
      const pageBtn = ev.target.closest('.a-pager [data-page]');
      if (pageBtn) {
        loadUsers(root, parseInt(pageBtn.getAttribute('data-page'), 10));
        return;
      }
      const actor = ev.target.closest('[data-act]');
      if (!actor) return;
      const act = actor.getAttribute('data-act');
      if (act === 'users-refresh') { loadUsers(root, S.users.page); return; }
      const user = S.users.map[actor.getAttribute('data-id') || ''];
      if (!user) return;
      if (act === 'user-edit') openUserEditor(user);
      else if (act === 'user-toggle') toggleUserBan(user, actor);
      else if (act === 'user-delete') deleteUser(user);
    });
  }

  async function loadUsers(root, page) {
    const job = ++S.jobs.users;
    S.users.page = Math.max(1, parseInt(page, 10) || 1);
    const area = root.querySelector('[data-role="users-area"]');
    const pager = root.querySelector('[data-role="users-pager"]');
    if (!area) return;
    area.innerHTML = QSL.skeletonTable(6, 6);
    if (pager) pager.innerHTML = '';
    try {
      const res = await QSL.api.admin.users({
        q: S.users.q,
        status: S.users.status,
        role: S.users.role,
        page: S.users.page,
        limit: LIMITS.users
      });
      if (!aliveRoot(root, 'users', job)) return;
      const pages = res && res.pages ? res.pages : 1;
      if (S.users.page > pages) return loadUsers(root, pages);
      S.users.data = res;
      S.users.map = Object.create(null);
      (res.items || []).forEach(function (u) { S.users.map[u.id] = u; });
      paintUsers(root, res);
    } catch (err) {
      if (!aliveRoot(root, 'users', job)) return;
      renderLoadError(area, err, function () { loadUsers(root, S.users.page); });
      if (pager) pager.innerHTML = '';
      toastError(err);
    }
  }

  function paintUsers(root, res) {
    const items = Array.isArray(res.items) ? res.items : [];
    const area = root.querySelector('[data-role="users-area"]');
    const pager = root.querySelector('[data-role="users-pager"]');
    const countEl = root.querySelector('[data-role="users-count"]');
    if (countEl) countEl.textContent = (QSL.t("共") + " ") + (res.total != null ? res.total : items.length) + (" " + QSL.t("位用户"));
    if (!items.length) {
      const filtered = !!(S.users.q || S.users.status || S.users.role);
      emptyInto(area, {
        icon: filtered ? 'search' : 'users',
        title: filtered ? QSL.t("没有找到匹配的用户") : QSL.t("还没有注册用户"),
        desc: filtered ? QSL.t("试试更换搜索关键词，或调整状态 / 角色筛选。") : QSL.t("平台暂时还没有注册用户。"),
        actionLabel: filtered ? QSL.t("清空筛选条件") : '',
        onAction: filtered ? function () {
          S.users.q = '';
          S.users.status = '';
          S.users.role = '';
          redrawTab();
        } : undefined
      });
      if (pager) pager.innerHTML = '';
      return;
    }
    area.innerHTML =
      '<table class="table a-table a-users-table"><thead><tr>' +
      ("<th>" + QSL.escapeHtml(QSL.t("用户")) + "</th><th>" + QSL.escapeHtml(QSL.t("邮箱")) + "</th><th>" + QSL.escapeHtml(QSL.t("呼号")) + "</th><th>" + QSL.escapeHtml(QSL.t("角色")) + "</th><th>" + QSL.escapeHtml(QSL.t("状态")) + "</th><th class=\"a-col-num\">" + QSL.escapeHtml(QSL.t("卡片数")) + "</th><th>" + QSL.escapeHtml(QSL.t("注册时间")) + "</th><th class=\"a-col-actions\">" + QSL.escapeHtml(QSL.t("操作")) + "</th>") +
      '</tr></thead><tbody>' + items.map(userRowHtml).join('') + '</tbody></table>';
    renderPager(pager, res, function (target) { loadUsers(root, target); });
    enhanceScope(area);
  }

  function userRowHtml(u) {
    const isSelf = !!(S.me && u.id === S.me.id);
    const banned = u.status === 'banned';
    const cardCount = u.cardCount != null ? u.cardCount : ((u.stats && u.stats.cards) || 0);
    const name = u.displayName || u.username || '';
    const toggleAttr = isSelf
      ? (" disabled title=\"" + QSL.t("不能操作自己的账号") + "\"")
      : ' data-act="user-toggle" data-id="' + escAttr(u.id) + '" title="' + (banned ? QSL.t("启用用户") : QSL.t("禁用用户")) + '"';
    const deleteAttr = isSelf
      ? (" disabled title=\"" + QSL.t("不能删除自己") + "\"")
      : ' data-act="user-delete" data-id="' + escAttr(u.id) + ("\" title=\"" + QSL.t("删除用户") + "\"");
    return (
      '<tr data-user-id="' + escAttr(u.id) + '">' +
      '<td>' + userCell(u, isSelf) + '</td>' +
      '<td><span class="a-cell-muted a-ellipsis">' + esc(u.email || '—') + '</span></td>' +
      '<td>' + callCell(u.callSign) + '</td>' +
      '<td>' + roleBadge(u.role) + '</td>' +
      '<td>' + accountBadge(u.status) + '</td>' +
      '<td class="a-col-num">' + esc(String(cardCount)) + '</td>' +
      '<td><span class="a-time" title="' + escAttr(fmtDateTime(u.createdAt || u.joinedAt)) + '">' + esc(fmtDate(u.createdAt || u.joinedAt)) + '</span></td>' +
      '<td class="a-col-actions"><div class="a-row-actions">' +
      '<button class="a-icon-btn" type="button" data-act="user-edit" data-id="' + escAttr(u.id) + ("\" title=\"" + QSL.t("编辑用户") + "\" aria-label=\"" + QSL.t("编辑用户") + " ") + escAttr(name) + '">' + ico('edit', 16) + '</button>' +
      '<button class="a-icon-btn' + (banned ? '' : ' a-icon-btn--warn') + '" type="button"' + toggleAttr + ' aria-label="' + (banned ? QSL.t("启用用户") : QSL.t("禁用用户")) + ' ' + escAttr(name) + '">' + ico(banned ? 'check' : 'lock', 16) + '</button>' +
      '<button class="a-icon-btn a-icon-btn--danger" type="button"' + deleteAttr + (" aria-label=\"" + QSL.t("删除用户") + " ") + escAttr(name) + '">' + ico('trash', 16) + '</button>' +
      '</div></td></tr>'
    );
  }

  function openUserEditor(user) {
    const me = S.me || {};
    const isSelf = user.id === me.id;
    let currentColor = (user.avatarColor || '#0eaf8f').toLowerCase();
    const palette = [];
    COLOR_LIST.forEach(function (c) { if (palette.indexOf(c.toLowerCase()) < 0) palette.push(c.toLowerCase()); });
    if (palette.indexOf(currentColor) < 0) palette.push(currentColor);

    const previewUser = {
      displayName: user.displayName,
      username: user.username,
      callSign: user.callSign,
      avatarColor: currentColor
    };
    const roleOptions = [{ key: 'user', label: QSL.t("普通用户") }, { key: 'admin', label: QSL.t("管理员") }];
    const statusOptions = [{ key: 'active', label: QSL.t("正常") }, { key: 'banned', label: QSL.t("已禁用") }];

    const content =
      '<form class="modal-form" data-form novalidate>' +
      '<div class="a-avatar-row">' +
      '<span class="a-avatar-preview" data-role="avatar-preview">' + QSL.avatar(previewUser, 54) + '</span>' +
      '<div class="a-avatar-meta"><b>@' + esc(user.username || '') + '</b>' +
      ("<span class=\"muted\">" + QSL.escapeHtml(QSL.t("注册于")) + " ") + esc(fmtDate(user.createdAt || user.joinedAt)) + '</span>' +
      (isSelf ? ("<span class=\"badge badge-sky\">" + QSL.escapeHtml(QSL.t("当前登录账号")) + "</span>") : '') + '</div></div>' +
      '<div class="form-grid">' +
      QSL.field({ label: QSL.t("显示名称"), required: true, input: '<input class="input" name="displayName" type="text" maxlength="30" value="' + escAttr(user.displayName || '') + '" autocomplete="off">' }) +
      QSL.field({ label: QSL.t("呼号"), input: '<input class="input" name="callSign" type="text" maxlength="20" value="' + escAttr(user.callSign || '') + '" autocomplete="off">' }) +
      QSL.field({ label: QSL.t("邮箱"), input: '<input class="input" name="email" type="email" value="' + escAttr(user.email || '') + '" autocomplete="off">' }) +
      QSL.field({ label: QSL.t("角色"), hint: isSelf ? QSL.t("不能修改自己的角色") : QSL.t("管理员可访问管理后台"), input: '<select class="select" name="role"' + (isSelf ? ' disabled' : '') + '>' + roleOptions.map(function (o) {
        return '<option value="' + o.key + '"' + (o.key === (user.role || 'user') ? ' selected' : '') + '>' + o.label + '</option>';
      }).join('') + '</select>' }) +
      QSL.field({ label: QSL.t("状态"), hint: isSelf ? QSL.t("不能修改自己的账号状态") : QSL.t("禁用后该用户将无法登录"), input: '<select class="select" name="status"' + (isSelf ? ' disabled' : '') + '>' + statusOptions.map(function (o) {
        return '<option value="' + o.key + '"' + (o.key === (user.status || 'active') ? ' selected' : '') + '>' + o.label + '</option>';
      }).join('') + '</select>' }) +
      '<div class="span-2">' + QSL.field({ label: QSL.t("个人简介"), input: '<textarea class="textarea" name="bio" rows="3" maxlength="200">' + esc(user.bio || '') + '</textarea>' }) + '</div>' +
      '<div class="span-2">' + QSL.field({
        label: QSL.t("头像颜色"),
        hint: QSL.t("用于生成渐变头像"),
        input: '<div class="avatar-picker" data-role="avatar-picker">' + palette.map(function (c) {
          return '<button class="avatar-swatch' + (c === currentColor ? ' is-active' : '') + '" type="button" data-color="' + escAttr(c) + '" style="background:' + escAttr(c) + ("\" aria-label=\"" + QSL.t("选择颜色") + " ") + escAttr(c) + '" aria-pressed="' + (c === currentColor ? 'true' : 'false') + '"></button>';
        }).join('') + '</div><input type="hidden" name="avatarColor" value="' + escAttr(currentColor) + '">'
      }) + '</div>' +
      '<div class="span-2">' + QSL.field({
        label: QSL.t("重置密码"),
        hint: QSL.t("留空则不修改；至少 8 位，需同时包含字母与数字"),
        input: ("<input class=\"input\" name=\"newPassword\" type=\"password\" autocomplete=\"new-password\" placeholder=\"" + QSL.escapeHtml(QSL.t("不修改请留空")) + "\">")
      }) + '</div>' +
      '</div></form>';

    const modal = QSL.modal({
      title: (QSL.t("编辑用户 ·") + " ") + (user.displayName || user.username || ''),
      size: 'lg',
      content: content,
      actions: [
        { label: QSL.t("取消"), type: 'ghost' },
        {
          label: QSL.t("保存修改"),
          type: 'primary',
          closeOnClick: false,
          onClick: async function () {
            const form = modal.body.querySelector('[data-form]');
            if (!form) return false;
            const data = QSL.formData(form);
            const body = {
              displayName: data.displayName,
              callSign: data.callSign,
              email: data.email,
              bio: data.bio,
              avatarColor: data.avatarColor
            };
            if (!isSelf) {
              body.role = data.role;
              body.status = data.status;
            }
            if (data.newPassword) body.newPassword = data.newPassword;
            const problems = {};
            if (!body.displayName) problems.displayName = QSL.t("请填写显示名称");
            if (data.newPassword) {
              if (data.newPassword.length < 8) problems.newPassword = QSL.t("新密码至少 8 位，且需包含字母与数字");
              else if (!/[A-Za-z]/.test(data.newPassword) || !/[0-9]/.test(data.newPassword)) problems.newPassword = QSL.t("新密码需同时包含字母和数字");
            }
            if (Object.keys(problems).length) {
              QSL.showFieldErrors(form, problems);
              toast(Object.keys(problems).map(function (k) { return problems[k]; })[0], 'error');
              return false;
            }
            try {
              await QSL.api.admin.updateUser(user.id, body);
              toast(QSL.t("用户信息已更新"), 'success');
              refreshStatsQuiet();
              if (isLive(S.root, 'users')) loadUsers(S.root, S.users.page);
              modal.close();
            } catch (err) {
              if (err && err.fields) QSL.showFieldErrors(form, err.fields);
              toastError(err);
            }
            return false;
          }
        }
      ]
    });

    const scope = modal.body;
    const form = scope.querySelector('[data-form]');
    if (form) {
      const nameInput = form.querySelector('[name="displayName"]');
      const refreshPreview = function () {
        const host = scope.querySelector('[data-role="avatar-preview"]');
        if (!host) return;
        host.innerHTML = QSL.avatar({
          displayName: nameInput ? nameInput.value : user.displayName,
          username: user.username,
          callSign: user.callSign,
          avatarColor: currentColor
        }, 54);
      };
      if (nameInput) nameInput.addEventListener('input', refreshPreview);
      const picker = form.querySelector('[data-role="avatar-picker"]');
      const colorInput = form.querySelector('[name="avatarColor"]');
      if (picker) {
        picker.addEventListener('click', function (ev) {
          const swatch = ev.target.closest('[data-color]');
          if (!swatch) return;
          currentColor = swatch.getAttribute('data-color');
          if (colorInput) colorInput.value = currentColor;
          picker.querySelectorAll('[data-color]').forEach(function (el) {
            const on = el === swatch;
            el.classList.toggle('is-active', on);
            el.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
          refreshPreview();
        });
      }
    }
  }

  async function toggleUserBan(user, btn) {
    if (!user || !S) return;
    const me = S.me || {};
    const banned = user.status === 'banned';
    if (!banned && user.id === me.id) {
      toast(QSL.t("不能禁用自己的账号"), 'error');
      return;
    }
    if (!banned) {
      const ok = await QSL.confirm({
        title: QSL.t("禁用用户"),
        message: QSL.t("禁用后「") + (user.displayName || user.username || QSL.t("该用户")) + QSL.t("」将无法登录，其卡片会从卡片广场隐藏。确定继续吗？"),
        confirmText: QSL.t("禁用账号"),
        cancelText: QSL.t("取消"),
        danger: true
      });
      if (!ok) return;
    }
    animateBusy(btn, true, banned ? QSL.t("启用中…") : QSL.t("禁用中…"));
    try {
      await QSL.api.admin.updateUser(user.id, { status: banned ? 'active' : 'banned' });
      toast(banned ? QSL.t("用户已启用") : QSL.t("用户已禁用"), 'success');
      refreshStatsQuiet();
      if (isLive(S.root, 'users')) loadUsers(S.root, S.users.page);
    } catch (err) {
      animateBusy(btn, false);
      toastError(err);
    }
  }

  async function deleteUser(user) {
    if (!user || !S) return;
    const me = S.me || {};
    if (user.id === me.id) {
      toast(QSL.t("不能删除自己的账号"), 'error');
      return;
    }
    const ok = await QSL.confirm({
      title: QSL.t("删除用户"),
      message: QSL.t("确定删除用户「") + (user.displayName || user.username || QSL.t("该用户")) + QSL.t("」吗？该用户的卡片、换卡申请与点赞会被一并删除，操作不可恢复。"),
      confirmText: QSL.t("删除用户"),
      cancelText: QSL.t("取消"),
      danger: true
    });
    if (!ok) return;
    try {
      await QSL.api.admin.deleteUser(user.id);
      toast(QSL.t("用户已删除"), 'success');
      refreshStatsQuiet();
      if (S.users.data && S.users.data.items && S.users.data.items.length === 1 && S.users.page > 1) {
        S.users.page -= 1;
      }
      if (isLive(S.root, 'users')) loadUsers(S.root, S.users.page);
    } catch (err) {
      toastError(err);
    }
  }

  /* ============================================================
   * 卡片审核 Cards
   * ============================================================ */
  function drawCards(panel) {
    const root = tabRoot(panel, cardsShellHtml());
    bindCards(root);
    loadCards(root, 1);
  }

  function cardsShellHtml() {
    return (
      '<div class="toolbar a-toolbar">' +
      ("<div class=\"segmented a-seg\" role=\"tablist\" aria-label=\"" + QSL.escapeHtml(QSL.t("卡片状态筛选")) + "\">") +
      CARD_STATUS_TABS.map(function (t) {
        const on = S.cards.status === t.key;
        const key = t.key === 'all' ? 'cards.total' : 'cards.' + t.key;
        return '<button type="button" role="tab" class="' + (on ? 'is-active' : '') + '" data-card-status="' + t.key + '"' +
          ' aria-selected="' + (on ? 'true' : 'false') + '">' + esc(t.label) +
          '<b class="a-seg-count" data-count-key="' + escAttr(key) + '" hidden></b></button>';
      }).join('') + '</div>' +
      '<div class="search-box a-search">' + ico('search', 18) +
      ("<input class=\"input\" type=\"search\" data-role=\"cards-q\" aria-label=\"" + QSL.escapeHtml(QSL.t("搜索卡片")) + "\" ") +
      ("placeholder=\"" + QSL.t("搜索标题 / 呼号 / 用户名") + "\" value=\"") + escAttr(S.cards.q) + '"></div>' +
      '<span class="a-toolbar-spacer"></span>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-act="cards-refresh">' + ico('refresh', 16) + (QSL.escapeHtml(QSL.t("刷新")) + "</button>") +
      '</div>' +
      '<div class="a-cardlist" data-role="cards-area">' + cardsSkeletonHtml() + '</div>' +
      '<div class="pagination a-pager" data-role="cards-pager"></div>'
    );
  }

  function cardsSkeletonHtml() {
    let out = '';
    for (let i = 0; i < 3; i++) {
      out += '<div class="a-cardrow a-cardrow--skel">' +
        '<div class="skeleton a-skel-thumbs"></div>' +
        '<div class="a-skel-body"><div class="skeleton skeleton-line" style="width:36%"></div>' +
        '<div class="skeleton skeleton-line" style="width:72%;margin-top:12px"></div>' +
        '<div class="skeleton skeleton-line" style="width:54%;margin-top:12px"></div></div></div>';
    }
    return out;
  }

  function bindCards(root) {
    let timer = null;
    root.addEventListener('input', function (ev) {
      const input = ev.target.closest('[data-role="cards-q"]');
      if (!input) return;
      const value = input.value;
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (!isLive(root, 'cards')) return;
        S.cards.q = value.trim();
        loadCards(root, 1);
      }, 300);
    });
    root.addEventListener('click', function (ev) {
      const pageBtn = ev.target.closest('.a-pager [data-page]');
      if (pageBtn) {
        loadCards(root, parseInt(pageBtn.getAttribute('data-page'), 10));
        return;
      }
      const statusBtn = ev.target.closest('[data-card-status]');
      if (statusBtn) {
        const status = statusBtn.getAttribute('data-card-status');
        if (S.cards.status === status) return;
        S.cards.status = status;
        root.querySelectorAll('[data-card-status]').forEach(function (el) {
          const on = el === statusBtn;
          el.classList.toggle('is-active', on);
          el.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        loadCards(root, 1);
        return;
      }
      const actor = ev.target.closest('[data-act]');
      if (!actor) return;
      const act = actor.getAttribute('data-act');
      if (act === 'cards-refresh') { loadCards(root, S.cards.page); return; }
      const card = S.cards.map[actor.getAttribute('data-id') || ''];
      if (!card) return;
      if (act === 'approve-card' || act === 'reject-card') auditListCard(root, card, act, actor);
      else if (act === 'edit-card') openCardEditor(card);
      else if (act === 'delete-card') deleteCard(card);
      else if (act === 'view-card') window.open('/card/' + encodeURIComponent(card.id), '_blank', 'noopener');
    });
  }

  async function loadCards(root, page) {
    const job = ++S.jobs.cards;
    S.cards.page = Math.max(1, parseInt(page, 10) || 1);
    const area = root.querySelector('[data-role="cards-area"]');
    const pager = root.querySelector('[data-role="cards-pager"]');
    if (!area) return;
    area.innerHTML = cardsSkeletonHtml();
    if (pager) pager.innerHTML = '';
    try {
      const res = await QSL.api.admin.cards({
        status: S.cards.status,
        q: S.cards.q,
        page: S.cards.page,
        limit: LIMITS.cards
      });
      if (!aliveRoot(root, 'cards', job)) return;
      const pages = res && res.pages ? res.pages : 1;
      if (S.cards.page > pages) return loadCards(root, pages);
      S.cards.data = res;
      S.cards.map = Object.create(null);
      (res.items || []).forEach(function (c) { S.cards.map[c.id] = c; });
      paintCards(root, res);
    } catch (err) {
      if (!aliveRoot(root, 'cards', job)) return;
      emptyInto(area, {
        icon: (err && err.status === 403) ? 'shield' : 'alert',
        title: (err && err.status === 403) ? QSL.t("没有访问权限") : QSL.t("卡片加载失败"),
        desc: (err && err.message) || QSL.t("网络异常，请稍后重试。"),
        actionLabel: QSL.t("重新加载"),
        onAction: function () { loadCards(root, S.cards.page); }
      });
      if (pager) pager.innerHTML = '';
      toastError(err);
    }
  }

  function cardsEmptyOptions() {
    const filtered = !!(S.cards.q || S.cards.status !== 'all');
    if (S.cards.status === 'pending' && !S.cards.q) {
      return {
        icon: 'check-circle',
        title: QSL.t("待审核队列已清空"),
        desc: QSL.t("当前没有等待审核的卡片，新的上传会出现在这里。"),
        actionLabel: QSL.t("查看全部卡片"),
        onAction: function () { S.cards.status = 'all'; redrawTab(); }
      };
    }
    const map = {
      approved: { title: QSL.t("还没有已通过的卡片"), desc: QSL.t("没有任何卡片处于已通过状态。") },
      rejected: { title: QSL.t("没有被拒绝的卡片"), desc: QSL.t("所有卡片都审核通过了，真是好消息。") },
      all: { title: QSL.t("还没有卡片"), desc: QSL.t("站点暂时还没有上传任何 QSL 卡片。") }
    };
    const preset = map[S.cards.status] || map.all;
    return {
      icon: filtered ? 'search' : 'cards',
      title: filtered && S.cards.q ? QSL.t("没有找到匹配的卡片") : preset.title,
      desc: filtered && S.cards.q ? QSL.t("试试更换搜索关键词，或切换状态筛选。") : preset.desc,
      actionLabel: filtered ? QSL.t("清空筛选") : '',
      onAction: filtered ? function () {
        S.cards.q = '';
        S.cards.status = 'all';
        redrawTab();
      } : undefined
    };
  }

  function paintCards(root, res) {
    const items = Array.isArray(res.items) ? res.items : [];
    const area = root.querySelector('[data-role="cards-area"]');
    const pager = root.querySelector('[data-role="cards-pager"]');
    if (!items.length) {
      emptyInto(area, cardsEmptyOptions());
      if (pager) pager.innerHTML = '';
      return;
    }
    area.innerHTML = items.map(cardRowHtml).join('');
    renderPager(pager, res, function (target) { loadCards(root, target); });
    enhanceScope(area);
  }

  function cardRowHtml(card) {
    const id = card.id || '';
    const title = card.title || QSL.t("未命名卡片");
    const owner = card.owner || {};
    const status = card.status || 'pending';
    const actions = [];
    if (status !== 'approved') {
      actions.push('<button class="a-act a-act--primary" type="button" data-act="approve-card" data-id="' + escAttr(id) + '">' + ico('check', 15) + (QSL.escapeHtml(QSL.t("通过")) + "</button>"));
    }
    if (status !== 'rejected') {
      actions.push('<button class="a-act a-act--danger" type="button" data-act="reject-card" data-id="' + escAttr(id) + '">' + ico('x', 15) + (QSL.escapeHtml(QSL.t("拒绝")) + "</button>"));
    }
    actions.push('<button class="a-act" type="button" data-act="edit-card" data-id="' + escAttr(id) + '">' + ico('edit', 15) + (QSL.escapeHtml(QSL.t("编辑")) + "</button>"));
    actions.push('<button class="a-act" type="button" data-act="view-card" data-id="' + escAttr(id) + '">' + ico('external', 15) + (QSL.escapeHtml(QSL.t("前台查看")) + "</button>"));
    actions.push('<button class="a-act a-act--danger a-act--wide" type="button" data-act="delete-card" data-id="' + escAttr(id) + '">' + ico('trash', 15) + (QSL.escapeHtml(QSL.t("删除")) + "</button>"));

    return (
      '<article class="a-cardrow" data-card-id="' + escAttr(id) + '">' +
      '<div class="a-cardrow-thumbs">' + thumbPair(card) + '</div>' +
      '<div class="a-cardrow-main">' +
      '<div class="a-cardrow-head"><h3 class="a-cardrow-title" title="' + escAttr(title) + '">' + esc(title) + '</h3>' +
      statusBadge(status) + '</div>' +
      (card.notes ? '<p class="a-cardrow-notes clamp-2">' + esc(card.notes) + '</p>' : '') +
      '<div class="a-cardrow-meta">' +
      '<span class="a-cardrow-owner">' + QSL.ownerLine(owner) + '</span>' +
      '<span class="a-meta-item">' + ico('antenna', 14) + esc(card.callSign || '—') + '</span>' +
      '<span class="a-meta-item">' + ico('flip', 14) + esc(ratioLabel(card.ratio)) + '</span>' +
      '<span class="a-meta-item">' + ico('heart', 14) + esc(String(card.likeCount || 0)) + '</span>' +
      '<span class="a-meta-item">' + ico('clock', 14) + (QSL.t("提交于") + " ") + esc(fmtDateTime(card.createdAt)) + '</span>' +
      '</div>' +
      (status === 'rejected' && card.rejectReason
        ? '<p class="a-reject-note">' + ico('info', 14) + ("<span>" + QSL.escapeHtml(QSL.t("拒绝原因："))) + esc(card.rejectReason) + '</span></p>'
        : '') +
      '</div>' +
      '<div class="a-cardrow-actions">' + actions.join('') + '</div>' +
      '</article>'
    );
  }

  async function auditListCard(root, card, act, btn) {
    if (act === 'approve-card') {
      if (btn.disabled) return;
      animateBusy(btn, true, QSL.t("通过中…"));
      try {
        await QSL.api.admin.updateCard(card.id, { status: 'approved' });
        toast('「' + (card.title || QSL.t("卡片")) + QSL.t("」已通过审核"), 'success');
        celebrate(btn);
        if (isLive(root, 'cards')) loadCards(root, S.cards.page);
        refreshStatsQuiet();
      } catch (err) {
        if (isLive(root, 'cards')) animateBusy(btn, false);
        toastError(err);
      }
      return;
    }
    const reason = await askRejectReason({ title: QSL.t("拒绝卡片"), cardTitle: card.title || QSL.t("未命名卡片"), confirmText: QSL.t("确认拒绝") });
    if (!reason) return;
    if (btn.disabled) return;
    animateBusy(btn, true, QSL.t("拒绝中…"));
    try {
      await QSL.api.admin.updateCard(card.id, { status: 'rejected', rejectReason: reason });
      toast(QSL.t("已拒绝「") + (card.title || QSL.t("卡片")) + '」', 'info');
      if (isLive(root, 'cards')) loadCards(root, S.cards.page);
      refreshStatsQuiet();
    } catch (err) {
      if (isLive(root, 'cards')) animateBusy(btn, false);
      toastError(err);
    }
  }

  async function deleteCard(card) {
    const ok = await QSL.confirm({
      title: QSL.t("删除卡片"),
      message: QSL.t("确定删除「") + (card.title || QSL.t("未命名卡片")) + QSL.t("」吗？删除后不可恢复，相关点赞与换卡申请会被一并移除。"),
      confirmText: QSL.t("删除卡片"),
      cancelText: QSL.t("取消"),
      danger: true
    });
    if (!ok) return;
    try {
      await QSL.api.admin.deleteCard(card.id);
      toast(QSL.t("卡片已删除"), 'success');
      refreshStatsQuiet();
      if (isLive(S.root, 'cards')) loadCards(S.root, S.cards.page);
    } catch (err) {
      toastError(err);
    }
  }

  function openCardEditor(card) {
    const ratio = card.ratio || { w: 3, h: 2 };
    const status = card.status || 'pending';

    const content =
      '<form class="modal-form" data-form novalidate>' +
      '<div class="a-editor-preview">' + thumbPair(card) +
      '<div class="a-editor-hint">' + ico('info', 15) + ("<span>" + QSL.escapeHtml(QSL.t("如需更换正反面图片，请由卡片作者在「我的卡片」中重新上传。")) + "</span></div></div>") +
      '<div class="form-grid">' +
      '<div class="span-2">' + QSL.field({ label: QSL.t("标题"), required: true, input: '<input class="input" name="title" type="text" maxlength="60" value="' + escAttr(card.title || '') + '">' }) + '</div>' +
      QSL.field({ label: QSL.t("呼号"), input: '<input class="input" name="callSign" type="text" maxlength="20" value="' + escAttr(card.callSign || '') + '">' }) +
      QSL.field({ label: QSL.t("宽高比"), hint: QSL.t("整数 1–1000，常见 3:2 / 2:3 / 4:5"), input: '<div class="a-ratio-inputs"><input class="input" name="ratioW" type="number" min="1" max="1000" value="' + escAttr(String(ratio.w || 3)) + ("\" aria-label=\"" + QSL.escapeHtml(QSL.t("宽")) + "\">") + '<span class="a-ratio-sep">:</span>' + '<input class="input" name="ratioH" type="number" min="1" max="1000" value="' + escAttr(String(ratio.h || 2)) + ("\" aria-label=\"" + QSL.escapeHtml(QSL.t("高")) + "\"></div>") }) +
      '<div class="span-2 a-editor-row' + (status === 'rejected' ? '' : ' is-single') + '" data-role="status-row">' +
      QSL.field({ label: QSL.t("审核状态"), hint: QSL.t("设为「已通过」时会自动清空拒绝原因"), input: '<select class="select" name="status">' +
        [['pending', QSL.t("待审核")], ['approved', QSL.t("已通过")], ['rejected', QSL.t("已拒绝")]].map(function (pair) {
          return '<option value="' + pair[0] + '"' + (status === pair[0] ? ' selected' : '') + '>' + pair[1] + '</option>';
        }).join('') + '</select>' }) +
      '<div data-role="reject-wrap"' + (status === 'rejected' ? '' : ' hidden') + '>' +
      QSL.field({ label: QSL.t("拒绝原因"), hint: QSL.t("会展示给卡片作者"), input: '<input class="input" name="rejectReason" type="text" maxlength="200" value="' + escAttr(card.rejectReason || '') + '">' }) +
      '</div></div>' +
      '<div class="span-2">' + QSL.field({ label: QSL.t("卡片简介"), input: '<textarea class="textarea" name="notes" rows="3" maxlength="300">' + esc(card.notes || '') + '</textarea>' }) + '</div>' +
      '</div></form>';

    const modal = QSL.modal({
      title: (QSL.t("编辑卡片 ·") + " ") + (card.title || ''),
      size: 'lg',
      content: content,
      actions: [
        { label: QSL.t("取消"), type: 'ghost' },
        {
          label: QSL.t("保存修改"),
          type: 'primary',
          closeOnClick: false,
          onClick: async function () {
            const form = modal.body.querySelector('[data-form]');
            if (!form) return false;
            const data = QSL.formData(form);
            const w = parseInt(data.ratioW, 10);
            const h = parseInt(data.ratioH, 10);
            const problems = {};
            if (!data.title) problems.title = QSL.t("请填写卡片标题");
            if (!w || w < 1 || w > 1000) problems.ratioW = QSL.t("宽度需为 1–1000 的整数");
            if (!h || h < 1 || h > 1000) problems.ratioH = QSL.t("高度需为 1–1000 的整数");
            if (Object.keys(problems).length) {
              QSL.showFieldErrors(form, problems);
              toast(Object.keys(problems).map(function (k) { return problems[k]; })[0], 'error');
              return false;
            }
            const body = {
              title: data.title,
              callSign: data.callSign,
              notes: data.notes,
              ratio: { w: w, h: h },
              status: data.status
            };
            if (data.status === 'rejected') body.rejectReason = data.rejectReason || '';
            try {
              await QSL.api.admin.updateCard(card.id, body);
              toast(QSL.t("卡片信息已更新"), 'success');
              refreshStatsQuiet();
              if (isLive(S.root, 'cards')) loadCards(S.root, S.cards.page);
              modal.close();
            } catch (err) {
              if (err && err.fields) QSL.showFieldErrors(form, err.fields);
              toastError(err);
            }
            return false;
          }
        }
      ]
    });

    const scope = modal.body;
    const statusSel = scope.querySelector('[name="status"]');
    const rejectWrap = scope.querySelector('[data-role="reject-wrap"]');
    const statusRow = scope.querySelector('[data-role="status-row"]');
    if (statusSel && rejectWrap) {
      statusSel.addEventListener('change', function () {
        const showReject = statusSel.value === 'rejected';
        rejectWrap.hidden = !showReject;
        if (statusRow) statusRow.classList.toggle('is-single', !showReject);
      });
    }
  }

  /* ============================================================
   * 换卡记录 Exchanges
   * ============================================================ */
  function drawExchanges(panel) {
    const root = tabRoot(panel, exchangesShellHtml());
    bindExchanges(root);
    loadExchanges(root, 1);
  }

  function exchangesShellHtml() {
    return (
      '<div class="toolbar a-toolbar">' +
      '<label class="a-filter"><span>' + ico('filter', 15) + (QSL.escapeHtml(QSL.t("状态")) + "</span>") +
      ("<select class=\"select a-select\" data-role=\"exchanges-status\" aria-label=\"" + QSL.escapeHtml(QSL.t("换卡状态筛选")) + "\">") +
      EXCHANGE_STATUS_OPTIONS.map(function (o) {
        return '<option value="' + escAttr(o.key) + '"' + (S.exchanges.status === o.key ? ' selected' : '') + '>' + esc(o.label) + '</option>';
      }).join('') + '</select></label>' +
      '<span class="a-toolbar-spacer"></span>' +
      '<span class="a-toolbar-note">' + ico('info', 15) + (QSL.escapeHtml(QSL.t("只读视图 · 状态由参与双方操作")) + "</span>") +
      '<button class="btn btn-ghost btn-sm" type="button" data-act="exchanges-refresh">' + ico('refresh', 16) + (QSL.escapeHtml(QSL.t("刷新")) + "</button>") +
      '</div>' +
      '<section class="a-table-shell glass">' +
      '<p class="a-scroll-hint">' + ico('arrow-right', 14) + ("<span>" + QSL.escapeHtml(QSL.t("左右滑动查看完整表格")) + "</span></p>") +
      '<div class="table-wrap a-table-wrap" data-role="exchanges-area">' + QSL.skeletonTable(6, 6) + '</div>' +
      '<div class="pagination a-pager" data-role="exchanges-pager"></div>' +
      '</section>'
    );
  }

  function bindExchanges(root) {
    root.addEventListener('change', function (ev) {
      const sel = ev.target.closest('[data-role="exchanges-status"]');
      if (!sel) return;
      S.exchanges.status = sel.value;
      loadExchanges(root, 1);
    });
    root.addEventListener('click', function (ev) {
      const pageBtn = ev.target.closest('.a-pager [data-page]');
      if (pageBtn) {
        loadExchanges(root, parseInt(pageBtn.getAttribute('data-page'), 10));
        return;
      }
      const actor = ev.target.closest('[data-act="exchanges-refresh"]');
      if (actor) { loadExchanges(root, S.exchanges.page); return; }
      const row = ev.target.closest('tr[data-exchange-id]');
      if (row) openExchangeFromRow(row.getAttribute('data-exchange-id'));
    });
    root.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const row = ev.target.closest('tr[data-exchange-id]');
      if (!row) return;
      ev.preventDefault();
      openExchangeFromRow(row.getAttribute('data-exchange-id'));
    });
  }

  function openExchangeFromRow(id) {
    if (!S) return;
    const item = S.exchanges.map[id];
    if (item) openExchangeDetail(item);
  }

  async function loadExchanges(root, page) {
    const job = ++S.jobs.exchanges;
    S.exchanges.page = Math.max(1, parseInt(page, 10) || 1);
    const area = root.querySelector('[data-role="exchanges-area"]');
    const pager = root.querySelector('[data-role="exchanges-pager"]');
    if (!area) return;
    area.innerHTML = QSL.skeletonTable(6, 6);
    if (pager) pager.innerHTML = '';
    try {
      const res = await QSL.api.admin.exchanges({
        status: S.exchanges.status,
        page: S.exchanges.page,
        limit: LIMITS.exchanges
      });
      if (!aliveRoot(root, 'exchanges', job)) return;
      const pages = res && res.pages ? res.pages : 1;
      if (S.exchanges.page > pages) return loadExchanges(root, pages);
      S.exchanges.data = res;
      S.exchanges.map = Object.create(null);
      (res.items || []).forEach(function (it) { S.exchanges.map[it.id] = it; });
      paintExchanges(root, res);
    } catch (err) {
      if (!aliveRoot(root, 'exchanges', job)) return;
      emptyInto(area, {
        icon: (err && err.status === 403) ? 'shield' : 'alert',
        title: (err && err.status === 403) ? QSL.t("没有访问权限") : QSL.t("换卡记录加载失败"),
        desc: (err && err.message) || QSL.t("网络异常，请稍后重试。"),
        actionLabel: QSL.t("重新加载"),
        onAction: function () { loadExchanges(root, S.exchanges.page); }
      });
      if (pager) pager.innerHTML = '';
      toastError(err);
    }
  }

  function paintExchanges(root, res) {
    const items = Array.isArray(res.items) ? res.items : [];
    const area = root.querySelector('[data-role="exchanges-area"]');
    const pager = root.querySelector('[data-role="exchanges-pager"]');
    if (!items.length) {
      emptyInto(area, {
        icon: 'send',
        title: S.exchanges.status ? QSL.t("该状态下暂无换卡申请") : QSL.t("还没有换卡申请"),
        desc: S.exchanges.status ? QSL.t("试试切换其它状态，或查看全部记录。") : QSL.t("当用户之间发起 QSL 卡片交换后，记录会出现在这里。"),
        actionLabel: S.exchanges.status ? QSL.t("查看全部记录") : '',
        onAction: S.exchanges.status ? function () {
          S.exchanges.status = '';
          redrawTab();
        } : undefined
      });
      if (pager) pager.innerHTML = '';
      return;
    }
    area.innerHTML =
      '<table class="table a-table a-exchanges-table"><thead><tr>' +
      ("<th>" + QSL.escapeHtml(QSL.t("卡片")) + "</th><th>" + QSL.escapeHtml(QSL.t("申请人")) + "</th><th>" + QSL.escapeHtml(QSL.t("接收人")) + "</th><th>" + QSL.escapeHtml(QSL.t("状态")) + "</th><th>" + QSL.escapeHtml(QSL.t("创建时间")) + "</th><th>" + QSL.escapeHtml(QSL.t("处理时间")) + "</th><th class=\"a-col-chev\"></th>") +
      '</tr></thead><tbody>' + items.map(exchangeRowHtml).join('') + '</tbody></table>';
    renderPager(pager, res, function (target) { loadExchanges(root, target); });
    enhanceScope(area);
  }

  function exchangeRowHtml(item) {
    const card = item.card || {};
    const decided = item.decidedAt || (item.status !== 'pending' ? item.updatedAt : '');
    return (
      '<tr data-exchange-id="' + escAttr(item.id) + ("\" tabindex=\"0\" class=\"a-row-click\" title=\"" + QSL.escapeHtml(QSL.t("点击查看换卡详情")) + "\">") +
      '<td><div class="a-exch-card">' + miniThumb(card.frontImage, card.title) +
      '<span class="a-exch-card-text"><b>' + esc(card.title || QSL.t("卡片已删除")) + '</b>' +
      '<small>' + esc(card.callSign || '—') + ' · ' + esc(ratioLabel(card.ratio)) + '</small></span></div></td>' +
      '<td>' + userInline(item.fromUser, 30) + '</td>' +
      '<td>' + userInline(item.toUser, 30) + '</td>' +
      '<td>' + exchangeBadge(item.status) + '</td>' +
      '<td><span class="a-time">' + esc(fmtDateTime(item.createdAt)) + '</span></td>' +
      '<td><span class="a-time">' + (decided ? esc(fmtDateTime(decided)) : '<span class="a-cell-muted">—</span>') + '</span></td>' +
      '<td class="a-col-chev">' + ico('chevron-right', 16) + '</td>' +
      '</tr>'
    );
  }

  function partyHtml(label, user, address, addressVisible) {
    return (
      '<div class="a-party">' +
      '<div class="a-party-head">' + esc(label) + '</div>' +
      (user ? userInline(user, 34) : ("<span class=\"muted\">" + QSL.escapeHtml(QSL.t("用户已删除")) + "</span>")) +
      addressHtml(address, addressVisible) +
      '</div>'
    );
  }

  function addressHtml(address, visible) {
    if (!visible) {
      return '<div class="a-addr a-addr--locked">' + ico('lock', 14) + ("<span>" + QSL.escapeHtml(QSL.t("申请尚未达成交换，地址暂不公开")) + "</span></div>");
    }
    if (!address) {
      return '<div class="a-addr a-addr--locked">' + ico('info', 14) + ("<span>" + QSL.escapeHtml(QSL.t("暂无地址信息")) + "</span></div>");
    }
    const addr = address;
    const lines = [];
    lines.push('<b>' + esc(addr.name || '—') + (addr.phone ? ' · ' + esc(addr.phone) : '') + '</b>');
    const region = [addr.province, addr.city].filter(Boolean).join(' ');
    if (region) lines.push('<span>' + esc(region) + '</span>');
    if (addr.line1) lines.push('<span>' + esc(addr.line1) + '</span>');
    const tail = [addr.country, addr.postalCode].filter(Boolean).join(' ');
    if (tail) lines.push('<span>' + esc(tail) + '</span>');
    return '<div class="a-addr">' + ico('map-pin', 15) + '<div class="a-addr-lines">' + lines.join('') + '</div></div>';
  }

  function timelineHtml(item) {
    const list = [{
      time: item.createdAt,
      title: QSL.t("提交换卡申请"),
      desc: (QSL.t("申请人") + " ") + ((item.fromUser && (item.fromUser.displayName || item.fromUser.username)) || QSL.t("未知用户")) + (" " + QSL.t("发起申请"))
    }];
    if (item.decidedAt) {
      if (item.status === 'approved') {
        list.push({ time: item.decidedAt, title: QSL.t("卡片所有者同意交换"), desc: QSL.t("双方地址已互相公开，可以开始寄送卡片") });
      } else if (item.status === 'rejected') {
        list.push({ time: item.decidedAt, title: QSL.t("卡片所有者拒绝申请"), desc: item.rejectReason || QSL.t("未填写拒绝原因") });
      } else if (item.status === 'cancelled') {
        list.push({ time: item.decidedAt, title: QSL.t("申请人取消申请"), desc: QSL.t("申请在待处理状态被取消") });
      } else {
        list.push({ time: item.decidedAt, title: exchangeText(item.status) });
      }
    }
    if (item.status === 'completed') {
      list.push({ time: item.updatedAt || item.decidedAt, title: QSL.t("交换完成"), desc: QSL.t("双方确认已完成 QSL 卡片互换") });
    }
    return '<div class="timeline">' + list.map(function (entry) {
      return '<div class="timeline-item">' +
        '<div class="timeline-time">' + esc(fmtDateTime(entry.time)) + '</div>' +
        '<div class="timeline-title">' + esc(entry.title) + '</div>' +
        (entry.desc ? '<div class="timeline-desc">' + esc(entry.desc) + '</div>' : '') +
        '</div>';
    }).join('') + '</div>';
  }

  function exchangeDetailHtml(item) {
    const card = item.card || {};
    // 管理后台接口对 admin 始终返回双方地址（有地址时），此处直接展示。
    const visibleAddress = true;
    return (
      '<div class="a-exch-detail">' +
      '<div class="a-exch-preview">' +
      '<div class="a-exch-3d" data-role="exch-3d"></div>' +
      '<div class="a-exch-cardmeta"><b>' + esc(card.title || QSL.t("卡片已删除")) + '</b>' +
      '<span>' + esc([card.callSign, ratioLabel(card.ratio)].filter(Boolean).join(' · ') || '—') + '</span>' +
      '<span class="a-exch-cardbadges">' + exchangeBadge(item.status) + '</span></div>' +
      '<p class="a-preview-hint">' + ico('3d', 15) + (QSL.escapeHtml(QSL.t("拖拽旋转 · 双击翻转查看背面")) + "</p>") +
      '</div>' +
      '<div class="a-exch-info">' +
      '<div class="a-exch-statusrow">' +
      ("<div class=\"a-exch-idbox\"><span class=\"a-kicker\">" + QSL.escapeHtml(QSL.t("申请编号")) + "</span><b class=\"a-mono\">") + esc(item.id || '—') + '</b></div>' +
      ("<div class=\"a-exch-idbox\"><span class=\"a-kicker\">" + QSL.escapeHtml(QSL.t("提交时间")) + "</span><b>") + esc(fmtDateTime(item.createdAt)) + '</b></div>' +
      ("<div class=\"a-exch-idbox\"><span class=\"a-kicker\">" + QSL.escapeHtml(QSL.t("当前状态")) + "</span><b>") + esc(exchangeText(item.status)) + '</b></div>' +
      '</div>' +
      '<div class="a-info-block"><div class="a-info-label">' + ico('mail', 15) + (QSL.escapeHtml(QSL.t("申请留言")) + "</div>") +
      (item.message
        ? '<blockquote class="a-quote">' + esc(item.message) + '</blockquote>'
        : ("<p class=\"a-empty-line\">" + QSL.escapeHtml(QSL.t("申请人没有填写留言。")) + "</p>")) + '</div>' +
      (item.status === 'rejected'
        ? '<div class="a-info-block"><div class="a-info-label">' + ico('alert', 15) + (QSL.escapeHtml(QSL.t("拒绝原因")) + "</div>") +
        (item.rejectReason ? '<blockquote class="a-quote a-quote--danger">' + esc(item.rejectReason) + '</blockquote>' : ("<p class=\"a-empty-line\">" + QSL.escapeHtml(QSL.t("未填写拒绝原因。")) + "</p>")) + '</div>'
        : '') +
      '<div class="a-info-block"><div class="a-info-label">' + ico('users', 15) + QSL.t("交换双方") +
      (item.contactName ? ("<span class=\"a-info-extra\">" + QSL.escapeHtml(QSL.t("收件联系人："))) + esc(item.contactName) + '</span>' : '') + '</div>' +
      '<div class="a-parties">' +
      partyHtml(QSL.t("申请人 · 发出申请"), item.fromUser, item.fromAddress, visibleAddress) +
      partyHtml(QSL.t("接收人 · 卡片所有者"), item.toUser, item.toAddress, visibleAddress) +
      '</div></div>' +
      '<div class="a-info-block"><div class="a-info-label">' + ico('clock', 15) + (QSL.escapeHtml(QSL.t("时间线")) + "</div>") + timelineHtml(item) + '</div>' +
      '<div class="info-banner"><span>' + ico('shield', 18) + ("</span><span>" + QSL.escapeHtml(QSL.t("管理员视角为只读：换卡状态由参与双方操作，管理员无法直接修改。")) + "</span></div>") +
      '</div></div>'
    );
  }

  function openExchangeDetail(item) {
    const card = item.card || {};
    let viewer = null;
    const modal = QSL.modal({
      title: QSL.t("换卡申请详情"),
      size: 'lg',
      content: exchangeDetailHtml(item),
      onClose: function () {
        if (viewer) {
          try { viewer.destroy(); } catch (err) { /* 忽略 */ }
          viewer = null;
        }
      },
      actions: [
        {
          label: QSL.t("查看卡片详情"),
          type: 'ghost',
          closeOnClick: true,
          onClick: function () {
            if (card.id) window.open('/card/' + encodeURIComponent(card.id), '_blank', 'noopener');
          }
        },
        { label: QSL.t("关闭"), type: 'ghost' }
      ]
    });
    const host = modal.body ? modal.body.querySelector('[data-role="exch-3d"]') : null;
    if (!host) return;
    if (QSL.card3d && typeof QSL.card3d.create === 'function') {
      try {
        viewer = QSL.card3d.create(host, {
          front: imageSrc(card.frontImage),
          back: card.backImage || '',
          ratio: card.ratio || { w: 3, h: 2 },
          width: 236,
          autoRotate: false,
          interactive: true,
          showControls: false,
          ambient: true
        });
      } catch (err) {
        viewer = null;
      }
    }
    if (!viewer) {
      host.innerHTML = thumbPair(card, { className: 'a-thumbs--preview' }) +
        '<p class="a-preview-hint">' + ico('image', 15) + (QSL.escapeHtml(QSL.t("正反面缩略图")) + "</p>");
    }
  }

  /* ============================================================
   * 页面注册：入口权限校验 + 启动
   * ============================================================ */
  function render(container, ctx) {
    const query = ctx && ctx.query && typeof ctx.query.get === 'function' ? ctx.query : new URLSearchParams(location.search);
    const tab = normalizeTab(query.get('tab'));
    let cancelled = false;

    function start() {
      if (cancelled || !container.isConnected) return;
      const user = QSL.state && QSL.state.user;
      if (!user) {
        renderDenied(container, 'guest');
        return;
      }
      if (user.role !== 'admin') {
        renderDenied(container, 'forbidden');
        return;
      }
      paintPage(container, tab);
    }

    if (QSL.state && QSL.state.booted) {
      start();
    } else if (QSL.state && QSL.state.ready && typeof QSL.state.ready.then === 'function') {
      QSL.state.ready.then(start, start);
    } else {
      start();
    }

    return function cleanup() {
      cancelled = true;
      if (S) {
        closeAnnouncementModal();
        closeContestModal();
        S.disposed = true;
        S = null;
      }
    };
  }

  QSL.registerPage('admin', { title: QSL.t("管理后台"), render: render });
})();
