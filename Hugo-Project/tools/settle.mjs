// Permanent square first, then occupied yards and paired fields. Offline; no browser RNG or runtime allocation.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { Tiles, key, ll } from "../static/js/grid.js";
import { Surface } from "../static/js/terrain.js";
import { ecology } from "../static/js/ecodata.js";
import { ACRE as M } from "../static/js/metres.js";

const root = fileURLToPath(new URL("../", import.meta.url)),
  pub = await fs.mkdtemp(path.join(os.tmpdir(), "village-square-")),
  file = path.join(root, "data/settlements.json"),
  relayout = process.argv.includes("--relayout"),
  round = (p) => p.map((x) => +x.toFixed(7)),
  keyp = (p) => p.join(","),
  dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) * M,
  lerp = (a, b, t) => round(a.map((k, i) => k + (b[i] - k) * t)),
  move = (p, x, y) => round([p[0] + x / M, p[1] + y / M]),
  smooth = (t) => {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  };

function random(key) {
  let v = 2166136261;
  for (const c of key) v = Math.imul(v ^ c.charCodeAt(0), 16777619);
  return () => (v = (Math.imul(1664525, v) + 1013904223) >>> 0) / 4294967296;
}

function pattern(v) {
  const {
      sw: [X, Y],
      side: S,
      turn: R,
    } = v.square,
    rand = random(v.id + ":contour4"),
    world = (x, y) =>
      round(
        [
          [X + x, Y + y],
          [X + S - y, Y + x],
          [X + S - x, Y + S - y],
          [X + y, Y + S - x],
        ][R],
      ),
    nodes = new Map(),
    edge = new Map(),
    lines = [],
    id = (k, i) => k + "/" + i,
    // Keep endL and endR from the exact first two RNG draws so exterior 1-acre field bunds stay 100% stable.
    endL = 1 + Math.floor(rand() * (S - 1)),
    endR = 1 + Math.floor(rand() * (S - 1)),
    phase = rand() * 5.7,
    sign = rand() < 0.5 ? -1 : 1,
    midY = S * 0.5 + (rand() - 0.5) * 0.08,
    MAIN_N = 24,
    HUB_I = 12,
    HUB_KEY = id("street", HUB_I);

  // Cohesive central Pedda Veedhi (main street) through the village heart, easing gently to the east/west field gates.
  function splineY(t) {
    const wL = 1 - smooth(t / 0.22),
      wR = smooth((t - 0.78) / 0.22),
      wM = Math.max(0, 1 - wL - wR),
      base = wL * endL + wM * midY + wR * endR,
      gentle =
        Math.sin(t * Math.PI) *
        0.028 *
        Math.sin(t * Math.PI * 2 + phase) *
        sign;
    return base + gentle;
  }
  function spline(t) {
    return world(S * t, splineY(t));
  }

  function job(k, f, n, rootAt, rootKey, width) {
    for (let i = 0; i <= n; i++) nodes.set(id(k, i), f(i / n));
    for (let i = 0; i <= n; i++) {
      if (i === rootAt) {
        if (rootKey) nodes.set(id(k, i), nodes.get(rootKey));
        continue;
      }
      const j = i < rootAt ? i + 1 : i - 1,
        a = nodes.get(id(k, i)),
        b = nodes.get(id(k, j)),
        N = Math.max(2, Math.ceil(dist(a, b) / 2.9)),
        xy = Array.from({ length: N + 1 }, (_, z) =>
          z === 0 ? a : z === N ? b : f((i + ((j - i) * z) / N) / n),
        );
      edge.set(id(k, i), {
        to: (j === rootAt && rootKey) || id(k, j),
        p: {
          id: `${v.id}:${k}:${i}`,
          type: "village",
          w: width,
          surveyed: true,
          xy,
        },
      });
      lines.push(...xy.slice(1).map((b, z) => [xy[z], b]));
    }
  }

  job("street", spline, MAIN_N, HUB_I, null, 1.72);

  // Perpendicular Chinna Veedhi cross-streets forming cohesive residential blocks around the central chowk.
  const crossSpecs =
    S >= 4
      ? [
          ["westN", 9, 1],
          ["eastS", 15, 0],
          ["westS", 9, 0],
          ["eastN", 15, 1],
          ["outerN", 5, 1],
          ["outerS", 19, 0],
        ]
      : [
          ["westN", 8, 1],
          ["eastS", 16, 0],
          ["westS", 8, 0],
          ["eastN", 16, 1],
        ];

  for (const [k, index, up] of crossSpecs) {
    const t0 = index / MAIN_N,
      x0 = S * t0,
      y0 = splineY(t0),
      B = up ? S - 0.24 : 0.24,
      drift = (rand() - 0.5) * 0.035,
      f = (t) =>
        world(
          x0 + drift * Math.sin(t * Math.PI),
          y0 + (B - y0) * t,
        ),
      steps = Math.max(4, Math.round((Math.abs(B - y0) * M) / 7.8));
    job(k, f, steps, 0, id("street", index), 1.38);
  }

  const hub = nodes.get(HUB_KEY),
    field = [];
  for (let index = 0; index < v.capacity; index++) {
    const east = ((index >> 1) & 1) === 0,
      outer = !!(index & 1),
      walk = east ? "east" : "west",
      vx = east ? S : 0,
      bx = outer ? (east ? S + 1 : -1) : vx,
      head = east ? endR : endL,
      band = index >> 2,
      offset = band % 2 ? -1 - (band >> 1) : band >> 1,
      row = head + offset,
      delta = east ? 1 : -1,
      gateY = (r) => {
        const u = random(
          v.id + ":gate:" + walk + ":" + (outer ? "o:" : "i:") + r,
        )();
        return r < head ? r + 0.82 - 0.08 * u : r + 0.18 + 0.08 * u;
      },
      fy = gateY(row),
      junction = world(bx, fy),
      land = world(bx + (delta * 1.65) / M, fy),
      p = world((outer ? (east ? S + 1 : -2) : east ? S : -1) + 0.5, row + 0.5),
      c = p.map(Math.floor),
      tip = outer ? `${walk}/turn` : id("street", east ? MAIN_N : 0),
      mk = (k, to, a, b) => {
        nodes.set(k, a);
        if (!edge.has(k)) {
          const N = Math.max(1, Math.ceil(dist(a, b) / 5.4));
          edge.set(k, {
            to,
            p: {
              id: v.id + ":" + k.replaceAll("/", "-"),
              type: "bund",
              w: 1.36,
              surveyed: true,
              xy: Array.from({ length: N + 1 }, (_, i) =>
                i === 0 ? a : i === N ? b : lerp(a, b, i / N),
              ),
            },
          });
        }
      };
    if (outer)
      mk(
        tip,
        id("street", east ? MAIN_N : 0),
        world(bx, head),
        world(vx, head),
      );
    const fk = (y) => `${walk}/${outer ? "gate" : "inner"}/${y}`;
    for (let n = 0; n <= Math.abs(offset >= 0 ? offset : offset + 1); n++) {
      const row0 = offset >= 0 ? head + n : head - 1 - n,
        end = n === 0 ? tip : fk(row0 + (offset >= 0 ? -1 : 1));
      mk(fk(row0), end, world(bx, gateY(row0)), nodes.get(end));
    }
    field.push({ c, land, junction, tip: fk(row) });
  }
  return { world, nodes, edge, lines, hub, hubKey: HUB_KEY, mainN: MAIN_N, field };
}

