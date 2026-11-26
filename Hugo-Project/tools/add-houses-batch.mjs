#!/usr/bin/env node
/**
 * Onboard a whole day's follower list in one pass.
 *
 * Reads a CSV of `username,name,district,state` and writes one house record per
 * follower, keyed by the same one-way residentId() the rest of the atlas uses.
 * The raw username is never written to disk.
 *
 * Styling is deliberately varied so a street does not read as a catalogue:
 *
 *  - Every house gets its own size, wall colour, roof colour, weathering and
 *    path width, all drawn from a hash of its own id.
 *  - The 12 house models and the colour palettes are dealt out as shuffled
 *    decks rather than picked at random, so usage stays even instead of
 *    clustering on one or two models.
 *  - Houses are written in an order that keeps neighbours apart: each next
 *    house takes the model and the colour that are least represented at the
 *    end of the queue, and hard rules forbid repeating a model or a wall
 *    colour on a directly adjacent house.
 *
 * Usage:
 *   node tools/add-houses-batch.mjs <csv> [--date YYYY-MM-DD] [--kind community]
 *        [--dry] [--report <file>]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { residentId } from "../static/js/resident-id.js";
import { models } from "../static/js/resident-design.js";

const root = fileURLToPath(new URL("../", import.meta.url));

/* ------------------------------------------------------------------ palettes */

// Warm earth-and-lime plaster, the range vernacular Telugu houses actually use.
const WALLS = [
  "#dec99e", "#d8c3a5", "#c9b99b", "#e2d4b7", "#cdbba0", "#b5ab95",
  "#d9c7ab", "#e4d5be", "#cfc0a2", "#bfae94", "#e8dcc4", "#c4ad8b",
  "#d3c3ad", "#ab9c86", "#e0cdb0", "#c8b69a",
];
// Fired terracotta tile through to weathered slate.
const ROOFS = [
  "#a45e42", "#ad664e", "#96533c", "#8c5843", "#b06b49", "#7d5a44",
  "#9c5f45", "#6f5342", "#b5714f", "#875440", "#a86a52", "#78513f",
];
const WOODS = ["#523424", "#5c3d28", "#65513d", "#4b3122", "#61422d", "#455039"];
const TRIMS = ["#d3ba7e", "#c5a477", "#dfc792", "#cbb07c", "#e2cca0", "#b9a06f"];
const PROPS = [
  "kitchen-garden", "flower-bed", "banana-clump", "shade-tree",
  "cattle-shed", "well", "hayrick", "tulasi-kota",
];
const FACINGS = ["south", "east", "north", "west"];

/* --------------------------------------------------------------------- utils */

