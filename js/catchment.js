// Local, finite-volume rainfall/runoff model. Distances and head in m, storage in m³, flux in m³/s of storm time.
// The graph is shared across sampling tiles. Receiving rivers and the outer boundary are open; sheltered sites are walls.
import { soilField } from "./soil-field.js";
export const SPACING = 3,
  CORE = 10,
  TILE = CORE * SPACING,
  STORM_RATE = 40;
const clip = (v, l = 0, h = 1) => Math.max(l, Math.min(h, v));
export const rainMMH = (r) => (r > 0 ? 2 * r + 59 * r * r : 0);
export const siteKey = (i, j) => i + 1048576 * j;
function hash(i, j, k) {
  let h =
    Math.imul(i ^ Math.imul(k + 11, 1299709), 1597334677) ^
    Math.imul(j, 3812015801);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}
export function siteAt(i, j, sp = SPACING) {
  return [
    (i +
      0.5 +
      0.54 * (hash(i, j, 1) - 0.5) +
      0.3 * (soilField(i * 0.19, j * 0.23, 31) - 0.5)) *
      sp,
    (j +
      0.5 +
      0.54 * (hash(i, j, 2) - 0.5) +
      0.3 * (soilField(i * 0.23, j * 0.19, 46) - 0.5)) *
      sp,
  ];
}
function binHeight(b, v) {
  if (v <= 0) return b.floor;
  const a = b.breaks;
  let l = 0,
    h = a.length;
  while (l + 1 < h) {
    const k = (l + h) >> 1;
    if (a[k].v <= v) l = k;
    else h = k;
  }
  const q = a[l];
  return q.z + (v - q.v) / q.area;
}
function binVolume(b, z) {
  if (z <= b.floor) return 0;
  const a = b.breaks;
  let l = 0,
    h = a.length;
  while (l + 1 < h) {
    const k = (l + h) >> 1;
    if (a[k].z <= z) l = k;
    else h = k;
  }
  const q = a[l];
  return q.v + (z - q.z) * q.area;
}
// Triangular rill section, hydraulic radius A/P. No imposed common width. The bank side slope and roughness vary by bed.
export function section(Q, slope, side, roughness) {
  if (Q <= 0) return [0, 0, 0];
  const k = side / (2 * Math.sqrt(1 + side * side));
  const h = Math.pow(
    (Q * roughness) /
      (side * Math.pow(k, 2 / 3) * Math.sqrt(Math.max(0.0012, slope))),
    3 / 8,
  );
  return [2 * side * h, h, Q / (side * h * h)];
}
export class Catchment {
  constructor(
    N,
    ox,
    oy,
    read,
    {
      spacing = SPACING,
      state = null,
      crest = null,
      probe = null,
      prime = null,
    } = {},
  ) {
    this.probe = probe;
    this.N = N;
    this.ox = ox;
    this.oy = oy;
    this.spacing = spacing;
    this.nodes = [];
    this.edges = [];
    this.saddles = [];
    this.pits = [];
    this.faces = [];
    this.age = 0;
    this.balance = { rain: 0, soil: 0, evap: 0, exit: 0, initial: 0, spill: 0 };
    this.area = 0;
    const A = this.nodes;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const I = ox + i,
          J = oy + j,
          key = siteKey(I, J),
          [x, y] = siteAt(I, J, spacing),
          v = read(x, y, I, J, key),
          h = v.h;
        const p = clip(
            v.perm ?? 0.22 + 0.52 * soilField(x * 0.067, y * 0.067, 27),
          ),
          rel =
            0.57 *
              soilField(0.083 * x - 0.041 * y, 0.061 * y + 0.056 * x, 173) +
            0.43 * soilField(0.215 * x + 0.137 * y, 0.157 * y - 0.103 * x, 33),
          tight = clip(1.15 * (rel - 0.07));
        const prev = state?.get(key);
        A.push({
          id: A.length,
          key,
          I,
          J,
          x,
          y,
          h,
          rank: h + (hash(I, J, 5) - 0.5) * 0.000015,
          area: 0,
          exposure: v.exposure ?? 1,
          seedFilm: !prev && prime ? prime(p) : null,
          soil: p,
          conduct: 0.46 + 1.48 * tight,
          side: 1.65 + 2.9 * (1 - p) + 1.36 * tight,
          n: 0.023 + 0.047 * p,
          cap: 0.00008 + 0.00067 * p + 0.00033 * (1 - tight),
          sat: prev?.sat || 0,
          film: prev?.film || 0,
          carry: prev?.pool || 0,
          adj: [],
          to: [],
          inc: [],
          receiver: -1,
          basin: -1,
          open: v.open || !i || !j || i === N - 1 || j === N - 1,
          wall: !!v.wall,
          reach: 0,
          inQ: 0,
          sub: false,
        });
      }
    const pair = (i, j) => {
      const a = A[i],
        b = A[j];
      if (a.wall || b.wall) return;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        d = Math.hypot(dx, dy),
        bed = crest ? crest(a, b) : null,
        sill = Math.max(a.h, b.h, bed?.sill ?? bed ?? -Infinity);
      if (!Number.isFinite(sill)) return;
      a.adj.push({
        id: j,
        dx: dx / d,
        dy: dy / d,
        d,
        sill,
        monotone: bed?.forward ?? true,
      });
      b.adj.push({
        id: i,
        dx: -dx / d,
        dy: -dy / d,
        d,
        sill,
        monotone: bed?.backward ?? true,
      });
    };
    const face = (i, j, k) => {
      const a = A[i],
        b = A[j],
        c = A[k],
        area =
          Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 6;
      a.area += area;
      b.area += area;
      c.area += area;
      this.faces.push([i, j, k]);
    };
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        if (i + 1 < N) pair(k, k + 1);
        if (j + 1 < N) pair(k, k + N);
        if (j + 1 < N && i + 1 < N) {
          const a = A[k],
            b = A[k + 1],
            c = A[k + N],
            d = A[k + N + 1];
          if (
            (a.x - d.x) ** 2 + (a.y - d.y) ** 2 <
            (b.x - c.x) ** 2 + (b.y - c.y) ** 2
          ) {
            pair(k, d.id);
            face(k, b.id, d.id);
            face(k, d.id, c.id);
          } else {
            pair(b.id, c.id);
            face(k, b.id, c.id);
            face(b.id, d.id, c.id);
          }
        }
      }
    this.order = A.slice().sort((a, b) => b.rank - a.rank || b.key - a.key);
    for (const a of A) {
      if (a.wall || a.open) continue;
      this.area += a.area;
      let receivers = [];
      for (const v of a.adj) {
        const b = A[v.id];
        if (
          b.rank >= a.rank ||
          b.h > a.h + 0.00002 ||
          !v.monotone ||
          v.sill > a.h + 0.0002
        )
          continue;
        const slope = (a.h - b.h) / v.d,
          score =
            Math.max(0.000001, (a.rank - b.rank) / v.d) *
            (0.78 + 0.28 * b.conduct);
        receivers.push({
          ...v,
          a: a.id,
          b: b.id,
          s: Math.max(0.000001, slope),
          score,
          split: 0,
          q: 0,
          startQ: 0,
        });
      }
      receivers.sort((a, b) => b.score - a.score);
      if (!receivers.length) continue;
      const e = receivers[0];
      a.receiver = e.b;
      a.to.push(e);
      const f = receivers
        .slice(1)
        .find(
          (f) => f.score > e.score * 0.58 && f.dx * e.dx + f.dy * e.dy < 0.91,
        );
      if (
        f &&
        0.63 * ((a.conduct - 0.46) / 1.48) + 0.37 * hash(a.I, a.J, 31) > 0.57
      ) {
        const ratio = f.score / e.score;
        f.split = clip(
          Math.pow(ratio, 2.8) / (1 + Math.pow(ratio, 2.8)),
          0.04,
          0.49,
        );
        a.to.push(f);
      }
      for (const r of a.to) {
        this.edges.push(r);
        A[r.b].inc.push(r);
      }
    }
    // Static streambed directions, not a new random curve on every rain step. Collecting area helps distinguish incised threads from diffuse sheet flow.
    for (const a of A) a.contributing = a.area;
    for (const a of this.order) {
      if (a.to.length) {
        const f = a.to[1]?.split || 0;
        for (let i = 0; i < a.to.length; i++)
          A[a.to[i].b].contributing += a.contributing * (i ? f : 1 - f);
      }
    }
    for (const a of A) {
      let vx = 0,
        vy = 0,
        w = 0;
      for (const e of a.inc) {
        const v = A[e.a].contributing * (e.split || 1);
        vx += v * e.dx;
        vy += v * e.dy;
        w += v;
      }
      const d = Math.hypot(vx, vy) || 1,
        e = a.to[0];
      a.tx = (w ? vx / d : 0) + (e?.dx || 0);
      a.ty = (w ? vy / d : 0) + (e?.dy || 0);
      const norm = Math.hypot(a.tx, a.ty) || 1;
      a.tx /= norm;
      a.ty /= norm;
    }
    for (const e of this.edges) {
      const a = A[e.a],
        area = a.contributing * (e.split || 1);
      e.threshold =
        0.000023 +
        (0.00036 + 0.00075 * a.soil) / (1 + Math.pow(area / 68, 1.5));
    }
    // Each parcel descends to a specific pit or open receiver. Keep hollows: do not fill the DEM or excavate instant drains.
    for (let i = this.order.length - 1; i >= 0; i--) {
      const a = this.order[i];
      if (a.wall || a.open) continue;
      if (a.receiver >= 0) a.basin = A[a.receiver].basin;
      else {
        a.basin = this.pits.length;
        this.pits.push({
          id: a.basin,
          key: a.key,
          floor: a.h,
          level: a.h,
          volume: 0,
          cells: [],
          breaks: [],
          lip: Infinity,
          overflow: 0,
          received: 0,
        });
      }
      if (a.basin >= 0) this.pits[a.basin].cells.push(a);
    }
    for (const b of this.pits) {
      b.cells.sort((a, c) => a.h - c.h);
      let v = 0,
        area = 0,
        last = b.floor;
      for (const a of b.cells) {
        v += (a.h - last) * area;
        area += a.area;
        last = a.h;
        b.breaks.push({ z: a.h, area, v });
        b.volume += a.carry;
      }
      b.level = binHeight(b, b.volume);
    }
    // Lowest connecting saddle for EACH neighbouring pair. A pit can have more than one spillway; adjacent ponds can share a head.
    const links = new Map();
    for (const a of A)
      if (!a.wall)
        for (const l of a.adj) {
          const b = A[l.id];
          if (b.id <= a.id || b.wall || a.basin === b.basin) continue;
          const k =
            Math.min(a.basin, b.basin) + ":" + Math.max(a.basin, b.basin);
          const lip = l.sill;
          const prev = links.get(k);
          if (!prev || lip < prev.lip)
            links.set(k, {
              a: a.id,
              b: b.id,
              lip,
              d: l.d,
              q: 0,
              src: a.id,
              dst: b.id,
            });
        }
    for (const e of links.values()) {
      this.saddles.push(e);
      for (const i of [e.a, e.b])
        if (A[i].basin >= 0)
          this.pits[A[i].basin].lip = Math.min(
            this.pits[A[i].basin].lip,
            e.lip,
          );
    }
    this.saddles.sort((a, b) => a.lip - b.lip);
    for (const a of A) {
      if (a.seedFilm) {
        a.sat = a.seedFilm.sat;
        a.film = a.area * a.seedFilm.depth;
        a.seedFilm = null;
      }
      if (a.basin < 0) a.film += a.carry;
      a.carry = 0;
      if (a.open || a.wall) a.film = 0;
    }
    for (const e of this.edges) {
      const prev = state?.get(A[e.a].key);
      for (const v of prev?.flux || [])
        if (v[0] === A[e.b].key) {
          e.q = v[1];
          e.startQ = v[2];
          break;
        }
    }
    this.freeLevels();
    this.balance.initial = this.stored();
    this.state = null;
  }
  stored() {
    let v = 0;
    for (const a of this.nodes) v += a.film;
    for (const b of this.pits) v += b.volume;
    return v;
  }
  snapshot(map = new Map(), at = this.age) {
    for (const a of this.nodes) {
      const p = this.pits[a.basin];
      map.set(a.key, {
        at,
        flux: a.to
          .filter((e) => e.q > 0)
          .map((e) => [this.nodes[e.b].key, e.q, e.startQ]),
        sat: a.sat,
        film: a.film,
        pool: p ? Math.max(0, p.level - a.h) * a.area : 0,
      });
    }
    return map;
  }
  freeLevels() {
    for (const p of this.pits) p.standing = p.lip > p.floor + 0.0012;
    for (const e of this.saddles) {
      const a = this.pits[this.nodes[e.a].basin],
        b = this.pits[this.nodes[e.b].basin];
      if (
        a &&
        b &&
        a.volume > 0 &&
        b.volume > 0 &&
        Math.min(a.level, b.level) > e.lip + 0.002
      ) {
        a.standing = b.standing = true;
      }
    }
  }
  step(dt, rain) {
    if (!(dt > 0)) return;
    const { nodes: A, pits: B, balance: w } = this,
      mm = rainMMH(rain),
      R = mm / 3.6e6;
    for (const a of A) {
      a.inQ = 0;
      a.sub = false;
      if (a.wall || a.open) continue;
      const p = B[a.basin],
        water = p && p.volume > 0 ? Math.max(0, p.level - a.h) : 0;
      const input = R * a.exposure * a.area * dt;
      w.rain += input;
      a.film += input;
      // Wet soil accepts less new water. The retained first film is not a running channel.
      const soilRate =
          ((0.18 +
            3.4 * a.soil * a.soil +
            (1 - a.sat) * (0.32 + 3.45 * a.soil)) *
            a.area) /
          3.6e6,
        evapRate = ((rain > 0.02 ? 0.07 : 0.9) * a.area) / 3.6e6;
      let available = a.film + Math.min(p?.volume || 0, water * a.area),
        loss = Math.min(available, dt * soilRate),
        dry = Math.min(available - loss, dt * evapRate);
      w.soil += loss;
      w.evap += dry;
      let take = loss + dry;
      if (take > a.film && p) {
        p.volume = Math.max(0, p.volume - (take - a.film));
        a.film = 0;
      } else a.film = Math.max(0, a.film - take);
      a.sat = clip(
        a.sat +
          loss / (a.area * (0.009 + 0.013 * a.soil)) -
          (rain > 0.02 ? 0.000003 : 0.000082) * dt * a.sat,
      );
      a.sub = water > 0.0005;
    }
    // Spill deposited at the saddle receiver on the previous tick is a routed input, not new rain there.
    for (const e of this.saddles) if (e.q > 0) A[e.dst].inQ += e.q;
    for (const a of this.order) {
      const ee = a.to;
      if (a.wall || a.open) {
        w.exit += a.film;
        a.film = 0;
        continue;
      }
      const p = B[a.basin];
      if (!ee.length || a.sub) {
        if (p) {
          p.volume += a.film;
          p.received += a.film;
        } else w.exit += a.film;
        a.film = 0;
        for (const e of ee) e.startQ = e.q = 0;
        continue;
      }
      const mobile = Math.max(0, a.film - a.cap * a.area),
        dep = mobile / a.area,
        grade = ee[0].s;
      const vel = clip(
          (Math.pow(Math.max(0.00008, dep) * 1.75, 0.667) *
            Math.sqrt(Math.max(0.0003, grade))) /
            a.n,
          0.031,
          2.1,
        ),
        tau = (ee[0].d * 0.68) / vel;
      const out = mobile * -Math.expm1(-dt / tau),
        Q = out / dt;
      a.film -= out;
      // Shallow trickles prefer the steeper thread. A second viable facet carries a growing share when the sheet deepens.
      const f =
        ee.length > 1
          ? ee[1].split *
            clip((dep - (0.00055 + 0.00085 * (1.5 - a.conduct))) / 0.0032)
          : 0;
      for (let i = 0; i < ee.length; i++) {
        const e = ee[i],
          b = A[e.b],
          k = i ? f : 1 - f;
        e.q = k * Q;
        e.startQ = Math.min(e.q, a.inQ * k);
        if (b.open) w.exit += k * out;
        else {
          b.film += k * out;
          b.inQ += e.q;
        }
      }
    }
    for (const p of B) p.level = binHeight(p, p.volume);
    for (const e of this.saddles) {
      const a = A[e.a],
        b = A[e.b],
        pa = B[a.basin],
        pb = B[b.basin];
      e.q = 0;
      const x = (pa?.level ?? -Infinity) > (pb?.level ?? -Infinity);
      const source = x ? pa : pb,
        target = x ? pb : pa,
        src = x ? a : b,
        dst = x ? b : a;
      if (!source) continue;
      const gate = Math.max(e.lip, target?.level ?? -Infinity),
        head = source.level - gate;
      if (head <= 0.000001) continue;
      // Finite broad-crested overflow; never withdraw volume below the lip. Limit exchange to the equal-head solution.
      let amount = Math.min(
        Math.max(0, source.volume - binVolume(source, gate)),
        1.55 * (0.22 + e.d * 0.23) * Math.pow(head, 1.5) * dt,
      );
      if (target && target.level >= e.lip - 0.0001) {
        let lo = 0,
          hi = amount;
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) * 0.5;
          if (
            binHeight(source, source.volume - mid) >
            binHeight(target, target.volume + mid)
          )
            lo = mid;
          else hi = mid;
        }
        amount = lo;
      }
      if (amount <= 1e-12) continue;
      source.volume -= amount;
      source.overflow += amount;
      source.level = binHeight(source, source.volume);
      e.q = amount / dt;
      e.src = src.id;
      e.dst = dst.id;
      w.spill += amount;
      if (dst.open) w.exit += amount;
      else if (target && target.level >= dst.h - 0.0001) {
        target.volume += amount;
        target.level = binHeight(target, target.volume);
      } else dst.film += amount;
    }
    this.freeLevels();
    this.age += dt;
    this.state = null;
  }
  curves() {
    // Positions fixed in metres; read widths only from the current step. End radii never inflate an incoming branch with the whole confluence.
    const row = [],
      A = this.nodes;
    let joins = 0,
      splits = 0,
      lo = Infinity,
      hi = 0,
      minFall = Infinity,
      heads = 0;
    for (const a of A) {
      a.drawIn = 0;
      a.drawOut = 0;
      a.inWidth = 0;
    }
    const prime = (e, q, s, threshold) => {
      e.drawWidth = 0;
      if (q <= threshold) return;
      const a = A[e.src ?? e.a],
        b = A[e.dst ?? e.b],
        sec = section(
          q - threshold,
          s,
          (a.side + b.side) * 0.5,
          (a.n + b.n) * 0.5,
        );
      if (sec[0] < 0.018) return;
      e.drawWidth = sec[0];
      e.depth = sec[1];
      e.vel = sec[2];
      a.drawOut++;
      b.drawIn++;
      b.inWidth = Math.max(b.inWidth, sec[0]);
    };
    for (const e of this.edges) prime(e, e.q, e.s, e.threshold);
    for (const e of this.saddles)
      prime(
        e,
        e.q,
        Math.max(0.002, Math.abs(A[e.a].h - A[e.b].h) / e.d),
        0.000018,
      );
    for (const a of A) {
      if (a.drawIn > 1 && a.drawOut > 0) joins++;
      if (a.drawOut > 1) splits++;
      if (!a.drawIn && a.drawOut) heads++;
    }
    const write = (e, a, b, spill = false) => {
      if (!e.drawWidth) return;
      const width = e.drawWidth,
        d = e.d,
        dx = (b.x - a.x) / d,
        dy = (b.y - a.y) / d;
      const tangent = (n, blend) => {
        const dot = dx * n.tx + dy * n.ty,
          w = blend * clip((dot + 0.68) / 0.86),
          x = dx * (1 - w) + n.tx * w,
          y = dy * (1 - w) + n.ty * w,
          k = Math.hypot(x, y) || 1;
        return [(x / k) * d * 0.38, (y / k) * d * 0.38];
      };
      if (!e.bed || e.bed[4] !== a.key) {
        let t0, t1;
        for (const bend of [0.96, 0.58, 0.22, 0]) {
          t0 = tangent(a, bend);
          t1 = tangent(b, bend);
          let h = a.h,
            good = true;
          if (!spill && this.probe) {
            for (let j = 1; j <= 24; j++) {
              const t = j / 24,
                u = 1 - t,
                k = 3 * u * t,
                X =
                  (1 - t * t * (3 - 2 * t)) * a.x +
                  t * t * (3 - 2 * t) * b.x +
                  k * (u * t0[0] - t * t1[0]),
                Y =
                  (1 - t * t * (3 - 2 * t)) * a.y +
                  t * t * (3 - 2 * t) * b.y +
                  k * (u * t0[1] - t * t1[1]),
                v = j === 24 ? b : this.probe(X, Y);
              if (v.wall || v.h > h + 0.00025) {
                good = false;
                break;
              }
              h = v.h;
            }
          }
          if (good || bend === 0) break;
        }
        e.bed = [a.x + t0[0], a.y + t0[1], b.x - t1[0], b.y - t1[1], a.key];
      }
      const fedPool =
        this.pits[a.basin]?.standing && this.pits[a.basin].level > a.h + 0.001;
      const taper = spill
        ? fedPool
          ? width
          : a.drawIn
            ? Math.min(width, a.inWidth)
            : 0
        : a.drawIn
          ? Math.min(
              width,
              a.inWidth,
              section(Math.max(0, e.startQ - e.threshold), e.s, a.side, a.n)[0],
            )
          : 0;
      row.push({
        a,
        b,
        c1x: e.bed[0],
        c1y: e.bed[1],
        c2x: e.bed[2],
        c2y: e.bed[3],
        w0: taper * 0.5,
        w1: width * 0.5,
        depth: e.depth,
        vel: Math.min(1.9, e.vel),
        q: e.q,
        spill,
        tail:
          !b.open &&
          !b.drawOut &&
          !(
            this.pits[b.basin]?.standing &&
            this.pits[b.basin].level > b.h + 0.001
          ),
      });
      lo = Math.min(lo, width);
      hi = Math.max(hi, width);
      if (!spill && a.h > b.h) minFall = Math.min(minFall, a.h - b.h);
    };
    for (const e of this.edges) write(e, A[e.a], A[e.b]);
    for (const e of this.saddles) write(e, A[e.src], A[e.dst], true);
    this.state = {
      joins,
      splits,
      heads,
      active: row.length,
      widthMetres: [lo === Infinity ? 0 : lo, hi],
      minFall: minFall === Infinity ? 0 : minFall,
    };
    return row;
  }
}
