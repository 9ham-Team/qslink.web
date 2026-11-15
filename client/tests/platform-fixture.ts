import { createPinia } from 'pinia';
import type { ApplicationContext } from '../src/contracts';
import { createRuntimeStoreVue3, type RuntimeStoreVue3 } from '../src/state';
import { createDialogService } from '../src/dialog-service';
import { showToastVue3 } from '../src/toast-store';

// Only fake API implementations need this callback wiring. The real API
// receives tokenChanged directly when createApplication constructs it.
export function useMockStore(platform: ApplicationContext, store: RuntimeStoreVue3) {
  const previous = platform.store;
  if (previous.config) store.setConfig(previous.config);
  if (previous.user) store.setUser(previous.user);
  platform.store = store;
  platform.setUser = value => { store.setUser(value, true); };
  const setToken = platform.api.setToken?.bind(platform.api);
  let current = platform.api.token?.() || null;
  if (setToken) platform.api.setToken = value => {
    const before = current; current = value || null; setToken(current);
    store.noteTokenChange(before, current);
  };
}
export function initializeMockApplication(platform: ApplicationContext) {
  const pinia = createPinia();
  const store = createRuntimeStoreVue3(pinia, user => platform.emit?.('auth',user));
  useMockStore(platform,store);
  platform.pinia = pinia;
  platform.dialogs = createDialogService(platform.t);
  platform.confirm = platform.dialogs.confirm;
  platform.toast = showToastVue3;
  platform.dispose = () => platform.dialogs.closeAll();
}
