// Independent vertical intersections against the actual indexed buffers. No calls to Surface.ground in the oracle.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as T from "../static/vendor/three.module.min.js";
import { get, xy, Tiles, key } from "../static/js/grid.js";
import { Surface, chunk } from "../static/js/terrain.js";
import { EcologyScene } from "../static/js/ecoscene.js";
import { ecology } from "../static/js/ecodata.js";
import { traveller } from "../static/js/traveller.js";
import { ACRE as U } from "../static/js/metres.js";
globalThis.requestAnimationFrame = (cb) => setImmediate(cb);
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadPeople } from "../static/js/art-library.js";
const root = fileURLToPath(new URL("../", import.meta.url)),
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-scene-"));
try {
  execFileSync("hugo", ["--source", root, "--destination", tmp, "--minify"]);
  const staticDir = path.join(root, "static");
  globalThis.fetch = async (u) => {
    const key = path.relative(staticDir, fileURLToPath(u));
    if (key.startsWith("..") || path.isAbsolute(key))
      throw Error("Unexpected fixture path: " + key);
    return new Response(await fs.readFile(path.join(tmp, key)));
  };
  await loadPeople();
  const [a, eco, stops] = await Promise.all([
      get("data/atlas.json"),
      ecology(),
      get("ecology/stops.json"),
    ]),
    O = { x: a.project.cols / 2, y: a.project.rows / 2, z: 0 },
    t = new Tiles(a),
    mats = {
      land: new T.MeshBasicMaterial(),
      water: new T.MeshBasicMaterial(),
    },
    report = {
      sites: 0,
      trees: 0,
      surfaceTests: 0,
      rootGaps: 0,
      maxBasisCosine: 0,
      maxRelativeStretch: 0,
      latestBoots: 0,
      steepestGrade: 0,
      bootVertices: 0,
      maxSurfaceErrorM: 0,
      maxStandingSoleGapAtBankM: 0,
      bankTiers: [],
    };
  const bank = xy(a.project, 78.371004, 16.038845),
    sites = [
      ...a.districts.map((d) => [
        d.name,
        d.anchor[0] + 0.5,
        d.anchor[1] + 0.5,
        0,
      ]),
      ...stops.map((s) => [
        s.id,
        ...(s.point || s.cell.map((i) => i + 0.5)),
        1,
      ]),
      ...[0, 1, 2].flatMap((t) => [
        ["report", ...bank, t],
        ["shallows", 2549.125, 5571.625, t],
      ]),
    ];
  for (const [name, x, y, tier] of sites) {
    const cx = Math.floor(x / 64),
      cy = Math.floor(y / 64),
      keep = new Set();
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) keep.add(key(x + i * 80, y + j * 80));
    await Promise.all([...keep].map((k) => t.load(k)));
    t.trim(keep);
    const S = new Surface(t, O, [x, y]);
    S.ec = eco;
    S.focus = [x, y];
    const tiles = chunk(S, cx, cy, 1, mats, tier === 0),
      land = tiles.children[0],
      geo = land.geometry,
      ind = geo.index.array,
      ps = geo.attributes.position.array,
      boxes = new Map(),
      tag = (x, z) => Math.floor(x / 64) + ":" + Math.floor(z / 64);
    for (let i = 0; i < ind.length; i += 3) {
      const coords = [ind[i], ind[i + 1], ind[i + 2]].map((k) =>
        ps.subarray(3 * k, 3 * k + 3),
      );
      const ax = coords.map((q) => q[0]),
        az = coords.map((q) => q[2]);
      for (
        let j = Math.floor(Math.min(...az) / 64);
        j <= Math.floor(Math.max(...az) / 64);
        j++
      )
        for (
          let k = Math.floor(Math.min(...ax) / 64);
          k <= Math.floor(Math.max(...ax) / 64);
          k++
        ) {
          const key = k + ":" + j;
          (boxes.get(key) || boxes.set(key, []).get(key)).push(i);
        }
    }
    const ray = (X, Z) => {
      for (let k of boxes.get(tag(X, Z)) || []) {
        const [A, B, C] = [ind[k], ind[k + 1], ind[k + 2]].map((i) =>
            ps.subarray(3 * i, 3 * i + 3),
          ),
          bx = B[0] - A[0],
          bz = B[2] - A[2],
          cx = C[0] - A[0],
          cz = C[2] - A[2],
          d = bx * cz - bz * cx,
          u = ((X - A[0]) * cz - (Z - A[2]) * cx) / d,
          v = (bx * (Z - A[2]) - bz * (X - A[0])) / d;
        if (u >= -1e-6 && v >= -1e-6 && u + v <= 1.000001)
          return A[1] + u * (B[1] - A[1]) + v * (C[1] - A[1]);
      }
      return NaN;
    };
    const b = new EcologyScene(S, eco, [], {}, tier, {
      season: "winter",
      time: "day",
    });
    await b.build(x, y);
    for (const v of b.statics.filter(
      (q) => q.kind === "tree" && Math.hypot(q.x - x, q.y - y) * U < 110,
    )) {
      const M = new T.Matrix4().fromArray(v.matrix),
        X = M.elements[12],
        Z = M.elements[14],
        z = ray(X, Z);
      const axes = [0, 1, 2].map((j) =>
        new T.Vector3().setFromMatrixColumn(M, j),
      );
      const sc = v.scale;
      report.steepestGrade = Math.max(
        report.steepestGrade,
        Math.hypot(...S.gradeAt(v.x, v.y)),
      );
      for (let i = 0; i < 3; i++) {
        report.maxRelativeStretch = Math.max(
          report.maxRelativeStretch,
          Math.abs(axes[i].length() / sc - 1),
        );
        for (let j = 0; j < i; j++)
          report.maxBasisCosine = Math.max(
            report.maxBasisCosine,
            Math.abs(axes[i].dot(axes[j]) / sc ** 2),
          );
      }
      assert(Number.isFinite(z), name + " missing ground triangle");
      report.maxSurfaceErrorM = Math.max(
        report.maxSurfaceErrorM,
        Math.abs(z - M.elements[13]),
      );
      report.surfaceTests++;
      report.trees++;
      // Inspect the transformed wood vertices closest to the roots, not only the instance's anchor coordinate.
      const bin = b.bins.find((k) => k.a.includes(v)),
        pos = bin.geom.attributes.position;
      let lowest = Infinity;
      const vec = new T.Vector3();
      for (let i = 0; i < pos.count; i += 1) {
        if (pos.getY(i) > 0.035) continue;
        vec.fromBufferAttribute(pos, i).applyMatrix4(M);
        const ground = ray(vec.x, vec.z);
        if (Number.isFinite(ground)) lowest = Math.min(lowest, vec.y - ground);
      }
      if (lowest > 0.006) report.rootGaps++;
    }
    if (["report", "shallows"].includes(name)) {
      report.bankTiers.push(tier);
      for (const style of ["man", "woman"])
        for (const yaw of [1.501878 - Math.PI, 0, Math.PI / 2, Math.PI]) {
          const r = traveller(style),
            mesh = r.group.children[0],
            root = S.ground(x, y),
            loc = S.xyz(x, y, root);
          for (let j = 0; j < 70; j++)
            r.pose({
              dt: 1 / 60,
              vel: 0,
              depth: 0,
              air: 0,
              swim: false,
              ground: ([X, Z]) => S.ground(x + X / U, y - Z / U),
              root,
              at: [0, 0],
              yaw,
            });
          mesh.updateMatrixWorld(true);
          const gp = mesh.geometry.attributes,
            feet = { FootL: Infinity, FootR: Infinity };
          for (let i = 0; i < gp.position.count; i++) {
            const n = mesh.skeleton.bones[gp.skinIndex.getX(i)].name;
            if (!(n in feet)) continue;
            const v = mesh.getVertexPosition(i, new T.Vector3()),
              X = loc[0] + v.x * Math.cos(yaw) + v.z * Math.sin(yaw),
              Z = loc[2] - v.x * Math.sin(yaw) + v.z * Math.cos(yaw);
            feet[n] = Math.min(feet[n], v.y + root - ray(X, Z));
            report.bootVertices++;
            if (name === "shallows") report.latestBoots++;
          }
          report.maxStandingSoleGapAtBankM = Math.max(
            report.maxStandingSoleGapAtBankM,
            ...Object.values(feet).map(Math.abs),
          );
          r.dispose();
        }
    }
    report.sites++;
    b.dispose();
    for (const m of tiles.children) m.geometry.dispose();
  }
  console.log(JSON.stringify(report, null, 2));
  assert(report.trees > 1200);
  assert.equal(report.rootGaps, 0);
  assert(report.maxSurfaceErrorM < 0.002);
  assert(report.maxStandingSoleGapAtBankM < 0.0025);

  assert(
    report.maxBasisCosine < 1e-6 &&
      report.maxRelativeStretch < 1e-6 &&
      report.latestBoots > 1000,
  );
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}
