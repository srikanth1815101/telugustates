// Offline field library: files are cached by model ID, not per animal, acre, tier or placement.
import * as T from "../vendor/three.module.min.js";
import { get, url, unzip } from "./grid.js";
const resources = new Map(),
  waiting = new Map(),
  statics = new Map();
let index, promise;
export const catalog = () =>
  (promise ??= get("library/assignments.json").then((j) => (index = j)));
export const assetID = (kind, name) => index?.[kind]?.[name];
export function loadModel(id) {
  if (resources.has(id)) return Promise.resolve(resources.get(id));
  if (waiting.has(id)) return waiting.get(id);
  const job = (async () => {
    const res = await fetch(
      url("library/models/" + encodeURIComponent(id) + ".model.gz"),
    );
    if (!res.ok) throw Error("Missing field model: " + id);
    const j = JSON.parse(
      new TextDecoder().decode(await unzip(await res.arrayBuffer())),
    );
    if (j.id !== id || j.v !== 2) throw Error("Wrong field resource: " + id);
    if (j.type === "rig") {
      const g = new T.BufferGeometry();
      for (const [attr, key, s] of [
        ["position", "p", 3],
        ["normal", "n", 3],
        ["color", "c", 3],
        ["skinWeight", "w", 4],
      ]) {
        g.setAttribute(attr, new T.Float32BufferAttribute(j[key], s));
        delete j[key];
      }
      g.setAttribute("skinIndex", new T.Uint16BufferAttribute(j.j, 4));
      g.setIndex(j.ix);
      delete j.j;
      delete j.ix;
      g.computeBoundingSphere();
      j.geom = g;
      for (const clip of Object.values(j.clips))
        clip.poses = clip.poses.map((a) => Float32Array.from(a));
    }
    resources.set(id, j);
    return j;
  })().finally(() => waiting.delete(id));
  waiting.set(id, job);
  return job;
}
export const loadPeople = () =>
  Promise.all(["traveller-man", "traveller-woman"].map(loadModel));
export async function loadPatch(items) {
  await catalog();
  await Promise.all(
    [...new Set(items.map((v) => assetID(v.kind, v.name)).filter(Boolean))].map(
      loadModel,
    ),
  );
}
const copper = new T.Color("#be7650"),
  gold = new T.Color("#b4a563");
