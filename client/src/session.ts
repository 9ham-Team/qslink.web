import type { Router } from 'vue-router';
import type {
  AppConfigVue3,
  AuthUserVue3,
  ApplicationContext,
} from './contracts';
import {
  DEFAULT_CONFIG_VUE3,
  type RuntimeStoreVue3,
} from './state';

type SessionSnapshot = {
  token: string | null;
  tokenVersion: number;
  sessionVersion: number;
  userRevision: number;
};

function snapshotSessionVue3(platform: ApplicationContext, store: RuntimeStoreVue3): SessionSnapshot {
  return {
    token: typeof platform.api?.token === 'function' ? platform.api.token() : null,
    tokenVersion: store.tokenVersion,
    sessionVersion: store.sessionVersion,
    userRevision: store.userRevision,
  };
}

function sessionStillMatchesVue3(
  platform: ApplicationContext,
  store: RuntimeStoreVue3,
  snapshot: SessionSnapshot,
  token = snapshot.token,
): boolean {
  return (
    (typeof platform.api?.token === 'function' ? platform.api.token() : null) === token &&
    store.tokenVersion === snapshot.tokenVersion &&
    store.sessionVersion === snapshot.sessionVersion &&
    store.userRevision === snapshot.userRevision
  );
}

function authFailureVue3(err: unknown): boolean {
  const status = Number((err as { status?: number } | null)?.status);
  return status === 401 || status === 403;
}

function errorMessageVue3(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String((err as { message?: string } | null)?.message || '');
}

export function createSessionRuntimeVue3(
  platform: ApplicationContext,
  store: RuntimeStoreVue3,
  router: Router,
) {
  let bootPromise: Promise<void> | null = null;

  async function boot(): Promise<void> {
    if (bootPromise) return bootPromise;
    store.beginBoot();
    let bootError = '';
    let authNotified = false;

    bootPromise = (async () => {
      let config: AppConfigVue3 = DEFAULT_CONFIG_VUE3;
      try {
        config = (platform.api.config ? await platform.api.config() : await platform.api.get<AppConfigVue3>('/api/config')) || DEFAULT_CONFIG_VUE3;
        store.setConfig(config);
      } catch (err) {
        store.setConfig(DEFAULT_CONFIG_VUE3);
        bootError = errorMessageVue3(err);
      }

      const current = router.currentRoute.value;
      const devToken = typeof current.query.devToken === 'string' ? current.query.devToken : null;
      if (devToken) {
        if (config.demo) platform.api.setToken?.(devToken);
        try {
          const query = { ...current.query };
          delete query.devToken;
          await router.replace({ path: current.path, query, hash: current.hash });
        } catch {
          // Navigation limits must not prevent the configured development token.
        }
      }

      const snapshot = snapshotSessionVue3(platform, store);
      let resolvedUser: AuthUserVue3 | null = null;
      let applyBootAuth = true;
      if (snapshot.token) {
        try {
          const data = platform.api.auth
            ? await platform.api.auth.me({ skipAuthClear: true })
            : await platform.api.get<{ user?: AuthUserVue3 | null }>('/api/auth/me', { skipAuthClear: true });
          if (sessionStillMatchesVue3(platform, store, snapshot)) {
            resolvedUser = data?.user || null;
          } else {
            applyBootAuth = false;
          }
        } catch (err) {
          if (!sessionStillMatchesVue3(platform, store, snapshot)) {
            applyBootAuth = false;
          } else if (authFailureVue3(err)) {
            platform.api.setToken?.(null);
          } else {
            bootError = errorMessageVue3(err) || bootError;
          }
        }
      } else {
        applyBootAuth = sessionStillMatchesVue3(platform, store, snapshot);
      }

      if (applyBootAuth) {
        authNotified = store.setUser(resolvedUser);
        if (!authNotified) platform.emit?.('auth', resolvedUser);
      }
      store.finishBoot(bootError || null);
    })();

    store.ready = bootPromise;
    try {
      await bootPromise;
    } catch (err) {
      store.finishBoot(errorMessageVue3(err));
      platform.emit?.('auth', store.user);
    }
    return bootPromise;
  }

  async function refreshUser(): Promise<AuthUserVue3 | null> {
    const snapshot = snapshotSessionVue3(platform, store);
    if (!snapshot.token) {
      store.setUser(null);
      return null;
    }
    try {
      const data = platform.api.auth
        ? await platform.api.auth.me({ skipAuthClear: true })
        : await platform.api.get<{ user?: AuthUserVue3 | null }>('/api/auth/me', { skipAuthClear: true });
      if (!sessionStillMatchesVue3(platform, store, snapshot)) return null;
      const user = data?.user || null;
      store.setUser(user);
      return user;
    } catch (err) {
      if (authFailureVue3(err) && sessionStillMatchesVue3(platform, store, snapshot)) {
        platform.api.setToken?.(null);
        store.setUser(null);
      }
      return null;
    }
  }

  platform.boot = boot;
  platform.refreshUser = refreshUser;
  store.ready = bootPromise || Promise.resolve();

  return { boot, refreshUser };
}
