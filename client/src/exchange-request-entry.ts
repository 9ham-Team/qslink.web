import { createApp } from 'vue';
import ExchangeRequestModalVue3 from './components/ExchangeRequestModal.vue';
import type { CardDetailVue3, LegacyQslVue3 } from './contracts';
import { createExchangeRequestServicesVue3 } from './services';

export function mountExchangeRequestModalVue3(
  host: HTMLElement,
  card: CardDetailVue3,
  qsl: LegacyQslVue3,
  onClose: () => void,
): () => void {
  const app = createApp(ExchangeRequestModalVue3, {
    card,
    services: createExchangeRequestServicesVue3(qsl),
    onClose,
  });
  app.mount(host);
  return () => {
    app.unmount();
  };
}
