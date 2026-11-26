// Sri Venkateswara Temple, Tirumala — stone architecture on the surveyed
// 853 m plateau, facing the pilgrim approach from the GNC gate: granite
// plinth and prakaram wall, the Ananda Nilayam sanctum with its gold vimana,
// a pillared mandapam, the dhwajasthambam, and the deity standing inside the
// garbhagriha. The Gali Gopuram tower (visible from all of Tirupati) and the
// Padala Mandapam pavilion at the first step mark the ends of the mettu paths.
// Authored primitives with vertex-lit Lambert materials match the house and
// stonework style; gold parts carry userData.glow so the night pass lights
// the vimana the way the real gopuram glows after dark.
import * as T from "../vendor/three.module.min.js";
import { ACRE as U } from "./metres.js";

const GRANITE = 0x9a9184,
  STONE = 0x877e70,
  DARKSTONE = 0x6e675c,
  GOLD = 0xdfb05c,
  DEITY = 0x3c3028,
  SAFFRON = 0xe8792a,
  WATER = 0x2e6f8e;

function mat(color, glow) {
  const m = new T.MeshLambertMaterial({ color });
  if (glow) m.emissive = new T.Color(color).multiplyScalar(glow);
  m.userData = { disposableMaterial: true };
  return m;
}

function box(w, h, d, color, glow) {
  return new T.Mesh(new T.BoxGeometry(w, h, d), mat(color, glow));
}

function cyl(rTop, rBot, h, color, glow, seg = 10) {
  return new T.Mesh(new T.CylinderGeometry(rTop, rBot, h, seg), mat(color, glow));
}

function cone(r, h, color, glow, seg = 8) {
  return new T.Mesh(new T.ConeGeometry(r, h, seg), mat(color, glow));
}

function place(m, x, y, z) {
  m.position.set(x, y, z);
  return m;
}

// Diminishing stone tiers crowned by a gold shikhara and kalasham finial.
function tieredTower(baseW, baseD, tiers, tierH, topW) {
  const g = new T.Group();
  let w = baseW,
    d = baseD,
    y = 0;
  for (let i = 0; i < tiers; i++) {
    const t = box(w, tierH, d, i % 2 ? STONE : GRANITE);
    place(t, 0, y + tierH / 2, 0);
    g.add(t);
    const ledge = box(w + 0.5, 0.22, d + 0.5, DARKSTONE);
    place(ledge, 0, y + tierH + 0.11, 0);
    g.add(ledge);
    y += tierH + 0.22;
    w = Math.max(topW, w - (baseW - topW) / tiers);
    d = Math.max(topW * 0.8, d - (baseD - topW * 0.8) / tiers);
  }
  const cap = cone((w + d) / 4, 1.5, GOLD, 0.42, 4);
  place(cap, 0, y + 0.75, 0);
  cap.rotation.y = Math.PI / 4;
  g.add(cap);
  const pot = cyl(0.16, 0.24, 0.55, GOLD, 0.5, 8);
  place(pot, 0, y + 1.75, 0);
  g.add(pot);
  g.userData.glowHeight = y + 2;
  return g;
}

// The standing Lord inside the garbhagriha, on a lotus pedestal.
function deity() {
  const g = new T.Group();
  const lotus = cyl(0.62, 0.74, 0.3, STONE, 0, 12);
  place(lotus, 0, 0.15, 0);
  g.add(lotus);
  const body = cyl(0.34, 0.46, 1.42, DEITY, 0, 10);
  place(body, 0, 1.01, 0);
  g.add(body);
  for (const side of [-1, 1]) {
    const arm = cyl(0.09, 0.11, 0.62, DEITY, 0, 6);
    place(arm, side * 0.44, 1.28, 0.06);
    arm.rotation.z = side * 0.5;
    g.add(arm);
    const hand = new T.Mesh(new T.SphereGeometry(0.1, 8, 6), mat(GOLD, 0.25));
    place(hand, side * 0.66, 1.52, 0.1);
    g.add(hand);
  }
  const crown = cone(0.2, 0.42, GOLD, 0.4, 8);
  place(crown, 0, 2.0, 0);
  g.add(crown);
  return g;
}

