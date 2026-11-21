// Display time only. Accounting uses civil dates at the build step, never this mapping.
export const cycle = (v, n) => ((v % n) + n) % n;
export function calendar(now, cfg, mode = "shared4", hour = 12) {
  const elapsed = now - Date.parse(cfg.epoch),
    year =
      cycle(elapsed, 864e5 * cfg.yearRealDays) / (864e5 * cfg.yearRealDays),
    month = Math.floor(year * 12),
    season =
      month < 2 || month === 11
        ? "winter"
        : month < 5
          ? "summer"
          : month < 9
            ? "monsoon"
            : "retreat";
  const dur =
      ({ shared2: 2, shared4: 4, shared6: 6 }[mode] || cfg.defaultDayHours) *
      36e5,
    phase = (cycle(elapsed, dur) / dur) * 240; // dawn 15, daylight 150, dusk 15, night 60 minutes of the 4h cycle
  const h =
    phase < 15
      ? 5 + phase / 15
      : phase < 165
        ? 6 + ((phase - 15) * 12) / 150
        : phase < 180
          ? 18 + (phase - 165) / 15
          : 19 + ((phase - 180) * 10) / 60;
  const wall =
    mode === "live"
      ? now
      : Date.UTC(2026, 0, 1) +
        Math.floor(year * 365) * 864e5 +
        (({ golden: 16.8333, day: 12.5, dusk: 18.3333, manual: hour }[mode] ??
          h) -
          5.5) *
          36e5;
  return {
    ms: wall,
    year,
    season,
    month,
    day: Math.floor(elapsed / dur),
    hour: cycle(wall / 36e5 + 5.5, 24),
    phase,
  };
}
export function windowLight(group, day, hour, storm = 0) {
  const dusk = Math.max(
    0,
    Math.min(1, (0.48 - day + 0.16 * storm - (group % 4) * 0.055) * 3.5),
  );
  let asleep = hour >= 1 && hour < 5;
  return dusk * (asleep && group % 4 !== 0 ? 0.05 : 1);
}
// Smooth small wall-clock corrections between paints; large changes and app resume re-anchor.
export function disciplinedClock() {
  let base, previous;
  return (wall, mono) => {
    if (
      base === undefined ||
      mono < previous ||
      mono - previous > 10000 ||
      Math.abs(wall - (base + mono)) > 30000
    ) {
      base = wall - mono;
    } else {
      const delta = wall - (base + mono);
      base +=
        Math.sign(delta) *
        Math.min(Math.abs(delta), 0.08 * Math.max(0, mono - previous));
    }
    previous = mono;
    return base + mono;
  };
}
