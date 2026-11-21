// Measure the submitted water triangles, not the blue colour or the underlying wet DEM. Optional --compare PROJECT_DIR tests earlier assets with identical fixtures.
import fs from "node:fs/promises";
import os from "node:os";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const compare = process.argv[2] === "--compare",
  root = compare
    ? path.resolve(process.argv[3])
    : fileURLToPath(new URL("../", import.meta.url)),
  pub = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-stages-check-")),
  dir = path.join(root, "static"),
  M = 63.615,
  r = {};
try {
  execFileSync("hugo", ["--source", root, "--destination", pub, "--minify"]);
  globalThis.fetch = async (u) =>
    new Response(
      await fs.readFile(path.join(pub, path.relative(dir, fileURLToPath(u)))),
    );
  const module = (k) => import(pathToFileURL(path.join(dir, k))),
    { Surface, chunk } = await module("js/terrain.js"),
    { Tiles, get, key } = await module("js/grid.js"),
    T = await module("vendor/three.module.min.js"),
    { ecology } = await module("js/ecodata.js"),
    e = await ecology(),
    a = await get("data/atlas.json"),
    mat = new T.MeshBasicMaterial();
  for (const [name, x, y, h] of [
    ["Inlet", 3378, 5779, 262],
    ["Gorge", 2754, 3567, 191],
    ["Reservoir", 2528, 5569, 262],
    ["Reach", 3108.788062, 2628.204176, null],
  ]) {
    const t = new Tiles(a);
    await Promise.all(
      Array.from({ length: 9 }, (_, n) =>
        t.load(key(x + ((n % 3) - 1) * 256, y + (Math.floor(n / 3) - 1) * 256)),
      ),
    );
    const S = new Surface(
      t,
      { x: a.project.cols / 2, y: a.project.rows / 2, z: 0 },
      [x, y],
    );
    S.ec = e;
    S.relief = 1.2;
    S.surveyGrid = true;
    S.focus = [x, y];
    let v = [],
      width = [],
      along = [],
      norm = [],
      bed = [];
    let tris = 0;
    for (let j = Math.floor((y - 12) / 64); j <= Math.floor((y + 12) / 64); j++)
      for (
        let i = Math.floor((x - 12) / 64);
        i <= Math.floor((x + 12) / 64);
        i++
      ) {
        const g = chunk(S, i, j, 1, { land: mat, water: mat }, true),
          w = g.children.find(
            (o) => o.userData.role === "continuous-water",
          )?.geometry;
        if (w) {
          const p = w.attributes.position,
            id = w.index.array;
          for (let k = 0; k < id.length; k += 3) {
            const vtx = [id[k], id[k + 1], id[k + 2]],
              pt = vtx.map((b) => [
                S.o.x + p.getX(b) / M,
                S.o.y - p.getZ(b) / M,
                p.getY(b),
              ]),
              X = pt.reduce((n, b) => n + b[0] / 3, 0),
              Y = pt.reduce((n, b) => n + b[1] / 3, 0);
            if (Math.hypot(X - x, Y - y) > 12) continue;
            const s = S.sample(X, Y);
            if (!s.drawn || s.w < 0.0001) continue;
            tris++;
            const z = pt.reduce((n, b) => n + b[2] / 3, 0);
            bed.push(Math.abs(s.line + 0.008 - z));
            v.push((z - 0.008) / S.relief);
            const n = new T.Vector3().crossVectors(
              new T.Vector3(
                (pt[1][0] - pt[0][0]) * M,
                pt[1][2] - pt[0][2],
                (pt[1][1] - pt[0][1]) * M,
              ),
              new T.Vector3(
                (pt[2][0] - pt[0][0]) * M,
                pt[2][2] - pt[0][2],
                (pt[2][1] - pt[0][1]) * M,
              ),
            );
            norm.push(
              (Math.atan2(Math.hypot(n.x, n.z), Math.abs(n.y)) * 180) / Math.PI,
            );
          }
        }
        g.traverse((o) => o.geometry?.dispose());
      }
    const quant = (v, f) =>
      [...v].sort((a, b) => a - b)[
        Math.min(v.length - 1, Math.floor(v.length * f))
      ];
    const stats = {
      triangles: tris,
      modelDatumRange: [quant(v, 0), quant(v, 1)],
      modelRiseM: quant(v, 1) - quant(v, 0),
      renderedRiseM: (quant(v, 1) - quant(v, 0)) * S.relief,
      triangleTiltP95Deg: quant(norm, 0.95),
      p99ContactErrorM: quant(bed, 0.99),
    };
    if (h === null) {
      const seen = new Set();
      for (let j = -14; j < 14; j += 0.17)
        for (let i = -14; i < 14; i += 0.17) {
          const c = S.channel(x + i, y + j);
          if (!c || seen.has(c.seg)) continue;
          seen.add(c.seg);
          const t = c.seg,
            d = t.L,
            dx = t.dx / d,
            dy = t.dy / d,
            X = t.x + t.dx * 0.5,
            Y = t.y + t.dy * 0.5;
          const r = Math.min(0.9, t.half * 0.57),
            pts = [-r, 0, r].map((n) => S.point(X - dy * n, Y + dx * n));
          if (pts.some((p) => p.w < 0)) continue;
          const cur = S.current(X, Y, 1, false);
          if (cur[2] > 0.01) {
            width.push(
              (Math.max(...pts.map((p) => p.line)) -
                Math.min(...pts.map((p) => p.line))) /
                S.relief,
            );
            along.push(cur[2]);
          }
        }
      stats.crossSections = width.length;
      stats.p90AcrossRiseM = quant(width, 0.9);
      stats.maxCurrentMps = quant(along, 1);
      if (!compare)
        assert(
          width.length > 30 &&
            stats.maxCurrentMps > 0.25 &&
            stats.p90AcrossRiseM < 0.18,
        );
    }
    r[name] = stats;
    console.error(name, stats);
    if (!compare && h !== null)
      assert(
        tris > 80 &&
          stats.modelRiseM < 0.02 &&
          Math.abs(quant(v, 0.5) - h) < 0.03 &&
          stats.triangleTiltP95Deg < 0.02,
      );
    assert(tris > 20 && stats.p99ContactErrorM < 0.003);
  }
  console.log(JSON.stringify(r, null, 2));
} finally {
  await fs.rm(pub, { recursive: true, force: true });
}
