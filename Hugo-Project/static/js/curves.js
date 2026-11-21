// C1 interpolant through each editable waypoint. Limit the tangent to the shorter adjacent span
// so gate approaches cannot overshoot the opening. The small organic offset has zero end derivative.
export function curvedPoints(points, id = "", width = 1.2) {
  const P = points.filter(
    (a, i) =>
      !i || Math.hypot(a[0] - points[i - 1][0], a[1] - points[i - 1][1]) > 1e-7,
  );
  if (P.length < 2) return P;
  let seed = 13;
  for (const c of id) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const at = (i) => P[Math.max(0, Math.min(P.length - 1, i))],
    T = P.map((b, i) => {
      const a = at(i - 1),
        c = at(i + 1),
        l = Math.hypot(b[0] - a[0], b[1] - a[1]),
        r = Math.hypot(c[0] - b[0], c[1] - b[1]),
        h = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1,
        span = 0.77 * (l && r ? Math.min(l, r) : r || l);
      return [((c[0] - a[0]) * span) / h, ((c[1] - a[1]) * span) / h];
    });
  let out = [P[0]];
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1],
      b = P[i],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      l = Math.hypot(dx, dy),
      n = Math.max(5, Math.ceil((l * 63.615) / 2.6)),
      amp =
        Math.min(l * 0.068, 0.07) *
        (Math.sin(seed * 0.013 + i * 2.3) * 0.46 + 0.46) *
        (l < 0.12 ? 0.08 : 1);
    for (let j = 1; j <= n; j++) {
      const t = j / n,
        v = t * t,
        w = v * t,
        h = 3 * v - 2 * w,
        offset =
          amp *
          Math.sin(Math.PI * t) ** 2 *
          Math.sin(4.1 * t + i + seed * 0.001);
      out.push([
        a[0] +
          h * dx +
          (w - 2 * v + t) * T[i - 1][0] +
          (w - v) * T[i][0] -
          (dy / l) * offset,
        a[1] +
          h * dy +
          (w - 2 * v + t) * T[i - 1][1] +
          (w - v) * T[i][1] +
          (dx / l) * offset,
      ]);
    }
  }
  return out;
}
