// Exact capsule/line intersections in metres, including tangencies, oblique junctions and paths parallel to a fence.
import { ACRE as M } from "./metres.js";
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function interval(a, b, p, q, r) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    l = Math.hypot(dx, dy);
  if (!l) return null;
  const ux = dx / l,
    uy = dy / l;
  const project = (v) => [
    (v[0] - a[0]) * ux + (v[1] - a[1]) * uy,
    (v[1] - a[1]) * ux - (v[0] - a[0]) * uy,
  ];
  const [s, t] = project(p),
    [S, T] = project(q),
    L = Math.hypot(S - s, T - t);
  let lo = Infinity,
    hi = -Infinity;
  const take = (u, v) => {
    lo = Math.min(lo, u);
    hi = Math.max(hi, v);
  };
  for (const [x, y] of [
    [s, t],
    [S, T],
  ])
    if (Math.abs(y) <= r) {
      const z = Math.sqrt(Math.max(0, r * r - y * y));
      take(x - z, x + z);
    }
  if (L > 1e-9) {
    const vx = (S - s) / L,
      vy = (T - t) / L;
    const poly = [
      [s - vy * r, t + vx * r],
      [S - vy * r, T + vx * r],
      [S + vy * r, T - vx * r],
      [s + vy * r, t - vx * r],
    ];
    for (let k = 0; k < 4; k++) {
      const [x, y] = poly[k],
        [X, Y] = poly[(k + 1) % 4];
      if (Math.abs(y) < 1e-9) take(x, x);
      if (y * Y < 0) {
        const z = x - (y * (X - x)) / (Y - y);
        take(z, z);
      }
    }
  }
  lo = Math.max(0, lo);
  hi = Math.min(l, hi);
  return hi > lo ? [lo / l, hi / l] : null;
}
export function pathIndex(paths) {
  const bins = new Map(),
    key = (x, y) => Math.floor(x) + "," + Math.floor(y);
  for (const path of paths) {
    const r = clamp(path.w || 1.5, 0.9, 2) * 0.69 + 0.88;
    for (let k = 1; k < path.xy.length; k++) {
      const a = path.xy[k - 1],
        b = path.xy[k];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9) continue;
      const seg = { a, b, r };
      for (
        let j = Math.floor(Math.min(a[1], b[1]) - r / M - 0.05);
        j <= Math.max(a[1], b[1]) + r / M + 0.05;
        j++
      )
        for (
          let i = Math.floor(Math.min(a[0], b[0]) - r / M - 0.05);
          i <= Math.max(a[0], b[0]) + r / M + 0.05;
          i++
        ) {
          const id = key(i, j);
          (bins.get(id) || bins.set(id, []).get(id)).push(seg);
        }
    }
  }
  return {
    near(x, y) {
      return bins.get(key(x, y)) || [];
    },
    clear(x, y, extra = 0) {
      const spread = extra > 2.6 ? Math.ceil(extra / M) : 0;
      for (let j = -spread; j <= spread; j++)
        for (let i = -spread; i <= spread; i++)
          for (const { a, b, r } of this.near(x + i, y + j)) {
            const dx = b[0] - a[0],
              dy = b[1] - a[1],
              t = clamp(
                ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy),
                0,
                1,
              );
            if (
              M * Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) <
              r + extra
            )
              return false;
          }
      return true;
    },
    cuts(x, y, along) {
      const segs = new Set([
          ...this.near(x, y),
          ...this.near(x + (along ? 0.5 : 0), y + (along ? 0 : 0.5)),
          ...this.near(x + (along ? 1 : 0), y + (along ? 0 : 1)),
        ]),
        out = [],
        z = (p) => [(p[0] - x) * M, (p[1] - y) * M];
      for (const s of segs) {
        const h = interval(
          [0, 0],
          along ? [M, 0] : [0, M],
          z(s.a),
          z(s.b),
          s.r,
        );
        if (h) out.push(h);
      }
      return out;
    },
  };
}

// Return the first clear shoulder, preserving the authored side if it already works.
export function beside(s, points, r) {
  for (const q of points) if (!s.ways || s.ways.clear(...q, r)) return q;
  return null;
}
