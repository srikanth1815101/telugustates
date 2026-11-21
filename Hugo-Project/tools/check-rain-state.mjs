// A cloudy sky may carry antecedent wetness. It must not carry moving rain effects. Check every season including the edges of automatic showers.
import assert from "node:assert/strict";
import {
  front,
  impactRain,
  dampGround,
} from "../static/js/regional-weather.js";
const cfg = {
    seed: 17061,
    epoch: "2026-01-01T00:00:00+05:30",
    yearRealDays: 28,
    defaultDayHours: 4,
  },
  at = Date.parse(cfg.epoch),
  region = { rain: 3.6, coast: 32 },
  site = [78.76, 18.8],
  report = {};
for (const season of ["winter", "summer", "monsoon", "retreat"]) {
  const tally = {},
    under = { dryWithStorage: 0, wet: 0, starts: 0, ends: 0 };
  let prev;
  function check(w) {
    const actual = [
      "Light rain",
      "Rain",
      "Heavy rain",
      "Thunderstorm",
    ].includes(w.label);
    assert.equal(w.precipitating, actual);
    assert.equal(w.rain > 0, actual);
    assert.equal(w.rain, impactRain(w.rain));
    return actual;
  }
  for (let m = 0; m < 8 * 24 * 3600; m += 17) {
    const w = front(at + m * 1000, site, 310, cfg, season, "auto", region),
      rain = check(w);
    tally[w.label] = (tally[w.label] || 0) + 1;
    if (!rain && w.storage > 0.025) under.dryWithStorage++;
    if (rain) under.wet++;
    if (prev === false && rain) under.starts++;
    if (prev && !rain) under.ends++;
    prev = rain;
    if (m % 221 === 0)
      for (const val of [
        "Clear",
        "Cloudy",
        "Light rain",
        "Rain",
        "Heavy rain",
      ]) {
        const v = front(at + m * 1000, site, 310, cfg, season, val, region);
        assert.equal(v.label, val);
        check(v);
      }
  }
  assert(
    under.starts > 1 &&
      under.ends > 1 &&
      under.dryWithStorage > 0 &&
      tally.Cloudy > 0 &&
      tally.Clear > 0,
  );
  report[season] = { ...under, labels: tally };
}
for (const r of [0, 0.001, 0.018, 0.035, 0.0449, 0.045])
  assert.equal(impactRain(r), 0);
for (const r of [0.04501, 0.23, 0.53, 0.91]) assert.equal(impactRain(r), r);
const wet = dampGround(0, { storage: 0.68, rain: 0.91 }, 1),
  dry = { storage: 0, rain: 0 };
let d = wet;
for (let i = 0; i < 46; i++) {
  let next = dampGround(d, dry, 0.5);
  assert(next < d && next > 0);
  d = next;
}
assert(Math.abs(d - wet / Math.E) < 1e-8);
console.log(JSON.stringify({ weatherGates: report }, null, 2));
