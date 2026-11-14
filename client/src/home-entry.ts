import { createApp } from 'vue';
import HomeVue3 from './pages/Home.vue';
import { createHomeServicesVue3 } from './services';
import type { LegacyQslVue3, RouteContextVue3 } from './contracts';

export function mountHomeVue3(root: HTMLElement, _ctx: RouteContextVue3, qsl: LegacyQslVue3) {
  const app = createApp(HomeVue3, { services: createHomeServicesVue3(qsl) });
  app.mount(root);
  return () => app.unmount();
}
