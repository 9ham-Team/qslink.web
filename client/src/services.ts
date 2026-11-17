import ProfileLinkDialog from './components/ProfileLinkDialog.vue';
import type {
  AccountServicesVue3,
  AnnouncementPageVue3,
  ApplicantCardsResponseVue3,
  AuthResponseVue3,
  AuthServicesVue3,
  AuthUserVue3,
  CardCreatePayloadVue3,
  CardDetailResponseVue3,
  CardDetailServicesVue3,
  CardManageServicesVue3,
  CardPageVue3,
  CardUpdatePayloadVue3,
  ContestEntrySummaryVue3,
  ExchangeCreatePayloadVue3,
  ExchangeItemVue3,
  ExchangeListResponseVue3,
  ExchangeRequestServicesVue3,
  ExchangeServicesVue3,
  HomeServicesVue3,
  HomeStatsVue3,
  ApplicationContext,
  LogbookImportResultVue3,
  LogbookPageResponseVue3,
  LogbookServicesVue3,
  MyCardItemVue3,
  OverviewResponseVue3,
  SelfUserVue3,
  ServicesVue3,
  SpaceResponseVue3,
} from './contracts';

export function createServicesVue3(platform: ApplicationContext): ServicesVue3 {
  return {
    t: platform.t,
    user: () => platform.store.user,
    onAuth: fn => platform.on('auth', fn),
    getSpace: (uid, sort, page, signal) => platform.api.get<SpaceResponseVue3>(
      '/api/public/spaces/' + encodeURIComponent(uid) + '?' + new URLSearchParams({ sort, page: String(page), limit: '12' }),
      { signal },
    ),
    listCards: (filters, page, signal) => {
      const query = new URLSearchParams({ sort: filters.sort, page: String(page), limit: '12' });
      if (filters.callSign) query.set('callSign', filters.callSign);
      return platform.api.get<CardPageVue3>('/api/cards?' + query, { signal });
    },
    setQuery: patch => {
      try { platform.setQuery(patch); } catch { /* History limits must not prevent filtering. */ }
    },
    celebrate: (x, y) => { platform.fx?.confetti(x, y); },
    likeCard: id => platform.api.cards.like(id),
    image: (img, src, width) => platform.images.apply(img, src, width),
    placeholder: platform.PLACEHOLDER_IMAGE,
    formatDate: platform.formatDate,
    formatNumber: platform.formatNumber,
    navigate: (path, options) => platform.navigate(path, options),
    toast: (message, type) => platform.toast(message, type),
    share: url => platform.dialogs.open(ProfileLinkDialog, { url, t: platform.t, copy: platform.copyText }),
  };
}

export function createHomeServicesVue3(platform: ApplicationContext): HomeServicesVue3 {
  return {
    ...createServicesVue3(platform),
    getHomeCards: signal => platform.api.get<CardPageVue3>('/api/cards?sort=popular&limit=48', { signal }),
    getStats: signal => platform.api.get<HomeStatsVue3>('/api/stats', { signal }),
    listAnnouncements: ({ page, limit, reminder }, signal) => {
      const query = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (reminder) query.set('reminder', '1');
      return platform.api.get<AnnouncementPageVue3>('/api/announcements?' + query, { signal });
    },
    dismissAnnouncement: (id, signal) => platform.api.post<{ dismissed: boolean }>(
      '/api/announcements/' + encodeURIComponent(id) + '/dismiss',
      {},
      { signal },
    ),
    formatDateTime: value => platform.formatDateTime(value),
    scrollToHash: () => platform.scrollToHash(),
    createViewer: (root, options) => platform.card3d.create(root, options),
  };
}

