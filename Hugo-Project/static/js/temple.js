// Sri Venkateswara Temple, Tirumala — researched reconstruction of the real
// Dravidian plan (see Notes/tirupati-7hills/RESEARCH.md and the Wikipedia
// architecture survey): the deity stands facing east inside the Ananda
// Nilayam garbhagriha; pilgrims pass east-to-west through three entrances —
// the Mahadwaram (Padikavali) in the Maha Prakaram, crowned by the 50 ft
// five-storey gopuram with seven kalasams; the Vendivakili (silver entrance)
// in the Sampangi Prakaram with its three-storey gopuram; and finally the
// gold Bangaruvakili flanked by Jaya and Vijaya into the garbhagriha. The
// gold-plated three-storey Ananda Nilayam vimana rises over the sanctum with
// niche rows, a rounded golden cupola and a single kalasam. Between the walls
// lies the Sampangi Pradakshinam with the dhwajasthambam, balipeetam and
// mandapams; around the sanctum the Vimana Pradakshinam carries the
// sub-shrines, Bangaru Bavi and the potu kitchen. Swami Pushkarini lies north
// of the complex. Walls register circle solids, so only the gates are open;
// the mettu trails enter through the east gate exactly on axis.
import * as T from "../vendor/three.module.min.js";
import { ACRE as U } from "./metres.js";

// Local metres: +z faces east (toward the pilgrim approach and the mettu
// trails), -z west (garbhagriha), x runs north(-)–south(+)? — x is the
// north-south span. FACE aligns local +z with the trails' final approach.
const FACE = 0.9103,
  SI = Math.sin(FACE),
  CO = Math.cos(FACE);

// Grid coordinates for a local metre offset rotated by theta (local +z is
// the facing direction). x is the local north-south span, z east-west.
function toGrid(gx, gy, x, z, sinA, cosA) {
  return [
    gx + (x * cosA + z * sinA) / U,
    gy + (x * sinA - z * cosA) / U,
  ];
}

const GRANITE = 0x9a9184,
  STONE = 0x8a8172,
  DARK = 0x3f3a33,
  PLASTER = 0xc9b28c,
  PLINTH = 0x6e5741,
  CREAM = 0xd8ccb2,
  TRIM = 0x8a7f6d,
  CLAY = 0xa8563e,
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

function cyl(rT, rB, h, color, glow, seg = 10) {
  return new T.Mesh(new T.CylinderGeometry(rT, rB, h, seg), mat(color, glow));
}

function pot(r, h, seg = 8) {
  const g = new T.Group();
  g.add(Object.assign(cyl(r, r * 1.25, h * 0.55, GOLD, 0.42, seg)));
  const s = new T.Mesh(new T.SphereGeometry(r, seg, 6), mat(GOLD, 0.42));
  s.position.y = h * 0.62;
  g.add(s);
  const tip = new T.Mesh(new T.ConeGeometry(r * 0.42, h * 0.5, 8), mat(GOLD, 0.45));
  tip.position.y = h * 0.95;
  g.add(tip);
  return g;
}

