// Building (Phase 5): validated snap placement on terrain using the
// world's ground/grade functions (or a BVH ray in the browser). Checks
// slope, footprint overlap and rupee cost before committing a placement;
// placements serialise into the life save.
// @ts-check

export const STRUCTURES = {
  fence: { cost: 2, radius: 0.8, label: "fence" },
  cot: { cost: 6, radius: 1.4, label: "cot" },
  shed: { cost: 12, radius: 2.2, label: "shed" },
  well: { cost: 9, radius: 1.1, label: "well" },
  threshing: { cost: 5, radius: 1.8, label: "threshing floor" },
};

const MAX_SLOPE = Math.tan((40 * Math.PI) / 180); // matches the walker's limit

/**
 * @param {{groundY: (x: number, z: number) => number,
 *          gradeAt?: (x: number, z: number) => [number, number],
 *          spend: (n: number) => boolean,
 *          maxPlaced?: number}} opts
 */
export function createBuilding(opts) {
  const maxPlaced = opts.maxPlaced ?? 48;
  /** @type {Array<{type:string,x:number,y:number,z:number,yaw:number}>} */
  const placed = [];
  const emit = () => {};

  return {
    structures: STRUCTURES,
    placed: () => placed.slice(),
    /**
     * Validate + commit a placement. y is snapped to groundY; slope and
     * overlap are checked BEFORE spending so a rejection costs nothing.
     */
    place(type, x, z, yaw = 0) {
      const def = STRUCTURES[type];
      if (!def) return { ok: false, why: "unknown-type" };
      if (placed.length >= maxPlaced) return { ok: false, why: "cap" };
      if (!Number.isFinite(x) || !Number.isFinite(z))
        return { ok: false, why: "bad-coords" };

      // Slope check (world grade, degrees-ish via vector magnitude).
      if (opts.gradeAt) {
        const [gx, gz] = opts.gradeAt(x, z);
        if (Math.hypot(gx, gz) > MAX_SLOPE)
          return { ok: false, why: "too-steep" };
      }

      // Footprint overlap against existing placements.
      for (const p of placed) {
        const other = STRUCTURES[p.type];
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < def.radius + other.radius - 0.35)
          return { ok: false, why: "overlap", near: p.type };
      }

      // Cost — spend only after every other check passes.
      if (!opts.spend(def.cost)) return { ok: false, why: "cannot-afford" };

      const y = opts.groundY(x, z);
      if (!Number.isFinite(y)) return { ok: false, why: "no-ground" };
      placed.push({ type, x, y, z, yaw });
      return { ok: true, cost: def.cost, at: { x, y, z } };
    },
    /** Remove a placement (refund half). */
    remove(index) {
      const p = placed[index];
      if (!p) return { ok: false };
      placed.splice(index, 1);
      return { ok: true, refund: Math.floor(STRUCTURES[p.type].cost / 2) };
    },
    serialise: () => ({ placed: placed.slice() }),
    restore(data) {
      placed.length = 0;
      if (data && Array.isArray(data.placed))
        for (const p of data.placed)
          if (p && STRUCTURES[p.type] && Number.isFinite(p.x))
            placed.push({ ...p });
      return this;
    },
  };
}
