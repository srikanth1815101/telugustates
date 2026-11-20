import { ACRE as U, inHouse } from "./metres.js";
import { fenceAt } from "./acre-edge.js";
// Fit the lower trunk, not the nominal asset pivot. Several palms lean away from that pivot.
const trunks = new WeakMap();
export function trunkFootprint(g) {
  if (trunks.has(g)) return trunks.get(g);
  let loX = Infinity,
    loZ = Infinity,
    hiX = -Infinity,
    hiZ = -Infinity;
  const q = g.attributes.position,
    idx = g.index,
    count = idx?.count || q.count;
  for (let i = 0; i < count; i += 3) {
    let abc = [0, 1, 2].map((k) => (idx ? idx.getX(i + k) : i + k));
    for (const h of [0.35, 0.8, 1.35])
      for (let j = 0; j < 3; j++) {
        const a = abc[j],
          b = abc[(j + 1) % 3],
          ay = q.getY(a),
          by = q.getY(b);
        if (ay <= h === by <= h) continue;
        const t = (h - ay) / (by - ay),
          x = q.getX(a) + t * (q.getX(b) - q.getX(a)),
          z = q.getZ(a) + t * (q.getZ(b) - q.getZ(a));
        loX = Math.min(loX, x);
        hiX = Math.max(hiX, x);
        loZ = Math.min(loZ, z);
        hiZ = Math.max(hiZ, z);
      }
  }
  const shape =
    loX === Infinity
      ? null
      : [
          (loX + hiX) / 2,
          (loZ + hiZ) / 2,
          0.5 * Math.hypot(hiX - loX, hiZ - loZ),
        ];
  trunks.set(g, shape);
  return shape;
}
// Counterclockwise convex silhouettes. The narrow phase uses the actual rotated, scaled
// land mesh, not an archetype's nominal width. Its clearance includes the walk capsule.
const shapes = new WeakMap(),
  capsule = 0.34;
export function hull(points) {
  const sorted = points.sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    cross = (a, b, c) =>
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (arr) => {
    let h = [];
    for (const p of arr) {
      while (h.length > 1 && cross(h.at(-2), h.at(-1), p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}
export function meshShape(g, kind, scale = 1) {
  let variants = shapes.get(g);
  if (!variants) shapes.set(g, (variants = new Map()));
  const ceiling =
    kind === "tree"
      ? Math.ceil((3.0 / Math.max(0.1, scale)) * 4) / 4
      : Infinity;
  if (variants.has(ceiling)) return variants.get(ceiling);
  const p = g.attributes.position,
    idx = g.index,
    points = [];
  let height = -Infinity;
  for (let i = 0; i < (idx?.count || p.count); i += 3) {
    let abc = [0, 1, 2].map((j) => (idx ? idx.getX(i + j) : i + j));
    for (let j = 0; j < 3; j++) {
      const a = abc[j],
        b = abc[(j + 1) % 3],
        x = p.getX(a),
        y = p.getY(a),
        z = p.getZ(a);
      height = Math.max(height, y);
      if (y <= ceiling) points.push([x, z]);
      if (y <= ceiling !== p.getY(b) <= ceiling) {
        const t = (ceiling - y) / (p.getY(b) - y);
        points.push([x + (p.getX(b) - x) * t, z + (p.getZ(b) - z) * t]);
      }
    }
  }
  const result = { polygon: hull(points), height };
  variants.set(ceiling, result);
  return result;
}
export function clearance(o, x, y) {
  let dx = (x - o[0]) * U,
    dy = (y - o[1]) * U;
  if (!o[4]) return Math.hypot(dx, dy) - o[2] * U;
  const points = o[4];
  let d = Infinity,
    inside = true;
  for (let i = 0; i < points.length; i++) {
    const [a, b] = points[i],
      [c, e] = points[(i + 1) % points.length],
      u = c - a,
      v = e - b,
      t = Math.max(
        0,
        Math.min(1, ((dx - a) * u + (dy - b) * v) / (u * u + v * v || 1)),
      );
    d = Math.min(d, Math.hypot(dx - a - u * t, dy - b - v * t));
    if (u * (dy - b) - v * (dx - a) < -1e-7) inside = false;
  }
  return (inside ? -d : d) - capsule;
}
export function solidFor(v, presets) {
  if (v.meshShape) {
    if (v._solid) return v._solid;
    const f = v.meshShape,
      co = Math.cos(v.rotation),
      si = Math.sin(v.rotation),
      sc = v.scale;
    if (!f.polygon.length || f.height * sc < 0.1) return null;
    const poly = f.polygon
        .map(([x, z]) => [(co * x + si * z) * sc, (si * x - co * z) * sc])
        .reverse(),
      r = Math.max(...poly.map((p) => Math.hypot(...p))) + capsule;
    return (v._solid = [v.x, v.y, r / U, f.height * sc, poly]);
  }
  const tree = v.kind === "tree",
    h = (presets.trees[v.name]?.height || 7) * v.scale,
    r = tree
      ? h * 0.02 + 0.17
      : v.kind === "rock" && v.name !== "Pebble fan"
        ? 0.61 * v.scale
        : 0;
  if (tree && v.trunk) {
    const [cx, cz, radius] = v.trunk,
      co = Math.cos(v.rotation),
      si = Math.sin(v.rotation);
    return [
      v.x + ((co * cx + si * cz) * v.scale) / U,
      v.y - ((-si * cx + co * cz) * v.scale) / U,
      (radius * v.scale + 0.23) / U,
      h,
    ];
  }
  return r ? [v.x, v.y, r / U, tree ? h : Math.max(0.4, v.scale)] : null;
}
// All shapes live in the source tile frame. A resident and its collision use the same centre, facing and parts.
export function passes(s, fences, objects, cover, px, py, ox, oy) {
  if (!s.traversable(px, py) || !s.sample(px, py).drawn) return false;
  const home = s.homeMap?.get(Math.floor(px) + "," + Math.floor(py))?.h;
  if (home && inHouse(home, px, py, 0.39) && !inHouse(home, ox, oy, 0.39))
    return false;
  if (fenceAt(fences, px, py) && !fenceAt(fences, ox, oy)) return false;
  for (const solids of [objects, cover])
    for (const obj of solids || []) {
      const dx = px - obj[0],
        dy = py - obj[1];
      if (dx * dx + dy * dy >= obj[2] * obj[2]) continue;
      const d = clearance(obj, px, py);
      if (d < 0 && d < clearance(obj, ox, oy) - 1e-9) return false;
    }
  return true;
}