// Classic Dravidian storeys: shrinking cream tiers, each crowned by a hara
// ledge dressed with a row of miniature shrine niches.
function storeys(g, w, d, n, tierH, topW, topD, baseY) {
  let y = baseY,
    tw = w,
    td = d;
  for (let i = 0; i < n; i++) {
    const tier = box(tw, tierH, td, CREAM);
    tier.position.set(0, y + tierH / 2, 0);
    g.add(tier);
    const ledge = box(tw + 0.55, 0.28, td + 0.55, TRIM);
    ledge.position.set(0, y + tierH + 0.14, 0);
    g.add(ledge);
    // Miniature shrine niches around the ledge.
    const nx = Math.max(3, Math.round((tw + 0.4) / 1.05)),
      nz = Math.max(2, Math.round((td + 0.4) / 1.05));
    for (let a = 0; a < nx; a++) {
      const x = -tw / 2 + (tw * a) / (nx - 1);
      for (const z of [-(td + 0.4) / 2, (td + 0.4) / 2]) {
        const n1 = box(0.5, 0.55, 0.32, CREAM);
        n1.position.set(x, y + tierH + 0.42, z + Math.sign(z) * 0.12);
        g.add(n1);
      }
    }
    for (let a = 1; a < nz - 1; a++) {
      const z = -td / 2 + (td * a) / (nz - 1);
      for (const x of [-(tw + 0.4) / 2, (tw + 0.4) / 2]) {
        const n2 = box(0.32, 0.55, 0.5, CREAM);
        n2.position.set(x + Math.sign(x) * 0.12, y + tierH + 0.42, z);
        g.add(n2);
      }
    }
    y += tierH + 0.28;
    tw = Math.max(topW, tw - (w - topW) / n);
    td = Math.max(topD, td - (d - topD) / n);
  }
  return y;
}

function kalashaRow(g, y, w, count) {
  for (let i = 0; i < count; i++) {
    const k = pot(0.16, 0.55);
    k.position.set(-w / 2 + (w * i) / (count - 1), y + 0.26, 0);
    g.add(k);
  }
}

// Classic Dravidian gopuram as in the 1938 Gali Gopuram photographs: a
// strongly battered pyramid of rectangular courses, each tier a dark stone
// band between lighter cornices, an arched doorway at the base, and a crown
// of dome kalasams. The trail passes straight through the arched opening.
function gopuram(g, opening, tiers, baseW, topW, height, z, baseD = 3.2) {
  const doorH = height * 0.32;
  for (const side of [-1, 1]) {
    const jamb = box((baseW - opening) / 2, doorH, baseD, DARK);
    jamb.position.set(side * (opening / 2 + (baseW - opening) / 4), doorH / 2, z);
    g.add(jamb);
  }
  // Arch: lintel plus a recessed semicircle above the opening.
  const lintel = box(baseW, doorH * 0.22, baseD + 0.2, DARK);
  lintel.position.set(0, doorH + doorH * 0.11, z);
  g.add(lintel);
  const arch = new T.Mesh(
    new T.CylinderGeometry(opening / 2, opening / 2, baseD + 0.3, 12, 1, false, 0, Math.PI),
    mat(DARK),
  );
  arch.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  arch.position.set(0, doorH + doorH * 0.1, z);
  g.add(arch);
  // Battered courses: each tier shrinks toward the pyramid silhouette.
  const bodyTop = height - 1.0,
    n = Math.max(4, tiers),
    tierH = (bodyTop - doorH * 1.22) / n;
  let w = baseW * 0.94,
    d = baseD,
    y = doorH * 1.22 + doorH * 0.22;
  for (let i = 0; i < n; i++) {
    const f0 = i / n,
      f1 = (i + 1) / n;
    const w0 = baseW * 0.94 - (baseW * 0.94 - topW) * f0,
      w1 = baseW * 0.94 - (baseW * 0.94 - topW) * f1,
      d0 = baseD - (baseD - topW * 0.55) * f0;
    // Dark band of the course, slightly sloped silhouette via trapezoid box pair.
    const band = box((w0 + w1) / 2, tierH * 0.72, (d0 + (d0 - (baseD - topW * 0.55) / n)) / 2, DARK);
    band.position.set(0, y + tierH * 0.36, z);
    g.add(band);
    const cornice = box(w1 + 0.5, tierH * 0.28, d0 + 0.4, CREAM);
    cornice.position.set(0, y + tierH * 0.86, z);
    g.add(cornice);
    // Shrine niche row on the cornice.
    const niches = Math.max(2, Math.round((w1 - 1) / 0.95));
    for (let a = 0; a < niches; a++) {
      const nx = -w1 / 2 + 0.5 + ((w1 - 1) * a) / Math.max(1, niches - 1);
      const niche = box(0.42, 0.4, 0.22, STONE);
      niche.position.set(nx, y + tierH * 1.06, z + d0 / 2 + 0.22);
      g.add(niche);
      const niche2 = niche.clone();
      niche2.position.z = z - d0 / 2 - 0.22;
      g.add(niche2);
    }
    y += tierH;
    w = w1;
    d = d0 - (baseD - topW * 0.55) / n;
  }
  // Crown: oste corbel plus the row of dome kalasams (7 on the real towers).
  const crown = box(topW + 1.1, 0.5, topW * 0.55 + 0.9, DARK);
  crown.position.set(0, y + 0.25, z);
  g.add(crown);
  const kRow = 7;
  for (let i = 0; i < kRow; i++) {
    const k = pot(0.14, 0.42, 8);
    k.position.set(-topW / 2 + (topW * i) / (kRow - 1), y + 0.72, z);
    g.add(k);
  }
}

