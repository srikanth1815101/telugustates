import { readPosition } from "./position-book.js";
import { get, url, Tiles, key } from "./grid.js";
import { loadMessages, bindMessages, msg } from "./messages.js";
import { mountMap } from "./map.js";
import { mountTreasury } from "./treasury-view.js";
import { initAppSync } from "./app-sync.js";
import {
  houseLabel,
  isResidentId,
  normalizeUsername,
  readStoredResidentId,
  residentId,
  shardKey,
  writeStoredResidentId,
} from "./resident-id.js";
const $ = (s) => document.querySelector(s),
  home = $("#public-home"),
  dlg = $("#dialog"),
  tell = (e, text) => {
    if (e) {
      e.hidden = !text;
      e.textContent = text;
    }
  },
  // Shown when a lookup finds nothing, so the way to earn a house is in plain
  // sight rather than buried in an error line. Hidden again on any success.
  join = (show) => {
    const card = $("#join-card");
    if (!card) return;
    // Data-msg fills the static panel on boot; if a translation is ever
    // missing, leave it hidden rather than throwing inside the form handler.
    if (show) {
      try {
        bindMessages(card);
      } catch {
        return;
      }
    }
    card.hidden = !show;
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
let stateFilter = "all",
  districtQuery = "";
function renderDistrictBoard() {
  const grid = $("#district-grid");
  if (!grid || !a?.districts) return;
  const searchInput = $("#district-search");
  if (searchInput) searchInput.placeholder = msg("home.districtFilter");
  // The tabs carry house counts, not district counts: the directory counts
  // houses, and "Telangana (33)" above a board of house tallies reads as a
  // house figure. Summed from the same per-district counts the rows use, so
  // each tab agrees with the badges underneath it.
  const tgHomes = a.districts
      .filter((d) => d.state === "Telangana")
      .reduce((n, d) => n + (Number(d.count) || 0), 0),
    apHomes = a.districts
      .filter((d) => d.state !== "Telangana")
      .reduce((n, d) => n + (Number(d.count) || 0), 0),
    allHomes = tgHomes + apHomes,
    maxCount = Math.max(1, ...a.districts.map((d) => d.count || 0)),
    tally = (n) =>
      n === 1 ? msg("home.oneHouse") : msg("home.districtCount", { n });
  const summary = $("#district-summary");
  if (summary) summary.textContent = msg("home.districtSummary");
  for (const btn of document.querySelectorAll("[data-state-filter]")) {
    const f = btn.dataset.stateFilter;
    btn.setAttribute("aria-selected", String(f === stateFilter));
    btn.textContent =
      f === "all"
        ? `${msg("home.statesAll")} (${tally(allHomes)})`
        : f === "Telangana"
          ? `${msg("geo.tg")} (${tally(tgHomes)})`
          : `${msg("geo.ap")} (${tally(apHomes)})`;
  }
  const q = districtQuery.trim().toLowerCase(),
    items = [...a.districts]
      .filter((d) => {
        if (stateFilter !== "all" && d.state !== stateFilter) return false;
        if (!q) return true;
        return (
          d.name.toLowerCase().includes(q) ||
          (d.te && d.te.toLowerCase().includes(q))
        );
      })
      .sort(
        (x, y) =>
          Number(y.count || 0) - Number(x.count || 0) ||
          x.name.localeCompare(y.name),
      );
  grid.replaceChildren();
  for (const d of items) {
    const cnt = d.count || 0,
      row = document.createElement("button");
    row.type = "button";
    row.className = "district-item" + (cnt > 0 ? " has-houses" : " is-empty");
    row.setAttribute("role", "listitem");
    row.style.setProperty(
      "--share",
      `${cnt > 0 ? Math.max(8, Math.round((cnt / maxCount) * 100)) : 0}%`,
    );
    const top = document.createElement("div");
    top.className = "district-item-top";
    const nameEl = document.createElement("strong");
    nameEl.textContent = tr(d.name, d.te || d.name);
    const badge = document.createElement("span");
    badge.className = "district-count";
    badge.textContent =
      cnt === 1 ? msg("home.oneHouse") : msg("home.districtCount", { n: cnt });
    top.append(nameEl, badge);
    const meta = document.createElement("div");
    meta.className = "district-item-meta";
    const st = document.createElement("small");
    st.textContent = msg(d.state === "Telangana" ? "geo.tg" : "geo.ap");
    const bar = document.createElement("i");
    bar.className = "district-bar";
    meta.append(st, bar);
    row.append(top, meta);
    row.onclick = () => {
      if (Array.isArray(d.label) && d.label.length >= 2) {
        map?.focusPoint(d.label[0], d.label[1], 320);
        $("#atlas-chart")?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    };
    grid.append(row);
  }
}
document.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-state-filter]");
  if (tab) {
    stateFilter = tab.dataset.stateFilter;
    renderDistrictBoard();
  }
});
$("#district-search")?.addEventListener("input", (e) => {
  districtQuery = e.target.value || "";
  renderDistrictBoard();
});
$("#hero-find-btn")?.addEventListener("click", () => {
  const card = $("#find-card-section");
  card?.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => {
    const saved = $("#saved-home-box");
    const target =
      saved && !saved.hidden ? $("#go-saved-home") : $("#handle");
    target?.focus({ preventScroll: true });
  }, 320);
});
$("#hero-map-btn")?.addEventListener("click", () => {
  $("#atlas-chart")?.scrollIntoView({ behavior: "smooth", block: "center" });
});
function paint() {
  if (!home) return;
  const fmt = new Intl.NumberFormat(lang === "te" ? "te-IN" : "en-IN");
  for (const [k, sel] of [
    ["food", "#res-food"],
    ["currency", "#res-currency"],
    ["gold", "#res-gold"],
  ]) {
    const node = $(sel);
    if (node) node.textContent = fmt.format(a.resources?.[k] ?? 0);
  }
  if (a.home) {
    const t = $("#home-title"),
      p = $("#home-intro");
    if (t && a.home.title) {
      t.dataset.en = esc(a.home.title) + "<span>.</span>";
      if (a.home.title_te)
        t.dataset.te = esc(a.home.title_te) + "<span>.</span>";
      t.innerHTML = lang === "te" ? t.dataset.te : t.dataset.en;
    }
    if (p && a.home.intro) {
      p.dataset.en = esc(a.home.intro);
      if (a.home.intro_te) p.dataset.te = esc(a.home.intro_te);
      p.innerHTML = lang === "te" ? p.dataset.te : p.dataset.en;
    }
  }
  renderDistrictBoard();
  document.dispatchEvent(new Event("living:home-painted"));
}
let activeDialogTab = "";
function dialogDocs() {
  const isTe = lang === "te";
  const houseTotal = directory.length || 0;
  const distTotal = a?.districts?.length || 61;
  return {
    guide: {
      tab: isTe ? "ఎలా పనిచేస్తుంది" : "How It Works",
      title: isTe
        ? "మన తెలుగు రాష్ట్రాలను మన శైలిలో నిర్మిద్దాం"
        : "How Telugu States Works",
      lead: isTe
        ? "ప్రతి ఫాలోవర్‌కు ఒక వర్చువల్ ఇల్లు మరియు 1 ఎకరం భూమి లభిస్తుంది — మరియు మన కమ్యూనిటీ వనరులతో ప్రపంచం అభివృద్ధి చెందుతుంది."
        : "Every follower gets a virtual village home and 1 acre of land — and community resources help develop our shared 3D world.",
      cards: [
        {
          pill: isTe ? "1 · ఇల్లు & 1 ఎకరం భూమి" : "1 · 1 Home + 1 Acre Plot",
          heading: isTe
            ? "ప్రతి ఫాలోవర్‌కు వర్చువల్ ఇల్లు"
            : "Every follower gets a home & 1 acre",
          items: isTe
            ? [
                "అధికారిక పేజీని అనుసరించి నమోదైన ప్రతి సభ్యుడికి తమ జిల్లాలో ఒక 3D వర్చువల్ పల్లె ఇల్లు మరియు 1 ఎకరం పొలం కేటాయించబడుతుంది.",
                "మీ ఇన్‌స్టాగ్రామ్ పేరును ఒక్కసారి నమోదు చేస్తే చాలు — మీ పరికరంలో ఏకముఖ ఐడి సేవ్ అవుతుంది, మళ్లీ మళ్లీ అడగదు మరియు ఇతరుల ఇళ్లను ఎంచుకోలేరు.",
                `ప్రస్తుతం ${distTotal} జిల్లాల్లో ${houseTotal} వర్చువల్ ఇళ్లు సిద్ధంగా ఉన్నాయి.`
              ]
            : [
                "Every follower who joins gets a stylized 3D village home and a connected 1-acre plot inside their chosen district.",
                "Enter your Instagram username once — its one-way ID is stored locally in your app/browser so you never have to type it again, and no one can select another person’s home.",
                `Currently ${houseTotal} virtual homes are settled across ${distTotal} mapped districts.`
              ],
        },
        {
          pill: isTe ? "2 · ఉమ్మడి వనరులు" : "2 · Community Resources",
          heading: isTe
            ? "1 లైక్ = 1 ఆహారం · 1 కామెంట్ = 1 నాణెం · 1 షేర్ = 1 బంగారం"
            : "1 Like = 1 Food · 1 Comment = 1 Currency · 1 Share = 1 Gold",
          items: isTe
            ? [
                "అధికారిక పోస్టులపై వచ్చే ధృవీకరించిన లైక్‌లు ఆహారాన్ని, కామెంట్లు నాణేలను, షేర్లు బంగారాన్ని పెంచుతాయి.",
                "ఈ వర్చువల్ వనరులు మన తెలుగు రాష్ట్రాల 3D ప్రపంచంలో కొత్త నిర్మాణాలు, సదుపాయాలు, అభివృద్ధి పనుల కోసం ఉపయోగపడతాయి.",
                "ఇవి కేవలం వినోద కమ్యూనిటీ పాయింట్లు మాత్రమే — నిజమైన డబ్బు లేదా ఆర్థిక విలువ కాదు."
              ]
            : [
                "Verified engagement on official community posts adds shared resources: 1 like = 1 Food, 1 comment = 1 Currency, and 1 share = 1 Gold.",
                "Shared Food, Currency, and Gold unlock new community landmarks, upgrades, and world development across both states.",
                "Resources are purely fictional world-building counters with zero monetary or real-world value."
              ],
        },
        {
          pill: isTe ? "3 · 3D ప్రపంచ అన్వేషణ" : "3 · Explore Freely in 3D",
          heading: isTe
            ? "పటంపై జూమ్ చేసి నడవండి"
            : "Zoom into the map & walk anywhere",
          items: isTe
            ? [
                "ప్రాంతీయ పటంపై ఎక్కడైనా జూమ్ చేసి కొండలు, నదులు, అడవులు, పల్లెలను 3Dలో స్వేచ్ఛగా అన్వేషించవచ్చు.",
                "3Dలో 'నా ఇల్లు' లేదా 'నా ఎకరం' బటన్ నొక్కి మీ సొంత ఇంటికి నడిచి వెళ్లవచ్చు లేదా నేరుగా వెళ్లవచ్చు."
              ]
            : [
                "Pinch or scroll anywhere on the map of Telangana and Andhra Pradesh to descend into the 3D terrain and explore rivers, hills, forests, and villages freely.",
                "Tap My Home or My Acre in 3D to walk along the village footpath or teleport straight to your own plot."
              ],
        },
      ],
    },
    about: {
      tab: isTe ? "వివరాలు" : "About",
      title: isTe ? "తెలుగు రాష్ట్రాలు · ప్రాజెక్ట్ వివరాలు" : "About Telugu States by CSRGO",
      lead: isTe
        ? "తెలంగాణ మరియు ఆంధ్రప్రదేశ్ భౌగోళిక స్వరూపంతో రూపొందించిన స్వతంత్ర, కాల్పనిక 3D కమ్యూనిటీ ప్రపంచం."
        : "An independent, interactive 3D fictional community landscape inspired by the geography of Telangana and Andhra Pradesh.",
      cards: [
        {
          pill: isTe ? "భౌగోళిక డేటా vs కల్పన" : "Open Geography vs Fiction",
          heading: isTe
            ? "నిజమైన భౌగోళిక ఎత్తులు — కాల్పనిక 3D పల్లెలు"
            : "Real terrain relief, fictional 3D villages",
          items: isTe
            ? [
                "రాష్ట్ర, జిల్లా సరిహద్దులు, ఎత్తులు, నదులు బహిరంగ భౌగోళిక డేటా నుండి తీసుకోబడ్డాయి.",
                "ఇళ్లు, వీధులు, పొలాలు, చెట్లు, వాతావరణం పూర్తిగా కంప్యూటర్ ద్వారా సృష్టించిన 3D కళాత్మక అనుకరణలు మాత్రమే — అసలు నివాసాలు లేదా చిరునామాలు కావు."
              ]
            : [
                "District boundaries, terrain elevations, and major waterways are derived from open public geographic data.",
                "All village streets, houses, courtyards, crops, trees, wildlife, and weather are procedural 3D artwork — not real addresses, real buildings, or real land parcels."
              ],
        },
        {
          pill: isTe ? "స్వతంత్ర వేదిక" : "Independent & Transparent",
          heading: isTe
            ? "స్పామ్ లేని, పారదర్శక వినోద వేదిక"
            : "Zero spam, zero fees, pure entertainment",
          items: isTe
            ? [
                "ఇది పూర్తిగా ఉచిత వినోద ప్రాజెక్ట్. ఇందులో ఎటువంటి రుసుములు, పెట్టుబడులు, బెట్టింగ్ లేదా లాటరీలు లేవు.",
                "Instagram / Meta లేదా ఏ ప్రభుత్వ సంస్థతోనూ ఈ ప్రాజెక్ట్‌కు ఎటువంటి అధికారిక సంబంధం లేదు."
              ]
            : [
                "Participation is 100% free with no payments, purchases, tokens, sweepstakes, or commercial solicitation.",
                "Independent creator project by CSRGO — not affiliated with, endorsed by, or sponsored by Instagram, Meta, or any government body."
              ],
        },
      ],
    },
    legal: {
      tab: isTe ? "నిబంధనలు & వివరణ" : "Legal & Disclaimer",
      title: isTe
        ? "చట్టపరమైన వివరణ & నిష్పక్షపాత ప్రకటన"
        : "Legal Disclaimer & Neutrality Notice",
      lead: isTe
        ? "ఈ వెబ్‌సైట్ మరియు ఆండ్రాయిడ్ యాప్ కేవలం వినోదం కోసం మాత్రమే రూపొందించబడ్డాయి."
        : "This website and Android application are created strictly for harmless entertainment and artistic simulation.",
      cards: [
        {
          pill: isTe ? "వినోదం మాత్రమే" : "Entertainment Only",
          heading: isTe
            ? "భూమి హక్కులు లేదా ఆర్థిక విలువ కాదు"
            : "Not real land ownership or money",
          items: isTe
            ? [
                "ఇక్కడి 'ఇల్లు', '1 ఎకరం భూమి', 'ఆహారం', 'నాణేలు', 'బంగారం' అన్నీ పూర్తిగా కాల్పనిక డిజిటల్ ఆట అంశాలు మాత్రమే.",
                "ఇవి ఎటువంటి చట్టపరమైన భూ యాజమాన్యం, సర్వే హక్కులు, డబ్బు, క్రిప్టో లేదా ఆర్థిక విలువను కల్పించవు."
              ]
            : [
                "Every 'home', '1 acre plot', 'Food', 'Currency', and 'Gold' counter is 100% fictional digital illustration inside an entertainment world.",
                "Nothing here constitutes real property title, cadastral claim, legal ownership, currency, financial instrument, or redeemable value."
              ],
        },
        {
          pill: isTe ? "పూర్తి నిష్పక్షపాతం" : "Strict Neutrality",
          heading: isTe
            ? "మతం, కులం, రాజకీయాలకు అతీతం"
            : "No religion, caste, or political representation",
          items: isTe
            ? [
                "ఈ ప్రాజెక్ట్ ఏ మతం, కులం, వర్గం, రాజకీయ పార్టీ, రాజకీయ నాయకులు లేదా ప్రభుత్వ సంస్థకు ప్రాతినిధ్యం వహించదు మరియు ఎవరినీ ప్రోత్సహించదు.",
                "రాష్ట్రాలు, జిల్లాలు, నదుల పేర్లు కేవలం భౌగోళిక పరిచయం కోసం మాత్రమే ఉపయోగించబడ్డాయి."
              ]
            : [
                "This project does NOT represent, endorse, or affiliate with any religion, caste, community group, political party, political ideology, or government authority.",
                "Real-world state, district, and river names are used strictly for geographic familiarity from public open data."
              ],
        },
        {
          pill: isTe ? "స్పామ్ నిరోధక విధానం" : "Anti-Spam & Fair Use",
          heading: isTe
            ? "సహజ భాగస్వామ్యం మాత్రమే"
            : "Respectful engagement & instant takedown",
          items: isTe
            ? [
                "బాట్ కామెంట్లు, స్పామ్ లేదా అసభ్యకర ప్రవర్తనను అనుమతించము మరియు వనరుల లెక్కల్లో చేర్చము.",
                "ఎవరైనా తమ ఇంటి పేరును మార్చాలన్నా లేదా తొలగించాలన్నా @telugustates.csrgo కు సందేశం పంపి వెంటనే తొలగించుకోవచ్చు."
              ]
            : [
                "Automated bots, repetitive spam comments, or artificial engagement are strictly discouraged and never counted.",
                "Any user may request immediate correction or removal of a display name or virtual house via @telugustates.csrgo."
              ],
        },
      ],
    },
    privacy: {
      tab: isTe ? "గోప్యత" : "Privacy",
      title: isTe ? "గోప్యత & వ్యక్తిగత సమాచార రక్షణ" : "Privacy & Zero-PII Policy",
      lead: isTe
        ? "మేము ఎటువంటి వ్యక్తిగత సమాచారాన్ని లేదా అసలు ఇన్‌స్టాగ్రామ్ పేర్లను నిల్వ చేయము."
        : "We collect zero personal data and never store raw social usernames.",
      cards: [
        {
          pill: isTe ? "ఏకముఖ హ్యాష్ ఐడి" : "One-Way Hashed ID",
          heading: isTe
            ? "మీ పరికరంలోనే సురక్షిత మార్పిడి"
            : "Local-only anonymous resident ID",
          items: isTe
            ? [
                "మీరు నమోదు చేసే ఇన్‌స్టాగ్రామ్ పేరు మీ ఫోన్/బ్రౌజర్‌లోనే 256-రౌండ్ల SHA-256 హ్యాష్ (h + 24 అక్షరాలు) గా మారుతుంది; అసలు పేరు ఎక్కడా సేవ్ కాదు.",
                "మళ్లీ మళ్లీ పేరు అడగకుండా ఉండేందుకు ఆ అజ్ఞాత ఐడి మాత్రమే మీ యాప్ డేటా లేదా బ్రౌజర్ నిల్వలో సేవ్ అవుతుంది.",
                "ఇంటి బోర్డులపై కేవలం సాధారణ పేరు (ఉదా. Kiran, Vennela) మాత్రమే కనిపిస్తుంది."
              ]
            : [
                "When you type your username, your device locally computes an irreversible 256-round SHA-256 hash (`h` + 24 hex characters) and immediately discards the raw text.",
                "Only that anonymous ID and display settings are stored locally in Android app preferences or browser `localStorage` so you are never asked again.",
                "3D wooden signboards display plain names/nicknames only — never `@handles`."
              ],
        },
        {
          pill: isTe ? "అనుమతులు లేవు" : "Zero Tracking",
          heading: isTe
            ? "లొకేషన్, కెమెరా, కుకీల సేకరణ లేదు"
            : "No GPS, contacts, camera, or ad trackers",
          items: isTe
            ? [
                "ఈ యాప్ లేదా వెబ్‌సైట్ GPS లొకేషన్, కాంటాక్ట్స్, కెమెరా, మైక్రోఫోన్, ఇమెయిల్, ఫోన్ నంబర్ లేదా ప్రకటన ట్రాకర్లను సేకరించదు."
              ]
            : [
                "Neither the website nor the Android app accesses GPS location, contacts, camera, microphone, email, phone numbers, or third-party advertising trackers."
              ],
        },
      ],
    },
    credits: {
      tab: isTe ? "డేటా & మూలాలు" : "Credits",
      title: isTe ? "ఓపెన్ డేటా, కళ & సాఫ్ట్‌వేర్ మూలాలు" : "Data, Artwork & Software Credits",
      lead: isTe
        ? "ఈ ప్రాజెక్ట్‌లో ఉపయోగించిన బహిరంగ డేటాసెట్‌లు మరియు ఓపెన్-సోర్స్ లైసెన్సుల వివరాలు."
        : "Full attribution for every open geographic dataset, 3D asset library, font, and software package.",
      cards: [
        {
          pill: isTe ? "భౌగోళిక మూలాలు" : "Geographic Datasets",
          heading: isTe ? "పట మరియు భూభాగ లైసెన్సులు" : "Map, Elevation & Water Sources",
          items: [
            "OpenStreetMap: © OpenStreetMap contributors — Open Database License (ODbL 1.0).",
            "District Directory: Local Government Directory (LGD), Ministry of Panchayati Raj — Government Open Data License–India.",
            "Elevation (DEM): Copernicus WorldDEM-30 (GLO-30) © DLR e.V. 2010–2014 & © Airbus Defence and Space GmbH 2014–2018 under COPERNICUS by the EU & ESA (no official endorsement or liability).",
            "Land Cover & Lakes: © ESA WorldCover 2021 v200 (CC BY 4.0) · HydroLAKES v1.0, Messager et al. (CC BY 4.0).",
          ],
        },
        {
          pill: isTe ? "సాఫ్ట్‌వేర్ & కళ" : "Software, Fonts & Art",
          heading: isTe ? "ఓపెన్ సోర్స్ లైబ్రరీలు" : "Open-Source Code & Assets",
          items: [
            "3D Engine & Compression: Three.js r177 (MIT) · fzstd 0.1.1 & fflate (MIT).",
            "Typography: Fraunces, Manrope & Noto Sans Telugu (SIL Open Font License 1.1).",
          ],
        },
      ],
    },
  };
}
async function showDialog(rawKey) {
  const keyName =
    rawKey === "residents" || rawKey === "economy" ? "guide" : rawKey;
  const docs = dialogDocs();
  const activeKey = docs[keyName] ? keyName : "about";
  activeDialogTab = activeKey;
  const sec = docs[activeKey];
  const body = $("#dialog-body");
  body.replaceChildren();

  const tabs = document.createElement("div");
  tabs.className = "doc-tabs";
  tabs.setAttribute("role", "tablist");
  for (const id of ["guide", "about", "legal", "privacy", "credits"]) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "doc-tab" + (id === activeKey ? " is-active" : "");
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(id === activeKey));
    b.textContent = docs[id].tab;
    b.onclick = () => showDialog(id);
    tabs.append(b);
  }
  body.append(tabs);

  const h = document.createElement("h2");
  h.textContent = sec.title;
  const lead = document.createElement("p");
  lead.className = "doc-lead";
  lead.textContent = sec.lead;
  body.append(h, lead);

  const stack = document.createElement("div");
  stack.className = "doc-stack";
  for (const c of sec.cards) {
    const card = document.createElement("section");
    card.className = "doc-card";
    const pill = document.createElement("span");
    pill.className = "doc-pill";
    pill.textContent = c.pill;
    const ch = document.createElement("h3");
    ch.textContent = c.heading;
    const ul = document.createElement("ul");
    ul.className = "doc-list";
    for (const line of c.items) {
      const li = document.createElement("li");
      li.textContent = line;
      ul.append(li);
    }
    card.append(pill, ch, ul);
    stack.append(card);
  }
  body.append(stack);

  const links = document.createElement("div");
  links.className = "doc-links";
  const legalLink = document.createElement("a");
  legalLink.className = "secondary-cta";
  legalLink.href = url("legal/");
  legalLink.textContent = msg("nav.legalPage");
  const artLink = document.createElement("a");
  artLink.className = "secondary-cta";
  artLink.href = url("library/CREDITS.html");
  artLink.textContent = msg("home.credits");
  links.append(legalLink, artLink);
  body.append(links);

  if (!dlg.open) dlg.showModal();
}
window.addEventListener("languagechange-atlas", () => {
  if (dlg?.open && activeDialogTab) showDialog(activeDialogTab);
});
/* Full transaction history. The hero shows only the newest batch, so the rest
   are rendered here into the shared dialog, which already scrolls. */
