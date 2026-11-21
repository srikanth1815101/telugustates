import { fittings } from "./room-fittings.js";
import * as T from "../vendor/three.module.min.js";
import { basis, localPoint } from "./metres.js";
import { roomPlan } from "./home-volume.js";
// Hollow ground-floor shell, framed openings and furnishings. Exterior and interior occupy the same footprint and use the same floor.
export function buildRoom(h, paint, detail = true) {
  const p = roomPlan(h),
    { cx, cz, w, d, front, door, dw, dh, top, floor: F } = p;
  const box = (x, y, z, w, H, d, c, rot = 0) =>
      paint("room", "slab", x, y, z, w, H, d, c, rot),
    [accent, trim, wood, floorColor, wallTint, ceiling] = p.design.palette,
    lime = h.wall_color;
  const wash = new T.Color(wallTint).lerp(
    new T.Color(accent),
    0.25 + (p.design.wall === 3 ? 0.2 : 0),
  );
  for (const f of p.faces) {
    const nx = Math.sin(f.rot),
      nz = Math.cos(f.rot),
      sg = (cx - f.x) * nx + (cz - f.z) * nz > 0 ? 1 : -1;
    const faceColour =
      Math.abs(nz) > 0.45 && f.z < cz && p.design.wall !== 2 ? wash : wallTint;
    const lining = (lo, hi, col = faceColour, off = 0.084) => {
      if (hi - lo > 0.013)
        box(
          f.x + sg * off * nx,
          (lo + hi) / 2,
          f.z + sg * off * nz,
          f.len + 0.003,
          hi - lo,
          0.005,
          col,
          f.rot,
        );
    };
    const rail = (lo, hi, color, dep = p.wall) => {
      if (hi - lo > 0.002)
        box(f.x, (lo + hi) / 2, f.z, f.len + 0.015, hi - lo, dep, color, f.rot);
    };
    if (!detail) {
      if (f.kind === "door") rail(F + dh, top, trim);
      else if (f.kind === "window") {
        rail(F - 0.07, F + 0.93, lime);
        rail(Math.min(top - 0.22, F + 1.75), top, lime);
      } else rail(F - 0.07, top, lime);
      continue;
    }
    if (f.kind === "wall") {
      rail(F - 0.07, top, lime);
      lining(F, top);
      rail(
        F - 0.03,
        F + 0.26 + p.design.wall * 0.072,
        p.design.wall % 2 ? wood : floorColor,
        0.176,
      );
      rail(
        F + 0.25 + p.design.wall * 0.072,
        F + 0.3 + p.design.wall * 0.072,
        trim,
        0.184,
      );
    } else if (f.kind === "window") {
      const sill = F + 0.93,
        head = Math.min(top - 0.22, sill + 0.82);
      rail(F - 0.07, sill, lime);
      rail(head, top, lime);
      lining(F, sill);
      lining(head, top);
      rail(
        F - 0.03,
        F + 0.26 + p.design.wall * 0.072,
        p.design.wall % 2 ? wood : floorColor,
        0.176,
      );
      rail(
        F + 0.25 + p.design.wall * 0.072,
        F + 0.3 + p.design.wall * 0.072,
        trim,
        0.184,
      );
      rail(sill - 0.07, sill + 0.06, trim, 0.25);
      for (const [x, z] of [f.A, f.B])
        box(x, (sill + head) / 2, z, 0.08, head - sill, 0.19, wood, f.rot);
      rail(head - 0.04, head + 0.05, wood, 0.19);
      box(f.x, (sill + head) / 2, f.z, 0.055, head - sill, 0.15, wood, f.rot);
      rail(
        sill + (head - sill) * 0.4,
        sill + (head - sill) * 0.4 + 0.045,
        wood,
        0.13,
      );
    } else {
      rail(F + dh, top, trim);
      lining(F + dh, top);
    }
    if (f.kind !== "door" && p.design.wall === 1) {
      lining(F + 0.3, F + 0.79, wash, 0.091);
      lining(F + 0.78, F + 0.82, wood, 0.095);
    }
    if (f.kind !== "door" && p.design.wall === 3)
      lining(top - 0.18, top - 0.1, trim, 0.093);
  }
  const style = h.style;
  paint(
    "plinth",
    p.round ? "round-floor" : "slab",
    cx,
    F - 0.228,
    cz,
    w + 0.03,
    0.4,
    d + 0.03,
    "#b49870",
  );
  paint(
    "floor",
    p.round ? "round-floor" : "slab",
    cx,
    F - 0.014,
    cz,
    w - 0.175,
    0.028,
    d - 0.175,
    floorColor,
  );
  paint(
    "ceiling",
    p.round ? "round-floor" : "slab",
    cx,
    top - 0.045,
    cz,
    w - 0.08,
    0.09,
    d - 0.08,
    ceiling,
  );
  for (const side of [-1, 1])
    box(
      door + side * (dw / 2 + 0.055),
      F + dh / 2,
      front,
      0.105,
      dh + 0.14,
      0.245,
      wood,
    );
  box(door, F + dh + 0.06, front, dw + 0.22, 0.12, 0.245, wood);
  box(door, 0.07, front + 0.41, dw + 0.52, 0.14, 0.82, "#b8a385");
  if (detail) fittings(p, paint);
}
export function doorLeaf(s, h, u) {
  const p = roomPlan(h),
    g = new T.Group(),
    hinge = new T.Group();
  g.position.fromArray(
    s.xyz(
      ...localPoint(h, p.door - p.dw / 2, p.front),
      s.ground(...h.centre) + p.floor,
    ),
  );
  g.rotation.y = basis(h).yaw;
  g.add(hinge);
  const positions = [],
    colors = [],
    normals = [],
    unit = new T.BoxGeometry().toNonIndexed(),
    pos = unit.attributes.position,
    nor = unit.attributes.normal,
    tint = new T.Color();
  const bits = (x, y, z, w, H, d, c) => {
    tint.set(c);
    for (let i = 0; i < pos.count; i++) {
      positions.push(
        x + pos.getX(i) * w,
        y + pos.getY(i) * H,
        z + pos.getZ(i) * d,
      );
      colors.push(tint.r, tint.g, tint.b);
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
    }
  };
  bits(p.dw / 2, p.dh / 2, 0, p.dw - 0.044, p.dh - 0.035, 0.082, "#734e35");
  for (const z of [-0.05, 0.05]) {
    for (const y of [0.25, 0.72])
      bits(p.dw / 2, p.dh * y, z, p.dw * 0.77, p.dh * 0.32, 0.031, "#966f4b");
    bits(p.dw - 0.15, p.dh * 0.49, z * 1.55, 0.14, 0.045, 0.055, "#e1c485");
  }
  unit.dispose();
  const geo = new T.BufferGeometry();
  for (const [k, v] of [
    ["position", positions],
    ["normal", normals],
    ["color", colors],
  ])
    geo.setAttribute(k, new T.Float32BufferAttribute(v, 3));
  geo.computeBoundingSphere();
  const mesh = new T.Mesh(
    geo,
    new T.MeshLambertMaterial({ vertexColors: true }),
  );
  mesh.userData = { role: "door-leaf-part", disposableMaterial: true };
  hinge.add(mesh);
  g.userData = { role: "hinged-front-door", owner: u, hinge };
  return g;
}
