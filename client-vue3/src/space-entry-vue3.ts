import { createApp } from 'vue';
import SpaceVue3 from './pages/Space-vue3.vue';
import { createServicesVue3 } from './services-vue3';
import type { LegacyQslVue3, RouteContextVue3 } from './contracts-vue3';

export function mountSpaceVue3(root: HTMLElement, ctx: RouteContextVue3, qsl: LegacyQslVue3) {
  const app = createApp(SpaceVue3, { uid: ctx.params.uid, services: createServicesVue3(qsl) });
  app.mount(root);
  return () => app.unmount();
}
