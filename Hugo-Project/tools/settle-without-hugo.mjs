#!/usr/bin/env node
/**
 * Run any Hugo-dependent tool with no Hugo installed.
 *
 * Defaults to tools/settle.mjs; pass another tool's path as the first
 * argument (tools/check-homes.mjs, tools/check-content.mjs, ...).
 *
 * Those scripts shell out to `hugo` purely to obtain catalog.json; everything
 * else they read is already committed under static/. This provides a `hugo`
 * stub on PATH that writes a catalog built from the content files, then
 * delegates to the real script unchanged.
 *
 * None of the logic under test is reimplemented here -- it is the real
 * script, so street layout, lot sizing, pin placement and the checks stay
 * identical to a normal run.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// Default to the project this script lives in, but honour the cwd when the
// script is invoked from another checkout (check-growth.mjs copies the project
// to a temp dir and runs its tools there, so this must follow the copy).
const here = fileURLToPath(new URL("../", import.meta.url));
const root = path.resolve(process.cwd(), "..") === path.resolve(here)
  ? here
  : (await fs.access(path.join(process.cwd(), "hugo.toml")).then(() => process.cwd(), () => here)) + path.sep;
const run = promisify(execFile);

const bin = await fs.mkdtemp(path.join(os.tmpdir(), "settle-nohugo-bin-"));
const stub = path.join(bin, "hugo");
const repoRoot = root;

// The stub ignores Hugo's flags except --destination, and emits the one file
// settle.mjs consumes.
await fs.writeFile(
  stub,
  `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const args = process.argv.slice(2);
const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const dest = arg("--destination");
// Honour Hugo's --source: check-growth.mjs settles a copy in a temp dir, so the
// catalogue has to describe that copy, not this script's own checkout.
const source = arg("--source") || ${JSON.stringify(repoRoot)};
(async () => {
  const mod = await import(pathToFileURL(path.join(${JSON.stringify(repoRoot)}, "tools/catalog-without-hugo.mjs")).href);
  const catalog = await mod.buildCatalog(source);
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, "catalog.json"), JSON.stringify(catalog));
  // Hugo publishes static/ into the destination; settle.mjs reads tiles,
  // ecology and the atlas projection from there, so mirror it wholesale.
  fs.cpSync(path.join(source, "static"), dest, {
    recursive: true,
    force: true,
  });
})().catch((e) => { console.error(e); process.exit(1); });
`,
  { mode: 0o755 },
);

// First argument selects the tool when it is a script; otherwise everything
// goes through to settle.mjs.
const argv = process.argv.slice(2);
const tool =
  argv[0] && /\.m?js$/.test(argv[0]) ? argv.shift() : "tools/settle.mjs";

const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH };
try {
  const { stdout, stderr } = await run(
    process.execPath,
    [path.join(root, tool), ...argv],
    { cwd: root, env, maxBuffer: 64 * 1024 * 1024 },
  );
  process.stdout.write(stdout);
  if (stderr.trim()) process.stderr.write(stderr);
} finally {
  await fs.rm(bin, { recursive: true, force: true });
}