function closest(p, a, b) {
  const x = b[0] - a[0],
    y = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * x + (p[1] - a[1]) * y) / (x * x + y * y || 1),
      ),
    );
  return lerp(a, b, t);
}

function yardCorners(h) {
  const co = Math.cos(h.a),
    si = Math.sin(h.a),
    pt = (x, y) => move(h.p, x * co + y * si, x * si - y * co),
    hw = h.lot[0] * 0.5,
    rear = -h.d * 0.5 - h.back,
    front = h.d * 0.5 + h.front;
  return [
    pt(-hw, rear),
    pt(hw, rear),
    pt(hw, front),
    pt(-hw, front),
  ];
}

function padBox(centre, theta, w, d) {
  const rx = Math.cos(theta),
    fx = Math.sin(theta),
    a = (Math.abs(rx) * w + Math.abs(fx) * d) * 0.5 + 0.48,
    b = (Math.abs(fx) * w + Math.abs(rx) * d) * 0.5 + 0.48;
  return [
    centre[0] - a / M,
    centre[1] - b / M,
    centre[0] + a / M,
    centre[1] + b / M,
  ];
}

function boxesClear(A, B, marginAcre) {
  return (
    A[2] + marginAcre <= B[0] ||
    B[2] + marginAcre <= A[0] ||
    A[3] + marginAcre <= B[1] ||
    B[3] + marginAcre <= A[1]
  );
}

