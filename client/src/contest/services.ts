import { createServicesVue3 } from '../services';
import type { ApplicationContext } from '../contracts';
import type { ContestRuntime, ContestServicesVue3 } from './contracts';
export function createContestServicesVue3(platform: ContestRuntime): ContestServicesVue3 {
  return {
    ...createServicesVue3(platform as unknown as ApplicationContext),
    get: (path, signal) => platform.api.get(path, { signal, cache: 'no-store' }),
    put: (path, payload, signal) => platform.api.put(path, payload, { signal }),
    post: (path, payload, signal) => platform.api.post(path, payload, { signal }),
    currentUser: () => platform.store.user,
    resetEdits: () => platform.i18n.resetEdits(),
    scrollHash: () => { platform.scrollToHash(); },
    createViewer: (root, options) => platform.card3d.create(root, options),
    sharing: platform.sharing,
    copyText: (url, message) => platform.copyText(url,message),
    async privateImage(path, signal) {
      if (!/^\/api\/contests\/qsl-design-2026-11\/judging\/materials\/[A-Za-z0-9_-]+\/(?:front|back)$/.test(path)) throw new Error(platform.t('无效的评审资源地址'));
      const token = platform.api.token();
      const response = await fetch(path, { signal, cache: 'no-store', credentials: 'same-origin', redirect: 'error', headers: { Accept: 'image/*', ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
      if (!response.ok) {
        if (response.status === 401 && token && platform.api.token() === token) { platform.api.setToken(null); platform.setUser(null); }
        let message = platform.t('评审资源加载失败，请刷新后重试');
        try { const body = await response.json(); if (body.error?.message) message = platform.i18n.error(body.error.message); } catch { /* status fallback */ }
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
