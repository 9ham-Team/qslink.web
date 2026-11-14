import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUserVue3, LegacyQslVue3 } from '../src/contracts';
import { createSessionRuntimeVue3 } from '../src/session';
import {
  createRuntimeStoreVue3,
  installQslStateBridgeVue3,
} from '../src/state';

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function makeQsl(initialToken: string | null = null) {
  const authEvents: Array<AuthUserVue3 | null> = [];
  let token = initialToken;
  const qsl = {
    t: (value: string) => value,
    state: { user: null, config: { demo: false, demoAccounts: [] }, booted: false },
    api: {
      token: vi.fn(() => token),
      setToken: vi.fn((next: string | null) => { token = next || null; }),
      config: vi.fn(async () => ({ demo: false, demoAccounts: [] })),
      get: vi.fn(async () => ({})),
      post: vi.fn(async () => ({})),
      put: vi.fn(async () => ({})),
      cards: { like: vi.fn() },
      auth: {
        me: vi.fn(async () => ({ user: null })),
      },
    },
    emit: vi.fn((_event: string, value: AuthUserVue3 | null) => {
      if (_event === 'auth') authEvents.push(value);
    }),
    on: vi.fn(() => () => {}),
  } as unknown as LegacyQslVue3 & { api: any };
  return { qsl, authEvents, token: () => token };
}

async function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  });
  await router.push('/');
  await router.isReady();
  return router;
}

async function makeSessionHarness(initialToken: string | null) {
  const { qsl } = makeQsl(initialToken);
  const authEvents: Array<AuthUserVue3 | null> = [];
  const pinia = createPinia();
  const store = createRuntimeStoreVue3(pinia, user => authEvents.push(user));
  installQslStateBridgeVue3(qsl, store);
  const router = await makeRouter();
  const session = createSessionRuntimeVue3(qsl, store, router);
  return { qsl, store, session, authEvents };
}

const OLD_USER: AuthUserVue3 = {
  id: 'u-old',
  uid: '000000001',
  username: 'old-user',
  displayName: 'Old User',
};

