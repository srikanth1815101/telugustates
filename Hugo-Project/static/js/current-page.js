import { url, unzip } from "./grid.js";
let manifest;
const jobs = new Map();
export async function currentPage(i, j) {
  const k = i + "_" + j;
  if (jobs.has(k)) return jobs.get(k);
  const done = (async () => {
    const m = await (manifest ??= fetch(url("current/index.json")).then((r) =>
      r.json(),
    ));
    if (!m.pages[k]) return null;
    const r = await fetch(url("current/" + k + ".gz"));
    if (!r.ok) throw Error("Missing current page " + k);
    const b = new Uint8Array(await unzip(await r.arrayBuffer()));
    if (b.length !== 512 * 512 * 4) throw Error("Invalid flow chart " + k);
    return b;
  })();
  jobs.set(k, done);
  while (jobs.size > 14) jobs.delete(jobs.keys().next().value);
  try {
    return await done;
  } catch (e) {
    jobs.delete(k);
    throw e;
  }
}
// Decode an observed or connected river heading, never a prevailing compass assumption. South is positive world Z.
export function velocityAt(tiles, x, y) {
  const i = Math.floor(x - 0.5),
    j = Math.floor(y - 0.5),
    u = x - 0.5 - i,
    v = y - 0.5 - j;
  let X = 0,
    Z = 0,
    W = 0;
  for (let dy = 0; dy < 2; dy++)
    for (let dx = 0; dx < 2; dx++) {
      const a = i + dx,
        b = j + dy,
        t = tiles.cache.get((a >> 8) + "_" + (b >> 8)),
        p = t?.currentPage;
      if (!p) continue;
      const k = 4 * ((b & 511) * 512 + (a & 511)),
        w = (dx ? u : 1 - u) * (dy ? v : 1 - v);
      if (p[k + 3]) {
        X += (p[k + 1] - 128) * w;
        Z += (p[k + 2] - 128) * w;
        W += w;
      } else if (p[k]) {
        // Still water (coverage > 0, velocity == 0) dilutes adjacent river flow smoothly into slackwater; dry banks (p[k] == 0) do not.
        W += w * (p[k] / 255);
      }
    }
  const l = Math.hypot(X, Z);
  return l > 0.02 && W > 0.01 ? [X / l, Z / l, l / (49.5 * W), 0, 0] : null;
}
