// Vehicles (Phase 5): Rapier ray-cast vehicle — a chassis with four
// suspension wheels on streamed heightfield terrain. Input is throttle
// (−1..1) + steering (−1..1); the world owns rendering, this owns physics.
// @ts-check

/**
 * @param {{R: any, world: any, x?: number, y?: number, z?: number,
 *          yaw?: number}} opts  R = initialised rapier module.
 */
export function createVehicleRig(opts) {
  const { R, world } = opts;
  const chassis = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(opts.x ?? 0, (opts.y ?? 0) + 0.9, opts.z ?? 0)
      .setRotation(quatFromYaw(R, opts.yaw ?? 0))
      .setLinearDamping(0.4)
      .setAngularDamping(1.2),
  );
  world.createCollider(
    R.ColliderDesc.cuboid(0.85, 0.3, 1.7).setDensity(0.9).setFriction(1.1),
    chassis,
  );
  const v = world.createVehicleController(chassis);
  const rest = 0.42,
    radius = 0.34;
  const wheels = [
    [-0.78, 1.05],
    [0.78, 1.05],
    [-0.78, -1.05],
    [0.78, -1.05],
  ];
  for (const [lx, lz] of wheels) {
    v.addWheel({ x: lx, y: -0.1, z: lz }, { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, rest, radius);
    const i = v.numWheels() - 1;
    v.setWheelSuspensionStiffness(i, 32);
    v.setWheelSuspensionCompression(i, 3.2);
    v.setWheelSuspensionRelaxation(i, 3.6);
    v.setWheelMaxSuspensionForce(i, 120);
    v.setWheelFrictionSlip(i, 1.6);
  }

  let throttle = 0,
    steer = 0,
    brake = 0;

  return {
    controller: v,
    chassis,
    /** Set driving inputs (clamped). */
    input(t, s, b = 0) {
      throttle = Math.max(-1, Math.min(1, t));
      steer = Math.max(-1, Math.min(1, s));
      brake = Math.max(0, Math.min(1, b));
    },
    /** One physics step (call at a fixed rate, e.g. 1/120). */
    step(dt) {
      const engine = throttle * 65;
      // Front wheels steer; all four get drive + brake.
      v.setWheelSteering(0, steer * 0.42);
      v.setWheelSteering(1, steer * 0.42);
      for (let i = 0; i < 4; i++) {
        v.setWheelEngineForce(i, i < 2 ? engine * 0.5 : engine * 0.5);
        v.setWheelBrake(i, brake * 8 + (throttle === 0 ? 0.6 : 0));
      }
      v.updateVehicle(dt);
    },
    position: () => chassis.translation(),
    rotation: () => chassis.rotation(),
    speed: () => v.currentVehicleSpeed(),
    serialise() {
      const p = chassis.translation();
      return { x: p.x, y: p.y, z: p.z, throttle, steer };
    },
    dispose() {
      world.removeRigidBody(chassis);
    },
  };
}

function quatFromYaw(R, yaw) {
  const half = yaw / 2;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}
