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
const copper = new T.Color("#c4734a"),
  gold = new T.Color("#bca263");
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
            ? "#715343"
            : mat.includes("coconut")
              ? "#716137"
              : "#6f613d",
      );
    c.set(
      name === "Flame tree"
        ? "#478749"
        : name === "Golden shower"
          ? "#408a42"
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
          : ["#969084", "#9a867a", "#898a83", "#978967", "#928d85"][
              Math.abs(lith || 0) % 5
            ],
    );
  }
  if (kind === "plant") {
    if (/color|flower/.test(mat)) return c.set(p.colour || s.hex);
    if (/grass|green|leaf/.test(mat))
      return c.set(/Golden|reed/.test(name) ? "#549056" : "#468848");
  }
  return c;
};
function addTube(pts, r0, r1, sides, col, H, p, c, s) {
  const n = pts.length;
  if (n < 2) return;
  const rings = [];
  let ux = 1,
    uy = 0,
    uz = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0],
      ty = b[1] - a[1],
      tz = b[2] - a[2],
      tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    if (i === 0) {
      if (Math.abs(tx) > 0.85) {
        ux = 0;
        uy = 0;
        uz = 1;
      }
    }
    const dot = ux * tx + uy * ty + uz * tz;
    ux -= dot * tx;
    uy -= dot * ty;
    uz -= dot * tz;
    let ul = Math.hypot(ux, uy, uz);
    if (ul < 1e-4) {
      ux = Math.abs(ty) < 0.9 ? -tz : 1;
      uy = 0;
      uz = Math.abs(ty) < 0.9 ? tx : 0;
      ul = Math.hypot(ux, uy, uz) || 1;
    }
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const vx = ty * uz - tz * uy,
      vy = tz * ux - tx * uz,
      vz = tx * uy - ty * ux,
      r = r0 + (r1 - r0) * (i / (n - 1)),
      ring = [];
    for (let k = 0; k < sides; k++) {
      const ang = (k / sides) * Math.PI * 2,
        ca = Math.cos(ang) * r,
        sa = Math.sin(ang) * r;
      ring.push([
        pts[i][0] + ux * ca + vx * sa,
        pts[i][1] + uy * ca + vy * sa,
        pts[i][2] + uz * ca + vz * sa,
      ]);
    }
    rings.push(ring);
  }
  const pushV = (v) => {
    p.push(H * v[0], H * v[1], H * v[2]);
    c.push(col.r, col.g, col.b);
    s.push(0.38 * Math.max(0, v[1] - 0.1) ** 2);
  };
  for (let i = 0; i < n - 1; i++) {
    const A = rings[i],
      B = rings[i + 1];
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      pushV(A[k]);
      pushV(B[k]);
      pushV(B[k1]);
      pushV(A[k]);
      pushV(B[k1]);
      pushV(A[k1]);
    }
  }
  const top = rings[n - 1],
    tip = pts[n - 1];
  for (let k = 0; k < sides; k++) {
    pushV(top[k]);
    pushV(top[(k + 1) % sides]);
    pushV(tip);
  }
}
function groupTris(tris) {
  const par = tris.map((_, i) => i),
    find = (x) => (par[x] === x ? x : (par[x] = find(par[x]))),
    vmap = new Map();
  tris.forEach((pts, ti) => {
    for (const v of pts) {
      const k =
        Math.round(v[0] * 400) +
        "," +
        Math.round(v[1] * 400) +
        "," +
        Math.round(v[2] * 400);
      if (vmap.has(k)) par[find(ti)] = find(vmap.get(k));
      else vmap.set(k, ti);
    }
  });
  const comps = new Map();
  tris.forEach((pts, ti) => {
    const r = find(ti);
    let arr = comps.get(r);
    if (!arr) comps.set(r, (arr = []));
    arr.push(pts, ti);
  });
  return [...comps.values()].map((raw) => {
    const pts = [],
      idx = [];
    for (let i = 0; i < raw.length; i += 2) {
      pts.push(...raw[i]);
      idx.push(raw[i + 1]);
    }
    return { pts, idx };
  });
}
function repairTreeCanopy(asset, a, id, H, lod, colors, p, c, s) {
  const isBark = (mi) =>
      /wood|black|white|default|bark|trunk/i.test(asset.colors[mi].name),
    barkIdx = asset.colors.findIndex((_, i) => isBark(i));
  if (barkIdx < 0) return null;
  const barkCol = colors[barkIdx],
    barkTris = [],
    barkTriMap = [],
    leafTris = [];
  for (let t = 0; t < a.m.length; t++) {
    const pts = [0, 1, 2].map((k) => {
      const q = a.ix[t * 3 + k] * 3;
      return [a.p[q], a.p[q + 1], a.p[q + 2]];
    });
    if (isBark(a.m[t])) {
      barkTris.push(pts);
      barkTriMap.push(t);
    } else leafTris.push(pts);
  }
  if (!barkTris.length || !leafTris.length) return null;
  const skipTri = new Set();
  for (const comp of groupTris(barkTris)) {
    const minY = Math.min(...comp.pts.map((v) => v[1]));
    if (minY > 0.06) for (const bi of comp.idx) skipTri.add(barkTriMap[bi]);
  }
  const a0 = asset.levels[0],
    palm = /palm/.test(id),
    bark0 = [];
  for (let t = 0; t < a0.m.length; t++) {
    if (!isBark(a0.m[t])) continue;
    for (let k = 0; k < 3; k++) {
      const q = a0.ix[t * 3 + k] * 3;
      bark0.push([a0.p[q], a0.p[q + 1], a0.p[q + 2]]);
    }
  }
  const maxBarkY = Math.max(...bark0.map((v) => v[1])),
    lowPts = bark0.filter((v) => v[1] >= 0.04 && v[1] <= 0.25),
    lowCx = lowPts.reduce((u, v) => u + v[0], 0) / (lowPts.length || 1),
    lowCz = lowPts.reduce((u, v) => u + v[2], 0) / (lowPts.length || 1),
    lowR = Math.max(
      0.018,
      lowPts.reduce(
        (m, v) => Math.max(m, Math.hypot(v[0] - lowCx, v[2] - lowCz)),
        0,
      ),
    ),
    slices = [],
    topSliceY = palm ? maxBarkY : Math.min(maxBarkY, 0.52),
    nSlices = palm ? 9 : 5;
  for (let i = 0; i <= nSlices; i++) {
    const y = 0.06 + ((topSliceY - 0.06) * i) / nSlices,
      band = bark0.filter((v) => Math.abs(v[1] - y) < (palm ? 0.07 : 0.09));
    if (band.length) {
      const sx = band.reduce((u, v) => u + v[0], 0) / band.length,
        sz = band.reduce((u, v) => u + v[2], 0) / band.length;
      slices.push([sx, y, sz]);
    }
  }
  if (slices.length < 2)
    slices.push([lowCx, 0.06, lowCz], [lowCx, topSliceY, lowCz]);
  const spineAt = (y) => {
    if (y <= slices[0][1]) return [slices[0][0], slices[0][2]];
    for (let i = 0; i < slices.length - 1; i++) {
      const A = slices[i],
        B = slices[i + 1];
      if (y <= B[1] || i === slices.length - 2) {
        const t = Math.min(1, Math.max(0, (y - A[1]) / (B[1] - A[1] || 1)));
        return [A[0] + (B[0] - A[0]) * t, A[2] + (B[2] - A[2]) * t];
      }
    }
    const L = slices[slices.length - 1];
    return [L[0], L[2]];
  };
  const leafComps = groupTris(leafTris),
    rBase = Math.min(
      lowR * 0.82,
      lod === 2 ? 0.028 : lod === 1 ? 0.022 : 0.016,
    ),
    addExtras = () => {
      if (palm) {
        const [hx, hz] = spineAt(maxBarkY),
          hy = maxBarkY,
          spinePts = slices.map(([x, y, z]) => [x, y, z]);
        addTube(spinePts, rBase, rBase * 0.78, 5, barkCol, H, p, c, s);
        addTube(
          [
            [hx, hy - 0.035, hz],
            [hx, hy + 0.016, hz],
          ],
          rBase * 1.15,
          rBase * 0.92,
          5,
          barkCol,
          H,
          p,
          c,
          s,
        );
        for (const comp of leafComps) {
          let bestM = comp.pts[0],
            bestD = Infinity,
            cx = 0,
            cy = 0,
            cz = 0;
          for (const v of comp.pts) {
            cx += v[0];
            cy += v[1];
            cz += v[2];
            const d = Math.hypot(v[0] - hx, v[1] - hy, v[2] - hz);
            if (d < bestD) {
              bestD = d;
              bestM = v;
            }
          }
          cx /= comp.pts.length;
          cy /= comp.pts.length;
          cz /= comp.pts.length;
          addTube(
            [
              [hx, hy - 0.012, hz],
              bestM,
              [
                bestM[0] * 0.78 + cx * 0.22,
                bestM[1] * 0.78 + cy * 0.22,
                bestM[2] * 0.78 + cz * 0.22,
              ],
            ],
            rBase * 0.64,
            rBase * 0.36,
            4,
            barkCol,
            H,
            p,
            c,
            s,
          );
        }
        return;
      }
      const targets = leafComps.map((comp) => {
        let minY = Infinity,
          cx = 0,
          cy = 0,
          cz = 0;
        for (const v of comp.pts) {
          if (v[1] < minY) minY = v[1];
          cx += v[0];
          cy += v[1];
          cz += v[2];
        }
        cx /= comp.pts.length;
        cy /= comp.pts.length;
        cz /= comp.pts.length;
        let entry = [cx, minY + (cy - minY) * 0.35, cz],
          bestScore = Infinity;
        for (let i = 0; i < comp.pts.length; i += 3) {
          const A = comp.pts[i],
            B = comp.pts[i + 1],
            C = comp.pts[i + 2],
            mx = (A[0] + B[0] + C[0]) / 3,
            my = (A[1] + B[1] + C[1]) / 3,
            mz = (A[2] + B[2] + C[2]) / 3,
            [sx, sz] = spineAt(my),
            score = (my - minY) * 0.85 + Math.hypot(mx - sx, mz - sz);
          if (score < bestScore) {
            bestScore = score;
            entry = [mx, my, mz];
          }
        }
        const ax = entry[0] * 0.55 + cx * 0.45,
          ay = Math.max(entry[1] + 0.015, entry[1] * 0.55 + cy * 0.45),
          az = entry[2] * 0.55 + cz * 0.45,
          [sx, sz] = spineAt(entry[1]),
          hd = Math.hypot(entry[0] - sx, entry[2] - sz),
          forkY = Math.max(
            0.14,
            Math.min(entry[1] - 0.04, minY - 0.035 - hd * 0.42),
          );
        return { entry, ax, ay, az, forkY };
      });
      const spineTop = Math.min(
          0.88,
          Math.max(
            0.45,
            ...targets.map((t) => Math.max(t.forkY + 0.05, t.ay * 0.86)),
          ),
        ),
        spinePts = [];
      for (let i = 0; i <= 5; i++) {
        const y = 0.06 + ((spineTop - 0.06) * i) / 5,
          [sx, sz] = spineAt(y);
        spinePts.push([sx, y, sz]);
      }
      addTube(spinePts, rBase, rBase * 0.62, 5, barkCol, H, p, c, s);
      const rLimb = lod === 2 ? 0.022 : lod === 1 ? 0.018 : 0.014;
      for (const t of targets) {
        const [fx, fz] = spineAt(t.forkY);
        addTube(
          [[fx, t.forkY, fz], t.entry, [t.ax, t.ay, t.az]],
          Math.min(rBase * 0.86, rLimb),
          Math.min(rBase * 0.55, rLimb * 0.58),
          5,
          barkCol,
          H,
          p,
          c,
          s,
        );
      }
    };
  return { skipTri, addExtras };
}
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
    colors = asset.colors.map((v) => palette(kind, name, v, ps, lith)),
    treeFix =
      kind === "tree"
        ? repairTreeCanopy(asset, a, id, H, Math.min(2, lod), colors, p, c, s)
        : null;
  for (let i = 0; i < a.ix.length; i++) {
    const tri = Math.floor(i / 3);
    if (treeFix?.skipTri.has(tri)) continue;
    const k = a.ix[i] * 3,
      y = a.p[k + 1];
    p.push(H * a.p[k], H * y, H * a.p[k + 2]);
    let mi = a.m[tri],
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
  treeFix?.addExtras();
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
