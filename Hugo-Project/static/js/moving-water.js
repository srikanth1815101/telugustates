// Physically grounded whitewater, valley-thalweg cascades, upstream feeder channels and hydraulic stage spillways.
import * as T from "../vendor/three.module.min.js";
import { U, noise } from "./habitats.js";
import { solidFor, hull } from "./contacts.js";
import { isStageStep, stageBreak } from "./hydraulic-stage.js";
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
const vs = `attribute float pace;varying vec2 v;varying float vel,dist;varying vec3 vPos;void main(){v=uv;vel=pace;vPos=position;vec4 p=modelViewMatrix*vec4(position,1.);dist=length(p.xyz);gl_Position=projectionMatrix*p;}`;
const hashGLSL = `
float mwHash(vec2 p){p=fract(p*vec2(127.1,311.7));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float mwNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mwHash(i),mwHash(i+vec2(1.,0.)),f.x),mix(mwHash(i+vec2(0.,1.)),mwHash(i+vec2(1.,1.)),f.x),f.y);}
`;
const fss = {
  rocks: `float g=sin(v.y*7.-t*vel*5.+1.6*sin(v.x*6.-v.y));float v0=smoothstep(.08,.88,g);float edge=(1.-smoothstep(.43,1.,abs(v.x)));float a=edge*(.26+.62*v0)*min(1.,vel*1.6);vec3 c=mix(vec3(.26,.50,.46),vec3(.89,.95,.88),v0);`,
  fall: `
  float veil=step(vel,0.),spd=abs(vel),x=v.x,ax=abs(x);
  if(v.y<0.){
    // Upstream mountain feeder channel gliding toward the waterfall crest, accelerating at the lip.
    float lip=smoothstep(-3.2,0.,v.y),fadeIn=smoothstep(-26.,-17.,v.y);
    float edge=1.-smoothstep(.64,.99,ax+.06*sin(v.y*1.7-t*2.4));
    float adv=v.y*1.45-t*(1.4+1.9*lip);
    float rip=mwNoise(vec2(x*5.2,adv*1.35))*.62+mwNoise(vec2(x*11.5-.7,adv*2.7+3.1))*.38;
    float crestFoam=lip*smoothstep(.36,.82,rip+.32*lip)+smoothstep(.58,.92,ax)*(.18+.24*lip)*rip;
    vec3 deepCol=mix(vec3(.07,.25,.26),vec3(.14,.39,.38),rip);
    c=mix(deepCol,vec3(.88,.95,.93),clamp(crestFoam,0.,.92));
    c+=vec3(.12,.15,.14)*smoothstep(.68,.93,rip)*(1.-.5*lip);
    a=edge*fadeIn*(.58+.30*lip+.18*crestFoam);
  } else {
    // Gravity-accelerating waterfall curtain + outer aerated spray veil.
    float fallProg=clamp(v.y*.11,0.,1.),crest=1.-smoothstep(0.,.22,fallProg);
    float gWarp=v.y*(.82+.32*fallProg);
    float qFast=gWarp*1.05-t*spd*.62,qMid=gWarp*.58-t*spd*.41;
    float n1=mwNoise(vec2(x*9.5,qMid)),n2=mwNoise(vec2(x*21.+1.7*(n1-.5),qFast*1.35));
    float chutes=.5+.5*sin(x*19.+2.4*(n1-.5)+.55*sin(qMid*.7));
    float streaks=mwNoise(vec2(x*32.-.9*(n1-.5),qFast*1.95+4.2));
    float lace=smoothstep(.24,.82,.44*chutes+.34*n2+.22*streaks);
    float feather=mwNoise(vec2(x*7.5,qMid*.85+9.1));
    float edge=1.-smoothstep(.62-.12*veil,.99,ax+.14*(feather-.5)*(0.35+0.65*fallProg));
    if(veil>.5){
      float wisps=smoothstep(.34,.88,.52*n2+.48*streaks)*(1.-.28*fallProg);
      c=mix(vec3(.58,.79,.80),vec3(.94,.98,.97),.45+.55*wisps);
      a=edge*wisps*.54*smoothstep(.02,.18,fallProg)*(1.-.18*smoothstep(.82,1.,fallProg));
    } else {
      float aerated=clamp(.24+.52*lace+.34*fallProg+.28*crest*(1.-ax*.4),0.,1.);
      vec3 coreWater=mix(vec3(.09,.31,.33),vec3(.22,.52,.51),n1);
      vec3 whiteWater=mix(vec3(.78,.91,.90),vec3(.96,.99,.98),smoothstep(.45,.92,lace+.25*streaks));
      c=mix(coreWater,whiteWater,aerated);
      // Glossy sunlit specular highlight rolling over the rounded crest lip.
      c+=vec3(.16,.18,.17)*crest*smoothstep(.35,.85,1.-ax);
      a=edge*clamp(.68+.28*aerated,0.,.97);
    }
  }`,
  wash: `
  if(v.y<=1.02){
    // Turbulent boiling plunge pool with outward-propagating concentric shock ripples & lacy foam.
    float radius=clamp(v.y,0.,1.),ang=v.x;
    vec2 dir=vec2(cos(ang),sin(ang));
    float boil=mwNoise(dir*(2.8+4.2*radius)-vec2(0.,t*1.65))*.6+mwNoise(dir*8.4+vec2(t*.9,-t*2.3))*.4;
    float wave1=.5+.5*cos(radius*18.-t*4.3+1.8*(boil-.5));
    float wave2=.5+.5*cos(radius*9.5-t*2.4+sin(ang*7.+boil*2.));
    float core=1.-smoothstep(.04,.42,radius);
    float rings=(1.-smoothstep(.22,.96,radius))*smoothstep(.36,.88,.62*wave1+.38*wave2);
    float foam=clamp(core*(.68+.32*boil)+rings*(.52+.38*boil),0.,1.);
    float rim=1.-smoothstep(.68,1.,radius+.08*(boil-.5));
    c=mix(vec3(.10,.33,.33),vec3(.91,.97,.95),foam*.92);
    a=rim*clamp(.42+.52*foam,0.,.95);
  } else {
    // Downstream foam-laced mountain runout stream carrying aerated trails away from the plunge pool.
    float prog=clamp(v.y-1.05,0.,1.),ax=abs(v.x);
    float edge=1.-smoothstep(.60,.98,ax+.08*sin(prog*9.-t*2.8));
    float adv=prog*9.5-t*2.6;
    float trail=mwNoise(vec2(v.x*4.8,adv))*.62+mwNoise(vec2(v.x*11.,adv*1.9+2.3))*.38;
    float foam=(1.-.78*prog)*smoothstep(.38,.82,trail)*(1.-.45*ax);
    c=mix(vec3(.09,.29,.30),vec3(.88,.95,.93),clamp(foam*1.1,0.,.9));
    a=edge*(1.-smoothstep(.68,1.,prog))*(.54+.36*foam);
  }`,
};
const material = (u, k) =>
  new T.ShaderMaterial({
    uniforms: u,
    transparent: true,
    forceSinglePass: true,
    depthWrite: false,
    side: T.DoubleSide,
    vertexShader: vs,
    fragmentShader: `uniform float liquidTime,uDay;uniform vec3 uHor;uniform float uFog;varying vec2 v;varying float vel,dist;varying vec3 vPos;${hashGLSL}void main(){vec3 c=vec3(0.);float a=0.,t=liquidTime;${fss[k]}c*=.47+.53*uDay;c=mix(c,uHor,1.-exp(-pow(dist*uFog,2.)));gl_FragColor=vec4(c,a);\n#include <colorspace_fragment>\n}`,
  });
