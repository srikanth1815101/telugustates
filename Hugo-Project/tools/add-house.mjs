#!/usr/bin/env node
// Node 20+, no dependencies. Create or update a privacy-preserving house record
// from (username, district, nickname/house_name). The real username is hashed
// one-way in memory via residentId() and is NEVER written to disk.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  cleanHouseName,
  normalizeUsername,
  residentId,
  sha256Bytes,
} from "../static/js/resident-id.js";
import { models } from "../static/js/resident-design.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const WALL_PALETTE = [
  "#dec99e",
  "#d8c3a5",
  "#c9b99b",
  "#e2d4b7",
  "#cdbba0",
  "#b5ab95",
  "#d9c7ab",
  "#e4d5be",
];
const ROOF_PALETTE = [
  "#a45e42",
  "#ad664e",
  "#96533c",
  "#8c5843",
  "#b06b49",
  "#7d5a44",
];
const WOOD_PALETTE = ["#523424", "#5c3d28", "#65513d", "#4b3122", "#61422d"];
const TRIM_PALETTE = ["#d3ba7e", "#c5a477", "#dfc792", "#cbb07c", "#e2cca0"];
const PROPS_POOL = [
  "kitchen-garden",
  "flower-bed",
  "banana-clump",
  "shade-tree",
];
const FACINGS = ["south", "east", "north", "west"];

function usage() {
  console.error(
    [
      "Usage:",
      '  node tools/add-house.mjs --username "<handle>" --district "<district>" --name "<house or nickname>" [--kind community|demo] [--date YYYY-MM-DD] [--update-name] [--settle]',
      '  node tools/add-house.mjs "<handle>" "<district>" "<house or nickname>" [--settle]',
    ].join("\n"),
  );
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    username: "",
    district: "",
    name: "",
    kind: "community",
    date: new Date().toISOString().slice(0, 10),
    updateName: false,
    settle: false,
  };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage();
    else if (a === "--settle") opts.settle = true;
    else if (a === "--update-name") opts.updateName = true;
    else if (a === "--username" || a === "--user" || a === "-u")
      opts.username = argv[++i] || "";
    else if (a === "--district" || a === "-d") opts.district = argv[++i] || "";
    else if (
      a === "--name" ||
      a === "--nickname" ||
      a === "--house" ||
      a === "-n"
    )
      opts.name = argv[++i] || "";
    else if (a === "--kind") opts.kind = argv[++i] || "community";
    else if (a === "--date") opts.date = argv[++i] || opts.date;
    else if (!a.startsWith("-")) pos.push(a);
    else throw Error("Unknown option: " + a);
  }
  if (!opts.username && pos[0]) opts.username = pos[0];
  if (!opts.district && pos[1]) opts.district = pos[1];
  if (!opts.name && pos[2]) opts.name = pos[2];
  return opts;
}

