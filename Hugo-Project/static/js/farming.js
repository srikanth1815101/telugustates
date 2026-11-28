// Farming (Phase 5, deepest slice): plots as ECS entities (bitecs), growth
// on a sim-seconds clock (water-gated), deterministic yields, persisted
// through the atlasLife save slot. Terrain validity (water, slope, bounds)
// is the caller's job — this module owns plot state only.
// @ts-check
import { createEcs } from "./ecs.js";

/** One watering refills this many sim-seconds of growth reserve. */
const WATER_SECONDS = 90;

/**
 * Crop definitions: stage count, growth seconds per stage, yield range.
 * Tuned for playability — a full crop completes in ~3 minutes of real
 * time with periodic watering (was ~6–10 and felt inert).
 */
export const CROPS = {
  ragi: { stages: 4, stageSeconds: 45, yield: [3, 6], label: "ragi" },
  paddy: { stages: 5, stageSeconds: 55, yield: [4, 8], label: "paddy" },
  chilli: { stages: 4, stageSeconds: 40, yield: [2, 5], label: "chilli" },
  cotton: { stages: 5, stageSeconds: 60, yield: [3, 7], label: "cotton" },
  vegetable: { stages: 3, stageSeconds: 30, yield: [4, 9], label: "vegetables" },
};

/** Deterministic yield in [lo, hi] from plot identity + harvest count. */
function yieldFor(kind, plotId, salt) {
  const def = CROPS[kind];
  let h = (plotId * 2654435761 + salt * 40503) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  const t = (h >>> 8) / 0xffffff;
  return def.yield[0] + Math.floor(t * (def.yield[1] - def.yield[0] + 1));
}

/**
 * @param {{stageSecondsScale?: number, maxPlots?: number,
 *          onEvent?: (type: string, payload: any) => void}} [opts]
 */
export function createFarming(opts = {}) {
  const scale = opts.stageSecondsScale ?? 1;
  const maxPlots = opts.maxPlots ?? 64;
  const ecs = createEcs();
  const { Transform, Crop } = ecs.components;
  /** plotId → entity id (ECS ids are not stable across saves). */
  const plots = new Map();
  let nextId = 1;
  let harvests = 0;
  const emit = opts.onEvent ?? (() => {});

  const stageOf = (eid) => {
    const def = CROPS[Crop.type[eid]];
    if (!def) return 0;
    const per = def.stageSeconds * scale;
    return Math.min(def.stages, Math.floor(Crop.sown[eid] / per));
  };

  return {
    ecs,
    CROPS,
    /** Sow a plot. Caller validates terrain; we validate kind/space. */
    sow(x, z, kind) {
      if (!CROPS[kind]) return { ok: false, why: "unknown-crop" };
      if (plots.size >= maxPlots) return { ok: false, why: "plot-cap" };
      for (const [, eid] of plots)
        if (
          Math.hypot(Transform.x[eid] - x, Transform.z[eid] - z) < 1.2
        )
          return { ok: false, why: "plot-overlap" };
      const eid = ecs.spawn(Transform, Crop);
      Transform.x[eid] = x;
      Transform.z[eid] = z;
      Crop.type[eid] = kind;
      Crop.sown[eid] = 0;
      Crop.stage[eid] = 0;
      Crop.water[eid] = WATER_SECONDS; // freshly watered
      const id = nextId++;
      plots.set(id, eid);
      emit("sow", { id, kind, x, z });
      return { ok: true, id, kind };
    },
    /** Water a plot; growth only advances while watered recently. */
    water(id) {
      const eid = plots.get(id);
      if (eid == null) return { ok: false, why: "no-plot" };
      if (Crop.water[eid] > 0.5) return { ok: false, why: "already-wet" };
      Crop.water[eid] = WATER_SECONDS;
      emit("water", { id });
      return { ok: true };
    },
    /** Advance growth. Returns the number of stage-ups this call. */
    tick(dt) {
      ecs.tick(dt);
      let ups = 0;
      for (const [id, eid] of plots) {
        const def = CROPS[Crop.type[eid]];
        if (!def) continue;
        const before = Crop.stage[eid];
        if (Crop.water[eid] > 0) {
          Crop.sown[eid] += dt;
          // Water reserve drains steadily; growth pauses at empty.
          Crop.water[eid] = Math.max(0, Crop.water[eid] - dt);
        }
        const stage = stageOf(eid);
        if (stage !== before) {
          Crop.stage[eid] = stage;
          ups++;
          emit("stage", { id, kind: Crop.type[eid], stage });
        }
      }
      return ups;
    },
    /** Harvest a fully grown plot → {kind, qty} added by the caller. */
    harvest(id) {
      const eid = plots.get(id);
      if (eid == null) return { ok: false, why: "no-plot" };
      const kind = Crop.type[eid];
      const def = CROPS[kind];
      if (Crop.stage[eid] < def.stages)
        return { ok: false, why: "not-ready", stage: Crop.stage[eid] };
      const qty = yieldFor(kind, id, ++harvests);
      ecs.kill(eid);
      plots.delete(id);
      emit("harvest", { id, kind, qty });
      return { ok: true, kind, qty };
    },
    /** Context for the HUD at a walker position: nearest plot ≤ reach. */
    actionAt(x, z, reach = 1.6) {
      let best = null,
        bestD = reach;
      for (const [id, eid] of plots) {
        const d = Math.hypot(Transform.x[eid] - x, Transform.z[eid] - z);
        if (d < bestD) {
          bestD = d;
          best = { id, eid };
        }
      }
      if (!best) return { mode: "sow" };
      const eid = best.eid,
        kind = Crop.type[eid],
        def = CROPS[kind];
      if (Crop.stage[eid] >= def.stages) return { mode: "harvest", id: best.id };
      if (Crop.water[eid] <= 0.5) return { mode: "water", id: best.id };
      return { mode: "tend", id: best.id, kind, stage: Crop.stage[eid], stages: def.stages };
    },
    /** Every plot for minimap/HUD rendering. */
    all() {
      const out = [];
      for (const [id, eid] of plots)
        out.push({
          id,
          x: Transform.x[eid],
          z: Transform.z[eid],
          kind: Crop.type[eid],
          stage: Crop.stage[eid],
          stages: CROPS[Crop.type[eid]]?.stages ?? 0,
          wet: Crop.water[eid] > 0.5,
        });
      return out;
    },
    serialise() {
      return { nextId, harvests, plots: this.all() };
    },
    restore(data) {
      if (!data || typeof data !== "object") return this;
      for (const [, eid] of [...plots]) ecs.kill(eid);
      plots.clear();
      nextId = Number.isFinite(data.nextId) ? data.nextId : 1;
      harvests = Number.isFinite(data.harvests) ? data.harvests : 0;
      if (Array.isArray(data.plots))
        for (const p of data.plots) {
          if (!p || !CROPS[p.kind]) continue;
          const eid = ecs.spawn(Transform, Crop);
          Transform.x[eid] = p.x;
          Transform.z[eid] = p.z;
          Crop.type[eid] = p.kind;
          Crop.sown[eid] = p.sown ?? 0;
          Crop.stage[eid] = p.stage ?? 0;
          Crop.water[eid] = p.wet ? 1 : 0;
          plots.set(p.id, eid);
          if (p.id >= nextId) nextId = p.id + 1;
        }
      return this;
    },
  };
}
