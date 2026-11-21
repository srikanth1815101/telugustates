import { doorLeaf } from "./home-interior.js";
import { registerTerraces } from "./house-ground.js";
import { nameboard } from "./nameboard.js";
// Restore the original resident's exterior as the visible collision target; never create new plot records here.
import * as T from "../vendor/three.module.min.js";
import { addForms, makeHouse } from "./resident-forms.js";
import { ACRE, basis } from "./metres.js";
const forms = {
  wall: new T.BoxGeometry(),
  disc: new T.CylinderGeometry(0.5, 0.5, 1, 8),
  orb: new T.IcosahedronGeometry(0.5, 0),
  trunk: new T.CylinderGeometry(0.3, 0.48, 1, 6),
  farCrown: new T.IcosahedronGeometry(0.5, 0),
};
addForms(forms);
export function padDistance(h, x, y) {
  const { fx, fy, rx, ry } = basis(h),
    dx = (x - h.centre[0]) * ACRE,
    dy = (y - h.centre[1]) * ACRE;
  return Math.max(
    Math.abs(dx * rx + dy * ry) - h.size_m[0] * 0.5,
    Math.abs(dx * fx + dy * fy) - h.size_m[1] * 0.5,
  );
}
export function preparePads(s, rows) {
  s.homeMap = new Map();
  s.approach = new Map();
  const beds = new Map(registerTerraces(s, rows).map((p) => [p.h, p]));
  for (const [x, y, , , , h] of rows) {
    if (!h) continue;
    s.homeMap.set(`${x},${y}`, beds.get(h));
    if (h.door && h.gate) {
      const [a, b] = h.door,
        [c, d] = h.gate,
        dx = c - a,
        dy = d - b,
        n = Math.hypot(dx, dy) || 1,
        X = c + ((dx / n) * 10) / ACRE,
        Y = d + ((dy / n) * 10) / ACRE;
      for (
        let j = Math.floor(Math.min(b, Y) - 0.06);
        j <= Math.floor(Math.max(b, Y) + 0.06);
        j++
      )
        for (
          let i = Math.floor(Math.min(a, X) - 0.06);
          i <= Math.floor(Math.max(a, X) + 0.06);
          i++
        ) {
          const key = i + "," + j,
            seg = s.approach.get(key) || [];
          seg.push([a, b, X, Y]);
          s.approach.set(key, seg);
        }
    }
  }
}
export function residents(s, rows, p, tier) {
  const group = new T.Group(),
    bins = new Map(),
    o = new T.Object3D(),
    col = new T.Color();
  let drawn = 0;
  const put = (
    kind,
    shape,
    X,
    Y,
    Z,
    sx,
    sy,
    sz,
    c,
    role,
    ry = 0,
    rx = 0,
    rz = 0,
  ) => {
    if (!forms[shape]) throw Error("Unknown resident form " + shape);
    const key = kind.startsWith("window-") ? kind + ":" + shape : shape;
    const bin = bins.get(key) || [];
    bins.set(key, bin);
    o.rotation.set(rx, ry, rz, "YXZ");
    o.position.set(X, Y, Z);
    o.scale.set(sx, sy, sz);
    o.updateMatrix();
    bin.push([o.matrix.clone(), col.set(c).clone()]);
  };
  for (const [, , u, , , h] of rows) {
    if (!h) continue;
    const d = Math.hypot(p.x - h.centre[0], p.y - h.centre[1]) * ACRE;
    if (d > (tier ? 540 : 285)) continue;
    drawn++;
    makeHouse(s, h, u, d, tier, put);
    if (d < (tier ? 310 : 155)) {
      const leaf = doorLeaf(s, h, u);
      group.add(leaf);
      (group.userData.doors ??= new Map()).set(u, leaf);
    }
    if (typeof document !== "undefined") nameboard(group, s, h, u, put);
  }
  for (const [key, arr] of bins) {
    const shape = key.split(":").at(-1);
    const geo = forms[shape].clone(),
      mat = new T.MeshLambertMaterial(),
      mesh = new T.InstancedMesh(geo, mat, arr.length);
    for (let i = 0; i < arr.length; i++) {
      mesh.setMatrixAt(i, arr[i][0]);
      mesh.setColorAt(i, arr[i][1]);
    }
    mesh.computeBoundingSphere();
    mesh.castShadow = mesh.receiveShadow = tier === 2;
    mesh.userData = {
      role: "resident-" + shape,
      cullable: true,
      disposableMaterial: true,
    };
    if (key.startsWith("window-")) {
      mat.emissive.set(0xffbc67);
      mat.emissiveIntensity = 0;
      mesh.userData.glow = +key[7];
    }
    group.add(mesh);
  }
  group.userData.houses = drawn;
  return group;
}

export function clearApproach(s, x, y, r = 1.2) {
  for (const [a, b, c, d] of s.approach?.get(
    Math.floor(x) + "," + Math.floor(y),
  ) || []) {
    const dx = c - a,
      dy = d - b,
      t = Math.max(
        0,
        Math.min(1, ((x - a) * dx + (y - b) * dy) / (dx * dx + dy * dy || 1)),
      );
    if (Math.hypot(x - a - t * dx, y - b - t * dy) * ACRE <= r) return true;
  }
  return false;
}
