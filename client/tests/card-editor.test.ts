import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import CardEditorVue3 from '../src/pages/CardEditor.vue';
import type { CardManageServicesVue3, RouteContextVue3 } from '../src/contracts';

function makeServices(overrides: Partial<CardManageServicesVue3> = {}) {
  const authListeners = new Set<(user: { id?: string; uid?: string; callSign?: string } | null) => void>();
  let currentUser: { id?: string; uid?: string; callSign?: string } | null = { id: 'u1', uid: 'u1', callSign: 'BG4JEC' };
  const viewer = {
    destroy: vi.fn(),
    setImages: vi.fn(),
    setRatio: vi.fn(),
  };
  const createViewer = vi.fn(() => viewer);
  const processor = {
    process: vi.fn().mockResolvedValue({ src: 'data:image/webp;base64,UklGRg==', width: 1200, height: 800 }),
    destroy: vi.fn(),
  };
  let leaveGuard: ((ctx: { type: 'navigate' | 'pop'; to: string }) => boolean | Promise<boolean>) | null = null;

  const services: CardManageServicesVue3 = {
    t: s => s,
    user: () => currentUser,
    onAuth: fn => {
      authListeners.add(fn);
      return () => authListeners.delete(fn);
    },
    getSpace: vi.fn(),
    listCards: vi.fn(),
    setQuery: vi.fn(),
    celebrate: vi.fn(),
    likeCard: vi.fn(),
    image: vi.fn(),
    placeholder: '/placeholder.svg',
    formatDate: s => s,
    formatNumber: n => String(n),
    navigate: vi.fn(),
    toast: vi.fn(),
    share: vi.fn(),
    token: () => 'tok-1',
    i18nError: s => s,
    resetEdits: vi.fn(),
    isLanguageSwitching: () => false,
    timeAgo: () => '刚刚',
    statusText: s => s,
    getMyCards: vi.fn(),
    getCardDetail: vi.fn(),
    createCard: vi.fn().mockResolvedValue({ card: { id: 'c-new', status: 'pending' } }),
    updateCard: vi.fn().mockResolvedValue({ card: { id: 'c1', status: 'pending' } }),
    updateCardStock: vi.fn().mockResolvedValue({ card: { id: 'c1', stock: 10 } }),
    deleteCard: vi.fn(),
    shareCard: vi.fn(),
    getContestEntry: vi.fn().mockResolvedValue({ entry: { works: [] } }),
    createViewer,
    createImageProcessor: () => processor,
    setLeaveGuard: fn => {
      leaveGuard = fn;
      return () => { if (leaveGuard === fn) leaveGuard = null; };
    },
    ...overrides,
  };

  return {
    services,
    viewer,
    createViewer,
    processor,
    getLeaveGuard: () => leaveGuard,
    emitAuth(nextUser: { id?: string; uid?: string; callSign?: string } | null) {
      currentUser = nextUser;
      for (const fn of authListeners) fn(nextUser);
    },
  };
}

function makeCtx(id?: string): RouteContextVue3 {
  return {
    path: id ? `/dashboard/cards/${id}/edit` : '/dashboard/cards/new',
    params: id ? { id } : {},
    query: new URLSearchParams(),
  };
}

