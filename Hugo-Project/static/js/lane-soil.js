// One local wear map on the actual terrain. No overlapping road polygons, even at a four-way junction.
import * as T from "../vendor/three.module.min.js";
import { ACRE as M, localPoint } from "./metres.js";
export function laneSoil(s, rows, sets) {
  const N = 1024,
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
  for (const row of rows) {
    const h = row[5];
    if (!h.yard || !near(h.centre)) continue;
    any = true;
    const [w, d] = h.size_m;
    const yc = d * 0.27;
    const p = pt(localPoint(h, h.door_x, yc + 1.8));
    const radius = (Math.max(w, d) * 0.68 * N) / side,
      gradient = g.createRadialGradient(p[0], p[1], 0.4, p[0], p[1], radius);
    gradient.addColorStop(0, "rgb(103,103,103)");
    gradient.addColorStop(0.45, "rgb(91,91,91)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gradient;
    g.fillRect(p[0] - radius, p[1] - radius, 2 * radius, 2 * radius);
  }
  for (const v of s.commons) {
    if (!near(v.hub)) continue;
    any = true;
    const [x, y] = pt(v.hub),
      r = (4.9 * N) / side,
      gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "#9b9b9b");
    gr.addColorStop(0.48, "#858585");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  g.lineCap = g.lineJoin = "round";
  g.globalCompositeOperation = "lighten";
  for (const p of sets.flatMap((v) => v.paths)) {
    if (!p.xy.some(near)) continue;
    any = true;
    g.beginPath();
    p.xy.forEach((a, i) => (i ? g.lineTo : g.moveTo).call(g, ...pt(a)));
    for (const [width, grey] of [
      [1.9, 49],
      [1.36, 125],
      [0.83, 226],
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
  tex.minFilter = T.LinearMipmapLinearFilter;
  tex.magFilter = T.LinearFilter;
  wrap[3] = 1;
  return { tex, wrap };
}
