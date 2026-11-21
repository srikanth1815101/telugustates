// Derived cartographic coverage, not new geography. Node 20+, no npm or external data.
// Rebuild from the SAME frozen acre tiles used by the walker. All coordinates increase northwards in +y.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import * as T from "../static/vendor/three.module.min.js";
import { decodeAcre } from "../static/js/acre-codec.js";
import { ACRE } from "../static/js/metres.js";
const root = fileURLToPath(new URL("../static/", import.meta.url)),
  dir = path.join(root, "survey/banks"),
  P = 512,
  pages = new Map(),
  paths = [];
const key = (i, j) => i + "," + j,
  need = (i, j) => {
    let k = key(i, j),
      a = pages.get(k);
    if (!a) {
      a = { land: new Uint8Array(P * P), lines: new Uint8Array(P * P) };
      pages.set(k, a);
    }
    return a;
  };
const index = JSON.parse(await fs.readFile(path.join(root, "data/atlas.json")));
await fs.mkdir(dir, { recursive: true });
for (const name of index.tiles) {
  const [I, J] = name.split("_").map(Number),
    b = decodeAcre(
      await fs.readFile(path.join(root, "frozen/tiles", name + ".bin")),
    ),
    wet = new Uint8Array(b, 98312, 65536),
    d = new Uint8Array(b, 163848, 65536),
    a = need(I >> 1, J >> 1).land,
    xi = (I & 1) * 256,
    yi = (J & 1) * 256;
  for (let j = 0; j < 256; j++)
    for (let i = 0; i < 256; i++) {
      const k = j * 256 + i;
      a[(j + yi) * P + i + xi] = +(d[k] && (wet[k] === 3 || wet[k] === 4));
    }
  for (const [w, pts] of JSON.parse(
    new TextDecoder().decode(new Uint8Array(b, 434184)),
  ))
    paths.push([I, J, w, pts]);
}
// A texel covers one acre. Take finite-width, antialiased coverage of even a sub-texel stream instead of testing only the texel centre.
for (const [I, J, width, pts] of paths) {
  const ps = [];
  for (let i = 0; i < pts.length; i += 2) {
    const v = new T.Vector3(
      I * 256 + pts[i] / 16,
      0,
      J * 256 + pts[i + 1] / 16,
    );
    if (!ps.length || v.distanceToSquared(ps.at(-1)) > 1e-5) ps.push(v);
  }
  if (ps.length < 2) continue;
  const curve = new T.CatmullRomCurve3(ps),
    r = width
      ? Math.min(3.2, Math.max(0.12, width / (2 * ACRE))) * 0.92
      : 0.18 * 0.78;
  let prev = ps[0];
  for (let j = 1; j < ps.length; j++) {
    const n = Math.max(
      1,
      Math.min(80, Math.ceil(ps[j].distanceTo(ps[j - 1]) * 1.45)),
    );
    for (let l = 1; l <= n; l++) {
      const v = curve.getPoint((j - 1 + l / n) / (ps.length - 1)),
        dx = v.x - prev.x,
        dy = v.z - prev.z,
        l2 = dx * dx + dy * dy;
      for (
        let y = Math.floor(Math.min(v.z, prev.z) - r - 0.5);
        y <= Math.floor(Math.max(v.z, prev.z) + r + 0.5);
        y++
      )
        for (
          let x = Math.floor(Math.min(v.x, prev.x) - r - 0.5);
          x <= Math.floor(Math.max(v.x, prev.x) + r + 0.5);
          x++
        ) {
          const X = x + 0.5 - prev.x,
            Y = y + 0.5 - prev.z,
            t = l2 ? Math.max(0, Math.min(1, (X * dx + Y * dy) / l2)) : 0,
            area = Math.min(
              1,
              2 * r,
              r + 0.52 - Math.hypot(X - t * dx, Y - t * dy),
            );
          if (area <= 0) continue;
          const p = pages.get(key(x >> 9, y >> 9));
          if (!p) continue;
          const k = (y & 511) * P + (x & 511);
          p.lines[k] = Math.max(p.lines[k], Math.round(area * 255));
        }
      prev = v;
    }
  }
}
const list = { format: "BANK1", pageCells: P, cellMetres: ACRE, pages: {} };
for (const [k, p] of pages) {
  const [i, j] = k.split(",").map(Number),
    o = p.lines,
    xx = i * P,
    yy = j * P,
    h = new Uint8Array((P + 2) * (P + 2));
  for (let y = -1; y <= P; y++)
    for (let x = -1; x <= P; x++) {
      const X = xx + x,
        Y = yy + y,
        src =
          x >= 0 && y >= 0 && x < P && y < P
            ? p
            : pages.get(key(X >> 9, Y >> 9));
      h[(y + 1) * (P + 2) + x + 1] = src?.land[(Y & 511) * P + (X & 511)] || 0;
    }
  for (let y = 0; y < P; y++)
    for (let x = 0; x < P; x++) {
      const m = y * P + x,
        b = (y + 1) * (P + 2) + x + 1,
        n = P + 2,
        wet =
          (36 * h[b] +
            6 * (h[b - 1] + h[b + 1] + h[b - n] + h[b + n]) +
            h[b - 1 - n] +
            h[b + 1 - n] +
            h[b - 1 + n] +
            h[b + 1 + n]) /
          64;
      o[m] = Math.max(o[m], Math.round(255 * wet));
    }
  if (!o.some((v) => v > 0)) continue;
  const raw = gzipSync(o, { level: 9 }),
    name = `${i}_${j}`;
  list.pages[name] = createHash("sha256").update(raw).digest("hex");
  await fs.writeFile(path.join(dir, name + ".bin.gz"), raw);
}
await fs.writeFile(path.join(dir, "index.json"), JSON.stringify(list) + "\n");
console.log(
  "Survey water:",
  Object.keys(list.pages).length,
  "one-acre coverage pages from",
  index.tiles.length,
  "frozen tiles.",
);
