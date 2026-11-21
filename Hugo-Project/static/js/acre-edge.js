// Historic approach pose and generic rail collision utility. No field perimeter geometry.
import { ACRE as U, SIDE } from "./metres.js";
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
// Horizontal capsule plus a finite, slope-following top. Walking still stops at timber, but not at an invisible wall over it.
export function fenceTop(blocks, x, y) {
  let top = -Infinity;
  for (const [a, b, c, d, h, H] of blocks || []) {
    if (
      x < a - 0.43 / U ||
      x > c + 0.43 / U ||
      y < b - 0.43 / U ||
      y > d + 0.43 / U
    )
      continue;
    const dx = c - a,
      dy = d - b,
      t = Math.max(
        0,
        Math.min(1, ((x - a) * dx + (y - b) * dy) / (dx * dx + dy * dy || 1)),
      );
    if (Math.hypot(x - a - t * dx, y - b - t * dy) * U < 0.43)
      top = Math.max(top, h == null ? Infinity : h + (H - h) * t);
  }
  return top;
}
export function fenceAt(blocks, x, y) {
  return fenceTop(blocks, x, y) > -Infinity;
}
