import { vi } from 'vitest';
import type { ContestServicesVue3, EntryVue3, JudgingVue3, MaterialVue3, WorkVue3 } from '../src/contest-vue3/contracts-vue3';
export const contestRootVue3 = '/api/contests/qsl-design-2026-11';
export const ownerVue3 = { uid: '123456789', displayName: 'QA user', email: 'qa@example.test', joinedAt: '2026-01-01', stats: { cards: 3, likesReceived: 0 } };
export function workVue3(id = 'work-a', number = 1): WorkVue3 { return { id, number, cardId: 'card-' + number, description: 'Description', voteCount: 0, card: { id: 'card-' + number, title: 'Card ' + number, frontImage: '/assets/stamp.svg', backImage: '', status: 'approved', ratio: { w: 3, h: 2 }, owner: ownerVue3, stock: null, liked: false, likeCount: 0 } }; }
export function entryVue3(count = 1): EntryVue3 { return { id: 'entry', revision: 4, status: 'pending', contactEmail: ownerVue3.email, works: Array.from({ length: count }, (_, i) => workVue3('work-' + i, i + 1)) }; }
export function judgingVue3(): JudgingVue3 { return { revision: 7, deadline: new Date(Date.now() + 120000).toISOString(), frozenAt: '2026-01-01', materialVersion: 'v1', totalWorks: 1, submittedAt: null, isOpen: true }; }
export function materialVue3(): MaterialVue3 { return { id: 'material-a', number: 1, title: 'Private title', description: 'Private description', frontUrl: contestRootVue3 + '/judging/materials/material-a/front', backUrl: null, score: null }; }
export function contestFixtureVue3() {
  let user: { uid?: string; email?: string } | null = { ...ownerVue3 };
  const auth = new Set<Function>();
  const viewer = { destroy: vi.fn(), setImages: vi.fn(), setRatio: vi.fn() };
  const shareCleanup = vi.fn();
  const services: ContestServicesVue3 = {
    t: (source, values) => source.replace(/\{(\w+)\}/g, (whole, key) => values && key in values ? String(values[key]) : whole),
    user: () => user, currentUser: () => user, onAuth: fn => { auth.add(fn); return () => auth.delete(fn); },
    get: vi.fn(), put: vi.fn(), post: vi.fn(), resetEdits: vi.fn(), scrollHash: vi.fn(), navigate: vi.fn(), toast: vi.fn(), setQuery: vi.fn(), formatDate: value => value,
    image: vi.fn(), placeholder: '/assets/stamp.svg', createViewer: vi.fn(() => viewer),
    bindShare: vi.fn(() => shareCleanup), privateImage: vi.fn().mockResolvedValue(new Blob(['private image'])),
  };
  return { services, auth, viewer, shareCleanup, setUser(next: typeof user) { user = next; for (const fn of [...auth]) fn(next); } };
}
