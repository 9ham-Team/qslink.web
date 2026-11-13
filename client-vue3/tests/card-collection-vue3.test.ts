import { afterEach, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { useCardCollectionVue3 } from '../src/composables/use-card-collection-vue3';
import type { CardPageVue3, CardVue3 } from '../src/contracts-vue3';

let wrapper: VueWrapper;
afterEach(() => wrapper?.unmount());
const result = (ids: string[], page = 1): CardPageVue3 => ({ items: ids.map(id => ({ id, liked: false, likeCount: 0 }) as CardVue3), total: 24, page, pages: 2 });
function setup(fetch = vi.fn()) {
  let collection!: ReturnType<typeof useCardCollectionVue3<CardPageVue3>>;
  const onError = vi.fn();
  const onSuccess = vi.fn();
  wrapper = mount(defineComponent({ setup() {
    collection = useCardCollectionVue3({ fetch, pageOf: value => value, onError, onSuccess });
    return () => h('div');
  } }));
  return { collection, fetch, onError, onSuccess };
}

it('retries the same append page after failure, advances only on success, and deduplicates — vue3', async () => {
  const { collection: c, fetch } = setup(vi.fn().mockResolvedValueOnce(result(['a']))
    .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(result(['a', 'b'], 2)));
  await c.load(true);
  await c.load();
  expect(c.page.value).toBe(1);
  expect(c.items.value.map(item => item.id)).toEqual(['a']);
  await c.load();
  expect(fetch.mock.calls.map(call => call[0])).toEqual([1, 2, 2]);
  expect(c.items.value.map(item => item.id)).toEqual(['a', 'b']);
  expect(c.hasMore.value).toBe(false);
});

it('keeps old results after reset failure and retries page one rather than appending — vue3', async () => {
  const { collection: c, fetch } = setup(vi.fn().mockResolvedValueOnce(result(['a']))
    .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(result(['b'])));
  await c.load(true); await c.load(true);
  expect(c.items.value[0].id).toBe('a');
  await c.load();
  expect(fetch.mock.calls.map(call => call[0])).toEqual([1, 1, 1]);
  expect(c.items.value.map(item => item.id)).toEqual(['b']);
});

it('supersedes an in-flight request and ignores its late completion — vue3', async () => {
  let resolveOld!: (value: CardPageVue3) => void;
  const { collection: c, fetch, onSuccess } = setup(vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValueOnce(result(['new'])));
  const old = c.load(true);
  const signal = fetch.mock.calls[0][1];
  await c.load(true);
  resolveOld(result(['old'])); await old;
  expect(signal.aborted).toBe(true);
  expect(c.items.value[0].id).toBe('new');
  expect(onSuccess).toHaveBeenCalledOnce();
});

it('clears account-dependent items and discards late errors on clear or unmount — vue3', async () => {
  let reject!: (error: Error) => void;
  const { collection: c, fetch, onError } = setup(vi.fn().mockResolvedValueOnce(result(['a']))
    .mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; })));
  await c.load(true);
  c.liked('a', { liked: true, likeCount: 1 });
  expect(c.items.value[0].liked).toBe(true);
  const pending = c.load();
  c.clear(); wrapper.unmount();
  reject(new Error('late')); await pending;
  expect(fetch.mock.calls[1][1].aborted).toBe(true);
  expect(c.items.value).toEqual([]);
  expect(c.loaded.value).toBe(false);
  expect(onError).not.toHaveBeenCalled();
});

it('prevents duplicate load-more submissions while a request is pending — vue3', async () => {
  let resolve!: (value: CardPageVue3) => void;
  const { collection: c, fetch } = setup(vi.fn().mockImplementation(() => new Promise(done => { resolve = done; })));
  const pending = c.load(true);
  await c.load(); await c.load();
  expect(fetch).toHaveBeenCalledOnce();
  resolve(result(['a'])); await pending;
});
