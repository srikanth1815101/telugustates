import { url } from "./grid.js";
import { resetCatalogCache } from "./catalog.js";
import { reloadMessages, bindMessages, msg } from "./messages.js";

const DEFAULT_APK_URL =
  "https://github.com/srikanth1815101/telugustates/releases/latest/download/Telugu-States-Atlas.apk";
const MIN_RECHECK_MS = 45_000;

let latestSync = null,
  dismissedCode = 0,
  lastCheckAt = 0,
  inflight = null;

function renderUpdateUi() {
  const btn = document.querySelector("#app-download"),
    label = document.querySelector("#app-download-label"),
    sub = document.querySelector("#app-download-sub"),
    banner = document.querySelector("#app-update-banner"),
    ver = document.querySelector("#app-update-ver"),
    cta = document.querySelector("#app-update-cta");
  if (!latestSync?.updateAvailable) return;
  const apkUrl = latestSync.apkUrl || DEFAULT_APK_URL,
    tag = latestSync.latestVersionName ? "v" + latestSync.latestVersionName : "";
  if (btn && label) {
    btn.hidden = false;
    btn.classList.add("is-update");
    btn.removeAttribute("download");
    btn.href = apkUrl;
    label.setAttribute("data-msg", "home.updateApp");
    label.textContent = msg("home.updateApp");
    if (sub) {
      sub.hidden = false;
      sub.textContent = tag || "APK";
    }
  }
  if (banner && cta) {
    cta.href = apkUrl;
    if (ver) ver.textContent = tag;
    if (latestSync.latestVersionCode !== dismissedCode) banner.hidden = false;
  }
}

export async function applySyncState(sync) {
  if (!sync || typeof sync !== "object") return;
  if (sync.contentUpdated) {
    resetCatalogCache();
    await reloadMessages();
    bindMessages(document);
    window.dispatchEvent(
      new CustomEvent("atlas:content-updated", { detail: sync }),
    );
  }
  if (sync.updateAvailable) {
    latestSync = sync;
    renderUpdateUi();
  }
}

export function initAppSync() {
  const inApp = location.hostname === "appassets.androidplatform.net",
    btn = document.querySelector("#app-download"),
    banner = document.querySelector("#app-update-banner"),
    dismiss = document.querySelector("#app-update-dismiss");

  if (dismiss && banner) {
    dismiss.addEventListener("click", () => {
      if (latestSync?.latestVersionCode)
        dismissedCode = latestSync.latestVersionCode;
      banner.hidden = true;
    });
  }
  window.addEventListener("languagechange-atlas", renderUpdateUi);

  if (!inApp) {
    fetch(url("app-version.json"), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((meta) => {
        if (btn && meta?.apkUrl && !latestSync?.updateAvailable)
          btn.href = meta.apkUrl;
      })
      .catch(() => {});
    return;
  }

  if (btn && !latestSync?.updateAvailable) btn.hidden = true;

  const check = (force = false) => {
    const now = Date.now();
    if (!force && now - lastCheckAt < MIN_RECHECK_MS) return inflight;
    if (inflight) return inflight;
    lastCheckAt = now;
    inflight = fetch("/_field/sync", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((sync) => applySyncState(sync))
      .catch(() => {})
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };

  check(true);
  window.addEventListener("atlas:host-resume", () => check(false));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check(false);
  });
}
