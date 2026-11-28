// Visual primitives for life-sim state: placed structures and livestock
// are rendered from simple boxes/cylinders (no art assets needed), keyed
// by stable identities so sync is a cheap diff each frame.
// @ts-check

const STRUCT = {
  // [w, h, d, color, kind] — sizes in metres, base sitting on the ground.
  fence: [0.12, 1.1, 0.12, 0xa58b5f, "box"],
  cot: [2.0, 1.1, 1.4, 0xd9c9a3, "box"],
  shed: [3.2, 2.2, 2.6, 0xb5462f, "box"],
  well: [1.4, 0.9, 1.4, 0x9aa7b0, "cyl"],
  threshing: [3.2, 0.12, 3.2, 0xcbb26a, "cyl"],
};

const ANIMAL = {
  cow: [0.7, 0.75, 1.5, 0x6b4a2f],
  goat: [0.45, 0.5, 0.9, 0xb9a06a],
  chicken: [0.28, 0.3, 0.4, 0xf2efe4],
};

/**
 * @param {any} scene THREE.Scene
 * @param {any} T THREE namespace
 * @param {(mx: number, my: number, h: number) => number[]} toScene
 *        motor-space → [x, y, z] scene metres
 */
export function createLifeMeshes(scene, T, toScene) {
  /** @type {Map<string, any>} */
  const structs = new Map();
  /** @type {Map<number, any>} */
  const beasts = new Map();
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

  return {
    /** Reconcile placed structures (motor-space entries) to meshes. */
    syncStructures(placed) {
      const seen = new Set();
      for (const p of placed) {
        const key = `${p.type}:${p.x.toFixed(3)}:${p.z.toFixed(3)}`;
        seen.add(key);
        if (structs.has(key)) continue;
        const def = STRUCT[p.type];
        if (!def) continue;
        const mesh = new T.Mesh(geo(p.type, def), makeMat(def[3]));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const [sx, sy, sz] = toScene(p.x, p.z, p.y);
        mesh.position.set(sx, sy, sz);
        mesh.rotation.y = p.yaw ?? 0;
        scene.add(mesh);
        structs.set(key, mesh);
      }
      for (const [key, mesh] of structs)
        if (!seen.has(key)) {
          scene.remove(mesh);
          structs.delete(key);
        }
      return structs.size;
    },
    /** Reconcile animals; entries are already scene-space. */
    syncAnimals(list) {
      const seen = new Set();
      for (const a of list) {
        seen.add(a.key);
        let mesh = beasts.get(a.key);
        const def = ANIMAL[a.kind] ?? ANIMAL.goat;
        if (!mesh) {
          mesh = new T.Mesh(geo("animal:" + a.kind, def), makeMat(def[3]));
          mesh.castShadow = true;
          scene.add(mesh);
          beasts.set(a.key, mesh);
        }
        mesh.position.set(a.x, a.y, a.z);
      }
      for (const [key, mesh] of beasts)
        if (!seen.has(key)) {
          scene.remove(mesh);
          beasts.delete(key);
        }
      return beasts.size;
    },
    get count() {
      return structs.size + beasts.size;
    },
    dispose() {
      for (const m of [...structs.values(), ...beasts.values()])
        scene.remove(m);
      structs.clear();
      beasts.clear();
      for (const g of Object.values(geoCache)) g.dispose();
      for (const k of Object.keys(geoCache)) delete geoCache[k];
    },
  };
}
