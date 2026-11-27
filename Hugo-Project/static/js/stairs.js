// The Sopana Marg stairways: exact-count stone steps laid on the carved trail
// surface. Alipiri Mettu carries 3,550 steps and Srivari Mettu 2,388; the
// step-number waypoints below are the real ones surveyed on the mountain
// (Gali Gopuram is the 2,083rd step, Mokalla Parvatham the 2,910th — see
// Notes/tirupati-7hills/RESEARCH.md). Steps are thin slabs, so the 2–5 cm
// relief stays walkable like the wayside stones; the climb itself is the
// carved terrain, and the slabs read the rhythm of the real staircase.
import * as T from "../vendor/three.module.min.js";
import { ACRE as U } from "./metres.js";

// [real step number, grid xy] waypoints where each stairway passes a known step.
export const ANCHORS = {
  "alipiri-mettu": {
    total: 3550,
    at: [
      [0, [5015.9037, 1981.9998]], // Padala Mandapam, first step
      [2083, [5002.3741, 1994.9852]], // Gali Gopuram, Divya Darshan point
      [2910, [4922.4, 1999.9]], // Mokalla Parvatham, the final nose
      [3550, [4916.9, 2007.6]], // last step by the Kulashekhar Alvar statue
    ],
  },
  "srivari-mettu": {
    total: 2388,
    at: [
      [0, [4895.1941, 2000.1081]], // entrance above Srinivasa Mangapuram
      [2388, [4899.1, 2016.8]], // exit footway by the Tirumala ring road
    ],
  },
};

function stations(xy) {
  const cum = [0];
  for (let i = 1; i < xy.length; i++)
    cum.push(
      cum[i - 1] +
        Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]) * U,
    );
  return cum;
}

function nearestAt(cum, xy, cell) {
  let bi = 0,
    bd = Infinity;
  for (let i = 0; i < xy.length; i++) {
    const d = (xy[i][0] - cell[0]) ** 2 + (xy[i][1] - cell[1]) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return cum[bi];
}

function pointAt(cum, xy, d) {
  let lo = 0,
    hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const a = xy[lo],
    b = xy[Math.min(lo + 1, xy.length - 1)],
    seg = Math.hypot(b[0] - a[0], b[1] - a[1]) * U || 1,
    t = (d - cum[lo]) / seg;
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    Math.atan2(b[0] - a[0], -(b[1] - a[1])),
  ];
}

/**
 * Stone-slab placements along a stairway trail: {x, y, ang, tread} per step,
 * distributed between the real step-number anchors. `groundAt(x, y)` supplies
 * the carved walking surface so spans can report their rise per step.
 */
export function stairPlan(path, spec, groundAt) {
  const xy = path.xy,
    cum = stations(xy);
  const at = spec.at
    .map(([step, cell]) => ({ step, at: nearestAt(cum, xy, cell) }))
    .sort((a, b) => a.step - b.step);
  const out = [];
  for (let s = 1; s < at.length; s++) {
    const A = at[s - 1],
      B = at[s],
      n = B.step - A.step,
      len = B.at - A.at;
    if (n <= 0 || len <= 0) continue;
    const tread = len / n,
      [ax, ay] = pointAt(cum, xy, A.at),
      [bx, by] = pointAt(cum, xy, B.at),
      rise = groundAt(bx, by) - groundAt(ax, ay);
    for (let k = 1; k <= n; k++) {
      const [x, y, ang] = pointAt(cum, xy, A.at + (len * k) / n);
      out.push({ x, y, ang, tread, riser: rise / n });
    }
  }
  return out;
}

const slabMat = () =>
  new T.MeshLambertMaterial({ color: 0xa79470 });

/** Instanced stone slabs for the mettu stairways near the walking focus. */
export function stairSlabs(s, trails, p) {
  const group = new T.Group();
  const obj = new T.Object3D();
  for (const trail of trails) {
    const spec = ANCHORS[trail.id];
    if (!spec) continue;
    const plan = stairPlan(trail, spec, (x, y) => s.ground(x, y));
    const near = plan.filter(
      (q) => Math.hypot(q.x - p.x, q.y - p.y) < 3.6,
    );
    if (!near.length) continue;
    const w = Math.max(0.9, Math.min(2, trail.w || 1.15));
    // Discrete stairs (tread < 2.5 m) slabs overlap their neighbours so the
    // polyline's curves never open gaps; the long stone-paved forest walk
    // (tread >= 2.5 m, where real step numbers still advance) renders as
    // continuous flagstones with visible joints.
    // The real stairways are broad masonry flights (~3 m) built into the
    // slope; slabs are thick blocks sunk into the carved tread so the hill
    // reads as rising through them, in warm stone that matches the mud.
    const stepped = near.every((q) => q.tread < 2.5),
      len = stepped ? 1.45 : 1.03,
      slabW = stepped
        ? Math.max(2.2, Math.min(3.2, (trail.w || 1.15) * 1.0))
        : Math.max(1.5, Math.min(2.4, (trail.w || 1.15) * 1.0));
    const geo = new T.BoxGeometry(slabW, 0.3, 1),
      mat = slabMat(),
      ms = new T.InstancedMesh(geo, mat, near.length);
    for (let i = 0; i < near.length; i++) {
      const q = near[i],
        z = s.ground(q.x, q.y);
      obj.position.set(...s.xyz(q.x, q.y, z - 0.09));
      obj.rotation.set(0, q.ang + (((i * 13) % 7) - 3) * 0.011, 0);
      obj.scale.set(1, 1, q.tread * len);
      ms.setColorAt
        ? ms.setColorAt(
            i,
            new T.Color(0xa79470).offsetHSL(0, 0, (((i * 7) % 11) - 5) * 0.011),
          )
        : null;
      obj.updateMatrix();
      ms.setMatrixAt(i, obj.matrix);
    }
    ms.userData = { role: "sopana-steps", disposableMaterial: true };
    group.add(ms);
  }
  return group.children.length ? group : null;
}
