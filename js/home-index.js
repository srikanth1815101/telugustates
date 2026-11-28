// Pads and courtyard bounds may cross acre seams. A cell contains a list of buildings, never an owner.
import { basis, ACRE } from "./metres.js";
const none = Object.freeze([]);
export function homesAt(s, x, y) {
  return s.homeMap?.get(Math.floor(x) + "," + Math.floor(y)) || none;
}
export function yardDistance(h, x, y) {
  const b = basis(h),
    dx = (x - h.centre[0]) * ACRE,
    dy = (y - h.centre[1]) * ACRE,
    u = dx * b.rx + dy * b.ry,
    w = dx * b.fx + dy * b.fy;
  return Math.max(
    Math.abs(u) - (h.yard?.lot[0] || h.size_m[0]) * 0.5,
    w - h.size_m[1] / 2 - (h.yard?.front || 0),
    -w - h.size_m[1] / 2 - (h.yard?.back || 0),
  );
}
export function inCourt(s, x, y, r = 0) {
  return (
    homesAt(s, x, y).some((h) => yardDistance(h, x, y) < r) ||
    (s.commons || []).some(
      (q) => Math.hypot(q.hub[0] - x, q.hub[1] - y) * ACRE < 4 + r,
    )
  );
}
export function indexHome(s, h) {
  const radius =
      (Math.hypot(
        (h.yard?.lot[0] || h.size_m[0]) * 0.5,
        h.size_m[1] * 0.5 + Math.max(h.yard?.front || 0, h.yard?.back || 0),
      ) +
        5) /
      ACRE,
    [X, Y] = h.centre;
  for (let j = Math.floor(Y - radius); j <= Math.floor(Y + radius); j++)
    for (let i = Math.floor(X - radius); i <= Math.floor(X + radius); i++) {
      const k = i + "," + j;
      (s.homeMap.get(k) || s.homeMap.set(k, []).get(k)).push(h);
    }
}
