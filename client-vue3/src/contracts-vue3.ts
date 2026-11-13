export interface PublicUserVue3 {
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
  frontImage?: string;
  stock: number | null;
  liked: boolean;
  likeCount: number;
  ratio: { w: number; h: number };
  owner: PublicUserVue3;
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
  params: Record<string, string>;
  query: URLSearchParams;
  fromPath?: string | null;
  navigation?: 'push' | 'replace' | 'pop' | 'render';
}

export interface ServicesVue3 {
  t(source: string, values?: Record<string, unknown>): string;
  user(): { uid?: string } | null;
  onAuth(fn: (user: { uid?: string } | null) => void): () => void;
  getSpace(uid: string, sort: string, page: number, signal: AbortSignal): Promise<SpaceResponseVue3>;
  listCards(filters: CardFiltersVue3, page: number, signal: AbortSignal): Promise<CardPageVue3>;
  setQuery(patch: Record<string, string | null>): void;
  celebrate(x: number, y: number): void;
  likeCard(id: string): Promise<{ liked: boolean; likeCount: number }>;
  image(img: HTMLImageElement, src: string, width: number): void;
  placeholder: string;
  formatDate(value: string): string;
  formatNumber(value: number): string;
  navigate(path: string): void;
  toast(message: string, type: string): void;
  share(url: string): { close(): void };
}

export interface LegacyQslVue3 {
  t: ServicesVue3['t'];
  state: { user: { uid?: string } | null };
  api: {
    get<T>(path: string, options?: { signal: AbortSignal }): Promise<T>;
    cards: { like: ServicesVue3['likeCard'] };
  };
  images: { apply: ServicesVue3['image'] };
  PLACEHOLDER_IMAGE: string;
  formatDate: ServicesVue3['formatDate'];
  formatNumber: ServicesVue3['formatNumber'];
  navigate: ServicesVue3['navigate'];
  toast: ServicesVue3['toast'];
  setQuery: ServicesVue3['setQuery'];
  fx?: { confetti(x: number, y: number): void };
  escapeHtml(value: unknown): string;
  copyText(text: string, message: string): Promise<unknown>;
  modal(options: unknown): { close(): void; body: HTMLElement };
  on(event: string, fn: (...args: any[]) => void): () => void;
  registerPage(name: string, page: { title: string; render(root: HTMLElement, ctx: RouteContextVue3): () => void }): void;
}

declare global {
  interface Window { QSL: LegacyQslVue3 }
}
