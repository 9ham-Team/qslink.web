import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProfileVue3 from '../src/pages/Profile.vue';
import type { AccountServicesVue3, OverviewResponseVue3, SelfUserVue3 } from '../src/contracts';

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function makeUser(overrides: Partial<SelfUserVue3> = {}): SelfUserVue3 {
  return {
    id: 'u1',
    uid: '10001',
    username: 'bh4abc',
    displayName: 'BH4ABC',
    callSign: 'BH4ABC',
    email: 'bh4abc@example.com',
    role: 'user',
    avatarColor: '#0eaf8f',
    bio: '初始简介',
    joinedAt: '2026-01-01T00:00:00.000Z',
    address: {
      name: '张三',
      phone: '13800138000',
      province: '广东省',
      city: '深圳市',
      line1: '科技南十二路18号',
      postalCode: '518000',
      country: '中国',
    },
    stats: { cards: 2, likesReceived: 5, exchanges: 1 },
    ...overrides,
  };
}

function makeServices(user: SelfUserVue3 | null, overrides: Partial<AccountServicesVue3> = {}) {
  let currentUser = user;
  let currentToken: string | null = user ? 'tok-1' : null;
  const authListeners = new Set<(u: SelfUserVue3 | null) => void>();

  const services: AccountServicesVue3 = {
    t: s => s,
    user: () => currentUser,
    token: () => currentToken,
    setUser: vi.fn((next: SelfUserVue3 | null) => {
      currentUser = next;
      authListeners.forEach(fn => fn(next));
    }),
    onAuth: fn => {
      authListeners.add(fn as (u: SelfUserVue3 | null) => void);
      return () => authListeners.delete(fn as (u: SelfUserVue3 | null) => void);
    },
    avatarColors: () => ['#0eaf8f', '#38bdf8', '#8b5cf6'],
    timeAgo: () => '1 小时前',
    language: () => 'zh-CN',
    getOverview: vi.fn(async () => ({
      user: currentUser || makeUser(),
      canJudgeContest: false,
      stats: { cards: 2, approvedCards: 2, pendingCards: 0, likesReceived: 5, incomingPending: 0, outgoingPending: 0, completedExchanges: 1 },
      recentIncoming: [],
      recentCards: [],
    })),
    updateProfile: vi.fn(async payload => {
      const next = { ...(currentUser || makeUser()), ...payload } as SelfUserVue3;
      return { user: next };
    }),
    updatePassword: vi.fn(async () => ({ ok: true })),
    getApplicantCards: vi.fn(),
    approveExchange: vi.fn(),
    rejectExchange: vi.fn(),
    getSpace: vi.fn(),
    listCards: vi.fn(),
    setQuery: vi.fn(),
    celebrate: vi.fn(),
    likeCard: vi.fn(),
    image: vi.fn(),
    placeholder: '',
    formatDate: v => v.slice(0, 10),
    formatNumber: String,
    navigate: vi.fn(),
    toast: vi.fn(),
    share: vi.fn(() => ({ close: vi.fn() })),
    ...overrides,
  };

  return {
    services,
    emitExternalAuth(next: SelfUserVue3 | null, nextToken: string | null = next ? 'tok-2' : null) {
      currentUser = next;
      currentToken = nextToken;
      authListeners.forEach(fn => fn(next));
    },
  };
}

