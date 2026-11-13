import type { CardFiltersVue3, CardPageVue3, RouteContextVue3 } from './contracts-vue3';

export interface ExploreSnapshotVue3 extends CardPageVue3 {
  filters: CardFiltersVue3;
  scrollY: number;
  anchorId?: string;
  anchorOffset: number;
}
export interface ExploreVisitVue3 {
  snapshot?: ExploreSnapshotVue3;
  save(snapshot: ExploreSnapshotVue3, destination: string): void;
}
const keyName = 'qslExploreVisitVue3';
export function filtersFromQueryVue3(query: URLSearchParams): CardFiltersVue3 {
  const sort = query.get('sort');
  return { callSign: (query.get('callSign') || '').trim(), sort: sort === 'popular' || sort === 'oldest' ? sort : 'latest' };
}
function clone(snapshot: ExploreSnapshotVue3): ExploreSnapshotVue3 {
  return {
    filters: { ...snapshot.filters }, page: snapshot.page, pages: snapshot.pages, total: snapshot.total,
    scrollY: snapshot.scrollY, anchorId: snapshot.anchorId, anchorOffset: snapshot.anchorOffset,
    // Only public presentation fields: never retain arbitrary API response data or tokens.
    items: snapshot.items.map(card => ({ id: card.id, title: card.title, frontImage: card.frontImage,
      ratio: { w: card.ratio.w, h: card.ratio.h }, stock: card.stock, liked: card.liked, likeCount: card.likeCount,
      owner: { uid: card.owner.uid, username: card.owner.username, displayName: card.owner.displayName,
        callSign: card.owner.callSign, avatarColor: card.owner.avatarColor, joinedAt: card.owner.joinedAt,
        stats: { cards: card.owner.stats?.cards || 0, likesReceived: card.owner.stats?.likesReceived || 0 } },
    })),
  };
}

export function createExploreMemoryVue3(now = Date.now) {
  const visits = new Map<string, { snapshot: ExploreSnapshotVue3; viewer: string | null; at: number }>();
  let lastDetailVisit: string | undefined;
  return {
    clear() { visits.clear(); lastDetailVisit = undefined; },
    get(key: string, viewer: string | null) {
      const saved = visits.get(key);
      if (!saved || saved.viewer !== viewer || now() - saved.at > 10 * 60 * 1000) { visits.delete(key); return undefined; }
      return clone(saved.snapshot);
    },
    fromDetail(viewer: string | null) { return lastDetailVisit ? this.get(lastDetailVisit, viewer) : undefined; },
    put(key: string, viewer: string | null, snapshot: ExploreSnapshotVue3, destination: string) {
      visits.delete(key);
      visits.set(key, { snapshot: clone(snapshot), viewer, at: now() });
      while (visits.size > 4) visits.delete(visits.keys().next().value!);
      lastDetailVisit = destination.startsWith('/card/') ? key : undefined;
    },
  };
}
export const exploreMemoryVue3 = createExploreMemoryVue3();

export function createExploreVisitVue3(ctx: RouteContextVue3, viewer: () => string | null): ExploreVisitVue3 {
  const state = history.state && typeof history.state === 'object' ? history.state : {};
  const existing = typeof state[keyName] === 'string' ? state[keyName] as string : undefined;
  const key = existing || Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16)).join('-');
  let snapshot = existing ? exploreMemoryVue3.get(existing, viewer()) : undefined;
  const filters = filtersFromQueryVue3(ctx.query);
  if (snapshot && (snapshot.filters.callSign !== filters.callSign || snapshot.filters.sort !== filters.sort)) snapshot = undefined;
  // A detail breadcrumb creates a new history entry. Restore the last gallery
  // only for that explicit return, never for a fresh visit or explicit filters.
  if (!existing && ctx.navigation === 'push' && ctx.fromPath?.startsWith('/card/') && !ctx.query.has('callSign') && !ctx.query.has('sort')) {
    snapshot = exploreMemoryVue3.fromDetail(viewer());
  }
  try { history.replaceState({ ...state, [keyName]: key }, '', location.href); } catch { /* Page remains usable without history state. */ }
  return { snapshot, save: (value, destination) => exploreMemoryVue3.put(key, viewer(), value, destination) };
}
