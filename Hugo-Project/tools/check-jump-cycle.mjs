// Input-driven, motor-timed complete jump. Separate scalar root motion from actual bending of the two skinned legs.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { WalkMotor } from "../static/js/walk-motor.js";
import { traveller } from "../static/js/traveller.js";
import { loadPeople } from "../static/js/art-library.js";
globalThis.fetch = async (url) => new Response(await fs.readFile(new URL(url)));
await loadPeople();
const face = { z: 0, depth: 0, drawn: true, line: 0, standable: true },
  s = {
    sample: () => face,
    floor: () => face,
    traversable: () => true,
    gradeAt: () => [0, 0],
  },
  out = [];
for (const style of ["man", "woman"])
  for (const moving of [0, 1]) {
    const m = new WalkMotor(),
      r = traveller(style),
      bones = r.mesh.skeleton.bones,
      hip = bones.find((b) => b.name === "Hips"),
      feet = ["L", "R"].map((v) => bones.find((b) => b.name === "Foot" + v)),
      flight = [[], []],
      contact = [],
      apex = [],
      takeoff = [],
      descent = [];
    m.reset(0, 0, s, 0, r.H);
    let maxErr = 0,
      lens = null;
    for (let i = -30; i < 130; i++) {
      if (i === 0) m.jump();
      if (i === (moving ? 14 : 2)) m.releaseJump();
      m.advance(1 / 60, 0, moving, 2.4, s, () => true, r.H);
      r.pose({
        dt: 1 / 60,
        vel: m.speed,
        ground: () => 0,
        at: [m.x * 63.615, -m.y * 63.615],
        root: 0,
        swim: false,
        yaw: 0,
        air: m.air,
        vertical: m.up,
        landAge: m.landAge,
        launchAge: m.launchAge,
        impact: m.impact,
        reduced: true,
      });
      const t = r.metrics();
      const l = t.feet.flatMap((f) => f.lengths);
      if (!lens) lens = l;
      for (let j = 0; j < l.length; j++)
        maxErr = Math.max(maxErr, Math.abs(l[j] - lens[j]));
      if (m.air > 0.2) {
        assert(
          t.jumpPerformance === "trail-vault" && t.feet.every((f) => !f.stance),
        );
        for (let j = 0; j < 2; j++)
          flight[j].push(feet[j].position.y - hip.position.y);
        const h = feet[0].position.y - hip.position.y;
        if (Math.abs(m.up) < 0.8) apex.push(h);
        if (m.up > 3.5) takeoff.push(h);
        if (m.up < -3.5) descent.push(h);
      }
      if (m.lands && t.jumpPerformance === "trail-recover") contact.push(i);
    }
    const spans = flight.map((v) => Math.max(...v) - Math.min(...v)),
      mean = (v) => v.reduce((a, b) => a + b) / v.length;
    assert(
      m.jumps === 1 &&
        m.lands === 1 &&
        m.grounded &&
        spans.every((n) => n > 0.33 && n < 0.65) &&
        mean(apex) - mean(descent) > 0.19 &&
        mean(apex) - mean(takeoff) > 0.19 &&
        contact.length >= 16 &&
        maxErr < 1e-8,
    );
    out.push({
      style,
      moving: !!moving,
      flightSeconds: flight[0].length / 60,
      ankleHipTravelM: spans,
      maxLegLengthErrorM: maxErr,
      recoveryFrames: contact.length,
      jumps: m.jumps,
      lands: m.lands,
    });
    r.dispose();
  }
console.log(JSON.stringify(out, null, 1));
