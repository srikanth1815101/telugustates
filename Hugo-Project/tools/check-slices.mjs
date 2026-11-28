// Phase 5 feature slices: farming (ECS), fishing, vehicles (Rapier),
// livestock (yuka), building (snap validation) and trading (route offers).
// Run standalone: node Hugo-Project/tools/check-slices.mjs
import assert from "node:assert/strict";
import { createFarming, CROPS } from "../static/js/farming.js";
import { createFishing } from "../static/js/fishing.js";
import { createLivestock } from "../static/js/livestock.js";
import { createBuilding, STRUCTURES } from "../static/js/building.js";
import { createTrading } from "../static/js/trading.js";
import { createEconomy } from "../static/js/economy.js";
import { createInventory } from "../static/js/inventory.js";
import { AtlasPhysics } from "../static/js/physics.js";
import { createVehicleRig } from "../static/js/vehicles.js";

const report = {};

/* ---------------- Farming (ECS) ---------------- */
{
  const events = [];
  const farm = createFarming({ onEvent: (t, p) => events.push(t) });
  assert.equal(farm.sow(10, 10, "nope").why, "unknown-crop");
  const s = farm.sow(10, 10, "ragi");
  assert.ok(s.ok, "sow ok");
  assert.equal(farm.sow(10.4, 10.3, "paddy").why, "plot-overlap");
  assert.equal(farm.sow(50, 50, "ragi").ok, true, "second plot elsewhere");

  // actionAt near the plot: freshly sown is wet → "tend".
  assert.equal(farm.actionAt(10.2, 10.1).mode, "tend");
  assert.equal(farm.actionAt(999, 999).mode, "sow");

  // Growth: ragi needs stageSeconds=90 per stage; dry plot never grows.
  const dry = farm.sow(20, 20, "vegetable");
  const stageBefore = farm.serialise().plots.find((p) => p.id === dry.id).stage;
  for (let i = 0; i < 600; i++) farm.tick(1 / 60); // 10s
  assert.equal(
    farm.serialise().plots.find((p) => p.id === dry.id).stage,
    stageBefore,
    "no water ⇒ no growth",
  );

  // Wet ragi grows: water reserve is 60s; feed > 90s of ticks with re-water.
  let guard = 0;
  while (guard++ < 40) {
    for (let i = 0; i < 60 * 60; i++) farm.tick(1 / 60); // 60s slices
    const plot = farm.serialise().plots.find((p) => p.id === s.id);
    if (plot.stage >= CROPS.ragi.stages) break;
    farm.water(s.id); // refills reserve (may be already-wet early on)
  }
  const grown = farm.serialise().plots.find((p) => p.id === s.id);
  assert.equal(grown.stage, CROPS.ragi.stages, `ragi fully grown (${grown.stage})`);

  // A freshly sown plot can never be harvested immediately.
  const fresh = farm.sow(30, 30, "ragi");
  assert.equal(farm.harvest(fresh.id).why, "not-ready");
  const h1 = farm.harvest(s.id);
  assert.ok(h1.ok, "harvest ok");
  assert.ok(
    h1.qty >= CROPS.ragi.yield[0] && h1.qty <= CROPS.ragi.yield[1],
    `yield in range (${h1.qty})`,
  );
  // Deterministic yield for same (kind, id, salt).
  const f2 = createFarming();
  f2.sow(1, 1, "ragi");
  const f3 = createFarming();
  f3.sow(1, 1, "ragi");
  for (const f of [f2, f3]) {
    let g = 0;
    while (g++ < 40) {
      for (let i = 0; i < 3600; i++) f.tick(1 / 60);
      const p = f.serialise().plots[0];
      if (p.stage >= CROPS.ragi.stages) break;
      f.water(p.id);
    }
  }
  assert.equal(f2.harvest(f2.serialise().plots[0].id).qty, f3.harvest(f3.serialise().plots[0].id).qty, "yield deterministic");

  // Serialise/restore keeps plots.
  const snap = farm.serialise();
  const farm2 = createFarming();
  farm2.restore(snap);
  assert.equal(farm2.all().length, farm.all().length, "restore keeps live plots");
  report.farming = { events: events.length, plots: farm2.all().length };
}

