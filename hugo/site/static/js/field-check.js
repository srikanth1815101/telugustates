import { msg as say } from "./messages.js";
// Optional, entirely local instrument. Frame intervals count actual completed renders, not idle rAFs.
export async function recordRun(seconds = 12, report = () => {}) {
  if (document.hidden) throw Error(say("measure.foreground"));
  const api = window.atlasWalk,
    s = api?.snapshot();
  if (!s?.ready) throw Error(say("measure.wait"));
  const label = s.site || s.stop || s.u,
    t0 = performance.now(),
    frame = api.renderedFrames;
  let prev = t0,
    observed = frame,
    intervals = [],
    moving = [],
    movingFrames = 0,
    fauna = 0,
    small = 0,
    visibleFauna = 0,
    visibleSmall = 0,
    lastSample = -Infinity,
    tiers = new Set([s.tier]);
  return new Promise((resolve, reject) => {
    let interrupted = false;
    const paused = () => {
      if (document.hidden) {
        interrupted = true;
        finish();
        reject(Error(say("measure.pause")));
      }
    };
    const hostPause = () => {
      interrupted = true;
      finish();
      reject(Error(say("measure.pause")));
    };
    const finish = () => {
      document.removeEventListener("visibilitychange", paused);
      window.removeEventListener("atlas:host-pause", hostPause);
    };
    window.addEventListener("atlas:host-pause", hostPause);
    document.addEventListener("visibilitychange", paused);
    function tick(t) {
      if (interrupted) return;
      if (document.hidden || window.atlasWalk !== api) {
        finish();
        reject(Error(say("measure.pause")));
        return;
      }
      const f = api.renderedFrames;
      if (f !== observed) {
        intervals.push(t - prev);
        if (api.movingMps > 0.5) {
          moving.push(t - prev);
          movingFrames += f - observed;
        }
        prev = t;
        observed = f;
      }
      if (t - lastSample > 750) {
        const b = api.snapshot(),
          ec = b.ecology || {};
        tiers.add(b.tier);
        if (b.mode !== "ground" || (b.site || b.stop || b.u) !== label) {
          finish();
          reject(Error(say("measure.moved")));
          return;
        }
        fauna = Math.max(fauna, ec.placedAnimals || 0);
        small = Math.max(small, ec.placedSmall || 0);
        visibleFauna = Math.max(visibleFauna, ec.visible?.animals || 0);
        visibleSmall = Math.max(visibleSmall, ec.visible?.small || 0);
        lastSample = t;
        report(Math.max(0, Math.ceil(seconds - (t - t0) / 1000)));
      }
      if (t - t0 < seconds * 1000 || !intervals.length) {
        requestAnimationFrame(tick);
        return;
      }
      const b = api.snapshot(),
        d = (t - t0) / 1000,
        frames = observed - frame,
        sorted = intervals.slice().sort((x, y) => x - y),
        mean = intervals.reduce((a, b) => a + b, 0) / intervals.length,
        gl = document.querySelector("#world canvas").getContext("webgl2"),
        ext = gl.getExtension("WEBGL_debug_renderer_info");
      finish();
      resolve({
        site: label || "coordinate-walk",
        route: location.hash.slice(0, 160),
        startLngLat: s.ll.map((v) => +v.toFixed(6)),
        endLngLat: b.ll.map((v) => +v.toFixed(6)),
        startedAt: new Date(Date.now() - d * 1000).toISOString(),
        safeInsetsCssPx: (() => {
          const r = document
            .querySelector(".walk-safe-probe")
            ?.getBoundingClientRect();
          return r
            ? [r.top, innerWidth - r.right, innerHeight - r.bottom, r.left].map(
                (n) => +n.toFixed(1),
              )
            : null;
        })(),
        edition: "7.1.0",
        quality:
          tiers.size === 1 ? ["Low", "Medium", "High"][s.tier] : "Adaptive",
        tiers: [...tiers],
        qualityPreference: s.settings.quality,
        userAgent: navigator.userAgent,
        renderer: ext
          ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : "unreported",
        batterySaver: b.settings.saver,
        moving: summarizeMotion(moving, movingFrames),
        orientation: innerWidth > innerHeight ? "landscape" : "portrait",
        physicalHandset: "not established by browser instrumentation",
        cssViewport: [innerWidth, innerHeight],
        canvas: b.canvasSize,
        season: b.settings.season,
        time: b.settings.time,
        weather: b.weather.label,
        seconds: +d.toFixed(3),
        frames,
        fps: +(frames / d).toFixed(2),
        avgFrameMs: +mean.toFixed(2),
        p95FrameMs: +sorted[Math.ceil(0.95 * sorted.length) - 1].toFixed(2),
        worstFrameMs: +sorted.at(-1).toFixed(2),
        walkedM: +((b.walked - s.walked) * b.metresPerCell).toFixed(2),
        maxPlacedAnimals: fauna,
        maxPlacedSmall: small,
        maxVisibleAnimals: visibleFauna,
        maxVisibleSmall: visibleSmall,
      });
    }
    requestAnimationFrame(tick);
  });
}
export function summarizeMotion(samples, frames) {
  if (!samples.length)
    return { frames: 0, seconds: 0, fps: null, p95Ms: null, worstMs: null };
  const a = [...samples].sort((x, y) => x - y),
    duration = samples.reduce((a, b) => a + b, 0);
  return {
    frames,
    seconds: +(duration / 1000).toFixed(3),
    fps: +((1000 * frames) / duration).toFixed(2),
    p95Ms: +a[Math.ceil(0.95 * a.length) - 1].toFixed(2),
    worstMs: +a.at(-1).toFixed(2),
  };
}
export function fieldCheck(root, tr) {
  const btn = root.querySelector("#record-field"),
    msg = root.querySelector("#field-result");
  if (!btn) return;
  let records = [];
  try {
    records = JSON.parse(localStorage.getItem("atlas-field-readings") || "[]");
  } catch {}
  if (!Array.isArray(records)) records = [];
  const display = () => {
    msg.hidden = !records.length;
    msg.value = JSON.stringify(records, null, 2);
  };
  display();
  btn.onclick = async () => {
    if (btn.disabled) return;
    const s = window.atlasWalk?.snapshot();
    if (!s?.ready) {
      msg.hidden = false;
      msg.value = say("measure.wait");
      return;
    }
    btn.disabled = true;
    root.querySelector("#hide-sheet").click();
    try {
      const reading = await recordRun(
        ["village", "forest"].includes(s.stop) ? 60 : 12,
        (n) => (btn.textContent = say("measure.recording", { n })),
      );
      records.push(reading);
      records = records.slice(-12);
      try {
        localStorage.setItem("atlas-field-readings", JSON.stringify(records));
      } catch {}
      display();
    } catch (e) {
      msg.hidden = false;
      msg.value = e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = say("measure.start");
      if (root.querySelector(".world-sheet")?.hidden)
        root.querySelector("#world-menu").click();
    }
  };
}