const palette = (kind, name, s, ps, lith) => {
  const mat = s.name.toLowerCase(),
    p = ps.trees[name] || ps.plants[name],
    c = new T.Color(s.hex);
  if (kind === "tree") {
    if (name === "Bamboo") return c;
    if (/wood|coconut|black|white|default/.test(mat))
      return c.set(
        mat.includes("white")
          ? "#8e8270"
          : mat.includes("black")
            ? "#635840"
            : mat.includes("coconut")
              ? "#73603e"
              : "#785d48",
      );
    c.set(
      name === "Flame tree"
        ? "#61834e"
        : name === "Golden shower"
          ? "#628447"
          : p.colour,
    );
    if (mat.includes("dark")) c.multiplyScalar(0.74);
    else
      c.lerp(
        new T.Color(p.accent),
        name === "Flame tree" || name === "Golden shower" ? 0.05 : 0.12,
      );
    return c;
  }
  if (kind === "rock") {
    return c.set(
      /grass/.test(mat)
        ? "#808468"
        : /dirt/.test(mat)
          ? "#796f5f"
          : ["#969084", "#9a867a", "#898a83", "#9a8774", "#928d85"][
              Math.abs(lith || 0) % 5
            ],
    );
  }
  if (kind === "plant") {
    if (/color|flower/.test(mat)) return c.set(p.colour || s.hex);
    if (/grass|green|leaf/.test(mat))
      return c.set(/Golden|reed/.test(name) ? "#7e8759" : "#66824d");
  }
  return c;
};
export function staticModel(kind, name, ps, lod = 0, lith = 0) {
  const id = assetID(kind, name);
  if (!id) return null;
  const key = [kind, name, lod, kind === "rock" ? lith % 5 : 0].join("|");
  if (statics.has(key)) return statics.get(key);
  const asset = resources.get(id);
  if (!asset) throw Error("Unloaded static model " + id);
  const a = asset.levels[Math.min(2, lod)],
    H =
      kind === "tree"
        ? ps.trees[name].height
        : kind === "plant"
          ? ps.plants[name].height *
            (/flower|reed|blade|fern/.test(ps.plants[name].form) ? 0.7 : 1)
          : kind === "rock"
            ? {
                "Pebble fan": 0.14,
                "Strata shelf": 0.73,
                "Balanced tor": 1.54,
                "Granite pile": 1.14,
                Talus: 0.95,
                "Split boulder": 0.83,
              }[name] || 1
            : name === "Fallen log"
              ? 0.57
              : 0.73,
    p = [],
    c = [],
    s = [],
    colors = asset.colors.map((v) => palette(kind, name, v, ps, lith));
  for (let i = 0; i < a.ix.length; i++) {
    const k = a.ix[i] * 3,
      y = a.p[k + 1];
    p.push(H * a.p[k], H * y, H * a.p[k + 2]);
    let mi = a.m[Math.floor(i / 3)],
      col = colors[mi];
    if (
      kind === "tree" &&
      /Flame tree|Golden shower/.test(name) &&
      /green/i.test(asset.colors[mi].name) &&
      y > 0.46
    ) {
      const xx = a.p[k],
        zz = a.p[k + 2];
      let patch = Math.sin(xx * 9 + zz * 7 + y * 4) * Math.cos(zz * 8 - xx * 3);
      if (patch > 0.71) col = name === "Flame tree" ? copper : gold;
    }
    c.push(col.r, col.g, col.b);
    s.push(
      (kind === "tree" ? 0.38 : kind === "plant" ? 0.24 : 0) *
        Math.max(0, y - 0.1) ** 2,
    );
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(p, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(c, 3));
  g.setAttribute("sway", new T.Float32BufferAttribute(s, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.userData.asset = id;
  statics.set(key, g);
  return g;
}
const mat = new T.MeshStandardMaterial({
  vertexColors: true,
  roughness: 1,
  metalness: 0,
  side: T.DoubleSide,
});
export function rigInstance(id) {
  const d = resources.get(id);
  if (!d) throw Error("Unloaded animated model: " + id);
  const g = new T.Group(),
    mesh = new T.SkinnedMesh(d.geom, mat),
    bones = d.bones.map((s) => {
      const b = new T.Bone();
      b.name = s.name;
      b.position.fromArray(s.p);
      b.updateMatrixWorld(true);
      return b;
    });
  const sk = new T.Skeleton(bones);
  mesh.bindMode = T.DetachedBindMode;
  mesh.bind(sk, new T.Matrix4());
  mesh.frustumCulled = false;
  mesh.castShadow = id.startsWith("traveller");
  mesh.userData.asset = id;
  g.add(mesh);
  const Q = new T.Quaternion(),
    v = new T.Vector3();
  function sample(name, t, weight = 1) {
    if (weight <= 0) return;
    const c = d.clips[name];
    if (!c) throw Error("Absent clip " + id + ":" + name);
    const N = c.poses.length,
      f =
        c.loop === false
          ? Math.min(1, Math.max(0, t)) * (N - 1)
          : (t - Math.floor(t)) * N,
      i = Math.min(N - 1, Math.floor(f)),
      a = c.poses[i],
      b = c.poses[c.loop === false ? Math.min(N - 1, i + 1) : (i + 1) % N],
      k = f - i;
    for (let j = 0; j < bones.length; j++) {
      const h = j * 7,
        o = bones[j];
      v.set(
        a[h] + (b[h] - a[h]) * k,
        a[h + 1] + (b[h + 1] - a[h + 1]) * k,
        a[h + 2] + (b[h + 2] - a[h + 2]) * k,
      );
      o.position.lerp(v, weight);
      Q.fromArray(a, h + 3);
      if (k > 1e-6) Q.slerp(q2.fromArray(b, h + 3), k);
      if (weight === 1) o.quaternion.copy(Q);
      else o.quaternion.slerp(Q, weight);
    }
  }
  const q2 = new T.Quaternion();
  return {
    d,
    g,
    mesh,
    bones,
    sample,
    commit() {
      for (const b of bones) b.updateMatrixWorld(true);
    },
    dispose() {
      sk.dispose();
      g.removeFromParent();
    },
  };
}