function templeComplex(s, stop, face) {
  const root = new T.Group(),
    [gx, gy] = stop.point,
    z = s.ground(gx, gy);
  root.position.set(...s.xyz(gx, gy, z));
  root.rotation.y = face;
  // Granite plinth and prakaram compound wall with an east entrance gap.
  const plinth = box(24, 1.1, 19, GRANITE);
  place(plinth, 0, 0.55, 0);
  root.add(plinth);
  const W = 2.2,
    TH = 0.55,
    X = 11.6,
    Z = 9.2,
    GAP = 3.2;
  for (const [w, h, d, x, zz] of [
    [24, W, TH, 0, -Z], // back
    [TH, W, 19, -X, 0], // west
    [TH, W, 19, X, 0], // east
    [(24 - GAP) / 2, W, TH, -(GAP + (24 - GAP) / 4), Z],
    [(24 - GAP) / 2, W, TH, GAP + (24 - GAP) / 4, Z],
  ]) {
    const wall = box(w, h, d, DARKSTONE);
    place(wall, x, 1.1 + W / 2, zz);
    root.add(wall);
  }
  // Entrance gopuram over the gap: door jambs, lintel, then the tiered tower.
  for (const side of [-1, 1]) {
    const jamb = box(0.7, 4.4, 1.3, STONE);
    place(jamb, side * (GAP / 2 + 0.35), 3.3, Z);
    root.add(jamb);
  }
  const lintel = box(GAP + 1.4, 0.8, 1.3, DARKSTONE);
  place(lintel, 0, 5.9, Z);
  root.add(lintel);
  const gopuram = tieredTower(GAP + 1.6, 2.6, 5, 1.5, 2.2);
  gopuram.position.set(0, 6.3, Z);
  root.add(gopuram);
  // Pillared mandapam in front of the sanctum.
  for (const px of [-3.4, 0, 3.4])
    for (const pz of [1.2, 4.6]) {
      const pillar = cyl(0.26, 0.32, 3.4, STONE, 0, 10);
      place(pillar, px, 2.8, pz);
      root.add(pillar);
      const cap = box(0.85, 0.28, 0.85, DARKSTONE);
      place(cap, px, 4.62, pz);
      root.add(cap);
    }
  const hall = box(9.6, 0.75, 6.4, GRANITE);
  place(hall, 0, 4.95, 2.9);
  root.add(hall);
  // Ananda Nilayam: the sanctum with the gold vimana and the deity inside.
  const sanctum = box(6.2, 4.6, 6.2, DARKSTONE);
  place(sanctum, 0, 3.4, -5.6);
  root.add(sanctum);
  for (const side of [-1, 1]) {
    const jamb = box(0.6, 2.9, 0.7, STONE);
    place(jamb, side * 0.85, 2.55, -2.55);
    root.add(jamb);
  }
  const doorLintel = box(2.4, 0.6, 0.7, STONE);
  place(doorLintel, 0, 4.3, -2.55);
  root.add(doorLintel);
  const vimana = tieredTower(5.8, 5.8, 3, 1.35, 2.6);
  vimana.position.set(0, 5.7, -5.6);
  root.add(vimana);
  const idol = deity();
  idol.position.set(0, 1.1, -5.6);
  root.add(idol);
  // Dhwajasthambam: the gold-topped flagstaff in the forecourt.
  const pole = cyl(0.09, 0.12, 7, GOLD, 0.35, 8);
  place(pole, 0, 4.6, 7.6);
  root.add(pole);
  const flag = box(1.15, 0.7, 0.05, SAFFRON);
  place(flag, 0.62, 7.5, 7.6);
  root.add(flag);
  // Swami Pushkarini: the temple tank north of the complex, with a stone rim.
  const tank = new T.Group();
  const rim = 16,
    rimD = 12;
  for (const [w, d, x, zz] of [
    [rim + 1, 1, 0, -rimD / 2],
    [rim + 1, 1, 0, rimD / 2],
    [1, rimD, -rim / 2, 0],
    [1, rimD, rim / 2, 0],
  ]) {
    const kerb = box(w, 0.85, d, GRANITE);
    place(kerb, x, 0.42, zz);
    tank.add(kerb);
  }
  const water = new T.Mesh(
    new T.PlaneGeometry(rim - 0.8, rimD - 0.8),
    mat(WATER, 0.12),
  );
  water.rotation.x = -Math.PI / 2;
  place(water, 0, 0.52, 0);
  tank.add(water);
  const [tx, ty] = [gx + 2.5 / U, gy + 22 / U];
  tank.position.set(...s.xyz(tx, ty, s.ground(tx, ty)));
  tank.rotation.y = face;
  const group = new T.Group();
  group.add(root, tank);
  return group;
}

