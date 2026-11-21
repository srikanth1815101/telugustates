// Furnish a room in metres. Authors keep the original acreage, door and envelope. A visit never rolls the dice again.
const schemes = [
  // accent, second dye, wood, floor, inner limewash, ceiling
  ["#346b72", "#cb9462", "#704733", "#ae9685", "#e9d9b9", "#d5c9ad"],
  ["#924a44", "#e3b65f", "#664635", "#bd8c70", "#e2c8ab", "#ddd1b9"],
  ["#46634d", "#cf9d55", "#72503c", "#b3a18a", "#dbe2ca", "#c9c8a6"],
  ["#385471", "#b48256", "#574136", "#928d88", "#d8d8cc", "#c6b59c"],
  ["#975d38", "#778e72", "#77533e", "#bd9c83", "#efe0bd", "#c9b39b"],
  ["#715168", "#d2a66d", "#624943", "#a38f82", "#e3d4cc", "#d9c5b8"],
  ["#3a7563", "#b96443", "#705542", "#b29975", "#e2dbba", "#c2ba9a"],
  ["#826137", "#62949b", "#684737", "#a49683", "#e2d4b5", "#d5c9ba"],
];
const layouts = {
  sleeping: ["charpoy", "chest", "jarstand"],
  kitchen: ["hearth", "spices", "stool"],
  reading: ["bookcase", "desk", "bench"],
  weaving: ["loom", "yarns", "chest"],
  pottery: ["potrack", "wheel", "jarstand"],
  music: ["instrument", "bench", "drums"],
  gathering: ["settee", "lowtable", "stool"],
  garden: ["plants", "workbench", "plantpot"],
  "spice-shop": ["spices", "counter", "jarstand"],
  "cloth-shop": ["yarns", "clothcounter", "chest"],
  "book-shop": ["bookcase", "counter", "stool"],
};
const dims = {
  charpoy: [2.21, 1.12],
  chest: [1.1, 0.66],
  jarstand: [1.03, 0.59],
  hearth: [1.78, 0.9],
  spices: [1.39, 0.57],
  stool: [0.56, 0.56],
  bookcase: [1.76, 0.54],
  desk: [1.52, 0.91],
  bench: [1.49, 0.69],
  loom: [1.77, 1.05],
  yarns: [1.47, 0.58],
  potrack: [1.68, 0.64],
  wheel: [1, 1],
  instrument: [1.48, 0.78],
  drums: [0.98, 0.7],
  settee: [1.94, 0.9],
  lowtable: [1.3, 0.79],
  plants: [1.59, 0.77],
  workbench: [1.62, 0.84],
  plantpot: [0.59, 0.59],
  counter: [1.73, 0.76],
  clothcounter: [1.65, 0.87],
};
function generator(n) {
  let s = n >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function furnish(h, p) {
  const rand = generator(h.seed),
    int = (n) => Math.floor(rand() * n),
    pick = (a) => a[int(a.length)],
    style = pick(
      Object.keys(layouts).slice(...(h.style === 10 ? [8] : [0, 8])),
    ),
    palette = pick(schemes),
    mirror = rand() < 0.5 ? 1 : -1,
    objects = [],
    { cx, cz, w, d, a, b, door, front, round } = p;
  const shell = (x, z) =>
    round
      ? ((x - cx) / (a - 0.23)) ** 2 + ((z - cz) / (b - 0.23)) ** 2 < 0.96
      : Math.abs(x - cx) < a - 0.22 && Math.abs(z - cz) < b - 0.22;
  function fits(x, z, W, D) {
    const A = W / 2,
      B = D / 2;
    for (const s of [-1, 1])
      for (const t of [-1, 1]) if (!shell(x + s * A, z + t * B)) return false;
    // A boot-width aisle from the hinge to the middle; also keep a turning circle at the centre and the saved arrival point empty.
    const l = Math.min(door, cx) - 0.71,
      r = Math.max(door, cx) + 0.71;
    if (x + A > l && x - A < r && z + B > Math.min(cz - 0.55, front - 1.85))
      return false;
    return objects.every(
      (o) =>
        Math.abs(o.x - x) >= (o.w + W) / 2 + 0.45 ||
        Math.abs(o.z - z) >= (o.d + D) / 2 + 0.45,
    );
  }
  const composition = int(5),
    j = () => rand() * 0.16 - 0.08;
  const desired = [
    [
      [j(), -0.79],
      [mirror * 0.71, 0.3 + j()],
      [-mirror * 0.7, -0.16 + j()],
    ],
    [
      [mirror * 0.49, -0.78],
      [-mirror * 0.72, -0.33 + j()],
      [mirror * 0.69, 0.44 + j()],
    ],
    [
      [mirror * 0.76, -0.23 + j()],
      [-mirror * 0.29 + j(), -0.78],
      [-mirror * 0.7, 0.41 + j()],
    ],
    [
      [mirror * 0.67, -0.54 + j()],
      [-mirror * 0.69, 0.19 + j()],
      [j(), -0.78],
    ],
    [
      [-mirror * 0.31, -0.76],
      [mirror * 0.73, -0.31 + j()],
      [-mirror * 0.73, 0.36 + j()],
    ],
  ][composition];
  // Some residents keep their tools together; others split work and seating between opposite walls.
  // Put at least two silhouettes in the arrival sightline on the workroom plans, not three isolated objects in distant corners.
  if (
    ["weaving", "reading", "kitchen", "pottery", "music", "garden"].includes(
      style,
    ) &&
    composition !== 2
  ) {
    const [x, z] = desired[0],
      side = x < 0 ? 1 : -1;
    desired[1] = [
      Math.max(-0.71, Math.min(0.71, x + (side * (2.0 + 0.3 * rand())) / a)),
      Math.max(-0.76, z - 0.04 + rand() * 0.12),
    ];
  }
  for (const [n, kind] of layouts[style].entries()) {
    const [W, D] = dims[kind],
      sz = 0.88 + rand() * 0.2,
      seed = int(1e6),
      [ux, uz] = desired[n];
    let best = null,
      score = Infinity;
    // A back-wall item faces the doorway. Side-wall pieces can turn ninety degrees; their capsule volumes turn with them.
    for (const [ori, pen] of uz < -0.62
      ? [
          [0, 0],
          [ux > 0 ? -1 : 1, 0.9],
        ]
      : [
          [ux > 0 ? -1 : 1, 0],
          [0, 0.52],
          [2, 0.86],
        ])
      for (const sc of [sz, sz * 0.84]) {
        const odd = Math.abs(ori) === 1,
          W0 = (odd ? D : W) * sc,
          D0 = (odd ? W : D) * sc;
        for (let j = 0; j < 10; j++)
          for (let i = 0; i < 13; i++) {
            const X = cx + a * (((i - 6) / 6) * 0.89),
              Z = cz + b * (((j - 4.5) / 4.5) * 0.89);
            if (!fits(X, Z, W0, D0)) continue;
            const cost =
              ((X - cx) / a - ux) ** 2 * 4 +
              ((Z - cz) / b - uz) ** 2 * 3 +
              pen +
              ((sz - sc) * 4) ** 2 +
              0.0001 * (i + j);
            if (cost < score) {
              score = cost;
              best = {
                kind,
                x: X,
                z: Z,
                w: W0,
                d: D0,
                W: W * sc,
                D: D * sc,
                sc,
                angle: (ori * Math.PI) / 2,
                seed,
              };
            }
          }
      }
    if (best) objects.push(best);
  }
  return {
    style,
    composition,
    palette,
    mirror,
    objects,
    rug: int(5),
    beam: int(3),
    lamp: int(4),
    wall: int(4),
    motif: int(5),
    lampX: cx + mirror * w * (0.12 + 0.12 * rand()),
    lampZ: cz + d * (0.12 * rand() - 0.08),
    matX: cx - mirror * w * (0.03 + rand() * 0.095),
    matZ: cz + (rand() - 0.5) * d * 0.18,
    matW: Math.min(3.4, w * (0.2 + 0.17 * rand())),
    matD: Math.min(3.6, d * (0.26 + 0.22 * rand())),
  };
}
