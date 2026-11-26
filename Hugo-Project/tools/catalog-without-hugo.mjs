#!/usr/bin/env node
/**
 * Publish catalog.json without Hugo.
 *
 * settle.mjs reads Hugo's planning build. Everything else it needs is already
 * committed (static/data, static/frozen, static/library), so the only missing
 * input is catalog.json. This reproduces the parts settle.mjs actually reads:
 * districts (id, name, anchor, label) and one row per house record.
 *
 * Deliberately narrow: it is not a Hugo replacement, and it is only run by the
 * settlement helper. Anything that depends on Hugo's own parsing still needs
 * Hugo.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

async function frontMatter(file) {
  const text = await fs.readFile(file, "utf8");
  if (!text.startsWith("---")) throw Error("No front matter: " + file);
  const end = text.indexOf("\n---", 3);
  if (end < 0) throw Error("Unterminated front matter: " + file);
  return { head: text.slice(3, end), body: text.slice(end + 4) };
}

// Just enough YAML for these records: scalars, and the couple of nested keys
// settle.mjs touches. Anything unexpected is left as a string rather than
// silently guessed at.
function scalar(v) {
  const t = v.trim();
  if (/^['"].*['"]$/.test(t)) return t.slice(1, -1);
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d*\.\d+$/.test(t)) return Number(t);
  return t;
}

function inlineList(t) {
  const inner = t.trim().replace(/^\[|\]$/g, "");
  if (!inner.trim()) return [];
  return inner.split(",").map((s) => {
    const x = s.trim();
    if (x.startsWith("[")) return inlineList(x);
    return scalar(x);
  });
}

function parseHead(head) {
  const out = {},
    lines = head.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*-\s/.test(lines[i])) continue; // list item, owned by its key
    const m = /^\s*([A-Za-z_][\w]*):\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const [, k, rest] = m;
    if (rest === "") {
      // Indented block: either a nested map or a list.
      // Continuation lines are indented, or a "- " list which YAML allows at
      // the same column as its key (house records are written that way).
      const block = [];
      while (
        i + 1 < lines.length &&
        (/^\s+\S/.test(lines[i + 1]) || /^-\s/.test(lines[i + 1]))
      )
        block.push(lines[++i]);
      if (!block.length) {
        out[k] = "";
        continue;
      }
      if (/^\s*- /.test(block[0])) {
        // A run of "- <scalar>" lines is a flat list; "- [" starts a list of
        // pairs, which is how candidate acres are written.
        out[k] = block.map((b) => {
          const t = b.replace(/^\s*-\s*/, "").trim();
          return t.startsWith("[") ? inlineList(t) : scalar(t);
        });
      } else {
        // Nested map whose keys may themselves hold indented lists, e.g.
        //   anchor:
        //   - 2355
        //   - 7773
        // Inside a block the "- " lines belong to the most recent key.
        const nested = {};
        let lastKey = null;
        for (const b of block) {
          const listItem = /^\s+-\s*(.*)$/.exec(b);
          if (listItem) {
            if (!lastKey) continue;
            if (!Array.isArray(nested[lastKey])) nested[lastKey] = [];
            const t = listItem[1].trim();
            nested[lastKey].push(t.startsWith("[") ? inlineList(t) : scalar(t));
            continue;
          }
          const n = /^\s+([A-Za-z_][\w]*):\s*(.*)$/.exec(b);
          if (n) {
            lastKey = n[1];
            nested[n[1]] = n[2] === "" ? null : scalar(n[2]);
          }
        }
        out[k] = nested;
      }
    } else if (rest.startsWith("[")) {
      out[k] = inlineList(rest);
    } else {
      out[k] = scalar(rest);
    }
  }
  return out;
}

/**
 * Minimal YAML reader for the content bodies Hugo unmarshals: nested maps,
 * lists of scalars, lists of maps, and inline [a, b] pairs. Scalars are
 * coerced the way Hugo's YAML would (numbers, booleans, quoted strings).
 * Not a general YAML implementation -- no anchors, multi-doc or block scalars.
 */
