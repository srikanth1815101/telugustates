// Game UI system (Phase 1): HUD status cluster, hotbar, toasts, quest
// banner, tabbed screens (inventory / journal / market / build), title
// screen, gesture blocking and haptics. Presentation only — every rule
// lives in the life-sim modules; this file talks to them through
// globalThis.atlasLife and the interaction bus.
// @ts-check
import { url } from "./grid.js";
import { msg } from "./messages.js";
import { KIND_MODEL } from "../../tools/model-spec.mjs";

const SPRITE = url("icons/sprite.svg");
const ico = (id, cls = "ico") =>
  `<svg class="${cls}" aria-hidden="true"><use href="${SPRITE}#ico-${id}"></use></svg>`;

/**
 * Item icon: the baked 128px render of the item's GLB when one exists,
 * layered over the sprite glyph (the img removes itself if the PNG is
 * missing, leaving the sprite visible).
 * @param {string} kind
 */
const itemIcon = (kind) => {
  const spr = ico(KIND_ICON[kind] ?? "package");
  const model = KIND_MODEL[kind];
  if (!model) return spr;
  return `<span class="gs-i gs-baked">${spr}<img src="${url(
    `assets/icons/${model}.png`,
  )}" alt="" onerror="this.remove()"></span>`;
};

/** Inventory kind → sprite id. */
const KIND_ICON = {
  paddy: "wheat",
  rice: "wheat",
  ragi: "wheat",
  wheat: "wheat",
  chilli: "carrot",
  cotton: "package",
  vegetable: "carrot",
  seeds: "sow",
  fish: "fish",
  milk: "milk",
  egg: "egg",
  hay: "threshing",
  wood: "package",
  fodder: "wheat",
};

const TOOLS = [
  { id: "hoe", icon: "hoe", key: "game.tHoe" },
  { id: "seeds", icon: "sow", key: "game.tSeeds" },
  { id: "water", icon: "water", key: "game.tWater" },
  { id: "sickle", icon: "harvest", key: "game.tSickle" },
  { id: "rod", icon: "rod", key: "game.tRod" },
  { id: "hammer", icon: "build", key: "game.tHammer" },
];

const TABS = [
  { id: "inventory", icon: "backpack", key: "hud.inventory" },
  { id: "journal", icon: "journal", key: "hud.journal" },
  { id: "market", icon: "store", key: "hud.market" },
  { id: "build", icon: "build", key: "hud.build" },
];

