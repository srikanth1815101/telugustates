// A dry building terrace has an explicit inner rectangle and toe lines in the submitted terrain. Cardinal facing is recorded in the catalogue. Metres, never tile-relative corners.
import { ACRE as M, basis, localPoint } from "./metres.js";
const clamp = (x) => Math.max(0, Math.min(1, x)),
  ease = (x) => {
    x = clamp(x);
    return x * x * (3 - 2 * x);
  };
export function terrace(s, h) {
  const { fx, rx } = basis(h),
    [w, d] = h.size_m,
    X = h.centre[0],
    Y = h.centre[1],
    a = (Math.abs(rx) * w + Math.abs(fx) * d) / 2,
    b = (Math.abs(fx) * w + Math.abs(rx) * d) / 2,
    m = 0.8,
    lo = (x) => Math.floor(x * 10) / 10,
    hi = (x) => Math.ceil(x * 10) / 10,
    box = [
      lo(X - (a + m) / M),
      lo(Y - (b + m) / M),
      hi(X + (a + m) / M),
      hi(Y + (b + m) / M),
    ],
    zs = [];
  for (const u of [-0.45, 0, 0.45])
    for (const v of [-0.45, 0, 0.45])
      zs.push(s.point(...localPoint(h, u * w, v * d)).z);
  zs.sort((a, b) => a - b);
  // Balance cut and fill, but also constrain the rise from the front toe. A level foundation must not create an impassable lip on the way in.
  const blend = 0.2,
    { fx: F, fy: G } = basis(h),
    [gx, gy] = localPoint(h, h.door_x, 0),
    toe = [
      F > 0 ? box[2] + blend : F < 0 ? box[0] - blend : gx,
      G > 0 ? box[3] + blend : G < 0 ? box[1] - blend : gy,
    ],
    foot = s.point(...toe),
    rise = M * blend * 0.36;
  const z =
    foot.w < 0
      ? Math.max(foot.z - rise, Math.min(zs[4], foot.z + rise))
      : zs[4];
  return { h, z, box, blend };
}
export function registerTerraces(s, rows) {
  s.padBins = null;
  const pads = rows.filter((r) => r[5]).map((r) => terrace(s, r[5]));
  s.padBins = new Map();
  s.padChunks = new Map();
  for (const p of pads) {
    const [a, b, c, d] = p.box,
      H = p.blend;
    for (let y = Math.floor(b - H); y <= Math.floor(d + H); y++)
      for (let x = Math.floor(a - H); x <= Math.floor(c + H); x++) {
        const k = x + "," + y;
        (s.padBins.get(k) || s.padBins.set(k, []).get(k)).push(p);
      }
    for (let y = Math.floor((b - H) / 64); y <= Math.floor((d + H) / 64); y++)
      for (
        let x = Math.floor((a - H) / 64);
        x <= Math.floor((c + H) / 64);
        x++
      ) {
        const k = x + "," + y;
        (s.padChunks.get(k) || s.padChunks.set(k, []).get(k)).push(p);
      }
  }
  return pads;
}
export function benchAt(s, x, y) {
  let wt = 0,
    z = 0;
  for (const p of s.padBins?.get(Math.floor(x) + "," + Math.floor(y)) || []) {
    const [a, b, c, d] = p.box,
      dist = Math.max(a - x, x - c, b - y, y - d);
    if (dist <= 1e-9) return { z: p.z, w: 1 };
    const k = 1 - ease(dist / p.blend);
    if (k > wt) {
      wt = k;
      z = p.z;
    }
  }
  return wt > 0 ? { z, w: wt } : null;
}
// Split ONLY base rectangles that intersect a terrace. The bank builder stitches their edges to adjacent dry/shore cells, including across a chunk seam. No statewide Cartesian product of house axes.
export function benchSplit(s, x, y, X, Y, T) {
  const ps = s.padChunks?.get(
    Math.floor((x + X) / (128 * T)) + "," + Math.floor((y + Y) / (128 * T)),
  );
  if (!ps?.length) return null;
  const out = [];
  function divide(x, y, X, Y, list) {
    const a = x / T,
      b = y / T,
      c = X / T,
      d = Y / T,
      hit = list.filter(
        ({ box: k, blend: r }) =>
          c > k[0] - r && a < k[2] + r && d > k[1] - r && b < k[3] + r,
      );
    if (!hit.length) {
      out.push([x, y, X, Y]);
      return;
    }
    if (c - a > 1.001 || d - b > 1.001) {
      const xs = c - a > 1.001 ? [x, Math.round((x + X) / 2), X] : [x, X],
        ys = d - b > 1.001 ? [y, Math.round((y + Y) / 2), Y] : [y, Y];
      for (let j = 1; j < ys.length; j++)
        for (let i = 1; i < xs.length; i++)
          divide(xs[i - 1], ys[j - 1], xs[i], ys[j], hit);
      return;
    }
    const axes = [
      [x, X],
      [y, Y],
    ].map(([a, b], dim) => {
      const v = new Set([a, b]);
      for (const p of hit)
        for (const [edge, sg] of [
          [dim, -1],
          [dim + 2, 1],
        ])
          for (const k of [0, 0.5, 1]) {
            const q = Math.round(T * (p.box[edge] + sg * k * p.blend));
            if (q > a && q < b) v.add(q);
          }
      return [...v].sort((u, v) => u - v);
    });
    for (let j = 1; j < axes[1].length; j++)
      for (let i = 1; i < axes[0].length; i++)
        out.push([axes[0][i - 1], axes[1][j - 1], axes[0][i], axes[1][j]]);
  }
  divide(x, y, X, Y, ps);
  return out.length > 1 ? out : null;
}
