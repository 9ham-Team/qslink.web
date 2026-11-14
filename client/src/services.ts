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
  LegacyQslVue3,
  LogbookImportResultVue3,
  LogbookPageResponseVue3,
  LogbookServicesVue3,
  MyCardItemVue3,
  OverviewResponseVue3,
  SelfUserVue3,
  ServicesVue3,
  SpaceResponseVue3,
} from './contracts';

export function createServicesVue3(qsl: LegacyQslVue3): ServicesVue3 {
  return {
    t: qsl.t,
    user: () => qsl.state.user,
    onAuth: fn => qsl.on('auth', fn),
    getSpace: (uid, sort, page, signal) => qsl.api.get<SpaceResponseVue3>(
      '/api/public/spaces/' + encodeURIComponent(uid) + '?' + new URLSearchParams({ sort, page: String(page), limit: '12' }),
      { signal },
    ),
    listCards: (filters, page, signal) => {
      const query = new URLSearchParams({ sort: filters.sort, page: String(page), limit: '12' });
      if (filters.callSign) query.set('callSign', filters.callSign);
      return qsl.api.get<CardPageVue3>('/api/cards?' + query, { signal });
    },
    setQuery: patch => {
      try { qsl.setQuery(patch); } catch { /* History limits must not prevent filtering. */ }
    },
    celebrate: (x, y) => { qsl.fx?.confetti(x, y); },
    likeCard: id => qsl.api.cards.like(id),
    image: (img, src, width) => qsl.images.apply(img, src, width),
    placeholder: qsl.PLACEHOLDER_IMAGE,
    formatDate: qsl.formatDate,
    formatNumber: qsl.formatNumber,
    navigate: (path, options) => qsl.navigate(path, options),
    toast: (message, type) => qsl.toast(message, type),
    share(url) {
      const esc = qsl.escapeHtml;
      const modal = qsl.modal({
        title: qsl.t('分享主页'),
        content: '<p>' + esc(qsl.t('把你的卡片小站分享给朋友，任何人都可以直接访问。')) + '</p>' +
          '<label class="field"><span class="label">' + esc(qsl.t('主页链接')) + '</span>' +
          '<input class="input" type="text" readonly data-space-url value="' + esc(url) + '"></label>',
        actions: [{ label: qsl.t('复制链接'), type: 'primary', closeOnClick: false,
          onClick: () => qsl.copyText(url, qsl.t('主页链接已复制')) }],
      });
      const input = modal.body.querySelector<HTMLInputElement>('[data-space-url]');
      if (input) input.onclick = () => input.select();
      return modal;
    },
  };
}

export function createHomeServicesVue3(qsl: LegacyQslVue3): HomeServicesVue3 {
  return {
    ...createServicesVue3(qsl),
    getHomeCards: signal => qsl.api.get<CardPageVue3>('/api/cards?sort=popular&limit=48', { signal }),
    getStats: signal => qsl.api.get<HomeStatsVue3>('/api/stats', { signal }),
    listAnnouncements: ({ page, limit, reminder }, signal) => {
      const query = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (reminder) query.set('reminder', '1');
      return qsl.api.get<AnnouncementPageVue3>('/api/announcements?' + query, { signal });
    },
    dismissAnnouncement: (id, signal) => qsl.api.post<{ dismissed: boolean }>(
      '/api/announcements/' + encodeURIComponent(id) + '/dismiss',
      {},
      { signal },
    ),
    formatDateTime: value => qsl.formatDateTime(value),
    scrollToHash: () => qsl.scrollToHash(),
    createViewer: (root, options) => qsl.card3d.create(root, options),
  };
}

