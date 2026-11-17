export function createEvents() {
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  return {
    on(name: string, callback: (...args: any[]) => void) {
      let set = listeners.get(name);
      if (!set) listeners.set(name, set = new Set());
      set.add(callback);
      let active=true;
      return () => {
        if(!active)return;active=false;set!.delete(callback);
        if(!set!.size && listeners.get(name)===set)listeners.delete(name);
      };
    },
    emit(name: string, ...args: unknown[]) {
      const set=listeners.get(name);
      for (const callback of [...(set || [])]) {
        if(!set?.has(callback))continue;
        try {callback(...args);} catch(error) {console.error('[Events] listener failed:',name,error);}
      }
    },
    clear() { listeners.clear(); },
  };
}
