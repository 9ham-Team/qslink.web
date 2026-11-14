import { createApp, type Component } from 'vue';
import { createContestServicesVue3 } from './services';
import type { ContestLegacyVue3 } from './contracts';
import type { LegacyQslVue3, RouteContextVue3 } from '../contracts';

export function mountContestVue3(root: HTMLElement, ctx: RouteContextVue3, qsl: LegacyQslVue3, component: Component, kind: string) {
  const app = createApp(component, { services: createContestServicesVue3(qsl as unknown as ContestLegacyVue3),
    ...(kind === 'landing' ? { alternate: ctx.path?.endsWith('/alternate') || false } : {}),
    ...(kind === 'works' ? { query: ctx.query } : {}), ...(kind === 'detail' ? { id: ctx.params.id } : {}),
  });
  app.mount(root);
  return () => app.unmount();
}