export function createCardDetailServicesVue3(qsl: LegacyQslVue3): CardDetailServicesVue3 {
  return {
    ...createServicesVue3(qsl),
    getCardDetail: (id, signal) => qsl.api.get<CardDetailResponseVue3>(
      '/api/cards/' + encodeURIComponent(id),
      { signal },
    ),
    getPublicCard: (token, signal) => qsl.api.get<CardDetailResponseVue3>(
      '/api/public/cards/' + encodeURIComponent(token),
      { signal },
    ),
    getPopularCards: signal => qsl.api.get<CardPageVue3>('/api/cards?sort=popular&limit=8', { signal }),
    createViewer: (root, options) => qsl.card3d.create(root, options),
    bindShare(button, card) {
      if (!qsl.cardShare || typeof qsl.cardShare.bind !== 'function') return () => {};
      return qsl.cardShare.bind(button, card);
    },
    openExchange(card) {
      if (!qsl.exchangeRequest || typeof qsl.exchangeRequest.open !== 'function') return null;
      const handle = qsl.exchangeRequest.open(card);
      return handle && typeof handle.close === 'function' ? handle : null;
    },
    isExchangeReady: () => !!(qsl.exchangeRequest && typeof qsl.exchangeRequest.open === 'function'),
    copyText: (text, message) => qsl.copyText(text, message),
    timeAgo: value => qsl.timeAgo(value),
    ratioLabel: ratio => qsl.ratioLabel(ratio),
    statusText: status => qsl.statusText(status),
    exchangeText: status => qsl.exchangeText(status),
    heartbeat(el) {
      qsl.fx?.heartbeat?.(el);
    },
  };
}

export function createAuthServicesVue3(qsl: LegacyQslVue3): AuthServicesVue3 {
  return {
    ...createServicesVue3(qsl),
    token: () => (typeof qsl.api.token === 'function' ? qsl.api.token() : null),
    setToken: token => qsl.api.setToken?.(token),
    setUser: user => qsl.setUser?.(user),
    safeNext: raw => (typeof qsl.safeNext === 'function' ? qsl.safeNext(raw) : null),
    config: () => qsl.state.config || { demo: false, demoAccounts: [] },
    login: (payload, signal) => qsl.api.post<AuthResponseVue3>('/api/auth/login', payload, { signal }),
    register: (payload, signal) => qsl.api.post<AuthResponseVue3>('/api/auth/register', payload, { signal }),
    sendEmailCode: (email, signal) => qsl.api.post<{ ok: boolean; expiresIn?: number; retryAfter?: number }>(
      '/api/auth/email-code',
      { email },
      { signal, skipAuthClear: true },
    ),
    fetchMe: signal => (qsl.api.auth && typeof qsl.api.auth.me === 'function'
      ? qsl.api.auth.me({ signal, skipAuthClear: true })
      : qsl.api.get<{ user?: AuthUserVue3 | null }>('/api/auth/me', { signal, skipAuthClear: true })),
  };
}

const DEFAULT_AVATAR_COLORS = ['#0eaf8f', '#14b8a6', '#38bdf8', '#6366f1', '#8b5cf6', '#ec4899', '#fb7185', '#f59e0b', '#84cc16', '#0ea5e9'];

export function createAccountServicesVue3(qsl: LegacyQslVue3): AccountServicesVue3 {
  return {
    ...createServicesVue3(qsl),
    token: () => (typeof qsl.api.token === 'function' ? qsl.api.token() : null),
    setUser: user => qsl.setUser?.(user),
    avatarColors: () => (Array.isArray(qsl.AVATAR_COLORS) && qsl.AVATAR_COLORS.length ? qsl.AVATAR_COLORS.slice() : DEFAULT_AVATAR_COLORS.slice()),
    timeAgo: value => qsl.timeAgo(value),
    language: () => (qsl.i18n && qsl.i18n.language) || 'zh-CN',
    getOverview: signal => qsl.api.get<OverviewResponseVue3>('/api/me/overview', { signal }),
    updateProfile: (payload, signal) => qsl.api.put<{ user: SelfUserVue3 }>('/api/me/profile', payload, { signal }),
    updatePassword: async (payload, signal) => {
      const requestToken = typeof qsl.api.token === 'function' ? qsl.api.token() : null;
      try {
        return await qsl.api.put<{ ok: boolean }>('/api/me/password', payload, { signal, skipAuthClear: true });
      } catch (err) {
        const apiErr = err as { status?: number; code?: string };
        const currentToken = typeof qsl.api.token === 'function' ? qsl.api.token() : null;
        if (
          apiErr &&
          apiErr.status === 401 &&
          apiErr.code !== 'INVALID_CREDENTIALS' &&
          requestToken &&
          currentToken === requestToken
        ) {
          qsl.api.setToken?.(null);
          qsl.setUser?.(null);
          qsl.toast(qsl.t('登录已过期，请重新登录'), 'error');
        }
        throw err;
      }
    },
    getApplicantCards: (exchangeId, page, signal) => qsl.api.get<ApplicantCardsResponseVue3>(
      '/api/exchanges/' + encodeURIComponent(exchangeId) + '/applicant-cards?page=' + page + '&limit=48',
      { signal },
    ),
    approveExchange: (exchangeId, payload, signal) => qsl.api.post<{ exchange: ExchangeItemVue3 }>(
      '/api/exchanges/' + encodeURIComponent(exchangeId) + '/approve',
      payload,
      { signal },
    ),
    rejectExchange: (exchangeId, payload, signal) => qsl.api.post<{ exchange: ExchangeItemVue3 }>(
      '/api/exchanges/' + encodeURIComponent(exchangeId) + '/reject',
      payload,
      { signal },
    ),
  };
}

