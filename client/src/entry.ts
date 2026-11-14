import { registerExchangeRequestBridgeVue3 } from './exchange-request-bridge';
import { exploreMemoryVue3 } from './explore-memory';
import { bootShellVue3 } from './shell-entry';

registerExchangeRequestBridgeVue3(window.QSL);
// One app-owned subscription, not one per visit; account changes invalidate all browsing snapshots.
window.QSL.on('auth', () => exploreMemoryVue3.clear());
// Vue Router owns all SPA history and the shell owns #app's route outlet.
// Legacy /admin is mounted only through the explicit LegacyPageHost route.
void bootShellVue3(window.QSL);
