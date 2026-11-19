import { onBeforeUnmount } from 'vue';
import type { ApplicationContext } from '../contracts';
// A mounted module owns its requests and downloads; none may outlive its administrator session.
export function useAdmin(platform: ApplicationContext) {
  const controller = new AbortController();
  const token = platform.api.token?.(), userId = platform.store.user?.id;
  let active = true;
  const live = () => active && !controller.signal.aborted && platform.api.token?.() === token &&
    platform.store.user?.id === userId && platform.store.user?.role === 'admin';
  const options = { signal: controller.signal };
  const ensure = () => { if (!live()) throw new DOMException('Session changed', 'AbortError'); };
  async function guarded<T>(request: () => Promise<T>): Promise<T> {
    ensure(); const result = await request(); ensure(); return result;
  }
  const urls = new Set<string>(), timers = new Set<ReturnType<typeof setTimeout>>();
  function clearDownloads() {
    timers.forEach(clearTimeout); urls.forEach(url => URL.revokeObjectURL(url)); timers.clear(); urls.clear();
  }
  const off = platform.on('auth', () => { if (!live()) { controller.abort(); clearDownloads(); } });
  onBeforeUnmount(() => { active = false; controller.abort(); off(); clearDownloads(); });
  return {
    live,
    get: <T>(path: string) => guarded(() => platform.api.get<T>(path, { ...options, cache: 'no-store' })),
    put: <T>(path: string, body: unknown) => guarded(() => platform.api.put<T>(path, body, options)),
    post: <T>(path: string, body: unknown) => guarded(() => platform.api.post<T>(path, body, options)),
    del: <T>(path: string) => guarded(() => {
      if (!platform.api.del) throw new Error('DELETE API unavailable');
      return platform.api.del<T>(path, options);
    }),
    async download(path: string, filename: string, accept: string, retainLink = false) {
      ensure();
      const request = new AbortController();
      const abort = () => request.abort();
      controller.signal.addEventListener('abort', abort, { once: true });
      let timedOut = false;
      const deadline = setTimeout(() => { timedOut = true; abort(); }, 120_000);
      try {
        const response = await fetch(path, { signal: request.signal, cache: 'no-store', credentials: 'same-origin', redirect: 'error',
          headers: { Accept: accept, ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
        ensure();
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          ensure();
          if (timedOut) throw new Error(platform.t('下载超时，请重试。'));
          if (response.status === 401) {
            platform.api.setToken?.(null); platform.setUser?.(null);
            platform.toast(platform.t('登录已过期，请重新登录'), 'error');
          }
          const error = data?.error;
          if (error?.code === 'MATERIALS_EXPORT_PENDING' && typeof error.fields?.reason === 'string') {
            const message = Number.isSafeInteger(error.fields.number)
              ? '无法导出完整材料包：作品 #{number} 同步失败（{reason}）。请处理后重试，或缩小下载范围。'
              : '无法导出完整材料包：{reason}。请处理后重试，或缩小下载范围。';
            throw new Error(platform.t(message, {
              number: error.fields.number, reason: platform.t(error.fields.reason),
            }));
          }
          throw new Error(platform.t(error?.message || '下载失败，请稍后重试'));
        }
        const type = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
        if (type !== accept) throw new Error(platform.t('服务器没有返回下载文件，请稍后重试。'));
        const blob = await response.blob();
        ensure();
        if (!blob.size) throw new Error(platform.t('服务器没有返回下载文件，请稍后重试。'));
        const url = URL.createObjectURL(blob);
        urls.add(url);
        const release = () => { if (urls.delete(url)) URL.revokeObjectURL(url); };
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.append(link);
        try { link.click(); }
        finally { link.remove(); }
        if (retainLink) return { url, filename, release };
        const timer = setTimeout(() => { release(); timers.delete(timer); }, 1000);
        timers.add(timer);
      } catch (err) {
        if (timedOut && live()) throw new Error(platform.t('下载超时，请重试。'));
        throw err;
      } finally {
        clearTimeout(deadline);
        controller.signal.removeEventListener('abort', abort);
      }
    },
  };
}
