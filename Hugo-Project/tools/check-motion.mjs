import assert from "node:assert/strict";
import fs from "node:fs/promises";
import * as T from "../static/vendor/three.module.min.js";
import { loadPeople } from "../static/js/art-library.js";
import { traveller } from "../static/js/traveller.js";
import { followCamera } from "../static/js/walk-camera.js";
import { ACRE } from "../static/js/metres.js";
import { curvedPoints } from "../static/js/curves.js";
import { Catchment } from "../static/js/catchment.js";
globalThis.fetch = async (url) => new Response(await fs.readFile(new URL(url)));
await loadPeople();
let report = { rigs: {}, obstruction: [], curves: {}, runoff: {} };
for (const style of ["man", "woman"]) {
  const w = traveller(style),
    M = w.mesh,
    B = M.skeleton.bones,
    ix = ["L", "R"].map((side) =>
      ["UpperLeg", "LowerLeg", "Foot"].map((n) =>
        B.findIndex((b) => b.name === n + side),
      ),
    ),
    v = new T.Vector3(),
    bind = ix.map((a) =>
      [0, 1].map((j) => B[a[j]].position.distanceTo(B[a[j + 1]].position)),
    ),
    a = M.geometry.attributes,
    boots = ix.map(([, , f]) =>
      Array.from({ length: a.position.count }, (_, i) => i).filter(
        (i) => a.skinIndex.getX(i) === f,
      ),
    );
  let lengthError = 0,
    idleGap = 0,
    frames = 0,
    clips = new Set(),
    rests = [],
    idleMovement = 0,
    contacts = 0,
    maxFootPen = 0,
    restSamples = [];
  const ground = ([x, z]) =>
    x * 0.32 + z * 0.17 + Math.sin(x * 1.7 + z * 0.8) * 0.053;
  for (let i = 0; i < 420; i++) {
    const t = i / 60,
      speed = t < 1.9 ? 0 : t < 3.5 ? 1.55 : t < 5.8 ? 3.85 : 0,
      z =
        -Math.max(0, Math.min(t - 1.9, 1.6)) * 1.55 -
        Math.max(0, Math.min(t - 3.5, 2.3)) * 3.85,
      air =
        t > 4.1 && t < 4.7 ? Math.sin(((t - 4.1) / 0.6) * Math.PI) * 0.54 : 0,
      root = ground([0, z]);
    w.pose({
      dt: 1 / 60,
      vel: speed,
      swim: false,
      ground,
      root,
      at: [0, z],
      yaw: 0,
      air,
      vertical: t < 4.4 ? 1.6 : -1.3,
      idleTime: t,
      climb: 0.2,
      reduced: false,
    });
    const m = w.metrics();
    clips.add(m.clip);
    contacts = m.contacts;
    frames++;
    for (let side = 0; side < 2; side++) {
      for (let k = 0; k < 2; k++) {
        const [a, b] = ix[side].slice(k);
        lengthError = Math.max(
          lengthError,
          Math.abs(B[a].position.distanceTo(B[b].position) - bind[side][k]),
        );
      }
      if (!(i % 12) && air === 0) {
        let gap = Infinity;
        for (const j of boots[side]) {
          M.getVertexPosition(j, v);
          gap = Math.min(gap, root + v.y - ground([v.x, z + v.z]));
        }
        if (speed === 0) {
          idleGap = Math.max(idleGap, Math.abs(gap));
          restSamples.push(+gap.toFixed(5));
        }
        if (m.feet[side].stance) maxFootPen = Math.max(maxFootPen, -gap);
      }
    }
    if (t < 1.9) {
      if (!rests.length)
        rests = [...B[5].position.toArray(), ...B[9].quaternion.toArray()];
      idleMovement = Math.max(
        idleMovement,
        Math.hypot(
          ...[...B[5].position.toArray(), ...B[9].quaternion.toArray()].map(
            (x, j) => x - rests[j],
          ),
        ),
      );
    }
  }
  report.rigs[style] = {
    frames,
    lengthError,
    idleGap,
    maxFootPen,
    idleMovement,
    clips: [...clips],
    contacts,
  };
  assert(
    lengthError < 1e-8 &&
      idleGap < 0.045 &&
      maxFootPen < 0.055 &&
      idleMovement > 0.005 &&
      clips.has("walk") &&
      clips.has("run"),
  );
  w.dispose();
}
const S = {
  worldXYZ: (x, y, z) => [x * ACRE, z, -y * ACRE],
  sample: (x, y) => ({ z: 0, line: 0, depth: 0, drawn: true }),
  ground: () => 0,
};
for (const [name, objects, fences] of [
  [
    "wall-of-rocks",
    Array.from({ length: 17 }, (_, i) => [
      ((i - 8) * 0.4) / ACRE,
      -0.78 / ACRE,
      0.66 / ACRE,
      3.2,
    ]),
    [],
  ],
  ["rail", [], [[-0.5, -0.012, 0.5, -0.012]]],
  [
    "two-sides",
    [
      [0, -1 / ACRE, 1 / ACRE, 3],
      [-0.9 / ACRE, 0, 0.8 / ACRE, 3],
      [0.9 / ACRE, 0, 0.8 / ACRE, 3],
    ],
    [],
  ],
]) {
  let cam = new T.PerspectiveCamera(58, 1.6, 0.1, 1800),
    state = {},
    min = 99,
    minBody = 99,
    escape = 0;
  for (let i = 0; i < 100; i++) {
    const r = followCamera(cam, state, {
      s: S,
      x: 0,
      y: 0,
      root: 0,
      yaw: Math.sin(i * 0.1) * 0.48,
      pitch: 0.035,
      distance: 4.6,
      eye: 1.62,
      step: 1 / 45,
      reset: i === 0,
      objects,
      homes: [],
      fences,
      first: false,
    });
    min = Math.min(min, r.arm);
    let b = cam.position;
    minBody = Math.min(
      minBody,
      Math.hypot(b.x, b.z, b.y - Math.max(0.15, Math.min(1.8, b.y))),
    );
    if (r.escape) escape++;
  }
  report.obstruction.push({ name, minArm: min, minBody, escape });
  assert(min > 1.9 && minBody > 1.0 && escape > 0);
}
const curve = curvedPoints(
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [1.9, 1.12],
  ],
  "gate-to-forest",
);
const angles = curve
  .slice(1)
  .map(([x, y], i) => Math.atan2(y - curve[i][1], x - curve[i][0]));
const maxTurn = Math.max(
  ...angles
    .slice(1)
    .map((a, i) =>
      Math.abs(Math.atan2(Math.sin(a - angles[i]), Math.cos(a - angles[i]))),
    ),
);
report.curves = {
  samples: curve.length,
  maxTurnDeg: (maxTurn * 180) / Math.PI,
};
assert(maxTurn < 0.38);
const basin = new Catchment(
  24,
  100,
  104,
  (x, y) => ({ h: 0.21 * x + 0.04 * y + 0.46 * Math.sin(0.33 * x + 0.19 * y) }),
  { spacing: 2.4 },
);
for (let k = 0; k < 180; k++) basin.step(8, 0.91);
const reaches = basin.curves(),
  minFall = Math.min(
    ...reaches.filter((e) => !e.spill).map((e) => e.a.h - e.b.h),
  );
report.runoff = {
  nodes: basin.nodes.length,
  split: basin.state.splits,
  con: basin.state.joins,
  minFall,
};
assert(basin.state.splits > 2 && basin.state.joins > 10 && minFall > 0);
console.log(JSON.stringify(report, null, 2));
