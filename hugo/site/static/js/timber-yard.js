// Full fence only on the selected example acre. Fit every post and rail vertex of the
// licensed span to the local ground, along the SAME segments the motor tests.
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
export function yard(s, row, p, assets) {
  const [x, y, u, , did, h] = row,
    blocks = demoEdges(x, y, h),
    g = new T.Group(),
    pos = [],
    cs = [],
    v = new T.Color(),
    m = assets.fence_simple;
  for (const [ax, ay, bx, by] of blocks) {
    const dx = bx - ax,
      dy = by - ay,
      len = Math.hypot(dx, dy),
      sections = Math.ceil((len * U) / 3.25);
    for (let j = 0; j < sections; j++) {
      for (let i = 0; i < m.i.length; i++) {
        const [X, Y, Z] = m.p[m.i[i]],
          f = (j + X + 0.5) / sections,
          off = ((Z - 0.465) * 2.4) / U,
          gx = ax + dx * f - (dy / len) * off,
          gy = ay + dy * f + (dx / len) * off;
        pos.push(...s.xyz(gx, gy, s.ground(gx, gy) + Y * 3.3 - 0.045));
        v.set(
          m.mat[Math.floor(i / 3)] === "woodDark" ? "#805e40" : "#ac8058",
        ).multiplyScalar(0.92 + 0.07 * Math.sin(j * 1.8));
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
  mesh.userData.role = "demo-timber";
  mesh.userData.disposableMaterial = true;
  g.add(mesh);
  g.userData = {
    near: [{ x, y, u, did, h }],
    blocks,
    stones: [
      [x, y],
      [x + 1, y],
      [x, y + 1],
      [x + 1, y + 1],
    ],
    edges: 4,
    gates: 1,
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
