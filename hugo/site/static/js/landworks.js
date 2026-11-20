import * as T from "../vendor/three.module.min.js";
import { ACRE as U } from "./metres.js";
import { get } from "./grid.js";
import { dev, edition } from "./edition.js";
const cache = new Map();
export async function villageData(ids) {
  return Promise.all(
    [...new Set(ids)].map((id) => {
      if (!cache.has(id))
        cache.set(
          id,
          get(
            dev &&
              id === 32 &&
              new URLSearchParams(location.search).get("lighting") === "1"
              ? "living/dev/corridor-review.json"
              : `living/${edition}/villages/${id}.json`,
          ).catch((e) => {
            cache.delete(id);
            throw e;
          }),
        );
      const promise = cache.get(id);
      if (cache.size > 8) cache.delete(cache.keys().next().value);
      return promise;
    }),
  );
}
export function ribbons(s, paths, p, range = 6) {
  const pos = [],
    ci = [],
    idx = [];
  for (const path of paths) {
    const pts = path.xy;
    if (
      !pts.some(
        ([x, y]) => Math.abs(x - p.x) < range && Math.abs(y - p.y) < range,
      )
    )
      continue;
    const color = new T.Color(
      path.type === "hill"
        ? 0x877b63
        : path.type === "entrance"
          ? 0xb2946d
          : path.type === "forest"
            ? 0x817553
            : 0xa98b62,
    );
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i - 1],
        [X, Y] = pts[i],
        d = Math.hypot(X - x, Y - y);
      if (
        !d ||
        Math.max(x, X) < p.x - range ||
        Math.min(x, X) > p.x + range ||
        Math.max(y, Y) < p.y - range ||
        Math.min(y, Y) > p.y + range
      )
        continue;
      const n = Math.max(1, Math.ceil((d * U) / 2.6)),
        ox = ((-(Y - y) / d) * path.w) / (2 * U),
        oy = (((X - x) / d) * path.w) / (2 * U);
      let at = pos.length / 3;
      for (let j = 0; j <= n; j++) {
        const a = x + ((X - x) * j) / n,
          b = y + ((Y - y) * j) / n;
        for (const side of [-1, 1]) {
          const u = a + ox * side,
            v = b + oy * side;
          pos.push(...s.xyz(u, v, s.ground(u, v) + 0.042));
          let m = 0.91 + 0.08 * Math.sin(u * 113 + v * 47);
          ci.push(color.r * m, color.g * m, color.b * m);
        }
        if (j) {
          const k = at + j * 2;
          idx.push(k - 2, k - 1, k, k, k - 1, k + 1);
        }
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(ci, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new T.Mesh(
    g,
    new T.MeshLambertMaterial({
      vertexColors: true,
      side: T.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  mesh.userData = { role: "footpaths", disposableMaterial: true };
  return mesh;
}
export function works(s, sets, p) {
  const grp = new T.Group();
  const soils = ribbons(
    s,
    sets.flatMap((x) => x.paths),
    p,
  );
  grp.add(soils);
  grp.userData.soils = soils;
  const posts = [],
    w = [],
    bulbs = [],
    tr = [];
  const point = (xy, h) => new T.Vector3(...s.xyz(...xy, s.ground(...xy) + h));
  for (const v of sets) {
    if (!v.lit) continue;
    const near = (q) => Math.hypot(q[0] - p.x, q[1] - p.y) < 5;
    for (const [i, q] of v.poles.entries()) {
      if (!near(q)) continue;
      const b = point(q, 0);
      posts.push([b, 0.17, 6.5, 0.17, 3.25], [b, 1.45, 0.13, 0.13, 6.2]);
      for (const off of [-0.53, 0, 0.53])
        posts.push([
          b.clone().add(new T.Vector3(off, 0, 0)),
          0.12,
          0.19,
          0.12,
          6.37,
        ]);
      if (i % 4 === 0) bulbs.push(point(q, 5.95));
      if (i % 13 === 0) tr.push([b, 0.56, 0.67, 0.45, 4.65]);
    }
    const wire = (a, b, offset, sag) => {
      let prev;
      for (let j = 0; j <= 8; j++) {
        const k = j / 8,
          v = a.clone().lerp(b, k);
        v.x += offset;
        v.y -= sag * 4 * k * (1 - k);
        if (prev) w.push(...prev.toArray(), ...v.toArray());
        prev = v;
      }
    };
    for (const [i, j] of v.spans)
      if (near(v.poles[i]) || near(v.poles[j]))
        for (const offset of [-0.53, 0, 0.53])
          wire(point(v.poles[i], 6.44), point(v.poles[j], 6.44), offset, 0.68);
    for (const [i, end] of v.services)
      if (near(end)) wire(point(v.poles[i], 6.17), point(end, 2.7), 0, 0.35);
  }
  const box = (arr, c) => {
    if (!arr.length) return;
    const m = new T.InstancedMesh(
        new T.BoxGeometry(),
        new T.MeshLambertMaterial({ color: c }),
        arr.length,
      ),
      o = new T.Object3D();
    arr.forEach(([b, x, y, z, h], i) => {
      o.position.copy(b);
      o.position.y += h;
      o.scale.set(x, y, z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.userData.disposableMaterial = true;
    grp.add(m);
  };
  for (const v of sets)
    for (const site of v.projects || []) {
      const [x, y] = site.xy;
      if (Math.hypot(x - p.x, y - p.y) > 6) continue;
      const b = point(site.xy, 0);
      if (site.type === "well") {
        const mat = new T.MeshLambertMaterial({ color: 0x9f9580 }),
          m = new T.Mesh(new T.TorusGeometry(1, 0.26, 6, 12), mat);
        m.rotation.x = Math.PI / 2;
        m.position.copy(b);
        m.position.y += 0.65;
        m.userData.disposableMaterial = true;
        grp.add(m);
        box(
          [
            [b.clone().add(new T.Vector3(-1, 0, 0)), 0.14, 2.3, 0.14, 1.15],
            [b.clone().add(new T.Vector3(1, 0, 0)), 0.14, 2.3, 0.14, 1.15],
            [b, 2.35, 0.17, 0.17, 2.22],
          ],
          0x765536,
        );
      } else if (["school", "health"].includes(site.type)) {
        box(
          [[b, 7, 2.7, 4.3, 1.35]],
          site.type === "school" ? 0xe2c785 : 0xe1e4d4,
        );
        box([[b, 7.6, 0.42, 4.8, 2.8]], 0x975740);
        box(
          [[b.clone().add(new T.Vector3(0, 0, 2.2)), 1.05, 1.8, 0.12, 0.9]],
          0x544633,
        );
      } else if (site.type === "bridge" && site.banks) {
        const [a, z] = site.banks.map((xy) => point(xy, 0.35)),
          mesh = new T.Mesh(
            new T.BoxGeometry(1.55, 0.22, a.distanceTo(z)),
            new T.MeshLambertMaterial({ color: 0x936c48 }),
          );
        mesh.position.copy(a).lerp(z, 0.5);
        mesh.lookAt(z);
        mesh.userData.disposableMaterial = true;
        grp.add(mesh);
      } else if (site.type === "path") {
        for (const pth of v.paths.filter(
          (t) =>
            t.type === "village" &&
            t.xy.some((q) => Math.hypot(q[0] - x, q[1] - y) < 1.1),
        )) {
          const m = ribbons(s, [{ ...pth, type: "hill", w: 2.35 }], p);
          m.position.y += 0.02;
          grp.add(m);
        }
      }
    }
  box(posts, 0x867d68);
  box(tr, 0x5b746d);
  if (w.length) {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(w, 3));
    const m = new T.LineSegments(
      g,
      new T.LineBasicMaterial({ color: 0x514c41 }),
    );
    m.userData.disposableMaterial = true;
    grp.add(m);
  }
  if (bulbs.length) {
    const g = new T.SphereGeometry(0.24, 7, 5),
      m = new T.InstancedMesh(
        g,
        new T.MeshLambertMaterial({
          color: 0xd7ba86,
          emissive: 0xffcc83,
          emissiveIntensity: 0,
        }),
        bulbs.length,
      ),
      pool = new T.InstancedMesh(
        new T.CircleGeometry(1, 14),
        new T.MeshBasicMaterial({
          color: 0xdcaa68,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -3,
        }),
        bulbs.length,
      );
    const o = new T.Object3D();
    bulbs.forEach((pt, i) => {
      o.position.copy(pt);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      o.rotation.x = -Math.PI / 2;
      o.position.y -= 5.89;
      o.scale.set(2.6, 3.8, 1);
      o.updateMatrix();
      pool.setMatrixAt(i, o.matrix);
    });
    for (const ob of [m, pool]) {
      ob.userData.glow = 0;
      ob.userData.disposableMaterial = true;
      grp.add(ob);
    }
  }
  grp.userData.bulbs = bulbs;
  return grp;
}
