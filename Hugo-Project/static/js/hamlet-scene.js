// Shared packed-earth clearing and a neem shade platform at the village hub.
import { roomPlan } from "./home-volume.js";
import * as T from "../vendor/three.module.min.js";
import { ACRE as M, localPoint } from "./metres.js";
const scale = (p, x, y) => [p[0] + x / M, p[1] + y / M];
export function hamletScene(s, rows, commons, focus, tier) {
  const g = new T.Group(),
    shapes = new Map(),
    obj = new T.Object3D(),
    solids = [],
    range = tier ? 280 : 160;
  const add = (k, p, height, xyz, rotation, color) => {
    const a = shapes.get(k) || shapes.set(k, []).get(k);
    obj.rotation.order = "YXZ";
    obj.position.set(...s.xyz(...p, s.ground(...p) + height));
    obj.scale.set(...xyz);
    obj.rotation.set(...rotation);
    obj.updateMatrix();
    a.push([obj.matrix.clone(), new T.Color(color)]);
  };
  for (const v of commons) {
    const p = v.hub;
    if (Math.hypot(p[0] - focus.x, p[1] - focus.y) * M > range) continue;
    // Earth clearing is blended into the same ground surface as lanes.
    if (!v.shade) continue;
    const z = v.shade;
    add("trunk", z, 2.35, [0.48, 4.7, 0.5], [0, 0.8, 0.02], 0x806647);
    add("bench", z, 0.23, [2.65, 0.5, 2.5], [0, 0.22, 0], 0x9a876c);
    add("seat", z, 0.5, [2.9, 0.14, 2.7], [0, 0.22, 0], 0xc4aa85);
    for (let k = 0; k < 6; k++) {
      const a = k * 2.4,
        leafH = 4.08 + (k ? Math.sin(k * 0.8) * 0.45 : 1.15),
        b = scale(
          z,
          Math.cos(a) * (k ? 1.35 : 0),
          Math.sin(a) * (k ? 1.35 : 0),
        );
      if (k) {
        const limb = scale(z, Math.cos(a) * 0.68, Math.sin(a) * 0.68);
        add(
          "trunk",
          limb,
          (3.05 + leafH) * 0.5,
          [0.24, 1.85, 0.24],
          [0.68, Math.atan2(Math.cos(a), -Math.sin(a)), 0],
          0x7a6042,
        );
      }
      add(
        "leaf",
        b,
        leafH,
        [3.9, 2.8, 3.8],
        [0.12 * k, a, 0.09 * k],
        [0x58764b, 0x708b50, 0x77925a, 0x4e7046][k % 4],
      );
    }
    solids.push([z[0], z[1], 1.55 / M]);
  }
  for (const [k, arr] of shapes) {
    const b =
        k === "leaf"
          ? new T.IcosahedronGeometry(0.5, 1)
          : new T.CylinderGeometry(0.5, 0.5, 1, k === "trunk" ? 6 : 10),
      m = new T.InstancedMesh(
        b,
        new T.MeshLambertMaterial({ flatShading: true }),
        arr.length,
      );
    arr.forEach(([mat, c], i) => {
      m.setMatrixAt(i, mat);
      m.setColorAt(i, c);
    });
    m.userData = { role: "commons-" + k, disposableMaterial: true };
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
    0xdfad46, // warm dry golden leaf
    0xd37a32, // sun-toasted mango/teak amber
    0xc15a2d, // autumn russet terracotta
    0xa4b442, // freshly wind-dropped olive-lime leaf
    0xe4c66d, // pale sunlit straw-gold leaf
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

      // 1. Gentle 2-3 leaf hints right after road splits/forks & sharp turns so the chosen branch is unmistakable.
      for (const fArc of hintArcs) {
        for (const off of [1.0, 2.35, 3.85]) {
          const a0 = fArc + off;
          if (a0 < 2.0 || a0 > total - 0.8) continue;
          if (arcList.every((q) => Math.abs(q.arc - a0) > 0.95)) {
            arcList.push({ arc: a0, forkHint: true });
          }
        }
      }

      // 2. Very sparse single fallen leaves along open stretches (~1 leaf every 6.8 - 8.6 m) so the dirt trail stays clean.
      let cursor = 2.8,
        stepIdx = 0;
      while (cursor < total - 1.0) {
        if (arcList.every((q) => Math.abs(q.arc - cursor) > 2.6)) {
          arcList.push({ arc: cursor, forkHint: false });
          // Occasional natural 2-leaf wind pair (~1 in 4 spots)
          if (hash01(stepIdx * 13.7 + 5.1) > 0.76 && cursor + 0.45 < total - 1.0) {
            arcList.push({ arc: cursor + 0.42, forkHint: false });
          }
        }
        cursor += 6.6 + hash01(stepIdx * 7.3 + 1.9) * 2.2;
        stepIdx++;
      }
      arcList.sort((u, v) => u.arc - v.arc);

      if (arcList.length) {
        const leafGeo = fallenLeafGeometry(),
          leafMat = new T.MeshLambertMaterial({
            vertexColors: true,
            side: T.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
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

        arcList.forEach(({ arc, forkHint }, idxL) => {
          const sp = atArc(arc),
            r1 = hash01(idxL * 19.3 + arc * 0.7),
            r2 = hash01(idxL * 31.7 + 2.3),
            r3 = hash01(idxL * 47.1 + 8.9),
            latM = (r1 - 0.5) * (forkHint ? 0.38 : 0.56),
            lx = sp.x + (sp.nx * latM) / M,
            ly = sp.y + (sp.ny * latM) / M,
            lift = 0.016 + r2 * 0.005;

          p0.set(...s.xyz(lx, ly, s.ground(lx, ly) + lift));
          px.set(...s.xyz(lx + eps, ly, s.ground(lx + eps, ly) + lift)).sub(p0);
          pz.set(...s.xyz(lx, ly - eps, s.ground(lx, ly - eps) + lift)).sub(p0);
          upV.crossVectors(pz, px).normalize();
          if (upV.y < 0) upV.negate();

          // Point leaf generally along the trail breeze with natural organic yaw variation.
          const yawJitter = (r2 - 0.5) * (forkHint ? 0.65 : 1.35),
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

          const sc = (forkHint ? 1.04 : 0.92) * (0.85 + r3 * 0.34);
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
