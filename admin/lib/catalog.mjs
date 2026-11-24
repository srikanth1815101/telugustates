// Builds `catalog.json` in Node, exactly as `layouts/partials/catalog.html`
// builds it in Hugo.
//
// The 3D engine loads `catalog.json`, not the Markdown. Hugo renders that file
// from content at build time. The admin has no Hugo, so it renders the same
// document here. Any field the engine reads must be produced identically,
// otherwise the editor would be previewing a different world than the site
// ships -- which is exactly the failure this module exists to prevent.

import { listSection, readDocument, readData, CONTENT } from "./content.mjs";
import path from "node:path";

// FNV-1a, matching Hugo's `hash.FNV32a`.
export function fnv32a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const DEFAULTS = {
  setback_m: 9,
  lateral_m: 0,
  path_width_m: 1.3,
  weathering: 0.35,
  archetype: "pillared-tile",
  size_m: [11, 9, 4.2],
  facing: "south",
  wall_color: "#dec99e",
  roof_color: "#a45e42",
};

const isPlainObject = (v) => v && typeof v === "object" && !Array.isArray(v);
const deepMerge = (...sources) => {
  const out = {};
  for (const s of sources) {
    if (!isPlainObject(s)) continue;
    for (const [k, v] of Object.entries(s)) {
      out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
    }
  }
  return out;
};

