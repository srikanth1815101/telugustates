// Test the actual submitted marine apron and directional paths in metres, with the saved offline map. No browser/network required.
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
import { seaLift } from "../static/js/surf-zone.js";
import { driftMesh } from "../static/js/current-flecks.js";
import { headAt } from "../static/js/hydraulic-stage.js";
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

  const x = 5957.48,
    y = 3969.02,
    [s, g] = await surface(x, y),
    lineY = y - 0.016,
    at = s.xyz(x, lineY, 0),
    ww = g.children.find(
      (m) => m.userData.role === "continuous-water",
    ).geometry,
    p = ww.attributes.position,
    d = ww.attributes.depthM,
    F = ww.attributes.flow,
    line = [];
  let dry = 0;
  for (let k = 0; k < ww.index.count; k += 3) {
    let v = [0, 1, 2].map((i) => ww.index.getX(k + i));
    if (v.some((i) => F.getW(i) < 0.99)) continue;
    const xs = v.map((i) => p.getX(i)),
      zs = v.map((i) => p.getZ(i));
    if (
      Math.max(...xs) < at[0] - 20 ||
      Math.min(...xs) > at[0] + 80 ||
      Math.min(...zs) > at[2] ||
      Math.max(...zs) < at[2]
    )
      continue;
    const cross = [];
    for (let n = 0; n < 3; n++) {
      let j = (n + 1) % 3;
      if (zs[n] > at[2] === zs[j] > at[2]) continue;
      let u = (at[2] - zs[n]) / (zs[j] - zs[n]);
      cross.push({ u, a: v[n], b: v[j], x: xs[n] * (1 - u) + xs[j] * u });
    }
    if (cross.length === 2) line.push(cross);
    if (v.some((i) => d.getX(i) < -0.015)) dry++;
  }
  assert(dry > 0 && line.length > 12);
  let edge = [],
    wadeErr = [],
    signs = [];
  for (let t = 0; t <= 54; t += 0.1) {
    const height = (i) =>
      d.getX(i) +
      seaLift(p.getX(i) + s.offset[0], p.getZ(i) + s.offset[2], t, d.getX(i));
    s.liquidTime = t;
    let hits = [];
    for (const [a, b] of line) {
      const f = (v) => (1 - v.u) * height(v.a) + v.u * height(v.b),
        ha = f(a),
        hb = f(b);
      if (ha * hb > 0) continue;
      const f0 = ha / (ha - hb),
        m = a.x + (b.x - a.x) * f0,
        xx = s.o.x + m / U,
        bed = s.sample(xx, lineY);
      hits.push(m);
      wadeErr.push(s.waterContact(xx, lineY, bed).depth);
      signs.push(bed.line - bed.z);
    }
    assert(
      hits.length === 1,
      "single beach crossing at t=" + t + " got " + hits.length,
    );
    edge.push(hits[0] - at[0]);
  }
  const retreat = Math.max(...edge),
    advance = Math.min(...edge);
  let up = 0,
    down = 0;
  for (let i = 1; i < edge.length; i++) {
    up += edge[i] > edge[i - 1] + 0.005;
    down += edge[i] < edge[i - 1] - 0.005;
  }
  // One signed beach transect: its seaward coordinate grows during draw-back. Check complete half-cycles, not just whether any pixels change.
  const extremes = [];
  for (let i = 1; i < edge.length - 1; i++)
    if ((edge[i] - edge[i - 1]) * (edge[i + 1] - edge[i]) < 0) extremes.push(i);
  const advanceS = [],
    recedeS = [];
  for (let i = 1; i < extremes.length; i++) {
    const a = extremes[i - 1],
      b = extremes[i],
      travel = edge[b] - edge[a];
    if (Math.abs(travel) > 2)
      (travel > 0 ? recedeS : advanceS).push((b - a) * 0.1);
  }
  assert(advanceS.length >= 4 && recedeS.length >= 4);
  assert([...advanceS, ...recedeS].every((t) => t > 4.3 && t < 5.9));
  assert(Math.min(...recedeS) / Math.max(...advanceS) > 0.84);
  q.swash = {
    advanceS,
    recedeS,
    crossedTriangles: line.length,
    landwardTriangles: dry,
    observedTravelM: retreat - advance,
    wetDryStepCount: [up, down],
    rangeFromSpawnM: [advance, retreat],
    signedBedDepthAtEdgeM: [Math.min(...signs), Math.max(...signs)],
    maxBootDepthAtGpuContourM: Math.max(...wadeErr),
  };
  assert(
    up > 20 &&
      down > 20 &&
      retreat - advance > 3 &&
      retreat - advance < 30 &&
      Math.min(...signs) < -0.2 &&
      Math.max(...signs) > 0.2 &&
      q.swash.maxBootDepthAtGpuContourM < 0.14,
  );
  // Measuring wet area alone can pass on a flat sheet. Reconstruct a slice across the actual marine triangles and follow a ridge shoreward.
  const taps = Array.from({ length: 53 }, (_, i) => {
    const x = at[0] + 48 + i * 0.25;
    const seg = line.find(
      ([a, b]) =>
        x >= Math.min(a.x, b.x) - 1e-9 &&
        x <= Math.max(a.x, b.x) + 1e-9 &&
        Math.abs(b.x - a.x) > 1e-7,
    );
    assert(seg, "missing marine section");
    const [a, b] = seg,
      u = (x - a.x) / (b.x - a.x);
    return {
      v: [a.a, a.b, b.a, b.b],
      w: [(1 - u) * (1 - a.u), (1 - u) * a.u, u * (1 - b.u), u * b.u],
      x: x - at[0],
    };
  });
  const rows = [],
    tall = [],
    tracks = [];
  let lastPeak = null,
    track = [];
  for (let j = 0; j <= 300; j++) {
    const t = j * 0.15,
      values = taps.map(({ v, w }) =>
        v.reduce(
          (h, k, n) =>
            h +
            w[n] *
              seaLift(
                p.getX(k) + s.offset[0],
                p.getZ(k) + s.offset[2],
                t,
                d.getX(k),
              ),
          0,
        ),
      );
    rows.push(values[28]);
    const peaks = taps.filter(
      (v, i) =>
        i > 0 &&
        i + 1 < taps.length &&
        values[i] > 0.37 &&
        values[i] >= values[i - 1] &&
        values[i] > values[i + 1],
    );
    const pt = peaks.length
      ? peaks.reduce((a, b) =>
          lastPeak === null ||
          Math.abs(a.x - lastPeak) < Math.abs(b.x - lastPeak)
            ? a
            : b,
        ).x
      : null;
    if (pt === null || lastPeak === null || Math.abs(pt - lastPeak) > 2) {
      if (track.length > 1) tracks.push(track);
      track = [];
    }
    if (pt !== null) track.push([t, pt]);
    lastPeak = pt;
  }
  if (track.length) tracks.push(track);
  const lipExtrema = [];
  for (let i = 1; i < rows.length - 1; i++) {
    if (rows[i] >= rows[i - 1] && rows[i] > rows[i + 1])
      lipExtrema.push([1, rows[i]]);
    else if (rows[i] <= rows[i - 1] && rows[i] < rows[i + 1])
      lipExtrema.push([-1, rows[i]]);
  }
  for (let i = 1; i < lipExtrema.length; i++)
    if (lipExtrema[i - 1][0] > 0 && lipExtrema[i][0] < 0)
      tall.push(lipExtrema[i - 1][1] - lipExtrema[i][1]);
  const inlandLegs = tracks
    .map((tr) => tr[0][1] - tr.at(-1)[1])
    .filter((dist) => dist > 6);
  assert(tall.filter((h) => h > 1.15).length >= 3, "surf is flat at the staff");
  assert(
    inlandLegs.length >= 3,
    "high crests are not travelling towards the player",
  );
  q.surf = {
    stationFromSpawnM: 55,
    sampleS: 0.15,
    crestToFollowingTroughM: tall,
    shorewardCrestRunsM: inlandLegs,
  };
  const [r] = await surface(3108.788062, 2628.204176),
    [l] = await surface(2549.125, 5571.625),
    mesh = driftMesh(r, ...r.focus, 1, uniforms);
  assert(mesh?.userData.tracks.length > 6);
  assert(
    !driftMesh(l, ...l.focus, 0, uniforms),
    "a reservoir must not grow moving foamy river paths",
  );
  let progress = [];
  for (const [i, k] of mesh.userData.tracks.entries()) {
    const p = (key) => {
      const vec = mesh.geometry.attributes[key];
      return [vec.getX(i * 4), vec.getY(i * 4), vec.getZ(i * 4)];
    };
    const A = ["position", "nextB", "nextC", "lastD"].map(p);
    for (let n = 0; n < 3; n++) {
      const a = A[n],
        b = A[n + 1],
        dx = b[0] - a[0],
        dz = b[2] - a[2];
      const xx = r.o.x + a[0] / U,
        yy = r.o.y - a[2] / U,
        c = r.current(xx, yy, 1, false);
      assert(r.sample(xx, yy).depth > 0.1 && c[2] > 0.09);
      const speed = Math.hypot(dx, dz) / (k.life / 3),
        pr = (dx * c[0] + dz * c[1]) / (k.life / 3);
      assert(pr > 0 && pr > 0.72 * speed, "moving upstream");
      progress.push(pr);
    }
  }
  q.flow = {
    paths: mesh.userData.tracks.length,
    downstreamLegs: progress.length,
    projectedMps: [Math.min(...progress), Math.max(...progress)],
    reservoirPaths: 0,
  };
  const [gorge] = await surface(2710, 3565);
  let thread = false;
  for (let j = -2; j < 2 && !thread; j += 0.11)
    for (let i = -2; i < 2; i += 0.11) {
      const X = 2710 + i,
        Y = 3565 + j;
      if (
        headAt(gorge, X, Y)?.pool &&
        gorge.point(X, Y).depth > 0 &&
        gorge.current(X, Y, 1, false)[2] > 0.16
      ) {
        thread = [X, Y];
        break;
      }
    }
  assert(thread);
  q.levelMappedThread = thread;
  console.log(JSON.stringify(q, null, 2));
} finally {
  await fs.rm(pub, { recursive: true, force: true });
}
