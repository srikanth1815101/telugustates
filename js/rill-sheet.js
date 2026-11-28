import * as T from "../vendor/three.module.min.js";
import { ACRE as M } from "./metres.js";
import { drops } from "./hydro-shaders.js";
const smooth = (t) => ((t = Math.max(0, Math.min(1, t))), t * t * (3 - 2 * t));
// Assess exactly the same tapered spline centreline for the renderer and geometric checks. Source and soak-away ends have zero radius.
export function spline(r, t) {
  const u = 1 - t;
  return [
    u * u * u * r.a.x +
      3 * u * u * t * r.c1x +
      3 * u * t * t * r.c2x +
      t * t * t * r.b.x,
    u * u * u * r.a.y +
      3 * u * u * t * r.c1y +
      3 * u * t * t * r.c2y +
      t * t * t * r.b.y,
    (r.w0 + (r.w1 - r.w0) * smooth(t)) *
      (r.tail ? 1 - smooth((t - 0.53) / 0.47) : 1),
  ];
}
const stampV = `attribute vec4 endpoints,sectionData;uniform vec2 centre;uniform float span;varying vec2 displaced,delta;varying vec4 dims;
void main(){vec2 a=endpoints.xy,b=endpoints.zw;delta=b-a;vec2 d=normalize(delta+vec2(1e-8)),n=vec2(-d.y,d.x);float pad=max(sectionData.x,sectionData.y)+.50;vec2 p=mix(a,b,position.x*.5+.5)+pad*(d*position.x+n*position.y);dims=sectionData;displaced=p-a;gl_Position=vec4((p-centre)*2./span,0.,1.);}`;
const stampF = `varying vec2 displaced,delta;varying vec4 dims;void main(){float k=clamp(dot(displaced,delta)/max(1e-6,dot(delta,delta)),0.,1.);float r=mix(dims.x,dims.y,k),sd=r-length(displaced-k*delta);if(sd<-.454)discard;float value=clamp((sd+.455)/1.21,0.,1.);gl_FragDepth=.99-.97*value;vec2 vel=normalize(delta+vec2(1.e-7))*min(1.,dims.w/1.8);gl_FragColor=vec4(value,.5+.5*vel,clamp(dims.z/.12,0.,1.));}`;
// Two little data maps, NOT screen overlays. A depth winner takes the UNION of reaches before any colour is applied to the ground.
// This also lets a tiny stream shade a complicated terrain triangle without ever floating above or clipping through it.
export class GroundInk {
  constructor(lite) {
    this.size = lite ? 448 : 640;
    this.maps = [0, 1].map(
      () =>
        new T.WebGLRenderTarget(this.size, this.size, {
          format: T.RGBAFormat,
          type: T.UnsignedByteType,
          minFilter: T.LinearFilter,
          magFilter: T.LinearFilter,
          generateMipmaps: false,
          depthBuffer: true,
          stencilBuffer: false,
        }),
    );
    this.g = new T.InstancedBufferGeometry();
    this.g.setAttribute(
      "position",
      new T.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3),
    );
    this.g.setIndex([0, 1, 2, 2, 1, 3]);
    this.u = { centre: { value: new T.Vector2() }, span: { value: 48 } };
    this.mat = new T.ShaderMaterial({
      uniforms: this.u,
      vertexShader: stampV,
      fragmentShader: stampF,
      side: T.DoubleSide,
      blending: T.NoBlending,
      depthWrite: true,
      depthTest: true,
      toneMapped: false,
    });
    this.m = new T.Mesh(this.g, this.mat);
    this.m.frustumCulled = false;
    this.m.userData.role = "discharge-field";
    this.scene = new T.Scene();
    this.scene.add(this.m);
    this.camera = new T.Camera();
    this.col = new T.Color();
    this.viewport = new T.Vector4();
    this.scissor = new T.Vector4();
    this.capacity = 0;
  }
  write(curves, s, cx, cy) {
    const take = curves.filter(
        (r) =>
          Math.max(Math.abs(r.a.x - cx * M), Math.abs(r.a.y - cy * M)) < 99,
      ),
      needed = take.length * 5;
    if (needed > this.capacity || !this.capacity) {
      this.g.dispose();
      this.capacity = Math.max(32, 2 ** Math.ceil(Math.log2(needed + 1)));
      for (const n of ["endpoints", "sectionData"])
        this.g.setAttribute(
          n,
          new T.InstancedBufferAttribute(
            new Float32Array(4 * this.capacity),
            4,
          ).setUsage(T.DynamicDrawUsage),
        );
    }
    const line = this.g.attributes.endpoints,
      sec = this.g.attributes.sectionData,
      X = s.o.x * M,
      Y = s.o.y * M;
    let i = 0;
    for (const r of take) {
      let a = [r.a.x, r.a.y, r.w0];
      for (let j = 1; j <= 5; j++) {
        const b = spline(r, j / 5);
        line.setXYZW(i, a[0] - X, Y - a[1], b[0] - X, Y - b[1]);
        sec.setXYZW(i, a[2], b[2], r.depth, r.vel);
        a = b;
        i++;
      }
    }
    this.g.instanceCount = i;
    for (const att of [line, sec]) {
      att.clearUpdateRanges();
      if (i) att.addUpdateRange(0, i * 4);
      att.needsUpdate = true;
    }
    this.u.centre.value.set(
      Math.round((cx * M) / 3) * 3 - X,
      Y - Math.round((cy * M) / 3) * 3,
    );
  }
  draw(rr, ground) {
    const target = rr.getRenderTarget(),
      alpha = rr.getClearAlpha(),
      auto = rr.autoClear,
      st = rr.getScissorTest();
    rr.getClearColor(this.col);
    rr.getViewport(this.viewport);
    rr.getScissor(this.scissor);
    try {
      rr.autoClear = true;
      rr.setScissorTest(false);
      rr.setClearColor(0, 0);
      for (let i = 0; i < 2; i++) {
        this.u.span.value = i ? 180 : 48;
        rr.setRenderTarget(this.maps[i]);
        rr.render(this.scene, this.camera);
      }
    } finally {
      rr.setRenderTarget(target);
      rr.setViewport(this.viewport);
      rr.setScissor(this.scissor);
      rr.setScissorTest(st);
      rr.setClearColor(this.col, alpha);
      rr.autoClear = auto;
    }
    ground.rillNear.value = this.maps[0].texture;
    ground.rillFar.value = this.maps[1].texture;
    ground.rillCentre.value.copy(this.u.centre.value);
    ground.rillOn.value = 1;
  }
  dispose() {
    this.g.dispose();
    this.mat.dispose();
    this.maps.forEach((x) => x.dispose());
  }
}
// A real horizontal free surface for each connected hollow. Never an ellipse stamped on a slope. Mixed-basin triangles divide at their dual boundaries.
export class Ponds {
  constructor(s, u) {
    this.s = s;
    this.g = new T.BufferGeometry();
    this.m = new T.Mesh(
      this.g,
      new T.ShaderMaterial({
        uniforms: u,
        side: T.DoubleSide,
        forceSinglePass: true,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -0.8,
        vertexShader: `attribute vec3 column;uniform float pondBlend;varying vec3 P;varying float dep,range,share;void main(){P=position;float offset=column.z*(1.-pondBlend);P.y+=offset;dep=column.x+offset;share=column.y;vec4 eye=modelViewMatrix*vec4(P,1.);range=length(eye.xyz);gl_Position=projectionMatrix*eye;}`,
        fragmentShader: `uniform float uRain,uDay,uFog,liquidTime;uniform vec2 hydroOffset,rillCentre;uniform vec3 uZen,uHor,cameraInPatch;varying float dep,range,share;varying vec3 P;${drops}
 void main(){if(dep<=.0002)discard;vec2 p=P.xz+hydroOffset;float n=fieldNoise(p*.62);vec3 rip=ringsAt(p*1.66,liquidTime,uRain,range);vec3 eye=normalize(cameraInPatch-P);float fres=.036+.68*pow(1.-clamp(eye.y+n*.04+rip.x*.07,0.,1.),3.65);vec3 c=mix(vec3(.042,.058,.040),mix(uZen,uHor,.52),fres+.14);c+=vec3(.09,.12,.11)*rip.z;c*=.42+.58*uDay;c=mix(c,uHor,1.-exp(-pow(range*uFog,2.)));float edge=smoothstep(.0002,max(.013,fwidth(dep)),dep)*smoothstep(.015,.69,share);gl_FragColor=vec4(c,edge*(.25+.27*smoothstep(.003,.14,dep)+fres*.33)*(1.-smoothstep(68.,88.,length(P.xz-rillCentre))));
#include <colorspace_fragment>
}`,
      }),
    );
    this.m.userData.role = "stored-rainwater";
    this.m.renderOrder = 2;
    this.m.frustumCulled = false;
    this.m.visible = false;
    this.capacity = 0;
    this.triangles = 0;
  }
  // Fit the plane to sub-metre samples of the submitted land, not to a regular polygon at the pit. The bank itself occludes its high side.
  write(net, cx, cy) {
    if (this.net !== net) {
      this.cache = new Map();
      this.net = net;
    }
    const pts = [],
      X = this.s.o.x * M,
      Y = this.s.o.y * M,
      A = net.nodes,
      B = net.pits,
      valid = (p) =>
        p?.standing && (p.volume > 0 || (p.fromHead ?? p.floor) > p.floor);
    for (let ix = 0; ix < net.faces.length; ix++) {
      const ids = net.faces[ix],
        a = A[ids[0]],
        b = A[ids[1]],
        c = A[ids[2]];
      if (
        Math.max(Math.abs(a.x - cx), Math.abs(a.y - cy)) > 94 ||
        a.wall ||
        b.wall ||
        c.wall ||
        (!valid(B[a.basin]) && !valid(B[b.basin]) && !valid(B[c.basin]))
      )
        continue;
      const pits = [...new Set([a.basin, b.basin, c.basin])]
        .map((i) => B[i])
        .filter(valid);
      if (!pits.length) continue;
      const hi = Math.max(
          ...pits.map((p) => Math.max(p.level, p.fromHead ?? p.level)),
        ),
        low = Math.min(a.h, b.h, c.h);
      if (low >= hi + 0.16) continue;
      let small = this.cache.get(ix);
      if (!small) {
        small = [];
        const n = Math.max(
            2,
            Math.min(
              8,
              Math.ceil(
                Math.max(
                  Math.hypot(b.x - a.x, b.y - a.y),
                  Math.hypot(c.x - a.x, c.y - a.y),
                  Math.hypot(b.x - c.x, b.y - c.y),
                ) / 0.78,
              ),
            ),
          ),
          grid = [];
        for (let i = 0; i <= n; i++) {
          grid[i] = [];
          for (let j = 0; j <= n - i; j++) {
            const u = i / n,
              v = j / n,
              t = 1 - u - v,
              x = a.x * t + b.x * u + c.x * v,
              y = a.y * t + b.y * u + c.y * v;
            grid[i][j] = [x - X, Y - y, this.s.ground(x / M, y / M), t, u, v];
          }
        }
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n - i; j++) {
            small.push([grid[i][j], grid[i + 1][j], grid[i][j + 1]]);
            if (i + j + 1 < n)
              small.push([grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]);
          }
        this.cache.set(ix, small);
      }
      for (const face of small) {
        const bottom = Math.min(face[0][2], face[1][2], face[2][2]);
        let best = null,
          weight = 0;
        for (const p of pits) {
          if (Math.max(p.level, p.fromHead ?? p.level) <= bottom + 0.0002)
            continue;
          const share = (v) =>
              (a.basin === p.id ? v[3] : 0) +
              (b.basin === p.id ? v[4] : 0) +
              (c.basin === p.id ? v[5] : 0),
            val = face.reduce((v, k) => v + share(k), 0);
          if (val > weight) {
            best = p;
            weight = val;
          }
        }
        if (!best) continue;
        for (const v of face) {
          const share =
            (a.basin === best.id ? v[3] : 0) +
            (b.basin === best.id ? v[4] : 0) +
            (c.basin === best.id ? v[5] : 0);
          pts.push(
            v[0],
            best.level + 0.001,
            v[1],
            best.level - v[2],
            share,
            (best.fromHead ?? best.level) - best.level,
          );
        }
      }
    }
    const count = pts.length / 6;
    this.triangles = count / 3;
    this.m.visible = count > 0;
    if (!count) return;
    if (count > this.capacity) {
      this.g.dispose();
      this.capacity = Math.max(48, 2 ** Math.ceil(Math.log2(count + 1)));
      this.g.setAttribute(
        "position",
        new T.BufferAttribute(new Float32Array(this.capacity * 3), 3).setUsage(
          T.DynamicDrawUsage,
        ),
      );
      this.g.setAttribute(
        "column",
        new T.BufferAttribute(new Float32Array(this.capacity * 3), 3).setUsage(
          T.DynamicDrawUsage,
        ),
      );
    }
    const p = this.g.attributes.position,
      d = this.g.attributes.column;
    for (let i = 0; i < count; i++) {
      p.setXYZ(i, pts[6 * i], pts[6 * i + 1], pts[6 * i + 2]);
      d.setXYZ(i, pts[6 * i + 3], pts[6 * i + 4], pts[6 * i + 5]);
    }
    for (const a of [p, d]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, count * a.itemSize);
      a.needsUpdate = true;
    }
    this.g.setDrawRange(0, count);
  }
  dispose() {
    this.g.dispose();
    this.m.material.dispose();
    this.m.removeFromParent();
  }
}
