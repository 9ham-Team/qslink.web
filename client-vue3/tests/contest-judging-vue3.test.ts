import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ContestJudgingVue3 from '../src/contest-vue3/pages/ContestJudging-vue3.vue';
import { contestFixtureVue3, judgingVue3, materialVue3 } from './contest-fixture-vue3';
let wrapper: VueWrapper;
let created: ReturnType<typeof vi.fn>, revoked: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  const Base = URL; let id = 0;
  created = vi.fn(() => 'blob:private-' + ++id); revoked = vi.fn();
  vi.stubGlobal('URL', class extends Base { static createObjectURL = created; static revokeObjectURL = revoked; });
  vi.stubGlobal('confirm', () => true);
});
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function setup(saved = false) {
  const fixture = contestFixtureVue3();
  const data = { judging: judgingVue3(), items: [materialVue3()] };
  if (saved) data.items[0].score = { value: 0, comment: 'saved', revision: 1 };
  vi.mocked(fixture.services.get).mockImplementation(async () => structuredClone(data));
  wrapper = mount(ContestJudgingVue3, { props: { services: fixture.services } }); await flushPromises();
  return { ...fixture, data };
}
it('saves a real zero score, marks completion and allows editing after completion — vue3', async () => {
  const { services, data } = await setup();
  vi.mocked(services.put).mockResolvedValueOnce({ score: { value: 0, comment: 'zero', revision: 1 }, judging: { ...data.judging, revision: 8, submittedAt: null } });
  await wrapper.find('input[name=score]').setValue('0'); await wrapper.find('textarea').setValue('zero');
  await wrapper.find('form').trigger('submit'); await flushPromises();
  expect(vi.mocked(services.put).mock.calls[0][1]).toEqual({ expectedRevision: 0, score: 0, comment: 'zero' });
  const complete = wrapper.findAll('button').find(button => button.text() === '标记评分完成')!;
  expect(complete.attributes('disabled')).toBeUndefined();
  vi.mocked(services.post).mockResolvedValue({ judging: { ...data.judging, revision: 9, submittedAt: new Date().toISOString() } });
  await complete.trigger('click'); await flushPromises(); (document.querySelector('.modal-actions .btn-primary') as HTMLButtonElement).click(); await flushPromises();
  expect(services.post).toHaveBeenCalledWith(expect.stringContaining('/submit'), { expectedRevision: 8 }, expect.any(AbortSignal));
  expect(wrapper.find('fieldset').attributes('disabled')).toBeUndefined();
  await wrapper.find('input[name=score]').setValue('9');
  vi.mocked(services.put).mockResolvedValue({ score: { value: 9, comment: 'zero', revision: 2 }, judging: { ...data.judging, revision: 10, submittedAt: null } });
  await wrapper.find('form').trigger('submit'); await flushPromises();
  expect(complete.attributes('disabled')).toBeUndefined();
});
it('preserves a draft and its original revision across polling, and locks conflicts until refresh — vue3', async () => {
  const { services, data } = await setup();
  await wrapper.find('input[name=score]').setValue('8');
  data.items[0].score = { value: 7, comment: 'new server score', revision: 2 };
  await vi.advanceTimersByTimeAsync(30000); await flushPromises();
  expect(wrapper.find('input[name=score]').element.value).toBe('8');
  expect(services.privateImage).toHaveBeenCalledOnce(); // A metadata poll must not reload unchanged blobs.
  vi.mocked(services.put).mockRejectedValue(Object.assign(new Error('revision conflict'), { status: 409 }));
  await wrapper.find('form').trigger('submit'); await flushPromises();
  expect(vi.mocked(services.put).mock.calls[0][1]).toMatchObject({ expectedRevision: 0 });
  expect(wrapper.find('fieldset').attributes('disabled')).toBeDefined();
  await vi.advanceTimersByTimeAsync(30000); await flushPromises();
  expect(wrapper.find('fieldset').attributes('disabled')).toBeDefined();
  await wrapper.findAll('button').find(button => button.text() === '刷新评审数据')!.trigger('click'); await flushPromises();
  expect(wrapper.find('input[name=score]').element.value).toBe('7');
  expect(wrapper.find('fieldset').attributes('disabled')).toBeUndefined();
});
it('drops private content and revokes blobs on forbidden polling — vue3', async () => {
  const { services } = await setup();
  expect(wrapper.find('img').attributes('src')).toMatch(/^blob:/);
  vi.mocked(services.get).mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 }));
  await vi.advanceTimersByTimeAsync(30000); await flushPromises();
  expect(wrapper.find('input[name=score]').exists()).toBe(false); expect(wrapper.find('img').exists()).toBe(false);
  expect(wrapper.text()).not.toContain('Private title'); expect(revoked).toHaveBeenCalledWith('blob:private-1');
  wrapper.unmount(); expect(vi.getTimerCount()).toBe(0);
});
it('blocks writes at the actual deadline and disposes private requests on leaving — vue3', async () => {
  const { services, data, auth } = await setup(true);
  await vi.advanceTimersByTimeAsync(Date.parse(data.judging.deadline!) - Date.now()); await flushPromises();
  expect(wrapper.find('fieldset').attributes('disabled')).toBeDefined();
  await wrapper.find('form').trigger('submit'); expect(services.put).not.toHaveBeenCalled();
  const signal = vi.mocked(services.privateImage).mock.calls[0][1];
  wrapper.unmount(); expect(signal.aborted).toBe(true); expect(revoked).toHaveBeenCalled(); expect(auth.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
});
