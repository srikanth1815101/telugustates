// Exercise the same solver and tapered centreline the game submits. No pre-wet initial state and no renderer needed.
import assert from "node:assert/strict";
import { Catchment, rainMMH, section } from "../static/js/catchment.js";
import { spline } from "../static/js/rill-sheet.js";
const report = { slope: {}, bucket: {} },
  budget = (n) =>
    Math.abs(
      n.balance.initial +
        n.balance.rain -
        n.balance.soil -
        n.balance.evap -
        n.balance.exit -
        n.stored(),
    ),
  qtl = (a, p) => a.sort((x, y) => x - y)[Math.round(p * (a.length - 1))];
const get = (x, y) => ({
  h:
    x * 0.128 +
    y * 0.017 +
    0.55 * Math.sin(0.136 * y + 0.078 * x) +
    0.32 * Math.sin(0.163 * x - 0.087 * y),
  perm: 0.12 + 0.47 * (0.5 + 0.5 * Math.sin(x * 0.114 - y * 0.072)),
});
let previous = null,
  diameters = [];
for (const [tag, r] of [
  ["light", 0.23],
  ["rain", 0.53],
  ["heavy", 0.91],
]) {
  const n = new Catchment(39, 12, 17, get, { spacing: 2.7, probe: get });
  for (let i = 0; i < 240; i++) n.step(8, r);
  const curves = n.curves();
  assert(budget(n) < 2e-7);
  const src = curves.filter((e) => !e.a.drawIn),
    tails = curves.filter((e) => e.tail),
    fall = curves.filter((e) => !e.spill);
  assert(
    src.length &&
      src.every((e) => spline(e, 0)[2] === 0) &&
      tails.every((e) => spline(e, 1)[2] === 0),
  );
  const ids = new Map(curves.map((e) => [e.a.key + ":" + e.b.key, e.w1 * 2]));
  let paired = [];
  if (previous)
    for (const [k, a] of ids)
      if (previous.ids.has(k)) paired.push(a / previous.ids.get(k));
  let minStep = Infinity;
  const mask = new Set(),
    res = 0.17;
  for (const e of curves) {
    let a = spline(e, 0);
    for (let j = 1; j <= 12; j++) {
      const b = spline(e, j / 12),
        drop = get(a[0], a[1]).h - get(b[0], b[1]).h;
      minStep = Math.min(minStep, drop);
      const w = Math.max(a[2], b[2]),
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        L = dx * dx + dy * dy;
      for (
        let I = Math.ceil((Math.min(a[0], b[0]) - w) / res);
        I <= (Math.max(a[0], b[0]) + w) / res;
        I++
      )
        for (
          let J = Math.ceil((Math.min(a[1], b[1]) - w) / res);
          J <= (Math.max(a[1], b[1]) + w) / res;
          J++
        ) {
          const X = I * res - a[0],
            Y = J * res - a[1],
            u = Math.max(0, Math.min(1, (dx * X + dy * Y) / (L || 1)));
          if (Math.hypot(X - dx * u, Y - dy * u) <= a[2] + (b[2] - a[2]) * u)
            mask.add(I + ":" + J);
        }
      a = b;
    }
  }
  const out = new Map();
  for (const e of curves) {
    const k = e.a.key;
    (out.get(k) || out.set(k, []).get(k)).push(e.b.key);
  }
  const down = (k, seen = new Set()) => {
    if (seen.has(k)) return seen;
    seen.add(k);
    for (const j of out.get(k) || []) down(j, seen);
    return seen;
  };
  let rejoins = 0;
  for (const targets of out.values())
    if (targets.length > 1) {
      const a = down(targets[0]);
      if ([...down(targets[1])].some((k) => a.has(k))) rejoins++;
    }
  const v = (report.slope[tag] = {
    rainMMH: rainMMH(r),
    stormMinutes: n.age / 60,
    active: curves.length,
    zeroRadiusHeads: src.length,
    joins: n.state.joins,
    splits: n.state.splits,
    rejoins,
    wetM2: mask.size * res ** 2,
    medianWidthM: qtl([...ids.values()], 0.5),
    pairedMedianWidthRatio: paired.length ? qtl(paired, 0.5) : null,
    outfalls: curves.filter((e) => e.b.open).length,
    minSplineDropM: minStep,
    waterBalanceErrorM3: budget(n),
  });
  assert(v.active > 0 && v.outfalls > 0 && v.minSplineDropM > -0.0013);
  if (previous)
    assert(
      v.active > previous.v.active &&
        v.wetM2 > 1.19 * previous.v.wetM2 &&
        v.pairedMedianWidthRatio > 1.2,
    );
  if (tag === "heavy") assert(v.joins > 2 && v.splits > 2 && rejoins > 0);
  previous = { v, ids };
}
// Two real depressions in series; only the upstream side is rained on. The receiving pothole has no local source.
const N = 13,
  row = 6,
  profile = [
    0.16, 0.12, 0.052, 0, 0.013, 0.037, 0.028, 0.004, -0.035, -0.023, 0.065,
    0.022, -0.1,
  ],
  read = (x, y, i, j) => ({
    h: profile[i] + Math.abs(j - row) * 0.085,
    wall: j < 2 || j > 10 || i === 0,
    open: i === 12,
    exposure: i < 5 ? 1 : 0,
    perm: 0.11,
  });
const n = new Catchment(N, 0, 0, read, { spacing: 1.85 }),
  a = n.pits.find((p) => p.floor === 0),
  b = n.pits.find((p) => p.floor === -0.035);
assert(a && b && a.lip === 0.037);
let overflow = null,
  wet = null,
  exit = null,
  before = null,
  maximumError = 0;
for (let i = 1; i <= 2000; i++) {
  const h = a.level;
  n.step(4, 0.91);
  maximumError = Math.max(maximumError, budget(n));
  if (!overflow && a.overflow > 0) {
    overflow = n.age;
    const e = n.saddles.find((e) => e.q > 0 && n.nodes[e.src].basin === a.id);
    assert(e && n.nodes[e.dst].basin === b.id && a.level >= e.lip - 1e-7);
    before = {
      priorHead: h,
      afterHead: a.level,
      lip: e.lip,
      edge: [e.src, e.dst],
    };
  }
  if (!overflow) {
    assert(b.volume === 0 && n.balance.exit === 0);
    assert(a.level <= a.lip + 1e-6);
  }
  if (b.volume > 1e-8 && !wet) wet = n.age;
  if (n.balance.exit > 1e-9 && !exit) exit = n.age;
}
assert(overflow > 4 && wet > overflow && exit > wet);
const old = n.stored(),
  st = n.snapshot(),
  copy = new Catchment(N, 0, 0, read, { state: st, spacing: 1.85 });
assert(Math.abs(old - copy.stored()) < 1e-8);
const high = [a.level, b.level];
for (let i = 0; i < 5800; i++) {
  n.step(4, 0);
  maximumError = Math.max(maximumError, budget(n));
}
assert(
  n.stored() < old * 0.66 &&
    a.level < high[0] &&
    b.level < high[1] &&
    maximumError < 1e-7,
);
report.bucket = {
  firstSpillStormSeconds: overflow,
  receiverFirstWetStormSeconds: wet,
  openOutletFirstWetStormSeconds: exit,
  ...before,
  high,
  afterDry: [a.level, b.level],
  beforeDryM3: old,
  afterDryM3: n.stored(),
  maxBudgetErrorM3: maximumError,
};
console.log(JSON.stringify(report, null, 2));
