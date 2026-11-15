import { onBeforeUnmount } from 'vue';
import type { LegacyQslVue3 } from '../contracts';
// A mounted module owns its requests and downloads; none may outlive its administrator session.
export function useAdmin(qsl: LegacyQslVue3) {
  const controller = new AbortController();
  const token = qsl.api.token?.(), userId = qsl.state.user?.id;
  let active = true;
  const live = () => active && !controller.signal.aborted && qsl.api.token?.() === token &&
    qsl.state.user?.id === userId && qsl.state.user?.role === 'admin';
  const off = qsl.on('auth', () => { if (!live()) controller.abort(); });
  const options = { signal: controller.signal };
  const ensure = () => { if (!live()) throw new DOMException('Session changed', 'AbortError'); };
  async function guarded<T>(request: () => Promise<T>): Promise<T> {
    ensure(); const result = await request(); ensure(); return result;
  }
  const urls = new Set<string>(), timers = new Set<ReturnType<typeof setTimeout>>();
  onBeforeUnmount(() => {
    active = false; controller.abort(); off();
    timers.forEach(clearTimeout); urls.forEach(url => URL.revokeObjectURL(url)); timers.clear(); urls.clear();
  });
  return {
    live,
    get: <T>(path: string) => guarded(() => qsl.api.get<T>(path, { ...options, cache: 'no-store' })),
    put: <T>(path: string, body: unknown) => guarded(() => qsl.api.put<T>(path, body, options)),
    post: <T>(path: string, body: unknown) => guarded(() => qsl.api.post<T>(path, body, options)),
    del: <T>(path: string) => guarded(() => {
      if (!qsl.api.del) throw new Error('DELETE API unavailable');
      return qsl.api.del<T>(path, options);
    }),
    async download(path: string, filename: string, accept: string) {
      ensure();
      const response = await fetch(path, { signal: controller.signal, cache: 'no-store', credentials: 'same-origin', redirect: 'error',
        headers: { Accept: accept, ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
      ensure();
      if (!response.ok) {
        const data = await response.json().catch(() => null); ensure();
        if (response.status === 401) {
          qsl.api.setToken?.(null); qsl.setUser?.(null);
          qsl.toast(qsl.t('登录已过期，请重新登录'), 'error');
        }
        throw new Error(qsl.t(data?.error?.message || '下载失败，请稍后重试'));
      }
      const blob = await response.blob(); ensure();
      const url = URL.createObjectURL(blob); urls.add(url);
      const link = document.createElement('a'); link.href = url; link.download = filename;
      document.body.append(link); link.click(); link.remove();
      const timer = setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); timers.delete(timer); }, 1000);
      timers.add(timer);
    },
  };
}