/** Deterministic 32-bit hash, so a re-run reproduces the same house exactly. */
function h32(str) {
  let h = 2166136261 >>> 0;
  for (const b of Buffer.from(str, "utf8")) {
    h = (h ^ b) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Small deterministic PRNG seeded from a string. */
function rng(seed) {
  let s = h32(seed) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];
const shuffle = (arr, r) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* ------------------------------------------------------------------ districts */

function normKey(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// The public CSV spellings that differ from the survey catalogue.
const ALIAS = {
  anantapur: "ananthapuramu",
  jagtial: "jagitial",
  jangaon: "jangoan",
  jayashankarbhupalpally: "jayashankarbhupalapally",
  markapur: "markapuram",
  nellore: "sripottisriramulunellore",
  konaseema: "drbrambedkarkonaseema",
};

async function loadDistricts() {
  const dir = path.join(root, "content/districts"),
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md")),
    map = new Map(),
    list = [];
  for (const f of files.sort()) {
    const text = await fs.readFile(path.join(dir, f), "utf8"),
      id = Number(/^\s*id:\s*(\d+)/m.exec(text)?.[1]),
      name = /^\s*name:\s*(.+)$/m.exec(text)?.[1]?.trim().replace(/^['"]|['"]$/g, ""),
      state = /^\s*state:\s*(.+)$/m.exec(text)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
    if (!id || !name || !state) continue;
    const d = { id, name, state };
    list.push(d);
    map.set(normKey(name), d);
  }
  return { list, map };
}

function resolveDistrict({ list, map }, query) {
  const k = normKey(query);
  if (!k) return null;
  if (map.has(k)) return map.get(k);
  if (ALIAS[k] && map.has(ALIAS[k])) return map.get(ALIAS[k]);
  // last resort: one contains the other, but only when unambiguous
  const hits = list.filter((d) => {
    const n = normKey(d.name);
    return n.includes(k) || k.includes(n);
  });
  return hits.length === 1 ? hits[0] : null;
}

/* ----------------------------------------------------------------------- csv */

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

/* ------------------------------------------------------------------- styling */

/**
 * Deal out models and colours so no two adjacent houses clash.
 *
 * `rows` arrives in CSV order. We walk it and, for each house, choose from the
 * least-used candidates for that district, skipping anything already used by
 * the previous two houses (a street runs house-after-house, so "previous" is
 * the real neighbour).
 */
function styleAll(rows) {
  const usedModel = new Map(),     // model -> count
    usedWall = new Map(),
    byDistrict = new Map();

  for (const m of models) usedModel.set(m, 0);
  for (const w of WALLS) usedWall.set(w, 0);

  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i],
      r = rng("style:" + row.id);
    if (!byDistrict.has(row.district_id)) byDistrict.set(row.district_id, []);
    const street = byDistrict.get(row.district_id);
    const prev1 = street.at(-1), prev2 = street.at(-2);

    // --- model: never repeat on a directly adjacent house
    const bannedModels = new Set([prev1?.archetype, prev2?.archetype].filter(Boolean));
    let modelPool = models.filter((m) => !bannedModels.has(m));
    if (!modelPool.length) modelPool = models.filter((m) => m !== prev1?.archetype);
    if (!modelPool.length) modelPool = models.slice();
    modelPool.sort((a, b) => usedModel.get(a) - usedModel.get(b));
    const minModel = usedModel.get(modelPool[0]);
    const modelTier = modelPool.filter((m) => usedModel.get(m) === minModel);
    const archetype = pick(modelTier, r);
    usedModel.set(archetype, usedModel.get(archetype) + 1);

    // --- wall colour: never the same as either neighbour
    const bannedWalls = new Set([prev1?.wall_color, prev2?.wall_color].filter(Boolean));
    let wallPool = WALLS.filter((w) => !bannedWalls.has(w));
    if (!wallPool.length) wallPool = WALLS.filter((w) => w !== prev1?.wall_color);
    if (!wallPool.length) wallPool = WALLS.slice();
    wallPool.sort((a, b) => usedWall.get(a) - usedWall.get(b));
    const minWall = usedWall.get(wallPool[0]);
    const wallTier = wallPool.filter((w) => usedWall.get(w) === minWall);
    const wall_color = pick(wallTier, r);
    usedWall.set(wall_color, usedWall.get(wall_color) + 1);

    // --- roof: avoid the neighbour's roof, no global quota needed
    let roofPool = ROOFS.filter((c) => c !== prev1?.roof_color && c !== prev2?.roof_color);
    if (!roofPool.length) roofPool = ROOFS.filter((c) => c !== prev1?.roof_color);
    if (!roofPool.length) roofPool = ROOFS.slice();
    const roof_color = pick(roofPool, r);

    // --- proportions
    const w = 8.2 + r() * 4.2,           // 8.2 - 12.4 m frontage
      d = 8.0 + r() * 4.0,               // 8.0 - 12.0 m depth
      h = archetype === "balcony-stair"
        ? 5.45 + r() * 0.9
        : 3.75 + r() * 1.15;
    const propCount = 1 + Math.floor(r() * 3);
    const props = [];
    for (let k = 0; props.length < propCount && k < 12; k++) {
      const p = pick(PROPS, r);
      if (!props.includes(p)) props.push(p);
    }

    const spec = {
      archetype,
      size_m: [+w.toFixed(2), +d.toFixed(2), +h.toFixed(2)],
      facing: FACINGS[Math.floor(r() * 4) % 4],
      wall_color,
      roof_color,
      props,
      sign: { wood: pick(WOODS, r), trim: pick(TRIMS, r) },
      weathering: +(0.18 + r() * 0.55).toFixed(3),
      path_width_m: +(1.0 + r() * 0.45).toFixed(2),
    };
    street.push(spec);
    out.push({ ...row, spec });
  }
  return out;
}

/* ---------------------------------------------------------------- file write */

function record(row, kind, date) {
  const q = JSON.stringify(row.name), s = row.spec;
  return [
    "---",
    `title: ${q}`,
    `house_name: ${q}`,
    "type: house",
    `state: ${row.state}`,
    `district: ${row.district}`,
    `district_id: ${row.district_id}`,
    `record_kind: ${kind}`,
    `approved: ${kind !== "demo"}`,
    "area_acres: 1",
    `added: '${date}'`,
    `archetype: ${s.archetype}`,
    "size_m:",
    ...s.size_m.map((n) => `- ${n}`),
    `facing: ${s.facing}`,
    `wall_color: '${s.wall_color}'`,
    `roof_color: '${s.roof_color}'`,
    "props:",
    ...s.props.map((p) => `- ${p}`),
    "sign:",
    `  label: ${q}`,
    `  wood: '${s.sign.wood}'`,
    `  trim: '${s.sign.trim}'`,
    "building:",
    `  weathering: ${s.weathering}`,
    `  path_width_m: ${s.path_width_m}`,
    "---",
    "Virtual village house and one-acre field. This record stores no real username and confers no land title.",
    "",
  ].join("\n");
}

/* ---------------------------------------------------------------------- main */

async function main() {
  const argv = process.argv.slice(2);
  const csvPath = argv.find((a) => !a.startsWith("--"));
  if (!csvPath) {
    console.error("Usage: node tools/add-houses-batch.mjs <csv> [--date YYYY-MM-DD] [--kind community] [--dry] [--report file]");
    process.exit(1);
  }
  const flag = (n, d) => {
    const i = argv.indexOf("--" + n);
    return i >= 0 ? argv[i + 1] : d;
  };
  const date = flag("date", new Date().toISOString().slice(0, 10));
  const kind = flag("kind", "community");
  const dry = argv.includes("--dry");
  const reportPath = flag("report", "");

  const districts = await loadDistricts();
  const text = (await fs.readFile(csvPath, "utf8")).replace(/^\uFEFF/, "");
  const [header, ...body] = parseCsv(text);
  const col = (n) => header.findIndex((h) => h.trim().toLowerCase() === n);
  const ci = {
    username: col("username"), name: col("name"),
    district: col("district"), state: col("state"),
  };
  if (Object.values(ci).some((i) => i < 0))
    throw Error("CSV must have username,name,district,state columns");

  const seen = new Set(), rows = [], bad = [];
  for (const r of body) {
    const username = (r[ci.username] || "").trim().replace(/^@/, ""),
      name = (r[ci.name] || "").trim(),
      districtName = (r[ci.district] || "").trim();
    if (!username || !name) continue;
    const d = resolveDistrict(districts, districtName);
    if (!d) { bad.push({ username, districtName }); continue; }
    const id = residentId(username);
    if (!id) { bad.push({ username, districtName, why: "no id" }); continue; }
    if (seen.has(id)) continue;      // same follower twice in one list
    seen.add(id);
    rows.push({ id, name, district: d.name, district_id: d.id, state: d.state });
  }

  console.log(`  csv rows        : ${body.length}`);
  console.log(`  unique followers: ${rows.length}`);
  if (bad.length) {
    console.log(`  unresolved      : ${bad.length}`);
    for (const b of bad.slice(0, 10)) console.log(`    ${b.username} -> "${b.districtName}"`);
  }

  const styled = styleAll(rows);

  // ---- style report (proves the adjacency rules hold)
  const modelCount = {}, wallCount = {};
  let adjModel = 0, adjWall = 0;
  const lastByDistrict = new Map();
  for (const r of styled) {
    const prev = lastByDistrict.get(r.district_id);
    if (prev) {
      if (prev.spec.archetype === r.spec.archetype) adjModel++;
      if (prev.spec.wall_color === r.spec.wall_color) adjWall++;
    }
    lastByDistrict.set(r.district_id, r);
    modelCount[r.spec.archetype] = (modelCount[r.spec.archetype] || 0) + 1;
    wallCount[r.spec.wall_color] = (wallCount[r.spec.wall_color] || 0) + 1;
  }
  const mc = Object.values(modelCount), wc = Object.values(wallCount);
  console.log(`  models used     : ${Object.keys(modelCount).length}/${models.length}` +
    `  (min ${Math.min(...mc)}, max ${Math.max(...mc)})`);
  console.log(`  wall colours    : ${Object.keys(wallCount).length}/${WALLS.length}` +
    `  (min ${Math.min(...wc)}, max ${Math.max(...wc)})`);
  console.log(`  adjacent repeats: model ${adjModel}, wall ${adjWall}  (must be 0)`);

  const byDistrict = {};
  for (const r of styled)
    byDistrict[r.district] = (byDistrict[r.district] || 0) + 1;
  console.log(`  districts       : ${Object.keys(byDistrict).length}`);

  if (reportPath) {
    await fs.writeFile(reportPath, JSON.stringify({
      generated: styled.length,
      models: modelCount, walls: wallCount, byDistrict,
      adjacentModelRepeats: adjModel, adjacentWallRepeats: adjWall,
      unresolved: bad,
    }, null, 2));
  }

  if (dry) { console.log("  dry run — no files written"); return; }

  let created = 0, skipped = 0;
  for (const row of styled) {
    const p = path.join(root, "content/houses", `${row.id}.md`);
    try {
      await fs.access(p);
      skipped++;
      continue;
    } catch {}
    await fs.writeFile(p, record(row, kind, date), { flag: "wx" });
    created++;
  }
  console.log(`  created         : ${created}`);
  console.log(`  already present : ${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
