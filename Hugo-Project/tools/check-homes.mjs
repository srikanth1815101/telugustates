// Offline geometric interactions, not screenshot assertions. A temporary Hugo render keeps the source tree clean.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import * as T from "../static/vendor/three.module.min.js";
import { get, Tiles, key } from "../static/js/grid.js";
import { basis, localPoint, ACRE as M, RAIL_END } from "../static/js/metres.js";
import {
  roomPlan,
  roomLocal,
  doorPoint,
  insideRoom,
  houseBlocked,
} from "../static/js/home-volume.js";
import { buildRoom, doorLeaf } from "../static/js/home-interior.js";
import { pathIndex } from "../static/js/path-right-of-way.js";
import { yards } from "../static/js/timber-yard.js";
import { fenceAt } from "../static/js/acre-edge.js";
import { passes, support } from "../static/js/contacts.js";
import { WalkMotor } from "../static/js/walk-motor.js";
import { Surface, chunk } from "../static/js/terrain.js";
import { ecology } from "../static/js/ecodata.js";
import { preparePads } from "../static/js/resident-scene.js";
import { Tread } from "../static/js/tread.js";
const root = fileURLToPath(new URL("../", import.meta.url)),
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-homes-")),
  q = {
    models: [],
    layouts: {},
    profiles: {},
    furniturePieces: 0,
    stableRooms: 0,
    rooms: 0,
    terraces: 0,
    heightError: 0,
    groundRays: 0,
    groundRayError: 0,
    edges: 0,
    crossings: 0,
    extraOpenings: 0,
    shared: 0,
    oblique: 0,
    railSamples: 0,
    examples: [],
    jumps: [],
  };
