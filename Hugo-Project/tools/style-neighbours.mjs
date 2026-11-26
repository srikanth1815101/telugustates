#!/usr/bin/env node
/**
 * Give every house its own look, judged by where it actually stands.
 *
 * tools/add-houses-batch.mjs picks styles before settlement, so it can only
 * reason about the order rows arrive in. Settlement then decides the real
 * street layout, and two houses that shared a model could end up side by side.
 *
 * This pass runs *after* settling. It reads each house's pinned cell, works out
 * which houses genuinely stand next to each other, and recolours the grid so no
 * two neighbours repeat a house model, a wall colour or a roof colour. Colours
 * are then pushed as far apart as the palettes allow.
 *
 * Because the three constraints are separate, each is solved as its own graph
 * colouring: models get 12 colours, walls 16, roofs 12, all far above the
 * maximum neighbour count of 9. Large houses are coloured first, which is the
 * usual way to keep greedy colouring tight.
 *
 * Usage:
 *   node tools/style-neighbours.mjs [--radius 2.5] [--dry] [--report <file>]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { models } from "../static/js/resident-design.js";

const root = fileURLToPath(new URL("../", import.meta.url));

/* ------------------------------------------------------------------ palettes */

// Kept identical to add-houses-batch.mjs so a house never switches family.
const WALLS = [
  "#dec99e", "#d8c3a5", "#c9b99b", "#e2d4b7", "#cdbba0", "#b5ab95",
  "#d9c7ab", "#e4d5be", "#cfc0a2", "#bfae94", "#e8dcc4", "#c4ad8b",
  "#d3c3ad", "#ab9c86", "#e0cdb0", "#c8b69a",
];
const ROOFS = [
  "#a45e42", "#ad664e", "#96533c", "#8c5843", "#b06b49", "#7d5a44",
  "#9c5f45", "#6f5342", "#b5714f", "#875440", "#a86a52", "#78513f",
];

/* --------------------------------------------------------------------- utils */

