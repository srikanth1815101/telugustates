import { driftMesh } from "./current-flecks.js";
import { fieldNoise } from "./ground-weave.js";
import {
  rockWater,
  findFall,
  cascade,
  disposeWater,
} from "./moving-water.js";
import * as T from "../vendor/three.module.min.js";
import { staticModel } from "./art-library.js";
import { noise, U } from "./habitats.js";
export class FieldExtras {
  constructor(s, eco, visitor, x, y, tier, settings, u) {
    this.g = new T.Group();
    this.o = s.o;
    this.s = s;
    this.t = 0;
    this.u = u;
    this.sites = [];
    this.tier = tier;
    this.driftFocus = null;
    if (tier && settings.motion !== false) {
      const n = tier === 2 ? 36 : 18,
        geo = new T.BufferGeometry(),
        pos = new Float32Array(n * 3),
        col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (noise(i, 17) - 0.5) * 29;
        pos[i * 3 + 1] = noise(i, 19) * 6;
        pos[i * 3 + 2] = (noise(i, 22) - 0.5) * 28;
        new T.Color(
          settings.season === "summer"
            ? "#edb566"
            : i % 3
              ? "#e7d493"
              : "#b9cb81",
        ).toArray(col, i * 3);
      }
      geo.setAttribute("position", new T.BufferAttribute(pos, 3));
      geo.setAttribute("color", new T.BufferAttribute(col, 3));
      this.motes = new T.Points(
        geo,
        new T.ShaderMaterial({
          uniforms: { t: u.uClock },
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          vertexShader:
            "uniform float t;varying vec3 c;void main(){c=color;vec3 p=position;p.x=mod(p.x+t*.31+15.,30.)-15.;p.y=mod(p.y-t*.19+60.,6.);p.z+=sin(p.x*.6+t)*.34;vec4 q=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(40./max(1.,-q.z),1.,4.);gl_Position=projectionMatrix*q;}",
          fragmentShader:
            "varying vec3 c;void main(){vec2 p=gl_PointCoord-.5;if(dot(p,p)>.23)discard;gl_FragColor=vec4(c,.6);}",
        }),
      );
      this.motes.frustumCulled = false;
      this.g.add(this.motes);
    }
    // The distant grove uses the solid third LOD of the same licensed broadleaf model, not crossed cards.
    {
      const region = eco.at(x, y),
        farSpecies =
          region.mangrove > 18 && region.coast < 10
            ? "Mangrove"
            : region.crop > 48 && region.coast < 65
              ? "Palmyra"
              : region.coast < 3
                ? "Casuarina"
                : region.rain > 3.1
                  ? "Mixed canopy"
                  : region.shrub > 44
                    ? "Neem"
                    : "Tamarind";
      const g = staticModel("tree", farSpecies, eco.presets, 2).clone();
      const distant = [],
        R = tier === 2 ? 59 : tier ? 37 : 24,
        inner = tier === 2 ? 18 : tier ? 13 : 7;
      for (let j = -R; j < R; j += 2)
        for (let i = -R; i < R; i += 2) {
          const r = Math.hypot(i, j);
          if (r < inner - 0.6 || r > R) continue;
          const gx = Math.floor(x) + i,
            gy = Math.floor(y) + j,
            t = s.t.at(gx, gy);
          if (!t?.d || t.f < 28 || [3, 4, 5].includes(t.c)) continue;
          for (
            let k = 0;
            k < Math.min(tier === 2 ? 6 : tier ? 3 : 2, t.f / 17);
            k++
          ) {
            const xx = gx + noise(gx, gy, k) * 1.98,
              yy = gy + noise(gy, gx, k) * 1.98,
              cl = s.t.at(xx, yy);
            if (!cl?.d || cl.f < 25 || [3, 4, 5].includes(cl.c)) continue;
            const hit = s.sample(xx, yy);
            if (!hit.drawn || hit.depth > 0.12) continue;
            const h = hit.z,
              seed = noise(gx + k, gy, 47),
              sz = 9 + seed * 6;
            distant.push([s.xyz(xx, yy, h), sz, seed]);
          }
        }
      if (distant.length) {
        const m = new T.InstancedMesh(
            g,
            new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide }),
            distant.length,
          ),
          o = new T.Object3D(),
          base = new T.Color();
        distant.forEach(([p, sz, v], k) => {
          o.position.fromArray(p);
          o.rotation.y = v * 6.28;
          o.scale.setScalar(sz / eco.presets.trees[farSpecies].height);
          o.updateMatrix();
          m.setMatrixAt(k, o.matrix);
          m.setColorAt(
            k,
            base
              .set(settings.season === "summer" ? "#dbc399" : "#b9c1a6")
              .multiplyScalar(0.83 + 0.45 * v),
          );
        });
        m.userData.role = "far-copse";
        this.g.add(m);
        m.frustumCulled = false;
        this.far = m;
        this.fm = m.instanceMatrix.array.slice();
        this.fc = m.instanceColor.array.slice();
        this.fbins = new Map();
        distant.forEach(([p, sz], k) => {
          const key = Math.floor(p[0] / 450) + "," + Math.floor(p[2] / 450);
          const box = this.fbins.get(key) || {
            x: p[0],
            y: p[1],
            z: p[2],
            r: 0,
            ids: [],
          };
          box.ids.push(k);
          box.r = Math.max(
            box.r,
            Math.hypot(p[0] - box.x, p[1] - box.y, p[2] - box.z) + sz * 2,
          );
          this.fbins.set(key, box);
        });
        this.fq = new T.Quaternion();
        this.ff = new T.Frustum();
        this.fmat = new T.Matrix4();
        this.nextCull = 0;
      } else g.dispose();
    }
    if (eco.at(x, y).coast < 30) {
      const p = [],
        idx = [],
        col = [];
      let A = Math.floor(x / 64),
        B = Math.floor(y / 64);
      for (let i = A - 8; i <= A + 8; i++)
        for (let j = B - 8; j <= B + 8; j++) {
          if (s.axes.has(i + "," + j)) continue; // local sea uses the same bed, shader and controller as inland water
          let polygons = eco.marine[i + "," + j];
          if (!polygons) continue;
          if (polygons === 1)
            polygons = [
              [
                [
                  [0, 0],
                  [2048, 0],
                  [2048, 2048],
                  [0, 2048],
                ],
              ],
            ];
          for (let poly of polygons) {
            let rings = poly.map((r) =>
                r.map(([x, y]) => new T.Vector2(x / 32, y / 32)),
              ),
              base = p.length / 3;
            for (const tri of T.ShapeUtils.triangulateShape(
              rings[0],
              rings.slice(1),
            ))
              idx.push(...tri.map((k) => k + base));
            for (const r of rings)
              for (const v of r) {
                p.push(...s.xyz(i * 64 + v.x, j * 64 + v.y, -0.42));
                const tint = new T.Color("#4f9fa7").lerp(
                  new T.Color("#74b8b3"),
                  noise(i, j) * 0.27,
                );
                col.push(tint.r, tint.g, tint.b);
              }
          }
        }
      if (idx.length) {
        let g = new T.BufferGeometry();
        g.setAttribute("position", new T.Float32BufferAttribute(p, 3));
        g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
        g.setIndex(idx);
        this.g.add(
          new T.Mesh(
            g,
            new T.ShaderMaterial({
              uniforms: u,
              side: T.DoubleSide,
              vertexShader: `varying vec3 P;varying float dist;void main(){P=position;vec4 q=modelViewMatrix*vec4(P,1.);dist=length(q.xyz);gl_Position=projectionMatrix*q;}`,
              fragmentShader: `${fieldNoise}
uniform vec2 hydroOffset;uniform float liquidTime,uDay,uFog;uniform vec3 uHor;varying vec3 P;varying float dist;void main(){vec2 p=P.xz+hydroOffset;float band=.42+.30*fieldNoise(p*.0017+vec2(liquidTime*.009,0.))+.15*fieldNoise(p*.0075+vec2(liquidTime*.037,0.));vec3 c=mix(vec3(.055,.207,.255),vec3(.183,.359,.384),band*.73)*(.44+.56*uDay);gl_FragColor=vec4(mix(c,uHor,1.-exp(-pow(dist*uFog,2.))),1.);
#include <colorspace_fragment>
}`,
            }),
          ),
        );
      }
    }

    for (const f of eco.falls) {
      if (Math.hypot(f.cell[0] + 0.5 - x, f.cell[1] + 0.5 - y) > 10.5)
        continue;
      const site = findFall(s, f);
      if (site) {
        this.sites.push(site);
        this.g.add(cascade(s, site, u));
      }
    }
    this.fall = this.sites.length > 0;
  }
  syncRocks(items) {
    if (this.placements === items) return;
    const next = rockWater(this.s, items, this.u);
    disposeWater(this.rockFX);
    this.placements = items;
    this.rockFX = next;
    this.g.add(next);
  }
  update(cam, x, y, range, reduce) {
    if (
      range < 148 &&
      (!this.driftFocus ||
        Math.hypot(x - this.driftFocus[0], y - this.driftFocus[1]) * U > 43)
    ) {
      if (this.drift) {
        this.drift.removeFromParent();
        this.drift.geometry.dispose();
        this.drift.material.dispose();
      }
      this.drift = driftMesh(this.s, x, y, this.tier, this.u);
      if (this.drift) this.g.add(this.drift);
      this.driftFocus = [x, y];
    }
    if (this.drift) this.drift.visible = range < 148;
    if (
      this.far &&
      (performance.now() > this.nextCull ||
        this.fq.angleTo(cam.quaternion) > 0.06)
    ) {
      this.fq.copy(cam.quaternion);
      this.nextCull = performance.now() + 360;
      this.g.updateWorldMatrix(true, false);
      this.ff.setFromProjectionMatrix(
        this.fmat
          .multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
          .multiply(this.g.matrixWorld),
      );
      let n = 0;
      for (const b of this.fbins.values())
        if (
          this.ff.planes.every(
            (p) =>
              p.normal.x * b.x +
                p.normal.y * b.y +
                p.normal.z * b.z +
                p.constant >=
              -b.r,
          )
        )
          for (const k of b.ids) {
            this.far.instanceMatrix.array.set(
              this.fm.subarray(16 * k, 16 * k + 16),
              16 * n,
            );
            this.far.instanceColor.array.set(
              this.fc.subarray(3 * k, 3 * k + 3),
              3 * n++,
            );
          }
      this.far.count = n;
      this.far.instanceMatrix.needsUpdate =
        this.far.instanceColor.needsUpdate = true;
      this.far.visible = n > 0;
    }
    if (this.motes) {
      this.motes.visible = range < 80 && !reduce;
      this.motes.position.set(...this.s.xyz(x, y, this.s.ground(x, y)));
    }
  }
  dispose() {
    this.g.removeFromParent();
    this.g.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      o.geometry?.dispose();
      o.material?.dispose();
    });
  }
}