try {
  execFileSync("hugo", ["--source", root, "--destination", tmp, "--minify"]);
  globalThis.fetch = async (u) =>
    new Response(
      await fs.readFile(
        path.join(
          tmp,
          path.relative(path.join(root, "static"), fileURLToPath(u)),
        ),
      ),
    );
  const a = await get("data/atlas.json"),
    rows = (
      await Promise.all(a.plots.map((k) => get(`data/plots/${k}.json`)))
    ).flat(),
    paths = [
      ...(
        await Promise.all(
          a.districts.map((d) => get(`living/public/villages/${d.id}.json`)),
        )
      ).flatMap((v) => v.paths),
      ...(await get("living/trails.json")),
    ],
    ways = pathIndex(paths),
    asset = { fence_simple: await get("library/walk/fence_simple.json") },
    ff = {
      ground: () => 0,
      xyz: (x, y, z) => [x * M, z, -y * M],
      sample: () => ({ drawn: true, z: 0, depth: 0, line: 0 }),
      traversable: () => true,
      ways,
    };
  const shapes = {
      slab: new T.BoxGeometry(),
      disc: new T.CylinderGeometry(0.5, 0.5, 1, 8),
      orb: new T.IcosahedronGeometry(0.5, 0),
      pot: new T.CylinderGeometry(0.5, 0.5, 1, 16),
      "round-floor": new T.CylinderGeometry(0.5, 0.5, 1, 16).rotateY(
        Math.PI / 16,
      ),
    },
    material = new T.MeshBasicMaterial(),
    edges = new Map(),
    ptId = (x, y, along) => [x, y, +along].join("/"),
    group = new Map();
  const profiles = new Set(),
    byShell = new Map();
  for (const [x, y, u, , , h] of rows) {
    const p = roomPlan(h),
      { fx, fy } = basis(h),
      door = doorPoint(h);
    const d = p.design,
      copy = roomPlan(structuredClone(h));
    assert.deepEqual(copy.design, d, u + " unstable room");
    q.stableRooms++;
    assert.equal(p.furniture.length, 3, u + " missing activity furniture");
    const sig = JSON.stringify([
      d.style,
      d.composition,
      d.palette[0],
      d.rug,
      d.beam,
      d.lamp,
      d.wall,
      p.furniture.map((o) => [
        o.kind,
        +o.x.toFixed(2),
        +o.z.toFixed(2),
        o.angle,
      ]),
    ]);
    assert(!profiles.has(sig));
    profiles.add(sig);
    (
      byShell.get(h.archetype) ||
      byShell.set(h.archetype, new Set()).get(h.archetype)
    ).add(d.style);
    for (const f of p.furniture) {
      q.furniturePieces++;
      assert(
        houseBlocked(h, ...localPoint(h, f.x, f.z), true),
        u + " missing furniture collider",
      );
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          assert(
            insideRoom(p, f.x + (sx * f.w) / 2, f.z + (sz * f.d) / 2, 0.15),
            u + " furniture protrudes",
          );
    }
    q.layouts[d.style] = (q.layouts[d.style] || 0) + 1;
    assert(p.dh >= 1.86 && p.dw >= 1.25, u + " door headroom");
    const room = new T.Group();
    buildRoom(h, (role, shape, x, y, z, w, H, d, c, ang = 0) => {
      const m = new T.Mesh(shapes[shape], material);
      m.scale.set(w, H, d);
      m.rotation.y = ang;
      m.position.set(x, y, z);
      room.add(m);
    });
    room.updateMatrixWorld(true);
    // The ray goes through the actual aperture from outside at eye height. It must hit the back of this room, not a box behind the door.
    const sight = new T.Raycaster(
        new T.Vector3(p.door, p.floor + 1.55, p.front + 0.26),
        new T.Vector3(0, 0, -1),
        0,
        p.d + 2,
      ),
      hit = sight.intersectObjects(room.children)[0];
    assert(!hit || hit.distance > 1.75, `${u} solid front ${hit?.distance}`);
    sight.ray.origin.y = p.floor + 0.65;
    assert(
      sight.intersectObjects(room.children).some((k) => k.distance > 1.75),
      u + " missing back wall",
    );
    const ground = new T.Raycaster(
      new T.Vector3(p.door, 1.5, p.front - 0.68),
      new T.Vector3(0, -1, 0),
    );
    assert(
      Math.abs(ground.intersectObjects(room.children)[0].point.y - p.floor) <
        0.025,
      u + " drawn floor",
    );
    const leaf = doorLeaf(ff, h, u);
    leaf.updateMatrixWorld(true);
    const pt = localPoint(h, p.door, p.front + 0.31),
      ray = new T.Raycaster(
        new T.Vector3(pt[0] * M, 1.55, -pt[1] * M),
        new T.Vector3(-fx, 0, fy),
        0,
        1.2,
      );
    assert(ray.intersectObject(leaf).length, u + " missed closed door");
    leaf.userData.hinge.rotation.y = 1.52;
    leaf.updateMatrixWorld(true);
    assert(!ray.intersectObject(leaf).length, u + " door did not open");
    leaf.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    for (let z = -1.4; z <= 1.5; z += 0.05)
      assert(
        !houseBlocked(h, ...doorPoint(h, z), true),
        `${u} open strip ${z}`,
      );
    assert(
      houseBlocked(h, ...door, true) === false &&
        houseBlocked(h, ...door, false),
      u,
    );
    assert(houseBlocked(h, ...localPoint(h, p.cx - p.a, p.cz), true), "side");
    q.rooms++;
    if (!q.models.includes(h.archetype)) q.models.push(h.archetype);
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const X = x + (dx > 0),
        Y = y + (dy > 0),
        along = !!dy,
        k = ptId(X, Y, along),
        e = edges.get(k) || { X, Y, along, owners: [], gates: [] };
      e.owners.push(u);
      if (dx === fx && dy === fy) e.gates.push(h.gate[along ? 0 : 1]);
      edges.set(k, e);
    }
    let k = [Math.floor(x / 64), Math.floor(y / 64)].join(",");
    (group.get(k) || group.set(k, []).get(k)).push([x, y, u, h.style, 0, h]);
  }
  q.edges = edges.size;
  const tested = new Set();
  for (const row of rows) {
    if (tested.has(row[2])) continue;
    const [xx, yy] = row,
      near = rows.filter(([x, y]) => Math.hypot(x - xx, y - yy) < 4.9);
    const origin = { x: xx + 0.5, y: yy + 0.5 }; // centred floating frame; real transformed rail/post vertices
    const s = { ...ff, xyz: (x, y, z) => [(x - xx) * M, z, -(y - yy) * M] },
      g = yards(s, rows, origin, asset, 0),
      blocks = g.userData.blocks;
    for (const r of near) tested.add(r[2]);
    const geo = g.children[0].geometry.attributes.position;
    for (let i = 0; i < geo.count; i += 3) {
      assert(
        ways.clear(xx + geo.getX(i) / M, yy - geo.getZ(i) / M, -0.5),
        "timber intrudes on road",
      );
      q.railSamples++;
    }
    for (const [x, y] of g.userData.stones)
      assert(ways.clear(x, y, 0.2), "corner stone on road");
    for (const e of edges.values()) {
      const { X, Y, along, owners, gates } = e;
      if (
        e.checked ||
        !owners.every((u) => g.userData.near.some((v) => v.u === u))
      )
        continue;
      e.checked = true;
      const once = new Set();
      for (const seg of new Set([
        ...ways.near(X, Y),
        ...ways.near(X + (along ? 1 : 0), Y + (along ? 0 : 1)),
      ])) {
        const { a, b, r } = seg,
          i = along ? 1 : 0,
          j = 1 - i,
          delta = b[i] - a[i];
        if (Math.abs(delta) < 1e-10) continue;
        const t = ((along ? Y : X) - a[i]) / delta;
        if (t < -0.00001 || t > 1.00001) continue;
        const c = a[j] + t * (b[j] - a[j]),
          v = c - (along ? X : Y);
        if (v < 0 || v > 1) continue;
        const pos = along ? [c, Y] : [X, c],
          sig = pos.map((a) => a.toFixed(5)).join(",");
        if (once.has(sig)) continue;
        once.add(sig);
        for (const k of [-1, -0.5, 0, 0.5, 1]) {
          const d = (k * (r - 0.88)) / M;
          assert(
            !fenceAt(
              blocks,
              pos[0] + (along ? d : 0),
              pos[1] + (along ? 0 : d),
            ),
            `road width ${owners} ${sig}`,
          );
        }
        q.crossings++;
        if (owners.length > 1) q.shared++;
        if (
          Math.min(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) /
            Math.hypot(b[0] - a[0], b[1] - a[1]) >
          0.24
        )
          q.oblique++;
        if (gates.every((g) => Math.abs(c - g) * M > RAIL_END)) {
          q.extraOpenings++;
          if (q.examples.length < 5 || owners.includes("demo_user134"))
            q.examples.push({ owners, pos, a, b });
        }
      }
    }
    g.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
  }
  // A shared fence with a parallel road shoulder, a diagonal intersection and an untouched span. Run real motor substeps over the real tops on a grade.
  const pair = rows
      .slice(0, 2)
      .map((r, k) => [
        k,
        0,
        "test" + k,
        0,
        0,
        { ...r[5], facing: "north", gate: [k + 0.5, 1] },
      ]),
    road = [
      {
        w: 1.9,
        xy: [
          [0.7, 0.22],
          [1.3, 0.58],
        ],
      },
      {
        w: 1.1,
        xy: [
          [0.99, 0.67],
          [0.99, 0.8],
        ],
      },
    ],
    sim = {
      ...ff,
      ways: pathIndex(road),
      ground: (x, y) => (x - 1) * M * 0.07 + (y - 0.43) * M * 0.09,
    };
  sim.sample = (x, y) => ({
    z: sim.ground(x, y),
    depth: 0,
    drawn: true,
    line: 0,
    m: [0, 0, 0, 0],
  });
  const fence = yards(sim, pair, { x: 1, y: 0.5 }, asset, 1),
    bs = fence.userData.blocks,
    allow = (...v) => passes(sim, bs, [], [], ...v);
  assert(!fenceAt(bs, 1, 0.74));
  for (const [name, Y, jump] of [
    ["diagonal gap", 0.4, false],
    ["parallel gap", 0.73, false],
    ["rail blocks walking", 0.13, false],
    ["rail jump", 0.13, true],
  ]) {
    const m = new WalkMotor();
    m.reset(1 - 1.8 / M, Y, sim);
    let prev,
      over = [],
      peak = 0;
    for (let i = 0; i < 230; i++) {
      if (jump && !m.jumps && m.x > 1 - 1.28 / M) {
        m.jump();
        m.releaseJump();
      }
      prev = m.x;
      m.advance(1 / 60, 1, 0, 2.5, sim, allow, 0.92);
      peak = Math.max(peak, m.air);
      if (prev < 1 && m.x >= 1) over.push(m.air);
    }
    const cross = (m.x - 1) * M;
    assert(
      name === "rail blocks walking"
        ? cross < -0.4 && m.blocked
        : cross > 1.5 && over.length === 1,
      name + " " + cross,
    );
    if (jump) assert(m.lands && over[0] > 0.95);
    q.jumps.push({
      name,
      crossed: cross > 0,
      feetAtLine: over[0] || 0,
      peak,
      landed: !!m.lands,
    });
  }
  const tiles = new Tiles(a),
    eco = await ecology(),
    O = { x: a.project.cols / 2, y: a.project.rows / 2, z: 0 },
    mats = { land: material, water: material },
    profile = await get("library/walk/ground_pathStraight.json");
  function meshTests(s, gr, mes, ray) {
    const rc = new T.Raycaster();
    mes.updateMatrixWorld(true);
    for (const [x, y, u, , , h] of gr) {
      const [w, d] = h.size_m,
        z = s.ground(...h.centre);
      for (let i = 0; i <= 6; i++)
        for (let j = 0; j <= 6; j++) {
          const [X, Y] = localPoint(h, w * (i / 6 - 0.5), d * (j / 6 - 0.5)),
            p = s.sample(X, Y);
          assert(p.drawn, u + " has no ground");
          q.heightError = Math.max(q.heightError, Math.abs(p.z - z));
          if (ray) {
            const [a, b, c] = s.xyz(X, Y, z + 12);
            rc.set(new T.Vector3(a, b, c), new T.Vector3(0, -1, 0));
            const k = rc.intersectObject(mes)[0];
            assert(k, u);
            q.groundRayError = Math.max(
              q.groundRayError,
              Math.abs(k.point.y - p.z),
            );
            q.groundRays++;
          }
        }
    }
  }
  for (const [id, gr] of group) {
    const [cx, cy] = id.split(",").map(Number),
      x = cx * 64 + 32,
      y = cy * 64 + 32,
      ks = new Set();
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) ks.add(key(x + i * 90, y + j * 90));
    await Promise.all([...ks].map((k) => tiles.load(k)));
    tiles.trim(ks);
    const detail =
      gr.find((r) => r[2] === "demo_user134") || (!q.groundRays ? gr[0] : null);
    for (const [focus, survey, g, ray] of [
      [[x + 20, y - 18], true, gr, false],
      ...(detail
        ? [
            [detail[5].centre, false, [detail], true],
            [[detail[0] + 8.2, detail[1] + 0.5], false, [detail], true],
            [[detail[0] + 0.5, detail[1] + 0.5], true, [detail], true],
          ]
        : []),
    ]) {
      const s = new Surface(tiles, O, focus);
      s.focus = focus;
      s.ec = eco;
      s.surveyGrid = survey;
      s.relief = 2;
      s.tread = new Tread(paths, profile, focus);
      preparePads(s, gr);
      const ob = chunk(s, cx, cy, 1, mats, true);
      meshTests(s, g, ob.children[0], ray);
      ob.traverse((o) => o.geometry?.dispose());
    }
    q.terraces += gr.length;
  }
  assert(
    q.terraces === rows.length &&
      q.rooms === rows.length &&
      q.heightError < 0.002 &&
      q.groundRayError < 0.003,
  );
  assert([...edges.values()].every((e) => e.checked));
  q.profiles = Object.fromEntries([...byShell].map(([k, v]) => [k, v.size]));
  assert(
    Object.keys(q.layouts).length === 11 &&
      [...byShell.values()].every((v) => v.size >= 3) &&
      profiles.size === 300 &&
      q.furniturePieces === 900,
  );
  q.uniquePlans = profiles.size;
  console.log(JSON.stringify(q, null, 1));
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}
