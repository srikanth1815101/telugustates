// The one conserved length across preparation, terrain, survey, walking, roads and buildings.
export const ACRE = 63.615,
  RELIEF = 2.0;
// Position shared by the visible masonry hinges and the capsule/boom tests; the full gateway is open.
export const GATE_POST_OFFSET = 2.68;
// Five metres between rail ends leaves a full four metres for a moving capsule.
export const RAIL_END = 2.5;
export const SIDE = Object.freeze({
  north: [0, 1],
  south: [0, -1],
  east: [1, 0],
  west: [-1, 0],
});
export function basis(h) {
  const [fx, fy] = SIDE[h.facing];
  return { fx, fy, rx: -fy, ry: fx, yaw: Math.atan2(fx, -fy) };
}
export function localPoint(h, x, z) {
  const { fx, fy, rx, ry } = basis(h);
  return [
    h.centre[0] + (rx * x + fx * z) / ACRE,
    h.centre[1] + (ry * x + fy * z) / ACRE,
  ];
}
export function inHouse(h, x, y, r = 0.25) {
  if (!h) return false;
  const dx = (x - h.centre[0]) * ACRE,
    dy = (y - h.centre[1]) * ACRE,
    { fx, fy, rx, ry } = basis(h),
    a = rx * dx + ry * dy,
    b = fx * dx + fy * dy;
  const dz = h.size_m[1] / 2 + h.setback_m;
  for (const t of h.timberOnly ? [] : [-1, 1]) {
    const post = h.door_x + t * GATE_POST_OFFSET;
    if (
      (Math.abs(a - post) < 0.225 + r &&
        Math.abs(b - (dz - 0.35)) < 0.225 + r) ||
      (Math.abs(a - post) < 0.05 + r &&
        Math.abs(b - (dz - 1.18)) < 0.825 + r) ||
      (Math.abs(a - post - t * 1.06) < 0.99 + r &&
        Math.abs(b - (dz - 0.35)) < 0.14 + r)
    )
      return true;
  }
  return h.parts.some(
    ([px, pz, w, d, role]) =>
      !["veranda", "awning", "shed"].includes(role) &&
      (role === "round"
        ? ((a - px) / (w * 0.5 + r)) ** 2 + ((b - pz) / (d * 0.5 + r)) ** 2 < 1
        : Math.abs(a - px) < w * 0.5 + r && Math.abs(b - pz) < d * 0.5 + r),
  );
}
