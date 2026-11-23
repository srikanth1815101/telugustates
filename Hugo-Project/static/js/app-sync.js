import { url } from "./grid.js";
import { resetCatalogCache } from "./catalog.js";
import { reloadMessages, bindMessages, msg } from "./messages.js";

const DEFAULT_APK_URL =
  "https://github.com/srikanth1815101/telugustates/releases/latest/download/Telugu-States-Atlas.apk";
const MIN_RECHECK_MS = 60_000;

let latestSync = null,
  dismissedCode = 0,
  lastCheckAt = 0,
  inflight = null,
  pollTimer = 0,
  lastStatus = null,
  userInitiatedUpdate = false;

function formatMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function hideUpdateBanner() {
  const banner = document.querySelector("#app-update-banner"),
    prog = document.querySelector("#app-update-progress");
  if (prog) prog.hidden = true;
  if (banner) banner.hidden = true;
}

function renderProgress(st) {
  lastStatus = st;
  const banner = document.querySelector("#app-update-banner"),
    note = document.querySelector("#app-update-note"),
    prog = document.querySelector("#app-update-progress"),
    bar = document.querySelector("#app-update-bar"),
    cta = document.querySelector("#app-update-cta"),
    ctaLabel = document.querySelector("#app-update-cta-label"),
    skip = document.querySelector("#app-update-skip"),
    btn = document.querySelector("#app-download"),
    btnLabel = document.querySelector("#app-download-label"),
    btnSub = document.querySelector("#app-download-sub");

  if (!st || st.state === "idle" || st.state === "up_to_date") {
    userInitiatedUpdate = false;
    if (prog) prog.hidden = true;
    cta?.classList.remove("is-busy");
    btn?.classList.remove("is-busy");
    if (st?.state === "up_to_date") {
      latestSync = { ...(latestSync || {}), updateAvailable: false };
      hideUpdateBanner();
      if (btn) btn.hidden = true;
      return;
    }
    renderUpdateUi();
    return;
  }

  // Never show post-install / stale state unless an update was started in this session
  if (!userInitiatedUpdate && st.state !== "downloading" && st.state !== "verifying") {
    return;
  }

  if (banner) banner.hidden = false;

  if (st.state === "downloading" || st.state === "verifying") {
    const pct = Math.max(0, Math.min(100, st.percent || 0)),
      detail =
        st.totalBytes > 0
          ? ` ${pct}% (${formatMb(st.downloadedBytes)} / ${formatMb(st.totalBytes)} MB)`
          : st.downloadedBytes > 0
            ? ` (${formatMb(st.downloadedBytes)} MB)`
            : "";
    if (prog && bar) {
      prog.hidden = false;
      bar.style.width = `${Math.max(4, pct)}%`;
    }
    if (skip) skip.hidden = true;
    if (note) {
      note.removeAttribute("data-msg");
      note.textContent = msg("home.updateDownloading") + detail;
    }
    cta?.classList.add("is-busy");
    btn?.classList.add("is-busy");
    if (ctaLabel) {
      ctaLabel.removeAttribute("data-msg");
      ctaLabel.textContent = `${pct}%`;
    }
    if (btnLabel) {
      btnLabel.removeAttribute("data-msg");
      btnLabel.textContent = msg("home.updateDownloading");
    }
    if (btnSub) {
      btnSub.hidden = false;
      btnSub.textContent = `${pct}%`;
    }
    return;
  }

  if (st.state === "permission") {
    if (prog && bar) {
      prog.hidden = false;
      bar.style.width = "100%";
    }
    if (skip) skip.hidden = false;
    if (note) {
      note.setAttribute("data-msg", "home.updatePermission");
      note.textContent = msg("home.updatePermission");
    }
    cta?.classList.remove("is-busy");
    btn?.classList.remove("is-busy");
    if (ctaLabel) {
      ctaLabel.setAttribute("data-msg", "home.updateAppCta");
      ctaLabel.textContent = msg("home.updateAppCta");
    }
    return;
  }

  if (st.state === "installing") {
    if (prog && bar) {
      prog.hidden = false;
      bar.style.width = "100%";
    }
    if (skip) skip.hidden = true;
    if (note) {
      note.setAttribute("data-msg", "home.updateInstalling");
      note.textContent = msg("home.updateInstalling");
    }
    cta?.classList.add("is-busy");
    btn?.classList.add("is-busy");
    if (ctaLabel) {
      ctaLabel.setAttribute("data-msg", "home.updateInstalling");
      ctaLabel.textContent = msg("home.updateInstalling");
    }
    if (btnLabel) {
      btnLabel.setAttribute("data-msg", "home.updateInstalling");
      btnLabel.textContent = msg("home.updateInstalling");
    }
    return;
  }

  if (st.state === "installed") {
    userInitiatedUpdate = false;
    hideUpdateBanner();
    return;
  }

  if (st.state === "conflict" || st.state === "error") {
    if (prog) prog.hidden = true;
    if (skip) skip.hidden = false;
    cta?.classList.remove("is-busy");
    btn?.classList.remove("is-busy");
    if (note && st.message) {
      note.removeAttribute("data-msg");
      note.textContent = st.message;
    }
    if (ctaLabel) {
      ctaLabel.setAttribute("data-msg", "home.updateRetry");
      ctaLabel.textContent = msg("home.updateRetry");
    }
    if (btnLabel) {
      btnLabel.setAttribute("data-msg", "home.updateRetry");
      btnLabel.textContent = msg("home.updateRetry");
    }
  }
}