// Rebuild the exact document the engine consumes.
export async function buildCatalog() {
  const settlements = await readData("settlements.json");
  const villages = settlements?.villages || [];

  const pins = new Map();
  const hamlet = new Map();
  const limits = new Set();
  for (const v of villages) {
    for (const [name, pin] of Object.entries(v.homes || {})) {
      pins.set(name, pin);
      hamlet.set(name, v.id);
    }
    for (const [x, y] of v.reserve || []) limits.add(`${x},${y}`);
  }

  const districts = (await listSection("districts")).map((n) => path.join(CONTENT, "districts", n));
  const districtDocs = await Promise.all(districts.map((f) => readDocument(f)));
  const districtParams = districtDocs.map((d) => d.data?.district || {}).filter(Boolean);
  const pools = new Map();
  for (const d of districtDocs) {
    const body = d.body.trim();
    if (!body) continue;
    const key = String(d.data?.district?.id ?? "");
    // The body is a YAML flow sequence of [x, y, z] candidate acres.
    pools.set(key, parseCandidateAcres(body));
  }

  const houseFiles = await listSection("houses");
  const houseDocs = await Promise.all(
    houseFiles.map((n) => readDocument(path.join(CONTENT, "houses", n))),
  );
  houseDocs.sort((a, b) => a.file.localeCompare(b.file));

  const used = new Set();
  for (const d of houseDocs) {
    if (Array.isArray(d.data?.cell)) used.add(`${d.data.cell[0]},${d.data.cell[1]}`);
  }

  const houses = [];
  for (const d of houseDocs) {
    const p = d.data || {};
    const u = path.basename(d.file, ".md").toLowerCase();
    if (!/^h[0-9a-f]{24}$/.test(u)) continue; // Hugo rejects these; skip rather than lie.
    const label = String(p.house_name ?? p.sign?.label ?? p.title ?? "").trim();
    const did = p.district_id ?? 32;
    const pool = pools.get(String(did)) || [];

    let cell = p.cell;
    let z = p.elevation_m;
    if (!Array.isArray(cell)) {
      const seed = fnv32a(u);
      for (let i = 0; i < pool.length; i++) {
        const v = pool[(seed + i) % pool.length];
        if (!v) continue;
        const key = `${v[0]},${v[1]}`;
        if (!used.has(key) && !limits.has(key)) {
          cell = [v[0], v[1]];
          z = v[2];
          used.add(key);
          break;
        }
      }
    }
    if (!Array.isArray(cell)) continue;

    const pin = pins.get(u) || null;
    const sign = deepMerge(p.sign || {}, { label });
    let house = deepMerge(DEFAULTS, p.building || {});
    house = deepMerge(house, {
      archetype: p.archetype ?? DEFAULTS.archetype,
      size_m: p.size_m ?? DEFAULTS.size_m,
      facing: p.facing ?? DEFAULTS.facing,
      wall_color: p.wall_color ?? DEFAULTS.wall_color,
      roof_color: p.roof_color ?? DEFAULTS.roof_color,
      road_side: p.road_side ?? (p.facing ?? DEFAULTS.facing),
      props: p.props ?? [],
      sign,
    });
    house.seed = fnv32a(u);

    houses.push({
      u,
      name: label,
      approved: p.approved ?? false,
      href: `/houses/${u}/`,
      c: cell,
      acreLocation: cell,
      homeLocation: p.homeLocation ?? pin?.p ?? null,
      villageId: p.villageid ?? hamlet.get(u) ?? "",
      court: pin || {},
      d: did,
      z,
      lat: p.lat ?? null,
      lon: p.lon ?? null,
      corners: p.corners ?? null,
      record_kind: p.record_kind ?? "unreviewed",
      added: String(p.added ?? ""),
      house,
    });
  }

  // roads / trails / places / world / languages / resources
  const roads = {};
  const trails = [];
  const places = [];
  const languages = {};
  const resources = {};
  const world = {};

  const sections = ["roads", "trails", "places", "world", "languages", "resources"];
  const docsBySection = {};
  for (const section of sections) {
    const names = await listSection(section);
    docsBySection[section] = await Promise.all(
      names.map((n) => readDocument(path.join(CONTENT, section, n))),
    );
  }

  for (const d of docsBySection.roads) {
    const p = d.data || {};
    const id = String(p.district_id ?? "");
    const base = roads[id] || {};
    const r = deepMerge(base, p.network || {});
    roads[id] = deepMerge(r, {
      paths: [...(base.paths || []), ...(p.paths || [])],
    });
  }
  for (const d of docsBySection.trails) {
    const p = d.data || {};
    trails.push({
      id: p.id ?? path.basename(d.file, ".md"),
      place: p.place ?? null,
      goal: p.goal ?? null,
      type: p.surface ?? "earth",
      w: p.width_m ?? 1.3,
      xy: p.points ?? [],
      owner: p.owner ?? "",
    });
  }
  for (const d of docsBySection.places) {
    const p = d.data || {};
    places.push({
      ...(p.place || {}),
      id: p.place?.id ?? path.basename(d.file, ".md"),
      title: p.title ?? "",
    });
  }
  const { parseYaml } = await import("./yaml.mjs");
  for (const d of docsBySection.world) {
    const p = d.data || {};
    if (!p.key) continue;
    world[p.key] = parseYaml(d.body);
  }
  for (const d of docsBySection.languages) {
    const p = d.data || {};
    if (!p.code) continue;
    try {
      languages[p.code] = JSON.parse(d.body.trim());
    } catch {
      languages[p.code] = null;
    }
  }
  for (const d of docsBySection.resources) {
    const p = d.data || {};
    if (p.resource) resources[p.resource] = p.balance;
  }

  // Village registers feed the road bundles so lanes and squares exist.
  for (const v of villages) {
    const id = String(v.d);
    const bundle = roads[id] || {};
    roads[id] = deepMerge(bundle, {
      paths: [...(bundle.paths || []), ...(v.paths || [])],
      settlements: [
        ...(bundle.settlements || []),
        {
          id: v.id,
          hub: v.hub,
          shade: v.shade,
          count: Object.keys(v.homes || {}).length,
          square: v.square,
          capacity: v.capacity,
        },
      ],
    });
  }

  const homeDoc = await readDocument(path.join(CONTENT, "_index.md"));
  return {
    home: {
      title: homeDoc.data?.title ?? "",
      title_te: homeDoc.data?.title_te ?? "",
      intro: homeDoc.data?.intro ?? "",
      intro_te: homeDoc.data?.intro_te ?? "",
    },
    houses,
    districts: districtParams,
    roads,
    trails,
    places,
    resources,
    world,
    languages,
  };
}

// The district body is a YAML flow sequence, which may wrap across lines.
function parseCandidateAcres(body) {
  const text = body
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join(" ")
    .trim();
  const out = [];
  const re = /\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g;
  let m;
  while ((m = re.exec(text))) out.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  return out;
}

export async function buildCatalogResolved() {
  return buildCatalog();
}
