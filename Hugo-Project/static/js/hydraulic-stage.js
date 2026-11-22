// HST1 stores a head for each FROZEN wet sample, in the original tile's wet-cell order. No dry DEM height enters the water sheet.
import { url, unzip } from "./grid.js";
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function warpWaterXY(x, y) {
  return [
    x +
      0.12 * Math.sin(y * 2.07 + Math.sin(x * 0.84)) +
      0.047 * Math.sin(y * 8.2 + x * 2.3),
    y +
      0.11 * Math.sin(x * 2.28 + y * 0.61) +
      0.042 * Math.sin(x * 8.8 - y * 1.3),
  ];
}
export function isStageStep(headA, headB) {
  if (!headA || !headB || headA === headB) return false;
  const dh = Math.abs((headA & 32767) - (headB & 32767)) / 16;
  return (headA | headB) & 32768 ? dh >= 1.8 : dh >= 4.2;
}
// Separate incompatible adjacent hydraulic stages across a smooth, organically warped rock sill so continuous-water never bridges a cliff.
export function stageBreak(s, x, y) {
  const [X, Y] = warpWaterXY(x, y),
    ix = Math.floor(X),
    iy = Math.floor(Y);
  let minCode = 0,
    maxCode = 0,
    minRaw = 65536,
    maxRaw = -1;
  for (let j = iy - 2; j <= iy + 2; j++)
    for (let i = ix - 2; i <= ix + 2; i++) {
      const dx = X - (i + 0.5),
        dy = Y - (j + 0.5);
      if (dx * dx + dy * dy >= 3.24) continue;
      const h = s.node(i, j).head;
      if (!h) continue;
      const raw = h & 32767;
      if (raw < minRaw) {
        minRaw = raw;
        minCode = h;
      }
      if (raw > maxRaw) {
        maxRaw = raw;
        maxCode = h;
      }
    }
  if (!minCode || minCode === maxCode || !isStageStep(minCode, maxCode))
    return null;
  const midRaw = (minRaw + maxRaw) * 0.5;
  let wHi = 0,
    wLo = 0,
    sumHi = 0,
    sumLo = 0;
  for (let j = iy - 2; j <= iy + 2; j++)
    for (let i = ix - 2; i <= ix + 2; i++) {
      const dx = X - (i + 0.5),
        dy = Y - (j + 0.5),
        d = dx * dx + dy * dy;
      if (d >= 3.24) continue;
      const h = s.node(i, j).head;
      if (!h) continue;
      let f = 1 - d / 3.24;
      f *= f;
      const w = f * f,
        raw = h & 32767;
      if (raw >= midRaw) {
        wHi += w;
        sumHi += raw * w;
      } else {
        wLo += w;
        sumLo += raw * w;
      }
    }
  if (!wHi || !wLo) return null;
  const phi = (wHi - wLo) / (wHi + wLo),
    absPhi = Math.abs(phi),
    gate = smooth(0.14, 0.34, absPhi),
    sill = 1 - smooth(0.1, 0.38, absPhi),
    hHi = (wHi ? sumHi / wHi : maxRaw) / 16 - 64,
    hLo = (wLo ? sumLo / wLo : minRaw) / 16 - 64;
  return {
    phi,
    gate,
    sill,
    midRaw,
    upper: phi >= 0,
    hHi,
    hLo,
    drop: hHi - hLo,
  };
}
export async function readHeads(key, d, c) {
  let n = 0;
  for (let i = 0; i < c.length; i++)
    if (d[i] && (c[i] === 3 || c[i] === 4)) n++;
  if (!rOkCheck(n)) return null;
  const r = await fetch(url("hydraulics/" + key + ".bin.gz"));
  if (!r.ok) throw Error("Missing water levels in " + key);
  const heads = new Uint16Array(await unzip(await r.arrayBuffer()));
  if (heads.length !== n) throw Error("Invalid wet-cell count in " + key);
  const out = new Uint16Array(c.length);
  n = 0;
  for (let i = 0; i < c.length; i++)
    if (d[i] && (c[i] === 3 || c[i] === 4)) out[i] = heads[n++];
  return out;
}
function rOkCheck(n) {
  return n > 0;
}
// A fixed basin has exactly the same datum at its centre, on opposite banks and across file boundaries.
// Running water interpolates ONLY channel-stage observations. Normalised compact weights extend them into clipped bank faces.
export function headAt(s, x, y) {
  const sb = stageBreak(s, x, y),
    ix = Math.floor(x),
    iy = Math.floor(y);
  let sum = 0,
    stillWeight = 0,
    w = 0,
    nearest = 0,
    best = Infinity,
    code = 0,
    common = true;
  for (let j = iy - 2; j <= iy + 2; j++)
    for (let i = ix - 2; i <= ix + 2; i++) {
      const dx = x - (i + 0.5),
        dy = y - (j + 0.5),
        d = dx * dx + dy * dy;
      if (d >= 3.24) continue;
      const n = s.node(i, j).head;
      if (!n) continue;
      if (sb && (n & 32767) >= sb.midRaw !== sb.upper) continue;
      if (d < best) {
        nearest = n;
        best = d;
      }
      if (!code) code = n;
      else if (code !== n) common = false;
      let f = 1 - d / 3.24;
      f *= f;
      sum += (n & 32767) * f * f;
      w += f * f;
      if (n & 32768) stillWeight += f * f;
    }
  if (!w) {
    for (let j = iy - 6; j <= iy + 6; j++)
      for (let i = ix - 6; i <= ix + 6; i++) {
        const d = (x - i - 0.5) ** 2 + (y - j - 0.5) ** 2;
        if (d >= best) continue;
        const n = s.node(i, j).head;
        if (!n) continue;
        if (sb && (n & 32767) >= sb.midRaw !== sb.upper) continue;
        best = d;
        nearest = n;
      }
  }
  if (!nearest) return null;
  const pool = !!(nearest & 32768);
  return {
    // Uniform pools keep exact flat datum (`common`); distinct basins split cleanly at `stageBreak`; sub-step gradients blend smoothly without Manhattan stair-steps.
    h: (common || !w ? nearest & 32767 : sum / w) / 16 - 64,
    pool,
    still: w ? (common && pool ? 1 : stillWeight / w) : +pool,
  };
}
