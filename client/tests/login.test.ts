import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoginVue3 from '../src/pages/Login.vue';
import type { AuthServicesVue3, AuthUserVue3 } from '../src/contracts';

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function makeServices(overrides: Partial<AuthServicesVue3> = {}): AuthServicesVue3 {
  let currentUser: AuthUserVue3 | null = null;
  let currentToken: string | null = null;
  const authListeners = new Set<(user: AuthUserVue3 | null) => void>();

  return {
    t: source => source,
    user: () => currentUser,
    token: () => currentToken,
    setToken: vi.fn((next: string | null) => { currentToken = next; }),
    setUser: vi.fn((next: AuthUserVue3 | null) => {
      currentUser = next;
      authListeners.forEach(fn => fn(next));
    }),
    onAuth: fn => {
      authListeners.add(fn as (user: AuthUserVue3 | null) => void);
      return () => authListeners.delete(fn as (user: AuthUserVue3 | null) => void);
    },
    safeNext: raw => {
      if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
      if (raw.startsWith('/login') || raw.startsWith('/register')) return null;
      return raw;
    },
    config: () => ({ demo: false, demoAccounts: [] }),
    login: vi.fn(async () => ({ token: 'tok-1', user: { id: 'u1', uid: '10001', username: 'bh4abc', displayName: 'BH4ABC' } })),
    register: vi.fn(async () => ({})),
    sendEmailCode: vi.fn(async () => ({ ok: true })),
    fetchMe: vi.fn(async () => ({ user: { id: 'u1', uid: '10001', username: 'bh4abc', displayName: 'BH4ABC' } })),
    getSpace: vi.fn(),
    listCards: vi.fn(),
    setQuery: vi.fn(),
    celebrate: vi.fn(),
    likeCard: vi.fn(),
    image: vi.fn(),
    placeholder: '',
    formatDate: String,
    formatNumber: String,
    navigate: vi.fn(),
    toast: vi.fn(),
    share: vi.fn(() => ({ close: vi.fn() })),
    ...overrides,
  };
}

