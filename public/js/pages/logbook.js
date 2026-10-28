(function () {
  'use strict';
  const QSL = window.QSL;
  const esc = QSL.escapeHtml;
  QSL.registerPage('logbook', { title: '通联日志', render(container) {
    let disposed = false, sequence = 0, page = 1, query = '', busy = false;
    const events = new AbortController();
    container.innerHTML = '<section class="container section f-logbook">' +
      QSL.pageHeader({ eyebrow: 'MY LOGBOOK', title: '通联日志', desc: '把每一次电波相遇，收进自己的日志。日志仅本人可见，时间统一为 UTC。' }) +
      '<p class="hint">' + (QSL.state.user.callSign && QSL.state.user.callSign.trim() ? '当前呼号：<strong>' + esc(QSL.state.user.callSign.trim().toUpperCase()) + '</strong>。日志每条记录的 STATION_CALLSIGN（本站呼号）必须与个人资料一致，否则整批拒绝。' : '请先<a href="/dashboard/profile" data-link>在个人资料中设置呼号</a>，才能导入通联日志。') + '</p>' +
      '<div class="f-logbook-imports">' +
      '<form class="surface f-logbook-panel" data-adif><h2>导入 ADIF 文件</h2><p class="muted">支持 .adi / .adif 文本文件，每次最多 5MB、10000 条。重复通联会自动合并。</p>' +
      '<label class="field"><span class="label">选择文件</span><input class="input" name="file" type="file" accept=".adi,.adif" required><span class="hint f-logbook-error" data-field-error="adif"></span></label>' +
      '<p class="hint">需包含本站呼号 STATION_CALLSIGN、对方呼号、日期、时间、波段和模式。请使用 UTF-8 编码；不支持 ADX XML。</p>' +
      '<button class="btn btn-primary" type="submit">导入文件</button></form>' +
      '<form class="surface f-logbook-panel" data-lotw><h2>从 LoTW 导入</h2><p class="muted">使用 ARRL LoTW 账号，一次性下载已上传的通联与确认状态。</p>' +
      '<label class="field"><span class="label">LoTW 用户名</span><input class="input" name="username" autocomplete="off" maxlength="80" required><span class="hint f-logbook-error" data-field-error="username"></span></label>' +
      '<label class="field"><span class="label">LoTW 网站登录密码</span><input class="input" name="password" type="password" autocomplete="off" maxlength="256" required><span class="hint f-logbook-error" data-field-error="password"></span></label>' +
      '<p class="hint">点击即通过本站服务器向 ARRL 请求日志；密码仅本次使用，不保存。不是 TQSL 证书密码。每分钟可导入一次。</p>' +
      '<button class="btn btn-soft" type="submit">从 LoTW 导入</button><p class="hint" data-https hidden>为保护 LoTW 密码，请通过 HTTPS 访问本站后导入。</p></form></div>' +
      '<div class="surface f-logbook-panel f-logbook-result" data-result role="status" hidden></div>' +
      '<div class="surface f-logbook-panel"><div class="row between wrap"><h2>我的通联 <small class="muted" data-stats></small></h2>' +
      '<form class="row wrap" data-search><label><input class="input" name="q" placeholder="搜索对方呼号" maxlength="32" aria-label="搜索对方呼号"></label><button class="btn btn-ghost" type="submit">搜索</button></form></div>' +
      '<div data-list></div><div class="row between f-logbook-pages"><button class="btn btn-ghost" data-prev>上一页</button><span data-page></span><button class="btn btn-ghost" data-next>下一页</button></div></div></section>';
    const root = container.querySelector('.f-logbook');
    const list = root.querySelector('[data-list]');
    const prev = root.querySelector('[data-prev]'), next = root.querySelector('[data-next]');
    const lotw = root.querySelector('[data-lotw]');
    const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    if (!secure) {
      lotw.querySelector('[data-https]').hidden = false;
      lotw.querySelectorAll('input, button').forEach(el => { el.disabled = true; });
    }
    function on(el, name, fn) { el.addEventListener(name, fn, { signal: events.signal }); }
    async function load() {
      const request = ++sequence;
      prev.disabled = next.disabled = true;
      QSL.loading(list, '正在加载通联日志…');
      try {
        const data = await QSL.api.get('/api/me/logbook?' + new URLSearchParams({ page, q: query }));
        if (disposed || request !== sequence) return;
        root.querySelector('[data-stats]').textContent = data.stats.total + ' 条 · LoTW 已确认 ' + data.stats.confirmed + ' 条';
        root.querySelector('[data-page]').textContent = '第 ' + page + ' / ' + Math.max(1, data.pages) + ' 页 · ' + data.total + ' 条';
        list.innerHTML = data.items.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>UTC 时间</th><th>对方呼号</th><th>本站呼号</th><th>波段 / 模式</th><th>频率 MHz</th><th>RST 发 / 收</th><th>LoTW</th><th>来源</th></tr></thead><tbody>' + data.items.map(row => '<tr><td>' + esc(row.qsoAt.replace('T', ' ').slice(0,19)) + '</td><td><strong>' + esc(row.callSign) + '</strong></td><td>' + esc(row.stationCallSign || '—') + '</td><td>' + esc(row.band + ' / ' + (row.submode || row.mode)) + '</td><td>' + esc(row.frequency || '—') + '</td><td>' + esc((row.rstSent || '—') + ' / ' + (row.rstReceived || '—')) + '</td><td>' + (row.lotwConfirmed ? QSL.badge('已确认', 'mint') : '<span class="muted">未确认</span>') + '</td><td>' + (row.source === 'lotw' ? 'LoTW' : 'ADIF') + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="empty-state"><h3>' + (query ? '没有匹配的通联' : '还没有通联日志') + '</h3><p>通过上方的 ADIF 文件或 LoTW 导入通联记录。</p></div>';
        prev.disabled = page <= 1; next.disabled = page >= data.pages;
      } catch (err) {
        if (disposed || request !== sequence) return;
        QSL.toast(err.message, 'error');
        list.innerHTML = '<div class="empty-state"><p>日志加载失败</p><button class="btn btn-ghost" data-retry>重试</button></div>';
        on(list.querySelector('[data-retry]'), 'click', load);
      }
    }
    function showResult(data) {
      const result = root.querySelector('[data-result]');
      result.hidden = false;
      result.innerHTML = '<b>导入完成</b><p>新增 ' + data.added + ' 条，更新 ' + data.updated + ' 条，重复 ' + data.duplicates + ' 条，跳过 ' + data.skipped + ' 条。</p>' +
        (data.issues.length ? '<ul>' + data.issues.map(issue => '<li>第 ' + issue.record + ' 条：' + esc(issue.message) + '</li>').join('') + '</ul><p class="hint">最多显示前 10 条问题。</p>' : '');
    }
    async function submit(form, path, getBody) {
      if (busy) return;
      busy = true;
      root.querySelectorAll('[data-field-error]').forEach(el => { el.textContent = ''; });
      root.querySelector('[data-result]').hidden = true;
      root.querySelectorAll('form button[type="submit"]').forEach(el => { el.disabled = true; });
      const button = form.querySelector('button[type="submit"]'), label = button.textContent;
      button.textContent = '正在导入…';
      try {
        const body = await getBody();
        if (disposed) return;
        const data = await QSL.api.post(path, body);
        if (disposed) return;
        showResult(data); page = 1; await load();
      } catch (err) {
        if (disposed) return;
        const message = err.fields ? Object.values(err.fields).join('；') : err.message;
        const result = root.querySelector('[data-result]'); result.hidden = false; result.textContent = message;
        form.querySelectorAll('[data-field-error]').forEach(el => { el.textContent = err.fields && err.fields[el.dataset.fieldError] || ''; });
        QSL.toast(message, 'error');
      } finally {
        lotw.elements.password.value = '';
        busy = false;
        if (!disposed) {
          button.textContent = label;
          root.querySelectorAll('form button[type="submit"]').forEach(el => { el.disabled = false; });
          if (!secure) lotw.querySelector('button').disabled = true;
        }
      }
    }
    const adif = root.querySelector('[data-adif]');
    on(adif, 'submit', event => {
      event.preventDefault();
      submit(adif, '/api/me/logbook/import', async () => {
        const file = adif.elements.file.files[0];
        if (!file || !/\.(adi|adif)$/i.test(file.name)) throw new Error('请选择 .adi 或 .adif 文件');
        if (file.size > 5 * 1024 * 1024) throw new Error('文件不能超过 5MB');
        const bytes = await file.arrayBuffer();
        try { return { adif: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }; }
        catch { throw new Error('无法读取 UTF-8 文件，请从日志软件重新导出 ADIF'); }
      });
    });
    on(lotw, 'submit', event => {
      event.preventDefault();
      if (!secure) return;
      submit(lotw, '/api/me/logbook/lotw', () => {
        const body = { username: lotw.elements.username.value, password: lotw.elements.password.value };
        lotw.elements.password.value = '';
        return body;
      });
    });
    on(root.querySelector('[data-search]'), 'submit', event => { event.preventDefault(); if (busy) return; query = event.target.elements.q.value.trim(); page = 1; load(); });
    on(prev, 'click', () => { page--; load(); });
    on(next, 'click', () => { page++; load(); });
    load();
    return () => { disposed = true; sequence++; events.abort(); lotw.elements.password.value = ''; };
  } });
})();
