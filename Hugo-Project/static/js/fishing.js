// Fishing (Phase 5): cast → wait → bite → timed reel. All timing and the
// catch table are seeded/deterministic, so tests and saves are stable; the
// water check (depth) comes from the world.
// @ts-check

const CATCH_TABLE = [
  { kind: "carp", weight: 0.3 },
  { kind: "rohu", weight: 0.26 },
  { kind: "catla", weight: 0.2 },
  { kind: "eel", weight: 0.1 },
  { kind: "prawn", weight: 0.14 },
];

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {{seed?: number, minWait?: number, maxWait?: number,
 *          biteWindow?: number,
 *          onEvent?: (type: string, payload: any) => void}} [opts]
 */
export function createFishing(opts = {}) {
  const seed = opts.seed ?? 7717;
  const minWait = opts.minWait ?? 3;
  const maxWait = opts.maxWait ?? 9;
  const biteWindow = opts.biteWindow ?? 1.6;
  const emit = opts.onEvent ?? (() => {});
  const rng = seeded(seed);

  let phase = "idle"; // idle | waiting | bite | landed | missed
  let timer = 0;
  let wait = 0;
  let casts = 0;
  let lastCatch = null;

  const pick = () => {
    let r = rng();
    for (const e of CATCH_TABLE) {
      r -= e.weight;
      if (r <= 0) return e.kind;
    }
    return CATCH_TABLE[0].kind;
  };

  return {
    get phase() {
      return phase;
    },
    /** Start a cast. `depth` in metres — the world's water test. */
    cast(depth) {
      if (phase === "waiting" || phase === "bite")
        return { ok: false, why: "already-casting" };
      if (!(depth >= 0.5)) return { ok: false, why: "shallow" };
      phase = "waiting";
      wait = minWait + rng() * (maxWait - minWait);
      timer = 0;
      casts++;
      emit("cast", { casts });
      return { ok: true };
    },
    /** Advance the cast; returns 'bite' events this tick. */
    tick(dt) {
      if (phase === "waiting") {
        timer += dt;
        if (timer >= wait) {
          phase = "bite";
          timer = 0;
          emit("bite", {});
          return "bite";
        }
      } else if (phase === "bite") {
        timer += dt;
        if (timer >= biteWindow) {
          phase = "missed";
          emit("escape", {});
          return "escape";
        }
      }
      return null;
    },
    /** Player reels during a bite window. */
    reel() {
      if (phase !== "bite") {
        if (phase === "waiting") {
          phase = "missed";
          emit("escape", { early: true });
          return { ok: false, why: "too-early" };
        }
        return { ok: false, why: "no-bite" };
      }
      const kind = pick();
      const kg = Math.round((0.4 + rng() * 3.6) * 10) / 10;
      phase = "landed";
      lastCatch = { kind, kg, casts };
      emit("catch", lastCatch);
      return { ok: true, ...lastCatch };
    },
    lastCatch: () => lastCatch,
    stats: () => ({ casts, phase }),
    serialise: () => ({ seed, casts, lastCatch }),
    restore(data) {
      if (data && typeof data === "object") {
        casts = Number.isFinite(data.casts) ? data.casts : 0;
        lastCatch = data.lastCatch ?? null;
      }
      return this;
    },
  };
}
