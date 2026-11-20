import { dev } from "./edition.js";
import { Tread } from "./tread.js";
import { yard, wayside } from "./timber-yard.js";
import { PocketMap } from "./pocket-map.js";
import { writePosition } from "./position-book.js";
import { rainGround } from "./rain-ground.js";
import { calendar, windowLight, disciplinedClock } from "./world-calendar.js";
import { villageData } from "./landworks.js";
import { recordKind } from "./record-kinds.js";
import { passes, solidFor, clearance } from "./contacts.js";
import { touchWalk } from "./touch-walk.js";
import { fieldHUD } from "./field-hud.js";
import { followCamera } from "./walk-camera.js";
import { residents, preparePads } from "./resident-scene.js";
import { inHouse, localPoint, SIDE } from "./metres.js";
import * as T from "../vendor/three.module.min.js";
import { Tiles, get, key, ll, url, xy } from "./grid.js";
import { Surface, streamChunk, materials } from "./terrain.js";
import { ACRE as U } from "./metres.js";
import { boundaries as timber, acreEntry, fenceAt } from "./acre-edge.js";
import { FootCover, surfaceName } from "./foot-cover.js";
import { loadPeople } from "./art-library.js";
import { traveller } from "./traveller.js";
import { WalkMotor } from "./walk-motor.js";
import { loadSurvey, regional, Annotations, horizon } from "./survey.js";
import { atmosphere, trueNorth, smooth } from "./sky.js";
import {
  fieldMaterial,
  combineMeshes,
  cropDraws,
  restoreDraws,
} from "./lightweight.js";
import { WeatherFX, Tracks } from "./fieldfx.js";
import { fieldCheck } from "./field-check.js";
import { ecology } from "./ecodata.js";
import { EcologyScene } from "./ecoscene.js";
import { FieldExtras } from "./field-extras.js";
import { StandardPad } from "./standard-pad.js";
import { loadMessages, msg, bindMessages } from "./messages.js";
import { Governor, deviceTier, fieldRatio } from "./quality.js";
const icon = (k) =>
    `<svg class="ico" aria-hidden="true"><use href="#i-${k}"></use></svg>`,
  clamp = T.MathUtils.clamp,
  mix = T.MathUtils.lerp;
