import * as T from "../vendor/three.module.min.js";
import { drainage } from "./regional-weather.js";
export function rainGround(s, p, paths, tier) {
  const g = new T.Group();
  if (!tier) return g;
  const pools = [],
    lines = [],
    at = (x, y) => s.ground(x, y);
  let samples = [];
  for (let j = -2; j <= 2; j++)
    for (let i = -2; i <= 2; i++)
      samples.push([p.x + i * 0.16, p.y + j * 0.16, false]);
  for (const z of paths)
    for (const v of z.xy.slice(0, 4))
      if (Math.hypot(v[0] - p.x, v[1] - p.y) < 0.85) samples.push([...v, true]);
  for (const [x, y, rut] of samples.slice(0, 48)) {
    const cell = s.t.at(x, y);
    if (!cell?.d || [3, 4].includes(cell.c)) continue;
    const flow = drainage(at, x, y, 6),
      end = flow.at(-1),
      [X, Y, z] = end,
      ns = [
        [0.017, 0],
        [-0.017, 0],
        [0, 0.017],
        [0, -0.017],
      ].map(([u, v]) => at(X + u, Y + v));
    if (rut || (Math.min(...ns) >= z - 0.018 && Math.max(...ns) - z < 0.26))
      pools.push(s.xyz(X, Y, z + 0.055));
    for (let k = 1; k < flow.length; k++)
      for (const v of [flow[k - 1], flow[k]])
        lines.push(...s.xyz(v[0], v[1], v[2] + 0.065));
  }
  const m = new T.InstancedMesh(
    new T.CircleGeometry(1, 14),
    new T.MeshBasicMaterial({
      color: 0x9caea0,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
    pools.length || 1,
  );
  g.add(m);
  const ge = new T.BufferGeometry();
  ge.setAttribute("position", new T.Float32BufferAttribute(lines, 3));
  const flow = new T.LineSegments(
    ge,
    new T.LineBasicMaterial({
      color: 0x90a69a,
      transparent: true,
      opacity: 0.6,
    }),
  );
  g.add(flow);
  m.userData.disposableMaterial = flow.userData.disposableMaterial = true;
  g.userData.stats = {
    basins: pools.length,
    downhillSegments: lines.length / 6,
    wetness: 0,
  };
  let last = -10;
  g.userData.wetUpdate = (w) => {
    const value = Math.round(w.storage * 32) / 32;
    if (value === last) return;
    last = value;
    g.userData.stats.wetness = value;
    m.count = pools.length;
    m.visible = value > 0.02;
    let o = new T.Object3D();
    pools.forEach((a, i) => {
      o.position.fromArray(a);
      o.rotation.set(-Math.PI / 2, 0, i * 1.7);
      o.scale.set(
        (1.4 + (i % 3)) * Math.sqrt(value),
        (0.8 + (i % 2)) * Math.sqrt(value),
        1,
      );
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    flow.visible = value > 0.13;
    flow.material.opacity = Math.min(0.7, value);
  };
  return g;
}
