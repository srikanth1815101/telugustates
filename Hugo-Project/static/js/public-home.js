import { readPosition } from "./position-book.js";
import { get, url, Tiles, key } from "./grid.js";
import { loadMessages, bindMessages, msg } from "./messages.js";
import { mountMap } from "./map.js";
import { mountTreasury } from "./treasury-view.js";
import { initAppSync } from "./app-sync.js";
const $ = (s) => document.querySelector(s),
  home = $("#public-home"),
  dlg = $("#dialog"),
  tell = (e, text) => {
    if (e) {
      e.hidden = !text;
      e.textContent = text;
    }
  };
let cold = null,
  retryHash = "";
let a,
  stops = [],
  directory = [],
  map,
  w,
  boot,
  paused = false,
  failed = false,
  seq = 0,
  tr = (en, te) => (document.documentElement.lang === "te" ? te : en);
const scenery = (id) =>
  stops.find((s) => s.id === id)?.default_view || "ground";
let lang = "en";
try {
  lang = localStorage.getItem("atlas-language") || "en";
} catch {}
await loadMessages();
function translate() {
  document.documentElement.lang = lang;
  bindMessages(document);
  for (const e of document.querySelectorAll("[data-te]")) {
    e.dataset.en ??= e.innerHTML;
    e.innerHTML = lang === "te" ? e.dataset.te : e.dataset.en;
  }
  window.dispatchEvent(new Event("languagechange-atlas"));
  if (a) paint();
}
translate();
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-lang]")) {
    lang = lang === "te" ? "en" : "te";
    try {
      localStorage.setItem("atlas-language", lang);
    } catch {}
    translate();
  }
});
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
function paint() {
  if (!home) return;
  $("#nd").textContent = a.districts.length;
  $("#nr").textContent = a.total;
  if (a.home) {
    const t = $("#home-title"),
      p = $("#home-intro");
    if (t && a.home.title) {
      t.dataset.en = esc(a.home.title) + "<span>.</span>";
      if (a.home.title_te) t.dataset.te = esc(a.home.title_te) + ".";
      t.innerHTML = lang === "te" ? t.dataset.te : t.dataset.en;
    }
    if (p && a.home.intro) {
      p.dataset.en = esc(a.home.intro);
      if (a.home.intro_te) p.dataset.te = esc(a.home.intro_te);
      p.innerHTML = lang === "te" ? p.dataset.te : p.dataset.en;
    }
  }
  document.dispatchEvent(new Event("living:home-painted"));
}
async function showDialog(k) {
  const body = $("#dialog-body");
  body.replaceChildren();
  const h = document.createElement("h2"),
    p = document.createElement("p");
  h.textContent = msg(
    k === "about"
      ? "nav.about"
      : k === "privacy"
        ? "nav.privacy"
        : k === "economy"
          ? "home.resources"
          : "nav.residents",
  );
  p.textContent = msg(
    k === "about"
      ? "home.about"
      : k === "privacy"
        ? "home.privacy"
        : k === "economy"
          ? "home.resources"
          : directory.length
            ? "home.count"
            : "home.empty",
    { n: directory.length },
  );
  body.append(h, p);
  if (k === "about") {
    for (const [href, id] of [
      ["frozen/credits.md", "nav.data"],
      ["library/CREDITS.html", "home.credits"],
    ]) {
      const l = document.createElement("a");
      l.href = url(href);
      l.textContent = msg(id);
      body.append(l, document.createElement("br"));
    }
  }
  if (k === "residents")
    for (const [u, , href] of directory) {
      const l = document.createElement("a");
      l.href = url(href);
      l.textContent = "@" + u;
      body.append(l);
    }
  if (k === "economy")
    document.dispatchEvent(new CustomEvent("living:economy", { detail: body }));
  if (!dlg.open) dlg.showModal();
}
document.addEventListener("click", (e) => {
  const action = e.target.closest("[data-open]")?.dataset.open;
  if (action) showDialog(action);
});
$("#close-dialog").onclick = () => dlg.close();
dlg.onclick = (e) => {
  if (e.target === dlg) dlg.close();
};
export function normalize(s) {
  s = s.trim().toLowerCase();
  if (/^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\//.test(s)) {
    try {
      const u = new URL(s.startsWith("http") ? s : "https://" + s);
      if (
        !["instagram.com", "www.instagram.com", "m.instagram.com"].includes(
          u.hostname,
        )
      )
        return "";
      s = u.pathname.replace(/^\/|\/$/g, "");
    } catch {
      return "";
    }
  } else s = s.replace(/^@/, "");
  return /^[a-z0-9_](?:[a-z0-9._]{0,28}[a-z0-9_])?$/.test(s) &&
    !s.includes("..")
    ? s
    : "";
}
const shardCache = new Map();
async function lookup(u) {
  if (!u) return null;
  const key = Array.from(u.slice(0, 2), (c) =>
    c.charCodeAt(0).toString(16),
  ).join("");
  if (!a.shards.includes(key)) return null;
  const sh = shardCache.get(key) || (await get("data/search/" + key + ".json"));
  shardCache.set(key, sh);
  return Object.hasOwn(sh, u) ? sh[u] : null;
}
function paper(show) {
  paused = show;
  w?.setPaper(show);
  document.body.classList.toggle("paper-map", show);
  if (show) {
    document.body.classList.remove("walking");
    $("#world").hidden = true;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    map?.refresh();
    if (w) {
      const v = w.focus();
      if (v.r < 200000) map?.focusPoint(...v.ll, 32);
    }
    if (w) {
      if (location.hash.startsWith("#/"))
        history.replaceState(null, "", location.pathname + location.search);
      $("#map-wrap")?.focus({ preventScroll: true });
    }
  } else if (w?.focus().expanded) {
    $("#world").hidden = false;
    document.body.classList.add("walking");
  }
}
function fallback(cause) {
  if (cause) console.warn("3D renderer unavailable:", cause?.stack || cause);
  failed = true;
  window.__atlasMapFallback = true;
  w?.stop();
  w = null;
  boot = null;
  paper(true);
  $("#restore-graphics").hidden = false;
  tell($("#progress"), msg("home.unavailable"));
}
async function world() {
  if (w) return w;
  if (!boot) {
    tell($("#progress"), msg("home.preparing"));
    boot = import("./world.js")
      .then(({ expedition }) =>
        expedition($("#world"), a, tr, paper, fallback, get("frozen/map.json")),
      )
      .then(
        (v) => (
          (w = v),
          (failed = false),
          (boot = null),
          ($("#restore-graphics").hidden = true),
          tell($("#progress"), ""),
          v
        ),
      )
      .catch((e) => {
        fallback(e);
        return null;
      });
  }
  return boot;
}
function requestFull() {
  if (location.hostname === "appassets.androidplatform.net") return;
  if (!document.fullscreenElement && document.documentElement.requestFullscreen)
    document.documentElement.requestFullscreen().catch(() => {});
}
async function route() {
  if (!a) return;
  const token = ++seq;
  const hash = location.hash,
    match = hash.match(/^#\/(u|plot|acre)\/([a-zA-Z0-9_.]+)$/),
    f = hash.match(
      /^#\/field\/([a-z0-9_-]+)(?:\/(ground|mid|far|bank|grove))?$/,
    ),
    pt = hash.match(/^#\/at\/(-?[\d.]+),(-?[\d.]+)$/);
  if (!match && !f && !pt) {
    paper(true);
    return;
  }
  retryHash = hash;
  let r, s;
  if (match) {
    const u = normalize(match[2]);
    r = await lookup(u);
    if (token !== seq) return;
    if (!r) {
      paper(true);
      tell($("#search-msg"), msg("home.missing", { name: u }));
      return;
    }
    if (match[1] === "plot") {
      paper(true);
      map.focusHouse(r);
      return;
    }
  }
  if (f) {
    s = stops.find((s) => s.id === f[1]);
    if (!s) {
      paper(true);
      return;
    }
  }
  if (pt) {
    const [lon, lat] = [+pt[2], +pt[1]],
      b = a.project.bbox_wgs84;
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lon < b[0] ||
      lon > b[2] ||
      lat < b[1] ||
      lat > b[3]
    )
      return;
  }
  const v = await world();
  if (token !== seq) return;
  if (!v) {
    if (pt) map.focusPoint(+pt[2], +pt[1], 32);
    if (r) map.focusHouse(r);
    else if (s) map.focusPoint(s.lon, s.lat, 32);
    return;
  }
  paper(false);
  if (cold?.route === hash && cold.active && (!r || cold.layout === 714)) {
    const b = cold;
    cold = null;
    v.restore(b, r, s);
  } else if (r) v.visit(r, match[1] === "acre" ? "acre" : "gate");
  else if (s) v.guide(s.id, f[2] || "ground");
  else v.coordinate(+pt[2], +pt[1]);
}
if (!home) directory = await get("data/directory.json");
const recordPage = $("[data-record]");
if (recordPage) {
  a = await get("data/atlas.json");
  const r = await lookup(recordPage.dataset.record),
    district = a.districts.find((d) => d.id === r?.d);
  if (r && district) {
    if (!Number.isFinite(r.z)) {
      const local = new Tiles(a);
      await local.load(key(...r.c));
      const z = local.at(...r.c)?.z;
      r.z = Number.isFinite(z) && z !== -32768 ? z : null;
    }
    const fill = () => {
      $("#record-where").textContent =
        tr(district.name, district.te) +
        " · " +
        msg(district.state === "Telangana" ? "geo.tg" : "geo.ap");
      $("[data-record-kind]").textContent = msg("resident." + r.record_kind);
      $("#record-grid").textContent =
        r.lat.toFixed(6) + "°, " + r.lon.toFixed(6) + "°";
      $("#record-z").textContent = Number.isFinite(r.z) ? r.z + " m" : "—";
    };
    fill();
    window.addEventListener("languagechange-atlas", fill);
  }
}
if (home || $("#economy-page")) await mountTreasury();
initAppSync();
window.addEventListener("atlas:content-updated", async () => {
  try {
    if (home) {
      const [nextAtlas, nextStops, nextDir, nextRoutes] = await Promise.all([
        get("data/atlas.json"),
        get("living/public/places.json"),
        get("data/directory.json"),
        get("living/routes.json"),
      ]);
      a = nextAtlas;
      stops = nextStops;
      directory = nextDir;
      paint();
      if (map) map.reloadAtlas(a, stops, nextRoutes);
    } else {
      directory = await get("data/directory.json");
    }
  } catch (err) {
    console.warn("Live content refresh skipped:", err);
  }
});
if (home) {
  try {
    [a, stops, directory] = await Promise.all([
      get("data/atlas.json"),
      get("living/public/places.json"),
      get("data/directory.json"),
    ]);
    paint();
    map = await mountMap(a, tr);
    map.setFeatures(stops, await get("living/routes.json"));
    let lastMapHash = "";
    window.addEventListener("atlas:map-zoom", async (e) => {
      const [lon, lat] = e.detail;
      lastMapHash = "#/at/" + lat.toFixed(8) + "," + lon.toFixed(8);
      if (failed) {
        map.focusPoint(lon, lat, 40);
        tell($("#progress"), msg("walk.fallback"));
        return;
      }
      const token = ++seq,
        mpp = e.detail[2];
      const v = await world();
      if (!v || seq !== token) return;
      history.replaceState(
        null,
        "",
        location.pathname + location.search + lastMapHash,
      );
      cold = null;
      paper(false);
      v.fromMap(lon, lat, mpp);
    });
    $("#restore-graphics").onclick = () => {
      failed = false;
      window.__atlasMapFallback = false;
      requestFull();
      if (location.hash) route();
      else if (retryHash || lastMapHash)
        location.hash = retryHash || lastMapHash;
      else map.enter();
    };
    $("#find").onsubmit = async (e) => {
      e.preventDefault();
      cold = null;
      requestFull();
      const u = normalize($("#handle").value);
      if (!u || !(await lookup(u))) {
        tell(
          $("#search-msg"),
          msg("home.missing", {
            name: u || $("#handle").value.trim().slice(0, 30),
          }),
        );
        return;
      }
      tell($("#search-msg"), "");
      if (location.hash === "#/u/" + u) route();
      else location.hash = "/u/" + u;
    };
    document.addEventListener("click", (e) => {
      const link = e.target.closest('a[href^="#/field/"],a[href^="#/u/"]');
      if (link) {
        requestFull();
        if (link.hash === location.hash) {
          e.preventDefault();
          route();
        }
      }
    });
    window.addEventListener("atlas:place", (e) => {
      requestFull();
      const hash = "#/field/" + e.detail + "/" + scenery(e.detail);
      if (location.hash === hash) route();
      else location.hash = hash;
    });
    window.addEventListener("hashchange", route);
    window.addEventListener("atlas:visit", (e) => {
      location.hash = "/u/" + e.detail;
    });
    cold =
      location.hash && !/^#\/(u|acre)\//.test(location.hash)
        ? readPosition(a)
        : null;
    if (cold?.route !== location.hash) cold = null;
    await route();
  } catch (e) {
    console.error("Local map:", e);
    tell($("#progress"), msg("home.offline"));
    $("#restore-graphics").hidden = false;
    $("#restore-graphics").onclick = () => location.reload();
  }
}
