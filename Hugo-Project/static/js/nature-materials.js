import { groundVert, groundFrag } from "./ground-weave.js";
import { film, waterVert, waterFrag } from "./hydro-shaders.js";
import { ACRE } from "./metres.js";
import { url } from "./grid.js";
import * as T from "../vendor/three.module.min.js";
const lakeN = 6;
export function materials(u = {}) {
  const grain = new T.TextureLoader().load(
    new URL("../art/nature-grain.png", import.meta.url).href,
  );
  grain.wrapT = grain.wrapS = T.RepeatWrapping;
  grain.anisotropy = 2;
  const names = [
    "leafy_grass",
    "coast_sand_02",
    "brown_mud",
    "rock_face_03",
    "forest_ground_04",
  ];
  const surfaces = names.map((n) => {
    const t = new T.TextureLoader().load(url("library/surfaces/" + n + ".jpg"));
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
  // A tiny angular profile of the actual opposite terrain (bearing, apparent elevation, range and cover), not a second scene render.
  // Survey it once at a window handoff near running water. It supplies a soft, local land/sky boundary to the moving normals.
  const bearings = 64,
    profile = new Uint8Array(bearings * 4),
    bankSky = new T.DataTexture(profile, bearings, 1);
  bankSky.minFilter = T.LinearFilter;
  bankSky.magFilter = T.LinearFilter;
  bankSky.wrapS = T.RepeatWrapping;
  bankSky.needsUpdate = true;
  function surveyReflection(s) {
    const [x, y] = s.focus,
      anchor = uniforms.bankStation.value;
    anchor.w = 0;
    if (s.surveyGrid) return;
    let station = null;
    for (const r of [0, 18, 43, 85, 135]) {
      for (let k = 0; k < (r ? 12 : 1); k++) {
        const angle = (k * Math.PI) / 6,
          X = x + (r * Math.cos(angle)) / ACRE,
          Y = y - (r * Math.sin(angle)) / ACRE,
          h = s.sample(X, Y);
        if (
          h.drawn &&
          h.sea < 0.05 &&
          h.depth > 0.25 &&
          s.current(X, Y, 1, false)[2] > 0.07
        ) {
          station = [X, Y, h.line];
          break;
        }
      }
      if (station) break;
    }
    if (!station) return;
    const [X, Y, line] = station,
      at = s.xyz(X, Y, line);
    for (let i = 0; i < bearings; i++) {
      const th = ((i + 0.5) * 2 * Math.PI) / bearings,
        dx = Math.cos(th),
        dz = Math.sin(th);
      let top = -0.015,
        range = 2800,
        cover = 0;
      for (const m of [
        18, 35, 64, 99, 148, 215, 305, 430, 590, 800, 1080, 1450, 1950, 2600,
        3380,
      ]) {
        const v = s.sample(X + (m * dx) / ACRE, Y - (m * dz) / ACRE);
        if (v.w >= 0 || !v.drawn) continue;
        const h = (v.z - line) / m;
        if (h > top) {
          top = h;
          range = m;
          cover = v.m?.[3] || 0;
        }
      }
      profile[i * 4] = Math.round(
        255 * Math.max(0, Math.min(1, (top + 0.02) / 0.82)),
      );
      profile[i * 4 + 1] = Math.round((255 * Math.log2(range / 12)) / 9);
      profile[i * 4 + 2] = Math.round(255 * Math.max(0, Math.min(1, cover)));
      profile[i * 4 + 3] = 255;
    }
    anchor.set(at[0], at[1], at[2], 1);
    bankSky.needsUpdate = true;
  }
  const uniforms = {
    ...Object.fromEntries(surfaces.map((t, i) => ["ground" + i, { value: t }])),
    ...u,
    bankSky: { value: bankSky },
    bankStation: { value: new T.Vector4() },
    hydroOffset: { value: new T.Vector2() },
    soilDamp: { value: 0 },
    rillNear: { value: null },
    rillFar: { value: null },
    rillOn: { value: 0 },
    pondBlend: { value: 1 },
    rillCentre: { value: new T.Vector2() },
    liquidTime: { value: 0 },
    wakeClock: { value: 0 },
    grain: { value: grain },
    summer: { value: 0 },
    calmWater: { value: 0 },
    lowWakes: { value: false },
    actor: { value: new T.Vector4(0, 0, 0, 0) },
    cameraInPatch: { value: new T.Vector3() },
    heading: { value: new T.Vector2(0, -1) },
    wakes: {
      value: Array.from({ length: lakeN }, () => new T.Vector4(0, 0, -1000, 0)),
    },
  };
  const light = `uniform vec3 uSun,uMoon,uHor,uZen;uniform float uDay,uFog,uClock,uDetail;`;
  const makeLand = (lite) =>
    new T.ShaderMaterial({
      uniforms,
      side: T.DoubleSide,
      vertexShader: groundVert,
      fragmentShader: light + film + groundFrag(lite),
    });
  const land = makeLand(false);
  const water = new T.ShaderMaterial({
    uniforms,
    side: T.DoubleSide,
    transparent: true,
    forceSinglePass: true,
    depthWrite: false,
    vertexShader: waterVert,
    fragmentShader: waterFrag(false),
  });
  const landLow = makeLand(true);
  // Battery Saver is a real rendering path, not just a frame counter. Retain a legible
  // shallow/deep boundary, wave/impact motion and three rather than six interactive wakes.
  const waterSaver = new T.ShaderMaterial({
    uniforms,
    side: T.DoubleSide,
    transparent: true,
    forceSinglePass: true,
    depthWrite: false,
    vertexShader: waterVert,
    fragmentShader: waterFrag(true),
  });
  const surfDepth = new T.ShaderMaterial({
    uniforms,
    vertexShader: waterVert,
    fragmentShader: `varying float depth,wetM;void main(){if(depth<.68||wetM<=.03)discard;gl_FragColor=vec4(0.);}`,
    depthWrite: true,
    depthTest: true,
    colorWrite: false,
    side: T.DoubleSide,
    blending: T.NoBlending,
  });
  let slot = 0;
  return {
    land,
    water,
    landLow,
    waterSaver,
    surfDepth,
    surveyReflection,
    bankSky,
    uniforms,
    grain,
    surfaces,
    ripple(x, z, t, strength) {
      uniforms.wakes.value[slot++ % (uniforms.lowWakes?.value ? 3 : lakeN)].set(
        x,
        z,
        t,
        strength,
      );
    },
    resetWakes() {
      uniforms.wakes.value.forEach((w) => (w.w = 0));
      uniforms.actor.value.w = 0;
    },
  };
}
