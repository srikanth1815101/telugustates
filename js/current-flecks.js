import * as T from "../vendor/three.module.min.js";
import { ACRE as M } from "./metres.js";
import { noise } from "./habitats.js";
// Real streamlines as a sparse second scale cue. Each path is integrated once on the SAME current field as the swimmer.
// The GPU moves a small, irregular cluster along it. No periodic screen-space grid or per-frame particle simulation.
export function trace(s, x, y, life) {
  const points = [],
    dirs = [],
    at = (x, y) => {
      const h = s.sample(x, y);
      if (!h.drawn || h.w <= 0 || h.depth < 0.13 || h.sea > 0.07) return null;
      const c = s.current(x, y, 1, false, h.w);
      return c[2] > 0.1 ? [h, c] : null;
    };
  for (let n = 0; n <= 9; n++) {
    const a = at(x, y);
    if (!a) return null;
    const [h, c] = a;
    if (n % 3 === 0) {
      points.push(s.xyz(x, y, h.line + 0.041));
      dirs.push(c);
    }
    if (n === 9) break;
    const dt = life / 9,
      half = dt / (2 * M),
      q = at(x + c[0] * c[2] * half, y - c[1] * c[2] * half);
    if (!q) return null;
    const [, v] = q;
    x += (dt * v[0] * v[2]) / M;
    y -= (dt * v[1] * v[2]) / M;
  }
  return { points, dirs };
}
export function driftMesh(s, x, y, tier, uniforms) {
  const pos = [],
    B = [],
    C = [],
    D = [],
    meta = [],
    uv = [],
    idx = [],
    tracks = [];
  // One world-fixed, sparse far population plus a smaller scale of parcels near the walker. No per-frame CPU advection.
  for (const near of [false, true]) {
    const step = near ? (tier ? 5.7 : 6.7) : tier ? 14.9 : 16.3,
      R = near ? 9 : tier ? 12 : 11,
      ox = Math.floor((x * M) / step),
      oy = Math.floor((y * M) / step);
    for (let j = -R; j <= R; j++)
      for (let i = -R; i <= R; i++) {
        if (i * i + j * j > R * R) continue;
        const I = ox + i,
          J = oy + j,
          seed = noise(I, J, near ? 134 : 99),
          X = ((I + noise(I, J, 129)) * step) / M,
          Y = ((J + noise(J, I, 54)) * step) / M,
          life = 8.6 + 9.4 * noise(J, I, 83),
          ph = noise(I, J, 118),
          sz = 0.55 + 1.3 * seed;
        // Leave clear stretches between tracers. Finer surface motion is in the running-water material, not hundreds of identical white stamps.
        if (noise(I, J, near ? 175 : 183) < (near ? 0.2 : 0.35)) continue;
        const tr = trace(s, X, Y, life);
        if (!tr) continue;
        const [a, b, c, d] = tr.points;
        // Keep the parcel corners on actual wet, submitted water too; do not let cues hang over the shoreline.
        let fits = true;
        for (let n = 0; n < 4 && fits; n++) {
          const [dx, dz] = tr.dirs[n],
            X = s.o.x + tr.points[n][0] / M,
            Y = s.o.y - tr.points[n][2] / M;
          for (const side of [-1, 1]) {
            const h = s.sample(
              X - (side * dz * sz) / M,
              Y - (side * dx * sz) / M,
            );
            if (!h.drawn || h.depth < 0.03 || h.w <= 0 || h.sea > 0.07) {
              fits = false;
              break;
            }
          }
        }
        if (!fits) continue;
        tracks.push({
          start: a,
          end: d,
          head: tr.dirs[0].slice(0, 3),
          life,
          phase: ph,
        });
        const k = pos.length / 3;
        idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
        for (const [u, v] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ]) {
          pos.push(...a);
          B.push(...b);
          C.push(...c);
          D.push(...d);
          meta.push(life, ph, sz, noise(I, J, 8));
          uv.push(u, v);
        }
      }
  }
  if (!idx.length) return null;
  const g = new T.BufferGeometry();
  for (const [n, val, size] of [
    ["position", pos, 3],
    ["nextB", B, 3],
    ["nextC", C, 3],
    ["lastD", D, 3],
    ["parcel", meta, 4],
    ["tileUV", uv, 2],
  ])
    g.setAttribute(n, new T.Float32BufferAttribute(val, size));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.boundingSphere.radius += 76;
  const mat = new T.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    forceSinglePass: true,
    vertexShader: `attribute vec3 nextB,nextC,lastD;attribute vec4 parcel;attribute vec2 tileUV;uniform float liquidTime;varying vec2 uv0;varying float shown,seed,dist;void main(){float a=fract(liquidTime/parcel.x+parcel.y),t=a*3.;vec3 A=t<1.?position:t<2.?nextB:nextC,B=t<1.?nextB:t<2.?nextC:lastD,c=mix(A,B,fract(t));vec2 dir=normalize(B.xz-A.xz+vec2(.00001));uv0=tileUV;seed=parcel.w;shown=smoothstep(0.,.16,a)*(1.-smoothstep(.78,1.,a));c.xz+=parcel.z*(dir*tileUV.x+vec2(-dir.y,dir.x)*tileUV.y*.66);vec4 eye=modelViewMatrix*vec4(c,1.);dist=-eye.z;gl_Position=projectionMatrix*eye;}`,
    fragmentShader: `varying vec2 uv0;varying float shown,seed,dist;uniform float uDay,uFog;uniform vec3 uHor;// Every local cluster has its own recognisable broken contour. Golden leaves keep a recognisable silhouette as they pass the bank; foam rides ACROSS a crest, not along a static scratch.
float blob(vec2 p,vec2 r,float aa){return 1.-smoothstep(1.-aa,1.+aa,length(p/r));}
void main(){vec2 q=uv0;float aa=clamp(fwidth(q.x)+fwidth(q.y),.026,.52),a;vec3 c;
 if(seed>.48){vec2 v=q-vec2(-.13,.05);float a0=seed*12.8;v=mat2(cos(a0),sin(a0),-sin(a0),cos(a0))*v;
 float leaf=blob(vec2(v.x,v.y+.19*v.x*v.x),vec2(.16+.12*seed,.071+.045*seed)*(1.-.33*min(1.,abs(v.x)*3.)),aa);
 float spine=1.-smoothstep(.009,.036+.11*aa,abs(v.y+.19*v.x*v.x));c=mix(vec3(.27,.16,.067),vec3(.67,.47,.18),.19+.31*seed+.23*spine);a=leaf*.91;
 }else{a=0.;for(int j=0;j<5;j++){float fi=float(j),v=fract(sin(fi*95.7+seed*131.2)*753.55),w=fract(sin(fi*36.2+seed*76.)*863.73);vec2 at=vec2((v-.5)*1.36,(w-.5)*(.36+.68*seed));
 float sz=(.069+.099*w*w)*(1.-.22*abs(at.x));a+=blob(q-at,vec2(sz,sz*(.67+.4*v)),aa)*(.46+.38*v);}
 a=min(.85,a);c=mix(vec3(.45,.62,.55),vec3(.77,.83,.73),.24+seed);}
 a*=shown*(1.-smoothstep(145.,355.,dist));if(a<.012)discard;c*=.41+.59*uDay;gl_FragColor=vec4(mix(c,uHor,1.-exp(-pow(dist*uFog,2.))),a);
#include <colorspace_fragment>
}`,
  });
  const mesh = new T.Mesh(g, mat);
  mesh.userData = { role: "drifting-current-flecks", tracks };
  mesh.renderOrder = 3;
  return mesh;
}
