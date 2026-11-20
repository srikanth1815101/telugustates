// The original Quaternius performances supply the complete body pose. Terrain IK corrects only support, not the underlying stride.
import * as T from "../vendor/three.module.min.js";
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
    clock = 0,
    last = {},
    events = 0,
    restKey = "";
  let breath = 0;
  for (const f of legs) {
    f.verts = [];
    const a = d.geom.attributes;
    for (let k = 0; k < a.position.count; k++) {
      if (a.skinIndex.getX(k) === f.ix[2]) f.verts.push(k);
    }
  }
  function reset() {
    phase = wet = clock = events = 0;
    restKey = "";
    for (const f of legs) {
      f.anchor = null;
      f.shift.set(0, 0, 0);
      f.release = 0;
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
    landAge = 10,
    impact = 0,
    launchAge = 10,
    curvature = 0,
    look = 0,
    idleTime = 0,
    reduced = true,
  }) {
    const rest =
        !swim &&
        vel < 0.012 &&
        air < 0.002 &&
        landAge > 0.24 &&
        launchAge > 0.17,
      key = rest ? [...at, root, yaw].join("/") : "";
    const headYaw = reduced
      ? 0
      : clamp(look, -0.35, 0.35) +
        0.078 *
          Math.sin(idleTime * 0.78) *
          (0.5 + 0.5 * Math.sin(idleTime * 0.31));
    if (rest && !arrive && restKey === key && wet < 0.0001) {
      if (!reduced) {
        const delta = 0.007 * Math.sin(idleTime * 1.43) - breath;
        breath += delta;
        for (let i = 4; i < 54; i++) {
          bones[i].position.y += delta;
          bones[i].updateMatrixWorld(true);
        }
      }
      applyHead(headYaw);
      return;
    }
    if (arrive) {
      for (const f of legs) {
        f.anchor = null;
        f.release = 0;
      }
    }
    restKey = key;
    clock += dt;
    wet = mix(wet, swim ? 1 : 0, 1 - Math.exp(-dt * (swim ? 5.5 : 7)));
    if (wet < 0.0001) wet = 0;
    if (wet > 0.9999) wet = 1;
    const run = smooth(2.9, 5.5, vel) * (1 - smooth(0.26, 1.12, depth)),
      move = smooth(0.015, 0.75, vel),
      jump = smooth(0.015, 0.24, air) * (1 - wet),
      stride = mix(
        d.clips.walk.stride,
        Math.max(2.82, d.clips.run.stride * (1 + 0.63 * smooth(3.8, 7, vel))),
        run,
      );
    if (move > 0.0001) phase = (phase + (dt * vel) / stride) % 1;
    breath = 0;
    R.sample("stand", 0);
    if (move > 0) {
      R.sample("walk", phase, move);
      R.sample("run", phase, run * move);
    }
    R.sample("jump", 0, jump);
    // On descent widen the arms and extend the boots, blending back into the authored gait.
    const fall = jump * smooth(0.12, 2.6, -vertical);
    if (fall > 0) {
      for (const [k, sg] of [
        [9, 1],
        [32, -1],
      ]) {
        const pivot = bones[k].position,
          q = Q().setFromAxisAngle(new T.Vector3(0, 0, 1), sg * 0.26 * fall);
        for (let j = k + 1; j < k + 22; j++) {
          const b = bones[j];
          b.position.sub(pivot).applyQuaternion(q).add(pivot);
          b.quaternion.premultiply(q);
        }
      }
      for (const leg of legs) bones[leg.ix[2]].position.y -= 0.07 * fall;
    }
    R.sample("swim", clock / 1.53, wet);
    const touchdown =
      Math.min(0.18, Math.max(0, impact - 1) * 0.024) *
      Math.sin(Math.PI * clamp(landAge / 0.24, 0, 1));
    const takeoff =
      launchAge < 0.16 ? Math.sin((Math.PI * launchAge) / 0.16) * 0.045 : 0;
    if (touchdown || takeoff)
      for (const b of bones) b.position.y -= touchdown + takeoff;
    const wade = smooth(0.06, 0.55, depth) * (1 - wet) * move;
    for (let i = 0; i < legs.length; i++) {
      const f = legs[i];
      const k = (phase + 0.5 * i) % 1;
      if (k > 0.44 && wade > 0.01)
        bones[f.ix[2]].position.y +=
          0.12 * wade * Math.sin(((k - 0.44) / 0.56) * Math.PI);
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
      bones[5].position.y += 0.01 * move * Math.sin(phase * Math.PI * 4);
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
    let drop = 0;
    for (let i = 0; i < 2; i++) {
      const f = legs[i],
        [u, l, k] = f.ix,
        [hip, knee, foot] = [bones[u], bones[l], bones[k]],
        t = (phase + i * 0.5) % 1,
        duty = mix(0.44, 0.3, run),
        plant = landW > 0.72 && (rest || t < duty),
        dst = f.target.copy(foot.position),
        free = world(dst);
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
        dst.x = x;
        dst.z = z;
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
        sx = gx * cy - gz * sy,
        sz = gx * sy + gz * cy,
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
      const required = floor - floorRel + 0.0015;
      dst.y = plant ? mix(dst.y, required, landW) : dst.y + landW * floor;
      if (landW > 0.2)
        dst.y = Math.max(
          dst.y,
          required * landW + foot.position.y * (1 - landW),
        );
      f.L1 = hip.position.distanceTo(knee.position);
      f.L2 = knee.position.distanceTo(foot.position);
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
    drop = Math.max(-0.36, drop) * landW;
    if (drop) for (const b of bones) b.position.y += drop;
    for (const f of legs) {
      const [u, l, k] = f.ix,
        [hip, knee, foot] = [bones[u], bones[l], bones[k]],
        K = knee.position.clone(),
        F = foot.position.clone(),
        oldUpper = K.clone().sub(hip.position).normalize(),
        oldLower = F.clone().sub(K).normalize();
      if (landW > 0.0001) {
        const P = hip.position,
          e = f.target.clone().sub(P),
          D = clamp(
            e.length(),
            Math.abs(f.L1 - f.L2) + 0.0001,
            f.L1 + f.L2 - 0.00006,
          );
        e.normalize();
        let pole = K.clone().sub(P);
        pole.addScaledVector(e, -pole.dot(e));
        if (pole.lengthSq() < 0.00001) {
          pole.set(0, 0, -1);
          pole.addScaledVector(e, -pole.dot(e));
        }
        pole.normalize();
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
        stance: f.plant,
        foot: world(foot.position).map(round),
        knee: round(-a.angleTo(b)),
        hip: round(Math.atan2(-a.z, -a.y)),
        lift: round(foot.position.y),
      });
    }
    R.commit();
    if (rest && wet < 0.001) {
      // Authored boots blend across the ankle. Settle the real skinned sole once when stationary,
      // including on triangle boundaries where a single tangent plane is not the exact contact.
      const v = V(),
        a = d.geom.attributes;
      for (let j = 0; j < 2; j++) {
        for (const f of legs) {
          let gap = Infinity,
            wt = 1;
          for (const i of f.verts) {
            R.mesh.getVertexPosition(i, v);
            const d = v.y + root - ground(world(v));
            if (d < gap) {
              gap = d;
              wt = a.skinWeight.getX(i);
            }
          }
          if (Number.isFinite(gap))
            bones[f.ix[2]].position.y += clamp(
              (0.001 - gap) / Math.max(0.25, wt),
              -0.035,
              0.035,
            );
        }
        R.commit();
      }
    }
    last = {
      style,
      asset: d.id,
      bones: bones.length,
      triangles: d.geom.index.count / 3,
      clip: swim
        ? "swim"
        : jump > 0.4
          ? "jump"
          : rest
            ? "stand"
            : run > 0.5
              ? "run"
              : "walk",
      action: swim
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
      swimBlend: round(wet),
      contacts: events,
      feet,
    };
  }
  function applyHead(angle) {
    const h = bones[7];
    h.quaternion.fromArray(d.clips.stand.poses[0], 7 * 7 + 3);
    if (angle) h.quaternion.multiply(Q().setFromAxisAngle(up, angle));
    h.updateMatrixWorld(true);
  }
  const privateMat = R.mesh.material.clone();
  R.mesh.material = privateMat;
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
    metrics: () => last,
    dispose() {
      privateMat.dispose();
      R.dispose();
    },
  };
}