// Exact oriented-rectangle gap in metres (matching check-villages.mjs).
function polyGap(a, b) {
  let disjoint = false,
    m = Infinity;
  for (const [p, q] of [
    [a, b],
    [b, a],
  ])
    for (let i = 0; i < 4; i++) {
      const x = p[i],
        y = p[(i + 1) % 4],
        dx = y[0] - x[0],
        dy = y[1] - x[1],
        l = dx * dx + dy * dy || 1e-12,
        project = (t) => (t[0] - x[0]) * dy - (t[1] - x[1]) * dx,
        aa = p.map(project),
        bb = q.map(project);
      if (Math.max(...aa) < Math.min(...bb) || Math.max(...bb) < Math.min(...aa))
        disjoint = true;
      for (const t of q) {
        const u = Math.max(
          0,
          Math.min(1, ((t[0] - x[0]) * dx + (t[1] - x[1]) * dy) / l),
        );
        m = Math.min(m, dist(t, [x[0] + u * dx, x[1] + u * dy]));
      }
    }
  return disjoint ? m : 0;
}

function inYardSegment(h, a, b, pad) {
  const co = Math.cos(h.a),
    si = Math.sin(h.a),
    local = (p) => [
      (co * (p[0] - h.p[0]) + si * (p[1] - h.p[1])) * M,
      (si * (p[0] - h.p[0]) - co * (p[1] - h.p[1])) * M,
    ],
    A = local(a),
    B = local(b),
    lo = [-h.lot[0] / 2 - pad, -h.d / 2 - h.back - pad],
    hi = [h.lot[0] / 2 + pad, h.d / 2 + h.front + pad];
  let t = 0,
    T = 1;
  for (let k = 0; k < 2; k++) {
    const dx = B[k] - A[k];
    if (Math.abs(dx) < 1e-10) {
      if (A[k] < lo[k] || A[k] > hi[k]) return false;
      continue;
    }
    const u = (lo[k] - A[k]) / dx,
      v = (hi[k] - A[k]) / dx;
    t = Math.max(t, Math.min(u, v));
    T = Math.min(T, Math.max(u, v));
  }
  return t <= T;
}

function chooseShade(v, pat, landFn) {
  const r = random(v.id + ":shade2");
  // Place the village banyan/rachabanda common cleanly beside the central hub plaza, clear of all streets.
  for (const distM of [6.4, 7.6, 8.8, 5.6]) {
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2 + r() * 0.08,
        p = move(v.hub, distM * Math.cos(a), distM * Math.sin(a));
      if (
        pat.lines.every(([p0, p1]) => dist(p, closest(p, p0, p1)) > 3.2) &&
        landFn(p)
      )
        return p;
    }
  }
  throw Error("No common shade site for " + v.id);
}

function upsertFrontmatter(text, updates) {
  const end = text.indexOf("\n---", 4);
  if (end < 0) throw Error("Malformed frontmatter");
  let head = text.slice(0, end);
  for (const [k, val] of Object.entries(updates)) {
    const serialized = `${k}: ${JSON.stringify(val)}`,
      re = new RegExp(`^${k}:.*$`, "m");
    if (re.test(head)) head = head.replace(re, serialized);
    else head += `\n${serialized}`;
  }
  return head + text.slice(end);
}

