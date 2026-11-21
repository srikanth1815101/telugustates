// Water on the relief *outside* the walkable mesh. Sample coverage in map space, not at ring vertices.
// Only a 3-by-3 window of 512-cell pages lives on the GPU (one R8 texture, 2.25 MiB plus mip levels). Missing chart pages are dry.
import * as T from "../vendor/three.module.min.js";
import { url, unzip } from "./grid.js";
export function surveyWater(index, dry, extent) {
  const P = index.pageCells,
    N = P * 3,
    empty = new T.DataTexture(new Uint8Array(1), 1, 1, T.RedFormat);
  empty.needsUpdate = true;
  const u = {
    bankDry: { value: dry },
    bankChart: { value: empty },
    bankWindow: { value: new T.Vector4(0, 0, 1 / N, 1 / N) },
    bankExtent: { value: new T.Vector2(...extent) },
    bankAmount: { value: 0 },
  };
  let live = false,
    dead = false,
    request = "",
    serial = 0,
    display = "",
    err = "",
    strength = 0;
  const cache = new Map();
  async function page(x, y) {
    const tag = x + "_" + y;
    if (!index.pages[tag]) return null;
    const hit = cache.get(tag);
    if (hit) {
      cache.delete(tag);
      cache.set(tag, hit);
      return hit;
    }
    const job = (async () => {
      const r = await fetch(url("survey/banks/" + tag + ".bin.gz"));
      if (!r.ok) throw Error("Missing water chart " + tag);
      const a = new Uint8Array(await unzip(await r.arrayBuffer()));
      if (a.length !== P * P) throw Error("Invalid water chart " + tag);
      return a;
    })();
    cache.set(tag, job);
    while (cache.size > 12) cache.delete(cache.keys().next().value);
    return job;
  }
  function update(x, y, range) {
    strength = 1 - T.MathUtils.smoothstep(range, 26000, 65000);
    u.bankAmount.value = live ? strength : 0;
    if (dead || strength <= 0) return;
    const i = Math.floor(x / P) - 1,
      j = Math.floor(y / P) - 1,
      tag = i + "," + j;
    if (tag === request) return;
    request = tag;
    const v = ++serial;
    Promise.all(
      Array.from({ length: 9 }, (_, k) =>
        page(i + (k % 3), j + Math.floor(k / 3)),
      ),
    )
      .then((pages) => {
        if (v !== serial || dead) return;
        const data = new Uint8Array(N * N);
        for (let k = 0; k < 9; k++) {
          const a = pages[k];
          if (!a) continue;
          const start = Math.floor(k / 3) * P * N + (k % 3) * P;
          for (let b = 0; b < P; b++)
            data.set(a.subarray(b * P, (b + 1) * P), start + b * N);
        }
        const t = new T.DataTexture(data, N, N, T.RedFormat);
        t.magFilter = T.LinearFilter;
        t.minFilter = T.LinearMipmapLinearFilter;
        t.generateMipmaps = true;
        t.needsUpdate = true;
        if (live) u.bankChart.value.dispose();
        u.bankChart.value = t;
        u.bankWindow.value.set(i * P, j * P, 1 / N, 1 / N);
        u.bankAmount.value = strength;
        live = true;
        display = tag;
        err = "";
      })
      .catch((e) => {
        if (dead || v !== serial) return;
        err = String(e);
        console.warn("Coarse water chart retained:", err);
      });
  }
  function apply(sh) {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader =
      `uniform sampler2D bankChart,bankDry;uniform vec4 bankWindow;uniform vec2 bankExtent;uniform float bankAmount;\n` +
      sh.fragmentShader.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
 vec2 bankUV=(vMapUv*bankExtent-bankWindow.xy)*bankWindow.zw;float chartEdge=min(min(bankUV.x,bankUV.y),min(1.-bankUV.x,1.-bankUV.y));float chartFade=bankAmount*smoothstep(.004,.065,chartEdge);
 if(chartFade>0.){float ink=texture2D(bankChart,bankUV).r;ink=mix(ink,smoothstep(.12,.72,ink),.55);vec3 mapLand=texture2D(bankDry,vMapUv).rgb;diffuseColor.rgb=mix(diffuseColor.rgb,mix(mapLand,vec3(.190,.407,.412),ink),chartFade);}`,
      );
    if (sh.fragmentShader.includes("#include <emissivemap_fragment>"))
      sh.fragmentShader = sh.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        "totalEmissiveRadiance *= diffuseColor.rgb;",
      );
  }
  return {
    update,
    apply,
    status: () => ({ window: display, amount: u.bankAmount.value, error: err }),
    dispose() {
      dead = true;
      ++serial;
      cache.clear();
      if (live) u.bankChart.value.dispose();
      empty.dispose();
      dry.dispose();
    },
  };
}
