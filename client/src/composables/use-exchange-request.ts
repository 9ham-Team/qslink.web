import { onBeforeUnmount } from 'vue';
import type { CardDetailServicesVue3, CardDetailVue3 } from '../contracts';

export function useExchangeRequestVue3(services: CardDetailServicesVue3) {
  let active = true;
  let generation = 0;
  let retryTimer = 0;
  let handle: { close(): void } | null = null;

  function cancel() {
    generation++;
    window.clearTimeout(retryTimer);
    retryTimer = 0;
    handle?.close();
    handle = null;
  }

  function open(card: CardDetailVue3) {
    if (!active) return;
    if (services.isExchangeReady()) {
      handle = services.openExchange(card);
      return;
    }
    if (retryTimer) return;
    const expected = generation;
    services.toast(services.t('换卡申请加载中，请稍后再试'), 'info');
    retryTimer = window.setTimeout(() => {
      retryTimer = 0;
      if (!active || generation !== expected) return;
      if (services.isExchangeReady()) {
        handle = services.openExchange(card);
      } else {
        services.toast(services.t('换卡功能尚未就绪，请刷新页面后重试'), 'error');
      }
    }, 900);
  }

  onBeforeUnmount(() => {
    active = false;
    cancel();
  });

  return { open, cancel };
}
