import { beside } from "./path-right-of-way.js";
import { hull } from "./contacts.js";
// Surveyed timber perimeters. Adjacent acres share one span; a gate on either side stays open.
import * as T from "../vendor/three.module.min.js";
import { ACRE as U, SIDE, RAIL_END } from "./metres.js";
export function demoEdges(x, y, h) {
  const [fx, fy] = SIDE[h.facing],
    edges = [],
    gate = h.gate;
  for (const [dx, dy] of Object.values(SIDE)) {
    const A = [x + (dx > 0 ? 1 : 0), y + (dy > 0 ? 1 : 0)],
      line = (t) => [A[0] + (dy ? t : 0), A[1] + (dx ? t : 0)],
      cut = dy ? gate[0] - x : gate[1] - y;
    for (const [u, v] of dx === fx && dy === fy
      ? [
          [0, cut - RAIL_END / U],
          [cut + RAIL_END / U, 1],
        ]
      : [[0, 1]]) {
      edges.push([...line(u), ...line(v)]);
    }
  }
  return edges;
}
export function yards(s, rows, p, assets, tier) {
  const near = [],
    edges = new Map(),
    blocks = [],
    corners = new Map(),
    g = new T.Group();
  for (const [x, y, u, , did, h] of rows) {
    if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) > (tier ? 9.1 : 5.5)) continue;
    near.push({ x, y, u, did, h });
    for (const [dx, dy] of Object.values(SIDE)) {
      const X = x + (dx > 0 ? 1 : 0),
        Y = y + (dy > 0 ? 1 : 0),
        along = !!dy,
        k = [X, Y, +along].join("/");
      const e = edges.get(k) || {
        X,
        Y,
        along,
        gaps: s.ways?.cuts(X, Y, along) || [],
      };
      edges.set(k, e);
      if (SIDE[h.facing][0] === dx && SIDE[h.facing][1] === dy) {
        let f = along ? h.gate[0] - X : h.gate[1] - Y;
        e.gaps.push([
          Math.max(0, f - RAIL_END / U),
          Math.min(1, f + RAIL_END / U),
        ]);
      }
    }
    for (const ij of [
      [x, y],
      [x + 1, y],
      [x, y + 1],
      [x + 1, y + 1],
    ])
      corners.set(ij.join("/"), ij);
  }
  for (const { X, Y, along, gaps } of edges.values()) {
    const seg = (a, b) => {
      if ((b - a) * U > 0.68)
        blocks.push([
          X + (along ? a : 0),
          Y + (along ? 0 : a),
          X + (along ? b : 0),
          Y + (along ? 0 : b),
        ]);
    };
    let f = 0;
    for (const [lo, hi] of gaps.sort((a, b) => a[0] - b[0])) {
      seg(f, lo);
      f = Math.max(f, hi);
    }
    seg(f, 1);
  }
  const contact = [],
    pos = [],
    cs = [],
    v = new T.Color(),
    m = assets.fence_simple;
  const wood = [new T.Color("#805e40"), new T.Color("#ac8058")];
  for (const [ax, ay, bx, by] of blocks) {
    const dx = bx - ax,
      dy = by - ay,
      len = Math.hypot(dx, dy),
      sections = Math.ceil((len * U) / 3.25);
    for (let j = 0; j < sections; j++) {
      const xyz = m.p.map(([X, Y, Z]) => {
        const f = (j + X + 0.5) / sections,
          off = ((Z - 0.465) * 2.4) / U,
          gx = ax + dx * f - (dy / len) * off,
          gy = ay + dy * f + (dx / len) * off;
        return s.xyz(gx, gy, s.ground(gx, gy) + Y * 3.3 - 0.045);
      });
      // One capsule segment per rendered picket/rail section. End heights come from the same transformed vertices (slopes included).
      const heights = [-1, 1].map((side) =>
        Math.max(
          ...xyz.filter((_, k) => m.p[k][0] * side > 0.4).map((p) => p[1]),
        ),
      );
      contact.push([
        ax + (dx * j) / sections,
        ay + (dy * j) / sections,
        ax + (dx * (j + 1)) / sections,
        ay + (dy * (j + 1)) / sections,
        ...heights,
      ]);
      for (let i = 0; i < m.i.length; i++) {
        pos.push(...xyz[m.i[i]]);
        v.copy(wood[m.mat[(i / 3) | 0] === "woodDark" ? 0 : 1]).multiplyScalar(
          0.92 + 0.07 * Math.sin(j * 1.8),
        );
        cs.push(v.r, v.g, v.b);
      }
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new T.Float32BufferAttribute(cs, 3));
  geo.computeVertexNormals();
  const mesh = new T.Mesh(
    geo,
    new T.MeshLambertMaterial({ vertexColors: true }),
  );
  mesh.userData.role = "acre-timber";
  mesh.userData.disposableMaterial = true;
  g.add(mesh);
  for (const [k, [x, y]] of corners)
    if (s.ways && !s.ways.clear(x, y, 0.24)) corners.delete(k);
  if (corners.size) {
    const geo = new T.CylinderGeometry(0.14, 0.21, 0.4, 6),
      mat = new T.MeshLambertMaterial({ color: 0xa99c83 }),
      ms = new T.InstancedMesh(geo, mat, corners.size);
    let i = 0;
    const obj = new T.Object3D();
    for (const [gx, gy] of corners.values()) {
      obj.position.set(...s.xyz(gx, gy, s.ground(gx, gy) + 0.17));
      obj.rotation.y = (gx * 1.3 + gy * 0.6) % 6;
      obj.updateMatrix();
      ms.setMatrixAt(i++, obj.matrix);
    }
    ms.userData.role = "boundary-stone";
    ms.userData.disposableMaterial = true;
    g.add(ms);
  }
  g.userData = {
    near,
    blocks: contact,
    spans: blocks,
    stones: [...corners.values()],
    edges: edges.size,
    gates: near.length,
    labels: [],
  };
  return g;
}
// Sparse edge pebbles only. Their 2–5 cm relief is walkable; big rocks have capsule hulls.
export function wayside(s, paths, p, assets) {
  const pos = [],
    col = [],
    g = new T.Group(),
    names = ["rock_smallFlatA", "rock_smallB", "rock_smallFlatC"];
  let index = 0;
  for (const path of paths) {
    let next = 2;
    for (let j = 1; j < path.xy.length; j++) {
      const [a, b] = path.xy[j - 1],
        [x, y] = path.xy[j],
        dx = x - a,
        dy = y - b,
        len = Math.hypot(dx, dy) * U;
      if (len < 0.0001) continue;
      for (; next < len; next += 3.1 + ((index * 23) % 13) * 0.33) {
        index++;
        const side = (index % 3 ? 1 : -1) * ((path.w || 1.5) * 0.49 + 0.1),
          X = a + (dx * next) / len - (dy * side) / len,
          Y = b + (dy * next) / len + (dx * side) / len;
        if (Math.hypot(X - p.x, Y - p.y) > 2.8) continue;
        const Z = s.sample(X, Y);
        if (!Z.drawn || Z.depth > 0.02) continue;
        const m = assets[names[index % 3]],
          scale = 0.18 + (index % 5) * 0.04,
          angle = index * 2.4,
          si = Math.sin(angle),
          co = Math.cos(angle);
        for (const k of m.i) {
          const [u, v, w] = m.p[k];
          pos.push(
            ...s.xyz(
              X + ((co * u + si * w) * scale) / U,
              Y + ((si * u - co * w) * scale) / U,
              Z.z + v * 0.12 - 0.004,
            ),
          );
          col.push(0.3, 0.275 + (index % 3) * 0.014, 0.19);
        }
      }
      next -= len;
    }
  }
  if (pos.length) {
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new T.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new T.Mesh(
      geo,
      new T.MeshLambertMaterial({ vertexColors: true }),
    );
    mesh.userData.role = "trail-shoulder-stones";
    mesh.userData.disposableMaterial = true;
    g.add(mesh);
  }
  return g;
}

