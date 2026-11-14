import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import ToastHostVue3 from '../src/components/ToastHost.vue';
import DialogVue3 from '../src/components/Dialog.vue';
import { clearAllToastsVue3, showToastVue3, useToastItemsVue3 } from '../src/toast-store';
import { confirmModalVue3, openModalVue3 } from '../src/modal-bridge';
import { clearModalStackVue3 } from '../src/modal-stack';

function setupDomRoots() {
  document.body.innerHTML = `
    <div id="site-header"></div>
    <main id="app"></main>
    <div id="site-footer"></div>
    <div id="toast-root" class="toast-root" aria-live="polite" aria-atomic="true"></div>
    <div id="modal-root"></div>
    <div id="fx-layer" class="fx-layer" aria-hidden="true"></div>
  `;
}

describe('toast and modal Vue3 implementation — vue3', () => {
  let hostApp: ReturnType<typeof createApp> | null = null;
  let hostMount: HTMLElement | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    setupDomRoots();
    clearAllToastsVue3();
    clearModalStackVue3();
    document.body.classList.remove('modal-open');
    hostMount = document.createElement('div');
    document.body.appendChild(hostMount);
    hostApp = createApp({
      render: () => h(ToastHostVue3, { t: (s: string) => s }),
    });
    hostApp.mount(hostMount);
  });

  afterEach(() => {
    clearAllToastsVue3();
    clearModalStackVue3();
    document.body.classList.remove('modal-open');
    hostApp?.unmount();
    hostMount?.remove();
    hostApp = null;
    hostMount = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders multiple toasts safely, supports idempotent early close, and notifies #toast-root — vue3', async () => {
    const closeFirst = showToastVue3('<b>XSS</b> first', 'success', 3200);
    const closeSecond = showToastVue3('Second notice', 'error', 5000);
    await nextTick();

    const root = document.getElementById('toast-root')!;
    const toasts = root.querySelectorAll('.toast.qsl-notification');
    expect(toasts.length).toBe(2);
    expect(toasts[0].classList.contains('toast-success')).toBe(true);
    expect(toasts[1].classList.contains('toast-error')).toBe(true);
    // Text is escaped, not parsed as HTML
    expect(toasts[0].querySelector('b')).toBeNull();
    expect(toasts[0].textContent).toContain('<b>XSS</b> first');

    // Close first before entrance animation completes; calling twice is idempotent
    closeFirst();
    closeFirst();
    await nextTick();
    expect(toasts[0].classList.contains('is-hide')).toBe(true);

    vi.advanceTimersByTime(300);
    await nextTick();
    expect(root.querySelectorAll('.toast').length).toBe(1);

    // Second auto-closes after duration + exit delay
    vi.advanceTimersByTime(5300);
    await nextTick();
    expect(useToastItemsVue3().length).toBe(0);
    expect(root.querySelectorAll('.toast').length).toBe(0);

    // Closing already-expired toast is safe
    expect(() => closeSecond()).not.toThrow();
  });

  it('closes toasts immediately under prefers-reduced-motion — vue3', async () => {
    const origMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
      })),
    });

    try {
      const close = showToastVue3('Instant', 'info', 2000);
      await nextTick();
      const root = document.getElementById('toast-root')!;
      expect(root.querySelector('.toast')?.classList.contains('is-show')).toBe(true);

      close();
      await nextTick();
      expect(root.querySelectorAll('.toast').length).toBe(0);
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: origMatchMedia,
      });
    }
  });

  it('synchronously returns { el, body, close } from openModalVue3 and keeps body DOM island intact — vue3', async () => {
    const onClose = vi.fn();
    const inst = openModalVue3(
      {
        title: '编辑卡片',
        size: 'lg',
        content: '<form id="legacy-form"><input name="title" value="BG7AAA" /></form>',
        onClose,
        actions: [
          { label: '保持开启', closeOnClick: false, onClick: () => {} },
          { label: '返回false', onClick: () => false },
          {
            label: '异步保存',
            type: 'primary',
            onClick: async () => {
              await Promise.resolve();
            },
          },
        ],
      },
      (s) => s,
    );

    // Immediately usable synchronously without nextTick
    expect(inst.el).toBeInstanceOf(HTMLElement);
    expect(inst.el?.classList.contains('modal-lg')).toBe(true);
    const input = inst.body.querySelector('input[name="title"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = 'Modified';

    // Keep-open action and false-returning action do not close
    const buttons = Array.from(inst.el!.querySelectorAll('.modal-actions button')) as HTMLButtonElement[];
    buttons[0].click();
    await nextTick();
    expect(document.body.classList.contains('modal-open')).toBe(true);

    buttons[1].click();
    await nextTick();
    expect(document.body.classList.contains('modal-open')).toBe(true);

    // Mutated input in DOM island must remain untouched across Vue updates
    expect((inst.body.querySelector('input[name="title"]') as HTMLInputElement).value).toBe('Modified');

    // Async action closes after resolving; close() & onClose() are idempotent
    buttons[2].click();
    await Promise.resolve();
    await Promise.resolve();
    await nextTick();
    expect(onClose).toHaveBeenCalledTimes(1);
    inst.close();
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(250);
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('keeps modal open when action throws and guards late async settlement after close — vue3', async () => {
    let rejectFn: ((err: Error) => void) | null = null;
    const inst = openModalVue3(
      {
        title: 'Throw & Late Async',
        actions: [
          {
            label: 'Throw',
            onClick: () => {
              throw new Error('boom');
            },
          },
          {
            label: 'Slow',
            onClick: () =>
              new Promise<void>((_resolve, reject) => {
                rejectFn = reject;
              }),
          },
        ],
      },
      (s) => s,
    );
    const buttons = Array.from(inst.el!.querySelectorAll('.modal-actions button')) as HTMLButtonElement[];
    expect(() => buttons[0].click()).not.toThrow();
    await nextTick();
    expect(document.body.classList.contains('modal-open')).toBe(true);

    buttons[1].click();
    await nextTick();
    expect(buttons[1].disabled).toBe(true);
    inst.close();
    vi.advanceTimersByTime(250);
    rejectFn?.(new Error('late error'));
    await Promise.resolve();
    expect(document.getElementById('modal-root')?.querySelectorAll('.modal-overlay').length).toBe(0);
  });

  it('resolves confirmModalVue3 once with boolean and coordinates nested stack + Escape + body.modal-open with Dialog — vue3', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Trigger';
    document.body.appendChild(trigger);
    trigger.focus();

    const dialogHost = document.createElement('div');
    document.body.appendChild(dialogHost);
    let dialogOpen = true;
    const dialogApp = createApp({
      render: () =>
        dialogOpen
          ? h(
              DialogVue3,
              {
                title: '底层 Vue Dialog',
                t: (s: string) => s,
                onClose: () => {
                  dialogOpen = false;
                },
              },
              {
                default: () => h('button', { id: 'dialog-inner-btn' }, 'Inner'),
              },
            )
          : null,
    });
    dialogApp.mount(dialogHost);
    await nextTick();

    const midModal = openModalVue3({ title: '中层兼容弹窗', dismissible: true }, (s) => s);
    const confirmPromise = confirmModalVue3(
      { title: '确认操作', message: '确定继续？', confirmText: '确定', cancelText: '取消', danger: true },
      (s) => s,
    );
    await nextTick();

    const overlays = Array.from(document.querySelectorAll('#modal-root .modal-overlay')) as HTMLElement[];
    expect(overlays.length).toBe(3);
    expect(Number(overlays[2].style.zIndex)).toBeGreaterThan(Number(overlays[1].style.zIndex));
    expect(Number(overlays[1].style.zIndex)).toBeGreaterThan(Number(overlays[0].style.zIndex));
    expect(document.body.classList.contains('modal-open')).toBe(true);

    // Escape closes only the topmost confirm modal -> resolves false
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(confirmPromise).resolves.toBe(false);
    vi.advanceTimersByTime(250);
    await nextTick();

    // Underlying modals keep body.modal-open active
    expect(document.body.classList.contains('modal-open')).toBe(true);
    expect(document.querySelectorAll('#modal-root .modal-overlay').length).toBe(2);

    // Close middle modal -> still open because Dialog is underneath
    midModal.close();
    vi.advanceTimersByTime(250);
    await nextTick();
    expect(document.body.classList.contains('modal-open')).toBe(true);

    // Close Dialog -> body.modal-open removed
    dialogApp.unmount();
    dialogHost.remove();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('never re-shows modal or confirm when closed before the first animation frame — vue3', async () => {
    const inst = openModalVue3({ title: 'Immediate Close' }, (s) => s);
    inst.close();
    await nextTick();
    // Flush rAF timers before 220ms unmount
    vi.advanceTimersByTime(32);
    await nextTick();
    const overlay = document.querySelector('#modal-root .modal-overlay');
    expect(overlay?.classList.contains('is-show')).toBe(false);
    expect(document.body.classList.contains('modal-open')).toBe(false);

    // Finish unmount cleanup
    vi.advanceTimersByTime(250);
    expect(document.querySelectorAll('#modal-root .modal-overlay').length).toBe(0);

    // Same for confirmModalVue3 closed via Escape before first frame
    const confirmPromise = confirmModalVue3({ title: 'Fast Confirm', message: 'Cancel fast' }, (s) => s);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(confirmPromise).resolves.toBe(false);
    await nextTick();
    vi.advanceTimersByTime(32);
    await nextTick();
    const confirmOverlay = document.querySelector('#modal-root .modal-overlay');
    expect(confirmOverlay?.classList.contains('is-show')).toBe(false);
    expect(document.body.classList.contains('modal-open')).toBe(false);

    vi.advanceTimersByTime(250);
    expect(document.querySelectorAll('#modal-root .modal-overlay').length).toBe(0);
  });
});
