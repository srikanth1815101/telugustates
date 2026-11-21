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
            Math.floor(Math.min(a[0], b[0]) - 0.22),
          ),
          hiX = Math.min(
            Math.floor(focus[0] + 8),
            Math.floor(Math.max(a[0], b[0]) + 0.22),
          ),
          loY = Math.max(
            Math.floor(focus[1] - 8),
            Math.floor(Math.min(a[1], b[1]) - 0.22),
          ),
          hiY = Math.min(
            Math.floor(focus[1] + 8),
            Math.floor(Math.max(a[1], b[1]) + 0.22),
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
// Watertight restricted-quadtree subgrid on the original barycentric base faces.
// Shared border vertices and perimeter fans guarantee zero T-junctions and zero vertical seams.
export function emitTreadCells(
  s,
  t,
  cellMap,
  X,
  Y,
  V,
  n,
  used,
  banks,
  pushVert,
  ix,
) {
  const cols = n - 1,
    rows = Y.length - 1,
    N = s.compactLaneLOD || s.mobileMesh ? 8 : 16,
    refined = new Uint8Array(cols * rows);
  if (t) {
    for (let j = 1; j < rows - 1; j++)
      for (let i = 1; i < cols - 1; i++) {
        const id = j * cols + i;
        if (!used[id] || banks.has(id)) continue;
        const nS = id - cols,
          nN = id + cols,
          nW = id - 1,
          nE = id + 1;
        if (
          !used[nS] ||
          !used[nN] ||
          !used[nW] ||
          !used[nE] ||
          banks.has(nS) ||
          banks.has(nN) ||
          banks.has(nW) ||
          banks.has(nE)
        )
          continue;
        const x = X[i],
          y = Y[j],
          dx = X[i + 1] - x,
          dy = Y[j + 1] - y;
        if (
          dx > 0.42 ||
          dy > 0.42 ||
          (s.mobileMesh &&
            Math.hypot(x + dx * 0.5 - s.focus[0], y + dy * 0.5 - s.focus[1]) *
              U >
              97)
        )
          continue;
        const a = j * n + i;
        if ([V[a], V[a + 1], V[a + n], V[a + n + 1]].some((v) => v.w >= 0))
          continue;
        if (!t.hit(x + dx * 0.5, y + dy * 0.5, Math.hypot(dx, dy) * U * 0.52))
          continue;
        refined[id] = 1;
      }
  }
  const cutAt = (gx, gy) => {
    const hit = t.hit(gx, gy),
      w = hit && hit.wear > 1e-5 ? hit.wear : 0;
    if (!w) return [0, 0];
    const gi = Math.floor(gx),
      gj = Math.floor(gy),
      fu = gx - gi,
      fv = gy - gj,
      z00 = s.baseZ(gi, gj),
      z10 = s.baseZ(gi + 1, gj),
      z01 = s.baseZ(gi, gj + 1),
      z11 = s.baseZ(gi + 1, gj + 1),
      slopeX = ((z10 - z00) * (1 - fv) + (z11 - z01) * fv) / U,
      slopeY = ((z01 - z00) * (1 - fu) + (z11 - z10) * fu) / U,
      offset =
        -w *
        (hit.depth +
          clamp(
            (slopeX * hit.nx + slopeY * hit.ny) * hit.side * 0.62,
            -0.04,
            0.085,
          )),
      cut = s.padBins ? offset * (1 - (benchAt(s, gx, gy)?.w || 0)) : offset;
    return [cut, w];
  };
  const corners = new Map(),
    hEdges = new Map(),
    vEdges = new Map(),
    active = new Set(),
    realize = (rec) => {
      if (rec.idx < 0)
        rec.idx = pushVert(
          rec.gx,
          rec.gy,
          rec.z + rec.cut,
          rec.mix,
          rec.w,
          rec.dry,
        );
      return rec.idx;
    },
    cornerRec = (gi, gj) => {
      const key = gj * n + gi;
      if (corners.has(key)) return corners.get(key);
      const all4 =
        gi > 0 &&
        gi < cols &&
        gj > 0 &&
        gj < rows &&
        refined[(gj - 1) * cols + gi - 1] &&
        refined[(gj - 1) * cols + gi] &&
        refined[gj * cols + gi - 1] &&
        refined[gj * cols + gi];
      const v = V[key];
      let rec;
      if (all4) {
        const [cut, w] = cutAt(X[gi], Y[gj]);
        rec =
          w > 0
            ? {
                idx: -1,
                gx: X[gi],
                gy: Y[gj],
                z: v.z,
                mix: v.mix,
                cut,
                w,
                dry: -v.w,
              }
            : { idx: key, cut: 0, w: 0 };
      } else rec = { idx: key, cut: 0, w: 0 };
      corners.set(key, rec);
      return rec;
    },
    hEdgeRecs = (i, gj) => {
      const key = gj * cols + i;
      if (hEdges.has(key)) return hEdges.get(key);
      const both =
          gj > 0 &&
          gj < rows &&
          refined[(gj - 1) * cols + i] &&
          refined[gj * cols + i],
        A = V[gj * n + i],
        B = V[gj * n + i + 1],
        x = X[i],
        dx = X[i + 1] - x,
        y = Y[gj],
        arr = new Array(N - 1);
      for (let u = 1; u < N; u++) {
        const g = u / N,
          gx = x + dx * g,
          [cut, w] = both ? cutAt(gx, y) : [0, 0];
        arr[u - 1] = {
          idx: -1,
          gx,
          gy: y,
          z: A.z + (B.z - A.z) * g,
          mix: [0, 1, 2, 3].map((k) => A.mix[k] + (B.mix[k] - A.mix[k]) * g),
          cut,
          w,
          dry: -(A.w + (B.w - A.w) * g),
        };
      }
      hEdges.set(key, arr);
      return arr;
    },
    vEdgeRecs = (gi, j) => {
      const key = j * n + gi;
      if (vEdges.has(key)) return vEdges.get(key);
      const both =
          gi > 0 &&
          gi < cols &&
          refined[j * cols + gi - 1] &&
          refined[j * cols + gi],
        A = V[j * n + gi],
        C = V[(j + 1) * n + gi],
        x = X[gi],
        y = Y[j],
        dy = Y[j + 1] - y,
        arr = new Array(N - 1);
      for (let v = 1; v < N; v++) {
        const h = v / N,
          gy = y + dy * h,
          [cut, w] = both ? cutAt(x, gy) : [0, 0];
        arr[v - 1] = {
          idx: -1,
          gx: x,
          gy,
          z: A.z + (C.z - A.z) * h,
          mix: [0, 1, 2, 3].map((k) => A.mix[k] + (C.mix[k] - A.mix[k]) * h),
          cut,
          w,
          dry: -(A.w + (C.w - A.w) * h),
        };
      }
      vEdges.set(key, arr);
      return arr;
    };
  const grids = new Map();
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const id = j * cols + i;
      if (!refined[id]) continue;
      const a = j * n + i,
        A = V[a],
        B = V[a + 1],
        C = V[a + n],
        D = V[a + n + 1],
        x = X[i],
        y = Y[j],
        dx = X[i + 1] - x,
        dy = Y[j + 1] - y,
        recs = new Array((N + 1) * (N + 1)),
        delta = new Float32Array((N + 1) * (N + 1)),
        ww = new Float32Array(delta.length),
        south = hEdgeRecs(i, j),
        north = hEdgeRecs(i, j + 1),
        west = vEdgeRecs(i, j),
        east = vEdgeRecs(i + 1, j);
      recs[0] = cornerRec(i, j);
      recs[N] = cornerRec(i + 1, j);
      recs[N * (N + 1)] = cornerRec(i, j + 1);
      recs[N * (N + 1) + N] = cornerRec(i + 1, j + 1);
      for (let u = 1; u < N; u++) {
        recs[u] = south[u - 1];
        recs[N * (N + 1) + u] = north[u - 1];
      }
      for (let v = 1; v < N; v++) {
        recs[v * (N + 1)] = west[v - 1];
        recs[v * (N + 1) + N] = east[v - 1];
      }
      for (let v = 0; v <= N; v++)
        for (let u = 0; u <= N; u++) {
          const k = v * (N + 1) + u;
          let rec = recs[k];
          if (!rec) {
            const g = u / N,
              h = v / N,
              lo = g + h <= 1,
              Q = lo ? A : D,
              R = lo ? B : C,
              S = lo ? C : B,
              K = lo ? g : 1 - g,
              H = lo ? h : 1 - h,
              mixF = (p0, p1, p2) => p0 + (p1 - p0) * K + (p2 - p0) * H,
              gx = x + dx * g,
              gy = y + dy * h,
              [cut, w] = cutAt(gx, gy);
            rec = recs[k] = {
              idx: -1,
              gx,
              gy,
              z: mixF(Q.z, R.z, S.z),
              mix: [0, 1, 2, 3].map((m) => mixF(Q.mix[m], R.mix[m], S.mix[m])),
              cut,
              w,
              dry: -mixF(Q.w, R.w, S.w),
            };
          }
          delta[k] = rec.cut;
          ww[k] = rec.w;
        }
      const hasWear = (u0, v0, s0) => {
        for (let yy = v0; yy <= v0 + s0; yy++)
          for (let xx = u0; xx <= u0 + s0; xx++)
            if (ww[yy * (N + 1) + xx] > 0) return true;
        return false;
      };
      const mark = (u0, v0, s0) => {
        if (s0 > 1 && hasWear(u0, v0, s0)) {
          const z = s0 >> 1;
          mark(u0, v0, z);
          mark(u0 + z, v0, z);
          mark(u0, v0 + z, z);
          mark(u0 + z, v0 + z, z);
          return;
        }
        active.add(recs[v0 * (N + 1) + u0]);
        active.add(recs[v0 * (N + 1) + u0 + s0]);
        active.add(recs[(v0 + s0) * (N + 1) + u0]);
        active.add(recs[(v0 + s0) * (N + 1) + u0 + s0]);
      };
      mark(0, 0, N);
      grids.set(id, { recs, ww, hasWear });
      cellMap.set(id, { N, delta, ww });
      t.refined++;
    }
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const id = j * cols + i;
      if (!used[id] || banks.has(id)) continue;
      const g = grids.get(id);
      if (g) {
        const { recs, hasWear } = g,
          at = (u, v) => recs[v * (N + 1) + u],
          emit = (u0, v0, s0) => {
            if (s0 > 1 && hasWear(u0, v0, s0)) {
              const z = s0 >> 1;
              emit(u0, v0, z);
              emit(u0 + z, v0, z);
              emit(u0, v0 + z, z);
              emit(u0 + z, v0 + z, z);
              return;
            }
            if (s0 === 1) {
              const i0 = realize(at(u0, v0)),
                i1 = realize(at(u0 + 1, v0)),
                i2 = realize(at(u0, v0 + 1)),
                i3 = realize(at(u0 + 1, v0 + 1));
              ix.push(i0, i1, i2, i1, i3, i2);
              return;
            }
            const ring = [];
            for (let q = 0; q < s0; q++) {
              const r = at(u0 + q, v0);
              if (q === 0 || active.has(r)) ring.push(realize(r));
            }
            for (let q = 0; q < s0; q++) {
              const r = at(u0 + s0, v0 + q);
              if (q === 0 || active.has(r)) ring.push(realize(r));
            }
            for (let q = 0; q < s0; q++) {
              const r = at(u0 + s0 - q, v0 + s0);
              if (q === 0 || active.has(r)) ring.push(realize(r));
            }
            for (let q = 0; q < s0; q++) {
              const r = at(u0, v0 + s0 - q);
              if (q === 0 || active.has(r)) ring.push(realize(r));
            }
            if (ring.length === 4) {
              ix.push(ring[0], ring[1], ring[3], ring[1], ring[2], ring[3]);
              return;
            }
            const m = realize(at(u0 + (s0 >> 1), v0 + (s0 >> 1)));
            for (let q = 0; q < ring.length; q++)
              ix.push(ring[q], ring[(q + 1) % ring.length], m);
          };
        emit(0, 0, N);
        continue;
      }
      const a = j * n + i,
        b = a + 1,
        d = a + n,
        e = d + 1,
        south = hEdges.get(j * cols + i),
        east = vEdges.get(j * n + i + 1),
        north = hEdges.get((j + 1) * cols + i),
        west = vEdges.get(j * n + i);
      if (!south && !east && !north && !west) {
        ix.push(a, b, d, b, e, d);
        continue;
      }
      const ring = [cornerRec(i, j)];
      if (south) for (const r of south) if (active.has(r)) ring.push(r);
      ring.push(cornerRec(i + 1, j));
      if (east) for (const r of east) if (active.has(r)) ring.push(r);
      ring.push(cornerRec(i + 1, j + 1));
      if (north)
        for (let q = north.length - 1; q >= 0; q--)
          if (active.has(north[q])) ring.push(north[q]);
      ring.push(cornerRec(i, j + 1));
      if (west)
        for (let q = west.length - 1; q >= 0; q--)
          if (active.has(west[q])) ring.push(west[q]);
      if (ring.length === 4) {
        ix.push(
          realize(ring[0]),
          realize(ring[1]),
          realize(ring[3]),
          realize(ring[1]),
          realize(ring[2]),
          realize(ring[3]),
        );
        continue;
      }
      const B = V[b],
        C = V[d],
        m = pushVert(
          (X[i] + X[i + 1]) * 0.5,
          (Y[j] + Y[j + 1]) * 0.5,
          (B.z + C.z) * 0.5,
          [0, 1, 2, 3].map((k) => (B.mix[k] + C.mix[k]) * 0.5),
          0,
          -(B.w + C.w) * 0.5,
        ),
        ids = ring.map(realize);
      for (let q = 0; q < ids.length; q++)
        ix.push(ids[q], ids[(q + 1) % ids.length], m);
    }
  if (t) t.verts = pCount(grids);
}
function pCount(grids) {
  let n = 0;
  for (const g of grids.values())
    for (const r of g.recs) if (r && r.idx >= 0) n++;
  return n;
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
