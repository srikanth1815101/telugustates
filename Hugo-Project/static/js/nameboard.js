import * as T from "../vendor/three.module.min.js";
import { basis, localPoint } from "./metres.js";
import { houseLabel } from "./resident-id.js";
// A real wayside object, not a screen label. Rest it beside the gateway behind the low compound wall, never across the opening.
export function nameboardSpot(h) {
  const [w, d] = h.size_m,
    yard = h.yard,
    lotW = yard ? yard.lot[0] : w + 2.4,
    frontSpan = yard ? yard.front : h.setback_m,
    halfW = lotW * 0.5 - 0.16,
    frontExt = d * 0.5 + frontSpan - 0.16,
    gapLo = Math.max(-halfW + 0.42, h.door_x - 1.75),
    gapHi = Math.min(halfW - 0.42, h.door_x + 1.75),
    leftWing = gapLo - -halfW,
    rightWing = halfW - gapHi,
    preferRight = rightWing >= leftWing,
    primaryWing = preferRight ? rightWing : leftWing,
    boardW = Math.min(2.92, Math.max(1.84, primaryWing - 0.24)),
    halfBoard = (boardW + 0.12) * 0.5,
    zIn = frontExt - 0.28,
    xRight = Math.min(halfW - halfBoard - 0.06, gapHi + halfBoard + 0.22),
    xLeft = Math.max(-halfW + halfBoard + 0.06, gapLo - halfBoard - 0.22),
    candidates = [];
  if (rightWing >= 1.9) candidates.push([xRight, zIn]);
  if (leftWing >= 1.9) candidates.push([xLeft, zIn]);
  if (!preferRight && candidates.length === 2) candidates.reverse();
  const chosen =
    candidates[0] || [
      preferRight ? (gapHi + halfW) * 0.5 : (-halfW + gapLo) * 0.5,
      zIn,
    ];
  const [gx, gy] = localPoint(h, chosen[0], chosen[1]);
  return { gx, gy, boardW };
}

export function nameboard(group, s, h, u, put) {
  const b = basis(h),
    { gx, gy, boardW } = nameboardSpot(h),
    base = s.xyz(gx, gy, s.ground(gx, gy)),
    label = houseLabel(h),
    wood = h.sign?.wood || "#523424",
    trim = h.sign?.trim || "#d3ba7e";
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 208;
  const a = c.getContext("2d");
  // Hand-painted signboard: dark teak planks washed with age, chalk lettering, brass studs.
  // Warm and village-made — no official green, no printed look.
  const g = a.createLinearGradient(0, 0, 0, 208);
  g.addColorStop(0, "#463322");
  g.addColorStop(0.5, "#38291d");
  g.addColorStop(1, "#2b2015");
  a.fillStyle = g;
  a.fillRect(0, 0, 640, 208);
  // Plank seams and a little grain wobble
  a.strokeStyle = "rgba(20,13,8,0.55)";
  a.lineWidth = 3;
  for (const y of [69, 138]) {
    a.beginPath();
    a.moveTo(0, y);
    for (let x = 0; x <= 640; x += 32) a.lineTo(x, y + Math.sin(x * 0.045 + y) * 1.6);
    a.stroke();
  }
  a.strokeStyle = "rgba(233,220,189,0.10)";
  a.lineWidth = 1.4;
  for (let i = 0; i < 9; i++) {
    const y = 22 + i * 21 + Math.sin(i * 2.7) * 5;
    a.beginPath();
    a.moveTo(18 + (i * 37) % 60, y);
    a.lineTo(622 - ((i * 53) % 80), y + Math.sin(i * 1.3) * 2);
    a.stroke();
  }
  // Chalk border, wobbly like a hand-cut stencil
  a.strokeStyle = "#e9dcbd";
  a.lineJoin = "round";
  a.lineWidth = 6.5;
  a.beginPath();
  a.rect(16, 15, 608, 178);
  a.stroke();
  a.lineWidth = 1.8;
  a.globalAlpha = 0.85;
  a.beginPath();
  a.rect(25, 24, 590, 160);
  a.stroke();
  a.globalAlpha = 1;
  // Brass studs in the corners
  for (const [sx, sy] of [
    [39, 38],
    [601, 38],
    [39, 170],
    [601, 170],
  ]) {
    a.fillStyle = "#c9a24a";
    a.beginPath();
    a.arc(sx, sy, 7, 0, Math.PI * 2);
    a.fill();
    a.fillStyle = "#8a6b28";
    a.beginPath();
    a.arc(sx, sy, 2.6, 0, Math.PI * 2);
    a.fill();
  }
  a.textAlign = "center";
  // One heavy hand-painted inscription, painted directly onto the face. No screen-space duplicate.
  a.shadowColor = "rgba(0,0,0,0.5)";
  a.shadowBlur = 3;
  a.shadowOffsetY = 2.5;
  a.fillStyle = "#f6ead0";
  const fontStack = '"Trebuchet MS", "Arial Black", Verdana, sans-serif';
  a.font = `900 96px ${fontStack}`;
  let px = Math.min(
    96,
    Math.floor((96 * 572) / Math.max(1, a.measureText(label).width)),
  );
  a.font = `900 ${px}px ${fontStack}`;
  a.textBaseline = "middle";
  a.fillText(label, 320, 108, 560);
  a.shadowColor = "transparent";
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 2;
  const mat = new T.MeshBasicMaterial({ map: tex }),
    m = new T.Mesh(new T.PlaneGeometry(boardW, 0.89), mat),
    postSpan = Math.min(0.91, boardW * 0.34);
  const [X, H, Z] = base;
  m.rotation.y = b.yaw;
  m.position.set(
    X + Math.sin(b.yaw) * 0.086,
    H + 1.42,
    Z + Math.cos(b.yaw) * 0.086,
  );
  m.userData = {
    role: "username-nameboard",
    label,
    owner: u,
    wood,
    trim,
    disposableMaterial: true,
  };
  group.add(m);
  put(
    "sign",
    "slab",
    X,
    H + 1.42,
    Z,
    boardW + 0.11,
    0.97,
    0.16,
    wood,
    null,
    b.yaw,
  );
  for (const j of [-1, 1])
    put(
      "sign",
      "slab",
      X + j * postSpan * Math.cos(b.yaw),
      H + 0.65,
      Z - j * postSpan * Math.sin(b.yaw),
      0.11,
      1.62,
      0.12,
      wood,
      null,
      b.yaw,
    );
  (group.userData.names ??= []).push({
    u,
    label,
    wood,
    trim,
    x: gx,
    y: gy,
    z: H + 1.43,
    fx: b.fx,
    fy: b.fy,
    model: h.archetype,
    wall: h.wall_color,
  });
}
