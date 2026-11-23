import { laneSoil } from "./lane-soil.js";
import {
  hamletScene,
  marks,
  updateHamlet,
  updateRouteLeaves,
} from "./hamlet-scene.js";
import { pathTo, guideStep, drawHolding } from "./hamlet-route.js";
import { farms } from "./agriculture.js";
import { homesAt, inCourt } from "./home-index.js";
import {
  activeRoomAt,
  roomLocal,
  roomPlan,
  insideRoom,
  doorPoint,
  houseBlocked,
} from "./home-volume.js";
import { pathIndex } from "./path-right-of-way.js";
import { hydraulicInset } from "./hydraulic-inset.js";
import { collar } from "./survey-collar.js";
import { dev } from "./edition.js";
import { Tread } from "./tread.js";
import { yards, wayside, restStone } from "./timber-yard.js";
import { PocketMap } from "./pocket-map.js";
import { readPosition, writePosition } from "./position-book.js";
import { dampGround } from "./regional-weather.js";
import { RunoffWindow } from "./rain-ground.js";
import { calendar, windowLight, disciplinedClock } from "./world-calendar.js";
import { villageData, works } from "./landworks.js";
import { recordKind } from "./record-kinds.js";
import { passes, solidFor, clearance, support } from "./contacts.js";
import { touchWalk } from "./touch-walk.js";
import { fieldHUD } from "./field-hud.js";
import { followCamera } from "./walk-camera.js";
import { residents, preparePads } from "./resident-scene.js";
import {
  houseLabel,
  normalizeUsername,
  readStoredResidentId,
  residentId,
  shardKey,
  writeStoredResidentId,
} from "./resident-id.js";
import { basis, localPoint, SIDE } from "./metres.js";
import * as T from "../vendor/three.module.min.js";
import { Tiles, get, key, ll, url, xy } from "./grid.js";
import { Surface, streamChunk, materials } from "./terrain.js";
import { ACRE as U } from "./metres.js";
import { acreEntry, fenceAt } from "./acre-edge.js";
import { FootCover, surfaceName } from "./foot-cover.js";
import { loadPeople, loadVillageLife } from "./art-library.js";
import { traveller } from "./traveller.js";
import { WalkMotor } from "./walk-motor.js";
import { loadSurvey, regional, Annotations, horizon } from "./survey.js";
import { atmosphere, trueNorth, smooth } from "./sky.js";
import { combineMeshes, cropDraws, restoreDraws } from "./lightweight.js";
import { WeatherFX, Tracks } from "./fieldfx.js";
import { ink } from "./walk-icons.js";
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
    third: true,
    relief: 2,
    season: "auto",
    weather: "auto",
    reduceFlash: true,
    time: "shared4",
    hour: 12,
    quality: "auto",
    life: false,
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
      time: ["shared4", "shared2", "shared6", "golden", "day", "dusk", "live"],
      quality: ["auto", "low", "medium", "high"],
    }))
      if (set.includes(p[k])) prefs[k] = p[k];
    if (typeof p.third !== "boolean") {
      const old = readPosition(a);
      if (typeof old?.third === "boolean") prefs.third = old.third;
    }
    prefs.life = p.life === true;
    for (const k of [
      "third",
      "hideMini",
      "hideCompact",
      "invert",
      "recenter",
      "haptics",
      "saver",
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
    orbitActor = null,
    lastZoomLabel = "",
    allowLanding = false;
  let nativePaused = false;
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
      depth: true,
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
    [data] = await Promise.all([
      loadSurvey(a, boundaries),
      loadPeople(),
      loadVillageLife(),
    ]);
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
  host.innerHTML = `<div class="world-top"><a class="world-back" href="#">← <span></span></a><div class="world-id"><i class="dot"></i><span></span><b></b></div><div class="chart-switch"><button data-view="3d" aria-pressed="true">3D</button><button data-view="map"></button></div><button class="world-btn" id="world-menu" data-msg-aria="hud.menu">${icon("menu")}</button></div><div id="life-read" hidden></div><div class="greeting" hidden></div><div class="world-hud"><div class="eyebrow"><i class="dot"></i><span id="world-district"></span></div><div><span id="gps"></span><button id="copy-gps" data-msg-aria="details.copyCoords">${icon("copy")}</button></div><small id="alt"></small><div class="conditions"><b id="acre-now"></b><span id="clock-now"></span><span id="weather-now"></span></div></div><div class="pace-panel"><span id="underfoot"></span><button type="button" id="hop" data-msg="hud.jump"></button><button type="button" id="pace" aria-pressed="false" data-msg="hud.sprint"></button></div><span id="room-notice" role="status" aria-live="polite" class="door-sr"></span><div class="walk-help"></div><div class="joystick" role="group" data-msg-aria="hud.stick"><b></b></div><aside class="world-sheet" hidden><div class="sheet-head"><strong></strong><button class="icon-btn" id="hide-sheet" data-msg-aria="hud.closeMenu">${icon("close")}</button></div><section class="walk-settings"><div class="eyebrow" data-msg="menu.scenery"></div><div class="field-pair"><label><span data-msg="menu.season"></span><select id="season"><option value="auto" data-msg="season.shared"></option><option value="retreat" data-msg="season.retreat"></option><option value="winter" data-msg="menu.winter"></option><option value="summer" data-msg="menu.summer"></option><option value="monsoon" data-msg="menu.monsoon"></option></select></label><label><span data-msg="menu.light"></span><select id="light"><option value="shared4" data-msg="time.four"></option><option value="shared2" data-msg="time.two"></option><option value="shared6" data-msg="time.six"></option><option value="golden" data-msg="menu.golden"></option><option value="day" data-msg="menu.day"></option><option value="dusk" data-msg="menu.dusk"></option><option value="live" data-msg="menu.live"></option></select></label></div><label><span data-msg="weather.sim"></span><select id="sim-weather"><option value="auto" data-msg="menu.auto"></option><option value="Clear" data-msg="weather.clear"></option><option value="Cloudy" data-msg="weather.cloudy"></option><option value="Light rain" data-msg="weather.drizzle"></option><option value="Rain" data-msg="weather.rain"></option><option value="Heavy rain" data-msg="weather.heavy"></option></select></label><label><span data-msg="menu.quality"></span><select id="quality"><option value="auto" data-msg="menu.auto"></option><option value="low" data-msg="menu.low"></option><option value="medium" data-msg="menu.medium"></option><option value="high" data-msg="menu.high"></option></select></label></section><p class="detail-note"></p><button class="mode detail-trial" hidden></button><div class="sheet-foot"><button class="lang" data-lang data-msg-aria="menu.language">EN / తెలుగు</button><button class="sub-link" data-open="about"></button></div><p class="generated-note"></p><p class="creditline">© OpenStreetMap contributors · Copernicus DEM · ESA WorldCover · HydroLAKES · LGD. <a href="${url("frozen/credits.md")}" data-msg="menu.licences"></a> · <a href="${url("library/CREDITS.html")}" data-msg="menu.art"></a></p></aside>`;
  const q = (s) => host.querySelector(s),
    dq = (s) => deck.querySelector(s),
    sheet = q(".world-sheet"),
    greet = q(".greeting"),
    badge = dq(".flight-badge"),
    ac = new AbortController(),
    on = (el, evt, fn, opt = {}) =>
      el.addEventListener(evt, fn, { ...opt, signal: ac.signal });
  const orbitTools = document.createElement("div");
  orbitTools.className = "orbit-tools";
  orbitTools.hidden = true;
  orbitTools.innerHTML =
    '<button type="button" data-zo="out" data-msg-aria="orbit.out">−</button><span><small data-msg="orbit.label"></small><output></output></span><button type="button" data-zo="in" data-msg-aria="orbit.in">+</button>';
  host.append(orbitTools);
  for (const b of orbitTools.querySelectorAll("button"))
    on(b, "click", () => zoom(b.dataset.zo === "in" ? 1.32 : 1 / 1.32));
  let selectedKind = "",
    flashUntil = 0,
    journey = null,
    landMenu = false;
  let menuRecord = null,
    preferred = null,
    menuSerial = 0;
  const strip = q(".world-top"),
    cards = document.createElement("section");
  cards.id = "holding-menu";
  cards.hidden = true;
  cards.setAttribute("role", "dialog");
  cards.setAttribute("aria-labelledby", "destination-name");
  const homeIcon = '<path d="m3 11 9-7.5 9 7.5M5.5 10v10h5v-6h3v6h5V10"/>',
    landIcon =
      '<path d="m2.8 10.4 11.6-6.2 7.1 4.2-11.7 6.5zM4 13.5l5.8 3.3 10.5-5.9M4.5 17l5.2 3 10.4-5.8m-8.4-8.4 6 3.4"/>';
  for (const [id, k, ink] of [
    ["my-home", "village.home", homeIcon],
    ["my-acre", "village.acre", landIcon],
  ]) {
    strip.insertAdjacentHTML(
      "beforeend",
      `<button class="holding-icon" id="${id}" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="holding-menu" data-msg-aria="${k}" data-msg-title="${k}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ink}</svg></button>`,
    );
  }
  cards.innerHTML = `<header><div><small class="resident-handle"></small><h3 id="destination-name"></h3></div><button type="button" id="close-holding" data-msg-aria="details.close">×</button></header><form id="holding-claim" autocomplete="off"><label for="holding-handle" data-msg="holding.askUsername"></label><div class="holding-input-row"><span>@</span><input id="holding-handle" type="text" placeholder="your_username" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="180"><button id="holding-verify" type="submit" data-msg="holding.unlock"></button></div><p id="holding-status" role="status" hidden></p></form><div id="acre-actions"><canvas id="holding-chart" data-msg-aria="village.map" hidden></canvas><small id="holding-distance"></small><div class="home-pair"><button id="walk-acre" type="button" data-msg="village.walk" disabled></button><button id="teleport-acre" type="button" data-msg="village.teleport" disabled></button></div></div>`;
  host.append(cards);
  host.insertAdjacentHTML(
    "beforeend",
    '<output id="route-step" hidden></output>',
  );
  const pinFromName = async (u) => {
    if (!u) return null;
    const shard = shardKey(u);
    if (!a.shards.includes(shard)) return null;
    return (await get("data/search/" + shard + ".json"))[u] || null;
  };
  const pref = matchMedia("(prefers-reduced-motion:reduce)"),
    gov = new Governor(deviceTier(renderer)),
    tiles = new Tiles(a),
    ds = new Map(a.districts.map((d) => [d.id, d])),
    pl = new Map(),
    pk = new Set(a.sceneTiles),
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
      if (o.userData.role === "username-nameboard") o.material.map?.dispose();
      if (o.userData.disposableMaterial) o.material.dispose();
    });
    parent.remove(group);
  }
  const mats = materials(env.uni),
    landFull = mats.land,
    waterFull = mats.water;
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
    third = prefs.third,
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
  let dampX = Infinity,
    dampY = Infinity;
  let waterClock = 0,
    waterStamp = null,
    walker = traveller(prefs.walker),
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
    const slider = q("#orbit-distance");
    if (slider) slider.max = Math.log(baseRange * 1.18);
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
  let roomOwner = null,
    activeRoomId = null;
  const roomLamp = new T.PointLight(0xffdfb7, 9.2, 14, 2);
  roomLamp.visible = false;
  scene.add(roomLamp);
  function doorRow(l = L) {
    return l?.sc?.userData.near.find((r) => r.u === roomOwner);
  }
  function setRoom(owner, rm = null) {
    const changedOwner = roomOwner !== owner,
      nextRoomId = rm?.id || null;
    if (!changedOwner && activeRoomId === nextRoomId) return;
    roomOwner = owner;
    activeRoomId = nextRoomId;
    const r = owner && doorRow();
    if (L) L.s.openHome = r?.h || null;
    roomLamp.visible = !!r;
    for (const id of ["#camera-mode", "#photo-start", "#orbit-distance"]) {
      const el = q(id);
      if (el) el.disabled = false;
    }
    if (r) {
      if (!L.s.roomDetail?.has(owner)) nature(L, false);
      const activeRm = rm || roomPlan(r.h).rooms[0];
      roomLamp.position.fromArray(
        L.s.worldXYZ(
          ...localPoint(r.h, activeRm.design.lampX, activeRm.design.lampZ),
          L.s.ground(...r.h.centre) + activeRm.top - 0.55,
        ),
      );
    }
    if (changedOwner) {
      host.classList.toggle("in-room", !!r);
      q("#room-notice").textContent = msg(r ? "home.inside" : "home.outside");
      once = true;
      camState = {};
      stamp = -1e9;
    }
    dirty = true;
  }
  function updateHouseDoors(dt) {
    if (!L?.doors?.size) return;
    L.s.doorAngles ??= new WeakMap();
    for (const [u, leaf] of L.doors) {
      const entries = leaf?.userData?.doors;
      if (!entries?.length) continue;
      const row = L.all.find((r) => r[2] === u),
        h = row?.[5];
      if (!h) continue;
      const baseZ = L.s.ground(...h.centre);
      let angleMap = L.s.doorAngles.get(h);
      if (!angleMap) {
        angleMap = new Map();
        L.s.doorAngles.set(h, angleMap);
      }
      for (const entry of entries) {
        const distM = Math.hypot(x - entry.gx, y - entry.gy) * U,
          vertM = Math.abs(motor.root - (baseZ + entry.floor)),
          alreadyOpen = entry.angle > 0.25,
          wantOpen = alreadyOpen
            ? distM <= 2.75 && vertM <= 1.75
            : distM <= 2.35 && vertM <= 1.45,
          target = wantOpen ? entry.maxAngle : 0,
          diff = target - entry.angle;
        if (Math.abs(diff) > 0.002) {
          const rate = wantOpen ? 9.6 : 5.2;
          entry.angle =
            Math.abs(diff) < 0.006
              ? target
              : entry.angle + diff * (1 - Math.exp(-dt * rate));
          entry.hinge.rotation.y = entry.swingSign * entry.angle;
          dirty = true;
        }
        angleMap.set(entry.id, entry.angle);
      }
    }
  }
  function syncIndoorState() {
    if (!L || mode !== "ground") {
      if (roomOwner) setRoom(null);
      return;
    }
    let insideHit = null;
    for (const h of homesAt(L.s, x, y)) {
      const rm = activeRoomAt(L.s, h, x, y, motor.root);
      if (rm && !rm.isBalcony) {
        const near = L.sc?.userData.near.find((v) => v.h === h);
        if (near) {
          insideHit = { owner: near.u, rm };
          break;
        }
      }
    }
    if (insideHit) setRoom(insideHit.owner, insideHit.rm);
    else if (roomOwner) setRoom(null);
  }
  const rates = { walk: 1.75, jog: 4.15 },
    pad = new StandardPad();
  const canPlay = () =>
    mode === "ground" &&
    !overlay &&
    !hostPaused &&
    !photo &&
    sheet.hidden &&
    !landMenu &&
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
    zoomTo: (distance) =>
      zoom((mode === "ground" ? (third ? follow : 0.09) : goal.r) / distance),
    classLabel: (u) => msg("resident." + recordKind(a.recordStats, u)),
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
    visit: (u, gx, gy) => {
      if (Number.isFinite(gx) && Number.isFinite(gy)) {
        const [lon, lat] = ll(a.project, gx + 0.5, gy + 0.5);
        history.replaceState(
          null,
          "",
          location.pathname +
            location.search +
            "#/at/" +
            lat.toFixed(8) +
            "," +
            lon.toFixed(8),
        );
        goCell([Math.floor(gx), Math.floor(gy)], false);
      }
    },
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
    for (const id of ["woman", "man"])
      q("#avatar-" + id).setAttribute(
        "aria-pressed",
        String(prefs.walker === id),
      );
    const lens = q("#camera-mode");
    lens.dataset.msgAria = lens.dataset.msgTitle = third
      ? "menu.third"
      : "menu.first";
    lens.innerHTML = ink(third ? "third" : "eye");
    lens.setAttribute(
      "aria-label",
      (lens.title = msg(third ? "menu.third" : "menu.first")),
    );
    lens.setAttribute("aria-pressed", String(third));
    q(".generated-note").textContent = msg("menu.disclaimer");
    q(".sheet-foot [data-open]").textContent = msg("menu.credits");
    q(".walk-help").textContent = msg("menu.keys");
    q(".detail-trial").textContent = msg("menu.trial");
    q(".detail-trial").hidden = prefs.saver || gov.cap < 2;
    q(".world-back").setAttribute("aria-label", msg("hud.back"));
    dq(".chart-tag span").textContent = msg("world.canvas");
    dq(".flight-guide").textContent = msg("world.zoomHint");
    if (landMenu) showMenu(landMenu, menuRecord);
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
    tracks.mix.pause(show || document.hidden || nativePaused);
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
    l.drain?.dispose();
    l.cover?.dispose();
    l.lane?.tex.dispose();
    clearSc(l);
    remove(scene, l.group);
  }
  function paintMarks(l = L) {
    if (!l?.sc) return;
    remove(l.sc, l.selection);
    l.selection = null;
    const owner = journey?.record || menuRecord || v;
    l.activeAcre = selectedKind === "acre" ? owner?.u : null;
    l.routeLine = journey?.xy || null;
    l.routeIndex = journey?.i || 0;
    if (
      owner &&
      Math.hypot(owner.c[0] - l.fx, owner.c[1] - l.fy) < 20 &&
      (journey ||
        selectedKind === "acre" ||
        (selectedKind === "home" && performance.now() < flashUntil))
    ) {
      l.selection = marks(l.s, owner, selectedKind || journey?.kind, journey);
      if (journey) updateRouteLeaves(journey, journey.lastProgress || 0);
      l.sc.add(l.selection);
    }
    dirty = true;
  }
  function selectKind(kind) {
    selectedKind = kind;
    if (kind === "home") flashUntil = performance.now() + 4600;
    paintMarks();
    pocket.last = "";
  }
  function menus(kind) {
    landMenu = kind || false;
    cards.hidden = !kind;
    for (const [k, id] of [
      ["home", "#my-home"],
      ["acre", "#my-acre"],
    ])
      q(id).setAttribute("aria-expanded", String(kind === k));
    if (!kind) menuSerial++;
  }
  function displayOwner() {
    const visible = expanded && !photo;
    for (const id of ["#my-home", "#my-acre"]) q(id).hidden = !visible;
    if (!visible) menus(false);
  }
  function remember(r) {
    if (!r) return;
    preferred = r;
  }
  let menuNet = null;
  const MAX_FOOTPATH_JOIN_M = 95;
  function currentGroundPos() {
    return mode === "ground"
      ? [x, y]
      : orbitActor
        ? [orbitActor.x, orbitActor.y]
        : [P.x, P.y];
  }
  function footpathFromHere(record, kind, net) {
    if (!record || !kind || !net?.paths || busy || mode === "flight")
      return null;
    const pg = currentGroundPos(),
      dest = kind === "acre" ? record.court.land : record.court.porch;
    if (!within(L, ...pg) || !within(L, ...dest)) return null;
    if (mode !== "ground" && (P.r > 900 || !L.s.traversable(...pg)))
      return null;
    const r = pathTo(net.paths, dest, pg);
    if (
      !r ||
      !Number.isFinite(r.joinMetres) ||
      r.joinMetres > MAX_FOOTPATH_JOIN_M
    )
      return null;
    return r;
  }
  function syncHoldingWalkButton() {
    const walkBtn = q("#walk-acre"),
      teleBtn = q("#teleport-acre");
    if (!menuRecord || !landMenu) {
      walkBtn.hidden = true;
      walkBtn.disabled = true;
      teleBtn.hidden = false;
      teleBtn.disabled = true;
      return false;
    }
    const canWalk = Boolean(footpathFromHere(menuRecord, landMenu, menuNet));
    walkBtn.hidden = !canWalk;
    walkBtn.disabled = !canWalk;
    teleBtn.hidden = false;
    teleBtn.disabled = false;
    return canWalk;
  }
  async function showMenu(kind, explicitRecord) {
    const mark = ++menuSerial;
    menus(kind);
    menuNet = null;
    q("#walk-acre").hidden = true;
    q("#walk-acre").disabled = q("#teleport-acre").disabled = true;
    q("#teleport-acre").hidden = false;
    sheet.hidden = true;
    ui.close();
    neutral();
    const en = kind === "acre" ? "village.acre" : "village.home";
    q("#destination-name").textContent = msg(en);
    const statusEl = q("#holding-status");
    statusEl.hidden = true;
    statusEl.textContent = "";
    let chosen = explicitRecord || preferred;
    if (!chosen) {
      const savedId = await readStoredResidentId();
      if (savedId) {
        chosen = await pinFromName(savedId);
        if (chosen) preferred = chosen;
      }
    }
    if (mark !== menuSerial) return;
    menuRecord = chosen || null;
    q("#holding-claim").hidden = !!chosen;
    q(".resident-handle").textContent = chosen
      ? houseLabel(chosen) +
        (ds.get(chosen.d) ? " · " + tr(ds.get(chosen.d).name, ds.get(chosen.d).te) : "")
      : "";
    q("#holding-chart").hidden = !chosen;
    let canWalk = false;
    if (!chosen) {
      syncHoldingWalkButton();
      q("#holding-distance").hidden = false;
      q("#holding-distance").textContent = msg("holding.lockedHint");
    } else {
      q("#holding-distance").hidden = false;
      const [net] = await villageData([chosen.d]);
      if (mark !== menuSerial) return;
      menuNet = net;
      canWalk = syncHoldingWalkButton();
      let rows = L?.all || [];
      if (!rows.some((z) => z[2] === chosen.u))
        rows = await get(
          "data/scenes/" +
            chosen.homeLocation.map((n) => Math.floor(n / 256)).join("_") +
            ".json",
        );
      if (mark !== menuSerial) return;
      const route = drawHolding(
        q("#holding-chart"),
        rows,
        net.paths,
        chosen,
        net.settlements?.find((x) => x.id === chosen.villageId)?.square,
      );
      q("#holding-distance").textContent =
        (kind === "acre"
          ? msg("village.field", { code: chosen.c.join("–") })
          : chosen.villageId.toUpperCase()) +
        " · " +
        msg("holding.byPath", { n: Math.round(route?.metres || 0) });
    }
    if (mark === menuSerial)
      q(
        !chosen
          ? "#holding-handle"
          : canWalk
            ? "#walk-acre"
            : "#teleport-acre",
      ).focus({
        preventScroll: true,
      });
  }
  for (const [id, kind] of [
    ["#my-home", "home"],
    ["#my-acre", "acre"],
  ])
    on(q(id), "click", () =>
      landMenu === kind ? menus(false) : showMenu(kind),
    );
  on(q("#holding-claim"), "submit", async (e) => {
    e.preventDefault();
    const input = q("#holding-handle"),
      statusEl = q("#holding-status"),
      raw = input.value,
      clean = normalizeUsername(raw),
      id = residentId(raw);
    if (!clean || !id) {
      statusEl.textContent = msg("holding.enterValid");
      statusEl.hidden = false;
      q("#walk-acre").disabled = q("#teleport-acre").disabled = true;
      return;
    }
    const found = await pinFromName(id);
    if (!found) {
      statusEl.textContent = msg("home.missing", { name: clean });
      statusEl.hidden = false;
      q("#walk-acre").disabled = q("#teleport-acre").disabled = true;
      return;
    }
    input.value = "";
    statusEl.hidden = true;
    statusEl.textContent = "";
    await writeStoredResidentId(found.u);
    preferred = found;
    showMenu(landMenu || "home", found);
  });
  on(window, "atlas:resident-bound", async (e) => {
    const id = e.detail;
    if (id) {
      const found = await pinFromName(id);
      if (found) preferred = found;
    }
  });
  on(q("#close-holding"), "click", () => {
    const b = landMenu === "acre" ? "#my-acre" : "#my-home";
    menus(false);
    q(b).focus();
  });
  on(cards, "keydown", (e) => {
    if (e.key === "Escape") {
      q("#close-holding").click();
      e.stopPropagation();
    }
  });
  on(q("#teleport-acre"), "click", () => {
    const r = menuRecord,
      k = landMenu;
    if (!r || !k) return;
    remember(r);
    menus(false);
    history.replaceState(
      null,
      "",
      "#/" + (k === "acre" ? "acre" : "u") + "/" + r.u,
    );
    resultRoute = location.hash;
    visit(r, k === "acre" ? "acre" : "gate");
  });
  on(q("#walk-acre"), "click", async () => {
    const r = menuRecord,
      k = landMenu;
    if (!r || !k) return;
    remember(r);
    const pg = currentGroundPos(),
      dest = k === "acre" ? r.court.land : r.court.porch,
      [net] = menuNet ? [menuNet] : await villageData([r.d]),
      route = footpathFromHere(r, k, net);
    if (!route) {
      syncHoldingWalkButton();
      return;
    }
    menus(false);
    if (mode !== "ground") {
      heldPoint = { x: pg[0], y: pg[1], yaw: P.yaw };
      goCell(pg.map(Math.floor), false);
    }
    journey = { ...route, record: r, kind: k, end: dest };
    selectKind(k);
    ui.toast(
      msg(
        Math.hypot(pg[0] - route.xy[0][0], pg[1] - route.xy[0][1]) * U > 18
          ? "holding.joinLane"
          : "village.follow",
      ),
    );
    lastHud = -1e8;
  });
  function nature(l = L, refreshLife = true) {
    if (!l) return;
    const settled = mode === "ground" && L === l,
      p = { x: settled ? x : l.fx, y: settled ? y : l.fy };
    remove(l.group, l.sc);
    l.selection = null;
    const sample = l.all.find((r) => r[2] === v?.u);
    l.sc = yards(l.s, l.all, p, walkArt, gov.tier);
    l.group.add(l.sc);
    const infrastructure = works(l.s, l.villages, p, false);
    l.sc.add(infrastructure);
    const villagePaths = l.villages.flatMap((q) => q.paths);
    const ham = hamletScene(
      l.s,
      l.all,
      l.s.commons,
      p,
      gov.tier,
      villagePaths,
    );
    l.sc.add(ham);
    l.ham = ham;
    l.communitySolids = ham.userData.solids;
    if (l.all.some((r) => Math.hypot(r[0] + 0.5 - p.x, r[1] + 0.5 - p.y) < 6)) {
      l.farms = farms(
        l.s,
        p,
        gov.tier,
        calendar(calendarAt, worldConfig).year,
        villagePaths,
      );
      l.sc.add(l.farms);
    }
    paintMarks(l);
    l.bulbs = infrastructure.userData.bulbs;
    l.soils = null;
    l.gateRock = null;
    l.s.roomDetail = new Set(
      l.all
        .filter(
          (r) =>
            r[2] === roomOwner ||
            Math.hypot(r[5].centre[0] - p.x, r[5].centre[1] - p.y) * U <
              (gov.tier ? 68 : 42),
        )
        .map((r) => r[2]),
    );
    const homes = residents(l.s, l.all, p, gov.tier);
    homes.position.copy(l.sc.position).multiplyScalar(-1);
    l.paths = l.villages.reduce((n, v) => n + v.paths.length, 0);
    const stones = wayside(
      l.s,
      villagePaths,
      p,
      walkArt,
    );
    if (sample && !sample[5]?.yard) {
      const b = restStone(l.s, sample[5], walkArt.rock_smallFlatA);
      if (b) {
        stones.add(b);
        l.gateRock = b.userData.rock;
      }
    }
    stones.position.copy(l.sc.position).multiplyScalar(-1);
    l.sc.add(stones);
    l.houses = homes.userData.houses;
    l.boards = homes.userData.names || [];
    l.walls = homes.userData.walls || [];
    l.solidCentre = null;
    l.sc.add(homes);
    l.doors = homes.userData.doors || new Map();
    const occupied = roomOwner && doorRow(l);
    l.s.openHome = occupied?.h || null;
    if (l.s.doorAngles) {
      for (const [uid, leaf] of l.doors) {
        const row = l.all.find((r) => r[2] === uid),
          saved = row?.[5] && l.s.doorAngles.get(row[5]);
        if (saved && leaf?.userData?.doors) {
          for (const entry of leaf.userData.doors) {
            const ang = saved.get(entry.id) || 0;
            entry.angle = ang;
            entry.hinge.rotation.y = entry.swingSign * ang;
          }
        }
      }
    }
    l.nightMeshes = [];
    l.sc.traverse((m) => {
      if (m.userData.glow != null) l.nightMeshes.push(m);
    });
    l.nx = p.x;
    l.ny = p.y;
    if (refreshLife && l.bio && !l.bio.rebuilding)
      l.bio.build(p.x, p.y).catch((e) => console.warn("Ecology refresh", e));
  }
  const within = (l, x, y) =>
    l && x >= l.cut[0] && y >= l.cut[1] && x < l.cut[2] && y < l.cut[3];
  // Hysteresis prevents repeated rebuilding while pinching. The far orbit has no boot-sized lattice at its focus; the same fitted shoreline still exists.
  const surveyGrid = () =>
    mode !== "ground" &&
    flight?.end !== "walk" &&
    goal.r > (L?.s.surveyGrid ? 92 : 148);
  let firstPatch = null;
  function clearFirst() {
    if (firstPatch) {
      firstPatch.group.removeFromParent();
      firstPatch = null;
    }
  }
  async function prepare(xx, yy, force = false) {
    if (dead) return;
    const cx = Math.floor(xx / 64),
      cy = Math.floor(yy / 64),
      tier = gov.tier,
      farGrid = surveyGrid(),
      id =
        cx +
        "," +
        cy +
        ":" +
        tier +
        (farGrid ? ":orbit" : ":walk") +
        (":" + Math.round(xx / 3) + "," + Math.round(yy / 3));
    if (!force && (building === id || L?.id === id)) return;
    clearFirst();
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
            pl.set(k, await get(`data/scenes/${k}.json`));
        }),
      );
      if (dead || job !== ver) return;
      const all = [
        ...new Map(
          [...ks].flatMap((k) => pl.get(k) || []).map((row) => [row[2], row]),
        ).values(),
      ];
      const [eco, villages] = await Promise.all([
        ecology(),
        villageData([
          ...all.map((r) => r[4]),
          ...[
            [0, 0],
            [3, 0],
            [-3, 0],
            [0, 3],
            [0, -3],
          ]
            .map(([dx, dy]) => tiles.at(xx + dx, yy + dy)?.d)
            .filter(Boolean),
        ]),
      ]);
      if (dead || job !== ver) return;
      const natural = naturalRoutes.filter((t) =>
        t.xy.some(([X, Y]) => Math.abs(X - xx) < 13 && Math.abs(Y - yy) < 13),
      );
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
      s.commons = villages.flatMap((v) => v.settlements || []);
      s.surveyGrid = farGrid;
      s.mobileMesh = tier === 0 || prefs.saver;
      s.midRiverLOD = farGrid && goal.r < 1900;
      s.natureWalk = !dev;
      s.compactLaneLOD =
        tier === 0 &&
        s.commons.some((v) => Math.hypot(v.hub[0] - xx, v.hub[1] - yy) < 12);
      s.ways = pathIndex(villages.flatMap((v) => v.paths));
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
      s.acres = new Set(all.map((r) => r[0] + "," + r[1]));
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
      const inland = (eco.at(xx, yy)?.coast ?? 400) > 24,
        coarseTouch =
          typeof matchMedia === "function" &&
          matchMedia("(pointer:coarse)").matches;
      const lightLand = tier === 0 && inland && !env.weather.rain;
      const midSkin = farGrid && inland && !env.weather.rain;
      const groundMaterials = {
        land: lightLand
          ? mats.fastLand
          : tier === 0 || (tier === 1 && coarseTouch)
            ? mats.landLow
            : landFull,
        water: midSkin
          ? mats.reach
          : prefs.saver || tier === 0 || (tier === 1 && coarseTouch)
            ? mats.waterSaver
            : waterFull,
        surfDepth: mats.surfDepth,
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
      l.inland = inland;
      l.group.position.fromArray(s.offset);
      l.lane = laneSoil(s, all, villages, tier);
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
        if (b === 0 && !L) {
          const G = new T.Group();
          G.position.fromArray(s.offset);
          const copy = ob.clone(true);
          copy.traverse((o) => {
            if (o.isMesh) {
              if (o.material === groundMaterials.water)
                o.userData.role = "continuous-water";
              if (o.material === groundMaterials.land)
                o.userData.role = "natural-terrain";
            }
          });
          G.add(copy);
          scene.add(G);
          firstPatch = {
            group: G,
            s,
            cut: [i * 64, j * 64, (i + 1) * 64, (j + 1) * 64],
          };
          mats.uniforms.hydroOffset.value.set(s.offset[0], s.offset[2]);
          mats.uniforms.laneEarth.value = l.lane?.tex || null;
          mats.uniforms.laneWindow.value.fromArray(
            l.lane?.wrap || [0, 0, 1, 0],
          );
          dirty = true;
          await next();
        }

        if (tier <= 1 || b % 4 === 1) await next();
      }
      if (dead || job !== ver) {
        free(l);
        return;
      }
      const headWindow = await data.stageWindow(xx, yy);
      if (dead || ver !== job) {
        free(l);
        return;
      }
      l.collar = collar(data, cut, s, env.uni, headWindow);
      l.group.add(l.collar);
      if (tier <= 1) {
        await next();
        if (dead || ver !== job) {
          free(l);
          return;
        }
      }
      l.inset = hydraulicInset(data, l.collar.userData.cut, s, headWindow);
      l.group.add(l.inset);
      l.horizon = horizon(data, l.inset.userData.cut, s.relief, s.o);
      l.group.add(l.horizon);
      if (tier <= 1) {
        await next();
        if (dead || ver !== job) {
          free(l);
          return;
        }
      }
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

      // Pick only the submitted land/water triangles. House/forest meshes must not select a different acre.
      l.pickGround = [];
      l.group.traverse((o) => {
        if (
          o.isMesh &&
          (o.material === groundMaterials.land ||
            o.material === groundMaterials.water)
        ) {
          o.userData.role =
            o.material === groundMaterials.land
              ? "natural-terrain"
              : "continuous-water";
          l.pickGround.push(o);
        }
      });
      s.floor = (x, y, refZ) => support(s, x, y, [], refZ);
      l.drain = new RunoffWindow(s, {
        renderer,
        uniforms: mats.uniforms,
        lite: tier <= 1 || prefs.saver,
      });
      l.group.add(l.drain.group);
      // Build after the obstructing rocks are available; do not allocate a basin solver for the regional chart.
      if (dead || ver !== job) {
        free(l);
        return;
      }
      nature(l);
      if (tier <= 1) {
        await next();
        if (dead || ver !== job) {
          free(l);
          return;
        }
      }
      l.bio = new EcologyScene(s, eco, all, env.uni, tier, prefs, () => L?.bio);
      l.group.add(l.bio.group);
      await l.bio.build(xx, yy);
      if (dead || job !== ver) {
        free(l);
        return;
      }
      l.cover = new FootCover(s, tier, mats.uniforms);
      l.group.add(l.cover.g);
      if (tier <= 1) {
        await next();
        if (dead || job !== ver) {
          free(l);
          return;
        }
      }
      l.extras = new FieldExtras(
        s,
        eco,
        null,
        xx,
        yy,
        tier,
        prefs,
        mats.uniforms,
      );
      l.extras.syncRocks(l.bio.statics);
      l.drain.obstacles(l.bio.statics);
      l.syncedStatics = l.bio.statics;
      if (L?.drain.net && Math.hypot(xx - L.fx, yy - L.fy) * U < 260)
        l.drain.inherit(L.drain);
      if (
        (mode === "ground" || P.r < 380) &&
        (env.weather.rain > 0.02 || l.drain.net)
      )
        await l.drain.warm(xx, yy, () => !dead && ver === job);
      if (dead || job !== ver) {
        free(l);
        return;
      }
      l.group.add(l.extras.g);
      if (mode === "ground" && L) {
        const focusNow = [O.x + cam.position.x / U, O.y - cam.position.z / U];
        if (env.weather.rain > 0.02 || l.drain.net)
          await l.drain.warm(...focusNow, () => !dead && ver === job);
        if (dead || ver !== job) {
          free(l);
          return;
        }
        // Replace ground and its consumers atomically, including collision, camera and support feet.
        motor.recontact(s, walker.H);
        l.camH = L.s.relief === s.relief ? L.camH : undefined;
        once = true;
        mats.resetWakes();
      }
      clearFirst();
      free(L);
      L = l;
      if (roomOwner) setRoom(doorRow(l) ? roomOwner : null);
      mats.uniforms.rillOn.value = 0;
      mats.uniforms.hydroOffset.value.set(s.offset[0], s.offset[2]);
      mats.uniforms.laneEarth.value = l.lane?.tex || null;
      mats.uniforms.laneWindow.value.fromArray(l.lane?.wrap || [0, 0, 1, 0]);
      mats.surveyReflection(s);
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
        clearFirst();
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
    setRoom(null);
    orbitActor = null;
    allowLanding = false;
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
    greet.hidden = true;
    host.classList.add("groundless");
    if (end === "walk") {
      expand();
      requested = cell;
      homeArrival = home;
      if (
        !L ||
        L.s.surveyGrid ||
        L.tier !== gov.tier ||
        Math.hypot(dest.x - L.fx, dest.y - L.fy) * U > 72
      )
        prepare(dest.x, dest.y);
    } else if (end === "inspect") {
      requested = cell;
      prepare(dest.x, dest.y);
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
  function visit(record, kind = "gate") {
    journey = null;
    menus(false);
    selectedKind = "";
    heldPoint = restorePose = null;
    activeStop = districtWalk = null;
    stopView = "ground";
    follow = 4.6;
    v = record;
    language();
    goCell(
      kind === "acre" ? record.c : record.homeLocation.map(Math.floor),
      kind,
    );
  }
  function doorstep(cell, home) {
    if (
      heldPoint &&
      cell[0] === Math.floor(heldPoint.x) &&
      cell[1] === Math.floor(heldPoint.y)
    )
      return heldPoint;
    if (home === "acre" && v?.court) {
      const [x, y] = v.court.land;
      return { x, y, yaw: Math.atan2(x - v.c[0] - 0.5, v.c[1] + 0.5 - y) };
    }
    if (home && v) {
      if (home === "gate" && v.house) {
        const { fx, fy } = basis(v.house),
          [gx, gy] = v.house.gate;
        return {
          x: v.court?.porch[0] ?? gx + (fx * 8.6) / U,
          y: v.court?.porch[1] ?? gy + (fy * 8.6) / U,
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
    goCell(v.homeLocation.map(Math.floor), "gate");
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
      let c = r[5].centre;
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
      best = 0.22;
    for (const row of L.all) {
      const [a, b] = row[5].centre,
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
      (!force && performance.now() - lastBookmark < 850)
    )
      return;
    const ground = mode === "ground",
      X = ground ? x : P.x,
      Y = ground ? y : P.y;
    if (ground && (!within(L, X, Y) || !L.s.sample(X, Y).drawn)) return;
    const route = location.hash.startsWith("#/")
      ? location.hash
      : resultRoute || "";
    if (!route) return;
    lastBookmark = performance.now();
    resultRoute = route;
    writePosition({
      active,
      room: ground ? roomOwner : null,
      route,
      x: X,
      y: Y,
      yaw: ground ? yaw : P.yaw,
      pitch,
      follow,
      third,
      range: P.r,
      eyeOffset: P.eye,
      tilt: P.tilt,
      level: ground ? "ground" : "orbit",
    });
  }
  function restore(p, record, scenic) {
    journey = null;
    menus(false);
    selectedKind = "";
    restorePose = p;
    third = prefs.third;
    v = record || null;
    menuRecord = v;
    if (v) remember(v);
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
        {
          x: p.x,
          y: p.y,
          r: p.range,
          tilt: p.tilt,
          yaw: p.yaw,
          eye: Number.isFinite(p.eyeOffset) ? clamp(p.eyeOffset, -5, 12) : 1.0,
        },
        "inspect",
        cell,
      );
  }
  // One logarithmic distance for the entire expedition; all inputs compose ratios rather than triggering levels.
  function beginOrbit() {
    restoreDraws(L?.group);
    orbitActor = { x, y, yaw: motor.yaw, z: motor.root };
    const m = cam.position,
      b = L.s.worldXYZ(x, y, motor.root);
    const surface = L.s.sample(x, y),
      pivotBase = Math.max(
        surface.z,
        surface.depth > 0.025 ? surface.line : -Infinity,
      );
    const ax = third ? 0.98 : m.y - motor.root,
      dx = m.x - b[0],
      dz = m.z - b[2],
      dy = m.y - b[1] - ax;
    P = {
      x,
      y,
      r: third ? Math.max(2.35, Math.hypot(dx, dz, dy)) : 0.09,
      tilt: third
        ? Math.atan2(dy, Math.hypot(dx, dz))
        : clamp(-pitch, -0.65, 1.55),
      yaw: third ? Math.atan2(dx, dz) : yaw,
      eye: motor.root + ax - pivotBase,
    };
    goal = { ...P };
    mode = "survey";
    host.classList.add("groundless");
    badge.hidden = true;
    pressed.clear();
  }
  function zoom(f) {
    if (overlay || dead || !Number.isFinite(f) || f <= 0) return;
    if (photo) {
      photo.p.x -= Math.sin(photo.yaw) * Math.log(f) * 3;
      photo.p.z -= Math.cos(photo.yaw) * Math.log(f) * 3;
      return;
    }
    if (flight) {
      flight = null;
      mode = "survey";
      goal = { ...P };
      badge.hidden = true;
    }
    if (mode === "ground") {
      let r = (third ? follow : 0.09) / f;
      if (third && r <= 9.8) {
        follow = clamp(r, 2.35, 9.8);
        dirty = true;
        return;
      }
      if (!third && f >= 1) return;
      beginOrbit();
      goal.r = clamp(r, third ? 2.35 : 0.09, baseRange * 1.18);
    } else {
      const nr = clamp(goal.r / f, third ? 2.35 : 0.09, baseRange * 1.18);
      if (!dev && f < 1 && expanded && goal.r >= baseRange * 1.175) {
        paper(true);
        window.dispatchEvent(new Event("atlas:map-fit"));
        return;
      }
      goal.r = nr;
    }
    allowLanding = f > 1;
    stopView = "orbit";
    dirty = true;
  }
  function landOrbit() {
    if (
      !allowLanding ||
      mode !== "survey" ||
      flight ||
      busy ||
      !expanded ||
      !within(L, P.x, P.y)
    )
      return;
    const lim = third ? 9.55 : 0.205;
    if (goal.r > lim || P.r > lim * 1.045) return;
    if (L.s.surveyGrid) {
      prepare(P.x, P.y);
      return;
    }
    const c = safeCell(P.x, P.y);
    if (!c) return;
    const gx = c[0] === Math.floor(P.x) ? P.x : c[0] + 0.5,
      gy = c[1] === Math.floor(P.y) ? P.y : c[1] + 0.5;
    heldPoint = { x: gx, y: gy, yaw: P.yaw };
    restorePose = {
      yaw: P.yaw,
      pitch: clamp(third ? 0.24 - P.tilt : -P.tilt, -1.45, 0.91),
      follow: third ? clamp(goal.r, 2.35, 9.8) : 4.6,
      third,
    };
    stopView = "ground";
    settle({ dest: { ...P }, cell: c, home: false, end: "walk" });
  }
  function fromMap(lon, lat, mpp) {
    setRoom(null);
    const [X, Y] = xy(a.project, lon, lat);
    flight = null;
    allowLanding = false;
    v = activeStop = districtWalk = orbitActor = null;
    menuRecord = null;
    journey = null;
    menus(false);
    heldPoint = restorePose = null;
    expand();
    resize();
    const r = clamp(
      (mpp * deck.clientHeight) / (2 * Math.tan((24 * Math.PI) / 180)),
      10,
      baseRange * 1.16,
    );
    P = { x: X, y: Y, r, tilt: 1.485, yaw: fitYaw, eye: 0.98 };
    goal = { ...P };
    mode = "survey";
    stopView = "orbit";
    host.classList.add("groundless");
    badge.hidden = true;
    sheet.hidden = true;
    language();
    dirty = true;
  }
  function pass(px, py, ox, oy, actor) {
    return (
      within(L, px, py) &&
      passes(
        L.s,
        L.nearWalls || L.sc?.userData.blocks,
        L.solids,
        L.nearCover,
        px,
        py,
        ox,
        oy,
        actor,
      )
    );
  }
  function settle(f) {
    P = { ...f.dest };
    goal = { ...P };
    flight = null;
    badge.hidden = true;
    if (f.end === "walk") {
      orbitActor = null;
      allowLanding = false;
      mode = "ground";
      host.classList.remove("groundless");
      let loc = doorstep(f.cell, f.home),
        framing = null;
      // First-person nature studies: use a real placed subject, not a camera aimed into a hillside.
      if (!dev && !heldPoint && activeStop?.frame_nearby === "rock") {
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
        const savedRoom =
          restorePose?.room &&
          L.sc?.userData.near.find((r) => r.u === restorePose.room);
        if (savedRoom) {
          const h = savedRoom.h;
          if (
            insideRoom(roomPlan(h), ...roomLocal(h, loc.x, loc.y)) &&
            !houseBlocked(h, loc.x, loc.y, true)
          )
            setRoom(savedRoom.u);
        }
        const allWalls = [
            ...(L.sc?.userData.blocks || []),
            ...(L.walls || []),
          ],
          free = (X, Y) =>
            L.s.sample(X, Y).drawn &&
            L.s.traversable(X, Y) &&
            !fenceAt(allWalls, X, Y) &&
          !L.all.some(
            (r) =>
              r[5] && houseBlocked(r[5], X, Y, L.s.openHome === r[5], 0.34),
          ) &&
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
      pitch = framing ?? activeStop?.pitch ?? 0.035;
      blockedSteps = 0;
      portrait = false;
      arrivalStep = 0;
      follow = 4.6;
      motor.reset(x, y, L.s, yaw, walker.H);
      walker.reset();
      if (stopView === "grove" && activeStop?.grove?.reverse) {
        yaw += Math.PI;
        pitch = activeStop.grove.pitch ?? 0.4;
        motor.yaw = yaw;
      } else if (portrait) {
        yaw += Math.PI;
        follow = 3.75;
        pitch = 0.06;
      }
      if (restorePose) {
        yaw = restorePose.yaw;
        pitch = restorePose.pitch;
        follow = restorePose.follow;
        third = prefs.third;
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
      if (v && f.home) selectKind(f.home === "acre" ? "acre" : "home");
      else if (!journey && v && location.hash.startsWith("#/acre/"))
        selectKind("acre");
      displayOwner();
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
    f.t += Math.min(0.65, dt);
    const needs = f.end === "walk" || f.end === "inspect";
    const at = needs && (!L || !within(L, ...f.cell) || busy);
    if (at) f.t = Math.min(f.t, f.dur * (firstPatch ? 0.99999 : 0.78));
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
        third ? -1.48 : -1.28,
        third ? 0.94 : 1.13,
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
        input.sprint() ||
        gp.sprint ||
        pressed.has("ShiftLeft") ||
        pressed.has("ShiftRight"),
      rate = run ? rates.jog : rates.walk;
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
      if (L.gateRock) L.solids.push(L.gateRock);
      L.solids.push(...(L.communitySolids || []));
      L.nearWalls = [
        ...(L.sc?.userData.blocks || []),
        ...(L.walls || []).filter(
          ([a, b, c, d]) =>
            x > Math.min(a, c) - 0.36 &&
            x < Math.max(a, c) + 0.36 &&
            y > Math.min(b, d) - 0.36 &&
            y < Math.max(b, d) + 0.36,
        ),
      ];
    }
    if (L.coverPatch !== L.cover?.solids || L.coverCentre !== L.solidCentre) {
      L.coverPatch = L.cover?.solids;
      L.coverCentre = L.solidCentre;
      L.nearCover = (L.coverPatch || []).filter(
        (o) => Math.hypot(o[0] - x, o[1] - y) < 0.44 + o[2],
      );
    }
    if (
      !L.supports ||
      L.supports.a !== L.solids ||
      L.supports.b !== L.nearCover
    ) {
      L.supports = {
        a: L.solids,
        b: L.nearCover,
        rocks: [
          ...L.solids,
          ...(L.nearCover || []),
          ...(L.gateRock ? [L.gateRock] : []),
        ].filter((o) => o.top),
      };
      const rocks = L.supports.rocks;
      S.floor = (x, y, refZ) => support(S, x, y, rocks, refZ);
    }
    updateHouseDoors(h);
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
      ground: ([X, Z]) => S.floor(O.x + X / U, O.y - Z / U, motor.root).z,
      root: motor.touch.z,
      at: [ma[0], ma[2]],
      yaw: motor.yaw,
      arrive: once,
      air: motor.air,
      climb: motor.grade,
      vertical: motor.up,
      grip: motor.grab ? motor.grab.t / motor.grab.d : 0,
      waterRoot: motor.root,
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
    syncIndoorState();
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
      (m > 0.001 || motor.swim) &&
      stepClock - lastRipple >
        (motor.speed > 0.15 ? (prefs.saver || reduced ? 0.49 : 0.3) : 1.55)
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
        raining = !roomOwner && env.weather?.rain > 0.08,
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
      if (roomOwner) tracks.mix.footstep("rock", false, ++tracks.seq);
      const f = walker.metrics().feet?.find((v) => v.stance),
        X = f?.foot[0] ?? point[0],
        Z = f?.foot[1] ?? point[2];
      if (!roomOwner)
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
      boost: false,
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
      (L.cx !== Math.floor((x + (motor.vx * 2.4) / U) / 64) ||
        L.cy !== Math.floor((y + (motor.vy * 2.4) / U) / 64) ||
        Math.abs(x - L.fx) > 3.35 ||
        Math.abs(y - L.fy) > 3.35)
    )
      prepare(x + (motor.vx * 2.4) / U, y + (motor.vy * 2.4) / U);
    else if (Math.hypot(x - L.nx, y - L.ny) > 1.65) nature(L);
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
        third ? -1.48 : -1.18,
        third ? 0.94 : 1.13,
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
    waterStamp = null;
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
    if (expanded && !L && mode === "survey") bookmark();
    displayOwner();
    q("#route-step").hidden = !journey || mode !== "ground";
    if ((v || journey) && L && mode === "ground") {
      const line = q("#route-step");
      line.hidden = !journey;
      if (journey) {
        const { remain, point, progress } = guideStep(journey, x, y);
        const prevHidden = journey.leafState?.items.filter((it) => it.hidden).length || 0;
        journey.lastProgress = progress;
        updateRouteLeaves(journey, progress);
        L.routeIndex = journey.i || 0;
        if (Math.hypot(x - journey.end[0], y - journey.end[1]) * U < 2.2) {
          journey = null;
          paintMarks();
          line.hidden = true;
          ui.toast(msg("holding.arrived"));
        } else {
          const angle = Math.atan2(point[0] - x, point[1] - y) + yaw;
          line.textContent =
            ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"][
              (Math.round(angle / (Math.PI / 4)) + 16) % 8
            ] +
            "  " +
            msg("village.remaining", { n: Math.round(remain) });
          const curHidden = journey.leafState?.items.filter((it) => it.hidden).length || 0;
          if (curHidden !== prevHidden) dirty = true;
        }
      }
      if (
        !journey &&
        selectedKind === "home" &&
        L.selection &&
        now > flashUntil
      ) {
        selectedKind = "";
        paintMarks();
      }
    }
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
    if (expanded) {
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
        code: Math.floor(P.x) + "-" + Math.floor(P.y),
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
      const surface = motor.touch ? surfaceName(motor.touch) : "earth";
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
    if (landMenu && menuRecord && menuNet) syncHoldingWalkButton();
    lastHud = now;
  }
  function cameraOrbit() {
    const alt = P.r * Math.sin(P.tilt);
    cameraAGL = alt;
    const frame = within(firstPatch, P.x, P.y) ? firstPatch : L;
    ex = within(frame, P.x, P.y) ? frame.s.relief : prefs.relief;
    const b = data.sample(P.x, P.y) * ex;
    let h = b;
    if (within(frame, P.x, P.y) && P.r < 22000) {
      const v = frame.s.sample(P.x, P.y);
      h = mix(
        Math.max(v.z, v.depth > 0.025 ? v.line : -Infinity),
        b,
        smooth(3100, 22000, P.r),
      );
    }
    const z = h + P.eye,
      k = P.r * Math.cos(P.tilt);
    cam.position.set(
      (P.x - O.x) * U + Math.sin(P.yaw) * k,
      z + P.r * Math.sin(P.tilt),
      (O.y - P.y) * U + Math.cos(P.yaw) * k,
    );
    if (P.r >= 7000) {
      const bx = O.x + cam.position.x / U,
        by = O.y - cam.position.z / U;
      cam.position.y = Math.max(
        cam.position.y,
        (data.region(bx, by) ? data.sample(bx, by) * ex : 0) + 0.6,
      );
    }
    if (P.r < 7000 && L) {
      const bx = O.x + cam.position.x / U,
        by = O.y - cam.position.z / U;
      if (within(L, bx, by)) {
        const lens = L.s.sample(bx, by);
        cam.position.y = Math.max(
          cam.position.y,
          Math.max(lens.z, lens.depth > 0.025 ? lens.line : -Infinity) +
            Math.min(1.4, 0.23 + P.r * 0.018),
        );
      }
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
    } else if (
      third &&
      orbitActor &&
      L &&
      P.r < 460 &&
      within(L, orbitActor.x, orbitActor.y)
    ) {
      avatar.visible = true;
      avatar.position.set(
        ...L.s.worldXYZ(orbitActor.x, orbitActor.y, orbitActor.z),
      );
      avatar.rotation.y = orbitActor.yaw;
    }
  }
  function animate(now) {
    if (dead) return;
    raf = requestAnimationFrame(animate);
    const dt = last ? Math.max(0, (now - last) / 1000) : 0;
    if (prefs.saver && lastRender && now - lastRender < 1000 / 30 - 0.5) return;
    lastRender = now;
    last = now;
    if (overlay || hostPaused || document.hidden) {
      waterStamp = null;
      return;
    }
    // Measure active elapsed time BEFORE skipping idle orbit paints. Flow is in metres/second, not metres/frame.
    if (waterStamp !== null) waterClock += (now - waterStamp) * 0.001;
    waterStamp = now;
    if (L) L.s.liquidTime = waterClock;
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
      Math.abs(goal.tilt - P.tilt) < 0.0001 &&
      Math.abs(Math.sin((goal.yaw - P.yaw) / 2)) < 0.0001;
    if (
      stationary &&
      !dirty &&
      now - lastOrbitPaint <
        (P.r > 15000 ? 510 : P.r > 3000 ? 95 : prefs.saver || reduced ? 45 : 32)
    )
      return;
    lastOrbitPaint = now;
    dirty = false;
    if (mode === "flight") flying(dt);
    landOrbit();
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
        (!L ||
          L.s.surveyGrid !== surveyGrid() ||
          L.cx !== Math.floor(P.x / 64) ||
          L.cy !== Math.floor(P.y / 64))
      )
        prepare(P.x, P.y);
    }
    if (photo && L) tickPhoto(Math.min(0.12, dt));
    else if (mode === "ground" && L) ground(dt, now);
    else cameraOrbit();
    q(".orbit-tools").hidden = mode !== "survey" || photo || !expanded;
    const rz = mode === "ground" ? (third ? follow : 0.09) : P.r,
      txt =
        rz < 1000
          ? (rz < 10 ? rz.toFixed(1) : Math.round(rz)) + " m"
          : (rz / 1000).toFixed(1) + " km";
    if (txt !== lastZoomLabel) {
      lastZoomLabel = txt;
      q("#orbit-read").textContent = txt;
      q(".orbit-tools output").textContent = txt;
      if (document.activeElement !== q("#orbit-distance"))
        q("#orbit-distance").value = Math.log(rz);
    }
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
      near = mode === "ground" ? 0.14 : clamp(P.r / 800, 0.075, 200);
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

    if (firstPatch)
      mats.uniforms.cameraInPatch.value
        .copy(cam.position)
        .sub(firstPatch.group.position);
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
            weather: q("#photo-weather").value,
          }
        : prefs,
    );
    if (L?.nightMeshes && now - (L.lastNight || -1e9) > 350) {
      const hr = calendar(Date.now(), worldConfig, prefs.time, prefs.hour).hour;
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
    if (mode !== "ground" || overlay) tracks.mix.silence();
    if (
      mode === "ground" &&
      !overlay &&
      L &&
      tracks.mix.ctx &&
      now - (L.audioAt || -1e9) > 500
    ) {
      L.audioAt = now;
      // Evaluate from the camera (metres), not from the axis of the map. Wind/rain surround the listener; shore and animals have bearings.
      const lx = O.x + cam.position.x / U,
        ly = O.y - cam.position.z / U,
        ux = cam.matrixWorld.elements[0],
        uy = -cam.matrixWorld.elements[2];
      let animal = null,
        animalM = 30,
        pan = 0,
        waterGain = 0,
        waterPan = 0;
      for (const v of L.bio.anim) {
        if (!/myna|kingfisher|tern|sparrow|parakeet|sunbird/i.test(v.name))
          continue;
        const dx = (v.x - lx) * U,
          dy = (v.y - ly) * U,
          d = Math.hypot(dx, dy, (v.world?.[1] || motor.root) - cam.position.y);
        if (d < animalM) {
          animal = v;
          animalM = d;
          pan = clamp((dx * ux + dy * uy) / Math.max(1, d), -0.85, 0.85);
        }
      }
      for (const dist of [0, 6, 14, 26]) {
        let wx = 0,
          wy = 0,
          n = 0;
        const N = dist ? 8 : 1;
        for (let i = 0; i < N; i++) {
          const dx = dist * Math.cos((i * 2 * Math.PI) / N),
            dy = dist * Math.sin((i * 2 * Math.PI) / N);
          if (L.s.sample(lx + dx / U, ly + dy / U).depth > 0.045) {
            wx += dx;
            wy += dy;
            n++;
          }
        }
        if (n) {
          waterGain = Math.exp(-dist / 16);
          waterPan = clamp(
            (wx * ux + wy * uy) / (n * Math.max(1, dist)),
            -0.8,
            0.8,
          );
          break;
        }
      }
      const cx = L.s.t.at(lx, ly);
      tracks.mix.tick({
        hour: calendar(Date.now(), worldConfig, prefs.time, prefs.hour).hour,
        weather: env.weather,
        speed: motor.speed,
        waterGain,
        waterPan,
        heading: yaw,
        cameraM: Math.hypot(
          (lx - x) * U,
          (ly - y) * U,
          cam.position.y - (motor.root + 1.6),
        ),
        river: cx?.c === 4,
        fall: !!L.extras?.fall,
        roof:
          !!roomOwner ||
          L.camHomes?.some(
            (h) => Math.hypot(h.centre[0] - x, h.centre[1] - y) * U < 6,
          ),
        village: L.s.commons.some(
          (q) => Math.hypot(q.hub[0] - x, q.hub[1] - y) * U < 115,
        ),
        forest: cx?.f > 48,
        animal: animal?.name,
        animalM,
        pan,
      });
    }
    if (L?.inland) {
      const simple = env.weather.rain <= 0.002 && !(L.drain?.residual > 1e-5);
      const lmat =
          L.tier === 0 ? (simple ? mats.fastLand : mats.landLow) : landFull,
        wmat =
          simple && L.s.surveyGrid
            ? mats.reach
            : L.tier === 0 || prefs.saver
              ? mats.waterSaver
              : waterFull;
      for (const ob of L.pickGround)
        ob.material = ob.userData.role === "natural-terrain" ? lmat : wmat;
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
        prepare(mode === "ground" ? x : P.x, mode === "ground" ? y : P.y, true);
      }
    }
    if (L?.soils)
      L.soils.material.color.setScalar(1 - 0.32 * env.weather.storage);
    const liquidTime = waterClock;
    if (L) L.s.liquidTime = liquidTime;
    mats.uniforms.liquidTime.value = liquidTime;
    data.banks.time(liquidTime);
    mats.uniforms.wakeClock.value = now * 0.001;
    mats.uniforms.lowWakes.value = prefs.saver;
    mats.uniforms.calmWater.value = +reduced;
    const surfaceDamp = mats.uniforms.soilDamp;
    surfaceDamp.value = dampGround(
      Math.hypot(P.x - dampX, P.y - dampY) > 8 ? 0 : surfaceDamp.value,
      env.weather,
      dt,
    );
    dampX = P.x;
    dampY = P.y;
    if (L && localVisible) {
      const cx = mode === "ground" ? O.x + cam.position.x / U : P.x,
        cy = mode === "ground" ? O.y - cam.position.z / U : P.y;
      if (L.bio && L.syncedObsStatics !== L.bio.statics) {
        L.drain.obstacles(L.bio.statics);
        L.syncedObsStatics = L.bio.statics;
      }
      L.drain.update(
        cx,
        cy,
        -cam.matrixWorld.elements[8],
        cam.matrixWorld.elements[10],
        env.weather,
        now * 0.001,
        !roomOwner && P.r < 320 && within(L, cx, cy),
        liquidTime,
      );
      walker.weather(
        roomOwner ? 0 : env.weather.rain,
        motor.depth || 0,
        !!motor.swim,
        Math.min(0.5, dt),
        liquidTime,
        mode === "ground" && third,
      );
    }

    env.track(cam, cameraAGL, P.r > 28000, now / 1000);
    renderer.setClearColor(P.r > 28000 ? 0xe7eddf : env.uni.uHor.value);
    env.uni.uGrid.value = 0;
    // A steep local orbit cannot see the coarser rings surrounding a many-kilometre window. Cull only if even the lowest view ray is above the interior cutoff, allowing 1.8 km of relief.
    const box = L?.cut,
      angle = P.tilt - 0.43 * Math.max(1, cam.aspect),
      edgeM = box
        ? U * Math.min(P.x - box[0], P.y - box[1], box[2] - P.x, box[3] - P.y)
        : 0;
    const inCut =
      mode === "survey" &&
      expanded &&
      P.r < 1300 &&
      angle > 0.19 &&
      edgeM > P.r + (P.r + 1800) / Math.tan(angle);
    if (L) {
      L.collar.visible = L.inset.visible = !inCut;
    }
    const useHorizon = localVisible && P.r < 4200 && within(L, P.x, P.y);
    reg.group.visible = !useHorizon;
    if (L) L.horizon.visible = useHorizon && !inCut;
    reg.update(
      P.x,
      P.y,
      P.r,
      ex,
      localVisible ? L.inset.userData.cut : firstPatch?.cut || null,
      env.uni.uDetail.value,
    );
    if (
      (mode === "ground" || (mode === "survey" && expanded)) &&
      L &&
      (now - stamp > (mode === "ground" ? 260 : 400) ||
        Math.abs(yaw - lastCullYaw) > 0.038 ||
        Math.abs(pitch - lastCullPitch) > 0.038 ||
        Math.hypot(
          cam.position.x - (L.lastCullX ?? 1e9),
          cam.position.z - (L.lastCullZ ?? 1e9),
        ) > 1.6)
    ) {
      cam.updateMatrixWorld(true);
      if (gov.tier === 0) cropDraws(L.group, cam);
      else if (L.sc) cropDraws(L.sc, cam);
      L.lastCullX = cam.position.x;
      L.lastCullZ = cam.position.z;
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
        localVisible && !roomOwner && P.r < 260,
      );
    else fx.group.visible = false;
    if (L?.ham) updateHamlet(L.ham, now / 1000, { x: P.x, y: P.y });
    if (localVisible && L.bio) {
      L.bio.update(dt, P.x, P.y, cam, P.r, reduced);
      if (L.syncedRockStatics !== L.bio.statics) {
        L.extras?.syncRocks(L.bio.statics);
        L.syncedRockStatics = L.bio.statics;
      }
      L.extras?.update(cam, P.x, P.y, P.r, reduced || prefs.saver);
    }
    if (
      now - lastLabels >
      (mode === "ground" ? 500 : pointers.size > 0 ? 150 : 65)
    ) {
      labels.draw(
        cam,
        P.r,
        ex,
        [], // A handle exists on its physical board, never in a 3D label layer.
        [],
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
    if (
      mode === "survey" &&
      expanded &&
      !busy &&
      !flight &&
      gov.tier > 0 &&
      prefs.quality === "auto" &&
      dt > 0.07 &&
      gov.observe(dt, 0, 0)
    ) {
      applyQuality();
      prepare(P.x, P.y, true);
    }
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
  const groundRay = new T.Raycaster(),
    pointerNDC = new T.Vector2();
  function screenPoint(e) {
    if (L?.group.visible && L.pickGround?.length && P.r < 4200) {
      const b = canvas.getBoundingClientRect();
      pointerNDC.set(
        ((e.clientX - b.left) / b.width) * 2 - 1,
        1 - ((e.clientY - b.top) / b.height) * 2,
      );
      groundRay.setFromCamera(pointerNDC, cam);
      const hit = groundRay.intersectObjects(L.pickGround, false)[0];
      if (hit) {
        const X = O.x + hit.point.x / U,
          Y = O.y - hit.point.z / U;
        return [X, Y, tiles.at(X, Y)?.d || 0];
      }
    }
    return reg.groundAt(cam, e.clientX, e.clientY, canvas);
  }
  on(
    canvas,
    "wheel",
    (e) => {
      e.preventDefault();
      zoom(
        Math.exp(
          -clamp(
            e.deltaY *
              (e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? 240 : 1) *
              0.0024,
            -1.45,
            1.45,
          ),
        ),
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
      if (!photo && mode === "survey") {
        const u =
            ((2 * P.r * Math.tan((cam.fov * Math.PI) / 360)) /
              Math.max(80, deck.clientHeight) /
              U) *
            0.5,
          du = dy / Math.max(0.48, Math.sin(P.tilt)),
          c = Math.cos(P.yaw),
          s = Math.sin(P.yaw);
        goal.x = clamp(goal.x - u * (dx * c + du * s), 0, a.project.cols);
        goal.y = clamp(goal.y + u * (-dx * s + du * c), 0, a.project.rows);
      }
      if (photo) {
        const k = 0.012;
        photo.p.x -= dx * Math.cos(photo.yaw) * k;
        photo.p.z += dx * Math.sin(photo.yaw) * k;
        photo.p.y += dy * k;
      }

      if (Number.isFinite(ratio) && ratio > 0) zoom(clamp(ratio, 0.5, 2));
    } else if (photo) {
      photo.yaw -= dx * 0.004;
      photo.pitch = clamp(photo.pitch - dy * 0.003, -1.49, 1.49);
    } else if (mode === "ground") {
      yaw -= dx * 0.004;
      lookTurn -= dx * 0.004;
      pitch = clamp(pitch - dy * 0.003, -1.18, 1.13);
    } else if (!flight) {
      if (!e.shiftKey && e.buttons !== 2) {
        goal.yaw -= dx * 0.007;
        goal.tilt = clamp(goal.tilt + dy * 0.006, -0.52, Math.PI / 2 - 0.003);
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
    if (!dev && P.r > 35) {
      goal.x = pt[0];
      goal.y = pt[1];
      dirty = true;
    } else if (P.r > 3000 && ds.has(pt[2])) inspect(ds.get(pt[2]));
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
    menus(false);
    sheet.hidden = !sheet.hidden;
    ui.close();
    neutral();
  };
  q("#hide-sheet").onclick = () => (sheet.hidden = true);
  q("#camera-mode").onclick = () => {
    third = prefs.third = !third;
    save();
    camState = {};
    language();
  };
  for (const style of ["woman", "man"])
    q("#avatar-" + style).onclick = () => {
      if (prefs.walker === style) return;
      prefs.walker = style;
      save();
      const fabric = walker.metrics().clothing;
      walker.dispose();
      walker = traveller(prefs.walker);
      walker.restoreWeather(fabric);
      avatar.add(walker.group);
      once = true;
      language();
    };
  function guide(id, view = "ground") {
    let stop = stops.find((s) => s.id === id);
    if (!stop) return;
    heldPoint = restorePose = null;
    if (view === "grove" && !stop.grove) view = "ground";
    const override =
      view === "bank"
        ? stop.bank
        : view === "ground"
          ? stop.ground_view
          : view === "mid"
            ? stop.mid_view
            : null;
    if (override) stop = { ...stop, ...override };
    if (view === "bank" && !override) view = "ground";
    districtWalk = null;
    activeStop = stop;
    menus(false);
    journey = null;
    selectedKind = "";
    menuRecord = null;
    stopView = view;
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
      tilt = view === "mid" ? (stop.tilt ?? 0.28) : 0.36;
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
  mixPanel.insertAdjacentHTML(
    "beforeend",
    '<button type="button" id="mix-restore" data-msg="sound.restore"></button>',
  );
  on(mixPanel.querySelector("#mix-restore"), "click", () => {
    tracks.unlock();
    mixer.restore();
    for (const el of mixPanel.querySelectorAll("input")) {
      const k = el.dataset.gain || el.dataset.sound;
      if (el.type === "range") el.value = mixer.settings[k];
      else el.checked = mixer.settings[k];
    }
  });
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
  on(document, "visibilitychange", () =>
    mixer.pause(overlay || document.hidden || nativePaused),
  );
  on(window, "atlas:host-pause", () => {
    nativePaused = true;
    mixer.pause(true);
  });
  on(window, "atlas:host-resume", () => {
    nativePaused = false;
    mixer.pause(overlay || document.hidden);
  });
  for (const [key, sel] of [
    ["season", "#season"],
    ["weather", "#sim-weather"],
    ["time", "#light"],
    ["quality", "#quality"],
  ]) {
    const el = q(sel);
    el.value = String(prefs[key]);
    el.onchange = () => {
      prefs[key] = el.value;
      save();
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
      demoHouse: v?.record_kind === "demo",
      housesDrawn: L?.houses || 0,
      treadCells: L?.s.tread?.refined || 0,
      sceneFarms: L?.farms?.userData.fields?.length || 0,
      destination: selectedKind,
      highlightVisible: !!L?.selection,
      villageId: v?.villageId,
      homeLocation: v?.homeLocation,
      acreLocation: v?.acreLocation,
      walkWaypoints: journey?.xy.length || 0,
      fieldRailSegments: L?.sc?.userData.blocks.length || 0,
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
      hydrology: L?.drain?.stats || null,
      waterScene: L
        ? {
            contacts: L.extras?.rockFX?.userData.contacts || [],
            falls: L.extras?.sites || [],
            liquidTime: mats.uniforms.liquidTime.value,
          }
        : null,
      ready: mode === "ground" && !busy && !arrivalStep && !!L?.groundDrawn,
      orbital: mode === "survey" && !expanded,
      regionCount: a.districts.length,
      regionDrawn: reg.group.visible,
      distantWater: data.banks.status(),
      shoreLattice: L?.s.surveyGrid ? "orbit" : "boot",
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
        climbs: motor.climbs,
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
      gateStone: L?.gateRock ? L.gateRock.slice(0, 4) : null,
      houses: L?.houses || 0,
      nameboards: L?.boards,
      support: motor.touch?.support || "terrain",
      orbit: { yaw: P.yaw, tilt: P.tilt, x: P.x, y: P.y, goal: goal.r },
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
        rms: mixer.meter(),
      },
      room: roomOwner,
      roomId: activeRoomId,
      doorAction: false,
      weatherParticles: !!(fx.group.visible && fx.rain.visible),
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
        L?.tier === 0 && prefs.saver ? "water-saver" : "surface-and-wakes",
      lines,
      stones: L?.sc?.userData.stones || [],
      near: L?.sc?.userData.near.map(({ u, x, y, did }) => ({ u, x, y, did })),
      metresPerCell: U,
      movementMps: rates.walk,
      yaw,
      blockedSteps,
      house: v?.house,

      assignedHere: L?.all?.length,

      roadHere: !!(motor.touch?.wear > 0.15),
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
        [...(L.sc.userData.blocks || []), ...(L.walls || [])],
        [...obs, ...(L.communitySolids || [])],
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
    fromMap,
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
      menus(false);
      journey = null;
      selectedKind = "";
      menuRecord = null;
      districtWalk = v = null;
      stopView = "ground";
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
      mats.fastLand.dispose();
      mats.reach.dispose();
      mats.uniforms.currentGrain.value.dispose();
      mats.waterSaver.dispose();
      mats.grain.dispose();
      mats.surfaces.forEach((t) => t.dispose());

      floorShade.geometry.dispose();
      floorShade.material.dispose();
      walker.dispose();
      mats.water.dispose();
      mats.surfDepth.dispose();
      mats.bankSky.dispose();
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
