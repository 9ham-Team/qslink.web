import type { CardDetailVue3 } from './contracts';
export interface ShareWork { id: string; number: number; description?: string; voteCount?: number }
export interface SharingService {
  getUrl(card: Partial<CardDetailVue3>, work?: ShareWork, signal?: AbortSignal): Promise<string>;
  poster(card: Partial<CardDetailVue3>, url: string, signal: AbortSignal, work?: ShareWork): Promise<Blob>;
  qr(url: string, scale?: number): HTMLCanvasElement;
}
export function createSharing(
  api: { post<T>(path: string, data: unknown, options?: { signal?: AbortSignal }): Promise<T> },
  renderer: { poster(...args: any[]): Promise<Blob>; contestPoster(...args: any[]): Promise<Blob> },
  qr: { canvas(url: string, scale?: number): HTMLCanvasElement },
): SharingService {
  return {
    async getUrl(card, work, signal) {
      if (work) return location.origin + '/events/qsl-design-2026-11/works/' + encodeURIComponent(work.id);
      let token = card.shareToken;
      if (card.canShare !== false && !token && card.id) {
        try {
          const result = await api.post<{ url?: string; shareToken?: string }>('/api/cards/' + encodeURIComponent(card.id) + '/share', {}, { signal });
          if (result.url) return result.url;
          token = result.shareToken;
        } catch (err) { if ((err as Error).name === 'AbortError') throw err; }
      }
      return location.origin + (token ? '/s/' + encodeURIComponent(token) : '/card/' + encodeURIComponent(card.id || ''));
    },
    poster: (card, url, signal, work) => work ? renderer.contestPoster(card, work, url, signal) : renderer.poster(card, url, signal),
    qr: (url, scale) => qr.canvas(url, scale),
  };
}
