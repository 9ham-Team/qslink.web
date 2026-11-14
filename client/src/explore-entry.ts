import { createApp } from 'vue';
import ExploreVue3 from './pages/Explore.vue';
import { createServicesVue3 } from './services';
import type { LegacyQslVue3, RouteContextVue3 } from './contracts';
import { createExploreVisitVue3 } from './explore-memory';

export function mountExploreVue3(root: HTMLElement, ctx: RouteContextVue3, qsl: LegacyQslVue3) {
  const visit = createExploreVisitVue3(ctx, () => qsl.state.user?.uid || null);
  const app = createApp(ExploreVue3, { query: ctx.query, services: createServicesVue3(qsl), visit });
  app.mount(root);
  return () => app.unmount();
}
