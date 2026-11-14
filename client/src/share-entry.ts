import { createApp } from 'vue';
import ShareVue3 from './pages/Share.vue';
import { createCardDetailServicesVue3 } from './services';
import type { LegacyQslVue3, RouteContextVue3 } from './contracts';

export function mountShareVue3(root: HTMLElement, ctx: RouteContextVue3, qsl: LegacyQslVue3) {
  const token = ctx.params?.token || location.pathname.split('/')[2] || '';
  const app = createApp(ShareVue3, { token, services: createCardDetailServicesVue3(qsl) });
  app.mount(root);
  return () => app.unmount();
}