const t = (id, args) => {
  try {
    return msg(id, args);
  } catch {
    return id;
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {HTMLElement} host #world section
 */
export function initGameUI(host) {
  if (document.getElementById("game-status")) return globalThis.__gameUI;

  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  host.insertAdjacentHTML(
    "beforeend",
    `<div id="game-status" hidden>
       <span class="gs-chip" id="hud-rupees" title="${t("hud.rupees")}">${ico("rupee")}<b>0</b></span>
       <span class="gs-chip" id="hud-day">${ico("calendar")}<b>—</b></span>
     </div>
     <div id="hotbar" hidden role="toolbar" aria-label="${t("hud.tools")}"></div>
     <div id="toast-stack" aria-live="polite"></div>
     <div id="quest-banner" hidden role="status"></div>
     <div id="title-screen" hidden>
       <div class="ts-card">
         <div class="ts-mark">${ico("compass", "ts-logo")}<span>Telugu&nbsp;States</span></div>
         <p class="ts-sub">${t("game.sub")}</p>
         <div class="ts-load"><i id="ts-bar"></i></div>
         <p class="ts-tip" id="ts-tip">${t("game.loading")}</p>
         <button type="button" id="title-play" class="ts-play" disabled>${ico("play")}<span>${t("game.play")}</span></button>
         <div class="ts-row">
           <button type="button" id="ts-settings" class="ts-icon" aria-label="${t("game.settings")}">${ico("settings")}</button>
           <button type="button" id="ts-credits" class="ts-icon" aria-label="${t("game.credits")}">${ico("info")}</button>
           <button type="button" id="ts-lang" class="ts-lang" data-lang-trigger>EN / తెలుగు</button>
         </div>
       </div>
     </div>
     <div id="game-screens" hidden>
       <div class="gs-panel" role="dialog" aria-modal="true" aria-label="${t("hud.hub")}">
         <header class="gs-head">
           <b id="gs-title">${t("hud.inventory")}</b>
           <button type="button" id="gs-close" class="gs-x" aria-label="${t("hud.closeMenu")}">${ico("close")}</button>
         </header>
         <nav class="gs-tabs" role="tablist"></nav>
         <div class="gs-body" id="gs-body"></div>
       </div>
     </div>`,
  );

  // ---- sprite is referenced externally; nothing to inline ---------------

  const $ = (sel) => host.querySelector(sel);
  const statusEl = /** @type {HTMLElement} */ ($("#game-status"));
  const hotbar = /** @type {HTMLElement} */ ($("#hotbar"));
  const toastStack = /** @type {HTMLElement} */ ($("#toast-stack"));
  const banner = /** @type {HTMLElement} */ ($("#quest-banner"));
  const title = /** @type {HTMLElement} */ ($("#title-screen"));
  const screens = /** @type {HTMLElement} */ ($("#game-screens"));
  const body = /** @type {HTMLElement} */ ($("#gs-body"));
  const tabsEl = /** @type {HTMLElement} */ ($(".gs-tabs"));

  // ---- hotbar ------------------------------------------------------------
  hotbar.innerHTML = TOOLS.map(
    (tool) =>
      `<button type="button" class="hb-slot" data-tool="${tool.id}" aria-pressed="false" aria-label="${t(tool.key)}" title="${t(tool.key)}">${ico(tool.icon)}</button>`,
  ).join("");
  let tool = "seeds";
  const setTool = (id) => {
    tool = id;
    for (const el of hotbar.querySelectorAll(".hb-slot"))
      el.setAttribute(
        "aria-pressed",
        String((/** @type {HTMLElement} */ (el).dataset.tool) === id),
      );
    navigator.vibrate?.(8);
  };
  hotbar.addEventListener("click", (e) => {
    const btn = /** @type {HTMLElement|null} */ (
      e.target.closest("[data-tool]")
    );
    if (!btn) return;
    if (btn.dataset.tool === "hammer") openScreen("build");
    else setTool(btn.dataset.tool);
  });
  setTool("seeds");

  // ---- tab bar -----------------------------------------------------------
  tabsEl.innerHTML = TABS.map(
    (tab, i) =>
      `<button type="button" role="tab" data-tab="${tab.id}" aria-selected="${i === 0}">${ico(tab.icon)}<span>${t(tab.key)}</span></button>`,
  ).join("");

  // ---- title screen ------------------------------------------------------
  let readyPoll = 0;
  const pollReady = () => {
    const snap = globalThis.atlasWalk?.snapshot?.();
    if (!snap) return false;
    const bar = /** @type {HTMLElement} */ ($("#ts-bar"));
    const tip = /** @type {HTMLElement} */ ($("#ts-tip"));
    const play = /** @type {HTMLButtonElement} */ ($("#title-play"));
    if (snap.ready) {
      if (bar) bar.style.width = "100%";
      if (tip) tip.textContent = t("game.ready");
      if (play) play.disabled = false;
      if (readyPoll) clearInterval(readyPoll);
      readyPoll = 0;
      return true;
    }
    if (bar) bar.style.width = `${Math.min(92, 20 + (snap.housesDrawn ?? 0))}%`;
    return false;
  };
  if (!pollReady()) readyPoll = window.setInterval(pollReady, 200);
  // Backstop: never leave Play disabled if the snapshot reports ready.
  window.setTimeout(() => {
    if (globalThis.atlasWalk?.snapshot?.()?.ready) pollReady();
  }, 1500);

  const dismissTitle = () => {
    title.classList.add("ts-out");
    setTimeout(() => {
      title.hidden = true;
      statusEl.hidden = false;
      hotbar.hidden = false;
    }, 320);
    localStorage.setItem("atlas-title-seen", "1");
    navigator.vibrate?.(12);
  };
  $("#title-play")?.addEventListener("click", dismissTitle);
  $("#ts-settings")?.addEventListener("click", () => {
    dismissTitle();
    setTimeout(() => q0("#world-menu")?.click(), 350);
  });
  $("#ts-credits")?.addEventListener("click", () => {
    const credits = document.querySelector('[data-open="credits"]');
    if (credits) credits.click();
    else window.open(url("library/CREDITS.html"), "_blank", "noopener");
  });
  $("#ts-lang")?.addEventListener("click", () => {
    document.querySelector("[data-lang]")?.click();
  });
  // First visit shows the title; a returning player drops in via Continue.
  const seen = localStorage.getItem("atlas-title-seen");
  title.hidden = false;
  if (seen) {
    // Still show it (Play acts as Continue) — the backdrop is the game.
  }

  // ---- screens -----------------------------------------------------------
  let open = /** @type {string|null} */ (null);

  function renderBody() {
    if (!open) return;
    if (open === "inventory") renderInventory();
    else if (open === "journal") renderJournal();
    else if (open === "market") renderMarket();
    else if (open === "build") renderBuild();
  }

  function openScreen(name) {
    open = name;
    screens.hidden = false;
    host.classList.add("ui-modal");
    for (const el of tabsEl.querySelectorAll("[data-tab]"))
      el.setAttribute(
        "aria-selected",
        String((/** @type {HTMLElement} */ (el).dataset.tab) === name),
      );
    const tab = TABS.find((x) => x.id === name);
    const titleEl = /** @type {HTMLElement} */ ($("#gs-title"));
    if (tab) titleEl.textContent = t(tab.key);
    renderBody();
    navigator.vibrate?.(8);
  }

  function closeScreens() {
    open = null;
    screens.hidden = true;
    host.classList.remove("ui-modal");
  }

  tabsEl.addEventListener("click", (e) => {
    const btn = /** @type {HTMLElement|null} */ (e.target.closest("[data-tab]"));
    if (btn?.dataset.tab) openScreen(btn.dataset.tab);
  });
  $("#gs-close")?.addEventListener("click", closeScreens);
  screens.addEventListener("click", (e) => {
    if (e.target === screens) closeScreens();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) closeScreens();
  });

  const life = () => globalThis.atlasLife;

  function renderInventory() {
    const L = life();
    const items = L?.inventory?.list?.() ?? [];
    body.innerHTML = items.length
      ? `<div class="gs-grid">${items
          .map(
            (/** @type {{kind: string, qty: number}} */ it) =>
              `<div class="gs-slot" title="${it.kind}">${itemIcon(
                it.kind,
              )}<b>${it.qty}</b><span>${it.kind}</span></div>`,
          )
          .join("")}</div>`
      : `<p class="gs-empty">${t("game.emptyInv")}</p>`;
  }

  function renderJournal() {
    const L = life();
    const defs = L?._questDefs ?? [];
    L?.status?.().then((/** @type {any} */ st) => {
      if (open !== "journal") return;
      const rows = Object.entries(st.quests ?? {}).map(
        /** @param {[string, any]} entry */ ([id, s]) => {
          const def = defs.find((/** @type {any} */ d) => d.id === id);
          const pct =
            s.state === "complete"
              ? 100
              : Math.min(
                  96,
                  ((s.step ?? 0) / Math.max(1, def?.steps?.length ?? 1)) * 100 +
                    (s.progress ?? 0) * 4,
                );
          return `<div class="gs-quest ${s.state}">
            <div class="gs-q-row"><span>${def?.title ?? id}</span><i>${t(
              `quest.${s.state}`,
            )}</i></div>
            <div class="gs-bar"><i style="width:${pct}%"></i></div>
          </div>`;
        },
      );
      body.innerHTML = rows.length
        ? rows.join("")
        : `<p class="gs-empty">${t("game.noQuests")}</p>`;
    });
  }

  function renderMarket() {
    const L = life();
    if (!L?.trading) {
      body.innerHTML = `<p class="gs-empty">${t("game.noQuests")}</p>`;
      return;
    }
    const day = Math.floor(Date.now() / 86400000);
    const offers = L.trading.offers(day);
    const rupees = L.economy?.rupees?.() ?? 0;
    body.innerHTML = `<div class="gs-money">${ico("rupee")}<b data-money>${rupees}</b></div>` +
      offers
        .map((/** @type {any} */ o, /** @type {number} */ i) => {
          const now = L.economy.price?.(o.kind, day);
          const prev = L.economy.price?.(o.kind, day - 1);
          const trend =
            now == null || prev == null || now === prev
              ? "flat"
              : now > prev
                ? "up"
                : "down";
          return `<div class="gs-offer">
            <span class="gs-o-ico">${itemIcon(o.kind)}</span>
            <span class="gs-o-txt">
              <b>${t(o.side === "buy" ? "game.oBuy" : "game.oSell", {
                qty: o.qty,
                kind: o.kind,
              })}</b>
              <small>${t("game.oAt", { price: o.price })} ${ico(
                trend === "up"
                  ? "trend-up"
                  : trend === "down"
                    ? "trend-down"
                    : "trend-flat",
                "ico-trend",
              )}</small>
            </span>
            <button type="button" class="gs-act" data-offer="${i}">${t(
              "game.go",
            )}</button>
          </div>`;
        })
        .join("");
  }

  function renderBuild() {
    const L = life();
    if (!L?.building) return;
    const structs = Object.entries(L.building.structures)
      .map(
        ([k, /** @type {any} */ d]) =>
          `<button type="button" class="gs-build" data-build="${k}">${ico(
            k === "threshing" ? "threshing" : k,
          )}<span>${t("game.st." + k)}</span><b>₹${d.cost}</b></button>`,
      )
      .join("");
    const herd = L.livestock
      ? `<div class="gs-offer"><span class="gs-o-ico">${ico("cow")}</span>
         <span class="gs-o-txt"><b>${t("game.herdCount", {
           n: L.livestock.animals.length,
         })}</b><small>${t("game.herdSub")}</small></span></div>`
      : `<div class="gs-offer"><span class="gs-o-ico">${ico("pen")}</span>
         <span class="gs-o-txt"><b>${t("game.buyPen")}</b><small>${t(
           "game.penSub",
         )}</small></span>
         <button type="button" class="gs-act" data-herd="1">₹30</button></div>`;
    const ride = L._vehicle
      ? `<div class="gs-offer"><span class="gs-o-ico">${ico("buggy")}</span>
         <span class="gs-o-txt"><b>${t("game.buggy")}</b><small>${t(
           "game.buggySub",
         )}</small></span>
         <button type="button" class="gs-act" data-drive="1">${
           L._drive ? t("game.exitDrive") : t("game.drive")
         }</button></div>`
      : `<div class="gs-offer"><span class="gs-o-ico">${ico("buggy")}</span>
         <span class="gs-o-txt"><b>${t("game.spawnBuggy")}</b><small>${t(
           "game.buggySub",
         )}</small></span>
         <button type="button" class="gs-act" data-ride="1">₹40</button></div>`;
    body.innerHTML =
      `<div class="gs-sec">${t("game.buildFeet")}</div><div class="gs-grid gs-builds">${structs}</div>` +
      `<div class="gs-sec">${t("hud.build")}</div>${herd}${ride}`;
  }

  // Action handlers — ported from the old Life modal (same data-* hooks).
  screens.addEventListener("click", async (e) => {
    const btn = /** @type {HTMLElement|null} */ (e.target.closest("button"));
    if (!btn) return;
    const L = life();
    if (!L) return;
    const at = L._motor?.() ?? { x: 0, y: 0 };
    try {
      if (btn.dataset.offer != null) {
        const day = Math.floor(Date.now() / 86400000);
        const offer = L.trading.offers(day)[Number(btn.dataset.offer)];
        const r = L.trading.execute(offer, day);
        toast(
          r.ok
            ? t("game.traded", { qty: offer.qty, kind: offer.kind, total: r.total })
            : t("game.tradeFail", { why: r.why }),
          "rupee",
        );
        if (r.ok) await L.persist();
      } else if (btn.dataset.build) {
        const g = L._grade(at.x, at.y);
        if (Math.hypot(g[0], g[1]) > 0.84) return toast(t("game.steep"), "info");
        const r = L.building.place(btn.dataset.build, at.x, at.y, 0);
        toast(
          r.ok
            ? t("game.built", { what: t("game.st." + btn.dataset.build) })
            : t("game.buildFail", { why: r.why }),
          "build",
        );
        if (r.ok) await L.persist();
      } else if (btn.dataset.herd) {
        if (!L.economy.spend(30, "pen").ok) return toast(t("game.poor"), "info");
        const p = 0.14;
        await L.spawnLivestock({
          minX: at.x - p,
          maxX: at.x + p,
          minZ: at.y - p,
          maxZ: at.y + p,
        });
        toast(t("game.penReady"), "cow");
        await L.persist();
      } else if (btn.dataset.ride) {
        if (!L.economy.spend(40, "buggy").ok) return toast(t("game.poor"), "info");
        await L.spawnVehicle();
        toast(t("game.buggyReady"), "buggy");
        await L.persist();
      } else if (btn.dataset.drive != null) {
        if (L._drive) L.exitVehicle?.();
        else if (!L.enterVehicle?.()) return toast(t("game.tooFar"));
        toast(L._drive ? t("game.driving") : t("game.hopped"), "buggy");
      } else return;
      renderBody();
    } catch (err) {
      console.warn("[game-ui]", err);
    }
  });

  // Backpack button in the pace panel opens the hub.
  const invBtn = document.createElement("button");
  invBtn.type = "button";
  invBtn.id = "inv-btn";
  invBtn.setAttribute("aria-label", t("hud.inventory"));
  invBtn.innerHTML = ico("backpack");
  $(".pace-panel")?.append(invBtn);
  invBtn.addEventListener("click", () =>
    open === "inventory" ? closeScreens() : openScreen("inventory"),
  );

  // ---- contextual action button rendering --------------------------------
  const farmBtn = /** @type {HTMLElement|null} */ ($("#farm-act"));
  const modeIcon = {
    drive: "buggy",
    sow: "sow",
    water: "water",
    harvest: "harvest",
    tend: "sprout",
    cast: "rod",
    reel: "fish",
    fishing: "fish",
  };
  const renderFarmBtn = () => {
    if (!farmBtn) return;
    const mode = farmBtn.dataset.mode || "";
    const key = farmBtn.dataset.key || "";
    if (!key) return;
    const sub = farmBtn.dataset.sub ? ` <i>${farmBtn.dataset.sub}</i>` : "";
    // NB: `.pace-panel span` is display:none in atlas.css — label uses <b>.
    const html = `${ico(modeIcon[mode] ?? "sprout")}<b>${t(key)}${sub}</b>`;
    if (farmBtn.dataset.rendered !== html) {
      farmBtn.innerHTML = html;
      farmBtn.dataset.rendered = html;
      farmBtn.classList.toggle("gs-fish", mode === "cast" || mode === "reel" || mode === "fishing");
    }
  };
  if (farmBtn) {
    new MutationObserver(renderFarmBtn).observe(farmBtn, {
      attributes: true,
      attributeFilter: ["data-mode", "data-key", "data-sub", "hidden", "disabled"],
    });
    renderFarmBtn();
  }

  // Sprint / jump buttons become icons (their data-msg text is replaced).
  for (const [id, iconId, key] of [
    ["#hop", "jump", "hud.jump"],
    ["#pace", "sprint", "hud.sprint"],
  ]) {
    const el = /** @type {HTMLElement|null} */ ($(id));
    if (!el) continue;
    el.removeAttribute("data-msg");
    el.innerHTML = ico(iconId);
    el.setAttribute("aria-label", t(key));
    el.title = t(key);
  }

  // ---- toasts ------------------------------------------------------------
  const notice = /** @type {HTMLElement|null} */ ($("#room-notice"));
  const iconFor = (text) => {
    const s = text.toLowerCase();
    if (s.includes("quest") || s.includes("sowing")) return "journal";
    if (s.includes("rupee") || s.includes("₹") || s.includes("traded")) return "rupee";
    if (s.includes("fish") || s.includes("caught")) return "fish";
    if (s.includes("built") || s.includes("steep")) return "build";
    if (s.includes("buggy") || s.includes("driv")) return "buggy";
    if (s.includes("animal") || s.includes("pen")) return "cow";
    if (s.includes("harvest")) return "harvest";
    if (s.includes("sow") || s.includes("sprout")) return "sow";
    if (s.includes("water")) return "water";
    return "info";
  };
  let lastToast = "";
  function toast(text, icon) {
    if (!text || text === lastToast) return;
    lastToast = text;
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `${ico(icon ?? iconFor(text))}<span></span>`;
    el.lastElementChild.textContent = text;
    toastStack.append(el);
    requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => {
      el.classList.remove("in");
      setTimeout(() => el.remove(), 300);
    }, 2600);
    while (toastStack.children.length > 3) toastStack.firstElementChild?.remove();
  }
  if (notice) {
    new MutationObserver(() => {
      const text = notice.textContent?.trim();
      if (text && text !== lastToast) toast(text);
    }).observe(notice, { childList: true, characterData: true, subtree: true });
  }

  // ---- quest banner ------------------------------------------------------
  const questStates = new Map();
  let bannerTimer = 0;
  function showBanner(text) {
    banner.hidden = false;
    banner.innerHTML = `${ico("check")}<span></span>`;
    banner.lastElementChild.textContent = text;
    banner.classList.remove("out");
    clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => {
      banner.classList.add("out");
      setTimeout(() => (banner.hidden = true), 400);
    }, 3200);
    navigator.vibrate?.([16, 40, 16]);
  }
  banner.addEventListener("click", () => {
    banner.hidden = true;
    openScreen("journal");
  });

  // ---- status tick -------------------------------------------------------
  let shownRupees = 0;
  let tickTimer = 0;
  let lastLang = document.documentElement.lang;
  function refreshLang() {
    tabsEl.innerHTML = TABS.map(
      (tab, i) =>
        `<button type="button" role="tab" data-tab="${tab.id}" aria-selected="${
          open === tab.id || (!open && i === 0)
        }">${ico(tab.icon)}<span>${t(tab.key)}</span></button>`,
    ).join("");
    hotbar.querySelectorAll(".hb-slot").forEach((el) => {
      const toolDef = TOOLS.find((x) => x.id === el.dataset.tool);
      if (toolDef) {
        el.setAttribute("aria-label", t(toolDef.key));
        el.title = t(toolDef.key);
      }
    });
    invBtn.setAttribute("aria-label", t("hud.inventory"));
    delete farmBtn?.dataset.rendered;
    renderFarmBtn();
    if (open) renderBody();
  }
  async function tick() {
    const L = life();
    if (!L) return;
    if (document.documentElement.lang !== lastLang) {
      lastLang = document.documentElement.lang;
      refreshLang();
    }
    try {
      if (!L.economy) await L.ready();
      const rupees = L.economy?.rupees?.() ?? 0;
      const money = /** @type {HTMLElement} */ ($("#hud-rupees b"));
      if (money && rupees !== shownRupees) {
        const from = shownRupees;
        const delta = rupees - from;
        const t0 = performance.now();
        const step = (/** @type {number} */ now) => {
          const k = Math.min(1, (now - t0) / 450);
          money.textContent = String(Math.round(from + delta * k));
          if (k < 1) requestAnimationFrame(step);
          else {
            shownRupees = rupees;
            if (delta > 0) {
              $("#hud-rupees")?.classList.add("pop");
              setTimeout(() => $("#hud-rupees")?.classList.remove("pop"), 350);
            }
          }
        };
        requestAnimationFrame(step);
      }
      const day = L._day?.() ?? Math.floor(Date.now() / 86400000);
      const dayEl = /** @type {HTMLElement} */ ($("#hud-day b"));
      if (dayEl) dayEl.textContent = String(day);

      // Normalise the world-written weather/clock chips to sprite icons.
      const weather = /** @type {HTMLElement|null} */ ($("#weather-now"));
      if (weather && weather.textContent && !weather.dataset.ico) {
        const raw = weather.textContent;
        const map = [
          ["Clear", "sun"],
          ["Cloud", "cloud"],
          ["rain", "rain"],
          ["Drizzle", "rain"],
          ["Wind", "wind"],
        ];
        const hit = map.find(([k]) => raw.includes(k));
        if (hit) {
          weather.dataset.ico = "1";
          weather.innerHTML = `${ico(hit[1])}<span></span>`;
          weather.lastElementChild.textContent = raw;
        } else weather.dataset.ico = "1";
      }
      const clock = /** @type {HTMLElement|null} */ ($("#clock-now"));
      if (clock && !clock.dataset.ico) {
        clock.dataset.ico = "1";
        clock.innerHTML = `${ico("clock")}<span></span>`;
        clock.lastElementChild.textContent = clock.textContent ?? "";
      }

      // Quest completion → banner (once per transition).
      const st = await L.status();
      for (const [id, q] of Object.entries(st.quests ?? {})) {
        const prev = questStates.get(id);
        questStates.set(id, q.state);
        if (prev && prev !== "complete" && q.state === "complete") {
          const def = (L._questDefs ?? []).find((/** @type {any} */ d) => d.id === id);
          showBanner(`${t("game.questDone")} — ${def?.title ?? id}`);
        }
      }
      if (open) renderBody();
    } catch (e) {
      console.warn("[game-ui tick]", e);
    }
  }
  const startTick = () => {
    if (tickTimer) return;
    tick();
    tickTimer = window.setInterval(tick, 1500);
  };
  stopTickWhenHidden();
  function stopTickWhenHidden() {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        clearInterval(tickTimer);
        tickTimer = 0;
      } else startTick();
    });
    startTick();
  }

  // ---- gesture blocking + haptics ----------------------------------------
  host.addEventListener("contextmenu", (e) => e.preventDefault());
  host.addEventListener("dblclick", (e) => e.preventDefault());
  for (const ev of ["gesturestart", "gesturechange", "gestureend"])
    host.addEventListener(ev, (e) => e.preventDefault());
  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest?.("#world button");
      if (btn) navigator.vibrate?.(8);
    },
    { capture: true },
  );

  const api = {
    openScreen,
    closeScreens,
    setTool: (/** @type {string} */ id) => setTool(id),
    toast,
    dismissTitle,
    get tool() {
      return tool;
    },
    get screen() {
      return open;
    },
  };
  // Async view of everything the e2e asserts on.
  api.snapshot = async () => {
    const L = life();
    const day = Math.floor(Date.now() / 86400000);
    const st = L ? await L.status() : {};
    return {
      screen: open,
      tool,
      rupees: L?.economy?.rupees?.() ?? 0,
      offers: L?.trading?.offers?.(day)?.length ?? 0,
      builds: L?.building ? Object.keys(L.building.structures).length : 0,
      quests: Object.keys(st.quests ?? {}).length,
      questStates: st.quests ?? {},
      inventory: L?.inventory?.list?.().length ?? 0,
      titleVisible: !title.hidden,
      menuBtn: !!invBtn,
    };
  };
  globalThis.__gameUI = api;
  return api;
}

