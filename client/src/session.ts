import type { Router } from 'vue-router';
import type {
  AppConfigVue3,
  AuthUserVue3,
  LegacyQslVue3,
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

function snapshotSessionVue3(qsl: LegacyQslVue3, store: RuntimeStoreVue3): SessionSnapshot {
  return {
    token: typeof qsl.api?.token === 'function' ? qsl.api.token() : null,
    tokenVersion: store.tokenVersion,
    sessionVersion: store.sessionVersion,
    userRevision: store.userRevision,
  };
}

function sessionStillMatchesVue3(
  qsl: LegacyQslVue3,
  store: RuntimeStoreVue3,
  snapshot: SessionSnapshot,
  token = snapshot.token,
): boolean {
  return (
    (typeof qsl.api?.token === 'function' ? qsl.api.token() : null) === token &&
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
  qsl: LegacyQslVue3,
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
        config = (qsl.api.config ? await qsl.api.config() : await qsl.api.get<AppConfigVue3>('/api/config')) || DEFAULT_CONFIG_VUE3;
        store.setConfig(config);
      } catch (err) {
        store.setConfig(DEFAULT_CONFIG_VUE3);
        bootError = errorMessageVue3(err);
      }

      const current = router.currentRoute.value;
      const devToken = typeof current.query.devToken === 'string' ? current.query.devToken : null;
      if (devToken) {
        if (config.demo) qsl.api.setToken?.(devToken);
        try {
          const query = { ...current.query };
          delete query.devToken;
          await router.replace({ path: current.path, query, hash: current.hash });
        } catch {
          // Navigation limits must not prevent the configured development token.
        }
      }

      const snapshot = snapshotSessionVue3(qsl, store);
      let resolvedUser: AuthUserVue3 | null = null;
      let applyBootAuth = true;
      if (snapshot.token) {
        try {
          const data = qsl.api.auth
            ? await qsl.api.auth.me({ skipAuthClear: true })
            : await qsl.api.get<{ user?: AuthUserVue3 | null }>('/api/auth/me', { skipAuthClear: true });
          if (sessionStillMatchesVue3(qsl, store, snapshot)) {
            resolvedUser = data?.user || null;
          } else {
            applyBootAuth = false;
          }
        } catch (err) {
          if (!sessionStillMatchesVue3(qsl, store, snapshot)) {
            applyBootAuth = false;
          } else if (authFailureVue3(err)) {
            qsl.api.setToken?.(null);
          } else {
            bootError = errorMessageVue3(err) || bootError;
          }
        }
      } else {
        applyBootAuth = sessionStillMatchesVue3(qsl, store, snapshot);
      }

      if (applyBootAuth) {
        authNotified = store.setUser(resolvedUser);
        if (!authNotified) qsl.emit?.('auth', resolvedUser);
      }
      store.finishBoot(bootError || null);
    })();

    store.ready = bootPromise;
    try {
      await bootPromise;
    } catch (err) {
      store.finishBoot(errorMessageVue3(err));
      qsl.emit?.('auth', store.user);
    }
    return bootPromise;
  }

  async function refreshUser(): Promise<AuthUserVue3 | null> {
    const snapshot = snapshotSessionVue3(qsl, store);
    if (!snapshot.token) {
      store.setUser(null);
      return null;
    }
    try {
      const data = qsl.api.auth
        ? await qsl.api.auth.me({ skipAuthClear: true })
        : await qsl.api.get<{ user?: AuthUserVue3 | null }>('/api/auth/me', { skipAuthClear: true });
      if (!sessionStillMatchesVue3(qsl, store, snapshot)) return null;
      const user = data?.user || null;
      store.setUser(user);
      return user;
    } catch (err) {
      if (authFailureVue3(err) && sessionStillMatchesVue3(qsl, store, snapshot)) {
        qsl.api.setToken?.(null);
        store.setUser(null);
      }
      return null;
    }
  }

  qsl.boot = boot;
  qsl.refreshUser = refreshUser;
  store.ready = bootPromise || Promise.resolve();

  return { boot, refreshUser };
}
