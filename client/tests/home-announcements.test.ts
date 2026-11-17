import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import HomeAnnouncementsVue3 from '../src/components/HomeAnnouncements.vue';
import type { AnnouncementPageVue3, AnnouncementVue3, HomeServicesVue3 } from '../src/contracts';

function makeAnnouncement(id: string, overrides: Partial<AnnouncementVue3> = {}): AnnouncementVue3 {
  return {
    id,
    title: 'Notice ' + id,
    body: 'Line 1\nLine 2',
    displaySeconds: 10,
    publishedAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T12:00:00.000Z',
    ...overrides,
  };
}

function createServices(initialUser: { uid?: string } | null = null) {
  let user = initialUser;
  const auth = new Set<(next: { uid?: string } | null) => void>();
  const service: HomeServicesVue3 = {
    t: source => source,
    user: () => user,
    onAuth: fn => { auth.add(fn); return () => auth.delete(fn); },
    getSpace: vi.fn(),
    listCards: vi.fn(),
    setQuery: vi.fn(),
    celebrate: vi.fn(),
    likeCard: vi.fn(),
    image: vi.fn(),
    placeholder: '/assets/placeholder.svg',
    formatDate: x => x,
    formatDateTime: x => 'FMT:' + (x || ''),
    formatNumber: n => String(n),
    navigate: vi.fn(),
    toast: vi.fn(),
    share: vi.fn(() => ({ close: vi.fn() })),
    getHomeCards: vi.fn(),
    getStats: vi.fn(),
    listAnnouncements: vi.fn().mockResolvedValue({
      items: [makeAnnouncement('a1')],
      total: 1,
      page: 1,
      limit: 1,
      pages: 1,
    }),
    dismissAnnouncement: vi.fn().mockResolvedValue({ dismissed: true }),
    scrollToHash: vi.fn(),
    createViewer: vi.fn(),
  };
  return {
    service,
    auth,
    emitAuth(next: { uid?: string } | null) {
      user = next;
      for (const fn of [...auth]) fn(next);
    },
  };
}

let toastRoot: HTMLElement;
let modalRoot: HTMLElement;

beforeEach(() => {
  toastRoot = document.createElement('div');
  toastRoot.id = 'toast-root';
  modalRoot = document.createElement('div');
  modalRoot.id = 'modal-root';
  document.body.append(toastRoot, modalRoot);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  toastRoot.remove();
  modalRoot.remove();
  document.body.innerHTML = '';
});

