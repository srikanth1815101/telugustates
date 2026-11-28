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

/* ---------------- Inventory ---------------- */
{
  const { createInventory } = await import("../static/js/inventory.js");
  const inv = createInventory({ maxKinds: 2, maxStack: 10 });
  assert.equal(inv.add("paddy", 5), 5);
  assert.equal(inv.add("paddy", 99), 5, "stack capped at 10");
  assert.equal(inv.add("fish", 3), 3);
  assert.equal(inv.add("ragi", 1), 0, "kind cap enforced");
  assert.ok(inv.has("paddy", 10));
  assert.equal(inv.remove("paddy", 4), 4);
  assert.equal(inv.count("paddy"), 6);
  const round = createInventory().restore(inv.serialise());
  assert.equal(round.count("paddy"), 6, "serialise roundtrip");
  report.inventory = { kinds: inv.list().length, total: inv.total() };
}

/* ---------------- Interaction bus ---------------- */
{
  const { createBus } = await import("../static/js/interact.js");
  const bus = createBus();
  const seen = [];
  const off = bus.on("talk", (p) => seen.push(p.who));
  bus.on("talk", () => {
    throw new Error("boom"); // must not break other handlers
  });
  bus.once("pickup", (p) => seen.push("once:" + p.kind));
  assert.equal(bus.emit("talk", { who: "anna" }), 1, "throwing handler counted out");
  assert.equal(bus.emit("pickup", { kind: "stone" }), 1);
  bus.emit("pickup", { kind: "stone" }); // once → ignored
  off();
  bus.emit("talk", { who: "ravi" });
  assert.equal(seen.join(","), "anna,once:stone", `got ${seen}`);
  assert.equal(bus.size(), 1);
  report.bus = { seen: seen.length };
}

/* ---------------- Quests FSM ---------------- */
{
  const { createQuests } = await import("../static/js/quests.js");
  const states = [];
  const q = createQuests(
    [
      {
        id: "first-harvest",
        steps: [
          { id: "sow", type: "sow", need: 3 },
          { id: "wait", type: "day-end" },
          { id: "reap", type: "harvest" },
        ],
        reward: { rupees: 50 },
      },
      { id: "fish-5", steps: [{ id: "catch", type: "catch", need: 5 }] },
    ],
    { onState: (id, s) => states.push(`${id}:${s}`) },
  );
  assert.ok(q.start("first-harvest"));
  assert.equal(q.start("first-harvest"), false, "no double start");
  q.feed("sow", { plot: 1 });
  q.feed("sow", { plot: 2 });
  assert.equal(q.status("first-harvest"), "active");
  q.feed("sow", { plot: 3 });
  q.feed("day-end");
  assert.equal(q.all()["first-harvest"].step, 2);
  q.feed("harvest");
  assert.equal(q.status("first-harvest"), "complete");
  q.feed("harvest", {}); // no effect once complete
  // progress-based quest
  q.start("fish-5");
  for (let i = 0; i < 4; i++) q.feed("catch", { fish: "carp" });
  assert.equal(q.status("fish-5"), "active");
  q.feed("catch", {});
  assert.equal(q.status("fish-5"), "complete");
  // serialise/restore
  const snap = q.serialise();
  const q2 = createQuests([
    { id: "first-harvest", steps: [{ id: "a", type: "x" }] },
    { id: "fish-5", steps: [{ id: "c", type: "catch" }] },
  ]);
  q2.restore(snap);
  assert.equal(q2.status("first-harvest"), "complete");
  assert.equal(q2.status("fish-5"), "complete");
  report.quests = { states };
}

/* ---------------- Deterministic economy ---------------- */
{
  const { createEconomy, mulberry32 } = await import("../static/js/economy.js");
  const a = createEconomy({ seed: 42 });
  const b = createEconomy({ seed: 42 });
  for (const day of [1, 7, 30])
    for (const kind of ["paddy", "fish", "chilli"])
      assert.equal(a.price(kind, day), b.price(kind, day), "same seed ⇒ same price");
  const c = createEconomy({ seed: 43 });
  assert.notEqual(c.price("paddy", 7), a.price("paddy", 7), "different seed differs");

  const e = createEconomy({ seed: 1, rupees: 100 });
  const buy = e.buy("paddy", 2, 10);
  assert.ok(buy.ok);
  assert.equal(e.rupees(), 100 - buy.total);
  const poor = e.buy("fish", 1000, 10);
  assert.equal(poor.ok, false, "cannot overspend");
  assert.equal(poor.why, "insufficient-funds");
  const sell = e.sell("paddy", 1, 10);
  assert.ok(sell.ok && sell.total < buy.total, "sell spreads below buy");
  assert.equal(e.buy("nope", 1, 10).why, "unknown-good");
  assert.equal(e.buy("paddy", 0.5, 10).why, "bad-qty");
  const r = mulberry32(7);
  assert.equal(r(), mulberry32(7)(), "prng deterministic");
  report.economy = { rupees: e.rupees(), ledger: e.ledger().length };
}

/* ---------------- Yuka steering agents ---------------- */
{
  const { createAgent } = await import("../static/js/ai.js");
  const agent = createAgent({ x: 0, z: 0 });
  agent.go(10, 0, 0);
  for (let i = 0; i < 120; i++) agent.update(1 / 60);
  const p = agent.vehicle.position;
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z), "no NaN");
  assert.ok(p.x > 2, `seek travels toward target (x=${p.x.toFixed(2)})`);
  assert.ok(p.x < 10, "does not overshoot instantly");
  const stop = agent.flee(0, 0, 0);
  for (let i = 0; i < 90; i++) agent.update(1 / 60);
  assert.ok(
    Math.hypot(agent.vehicle.position.x, agent.vehicle.position.z) >
      Math.hypot(p.x, p.z) - 0.01,
    "flee pushes away from origin",
  );
  stop();
  report.ai = { seekX: +p.x.toFixed(3) };
}

/* ---------------- IndexedDB save slots (fake-indexeddb) ---------------- */
{
  await import("fake-indexeddb/auto");
  const { loadSlot, saveSlot, exportSlot, importSlot, listSlots, deleteSlot } =
    await import("../static/js/save.js");
  assert.equal(await loadSlot("default"), null, "empty store");
  await saveSlot("default", { inventory: [["paddy", 6]], day: 12 });
  const rec = await loadSlot("default");
  assert.equal(rec.v, 1);
  assert.deepEqual(rec.data.inventory, [["paddy", 6]]);
  const json = await exportSlot("default");
  assert.ok(json?.includes("telugustates-life"));
  await deleteSlot("default");
  assert.equal(await loadSlot("default"), null, "deleted");
  const back = await importSlot(json, "restored");
  assert.ok(back, "import accepts a valid export");
  assert.deepEqual((await loadSlot("restored")).data.day, 12);
  assert.equal(await importSlot("{not json"), null, "garbage rejected");
  assert.equal(await importSlot('{"app":"other"}'), null, "foreign export rejected");
  const slots = await listSlots();
  assert.equal(slots.length, 1);
  report.save = { slots: slots.length };
}

console.log(
  `check-systems phase4: PASS ${JSON.stringify({
    inventory: report.inventory,
    bus: report.bus,
    quests: report.quests,
    economy: report.economy,
    ai: report.ai,
    save: report.save,
  })}`,
);
