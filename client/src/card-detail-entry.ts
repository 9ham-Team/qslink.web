import { createApp } from 'vue';
import CardDetailVue3 from './pages/CardDetail.vue';
import { createCardDetailServicesVue3 } from './services';
import type { LegacyQslVue3, RouteContextVue3 } from './contracts';

export function mountCardDetailVue3(root: HTMLElement, ctx: RouteContextVue3, qsl: LegacyQslVue3) {
  const cardId = ctx.params?.id || location.pathname.split('/')[2] || '';
  const app = createApp(CardDetailVue3, { cardId, services: createCardDetailServicesVue3(qsl) });
  app.mount(root);
  return () => app.unmount();
}
