// Compare the published velocity chart with the original geographic coverage, byte for byte in R.
import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
const dir = new URL("../static/", import.meta.url),
  read = async (p) => fs.readFile(new URL(p, dir)),
  old = JSON.parse(await read("survey/banks/index.json")),
  now = JSON.parse(await read("current/index.json"));
assert.deepEqual(Object.keys(now.pages).sort(), Object.keys(old.pages).sort());
let n = 0,
  wet = 0,
  v = 0;
for (const k of Object.keys(old.pages)) {
  const a = gunzipSync(await read("survey/banks/" + k + ".bin.gz")),
    b = gunzipSync(await read("current/" + k + ".gz"));
  assert.equal(a.length, 512 ** 2);
  assert.equal(b.length, 4 * a.length);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[4 * i]) throw Error("Coverage mismatch " + k + ":" + i);
    if (a[i]) {
      wet++;
      if (b[4 * i + 3]) v++;
    }
  }
  n += a.length;
}
assert(now.connectedRiverSamples > now.runningClassCells * 0.99);
console.log(
  JSON.stringify({
    pages: Object.keys(old.pages).length,
    coverageSamplesCompared: n,
    coverageNonzero: wet,
    coverageWithVelocity: v,
    runningCells: now.runningClassCells,
    connectedSamples: now.connectedRiverSamples,
  }),
);
