import { inject, reactive, type InjectionKey } from 'vue';
export type AdminMemory = Record<string,{filters:Record<string,string>;page:number}>;
export const ADMIN_MEMORY: InjectionKey<AdminMemory> = Symbol('admin-memory');
export function useAdminFilters(key:string, defaults:Record<string,string>) {
  const memory = inject(ADMIN_MEMORY, null);
  if (!memory) return reactive({filters:{...defaults},page:1});
  return memory[key] ||= reactive({filters:{...defaults},page:1});
}
