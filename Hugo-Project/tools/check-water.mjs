// Offline acceptance checks on the shipped static geometry. No renderer, accounts or network required.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import * as T from "../static/vendor/three.module.min.js";
import { get, Tiles, key } from "../static/js/grid.js";
import { Surface, chunk } from "../static/js/terrain.js";
import { ecology } from "../static/js/ecodata.js";
import { U } from "../static/js/habitats.js";

import { RunoffWindow, TILE, CORE, SPACING } from "../static/js/rain-ground.js";
import {
  findFall,
  findStageFalls,
  cascade,
  fallRocks,
  bedStones,
  rockWater,
  disposeWater,
} from "../static/js/moving-water.js";
import {
  loadPatch,
  staticModel,
  loadPeople,
} from "../static/js/art-library.js";
import { meshShape } from "../static/js/contacts.js";
import { traveller } from "../static/js/traveller.js";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
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
  {
    const x = 3999.5,
      y = 5169.5,
      [s] = await surface(x, y),
      w = new RunoffWindow(s),
      storm = { storage: 0.9, rain: 0.91 };
    await w.warm(x, y, () => true);
    const [ia, ib] = w.around(x, y);
    for (let i = 0; i <= 80; i++) w.update(x, y, 0, 1, storm, i * 0.2);
    // One connected graph crosses the page edges. Moving the window or handing off a scene must preserve both stored water and moving widths at unchanged interior sites.
    // A dry interval does not clear the standing water, nor is recent storage permission to animate a land stream.
    const C = new RunoffWindow(s);
    C.inherit(w);
    C.install(ia, ib);
    const start = C.net.stored();
    for (let i = 0; i < 32; i++) {
      C.update(
        x,
        y,
        0,
        1,
        { rain: i % 2 ? 0.035 : 0, storage: 0.9 },
        16 + i * 0.2,
      );
      assert(
        !C.stats.precipitating &&
          !C.stats.rillsDrawn &&
          C.stats.rainMMH === 0 &&
          C.stats.active === 0,
      );
    }
    assert(
      C.stats.waterM3 > 0 &&
        C.stats.waterM3 < start &&
        Math.abs(C.stats.budgetErrorM3) < 1e-6,
    );
    s.rainStage = (X, Y, h) => w.stage(X, Y, h);
    const map0 = w.net.snapshot(),
      r0 = w.net.curves(),
      cross = r0.filter(
        (r) =>
          Math.floor(r.a.x / TILE) !== Math.floor(r.b.x / TILE) ||
          Math.floor(r.a.y / TILE) !== Math.floor(r.b.y / TILE),
      );
    assert(cross.length > 5);
    const w2 = new RunoffWindow(s);
    w2.inherit(w);
    w2.install(ia + 1, ib);
    const map1 = w2.net.snapshot();
    let shared = 0,
      delta = 0;
    for (const v of w.net.nodes) {
      if (v.open || Math.abs(v.x - x * U) > 26 || Math.abs(v.y - y * U) > 26)
        continue;
      const q = map1.get(v.key),
        r = map0.get(v.key);
      if (!q || !r) continue;
      shared++;
      delta = Math.max(
        delta,
        Math.abs(r.film - q.film),
        Math.abs(r.sat - q.sat),
      );
    }
    assert(shared > 15 && delta < 1e-7);
    let captured = 0,
      fluxDifference = 0;
    for (const e of w2.net.edges) {
      const a = w2.net.nodes[e.a],
        b = w2.net.nodes[e.b];
      if (Math.hypot(a.x - x * U, a.y - y * U) > 28) continue;
      const old = map0.get(a.key)?.flux.find((z) => z[0] === b.key);
      if (old) {
        captured++;
        fluxDifference = Math.max(fluxDifference, Math.abs(e.q - old[1]));
      }
    }
    assert(captured > 15 && fluxDifference < 1e-9);
    w2.dispose();
    let frames = 0,
      guard = 9,
      minSeg = Infinity,
      travel = 0;
    for (let i = 0; i <= 540; i++) {
      const d = i < 325 ? i * 1.1 : 357.5 - (i - 325) * 1.1,
        X = x + d / U,
        Y = y + (Math.sin(d * 0.018) * 9) / U;
      w.update(X, Y, i < 325 ? 1 : -1, 0, storm, 16.2 + i * 0.18);
      guard = Math.min(guard, w.stats.guard);
      minSeg = Math.min(minSeg, w.stats.downhillSegments);
      assert(
        w.stats.tiles <= 49 &&
          w.u.wet.value > 0.9 &&
          w.stats.impactSurface &&
          w.stats.minFall > 0,
      );
      for (let k = 0; k < 12; k++) {
        let X1 = X * U + Math.cos((k * Math.PI) / 6) * 55,
          Y1 = Y * U + Math.sin((k * Math.PI) / 6) * 55;
        assert(
          w.tiles.has(Math.floor(X1 / TILE) + "," + Math.floor(Y1 / TILE)),
        );
      }
      frames++;
      travel += i ? 1.1 : 0;
    }
    assert(guard === 9 && minSeg > 25 && w.evicted > 25);
    q.rolling = {
      frames,
      metres: +travel.toFixed(1),
      minGuard: guard,
      minDownhillSegments: minSeg,
      crossPageReaches: cross.length,
      overlapSites: shared,
      maxStorageDifference: delta,
      preservedFluxes: captured,
      maxFluxDifference: fluxDifference,
      built: w.built,
      evicted: w.evicted,
    };
    w.dispose();
    assert(!w.tiles.size);
  }
  {
    const x = 3108.788062,
      y = 2628.204176,
      [s] = await surface(x, y),
      hits = bedStones(s, x, y);
    await loadPatch(hits);
    for (const v of hits) {
      const g = staticModel("rock", v.name, ec.presets, v.lod, v.lith);
      v.meshShape = meshShape(g, "rock", v.scale);
      v.world = s.xyz(v.x, v.y, s.ground(v.x, v.y));
    }
    const group = rockWater(s, hits, uniforms),
      rocks = group.userData.contacts;
    assert(
      rocks.length >= 3 &&
        rocks.every(
          (r) =>
            r.depth > 0 && r.speed > 0 && r.perimeter >= 3 && r.triangles >= 8,
        ),
    );
    assert.equal(group.children.length, 2);
    const seen = new Set(),
      reaches = [];
    for (let j = -14; j <= 14; j += 0.19)
      for (let i = -14; i <= 14; i += 0.19) {
        const ch = s.channel(x + i, y + j);
        if (!ch || seen.has(ch.seg) || ch.dist > 0.6) continue;
        seen.add(ch.seg);
        const k = ch.seg,
          X = k.x + 0.5 * k.dx,
          Y = k.y + 0.5 * k.dy,
          fd = s.current(X, Y, 1, false);
        if (fd[2] <= 0) continue;
        const dx = fd[0],
          dy = -fd[1],
          drop =
            s.waterLevel(X - 1.1 * dx, Y - 1.1 * dy) -
            s.waterLevel(X + 1.1 * dx, Y + 1.1 * dy);
        if (Math.abs(drop) > 0.095) {
          assert(drop > 0);
          reaches.push([Math.abs(drop) / (2.2 * U * s.relief), fd[2]]);
        }
      }
    reaches.sort((a, b) => a[0] - b[0]);
    assert(reaches.length >= 3 && reaches[0][1] + 0.1 < reaches.at(-1)[1]);
    q.river = {
      reaches: reaches.length,
      gentle: reaches[0],
      steeper: reaches.at(-1),
      rockContacts: rocks.length,
      triangles: rocks.reduce((n, c) => n + c.triangles, 0),
    };
    disposeWater(group);
    const [l, g] = await surface(2549.125, 5571.625),
      active = g.children.find(
        (x) => x.userData.role === "continuous-water",
      ).geometry;
    let quiet = 0,
      tested = 0;
    const p = active.attributes.position,
      f = active.attributes.flow;
    for (let i = 0; i < p.count; i++) {
      if (
        Math.hypot(
          p.getX(i) - l.xyz(2549.125, 5571.625, 0)[0],
          p.getZ(i) - l.xyz(2549.125, 5571.625, 0)[2],
        ) > 100
      )
        continue;
      tested++;
      if (f.getZ(i) === 0 && f.getW(i) === 0) quiet++;
    }
    assert(quiet === tested && tested > 40);
    q.lake = { nearbyQuietWaterVertices: quiet };
  }
  {
    const [s, g] = await surface(5957.48, 3969.02),
      o = g.children[1].geometry,
      at = s.xyz(5957.48, 3969.02, 0);
    let near = 0,
      maxEdge = 0;
    const pos = o.attributes.position,
      fl = o.attributes.flow,
      d = o.attributes.depthM;
    for (let j = 0; j < o.index.count; j += 3) {
      const v = [0, 1, 2].map((i) => o.index.getX(j + i));
      if (
        !v.every(
          (i) =>
            fl.getW(i) > 0.99 &&
            Math.hypot(pos.getX(i) - at[0], pos.getZ(i) - at[2]) < 100 &&
            d.getX(i) > 0.8,
        )
      )
        continue;
      near++;
      for (let i = 0; i < 3; i++) {
        const a = v[i],
          b = v[(i + 1) % 3];
        maxEdge = Math.max(
          maxEdge,
          Math.hypot(pos.getX(a) - pos.getX(b), pos.getZ(a) - pos.getZ(b)),
        );
      }
    }
    assert(near > 180 && maxEdge < 5);
    q.coast = { nearbyMarineTriangles: near, largestEdgeM: maxEdge };
  }
  {
    const [s] = await surface(4639.21, 2198.65),
      site = findFall(
        s,
        ec.falls.find((x) => x.name === "Talakona Waterfalls"),
      ),
      fx = cascade(s, site, uniforms),
      rk = fallRocks(s, site, uniforms);
    assert(
      site.drop > 4 &&
        site.top > site.bottom &&
        site.feeder?.length >= 2 &&
        fx.children.length === 3 &&
        rk?.userData.role === "waterfall-rocks",
    );
    rk.geometry.dispose();
    rk.material.dispose();
    disposeWater(fx);
    // Verify plunge-pool mapped waterfalls (e.g. Etthipothala) also resolve before chunk() runs, and Nagarkurnool 66 m stage jump has zero vertical water walls.
    const et = ec.falls.find((x) => x.name === "Etthipothala Waterfalls"),
      tEt = new Tiles(a);
    await Promise.all(
      Array.from({ length: 9 }, (_, i) =>
        tEt.load(
          key(
            et.cell[0] + ((i % 3) - 1) * 256,
            et.cell[1] + (((i / 3) | 0) - 1) * 256,
          ),
        ),
      ),
    );
    const sEt = new Surface(
      tEt,
      { x: a.project.cols / 2, y: a.project.rows / 2, z: 0 },
      [et.cell[0] + 0.5, et.cell[1] + 0.5],
    );
    sEt.ec = ec;
    const etSite = findFall(sEt, et);
    assert(etSite && etSite.drop > 12 && etSite.feeder?.length >= 2);
    const [sNag, gNag] = await surface(3371.5, 5812.5),
      wNag = gNag.children.find(
        (o) => o.userData.role === "continuous-water",
      )?.geometry,
      spills = findStageFalls(sNag, 3371.5, 5812.5, []);
    let maxTiltDeg = 0;
    if (wNag) {
      const p = wNag.attributes.position,
        id = wNag.index.array;
      for (let k = 0; k < id.length; k += 3) {
        const i0 = id[k],
          i1 = id[k + 1],
          i2 = id[k + 2],
          v1 = new T.Vector3(
            p.getX(i1) - p.getX(i0),
            p.getY(i1) - p.getY(i0),
            p.getZ(i1) - p.getZ(i0),
          ),
          v2 = new T.Vector3(
            p.getX(i2) - p.getX(i0),
            p.getY(i2) - p.getY(i0),
            p.getZ(i2) - p.getZ(i0),
          ),
          n = new T.Vector3().crossVectors(v1, v2);
        if (n.lengthSq() > 1e-10)
          maxTiltDeg = Math.max(
            maxTiltDeg,
            (Math.atan2(Math.hypot(n.x, n.z), Math.abs(n.y)) * 180) / Math.PI,
          );
      }
    }
    assert(maxTiltDeg < 12 && spills.length >= 1 && spills[0].drop > 10);
    q.fall = {
      name: site.name,
      modelDropM: site.drop,
      etthipothalaDropM: etSite.drop,
      nagarkurnoolMaxWaterTiltDeg: maxTiltDeg,
      nagarkurnoolSpillways: spills.length,
      effects: fx.children.map((o) => o.userData.role),
    };
  }
  await loadPeople();
  q.rigs = {};
  for (const sex of ["woman", "man"]) {
    const r = traveller(sex),
      B = r.mesh.skeleton.bones,
      b = (n) => B.find((o) => o.name === n).position,
      poses = [];
    let asym = 0,
      legs = 0;
    for (let t = 0; t <= 1; t += 0.025) {
      r.pose({
        dt: 1 / 60,
        vel: 0,
        swim: false,
        ground: () => 0,
        at: [0, 0],
        yaw: 0,
        root: 0,
        air: 1,
        vertical: 5.8 - 11.6 * t,
        launchAge: t + 0.15,
      });
      const feet = ["L", "R"].map((i) => b("Foot" + i)),
        hips = b("Hips");
      asym = Math.max(asym, Math.abs(feet[1].y - feet[0].y));
      legs = Math.max(legs, Math.abs(feet[0].z - feet[1].z));
      assert(
        Math.abs(b("FootR").x - hips.x) < 0.29 &&
          Math.abs(b("FootL").z - hips.z) < 0.65 &&
          Math.abs(b("WristL").x - b("WristR").x) < 1.05,
      );
      poses.push(b("LowerLegL").z);
    }
    assert(
      asym < 0.45 &&
        legs < 0.7 &&
        Math.max(...poses) - Math.min(...poses) > 0.24,
    );
    const rain = (v, d, time) => {
      for (let i = 0; i < time * 10; i++)
        r.weather(v, d, d > 1, 0.1, i * 0.1, true);
      return r.metrics().clothing;
    };
    const dry = rain(0, 0, 1),
      wet = rain(0.91, 0, 14),
      airDry = rain(0, 0, 80),
      wade = rain(0, 0.64, 10);
    assert(
      dry.upper === 0 &&
        wet.upper > 0.94 &&
        wet.impacts > 0 &&
        airDry.impacts === 0 &&
        airDry.upper < wet.upper * 0.5 &&
        wade.hem > wade.upper + 0.4,
    );
    q.rigs[sex] = {
      maxAnkleHeightAsymmetry: asym,
      maxForeAftAnkleSeparation: legs,
      kneeTravel: Math.max(...poses) - Math.min(...poses),
      soaked: wet.upper,
      after80s: airDry.upper,
      wadedHem: wade.hem,
    };
    r.dispose();
  }
  console.log(JSON.stringify(q, null, 2));
} finally {
  await fs.rm(pub, { force: true, recursive: true });
}
