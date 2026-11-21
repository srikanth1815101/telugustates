// Pure, versioned placement policy. No random(), wall clock, network or renderer.
export const U = 63.615;
export function noise(x, y, s = 0) {
  let n =
    Math.imul(x | 0, 0x1f123bb5) ^
    Math.imul(y | 0, 0x5f356495) ^
    Math.imul(s | 0, 0x6c8e9cf5);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const forest = [
  "Mixed canopy",
  "Teak",
  "Tamarind",
  "Bamboo",
  "Silk cotton",
  "Neem",
  "Golden shower",
  "Flame tree",
  "Rock fig",
];
const blooms = [
  "Pink asters",
  "Ivory daisies",
  "Indigo bells",
  "Marigold",
  "Red balsam",
];
const choose = (arr, r) =>
  arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];
export const limits = [
  { radius: 7, animal: 7, small: 12 },
  { radius: 13, animal: 24, small: 68 },
  { radius: 18, animal: 40, small: 145 },
];
export function habitat(c) {
  return c.mangrove > 18 && c.coast < 10
    ? "mangrove"
    : c.coast < 2 && c.z < 18 && c.f < 25
      ? "beach"
      : c.f > 48
        ? "forest"
        : c.grass > 20 && c.s < 14
          ? "meadow"
          : c.s > 17
            ? "rock"
            : "scrub";
}
function pickTree(c, hd, r) {
  const env = habitat(c);
  if (env === "mangrove")
    return choose(["Mangrove", "Mangrove", "Palmyra", "Coconut palm"], r);
  if(c.coast<68&&c.z<70&&c.crop>48&&c.s<8)return choose(["Coconut palm","Palmyra","Coconut palm","Mango","Tamarind","Palmyra"],r);
  if(c.crop>54&&c.s<9)return choose(["Neem","Tamarind","Mango","Guava"],r);
  if (env === "forest") {
    const pool = [...forest];
    if (c.rain > 3.5) pool.push("Banyan", "Eucalyptus", "Bamboo");
    if (c.z > 1000 && c.rain >= 2.5) pool.push("Hill spire", "Hill spire");
    return choose(pool, r);
  }
  if (env === "beach" || c.coast < 12)
    return choose(["Casuarina", "Coconut palm", "Palmyra", "Cashew"], r);
  return choose(
    env === "rock"
      ? ["Rock fig", "Acacia", "Silk cotton", "Neem"]
      : ["Acacia", "Neem", "Rock fig", "Flame tree", "Golden shower"],
    r,
  );
}
export function generate(input) {
  const { cells, centre, tier, season, time, presets } = input,
    lim = limits[tier],
    map = new Map(cells.map((c) => [c.x + "," + c.y, c]));
  const hdist = () => 1e8;
  const staticItems = [],
    fauna = [],
    small = [];
  const isWet = (c) => c && [3, 4].includes(c.c);
  const adjWet = (i, j) =>
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => isWet(map.get(i + dx + "," + (j + dy))));
  // Acre ownership does not suppress vegetation. The scene clips actual courtyards, commons and the walking width.
  const allowed = () => true;
  const selectFauna = (names, rc, c, hd) => {
    let xs = names.filter((n) => presets.animals[n]);
    if (!xs.length) return null;
    return choose(xs, rc);
  };
  for (const c of cells) {
    const i = c.x,
      j = c.y,
      env = habitat(c),
      r = Math.hypot(i + 0.5 - centre[0], j + 0.5 - centre[1]);
    if (!c.d || r > lim.radius) continue;
    const wet = isWet(c),
      shore = adjWet(i, j),
      hd = hdist(i + 0.5, j + 0.5),
      near = r < 4,
      mid = r < 8;
    const rng = (s, k = 0) => noise(i, j, 137 * k + s);
    function rec(kind, name, k, x, y, scale, extra = {}) {
      return {
        id: `${i}:${j}:${kind}:${name}:${k}:${extra.hab || "land"}`,
        kind,
        name,
        x,
        y,
        scale,
        rotation: rng(218, k) * Math.PI * 2,
        tint: rng(43, k),
        seed: rng(120, k),
        ...extra,
      };
    }
    const loc = (k, s = 0) => [
      i + 0.07 + 0.86 * rng(2 + s, k),
      j + 0.07 + 0.86 * rng(5 + s, k),
    ];
    if (!wet) {
      let density =
        env === "forest"
          ? 2 + c.f / 5.3
          : env === "mangrove"
            ? 14
            : hd < 100
              ? 5.9
              : c.f / 16 + (env === "beach" ? 1.6 : env === "rock" ? 0.9 : 3.3);
      if(c.crop>60&&c.f<20)density*=.48;
      density *= tier === 0 ? 0.81 : tier === 2 ? 1.17 : 1;
      if (!near) density *= mid ? 0.56 : 0.32;
      const n = Math.floor(density) + (rng(91) < density % 1 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const [x, y] = loc(k);
        if (!allowed(x, y, true)) continue;
        const type = pickTree(c, hdist(x, y), rng(3, k));
        staticItems.push(
          rec("tree", type, k, x, y, 0.76 + rng(7, k) * 0.53, {
            lod:
              tier === 0
                ? r > 2.3
                  ? 2
                  : r > 0.95
                    ? 1
                    : 0
                : r > (tier === 2 ? 4.6 : 3.2)
                  ? 2
                  : r > (tier === 2 ? 1.53 : 0.95)
                    ? 1
                    : 0,
          }),
        );
      }
      if (
        (c.s > 10 ||
          [4, 8, 9, 13].includes(c.rock) ||
          c.bare > 30 ||
          rng(81) < 0.17) &&
        rng(22) < 0.12 + c.s / 80
      ) {
        let form =
          c.s > 19
            ? "Strata shelf"
            : [4, 9, 13].includes(c.rock)
              ? rng(60) < 0.29
                ? "Balanced tor"
                : "Granite pile"
              : rng(65) < 0.55
                ? "Talus"
                : "Split boulder";
        const [x, y] = loc(2, 29);
        if (allowed(x, y, true))
          staticItems.push(
            rec("rock", form, 8, x, y, (c.s > 14 ? 2.6 : 1.1) + rng(32) * 3.7, {
              lith: c.rock,
              lod: r > 5 ? 1 : 0,
            }),
          );
      }
      if (r < (tier ? 4.2 : 1.1)) {
        const n = r < 1.8 ? (tier ? 30 : 6) : near ? 7 : 2;
        for (let k = 0; k < n; k++) {
          const [x, y] = loc(k, 46);
          if (!allowed(x, y, false)) continue;
          const n = shore
            ? choose(["Shore reed", "Marsh sedge", "Pink asters"], rng(7, k))
            : env === "forest"
              ? choose(
                  [
                    "Gully fern",
                    "Leaf litter",
                    "Mushroom",
                    "Short grass",
                    "Indigo bells",
                  ],
                  rng(190, k),
                )
              : env === "rock" && rng(5, k) < 0.32
                ? "Agave"
                : rng(113, k) < 0.25
                  ? choose(blooms, rng(11, k))
                  : season === "summer"
                    ? "Golden plume"
                    : "Short grass";
          staticItems.push(rec("plant", n, k, x, y, 0.9 + rng(17, k) * 1.0));
        }
      }
      if (r < 2.4 && rng(117) < 0.67) {
        const [x, y] = loc(4, 77);
        if (allowed(x, y, true))
          staticItems.push(
            rec("rock", "Pebble fan", 9, x, y, 0.62 + rng(8) * 1.4, {
              lith: c.rock,
            }),
          );
      }
      if (r < 5 && rng(36) < 0.08) {
        const [x, y] = loc(1, 67);
        if (allowed(x, y, true))
          staticItems.push(
            rec(
              "detail",
              choose(["Fallen log", "Stump"], rng(28)),
              0,
              x,
              y,
              0.85 + rng(66) * 0.34,
            ),
          );
      }
    } else if (
      r < 3.5 &&
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([a, b]) => {
        const t = map.get(i + a + "," + (j + b));
        return t?.d && !isWet(t);
      }) &&
      c.c === 3 &&
      c.depth < 3 &&
      rng(109) < 0.5
    ) {
      staticItems.push(
        rec(
          "plant",
          choose(["Lotus", "Water lily", "Water hyacinth"], rng(11)),
          0,
          ...loc(1),
          0.8 + rng(21) * 0.4,
          { water: true },
        ),
      );
    }
    if (r > 3.7) continue;
    for (let k = 0; k < (near ? 2 : 1); k++) {
      const [x, y] = loc(k, 72),
        d0 = hdist(x, y);
      if (
        !allowed(x, y, false) ||
        Math.hypot(x - centre[0], y - centre[1]) * U > 245
      )
        continue;
      let names = [],
        hab = env;
      const evening = time === "dusk",
        wetSeason = season === "monsoon";
      if (wet) {
        if (
          d0 >= 35 &&
          c.depth >= 2 &&
          c.c === 3 &&
          r < 1.65 &&
          ![
            [0, 0],
            [0.2, 0],
            [-0.2, 0],
            [0, 0.2],
            [0, -0.2],
          ].some(
            ([u, v]) =>
              !isWet(map.get(Math.floor(x + u) + "," + Math.floor(y + v))),
          )
        ) {
          names = ["Shoal fish", "Shoal fish", "Reservoir fish"];
          hab = "deep";
        } else if (d0 >= 35 && c.c === 3 && shore && rng(11, k) < 0.43) {
          names = ["Shoal fish"];
          hab = "shallow";
        } else if (d0 > 30 && rng(115, k) < 0.32) {
          names = ["Duck", "Cormorant"];
          hab = "water";
        }
      } else if (d0 >= 35 && shore) {
        names = [
          "Egret",
          "Heron",
          "Stork",
          "Kingfisher",
          "Turtle",
          "Lapwing",
          ...(wetSeason ? ["Frog"] : []),
        ];
        hab = "shore";
      } else if (d0 >= 35 && env === "forest") {
        names = [
          "Spotted deer",
          "Sambar",
          "Wild boar",
          "Langur",
          "Bonnet macaque",
          "Peafowl",
          "Squirrel",
          "Jungle fowl",
        ];
        if (r > 2.5 && c.f > 90 && rng(85, k) < 0.004) names = ["Leopard"];
      } else if (d0 >= 35 && env === "beach") {
        names = ["Sand crab", "Gull", "Tern"];
        hab = "beach";
      } else if (d0 >= 35 && ["meadow", "scrub", "rock"].includes(env)) {
        names =
          env === "rock"
            ? ["Hare", "Mongoose", "Jackal"]
            : ["Nilgai", "Blackbuck", "Hare", "Peafowl", "Lapwing", "Mongoose"];
      }
      const n = selectFauna(names, rng(75, k), c, d0);
      if (n && rng(44, k) < (hab === "deep" ? 0.92 : 0.32))
        fauna.push(
          rec("animal", n, k, x, y, 0.82 + rng(32, k) * 0.32, {
            hab,
            dom: false,
            homeD: d0,
          }),
        );
      if (tier && r < 2.8 && !wet && d0 > 32 && rng(62, k) < 0.4) {
        let fly = shore
          ? "Dragonfly"
          : evening
            ? choose(["Moth", "Firefly", "Bat"], rng(56, k))
            : choose(
                ["Butterfly", "Parakeet", "Kite", "Crow", "Bee"],
                rng(74, k),
              );
        if (env === "beach") fly = choose(["Gull", "Tern"], rng(56, k));
        if (c.z > 600 && fly === "Kite" && rng(116, k) < 0.3) fly = "Eagle";
        small.push(
          rec("animal", fly, k, x, y, 0.86 + rng(53, k) * 0.3, {
            hab: "air",
            dom: false,
            homeD: d0,
          }),
        );
      }
    }
  }
  const capped = (a, n) =>
    a
      .sort(
        (p, q) =>
          Math.hypot(p.x - centre[0], p.y - centre[1]) +
          0.22 * p.seed -
          (Math.hypot(q.x - centre[0], q.y - centre[1]) + 0.22 * q.seed),
      )
      .slice(0, n);
  return {
    static: staticItems,
    life: [...capped(fauna, lim.animal), ...capped(small, lim.small)],
  };
}