/* ---------------- Fishing ---------------- */
{
  const fish = createFishing({ seed: 99, minWait: 1, maxWait: 1.2, biteWindow: 0.5 });
  assert.equal(fish.cast(0.1).why, "shallow");
  assert.ok(fish.cast(2).ok);
  assert.equal(fish.reel().why, "too-early", "reel before bite");
  assert.ok(fish.cast(2).ok, "re-cast after the aborted attempt");
  let saw = null;
  for (let i = 0; i < 200 && !saw; i++) saw = fish.tick(0.05);
  assert.equal(saw, "bite");
  assert.equal(fish.reel().ok, true, "timed reel lands the fish");
  const c = fish.lastCatch();
  assert.ok(["carp", "rohu", "catla", "eel", "prawn"].includes(c.kind));
  assert.ok(c.kg > 0);

  // Escape path: miss the window.
  const f2 = createFishing({ seed: 5, minWait: 0.5, maxWait: 0.6, biteWindow: 0.2 });
  f2.cast(3);
  let ev = null;
  for (let i = 0; i < 100 && ev !== "escape"; i++) ev = f2.tick(0.05);
  assert.equal(ev, "escape");
  assert.equal(f2.reel().why, "no-bite");
  report.fishing = { kind: c.kind, kg: c.kg };
}

/* ---------------- Vehicles (Rapier) ---------------- */
{
  const p = await AtlasPhysics.create({ heightAt: () => 0, tileSize: 400, grid: 8 });
  p.syncTiles(0, 0);
  p.flush();
  const rig = createVehicleRig({ R: p.R, world: p.world, x: 0, y: 0, z: 0 });
  assert.equal(rig.controller.numWheels(), 4);
  rig.input(1, 0);
  for (let i = 0; i < 480; i++) {
    rig.step(1 / 120);
    p.step(1 / 120);
  }
  const pos = rig.position();
  assert.ok(Number.isFinite(pos.x) && Number.isFinite(pos.z), "finite position");
  assert.ok(Math.abs(pos.z) > 2, `accelerated forward (z=${pos.z.toFixed(2)})`);
  assert.ok(pos.y > -1 && pos.y < 3, `stays near ground (y=${pos.y.toFixed(2)})`);
  const z0 = pos.z;
  rig.input(0.4, 1);
  for (let i = 0; i < 360; i++) {
    rig.step(1 / 120);
    p.step(1 / 120);
  }
  const pos2 = rig.position();
  assert.ok(
    Math.abs(pos2.x - pos.x) > 1.5,
    `steering curves the path (dx=${(pos2.x - pos.x).toFixed(2)})`,
  );
  const arc = Math.hypot(pos2.x - pos.x, pos2.z - pos.z);
  assert.ok(arc > 1.5, `still travelling through the turn (arc=${arc.toFixed(2)})`);
  report.vehicle = {
    speed: +rig.speed().toFixed(2),
    travelled: +Math.hypot(pos2.x, pos2.z).toFixed(2),
  };
  rig.dispose();
}

/* ---------------- Livestock (yuka) ---------------- */
{
  const pen = { minX: -8, maxX: 8, minX: 0, minZ: -6, maxZ: 6 };
  delete pen.minX2; // (keep shape explicit)
  const made = [];
  const stock = createLivestock({
    pen: { minX: -8, maxX: 8, minZ: -6, maxZ: 6 },
    count: 6,
    produceScale: 0.02, // fast production for the test
    onEvent: (t, p) => made.push(p),
  });
  for (let i = 0; i < 600; i++) stock.tick(1 / 60); // 10s
  for (const a of stock.animals) {
    const p = a.agent.vehicle.position;
    assert.ok(
      p.x >= -8.1 && p.x <= 8.1 && p.z >= -6.1 && p.z <= 6.1,
      `animal inside pen (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`,
    );
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z), "no NaN");
  }
  assert.ok(made.length >= 3, `production happened (${made.length})`);
  const threatened = stock.threaten(0, 0, 4);
  assert.ok(threatened >= 1, "nearby animals flee");
  const snap = stock.serialise();
  const stock2 = createLivestock({
    pen: { minX: -8, maxX: 8, minZ: -6, maxZ: 6 },
    count: 6,
  });
  stock2.restore(snap);
  assert.equal(stock2.serialise().length, 6);
  report.livestock = { produced: made.length, threatened };
}

