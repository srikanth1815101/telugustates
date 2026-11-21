import { clearApproach, padDistance } from "./resident-scene.js";
import * as T from "../vendor/three.module.min.js";
import { ACRE as U } from "./metres.js";
import { noise } from "./habitats.js";
export const surfaceName = (h) =>
  h.support === "rock"
    ? "rock"
    : h.depth > 0.09
      ? "water"
      : h.m[0] > 0.55
        ? "sand"
        : h.m[1] > 0.39
          ? "mud"
          : h.m[2] > 0.55
            ? "rock"
            : "grass";
const cols = Object.fromEntries(
  Object.entries({
    green: "#76a344",
    lime: "#b2c769",
    shade: "#50804b",
    dry: "#c6a458",
    reed: "#8c9851",
    tip: "#e2d5a0",
    rock: "#8d8271",
    light: "#baab8d",
    earth: "#705c42",
    stem: "#6e6447",
    bloom: "#eae3ac",
    leaf: "#87b377",
  }).map(([k, c]) => [k, new T.Color(c)]),
);
export class FootCover {
  constructor(s, tier, uni) {
    this.s = s;
    this.tier = tier;
    this.g = new T.Group();
    this.tiles = new Map();
    this.last = "";
    this.mat = new T.ShaderMaterial({
      uniforms: uni,
      side: T.DoubleSide,
      vertexColors: true,
      vertexShader: `attribute float flex;varying vec3 C;uniform float uClock,uDay,uWind;uniform vec3 uSun;uniform vec4 actor;void main(){vec3 p=position;vec3 w=p;vec2 d=w.xz-actor.xy;float f=1.-smoothstep(.14,.67,length(d));p.xz+=flex*(vec2(.021,.011)*uWind*sin(w.x*.62+w.z*.35+uClock*1.57)+.15*f*normalize(d+.0001));p.y-=f*flex*.063;C=color*(.83+.24*max(0.,uSun.y))*mix(.5,1.,uDay);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader: `varying vec3 C;void main(){gl_FragColor=vec4(C,1.);\n#include <colorspace_fragment>\n}`,
    });
  }
  tile(I, J) {
    const s = this.s,
      tier = this.tier,
      p = [],
      c = [],
      flex = [],
      S = 8,
      summer = s.period === "summer";
    let count = 0;
    const vert = (x, y, z, col, fac, w) => {
      p.push(x, y, z);
      c.push(col.r * fac, col.g * fac, col.b * fac);
      flex.push(w);
    };
    const tri = (a, b, d, col, f, g, h, w1 = 0, w2 = 0, w3 = 0) => {
      vert(...a, col, f, w1);
      vert(...b, col, g, w2);
      vert(...d, col, h, w3);
    };
    const solids = [];
    function pebble(x, y, z, r, n, seed, tall = false) {
      const ht = r * (tall ? 0.79 + 0.34 * seed : 0.39 + 0.29 * seed),
        rim = [],
        top = [],
        shoulder = [],
        col = seed > 0.4 ? cols.rock : cols.light;
      for (let k = 0; k < n; k++) {
        const a = (k * 6.283) / n + 0.37 * seed,
          rad = r * (0.77 + 0.35 * noise(k, Math.floor(230 * seed), 4)),
          dx = Math.cos(a) * rad,
          dz = Math.sin(a) * rad * (0.64 + 0.18 * seed);
        const rx = x + dx * 0.84,
          rz = z + dz * 0.86;
        rim.push([
          rx,
          Math.min(y, s.ground((I * S + rx) / U, (J * S - rz) / U)) -
            0.09 * r -
            0.02,
          rz,
        ]);
        shoulder.push([x + dx, y + ht * (0.27 + 0.14 * Math.cos(a)), z + dz]);
        top.push([
          x + dx * (0.63 + 0.08 * Math.sin(a)) + r * 0.13,
          y + ht * (0.83 + 0.22 * Math.cos(a + 0.31)),
          z + dz * 0.71,
        ]);
      }
      if (ht >= 0.12) {
        const size = Math.max(
          ...[...rim, ...top, ...shoulder].map((p) =>
            Math.hypot(p[0] - x, p[2] - z),
          ),
        );
        const o = [(I * S + x) / U, (J * S - z) / U, (size + 0.34) / U, ht];
        solids.push(o);
        {
          // Every outcrop has load-bearing faces.
          const cv = ([a, b, c]) => [a - x, z - c, b - y];
          o.base = y;
          o.top = [];
          for (let k = 0; k < n; k++) {
            const j = (k + 1) % n;
            for (const t of [
              [rim[k], rim[j], shoulder[k]],
              [shoulder[k], rim[j], shoulder[j]],
              [shoulder[k], shoulder[j], top[k]],
              [top[k], shoulder[j], top[j]],
              [top[k], top[j], [x + r * 0.07, y + ht, z]],
            ])
              o.top.push(t.map(cv));
          }
        }
      }
      for (let k = 0; k < n; k++) {
        const j = (k + 1) % n,
          lit = 0.83 + 0.22 * Math.sin((k * 6.283) / n + 1.03);
        tri(
          rim[k],
          rim[j],
          shoulder[k],
          col,
          0.52 * lit,
          0.57 * lit,
          0.84 * lit,
        );
        tri(
          shoulder[k],
          rim[j],
          shoulder[j],
          col,
          0.85 * lit,
          0.54 * lit,
          0.86 * lit,
        );
        tri(shoulder[k], shoulder[j], top[k], col, 0.87 * lit, 0.86 * lit, lit);
        tri(top[k], shoulder[j], top[j], col, lit, 0.86 * lit, lit);
        tri(top[k], top[j], [x + r * 0.07, y + ht, z], col, 1.07, 1.07, 1.13);
      }
    }
    // Stable outcrops on the wet/dry seam or rocky slopes, at the same coordinates on all tiers.
    const cx = 1.7 + 4.2 * noise(I, J, 301),
      cz = 1.7 + 4.3 * noise(I, J, 302),
      gx0 = (I * S + cx) / U,
      gy0 = (J * S - cz) / U,
      base = s.sample(gx0, gy0),
      lith = base.m[2];
    if (
      noise(I, J, 303) <
      (base.w > -0.17 && base.depth < 0.85 ? 0.24 : lith > 0.67 ? 0.19 : 0.018)
    ) {
      const radius = (0.52 + noise(I, J, 304) * 0.95) * (lith > 0.7 ? 1.29 : 1);
      for (let k = 0; k < 3; k++) {
        const angle = noise(I, J, 309 + k) * 6.283,
          r = radius * (k === 0 ? 1 : 0.25 + 0.27 * noise(I, J, 317 + k)),
          X = cx + (!k ? 0 : Math.cos(angle) * radius * 1.27),
          Z = cz + (!k ? 0 : Math.sin(angle) * radius * 1.32),
          G = (I * S + X) / U,
          Q = (J * S - Z) / U,
          z = s.ground(G, Q);
        const home = s.homeMap?.get(Math.floor(G) + "," + Math.floor(Q))?.h;
        if (
          (s.ways && !s.ways.clear(G, Q, r)) ||
          s.tread?.hit(G, Q, r)?.wear > 0 ||
          clearApproach(s, G, Q, 1.8 + r) ||
          (home && padDistance(home, G, Q) < r + 0.8)
        )
          continue;
        pebble(X, z, Z, r, 7, noise(I, J, 323 + k), true);
      }
    }
    const N = tier === 0 ? 8 : tier === 1 ? 11 : 13;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const A = I * N + i,
          B = J * N + j,
          h = (k) => noise(A, B, k),
          x = ((i + h(3)) * S) / N,
          z = ((j + h(7)) * S) / N;
        const gx = (I * S + x) / U,
          gy = (J * S - z) / U,
          hit = s.sample(gx, gy),
          surf = surfaceName(hit),
          y = hit.z,
          patch =
            0.5 +
            0.24 * Math.sin((I * S + x) * 0.34 + (J * S - z) * 0.19) +
            0.21 * Math.sin((J * S - z) * 0.47 + (I * S + x) * 0.31);
        const plot = s.homeMap?.get(Math.floor(gx) + "," + Math.floor(gy))?.h;
        if (
          (plot && padDistance(plot, gx, gy) < 0.45) ||
          (s.ways && !s.ways.clear(gx, gy, -0.48))
        )
          continue;
        if (!hit.drawn || hit.depth > 1.28 || (hit.wear || 0) > h(217) * 0.26)
          continue;
        const damp = hit.m[1],
          sand = hit.m[0],
          stony = hit.m[2],
          v = h(24),
          shore = hit.w > -0.21 && hit.w < 0.25;
        if (v < (shore ? 0.145 : 0.026) + stony * 0.07 + sand * 0.02) {
          pebble(
            x,
            y,
            z,
            (shore ? 0.06 : 0.023) + Math.pow(h(22), 3) * (shore ? 0.75 : 0.28),
            5 + Math.floor(h(28) * 3),
            h(19),
          );
          continue;
        }
        const reed = shore && patch > 0.57 && h(12) < 0.4,
          wet = hit.depth > 0.13;
        if (
          !reed &&
          (wet ||
            v > 0.4 + patch * 0.61 - sand * 0.88 - damp * 0.47 - stony * 0.58)
        )
          continue;
        const blades = reed ? 5 : 3 + Math.floor(h(11) * 4),
          H =
            (reed ? 0.33 + 0.32 * h(2) : 0.065 + 0.149 * h(2)) *
            (0.59 + patch * 0.86);
        for (let k = 0; k < blades; k++) {
          const a = k * 2.399 + h(8) * 6.28,
            sn = Math.sin(a),
            cs = Math.cos(a),
            r = 0.032 + h(k + 140) * 0.1,
            ht = H * (0.58 + h(k + 41) * 0.59),
            w = (reed ? 0.012 : 0.011) + ht * 0.042,
            bend = ht * (0.22 + h(k + 78) * 0.48),
            X = x + cs * r,
            Z = z + sn * r,
            dx = -sn * w,
            dz = cs * w;
          const col = reed
            ? cols.reed
            : summer && h(28) > 0.22
              ? cols.dry
              : h(31) < 0.35
                ? cols.shade
                : h(32) > 0.53
                  ? cols.lime
                  : cols.green;
          const by = s.ground((I * S + X) / U, (J * S - Z) / U),
            l = [X - dx, by - 0.041, Z - dz],
            rr = [X + dx, by - 0.041, Z + dz],
            m = [X + cs * bend * 0.38, by + ht * 0.63, Z + sn * bend * 0.38],
            end = [X + cs * bend, by + ht, Z + sn * bend],
            ll = [m[0] - dx * 0.64, m[1], m[2] - dz * 0.64];
          tri(l, rr, m, col, 0.63, 0.69, 1, 0, 0, 0.48);
          tri(l, m, ll, col, 0.65, 1, 0.92, 0, 0.48, 0.46);
          tri(ll, m, end, col, 0.94, 1, 1.15, 0.46, 0.48, 1);
          if (reed && k === 1 && h(53) > 0.45) {
            const w = 0.024;
            tri(
              [end[0] - w, end[1] - 0.06, end[2]],
              [end[0] + w, end[1] - 0.06, end[2]],
              [end[0], end[1] + 0.115, end[2]],
              cols.stem,
              0.84,
              1,
              1.1,
              1,
              1,
              1,
            );
          }
        }
        count++;
      }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(p, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(c, 3));
    g.setAttribute("flex", new T.Float32BufferAttribute(flex, 1));
    g.computeBoundingSphere();
    const m = new T.Mesh(g, this.mat);
    // Positions and actor uniform share the same local metre frame.
    g.translate(...s.xyz((I * S) / U, (J * S) / U, 0));
    m.userData.clumps = count;
    m.userData.solids = solids;
    return m;
  }
  update(x, y) {
    const I = Math.floor((x * U) / 8),
      J = Math.ceil((y * U) / 8),
      K = I + "," + J;
    if (K !== this.last) {
      this.last = K;
      const r = this.tier === 0 ? 2 : 3,
        keep = new Set(),
        todo = [];
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          const d = di * di + dj * dj;
          if (d > (r + 0.48) ** 2) continue;
          const i = I + di,
            j = J + dj,
            key = i + "," + j;
          keep.add(key);
          if (!this.tiles.has(key)) todo.push({ i, j, key, d });
        }
      for (const [k, o] of this.tiles)
        if (!keep.has(k)) {
          o.geometry.dispose();
          o.removeFromParent();
          this.tiles.delete(k);
        }
      this.todo = todo.sort((a, b) => a.d - b.d);
      this.recount = true;
    }
    // A tile under the feet is immediate. Stream the surrounding grass over succeeding
    // frames instead of making the motor wait for an entire ring in one long JS task.
    const until = performance.now() + 2.4;
    while (this.todo?.length) {
      const { i, j, key } = this.todo.shift(),
        ob = this.tile(i, j);
      this.tiles.set(key, ob);
      this.g.add(ob);
      this.recount = true;
      if (performance.now() >= until) break;
    }
    if (this.recount) {
      this.count = 0;
      this.solids = [];
      for (const o of this.tiles.values()) {
        this.count += o.userData.clumps;
        this.solids.push(...o.userData.solids);
      }
      this.recount = false;
    }
  }
  dispose() {
    for (const o of this.tiles.values()) o.geometry.dispose();
    this.tiles.clear();
    this.mat.dispose();
    this.g.removeFromParent();
  }
}