function parseYaml(text) {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\t/g, "  "))
    .filter((l) => l.trim() && !/^\s*#/.test(l));
  let i = 0;

  const indentOf = (l) => l.length - l.trimStart().length;

  function parseBlock(indent) {
    if (i >= lines.length) return null;
    const first = lines[i];
    if (indentOf(first) < indent) return null;
    if (/^\s*-\s/.test(first)) {
      const arr = [];
      while (i < lines.length && indentOf(lines[i]) === indent && /^\s*-\s/.test(lines[i])) {
        const rest = lines[i].replace(/^\s*-\s*/, "").trim();
        i++;
        if (!rest) arr.push(parseBlock(indent + 2));
        else if (/^[\w.-]+:\s/.test(rest)) {
          // "- key: value" starts a map item; feed the pair back in.
          const obj = {};
          const m = /^([\w.-]+):\s*(.*)$/.exec(rest);
          obj[m[1]] = m[2] === "" ? parseBlock(indent + 4) : scalar(m[2]);
          while (i < lines.length && indentOf(lines[i]) > indent) {
            const mm = /^\s*([\w.-]+):\s*(.*)$/.exec(lines[i]);
            if (!mm) { i++; continue; }
            i++;
            obj[mm[1]] = mm[2] === "" ? parseBlock(indentOf(lines[i - 1]) + 2) : scalar(mm[2]);
          }
          arr.push(obj);
        } else arr.push(scalar(rest));
      }
      return arr;
    }
    const obj = {};
    while (i < lines.length) {
      const line = lines[i];
      const ind = indentOf(line);
      if (ind < indent) break;
      const m = /^\s*([\w.-]+):\s*(.*)$/.exec(line);
      if (!m) { i++; continue; }
      i++;
      if (m[2] === "") {
        const child = i < lines.length && indentOf(lines[i]) > ind ? parseBlock(indentOf(lines[i])) : null;
        obj[m[1]] = child;
      } else obj[m[1]] = m[2].startsWith("[") ? inlineList(m[2]) : scalar(m[2]);
    }
    return obj;
  }
  return parseBlock(0);
}

