import { furnish } from "./room-layout.js";
// The room, door, walkable floor and collisions consume the same local metre plan. +z is towards the recorded gate.
import { ACRE as M, basis, localPoint } from "./metres.js";
const cache = new WeakMap();
export function roomLocal(h, x, y) {
  const b = basis(h),
    dx = (x - h.centre[0]) * M,
    dy = (y - h.centre[1]) * M;
  return [dx * b.rx + dy * b.ry, dx * b.fx + dy * b.fy];
}
export function wallHeight(h) {
  const H = h.size_m[2],
    k = h.style;
  return Math.max(
    k === 3 ? 2.38 : 0,
    H * ({ 4: 0.62, 5: 0.9, 3: 0.54, 7: 0.86, 10: 0.79 }[k] ?? 0.68),
  );
}
export function roomPlan(h) {
  if (cache.has(h)) return cache.get(h);
  const [cx, cz, w, d, role] = h.parts[0],
    a = w / 2,
    b = d / 2,
    round = role === "round",
    floor = 0.28,
    top =
      h.style === 5
        ? wallHeight(h) * 0.5 + 0.13
        : h.style === 7
          ? h.size_m[2] - 0.27 - Math.sin(0.065) * d
          : 0.23 + wallHeight(h),
    front = cz + b * (round ? Math.cos(Math.PI / 16) : 1),
    door = h.door_x,
    dw = h.style === 10 ? 1.94 : 1.46,
    dh = Math.min(2.13, top - floor - 0.12),
    wall = 0.16;
  const faces = [],
    solid = [],
    furniture = [],
    cuts = (p0, p1, holes) => {
      const dx = p1[0] - p0[0],
        dz = p1[1] - p0[1],
        len = Math.hypot(dx, dz),
        ux = dx / len,
        uz = dz / len,
        pt = (t) => [p0[0] + t * ux, p0[1] + t * uz];
      const arr = holes
        .map(([x, r, what]) => [Math.max(0, x - r), Math.min(len, x + r), what])
        .filter((v) => v[1] - v[0] > 0.1)
        .sort((a, b) => a[0] - b[0]);
      let t = 0;
      const add = (l, r, kind) => {
        if (r <= l + 1e-6) return;
        const A = pt(l),
          B = pt(r);
        faces.push({
          A,
          B,
          kind,
          len: r - l,
          rot: -Math.atan2(uz, ux),
          x: (A[0] + B[0]) / 2,
          z: (A[1] + B[1]) / 2,
        });
        if (kind !== "door") solid.push([...A, ...B]);
      };
      for (const [l, r, k] of arr) {
        add(t, l, "wall");
        add(Math.max(t, l), r, k);
        t = Math.max(t, r);
      }
      add(t, len, "wall");
    };
  if (!round) {
    const holes = [[door - cx + a, dw / 2, "door"]];
    for (const j of [-1, 1]) {
      const x = cx + j * w * 0.32;
      if (Math.abs(x - door) > dw / 2 + 0.74)
        holes.push([x - cx + a, Math.min(0.64, w * 0.066), "window"]);
    }
    cuts([cx - a, front], [cx + a, front], holes);
    cuts(
      [cx - a, cz - b],
      [cx + a, cz - b],
      [[w * 0.7, Math.min(0.75, w * 0.09), "window"]],
    );
    for (const j of [-1, 1])
      cuts(
        [cx + j * a, cz - b],
        [cx + j * a, front],
        [[d * 0.48, Math.min(0.56, d * 0.12), "window"]],
      );
  } else {
    const ring = Array.from({ length: 16 }, (_, i) => [
      cx + a * Math.sin(((i - 0.5) * Math.PI) / 8),
      cz + b * Math.cos(((i - 0.5) * Math.PI) / 8),
    ]);
    for (let i = 0; i < 16; i++) {
      const A = ring[i],
        B = ring[(i + 1) % 16],
        l = Math.hypot(A[0] - B[0], A[1] - B[1]);
      cuts(
        A,
        B,
        i === 0
          ? [[l / 2, dw / 2, "door"]]
          : [3, 8, 13].includes(i)
            ? [[l / 2, 0.46, "window"]]
            : [],
      );
    }
  }
  const shop = h.style === 10;
  const p = {
    cx,
    cz,
    w,
    d,
    a,
    b,
    front,
    door,
    dw,
    dh,
    wall,
    floor,
    top,
    round,
    faces,
    solid,
    furniture,
    shop,
  };
  p.styleGlow = h.seed % 4;
  p.design = furnish(h, p);
  p.furniture = p.design.objects;
  cache.set(h, p);
  return p;
}
export function insideRoom(p, x, z, margin = 0) {
  return p.round
    ? ((x - p.cx) / (p.a - margin)) ** 2 + ((z - p.cz) / (p.b - margin)) ** 2 <=
        1
    : Math.abs(x - p.cx) <= p.a - margin && Math.abs(z - p.cz) <= p.b - margin;
}
export function doorPoint(h, offset = 0) {
  const p = roomPlan(h);
  return localPoint(h, p.door, p.front + offset);
}
export function segmentDist(x, y, a, b, c, d) {
  const dx = c - a,
    dy = d - b,
    t = Math.min(
      1,
      Math.max(0, ((x - a) * dx + (y - b) * dy) / (dx * dx + dy * dy || 1)),
    );
  return Math.hypot(x - a - t * dx, y - b - t * dy);
}
export function houseBlocked(h, x, y, open = false, r = 0.34) {
  const p = roomPlan(h),
    [u, v] = roomLocal(h, x, y);
  if (Math.abs(u) > h.size_m[0] / 2 + 1 || Math.abs(v) > h.size_m[1] / 2 + 1)
    return false;
  for (const [a, b, w, d, k] of h.parts.slice(1)) {
    if (
      ["wing", "body", "stairs"].includes(k) &&
      Math.abs(u - a) < w / 2 + r &&
      Math.abs(v - b) < d / 2 + r
    )
      return true;
    if (["veranda", "awning", "shed"].includes(k)) {
      const count = k === "veranda" && h.style === 1 ? 4 : 2;
      for (let j = 0; j < count; j++)
        if (
          Math.abs(u - (a + w * (-0.435 + (j * 0.87) / (count - 1)))) <
            0.2 + r &&
          Math.abs(v - (b + d * 0.35)) < 0.2 + r
        )
          return true;
    }
  }
  if (!open && insideRoom(p, u, v)) return true;
  if (p.solid.some((seg) => segmentDist(u, v, ...seg) < r + p.wall / 2))
    return true;
  const hinge = p.door - p.dw / 2,
    theta = open ? 1.52 : 0;
  if (
    segmentDist(
      u,
      v,
      hinge,
      p.front,
      hinge + p.dw * Math.cos(theta),
      p.front - p.dw * Math.sin(theta),
    ) <
    r + 0.045
  )
    return true;
  return p.furniture.some(
    (o) => Math.abs(u - o.x) < o.w / 2 + r && Math.abs(v - o.z) < o.d / 2 + r,
  );
}
export function thresholdFloor(s, x, y, h) {
  if (!h) return null;
  const p = roomPlan(h),
    [u, v] = roomLocal(h, x, y);
  let lift = null;
  if (
    insideRoom(p, u, v) ||
    h.parts
      .slice(1)
      .some(
        ([a, b, w, d, k]) =>
          ["veranda", "awning", "shed"].includes(k) &&
          Math.abs(u - a) < w / 2 &&
          Math.abs(v - b) < d / 2,
      )
  )
    lift = p.floor;
  else if (
    Math.abs(u - p.door) < p.dw / 2 + 0.26 &&
    v >= p.front &&
    v < p.front + 0.82
  )
    lift = 0.14;
  if (lift === null) return null;
  return s.ground(...h.centre) + lift;
}
