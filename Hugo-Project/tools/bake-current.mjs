// RGBA: exact previously published bank coverage; signed east/south velocity; confidence. Never change the surveyed water levels.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { decodeAcre } from "../static/js/acre-codec.js";
import { runPace } from "../static/js/river-margin.js";
const base = fileURLToPath(new URL("../static/", import.meta.url)),
  dir = path.join(base, "current"),
  idx = JSON.parse(await fs.readFile(path.join(base, "data/atlas.json"))),
  banks = JSON.parse(
    await fs.readFile(path.join(base, "survey/banks/index.json")),
  ),
  T = [],
  classAt = (x, y) => T[(x >> 8) + (y >> 8) * 64],
  at = (x, y) => (y & 255) * 256 + (x & 255),
  cl = (q, a, b) => Math.max(a, Math.min(b, q)),
  enc = (v) => Math.round(cl(v, -2.55, 2.55) * 49.5),
  M = 63.615;
let wet = 0;
await fs.mkdir(dir, { recursive: true });
for (const k of idx.tiles) {
  const [tx, ty] = k.split("_").map(Number),
    b = decodeAcre(
      await fs.readFile(path.join(base, "frozen/tiles", k + ".bin")),
    ),
    c = new Uint8Array(b, 98312, 65536),
    d = new Uint8Array(b, 163848, 65536),
    p = JSON.parse(new TextDecoder().decode(new Uint8Array(b, 434184))),
    h = new Int16Array(b, 8, 16384);
  for (let i = 0; i < h.length; i++) if (i % 128) h[i] += h[i - 1];
  let count = 0;
  for (let i = 0; i < c.length; i++)
    if (d[i] && (c[i] === 3 || c[i] === 4)) count++;
  const g = count
      ? gunzipSync(
          await fs.readFile(path.join(base, "hydraulics", k + ".bin.gz")),
        )
      : null,
    q = {
      tx,
      ty,
      cell: new Uint8Array(65536),
      v: new Int8Array(131072),
      p,
      head: new Uint16Array(65536),
      terrain: h.slice(),
      vec: p.some(([, a]) => a.length >= 4)
        ? JSON.parse(
            gunzipSync(
              await fs.readFile(
                path.join(base, "hydraulics/paths", k + ".json.gz"),
              ),
            ),
          )
        : [],
    };
  for (let i = 0, j = 0; i < c.length; i++)
    if (d[i] && (c[i] === 3 || c[i] === 4)) {
      const hh = g.readUInt16LE(j++ * 2);
      q.head[i] = hh;
      q.cell[i] = c[i] === 4 ? (hh & 32768 ? 3 : 1) : 2;
      if (c[i] === 4) wet++;
    }
  T[tx + ty * 64] = q;
}
let direct = 0;
for (const t of T)
  if (t) {
    const origin = [t.tx * 256, t.ty * 256];
    for (const [n, [w, pts]] of t.p.entries()) {
      const z = t.vec?.[n];
      if (!z || pts.length < 4) continue;
      const L = z.length,
        R = cl(w / (2 * M) || 0.18, 0.18, 3.2);
      for (let i = 1; i < L; i++) {
        let ax = origin[0] + pts[2 * i - 2] / 16,
          ay = origin[1] + pts[2 * i - 1] / 16,
          bx = origin[0] + pts[2 * i] / 16,
          by = origin[1] + pts[2 * i + 1] / 16,
          dx = bx - ax,
          dy = by - ay,
          len = Math.hypot(dx, dy);
        if (len < 0.0001) continue;
        let a = Math.max(0, i - 2),
          b = Math.min(L - 1, i + 1),
          dz = (z[a] - z[b]) / 16,
          sg = Math.sign(dz || z[0] - z.at(-1));
        const dem = (x, y) =>
          classAt(Math.floor(x), Math.floor(y))?.terrain[
            ((y & 255) >> 1) * 128 + ((x & 255) >> 1)
          ] ?? 0;
        if (!sg) sg = dem(ax, ay) < dem(bx, by) - 1 ? -1 : 1;
        const pace = Math.max(
          0.84,
          runPace(
            Math.abs(dz) /
              (Math.max(
                1,
                Math.hypot(
                  pts[2 * b] - pts[2 * a],
                  pts[2 * b + 1] - pts[2 * a + 1],
                ) / 16,
              ) *
                M),
          ),
        );
        for (
          let Y = Math.floor(Math.min(ay, by) - R - 0.6);
          Y <= Math.ceil(Math.max(ay, by) + R);
          Y++
        )
          for (
            let X = Math.floor(Math.min(ax, bx) - R - 0.6);
            X <= Math.ceil(Math.max(ax, bx) + R);
            X++
          ) {
            const f = cl(
              ((X + 0.5 - ax) * dx + (Y + 0.5 - ay) * dy) / (len * len),
              0,
              1,
            );
            if (
              Math.hypot(X + 0.5 - ax - f * dx, Y + 0.5 - ay - f * dy) >
              R + 0.67
            )
              continue;
            const tile = classAt(X, Y);
            if (!tile) continue;
            const k = at(X, Y);
            if (tile.cell[k] === 2) continue;
            if (!tile.v[k * 2] && !tile.v[k * 2 + 1]) direct++;
            tile.v[k * 2] = enc(((sg * dx) / len) * pace);
            tile.v[k * 2 + 1] = enc(((-sg * dy) / len) * pace);
          }
      }
    }
  }
