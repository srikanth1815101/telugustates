// Livestock (Phase 5): yuka steering agents inside a pen — wander, flee
// from a threat point, and produce goods on a sim clock. Positions and
// production timers serialise into the life save.
// @ts-check
import { createAgent } from "./ai.js";

const KINDS = {
  cow: { produce: "milk", seconds: 45, speed: 1.1 },
  goat: { produce: "milk", seconds: 60, speed: 1.5 },
  chicken: { produce: "egg", seconds: 35, speed: 1.8 },
};

/**
 * @param {{pen: {minX:number,maxX:number,minZ:number,maxZ:number},
 *          count?: number, kinds?: string[], produceScale?: number,
 *          onEvent?: (type: string, payload: any) => void}} opts
 */
export function createLivestock(opts) {
  const pen = opts.pen;
  const emit = opts.onEvent ?? (() => {});
  const scale = opts.produceScale ?? 1;
  const kinds = opts.kinds ?? ["cow", "chicken", "goat"];
  const count = opts.count ?? 6;

  const animals = [];
  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length];
    const def = KINDS[kind];
    const x = pen.minX + 0.2 + ((i * 37) % 100) / 100 * (pen.maxX - pen.minX - 0.4);
    const z = pen.minZ + 0.2 + ((i * 61) % 100) / 100 * (pen.maxZ - pen.minZ - 0.4);
    const agent = createAgent({ x, z, speed: def.speed, wander: true });
    animals.push({
      kind,
      agent,
      timer: def.seconds * scale * (0.4 + ((i * 17) % 10) / 10),
      fleeOff: null,
    });
  }

  const clampPen = (a) => {
    const p = a.agent.vehicle.position;
    const pad = 0.3;
    const bx = Math.max(pen.minX + pad, Math.min(pen.maxX - pad, p.x));
    const bz = Math.max(pen.minZ + pad, Math.min(pen.maxZ - pad, p.z));
    if (bx !== p.x || bz !== p.z) {
      const v = a.agent.vehicle.velocity;
      if (bx !== p.x) {
        v.x = 0;
        p.x = bx;
      }
      if (bz !== p.z) {
        v.z = 0;
        p.z = bz;
      }
    }
  };

  return {
    animals,
    /** Threat (player) position: nearby animals scatter for a moment. */
    threaten(x, z, radius = 3.5) {
      let n = 0;
      for (const a of animals) {
        const p = a.agent.vehicle.position;
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < radius && !a.fleeOff) {
          a.fleeOff = a.agent.flee(x, 0, z);
          a.fleeUntil = 2.5;
          n++;
        }
      }
      return n;
    },
    /** Advance steering + production. Returns produced goods. */
    tick(dt) {
      const made = [];
      for (const a of animals) {
        if (a.fleeOff) {
          a.fleeUntil -= dt;
          if (a.fleeUntil <= 0) {
            a.fleeOff();
            a.fleeOff = null;
          }
        }
        a.agent.update(dt);
        clampPen(a);
        const def = KINDS[a.kind];
        a.timer -= dt;
        if (a.timer <= 0) {
          a.timer = def.seconds * scale;
          const good = { kind: def.produce, qty: a.kind === "chicken" ? 1 : 2, animal: a.kind };
          made.push(good);
          emit("produce", good);
        }
      }
      return made;
    },
    serialise() {
      return animals.map((a) => ({ ...a.agent.serialise(), kind: a.kind, timer: a.timer }));
    },
    restore(data) {
      if (Array.isArray(data))
        data.forEach((s, i) => {
          const a = animals[i];
          if (!a || !s) return;
          a.agent.vehicle.position.set(s.x, s.y ?? 0, s.z);
          if (Number.isFinite(s.timer)) a.timer = s.timer;
        });
      return this;
    },
  };
}