describe('home announcements — vue3', () => {
  it('escapes title/body, uses publishedAt without eventKey, pauses/resumes countdown without deducting paused time', async () => {
    vi.useFakeTimers();
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    const { service } = createServices();
    vi.mocked(service.listAnnouncements).mockResolvedValue({
      items: [makeAnnouncement('xss', {
        title: '<img src=x onerror=alert(1)>',
        body: '<script>alert(2)</script>\nSecond line',
        displaySeconds: 5,
        publishedAt: '2026-11-14T08:00:00.000Z',
        updatedAt: '2026-11-14T09:00:00.000Z',
      })],
      total: 1,
      page: 1,
      limit: 1,
      pages: 1,
    });

    const wrapper = mount(HomeAnnouncementsVue3, { props: { services: service }, attachTo: document.body });
    await flushPromises();

    expect(service.listAnnouncements).toHaveBeenCalledWith({ page: 1, limit: 1, reminder: true }, expect.any(AbortSignal));
    const notice = document.body.querySelector('.g-announcement-notice') as HTMLElement;
    expect(notice).toBeTruthy();
    expect(notice.querySelector('h2')!.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(notice.querySelector('img')).toBeNull();
    expect(notice.querySelector('script')).toBeNull();
    expect(notice.querySelector('time')!.textContent).toBe('FMT:2026-11-14T08:00:00.000Z');
    expect(notice.querySelector('.g-announcement-countdown')!.textContent).toContain('5 秒后关闭');

    // Advance 2000ms while active -> 3s left
    now += 2000;
    vi.advanceTimersByTime(2000);
    await flushPromises();
    expect(notice.querySelector('.g-announcement-countdown')!.textContent).toContain('3 秒后关闭');

    // Hover pauses countdown; advancing 5000ms must NOT deduct time
    notice.dispatchEvent(new MouseEvent('mouseenter'));
    await flushPromises();
    expect(notice.querySelector('.g-announcement-countdown')!.textContent).toContain('· 已暂停');
    now += 5000;
    vi.advanceTimersByTime(5000);
    await flushPromises();
    expect(notice.querySelector('.g-announcement-countdown')!.textContent).toContain('3 秒后关闭');

    // Resume on mouseleave and finish remaining 3000ms
    notice.dispatchEvent(new MouseEvent('mouseleave'));
    await flushPromises();
    now += 3000;
    vi.advanceTimersByTime(3000);
    await flushPromises();
    // Wait 280ms close transition
    vi.advanceTimersByTime(300);
    await flushPromises();
    expect(document.body.querySelector('.g-announcement-notice')).toBeNull();
    expect(service.dismissAnnouncement).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('pauses and hides on toast occlusion, restores focus on Escape, and ignores Escape when modal is open', async () => {
    const { service } = createServices();
    const wrapper = mount(HomeAnnouncementsVue3, { props: { services: service }, attachTo: document.body });
    await flushPromises();

    const entryBtn = wrapper.find('.g-announcement-entry button').element as HTMLButtonElement;
    const notice = document.body.querySelector('.g-announcement-notice') as HTMLElement;
    const closeBtn = notice.querySelector('.toast-close') as HTMLButtonElement;
    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);

    // Toast appears -> notice gets is-paused & inert, focus moves to entry button
    const toast = document.createElement('div');
    toast.className = 'toast';
    toastRoot.appendChild(toast);
    await flushPromises();
    expect(notice.classList.contains('is-paused')).toBe(true);
    expect(notice.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(entryBtn);

    // Toast disappears -> notice resumes
    toast.remove();
    await flushPromises();
    expect(notice.classList.contains('is-paused')).toBe(false);
    expect(notice.hasAttribute('inert')).toBe(false);

    // External modal open -> Escape must NOT close notice
    const externalModal = document.createElement('div');
    externalModal.className = 'modal-overlay';
    modalRoot.appendChild(externalModal);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(document.body.querySelector('.g-announcement-notice')).toBeTruthy();

    // Remove external modal, focus inside notice, press Escape -> closes and restores focus to entryBtn
    externalModal.remove();
    closeBtn.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(document.activeElement).toBe(entryBtn);

    wrapper.unmount();
  });

  it('handles guest login redirect, dismiss retry/dedup, and aborts old account dismiss on auth switch', async () => {
    const { service, emitAuth } = createServices(null);
    const wrapper = mount(HomeAnnouncementsVue3, { props: { services: service }, attachTo: document.body });
    await flushPromises();

    const guestBtn = document.body.querySelector('.g-announcement-actions .btn-ghost') as HTMLButtonElement;
    expect(guestBtn.textContent?.trim()).toBe('登录后不再提醒');
    guestBtn.click();
    expect(service.navigate).toHaveBeenCalledWith('/login?next=' + encodeURIComponent('/'));
    expect(service.dismissAnnouncement).not.toHaveBeenCalled();

    // Switch to logged-in user
    let resolveDismiss!: (v: { dismissed: boolean }) => void;
    let rejectDismiss!: (e: Error) => void;
    vi.mocked(service.dismissAnnouncement)
      .mockImplementationOnce(() => new Promise((_, fail) => { rejectDismiss = fail; }))
      .mockImplementationOnce(() => new Promise(done => { resolveDismiss = done; }));

    emitAuth({ uid: '111111111' });
    await flushPromises();

    const dismissBtn = document.body.querySelector('.g-announcement-actions .btn-ghost') as HTMLButtonElement;
    expect(dismissBtn.textContent?.trim()).toBe('不再提醒');
    dismissBtn.click();
    await flushPromises();
    expect(dismissBtn.disabled).toBe(true);
    // Duplicate click ignored while saving
    dismissBtn.click();
    expect(service.dismissAnnouncement).toHaveBeenCalledTimes(1);

    // First attempt fails -> notice stays open, toast error, button re-enabled
    rejectDismiss(new Error('save failed'));
    await flushPromises();
    expect(service.toast).toHaveBeenCalledWith('save failed', 'error');
    expect(document.body.querySelector('.g-announcement-notice')).toBeTruthy();
    expect(dismissBtn.disabled).toBe(false);

    // Retry and switch account before it resolves -> old result ignored
    dismissBtn.click();
    await flushPromises();
    const dismissSignal = vi.mocked(service.dismissAnnouncement).mock.calls[1][1];
    emitAuth({ uid: '222222222' });
    expect(dismissSignal.aborted).toBe(true);
    resolveDismiss({ dismissed: true });
    await flushPromises();

    wrapper.unmount();
  });

  it('supports board modal pagination, keeps old page on failure, and ignores stale responses after close/reopen', async () => {
    const { service } = createServices();
    let resolvePage1!: (v: AnnouncementPageVue3) => void;
    vi.mocked(service.listAnnouncements)
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, limit: 1, pages: 1 }) // reminder
      .mockResolvedValueOnce({ items: [makeAnnouncement('p1')], total: 10, page: 1, limit: 8, pages: 2 }) // board p1
      .mockRejectedValueOnce(new Error('page 2 failed')) // board p2 fail
      .mockImplementationOnce(() => new Promise(done => { resolvePage1 = done; })) // board reopen slow
      .mockResolvedValueOnce({ items: [makeAnnouncement('reopen')], total: 1, page: 1, limit: 8, pages: 1 }); // board second open

    const wrapper = mount(HomeAnnouncementsVue3, { props: { services: service }, attachTo: document.body });
    await flushPromises();

    await wrapper.find('.g-announcement-entry button').trigger('click');
    await flushPromises();

    const list = document.body.querySelector('.g-announcement-list') as HTMLElement;
    expect(list.textContent).toContain('Notice p1');

    // Page 2 fails -> keeps page 1 content and re-enables buttons
    const nextBtn = document.body.querySelectorAll('.g-announcement-pager button')[1] as HTMLButtonElement;
    nextBtn.click();
    await flushPromises();
    expect(service.toast).toHaveBeenCalledWith('page 2 failed', 'error');
    expect(list.textContent).toContain('Notice p1');
    expect(list.hasAttribute('aria-busy')).toBe(false);
    expect(nextBtn.disabled).toBe(false);

    // Close modal, reopen while slow request is pending, close & reopen again
    (document.body.querySelector('.modal-x') as HTMLButtonElement).click();
    await flushPromises();
    await wrapper.find('.g-announcement-entry button').trigger('click');
    const slowSignal = vi.mocked(service.listAnnouncements).mock.calls[3][1];
    (document.body.querySelector('.modal-x') as HTMLButtonElement).click();
    await flushPromises();
    expect(slowSignal.aborted).toBe(true);

    await wrapper.find('.g-announcement-entry button').trigger('click');
    await flushPromises();
    resolvePage1({ items: [makeAnnouncement('stale')], total: 1, page: 1, limit: 8, pages: 1 });
    await flushPromises();
    expect(document.body.querySelector('.g-announcement-list')!.textContent).toContain('Notice reopen');
    expect(document.body.querySelector('.g-announcement-list')!.textContent).not.toContain('Notice stale');

    wrapper.unmount();
  });
});
