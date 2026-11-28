// Phase 3 asset budget: the eager first-load JS graph must stay small
// (mid-range phone constraint) and vendored runtimes stay within caps.
// Lazy chunks (Rapier wasm, postprocessing) are exempt from the eager
// budget — they only load behind ?physics=1 / tier-2 fx.
// Run standalone: node Hugo-Project/tools/check-budget.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = path.join(root, "Hugo-Project/static/dist");
const vendor = path.join(root, "Hugo-Project/static/vendor");

// Dynamic-import chunks only: engine wasm, the fx stack and the opt-in
// perf harness never load on the default path.
const LAZY = /rapier|postprocessing|postfx|perf-harness/i;
const EAGER_GZIP_CAP = 1_200_000; // bytes
const VENDOR_CAP = 9_000_000; // bytes (everything in static/vendor)
const ENTRY_RAW_CAP = 64_000;

assert.ok(fs.existsSync(dist), "dist missing — run npx vite build first");

const files = fs.readdirSync(dist).filter((f) => f.endsWith(".js"));
assert.ok(files.length >= 3, `expected a bundled graph, got ${files.length}`);

let eagerGz = 0;
const rows = [];
for (const f of files) {
  const raw = fs.readFileSync(path.join(dist, f));
  const gz = zlib.gzipSync(raw, { level: 9 }).length;
  const lazy = LAZY.test(f);
  rows.push({ f, raw: raw.length, gz, lazy });
  if (!lazy) eagerGz += gz;
  if (f.startsWith("entry") && raw.length > ENTRY_RAW_CAP)
    assert.fail(`entry.js too large: ${raw.length} > ${ENTRY_RAW_CAP}`);
}

let vendorTotal = 0;
for (const f of fs.readdirSync(vendor)) {
  const p = path.join(vendor, f);
  if (fs.statSync(p).isFile()) vendorTotal += fs.statSync(p).size;
}

const fmt = (n) => (n / 1024).toFixed(1) + "kB";
console.log(
  rows
    .sort((a, b) => b.gz - a.gz)
    .map((r) => `  ${r.lazy ? "[lazy] " : "       "}${r.f.padEnd(42)} raw ${fmt(r.raw).padStart(9)} gz ${fmt(r.gz)}`)
    .join("\n"),
);
console.log(`  vendor total: ${fmt(vendorTotal)} | eager graph gzip: ${fmt(eagerGz)}`);

assert.ok(
  eagerGz <= EAGER_GZIP_CAP,
  `eager JS ${eagerGz} exceeds ${EAGER_GZIP_CAP} gzip budget`,
);
assert.ok(
  vendorTotal <= VENDOR_CAP,
  `vendor ${vendorTotal} exceeds ${VENDOR_CAP}`,
);
// The world chunk must not silently swallow the engine libs.
const worldRow = rows.find((r) => /^world-/.test(r.f));
if (worldRow)
  assert.ok(
    worldRow.raw < 1_500_000,
    `world chunk ${worldRow.raw} — engine libs must stay in lazy chunks`,
  );

console.log(
  `check-budget: PASS eager-gz ${fmt(eagerGz)}/${fmt(EAGER_GZIP_CAP)} vendor ${fmt(vendorTotal)}/${fmt(VENDOR_CAP)}`,
);
