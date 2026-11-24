// The editor's API surface.
//
// Every write is validated against the set of keys Hugo actually reads, so the
// editor can never introduce a typo'd key that silently does nothing, and can
// never write a shape the engine would choke on. Reads are cheap because the
// content tree is read fresh each request -- no cache to go stale while editing.

import path from "node:path";
import { CONTENT, readDocument, resolveInContent } from "./content.mjs";
import { loadWorld, saveDoc, describeWorld, ECO_GROUPS, HOUSE_PROPS } from "./world.mjs";

const ok = (body) => ({ status: 200, body });

// Only the top-level keys whose value actually changed.
function diffKeys(before, after) {
  const delta = {};
  for (const [k, v] of Object.entries(after)) {
    if (JSON.stringify(before?.[k] ?? null) !== JSON.stringify(v ?? null)) delta[k] = v;
  }
  return delta;
}
const bad = (message) => ({ status: 400, body: { error: message } });

const HEX = /^#[0-9a-fA-F]{6}$/;
const isHex = (v) => typeof v === "string" && HEX.test(v);

const clampNum = (v, lo, hi, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

function requireHex(value, field, errors) {
  if (value === undefined || value === null || value === "") return undefined;
  if (!isHex(value)) {
    errors.push(`${field} must be a #rrggbb colour`);
    return undefined;
  }
  return value.toLowerCase();
}

const STRING_LIMIT = 120;
function cleanString(value, field, errors, { limit = STRING_LIMIT } = {}) {
  if (value === undefined) return undefined;
  const s = String(value).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (s.length > limit) {
    errors.push(`${field} is longer than ${limit} characters`);
    return s.slice(0, limit);
  }
  return s;
}

// Find any addressable record, so the UI can go straight to it by id.
async function find(kind, id) {
  const world = await loadWorld();
  if (kind === "house") return world.houses.find((h) => h.id === id);
  if (kind === "trail") return world.trails.find((t) => t.id === id);
  if (kind === "place") return world.places.find((p) => p.id === id);
  if (kind === "district") return world.districts.find((d) => d.id === id);
  if (kind === "roads") return world.roads.find((r) => r.id === id);
  return null;
}

// ---- validators -------------------------------------------------------------

function validateHouse(input, current) {
  const errors = [];
  const p = current.data || {};
  const out = { ...p };

  if (input.house_name !== undefined) {
    out.house_name = cleanString(input.house_name, "house_name", errors);
    out.title = out.house_name;
    out.sign = { ...(p.sign || {}), label: out.house_name };
  }
  if (input.archetype !== undefined) out.archetype = cleanString(input.archetype, "archetype", errors);
  if (input.facing !== undefined) {
    const f = String(input.facing);
    if (!["north", "south", "east", "west"].includes(f)) errors.push("facing must be north/south/east/west");
    else out.facing = f;
  }
  if (input.wall_color !== undefined) {
    const c = requireHex(input.wall_color, "wall_color", errors);
    if (c) out.wall_color = c;
  }
  if (input.roof_color !== undefined) {
    const c = requireHex(input.roof_color, "roof_color", errors);
    if (c) out.roof_color = c;
  }
  if (input.wood_color !== undefined) {
    const c = requireHex(input.wood_color, "sign.wood", errors);
    if (c) out.sign = { ...(out.sign || {}), wood: c };
  }
  if (input.trim_color !== undefined) {
    const c = requireHex(input.trim_color, "sign.trim", errors);
    if (c) out.sign = { ...(out.sign || {}), trim: c };
  }
  if (input.size_m !== undefined) {
    if (!Array.isArray(input.size_m) || input.size_m.length !== 3)
      errors.push("size_m must be [width, depth, height]");
    else out.size_m = input.size_m.map((v) => clampNum(v, 2, 40, 8));
  }
  if (input.props !== undefined) {
    if (!Array.isArray(input.props)) errors.push("props must be a list");
    else {
      const allowed = new Set(HOUSE_PROPS);
      const unknown = input.props.filter((x) => !allowed.has(x));
      if (unknown.length) errors.push(`unknown props: ${unknown.join(", ")}`);
      out.props = input.props.filter((x) => allowed.has(x)).slice(0, 12);
    }
  }
  if (input.weathering !== undefined) {
    out.building = { ...(p.building || {}), weathering: clampNum(input.weathering, 0, 1, 0.35) };
  }
  if (input.path_width_m !== undefined)
    out.building = { ...(out.building || p.building || {}), path_width_m: clampNum(input.path_width_m, 0.6, 4, 1.3) };

  return { out, errors };
}

function validateSpecies(input) {
  const errors = [];
  const out = {};
  if (input.form !== undefined) out.form = cleanString(input.form, "form", errors, { limit: 24 });
  if (input.height !== undefined) out.height = clampNum(input.height, 0.2, 60, 6);
  if (input.spread !== undefined) out.spread = clampNum(input.spread, 0.1, 4, 1);
  if (input.branches !== undefined) out.branches = Math.round(clampNum(input.branches, 0, 40, 6));
  for (const key of ["colour", "accent"]) {
    if (input[key] !== undefined) {
      const c = requireHex(input[key], key, errors);
      if (c) out[key] = c;
    }
  }
  if (input.fruit !== undefined) out.fruit = !!input.fruit;
  if (input.size !== undefined) out.size = clampNum(input.size, 0.1, 8, 1);
  return { out, errors };
}

function validateTrail(input, current) {
  const errors = [];
  const p = current.data || {};
  const out = { ...p };
  if (input.title !== undefined) out.title = cleanString(input.title, "title", errors);
  if (input.surface !== undefined) out.surface = cleanString(input.surface, "surface", errors, { limit: 20 });
  if (input.width_m !== undefined) out.width_m = clampNum(input.width_m, 0.4, 8, 1.3);
  if (input.goal !== undefined) out.goal = cleanString(input.goal, "goal", errors, { limit: 40 });
  if (input.points !== undefined) {
    if (!Array.isArray(input.points) || input.points.length < 2)
      errors.push("a trail needs at least two points");
    else {
      const pts = input.points
        .filter((pt) => Array.isArray(pt) && pt.length === 2)
        .map((pt) => [Number(pt[0].toFixed(6)), Number(pt[1].toFixed(6))])
        .filter((pt) => Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
      if (pts.length < 2) errors.push("trail points must be [x, y] pairs");
      else out.points = pts;
    }
  }
  return { out, errors };
}

function validatePlace(input, current) {
  const errors = [];
  const p = current.data || {};
  const out = { ...p };
  const place = { ...(p.place || {}) };
  if (input.title !== undefined) out.title = cleanString(input.title, "title", errors);
  if (input.kind !== undefined) place.kind = cleanString(input.kind, "kind", errors, { limit: 30 });
  if (input.cell !== undefined) {
    if (!Array.isArray(input.cell) || input.cell.length !== 2) errors.push("cell must be [x, y]");
    else place.cell = input.cell.map((v) => Math.round(clampNum(v, -1e6, 1e6, 0)));
  }
  if (input.note !== undefined) place.note = cleanString(input.note, "note", errors, { limit: 400 });
  out.place = place;
  return { out, errors };
}

function validateDistrict(input, current) {
  const errors = [];
  const p = current.data || {};
  const out = { ...p };
  const d = { ...(p.district || {}) };
  if (input.title !== undefined) out.title = cleanString(input.title, "title", errors);
  if (input.name !== undefined) d.name = cleanString(input.name, "name", errors);
  if (input.te !== undefined) d.te = cleanString(input.te, "te", errors);
  if (input.capacity !== undefined) d.capacity = Math.round(clampNum(input.capacity, 0, 500, 6));
  if (input.state !== undefined) {
    const s = cleanString(input.state, "state", errors);
    if (!["Telangana", "Andhra Pradesh"].includes(s)) errors.push("state must be Telangana or Andhra Pradesh");
    else d.state = s;
  }
  out.district = d;
  return { out, errors };
}

// ---- routes -----------------------------------------------------------------

export async function api(method, route, query, body) {
  if (method === "GET" && route === "world") {
    const world = await loadWorld();
    return ok({
      counts: {
        houses: world.houses.length,
        districts: world.districts.length,
        trails: world.trails.length,
        places: world.places.length,
        roads: world.roads.length,
        villages: world.villages.length,
        species: Object.values(world.ecology?.body || {}).reduce(
          (n, group) => (group && typeof group === "object" ? n + Object.keys(group).length : n),
          0,
        ),
      },
      villages: world.villages,
      ecologyGroups: Object.fromEntries(
        Object.entries(ECO_GROUPS).map(([k, v]) => [
          k,
          v,
          // eslint-disable-next-line no-undef
        ]),
      ),
    });
  }

  if (method === "GET" && route === "index") {
    const world = await loadWorld();
    return ok({ rows: describeWorld(world) });
  }

  if (method === "GET" && route === "world.json") {
    const world = await loadWorld();
    return ok({
      houses: world.houses.map(({ doc, ...h }) => h),
      districts: world.districts.map(({ doc, ...d }) => d),
      trails: world.trails.map(({ doc, ...t }) => t),
      places: world.places.map(({ doc, ...p }) => ({ ...p, data: p.data })),
      roads: world.roads.map(({ doc, ...r }) => r),
      ecology: world.ecology?.body || {},
      calendar: world.calendar?.data || {},
      villages: world.villages,
    });
  }

  const getMatch = route.match(/^record\/([a-z]+)\/(.+)$/);
  if (method === "GET" && getMatch) {
    const [, kind, id] = getMatch;
    const entry = await find(kind, id);
    if (!entry) return { status: 404, body: { error: "not found" } };
    if (kind === "species") return ok(entry);
    return ok({
      kind,
      id: entry.id || id,
      data: entry.data,
      cell: entry.cell || null,
      file: path.relative(CONTENT, entry.doc.file),
      body: entry.doc.body,
    });
  }

  if (method === "POST" && route.startsWith("house/")) {
    const id = route.slice("house/".length);
    if (!/^h[0-9a-f]{24}$/.test(id)) return bad("invalid house id");
    const entry = await find("house", id);
    if (!entry) return { status: 404, body: { error: "house not found" } };
    const { out, errors } = validateHouse(body || {}, entry);
    if (errors.length) return bad(errors.join("; "));
    const delta = diffKeys(entry.data, out);
    if (!Object.keys(delta).length) return ok({ saved: false, changed: [], data: out });
    const res = await patchFrontMatter(entry, delta);
    if (res.error) return bad(res.error);
    return ok({ saved: res.written, changed: res.changed, data: out });
  }

  if (method === "POST" && route === "species") {
    const { group, name } = body || {};
    if (!ECO_GROUPS[group]) return bad("unknown species group");
    const world = await loadWorld();
    const eco = world.ecology;
    if (!eco) return { status: 404, body: { error: "ecology.md not found" } };
    const existing = (eco.body?.[group] || {})[name];
    if (!existing) return { status: 404, body: { error: "species not found" } };
    const { out: patch, errors } = validateSpecies(body || {});
    if (errors.length) return bad(errors.join("; "));
    if (!Object.keys(patch).length) return ok({ saved: false, changed: [], species: existing });

    const result = patchNestedDoc(eco, [group, name], patch);
    if (result.missing.length) return bad(`could not locate ${result.missing.join(", ")}`);
    if (!result.changed.length) return ok({ saved: false, changed: [], species: existing });
    await writeText(eco.file, keepDoc(eco, result.text));
    return ok({
      saved: true,
      changed: result.changed,
      species: { ...existing, ...patch },
    });
  }

  if (method === "POST" && route.startsWith("trail/")) {
    const id = route.slice("trail/".length);
    const entry = await find("trail", id);
    if (!entry) return { status: 404, body: { error: "trail not found" } };
    const { out, errors } = validateTrail(body || {}, entry);
    if (errors.length) return bad(errors.join("; "));
    const delta = diffKeys(entry.data, out);
    if (!Object.keys(delta).length) return ok({ saved: false, changed: [], data: out });
    const res = await patchFrontMatter(entry, delta);
    if (res.error) return bad(res.error);
    return ok({ saved: res.written, changed: res.changed, data: out });
  }

  if (method === "POST" && route.startsWith("place/")) {
    const id = route.slice("place/".length);
    const entry = await find("place", id);
    if (!entry) return { status: 404, body: { error: "place not found" } };
    const { out, errors } = validatePlace(body || {}, entry);
    if (errors.length) return bad(errors.join("; "));
    const delta = diffKeys(entry.data, out);
    if (!Object.keys(delta).length) return ok({ saved: false, changed: [], data: out });
    const res = await patchFrontMatter(entry, delta);
    if (res.error) return bad(res.error);
    return ok({ saved: res.written, changed: res.changed, data: out });
  }

  if (method === "POST" && route.startsWith("district/")) {
    const id = route.slice("district/".length);
    const entry = await find("district", id);
    if (!entry) return { status: 404, body: { error: "district not found" } };
    const { out, errors } = validateDistrict(body || {}, entry);
    if (errors.length) return bad(errors.join("; "));
    const delta = diffKeys(entry.data, out);
    if (!Object.keys(delta).length) return ok({ saved: false, changed: [], data: out });
    const res = await patchFrontMatter(entry, delta);
    if (res.error) return bad(res.error);
    return ok({ saved: res.written, changed: res.changed, data: out });
  }

  if (method === "POST" && route === "calendar") {
    const world = await loadWorld();
    const cal = world.calendar;
    if (!cal) return { status: 404, body: { error: "calendar.md not found" } };
    const allowed = ["defaultDayHours", "yearRealDays", "weatherWindowSeconds", "seed"];
    const patch = {};
    for (const k of allowed) {
      if (body?.[k] === undefined) continue;
      patch[k] = k === "seed" ? Math.round(clampNum(body[k], 0, 1e9, 17061)) : clampNum(body[k], 1, 100000, 4);
    }
    const result = patchDocText(cal, patch);
    if (result.missing.length) return bad(`could not locate ${result.missing.join(", ")}`);
    if (!result.changed.length) return ok({ saved: false, changed: [], data: cal.body });
    await writeText(cal.file, keepDoc(cal, result.text));
    return ok({ saved: true, changed: result.changed, data: { ...cal.body, ...patch } });
  }

  return { status: 404, body: { error: `no route for ${method} ${route}` } };
}

// ---- body rewriting ---------------------------------------------------------

import fs from "node:fs/promises";
import { patchNested, patchDoc, keepDoc } from "./patch.mjs";

async function writeText(file, text) {
  await fs.writeFile(file, text, "utf8");
}

// Write a front-matter patch surgically: only the changed keys' lines move.
async function patchFrontMatter(entry, patch) {
  const result = patchDoc(entry.doc.frontMatter, patch);
  if (result.missing.length) return { error: `could not locate ${result.missing.join(", ")}` };
  if (!result.changed.length) return { changed: [], written: false };

  // Keys the validator introduced that were absent from the file need appending.
  let text = result.text;
  const absent = Object.keys(patch).filter(
    (k) => patch[k] !== undefined && !new RegExp(`^${k}:`, "m").test(entry.doc.frontMatter),
  );
  if (absent.length) {
    const extra = absent.map((k) => `${k}: ${renderTop(k, patch[k])}`).join("\n");
    text = text + "\n" + extra;
  }
  const eol = entry.doc.eol || "\n";
  const full = `---${eol}${text.split("\n").join(eol)}${eol}---${eol}${entry.doc.body}`;
  await fs.writeFile(entry.doc.file, full, "utf8");
  entry.doc.frontMatter = text;
  entry.doc.raw = full;
  entry.doc.data = { ...entry.doc.data, ...patch };
  return { changed: [...result.changed, ...absent], written: true };
}

function renderTop(key, value) {
  const { keepDoc } = {};
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return "[" + value.map((v) => JSON.stringify(v)).join(", ") + "]";
  if (typeof value === "object") return JSON.stringify(value);
  const s = String(value);
  return /^[A-Za-z0-9._#-]+$/.test(s) ? s : JSON.stringify(s);
}

// doc.body is the parsed YAML; doc._rawBody is the original text.
function patchNestedDoc(doc, pathKeys, patch) {
  return patchNested(doc._rawBody, pathKeys, patch);
}

function patchDocText(doc, patch) {
  return patchDoc(doc._rawBody, patch);
}
