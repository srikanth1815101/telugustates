import { inCourt } from "./home-index.js";
import { bedStones } from "./moving-water.js";
import { trunkFootprint, meshShape } from "./contacts.js";
import { padDistance, clearApproach } from "./resident-scene.js";
import * as T from "../vendor/three.module.min.js";
import { limits, generate, U, habitat, noise } from "./habitats.js";
import {
  staticModel as model,
  loadPatch,
  assetID,
  rigInstance,
} from "./art-library.js";
let worker,
  failed = false,
  serial = 0;
const waits = new Map();
function plan(input) {
  if (failed || typeof Worker === "undefined")
    return Promise.resolve(generate(input));
  try {
    if (!worker) {
      worker = new Worker(new URL("./placement-worker.js", import.meta.url), {
        type: "module",
      });
      worker.onmessage = ({ data }) => {
        let f = waits.get(data.id);
        if (f) {
          waits.delete(data.id);
          f(data.patch);
        }
      };
      worker.onerror = () => {
        failed = true;
        worker.terminate();
        worker = null;
        for (const f of waits.values()) f(null);
        waits.clear();
      };
    }
    let id = ++serial;
    return new Promise((resolve) => {
      waits.set(id, (p) => resolve(p || generate(input)));
      worker.postMessage({ id, input });
    });
  } catch {
    failed = true;
    return Promise.resolve(generate(input));
  }
}
const next = () => new Promise((r) => requestAnimationFrame(r));
function fieldShader(uni, tier) {
  return new T.ShaderMaterial({
    uniforms: { ...uni, first: { value: 1 }, motion: { value: tier ? 1 : 0 } },
    vertexColors: true,
    side: T.DoubleSide,
    vertexShader: `attribute float sway;varying vec3 C;varying float fade;uniform float uClock,uDay,uFog,uWind,motion,first;uniform vec3 uSun,uHor;void main(){vec3 p=position;float ph=instanceColor.b*87.+instanceMatrix[3].x*.017+instanceMatrix[3].z*.012;p.x+=sway*.074*motion*uWind*sin(ph+uClock*(abs(sway)>1.?11.:1.6));p.y+=max(0.,abs(sway)-1.)*.13*motion*sin(ph+uClock*12.);vec4 mv=modelViewMatrix*(instanceMatrix*vec4(p,1.));mat3 I=mat3(instanceMatrix);vec3 N=normalize(mat3(cross(I[1],I[2]),cross(I[2],I[0]),cross(I[0],I[1]))*normal);float diff=max(0.,dot(N,uSun)),ambient=.64+.19*N.y;vec3 lit=color*instanceColor*(ambient+diff*vec3(.67,.55,.37)*uDay)*mix(.62,1.,uDay);float fog=1.-exp(-pow(max(0.,-mv.z)*uFog,2.));C=mix(lit,uHor,fog);fade=1.;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 C;varying float fade;void main(){gl_FragColor=vec4(C,1.);\n#include <colorspace_fragment>\n}`,
  });
}
const o = new T.Object3D(),
  cc = new T.Color(),
  fr = new T.Frustum(),
  mat = new T.Matrix4();
