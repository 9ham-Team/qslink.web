// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createServicesVue3 } from '../src/services-vue3';
import type { LegacyQslVue3 } from '../src/contracts-vue3';

it('encodes public call-sign filters and forwards abort signals through the existing client — vue3', async () => {
  const get = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pages: 1 });
  const qsl = { api: { get }, setQuery: vi.fn(() => { throw Error('history unavailable'); }) } as unknown as LegacyQslVue3;
  const services = createServicesVue3(qsl);
  const signal = new AbortController().signal;
  await services.listCards({ callSign: 'BG7/P & test', sort: 'oldest' }, 2, signal);
  const [url, options] = get.mock.calls[0];
  const query = new URL(url, 'https://example.test').searchParams;
  expect(query.get('callSign')).toBe('BG7/P & test');
  expect(query.get('page')).toBe('2');
  expect(query.get('sort')).toBe('oldest');
  expect(query.get('limit')).toBe('12');
  expect(options.signal).toBe(signal);
  expect(() => services.setQuery({ sort: null })).not.toThrow();
});
