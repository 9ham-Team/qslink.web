import { createApp } from 'vue';
import type { LegacyQslVue3, RouteContextVue3 } from './contracts';
import DashboardVue3 from './pages/Dashboard.vue';
import { createAccountServicesVue3 } from './services';

export function mountDashboardVue3(root: HTMLElement, _ctx: RouteContextVue3, qsl: LegacyQslVue3) {
  const app = createApp(DashboardVue3, { services: createAccountServicesVue3(qsl) });
  app.mount(root);
  return () => app.unmount();
}
