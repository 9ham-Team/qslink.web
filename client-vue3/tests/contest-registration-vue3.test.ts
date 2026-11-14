import { afterEach, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ContestRegistrationVue3 from '../src/contest-vue3/pages/ContestRegistration-vue3.vue';
import { contestFixtureVue3, entryVue3, workVue3 } from './contest-fixture-vue3';
let wrapper: VueWrapper;
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); });
function click(label: string) { const button = wrapper.findAll('button').find(button => button.text() === label); expect(button).toBeTruthy(); return button!.trigger('click'); }
function primary() { return document.querySelector('.modal-overlay:last-child .modal-actions .btn-primary') as HTMLButtonElement; }
it('keeps selection in two-step Vue dialogs, saves descriptions locally, then submits explicit works — vue3', async () => {
  const { services } = contestFixtureVue3();
  vi.mocked(services.get).mockImplementation(async url => url.endsWith('/entry') ? { entry: null } as any : { items: [1, 2, 3].map(n => workVue3('w' + n, n).card) });
  vi.mocked(services.put).mockResolvedValue({ entry: entryVue3(2) });
  wrapper = mount(ContestRegistrationVue3, { props: { services } }); await flushPromises();
  await click('选择参赛卡片'); await flushPromises();
  const inputs = [...document.querySelectorAll<HTMLInputElement>('.modal-overlay input[type=checkbox]')];
  for (const input of inputs.slice(0, 2)) { input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); await flushPromises(); }
  expect(inputs[2].disabled).toBe(true);
  primary().click(); await flushPromises(); expect(document.querySelectorAll('.modal-overlay')).toHaveLength(2);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises();
  expect(document.querySelectorAll('.modal-overlay')).toHaveLength(1);
  primary().click(); await flushPromises(); primary().click(); await flushPromises();
  expect(wrapper.findAll('.f-contest-selected-card')).toHaveLength(2);
  for (const card of wrapper.findAll('.f-contest-selected-card')) {
    await card.findAll('button')[0].trigger('click'); await flushPromises();
    const input = document.querySelector('textarea') as HTMLTextAreaElement;
    input.value = 'Design description'; input.dispatchEvent(new Event('input', { bubbles: true }));
    primary().click(); await flushPromises();
  }
  expect(services.put).not.toHaveBeenCalled();
  await wrapper.find('form').trigger('submit'); await flushPromises();
  expect(services.put).toHaveBeenCalledOnce();
  expect(vi.mocked(services.put).mock.calls[0][1]).toEqual({ works: [{ cardId: 'card-1', description: 'Design description' }, { cardId: 'card-2', description: 'Design description' }], contactEmail: 'qa@example.test' });
  expect(wrapper.text()).toContain('作品说明审核中');
});
it('does not truncate legacy over-limit works and preserves drafts on revision conflict — vue3', async () => {
  vi.stubGlobal('confirm', () => true);
  const { services } = contestFixtureVue3(); const existing = entryVue3(3);
  vi.mocked(services.get).mockImplementation(async url => url.endsWith('/entry') ? { entry: existing } as any : { items: existing.works.map(work => work.card) });
  vi.mocked(services.put).mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 }));
  wrapper = mount(ContestRegistrationVue3, { props: { services } }); await flushPromises(); await click('修改报名信息');
  expect(wrapper.findAll('.f-contest-selected-card')).toHaveLength(3);
  await wrapper.find('form').trigger('submit'); expect(services.put).not.toHaveBeenCalled();
  await wrapper.findAll('.f-contest-selected-card')[2].findAll('button')[1].trigger('click');
  await wrapper.find('input[type=email]').setValue('changed@example.test');
  await wrapper.find('form').trigger('submit'); await flushPromises();
  expect(vi.mocked(services.put).mock.calls[0][1]).toMatchObject({ expectedRevision: 4, contactEmail: 'changed@example.test' });
  expect(wrapper.find('input[type=email]').element.value).toBe('changed@example.test');
  expect(wrapper.find('button[type=submit]').attributes('disabled')).toBeDefined();
  expect(wrapper.text()).toContain('报名状态已变化');
});
it('clears registration data and ignores late results when an account signs out — vue3', async () => {
  const { services, setUser, auth } = contestFixtureVue3();
  const resolvers: ((value: any) => void)[] = [];
  vi.mocked(services.get).mockImplementation(() => new Promise(resolve => resolvers.push(resolve)));
  wrapper = mount(ContestRegistrationVue3, { props: { services } });
  const signal = vi.mocked(services.get).mock.calls[0][1];
  setUser(null); await flushPromises();
  resolvers[0]({ entry: entryVue3() }); resolvers[1]({ items: [workVue3().card] }); await flushPromises();
  expect(signal.aborted).toBe(true); expect(wrapper.find('.f-contest-guest').exists()).toBe(true);
  expect(wrapper.find('input[type=email]').exists()).toBe(false);
  wrapper.unmount(); expect(auth.size).toBe(0);
});
