import { createApp } from 'vue';
import SpaceVue3 from './pages/Space.vue';
import { createServicesVue3 } from './services';
import type { LegacyQslVue3, RouteContextVue3 } from './contracts';

export function mountSpaceVue3(root: HTMLElement, ctx: RouteContextVue3, qsl: LegacyQslVue3) {
  const app = createApp(SpaceVue3, { uid: ctx.params.uid, services: createServicesVue3(qsl) });
  app.mount(root);
  return () => app.unmount();
}
