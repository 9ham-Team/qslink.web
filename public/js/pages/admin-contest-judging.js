/* Contest judging admin region; mounted and disposed by admin.js. */
(function () {
  'use strict';
  const QSL = window.QSL;
  const J = QSL.contestJudging;
  const API = '/api/admin/contests/qsl-design-2026-11/judging';
  const esc = QSL.escapeHtml;
  const t = source => esc(QSL.t(source));
  QSL.mountAdminContestJudging = function (root, ownerLive) {
    const resources = J.scope();
    let alive = true, busy = false, downloading = false, loading = false, stale = false;
    let judging = null, selected = [], searchJob = 0;
    const live = () => alive && ownerLive();
    root.innerHTML = '<h2>' + t('人工评审管理') + '</h2><p class="muted">' + t('开始前配置 5 位正常状态的普通用户。开始后评委、截止时间与材料版本固定，不可修改。截止前管理员仅可查看进度；截止后才可查看人工结果和下载评分表。不自动调用 AI 或生成最终排名。') + '</p><div data-judging-admin-body></div>';
    const body = root.querySelector('[data-judging-admin-body]');
    function error(err) { if (live()) body.querySelector('[data-admin-error]').textContent = err.message || QSL.t('操作失败，请稍后重试'); }
    function configDirty() {
      if (!judging || judging.frozenAt) return false;
      const deadline = body.querySelector('[data-deadline]');
      if (!deadline) return false;
      const deadlineChanged = judging.deadline ? Date.parse(deadline.value + '+08:00') !== Date.parse(judging.deadline) : !!deadline.value;
      return !!deadline && (deadlineChanged || selected.map(user => user.id).join(',') !== (judging.judges || []).map(user => user.userId).join(','));
    }
    function disable() {
      if (!live() || !judging) return;
      const frozen = !!judging.frozenAt;
      body.querySelectorAll('[data-config] input, [data-config] button').forEach(node => { node.disabled = busy || loading || stale || frozen; });
      body.querySelector('[data-start]').disabled = busy || loading || stale || frozen || configDirty() || !judging.deadline || (judging.judges || []).length !== 5;
      body.querySelector('[data-reload]').disabled = busy || loading;
      body.querySelectorAll('[data-download]').forEach(node => { node.disabled = downloading || busy || (node.dataset.download === 'scores' ? !judging.canViewResults : !frozen); });
    }
    function drawSelected() {
      body.querySelector('[data-selected]').innerHTML = selected.map((user, index) => '<li><span>' + QSL.t('评委 {n}', { n: index + 1 }) + ' · ' + esc(user.displayName || user.username || user.userId) + ' @' + esc(user.username || '') + ' · UID ' + esc(user.uid || '—') + '</span><button class="btn btn-ghost btn-sm" type="button" data-remove="' + index + '">' + t('移除') + '</button></li>').join('');
      disable();
    }
    function progressRows() {
      return (judging.judges || []).map(user => '<tr><td>' + esc(user.displayName || user.username) + ' · UID ' + esc(user.uid) + '</td><td>' + esc(user.scoredCount || 0) + ' / ' + esc(judging.totalWorks || 0) + '</td><td>' + esc(user.submittedAt ? J.beijingTime(user.submittedAt) : QSL.t('未标记完成')) + '</td></tr>').join('');
    }
    function draw() {
      const frozen = !!judging.frozenAt;
      selected = (judging.judges || []).map(user => ({ ...user, id: user.userId }));
      body.innerHTML = '<p class="a-contest-voting-status">' + t(frozen ? '评审配置已固定' : '评审尚未开始') + ' · ' + esc(QSL.t('材料版本：{version} · 共 {n} 件作品', { version: judging.materialVersion || '—', n: judging.totalWorks || 0 })) + '</p>' +
        '<p class="muted">' + esc(QSL.t('截止时间（北京时间）：{time}', { time: J.beijingTime(judging.deadline) })) + '</p><div data-config>' +
        '<label>' + t('截止时间（北京时间 UTC+08:00）') + '<input class="input" type="datetime-local" step="1" data-deadline value="' + esc(J.beijingInput(judging.deadline)) + '"></label>' +
        '<form data-user-search class="a-judging-search"><label>' + t('搜索评委用户名或 UID') + '<input class="input" name="q" type="search" autocomplete="off"></label><button class="btn btn-ghost" type="submit">' + t('搜索用户') + '</button></form>' +
        '<div data-user-results aria-live="polite"></div><ol class="a-judging-selected" data-selected></ol><button class="btn btn-primary" type="button" data-save-config>' + t('保存评审配置') + '</button></div>' +
        '<p class="a-hint-error" role="alert" data-admin-error></p><div class="a-announcement-actions"><button class="btn btn-primary" type="button" data-start>' + t('开始并固定评审') + '</button><button class="btn btn-ghost" type="button" data-reload>' + t('刷新评审配置与进度') + '</button></div>' +
        '<h3>' + t('评委完成进度') + '</h3><div class="a-judging-table"><table><thead><tr><th>' + t('评委') + '</th><th>' + t('已保存作品') + '</th><th>' + t('完成标记') + '</th></tr></thead><tbody data-progress-rows>' + progressRows() + '</tbody></table></div>' +
        '<div data-results><p class="muted">' + t(judging.canViewResults ? '结果可在截止后手动加载；不包含 AI 评分、投票分或最终排名。' : '截止前不显示任何评委分数或评语。') + '</p>' + (judging.canViewResults ? '<button class="btn btn-ghost" type="button" data-results-load>' + t('加载人工评审结果') + '</button>' : '') + '</div>' +
        '<div class="a-announcement-actions"><button class="btn btn-ghost" type="button" data-download="scores">' + t('下载人工评分 XLSX') + '</button></div>' +
        '<h3>' + t('下载固定版评审材料 ZIP') + '</h3><p class="muted">' + t('每批最多 20 件作品，压缩包总计不超过 64 MiB，单张图片不超过 10 MiB。仅手动下载，不自动发送到任何第三方。') + '</p>' +
        '<p class="a-judging-notice">' + t('外发授权提示：材料含用户作品。下载不代表获得向 AI 或其他第三方外发、上传或再授权的许可；请先取得作者授权并核对平台条款。压缩包默认附带此提示。') + '</p>' +
        '<div class="a-judging-range"><label>' + t('起始作品编号') + '<input class="input" type="number" min="1" step="1" data-from value="1"></label><label>' + t('结束作品编号') + '<input class="input" type="number" min="1" step="1" data-to value="20"></label><button class="btn btn-ghost" type="button" data-download="materials">' + t('下载此范围材料 ZIP') + '</button></div>';
      drawSelected();
    }
    async function load(quiet) {
      if (!live() || busy || loading) return;
      loading = true; disable();
      try {
        const data = await QSL.api.get(API, { signal: resources.signal, cache: 'no-store' });
        if (!live()) return;
        // Poll progress without overwriting a pre-start configuration draft.
        if (quiet && judging && !judging.frozenAt && !data.judging.frozenAt) {
          if (data.judging.revision !== judging.revision) { stale = true; error(new Error(QSL.t('评审配置已变化，请刷新后重新操作。'))); }
        } else if (quiet && judging && judging.frozenAt && data.judging.frozenAt && judging.canViewResults === data.judging.canViewResults) {
          judging = data.judging;
          body.querySelector('[data-progress-rows]').innerHTML = progressRows();
        } else {
          const from = body.querySelector('[data-from]');
          const to = body.querySelector('[data-to]');
          const range = from && to ? [from.value, to.value] : null;
          judging = data.judging; stale = false; draw();
          if (range) { body.querySelector('[data-from]').value = range[0]; body.querySelector('[data-to]').value = range[1]; }
        }
      } catch (err) {
        if (!live() || err.name === 'AbortError') return;
        stale = true;
        if (err.status === 401 || err.status === 403) {
          judging = null; selected = []; searchJob++;
          body.innerHTML = '<p role="alert">' + esc(err.message) + '</p><button type="button" class="btn btn-ghost" data-reload>' + t('重新加载') + '</button>';
        } else if (body.querySelector('[data-admin-error]')) error(err);
        else { body.innerHTML = '<p role="alert">' + esc(err.message) + '</p><button type="button" class="btn btn-ghost" data-reload>' + t('重新加载') + '</button>'; }
      } finally { loading = false; disable(); }
    }
    root.addEventListener('input', event => { if (event.target.matches('[data-deadline]')) disable(); }, { signal: resources.signal });
    root.addEventListener('submit', async event => {
      if (!event.target.matches('[data-user-search]')) return;
      event.preventDefault();
      if (!live() || busy || stale || judging.frozenAt) return;
      const q = event.target.elements.q.value.trim();
      const results = body.querySelector('[data-user-results]');
      if (!q) { results.textContent = QSL.t('请输入用户名或 UID'); return; }
      const job = ++searchJob;
      results.textContent = QSL.t('加载中…');
      try {
        const data = await QSL.api.admin.users({ q, role: 'user', status: 'active', limit: 20, page: 1 });
        if (!live() || job !== searchJob || judging.frozenAt) return;
        const users = (data.items || data.users || []).filter(user => user.role === 'user' && user.status === 'active');
        results.innerHTML = users.length ? users.map((user, index) => '<button type="button" class="btn btn-ghost" data-add-user="' + index + '">' + esc(user.displayName || user.username) + ' @' + esc(user.username) + ' · UID ' + esc(user.uid) + '</button>').join('') : '<p>' + t('没有匹配的正常普通用户') + '</p>';
        results.querySelectorAll('[data-add-user]').forEach(button => button.addEventListener('click', () => {
          if (!live() || judging.frozenAt || busy || stale) return;
          const user = users[Number(button.dataset.addUser)];
          if (selected.length >= 5 || selected.some(item => item.id === user.id)) { error(new Error(QSL.t('请选择 5 位不重复的正常普通用户'))); return; }
          selected.push(user); drawSelected();
        }, { signal: resources.signal }));
      } catch (err) { if (live() && job === searchJob) error(err); }
    }, { signal: resources.signal });
    root.addEventListener('click', async event => {
      const button = event.target.closest('button');
      if (!button || button.disabled || !live()) return;
      if (button.hasAttribute('data-reload')) { load(false); return; }
      if (!judging) return;
      if (button.hasAttribute('data-remove')) { selected.splice(Number(button.dataset.remove), 1); drawSelected(); return; }
      if (button.hasAttribute('data-save-config') || button.hasAttribute('data-start')) {
        if (busy || loading || stale || judging.frozenAt) return;
        const starting = button.hasAttribute('data-start');
        if (starting && configDirty()) { error(new Error(QSL.t('请先保存当前评审配置，再开始评审。'))); return; }
        let payload = { expectedRevision: judging.revision };
        if (!starting) {
          const raw = body.querySelector('[data-deadline]').value;
          const deadline = new Date(raw + '+08:00');
          if (selected.length !== 5 || new Set(selected.map(user => user.id)).size !== 5 || !Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()) { error(new Error(QSL.t('请选择 5 位不重复的正常普通用户，并填写未来的北京时间截止时间。'))); return; }
          payload = { ...payload, deadline: deadline.toISOString(), judgeUserIds: selected.map(user => user.id) };
        }
        busy = true; disable();
        if (starting) {
          const yes = await QSL.confirm({ title: QSL.t('开始并固定评审'), message: QSL.t('开始将固定已保存的 5 位评委、截止时间及当前审核通过作品材料。此操作不可修改，请确认已保存配置且材料完整。'), confirmText: QSL.t('确认开始并固定') });
          if (!live()) return;
          if (!yes) { busy = false; disable(); return; }
        }
        try {
          const data = starting ? await QSL.api.post(API + '/start', payload, { signal: resources.signal }) : await QSL.api.put(API, payload, { signal: resources.signal });
          if (live()) { judging = data.judging; stale = false; draw(); }
        } catch (err) { if (live() && err.name !== 'AbortError') { stale = err.status === 409; error(err); } }
        finally { busy = false; disable(); }
      } else if (button.hasAttribute('data-results-load')) {
        if (!judging.canViewResults || busy) return;
        busy = true; button.disabled = true; disable();
        try {
          const data = await QSL.api.get(API + '/results', { signal: resources.signal, cache: 'no-store' });
          if (!live()) return;
          const judges = data.judges || [];
          body.querySelector('[data-results]').innerHTML = '<h3>' + t('人工评审结果（非最终排名）') + '</h3><p class="muted">' + t('人工分：截止后按五位评委已保存评分，去掉一个最高分和一个最低分，余下三项平均后乘 5；缺项不计算。完成标记为可选，不影响汇总。') + '</p><div class="a-judging-table"><table><thead><tr><th>' + t('作品') + '</th>' + judges.map(judge => '<th>' + esc(QSL.t('评委 {n}', { n: judge.slot })) + '</th>').join('') + '<th>' + t('人工分 / 50') + '</th></tr></thead><tbody>' + (data.items || []).map(item => '<tr><td>#' + esc(item.number) + ' ' + esc(item.title) + '</td>' + judges.map(judge => {
            const score = (item.scores || []).find(value => value.slot === judge.slot);
            return '<td>' + (score && score.score !== null ? '<b>' + esc(score.score) + '</b><small>' + t(score.submittedAt ? '已标记完成' : '未标记完成') + '</small><p class="a-judging-comment">' + esc(score.comment || '') + '</p>' : '—') + '</td>';
          }).join('') + '<td>' + (item.complete && item.humanScore != null ? esc(item.humanScore) : t('评分未完成')) + '</td></tr>').join('') + '</tbody></table></div>';
        } catch (err) { if (live() && err.name !== 'AbortError') { error(err); button.disabled = false; } }
        finally { busy = false; disable(); }
      } else if (button.hasAttribute('data-download')) {
        if (downloading) return;
        const materials = button.dataset.download === 'materials';
        if (materials && !judging.frozenAt || !materials && !judging.canViewResults) return;
        let path = API + '/scores.xlsx', filename = 'qsl-design-2026-11-judging.xlsx';
        if (materials) {
          const from = Number(body.querySelector('[data-from]').value), to = Number(body.querySelector('[data-to]').value);
          if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 1 || to < from || to - from >= 20) { error(new Error(QSL.t('请输入有效编号范围，每批最多 20 件作品。'))); return; }
          path = API + '/materials.zip?' + new URLSearchParams({ from, to }); filename = 'qsl-design-2026-11-materials-' + from + '-' + to + '.zip';
        }
        downloading = true; disable();
        try { await resources.download(path, filename, materials ? 'application/zip' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); }
        catch (err) { if (live() && err.name !== 'AbortError') error(err); }
        finally { downloading = false; disable(); }
      }
    }, { signal: resources.signal });
    const poll = setInterval(() => load(true), 30000);
    load(false);
    return () => { alive = false; searchJob++; clearInterval(poll); resources.cleanup(); judging = null; selected = []; };
  };
})();
