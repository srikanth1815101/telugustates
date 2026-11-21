import { benchAt } from "./house-ground.js";
// A fitted Kenney ground_pathStraight profile becomes part of the land mesh. No overlay face.
// Source coordinates stay in acres; widths, crossfalls and cuts are in metres.
import { ACRE as U } from "./metres.js";
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export class Tread {
  constructor(paths, profile, focus) {
    this.profile = profile;
    this.bins = new Map();
    this.refined = 0;
    this.verts = 0;
    for (const path of paths) {
      let travelled = 0;
      const width = clamp(path.w || 1.5, 0.9, 2.0);
      for (let i = 1; i < path.xy.length; i++) {
        const a = path.xy[i - 1],
          b = path.xy[i],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          len = Math.hypot(dx, dy) * U;
        if (!len) continue;
        const seg = { a, dx, dy, len, at: travelled, width };
        travelled += len;
        const loX = Math.max(
            Math.floor(focus[0] - 8),
            Math.floor(Math.min(a[0], b[0]) - 0.04),
          ),
          hiX = Math.min(
            Math.floor(focus[0] + 8),
            Math.floor(Math.max(a[0], b[0]) + 0.04),
          ),
          loY = Math.max(
            Math.floor(focus[1] - 8),
            Math.floor(Math.min(a[1], b[1]) - 0.04),
          ),
          hiY = Math.min(
            Math.floor(focus[1] + 8),
            Math.floor(Math.max(a[1], b[1]) + 0.04),
          );
        for (let j = loY; j <= hiY; j++)
          for (let k = loX; k <= hiX; k++) {
            const key = k + "," + j;
            if (!this.bins.has(key)) this.bins.set(key, []);
            this.bins.get(key).push(seg);
          }
      }
    }
  }
  hit(x, y, margin = 0) {
    const q = this.bins.get(Math.floor(x) + "," + Math.floor(y));
    if (!q) return null;
    let best = null,
      bd = Infinity;
    for (const s of q) {
      const dx = (x - s.a[0]) * U,
        dy = (y - s.a[1]) * U,
        ax = (s.dx * U) / s.len,
        ay = (s.dy * U) / s.len,
        t = clamp(dx * ax + dy * ay, 0, s.len),
        px = dx - ax * t,
        py = dy - ay * t,
        d = Math.hypot(px, py);
      if (d > margin + s.width * 1.05 || d >= bd) continue;
      bd = d;
      const side = -ay * px + ax * py,
        phase = ((s.at + t) / 5.7) % 1,
        rows = this.profile.profile;
      let i = 1;
      while (i < rows.length - 1 && phase > rows[i][0]) i++;
      const A = rows[i - 1],
        B = rows[i],
        f = (phase - A[0]) / (B[0] - A[0]),
        scale = s.width * 1.95,
        edge = (k) => (A[k] + f * (B[k] - A[k])) * scale;
      const across = d * (side < 0 ? -1 : 1);
      const q0 = clamp(
          Math.min(
            (across - edge(1)) / (edge(2) - edge(1)),
            (edge(4) - across) / (edge(4) - edge(3)),
          ),
          0,
          1,
        ),
        wear = q0 * q0 * (3 - 2 * q0);
      best = { wear, side, nx: -ay, ny: ax, depth: this.profile.depth * 1.4 };
    }
    return best;
  }
}
// Conforming subgrid on the original barycentric base face. Displacement vanishes at uncut seams.
export function refineTread(s, t, cell, X, Y, V, n, i, j, p, c, wear, ix) {
  const x = X[i],
    y = Y[j],
    dx = X[i + 1] - x,
    dy = Y[j + 1] - y;
  if (
    dx > 0.34 ||
    dy > 0.34 ||
    !t.hit(x + dx * 0.5, y + dy * 0.5, Math.hypot(dx, dy) * U * 0.5)
  )
    return false;
  const a = j * n + i,
    A = V[a],
    B = V[a + 1],
    C = V[a + n],
    D = V[a + n + 1];
  if ([A, B, C, D].some((v) => v.w >= 0)) return false;
  const N = 16,
    base = p.length / 3,
    delta = new Float32Array((N + 1) * (N + 1)),
    ww = new Float32Array(delta.length);
  for (let v = 0; v <= N; v++)
    for (let u = 0; u <= N; u++) {
      const g = u / N,
        h = v / N,
        lo = g + h <= 1,
        Q = lo ? A : D,
        R = lo ? B : C,
        S = lo ? C : B,
        K = lo ? g : 1 - g,
        H = lo ? h : 1 - h,
        mix = (a, b, d) => a + (b - a) * K + (d - a) * H,
        z = mix(Q.z, R.z, S.z),
        gx = x + dx * g,
        gy = y + dy * h,
        hit = t.hit(gx, gy),
        w = hit?.wear || 0,
        f = lo ? 1 : -1,
        slopeX = (f * (R.z - Q.z)) / (dx * U),
        slopeY = (f * (S.z - Q.z)) / (dy * U),
        offset = w
          ? -w *
            (hit.depth +
              clamp(
                (slopeX * hit.nx + slopeY * hit.ny) * hit.side * 0.62,
                -0.04,
                0.085,
              ))
          : 0;
      const k = v * (N + 1) + u;
      const cut =
        offset && s.padBins
          ? offset * (1 - (benchAt(s, gx, gy)?.w || 0))
          : offset;
      delta[k] = cut;
      ww[k] = w;
      p.push(...s.xyz(gx, gy, z + cut));
      for (let z = 0; z < 4; z++) c.push(mix(Q.mix[z], R.mix[z], S.mix[z]));
      wear.push(w);
    }
  // Collapse unworn blocks back onto the exact two parent planes. The finest edge vertices
  // survive wherever a tread is cut; no hidden full-density rectangle under the path.
  const draw = (u, v, n) => {
    if (n > 1) {
      let worn = false;
      for (let y = v; y <= v + n && !worn; y++)
        for (let x = u; x <= u + n; x++)
          if (ww[y * (N + 1) + x] > 0.00001) {
            worn = true;
            break;
          }
      if (worn) {
        const z = n / 2;
        draw(u, v, z);
        draw(u + z, v, z);
        draw(u, v + z, z);
        draw(u + z, v + z, z);
        return;
      }
    }
    const a = base + v * (N + 1) + u,
      b = a + n,
      d = a + n * (N + 1);
    ix.push(a, b, d, b, d + n, d);
  };
  draw(0, 0, N);
  cell.set(j * (n - 1) + i, { N, delta, ww });
  t.refined++;
  t.verts += delta.length;
  return true;
}
export function subContact(a, u, v) {
  if (!a) return [0, 0];
  const N = a.N,
    i = clamp(Math.floor(u * N), 0, N - 1),
    j = clamp(Math.floor(v * N), 0, N - 1),
    x = clamp(u * N - i, 0, 1),
    y = clamp(v * N - j, 0, 1),
    k = j * (N + 1) + i,
    lo = x + y <= 1,
    base = lo ? k : k + N + 2,
    b = lo ? k + 1 : k + N + 1,
    c = lo ? k + N + 1 : k + 1;
  return [a.delta, a.ww].map(
    (m) =>
      m[base] +
      (m[b] - m[base]) * (lo ? x : 1 - x) +
      (m[c] - m[base]) * (lo ? y : 1 - y),
  );
}
