import type { CardVue3, LegacyQslVue3, ServicesVue3 } from '../contracts-vue3';
export const contestKeyVue3 = 'qsl-design-2026-11';
export const contestPathVue3 = '/events/' + contestKeyVue3;
export const contestApiVue3 = '/api/contests/' + contestKeyVue3;
export interface ContestCardVue3 extends CardVue3 { backImage?: string; status?: string; createdAt?: string }
export interface WorkVue3 { id: string; cardId?: string; number: number; description: string; submittedAt?: string; card: ContestCardVue3; voteCount: number }
export interface VotingVue3 { startsAt: string | null; endsAt: string | null; isOpen: boolean; eligible: boolean; votesUsed: number; votedWorkIds: string[] }
export interface EntryVue3 { id: string; revision: number; status: 'pending' | 'approved' | 'rejected'; contactEmail: string; reviewReason?: string; works: WorkVue3[] }
export interface ScoreVue3 { value: number; comment: string; revision: number }
export interface MaterialVue3 { id: string; number: number; title: string; description: string; frontUrl: string | null; backUrl: string | null; score: ScoreVue3 | null }
export interface JudgingVue3 { revision: number; deadline: string | null; frozenAt: string | null; materialVersion: string | number | null; totalWorks: number; submittedAt: string | null; isOpen: boolean }
export interface NewsVue3 { id: string; title: string; body: string; publishedAt: string }
export interface PageVue3<T> { items: T[]; total: number; page: number; pages: number }
export interface ContestErrorVue3 { status?: number; message?: string; fields?: Record<string, string> }
export interface ViewerVue3 { destroy(): void; setImages(front: string, back?: string): void; setRatio(ratio: { w: number; h: number }): void }
export interface ContestServicesVue3 extends Pick<ServicesVue3, 't' | 'user' | 'onAuth' | 'navigate' | 'toast' | 'setQuery' | 'formatDate' | 'image' | 'placeholder'> {
  get<T>(path: string, signal: AbortSignal): Promise<T>;
  put<T>(path: string, payload: unknown, signal: AbortSignal): Promise<T>;
  post<T>(path: string, payload: unknown, signal: AbortSignal): Promise<T>;
  createViewer(root: HTMLElement, options: Record<string, unknown>): ViewerVue3;
  bindShare(root: HTMLElement, card: ContestCardVue3, work: WorkVue3): () => void;
  privateImage(path: string, signal: AbortSignal): Promise<Blob>;
  currentUser(): { uid?: string; email?: string } | null;
  resetEdits(): void;
  scrollHash(): void;
}
export interface ContestLegacyVue3 extends LegacyQslVue3 {
  api: LegacyQslVue3['api'] & {
    put<T>(path: string, body: unknown, options: { signal: AbortSignal }): Promise<T>;
    post<T>(path: string, body: unknown, options: { signal: AbortSignal }): Promise<T>;
    token(): string | null;
    setToken(value: string | null): void;
  };
  card3d: { create(root: HTMLElement, options: Record<string, unknown>): ViewerVue3 };
  cardShare: { bind(button: HTMLButtonElement, card: ContestCardVue3, options: { contestWork: WorkVue3 }): () => void };
  setUser(user: null): void;
  scrollToHash(): void;
  i18n: { resetEdits(): void; error(source: string): string };
}