const turn = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const next = () => new Promise((r) => requestAnimationFrame(r));
export async function expedition(host, a, tr, paper, fail, boundaries) {
  const wallClock = disciplinedClock();
  let calendarAt = Date.now(),
    weatherCell = "";
  const prefs = {
    relief: 2,
    season: "auto",
    weather: "auto",
    reduceFlash: true,
    time: "shared4",
    hour: 12,
    quality: "auto",
    life: false,
    labels: false,
    motion: false,
    walker: "woman",
    left: false,
    hideMini: false,
    hideCompact: false,
    invert: false,
    recenter: true,
    haptics: false,
    saver: false,
    gain: 1,
  };
  try {
    const p = JSON.parse(localStorage.getItem("atlas-field-v5") || "{}");
    for (const [k, set] of Object.entries({
      walker: ["woman", "man"],
      weather: ["auto", "Clear", "Cloudy", "Light rain", "Rain", "Heavy rain"],
      season: ["auto", "retreat", "monsoon", "winter", "summer"],
      time: [
        "shared4",
        "shared2",
        "shared6",
        "manual",
        "golden",
        "day",
        "dusk",
        "live",
      ],
      quality: ["auto", "low", "medium", "high"],
    }))
      if (set.includes(p[k])) prefs[k] = p[k];
    if (Number.isFinite(p.hour)) prefs.hour = clamp(p.hour, 0, 23.99);
    if (Number.isFinite(p.relief))
      prefs.relief = Math.max(1, Math.min(3, p.relief));
    prefs.life = p.life === true;
    for (const k of [
      "hideMini",
      "hideCompact",
      "invert",
      "recenter",
      "haptics",
      "saver",
      "labels",
      "motion",
      "reduceFlash",
    ])
      if (typeof p[k] === "boolean") prefs[k] = p[k];
    if (Number.isFinite(p.gain)) prefs.gain = clamp(p.gain, 0.4, 2.2);
  } catch {}
  const save = () => {
    try {
      localStorage.setItem("atlas-field-v5", JSON.stringify(prefs));
    } catch {}
  };
  const [stops, worldConfig, naturalRoutes, walkArt] = await Promise.all([
    get(dev ? "ecology/stops.json" : "living/public/places.json"),
    get("living/world.json"),
    get("living/trails.json"),
    Promise.all(
      [
        "fence_simple",
        "ground_pathStraight",
        "rock_smallFlatA",
        "rock_smallB",
        "rock_smallFlatC",
      ].map(async (n) => [n, await get("library/walk/" + n + ".json")]),
    ).then(Object.fromEntries),
    loadMessages(),
  ]);
  Object.defineProperty(prefs, "regional", {
    value: {},
    writable: true,
    enumerable: false,
  });
  Object.defineProperty(prefs, "worldConfig", {
    value: worldConfig,
    enumerable: false,
  });
  a.worldConfig = worldConfig;
  const localFormats = Object.fromEntries(
    ["en", "te"].map((lang) => [
      lang,
      new Intl.DateTimeFormat(lang, {
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      }),
    ]),
  );
  let heldPoint = null,
    restorePose = null,
    resultRoute = null,
    lastBookmark = -1e8,
    zoomSum = 0,
    zoomAt = 0,
    zoomLock = 0;
  let activeStop = null,
    districtWalk = null,
    stopView = "ground";
  const dock = document.querySelector("#flight-dock"),
    deck = document.createElement("div");
  deck.className = "flight-deck";
  deck.innerHTML = `<div class="flight-labels"></div><div class="chart-tag"><i class="dot"></i><span></span></div><div class="flight-north"><b data-msg-title="hud.north">N</b><i></i></div><div class="flight-scale"><i></i><span></span></div><div class="flight-guide"></div><button class="land-cta" hidden></button><div class="flight-badge" hidden></div>`;
  const scene = new T.Scene(),
    cam = new T.PerspectiveCamera(48, 1, 1, 4000000);
  const canvas = document.createElement("canvas");
  let gl;
  try {
    gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: !matchMedia("(pointer:coarse)").matches,
      powerPreference: "high-performance",
      stencil: false,
      preserveDrawingBuffer: false,
    });
  } catch {}
  if (!gl) throw Error("WebGL 2 is unavailable");
  const renderer = new T.WebGLRenderer({
    canvas,
    context: gl,
    antialias: !matchMedia("(pointer:coarse)").matches,
    alpha: false,
  });
  let data;
  try {
    [data] = await Promise.all([loadSurvey(a, boundaries), loadPeople()]);
  } catch (e) {
    renderer.dispose();
    throw e;
  }
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.setClearColor("#e8eee2");
  deck.prepend(canvas);
  dock.append(deck);
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", msg("world.canvas"));
  host.innerHTML = `<div class="world-top"><a class="world-back" href="#">← <span></span></a><div class="world-id"><i class="dot"></i><span></span><b></b></div><div class="chart-switch"><button data-view="3d" aria-pressed="true">3D</button><button data-view="map"></button></div><button class="world-btn" id="world-menu" data-msg-aria="hud.menu">${icon("menu")}</button></div><div id="life-read" hidden></div><div class="name-sign" hidden></div><div class="greeting" hidden></div><div class="world-hud"><div class="eyebrow"><i class="dot"></i><span id="world-district"></span></div><div><span id="gps"></span><button id="copy-gps" data-msg-aria="details.copyCoords">${icon("copy")}</button></div><small id="alt"></small><div class="conditions"><b id="acre-now"></b><span id="clock-now"></span><span id="weather-now"></span></div></div><div class="pace-panel"><span id="underfoot"></span><button type="button" id="hop" data-msg="hud.jump"></button><button type="button" id="pace" aria-pressed="false" data-msg="hud.sprint"></button></div><div class="walk-help"></div><div class="joystick" role="group" data-msg-aria="hud.stick"><b></b></div><aside class="world-sheet" hidden><div class="sheet-head"><strong></strong><button class="icon-btn" id="hide-sheet" data-msg-aria="hud.closeMenu">${icon("close")}</button></div><button class="mini" data-msg-aria="hud.map"><img alt="" src="${url("frozen/relief.webp")}"><i></i></button><button class="primary" id="go-home"></button><label id="district-label" for="go-district"></label><div class="jump"><select id="go-district"></select><button class="notes-btn" id="jump"></button></div><button class="mode" id="go-street"></button><label id="walker-label" for="walker-style" data-msg="menu.traveller"></label><select id="walker-style"><option value="woman" data-msg="menu.woman"></option><option value="man" data-msg="menu.man"></option></select><button class="mode" id="view-walker"></button><label id="travel-label" for="travel-mode"></label><select id="travel-mode"></select><label id="speed-label" for="speed"></label><input id="speed" type="range" min=".4" max="1.5" value="1" step=".1"><button class="mode" id="camera-mode"></button><section class="walk-settings"><div class="eyebrow" data-msg="menu.scenery"></div><div class="field-pair"><label><span data-msg="menu.season"></span><select id="season"><option value="auto" data-msg="season.shared"></option><option value="retreat" data-msg="season.retreat"></option><option value="winter" data-msg="menu.winter"></option><option value="summer" data-msg="menu.summer"></option><option value="monsoon" data-msg="menu.monsoon"></option></select></label><label><span data-msg="menu.light"></span><select id="light"><option value="shared4" data-msg="time.four"></option><option value="shared2" data-msg="time.two"></option><option value="shared6" data-msg="time.six"></option><option value="manual" data-msg="time.manual"></option><option value="golden" data-msg="menu.golden"></option><option value="day" data-msg="menu.day"></option><option value="dusk" data-msg="menu.dusk"></option><option value="live" data-msg="menu.live"></option></select></label></div><label><span data-msg="weather.sim"></span><select id="sim-weather"><option value="auto" data-msg="menu.auto"></option><option value="Clear" data-msg="weather.clear"></option><option value="Cloudy" data-msg="weather.cloudy"></option><option value="Light rain" data-msg="weather.drizzle"></option><option value="Rain" data-msg="weather.rain"></option><option value="Heavy rain" data-msg="weather.heavy"></option></select></label><label><span data-msg="time.hour"></span><input id="world-hour" type="range" min="0" max="23.9" step="0.1"></label><label><span data-msg="menu.relief"></span> · <output id="relief-read"></output><input type="range" id="relief" min="1" max="3" step="0.1"></label><label><span data-msg="menu.quality"></span><select id="quality"><option value="auto" data-msg="menu.auto"></option><option value="low" data-msg="menu.low"></option><option value="medium" data-msg="menu.medium"></option><option value="high" data-msg="menu.high"></option></select></label><label class="check-life"><input id="nearby-life" type="checkbox"> <span data-msg="menu.life"></span></label><label><span data-msg="menu.guide"></span><select id="field-stop"></select></label><div class="view-steps"><button data-range="ground" data-msg="menu.walk"></button><button data-range="mid" data-msg="menu.mid"></button><button data-range="far" data-msg="menu.far"></button></div></section><details class="perf-details"><summary data-msg="measure.title"></summary><p data-msg="measure.help"></p><button id="record-field" class="mode" data-msg="measure.start"></button><textarea id="field-result" readonly hidden data-msg-aria="measure.result"></textarea></details><p class="detail-note"></p><button class="mode detail-trial" hidden></button><div class="sheet-foot"><button class="lang" data-lang data-msg-aria="menu.language">EN / తెలుగు</button><button class="sub-link" data-open="about"></button></div><p class="generated-note"></p><p class="creditline">© OpenStreetMap contributors · Copernicus DEM · ESA WorldCover · HydroLAKES · LGD. <a href="${url("frozen/credits.md")}" data-msg="menu.licences"></a> · <a href="${url("library/CREDITS.html")}" data-msg="menu.art"></a></p></aside>`;
  const q = (s) => host.querySelector(s),
    dq = (s) => deck.querySelector(s),
    sheet = q(".world-sheet"),
    cap = q(".name-sign"),
    greet = q(".greeting"),
    badge = dq(".flight-badge"),
    ac = new AbortController(),
    on = (el, evt, fn, opt = {}) =>
      el.addEventListener(evt, fn, { ...opt, signal: ac.signal });
  const pref = matchMedia("(prefers-reduced-motion:reduce)"),
    gov = new Governor(deviceTier(renderer)),
    tiles = new Tiles(a),
    ds = new Map(a.districts.map((d) => [d.id, d])),
    pl = new Map(),
    pk = new Set(a.plots),
    O = data.O,
    reg = regional(data, a, gov.tier);
  scene.add(reg.group);
  let reduced = pref.matches || prefs.motion,
    env = atmosphere(scene, a, reduced),
    fx = new WeatherFX(scene, env, gov.tier, reduced),
    tracks = new Tracks(scene, reduced);
  function remove(parent, group) {
    if (!group) return;
    group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      o.geometry?.dispose();
      if (o.userData.disposableMaterial) o.material.dispose();
    });
    parent.remove(group);
  }
  const mats = materials(env.uni),
    landFull = mats.land,
    waterFull = mats.water,
    colorLite = fieldMaterial(env.uni, false, true);
  mats.uniforms.summer.value = +(prefs.season === "summer");
  const labels = new Annotations(
    dq(".flight-labels"),
    a,
    data,
    tr,
    inspect,
    (u) => {
      const row = L?.all.find((r) => r[2] === u);
      if (row) {
        if (!expanded) expand();
        ui.placed(row, ds.get(row[4]));
      }
    },
  );
  let L = null,
    v = null,
    homeArrival = false,
    expanded = false,
    overlay = false,
    dead = false,
    hostPaused = false,
    busy = false,
    job = 0,
    building = "",
    requested = null,
    raf = 0,
    mode = "survey",
    flight = null,
    fr = 0,
    elapsed = 0,
    fps = 0,
    last = 0,
    fcount = 0,
    fsec = 0,
    groundFrames = 0,
    walked = 0,
    lastMark = 0,
    lastHud = -1e8,
    richSpawn = [],
    latestRich = null,
    pixelBudget = gov.cap === 0 ? 90000 : 205000,
    softWindow = [],
    lastSize = "",
    resizePending = false,
    lastOrbitPaint = 0,
    dirty = true,
    lastLL = null,
    cornerOwner = "",
    lastLabels = -1e9,
    stamp = 0,
    lastCullYaw = 0,
    lastCullPitch = 0;
  let follow = 4.6,
    third = true,
    speed = 1,
    travelMode = "walk",
    stepTo = null,
    blockedSteps = 0,
    yaw = 0,
    pitch = 0.035,
    x = O.x,
    y = O.y,
    jumpH = 0,
    velocity = 0,
    foot = 0,
    lastRipple = 0,
    lean = 0,
    lookTurn = 0,
    arrivalStep = 0,
    stick = [0, 0],
    joyId = null,
    stepFrom = null;
  const pressed = new Set(),
    pointers = new Map();
  const north = (x, y) => trueNorth(a.project, ...ll(a.project, x, y));
  const n0 = north(O.x, O.y),
    fitYaw = Math.atan2(-n0.x, -n0.z);
  let P = { x: O.x, y: O.y, r: 4200000, tilt: 1.2, yaw: fitYaw, eye: 0 },
    goal = { ...P },
    baseRange = P.r,
    ex = prefs.relief,
    cameraAGL = 120000;
  const avatar = new T.Group(),
    motor = new WalkMotor(),
    v3 = new T.Vector3();
  let walker = traveller(prefs.walker),
    shadeKey = null,
    stepClock = 0,
    once = true,
    portrait = false;
  avatar.add(walker.group);
  scene.add(avatar);
  avatar.visible = false;
  // An inexpensive soft contact shadow, including on Low; disappears beneath the swimmer.
  const floorShade = new T.Mesh(
    new T.PlaneGeometry(0.97, 0.76),
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      uniforms: { strength: { value: 0.24 } },
      vertexShader:
        "varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "varying vec2 v;uniform float strength;void main(){float r=length((v-.5)*2.);gl_FragColor=vec4(.12,.13,.10,strength*(1.-smoothstep(.03,1.,r)));}",
    }),
  );
  floorShade.rotation.x = -Math.PI / 2;
  floorShade.visible = false;
  scene.add(floorShade);
  const levels = { low: 0, medium: 1, high: 2 };
  if (prefs.quality !== "auto") {
    gov.change(levels[prefs.quality], "saved quality preference");

    fx.dispose();
    fx = new WeatherFX(scene, env, gov.tier, reduced || prefs.saver);
  }
  function homePose() {
    return { x: O.x, y: O.y, r: baseRange, tilt: 1.2, yaw: fitYaw, eye: 0 };
  }
  function resize() {
    const w = deck.clientWidth,
      h = deck.clientHeight;
    if (!w || !h) return;
    const tier = gov.tier,
      orbit = !expanded,
      ratio = fieldRatio(w, h, devicePixelRatio, tier, orbit, pixelBudget);
    renderer.shadowMap.enabled = tier === 2 && !prefs.saver;
    const size = w + "," + h + "," + ratio;
    if (size === lastSize) return;
    lastSize = size;
    renderer.setDrawingBufferSize(w, h, ratio);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    const bb = a.project.bbox_wgs84;
    const breadth = (bb[2] - bb[0]) * 106300,
      length = (bb[3] - bb[1]) * 111320;
    baseRange =
      Math.max(
        (length * 0.95) / (2 * Math.tan((24 * Math.PI) / 180)),
        breadth / (2 * Math.tan((24 * Math.PI) / 180) * cam.aspect),
      ) * 1.1;
    if (mode === "survey" && !expanded && !flight && goal.r > 425000) {
      P.r = goal.r = baseRange;
    }
    dirty = true;
  }
  // Changing a WebGL backing size clears it. Never resize after submitting a scene or
  // from ResizeObserver between draw and compositing: doing so exposes an empty frame.
  function requestResize() {
    resizePending = true;
    dirty = true;
  }
  const ro = new ResizeObserver(requestResize);
  ro.observe(deck);
  resize();
  P = homePose();
  goal = { ...P };
  let input = null,
    ui = null,
    photo = null,
    sprintHeld = false,
    lastEventLand = 0,
    lastRender = 0,
    lastBodyYaw = 0,
    lastPadLook = -1e6,
    camState = {},
    camProof = {},
    lastContact = 0,
    photoCatch = null,
    photoLastLift = 0;
  const rates = { walk: 1.55, jog: 3.85, boost: 8 },
    pad = new StandardPad();
  const canPlay = () =>
    mode === "ground" &&
    !overlay &&
    !hostPaused &&
    !photo &&
    sheet.hidden &&
    !ui?.busy() &&
    !document.querySelector("dialog[open]");
  const buzz = (n) => {
    if (!prefs.haptics || prefs.saver || reduced) return;
    if (typeof window.__atlasPulse === "function")
      window.__atlasPulse(n === 12 ? "jump" : "land");
    else navigator.vibrate?.(n);
  };
  const activeJump = () => {
    if (canPlay()) {
      motor.jump();
      ui.lesson("jump");
      buzz(12);
    }
  };
  function picture() {
    renderer.render(scene, cam);
    return canvas.toDataURL("image/png");
  }
  function savePhoto() {
    if (!photo) return;
    if (location.hostname === "appassets.androidplatform.net") {
      location.href = "/_field/photo";
      return;
    }
    renderer.render(scene, cam);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const u = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = u;
      a.download = "Telugu-States-landscape.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 6000);
    }, "image/png");
  }
  ui = fieldHUD(host, deck, on, tr, {
    leave: () => paper(true),
    distance: cameraHeight,
    classLabel: (u) =>
      !dev && v?.example
        ? msg("walk.demoNote")
        : msg("resident." + recordKind(a.recordStats, u)),
    district: (d) => (d ? tr(d.name, d.te) : msg("world.landscape")),
    assetUrl: url,
    prefs,
    active: canPlay,
    photo: () => !!photo,
    shareBase: "https://telugustates.csrgo.com/",
    cancel: () => neutral(),
    setting: (k) => {
      save();
      if (k === "motion") {
        reduced = pref.matches || prefs.motion;
        env.setMotion(reduced || prefs.saver);
        applyQuality();
      }
      if (k === "saver") {
        env.setMotion(reduced || prefs.saver);
        gov.trial = false;
        q(".detail-trial").hidden = prefs.saver || gov.cap < 2;
        gov.change(
          prefs.saver
            ? 0
            : prefs.quality === "auto"
              ? deviceTier(renderer)
              : levels[prefs.quality],
          "battery preference",
        );
        applyQuality();
      }
    },
    visit: (u) =>
      window.dispatchEvent(new CustomEvent("atlas:visit", { detail: u })),
    startPhoto: () => {
      neutral();
      photo = {
        p: cam.position.clone(),
        yaw: cam.rotation.y,
        pitch: cam.rotation.x,
      };
      photoLastLift = +q("#photo-lift").value;
    },
    endPhoto: () => {
      photo = null;
      neutral();
      once = true;
      last = performance.now();
      dirty = true;
      lastHud = -1e8;
    },
    savePhoto,
  });
  function tickPhoto(h) {
    const lift = +q("#photo-lift").value;
    photo.p.y += lift - photoLastLift;
    photoLastLift = lift;
    const a = +pressed.has("KeyW") - +pressed.has("KeyS"),
      b = +pressed.has("KeyD") - +pressed.has("KeyA");
    const sn = Math.sin(photo.yaw),
      cs = Math.cos(photo.yaw);
    photo.p.x += (-sn * a + cs * b) * h * 6;
    photo.p.z += (-cs * a - sn * b) * h * 6;
    const X = O.x + photo.p.x / U,
      Y = O.y - photo.p.z / U,
      z = L.s.sample(X, Y);
    if (!z.drawn) photo.p.copy(cam.position);
    else
      photo.p.y = Math.max(
        photo.p.y,
        z.z + 0.18,
        z.depth > 0.03 ? z.line + 0.2 : -Infinity,
      );
    cam.position.copy(photo.p);
    cam.rotation.set(photo.pitch, photo.yaw, 0, "YXZ");
  }

  function language() {
    canvas.setAttribute("aria-label", msg("world.canvas"));
    q(".world-back").title = msg("hud.back");
    q(".sheet-head strong").textContent = msg("menu.title");
    q("#go-home").hidden = !dev && !v;
    q("#go-home").textContent = v ? msg("menu.home") : msg("menu.fit");
    q("#district-label").textContent = msg("menu.district");
    q("#jump").textContent = msg("menu.go");
    q("#go-street").hidden = !v;
    q("#go-street").textContent = msg("menu.gate");
    q(".generated-note").textContent = msg("menu.disclaimer");
    q("#travel-label").textContent = msg("menu.travel");
    q("#travel-mode").replaceChildren(
      ...Object.entries(rates).map(
        ([k, n], i) =>
          new Option(
            msg(["menu.walk", "hud.sprint", "menu.boost"][i]) +
              " · " +
              msg("menu.unitSpeed", { pace: n }),
            k,
          ),
      ),
    );
    q("#travel-mode").value = travelMode;
    q("#walker-style").value = prefs.walker;
    q("#walker-label").textContent = msg("menu.traveller");
    q("#view-walker").textContent = portrait
      ? msg("menu.behind")
      : msg("menu.face");

    q("#pace").setAttribute("aria-pressed", String(travelMode === "jog"));
    q("#speed-label").textContent =
      msg("menu.speed") +
      ` · ${speed.toFixed(1)}× · ` +
      msg("menu.unitSpeed", { pace: (rates[travelMode] * speed).toFixed(1) });
    q("#camera-mode").textContent = third
      ? msg("menu.third")
      : msg("menu.first");
    q(".sheet-foot [data-open]").textContent = msg("menu.credits");
    q(".walk-help").textContent = msg("menu.keys");
    q(".detail-trial").textContent = msg("menu.trial");
    q(".detail-trial").hidden = prefs.saver || gov.cap < 2;
    q(".world-back").setAttribute("aria-label", msg("hud.back"));
    dq(".chart-tag span").textContent = msg("world.canvas");
    dq(".flight-guide").textContent = msg("world.zoomHint");
    const sel = q("#go-district"),
      prev = sel.value;
    sel.replaceChildren(
      ...a.districts.map(
        (d) =>
          new Option(
            tr(d.name, d.te) +
              " · " +
              msg(d.state === "Telangana" ? "geo.tg" : "geo.ap"),
            d.id,
          ),
      ),
    );
    sel.value = prev || String(v?.d || 32);
    const guide = q("#field-stop"),
      chosen = guide.value || "village";
    guide.replaceChildren(
      ...stops.map((stop) => {
        const d = a.districts.find((d) => d.name === stop.district);
        return new Option(
          msg("stop." + stop.id) +
            " · " +
            (d ? tr(d.name, d.te) : stop.district),
          stop.id,
        );
      }),
    );
    guide.value = chosen;
    lastLabels = lastHud = -1e8;
    cornerOwner = "";
    dirty = true;
  }
  const pocket = new PocketMap(q(".pocket-map"));
  language();
  on(window, "languagechange-atlas", language);
  function expand() {
    if (expanded) return;
    const b = deck.getBoundingClientRect();
    expanded = true;
    host.hidden = false;
    host.classList.add("walk-view");
    document.body.classList.add("walking");
    host.prepend(deck);
    lastSize = "";
    requestResize();
    if (!reduced && b.width && b.height && b.top < innerHeight && b.bottom > 0)
      host.animate(
        [
          {
            left: b.left + "px",
            top: b.top + "px",
            width: b.width + "px",
            height: b.height + "px",
          },
          { left: "0px", top: "0px", width: "100vw", height: "100dvh" },
        ],
        { duration: 440, easing: "cubic-bezier(.25,.75,.2,1)" },
      );
    canvas.focus({ preventScroll: true });
  }
  function contract() {
    if (!expanded) return;
    expanded = false;
    dock.append(deck);
    host.hidden = true;
    host.classList.remove("walk-view");
    document.body.classList.remove("walking");
    sheet.hidden = true;
    lastSize = "";
    requestResize();
    P.r = goal.r = baseRange;
    dirty = true;
  }
  function setPaper(show) {
    if (show && !overlay) bookmark(false, true);
    overlay = show;
    tracks.mix.pause(show || document.hidden);
    if (show) {
      neutral();
      sheet.hidden = true;
    } else {
      lastSize = "";
      requestResize();
      last = performance.now();
      dirty = true;
      lastHud = lastLabels = -1e8;
    }
  }
  function clearSc(l) {
    if (!l) return;
    remove(l.group, l.sc);
    l.sc = null;
  }
  function free(l) {
    if (!l) return;
    l.bio?.dispose();
    l.extras?.dispose();
    l.cover?.dispose();
    clearSc(l);
    remove(scene, l.group);
  }
  function nature(l = L) {
    if (!l) return;
    const settled = mode === "ground" && L === l,
      p = { x: settled ? x : l.fx, y: settled ? y : l.fy };
    remove(l.group, l.sc);
    const sample = l.all.find((r) => r[5]?.timberOnly && r[2] === v?.u);
    l.sc = sample
      ? yard(l.s, sample, p, walkArt)
      : timber(l.s, l.all, p, gov.tier);
    l.group.add(l.sc);
    l.bulbs = [];
    l.soils = null;
    const homes = residents(l.s, l.all, p, gov.tier);
    homes.position.copy(l.sc.position).multiplyScalar(-1);
    l.paths = l.villages.reduce((n, v) => n + v.paths.length, 0);
    const stones = wayside(
      l.s,
      l.villages.flatMap((v) => v.paths),
      p,
      walkArt,
    );
    stones.position.copy(l.sc.position).multiplyScalar(-1);
    l.sc.add(stones);
    l.houses = homes.userData.houses;
    l.sc.add(homes);
    l.nightMeshes = [];
    l.sc.traverse((m) => {
      if (m.userData.glow != null) l.nightMeshes.push(m);
    });
    l.wetFX = rainGround(
      l.s,
      p,
      l.villages.flatMap((v) => v.paths),
      prefs.saver ? 0 : gov.tier,
    );
    l.wetFX.position.copy(l.sc.position).multiplyScalar(-1);
    l.sc.add(l.wetFX);
    l.nx = p.x;
    l.ny = p.y;
    if (l.bio && !l.bio.rebuilding)
      l.bio.build(p.x, p.y).catch((e) => console.warn("Ecology refresh", e));
  }
  const within = (l, x, y) =>
    l && x >= l.cut[0] && y >= l.cut[1] && x < l.cut[2] && y < l.cut[3];
  async function prepare(xx, yy, force = false) {
    if (dead) return;
    const cx = Math.floor(xx / 64),
      cy = Math.floor(yy / 64),
      tier = gov.tier,
      id =
        cx +
        "," +
        cy +
        ":" +
        tier +
        (":" + Math.round(xx / 3) + "," + Math.round(yy / 3));
    if (!force && (building === id || L?.id === id)) return;
    const ver = ++job;
    building = id;
    busy = true;
    const r = tier === 2 ? 2 : 1,
      cut = [
        (cx - r) * 64,
        (cy - r) * 64,
        (cx + r + 1) * 64,
        (cy + r + 1) * 64,
      ],
      ks = new Set(),
      plan = [];
    for (
      let j = Math.floor((cut[1] - 4) / 256);
      j <= Math.floor((cut[3] + 4) / 256);
      j++
    )
      for (
        let i = Math.floor((cut[0] - 4) / 256);
        i <= Math.floor((cut[2] + 4) / 256);
        i++
      )
        ks.add(`${i}_${j}`);
    for (let j = -r; j <= r; j++)
      for (let i = -r; i <= r; i++) {
        const b = Math.max(Math.abs(i), Math.abs(j));
        plan.push([
          cx + i,
          cy + j,
          b === 0 ? 1 : b === 1 ? (tier === 0 ? 8 : 2) : 4,
          b,
        ]);
      }
    plan.sort((a, b) => a[3] - b[3]);
    let l = null;
    try {
      await Promise.all(
        [...ks].map(async (k) => {
          await tiles.load(k);
          if (pk.has(k) && !pl.has(k))
            pl.set(k, await get(`data/plots/${k}.json`));
        }),
      );
      if (dead || job !== ver) return;
      const all = [...ks].flatMap((k) => pl.get(k) || []);
      const sample = !dev && v?.example && ks.has(key(...v.c)) ? v : null;
      if (sample && !all.some((r) => r[2] === sample.u))
        all.push([
          ...sample.c,
          sample.u,
          sample.s,
          sample.d,
          { ...sample.house, timberOnly: true },
        ]);
      const [eco, villages] = await Promise.all([
        ecology(),
        villageData(all.map((r) => r[4])),
      ]);
      if (dead || job !== ver) return;
      const natural = naturalRoutes.filter((t) =>
        t.xy.some(([X, Y]) => Math.abs(X - xx) < 13 && Math.abs(Y - yy) < 13),
      );
      if (sample) {
        const h = sample.house,
          [fx, fy] = SIDE[h.facing],
          [gx, gy] = h.gate;
        villages.push({
          paths: [
            {
              type: "entrance",
              w: h.path_width_m,
              xy: [[gx + fx * 0.22, gy + fy * 0.22], h.gate, h.entry, h.door],
            },
          ],
          poles: [],
          spans: [],
          services: [],
        });
      }
      if (natural.length)
        villages.push({
          paths: natural,
          poles: [],
          spans: [],
          services: [],
          lit: false,
        });
      const s = new Surface(tiles, O, [xx, yy]);
      s.ec = eco;
      s.natureWalk = !dev;
      s.tread = new Tread(
        villages.flatMap((v) => v.paths),
        walkArt.ground_pathStraight,
        [xx, yy],
      );
      s.period =
        prefs.season === "auto"
          ? calendar(Date.now(), worldConfig).season
          : prefs.season;
      s.relief = prefs.relief;
      if (L?.cx === cx && L?.cy === cy && L.s.relief === s.relief)
        s.maps = L.s.maps;
      s.focus = [xx, yy];
      preparePads(s, all);
      const loc = ll(a.project, xx, yy),
        elev = tiles.at(xx, yy)?.z || 0;
      const m = calendar(calendarAt, worldConfig).month;
      s.season = clamp(
        0.45 +
          0.2 * Math.cos(((m - 8) * Math.PI) / 6) +
          (0.13 * (loc[1] - 16)) / 4 +
          (0.28 * elev) / 1200,
        0,
        1,
      );
      // Per streaming job: do not mutate the material identity of a half-built patch when a tier changes.
      const groundMaterials = {
        land: tier === 0 ? mats.landLow : landFull,
        water: prefs.saver ? mats.waterSaver : waterFull,
      };
      l = {
        id,
        cx,
        cy,
        ks,
        cut,
        all,
        s,
        tier,
        fx: xx,
        fy: yy,
        group: new T.Group(),
        villages,
        chunks: new Map(),
      };
      l.group.position.fromArray(s.offset);
      for (let b = 0; b < plan.length; b++) {
        if (dead || job !== ver) {
          free(l);
          return;
        }
        const [i, j, step] = plan[b],
          k = `${i},${j}:${step}`;
        const ob = await streamChunk(
          [s, i, j, step, groundMaterials, tier === 0],
          () => !dead && job === ver,
        );
        if (!ob) {
          free(l);
          return;
        }
        l.group.add(ob);
        l.chunks.set(k, ob);
        if (b % 4 === 1) await next();
      }
      if (dead || job !== ver) {
        free(l);
        return;
      }
      l.horizon = horizon(data, cut, s.relief, s.o);
      if (tier === 0) {
        l.horizon.material.dispose();
        l.horizon.material = colorLite;
        l.horizon.userData.disposableMaterial = false;
      }
      l.group.add(l.horizon);
      if (tier === 0) {
        for (const mat of [groundMaterials.land, groundMaterials.water]) {
          const found = [];
          l.group.traverse((o) => {
            if (o.isMesh && o.material === mat) found.push(o);
          });
          if (!found.length) continue;
          const m = combineMeshes(found, mat);
          for (const ob of found) {
            ob.removeFromParent();
            ob.geometry.dispose();
          }
          if (m) {
            m.userData.tileBatch = true;
            l.group.add(m);
          }
        }
      }

      nature(l);
      l.bio = new EcologyScene(s, eco, all, env.uni, tier, prefs, () => L?.bio);
      l.group.add(l.bio.group);
      await l.bio.build(xx, yy);
      if (dead || job !== ver) {
        free(l);
        return;
      }
      l.cover = new FootCover(s, tier, mats.uniforms);
      l.group.add(l.cover.g);
      l.extras = new FieldExtras(s, eco, null, xx, yy, tier, prefs, env.uni);
      l.group.add(l.extras.g);
      if (mode === "ground" && L) {
        // Replace ground and its consumers atomically, including collision, camera and support feet.
        motor.recontact(s, walker.H);
        l.camH = L.s.relief === s.relief ? L.camH : undefined;
        once = true;
        mats.resetWakes();
      }
      free(L);
      L = l;
      scene.add(l.group);
      tiles.trim(ks);
      for (const k of pl.keys()) if (!ks.has(k)) pl.delete(k);

      l.group.visible = P.r < 22000;
      dirty = true;
      lastLabels = -1e8;
    } catch (e) {
      if (l && l !== L) free(l);
      if (ver === job && !dead) fail(e);
    } finally {
      if (ver === job) {
        busy = false;
        building = "";
      }
    }
  }
  function resetInput() {
    neutral();
    jumpH = velocity = lean = lookTurn = 0;
    mats.resetWakes();
    floorShade.visible = false;
    stepFrom = null;
    arrivalStep = 0;
    sheet.hidden = true;
  }
  function launch(dest, end, cell = null, home = false) {
    restoreDraws(L?.group);
    const start = { ...P };
    let span = Math.hypot(start.x - dest.x, start.y - dest.y) * U;
    const flyTime = reduced
      ? 0.22
      : end === "overview"
        ? 2.0
        : end === "walk"
          ? 3.15
          : 1.95;
    flight = {
      start,
      dest,
      end,
      cell,
      home,
      t: 0,
      dur: flyTime,
      bump: start.r < 100000 && dest.r < 100000 ? Math.max(0, span * 0.72) : 0,
    };
    mode = "flight";
    goal = { ...dest };
    resetInput();
    cap.hidden = greet.hidden = true;
    host.classList.add("groundless");
    if (end === "walk") {
      expand();
      requested = cell;
      homeArrival = home;
      prepare(dest.x, dest.y, true);
    } else if (end === "inspect") {
      requested = cell;
      prepare(...cell);
    } else requested = null;
    badge.hidden = false;
    badge.textContent =
      end === "overview"
        ? msg("world.ascend")
        : end === "walk"
          ? msg("world.descend")
          : msg("world.toDistrict");
    lastLabels = -1e8;
    dirty = true;
  }
  function visit(record) {
    heldPoint = restorePose = null;
    third = true;
    activeStop = districtWalk = null;
    stopView = "ground";
    follow = 4.6;
    v = record;
    language();
    goCell(record.c, record.example ? "gate" : true);
  }
  function doorstep(cell, home) {
    if (
      heldPoint &&
      cell[0] === Math.floor(heldPoint.x) &&
      cell[1] === Math.floor(heldPoint.y)
    )
      return heldPoint;
    if (home && v) {
      if (home === "gate" && v.example) {
        const [fx, fy] = SIDE[v.house.facing],
          [gx, gy] = v.house.gate;
        return {
          x: gx + (fx * 8.6) / U,
          y: gy + (fy * 8.6) / U,
          yaw: Math.atan2(fx, -fy),
        };
      }
      if (home === "gate" || !v.house)
        return acreEntry(cell, v.house?.facing, home === "gate", v.house?.gate);
      const h = v.house,
        [X, Y] = localPoint(h, h.door_x, h.size_m[1] * 0.5 + 2.65);
      return { x: X, y: Y, yaw: acreEntry(cell, h.facing).yaw };
    }
    if (
      activeStop &&
      cell[0] === activeStop.cell[0] &&
      cell[1] === activeStop.cell[1]
    )
      return {
        x: activeStop.point?.[0] ?? cell[0] + 0.5,
        y: activeStop.point?.[1] ?? cell[1] + 0.5,
        yaw: activeStop.yaw,
      };
    return { x: cell[0] + 0.5, y: cell[1] + 0.5, yaw: 0 };
  }
  function goCell(cell, home) {
    const p = doorstep(cell, home);
    launch(
      {
        ...p,
        r: third ? 6.8 : 0.07,
        tilt: third ? 0.25 : 0.03,
        eye: third ? 2.05 : 1.6,
      },
      "walk",
      cell,
      home,
    );
  }
  function streetArrival() {
    if (!v) return;
    activeStop = districtWalk = null;
    stopView = "ground";
    language();
    goCell(v.c, "gate");
  }
  function inspect(d) {
    if (!d) return;
    activeStop = districtWalk = null;
    const [x, y] = d.village_root || d.anchor;
    launch(
      { x: x + 0.5, y: y + 0.5, r: 1900, tilt: 0.99, yaw: fitYaw, eye: 0 },
      "inspect",
      [x, y],
    );
    badge.textContent = tr(d.name, d.te) + " · " + msg("world.overview");
  }
  function overview() {
    activeStop = districtWalk = null;
    if (mode === "survey" && !expanded && P.r > baseRange * 0.97) {
      goal = homePose();
      return;
    }
    launch(homePose(), "overview");
  }
  const landButton = dq(".land-cta");
  let closestHome = null;
  function landing() {
    landButton.hidden =
      mode !== "survey" || P.r > 5800 || !within(L, P.x, P.y) || busy;
    if (landButton.hidden) return;
    closestHome = null;
    let best = Math.min(22, Math.max(1.5, P.r / U));
    for (const r of L.all) {
      let c = [r[0] + 0.5, r[1] + 0.5];
      let d = Math.hypot(c[0] - P.x, c[1] - P.y);
      if (d < best) {
        best = d;
        closestHome = r[2];
      }
    }
    landButton.textContent = msg("world.walkHere");
    landButton.setAttribute(
      "aria-label",
      closestHome
        ? msg("world.walkNear", { handle: closestHome })
        : msg("world.walkHere"),
    );
  }
  landButton.onclick = () => {
    if (closestHome)
      window.dispatchEvent(
        new CustomEvent("atlas:visit", { detail: closestHome }),
      );
    else {
      const c = safeCell(P.x, P.y);
      if (c) goCell(c, false);
    }
  };
  function homeNear(xx, yy) {
    if (!L) return false;
    let chosen = null,
      best = 1.2;
    for (const row of L.all) {
      const [a, b] = [row[0] + 0.5, row[1] + 0.5],
        d = Math.hypot(a - xx, b - yy);
      if (d < best) {
        chosen = row[2];
        best = d;
      }
    }
    if (chosen) {
      goal.r = 26;
      window.dispatchEvent(new CustomEvent("atlas:visit", { detail: chosen }));
      return true;
    }
    return false;
  }
  function safeCell(x, y) {
    const c = L?.s.t.at(x, y);
    if (L?.s.traversable(x, y)) return [Math.floor(x), Math.floor(y)];
    for (let d = 1; d <= 8; d++)
      for (let j = -d; j <= d; j++)
        for (let i = -d; i <= d; i++)
          if (
            Math.max(Math.abs(j), Math.abs(i)) === d &&
            L?.s.traversable(x + i, y + j)
          )
            return [Math.floor(x + i), Math.floor(y + j)];
    return null;
  }
  function bookmark(active = true, force = false) {
    if (
      dev ||
      dead ||
      !expanded ||
      overlay ||
      flight ||
      !L ||
      (!force && performance.now() - lastBookmark < 850)
    )
      return;
    const ground = mode === "ground",
      X = ground ? x : P.x,
      Y = ground ? y : P.y;
    if (!within(L, X, Y) || !L.s.sample(X, Y).drawn) return;
    const route = location.hash.startsWith("#/")
      ? location.hash
      : resultRoute || "";
    if (!route) return;
    lastBookmark = performance.now();
    resultRoute = route;
    writePosition({
      active,
      route,
      x: X,
      y: Y,
      yaw: ground ? yaw : P.yaw,
      pitch,
      follow,
      third,
      range: P.r,
      tilt: P.tilt,
      level: ground ? "ground" : P.r >= 500 ? "far" : "mid",
    });
  }
  function cameraHeight(level, pose = null) {
    if (!L || (!expanded && !pose)) return;
    const X = pose?.x ?? (mode === "ground" ? x : P.x),
      Y = pose?.y ?? (mode === "ground" ? y : P.y),
      heading = pose?.yaw ?? (mode === "ground" ? yaw : P.yaw),
      cell = [Math.floor(X), Math.floor(Y)];
    heldPoint = { x: X, y: Y, yaw: heading };
    stopView = level;
    if (level === "ground") {
      goCell(cell, false);
      return;
    }
    launch(
      {
        x: X,
        y: Y,
        r: pose?.range ?? (level === "mid" ? 90 : 840),
        tilt: pose?.tilt ?? (level === "mid" ? 0.36 : 0.46),
        yaw: heading,
        eye: level === "mid" ? 2.4 : 5,
      },
      "inspect",
      cell,
    );
  }
  function restore(p, record, scenic) {
    restorePose = p;
    third = !!p.third;
    v = record || null;
    activeStop = scenic || null;
    districtWalk = null;
    heldPoint = { x: p.x, y: p.y, yaw: p.yaw };
    stopView = p.level;
    expand();
    language();
    const cell = [Math.floor(p.x), Math.floor(p.y)];
    if (p.level === "ground") goCell(cell, false);
    else
      launch(
        { x: p.x, y: p.y, r: p.range, tilt: p.tilt, yaw: p.yaw, eye: 3 },
        "inspect",
        cell,
      );
  }
  function zoom(f, point) {
    if (overlay || dead) return;
    if (mode === "ground") {
      if (photo) {
        photo.p.x -= Math.sin(photo.yaw) * Math.log(f) * 3;
        photo.p.z -= Math.cos(photo.yaw) * Math.log(f) * 3;
        return;
      }
      if (!dev && f < 1) {
        const now = performance.now();
        if (now - zoomAt > 400) zoomSum = 0;
        zoomAt = now;
        zoomSum += -Math.log(f);
        if (zoomSum >= 0.16 && now > zoomLock) {
          zoomSum = 0;
          zoomLock = now + 340;
          cameraHeight("mid");
        }
        return;
      }
      if (!third) {
        if (f < 1) {
          third = true;
          follow = 3.5;
          language();
        }
        return;
      }
      if (f >= 1 || follow < 5.999) {
        follow = clamp(follow / f, 3.5, 6);
        dirty = true;
        return;
      }
      cameraHeight("mid");
      return;
    }
    if (!dev && expanded && L) {
      if (flight || performance.now() < zoomLock) return;
      const now = performance.now(),
        dir = f < 1 ? 1 : -1,
        k = dir * Math.abs(Math.log(f));
      if (now - zoomAt > 420 || Math.sign(zoomSum) !== dir) zoomSum = 0;
      zoomSum += k;
      zoomAt = now;
      if (Math.abs(zoomSum) >= 0.16) {
        zoomSum = 0;
        zoomLock = now + 340;
        if (dir > 0 && P.r < 500) cameraHeight("far");
        else if (dir < 0) cameraHeight(P.r >= 500 ? "mid" : "ground");
      }
      return;
    }
    if (flight) {
      if (flight.end === "walk") return;
      flight = null;
      mode = "survey";
      badge.hidden = true;
    }
    let nr = clamp(goal.r / f, 5, baseRange);
    if (f > 1 && point && point[2]) {
      const w = 1 - 1 / f;
      goal.x = mix(goal.x, point[0], w);
      goal.y = mix(goal.y, point[1], w);
    }
    if (nr === baseRange) {
      goal = homePose();
      return;
    }
    if (
      nr < 65000 &&
      !data.region(goal.x, goal.y) &&
      !within(L, goal.x, goal.y)
    ) {
      const d = a.districts.reduce((best, q) =>
        Math.hypot(q.anchor[0] - goal.x, q.anchor[1] - goal.y) <
        Math.hypot(best.anchor[0] - goal.x, best.anchor[1] - goal.y)
          ? q
          : best,
      );
      goal.x = d.anchor[0] + 0.5;
      goal.y = d.anchor[1] + 0.5;
    }
    if (nr < 14 && within(L, goal.x, goal.y)) {
      if (homeNear(goal.x, goal.y)) return;
      const c = safeCell(goal.x, goal.y);
      if (c) {
        goCell(c, false);
        return;
      }
      nr = 24;
    }
    goal.r = nr;
    goal.tilt = 0.42 + 0.78 * smooth(1.2, 4.7, Math.log10(nr));
    dirty = true;
  }
  function pass(px, py, ox, oy) {
    return (
      within(L, px, py) &&
      passes(L.s, L.sc?.userData.blocks, L.solids, L.nearCover, px, py, ox, oy)
    );
  }
  function settle(f) {
    P = { ...f.dest };
    goal = { ...P };
    flight = null;
    badge.hidden = true;
    if (f.end === "walk") {
      mode = "ground";
      host.classList.remove("groundless");
      let loc = doorstep(f.cell, f.home),
        framing = null;
      // First-person nature studies: use a real placed subject, not a camera aimed into a hillside.
      if (!dev && !heldPoint && activeStop?.id === "granite") {
        const rocks = L.bio.statics
          .filter((o) => o.kind === "rock" && o.name !== "Pebble fan")
          .sort(
            (a, b) =>
              Math.hypot(a.x - loc.x, a.y - loc.y) -
              Math.hypot(b.x - loc.x, b.y - loc.y),
          );
        if (rocks.length) {
          const rock = rocks[0],
            size = solidFor(rock, L.bio.ec.presets),
            radius = Math.max(7, (size?.[2] || 0.03) * U * 1.5 + 2.5);
          let best = -Infinity;
          for (let k = 0; k < 16; k++) {
            const a = (k * Math.PI) / 8,
              X = rock.x + (Math.cos(a) * radius) / U,
              Y = rock.y + (Math.sin(a) * radius) / U;
            if (!L.s.sample(X, Y).drawn || L.s.sample(X, Y).depth > 0.1)
              continue;
            const score =
              -2 * Math.abs(L.s.ground(X, Y) - L.s.ground(rock.x, rock.y)) +
              0.08 *
                (L.s.ground(
                  rock.x - Math.cos(a) * 1.2,
                  rock.y - Math.sin(a) * 1.2,
                ) -
                  L.s.ground(X, Y));
            if (score > best) {
              best = score;
              loc = { x: X, y: Y, yaw: Math.atan2(X - rock.x, rock.y - Y) };
              framing = clamp(
                Math.atan2(
                  L.s.ground(rock.x, rock.y) +
                    (size?.[3] || 2) * 0.6 -
                    L.s.ground(X, Y) -
                    1.55,
                  radius,
                ),
                -0.65,
                0.38,
              );
            }
          }
        }
      }

      if (!dev) {
        const solids = L.bio.statics
          .filter(
            (v) =>
              Math.hypot(v.x - loc.x, v.y - loc.y) < 0.55 + (v.radius || 0) / U,
          )
          .map((v) => solidFor(v, L.bio.ec.presets))
          .filter(Boolean);
        const free = (X, Y) =>
          L.s.sample(X, Y).drawn &&
          L.s.traversable(X, Y) &&
          !fenceAt(L.sc?.userData.blocks, X, Y) &&
          !L.all.some((r) => r[5] && inHouse(r[5], X, Y, 0.34)) &&
          !solids.some(
            (o) =>
              Math.hypot(o[0] - X, o[1] - Y) < o[2] && clearance(o, X, Y) < 0,
          );
        if (!free(loc.x, loc.y)) {
          let good = null;
          for (let radius = 0.4; radius <= 18 && !good; radius += 0.4)
            for (let k = 0; k < 16; k++) {
              const X = loc.x + (Math.cos((k * Math.PI) / 8) * radius) / U,
                Y = loc.y + (Math.sin((k * Math.PI) / 8) * radius) / U;
              if (free(X, Y)) {
                good = { x: X, y: Y, yaw: loc.yaw };
                break;
              }
            }
          if (!good) {
            fail(new Error("No walkable surface at these coordinates"));
            return;
          }
          loc = good;
        }
      }

      x = loc.x;
      y = loc.y;
      yaw = loc.yaw;
      pitch =
        framing ??
        (!dev && activeStop?.id === "lake"
          ? -0.075
          : activeStop?.id === "coast"
            ? -0.045
            : activeStop?.id === "cliffs"
              ? -0.09
              : 0.035);
      blockedSteps = 0;
      portrait = !!(dev && activeStop && stopView === "bank");
      arrivalStep = 0;
      follow = 4.6;
      motor.reset(x, y, L.s, yaw, walker.H);
      walker.reset();
      if (stopView === "grove" && activeStop?.id === "lake") {
        yaw += Math.PI;
        pitch = 0.68;
        third = false;
        motor.yaw = yaw;
      } else if (portrait) {
        yaw += Math.PI;
        follow = 3.75;
        pitch = 0.06;
        third = true;
      }
      if (restorePose) {
        yaw = restorePose.yaw;
        pitch = restorePose.pitch;
        follow = restorePose.follow;
        third = !!restorePose.third;
        motor.yaw = yaw;
        restorePose = null;
      }
      heldPoint = null;
      once = true;
      stepClock = lastRipple = foot = 0;
      camState = {};
      lastBodyYaw = motor.yaw;
      lastContact = 0;
      lastEventLand = 0;
      ui.start();
      lastMark = walked = 0;
      gov.reset();
      softWindow = [];
      canvas.focus({ preventScroll: true });
      lastHud = -1e8;
    } else {
      mode = "survey";
      restorePose = null;
      if (f.end === "overview") {
        v = null;
        contract();
        language();
        if (L) {
          free(L);
          L = null;
          tiles.trim(new Set());
          pl.clear();
        }
        job++;
        building = "";
        busy = false;
      }
    }
    dirty = true;
  }
  function flying(dt) {
    const f = flight;
    f.t += Math.min(0.16, dt);
    const needs = f.end === "walk" || f.end === "inspect";
    const at = needs && (!L || !within(L, ...f.cell) || busy);
    if (at && f.t / f.dur > 0.7) f.t = 0.7 * f.dur;
    let t = clamp(f.t / f.dur, 0, 1),
      ease = smooth(0, 1, t),
      s = f.start,
      g = f.dest;
    P.x = mix(s.x, g.x, ease);
    P.y = mix(s.y, g.y, ease);
    P.r =
      Math.exp(
        mix(Math.log(Math.max(0.06, s.r)), Math.log(Math.max(0.06, g.r)), ease),
      ) +
      f.bump * Math.sin(Math.PI * t) ** 2;
    P.yaw = turn(s.yaw, g.yaw, ease);
    P.tilt =
      mix(s.tilt, g.tilt, ease) +
      0.32 * Math.sin(Math.PI * t) * Math.min(1, f.bump / 20000);
    P.eye = mix(s.eye, g.eye, ease);
    if (t >= 1) settle(f);
  }
  function applyQuality() {
    mats.uniforms.summer.value = +(prefs.season === "summer");
    fx.dispose();
    fx = new WeatherFX(scene, env, gov.tier, reduced || prefs.saver);
    lastSize = "";
    requestResize();
    if (L) {
      if (mode === "ground") prepare(x, y, true);
    }
    lastLabels = -1e8;
    dirty = true;
  }
  function ground(dt, now) {
    const act = canPlay();
    stick = input.stick();
    let pads;
    try {
      pads = act ? navigator.getGamepads?.() : null;
    } catch {}
    const gp = pad.poll(pads, act);
    if (gp.down) activeJump();
    if (gp.up) motor.releaseJump();
    if (gp.lookX || gp.lookY) {
      lastPadLook = now;
      yaw -= gp.lookX * dt * 2.3 * prefs.gain;
      pitch = clamp(
        pitch - gp.lookY * dt * 1.8 * prefs.gain * (prefs.invert ? -1 : 1),
        third ? -1.06 : -1.28,
        third ? 0.57 : 1.13,
      );
    }
    if (gp.active) ui.wake();
    let f = act
        ? Number(pressed.has("KeyW") || pressed.has("ArrowUp")) -
          Number(pressed.has("KeyS") || pressed.has("ArrowDown")) +
          stick[1] +
          gp.forward
        : 0,
      r = act
        ? Number(pressed.has("KeyD") || pressed.has("ArrowRight")) -
          Number(pressed.has("KeyA") || pressed.has("ArrowLeft")) +
          stick[0] +
          gp.side
        : 0;
    const run =
        travelMode === "jog" ||
        input.sprint() ||
        gp.sprint ||
        pressed.has("ShiftLeft") ||
        pressed.has("ShiftRight"),
      rate =
        (travelMode === "boost" ? rates.boost : run ? rates.jog : rates.walk) *
        speed;
    const ox = x,
      oy = y,
      S = L.s,
      h = Math.min(0.24, dt);
    // Rebuild a tiny trunk / boulder neighbourhood only when the player or the placement patch changes.
    if (
      !L.solidCentre ||
      L.solidPatch !== L.bio.statics ||
      Math.hypot(x - L.solidCentre[0], y - L.solidCentre[1]) > 0.16
    ) {
      L.solidCentre = [x, y];
      L.solidPatch = L.bio.statics;
      L.solids = [];
      L.camHomes = L.all
        .map((r) => r[5])
        .filter(
          (h) => h && Math.hypot(h.centre[0] - x, h.centre[1] - y) < 0.67,
        );
      for (const v of L.bio.statics) {
        if (Math.hypot(v.x - x, v.y - y) > 0.62 + (v.radius || 0) / U) continue;
        const solid = solidFor(v, L.bio.ec.presets);
        if (solid) L.solids.push(solid);
      }
    }
    if (L.coverPatch !== L.cover?.solids || L.coverCentre !== L.solidCentre) {
      L.coverPatch = L.cover?.solids;
      L.coverCentre = L.solidCentre;
      L.nearCover = (L.coverPatch || []).filter(
        (o) => Math.hypot(o[0] - x, o[1] - y) < 0.44 + o[2],
      );
    }
    const resetCamera = once && !camState.arm;
    if (
      prefs.recenter &&
      third &&
      !portrait &&
      !input.isLooking() &&
      now - Math.max(input.lastLook(), lastPadLook) > 3100 &&
      motor.speed > 0.6 &&
      Math.abs(r) < 0.08 &&
      f > 0.22 &&
      Math.abs(yaw - motor.yaw) > 0.002
    )
      yaw = turn(yaw, motor.yaw, 1 - Math.exp(-h * 0.91));
    const m = motor.advance(
      h,
      r * Math.cos(yaw) - f * Math.sin(yaw),
      f * Math.cos(yaw) + r * Math.sin(yaw),
      rate,
      S,
      pass,
      walker.H,
    );
    // Physics is substepped; the 62-joint palette only needs uploading for actual drawn frames.
    const ma = S.worldXYZ(motor.x, motor.y, motor.root),
      curvature =
        Math.atan2(
          Math.sin(motor.yaw - lastBodyYaw),
          Math.cos(motor.yaw - lastBodyYaw),
        ) / Math.max(0.008, h);
    lastBodyYaw = motor.yaw;
    const poi =
      L.camHomes?.[0]?.centre ||
      L.bio.anim.find(
        (v) => v.screen && Math.hypot(v.x - motor.x, v.y - motor.y) < 0.25,
      );
    const toward = poi
      ? Math.atan2(
          -((poi.x ?? poi[0]) - motor.x),
          (poi.y ?? poi[1]) - motor.y,
        ) - motor.yaw
      : 0;
    walker.pose({
      dt: h,
      vel: motor.speed,
      depth: motor.depth,
      swim: motor.swim,
      ground: ([X, Z]) => S.ground(O.x + X / U, O.y - Z / U),
      root: motor.touch.z,
      at: [ma[0], ma[2]],
      yaw: motor.yaw,
      arrive: once,
      air: motor.air,
      climb: motor.grade,
      vertical: motor.up,
      landAge: motor.landAge,
      launchAge: motor.launchAge,
      impact: motor.impact,
      curvature,
      look: Math.abs(toward) < 1.3 ? toward * 0.28 : 0,
      idleTime: now * 0.001,
      reduced: reduced || prefs.saver,
    });
    once = false;
    x = motor.x;
    y = motor.y;
    walked += m / U;
    blockedSteps = motor.blocked;
    jumpH = motor.air;
    const t = now * 0.001,
      hit = motor.touch,
      g = hit.z,
      point = S.worldXYZ(x, y, motor.root),
      local = S.xyz(x, y, motor.root),
      heading = motor.yaw,
      at = [local[0], local[2]],
      wet = motor.depth > 0.074;
    avatar.visible = third;
    avatar.position.set(...point);
    avatar.rotation.set(0, heading, 0);
    floorShade.visible = third && motor.depth < 0.1;
    floorShade.position.set(point[0], g + 0.009, point[2]);
    if (
      floorShade.visible &&
      (!shadeKey || shadeKey.s !== S || shadeKey.x !== x || shadeKey.y !== y)
    ) {
      const [gx, gz] = S.gradeAt(x, y);
      floorShade.quaternion.setFromUnitVectors(
        new T.Vector3(0, 0, 1),
        new T.Vector3(-gx, 1, -gz).normalize(),
      );
      shadeKey = { s: S, x, y };
    }
    floorShade.material.uniforms.strength.value =
      0.3 * Math.max(0.2, 1 - jumpH);
    mats.uniforms.actor.value.set(at[0], at[1], Math.min(1, motor.speed), +wet);
    mats.uniforms.heading.value.set(-Math.sin(heading), -Math.cos(heading));
    stepClock += h;
    foot += m;
    if (
      wet &&
      !prefs.saver &&
      !reduced &&
      (m > 0.001 || motor.swim) &&
      stepClock - lastRipple > (motor.speed > 0.15 ? 0.3 : 1.55)
    ) {
      const side = motor.ripples % 2 ? 0.14 : -0.14;
      mats.ripple(
        at[0] + Math.cos(heading) * side,
        at[1] - Math.sin(heading) * side,
        t,
        motor.speed > 0.12 ? 0.85 : 0.25,
      );
      motor.ripples++;
      lastRipple = stepClock;
    }
    const contact = walker.metrics().contacts || 0;
    const landed = motor.lands > lastEventLand;
    if (
      motor.swim &&
      motor.speed > 0.17 &&
      stepClock - (L.lastStroke || 0) > 0.89
    ) {
      L.lastStroke = stepClock;
      tracks.mix.footstep("water", false, ++tracks.seq);
    }
    if (landed) buzz(16);
    if (
      (contact > lastContact && motor.speed > 0.18 && motor.grounded) ||
      landed
    ) {
      const k = surfaceName(hit),
        raining = env.weather?.rain > 0.08,
        sound = wet
          ? "water"
          : raining || k === "mud"
            ? "mud"
            : hit.m[3] > 0.55
              ? "leaves"
              : k === "sand"
                ? "sand"
                : k === "rock"
                  ? "rock"
                  : "grass";
      const f = walker.metrics().feet?.find((v) => v.stance),
        X = f?.foot[0] ?? point[0],
        Z = f?.foot[1] ?? point[2];
      tracks.beat(
        v3.set(
          X,
          Math.max(
            S.ground(O.x + X / U, O.y - Z / U),
            wet ? hit.line : -Infinity,
          ) + 0.016,
          Z,
        ),
        sound,
        landed,
        heading,
        raining,
      );
    }
    lastEventLand = motor.lands;
    lastContact = contact;
    const eye = motor.swim
      ? Math.max(hit.line + 0.25, motor.root + walker.H + 0.46)
      : motor.root + (prefs.walker === "man" ? 1.62 : 1.58);
    camProof = followCamera(cam, camState, {
      s: S,
      x,
      y,
      root: motor.root,
      yaw,
      pitch,
      distance: follow,
      swim: motor.swim,
      eye,
      first: !third,
      portrait,
      step: h,
      reset: resetCamera,
      objects: [
        ...L.solids,
        ...(L.nearCover || []).filter(
          (a) => Math.abs(a[0] - x) < 0.13 && Math.abs(a[1] - y) < 0.13,
        ),
      ],
      homes: L.camHomes,
      fences: (L.sc?.userData.blocks || []).filter(
        ([a, b, c, d]) =>
          x > a - 0.13 && x < c + 0.13 && y > b - 0.13 && y < d + 0.13,
      ),
      boost: travelMode === "boost",
    });
    walker.opacity(
      !third || camProof.arm >= 1 ? 1 : Math.max(0.24, camProof.arm),
    );
    L.camH = cam.position.y;
    P = { x, y, r: third ? follow : 0.07, tilt: 0.2, yaw, eye: eye - g };
    cameraAGL = L.camH - g;
    ex = S.relief;
    if (
      !busy &&
      (L.cx !== Math.floor(x / 64) ||
        L.cy !== Math.floor(y / 64) ||
        Math.abs(x - L.fx) > 2.8 ||
        Math.abs(y - L.fy) > 2.8)
    )
      prepare(x, y);
    else if (!busy && Math.hypot(x - L.nx, y - L.ny) > 1.35) nature(L);
    L.cover.update(x, y);
    L.cover.g.visible = true;
    tracks.reduced = reduced || prefs.saver;
    tracks.update(h);
    const hop = q("#hop"),
      pace = q("#pace"),
      disabled = motor.swim || motor.depth >= 0.68;
    if (hop.disabled !== disabled) hop.disabled = disabled;
    if (pace.getAttribute("aria-pressed") !== String(run))
      pace.setAttribute("aria-pressed", String(run));
    groundFrames++;
  }
  input = touchWalk(host, canvas, q(".joystick"), q("#hop"), q("#pace"), on, {
    active: canPlay,
    left: () => prefs.left,
    zoom,
    turn: (dx, dy) => {
      yaw -= dx * 0.004 * prefs.gain;
      lookTurn -= dx * 0.004;
      pitch = clamp(
        pitch - dy * 0.003 * prefs.gain * (prefs.invert ? -1 : 1),
        third ? -1.06 : -1.18,
        third ? 0.57 : 1.13,
      );
    },
    jump: activeJump,
    jumpEnd: () => motor.releaseJump(),
    sprint: (v) => {
      sprintHeld = v;
      q("#pace").setAttribute("aria-pressed", String(v));
    },
    wake: ui.wake,
    audio: () => tracks.unlock(),
    lesson: ui.lesson,
  });
  function neutral() {
    pressed.clear();
    pad?.reset();
    input?.reset();
    stick = [0, 0];
    pointers.clear();
  }
  on(document, "visibilitychange", () => {
    if (document.hidden) bookmark(true, true);
    neutral();
    last = 0;
  });
  on(window, "pagehide", () => {
    bookmark(true, true);
    neutral();
  });
  on(window, "atlas:host-pause", () => {
    bookmark(true, true);
    hostPaused = true;
    neutral();
    last = 0;
  });
  on(window, "atlas:host-resume", () => {
    hostPaused = false;
    neutral();
    last = 0;
    dirty = true;
  });
  function readout() {
    const loc = ll(a.project, P.x, P.y),
      coarse = data.sample(P.x, P.y),
      isGround = mode === "ground",
      cell = within(L, P.x, P.y) ? tiles.at(P.x, P.y) : null;
    return {
      loc,
      h: cell?.d ? cell.z : coarse,
      did: cell?.d || data.region(P.x, P.y),
    };
  }
  function hud(now) {
    const { loc, h, did } = readout(),
      d = ds.get(did);
    lastLL = loc;
    if (expanded && L) {
      pocket.draw(L, P.x, P.y, P.yaw, P.r);
      const name = d ? tr(d.name, d.te) : msg("world.landscape"),
        key = {
          Clear: "clear",
          Cloudy: "cloudy",
          Drizzle: "drizzle",
          "Light rain": "drizzle",
          Thunderstorm: "thunder",
          Clearing: "clearing",
          "Partly cloudy": "part",
          Rain: "rain",
          "Heavy rain": "heavy",
        }[env.weather.label];
      const chip = q("#place-chip");
      chip.querySelector("span").textContent = name;
      chip.querySelector("small").textContent =
        msg(prefs.time === "live" ? "walk.localTime" : "walk.shortTime", {
          time: env.clock.replace(/\s*IST/i, ""),
        }) +
        " · " +
        (key ? msg("weather." + key) : env.weather.label);
      bookmark();
    }
    const nd = trueNorth(a.project, ...loc);
    const northYaw = Math.atan2(-nd.x, -nd.z);
    q(".world-top .flight-north i").style.transform = dq(
      ".flight-north i",
    ).style.transform = `rotate(${((P.yaw - northYaw) * 180) / Math.PI}deg)`;
    const wpp =
      (2 *
        Math.max(P.r, third ? 5 : 3.7) *
        Math.tan((cam.fov * Math.PI) / 360)) /
      deck.clientHeight;
    const lengths = [
        0.25, 0.5, 1, 2, 3, 6, 12, 24, 60, 120, 240, 600, 1200, 2400, 6000,
        12000, 24000, 48000,
      ],
      u = lengths.find((v) => v / wpp >= 36) || 48000;
    const real = u,
      bar = dq(".flight-scale");
    bar.querySelector("i").style.width = u / wpp + "px";
    bar.querySelector("span").textContent =
      real >= 1000
        ? `${+(real / 1000).toFixed(2)} km`
        : `${+real.toFixed(2)} m`;
    if (mode === "ground") {
      q("#gps").textContent = msg("details.coords", {
        lat: loc[1].toFixed(6),
        lon: loc[0].toFixed(6),
      });
      q("#world-district").textContent = d
        ? tr(d.name, d.te) +
          " · " +
          msg(d.state === "Telangana" ? "geo.tg" : "geo.ap")
        : "";
      q("#alt").textContent = msg("details.elevation", {
        metres: Math.round(h),
      });
      q("#acre-now").textContent = msg("details.plot", {
        code: Math.floor(x) + "-" + Math.floor(y),
      });
      q("#clock-now").textContent = msg(
        prefs.time.startsWith("shared")
          ? "details.shared"
          : prefs.time === "live"
            ? "details.world"
            : "details.preset",
        { time: env.clock },
      );
      q("#local-clock").textContent = msg("details.local", {
        time: localFormats[
          document.documentElement.lang === "te" ? "te" : "en"
        ].format(new Date()),
      });
      const w = env.weather,
        weatherKey = {
          Clear: "clear",
          Cloudy: "cloudy",
          Drizzle: "drizzle",
          "Light rain": "drizzle",
          Thunderstorm: "thunder",
          Clearing: "clearing",
          "Partly cloudy": "part",
          Rain: "rain",
          "Heavy rain": "heavy",
        }[w.label];
      q("#weather-now").textContent =
        (w.label === "Clear" && env.astro.sun.altitude < -4 ? "☾" : w.icon) +
        " " +
        (weatherKey ? msg("weather." + weatherKey) : w.label);
      const bb = a.project.bbox_wgs84,
        marker = q(".mini i");
      marker.style.left = ((loc[0] - bb[0]) / (bb[2] - bb[0])) * 100 + "%";
      marker.style.top = ((bb[3] - loc[1]) / (bb[3] - bb[1])) * 100 + "%";
      const surface = surfaceName(motor.touch);
      cap.hidden = true;
      ui.update(
        d ? tr(d.name, d.te) : msg("world.landscape"),
        q("#place-chip small").textContent,
        did,
        motor.swim ? "swimming" : motor.depth > 0.09 ? "water" : surface,
        q("#acre-now").textContent,
        w.rain > 0.08,
      );
      greet.hidden = true;
      q("#life-read").hidden = !dev || !prefs.life;
      q("#life-read").textContent =
        msg("details.nearby") +
        (L?.bio?.visibleNames.join(" · ") || msg("details.watching"));
      q(".detail-note").textContent =
        msg("details.tier") + " " + gov.tier + " · " + fps.toFixed(0) + " FPS";
    } else if (!overlay) {
      const el = document.querySelector("#readout");
      el.textContent =
        (d ? tr(d.name, d.te) + " · " : "") +
        msg("details.coords", {
          lat: loc[1].toFixed(6),
          lon: loc[0].toFixed(6),
        }) +
        " · " +
        msg(
          prefs.time.startsWith("shared")
            ? "details.shared"
            : prefs.time === "live"
              ? "details.world"
              : "details.preset",
          {
            time: env.clock,
          },
        );
    }
    lastHud = now;
  }
  function cameraOrbit() {
    const alt = P.r * Math.sin(P.tilt);
    cameraAGL = alt;
    ex = within(L, P.x, P.y) ? L.s.relief : prefs.relief;
    const b = data.sample(P.x, P.y) * ex;
    let h = b;
    if (within(L, P.x, P.y) && P.r < 22000)
      h = mix(L.s.ground(P.x, P.y), b, smooth(3100, 22000, P.r));
    const z = h + P.eye,
      k = P.r * Math.cos(P.tilt);
    cam.position.set(
      (P.x - O.x) * U + Math.sin(P.yaw) * k,
      z + P.r * Math.sin(P.tilt),
      (O.y - P.y) * U + Math.cos(P.yaw) * k,
    );
    if (P.r < 7000 && L) {
      const bx = O.x + cam.position.x / U,
        by = O.y - cam.position.z / U;
      if (within(L, bx, by))
        cam.position.y = Math.max(
          cam.position.y,
          L.s.ground(bx, by) + Math.min(80, 1.8 + P.r * 0.032),
        );
    }
    cam.rotation.order = "YXZ";
    cam.lookAt((P.x - O.x) * U, z, (O.y - P.y) * U);

    avatar.visible =
      third &&
      !!L &&
      P.r < 110 &&
      flight?.end === "walk" &&
      within(L, ...flight.cell);
    if (avatar.visible) {
      const { x: ax, y: ay } = doorstep(flight.cell, flight.home);
      avatar.position.set(...L.s.worldXYZ(ax, ay, L.s.ground(ax, ay)));
      avatar.rotation.y = 0;
    }
  }
  function animate(now) {
    if (dead) return;
    raf = requestAnimationFrame(animate);
    const dt = last ? Math.max(0, (now - last) / 1000) : 0;
    if (prefs.saver && lastRender && now - lastRender < 1000 / 30 - 0.5) return;
    lastRender = now;
    last = now;
    if (overlay || hostPaused || document.hidden) return;
    if (resizePending) {
      resizePending = false;
      resize();
      lastLabels = lastHud = -1e8;
    }
    const stationary =
      mode === "survey" &&
      !flight &&
      Math.abs(goal.r - P.r) < 0.1 &&
      Math.hypot(goal.x - P.x, goal.y - P.y) < 0.01 &&
      Math.abs(goal.tilt - P.tilt) < 0.002;
    if (stationary && !dirty && now - lastOrbitPaint < (P.r > 900 ? 1100 : 100))
      return;
    lastOrbitPaint = now;
    dirty = false;
    if (mode === "flight") flying(dt);
    if (
      mode === "survey" &&
      goal.r < 14 &&
      !busy &&
      within(L, goal.x, goal.y)
    ) {
      if (homeNear(goal.x, goal.y)) return;
      const c = safeCell(goal.x, goal.y);
      if (c) goCell(c, false);
      else goal.r = 24;
    }
    if (mode === "survey") {
      const t = reduced ? 1 : 1 - Math.exp(-Math.min(0.2, dt) * 7);
      P.x = mix(P.x, goal.x, t);
      P.y = mix(P.y, goal.y, t);
      P.r = Math.exp(mix(Math.log(Math.max(0.03, P.r)), Math.log(goal.r), t));
      P.tilt = mix(P.tilt, goal.tilt, t);
      P.yaw = turn(P.yaw, goal.yaw, t);
      P.eye = mix(P.eye, goal.eye, t);
      if (
        P.r < 60000 &&
        !busy &&
        (data.region(P.x, P.y) || within(L, P.x, P.y)) &&
        (!L || L.cx !== Math.floor(P.x / 64) || L.cy !== Math.floor(P.y / 64))
      )
        prepare(P.x, P.y);
    }
    if (photo && L) tickPhoto(Math.min(0.12, dt));
    else if (mode === "ground" && L) ground(dt, now);
    else cameraOrbit();
    if (mode !== "ground") {
      floorShade.visible = false;
      mats.uniforms.actor.value.w = 0;
    }
    const far =
        mode === "ground"
          ? gov.tier === 0
            ? 15000
            : 42000
          : clamp(P.r * 3 + 45000, 45000, 4800000),
      near = mode === "ground" ? 0.1 : clamp(P.r / 800, 0.075, 200);
    const fov = 48 + 10 * (1 - smooth(7, 160, P.r));
    if (
      Math.abs(cam.far - far) > 0.1 ||
      Math.abs(cam.near - near) > 0.002 ||
      Math.abs(cam.fov - fov) > 0.01
    ) {
      cam.far = far;
      cam.near = near;
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    if (L)
      mats.uniforms.cameraInPatch.value
        .copy(cam.position)
        .sub(L.group.position);
    env.uni.uDetail.value = 1 - smooth(8000, 22000, P.r);
    const regionalOnly = P.r > 22000,
      localVisible = !!L && (!regionalOnly || mode === "ground");
    if (L) {
      L.group.visible = localVisible;
      L.group.scale.y = 1;
      if (L.sc) L.sc.visible = localVisible && P.r < 8200;
    }
    const cameraLoc = ll(
      a.project,
      O.x + cam.position.x / U,
      O.y - cam.position.z / U,
    );
    calendarAt = wallClock(Date.now(), now);
    const regionKey = [Math.floor(P.x / 16), Math.floor(P.y / 16), !!L].join(
      ":",
    );
    if (regionKey !== weatherCell) {
      weatherCell = regionKey;
      prefs.regional = L?.s.ec?.at(P.x, P.y) || {};
    }
    env.update(
      calendarAt,
      cameraLoc,
      within(L, P.x, P.y) ? tiles.at(P.x, P.y)?.z || 0 : data.sample(P.x, P.y),
      photo
        ? {
            ...prefs,
            worldConfig,
            regional: prefs.regional,
            time: "manual",
            hour: +q("#photo-hour").value,
            weather: q("#photo-weather").value,
          }
        : prefs,
    );
    if (L?.nightMeshes && now - (L.lastNight || -1e9) > 350) {
      const hr = photo
        ? +q("#photo-hour").value
        : calendar(Date.now(), worldConfig, prefs.time, prefs.hour).hour;
      for (const m of L.nightMeshes) {
        const strength = windowLight(
          m.userData.glow,
          env.uni.uDay.value,
          hr,
          env.weather.rain,
        );
        if (m.material.emissive) m.material.emissiveIntensity = strength * 1.6;
        else m.material.opacity = strength * 0.55;
      }
      L.lastNight = now;
    }
    if (
      mode === "ground" &&
      L &&
      tracks.mix.ctx &&
      now - (L.audioAt || -1e9) > 500
    ) {
      L.audioAt = now;
      let animal = null,
        animalM = 8;
      for (const candidate of L.bio.anim) {
        const dx = (candidate.x - x) * U,
          dz = (candidate.y - y) * U,
          dy = (candidate.world?.[1] ?? motor.root) - motor.root - 1.5;
        const d = Math.hypot(dx, dy, dz);
        if (d < animalM) {
          animal = candidate;
          animalM = d;
        }
      }
      const cx = L.s.t.at(x, y);
      tracks.mix.tick({
        hour: calendar(Date.now(), worldConfig, prefs.time, prefs.hour).hour,
        weather: env.weather,
        speed: motor.speed,
        water: motor.depth > 0.02,
        river: cx?.c === 3,
        fall: !!L.extras?.fall,
        roof: L.camHomes?.some(
          (h) => Math.hypot(h.centre[0] - x, h.centre[1] - y) * U < 6,
        ),
        village: L.all.length > 0,
        forest: cx?.f > 48,
        animal: animal?.name,
        animalM,
        pan: animal ? Math.tanh((animal.x - x) * 2) : 0,
      });
    }
    if (L) {
      L.s.storm = env.weather.storm;
      L.s.isNight = env.uni.uDay.value < 0.25;
    }
    if (L && now - (L.seasonCheck || -1e9) > 5000) {
      L.seasonCheck = now;
      const sh = calendar(calendarAt, worldConfig);
      const period = prefs.season === "auto" ? sh.season : prefs.season;
      mats.uniforms.summer.value = +(period === "summer");
      if (L.s.period !== period && !busy) {
        prepare(x, y, true);
      }
    }
    if (L?.soils)
      L.soils.material.color.setScalar(1 - 0.32 * env.weather.storage);
    L?.wetFX?.userData.wetUpdate?.(env.weather);
    env.track(cam, cameraAGL, P.r > 28000, now / 1000);
    renderer.setClearColor(P.r > 28000 ? 0xe7eddf : env.uni.uHor.value);
    env.uni.uGrid.value = 0;
    const useHorizon = localVisible && P.r < 4200 && within(L, P.x, P.y);
    reg.group.visible = !useHorizon;
    if (L) L.horizon.visible = useHorizon;
    reg.update(
      P.x,
      P.y,
      P.r,
      ex,
      localVisible ? L.cut : null,
      env.uni.uDetail.value,
    );
    if (
      mode === "ground" &&
      L &&
      (now - stamp > 175 ||
        Math.abs(yaw - lastCullYaw) > 0.038 ||
        Math.abs(pitch - lastCullPitch) > 0.038)
    ) {
      cam.updateMatrixWorld(true);
      if (gov.tier === 0) cropDraws(L.group, cam);
      else if (L.sc) cropDraws(L.sc, cam);
      stamp = now;
      lastCullYaw = yaw;
      lastCullPitch = pitch;
    }
    if (L)
      fx.update(
        cam,
        L.s,
        { x: P.x, y: P.y },
        now / 1000,
        localVisible && P.r < 260,
      );
    else fx.group.visible = false;
    if (localVisible && L.bio) {
      L.bio.update(dt, P.x, P.y, cam, P.r, reduced);
      L.extras?.update(cam, P.x, P.y, P.r, reduced || prefs.saver);
    }
    if (now - lastLabels > (mode === "ground" ? 500 : 55)) {
      labels.draw(
        cam,
        P.r,
        ex,
        !prefs.labels
          ? []
          : mode === "ground"
            ? L?.all || []
            : localVisible
              ? activeStop
                ? L.all.filter((r) => r[2] === activeStop.observations.user)
                : L.all
              : [],
        prefs.labels && localVisible && env.uni.uGrid.value > 0.1
          ? L.sc?.userData.labels
          : [],
        localVisible ? L.s : null,
        mode === "ground" ? { x, y } : null,
      );
      landing();
      lastLabels = now;
    }
    if (now - lastHud > (mode === "ground" ? 180 : 240)) hud(now);
    renderer.render(scene, cam);
    if (mode === "ground" && L && L.cover?.last) L.groundDrawn = true;
    fr++;
    elapsed += dt;
    if (mode === "ground" && !busy && !arrivalStep) {
      fcount++;
      fsec += dt;
      if (fsec > 1.1) {
        fps = fcount / fsec;
        fcount = fsec = 0;
      }
      const n = third ? 1 : 0,
        grass = L.cover?.count || 0;
      if (gov.tier === 2 && grass) {
        latestRich = {
          frames: (latestRich?.frames || 0) + 1,
          people: 1,
          grass,
        };
      }
      if (
        (prefs.quality === "auto" || gov.trial) &&
        gov.observe(dt, n, grass)
      ) {
        applyQuality();
      } else if (gov.tier === 0) {
        softWindow.push(dt);
        if (softWindow.length >= 18) {
          const avg = softWindow.reduce((a, b) => a + b) / softWindow.length;
          if (avg > 1 / 31 && pixelBudget > 64000) {
            pixelBudget = Math.max(64000, Math.round(pixelBudget * 0.82));
            requestResize();
          }
          softWindow = [];
        }
      }
    }
  }
  function screenPoint(e) {
    return reg.groundAt(cam, e.clientX, e.clientY, canvas);
  }
  on(
    canvas,
    "wheel",
    (e) => {
      e.preventDefault();
      zoom(
        e.deltaY < 0 ? 1.55 : 1 / 1.55,
        mode === "ground" ? null : screenPoint(e),
      );
    },
    { passive: false },
  );
  on(canvas, "pointerdown", (e) => {
    if (mode === "ground" && !photo) return;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
    });
    if (mode === "ground") tracks.unlock();
  });
  on(canvas, "pointermove", (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x,
      dy = e.clientY - p.y;
    p.moved ||= Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 4;
    if (pointers.size === 2) {
      const other = [...pointers.entries()].find(
          ([id]) => id !== e.pointerId,
        )[1],
        ratio =
          Math.hypot(e.clientX - other.x, e.clientY - other.y) /
          Math.max(1, Math.hypot(p.x - other.x, p.y - other.y));
      other.moved = p.moved = true;
      if (photo) {
        const k = 0.012;
        photo.p.x -= dx * Math.cos(photo.yaw) * k;
        photo.p.z += dx * Math.sin(photo.yaw) * k;
        photo.p.y += dy * k;
      }

      if (Number.isFinite(ratio) && ratio > 0)
        zoom(
          clamp(ratio, 0.5, 2),
          mode === "ground"
            ? null
            : screenPoint({
                clientX: (other.x + e.clientX) / 2,
                clientY: (other.y + e.clientY) / 2,
              }),
        );
    } else if (photo) {
      photo.yaw -= dx * 0.004;
      photo.pitch = clamp(photo.pitch - dy * 0.003, -1.49, 1.49);
    } else if (mode === "ground") {
      yaw -= dx * 0.004;
      lookTurn -= dx * 0.004;
      pitch = clamp(pitch - dy * 0.003, -1.18, 1.13);
    } else if (!flight) {
      if (e.shiftKey || e.buttons === 2) {
        goal.yaw -= dx * 0.004;
        goal.tilt = clamp(goal.tilt + dy * 0.003, 0.27, 1.48);
      } else {
        const u =
            (2 * P.r * Math.tan((cam.fov * Math.PI) / 360)) /
            deck.clientHeight /
            U,
          c = Math.cos(P.yaw),
          s = Math.sin(P.yaw),
          du = dy / Math.max(0.46, Math.sin(P.tilt));
        goal.x = clamp(goal.x - u * (dx * c + du * s), 0, a.project.cols);
        goal.y = clamp(goal.y + u * (-dx * s + du * c), 0, a.project.rows);
      }
      dirty = true;
    }
    p.x = e.clientX;
    p.y = e.clientY;
  });
  on(canvas, "contextmenu", (e) => e.preventDefault());
  on(canvas, "pointerup", (e) => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (!p || p.moved || mode !== "survey") return;
    const pt = screenPoint(e);
    if (!pt?.[2]) return;
    if (P.r > 3000 && ds.has(pt[2])) inspect(ds.get(pt[2]));
    else if (P.r > 35) {
      goal.x = pt[0];
      goal.y = pt[1];
      zoom(2.5);
    } else {
      const c = safeCell(...pt);
      if (c) goCell(c, false);
    }
  });
  on(canvas, "pointercancel", (e) => pointers.delete(e.pointerId));
  on(canvas, "lostpointercapture", (e) => pointers.delete(e.pointerId));
  on(window, "keydown", (e) => {
    if (
      overlay ||
      document.querySelector("dialog[open]") ||
      e.target.matches("input,select,textarea")
    )
      return;
    if (e.code === "Escape" && expanded) {
      if (photo) {
        q("#photo-exit").click();
        return;
      }
      if (ui.busy()) {
        ui.close();
        return;
      }
      sheet.hidden = !sheet.hidden;
      neutral();
      return;
    }
    if (!expanded && e.target !== canvas) return;
    if (
      sheet.hidden &&
      mode === "ground" &&
      [
        "KeyW",
        "KeyS",
        "KeyA",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ShiftLeft",
        "ShiftRight",
        "Space",
      ].includes(e.code)
    ) {
      e.preventDefault();
      tracks.unlock();
      pressed.add(e.code);
      if (e.code === "Space" && !e.repeat) activeJump();
    } else if (
      mode === "survey" &&
      ["Equal", "Minus", "Home"].includes(e.code)
    ) {
      e.preventDefault();
      if (e.code === "Home") overview();
      else zoom(e.code === "Equal" ? 2 : 0.5);
    }
  });
  on(window, "keyup", (e) => {
    pressed.delete(e.code);
    if (e.code === "Space") motor.releaseJump();
  });
  on(window, "blur", neutral);
  q("#world-menu").onclick = () => {
    sheet.hidden = !sheet.hidden;
    ui.close();
    neutral();
  };
  q("#hide-sheet").onclick = () => (sheet.hidden = true);
  q("#camera-mode").onclick = () => {
    third = !third;
    language();
  };
  q("#walker-style").onchange = (e) => {
    prefs.walker = e.target.value;
    save();
    walker.dispose();
    walker = traveller(prefs.walker);
    avatar.add(walker.group);
    once = true;
    language();
  };
  q("#view-walker").onclick = () => {
    portrait = !portrait;
    third = true;
    yaw = motor.yaw + (portrait ? Math.PI : 0);
    follow = portrait ? 3.7 : 4.6;
    pitch = portrait ? 0.065 : 0.035;
    sheet.hidden = true;
    language();
  };
  q("#speed").oninput = (e) => {
    speed = +e.target.value;
    language();
  };
  q("#travel-mode").onchange = (e) => {
    travelMode = e.target.value;
    language();
  };
  function guide(id, view = "ground") {
    let stop = stops.find((s) => s.id === id);
    if (!stop) return;
    heldPoint = restorePose = null;
    if (!dev) third = false;
    else if (stopView === "grove" && view !== "grove") third = true;
    if (view === "grove" && id !== "lake") view = "ground";
    if (view === "bank") {
      if (!stop.bank) return;
      stop = { ...stop, ...stop.bank };
      if (!dev) stop.yaw = 1.53;
    }
    if (!dev && id === "cliffs" && view === "ground")
      stop = { ...stop, yaw: -2.18 };
    if (!dev && id === "coast" && view === "ground")
      stop = {
        ...stop,
        cell: [5957, 3969],
        point: [5957.48, 3969.02],
        yaw: -1.02,
      };
    if (!dev && view === "mid" && id === "cliffs")
      stop = { ...stop, point: [2706.67, 3561.6], yaw: -2.18 };
    if (!dev && view === "mid" && id === "delta")
      stop = { ...stop, point: [7036.8, 5936.7], yaw: 2.11 };
    districtWalk = null;
    activeStop = stop;
    stopView = view;
    q("#field-stop").value = id;
    expand();
    sheet.hidden = true;
    let [gx, gy] = stop.cell;
    v = null;
    language();
    if (view === "ground" || view === "bank" || view === "grove") {
      goCell(stop.cell, false);
      return;
    }
    const r = view === "mid" ? 138 : 1650,
      tilt = view === "mid" ? (id === "cliffs" ? 0.2 : 0.28) : 0.36;
    launch(
      {
        x: stop.point?.[0] ?? gx + 0.5,
        y: stop.point?.[1] ?? gy + 0.5,
        r,
        tilt,
        yaw: stop.yaw,
        eye: view === "mid" ? 3 : 8,
      },
      "inspect",
      stop.cell,
    );
  }

  const mixer = tracks.mix;
  const mixPanel = document.createElement("details");
  mixPanel.className = "pref-panel";
  mixPanel.innerHTML =
    '<summary data-msg="sound.title"></summary><button id="audio-on" data-msg="sound.unlock"></button>' +
    ["Master", "Music", "Effects", "Ambience", "Weather"]
      .map(
        (k) =>
          `<label><span data-msg="sound.${k}"></span><input data-gain="${k}" type="range" min="0" max="1" step="0.05" value="${mixer.settings[k]}"></label>`,
      )
      .join("") +
    ["mute", "music"]
      .map(
        (k) =>
          `<label><input data-sound="${k}" type="checkbox" ${mixer.settings[k] ? "checked" : ""}><span data-msg="sound.${k}"></span></label>`,
      )
      .join("");
  sheet.querySelector(".sheet-foot").before(mixPanel);
  bindMessages(mixPanel);
  on(q("#audio-on"), "click", () => tracks.unlock());
  for (const el of mixPanel.querySelectorAll("input"))
    on(el, "input", () => {
      tracks.unlock();
      mixer.set(
        el.dataset.gain || el.dataset.sound,
        el.type === "range" ? +el.value : el.checked,
      );
    });
  on(document, "visibilitychange", () => mixer.pause(document.hidden));
  on(window, "atlas:host-pause", () => mixer.pause(true));
  on(window, "atlas:host-resume", () => mixer.pause(document.hidden));
  q("#world-hour").value = prefs.hour;
  q("#world-hour").oninput = (e) => {
    prefs.hour = +e.target.value;
    prefs.time = "manual";
    q("#light").value = "manual";
    save();
    dirty = true;
  };
  q("#field-stop").value = "village";
  for (const b of host.querySelectorAll("[data-range]"))
    b.onclick = () => {
      const id = q("#field-stop").value,
        k = b.dataset.range;
      if (location.hash === "#/field/" + id + "/" + k) guide(id, k);
      else location.hash = "/field/" + id + "/" + k;
    };
  for (const [key, sel] of [
    ["season", "#season"],
    ["weather", "#sim-weather"],
    ["time", "#light"],
    ["quality", "#quality"],
    ["relief", "#relief"],
  ]) {
    const el = q(sel);
    el.value = String(prefs[key]);
    el.onchange = () => {
      prefs[key] = key === "relief" ? +el.value : el.value;
      save();
      q("#relief-read").textContent = prefs.relief.toFixed(1) + "×";
      if (key === "quality") {
        gov.trial = false;
        gov.change(
          el.value === "auto" ? deviceTier(renderer) : levels[el.value],
          "field menu",
        );
        if (prefs.saver) gov.change(0, "battery saver");
        applyQuality();
        if (mode !== "ground" && L) prepare(P.x, P.y, true);
      } else if (L && (key === "season" || key === "relief")) {
        mats.uniforms.summer.value = +(prefs.season === "summer");
        prepare(P.x, P.y, true);
      }
      dirty = true;
    };
  }
  q("#relief-read").textContent = prefs.relief.toFixed(1) + "×";
  q("#nearby-life").closest("label").hidden = !dev;
  q("#nearby-life").checked = prefs.life;
  q("#nearby-life").onchange = (e) => {
    prefs.life = e.target.checked;
    save();
    lastHud = -1e8;
  };
  fieldCheck(host, tr);
  if (location.hostname === "appassets.androidplatform.net") {
    const l = document.createElement("a");
    l.className = "notes-btn";
    l.href = "/_field/share";
    l.dataset.msg = "measure.share";
    sheet.querySelector(".perf-details").append(l);
    bindMessages(sheet);
  }
  q("#go-street").onclick = streetArrival;
  q("#go-home").onclick = () => {
    if (v) visit(v);
    else if (!dev) paper(true);
    else overview();
  };
  q("#jump").onclick = () => {
    const d = ds.get(+q("#go-district").value);
    if (!d) return;
    heldPoint = restorePose = null;
    third = true;
    activeStop = null;
    districtWalk = d;
    stopView = "ground";
    language();
    goCell(d.anchor, false);
  };
  q(".mini").onclick = () => {
    sheet.hidden = true;
    paper(true);
  };
  q(".detail-trial").onclick = () => {
    if (prefs.saver || gov.cap < 2 || mode !== "ground") return;
    sheet.hidden = true;
    gov.audition();
    applyQuality();
  };
  q("#copy-gps").onclick = async () => {
    const text = `${lastLL[1].toFixed(6)}, ${lastLL[0].toFixed(6)}, ${tiles.at(x, y)?.z} m`;
    try {
      await navigator.clipboard.writeText(text);
      q("#alt").textContent = msg("details.coordsCopied");
    } catch {
      const t = document.createElement("textarea");
      t.value = text;
      sheet.hidden = false;
      sheet.append(t);
      t.focus();
      t.select();
      t.onblur = () => t.remove();
    }
  };
  q(".world-back").onclick = (e) => {
    e.preventDefault();
    ui.close();
    paper(true);
  };
  on(canvas, "webglcontextlost", (e) => {
    e.preventDefault();
    if (!dead) fail(Error("Graphics context was lost"));
  });
  on(pref, "change", () => {
    reduced = pref.matches || prefs.motion;
    env.setMotion(reduced || prefs.saver);
    tracks.reduced = reduced || prefs.saver;
    applyQuality();
    if (L && mode !== "ground") prepare(P.x, P.y, true);
  });
  function snapshot() {
    let lines = 0;
    scene.traverseVisible((o) => {
      if (o.isLine || o.material?.wireframe) lines++;
    });
    return {
      mode,
      viewRange: P.r,
      viewXY: [P.x, P.y],
      demoHouse: !!v?.example,
      housesDrawn: L?.houses || 0,
      treadCells: L?.s.tread?.refined || 0,
      sceneFarms: 0,
      site: activeStop
        ? stopView === "bank"
          ? "lake-bank"
          : stopView === "grove"
            ? "lake-grove"
            : activeStop.id
        : districtWalk
          ? "district-" + districtWalk.id
          : v?.u,
      pending: busy,
      memory: {
        ...renderer.info.memory,
        programs: renderer.info.programs?.length,
      },
      lamps: L?.bulbs?.length || 0,
      windowIntensity:
        L?.nightMeshes?.reduce(
          (m, n) => Math.max(m, n.material.emissiveIntensity || 0),
          0,
        ) || 0,
      hydrology: L?.wetFX?.userData.stats || null,
      ready: mode === "ground" && !busy && !arrivalStep && !!L?.groundDrawn,
      orbital: mode === "survey" && !expanded,
      regionCount: a.districts.length,
      regionDrawn: reg.group.visible,
      altitude: cameraAGL,
      range: P.r,
      exaggeration: ex,
      canvasSize: [canvas.width, canvas.height],
      lowPixelBudget: pixelBudget,
      u: v?.u,
      cell: v?.c,
      x,
      y,
      ll: ll(a.project, x, y),
      source: L ? tiles.at(x, y) : null,
      ground: L?.s.ground(x, y) || 0,
      locomotion: {
        state: motor.state,
        speed: motor.speed,
        depth: motor.depth,
        root: motor.root,
        grounded: motor.grounded,
        bodyYaw: motor.yaw,
        surface: motor.touch ? surfaceName(motor.touch) : null,
        wetMetres: motor.wetTravel,
        ripples: motor.ripples,
        rig: walker.metrics(),
      },
      fences: {
        edges: L?.sc?.userData.edges || 0,
        openings: L?.sc?.userData.gates || 0,
      },
      eye: avatar.position.y + 1.6,
      cameraY: cam.position.y,
      camera: cam.position.toArray(),
      localOrigin: L?.s.offset,
      controls: input
        ? {
            roles: input.roles(),
            stick: input.stick(),
            sprint: input.sprint(),
            ...input.stats,
          }
        : null,
      boom: camProof,
      pitch,
      houses: L?.houses || 0,
      trailCount: L?.paths || 0,
      fields: L?.farms?.userData.fields || [],
      photo: !!photo,
      jumpCount: motor.jumps,
      landCount: motor.lands,
      trackCounts: tracks.counts || {},
      sound: {
        state: tracks.mix.ctx?.state || "locked",
        unlocked: !!tracks.mix.ctx,
        voices: tracks.mix.voices.size,
        events: [...tracks.mix.events],
        gains: { ...tracks.mix.settings },
      },
      cameraMode: third ? "third" : "first",
      frames: fr,
      groundFrames,
      elapsed,
      fps,
      tier: gov.tier,
      detectedTier: gov.cap,
      transitions: [...gov.log],
      sample: gov.sample,
      richSpawn,
      latestRich,
      grass: L?.cover?.count || 0,
      wind: !!(!reduced && L?.cover?.count),
      people: mode === "ground" && third ? 1 : 0,

      animals: L?.bio?.anim.length || 0,
      clouds: fx.clouds?.length || 0,
      shadows: renderer.shadowMap.enabled,
      waterShader:
        L?.tier === 0 && prefs.saver ? "matte-saver" : "surface-and-wakes",
      lines,
      stones: L?.sc?.userData.stones || [],
      near: L?.sc?.userData.near.map(({ u, x, y, did }) => ({ u, x, y, did })),
      metresPerCell: U,
      movementMps: rates[travelMode] * speed,
      yaw,
      blockedSteps,
      house: v?.house,

      assignedHere: L?.all?.length,

      roadHere: false,
      loadedTiles: [...tiles.cache.keys()],
      chunks: L?.chunks.size || 0,
      compressedTileBytes: tiles.bytes,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      stop: activeStop?.id,
      stopView,
      settings: { ...prefs },
      ecology: L?.bio
        ? {
            placed: L.bio.statics.length,
            animals: L.bio.anim.length,
            placedAnimals: L.bio.anim.filter((a) => a.hab !== "air").length,
            placedSmall: L.bio.anim.filter((a) => a.hab === "air").length,
            visible: L.bio.counts,
            names: L.bio.visibleNames,
            trees: L.bio.visibleTrees || [],
            plants: L.bio.visiblePlants || [],
            rocks: L.bio.visibleRocks || [],
          }
        : null,
      solar: env.astro?.sun,
      sunDirection: env.uni.uSun.value.toArray(),
      sunPosition: env.sun.position
        .clone()
        .sub(env.sun.target.position)
        .normalize()
        .toArray(),
      clock: env.clock,
      weather: env.weather,
      shared: calendar(calendarAt, worldConfig, prefs.time, prefs.hour),
      grid: env.uni.uGrid.value,
      walked,
      jumpHeight: jumpH,
    };
  }
  window.atlasWalk = Object.freeze({
    snapshot,
    projectedTraveller: () => {
      cam.updateMatrixWorld();
      avatar.updateWorldMatrix(true, true);
      const m = walker.mesh,
        g = m.geometry.attributes.position,
        v = new T.Vector3(),
        w = canvas.clientWidth,
        h = canvas.clientHeight,
        box = [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = 0; i < g.count; i++) {
        m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).project(cam);
        const X = ((v.x + 1) * w) / 2,
          Y = ((1 - v.y) * h) / 2;
        box[0] = Math.min(box[0], X);
        box[1] = Math.min(box[1], Y);
        box[2] = Math.max(box[2], X);
        box[3] = Math.max(box[3], Y);
      }
      return { box, visible: avatar.visible, w, h };
    },
    dismissTransient() {
      if (photo) {
        q("#photo-exit").click();
        return true;
      }
      if (ui.busy()) {
        ui.close();
        return true;
      }
      if (!sheet.hidden) {
        sheet.hidden = true;
        ui.wake();
        return true;
      }
      return false;
    },
    capturePhoto: () => (photo ? picture() : null),
    auditLife: () => L?.bio?.audit(),
    auditTerrain: () => L?.bio?.auditTerrain(),
    groundReading: (X, Y) => {
      if (!within(L, X, Y)) return null;
      const t = L.s.sample(X, Y);
      return { drawn: t.drawn, z: t.z, wear: t.wear || 0, depth: t.depth };
    },
    sceneKinds: () => {
      const roles = {};
      L?.group.traverse((o) => {
        const r = o.userData.role;
        if (r) roles[r] = (roles[r] || 0) + 1;
      });
      return roles;
    },
    contactReading: (X, Y, fromX, fromY) => {
      if (!within(L, X, Y)) return null;
      const obs = L.bio.statics
        .filter(
          (v) => Math.hypot(v.x - X, v.y - Y) < 0.48 + (v.radius || 0) / U,
        )
        .map((v) => solidFor(v, L.bio.ec.presets))
        .filter(Boolean);
      return passes(
        L.s,
        L.sc.userData.blocks,
        obs,
        L.cover?.solids,
        X,
        Y,
        fromX,
        fromY,
      );
    },
    fieldObservations: () => ({
      static: (L?.bio?.statics || []).map(({ name, kind, x, y, seed }) => ({
        name,
        kind,
        x,
        y,
        seed,
      })),
      life: (L?.bio?.anim || []).map(
        ({
          id,
          asset,
          name,
          hab,
          dom,
          x,
          y,
          hx,
          hy,
          seed,
          world,
          rotation,
          gait,
          step,
          travel,
          screen,
          action,
        }) => ({
          id,
          asset,
          name,
          hab,
          dom,
          x,
          y,
          hx,
          hy,
          seed,
          world,
          rotation,
          gait,
          clip: step,
          travel,
          visible: screen,
          action,
        }),
      ),
      ticks: L?.bio?.ticks,
      carried: L?.bio?.reuses,
    }),
    get movingMps() {
      return motor.speed;
    },
    get renderedFrames() {
      return fr;
    },
  });
  if (prefs.saver) {
    env.setMotion(true);
    gov.change(0, "battery saver");
    applyQuality();
  }
  last = performance.now();
  raf = requestAnimationFrame(animate);
  return {
    visit,
    restore,
    coordinate(X, Y) {
      heldPoint = restorePose = null;
      const [gx, gy] = xy(a.project, X, Y),
        stop = {
          id: "point",
          title: "Viewpoint",
          point: [gx, gy],
          cell: [Math.floor(gx), Math.floor(gy)],
          yaw: 0,
          observations: {},
        };
      activeStop = stop;
      districtWalk = v = null;
      stopView = "ground";
      third = true;
      expand();
      goCell(stop.cell, false);
    },
    overview,
    guide,
    inspect,
    zoom,
    setPaper,
    focus: () => ({ ll: ll(a.project, P.x, P.y), r: P.r, expanded }),
    stop() {
      if (dead) return;
      dead = true;
      job++;
      cancelAnimationFrame(raf);
      ro.disconnect();
      ui.dispose();
      ac.abort();
      tracks.dispose();
      fx.dispose();
      free(L);
      reg.dispose();
      landFull.dispose();
      mats.landLow.dispose();
      mats.waterSaver.dispose();
      mats.grain.dispose();
      mats.surfaces.forEach((t) => t.dispose());
      colorLite.dispose();
      floorShade.geometry.dispose();
      floorShade.material.dispose();
      walker.dispose();
      mats.water.dispose();
      env.dispose();
      avatar.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
      renderer.dispose();
      renderer.forceContextLoss();
      deck.remove();
      host.hidden = true;
      document.body.classList.remove("walking");
      delete window.atlasWalk;
    },
  };
}