describe('CardEditor', () => {
  it('validates Unicode limits, keeps 3D viewer stable on text input, and submits converted WebP with consent', async () => {
    const { services, viewer, createViewer, processor } = makeServices();
    const wrapper = mount(CardEditorVue3, { props: { ctx: makeCtx(), services } });
    await flushPromises();

    expect(createViewer).toHaveBeenCalledTimes(1);
    const titleInput = wrapper.find('#fCardTitle');
    expect(titleInput.attributes('maxlength')).toBeUndefined();

    // Upload front image
    const file = new File([new Uint8Array([1, 2, 3])], 'front.png', { type: 'image/png' });
    const fileInput = wrapper.find('[data-upload-side="front"] input[type="file"]');
    Object.defineProperty(fileInput.element, 'files', { value: [file], configurable: true });
    await fileInput.trigger('change');
    await flushPromises();

    expect(processor.process).toHaveBeenCalledWith(file);
    expect(viewer.setImages).toHaveBeenLastCalledWith('data:image/webp;base64,UklGRg==', null);

    // 60-emoji title should be accepted without truncation
    await titleInput.setValue('📻'.repeat(60));
    await wrapper.find('#fCardNotes').setValue('备注');
    await wrapper.find('#fCardStock').setValue('0');
    expect(createViewer).toHaveBeenCalledTimes(1);

    // Must explicitly check content consent
    await wrapper.find('.f-editor-actions [data-submit]').trigger('click');
    expect(services.createCard).not.toHaveBeenCalled();
    expect(wrapper.find('[data-consent-error]').text()).toContain('请确认内容权利及授权后再提交');

    await wrapper.find('[name="contentConsent"]').setValue(true);
    await wrapper.find('.f-editor-actions [data-submit]').trigger('click');
    await flushPromises();

    expect(services.createCard).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptTerms: true,
        termsVersion: '2026-10-25',
        acceptContentLicense: true,
        title: '📻'.repeat(60),
        stock: 0,
        frontImage: 'data:image/webp;base64,UklGRg==',
        contestOptIn: false,
      }),
      expect.any(AbortSignal),
    );
    expect(services.resetEdits).toHaveBeenCalled();
    expect(services.navigate).toHaveBeenCalledWith('/dashboard/cards');

    wrapper.unmount();
    expect(processor.destroy).toHaveBeenCalled();
    expect(viewer.destroy).toHaveBeenCalled();
  });

  it('preserves previous ready image when conversion fails and disables submit during processing', async () => {
    let rejectSecond!: (err: Error) => void;
    const processor = {
      process: vi.fn()
        .mockResolvedValueOnce({ src: 'data:image/webp;base64,FIRST', width: 800, height: 600 })
        .mockImplementationOnce(() => new Promise((_, rej) => { rejectSecond = rej; })),
      destroy: vi.fn(),
    };
    const { services } = makeServices({ createImageProcessor: () => processor });
    const wrapper = mount(CardEditorVue3, { props: { ctx: makeCtx(), services } });
    await flushPromises();

    const fileInput = wrapper.find('[data-upload-side="front"] input[type="file"]');
    const f1 = new File([new Uint8Array([1])], '1.png', { type: 'image/png' });
    Object.defineProperty(fileInput.element, 'files', { value: [f1], configurable: true });
    await fileInput.trigger('change');
    await flushPromises();

    const f2 = new File([new Uint8Array([2])], '2.png', { type: 'image/png' });
    Object.defineProperty(fileInput.element, 'files', { value: [f2], configurable: true });
    await fileInput.trigger('change');
    expect((wrapper.find('.f-editor-actions [data-submit]').element as HTMLButtonElement).disabled).toBe(true);

    rejectSecond(new Error('转换失败'));
    await flushPromises();

    expect((wrapper.find('.f-editor-actions [data-submit]').element as HTMLButtonElement).disabled).toBe(false);
    expect(wrapper.find('[data-upload-side="front"] [data-preview-img]').attributes('src')).toBe('data:image/webp;base64,FIRST');
  });

  it('in edit mode: blocks non-owner, omits stock on PUT, and stock dialog keeps draft and dirty state', async () => {
    const getCardDetail = vi.fn().mockResolvedValue({
      card: {
        id: 'c1',
        title: '旧标题',
        callSign: 'BG4JEC',
        notes: '旧备注',
        stock: 5,
        status: 'rejected',
        rejectReason: '需补全呼号',
        ratio: { w: 4, h: 3 },
        frontImage: '/uploads/f.webp',
        contestOptIn: true,
        contestDescription: '参赛介绍',
        contestWork: { id: 'w1', number: 12 },
      },
      owner: { id: 'u1', uid: 'u1' },
    });
    const { services, viewer } = makeServices({ getCardDetail });
    const wrapper = mount(CardEditorVue3, { props: { ctx: makeCtx('c1'), services }, attachTo: document.body });
    await flushPromises();

    expect(wrapper.find('#fEditorNotice').text()).toContain('需补全呼号');
    expect((wrapper.find('[name="contentConsent"]').element as HTMLInputElement).checked).toBe(false);

    // Edit title -> marks dirty
    await wrapper.find('#fCardTitle').setValue('新标题草稿');
    expect(wrapper.find('[data-unsaved]').exists()).toBe(true);

    // Open stock dialog and save -> must not overwrite title or clear dirty, nor rebuild viewer
    await wrapper.find('#fCardStock').trigger('click');
    const stockInput = document.body.querySelector('[data-stock]') as HTMLInputElement;
    stockInput.value = '10';
    stockInput.dispatchEvent(new Event('input'));
    (document.body.querySelector('[data-stock-save]') as HTMLButtonElement).click();
    await flushPromises();

    expect(services.updateCardStock).toHaveBeenCalledWith('c1', 10, expect.any(AbortSignal));
    expect((wrapper.find('#fCardTitle').element as HTMLInputElement).value).toBe('新标题草稿');
    expect(wrapper.find('[data-unsaved]').exists()).toBe(true);
    expect(viewer.destroy).not.toHaveBeenCalled();

    // Uncheck contestOptIn and submit -> PUT omits stock and sends contestOptIn: false
    await wrapper.find('[data-contest-optin]').setValue(false);
    await wrapper.find('[name="contentConsent"]').setValue(true);
    await wrapper.find('.f-editor-actions [data-submit]').trigger('click');
    await flushPromises();

    const updatePayload = (services.updateCard as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect('stock' in updatePayload).toBe(false);
    expect(updatePayload.contestOptIn).toBe(false);
    wrapper.unmount();
  });

  it('rejects editing another user card even if detail API returned it', async () => {
    const getCardDetail = vi.fn().mockResolvedValue({
      card: { id: 'c-other', title: '他人卡片', frontImage: '/f.webp', ratio: { w: 3, h: 2 } },
      owner: { id: 'u2', uid: 'u2' },
    });
    const { services } = makeServices({ getCardDetail });
    const wrapper = mount(CardEditorVue3, { props: { ctx: makeCtx('c-other'), services } });
    await flushPromises();

    expect(wrapper.text()).toContain('只能编辑自己的卡片');
    expect(wrapper.find('#fEditorForm').exists()).toBe(false);
  });

  it('enforces contest 2-work limit and coordinates unsaved leave guard', async () => {
    const { services, getLeaveGuard } = makeServices({
      getContestEntry: vi.fn().mockResolvedValue({ entry: { works: [{ id: 'w1', cardId: 'a' }, { id: 'w2', cardId: 'b' }] } }),
    });
    const wrapper = mount(CardEditorVue3, { props: { ctx: makeCtx(), services }, attachTo: document.body });
    await flushPromises();

    expect((wrapper.find('[data-contest-optin]').element as HTMLInputElement).disabled).toBe(true);
    expect(wrapper.find('[data-contest-limit]').exists()).toBe(true);

    // Dirty leave guard
    await wrapper.find('#fCardTitle').setValue('未保存标题');
    const guard = getLeaveGuard()!;
    const pendingDecision = guard({ type: 'navigate', to: '/dashboard/cards' });
    await flushPromises();
    expect(document.body.querySelector('[data-leave-confirm]')).not.toBeNull();
    (document.body.querySelector('[data-leave-confirm]') as HTMLButtonElement).click();
    expect(await pendingDecision).toBe(true);
    wrapper.unmount();
  });
});
