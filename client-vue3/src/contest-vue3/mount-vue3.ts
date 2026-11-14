import { createApp, type Component } from 'vue';
import { createContestServicesVue3 } from './services-vue3';
import type { ContestLegacyVue3 } from './contracts-vue3';
import type { LegacyQslVue3, RouteContextVue3 } from '../contracts-vue3';

export function mountContestVue3(root: HTMLElement, ctx: RouteContextVue3, qsl: LegacyQslVue3, component: Component, kind: string) {
  const app = createApp(component, { services: createContestServicesVue3(qsl as ContestLegacyVue3),
    ...(kind === 'landing' ? { alternate: ctx.path?.endsWith('/alternate') || false } : {}),
    ...(kind === 'works' ? { query: ctx.query } : {}), ...(kind === 'detail' ? { id: ctx.params.id } : {}),
  });
  app.mount(root);
  return () => app.unmount();
}
