// Measure the actual runtime skin palette through walking → swimming → tread → walking, not just clip names.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import * as T from "../static/vendor/three.module.min.js";
import { loadPeople } from "../static/js/art-library.js";
import { traveller } from "../static/js/traveller.js";
globalThis.fetch = async (u) => new Response(await fs.readFile(new URL(u)));
await loadPeople();
const report = [];
for (const style of ["man", "woman"]) {
  const w = traveller(style),
    bones = w.mesh.skeleton.bones,
    bone = (n) => bones.find((b) => b.name === n);
  let swim = [],
    idle = [],
    last = 0,
    peakStep = 0;
  for (let i = 0; i < 560; i++) {
    const wet = i >= 50 && i < 470,
      moving = i < 260,
      root = wet ? -w.H - 0.13 : -2.4;
    w.pose({
      dt: 1 / 60,
      vel: moving ? 1.31 : 0,
      swim: wet,
      arrive: i === 0,
      depth: wet ? 2.4 : 0,
      at: [0, 0],
      yaw: 0,
      root: -2.4,
      waterRoot: root,
      ground: () => -2.4,
      reduced: false,
      idleTime: i / 60,
    });
    const h = bone("Head").position,
      k = bone("Hips").position,
      wr = bone("WristL").position;
    if ((i > 90 && i < 260) || (i > 321 && i < 469)) {
      const f = [h.y - k.y, k.z - h.z, wr.z, wr.y, h.y + root];
      (i < 260 ? swim : idle).push(f);
      if (i !== 321) peakStep = Math.max(peakStep, Math.abs(h.y - last));
    }
    last = h.y;
  }
  const avg = (a, i) => a.reduce((s, p) => s + p[i], 0) / a.length,
    span = (a, i) =>
      Math.max(...a.map((p) => p[i])) - Math.min(...a.map((p) => p[i]));
  const r = {
    style,
    forwardReach: avg(swim, 1),
    forwardRise: avg(swim, 0),
    treadRise: avg(idle, 0),
    swimHandTravel: span(swim, 2),
    treadHandTravel: Math.hypot(span(idle, 2), span(idle, 3)),
    headHeightRelativeToWater: { swim: avg(swim, 4), tread: avg(idle, 4) },
    maxSettledHeadFrameStep: peakStep,
    after: w.metrics().clip,
  };
  report.push(r);
  assert(
    r.forwardReach > 0.4 &&
      Math.abs(r.forwardRise) < 0.24 &&
      r.treadRise > 0.43 &&
      r.swimHandTravel > 0.35 &&
      r.treadHandTravel > 0.05 &&
      r.after === "stand" &&
      peakStep < 0.075,
    JSON.stringify(r),
  );
  w.dispose();
}
console.log(JSON.stringify(report, null, 2));
