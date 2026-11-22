// Offline geometry, identity, driveable graph and terrain audit of the actual public catalog. No screenshot substitutes.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { Tiles, get, key } from "../static/js/grid.js";
import { ecology } from "../static/js/ecodata.js";
import { Surface } from "../static/js/terrain.js";
import { ACRE as M, basis, localPoint } from "../static/js/metres.js";
import { preparePads } from "../static/js/resident-scene.js";
import { homesAt } from "../static/js/home-index.js";
import { pathTo } from "../static/js/hamlet-route.js";
import { houseBlocked } from "../static/js/home-volume.js";
import { passes } from "../static/js/contacts.js";
const root = fileURLToPath(new URL("../", import.meta.url)),
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-village-")),
  dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) * M,
  lerp = (a, b, t) => a.map((n, i) => n + (b[i] - n) * t),
  cell = (p) => p.map(Math.floor),
  tag = (p) => p.join(","),
  summ = (a) => {
    if (!a.length) return { min: 0, median: 0, p95: 0, max: 0 };
    a = a.slice().sort((u, v) => u - v);
    return Object.fromEntries(
      [
        ["min", 0],
        ["median", 0.5],
        ["p95", 0.95],
        ["max", 1],
      ].map(([s, f]) => [s, +a[Math.round(f * (a.length - 1))].toFixed(2)]),
    );
  };
