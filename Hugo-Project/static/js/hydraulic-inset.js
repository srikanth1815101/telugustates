// Extra geometric detail around the local-to-survey join. The bank chart describes XY, NOT height.
import * as T from "../vendor/three.module.min.js";
import { url, unzip } from "./grid.js";
import { ACRE } from "./metres.js";
import { surveyGrade } from "./survey-collar.js";
export function stageReader(meta) {
  const avail = new Set(meta.surveyPages),
    cache = new Map();
  return async function (x, y) {
    const I = Math.floor(x / 512),
      J = Math.floor(y / 512),
      window = new Map();
    await Promise.all(
      Array.from({ length: 9 }, async (_, n) => {
        const k = I + (n % 3) - 1 + "_" + (J + Math.floor(n / 3) - 1);
        if (!avail.has(k)) return;
        let job = cache.get(k);
        if (!job) {
          job = fetch(url("hydraulics/survey/" + k + ".bin.gz")).then(
            async (r) => {
              if (!r.ok) throw Error("Missing horizon heads " + k);
              const d = new Uint16Array(await unzip(await r.arrayBuffer()));
              if (d.length !== 16384) throw Error("Bad horizon heads");
              return d;
            },
          );
          cache.set(k, job);
        }
        window.set(k, await job);
      }),
    );
    while (cache.size > 14) cache.delete(cache.keys().next().value);
    return function (X, Y) {
      let best = Infinity,
        code = 0;
      const u = X / 4 - 0.5,
        v = Y / 4 - 0.5,
        i = Math.round(u),
        j = Math.round(v);
      for (let b = j - 1; b <= j + 1; b++)
        for (let a = i - 1; a <= i + 1; a++) {
          const d = (u - a) ** 2 + (v - b) ** 2;
          if (d >= best || d >= 2.65) continue;
          const t = window.get(Math.floor(a / 128) + "_" + Math.floor(b / 128)),
            h = t?.[(b & 127) * 128 + (a & 127)];
          if (h) {
            best = d;
            code = h;
          }
        }
      return code
        ? [
            (code & 32767) / 16 - 64,
            1 - T.MathUtils.smoothstep(best, 0.9, 2.65),
          ]
        : null;
    };
  };
}
export function insetGrade(data, read, x, y) {
  const v = read(x, y),
    dry = surveyGrade(data, x, y);
  return v ? dry + (v[0] - dry) * v[1] : dry;
}
// The ring edge and the collar use the exact same 4-acre polyline; intermediate bank vertices interpolate its straight segments.
export function insetBoundary(data, read, box, k, x, y) {
  const v = k % 2 ? y : x,
    a = 4 * Math.floor(v / 4),
    h = (z) => insetGrade(data, read, k % 2 ? x : z, k % 2 ? z : y);
  return h(a) + ((h(a + 4) - h(a)) * (v - a)) / 4;
}
export function hydraulicInset(data, cut, s, read) {
  const mid = [(cut[0] + cut[2]) / 2, (cut[1] + cut[3]) / 2],
    half = (cut[2] - cut[0]) / 2,
    ext = 160,
    out = [cut[0] - ext, cut[1] - ext, cut[2] + ext, cut[3] + ext],
    p = [],
    uv = [],
    idx = [];
  for (let k = 0; k < 4; k++) {
    let prev = null;
    for (let r = 0; r <= ext; r += 4) {
      const rad = half + r,
        n = rad / 2,
        row = [];
      for (let j = 0; j <= n; j++) {
        const a = 4 * j - rad,
          X = mid[0] + [a, rad, -a, -rad][k],
          Y = mid[1] + [-rad, a, rad, -a][k];
        // Spend samples where there is a water stage. The dry survey is smooth at this scale. Both boundary polylines remain complete.
        const wet = read(X, Y);
        if (
          r > 0 &&
          r < ext &&
          j !== 0 &&
          j !== n &&
          j % 4 !== 0 &&
          !wet &&
          data.region(X, Y)
        )
          continue;
        const t = T.MathUtils.smoothstep(r, ext - 32, ext),
          h =
            surveyGrade(data, X, Y) +
            (wet ? (wet[0] - surveyGrade(data, X, Y)) * wet[1] * (1 - t) : 0);
        row.push([j / n, data.region(X, Y) ? p.length / 3 : -1]);
        p.push(...s.xyz(X, Y, h * s.relief));
        uv.push(X / (data.w * data.step), Y / (data.rows * data.step));
      }
      if (prev) {
        const tri = (a, b, c) => {
          if (Math.min(a, b, c) >= 0) idx.push(a, b, c);
        };
        let i = 0,
          j = 0;
        while (i + 1 < prev.length || j + 1 < row.length) {
          if (
            j + 1 === row.length ||
            (i + 1 < prev.length && prev[i + 1][0] < row[j + 1][0])
          )
            tri(prev[i][1], row[j][1], prev[++i][1]);
          else tri(prev[i][1], row[j][1], row[++j][1]);
        }
      }
      prev = row;
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = new T.MeshLambertMaterial({
    map: data.texture,
    emissiveMap: data.texture,
    emissive: 0xffffff,
    emissiveIntensity: 0.34,
    side: T.DoubleSide,
  });
  mat.onBeforeCompile = (sh) => data.banks.apply(sh);
  const m = new T.Mesh(g, mat);
  m.userData = { role: "hydraulic-survey", disposableMaterial: true, cut: out };
  return m;
}
