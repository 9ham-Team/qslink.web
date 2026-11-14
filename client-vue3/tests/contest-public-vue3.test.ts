import { afterEach, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ContestLandingVue3 from '../src/contest-vue3/pages/ContestLanding-vue3.vue';
import ContestWorksVue3 from '../src/contest-vue3/pages/ContestWorks-vue3.vue';
import ContestWorkDetailVue3 from '../src/contest-vue3/pages/ContestWorkDetail-vue3.vue';
import { contestFixtureVue3, workVue3 } from './contest-fixture-vue3';
let wrapper: VueWrapper;
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });
it('renders both landing layouts with original rules/assets and isolated news/progress — vue3', async () => {
  const { services } = contestFixtureVue3();
  vi.mocked(services.get).mockImplementation(async path => path.includes('/announcements?') ? { items: [{ id: 'news', title: '<img src=x>', body: '<script>text</script>', publishedAt: '2026-01-01' }], total: 1, page: 1, pages: 1 } : { contest: { approvedRegistrationCount: 127 } } as any);
  wrapper = mount(ContestLandingVue3, { props: { services, alternate: false } }); await flushPromises();
  expect(wrapper.text()).toContain('机器评分 30 分 + 人工评分 50 分 + 投票评分 20 分');
  expect(wrapper.text()).toContain('2026 年 12 月 20 日'); expect(wrapper.text()).toContain('2026 年 12 月 25 日');
  expect(wrapper.find('progress').attributes('value')).toBe('100'); expect(wrapper.text()).toContain('127');
  expect(wrapper.find('.f-contest-news h3').text()).toBe('<img src=x>'); expect(wrapper.find('.f-contest-news script').exists()).toBe(false);
  expect(wrapper.find('#contest-news-title').element.compareDocumentPosition(wrapper.find('.f-contest-prizes').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(vi.mocked(services.get).mock.calls.some(([url]) => url.includes('eventKey=qsl-design-2026-11'))).toBe(true);
  await wrapper.setProps({ alternate: true }); await flushPromises(); expect(wrapper.find('.f-contest-intro').exists()).toBe(true);
  for (const [path, signal] of vi.mocked(services.get).mock.calls) { expect(path).not.toContain('reminder=1'); expect(signal).toBeInstanceOf(AbortSignal); }
});
it('uses work IDs and read-only vote totals in the works list — vue3', async () => {
  const { services } = contestFixtureVue3(); const work = workVue3('independent-work', 1);
  vi.mocked(services.get).mockResolvedValue({ items: [work], total: 1, page: 1, pages: 1 });
  wrapper = mount(ContestWorksVue3, { props: { services, query: new URLSearchParams('q=001') } }); await flushPromises();
  expect(wrapper.find('.qsl-tile-media').attributes('href')).toBe('/events/qsl-design-2026-11/works/independent-work');
  expect(wrapper.find('.qsl-like').exists()).toBe(false); expect(wrapper.find('.g-contest-votes').text()).toBe('0 票');
  expect(services.post).not.toHaveBeenCalled();
});
it('does not optimistically add votes, prevents double submit and disposes 3D/share — vue3', async () => {
  const { services, viewer, shareCleanup } = contestFixtureVue3(); const work = workVue3();
  const voting = { startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 60000).toISOString(), isOpen: true, eligible: true, votesUsed: 0, votedWorkIds: [] };
  vi.mocked(services.get).mockResolvedValue({ work, voting });
  let resolve!: (value: any) => void; vi.mocked(services.post).mockImplementation(() => new Promise(done => { resolve = done; }));
  wrapper = mount(ContestWorkDetailVue3, { props: { id: work.id, services } }); await flushPromises();
  await wrapper.find('.g-contest-detail__actions button').trigger('click'); await flushPromises();
  const confirm = document.querySelector('.modal-actions .btn-primary') as HTMLButtonElement;
  confirm.click(); confirm.click(); await flushPromises();
  expect(services.post).toHaveBeenCalledOnce(); expect(wrapper.find('.g-contest-detail__voting strong').text()).toBe('0 票');
  resolve({ work: { ...work, voteCount: 1 }, voting: { ...voting, votesUsed: 1, votedWorkIds: [work.id] } }); await flushPromises();
  expect(wrapper.find('.g-contest-detail__voting strong').text()).toBe('1 票');
  expect(wrapper.find('.g-contest-detail__actions button').text()).toBe('已投票');
  expect(vi.mocked(services.post).mock.calls[0][1]).toMatchObject({ fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
  wrapper.unmount(); expect(viewer.destroy).toHaveBeenCalledOnce(); expect(shareCleanup).toHaveBeenCalled();
});

it('gates guest login, duplicate votes, exhausted quotas and closing time without posting — vue3', async () => {
  const { services, setUser } = contestFixtureVue3();
  let voting = { startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 60000).toISOString(), isOpen: true, eligible: true, votesUsed: 0, votedWorkIds: [] as string[] };
  vi.mocked(services.get).mockImplementation(async () => ({ work: workVue3(), voting: { ...voting } }) as any);
  setUser(null);
  wrapper = mount(ContestWorkDetailVue3, { props: { id: 'work-a', services } }); await flushPromises();
  await wrapper.find('.g-contest-detail__actions button').trigger('click');
  expect(services.navigate).toHaveBeenCalledWith('/login?next=%2Fevents%2Fqsl-design-2026-11%2Fworks%2Fwork-a');
  voting = { ...voting, votesUsed: 5 }; setUser({ uid: 'user' }); await flushPromises();
  expect(wrapper.find('.g-contest-detail__actions button').text()).toBe('赛事票数已用完');
  expect(wrapper.find('.g-contest-detail__actions button').attributes('disabled')).toBeDefined();
  voting = { ...voting, votesUsed: 1, votedWorkIds: ['work-a'] }; setUser({ uid: 'user' }); await flushPromises();
  expect(wrapper.find('.g-contest-detail__actions button').text()).toBe('已投票');
  voting = { ...voting, isOpen: false, votedWorkIds: [] }; setUser({ uid: 'user' }); await flushPromises();
  expect(wrapper.find('.g-contest-detail__actions button').text()).toBe('当前不在投票时间');
  expect(services.post).not.toHaveBeenCalled();
});
