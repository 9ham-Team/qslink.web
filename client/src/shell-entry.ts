import { createApp, type App } from 'vue';
import AppShellVue3 from './components/AppShell.vue';
import type { ApplicationContext } from './contracts';
import { clearModalStackVue3 } from './modal-stack';
import {
  createRouterRuntimeVue3,
  installNavigation,
  ROUTER_RUNTIME_VUE3,
} from './router';
import { createSessionRuntimeVue3 } from './session';
import type { RuntimeStoreVue3 } from './state';
import { clearAllToastsVue3, showToastVue3 } from './toast-store';

let activeHandle: { unmount(): void } | null = null;

export async function bootShellVue3(platform: ApplicationContext): Promise<{ unmount(): void }> {
  if (activeHandle) return activeHandle;

  const skip = document.querySelector('.skip-link');
  if (skip) skip.textContent = platform.t('跳到主要内容');
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description && platform.i18n?.language === 'en') {
    description.content =
      'A QSL card exchange community for amateur radio operators. Upload double-sided cards, explore them in 3D, and exchange cards with fellow hams.';
  }

  const appEl = document.getElementById('app');
  if (appEl && !appEl.children.length) {
    appEl.innerHTML =
      '<div class="boot-splash"><span class="spinner spinner-lg"></span>' +
      '<span>' + platform.escapeHtml(platform.t('正在连接 QSLink 电波…')) + '</span></div>';
  }

  const pinia = platform.pinia;
  if (!pinia) throw new Error('Application Pinia is not initialized');
  const store = platform.store as RuntimeStoreVue3;
  const runtime = createRouterRuntimeVue3(platform, store);
  const routerHandle = installNavigation(platform, store, runtime);
  const session = createSessionRuntimeVue3(platform, store, runtime.router);
  const initialBoot = session.boot();
  store.ready = initialBoot;

  const host = document.createElement('div');
  host.dataset.vue3 = 'shell-root';
  host.style.display = 'contents';
  document.body.appendChild(host);

  const app: App = createApp(AppShellVue3, { platform });
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
      platform.dispose?.();
      routerHandle.dispose();
      host.remove();
      clearAllToastsVue3();
      clearModalStackVue3();
    },
  };
  activeHandle = handle;

  await initialBoot;
  await runtime.router.isReady();
  platform.navigation?.start?.();

  return handle;
}