// The standing Lord inside the garbhagriha, facing east.
function deity() {
  const g = new T.Group();
  const lotus = cyl(0.62, 0.74, 0.3, DARK, 0, 12);
  lotus.position.y = 0.15;
  g.add(lotus);
  const body = cyl(0.34, 0.47, 1.42, DEITY, 0, 10);
  body.position.y = 1.01;
  g.add(body);
  for (const side of [-1, 1]) {
    const arm = cyl(0.09, 0.11, 0.62, DEITY, 0, 6);
    arm.position.set(side * 0.44, 1.28, 0.05);
    arm.rotation.z = side * 0.5;
    g.add(arm);
    const hand = new T.Mesh(new T.SphereGeometry(0.1, 8, 6), mat(GOLD, 0.3));
    hand.position.set(side * 0.66, 1.5, 0.12);
    g.add(hand);
  }
  const face = new T.Mesh(new T.SphereGeometry(0.21, 10, 8), mat(GOLD, 0.34));
  face.position.set(0, 1.83, 0.06);
  g.add(face);
  const crown = new T.Mesh(new T.ConeGeometry(0.22, 0.5, 8), mat(GOLD, 0.4));
  crown.position.y = 2.12;
  g.add(crown);
  return g;
}

function templeComplex(s, stop) {
  const root = new T.Group(),
    [gx, gy] = stop.point,
    z = s.ground(gx, gy);
  root.position.set(...s.xyz(gx, gy, z));
  root.rotation.y = FACE;
  const solids = [];

  // Maha Prakaram (outer compound wall): 44 m east-west, 34 m across,
  // 3.2 m high, east gate opening 3.2 m.
  const X = 17,
    Z = 22,
    GAP = 3.2,
    WH = 3.2,
    WT = 0.7;
  for (const [w, d, x, zz] of [
    [2 * X, WT, 0, -Z],
    [2 * X, WT, 0, Z],
    [WT, 2 * Z, -X, 0],
    [WT, 2 * Z, X, 0],
  ]) {
    const wall = box(w, WH, d, PLASTER);
    wall.position.set(x, WH / 2, zz);
    root.add(wall);
    const skirt = box(w + 0.12, 0.9, d + 0.12, PLINTH);
    skirt.position.set(x, 0.45, zz);
    root.add(skirt);
  }
  for (const side of [-1, 1]) {
    const seg = box(X - GAP / 2, WH, WT, PLASTER);
    seg.position.set(side * (GAP / 2 + (X - GAP / 2) / 2), WH / 2, Z);
    root.add(seg);
    const skirt2 = box(X - GAP / 2 + 0.12, 0.9, WT + 0.12, PLINTH);
    skirt2.position.set(side * (GAP / 2 + (X - GAP / 2) / 2), 0.45, Z);
    root.add(skirt2);
  }

  // Mahadwaram: the 50 ft five-storey gopuram over the east gate.
  gopuram(root, GAP, 7, 9.2, 4.2, 15.2, Z);

  // Sampangi Prakaram (inner wall): 30 x 20 m, east gate 2.4 m.
  const IX = 10,
    IZ = 15,
    IGAP = 2.4,
    IH = 2.8,
    IT = 0.6;
  for (const [w, d, x, zz] of [
    [2 * IX, IT, 0, -IZ],
    [2 * IX, IT, 0, IZ],
    [IT, 2 * IZ, -IX, 0],
    [IT, 2 * IZ, IX, 0],
  ]) {
    const wall = box(w, IH, d, PLASTER);
    wall.position.set(x, IH / 2, zz);
    root.add(wall);
    const skirt3 = box(w + 0.12, 0.85, d + 0.12, PLINTH);
    skirt3.position.set(x, 0.42, zz);
    root.add(skirt3);
  }
  for (const side of [-1, 1]) {
    const seg = box(IX - IGAP / 2, IH, IT, PLASTER);
    seg.position.set(side * (IGAP / 2 + (IX - IGAP / 2) / 2), IH / 2, IZ);
    root.add(seg);
    const skirt4 = box(IX - IGAP / 2 + 0.12, 0.85, IT + 0.12, PLINTH);
    skirt4.position.set(side * (IGAP / 2 + (IX - IGAP / 2) / 2), 0.42, IZ);
    root.add(skirt4);
  }
  // Vendivakili: the three-storey silver-entrance gopuram.
  gopuram(root, IGAP, 4, 6.4, 3.0, 9.6, IZ, 2.6);

  // Sampangi Pradakshinam fittings: dhwajasthambam, balipeetam, mandapams.
  const dhwajaBase = box(1.1, 0.5, 1.1, GRANITE);
  dhwajaBase.position.set(0, 0.25, 11);
  root.add(dhwajaBase);
  const pole = cyl(0.12, 0.16, 8.2, GOLD, 0.34, 8);
  pole.position.set(0, 4.7, 11);
  root.add(pole);
  const flag = box(1.1, 0.66, 0.05, SAFFRON);
  flag.position.set(0.6, 8.0, 11);
  root.add(flag);
  const bali = box(0.95, 1.15, 0.95, STONE);
  bali.position.set(-2.9, 0.57, 11);
  root.add(bali);
  for (const sx of [-1, 1]) {
    const mandapam = new T.Group();
    const deck = box(5, 0.55, 5, GRANITE);
    deck.position.y = 0.27;
    mandapam.add(deck);
    for (const px of [-1.9, 1.9])
      for (const pz of [-1.9, 1.9]) {
        const pillar = cyl(0.22, 0.28, 3.1, CREAM, 0, 10);
        pillar.position.set(px, 2.1, pz);
        mandapam.add(pillar);
      }
    const roof = box(5.7, 0.45, 5.7, CLAY);
    roof.position.y = 3.95;
    mandapam.add(roof);
    for (const cx of [-2, 0, 2])
      for (const cz of [-2, 0, 2]) {
        const fin = pot(0.14, 0.4, 8);
        fin.position.set(cx, 4.4, cz);
        mandapam.add(fin);
      }
    mandapam.position.set(sx * 6.5, 0, 17.5);
    root.add(mandapam);
  }

  // Vimana Pradakshinam paving and the Ananda Nilayam sanctum.
  const paving = box(15, 0.5, 12, CREAM);
  paving.position.set(0, 0.25, -8);
  root.add(paving);
  // Axial dharma path: cream stone under the pilgrim line, from the east
  // gate through both pradakshinams to the Bangaruvakili.
  const path1 = box(2.8, 0.42, 11, CREAM);
  path1.position.set(0, 0.21, 16.6);
  root.add(path1);
  const path2 = box(2.4, 0.42, 20, CREAM);
  path2.position.set(0, 0.21, 4.4);
  root.add(path2);
  const SZ = -8,
    SW = 6,
    SH = 4.6,
    ST = 0.5;
  for (const [w, h, d, x, zz] of [
    [SW, SH, ST, 0, SZ - 2.75],
    [ST, SH, 2 * 2.75, -SW / 2, SZ],
    [ST, SH, 2 * 2.75, SW / 2, SZ],
  ]) {
    const wall = box(w, h, d, DARK);
    wall.position.set(x, 0.5 + h / 2, zz);
    root.add(wall);
  }
  // Front wall with the Bangaruvakili opening (1.4 m).
  for (const side of [-1, 1]) {
    const seg = box((SW - 1.4) / 2, SH, ST, DARK);
    seg.position.set(side * (1.4 / 2 + (SW - 1.4) / 4), 0.5 + SH / 2, SZ + 2.75);
    root.add(seg);
  }
  const doorLintel = box(1.8, SH - 3.1, ST, DARK);
  doorLintel.position.set(0, 0.5 + 3.1 + (SH - 3.1) / 2, SZ + 2.75);
  root.add(doorLintel);
  // Golden door frame and Jaya-Vijaya at the Bangaruvakili.
  for (const side of [-1, 1]) {
    const post = box(0.18, 2.9, 0.22, GOLD, 0.3);
    post.position.set(side * 0.78, 0.5 + 1.45, SZ + 2.85);
    root.add(post);
    const guard = cyl(0.17, 0.22, 1.25, DEITY, 0, 8);
    guard.position.set(side * 1.35, 0.5 + 1.5, SZ + 3.25);
    root.add(guard);
    const head = new T.Mesh(new T.SphereGeometry(0.19, 8, 6), mat(DEITY, 0));
    head.position.set(side * 1.35, 0.5 + 2.3, SZ + 3.25);
    root.add(head);
  }
  const frame = box(1.9, 0.24, 0.22, GOLD, 0.32);
  frame.position.set(0, 0.5 + 2.95, SZ + 2.85);
  root.add(frame);
  // The Lord stands inside, facing east toward the entrance.
  const idol = deity();
  idol.position.set(0, 0.55, SZ);
  root.add(idol);

  // Ananda Nilayam vimana: gold base with niche rows, rounded cupola, one kalasam.
  const vimBase = box(6.6, 0.5, 6.6, GOLD, 0.3);
  vimBase.position.set(0, 0.5 + SH + 0.25, SZ);
  root.add(vimBase);
  for (let a = 0; a < 8; a++) {
    const x = -2.8 + (5.6 * a) / 7;
    for (const zz of [SZ - 3.25, SZ + 3.25]) {
      const niche = box(0.55, 0.5, 0.36, GOLD, 0.26);
      niche.position.set(x, 0.5 + SH + 0.75, zz);
      root.add(niche);
    }
  }
  for (let a = 1; a < 8; a++) {
    const zz = SZ - 2.8 + (5.6 * a) / 7;
    for (const x of [-3.25, 3.25]) {
      const niche2 = box(0.36, 0.5, 0.55, GOLD, 0.26);
      niche2.position.set(x, 0.5 + SH + 0.75, zz);
      root.add(niche2);
    }
  }
  // Vimana Venkateswara niche, north-west corner of the second course.
  const vv = box(0.5, 0.6, 0.5, GOLD, 0.4);
  vv.position.set(-2.55, 0.5 + SH + 1.35, SZ - 2.55);
  root.add(vv);
  for (let a = 0; a < 6; a++) {
    const x = -2.3 + (4.6 * a) / 5;
    for (const zz of [SZ - 2.75, SZ + 2.75]) {
      const n3 = box(0.42, 0.46, 0.3, GOLD, 0.26);
      n3.position.set(x, 0.5 + SH + 1.35, zz);
      root.add(n3);
    }
  }
  const dome = new T.Mesh(
    new T.SphereGeometry(2.75, 12, 9),
    mat(GOLD, 0.34),
  );
  dome.scale.set(1, 0.64, 0.92);
  dome.position.set(0, 0.5 + SH + 1.9, SZ);
  root.add(dome);
  const kalasham = pot(0.3, 1.25, 10);
  kalasham.position.set(0, 0.5 + SH + 1.9 + 1.75, SZ);
  root.add(kalasham);

  // Sub-shrines (Varadaraja, Yoga Narasimha), Bangaru Bavi, potu, hundi.
  for (const sx of [-1, 1]) {
    const shrine = box(2.4, 2.6, 2.4, DARK);
    shrine.position.set(sx * 7.2, 0.5 + 1.3, SZ);
    root.add(shrine);
    const spire = pot(0.2, 0.6);
    spire.position.set(sx * 7.2, 0.5 + 2.9, SZ);
    root.add(spire);
  }
  const bavi = cyl(0.85, 0.95, 0.9, GOLD, 0.28, 12);
  bavi.position.set(4.4, 0.95, SZ + 1);
  root.add(bavi);
  const baviWater = cyl(0.62, 0.62, 0.12, WATER, 0.1, 12);
  baviWater.position.set(4.4, 1.4, SZ + 1);
  root.add(baviWater);
  const potu = box(3.4, 2.7, 3, CREAM);
  potu.position.set(-7.6, 1.35, SZ - 4.6);
  root.add(potu);
  const hundi = box(1.15, 1.15, 1.15, GOLD, 0.22);
  hundi.position.set(2.6, 0.57, 12.6);
  root.add(hundi);

  // Circle solids: walls block, only the three gates stay open.
  const C = stop.point,
    line = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1),
        n = Math.max(2, Math.round(len / 0.55));
      for (let i = 0; i <= n; i++) {
        const t = i / n,
          x = x1 + (x2 - x1) * t,
          zz = z1 + (z2 - z1) * t;
        solids.push([
          ...toGrid(C[0], C[1], x, zz, SI, CO),
          0.34 / U,
        ]);
      }
    };
  line(-X, -Z, X, -Z);
  line(-X, Z, -GAP / 2 - 0.4, Z);
  line(GAP / 2 + 0.4, Z, X, Z);
  line(-X, -Z, -X, Z);
  line(X, -Z, X, Z);
  line(-IX, -IZ, IX, -IZ);
  line(-IX, IZ, -IGAP / 2 - 0.3, IZ);
  line(IGAP / 2 + 0.3, IZ, IX, IZ);
  line(-IX, -IZ, -IX, IZ);
  line(IX, -IZ, IX, IZ);
  // Sanctum walls and the gate jambs of both gopurams.
  line(-SW / 2, SZ - 2.75, SW / 2, SZ - 2.75);
  line(-SW / 2, SZ + 2.75, -0.9, SZ + 2.75);
  line(0.9, SZ + 2.75, SW / 2, SZ + 2.75);
  line(-SW / 2, SZ - 2.75, -SW / 2, SZ + 2.75);
  line(SW / 2, SZ - 2.75, SW / 2, SZ + 2.75);
  for (const zz of [Z, IZ])
    for (const side of [-1, 1])
      line(side * (1.4 + 0.75), zz - 1, side * (1.4 + 0.75), zz + 1);
  for (const sx of [-1, 1]) {
    solids.push([...toGrid(C[0], C[1], sx * 6.5, 17.5, SI, CO), 1.2 / U]);
    solids.push([...toGrid(C[0], C[1], sx * 7.2, SZ, SI, CO), 1.4 / U]);
  }
  root.userData.solids = solids;

  // Swami Pushkarini: the temple tank north of the complex.
  const tank = new T.Group();
  for (const [w, d, x, zz] of [
    [17, 1, 0, -6],
    [17, 1, 0, 6],
    [1, 12, -8, 0],
    [1, 12, 8, 0],
  ]) {
    const kerb = box(w, 0.85, d, GRANITE);
    kerb.position.set(x, 0.42, zz);
    tank.add(kerb);
  }
  const water = new T.Mesh(new T.PlaneGeometry(15.6, 11.2), mat(WATER, 0.12));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.52;
  tank.add(water);
  const [tx, ty] = [gx - 8 / U, gy - 26 / U];
  tank.position.set(...s.xyz(tx, ty, s.ground(tx, ty)));
  tank.rotation.y = FACE;
  const group = new T.Group();
  group.add(root, tank);
  group.userData.solids = solids;
  return group;
}

