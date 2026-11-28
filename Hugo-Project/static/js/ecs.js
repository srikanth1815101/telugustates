// Dynamic-entity ECS (Phase 1) built on vendored bitecs 0.4. Terrain, water
// and static scenery stay outside the ECS; entities here are things that
// spawn, move and die: crops, placed props, livestock, vehicles, bobbers.
//
// Components are plain SoA/AoS shapes registered on one world. Systems are
// plain functions over queries — no framework, no reflection.
// @ts-check
import {
  createWorld,
  addEntity,
  removeEntity,
  addComponent,
  query,
} from "../vendor/bitecs.min.mjs";

const CAP = 4096;

/**
 * Create the atlas entity world with the shared component set.
 * (JSDoc types mirror types/atlas.d.ts; tsc checks this file via @ts-check.)
 */
export function createEcs() {
  const f32 = () => new Float32Array(CAP);
  const u8 = () => new Uint8Array(CAP);
  const world = createWorld({
    components: {
      /** Metres in the local patch frame. */
      Transform: { x: f32(), z: f32(), yaw: f32() },
      /** Metres per second. */
      Motion: { vx: f32(), vz: f32() },
      /** Farming: grown seconds + growth stage + water reserve (sim s). */
      Crop: { sown: f32(), stage: u8(), water: f32(), type: new Array(CAP).fill("") },
      /** Generic carried/placed item identity. */
      Item: { kind: new Array(CAP).fill(""), qty: new Array(CAP).fill(1) },
      /** Seconds to live; negative = immortal. */
      Lifetime: { ttl: f32() },
    },
    time: { delta: 0, elapsed: 0, then: 0 },
  });

  const { Transform, Motion, Crop, Item, Lifetime } = world.components;

  return {
    world,
    components: world.components,
    /** Spawn an entity with the given components; returns its id. */
    spawn(...comps) {
      const eid = addEntity(world);
      for (const c of comps) addComponent(world, eid, c);
      return eid;
    },
    kill(eid) {
      removeEntity(world, eid);
    },
    /** Entities carrying every listed component. */
    select(...comps) {
      return query(world, comps);
    },
    /** Advance world.time and expire Lifetime entities. */
    tick(dt) {
      world.time.delta = dt;
      world.time.elapsed += dt;
      for (const eid of query(world, [Lifetime])) {
        if (Lifetime.ttl[eid] < 0) continue;
        Lifetime.ttl[eid] -= dt;
        if (Lifetime.ttl[eid] <= 0) removeEntity(world, eid);
      }
    },
  };
}
