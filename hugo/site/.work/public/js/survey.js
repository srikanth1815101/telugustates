import * as T from "../vendor/three.module.min.js";
import { url, get, xy, ll, unzip } from "./grid.js";
import { smooth, trueNorth } from "./sky.js";
import { ACRE as W, RELIEF as VM } from "./metres.js";
const clamp = T.MathUtils.clamp;
export async function loadSurvey(a, boundaries = get("frozen/map.json")) {
  const [r, map] = await Promise.all([
    fetch(url("survey/overview.bin.gz")),
    boundaries,
  ]);
  if (!r.ok) throw Error("Regional relief unavailable");
  const b = await unzip(await r.arrayBuffer());
  const h = new DataView(b);
  if (h.getUint32(0) !== 0x4c4f4431) throw Error("Invalid survey LOD");
  const w = h.getUint16(4, true),
    rows = h.getUint16(6, true),
    step = h.getUint16(8, true),
    n = w * rows,
    z = new Int16Array(b, 12, n);
  const [d, f, water, cover] = [0, 1, 2, 3].map(
    (k) => new Uint8Array(b, 12 + (2 + k) * n, n),
  );
  const O = { x: a.project.cols / 2, y: a.project.rows / 2, z: 0 },
    cl = (i, j) => clamp(j, 0, rows - 1) * w + clamp(i, 0, w - 1);
  function height(i, j) {
    const v = z[cl(i, j)];
    if (v !== -32768) return v;
    for (const [u, v] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [-1, 1],
      [1, -1],
      [-2, 0],
      [0, -2],
      [2, 0],
      [0, 2],
    ]) {
      const k = cl(i + u, j + v);
      if (d[k]) return z[k];
    }
    return 0;
  }
  function sample(x, y) {
    const tx = x / step - 0.5,
      ty = y / step - 0.5,
      i = Math.floor(tx),
      j = Math.floor(ty),
      u = tx - i,
      v = ty - j;
    return (
      (height(i, j) * (1 - u) + height(i + 1, j) * u) * (1 - v) +
      (height(i, j + 1) * (1 - u) + height(i + 1, j + 1) * u) * v
    );
  }
  const rgb = new Uint8Array(n * 4),
    dry = new T.Color("#c5c58e"),
    low = new T.Color("#a5b487"),
    wood = new T.Color("#567957"),
    blue = new T.Color("#86b4b3"),
    ridge = new T.Color("#9aa78f"),
    col = new T.Color();
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!d[k]) continue;
      const elev = z[k],
        grad =
          (height(i - 1, j) - height(i + 1, j)) * 0.00072 +
          (height(i, j + 1) - height(i, j - 1)) * 0.00051;
      col
        .copy(low)
        .lerp(dry, smooth(50, 550, elev) * 0.8)
        .lerp(wood, f[k] / 114)
        .lerp(ridge, smooth(760, 1440, elev) * 0.42)
        .lerp(blue, water[k] / 100)
        .offsetHSL(
          Math.floor(elev / 100) * 0.0023 + Math.floor(elev / 500) * 0.01,
          0,
          0,
        )
        .multiplyScalar(clamp(1 + grad, 0.64, 1.31))
        .convertLinearToSRGB();
      rgb[k * 4] = Math.min(255, col.r * 255);
      rgb[k * 4 + 1] = Math.min(255, col.g * 255);
      rgb[k * 4 + 2] = Math.min(255, col.b * 255);
      rgb[k * 4 + 3] = Math.max(18, 2.55 * cover[k]);
    }
  const texture = new T.DataTexture(rgb, w, rows, T.RGBAFormat);
  texture.colorSpace = T.SRGBColorSpace;
  texture.minFilter = texture.magFilter = T.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return {
    map,
    O,
    w,
    rows,
    step,
    texture,
    cl,
    d,
    z,
    height,
    sample,
    region: (x, y) => d[cl(Math.floor(x / step), Math.floor(y / step))] || 0,
  };
}
export function regional(data, a, tier) {
  const { O, w, rows, step, cl, d, height, sample, texture } = data,
    group = new T.Group(),
    patches = [],
    pick = [],
    rect = { value: new T.Vector4(1e9, 1e9, -1e9, -1e9) },
    mix = { value: 0 };
  const mat = new T.MeshLambertMaterial({
    map: texture,
    alphaTest: 0.075,
    emissiveMap: texture,
    emissive: 0xffffff,
    emissiveIntensity: 0.34,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.surveyRect = rect;
    sh.uniforms.surveyCut = mix;
    sh.vertexShader =
      "varying vec2 surveyXZ;\n" +
      sh.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nsurveyXZ=position.xz;",
      );
    sh.fragmentShader =
      "varying vec2 surveyXZ;uniform vec4 surveyRect;uniform float surveyCut;\n" +
      sh.fragmentShader.replace(
        "#include <alphatest_fragment>",
        `#include <alphatest_fragment>
 if(surveyCut>0. && (surveyCut>=1. || fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715))*52.9829189)<surveyCut) && surveyXZ.x>=surveyRect.x && surveyXZ.y>=surveyRect.y && surveyXZ.x<surveyRect.z && surveyXZ.y<surveyRect.w)discard;`,
      );
  };
  function patch(x0, y0, stride) {
    const n = 32 / stride + 1,
      p = [],
      uv = [],
      ix = [];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const k = x0 + i * stride,
          l = y0 + j * stride;
        p.push(
          ((k + 0.5) * step - O.x) * W,
          height(k, l) * VM,
          (O.y - (l + 0.5) * step) * W,
        );
        uv.push((k + 0.5) / w, (l + 0.5) / rows);
      }
    for (let j = 0; j < n - 1; j++)
      for (let i = 0; i < n - 1; i++) {
        const x = x0 + i * stride,
          y = y0 + j * stride;
        if (x >= w - 1 || y >= rows - 1) continue;
        const h = j * n + i;
        if (
          !(
            d[cl(x, y)] ||
            d[cl(x + stride, y)] ||
            d[cl(x, y + stride)] ||
            d[cl(x + stride, y + stride)] ||
            d[cl(x + (stride >> 1), y + (stride >> 1))]
          )
        )
          continue;
        ix.push(h, h + 1, h + n, h + 1, h + n + 1, h + n);
      }
    if (!ix.length) return null;
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(p, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    g.setIndex(ix);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new T.Mesh(g, mat);
    m.userData.role = "regional";
    return m;
  }
  for (let j = 0; j < rows - 1; j += 32)
    for (let i = 0; i < w - 1; i += 32) {
      const coarse = patch(i, j, tier === 0 ? 4 : 2);
      if (coarse) {
        patches.push({
          i,
          j,
          coarse,
          fine: null,
          cx: (i + 16) * step,
          cy: (j + 16) * step,
        });
        group.add(coarse);
        pick.push(coarse);
      }
    }
  const edge = [];
  for (const f of data.map.features) {
    const polys =
      f.geometry.type === "Polygon"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates;
    for (const poly of polys)
      for (const ring of poly) {
        let prev;
        for (const point of ring) {
          const [x, y] = xy(a.project, ...point),
            p = [(x - O.x) * W, sample(x, y) * VM + 17, (O.y - y) * W];
          if (prev) edge.push(...prev, ...p);
          prev = p;
        }
      }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(edge, 3));
  const lines = new T.LineSegments(
    g,
    new T.LineBasicMaterial({
      color: "#647b66",
      transparent: true,
      opacity: 0.54,
      depthWrite: false,
    }),
  );
  lines.userData.role = "district-edge";
  group.add(lines);
  const ray = new T.Raycaster(),
    pt = new T.Vector2(),
    plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  let activePick = pick,
    old = "";
  function groundAt(cam, px, py, el) {
    const b = el.getBoundingClientRect();
    pt.set(
      ((px - b.left) / b.width) * 2 - 1,
      1 - ((py - b.top) / b.height) * 2,
    );
    ray.setFromCamera(pt, cam);
    const hits = ray.intersectObjects(activePick, false);
    let p = hits[0]?.point;
    if (!p) {
      p = new T.Vector3();
      if (!ray.ray.intersectPlane(plane, p)) return null;
    }
    const x = O.x + p.x / W,
      y = O.y - p.z / W;
    return [x, y, data.region(x, y)];
  }
  function update(x, y, range, ex, cut, amount = 1) {
    group.scale.y = ex / VM;
    lines.visible = range > 8000;
    lines.material.opacity = 0.56 * smooth(8000, 40000, range);
    mix.value = cut ? amount : 0;
    if (cut)
      rect.value.set(
        (cut[0] - O.x) * W,
        (O.y - cut[3]) * W,
        (cut[2] - O.x) * W,
        (O.y - cut[1]) * W,
      );
    const k =
      Math.floor(x / 240) +
      "," +
      Math.floor(y / 240) +
      "," +
      (range < 195000) +
      "," +
      (range < 13500);
    if (k === old) return;
    old = k;
    activePick = [];
    for (const b of patches) {
      const near =
        range < 195000 &&
        Math.abs(b.cx - x) < 1450 &&
        Math.abs(b.cy - y) < 1450;
      if (near && !b.fine) {
        b.fine = patch(b.i, b.j, 1);
        if (b.fine) group.add(b.fine);
      }
      if (b.fine) b.fine.visible = near;
      b.coarse.visible = !near || !b.fine;
      activePick.push(b.coarse.visible ? b.coarse : b.fine);
    }
  }
  return {
    group,
    lines,
    update,
    groundAt,
    dispose() {
      group.traverse((o) => o.geometry?.dispose());
      mat.dispose();
      lines.material.dispose();
      texture.dispose();
    },
  };
}
// Screen-space type projected through the very same terrain camera; declutter before enabling hit targets.
export class Annotations {
  constructor(host, a, data, tr, onDistrict, onPin) {
    this.host = host;
    this.a = a;
    this.data = data;
    this.tr = tr;
    this.ds = a.districts
      .map((d) => {
        const [x, y] = xy(a.project, ...d.label);
        return { x, y, d, kind: "district" };
      })
      .sort((a, b) => b.d.area_m2 - a.d.area_m2);
    this.states = ["Telangana", "Andhra Pradesh"].map((name) => {
      const rs = this.ds.filter((q) => q.d.state === name),
        sum = rs.reduce((s, v) => s + v.d.area_m2, 0);
      return {
        x: rs.reduce((s, v) => s + v.x * v.d.area_m2, 0) / sum,
        y: rs.reduce((s, v) => s + v.y * v.d.area_m2, 0) / sum,
        name,
        kind: "state",
      };
    });
    this.onDistrict = onDistrict;
    this.onPin = onPin;
    this.nodes = new Map();
    this.pos = new T.Vector3();
  }
  draw(cam, range, ex, rows = [], stakes = [], surf, walker = null) {
    const { data, host, tr } = this,
      w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    const seen = new Set(),
      boxes = [];
    const base = host.getBoundingClientRect(),
      play = walker ? host.closest("#world") : null;
    const occupied = play
      ? [
          ...play.querySelectorAll(
            ".world-top>*:not([hidden]),.walk-tip:not([hidden]),.walk-toast:not([hidden]),.joystick,#pace,#hop,.resident-card:not([hidden]),.readings:not([hidden]),.world-sheet:not([hidden])",
          ),
        ]
          .map((e) => e.getBoundingClientRect())
          .filter((b) => b.width > 0)
      : [];
    const safe =
      play?.querySelector(".walk-safe-probe")?.getBoundingClientRect() || base;
    const point = (key, name, x, y, height, kind, value) => {
      this.pos.set((x - data.O.x) * W, height, (data.O.y - y) * W).project(cam);
      const px = ((1 + this.pos.x) * w) / 2,
        py = ((1 - this.pos.y) * h) / 2;
      if (
        this.pos.z < 0 ||
        this.pos.z >= 1 ||
        px < 18 ||
        px > w - 13 ||
        py < 20 ||
        py > h - 20
      )
        return;
      const half =
          kind === "pin"
            ? Math.max(25, name.length * 3.6 + 9)
            : name.length * (kind === "state" ? 3.4 : 2.8) + 7,
        margin = kind === "pin" ? 21 : 17;
      if (
        kind === "pin" &&
        (px < half + 14 || px > w - half - 14 || py < 78 || py > h - 110)
      )
        return;
      if (kind === "pin" && play) {
        const L = base.left + px - half,
          R = base.left + px + half,
          T = base.top + py - 24,
          B = base.top + py + 24;
        if (
          L < safe.left + 2 ||
          R > safe.right - 2 ||
          T < safe.top + 2 ||
          B > safe.bottom - 2 ||
          occupied.some(
            (q) =>
              L < q.right + 3 &&
              R > q.left - 3 &&
              T < q.bottom + 3 &&
              B > q.top - 3,
          )
        )
          return;
      }
      if (
        boxes.some(
          ([bx, by, l]) =>
            Math.abs(px - bx) < half + l &&
            Math.abs(py - by) < (kind === "pin" ? 50 : margin),
        )
      )
        return;
      boxes.push([px, py, half]);
      seen.add(key);
      let el = this.nodes.get(key);
      if (!el) {
        el = document.createElement(
          kind === "pin" || kind === "district" ? "button" : "span",
        );
        el.className = "survey-type " + kind;
        if (kind === "district") {
          el.dataset.fly = value.id;
          el.onclick = () => this.onDistrict(value);
        } else if (kind === "pin") {
          el.dataset.visit = value;
          el.onclick = () => this.onPin(value);
        }
        host.append(el);
        this.nodes.set(key, el);
      }
      el.textContent = name;
      el.style.left = px.toFixed(1) + "px";
      el.style.top = py.toFixed(1) + "px";
    };
    let pins = 0;
    if (range < 72000)
      for (const [i0, j0, u, , , home] of rows) {
        const [gx, gy] = home?.centre || [i0 + 0.5, j0 + 0.5],
          i = gx - 0.5,
          j = gy - 0.5;
        if (walker && Math.hypot(gx - walker.x, gy - walker.y) * W > 60)
          continue;
        const y =
          (surf ? surf.ground(i + 0.5, j + 0.5) : data.sample(i, j) * ex) +
          (range <= 12 ? Math.min(3.5, (home?.size_m[2] || 3.6) * 0.82) : 6);
        const dist = Math.hypot(
          (gx - data.O.x) * W - cam.position.x,
          (data.O.y - gy) * W - cam.position.z,
          y - cam.position.y,
        );
        if ((range <= 12 && dist > 60) || pins >= Math.min(5, w < 500 ? 2 : 3))
          continue;
        point("u" + u, "@" + u, gx, gy, y, "pin", u);
        if (seen.has("u" + u)) {
          pins++;
          this.nodes.get("u" + u).style.opacity =
            range > 12 ? 0.92 : Math.max(0.36, Math.min(1, (65 - dist) / 19));
        }
      }
    if (range < 970 && range > 12)
      for (const b of stakes) {
        if (
          range < 15 &&
          Math.hypot(b.X - cam.position.x, b.Z - cam.position.z) > 95
        )
          continue;
        point(
          "s" + b.i + "_" + b.j,
          `${b.i} E · ${b.j} N`,
          b.i,
          b.j,
          b.h,
          "stake",
        );
      }
    if (range > 250000)
      for (const s of this.states)
        point(
          s.name,
          tr(
            s.name.toUpperCase(),
            s.name === "Telangana" ? "తెలంగాణ" : "ఆంధ్ర ప్రదేశ్",
          ),
          s.x,
          s.y,
          data.sample(s.x, s.y) * ex + 25,
          "state",
        );
    if (range > 6500)
      for (const s of this.ds) {
        if (
          range > 250000 &&
          w < 450 &&
          ![32, 48, 19, 12, 24, 31, 61, 15].includes(s.d.id)
        )
          continue;
        point(
          "d" + s.d.id,
          tr(s.d.name, s.d.te),
          s.x,
          s.y,
          data.sample(s.x, s.y) * ex + 25,
          "district",
          s.d,
        );
      }
    for (const [k, e] of this.nodes)
      if (!seen.has(k)) {
        e.remove();
        this.nodes.delete(k);
      }
  }
}
// Camera-near horizon ring: sample actual survey elevations out to ~55 km instead of
// submitting the two-state mesh behind the walker. No invented distant mountains.
export function horizon(data, cut, exaggeration = VM, origin = data.O) {
  const p = [],
    c = [],
    ix = [],
    n = 112,
    mid = [(cut[0] + cut[2]) / 2, (cut[1] + cut[3]) / 2],
    half = (cut[2] - cut[0]) / 2,
    ids = [];
  const hue = new T.Color();
  for (const radius of [
    half - 0.05,
    half + 16,
    half + 64,
    half + 160,
    half + 280,
    half + 450,
    half + 740,
  ]) {
    for (let i = 0; i < n; i++) {
      const side = Math.floor(i / (n / 4)),
        t = ((i % (n / 4)) / (n / 4)) * 2 - 1;
      const [dx, dy] = [
          [t, -1],
          [1, t],
          [-t, 1],
          [-1, -t],
        ][side],
        x = mid[0] + dx * radius,
        y = mid[1] + dy * radius,
        h = data.sample(x, y),
        k = data.cl(Math.floor(x / data.step), Math.floor(y / data.step));
      ids.push(data.d[k]);
      p.push((x - origin.x) * W, h * exaggeration, (origin.y - y) * W);
      hue
        .fromArray(data.texture.image.data, k * 4)
        .multiplyScalar(1 / 255)
        .convertSRGBToLinear();
      c.push(hue.r, hue.g, hue.b);
    }
  }
  for (let j = 0; j < 6; j++)
    for (let i = 0; i < n; i++) {
      const a = j * n + i,
        b = j * n + ((i + 1) % n);
      if (ids[a] && ids[b] && ids[a + n]) ix.push(a, a + n, b);
      if (ids[b] && ids[a + n] && ids[b + n]) ix.push(b, a + n, b + n);
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(p, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(c, 3));
  g.setIndex(ix);
  g.computeVertexNormals();
  const m = new T.Mesh(
    g,
    new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }),
  );
  m.userData.disposableMaterial = true;
  return m;
}
