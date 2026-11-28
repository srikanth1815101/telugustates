// One local wear map on the actual terrain. No overlapping road polygons, even at a four-way junction.
import * as T from "../vendor/three.module.min.js";
import { ACRE as M, localPoint } from "./metres.js";
export function laneSoil(s, rows, sets, tier = 2) {
  const N = tier >= 2 ? 1024 : 512,
    side = 678,
    at = s.xyz(...s.focus, 0),
    ox = at[0] - side / 2,
    oz = at[2] - side / 2;
  const wrap = [ox, oz, 1 / side, 0];
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d", { alpha: false });
  g.fillStyle = "black";
  g.fillRect(0, 0, N, N);
  const pt = (p) => {
      const q = s.xyz(...p, 0);
      return [((q[0] - ox) * N) / side, ((q[2] - oz) * N) / side];
    },
    near = (p) =>
      Math.max(Math.abs(p[0] - s.focus[0]), Math.abs(p[1] - s.focus[1])) * M <
      side * 0.55;
  let any = false;

  // Oriented swept-earth household courtyards (vakili) aligned to each compound's exact walls and street gate.
  g.lineJoin = "round";
  for (const row of rows) {
    const h = row[5];
    if (!h?.yard || !near(h.centre)) continue;
    any = true;
    const [, d] = h.size_m,
      hw = h.yard.lot[0] * 0.5,
      rear = -d * 0.5 - h.yard.back,
      front = d * 0.5 + h.yard.front,
      corners = [
        [-hw, rear],
        [hw, rear],
        [hw, front],
        [-hw, front],
      ].map(([lx, lz]) => pt(localPoint(h, lx, lz)));
    g.beginPath();
    corners.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.strokeStyle = "rgb(78,78,78)";
    g.lineWidth = (2.1 * N) / side;
    g.stroke();
    g.fillStyle = "rgb(126,126,126)";
    g.fill();
  }

  g.globalCompositeOperation = "lighten";
  for (const v of s.commons) {
    if (!near(v.hub)) continue;
    any = true;
    for (const [spot, radM, peak] of [
      [v.hub, 9.5, 148],
      ...(v.shade ? [[v.shade, 9.2, 162]] : []),
    ]) {
      const [x, y] = pt(spot),
        r = (radM * N) / side,
        gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgb(${peak},${peak},${peak})`);
      gr.addColorStop(0.58, `rgb(112,112,112)`);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  }

  g.lineCap = "round";
  for (const p of sets.flatMap((v) => v.paths)) {
    if (!p.xy.some(near)) continue;
    any = true;
    g.beginPath();
    p.xy.forEach((a, i) => (i ? g.lineTo : g.moveTo).call(g, ...pt(a)));
    for (const [width, grey] of [
      [2.05, 62],
      [1.42, 138],
      [0.86, 232],
    ]) {
      g.strokeStyle = `rgb(${grey},${grey},${grey})`;
      g.lineWidth = ((p.w || 1.3) * width * N) / side;
      g.stroke();
    }
  }
  if (!any) return null;
  const tex = new T.CanvasTexture(c);
  tex.flipY = false;
  tex.colorSpace = T.NoColorSpace;
  if (tier >= 2) {
    tex.minFilter = T.LinearMipmapLinearFilter;
  } else {
    tex.generateMipmaps = false;
    tex.minFilter = T.LinearFilter;
  }
  tex.magFilter = T.LinearFilter;
  wrap[3] = 1;
  return { tex, wrap };
}
