import { afterEach, expect, it } from 'vitest';
import { createExploreMemoryVue3, createExploreVisitVue3, exploreMemoryVue3, type ExploreSnapshotVue3 } from '../src/explore-memory-vue3';

function snapshot(id = 'a'): ExploreSnapshotVue3 {
  return { filters: { callSign: 'BG7', sort: 'popular' }, scrollY: 2600, anchorId: id, anchorOffset: 100,
    page: 3, pages: 5, total: 60, items: [{ id, title: 'card', ratio: { w: 3, h: 2 }, stock: null, liked: true, likeCount: 1,
      owner: { uid: '123456789', joinedAt: '', stats: { cards: 1, likesReceived: 1 } } }],
  };
}
afterEach(() => { exploreMemoryVue3.clear(); history.replaceState({}, '', '/'); });

it('isolates visits and viewers, clones values, expires old snapshots and bounds retention — vue3', () => {
  let time = 0;
  const memory = createExploreMemoryVue3(() => time);
  const value = snapshot();
  (value.items[0] as any).token = 'must-not-retain';
  (value.items[0].owner.stats as any).privateField = 'must-not-retain';
  memory.put('one', 'user', value, '/card/a');
  value.items[0].title = 'changed';
  expect(memory.get('one', 'user')?.items[0].title).toBe('card');
  expect((memory.get('one', 'user')?.items[0] as any).token).toBeUndefined();
  expect((memory.get('one', 'user')?.items[0].owner.stats as any).privateField).toBeUndefined();
  const restored = memory.get('one', 'user')!;
  restored.items[0].title = 'changed again';
  expect(memory.get('one', 'user')?.items[0].title).toBe('card');
  for (let i = 0; i < 5; i++) memory.put('visit-' + i, 'user', snapshot(String(i)), '/card/a');
  expect(memory.get('one', 'user')).toBeUndefined();
  expect(memory.get('visit-4', 'other')).toBeUndefined();
  memory.put('latest', null, snapshot(), '/card/a');
  time = 10 * 60 * 1000 + 1;
  expect(memory.get('latest', null)).toBeUndefined();
});

it('restores the exact history visit and does not share state with a fresh visit — vue3', () => {
  history.replaceState({ keep: 'original' }, '', '/explore?callSign=BG7&sort=popular');
  const ctx = { params: {}, query: new URLSearchParams('callSign=BG7&sort=popular'), navigation: 'pop' as const, fromPath: '/card/a' };
  const visit = createExploreVisitVue3(ctx, () => null);
  const state = history.state;
  expect(state.keep).toBe('original');
  expect(Object.keys(state).sort()).toEqual(['keep', 'qslExploreVisitVue3']);
  visit.save(snapshot(), '/card/a');
  expect(createExploreVisitVue3(ctx, () => null).snapshot?.page).toBe(3);
  history.replaceState({}, '', '/explore?callSign=BG7&sort=popular');
  expect(createExploreVisitVue3({ ...ctx, navigation: 'push', fromPath: '/' }, () => null).snapshot).toBeUndefined();
  history.replaceState(state, '', '/explore?sort=oldest');
  expect(createExploreVisitVue3({ ...ctx, query: new URLSearchParams('sort=oldest') }, () => null).snapshot).toBeUndefined();
});

it('restores a detail breadcrumb but respects explicit filters and account invalidation — vue3', () => {
  history.replaceState({}, '', '/explore?callSign=BG7&sort=popular');
  const visit = createExploreVisitVue3({ params: {}, query: new URLSearchParams('callSign=BG7&sort=popular') }, () => 'viewer');
  visit.save(snapshot(), '/card/a');
  history.replaceState({}, '', '/explore');
  const ctx = { params: {}, query: new URLSearchParams(), navigation: 'push' as const, fromPath: '/card/a' };
  expect(createExploreVisitVue3(ctx, () => 'viewer').snapshot?.filters.sort).toBe('popular');
  history.replaceState({}, '', '/explore?sort=oldest');
  expect(createExploreVisitVue3({ ...ctx, query: new URLSearchParams('sort=oldest') }, () => 'viewer').snapshot).toBeUndefined();
  exploreMemoryVue3.clear();
  history.replaceState({}, '', '/explore');
  expect(createExploreVisitVue3(ctx, () => 'viewer').snapshot).toBeUndefined();
});
