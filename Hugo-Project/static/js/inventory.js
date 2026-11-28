// Inventory (Phase 4): a bounded, serialisable item bag. Pure data — the
// HUD and interaction code read it, subsystems (fishing, farming, trading)
// add to it. Stacks are capped; the kind list is capped so a save can
// never grow unbounded.
// @ts-check

const MAX_KINDS = 48;
const MAX_STACK = 999;

/**
 * @param {{maxKinds?: number, maxStack?: number}} [opts]
 */
export function createInventory(opts = {}) {
  const maxKinds = opts.maxKinds ?? MAX_KINDS;
  const maxStack = opts.maxStack ?? MAX_STACK;
  /** @type {Map<string, number>} */
  const items = new Map();

  return {
    /** Add qty; returns actually added (clamped by stack + kind caps). */
    add(kind, qty = 1) {
      if (!kind || qty <= 0) return 0;
      const have = items.get(kind) ?? 0;
      if (have === 0 && items.size >= maxKinds) return 0;
      const room = maxStack - have;
      const put = Math.min(room, qty);
      if (put > 0) items.set(kind, have + put);
      return put;
    },
    /** Remove qty; returns actually removed. */
    remove(kind, qty = 1) {
      const have = items.get(kind) ?? 0;
      const take = Math.min(have, Math.max(0, qty));
      if (take > 0) {
        const left = have - take;
        if (left === 0) items.delete(kind);
        else items.set(kind, left);
      }
      return take;
    },
    has(kind, qty = 1) {
      return (items.get(kind) ?? 0) >= qty;
    },
    count(kind) {
      return items.get(kind) ?? 0;
    },
    /** [[kind, qty], …] sorted by kind for stable serialisation. */
    list() {
      return [...items].sort((a, b) => a[0].localeCompare(b[0]));
    },
    total() {
      let n = 0;
      for (const q of items.values()) n += q;
      return n;
    },
    clear() {
      items.clear();
    },
    serialise() {
      return this.list();
    },
    /** Restore from serialise() output; ignores malformed entries. */
    restore(data) {
      items.clear();
      if (Array.isArray(data))
        for (const ent of data) {
          if (!Array.isArray(ent)) continue;
          const [kind, qty] = ent;
          if (typeof kind === "string" && Number.isFinite(qty))
            this.add(kind, Math.floor(qty));
        }
      return this;
    },
  };
}
