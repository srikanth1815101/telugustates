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
import { models, residentDesign } from "../static/js/resident-design.js";
import { buildRoom, doorLeaf } from "../static/js/home-interior.js";
import { pathIndex } from "../static/js/path-right-of-way.js";
import { yards } from "../static/js/timber-yard.js";
import { fenceAt } from "../static/js/acre-edge.js";
import { passes, support } from "../static/js/contacts.js";
import { WalkMotor } from "../static/js/walk-motor.js";
import { Surface, chunk } from "../static/js/terrain.js";
import { ecology } from "../static/js/ecodata.js";
import { preparePads, residents } from "../static/js/resident-scene.js";
import { compoundWallSegments } from "../static/js/resident-forms.js";
import { nameboardSpot } from "../static/js/nameboard.js";
import { residentId } from "../static/js/resident-id.js";
import { marks, updateRouteLeaves } from "../static/js/hamlet-scene.js";
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
    let key = h.centre.map((t) => Math.floor(t / 64)).join(",");
    (group.get(key) || group.set(key, []).get(key)).push([
      x,
      y,
      u,
      h.style,
      0,
      h,
    ]);
    const ys = yards(ff, rows, { x: x + 0.5, y: y + 0.5 }, asset, 0),
      stones = new Set(ys.userData.stones.map((p) => p.join(",")));
    assert.equal(ys.userData.blocks.length, 0);
    assert.equal(ys.userData.edges, 0);
    assert(!ys.children.some((o) => o.userData.role === "acre-timber"));
    for (const pt of [
      [x, y],
      [x + 1, y],
      [x + 1, y + 1],
      [x, y + 1],
    ])
      assert(stones.has(pt.join(",")), u + " missing surveyed stone");
    ys.traverse((o) => {
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
  // Synthetic obstacles stay vaultable. There are intentionally NO live field rails.
  const bs = [
      [1, 0, 1, 0.3],
      [1, 0.51, 1, 0.63],
      [1, 0.84, 1, 1],
    ].map(([x, y, X, Y]) => [
      x,
      y,
      X,
      Y,
      sim.ground(x, y) + 0.97,
      sim.ground(X, Y) + 0.97,
    ]),
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
  // Verify every home gets a valid @username nameboard spot, full browser-side residents()/nameboard()/marks() build cleanly without throwing, and compound walls block walking, jump cleanly, and leave the gate open.
  const prevDoc = globalThis.document;
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            createLinearGradient: () => ({ addColorStop() {} }),
            fillRect() {},
            strokeRect() {},
            measureText: (txt) => ({ width: String(txt).length * 36 }),
            fillText() {},
          };
        },
      };
    },
  };
  try {
    const domSim = {
      ...ff,
      t: { at: () => ({ z: 0 }) },
      ground: () => 0,
      xyz: (x, y, z) => [x * M, z, -y * M],
    };
    for (const r of rows) {
      const h = r[5],
        u = r[2],
        nb = nameboardSpot(h);
      assert(
        nb && Number.isFinite(nb.gx) && Number.isFinite(nb.gy) && nb.boardW >= 1.84,
        u + " missing nameboard spot",
      );
      const grp = residents(domSim, [r], { x: h.centre[0], y: h.centre[1] }, 0);
      assert.equal(
        grp.userData.names?.length,
        1,
        u + " did not render house nameboard",
      );
      assert(
        grp.userData.names[0].label === h.sign.label &&
          !grp.userData.names[0].label.startsWith("@") &&
          grp.userData.names[0].label !== u,
        u + " nameboard should display house/nick name instead of @id",
      );
      grp.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose?.();
      });
    }
    const sampleRow = rows[0],
      route = {
        xy: [
          sampleRow[5].centre,
          [sampleRow[5].centre[0] + 0.4, sampleRow[5].centre[1] + 0.3],
        ],
        forks: [8],
      },
      mk = marks(
        domSim,
        { c: [sampleRow[0], sampleRow[1]], house: sampleRow[5] },
        "home",
        route,
      );
    assert(
      mk.children.some((c) => c.userData?.role === "walking-waymarks"),
      "expected walking-waymarks leaf mesh",
    );
    updateRouteLeaves(route, 0.5);
    mk.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose?.();
    });
  } finally {
    globalThis.document = prevDoc;
  }
  const walledHome = rows.find((r) => r[5]?.yard)?.[5];
  assert(walledHome, "expected walled village home");
  {
    const { fx, fy } = basis(walledHome),
      [, d] = walledHome.size_m,
      halfW = walledHome.yard.lot[0] * 0.5 - 0.16,
      frontExt = d * 0.5 + walledHome.yard.front - 0.16,
      gapLo = Math.max(-halfW + 0.42, walledHome.door_x - 1.75),
      gapHi = Math.min(halfW - 0.42, walledHome.door_x + 1.75),
      wingX =
        halfW - gapHi >= gapLo - -halfW
          ? (gapHi + halfW) * 0.5
          : (-halfW + gapLo) * 0.5,
      flatSim = {
        ...ff,
        ground: () => 0,
        sample: () => ({ z: 0, depth: 0, drawn: true, line: 0, m: [0, 0, 0, 0] }),
      },
      cWalls = compoundWallSegments(flatSim, walledHome),
      allowWall = (...v) => passes(flatSim, cWalls, [], [], ...v);
    assert(cWalls.length >= 5, "compound wall segments");
    for (const [label, lx, jump] of [
      ["compound wall blocks walking", wingX, false],
      ["compound wall jump", wingX, true],
      ["compound gate open", walledHome.door_x, false],
    ]) {
      const [sx, sy] = localPoint(walledHome, lx, frontExt + 1.9),
        m = new WalkMotor();
      m.reset(sx, sy, flatSim);
      for (let i = 0; i < 200; i++) {
        const distToWall =
          ((m.x - walledHome.centre[0]) * fx +
            (m.y - walledHome.centre[1]) * fy) *
            M -
          frontExt;
        if (jump && !m.jumps && distToWall < 1.32) {
          m.jump();
          m.releaseJump();
        }
        m.advance(1 / 60, -fx, -fy, 2.5, flatSim, allowWall, 0.92);
      }
      const finalZ =
        ((m.x - walledHome.centre[0]) * fx +
          (m.y - walledHome.centre[1]) * fy) *
        M;
      if (label === "compound wall blocks walking") {
        assert(finalZ > frontExt + 0.35 && m.blocked, label + " " + finalZ);
      } else {
        assert(finalZ < frontExt - 1.2, label + " " + finalZ);
      }
    }
  }
  const tiles = new Tiles(a),
    eco = await ecology(),
    O = { x: a.project.cols / 2, y: a.project.rows / 2, z: 0 },
    mats = { land: material, water: material },
    profile = await get("library/walk/ground_pathStraight.json");
  function meshTests(s, gr, mes, ray) {
    const rc = new T.Raycaster();
    mes.forEach((m) => m.updateMatrixWorld(true));
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
            const k = rc.intersectObjects(mes, false)[0];
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
    const demoTarget = residentId("telugustates.csrgo"),
      detail =
        gr.find((r) => r[2] === demoTarget) || (!q.groundRays ? gr[0] : null);
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
      const neighbourhood = new Set([id]);
      for (const r of g) {
        const h = r[5];
        for (const i of [-0.5, 0.5])
          for (const j of [-0.5, 0.5])
            neighbourhood.add(
              localPoint(h, i * h.size_m[0], j * h.size_m[1])
                .map((v) => Math.floor(v / 64))
                .join(","),
            );
      }
      const obs = [...neighbourhood].map((k) =>
        chunk(s, ...k.split(",").map(Number), 1, mats, true),
      );
      meshTests(
        s,
        g,
        obs.map((b) => b.children[0]),
        ray,
      );
      obs.forEach((b) => b.traverse((o) => o.geometry?.dispose()));
    }
    q.terraces += gr.length;
  }
  assert(
    q.terraces === rows.length &&
      q.rooms === rows.length &&
      q.heightError < 0.002 &&
      q.groundRayError < 0.003,
  );

  q.profiles = Object.fromEntries([...byShell].map(([k, v]) => [k, v.size]));
  const syntheticLayouts = new Set(),
    syntheticByShell = new Map(),
    facings = ["north", "east", "south", "west"];
  for (let i = 0; i < 144; i++) {
    const uid = residentId(`archetype_probe_${i}`),
      arch = models[i % models.length],
      designed = residentDesign({
        u: uid,
        c: [2344 + (i % 7), 7759 + Math.floor(i / 7)],
        d: 32,
        house: {
          seed: ((i + 1) * 2654435761) >>> 0,
          archetype: arch,
          facing: facings[i % 4],
          setback_m: 8.5,
          // catalog.html defaults this on every real row; a probe that omits
          // it would compute NaN centre and hide the omission.
          lateral_m: 0,
          path_width_m: 1.2,
          wall_color: "#d8c3a5",
          roof_color: "#b06b49",
          size_m: [
            9.6 + ((i * 7) % 19) * 0.14,
            10.2 + ((i * 11) % 17) * 0.14,
            3.9 + ((i * 5) % 13) * 0.18,
          ],
          props: ["shade-tree"],
          sign: { label: `Probe${i}` },
        },
      }),
      plan = roomPlan(designed.house),
      set = syntheticByShell.get(arch) || new Set();
    syntheticLayouts.add(plan.design.style);
    set.add(plan.design.style);
    syntheticByShell.set(arch, set);
  }
  assert(
    rows.length >= 1 &&
      profiles.size === rows.length &&
      q.furniturePieces === rows.length * 3 &&
      syntheticLayouts.size === 11 &&
      syntheticByShell.size === models.length &&
      [...syntheticByShell.values()].every((v) => v.size >= 3),
  );
  q.uniquePlans = profiles.size;
  console.log(JSON.stringify(q, null, 1));
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}
