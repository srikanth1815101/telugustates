// The original Quaternius performances supply the complete body pose. Terrain IK corrects only support, not the underlying stride.
import * as T from "../vendor/three.module.min.js";
import { wornWeather } from "./traveller-weather.js";
import { rigInstance } from "./art-library.js";
const clamp = T.MathUtils.clamp,
  mix = T.MathUtils.lerp,
  smooth = (a, b, x) => T.MathUtils.smoothstep(x, a, b),
  V = () => new T.Vector3(),
  Q = () => new T.Quaternion(),
  up = new T.Vector3(0, 1, 0),
  round = (x) => +x.toFixed(4);
export function traveller(style = "woman") {
  style = style === "man" ? "man" : "woman";
  const R = rigInstance("traveller-" + style),
    { d, bones } = R,
    legs = d.legs.map((ix, i) => ({
      ix,
      sole: d.soless[i].map((a) => V().fromArray(a)),
      base: Q().fromArray(d.clips.stand.poses[0], ix[2] * 7 + 3),
      target: V(),
      shift: V(),
    }));
  let phase = 0,
    wet = 0,
    stroke = 0,
    swimClock = 0,
    clock = 0,
    last = {},
    events = 0;
  for (const f of legs) {
    const bp = f.ix.map((i) => V().fromArray(d.bones[i].p));
    f.bindU = bp[1].clone().sub(bp[0]);
    f.bindL = bp[2].clone().sub(bp[1]);
    f.L1 = f.bindU.length();
    f.L2 = f.bindL.length();
    f.bindU.normalize();
    f.bindL.normalize();
    // The sole outline includes vertices blended between shin and boot. Duplicated face corners
    // provide no additional support samples. Keep only distinct positions / influences.
    const g = R.mesh.geometry.attributes,
      unique = new Map();
    for (let i = 0; i < g.position.count; i++)
      if (g.skinIndex.getX(i) === f.ix[2]) {
        const tag = [
          g.position.getX(i),
          g.position.getY(i),
          g.position.getZ(i),
          g.skinIndex.getY(i),
          g.skinWeight.getX(i),
        ].join("/");
        unique.set(tag, i);
      }
    const all = [...unique.values()],
      low = Math.min(...all.map((i) => g.position.getY(i)));
    f.probes = all.filter((i) => g.position.getY(i) < low + 0.22);
  }
  function reset() {
    phase = wet = stroke = swimClock = clock = events = 0;
    for (const f of legs) {
      f.anchor = null;
      f.shift.set(0, 0, 0);
      f.release = 0;
      f.bias = 0;
      f.nextProbe = 0;
    }
    last = {};
  }
  reset();
  function pose({
    dt,
    vel,
    swim,
    ground,
    root,
    at,
    yaw,
    air = 0,
    depth = 0,
    arrive = false,
    vertical = 0,
    grip = 0,
    waterRoot = root,
    landAge = 10,
    impact = 0,
    launchAge = 10,
    curvature = 0,
    look = 0,
    idleTime = 0,
    reduced = true,
    sit = 0,
  }) {
    const rest =
      !swim && vel < 0.012 && air < 0.002 && landAge > 0.24 && launchAge > 0.17;
    const headYaw = reduced
      ? 0
      : clamp(look, -0.35, 0.35) +
        0.078 *
          Math.sin(idleTime * 0.78) *
          (0.5 + 0.5 * Math.sin(idleTime * 0.31));
    if (arrive) {
      for (const f of legs) {
        f.anchor = null;
        f.release = 0;
      }
    }
    clock += dt;
    wet = mix(wet, swim ? 1 : 0, 1 - Math.exp(-dt * (swim ? 5.5 : 7)));
    if (wet < 0.0001) wet = 0;
    if (wet > 0.9999) wet = 1;
    const run = smooth(1.85, 3.55, vel) * (1 - smooth(0.26, 1.12, depth)),
      move = smooth(0.015, 0.75, vel),
      jump = smooth(0.004, 0.12, air) * (1 - wet),
      stride = mix(
        d.clips.walk.stride,
        d.clips.run.stride * (1 + 0.22 * smooth(4, 7, vel)),
        run,
      );
    if (move > 0.0001) phase = (phase + (dt * vel) / stride) % 1;
    R.sample("stand", reduced ? 0.31 : clock / d.clips.stand.seconds);
    if (move > 0) {
      R.sample("walk", phase, move);
      R.sample("run", phase, run * move);
    }
    // Non-looping performance. Upward velocity advances the push-off, the knees tuck on ascent and lengthen for contact; holding Jump never freezes the middle pose.
    const airborne = jump,
      fallPhase = clamp(0.5 - vertical / 11.6, 0, 1),
      hop = grip ? 0 : jump;
    if (hop > 0.0001) R.sample("trail-vault", fallPhase, hop);
    if (landAge < 0.4 && air < 0.03 && !grip)
      R.sample(
        "trail-recover",
        landAge / 0.4,
        (1 - wet) *
          Math.min(1, impact / 3.7) *
          (1 - smooth(0.26, 0.4, landAge)),
      );
    stroke = mix(stroke, smooth(0.08, 0.95, vel), 1 - Math.exp(-dt * 4.7));
    swimClock += dt * (0.85 + 0.15 * clamp(vel, 0, 1.7));
    if (grip > 0) R.sample("field-ledge", grip, 1 - wet);
    if (wet > 0) {
      R.sample("tread", clock / d.clips.tread.seconds, wet);
      R.sample("swim", swimClock / d.clips.swim.seconds, wet * stroke);
    }
    const lean = clamp(curvature * 0.045, -0.13, 0.13) * move,
      torsoQ = Q().setFromAxisAngle(new T.Vector3(0, 0, 1), lean),
      piv = bones[2].position;
    for (let i = 3; i < 54; i++) {
      const b = bones[i];
      b.position.sub(piv).applyQuaternion(torsoQ).add(piv);
      b.quaternion.premultiply(torsoQ);
    }
    if (!reduced) {
      const head = bones[7];
      head.quaternion.multiply(Q().setFromAxisAngle(up, headYaw));
    }

    const cy = Math.cos(yaw),
      sy = Math.sin(yaw),
      world = (a) => [at[0] + cy * a.x + sy * a.z, at[1] - sy * a.x + cy * a.z],
      toLocal = (a) => [
        (a[0] - at[0]) * cy - (a[1] - at[1]) * sy,
        (a[0] - at[0]) * sy + (a[1] - at[1]) * cy,
      ],
      landW = (1 - wet) * (1 - jump),
      feet = [];
    // Ease weight through a relaxed asymmetrical rest, not a frozen bind pose.
    const settle = (1 - move) * (1 - jump) * (1 - wet),
      slow = reduced ? 0 : Math.sin(clock * 0.71);
    const sway = (0.014 + 0.007 * slow) * settle;
    for (const b of bones) {
      b.position.x += sway;
      b.position.y -= (0.024 + 0.004 * slow) * settle;
    }
    // Seated (driving): sink the hips to the seat height. Bone positions
    // are re-sampled from the clip every frame, so this is safe to apply
    // per call; the ground-contact drop below is bypassed.
    if (sit > 0) for (const b of bones) b.position.y -= 0.3 * sit;
    let drop = 0;
    for (let i = 0; i < 2; i++) {
      const f = legs[i],
        [u, l, k] = f.ix,
        [hip, knee, foot] = [bones[u], bones[l], bones[k]],
        t = (phase + i * 0.5) % 1,
        duty = mix(0.49, 0.39, run),
        plant = landW > 0.72 && (rest || t < duty),
        dst = f.target.copy(foot.position);
      // Once the sole leaves support there is no ground target to solve. Play the authored knee plane and shoe rotation unchanged.
      if (hop > 0.999 && !swim && !grip) {
        f.plant = false;
        f.anchor = null;
        f.release = 0;
        f.shift.set(0, 0, 0);
        continue;
      }
      dst.z += (i === 0 ? -0.078 : 0.058) * settle;
      dst.x += (i === 0 ? -0.012 : 0.012) * settle;
      const free = world(dst);
      if (plant && !f.anchor) {
        f.anchor = free;
        f.release = 0;
        events++;
      }
      if (!plant && f.anchor) {
        f.anchor = null;
        f.release = 1;
      }
      if (f.anchor) {
        const [x, z] = toLocal(f.anchor);
        f.shift.set(x - dst.x, 0, z - dst.z);
        const weight = rest ? 1 : Math.min(1, t / 0.065, (duty - t) / 0.075),
          correction =
            Math.min(1, 0.095 / Math.max(0.0001, f.shift.length())) *
            Math.max(0, weight);
        f.shift.multiplyScalar(correction);
        dst.add(f.shift);
      } else if (f.release > 0) {
        f.release = Math.max(0, f.release - dt * 5.9);
        dst.addScaledVector(
          f.shift,
          f.release * f.release * (3 - 2 * f.release),
        );
      }
      const loc = world(dst),
        floor = ground(loc) - root,
        dx = 0.079,
        gx =
          (ground([loc[0] + dx, loc[1]]) - ground([loc[0] - dx, loc[1]])) /
          (dx * 2),
        gz =
          (ground([loc[0], loc[1] + dx]) - ground([loc[0], loc[1] - dx])) /
          (dx * 2),
        sx = clamp(gx * cy - gz * sy, -0.6, 0.6),
        sz = clamp(gx * sy + gz * cy, -0.68, 0.68),
        q = foot.quaternion.clone(),
        cor = Q()
          .setFromUnitVectors(up, V().set(-sx, 1, -sz).normalize())
          .multiply(f.base);
      if (plant) q.slerp(cor, rest ? 1 : 0.65);
      let floorRel = Infinity;
      const pt = V();
      for (const v of f.sole) {
        pt.copy(v).applyQuaternion(q);
        floorRel = Math.min(floorRel, pt.y - sx * pt.x - sz * pt.z);
      }
      f.q = q;
      if (!rest || landW < 0.999 || arrive) {
        f.bias = 0;
        f.nextProbe = 0;
      }
      const required = floor - floorRel + 0.0015 + (rest ? f.bias : 0);
      dst.y = plant ? mix(dst.y, required, landW) : dst.y + landW * floor;
      if (landW > 0.2)
        dst.y = Math.max(
          dst.y,
          required * landW + foot.position.y * (1 - landW),
        );
      if (wet > 0.25)
        dst.y = Math.max(dst.y, ground(loc) - waterRoot - floorRel + 0.009);
      if (!plant)
        dst.y +=
          0.07 *
          smooth(0.07, 0.54, depth) *
          (1 - wet) *
          Math.max(0, Math.sin(((t - duty) / (1 - duty)) * Math.PI));
      if (plant) {
        const D = f.L1 + f.L2 - 0.0005,
          horiz = (dst.x - hip.position.x) ** 2 + (dst.z - hip.position.z) ** 2;
        drop = Math.min(
          drop,
          dst.y + Math.sqrt(Math.max(0.03, D * D - horiz)) - hip.position.y,
        );
      }
      f.plant = plant;
      f.loc = loc;
    }
    drop = sit > 0 ? 0 : Math.max(-0.24, drop) * landW;
    if (drop) for (const b of bones) b.position.y += drop;
    if (sit > 0) {
      // Reach both feet forward onto the floorboard; the two-bone solve
      // below bends the knees into a natural seated line.
      for (let i = 0; i < 2; i++) {
        const f = legs[i];
        const hip = bones[f.ix[0]];
        f.target.set(
          hip.position.x + (i === 0 ? -0.1 : 0.1),
          Math.max(hip.position.y - 0.58, hip.position.y - f.L2 - 0.05),
          hip.position.z + 0.4,
        );
        f.plant = false;
        f.anchor = null;
        f.release = 0;
        f.shift.set(0, 0, 0);
      }
    }
    for (const f of legs) {
      const [u, l, k] = f.ix,
        [hip, knee, foot] = [bones[u], bones[l], bones[k]],
        K = knee.position.clone(),
        F = foot.position.clone(),
        oldUpper = f.bindU.clone().applyQuaternion(hip.quaternion).normalize(),
        oldLower = f.bindL.clone().applyQuaternion(knee.quaternion).normalize();
      if (hop > 0.999 && !swim && !grip) {
        // Interpolating absolute sampled joint positions very slightly shortens links. Restore bind lengths along the authored directions, without pulling either boot toward a floor target.
        const a = K.clone().sub(hip.position).normalize(),
          b = F.clone().sub(K).normalize();
        knee.position.copy(hip.position).addScaledVector(a, f.L1);
        foot.position.copy(knee.position).addScaledVector(b, f.L2);
        hip.quaternion.premultiply(Q().setFromUnitVectors(oldUpper, a));
        knee.quaternion.premultiply(Q().setFromUnitVectors(oldLower, b));
      } else {
        const P = hip.position,
          e = f.target.clone().sub(P),
          D = clamp(
            e.length(),
            Math.abs(f.L1 - f.L2) + 0.0001,
            f.L1 + f.L2 - 0.00006,
          );
        e.normalize();
        // Stable anatomical knee axis. A near-straight authored leg has no reliable bend pole.
        let pole = V().set(f === legs[0] ? -0.045 : 0.045, 0, -1);
        pole.addScaledVector(e, -pole.dot(e)).normalize();
        let authored = K.clone().sub(P);
        authored.addScaledVector(e, -authored.dot(e));
        if ((wet > 0.03 || airborne > 0.03) && authored.lengthSq() > 1e-7)
          pole
            .lerp(authored.clone().normalize(), Math.max(wet, airborne))
            .normalize();
        else if (authored.lengthSq() > 0.0016 && authored.dot(pole) > 0)
          pole.lerp(authored.normalize(), 0.45 * move).normalize();
        const proj = (f.L1 * f.L1 - f.L2 * f.L2 + D * D) / (2 * D),
          kk = P.clone()
            .addScaledVector(e, proj)
            .addScaledVector(
              pole,
              Math.sqrt(Math.max(0, f.L1 * f.L1 - proj * proj)),
            ),
          ff = P.clone().addScaledVector(e, D);
        hip.quaternion.premultiply(
          Q().setFromUnitVectors(oldUpper, kk.clone().sub(P).normalize()),
        );
        knee.quaternion.premultiply(
          Q().setFromUnitVectors(oldLower, ff.clone().sub(kk).normalize()),
        );
        knee.position.copy(kk);
        foot.position.copy(ff);
        foot.quaternion.copy(f.q);
      }
      const a = knee.position.clone().sub(hip.position).normalize(),
        b = foot.position.clone().sub(knee.position).normalize();
      feet.push({
        lengths: [
          hip.position.distanceTo(knee.position),
          knee.position.distanceTo(foot.position),
        ],
        stance: f.plant,
        foot: world(foot.position).map(round),
        knee: round(-a.angleTo(b)),
        hip: round(Math.atan2(-a.z, -a.y)),
        lift: round(foot.position.y),
      });
    }
    R.commit();
    // Check the posed skinned mesh against the local support triangles, not just an ankle joint.
    // Feed the correction into the next two-bone solve: keep both shin and thigh lengths intact.
    // Rest-only sampling is rate limited; there is no frozen skeleton or per-frame vertex scan.
    if (rest && wet < 0.001) {
      const pt = V();
      for (const f of legs)
        if (clock >= f.nextProbe) {
          let gap = Infinity;
          for (const i of f.probes) {
            R.mesh.getVertexPosition(i, pt);
            gap = Math.min(gap, root + pt.y - ground(world(pt)));
          }
          if (Number.isFinite(gap))
            f.bias = clamp(
              f.bias + clamp(0.00065 - gap, -0.026, 0.026),
              -0.055,
              0.055,
            );
          f.nextProbe =
            clock + (Math.abs(gap - 0.00065) > 0.0015 ? 0.032 : 0.15);
        }
    }
    last = {
      style,
      asset: d.id,
      bones: bones.length,
      triangles: d.geom.index.count / 3,
      clip: swim
        ? stroke > 0.5
          ? "swim"
          : "tread"
        : jump > 0.4
          ? "jump"
          : rest
            ? "stand"
            : run > 0.5
              ? "run"
              : "walk",
      action:
        grip > 0
          ? "climb"
          : swim
            ? "swim"
            : landAge < 0.24
              ? "land"
              : launchAge < 0.14
                ? "take-off"
                : air > 0.04
                  ? vertical >= 0
                    ? "airborne"
                    : "fall"
                  : depth > 0.1 && vel > 0.12
                    ? "wade"
                    : vel > 5.5
                      ? "sprint"
                      : vel > 3.1
                        ? "jog"
                        : vel > 0.09
                          ? "walk"
                          : Math.abs(curvature) > 0.4
                            ? "turn"
                            : "idle",
      resting: rest,
      phase: round(phase),
      jumpPhase: round(fallPhase),
      jumpBlend: round(hop),
      jumpPerformance:
        hop > 0.001 ? "trail-vault" : landAge < 0.4 ? "trail-recover" : null,
      swimBlend: round(wet),
      strokeBlend: round(stroke),
      contacts: events,
      feet,
    };
  }
  // The traveller is also drawn during the last metres of arrival. Never expose the unposed bind skeleton.
  pose({
    dt: 0,
    vel: 0,
    swim: false,
    ground: () => 0,
    root: 0,
    at: [0, 0],
    yaw: 0,
    arrive: true,
    reduced: true,
  });
  const privateMat = R.mesh.material.clone();
  R.mesh.material = privateMat;
  const rainwear = wornWeather(R, privateMat, style);
  return {
    group: R.g,
    opacity(a) {
      privateMat.opacity = a;
      privateMat.transparent = a < 0.999;
      privateMat.depthWrite = a >= 0.999;
    },
    mesh: R.mesh,
    H: d.hipHeight,
    reset,
    pose,
    weather: rainwear.update,
    restoreWeather: rainwear.restore,
    metrics: () => ({ ...last, clothing: rainwear.read() }),
    dispose() {
      rainwear.dispose();
      privateMat.dispose();
      R.dispose();
    },
  };
}
