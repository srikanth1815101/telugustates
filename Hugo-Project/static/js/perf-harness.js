// Phase 0 performance harness. Opt-in only: open the site with ?perf=1 in the
// URL. Nothing here runs, fetches or writes unless that flag is present.
//
// It samples the RENDERED frame cadence (not the rAF request count) at three
// fixed camera spots — village, river, coast — and records, per spot:
//   frame-time p50 / p95 / max, rolling FPS, draw calls, triangles,
//   GPU resource counts (textures / geometries / programs), JS heap where the
//   engine exposes it, device tier, tier transitions and canvas settings.
//
// Usage (from the site root, Hugo server or any static host):
//   ?perf=1                         Boot the world and run all three spots.
//   ?perf=1&tier=1                  Force device tier 1 for a controlled A/B
//   ?perf=1&tier=2                  (quality is frozen while forced).
//   ?perf=1&spot=river              Run one spot only: village | river | coast.
//   ?perf=1&ms=12000                Sample window in ms (default 8000).
//   ?perf=1&settle=5000             Settle time after the spot is ready (ms).
//
// Results go to the on-screen panel, console.log and window.__atlasPerfReport.
// Run once on a phone (tier 1) and once on a desktop (tier 2), then diff the
// two reports. No network, no storage writes, no behaviour change when absent.

const SPOTS = [
  // Fractional atlas cells authored in content/places (village.md point,
  // bend.md ground_view, coast.md ground_view).
  { id: "village", cell: [2344.9552081, 7761.9166667] },
  { id: "river", cell: [3108.788062, 2628.204176] },
  { id: "coast", cell: [5957.48, 3969.02] },
];

const param = (k) => {
  const m = new URLSearchParams(location.search).get(k);
  return m === null ? null : m;
};
const percentile = (sorted, p) =>
  sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]
    : null;
const median = (sorted) => percentile(sorted, 0.5);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function panel() {
  const el = document.createElement("div");
  el.id = "perf-harness-panel";
  el.style.cssText = [
    "position:fixed",
    "left:8px",
    "bottom:8px",
    "z-index:2147483647",
    "max-width:min(420px,92vw)",
    "max-height:44vh",
    "overflow:auto",
    "background:rgba(12,18,14,.92)",
    "color:#d8f3dc",
    "font:11px/1.45 ui-monospace,Menlo,Consolas,monospace",
    "padding:8px 10px",
    "border-radius:8px",
    "border:1px solid rgba(216,243,220,.35)",
    "white-space:pre-wrap",
    "pointer-events:auto",
  ].join(";");
  document.body.appendChild(el);
  return el;
}

