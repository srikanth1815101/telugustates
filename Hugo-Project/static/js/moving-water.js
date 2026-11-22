// Physically grounded whitewater, valley-thalweg cascades, and monotonic upstream feeder channels.
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
    // Monotonic upstream approach stream gliding smoothly toward the waterfall lip (alias-free < 1.5 Hz).
    float lip=smoothstep(-.28,0.,v.y),fadeIn=smoothstep(-1.,-.55,v.y);
    float rip1=mwNoise(vec2(x*3.4,v.y*4.2-t*1.05));
    float rip2=mwNoise(vec2(x*7.2+(rip1-.5)*.6,v.y*8.5-t*1.65+2.3));
    float edge=1.-smoothstep(.62,.98,ax+.10*(rip1-.5));
    float rip=rip1*.58+rip2*.42;
    float crestFoam=lip*smoothstep(.34,.78,rip+.28*lip);
    vec3 deepCol=mix(vec3(.065,.245,.245),vec3(.13,.365,.355),rip);
    c=mix(deepCol,vec3(.89,.955,.945),clamp(crestFoam,0.,.88));
    a=edge*fadeIn*(.54+.32*lip+.12*crestFoam);
  } else {
    // Natural downward-pouring waterfall plumes (band-limited <= 2.25 Hz so motion is strictly downward at 30-120 fps, zero vertical barcode stripes).
    float fallProg=clamp(v.y,0.,1.),crest=1.-smoothstep(0.,.18,fallProg),footFade=1.-.22*smoothstep(.88,1.,fallProg);
    float sMeters=fallProg*max(9.,spd*1.75);
    float lobe=mwNoise(vec2(x*2.35,sMeters*.17-t*.94));
    // Central water tongue falls slightly ahead of the edges, forming natural downward parabolic V-lobes.
    float sWarp=sMeters+(lobe-.5)*2.6-ax*ax*1.15;
    float plume=mwNoise(vec2(x*5.3+(lobe-.5)*.95,sWarp*.33-t*1.62));
    float nearDetail=1.-smoothstep(85.,250.,dist);
    float fine=nearDetail*mwNoise(vec2(x*10.8-(plume-.5)*.7,sWarp*.56-t*2.22+3.7));
    float body=lobe*.46+plume*.39+fine*.15;
    float edge=1.-smoothstep(.56-.10*veil,.97,ax+.18*(lobe-.5)+.11*(plume-.5)*fallProg);
    if(veil>.5){
      float wisps=smoothstep(.32,.84,plume*.62+lobe*.38);
      c=mix(vec3(.62,.82,.82),vec3(.93,.975,.965),.45+.55*wisps);
      a=edge*wisps*.46*smoothstep(.04,.22,fallProg)*footFade;
    } else {
      float aerated=smoothstep(.22,.76,body+.22*fallProg+.20*crest*(1.-ax*.5));
      vec3 coreWater=mix(vec3(.075,.285,.285),vec3(.18,.44,.43),lobe);
      vec3 whiteWater=mix(vec3(.82,.92,.91),vec3(.95,.985,.975),smoothstep(.42,.88,body));
      c=mix(coreWater,whiteWater,clamp(.22+.76*aerated,0.,.96));
      c+=vec3(.13,.15,.14)*crest*smoothstep(.35,.85,1.-ax);
      a=edge*footFade*clamp(.66+.30*aerated,0.,.96);
    }
  }`,
  wash: `
  if(v.y<=1.02){
    // Organic boiling plunge foam expanding radially into the receiving pool (zero concentric bullseye stripes).
    float radius=clamp(v.y,0.,1.),ang=v.x;
    vec2 dir=vec2(cos(ang),sin(ang));
    float billow1=mwNoise(dir*(1.8+3.1*radius)-dir*(t*.92)+vec2(1.7,3.1));
    float billow2=mwNoise(dir*(3.8+5.4*radius)-dir*(t*1.54)+vec2(billow1*.85,-billow1*.65));
    float core=1.-smoothstep(.03,.38,radius+.11*(billow1-.5));
    float skirt=(1.-smoothstep(.20,.92,radius+.16*(billow2-.5)))*smoothstep(.36,.82,billow1*.54+billow2*.46);
    float foam=clamp(core*(.72+.28*billow1)+skirt*.74,0.,1.);
    float rim=1.-smoothstep(.58,.98,radius+.12*(billow1-.5));
    c=mix(vec3(.095,.305,.300),vec3(.91,.965,.955),foam*.92);
    a=rim*clamp(.28+.62*foam,0.,.92);
  } else {
    // Downstream foam-laced mountain runout stream carrying aerated trails away from the plunge pool.
    float prog=clamp(v.y-1.05,0.,1.),ax=abs(v.x);
    float w1=mwNoise(vec2(v.x*3.6,prog*5.2-t*1.12));
    float w2=mwNoise(vec2(v.x*7.8+(w1-.5)*.7,prog*9.4-t*1.75+2.3));
    float edge=1.-smoothstep(.58,.97,ax+.12*(w1-.5));
    float foam=(1.-.75*prog)*smoothstep(.36,.80,w1*.56+w2*.44)*(1.-.4*ax);
    c=mix(vec3(.085,.285,.285),vec3(.89,.955,.94),clamp(foam*1.08,0.,.88));
    a=edge*(1.-smoothstep(.65,1.,prog))*(.48+.38*foam);
  }`,
};
const material = (u, k) =>
  new T.ShaderMaterial({
    uniforms: u,
    transparent: true,
    forceSinglePass: true,
    depthWrite: false,
    polygonOffset: k !== "rocks",
    polygonOffsetFactor: k === "fall" ? -3 : -2,
    polygonOffsetUnits: k === "fall" ? -3 : -2,
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
      vertexShader: `uniform float liquidTime;attribute vec3 velocity;attribute vec3 cycle;varying float alpha;void main(){float ph=fract(liquidTime/cycle.x+cycle.y),t=ph*cycle.x;vec3 p=position+velocity*t;p.y-=4.9*t*t;vec4 eye=modelViewMatrix*vec4(p,1.);alpha=sin(3.14159*ph);float sz=(18.+18.*cycle.y)*cycle.z;gl_PointSize=clamp(sz/max(1.4,-eye.z),1.2,5.8);gl_Position=projectionMatrix*eye;}`,
      fragmentShader: `uniform float uDay;varying float alpha;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;float soft=(1.-smoothstep(.10,.5,d))*.68;vec3 c=vec3(.88,.96,.95)*(.48+.52*uDay);gl_FragColor=vec4(c,alpha*soft);\n#include <colorspace_fragment>\n}`,
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
    wetScale = site.wetFlow ? 1.25 : 1,
    width = clamp((1.3 + 0.16 * Math.min(34, drop)) * wetScale, 1.5, 5.6),
    p = [],
    uv = [],
    vel = [],
    idx = [],
    pts = [];
  const xy = (d, w) => [x + (dx * d - dy * w) / U, y + (dy * d + dx * w) / U];
  const crestWet = s.wet(x, y) > 0.28,
    rawFeeder =
      site.feeder?.length >= 2
        ? site.feeder
        : [xy(0, 0), xy(-9, 0), xy(-18, 0)];
  const v0 =
      Math.max(
        level(s, x, y),
        level(s, x - (3 * dx) / U, y - (3 * dy) / U) - 0.08,
      ) + 0.24,
    h1 = level(s, ...xy(span, 0)) + 0.1;
  // Measure convex rock/coarse-LOD bulge along the cliff face so the Newtonian free-fall sheet always clears Orbit terrain chords cleanly.
  let maxBulge = 0;
  for (let m = 1; m < 16; m++) {
    const tm = m / 16,
      freeZ = v0 - (v0 - h1) * tm * tm;
    for (const sw of [-1, 0, 1]) {
      const [sx, sy] = xy(span * tm, sw * width * 1.1),
        rockZ = level(s, sx, sy);
      if (rockZ - freeZ > maxBulge) maxBulge = rockZ - freeZ;
    }
  }
  const bulgeLift = Math.max(0.55, maxBulge + 0.72),
    fwdClear = clamp(0.65 + maxBulge * 0.22, 0.65, 2.8),
    speed = clamp(Math.sqrt(2 * 9.81 * drop), 3.0, 16.5),
    cols = 12,
    upRows = crestWet ? 4 : 9,
    fallRows = 26,
    totalRows = upRows + fallRows;
  // Precompute monotonic upstream row elevations (strictly >= v0 and non-decreasing upstream so water never climbs uphill).
  const upRowInfo = [];
  let minAllowedZ = v0;
  for (let j = upRows - 1; j >= 0; j--) {
    const fUp = (1 - j / upRows) * (crestWet ? 0.28 : 0.75),
      sp = samplePath(rawFeeder, fUp),
      cx = sp[0],
      cy = sp[1],
      zGround = level(s, cx, cy) + 0.18,
      zRow = crestWet ? v0 + 0.02 * (upRows - j) : Math.max(minAllowedZ, zGround);
    minAllowedZ = zRow + 0.025;
    upRowInfo[j] = { cx, cy, tx: -sp[2], ty: -sp[3], fUp, zRow };
  }
  // 1a. Monotonic upstream intake + Newtonian horizontal-launch parabolic curtain (`z = v0 - drop * t^2`, `v.y in [-1..1]`).
  for (let j = 0; j <= totalRows; j++) {
    const isUp = j < upRows;
    let cx, cy, tx, ty, vProg, wRow, zBase, tFall = 0;
    if (isUp) {
      const inf = upRowInfo[j];
      cx = inf.cx;
      cy = inf.cy;
      tx = inf.tx;
      ty = inf.ty;
      vProg = -(1 - j / upRows);
      wRow = width * (0.86 + 0.16 * (1 - j / upRows));
      zBase = inf.zRow;
    } else {
      tFall = (j - upRows) / fallRows;
      vProg = tFall;
      const dHoriz =
        span * tFall + Math.sin(Math.PI * Math.pow(tFall, 0.78)) * fwdClear;
      [cx, cy] = xy(dHoriz, 0);
      tx = dx;
      ty = dy;
      wRow = width * (0.86 + 0.32 * Math.pow(tFall, 0.8));
      zBase =
        v0 -
        (v0 - h1) * tFall * tFall +
        bulgeLift * Math.sin(Math.PI * Math.pow(tFall, 0.72));
    }
    for (let i = 0; i <= cols; i++) {
      const side = (i / cols) * 2 - 1,
        lat = side * wRow,
        a = cx + (-ty * lat) / U,
        b = cy + (tx * lat) / U,
        soil = level(s, a, b);
      let h;
      if (isUp) {
        h = Math.max(zBase - 0.04 * side * side, soil + 0.14);
      } else {
        const crown = (1 - side * side * 0.7) * Math.sin(Math.PI * tFall) * 0.28;
        h = Math.max(soil + 0.42 * (1 - 0.65 * tFall * tFall) + 0.12, zBase + crown);
      }
      p.push(...s.xyz(a, b, h));
      uv.push(side, vProg);
      vel.push(
        isUp
          ? speed * (0.32 + 0.28 * (j / upRows))
          : speed * (0.48 + 0.52 * tFall),
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
  // 1b. Outer aerated spray veil slightly in front of the main curtain (negative `pace` flags veil in shader; 1 draw call).
  const vCols = 8,
    vRows = 18,
    veilBase = vel.length;
  for (let j = 0; j <= vRows; j++) {
    const t = j / vRows,
      tFall = 0.05 + 0.95 * t,
      dHoriz =
        span * tFall +
        Math.sin(Math.PI * Math.pow(tFall, 0.76)) * (fwdClear + 0.42),
      wVeil = width * (0.94 + 0.42 * t),
      zVeil =
        v0 +
        0.08 -
        (v0 - h1) * tFall * tFall +
        (bulgeLift + 0.28) * Math.sin(Math.PI * Math.pow(tFall, 0.72));
    for (let i = 0; i <= vCols; i++) {
      const side = (i / vCols) * 2 - 1,
        [a, b] = xy(dHoriz, side * wVeil),
        soil = level(s, a, b),
        h = Math.max(soil + 0.48 * (1 - 0.6 * tFall * tFall) + 0.14, zVeil);
      p.push(...s.xyz(a, b, h));
      uv.push(side, tFall);
      vel.push(-speed * (0.55 + 0.5 * tFall));
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

  // 2. Organic boiling plunge foam + downstream runout channel (`"plunge-foam"`).
  const wc = [],
    wuv = [],
    ws = [],
    wi = [],
    [bx, by] = xy(span + fwdClear * 0.25, 0),
    poolRx = width * 1.55 + clamp(drop * 0.07, 0.35, 1.9),
    poolRy = width * 1.42 + clamp(drop * 0.06, 0.3, 1.7),
    rings = 6,
    segs = 32;
  for (let k = 0; k <= rings; k++)
    for (let j = 0; j <= segs; j++) {
      const r = k / rings,
        a = (tau * j) / segs,
        xx =
          bx +
          (dx * (0.18 + r * Math.cos(a)) * poolRx -
            dy * r * Math.sin(a) * poolRy) /
            U,
        yy =
          by +
          (dy * (0.18 + r * Math.cos(a)) * poolRx +
            dx * r * Math.sin(a) * poolRy) /
            U,
        boilLift = 0.12 * Math.max(0, 1 - r * 2.2);
      wc.push(...s.xyz(xx, yy, level(s, xx, yy) + 0.12 + boilLift));
      wuv.push(a, r);
      ws.push(speed);
      const n = ws.length - 1;
      if (j && k)
        wi.push(n - (segs + 2), n - (segs + 1), n, n - (segs + 2), n, n - 1);
    }
  const runout = site.runout;
  if (runout && runout.length >= 2 && s.wet(bx, by) < 0.32) {
    const rCols = 6,
      rRows = 10,
      runBase = ws.length;
    for (let j = 0; j <= rRows; j++) {
      const f = j / rRows,
        sp = samplePath(runout, f),
        wOut = width * (1.0 - 0.3 * f);
      for (let i = 0; i <= rCols; i++) {
        const side = (i / rCols) * 2 - 1,
          rx = sp[0] + (-sp[3] * side * wOut) / U,
          ry = sp[1] + (sp[2] * side * wOut) / U;
        wc.push(...s.xyz(rx, ry, level(s, rx, ry) + 0.11));
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

  // 3. Gravity-true downward waterfall droplets + low outward plunge splash (`"plunge-spray"`, zero upward-floating clouds).
  for (let j = 0; j < 76; j++) {
    const r = noise(j, 13),
      a = (r - 0.5) * 2,
      c = noise(j, 9),
      inCurtain = j < 34;
    if (inCurtain) {
      const tStart = 0.06 + 0.48 * c,
        dSpot =
          span * tStart +
          Math.sin(Math.PI * Math.pow(tStart, 0.78)) * (fwdClear + 0.35),
        [xx, yy] = xy(dSpot, a * width * 0.95),
        zStart =
          v0 -
          (v0 - h1) * tStart * tStart +
          bulgeLift * Math.sin(Math.PI * Math.pow(tStart, 0.72)),
        downVy = -(1.4 + 2.4 * noise(j, 25)),
        maxLife = Math.sqrt(Math.max(0.18, (zStart - h1) / 4.9));
      pts.push([
        ...s.xyz(xx, yy, zStart),
        dx * (0.9 + 0.8 * c) - dy * a * 0.35,
        downVy,
        -dy * (0.9 + 0.8 * c) - dx * a * 0.35,
        clamp(0.45 + 0.45 * c, 0.35, maxLife),
        r,
        1.25 + 0.65 * noise(j, 41),
      ]);
    } else {
      const dSpot = span + fwdClear * 0.25 + (c - 0.3) * 1.4,
        [xx, yy] = xy(dSpot, a * width * 1.15),
        baseH = level(s, xx, yy) + 0.18,
        upHop = 0.28 + 0.52 * noise(j, 25);
      pts.push([
        ...s.xyz(xx, yy, baseH),
        dx * (0.85 + 1.1 * c) - dy * a * (0.75 + 1.35 * c),
        upHop,
        -dy * (0.85 + 1.1 * c) - dx * a * (0.75 + 1.35 * c),
        0.38 + 0.28 * noise(j, 31),
        c,
        1.15 + 0.55 * noise(j, 41),
      ]);
    }
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
