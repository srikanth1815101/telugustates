// Shared packed-earth clearing and a neem shade platform at the village hub.
import { roomPlan } from "./home-volume.js";
import * as T from "../vendor/three.module.min.js";
import { ACRE as M, localPoint } from "./metres.js";
import {
  rigInstance,
  rigReady,
  propForm,
  propBox,
  propMaterial,
} from "./art-library.js";
const scale = (p, x, y) => [p[0] + x / M, p[1] + y / M];
const UP_AXIS = new T.Vector3(0, 1, 0),
  LOOK_Q = new T.Quaternion();
const hash01 = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
// Recolour only the cloth clusters of a shared character rig so villagers keep their
// skin, hair and shading depth but wear a genuinely varied village wardrobe.
const OUTFIT_RAMPS = [
  [
    [0.2, 0.28, 0.44],
    [0.5, 0.57, 0.74],
    [0.88, 0.82, 0.62],
  ], // indigo kurta, ecru dhoti
  [
    [0.44, 0.16, 0.12],
    [0.72, 0.4, 0.22],
    [0.93, 0.77, 0.48],
  ], // rust, turmeric
  [
    [0.13, 0.3, 0.23],
    [0.36, 0.53, 0.35],
    [0.87, 0.81, 0.58],
  ], // leaf green, ecru
  [
    [0.35, 0.14, 0.26],
    [0.59, 0.29, 0.36],
    [0.9, 0.72, 0.47],
  ], // maroon, marigold
  [
    [0.15, 0.26, 0.4],
    [0.3, 0.46, 0.59],
    [0.76, 0.79, 0.73],
  ], // steel blue, ash
  [
    [0.4, 0.28, 0.09],
    [0.7, 0.53, 0.19],
    [0.9, 0.85, 0.65],
  ], // mustard, ivory
];
function tintCloth(R, seed) {
  const src = R.mesh.geometry,
    colors = src.attributes.color;
  if (!colors) return;
  const c = Float32Array.from(colors.array),
    key = (r, g, b) =>
      ((Math.round(r * 12) << 16) |
        (Math.round(g * 12) << 8) |
        Math.round(b * 12)) >>>
      0,
    counts = new Map();
  for (let i = 0; i < c.length; i += 3) {
    const k = key(c[i], c[i + 1], c[i + 2]);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const cloth = [];
  for (const [k, n] of counts) {
    const r = ((k >>> 16) & 255) / 12,
      g = ((k >>> 8) & 255) / 12,
      b = (k & 255) / 12,
      mx = Math.max(r, g, b),
      mn = Math.min(r, g, b),
      skinLike =
        r > 0.34 &&
        r >= g &&
        g >= b * 0.72 &&
        r - b > 0.1 &&
        mx - mn < 0.52;
    if (!skinLike && mx >= 0.16) cloth.push([k, (r + g + b) / 3]);
  }
  if (!cloth.length) return;
  cloth.sort((a, b) => a[1] - b[1]);
  const ramp = OUTFIT_RAMPS[seed % OUTFIT_RAMPS.length],
    map = new Map();
  cloth.forEach(([k], i) => {
    const t = cloth.length === 1 ? 1 : i / (cloth.length - 1),
      seg = t * (ramp.length - 1),
      j = Math.min(ramp.length - 2, Math.floor(seg)),
      f = seg - j;
    map.set(k, [
      ramp[j][0] + (ramp[j + 1][0] - ramp[j][0]) * f,
      ramp[j][1] + (ramp[j + 1][1] - ramp[j][1]) * f,
      ramp[j][2] + (ramp[j + 1][2] - ramp[j][2]) * f,
    ]);
  });
  for (let i = 0; i < c.length; i += 3) {
    const m = map.get(key(c[i], c[i + 1], c[i + 2]));
    if (m) {
      const srcL = (c[i] + c[i + 1] + c[i + 2]) / 3 || 1,
        dstL = (m[0] + m[1] + m[2]) / 3 || 1,
        k = Math.min(1.55, Math.max(0.42, srcL / dstL) * 0.85 + 0.32);
      c[i] = Math.min(1, m[0] * k);
      c[i + 1] = Math.min(1, m[1] * k);
      c[i + 2] = Math.min(1, m[2] * k);
    }
  }
  const geo = src.clone();
  geo.setAttribute("color", new T.Float32BufferAttribute(c, 3));
  geo.computeBoundingSphere();
  R.mesh.geometry = geo;
}
export function hamletScene(s, rows, commons, focus, tier, paths = []) {
  const g = new T.Group(),
    shapes = new Map(),
    obj = new T.Object3D(),
    col = new T.Color(),
    me = obj.matrix.elements,
    solids = [],
    animated = [],
    range = tier ? 540 : 285,
    midRange = tier ? 360 : 185;
  obj.rotation.order = "YXZ";
  const add = (k, p, height, xyz, rotation, color) => {
    let bin = shapes.get(k);
    if (!bin) {
      bin = { m: [], c: [] };
      shapes.set(k, bin);
    }
    obj.position.set(...s.xyz(...p, s.ground(...p) + height));
    obj.scale.set(...xyz);
    obj.rotation.set(...rotation);
    obj.updateMatrix();
    for (let i = 0; i < 16; i++) bin.m.push(me[i]);
    col.set(color);
    bin.c.push(col.r, col.g, col.b);
  };
  const dryLand = (p) => {
    const sp = s.sample ? s.sample(p[0], p[1]) : { depth: 0 };
    return (sp.depth || 0) <= 0.02 && (sp.sea || 0) < 0.05;
  };
  const clearSpot = (p, radM) =>
    dryLand(p) &&
    (!s.ways || s.ways.clear(p[0], p[1], radM)) &&
    !rows.some(
      (r) =>
        r[5] &&
        Math.hypot(r[5].centre[0] - p[0], r[5].centre[1] - p[1]) * M <
          Math.max(10.5, (r[5].yard?.lot?.[0] || 12) * 0.65 + radM),
    ) &&
    !solids.some(
      (o) => Math.hypot(o[0] - p[0], o[1] - p[1]) * M < o[2] * M + radM + 0.8,
    );

  // Shared lightweight meshes for animated village life (villagers, Ongole bullocks, hens, birds, toranam, steam wisps)
  const actorRoot = new T.Group(),
    unitBox = new T.BoxGeometry(1, 1, 1),
    unitCyl = new T.CylinderGeometry(0.5, 0.5, 1, 8),
    unitOrb = new T.IcosahedronGeometry(0.5, 0),
    matCache = new Map();
  const matOf = (hex, extra = null) => {
    const key = hex + (extra ? JSON.stringify(extra) : "");
    if (!matCache.has(key))
      matCache.set(
        key,
        new T.MeshLambertMaterial({ color: hex, ...(extra || {}) }),
      );
    return matCache.get(key);
  };
  const partMesh = (geo, hex, sx, sy, sz, px = 0, py = 0, pz = 0, extra = null) => {
    const m = new T.Mesh(geo, matOf(hex, extra));
    m.scale.set(sx, sy, sz);
    m.position.set(px, py, pz);
    return m;
  };
  const placeGroupAt = (pt, lift = 0, yaw = 0) => {
    const grp = new T.Group();
    grp.position.set(...s.xyz(pt[0], pt[1], s.ground(pt[0], pt[1]) + lift));
    grp.rotation.y = yaw;
    actorRoot.add(grp);
    return grp;
  };

  // A live skeletal villager: Quaternius Atlas rig (same family as the traveller), reclothed,
  // walking village beats with pauses, idling with subtle stance sway, head-tracking the traveller.
  const personActor = (pt, lift, yaw, seed, { mode = "idle", waypoints = null, speed = 1.12, face = null } = {}) => {
    const id = seed % 2 ? "traveller-man" : "traveller-woman";
    if (!rigReady(id)) return null;
    const R = rigInstance(id);
    tintCloth(R, seed * 7 + 3);
    R.g.position.set(...s.xyz(pt[0], pt[1], s.ground(pt[0], pt[1]) + lift));
    R.g.rotation.y = yaw;
    R.g.scale.setScalar(0.93 + hash01(seed * 3.1 + 11) * 0.14);
    R.mesh.castShadow = true;
    actorRoot.add(R.g);
    animated.push({
      kind: "person",
      R,
      seed,
      mode,
      waypoints,
      wi: 0,
      dir: 1,
      speed,
      face,
      baseYaw: yaw,
      x: pt[0],
      y: pt[1],
      lift,
      yaw,
      gait: hash01(seed * 13.7 + 5.1),
      pauseUntil: 0,
      look: 0,
      clock: hash01(seed * 7.7 + 2.3) * 20,
    });
    return R;
  };

  // A live skeletal domestic animal: Atlas CC0 rig with stand/walk/run clips, wandering a
  // grazing patch around home with pauses — never a rigid statue.
  const animalActor = (id, pt, yaw, seed, { radius = 2.3, speed = 0.42, lift = 0 } = {}) => {
    if (!rigReady(id)) return null;
    const R = rigInstance(id);
    R.g.position.set(...s.xyz(pt[0], pt[1], s.ground(pt[0], pt[1]) + lift));
    R.g.rotation.y = yaw;
    actorRoot.add(R.g);
    animated.push({
      kind: "animal",
      id,
      R,
      seed,
      homeX: pt[0],
      homeY: pt[1],
      x: pt[0],
      y: pt[1],
      lift,
      yaw,
      radius,
      speed,
      gait: hash01(seed * 9.3 + 1.7),
      target: null,
      pauseUntil: hash01(seed * 3.9 + 0.7) * 3,
      moveT: 0,
    });
    return R;
  };

  // An open-source CC0 Kenney prop (baked Atlas mesh), optionally shadow-casting.
  const propActor = (id, pt, lift, yaw, targetHeight, { castShadow = false, stretch = 1 } = {}) => {
    const geo = propForm(id),
      bb = propBox(id);
    if (!geo || !bb) return null;
    const h = Math.max(0.01, bb[4] - bb[1]),
      sxz = (targetHeight / h) * stretch,
      sy = targetHeight / h,
      m = new T.Mesh(geo, propMaterial());
    m.scale.set(sxz, sy, sxz);
    m.position.set(...s.xyz(pt[0], pt[1], s.ground(pt[0], pt[1]) + lift));
    m.rotation.y = yaw;
    m.castShadow = castShadow;
    m.userData.role = "commons-" + id;
    actorRoot.add(m);
    return m;
  };

  // Deterministic ping-pong beat along the village lane nearest the commons, else an on-spot ring.
  const laneWaypoints = (hub, reach = 46) => {
    let bestPath = null,
      bestLen = 30;
    for (const p of paths || []) {
      if (!["village", "bund"].includes(p.type) || !p.xy?.length) continue;
      let len = 0;
      for (let i = 1; i < p.xy.length; i++)
        len += Math.hypot(p.xy[i][0] - p.xy[i - 1][0], p.xy[i][1] - p.xy[i - 1][1]) * M;
      const near = p.xy.some(
        ([px, py]) => Math.hypot(px - hub[0], py - hub[1]) * M < reach,
      );
      if (near && len > bestLen) {
        bestLen = len;
        bestPath = p;
      }
    }
    if (bestPath) {
      const xy = bestPath.xy;
      const arcAt = [];
      let total = 0;
      for (let i = 1; i < xy.length; i++) {
        total += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]) * M;
        arcAt.push(total);
      }
      const at = (a) => {
        let k = 0;
        while (k < arcAt.length - 1 && arcAt[k] < a) k++;
        const prev = k === 0 ? 0 : arcAt[k - 1],
          seg = Math.max(1e-6, arcAt[k] - prev),
          t = (a - prev) / seg;
        return [
          xy[k][0] + (xy[k + 1][0] - xy[k][0]) * t,
          xy[k][1] + (xy[k + 1][1] - xy[k][1]) * t,
        ];
      };
      const start = Math.max(4, total * 0.18),
        end = Math.min(total - 2, total * 0.82);
      const pts = [];
      for (let i = 0; i <= 5; i++) pts.push(at(start + ((end - start) * i) / 5));
      return pts;
    }
    const ring = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI * 2) / 6 + 0.4,
        pt = scale(hub, Math.cos(a) * 5.6, Math.sin(a) * 5.6);
      ring.push(clearSpot(pt, 0.6) ? pt : hub);
    }
    return ring;
  };

  const makeCirclingBird = (centerPt, radiusM, altM, phase = 0) => {
    const cx = s.xyz(centerPt[0], centerPt[1], s.ground(centerPt[0], centerPt[1]) + altM),
      bird = new T.Group(),
      wingL = new T.Group(),
      wingR = new T.Group();
    bird.add(partMesh(unitBox, 0x4f8a4c, 0.09, 0.08, 0.34, 0, 0, 0));
    wingL.add(partMesh(unitBox, 0x62a357, 0.32, 0.025, 0.14, -0.16, 0, 0.02));
    wingR.add(partMesh(unitBox, 0x62a357, 0.32, 0.025, 0.14, 0.16, 0, 0.02));
    bird.add(wingL, wingR);
    bird.position.set(cx[0], cx[1], cx[2]);
    actorRoot.add(bird);
    animated.push({
      kind: "bird",
      bird,
      wingL,
      wingR,
      cx: cx[0],
      cy: cx[1],
      cz: cx[2],
      r: radiusM,
      phase,
    });
  };

  for (const v of commons) {
    const p = v.hub;
    const distM = Math.hypot(p[0] - focus.x, p[1] - focus.y) * M;
    if (distM > range || !v.shade) continue;
    const z = v.shade,
      inMid = distM < midRange;

    // 1. Sacred Banyan / Peepal Rachabanda (రచ్చబండ) chabutra platform & elder canopy
    add("cyl", z, 0.12, [4.4, 0.24, 4.4], [0, 0.2, 0], 0x9b896f);
    add("cyl", z, 0.36, [3.68, 0.34, 3.68], [0, 0.2, 0], 0xede2c4);
    add("cyl", z, 0.37, [3.74, 0.14, 3.74], [0, 0.2, 0], 0xb4573c);
    add("cyl", z, 0.56, [3.86, 0.1, 3.86], [0, 0.2, 0], 0xcab693);
    add("trunk", z, 2.55, [0.7, 5.1, 0.7], [0, 0.8, 0.02], 0x7a6042);

    for (let k = 0; k < (inMid ? 7 : 4); k++) {
      const a = k * 2.094,
        rad = k ? 1.72 : 0,
        leafH = 4.6 + (k ? Math.sin(k * 0.9) * 0.45 : 1.25),
        b = scale(z, Math.cos(a) * rad, Math.sin(a) * rad);
      if (k && inMid) {
        const limb = scale(z, Math.cos(a) * 0.88, Math.sin(a) * 0.88);
        add(
          "trunk",
          limb,
          (3.2 + leafH) * 0.5,
          [0.26, 2.1, 0.26],
          [0.68, Math.atan2(Math.cos(a), -Math.sin(a)), 0],
          0x765c3f,
        );
        if (k % 2 === 1) {
          const rootPt = scale(z, Math.cos(a) * 1.28, Math.sin(a) * 1.28);
          add("trunk", rootPt, 2.15, [0.09, 3.1, 0.09], [0.03, a, 0], 0x876c4d);
        }
      }
      add(
        "leaf",
        b,
        leafH,
        k ? [4.35, 3.05, 4.25] : [5.0, 3.4, 5.0],
        [0.11 * k, a, 0.08 * k],
        [0x547848, 0x6b894e, 0x739057, 0x4b6e44][k % 4],
      );
    }
    solids.push([z[0], z[1], 1.92 / M]);

    if (!inMid) continue;

    // Animated conversing neighbours on the Rachabanda stone platform, a villager on the lane beat, a peafowl in the shade
    personActor(scale(z, 1.38, 0.72), 0.58, -0.95, 3, { mode: "idle" });
    personActor(scale(z, 0.68, 1.42), 0.58, 2.15, 4, { mode: "idle" });
    const beat = laneWaypoints(z);
    if (beat?.length >= 2)
      personActor(beat[0], 0, Math.atan2(beat[1][0] - beat[0][0], -(beat[1][1] - beat[0][1])), 5, {
        mode: "patrol",
        waypoints: beat,
        speed: 1.18,
      });
    const peaPt = scale(z, -2.1, -1.5);
    if (clearSpot(peaPt, 0.55)) animalActor("atlas-peafowl", peaPt, 2.4, 7, { radius: 2.3, speed: 0.5 });
    const goatPt = scale(z, 2.45, 1.15);
    if (clearSpot(goatPt, 0.6)) animalActor("atlas-goat", goatPt, 0.8, 33, { radius: 2.2, speed: 0.5 });
    makeCirclingBird(z, 4.4, 7.6, 0);
    makeCirclingBird(z, 5.3, 8.4, 2.4);
    makeCirclingBird(z, 3.8, 7.1, 4.5);

    // 2. Traditional Stone-Ringed Village Well (గ్రామ బావి) with pulley crossbeam & terracotta pots
    let wellPt = null;
    for (const rad of [5.4, 8.2, 11.0]) {
      for (let i = 0; i < 16; i++) {
        const a = i * ((Math.PI * 2) / 16) + 0.55,
          cand = scale(z, Math.cos(a) * rad, Math.sin(a) * rad);
        if (clearSpot(cand, 2.05)) {
          wellPt = cand;
          break;
        }
      }
      if (wellPt) break;
    }
    if (wellPt) {
      add("cyl", wellPt, 0.05, [2.85, 0.1, 2.85], [0, 0, 0], 0x999080);
      add("cyl", wellPt, 0.42, [2.05, 0.78, 2.05], [0, 0, 0], 0xb2a58e);
      add("cyl", wellPt, 0.82, [2.18, 0.1, 2.18], [0, 0, 0], 0xd9ceb6);
      add("cyl", wellPt, 0.62, [1.62, 0.42, 1.62], [0, 0, 0], 0x265459);
      for (const sgn of [-1, 1]) {
        const post = scale(wellPt, sgn * 0.92, 0);
        add("box", post, 1.32, [0.16, 1.82, 0.16], [0, 0, 0], 0x8f8371);
      }
      add("box", wellPt, 2.22, [2.06, 0.14, 0.16], [0, 0, 0], 0x6b4b35);
      add("cyl", wellPt, 2.04, [0.34, 0.08, 0.34], [0, 0, Math.PI / 2], 0x4d463f);
      add("cyl", wellPt, 1.48, [0.03, 1.1, 0.03], [0, 0, 0], 0x9c8662);
      const potA = scale(wellPt, 1.15, 0.52),
        potB = scale(wellPt, 0.95, 0.84);
      add("cyl", potA, 0.24, [0.42, 0.42, 0.42], [0, 0, 0], 0xa96548);
      add("cyl", potB, 0.21, [0.36, 0.36, 0.36], [0, 0, 0], 0xb57150);
      for (let dIdx = 0; dIdx < 8; dIdx++) {
        const da = dIdx * (Math.PI / 4),
          drawerSpot = scale(wellPt, Math.cos(da) * 1.48, Math.sin(da) * 1.48);
        if (clearSpot(drawerSpot, 0.6)) {
          personActor(drawerSpot, 0.02, da + Math.PI, 9, { mode: "idle" });
          break;
        }
      }
      const catPt = scale(wellPt, 0.65, 1.15);
      if (clearSpot(catPt, 0.45)) animalActor("atlas-yard-cat", catPt, 1.1, 31, { radius: 1.4, speed: 0.55 });
      solids.push([wellPt[0], wellPt[1], 1.18 / M]);
    }

    // 3. Resting Wooden Bullock Cart (ఎడ్ల బండి) + Grazing White Ongole Bullock
    let cartPt = null;
    for (const rad of [5.8, 8.8, 11.6]) {
      for (let i = 0; i < 16; i++) {
        const a = i * ((Math.PI * 2) / 16) + 2.65,
          cand = scale(z, Math.cos(a) * rad, Math.sin(a) * rad);
        if (clearSpot(cand, 2.25)) {
          cartPt = cand;
          const yaw = a + 0.6,
            cy = Math.cos(yaw),
            sy = Math.sin(yaw);
          // Open-source CC0 Kenney fantasy-town cart, rescaled to a full-size bullock cart.
          const cart = propActor("kenney-cart", cartPt, 0.02, yaw, 0.92, {
            castShadow: true,
            stretch: 1.75,
          });
          if (!cart) {
            // Fallback when the prop library is not warm: a sound, simple timber cart.
            add("box", cartPt, 0.66, [1.26, 0.14, 2.3], [0, yaw, 0], 0x7d5a3e);
            for (const sgn of [-1, 1]) {
              const rail = scale(cartPt, sgn * 0.6 * cy, -sgn * 0.6 * sy);
              add("box", rail, 0.9, [0.08, 0.3, 2.24], [0, yaw, 0], 0x936e4b);
              const wh = scale(cartPt, sgn * 0.68 * cy, -sgn * 0.68 * sy);
              add("cyl", wh, 0.44, [0.92, 0.09, 0.92], [0, yaw, Math.PI / 2], 0x62442f);
              add("cyl", wh, 0.44, [0.24, 0.14, 0.24], [0, yaw, Math.PI / 2], 0x4b3526);
            }
          }
          // Grain sacks riding on the deck
          add("box", cartPt, 0.98, [0.82, 0.3, 0.62], [0, yaw + 0.08, 0], 0xc9b388);
          const sackPt = scale(cartPt, 0.14 * Math.cos(yaw) - 0.5 * Math.sin(yaw), -0.14 * Math.sin(yaw) - 0.5 * Math.cos(yaw));
          add("box", sackPt, 1.2, [0.6, 0.24, 0.44], [0, yaw - 0.07, 0], 0xb39e72);
          // Charabada (yoke) resting on the shafts
          const yoke = scale(cartPt, sy * 1.72, cy * 1.72);
          add("box", yoke, 0.32, [0.12, 0.1, 1.62], [-0.18, yaw, 0], 0x6d4d35);
          add("box", yoke, 0.15, [1.38, 0.1, 0.13], [0, yaw, 0], 0x6d4d35);

          // Harnessed Ongole bullock standing at the yoke (hitched, weight-shifting)
          const leadOx = scale(cartPt, sy * 2.15, cy * 2.15);
          animalActor("atlas-bullock", leadOx, yaw, 11, { radius: 0.3, speed: 0.05 });
          // A second bullock grazing peacefully beside the cart
          let placedOx = null;
          for (let oxIdx = 0; oxIdx < 8; oxIdx++) {
            const oa = yaw + oxIdx * (Math.PI / 4),
              oxPt = scale(cartPt, Math.cos(oa) * 2.3, Math.sin(oa) * 2.3);
            if (clearSpot(oxPt, 1.05)) {
              animalActor("atlas-bullock", oxPt, yaw + 0.35, 13 + oxIdx, { radius: 1.8, speed: 0.36 });
              placedOx = oxPt;
              break;
            }
          }
          solids.push([cartPt[0], cartPt[1], 1.22 / M]);
          solids.push([leadOx[0], leadOx[1], 0.8 / M]);
          if (placedOx) solids.push([placedOx[0], placedOx[1], 0.88 / M]);
          break;
        }
      }
      if (cartPt) break;
    }

    // 4. Village Angadi / Chai & Produce Pavilion (గ్రామ అంగడి / తేనీటి పందిరి)
    let placedStall = false;
    for (const rad of [6.8, 9.6, 12.2]) {
      for (let i = 0; i < 16; i++) {
        const a = i * ((Math.PI * 2) / 16) + 4.2,
          stallPt = scale(z, Math.cos(a) * rad, Math.sin(a) * rad);
        if (clearSpot(stallPt, 2.35)) {
          placedStall = true;
          const yaw = Math.atan2(p[0] - stallPt[0], -(p[1] - stallPt[1])),
            cy = Math.cos(yaw),
            sy = Math.sin(yaw),
            loc = (lx, lz) => scale(stallPt, lx * cy + lz * sy, -lx * sy + lz * cy);
          // Plinth, 4 timber posts, hipped thatch roof
          add("box", stallPt, 0.11, [3.1, 0.22, 2.5], [0, yaw, 0], 0xb9a88d);
          for (const sx of [-1.32, 1.32])
            for (const sz of [-1.02, 1.02])
              add("trunk", loc(sx, sz), 1.28, [0.14, 2.35, 0.14], [0, yaw, 0], 0x694a33);
          add("cone", stallPt, 2.86, [4.1, 1.08, 3.4], [0, yaw + Math.PI / 4, 0], 0xa9824f);
          // Counter, brass tea samovar, clay kulhad cups, and colourful harvest baskets
          add("box", loc(0, 0.42), 0.62, [2.35, 0.78, 0.62], [0, yaw, 0], 0x7a553a);
          add("cyl", loc(-0.62, 0.42), 1.2, [0.28, 0.38, 0.28], [0, 0, 0], 0xc99c4e);
          add("cyl", loc(-0.18, 0.44), 1.08, [0.1, 0.12, 0.1], [0, 0, 0], 0xb36a4c);
          add("cyl", loc(-0.02, 0.46), 1.08, [0.1, 0.12, 0.1], [0, 0, 0], 0xb36a4c);
          // Produce baskets (golden mangoes, red chillies, fresh greens)
          for (const [bx, colFruit] of [
            [0.42, 0xe2a836],
            [0.86, 0xc84732],
            [-0.95, 0x5d8d46],
          ]) {
            add("cyl", loc(bx, 0.42), 1.09, [0.36, 0.16, 0.36], [0, 0, 0], 0x9b794d);
            add("leaf", loc(bx, 0.42), 1.2, [0.3, 0.18, 0.3], [0, 0, 0], colFruit);
          }
          // Warm glowing hanging lantern inside the Angadi stall
          add("glow", loc(0, 0.35), 2.18, [0.24, 0.28, 0.24], [0, 0, 0], 0xffd98a);

          // Friendly shopkeeper behind counter (live Atlas rig) + steam wisp rising from kettle + foraging hens nearby
          personActor(loc(0.15, -0.32), 0.22, yaw, 21, { mode: "idle", face: yaw });
          const wispGrp = placeGroupAt(loc(-0.62, 0.42), 1.48, 0);
          for (let wIdx = 0; wIdx < 3; wIdx++) {
            const puff = partMesh(
              unitOrb,
              0xf7f4ea,
              0.14 + wIdx * 0.05,
              0.12 + wIdx * 0.04,
              0.14 + wIdx * 0.05,
              0,
              wIdx * 0.24,
              0,
              { transparent: true, opacity: 0.38 - wIdx * 0.08 },
            );
            wispGrp.add(puff);
            animated.push({ kind: "wisp", puff, idx: wIdx, phase: wIdx * 1.9 });
          }
          let hensPlaced = 0;
          for (let hIdx = 0; hIdx < 8 && hensPlaced < 2; hIdx++) {
            const ha = hIdx * (Math.PI / 4),
              henSpot = scale(stallPt, Math.cos(ha) * 2.15, Math.sin(ha) * 2.15);
            if (clearSpot(henSpot, 0.55)) {
              animalActor("atlas-hen", henSpot, ha + 0.7, 23 + hensPlaced, { radius: 1.9, speed: 0.33 });
              hensPlaced++;
            }
          }
          // A white Ongole cow grazing behind the angadi + a village dog loafing at the front
          const cowSpot = loc(-2.35, -1.3);
          if (clearSpot(cowSpot, 1.0)) animalActor("atlas-cow", cowSpot, yaw + 1.2, 27, { radius: 2.1, speed: 0.4 });
          const dogSpot = loc(1.35, 1.15);
          if (clearSpot(dogSpot, 0.45)) animalActor("atlas-village-dog", dogSpot, yaw + Math.PI, 29, { radius: 2.6, speed: 0.78 });
          // Open-source stall benches for customers waiting for chai
          const benchA = loc(-0.95, 1.75),
            benchB = loc(0.95, 1.75);
          if (clearSpot(benchA, 0.72)) propActor("kenney-stall-bench", benchA, 0, yaw, 0.46);
          if (clearSpot(benchB, 0.72)) propActor("kenney-stall-bench", benchB, 0, yaw, 0.46);
          solids.push([stallPt[0], stallPt[1], 1.55 / M]);
          break;
        }
      }
      if (placedStall) break;
    }

    // 5. Festive Mango-Leaf & Marigold Toranam Welcome Arch + Hub Lantern Post
    const lampPt = scale(z, 2.45, -1.85);
    if (clearSpot(lampPt, 0.85)) {
      // Open-source CC0 standing lantern (town-kit) — warm glow at dusk
      const post = propActor("kenney-lantern", lampPt, 0, 0.4, 1.62, { castShadow: true });
      if (!post) {
        add("trunk", lampPt, 1.75, [0.14, 3.5, 0.14], [0, 0, 0], 0x4c534b);
        add("box", lampPt, 3.55, [0.36, 0.1, 0.36], [0, 0.4, 0], 0x3d433c);
      }
      add("glow", lampPt, post ? 1.47 : 3.38, [0.3, 0.34, 0.3], [0, 0, 0], 0xffd788);
    }
    const toranPt = scale(z, -3.4, -2.6);
    if (clearSpot(toranPt, 1.4)) {
      for (const sgn of [-1, 1]) {
        add("trunk", scale(toranPt, sgn * 1.1, 0), 1.45, [0.13, 2.9, 0.13], [0, 0, 0], 0x6e4d35);
      }
      add("box", toranPt, 2.86, [2.36, 0.09, 0.09], [0, 0, 0], 0x7d583c);
      const garland = placeGroupAt(toranPt, 2.82, 0);
      for (let tIdx = -4; tIdx <= 4; tIdx++) {
        const uX = tIdx * 0.24,
          sag = -0.14 * (1 - (tIdx / 4.5) ** 2);
        garland.add(
          partMesh(
            unitOrb,
            tIdx % 2 === 0 ? 0xf09b2b : 0x4a823f,
            0.13,
            0.18,
            0.09,
            uX,
            sag,
            0,
          ),
        );
      }
      animated.push({ kind: "toranam", garland, phase: 0.8 });
    }
  }

  // 6. Living Village Streets & Bund Shoulders: Street Lanterns, Chalivendram Water Stand, Stone Benches & Paddy Haystacks
  let streetStation = 0;
  for (const path of paths || []) {
    if (!["village", "bund"].includes(path.type) || !path.xy?.length) continue;
    const isStreet = path.type === "village";
    let accum = 8;
    for (let i = 1; i < path.xy.length; i++) {
      const [ax, ay] = path.xy[i - 1],
        [bx, by] = path.xy[i],
        segM = Math.hypot(bx - ax, by - ay) * M;
      if (segM < 0.5) continue;
      const tx = (bx - ax) / (segM / M),
        ty = (by - ay) / (segM / M),
        nx = -ty,
        ny = tx;
      while (accum < segM) {
        const frac = accum / segM,
          px = ax + (bx - ax) * frac,
          py = ay + (by - ay) * frac,
          distFocus = Math.hypot(px - focus.x, py - focus.y) * M;
        if (distFocus < midRange) {
          const sgn = streetStation % 2 === 0 ? 1 : -1,
            lat = (path.w || 1.7) * 0.5 + (isStreet ? 1.55 : 2.35),
            spot = [px + (nx * sgn * lat) / M, py + (ny * sgn * lat) / M];
          if (isStreet && streetStation % 3 === 0 && clearSpot(spot, 0.75)) {
            // Warm village street lantern (open-source CC0 standing lantern)
            const lantern = propActor("kenney-lantern", spot, 0, hash01(streetStation * 3.3 + 1.1) * 3, 1.5);
            if (!lantern) {
              add("trunk", spot, 1.65, [0.12, 3.3, 0.12], [0, 0, 0], 0x4e564e);
              add("box", spot, 3.32, [0.3, 0.08, 0.3], [0, 0, 0], 0x3b423b);
            }
            add("glow", spot, lantern ? 1.37 : 3.16, [0.26, 0.28, 0.26], [0, 0, 0], 0xffd584);
          } else if (isStreet && streetStation % 7 === 2 && clearSpot(spot, 1.35)) {
            // Wayside stone Arugu bench under a young Neem tree
            const yaw = Math.atan2(tx, -ty);
            add("box", spot, 0.22, [1.45, 0.44, 0.52], [0, yaw, 0], 0xc9beab);
            add("box", spot, 0.45, [1.55, 0.08, 0.58], [0, yaw, 0], 0xdfd6c3);
            const treeSpot = [spot[0] + (nx * sgn * 1.15) / M, spot[1] + (ny * sgn * 1.15) / M];
            if (clearSpot(treeSpot, 0.8)) {
              add("trunk", treeSpot, 1.6, [0.32, 3.2, 0.32], [0, 0, 0], 0x7b6043);
              add("leaf", treeSpot, 3.45, [2.9, 2.2, 2.9], [0.06, streetStation, 0], 0x5c864b);
            }
          } else if (isStreet && streetStation === 4) {
            const chaliSpot = [px + (nx * sgn * 2.35) / M, py + (ny * sgn * 2.35) / M];
            if (clearSpot(chaliSpot, 1.35)) {
              // Traditional Chalivendram (చలివేంద్రం): shaded earthen drinking-water pot stand for travellers
              add("box", chaliSpot, 0.38, [1.35, 0.76, 0.75], [0, 0, 0], 0x8b6849);
              for (const sx of [-0.6, 0.6])
                for (const sz of [-0.32, 0.32])
                  add("trunk", scale(chaliSpot, sx, sz), 1.1, [0.09, 2.2, 0.09], [0, 0, 0], 0x6f4f36);
              add("cone", chaliSpot, 2.38, [1.95, 0.68, 1.35], [0, Math.PI / 4, 0], 0xb08954);
              for (const pxOff of [-0.34, 0.04, 0.4])
                add("cyl", scale(chaliSpot, pxOff, 0), 0.96, [0.32, 0.36, 0.32], [0, 0, 0], 0xb46849);
              solids.push([chaliSpot[0], chaliSpot[1], 0.85 / M]);
            }
          } else if (!isStreet && streetStation % 4 === 1) {
            const haySpot = [px + (nx * sgn * 3.1) / M, py + (ny * sgn * 3.1) / M];
            if (clearSpot(haySpot, 1.85)) {
              // Golden conical paddy haystack (గడ్డి వాము) beside the field bund
              add("cyl", haySpot, 0.55, [2.35, 1.1, 2.35], [0, 0, 0], 0xc9a85c);
              add("cone", haySpot, 1.72, [2.55, 1.35, 2.55], [0, 0.3, 0], 0xd6b566);
              solids.push([haySpot[0], haySpot[1], 1.25 / M]);
            }
          }
        }
        accum += isStreet ? 22 : 34;
        streetStation++;
      }
      accum -= segM;
    }
  }

  for (const [k, bin] of shapes) {
    const count = bin.c.length / 3;
    if (!count) continue;
    const isGlow = k === "glow",
      b =
        k === "leaf"
          ? new T.IcosahedronGeometry(0.5, 1)
          : k === "box"
            ? new T.BoxGeometry(1, 1, 1)
            : k === "cone"
              ? new T.CylinderGeometry(0.06, 0.52, 1, 8)
              : isGlow
                ? new T.SphereGeometry(0.5, 8, 6)
                : new T.CylinderGeometry(0.5, 0.5, 1, k === "trunk" ? 6 : 12),
      mat = new T.MeshLambertMaterial({
        flatShading: k === "leaf" || k === "cone",
      });
    if (isGlow) {
      mat.emissive.set(0xffc978);
      mat.emissiveIntensity = 0;
    }
    const m = new T.InstancedMesh(b, mat, count);
    m.instanceMatrix.array.set(bin.m);
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor = new T.InstancedBufferAttribute(
      new Float32Array(bin.c),
      3,
    );
    m.computeBoundingSphere();
    m.userData = {
      role: "commons-" + k,
      cullable: true,
      disposableMaterial: true,
      ...(isGlow ? { glow: 0 } : {}),
    };
    g.add(m);
  }
  if (actorRoot.children.length) {
    actorRoot.userData = {
      role: "commons-actors",
      cleanup() {
        unitBox.dispose();
        unitCyl.dispose();
        unitOrb.dispose();
        for (const m of matCache.values()) m.dispose();
      },
    };
    g.add(actorRoot);
  }
  g.userData.solids = solids;
  g.userData.animated = animated;
  g.userData.groundXYZ = (x, y, lift = 0) => s.xyz(x, y, s.ground(x, y) + lift);
  return g;
}

