import { createApp } from 'vue';
import type { LegacyQslVue3, RouteContextVue3 } from './contracts';
import LogbookVue3 from './pages/Logbook.vue';
import { createLogbookServicesVue3 } from './services';

export function mountLogbookVue3(root: HTMLElement, _ctx: RouteContextVue3, qsl: LegacyQslVue3): () => void {
  const app = createApp(LogbookVue3, { services: createLogbookServicesVue3(qsl) });
  app.mount(root);
  return () => app.unmount();
}
