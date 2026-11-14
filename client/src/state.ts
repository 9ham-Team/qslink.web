import { defineStore, type Pinia } from 'pinia';
import { ref, shallowRef } from 'vue';
import type {
  AppConfigVue3,
  AuthUserVue3,
  LegacyQslVue3,
} from './contracts';

export const DEFAULT_CONFIG_VUE3: AppConfigVue3 = { demo: false, demoAccounts: [] };

export interface RuntimeStoreVue3 {
  user: AuthUserVue3 | null;
  config: AppConfigVue3;
  booted: boolean;
  loading: boolean;
  error: string | null;
  ready: Promise<void>;
  sessionVersion: number;
  accountVersion: number;
  userRevision: number;
  tokenVersion: number;
  setUser(user: AuthUserVue3 | null, forceNotify?: boolean): boolean;
  setConfig(config: AppConfigVue3 | null | undefined): void;
  beginBoot(): void;
  finishBoot(error?: string | null): void;
  noteTokenChange(previous: string | null, next: string | null): void;
}

function identityKey(user: AuthUserVue3 | null): string {
  if (!user) return '';
  return user.id ? 'id:' + user.id : user.uid ? 'uid:' + user.uid : 'user:' + (user.username || '');
}

export function createRuntimeStoreVue3(
  pinia: Pinia,
  notifyAuth: (user: AuthUserVue3 | null) => void = () => {},
) {
  const useStore = defineStore('qsl-runtime', () => {
    const user = shallowRef<AuthUserVue3 | null>(null);
    const config = shallowRef<AppConfigVue3>(DEFAULT_CONFIG_VUE3);
    const booted = ref(false);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const ready = shallowRef<Promise<void>>(Promise.resolve());
    const sessionVersion = ref(0);
    const accountVersion = ref(0);
    const userRevision = ref(0);
    const tokenVersion = ref(0);

    function setUser(next: AuthUserVue3 | null, forceNotify = false): boolean {
      const value = next || null;
      const previous = user.value;
      if (identityKey(previous) !== identityKey(value)) {
        sessionVersion.value += 1;
        accountVersion.value += 1;
      }
      user.value = value;
      userRevision.value += 1;
      if (previous === value && !forceNotify) return false;
      notifyAuth(value);
      return true;
    }

    function setConfig(next: AppConfigVue3 | null | undefined) {
      config.value = next || DEFAULT_CONFIG_VUE3;
    }

    function beginBoot() {
      loading.value = true;
      error.value = null;
    }

    function finishBoot(nextError?: string | null) {
      error.value = nextError || null;
      booted.value = true;
      loading.value = false;
    }

    function noteTokenChange(previous: string | null, next: string | null) {
      if (previous === next) return;
      tokenVersion.value += 1;
      sessionVersion.value += 1;
    }

    return {
      user,
      config,
      booted,
      loading,
      error,
      ready,
      sessionVersion,
      accountVersion,
      userRevision,
      tokenVersion,
      setUser,
      setConfig,
      beginBoot,
      finishBoot,
      noteTokenChange,
    };
  });

  return useStore(pinia);
}

export function installQslStateBridgeVue3(qsl: LegacyQslVue3, store: RuntimeStoreVue3): void {
  const existing = qsl.state || {
    user: null,
    config: DEFAULT_CONFIG_VUE3,
    booted: false,
    loading: false,
    error: null,
    ready: Promise.resolve(),
  };
  if (existing.config) store.setConfig(existing.config);
  if (existing.user) store.setUser(existing.user);
  const state = {} as LegacyQslVue3['state'];
  Object.defineProperties(state, {
    user: {
      enumerable: true,
      configurable: false,
      get: () => store.user,
      set: value => { store.setUser(value); },
    },
    config: {
      enumerable: true,
      configurable: false,
      get: () => store.config,
      set: value => { store.setConfig(value); },
    },
    booted: {
      enumerable: true,
      configurable: false,
      get: () => store.booted,
      set: value => {
        if (value) store.finishBoot(store.error);
      },
    },
    loading: {
      enumerable: true,
      configurable: false,
      get: () => store.loading,
      set: value => {
        if (value) store.beginBoot();
      },
    },
    error: {
      enumerable: true,
      configurable: false,
      get: () => store.error,
      set: value => { store.error = value || null; },
    },
    ready: {
      enumerable: true,
      configurable: false,
      get: () => store.ready,
      set: value => { store.ready = value || Promise.resolve(); },
    },
  });
  Object.defineProperty(qsl, 'state', {
    value: state,
    configurable: true,
    enumerable: true,
    writable: false,
  });

  // Preserve the existing object for callers that captured it before Vue boot.
  if (existing && existing !== state) {
    try {
      existing.user = store.user;
      existing.config = store.config;
    } catch {
      // A frozen pre-boot state object cannot be updated; QSL.state is authoritative.
    }
  }

  qsl.setUser = value => { store.setUser(value, true); };

  const api = qsl.api;
  if (api && typeof api.setToken === 'function') {
    const rawSetToken = api.setToken.bind(api);
    let lastToken = typeof api.token === 'function' ? api.token() : null;
    api.setToken = value => {
      const next = value || null;
      const previous = lastToken;
      rawSetToken(next);
      lastToken = next;
      store.noteTokenChange(previous, next);
    };
  }
}
