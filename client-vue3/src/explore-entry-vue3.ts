import { createApp } from 'vue';
import ExploreVue3 from './pages/Explore-vue3.vue';
import { createServicesVue3 } from './services-vue3';
import type { LegacyQslVue3, RouteContextVue3 } from './contracts-vue3';

export function mountExploreVue3(root: HTMLElement, ctx: RouteContextVue3, qsl: LegacyQslVue3) {
  const app = createApp(ExploreVue3, { query: ctx.query, services: createServicesVue3(qsl) });
  app.mount(root);
  return () => app.unmount();
}