try {
  execFileSync("hugo", ["--source", root, "--destination", tmp, "--minify"]);
  globalThis.fetch = async (u) =>
    new Response(
      await fs.readFile(
        path.join(
          tmp,
          path.relative(path.join(root, "static"), fileURLToPath(u)),
        ),
      ),
    );
  const a = await get("data/atlas.json"),
    raw = JSON.parse(await fs.readFile(path.join(tmp, "catalog.json"))),
    plan = JSON.parse(
      await fs.readFile(path.join(root, "data/settlements.json")),
    ),
    rows = (
      await Promise.all(a.plots.map((t) => get("data/plots/" + t + ".json")))
    ).flat(),
    by = new Map(rows.map((r) => [r[2], r])),
    allcells = new Set(rows.map((r) => tag(r.slice(0, 2)))),
    tiles = new Tiles(a),
    ec = await ecology(),
    O = { x: a.project.cols / 2, y: a.project.rows / 2, z: 0 };
  let distances = [],
    areas = [],
    near = [],
    gaps = [],
    lengths = [],
    grade = [],
    allRoutes = 0,
    samples = 0,
    sharing = 0,
    checked = 0;
  let shared = 0,
    uniqueLinks = 0,
    fieldsOnShared = 0;
  const squares = [];
  const seen = new Set(),
    occupancy = {};
  for (const v of plan.villages) {
    const us = Object.keys(v.homes),
      bundle = await get("living/public/villages/" + v.d + ".json"),
      rec = bundle.settlements.find((s) => s.id === v.id);
    assert.equal(rec.count, us.length);
    assert(us.length >= 1 && us.length <= v.capacity);
    occupancy[us.length] = (occupancy[us.length] || 0) + 1;
    assert(!allcells.has(tag(cell(v.hub))));
    const { sw, side } = v.square;
    squares.push({
      village: v.id,
      district: v.d,
      acres: side * side,
      capacity: v.capacity,
      occupied: us.length,
    });
    const corners = (h) =>
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([x, y]) => {
        const r = by.get(h)[5];
        return localPoint(
          r,
          (x * r.yard.lot[0]) / 2,
          y < 0 ? -r.yard.d / 2 - r.yard.back : r.yard.d / 2 + r.yard.front,
        );
      });
    for (const u of us) {
      assert(
        corners(u).every((p) =>
          p.every((a, i) => a >= sw[i] && a <= sw[i] + side),
        ),
      );
      assert(v.homes[u].c.some((a, i) => a < sw[i] || a >= sw[i] + side));
    }
    const links = new Set(),
      vertices = new Set(),
      adj = new Map(),
      vs = new Map();
    let insideBund = 0;
    for (const path of v.paths) {
      assert(path.surveyed);
      for (let i = 1; i < path.xy.length; i++) {
        const a = path.xy[i - 1],
          b = path.xy[i],
          ta = tag(a),
          tb = tag(b),
          key = [ta, tb].sort().join(";");
        assert(!links.has(key), "Duplicate tread " + key);
        assert(dist(a, b) > 0.0001);
        links.add(key);
        vertices.add(ta);
        vertices.add(tb);
        if (!adj.has(ta)) adj.set(ta, []);
        if (!adj.has(tb)) adj.set(tb, []);
        adj.get(ta).push(tb);
        adj.get(tb).push(ta);
        if (path.type === "bund") {
          const axis = [0, 1].find(
            (k) => Math.abs(a[k] - Math.round(a[k])) < 1e-7 && a[k] === b[k],
          );
          assert.notEqual(axis, undefined, "farm track cuts diagonally");
          const q = lerp(a, b, 0.5),
            l = q.slice(),
            r = q.slice();
          l[axis] -= 0.001;
          r[axis] += 0.001;
          if (allcells.has(tag(cell(l))) && allcells.has(tag(cell(r))))
            shared += dist(a, b);
        }
      }
    }
    const reached = new Set([tag(v.hub)]),
      bfs = [tag(v.hub)];
    while (bfs.length) {
      const cur = bfs.shift();
      for (const nb of adj.get(cur) || [])
        if (!reached.has(nb)) {
          reached.add(nb);
          bfs.push(nb);
        }
    }
    assert.equal(
      links.size,
      vertices.size - 1,
      "single connected tree without loops",
    );
    uniqueLinks += links.size;
    for (const h of Object.values(v.homes)) {
      const l = v.paths.find(
        (p) => p.type === "field-entry" && tag(h.land) === tag(p.xy.at(-1)),
      );
      assert(l);
      const a = l.xy[0],
        b = h.land,
        other = [2 * a[0] - b[0], 2 * a[1] - b[1]];
      if (allcells.has(tag(cell(other)))) fieldsOnShared++;
    }
    const cells = rows.filter((r) => r[4] === v.d),
      ks = new Set();
    for (const p of [v.hub, ...us.map((u) => v.homes[u].c)])
      for (let i = -1; i < 2; i++)
        for (let j = -1; j < 2; j++)
          ks.add(key(p[0] + i * 256, p[1] + j * 256));
    await Promise.all([...ks].map((k) => tiles.load(k)));
    tiles.trim(ks);
    const s = new Surface(tiles, O, v.hub);
    s.focus = v.hub;
    s.ec = ec;
    s.commons = bundle.settlements;
    preparePads(s, cells);
    const counts = {};
    for (const u of us) {
      const [x, y, , style, d, h] = by.get(u),
        pin = v.homes[u],
        row = raw.houses.find((r) => r.u === u),
        [w, l] = pin.lot;
      assert(!seen.has(u));
      seen.add(u);
      assert.deepEqual(row.c, row.acreLocation);
      assert.deepEqual(row.c, pin.c);
      assert.deepEqual(h.centre, row.homeLocation);
      assert.equal(row.villageId, v.id);
      assert.deepEqual(row.homeLocation, pin.p);
      assert(w * l >= 149.9 && w * l <= 300.1);
      assert.deepEqual(cell(pin.land), [x, y]);
      assert.equal(tiles.at(x, y).ok, true);
      areas.push(w * l);
      distances.push(dist(h.centre, [x + 0.5, y + 0.5]));
      counts[tag(cell(h.centre))] = (counts[tag(cell(h.centre))] || 0) + 1;
      const box = (H, yard) => {
          const [W, D] = H.size_m,
            half = (yard ? H.yard.lot[0] : W) / 2,
            front = D / 2 + (yard ? H.yard.front : 0),
            rear = -D / 2 - (yard ? H.yard.back : 0),
            p = [
              [-half, rear],
              [half, rear],
              [half, front],
              [-half, front],
            ].map(([a, b]) => localPoint(H, a, b));
          return Object.assign(
            [
              Math.min(...p.map((k) => k[0])),
              Math.min(...p.map((k) => k[1])),
              Math.max(...p.map((k) => k[0])),
              Math.max(...p.map((k) => k[1])),
            ],
            { ring: p },
          );
        },
        gap = (A, B) => {
          const a = A.ring,
            b = B.ring;
          let disjoint = false,
            m = Infinity;
          for (const [p, q] of [
            [a, b],
            [b, a],
          ])
            for (let i = 0; i < 4; i++) {
              const x = p[i],
                y = p[(i + 1) % 4],
                dx = y[0] - x[0],
                dy = y[1] - x[1],
                l = dx * dx + dy * dy,
                project = (t) => (t[0] - x[0]) * dy - (t[1] - x[1]) * dx,
                aa = p.map(project),
                bb = q.map(project);
              if (
                Math.max(...aa) < Math.min(...bb) ||
                Math.max(...bb) < Math.min(...aa)
              )
                disjoint = true;
              for (const t of q) {
                const u = Math.max(
                  0,
                  Math.min(1, ((t[0] - x[0]) * dx + (t[1] - x[1]) * dy) / l),
                );
                m = Math.min(m, dist(t, [x[0] + u * dx, x[1] + u * dy]));
              }
            }
          return disjoint ? m : 0;
        },
        A = box(h, true),
        B = box(h, false);
      assert(homesAt(s, ...h.centre).includes(h));
      for (let i = Math.floor(A[0]); i <= Math.floor(A[2]); i++)
        for (let j = Math.floor(A[1]); j <= Math.floor(A[3]); j++)
          assert(
            !allcells.has(tag([i, j])),
            u + " courtyard encroaches on field",
          );
      const other = cells.filter((r) => r[2] !== u);
      if (other.length) {
        const g = Math.min(...other.map((r) => gap(A, box(r[5], true))));
        assert(g > 0.8, u + " crowding: " + g);
        gaps.push(Math.min(...other.map((r) => gap(B, box(r[5], false)))));
        near.push(Math.min(...other.map((r) => dist(h.centre, r[5].centre))));
      }
      const lane = pathTo(bundle.paths, pin.land, h.gate);
      assert.deepEqual(lane.xy[0], h.gate, u + " gate is disconnected");
      assert.deepEqual(lane.xy.at(-1), pin.land);
      const hub = pathTo(bundle.paths, pin.land, v.hub);
      assert.deepEqual(hub.xy[0], v.hub);
      lengths.push(lane.metres);
      allRoutes++;
      assert(
        !cells.some((r) => houseBlocked(r[5], ...pin.porch, false)),
        u + " spawn inside house",
      );
      checked++;
    }
    sharing += Object.values(counts).filter((n) => n > 1).length;
    for (const path of v.paths) {
      assert(path.w >= 0.85 && path.w <= 1.8);
      for (let i = 1; i < path.xy.length; i++) {
        const a = path.xy[i - 1],
          b = path.xy[i],
          len = dist(a, b),
          N = Math.max(1, Math.ceil(len / 1.1)),
          g = s.point(...a);
        let prev = a,
          z = g.z;
        for (let k = 1; k <= N; k++) {
          const p = lerp(a, b, k / N),
            l = s.point(...p);
          assert(l.w < 0 && !s.ocean(...p), `${path.id}: wet`);
          assert.equal(tiles.at(...p).d, v.d);
          assert(
            homesAt(s, ...p).every((h) => !houseBlocked(h, ...p, false, 0.4)),
            path.id + " hits a house wall",
          );
          if (v.shade) assert(dist(v.shade, p) > 1.6, "blocked by shade");
          grade.push(Math.abs(l.z - z) / (len / N));
          z = l.z;
          prev = p;
          samples++;
        }
      }
    }
  }
  assert.equal(seen.size, rows.length);
  assert.equal(new Set(rows.map((r) => r[2])).size, rows.length);
  assert.equal(allcells.size, rows.length);
  if (rows.length >= 20) assert(sharing > 0);
  const ratios = summ(grade);
  assert(ratios.max < 0.6, "Unwalkable grade " + ratios.max);
  console.log(
    JSON.stringify(
      {
        squares,
        uniqueLinks,
        sharedBundM: +shared.toFixed(2),
        fieldsOnShared,
        residents: seen.size,
        uniqueAcres: allcells.size,
        virtualAreaPerFieldM2: +(M * M).toFixed(2),
        districts: a.districts.length,
        hamlets: plan.villages.length,
        occupancy,
        homeToAcreCentreM: summ(distances),
        in100to500M: distances.filter((d) => d >= 100 && d <= 500).length,
        residentialAreaM2: summ(areas),
        nearestHouseCentreM: summ(near),
        nearestWallGapM: summ(gaps),
        routes: allRoutes,
        routeLengthFromGateM: summ(lengths),
        dryWalkSamples: samples,
        gradeRisePerMetre: ratios,
        multiHomeCellsWithinHamlets: sharing,
        safePorches: checked,
      },
      null,
      2,
    ),
  );
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}
