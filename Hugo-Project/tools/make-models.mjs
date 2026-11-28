// Phase 2 asset pipeline: builds every game model procedurally with
// three.js in headless Chromium, exports GLBs + baked item icons, then
// compresses each GLB with gltf-transform (meshopt). Models are CC0
// project artwork — see docs/ART-DIRECTION.md §4. Re-run after changing
// model-spec.mjs or the builders below; check-assets.mjs verifies the
// output in CI.
//   node Hugo-Project/tools/make-models.mjs
// @ts-check
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, extname, normalize } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { dedup, prune, meshopt } from "@gltf-transform/functions";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptEncoder } from "meshoptimizer";
import { MODELS, KIND_MODEL, BUDGET } from "./model-spec.mjs";

const here = new URL(".", import.meta.url).pathname;
const root = join(here, "..", "..");
const staticRoot = join(root, "Hugo-Project", "static");
const modelDir = join(staticRoot, "assets", "models");
const iconDir = join(staticRoot, "assets", "icons");
const LICENSES = join(staticRoot, "assets", "LICENSES.json");
const PORT = 4587;

/* ------------------------------------------------------------------ *
 * Model builders (mirror docs/ART-DIRECTION.md palette, flat-shaded
 * low-poly; wheel pivots + crop stages follow tools/model-spec.mjs).
 * ------------------------------------------------------------------ */
