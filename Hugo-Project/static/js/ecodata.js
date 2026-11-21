import { get, url, unzip } from "./grid.js";
const keys = [
  "cover",
  "soil",
  "rock",
  "rain",
  "coast-km",
  "lake-mean",
  "ocean",
];
let pending;
export function ecology() {
  return (pending ??= (async () => {
    const [src, presets, falls, marine] = await Promise.all([
      get("ecology/sources.json"),
      get("ecology/presets.json"),
      get("ecology/waterfalls.json"),
      get("ecology/ocean-mesh.json"),
    ]);
    const arrays = await Promise.all(
      keys.map(async (k) => {
        const r = await fetch(url(`ecology/${k}.bin.gz`));
        if (!r.ok) throw Error("Missing regional observation: " + k);
        return new Uint8Array(await unzip(await r.arrayBuffer()));
      }),
    );
    const W = src.width,
      H = src.height,
      N = W * H;
    arrays.forEach((a, i) => {
      if (a.length !== N * (i === 0 ? 7 : 1))
        throw Error("Truncated " + keys[i]);
    });
    return {
      presets,
      falls,
      marine,
      surface(x, y) {
        const u = x / 16 - 0.5,
          v = y / 16 - 0.5,
          i = Math.floor(u),
          j = Math.floor(v),
          p = u - i,
          q = v - j,
          k = (a, b) =>
            Math.min(H - 1, Math.max(0, b)) * W +
            Math.min(W - 1, Math.max(0, a)),
          A = k(i, j),
          B = k(i + 1, j),
          C = k(i, j + 1),
          D = k(i + 1, j + 1);
        const mix = (z, o = 0) =>
          ((1 - p) * z[A + o] + p * z[B + o]) * (1 - q) +
          ((1 - p) * z[C + o] + p * z[D + o]) * q;
        return {
          rock: arrays[2][k(Math.round(u), Math.round(v))],
          marsh: mix(arrays[0], 4 * N),
          coast: mix(arrays[4]),
          depth: mix(arrays[5]) / 2,
        };
      },
      at(x, y) {
        let k =
          Math.min(H - 1, Math.max(0, Math.floor(y / 16))) * W +
          Math.min(W - 1, Math.max(0, Math.floor(x / 16)));
        const [c, s, g, r, kil, d] = arrays;
        return {
          crop: c[k],
          grass: c[k + N],
          shrub: c[k + 2 * N],
          bare: c[k + 3 * N],
          marsh: c[k + 4 * N],
          mangrove: c[k + 5 * N],
          built: c[k + 6 * N],
          soil: s[k],
          rock: g[k],
          rain: r[k] / 20,
          coast: kil[k],
          depth: d[k] / 2,
          ocean: arrays[6][k],
        };
      },
    };
  })().catch((e) => {
    pending = null;
    throw e;
  }));
}