function spray(points, u, role) {
  if (!points.length) return null;
  const g = new T.BufferGeometry(),
    p = [],
    v = [],
    a = [];
  points.forEach(([x, y, z, dx, dy, dz, period, seed, scale = 1]) => {
    p.push(x, y, z);
    v.push(dx, dy, dz);
    a.push(period, seed, scale);
  });
  for (const [n, d, k] of [
    ["position", p, 3],
    ["velocity", v, 3],
    ["cycle", a, 3],
  ])
    g.setAttribute(n, new T.Float32BufferAttribute(d, k));
  const m = new T.Points(
    g,
    new T.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      vertexShader: `uniform float liquidTime;attribute vec3 velocity;attribute vec3 cycle;varying float alpha,mist;void main(){float ph=fract(liquidTime/cycle.x+cycle.y),t=ph*cycle.x;mist=step(3.,cycle.z);vec3 p=position+velocity*t;if(mist>.5){p.x+=sin(liquidTime*.9+cycle.y*6.283)*.42;p.z+=cos(liquidTime*.8+cycle.y*6.283)*.42;}else{p.y-=4.9*t*t;}vec4 eye=modelViewMatrix*vec4(p,1.);alpha=sin(3.14159*ph);float sz=mist>.5?(85.+55.*cycle.y)*cycle.z*.12:(22.+24.*cycle.y)*cycle.z;gl_PointSize=clamp(sz/max(1.2,-eye.z),mist>.5?6.:1.4,mist>.5?42.:6.5);gl_Position=projectionMatrix*eye;}`,
      fragmentShader: `uniform float uDay,uFog;uniform vec3 uHor;varying float alpha,mist;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;float soft=mist>.5?pow(max(0.,1.-d*2.),2.1)*.19:(1.-smoothstep(.12,.5,d))*.76;vec3 c=vec3(.86,.95,.94)*(.48+.52*uDay);gl_FragColor=vec4(c,alpha*soft);\n#include <colorspace_fragment>\n}`,
    }),
  );
  g.computeBoundingSphere();
  g.boundingSphere.radius += 6;
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
        1,
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
// Trace the real DEM valley thalweg upstream from the waterfall crest so water visibly flows from a logical higher catchment or wet pool.
function traceThalweg(s, x0, y0, dirX, dirY, steps, stepM, uphill) {
  const pts = [[x0, y0]];
  let cx = x0,
    cy = y0,
    ang = Math.atan2(dirX, dirY),
    prevH = level(s, cx, cy);
  for (let st = 1; st <= steps; st++) {
    let bestAng = ang,
      bestScore = -Infinity,
      bx = cx,
      by = cy,
      bh = prevH;
    for (const da of [-0.46, -0.23, 0, 0.23, 0.46]) {
      const a = ang + da,
        ux = Math.sin(a),
        uy = Math.cos(a),
        nx = cx + (ux * stepM) / U,
        ny = cy + (uy * stepM) / U;
      if (!s.traversable(nx, ny)) continue;
      const h = level(s, nx, ny),
        left = level(s, nx - (7 * uy) / U, ny + (7 * ux) / U),
        right = level(s, nx + (7 * uy) / U, ny - (7 * ux) / U),
        concavity = 0.5 * (left + right) - h,
        wet = s.wet(nx, ny);
      let sc;
      if (uphill) {
        // Follow the lowest concave ravine floor while climbing gently into the upstream catchment (never plunging down the back of a ridge).
        const climb = h - prevH;
        if (climb < -0.55) continue;
        sc =
          concavity * 1.6 +
          wet * 3.5 -
          Math.max(0, climb - 1.8) * 0.9 +
          Math.min(1.2, Math.max(0, climb)) * 0.45 -
          Math.abs(da) * 0.55;
      } else {
        // Downstream runout follows the steepest-descent concave channel.
        const drop = prevH - h;
        sc = drop * 1.4 + concavity * 1.2 + wet * 3.0 - Math.abs(da) * 0.5;
      }
      if (sc > bestScore) {
        bestScore = sc;
        bestAng = a;
        bx = nx;
        by = ny;
        bh = h;
      }
    }
    if (bestScore === -Infinity) break;
    cx = bx;
    cy = by;
    ang = bestAng;
    prevH = bh;
    pts.push([cx, cy]);
    const sp = s.sample(cx, cy);
    if (st >= 2 && sp.w > 0.05 && sp.depth > 0.08) break;
  }
  return pts;
}
function enrichSite(s, best) {
  if (!best) return null;
  const { x, y, dx, dy, span } = best,
    bx = x + (span * dx) / U,
    by = y + (span * dy) / U;
  best.wetFlow =
    s.wet(x - (4 * dx) / U, y - (4 * dy) / U) > 0.22 ||
    s.wet(bx, by) > 0.22 ||
    s.wet(x + ((span + 7) * dx) / U, y + ((span + 7) * dy) / U) > 0.22;
  best.feeder = traceThalweg(s, x, y, -dx, -dy, 8, 3.5, true);
  const footSample = s.sample(bx, by);
  best.openFoot = footSample.w > 0.06 && footSample.depth > 0.14;
  best.runout = best.openFoot
    ? [[bx, by]]
    : traceThalweg(s, bx, by, dx, dy, 7, 3.6, false);
  return best;
}
export function findFall(s, f) {
  const X = f.cell[0] + 0.5,
    Y = f.cell[1] + 0.5;
  let best = null;
  const candidates = [];
  for (let j = -3; j <= 3; j++)
    for (let i = -3; i <= 3; i++) candidates.push([i * 6, j * 6]);
  for (let j = -5; j <= 5; j++)
    for (let i = -5; i <= 5; i++) {
      if (Math.abs(i) <= 1 && Math.abs(j) <= 1) continue;
      candidates.push([i * 14, j * 14]);
    }
  for (const [oxM, oyM] of candidates) {
    const x = X + oxM / U,
      y = Y + oyM / U;
    if (!s.traversable(x, y)) continue;
    const a = level(s, x, y),
      wetCrest = s.wet(x, y);
    for (let k = 0; k < 16; k++) {
      const dx = Math.sin((k * tau) / 16),
        dy = Math.cos((k * tau) / 16);
      const upH = level(s, x - (9 * dx) / U, y - (9 * dy) / U);
      if (upH < a - 0.65) continue;
      const leftH = level(s, x - (11 * dy) / U, y + (11 * dx) / U),
        rightH = level(s, x + (11 * dy) / U, y - (11 * dx) / U),
        concavity = 0.5 * (leftH + rightH) - a,
        wetUp = s.wet(x - (6 * dx) / U, y - (6 * dy) / U);
      for (const span of [7, 12, 18, 26]) {
        const bx = x + (span * dx) / U,
          by = y + (span * dy) / U;
        if (!s.traversable(bx, by)) continue;
        const b = level(s, bx, by),
          dh = a - b;
        if (dh <= 0.42) continue;
        const wetFoot = Math.max(
            s.wet(bx, by),
            s.wet(x + ((span + 7) * dx) / U, y + ((span + 7) * dy) / U),
          ),
          hydroBonus =
            (wetFoot > 0.2 ? 2.4 : 0) +
            (wetUp > 0.16 || wetCrest > 0.16 ? 1.8 : 0),
          valleyBonus = clamp(concavity, -1.8, 3.2) * 0.65,
          distM = Math.hypot(oxM, oyM),
          score =
            (dh / (2.5 + span)) * 9 +
            Math.min(18, dh) * 0.28 +
            hydroBonus +
            valleyBonus -
            0.011 * distM;
        if (!best || score > best.score)
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
  return enrichSite(s, best);
}
// Detect real hydraulic stage cliffs (e.g. upper reservoir/impoundment spilling into a lower gorge) and place spillway cascades at the lowest DEM notch.
export function findStageFalls(s, cx, cy, existing = []) {
  const candidates = [],
    ix0 = Math.floor(cx),
    iy0 = Math.floor(cy);
  for (let j = iy0 - 8; j <= iy0 + 8; j++)
    for (let i = ix0 - 8; i <= ix0 + 8; i++) {
      if ((i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2 > 72) continue;
      const n0 = s.node(i, j);
      if (!n0.head) continue;
      for (const [di, dj] of [
        [1, 0],
        [0, 1],
      ]) {
        const n1 = s.node(i + di, j + dj);
        if (!n1.head || !isStageStep(n0.head, n1.head)) continue;
        const z0 = (n0.head & 32767) / 16 - 64,
          z1 = (n1.head & 32767) / 16 - 64,
          drop = Math.abs(z0 - z1);
        if (drop < 2.8) continue;
        const hiFirst = z0 > z1,
          mx = i + 0.5 + di * 0.5,
          my = j + 0.5 + dj * 0.5,
          demZ = s.baseZ(i + (hiFirst ? 0 : di), j + (hiFirst ? 0 : dj));
        candidates.push({
          mx,
          my,
          dx: hiFirst ? di : -di,
          dy: hiFirst ? dj : -dj,
          drop,
          demZ,
        });
      }
    }
  if (!candidates.length) return [];
  // Prefer natural low DEM notches with significant hydraulic drop, well spaced so a dam/rim gets clean spillways without draw-call spam.
  candidates.sort((a, b) => a.demZ - b.demZ || b.drop - a.drop);
  const out = [];
  for (const c of candidates) {
    if (out.length >= 2) break;
    if (
      existing.some((e) => Math.hypot(e.x - c.mx, e.y - c.my) * U < 110) ||
      out.some((e) => Math.hypot(e.x - c.mx, e.y - c.my) * U < 145)
    )
      continue;
    // Refine exact crest lip & gradient direction across the warped stageBreak sill.
    const sb0 = stageBreak(s, c.mx, c.my);
    if (!sb0) continue;
    const eps = 0.08,
      gx =
        (stageBreak(s, c.mx - eps, c.my)?.phi ?? sb0.phi) -
        (stageBreak(s, c.mx + eps, c.my)?.phi ?? sb0.phi),
      gy =
        (stageBreak(s, c.mx, c.my - eps)?.phi ?? sb0.phi) -
        (stageBreak(s, c.mx, c.my + eps)?.phi ?? sb0.phi),
      gLen = Math.hypot(gx, gy),
      dx = gLen > 1e-4 ? gx / gLen : c.dx,
      dy = gLen > 1e-4 ? gy / gLen : c.dy;
    // Step slightly onto the upper rim (phi ~ +0.16) as the spillway lip, and land in the lower pool (span ~ 22 m).
    let lipX = c.mx - dx * 0.14,
      lipY = c.my - dy * 0.14;
    for (let m = -8; m <= 4; m += 2) {
      const tx = c.mx + (dx * m) / U,
        ty = c.my + (dy * m) / U,
        sb = stageBreak(s, tx, ty);
      if (sb && sb.phi > 0.12 && sb.phi < 0.28) {
        lipX = tx;
        lipY = ty;
        break;
      }
    }
    const span = clamp(16 + c.drop * 0.22, 18, 30),
      bx = lipX + (dx * span) / U,
      by = lipY + (dy * span) / U,
      top = level(s, lipX - (6 * dx) / U, lipY - (6 * dy) / U),
      bottom = level(s, bx, by),
      dh = top - bottom;
    if (dh < 2.2) continue;
    out.push(
      enrichSite(s, {
        x: lipX,
        y: lipY,
        dx,
        dy,
        span,
        top,
        bottom,
        drop: dh,
        score: dh,
        name: "Spillway cascade",
        stageSpill: true,
      }),
    );
  }
  return out;
}
function samplePath(pts, frac) {
  if (!pts || pts.length < 2) return null;
  const f = clamp(frac, 0, 1) * (pts.length - 1),
    i = Math.min(pts.length - 2, Math.floor(f)),
    u = f - i,
    ax = pts[i][0],
    ay = pts[i][1],
    bx = pts[i + 1][0],
    by = pts[i + 1][1],
    tx = bx - ax,
    ty = by - ay,
    L = Math.hypot(tx, ty) || 1;
  return [ax + tx * u, ay + ty * u, tx / L, ty / L];
}
export function cascade(s, site, u) {
  const { x, y, dx, dy, span, drop } = site,
    scene = new T.Group(),
    wetScale = site.wetFlow || site.stageSpill ? 1.32 : 1,
    width = clamp((1.35 + 0.18 * Math.min(34, drop)) * wetScale, 1.55, 6.4),
    p = [],
    uv = [],
    vel = [],
    idx = [],
    pts = [];
  const xy = (d, w) => [x + (dx * d - dy * w) / U, y + (dy * d + dx * w) / U];
  const feeder =
      site.feeder?.length >= 2
        ? site.feeder
        : [
            xy(0, 0),
            xy(-12, 0),
            xy(-26, 0),
          ],
    feederLen = Math.max(
      12,
      (feeder.length - 1) *
        Math.hypot(
          (feeder[1][0] - feeder[0][0]) * U,
          (feeder[1][1] - feeder[0][1]) * U,
        ),
    );
  const v0 = Math.max(
      level(s, x, y),
      level(s, x - (4 * dx) / U, y - (4 * dy) / U) - 0.12,
    ) + 0.16,
    h1 = level(s, ...xy(span, 0)) + 0.06;
  const speed = clamp(Math.sqrt(2 * 9.81 * drop), 3.0, 16.5),
    cols = 12,
    upRows = 12,
    fallRows = 28,
    totalRows = upRows + fallRows;
  // 1a. Continuous upstream valley feeder stream + glossy crest rollover + dense ballistic inner curtain.
  for (let j = 0; j <= totalRows; j++) {
    const isUp = j < upRows;
    let cx, cy, tx, ty, dUv, wRow, h;
    if (isUp) {
      const fUp = 1 - j / upRows,
        sp = samplePath(feeder, fUp);
      cx = sp[0];
      cy = sp[1];
      // feeder goes upstream, so downstream tangent is (-sp[2], -sp[3])
      tx = -sp[2];
      ty = -sp[3];
      dUv = -fUp * Math.min(28, feederLen);
      // Slight vena-contracta narrowing right as stream accelerates toward the lip.
      wRow = width * (0.82 + 0.24 * fUp) * (1 - 0.18 * fUp * fUp);
    } else {
      const t = (j - upRows) / fallRows;
      dUv = span * t + drop * 0.42 * t;
      const dHoriz = span * (0.14 * t + 0.86 * Math.pow(t, 0.86));
      [cx, cy] = xy(dHoriz, Math.sin(t * 4.2) * 0.09 * width);
      tx = dx;
      ty = dy;
      wRow = width * (0.84 + 0.34 * Math.pow(t, 0.85));
    }
    for (let i = 0; i <= cols; i++) {
      const side = (i / cols) * 2 - 1,
        meander = isUp ? 0 : 0.045 * Math.sin(dUv * 0.45 + side * 2.1),
        lat = side * wRow * (1 + meander),
        a = cx + (-ty * lat) / U,
        b = cy + (tx * lat) / U,
        soil = level(s, a, b);
      if (isUp) {
        const bankTaper = 1 - 0.35 * side * side,
          lipLift = j >= upRows - 2 ? 0.05 * (1 - (upRows - j) * 0.5) : 0;
        h = soil + 0.09 * bankTaper + lipLift;
        if (j === upRows - 1) h = Math.max(h, v0 - 0.04);
      } else {
        const t = (j - upRows) / fallRows,
          // Parabolic free-fall arc with convex forward bow in the central chute.
          bow = (1 - side * side * 0.65) * Math.sin(Math.PI * t) * Math.min(0.45, 0.06 * drop),
          arc = v0 + (h1 - v0) * Math.pow(t, 1.72) + bow,
          ledgeBounce =
            soil + 0.14 > arc
              ? 0.12 * Math.sin(side * 9 + t * 14) * (1 - t)
              : 0;
        h = Math.max(
          soil + 0.075,
          arc + ledgeBounce + 0.045 * Math.cos(side * 10 + t * 6) * (1 - t),
        );
      }
      p.push(...s.xyz(a, b, h));
      uv.push(side, dUv);
      vel.push(
        isUp
          ? speed * (0.28 + 0.32 * (j / upRows))
          : speed * (0.48 + 0.52 * Math.sqrt((j - upRows) / fallRows)),
      );
      const k = vel.length - 1;
      if (i && j)
        idx.push(
          k - (cols + 2),
          k - (cols + 1),
          k,
          k - (cols + 2),
          k,
          k - 1,
        );
    }
  }
  // 1b. Volumetric outer aerated whitewater veil (negative `pace` signals veil layer to shader; still 1 single draw call!).
  const vCols = 8,
    vRows = 20,
    veilBase = vel.length;
  for (let j = 0; j <= vRows; j++) {
    const t = j / vRows,
      tFall = 0.04 + 0.96 * t,
      dHoriz =
        span * (0.16 * tFall + 0.84 * Math.pow(tFall, 0.84)) +
        Math.sin(Math.PI * t) * clamp(0.28 + 0.035 * drop, 0.28, 0.95),
      wVeil = width * (0.94 + 0.46 * t);
    for (let i = 0; i <= vCols; i++) {
      const side = (i / vCols) * 2 - 1,
        [a, b] = xy(dHoriz, side * wVeil),
        soil = level(s, a, b),
        arc =
          v0 +
          0.08 +
          (h1 - v0) * Math.pow(tFall, 1.66) +
          (1 - side * side * 0.7) * Math.sin(Math.PI * t) * clamp(0.22 + 0.04 * drop, 0.22, 0.72),
        h = Math.max(soil + 0.11, arc);
      p.push(...s.xyz(a, b, h));
      uv.push(side, (span + drop * 0.42) * tFall);
      vel.push(-speed * (0.58 + 0.55 * Math.sqrt(tFall)));
      const k = vel.length - 1;
      if (i && j && k >= veilBase + vCols + 2)
        idx.push(
          k - (vCols + 2),
          k - (vCols + 1),
          k,
          k - (vCols + 2),
          k,
          k - 1,
        );
    }
  }
  scene.add(mesh(p, uv, vel, idx, material(u, "fall"), "waterfall-curtain"));

  // 2. Boiling plunge pool + concentric shock ripples + downstream foam-laced runout channel (`"plunge-foam"`).
  const wc = [],
    wuv = [],
    ws = [],
    wi = [],
    [bx, by] = xy(span, 0),
    poolRx = width * 1.72 + clamp(drop * 0.09, 0.45, 2.4),
    poolRy = width * 1.56 + clamp(drop * 0.08, 0.4, 2.1),
    rings = 7,
    segs = 36;
  for (let k = 0; k <= rings; k++)
    for (let j = 0; j <= segs; j++) {
      const r = k / rings,
        a = (tau * j) / segs,
        xx =
          bx +
          (dx * (0.24 + r * Math.cos(a)) * poolRx -
            dy * r * Math.sin(a) * poolRy) /
            U,
        yy =
          by +
          (dy * (0.24 + r * Math.cos(a)) * poolRx +
            dx * r * Math.sin(a) * poolRy) /
            U,
        boilLift = 0.11 * Math.max(0, 1 - r * 2.4);
      wc.push(...s.xyz(xx, yy, level(s, xx, yy) + 0.075 + boilLift));
      wuv.push(a, r);
      ws.push(speed);
      const n = ws.length - 1;
      if (j && k)
        wi.push(n - (segs + 2), n - (segs + 1), n, n - (segs + 2), n, n - 1);
    }
  const runout = site.runout;
  if (runout && runout.length >= 2) {
    const rCols = 6,
      rRows = 12,
      runBase = ws.length;
    for (let j = 0; j <= rRows; j++) {
      const f = j / rRows,
        sp = samplePath(runout, f),
        wOut = width * (1.05 - 0.32 * f);
      for (let i = 0; i <= rCols; i++) {
        const side = (i / rCols) * 2 - 1,
          rx = sp[0] + (-sp[3] * side * wOut) / U,
          ry = sp[1] + (sp[2] * side * wOut) / U;
        wc.push(...s.xyz(rx, ry, level(s, rx, ry) + 0.068));
        wuv.push(side, 1.05 + f * 0.95);
        ws.push(speed * 0.55);
        const n = ws.length - 1;
        if (i && j && n >= runBase + rCols + 2)
          wi.push(
            n - (rCols + 2),
            n - (rCols + 1),
            n,
            n - (rCols + 2),
            n,
            n - 1,
          );
      }
    }
  }
  scene.add(mesh(wc, wuv, ws, wi, material(u, "wash"), "plunge-foam"));

  // 3. Ballistic splash droplets + billowing sunlit mist clouds (`"plunge-spray"`).
  for (let j = 0; j < 92; j++) {
    const r = noise(j, 13),
      a = (r - 0.5) * 2,
      c = noise(j, 9),
      atCrest = j < 18,
      dSpot = atCrest ? 0.6 + c * 1.8 : span + (c - 0.45) * 1.15,
      [xx, yy] = xy(dSpot, a * width * (atCrest ? 0.72 : 0.95)),
      baseH = atCrest
        ? v0 - 0.15
        : level(s, xx, yy) + 0.14,
      h = (atCrest ? 0.7 : 1.35) + noise(j, 25) * Math.min(3.4, speed * 0.3);
    pts.push([
      ...s.xyz(xx, yy, baseH),
      dx * (0.75 + 0.65 * c) - dy * a * (0.65 + 1.5 * c),
      h,
      -dy * (0.75 + 0.65 * c) - dx * a * (0.65 + 1.5 * c),
      Math.max(0.32, h / 4.9),
      c,
      1.4 + 0.8 * noise(j, 41),
    ]);
  }
  for (let j = 0; j < 44; j++) {
    const r = noise(j, 61),
      a = (r - 0.5) * 2,
      c = noise(j, 73),
      midCliff = j < 12 && drop > 5,
      dSpot = midCliff ? span * (0.45 + 0.35 * c) : span + (c - 0.35) * 2.2,
      [xx, yy] = xy(dSpot, a * width * 1.18),
      baseZ = midCliff
        ? v0 + (h1 - v0) * 0.65 + 0.35
        : level(s, xx, yy) + 0.28,
      riseSpd = 0.55 + 0.85 * noise(j, 89) + Math.min(1.1, drop * 0.04),
      life = 2.2 + 1.8 * c;
    pts.push([
      ...s.xyz(xx, yy, baseZ),
      dx * (0.28 + 0.35 * c) - dy * a * 0.45,
      riseSpd,
      -dy * (0.28 + 0.35 * c) - dx * a * 0.45,
      life,
      r,
      6.5 + 4.5 * noise(j, 97),
    ]);
  }
  scene.add(spray(pts, u, "plunge-spray"));
  scene.userData.site = site;
  return scene;
}
// Sculpted wet dark Deccan basalt/granite gorge boulders framing the waterfall crest lip and plunge basin.
export function fallRocks(s, site, u) {
  const { x, y, dx, dy, span, drop } = site,
    wetScale = site.wetFlow || site.stageSpill ? 1.32 : 1,
    width = clamp((1.35 + 0.18 * Math.min(34, drop)) * wetScale, 1.55, 6.4),
    xy = (d, w) => [x + (dx * d - dy * w) / U, y + (dy * d + dx * w) / U],
    pos = [],
    nrm = [],
    col = [],
    idx = [];
  const addBoulder = (gx, gy, rx, ry, rz, yaw, seed) => {
    const base = pos.length / 3,
      z0 = level(s, gx, gy) - rz * 0.32,
      [cx, cy, cz] = s.xyz(gx, gy, z0),
      ca = Math.cos(yaw),
      sa = Math.sin(yaw),
      rings = 5,
      segs = 8;
    for (let r = 0; r <= rings; r++) {
      const v = r / rings,
        phi = v * Math.PI * 0.88,
        sp = Math.sin(phi),
        cp = Math.cos(phi);
      for (let k = 0; k <= segs; k++) {
        const th = (k / segs) * tau,
          ct = Math.cos(th),
          st = Math.sin(th),
          crag =
            0.84 +
            0.24 * noise(k + Math.floor(seed * 31), r + Math.floor(seed * 17), 7),
          lx = sp * ct * rx * crag,
          ly = (cp * 0.5 + 0.5) * rz * (0.92 + 0.14 * Math.cos(th * 2 + seed * 5)),
          lz = sp * st * ry * crag,
          wx = cx + lx * ca - lz * sa,
          wy = cy + ly,
          wz = cz + lx * sa + lz * ca,
          nx = sp * ct,
          ny = Math.max(0.15, cp),
          nz = sp * st,
          nL = Math.hypot(nx, ny, nz) || 1;
        pos.push(wx, wy, wz);
        nrm.push((nx * ca - nz * sa) / nL, ny / nL, (nx * sa + nz * ca) / nL);
        const moss = Math.max(0, cp) * (0.28 + 0.35 * noise(k, r, Math.floor(seed * 53))),
          shade = 0.72 + 0.28 * noise(r, k, Math.floor(seed * 23));
        col.push(
          (0.14 + 0.05 * moss) * shade,
          (0.15 + 0.13 * moss) * shade,
          (0.15 + 0.04 * moss) * shade,
        );
        const cur = pos.length / 3 - 1;
        if (r && k)
          idx.push(
            cur - (segs + 2),
            cur - (segs + 1),
            cur,
            cur - (segs + 2),
            cur,
            cur - 1,
          );
      }
      if (r === 0) continue;
    }
    void base;
  };
  // Flanking crest boulders forming a natural rocky notch at the waterfall lip.
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const sd = noise(Math.floor(x * 7) + k, Math.floor(y * 7) + (side > 0 ? 9 : 3), 11),
        dOff = -1.6 + k * 1.45 + (sd - 0.5) * 0.8,
        wOff = side * (width * 0.92 + 0.55 + k * 0.42 * (0.6 + sd)),
        [bx, by] = xy(dOff, wOff),
        rScale = 0.75 + 0.75 * sd + Math.min(0.8, drop * 0.03);
      addBoulder(bx, by, rScale * 1.25, rScale * 0.95, rScale * 0.92, sd * tau, sd);
    }
  }
  // Plunge-rim wet mossy boulders cradling the pool.
  const rimCount = 5;
  for (let k = 0; k < rimCount; k++) {
    const sd = noise(k + 19, Math.floor(x * 5), Math.floor(y * 5)),
      ang = -1.25 + (k / (rimCount - 1)) * 2.5,
      rad = width * 1.65 + 0.8 + sd * 0.9,
      [bx, by] = xy(span + Math.cos(ang) * rad * 0.85, Math.sin(ang) * rad),
      sp = s.sample(bx, by);
    if (sp.depth > 0.65) continue;
    const rScale = 0.55 + 0.65 * sd;
    addBoulder(bx, by, rScale * 1.2, rScale, rScale * 0.72, sd * tau, sd + 0.37);
  }
  if (!idx.length) return null;
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new T.Mesh(
    g,
    new T.ShaderMaterial({
      uniforms: u,
      vertexShader: `attribute vec3 color;varying vec3 vCol,vN;varying float dist;void main(){vCol=color;vN=normalize(normal);vec4 q=modelViewMatrix*vec4(position,1.);dist=length(q.xyz);gl_Position=projectionMatrix*q;}`,
      fragmentShader: `uniform float uDay,uFog;uniform vec3 uHor;varying vec3 vCol,vN;varying float dist;void main(){float lit=.42+.58*max(0.,dot(vN,normalize(vec3(.45,.82,.35))));float sheen=pow(max(0.,vN.y),4.)*.14*uDay;vec3 c=(vCol*lit+vec3(.09,.12,.12)*sheen)*(.44+.56*uDay);gl_FragColor=vec4(mix(c,uHor,1.-exp(-pow(dist*uFog,2.))),1.);\n#include <colorspace_fragment>\n}`,
    }),
  );
  m.userData.role = "waterfall-rocks";
  return m;
}
export function disposeWater(g) {
  if (!g) return;
  g.removeFromParent();
  g.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
}
