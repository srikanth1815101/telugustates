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
function sampleTrail(xy) {
  const clean = [];
  for (const p of xy) {
    if (!clean.length || Math.hypot(p[0] - clean.at(-1)[0], p[1] - clean.at(-1)[1]) * M > 0.05) {
      clean.push(p);
    }
  }
  if (clean.length < 2) return [];
  // Gentle corner fillet so bends read like an organically worn desire trail.
  let cur = clean;
  for (let pass = 0; pass < 2; pass++) {
    if (cur.length < 3) break;
    const next = [cur[0]];
    for (let i = 1; i < cur.length - 1; i++) {
      const a = cur[i - 1],
        b = cur[i],
        c = cur[i + 1],
        da = Math.hypot(b[0] - a[0], b[1] - a[1]) * M,
        dc = Math.hypot(c[0] - b[0], c[1] - b[1]) * M,
        r = Math.min(2.4, da * 0.28, dc * 0.28);
      if (r > 0.35) {
        const ta = r / da,
          tc = r / dc;
        next.push(
          [b[0] + (a[0] - b[0]) * ta, b[1] + (a[1] - b[1]) * ta],
          [b[0] + (c[0] - b[0]) * tc, b[1] + (c[1] - b[1]) * tc],
        );
      } else {
        next.push(b);
      }
    }
    next.push(cur.at(-1));
    cur = next;
  }
  const samples = [];
  let arc = 0;
  for (let i = 0; i < cur.length - 1; i++) {
    const a = cur[i],
      b = cur[i + 1],
      segM = Math.hypot(b[0] - a[0], b[1] - a[1]) * M;
    if (segM < 0.02) continue;
    const steps = Math.max(1, Math.ceil(segM / 0.85));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      samples.push({
        x: a[0] + (b[0] - a[0]) * t,
        y: a[1] + (b[1] - a[1]) * t,
        arc: arc + segM * t,
      });
    }
    arc += segM;
  }
  const last = cur.at(-1);
  samples.push({ x: last[0], y: last[1], arc });
  for (let i = 0; i < samples.length; i++) {
    const p0 = samples[Math.max(0, i - 1)],
      p1 = samples[Math.min(samples.length - 1, i + 1)],
      dx = (p1.x - p0.x) * M,
      dy = (p1.y - p0.y) * M,
      len = Math.hypot(dx, dy) || 1;
    samples[i].nx = -dy / (len * M);
    samples[i].ny = dx / (len * M);
    samples[i].yaw = Math.atan2(dy, dx);
  }
  return samples;
}

const TRAIL_VERT = `
attribute vec2 aTrail;
varying float vSide;
varying float vArc;
varying float vFogD;
void main() {
  vSide = aTrail.x;
  vArc = aTrail.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFogD = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const TRAIL_FRAG = `
