// Quest FSM (Phase 4): declarative ordered-step quests driven by the
// interaction bus. Pure and deterministic — serialise/restore for saves;
// no timers inside (the world feeds it events, never wall-clock).
// @ts-check

/**
 * @typedef {{
 *   id: string,
 *   title?: string,
 *   steps: Array<{ id: string, type: string, match?: (payload: any) => boolean, need?: number }>,
 *   reward?: { rupees?: number, items?: Array<[string, number]> },
 * }} QuestDef
 */

/**
 * @param {QuestDef[]} defs
 * @param {{onState?: (questId: string, state: string) => void}} [opts]
 */
export function createQuests(defs, opts = {}) {
  /** @type {Map<string, QuestDef>} */
  const byId = new Map(defs.map((d) => [d.id, d]));
  /** @type {Map<string, {state: string, step: number, progress: number}>} */
  const state = new Map();

  const setState = (id, s) => {
    const rec = state.get(id);
    if (rec) rec.state = s;
    opts.onState?.(id, s);
  };

  return {
    /** Begin a quest at step 0. */
    start(id) {
      if (!byId.has(id) || state.has(id)) return false;
      state.set(id, { state: "active", step: 0, progress: 0 });
      opts.onState?.(id, "active");
      return true;
    },
    /**
     * Feed a bus event. Advances every active quest whose current step
     * matches; a step with `need > 1` counts matching events.
     * Returns the list of quests whose state changed.
     */
    feed(type, payload) {
      const changed = [];
      for (const [id, rec] of state) {
        if (rec.state !== "active") continue;
        const def = byId.get(id);
        const step = def?.steps[rec.step];
        if (!step || step.type !== type) continue;
        if (step.match && !step.match(payload)) continue;
        rec.progress++;
        const need = step.need ?? 1;
        if (rec.progress < need) continue;
        rec.step++;
        rec.progress = 0;
        if (rec.step >= def.steps.length) {
          rec.state = "complete";
          changed.push(id);
          opts.onState?.(id, "complete");
        }
      }
      return changed;
    },
    /** Abandon / fail an active quest. */
    fail(id) {
      const rec = state.get(id);
      if (!rec || rec.state !== "active") return false;
      setState(id, "failed");
      return true;
    },
    status(id) {
      return state.get(id)?.state ?? "unknown";
    },
    /** Snapshot for saves: {questId: {state, step, progress}}. */
    serialise() {
      const out = {};
      for (const [id, rec] of state) out[id] = { ...rec };
      return out;
    },
    restore(data) {
      state.clear();
      if (data && typeof data === "object")
        for (const [id, rec] of Object.entries(data)) {
          if (!byId.has(id)) continue;
          const r = /** @type {any} */ (rec);
          if (
            ["active", "complete", "failed"].includes(r?.state) &&
            Number.isInteger(r.step)
          )
            state.set(id, {
              state: r.state,
              step: Math.min(r.step, byId.get(id).steps.length),
              progress: Number.isFinite(r.progress) ? r.progress : 0,
            });
        }
      return this;
    },
    /** All quest states (for HUD). */
    all() {
      return Object.fromEntries(
        [...state].map(([id, r]) => [id, { ...r }]),
      );
    },
  };
}
