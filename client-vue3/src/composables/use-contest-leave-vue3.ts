import { onBeforeUnmount, onMounted } from 'vue';
export function useContestLeaveVue3(dirty: () => boolean, message: () => string) {
  function click(event: MouseEvent) {
    const link = (event.target as Element)?.closest<HTMLAnchorElement>('a[href]');
    if (!link || !dirty() || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || link.target === '_blank' || link.getAttribute('href')?.startsWith('#')) return;
    if (!window.confirm(message())) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
  function unload(event: BeforeUnloadEvent) { if (dirty()) { event.preventDefault(); event.returnValue = ''; } }
  onMounted(() => { document.addEventListener('click', click, true); window.addEventListener('beforeunload', unload); });
  onBeforeUnmount(() => { document.removeEventListener('click', click, true); window.removeEventListener('beforeunload', unload); });
}
