import { recordKind, recordName, recordCounts } from "./record-kinds.js";
import { get, url } from "./grid.js";
const $ = (s) => document.querySelector(s),
  home = $("#atlas-home"),
  dialog = $("#dialog");
let lang = "en";
try {
  lang = localStorage.getItem("atlas-language") === "te" ? "te" : "en";
} catch {}
export const tr = (en, te) => (lang === "te" ? te : en);
function localize() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-te]").forEach((e) => {
    if (e.dataset.en === undefined) e.dataset.en = e.innerHTML;
    e.innerHTML = lang === "te" ? e.dataset.te : e.dataset.en;
  });
  document
    .querySelectorAll("[data-lang]")
    .forEach((b) => b.setAttribute("aria-pressed", String(lang === "te")));
  window.dispatchEvent(new Event("languagechange-atlas"));
}
function toggle() {
  lang = lang === "en" ? "te" : "en";
  try {
    localStorage.setItem("atlas-language", lang);
  } catch {}
  localize();
}
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-lang]")) toggle();
});
localize();
const data = get("data/atlas.json");
const byShard = new Map();
let world = null,
  mapCtrl = null,
  seq = 0;
export function normalize(s) {
  let u = s.trim().toLowerCase();
  if (/^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\//.test(u)) {
    try {
      const p = new URL(/^https?:/.test(u) ? u : "https://" + u);
      if (
        !["www.instagram.com", "instagram.com", "m.instagram.com"].includes(
          p.hostname,
        )
      )
        return "";
      u = p.pathname.replace(/^\/|\/$/g, "");
    } catch {
      return "";
    }
  } else u = u.replace(/^@/, "");
  return /^[a-z0-9_](?:[a-z0-9._]{0,28}[a-z0-9_])?$/.test(u) &&
    !u.includes("..")
    ? u
    : "";
}
async function lookup(u) {
  const a = await data,
    sh = [...u.slice(0, 2)].map((s) => s.charCodeAt(0).toString(16)).join("");
  if (!a.shards.includes(sh)) return null;
  if (!byShard.has(sh)) byShard.set(sh, get(`data/search/${sh}.json`));
  const idx = await byShard.get(sh);
  return Object.hasOwn(idx, u) ? idx[u] : null;
}
function msg(s) {
  const m = $("#search-msg");
  if (m) {
    m.hidden = !s;
    m.textContent = s;
  }
}
const missing = () =>
  tr(
    "No house yet. Follow @telugustates.csrgo for the public community claim instructions.",
    "ఇంకా ఇల్లు లేదు. @telugustates.csrgo లో కమ్యూనిటీ సూచనలు చూడండి.",
  );
let unavailable = false,
  mapVisible = false,
  retryable = false,
  retrying = false,
  initWorld,
  mapReady;