export function createCardManageServicesVue3(qsl: LegacyQslVue3): CardManageServicesVue3 {
  return {
    ...createServicesVue3(qsl),
    token: () => (typeof qsl.api.token === 'function' ? qsl.api.token() : null),
    i18nError: source => (qsl.i18n && typeof qsl.i18n.error === 'function' ? qsl.i18n.error(source) : qsl.t(source)),
    resetEdits: () => { qsl.i18n?.resetEdits?.(); },
    isLanguageSwitching: () => !!(qsl.i18n && qsl.i18n.switching),
    timeAgo: value => qsl.timeAgo(value),
    statusText: status => qsl.statusText(status),
    getMyCards: signal => qsl.api.get<{ items: MyCardItemVue3[] }>('/api/me/cards', { signal }),
    getCardDetail: (id, signal) => qsl.api.get<CardDetailResponseVue3>('/api/cards/' + encodeURIComponent(id), { signal }),
    createCard: (payload: CardCreatePayloadVue3, signal: AbortSignal) =>
      qsl.api.post<{ card: MyCardItemVue3; contestAutoEntry?: unknown }>('/api/cards', payload, { signal }),
    updateCard: (id: string, payload: CardUpdatePayloadVue3, signal: AbortSignal) =>
      qsl.api.put<{ card: MyCardItemVue3; contestAutoEntry?: unknown }>('/api/cards/' + encodeURIComponent(id), payload, { signal }),
    updateCardStock: (id, stock, signal) =>
      qsl.api.put<{ card: MyCardItemVue3 }>('/api/cards/' + encodeURIComponent(id) + '/stock', { stock }, { signal }),
    deleteCard: (id, signal) => {
      if (typeof qsl.api.del !== 'function') return Promise.reject(new Error(qsl.t('删除接口不可用')));
      return qsl.api.del<{ ok?: boolean }>('/api/cards/' + encodeURIComponent(id), { signal });
    },
    shareCard: card => {
      if (typeof qsl.shareCard !== 'function') return Promise.reject(new Error(qsl.t('分享功能不可用')));
      return qsl.shareCard(card);
    },
    getContestEntry: signal => qsl.api.get<ContestEntrySummaryVue3>('/api/contests/qsl-design-2026-11/entry', { signal }),
    createViewer: qsl.card3d && typeof qsl.card3d.create === 'function' ? (root, options) => qsl.card3d.create(root, options) : undefined,
    createImageProcessor: () => {
      if (qsl.imageUpload && typeof qsl.imageUpload.createProcessor === 'function') {
        return qsl.imageUpload.createProcessor();
      }
      return {
        process: () => Promise.reject(new Error(qsl.t('图片处理模块不可用'))),
        destroy: () => {},
      };
    },
    setLeaveGuard: guard => {
      if (qsl.router && typeof qsl.router.setLeaveGuard === 'function') {
        return qsl.router.setLeaveGuard(guard);
      }
      return () => {};
    },
  };
}