describe('LoginVue3', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hides demo accounts when config.demo is false and fills without auto-submitting when true', async () => {
    const hiddenServices = makeServices({ config: () => ({ demo: false, demoAccounts: [{ id: 'demo', pass: 'secret', name: 'Demo', callSign: 'BG0', role: '普通用户' }] }) });
    const w1 = mount(LoginVue3, { props: { services: hiddenServices } });
    expect(w1.find('.f-demo').exists()).toBe(false);
    w1.unmount();

    const demoServices = makeServices({
      config: () => ({ demo: true, demoAccounts: [{ id: 'demo_user', pass: 'DemoPass123', name: 'Demo', callSign: 'BG0AAA', role: '普通用户' }] }),
    });
    const w2 = mount(LoginVue3, { props: { services: demoServices } });
    expect(w2.find('.f-demo').exists()).toBe(true);
    await w2.get('[data-demo-user="demo_user"]').trigger('click');
    expect((w2.get('#fLoginIdentifier').element as HTMLInputElement).value).toBe('demo_user');
    expect((w2.get('#fLoginPassword').element as HTMLInputElement).value).toBe('DemoPass123');
    expect(demoServices.login).not.toHaveBeenCalled();
    w2.unmount();
  });

  it('trims identifier but preserves raw password and toggles password visibility', async () => {
    const services = makeServices();
    const wrapper = mount(LoginVue3, { props: { nextRaw: '/card/42?tab=info#front', services } });

    expect(wrapper.get('.f-auth-alt a').attributes('href')).toBe('/register?next=%2Fcard%2F42%3Ftab%3Dinfo%23front');

    const eye = wrapper.get('[data-eye]');
    expect(wrapper.get('#fLoginPassword').attributes('type')).toBe('password');
    await eye.trigger('click');
    expect(wrapper.get('#fLoginPassword').attributes('type')).toBe('text');
    expect(eye.attributes('aria-pressed')).toBe('true');

    await wrapper.get('#fLoginIdentifier').setValue('  bh4abc  ');
    await wrapper.get('#fLoginPassword').setValue('  pass1234  ');
    await wrapper.get('form').trigger('submit');
    await flush();

    expect(services.login).toHaveBeenCalledWith(
      { identifier: 'bh4abc', password: '  pass1234  ' },
      expect.any(AbortSignal),
    );
    expect(services.setToken).toHaveBeenCalledWith('tok-1');
    expect(services.setUser).toHaveBeenCalled();
    expect(services.navigate).toHaveBeenCalledWith('/card/42?tab=info#front');
    wrapper.unmount();
  });

  it('validates fields, handles server error codes, prevents duplicate submit, and allows retry', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    let rejectFirst!: (err: unknown) => void;
    const loginMock = vi.fn()
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectFirst = reject; }))
      .mockRejectedValueOnce({ status: 403, code: 'BANNED' })
      .mockRejectedValueOnce({ status: 400, code: 'VALIDATION', fields: { 'body.password': '密码错误' } })
      .mockRejectedValueOnce({ status: 429, message: '请求过于频繁' })
      .mockRejectedValueOnce({ status: 0, isNetwork: true })
      .mockResolvedValueOnce({ token: 'tok-ok', user: { id: 'u1', username: 'bh4abc' } });

    const services = makeServices({ login: loginMock });
    const wrapper = mount(LoginVue3, { props: { services } });

    await wrapper.get('form').trigger('submit');
    expect(wrapper.get('[data-error="identifier"]').text()).toBe('请输入用户名或邮箱');
    expect(wrapper.get('[data-error="password"]').text()).toBe('请输入密码');
    await wrapper.get('#fLoginIdentifier').setValue('bh4abc');
    expect(wrapper.get('[data-error="identifier"]').text()).toBe('');

    await wrapper.get('#fLoginPassword').setValue('secret123');
    await wrapper.get('form').trigger('submit');
    await wrapper.get('form').trigger('submit');
    expect(loginMock).toHaveBeenCalledTimes(1);

    rejectFirst({ status: 401, code: 'INVALID_CREDENTIALS' });
    await flush();
    expect(wrapper.get('.f-form-alert').text()).toContain('用户名/邮箱或密码不正确');

    await wrapper.get('form').trigger('submit');
    await flush();
    expect(wrapper.get('.f-form-alert').text()).toContain('该账号已被禁用');

    await wrapper.get('form').trigger('submit');
    await flush();
    expect(wrapper.get('[data-error="password"]').text()).toBe('密码错误');

    await wrapper.get('form').trigger('submit');
    await flush();
    expect(wrapper.get('.f-form-alert').text()).toContain('请求过于频繁');

    await wrapper.get('form').trigger('submit');
    await flush();
    expect(wrapper.get('.f-form-alert').text()).toContain('无法连接服务器');

    await wrapper.get('form').trigger('submit');
    await flush();
    expect(services.navigate).toHaveBeenCalledWith('/');
    consoleErr.mockRestore();
    wrapper.unmount();
  });

  it('fetches /api/auth/me when user is omitted and aborts cleanly on unmount without writing session', async () => {
    let resolveLogin!: (val: { token: string }) => void;
    let capturedSignal!: AbortSignal;
    const services = makeServices({
      login: vi.fn((_p, signal) => {
        capturedSignal = signal;
        return new Promise(resolve => { resolveLogin = resolve; });
      }),
    });
    const wrapper = mount(LoginVue3, { props: { nextRaw: '/dashboard', services } });
    await wrapper.get('#fLoginIdentifier').setValue('bh4abc');
    await wrapper.get('#fLoginPassword').setValue('secret123');
    await wrapper.get('form').trigger('submit');

    wrapper.unmount();
    expect(capturedSignal.aborted).toBe(true);
    resolveLogin({ token: 'late-token' });
    await flush();

    expect(services.setToken).not.toHaveBeenCalled();
    expect(services.setUser).not.toHaveBeenCalled();
    expect(services.navigate).not.toHaveBeenCalled();
  });

  it('completes login when user is omitted in response via fetchMe', async () => {
    const services = makeServices({
      login: vi.fn(async () => ({ token: 'tok-only' })),
      fetchMe: vi.fn(async () => ({ user: { id: 'u2', uid: '10002', username: 'bg2xyz', displayName: 'BG2XYZ' } })),
    });
    const wrapper = mount(LoginVue3, { props: { services } });
    await wrapper.get('#fLoginIdentifier').setValue('bg2xyz');
    await wrapper.get('#fLoginPassword').setValue('secret123');
    await wrapper.get('form').trigger('submit');
    await flush();

    expect(services.fetchMe).toHaveBeenCalledTimes(1);
    expect(services.setToken).toHaveBeenCalledWith('tok-only');
    expect(services.setUser).toHaveBeenCalledWith({ id: 'u2', uid: '10002', username: 'bg2xyz', displayName: 'BG2XYZ' });
    expect(services.navigate).toHaveBeenCalledWith('/');
    wrapper.unmount();
  });

  it('rolls back temporary token and allows retry when fetchMe fails without overwriting another session', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMe = vi.fn()
      .mockRejectedValueOnce({ status: 0, isNetwork: true, message: '网络连接失败' })
      .mockResolvedValueOnce({ user: null })
      .mockResolvedValueOnce({ user: { id: 'u2', uid: '10002', username: 'bg2xyz' } });

    const services = makeServices({
      login: vi.fn(async () => ({ token: 'tok-temp' })),
      fetchMe,
    });
    const wrapper = mount(LoginVue3, { props: { services } });
    await wrapper.get('#fLoginIdentifier').setValue('bg2xyz');
    await wrapper.get('#fLoginPassword').setValue('secret123');

    await wrapper.get('form').trigger('submit');
    await flush();
    expect(services.token()).toBeNull();
    expect(services.user()).toBeNull();
    expect(services.toast).not.toHaveBeenCalled();
    expect(services.navigate).not.toHaveBeenCalled();
    expect(wrapper.get('.f-form-alert').text()).toContain('无法连接服务器');

    await wrapper.get('form').trigger('submit');
    await flush();
    expect(services.token()).toBeNull();
    expect(services.navigate).not.toHaveBeenCalled();
    expect(wrapper.get('.f-form-alert').text()).toContain('获取用户信息失败');

    await wrapper.get('form').trigger('submit');
    await flush();
    expect(services.token()).toBe('tok-temp');
    expect(services.navigate).toHaveBeenCalledWith('/');
    wrapper.unmount();

    // External session established while fetchMe is in flight must not be overwritten
    let rejectFetchMe!: (err: unknown) => void;
    const raceServices = makeServices({
      login: vi.fn(async () => ({ token: 'tok-race' })),
      fetchMe: vi.fn(() => new Promise((_, reject) => { rejectFetchMe = reject; })),
    });
    const w2 = mount(LoginVue3, { props: { services: raceServices } });
    await w2.get('#fLoginIdentifier').setValue('bg2xyz');
    await w2.get('#fLoginPassword').setValue('secret123');
    await w2.get('form').trigger('submit');
    await flush();

    raceServices.setToken('other-session-token');
    raceServices.setUser({ id: 'other', uid: '99999', username: 'other_user' });
    rejectFetchMe({ status: 0, isNetwork: true });
    await flush();

    expect(raceServices.token()).toBe('other-session-token');
    expect(raceServices.user()?.id).toBe('other');
    expect(raceServices.navigate).not.toHaveBeenCalled();
    consoleErr.mockRestore();
    w2.unmount();
  });
});
