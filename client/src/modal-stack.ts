export interface ModalStackEntryVue3 {
  id: symbol;
  zIndex: number;
  dismissible: boolean;
  close: () => void;
}

const stack: ModalStackEntryVue3[] = [];
let nextZIndex = 120;

export function syncBodyModalOpenVue3() {
  if (typeof document === 'undefined' || !document.body) return;
  const hasActive = stack.length > 0 || !!document.querySelector('.modal-overlay.is-show');
  document.body.classList.toggle('modal-open', hasActive);
}

export function registerModalStackVue3(options: { dismissible?: boolean; close: () => void }): ModalStackEntryVue3 {
  const entry: ModalStackEntryVue3 = {
    id: Symbol('modal'),
    zIndex: nextZIndex++,
    dismissible: options.dismissible !== false,
    close: options.close,
  };
  stack.push(entry);
  syncBodyModalOpenVue3();
  return entry;
}

export function unregisterModalStackVue3(id: symbol) {
  const idx = stack.findIndex(item => item.id === id);
  if (idx >= 0) stack.splice(idx, 1);
  if (stack.length === 0) nextZIndex = 120;
  syncBodyModalOpenVue3();
}

export function isTopModalVue3(id: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1].id === id;
}

export function getModalStackLengthVue3(): number {
  return stack.length;
}

export function clearModalStackVue3() {
  stack.length = 0;
  nextZIndex = 120;
  syncBodyModalOpenVue3();
}
