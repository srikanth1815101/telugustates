import { velocityAt } from "./current-page.js";
import {
  runPace,
  shelfDepth,
  bankGain,
  bankMix,
  contactLift,
} from "./river-margin.js";
import { beachFace, tidalBed, seaLift } from "./surf-zone.js";
import { soilField } from "./soil-field.js";
import { headAt, warpWaterXY } from "./hydraulic-stage.js";
import { bankBuilder, bankSample } from "./bank-mesh.js";
import { emitTreadCells, subContact } from "./tread.js";
import { benchAt } from "./house-ground.js";
import * as T from "../vendor/three.module.min.js";
import { ACRE as U, RELIEF as V } from "./metres.js";
import { smooth } from "./sky.js";
// One separable, normalized binomial Gaussian (σ≈1.12 acres in each axis). Read a tile halo, not clamped edges.
const K = [1, 5, 10, 10, 5, 1],
  N = 256;
const channelWater = (ch) =>
  ch
    ? (ch.seg.width ? 0.91 : 0.66) *
      (1 - smooth(0.12, 1.58, ch.dist / ch.seg.half))
    : 0;
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
    const tx = i >> 8,
      ty = j >> 8,
      tag = tx + "_" + ty;
    let page = this.maps.get(tag);
    if (!page) {
      page = new Float32Array(257 * 257);
      page.fill(NaN);
      this.maps.set(tag, page);
    }
    const idx = (j & 255) * 257 + (i & 255);
    if (!Number.isNaN(page[idx])) return page[idx];
    const local = this.t.cache.get(tag),
      xx = i & 255,
      yy = j & 255;
    let z = 0,
      w = 0;
    for (let y = 0; y < 6; y++) {
      let hv = 0,
        hw = 0;
      for (let x = 0; x < 6; x++) {
        const a = xx + x - 3,
          b = yy + y - 3,
          h =
            local && a >= 0 && a < 256 && b >= 0 && b < 256
              ? local.h[(b >> 1) * 128 + (a >> 1)]
              : this.t.height(i + x - 3, j + y - 3);
        if (h !== -32768) {
          hv += h * K[x];
          hw += K[x];
        }
      }
      z += hv * K[y];
      w += hw * K[y];
    }
    let h0 = w ? z / w : 0;
    const sl = local?.s[yy * 256 + xx] || 0;
    if (w && sl > 8) {
      const real = this.sharp(i, j) / this.relief + this.o.z;
      h0 += (real - h0) * Math.min(0.91, (sl - 8) * 0.042);
      const period = this.ec?.at(i, j)?.rock === 2 ? 10 : 14,
        b = Math.floor(h0 / period),
        u = h0 / period - b;
      h0 += (smooth(0.29, 0.69, u) - u) * period * smooth(11, 27, sl) * 0.4;
    }
    return (page[idx] = Math.fround(w ? (h0 - this.o.z) * this.relief : 0));
  }
  waterLevel(x, y, ch = null) {
    const v = headAt(this, x, y);
    if (v?.still === 1) return (v.h - this.o.z) * this.relief;
    const q = ch || this.channel(x, y),
      centre = q ? q.seg.h0 + (q.seg.h1 - q.seg.h0) * q.frac : 0;
    // A cross-section should cross a current, not descend a valley wall. Map equal normal offsets to the same longitudinal station. Blend only in the outer apron or at a still-water confluence.
    const blend = q
        ? (1 - smooth(q.seg.half + 0.07, q.seg.R, q.dist)) *
          (1 - (v?.still || 0))
        : 0,
      h = v ? v.h + (centre - v.h) * blend : centre;
    return (h - this.o.z) * this.relief;
  }
  // One spatial index of the frozen vector paths. Sample a centripetal curve through each
  // original chain. Its local tangent drives BOTH moving wave normals and the motor's drift.
  // Unknown widths use an illustrative narrow shelf, not a fabricated river survey.
  channel(x, y) {
    if (!this.flowIndex) {
      const bins = new Map();
      for (const [key, t] of this.t.cache) {
        const [tx, ty] = key.split("_").map(Number);
        for (const [pi, [width, pts]] of t.paths.entries()) {
          if (pts.length < 4) continue;
          const ps = [],
            heights = [];
          for (let k = 0; k < pts.length; k += 2) {
            const v = new T.Vector3(
              tx * 256 + pts[k] / 16,
              0,
              ty * 256 + pts[k + 1] / 16,
            );
            if (!ps.length || v.distanceToSquared(ps.at(-1)) > 0.00001) {
              ps.push(v);
              heights.push((t.pathHead?.[pi]?.[k / 2] ?? 1024) / 16 - 64);
            }
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
                  h0:
                    heights[j - 1] +
                    ((heights[j] - heights[j - 1]) * (l - 1)) / n,
                  h1: heights[j - 1] + ((heights[j] - heights[j - 1]) * l) / n,
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
  current(x, y, wet, sea = this.ocean(x, y), signed = null) {
    const f = this.reachCurrent(x, y, wet, sea);
    if (f[2] <= 0.38 || sea) return f;
    const running = smooth(0.38, 0.64, f[2]);
    const shore = signed ?? this.wet(x, y) - 0.385;
    const shear = smooth(0.002, 0.23, shore);
    f[2] *= 1 - 0.45 * running * (1 - shear);
    // Near a fitted edge the stream turns along it. Away from the edge retain the signed vector/head gradient.
    // If the flow is exactly normal to the bank there is no unambiguous tangent: don't invent a reversal.
    if (shore < 0.18 && shore > -0.07) {
      const d = 0.027,
        xx = this.wet(x + d, y) - this.wet(x - d, y),
        zz = this.wet(x, y - d) - this.wet(x, y + d),
        n = Math.hypot(xx, zz);
      if (n > 0.001) {
        let tx = -zz / n,
          tz = xx / n;
        const dot = f[0] * tx + f[1] * tz,
          sg = Math.sign(dot),
          w =
            running *
            0.95 *
            (1 - smooth(0.012, 0.18, shore)) *
            smooth(0.035, 0.34, Math.abs(dot));
        const dx = f[0] * (1 - w) + tx * sg * w,
          dz = f[1] * (1 - w) + tz * sg * w,
          L = Math.hypot(dx, dz);
        if (L > 0.01) {
          f[0] = dx / L;
          f[1] = dz / L;
        }
      }
    }
    return f;
  }
  reachCurrent(x, y, wet, sea) {
    // +x east, +z south. Vector direction and speed in metres/second are shared by the shader and swimmer.
    if (sea) {
      return [-0.938, 0.347, 0, 1, 0];
    }
    const i0 = Math.floor(x - 0.5),
      j0 = Math.floor(y - 0.5),
      u0 = x - i0 - 0.5,
      v0 = y - j0 - 0.5;
    let reach = 0,
      pool = 0;
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const ax = i0 + dx,
          ay = j0 + dy,
          w = (dx ? u0 : 1 - u0) * (dy ? v0 : 1 - v0),
          ca = this.t.at(ax, ay);
        if (ca?.c === 4) reach += w;
        if (
          (ca?.head || 0) & 32768 ||
          (!ca?.head && headAt(this, ax + 0.5, ay + 0.5)?.pool)
        )
          pool += w;
      }
    const q = this.channel(x, y);
    const ambient = () => {
      const openGate = Math.max(reach, smooth(0.18, 0.42, this.mask(x, y)[0])),
        gate = openGate * (1 - pool) + smooth(0, 0.55, reach) * pool;
      if (gate > 0.001) {
        const baked = velocityAt(this.t, x, y);
        if (baked) {
          baked[2] *= wet * gate;
          return baked;
        }
      }
      const openReach = reach * (1 - pool);
      if (openReach <= 0.001) return [0, 0, 0, 0, 0];
      let gx =
          (this.waterLevel(x - 0.5, y) - this.waterLevel(x + 0.5, y)) /
          (U * this.relief),
        gz =
          (this.waterLevel(x, y + 0.5) - this.waterLevel(x, y - 0.5)) /
          (U * this.relief),
        grade = Math.hypot(gx, gz);
      // A quantised, vector-less reach can be level over a single acre. Seek a broader downhill signal, never a default compass direction.
      if (grade <= 0.00001) {
        for (const d of [1.5, 3.5, 6]) {
          const h = (X, Y) => headAt(this, X, Y);
          const A = h(x - d, y),
            B = h(x + d, y),
            C = h(x, y + d),
            D = h(x, y - d);
          gx = A && B && !A.pool && !B.pool ? (A.h - B.h) / (2 * d * U) : 0;
          gz = C && D && !C.pool && !D.pool ? (C.h - D.h) / (2 * d * U) : 0;
          grade = Math.hypot(gx, gz);
          if (grade > 0.00001) break;
        }
      }
      return grade > 0.00001
        ? [gx / grade, gz / grade, runPace(grade) * wet * openReach, 0, 0]
        : [0, 0, 0, 0, 0];
    };
    if (!q || wet <= 0) return ambient();
    const { seg: k, dist, frac } = q;
    if (!k.hydro) {
      const dx = k.dx / k.L,
        dy = k.dy / k.L,
        X = k.x + 0.5 * k.dx,
        Y = k.y + 0.5 * k.dy;
      const d = 1.1,
        dh =
          (this.waterLevel(X - d * dx, Y - d * dy) -
            this.waterLevel(X + d * dx, Y + d * dy)) /
          this.relief;
      const sg = Math.abs(dh) > 0.001 ? Math.sign(dh) : k.sign,
        grade = Math.abs(dh) / (2 * d * U);
      k.hydro = [sg * dx, -sg * dy, runPace(grade), grade];
    }
    const [dx, dz, pace] = k.hydro,
      alongM = frac * k.L * U,
      qOpen = pace * (0.82 + 0.18 * Math.max(0, 1 - dist / k.R)) * wet,
      qPool =
        wet *
        reach *
        0.38 *
        (1 - smooth(k.half * 0.48, k.half * 1.35 + 0.32, dist)),
      qSpd = qOpen * (1 - pool) + qPool * pool,
      rim = smooth(Math.min(k.R * 0.52, k.half * 0.95), k.R, dist),
      ambGate = Math.max(rim, pool * smooth(0.05, 0.65, reach));
    if (ambGate <= 0.001) return [dx, dz, qSpd, 0, alongM];
    const amb = ambient(),
      wAmb = Math.max(
        rim,
        smooth(0, 0.08, amb[2] - qSpd) * pool * smooth(0.05, 0.65, reach),
      ),
      vx = dx * qSpd * (1 - wAmb) + amb[0] * amb[2] * wAmb,
      vz = dz * qSpd * (1 - wAmb) + amb[1] * amb[2] * wAmb,
      sp = Math.hypot(vx, vz);
    return sp > 0.0001
      ? [vx / sp, vz / sp, sp, 0, alongM * (1 - wAmb) + amb[4] * wAmb]
      : [dx, dz, 0, 0, alongM];
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
      head: c?.head || 0,
      sea: +sea,
      f: (c?.f <= 100 ? c.f : 0) * 0.01,
      slope: Math.min(1, (c?.s || 0) / 34),
    };
    this.nodes.set(k, n);
    return n;
  }
  mask(x, y) {
    const [X, Y] = warpWaterXY(x, y),
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
  wet(x, y) {
    const [r, sea] = this.mask(x, y);
    if (sea >= 0.1 || r >= 0.999) return r;
    const ch = this.channel(x, y);
    return Math.max(r, channelWater(ch));
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
      e = this.ec?.surface?.(x, y) || this.ec?.at(x, y) || {},
      shelf = 2 * soilField(x * 0.38 + y * 0.14, y * 0.33 - x * 0.17, 12) - 1;
    const ch = sea < 0.1 && raster < 0.999 ? this.channel(x, y) : null,
      narrow = channelWater(ch),
      wet = Math.max(narrow, raster);
    let base = (A + (B - A) * u) * (1 - v) + (C + (D - C) * u) * v;
    const amp = smooth(0.22, 0.93, r) * this.relief,
      phase = base / (this.relief * (e.rock === 2 ? 6.2 : 9.1)) + shelf * 0.18;
    base +=
      amp *
      (Math.sin(phase * 6.283) * 0.8 +
        (soilField(x + y * 0.41, y * 0.87 - x * 0.41, 8) - 0.5) * 2.13);
    let line = base,
      z = base,
      depth = 0,
      hd = null;
    if (wet > 0) {
      hd = sea > 0.002 ? null : headAt(this, x, y);
      line = sea > 0.002 ? -this.o.z * this.relief : this.waterLevel(x, y, ch);
      // A continuous stylised littoral shelf, NOT measured bathymetry. No submerged
      // wall at the mask edge. Bank, bed and water share this exact lattice.
      const signed = wet - 0.385;
      let bed =
        line -
        signed *
          (signed < 0 ? 7.5 : 5.35 + Math.min(2.8, (e.depth || 0) * 0.22));
      if (hd && (hd.cliff > 0.01 || hd.lip > 0.01 || hd.plunge > 0.01)) {
        const ledgeBacking = line - (0.78 + 0.32 * Math.abs(shelf)),
          cliffW = Math.min(1, hd.cliff * 0.92 + hd.lip * 0.55);
        bed = bed + (ledgeBacking - bed) * cliffW - 2.2 * hd.plunge * (1 - hd.cliff);
      }
      z = base + (bed - base) * smooth(0.006, 0.35, wet);
      depth = Math.max(0, line - z);
    }
    // The acre survey cannot resolve hollows a few metres across. Sculpt modest, seeded field relief into the *actual* near land mesh,
    // before terrace grading. Fade out before the permanent fitted bank, surf apron and coarse survey. Boots and rain sample this same bed.
    const range = Math.max(
      Math.abs(x - this.focus[0]),
      Math.abs(y - this.focus[1]),
    );
    if (
      (e.coast ?? 300) > 1 &&
      !this.surveyGrid &&
      wet < 0.376 &&
      range < 3.85
    ) {
      const X = x * U,
        Y = y * U,
        az = X * 0.864 + Y * 0.503,
        bz = Y * 0.864 - X * 0.503,
        twist = soilField(az * 0.035, bz * 0.038, 91),
        g = soilField(az * 0.094 + twist * 0.46, bz * 0.074 - twist * 0.39, 82),
        swale = soilField(
          az * 0.042 - twist * 0.51,
          bz * 0.086 + twist * 0.34,
          143,
        ),
        pocket = 1 - smooth(0.13, 0.54, g * 0.71 + swale * 0.29),
        relief =
          (0.21 * (swale - 0.5) +
            0.092 * (g - 0.5) -
            (0.26 + 0.25 * swale) * pocket) *
          (1 - smooth(0.24, 0.376, wet)) *
          (1 - smooth(2.7, 3.85, range));
      z += relief;
      if (!wet) line = z;
    }
    const pad = this.padBins ? benchAt(this, x, y) : null;
    if (pad && wet < 0.385) {
      const weight = pad.w * (1 - smooth(0.32, 0.385, wet));
      z += (pad.z - z) * weight;
      if (!wet) line = z;
    }
    const coast =
      (1 - smooth(1.5, 4.5, e.coast ?? 300)) *
      (1 - smooth(17, 26, base / this.relief + this.o.z));
    const rocks = Math.max(
      smooth(0.26, 0.88, r) * (0.73 + 0.18 * shelf),
      hd ? Math.min(0.96, hd.cliff * 0.96 + hd.lip * 0.72) : 0,
    );
    const mud = Math.max(
      smooth(0.06, 0.38, wet) * (0.93 - 0.81 * coast),
      Math.min(0.76, (e.marsh || 0) * 0.009),
    );
    const sand = Math.max(
      coast * (0.84 + 0.1 * shelf),
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
      cliff: hd?.cliff || 0,
      lip: hd?.lip || 0,
      plunge: hd?.plunge || 0,
      outX: hd?.outX || 0,
      outZ: hd?.outZ || 0,
    };
  }
  // Barycentric query on the SAME stored vertex heights as the renderer, including terrace and bank cuts.
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
        sea: p.sea,
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
    const [X, Y, V, used, cuts, banks] = g,
      n = X.length,
      i = at(x, X),
      j = at(y, Y),
      u = (x - X[i]) / (X[i + 1] - X[i]),
      v = (y - Y[j]) / (Y[j + 1] - Y[j]);
    const fitted = banks?.get(j * (n - 1) + i);
    if (fitted) {
      const contact = bankSample(fitted, V, x, y);
      if (contact) return contact;
    }
    const lo = u + v <= 1,
      k = j * n + i,
      A = V[lo ? k : k + n + 1],
      B = V[lo ? k + 1 : k + n],
      C = V[lo ? k + n : k + 1],
      a = lo ? u : 1 - u,
      b = lo ? v : 1 - v;
    const mix = (p, q, r) => p + (q - p) * a + (r - p) * b;
    const cut = cuts?.get(j * (n - 1) + i);
    const sc = cut ? subContact(cut, u, v) : null;
    const z = mix(A.z, B.z, C.z) + (sc?.[0] || 0),
      line = mix(A.line, B.line, C.line),
      w = mix(A.w, B.w, C.w);
    return {
      z,
      line,
      w,
      sea: mix(A.sea, B.sea, C.sea),
      wear: sc?.[1] || 0,
      margin: bankMix(A, B, C, a, b),
      marginBed:
        A.margin || B.margin || C.margin
          ? mix(shelfDepth(A), shelfDepth(B), shelfDepth(C))
          : undefined,
      drawn: !!used[j * (n - 1) + i],
      depth: w > 0 ? Math.max(0, line - z) : 0,
      m: A.mix.map((p, k) => mix(p, B.mix[k], C.mix[k])),
    };
  }
  waterContact(x, y, h) {
    if (this.liquidTime == null) return h;
    if (!(h.sea > 0.05)) {
      if (!h.drawn || !h.margin || h.w < -0.056) return h;
      const dh = contactLift(h.margin, this.liquidTime),
        d = h.marginBed ?? shelfDepth(h);
      return { ...h, line: h.line + dh, depth: Math.max(0, d + dh) };
    }
    if (h.w < -0.142) return h;
    const datum = -this.o.z * this.relief,
      d = tidalBed(h, datum),
      wx = (x - this.atlas.x) * U,
      wz = (this.atlas.y - y) * U;
    const lift = seaLift(wx, wz, this.liquidTime, d);
    return { ...h, line: datum + lift, depth: Math.max(0, d + lift) };
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
  const inland = (s.ec?.at(...s.focus)?.coast ?? 300) > 1;
  const axis = (lo, focus, margin) => {
    const a = [];
    for (let i = lo; i < lo + 64; i++) {
      const d = Math.max(margin, Math.abs(i + 0.5 - focus)),
        sub = s.midRiverLOD
          ? d < 3
            ? 4
            : d < 8
              ? 2
              : d < 14
                ? 1
                : 0
          : s.mobileMesh && !s.surveyGrid
            ? d < 1.65
              ? 8
              : d < 3.2
                ? 5
                : d < 5.2
                  ? 2
                  : d < 9
                    ? 1
                    : 0
            : s.surveyGrid
              ? d < 9
                ? 1
                : 0
              : d < 1.9 && inland
                ? 20
                : d < 4.7
                  ? 10
                  : d < 5.7
                    ? 5
                    : d < 7
                      ? 3
                      : d < 12
                        ? 1
                        : 0;
      if (sub) {
        for (let k = 0; k < sub; k++) a.push(i + k / sub);
      } else if (
        i === lo ||
        i % (d < 25 ? (light ? 3 : 1) : light ? 8 : d < 65 ? 2 : 4) === 0
      )
        a.push(i);
    }
    a.push(lo + 64);
    return a;
  };
  // Keep the boot grid at the walker, not in long, dense stripes kilometres across the countryside.
  const away = (k, f) => Math.max(0, k * 64 - f, f - (k + 1) * 64),
    axes = (i, j) => [
      axis(i * 64, s.focus[0], away(j, s.focus[1])),
      axis(j * 64, s.focus[1], away(i, s.focus[0])),
    ];
  const [X, Y] = axes(cx, cy),
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
  const banks = new Map(),
    baseCount = V.length;
  const cuts = new Map(),
    wear = Array(V.length).fill(0);
  s.axes.set(cx + "," + cy, [X, Y, V, used, cuts, banks]);
  const waterVertices = new Map();
  const datum = -s.o.z * s.relief;
  const wg = [],
    aprons = [],
    skins = new WeakMap();
  let hasMarine = false;
  function wetVertex(v) {
    if (skins.has(v)) return skins.get(v);
    const f = s.current(v.x, v.y, 1, false, v.w),
      r = U * Math.hypot(v.x - s.focus[0], v.y - s.focus[1]),
      gain = bankGain(s, v, f, r);
    if (gain) {
      const world = s.worldXYZ(v.x, v.y, 0);
      v.margin = [world[0], world[2], f[0] * f[2], f[1] * f[2], gain];
    }
    skins.set(v, f);
    return f;
  }
  function freshwaterApron(a, b, c) {
    const V0 = [V[a], V[b], V[c]];
    if (
      V0.some((v) => v.sea > 0.016 || v.w > 0) ||
      !V0.some((v) => v.w < 0) ||
      !V0.some((v) => v.w > -0.056 && shelfDepth(v) > -0.3)
    )
      return;
    for (const v of V0) wetVertex(v);
    if (!V0.some((v) => v.margin)) return;
    const i0 = wiFor(V[a], a),
      i1 = wiFor(V[b], b),
      i2 = wiFor(V[c], c),
      y0 = wp[i0 * 3 + 1],
      y1 = wp[i1 * 3 + 1],
      y2 = wp[i2 * 3 + 1];
    if (Math.max(y0, y1, y2) - Math.min(y0, y1, y2) > 4.0) return;
    aprons.push(i0, i1, i2);
  }
  function wiFor(v, key, apron = false) {
    const marine = v.sea > 0.05 || apron;
    if (marine) hasMarine = true;
    if (apron && v.sea <= 0.05) key = "beach:" + key;
    let k = waterVertices.get(key);
    if (k !== undefined) return k;
    k = wc.length;
    waterVertices.set(key, k);
    const wl = !marine && v.w < -0.38 ? s.waterLevel(v.x, v.y) : v.line;
    wp.push(...s.xyz(v.x, v.y, (marine ? datum : wl) + 0.008));
    wc.push(marine ? tidalBed(v, datum) : shelfDepth(v));
    const flow = marine ? s.current(v.x, v.y, 1, true) : wetVertex(v);
    wg.push(marine ? 0 : v.margin?.[4] || 0);
    if (!marine && (v.plunge > 0.004 || v.cliff > 0.004 || v.lip > 0.004)) {
      const hasDir = v.outX * v.outX + v.outZ * v.outZ > 0.01;
      wf.push(
        hasDir ? v.outX : flow[0],
        hasDir ? v.outZ : flow[1],
        Math.max(0, flow[2], 1.75 * v.cliff + 0.85 * v.lip + 1.15 * v.plunge),
        -v.plunge,
      );
    } else {
      wf.push(flow[0], flow[1], Math.max(0, flow[2]), marine ? 1 : 0);
    }
    return k;
  }
  // Refine only nearby MARINE edges. Any two adjacent triangles share the same midpoint decision,
  // including clipped shore polygons. This final sea-only split does not move inland banks or the walkable bed.
  const mids = new Map(),
    centre = s.xyz(s.focus[0], s.focus[1], 0);
  function mid(a, b, again) {
    if (wf[a * 4 + 3] + wf[b * 4 + 3] < 1.5) return -1;
    const X = (wp[a * 3] + wp[b * 3]) * 0.5,
      Z = (wp[a * 3 + 2] + wp[b * 3 + 2]) * 0.5;
    const r2 = (X - centre[0]) ** 2 + (Z - centre[2]) ** 2,
      near = r2 < 142 ** 2 && !s.surveyGrid;
    // Keep the original lattice at the boot contour. Resolve the taller, shorter breaker faces just offshore; no extra triangles on inland water.
    const smallest =
      near && Math.min(wc[a], wc[b]) > 0.94 ? 2.45 : again ? Infinity : 4;
    if (
      r2 > 258 ** 2 ||
      (wp[a * 3] - wp[b * 3]) ** 2 + (wp[a * 3 + 2] - wp[b * 3 + 2]) ** 2 <
        smallest * smallest
    )
      return -1;
    const tag = Math.min(a, b) + "," + Math.max(a, b);
    if (mids.has(tag)) return mids.get(tag);
    const i = wc.length;
    mids.set(tag, i);
    wg.push(0);
    wp.push(X, (wp[a * 3 + 1] + wp[b * 3 + 1]) * 0.5, Z);
    wc.push((wc[a] + wc[b]) * 0.5);
    for (let k = 0; k < 4; k++) wf.push((wf[a * 4 + k] + wf[b * 4 + k]) * 0.5);
    return i;
  }
  function leaf(a, b, c) {
    wi.push(a, b, c);
  }
  function split(a, b, c, again, put) {
    const d = mid(a, b, again),
      e = mid(b, c, again),
      f = mid(c, a, again);
    if (d >= 0 && e >= 0 && f >= 0) {
      put(a, d, f);
      put(d, b, e);
      put(e, c, f);
      put(d, e, f);
    } else if (d < 0 && e < 0 && f < 0) leaf(a, b, c);
    else {
      const q = [a, b, c],
        m = [d, e, f];
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3,
          k = (i + 2) % 3;
        if (m[i] >= 0 && m[k] < 0) {
          put(q[i], m[i], q[k]);
          if (m[j] < 0) put(m[i], q[j], q[k]);
          else {
            put(m[i], q[j], m[j]);
            put(m[i], m[j], q[k]);
          }
          break;
        }
      }
    }
  }
  const details = (a, b, c) => split(a, b, c, true, leaf),
    sheet = (a, b, c) => split(a, b, c, false, details);
  const index = (k) => (k < baseCount ? k : V[k].landIndex);
  const shore = bankBuilder(
    s,
    cx,
    cy,
    V,
    {
      vertex(v) {
        v.landIndex = p.length / 3;
        p.push(...s.xyz(v.x, v.y, v.z));
        wear.push(0);
        c.push(...v.mix);
      },
      land(a, b, d) {
        ix.push(index(a), index(b), index(d));
      },
      beach(a, b, c) {
        if (beachFace(V[a], V[b], V[c]))
          sheet(
            wiFor(V[a], a, true),
            wiFor(V[b], b, true),
            wiFor(V[c], c, true),
          );
        else freshwaterApron(a, b, c);
      },
      water(a, b, c) {
        sheet(wiFor(V[a], a), wiFor(V[b], b), wiFor(V[c], c));
      },
    },
    X,
    Y,
    [axes(cx - 1, cy), axes(cx + 1, cy), axes(cx, cy - 1), axes(cx, cy + 1)],
  );
  yield* shore.prepare();
  function water(a, b, d) {
    if (V[a].w >= 0 && V[b].w >= 0 && V[d].w >= 0)
      sheet(wiFor(V[a], a), wiFor(V[b], b), wiFor(V[d], d));
    else if (beachFace(V[a], V[b], V[d]))
      sheet(wiFor(V[a], a, true), wiFor(V[b], b, true), wiFor(V[d], d, true));
    else freshwaterApron(a, b, d);
  }
  const extraDry = [];
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
      const cell = j * (n - 1) + i;
      used[cell] = 1;
      const fit = shore.cell(a, b, d, e, i, j);
      if (fit) {
        banks.set(cell, fit);
        continue;
      }
      water(a, b, d);
      water(b, e, d);
    }
  }
  const pushTreadVert = (gx, gy, gz, mix, wVal, dryVal) => {
    const idx = p.length / 3;
    p.push(...s.xyz(gx, gy, gz));
    c.push(mix[0], mix[1], mix[2], mix[3]);
    wear.push(wVal);
    extraDry.push([idx, dryVal]);
    return idx;
  };
  emitTreadCells(s, s.tread, cuts, X, Y, V, n, used, banks, pushTreadVert, ix);
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
  const dry = new Float32Array(p.length / 3).fill(0.385);
  for (let i = 0; i < V.length; i++) dry[index(i)] = -V[i].w;
  for (const [idx, dVal] of extraDry) dry[idx] = dVal;
  const cob = new Float32Array(p.length / 3).fill(-8);
  for (let i = 0; i < V.length; i++)
    if (V[i].sea > 0.05) cob[index(i)] = Math.max(-8, tidalBed(V[i], datum));
  // Four bytes per ground vertex. The exposed dirt remembers recent *local* overtopping; not a universal band and not rainwater.
  const stamp = new Int8Array((p.length / 3) * 4);
  for (let k = 3; k < stamp.length; k += 4) stamp[k] = -127;
  for (let i = 0; i < V.length; i++) {
    const v = V[i],
      k = index(i) * 4;
    if (!v.margin) continue;
    stamp[k] = Math.round((v.margin[2] / 2.12) * 127);
    stamp[k + 1] = Math.round((v.margin[3] / 2.12) * 127);
    stamp[k + 2] = Math.round(v.margin[4] * 127);
    stamp[k + 3] = Math.round(
      Math.min(1, Math.max(-1, shelfDepth(v) / 0.31)) * 127,
    );
  }
  land.setAttribute("bankStamp", new T.BufferAttribute(stamp, 4, true));
  land.setAttribute("tideBed", new T.BufferAttribute(cob, 1));
  land.setAttribute("dryness", new T.BufferAttribute(dry, 1));
  land.setAttribute("wear", new T.Float32BufferAttribute(wear, 1));
  land.setAttribute("biome", new T.Float32BufferAttribute(c, 4));
  const m = new T.Mesh(land, mat.land);
  m.userData.role = "natural-terrain";
  group.add(m);
  if (wi.length || aprons.length) {
    const meanCount = wi.length;
    for (const id of aprons) wi.push(id);
    const w = build(wp, wi);
    w.userData.meanIndexCount = meanCount;
    w.setAttribute("marginGain", new T.Float32BufferAttribute(wg, 1));
    w.setAttribute("depthM", new T.Float32BufferAttribute(wc, 1));
    w.setAttribute("flow", new T.Float32BufferAttribute(wf, 4));
    const o = new T.Mesh(w, mat.water);
    o.userData.role = "continuous-water";
    group.add(o);
    // Opaque ground and walker are drawn first. A late depth-only copy of just the surf triangles prevents a farther translucent wave painting over a nearer face.
    // Shallow run-up is excluded; inland water gets neither this geometry nor this pass. Share position/flow/depth buffers, not the entire index list.
    if (hasMarine && mat.surfDepth && !s.surveyGrid) {
      const ids = [];
      for (let j = 0; j < wi.length; j += 3) {
        const a = wi[j],
          b = wi[j + 1],
          c = wi[j + 2];
        if (
          wf[a * 4 + 3] < 0.99 ||
          wf[b * 4 + 3] < 0.99 ||
          wf[c * 4 + 3] < 0.99 ||
          Math.max(wc[a], wc[b], wc[c]) < 0.68
        )
          continue;
        if (
          (wp[a * 3] - centre[0]) ** 2 + (wp[a * 3 + 2] - centre[2]) ** 2 <
          470 ** 2
        )
          ids.push(a, b, c);
      }
      if (ids.length) {
        const g = new T.BufferGeometry();
        for (const k of ["position", "normal", "flow", "depthM", "marginGain"])
          g.setAttribute(k, w.attributes[k]);
        g.setIndex(ids);
        g.boundingSphere = w.boundingSphere.clone();
        const z = new T.Mesh(g, mat.surfDepth);
        z.renderOrder = 32760;
        z.userData.role = "breaking-surf-depth";
        group.add(z);
      }
    }
  }
  group.userData.bank = shore.stats;
  return group;
}