export function createExchangeRequestServicesVue3(qsl: LegacyQslVue3): ExchangeRequestServicesVue3 {
  return {
    ...createServicesVue3(qsl),
    token: () => (typeof qsl.api.token === 'function' ? qsl.api.token() : null),
    setUser: user => qsl.setUser?.(user),
    ratioLabel: ratio => qsl.ratioLabel(ratio),
    listLogbook: (page, query, signal) => qsl.api.get<LogbookPageResponseVue3>(
      '/api/me/logbook?' + new URLSearchParams({ q: query, page: String(page) }),
      { signal },
    ),
    createExchange: (cardId: string, payload: ExchangeCreatePayloadVue3, signal: AbortSignal) =>
      qsl.api.post<{ exchange: ExchangeItemVue3 }>(
        '/api/cards/' + encodeURIComponent(cardId) + '/exchanges',
        payload,
        { signal },
      ),
    updateProfileAddress: async (address, signal) => {
      const reqToken = typeof qsl.api.token === 'function' ? qsl.api.token() : null;
      const reqUserId = qsl.state?.user?.id ?? null;
      const controller = new AbortController();
      const onCallerAbort = () => controller.abort();
      if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', onCallerAbort, { once: true });
      }
      const offAuth = typeof qsl.on === 'function'
        ? qsl.on('auth', nextUser => {
            const nextId = (nextUser as SelfUserVue3 | null)?.id ?? null;
            const nextToken = typeof qsl.api.token === 'function' ? qsl.api.token() : null;
            if (!nextUser || nextId !== reqUserId || nextToken !== reqToken) {
              controller.abort();
            }
          })
        : () => {};
      try {
        return await qsl.api.put<{ user: SelfUserVue3 }>(
          '/api/me/profile',
          { address },
          { signal: controller.signal, skipAuthClear: true },
        );
      } catch (err) {
        const apiErr = err as { status?: number };
        if (apiErr && apiErr.status === 401 && reqToken) {
          const curToken = typeof qsl.api.token === 'function' ? qsl.api.token() : null;
          const curUserId = qsl.state?.user?.id ?? null;
          if (curToken === reqToken && curUserId === reqUserId) {
            qsl.api.setToken?.(null);
            qsl.setUser?.(null);
            qsl.toast?.(qsl.t('登录已过期，请重新登录'), 'error');
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

export function createExchangeServicesVue3(qsl: LegacyQslVue3): ExchangeServicesVue3 {
  return {
    ...createServicesVue3(qsl),
    token: () => (typeof qsl.api.token === 'function' ? qsl.api.token() : null),
    timeAgo: value => qsl.timeAgo(value),
    exchangeText: status => qsl.exchangeText(status),
    copyText: (text, message) => qsl.copyText(text, message),
    listExchanges: signal => qsl.api.get<ExchangeListResponseVue3>('/api/me/exchanges', { signal }),
    getApplicantCards: (exchangeId, page, signal) => qsl.api.get<ApplicantCardsResponseVue3>(
      '/api/exchanges/' + encodeURIComponent(exchangeId) + '/applicant-cards?page=' + page + '&limit=48',
      { signal },
    ),
    approveExchange: (exchangeId, payload, signal) => qsl.api.post<{ exchange: ExchangeItemVue3 }>(
      '/api/exchanges/' + encodeURIComponent(exchangeId) + '/approve',
      payload,
      { signal },
    ),
    rejectExchange: (exchangeId, payload, signal) => qsl.api.post<{ exchange: ExchangeItemVue3 }>(
      '/api/exchanges/' + encodeURIComponent(exchangeId) + '/reject',
      payload,
      { signal },
    ),
    cancelExchange: (exchangeId, signal) => qsl.api.post<{ exchange: ExchangeItemVue3 }>(
      '/api/exchanges/' + encodeURIComponent(exchangeId) + '/cancel',
      {},
      { signal },
    ),
    completeExchange: (exchangeId, signal) => qsl.api.post<{ exchange: ExchangeItemVue3 }>(
      '/api/exchanges/' + encodeURIComponent(exchangeId) + '/complete',
      {},
      { signal },
    ),
  };
}

export function createLogbookServicesVue3(qsl: LegacyQslVue3): LogbookServicesVue3 {
  return {
    ...createServicesVue3(qsl),
    token: () => (typeof qsl.api.token === 'function' ? qsl.api.token() : null),
    listLogbook: (page, query, signal) => qsl.api.get<LogbookPageResponseVue3>(
      '/api/me/logbook?' + new URLSearchParams({ page: String(page), q: query }),
      { signal },
    ),
    importLogbookFile: (payload, signal) => qsl.api.post<LogbookImportResultVue3>(
      '/api/me/logbook/import',
      payload,
      { signal },
    ),
    importLotw: (payload, signal) => qsl.api.post<LogbookImportResultVue3>(
      '/api/me/logbook/lotw',
      payload,
      { signal },
    ),
  };
}