// Gali Gopuram — the wind tower on the covered stairway, seen from all of Tirupati.
function galiTower(s, stop) {
  const [gx, gy] = stop.point,
    z = s.ground(gx, gy),
    root = new T.Group();
  root.position.set(...s.xyz(gx, gy, z));
  root.rotation.y = stop.yaw || 0;
  const base = box(6.4, 3.2, 5, GRANITE);
  place(base, 0, 1.6, 0);
  root.add(base);
  for (const side of [-1, 1]) {
    const jamb = box(0.8, 2.6, 1.1, STONE);
    place(jamb, side * 1.3, 1.3, 2.3);
    root.add(jamb);
  }
  const arch = box(2.8, 0.7, 1.1, DARKSTONE);
  place(arch, 0, 2.95, 2.3);
  root.add(arch);
  const tower = tieredTower(5.6, 4.4, 4, 1.5, 2.1);
  tower.position.set(0, 3.2, 0);
  root.add(tower);
  return root;
}

// Padala Mandapam — the stone pavilion where the 3,550 steps begin.
function padalaMandapam(s, stop) {
  const [gx, gy] = stop.point,
    z = s.ground(gx, gy),
    root = new T.Group();
  root.position.set(...s.xyz(gx, gy, z));
  root.rotation.y = stop.yaw || 0;
  const deck = box(5.6, 0.9, 5.6, GRANITE);
  place(deck, 0, 0.45, 0);
  root.add(deck);
  for (const px of [-2, 2])
    for (const pz of [-2, 2]) {
      const pillar = cyl(0.24, 0.3, 3, STONE, 0, 10);
      place(pillar, px, 2.4, pz);
      root.add(pillar);
    }
  const roof = box(6, 0.6, 6, DARKSTONE);
  place(roof, 0, 4.05, 0);
  root.add(roof);
  const pot = cyl(0.14, 0.2, 0.5, GOLD, 0.5, 8);
  place(pot, 0, 4.6, 0);
  root.add(pot);
  return root;
}

/**
 * Monuments near the walking focus: the Tirumala temple complex (visible
 * across the plateau), the Gali Gopuram tower, and the Padala Mandapam.
 * The temple faces east-south-east, toward the pilgrims arriving from the
 * GNC gate and the last steps of Alipiri Mettu.
 */
export function monuments(s, stops, p) {
  const group = new T.Group(),
    FACE = 0.98;
  const tir = stops.find((o) => o.id === "tirumala");
  if (tir && Math.hypot(tir.point[0] - p.x, tir.point[1] - p.y) < 11)
    group.add(templeComplex(s, tir, FACE));
  const gg = stops.find((o) => o.id === "galigopuram");
  if (gg && Math.hypot(gg.point[0] - p.x, gg.point[1] - p.y) < 9)
    group.add(galiTower(s, gg));
  const ali = stops.find((o) => o.id === "alipiri");
  if (ali && Math.hypot(ali.point[0] - p.x, ali.point[1] - p.y) < 7)
    group.add(padalaMandapam(s, ali));
  return group;
}