async function loadDistricts() {
  const dir = path.join(root, "content/districts"),
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md")).sort(),
    list = [];
  for (const f of files) {
    const text = await fs.readFile(path.join(dir, f), "utf8"),
      id = Number(/^\s*id:\s*(\d+)/m.exec(text)?.[1]),
      name = /^\s*name:\s*(.+)$/m.exec(text)?.[1]?.trim().replace(/^['"]|['"]$/g, ""),
      state = /^\s*state:\s*(.+)$/m.exec(text)?.[1]?.trim().replace(/^['"]|['"]$/g, ""),
      te = /^\s*te:\s*(.+)$/m.exec(text)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
    if (id && name && state) list.push({ id, name, state, te: te || "" });
  }
  return list;
}

function normKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0c00-\u0c7f]+/g, "");
}

function resolveDistrict(districts, query) {
  const q = String(query || "").trim();
  if (!q) return null;
  if (/^\d+$/.test(q)) {
    const num = Number(q);
    return districts.find((d) => d.id === num) || null;
  }
  const nk = normKey(q);
  return (
    districts.find(
      (d) =>
        normKey(d.name) === nk ||
        normKey(d.te) === nk ||
        normKey(d.name + "district") === nk,
    ) || null
  );
}

function seededSpec(id, houseName) {
  const b = sha256Bytes(new TextEncoder().encode("spec:" + id)),
    u16 = (i) => (b[i] << 8) | b[i + 1],
    archetype = models[b[0] % models.length],
    w = +(8.8 + (u16(2) / 65535) * 3.1).toFixed(2),
    d = +(8.8 + (u16(4) / 65535) * 2.8).toFixed(2),
    h =
      archetype === "balcony-stair"
        ? +(5.45 + (b[6] / 255) * 0.9).toFixed(2)
        : +(3.85 + (b[6] / 255) * 0.95).toFixed(2),
    facing = FACINGS[b[7] % 4],
    wall_color = WALL_PALETTE[b[8] % WALL_PALETTE.length],
    roof_color = ROOF_PALETTE[b[9] % ROOF_PALETTE.length],
    wood = WOOD_PALETTE[b[10] % WOOD_PALETTE.length],
    trim = TRIM_PALETTE[b[11] % TRIM_PALETTE.length],
    weathering = +(0.22 + (b[12] / 255) * 0.48).toFixed(3),
    path_width_m = +(1.05 + (b[13] / 255) * 0.35).toFixed(2),
    propCount = 2 + (b[14] % 2),
    props = [];
  for (let i = 0; props.length < propCount && i < 8; i++) {
    const p = PROPS_POOL[(b[15 + i] || i) % PROPS_POOL.length];
    if (!props.includes(p)) props.push(p);
  }
  return {
    archetype,
    size_m: [w, d, h],
    facing,
    wall_color,
    roof_color,
    props,
    sign: { label: houseName, wood, trim },
    building: { weathering, path_width_m },
  };
}

export async function createOrUpdateHouse(opts) {
  const cleanUser = normalizeUsername(opts.username);
  if (!cleanUser)
    throw Error(
      "Invalid Instagram username. Provide 1–30 characters (letters, digits, '.', '_') or a valid profile URL.",
    );
  const id = residentId(cleanUser);
  if (!id) throw Error("Could not compute one-way resident ID.");

  const districts = await loadDistricts(),
    district = resolveDistrict(districts, opts.district);
  if (!district)
    throw Error(
      `Unrecognized district "${opts.district}". Supply a valid Telangana or Andhra Pradesh district name or id (1–61).`,
    );

  const houseName = cleanHouseName(opts.name, "");
  if (!houseName)
    throw Error(
      "Missing nickname or house name (--name). Provide the display name for the house board.",
    );

  const outPath = path.join(root, "content/houses", `${id}.md`);
  let exists = false;
  try {
    await fs.access(outPath);
    exists = true;
  } catch {}

  if (exists) {
    if (!opts.updateName) {
      return {
        id,
        file: path.relative(root, outPath),
        district: district.name,
        district_id: district.id,
        state: district.state,
        name: houseName,
        created: false,
        updated: false,
      };
    }
    let text = await fs.readFile(outPath, "utf8");
    const qName = JSON.stringify(houseName);
    text = text
      .replace(/^title:.*$/m, `title: ${qName}`)
      .replace(/^house_name:.*$/m, `house_name: ${qName}`)
      .replace(/^(\s*label:).*$/m, `$1 ${qName}`);
    if (!/^house_name:/m.test(text))
      text = text.replace(/^title:.*$/m, (m) => `${m}\nhouse_name: ${qName}`);
    await fs.writeFile(outPath, text);
    return {
      id,
      file: path.relative(root, outPath),
      district: district.name,
      district_id: district.id,
      state: district.state,
      name: houseName,
      created: false,
      updated: true,
    };
  }

  const spec = seededSpec(id, houseName),
    qName = JSON.stringify(houseName),
    approved = opts.kind !== "demo",
    md = [
      "---",
      `title: ${qName}`,
      `house_name: ${qName}`,
      "type: house",
      `state: ${district.state}`,
      `district: ${district.name}`,
      `district_id: ${district.id}`,
      `record_kind: ${opts.kind}`,
      `approved: ${approved}`,
      "area_acres: 1",
      `added: '${opts.date}'`,
      `archetype: ${spec.archetype}`,
      "size_m:",
      ...spec.size_m.map((n) => `- ${n}`),
      `facing: ${spec.facing}`,
      `wall_color: '${spec.wall_color}'`,
      `roof_color: '${spec.roof_color}'`,
      "props:",
      ...spec.props.map((p) => `- ${p}`),
      "sign:",
      `  label: ${qName}`,
      `  wood: '${spec.sign.wood}'`,
      `  trim: '${spec.sign.trim}'`,
      "building:",
      `  weathering: ${spec.building.weathering}`,
      `  path_width_m: ${spec.building.path_width_m}`,
      "---",
      "Virtual village house and one-acre field. This record stores no real username and confers no land title.",
      "",
    ].join("\n");

  await fs.writeFile(outPath, md, { flag: "wx" });
  if (opts.settle) {
    execFileSync(process.execPath, [path.join(root, "tools/settle.mjs")], {
      cwd: root,
      stdio: "inherit",
    });
  }
  return {
    id,
    file: path.relative(root, outPath),
    district: district.name,
    district_id: district.id,
    state: district.state,
    name: houseName,
    created: true,
    settled: !!opts.settle,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.username || !opts.district || !opts.name) usage();
  const res = await createOrUpdateHouse(opts);
  console.log(JSON.stringify(res));
}
