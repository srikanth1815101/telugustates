// HST1 stores a head for each FROZEN wet sample, in the original tile's wet-cell order. No dry DEM height enters the water sheet.
import { url, unzip } from "./grid.js";
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
export async function readHeads(key, d, c) {
  let n = 0;
  for (let i = 0; i < c.length; i++)
    if (d[i] && (c[i] === 3 || c[i] === 4)) n++;
  if (!n) return null;
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
// A fixed basin has exactly the same datum at its centre, on opposite banks and across file boundaries.
// When distinct stages meet across a drop, organically warped smooth weights form a natural spillway crest without Manhattan stair-steps or hollow ridges.
export function headAt(s, x, y) {
  const [wx, wy] = warpWaterXY(x, y),
    ix = Math.floor(wx),
    iy = Math.floor(wy);
  let sum = 0,
    stillWeight = 0,
    w = 0,
    nearest = 0,
    best = Infinity,
    code = 0,
    common = true;
  for (let j = iy - 2; j <= iy + 2; j++)
    for (let i = ix - 2; i <= ix + 2; i++) {
      const dx = wx - (i + 0.5),
        dy = wy - (j + 0.5),
        d = dx * dx + dy * dy;
      if (d >= 3.24) continue;
      const n = s.node(i, j).head;
      if (!n) continue;
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
    const jx = Math.floor(x),
      jy = Math.floor(y);
    for (let j = jy - 6; j <= jy + 6; j++)
      for (let i = jx - 6; i <= jx + 6; i++) {
        const d = (x - i - 0.5) ** 2 + (y - j - 0.5) ** 2;
        if (d >= best) continue;
        const n = s.node(i, j).head;
        if (n) {
          best = d;
          nearest = n;
        }
      }
  }
  if (!nearest) return null;
  const pool = !!(nearest & 32768);
  return {
    h: (common || !w ? nearest & 32767 : sum / w) / 16 - 64,
    pool,
    still: w ? (common && pool ? 1 : stillWeight / w) : +pool,
  };
}
