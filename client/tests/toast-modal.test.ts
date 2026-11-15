import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import ToastHostVue3 from '../src/components/ToastHost.vue';
import DialogVue3 from '../src/components/Dialog.vue';
import { clearAllToastsVue3, showToastVue3, useToastItemsVue3 } from '../src/toast-store';
import { createDialogService } from '../src/dialog-service';
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

  it('renders Vue component content safely and returns only an idempotent close handle', async () => {
    const service=createDialogService(value=>value);
    const Content=defineComponent({emits:['close'],setup(_props,{emit}){return()=>h(DialogVue3,{title:'Safe',t:(v:string)=>v,onClose:()=>emit('close')},{default:()=>h('p','<b>plain text</b>')});}});
    const handle=service.open(Content,{});
    await nextTick();
    expect(document.querySelector('.modal-body b')).toBeNull();
    expect(document.querySelector('.modal-body')?.textContent).toContain('<b>plain text</b>');
    handle.close();handle.close();await nextTick();
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('resolves confirmation once and Escape only closes the top Vue dialog', async () => {
    const service=createDialogService(value=>value);
    const first=service.confirm({title:'Outer',message:'one'});
    const second=service.confirm({title:'Inner',message:'two'});
    await nextTick();
    expect(document.querySelectorAll('.modal-overlay')).toHaveLength(2);
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await expect(second).resolves.toBe(false);await nextTick();
    expect(document.querySelectorAll('.modal-overlay')).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await expect(first).resolves.toBe(false);await nextTick();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('settles pending confirmations on application cleanup and restores focus', async () => {
    const button=document.createElement('button');document.body.append(button);button.focus();
    const service=createDialogService(value=>value);
    const pending=service.confirm({title:'Pending'});
    await nextTick();service.closeAll();await expect(pending).resolves.toBe(false);
    await nextTick();expect(document.activeElement).toBe(button);
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('closing a component dialog before nextTick never reintroduces it', async () => {
    const service=createDialogService(value=>value);
    const Content=defineComponent({setup(){return()=>h(DialogVue3,{title:'Fast',t:(v:string)=>v});}});
    const handle=service.open(Content,{});handle.close();
    await nextTick();vi.advanceTimersByTime(1000);await nextTick();
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });
});