uniform float uWalkProgress;
uniform float uTotalArc;
uniform float uDay;
uniform vec3 uHor;
uniform float uFog;
uniform float uTime;
varying float vSide;
varying float vArc;
varying float vFogD;
void main() {
  float ahead = smoothstep(uWalkProgress - 0.2, uWalkProgress + 2.3, vArc);
  float camClear = smoothstep(1.35, 3.0, vFogD);
  float endCap = smoothstep(0.0, 1.05, vArc) * smoothstep(uTotalArc + 0.25, uTotalArc - 0.85, vArc);
  float vis = ahead * camClear * endCap;
  if (vis < 0.005) discard;

  float edgeWob = 0.12 * sin(vArc * 2.15 + 0.65) + 0.07 * cos(vArc * 5.6 - vSide * 2.3);
  float w = abs(vSide) + edgeWob * (0.32 + 0.68 * abs(vSide));
  if (w > 1.0) discard;

  float tread = exp(-pow((abs(vSide) - 0.21) / 0.25, 2.0));
  float grit = 0.5 + 0.5 * sin(vArc * 8.1 + cos(vSide * 8.7) * 1.7) * cos(vArc * 3.6 - vSide * 6.1);
  float earthPatch = 0.5 + 0.5 * sin(vArc * 0.82 + 1.2) * cos(vArc * 2.05 - 0.35);
  float sunlitWave = smoothstep(0.42, 0.98, sin(vArc * 0.68 - uTime * 1.75));

  vec3 vergeHerb = vec3(0.26, 0.33, 0.19);
  vec3 warmEarth = vec3(0.74, 0.66, 0.51);
  vec3 sunLimestone = vec3(0.91, 0.86, 0.72);
  vec3 coreCol = mix(warmEarth, sunLimestone, clamp(0.46 * tread + 0.34 * grit + 0.20 * earthPatch, 0.0, 1.0));
  coreCol += vec3(0.065, 0.055, 0.028) * sunlitWave;

  float coreMask = 1.0 - smoothstep(0.46, 0.80, w);
  float vergeMask = 1.0 - smoothstep(0.60, 1.0, w);
  vec3 col = mix(vergeHerb, coreCol, coreMask);
  col *= mix(0.42, 1.02, clamp(uDay, 0.0, 1.0));

  float fogF = clamp(1.0 - exp(-pow(vFogD * uFog, 2.0)), 0.0, 1.0);
  col = mix(col, uHor, fogF);

  float alpha = (0.50 * coreMask + 0.22 * vergeMask) * vis * (1.0 - 0.45 * fogF);
  gl_FragColor = vec4(col, alpha);
}
`;

// A single owner can be selected. The other fields have no outline. Guided walks render a natural worn earth-and-limestone trail with wayside cairn stones.
export function marks(s, r, kind, route, envUniforms = null) {
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
    const samples = sampleTrail(route.xy);
    if (samples.length > 1) {
      const totalArc = samples.at(-1).arc,
        halfW = 0.55,
        pos = new Float32Array(samples.length * 2 * 3),
        uvAttr = new Float32Array(samples.length * 2 * 2),
        idx = [];
      for (let i = 0; i < samples.length; i++) {
        const sp = samples[i],
          taper =
            0.68 +
            0.32 *
              Math.min(
                1,
                Math.min(sp.arc / 2.2, Math.max(0, totalArc - sp.arc) / 2.2),
              ),
          wM = halfW * taper;
        for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
          const sgn = sideIdx === 0 ? -1 : 1,
            ux = sp.x + sp.nx * wM * sgn,
            uy = sp.y + sp.ny * wM * sgn,
            [wx, wy, wz] = s.xyz(ux, uy, s.ground(ux, uy) + 0.022),
            vi = i * 2 + sideIdx;
          pos[vi * 3] = wx;
          pos[vi * 3 + 1] = wy;
          pos[vi * 3 + 2] = wz;
          uvAttr[vi * 2] = sgn;
          uvAttr[vi * 2 + 1] = sp.arc;
        }
        if (i < samples.length - 1) {
          const b0 = i * 2;
          idx.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2);
        }
      }
      const ribbonGeo = new T.BufferGeometry();
      ribbonGeo.setAttribute("position", new T.BufferAttribute(pos, 3));
      ribbonGeo.setAttribute("aTrail", new T.BufferAttribute(uvAttr, 2));
      ribbonGeo.setIndex(idx);
      const progressUniform = (route.progressUniform ??= { value: 0 }),
        ribbonMat = new T.ShaderMaterial({
          uniforms: {
            uWalkProgress: progressUniform,
            uTotalArc: { value: totalArc },
            uDay: envUniforms?.uDay || { value: 1 },
            uHor: envUniforms?.uHor || { value: new T.Color(0xcbd8db) },
            uFog: envUniforms?.uFog || { value: 0.00055 },
            uTime: envUniforms?.liquidTime || { value: 0 },
          },
          vertexShader: TRAIL_VERT,
          fragmentShader: TRAIL_FRAG,
          transparent: true,
          depthWrite: false,
          side: T.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
        ribbon = new T.Mesh(ribbonGeo, ribbonMat);
      ribbon.renderOrder = 2;
      ribbon.userData = { role: "walking-waymarks", disposableMaterial: true };
      g.add(ribbon);

      // Natural wayside field-stone cairns & verge grass tufts along the trail margin + twin destination stones.
      const placements = [];
      let nextArc = 6.5,
        sideToggle = 1;
      for (let i = 1; i < samples.length - 1; i++) {
        const sp = samples[i];
        if (sp.arc < nextArc || totalArc - sp.arc < 3.5) continue;
        placements.push({ sp, side: sideToggle, goal: false });
        sideToggle = -sideToggle;
        nextArc = sp.arc + 13.5 + ((i * 7) % 5) * 0.9;
      }
      const endSp = samples.at(-1);
      placements.push(
        { sp: endSp, side: -1, goal: true },
        { sp: endSp, side: 1, goal: true },
      );

      if (placements.length) {
        const stoneGeo = new T.IcosahedronGeometry(0.5, 0),
          tuftGeo = new T.ConeGeometry(0.11, 0.26, 4),
          baseMesh = new T.InstancedMesh(
            stoneGeo,
            new T.MeshLambertMaterial({ color: 0x7c7365 }),
            placements.length,
          ),
          capMesh = new T.InstancedMesh(
            stoneGeo,
            new T.MeshLambertMaterial({ color: 0xdad0b8 }),
            placements.length,
          ),
          tuftMesh = new T.InstancedMesh(
            tuftGeo,
            new T.MeshLambertMaterial({ color: 0x58733e }),
            placements.length,
          ),
          dummy = new T.Object3D();
        placements.forEach(({ sp, side, goal }, idxP) => {
          const offsetM = goal ? 0.76 : 0.66,
            cx = sp.x + sp.nx * offsetM * side,
            cy = sp.y + sp.ny * offsetM * side,
            gz = s.ground(cx, cy),
            hScale = goal ? 1.38 : 1.0;
          dummy.position.set(...s.xyz(cx, cy, gz + 0.048 * hScale));
          dummy.rotation.set(0.08 * side, sp.yaw + idxP * 1.1, -0.06 * side);
          dummy.scale.set(0.22 * hScale, 0.12 * hScale, 0.17 * hScale);
          dummy.updateMatrix();
          baseMesh.setMatrixAt(idxP, dummy.matrix);

          dummy.position.set(...s.xyz(cx, cy, gz + 0.128 * hScale));
          dummy.rotation.set(-0.07 * side, sp.yaw + idxP * 2.3 + 0.5, 0.09 * side);
          dummy.scale.set(0.13 * hScale, 0.085 * hScale, 0.11 * hScale);
          dummy.updateMatrix();
          capMesh.setMatrixAt(idxP, dummy.matrix);

          const tx = cx - sp.nx * 0.08 * side,
            ty = cy - sp.ny * 0.08 * side;
          dummy.position.set(...s.xyz(tx, ty, s.ground(tx, ty) + 0.11));
          dummy.rotation.set(0.12 * side, idxP * 1.7, 0.1 * side);
          dummy.scale.set(1, goal ? 1.15 : 0.9, 0.7);
          dummy.updateMatrix();
          tuftMesh.setMatrixAt(idxP, dummy.matrix);
        });
        for (const im of [baseMesh, capMesh, tuftMesh]) {
          im.userData = { role: "wayside-cairns", disposableMaterial: true };
          g.add(im);
        }
      }
    }
  }
  return g;
}
