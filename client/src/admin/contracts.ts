import type { AuthUserVue3, CardDetailVue3, ExchangeItemVue3 } from '../contracts';
export interface AdminUser extends AuthUserVue3 {
  email: string; bio?: string; joinedAt?: string; cardCount?: number; status: 'active' | 'banned'; createdAt: string;
  stats?: { cards: number; likesReceived: number; exchanges?: number };
}
export interface AdminCard extends CardDetailVue3 {
  rejectReason?: string | null; contestOptIn?: boolean; contestDescription?: string;
}
export interface Page<T> { items: T[]; total: number; page: number; pages: number; limit?: number }
export interface AdminStats {
  users: { total: number; active: number; banned: number; newThisWeek: number };
  cards: { total: number; pending: number; approved: number; rejected: number };
  exchanges: { total: number; pending: number; approved: number; completed: number; rejected: number };
  likes: number; pendingCards: AdminCard[]; recentUsers: AdminUser[]; recentExchanges: ExchangeItemVue3[];
}
export interface ContestEntry {
  id: string; status: string; revision: number; updatedAt: string;
  user: AdminUser | null; contactEmail: string; reviewReason?: string;
  cards: AdminCard[]; works: Array<{ number: number; description: string; card: AdminCard | null }>;
}
export interface Voting { startsAt: string | null; endsAt: string | null; revision: number }
export interface Judge extends Partial<AdminUser> {
  userId: string; slot: number; scoredCount: number; submittedAt: string | null;
}
export interface Judging {
  revision: number; frozenAt: string | null; deadline: string | null;
  materialVersion: number | string | null; totalWorks: number; canViewResults: boolean; judges: Judge[];
}
export interface JudgingResults {
  judges: Array<{ slot: number }>;
  items: Array<{ number: number; title: string; complete: boolean; humanScore: number | null;
    scores: Array<{ slot: number; score: number | null; comment: string; submittedAt?: string | null }> }>;
}
export const CONTEST_API = '/api/admin/contests/qsl-design-2026-11';
export const ADMIN_TABS = ['overview', 'users', 'cards', 'exchanges', 'announcements', 'contest'] as const;
export type AdminTab = typeof ADMIN_TABS[number];
export const TAB_LABELS: Record<AdminTab, string> = {
  overview: '概览', users: '用户管理', cards: '卡片审核', exchanges: '换卡记录', announcements: '公告管理', contest: '比赛审核',
};
export function normalizeTab(value: string | null): AdminTab {
  return ADMIN_TABS.includes(value as AdminTab) ? value as AdminTab : 'overview';
}
export function beijingInput(iso: string | null) {
  const time = Date.parse(iso || '');
  return Number.isFinite(time) ? new Date(time + 8 * 3600000).toISOString().slice(0, 23) : '';
}
export function beijingIso(raw: string) {
  if (!raw) return null;
  const time = Date.parse(raw + '+08:00');
  if (!Number.isFinite(time)) throw new Error('请输入有效的北京时间，且开始时间必须早于结束时间。');
  return new Date(time).toISOString();
}
export function message(err: unknown) { return String((err as { message?: string })?.message || '操作失败，请稍后重试'); }
export function fields(err: unknown): Record<string, string> { return (err as { fields?: Record<string, string> })?.fields || {}; }
export function conflict(err: unknown) { return (err as { status?: number })?.status === 409; }
export const codeLength = (value: string) => Array.from(value).length;
