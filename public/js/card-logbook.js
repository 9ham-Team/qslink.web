(function () {
  'use strict';
  const QSL = window.QSL;
  const esc = QSL.escapeHtml;
  const memoryDays = new Map();
  const keyFor = userId => 'qsl_contact_reminder_day:' + userId;
  function today(date) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date || new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return values.year + '-' + values.month + '-' + values.day;
  }
  function muted(userId) {
    const day = today();
    try { return localStorage.getItem(keyFor(userId)) === day || memoryDays.get(userId) === day; }
    catch (err) { return memoryDays.get(userId) === day; }
  }
  function muteToday(userId) {
    const day = today();
    memoryDays.set(userId, day);
    try { localStorage.setItem(keyFor(userId), day); } catch (err) { /* Current session still remembers. */ }
  }
  function callSignFor(card, owner) {
    return String(card.callSign || '').trim().toUpperCase() || String((owner || card.owner || {}).callSign || '').trim().toUpperCase();
  }
  function utcTime(row) {
    return String(row.qsoAt || '').replace('T', ' ').slice(0, 19) + ' UTC';
  }
  function summary(row) {
    return utcTime(row) + ' · ' + [row.band, row.submode || row.mode].filter(Boolean).join(' / ');
  }
  function rowHtml(row) {
    return '<li class="g-card-logbook__record"><b>' + esc(utcTime(row)) + '</b><span>' + esc([row.band, row.submode || row.mode, row.frequency ? row.frequency + ' MHz' : ''].filter(Boolean).join(' · ')) + '</span>' +
      '<small>本站 ' + esc(row.stationCallSign || '—') + ' · 对方 ' + esc(row.callSign) + '</small></li>';
  }

  function bind(host, card, owner) {
    if (!host) return function () {};
    const callSign = callSignFor(card, owner);
    let disposed = false, sequence = 0, userId, items = [], page = 0, pages = 0, total = 0;
    let popup = null, observer = null, reminded = false, busy = false;
    const events = new AbortController();
    host.setAttribute('tabindex', '-1');
    function alive(id, request) {
      return !disposed && host.isConnected && userId === id && QSL.state.user?.id === id && (request === undefined || request === sequence);
    }
    function closePopup() {
      if (observer) { observer.disconnect(); observer = null; }
      if (popup) {
        const overlay = popup.el && popup.el.closest('.modal-overlay');
        popup.close(); popup = null;
        if (overlay) overlay.remove();
      }
    }
    function remind() {
      const id = userId;
      if (!alive(id) || !total || reminded || muted(id)) return;
      if (document.querySelector('.modal-overlay')) {
        const root = document.getElementById('modal-root');
        if (!observer && root) {
          observer = new MutationObserver(remind);
          observer.observe(root, { childList: true });
        }
        return;
      }
      if (observer) { observer.disconnect(); observer = null; }
      reminded = true;
      const dialog = QSL.modal({
        title: '通联纪录提醒', size: 'sm',
        content: '<p>你与签发此卡的无线电台站似乎有过通联纪录。</p><p class="g-card-logbook__notice"><strong>' + esc(callSign) + '</strong><br>最近一次：' + esc(summary(items[0])) + '</p>',
        actions: [
          { label: '好的', type: 'primary' },
          { label: '好的（今日不再提醒）', type: 'ghost', onClick: function () { if (alive(id)) muteToday(id); } }
        ],
        onClose: function () {
          if (alive(id) && dialog.el && dialog.el.contains(document.activeElement)) (host.querySelector('summary') || host).focus({ preventScroll: true });
          if (popup === dialog) popup = null;
        }
      });
      popup = dialog;
      if (dialog.el) dialog.el.querySelector('.modal-actions button')?.focus();
    }
    function render(expanded) {
      if (!total) { host.textContent = '无'; return; }
      host.innerHTML = '<details class="g-card-logbook"' + (expanded ? ' open' : '') + '><summary><span class="g-card-logbook__latest">' + esc(summary(items[0])) + '</span>' +
        '<span class="g-card-logbook__expand">展开通联纪录（' + total + ' 条）</span><span class="g-card-logbook__collapse">收起通联纪录</span></summary>' +
        '<ol class="g-card-logbook__records">' + items.map(rowHtml).join('') + '</ol>' +
        (page < pages ? '<button type="button" class="btn btn-ghost btn-sm" data-logbook-more>加载更多</button>' : '') + '</details>';
    }
    async function load(more) {
      if (busy || !userId || !callSign || disposed) return;
      const id = userId, request = ++sequence, nextPage = more ? page + 1 : 1;
      busy = true;
      const moreButton = host.querySelector('[data-logbook-more]');
      if (moreButton) { moreButton.disabled = true; moreButton.textContent = '加载中…'; }
      if (!more) host.textContent = '正在匹配通联纪录…';
      host.setAttribute('aria-busy', 'true');
      try {
        const data = await QSL.api.get('/api/me/logbook?' + new URLSearchParams({ callSign, page: nextPage }));
        if (!alive(id, request)) return;
        const seen = new Set(more ? items.map(row => row.id) : []);
        const rows = data.items.filter(row => !seen.has(row.id));
        items = more ? items.concat(rows) : rows;
        page = data.page; pages = data.pages; total = data.total;
        render(!!more);
        remind();
      } catch (err) {
        if (!alive(id, request)) return;
        if (!more) host.innerHTML = '<span>通联纪录加载失败</span> <button type="button" class="btn btn-ghost btn-sm" data-logbook-retry>重试</button>';
        QSL.toast(err.message || '通联纪录加载失败', 'error');
      } finally {
        if (alive(id, request)) {
          busy = false; host.removeAttribute('aria-busy');
          const button = host.querySelector('[data-logbook-more]');
          if (button) { button.disabled = false; button.textContent = '加载更多'; }
        }
      }
    }
    function syncUser() {
      const next = QSL.state.user?.id || null;
      if (next === userId) return;
      sequence++; closePopup(); userId = next; items = []; page = pages = total = 0; reminded = busy = false;
      host.removeAttribute('aria-busy'); host.textContent = '无';
      if (userId && callSign) load(false);
    }
    host.addEventListener('click', function (event) {
      if (event.target.closest('[data-logbook-more]')) load(true);
      else if (event.target.closest('[data-logbook-retry]')) load(false);
    }, { signal: events.signal });
    const offAuth = QSL.on('auth', syncUser);
    syncUser();
    return function cleanup() {
      disposed = true; sequence++; events.abort(); offAuth(); closePopup();
    };
  }
  QSL.cardLogbook = { bind, today, callSignFor };
})();
