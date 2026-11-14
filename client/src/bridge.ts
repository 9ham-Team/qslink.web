import type { LegacyQslVue3, RouteContextVue3 } from './contracts';

type MountVue3 = (root: HTMLElement, ctx: RouteContextVue3, qsl: LegacyQslVue3) => () => void;

export function registerHomeVue3(
  qsl: LegacyQslVue3,
  load: () => Promise<{ mountHomeVue3: MountVue3 }> = () => import('./home-entry'),
) {
  registerPageVue3(qsl, { name: 'home', title: '首页', loading: '正在连接 QSLink 电波…', error: '首页加载失败',
    load: () => load().then(module => module.mountHomeVue3) });
}

export function registerSpaceVue3(
  qsl: LegacyQslVue3,
  load: () => Promise<{ mountSpaceVue3: MountVue3 }> = () => import('./space-entry'),
) {
  registerPageVue3(qsl, { name: 'space', title: '个人主页', loading: '正在接收这位火腿的电波…', error: '主页加载失败',
    load: () => load().then(module => module.mountSpaceVue3) });
}

export function registerExploreVue3(qsl: LegacyQslVue3) {
  registerPageVue3(qsl, { name: 'explore', title: '卡片广场', loading: '正在寻找卡片…', error: '卡片加载失败',
    load: () => import('./explore-entry').then(module => module.mountExploreVue3) });
}

export function registerCardDetailVue3(
  qsl: LegacyQslVue3,
  load: () => Promise<{ mountCardDetailVue3: MountVue3 }> = () => import('./card-detail-entry'),
) {
  registerPageVue3(qsl, { name: 'card-detail', title: '卡片详情', loading: '正在接收卡片信息…', error: '卡片加载失败',
    load: () => load().then(module => module.mountCardDetailVue3) });
}

export function registerShareVue3(
  qsl: LegacyQslVue3,
  load: () => Promise<{ mountShareVue3: MountVue3 }> = () => import('./share-entry'),
) {
  registerPageVue3(qsl, { name: 'share', title: 'QSL 卡片分享', loading: '正在打开公开分享…', error: '分享页加载失败',
    load: () => load().then(module => module.mountShareVue3) });
}

export function registerLoginVue3(
  qsl: LegacyQslVue3,
  load: () => Promise<{ mountLoginVue3: MountVue3 }> = () => import('./login-entry'),
) {
  registerPageVue3(qsl, { name: 'login', title: '登录', loading: '正在准备登录…', error: '登录页加载失败',
    load: () => load().then(module => module.mountLoginVue3) });
}

export function registerRegisterVue3(
  qsl: LegacyQslVue3,
  load: () => Promise<{ mountRegisterVue3: MountVue3 }> = () => import('./register-entry'),
) {
  registerPageVue3(qsl, { name: 'register', title: '注册', loading: '正在准备注册…', error: '注册页加载失败',
    load: () => load().then(module => module.mountRegisterVue3) });
}

export function registerDashboardVue3(
  qsl: LegacyQslVue3,
  load: () => Promise<{ mountDashboardVue3: MountVue3 }> = () => import('./dashboard-entry'),
) {
  registerPageVue3(qsl, { name: 'dashboard', title: '个人中心', loading: '正在加载个人中心…', error: '个人中心加载失败',
    load: () => load().then(module => module.mountDashboardVue3) });
}

export function registerProfileVue3(
  qsl: LegacyQslVue3,
  load: () => Promise<{ mountProfileVue3: MountVue3 }> = () => import('./profile-entry'),
) {
  registerPageVue3(qsl, { name: 'profile', title: '个人资料', loading: '正在加载个人资料…', error: '个人资料加载失败',
    load: () => load().then(module => module.mountProfileVue3) });
}

export function registerMyCardsVue3(
  qsl: LegacyQslVue3,
  load: () => Promise<{ mountMyCardsVue3: MountVue3 }> = () => import('./my-cards-entry'),
) {
  registerPageVue3(qsl, { name: 'my-cards', title: '我的卡片', loading: '正在加载我的卡片…', error: '我的卡片加载失败',
    load: () => load().then(module => module.mountMyCardsVue3) });
}

export function registerCardEditorVue3(
  qsl: LegacyQslVue3,
  load: () => Promise<{ mountCardEditorVue3: MountVue3 }> = () => import('./card-editor-entry'),
) {
  registerPageVue3(qsl, { name: 'card-editor', title: '上传卡片', loading: '正在准备卡片编辑器…', error: '卡片编辑器加载失败',
    load: () => load().then(module => module.mountCardEditorVue3) });
}

export function registerExchangesVue3(
  qsl: LegacyQslVue3,
  load: () => Promise<{ mountExchangesVue3: MountVue3 }> = () => import('./exchanges-entry'),
) {
  registerPageVue3(qsl, { name: 'exchanges', title: '换卡申请', loading: '正在加载换卡申请…', error: '换卡申请加载失败',
    load: () => load().then(module => module.mountExchangesVue3) });
}

export function registerLogbookVue3(
  qsl: LegacyQslVue3,
  load: () => Promise<{ mountLogbookVue3: MountVue3 }> = () => import('./logbook-entry'),
) {
  registerPageVue3(qsl, { name: 'logbook', title: '通联日志', loading: '正在加载通联日志…', error: '通联日志加载失败',
    load: () => load().then(module => module.mountLogbookVue3) });
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
