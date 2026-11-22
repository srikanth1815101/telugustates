// HST1 stores a head for each FROZEN wet sample, in the original tile's wet-cell order. No dry DEM height enters the water sheet.
import { url, unzip } from "./grid.js";
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
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
export function isStageCliff(h0, h1) {
  return !!(h0 && h1 && Math.abs((h0 & 32767) - (h1 & 32767)) > 96);
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
function cliffField(cells, wx, wy, midRaw) {
  const beta = 8.5;
  let sHi = 0,
    sLo = 0;
  for (let k = 0; k < cells.length; k += 3) {
    const dx = wx - cells[k],
      dy = wy - cells[k + 1],
      dist = Math.sqrt(dx * dx + dy * dy + 0.018),
      e = Math.exp(-beta * dist);
    if (cells[k + 2] >= midRaw) sHi += e;
    else sLo += e;
  }
  if (sHi <= 1e-12 || sLo <= 1e-12) return null;
  const rimWarp =
    0.052 * Math.sin(wx * 4.6 + wy * 3.8) +
    0.026 * Math.cos(wx * 9.1 - wy * 7.9);
  return (-Math.log(sLo) + Math.log(sHi)) / beta + rimWarp;
}
// A fixed basin has the exact same datum across its interior and file boundaries.
// Gentle reaches blend smoothly; abrupt stage drops (> 2.75 m) form a Rouse M2 drawdown lip, a steep ~82 deg stepped cliff (~8.5 m run), and a 23 m flat-lake plunge zone.
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
    common = true,
    minRaw = 65535,
    maxRaw = 0;
  const cells = [];
  for (let j = iy - 2; j <= iy + 2; j++)
    for (let i = ix - 2; i <= ix + 2; i++) {
      const cx = i + 0.5,
        cy = j + 0.5,
        dx = wx - cx,
        dy = wy - cy,
        d = dx * dx + dy * dy;
      const n = s.node(i, j).head;
      if (!n) continue;
      const raw = n & 32767;
      cells.push(cx, cy, raw);
      if (d < minRaw * 0 + 6.5) {
        if (raw < minRaw) minRaw = raw;
        if (raw > maxRaw) maxRaw = raw;
      }
      if (d >= 3.24) continue;
      if (d < best) {
        nearest = n;
        best = d;
      }
      if (!code) code = n;
      else if (code !== n) common = false;
      let f = 1 - d / 3.24;
      f *= f;
      sum += raw * f * f;
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
  if (!common && w && maxRaw - minRaw > 96 && cells.length >= 6) {
    const midRaw = 0.5 * (minRaw + maxRaw);
    let hiSum = 0,
      hiW = 0,
      loSum = 0,
      loW = 0;
    for (let k = 0; k < cells.length; k += 3) {
      const dx = wx - cells[k],
        dy = wy - cells[k + 1],
        wt = 1 / (0.12 + dx * dx + dy * dy);
      if (cells[k + 2] >= midRaw) {
        hiSum += cells[k + 2] * wt;
        hiW += wt;
      } else {
        loSum += cells[k + 2] * wt;
        loW += wt;
      }
    }
    const sRim = hiW && loW ? cliffField(cells, wx, wy, midRaw) : null;
    if (sRim !== null) {
      const hHi = (hiSum / hiW) / 16 - 64,
        hLo = (loSum / loW) / 16 - 64,
        dropM = Math.max(0, hHi - hLo);
      let tau;
      if (sRim >= 0.13) {
        tau = 1;
      } else if (sRim >= 0.045) {
        // Rouse M2 subcritical-to-critical brink drawdown over ~5.4 m before the cliff edge.
        const q = (0.13 - sRim) / 0.085;
        tau = 1 - 0.055 * q * q * (1.5 - 0.5 * q);
      } else if (sRim > -0.085) {
        // Steep ~82-85 deg waterfall escarpment (~8.3 m horizontal run) with natural rock-stratum ledges.
        const u = (0.045 - sRim) / 0.13,
          baseFall = 1 - u * u * (3 - 2 * u),
          ledge =
            dropM > 14
              ? 0.036 *
                Math.sin(u * Math.PI * 4 + wx * 1.7 + wy * 1.3) *
                Math.sin(Math.PI * u)
              : 0;
        tau = 0.945 * clamp(baseFall + ledge, 0, 1);
      } else {
        tau = 0;
      }
      const cliff =
          sRim > -0.095 && sRim < 0.06
            ? Math.sin(Math.PI * clamp((0.06 - sRim) / 0.155, 0, 1))
            : 0,
        lip =
          sRim >= 0.02 && sRim < 0.14
            ? Math.sin(Math.PI * clamp((0.14 - sRim) / 0.12, 0, 1))
            : 0;
      let plunge = 0,
        stageProg = 0,
        outX = 0,
        outZ = 0;
      if (sRim < 0.13 && sRim > -0.72) {
        if (sRim >= 0.045) {
          stageProg = 0.08 * clamp((0.13 - sRim) / 0.085, 0, 1);
          plunge = stageProg;
        } else if (sRim >= -0.085) {
          stageProg = 0.08 + 0.92 * clamp((0.045 - sRim) / 0.13, 0, 1);
          plunge = stageProg;
        } else {
          const p = clamp((-0.085 - sRim) / 0.635, 0, 1);
          plunge = (1 - p) * (1 - p) * (1 + 1.35 * p);
          stageProg = plunge;
        }
        const eps = 0.035,
          sx =
            (cliffField(cells, wx - eps, wy, midRaw) ?? sRim) -
            (cliffField(cells, wx + eps, wy, midRaw) ?? sRim),
          sy =
            (cliffField(cells, wx, wy - eps, midRaw) ?? sRim) -
            (cliffField(cells, wx, wy + eps, midRaw) ?? sRim),
          gL = Math.hypot(sx, sy);
        if (gL > 1e-5) {
          outX = sx / gL;
          outZ = -sy / gL;
        }
      }
      return {
        h: hLo + (hHi - hLo) * tau,
        pool,
        still:
          cliff > 0.02 || plunge > 0.08
            ? 0
            : (stillWeight / w) * (1 - plunge),
        cliff,
        lip,
        plunge: stageProg,
        sRim,
        dropM,
        hHi,
        hLo,
        outX,
        outZ,
      };
    }
  }
  return {
    h: (common || !w ? nearest & 32767 : sum / w) / 16 - 64,
    pool,
    still: w ? (common && pool ? 1 : stillWeight / w) : +pool,
    cliff: 0,
    lip: 0,
    plunge: 0,
    sRim: 1,
    dropM: 0,
    outX: 0,
    outZ: 0,
  };
}
