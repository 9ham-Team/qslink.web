import './runtime';
import { registerExchangeRequestBridgeVue3 } from './exchange-request-bridge';
import { exploreMemoryVue3 } from './explore-memory';
import { bootShellVue3 } from './shell-entry';

if (window.QSL.imageUpload) window.QSL.imageUpload.createWorker = () => new Worker(new URL('./image-upload.worker.js', import.meta.url), { type: 'module' });
registerExchangeRequestBridgeVue3(window.QSL);
// One app-owned subscription, not one per visit; account changes invalidate all browsing snapshots.
window.QSL.on('auth', () => exploreMemoryVue3.clear());
// Vue Router owns all SPA history and the shell owns #app's route outlet.
// All business pages, including administration, are Vue components.
void bootShellVue3(window.QSL);
