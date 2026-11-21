import { bankMix, shelfDepth } from "./river-margin.js";
import { benchSplit } from "./house-ground.js";
// Conforming refinement of the simulated waterline. Both chunks take the union of the same edge vertices; load order never defines a shoreline.
import { ACRE } from "./metres.js";
// Map coordinates below are in 63.615 m cells; mesh positions remain in the floating-origin frame.
const iso = 0.385,
  clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function bankBuilder(s, cx, cy, V, emit, X, Y, outer) {
  const pad = 12,
    span = 64 + 2 * pad,
    ox = cx * 64 - pad,
    oy = cy * 64 - pad,
    stride = span + 1,
    wet = new Uint16Array(stride * stride),
    line = new Uint16Array(stride * stride);
  s.channel(cx * 64 + 32, cy * 64 + 32);
  const seen = new Set(),
    flags = new Uint8Array(span * span);
  for (let j = Math.floor(oy / 6); j <= Math.floor((oy + span) / 6); j++)
    for (let i = Math.floor(ox / 6); i <= Math.floor((ox + span) / 6); i++)
      for (const seg of s.flowIndex.get(i + "," + j) || []) {
        if (seen.has(seg)) continue;
        seen.add(seg);
        const r = seg.half * 1.6 + 0.15,
          x = seg.x - ox,
          y = seg.y - oy;
        for (
          let b = Math.max(0, Math.floor(Math.min(y, y + seg.dy) - r));
          b <= Math.min(span - 1, Math.floor(Math.max(y, y + seg.dy) + r));
          b++
        )
          for (
            let a = Math.max(0, Math.floor(Math.min(x, x + seg.dx) - r));
            a <= Math.min(span - 1, Math.floor(Math.max(x, x + seg.dx) + r));
            a++
          )
            flags[b * span + a] = 1;
      }
  for (let j = 0; j < span; j++) {
    let w = 0,
      l = 0;
    for (let i = 0; i < span; i++) {
      w += s.node(ox + i, oy + j).wet;
      l += flags[j * span + i];
      const n = (j + 1) * stride + i + 1;
      wet[n] = w + wet[n - stride];
      line[n] = l + line[n - stride];
    }
  }
  // Integral images discover a lake inside a completely dry coarse triangle and streams narrower than one terrain edge.
  const sum = (p, a, b, c, d) =>
    p[d * stride + c] -
    p[b * stride + c] -
    p[d * stride + a] +
    p[b * stride + a];
  function hint(x, y, d) {
    const a = clamp(Math.floor(x - ox - d - 1.65), 0, span),
      b = clamp(Math.floor(y - oy - d - 1.65), 0, span),
      c = clamp(Math.ceil(x - ox + d + 1.65), 0, span),
      e = clamp(Math.ceil(y - oy + d + 1.65), 0, span),
      n = sum(wet, a, b, c, e);
    return n === (c - a) * (e - b)
      ? 0
      : sum(line, a, b, c, e) > 0
        ? 2
        : n > 0
          ? 1
          : 0;
  }
  // Plan bounded rectangular leaves first, then stitch all hanging edge vertices, including the neighbour's first row across chunk seams.
  // Integer ticks represent all base-axis fractions exactly (tenths, fifths and thirds), even after subdivision.
  const banks = new Map(),
    stats = { extra: 0, bank: 0, land: 0, maxBankChordM: 0 },
    T = 1920,
    Q = (x) => Math.round(x * T),
    X0 = Q(cx * 64),
    Y0 = Q(cy * 64),
    key = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a),
    pk = (x, y) => (x - X0) * 262144 + y - Y0,
    ids = new Map(),
    values = new Map(),
    rows = new Map(),
    cols = new Map(),
    roots = new Map(),
    N = X.length - 1;
  const ax = X.map(Q),
    ay = Y.map(Q);
  for (let i = 0; i < V.length; i++) ids.set(pk(Q(V[i].x), Q(V[i].y)), i);
  function vertex(x, y, shore = false) {
    const p = s.point(x, y);
    if (shore) {
      p.w = 0;
      p.z = p.line;
      p.depth = 0;
    }
    const n = V.length;
    V.push(p);
    emit.vertex(p);
    stats.extra++;
    return n;
  }
  const vert = (x, y) => {
    const k = pk(x, y);
    let n = ids.get(k);
    if (n === undefined) {
      n = vertex(x / T, y / T);
      ids.set(k, n);
    }
    return n;
  };
  function value(x, y) {
    const k = pk(x, y),
      id = ids.get(k);
    if (id !== undefined) return V[id].w;
    let w = values.get(k);
    if (w === undefined) {
      w = s.wet(x / T, y / T) - iso;
      values.set(k, w);
    }
    return w;
  }
  const mark = (m, k, v) => (m.get(k) || m.set(k, new Set()).get(k)).add(v);
  function corners(x, y, X, Y) {
    mark(rows, y, x);
    mark(rows, y, X);
    mark(rows, Y, x);
    mark(rows, Y, X);
    mark(cols, x, y);
    mark(cols, x, Y);
    mark(cols, X, y);
    mark(cols, X, Y);
  }
  function plan(x, y, X, Y, out, child = false) {
    if (!child && s.padBins) {
      const rects = benchSplit(s, x, y, X, Y, T);
      if (rects) {
        for (const r of rects) plan(...r, out, true);
        return true;
      }
    }
    const mx = Math.round((x + X) / 2),
      my = Math.round((y + Y) / 2),
      sx = (X - x) / T,
      sy = (Y - y) / T,
      L = Math.max(sx, sy);
    let size = Infinity;
    if (L > 0.14) {
      const near = hint(mx / T, my / T, L * 0.51);
      if (near) {
        if (L > 2.01) size = 2;
        else {
          const w0 = value(x, y),
            w1 = value(X, y),
            w2 = value(x, Y),
            w3 = value(X, Y),
            wm = value(mx, my),
            lo = Math.min(w0, w1, w2, w3, wm),
            hi = Math.max(w0, w1, w2, w3, wm);
          const h = near === 2 ? s.channel(mx / T, my / T) : null,
            rad = Math.hypot(sx, sy) * 0.5,
            thin =
              h &&
              h.seg.half < 0.68 &&
              h.dist < h.seg.half * 1.18 + rad &&
              lo < 0.02,
            edge = lo <= 0 && hi >= 0;
          if (thin) {
            if (edge) size = L > 0.55 ? 0.5 : 0.26;
            else if (hi < 0 && h.dist <= rad + h.seg.half * 0.8) size = 0.2;
          }
          if (!thin && L > 0.55) {
            const crossed =
              edge ||
              (L > 0.79 &&
                [value(x, my), value(X, my), value(mx, y), value(mx, Y)].some(
                  (w) => w * wm < 0,
                ));
            if (crossed) {
              const bend = Math.abs(wm - (w0 + w1 + w2 + w3) * 0.25);
              size = L > 1.32 ? 1.26 : bend > 0.085 ? 0.51 : 1.04;
            } else if (L > 1.45 && lo < 0.02 && hi > -0.16) size = 1.0;
          }
        }
      }
    }
    // A half- to one-metre change of wet footprint cannot be resolved by three-metre triangles.
    // Refine the submitted bed AND water locally on a running freshwater shelf. The same rule is used by both sides of chunk seams.
    if (!s.surveyGrid && !s.midRiverLOD && L > 0.0127) {
      const X0 = mx / T,
        Y0 = my / T,
        r = ACRE * Math.hypot(X0 - s.focus[0], Y0 - s.focus[1]);
      if (r < 60 && L < 0.26 && (s.ec?.at(X0, Y0)?.coast ?? 300) > 1) {
        const span = 0.8 * L,
          wm = value(mx, my);
        if (
          wm > -0.047 - span &&
          wm < 0.115 + span &&
          s.reachCurrent(X0, Y0, 1, false)[2] > 0.48
        )
          size = Math.min(size, r < 28 ? 0.0127 : 0.0252);
      }
    }
    if (
      s.midRiverLOD &&
      L > 0.12 &&
      Math.hypot(mx / T - s.focus[0], my / T - s.focus[1]) * ACRE < 680 &&
      L < 1.01
    ) {
      const wm = value(mx, my);
      if (wm > -0.15 - L * 0.42 && wm < 0.24 + L * 0.42)
        size = Math.min(size, 0.12);
    }
    const sx2 = sx > size,
      sy2 = sy > size;
    if (sx2 || sy2) {
      if (sx2 && sy2) {
        plan(x, y, mx, my, out, true);
        plan(mx, y, X, my, out, true);
        plan(x, my, mx, Y, out, true);
        plan(mx, my, X, Y, out, true);
      } else if (sx2) {
        plan(x, y, mx, Y, out, true);
        plan(mx, y, X, Y, out, true);
      } else {
        plan(x, y, X, my, out, true);
        plan(x, my, X, Y, out, true);
      }
      return true;
    }
    if (child) {
      out.push(x, y, X, Y);
      corners(x, y, X, Y);
    }
    return false;
  }
  function* prepare() {
    for (let j = 0; j < ay.length - 1; j++) {
      yield;
      for (let i = 0; i < ax.length - 1; i++) {
        const f = [];
        if (plan(ax[i], ay[j], ax[i + 1], ay[j + 1], f))
          roots.set(j * N + i, f);
      }
    }
    // Adjacent chunks can have different tangential spacing. Plan their true first strip, never an estimate of it, and take the union on the seam.
    for (let n = 0; n < 4; n++) {
      yield;
      const [A, B] = outer[n].map((v) => v.map(Q)),
        i0 = n === 0 ? A.length - 2 : 0,
        i1 = n === 1 ? 1 : A.length - 1,
        j0 = n === 2 ? B.length - 2 : 0,
        j1 = n === 3 ? 1 : B.length - 1;
      for (let j = j0; j < j1; j++)
        for (let i = i0; i < i1; i++) {
          const a = A[i],
            b = B[j],
            c = A[i + 1],
            d = B[j + 1];
          corners(a, b, c, d);
          plan(a, b, c, d, []);
        }
    }
    for (const m of [rows, cols])
      for (const [k, v] of m)
        m.set(
          k,
          [...v].sort((a, b) => a - b),
        );
  }
  function inner(vals, a, b) {
    if (!vals?.length) return [];
    let lo = 0,
      hi = vals.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (vals[m] <= a) lo = m + 1;
      else hi = m;
    }
    const v = [];
    while (lo < vals.length && vals[lo] < b) v.push(vals[lo++]);
    return v;
  }
  function bank(a, b) {
    if (V[a].x > V[b].x || (V[a].x === V[b].x && V[a].y > V[b].y))
      [a, b] = [b, a];
    const A = V[a],
      B = V[b];
    if (Math.abs(A.w) < 1e-9) return a;
    if (Math.abs(B.w) < 1e-9) return b;
    const tag = key(a, b);
    if (banks.has(tag)) return banks.get(tag);
    let lo = 0,
      hi = 1,
      f = A.w,
      g = B.w,
      t = 0.5;
    for (let i = 0; i < 6; i++) {
      t = lo + (hi - lo) * clamp(f / (f - g), 0.06, 0.94);
      const v = s.wet(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t) - iso;
      if (Math.abs(v) < 0.000006) break;
      if (v >= 0 === f >= 0) {
        lo = t;
        f = v;
      } else {
        hi = t;
        g = v;
      }
    }
    const n = vertex(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t, true);
    banks.set(tag, n);
    stats.bank++;
    return n;
  }
  const chord = (a, b) => ACRE * Math.hypot(V[a].x - V[b].x, V[a].y - V[b].y);
  function face(a, b, c, arr) {
    const A = V[a],
      B = V[b],
      C = V[c];
    if (
      a === b ||
      a === c ||
      b === c ||
      Math.abs((B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x)) < 1e-14
    )
      return;
    arr.push(a, b, c);
    emit.land(a, b, c);
    stats.land++;
    if (A.w < 0 || B.w < 0 || C.w < 0) emit.beach?.(a, b, c);
    if (A.w >= 0 && B.w >= 0 && C.w >= 0) {
      emit.water(a, b, c);
      if (A.w === 0 && B.w === 0)
        stats.maxBankChordM = Math.max(stats.maxBankChordM, chord(a, b));
      if (B.w === 0 && C.w === 0)
        stats.maxBankChordM = Math.max(stats.maxBankChordM, chord(b, c));
      if (C.w === 0 && A.w === 0)
        stats.maxBankChordM = Math.max(stats.maxBankChordM, chord(c, a));
    }
  }
  function leaf(a, b, c, arr) {
    const q = [a, b, c],
      pos = [],
      neg = [];
    if (q.every((i) => V[i].w >= 0) || q.every((i) => V[i].w <= 0)) {
      face(a, b, c, arr);
      return;
    }
    for (let i = 0; i < 3; i++) {
      const k = q[i],
        j = q[(i + 1) % 3],
        v = V[k].w,
        n = V[j].w;
      if (v >= 0) pos.push(k);
      if (v <= 0) neg.push(k);
      if (v * n < 0) {
        const h = bank(k, j);
        pos.push(h);
        neg.push(h);
      }
    }
    for (const poly of [neg, pos])
      for (let i = 1; i + 1 < poly.length; i++)
        face(poly[0], poly[i], poly[i + 1], arr);
  }
  function cell(a, b, c, d, i, j) {
    const f = roots.get(j * N + i),
      tasks = f || [ax[i], ay[j], ax[i + 1], ay[j + 1]],
      faces = [];
    for (let k = 0; k < tasks.length; k += 4) {
      const [x, y, X, Y] = tasks.slice(k, k + 4),
        bot = inner(rows.get(y), x, X),
        right = inner(cols.get(X), y, Y),
        top = inner(rows.get(Y), x, X),
        left = inner(cols.get(x), y, Y);
      const A = f ? vert(x, y) : a,
        B = f ? vert(X, y) : b,
        C = f ? vert(x, Y) : c,
        D = f ? vert(X, Y) : d;
      if (!bot.length && !top.length && !right.length && !left.length) {
        if (
          !f &&
          ((V[A].w < 0 && V[B].w < 0 && V[C].w < 0 && V[D].w < 0) ||
            (V[A].w >= 0 && V[B].w >= 0 && V[C].w >= 0 && V[D].w >= 0))
        )
          return null;
        leaf(A, B, C, faces);
        leaf(B, D, C, faces);
      } else {
        const o = vert(Math.round((x + X) / 2), Math.round((y + Y) / 2)),
          poly = [
            A,
            ...bot.map((v) => vert(v, y)),
            B,
            ...right.map((v) => vert(X, v)),
            D,
            ...top.reverse().map((v) => vert(v, Y)),
            C,
            ...left.reverse().map((v) => vert(x, v)),
          ];
        for (let q = 0; q < poly.length; q++)
          leaf(o, poly[q], poly[(q + 1) % poly.length], faces);
      }
    }
    return {
      faces: Uint32Array.from(faces),
      x: X[i],
      y: Y[j],
      dx: X[i + 1] - X[i],
      dy: Y[j + 1] - Y[j],
    };
  }
  return { stats, cell, prepare };
}
// Physics, foot planting and picking see the same split bank and bottom as the GPU, including transition faces.
export function bankSample(c, V, x, y) {
  const { faces: F } = c,
    N = (c.N ??= Math.min(
      16,
      Math.max(1, Math.ceil(Math.sqrt(F.length / 24))),
    ));
  const ix = (v) => clamp(Math.floor(((v - c.x) * N) / c.dx), 0, N - 1),
    iy = (v) => clamp(Math.floor(((v - c.y) * N) / c.dy), 0, N - 1);
  if (!c.bins) {
    const bins = Array.from({ length: N * N }, () => []);
    for (let h = 0; h < F.length; h += 3) {
      const a = V[F[h]],
        b = V[F[h + 1]],
        d = V[F[h + 2]];
      for (
        let j = iy(Math.min(a.y, b.y, d.y));
        j <= iy(Math.max(a.y, b.y, d.y));
        j++
      )
        for (
          let i = ix(Math.min(a.x, b.x, d.x));
          i <= ix(Math.max(a.x, b.x, d.x));
          i++
        )
          bins[j * N + i].push(h);
    }
    c.bins = bins;
  }
  for (const h of c.bins[iy(y) * N + ix(x)]) {
    const a = V[F[h]],
      b = V[F[h + 1]],
      d = V[F[h + 2]],
      bx = b.x - a.x,
      by = b.y - a.y,
      dx = d.x - a.x,
      dy = d.y - a.y,
      X = x - a.x,
      Y = y - a.y,
      det = bx * dy - dx * by,
      u = (X * dy - Y * dx) / det,
      v = (bx * Y - by * X) / det;
    if (u < -2e-7 || v < -2e-7 || u + v > 1.0000002) continue;
    const mix = (a, b, d) => a + (b - a) * u + (d - a) * v,
      z = mix(a.z, b.z, d.z),
      line = mix(a.line, b.line, d.line),
      w = mix(a.w, b.w, d.w);
    return {
      z,
      line,
      w,
      drawn: true,
      sea: mix(a.sea, b.sea, d.sea),
      depth: w > 0 ? Math.max(0, line - z) : 0,
      wear: 0,
      margin: bankMix(a, b, d, u, v),
      marginBed:
        a.margin || b.margin || d.margin
          ? mix(shelfDepth(a), shelfDepth(b), shelfDepth(d))
          : undefined,
      m: a.mix.map((n, i) => mix(n, b.mix[i], d.mix[i])),
    };
  }
  return null;
}
