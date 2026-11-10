/* Shared, same-origin authenticated judging resources. No credentials in URLs. */
(function () {
  'use strict';
  const QSL = window.QSL;
  function beijingInput(iso) {
    const time = Date.parse(iso);
    return Number.isFinite(time) ? new Date(time + 8 * 3600000).toISOString().slice(0, 19) : '';
  }
  function beijingTime(iso) {
    const value = beijingInput(iso);
    return value ? value.replace('T', ' ') + ' UTC+08:00' : '—';
  }
  function validScore(value, comment) {
    const raw = String(value).trim();
    return /^(?:[0-9](?:\.\d)?|10(?:\.0)?)$/.test(raw) && Array.from(comment || '').length <= 1000;
  }
  function scope() {
    const controller = new AbortController();
    const urls = new Set();
    const timers = new Set();
    let alive = true;
    async function binary(path, accept) {
      if (!/^\/api\/(?:admin\/)?contests\/qsl-design-2026-11\/judging\//.test(path) || path.includes('..') || path.includes('#')) {
        throw new Error(QSL.t('无效的评审资源地址'));
      }
      const token = QSL.api.token();
      const response = await fetch(path, { signal: controller.signal, cache: 'no-store', credentials: 'same-origin', redirect: 'error',
        headers: { Accept: accept || 'image/*', ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
      if (!response.ok) {
        let data;
        try { data = await response.json(); } catch (_) { /* status fallback */ }
        if (response.status === 401 && token && QSL.api.token() === token) {
          QSL.api.setToken(null);
          QSL.setUser(null);
        }
        throw new QSL.ApiError(data && data.error && data.error.message ? QSL.i18n.error(data.error.message) : QSL.t('评审资源加载失败，请刷新后重试'), { status: response.status });
      }
      const blob = await response.blob();
      if (!alive) return null;
      const url = URL.createObjectURL(blob);
      urls.add(url);
      return url;
    }
    function revoke(url) { if (url && urls.delete(url)) URL.revokeObjectURL(url); }
    async function download(path, filename, accept) {
      const url = await binary(path, accept);
      if (!url || !alive) return;
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      const timer = setTimeout(() => { timers.delete(timer); revoke(url); }, 1000);
      timers.add(timer);
    }
    return { binary, download, revoke, signal: controller.signal,
      cleanup() { alive = false; controller.abort(); timers.forEach(clearTimeout); timers.clear(); urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); } };
  }
  QSL.contestJudging = { beijingInput, beijingTime, validScore, scope };
})();