describe('Pinia runtime and QSL compatibility — vue3', () => {
  it('creates isolated stores and keeps direct QSL.state writes on the shared Pinia state — vue3', () => {
    const auth1 = vi.fn();
    const auth2 = vi.fn();
    const pinia1 = createPinia();
    const pinia2 = createPinia();
    const store1 = createRuntimeStoreVue3(pinia1, auth1);
    const store2 = createRuntimeStoreVue3(pinia2, auth2);
    const { qsl } = makeQsl();

    installQslStateBridgeVue3(qsl, store1);
    qsl.state.user = { id: 'u1', uid: '000000001', username: 'one' };
    expect(store1.user?.id).toBe('u1');
    expect(auth1).toHaveBeenCalledTimes(1);

    qsl.state.user = { id: 'u1', uid: '000000001', username: 'one', displayName: 'Saved' };
    expect(store1.user?.displayName).toBe('Saved');
    expect(auth1).toHaveBeenCalledTimes(2);
    const accountVersion = store1.accountVersion;
    const sessionVersion = store1.sessionVersion;
    qsl.api.setToken?.('temporary-token');
    expect(store1.accountVersion).toBe(accountVersion);
    expect(store1.sessionVersion).toBeGreaterThan(sessionVersion);
    expect(auth1).toHaveBeenCalledTimes(2);

    qsl.setUser?.(null);
    expect(store1.user).toBeNull();
    expect(store1.accountVersion).toBeGreaterThan(accountVersion);
    expect(store2.user).toBeNull();
    expect(auth2).not.toHaveBeenCalled();
  });

  it('boots once, updates loading/error state, and keeps the API token as the only token source — vue3', async () => {
    const { qsl } = makeQsl('tok-boot');
    qsl.api.auth.me.mockResolvedValue({
      user: { id: 'u1', uid: '000000001', username: 'boot-user' },
    });
    const pinia = createPinia();
    const store = createRuntimeStoreVue3(pinia, () => {});
    installQslStateBridgeVue3(qsl, store);
    const router = await makeRouter();
    const session = createSessionRuntimeVue3(qsl, store, router);

    await Promise.all([session.boot(), session.boot()]);

    expect(qsl.api.config).toHaveBeenCalledTimes(1);
    expect(qsl.api.auth?.me).toHaveBeenCalledTimes(1);
    expect(store.booted).toBe(true);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
    expect(store.user?.id).toBe('u1');
    expect(qsl.api.token()).toBe('tok-boot');
    expect('token' in store).toBe(false);
  });

  it('ignores an older refresh after another account or newer profile data is written — vue3', async () => {
    const { qsl } = makeQsl('tok-u1');
    const pinia = createPinia();
    const store = createRuntimeStoreVue3(pinia, () => {});
    installQslStateBridgeVue3(qsl, store);
    const router = await makeRouter();
    const session = createSessionRuntimeVue3(qsl, store, router);
    store.setUser({ id: 'u1', uid: '000000001', username: 'one', displayName: 'Before' });

    let resolveOld!: (value: { user: AuthUserVue3 }) => void;
    qsl.api.auth.me.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const oldRefresh = session.refreshUser();
    qsl.api.setToken('tok-u2');
    store.setUser({ id: 'u2', uid: '000000002', username: 'two', displayName: 'New account' });
    resolveOld({ user: { id: 'u1', uid: '000000001', username: 'one', displayName: 'Stale account' } });
    expect(await oldRefresh).toBeNull();
    expect(store.user?.id).toBe('u2');
    expect(qsl.api.token()).toBe('tok-u2');

    qsl.api.setToken('tok-u2b');
    store.setUser({ id: 'u2', uid: '000000002', username: 'two', displayName: 'Before save' });
    let resolveSameAccount!: (value: { user: AuthUserVue3 }) => void;
    qsl.api.auth.me.mockImplementationOnce(() => new Promise(resolve => { resolveSameAccount = resolve; }));
    const sameAccountRefresh = session.refreshUser();
    store.setUser({ id: 'u2', uid: '000000002', username: 'two', displayName: 'Just saved' });
    resolveSameAccount({ user: { id: 'u2', uid: '000000002', username: 'two', displayName: 'Older server copy' } });
    expect(await sameAccountRefresh).toBeNull();
    expect(store.user?.displayName).toBe('Just saved');
  });

  it('finishes boot with a visible error when config loading fails — vue3', async () => {
    const { qsl } = makeQsl();
    qsl.api.config.mockRejectedValue(new Error('config unavailable'));
    const pinia = createPinia();
    const store = createRuntimeStoreVue3(pinia, () => {});
    installQslStateBridgeVue3(qsl, store);
    const router = await makeRouter();
    const session = createSessionRuntimeVue3(qsl, store, router);

    await session.boot();
    await flush();

    expect(store.booted).toBe(true);
    expect(store.loading).toBe(false);
    expect(store.error).toContain('config unavailable');
    expect(await qsl.state.ready).toBeUndefined();
  });

  it('does not apply a delayed boot success over a newer account, logout, or saved profile — vue3', async () => {
    const scenarios = [
      {
        name: 'account switch',
        mutate(qsl: LegacyQslVue3 & { api: any }, store: ReturnType<typeof createRuntimeStoreVue3>) {
          qsl.api.setToken('tok-new');
          store.setUser({ id: 'u-new', uid: '000000002', username: 'new-user' });
        },
        expectedUser: 'u-new',
        expectedToken: 'tok-new',
      },
      {
        name: 'logout',
        mutate(qsl: LegacyQslVue3 & { api: any }, _store: ReturnType<typeof createRuntimeStoreVue3>) {
          qsl.api.setToken(null);
          qsl.setUser?.(null);
        },
        expectedUser: null,
        expectedToken: null,
      },
      {
        name: 'same-account profile save',
        mutate(_qsl: LegacyQslVue3 & { api: any }, store: ReturnType<typeof createRuntimeStoreVue3>) {
          store.setUser({ ...OLD_USER, displayName: 'Just Saved' });
        },
        expectedUser: 'u-old',
        expectedToken: 'tok-old',
      },
    ];

    for (const scenario of scenarios) {
      const { qsl, store, session, authEvents } = await makeSessionHarness('tok-old');
      store.setUser(OLD_USER);
      let resolveMe!: (value: { user: AuthUserVue3 }) => void;
      qsl.api.auth.me.mockImplementationOnce(() => new Promise(resolve => { resolveMe = resolve; }));
      const boot = session.boot();
      await flush();
      expect(qsl.api.auth.me).toHaveBeenCalledTimes(1);

      scenario.mutate(qsl, store);
      const eventsAfterMutation = authEvents.length;
      resolveMe({
        user: { ...OLD_USER, displayName: scenario.name === 'account switch' ? 'Stale Old User' : 'Older Server Copy' },
      });
      await boot;

      expect(store.user?.id || null, scenario.name).toBe(scenario.expectedUser);
      if (scenario.name === 'same-account profile save') {
        expect(store.user?.displayName).toBe('Just Saved');
      }
      expect(qsl.api.token(), scenario.name).toBe(scenario.expectedToken);
      expect(authEvents.length, scenario.name).toBe(eventsAfterMutation);
      expect(store.booted, scenario.name).toBe(true);
      expect(store.loading, scenario.name).toBe(false);
      expect(store.error, scenario.name).toBeNull();
    }
  });

  it('does not apply a delayed boot failure over a newer account, logout, or saved profile — vue3', async () => {
    const scenarios = [
      {
        name: 'account switch',
        mutate(qsl: LegacyQslVue3 & { api: any }, store: ReturnType<typeof createRuntimeStoreVue3>) {
          qsl.api.setToken('tok-new');
          store.setUser({ id: 'u-new', uid: '000000002', username: 'new-user' });
        },
        error: Object.assign(new Error('old account unauthorized'), { status: 401 }),
        expectedUser: 'u-new',
        expectedToken: 'tok-new',
      },
      {
        name: 'logout',
        mutate(qsl: LegacyQslVue3 & { api: any }, _store: ReturnType<typeof createRuntimeStoreVue3>) {
          qsl.api.setToken(null);
          qsl.setUser?.(null);
        },
        error: Object.assign(new Error('old network failure'), { isNetwork: true }),
        expectedUser: null,
        expectedToken: null,
      },
      {
        name: 'same-account profile save',
        mutate(_qsl: LegacyQslVue3 & { api: any }, store: ReturnType<typeof createRuntimeStoreVue3>) {
          store.setUser({ ...OLD_USER, displayName: 'Just Saved' });
        },
        error: Object.assign(new Error('old account forbidden'), { status: 403 }),
        expectedUser: 'u-old',
        expectedToken: 'tok-old',
      },
    ];

    for (const scenario of scenarios) {
      const { qsl, store, session, authEvents } = await makeSessionHarness('tok-old');
      store.setUser(OLD_USER);
      let rejectMe!: (error: unknown) => void;
      qsl.api.auth.me.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectMe = reject; }));
      const boot = session.boot();
      await flush();
      expect(qsl.api.auth.me).toHaveBeenCalledTimes(1);

      scenario.mutate(qsl, store);
      const eventsAfterMutation = authEvents.length;
      rejectMe(scenario.error);
      await boot;

      expect(store.user?.id || null, scenario.name).toBe(scenario.expectedUser);
      if (scenario.name === 'same-account profile save') {
        expect(store.user?.displayName).toBe('Just Saved');
      }
      expect(qsl.api.token(), scenario.name).toBe(scenario.expectedToken);
      expect(authEvents.length, scenario.name).toBe(eventsAfterMutation);
      expect(store.booted, scenario.name).toBe(true);
      expect(store.loading, scenario.name).toBe(false);
      expect(store.error, scenario.name).toBeNull();
    }
  });
});
