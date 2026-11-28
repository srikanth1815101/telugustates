// Visuals for life-sim state: placed structures, livestock and crop
// plots, keyed by stable identities so sync is a cheap diff each frame.
// Primitives render immediately; the pipeline GLBs (tools/make-models)
// swap in on the next frame once loaded. Coordinates: structures are
// motor-space (converted via toScene), animals/plots arrive in scene
// metres.
// @ts-check

import { modelTemplate } from "./game-models.js";
import { CROP_MODEL } from "../../tools/model-spec.mjs";

const STRUCT = {
  // fallback primitive: [w, h, d, color, kind] — base on the ground.
  fence: [0.12, 1.1, 0.12, 0xa58b5f, "box"],
  cot: [2.0, 1.1, 1.4, 0xd9c9a3, "box"],
  shed: [3.2, 2.2, 2.6, 0xb5462f, "box"],
  well: [1.4, 0.9, 1.4, 0x9aa7b0, "cyl"],
  threshing: [3.2, 0.12, 3.2, 0xcbb26a, "cyl"],
  stall: [2.6, 2.2, 1.6, 0xc05a3e, "box"],
};

const ANIMAL = {
  cow: [0.7, 0.75, 1.5, 0x6b4a2f],
  goat: [0.45, 0.5, 0.9, 0xb9a06a],
  chicken: [0.28, 0.3, 0.4, 0xf2efe4],
};

/**
 * @param {any} scene THREE.Scene
 * @param {any} T THREE namespace
 * @param {(mx: number, my: number, h?: number) => number[]} toScene
 *        motor-space → [x, y, z] scene metres
 */
export function createLifeMeshes(scene, T, toScene) {
  /** @type {Map<string, any>} */
  const structs = new Map();
  /** @type {Map<number, any>} */
  const beasts = new Map();
  /** @type {Map<string, any>} */
  const plots = new Map();
  const geoCache = {};

  const geo = (type, def) => {
    const key = type + def[4];
    if (geoCache[key]) return geoCache[key];
    let g;
    if (def[4] === "cyl") {
      g = new T.CylinderGeometry(def[0] / 2, def[0] / 2, def[1], 10);
      g.translate(0, def[1] / 2, 0);
    } else {
      g = new T.BoxGeometry(def[0], def[1], def[2]);
      g.translate(0, def[1] / 2, 0);
    }
    geoCache[key] = g;
    return g;
  };

  const makeMat = (color) => new T.MeshLambertMaterial({ color });

  const shadow = (root) => {
    root.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return root;
  };

  const swapToModel = (holder, tpl) => {
    for (const c of [...holder.children]) holder.remove(c);
    holder.add(shadow(tpl.clone(true)));
  };

  return {
    /** Reconcile placed structures (motor-space entries) to meshes. */
    syncStructures(placed) {
      const seen = new Set();
      for (const p of placed) {
        const key = `${p.type}:${p.x.toFixed(3)}:${p.z.toFixed(3)}`;
        seen.add(key);
        const tpl = modelTemplate(p.type);
        let rec = structs.get(key);
        if (rec) {
          if (rec.src === "prim" && tpl) {
            swapToModel(rec.obj, tpl);
            rec.src = "model";
          }
          continue;
        }
        if (tpl) {
          const obj = shadow(tpl.clone(true));
          const [sx, sy, sz] = toScene(p.x, p.z, p.y);
          obj.position.set(sx, sy, sz);
          obj.rotation.y = p.yaw ?? 0;
          scene.add(obj);
          structs.set(key, { obj, src: "model" });
          continue;
        }
        const def = STRUCT[p.type];
        if (!def) continue;
        const mesh = new T.Mesh(geo(p.type, def), makeMat(def[3]));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const [sx, sy, sz] = toScene(p.x, p.z, p.y);
        mesh.position.set(sx, sy, sz);
        mesh.rotation.y = p.yaw ?? 0;
        scene.add(mesh);
        structs.set(key, { obj: mesh, src: "prim" });
      }
      for (const [key, rec] of structs)
        if (!seen.has(key)) {
          scene.remove(rec.obj);
          structs.delete(key);
        }
      return structs.size;
    },
    /** Reconcile animals; entries are already scene-space. */
    syncAnimals(list) {
      const seen = new Set();
      for (const a of list) {
        seen.add(a.key);
        const tpl = modelTemplate(a.kind);
        let rec = beasts.get(a.key);
        if (rec) {
          if (rec.src === "prim" && tpl) {
            swapToModel(rec.obj, tpl);
            rec.src = "model";
          }
          rec.obj.position.set(a.x, a.y, a.z);
          continue;
        }
        const def = ANIMAL[a.kind] ?? ANIMAL.goat;
        let obj;
        let src = "prim";
        if (tpl) {
          obj = shadow(tpl.clone(true));
          src = "model";
        } else {
          obj = new T.Mesh(geo("animal:" + a.kind, def), makeMat(def[3]));
          obj.castShadow = true;
        }
        obj.position.set(a.x, a.y, a.z);
        scene.add(obj);
        beasts.set(a.key, { obj, src });
      }
      for (const [key, rec] of beasts)
        if (!seen.has(key)) {
          scene.remove(rec.obj);
          beasts.delete(key);
        }
      return beasts.size;
    },
    /**
     * Reconcile crop plots; entries arrive scene-space with a growth
     * stage (models expose stage0..stage3 — higher stages clamp).
     * @param {{key: string, kind: string, stage: number,
     *          x: number, y: number, z: number}[]} list
     */
    syncPlots(list) {
      const seen = new Set();
      for (const p of list) {
        seen.add(p.key);
        const tpl = modelTemplate(CROP_MODEL[p.kind] ?? "crop_" + p.kind);
        if (!tpl) continue; // grid colours already show growth
        let rec = plots.get(p.key);
        if (!rec) {
          const obj = shadow(tpl.clone(true));
          obj.position.set(p.x, p.y, p.z);
          scene.add(obj);
          rec = { obj, stage: -1 };
          plots.set(p.key, rec);
        } else {
          rec.obj.position.set(p.x, p.y, p.z);
        }
        const stage = Math.min(3, Math.max(0, p.stage | 0));
        if (rec.stage !== stage) {
          // GLB shape: wrapper → crop_<kind> → stage0..3 (toggling the
          // wrapper's direct children would hide the whole crop).
          rec.obj.traverse((c) => {
            if (/^stage[0-9]$/.test(c.name)) c.visible = c.name === "stage" + stage;
          });
          rec.stage = stage;
        }
      }
      for (const [key, rec] of plots)
        if (!seen.has(key)) {
          scene.remove(rec.obj);
          plots.delete(key);
        }
      return plots.size;
    },
    get count() {
      return structs.size + beasts.size + plots.size;
    },
    dispose() {
      for (const rec of [...structs.values(), ...beasts.values(), ...plots.values()])
        scene.remove(rec.obj);
      structs.clear();
      beasts.clear();
      plots.clear();
      for (const g of Object.values(geoCache)) g.dispose();
      for (const k of Object.keys(geoCache)) delete geoCache[k];
    },
  };
}
