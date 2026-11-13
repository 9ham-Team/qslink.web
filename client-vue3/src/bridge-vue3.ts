import type { LegacyQslVue3, RouteContextVue3 } from './contracts-vue3';

type MountVue3 = (root: HTMLElement, ctx: RouteContextVue3, qsl: LegacyQslVue3) => () => void;

export function registerSpaceVue3(
  qsl: LegacyQslVue3,
  load: () => Promise<{ mountSpaceVue3: MountVue3 }> = () => import('./space-entry-vue3'),
) {
  registerPageVue3(qsl, { name: 'space', title: '个人主页', loading: '正在接收这位火腿的电波…', error: '主页加载失败',
    load: () => load().then(module => module.mountSpaceVue3) });
}

export function registerExploreVue3(qsl: LegacyQslVue3) {
  registerPageVue3(qsl, { name: 'explore', title: '卡片广场', loading: '正在寻找卡片…', error: '卡片加载失败',
    load: () => import('./explore-entry-vue3').then(module => module.mountExploreVue3) });
}

export function registerPageVue3(qsl: LegacyQslVue3, page: {
  name: string; title: string; loading: string; error: string; load: () => Promise<MountVue3>;
}) {
  qsl.registerPage(page.name, {
    title: qsl.t(page.title),
    render(root, ctx) {
      const host = document.createElement('div');
      host.dataset.vue3 = page.name;
      host.innerHTML = '<div class="container section"><p role="status">' +
        qsl.escapeHtml(qsl.t(page.loading)) + '</p></div>';
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
          const mountPage = await page.load();
          if (!active) return;
          unmount = mountPage(host, ctx, qsl);
          if (!active) unmount();
        } catch (err) {
          if (!active) return;
          host.innerHTML = '<div class="container g-error-panel"><h1>' +
            qsl.escapeHtml(qsl.t(page.error)) + '</h1><button class="btn btn-primary" type="button">' +
            qsl.escapeHtml(qsl.t('重新加载')) + '</button></div>';
          host.querySelector('button')!.onclick = () => { void mount(); };
          qsl.toast(err instanceof Error ? err.message : qsl.t(page.error), 'error');
        }
      };
      void mount();
      return dispose;
    },
  });
}
