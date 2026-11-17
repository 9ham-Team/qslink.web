// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createAccountServicesVue3, createCardDetailServicesVue3, createExchangeRequestServicesVue3, createServicesVue3 } from '../src/services';
import type { CardDetailVue3, ApplicationContext } from '../src/contracts';

it('encodes public call-sign filters and forwards abort signals through the existing client — vue3', async () => {
  const get = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pages: 1 });
  const platform = { api: { get }, setQuery: vi.fn(() => { throw Error('history unavailable'); }) } as unknown as ApplicationContext;
  const services = createServicesVue3(platform);
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

it('forwards abort signals and preserves case-sensitive share tokens in card detail services — vue3', async () => {
  const get = vi.fn().mockResolvedValue({ card: { id: 'c1' } });
  const bind = vi.fn(() => () => {});
  const close = vi.fn();
  const open = vi.fn(() => ({ close }));
  const platform = {
    api: { get },
    cardShare: { bind },
    exchangeRequest: { open },
    store: { user: null },
    on: vi.fn(() => () => {}),
  } as unknown as ApplicationContext;
  const services = createCardDetailServicesVue3(platform);
  const signal = new AbortController().signal;

  await services.getCardDetail('c/1', signal);
  expect(get).toHaveBeenNthCalledWith(1, '/api/cards/c%2F1', { signal });

  await services.getPublicCard('AbCdEf', signal);
  expect(get).toHaveBeenNthCalledWith(2, '/api/public/cards/AbCdEf', { signal });

  const handle = services.openExchange({ id: 'c1' } as CardDetailVue3);
  handle?.close();
  expect(close).toHaveBeenCalledTimes(1);
});

it('updatePassword distinguishes INVALID_CREDENTIALS 401, real session 401, and late 401 after token change — vue3', async () => {
  let token: string | null = 'tok-1';
  const setToken = vi.fn((next: string | null) => { token = next; });
  const setUser = vi.fn();
  const toast = vi.fn();
  let mode: 'invalid' | 'expired' | 'late' = 'invalid';
  let rejectLate!: (err: unknown) => void;

  const put = vi.fn(() => {
    if (mode === 'invalid') {
      return Promise.reject(Object.assign(new Error('当前密码不正确'), { status: 401, code: 'INVALID_CREDENTIALS' }));
    }
    if (mode === 'expired') {
      return Promise.reject(Object.assign(new Error('请先登录后再操作'), { status: 401, code: 'UNAUTHORIZED' }));
    }
    return new Promise((_, rej) => { rejectLate = rej; });
  });

  const platform = {
    t: (s: string) => s,
    api: { put, token: () => token, setToken },
    setUser,
    toast,
    store: { user: null },
    on: vi.fn(() => () => {}),
  } as unknown as ApplicationContext;

  const services = createAccountServicesVue3(platform);
  const signal = new AbortController().signal;

  // 1. INVALID_CREDENTIALS 401 preserves token and user
  await expect(services.updatePassword({ currentPassword: 'bad', newPassword: 'NewPass123' }, signal)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  expect(setToken).not.toHaveBeenCalled();
  expect(setUser).not.toHaveBeenCalled();

  // 2. Real session expiration 401 clears token and user
  mode = 'expired';
  await expect(services.updatePassword({ currentPassword: 'old', newPassword: 'NewPass123' }, signal)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(setToken).toHaveBeenCalledWith(null);
  expect(setUser).toHaveBeenCalledWith(null);
  expect(toast).toHaveBeenCalledWith('登录已过期，请重新登录', 'error');

  // 3. Late 401 after token changed to tok-2 does NOT clear tok-2
  setToken.mockClear();
  setUser.mockClear();
  token = 'tok-1';
  mode = 'late';
  const pending = services.updatePassword({ currentPassword: 'old', newPassword: 'NewPass123' }, signal);
  token = 'tok-2';
  rejectLate(Object.assign(new Error('请先登录后再操作'), { status: 401, code: 'UNAUTHORIZED' }));
  await expect(pending).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(setToken).not.toHaveBeenCalled();
  expect(setUser).not.toHaveBeenCalled();
});

it('updateProfileAddress aborts on auth switch, protects new session from late 401, and clears active expired session — vue3', async () => {
  let token: string | null = 'tok-1';
  let user: { id: string } | null = { id: 'u1' };
  const authHandlers = new Set<(u: unknown) => void>();
  const setToken = vi.fn((next: string | null) => { token = next; });
  const setUser = vi.fn((next: { id: string } | null) => {
    user = next;
    authHandlers.forEach(fn => fn(next));
  });
  const toast = vi.fn();
  const capturedSignals: AbortSignal[] = [];
  let rejectPending!: (err: unknown) => void;

  const put = vi.fn((_path: string, _body: unknown, opts?: { signal?: AbortSignal; skipAuthClear?: boolean }) => {
    expect(opts?.skipAuthClear).toBe(true);
    if (opts?.signal) capturedSignals.push(opts.signal);
    return new Promise((_, rej) => { rejectPending = rej; });
  });

  const platform = {
    t: (s: string) => s,
    api: { put, token: () => token, setToken },
    setUser,
    toast,
    store: { get user() { return user; }, set user(next) { user = next; } },
    on: (_ev: string, fn: (u: unknown) => void) => {
      authHandlers.add(fn);
      return () => { authHandlers.delete(fn); };
    },
  } as unknown as ApplicationContext;

  const services = createExchangeRequestServicesVue3(platform);
  const addr = { name: '张三', phone: '', province: '', city: '南京市', line1: '中山路 1 号', postalCode: '', country: '中国' };

  // 1. Account switch aborts in-flight silent save and late 401 does NOT clear Account B
  const p1 = services.updateProfileAddress(addr);
  expect(capturedSignals[0]?.aborted).toBe(false);
  token = 'tok-2';
  setUser({ id: 'u2' });
  expect(capturedSignals[0]?.aborted).toBe(true);

  setToken.mockClear();
  setUser.mockClear();
  toast.mockClear();
  rejectPending(Object.assign(new Error('请先登录后再操作'), { status: 401, code: 'UNAUTHORIZED' }));
  await expect(p1).rejects.toMatchObject({ status: 401 });
  expect(token).toBe('tok-2');
  expect(user).toEqual({ id: 'u2' });
  expect(setToken).not.toHaveBeenCalled();
  expect(setUser).not.toHaveBeenCalled();
  expect(toast).not.toHaveBeenCalled();

  // 2. Real 401 on active session DOES clear token/user and shows expired toast
  const p2 = services.updateProfileAddress(addr);
  rejectPending(Object.assign(new Error('请先登录后再操作'), { status: 401, code: 'UNAUTHORIZED' }));
  await expect(p2).rejects.toMatchObject({ status: 401 });
  expect(setToken).toHaveBeenCalledWith(null);
  expect(setUser).toHaveBeenCalledWith(null);
  expect(toast).toHaveBeenCalledWith('登录已过期，请重新登录', 'error');
});