// Only propagate on connected river cells (4-neighbour): cannot jump an intervening dry divide, and cannot put a river current in an open reservoir.
let tail = 0,
  head = 0,
  gradient = 0;
const queue = new Int32Array(wet + 4);
function seed(t, k) {
  queue[tail++] = ((t.ty * 256 + (k >> 8)) << 14) + (t.tx * 256 + (k & 255));
}
for (const t of T)
  if (t)
    for (let k = 0; k < 65536; k++) {
      const m = t.cell[k];
      if (m !== 1 && m !== 3) continue;
      if (t.v[k * 2] || t.v[k * 2 + 1]) {
        seed(t, k);
        continue;
      }
      if (m !== 1) continue;
      const X = t.tx * 256 + (k & 255),
        Y = t.ty * 256 + (k >> 8),
        headAt = (x, y) => {
          const tile = classAt(x, y),
            i = at(x, y);
          return tile?.cell[i] === 1 ? tile.head[i] : 0;
        };
      let x = 0,
        y = 0;
      for (const d of [1, 3, 6]) {
        const a = headAt(X - d, Y),
          b = headAt(X + d, Y),
          c = headAt(X, Y - d),
          e = headAt(X, Y + d);
        x = a && b ? (a - b) / (32 * d * M) : 0;
        y = e && c ? (e - c) / (32 * d * M) : 0;
        if (Math.hypot(x, y) > 0.00012) break;
      }
      const l = Math.hypot(x, y);
      if (l > 0.00012) {
        const m = Math.max(0.87, runPace(l));
        t.v[2 * k] = enc((x * m) / l);
        t.v[2 * k + 1] = enc((y * m) / l);
        seed(t, k);
        gradient++;
      }
    }
while (head < tail) {
  const key = queue[head++],
    x = key & 16383,
    y = key >> 14,
    t = classAt(x, y),
    i = at(x, y);
  for (const [u, v] of [
    [x - 1, y],
    [x + 1, y],
    [x, y + 1],
    [x, y - 1],
  ]) {
    const s = classAt(u, v);
    if (!s) continue;
    const j = at(u, v);
    if ((s.cell[j] !== 1 && s.cell[j] !== 3) || s.v[j * 2] || s.v[j * 2 + 1])
      continue;
    s.v[j * 2] = t.v[i * 2];
    s.v[j * 2 + 1] = t.v[i * 2 + 1];
    seed(s, j);
  }
}
const pages = {};
let bytes = 0;
for (const tag of Object.keys(banks.pages)) {
  const [tx, ty] = tag.split("_").map(Number),
    cov = gunzipSync(
      await fs.readFile(path.join(base, "survey/banks", tag + ".bin.gz")),
    ),
    out = Buffer.alloc(4 * 512 * 512);
  for (let k = 0; k < cov.length; k++) {
    const x = tx * 512 + (k & 511),
      y = ty * 512 + (k >> 9),
      i = at(x, y),
      t = classAt(x, y);
    out[4 * k] = cov[k];
    out[4 * k + 1] = 128;
    out[4 * k + 2] = 128;
    if (!t || t.cell[i] === 2) continue;
    let dx = t.v[2 * i],
      dz = t.v[2 * i + 1],
      w = +(dx || dz ? 1 : 0);
    if (!w && (cov[k] || t.cell[i] === 0)) {
      for (const [u, v] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        const s = classAt(u, v),
          j = at(u, v);
        if (
          (s?.cell[j] === 1 || s?.cell[j] === 3) &&
          (s.v[2 * j] || s.v[2 * j + 1])
        ) {
          dx += s.v[2 * j];
          dz += s.v[2 * j + 1];
          w++;
        }
      }
    }
    if (!w) continue;
    out[4 * k + 1] = 128 + Math.round(dx / w);
    out[4 * k + 2] = 128 + Math.round(dz / w);
    out[4 * k + 3] = 255;
  }
  const b = gzipSync(out, { level: 9, mtime: 0 });
  await fs.writeFile(path.join(dir, tag + ".gz"), b);
  bytes += b.length;
  pages[tag] = 1;
}
const meta = {
  version: 1,
  cellM: M,
  page: 512,
  vectorUnitsPerMps: 49.5,
  pages,
  runningClassCells: wet,
  directVectorSamples: direct,
  headGradientSeeds: gradient,
  connectedRiverSamples: tail,
  bytesGzip: bytes,
};
await fs.writeFile(path.join(dir, "index.json"), JSON.stringify(meta));
delete meta.pages;
console.log(meta);
