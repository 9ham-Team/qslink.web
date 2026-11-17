import { reactive } from 'vue';

export interface ToastItemVue3 {
  id: number;
  message: string;
  kind: string;
  show: boolean;
  hide: boolean;
}

interface ToastInternalVue3 {
  closed: boolean;
  showRaf: number;
  autoTimer: ReturnType<typeof setTimeout> | null;
  removeTimer: ReturnType<typeof setTimeout> | null;
}

const items = reactive<ToastItemVue3[]>([]);
const internals = new Map<number, ToastInternalVue3>();
let nextToastId = 1;

function isReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function useToastItemsVue3(): ToastItemVue3[] {
  return items;
}

export function closeToastVue3(id: number) {
  const meta = internals.get(id);
  if (!meta || meta.closed) return;
  meta.closed = true;
  if (meta.showRaf && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(meta.showRaf);
    meta.showRaf = 0;
  }
  if (meta.autoTimer) {
    clearTimeout(meta.autoTimer);
    meta.autoTimer = null;
  }
  const item = items.find(entry => entry.id === id);
  if (item) {
    item.show = false;
    item.hide = true;
  }
  const delay = isReducedMotion() ? 0 : 280;
  if (delay === 0) {
    removeToastImmediate(id);
  } else {
    meta.removeTimer = setTimeout(() => removeToastImmediate(id), delay);
  }
}

function removeToastImmediate(id: number) {
  const meta = internals.get(id);
  if (meta?.removeTimer) {
    clearTimeout(meta.removeTimer);
    meta.removeTimer = null;
  }
  internals.delete(id);
  const idx = items.findIndex(entry => entry.id === id);
  if (idx >= 0) items.splice(idx, 1);
}

export function showToastVue3(message: unknown, type?: string, duration?: number): () => void {
  if (typeof document !== 'undefined' && !document.getElementById('toast-root')) {
    return () => {};
  }
  const id = nextToastId++;
  const kind = type || 'success';
  const reduced = isReducedMotion();
  const item: ToastItemVue3 = reactive({
    id,
    message: message == null ? '' : String(message),
    kind,
    show: reduced,
    hide: false,
  });
  const meta: ToastInternalVue3 = {
    closed: false,
    showRaf: 0,
    autoTimer: null,
    removeTimer: null,
  };
  internals.set(id, meta);
  items.push(item);

  if (!reduced && typeof requestAnimationFrame === 'function') {
    meta.showRaf = requestAnimationFrame(() => {
      meta.showRaf = 0;
      if (!meta.closed) item.show = true;
    });
  } else {
    item.show = true;
  }

  const ms = typeof duration === 'number' && duration > 0 ? duration : (kind === 'error' ? 4800 : 3200);
  meta.autoTimer = setTimeout(() => closeToastVue3(id), ms);

  return () => closeToastVue3(id);
}

export function clearAllToastsVue3() {
  for (const [id, meta] of internals.entries()) {
    meta.closed = true;
    if (meta.showRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(meta.showRaf);
    }
    if (meta.autoTimer) clearTimeout(meta.autoTimer);
    if (meta.removeTimer) clearTimeout(meta.removeTimer);
    internals.delete(id);
  }
  items.splice(0, items.length);
}
