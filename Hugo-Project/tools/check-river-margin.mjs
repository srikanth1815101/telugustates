// Fixed shallow-bed transects. Trace the connected wet edge, not a brightness threshold; offsets are along the bank, not elapsed time.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import * as T from "../static/vendor/three.module.min.js";
import { get, Tiles, key } from "../static/js/grid.js";
import { Surface, chunk } from "../static/js/terrain.js";
import { ecology } from "../static/js/ecodata.js";
import { ACRE as U } from "../static/js/metres.js";
import { driftMesh } from "../static/js/current-flecks.js";
const root = fileURLToPath(new URL("../", import.meta.url)),
  pub = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-water-"));
try {
  execFileSync("hugo", ["--source", root, "--destination", pub, "--minify"]);
  globalThis.fetch = async (u) =>
    new Response(
      await fs.readFile(
        path.join(
          pub,
          path.relative(path.join(root, "static"), fileURLToPath(u)),
        ),
      ),
    );
  const a = await get("data/atlas.json"),
    ec = await ecology(),
    q = {},
    m = new T.MeshBasicMaterial(),
    mat = { land: m, water: m },
    uniforms = {
      liquidTime: { value: 0 },
      uDay: { value: 1 },
      uHor: { value: new T.Color() },
      uFog: { value: 0 },
    };
  async function surface(x, y) {
    const t = new Tiles(a);
    await Promise.all(
      Array.from({ length: 9 }, (_, i) =>
        t.load(key(x + ((i % 3) - 1) * 256, y + (((i / 3) | 0) - 1) * 256)),
      ),
    );
    const s = new Surface(
      t,
      { x: a.project.cols / 2, y: a.project.rows / 2, z: 0 },
      [x, y],
    );
    s.ec = ec;
    s.focus = [x, y];
    return [s, chunk(s, Math.floor(x / 64), Math.floor(y / 64), 2, mat)];
  }

  const pct = (r, k) =>
      r.slice().sort((a, b) => a - b)[Math.floor(k * (r.length - 1))],
    fix = (v, d = 3) => +v.toFixed(d);
  async function staff(name, x, y) {
    const [s, g] = await surface(x, y),
      w = g.children.find(
        (o) => o.userData.role === "continuous-water",
      ).geometry,
      P = w.attributes.position,
      f = w.attributes.flow,
      d = w.attributes.depthM;
    let V = [];
    for (let k = 0; k < P.count; k++) {
      if (Math.abs(d.getX(k)) > 0.00005) continue;
      const xx = s.o.x + P.getX(k) / U,
        yy = s.o.y - P.getZ(k) / U;
      V.push([Math.hypot(xx - x, yy - y) * U, xx, yy]);
    }
    V.sort((a, b) => a[0] - b[0]);
    const [, cx, cy] = V[0],
      n0 = [
        s.wet(cx + 0.024, cy) - s.wet(cx - 0.024, cy),
        s.wet(cx, cy + 0.024) - s.wet(cx, cy - 0.024),
      ],
      nn = Math.hypot(...n0),
      n = n0.map((v) => v / nn),
      dir = s.current(cx, cy, 1, false),
      sg = Math.sign(n[1] * dir[0] + n[0] * dir[1]) || 1,
      b = [sg * n[1], -sg * n[0]],
      rows = [],
      series = [],
      slope = [],
      speed = [];
    for (const along of [-12, -9, -6, -3, 0, 3, 6, 9, 12]) {
      const x0 = cx + (b[0] * along) / U,
        y0 = cy + (b[1] * along) / U,
        pt = (r) => [x0 + (n[0] * r) / U, y0 + (n[1] * r) / U],
        h = (r) => s.sample(...pt(r));
      let lo = -19,
        hi = 19;
      if (h(lo).w >= 0 || h(hi).w <= 0)
        throw Error(
          "transect does not bracket the bank: " +
            name +
            " " +
            along +
            " " +
            JSON.stringify([cx, cy, n, b, h(lo).w, h(hi).w]),
        );
      for (let j = 0; j < 26; j++) {
        let m = (lo + hi) * 0.5;
        if (h(m).w > 0) hi = m;
        else lo = m;
      }
      const zero = (lo + hi) * 0.5;
      const samples = [];
      for (let i = -34; i <= 95; i++) {
        const r = i * 0.04,
          pos = pt(zero - r);
        samples.push({ r, pos, h: s.sample(...pos) });
      }
      const q = pt(zero);
      rows.push({ along, zero: q });
      series.push([]);
      slope.push(fix(h(zero - 1).z - h(zero - 1).line));
      for (let j = 0; j <= 200; j++) {
        s.liquidTime = j * 0.12;
        let edge = samples[0].r;
        for (const v of samples) {
          const wet = s.waterContact(...v.pos, v.h).depth;
          if (wet < 0.0002) break;
          edge = v.r;
        }
        series.at(-1).push(fix(edge));
      }
      for (const r of [0, 0.8, 3, 7, 16, 35]) {
        const [X, Y] = pt(zero + r);
        const h = s.sample(X, Y);
        speed.push({
          along,
          inwardM: r,
          depth: fix(h.line - h.z),
          mps: fix(s.current(X, Y, 1, false, h.w)[2]),
        });
      }
    }
    // Audit higher dry ground independently of stopping at the first dry sample.
    let tested = 0,
      impermissible = 0;
    for (let i = -50; i <= 50; i += 2) {
      for (let j = -50; j <= 50; j += 2) {
        const X = cx + i / U,
          Y = cy + j / U,
          h = s.sample(X, Y);
        if (h.w >= 0 || h.z - h.line < 0.21 || !h.drawn) continue;
        tested++;
        for (let k = 0; k <= 16; k++) {
          s.liquidTime = k * 0.73;
          if (s.waterContact(X, Y, h).depth > 1e-5) impermissible++;
        }
      }
    }
    const phaseDifferences = series[0].map(
        (_, i) =>
          Math.max(...series.map((r) => r[i])) -
          Math.min(...series.map((r) => r[i])),
      ),
      opposed = series[0].filter(
        (_, i) =>
          i > 5 &&
          series.some((r) => r[i] - r[i - 5] > 0.075) &&
          series.some((r) => r[i - 5] - r[i] > 0.075),
      ).length;
    const trace = driftMesh(s, ...s.focus, 1, uniforms),
      segments = [],
      rock = s.xyz(cx, cy, 0);
    if (trace) {
      const A = trace.geometry.attributes;
      for (let i = 0; i < A.position.count; i += 4) {
        const dt = A.parcel.getX(i) / 3;
        for (const [ka, kb] of [
          ["position", "nextB"],
          ["nextB", "nextC"],
          ["nextC", "lastD"],
        ]) {
          const a = A[ka],
            b = A[kb],
            distance = Math.hypot(a.getX(i) - rock[0], a.getZ(i) - rock[2]);
          if (distance < 100) {
            segments.push(
              Math.hypot(b.getX(i) - a.getX(i), b.getZ(i) - a.getZ(i)) / dt,
            );
          }
        }
      }
    }
    const max = Math.max(...series.flat()),
      min = Math.min(...series.flat());
    return {
      site: name,
      stationOffsetsM: rows.map((r) => r.along),
      origin: [cx, cy],
      normal: n,
      tangent: b,
      bedRiseAtOneMetre: slope,
      stepS: 0.12,
      stepM: 0.04,
      totalS: 24,
      landwardM: series,
      furthestLandwardM: max,
      furthestChannelwardM: -min,
      maxExcursionAtOneStationM: fix(
        Math.max(...series.map((r) => Math.max(...r) - Math.min(...r))),
      ),
      medianConcurrentWidthDifferenceM: fix(pct(phaseDifferences, 0.5)),
      samplesWithSimultaneousAdvanceAndRetreat: opposed,
      eligibleDryControlSites: tested,
      highGroundFloodedReadings: impermissible,
      speeds: speed,
      nearbyParcelLegs: segments.length,
      parcelMedianMps: segments.length ? fix(pct(segments, 0.5)) : 0,
      parcelP10P90Mps: segments.length
        ? [fix(pct(segments, 0.1)), fix(pct(segments, 0.9))]
        : null,
      meanTriangles: (w.userData.meanIndexCount ?? w.index.count) / 3,
      extraMarginTriangles:
        (w.index.count - (w.userData.meanIndexCount ?? w.index.count)) / 3,
    };
  }
  for (const [id, x, y] of [
    ["bend", 3108.788062, 2628.204176],
    ["tributary", 3212.02375, 2723.415],
    ["reservoir", 2548.325, 5572.225],
  ])
    q[id] = await staff(id, x, y);
  if (process.env.ATLAS_STAFF_JSON)
    await fs.writeFile(process.env.ATLAS_STAFF_JSON, JSON.stringify(q));
  for (const r of Object.values(q)) {
    const { landwardM, speeds, ...summary } = r;
    console.log(JSON.stringify(summary));
  }
  for (const id of ["bend", "tributary"]) {
    const r = q[id];
    assert(r.parcelMedianMps > 1 && r.nearbyParcelLegs > 40);
    assert(
      r.extraMarginTriangles > 20 &&
        r.furthestLandwardM > 0.32 &&
        r.furthestLandwardM < 2.45 &&
        r.maxExcursionAtOneStationM > 0.4,
    );
    assert(
      r.samplesWithSimultaneousAdvanceAndRetreat > 12 &&
        r.eligibleDryControlSites > 200 &&
        !r.highGroundFloodedReadings,
    );
  }
  assert(
    q.reservoir.extraMarginTriangles === 0 &&
      q.reservoir.maxExcursionAtOneStationM === 0 &&
      q.reservoir.parcelMedianMps === 0,
  );
} finally {
  await fs.rm(pub, { recursive: true, force: true });
}
