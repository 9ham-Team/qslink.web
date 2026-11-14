import { h, render } from 'vue';
import type { ConfirmOptionsVue3, ModalInstanceVue3, ModalOptionsVue3 } from './contracts';
import ModalDialogVue3 from './components/ModalDialog.vue';

function isReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function openModalVue3(
  options: ModalOptionsVue3 | undefined,
  t: (source: string) => string,
): ModalInstanceVue3 {
  const opts = options || {};
  const root = typeof document !== 'undefined' ? document.getElementById('modal-root') : null;
  if (!root) {
    return {
      el: null,
      body: typeof document !== 'undefined' ? document.createElement('div') : ({} as HTMLElement),
      close() {},
    };
  }

  const previousFocus = document.activeElement as HTMLElement | null;
  const slot = document.createElement('div');
  slot.style.display = 'contents';
  slot.dataset.vue3 = 'modal-slot';
  root.appendChild(slot);

  let modalEl: HTMLElement | null = null;
  let bodyEl: HTMLElement = document.createElement('div');
  let setShowFn: ((v: boolean) => void) | null = null;
  let closed = false;
  let removeTimer: ReturnType<typeof setTimeout> | null = null;

  const instance: ModalInstanceVue3 = {
    get el() {
      return modalEl;
    },
    get body() {
      return bodyEl;
    },
    close() {
      if (closed) return;
      closed = true;
      setShowFn?.(false);
      if (previousFocus && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
      if (typeof opts.onClose === 'function') {
        opts.onClose();
      }
      const delay = isReducedMotion() ? 0 : 220;
      const cleanup = () => {
        if (removeTimer) {
          clearTimeout(removeTimer);
          removeTimer = null;
        }
        render(null, slot);
        slot.remove();
      };
      if (delay === 0) cleanup();
      else removeTimer = setTimeout(cleanup, delay);
    },
  };

  const vnode = h(ModalDialogVue3, {
    title: opts.title || '',
    size: opts.size || 'md',
    dismissible: opts.dismissible !== false,
    actions: opts.actions || [],
    t,
    onRequestClose: () => instance.close(),
    getInstance: () => instance,
    onReady: refs => {
      modalEl = refs.modal;
      bodyEl = refs.body;
      setShowFn = refs.setShow;
    },
  });

  // Synchronous mount: refs.modal and refs.body are populated immediately.
  render(vnode, slot);

  if (typeof opts.content === 'string') {
    bodyEl.innerHTML = opts.content;
  } else if (opts.content instanceof Node) {
    bodyEl.appendChild(opts.content);
  }

  return instance;
}

export function confirmModalVue3(
  options: ConfirmOptionsVue3 | undefined,
  t: (source: string) => string,
): Promise<boolean> {
  const opts = options || {};
  return new Promise(resolve => {
    let settled = false;
    const done = (val: boolean) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    const root = typeof document !== 'undefined' ? document.getElementById('modal-root') : null;
    if (!root) {
      done(false);
      return;
    }

    const previousFocus = document.activeElement as HTMLElement | null;
    const slot = document.createElement('div');
    slot.style.display = 'contents';
    slot.dataset.vue3 = 'modal-slot';
    root.appendChild(slot);

    let modalEl: HTMLElement | null = null;
    let bodyEl: HTMLElement = document.createElement('div');
    let setShowFn: ((v: boolean) => void) | null = null;
    let closed = false;
    let removeTimer: ReturnType<typeof setTimeout> | null = null;

    const close = (result: boolean) => {
      done(result);
      if (closed) return;
      closed = true;
      setShowFn?.(false);
      if (previousFocus && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
      const delay = isReducedMotion() ? 0 : 220;
      const cleanup = () => {
        if (removeTimer) {
          clearTimeout(removeTimer);
          removeTimer = null;
        }
        render(null, slot);
        slot.remove();
      };
      if (delay === 0) cleanup();
      else removeTimer = setTimeout(cleanup, delay);
    };

    const instance: ModalInstanceVue3 = {
      get el() {
        return modalEl;
      },
      get body() {
        return bodyEl;
      },
      close: () => close(false),
    };

    const vnode = h(ModalDialogVue3, {
      title: opts.title || t('请确认'),
      size: 'sm',
      dismissible: true,
      confirmMessage: opts.message || '',
      actions: [
        { label: opts.cancelText || t('取消'), type: 'ghost', onClick: () => { close(false); return false; } },
        { label: opts.confirmText || t('确认'), type: opts.danger ? 'danger' : 'primary', onClick: () => { close(true); return false; } },
      ],
      t,
      onRequestClose: () => close(false),
      getInstance: () => instance,
      onReady: refs => {
        modalEl = refs.modal;
        bodyEl = refs.body;
        setShowFn = refs.setShow;
      },
    });

    render(vnode, slot);
  });
}