export function createCardDetailServicesVue3(platform: ApplicationContext): CardDetailServicesVue3 {
  return {
    ...createServicesVue3(platform),
    getCardDetail: (id, signal) => platform.api.get<CardDetailResponseVue3>(
      '/api/cards/' + encodeURIComponent(id),
      { signal },
    ),
    getPublicCard: (token, signal) => platform.api.get<CardDetailResponseVue3>(
      '/api/public/cards/' + encodeURIComponent(token),
      { signal },
    ),
    getPopularCards: signal => platform.api.get<CardPageVue3>('/api/cards?sort=popular&limit=8', { signal }),
    createViewer: (root, options) => platform.card3d.create(root, options),
    sharing: platform.sharing,
    openExchange(card) {
      if (!platform.exchangeRequest || typeof platform.exchangeRequest.open !== 'function') return null;
      const handle = platform.exchangeRequest.open(card);
      return handle && typeof handle.close === 'function' ? handle : null;
    },
    isExchangeReady: () => !!(platform.exchangeRequest && typeof platform.exchangeRequest.open === 'function'),
    copyText: (text, message) => platform.copyText(text, message),
    timeAgo: value => platform.timeAgo(value),
    ratioLabel: ratio => platform.ratioLabel(ratio),
    statusText: status => platform.statusText(status),
    exchangeText: status => platform.exchangeText(status),
    heartbeat(el) {
      platform.fx?.heartbeat?.(el);
    },
  };
}

export function createAuthServicesVue3(platform: ApplicationContext): AuthServicesVue3 {
  return {
    ...createServicesVue3(platform),
    token: () => (typeof platform.api.token === 'function' ? platform.api.token() : null),
    setToken: token => platform.api.setToken?.(token),
    setUser: user => platform.setUser?.(user),
    safeNext: raw => (typeof platform.safeNext === 'function' ? platform.safeNext(raw) : null),
    config: () => platform.store.config || { demo: false, demoAccounts: [] },
    login: (payload, signal) => platform.api.post<AuthResponseVue3>('/api/auth/login', payload, { signal }),
    register: (payload, signal) => platform.api.post<AuthResponseVue3>('/api/auth/register', payload, { signal }),
    sendEmailCode: (email, signal) => platform.api.post<{ ok: boolean; expiresIn?: number; retryAfter?: number }>(
      '/api/auth/email-code',
      { email },
      { signal, skipAuthClear: true },
    ),
    fetchMe: signal => (platform.api.auth && typeof platform.api.auth.me === 'function'
      ? platform.api.auth.me({ signal, skipAuthClear: true })
      : platform.api.get<{ user?: AuthUserVue3 | null }>('/api/auth/me', { signal, skipAuthClear: true })),
  };
}

const DEFAULT_AVATAR_COLORS = ['#0eaf8f', '#14b8a6', '#38bdf8', '#6366f1', '#8b5cf6', '#ec4899', '#fb7185', '#f59e0b', '#84cc16', '#0ea5e9'];

export function createAccountServicesVue3(platform: ApplicationContext): AccountServicesVue3 {
  return {
    ...createServicesVue3(platform),
    token: () => (typeof platform.api.token === 'function' ? platform.api.token() : null),
    setUser: user => platform.setUser?.(user),
    avatarColors: () => (Array.isArray(platform.AVATAR_COLORS) && platform.AVATAR_COLORS.length ? platform.AVATAR_COLORS.slice() : DEFAULT_AVATAR_COLORS.slice()),
    timeAgo: value => platform.timeAgo(value),
    language: () => (platform.i18n && platform.i18n.language) || 'zh-CN',
    getOverview: signal => platform.api.get<OverviewResponseVue3>('/api/me/overview', { signal }),
    updateProfile: (payload, signal) => platform.api.put<{ user: SelfUserVue3 }>('/api/me/profile', payload, { signal }),
    updatePassword: async (payload, signal) => {
      const requestToken = typeof platform.api.token === 'function' ? platform.api.token() : null;
      try {
        return await platform.api.put<{ ok: boolean }>('/api/me/password', payload, { signal, skipAuthClear: true });
      } catch (err) {
        const apiErr = err as { status?: number; code?: string };
        const currentToken = typeof platform.api.token === 'function' ? platform.api.token() : null;
        if (
          apiErr &&
          apiErr.status === 401 &&
          apiErr.code !== 'INVALID_CREDENTIALS' &&
          requestToken &&
          currentToken === requestToken
        ) {
          platform.api.setToken?.(null);
          platform.setUser?.(null);
          platform.toast(platform.t('登录已过期，请重新登录'), 'error');
        }
        throw err;
      }
    },
    getApplicantCards: (exchangeId, page, signal) => platform.api.get<ApplicantCardsResponseVue3>(
      '/api/exchanges/' + encodeURIComponent(exchangeId) + '/applicant-cards?page=' + page + '&limit=48',
      { signal },
    ),
    approveExchange: (exchangeId, payload, signal) => platform.api.post<{ exchange: ExchangeItemVue3 }>(
      '/api/exchanges/' + encodeURIComponent(exchangeId) + '/approve',
      payload,
      { signal },
    ),
    rejectExchange: (exchangeId, payload, signal) => platform.api.post<{ exchange: ExchangeItemVue3 }>(
      '/api/exchanges/' + encodeURIComponent(exchangeId) + '/reject',
      payload,
      { signal },
    ),
  };
}