// A traveller-aligned live actor: time-aware so walking, pauses and head-tracking feel inhabited.
// focus: optional {x, y} ground position of the player (grid units) for head awareness.
export function updateHamlet(ham, t, focus = null) {
  const list = ham?.userData?.animated;
  if (!list?.length) return;
  const dt = Math.min(0.09, Math.max(0, t - (ham.userData.lastT ?? t)));
  ham.userData.lastT = t;
  const groundXYZ = ham.userData.groundXYZ,
    focusXY =
      focus && Number.isFinite(focus.x ?? focus[0])
        ? [focus.x ?? focus[0], focus.y ?? focus[1]]
        : null;
  const headLook = (a) => {
    let target = 0;
    if (focusXY) {
      const dx = focusXY[0] - a.x,
        dy = focusXY[1] - a.y,
        d = Math.hypot(dx, dy) * M;
      if (d < 8.5 && d > 0.3) {
        const worldYaw = Math.atan2(dx, -dy);
        target = Math.max(
          -0.62,
          Math.min(
            0.62,
            Math.atan2(Math.sin(worldYaw - a.yaw), Math.cos(worldYaw - a.yaw)),
          ),
        );
      }
    }
    a.look += (target - a.look) * (1 - Math.exp(-dt * 5.2));
    LOOK_Q.setFromAxisAngle(UP_AXIS, a.look);
    a.R.bones[7]?.quaternion.multiply(LOOK_Q);
  };
  for (const a of list) {
    const p = a.phase || 0;
    if (a.kind === "person") {
      a.clock += dt;
      const R = a.R,
        stand = R.d.clips.stand?.seconds || 6;
      if (a.mode === "patrol" && a.waypoints?.length) {
        const wp = a.waypoints[a.wi],
          dx = wp[0] - a.x,
          dy = wp[1] - a.y,
          distM = Math.hypot(dx, dy) * M;
        if (t < a.pauseUntil) {
          R.sample("stand", a.clock / stand);
        } else if (distM < 0.4) {
          a.pauseUntil = t + 1.7 + hash01(a.seed * 31.7 + a.wi * 7.3) * 3.6;
          a.wi += a.dir;
          if (a.wi >= a.waypoints.length || a.wi < 0) {
            a.dir *= -1;
            a.wi = Math.max(0, Math.min(a.waypoints.length - 1, a.wi));
          }
          R.sample("stand", a.clock / stand);
        } else {
          const targetYaw = Math.atan2(dx, -dy);
          a.yaw +=
            Math.atan2(Math.sin(targetYaw - a.yaw), Math.cos(targetYaw - a.yaw)) *
            (1 - Math.exp(-dt * 6));
          const step = Math.min(distM, a.speed * dt),
            inv = 1 / Math.max(1e-6, Math.hypot(dx, dy));
          a.x += dx * inv * (step / M);
          a.y += dy * inv * (step / M);
          a.gait = (a.gait + step / 0.74) % 1;
          R.sample("walk", a.gait);
        }
        if (groundXYZ) R.g.position.set(...groundXYZ(a.x, a.y, a.lift));
        R.g.rotation.y = a.yaw;
      } else {
        // Idle in place: full body language of the authored idle performance; occasional scan
        R.sample("stand", a.clock / stand);
        R.g.rotation.y =
          a.baseYaw +
          Math.sin(a.clock * 0.32 + a.seed * 2.13) * 0.42 +
          (a.face != null ? Math.sin(a.clock * 0.9 + a.seed) * 0.08 : 0);
      }
      headLook(a);
      R.commit();
    } else if (a.kind === "animal") {
      a.clock = (a.clock || 0) + dt;
      const R = a.R,
        stand = R.d.clips.stand?.seconds || 6,
        h = R.d.height || 1;
      if (t < a.pauseUntil) {
        R.sample("stand", a.clock / stand);
      } else {
        if (!a.target) {
          const ang = hash01(a.seed * 91.7 + a.moveT * 13.3 + Math.floor(t * 0.5)) * Math.PI * 2,
            dist = (0.35 + hash01(a.seed * 7.13 + a.moveT * 3.71) * 0.65) * (a.radius / M);
          a.target = [a.homeX + Math.cos(ang) * dist, a.homeY + Math.sin(ang) * dist];
        }
        const dx = a.target[0] - a.x,
          dy = a.target[1] - a.y,
          distM = Math.hypot(dx, dy) * M;
        if (distM < 0.3) {
          a.pauseUntil = t + 1.9 + hash01(a.seed * 17.3 + a.moveT * 7.9) * 3.8;
          a.target = null;
          a.moveT++;
          R.sample("stand", a.clock / stand);
        } else {
          const targetYaw = Math.atan2(dx, -dy);
          a.yaw +=
            Math.atan2(Math.sin(targetYaw - a.yaw), Math.cos(targetYaw - a.yaw)) *
            (1 - Math.exp(-dt * 4.6));
          const step = Math.min(distM, a.speed * dt),
            inv = 1 / Math.max(1e-6, Math.hypot(dx, dy));
          a.x += dx * inv * (step / M);
          a.y += dy * inv * (step / M);
          a.gait = (a.gait + step / (h * 1.32)) % 1;
          R.sample("walk", a.gait);
        }
        if (groundXYZ) R.g.position.set(...groundXYZ(a.x, a.y, a.lift || 0));
        R.g.rotation.y = a.yaw;
      }
      R.commit();
    } else if (a.kind === "bird") {
      const ang = t * 0.58 + p;
      a.bird.position.set(
        a.cx + Math.cos(ang) * a.r,
        a.cy + Math.sin(ang * 2.1) * 0.38,
        a.cz + Math.sin(ang) * a.r,
      );
      a.bird.rotation.y = -ang;
      a.bird.rotation.z = 0.22;
      const flap = Math.sin(t * 9.5 + p) * 0.48;
      a.wingL.rotation.z = flap;
      a.wingR.rotation.z = -flap;
    } else if (a.kind === "toranam") {
      a.garland.rotation.x = Math.sin(t * 1.8 + p) * 0.08;
    } else if (a.kind === "wisp") {
      const cycle = ((t * 0.42 + a.idx * 0.33) % 1 + 1) % 1;
      a.puff.position.y = cycle * 0.85;
      a.puff.position.x = Math.sin(t * 1.4 + a.idx) * 0.09 * cycle;
      const sc = 0.1 + cycle * 0.16;
      a.puff.scale.set(sc, sc * 0.85, sc);
    }
  }
}
function fallenLeafGeometry() {
  // Sculpted rural shade-tree leaf (pointed drip-tip, arched midrib, gently cupped margins, short petiole).
  const verts = [
      // 0-1: petiole stem base & join
      [-0.004, 0.004, -0.138],
      [0.004, 0.004, -0.138],
      [0.0, 0.007, -0.098],
      // 3-5: lower wide blade (left, midrib, right)
      [-0.068, 0.017, -0.042],
      [0.0, 0.011, -0.038],
      [0.064, 0.014, -0.042],
      // 6-8: upper mid blade (left, midrib, right)
      [-0.054, 0.019, 0.034],
      [0.0, 0.012, 0.038],
      [0.051, 0.015, 0.034],
      // 9-11: tapering drip-tip shoulders & apex
      [-0.022, 0.014, 0.092],
      [0.021, 0.012, 0.092],
      [0.003, 0.018, 0.138],
    ],
    shades = [
      0.72, 0.72, 0.78,
      0.98, 0.84, 1.03,
      1.02, 0.86, 1.05,
      0.95, 0.96, 0.88,
    ],
    faces = [
      [0, 1, 2],
      [2, 4, 3],
      [2, 5, 4],
      [3, 4, 6],
      [4, 7, 6],
      [4, 5, 8],
      [4, 8, 7],
      [6, 7, 9],
      [7, 8, 10],
      [7, 10, 9],
      [9, 10, 11],
    ],
    pos = [],
    col = [],
    idx = [];
  verts.forEach((v, i) => {
    pos.push(...v);
    const s = shades[i];
    col.push(s, s * 0.98, s * 0.9);
  });
  for (const f of faces) idx.push(...f);
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function sampleRouteArc(xy) {
  const pts = [];
  for (const p of xy) {
    if (
      !pts.length ||
      Math.hypot(p[0] - pts.at(-1)[0], p[1] - pts.at(-1)[1]) * M > 0.03
    ) {
      pts.push(p);
    }
  }
  if (pts.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(
      cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * M,
    );
  }
  const total = cum.at(-1);
  if (total < 1.2) return null;
  const atArc = (arc) => {
    const a = Math.max(0, Math.min(total, arc));
    let k = 0;
    while (k < pts.length - 2 && cum[k + 1] < a) k++;
    const seg = Math.max(1e-6, cum[k + 1] - cum[k]),
      t = (a - cum[k]) / seg,
      x = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t,
      y = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t,
      dx = pts[k + 1][0] - pts[k][0],
      dy = pts[k + 1][1] - pts[k][1],
      len = Math.hypot(dx, dy) || 1;
    return {
      x,
      y,
      arc: a,
      tx: dx / len,
      ty: dy / len,
      nx: -dy / len,
      ny: dx / len,
    };
  };
  // Detect sharp bends as additional directional hint points alongside road forks.
  const bends = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const ux = pts[i][0] - pts[i - 1][0],
      uy = pts[i][1] - pts[i - 1][1],
      vx = pts[i + 1][0] - pts[i][0],
      vy = pts[i + 1][1] - pts[i][1],
      lu = Math.hypot(ux, uy) || 1,
      lv = Math.hypot(vx, vy) || 1,
      cosA = (ux * vx + uy * vy) / (lu * lv);
    if (cosA < 0.84) bends.push(cum[i]);
  }
  return { total, atArc, bends };
}