// A low, broad rest stone on the outside shoulder. Its top and its side collisions are the rendered triangles.
export function restStone(s, h, model) {
  const [fx, fy] = SIDE[h.facing],
    [gx, gy] = h.gate,
    reach =
      Math.max(...model.p.map(([u, v, w]) => Math.hypot(u, w) * 4.3)) + 0.34,
    spot = beside(
      s,
      [5.1, 7.9, 3, 11].flatMap((front) =>
        [1.48, 3.5, -3.5, 5.7, -5.7, 8.6, -8.6, 12, -12].map((side) => [
          gx + (fx * front - fy * side) / U,
          gy + (fy * front + fx * side) / U,
        ]),
      ),
      reach,
    );
  if (!spot) return null;
  const [x, y] = spot,
    z = s.ground(x, y),
    sc = 4.3,
    ang = 0.62,
    co = Math.cos(ang),
    si = Math.sin(ang),
    pts = model.p.map(([u, v, w]) => [
      (co * u + si * w) * sc,
      (si * u - co * w) * sc,
      v * 5.8 - 0.035,
    ]),
    top = [],
    pos = [];
  for (let i = 0; i < model.i.length; i += 3) {
    const tri = model.i.slice(i, i + 3).map((k) => pts[k]);
    top.push(tri);
    for (const [dx, dy, dz] of tri)
      pos.push(...s.xyz(x + dx / U, y + dy / U, z + dz));
  }
  const r = Math.max(...pts.map((a) => Math.hypot(a[0], a[1]))) + 0.34,
    o = [
      x,
      y,
      r / U,
      Math.max(...pts.map((a) => a[2])),
      hull(pts.map((a) => a.slice(0, 2))),
    ];
  o.base = z;
  o.top = top;
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const m = new T.Mesh(
    g,
    new T.MeshLambertMaterial({
      color: 0x948471,
      side: T.DoubleSide,
      flatShading: true,
    }),
  );
  m.userData = {
    role: "wayside-rest-stone",
    disposableMaterial: true,
    rock: o,
  };
  return m;
}
