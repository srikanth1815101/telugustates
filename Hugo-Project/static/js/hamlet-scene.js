// Shared packed-earth clearing and a neem shade platform at the village hub.
import { roomPlan } from "./home-volume.js";
import * as T from "../vendor/three.module.min.js";
import { ACRE as M, localPoint } from "./metres.js";
const scale = (p, x, y) => [p[0] + x / M, p[1] + y / M];
export function hamletScene(s, rows, commons, focus, tier) {
  const g = new T.Group(),
    shapes = new Map(),
    obj = new T.Object3D(),
    col = new T.Color(),
    me = obj.matrix.elements,
    solids = [],
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
  const clearSpot = (p, radM) =>
    (!s.ways || s.ways.clear(p[0], p[1], radM)) &&
    !rows.some(
      (r) => r[5] && Math.hypot(r[5].centre[0] - p[0], r[5].centre[1] - p[1]) * M < 8.5,
    );

  for (const v of commons) {
    const p = v.hub;
    const distM = Math.hypot(p[0] - focus.x, p[1] - focus.y) * M;
    if (distM > range || !v.shade) continue;
    const z = v.shade,
      inMid = distM < midRange;

    // 1. Sacred Banyan / Peepal Rachabanda (రచ్చబండ) chabutra platform & elder canopy
    add("cyl", z, 0.12, [4.2, 0.24, 4.2], [0, 0.2, 0], 0x9b896f);
    add("cyl", z, 0.36, [3.55, 0.34, 3.55], [0, 0.2, 0], 0xede2c4);
    add("cyl", z, 0.37, [3.6, 0.14, 3.6], [0, 0.2, 0], 0xb4573c);
    add("cyl", z, 0.56, [3.75, 0.1, 3.75], [0, 0.2, 0], 0xcab693);
    add("trunk", z, 2.55, [0.68, 5.1, 0.68], [0, 0.8, 0.02], 0x7a6042);

    for (let k = 0; k < (inMid ? 7 : 4); k++) {
      const a = k * 2.094,
        rad = k ? 1.65 : 0,
        leafH = 4.55 + (k ? Math.sin(k * 0.9) * 0.45 : 1.25),
        b = scale(z, Math.cos(a) * rad, Math.sin(a) * rad);
      if (k && inMid) {
        const limb = scale(z, Math.cos(a) * 0.85, Math.sin(a) * 0.85);
        add(
          "trunk",
          limb,
          (3.2 + leafH) * 0.5,
          [0.26, 2.05, 0.26],
          [0.68, Math.atan2(Math.cos(a), -Math.sin(a)), 0],
          0x765c3f,
        );
        if (k % 2 === 1) {
          const rootPt = scale(z, Math.cos(a) * 1.25, Math.sin(a) * 1.25);
          add("trunk", rootPt, 2.15, [0.09, 3.1, 0.09], [0.03, a, 0], 0x876c4d);
        }
      }
      add(
        "leaf",
        b,
        leafH,
        k ? [4.25, 3.0, 4.15] : [4.9, 3.35, 4.9],
        [0.11 * k, a, 0.08 * k],
        [0x547848, 0x6b894e, 0x739057, 0x4b6e44][k % 4],
      );
    }
    solids.push([z[0], z[1], 1.85 / M]);

    if (!inMid) continue;

    // 2. Traditional Stone-Ringed Village Well (గ్రామ బావి) with pulley crossbeam & terracotta pots
    let wellPt = null;
    for (let i = 0; i < 12; i++) {
      const a = i * ((Math.PI * 2) / 12) + 0.55,
        cand = scale(z, Math.cos(a) * 5.3, Math.sin(a) * 5.3);
      if (clearSpot(cand, 2.1)) {
        wellPt = cand;
        break;
      }
    }
    if (wellPt) {
      add("cyl", wellPt, 0.05, [2.85, 0.1, 2.85], [0, 0, 0], 0x999080);
      add("cyl", wellPt, 0.42, [2.05, 0.78, 2.05], [0, 0, 0], 0xb2a58e);
      add("cyl", wellPt, 0.82, [2.18, 0.1, 2.18], [0, 0, 0], 0xd9ceb6);
      add("cyl", wellPt, 0.62, [1.62, 0.42, 1.62], [0, 0, 0], 0x264648);
      for (const sgn of [-1, 1]) {
        const post = scale(wellPt, sgn * 0.92, 0);
        add("box", post, 1.32, [0.16, 1.82, 0.16], [0, 0, 0], 0x8f8371);
      }
      add("box", wellPt, 2.22, [2.06, 0.14, 0.16], [0, 0, 0], 0x6b4b35);
      add("cyl", wellPt, 2.04, [0.34, 0.08, 0.34], [0, 0, Math.PI / 2], 0x4d463f);
      const potA = scale(wellPt, 1.15, 0.52),
        potB = scale(wellPt, 0.95, 0.84);
      add("cyl", potA, 0.24, [0.42, 0.42, 0.42], [0, 0, 0], 0xa96548);
      add("cyl", potB, 0.21, [0.36, 0.36, 0.36], [0, 0, 0], 0xb57150);
      solids.push([wellPt[0], wellPt[1], 1.15 / M]);
    }

    // 3. Resting Wooden Bullock Cart (ఎడ్ల బండి) & Village Chowk Lantern Post
    for (let i = 0; i < 12; i++) {
      const a = i * ((Math.PI * 2) / 12) + 2.65,
        cartPt = scale(z, Math.cos(a) * 5.6, Math.sin(a) * 5.6);
      if (
        (!wellPt || Math.hypot(cartPt[0] - wellPt[0], cartPt[1] - wellPt[1]) * M > 4.2) &&
        clearSpot(cartPt, 2.3)
      ) {
        const yaw = a + 0.6,
          cy = Math.cos(yaw),
          sy = Math.sin(yaw);
        add("box", cartPt, 0.62, [1.26, 0.12, 2.25], [-0.14, yaw, 0], 0x7d5a3e);
        for (const sgn of [-1, 1]) {
          const rail = scale(cartPt, sgn * 0.58 * cy, -sgn * 0.58 * sy);
          add("box", rail, 0.82, [0.08, 0.34, 2.2], [-0.14, yaw, 0], 0x936e4b);
          const wh = scale(cartPt, sgn * 0.72 * cy, -sgn * 0.72 * sy);
          add("cyl", wh, 0.56, [1.12, 0.1, 1.12], [0, yaw, Math.PI / 2], 0x62442f);
          add("cyl", wh, 0.56, [0.28, 0.16, 0.28], [0, yaw, Math.PI / 2], 0x4b3526);
        }
        const yoke = scale(cartPt, sy * 1.65, cy * 1.65);
        add("box", yoke, 0.34, [0.1, 0.1, 1.55], [-0.28, yaw, 0], 0x6d4d35);
        add("box", yoke, 0.16, [1.35, 0.1, 0.12], [0, yaw, 0], 0x6d4d35);
        solids.push([cartPt[0], cartPt[1], 1.18 / M]);
        break;
      }
    }

    const lampPt = scale(z, 2.25, -1.65);
    if (!s.ways || s.ways.clear(lampPt[0], lampPt[1], 1.1)) {
      add("trunk", lampPt, 1.65, [0.14, 3.3, 0.14], [0, 0, 0], 0x4c534b);
      add("box", lampPt, 3.32, [0.34, 0.32, 0.34], [0, 0.4, 0], 0xf2ca78);
    }
  }

  for (const [k, bin] of shapes) {
    const count = bin.c.length / 3;
    if (!count) continue;
    const b =
        k === "leaf"
          ? new T.IcosahedronGeometry(0.5, 1)
          : k === "box"
            ? new T.BoxGeometry(1, 1, 1)
            : new T.CylinderGeometry(0.5, 0.5, 1, k === "trunk" ? 6 : 12),
      m = new T.InstancedMesh(
        b,
        new T.MeshLambertMaterial({ flatShading: k !== "cyl" }),
        count,
      );
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
    };
    g.add(m);
  }
  g.userData.solids = solids;
  return g;
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

function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
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
