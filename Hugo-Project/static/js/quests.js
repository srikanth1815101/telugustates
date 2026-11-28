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

/** The opening quest chain — fired by real slice events (sow/water/…). */
export const INTRO_QUESTS = /** @type {QuestDef[]} */ ([
  {
    id: "first-sowing",
    title: "First sowing",
    steps: [{ id: "sow1", type: "sow" }],
    reward: { rupees: 20 },
  },
  {
    id: "water-wise",
    title: "Water wise",
    steps: [{ id: "w1", type: "water", need: 3 }],
    reward: { rupees: 15 },
  },
  {
    id: "first-harvest",
    title: "First harvest",
    steps: [{ id: "h1", type: "harvest" }],
    reward: { rupees: 50 },
  },
  {
    id: "market-day",
    title: "Market day",
    steps: [{ id: "t1", type: "trade" }],
    reward: { rupees: 25 },
  },
  {
    id: "angler",
    title: "Angler",
    steps: [{ id: "c1", type: "catch" }],
    reward: { rupees: 30 },
  },
  {
    id: "hand-reared",
    title: "Hand reared",
    steps: [{ id: "p1", type: "produce" }],
    reward: { rupees: 20 },
  },
]);

/**
 * @param {QuestDef[]} defs
 * @param {{onState?: (questId: string, state: string) => void,
 *          autoStart?: boolean}} [opts]
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

  // Opening chains are active from boot; feed() only advances active quests.
  if (opts.autoStart)
    for (const d of defs) state.set(d.id, { state: "active", step: 0, progress: 0 });

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
