// Schematic white water on the frozen geography. Never create a waterfall just because a dry hill is steep.
import * as T from "../vendor/three.module.min.js";
import { U, noise } from "./habitats.js";
import { solidFor, hull } from "./contacts.js";
const tau = Math.PI * 2,
  clamp = T.MathUtils.clamp;
const level = (s, x, y) => {
  const p = s.sample(x, y);
  return p.depth > 0.014 ? p.line : p.z;
};
// World-anchored shallow-channel placements (actual rendered rocks with collision, not decorative ripple centres).
export function bedStones(s, x, y) {
  const out = [],
    spacing = 20;
  for (
    let j = Math.floor((y * U) / spacing) - 6;
    j <= Math.floor((y * U) / spacing) + 6;
    j++
  )
    for (
      let i = Math.floor((x * U) / spacing) - 6;
      i <= Math.floor((x * U) / spacing) + 6;
      i++
    ) {
      const a = ((i + 0.12 + 0.72 * noise(i, j, 18)) * spacing) / U,
        b = ((j + 0.12 + 0.72 * noise(i, j, 19)) * spacing) / U,
        p = s.sample(a, b);
      if (
        !p.drawn ||
        p.depth < 0.09 ||
        p.depth > 2.0 ||
        !s.current(a, b, 1)[2] ||
        s.mask(a, b)[1] > 0.05
      )
        continue;
      const z = noise(i, j, 49);
      if (z < 0.42) continue;
      const scale = (p.depth + 0.27 + z * 0.63) / 0.83;
      out.push({
        id: `stream-rock:${i}:${j}`,
        kind: "rock",
        name: "Split boulder",
        x: a,
        y: b,
        scale,
        rotation: noise(j, i, 3) * tau,
        seed: z,
        tint: 0.59,
        hab: "riverbed",
        lith: s.ec.at(a, b).rock,
        lod: 0,
      });
    }
  return out;
}
function mesh(pos, uv, pace, idx, mat, role) {
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setAttribute("pace", new T.Float32BufferAttribute(pace, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new T.Mesh(g, mat);
  m.userData.role = role;
  m.renderOrder = 4;
  return m;
}
const vs = `attribute float pace;varying vec2 v;varying float vel,dist;void main(){v=uv;vel=pace;vec4 p=modelViewMatrix*vec4(position,1.);dist=length(p.xyz);gl_Position=projectionMatrix*p;}`;
const fss = {
  rocks: `float g=sin(v.y*7.-t*vel*5.+1.6*sin(v.x*6.-v.y));float v0=smoothstep(.08,.88,g);float edge=(1.-smoothstep(.43,1.,abs(v.x)));float a=edge*(.26+.62*v0)*min(1.,vel*1.6);vec3 c=mix(vec3(.26,.50,.46),vec3(.89,.95,.88),v0);`,
  fall: `float x=v.x,edge=1.-smoothstep(.74,1.,abs(x));float q=v.y*3.7-t*vel*2.3;float strands=.5+.5*sin(x*26.+2.*sin(x*9.+q*.19)+.9*cos(q*.63+x*6.));float air=.5+.5*cos(x*15.+q+2.1*strands);float a=(.32+.29*strands+.28*air)*edge;vec3 c=mix(vec3(.12,.35,.36),vec3(.81,.94,.92),.23+.33*strands+.34*air);`,
  wash: `float radius=v.y;float w=.5+.5*cos(radius*15.-t*3.7+sin(v.x*19.));float a=(1.-smoothstep(.18,1.,radius))*(.32+.55*w);vec3 c=mix(vec3(.17,.42,.39),vec3(.82,.91,.85),w*.85);`,
};
const material = (u, k) =>
  new T.ShaderMaterial({
    uniforms: u,
    transparent: true,
    forceSinglePass: true,
    depthWrite: false,
    side: T.DoubleSide,
    vertexShader: vs,
    fragmentShader: `uniform float liquidTime,uDay;uniform vec3 uHor;uniform float uFog;varying vec2 v;varying float vel,dist;void main(){float t=liquidTime;${fss[k]}c*=.47+.53*uDay;c=mix(c,uHor,1.-exp(-pow(dist*uFog,2.)));gl_FragColor=vec4(c,a);\n#include <colorspace_fragment>\n}`,
  });
function spray(points, u, role) {
  if (!points.length) return null;
  const g = new T.BufferGeometry(),
    p = [],
    v = [],
    a = [];
  points.forEach(([x, y, z, dx, dy, dz, period, seed]) => {
    p.push(x, y, z);
    v.push(dx, dy, dz);
    a.push(period, seed);
  });
  for (const [n, d, k] of [
    ["position", p, 3],
    ["velocity", v, 3],
    ["cycle", a, 2],
  ])
    g.setAttribute(n, new T.Float32BufferAttribute(d, k));
  const m = new T.Points(
    g,
    new T.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      vertexShader: `uniform float liquidTime;attribute vec3 velocity;attribute vec2 cycle;varying float alpha;void main(){float a=fract(liquidTime/cycle.x+cycle.y),t=a*cycle.x;vec3 p=position+velocity*t;p.y-=4.9*t*t;vec4 eye=modelViewMatrix*vec4(p,1.);alpha=sin(3.1416*a);gl_PointSize=clamp((18.+19.*cycle.y)/max(1.,-eye.z),1.,4.);gl_Position=projectionMatrix*eye;}`,
      fragmentShader: `varying float alpha;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(.81,.92,.9,alpha*(1.-smoothstep(.10,.5,d))*.80);}`,
    }),
  );
  g.computeBoundingSphere();
  g.boundingSphere.radius += 2;
  m.renderOrder = 5;
  m.userData.role = role;
  return m;
}
export function rockWater(s, items, u) {
  const group = new T.Group(),
    p = [],
    uv = [],
    pace = [],
    idx = [],
    points = [],
    contacts = [];
  for (const r of items) {
    if (r.kind !== "rock" || !r.meshShape?.top?.length) continue;
    const hit = s.sample(r.x, r.y);
    if (hit.depth < 0.035) continue;
    const [dx, dz, spd, sea] = s.current(r.x, r.y, 1);
    if (sea || spd < 0.05) continue;
    const sol = solidFor(r, s.ec.presets);
    if (!sol?.top?.length) continue;
    // Intersect triangle edges with the local sloped sheet, in the same pose used to render/stand on this rock.
    const pts = [];
    for (const tri of sol.top) {
      const h = tri.map(
        ([X, Y, Z]) => sol.base + Z - s.waterline(r.x + X / U, r.y + Y / U),
      );
      for (let k = 0; k < 3; k++) {
        let n = (k + 1) % 3;
        if (h[k] > 0 === h[n] > 0) continue;
        const t = h[k] / (h[k] - h[n]);
        pts.push([
          tri[k][0] + (tri[n][0] - tri[k][0]) * t,
          tri[k][1] + (tri[n][1] - tri[k][1]) * t,
        ]);
      }
    }
    if (pts.length < 3) continue;
    const ring = hull(pts),
      dir = [dx, -dz],
      side = [dz, dx];
    if (ring.length < 3) continue;
    const dot = (q, a) => q[0] * a[0] + q[1] * a[1];
    let impact = ring[0];
    for (const q of ring) if (dot(q, dir) < dot(impact, dir)) impact = q;
    const start = ring.indexOf(impact),
      sx = (q) => r.x + q[0] / U,
      sy = (q) => r.y + q[1] / U;
    const wetCorner = [];
    const wetStrip = (id) => {
        if (
          id < baseVertex + 2 ||
          ![id - 2, id - 1, id, id + 1].every((i) => wetCorner[i - baseVertex])
        )
          return;
        idx.push(id - 2, id - 1, id, id, id - 1, id + 1);
      },
      baseVertex = pace.length;
    const write = (q, c, l, bank) => {
      const x = sx(q),
        y = sy(q),
        h = s.sample(x, y);
      // A rock may straddle a bank. Never project permanent whitewater onto the dry half, even after a shower.
      wetCorner.push(h.drawn && h.w > 0 && h.depth > 0.014 && h.sea < 0.07);
      p.push(...s.xyz(x, y, h.line + 0.032 + bank));
      uv.push(c, l);
      pace.push(spd);
    };
    let rad = Math.max(0.18, ...ring.map((v) => Math.abs(dot(v, side)))),
      top = Math.min(0.16, 0.044 + 0.05 * spd),
      baseCount = idx.length;
    for (const sign of [-1, 1]) {
      let last = impact,
        L = 0,
        first = true,
        done = false;
      for (let k = 0; k <= ring.length + 4; k++) {
        let pt = ring[(start + sign * k + ring.length * 3) % ring.length];
        if (!k) pt = impact;
        else if (done) break;
        if (k >= 2 && dot(pt, dir) < dot(last, dir) - 0.01) {
          // leave the lee side in a curved foam trail, not a ring permanently painted around the rock.
          for (let j = 1; j <= 6; j++) {
            const t = j / 6,
              q = [
                last[0] +
                  dir[0] * t * (1.2 + rad) -
                  side[0] * Math.sign(dot(last, side)) * 0.27 * t * t,
                last[1] +
                  dir[1] * t * (1.2 + rad) -
                  side[1] * Math.sign(dot(last, side)) * 0.27 * t * t,
              ];
            let w = 0.22 * (1 - t) + 0.018;
            const id = pace.length;
            for (const h of [-1, 1])
              write(
                [q[0] + side[0] * w * h, q[1] + side[1] * w * h],
                h,
                L + t * (1.2 + rad),
                0,
              );
            wetStrip(id);
          }
          break;
        }
        const size = Math.max(0.05, Math.hypot(...pt)),
          out = [pt[0] / size, pt[1] / size],
          width = 0.14 + Math.min(0.48, spd * 0.27);
        L += Math.hypot(pt[0] - last[0], pt[1] - last[1]);
        const id = pace.length;
        write([pt[0] - 0.04 * out[0], pt[1] - 0.04 * out[1]], -0.46, L, top);
        write([pt[0] + out[0] * width, pt[1] + out[1] * width], 1, L, 0);
        if (!first) wetStrip(id);
        first = false;
        last = pt;
        if (k >= ring.length) done = true;
      }
    }
    if (idx.length === baseCount) continue;
    const impactHit = s.sample(sx(impact), sy(impact));
    const at = s.xyz(
      sx(impact),
      sy(impact),
      s.waterline(sx(impact), sy(impact)) + 0.045,
    );
    for (let j = 0; impactHit.w > 0 && impactHit.depth > 0.018 && j < 11; j++) {
      const z = noise(j, 81, Math.floor(r.x * 9)),
        lat = (z - 0.5) * (1 + spd),
        h = 1.05 + Math.min(1.35, spd) * (0.4 + z);
      points.push([
        ...at,
        dx * (-0.21 + 0.17 * z) + side[0] * lat,
        h,
        dz * (-0.21 + 0.17 * z) - side[1] * lat,
        h / 4.9,
        z,
      ]);
    }
    contacts.push({
      id: r.id,
      at: [sx(impact), sy(impact)],
      speed: spd,
      depth: hit.depth,
      perimeter: ring.length,
      triangles: (idx.length - baseCount) / 3,
    });
  }
  if (idx.length)
    group.add(mesh(p, uv, pace, idx, material(u, "rocks"), "rock-split-flow"));
  const drops = spray(points, u, "rock-impact-spray");
  if (drops) group.add(drops);
  group.userData.contacts = contacts;
  return group;
}
export function findFall(s, f) {
  const X = f.cell[0] + 0.5,
    Y = f.cell[1] + 0.5;
  let best = null;
  for (let j = -2; j <= 2; j++)
    for (let i = -2; i <= 2; i++) {
      const x = X + (i * 6) / U,
        y = Y + (j * 6) / U;
      if (!s.sample(x, y).drawn) continue;
      for (let k = 0; k < 16; k++) {
        const dx = Math.sin((k * tau) / 16),
          dy = Math.cos((k * tau) / 16);
        for (const span of [7, 12, 18]) {
          const a = level(s, x, y),
            b = level(s, x + (span * dx) / U, y + (span * dy) / U),
            dh = a - b,
            score =
              (dh / (2 + span)) * 9 +
              Math.min(8, dh) * 0.27 -
              0.006 * Math.hypot(i * 6, j * 6);
          if (dh > 0.38 && (!best || score > best.score))
            best = {
              x,
              y,
              dx,
              dy,
              span,
              top: a,
              bottom: b,
              drop: dh,
              score,
              name: f.name,
            };
        }
      }
    }
  return best;
}
export function cascade(s, site, u) {
  const { x, y, dx, dy, span, drop } = site,
    scene = new T.Group(),
    width = clamp(0.92 + 0.15 * drop, 1, 3.35),
    p = [],
    uv = [],
    vel = [],
    idx = [],
    pts = [];
  const xy = (d, w) => [x + (dx * d - dy * w) / U, y + (dy * d + dx * w) / U];
  const v0 = level(s, x, y) + 0.15,
    h1 = level(s, ...xy(span, 0)) + 0.055;
  // Upstream apron wets the actual surface. A narrow curtain follows a gravity arc at the lip, meeting the ground again at its foot.
  const speed = clamp(Math.sqrt(2 * 9.81 * drop), 2.5, 15);
  for (let j = 0; j <= 29; j++) {
    const t = (j - 5) / 24;
    let d = t < 0 ? t * 21 : span * t;
    const w = width * (t < 0 ? 0.89 : 0.89 + 0.17 * t);
    for (let i = 0; i <= 8; i++) {
      const side = i / 4 - 1,
        [a, b] = xy(
          d,
          side * w * (1 + 0.036 * Math.sin(d * 0.44)) +
            Math.sin(d * 0.29) * 0.12,
        ),
        soil = level(s, a, b),
        arc = v0 + (h1 - v0) * Math.max(t, 0) ** 2;
      const h =
        t < 0
          ? soil + 0.14
          : Math.max(
              soil + 0.065,
              arc + 0.047 * Math.cos(side * 12 + t * 5) * (1 - t),
            );
      p.push(...s.xyz(a, b, h));
      uv.push(side, d * 0.55);
      vel.push(speed * 0.56);
      const k = vel.length - 1;
      if (i && j) idx.push(k - 10, k - 9, k, k - 10, k, k - 1);
    }
  }
  scene.add(mesh(p, uv, vel, idx, material(u, "fall"), "waterfall-curtain"));
  const wc = [],
    wuv = [],
    ws = [],
    wi = [];
  const [bx, by] = xy(span, 0);
  for (let k = 0; k <= 6; k++)
    for (let j = 0; j <= 36; j++) {
      const r = k / 6,
        a = (tau * j) / 36,
        xx =
          bx +
          (dx * (0.28 + r * Math.cos(a)) * width * 1.55 -
            dy * r * Math.sin(a) * width * 1.36) /
            U,
        yy =
          by +
          (dy * (0.28 + r * Math.cos(a)) * width * 1.55 +
            dx * r * Math.sin(a) * width * 1.36) /
            U;
      wc.push(...s.xyz(xx, yy, level(s, xx, yy) + 0.076));
      wuv.push(a, r);
      ws.push(speed);
      const n = ws.length - 1;
      if (j && k) wi.push(n - 38, n - 37, n, n - 38, n, n - 1);
    }
  scene.add(mesh(wc, wuv, ws, wi, material(u, "wash"), "plunge-foam"));
  for (let j = 0; j < 84; j++) {
    const r = noise(j, 13),
      a = (r - 0.5) * 2,
      c = noise(j, 9),
      [xx, yy] = xy(span + (c - 0.5) * 0.56, a * width * 0.82),
      h = 1.2 + noise(j, 25) * Math.min(2.6, speed * 0.27);
    pts.push([
      ...s.xyz(xx, yy, level(s, xx, yy) + 0.11),
      dx * 0.6 - dy * a * (0.6 + 1.4 * c),
      h,
      -dy * 0.6 - dx * a * (0.6 + 1.4 * c),
      h / 4.9,
      c,
    ]);
  }
  scene.add(spray(pts, u, "plunge-spray"));
  scene.userData.site = site;
  return scene;
}
export function disposeWater(g) {
  if (!g) return;
  g.removeFromParent();
  g.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
}