/** Hugo's hash.FNV32a: 32-bit FNV-1a over the UTF-8 bytes, as an unsigned int. */
export function fnv32a(str) {
  let h = 2166136261 >>> 0;
  for (const b of Buffer.from(str, "utf8")) {
    h = (h ^ b) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export async function buildCatalog(base = process.cwd()) {
  const content = (p) => path.join(base, "content", p);

  const districts = [];
  for (const f of (await fs.readdir(content("districts"))).filter((f) =>
    f.endsWith(".md"),
  )) {
    const { head, body } = await frontMatter(
        path.join(content("districts"), f),
      ),
      d = parseHead(head).district ?? {};
    if (!d.id) continue;
    // The body is the district's candidate-acre pool: [x, y, elevation].
    const pool = [];
    for (const m of body.matchAll(/\[\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/g))
      pool.push([Number(m[1]), Number(m[2]), Number(m[3])]);
    districts.push({
      id: Number(d.id),
      name: d.name,
      state: d.state,
      anchor: d.anchor ?? d.village_root,
      label: d.label,
      capacity: d.capacity,
      pool,
    });
  }
  districts.sort((a, b) => a.id - b.id);

  // Pinned residences, so a settled record that disagrees with the ledger is
  // rejected the way catalog.html rejects it.
  const pinned = new Map(),
    reservedCells = new Set();
  try {
    const ledger = JSON.parse(
      await fs.readFile(path.join(base, "data/settlements.json"), "utf8"),
    );
    for (const v of ledger.villages || [])
      for (const [id, pin] of Object.entries(v.homes || {})) pinned.set(id, pin);
  } catch {}
  const houses = [],
    takenCells = new Set();
  for (const f of (await fs.readdir(content("houses"))
    .catch(() => []))
    .filter((f) => f.endsWith(".md") && f !== "_index.md")) {
    const u = f.slice(0, -3).toLowerCase(),
      { head } = await frontMatter(path.join(content("houses"), f)),
      p = parseHead(head);
    if (/^username\s*:/im.test(head))
      throw Error("House file stores a real username: " + f);
    if (!/^h[0-9a-f]{24}$/.test(u))
      throw Error("House filename is not a one-way id: " + f);
    // catalog.html assigns a suggested acre when a record has no cell: scan the
    // district pool from an FNV32a(u) offset, skipping acreage already spoken
    // for. settle.mjs then confirms the cell against real terrain.
    let cell = pinned.get(u)?.c ?? p.cell ?? null,
      elevation = p.elevation_m ?? null;
    if (!cell) {
      const pool = (districts.find((x) => x.id === Number(p.district_id))?.pool) || [],
        seed = fnv32a(u);
      for (let i = 0; i < pool.length; i++) {
        const [x, y, z] = pool[(seed + i) % pool.length],
          k = `${x},${y}`;
        if (takenCells.has(k) || reservedCells.has(k)) continue;
        cell = [x, y];
        elevation = z;
        takenCells.add(k);
        break;
      }
    } else takenCells.add(`${cell[0]},${cell[1]}`);

    // Mirror the row catalog.html emits: `house` carries the design fields
    // residentDesign() reads, with the same defaults the template applies.
    const sign = p.sign ?? {},
      label = String(p.house_name ?? sign.label ?? p.title ?? "").trim();
    // catalog.html hard-errors when a settled house disagrees with the pinned
    // residence in data/settlements.json. Without this guard the no-Hugo stub
    // would happily publish a corrupted record that real Hugo rejects, which is
    // exactly what check-growth tests for.
    if (p.homeLocation && pinned.has(u)) {
      const pin = pinned.get(u);
      const same = (a, b) =>
        Array.isArray(a) && Array.isArray(b) &&
        a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
      if (!same(p.homeLocation, pin.p) || !same(cell, pin.c))
        throw Error(
          "Conflicting pinned residence/acre for " + u,
        );
    }

    houses.push({
      u,
      d: Number(p.district_id),
      name: label,
      c: cell,
      acreLocation: cell,
      elevation_m: elevation,
      // Hugo publishes the row's terrain height as `z` as well as elevation_m,
      // and settle.mjs grades candidate sites on it. Leaving it out changed
      // which acres settlement would accept, so the stub never walked the same
      // path the real build does.
      z: elevation,
      lat: p.lat ?? null,
      lon: p.lon ?? null,
      corners: p.corners ?? null,
      approved: p.approved ?? false,
      record_kind: p.record_kind ?? "unreviewed",
      href: `/houses/${u}/`,
      homeLocation: p.homeLocation ?? null,
      villageId: p.villageId ?? "",
      added: String(p.added ?? ""),
      // catalog.html takes `court` from the settlement pin (`$pins.Get $u`),
      // not from the house's own front matter: the pin carries the lot angle,
      // frontage, gate and porch that residentDesign() lays the house out
      // against. Emitting `p.pin` here left court null for every settled house,
      // which sent residentDesign() down a branch real Hugo never takes and hid
      // the failure it was supposed to reproduce.
      court: pinned.get(u) ?? null,
      house: {
        setback_m: 9,
        lateral_m: 0,
        path_width_m: 1.3,
        weathering: 0.35,
        archetype: p.archetype ?? "pillared-tile",
        size_m: p.size_m ?? [11, 9, 4.2],
        facing: p.facing ?? "south",
        wall_color: p.wall_color ?? "#dec99e",
        roof_color: p.roof_color ?? "#a45e42",
        road_side: p.facing ?? "south",
        props: p.props ?? [],
        seed: fnv32a(u),
        sign: { ...sign, label },
      },
    });
  }

  // catalog.html merges every content/world page as world[<key>] from its YAML
  // body. ecology() depends on world.ecology specifically.
  const world = {};
  for (const f of (await fs.readdir(content("world"))).filter((f) =>
    f.endsWith(".md") && f !== "_index.md",
  )) {
    const { head, body } = await frontMatter(path.join(content("world"), f)),
      p = parseHead(head);
    if (!p.key) continue;
    world[p.key] = parseYaml(body);
  }

  return {
    houses,
    world,
    districts,
    trails: [],
    places: [],
    roads: [],
    resources: {},
    languages: { en: {}, te: {} },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [outPath] = process.argv.slice(2);
  const catalog = await buildCatalog();
  const text = JSON.stringify(catalog);
  if (outPath) {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, text);
    console.log(
      `wrote ${outPath}: ${catalog.houses.length} houses, ${catalog.districts.length} districts`,
    );
  } else process.stdout.write(text);
}
