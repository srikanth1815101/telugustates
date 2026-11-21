// Shared packed-earth clearing, a neem shade platform, small domestic courtyards and chalk muggu at the thresholds.
import { roomPlan } from "./home-volume.js";
import * as T from "../vendor/three.module.min.js";
import { ACRE as M, localPoint } from "./metres.js";
const scale = (p, x, y) => [p[0] + x / M, p[1] + y / M];
export function hamletScene(s, rows, commons, focus, tier) {
  const g = new T.Group(),
    ink = [],
    shapes = new Map(),
    obj = new T.Object3D(),
    solids = [],
    range = tier ? 280 : 160;
  const add = (k, p, height, xyz, rotation, color) => {
    const a = shapes.get(k) || shapes.set(k, []).get(k);
    obj.position.set(...s.xyz(...p, s.ground(...p) + height));
    obj.scale.set(...xyz);
    obj.rotation.set(...rotation);
    obj.updateMatrix();
    a.push([obj.matrix.clone(), new T.Color(color)]);
  };
  for (const row of rows) {
    const h = row[5],
      y = h.yard;
    if (
      !y ||
      Math.hypot(h.centre[0] - focus.x, h.centre[1] - focus.y) * M > range
    )
      continue;
    if (Math.hypot(h.centre[0] - focus.x, h.centre[1] - focus.y) * M < 46) {
      for (let k = 0; k < 4; k++)
        for (let i = 0; i < 16; i++) {
          const pt = (t) => {
            let a = (k * Math.PI) / 2 + t * 0.392699,
              r = 0.38 + 0.22 * Math.cos(4 * a),
              p = localPoint(
                h,
                h.door_x + Math.sin(a) * r,
                y.d / 2 + 1.1 + Math.cos(a) * r,
              );
            return s.xyz(...p, s.ground(...p) + 0.076);
          };
          ink.push(...pt(i), ...pt(i + 1));
        }
    }
  }
  for (const v of commons) {
    const p = v.hub;
    if (Math.hypot(p[0] - focus.x, p[1] - focus.y) * M > range) continue;
    // Earth clearing is blended into the same ground surface as lanes.
    if (!v.shade) continue;
    const z = v.shade;
    add("trunk", z, 2.05, [0.46, 4.1, 0.48], [0, 0.8, 0.025], 0x806647);
    add("bench", z, 0.23, [2.65, 0.5, 2.5], [0, 0.22, 0], 0x9a876c);
    add("seat", z, 0.5, [2.9, 0.14, 2.7], [0, 0.22, 0], 0xc4aa85);
    for (let k = 0; k < 6; k++) {
      const a = k * 2.4,
        b = scale(
          z,
          Math.cos(a) * (k ? 1.35 : 0),
          Math.sin(a) * (k ? 1.35 : 0),
        );
      add(
        "leaf",
        b,
        4.08 + (k ? Math.sin(k * 0.8) * 0.45 : 1.15),
        [3.9, 2.8, 3.8],
        [0.12 * k, a, 0.09 * k],
        [0x58764b, 0x708b50, 0x77925a, 0x4e7046][k % 4],
      );
    }
    solids.push([z[0], z[1], 1.55 / M]);
  }
  function geo(p, c) {
    const b = new T.BufferGeometry();
    b.setAttribute("position", new T.Float32BufferAttribute(p, 3));
    if (c) b.setAttribute("color", new T.Float32BufferAttribute(c, 3));
    b.computeVertexNormals();
    return b;
  }
  if (ink.length) {
    const a = new T.LineSegments(
      geo(ink),
      new T.LineBasicMaterial({ color: 0xf8ecce }),
    );
    a.userData.disposableMaterial = true;
    g.add(a);
  }
  for (const [k, arr] of shapes) {
    const b =
        k === "leaf"
          ? new T.IcosahedronGeometry(0.5, 1)
          : new T.CylinderGeometry(0.5, 0.5, 1, k === "trunk" ? 6 : 10),
      m = new T.InstancedMesh(
        b,
        new T.MeshLambertMaterial({ flatShading: true }),
        arr.length,
      );
    arr.forEach(([mat, c], i) => {
      m.setMatrixAt(i, mat);
      m.setColorAt(i, c);
    });
    m.userData = { role: "commons-" + k, disposableMaterial: true };
    g.add(m);
  }
  g.userData.solids = solids;
  return g;
}
// A single owner can be selected. The other fields have no outline. Raised dashes help locate the doorstep for a few seconds.
export function marks(s, r, kind, route) {
  const g = new T.Group();
  if (!r) return g;
  const pts = [],
    warm = kind === "home" ? 0xffcc66 : 0xffe38a;
  function line(a, b, e = 0.14) {
    const n = Math.max(
      1,
      Math.ceil((Math.hypot(a[0] - b[0], a[1] - b[1]) * M) / 1.8),
    );
    for (let j = 0; j < n; j++)
      for (const t of [j / n, (j + 1) / n]) {
        const x = a[0] + (b[0] - a[0]) * t,
          y = a[1] + (b[1] - a[1]) * t;
        pts.push(...s.xyz(x, y, s.ground(x, y) + e));
      }
  }
  const corners =
    kind === "home"
      ? [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([x, y]) =>
          localPoint(
            r.house,
            x * (r.house.size_m[0] / 2 + 0.2),
            y * (r.house.size_m[1] / 2 + 0.2),
          ),
        )
      : [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ].map(([X, Y]) => [r.c[0] + X, r.c[1] + Y]);
  for (let i = 0; i < 4; i++) {
    line(corners[i], corners[(i + 1) % 4], kind === "home" ? 0.36 : 0.19);
    if (kind === "home") {
      const [a, b] = corners[i],
        p = s.xyz(a, b, s.ground(a, b) + 0.35);
      pts.push(...p, p[0], p[1] + r.house.size_m[2] * 0.79, p[2]);
    }
  }
  if (kind === "home") {
    const h = r.house,
      p = roomPlan(h),
      front = p.front + 0.14,
      z = s.ground(...h.centre),
      edges = [
        [-1, p.floor],
        [-1, p.floor + p.dh + 0.09],
        [1, p.floor + p.dh + 0.09],
        [1, p.floor],
      ];
    for (let i = 1; i < edges.length; i++)
      for (const [side, height] of [edges[i - 1], edges[i]]) {
        const [x, y] = localPoint(
          h,
          p.door + side * (p.dw * 0.5 + 0.07),
          front,
        );
        pts.push(...s.xyz(x, y, z + height));
      }
  }
  let geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(pts, 3));
  const a = new T.LineSegments(geo, new T.LineBasicMaterial({ color: warm }));
  a.userData = { role: kind + "-selection", disposableMaterial: true };
  g.add(a);
  if (route?.xy.length) {
    const q = route.xy,
      b = new T.CylinderGeometry(0.1, 0.14, 0.085, 6),
      m = new T.InstancedMesh(
        b,
        new T.MeshBasicMaterial({ color: 0xf9d67a }),
        q.length,
      ),
      o = new T.Object3D();
    q.forEach(([x, y], i) => {
      o.position.set(...s.xyz(x, y, s.ground(x, y) + 0.1));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.userData = { role: "walking-waymarks", disposableMaterial: true };
    g.add(m);
  }
  return g;
}
