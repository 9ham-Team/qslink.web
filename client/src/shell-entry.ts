import { createApp, type App } from 'vue';
import { createPinia } from 'pinia';
import AppShellVue3 from './components/AppShell.vue';
import type { LegacyQslVue3 } from './contracts';
import { confirmModalVue3, openModalVue3 } from './modal-bridge';
import { clearModalStackVue3 } from './modal-stack';
import {
  createRouterRuntimeVue3,
  installQslRouterVue3,
  ROUTER_RUNTIME_VUE3,
} from './router';
import { createSessionRuntimeVue3 } from './session';
import {
  createRuntimeStoreVue3,
  installQslStateBridgeVue3,
} from './state';
import { clearAllToastsVue3, showToastVue3 } from './toast-store';

let activeHandle: { unmount(): void } | null = null;

export async function bootShellVue3(qsl: LegacyQslVue3): Promise<{ unmount(): void }> {
  if (activeHandle) return activeHandle;

  const skip = document.querySelector('.skip-link');
  if (skip) skip.textContent = qsl.t('跳到主要内容');
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description && qsl.i18n?.language === 'en') {
    description.content =
      'A QSL card exchange community for amateur radio operators. Upload double-sided cards, explore them in 3D, and exchange cards with fellow hams.';
  }

  const appEl = document.getElementById('app');
  if (appEl && !appEl.children.length) {
    appEl.innerHTML =
      '<div class="boot-splash"><span class="spinner spinner-lg"></span>' +
      '<span>' + qsl.escapeHtml(qsl.t('正在连接 QSLink 电波…')) + '</span></div>';
  }

  qsl.toast = (message, type, duration) => showToastVue3(message, type, duration);
  qsl.modal = options => openModalVue3(options, qsl.t);
  qsl.confirm = options => confirmModalVue3(options, qsl.t);

  qsl.fx?.setExternalBackground?.(true);
  try {
    qsl.fx?.init?.({ externalBackground: true });
  } catch (err) {
    console.error('[QSL] fx init error:', err);
  }

  const pinia = createPinia();
  const store = createRuntimeStoreVue3(pinia, user => qsl.emit?.('auth', user));
  installQslStateBridgeVue3(qsl, store);
  const runtime = createRouterRuntimeVue3(qsl, store);
  const routerHandle = installQslRouterVue3(qsl, store, runtime);
  const session = createSessionRuntimeVue3(qsl, store, runtime.router);
  const initialBoot = session.boot();
  store.ready = initialBoot;

  const host = document.createElement('div');
  host.dataset.vue3 = 'shell-root';
  host.style.display = 'contents';
  document.body.appendChild(host);

  const app: App = createApp(AppShellVue3, { qsl });
  app.provide(ROUTER_RUNTIME_VUE3, runtime);
  app.use(pinia);
  app.use(runtime.router);
  appEl?.replaceChildren();
  app.mount(host);

  const handle = {
    unmount() {
      if (activeHandle !== handle) return;
      activeHandle = null;
      app.unmount();
      routerHandle.dispose();
      host.remove();
      clearAllToastsVue3();
      clearModalStackVue3();
    },
  };
  activeHandle = handle;

  await initialBoot;
  await runtime.router.isReady();
  qsl.router?.start?.();

  return handle;
}