const ZERO_MAT = new T.Matrix4().makeScale(0, 0, 0),
  LEAF_PALETTE = [
    0xf0be42, // sunlit golden mango leaf
    0xe8892c, // warm amber palash leaf
    0xd65328, // vibrant flame-russet leaf
    0xb5cc3e, // fresh wind-dropped lime-gold leaf
    0xf5d46e, // bright straw-gold leaf
  ];

export function updateRouteLeaves(route, progress) {
  const st = route?.leafState;
  if (!st) return;
  let dirty = false;
  for (let i = 0; i < st.items.length; i++) {
    const it = st.items[i],
      hide = it.arc < progress + 1.15;
    if (hide !== it.hidden) {
      it.hidden = hide;
      st.mesh.setMatrixAt(i, hide ? ZERO_MAT : it.matrix);
      dirty = true;
    }
  }
  if (dirty) st.mesh.instanceMatrix.needsUpdate = true;
}

// A single owner can be selected. The other fields have no outline. Guided walks scatter very sparse fallen tree leaves along the footpath & road splits without covering the dirt track.
export function marks(s, r, kind, route) {
  const g = new T.Group();
  if (!r) return g;
  const pts = [],
    warm = kind === "home" ? 0xd9be8a : 0xdcc998;
  function line(a, b, e = 0.14) {
    const n = Math.max(
      1,
      Math.ceil((Math.hypot(a[0] - b[0], a[1] - b[1]) * M) / 1.8),
    );
    for (let j = 0; j < n; j++)
      for (const t of [j / n, (j + 1) / n]) {
        const x = a[0] + (b[0] - a[0]) * t,
          y = a[1] + (b[1] - a[1]) * t;
        pts.push(...s.xyz(x, y, s.ground(x, y) + e));
      }
  }
  const corners =
    kind === "home"
      ? [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([x, y]) =>
          localPoint(
            r.house,
            x * (r.house.size_m[0] / 2 + 0.2),
            y * (r.house.size_m[1] / 2 + 0.2),
          ),
        )
      : [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ].map(([X, Y]) => [r.c[0] + X, r.c[1] + Y]);
  for (let i = 0; i < 4; i++) {
    line(corners[i], corners[(i + 1) % 4], kind === "home" ? 0.36 : 0.19);
    if (kind === "home") {
      const [a, b] = corners[i],
        p = s.xyz(a, b, s.ground(a, b) + 0.35);
      pts.push(...p, p[0], p[1] + r.house.size_m[2] * 0.79, p[2]);
    }
  }
  if (kind === "home") {
    const h = r.house,
      p = roomPlan(h),
      front = p.front + 0.14,
      z = s.ground(...h.centre),
      edges = [
        [-1, p.floor],
        [-1, p.floor + p.dh + 0.09],
        [1, p.floor + p.dh + 0.09],
        [1, p.floor],
      ];
    for (let i = 1; i < edges.length; i++)
      for (const [side, height] of [edges[i - 1], edges[i]]) {
        const [x, y] = localPoint(
          h,
          p.door + side * (p.dw * 0.5 + 0.07),
          front,
        );
        pts.push(...s.xyz(x, y, z + height));
      }
  }
  let geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(pts, 3));
  const a = new T.LineSegments(
    geo,
    new T.LineBasicMaterial({
      color: warm,
      transparent: true,
      opacity: 0.66,
      depthWrite: false,
    }),
  );
  a.userData = { role: kind + "-selection", disposableMaterial: true };
  g.add(a);

  if (route?.xy?.length > 1) {
    const sampler = sampleRouteArc(route.xy);
    if (sampler) {
      const { total, atArc, bends } = sampler,
        hintArcs = [...(route.forks || []), ...bends].sort((u, v) => u - v),
        arcList = [];

      // 1. Rich multi-leaf clusters right after road splits/forks & sharp turns so every turn is unmistakable.
      for (const fArc of hintArcs) {
        for (const off of [0.55, 1.15, 1.85, 2.65, 3.55]) {
          const a0 = fArc + off;
          if (a0 < 1.2 || a0 > total - 0.6) continue;
          if (arcList.every((q) => Math.abs(q.arc - a0) > 0.42)) {
            arcList.push({ arc: a0, forkHint: true, sideBias: 0 });
            arcList.push({
              arc: Math.min(total - 0.5, a0 + 0.18),
              forkHint: true,
              sideBias: off % 1 > 0.5 ? 0.22 : -0.22,
            });
          }
        }
      }

      // 2. Continuous natural wind-drifted leaf trail (~every 1.45 - 2.1 m with 2-3 leaves per station) so the path is effortless to follow.
      let cursor = 1.4,
        stepIdx = 0;
      while (cursor < total - 0.7) {
        if (arcList.every((q) => Math.abs(q.arc - cursor) > 0.75)) {
          arcList.push({ arc: cursor, forkHint: false, sideBias: 0 });
          const sideSign = stepIdx % 2 === 0 ? 1 : -1;
          if (cursor + 0.28 < total - 0.6) {
            arcList.push({
              arc: cursor + 0.26,
              forkHint: false,
              sideBias: sideSign * (0.18 + hash01(stepIdx * 11.3 + 3.7) * 0.22),
            });
          }
          if (
            hash01(stepIdx * 13.7 + 5.1) > 0.35 &&
            cursor + 0.56 < total - 0.6
          ) {
            arcList.push({
              arc: cursor + 0.52,
              forkHint: false,
              sideBias: -sideSign * (0.15 + hash01(stepIdx * 17.9 + 1.3) * 0.24),
            });
          }
        }
        cursor += 1.45 + hash01(stepIdx * 7.3 + 1.9) * 0.65;
        stepIdx++;
      }
      arcList.sort((u, v) => u.arc - v.arc);

      if (arcList.length) {
        const leafGeo = fallenLeafGeometry(),
          leafMat = new T.MeshLambertMaterial({
            vertexColors: true,
            side: T.DoubleSide,
            emissive: 0x3b2408,
            emissiveIntensity: 0.25,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
          }),
          mesh = new T.InstancedMesh(leafGeo, leafMat, arcList.length),
          colorTmp = new T.Color(),
          eps = 0.25 / M,
          p0 = new T.Vector3(),
          px = new T.Vector3(),
          pz = new T.Vector3(),
          upV = new T.Vector3(),
          fwdV = new T.Vector3(),
          rightV = new T.Vector3(),
          basisM = new T.Matrix4(),
          scaleV = new T.Vector3(),
          items = [];

        arcList.forEach(({ arc, forkHint, sideBias = 0 }, idxL) => {
          const sp = atArc(arc),
            r1 = hash01(idxL * 19.3 + arc * 0.7),
            r2 = hash01(idxL * 31.7 + 2.3),
            r3 = hash01(idxL * 47.1 + 8.9),
            latM = sideBias + (r1 - 0.5) * (forkHint ? 0.36 : 0.48),
            lx = sp.x + (sp.nx * latM) / M,
            ly = sp.y + (sp.ny * latM) / M,
            lift = 0.032 + r2 * 0.014;

          p0.set(...s.xyz(lx, ly, s.ground(lx, ly) + lift));
          px.set(...s.xyz(lx + eps, ly, s.ground(lx + eps, ly) + lift)).sub(p0);
          pz.set(...s.xyz(lx, ly - eps, s.ground(lx, ly - eps) + lift)).sub(p0);
          upV.crossVectors(pz, px).normalize();
          if (upV.y < 0) upV.negate();

          // Point leaf generally along the trail breeze with natural organic yaw variation.
          const yawJitter = (r2 - 0.5) * (forkHint ? 0.62 : 1.25),
            aheadPt = s.xyz(
              lx + (sp.tx * 0.5) / M,
              ly + (sp.ty * 0.5) / M,
              s.ground(lx, ly) + lift,
            );
          fwdV
            .set(aheadPt[0] - p0.x, aheadPt[1] - p0.y, aheadPt[2] - p0.z)
            .addScaledVector(upV, -fwdV.dot(upV))
            .normalize();
          if (fwdV.lengthSq() < 1e-6) fwdV.set(0, 0, 1);
          fwdV.applyAxisAngle(upV, yawJitter);
          rightV.crossVectors(upV, fwdV).normalize();
          fwdV.crossVectors(rightV, upV).normalize();

          const sc = (forkHint ? 1.52 : 1.36) * (0.88 + r3 * 0.34);
          scaleV.set(sc * (0.92 + r1 * 0.18), sc, sc * (0.94 + r2 * 0.16));
          basisM.makeBasis(rightV, upV, fwdV);
          basisM.scale(scaleV);
          basisM.setPosition(p0);

          const matCopy = basisM.clone();
          mesh.setMatrixAt(idxL, matCopy);
          colorTmp.setHex(
            LEAF_PALETTE[Math.floor(r3 * LEAF_PALETTE.length) % LEAF_PALETTE.length],
          );
          mesh.setColorAt(idxL, colorTmp);
          items.push({ arc, matrix: matCopy, hidden: false });
        });

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.userData = { role: "walking-waymarks", disposableMaterial: true };
        route.leafState = { mesh, items };
        g.add(mesh);
      }
    }
  }
  return g;
}
