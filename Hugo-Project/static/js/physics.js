// Rapier physics (Phase 2) — offline-only (wasm is inlined in the vendored
// compat build). Terrain arrives as streamed 1 km² heightfield tiles sampled
// from the atlas surface; a kinematic capsule rides them through Rapier's
// character controller. Opt-in behind ?physics=1; the default walker (which
// the 17 motion checks certify) stays authoritative.
// @ts-check
import { SimClock } from "./sim-clock.js";

/** @type {any} */
let RAPIER = null;

/** Load + initialise the vendored Rapier build (once). */
export async function initPhysics() {
  if (!RAPIER) {
    RAPIER = await import("../vendor/rapier.mjs");
    await RAPIER.init();
  }
  return RAPIER;
}

export class AtlasPhysics {
  /**
   * @param {{heightAt: (x: number, z: number) => number,
   *          tileSize?: number, grid?: number, radius?: number,
   *          height?: number}} opts
   *   heightAt returns terrain Y in scene metres for scene X/Z.
   */
  static async create(opts) {
    const R = await initPhysics();
    const world = new R.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 120;
    return new AtlasPhysics(R, world, opts);
  }

  constructor(R, world, opts) {
    this.R = R;
    this.world = world;
    this.heightAt = opts.heightAt;
    this.tileSize = opts.tileSize ?? 1000;
    this.grid = opts.grid ?? 64; // samples per side (grid+1 × grid+1)
    this.tiles = new Map();
    this.dirty = false;
    this.clock = new SimClock(1 / 120);
    this.stepped = 0;
    this.rng = 0;

    const radius = opts.radius ?? 0.28;
    const height = opts.height ?? 1.65;
    // Public positions are FEET-level (matching motor.root); the capsule
    // centre sits half the capsule height above.
    this.offset = height / 2;
    this.charBody = world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 100, 0),
    );
    this.charCollider = world.createCollider(
      R.ColliderDesc.capsule(Math.max(0.05, height / 2 - radius), radius),
      this.charBody,
    );
    this.ctrl = world.createCharacterController(0.05);
    this.ctrl.enableAutostep(0.4, 0.1, false);
    this.ctrl.setMaxSlopeClimbAngle((40 * Math.PI) / 180);
    this.ctrl.setSlideEnabled(true);
    this.ctrl.setApplyImpulsesToDynamicBodies(false);
    this.last = { x: 0, y: 100, z: 0, grounded: false, collisions: 0 };
  }

  /** Tile coordinate containing a scene position. */
  tileOf(x, z) {
    const t = this.tileSize;
    return [Math.floor(x / t), Math.floor(z / t)];
  }

  /**
   * Stream heightfield tiles in a 3×3 neighbourhood around (cx, cz);
   * tiles outside the neighbourhood are removed. Returns [added, removed].
   */
  syncTiles(cx, cz) {
    const [tx, tz] = this.tileOf(cx, cz);
    let added = 0,
      removed = 0;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const key = `${tx + i}_${tz + j}`;
        if (!this.tiles.has(key)) {
          this.addTile(tx + i, tz + j);
          added++;
        }
      }
    for (const [key, tile] of this.tiles) {
      if (Math.abs(tile.tx - tx) > 1 || Math.abs(tile.tz - tz) > 1) {
        this.world.removeRigidBody(tile.body);
        this.tiles.delete(key);
        removed++;
      }
    }
    if (added || removed) this.dirty = true;
    return [added, removed];
  }

  /** Sample heightAt into a heightfield collider for one 1 km² tile. */
  addTile(tx, tz) {
    const { R } = this,
      t = this.tileSize,
      n = this.grid,
      step = t / n,
      ox = tx * t,
      oz = tz * t;
    // Column-major: column → scene X, row → scene Z.
    const heights = new Float32Array((n + 1) * (n + 1));
    for (let c = 0; c <= n; c++)
      for (let r = 0; r <= n; r++)
        heights[c * (n + 1) + r] = this.heightAt(ox + c * step, oz + r * step);
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation(ox + t / 2, 0, oz + t / 2),
    );
    this.world.createCollider(
      R.ColliderDesc.heightfield(n, n, heights, { x: t, y: 1, z: t }),
      body,
    );
    this.tiles.set(`${tx}_${tz}`, { tx, tz, body });
    this.dirty = true;
    return body;
  }

  /** Ensure the query pipeline sees freshly added tiles. */
  flush() {
    if (this.dirty) {
      this.world.step();
      this.stepped++;
      this.dirty = false;
    }
  }

  /** Downward raycast onto streamed terrain; returns scene Y or null. */
  groundY(x, z) {
    this.flush();
    const hit = this.world.castRay(
      new this.R.Ray({ x, y: 5000, z }, { x: 0, y: -1, z: 0 }),
      10000,
      true,
      undefined,
      undefined,
      this.charCollider, // never hit our own capsule
    );
    return hit ? 5000 - hit.timeOfImpact : null;
  }

  /**
   * Advance the character capsule by `delta` from feet-level scene-space
   * `pos` (y = ground contact, like motor.root). The capsule is teleported
   * first (kinematic follow), so the caller stays authoritative; Rapier
   * reports grounding + collisions.
   */
  moveCharacter(pos, delta) {
    this.charBody.setTranslation(
      { x: pos.x, y: pos.y + this.offset, z: pos.z },
      false,
    );
    // A 1.5 cm downward probe per call keeps the controller in contact with
    // the ground (grounded is only reported when it detects a surface).
    this.ctrl.computeColliderMovement(this.charCollider, {
      x: delta.x ?? 0,
      y: (delta.y ?? 0) - 0.015,
      z: delta.z ?? 0,
    });
    const m = this.ctrl.computedMovement();
    const out = {
      x: pos.x + m.x,
      y: pos.y + m.y,
      z: pos.z + m.z,
      grounded: this.ctrl.computedGrounded(),
      collisions: this.ctrl.numComputedCollisions(),
    };
    this.charBody.setTranslation(
      { x: out.x, y: out.y + this.offset, z: out.z },
      false,
    );
    this.last = out;
    return out;
  }

  /** Fixed-step world advance (1/120 slices, capped catch-up). */
  step(dt) {
    let n = 0;
    this.clock.advance(dt, (sdt) => {
      this.world.timestep = sdt;
      this.world.step();
      this.stepped++;
      n++;
    });
    this.dirty = false;
    return n;
  }

  stats() {
    return {
      tiles: this.tiles.size,
      stepped: this.stepped,
      colliders: this.world.colliders.len(),
      bodies: this.world.bodies.len(),
      grounded: this.last.grounded,
      collisions: this.last.collisions,
      alpha: +this.clock.alpha.toFixed(3),
    };
  }
}