describe('ProfileVue3', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not overwrite user edits when late overview resolves and preserves edits made during save', async () => {
    let resolveOverview!: (v: OverviewResponseVue3) => void;
    let resolveSave!: (v: { user: SelfUserVue3 }) => void;
    const { services } = makeServices(makeUser(), {
      getOverview: vi.fn(() => new Promise<OverviewResponseVue3>(res => { resolveOverview = res; })),
      updateProfile: vi.fn(() => new Promise<{ user: SelfUserVue3 }>(res => { resolveSave = res; })),
    });

    const wrapper = mount(ProfileVue3, { props: { services } });
    await flush();

    // User edits displayName before late overview arrives
    const nameInput = wrapper.get('#fProfileDisplayName');
    await nameInput.setValue('用户新昵称');

    // Late overview arrives with old displayName -> must NOT overwrite dirty profileDraft
    resolveOverview({
      user: makeUser({ displayName: '远端旧昵称', address: { name: '远端收件人', city: '广州市', line1: '天河路1号' } }),
      canJudgeContest: false,
      stats: { cards: 3, approvedCards: 3, pendingCards: 0, likesReceived: 8, incomingPending: 0, outgoingPending: 0, completedExchanges: 2 },
      recentIncoming: [],
      recentCards: [],
    });
    await flush();
    expect((nameInput.element as HTMLInputElement).value).toBe('用户新昵称');
    // But untouched addressDraft WAS hydrated from overview
    expect((wrapper.get('#fAddrName').element as HTMLInputElement).value).toBe('远端收件人');

    // Submit profile save, then edit again while save is in flight
    await wrapper.get('#fProfileForm').trigger('submit');
    await nameInput.setValue('保存期间继续编辑');

    resolveSave({ user: makeUser({ displayName: '用户新昵称' }) });
    await flush();

    // In-flight edit must be preserved and NOT overwritten by save response
    expect((nameInput.element as HTMLInputElement).value).toBe('保存期间继续编辑');
    wrapper.unmount();
  });

  it('serializes cross-form /api/me/profile writes so stale responses never roll back global user state', async () => {
    let resolveFirst!: (v: { user: SelfUserVue3 }) => void;
    let callCount = 0;
    const { services } = makeServices(makeUser(), {
      updateProfile: vi.fn(payload => {
        callCount++;
        if (callCount === 1) {
          return new Promise<{ user: SelfUserVue3 }>(res => { resolveFirst = res; });
        }
        return Promise.resolve({
          user: makeUser({
            displayName: '新昵称',
            address: 'address' in payload ? payload.address : undefined,
          }),
        });
      }),
    });

    const wrapper = mount(ProfileVue3, { props: { services } });
    await flush();

    await wrapper.get('#fProfileDisplayName').setValue('新昵称');
    await wrapper.get('#fProfileForm').trigger('submit');

    // Trigger address save while profile save is still pending -> queued behind profile save
    await wrapper.get('#fAddrName').setValue('李四');
    await wrapper.get('#fAddressForm').trigger('submit');
    await flush();

    expect(callCount).toBe(1);
    resolveFirst({ user: makeUser({ displayName: '新昵称' }) });
    await flush();
    await flush();

    expect(callCount).toBe(2);
    expect((services.user() as SelfUserVue3).displayName).toBe('新昵称');
    expect((services.user() as SelfUserVue3).address?.name).toBe('李四');
    wrapper.unmount();
  });

  it('keeps drafts on same-account auth refresh and clears all private state on account switch', async () => {
    let resolveSave!: (v: { user: SelfUserVue3 }) => void;
    const { services, emitExternalAuth } = makeServices(makeUser(), {
      updateProfile: vi.fn(() => new Promise<{ user: SelfUserVue3 }>(res => { resolveSave = res; })),
    });

    const wrapper = mount(ProfileVue3, { props: { services } });
    await flush();

    await wrapper.get('#fProfileDisplayName').setValue('草稿昵称');
    // Same-account external refresh must not clear dirty draft
    emitExternalAuth(makeUser({ displayName: '服务端名字' }), 'tok-1');
    await flush();
    expect((wrapper.get('#fProfileDisplayName').element as HTMLInputElement).value).toBe('草稿昵称');

    // Start a save, then switch account before it resolves
    await wrapper.get('#fProfileForm').trigger('submit');
    emitExternalAuth(makeUser({ id: 'u2', uid: '10002', username: 'other' }), 'tok-2');
    await flush();

    expect(services.navigate).toHaveBeenCalledWith('/dashboard/profile', { replace: true });
    expect(wrapper.find('.f-profile').exists()).toBe(false);

    // Late save response for u1 must NOT call setUser to overwrite u2
    const setUserCallsBefore = (services.setUser as ReturnType<typeof vi.fn>).mock.calls.length;
    resolveSave({ user: makeUser({ id: 'u1', displayName: '旧账号覆盖' }) });
    await flush();
    expect((services.setUser as ReturnType<typeof vi.fn>).mock.calls.length).toBe(setUserCallsBefore);
    expect((services.user() as SelfUserVue3).id).toBe('u2');
    wrapper.unmount();
  });

  it('handles password errors, retains input on failure, and clears inputs & visibility on success', async () => {
    const { services } = makeServices(makeUser(), {
      updatePassword: vi.fn()
        .mockRejectedValueOnce(Object.assign(new Error('当前密码不正确'), { code: 'INVALID_CREDENTIALS' }))
        .mockResolvedValueOnce({ ok: true }),
    });

    const wrapper = mount(ProfileVue3, { props: { services } });
    await flush();

    await wrapper.get('#fPwdCurrent').setValue('WrongPass1');
    await wrapper.get('#fPwdNew').setValue('NewPass123');
    await wrapper.get('#fPwdConfirm').setValue('NewPass123');
    await wrapper.get('#fPasswordForm [data-eye]').trigger('click');
    expect(wrapper.get('#fPwdCurrent').attributes('type')).toBe('text');

    await wrapper.get('#fPasswordForm').trigger('submit');
    await flush();
    expect(wrapper.get('[data-error="currentPassword"]').text()).toBe('当前密码不正确');
    expect((wrapper.get('#fPwdCurrent').element as HTMLInputElement).value).toBe('WrongPass1');

    await wrapper.get('#fPwdCurrent').setValue('RightPass1');
    await wrapper.get('#fPasswordForm').trigger('submit');
    await flush();

    expect((wrapper.get('#fPwdCurrent').element as HTMLInputElement).value).toBe('');
    expect((wrapper.get('#fPwdNew').element as HTMLInputElement).value).toBe('');
    expect((wrapper.get('#fPwdConfirm').element as HTMLInputElement).value).toBe('');
    expect(wrapper.get('#fPwdCurrent').attributes('type')).toBe('password');
    wrapper.unmount();
  });

  it('allows saving profile with server default avatar colors not in swatch list (#22c55e, #f97316)', async () => {
    for (const color of ['#22c55e', '#f97316']) {
      const { services } = makeServices(makeUser({ avatarColor: color }));
      const wrapper = mount(ProfileVue3, { props: { services } });
      await flush();

      await wrapper.get('#fProfileDisplayName').setValue('保留默认配色');
      await wrapper.get('#fProfileForm').trigger('submit');
      await flush();

      expect(services.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: '保留默认配色', avatarColor: color }),
        expect.any(AbortSignal),
      );
      wrapper.unmount();
    }
  });

  it('clears private state and redirects on real 401 UNAUTHORIZED during password update, and ignores late 401 after account switch', async () => {
    const { services } = makeServices(makeUser(), {
      updatePassword: vi.fn().mockRejectedValueOnce(Object.assign(new Error('登录已过期'), { status: 401, code: 'UNAUTHORIZED' })),
    });
    const wrapper = mount(ProfileVue3, { props: { services } });
    await flush();

    await wrapper.get('#fPwdCurrent').setValue('OldPass123');
    await wrapper.get('#fPwdNew').setValue('NewPass123');
    await wrapper.get('#fPwdConfirm').setValue('NewPass123');
    await wrapper.get('#fPasswordForm').trigger('submit');
    await flush();

    expect(services.setUser).toHaveBeenCalledWith(null);
    expect(services.navigate).toHaveBeenCalledWith('/login?next=%2Fdashboard%2Fprofile', { replace: true });
    expect(wrapper.find('.f-profile').exists()).toBe(false);
    wrapper.unmount();

    // Late 401 from previous account after account switch must NOT clear new account session
    let rejectLate!: (err: unknown) => void;
    const { services: s2, emitExternalAuth } = makeServices(makeUser({ id: 'u1' }), {
      updatePassword: vi.fn(() => new Promise((_, rej) => { rejectLate = rej; })),
    });
    const w2 = mount(ProfileVue3, { props: { services: s2 } });
    await flush();

    await w2.get('#fPwdCurrent').setValue('OldPass123');
    await w2.get('#fPwdNew').setValue('NewPass123');
    await w2.get('#fPwdConfirm').setValue('NewPass123');
    await w2.get('#fPasswordForm').trigger('submit');

    const newUser = makeUser({ id: 'u2', uid: '10002', username: 'user2' });
    emitExternalAuth(newUser, 'tok-2');
    await flush();

    const setUserCallsBefore = (s2.setUser as ReturnType<typeof vi.fn>).mock.calls.length;
    rejectLate(Object.assign(new Error('登录已过期'), { status: 401, code: 'UNAUTHORIZED' }));
    await flush();

    expect((s2.setUser as ReturnType<typeof vi.fn>).mock.calls.length).toBe(setUserCallsBefore);
    expect((s2.user() as SelfUserVue3).id).toBe('u2');
    w2.unmount();
  });
});
