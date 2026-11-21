import * as T from "../vendor/three.module.min.js";
import { ACRE as U } from "./metres.js";
export function fieldType(c, roll = 0.5) {
  if (
    !c?.d ||
    [3, 4, 5].includes(c.c) ||
    c.crop < 52 ||
    c.f > 38 ||
    c.built > 30 ||
    c.marsh > 30 ||
    c.mangrove > 15 ||
    c.s > 9 ||
    c.z > 1150
  )
    return null;
  const flat = c.s <= 4;
  if (flat && c.coast < 65 && c.z < 65 && c.rain > 1.4) return "paddy";
  if (flat && c.rain > 3.2 && c.soil !== 0)
    return roll < 0.53 ? "paddy" : "maize";
  return ["cotton", "maize", "chilli", "sunflower"][
    (Math.floor(roll * 4) + (c.soil === 6 ? 1 : 0)) % 4
  ];
}
export function stage(year, seed) {
  const k = (year * 2 + seed * 0.13) % 1;
  return k < 0.1
    ? "prepared"
    : k < 0.22
      ? "planting"
      : k < 0.61
        ? "growing"
        : k < 0.79
          ? "mature"
          : k < 0.9
            ? "harvest"
            : "fallow";
}
const h = (a, b) => {
  let n = Math.sin(a * 48.13 + b * 71.37) * 43758.54;
  return n - Math.floor(n);
};
// The route mask clips subfields, not whole acre cells. Never draw a planted bed across the walking surface.
function intersects(x, y, X, Y, seg, pad) {
  let [a, b] = seg,
    t0 = 0,
    t1 = 1;
  for (const [min, max, j] of [
    [x - pad, X + pad, 0],
    [y - pad, Y + pad, 1],
  ]) {
    const u = a[j],
      d = b[j] - u;
    if (Math.abs(d) < 1e-9) {
      if (u < min || u > max) return false;
      continue;
    }
    const t = (min - u) / d,
      T = (max - u) / d;
    t0 = Math.max(t0, Math.min(t, T));
    t1 = Math.min(t1, Math.max(t, T));
    if (t0 > t1) return false;
  }
  return true;
}
export function farms(s, centre, tier, year, paths = []) {
  const p = [],
    co = [],
    ix = [],
    fields = [],
    base = {
      prepared: 0x775e40,
      planting: 0x879e82,
      growing: 0x729a48,
      mature: 0xc6b052,
      harvest: 0xa58e51,
      fallow: 0xa09165,
    };
  const V = (x, y, z, c) => {
    p.push(...s.xyz(x, y, z));
    co.push(c.r, c.g, c.b);
    return p.length / 3 - 1;
  };
  let R = tier ? 4 : 3,
    segments = [];
  for (const path of paths)
    for (let i = 1; i < path.xy.length; i++) {
      const a = path.xy[i - 1],
        b = path.xy[i];
      if (
        Math.min(a[0], b[0]) <= centre.x + R + 2 &&
        Math.max(a[0], b[0]) >= centre.x - R - 2 &&
        Math.min(a[1], b[1]) <= centre.y + R + 2 &&
        Math.max(a[1], b[1]) >= centre.y - R - 2
      )
        segments.push([a, b, (path.w * 0.5 + 0.5) / U]);
    }
  for (let i = -R; i <= R; i++)
    for (let j = -R; j <= R; j++) {
      const x = Math.floor(centre.x) + i,
        y = Math.floor(centre.y) + j;
      if (s.homeMap.has(x + "," + y)) continue;
      const t = s.t.at(x + 0.5, y + 0.5);
      if (!t) continue;
      const roll = h(x, y),
        c = { ...t, ...s.ec.at(x, y) },
        type = fieldType(c, roll);
      if (!type || roll > 0.93) continue;
      const season = stage(year, h(x >> 1, y >> 1)),
        col = new T.Color(base[season]);
      col.offsetHSL((roll - 0.5) * 0.038, 0, (roll - 0.5) * 0.07);
      const range = Math.hypot(i, j),
        beds =
          tier === 2
            ? range < 2
              ? 11
              : 5
            : tier === 1
              ? range < 2
                ? 8
                : 4
              : range < 1.6
                ? 6
                : 3,
        plant =
          range < (tier ? 3.4 : 2) && !["fallow", "prepared"].includes(season);
      let candidates = segments.filter((z) =>
          intersects(x, y, x + 1, y + 1, z, z[2]),
        ),
        parts = candidates.length ? 3 : 1;
      let count = 0;
      for (let px = 0; px < parts; px++)
        for (let py = 0; py < parts; py++) {
          const x0 = x + (px + 0.04) / parts,
            y0 = y + (py + 0.04) / parts,
            w = 0.91 / parts;
          if (
            candidates.some((z) =>
              intersects(x0, y0, x0 + w, y0 + w, z, z[2] + 0.018),
            )
          )
            continue;
          const warp = (u, v) => [
            x0 + w * (u + 0.014 * Math.sin(y * 0.64 + u * 2 + v * 3)),
            y0 + w * (v + 0.014 * Math.sin(x * 0.41 + v * 2 + u * 3)),
          ];
          if (
            [
              [0, 0],
              [0, 1],
              [1, 1],
              [1, 0],
              [0.5, 0.5],
            ].some(([u, v]) => s.sample(...warp(u, v)).depth > 0.035)
          )
            continue;
          count++;
          const rows = Math.max(2, Math.round(beds / parts)),
            n = range < 1.9 ? 3 : 1;
          const water =
            type === "paddy" && ["planting", "growing"].includes(season);
          for (let row = 0; row < rows; row++) {
            const a = row / rows,
              b = (row + 1) / rows - 0.009;
            let start = p.length / 3;
            for (let k = 0; k <= n; k++)
              for (const v of [a, b]) {
                const [X, Y] = warp(k / n, v),
                  z = s.ground(X, Y);
                let bed = col.clone().multiplyScalar(0.88 + 0.15 * h(row, k));
                if (water)
                  bed.lerp(
                    new T.Color(0x98b7a0),
                    season === "planting" ? 0.6 : 0.22,
                  );
                V(X, Y, z + 0.055, bed);
              }
            for (let k = 0; k < n; k++) {
              const a = start + 2 * k;
              ix.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
            }
            if (!plant) continue;
            const v = (a + b) / 2,
              stripe = col
                .clone()
                .multiplyScalar(season === "mature" ? 1.18 : 1.09),
              hh =
                season === "planting"
                  ? 0.16
                  : season === "harvest"
                    ? 0.11
                    : type === "maize"
                      ? 0.84
                      : 0.52;
            start = p.length / 3;
            for (let k = 0; k <= n; k++) {
              const [X, Y] = warp(k / n, v),
                z = s.ground(X, Y);
              V(X, Y - 0.01, z + 0.06, stripe);
              V(X, Y, z + hh, stripe);
              V(X, Y + 0.01, z + 0.06, col);
            }
            for (let k = 0; k < n; k++) {
              let a = start + k * 3;
              ix.push(
                a,
                a + 1,
                a + 3,
                a + 1,
                a + 4,
                a + 3,
                a + 1,
                a + 2,
                a + 4,
                a + 4,
                a + 2,
                a + 5,
              );
            }
            if (range < 1.65 && hh > 0.2) {
              const leaf = new T.Color(
                type === "paddy"
                  ? 0x83aa48
                  : type === "chilli"
                    ? 0x53854a
                    : 0x779347,
              );
              for (let k = 0; k < (tier ? 14 : 7); k++) {
                const [X, Y] = warp(
                    (k + 0.3 + h(row, k) * 0.4) / (tier ? 14 : 7),
                    v + 0.018,
                  ),
                  z = s.ground(X, Y);
                const a = V(X - 0.004, Y, z + 0.06, leaf),
                  b = V(X + 0.004, Y, z + 0.06, leaf),
                  q = V(
                    X + 0.008,
                    Y + 0.003,
                    z + hh * (1.2 + h(k, row) * 0.45),
                    stripe,
                  );
                ix.push(a, b, q);
              }
            }
          }
        }
      if (count) fields.push({ x, y, type, stage: season, plots: count });
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(p, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(co, 3));
  g.setIndex(ix);
  g.computeVertexNormals();
  const mesh = new T.Mesh(
    g,
    new T.MeshLambertMaterial({
      vertexColors: true,
      side: T.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  mesh.userData = { role: "seasonal-fields", disposableMaterial: true, fields };
  return mesh;
}