const BUILDERS = /* JavaScript */ `
const P = { terracotta:0xc05a3e, roof:0xb5462f, turmeric:0xe8a317, leaf:0x4c8b3f,
  indigo:0x2d5f7c, cream:0xf7efd9, mud:0xd9c9a3, ink:0x1d2b22, wood:0x8d6748,
  woodDark:0x6b4a2f, thatch:0xcbb26a, stone:0x9aa7b0, hide:0xb9a06a,
  cow:0xefe6d2, black:0x17181c, white:0xf2efe4, red:0xc0532e, skin:0xc98d5e };
const mat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const mesh = (geo, c, name) => { const m = new THREE.Mesh(geo, mat(c)); m.name = name || ""; return m; };
const box = (w,h,d,c,n) => mesh(new THREE.BoxGeometry(w,h,d), c, n);
const cyl = (rt,rb,h,c,n,seg=10) => mesh(new THREE.CylinderGeometry(rt,rb,h,seg), c, n);
const sph = (r,c,n) => mesh(new THREE.SphereGeometry(r,6,4), c, n);
const cone = (r,h,c,n) => mesh(new THREE.ConeGeometry(r,h,8), c, n);
const put = (m,x,y,z,rx,ry,rz) => { m.position.set(x,y,z);
  if (rx!=null) m.rotation.x = rx; if (ry!=null) m.rotation.y = ry; if (rz!=null) m.rotation.z = rz; return m; };
const G = (name, kids) => { const g = new THREE.Group(); g.name = name;
  for (const k of kids) g.add(k); return g; };

function buggy() {
  const wheels = [];
  for (const [nm, x, z] of [["wheel_fl",0.78,1.05], ["wheel_fr",-0.78,1.05],
                            ["wheel_rl",0.78,-1.05], ["wheel_rr",-0.78,-1.05]]) {
    const tire = put(cyl(0.34,0.34,0.22,P.black,null,12), 0,0,0, 0,0,Math.PI/2);
    const hub  = put(cyl(0.13,0.13,0.24,P.stone,null,10), 0,0,0, 0,0,Math.PI/2);
    wheels.push(G(nm, [tire, hub]).translateX(x).translateY(-0.5).translateZ(z));
  }
  const seat = G("seat", [
    put(box(0.95,0.16,0.6,P.wood), 0,0.3,-0.2),
    put(box(0.95,0.5,0.12,P.wood), 0,0.55,-0.48, -0.15,0,0)]);
  const wheelBar = put(cyl(0.04,0.04,0.42,P.ink,null,8), 0,0.45,0.5, 1.1,0,0);
  const wheelRing = put(mesh(new THREE.TorusGeometry(0.17,0.03,6,14), P.ink), 0,0.62,0.62, 0.6,0,0);
  const steering = G("steering", [wheelBar, wheelRing]);
  return G("buggy", [
    box(1.3,0.3,2.4,P.terracotta,"chassis").translateY(0.05),
    put(box(1.1,0.26,0.7,P.roof,"hood"), 0,0.33,0.78),
    put(box(0.9,0.1,0.3,P.woodDark), 0,0.18,-0.95),
    put(box(0.18,0.12,0.06,P.turmeric), 0.4,0.3,1.2),
    put(box(0.18,0.12,0.06,P.turmeric), -0.4,0.3,1.2),
    seat, steering, ...wheels]);
}
function fence() { return G("fence", [
  put(box(0.12,1,0.12,P.wood), -0.8,0.5,0), put(box(0.12,1,0.12,P.wood), 0,0.5,0),
  put(box(0.12,1,0.12,P.wood), 0.8,0.5,0),
  put(box(1.84,0.1,0.08,P.wood), 0,0.32,0), put(box(1.84,0.1,0.08,P.wood), 0,0.72,0)]); }
function cot() { return G("cot", [
  put(cyl(0.05,0.05,0.45,P.woodDark,null,8), 0.9,0.22,0.5),
  put(cyl(0.05,0.05,0.45,P.woodDark,null,8), -0.9,0.22,0.5),
  put(cyl(0.05,0.05,0.45,P.woodDark,null,8), 0.9,0.22,-0.5),
  put(cyl(0.05,0.05,0.45,P.woodDark,null,8), -0.9,0.22,-0.5),
  box(2,0.08,1.2,P.wood).translateY(0.48),
  put(box(1.94,0.05,1.14,P.cream), 0,0.54,0),
  put(box(0.44,0.12,0.5,P.turmeric), -0.6,0.62,0)]); }
function shed() { return G("shed", [
  put(box(3,2,2.4,P.mud), 0,1,0),
  put(box(3.4,0.14,2.9,P.roof), 0,2.2,0.1, -0.14,0,0),
  put(box(0.85,1.5,0.08,P.woodDark), 0,0.75,1.22),
  put(box(0.5,0.5,0.06,P.indigo), 1,1.4,1.22)]); }
function well() { return G("well", [
  put(cyl(1,1,0.9,P.stone,null,14), 0,0.45,0),
  put(cyl(1.08,1.08,0.14,P.wood,null,14), 0,0.95,0),
  put(box(0.09,1.3,0.09,P.woodDark), 0.7,1.6,0), put(box(0.09,1.3,0.09,P.woodDark), -0.7,1.6,0),
  put(box(1.7,0.1,1.2,P.thatch), 0,2.3,0, -0.2,0,0),
  put(cyl(0.16,0.13,0.26,P.wood,null,8), 0,1.5,0),
  put(box(0.03,0.5,0.03,P.ink), 0,1.9,0)]); }
function threshing() { return G("threshing", [
  put(cyl(1.5,1.5,0.1,P.thatch,null,16), 0,0.05,0),
  put(cyl(1.56,1.56,0.07,P.wood,null,16), 0,0.04,0),
  put(box(0.5,0.4,0.34,P.cream), 1.3,0.27,0.4, 0,0.4,0),
  put(box(0.44,0.36,0.3,P.mud), 1.1,0.23,-0.6, 0,-0.3,0)]); }
function stall() {
  const strips = [];
  for (let i = 0; i < 5; i++)
    strips.push(put(box(0.5,0.34,0.05, i%2 ? P.cream : P.terracotta),
      -1.04 + i*0.52, 1.95, 0.85));
  return G("stall", [
    put(box(0.1,2.2,0.1,P.woodDark), 1.15,1.1,0.7),
    put(box(0.1,2.2,0.1,P.woodDark), -1.15,1.1,0.7),
    put(box(0.1,2.2,0.1,P.woodDark), 1.15,1.1,-0.7),
    put(box(0.1,2.2,0.1,P.woodDark), -1.15,1.1,-0.7),
    put(box(2.5,0.12,0.85,P.wood), 0,0.95,0.45),
    put(box(2.5,0.5,0.08,P.woodDark), 0,0.65,0.86),
    put(box(2.8,0.1,1.9,P.terracotta), 0,2.3,0, -0.24,0,0),
    ...strips,
    put(box(0.4,0.26,0.34,P.leaf), -0.6,1.14,0.45),
    put(box(0.36,0.24,0.3,P.turmeric), 0.1,1.13,0.5, 0,0.3,0),
    put(sph(0.16,P.red), 0.7,1.17,0.45)]); }
function cow() { return G("cow", [
  put(box(0.66,0.66,1.3,P.cow), 0,0.78,0),
  put(box(0.36,0.38,0.44,P.wood), 0,0.98,0.82),
  put(box(0.3,0.16,0.2,P.woodDark), 0,0.86,1.02),
  put(cone(0.05,0.18,P.cream), 0.13,1.2,0.76, 0,0,-0.5),
  put(cone(0.05,0.18,P.cream), -0.13,1.2,0.76, 0,0,0.5),
  put(box(0.1,0.07,0.02,P.ink), 0.1,1.02,1.05),
  put(box(0.1,0.07,0.02,P.ink), -0.1,1.02,1.05),
  put(cyl(0.06,0.05,0.55,P.woodDark,null,7), 0.22,0.28,0.45),
  put(cyl(0.06,0.05,0.55,P.woodDark,null,7), -0.22,0.28,0.45),
  put(cyl(0.06,0.05,0.55,P.woodDark,null,7), 0.22,0.28,-0.45),
  put(cyl(0.06,0.05,0.55,P.woodDark,null,7), -0.22,0.28,-0.45),
  put(box(0.4,0.3,0.06,P.ink), 0,0.86,-0.66),
  put(box(0.3,0.18,0.24,P.hide), 0,0.5,0.15)]); }
function goat() { return G("goat", [
  put(box(0.4,0.42,0.8,P.hide), 0,0.62,0),
  put(box(0.24,0.26,0.3,P.wood), 0,0.8,0.52),
  put(cone(0.04,0.22,P.woodDark), 0.08,0.98,0.46, -0.6,0,-0.3),
  put(cone(0.04,0.22,P.woodDark), -0.08,0.98,0.46, -0.6,0,0.3),
  put(box(0.07,0.05,0.02,P.ink), 0.07,0.84,0.68),
  put(box(0.07,0.05,0.02,P.ink), -0.07,0.84,0.68),
  put(cyl(0.045,0.04,0.42,P.woodDark,null,7), 0.12,0.21,0.28),
  put(cyl(0.045,0.04,0.42,P.woodDark,null,7), -0.12,0.21,0.28),
  put(cyl(0.045,0.04,0.42,P.woodDark,null,7), 0.12,0.21,-0.28),
  put(cyl(0.045,0.04,0.42,P.woodDark,null,7), -0.12,0.21,-0.28),
  put(box(0.06,0.14,0.05,P.cream), 0,0.72,-0.42)]); }
function chicken() { return G("chicken", [
  put(box(0.24,0.26,0.36,P.white), 0,0.3,0),
  put(box(0.14,0.16,0.14,P.white), 0,0.5,0.2),
  put(box(0.06,0.08,0.04,P.red), 0,0.6,0.18),
  put(cone(0.03,0.1,P.turmeric), 0,0.52,0.3, Math.PI/2,0,0),
  put(box(0.05,0.18,0.06,P.white), 0.14,0.3,0, 0,0,0.4),
  put(box(0.05,0.18,0.06,P.white), -0.14,0.3,0, 0,0,-0.4),
  put(cone(0.06,0.16,P.white), 0,0.32,-0.24, -1.4,0,0),
  put(cyl(0.02,0.02,0.16,P.turmeric,null,6), 0.06,0.11,0.04),
  put(cyl(0.02,0.02,0.16,P.turmeric,null,6), -0.06,0.11,0.04)]); }
function hoe() { return G("hoe", [
  put(cyl(0.026,0.03,1.4,P.wood,null,8), 0,0.7,0, 0,0,0.16),
  put(box(0.2,0.03,0.3,P.stone), 0.16,1.36,0.06, 0.5,0,0.16)]); }
function sickle() { return G("sickle", [
  put(cyl(0.026,0.03,0.9,P.wood,null,8), 0,0.45,0),
  put(mesh(new THREE.TorusGeometry(0.26,0.028,6,12,Math.PI*0.8), P.stone),
    0.1,0.95,0, 0,0,-0.5)]); }
function rod() { return G("rod", [
  put(cyl(0.02,0.02,1.6,P.wood,null,7), 0,0.8,0, 0,0,0.22),
  put(sph(0.05,P.turmeric), 0.34,1.56,0),
  put(box(0.02,0.34,0.02,P.cream), 0.34,1.36,0),
  put(box(0.09,0.05,0.02,P.red), 0.34,1.18,0)]); }
function hammer() { return G("hammer", [
  put(cyl(0.028,0.032,0.8,P.wood,null,8), 0,0.4,0),
  put(box(0.3,0.14,0.14,P.stone), 0,0.82,0)]); }
function can() { return G("can", [
  put(cyl(0.17,0.19,0.34,P.indigo,null,12), 0,0.17,0),
  put(cyl(0.06,0.06,0.08,P.indigo,null,8), 0,0.38,0),
  put(cyl(0.035,0.05,0.3,P.indigo,null,7), 0.2,0.3,0, 0,0,-0.9),
  put(mesh(new THREE.TorusGeometry(0.14,0.02,6,12,Math.PI), P.stone), 0,0.36,0, 0,0,0)]); }
function seeds() { return G("seeds", [
  put(cyl(0.15,0.11,0.24,P.terracotta,null,10), 0,0.12,0),
  put(cyl(0.16,0.16,0.04,P.woodDark,null,10), 0,0.26,0),
  put(sph(0.03,P.turmeric), 0.05,0.29,0.03),
  put(sph(0.03,P.leaf), -0.04,0.29,0.04),
  put(sph(0.03,P.turmeric), 0.01,0.29,-0.05)]); }

function cropStage(kind, stage) {
  const green = kind === "chilli" ? 0x3f7a33 : 0x4c8b3f;
  const g = new THREE.Group(); g.name = "stage" + stage;
  if (stage === 0) {
    g.add(put(cyl(0.42,0.46,0.07,0x7a5c3e,null,10), 0,0.035,0));
    g.add(put(box(0.05,0.08,0.05,green), 0.1,0.1,0.06));
    g.add(put(box(0.05,0.08,0.05,green), -0.12,0.1,-0.02));
    return g;
  }
  const h = [0, 0.2, 0.45, 0.8][stage];
  const blades = stage === 1 ? 6 : stage === 2 ? 9 : 13;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + i * 0.7;
    const r = 0.1 + (i % 3) * 0.13;
    const b = box(0.05, h, 0.05, green);
    put(b, Math.cos(a)*r, h/2 + 0.04, Math.sin(a)*r, (i%2?0.12:-0.12), a, (i%3?0.1:-0.1));
    g.add(b);
  }
  if (stage === 3) {
    const head = kind === "paddy" ? P.turmeric : kind === "ragi" ? 0x8d6748
      : kind === "chilli" ? P.red : kind === "cotton" ? P.white : P.leaf;
    if (kind === "chilli") {
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3;
        g.add(put(cone(0.04,0.18,head), Math.cos(a)*0.2, 0.5, Math.sin(a)*0.2, Math.PI,0,0.4));
      }
    } else if (kind === "vegetable") {
      g.add(put(cone(0.1,0.3,0xe07a2f), 0,0.14,0, Math.PI,0,0));
      g.add(put(sph(0.12,P.leaf), 0,0.42,0));
    } else {
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05;
        g.add(put(sph(0.06,head), Math.cos(a)*0.16, h*0.92, Math.sin(a)*0.16));
      }
    }
  }
  return g;
}
function cropModel(kind, name) {
  const g = new THREE.Group(); g.name = name;
  for (let s = 0; s <= 3; s++) g.add(cropStage(kind, s));
  return g;
}

function itemModel(name) {
  switch (name) {
    case "item_paddy": {
      const sheaves = [];
      for (let i = 0; i < 3; i++)
        sheaves.push(put(box(0.1,0.62,0.1,0xd8b84d), -0.12+i*0.12, 0.31, 0, 0.1*(i-1),0, 0.16*(i-1)));
      return G(name, [...sheaves, put(box(0.4,0.07,0.16,P.terracotta), 0,0.28,0)]);
    }
    case "item_rice": return G(name, [
      put(cyl(0.2,0.26,0.42,P.cream,null,10), 0,0.21,0),
      put(cyl(0.13,0.13,0.07,P.woodDark,null,8), 0,0.45,0),
      put(sph(0.06,P.white), 0.1,0.47,0.02)]);
    case "item_ragi": return G(name, [
      put(cyl(0.19,0.25,0.4,0x9a7b52,null,10), 0,0.2,0),
      put(sph(0.17,0x6e5a3c), 0,0.44,0)]);
    case "item_chilli": {
      const kids = [];
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26;
        kids.push(put(cone(0.05,0.3,P.red), Math.cos(a)*0.1, 0.3, Math.sin(a)*0.1,
          Math.PI, a, 0.5));
        kids[ kids.length-1 ].position.y = 0.3 + (i%2)*0.08;
      }
      kids.push(put(box(0.34,0.06,0.34,P.wood), 0,0.1,0));
      return G(name, kids);
    }
    case "item_cotton": return G(name, [
      put(box(0.4,0.1,0.34,P.woodDark), 0,0.05,0),
      put(sph(0.12,P.white), -0.1,0.2,0), put(sph(0.13,P.white), 0.1,0.21,0.04),
      put(sph(0.1,P.white), 0,0.24,-0.09)]);
    case "item_fish": {
      const b = sph(0.24,0x7fa3b8); b.scale.set(0.6,0.5,1.5); b.position.y = 0.24;
      const t = cone(0.14,0.24,0x7fa3b8); t.rotation.x = Math.PI/2; t.position.set(0,0.24,-0.44);
      const e = sph(0.035,P.ink); e.position.set(0.1,0.3,0.26);
      return G(name, [b, t, e, put(box(0.16,0.1,0.05,0x5c8298), 0,0.4,0)]);
    }
    case "item_milk": return G(name, [
      put(cyl(0.16,0.19,0.42,P.stone,null,10), 0,0.21,0),
      put(cyl(0.07,0.07,0.07,P.stone,null,8), 0,0.45,0),
      put(mesh(new THREE.TorusGeometry(0.15,0.02,6,12,Math.PI), P.ink), 0,0.4,0, 0,0,0)]);
    case "item_egg": return G(name, [
      put(box(0.44,0.14,0.34,P.wood), 0,0.07,0),
      put(sph(0.11,P.white), -0.12,0.24,0), put(sph(0.11,P.white), 0.1,0.24,0.05),
      put(sph(0.11,P.white), 0,0.25,-0.1)]);
    case "item_vegetable": return G(name, [
      put(cone(0.13,0.44,0xe07a2f), 0,0.26,0, Math.PI,0,0.14),
      put(box(0.06,0.2,0.06,P.leaf), -0.04,0.56,0, 0,0,0.4),
      put(box(0.06,0.18,0.06,P.leaf), 0.06,0.55,0.02, 0,0,-0.5)]);
    case "item_seeds": default: return G(name, [
      put(cyl(0.15,0.11,0.26,P.terracotta,null,10), 0,0.13,0),
      put(cyl(0.16,0.16,0.04,P.woodDark,null,10), 0,0.28,0),
      put(sph(0.035,P.turmeric), 0.04,0.32,0.02),
      put(sph(0.035,P.leaf), -0.05,0.32,0.04)]);
  }
}

const BUILDERS = {
  buggy, fence, cot, shed, well, threshing, stall,
  cow, goat, chicken,
  hoe, sickle, rod, hammer, can, seeds,
  crop_ragi: () => cropModel("ragi", "crop_ragi"),
  crop_paddy: () => cropModel("paddy", "crop_paddy"),
  crop_chilli: () => cropModel("chilli", "crop_chilli"),
  crop_vegetable: () => cropModel("vegetable", "crop_vegetable"),
  crop_cotton: () => cropModel("cotton", "crop_cotton"),
  item_paddy: () => itemModel("item_paddy"),
  item_rice: () => itemModel("item_rice"),
  item_ragi: () => itemModel("item_ragi"),
  item_chilli: () => itemModel("item_chilli"),
  item_cotton: () => itemModel("item_cotton"),
  item_fish: () => itemModel("item_fish"),
  item_milk: () => itemModel("item_milk"),
  item_egg: () => itemModel("item_egg"),
  item_vegetable: () => itemModel("item_vegetable"),
  item_seeds: () => itemModel("item_seeds"),
};
`;

