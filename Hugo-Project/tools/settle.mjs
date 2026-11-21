// Permanent square first, then occupied yards and paired fields. Offline; no browser RNG or runtime allocation.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { Tiles, get, key, ll } from "../static/js/grid.js";
import { Surface } from "../static/js/terrain.js";
import { ecology } from "../static/js/ecodata.js";
import { ACRE as M } from "../static/js/metres.js";
const root = fileURLToPath(new URL("../", import.meta.url)),
  pub = await fs.mkdtemp(path.join(os.tmpdir(), "village-square-")),
  file = path.join(root, "data/settlements.json"),
  round = (p) => p.map((x) => +x.toFixed(7)),
  keyp = (p) => p.join(","),
  dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) * M,
  lerp = (a, b, t) => round(a.map((k, i) => k + (b[i] - k) * t)),
  move = (p, x, y) => round([p[0] + x / M, p[1] + y / M]);
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
    lots = [],
    id = (k, i) => k + "/" + i,
    endL = 1 + Math.floor(rand() * (S - 1)),
    endR = 1 + Math.floor(rand() * (S - 1)),
    phase = rand() * 5.7,
    sign = rand() < 0.5 ? -1 : 1;
  function spline(t) {
    const y =
      (1 - t) * endL +
      t * endR +
      Math.sin(t * Math.PI) *
        (0.21 * Math.sin(t * 5.9 + phase) + sign * 0.2 * Math.sin(t * 8.5));
    return world(S * t, y);
  }
  function job(k, f, n, rootAt, rootKey) {
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
          w: k === "street" ? 1.65 : 1.26,
          surveyed: true,
          xy,
        },
      });
      lines.push(...xy.slice(1).map((b, z) => [xy[z], b]));
    }
  }
  job("street", spline, 20, 10);
  const arms = [];
  for (const [k, index, up] of [
    ["grove", 6, 1],
    ["well", 14, 0],
    ["yard", 4, 0],
    ["meadow", 16, 1],
  ]) {
    const x0 = (S * index) / 20,
      y0 =
        endL * (1 - index / 20) +
        (endR * index) / 20 +
        Math.sin((index / 20) * Math.PI) *
          (0.21 * Math.sin((index / 20) * 5.9 + phase) +
            sign * 0.2 * Math.sin((index / 20) * 8.5)),
      B = up ? S - 0.2 : 0.2,
      tw = (rand() - 0.5) * 0.42,
      am = (0.08 + 0.12 * rand()) * (rand() < 0.5 ? -1 : 1),
      f = (t) =>
        world(
          x0 + tw * t + am * Math.sin(t * Math.PI * 1.13),
          y0 + (B - y0) * t,
        );
    job(
      k,
      f,
      Math.max(4, Math.round((Math.abs(B - y0) * M) / 9)),
      0,
      id("street", index),
    );
    arms.push(k);
  }
  const hub = nodes.get("street/10"),
    field = [];
  for (let index = 0; index < v.capacity; index++) {
    const east = ((index >> 1) & 1) === 0,
      outer = !!(index & 1),
      walk = east ? "east" : "west",
      bx = east ? S + 1 : -1,
      head = east ? endR : endL,
      band = index >> 2,
      offset = band % 2 ? -1 - (band >> 1) : band >> 1,
      row = head + offset,
      delta = outer ? (east ? 1 : -1) : east ? -1 : 1,
      fy = row + 0.4 + 0.2 * random(v.id + ":gate:" + walk + ":" + row)(),
      junction = world(bx, fy),
      land = world(bx + (delta * 1.65) / M, fy),
      p = world(bx + delta * 0.5, row + 0.5),
      c = p.map(Math.floor),
      tip = `${walk}/turn`,
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
    mk(
      tip,
      id("street", east ? 20 : 0),
      world(bx, head),
      world(east ? S : 0, head),
    );
    const fk = (y) => `${walk}/gate/${y}`;
    for (let n = 0; n <= Math.abs(offset >= 0 ? offset : offset + 1); n++) {
      const row0 = offset >= 0 ? head + n : head - 1 - n,
        r0 = (r) => r + 0.4 + 0.2 * random(v.id + ":gate:" + walk + ":" + r)(),
        end = n === 0 ? tip : fk(row0 + (offset >= 0 ? -1 : 1));
      mk(fk(row0), end, world(bx, r0(row0)), nodes.get(end));
    }
    field.push({ c, land, junction, tip: fk(row) });
  }
  return { world, nodes, edge, lines, hub, field };
}
function closest(p, a, b) {
  let x = b[0] - a[0],
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
// Conservative oriented metre tests for the very last infill lots. Bounding circles over-reject rectangular yards at oblique angles.
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
  for (const v of plan.villages)
    for (const [u, h] of Object.entries(v.homes)) {
      if (!records.has(u) || keyp(records.get(u).c) !== keyp(h.c))
        throw Error("Missing or changed permanent record " + u);
      used.add(u);
      taken.add(keyp(h.c));
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
        text = await fs.readFile(p, "utf8"),
        u = (
          /^username:\s*[\"']?([\w.]+)/im.exec(text)?.[1] || f.slice(0, -3)
        ).toLowerCase();
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
            const [a, b] = L,
              N = Math.max(1, Math.ceil(dist(a, b) / 4)),
              p = pp(a);
            let last = s.point(...p).z;
            for (let i = 1; i <= N; i++) {
              const t = pp(lerp(a, b, i / N)),
                h = s.point(...t);
              if (h.w >= -0.02) {
                slope = 2;
                break;
              }
              slope = Math.max(slope, Math.abs(h.z - last) / (dist(a, b) / N));
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
        let st;
        for (let i = 0; i < 60; i++) {
          const a = r() * 6.28,
            p = move(tmp.hub, 5.9 * Math.cos(a), 5.9 * Math.sin(a));
          if (
            pat.lines.every(([a, b]) => dist(p, closest(p, a, b)) > 3.1) &&
            land(p)
          ) {
            st = p;
            break;
          }
        }
        if (!st) throw Error("No common shade site");
        tmp.shade = st;
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
      for (const row of rs) {
        let done = false;
        const [fn, text] = fileMap.get(row.u),
          fixed = /^cell:/m.test(text.split("\n---")[0]);
        for (let attempts = 0; attempts < 2 && !done; attempts++) {
          let v = plan.villages
            .filter(
              (q) => q.d === did && Object.keys(q.homes).length < q.capacity,
            )
            .at(-1);
          if (!v || attempts) v = await newSite();
          await study(v.hub);
          const P = pattern(v),
            others = Object.values(v.homes),
            r = random(row.u + ":yard"),
            [w, d] = row.house.size_m,
            back = 1.2 + r() * 0.55,
            lotW = w + 2.2 + r() * 1.85,
            lotD = Math.min(
              299 / lotW,
              Math.max(160 / lotW, d + 5.6 + r() * 2.3),
            ),
            front = lotD - d - back,
            lot = [+lotW.toFixed(3), +lotD.toFixed(3)],
            off =
              row.house.archetype === "l-court"
                ? w * 0.18
                : row.house.archetype === "cattle-compound"
                  ? -0.2 * w
                  : row.house.archetype === "balcony-stair"
                    ? -0.07 * w
                    : 0;
          let options = [];
          // If all short frontages have filled, survey a deeper courtyard before opening an adjacent village. Keep the first pass identical: this never relocates a published pin.
          for (let pass = 0; pass < 2 && !options.length; pass++) {
            for (const [k, p] of P.nodes) {
              if (
                !/^(street|grove|well|yard|meadow)\//.test(k) ||
                k === "street/10" ||
                !P.edge.has(k)
              )
                continue;
              const e = P.edge.get(k),
                b = e.p.xy[1],
                alpha = Math.atan2(b[1] - p[1], b[0] - p[0]);
              for (const sign of [-1, 1])
                for (let trial = 0; trial < (pass ? 18 : 3); trial++) {
                  const dx =
                      alpha +
                      (sign * Math.PI) / 2 +
                      (r() - 0.5) * (pass ? 0.72 : 0.52),
                    theta = +Math.atan2(-Math.cos(dx), Math.sin(dx)).toFixed(7),
                    co = Math.cos(theta),
                    si = Math.sin(theta),
                    l = d / 2 + front + 3 + r() * (pass ? 18 : 6.8),
                    centre = move(
                      p,
                      Math.cos(dx) * l - off * co,
                      Math.sin(dx) * l - off * si,
                    ),
                    pt = (x, y) =>
                      move(centre, x * co + y * si, x * si - y * co),
                    gate = pt(off, d / 2 + front),
                    porch = pt(off, d / 2 + front + 1.42),
                    corn = [
                      [-lot[0] / 2, -d / 2 - back],
                      [lot[0] / 2, -d / 2 - back],
                      [-lot[0] / 2, d / 2 + front],
                      [lot[0] / 2, d / 2 + front],
                    ].map((q) => pt(...q));
                  if (
                    corn.some((q) =>
                      q.some(
                        (a, i) =>
                          a <= v.square.sw[i] + 0.015 ||
                          a >= v.square.sw[i] + v.square.side - 0.015,
                      ),
                    ) ||
                    dist(v.hub, centre) < 13.0 ||
                    dist(v.shade, centre) < 13.5
                  )
                    continue;
                  const safe = Math.hypot(...lot) * 0.5 + 1.35;
                  const proposed = { p: centre, a: theta, lot, d, back, front };
                  if (
                    pass
                      ? P.lines.some(([a, b]) =>
                          inYardSegment(proposed, a, b, 2.05),
                        )
                      : P.lines.some(
                          ([a, b]) =>
                            dist(centre, closest(centre, a, b)) < safe,
                        )
                  )
                    continue;
                  const near = others.length
                    ? Math.min(...others.map((h) => dist(h.p, centre)))
                    : 24;
                  if (
                    pass
                      ? others.some(
                          (h) =>
                            dist(h.p, centre) < 20 ||
                            corn.some((a, i) =>
                              inYardSegment(h, a, corn[(i + 1) % 4], 3.1),
                            ) ||
                            inYardSegment(h, p, gate, 1.85) ||
                            inYardSegment(proposed, h.gate, h.join, 1.85),
                        )
                      : others.some(
                          (h) =>
                            dist(h.p, centre) <
                              safe + Math.hypot(...h.lot) * 0.5 + 1.55 ||
                            dist(h.p, closest(h.p, p, gate)) <
                              Math.hypot(...h.lot) * 0.53 + 0.6 ||
                            dist(centre, closest(centre, h.gate, h.join)) <
                              safe,
                        )
                  )
                    continue;
                  if (
                    !pass &&
                    v.paths.some(
                      (l) =>
                        l.type === "yard-lane" &&
                        l.xy.some((q) => dist(q, centre) < safe),
                    )
                  )
                    continue;
                  const z = s.point(...centre).z;
                  if (
                    corn.some(
                      (q) => !land(q) || Math.abs(s.point(...q).z - z) > 1.45,
                    )
                  )
                    continue;
                  options.push({
                    k,
                    p: centre,
                    gate,
                    porch,
                    join: p,
                    a: theta,
                    merit:
                      dist(centre, v.hub) * 0.28 +
                      Math.abs(near - 25) * 0.94 +
                      r() * 13,
                  });
                }
            }
          }
          if (!options.length) {
            if (!others.length || fixed)
              throw Error("No surveyed courtyard for " + row.u);
            continue;
          }
          const h = options.sort((a, b) => a.merit - b.merit)[0],
            avail = P.field.filter(
              (f) =>
                !taken.has(keyp(f.c)) && (!fixed || keyp(f.c) === keyp(row.c)),
            );
          if (!avail.length)
            throw Error(
              "Explicit acre unavailable in exterior field belt: " + row.u,
            );
          const field =
            avail.find(
              (q) =>
                dist(
                  q.c.map((n) => n + 0.5),
                  h.p,
                ) >= 109 &&
                dist(
                  q.c.map((n) => n + 0.5),
                  h.p,
                ) <= 492,
            ) || avail[0];
          const ids = new Set(v.paths.map((p) => p.id));
          function ensure(k) {
            if (k === "street/10") return;
            const e = P.edge.get(k);
            if (!e) throw Error("unlinked " + k);
            if (ids.has(e.p.id)) return;
            ensure(e.to);
            ids.add(e.p.id);
            v.paths.push(e.p);
          }
          ensure(h.k);
          ensure(field.tip);
          v.paths.push(
            {
              id: "lane-" + row.u,
              type: "yard-lane",
              w: 1.04,
              surveyed: true,
              xy: [h.gate, h.porch, h.join],
            },
            {
              id: "field-" + row.u,
              type: "field-entry",
              w: 0.9,
              surveyed: true,
              xy: [field.junction, field.land],
            },
          );
          v.homes[row.u] = {
            p: h.p,
            a: h.a,
            c: field.c,
            w,
            d,
            back: +back.toFixed(5),
            front: +front.toFixed(5),
            lot,
            gate: h.gate,
            porch: h.porch,
            join: h.join,
            land: field.land,
          };
          taken.add(keyp(field.c));
          const end = text.indexOf("\n---", 4),
            coords = ll(a.project, field.c[0] + 0.5, field.c[1] + 0.5),
            corners = [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
            ].map(([i, j]) =>
              round(ll(a.project, field.c[0] + i, field.c[1] + j).reverse()),
            );
          let fields = {
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
            if (!new RegExp("^" + k + ":", "m").test(text)) fields[k] = n;
          changes.push([
            fn,
            text.slice(0, end) +
              "\n" +
              Object.entries(fields)
                .map(([k, v]) => k + ": " + JSON.stringify(v))
                .join("\n") +
              text.slice(end),
          ]);
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
    console.log("Saved", changes.length, "new households.");
  }
} finally {
  await fs.rm(pub, { recursive: true, force: true });
}
