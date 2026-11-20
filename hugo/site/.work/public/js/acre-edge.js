// A few metres of rural frontage at the recorded gate, not a fence around every acre.
import * as T from "../vendor/three.module.min.js";
import { ACRE as U, SIDE, RAIL_END } from "./metres.js";
import { noise } from "./habitats.js";
export function acreEntry(
  cell,
  facing = "south",
  outside = false,
  gate = null,
) {
  const [fx, fy] = SIDE[facing] || SIDE.south,
    [gx, gy] = gate || [cell[0] + 0.5 + fx * 0.5, cell[1] + 0.5 + fy * 0.5],
    k = (outside ? 2.4 : -2.4) / U;
  return { x: gx + fx * k, y: gy + fy * k, yaw: Math.atan2(fx, -fy) };
}
export function boundaries(s, rows, p, tier) {
  const group = new T.Group(),
    edges = new Map(),
    postMap = new Map(),
    corners = new Map(),
    near = [];
  const range = tier === 2 ? 15 : tier ? 10 : 7;
  for (const [x, y, u, , did, h] of rows) {
    if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) > range) continue;
    near.push({ x, y, u, did, h });
    for (const [i, j] of [
      [x, y],
      [x + 1, y],
      [x, y + 1],
      [x + 1, y + 1],
    ])
      corners.set(i + "," + j, [i, j]);
    const face = h?.facing || "south",
      [dx, dy] = SIDE[face],
      X = x + (dx > 0 ? 1 : 0),
      Y = y + (dy > 0 ? 1 : 0),
      lenX = !!dy,
      gxy = h?.gate || [x + 0.5 + dx * 0.5, y + 0.5 + dy * 0.5],
      f = lenX ? gxy[0] - X : gxy[1] - Y;
    const id = [X, Y, +lenX].join(",");
    const edge = edges.get(id) || {
      X,
      Y,
      lenX,
      open: true,
      spans: [],
      gates: [],
    };
    edges.set(id, edge);
    edge.gates.push(f);
    const len = 4.5 + (((h?.seed || 0) >>> 3) % 8);
    edge.spans.push(
      [Math.max(0.012, f - (RAIL_END + len) / U), f - RAIL_END / U],
      [f + RAIL_END / U, Math.min(0.988, f + (RAIL_END + len * 0.74) / U)],
    );
  }
  const posts = [],
    rails = [],
    blocks = [];
  const origin = s.xyz(p.x, p.y, 0),
    up = new T.Vector3(0, 1, 0),
    obj = new T.Object3D(),
    a = new T.Vector3(),
    b = new T.Vector3(),
    tmp = new T.Color();
  const hAt = (x, y) => s.ground(x, y);
  for (const { X, Y, lenX, spans, gates } of edges.values()) {
    const point = (t) => [X + (lenX ? t : 0), Y + (lenX ? 0 : t)],
      cuts = [
        ...new Set(
          spans.flat().concat(gates.flatMap((g) => [g - RAIL_END / U, g + RAIL_END / U])),
        ),
      ].sort((a, b) => a - b);
    for (let k = 1; k < cuts.length; k++) {
      const l = cuts[k - 1],
        r = cuts[k],
        mid = (l + r) * 0.5;
      if (
        !spans.some(([a, b]) => mid >= a && mid <= b) ||
        gates.some((v) => Math.abs(mid - v) < RAIL_END / U)
      )
        continue;
      let prev;
      const steps = Math.ceil(((r - l) * U) / 4.8);
      const q0 = point(l),
        q1 = point(r);
      blocks.push([q0[0], q0[1], q1[0], q1[1]]);
      for (let i = 0; i <= steps; i++) {
        const [x, y] = point(l + ((r - l) * i) / steps),
          key = x.toFixed(6) + ":" + y.toFixed(6),
          h = hAt(x, y),
          v = noise(Math.round(x * 27), Math.round(y * 27));
        const wx = (x - p.x) * U,
          wz = (p.y - y) * U,
          ht = 1.06 + 0.13 * v;
        if (!postMap.has(key)) {
          postMap.set(key, 1);
          posts.push([wx, h + ht / 2 - 0.045, wz, ht + 0.09, v]);
        }
        if (prev) {
          for (const rh of [0.34, 0.78])
            rails.push([prev[0], prev[1] + rh, prev[2], wx, h + rh, wz, v]);
        }
        prev = [wx, h, wz];
      }
    }
  }
  const mat = new T.MeshLambertMaterial({ color: 0xffffff });
  const add = (geo, n, type, draw) => {
    if (!n) {
      geo.dispose();
      return;
    }
    const m = new T.InstancedMesh(geo, mat, n);
    for (let i = 0; i < n; i++) {
      const v = draw(i);
      obj.updateMatrix();
      m.setMatrixAt(i, obj.matrix);
      m.setColorAt(
        i,
        tmp
          .set(
            type === "boundary-stone"
              ? "#c4b7a2"
              : type === "post"
                ? "#78563c"
                : "#a77a4e",
          )
          .multiplyScalar(0.78 + 0.42 * v),
      );
    }
    m.computeBoundingSphere();
    m.userData.role = type === "boundary-stone" ? type : "acre-" + type;
    m.userData.cullable = true;
    m.userData.disposableMaterial = true;
    group.add(m);
  };
  add(new T.CylinderGeometry(0.102, 0.127, 1, 7), posts.length, "post", (i) => {
    const [x, y, z, h, v] = posts[i];
    obj.position.set(x, y, z);
    obj.rotation.set((v - 0.5) * 0.047, v * 5, 0);
    obj.scale.set(1, h, 1);
    return v;
  });
  add(new T.CylinderGeometry(0.071, 0.09, 1, 6), rails.length, "rail", (i) => {
    const [x, y, z, X, Y, Z, v] = rails[i];
    a.set(x, y, z);
    b.set(X, Y, Z);
    obj.position.copy(a).lerp(b, 0.5);
    b.sub(a);
    obj.scale.set(1, b.length() + 0.08, 0.9);
    obj.quaternion.setFromUnitVectors(up, b.normalize());
    return v;
  });
  const stones = [...corners.values()];
  add(
    new T.CylinderGeometry(0.16, 0.21, 1, 5),
    stones.length,
    "boundary-stone",
    (i) => {
      const [x, y] = stones[i],
        v = noise(x, y);
      obj.position.set((x - p.x) * U, s.ground(x, y) + 0.19, (p.y - y) * U);
      obj.scale.set(1, 0.42 + 0.06 * v, 1);
      obj.rotation.set(0, v * 5, 0);
      return v;
    },
  );
  group.position.set(origin[0], 0, origin[2]);
  group.userData = {
    near,
    stones,
    labels: [],
    gates: [...edges.values()].filter((e) => e.open).length,
    edges: edges.size,
    blocks,
  };
  return group;
}
export function fenceAt(blocks, x, y) {
  const d = 0.44 / U;
  for (const [a, b, c, e] of blocks || [])
    if (x >= a - d && x <= c + d && y >= b - d && y <= e + d) return true;
  return false;
}