async function showLedger(button) {
  if (!dlg) return;
  let rows = [];
  try {
    const res = await fetch(url("ledger.json"));
    if (!res.ok) throw Error(String(res.status));
    rows = (await res.json())?.entries ?? [];
  } catch {
    if (button) button.disabled = false;
    return;
  }
  if (!rows.length) {
    if (button) button.disabled = false;
    return;
  }
  const num = new Intl.NumberFormat(document.documentElement.lang);
  const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + num.format(Math.abs(n));
  const icon = (name) =>
    `<svg class="ico" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

  const body = $("#dialog-body");
  body.replaceChildren();

  const h = document.createElement("h2");
  h.textContent = msg("home.ledgerTitle");
  const lead = document.createElement("p");
  lead.className = "doc-lead";
  lead.textContent = msg("home.ledgerPopupLead");
  body.append(h, lead);

  const list = document.createElement("ol");
  list.className = "ledger-pop-list";
  for (const e of rows) {
    const li = document.createElement("li");
    li.className = "ledger-pop-row";

    const head = document.createElement("div");
    head.className = "ledger-pop-head";
    const date = document.createElement("b");
    date.textContent = e.date;
    head.append(date);
    if (e.houses_added) {
      const houses = document.createElement("small");
      houses.textContent = `${num.format(e.houses_added)} ${msg("home.ledgerHouses")}`;
      head.append(houses);
    }
    li.append(head);

    // What the batch earned, then what it consumed or added.
    const chips = document.createElement("div");
    chips.className = "ledger-pop-chips";
    for (const [key, field, copy] of [
      ["like", "likes", "home.ledgerLikesEarned"],
      ["comment", "comments", "home.ledgerCommentsEarned"],
      ["share", "shares", "home.ledgerSharesEarned"],
    ]) {
      if (!e[field]) continue;
      const c = document.createElement("span");
      c.className = "ledger-chip";
      c.title = msg(copy, { n: num.format(e[field]) });
      c.innerHTML = `<i class="ledger-ico">${icon(key)}</i><b>${num.format(e[field])}</b>`;
      chips.append(c);
    }
    li.append(chips);

    const net = document.createElement("div");
    net.className = "ledger-pop-net";
    for (const [key, field] of [
      ["food", "food"],
      ["currency", "currency"],
      ["gold", "gold"],
    ]) {
      if (!e[field]) continue;
      const d = document.createElement("span");
      d.className = "ledger-delta " + (e[field] < 0 ? "neg" : "pos");
      d.innerHTML = `<i class="ledger-ico">${icon(key)}</i><b>${signed(e[field])}</b>`;
      net.append(d);
    }
    li.append(net);

    if (e.note) {
      const note = document.createElement("small");
      note.className = "ledger-pop-note";
      note.textContent = e.note;
      li.append(note);
    }
    list.append(li);
  }
  body.append(list);

  dlg.showModal();
  body.parentElement?.scrollTo?.({ top: 0 });
}
const ledgerBtn = $("#ledger-all-btn");
if (ledgerBtn)
  ledgerBtn.onclick = () => {
    // Fetch once per click, but never leave the button looking stuck if the
    // request fails: it is the only way into the history.
    ledgerBtn.disabled = true;
    showLedger(ledgerBtn).finally(() => {
      ledgerBtn.disabled = false;
    });
  };

document.addEventListener("click", (e) => {
  const action = e.target.closest("[data-open]")?.dataset.open;
  if (action) showDialog(action);
});
$("#close-dialog").onclick = () => dlg.close();
dlg.onclick = (e) => {
  if (e.target === dlg) dlg.close();
};
export const normalize = normalizeUsername;
function resolveResidentId(raw) {
  const trimmed = String(raw || "").trim().toLowerCase();
  if (!trimmed) return "";
  if (isResidentId(trimmed)) return trimmed;
  return residentId(trimmed);
}
const shardCache = new Map();
async function lookup(rawOrId) {
  const u = resolveResidentId(rawOrId);
  if (!u) return null;
  const key = shardKey(u);
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
    const rawTarget = match[2],
      requestedId = resolveResidentId(rawTarget),
      savedId = await readStoredResidentId();
    if (token !== seq) return;
    if (!savedId) {
      const targetRec = requestedId ? await lookup(requestedId) : null;
      if (token !== seq) return;
      if (targetRec) {
        const exploreHash =
          "#/at/" +
          targetRec.lat.toFixed(8) +
          "," +
          targetRec.lon.toFixed(8);
        history.replaceState(
          null,
          "",
          location.pathname + location.search + exploreHash,
        );
        return route();
      }
      paper(true);
      return;
    }
    const effectiveId = savedId;
    r = await lookup(effectiveId);
    if (token !== seq) return;
    if (!r) {
      paper(true);
      return;
    }
    if (rawTarget !== r.u) {
      const canonical = "#/" + match[1] + "/" + r.u;
      history.replaceState(
        null,
        "",
        location.pathname + location.search + canonical,
      );
      retryHash = canonical;
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
      const titleEl = $("#record-title") || recordPage.querySelector("h1");
      if (titleEl) titleEl.textContent = houseLabel(r);
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
if ($("#balances") || $("#economy-page")) await mountTreasury();
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
    async function syncSavedHomeUi() {
      const findForm = $("#find"),
        savedBox = $("#saved-home-box"),
        leadEl = $("#find-lead");
      if (!findForm || !savedBox || !a) return;
      const myId = await readStoredResidentId();
      const myRec = myId ? await lookup(myId) : null;
      if (!myRec) {
        findForm.hidden = false;
        savedBox.hidden = true;
        if (leadEl) leadEl.textContent = msg("walk.lookup");
        return;
      }
      findForm.hidden = true;
      savedBox.hidden = false;
      if (leadEl) leadEl.textContent = msg("home.savedLead");
      const ds = a.districts.find((d) => d.id === myRec.d);
      $("#saved-home-name").textContent = houseLabel(myRec);
      $("#saved-home-district").textContent = ds
        ? tr(ds.name, ds.te || ds.name) +
          " · " +
          msg(ds.state === "Telangana" ? "geo.tg" : "geo.ap")
        : "";
      $("#go-saved-home").onclick = () => {
        cold = null;
        requestFull();
        const target = "#/u/" + myRec.u;
        if (location.hash === target) route();
        else location.hash = "/u/" + myRec.u;
      };
      $("#go-saved-acre").onclick = () => {
        cold = null;
        requestFull();
        const target = "#/acre/" + myRec.u;
        if (location.hash === target) route();
        else location.hash = "/acre/" + myRec.u;
      };
    }
    await syncSavedHomeUi();
    window.addEventListener("atlas:resident-bound", syncSavedHomeUi);
    window.addEventListener("languagechange-atlas", syncSavedHomeUi);
    $("#find").onsubmit = async (e) => {
      e.preventDefault();
      cold = null;
      requestFull();
      join(false);
      const raw = $("#handle").value,
        clean = normalize(raw),
        id = resolveResidentId(raw),
        found = id ? await lookup(id) : null;
      if (!found) {
        tell(
          $("#search-msg"),
          msg("home.missing", {
            name: clean || raw.trim().replace(/^@+/, "").slice(0, 30),
          }),
        );
        join(true);
        return;
      }
      $("#handle").value = "";
      tell($("#search-msg"), "");
      join(false);
      await writeStoredResidentId(found.u);
      await syncSavedHomeUi();
      if (location.hash === "#/u/" + found.u) route();
      else location.hash = "/u/" + found.u;
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
