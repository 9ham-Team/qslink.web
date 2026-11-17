import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RegisterVue3 from '../src/pages/Register.vue';
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
    login: vi.fn(async () => ({})),
    register: vi.fn(async () => ({ token: 'reg-tok', user: { id: 'u1', uid: '10001', username: 'newuser' } })),
    sendEmailCode: vi.fn(async () => ({ ok: true, expiresIn: 1800, retryAfter: 60 })),
    fetchMe: vi.fn(async () => ({ user: { id: 'u1', uid: '10001', username: 'newuser' } })),
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

describe('RegisterVue3', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reveals email code section, preserves leading zeros, uppercases callSign, and handles email race conditions', async () => {
    vi.useFakeTimers();
    let resolveFirstSend!: () => void;
    let firstSignal!: AbortSignal;
    const sendEmailCode = vi.fn()
      .mockImplementationOnce((_email: string, signal: AbortSignal) => {
        firstSignal = signal;
        return new Promise<void>(resolve => { resolveFirstSend = () => resolve(); });
      })
      .mockRejectedValueOnce({ status: 503, code: 'MAIL_UNAVAILABLE', message: '邮件服务暂不可用' })
      .mockRejectedValueOnce({ status: 429, code: 'MAIL_COOLDOWN', message: '请在60秒后重新获取验证码' });

    const services = makeServices({ sendEmailCode: sendEmailCode as AuthServicesVue3['sendEmailCode'] });
    const wrapper = mount(RegisterVue3, { props: { services } });

    const checkbox = wrapper.get('input[name="legalConsent"]').element as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    await wrapper.get('#fRegEmail').setValue('first@example.com');
    vi.advanceTimersByTime(120);
    await vi.runAllTimersAsync();

    expect(wrapper.get('.f-reg-email-check').attributes('aria-label')).toBe('邮箱格式正确');
    expect(wrapper.get('.f-reg-code-reveal').classes()).toContain('is-open');

    await wrapper.get('.f-reg-code-send').trigger('click');
    expect(sendEmailCode).toHaveBeenCalledWith('first@example.com', expect.any(AbortSignal));

    // User edits email while first request is still in flight
    await wrapper.get('#fRegEmail').setValue('second@example.com');
    expect(firstSignal.aborted).toBe(true);
    resolveFirstSend();
    await Promise.resolve();
    expect(wrapper.get('#fRegCodeStatus').text()).toBe('');

    vi.advanceTimersByTime(120);
    await vi.runAllTimersAsync();

    // 503 MAIL_UNAVAILABLE must show error, not success
    await wrapper.get('.f-reg-code-send').trigger('click');
    await Promise.resolve();
    await Promise.resolve();
    expect(wrapper.get('[data-error="emailCode"]').text()).toContain('邮件服务暂不可用');
    expect(wrapper.get('#fRegCodeStatus').text()).toBe('');

    // 429 MAIL_COOLDOWN triggers 60s countdown
    await wrapper.get('.f-reg-code-send').trigger('click');
    await Promise.resolve();
    await Promise.resolve();
    expect(wrapper.get('.f-reg-code-send').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.f-reg-code-send').text()).toContain('60');

    // Code preserves leading zero
    await wrapper.get('#fRegEmailCode').setValue('00a4219');
    expect((wrapper.get('#fRegEmailCode').element as HTMLInputElement).value).toBe('004219');

    // CallSign auto-uppercases
    await wrapper.get('#fRegCallSign').setValue('bh4xyz');
    expect((wrapper.get('#fRegCallSign').element as HTMLInputElement).value).toBe('BH4XYZ');

    wrapper.unmount();
  });

  it('enforces server length limits, omits confirmPassword, and handles registration errors and success', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const registerMock = vi.fn()
      .mockRejectedValueOnce({ status: 409, code: 'USERNAME_TAKEN', fields: { username: '用户名已被占用' } })
      .mockRejectedValueOnce({ status: 400, code: 'EMAIL_CODE_INVALID', fields: { emailCode: '请重新获取或检查验证码' } })
      .mockResolvedValueOnce({ token: 'reg-ok', user: { id: 'u9', uid: '10009', username: 'ham_01' } });

    const services = makeServices({ register: registerMock });
    const wrapper = mount(RegisterVue3, { props: { nextRaw: '/explore?sort=latest', services } });

    await wrapper.get('#fRegUsername').setValue('ham_01');
    await wrapper.get('#fRegEmail').setValue('ham01@example.com');
    await wrapper.get('#fRegEmailCode').setValue('004219');
    await wrapper.get('#fRegDisplayName').setValue('a'.repeat(31));
    await wrapper.get('#fRegPassword').setValue('Pass1234');
    await wrapper.get('#fRegConfirm').setValue('Mismatch1');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.get('[data-error="displayName"]').text()).toBe('昵称不能超过 30 个字符');
    expect(wrapper.get('[data-error="confirmPassword"]').text()).toBe('两次输入的密码不一致');
    expect(wrapper.get('[data-field="legalConsent"] .f-error').text()).toContain('请阅读并同意用户条款');
    expect(registerMock).not.toHaveBeenCalled();

    await wrapper.get('#fRegDisplayName').setValue('Ham01');
    await wrapper.get('#fRegConfirm').setValue('Pass1234');
    await wrapper.get('input[name="legalConsent"]').setValue(true);
    await wrapper.get('form').trigger('submit');
    await flush();
    expect(wrapper.get('.f-form-alert').text()).toContain('该用户名已被占用');
    expect((wrapper.get('#fRegEmailCode').element as HTMLInputElement).value).toBe('004219');

    await wrapper.get('form').trigger('submit');
    await flush();
    expect(wrapper.get('[data-error="emailCode"]').text()).toContain('请重新获取或检查验证码');

    await wrapper.get('form').trigger('submit');
    await flush();

    expect(registerMock).toHaveBeenLastCalledWith(
      {
        acceptTerms: true,
        termsVersion: '2026-10-25',
        username: 'ham_01',
        email: 'ham01@example.com',
        emailCode: '004219',
        password: 'Pass1234',
        displayName: 'Ham01',
      },
      expect.any(AbortSignal),
    );
    expect(services.navigate).toHaveBeenCalledWith('/explore?sort=latest');
    consoleErr.mockRestore();
    wrapper.unmount();
  });

  it('rolls back temporary token when fetchMe fails after register returns token only', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const services = makeServices({
      register: vi.fn(async () => ({ token: 'reg-temp-tok' })),
      fetchMe: vi.fn()
        .mockRejectedValueOnce({ status: 0, isNetwork: true })
        .mockResolvedValueOnce({ user: { id: 'u9', uid: '10009', username: 'ham_01' } }),
    });
    const wrapper = mount(RegisterVue3, { props: { services } });

    await wrapper.get('#fRegUsername').setValue('ham_01');
    await wrapper.get('#fRegEmail').setValue('ham01@example.com');
    await wrapper.get('#fRegEmailCode').setValue('004219');
    await wrapper.get('#fRegPassword').setValue('Pass1234');
    await wrapper.get('#fRegConfirm').setValue('Pass1234');
    await wrapper.get('input[name="legalConsent"]').setValue(true);

    await wrapper.get('form').trigger('submit');
    await flush();
    expect(services.token()).toBeNull();
    expect(services.user()).toBeNull();
    expect(services.navigate).not.toHaveBeenCalled();
    expect(wrapper.get('.f-form-alert').text()).toContain('无法连接服务器');

    await wrapper.get('form').trigger('submit');
    await flush();
    expect(services.token()).toBe('reg-temp-tok');
    expect(services.navigate).toHaveBeenCalledWith('/dashboard');
    consoleErr.mockRestore();
    wrapper.unmount();
  });
});
