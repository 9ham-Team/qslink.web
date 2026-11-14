import { createApp } from 'vue';
import LoginVue3 from './pages/Login.vue';
import { createAuthServicesVue3 } from './services';
import type { LegacyQslVue3, RouteContextVue3 } from './contracts';

export function mountLoginVue3(root: HTMLElement, ctx: RouteContextVue3, qsl: LegacyQslVue3) {
  const nextRaw = ctx?.query?.get('next') ?? null;
  const app = createApp(LoginVue3, {
    nextRaw,
    services: createAuthServicesVue3(qsl),
  });
  app.mount(root);
  return () => app.unmount();
}
