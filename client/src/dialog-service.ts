import { h, render, type Component } from 'vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import type { ConfirmOptionsVue3 } from './contracts';

export function createDialogService(t: (source: string) => string) {
  const active = new Set<() => void>();
  function open(component: Component, props: Record<string, unknown>, onClosed?: () => void) {
    const root = document.createElement('div');
    root.style.display = 'contents';
    (document.getElementById('modal-root') || document.body).append(root);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true; active.delete(close);
      render(null, root); root.remove(); onClosed?.();
    };
    active.add(close);
    render(h(component, { ...props, onClose: close }), root);
    return { close };
  }
  function confirm(options: ConfirmOptionsVue3 = {}) {
    return new Promise<boolean>(resolve => {
      let settled = false;
      const done = (value: boolean) => { if (!settled) { settled = true; resolve(value); } };
      open(ConfirmDialog, { options, t, onAnswer: done }, () => done(false));
    });
  }
  return { open, confirm, closeAll() { [...active].reverse().forEach(close => close()); } };
}