export function createCardManageServicesVue3(platform: ApplicationContext): CardManageServicesVue3 {
  return {
    ...createServicesVue3(platform),
    token: () => (typeof platform.api.token === 'function' ? platform.api.token() : null),
    i18nError: source => (platform.i18n && typeof platform.i18n.error === 'function' ? platform.i18n.error(source) : platform.t(source)),
    resetEdits: () => { platform.i18n?.resetEdits?.(); },
    isLanguageSwitching: () => !!(platform.i18n && platform.i18n.switching),
    timeAgo: value => platform.timeAgo(value),
    statusText: status => platform.statusText(status),
    getMyCards: signal => platform.api.get<{ items: MyCardItemVue3[] }>('/api/me/cards', { signal }),
    getCardDetail: (id, signal) => platform.api.get<CardDetailResponseVue3>('/api/cards/' + encodeURIComponent(id), { signal }),
    createCard: (payload: CardCreatePayloadVue3, signal: AbortSignal) =>
      platform.api.post<{ card: MyCardItemVue3; contestAutoEntry?: unknown }>('/api/cards', payload, { signal }),
    updateCard: (id: string, payload: CardUpdatePayloadVue3, signal: AbortSignal) =>
      platform.api.put<{ card: MyCardItemVue3; contestAutoEntry?: unknown }>('/api/cards/' + encodeURIComponent(id), payload, { signal }),
    updateCardStock: (id, stock, signal) =>
      platform.api.put<{ card: MyCardItemVue3 }>('/api/cards/' + encodeURIComponent(id) + '/stock', { stock }, { signal }),
    deleteCard: (id, signal) => {
      if (typeof platform.api.del !== 'function') return Promise.reject(new Error(platform.t('删除接口不可用')));
      return platform.api.del<{ ok?: boolean }>('/api/cards/' + encodeURIComponent(id), { signal });
    },
    shareCard: card => {
      if (typeof platform.shareCard !== 'function') return Promise.reject(new Error(platform.t('分享功能不可用')));
      return platform.shareCard(card);
    },
    getContestEntry: signal => platform.api.get<ContestEntrySummaryVue3>('/api/contests/qsl-design-2026-11/entry', { signal }),
    createViewer: platform.card3d && typeof platform.card3d.create === 'function' ? (root, options) => platform.card3d.create(root, options) : undefined,
    createImageProcessor: () => {
      if (platform.imageUpload && typeof platform.imageUpload.createProcessor === 'function') {
        return platform.imageUpload.createProcessor();
      }
      return {
        process: () => Promise.reject(new Error(platform.t('图片处理模块不可用'))),
        destroy: () => {},
      };
    },
    setLeaveGuard: guard => {
      if (platform.navigation && typeof platform.navigation.setLeaveGuard === 'function') {
        return platform.navigation.setLeaveGuard(guard);
      }
      return () => {};
    },
  };
}

