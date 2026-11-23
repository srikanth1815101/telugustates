// Intricate traditional muggu (kolam / rangoli) for the doorway threshold.
// A single procedural canvas decal — hand-drawn white line work with terracotta,
// turmeric-gold and leaf-green accents over bare earth. Eight-fold symmetry like
// a pulli kolam drawn from a dot grid: bundula dot ring, two interlocking stars,
// petal rosettes, Sikku arcs and a threshold frame. No geometric primitives.
import * as T from "../vendor/three.module.min.js";
import { localPoint } from "./metres.js";

const TAU = Math.PI * 2;
let tex = null,
  material = null;

function mugguTexture() {
  if (tex) return tex;
  const S = 1024,
    cnv = document.createElement("canvas");
  cnv.width = cnv.height = S;
  const ctx = cnv.getContext("2d"),
    C = S / 2,
    white = "rgba(247,244,230,0.97)",
    soft = "rgba(247,244,230,0.82)",
    terra = "#c86d49",
    gold = "#e7be58",
    leaf = "#6f8a58";
  // deterministic wobble so the line feels drawn, not machined
  let w = 987654321;
  const rnd = () => ((w = (w * 1664525 + 1013904223) >>> 0) / 4294967296);
  const jit = (amp) => (rnd() - 0.5) * amp;
  ctx.clearRect(0, 0, S, S);
  ctx.lineCap = ctx.lineJoin = "round";

  const dot = (x, y, r, col = white) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  };
  const ring = (x, y, r, lw, col = white, dash = null) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  const star = (n, rOut, rIn, rot, lw, col = white) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? rIn : rOut,
        a = rot + (i * Math.PI) / n;
      const x = C + Math.cos(a) * r + jit(3.5),
        y = C + Math.sin(a) * r + jit(3.5);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  };
  const petal = (angle, r0, len, wid, lw, col, fill = null) => {
    // a leaf-shaped petal growing outward from r0 along `angle`
    const ux = Math.cos(angle),
      uy = Math.sin(angle),
      px = -uy,
      py = ux;
    const bx = C + ux * r0,
      by = C + uy * r0,
      tx = C + ux * (r0 + len),
      ty = C + uy * (r0 + len),
      mx = C + ux * (r0 + len * 0.52),
      my = C + uy * (r0 + len * 0.52);
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    if (fill) ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(bx + jit(2), by + jit(2));
    ctx.quadraticCurveTo(mx + px * wid + jit(2), my + py * wid + jit(2), tx + jit(2), ty + jit(2));
    ctx.quadraticCurveTo(mx - px * wid + jit(2), my - py * wid + jit(2), bx + jit(2), by + jit(2));
    ctx.closePath();
    if (fill) ctx.fill();
    ctx.stroke();
  };
  const arcBetween = (angle, r, rad, lw, col = white) => {
    const x = C + Math.cos(angle) * r,
      y = C + Math.sin(angle) * r;
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(x, y, rad, angle + Math.PI * 0.78, angle + Math.PI * 2.22);
    ctx.stroke();
  };

  // ---- threshold frame: double line with chamfered corners and gold corner dots ----
  const m = 34,
    ch = 46;
  ctx.strokeStyle = soft;
  ctx.lineWidth = 6.5;
  const sq = [
    [m + ch, m], [S - m - ch, m],
    [S - m, m + ch], [S - m, S - m - ch],
    [S - m - ch, S - m], [m + ch, S - m],
    [m, S - m - ch], [m, m + ch],
  ];
  ctx.moveTo(sq[0][0], sq[0][1]);
  for (let i = 1; i < sq.length; i++) ctx.lineTo(sq[i][0], sq[i][1]);
  ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = gold;
  for (const [cx, cy] of sq) dot(cx, cy, 9, gold);

  // ---- outer bundula ring: 32 white dots with turmeric accents ----
  const R1 = 436;
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TAU + TAU / 64,
      x = C + Math.cos(a) * R1 + jit(4),
      y = C + Math.sin(a) * R1 + jit(4);
    if (i % 4 === 0) dot(x, y, 13, gold);
    else dot(x, y, 12.5, white);
  }
  ring(C, C, 414, 7.5, white);
  ring(C, C, 388, 3.2, soft);

  // ---- interlocking stars (sixteen-point, rotated pair) ----
  star(16, 356, 262, -Math.PI / 2, 15, white);
  star(16, 320, 232, -Math.PI / 2 + Math.PI / 16, 6, terra);
  star(8, 300, 226, -Math.PI / 2 + Math.PI / 8, 5, soft);

  // sikku arcs nestling in the sixteen valleys
  for (let i = 0; i < 16; i++)
    arcBetween(-Math.PI / 2 + (i + 0.5) * (TAU / 16), 268, 40, 5.5, white);

  // ---- bundula dots between stars and rosette ----
  for (let i = 0; i < 16; i++) {
    const a = -Math.PI / 2 + (i + 0.5) * (TAU / 16);
    dot(C + Math.cos(a) * 330, C + Math.sin(a) * 330, 7.5, gold);
  }
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i + 0.5) * (TAU / 8);
    dot(C + Math.cos(a) * 243, C + Math.sin(a) * 243, 6.8, white);
  }

  // ---- eight white petals with terracotta hearts ----
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 8;
    petal(a, 128, 96, 34, 10.5, white);
    petal(a, 142, 66, 17, 5.5, terra);
    dot(C + Math.cos(a) * 118, C + Math.sin(a) * 118, 5.6, leaf);
  }
  ring(C, C, 126, 6, white);
  ring(C, C, 111, 2.6, terra);

  // ---- central rosette: eight teardrops, turmeric heart ----
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 8 + TAU / 16;
    petal(a, 26, 66, 15, 8, white);
  }
  dot(C, C, 26, gold);
  ring(C, C, 26, 4, terra);
  dot(C, C, 7.5, white);

  // faint rice-flour speckle for an organic chalk feel
  ctx.fillStyle = "rgba(247,244,230,0.5)";
  for (let i = 0; i < 240; i++) {
    const a = rnd() * TAU,
      r = 40 + rnd() * 420;
    ctx.fillRect(C + Math.cos(a) * r, C + Math.sin(a) * r, 1.6, 1.6);
  }

  tex = new T.CanvasTexture(cnv);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function mugguMaterial() {
  if (!material)
    material = new T.MeshLambertMaterial({
      map: mugguTexture(),
      transparent: true,
      alphaTest: 0.05,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
  return material;
}

/** Queue a threshold muggu decal; residents() drains this into real meshes. */
export function queueMuggu(s, h, lx, lz, yaw) {
  const [x, y] = localPoint(h, lx, lz);
  s.mugguDecals = s.mugguDecals || [];
  s.mugguDecals.push({ x, y, yaw, ground: s.ground(x, y) });
}

/** Drain queued decals into one reusable plane per home. Call after makeHouse(). */
export function drainMuggus(s, group) {
  const decals = s.mugguDecals;
  if (!decals?.length) return;
  s.mugguDecals = [];
  const geo = new T.PlaneGeometry(1.58, 1.58);
  geo.rotateX(-Math.PI / 2);
  geo.userData = { muggu: true };
  const mat = mugguMaterial();
  for (const d of decals) {
    const [X, H, Z] = s.xyz(d.x, d.y, d.ground + 0.028);
    const mesh = new T.Mesh(geo, mat);
    mesh.position.set(X, H, Z);
    mesh.rotation.y = d.yaw || 0;
    mesh.renderOrder = 2;
    mesh.receiveShadow = true;
    mesh.userData = { role: "muggu", glow: 0, cullable: true };
    group.add(mesh);
  }
}
