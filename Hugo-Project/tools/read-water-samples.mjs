// Extract ONLY the authoritative wet cells, heights and mapped river chains; optional input for the offline hydraulic bake.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { decodeAcre } from "../static/js/acre-codec.js";
const root = fileURLToPath(new URL("../static/", import.meta.url)),
  atlas = JSON.parse(fs.readFileSync(path.join(root, "data/atlas.json"))),
  dest = process.argv[2];
if (!dest)
  throw Error("Usage: node tools/read-water-samples.mjs SCRATCH_DIRECTORY");
fs.mkdirSync(dest, { recursive: true });
const fd = fs.openSync(path.join(dest, "wet.bin"), "w"),
  chains = [];
let total = 0;
const W = atlas.project.cols;
for (const k of atlas.tiles) {
  const [I, J] = k.split("_").map(Number),
    b = decodeAcre(
      fs.readFileSync(path.join(root, "frozen/tiles", k + ".bin")),
    ),
    h = new Int16Array(b, 8, 16384),
    c = new Uint8Array(b, 98312, 65536),
    d = new Uint8Array(b, 163848, 65536);
  for (let i = 0; i < h.length; i++) if (i % 128) h[i] += h[i - 1];
  const bytes = Buffer.allocUnsafe(8 * 65536);
  let n = 0;
  for (let j = 0; j < 256; j++)
    for (let i = 0; i < 256; i++) {
      const t = (j << 8) + i;
      if (d[t] && (c[t] === 3 || c[t] === 4)) {
        bytes.writeUInt32LE((J * 256 + j) * W + I * 256 + i, n);
        bytes.writeInt16LE(h[(j >> 1) * 128 + (i >> 1)], n + 4);
        bytes[n + 6] = c[t];
        bytes[n + 7] = 0;
        n += 8;
      }
    }
  fs.writeSync(fd, bytes.subarray(0, n));
  total += n / 8;
  const paths = JSON.parse(new TextDecoder().decode(new Uint8Array(b, 434184)));
  for (let t = 0; t < paths.length; t++) {
    const [width, pts] = paths[t];
    if (pts.length >= 4) chains.push([I, J, t, width, pts]);
  }
}
fs.closeSync(fd);
fs.writeFileSync(
  path.join(dest, "chains.json.gz"),
  gzipSync(JSON.stringify(chains)),
);
console.log(total, "wet samples;", chains.length, "clipped chains");
