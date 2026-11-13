import type { LegacyQslVue3, RouteContextVue3 } from './contracts-vue3';

type MountVue3 = (root: HTMLElement, ctx: RouteContextVue3, qsl: LegacyQslVue3) => () => void;

export function registerSpaceVue3(
  qsl: LegacyQslVue3,
  load: () => Promise<{ mountSpaceVue3: MountVue3 }> = () => import('./space-entry-vue3'),
) {
  qsl.registerPage('space', {
    title: qsl.t('个人主页'),
    render(root, ctx) {
      const host = document.createElement('div');
      host.dataset.vue3 = 'space';
      host.innerHTML = '<div class="container g-space"><p role="status">' +
        qsl.escapeHtml(qsl.t('正在接收这位火腿的电波…')) + '</p></div>';
      root.replaceChildren(host);
      let active = true;
      let unmount: (() => void) | undefined;
      let off: (() => void) | undefined;
      const dispose = () => {
        if (!active) return;
        active = false;
        off?.();
        unmount?.();
        host.remove();
      };
      // The legacy router awaits render(); this also covers navigation before
      // that router has stored our synchronous cleanup or the chunk has loaded.
      off = qsl.on('route:before', dispose);
      const mount = async () => {
        try {
          const module = await load();
          if (!active) return;
          unmount = module.mountSpaceVue3(host, ctx, qsl);
          if (!active) unmount();
        } catch (err) {
          if (!active) return;
          host.innerHTML = '<div class="container g-space g-error-panel"><h1>' +
            qsl.escapeHtml(qsl.t('主页加载失败')) + '</h1><button class="btn btn-primary" type="button">' +
            qsl.escapeHtml(qsl.t('重新加载')) + '</button></div>';
          host.querySelector('button')!.onclick = () => { void mount(); };
          qsl.toast(err instanceof Error ? err.message : qsl.t('主页加载失败'), 'error');
        }
      };
      void mount();
      return dispose;
    },
  });
}
