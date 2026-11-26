// Offline stairway audit for the Sopana Marg overlays (no Hugo render needed).
// Parses the two mettu trails from Markdown, decodes the DEM tile directly,
// and replays stairPlan to assert: exact real step counts (Alipiri 3,550,
// Srivari 2,388), believable riser/tread geometry, and a net climb that
// matches the surveyed mountain.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { ANCHORS, stairPlan } from "../static/js/stairs.js";
import { decodeAcre } from "../static/js/acre-codec.js";

const root = fileURLToPath(new URL("../", import.meta.url));

async function trailPoints(id) {
  const text = await fs.readFile(
    path.join(root, "content/trails", id + ".md"),
    "utf8",
  );
  const block = text.split(/points:\s*\n/)[1].split(/\n---/)[0];
  const pts = [
    ...block.matchAll(/- \[(-?[\d.]+), (-?[\d.]+)\]|- - (-?[\d.]+)\s*\n\s*- (-?[\d.]+)/g),
  ].map((m) => [+(m[1] ?? m[3]), +(m[2] ?? m[4])]);
  assert.ok(pts.length >= 2, id + " needs at least two points");
  return pts;
}

// DEM z at grid (x, y): ACP3 tile decoded by the acre codec, heights 8 bytes
// into the decoded container, rows delta-coded, 2-cell resolution (see
// static/frozen/TILE-FORMAT.md and the Tiles reader in static/js/grid.js).
const tileBuf = await fs.readFile(
  path.join(root, "static/frozen/tiles/19_7.bin"),
);
const tile = decodeAcre(tileBuf); // returns the decoded ArrayBuffer
const heights = new Int16Array(tile, 8, 16384);
for (let i = 128; i < heights.length; i++)
  if (i % 128) heights[i] += heights[i - 1];
const demZ = (x, y) =>
  heights[
    (Math.floor(y) - 7 * 256 >> 1) * 128 + (Math.floor(x) - 19 * 256 >> 1)
  ];

const EXPECT = {
  "alipiri-mettu": { steps: 3550, climb: [680, 880] },
  "srivari-mettu": { steps: 2388, climb: [260, 400] },
};

for (const [id, spec] of Object.entries(ANCHORS)) {
  const pts = await trailPoints(id),
    plan = stairPlan({ xy: pts, w: 1.15 }, spec, demZ);
  assert.equal(
    plan.length,
    EXPECT[id].steps,
    id + " must place exactly " + EXPECT[id].steps + " steps",
  );
  const rises = plan.map((q) => q.riser),
    treads = plan.map((q) => q.tread);
  const minRise = Math.min(...rises),
    maxRise = Math.max(...rises),
    minTread = Math.min(...treads),
    maxTread = Math.max(...treads);
  for (const r of rises)
    assert.ok(
      r > 0.05 && r < 0.55,
      id + " riser out of range: " + r.toFixed(3),
    );
  // Treads vary by design: ~0.6 m on the covered stairway, ~6.5 m on the
  // long stone-paved forest walk between Gali Gopuram and Mokalla Parvatham
  // (real step numbers advance through it too), ~1.1 m on the Mokalla stairs.
  for (const t of treads)
    assert.ok(
      t > 0.3 && t < 7.5,
      id + " tread out of range: " + t.toFixed(3),
    );
  const netClimb = 0;
  void netClimb;
  // Net climb along the stepped section, measured on the DEM.
  const first = plan[0],
    last = plan[plan.length - 1];
  const climb = demZ(last.x, last.y) - demZ(first.x, first.y);
  assert.ok(
    climb >= EXPECT[id].climb[0] && climb <= EXPECT[id].climb[1],
    id + " stepped climb " + climb.toFixed(0) + " m outside expected range",
  );
  console.log(
    `${id}: ${plan.length} steps  tread ${minTread.toFixed(2)}–${maxTread.toFixed(2)} m  riser ${minRise.toFixed(3)}–${maxRise.toFixed(3)} m  stepped climb ${climb.toFixed(0)} m`,
  );
}
console.log("check-stairs OK");