function h32(str) {
  let h = 2166136261 >>> 0;
  for (const b of Buffer.from(str, "utf8")) {
    h = (h ^ b) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function rng(seed) {
  let s = h32(seed) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------ front matter */

function readHouses(text) {
  const end = text.indexOf("\n---", 3);
  const head = text.slice(3, end);
  const get = (k) => {
    const m = new RegExp(`^${k}:\\s*(.+)$`, "m").exec(head);
    return m ? m[1].trim().replace(/^['"]|['"]$/g, "") : null;
  };
  const cell = /^cell:\s*\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/m.exec(head);
  return {
    added: get("added"),
    archetype: get("archetype"),
    wall_color: get("wall_color"),
    roof_color: get("roof_color"),
    cell: cell ? [Number(cell[1]), Number(cell[2])] : null,
  };
}

/** Replace the scalar fields we own, leaving every other line byte-identical. */
function rewrite(text, { archetype, wall_color, roof_color }) {
  const end = text.indexOf("\n---", 3);
  let head = text.slice(3, end);
  head = head.replace(/^archetype:.*$/m, `archetype: ${archetype}`);
  head = head.replace(/^wall_color:.*$/m, `wall_color: '${wall_color}'`);
  head = head.replace(/^roof_color:.*$/m, `roof_color: '${roof_color}'`);
  return text.slice(0, 3) + head + text.slice(end);
}

/* ----------------------------------------------------------------- colouring */

/**
 * Welsh-Powell style greedy colouring on a fixed palette.
 *
 * `order` gives the vertices biggest-first. For each vertex we take the colour
 * whose *global* usage is lowest among those not already used by a neighbour,
 * which keeps the distribution even as well as valid.
 */
function colour(nodes, neighbours, palette, seedKey) {
  const usage = new Map(palette.map((c) => [c, 0]));
  const out = new Map();
  const r = rng(seedKey);
  for (const n of nodes) {
    const taken = new Set();
    for (const m of neighbours.get(n) || []) {
      const c = out.get(m);
      if (c !== undefined) taken.add(c);
    }
    let pool = palette.filter((c) => !taken.has(c));
    if (!pool.length) pool = palette.slice();     // impossible here, but never fail hard
    const min = Math.min(...pool.map((c) => usage.get(c)));
    const tier = pool.filter((c) => usage.get(c) === min);
    const choice = tier[Math.floor(r() * tier.length) % tier.length];
    out.set(n, choice);
    usage.set(choice, usage.get(choice) + 1);
  }
  return out;
}

/* ---------------------------------------------------------------------- main */

async function main() {
  const argv = process.argv.slice(2);
  const flag = (n, d) => {
    const i = argv.indexOf("--" + n);
    return i >= 0 ? argv[i + 1] : d;
  };
  const radius = Number(flag("radius", 2.5));
  // Houses that are already live must never be restyled: a resident's model,
  // colours and position are fixed once their home is published. Only houses
  // added on or after --since are candidates.
  const since = flag("since", "");
  const dry = argv.includes("--dry");
  const reportPath = flag("report", "");

  // --- read every house
  const dir = path.join(root, "content/houses");
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
  const houses = new Map();
  for (const f of files) {
    const p = path.join(dir, f),
      text = await fs.readFile(p, "utf8"),
      rec = readHouses(text);
    if (!rec.cell) continue;                       // unsettled: nothing to place yet
    // A published house is immutable. Restyling one would move a resident's
    // home out from under them, so anything added before --since is frozen.
    const free = !since || !rec.added || rec.added >= since;
    houses.set(f.slice(0, -3), { ...rec, file: p, text, free });
  }
  console.log(`  settled houses  : ${houses.size}`);

  // --- neighbour graph
  const neighbours = new Map();
  const ids = [...houses.keys()];
  for (const u of ids) neighbours.set(u, new Set());
  let edges = 0;
  for (let i = 0; i < ids.length; i++) {
    const a = houses.get(ids[i]).cell;
    for (let j = i + 1; j < ids.length; j++) {
      const b = houses.get(ids[j]).cell;
      const dx = a[0] - b[0], dy = a[1] - b[1];
      if (dx * dx + dy * dy <= radius * radius) {
        neighbours.get(ids[i]).add(ids[j]);
        neighbours.get(ids[j]).add(ids[i]);
        edges++;
      }
    }
  }
  const degree = ids.map((u) => neighbours.get(u).size);
  console.log(`  neighbour pairs : ${edges}  (max ${Math.max(...degree)} per house)`);

  // biggest-first: the constrained houses get first pick of colours
  const frozenSet = new Set(ids.filter((u) => !houses.get(u).free));
  const pressure = (u) =>
    [...neighbours.get(u)].filter((v) => frozenSet.has(v)).length;
  const order = ids.slice().sort((a, b) =>
    pressure(b) - pressure(a) ||
    neighbours.get(b).size - neighbours.get(a).size || a.localeCompare(b));

  // Frozen houses keep their published look; they act as fixed colours that
  // their neighbours must avoid. Only the free houses are coloured.
  const frozen = new Set(ids.filter((u) => !houses.get(u).free));
  const seed = (map, key) => {
    for (const u of frozen) map.set(u, houses.get(u)[key]);
    return map;
  };
  const arch = seed(new Map(), "archetype"),
    wall = seed(new Map(), "wall_color"),
    roof = seed(new Map(), "roof_color");
  const free = order.filter((u) => houses.get(u).free);
  for (const [map, palette, key] of [
    [arch, models, "model-layout"],
    [wall, WALLS, "wall-layout"],
    [roof, ROOFS, "roof-layout"],
  ]) {
    for (const [u, c] of colour(free, neighbours, palette, key)) map.set(u, c);
    // A single greedy sweep can strand a house hemmed in by frozen neighbours.
    // Repaint any free house that still clashes, choosing a colour no neighbour
    // uses; repeat until quiet, then leave it to the audit to object.
    for (let pass = 0; pass < 12; pass++) {
      let fixed = 0;
      for (const u of free) {
        const taken = new Set();
        for (const v of neighbours.get(u)) taken.add(map.get(v));
        if (!taken.has(map.get(u))) continue;
        const open = palette.filter((c) => !taken.has(c));
        if (!open.length) continue;
        map.set(u, open[Math.floor((h32(u + key) % open.length))]);
        fixed++;
      }
      if (!fixed) break;
    }
  }

  // --- audit the result before writing anything
  const clash = (map, label) => {
    const list = [];
    for (const u of ids)
      for (const v of neighbours.get(u))
        if (u < v && map.get(u) === map.get(v))
          if (houses.get(u).free || houses.get(v).free) list.push([u, v]);
    return { label, bad: list.length, list };
  };
  const audit = [clash(arch, "model"), clash(wall, "wall"), clash(roof, "roof")];
  for (const a of audit) console.log(`  ${a.label.padEnd(5)} clashes : ${a.bad}`);

  const dist = (map, label, palette) => {
    const c = new Map(palette.map((p) => [p, 0]));
    for (const v of map.values()) c.set(v, c.get(v) + 1);
    const vals = [...c.values()];
    console.log(`  ${label.padEnd(5)} spread : ${new Set(map.values()).size}/${palette.length} used, ` +
      `min ${Math.min(...vals)}, max ${Math.max(...vals)}`);
    return { used: new Set(map.values()).size, min: Math.min(...vals), max: Math.max(...vals) };
  };
  const spread = {
    model: dist(arch, "model", models),
    wall: dist(wall, "wall", WALLS),
    roof: dist(roof, "roof", ROOFS),
  };

  if (reportPath)
    await fs.writeFile(reportPath, JSON.stringify({
      houses: houses.size, edges,
      maxDegree: Math.max(...degree), radius,
      clashes: Object.fromEntries(audit.map((a) => [a.label, a.bad])),
      spread,
    }, null, 2));

  if (audit.some((a) => a.bad)) {
    console.error("  refusing to write: a palette is too small for this layout");
    process.exit(1);
  }
  if (dry) { console.log("  dry run — no files written"); return; }

  // --- write only the lines that actually change
  let changed = 0;
  for (const u of ids) {
    const h = houses.get(u);
    if (!h.free) continue;
    const next = { archetype: arch.get(u), wall_color: wall.get(u), roof_color: roof.get(u) };
    if (next.archetype === h.archetype && next.wall_color === h.wall_color && next.roof_color === h.roof_color)
      continue;
    await fs.writeFile(h.file, rewrite(h.text, next));
    changed++;
  }
  console.log(`  houses restyled: ${changed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
