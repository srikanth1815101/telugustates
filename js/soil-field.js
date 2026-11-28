// Continuous triangular value noise used for geology and catchment site warps. All callers pass absolute map coordinates.
export function soilField(x, y, seed = 1) {
  const i = Math.floor(x),
    j = Math.floor(y);
  let u = x - i,
    v = y - j;
  const h = (a, b) => {
      let k =
        Math.imul(a, 374761393) ^
        Math.imul(b, 668265263) ^
        Math.imul(seed, 1597334677);
      k = Math.imul(k ^ (k >>> 13), 1274126177);
      return ((k ^ (k >>> 16)) >>> 0) / 4294967296;
    },
    hi = u > v,
    wa = 1 - Math.max(u, v),
    wb = Math.abs(u - v),
    wc = Math.min(u, v),
    q = (z) => z * z * (3 - 2 * z),
    a = q(wa),
    b = q(wb),
    c = q(wc);
  return (
    (a * h(i, j) +
      b * h(hi ? i + 1 : i, hi ? j : j + 1) +
      c * h(i + 1, j + 1)) /
    (a + b + c)
  );
}
