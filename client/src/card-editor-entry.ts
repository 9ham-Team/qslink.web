import { createApp } from 'vue';
import CardEditorVue3 from './pages/CardEditor.vue';
import type { LegacyQslVue3, RouteContextVue3 } from './contracts';
import { createCardManageServicesVue3 } from './services';

export function mountCardEditorVue3(root: HTMLElement, ctx: RouteContextVue3, qsl: LegacyQslVue3) {
  const app = createApp(CardEditorVue3, { ctx, services: createCardManageServicesVue3(qsl) });
  app.mount(root);
  return () => app.unmount();
}
