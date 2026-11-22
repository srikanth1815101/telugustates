import { url } from "./grid.js";
import { resetCatalogCache } from "./catalog.js";
import { reloadMessages, bindMessages, msg } from "./messages.js";

const DEFAULT_APK_URL =
  "https://github.com/srikanth1815101/telugustates/releases/latest/download/Telugu-States-Atlas.apk";
const MIN_RECHECK_MS = 45_000;

let latestSync = null,
  dismissedCode = 0,
  lastCheckAt = 0,
  inflight = null,
  pollTimer = 0,
  lastStatus = null;

function formatMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function renderProgress(st) {
  lastStatus = st;
  const banner = document.querySelector("#app-update-banner"),
    note = document.querySelector("#app-update-note"),
    prog = document.querySelector("#app-update-progress"),
    bar = document.querySelector("#app-update-bar"),
    cta = document.querySelector("#app-update-cta"),
    ctaLabel = document.querySelector("#app-update-cta-label"),
    btn = document.querySelector("#app-download"),
    btnLabel = document.querySelector("#app-download-label"),
    btnSub = document.querySelector("#app-download-sub");

  if (!st || st.state === "idle") {
    if (prog) prog.hidden = true;
    cta?.classList.remove("is-busy");
    btn?.classList.remove("is-busy");
    renderUpdateUi();
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

  if (st.state === "installing" || st.state === "installed") {
    if (prog && bar) {
      prog.hidden = false;
      bar.style.width = "100%";
    }
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

  if (st.state === "up_to_date") {
    if (prog) prog.hidden = true;
    cta?.classList.remove("is-busy");
    btn?.classList.remove("is-busy");
    if (banner) banner.hidden = true;
    if (btn) btn.hidden = true;
    return;
  }

  if (st.state === "conflict" || st.state === "error") {
    if (prog) prog.hidden = true;
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
    ctaLabel = document.querySelector("#app-update-cta-label");
  if (!latestSync?.updateAvailable) return;
  if (
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
    if (!lastStatus || lastStatus.state === "idle") {
      if (note) {
        note.setAttribute("data-msg", "home.updateAppNote");
        note.textContent = msg("home.updateAppNote");
      }
      if (ctaLabel) {
        ctaLabel.setAttribute("data-msg", "home.updateAppCta");
        ctaLabel.textContent = msg("home.updateAppCta");
      }
    }
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
        st.state === "installing" ||
        st.state === "permission"
      ) {
        pollTimer = setTimeout(pollInAppUpdate, 380);
      }
    })
    .catch(() => {});
}

function startInAppUpdate(e) {
  if (e) e.preventDefault();
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

  if (cta) cta.addEventListener("click", startInAppUpdate);
  if (btn) {
    btn.addEventListener("click", (e) => {
      if (btn.classList.contains("is-update") || latestSync?.updateAvailable) {
        startInAppUpdate(e);
      }
    });
  }
  window.addEventListener("atlas:update-started", pollInAppUpdate);

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
  pollInAppUpdate();
  window.addEventListener("atlas:host-resume", () => {
    pollInAppUpdate();
    check(false);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      pollInAppUpdate();
      check(false);
    }
  });
}
