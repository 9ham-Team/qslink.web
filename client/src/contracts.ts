export interface PublicUserVue3 {
  id?: string;
  uid: string;
  username?: string;
  displayName?: string;
  callSign?: string;
  avatarColor?: string;
  bio?: string;
  joinedAt: string;
  stats: { cards: number; likesReceived: number };
}

export interface CardVue3 {
  id: string;
  title: string;
  callSign?: string;
  frontImage?: string;
  backImage?: string;
  stock: number | null;
  liked: boolean;
  likeCount: number;
  status?: 'pending' | 'approved' | 'rejected' | 'draft' | string;
  ratio: { w: number; h: number };
  owner: PublicUserVue3;
}

export interface CardExchangeSummaryVue3 {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled' | string;
}

export interface CardDetailVue3 extends CardVue3 {
  notes?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'draft' | string;
  exchangeCount?: number;
  createdAt: string;
  canApply?: boolean;
  canShare?: boolean;
  isOwner?: boolean;
  shareToken?: string;
  myExchange?: CardExchangeSummaryVue3 | null;
}

export interface CardDetailResponseVue3 {
  card: CardDetailVue3;
  owner?: PublicUserVue3;
}

export interface AnnouncementVue3 {
  id: string;
  eventKey?: string | null;
  title: string;
  body: string;
  status?: 'draft' | 'published';
  displaySeconds?: number;
  publishedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AnnouncementPageVue3 {
  items: AnnouncementVue3[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface HomeStatsVue3 {
  userCount: number;
}

export interface CardPageVue3 {
  items: CardVue3[];
  total: number;
  page: number;
  pages: number;
}

export interface CardFiltersVue3 {
  callSign: string;
  sort: 'latest' | 'popular' | 'oldest';
}

export interface SpaceResponseVue3 {
  user: PublicUserVue3;
  cards: CardPageVue3;
  url: string | null;
}

export interface RouteContextVue3 {
  path?: string;
  params: Record<string, string>;
  query: URLSearchParams;
  hash: string;
  fromPath?: string | null;
  navigation?: 'push' | 'replace' | 'pop' | 'render';
}

export interface ServicesVue3 {
  t(source: string, values?: Record<string, unknown>): string;
  user(): { id?: string; uid?: string } | null;
  onAuth(fn: (user: { id?: string; uid?: string } | null) => void): () => void;
  getSpace(uid: string, sort: string, page: number, signal: AbortSignal): Promise<SpaceResponseVue3>;
  listCards(filters: CardFiltersVue3, page: number, signal: AbortSignal): Promise<CardPageVue3>;
  setQuery(patch: Record<string, string | null>): void;
  celebrate(x: number, y: number): void;
  likeCard(id: string): Promise<{ liked: boolean; likeCount: number }>;
  image(img: HTMLImageElement, src: string, width: number): void;
  placeholder: string;
  formatDate(value: string): string;
  formatNumber(value: number): string;
  navigate(path: string, options?: { replace?: boolean; keepScroll?: boolean }): Promise<boolean> | void;
  toast(message: string, type: string): void;
  share(url: string): { close(): void };
}

export interface HomeServicesVue3 extends ServicesVue3 {
  getHomeCards(signal: AbortSignal): Promise<CardPageVue3>;
  getStats(signal: AbortSignal): Promise<HomeStatsVue3>;
  listAnnouncements(params: { page: number; limit: number; reminder?: boolean }, signal: AbortSignal): Promise<AnnouncementPageVue3>;
  dismissAnnouncement(id: string, signal: AbortSignal): Promise<{ dismissed: boolean }>;
  formatDateTime(value: string | null): string;
  scrollToHash(): boolean | void;
  createViewer(root: HTMLElement, options: Record<string, unknown>): {
    destroy(): void;
    setImages(front: string, back?: string): void;
    setRatio(ratio: { w: number; h: number }): void;
  };
}

export interface CardDetailServicesVue3 extends ServicesVue3 {
  getCardDetail(id: string, signal: AbortSignal): Promise<CardDetailResponseVue3>;
  getPublicCard(token: string, signal: AbortSignal): Promise<CardDetailResponseVue3>;
  getPopularCards(signal: AbortSignal): Promise<CardPageVue3>;
  createViewer: HomeServicesVue3['createViewer'];
  sharing: import('./sharing').SharingService;
  openExchange(card: CardDetailVue3): { close(): void } | null;
  isExchangeReady(): boolean;
  copyText(text: string, message: string): Promise<unknown>;
  timeAgo(value: string): string;
  ratioLabel(ratio?: { w: number; h: number }): string;
  statusText(status: string): string;
  exchangeText(status: string): string;
  heartbeat(el: HTMLElement): void;
}

export interface AuthUserVue3 {
  id?: string;
  uid?: string;
  username?: string;
  displayName?: string;
  callSign?: string;
  role?: string;
  avatarColor?: string;
  stats?: {
    pendingExchanges?: number;
    cards?: number;
    likesReceived?: number;
    exchanges?: number;
  };
}

export interface DemoAccountVue3 {
  id: string;
  pass: string;
  name: string;
  callSign: string;
  role: string;
}

export interface AppConfigVue3 {
  demo?: boolean;
  demoAccounts?: DemoAccountVue3[];
  build?: { revision?: string; created?: string } | null;
}

export interface AuthResponseVue3 {
  token?: string;
  user?: AuthUserVue3 | null;
}

export interface LoginPayloadVue3 {
  identifier: string;
  password: string;
}

export interface RegisterPayloadVue3 {
  acceptTerms: true;
  termsVersion: string;
  username: string;
  email: string;
  emailCode: string;
  password: string;
  displayName?: string;
  callSign?: string;
}

export interface AuthServicesVue3 extends ServicesVue3 {
  token(): string | null;
  setToken(token: string | null): void;
  setUser(user: AuthUserVue3 | null): void;
  safeNext(raw: string | null | undefined): string | null;
  config(): AppConfigVue3;
  login(payload: LoginPayloadVue3, signal: AbortSignal): Promise<AuthResponseVue3>;
  register(payload: RegisterPayloadVue3, signal: AbortSignal): Promise<AuthResponseVue3>;
  sendEmailCode(email: string, signal: AbortSignal): Promise<{ ok: boolean; expiresIn?: number; retryAfter?: number }>;
  fetchMe(signal: AbortSignal): Promise<{ user?: AuthUserVue3 | null }>;
}

export interface AddressVue3 {
  name?: string;
  phone?: string;
  province?: string;
  city?: string;
  line1?: string;
  postalCode?: string;
  country?: string;
}

export interface SelfUserVue3 extends AuthUserVue3 {
  email?: string;
  avatarColor?: string;
  bio?: string;
  joinedAt?: string;
  status?: string;
  address?: AddressVue3 | null;
  stats?: {
    cards?: number;
    likesReceived?: number;
    exchanges?: number;
  };
}

export interface OverviewStatsVue3 {
  cards: number;
  approvedCards: number;
  pendingCards: number;
  likesReceived: number;
  incomingPending: number;
  outgoingPending: number;
  completedExchanges: number;
}

export interface ContactLogSummaryVue3 {
  id?: string;
  qsoAt?: string;
  workedAt?: string;
  utcTime?: string;
  stationCallSign?: string;
  callSign?: string;
  band?: string;
  mode?: string;
  submode?: string;
  frequency?: string;
  rstSent?: string;
  rstReceived?: string;
  name?: string;
  country?: string;
  grid?: string;
  propagation?: string;
  satellite?: string;
  source?: string;
  lotwConfirmed?: boolean;
}

export interface ExchangeCardBriefVue3 {
  id: string;
  title?: string;
  callSign?: string;
  frontImage?: string;
  backImage?: string;
  shareToken?: string;
  ratio?: { w: number; h: number };
}

export interface ExchangeItemVue3 {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled' | string;
  direction?: 'incoming' | 'outgoing' | 'admin' | string;
  card?: ExchangeCardBriefVue3 | null;
  preferredCardId?: string | null;
  preferredCardTitle?: string | null;
  preferredCard?: ExchangeCardBriefVue3 | null;
  fromUser?: PublicUserVue3 | null;
  toUser?: PublicUserVue3 | null;
  fromAddress?: AddressVue3 | null;
  toAddress?: AddressVue3 | null;
  contactName?: string;
  message?: string;
  rejectReason?: string | null;
  selectedContactLogs?: ContactLogSummaryVue3[];
  createdAt: string;
  updatedAt?: string;
  decidedAt?: string | null;
}

export interface OverviewResponseVue3 {
  user: SelfUserVue3;
  canJudgeContest?: boolean;
  stats: OverviewStatsVue3;
  recentIncoming: ExchangeItemVue3[];
  recentCards: CardVue3[];
}

export interface ApplicantCardsResponseVue3 {
  items: CardVue3[];
  page: number;
  pages: number;
  total?: number;
  hasUploadedCards: boolean;
}

export type ProfileUpdatePayloadVue3 =
  | { displayName: string; callSign: string; bio: string; avatarColor: string }
  | { address: { name: string; phone: string; province: string; city: string; line1: string; postalCode: string; country: string } };

export interface PasswordUpdatePayloadVue3 {
  currentPassword: string;
  newPassword: string;
}

export interface AccountServicesVue3 extends ServicesVue3 {
  token(): string | null;
  setUser(user: SelfUserVue3 | null): void;
  avatarColors(): string[];
  timeAgo(value: string): string;
  language(): string;
  getOverview(signal: AbortSignal): Promise<OverviewResponseVue3>;
  updateProfile(payload: ProfileUpdatePayloadVue3, signal: AbortSignal): Promise<{ user: SelfUserVue3 }>;
  updatePassword(payload: PasswordUpdatePayloadVue3, signal: AbortSignal): Promise<{ ok: boolean }>;
  getApplicantCards(exchangeId: string, page: number, signal: AbortSignal): Promise<ApplicantCardsResponseVue3>;
  approveExchange(exchangeId: string, payload: { preferredCardId: string | null; confirmNoCards: boolean }, signal: AbortSignal): Promise<{ exchange: ExchangeItemVue3 }>;
  rejectExchange(exchangeId: string, payload: { reason: string }, signal: AbortSignal): Promise<{ exchange: ExchangeItemVue3 }>;
}

export interface ContestWorkSummaryVue3 {
  id: string;
  cardId?: string;
  number?: number | null;
  status?: string;
}

export interface MyCardItemVue3 extends CardVue3 {
  notes?: string;
  rejectReason?: string;
  createdAt?: string;
  updatedAt?: string;
  canShare?: boolean;
  shareToken?: string;
  contestOptIn?: boolean;
  contestDescription?: string | null;
  contestWork?: ContestWorkSummaryVue3 | null;
}

export interface CardCreatePayloadVue3 {
  acceptTerms: true;
  termsVersion: '2026-10-25';
  acceptContentLicense: true;
  title: string;
  callSign: string;
  notes: string;
  ratio: { w: number; h: number };
  frontImage: string;
  backImage?: string;
  stock: number | null;
  contestOptIn: boolean;
  contestDescription?: string;
}

export type CardUpdatePayloadVue3 = Omit<CardCreatePayloadVue3, 'stock'>;

export interface ContestEntrySummaryVue3 {
  entry?: {
    works?: ContestWorkSummaryVue3[];
  } | null;
}

export interface ImageProcessorVue3 {
  process(file: File): Promise<{ src: string; width: number; height: number }>;
  destroy(): void;
}

export interface CardManageServicesVue3 extends ServicesVue3 {
  token(): string | null;
  i18nError(source: string): string;
  resetEdits(): void;
  isLanguageSwitching(): boolean;
  timeAgo(value: string): string;
  statusText(status: string): string;
  getMyCards(signal: AbortSignal): Promise<{ items: MyCardItemVue3[] }>;
  getCardDetail(id: string, signal: AbortSignal): Promise<CardDetailResponseVue3>;
  createCard(payload: CardCreatePayloadVue3, signal: AbortSignal): Promise<{ card: MyCardItemVue3; contestAutoEntry?: unknown }>;
  updateCard(id: string, payload: CardUpdatePayloadVue3, signal: AbortSignal): Promise<{ card: MyCardItemVue3; contestAutoEntry?: unknown }>;
  updateCardStock(id: string, stock: number | null, signal: AbortSignal): Promise<{ card: MyCardItemVue3 }>;
  deleteCard(id: string, signal: AbortSignal): Promise<{ ok?: boolean }>;
  shareCard(card: MyCardItemVue3): Promise<unknown>;
  getContestEntry(signal: AbortSignal): Promise<ContestEntrySummaryVue3>;
  createViewer?: HomeServicesVue3['createViewer'];
  createImageProcessor(): ImageProcessorVue3;
  setLeaveGuard(guard: ((ctx: { type: 'navigate' | 'pop'; to: string }) => boolean | Promise<boolean>) | null): () => void;
}

export interface ExchangeCountsVue3 {
  incomingPending?: number;
  outgoingPending?: number;
  total?: number;
}

export interface ExchangeListResponseVue3 {
  items: ExchangeItemVue3[];
  counts?: ExchangeCountsVue3;
}

export interface ExchangeCreatePayloadVue3 {
  message?: string;
  contactName: string;
  address: {
    name: string;
    phone: string;
    province: string;
    city: string;
    line1: string;
    postalCode: string;
    country: string;
  };
  contactLogIds?: string[];
}

export interface LogbookRowVue3 extends ContactLogSummaryVue3 {
  id: string;
  qsoAt: string;
  callSign: string;
  band: string;
  mode: string;
  lotwConfirmed: boolean;
  source: 'adif' | 'tq8' | 'lotw' | string;
}

export interface LogbookPageResponseVue3 {
  items: LogbookRowVue3[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  stats: {
    total: number;
    confirmed: number;
  };
}

export interface LogbookImportResultVue3 {
  added: number;
  updated: number;
  duplicates: number;
  skipped: number;
  total: number;
  issues: Array<{ record: number; message: string }>;
}

export interface ExchangeDecisionServicesVue3 extends ServicesVue3 {
  token(): string | null;
  timeAgo(value: string): string;
  getApplicantCards(exchangeId: string, page: number, signal: AbortSignal): Promise<ApplicantCardsResponseVue3>;
  approveExchange(exchangeId: string, payload: { preferredCardId: string | null; confirmNoCards: boolean }, signal: AbortSignal): Promise<{ exchange: ExchangeItemVue3 }>;
  rejectExchange(exchangeId: string, payload: { reason: string }, signal: AbortSignal): Promise<{ exchange: ExchangeItemVue3 }>;
}

export interface ExchangeServicesVue3 extends ExchangeDecisionServicesVue3 {
  exchangeText(status: string): string;
  copyText(text: string, message: string): Promise<unknown>;
  listExchanges(signal: AbortSignal): Promise<ExchangeListResponseVue3>;
  cancelExchange(exchangeId: string, signal: AbortSignal): Promise<{ exchange: ExchangeItemVue3 }>;
  completeExchange(exchangeId: string, signal: AbortSignal): Promise<{ exchange: ExchangeItemVue3 }>;
}

export interface ExchangeRequestServicesVue3 extends ServicesVue3 {
  token(): string | null;
  setUser(user: SelfUserVue3 | null): void;
  ratioLabel(ratio?: { w: number; h: number }): string;
  listLogbook(page: number, query: string, signal: AbortSignal): Promise<LogbookPageResponseVue3>;
  createExchange(cardId: string, payload: ExchangeCreatePayloadVue3, signal: AbortSignal): Promise<{ exchange: ExchangeItemVue3 }>;
  updateProfileAddress(address: ExchangeCreatePayloadVue3['address'], signal?: AbortSignal): Promise<{ user: SelfUserVue3 }>;
}

export interface LogbookServicesVue3 extends ServicesVue3 {
  token(): string | null;
  listLogbook(page: number, query: string, signal: AbortSignal): Promise<LogbookPageResponseVue3>;
  importLogbookFile(payload: { adif: string } | { tq8: string }, signal: AbortSignal): Promise<LogbookImportResultVue3>;
  importLotw(payload: { username: string; password: string }, signal: AbortSignal): Promise<LogbookImportResultVue3>;
}

export interface ConfirmOptionsVue3 {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export interface ApplicationContext {
  pinia?: import('pinia').Pinia;
  sharing: import('./sharing').SharingService;
  dialogs: ReturnType<typeof import('./dialog-service').createDialogService>;
  dispose?(): void;
  t: ServicesVue3['t'];
  i18n?: { language?: string; switching?: boolean; resetEdits?(): void; error?(source: string): string; switchLanguage?(): void };
  AVATAR_COLORS?: string[];
  store: {
    user: AuthUserVue3 | null;
    config?: AppConfigVue3;
    booted?: boolean;
    loading?: boolean;
    error?: string | null;
    ready?: Promise<void>;
  };
  api: {
    get<T>(path: string, options?: { signal?: AbortSignal; cache?: RequestCache; skipAuthClear?: boolean }): Promise<T>;
    post<T>(path: string, body: unknown, options?: { signal?: AbortSignal; skipAuthClear?: boolean }): Promise<T>;
    put<T>(path: string, body: unknown, options?: { signal?: AbortSignal; skipAuthClear?: boolean }): Promise<T>;
    del?<T>(path: string, options?: { signal?: AbortSignal; skipAuthClear?: boolean }): Promise<T>;
    config?(): Promise<AppConfigVue3>;
    token?: () => string | null;
    setToken?: (token: string | null) => void;
    auth?: {
      me(options?: { signal?: AbortSignal; skipAuthClear?: boolean }): Promise<{ user?: AuthUserVue3 | null }>;
    };
    cards: { like: ServicesVue3['likeCard'] };
  };
  boot?(): Promise<void>;
  refreshUser?(): Promise<AuthUserVue3 | null>;
  footerBuildText?(build: AppConfigVue3['build']): string;
  navigation?: {
    instance?: import('vue-router').Router;
    start?(): void;
    current?: RouteContextVue3 | null;
    render?(): void | Promise<boolean>;
    setLeaveGuard?(fn: ((ctx: { type: 'navigate' | 'pop'; to: string }) => boolean | Promise<boolean>) | null): () => void;
  };
  imageUpload?: {
    createProcessor(): ImageProcessorVue3;
  };
  shareCard?: (card: unknown) => Promise<unknown>;
  setUser?: (user: AuthUserVue3 | null) => void;
  safeNext?: (raw: string | null | undefined) => string | null;
  images: { apply: ServicesVue3['image'] };
  PLACEHOLDER_IMAGE: string;
  formatDate: ServicesVue3['formatDate'];
  formatDateTime: (value: string | null) => string;
  formatNumber: ServicesVue3['formatNumber'];
  timeAgo(value: string): string;
  ratioLabel(ratio?: { w: number; h: number }): string;
  statusText(status: string): string;
  exchangeText(status: string): string;
  icon?(name: string, size?: number): string;
  navigate: ServicesVue3['navigate'];
  goBack?(fallback?: string): void;
  currentPath?(): string;
  setQuery: ServicesVue3['setQuery'];
  toast: (message: string, type?: string, duration?: number) => () => void;
  scrollToHash: () => boolean | void;
  card3d: {
    create: HomeServicesVue3['createViewer'];
  };
  exchangeRequest?: {
    open(card: CardDetailVue3): { close(): void } | null | void;
    closeAll?(): void;
  };
  fx?: {
    dispose?(): void;
    confetti(x: number, y: number): void;
    heartbeat?(el: HTMLElement): void;
  };
  escapeHtml(value: unknown): string;
  copyText(text: string, message: string): Promise<unknown>;
  confirm?(options: ConfirmOptionsVue3): Promise<boolean>;
  on(event: string, fn: (...args: any[]) => void): () => void;
  emit?(event: string, ...args: unknown[]): void;
}