export async function install(api, hooks) {
  const ui = panel();
  const say = (t) => {
    ui.textContent = t;
  };
  const snap = () => window.atlasWalk?.snapshot?.() ?? null;
  const ms = Math.max(2000, Number(param("ms")) || 8000);
  const settleMs = Math.max(0, Number(param("settle")) || 3000);
  const only = param("spot");
  const spots = only ? SPOTS.filter((s) => s.id === only) : SPOTS;
  const forcedTier = Number(param("tier"));
  const report = {
    meta: {
      at: new Date().toISOString(),
      url: location.href,
      ua: navigator.userAgent,
      dpr: devicePixelRatio,
      screen: [screen.width, screen.height],
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      forcedTier: Number.isFinite(forcedTier) && param("tier") !== null ? forcedTier : null,
      sampleMs: ms,
      settleMs,
    },
    spots: [],
  };
  window.__atlasPerfReport = report;

  say("[perf] waiting for the world…");
  // The world boots through the normal route; give the first patch time to stream.
  for (let i = 0; i < 120 && !(snap()?.ready); i++) await wait(250);
  if (!snap()) {
    say("[perf] world did not start (atlasWalk missing). Aborting.");
    return;
  }

  const originalQuality = hooks.prefs?.quality;
  if (param("tier") !== null && Number.isFinite(forcedTier)) {
    say(`[perf] forcing tier ${forcedTier}…`);
    hooks.applyTier(forcedTier);
    // Freeze the governor so a controlled A/B cannot demote mid-sample.
    if (hooks.prefs)
      hooks.prefs.quality = ["low", "medium", "high"][forcedTier] || "medium";
    await wait(500);
    for (let i = 0; i < 120 && !(snap()?.ready); i++) await wait(250);
  }

  try {
    for (const spot of spots) {
      const [lon, lat] = hooks.ll(hooks.project, spot.cell[0], spot.cell[1]);
      say(`[perf] ${spot.id}: moving camera…`);
      const before = snap()?.transitions?.length || 0;
      const heap0 = performance.memory?.usedJSHeapSize || null;
      api.coordinate(lon, lat);
      // Wait until the spot's patch has finished streaming.
      let ready = false;
      for (let i = 0; i < 160; i++) {
        const s = snap();
        if (s?.ready && !s.pending) {
          ready = true;
          break;
        }
        await wait(250);
      }
      if (!ready) {
        report.spots.push({ id: spot.id, error: "spot not ready in 40 s" });
        continue;
      }
      await wait(settleMs);
      say(`[perf] ${spot.id}: sampling ${ms / 1000} s…`);

      const intervals = [],
        calls = [],
        tris = [],
        fpss = [];
      let lastFr = null,
        lastChange = 0,
        t0 = 0;
      const start = snap();
      await new Promise((resolve) => {
        const tick = (now) => {
          const s = snap();
          if (!s || s.photo === true) {
            // A photo overlay or a stopped world would poison the sample.
            resolve();
            return;
          }
          if (!t0) t0 = now;
          if (s.frames !== lastFr) {
            if (lastFr !== null && lastChange) intervals.push(now - lastChange);
            lastFr = s.frames;
            lastChange = now;
            calls.push(s.drawCalls);
            tris.push(s.triangles);
            if (Number.isFinite(s.fps) && s.fps > 0) fpss.push(s.fps);
          }
          if (now - t0 >= ms) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      const end = snap();
      const sorted = [...intervals].sort((a, b) => a - b);
      const sortedCalls = [...calls].sort((a, b) => a - b);
      const sortedTris = [...tris].sort((a, b) => a - b);
      const sortedFps = [...fpss].sort((a, b) => a - b);
      const heap1 = performance.memory?.usedJSHeapSize || null;
      report.spots.push({
        id: spot.id,
        lon: +lon.toFixed(6),
        lat: +lat.toFixed(6),
        ready: !!end?.ready,
        tier: end?.tier ?? start?.tier,
        detectedTier: end?.detectedTier ?? start?.detectedTier,
        quality: end?.settings?.quality,
        saver: end?.settings?.saver ?? null,
        renderedFrames: intervals.length,
        p50ms: percentile(sorted, 0.5) && +percentile(sorted, 0.5).toFixed(2),
        p95ms: percentile(sorted, 0.95) && +percentile(sorted, 0.95).toFixed(2),
        maxMs: sorted.length ? +sorted[sorted.length - 1].toFixed(2) : null,
        meanMs: sorted.length
          ? +(sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2)
          : null,
        fpsMedian: median(sortedFps) && +median(sortedFps).toFixed(1),
        drawCalls: sortedCalls.length
          ? {
              min: sortedCalls[0],
              median: median(sortedCalls),
              max: sortedCalls[sortedCalls.length - 1],
            }
          : null,
        triangles: sortedTris.length
          ? { median: median(sortedTris), max: sortedTris[sortedTris.length - 1] }
          : null,
        memory: end?.memory ?? null,
        jsHeapMB:
          heap0 && heap1
            ? {
                start: +(heap0 / 1048576).toFixed(1),
                end: +(heap1 / 1048576).toFixed(1),
              }
            : null,
        shadows: end?.shadows ?? null,
        canvasSize: end?.canvasSize ?? null,
        tierChanges: (end?.transitions || []).slice(before),
        stalled: intervals.length < 5,
      });
      say(
        `[perf] ${spot.id}: p50 ${
          report.spots[report.spots.length - 1].p50ms ?? "—"
        } ms · p95 ${report.spots[report.spots.length - 1].p95ms ?? "—"} ms · ${
          report.spots[report.spots.length - 1].drawCalls?.median ?? "?"
        } draws`,
      );
    }
  } finally {
    if (hooks.prefs && originalQuality !== undefined)
      hooks.prefs.quality = originalQuality;
  }

  console.log("[perf-harness] report", report);
  const worst = report.spots.reduce(
    (m, s) => Math.max(m, s.p95ms || 0),
    0,
  );
  say(
    `[perf] done — ${report.spots.length} spot(s), worst p95 ${worst.toFixed(
      1,
    )} ms.\n` +
      JSON.stringify(report.spots, null, 1) +
      "\n\nFull report: window.__atlasPerfReport (also in the console).",
  );
  const copy = document.createElement("button");
  copy.textContent = "copy JSON report";
  copy.style.cssText =
    "display:block;margin-top:6px;padding:4px 8px;font:inherit;cursor:pointer;";
  copy.onclick = () =>
    navigator.clipboard
      ?.writeText(JSON.stringify(report, null, 2))
      .then(() => (copy.textContent = "copied ✓"))
      .catch(() => (copy.textContent = "copy failed — use console"));
  ui.appendChild(copy);
}
