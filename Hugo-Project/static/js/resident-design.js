// The only model catalogue. Content names a model, not a second numeric selector or cached mesh.
import { ACRE, SIDE, localPoint } from "./metres.js";
// Vernacular-only catalogue. Storeys, RCC flats and roof water tanks were
// removed by owner decision: every home is a small village house in the two States.
export const models = [
  "mud-veranda",
  "pillared-tile",
  "thatch-longhouse",
  "round-thatch",
  "lime-terrace",
  "hipped-tile",
  "l-court",
  "sheet-lean-to",
  "cattle-compound",
  "stone-gable",
  "veranda-front",
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
    [0, -0.09, 1, 0.79, "body"],
    [0, 0.395, 1, 0.21, "veranda"],
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
const R = (a, d) => +a.toFixed(d);
export function residentDesign(row) {
  const h = row.house,
    i = models.indexOf(h.archetype),
    [fx, fy] = SIDE[h.facing],
    w = h.size_m[0],
    d = h.size_m[1],
    z = ACRE / 2 - h.setback_m - d / 2;
  if (i < 0) throw Error("Unknown house model: " + h.archetype);
  row.s = h.style = i;
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
      row.c[0] + 0.5 + (fx * z - fy * h.lateral_m) / ACRE,
      row.c[1] + 0.5 + (fy * z + fx * h.lateral_m) / ACRE,
    ].map((a) => R(a, 7));
  h.parts = (footprints[i] || [[0, 0, 1, 1, "body"]]).map(([a, b, c, e, k]) => [
    R(a * w, 3),
    R(b * d, 3),
    R(c * w, 3),
    R(e * d, 3),
    k,
  ]);
  const m = h.parts[0];
  h.door_x = R(m[0] + (i === 6 ? 0.18 * w : 0), 3);
  const pt = (z) => localPoint(h, h.door_x, z).map((a) => R(a, 7));
  h.door = pt(m[1] + m[3] / 2);
  h.gate = lot ? lot.gate : pt(d / 2 + h.setback_m);
  h.entry = pt(d / 2 + h.setback_m - 1.4);
  h.footprint_m2 = R(
    h.parts.reduce(
      (n, [, , w, d, k]) => n + w * d * (k === "round" ? Math.PI / 4 : 1),
      0,
    ),
    2,
  );
  h.frontage = lot ? lot.porch : [row.c[0] + fx, row.c[1] + fy];
  return row;
}