/* ------------------------------------------------------------------ *
 * Harness page: export GLB + bake a 128px icon for every model.
 * ------------------------------------------------------------------ */
function harnessHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>make-models</title>
<script type="importmap">{"imports":{"three":"/vendor/three.module.min.js"}}</script>
</head><body><script type="module">
import * as THREE from "three";
import { GLTFExporter } from "/vendor/GLTFExporter.js";
${BUILDERS}
const SPEC = ${JSON.stringify(MODELS)};
function triCount(obj) {
  let n = 0;
  obj.traverse((m) => { if (!m.isMesh) return;
    const g = m.geometry;
    n += g.index ? g.index.count / 3 : g.attributes.position.count / 3; });
  return Math.round(n);
}
function bakeIcon(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const ctr = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z) || 1;
  const scene = new THREE.Scene();
  scene.add(obj.clone(true));
  scene.add(new THREE.HemisphereLight(0xfff6e0, 0x4c8b3f, 1.1));
  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(2, 3, 1.5);
  scene.add(dir);
  const cam = new THREE.PerspectiveCamera(34, 1, 0.01, 50);
  const dist = span * 2.1;
  cam.position.set(ctr.x + dist * 0.62, ctr.y + dist * 0.5, ctr.z + dist * 0.8);
  cam.lookAt(ctr);
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(128, 128, false);
  r.setClearColor(0x000000, 0);
  r.render(scene, cam);
  const url = r.domElement.toDataURL("image/png");
  r.dispose();
  return url;
}
async function exportGlb(obj) {
  const exporter = new GLTFExporter();
  return new Promise((res, rej) =>
    exporter.parse(obj, (buf) => res(buf), (e) => rej(e), { binary: true }));
}
function b64(buf) {
  const u = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000)
    s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
