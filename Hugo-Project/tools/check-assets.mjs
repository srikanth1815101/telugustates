// check-assets — CI gate for the procedural GLB pipeline (Phase 2).
// Verifies every model in tools/model-spec.mjs exists as a meshopt-
// compressed GLB with the nodes the runtime looks up (crop stages,
// buggy wheels), within its triangle budget, with a baked icon and a
// LICENSES.json record whose sha256 matches the file on disk. Fails on
// orphan files too. Run: node tools/check-assets.mjs
// @ts-check
import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { MODELS, BUDGET } from "./model-spec.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const staticRoot = join(root, "Hugo-Project", "static");
const modelDir = join(staticRoot, "assets", "models");
const iconDir = join(staticRoot, "assets", "icons");
const LICENSES = join(staticRoot, "assets", "LICENSES.json");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
let failed = 0;
const fail = (msg) => { failed++; console.error("✗", msg); };

/** Parse a GLB: returns { json, bytes } or throws. */
async function parseGlb(path) {
  const buf = await readFile(path);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67)
    throw new Error("not a GLB (bad magic)");
  if (buf.readUInt32LE(4) !== 2) throw new Error("GLB version != 2");
  const chunkLen = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error("first chunk not JSON");
  const json = JSON.parse(buf.subarray(20, 20 + chunkLen).toString("utf8"));
  return { json, bytes: buf };
}

/** Triangle count from the glTF JSON. */
function tris(json) {
  let n = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.indices != null)
        n += json.accessors[prim.indices].count / 3;
      else if (prim.attributes?.POSITION != null)
        n += json.accessors[prim.attributes.POSITION].count / 3;
    }
  }
  return Math.round(n);
}

const lic = JSON.parse(await readFile(LICENSES, "utf8"));
const licMap = new Map((lic.files ?? []).map((e) => [e.file, e]));
if (!(lic.files ?? []).length) fail("LICENSES.json has no files[] entries");

for (const [name, spec] of Object.entries(MODELS)) {
  const rel = `assets/models/${name}.glb`;
  const relIcon = `assets/icons/${name}.png`;
  let json, bytes;
  try {
    ({ json, bytes } = await parseGlb(join(staticRoot, rel)));
  } catch (e) {
    fail(`${rel}: ${e.message} — run node tools/make-models.mjs`);
    continue;
  }

  // nodes the runtime looks up
  const nodes = new Set((json.nodes ?? []).map((n) => n.name));
  for (const need of spec.required)
    if (!nodes.has(need)) fail(`${name}: missing required node "${need}"`);

  // budget (prompt: character 5k / vehicle 3k / building 4k / prop 500)
  const n = tris(json);
  const budget = BUDGET[spec.cat];
  if (n > budget) fail(`${name}: ${n} tris > budget ${budget}`);

  // sane size (meshopt-compressed low-poly should stay tiny)
  if (bytes.length > 65536) fail(`${name}: ${bytes.length} B > 64 kB`);

  // compression actually applied
  const exts = json.extensionsUsed ?? [];
  if (!exts.includes("EXT_meshopt_compression"))
    fail(`${name}: not meshopt-compressed`);

  // icon baked
  try {
    const icon = await readFile(join(staticRoot, relIcon));
    if (icon.readUInt32BE(0) !== 0x89504e47) fail(`${relIcon}: not a PNG`);
  } catch {
    fail(`${relIcon}: missing`);
  }

  // license record with matching sha256
  const entry = licMap.get(rel);
  if (!entry) fail(`${rel}: no LICENSES.json entry`);
  else if (entry.sha256 !== sha256(bytes))
    fail(`${rel}: LICENSES sha256 mismatch (record is stale)`);
  const iconEntry = licMap.get(relIcon);
  if (!iconEntry) fail(`${relIcon}: no LICENSES.json entry`);
  else if (iconEntry.sha256 !== sha256(await readFile(join(staticRoot, relIcon))))
    fail(`${relIcon}: LICENSES sha256 mismatch (record is stale)`);

  console.log(`  ${name.padEnd(18)} ${String(n).padStart(4)} tris  ${String(bytes.length).padStart(6)} B`);
}

// orphans: files on disk that the spec doesn't know about
for (const f of await readdir(modelDir)) {
  const name = f.replace(/\.glb$/, "");
  if (!MODELS[name]) fail(`orphan model assets/models/${f} (not in model-spec.mjs)`);
}
for (const f of await readdir(iconDir)) {
  const name = f.replace(/\.png$/, "");
  if (!MODELS[name]) fail(`orphan icon assets/icons/${f} (not in model-spec.mjs)`);
}

if (failed) {
  console.error(`check-assets: ${failed} problem(s)`);
  process.exit(1);
}
console.log(`check-assets: ${Object.keys(MODELS).length} models + icons OK (nodes, budgets, meshopt, licenses)`);
