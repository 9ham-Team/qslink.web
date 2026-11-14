import { createApp } from 'vue';
import type { LegacyQslVue3, RouteContextVue3 } from './contracts';
import ProfileVue3 from './pages/Profile.vue';
import { createAccountServicesVue3 } from './services';

export function mountProfileVue3(root: HTMLElement, _ctx: RouteContextVue3, qsl: LegacyQslVue3) {
  const app = createApp(ProfileVue3, { services: createAccountServicesVue3(qsl) });
  app.mount(root);
  return () => app.unmount();
}