const out = [];
for (const [name, spec] of Object.entries(SPEC)) {
  const build = BUILDERS[name];
  if (!build) { out.push({ name, error: "no builder" }); continue; }
  const obj = build();
  obj.updateMatrixWorld(true);
  const glb = await exportGlb(obj);
  const icon = bakeIcon(obj);
  out.push({
    name, tris: triCount(obj), nodes: [],
    glb: b64(glb),
    icon: icon.split(",")[1],
  });
}
document.body.dataset.done = "1";
window.__MODELS__ = out;
</script></body></html>`;
}

/* ------------------------------------------------------------------ *
 * Node: serve static + harness, run Chromium, compress, record.
 * ------------------------------------------------------------------ */
const server = createServer(async (req, res) => {
  try {
    const path = (req.url || "/").split("?")[0];
    if (path === "/__make-models.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return void res.end(harnessHtml());
    }
    const f = normalize(join(staticRoot, decodeURIComponent(path)));
    if (!f.startsWith(staticRoot)) throw new Error("nope");
    const data = await readFile(f);
    res.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("no");
  }
});
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".svg": "image/svg+xml", ".glb": "model/gltf-binary",
  ".png": "image/png" };

async function main() {
  await mkdir(modelDir, { recursive: true });
  await mkdir(iconDir, { recursive: true });
  await new Promise((r) => server.listen(PORT, "0.0.0.0", r));

  // Same launcher as e2e/smoke.mjs: @sparticuz/chromium binary +
  // puppeteer-core (needs LD_LIBRARY_PATH=/tmp/atlas-al2023-lib on non-AL2).
  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: [...chromium.args, "--enable-unsafe-swiftshader"],
    headless: "shell",
    protocolTimeout: 300000,
  });
  const page = await browser.newPage();
  page.on("pageerror", (e) => { console.error("[harness]", e.message); });
  page.on("console", (m) => { if (m.type() === "error") console.error("[page]", m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/__make-models.html`, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction("window.__MODELS__ && window.__MODELS__.length", { timeout: 180000 });
  const results = await page.evaluate(() => window.__MODELS__);
  await browser.close();
  server.close();

  // ---- compress with gltf-transform (meshopt) ----
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  const sha = (buf) => createHash("sha256").update(buf).digest("hex");
  const records = [];
  let failed = 0;

  for (const r of results) {
    if (r.error) { console.error("✗", r.name, r.error); failed++; continue; }
    const glb = Buffer.from(r.glb, "base64");
    const icon = Buffer.from(r.icon, "base64");
    let final = glb;
    let compression = "none";
    try {
      const doc = await io.readBinary(glb);
      await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder }));
      final = Buffer.from(await io.writeBinary(doc));
      compression = "meshopt";
    } catch (e) {
      console.warn("  ! meshopt failed for", r.name, "-", e.message);
    }
    await writeFile(join(modelDir, `${r.name}.glb`), final);
    await writeFile(join(iconDir, `${r.name}.png`), icon);
    const spec = MODELS[r.name];
    const budget = BUDGET[spec.cat];
    const over = r.tris > budget ? " OVER-BUDGET" : "";
    if (over) failed++;
    console.log(`  ${r.name.padEnd(18)} ${String(r.tris).padStart(5)} tris  ${String(final.length).padStart(6)} B  ${compression}${over}`);
    records.push({
      file: `assets/models/${r.name}.glb`,
      icon: `assets/icons/${r.name}.png`,
      tris: r.tris, bytes: final.length, compression,
      sha256: sha(final), iconSha256: sha(icon),
    });
  }

  // ---- LICENSES.json entries ----
  const lic = JSON.parse(await readFile(LICENSES, "utf8"));
  if (!Array.isArray(lic.files)) throw new Error("LICENSES.json: files[] missing");
  const today = new Date().toISOString().slice(0, 10);
  const REGEN = new Set(["icons/sprite.svg", "vendor/GLTFExporter.js",
    "vendor/jsm/loaders/GLTFLoader.js", "vendor/jsm/utils/BufferGeometryUtils.js", "vendor/jsm/utils/SkeletonUtils.js",
    "vendor/jsm/libs/meshopt_decoder.module.js"]);
  const keep = lic.files.filter((e) => !String(e.file).startsWith("assets/models/")
    && !String(e.file).startsWith("assets/icons/") && !REGEN.has(e.file));
  const date = today;
  for (const rec of records) {
    keep.push({ file: rec.file,
      name: rec.file.slice(rec.file.lastIndexOf("/") + 1).replace(/\.glb$/, ""),
      author: "Telugu States by CSRGO project",
      source: "Hugo-Project/tools/make-models.mjs (procedural, three.js)",
      license: "CC0-1.0", sha256: rec.sha256, verified_on: date });
    keep.push({ file: rec.icon,
      name: rec.icon.slice(rec.icon.lastIndexOf("/") + 1),
      author: "Telugu States by CSRGO project",
      source: "Hugo-Project/tools/make-models.mjs (baked render of the GLB)",
      license: "CC0-1.0", sha256: rec.iconSha256, verified_on: date });
  }
  keep.push({ file: "icons/sprite.svg", name: "UI + gameplay icon sprite",
    author: "Lucide (FEITZ) contributors; game-icons.net contributors",
    source: "tools/make-icons.mjs ← @iconify-json/lucide, @iconify-json/game-icons",
    license: "ISC (Lucide icons); CC-BY-3.0 (game-icons.net icons)",
    sha256: "", verified_on: date });
  keep.push(
    { file: "vendor/GLTFExporter.js", name: "three.js GLTFExporter",
      author: "three.js contributors", source: "three@0.187.0 examples/jsm/exporters",
      license: "MIT", sha256: "", verified_on: date },
    { file: "vendor/jsm/loaders/GLTFLoader.js", name: "three.js GLTFLoader",
      author: "three.js contributors", source: "three@0.187.0 examples/jsm/loaders",
      license: "MIT", sha256: "", verified_on: date },
    { file: "vendor/jsm/utils/BufferGeometryUtils.js", name: "three.js BufferGeometryUtils",
      author: "three.js contributors", source: "three@0.187.0 examples/jsm/utils",
      license: "MIT", sha256: "", verified_on: date },
    { file: "vendor/jsm/utils/SkeletonUtils.js", name: "three.js SkeletonUtils",
      author: "three.js contributors", source: "three@0.187.0 examples/jsm/utils",
      license: "MIT", sha256: "", verified_on: date },
    { file: "vendor/jsm/libs/meshopt_decoder.module.js", name: "meshoptimizer decoder (three.js)",
      author: "three.js contributors / Vladimir Vukicevic",
      source: "three@0.187.0 examples/jsm/libs",
      license: "MIT", sha256: "", verified_on: date });
  // fill empty shas from disk
  for (const f of keep) {
    if (f.sha256) continue;
    try { f.sha256 = sha(await readFile(join(staticRoot, f.file))); }
    catch { f.sha256 = ""; }
  }
  lic.files = keep;
  if (!String(lic.scope).includes("Procedural GLB")) lic.scope = String(lic.scope) +
    " Procedural GLB models and their baked icons (Hugo-Project/tools/make-models.mjs) are CC0-1.0 project artwork; the UI icon sprite combines Lucide (ISC) and game-icons.net (CC-BY-3.0).";
  await writeFile(LICENSES, JSON.stringify(lic, null, 1) + "\n");

  const total = records.reduce((a, r) => a + r.bytes, 0);
  console.log(`models: ${records.length} written (${(total / 1024).toFixed(1)} kB total)` +
    (failed ? ` — ${failed} FAILED` : ""));
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
