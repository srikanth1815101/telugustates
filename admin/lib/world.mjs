// The world model.
//
// Everything a person can see in the 3D world traces back to one of a handful
// of content files. This module is the single place that knows that mapping, so
// the editor never has to guess and never writes a key Hugo does not read.
//
//   content/houses/*.md        one resident: house look, walls, roof, props, cell
//   content/world/ecology.md   every tree/plant/crop/animal species and its colour
//   content/world/calendar.md  season, day length, weather window
//   content/trails/*.md        a walking trail: points, width, surface
//   content/places/*.md        a landmark: cell, kind, title
//   content/roads/*.md         funded public works per district (poles, spans)
//   content/districts/*.md     district identity, Telugu name, capacity, acre pool
//   data/settlements.json      village squares, hubs, lanes, per-resident home pins

import { readSection, readDocument, saveDocument, readData, CONTENT } from "./content.mjs";
import { parseYaml } from "./yaml.mjs";
import path from "node:path";

export const HOUSE_LOOK = [
  "archetype",
  "size_m",
  "facing",
  "road_side",
  "wall_color",
  "roof_color",
  "props",
  "sign",
  "building",
];

export const FACINGS = ["north", "south", "east", "west"];

// Props Hugo accepts on a house record. Kept in sync with the built-in
// `props` list read by resident-forms.js.
export const HOUSE_PROPS = [
  "shade-tree",
  "banana-clump",
  "kitchen-garden",
  "cattle-shed",
  "tulsi-pot",
  "water-pot",
  "swing",
  "cart",
  "hay-stack",
  "flower-pots",
  "well",
  "grindstone",
];

// Species groups in ecology.md, with the fields each entry carries.
export const ECO_GROUPS = {
  trees: { label: "Trees", icon: "tree" },
  plants: { label: "Plants", icon: "plant" },
  crops: { label: "Crops", icon: "crop" },
  animals: { label: "Animals", icon: "animal" },
};

export const ECO_FIELDS = {
  trees: ["form", "height", "spread", "colour", "accent", "branches", "fruit"],
  plants: ["form", "height", "spread", "colour", "accent", "branches"],
  crops: ["form", "height", "spread", "colour", "accent"],
  animals: ["size", "colour", "accent"],
};

export async function loadWorld() {
  const [houses, districts, trails, places, roads, ecology, calendar, settlements] =
    await Promise.all([
      readSection("houses"),
      readSection("districts"),
      readSection("trails"),
      readSection("places"),
      readSection("roads"),
      readDocument(path.join(CONTENT, "world", "ecology.md")),
      readDocument(path.join(CONTENT, "world", "calendar.md")),
      readData("settlements.json"),
    ]);

  // Village pins give each resident an exact spot, which is what makes a house
  // addressable on the map rather than merely a cell in a pool.
  const pins = new Map();
  const villages = settlements?.villages || [];
  for (const v of villages)
    for (const [id, pin] of Object.entries(v.homes || {})) pins.set(id, { village: v, pin });

  return {
    houses: houses.map((doc) => {
      const pin = pins.get(doc.data?.username_id || doc.name.replace(/\.md$/, ""));
      return {
        id: doc.name.replace(/\.md$/, ""),
        name: doc.data?.house_name || doc.data?.title || "",
        doc,
        data: doc.data,
        cell: doc.data?.cell || doc.data?.acreLocation || null,
        home: doc.data?.homeLocation || pin?.pin?.p || null,
        village: doc.data?.villageId || pin?.village?.id || null,
        district: doc.data?.district || doc.data?.district_id || null,
        state: doc.data?.state || null,
      };
    }),
    districts: districts.map((doc) => ({
      id: doc.name.replace(/\.md$/, ""),
      doc,
      data: doc.data,
      district: doc.data?.district || {},
    })),
    trails: trails.map((doc) => ({
      id: doc.name.replace(/\.md$/, ""),
      doc,
      data: doc.data,
      points: doc.data?.points || [],
    })),
    places: places.map((doc) => ({
      id: doc.name.replace(/\.md$/, ""),
      doc,
      data: doc.data,
      cell: doc.data?.place?.cell || null,
    })),
    roads: roads.map((doc) => ({
      id: doc.name.replace(/\.md$/, ""),
      doc,
      data: doc.data,
    })),
    ecology: ecology && {
      ...ecology,
      _rawBody: ecology.body,
      body: parseYaml(ecology.body) || {},
    },
    calendar: calendar && {
      ...calendar,
      _rawBody: calendar.body,
      body: parseYaml(calendar.body) || {},
    },
    settlements,
    villages: villages.map((v) => ({
      id: v.id,
      district: v.d,
      capacity: v.capacity,
      square: v.square,
      hub: v.hub,
      homes: Object.keys(v.homes || {}).length,
      paths: (v.paths || []).length,
    })),
  };
}

export async function saveDoc(entry, nextData) {
  return saveDocument(entry.doc, nextData);
}

// A flat "what can I edit" index, so the UI can offer search and navigation.
export function describeWorld(world) {
  const rows = [];
  for (const h of world.houses)
    rows.push({
      kind: "house",
      id: h.id,
      label: h.name || h.id,
      detail: [h.data?.archetype, h.district].filter(Boolean).join(" · "),
      cell: h.cell,
      search: [h.id, h.name, h.district, h.state, h.data?.archetype].filter(Boolean).join(" "),
    });
  for (const [group, meta] of Object.entries(ECO_GROUPS))
    for (const [name, spec] of Object.entries(world.ecology?.body?.[group] || {}))
      rows.push({
        kind: "species",
        group,
        id: name,
        label: name,
        detail: `${meta.label} · ${spec.form || spec.size || ""}`.trim(),
        search: [name, group, meta.label, spec.form].filter(Boolean).join(" "),
      });
  for (const d of world.districts)
    rows.push({
      kind: "district",
      id: d.id,
      label: d.district?.name || d.data?.title || d.id,
      detail: [d.district?.state, d.district?.te].filter(Boolean).join(" · "),
      search: [d.id, d.district?.name, d.data?.title, d.district?.te, d.district?.state]
        .filter(Boolean)
        .join(" "),
    });
  for (const t of world.trails)
    rows.push({
      kind: "trail",
      id: t.id,
      label: t.data?.title || t.id,
      detail: `${t.points.length} points · ${t.data?.surface || "earth"}`,
      search: [t.id, t.data?.title, t.data?.surface, t.data?.goal].filter(Boolean).join(" "),
    });
  for (const p of world.places)
    rows.push({
      kind: "place",
      id: p.id,
      label: p.data?.title || p.id,
      detail: p.data?.place?.kind || "",
      cell: p.cell,
      search: [p.id, p.data?.title, p.data?.place?.kind].filter(Boolean).join(" "),
    });
  for (const r of world.roads)
    rows.push({
      kind: "roads",
      id: r.id,
      label: r.data?.title || r.id,
      detail: `${(r.data?.paths || []).length} paths`,
      search: [r.id, r.data?.title].filter(Boolean).join(" "),
    });
  for (const v of world.villages)
    rows.push({
      kind: "village",
      id: v.id,
      label: v.id,
      detail: `${v.homes}/${v.capacity} homes · ${v.paths} lanes`,
      cell: v.hub ? [Math.floor(v.hub[0]), Math.floor(v.hub[1])] : null,
      search: [v.id, String(v.district)].join(" "),
    });
  rows.push({
    kind: "calendar",
    id: "calendar",
    label: "Calendar & weather",
    detail: "season length, day hours, weather window",
    search: "calendar season weather time year seed",
  });
  return rows;
}
