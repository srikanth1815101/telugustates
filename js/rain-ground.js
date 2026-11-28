import { homesAt } from "./home-index.js";
import * as T from "../vendor/three.module.min.js";
import {
  Catchment,
  CORE,
  SPACING,
  TILE,
  STORM_RATE,
  siteAt,
  siteKey,
  rainMMH,
} from "./catchment.js";
import { impactRain } from "./regional-weather.js";
import { GroundInk, Ponds } from "./rill-sheet.js";
import { ACRE as M, inHouse } from "./metres.js";
import { soilField } from "./soil-field.js";
import { clearance, solidFor } from "./contacts.js";
export { CORE, SPACING, TILE };
// Play:storm time is unchanged during a shower. After it stops the same conservative solver drains at a gentler pace.
export const RECESSION_RATE = 15;
const displayHead = (p, f) =>
  (p.fromHead ?? p.level) + (p.level - (p.fromHead ?? p.level)) * f;
const N = 7 * CORE + 1,
  keep = 1 << 15;
// A contiguous hydraulic window; its 30 m cache pages are not independent watersheds. The 3-page halo keeps seams out of view.
export class RunoffWindow {
  constructor(surface, opts = {}) {
    this.s = surface;
    this.opts = opts;
    this.group = new T.Group();
    this.group.name = "hillslope-water";
    this.tiles = new Map();
    this.samples = new Map();
    this.checks = new Map();
    this.history = new Map();
    this.u = { wet: { value: 0 }, rain: { value: 0 } };
    this.frames = this.built = this.evicted = 0;
    this.stats = {};
    this.lastTime = null;
    this.acc = 0;
    this.residual = 0;
    this.rocks = new Map();
    this.climate = Array.from({ length: 12 }, () => ({ depth: 0, sat: 0 }));
    if (opts.uniforms) {
      this.pond = new Ponds(surface, opts.uniforms);
      this.group.add(this.pond.m);
    }
    this.s.rainStage = (x, y, h) => this.stage(x, y, h);
  }
  terrain(x, y) {
    const X = x / M,
      Y = y / M,
      h = this.s.sample(X, Y),
      a = h.m || [0, 0, 0, 0],
      homes = homesAt(this.s, X, Y);
    let wall = homes.some((h) => inHouse(h, X, Y, 0.03));
    const rocks = this.rocks.get(Math.floor(x / 12) + "," + Math.floor(y / 12));
    if (!wall && rocks) wall = rocks.some((o) => clearance(o, X, Y) < -0.29);
    const pores = soilField(0.078 * x - 0.036 * y, 0.058 * y + 0.047 * x, 134);
    return {
      h: h.z,
      open: !h.drawn || (h.w > 0 && h.depth > 0.008),
      wall,
      perm: Math.max(
        0.035,
        Math.min(
          0.98,
          0.07 +
            0.6 * pores +
            0.31 * (a[0] || 0) +
            0.14 * (a[3] || 0) -
            0.38 * (a[2] || 0) -
            0.18 * (h.wear || 0),
        ),
      ),
    };
  }
  read(x, y, i, j, k) {
    let v = this.samples.get(k);
    if (!v) {
      v = this.terrain(x, y);
      this.samples.set(k, v);
    }
    return v;
  }
  crest(a, b) {
    const l = Math.min(a.key, b.key),
      h = Math.max(a.key, b.key),
      key = l + ":" + h;
    let z = this.checks.get(key);
    const order = a.key === l;
    if (z === undefined) {
      const p = order ? a : b,
        q = order ? b : a,
        dx = q.x - p.x,
        dy = q.y - p.y;
      let top = p.h,
        prev = p.h,
        f = true,
        bk = true;
      for (let i = 1; i <= 18; i++) {
        const t = i / 18,
          v = i === 18 ? q : this.terrain(p.x + dx * t, p.y + dy * t);
        if (v.wall) {
          top = Infinity;
          break;
        }
        top = Math.max(top, v.h);
        if (v.h > prev + 0.00017) f = false;
        if (v.h < prev - 0.00017) bk = false;
        prev = v.h;
      }
      z = { sill: top, forward: f, backward: bk };
      this.checks.set(key, z);
    }
    return order
      ? z
      : { sill: z.sill, forward: z.backward, backward: z.forward };
  }
  obstacles(rows) {
    if (!rows || rows === this.source) return;
    this.source = rows;
    const next = new Map();
    let signature = "";
    for (const r of rows) {
      if (r.kind !== "rock" || !r.meshShape) continue;
      const o = solidFor(r, this.s.ec.presets);
      if (!o || o[2] * M < 0.94) continue;
      signature += r.x + "," + r.y + ";";
      const d = o[2] * M;
      for (
        let j = Math.floor((r.y * M - d) / 12);
        j <= Math.floor((r.y * M + d) / 12);
        j++
      )
        for (
          let i = Math.floor((r.x * M - d) / 12);
          i <= Math.floor((r.x * M + d) / 12);
          i++
        ) {
          const k = i + "," + j;
          (next.get(k) || next.set(k, []).get(k)).push(o);
        }
    }
    if (this.signature !== signature) {
      this.signature = signature;
      this.rocks = next;
      this.want = null;
      this.samples.clear();
      this.checks.clear();
      this.dirty = true;
    }
  }
  around(x, y) {
    return [Math.floor((x * M) / TILE), Math.floor((y * M) / TILE)];
  }
  remember() {
    if (!this.net) return;
    this.net.snapshot(this.history, this.elapsed || 0);
    if (this.history.size > keep) {
      const live = new Set(this.net.nodes.map((n) => n.key));
      for (const k of this.history.keys()) {
        if (!live.has(k)) this.history.delete(k);
        if (this.history.size < keep * 0.68) break;
      }
    }
  }
  inherit(other) {
    if (!other?.net) return;
    other.remember();
    this.history = new Map(other.history);
    this.climate = other.climate.map((v) => ({ ...v }));
    this.elapsed = other.elapsed || 0;
    this.acc = other.acc;
    this.lastTime = other.lastTime;
    this.dirty = true;
  }
  install(a, b) {
    this.remember();
    const elapsed = this.elapsed || 0,
      bg = (p) => this.climate[Math.round(p * 11)],
      state = {
        get: (key) => {
          const p = this.history.get(key);
          if (!p || elapsed - p.at < 2) return p;
          const f = Math.exp(-(elapsed - p.at) / 88);
          if (f < 0.004) return null;
          return { sat: p.sat * f, film: p.film * f, pool: p.pool * f };
        },
      };
    const net = new Catchment(
      N,
      (a - 3) * CORE,
      (b - 3) * CORE,
      (...args) => this.read(...args),
      {
        state,
        prime: bg,
        crest: (p, q) => this.crest(p, q),
        probe: (x, y) => this.terrain(x, y),
      },
    );
    const pages = new Map();
    for (let j = b - 3; j <= b + 3; j++)
      for (let i = a - 3; i <= a + 3; i++) {
        const k = i + "," + j;
        pages.set(k, true);
        if (!this.tiles.has(k)) this.built++;
      }
    for (const k of this.tiles.keys()) if (!pages.has(k)) this.evicted++;
    this.tiles = pages;
    this.net = net;
    this.cx = a;
    this.cy = b;
    this.dirty = false;
    this.fresh = true;
    if (this.samples.size > keep) this.samples.clear();
    if (this.checks.size > keep * 3) this.checks.clear();
  }
  async warm(x, y, valid) {
    const [a, b] = this.around(x, y);
    if (this.net && a === this.cx && b === this.cy && !this.dirty) return;
    let mark = performance.now();
    for (let j = (b - 3) * CORE; j <= (b + 4) * CORE; j++) {
      if (!valid()) return;
      for (let i = (a - 3) * CORE; i <= (a + 4) * CORE; i++) {
        const k = siteKey(i, j);
        if (this.samples.has(k)) continue;
        const [x, y] = siteAt(i, j);
        this.read(x, y, i, j, k);
      }
      if (performance.now() - mark > 5) {
        await new Promise((r) => setTimeout(r, 0));
        mark = performance.now();
      }
    } // Prepare the expensive bed intersections in small slices. A live walker can keep using the old 3-page halo as these arrive.
    const grid = [];
    for (let j = 0; j < N; j++) {
      if (!valid()) return;
      for (let i = 0; i < N; i++) {
        const I = (a - 3) * CORE + i,
          J = (b - 3) * CORE + j,
          key = siteKey(I, J),
          [X, Y] = siteAt(I, J),
          v = this.read(X, Y, I, J, key);
        const p = { x: X, y: Y, h: v.h, wall: v.wall, key };
        grid.push(p);
        const at = grid.length - 1;
        const edge = (p, q) => {
          if (!p.wall && !q.wall) this.crest(p, q);
        };
        if (i) edge(grid[at - 1], p);
        if (j) edge(grid[at - N], p);
        if (i && j) {
          const a = grid[at - N - 1],
            b = grid[at - N],
            c = grid[at - 1];
          if (
            (a.x - p.x) ** 2 + (a.y - p.y) ** 2 <
            (b.x - c.x) ** 2 + (b.y - c.y) ** 2
          )
            edge(a, p);
          else edge(b, c);
        }
        if (performance.now() - mark > 5) {
          await new Promise((r) => setTimeout(r, 0));
          if (!valid()) return;
          mark = performance.now();
        }
      }
    }
    if (valid()) this.install(a, b);
  }
  // Barycentric basin ownership matches the polygons used by Ponds. Only a true standing column can wet a boot, never a glint.
  stage(x, y, h) {
    const n = this.net;
    if (!n || !n.pits.length || !this.group.visible || h.depth > 0.01) return h;
    const X = x * M,
      Y = y * M,
      i = Math.floor(X / SPACING) - n.ox,
      j = Math.floor(Y / SPACING) - n.oy;
    if (i < 1 || j < 1 || i >= N - 2 || j >= N - 2) return h;
    for (let v = j - 1; v <= j + 1; v++)
      for (let u = i - 1; u <= i + 1; u++) {
        const k = 2 * (v * (N - 1) + u);
        for (let f = 0; f < 2; f++) {
          const [a, b, c] = n.faces[k + f].map((id) => n.nodes[id]),
            dx = b.x - a.x,
            dy = b.y - a.y,
            ex = c.x - a.x,
            ey = c.y - a.y,
            det = dx * ey - dy * ex,
            px = X - a.x,
            py = Y - a.y,
            w = (px * ey - py * ex) / det,
            z = (dx * py - dy * px) / det,
            t = 1 - w - z;
          if (Math.min(w, z, t) < -1e-7) continue;
          const B = n.pits[(t >= w && t >= z ? a : w >= z ? b : c).basin];
          const line = B ? displayHead(B, this.pondMix ?? 1) : h.z;
          return B && B.standing && line > h.z + 0.001
            ? { ...h, line, depth: line - h.z }
            : h;
        }
      }
    return h;
  }
  update(x, y, dx, dy, w, t, active = true, wetTime = t) {
    this.frames++;
    const rain = impactRain(w.rain),
      raining = rain > 0,
      uniforms = this.opts.uniforms;
    this.u.wet.value = Math.min(1, w.storage * 0.84 + rain * 0.37);
    this.u.rain.value = rain;
    // Close BOTH the CPU publication and the material gate on the first dry frame, even between hydraulic ticks or during a window hand-off.
    if (!raining && uniforms) uniforms.rillOn.value = 0;
    if (!raining) {
      if (this.curves?.length) this.curves = [];
      this.stats.rillsDrawn = false;
      this.stats.active = this.stats.downhillSegments = 0;
    }
    this.stats.rainMMH = rainMMH(rain);
    this.stats.precipitating = raining;
    this.stats.impactSurface = raining;
    const dt =
      this.lastTime === null
        ? 0
        : Math.max(0, Math.min(12, wetTime - this.lastTime));
    this.lastTime = wetTime;
    if (!active) {
      this.group.visible = false;
      this.stats.rillsDrawn = false;
      if (uniforms) uniforms.rillOn.value = 0;
      return;
    }
    if (!raining && !this.net && this.residual < 1e-5) {
      this.group.visible = false;
      return;
    }
    const [a, b] = this.around(x, y);
    if (
      !this.net ||
      this.dirty ||
      Math.max(Math.abs(a - this.cx), Math.abs(b - this.cy)) > 1 ||
      !this.opts.renderer
    ) {
      if (!this.net || a !== this.cx || b !== this.cy || this.dirty)
        this.install(a, b);
    } else if (a !== this.cx || b !== this.cy) {
      const want = a + "," + b;
      if (want !== this.want) {
        this.want = want;
        const permit = () => !this.dead && this.want === want;
        this.warm(x, y, permit).finally(() => {
          if (this.want === want) this.want = null;
        });
      }
    } else this.want = null;
    const n = this.net;
    this.acc += dt;
    const wet = raining || this.residual > 1e-5,
      period = this.opts.lite ? 0.39 : 0.199;
    // Interpolate the actual solved heads between ticks when draining, not the rainfall flag or the footprints of flowing streams.
    this.pondMix = Math.min(
      1,
      (this.pondMix ?? 1) + dt / (this.opts.lite ? 0.4 : 0.2),
    );
    if (
      (this.acc >= period || this.fresh) &&
      (wet || this.fresh || this.wasWet)
    ) {
      const steps = Math.floor((this.acc + 1e-8) / 0.2),
        delta = steps * 0.2,
        step = 0.2 * (raining ? STORM_RATE : RECESSION_RATE);
      for (const p of n.pits) p.fromHead = displayHead(p, this.pondMix);
      this.pondMix = raining ? 1 : 0;
      this.acc = Math.max(0, this.acc - delta);
      for (let i = 0; i < steps; i++) {
        n.step(step, rain);
        for (let k = 0; k < this.climate.length; k++) {
          const p = k / 11,
            q = this.climate[k],
            r = rainMMH(rain) / 3.6e6,
            f = (0.18 + 3.4 * p * p + (1 - q.sat) * (0.32 + 3.45 * p)) / 3.6e6;
          const loss = Math.min(q.depth + r * step, f * step);
          q.sat = Math.max(
            0,
            Math.min(
              1,
              q.sat +
                loss / (0.009 + 0.013 * p) -
                (rain > 0.02 ? 0.000003 : 0.000082) * step * q.sat,
            ),
          );
          q.depth = Math.max(
            0,
            Math.min(
              0.00025 + 0.00067 * p + Math.max(0, r - f) * 46,
              q.depth +
                r * step -
                loss -
                ((rain > 0.02 ? 0.07 : 0.9) / 3.6e6) * step,
            ),
          );
        }
      }
      this.elapsed = (this.elapsed || 0) + delta;
      // n.curves() also counts the drawn branches; never carry its last wet diagnostics into dry weather.
      const curves = raining ? n.curves() : [];
      const appearance = raining
        ? n.state
        : {
            joins: 0,
            splits: 0,
            heads: 0,
            active: 0,
            widthMetres: [0, 0],
            minFall: 0,
          };
      this.curves = curves;
      this.residual = n.stored();
      this.wasWet = wet;
      this.fresh = false;
      this.group.visible = wet;
      if (uniforms)
        uniforms.rillCentre.value.set(
          Math.round((x * M) / 3) * 3 - this.s.o.x * M,
          this.s.o.y * M - Math.round((y * M) / 3) * 3,
        );
      this.pond?.write(n, x * M, y * M);
      if (uniforms && this.opts.renderer) {
        if (raining && curves.length) {
          this.ink ??= new GroundInk(this.opts.lite);
          this.ink.write(curves, this.s, x, y);
          this.ink.draw(this.opts.renderer, uniforms);
        } else uniforms.rillOn.value = 0;
      }
      let stored = 0,
        area = 0,
        cells = 0,
        high = 0,
        spilling = 0;
      for (const p of n.pits)
        if (p.volume > 0.00001 && p.standing) {
          stored += p.volume;
          high = Math.max(high, p.level - p.floor);
          for (const a of p.cells) {
            if (a.h + 0.0001 >= p.level) break;
            area += a.area;
            cells++;
          }
        }
      for (const e of n.saddles) if (e.q > 1e-9) spilling++;
      this.stats = {
        ...appearance,
        downhillSegments: curves.length,
        impactSurface: raining,
        precipitating: raining,
        pondCells: cells,
        basins: n.pits.length,
        pondAreaM2: area,
        pondVolumeM3: stored,
        pondTriangles: this.pond?.triangles || 0,
        deepestM: high,
        spilling,
        exportM3: n.balance.exit,
        rainMMH: rainMMH(rain),
        waterM3: this.residual,
        budgetErrorM3:
          n.balance.initial +
          n.balance.rain -
          n.balance.soil -
          n.balance.evap -
          n.balance.exit -
          this.residual,
        elapsedS: this.elapsed,
        wetness: this.u.wet.value,
        wholeTerrainPass: true,
      };
    } else if (!wet) {
      this.acc = 0;
      this.group.visible = false;
      if (uniforms) uniforms.rillOn.value = 0;
    }
    if (uniforms) uniforms.pondBlend.value = this.pondMix;
    this.stats.rillsDrawn = !!(raining && uniforms?.rillOn.value);
    this.stats.frame = this.frames;
    this.stats.tiles = this.tiles.size;
    this.stats.built = this.built;
    this.stats.evicted = this.evicted;
    this.stats.centre = this.cx + "," + this.cy;
    let guard = 0;
    for (let j = b - 1; j <= b + 1; j++)
      for (let i = a - 1; i <= a + 1; i++)
        if (this.tiles.has(i + "," + j)) guard++;
    this.stats.guard = guard;
    this.stats.tileMetres = TILE;
  }
  dispose() {
    this.dead = true;
    this.ink?.dispose();
    this.pond?.dispose();
    this.tiles.clear();
    this.checks.clear();
    this.history.clear();
    this.samples.clear();
    this.group.removeFromParent();
    this.net = null;
  }
}
