import { cycle, calendar } from "./world-calendar.js";
const clip = (x) => Math.min(1, Math.max(0, x)),
  smooth = (x) => ((x = clip(x)), x * x * (3 - 2 * x));
function h(a, b) {
  let z = Math.imul(a ^ 0x43af2c15, 0x45d9f3b) ^ Math.imul(b, 0x27d4eb2d);
  z = Math.imul(z ^ (z >>> 16), 0x45d9f3b);
  return ((z ^ (z >>> 16)) >>> 0) / 2 ** 32;
}
// One weather minute is one elapsed real minute; QA can sample this function without waiting.
export function front(
  now,
  loc,
  elev,
  cfg,
  forced = "auto",
  manual = "auto",
  regional = {},
) {
  const c = calendar(now, cfg),
    season = forced === "auto" ? c.season : forced,
    region = Math.round(loc[0] * 2) + 37 * Math.round(loc[1] * 2),
    seed = cfg.seed + region,
    coast = regional.coast ?? Math.abs(loc[0] - 82) * 85,
    rainfall = regional.rain ?? 3,
    offset = h(seed, 39) * 3600,
    t = (now - Date.parse(cfg.epoch)) / 1000 + offset;
  function sample(v) {
    const slot = Math.floor(v / 3600),
      s = cycle(v, 3600),
      a = h(seed, slot * 9),
      b = h(seed, slot * 9 + 1),
      f = h(seed, slot * 9 + 3),
      wetChance =
        {
          monsoon: 0.94,
          retreat: coast < 55 ? 0.67 : 0.34,
          winter: 0.1,
          summer: 0.19,
        }[season] || 0.3;
    const rarity = clip(
      wetChance + (rainfall - 3) * 0.032 + Math.max(0, elev - 450) / 7000,
    );
    let start = 130 + h(seed, slot - 7) * 115,
      split = a > 0.4,
      d1 = split ? 600 + b * 280 : 860 + b * 1260,
      d2 = split ? 600 + f * 350 : 0,
      gap = 145 + f * 540;
    let wet = 0;
    for (const [o, d] of [
      [start, d1],
      [start + d1 + gap, d2],
    ])
      if (d > 0)
        wet = Math.max(wet, smooth((s - o) / 40) * smooth((o + d - s) / 45));
    const storm = h(seed, slot * 9 + 7) > 0.94;
    return {
      rain: a < rarity ? wet * (0.22 + f * 0.76) : 0,
      cloud: a < rarity ? 0.56 : 0.16 + 0.38 * b,
      storm,
      wind: 0.3 + f * 1.3,
    };
  }
  const s = sample(t);
  const edge = cycle(t, 3600);
  if (edge < 40) {
    const prev = sample(t - 40),
      k = smooth(edge / 40);
    s.cloud = prev.cloud + (s.cloud - prev.cloud) * k;
    s.wind = prev.wind + (s.wind - prev.wind) * k;
  }
  let storage = 0,
    den = 0;
  for (let j = 0; j < 16; j++) {
    let w = Math.exp(-j / 4);
    den += w;
    storage += sample(t - j * 80).rain * w;
  }
  storage /= den;
  if (manual && manual !== "auto") {
    s.rain =
      { Rain: 0.53, "Heavy rain": 0.91, "Light rain": 0.23 }[manual] || 0;
    s.cloud = manual === "Clear" ? 0.1 : 0.68;
    storage = 0.25 * storage + 0.75 * s.rain;
    s.storm = false;
  }
  const wet = clip(s.cloud + s.rain * 0.4),
    label =
      manual && manual !== "auto"
        ? manual
        : s.rain > 0.82 && s.storm
          ? "Thunderstorm"
          : s.rain > 0.65
            ? "Heavy rain"
            : s.rain > 0.33
              ? "Rain"
              : s.rain > 0.045
                ? "Light rain"
                : storage > 0.18
                  ? "Clearing"
                  : wet > 0.53
                    ? "Cloudy"
                    : wet > 0.3
                      ? "Partly cloudy"
                      : "Clear";
  return {
    label,
    icon: s.rain > 0.045 ? "☂" : wet > 0.4 ? "☁" : "☀",
    rain: s.rain,
    wind: s.wind,
    wet,
    warm: season === "summer" ? 0.95 : season === "winter" ? 0.2 : 0.5,
    storage,
    season,
    region,
    storm: s.storm && s.rain > 0.82,
    dry: storage < 0.04 && s.rain < 0.02,
  };
}
export function drainage(at, x, y, steps = 8, dx = 0.042) {
  let path = [[x, y, at(x, y)]];
  for (let i = 0; i < steps; i++) {
    let [a, b, z] = path.at(-1),
      best = null;
    for (const [u, v] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [0.707, 0.707],
      [-0.707, 0.707],
      [0.707, -0.707],
      [-0.707, -0.707],
    ]) {
      const X = a + u * dx,
        Y = b + v * dx,
        Z = at(X, Y);
      if (Z < z - 0.015 && (!best || Z < best[2])) best = [X, Y, Z];
    }
    if (!best) break;
    path.push(best);
  }
  return path;
}
