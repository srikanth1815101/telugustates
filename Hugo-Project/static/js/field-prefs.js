// Device-local field preferences with strict validation. Extracted from
// world.js (Phase 1 split): load/save are pure localStorage operations, no
// renderer, no scene. The live object is mutated in place by Settings; call
// save() (world.js wraps savePrefs) after a user-visible change.
import { readPosition } from "./position-book.js";

const KEY = "atlas-field-v5";
const clamp = (n, l, h) => Math.max(l, Math.min(h, n));

/** Defaults before any stored value is applied. */
export const PREF_DEFAULTS = Object.freeze({
  third: true,
  relief: 2,
  season: "auto",
  weather: "auto",
  reduceFlash: true,
  time: "shared4",
  hour: 12,
  quality: "auto",
  life: false,
  motion: false,
  walker: "woman",
  left: false,
  hideMini: false,
  hideCompact: false,
  invert: false,
  recenter: true,
  haptics: false,
  saver: false,
  gain: 1,
});

const ENUMS = {
  walker: ["woman", "man"],
  weather: ["auto", "Clear", "Cloudy", "Light rain", "Rain", "Heavy rain"],
  season: ["auto", "retreat", "monsoon", "winter", "summer"],
  time: ["shared4", "shared2", "shared6", "golden", "day", "dusk", "live"],
  quality: ["auto", "low", "medium", "high"],
};

const BOOLEANS = [
  "third",
  "hideMini",
  "hideCompact",
  "invert",
  "recenter",
  "haptics",
  "saver",
  "motion",
  "reduceFlash",
];

/**
 * Load preferences for the current device. `a` is the atlas record (used to
 * recover the legacy camera side from the saved walk position).
 * Corrupt or partial storage never throws; unknown values fall back.
 */
export function loadPrefs(a) {
  const prefs = { ...PREF_DEFAULTS };
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "{}");
    for (const [k, set] of Object.entries(ENUMS))
      if (set.includes(p[k])) prefs[k] = p[k];
    if (typeof p.third !== "boolean") {
      const old = readPosition(a);
      if (typeof old?.third === "boolean") prefs.third = old.third;
    }
    prefs.life = p.life === true;
    for (const k of BOOLEANS) if (typeof p[k] === "boolean") prefs[k] = p[k];
    if (Number.isFinite(p.gain)) prefs.gain = clamp(p.gain, 0.4, 2.2);
  } catch {}
  return prefs;
}

/** Persist preferences. Never throws (private-mode storage can fail). */
export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {}
}
