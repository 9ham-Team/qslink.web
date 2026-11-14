import { createApp } from 'vue';
import type { LegacyQslVue3, RouteContextVue3 } from './contracts';
import ExchangesVue3 from './pages/Exchanges.vue';
import { createExchangeServicesVue3 } from './services';

export function mountExchangesVue3(root: HTMLElement, ctx: RouteContextVue3, qsl: LegacyQslVue3): () => void {
  const app = createApp(ExchangesVue3, { ctx, services: createExchangeServicesVue3(qsl) });
  app.mount(root);
  return () => app.unmount();
}
