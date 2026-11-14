import { registerExploreVue3, registerSpaceVue3 } from './bridge-vue3';
import { exploreMemoryVue3 } from './explore-memory-vue3';
import { registerContestPagesVue3 } from './contest-bridge-vue3';

registerSpaceVue3(window.QSL);
registerExploreVue3(window.QSL);
registerContestPagesVue3(window.QSL);
// One app-owned subscription, not one per visit; account changes invalidate all browsing snapshots.
window.QSL.on('auth', () => exploreMemoryVue3.clear());
// The shell starts only after bridge registration. It remains the sole owner
// of history, auth, navigation, modal and toast during this migration stage.
const shell = document.createElement('script');
shell.src = '/js/app.js';
shell.onerror = () => window.QSL.toast(window.QSL.t('页面加载失败'), 'error');
document.body.appendChild(shell);
