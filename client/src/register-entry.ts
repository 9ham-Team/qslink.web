import { createApp } from 'vue';
import RegisterVue3 from './pages/Register.vue';
import { createAuthServicesVue3 } from './services';
import type { LegacyQslVue3, RouteContextVue3 } from './contracts';

export function mountRegisterVue3(root: HTMLElement, ctx: RouteContextVue3, qsl: LegacyQslVue3) {
  const nextRaw = ctx?.query?.get('next') ?? null;
  const app = createApp(RegisterVue3, {
    nextRaw,
    services: createAuthServicesVue3(qsl),
  });
  app.mount(root);
  return () => app.unmount();
}
