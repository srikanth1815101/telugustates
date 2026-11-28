import { fieldMixer } from "./soundscape.js";
import { ACRE } from "./metres.js";
import * as T from "../vendor/three.module.min.js";
import { noise } from "./sky.js";
// Six actual cloud cards and six ground shadow ellipses use the same positions and sun direction.
export class WeatherFX {
  constructor(scene, env, tier, reduced) {
    this.group = new T.Group();
    scene.add(this.group);
    this.env = env;
    this.tier = tier;
    this.reduced = reduced;
    const u = env.uni;
    if (tier >= 1) {
      const mat = new T.ShaderMaterial({
        uniforms: u,
        side: T.DoubleSide,
        depthWrite: false,
        transparent: true,
        vertexShader:
          "varying vec2 q;void main(){q=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader: `varying vec2 q;uniform float uDay,uCloud;void main(){vec2 p=q*2.-1.;float edge=1.-smoothstep(.38,1.,dot(p,p)+.13*sin(p.x*11.+sin(p.y*7.))+.08*cos(p.y*15.));gl_FragColor=vec4(mix(vec3(.30,.34,.40),vec3(.82,.84,.81),uDay),edge*(.22+.42*uCloud));\n#include <colorspace_fragment>\n}`,
      });
      this.clouds = Array.from({ length: tier === 2 ? 6 : 3 }, (_, i) => {
        const m = new T.Mesh(new T.PlaneGeometry(1, 1), mat);
        m.renderOrder = 1;
        this.group.add(m);
        return m;
      });
    }
    // Two depth layers of oblique, wind-driven droplets. Animate a bounded static batch on the GPU.
    const n = reduced ? 68 : [240, 440, 680][tier],
      pos = [],
      seeds = [],
      uv = [],
      ix = [];
    for (let i = 0; i < n; i++) {
      const d = i % 4 === 0 ? 9 : 22,
        k = noise(i, 13);
      for (let j = 0; j < 4; j++) {
        pos.push(
          (noise(i, 11) - 0.5) * d,
          noise(i, 12) * 12,
          (noise(i, 15) - 0.5) * d,
        );
        seeds.push(k, noise(i, 17), d);
        uv.push(j % 2, Math.floor(j / 2));
      }
      const k0 = i * 4;
      ix.push(k0, k0 + 1, k0 + 2, k0 + 2, k0 + 1, k0 + 3);
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setAttribute("seed", new T.Float32BufferAttribute(seeds, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    g.setIndex(ix);
    this.ru = { t: { value: 0 }, r: { value: 0 }, w: { value: 0 } };
    this.rain = new T.Mesh(
      g,
      new T.ShaderMaterial({
        uniforms: this.ru,
        side: T.DoubleSide,
        transparent: true,
        depthWrite: false,
        vertexShader: `attribute vec3 seed;uniform float t,r,w;varying vec2 q;varying float a;void main(){q=uv;float speed=6.+seed.x*6.+2.*r;vec3 p=position;float fall=fract((p.y-t*speed)/12.);p.y=fall*12.-5.;float gust=.52+.21*sin(t*.67+seed.x*3.);p.x+=((.5-fall)*w*gust+sin(t+seed.x*8.)*.12);p.z+=.22*(1.-fall)*w;p+=vec3(-.11*w,.45+seed.y*.58,-.042*w)*(uv.y-.5);vec4 eye=modelViewMatrix*vec4(p,1.);eye.x+=(uv.x-.5)*(.012+.032*seed.y);a=(1.-smoothstep(r*.83,r+.06,seed.x))*(.42+.32*seed.y)*(1.-smoothstep(.88,1.,fall));gl_Position=projectionMatrix*eye;}`,
        fragmentShader: `varying vec2 q;varying float a;void main(){float tip=sin(3.14159*q.y);gl_FragColor=vec4(.76,.84,.86,a*tip*(1.-abs(2.*q.x-1.)));}`,
      }),
    );
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 4;
    this.group.add(this.rain);
  }
  update(cam, s, player, t, near) {
    const u = this.env.uni,
      w = this.env.weather;
    u.uCloudShadow.value = near && this.clouds ? w.wet * 0.94 : 0;
    if (!this.group.visible || !near) {
      this.group.visible = near;
      if (!near) return;
    }
    const sec = this.reduced ? 0 : t;
    this.clouds?.forEach((m, i) => {
      const size = 50 + noise(i, this.env.seed) * 49,
        adv = sec * w.wind * 0.9,
        baseX = Math.floor((cam.position.x + adv + 260) / 520) * 520,
        baseZ = Math.floor((cam.position.z + 260) / 520) * 520,
        x =
          baseX +
          ((((noise(i, 7, this.env.seed) * 520 - adv + 260) % 520) + 520) %
            520) -
          260,
        z = baseZ + noise(i, 3, this.env.seed) * 480 - 240,
        h = cam.position.y + 42 + noise(i, 4) * 38;
      m.position.set(x, h, z);
      m.rotation.set(-Math.PI * 0.41, 0, noise(i, 9) * 0.5);
      m.scale.set(size * 2.8, size, 1);
      u.uCloudPos.value[i].set(x, h, z, size);
    });
    this.rain.visible = w.precipitating;
    this.ru.r.value = w.rain;
    this.ru.w.value = w.wind;
    this.ru.t.value = this.reduced ? t * 0.43 : t;
    this.rain.position.copy(cam.position);
  }
  dispose() {
    const materials = new Set();
    this.group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) materials.add(o.material);
    });
    materials.forEach((m) => m.dispose());
    this.group.removeFromParent();
    this.env.uni.uCloudShadow.value = 0;
  }
}
// A single bounded pool for contact prints and rings, plus one small particle batch. No downloaded audio.
export class Tracks {
  constructor(scene, reduced) {
    this.scene = scene;
    this.reduced = reduced;
    this.mix = fieldMixer();
    this.seq = 0;
    this.blips = [];
    this.marks = [];
    this.counts = {};
    this.pos = new Float32Array(24 * 3);
    this.rgb = new Float32Array(24 * 3);
    const geo = new T.BufferGeometry();
    for (const [k, arr] of [
      ["position", this.pos],
      ["color", this.rgb],
    ])
      geo.setAttribute(k, new T.BufferAttribute(arr, 3));
    geo.setDrawRange(0, 0);
    this.dust = new T.Points(
      geo,
      new T.PointsMaterial({
        size: 0.065,
        vertexColors: true,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      }),
    );
    this.dust.frustumCulled = false;
    scene.add(this.dust);
    const make = (g, color) => {
      const m = new T.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          side: T.DoubleSide,
        }),
        batch = new T.InstancedMesh(g, m, 32);
      g.setAttribute(
        "contactFade",
        new T.InstancedBufferAttribute(new Float32Array(32), 1),
      );
      m.onBeforeCompile = (sh) => {
        sh.vertexShader =
          "attribute float contactFade;varying float vFade;\n" +
          sh.vertexShader.replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\n vFade=contactFade;",
          );
        sh.fragmentShader =
          "varying float vFade;\n" +
          sh.fragmentShader.replace(
            "#include <alphamap_fragment>",
            "#include <alphamap_fragment>\n diffuseColor.a*=vFade;",
          );
      };
      batch.count = 0;
      batch.frustumCulled = false;
      scene.add(batch);
      return batch;
    };
    this.print = make(new T.CircleGeometry(1, 8), 0x674c35);
    this.ring = make(new T.RingGeometry(0.92, 1, 24), 0xceece2);
    this.obj = new T.Object3D();

    this.tint = new T.Color();
  }
  unlock() {
    this.mix.unlock();
    this.audio = this.mix.ctx;
  }
  beat(pos, type, land = false, yaw = 0, rain = false) {
    const ctx = this.audio,
      seq = ++this.seq;
    this.counts[type] = (this.counts[type] || 0) + 1;
    this.mix.footstep(type, land, seq);
    if (this.reduced) return;
    if (["mud", "wet-mud", "water"].includes(type))
      this.marks.push({
        type,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        yaw,
        t: 0,
        ttl: type === "mud" ? 7 : 0.86,
      });
    if (this.marks.length > 32) this.marks.shift();
    if (
      (type === "mud" && !rain) ||
      (rain && type !== "water" && type !== "mud")
    )
      return;
    for (let i = 0; i < (land ? 6 : 2); i++)
      this.blips.push({
        x: pos.x,
        z: pos.z,
        h: pos.y + 0.015,
        dx: (noise(seq, i) - 0.5) * 0.76,
        dz: (noise(i, seq) - 0.5) * 0.76,
        t: 0,
        c:
          type === "mud"
            ? 0x684c32
            : type === "water"
              ? 0xb3ddd9
              : type === "leaves"
                ? 0x8b8c51
                : type === "grass"
                  ? 0xa0a16c
                  : 0xc4b697,
      });
  }
  update(dt) {
    const o = this.obj;
    this.blips = this.blips.filter((p) => p.t < 0.38).slice(-24);
    this.blips.forEach((p, i) => {
      p.t += dt;
      this.pos.set(
        [p.x + p.dx * p.t, p.h + p.t * (1.05 - 2.4 * p.t), p.z + p.dz * p.t],
        i * 3,
      );
      this.tint.setHex(p.c).toArray(this.rgb, i * 3);
    });
    for (const k of ["position", "color"])
      this.dust.geometry.attributes[k].needsUpdate = true;
    this.dust.geometry.setDrawRange(0, this.blips.length);
    this.marks = this.marks.filter((m) => m.t < m.ttl);
    this.print.count = this.ring.count = 0;
    for (const p of this.marks) {
      p.t += dt;
      const k = Math.min(1, p.t / p.ttl),
        isRing = p.type === "water",
        m = isRing ? this.ring : this.print,
        fade = 1 - k;
      const r = 0.08 + 0.47 * k;
      o.position.set(p.x, p.y, p.z);
      o.rotation.set(-Math.PI / 2, p.yaw, 0, "YXZ");
      o.scale.set(
        isRing ? r : 0.057 * (0.85 + 0.15 * fade),
        isRing ? r : 0.139 * (0.85 + 0.15 * fade),
        1,
      );
      o.updateMatrix();
      const alpha = m.geometry.attributes.contactFade;
      alpha.setX(m.count, fade);
      alpha.needsUpdate = true;
      m.setMatrixAt(m.count++, o.matrix);
      m.instanceMatrix.needsUpdate = true;
    }
  }
  dispose() {
    for (const b of [this.dust, this.print, this.ring]) {
      b.dispose?.();
      b.geometry.dispose();
      b.material.dispose();
      b.removeFromParent();
    }
    this.mix.dispose();
  }
}