// Gali Gopuram — the cream wind tower straddling the covered stairway,
// rotated so pilgrims walk through its gate.
function galiTower(s, stop) {
  const [gx, gy] = stop.point,
    z = s.ground(gx, gy),
    root = new T.Group();
  root.position.set(...s.xyz(gx, gy, z));
  root.rotation.y = stop.yaw || 0;
  gopuram(root, 3.0, 6, 8.4, 3.6, 13.5, 0, 3.2);
  root.position.y -= 0.35;
  const sinA = Math.sin(stop.yaw || 0),
    cosA = Math.cos(stop.yaw || 0),
    solids = [];
  for (const side of [-1, 1])
    for (const dz of [-0.9, 0, 0.9])
      solids.push([...toGrid(gx, gy, side * 2.2, dz, sinA, cosA), 0.5 / U]);
  root.userData.solids = solids;
  return root;
}

// Padala Mandapam — the stone pavilion where the 3,550 steps begin.
function padalaMandapam(s, stop) {
  const [gx, gy] = stop.point,
    z = s.ground(gx, gy),
    root = new T.Group();
  root.position.set(...s.xyz(gx, gy, z));
  root.rotation.y = stop.yaw || 0;
  const deck = box(6.2, 0.9, 6.2, GRANITE);
  deck.position.y = 0.45;
  root.add(deck);
  for (const px of [-2.4, 2.4])
    for (const pz of [-2.4, 2.4]) {
      const pillar = cyl(0.26, 0.32, 3.2, CREAM, 0, 10);
      pillar.position.set(px, 2.5, pz);
      root.add(pillar);
    }
  const roof = box(6.6, 0.55, 6.6, CLAY);
  roof.position.y = 4.4;
  root.add(roof);
  const k = pot(0.22, 0.8);
  k.position.y = 5.1;
  root.add(k);
  const sinA = Math.sin(stop.yaw || 0),
    cosA = Math.cos(stop.yaw || 0),
    solids = [];
  for (const px of [-2.4, 2.4])
    for (const pz of [-2.4, 2.4])
      solids.push([...toGrid(gx, gy, px, pz, sinA, cosA), 0.4 / U]);
  root.userData.solids = solids;
  return root;
}

/**
 * Monuments near the walking focus, with circle solids in userData.
 * The temple complex spans ~44 m, so it builds within an 11-cell focus.
 */
export function monuments(s, stops, p) {
  const group = new T.Group();
  const solids = [];
  const tir = stops.find((o) => o.id === "tirumala");
  if (tir && Math.hypot(tir.point[0] - p.x, tir.point[1] - p.y) < 11) {
    const c = templeComplex(s, tir);
    group.add(c);
    solids.push(...(c.userData.solids || []));
  }
  const gg = stops.find((o) => o.id === "galigopuram");
  if (gg && Math.hypot(gg.point[0] - p.x, gg.point[1] - p.y) < 9) {
    const t = galiTower(s, gg);
    group.add(t);
    solids.push(...(t.userData.solids || []));
  }
  const ali = stops.find((o) => o.id === "alipiri");
  if (ali && Math.hypot(ali.point[0] - p.x, ali.point[1] - p.y) < 7) {
    const m = padalaMandapam(s, ali);
    group.add(m);
    solids.push(...(m.userData.solids || []));
  }
  group.userData.solids = solids;
  return group;
}
