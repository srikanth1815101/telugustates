// The only model catalogue. Content names a model, not a second numeric selector or cached mesh.
import { ACRE, SIDE, localPoint } from "./metres.js";
export const models = [
  "mud-veranda",
  "pillared-tile",
  "thatch-longhouse",
  "round-thatch",
  "rcc-tank",
  "balcony-stair",
  "l-court",
  "sheet-lean-to",
  "cattle-compound",
  "stone-gable",
  "street-shop",
  "courtyard-house",
];
const footprints = {
  0: [
    [0, -0.105, 1, 0.79, "body"],
    [0, 0.395, 1, 0.21, "veranda"],
  ],
  1: [
    [0, -0.15, 1, 0.7, "body"],
    [0, 0.35, 1, 0.3, "veranda"],
  ],
  3: [[0, 0, 1, 1, "round"]],
  5: [
    [-0.07, 0, 0.86, 1, "body"],
    [0.43, 0, 0.14, 1, "stairs"],
  ],
  6: [
    [0, -0.2, 1, 0.6, "body"],
    [-0.305, 0.3, 0.39, 0.4, "wing"],
  ],
  8: [
    [-0.2, 0, 0.6, 1, "body"],
    [0.34, -0.14, 0.32, 0.72, "shed"],
  ],
  10: [
    [0, -0.09, 1, 0.82, "body"],
    [0, 0.41, 1, 0.18, "awning"],
  ],
  11: [
    [0, -0.32, 1, 0.36, "body"],
    [-0.34, 0.18, 0.32, 0.64, "wing"],
    [0.34, 0.18, 0.32, 0.64, "wing"],
  ],
};
// Catalog values arrive through Hugo's JSON, where a quoted or oddly-scalarised
// front-matter value stays a string. Designing a house only needs a number, so
// coerce here rather than dying inside toFixed with a stack that names nothing.
const num = (a, what, row) => {
  const n = typeof a === "number" ? a : a == null ? NaN : +a;
  if (!Number.isFinite(n))
    throw Error(
      `House ${row?.u ?? "?"} has a non-numeric ${what}: ${JSON.stringify(a)}` +
        // The row itself, so a value that only exists in a build we cannot run
        // locally can still be identified from a CI annotation.
        ` [row=${JSON.stringify({
          u: row?.u,
          d: row?.d,
          c: row?.c,
          villageId: row?.villageId,
          homeLocation: row?.homeLocation,
          court: row?.court ? Object.keys(row.court) : row?.court ?? null,
          archetype: row?.house?.archetype,
          size_m: row?.house?.size_m,
          facing: row?.house?.facing,
          setback_m: row?.house?.setback_m,
          lateral_m: row?.house?.lateral_m,
          building: row?.house?.building ?? null,
          houseKeys: row?.house ? Object.keys(row.house) : null,
        })}]`,
    );
  return n;
};
const R = (a, d, what, row) => +num(a, what, row).toFixed(d);
export function residentDesign(row) {
  const h = row.house,
    i = models.indexOf(h.archetype),
    [fx, fy] = SIDE[h.facing] ?? [0, -1],
    x0 = Number.isFinite(fx) ? fx : 0,
    y0 = Number.isFinite(fy) ? fy : 0,
    w = num(h.size_m?.[0], "size_m width", row),
    d = num(h.size_m?.[1], "size_m depth", row),
    z = ACRE / 2 - num(h.setback_m, "setback_m", row) - d / 2;
  if (i < 0) throw Error("Unknown house model: " + h.archetype);
  row.s = h.style = i;
  if (i === 5) h.size_m[2] = Math.max(5.37, h.size_m[2]);
  const lot = row.court?.p && row.court;
  if (lot) {
    h.centre = row.homeLocation;
    h.yard = lot;
    h.villageId = row.villageId;
    h.facing = ["south", "east", "north", "west"][
      (Math.round(lot.a / (Math.PI / 2)) + 4) % 4
    ];
    h.road_side = h.facing;
    h.setback_m = lot.front;
    h.timberOnly = true;
  } else
    h.centre = [
      num(row.c?.[0], "cell coordinate", row) +
        0.5 +
        (x0 * z - y0 * num(h.lateral_m, "lateral_m", row)) / ACRE,
      num(row.c?.[1], "cell coordinate", row) +
        0.5 +
        (y0 * z + x0 * num(h.lateral_m, "lateral_m", row)) / ACRE,
    ].map((a) => R(a, 7, "cell coordinate", row));
  h.parts = (footprints[i] || [[0, 0, 1, 1, "body"]]).map(([a, b, c, e, k]) => [
    R(a * w, 3, "footprint width", row),
    R(b * d, 3, "footprint depth", row),
    R(c * w, 3, "footprint width", row),
    R(e * d, 3, "footprint depth", row),
    k,
  ]);
  const m = h.parts[0];
  h.door_x = R(m[0] + (i === 6 ? 0.18 * w : 0), 3, "door offset", row);
  const pt = (z) => localPoint(h, h.door_x, z).map((a) => R(a, 7, "door point", row));
  h.door = pt(m[1] + m[3] / 2);
  h.gate = lot ? lot.gate : pt(d / 2 + h.setback_m);
  h.entry = pt(d / 2 + h.setback_m - 1.4);
  h.footprint_m2 = R(
    h.parts.reduce(
      (n, [, , w, d, k]) => n + w * d * (k === "round" ? Math.PI / 4 : 1),
      0,
    ),
    2,
    "footprint area",
    row,
  );
  h.frontage = lot ? lot.porch : [row.c[0] + fx, row.c[1] + fy];
  return row;
}
