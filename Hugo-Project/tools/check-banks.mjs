// Compare actual submitted water boundaries with an independent fine scan of the continuous atlas water field.
// No image matching, replacement renderer or GPU needed. The scan misses features smaller than its spacing.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const root = fileURLToPath(new URL("../", import.meta.url)),
  pub = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-banks-")),
  report = {};
try {
  execFileSync("hugo", ["--source", root, "--destination", pub, "--minify"]);
  const moduleAt = (k) => import(pathToFileURL(path.join(root, "static", k)));
  const { get, Tiles, key } = await moduleAt("js/grid.js"),
    { Surface, chunk } = await moduleAt("js/terrain.js"),
    { ecology } = await moduleAt("js/ecodata.js"),
    { ACRE: M } = await moduleAt("js/metres.js"),
    T = await moduleAt("vendor/three.module.min.js");
  globalThis.fetch = async (u) =>
    new Response(
      await fs.readFile(
        path.join(
          pub,
          path.relative(path.join(root, "static"), fileURLToPath(u)),
        ),
      ),
    );
  const atlas = await get("data/atlas.json"),
    ec = await ecology(),
    m = new T.MeshBasicMaterial();
  let totals = 0;
  for (const [id, x, y, light] of [
    ["valley", 2709, 3565, true],
    ["reservoir", 2528, 5569, true],
    ["stream", 3117, 2617, true],
    ["tributaries", 3232, 2720, true],
    ["valleyFine", 2714.4, 3568.25, false],
  ]) {
    const tiles = new Tiles(atlas);
    await Promise.all(
      Array.from({ length: 9 }, (_, i) =>
        tiles.load(key(x + ((i % 3) - 1) * 256, y + (((i / 3) | 0) - 1) * 256)),
      ),
    );
    const s = new Surface(
      tiles,
      { x: atlas.project.cols / 2, y: atlas.project.rows / 2, z: 0 },
      [x, y],
    );
    s.focus = [x, y];
    s.ec = ec;
    s.surveyGrid = light && id !== "tributaries";
    const cx = Math.floor(x / 64),
      cy = Math.floor(y / 64),
      bin = new Map(),
      groups = new Map(),
      stats = {
        maxContactM: 0,
        borderEdges: 0,
        triangles: 0,
        bankSegments: 0,
        crossings: 0,
        visibleChannels: 0,
        channelSites: 0,
        vectorOnly: 0,
        visibleVectorOnly: 0,
      },
      lengths = [],
      distances = [],
      seamTolerance = 0.003;
    let build = performance.now();
    function edge(x1, y1, x2, y2) {
      const s = [x1, y1, x2, y2];
      for (
        let j = Math.floor(Math.min(y1, y2) / 4);
        j <= Math.floor(Math.max(y1, y2) / 4);
        j++
      )
        for (
          let i = Math.floor(Math.min(x1, x2) / 4);
          i <= Math.floor(Math.max(x1, x2) / 4);
          i++
        ) {
          const k = i + "," + j;
          (bin.get(k) || bin.set(k, []).get(k)).push(s);
        }
    }
    function near(x, y) {
      let d = Infinity;
      const I = Math.floor(x / 4),
        J = Math.floor(y / 4);
      for (let z = 0; z <= 12; z++) {
        for (let j = J - z; j <= J + z; j++)
          for (let i = I - z; i <= I + z; i++) {
            if (z && Math.max(Math.abs(j - J), Math.abs(i - I)) !== z) continue;
            for (const l of bin.get(i + "," + j) || []) {
              const a = x - l[0],
                b = y - l[1],
                dx = l[2] - l[0],
                dy = l[3] - l[1],
                t = Math.min(
                  1,
                  Math.max(0, (a * dx + b * dy) / (dx * dx + dy * dy)),
                );
              d = Math.min(d, (a - dx * t) ** 2 + (b - dy * t) ** 2);
            }
          }
        if (d < (z * 4) ** 2) break;
      }
      return Math.sqrt(d) * M;
    }
    for (let j = cy - 1; j <= cy + 1; j++)
      for (let i = cx - 1; i <= cx + 1; i++) {
        const step = i === cx && j === cy ? 1 : light ? 8 : 2,
          g = chunk(s, i, j, step, { land: m, water: m }, light),
          borders = {};
        groups.set(i + "," + j, borders);
        for (const o of g.children) {
          const geo = o.geometry,
            ix = geo.index.array,
            pos = geo.attributes.position,
            S = pos.count,
            water = o.userData.role === "continuous-water",
            X = (v) => s.o.x + pos.getX(v) / M,
            Y = (v) => s.o.y - pos.getZ(v) / M,
            edges = new Map();
          stats.triangles += ix.length / 3;
          const arr = (borders[o.userData.role] = [[], [], [], []]),
            box = [i * 64, j * 64, (i + 1) * 64, (j + 1) * 64];
          for (
            let h = 0;
            h < (geo.userData.meanIndexCount ?? ix.length);
            h += 3
          ) {
            for (let l = 0; l < 3; l++) {
              const a = ix[h + l],
                b = ix[h + ((l + 1) % 3)],
                k = Math.min(a, b) * S + Math.max(a, b);
              if (edges.has(k)) edges.delete(k);
              else edges.set(k, [a, b]);
            }
          }
          for (const [a, b] of edges.values()) {
            const x1 = X(a),
              y1 = Y(a),
              x2 = X(b),
              y2 = Y(b),
              side = box.findIndex(
                (v, k) =>
                  Math.max(
                    Math.abs((k % 2 ? y1 : x1) - v),
                    Math.abs((k % 2 ? y2 : x2) - v),
                  ) < 0.000015,
              );
            if (side >= 0) {
              const a1 = side % 2 ? x1 : y1,
                b1 = side % 2 ? x2 : y2;
              arr[side].push(
                a1 < b1
                  ? [a1, b1, pos.getY(a), pos.getY(b)]
                  : [b1, a1, pos.getY(b), pos.getY(a)],
              );
              continue;
            }
            if (
              !water ||
              geo.attributes.depthM.getX(a) > 0.001 ||
              geo.attributes.depthM.getX(b) > 0.001
            )
              continue;
            edge(x1, y1, x2, y2);
            lengths.push(M * Math.hypot(x2 - x1, y2 - y1));
            stats.bankSegments++;
            const p = s.sample((x1 + x2) * 0.5, (y1 + y2) * 0.5),
              line = (pos.getY(a) + pos.getY(b)) * 0.5 - 0.008;
            if (p.drawn)
              stats.maxContactM = Math.max(
                stats.maxContactM,
                Math.abs(p.z - line),
              );
          }
          geo.dispose();
        }
      }
    stats.buildAndExtractMs = Math.round(performance.now() - build);
    let seamIssues = 0;
    for (let j = cy - 1; j <= cy + 1; j++)
      for (let i = cx - 1; i <= cx + 1; i++)
        for (const [side, di, dj] of [
          [2, 1, 0],
          [3, 0, 1],
        ]) {
          const b = groups.get(i + di + "," + (j + dj));
          if (!b) continue;
          const a = groups.get(i + "," + j);
          for (const k of ["natural-terrain", "continuous-water"]) {
            const A = a[k]?.[side] || [],
              B = b[k]?.[side - 2] || [],
              sort = (a, b) => a[0] - b[0] || a[1] - b[1];
            A.sort(sort);
            B.sort(sort);
            stats.borderEdges += Math.max(A.length, B.length);
            if (A.length !== B.length) {
              seamIssues++;
              continue;
            }
            for (let l = 0; l < A.length; l++)
              if (
                A[l].some(
                  (v, k) =>
                    Math.abs(v - B[l][k]) * (k < 2 ? M : 1) > seamTolerance,
                )
              )
                seamIssues++;
          }
        }
    stats.seamIssues = seamIssues;
    const field = (x, y) => {
      const [r, e] = s.mask(x, y);
      if (e >= 0.1 || r >= 0.999) return r - 0.385;
      const c = s.channel(x, y),
        t = c
          ? Math.max(0, Math.min(1, (c.dist / c.seg.half - 0.12) / 1.46))
          : 1;
      return (
        Math.max(r, (c?.seg.width ? 0.91 : 0.66) * (1 - t * t * (3 - 2 * t))) -
        0.385
      );
    };
    for (let axis = 0; axis < 2; axis++)
      for (let b = -32.931; b < 33; b += 0.607) {
        const test = (a) => (axis ? field(x + b, y + a) : field(x + a, y + b));
        let lo = -32.996,
          wet = test(lo) >= 0;
        for (let a = lo + 0.094; a < 33; lo = a, a += 0.094) {
          const hit = test(a) >= 0;
          if (wet !== hit) {
            let l = lo,
              r = a;
            for (let z = 0; z < 10; z++) {
              const c = (l + r) * 0.5;
              if (test(c) >= 0 === wet) l = c;
              else r = c;
            }
            const h = (l + r) * 0.5;
            distances.push(near(x + (axis ? b : h), y + (axis ? h : b)));
            stats.crossings++;
          }
          wet = hit;
        }
      }
    const seen = new Set();
    s.channel(x, y);
    for (const items of s.flowIndex.values())
      for (const seg of items) {
        if (
          seen.has(seg) ||
          seg.half > 0.55 ||
          Math.abs(seg.x - x) > 35 ||
          Math.abs(seg.y - y) > 35
        )
          continue;
        seen.add(seg);
        for (const t of [0.19, 0.49, 0.79]) {
          const X = seg.x + seg.dx * t,
            Y = seg.y + seg.dy * t;
          const r = s.mask(X, Y)[0];
          if (r > 0.8 || field(X, Y) < 0.16 || !s.traversable(X, Y)) continue;
          stats.channelSites++;
          const p = s.sample(X, Y);
          const visible = p.drawn && p.w > 0 && p.depth > 0.00001;
          if (visible) stats.visibleChannels++;
          if (r < 0.385) {
            stats.vectorOnly++;
            if (visible) stats.visibleVectorOnly++;
          }
        }
      }
    const quant = (v, f) =>
      +v.sort((a, b) => a - b)[Math.floor(f * (v.length - 1))].toFixed(3);
    stats.errorM = {
      median: quant(distances, 0.5),
      p95: quant(distances, 0.95),
      max: quant(distances, 1),
    };
    stats.bankChordM = { p95: quant(lengths, 0.95), max: quant(lengths, 1) };
    report[id] = stats;
    totals += stats.channelSites;
  }
  // Only local atlas files; verify the coverage index and independent page lengths.
  const base = path.join(pub, "survey/banks");
  const chart = JSON.parse(await fs.readFile(path.join(base, "index.json")));
  for (const [name, sha] of Object.entries(chart.pages)) {
    const bytes = await fs.readFile(path.join(base, name + ".bin.gz"));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), sha);
    assert.equal(gunzipSync(bytes).length, 512 * 512);
  }
  report.chart = {
    pages: Object.keys(chart.pages).length,
    texelM: chart.cellMetres,
  };
  console.log(JSON.stringify(report, null, 2));
  for (const k of [
    "valley",
    "valleyFine",
    "reservoir",
    "stream",
    "tributaries",
  ]) {
    const v = report[k];
    assert(v.seamIssues === 0 && v.borderEdges > 100, k + " seams");
    assert(v.crossings > 100 && v.errorM.p95 < 9, k + " contour");
    assert(v.maxContactM < 0.05, k + " contact");
    assert(
      !v.channelSites || v.visibleChannels / v.channelSites > 0.99,
      k + " centreline",
    );
  }
  assert(totals > 100 && report.tributaries.vectorOnly > 10);
} finally {
  await fs.rm(pub, { recursive: true, force: true });
}
