import { insetBoundary, insetGrade } from "./hydraulic-inset.js";
// Join the top of the submitted land/water edge to the survey grid. No square void where the two DEM levels disagree.
// At the outer rectangle, align to the survey's texel centres and its triangle diagonal (not bilinear height).
import * as T from "../vendor/three.module.min.js";
import { ACRE as M } from "./metres.js";
export function surveyGrade(d, x, y) {
  const a = x / d.step - 0.5,
    b = y / d.step - 0.5,
    i = Math.floor(a),
    j = Math.floor(b),
    u = a - i,
    v = b - j,
    h = (a, b) => d.height(i + a, j + b);
  return u + v <= 1
    ? (1 - u - v) * h(0, 0) + u * h(1, 0) + v * h(0, 1)
    : (u + v - 1) * h(1, 1) + (1 - u) * h(0, 1) + (1 - v) * h(1, 0);
}
export function collar(data, cut, s, env, heads = null) {
  const step = data.step,
    pad = step / 2,
    half = (cut[2] - cut[0]) / 2,
    mx = cut[0] + half,
    my = cut[1] + half,
    out = [cut[0] - pad, cut[1] - pad, cut[2] + pad, cut[3] + pad],
    G = new T.BufferGeometry(),
    p = [],
    uv = [],
    rgba = [],
    ink = [],
    ix = [],
    sides = Array.from({ length: 4 }, () => new Set()),
    S = 1e9,
    F = (side, v) => sides[side].add(Math.round(v * S));
  const side = (k, t, r) => [
    mx + r * [t, 1, -t, -1][k],
    my + r * [-1, t, 1, -t][k],
  ];
  for (const a of s.axes.values()) {
    const [X, Y, V] = a,
      bt = Y[0] === cut[1],
      rt = X.at(-1) === cut[2],
      tp = Y.at(-1) === cut[3],
      lf = X[0] === cut[0];
    if (!bt && !rt && !tp && !lf) continue;
    for (const v of V) {
      if (bt && Math.abs(v.y - cut[1]) < 1e-8) F(0, (v.x - mx) / half);
      if (rt && Math.abs(v.x - cut[2]) < 1e-8) F(1, (v.y - my) / half);
      if (tp && Math.abs(v.y - cut[3]) < 1e-8) F(2, (mx - v.x) / half);
      if (lf && Math.abs(v.x - cut[0]) < 1e-8) F(3, (my - v.y) / half);
    }
  }
  const samples = ((2 * (half + pad)) / step) * 8;
  for (let k = 0; k < 4; k++) {
    for (let n = 0; n <= samples; n++) F(k, (2 * n) / samples - 1);
    if (heads)
      for (let a = 0; a <= 2 * (half + pad); a += 4) F(k, a / (half + pad) - 1);
    const ts = [...sides[k]].sort((a, b) => a - b).map((t) => t / S),
      first = p.length / 3,
      valid = [];
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i],
        [x, y] = side(k, t, half),
        xx = Math.max(cut[0] + 1e-6, Math.min(cut[2] - 1e-6, x)),
        yy = Math.max(cut[1] + 1e-6, Math.min(cut[3] - 1e-6, y)),
        v = s.sample(xx, yy),
        bank = v.w >= 0,
        top = bank ? v.line + 0.008 : v.z,
        m = v.m,
        wet = Math.min(1, Math.max(0, v.depth / 2.7));
      const land = new T.Color()
        .setRGB(0.47, 0.445, 0.27)
        .lerp(new T.Color(0.27, 0.24, 0.17), Math.max(m[1] * 0.82, m[3] * 0.47))
        .lerp(new T.Color(0.35, 0.32, 0.28), m[2]);
      for (const f of [0, 0.17, 0.53, 1]) {
        const [X, Y] = side(k, t, half + pad * f),
          coarse =
            (heads
              ? f === 1
                ? insetBoundary(data, heads, out, k, X, Y)
                : insetGrade(data, heads, X, Y)
              : surveyGrade(data, X, Y)) * s.relief,
          h = top + (coarse - top) * (f * f * (3 - 2 * f));
        p.push((X - s.o.x) * M, h, (s.o.y - Y) * M);
        uv.push(X / (data.w * step), Y / (data.rows * step));
        rgba.push(land.r, land.g, land.b, 1 - f);
        ink.push(v.w, wet);
        valid.push(f === 0 ? v.drawn : !!data.region(X, Y));
      }
      if (i > 0) {
        for (let j = 0; j < 3; j++) {
          const a = (i - 1) * 4 + j,
            b = a + 4,
            c = a + 1,
            d = b + 1;
          if (valid[a] && valid[b] && valid[c])
            ix.push(first + a, first + c, first + b);
          if (valid[b] && valid[c] && valid[d])
            ix.push(first + b, first + c, first + d);
        }
      }
    }
  }
  G.setAttribute("position", new T.Float32BufferAttribute(p, 3));
  G.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  G.setAttribute("edgeGround", new T.Float32BufferAttribute(rgba, 4));
  G.setAttribute("edgeBank", new T.Float32BufferAttribute(ink, 2));
  G.setIndex(ix);
  G.computeVertexNormals();
  const mat = new T.MeshLambertMaterial({
    map: data.texture,
    side: T.DoubleSide,
    emissive: 0xffffff,
    emissiveIntensity: 0.34,
    emissiveMap: data.texture,
  });
  mat.onBeforeCompile = (sh) => {
    data.banks.apply(sh);
    Object.assign(sh.uniforms, {
      collarHor: env.uHor,
      collarDay: env.uDay,
      collarFog: env.uFog,
    });
    sh.vertexShader =
      "attribute vec4 edgeGround;attribute vec2 edgeBank;varying vec4 edgeColour;varying vec3 edgeMix;\n" +
      sh.vertexShader.replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nedgeColour=edgeGround;edgeMix=vec3(edgeBank,-mvPosition.z);",
      );
    sh.fragmentShader =
      "varying vec4 edgeColour;varying vec3 edgeMix;uniform vec3 collarHor;uniform float collarFog,collarDay;\n" +
      sh.fragmentShader.replace(
        "#include <opaque_fragment>",
        `float ew=clamp(edgeColour.w,0.,1.);float innerWet=smoothstep(-.004,.004,edgeMix.x);float cov=texture2D(bankChart,bankUV).r;float edgeWater=mix(smoothstep(.15,.70,cov),innerWet,smoothstep(.84,1.,ew));vec3 localColour=mix(edgeColour.rgb,mix(vec3(.135,.305,.263),vec3(.095,.204,.235),edgeMix.y),edgeWater)*mix(.46,1.,collarDay);float ef=max(0.,edgeMix.z)*collarFog;localColour=mix(localColour,collarHor,1.-exp(-ef*ef));outgoingLight=mix(outgoingLight,localColour,ew*ew*(3.-2.*ew));\n#include <opaque_fragment>`,
      );
  };
  const mesh = new T.Mesh(G, mat);
  mesh.userData = {
    role: "survey-transition",
    disposableMaterial: true,
    cut: out,
  };
  return mesh;
}
