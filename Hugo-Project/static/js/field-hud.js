import { ink } from "./walk-icons.js";
// Accessible, localised play controls; only the active language is displayed.
import { msg, bindMessages } from "./messages.js";
import { houseLabel } from "./resident-id.js";
export function fieldHUD(host, deck, on, tr, api) {
  const $ = (s) => host.querySelector(s),
    insert = (p, h) => p.insertAdjacentHTML("beforeend", h),
    sp = (id) => `<span data-msg="${id}"></span>`;
  insert(host, '<div class="walk-safe-probe" aria-hidden="true"></div>');
  const chip = document.createElement("div");
  chip.id = "place-chip";

  chip.dataset.msgAria = "hud.place";
  chip.dataset.msgTitle = "hud.place";

  chip.innerHTML = "<i></i><span></span><small></small>";
  $(".world-id").replaceWith(chip);
  const compass = deck.querySelector(".flight-north").cloneNode(true);
  $(".world-top").insertBefore(compass, $("#world-menu"));
  const back = $(".world-back");
  back.dataset.msgAria = "hud.back";
  back.dataset.msgTitle = "hud.back";
  back.replaceChildren(document.createTextNode("←"));
  back.dataset.view = "map";
  $(".world-top .chart-switch").remove();
  $("#world-menu").dataset.msgAria = "hud.menu";
  for (const [sel, k, label] of [
    ["#world-menu", "settings", "walk.settings"],
    ["#hop", "jump", "hud.jump"],
    ["#pace", "sprint", "walk.sprint"],
  ]) {
    const b = $(sel);
    delete b.dataset.msg;
    b.dataset.msgAria = b.dataset.msgTitle = label;
    b.innerHTML = ink(k);
  }
  $(".joystick").dataset.msgAria = "hud.stick";
  $("#copy-gps").dataset.msgAria = "details.copyCoords";
  const details = $(".world-hud");
  details.id = "place-details";
  details.classList.add("readings");
  details.hidden = true;
  details.setAttribute("role", "dialog");
  details.dataset.msgAria = "details.title";
  details.append($("#life-read"));
  insert(
    details,
    '<p id="local-clock" class="clock-detail"></p><div class="read-row">' +
      sp("details.acre") +
      '<button id="copy-plot" data-msg="details.copyPlot"></button></div><p class="read-credit" data-msg="details.credits"></p><button class="read-close" data-msg="details.close"></button>',
  );
  insert(
    host,
    '<div class="walk-toast" role="status" hidden></div><div class="walk-tip" hidden><button data-msg-aria="tip.next"><small></small><b></b></button><button data-msg-aria="tip.dismiss">×</button></div><section class="resident-card" role="dialog" aria-labelledby="resident-title" hidden><button class="dismiss" data-msg-aria="resident.close">×</button><small></small><h3 id="resident-title"></h3><p></p><nav><button class="share" data-msg="resident.share"></button><button class="walk" data-msg="resident.walk"></button></nav></section>',
  );
  const sheet = $(".world-sheet"),
    layout = document.createElement("details");
  const corner = document.createElement("aside");
  corner.className = "walk-corner";
  corner.innerHTML =
    '<canvas class="pocket-map" data-msg-aria="hud.map"></canvas>';
  corner.append(chip);
  host.append(corner);
  const actions = document.createElement("section");
  actions.className = "quick-settings";
  const tool = (id, key, label) =>
    `<button type="button" id="${id}" class="field-tool" data-msg-aria="${label}" data-msg-title="${label}">${ink(key)}</button>`;
  actions.innerHTML = `<div class="action-dock">${tool("hud-minimal", "minimal", "walk.cleanHUD")}${tool("read-place", "locate", "walk.readings")}${tool("camera-mode", "third", "menu.third")}${tool("leave-world", "exit", "walk.leave")}</div><fieldset class="avatar-dock"><legend data-msg="menu.traveller"></legend>${tool("avatar-man", "man", "menu.man")}${tool("avatar-woman", "woman", "menu.woman")}</fieldset><label class="orbit-scale"><span data-msg="orbit.distance"></span><output id="orbit-read"></output><input id="orbit-distance" data-msg-aria="orbit.distance" type="range" min="-2.41" max="14.9" step="any"></label>`;
  sheet.querySelector(".sheet-head").after(actions);
  on($("#leave-world"), "click", () => api.leave());
  $("#read-place").setAttribute("aria-controls", "place-details");
  $("#read-place").setAttribute("aria-haspopup", "dialog");
  $("#read-place").setAttribute("aria-expanded", "false");
  on($("#read-place"), "click", () => placeOpen(true));
  on($("#orbit-distance"), "input", (e) =>
    api.zoomTo(Math.exp(+e.target.value)),
  );
  function visibility(flag) {
    corner.hidden = flag;
    $("#hud-minimal").setAttribute("aria-pressed", String(flag));
    api.prefs.hideMini = api.prefs.hideCompact = flag;
  }
  visibility(!!(api.prefs.hideMini || api.prefs.hideCompact));
  on($("#hud-minimal"), "click", () => {
    visibility(!corner.hidden);
    api.setting("hideMini");
  });
  layout.className = "pref-panel";
  layout.innerHTML =
    '<summary data-msg="prefs.title"></summary><label>' +
    sp("prefs.gain") +
    ' <input id="look-gain" type="range" min="0.4" max="2.2" step="0.1"></label>' +
    ["invert", "recenter", "haptics", "saver", "motion", "reduceFlash"]
      .map(
        (id) =>
          `<label><input type="checkbox" id="walk-${id}">${sp("prefs." + id)}</label>`,
      )
      .join("") +
    '<button id="repeat-lesson" data-msg="tip.repeat"></button><button id="photo-start" data-msg="photo.start"></button>';
  sheet.querySelector(".sheet-foot").before(layout);
  insert(
    host,
    '<div class="photo-tools" hidden><div class="photo-bar"><button id="photo-exit" data-msg="photo.exit"></button><button id="photo-options" aria-expanded="false" data-msg="photo.camera"></button><button id="photo-save" data-msg="photo.save"></button></div><div class="photo-tuning" hidden><label>' +
      sp("photo.weather") +
      '<select id="photo-weather"><option value="auto" data-msg="photo.auto"></option><option value="Clear" data-msg="weather.clear"></option><option value="Cloudy" data-msg="weather.cloudy"></option><option value="Rain" data-msg="weather.rain"></option><option value="Heavy rain" data-msg="weather.heavy"></option></select></label><label>' +
      sp("photo.height") +
      '<input id="photo-lift" type="range" min="-1" max="12" step="0.1" value="0"></label><p data-msg="photo.help"></p></div></div>',
  );
  const credits = document.createElement("nav");
  credits.className = "detail-links";
  for (const [k, p] of [
    ["details.data", "frozen/credits.md"],
    ["details.art", "library/CREDITS.html"],
  ]) {
    const a = document.createElement("a");
    a.href = api.assetUrl(p);
    a.dataset.msg = k;
    credits.append(a);
  }
  details.querySelector(".read-close").before(credits);
  bindMessages(host);
  const prefs = api.prefs;
  for (const k of [
    "invert",
    "recenter",
    "haptics",
    "saver",
    "motion",
    "reduceFlash",
  ]) {
    const el = $("#walk-" + k);
    el.checked = !!prefs[k];
    on(el, "change", () => {
      prefs[k] = el.checked;
      host.classList.toggle("left-handed", prefs.left);
      api.setting(k);
      if (k === "left") teach();
    });
  }
  host.classList.toggle("left-handed", prefs.left);
  const gain = $("#look-gain");
  gain.value = prefs.gain;
  on(gain, "input", () => {
    prefs.gain = +gain.value;
    api.setting("gain");
  });
  let timer = 0,
    idle = 0,
    lesson = 0,
    lastPlot = "",
    card = null,
    lastD = 0,
    lastSurface = "",
    lastRain = false,
    started = false;
  const tip = $(".walk-tip"),
    toastEl = $(".walk-toast"),
    panel = $(".resident-card"),
    photo = $(".photo-tools"),
    tuning = $(".photo-tuning");
  let manualLesson = false,
    done = false;
  try {
    done = localStorage.getItem("ts-walk-lesson-1") === "done";
  } catch {}
  const teach = () => {
    tip.hidden = !manualLesson || done || lesson > 2 || api.photo();
    if (tip.hidden) return;
    tip.querySelector("small").textContent = msg("tip.progress", {
      n: lesson + 1,
      action: msg(["tip.move", "tip.look", "tip.actions"][lesson]),
    });
    tip.querySelector("b").textContent = msg(
      lesson === 2
        ? "tip.combine"
        : (lesson === 0) !== prefs.left
          ? "tip.left"
          : "tip.right",
    );
  };
  on(window, "languagechange-atlas", () => {
    bindMessages(host);
    teach();
    if (card && !panel.hidden) renderCard();
  });
  const finish = () => {
    done = true;
    tip.hidden = true;
    try {
      localStorage.setItem("ts-walk-lesson-1", "done");
    } catch {}
  };
  const next = () => {
    if (++lesson >= 3) finish();
    else teach();
  };
  on(tip.firstElementChild, "click", next);
  on(tip.lastElementChild, "click", finish);
  on($("#repeat-lesson"), "click", () => {
    sheet.hidden = true;
    manualLesson = true;
    done = false;
    lesson = 0;
    teach();
  });
  const wake = () => {
    host.classList.remove("hud-rest");
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (details.hidden && sheet.hidden && panel.hidden && tip.hidden)
        host.classList.add("hud-rest");
    }, 4030);
  };
  on(host, "pointerdown", wake, { capture: true });
  on(
    host,
    "pointermove",
    (e) => {
      if (e.buttons) wake();
    },
    { capture: true },
  );
  on(host, "keydown", wake);
  on(host, "focusin", wake);
  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => (toastEl.hidden = true), 1990);
  }
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(msg("details.copied"));
    } catch {
      prompt(msg("details.copy"), text);
    }
  };
  const placeOpen = (open) => {
    details.hidden = !open;
    sheet.hidden = panel.hidden = true;
    $("#read-place").setAttribute("aria-expanded", String(open));
    api.cancel();
    if (open)
      details.querySelector(".read-close").focus({ preventScroll: true });
    else $("#world-menu").focus({ preventScroll: true });
    wake();
  };
  on($(".read-close"), "click", () => {
    placeOpen(false);
  });
  on($("#copy-plot"), "click", () => copy(lastPlot));
  function close() {
    details.hidden = panel.hidden = true;
    $("#read-place").setAttribute("aria-expanded", "false");
  }
  function renderCard() {
    panel.querySelector("small").textContent = api.classLabel(card.u);
    panel.querySelector("h3").textContent = card.name;
    panel.querySelector("p").textContent =
      api.district(card.d) +
      " · " +
      msg("details.plot", { code: card.x + "-" + card.y });
  }
  on(panel.querySelector(".dismiss"), "click", () => (panel.hidden = true));
  on(panel.querySelector(".walk"), "click", () => {
    panel.hidden = true;
    api.visit(card.u);
  });
  on(panel.querySelector(".share"), "click", async () => {
    if (location.hostname === "appassets.androidplatform.net") {
      location.href =
        "/_field/resident?name=" +
        encodeURIComponent(card.u) +
        "&label=" +
        encodeURIComponent(card.name);
      return;
    }
    const u = new URL(api.shareBase);
    u.hash = "/u/" + card.u;
    try {
      if (navigator.share)
        await navigator.share({
          title: msg("resident.shareTitle", { handle: card.name }),
          url: u.href,
        });
      else await copy(u.href);
    } catch (e) {
      if (e.name !== "AbortError") await copy(u.href);
    }
  });
  on($("#photo-start"), "click", () => {
    close();
    sheet.hidden = true;
    photo.hidden = false;
    tip.hidden = true;
    api.startPhoto();
    host.classList.add("photo-mode");
  });
  on($("#photo-exit"), "click", () => {
    photo.hidden = tuning.hidden = true;
    host.classList.remove("photo-mode");
    api.endPhoto();
    teach();
    wake();
  });
  on($("#photo-options"), "click", () => {
    tuning.hidden = !tuning.hidden;
    $("#photo-options").setAttribute("aria-expanded", String(!tuning.hidden));
  });
  on($("#photo-save"), "click", () => api.savePhoto());
  return {
    wake,
    close,
    toast,
    lesson(role) {
      if (
        !done &&
        ((lesson === 0 && role === "move") ||
          (lesson === 1 && role === "look") ||
          (lesson === 2 && role === "jump"))
      )
        next();
    },
    start() {
      started = false;
      close();
      teach();
      wake();
    },
    placed(row, d) {
      card = { u: row[2], name: houseLabel(row[5]), d, x: row[0], y: row[1] };
      renderCard();
      sheet.hidden = details.hidden = true;
      panel.hidden = false;
      $("#read-place").setAttribute("aria-expanded", "false");
      panel.querySelector(".dismiss").focus({ preventScroll: true });
      api.cancel();
      wake();
    },
    busy: () => !details.hidden || !panel.hidden,
    update(name, weather, did, surface, plot, raining) {
      const text = (e, t) => {
        if (e.textContent !== t) e.textContent = t;
      };
      text(chip.querySelector("span"), name);
      text(chip.querySelector("small"), weather);
      lastPlot = plot;
      started = true;
      lastD = did;
      lastSurface = surface;
      lastRain = raining;
    },
    dispose() {
      clearTimeout(timer);
      clearTimeout(idle);
    },
  };
}
