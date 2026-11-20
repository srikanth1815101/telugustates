import {refineTread,subContact} from "./tread.js";
import { padDistance } from "./resident-scene.js";
import * as T from "../vendor/three.module.min.js";
import { ACRE as U, RELIEF as V } from "./metres.js";
import { smooth } from "./sky.js";
// One separable, normalized binomial Gaussian (σ≈1.12 acres in each axis). Read a tile halo, not clamped edges.
const K = [1, 5, 10, 10, 5, 1],
  N = 256;
export class Surface {
  constructor(tiles, origin, focus = null) {
    this.t = tiles;
    this.atlas = origin;
    // Decouple regional survey precision from a boot, a grass blade, and wave normals.
    // Each coordinate frame lives for a complete mesh generation; never mutate a live frame.
    const ox = focus
        ? Math.round(((focus[0] - origin.x) * U) / 1024) * 1024
        : 0,
      oz = focus ? Math.round(((origin.y - focus[1]) * U) / 1024) * 1024 : 0;
    this.offset = [ox, 0, oz];
    this.o = { x: origin.x + ox / U, y: origin.y - oz / U, z: origin.z };
    this.maps = new Map();
    this.axes = new Map();
    this.nodes = new Map();

    this.wetGrades = new Map();
    this.flowIndex = null;
    this.focus = [origin.x, origin.y];
    this.season = 0.5;
    this.relief = V;
    this.period = "winter";
    this.ec = null;
  }
  stencil(tx, ty) {
    const k = `${tx}_${ty}`;
    if (this.maps.has(k)) return this.maps.get(k);
    const out = new Float32Array(257 * 257),
      hw = new Float32Array(257 * 262),
      hv = new Float32Array(hw.length),
      raw = new Float32Array(262 * 262);
    const local = this.t.cache.get(k);
    for (let j = 0; j < 262; j++)
      for (let i = 0; i < 262; i++) {
        const x = i - 3,
          y = j - 3;
        raw[j * 262 + i] =
          local && x >= 0 && x < 256 && y >= 0 && y < 256
            ? local.h[(y >> 1) * 128 + (x >> 1)]
            : this.t.height(tx * 256 + x, ty * 256 + y);
      }
    for (let j = 0; j < 262; j++)
      for (let i = 0; i < 257; i++) {
        let z = 0,
          w = 0;
        for (let a = 0; a < 6; a++) {
          const h = raw[j * 262 + i + a];
          if (h !== -32768) {
            z += h * K[a];
            w += K[a];
          }
        }
        hv[j * 257 + i] = z;
        hw[j * 257 + i] = w;
      }
    for (let j = 0; j < 257; j++)
      for (let i = 0; i < 257; i++) {
        let z = 0,
          w = 0;
        for (let a = 0; a < 6; a++) {
          z += hv[(j + a) * 257 + i] * K[a];
          w += hw[(j + a) * 257 + i] * K[a];
        }
        let h0 = w ? z / w : 0;
        const gx = tx * 256 + i,
          gy = ty * 256 + j,
          sl =
            local && i < 256 && j < 256
              ? local.s[j * 256 + i]
              : this.t.at(gx, gy)?.s || 0;
        if (w && sl > 8) {
          const real = this.sharp(gx, gy) / this.relief + this.o.z;
          h0 += (real - h0) * Math.min(0.91, (sl - 8) * 0.042);
          const rock = this.ec?.at(gx, gy)?.rock || 0,
            period = rock === 2 ? 10 : 14,
            band = Math.floor(h0 / period),
            u = h0 / period - band;
          h0 += (smooth(0.29, 0.69, u) - u) * period * smooth(11, 27, sl) * 0.4;
        }
        out[j * 257 + i] = w ? (h0 - this.o.z) * this.relief : 0;
      }
    this.maps.set(k, out);
    return out;
  }
  baseZ(i, j) {
    return this.stencil(Math.floor(i / 256), Math.floor(j / 256))[
      (j & 255) * 257 + (i & 255)
    ];
  }
  // Infer a continuous local water surface from *water-classified* stored DEM observations.
  // A bank DEM sample can be tens of metres above a channel in the Ghats. Never lift a
  // broad water polygon to match that bank. These robust grades are NOT bathymetry.
  waterLevel(X, Y) {
    const wetGrade = (i, j) => {
      const k = i + "," + j;
      if (this.wetGrades.has(k)) return this.wetGrades.get(k);
      const heights = [];
      for (let y = j * 8 - 3; y < j * 8 + 11; y += 1)
        for (let x = i * 8 - 3; x < i * 8 + 11; x += 1) {
          const c = this.t.at(x, y);
          if (c?.d && (c.c === 3 || c.c === 4) && c.z !== -32768)
            heights.push(c.z);
        }
      heights.sort((a, b) => a - b);
      let h = heights.length
        ? heights[Math.floor((heights.length - 1) * 0.23)]
        : null;
      this.wetGrades.set(k, h);
      return h;
    };
    const a = X / 8 - 0.5,
      b = Y / 8 - 0.5,
      i = Math.floor(a),
      j = Math.floor(b),
      u = a - i,
      v = b - j;
    let sum = 0,
      weight = 0;
    for (const [I, J, f] of [
      [i, j, (1 - u) * (1 - v)],
      [i + 1, j, u * (1 - v)],
      [i, j + 1, (1 - u) * v],
      [i + 1, j + 1, u * v],
    ]) {
      const h = wetGrade(I, J);
      if (h !== null) {
        sum += h * f;
        weight += f;
      }
    }
    return weight > 1e-6
      ? (sum / weight - this.o.z) * this.relief
      : this.baseZ(X, Y);
  }
  // One spatial index of the frozen vector paths. Sample a centripetal curve through each
  // original chain. Its local tangent drives BOTH moving wave normals and the motor's drift.
  // Unknown widths use an illustrative narrow shelf, not a fabricated river survey.
  channel(x, y) {
    if (!this.flowIndex) {
      const bins = new Map();
      for (const [key, t] of this.t.cache) {
        const [tx, ty] = key.split("_").map(Number);
        for (const [width, pts] of t.paths) {
          if (pts.length < 4) continue;
          const ps = [];
          for (let k = 0; k < pts.length; k += 2) {
            const v = new T.Vector3(
              tx * 256 + pts[k] / 16,
              0,
              ty * 256 + pts[k + 1] / 16,
            );
            if (!ps.length || v.distanceToSquared(ps.at(-1)) > 0.00001)
              ps.push(v);
          }
          if (ps.length < 2) continue;
          const curve = new T.CatmullRomCurve3(ps),
            h0 = this.t.height(ps[0].x, ps[0].z),
            h1 = this.t.height(ps.at(-1).x, ps.at(-1).z),
            sign = h1 !== -32768 && h0 !== -32768 && h1 > h0 + 1 ? -1 : 1;
          const half = width
              ? Math.min(3.2, Math.max(0.12, width / (2 * U)))
              : 0.18,
            R = half + 1.35;
          let prev = ps[0],
            chain = 0;
          for (let j = 1; j < ps.length; j++) {
            const n = Math.min(
              80,
              Math.max(1, Math.ceil(ps[j].distanceTo(ps[j - 1]) * 1.45)),
            );
            for (let l = 1; l <= n; l++) {
              const q = curve.getPoint((j - 1 + l / n) / (ps.length - 1)),
                dx = q.x - prev.x,
                dy = q.z - prev.z,
                L = Math.hypot(dx, dy);
              if (L > 0.00001) {
                const seg = {
                  x: prev.x,
                  y: prev.z,
                  dx,
                  dy,
                  L,
                  sign,
                  width,
                  half,
                  R,
                  chain,
                };
                for (
                  let J = Math.floor((Math.min(q.z, prev.z) - R) / 6);
                  J <= Math.floor((Math.max(q.z, prev.z) + R) / 6);
                  J++
                )
                  for (
                    let I = Math.floor((Math.min(q.x, prev.x) - R) / 6);
                    I <= Math.floor((Math.max(q.x, prev.x) + R) / 6);
                    I++
                  ) {
                    const tag = I + "," + J;
                    (bins.get(tag) || bins.set(tag, []).get(tag)).push(seg);
                  }
                chain += L * U;
              }
              prev = q;
            }
          }
        }
      }
      this.flowIndex = bins;
    }
    let best = null,
      dd = Infinity,
      frac = 0;
    for (const seg of this.flowIndex.get(
      Math.floor(x / 6) + "," + Math.floor(y / 6),
    ) || []) {
      const { dx, dy, L } = seg,
        t = T.MathUtils.clamp(
          ((x - seg.x) * dx + (y - seg.y) * dy) / (L * L),
          0,
          1,
        ),
        d = (x - seg.x - t * dx) ** 2 + (y - seg.y - t * dy) ** 2;
      if (d < dd && d < seg.R ** 2) {
        best = seg;
        dd = d;
        frac = t;
      }
    }
    return best ? { seg: best, dist: Math.sqrt(dd), frac } : null;
  }
  current(x, y, wet) {
    const q = this.channel(x, y);
    if (!q) return [0, 0, 0, 0, 0];
    const { seg: k, dist, frac } = q;
    return [
      (k.sign * k.dx) / k.L,
      (-k.sign * k.dy) / k.L,
      (0.2 + 0.75 * (1 - dist / k.R)) * wet,
      0,
      k.sign * (k.chain + frac * k.L * U),
    ];
  }
  sharp(x, y) {
    const a = Math.floor((x - 1) / 2) * 2,
      b = Math.floor((y - 1) / 2) * 2,
      u = (x - a - 1) / 2,
      v = (y - b - 1) / 2;
    let z = 0,
      w = 0;
    for (const [i, j, k] of [
      [0, 0, (1 - u) * (1 - v)],
      [2, 0, u * (1 - v)],
      [0, 2, (1 - u) * v],
      [2, 2, u * v],
    ]) {
      const h = this.t.height(a + i, b + j);
      if (h !== -32768) {
        z += h * k;
        w += k;
      }
    }
    return w ? (z / w - this.o.z) * this.relief : 0;
  }
  // Inland mask and marine polygons are sampled at acre centres. The quadratic kernel
  // and a small continuous warp round stair-steps without changing the source grid.
  ocean(x, y) {
    const A = Math.floor(x / 64),
      B = Math.floor(y / 64),
      poly = this.ec?.marine?.[A + "," + B];
    if (!poly || poly === 1) return !!poly;
    const X = (x - A * 64) * 32,
      Y = (y - B * 64) * 32;
    const inside = (r) => {
      let ok = false;
      for (let j = 0, k = r.length - 1; j < r.length; k = j++) {
        const a = r[j],
          b = r[k];
        if (
          a[1] > Y != b[1] > Y &&
          X < ((b[0] - a[0]) * (Y - a[1])) / (b[1] - a[1]) + a[0]
        )
          ok = !ok;
      }
      return ok;
    };
    return poly.some((p) => inside(p[0]) && !p.slice(1).some(inside));
  }
  node(i, j) {
    const k = i + "," + j;
    let n = this.nodes.get(k);
    if (n) return n;
    const c = this.t.at(i, j),
      sea = this.ocean(i + 0.5, j + 0.5),
      wet = sea || !!(c?.d && [3, 4].includes(c.c));
    n = {
      wet: +wet,
      sea: +sea,
      f: (c?.f <= 100 ? c.f : 0) * 0.01,
      slope: Math.min(1, (c?.s || 0) / 34),
    };
    this.nodes.set(k, n);
    return n;
  }
  mask(x, y) {
    const X =
        x +
        0.12 * Math.sin(y * 2.07 + Math.sin(x * 0.84)) +
        0.047 * Math.sin(y * 8.2 + x * 2.3),
      Y =
        y +
        0.11 * Math.sin(x * 2.28 + y * 0.61) +
        0.042 * Math.sin(x * 8.8 - y * 1.3),
      i = Math.floor(X),
      j = Math.floor(Y),
      u = X - i,
      v = Y - j;
    const weights = (t) => [
        (1 - t) * (1 - t) * 0.5,
        0.5 + t * (1 - t),
        t * t * 0.5,
      ],
      a = weights(u),
      b = weights(v);
    let wet = 0,
      sea = 0,
      forest = 0,
      rock = 0;
    for (let l = 0; l < 3; l++)
      for (let k = 0; k < 3; k++) {
        const n = this.node(i + k - 1, j + l - 1),
          w = a[k] * b[l];
        wet += n.wet * w;
        sea += n.sea * w;
        forest += n.f * w;
        rock += n.slope * w;
      }
    return [wet, sea, forest, rock];
  }
  point(x, y) {
    const i = Math.floor(x),
      j = Math.floor(y),
      u = x - i,
      v = y - j;
    const A = this.baseZ(i, j),
      B = this.baseZ(i + 1, j),
      C = this.baseZ(i, j + 1),
      D = this.baseZ(i + 1, j + 1);
    const [raster, sea, f, r] = this.mask(x, y),
      e = this.ec?.at(x, y) || {},
      shelf = Math.sin(x * 1.7 + y * 0.53 + Math.sin(y * 0.75));
    const ch = sea < 0.1 && raster < 0.999 ? this.channel(x, y) : null,
      narrow = ch
        ? (ch.seg.width ? 0.91 : 0.66) *
          (1 - smooth(0.12, 1.58, ch.dist / ch.seg.half))
        : 0,
      wet = Math.max(narrow, raster);
    let base = (A + (B - A) * u) * (1 - v) + (C + (D - C) * u) * v;
    const amp = smooth(0.22, 0.93, r) * this.relief,
      phase = base / (this.relief * (e.rock === 2 ? 6.2 : 9.1)) + shelf * 0.18;
    base +=
      amp *
      (Math.sin(phase * 6.283) * 0.8 + Math.sin(x * 3.3 + y * 1.7) * 0.94);
    const pad = this.homeMap?.get(i + "," + j);
    if (pad && wet < 0.035) {
      const d = padDistance(pad.h, x, y);
      base += (pad.z - base) * (1 - smooth(1, 9, d));
    }
    let line = base,
      z = base,
      depth = 0;
    if (wet > 0) {
      line = sea > 0.002 ? -this.o.z * this.relief : this.waterLevel(x, y);
      if (narrow > raster)
        line +=
          (Math.min(base + 0.1, Math.max(base - 1.1, line)) - line) *
          (1 - smooth(0.03, 0.35, raster));
      // A continuous stylised littoral shelf, NOT measured bathymetry. No submerged
      // wall at the mask edge. Bank, bed and water share this exact lattice.
      const signed = wet - 0.385;
      const bed =
        line -
        signed *
          (signed < 0 ? 7.5 : 5.35 + Math.min(2.8, (e.depth || 0) * 0.22));
      z = base + (bed - base) * smooth(0.006, 0.35, wet);
      depth = Math.max(0, line - z);
    }
    const coast = (e.coast ?? 300) < 3 && base / this.relief + this.o.z < 22;
    const rocks = smooth(0.26, 0.88, r) * (0.73 + 0.18 * shelf);
    const mud = Math.max(
      smooth(0.06, 0.38, wet) * (coast ? 0.12 : 0.93),
      Math.min(0.76, (e.marsh || 0) * 0.009),
    );
    const sand = Math.max(
      coast ? 0.84 + 0.1 * shelf : 0,
      smooth(0.16, 0.54, wet) * 0.3,
    );
    return {
      x,
      y,
      z,
      line,
      w: wet - 0.385,
      depth,
      mix: [sand, mud, rocks, f],
      sea,
    };
  }
  // Barycentric query on the SAME stored vertex heights as the renderer. No house pads.
  sample(x, y) {
    const g = this.axes.get(Math.floor(x / 64) + "," + Math.floor(y / 64));
    if (!g) {
      const p = this.point(x, y);
      return {
        z: p.z,
        line: p.line,
        depth: p.w > 0 ? p.depth : 0,
        drawn: false,
        m: p.mix,
        w: p.w,
      };
    }
    const at = (v, a) => {
      let l = 0,
        h = a.length - 1;
      while (l + 1 < h) {
        const k = (l + h) >> 1;
        if (a[k] <= v) l = k;
        else h = k;
      }
      return l;
    };
    const [X, Y, V, used, cuts] = g,
      n = X.length,
      i = at(x, X),
      j = at(y, Y),
      u = (x - X[i]) / (X[i + 1] - X[i]),
      v = (y - Y[j]) / (Y[j + 1] - Y[j]);
    const lo = u + v <= 1,
      k = j * n + i,
      A = V[lo ? k : k + n + 1],
      B = V[lo ? k + 1 : k + n],
      C = V[lo ? k + n : k + 1],
      a = lo ? u : 1 - u,
      b = lo ? v : 1 - v;
    const mix = (p, q, r) => p + (q - p) * a + (r - p) * b;
    const cut=cuts?.get(j*(n-1)+i);const sc=cut?subContact(cut,u,v):null;
    const z = mix(A.z, B.z, C.z)+(sc?.[0]||0),
      line = mix(A.line, B.line, C.line),
      w = mix(A.w, B.w, C.w);
    return {
      z,
      line,
      w,
      wear:sc?.[1]||0,
      drawn: !!used[j * (n - 1) + i],
      depth: w > 0 ? Math.max(0, line - z) : 0,
      m: A.mix.map((p, k) => mix(p, B.mix[k], C.mix[k])),
    };
  }
  ground(x, y) {
    return this.sample(x, y).z;
  }
  gradeAt(x, y) {
    const d = 0.28 / U;
    return [
      (this.ground(x + d, y) - this.ground(x - d, y)) / 0.56,
      (this.ground(x, y - d) - this.ground(x, y + d)) / 0.56,
    ];
  }
  waterline(x, y) {
    return this.sample(x, y).line;
  }
  field(i, j) {
    return { water: this.mask(i, j)[0] };
  }
  worldXYZ(x, y, h) {
    return [(x - this.atlas.x) * U, h, (this.atlas.y - y) * U];
  }
  xyz(x, y, h) {
    return [(x - this.o.x) * U, h, (this.o.y - y) * U];
  }
  traversable(x, y) {
    const c = this.t.at(x, y);
    return (
      !!(c?.d && (c.z !== -32768 || [3, 4].includes(c.c))) ||
      this.ocean(x, y) ||
      (this.ec?.at(x, y).coast < 2 &&
        (this.mask(x, y)[1] > 0 || (c && c.z !== -32768 && c.z < 12)))
    );
  }
}
export { materials } from "./nature-materials.js";
// Synchronous wrapper is useful for offline geometry audits. The live renderer cooperates
// with input and the frame loop between rows; a cancelled generation cannot become live.
export function chunk(...args) {
  const it = chunkRows(...args);
  let r;
  do {
    r = it.next();
  } while (!r.done);
  return r.value;
}
export async function streamChunk(args, valid) {
  const it = chunkRows(...args);
  let start = performance.now();
  while (true) {
    if (!valid()) return null;
    const r = it.next();
    if (r.done) return r.value;
    if (performance.now() - start >= 6) {
      await new Promise((done) => setTimeout(done, 0));
      start = performance.now();
    }
  }
}
function* chunkRows(s, cx, cy, step, mat, light = false) {
  const axis = (lo, focus) => {
    const a = [];
    for (let i = lo; i < lo + 64; i++) {
      const d = Math.abs(i + 0.5 - focus),
        sub = d < 4.7 ? 10 : d < 5.7 ? 5 : d < 7 ? 3 : d < 12 ? 1 : 0;
      if (sub) {
        for (let k = 0; k < sub; k++) a.push(i + k / sub);
      } else if (i === lo || i % (light ? (d < 25 ? 3 : 8) : step) === 0)
        a.push(i);
    }
    a.push(lo + 64);
    return a;
  };
  const X = axis(cx * 64, s.focus[0]),
    Y = axis(cy * 64, s.focus[1]),
    V = [],
    p = [],
    c = [],
    ix = [],
    wp = [],
    wc = [],
    wi = [],
    wf = [],
    n = X.length;
  for (const y of Y) {
    yield;
    for (const x of X) {
      const v = s.point(x, y);
      V.push(v);
      p.push(...s.xyz(x, y, v.z));
      c.push(...v.mix);
    }
  }
  const used = new Uint8Array((n - 1) * (Y.length - 1));
  const cuts=new Map(),wear=Array(V.length).fill(0);
  s.axes.set(cx + "," + cy, [X, Y, V, used,cuts]);
  const waterVertices = new Map();
  function wiFor(v, key) {
    let k = waterVertices.get(key);
    if (k !== undefined) return k;
    k = wc.length;
    waterVertices.set(key, k);
    wp.push(...s.xyz(v.x, v.y, v.line + 0.008));
    wc.push(Math.max(0, v.line - v.z));
    const flow = s.current(v.x, v.y, Math.max(0, v.w + 0.385));
    wf.push(flow[0], flow[1], Math.max(0, flow[2]), v.sea > 0.05 ? 1 : 0);
    return k;
  }
  function tri(a, b, d) {
    const list = [a, b, d];
    if (list.every((k) => V[k].w < 0)) return;
    const clip = [];
    for (let j = 0; j < 3; j++) {
      let i = list[j],
        k = list[(j + 1) % 3],
        v = V[i],
        q = V[k];
      if (v.w >= 0) clip.push(wiFor(v, i));
      if (v.w >= 0 === q.w >= 0) continue;
      const t = v.w / (v.w - q.w),
        m = (x, y) => x + (y - x) * t;
      clip.push(
        wiFor(
          {
            x: m(v.x, q.x),
            y: m(v.y, q.y),
            line: m(v.line, q.line),
            z: m(v.line, q.line),
            w: 0,
            sea: m(v.sea, q.sea),
          },
          Math.min(i, k) + "/" + Math.max(i, k),
        ),
      );
    }
    for (let j = 1; j + 1 < clip.length; j++)
      wi.push(clip[0], clip[j], clip[j + 1]);
  }
  for (let j = 0; j < Y.length - 1; j++) {
    yield;
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i,
        b = a + 1,
        d = a + n,
        e = d + 1;
      let x = (X[i] + X[i + 1]) * 0.5,
        y = (Y[j] + Y[j + 1]) * 0.5;
      if (
        !s.traversable(x, y) &&
        V[a].sea + V[b].sea + V[d].sea + V[e].sea === 0
      )
        continue;
      used[j * (n - 1) + i] = 1;
      if(!s.tread||!refineTread(s,s.tread,cuts,X,Y,V,n,i,j,p,c,wear,ix))ix.push(a, b, d, b, e, d);
      tri(a, b, d);
      tri(b, e, d);
    }
  }
  const build = (pos, idx) => {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  };
  const group = new T.Group(),
    land = build(p, ix);
  land.setAttribute("wear",new T.Float32BufferAttribute(wear,1));
  land.setAttribute("biome", new T.Float32BufferAttribute(c, 4));
  const m = new T.Mesh(land, mat.land);
  m.userData.role = "natural-terrain";
  group.add(m);
  if (wi.length) {
    const w = build(wp, wi);
    w.setAttribute("depthM", new T.Float32BufferAttribute(wc, 1));
    w.setAttribute("flow", new T.Float32BufferAttribute(wf, 4));
    const o = new T.Mesh(w, mat.water);
    o.userData.role = "continuous-water";
    group.add(o);
  }
  return group;
}
