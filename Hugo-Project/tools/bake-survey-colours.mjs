import * as T from "../static/vendor/three.module.min.js";
import fs from "node:fs";
import zlib from "node:zlib";
import { smooth } from "../static/js/sky.js";
const clamp = T.MathUtils.clamp,
  ung = (p) => {
    const b = zlib.gunzipSync(
      fs.readFileSync(new URL("../static/" + p, import.meta.url)),
    );
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  },
  b = ung("survey/overview.bin.gz");
const h = new DataView(b);
if (h.getUint32(0) !== 0x4c4f4431) throw Error("Invalid survey LOD");
const w = h.getUint16(4, true),
  rows = h.getUint16(6, true),
  step = h.getUint16(8, true),
  n = w * rows,
  z = new Int16Array(b, 12, n);

const farHeads = new Uint16Array(ung("hydraulics/survey-base.gz"));
if (farHeads.length !== n) throw Error("Invalid regional levels");
const [d, f, water, cover] = [0, 1, 2, 3].map(
  (k) => new Uint8Array(b, 12 + (2 + k) * n, n),
);
const cl = (i, j) => clamp(j, 0, rows - 1) * w + clamp(i, 0, w - 1);
function height(i, j) {
  const k = cl(i, j),
    head = farHeads[k];
  if (head) return head / 16 - 64;
  const v = z[k];
  if (v !== -32768) return v;
  for (const [u, v] of [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [-1, 1],
    [1, -1],
    [-2, 0],
    [0, -2],
    [2, 0],
    [0, 2],
  ]) {
    const k = cl(i + u, j + v);
    if (d[k]) return z[k];
  }
  return 0;
}
const rgb = new Uint8Array(n * 4),
  dryRGB = new Uint8Array(n * 4),
  dry = new T.Color("#c5c58e"),
  low = new T.Color("#a5b487"),
  wood = new T.Color("#567957"),
  blue = new T.Color("#86b4b3"),
  ridge = new T.Color("#9aa78f"),
  col = new T.Color(),
  scratch = new T.Color();
for (let j = 0; j < rows; j++)
  for (let i = 0; i < w; i++) {
    const k = j * w + i;
    if (!d[k]) continue;
    const elev = z[k],
      grad =
        (height(i - 1, j) - height(i + 1, j)) * 0.00072 +
        (height(i, j + 1) - height(i, j - 1)) * 0.00051;
    col
      .copy(low)
      .lerp(dry, smooth(50, 550, elev) * 0.8)
      .lerp(wood, f[k] / 114)
      .lerp(ridge, smooth(760, 1440, elev) * 0.42);
    const set = (dst, c) => {
      const v = c
        .offsetHSL(
          Math.floor(elev / 100) * 0.0023 + Math.floor(elev / 500) * 0.01,
          0,
          0,
        )
        .multiplyScalar(clamp(1 + grad, 0.64, 1.31))
        .convertLinearToSRGB();
      dst[k * 4] = Math.min(255, v.r * 255);
      dst[k * 4 + 1] = Math.min(255, v.g * 255);
      dst[k * 4 + 2] = Math.min(255, v.b * 255);
      dst[k * 4 + 3] = Math.max(18, 2.55 * cover[k]);
    };
    set(dryRGB, scratch.copy(col));
    set(rgb, col.lerp(blue, water[k] / 100));
  }

// Standard PNG, RGBA8. The app consumes the precomputed chart rather than looping over every survey cell at startup.
function png(buf) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    head = Buffer.alloc(13),
    raw = Buffer.alloc(rows * (4 * w + 1));
  head.writeUInt32BE(w);
  head.writeUInt32BE(rows, 4);
  head[8] = 8;
  head[9] = 6;
  for (let j = 0; j < rows; j++)
    raw.set(buf.subarray(j * w * 4, (j + 1) * w * 4), j * (4 * w + 1) + 1);
  function chunk(tag, data) {
    const n = Buffer.alloc(4),
      kind = Buffer.from(tag),
      cb = Buffer.alloc(4);
    n.writeUInt32BE(data.length);
    let check = -1;
    for (const a of [kind, data])
      for (const x of a) {
        check ^= x;
        for (let k = 0; k < 8; k++)
          check = (check >>> 1) ^ (check & 1 ? 0xedb88320 : 0);
      }
    cb.writeUInt32BE(~check >>> 0);
    return Buffer.concat([n, kind, data, cb]);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", head),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
for (const [name, bytes] of [
  ["wet", rgb],
  ["dry", dryRGB],
])
  fs.writeFileSync(
    new URL("../static/survey/" + name + ".png", import.meta.url),
    png(bytes),
  );
console.log("Rebuilt both " + w + " × " + rows + " colour charts.");
