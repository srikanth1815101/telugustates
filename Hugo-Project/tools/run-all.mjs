#!/usr/bin/env node
// Run every regression check exactly as CI does, in order, and report a
// pass/fail table. Exit code 1 if any check fails.
// Usage: node tools/run-all.mjs [--tiles]
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// CI always runs check-content with --tiles (1 193 terrain hashes).
const checks = [
  ["check-content", true],
  ["check-villages", false],
  ["check-growth", false],
  ["check-homes", false],
  ["check-motion", false],
  ["check-stones", false],
  ["check-swim", false],
  ["check-river-margin", false],
  ["check-banks", false],
  ["check-current-pages", false],
  ["check-stages", false],
  ["check-jump-cycle", false],
  ["check-rain-state", false],
  ["check-runoff", false],
  ["check-water", false],
  ["check-littoral", false],
  ["check-scene-contact", false],
  ["check-systems", false],
  ["check-physics", false],
  ["check-slices", false],
  ["check-budget", false],
];

const results = [];
let failed = false;
for (const [name, wantsTiles] of checks) {
  const script = join(here, `${name}.mjs`);
  if (!existsSync(script)) {
    results.push([name, "MISSING", 0]);
    failed = true;
    continue;
  }
  const args = [script, ...(name === "check-content" ? ["--tiles"] : [])];
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, {
    cwd: join(here, ".."),
    encoding: "utf8",
    timeout: 420_000,
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const ok = r.status === 0;
  results.push([name, ok ? "PASS" : `FAIL(${r.status})`, secs]);
  if (!ok) {
    failed = true;
    console.error(`--- ${name} output ---`);
    console.error((r.stdout || "") + (r.stderr || ""));
  }
}
const pad = (s, n) => String(s).padEnd(n);
console.log(pad("CHECK", 26) + pad("RESULT", 10) + "SECONDS");
for (const [n, s, t] of results) console.log(pad(n, 26) + pad(s, 10) + t);
console.log(failed ? "\nFAILED" : "\nALL CHECKS PASS");
process.exit(failed ? 1 : 0);