try {
  execFileSync("hugo", [
    "--source",
    root,
    "--environment",
    "planning",
    "--destination",
    pub,
    "--minify",
  ]);
  globalThis.fetch = async (u) =>
    new Response(
      await fs.readFile(
        path.join(
          pub,
          path.relative(path.join(root, "static"), fileURLToPath(u)),
        ),
      ),
    );
  const raw = JSON.parse(await fs.readFile(path.join(pub, "catalog.json"))),
    a = JSON.parse(await fs.readFile(path.join(pub, "data/atlas.json"))),
    plan = JSON.parse(await fs.readFile(file)),
    tiles = new Tiles(a),
    ec = await ecology(),
    O = { x: a.project.cols / 2, y: a.project.rows / 2, z: 0 },
    records = new Map(raw.houses.map((r) => [r.u, r])),
    pending = new Map(),
    used = new Set(),
    taken = new Set(),
    changes = [];

  if (relayout) {
    // Rebuild residential street & courtyard geometry inside each existing village square while preserving every resident's 1-acre plot.
    for (const v of plan.villages) {
      for (const u of Object.keys(v.homes)) {
        if (!records.has(u)) throw Error("Missing permanent record " + u);
      }
      v.homes = {};
      v.paths = [];
    }
  } else {
    for (const v of plan.villages)
      for (const [u, h] of Object.entries(v.homes)) {
        if (!records.has(u) || keyp(records.get(u).c) !== keyp(h.c))
          throw Error("Missing or changed permanent record " + u);
        used.add(u);
        taken.add(keyp(h.c));
      }
  }

  for (const r of raw.houses)
    if (!used.has(r.u))
      (pending.get(r.d) || pending.set(r.d, []).get(r.d)).push(r);

  if (!pending.size) console.log("No changes to published villages.");
  else {
    const fileMap = new Map();
    for (const f of await fs.readdir(path.join(root, "content/houses"))) {
      if (!f.endsWith(".md") || f === "_index.md") continue;
      const p = path.join(root, "content/houses", f),
        text = await fs.readFile(p, "utf8");
      if (/^username\s*:/im.test(text))
        throw Error(
          "House files must not store real usernames (" +
            f +
            "); create records with node tools/add-house.mjs",
        );
      const u = f.slice(0, -3).toLowerCase();
      if (!/^h[0-9a-f]{24}$/.test(u))
        throw Error("House filename must be a one-way resident ID: " + f);
      fileMap.set(u, [p, text]);
    }

    for (const [did, rs] of pending) {
      const district = raw.districts.find((q) => q.id === did),
        anchor = district.anchor;
      let s,
        cover = "";
      async function study(p) {
        const k = key(...p);
        if (k === cover) return;
        const ks = new Set();
        for (const i of [-1, 0, 1])
          for (const j of [-1, 0, 1])
            ks.add(key(p[0] + i * 256, p[1] + j * 256));
        await Promise.all([...ks].map((k) => tiles.load(k)));
        tiles.trim(ks);
        cover = k;
        s = new Surface(tiles, O, p);
        s.ec = ec;
        s.focus = p;
      }
      function land(p) {
        const c = tiles.at(...p);
        return !!(
          c &&
          c.d === did &&
          c.z !== -32768 &&
          s.wet(...p) < 0.355 &&
          !s.ocean(...p)
        );
      }
      function makeSite(idx) {
        return `v${String(did).padStart(2, "0")}-${String(idx).padStart(2, "0")}`;
      }
      async function newSite() {
        const id = makeSite(
            1 + plan.villages.filter((v) => v.d === did).length,
          ),
          r = random(id + ":reserve"),
          capacity = 22 + Math.floor(r() * 15),
          side = capacity <= 30 ? 3 : 4,
          tmp = {
            id,
            d: did,
            capacity,
            square: { side, turn: Math.floor(r() * 4), sw: [0, 0] },
          };
        const local = pattern(tmp),
          cells = local.field.map((k) => k.c);
        for (let i = 0; i < side; i++)
          for (let j = 0; j < side; j++) cells.push([i, j]);
        const unique = [...new Map(cells.map((c) => [keyp(c), c])).values()];
        let best = null,
          score = Infinity;
        for (let n = 0; n < 24000; n++) {
          const radius = Math.floor(n / 65) * 2 + 13,
            centre = [
              Math.floor(anchor[0] + (r() - 0.5) * 2 * radius),
              Math.floor(anchor[1] + (r() - 0.5) * 2 * radius),
            ];
          if (n > 150 && best && n > best.n + 72) break;
          if (plan.villages.some((v) => dist(centre, v.hub) < 940)) continue;
          await study(centre);
          let grade = 0,
            lo = Infinity,
            hi = -Infinity,
            ok = true,
            green = 0;
          for (const [dx, dy] of unique) {
            const x = centre[0] + dx,
              y = centre[1] + dy,
              t = tiles.at(x, y);
            if (
              !t?.ok ||
              t.d !== did ||
              t.s > 12 ||
              taken.has(keyp([x, y])) ||
              [3, 4, 5].includes(t.c)
            ) {
              ok = false;
              break;
            }
            grade += t.s * t.s;
            lo = Math.min(lo, t.z);
            hi = Math.max(hi, t.z);
            green += t.c === 1 ? 1 : 0;
          }
          if (!ok) continue;
          const q =
            grade / unique.length +
            (hi - lo) * 0.51 +
            dist(centre, anchor) * 0.00019 -
            green * 0.08;
          if (q >= score) continue;
          const pp = (p) => [centre[0] + p[0], centre[1] + p[1]];
          if (
            unique.some(([x, y]) =>
              [
                [0.12, 0.12],
                [0.88, 0.12],
                [0.88, 0.88],
                [0.12, 0.88],
                [0.5, 0.5],
              ].some(([i, j]) => !land(pp([x + i, y + j]))),
            )
          )
            continue;
          let slope = 0;
          for (const L of [
            ...local.lines,
            ...[...local.edge.values()]
              .filter((e) => e.p.type === "bund")
              .map((e) => [e.p.xy[0], e.p.xy.at(-1)]),
          ]) {
            const [a0, b0] = L,
              N = Math.max(1, Math.ceil(dist(a0, b0) / 4)),
              p = pp(a0);
            let last = s.point(...p).z;
            for (let i = 1; i <= N; i++) {
              const t = pp(lerp(a0, b0, i / N)),
                h = s.point(...t);
              if (h.w >= -0.02) {
                slope = 2;
                break;
              }
              slope = Math.max(
                slope,
                Math.abs(h.z - last) / (dist(a0, b0) / N),
              );
              last = h.z;
            }
            if (slope > 0.29) break;
          }
          if (slope > 0.29) continue;
          score = q;
          best = { sw: centre, n };
        }
        if (!best)
          throw Error(
            "No safe, buildable contiguous village/field block in " +
              district.name,
          );
        tmp.square.sw = best.sw;
        const pat = pattern(tmp);
        await study(tmp.square.sw);
        tmp.hub = pat.hub;
        tmp.shade = chooseShade(tmp, pat, land);
        tmp.homes = {};
        tmp.paths = [];
        tmp.reserve = unique.map((q) => [q[0] + best.sw[0], q[1] + best.sw[1]]);
        plan.villages.push(tmp);
        console.log(
          "Reserved",
          id,
          district.name,
          side + "×" + side,
          capacity,
          best.sw,
        );
        return tmp;
      }

      if (relayout) {
        for (const v of plan.villages.filter((q) => q.d === did)) {
          await study(v.square.sw);
          const pat = pattern(v);
          v.hub = pat.hub;
          v.shade = chooseShade(v, pat, land);
        }
      }

      for (const row of rs) {
        let done = false;
        const [fn, text] = fileMap.get(row.u),
          fixed = /^cell:/m.test(text.split("\n---")[0]),
          pinnedVid = /^villageId:\s*["']?([^"'\s]+)/m.exec(
            text.split("\n---")[0],
          )?.[1];
        for (let attempts = 0; attempts < 2 && !done; attempts++) {
          let v =
            (relayout &&
              pinnedVid &&
              plan.villages.find(
                (q) =>
                  q.id === pinnedVid &&
                  Object.keys(q.homes).length < q.capacity,
              )) ||
            plan.villages
              .filter(
                (q) => q.d === did && Object.keys(q.homes).length < q.capacity,
              )
              .at(-1);
          if (!v || attempts) v = await newSite();
          await study(v.hub);
          const P = pattern(v),
            others = Object.values(v.homes),
            otherRings = others.map((o) => ({
              h: o,
              ring: yardCorners(o),
              box: padBox(o.p, o.a, o.w, o.d),
            })),
            r = random(row.u + ":yard"),
            [w, d] = row.house.size_m,
            back = 2.1 + r() * 0.75,
            front = 3.9 + r() * 0.95,
            rawLotD = d + front + back,
            minLotW = Math.max(w + 1.85, 154 / rawLotD),
            maxLotW = Math.min(w + 2.95, 292 / rawLotD),
            lotW = Math.min(maxLotW, Math.max(minLotW, w + 2.15 + r() * 0.55)),
            lotD = Math.min(296 / lotW, Math.max(154 / lotW, rawLotD)),
            adjFront = lotD - d - back,
            lot = [+lotW.toFixed(3), +lotD.toFixed(3)],
            off =
              row.house.archetype === "l-court"
                ? w * 0.18
                : row.house.archetype === "cattle-compound"
                  ? -0.2 * w
                  : 0;

          // Build candidate street stations along main Pedda Veedhi and perpendicular Chinna Veedhi lanes,
          // including mid-segment stations so neighbors pack cleanly side-by-side without wasteful gaps.
          const stations = [];
          for (const [k, p0] of P.nodes) {
            if (
              !/^(street|westN|eastS|westS|eastN|outerN|outerS)\//.test(k) ||
              k === P.hubKey ||
              !P.edge.has(k)
            )
              continue;
            const [laneName, idxStr] = k.split("/"),
              idx = +idxStr;
            // Keep extreme edge gate transitions free for bund turnouts.
            if (laneName === "street" && (idx <= 1 || idx >= P.mainN - 1))
              continue;
            const e = P.edge.get(k),
              xy = e.p.xy,
              p1 = xy[xy.length - 1],
              segLen = dist(p0, p1);
            stations.push({ k, laneName, join: p0, p0, p1 });
            if (segLen > 6.5 && xy.length >= 3) {
              const midIdx = Math.floor(xy.length / 2);
              stations.push({
                k,
                laneName,
                join: xy[midIdx],
                p0: xy[midIdx - 1],
                p1: xy[midIdx + 1] || p1,
              });
            }
          }

          let options = [];
          for (let pass = 0; pass < 2 && !options.length; pass++) {
            const setbackChoices = pass ? [2.35, 3.6, 5.2, 7.2] : [2.25, 2.85];
            for (const st of stations) {
              const alpha = Math.atan2(
                st.p1[1] - st.p0[1],
                st.p1[0] - st.p0[0],
              );
              for (const sign of [-1, 1]) {
                for (const gateDist of setbackChoices) {
                  // Entrances face cleanly onto the street (within ±0.9 deg natural hand-laid variation).
                  const jitter = (r() - 0.5) * 0.03,
                    dx = alpha + (sign * Math.PI) / 2 + jitter,
                    theta = +Math.atan2(-Math.cos(dx), Math.sin(dx)).toFixed(7),
                    co = Math.cos(theta),
                    si = Math.sin(theta),
                    l = d / 2 + adjFront + gateDist,
                    centre = move(
                      st.join,
                      Math.cos(dx) * l - off * co,
                      Math.sin(dx) * l - off * si,
                    ),
                    pt = (x, y) =>
                      move(centre, x * co + y * si, x * si - y * co),
                    gate = pt(off, d / 2 + adjFront),
                    porch = pt(off, d / 2 + adjFront + Math.min(1.32, gateDist * 0.55)),
                    proposed = {
                      p: centre,
                      a: theta,
                      lot,
                      w,
                      d,
                      back,
                      front: adjFront,
                    },
                    corn = yardCorners(proposed),
                    myBox = padBox(centre, theta, w, d);

                  if (
                    corn.some((q) =>
                      q.some(
                        (coord, i) =>
                          coord <= v.square.sw[i] + 0.018 ||
                          coord >= v.square.sw[i] + v.square.side - 0.018,
                      ),
                    ) ||
                    dist(v.hub, centre) < 10.5 ||
                    dist(v.shade, centre) < 11.2 ||
                    corn.some((q) => dist(v.shade, q) < 3.4)
                  )
                    continue;

                  // Keep every street segment outside the courtyard (with shoulder clearance) and away from house walls.
                  if (
                    P.lines.some(([la, lb]) =>
                      inYardSegment(proposed, la, lb, 1.35),
                    )
                  )
                    continue;

                  // Keep courtyard disjoint from existing yard-lanes and maintain crisp neighbor spacing & terrace blend separation.
                  let conflict = false,
                    nearestCentre = Infinity,
                    minYardGap = Infinity;
                  for (const o of otherRings) {
                    const dc = dist(o.h.p, centre);
                    if (dc < nearestCentre) nearestCentre = dc;
                    // Guarantee house-ground.js terrace blend (96/1920 = 0.05 acre) never touches a neighbor's foundation box.
                    if (!boxesClear(myBox, o.box, 0.054)) {
                      conflict = true;
                      break;
                    }
                    const yg = polyGap(corn, o.ring);
                    if (yg < 1.15) {
                      conflict = true;
                      break;
                    }
                    if (yg < minYardGap) minYardGap = yg;
                    if (
                      inYardSegment(o.h, st.join, gate, 1.2) ||
                      inYardSegment(proposed, o.h.gate, o.h.join, 1.2) ||
                      dist(st.join, o.h.join) < 0.45
                    ) {
                      conflict = true;
                      break;
                    }
                  }
                  if (conflict) continue;

                  if (
                    v.paths.some(
                      (lp) =>
                        lp.type === "yard-lane" &&
                        lp.xy.some(
                          (q, qi) =>
                            qi > 0 &&
                            inYardSegment(proposed, lp.xy[qi - 1], q, 1.1),
                        ),
                    )
                  )
                    continue;

                  const z = s.point(...centre).z;
                  if (
                    !land(st.join) ||
                    !land(porch) ||
                    !land(gate) ||
                    corn.some(
                      (q) => !land(q) || Math.abs(s.point(...q).z - z) > 1.45,
                    )
                  )
                    continue;

                  // Score: fill main Pedda Veedhi first on BOTH sides around hub, hugging neighbors closely (~15 m) like a real village row!
                  const laneRank =
                      st.laneName === "street"
                        ? 0
                        : st.laneName === "westN" ||
                            st.laneName === "eastS" ||
                            st.laneName === "westS" ||
                            st.laneName === "eastN"
                          ? 10
                          : 24,
                    hubDist = dist(st.join, v.hub),
                    sameSideNeighbors = others.filter(
                      (o) =>
                        dist(o.p, centre) < 23 &&
                        Math.cos(o.a - theta) > 0.75,
                    ).length,
                    acrossStreetNeighbors = others.filter(
                      (o) =>
                        dist(o.p, centre) < 28 &&
                        Math.cos(o.a - theta) < -0.75,
                    ).length,
                    neighborTerm = others.length
                      ? Math.abs(Math.min(nearestCentre, 28) - 15.2) * 1.35 -
                        sameSideNeighbors * 2.2 -
                        acrossStreetNeighbors * 1.8
                      : 0,
                    merit =
                      laneRank +
                      hubDist * 0.26 +
                      (gateDist - 2.25) * 4.5 +
                      neighborTerm +
                      r() * 1.4;

                  options.push({
                    k: st.k,
                    p: centre,
                    gate,
                    porch,
                    join: st.join,
                    a: theta,
                    merit,
                  });
                }
              }
            }
          }

          if (!options.length) {
            if (!others.length || fixed)
              throw Error("No surveyed courtyard for " + row.u);
            continue;
          }
          const h = options.sort((a0, b0) => a0.merit - b0.merit)[0],
            avail = P.field.filter(
              (f) =>
                !taken.has(keyp(f.c)) && (!fixed || keyp(f.c) === keyp(row.c)),
            );
          if (!avail.length)
            throw Error(
              "Explicit acre unavailable in exterior field belt: " + row.u,
            );
          const field = avail
            .slice()
            .sort(
              (a0, b0) =>
                dist(
                  a0.c.map((n) => n + 0.5),
                  h.p,
                ) -
                dist(
                  b0.c.map((n) => n + 0.5),
                  h.p,
                ),
            )[0];
          const ids = new Set(v.paths.map((p) => p.id)),
            tagP = (p) => p.map((x) => x.toFixed(7)).join(","),
            seenSegs = new Set();
          for (const ep of v.paths)
            for (let i = 1; i < ep.xy.length; i++)
              seenSegs.add(
                [tagP(ep.xy[i - 1]), tagP(ep.xy[i])].sort().join(";"),
              );
          function pushDedup(pth) {
            let cur = [pth.xy[0]],
              sub = 0;
            for (let i = 1; i < pth.xy.length; i++) {
              const a0 = pth.xy[i - 1],
                b0 = pth.xy[i];
              if (dist(a0, b0) < 0.001) continue;
              const ek = [tagP(a0), tagP(b0)].sort().join(";");
              if (seenSegs.has(ek)) {
                if (cur.length > 1)
                  v.paths.push({
                    ...pth,
                    id: sub ? `${pth.id}:${sub}` : pth.id,
                    xy: cur,
                  });
                sub++;
                cur = [b0];
              } else {
                seenSegs.add(ek);
                cur.push(b0);
              }
            }
            if (cur.length > 1)
              v.paths.push({
                ...pth,
                id: sub ? `${pth.id}:${sub}` : pth.id,
                xy: cur,
              });
          }
          function ensure(k) {
            if (k === P.hubKey) return;
            const e = P.edge.get(k);
            if (!e) throw Error("unlinked " + k);
            if (ids.has(e.p.id)) return;
            ensure(e.to);
            ids.add(e.p.id);
            pushDedup(e.p);
          }
          ensure(h.k);
          ensure(field.tip);
          // If join lies on an interior vertex of segment h.k (mid-segment station), ensure its segment is already present via ensure(h.k).
          pushDedup({
            id: "lane-" + row.u,
            type: "yard-lane",
            w: 1.08,
            surveyed: true,
            xy: [h.gate, h.porch, h.join],
          });
          pushDedup({
            id: "field-" + row.u,
            type: "field-entry",
            w: 0.9,
            surveyed: true,
            xy: [field.junction, field.land],
          });
          v.homes[row.u] = {
            p: h.p,
            a: h.a,
            c: field.c,
            w,
            d,
            back: +back.toFixed(5),
            front: +adjFront.toFixed(5),
            lot,
            gate: h.gate,
            porch: h.porch,
            join: h.join,
            land: field.land,
          };
          taken.add(keyp(field.c));
          const coords = ll(a.project, field.c[0] + 0.5, field.c[1] + 0.5),
            corners = [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
            ].map(([i, j]) =>
              round(ll(a.project, field.c[0] + i, field.c[1] + j).reverse()),
            ),
            updates = {
              ...(!fixed ? { cell: field.c } : {}),
              homeLocation: h.p,
              acreLocation: field.c,
              villageId: v.id,
            };
          for (const [k, n] of Object.entries({
            lat: +coords[1].toFixed(7),
            lon: +coords[0].toFixed(7),
            corners,
            elevation_m: tiles.at(...field.c).z,
          }))
            if (!new RegExp("^" + k + ":", "m").test(text)) updates[k] = n;
          changes.push([fn, upsertFrontmatter(text, updates)]);
          done = true;
        }
        if (!done)
          throw Error(
            "No safe courtyard available; previous pins were not moved.",
          );
      }
      console.log("Placed", rs.length, "in", district.name);
    }
    for (const [p, t] of changes) await fs.writeFile(p + ".new", t);
    await fs.writeFile(file + ".new", JSON.stringify(plan) + "\n");
    for (const [p] of changes) await fs.rename(p + ".new", p);
    await fs.rename(file + ".new", file);
    console.log("Saved", changes.length, "households.");
  }
} finally {
  await fs.rm(pub, { recursive: true, force: true });
}
