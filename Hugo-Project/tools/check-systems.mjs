// Phase 1+ system checks: fixed-timestep clock, dynamic-entity ECS, and
// (as they land) inventory / economy / quests / save / farming / building.
// Run standalone: node Hugo-Project/tools/check-systems.mjs
import assert from "node:assert/strict";
import { SimClock } from "../static/js/sim-clock.js";
import { createEcs } from "../static/js/ecs.js";
import { WalkMotor } from "../static/js/walk-motor.js";

const report = {};

/* ---------------- SimClock ---------------- */
{
  // 60fps feeding: 2 seconds = 240 exact 1/120 ticks.
  const c = new SimClock();
  let ticks = 0;
  for (let i = 0; i < 120; i++) c.advance(1 / 60, () => ticks++);
  assert.equal(ticks, 240, "2s at 60fps must produce 240 ticks");

  // Irregular frames, same total time: tick count is conserved (±1 bank).
  const pattern = [1 / 20, 1 / 144, 1 / 33, 1 / 120, 0.05, 1 / 90];
  const c3 = new SimClock();
  let n3 = 0;
  let fed = 0,
    i3 = 0;
  while (fed < 2) {
    const dt = Math.min(pattern[i3++ % pattern.length], 2 - fed);
    fed += dt;
    c3.advance(dt, () => n3++);
  }
  assert.ok(Math.abs(n3 - 240) <= 1, `irregular 2s ≈ 240 ticks, got ${n3}`);

  // Catch-up cap: a 5s stall must not schedule 600 ticks.
  const c4 = new SimClock();
  let n4 = 0;
  c4.advance(5, () => n4++);
  assert.ok(n4 <= 12, `capped catch-up, got ${n4}`);
  assert.ok(c4.dropped > 0, "dropped time must be counted");

  // Determinism: the SAME WalkMotor advanced through DIFFERENT frame
  // patterns with the fixed clock ends in the identical state, because the
  // motor only ever sees exact 1/120 slices.
  const face = { z: 0, depth: 0, drawn: true, line: 0, standable: true };
  const surf = {
    sample: () => face,
    floor: () => face,
    traversable: () => true,
    gradeAt: () => [0, 0],
    current: () => [0, 0, 0],
  };
  const run = (pattern) => {
    const m = new WalkMotor();
    m.reset(0, 0, surf, 0, 1.65);
    const clk = new SimClock();
    let moved = 0,
      fed = 0,
      i = 0;
    while (fed < 4) {
      const dt = Math.min(pattern[i++ % pattern.length], 4 - fed);
      fed += dt;
      clk.advance(dt, (sdt) => {
        moved += m.advance(sdt, 0, 1, 2.4, surf, () => true, 1.65);
      });
    }
    return { x: m.x, y: m.y, moved, ticks: clk.ticks };
  };
  const a = run([1 / 60]);
  const b = run([1 / 30, 1 / 30]);
  const cPat = run([1 / 144, 1 / 90, 1 / 45]);
  assert.equal(a.ticks, b.ticks, "tick count conserved across patterns");
  assert.ok(
    Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6,
    `steady vs 30fps identical: ${a.x} vs ${b.x}`,
  );
  assert.ok(
    Math.abs(a.x - cPat.x) < 0.02 && Math.abs(a.y - cPat.y) < 0.02,
    `irregular pattern within 2cm after 4s: ${a.x} vs ${cPat.x}`,
  );
  assert.ok(a.y > 0.02, `walker must have travelled along +Y (got ${a.y})`);
  assert.ok(Math.abs(a.x) < 1e-9, "no lateral drift on a flat face");

  report.simClock = {
    steadyTicks: ticks,
    irregularTicks: n3,
    cappedTicks: n4,
    dropped: +c4.dropped.toFixed(2),
    travel: +a.moved.toFixed(3),
  };
}

/* ---------------- ECS ---------------- */
{
  const ecs = createEcs();
  const { Transform, Crop, Lifetime, Item } = ecs.components;

  const e = ecs.spawn(Transform, Crop);
  assert.ok(Number.isInteger(e) && e > 0, "spawn returns an entity id");
  Transform.x[e] = 12.5;
  Transform.z[e] = -3.25;
  Crop.type[e] = "ragi";
  Crop.sown[e] = 100;
  Crop.stage[e] = 2;

  const crops = ecs.select(Transform, Crop);
  assert.equal(crops.length, 1, "query finds the crop");
  assert.equal(Crop.type[crops[0]], "ragi");
  assert.equal(Transform.x[crops[0]], 12.5);

  // Lifetime expiry across ticks.
  const ghost = ecs.spawn(Lifetime);
  Lifetime.ttl[ghost] = 0.05;
  for (let i = 0; i < 12; i++) ecs.tick(1 / 60);
  assert.ok(
    !ecs.select(Lifetime).includes(ghost),
    "expired entity leaves the world",
  );
  assert.ok(ecs.select(Transform, Crop).length === 1, "crop survives");

  // Item AoS roundtrip.
  const bag = ecs.spawn(Item);
  Item.kind[bag] = "paddy";
  Item.qty[bag] = 25;
  assert.equal(Item.qty[ecs.select(Item)[0]], 25);

  ecs.kill(e);
  assert.equal(ecs.select(Transform, Crop).length, 0, "kill removes entity");

  report.ecs = { ok: true, time: +ecs.world.time.elapsed.toFixed(3) };
}

console.log(
  `check-systems: PASS sim-clock ${JSON.stringify(report.simClock)} ecs ${JSON.stringify(report.ecs)}`,
);
