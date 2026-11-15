import type { CardDetailVue3, ApplicationContext } from './contracts';

type MountModalVue3 = (
  host: HTMLElement,
  card: CardDetailVue3,
  platform: ApplicationContext,
  onClose: () => void,
) => () => void;

export function createExchangeRequestService(
  platform: ApplicationContext,
  load: () => Promise<{ mountExchangeRequestModalVue3: MountModalVue3 }> = () =>
    import('./exchange-request-entry'),
) {
  let openGen = 0;
  let activeSession: { close(): void } | null = null;

  function open(card: CardDetailVue3): { close(): void } | null {
    if (activeSession) {
      const existing = activeSession;
      return { close: () => existing.close() };
    }

    const currentUser = platform.store.user;
    const target = card || ({} as CardDetailVue3);

    if (!currentUser) {
      platform.toast(platform.t('登录后即可申请换卡'), 'info');
      const isGuestPage = /^\/(login|register)\b/.test(location.pathname);
      platform.navigate(isGuestPage ? '/login' : '/login?next=' + encodeURIComponent(location.pathname + location.search));
      return null;
    }
    if (!target.id) {
      platform.toast(platform.t('卡片信息不完整，暂时无法申请'), 'error');
      return null;
    }
    if (target.owner && target.owner.id && target.owner.id === currentUser.id) {
      platform.toast(platform.t('这是你自己的卡片，不需要申请换卡'), 'info');
      return null;
    }
    if (target.status && target.status !== 'approved') {
      platform.toast(platform.t('这张卡片暂不可申请换卡'), 'info');
      return null;
    }
    if (target.stock === 0) {
      platform.toast(platform.t('这张卡片库存已空，暂不可申请换卡'), 'info');
      return null;
    }
    if (
      target.myExchange &&
      (target.myExchange.status === 'pending' || target.myExchange.status === 'approved')
    ) {
      platform.toast(
        target.myExchange.status === 'pending'
          ? platform.t('你已经申请过这张卡片，请等待对方处理')
          : platform.t('你已经与对方达成了换卡'),
        'info',
      );
      return null;
    }

    const gen = ++openGen;
    const openedUserId = currentUser.id || null;
    const openedToken = typeof platform.api.token === 'function' ? platform.api.token() : null;
    let closed = false;
    let unmount: (() => void) | undefined;
    let host: HTMLElement | null = null;
    let offAuth = () => {};
    let offRoute = () => {};

    const close = () => {
      if (closed) return;
      closed = true;
      openGen++;
      offAuth();
      offRoute();
      if (activeSession === session) activeSession = null;
      unmount?.();
      unmount = undefined;
      host?.remove();
      host = null;
    };

    const session = { close };
    activeSession = session;

    offAuth = platform.on('auth', () => {
      const nextToken = typeof platform.api.token === 'function' ? platform.api.token() : null;
      if (platform.store.user?.id !== openedUserId || nextToken !== openedToken) {
        close();
      }
    });
    offRoute = platform.on('route:before', () => {
      close();
    });

    void load()
      .then(module => {
        const currentToken = typeof platform.api.token === 'function' ? platform.api.token() : null;
        if (
          closed ||
          gen !== openGen ||
          platform.store.user?.id !== openedUserId ||
          currentToken !== openedToken
        ) {
          return;
        }
        host = document.createElement('div');
        host.dataset.vue3 = 'exchange-request-host';
        document.body.appendChild(host);
        unmount = module.mountExchangeRequestModalVue3(host, target, platform, close);
        if (closed) {
          unmount?.();
          unmount = undefined;
          host?.remove();
          host = null;
        }
      })
      .catch(err => {
        if (closed || gen !== openGen) return;
        console.error('[QSL.exchangeRequest]', err);
        close();
        platform.toast(platform.t('申请换卡面板打开失败，请刷新后重试'), 'error');
      });

    return session;
  }

  return {
    closeAll() { activeSession?.close(); },
    open(card: CardDetailVue3) {
      try {
        return open(card);
      } catch (err) {
        console.error('[QSL.exchangeRequest]', err);
        platform.toast(platform.t('申请换卡面板打开失败，请刷新后重试'), 'error');
        return null;
      }
    },
  };
}
