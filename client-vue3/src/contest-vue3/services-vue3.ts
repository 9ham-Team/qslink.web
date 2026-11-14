import { createServicesVue3 } from '../services-vue3';
import type { ContestLegacyVue3, ContestServicesVue3 } from './contracts-vue3';
export function createContestServicesVue3(qsl: ContestLegacyVue3): ContestServicesVue3 {
  return {
    ...createServicesVue3(qsl),
    get: (path, signal) => qsl.api.get(path, { signal, cache: 'no-store' }),
    put: (path, payload, signal) => qsl.api.put(path, payload, { signal }),
    post: (path, payload, signal) => qsl.api.post(path, payload, { signal }),
    currentUser: () => qsl.state.user,
    resetEdits: () => qsl.i18n.resetEdits(),
    scrollHash: () => { qsl.scrollToHash(); },
    createViewer: (root, options) => qsl.card3d.create(root, options),
    bindShare(root, card, work) {
      const button = document.createElement('button');
      button.className = 'btn btn-soft'; button.type = 'button'; button.textContent = qsl.t('分享作品');
      root.replaceChildren(button);
      const release = qsl.cardShare.bind(button, card, { contestWork: work });
      return () => { release(); root.replaceChildren(); };
    },
    async privateImage(path, signal) {
      if (!/^\/api\/contests\/qsl-design-2026-11\/judging\/materials\/[A-Za-z0-9_-]+\/(?:front|back)$/.test(path)) throw new Error(qsl.t('无效的评审资源地址'));
      const token = qsl.api.token();
      const response = await fetch(path, { signal, cache: 'no-store', credentials: 'same-origin', redirect: 'error', headers: { Accept: 'image/*', ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
      if (!response.ok) {
        if (response.status === 401 && token && qsl.api.token() === token) { qsl.api.setToken(null); qsl.setUser(null); }
        let message = qsl.t('评审资源加载失败，请刷新后重试');
        try { const body = await response.json(); if (body.error?.message) message = qsl.i18n.error(body.error.message); } catch { /* status fallback */ }
        throw Object.assign(new Error(message), { status: response.status });
      }
      return response.blob();
    },
  };
}
export function beijingTimeVue3(value: string | null) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? new Date(time + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ') + ' UTC+08:00' : '—';
}
export function validDescriptionVue3(value: string) { const size = Array.from(value.trim()).length; return size >= 1 && size <= 2000 && !value.includes('\0'); }
export function validScoreVue3(value: string, comment: string) { return /^(?:[0-9](?:\.\d)?|10(?:\.0)?)$/.test(value.trim()) && Array.from(comment).length <= 1000; }
export function votingBrowserVue3() {
  try {
    const key = 'qsl.contestVotingBrowser.v1';
    let value = localStorage.getItem(key);
    if (!/^[a-f0-9]{64}$/.test(value || '')) { value = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join(''); localStorage.setItem(key, value); }
    return value || '';
  } catch { return ''; }
}