function paper(show, focus = true) {
  mapVisible = show || unavailable;
  world?.setPaper(mapVisible);
  document.body.classList.toggle("paper-map", mapVisible);
  document.body.classList.toggle("flight-sky", !mapVisible && !!world);
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.setAttribute(
      "aria-pressed",
      String((b.dataset.view === "map") === mapVisible),
    );
    b.disabled = unavailable && !retryable && b.dataset.view === "3d";
  });
  const view = world?.focus();
  if (mapVisible && focus && view) {
    mapCtrl?.refresh();
    if (view.r < 200000)
      mapCtrl?.focusPoint(
        ...view.ll,
        Math.max(1, Math.min(1500, 795000 / Math.max(1, view.r))),
      );
  }
}
function fallback(e) {
  retryable = !!world || !String(e?.message).includes("WebGL 2 is unavailable");
  console.warn("Atlas 3D paused:", e?.message || e);
  unavailable = true;
  world?.stop();
  world = null;
  paper(true, false);
  document.querySelector("#readout").textContent = tr(
    "2D map · 3D is unavailable on this device.",
    "2D పటం · ఈ పరికరంలో 3D అందుబాటులో లేదు.",
  );
  const retry = $("#restore-graphics");
  if (retry) retry.hidden = false;
  if (/^#\/(u|field|plot)\//.test(location.hash)) route();
}
async function route() {
  if (!home) return;
  const id = ++seq;
  const point = location.hash.match(
    /^#\/at\/(-?\d{1,2}(?:\.\d{1,9})?),(-?\d{1,3}(?:\.\d{1,9})?)$/,
  );
  if (point) {
    const lat = +point[1],
      lon = +point[2],
      atlas = await data,
      bb = atlas.project.bbox_wgs84;
    await initWorld;
    if (seq !== id) return;
    if (lon >= bb[0] && lon <= bb[2] && lat >= bb[1] && lat <= bb[3]) {
      if (world) {
        paper(false, false);
        world.coordinate(lon, lat);
      } else {
        await mapReady;
        paper(true);
        mapCtrl?.focusPoint(lon, lat, 80);
      }
    }
    return;
  }
  const field = location.hash.match(
    /^#\/field\/([a-z-]+)(?:\/(ground|mid|far|bank|grove))?$/,
  );
  if (field) {
    const stops = await get("ecology/stops.json"),
      s = stops.find((v) => v.id === field[1]);
    await initWorld;
    if (id !== seq) return;
    if (s && world) {
      paper(false, false);
      world.guide(s.id, field[2] || "ground");
      msg("");
    } else if (s) {
      await mapReady;
      if (id !== seq) return;
      paper(true, false);
      const at = field[2] === "bank" && s.bank ? s.bank : s;
      mapCtrl?.focusPoint(at.lon, at.lat, 80);
      msg(
        tr(
          "3D is unavailable. This trail is centred on the map.",
          "ఈ ప్రదేశం పటంలో చూపబడింది.",
        ),
      );
    }
    return;
  }
  const plot = location.hash.match(/^#\/plot\/([a-z0-9_.]+)$/);
  if (plot) {
    const r = await lookup(plot[1]);
    await mapReady;
    if (id !== seq) return;
    paper(true, false);
    if (r) mapCtrl?.focusHouse(r);
    else msg(missing());
    return;
  }
  const match = location.hash.match(/^#\/u\/(.+)$/);
  if (!match) {
    await initWorld;
    if (id === seq && world) {
      if (id > 1) paper(false, false);
      world.overview();
    }
    return;
  }
  let u;
  try {
    u = normalize(decodeURIComponent(match[1]));
  } catch {
    u = "";
  }
  const v = u ? await lookup(u) : null;
  if (id !== seq) return;
  if (!v) {
    msg(missing());
    world?.overview();
    return;
  }
  await initWorld;
  if (id !== seq) return;
  if (world && !unavailable) {
    msg("");
    paper(false, false);
    world.visit(v);
  } else {
    await mapReady;
    if (id !== seq) return;
    paper(true, false);
    mapCtrl?.focusHouse(v);
    msg(
      tr(
        "3D is unavailable. Your assigned plot is selected on the map. ",
        "3D అందుబాటులో లేదు. మీ ప్లాట్ పటంలో ఎంచుకోబడింది. ",
      ),
    );
    const link = document.createElement("a");
    link.className = "sub-link";
    link.href = url("houses/" + v.u + "/");
    link.textContent = tr("Open acre record →", "ఎకరం వివరాలు →");
    $("#search-msg").append(link);
  }
}
if (home) {
  const a = await data;
  get("ecology/stops.json").then((stops) => {
    const cards = $("#trail-cards"),
      idx = $("#trail-index");
    for (const [i, stop] of stops.entries()) {
      const card = document.createElement("a");
      card.href = "#/field/" + stop.id + "/ground";
      card.className = "trail-link tone-" + stop.id;
      const meta = document.createElement("small"),
        name = document.createElement("strong"),
        loc = document.createElement("span");
      meta.textContent = "STUDY / " + String(i + 1).padStart(2, "0");
      name.textContent = stop.title;
      loc.textContent = stop.district + "  ↗";
      card.append(meta, name, loc);
      if (["cliffs", "forest", "lake", "village"].includes(stop.id))
        cards.append(card);
      const l = document.createElement("a");
      l.href = card.href;
      l.textContent = stop.title + " →";
      idx.append(l);
    }
  });
  $("#nd").textContent = a.districts.length;
  $("#nr").textContent = a.total;
  const showSplit = () => {
    $("#record-split").textContent = recordCounts(a.recordStats.totals, tr);
  };
  showSplit();
  window.addEventListener("languagechange-atlas", showSplit);
  $("#find").onsubmit = async (e) => {
    e.preventDefault();
    const u = normalize($("#handle").value);
    try {
      if (!u || !(await lookup(u))) {
        msg(missing());
        return;
      }
      msg("");
      const hash = "#/u/" + u;
      if (location.hash === hash) route();
      else location.hash = hash;
    } catch {
      msg("Unable to read the local index. Please reload this page.");
    }
  };
  // Both views share the boundary download. SVG preparation is not an entry gate for WebGL.
  const boundaries = get("frozen/map.json");
  async function boot3D() {
    try {
      const { expedition } = await import("./world.js");
      world = await expedition($("#world"), a, tr, paper, fallback, boundaries);
      unavailable = retryable = false;
      $("#restore-graphics").hidden = true;
      paper(mapVisible || location.hash.startsWith("#/plot/"), false);
    } catch (e) {
      fallback(e);
    }
  }
  initWorld = boot3D();
  async function resume3D() {
    if (retrying) return;
    const fresh = unavailable;
    if (unavailable) {
      retrying = true;
      try {
        await (initWorld = boot3D());
      } finally {
        retrying = false;
      }
      if (!world) return;
    }
    paper(false, false);
    if (location.hash.startsWith("#/plot/")) {
      location.hash = location.hash.replace("#/plot/", "#/u/");
      return;
    }
    if (fresh) await route();
  }
  $("#restore-graphics").onclick = resume3D;
  function visitName(u) {
    if (!normalize(u)) return;
    const hash = "#/u/" + u;
    if (location.hash === hash) route();
    else location.hash = hash;
  }
  window.addEventListener("atlas:visit", (e) => visitName(e.detail));
  mapReady = import("./map.js").then(
    async ({ mountMap }) => (mapCtrl = await mountMap(a, tr, boundaries)),
  );
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]");
    if (b) {
      if (b.dataset.view === "3d") resume3D();
      else paper(true);
    }
  });
  $("#map-mode").addEventListener(
    "click",
    () => {
      if (!mapVisible) paper(true);
    },
    true,
  );
  for (const [id, factor] of [
    ["zin", 1.85],
    ["zout", 1 / 1.85],
    ["fit", 0],
  ])
    $("#" + id).addEventListener(
      "click",
      (e) => {
        if (!world || mapVisible) return;
        e.stopImmediatePropagation();
        if (factor) world.zoom(factor);
        else world.overview();
      },
      true,
    );
  window.addEventListener("hashchange", route);
  route();
}
$("#close-dialog").onclick = () => dialog.close();
dialog.onclick = (e) => {
  if (e.target === dialog) dialog.close();
};
let directory;
document.addEventListener("click", async (e) => {
  const action = e.target.closest("[data-open]")?.dataset.open;
  if (!action) return;
  const box = $("#dialog-body");
  box.replaceChildren();
  if (action === "residents") {
    const a = await data;
    directory ??= await get("data/directory.json");
    box.innerHTML = `<h2>${tr("Resident directory", "నివాసుల జాబితా")}</h2><p class="dir-split"></p><p>${tr("These are published virtual plots, not follower or comment counts.", "ఇవి ప్రచురించిన వర్చువల్ ప్లాట్లు. ఇవి ఫాలోవర్లు లేదా వ్యాఖ్యల సంఖ్య కాదు.")}</p><label for="dir-kind">${tr("Record type", "రికార్డు రకం")}</label><select id="dir-kind" class="dir-kind"></select><input class="dir-search" aria-label="Search residents" placeholder="${tr("Username or district", "పేరు లేదా జిల్లా")}"><div class="directory"></div><p class="dir-empty" hidden></p><button class="notes-btn" id="more">${tr("Show more", "మరిన్ని")}</button>`;
    box.querySelector(".dir-split").textContent = recordCounts(
      a.recordStats.totals,
      tr,
    );
    const byType = box.querySelector("#dir-kind"),
      empty = box.querySelector(".dir-empty"),
      input = box.querySelector("input"),
      more = box.querySelector("#more");
    for (const [id, title, count] of [
      ["all", tr("All plot records", "అన్ని ప్లాట్లు"), a.total],
      [
        "community",
        tr("Community", "కమ్యూనిటీ"),
        a.recordStats.totals.community,
      ],
      ["demo", tr("Demo", "నమూనా"), a.recordStats.totals.demo],
      [
        "unreviewed",
        tr("Unreviewed", "పరిశీలించనివి"),
        a.recordStats.totals.unreviewed,
      ],
    ]) {
      if (id !== "unreviewed" || count)
        byType.add(new Option(`${title} (${count})`, id));
    }
    let limit = 20;
    function render() {
      const g = box.querySelector(".directory");
      g.replaceChildren();
      const rows = directory.filter(
        ([u, d]) =>
          (byType.value === "all" ||
            recordKind(a.recordStats, u) === byType.value) &&
          (u + " " + a.districts[d - 1].name + " " + a.districts[d - 1].te)
            .toLowerCase()
            .includes(input.value.trim().toLowerCase().replace(/^@/, "")),
      );
      for (const [u, d] of rows.slice(0, limit)) {
        const l = document.createElement("a");
        l.href = url("houses/" + u + "/");
        l.textContent = "@" + u;
        const small = document.createElement("small");
        l.dataset.kind = recordKind(a.recordStats, u);
        small.textContent =
          tr(a.districts[d - 1].name, a.districts[d - 1].te) +
          " · " +
          recordName(l.dataset.kind, tr);
        l.append(small);
        g.append(l);
      }
      empty.hidden = rows.length !== 0;
      if (!rows.length)
        empty.textContent =
          byType.value === "community" && !a.recordStats.totals.community
            ? tr(
                "No community plots are published in this edition. Choose Demo to explore the examples.",
                "ఈ సంచికలో కమ్యూనిటీ ప్లాట్లు లేవు. ఉదాహరణల కోసం నమూనా ఎంచుకోండి.",
              )
            : tr("No matching plot records.", "సరిపోలే ప్లాట్లు లేవు.");
      more.hidden = rows.length <= limit;
    }
    byType.onchange = input.oninput = () => {
      limit = 20;
      render();
    };
    more.onclick = () => {
      limit += 30;
      render();
    };
    render();
  } else {
    box.innerHTML = `<h2>${tr("Field notes", "ఫీల్డ్ నోట్స్")}</h2><p>${tr("Every virtual acre is tied to a real location. Find a resident, walk the landscape, or explore a district on the map.", "ప్రతి వర్చువల్ ఎకరం ఒక భౌగోళిక స్థానానికి అనుసంధానించబడింది.")}</p><h3>${tr("Explore in 3D", "3Dలో అన్వేషించండి")}</h3><p>${tr("Tap a district to descend, then tap an acre label. Scroll or pinch to change altitude. Choose Map for the paper map at any time. IST and the sky follow the real clock; weather and wildlife are illustrations, not live observations.", "జిల్లాను తాకి దగ్గరగా వెళ్లండి. ఇంటికి చేరడానికి దాని పేరును తాకండి. జూమ్ చేయండి లేదా పటాన్ని ఎంచుకోండి. సమయం IST ప్రకారం ఉంటుంది; వాతావరణం, గ్రామ జీవితం ఊహాచిత్రాలు.")}</p><h3>${tr("The November edition", "నవంబర్ సంచిక")}</h3><p>${tr("33 Telangana districts and 28 Andhra Pradesh districts, matched by LGD code. Markapuram and Polavaram have mapped polygons. No invented splits.", "LGD కోడ్ ఆధారంగా తెలంగాణలో 33, ఆంధ్రప్రదేశ్‌లో 28 జిల్లాలను గుర్తించాం. మార్కాపురం, పోలవరానికి పటంలో సరిహద్దులు ఉన్నాయి. ఊహించిన విభజనలు లేవు.")}</p><h3>${tr("Read the map", "పటాన్ని చదవండి")}</h3><p>${tr("Drag to pan; pinch, scroll or use +/− to zoom. Tap a district for its plot counts. Labels appear as space permits. Zoom into terracotta markers to see individual assigned acres; tap an acre to visit. Point at land to read latitude, longitude and source elevation.", "పటాన్ని లాగండి. రెండు వేళ్లతో లేదా +/− తో జూమ్ చేయండి. ప్లాట్ల సంఖ్య కోసం జిల్లాను తాకండి. గోధుమ రంగు గుర్తులపై జూమ్ చేస్తే ఇళ్లు కనిపిస్తాయి. నేలపై తాకితే అక్షాంశం, రేఖాంశం, ఎత్తు కనిపిస్తాయి.")}</p><h3>${tr("Sources & limits", "మూలాలు మరియు పరిమితులు")}</h3><p>© OpenStreetMap contributors (ODbL), LGD, Copernicus WorldDEM-30, ESA WorldCover 2021 and HydroLAKES. Tree cover is not a legal forest boundary. Unmapped mines and water may be missing. The model is not for navigation or property claims.</p><a class="sub-link" href="${url("frozen/credits.md")}">${tr("Full credits, licences & terrain notice ↗", "పూర్తి మూలాలు, లైసెన్సులు ↗")}</a>`;
  }
  if (!dialog.open) dialog.showModal();
});
