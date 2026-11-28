// Interaction bus (Phase 4): one tiny pub/sub the whole life-sim speaks
// through — world code emits ("talk", "pickup", "enter", "sow", …), systems
// (quests, audio, HUD) subscribe. Handlers run synchronously in
// registration order; an exception in one handler never stops the rest.
// @ts-check

/**
 * @returns {{
 *   on: (type: string, fn: (payload: any) => void) => () => void,
 *   once: (type: string, fn: (payload: any) => void) => () => void,
 *   off: (type: string, fn: (payload: any) => void) => void,
 *   emit: (type: string, payload?: any) => number,
 *   clear: (type?: string) => void,
 *   size: (type?: string) => number,
 * }}
 */
export function createBus() {
  /** @type {Map<string, Set<(payload: any) => void>>} */
  const map = new Map();

  const on = (type, fn) => {
    let set = map.get(type);
    if (!set) map.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  };

  return {
    on,
    once(type, fn) {
      const off = on(type, (payload) => {
        off();
        fn(payload);
      });
      return off;
    },
    off(type, fn) {
      map.get(type)?.delete(fn);
    },
    emit(type, payload) {
      const set = map.get(type);
      if (!set?.size) return 0;
      let n = 0;
      for (const fn of [...set]) {
        try {
          fn(payload);
          n++;
        } catch (e) {
          console.error(`bus handler for "${type}" threw`, e);
        }
      }
      return n;
    },
    clear(type) {
      if (type === undefined) map.clear();
      else map.delete(type);
    },
    size(type) {
      if (type !== undefined) return map.get(type)?.size ?? 0;
      let n = 0;
      for (const s of map.values()) n += s.size;
      return n;
    },
  };
}
