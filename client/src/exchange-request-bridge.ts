import type { CardDetailVue3, ExchangeItemVue3, LegacyQslVue3 } from './contracts';
import { submittedLogsHtmlVue3 } from './exchange-utils';

type MountModalVue3 = (
  host: HTMLElement,
  card: CardDetailVue3,
  qsl: LegacyQslVue3,
  onClose: () => void,
) => () => void;

export function registerExchangeRequestBridgeVue3(
  qsl: LegacyQslVue3,
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

    const currentUser = qsl.state.user;
    const target = card || ({} as CardDetailVue3);

    if (!currentUser) {
      qsl.toast(qsl.t('登录后即可申请换卡'), 'info');
      const isGuestPage = /^\/(login|register)\b/.test(location.pathname);
      qsl.navigate(isGuestPage ? '/login' : '/login?next=' + encodeURIComponent(location.pathname + location.search));
      return null;
    }
    if (!target.id) {
      qsl.toast(qsl.t('卡片信息不完整，暂时无法申请'), 'error');
      return null;
    }
    if (target.owner && target.owner.id && target.owner.id === currentUser.id) {
      qsl.toast(qsl.t('这是你自己的卡片，不需要申请换卡'), 'info');
      return null;
    }
    if (target.status && target.status !== 'approved') {
      qsl.toast(qsl.t('这张卡片暂不可申请换卡'), 'info');
      return null;
    }
    if (target.stock === 0) {
      qsl.toast(qsl.t('这张卡片库存已空，暂不可申请换卡'), 'info');
      return null;
    }
    if (
      target.myExchange &&
      (target.myExchange.status === 'pending' || target.myExchange.status === 'approved')
    ) {
      qsl.toast(
        target.myExchange.status === 'pending'
          ? qsl.t('你已经申请过这张卡片，请等待对方处理')
          : qsl.t('你已经与对方达成了换卡'),
        'info',
      );
      return null;
    }

    const gen = ++openGen;
    const openedUserId = currentUser.id || null;
    const openedToken = typeof qsl.api.token === 'function' ? qsl.api.token() : null;
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

    offAuth = qsl.on('auth', () => {
      const nextToken = typeof qsl.api.token === 'function' ? qsl.api.token() : null;
      if (qsl.state.user?.id !== openedUserId || nextToken !== openedToken) {
        close();
      }
    });
    offRoute = qsl.on('route:before', () => {
      close();
    });

    void load()
      .then(module => {
        const currentToken = typeof qsl.api.token === 'function' ? qsl.api.token() : null;
        if (
          closed ||
          gen !== openGen ||
          qsl.state.user?.id !== openedUserId ||
          currentToken !== openedToken
        ) {
          return;
        }
        host = document.createElement('div');
        host.dataset.vue3 = 'exchange-request-host';
        document.body.appendChild(host);
        unmount = module.mountExchangeRequestModalVue3(host, target, qsl, close);
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
        qsl.toast(qsl.t('申请换卡面板打开失败，请刷新后重试'), 'error');
      });

    return session;
  }

  qsl.exchangeRequest = {
    recordsHtml: (exchange: ExchangeItemVue3) => submittedLogsHtmlVue3(exchange, qsl),
    open(card: CardDetailVue3) {
      try {
        return open(card);
      } catch (err) {
        console.error('[QSL.exchangeRequest]', err);
        qsl.toast(qsl.t('申请换卡面板打开失败，请刷新后重试'), 'error');
        return null;
      }
    },
  };
}