export function createExchangeRequestServicesVue3(platform: ApplicationContext): ExchangeRequestServicesVue3 {
  return {
    ...createServicesVue3(platform),
    token: () => (typeof platform.api.token === 'function' ? platform.api.token() : null),
    setUser: user => platform.setUser?.(user),
    ratioLabel: ratio => platform.ratioLabel(ratio),
    listLogbook: (page, query, signal) => platform.api.get<LogbookPageResponseVue3>(
      '/api/me/logbook?' + new URLSearchParams({ q: query, page: String(page) }),
      { signal },
    ),
    createExchange: (cardId: string, payload: ExchangeCreatePayloadVue3, signal: AbortSignal) =>
      platform.api.post<{ exchange: ExchangeItemVue3 }>(
        '/api/cards/' + encodeURIComponent(cardId) + '/exchanges',
        payload,
        { signal },
      ),
    updateProfileAddress: async (address, signal) => {
      const reqToken = typeof platform.api.token === 'function' ? platform.api.token() : null;
      const reqUserId = platform.store?.user?.id ?? null;
      const controller = new AbortController();
      const onCallerAbort = () => controller.abort();
      if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', onCallerAbort, { once: true });
      }
      const offAuth = typeof platform.on === 'function'
        ? platform.on('auth', nextUser => {
            const nextId = (nextUser as SelfUserVue3 | null)?.id ?? null;
            const nextToken = typeof platform.api.token === 'function' ? platform.api.token() : null;
            if (!nextUser || nextId !== reqUserId || nextToken !== reqToken) {
              controller.abort();
            }
          })
        : () => {};
      try {
        return await platform.api.put<{ user: SelfUserVue3 }>(
          '/api/me/profile',
          { address },
          { signal: controller.signal, skipAuthClear: true },
        );
      } catch (err) {
        const apiErr = err as { status?: number };
        if (apiErr && apiErr.status === 401 && reqToken) {
          const curToken = typeof platform.api.token === 'function' ? platform.api.token() : null;
          const curUserId = platform.store?.user?.id ?? null;
          if (curToken === reqToken && curUserId === reqUserId) {
            platform.api.setToken?.(null);
            platform.setUser?.(null);
            platform.toast?.(platform.t('登录已过期，请重新登录'), 'error');
          }
        }
        throw err;
      } finally {
        offAuth();
        signal?.removeEventListener('abort', onCallerAbort);
      }
    },
  };
}

export function createExchangeServicesVue3(platform: ApplicationContext): ExchangeServicesVue3 {
  return {
    ...createServicesVue3(platform),
    token: () => (typeof platform.api.token === 'function' ? platform.api.token() : null),
    timeAgo: value => platform.timeAgo(value),
    exchangeText: status => platform.exchangeText(status),
    copyText: (text, message) => platform.copyText(text, message),
    listExchanges: signal => platform.api.get<ExchangeListResponseVue3>('/api/me/exchanges', { signal }),
    getApplicantCards: (exchangeId, page, signal) => platform.api.get<ApplicantCardsResponseVue3>(
      '/api/exchanges/' + encodeURIComponent(exchangeId) + '/applicant-cards?page=' + page + '&limit=48',
      { signal },
    ),
    approveExchange: (exchangeId, payload, signal) => platform.api.post<{ exchange: ExchangeItemVue3 }>(
      '/api/exchanges/' + encodeURIComponent(exchangeId) + '/approve',
      payload,
      { signal },
    ),
    rejectExchange: (exchangeId, payload, signal) => platform.api.post<{ exchange: ExchangeItemVue3 }>(
      '/api/exchanges/' + encodeURIComponent(exchangeId) + '/reject',
      payload,
      { signal },
    ),
    cancelExchange: (exchangeId, signal) => platform.api.post<{ exchange: ExchangeItemVue3 }>(
      '/api/exchanges/' + encodeURIComponent(exchangeId) + '/cancel',
      {},
      { signal },
    ),
    completeExchange: (exchangeId, signal) => platform.api.post<{ exchange: ExchangeItemVue3 }>(
      '/api/exchanges/' + encodeURIComponent(exchangeId) + '/complete',
      {},
      { signal },
    ),
  };
}

export function createLogbookServicesVue3(platform: ApplicationContext): LogbookServicesVue3 {
  return {
    ...createServicesVue3(platform),
    token: () => (typeof platform.api.token === 'function' ? platform.api.token() : null),
    listLogbook: (page, query, signal) => platform.api.get<LogbookPageResponseVue3>(
      '/api/me/logbook?' + new URLSearchParams({ page: String(page), q: query }),
      { signal },
    ),
    importLogbookFile: (payload, signal) => platform.api.post<LogbookImportResultVue3>(
      '/api/me/logbook/import',
      payload,
      { signal },
    ),
    importLotw: (payload, signal) => platform.api.post<LogbookImportResultVue3>(
      '/api/me/logbook/lotw',
      payload,
      { signal },
    ),
  };
}
