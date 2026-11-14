import { createApp } from 'vue';
import MyCardsVue3 from './pages/MyCards.vue';
import type { LegacyQslVue3, RouteContextVue3 } from './contracts';
import { createCardManageServicesVue3 } from './services';

export function mountMyCardsVue3(root: HTMLElement, ctx: RouteContextVue3, qsl: LegacyQslVue3) {
  const app = createApp(MyCardsVue3, { ctx, services: createCardManageServicesVue3(qsl) });
  app.mount(root);
  return () => app.unmount();
}
