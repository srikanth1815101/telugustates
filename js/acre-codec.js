// ACP3 is a lossless transport for the frozen TSA1 archive. No server, network decoder or GIS runtime.
import { decompress } from "../vendor/fzstd.mjs";
import { cumulativeTables } from "./acre-probabilities.js";
const N = 65536,
  HN = 16384,
  EXTRA = 270336,
  VOID = -32768,
  START = 8388608;
const bounds = (cuts) => {
  const bins = new Uint8Array(cuts.at(-1) + 2);
  let j = 0;
  for (let i = 0; i < bins.length; i++) {
    if (i === cuts[j]) j++;
    bins[i] = j;
  }
  return bins;
};
const rough = bounds([1, 2, 3, 4, 6, 9, 13, 20, 30, 48, 90, 200]),
  slopeBin = bounds([1, 2, 3, 4, 5, 6, 8, 10, 13, 17, 24, 35]),
  coverBin = bounds([1, 3, 7, 14, 25, 40, 57, 71, 83, 91, 96, 99, 100]),
  spreadBin = bounds([1, 3, 7, 14, 28, 52, 82]);
const bin = (t, v) => t[Math.min(t.length - 1, v)];
let probabilities;
function tables() {
  if (probabilities) return probabilities;
  const a = decompress(
      Uint8Array.from(atob(cumulativeTables), (c) => c.charCodeAt(0)),
    ),
    d = new DataView(a.buffer, a.byteOffset, a.byteLength);
  let p = 0;
  probabilities = [
    [13, 128],
    [169, 128],
    [672, 102],
  ].map(([rows, syms]) => {
    const t = new Uint16Array(rows * (syms + 1));
    for (let i = 0; i < t.length; i++, p += 2) t[i] = d.getUint16(p, true);
    return t;
  });
  if (p !== a.length) throw Error("Acre frequency table length");
  return probabilities;
}
// Byte-renormalized range ANS. The small cumulative arrays are shared by all tiles and never expanded into per-slot tables.
function reader(bytes, t, cols) {
  if (bytes.length < 4) throw Error("Short acre stream");
  let p = 4,
    st = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getUint32(0, true);
  return {
    symbol(row) {
      const start = row * (cols + 1),
        slot = st & 16383;
      let lo = 0,
        hi = cols;
      while (hi - lo > 1) {
        const mid = (lo + hi) >>> 1;
        if (t[start + mid] <= slot) lo = mid;
        else hi = mid;
      }
      const a = t[start + lo];
      st = (t[start + lo + 1] - a) * (st >>> 14) + slot - a;
      while (st < START) {
        if (p >= bytes.length) throw Error("Incomplete acre stream");
        st = st * 256 + bytes[p++];
      }
      return lo;
    },
    finish() {
      if (p !== bytes.length || st !== START)
        throw Error("Acre stream mismatch");
    },
  };
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function decodeAcre(bytes) {
  const h = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length < 44 ||
    h.getUint32(0) !== 0x41435033 ||
    h.getUint32(4) !== 0x54534131
  )
    throw Error("Unknown acre transport");
  const n = h.getUint32(12, true),
    z = h.getUint32(16, true),
    es = h.getUint32(20, true),
    a = h.getUint32(24, true),
    b = h.getUint32(28, true),
    p = 32 + z + es;
  if (
    n < EXTRA ||
    n > EXTRA + 8000000 ||
    p + a + b + 4 > bytes.length ||
    es % 2
  )
    throw Error("Invalid acre dimensions");
  const v = decompress(bytes.subarray(32, 32 + z));
  if (v.length !== n) throw Error("Acre auxiliaries length");
  const out = new Uint8Array(434184 + n - EXTRA),
    d = v.subarray(0, N),
    overrides = v.subarray(N, N * 2),
    mask = v.subarray(N * 2, N * 2 + 8192),
    H = new Int16Array(HN);
  H.fill(VOID);
  const S = out.subarray(32776, 98312),
    C = out.subarray(98312, 163848),
    F = out.subarray(229384, 294920),
    dv = new DataView(out.buffer),
    ts = tables(),
    rh = reader(bytes.subarray(p, p + a), ts[0], 128),
    rs = reader(bytes.subarray(p + a, p + a + b), ts[1], 128),
    rf = reader(bytes.subarray(p + a + b), ts[2], 102);
  let ep = 32 + z;
  out.set(bytes.subarray(4, 12));
  out.set(d, 163848);
  out.set(v.subarray(N * 2 + 8192, EXTRA), 294920);
  out.set(mask, 425992);
  out.set(v.subarray(EXTRA), 434184);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const i = y * 128 + x,
        j = y * 512 + x * 2;
      if (d[j] || d[j + 1] || d[j + 256] || d[j + 257]) {
        let l = x ? H[i - 1] : VOID,
          t = y ? H[i - 128] : VOID,
          ul = x && y ? H[i - 129] : VOID,
          ur = y && x !== 127 ? H[i - 127] : VOID;
        const base =
          l !== VOID
            ? l
            : t !== VOID
              ? t
              : ul !== VOID
                ? ul
                : ur !== VOID
                  ? ur
                  : 0;
        if (l === VOID) l = base;
        if (t === VOID) t = base;
        if (ul === VOID) ul = (l + t) >> 1;
        if (ur === VOID) ur = t;
        let ll = x > 1 ? H[i - 2] : VOID,
          tt = y > 1 ? H[i - 256] : VOID;
        if (ll === VOID) ll = l;
        if (tt === VOID) tt = t;
        const pa = clamp(l + t - ul, Math.min(l, t), Math.max(l, t)),
          pb = (2 * (l + t - ul) + 2 * l - ll + 2 * t - tt + 2) >> 2,
          g = Math.max(
            Math.abs(l - t),
            Math.abs(l - ul),
            Math.abs(t - ul),
            Math.abs(ur - t),
          );
        const pred = (pa + clamp(pb, pa - (g >> 1), pa + (g >> 1)) + 1) >> 1,
          q = rh.symbol(bin(rough, g));
        if (q === 127) {
          if (ep + 2 > p) throw Error("Missing height exception");
          H[i] = h.getInt16(ep, true);
          ep += 2;
        } else H[i] = pred + ((q >>> 1) ^ -(q & 1));
      }
      dv.setInt16(8 + 2 * i, H[i] - (x ? H[i - 1] : 0), true);
    }
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const i = y * 256 + x;
      if (!d[i]) continue;
      const bx = x >> 1,
        by = y >> 1,
        j = by * 128 + bx,
        h0 = H[j];
      let w = bx ? H[j - 1] : VOID,
        e = bx < 127 ? H[j + 1] : VOID,
        n0 = by ? H[j - 128] : VOID,
        s0 = by < 127 ? H[j + 128] : VOID;
      if (w === VOID) w = h0;
      if (e === VOID) e = h0;
      if (n0 === VOID) n0 = h0;
      if (s0 === VOID) s0 = h0;
      const xx = x & 1,
        yy = y & 1,
        dx = Math.abs(
          ((h0 - w) * (3 - 2 * xx) + (e - h0) * (1 + 2 * xx) + 2) >> 2,
        ),
        dy = Math.abs(
          ((h0 - n0) * (3 - 2 * yy) + (s0 - h0) * (1 + 2 * yy) + 2) >> 2,
        ),
        g = (13 * Math.max(dx, dy) + 5 * Math.min(dx, dy) + 16) >> 5;
      const meanS =
        (3 * (x ? S[i - 1] : 0) +
          3 * (y ? S[i - 256] : 0) +
          (x && y ? S[i - 257] : 0) +
          (y && x < 255 ? S[i - 255] : 0) +
          4) >>
        3;
      S[i] = rs.symbol(bin(slopeBin, meanS) * 13 + bin(slopeBin, g));
      const l = x ? Math.min(100, F[i - 1]) : 0,
        t = y ? Math.min(100, F[i - 256]) : 0,
        u = x && y ? Math.min(100, F[i - 257]) : 0,
        r = y && x < 255 ? Math.min(100, F[i - 255]) : 0,
        ll = x > 1 ? Math.min(100, F[i - 2]) : 0,
        tt = y > 1 ? Math.min(100, F[i - 512]) : 0;
      const m = Math.floor((4 * l + 4 * t + 2 * u + 2 * r + ll + tt + 7) / 14),
        spread = Math.max(l, t, u, r) - Math.min(l, t, u, r),
        end = l === 0 && t === 0 ? 0 : l === 100 && t === 100 ? 2 : 1,
        c =
          ((coverBin[m] * 8 + bin(spreadBin, spread)) * 2 + +!!overrides[i]) *
            3 +
          end,
        f = rf.symbol(c);
      F[i] = f === 101 ? 255 : f;
      C[i] = overrides[i] || (S[i] > 20 ? 6 : F[i] >= 50 ? 2 : 1);
      if (C[i] <= 2 && F[i] !== 255) out[425992 + (i >> 3)] ^= 1 << (i & 7);
    }
  if (ep !== p) throw Error("Unused height exception");
  rh.finish();
  rs.finish();
  rf.finish();
  return out.buffer;
}
