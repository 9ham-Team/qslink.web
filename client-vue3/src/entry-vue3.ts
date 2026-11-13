import { registerSpaceVue3 } from './bridge-vue3';

registerSpaceVue3(window.QSL);
// The shell starts only after bridge registration. It remains the sole owner
// of history, auth, navigation, modal and toast during this migration stage.
const shell = document.createElement('script');
shell.src = '/js/app.js';
shell.onerror = () => window.QSL.toast(window.QSL.t('页面加载失败'), 'error');
document.body.appendChild(shell);