/* ---------------- Building ---------------- */
{
  const economy = createEconomy({ seed: 3, rupees: 20 });
  const build = createBuilding({
    groundY: (x, z) => 10 + x * 0.01,
    gradeAt: (x, z) => (x > 100 ? [1.4, 0] : [0.05, 0.02]), // x>100 is a cliff
    spend: (n) => economy.spend(n, "build").ok,
  });
  const ok = build.place("cot", 5, 5);
  assert.ok(ok.ok, "flat placement");
  assert.equal(ok.at.y, 10.05, "snapped to ground");
  assert.equal(build.place("shed", 5.5, 5).why, "overlap");
  assert.equal(build.place("fence", 200, 5).why, "too-steep");
  assert.equal(build.place("rocket", 0, 0).why, "unknown-type");
  assert.equal(build.place("well", 50, 50).ok, true);
  // 6 + 9 = 15 spent of 20 → shed (12) no longer affordable.
  assert.equal(build.place("shed", 80, 80).why, "cannot-afford");
  const rm = build.remove(0);
  assert.ok(rm.ok && rm.refund === 3, "half refund");
  const snap = build.serialise();
  const b2 = createBuilding({ groundY: () => 0, spend: () => true });
  b2.restore(snap);
  assert.equal(b2.placed().length, 1);
  report.building = { placed: b2.placed().length, rupees: economy.rupees() };
}

/* ---------------- Trading ---------------- */
{
  const economy = createEconomy({ seed: 11, rupees: 500 });
  const inventory = createInventory();
  const events = [];
  const trade = createTrading({
    economy,
    inventory,
    onEvent: (t) => events.push(t),
  });
  const day = 12;
  const a = trade.offers(day);
  const b = trade.offers(day);
  assert.deepEqual(a, b, "offers deterministic per day");
  assert.notDeepEqual(a, trade.offers(day + 1), "offers change daily");
  assert.equal(a.length, 3);

  const sell = a.find((o) => o.side === "sell");
  const buy = a.find((o) => o.side === "buy");
  // Sell without goods → rejected.
  assert.equal(trade.execute(sell, day).why, "no-goods");
  // Seed the bag, then sell successfully at the route premium.
  inventory.add(sell.kind, sell.qty);
  const before = economy.rupees();
  const sr = trade.execute(sell, day);
  assert.ok(sr.ok, "route sell executes");
  assert.ok(economy.rupees() > before, "rupees increased");
  assert.equal(inventory.count(sell.kind), 0, "goods left the bag");
  // Route sell (94% of market) must beat the plain market spread (86%).
  assert.ok(sr.price >= Math.round(sell.market * 0.86), "beats plain spread");
  assert.ok(sr.price < sell.market, "still a market transaction");
  // Buy moves rupees down + goods up.
  const r0 = economy.rupees();
  const br = trade.execute(buy, day);
  assert.ok(br.ok, "route buy executes");
  assert.ok(economy.rupees() < r0, "rupees decreased");
  assert.equal(inventory.count(buy.kind), buy.qty, "goods arrived");
  // Stale offer rejected.
  assert.equal(trade.execute(buy, day + 1).why, "stale-offer");
  assert.ok(events.includes("trade"));
  report.trading = { offers: a.length, rupees: economy.rupees() };
}

console.log(
  `check-slices: PASS farming ${JSON.stringify(report.farming)} fishing ${JSON.stringify(report.fishing)} vehicle ${JSON.stringify(report.vehicle)} livestock ${JSON.stringify(report.livestock)} building ${JSON.stringify(report.building)} trading ${JSON.stringify(report.trading)}`,
);