// A single terrain-conforming, feathered contact-shadow batch; no shadow map on Medium/Low.
function contactShade(s, items, presets, cx, cy, tier) {
  const p = [],
    alpha = [],
    idx = [];
  for (const it of items) {
    if (
      !["tree", "rock", "detail"].includes(it.kind) ||
      Math.hypot(cx - it.x, cy - it.y) > (tier ? 6 : 2.8)
    )
      continue;
    const tree = presets.trees[it.name],
      rad =
        (tree
          ? tree.height * tree.spread * 0.38
          : it.kind === "rock"
            ? 1.45
            : 0.7) * it.scale;
    if (rad < 0.4) continue;
    const k = alpha.length;
    for (let j = -1; j < 7; j++) {
      const a = (j * 6.283185) / 7,
        x = it.x + (j < 0 ? 0 : (Math.cos(a) * rad) / U),
        y = it.y + (j < 0 ? 0 : (Math.sin(a) * rad) / U);
      p.push(...s.xyz(x, y, s.ground(x, y) + 0.047));
      alpha.push(j < 0 ? 0.34 : 0);
      if (j >= 0) idx.push(k, k + 1 + j, k + 1 + ((j + 1) % 7));
    }
  }
  if (!idx.length) return null;
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(p, 3));
  g.setAttribute("shadeA", new T.Float32BufferAttribute(alpha, 1));
  g.setIndex(idx);
  return new T.Mesh(
    g,
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      vertexShader:
        "attribute float shadeA;varying float a;void main(){a=shadeA;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "varying float a;void main(){gl_FragColor=vec4(.17,.20,.13,a);}",
    }),
  );
}
export class EcologyScene {
  constructor(s, ec, rows, uniforms, tier, settings, previous = null) {
    this.previous = previous;
    this.actors = [];
    this.reuses = 0;
    this.ticks = 0;
    this.s = s;
    this.ec = ec;
    this.rows = rows;
    this.tier = tier;
    this.settings = settings;
    this.uniforms = uniforms;
    this.group = new T.Group();
    this.mat = fieldShader(uniforms, tier);
    this.bins = [];
    this.anim = [];
    this.statics = [];
    this.serial = 0;
    this.last = -100;
    this.t = 0;
    this.rebuilding = false;
    this.first = 0;
    this.disposed = false;
    this.visibleNames = [];
    this.counts = { animals: 0, small: 0 };
  }
  async build(x, y) {
    if (this.disposed) return;
    const id = ++this.serial,
      lim = limits[this.tier],
      r = lim.radius + 1,
      cells = [],
      s = this.s,
      rows = this.rows
        .filter(
          (a) =>
            a[5] &&
            Math.abs(a[5].centre[0] - x) < r + 3 &&
            Math.abs(a[5].centre[1] - y) < r + 3,
        )
        .map((a) => [...a[5].centre, a[5]]);
    for (let j = Math.floor(y) - r; j <= Math.floor(y) + r; j++)
      for (let i = Math.floor(x) - r; i <= Math.floor(x) + r; i++) {
        let c = s.t.at(i, j);
        if (c?.d) cells.push({ ...c, ...this.ec.at(i, j), x: i, y: j });
      }
    const input = {
      cells,
      homes: rows,
      roads: [],
      centre: [x, y],
      tier: this.tier,
      season: this.s.period || this.settings.season,
      time: this.settings.time,
      presets: this.ec.presets,
    };
    this.rebuilding = true;
    const patch = await plan(input);
    if (this.disposed || id !== this.serial) return;
    patch.static.push(...bedStones(s, x, y));
    const prev = () => this.previous?.() || this;
    // Retain the closest previously present population at overlapping tier/stream boundaries. Never reseed a live animal by array slot.
    const chosen = new Map(patch.life.map((v) => [v.id, v]));
    // At two marked field-guide locations reserve a few nearby, persistent animals. Their paths still pass the ordinary ground,
    // water and district exclusions. The placement is schematic and deterministic, not a claimed wildlife observation.
    for (const [ox, oy, yaw, name, hab, dist, lat, seed] of [
      [2505.5, 10078.5, 1.570796, "Spotted deer", "forest", 14, -2.6, 0.916],
      [2505.5, 10078.5, 1.570796, "Sambar", "forest", 21, 4, 0.318],
      [2549.125, 5571.625, 1.501878, "Egret", "shore", 9, 3, 0.821],
      [2549.125, 5571.625, 1.501878, "Shoal fish", "shallow", 16, 1.1, 0.512],
    ]) {
      if (Math.hypot(x - ox, y - oy) * U > 225) continue;
      const id = "field:" + name + ":" + ox;
      let found = false;
      for (const a of [
        yaw,
        yaw + 0.34,
        yaw - 0.34,
        yaw + 0.7,
        yaw - 0.7,
        yaw + 1.18,
        yaw - 1.18,
        yaw + 1.55,
        yaw - 1.55,
      ]) {
        for (const l of [dist, dist * 0.71, dist * 1.32]) {
          const X = ox + (-Math.sin(a) * l + Math.cos(a) * lat) / U,
            Y = oy + (Math.cos(a) * l + Math.sin(a) * lat) / U,
            v = {
              id,
              kind: "animal",
              name,
              hab,
              dom: false,
              homeD: 1e8,
              x: X,
              y: Y,
              seed,
              tint: seed,
              rotation: yaw + 1.57,
              scale: 1,
            };
          if (!this.permitted(v, X, Y)) continue;
          if (
            patch.static.some(
              (t) =>
                t.kind === "tree" && Math.hypot(t.x - X, t.y - Y) * U < 1.2,
            )
          )
            continue;
          chosen.set(id, v);
          found = true;
          break;
        }
        if (found) break;
      }
    }
    const old = prev();
    for (const v of old.anim) {
      if (
        !chosen.has(v.id) &&
        Math.hypot(v.x - x, v.y - y) * U < 75 &&
        this.permitted(v, v.x, v.y)
      )
        chosen.set(v.id, { ...v, x: v.hx, y: v.hy });
    }
    const rank = (a, b) =>
      Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y);
    const wildlife = [...chosen.values()].sort(rank);
    const fauna = [
      ...wildlife.filter((v) => v.hab !== "air").slice(0, lim.animal),
      ...wildlife.filter((v) => v.hab === "air").slice(0, lim.small),
    ];
    await loadPatch([
      { kind: "tree", name: "Guava" },
      ...patch.static,
      ...fauna,
    ]);
    if (this.disposed || id !== this.serial) return;
    const bins = new Map(),
      pieces = [],
      dyn = [];
    let tick = performance.now();
    for (const v of [...patch.static, ...fauna]) {
      if (inCourt(s, v.x, v.y, v.kind === "tree" ? 2.6 : 1.4)) continue;
      if (
        v.kind !== "animal" &&
        clearApproach(s, v.x, v.y, v.kind === "tree" ? 2.7 : 1.8)
      )
        continue;
      const hit = s.sample(v.x, v.y);
      if (
        v.kind !== "animal" &&
        s.tread?.hit(
          v.x,
          v.y,
          v.kind === "rock" ? 2 * v.scale : v.kind === "tree" ? 1.3 : 0,
        )?.wear > 0
      )
        continue;
      if (!hit.drawn || ((v.water || v.hab === "water") && hit.depth < 0.09))
        continue;
      if (
        (v.kind === "tree" || v.kind === "detail") &&
        hit.depth > 0.16 &&
        v.name !== "Mangrove"
      )
        continue;
      if (v.kind === "animal" && !this.permitted(v, v.x, v.y)) continue;
      v.hx = v.x;
      v.hy = v.y;
      v.phase = v.seed * 2 * Math.PI;
      v.world = s.xyz(v.x, v.y, this.elevation(v, v.x, v.y));
      if (v.kind === "animal") {
        v.asset = assetID(v.kind, v.name);
        v.gait = v.seed;
        v.travel = 0;
        v.turn = v.rotation;
        v.avoid = 0;
        v.action = "wander";
        v.radius = Math.max(
          0.16,
          this.ec.presets.animals[v.name].height * v.scale * 1.65,
        );
        dyn.push(v);
        continue;
      }
      let key = [v.kind, v.name, v.lod || 0, v.lith || 0].join("|"),
        batch = bins.get(key);
      if (!batch) {
        batch = {
          key,
          geom: model(v.kind, v.name, this.ec.presets, v.lod || 0, v.lith || 0),
          a: [],
          dynamic: false,
          name: v.name,
          kind: v.kind,
        };
        if (!batch.geom) throw Error("Missing placement binding: " + key);
        bins.set(key, batch);
      }
      if (v.kind === "tree") v.trunk = trunkFootprint(batch.geom);
      if (["tree", "rock", "detail"].includes(v.kind))
        v.meshShape = meshShape(batch.geom, v.kind, v.scale);
      v.radius = Math.max(
        0.28,
        batch.geom.boundingSphere.radius * 1.95 * v.scale,
      );
      // The lower trunk / actual rock hull is the obstacle, not a tree's broad canopy.
      if (s.ways && v.meshShape?.polygon?.length) {
        const radius =
          Math.max(...v.meshShape.polygon.map((p) => Math.hypot(...p))) *
          v.scale;
        if (
          !s.ways.clear(v.x, v.y, radius) ||
          inCourt(s, v.x, v.y, radius + 0.4)
        )
          continue;
      }
      batch.a.push(v);
      if (performance.now() - tick > 5) {
        await next();
        if (this.disposed || id !== this.serial) return;
        tick = performance.now();
      }
    }
    for (const b of bins.values()) {
      if (!b.a.length) continue;
      const mesh = new T.InstancedMesh(b.geom, this.mat, b.a.length);
      mesh.frustumCulled = false;
      mesh.castShadow =
        this.tier === 2 &&
        !b.dynamic &&
        b.a.some((v) => !v.lod) &&
        b.kind === "tree";
      mesh.userData.role = "ecology-" + b.kind;
      mesh.userData.ecology = true;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      b.mesh = mesh;
      pieces.push(b);
      for (let k = 0; k < b.a.length; k++) {
        this.pose(b.a[k], mesh, k);
      }
    }
    const prior = prev(),
      oldByID = new Map(prior.anim.map((v) => [v.id, v]));
    this.t = prior.t;
    this.reuses = 0;
    for (const v of dyn) {
      const old = oldByID.get(v.id);
      if (old && this.permitted(v, old.x, old.y)) {
        for (const k of [
          "x",
          "y",
          "gait",
          "rotation",
          "turn",
          "travel",
          "avoid",
          "action",
          "speed",
          "step",
        ])
          v[k] = old[k];
        this.reuses++;
      }
      v.world = s.xyz(v.x, v.y, this.elevation(v, v.x, v.y));
    }
    this.clear();
    this.shade = contactShade(
      s,
      pieces.filter((b) => !b.dynamic).flatMap((b) => b.a),
      this.ec.presets,
      x,
      y,
      this.tier,
    );
    if (this.shade) this.group.add(this.shade);
    this.bins = pieces;
    this.anim = dyn;
    this.statics = pieces.filter((b) => !b.dynamic).flatMap((b) => b.a);
    for (const b of pieces) this.group.add(b.mesh);
    this.actors = dyn.map((v) => {
      const R = rigInstance(v.asset);
      this.group.add(R.g);
      R.g.userData.role = "wildlife";
      const base = R.d.height,
        h = this.ec.presets.animals[v.name].height;
      R.g.scale.setScalar(
        v.scale * (v.hab === "deep" || v.hab === "shallow" ? 1 : h / base),
      );
      R.g.position.fromArray(v.world);
      R.g.rotation.y = v.rotation;
      v.screen = false;
      R.sample(R.d.clips.swim ? "swim" : "walk", v.gait);
      R.commit();
      return { R, v };
    });
    this.first = 1;
    this.last = -100;
    this.rebuilding = false;
    this.centre = [x, y];
  }
  waterOK(x, y, deep = false) {
    const c = this.s.t.at(x, y);
    if (!c?.d || ![3, 4].includes(c.c)) return false;
    if (deep)
      return (
        c.c === 3 &&
        this.ec.at(x, y).depth >= 2 &&
        this.s.field(Math.floor(x), Math.floor(y)).water >= 0.99 &&
        this.s.waterline(x, y) - this.s.ground(x, y) > 0.35
      );
    return this.s.sample(x, y).depth > 0.065;
  }
  shallowOK(x, y) {
    const s = this.s;
    return (
      s.t.at(x, y)?.c === 3 &&
      s.field(Math.floor(x), Math.floor(y)).water < 1 &&
      s.waterline(x, y) - s.ground(x, y) > 0.09
    );
  }
  elevation(v, x, y) {
    if (v.hab === "deep" || v.hab === "shallow")
      return (
        this.s.waterline(x, y) -
        Math.min(0.24, Math.max(0.045, this.s.sample(x, y).depth * 0.48))
      ); // keep the actual fish below the rendered sheet
    if (v.water || v.hab === "water")
      return this.s.waterline(x, y) + (v.kind === "plant" ? 0.035 : -0.09);
    let z = this.s.ground(x, y);
    if (v.hab === "air" || ["Gull", "Tern", "Kingfisher"].includes(v.name))
      z += ["Eagle", "Kite", "Gull", "Tern"].includes(v.name)
        ? 11 + v.seed * 16
        : ["Crow", "Parakeet", "Bat"].includes(v.name)
          ? 4 + v.seed * 7
          : 1 + v.seed;
    return z;
  }
  pose(v, m, k) {
    if (v.matrix) {
      m.instanceMatrix.array.set(v.matrix, k * 16);
      m.instanceColor.array.set(v.color, k * 3);
      return;
    }
    o.position.fromArray(v.world);
    o.rotation.set(0, v.rotation, 0);
    const sc = v.scale;
    // A rigid instance, including on steep banks. Only the buried root band in the model enters the soil.
    o.scale.setScalar(sc);
    o.updateMatrix();
    m.setMatrixAt(k, o.matrix);
    const dry = (this.s.period || this.settings.season) === "summer",
      f = 0.9 + v.tint * 0.18;
    cc.setRGB(
      f * (dry ? 1.065 : 1),
      f * (0.965 + v.seed * 0.095),
      f * (dry ? 0.83 : 0.89 + v.tint * 0.1),
    );
    m.setColorAt(k, cc);
    if (v.kind !== "animal") {
      v.matrix = new Float32Array(o.matrix.elements);
      v.color = [cc.r, cc.g, cc.b];
    }
  }
  permitted(v, x, y) {
    if (inCourt(this.s, x, y, 2)) return false;
    const s = this.s,
      c = s.t.at(x, y),
      i = Math.floor(x),
      j = Math.floor(y);
    if (!c?.d || !s.sample(x, y).drawn) return false;
    if (v.hab === "shallow") return this.shallowOK(x, y);
    if (v.hab === "water" || v.hab === "deep")
      return this.waterOK(x, y, v.hab === "deep");
    if (s.sample(x, y).depth > 0.12 && v.hab !== "air") return false;
    if (v.hab === "shore")
      return [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([a, b]) => [3, 4].includes(s.t.at(i + a, j + b)?.c));
    if (v.hab !== "air" && habitat({ ...c, ...this.ec.at(x, y) }) !== v.hab)
      return false;
    return true;
  }
  advanceLife(dt, x, y, range, reduced, cam) {
    const names = new Set();
    let an = 0,
      sm = 0;
    this.ticks++;
    const eye = cam.position.clone();
    this.group.worldToLocal(eye);
    for (const { v, R } of this.actors) {
      const dist = Math.hypot(v.x - x, v.y - y) * U,
        fish = ["shallow", "deep"].includes(v.hab),
        air =
          v.hab === "air" || ["Gull", "Tern", "Kingfisher"].includes(v.name),
        wet = fish || v.hab === "water",
        h = this.ec.presets.animals[v.name].height;
      // Smooth bounded steering with alternatives when the preferred heading hits a water/land/mask edge.
      let dir = v.phase + this.t * (air ? 0.19 : fish ? 0.14 : 0.106),
        rx = (v.hx - v.x) * U,
        ry = (v.hy - v.y) * U,
        roam = air ? 15 : fish ? 7 : 10;
      let dx = Math.sin(dir) * roam + rx,
        dy = Math.cos(dir) * roam + ry,
        speed = air
          ? h > 0.5
            ? 3.3
            : 1.08
          : fish
            ? 0.82
            : wet
              ? 0.7
              : Math.min(1.38, Math.max(0.36, h * 1.05)),
        flee = !wet && !air && dist < 13;
      const shelter = this.s.storm && !wet && !air && !flee;
      if (shelter) {
        if (!v.shelter) {
          let dist = Infinity;
          for (const tree of this.statics) {
            if (tree.kind !== "tree") continue;
            const m = Math.hypot(tree.x - v.hx, tree.y - v.hy);
            if (m < dist && m < 0.55) {
              dist = m;
              v.shelter = [tree.x, tree.y];
            }
          }
        }
        if (v.shelter) {
          dx = (v.shelter[0] - v.x) * U;
          dy = (v.shelter[1] - v.y) * U;
          speed = Math.hypot(dx, dy) > 2.5 ? speed * 0.78 : 0.005;
        } else speed *= 0.24;
      } else if (this.s.isNight && !air && !wet && !flee) speed *= 0.4;
      if (flee) {
        dx = (v.x - x) * U;
        dy = (v.y - y) * U;
        speed = Math.min(3.1, Math.max(0.93, h * 2.4));
      }
      let target = Math.atan2(-dx, dy);
      if (v.avoid > 0) {
        target = v.turn;
        v.avoid -= dt;
      }
      let rate = air ? 2.9 : 2.65;
      let rot =
        v.rotation +
        Math.atan2(
          Math.sin(target - v.rotation),
          Math.cos(target - v.rotation),
        ) *
          (1 - Math.exp(-rate * dt));
      let nx,
        ny,
        ok = false;
      for (const off of [0, 0.73, -0.73, 1.52, -1.52, 2.47, -2.47, Math.PI]) {
        const a = rot + off;
        nx = v.x - (Math.sin(a) * speed * dt) / U;
        ny = v.y + (Math.cos(a) * speed * dt) / U;
        if (this.permitted(v, nx, ny)) {
          ok = true;
          rot = a;
          if (off) {
            v.turn = a;
            v.avoid = 1.5;
          }
          break;
        }
      }
      const walk = ok ? Math.hypot(nx - v.x, ny - v.y) * U : 0;
      if (ok) {
        v.x = nx;
        v.y = ny;
        v.rotation = rot;
      }
      v.travel += walk;
      v.speed = dt > 0 ? walk / dt : 0;
      v.action = shelter
        ? "shelter"
        : !ok
          ? "pause at habitat edge"
          : air
            ? "fly"
            : fish || wet
              ? "swim"
              : flee
                ? "flee"
                : "wander";
      v.gait =
        (v.gait +
          (air || fish
            ? dt * (air ? 1.65 : 0.97)
            : walk / Math.max(0.5, h * (flee ? 1.3 : 1.08)))) %
        1;
      const extra = air && !reduced ? 0.11 * Math.sin(this.t * 2 + v.phase) : 0;
      v.world = this.s.xyz(v.x, v.y, this.elevation(v, v.x, v.y) + extra);
      R.g.position.fromArray(v.world);
      R.g.rotation.y = v.rotation;
      const metres = R.g.position.distanceTo(eye),
        projected =
          (h *
            v.scale *
            (cam.isPerspectiveCamera
              ? (0.5 * (typeof innerHeight === "number" ? innerHeight : 740)) /
                Math.tan((cam.fov * Math.PI) / 360)
              : 850)) /
          Math.max(1, metres);
      const show =
        range < 655 &&
        dist < (v.screen ? 259 : 245) &&
        projected > (v.screen ? 0.85 : 1.32) &&
        fr.planes.every(
          (p) =>
            p.normal.x * v.world[0] +
              p.normal.y * (v.world[1] + h * 0.38) +
              p.normal.z * v.world[2] +
              p.constant >=
            -v.radius * 1.6,
        );
      R.g.visible = v.screen = show;
      if (!show) continue;
      const clip = fish
        ? "swim"
        : v.speed < 0.02 && !air
          ? "stand"
          : flee
            ? "run"
            : "walk";
      R.sample(clip, v.gait);
      R.commit();
      v.step = clip;
      names.add(v.name);
      if (v.hab === "air") sm++;
      else an++;
    }
    this.visibleNames = [...names];
    this.counts = { animals: an, small: sm };
  }
  update(dt, x, y, cam, range, reduced) {
    dt = Math.min(0.24, Math.max(0, dt));
    this.t += dt;
    this.group.visible = range < 9200;
    if (!this.group.visible) return;
    this.mat.uniforms.motion.value = !reduced && this.tier ? 1 : 0;
    this.group.updateWorldMatrix(true, false);
    fr.setFromProjectionMatrix(
      mat
        .multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
        .multiply(this.group.matrixWorld),
    );
    this.advanceLife(dt, x, y, range, reduced, cam);
    // Only static draw-list compaction is throttled. Animals have independent transforms and one opaque skinned draw each.
    if (
      this.t - this.last < 0.095 &&
      this.lastCam &&
      this.lastCam.angleTo(cam.quaternion) < 0.035
    )
      return;
    this.last = this.t;
    this.lastCam ??= new T.Quaternion();
    this.lastCam.copy(cam.quaternion);
    let trees = new Set(),
      plants = new Set(),
      rocks = new Set();
    for (const b of this.bins) {
      const far = range > 640,
        mid = range > 110;
      if ((b.kind === "plant" || b.kind === "detail") && far) {
        b.mesh.visible = false;
        continue;
      }
      if (b.kind === "tree") {
        const v = b.a[0];
        b.mesh.geometry = model(
          b.kind,
          b.name,
          this.ec.presets,
          far ? 2 : mid ? Math.max(1, v.lod || 0) : v.lod || 0,
          v.lith || 0,
        );
      }
      let ix = 0;
      for (const v of b.a) {
        const [X, Y, Z] = v.world;
        if (
          !fr.planes.every(
            (p) =>
              p.normal.x * X +
                p.normal.y * (Y + v.radius * 0.33) +
                p.normal.z * Z +
                p.constant >=
              -v.radius,
          )
        )
          continue;
        if (b.kind === "tree") trees.add(v.name);
        else if (b.kind === "plant") plants.add(v.name);
        else if (b.kind === "rock") rocks.add(v.name);
        this.pose(v, b.mesh, ix++);
      }
      b.mesh.count = ix;
      b.mesh.visible = ix > 0;
      b.mesh.instanceMatrix.needsUpdate = true;
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
    }
    this.visibleTrees = [...trees];
    this.visiblePlants = [...plants];
    this.visibleRocks = [...rocks];
  }
  audit() {
    const bad = [];
    let grounded = 0,
      wet = 0;
    for (const v of this.anim) {
      if (!this.permitted(v, v.x, v.y)) bad.push([v.name, "exclusion"]);
      const air =
        v.hab === "air" || ["Gull", "Tern", "Kingfisher"].includes(v.name);
      if (["deep", "shallow", "water"].includes(v.hab)) {
        wet++;
      } else if (!air) {
        grounded++;
        if (Math.abs(v.world[1] - this.s.ground(v.x, v.y)) > 0.035)
          bad.push([v.name, "anchor above/below rendered surface"]);
      }
    }
    return { checked: this.anim.length, grounded, water: wet, violations: bad };
  }
  // Check visible patch placements, not just the source class in a placement plan.
  auditTerrain() {
    let trees = 0,
      waterPlants = 0,
      worstRoot = 0,
      missing = 0;
    for (const v of this.statics) {
      const q = this.s.sample(v.x, v.y);
      if (!q.drawn) missing++;
      if (v.kind === "tree") {
        trees++;
        worstRoot = Math.max(worstRoot, Math.abs(v.world[1] - q.z));
      }
      if (v.water) {
        waterPlants++;
        if (q.depth < 0.09) missing++;
      }
    }
    return { trees, waterPlants, missing, maxRootDatumError: worstRoot };
  }
  clear() {
    for (const { R } of this.actors) R.dispose();
    this.actors = [];
    if (this.shade) {
      this.shade.removeFromParent();
      this.shade.geometry.dispose();
      this.shade.material.dispose();
      this.shade = null;
    }
    for (const b of this.bins) {
      this.group.remove(b.mesh);
      b.mesh.dispose();
    }
    this.bins = [];
  }
  dispose() {
    this.disposed = true;
    this.serial++;
    this.clear();
    this.group.removeFromParent();
    this.mat.dispose();
  }
}
