/* Independent judge workspace: only the server-authorized personal sheet is requested. */
(function () {
  'use strict';
  const QSL = window.QSL;
  const J = QSL.contestJudging;
  const API = '/api/contests/qsl-design-2026-11/judging';
  const esc = QSL.escapeHtml;
  const t = source => esc(QSL.t(source));
  QSL.registerPage('qsl-design-judging', {
    title: QSL.t('评委工作台'),
    render(container) {
      const resources = J.scope();
      let images = null;
      let alive = true, loading = false, busy = false, uncertain = false;
      let judging = null, items = [], selected = null, filter = 'all';
      const drafts = new Map();
      const dirty = () => drafts.size > 0;
      // Keep leave protection local; never rewrite global SPA navigation/history.
      document.addEventListener('click', event => {
        const link = event.target.closest('a[href]');
        if (!dirty() || !link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === '_blank') return;
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#')) return;
        if (!window.confirm(QSL.t('存在未保存的评分，离开将丢失这些修改。确定离开？'))) { event.preventDefault(); event.stopImmediatePropagation(); }
      }, { capture: true, signal: resources.signal });
      const unload = event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } };
      window.addEventListener('beforeunload', unload, { signal: resources.signal });
      container.innerHTML = '<section class="container section f-judging"><p class="eyebrow">QSL DESIGN CONTEST · 2026.11</p><h1>' + t('评委工作台') + '</h1>' +
        '<p class="muted">' + t('仅显示本人评分。每件作品 0–10 分，最多一位小数；评语最多 1000 字。截止前可随时保存和修改。完成标记为可选，不会锁定评分；再次保存会清除完成标记。截止后以已保存评分汇总，无需完成标记。') + '</p>' +
        '<p data-judging-status role="status" aria-live="polite"></p><p data-judging-error class="f-judging-error" role="alert"></p>' +
        '<div class="f-judging-toolbar"><label>' + t('筛选作品') + '<select class="select" data-filter><option value="all">' + t('全部作品') + '</option><option value="pending">' + t('未评分') + '</option><option value="scored">' + t('已评分') + '</option><option value="dirty">' + t('未保存') + '</option></select></label>' +
        '<button class="btn btn-ghost" type="button" data-refresh>' + t('刷新评审数据') + '</button><button class="btn btn-primary" type="button" data-submit disabled>' + t('标记评分完成') + '</button></div>' +
        '<div class="f-judging-layout"><nav class="f-judging-list" data-works aria-label="' + t('评审作品') + '"></nav><div data-detail class="f-judging-detail"></div></div></section>';
      const status = container.querySelector('[data-judging-status]');
      const error = container.querySelector('[data-judging-error]');
      const list = container.querySelector('[data-works]');
      const detail = container.querySelector('[data-detail]');
      const submit = container.querySelector('[data-submit]');
      const refresh = container.querySelector('[data-refresh]');
      const writable = () => !!judging && judging.isOpen && !uncertain && Date.parse(judging.deadline) > Date.now();
      function showError(err) { if (alive) error.textContent = err.message || QSL.t('加载失败'); }
      function updateStatus() {
        if (!alive || !judging) return;
        const count = items.filter(item => item.score !== null && item.score !== undefined).length;
        status.textContent = QSL.t('已保存 {n}/{total} 件 · 未保存 {dirty} 件', { n: count, total: items.length, dirty: drafts.size }) + ' · ' +
          QSL.t('材料版本：{version} · 共 {n} 件作品', { version: judging.materialVersion || '—', n: judging.totalWorks }) + ' · ' +
          QSL.t('截止时间（北京时间）：{time}', { time: J.beijingTime(judging.deadline) }) + ' · ' +
          QSL.t(!judging.frozenAt ? '评审尚未开始' : !writable() ? '评审已关闭或需刷新（只读）' : judging.submittedAt ? '已标记完成（截止前仍可修改）' : '评审进行中');
        submit.disabled = busy || loading || !writable() || !!judging.submittedAt || dirty() || !items.length || count !== items.length;
        refresh.disabled = busy || loading;
        detail.querySelectorAll('input, textarea, [data-save]').forEach(node => { node.disabled = busy || !writable(); });
      }
      function filtered() {
        return items.filter(item => filter === 'all' || (filter === 'dirty' ? drafts.has(item.id) : filter === 'scored' ? !!item.score : !item.score));
      }
      function drawList() {
        const visible = filtered();
        list.innerHTML = visible.map(item => '<button type="button" class="f-judging-work' + (item.id === selected ? ' is-active' : '') + '" data-work="' + esc(item.id) + '"' + (item.id === selected ? ' aria-current="true"' : '') + '><b>#' + esc(String(item.number).padStart(3, '0')) + ' ' + esc(item.title) + '</b><small>' +
          t(drafts.has(item.id) ? '未保存' : item.score ? '已评分' : '未评分') + '</small></button>').join('') || '<p class="muted">' + t('没有符合筛选条件的作品') + '</p>';
      }
      function drawDetail() {
        if (images) images.cleanup();
        images = J.scope();
        const currentImages = images;
        const item = items.find(work => work.id === selected);
        if (!item) { detail.innerHTML = '<p class="muted">' + t('请选择作品；评审开始后会显示固定版本的材料。') + '</p>'; return; }
        const draft = drafts.get(item.id);
        const value = draft ? draft.value : item.score ? item.score.value : '';
        const comment = draft ? draft.comment : item.score ? item.score.comment : '';
        detail.innerHTML = '<h2>#' + esc(String(item.number).padStart(3, '0')) + ' ' + esc(item.title) + '</h2><p class="f-judging-description">' + esc(item.description) + '</p>' +
          '<div class="f-judging-images">' + ['front', 'back'].map(side => '<figure><figcaption>' + t(side === 'front' ? '正面' : '背面') + '</figcaption><p data-image-status="' + side + '" role="status">' + t('图片加载中…') + '</p><img data-image="' + side + '" alt="' + t(side === 'front' ? '正面' : '背面') + '" hidden></figure>').join('') + '</div>' +
          '<form data-score-form><div class="f-judging-toolbar"><label>' + t('评分（0–10，最多一位小数）') + '<input class="input" name="score" type="number" min="0" max="10" step="0.1" required value="' + esc(value) + '"></label><span data-draft-state role="status">' + t(draft ? '未保存' : item.score ? '已保存到服务器' : '未评分') + '</span></div>' +
          '<label>' + t('评语（最多 1000 字）') + '<textarea class="input" name="comment" rows="5">' + esc(comment) + '</textarea></label><p class="muted" data-comment-count></p>' +
          '<div class="f-judging-toolbar"><button class="btn btn-primary" type="submit" data-save>' + t('保存此作品评分') + '</button><button class="btn btn-ghost" type="button" data-discard>' + t('放弃此作品未保存修改') + '</button></div></form>';
        ['front', 'back'].forEach(async side => {
          const node = detail.querySelector('[data-image="' + side + '"]');
          const caption = detail.querySelector('[data-image-status="' + side + '"]');
          const path = item[side + 'Url'];
          if (!path) { caption.textContent = QSL.t('无图片'); return; }
          try {
            const url = await currentImages.binary(path);
            if (!alive || currentImages !== images || !url) return;
            node.src = url;
            node.hidden = false;
            caption.textContent = '';
          } catch (err) {
            if (alive && currentImages === images && err.name !== 'AbortError') caption.textContent = err.message;
          }
        });
        updateCount();
        updateStatus();
      }
      function updateCount() {
        const form = detail.querySelector('[data-score-form]');
        if (form) detail.querySelector('[data-comment-count]').textContent = Array.from(form.elements.comment.value).length + ' / 1000';
      }
      async function load(discard) {
        if (!alive || loading || busy) return;
        if (discard && dirty() && !window.confirm(QSL.t('刷新会放弃全部未保存修改，确定继续？'))) return;
        loading = true;
        updateStatus();
        try {
          const data = await QSL.api.get(API, { signal: resources.signal, cache: 'no-store' });
          if (!alive) return;
          if (discard) drafts.clear();
          judging = data.judging;
          items = data.items;
          uncertain = false;
          if (!items.some(item => item.id === selected)) selected = items.length ? items[0].id : null;
          error.textContent = '';
          drawList();
          // Background refresh preserves the focused editor and its in-memory draft.
          if (discard || !drafts.has(selected) || !detail.querySelector('[data-score-form]')) drawDetail();
        } catch (err) {
          if (!alive || err.name === 'AbortError') return;
          uncertain = true; // Never retain writable permission after a failed revalidation.
          showError(err);
          if (err.status === 401 || err.status === 403 || err.status === 404) {
            items = []; judging = null; selected = null; drafts.clear();
            if (images) images.cleanup();
            list.innerHTML = ''; detail.innerHTML = '';
            status.textContent = QSL.t('此账号没有评审权限，或评审材料不可用。');
            submit.disabled = true;
          }
        } finally { loading = false; if (alive) { refresh.disabled = busy; updateStatus(); } }
      }
      container.addEventListener('input', event => {
        const form = event.target.closest('[data-score-form]');
        if (!form || !writable() || busy) return;
        const item = items.find(work => work.id === selected);
        if (!item) return;
        const old = drafts.get(item.id);
        const value = form.elements.score.value;
        const comment = form.elements.comment.value;
        if (String(item.score ? item.score.value : '') === value && (item.score ? item.score.comment : '') === comment) drafts.delete(item.id);
        else drafts.set(item.id, { value, comment, expectedRevision: old ? old.expectedRevision : item.score ? item.score.revision : 0 });
        detail.querySelector('[data-draft-state]').textContent = QSL.t(drafts.has(item.id) ? '未保存' : item.score ? '已保存到服务器' : '未评分');
        updateCount(); drawList(); updateStatus();
      }, { signal: resources.signal });
      container.addEventListener('change', event => {
        if (event.target.matches('[data-filter]')) { filter = event.target.value; drawList(); }
      }, { signal: resources.signal });
      container.addEventListener('click', async event => {
        const button = event.target.closest('button');
        if (!button || button.disabled) return;
        if (button.hasAttribute('data-work')) { selected = button.dataset.work; drawList(); drawDetail(); }
        else if (button.hasAttribute('data-refresh')) load(true);
        else if (button.hasAttribute('data-discard')) {
          if (drafts.has(selected) && !window.confirm(QSL.t('确定放弃此作品未保存的修改？'))) return;
          drafts.delete(selected); drawList(); drawDetail();
        } else if (button.hasAttribute('data-submit')) {
          if (busy || loading || !writable() || judging.submittedAt || dirty() || items.some(item => !item.score)) return;
          busy = true; updateStatus();
          const yes = await QSL.confirm({ title: QSL.t('标记评分完成'), message: QSL.t('完成标记仅用于提示进度，不会锁定评分。截止前仍可修改，再次保存会清除标记；截止后汇总已保存评分，不要求完成标记。'), confirmText: QSL.t('确认标记完成') });
          if (!alive) return;
          if (!yes) { busy = false; updateStatus(); return; }
          try {
            const data = await QSL.api.post(API + '/submit', { expectedRevision: judging.revision }, { signal: resources.signal });
            if (alive) { judging = data.judging; error.textContent = ''; }
          } catch (err) { if (alive && err.name !== 'AbortError') { uncertain = true; showError(err); } }
          finally { busy = false; updateStatus(); }
        }
      }, { signal: resources.signal });
      container.addEventListener('submit', async event => {
        if (!event.target.matches('[data-score-form]')) return;
        event.preventDefault();
        if (busy || loading || !writable()) return;
        const item = items.find(work => work.id === selected);
        const form = event.target;
        const value = form.elements.score.value;
        const comment = form.elements.comment.value;
        if (!item || !J.validScore(value, comment)) { error.textContent = QSL.t('请输入 0–10 的评分（最多一位小数），评语不能超过 1000 字。'); return; }
        const draft = drafts.get(item.id);
        busy = true; error.textContent = ''; updateStatus();
        try {
          const data = await QSL.api.put(API + '/materials/' + encodeURIComponent(item.id) + '/score', { expectedRevision: draft ? draft.expectedRevision : item.score ? item.score.revision : 0, score: Number(value), comment }, { signal: resources.signal });
          if (!alive) return;
          item.score = data.score;
          judging = data.judging;
          drafts.delete(item.id);
          drawList();
          if (selected === item.id) drawDetail();
        } catch (err) { if (alive && err.name !== 'AbortError') { uncertain = true; showError(err); } }
        finally { busy = false; updateStatus(); }
      }, { signal: resources.signal });
      const tick = setInterval(updateStatus, 1000);
      const poll = setInterval(() => load(false), 30000);
      load(true);
      return () => {
        alive = false;
        clearInterval(tick); clearInterval(poll);
        resources.cleanup(); if (images) images.cleanup();
        drafts.clear(); items = []; judging = null;
      };
    }
  });
})();
