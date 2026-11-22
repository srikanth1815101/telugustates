import * as T from "../vendor/three.module.min.js";
import { basis, localPoint } from "./metres.js";
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
    { gx, gy, boardW } = nameboardSpot(h);
    base = s.xyz(gx, gy, s.ground(gx, gy)),
    caption = String(h.sign?.label || ""),
    label = (caption.match(/@?[a-z0-9_.]+/gi) || []).some(
      (token) => token.replace(/^@/, "").toLowerCase() === u.toLowerCase(),
    )
      ? caption
      : "@" + u,
    wood = h.sign?.wood || "#523424",
    trim = h.sign?.trim || "#d3ba7e";
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 208;
  const a = c.getContext("2d");
  const g = a.createLinearGradient(0, 0, 0, 208);
  g.addColorStop(0, "#264c41");
  g.addColorStop(1, "#112e2b");
  a.fillStyle = g;
  a.fillRect(0, 0, 640, 208);
  a.strokeStyle = trim;
  a.lineWidth = 4;
  a.strokeRect(13, 12, 614, 184);
  a.lineWidth = 1;
  a.strokeRect(20, 19, 600, 170);
  a.textAlign = "center";
  // One high-contrast inscription, painted directly onto the face. No screen-space duplicate.
  a.fillStyle = "#fff7df";
  a.font = "bold 102px sans-serif";
  let px = Math.min(
    102,
    Math.floor((102 * 572) / Math.max(1, a.measureText(label).width)),
  );
  a.font = `bold ${px}px sans-serif`;
  a.textBaseline = "middle";
  a.fillText(label, 320, 106, 576);
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
