import { afterEach, expect, it, vi } from 'vitest';
import { beijingTimeVue3, createContestServicesVue3, validDescriptionVue3, validScoreVue3, votingBrowserVue3 } from '../src/contest-vue3/services-vue3';
import type { ContestLegacyVue3 } from '../src/contest-vue3/contracts-vue3';
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
it('preserves Unicode description/score bounds and fixed Beijing times — vue3', () => {
  expect(validDescriptionVue3('😀'.repeat(2000))).toBe(true);
  expect(validDescriptionVue3('😀'.repeat(2001))).toBe(false);
  expect(validDescriptionVue3('x\0y')).toBe(false);
  for (const value of ['0', '0.5', '10', '10.0']) expect(validScoreVue3(value, '😀'.repeat(1000))).toBe(true);
  for (const value of ['', '10.1', '0.05', '-1', 'NaN']) expect(validScoreVue3(value, '')).toBe(false);
  expect(validScoreVue3('1', '😀'.repeat(1001))).toBe(false);
  expect(beijingTimeVue3('2026-11-14T00:00:00Z')).toBe('2026-11-14 08:00:00 UTC+08:00');
});
it('uses the same browser voting identity across page mounts — vue3', () => {
  const first = votingBrowserVue3(); expect(first).toMatch(/^[a-f0-9]{64}$/); expect(votingBrowserVue3()).toBe(first);
});
it('only fetches same-origin private judging images with Bearer and abort signals — vue3', async () => {
  const qsl = { t: (s: string) => s, api: { token: () => 'test-session', setToken: vi.fn() }, setUser: vi.fn(), i18n: { error: (s: string) => s } } as unknown as ContestLegacyVue3;
  const fetcher = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['image']) }); vi.stubGlobal('fetch', fetcher);
  const services = createContestServicesVue3(qsl), signal = new AbortController().signal;
  for (const path of ['https://other.test/a', '/uploads/a.webp', '/api/admin/contests/qsl-design-2026-11/judging/materials/a/front', '/api/contests/qsl-design-2026-11/judging/materials/../front']) await expect(services.privateImage(path, signal)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  const path = '/api/contests/qsl-design-2026-11/judging/materials/qa-a/front';
  await services.privateImage(path, signal);
  expect(fetcher).toHaveBeenCalledWith(path, expect.objectContaining({ signal, cache: 'no-store', redirect: 'error', headers: { Accept: 'image/*', Authorization: 'Bearer test-session' } }));
  fetcher.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: { message: 'expired' } }) });
  await expect(services.privateImage(path, signal)).rejects.toMatchObject({ status: 401 });
  expect(qsl.api.setToken).toHaveBeenCalledWith(null); expect(qsl.setUser).toHaveBeenCalledWith(null);
});
