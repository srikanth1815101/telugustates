import {front} from "./regional-weather.js";
import {calendar} from "./world-calendar.js";
import * as T from "../vendor/three.module.min.js";
import { xy } from "./grid.js";
const D = Math.PI / 180,
  sin = Math.sin,
  cos = Math.cos,
  clamp = (v, l = 0, h = 1) => Math.min(h, Math.max(l, v));
export const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export function noise(a, b, s = 0) {
  let n =
    Math.imul(a ^ Math.imul(s + 19, 1597334677), 374761393) +
    Math.imul(b + 17, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
// Low-precision Meeus-style ecliptic elements, then local sidereal time and ENU.
// UTC input; longitude is east-positive. Azimuth is clockwise from true north.
export function ephemeris(ms, lat, lon) {
  const days = ms / 86400000 + 2440587.5 - 2451545,
    ob = D * 23.4393,
    phi = lat * D,
    sid = D * (280.16 + 360.9856235 * days + lon),
    M = D * (357.5291 + 0.98560028 * days),
    L =
      M +
      D *
        (102.9372 +
          180 +
          1.9148 * sin(M) +
          0.02 * sin(2 * M) +
          0.0003 * sin(3 * M));
  function body(l, b) {
    const ra = Math.atan2(sin(l) * cos(ob) - Math.tan(b) * sin(ob), cos(l)),
      dc = Math.asin(sin(b) * cos(ob) + cos(b) * sin(ob) * sin(l)),
      H = sid - ra,
      e = -cos(dc) * sin(H),
      n = sin(dc) * cos(phi) - cos(dc) * cos(H) * sin(phi),
      up = sin(dc) * sin(phi) + cos(dc) * cos(H) * cos(phi);
    return {
      east: e,
      north: n,
      up,
      altitude: Math.asin(clamp(up, -1, 1)) / D,
      azimuth: (Math.atan2(e, n) / D + 360) % 360,
    };
  }
  const lm = (218.316 + 13.176396 * days) * D,
    mm = (134.963 + 13.064993 * days) * D,
    F = (93.272 + 13.22935 * days) * D,
    ml = lm + 6.289 * D * sin(mm),
    mb = 5.128 * D * sin(F);
  return {
    sun: body(L, 0),
    moon: body(ml, mb),
    lit: (1 - cos(mb) * cos(ml - L)) / 2,
  };
}
const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
export function sessionSeed() {
  try {
    let s = sessionStorage.getItem("field-weather-seed");
    if (s == null) {
      s = String(crypto.getRandomValues(new Uint32Array(1))[0]);
      sessionStorage.setItem("field-weather-seed", s);
    }
    return +s;
  } catch {
    return 711;
  }
}
export function climate(seed, lat, lon, height) {
  const synoptic = noise(seed, 19, 3),
    east = clamp((lon - 76.8) / 8),
    upland = clamp(height / 1450),
    wet = clamp(0.73 * synoptic + 0.18 * east + 0.18 * upland - 0.07),
    rain = smooth(0.66, 0.92, wet),
    warm = clamp(
      0.78 -
        0.5 * upland -
        0.19 * wet +
        0.12 * (1 - east) +
        (0.04 * (lat - 16)) / 4,
    );
  return {
    wet,
    rain,
    warm,
    wind: 0.55 + wet * 1.7 + upland * 0.9,
    icon: rain > 0.08 ? "☂" : wet > 0.46 ? "☁" : "☀",
    label:
      rain > 0.45
        ? "Rain"
        : rain > 0.08
          ? "Drizzle"
          : wet > 0.46
            ? "Cloudy"
            : "Clear",
  };
}
export function trueNorth(cg, lon, lat) {
  const [a, b] = xy(cg, lon, lat),
    [c, d] = xy(cg, lon, lat + 0.001);
  return new T.Vector3(c - a, 0, b - d).normalize();
}
export function directions(cg, lon, lat, body) {
  const north = trueNorth(cg, lon, lat);
  return new T.Vector3(
    -north.z * body.east + north.x * body.north,
    body.up,
    north.x * body.east + north.z * body.north,
  ).normalize();
}
export function atmosphere(scene, a, reduced) {
  const sun = new T.DirectionalLight(),
    moon = new T.DirectionalLight(),
    hemi = new T.HemisphereLight();
  scene.add(sun, sun.target, moon, moon.target, hemi);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  Object.assign(sun.shadow.camera, {
    left: -27,
    right: 27,
    bottom: -27,
    top: 27,
    near: 0.5,
    far: 140,
  });
  sun.shadow.normalBias = 0.025;
  sun.shadow.bias = -0.0003;
  const U = (v) => ({ value: v }),
    uni = {
      uSun: U(new T.Vector3()),
      uMoon: U(new T.Vector3()),
      uZen: U(new T.Color()),
      uHor: U(new T.Color()),
      uSunCol: U(new T.Color()),
      uDay: U(1),
      uChart: U(1),
      uDetail: U(1),
      uLit: U(0.5),
      uRain: U(0),
      uCloud: U(0),
      uClock: U(0),
      uWind: U(1),
      uWeatherTint: U(0.5),
      uFog: U(0.00026),
      uGrid: U(0),
      uCloudShadow: U(0),
      uCloudPos: U(
        Array.from({ length: 6 }, () => new T.Vector4(0, -1000, 0, 1)),
      ),
    };
  const sky = new T.Mesh(
    new T.SphereGeometry(1, 24, 12),
    new T.ShaderMaterial({
      uniforms: uni,
      side: T.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 dir,bg;uniform vec3 uSun,uMoon,uZen,uHor,uSunCol;uniform float uLit,uDay,uChart;
void main(){dir=position;vec3 d=normalize(dir);vec3 c=mix(uHor,uZen,smoothstep(-.025,.77,d.y));float sg=pow(max(dot(d,uSun),0.),30.)*smoothstep(-.08,.04,uSun.y);c+=uSunCol*sg*.20;c+=vec3(.64,.75,1.)*pow(max(dot(d,uMoon),0.),110.)*.055*(1.-uDay*.68);c=mix(c,vec3(.799,.847,.738),uChart);bg=mix(12.92*c,1.055*pow(max(c,vec3(0.)),vec3(.4166667))-.055,step(vec3(.0031308),c));gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec3 dir,bg;uniform vec3 uSun,uMoon,uSunCol;uniform float uDay,uChart,uLit;void main(){vec3 d=normalize(dir);float sun=smoothstep(.99978,.99994,dot(d,uSun))*smoothstep(-.08,.04,uSun.y);float moon=smoothstep(.99966,.9999,dot(d,uMoon))*(1.-uDay*.68);vec3 c=mix(bg,mix(vec3(1.,.86,.61),vec3(1.,.98,.89),uDay),sun*(1.-uChart));gl_FragColor=vec4(mix(c,vec3(.81,.88,.99),moon*(1.-uChart)*(.23+.77*uLit)),1.);}`,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = 49;
  scene.add(sky);
  const sp = [];
  for (let i = 0; i < 190; i++) {
    const y = 0.04 + noise(i, 17) * 0.96,
      az = noise(i, 38) * Math.PI * 2,
      r = Math.sqrt(1 - y * y);
    sp.push(r * Math.cos(az), y, r * Math.sin(az));
  }
  const sg = new T.BufferGeometry();
  sg.setAttribute("position", new T.Float32BufferAttribute(sp, 3));
  const stars = new T.Points(
    sg,
    new T.PointsMaterial({
      color: "#dbe5fa",
      size: 1.35,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    }),
  );
  stars.frustumCulled = false;
  stars.renderOrder = -19;
  scene.add(stars);
  scene.fog = new T.FogExp2(0xdce5d5, 0.00027);
  let seasonSeed = a.worldConfig?.seed ?? 17061,
    last = -Infinity,
    lastLL = [],
    weather,
    skyData,
    timeLabel;
  const peach = new T.Color("#efb49b"),
    night = new T.Color("#7a8b9c"),
    dayH = new T.Color("#c6deda"),
    blue = new T.Color("#76b4cf"),
    nite = new T.Color("#23344a"),
    rainGrey = new T.Color("#a5b3ae"),
    lightSun = new T.Color("#ffedcc"),
    lightDusk = new T.Color("#ecad88");
  let lastOpt = "";
  function update(
    ms,
    loc,
    elev,
    settings = { time: "live", season: "winter" },
  ) {
    const real=ms, day=calendar(ms,settings.worldConfig||{epoch:'2026-01-01T00:00:00+05:30',yearRealDays:28,defaultDayHours:4},settings.time,settings.hour);ms=day.ms;
    const opt = [
      settings.time,
      settings.season,
      settings.hour,
      settings.weather,
    ].join(":");
    if (lastOpt !== opt) {
      last = -Infinity;
      lastOpt = opt;
    }
    if (
      real - last < 1000 &&
      real >= last &&
      Math.abs(loc[0] - lastLL[0]) < 0.03 &&
      Math.abs(loc[1] - lastLL[1]) < 0.03
    )
      return;
    last = real;
    lastLL = [...loc];
    skyData = ephemeris(ms, loc[1], loc[0]);
    weather=front(real,loc,elev,settings.worldConfig||{epoch:'2026-01-01T00:00:00+05:30',yearRealDays:28,defaultDayHours:4,seed:17061},settings.season,settings.weather,settings.regional);
    timeLabel = fmt.format(ms) + " IST";
    const dt = smooth(-7, 15, skyData.sun.altitude),
      tw = 1 - smooth(-2, 16, Math.abs(skyData.sun.altitude));
    uni.uSun.value.copy(directions(a.project, ...loc, skyData.sun));
    uni.uMoon.value.copy(directions(a.project, ...loc, skyData.moon));
    uni.uLit.value = skyData.lit;
    uni.uDay.value = dt;
    uni.uZen.value
      .copy(nite)
      .lerp(blue, dt)
      .lerp(rainGrey, weather.wet * 0.35);
    uni.uHor.value
      .copy(night)
      .lerp(dayH, dt)
      .lerp(peach, tw * 0.65)
      .lerp(new T.Color("#b7cddd"), (1 - weather.warm) * 0.15)
      .lerp(new T.Color("#f6d3ac"), weather.warm * 0.16)
      .lerp(rainGrey, weather.rain * 0.54);
    if (settings.time === "golden") {
      uni.uHor.value.lerp(new T.Color("#f8dcb0"), 0.34);
      uni.uZen.value.lerp(new T.Color("#88bbd0"), 0.3);
    }
    if (settings.season === "winter")
      uni.uHor.value.lerp(new T.Color("#d9e5e4"), 0.18);
    uni.uSunCol.value.copy(lightDusk).lerp(lightSun, dt);
    uni.uRain.value = weather.rain;
    uni.uCloud.value = weather.wet;
    uni.uWind.value = weather.wind;
    uni.uWeatherTint.value = weather.warm;
    sun.color.copy(uni.uSunCol.value);
    sun.intensity =
      2.0 * smooth(-2, 26, skyData.sun.altitude) * (1 - 0.57 * weather.wet);
    moon.color.set("#bbd6f3");
    moon.intensity =
      (1 - dt) *
      smooth(-4, 22, skyData.moon.altitude) *
      (0.12 + 0.65 * skyData.lit);
    hemi.color.copy(new T.Color("#b4cce6")).lerp(new T.Color("#f5f2d9"), dt);
    hemi.groundColor.set(dt > 0.45 ? "#9b9c73" : "#82919b");
    hemi.intensity = 1.22 + 0.54 * dt;
    stars.material.opacity = (1 - dt) * (0.9 - 0.68 * weather.wet);
    scene.fog.color.copy(uni.uHor.value);
  }
  function track(cam, alt, orb, t) {
    const size = cam.far * 0.79;
    sky.position.copy(cam.position);
    sky.scale.setScalar(size);
    uni.uChart.value = smooth(4800, 26000, alt);
    sky.visible = true;
    stars.visible = uni.uChart.value < 0.96 && stars.material.opacity > 0.05;
    stars.position.copy(cam.position);
    stars.scale.setScalar(size * 0.96);
    sun.target.position.copy(cam.position);
    moon.target.position.copy(cam.position);
    sun.position.copy(cam.position).addScaledVector(uni.uSun.value, 67);
    moon.position.copy(cam.position).addScaledVector(uni.uMoon.value, 60);
    const fog =
      ((lastOpt.endsWith("winter") ? 0.0002 : 0.0001) + weather.wet * 0.00011) /
      (1 + Math.max(0, alt) / 1700);
    uni.uFog.value = fog;
    scene.fog.density = fog;
    uni.uClock.value = reduced ? 0 : t;
  }
  function dispose() {
    for (const o of [sky, stars]) {
      o.geometry.dispose();
      o.material.dispose();
      scene.remove(o);
    }
    sun.shadow.dispose();
    scene.remove(sun, sun.target, moon, moon.target, hemi);
  }
  return {
    uni,
    sun,
    moon,
    hemi,
    track,
    update,
    dispose,
    setMotion(v) {
      reduced = v;
    },
    seed: seasonSeed,
    get weather() {
      return weather;
    },
    get clock() {
      return timeLabel;
    },
    get astro() {
      return skyData;
    },
  };
}
