import { onUnmounted, ref } from 'vue';
import type { AuthResponseVue3, AuthServicesVue3, AuthUserVue3 } from '../contracts';

export type AuthSubmitOutcomeVue3 =
  | { status: 'ok'; user: AuthUserVue3 | null }
  | { status: 'busy' | 'aborted' | 'stale' };

export function normalizeFieldErrorsVue3(fields: Record<string, string> | null | undefined): Record<string, string> {
  if (!fields) return {};
  const normalized: Record<string, string> = {};
  for (const key of Object.keys(fields)) {
    const short = String(key).split('.').pop() || key;
    if (!(short in normalized)) normalized[short] = fields[key];
  }
  return normalized;
}

export function focusFirstFieldErrorVue3(
  form: HTMLElement | null,
  fieldOrder: string[],
  errors: Record<string, string>,
  reducedMotion: boolean,
) {
  if (!form) return;
  const firstKey = fieldOrder.find(key => !!errors[key]) || Object.keys(errors)[0];
  if (!firstKey) return;
  const wrap = form.querySelector<HTMLElement>(`.f-field[data-field="${firstKey}"]`);
  if (!wrap) return;
  const input = wrap.querySelector<HTMLElement>('input, textarea, select');
  if (input) {
    try { input.focus(); } catch { /* ignore */ }
  }
  const rect = wrap.getBoundingClientRect();
  if (typeof wrap.scrollIntoView === 'function' && (rect.top < 90 || rect.bottom > window.innerHeight - 40)) {
    wrap.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
  }
}

export function isAbortErrorVue3(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

export function useAuthSessionVue3(services: AuthServicesVue3) {
  const busy = ref(false);
  let disposed = false;
  let submitGen = 0;
  let authEpoch = 0;
  let applyingAuth = false;
  let activeAbort: AbortController | null = null;

  const offAuth = services.onAuth(() => {
    if (!applyingAuth) authEpoch++;
  });

  function isSessionIntact(epoch: number, initialUser: AuthUserVue3 | null, initialToken: string | null) {
    return !disposed && epoch === authEpoch && services.user() === initialUser && services.token() === initialToken;
  }

  async function submitAuth(
    requestFn: (signal: AbortSignal) => Promise<AuthResponseVue3>,
  ): Promise<AuthSubmitOutcomeVue3> {
    if (disposed || busy.value) return { status: 'busy' };
    const gen = ++submitGen;
    const epoch = authEpoch;
    const initialUser = services.user() as AuthUserVue3 | null;
    const initialToken = services.token();
    const controller = new AbortController();
    activeAbort = controller;
    busy.value = true;

    let tokenWrittenForMe = false;
    try {
      const res = await requestFn(controller.signal);
      if (gen !== submitGen || !isSessionIntact(epoch, initialUser, initialToken)) {
        return { status: 'stale' };
      }

      let resolvedUser: AuthUserVue3 | null = res && res.user ? res.user : null;
      if (!resolvedUser && res && res.token) {
        services.setToken(res.token);
        tokenWrittenForMe = true;
        try {
          const me = await services.fetchMe(controller.signal);
          resolvedUser = me && me.user ? me.user : null;
        } catch (err) {
          if (tokenWrittenForMe && epoch === authEpoch && services.user() === initialUser && services.token() === res.token) {
            services.setToken(initialToken);
          }
          if (isAbortErrorVue3(err)) {
            return { status: 'aborted' };
          }
          if (disposed || gen !== submitGen || epoch !== authEpoch || services.user() !== initialUser) {
            return { status: 'stale' };
          }
          throw err;
        }
        if (
          disposed ||
          gen !== submitGen ||
          epoch !== authEpoch ||
          services.user() !== initialUser ||
          services.token() !== res.token
        ) {
          if (tokenWrittenForMe && epoch === authEpoch && services.user() === initialUser && services.token() === res.token) {
            services.setToken(initialToken);
          }
          return { status: 'stale' };
        }
      }

      if (!resolvedUser) {
        if (tokenWrittenForMe && res?.token && epoch === authEpoch && services.user() === initialUser && services.token() === res.token) {
          services.setToken(initialToken);
        }
        throw new Error(services.t('获取用户信息失败，请稍后重试'));
      }

      applyingAuth = true;
      try {
        if (res && res.token && !tokenWrittenForMe) services.setToken(res.token);
        services.setUser(resolvedUser);
      } finally {
        applyingAuth = false;
      }
      return { status: 'ok', user: resolvedUser };
    } catch (err) {
      if (isAbortErrorVue3(err)) return { status: 'aborted' };
      if (disposed || gen !== submitGen || !isSessionIntact(epoch, initialUser, initialToken)) {
        return { status: 'stale' };
      }
      throw err;
    } finally {
      if (activeAbort === controller) activeAbort = null;
      if (!disposed && gen === submitGen) busy.value = false;
    }
  }

  onUnmounted(() => {
    disposed = true;
    activeAbort?.abort();
    activeAbort = null;
    offAuth();
  });

  return {
    busy,
    submitAuth,
    isDisposed: () => disposed,
  };
}