function renderUpdateUi() {
  const btn = document.querySelector("#app-download"),
    label = document.querySelector("#app-download-label"),
    sub = document.querySelector("#app-download-sub"),
    banner = document.querySelector("#app-update-banner"),
    ver = document.querySelector("#app-update-ver"),
    note = document.querySelector("#app-update-note"),
    cta = document.querySelector("#app-update-cta"),
    ctaLabel = document.querySelector("#app-update-cta-label"),
    skip = document.querySelector("#app-update-skip");

  if (!latestSync?.updateAvailable) {
    hideUpdateBanner();
    if (location.hostname === "appassets.androidplatform.net" && btn) {
      btn.hidden = true;
    }
    return;
  }

  if (
    userInitiatedUpdate &&
    lastStatus &&
    (lastStatus.state === "downloading" ||
      lastStatus.state === "verifying" ||
      lastStatus.state === "installing" ||
      lastStatus.state === "permission")
  ) {
    renderProgress(lastStatus);
    return;
  }

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
    if (note) {
      note.setAttribute("data-msg", "home.updateAppNote");
      note.textContent = msg("home.updateAppNote");
    }
    if (ctaLabel) {
      ctaLabel.setAttribute("data-msg", "home.updateAppCta");
      ctaLabel.textContent = msg("home.updateAppCta");
    }
    if (skip) {
      skip.setAttribute("data-msg", "home.updateSkip");
      skip.textContent = msg("home.updateSkip");
    }
    if (latestSync.latestVersionCode !== dismissedCode) {
      banner.hidden = false;
    }
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
  latestSync = sync;
  if (sync.updateAvailable) {
    renderUpdateUi();
  } else {
    userInitiatedUpdate = false;
    hideUpdateBanner();
    const btn = document.querySelector("#app-download");
    if (location.hostname === "appassets.androidplatform.net" && btn) {
      btn.hidden = true;
    }
  }
}

function pollInAppUpdate() {
  if (pollTimer) clearTimeout(pollTimer);
  fetch("/_field/update-status", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((st) => {
      if (!st) return;
      renderProgress(st);
      if (
        st.state === "downloading" ||
        st.state === "verifying" ||
        (userInitiatedUpdate &&
          (st.state === "installing" || st.state === "permission"))
      ) {
        pollTimer = setTimeout(pollInAppUpdate, 420);
      }
    })
    .catch(() => {});
}

function startInAppUpdate(e) {
  if (e) e.preventDefault();
  userInitiatedUpdate = true;
  const apkUrl = latestSync?.apkUrl || DEFAULT_APK_URL,
    endpoint = "/_field/update-start?url=" + encodeURIComponent(apkUrl);
  fetch(endpoint, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((st) => {
      if (st) renderProgress(st);
      pollInAppUpdate();
    })
    .catch(() => {
      pollInAppUpdate();
    });
}

export function initAppSync() {
  const inApp = location.hostname === "appassets.androidplatform.net",
    btn = document.querySelector("#app-download"),
    banner = document.querySelector("#app-update-banner"),
    cta = document.querySelector("#app-update-cta"),
    skip = document.querySelector("#app-update-skip"),
    dismiss = document.querySelector("#app-update-dismiss");

  const closeBanner = () => {
    if (latestSync?.latestVersionCode)
      dismissedCode = latestSync.latestVersionCode;
    if (banner) banner.hidden = true;
  };
  if (dismiss) dismiss.addEventListener("click", closeBanner);
  if (skip) skip.addEventListener("click", closeBanner);
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

  if (btn) btn.hidden = true;
  hideUpdateBanner();

  if (cta) cta.addEventListener("click", startInAppUpdate);
  if (btn) {
    btn.addEventListener("click", (e) => {
      if (btn.classList.contains("is-update") || latestSync?.updateAvailable) {
        startInAppUpdate(e);
      }
    });
  }
  window.addEventListener("atlas:update-started", () => {
    userInitiatedUpdate = true;
    pollInAppUpdate();
  });

  // Purely silent background check — nothing shown unless an actual newer APK is confirmed
  const checkInBackground = (force = false) => {
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

  setTimeout(() => checkInBackground(true), 250);
  window.addEventListener("atlas:host-resume", () => {
    if (userInitiatedUpdate) pollInAppUpdate();
    checkInBackground(false);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (userInitiatedUpdate) pollInAppUpdate();
      checkInBackground(false);
    }
  });
}
