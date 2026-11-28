// Steering agents (Phase 4) on vendored Yuka — used by Phase 5 livestock
// and vehicles so wander/chase/flee are library behaviours, not hand-rolled
// integration. Thin wrapper: an agent is a Yuka Vehicle plus named
// behaviours we toggle from game code. (Yuka seek/flee targets are plain
// Vector3s, not entities.)
// @ts-check
import {
  Vehicle,
  Vector3,
  SeekBehavior,
  WanderBehavior,
  FleeBehavior,
} from "../vendor/yuka.module.js";

/**
 * Create a steering agent at scene (x, z), y optional.
 * @param {{x: number, z: number, y?: number, speed?: number, wander?: boolean}} opts
 */
export function createAgent(opts) {
  const v = new Vehicle();
  v.position.set(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
  v.maxSpeed = opts.speed ?? 1.6;
  v.maxForce = 8;

  const seekTarget = new Vector3(v.position.x, v.position.y, v.position.z);
  const seek = new SeekBehavior(seekTarget);
  const wander = new WanderBehavior();
  wander.weight = opts.wander === false ? 0 : 0.6;
  v.steering.add(wander);
  v.steering.add(seek);

  return {
    vehicle: v,
    /** Steer toward a scene-space point. */
    go(x, y, z) {
      seekTarget.set(x, y ?? 0, z);
    },
    /** Stop seeking (wander only). */
    idle() {
      seekTarget.set(v.position.x, v.position.y, v.position.z);
    },
    /** Flee from a point (returns a removable behaviour handle). */
    flee(x, y, z) {
      const t = new Vector3(x, y ?? 0, z);
      const b = new FleeBehavior(t);
      b.weight = 1.4;
      v.steering.add(b);
      return () => v.steering.remove(b);
    },
    /** Advance the simulation by dt seconds. */
    update(dt) {
      v.update(dt);
      return v.position;
    },
    /** Snapshot for saves/HUD. */
    serialise() {
      return {
        x: v.position.x,
        y: v.position.y,
        z: v.position.z,
        speed: v.maxSpeed,
      };
    },
  };
}
