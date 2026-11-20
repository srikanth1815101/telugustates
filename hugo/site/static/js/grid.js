import {dev} from "./edition.js";
// Exact WGS84 ellipsoidal Albers equations for ESRI:102028, including its negative cone constant.
const D = Math.PI / 180,
  A = 6378137,
  e2 = 1 - (1 - 1 / 298.257223563) ** 2,
  e = Math.sqrt(e2),
  s = Math.sin,
  c = Math.cos;
const q = (p) =>
    (1 - e2) *
    (s(p) / (1 - e2 * s(p) ** 2) -
      Math.log((1 - e * s(p)) / (1 + e * s(p))) / (2 * e)),
  m = (p) => c(p) ** 2 / (1 - e2 * s(p) ** 2),
  u = 7 * D,
  v = -32 * D,
  n = (m(u) - m(v)) / (q(v) - q(u)),
  C = m(u) + n * q(u),
  rho = (p) => (A * Math.sqrt(C - n * q(p))) / n,
  r0 = rho(-15 * D);
export function ll(cg, x, y) {
  const X = cg.origin[0] + x * cg.cell_m,
    Y = cg.origin[1] + y * cg.cell_m,
    dy = r0 - Y,
    Q = (C - ((Math.hypot(X, dy) * n) / A) ** 2) / n;
  let p = Math.asin(Q / 2);
  for (let i = 0; i < 5; i++)
    p -= ((q(p) - Q) * (1 - e2 * s(p) ** 2) ** 2) / (2 * (1 - e2) * c(p));
  return [125 + Math.atan2(Math.sign(n) * X, Math.sign(n) * dy) / n / D, p / D];
}
export function xy(cg, lon, lat) {
  const r = rho(lat * D),
    t = n * (lon - 125) * D;
  return [
    (r * s(t) - cg.origin[0]) / cg.cell_m,
    (r0 - r * c(t) - cg.origin[1]) / cg.cell_m,
  ];
}
export const base = new URL("../", import.meta.url),
  url = (p) => {const u=new URL(p,base);if(dev&&p.startsWith('houses/'))u.searchParams.set('dev','1');return u.href;};
export async function unzip(b) {
  if (new Uint8Array(b)[0] !== 31) return b;
  if (typeof DecompressionStream === "function")
    return new Response(
      new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip")),
    ).arrayBuffer();
  const { gunzipSync } = await import("../vendor/fflate.module.js");
  const v = gunzipSync(new Uint8Array(b));
  return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength);
}
export async function get(p) {
  if(typeof location!=='undefined'&&!dev&&(/^(?:data\/(?:atlas|directory)\.json$|data\/(?:plots|search)\/)/.test(p)))p='living/public/'+p.slice(5);const r = await fetch(url(p));
  if (!r.ok) throw Error(`${p}: ${r.status}`);
  return r.json();
}
const N = 65536;
export const key = (x, y) => `${Math.floor(x / 256)}_${Math.floor(y / 256)}`;
export class Tiles {
  constructor(a) {
    this.keys = new Set(a.tiles);
    this.cache = new Map();
    this.pending = new Map();
    this.bytes = 0;
  }
  async load(k) {
    if (!this.keys.has(k)) return null;
    if (this.cache.has(k)) return this.cache.get(k);
    if (this.pending.has(k)) return this.pending.get(k);
    const job = (async () => {
      const r = await fetch(url(`frozen/tiles/${k}.bin`));
      if (!r.ok) throw Error(`Missing tile ${k}`);
      const packed = await r.arrayBuffer();
      this.bytes += packed.byteLength;
      const buf = await unzip(packed);
      const view = new DataView(buf);
      if (
        view.getUint32(0) !== 0x54534131 ||
        `${view.getInt16(4, true)}_${view.getInt16(6, true)}` !== k
      )
        throw Error("Unrecognized acre tile");
      let o = 8;
      const h = new Int16Array(buf, o, 16384);
      o += 32768;
      for (let i = 0; i < h.length; i++) if (i % 128) h[i] += h[i - 1];
      const [s, b, d, f] = [0, 1, 2, 3].map(
        (j) => new Uint8Array(buf, o + j * N, N),
      );
      o += 4 * N;
      const w = new Uint16Array(buf, o, N);
      o += 2 * N;
      const ok = new Uint8Array(buf, o, N / 8);
      o += N / 8;
      const paths = JSON.parse(
        new TextDecoder().decode(new Uint8Array(buf, o)),
      );
      const t = { h, s, b, d, f, w, ok, paths };
      this.cache.set(k, t);
      return t;
    })();
    this.pending.set(k, job);
    try {
      return await job;
    } finally {
      this.pending.delete(k);
    }
  }
  at(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    const t = this.cache.get(key(x, y));
    if (!t) return null;
    const i = (y & 255) * 256 + (x & 255);
    return {
      d: t.d[i],
      c: t.b[i],
      f: t.f[i],
      s: t.s[i],
      w: t.w[i],
      z: t.h[((y & 255) >> 1) * 128 + ((x & 255) >> 1)],
      ok: !!((t.ok[i >> 3] >> (i & 7)) & 1),
    };
  }
  height(x, y) {
    const t = this.cache.get(key(x, y));
    if (!t) return -32768;
    return t.h[
      ((Math.floor(y) & 255) >> 1) * 128 + ((Math.floor(x) & 255) >> 1)
    ];
  }
  trim(keep) {
    for (const k of this.cache.keys()) if (!keep.has(k)) this.cache.delete(k);
  }
}