const CSS = `
#game-status{position:absolute;top:calc(var(--pad-t,12px) + 60px);left:calc(var(--pad-l,12px));z-index:4;display:flex;flex-direction:column;gap:6px;pointer-events:none;font-family:var(--body)}
#game-status .gs-chip{display:inline-flex;align-items:center;gap:6px;background:#fdf7e9ef;border:1px solid #ffffffc4;box-shadow:0 3px 12px #15372130;border-radius:999px;padding:5px 11px;color:#194328;font:700 13px var(--body);width:max-content}
#game-status .ico{width:16px;height:16px;color:#ad4817}
#game-status .gs-chip.pop{animation:gs-pop .35s ease}
@keyframes gs-pop{40%{transform:scale(1.14)}}
#hotbar{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(var(--pad-b,12px) + 14px);z-index:4;display:flex;gap:6px;padding:6px;background:#183e2633;border-radius:999px;backdrop-filter:blur(4px)}
#hotbar .hb-slot{width:46px;height:46px;border-radius:50%;border:1.5px solid #ffffff88;background:#fdf7e9e6;color:#194328;display:grid;place-items:center;box-shadow:0 2px 8px #15372130;transition:transform .12s ease,background .12s ease}
#hotbar .hb-slot .ico{width:22px;height:22px}
#hotbar .hb-slot[aria-pressed=true]{background:#1b4f29;color:#fcf2da;transform:translateY(-4px);border-color:#fcf2da}
#hotbar .hb-slot:active{transform:scale(.94)}
@media (max-height:490px){#hotbar{bottom:calc(var(--pad-b,8px) + 6px)}#hotbar .hb-slot{width:40px;height:40px}}
#toast-stack{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(var(--pad-b,12px) + 78px);z-index:7;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none;width:max-content;max-width:86vw}
.toast{display:flex;gap:8px;align-items:center;background:#173b22f2;color:#f6f1e3;border:1px solid #ffffff2e;border-radius:12px;padding:8px 14px;font:600 13px var(--body);box-shadow:0 6px 18px #0e251640;opacity:0;transform:translateY(8px);transition:opacity .25s ease,transform .25s ease;max-width:100%}
.toast.in{opacity:1;transform:none}
.toast .ico{width:18px;height:18px;flex:none;color:#f0c36a}
.toast span{overflow-wrap:anywhere}
#quest-banner{position:absolute;top:calc(var(--pad-t,12px) + 64px);left:50%;transform:translateX(-50%);z-index:8;display:flex;gap:10px;align-items:center;background:linear-gradient(135deg,#ad4817,#c76a2b);color:#fff8ec;border-radius:14px;padding:10px 18px;font:700 14px var(--body);box-shadow:0 8px 24px #15372150;cursor:pointer;animation:gs-slide .35s ease;max-width:88vw}
#quest-banner.out{animation:gs-slide-out .4s ease forwards}
#quest-banner .ico{width:20px;height:20px}
@keyframes gs-slide{from{opacity:0;transform:translate(-50%,-14px)}}
@keyframes gs-slide-out{to{opacity:0;transform:translate(-50%,-14px)}}
#title-screen{position:absolute;inset:0;z-index:9;display:grid;place-items:center;background:linear-gradient(180deg,#0e251622 0%,#0e251611 40%,#0e2516bb 100%);transition:opacity .32s ease}
#title-screen.ts-out{opacity:0;pointer-events:none}
.ts-card{text-align:center;color:#f9f4e6;padding:24px;width:min(340px,88%)}
.ts-mark{display:flex;gap:10px;align-items:center;justify-content:center;font:600 30px/1 var(--head);text-shadow:0 3px 14px #0e251699}
.ts-logo{width:34px;height:34px;color:#f0c36a}
.ts-sub{font:600 13px var(--body);opacity:.86;margin:10px 0 18px;letter-spacing:.04em}
.ts-load{height:6px;border-radius:6px;background:#ffffff30;overflow:hidden}
.ts-load i{display:block;height:100%;width:8%;background:linear-gradient(90deg,#f0c36a,#ad4817);transition:width .4s ease;border-radius:6px}
.ts-tip{font:600 11px var(--body);opacity:.75;min-height:16px;margin:8px 0 18px}
.ts-play{display:inline-flex;gap:10px;align-items:center;justify-content:center;min-height:52px;padding:0 34px;border-radius:999px;border:0;background:#ad4817;color:#fff8ec;font:700 17px var(--body);box-shadow:0 8px 22px #0e251666;cursor:pointer;transition:transform .12s ease}
.ts-play .ico{width:20px;height:20px}
.ts-play:active{transform:scale(.96)}
.ts-play:disabled{opacity:.55;cursor:wait}
.ts-row{display:flex;gap:10px;justify-content:center;align-items:center;margin-top:18px}
.ts-icon{width:46px;height:46px;border-radius:50%;border:1px solid #ffffff44;background:#ffffff1f;color:#f9f4e6;display:grid;place-items:center;cursor:pointer}
.ts-icon .ico{width:20px;height:20px}
.ts-lang{min-height:46px;border-radius:999px;border:1px solid #ffffff44;background:#ffffff1f;color:#f9f4e6;font:700 12px var(--body);padding:0 14px;cursor:pointer}
#game-screens{position:absolute;inset:0;z-index:8;background:#0e251666;display:grid;place-items:end center;padding:0}
#game-screens .gs-panel{width:min(520px,100%);max-height:82dvh;display:flex;flex-direction:column;background:#fdf7e9;border-radius:18px 18px 0 0;box-shadow:0 -8px 32px #0e251655;animation:gs-up .22s ease;overscroll-behavior:contain}
@keyframes gs-up{from{transform:translateY(40px);opacity:0}}
.gs-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px 6px}
.gs-head b{font:600 18px var(--head);color:#194328}
.gs-x{width:40px;height:40px;border-radius:50%;border:0;background:#19432812;color:#194328;display:grid;place-items:center;cursor:pointer}
.gs-x .ico{width:18px;height:18px}
.gs-tabs{display:flex;gap:4px;padding:6px 12px 10px;border-bottom:1px solid #d9e2d4}
.gs-tabs button{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 2px;border:0;background:transparent;border-radius:12px;color:#3c5a45;font:700 10px var(--body);cursor:pointer;min-height:48px}
.gs-tabs button .ico{width:20px;height:20px}
.gs-tabs button[aria-selected=true]{background:#1b4f29;color:#fdf6e3}
.gs-body{padding:12px 14px calc(18px + env(safe-area-inset-bottom));overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.gs-empty{opacity:.6;font:600 13px var(--body);text-align:center;padding:26px 0}
.gs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:8px}
.gs-baked{position:relative;display:block}
.gs-baked img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none}
.gs-slot{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;background:#f3efe0;border:1px solid #e3ddc8;border-radius:12px;padding:10px 4px 7px;color:#194328;font:600 11px var(--body);min-height:76px}
.gs-slot .ico{width:26px;height:26px;color:#ad4817}
.gs-slot b{position:absolute;top:4px;right:7px;font:700 11px var(--body);color:#1b4f29}
.gs-slot span{opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.gs-money{display:flex;gap:8px;align-items:center;font:700 16px var(--body);color:#194328;margin-bottom:10px}
.gs-money .ico{width:20px;height:20px;color:#ad4817}
.gs-offer{display:flex;gap:10px;align-items:center;background:#f6f2e3;border:1px solid #e6e0cc;border-radius:14px;padding:10px 12px;margin-bottom:8px}
.gs-o-ico{width:38px;height:38px;border-radius:10px;background:#fffdf4;display:grid;place-items:center;flex:none;border:1px solid #eae4d0}
.gs-o-ico .ico{width:22px;height:22px;color:#ad4817}
.gs-o-txt{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
.gs-o-txt b{font:700 13.5px var(--body);color:#194328}
.gs-o-txt small{display:flex;gap:6px;align-items:center;font:600 12px var(--body);color:#647268}
.ico-trend{width:14px;height:14px}
.gs-act{min-height:40px;padding:0 16px;border-radius:999px;border:0;background:#ad4817;color:#fff8ec;font:700 13px var(--body);cursor:pointer;transition:transform .12s ease}
.gs-act:active{transform:scale(.95)}
.gs-sec{font:700 10px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:#647268;margin:12px 0 8px}
.gs-builds{grid-template-columns:repeat(auto-fill,minmax(96px,1fr))}
.gs-build{display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 6px;border-radius:14px;border:1px solid #e3ddc8;background:#f6f2e3;color:#194328;font:700 11px var(--body);cursor:pointer;min-height:86px;transition:transform .12s ease}
.gs-build .ico{width:26px;height:26px;color:#1b4f29}
.gs-build b{color:#ad4817}
.gs-build:active{transform:scale(.95)}
.gs-quest{background:#f6f2e3;border:1px solid #e6e0cc;border-radius:12px;padding:10px 12px;margin-bottom:8px}
.gs-q-row{display:flex;justify-content:space-between;font:700 13px var(--body);color:#194328;margin-bottom:6px}
.gs-q-row i{font-style:normal;font:700 11px var(--body);text-transform:uppercase;letter-spacing:.05em;color:#647268}
.gs-quest.complete .gs-q-row i{color:#1b7a3e}
.gs-bar{height:6px;background:#e7e1cd;border-radius:6px;overflow:hidden}
.gs-bar i{display:block;height:100%;background:linear-gradient(90deg,#4c8b3f,#8fbf5a);border-radius:6px;transition:width .4s ease}
#inv-btn{min-width:48px;min-height:48px;border-radius:24px;border:1px solid #ffffffc4;background:#fdf7e9e6;color:#194328;display:grid;place-items:center;box-shadow:0 3px 12px #15372130;cursor:pointer}
#inv-btn .ico{width:22px;height:22px}
/* Bottom layout: joystick left, tools centre, actions stacked right so
   the hotbar never covers the contextual button. */
#world .pace-panel{flex-direction:column;align-items:flex-end;gap:8px;bottom:calc(var(--pad-b,12px) + 84px);right:calc(var(--pad-r,12px) + 8px)}
#world .pace-panel #farm-act{order:-1;min-width:72px;min-height:54px;border-radius:999px;background:#1b4f29;color:#fdf6e3;border:1px solid #ffffffd0;font:700 13px var(--body);display:inline-flex;gap:6px;align-items:center;justify-content:center;padding:4px 14px}
#world .pace-panel #farm-act .ico{width:20px;height:20px}
#world .pace-panel #farm-act.gs-fish{background:#2d5f7c}
#world .pace-panel #farm-act i{font-style:normal;opacity:.85;font-size:11px}
@media (max-height:490px){
  #world .pace-panel{flex-direction:row;align-items:center;bottom:calc(var(--pad-b,8px) + 6px);right:calc(var(--pad-r,8px) + 6px)}
  #hotbar{left:172px;transform:none}
}
#world button{transition:transform .12s ease}
#world button:active:not(:disabled){transform:scale(.96)}
#use-door{gap:8px;border-radius:999px;padding:8px 14px;background:#ad4817!important;color:#fff8ec!important;border:0!important}
#use-door .ico,#use-door svg{width:20px;height:20px}
#world{overscroll-behavior:none;-webkit-touch-callout:none;user-select:none}
#game-screens,#title-screen{user-select:none;touch-action:pan-y}
#game-screens button,#title-screen button{touch-action:manipulation}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}
}
`;
