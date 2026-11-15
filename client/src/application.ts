import { createPinia } from 'pinia';
import type { ApplicationContext } from './contracts';
import { createRuntimeStoreVue3 } from './state';
import { createEvents } from './events';
import { createLabels } from './labels';
import { createI18n } from './lib/i18n.js';
import { createFormatting } from './lib/formatting.js';
import { createImages } from './lib/images.js';
import { createIcons } from './lib/icons.js';
import { createApi } from './lib/api.js';
import { createCard3dEngine } from './lib/card3d.js';
import { createImageTools } from './lib/image-upload.js';
import { createQr } from './lib/qr.js';
import { createPosterPalette } from './lib/poster-palette.js';
import { createPosterRenderer } from './lib/poster.js';
import { createEffects } from './lib/effects.js';
import { createDialogService } from './dialog-service';
import { createSharing } from './sharing';
import { showToastVue3 } from './toast-store';
import { createExchangeRequestService } from './exchange-request-service';

export function createApplication(): ApplicationContext {
  const pinia = createPinia(), events = createEvents(), i18n = createI18n();
  const store = createRuntimeStoreVue3(pinia, user => events.emit('auth', user));
  const formatting = createFormatting(i18n);
  const images = createImages({ escapeHtml: formatting.escapeHtml });
  const icon = createIcons(formatting.escapeHtml), dialogs = createDialogService(i18n.t);
  const api = createApi({
    t: i18n.t, error: i18n.error, language: i18n.language,
    clearUser: () => store.setUser(null, true),
    tokenChanged: (previous: string | null, next: string | null) => store.noteTokenChange(previous, next),
    toast: showToastVue3,
  });
  const qr = createQr(i18n.t);
  const sharing = createSharing(api, createPosterRenderer({ t: i18n.t, qr, images, posterPalette: createPosterPalette() }), qr);
  const copyText = async (text: string, message: string) => {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
    else {
      const previous = document.activeElement as HTMLElement | null;
      const input = document.createElement('textarea');
      input.value = text; input.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.append(input);
      try { input.select(); if (!document.execCommand('copy')) throw new Error(i18n.t('复制失败，请手动复制')); }
      finally { input.remove(); previous?.focus({ preventScroll: true }); }
    }
    showToastVue3(message, 'success');
  };
  const notReady=():never=>{throw new Error("Navigation is not initialized");};
  const context: ApplicationContext = {
    pinia, store, api, i18n, t: i18n.t, images, icon, sharing, dialogs,
    escapeHtml:formatting.escapeHtml,PLACEHOLDER_IMAGE:formatting.PLACEHOLDER_IMAGE,
    formatDate:formatting.formatDate,formatDateTime:formatting.formatDateTime,formatNumber:formatting.formatNumber,
    timeAgo:formatting.timeAgo,ratioLabel:formatting.ratioLabel,safeNext:formatting.safeNext,footerBuildText:formatting.footerBuildText,
    ...createLabels(i18n.t),navigate:notReady,setQuery:notReady,scrollToHash:notReady,
    on: events.on, emit: events.emit, toast: showToastVue3, confirm: dialogs.confirm, copyText,
    setUser: (user: ApplicationContext['store']['user']) => store.setUser(user, true),
    card3d: createCard3dEngine({ t: i18n.t, images, icon, escapeHtml: formatting.escapeHtml }),
    imageUpload: createImageTools(i18n.t, () => new Worker(new URL('./image-upload.worker.js', import.meta.url), { type: 'module' })),
    fx: createEffects(),
    AVATAR_COLORS: ['#0eaf8f','#14b8a6','#38bdf8','#6366f1','#8b5cf6','#ec4899','#fb7185','#f59e0b','#84cc16','#0ea5e9'],
    shareCard: async (card: any) => copyText(await sharing.getUrl(card), i18n.t('分享链接已复制，快发给朋友吧')),
  };
  context.exchangeRequest = createExchangeRequestService(context);
  context.dispose = () => { context.exchangeRequest?.closeAll?.(); dialogs.closeAll(); context.fx?.dispose?.(); i18n.dispose(); events.clear(); };
  return context;
}
