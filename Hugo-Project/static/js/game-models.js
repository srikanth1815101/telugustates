// game-models — lazy GLB loader for the procedural model pipeline
// (tools/make-models.mjs). Templates load in the background the first
// time the world boots; renderers keep using primitives until a model
// arrives, then swap on the next sync frame. Failures degrade forever
// to the primitive art (never block the game on an asset).
// @ts-check

/** name → THREE.Group | null (null = failed) once settled. */
const ready = new Map();
/** name → in-flight Promise<Group | null>. */
const inflight = new Map();
let loaderPromise = null;

function url(rel) {
  const base =
    (document.querySelector('meta[name="asset-base"]')?.getAttribute("content") ||
      "/") + rel;
  return new URL(base, location.href).href;
}

/** Kick off GLTFLoader + meshopt; resolves when the module is ready. */
function ensureLoader() {
  if (!loaderPromise) {
    loaderPromise = (async () => {
      const [gltf, meshopt] = await Promise.all([
        import(/* @vite-ignore */ url("vendor/jsm/loaders/GLTFLoader.js")),
        import(/* @vite-ignore */ url("vendor/jsm/libs/meshopt_decoder.module.js")),
      ]);
      const loader = new gltf.GLTFLoader();
      loader.setMeshoptDecoder(meshopt.MeshoptDecoder);
      return loader;
    })().catch((e) => {
      console.warn("[models] loader unavailable:", e.message);
      return null;
    });
  }
  return loaderPromise;
}

/**
 * Load a model by name (no extension). Resolves to the template
 * THREE.Group, or null when the asset is missing/failed. Safe to call
 * repeatedly — concurrent callers share one request.
 * @param {string} name
 * @returns {Promise<THREE.Group | null>}
 */
export function loadGameModel(name) {
  if (ready.has(name)) return Promise.resolve(ready.get(name) ?? null);
  const pending = inflight.get(name);
  if (pending) return pending;
  const p = (async () => {
    let result = null;
    const loader = await ensureLoader();
    if (loader) {
      try {
        const gltf = await loader.loadAsync(url(`assets/models/${name}.glb`));
        gltf.scene.updateMatrixWorld(true);
        result = gltf.scene;
      } catch (e) {
        console.warn("[models]", name, "failed:", e && e.message);
        result = null;
      }
    }
    ready.set(name, result);
    inflight.delete(name);
    return result;
  })();
  inflight.set(name, p);
  return p;
}

/**
 * Synchronous template lookup for render loops: Group when loaded,
 * null when failed or still in flight.
 * @param {string} name
 */
export function modelTemplate(name) {
  return ready.get(name) ?? null;
}

/**
 * Start loading a batch; resolves when every name has settled.
 * @param {string[]} names
 */
export function preloadGameModels(names) {
  return Promise.all(names.map(loadGameModel));
}
