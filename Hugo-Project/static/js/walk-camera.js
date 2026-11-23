import { houseBlocked } from "./home-volume.js";
import { clearance } from "./contacts.js";
// The orbit is built FROM the traveller, never a free pitch applied at a fixed camera position.
import * as T from "../vendor/three.module.min.js";
import { ACRE as U } from "./metres.js";
import { fenceTop } from "./acre-edge.js";
const clamp = T.MathUtils.clamp,
  lerp = T.MathUtils.lerp;
export function followCamera(
  cam,
  prev,
  {
    s,
    x,
    y,
    root,
    yaw,
    pitch,
    distance,
    swim,
    eye,
    first,
    portrait,
    step,
    reset,
    objects,
    homes,
    fences,
    boost = false,
  },
) {
  prev.p =
    reset || prev.p === undefined
      ? pitch
      : lerp(prev.p, pitch, 1 - Math.exp(-step * 16));
  prev.d =
    reset || prev.d === undefined
      ? distance
      : lerp(prev.d, distance, 1 - Math.exp(-step * 13));
  pitch = prev.p;
  distance = prev.d;
  const base = s.worldXYZ(x, y, root),
    aspect = cam.aspect,
    span = clamp(distance, 2.35, 12),
    p = clamp(pitch, -1.48, 0.94),
    lift = Math.max(0, p / 0.57),
    tilt = clamp(0.24 - p, -0.68, 1.56),
    D = span,
    shoulder = portrait ? 0 : aspect > 1 ? 0.32 : 0.17,
    aim = swim ? 1.03 : 0.94,
    anchor = Math.max(root + aim, swim ? eye - 0.18 : -Infinity),
    anchorY =
      reset || prev.anchor === undefined
        ? anchor
        : clamp(
            lerp(prev.anchor, anchor, 1 - Math.exp(-step * 15)),
            anchor - 0.26,
            anchor + 0.26,
          );
  prev.anchor = anchorY;
  const destYaw = yaw,
    turn =
      prev.yaw === undefined
        ? 0
        : Math.atan2(
            Math.sin(destYaw - prev.yaw),
            Math.cos(destYaw - prev.yaw),
          );
  prev.yaw =
    reset || prev.yaw === undefined
      ? destYaw
      : prev.yaw + turn * (1 - Math.exp(-step * 26));
  if (Math.abs(turn) < 0.0001) prev.yaw = destYaw;
  const a = prev.yaw,
    sn = Math.sin(a),
    cs = Math.cos(a),
    dirX = sn * Math.cos(tilt) * D + cs * shoulder,
    dirZ = cs * Math.cos(tilt) * D - sn * shoulder,
    dy = Math.sin(tilt) * D,
    at = (X, Z) => [x + X / U, y - Z / U];
  if (first) {
    const h = s.sample(x, y);
    cam.position.set(
      base[0],
      Math.max(eye, h.depth > 0.02 ? h.line + 0.23 : -Infinity),
      base[2],
    );
    cam.rotation.order = "YXZ";
    cam.rotation.set(pitch, a, 0);
    prev.arm = 0;
    return { arm: 0, clearance: cam.position.y - h.z };
  }
  function blocked(X, Y, Z) {
    const [gx, gy] = at(X, Z),
      hit = s.sample(gx, gy);
    if (
      !hit.drawn ||
      Y < hit.z + 0.19 ||
      (hit.depth > 0.04 && Y < hit.line + 0.19)
    )
      return true;
    for (const obj of objects || [])
      if (
        Math.hypot(gx - obj[0], gy - obj[1]) < obj[2] + 0.1 / U &&
        clearance(obj, gx, gy) < -0.13 &&
        Y < (obj.base ?? s.ground(obj[0], obj[1])) + (obj[3] || 2.6) + 0.2
      )
        return true;
    if (Y < Math.min(hit.z + 1.6, fenceTop(fences, gx, gy) + 0.17)) return true;
    for (const h of homes || [])
      if (
        Math.hypot(gx - h.centre[0], gy - h.centre[1]) < 0.33 &&
        Y < s.ground(...h.centre) + h.size_m[2] + 0.15 &&
        houseBlocked(h, gx, gy, false, 0.43)
      )
        return true;
    return false;
  }
  // Lift the desired endpoint at a bank; sweep the full boom so an intervening ridge or wall cannot be pierced.
  const test = (da, el) => {
    const sa = Math.sin(a + da),
      ca = Math.cos(a + da),
      xx = sa * Math.cos(el) * D + ca * shoulder,
      zz = ca * Math.cos(el) * D - sa * shoulder,
      end = s.sample(...at(xx, zz)),
      dy = Math.max(
        Math.sin(el) * D,
        end.z + 0.27 - anchorY,
        end.depth > 0.035 ? end.line + 0.29 - anchorY : -Infinity,
      );
    const n = Math.max(3, Math.ceil(Math.hypot(xx, zz, dy) / 0.16));
    let t = 1;
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      if (blocked(xx * k, anchorY + k * dy, zz * k)) {
        t = (i - 1) / n;
        break;
      }
    }
    return { da, el, xx, zz, dy, t, length: t * Math.hypot(xx, zz, dy) };
  };
  // Keep the lens outside the complete standing character. When the back boom is too short,
  // swing around the obstacle instead of continuing to compress through the traveller.
  let best = test(0, tilt);
  const wanted = Math.min(2.48, D * 0.96),
    prior = prev.side || 0;
  if (best.length < wanted) {
    let score = -Infinity;
    for (const el of [tilt, Math.max(0.63, tilt), 1.07, 1.44])
      for (const da of [
        prior,
        0,
        0.52,
        -0.52,
        1.04,
        -1.04,
        1.56,
        -1.56,
        2.12,
        -2.12,
        Math.PI,
      ]) {
        const v = test(da, el);
        if (v.length < 1.98) continue;
        const rank =
          Math.min(wanted, v.length) * 3 -
          Math.abs(da) * 0.55 -
          Math.abs(el - tilt) * 0.72 -
          (Math.abs(prior - da) > 0.3 ? 0.17 : 0);
        if (rank > score) {
          score = rank;
          best = v;
        }
      }
    if (best.length < 1.98) {
      /* vertical escape, above the head capsule rather than inside it */ best =
        { xx: 0, zz: 0, dy: 2.8, da: 0, el: Math.PI / 2, t: 1, length: 2.8 };
    }
  }
  prev.side = best.da;
  const { xx, zz } = best,
    t = best.t;
  let k =
    reset || prev.arm === undefined
      ? t
      : Math.min(t, lerp(prev.arm, t, 1 - Math.exp(-step * 11)));
  k = Math.max(k, Math.min(t, 1.98 / (Math.hypot(xx, zz, best.dy) || 1)));
  prev.arm = k;
  const floor = s.sample(...at(xx * k, zz * k));
  cam.position.set(
    base[0] + xx * k,
    Math.max(
      anchorY + best.dy * k,
      floor.z + 0.23,
      floor.depth > 0.025 ? floor.line + 0.24 : -Infinity,
    ),
    base[2] + zz * k,
  );
  const flat = Math.max(0.01, Math.hypot(xx, zz) * k),
    mid = Math.atan2(anchorY - cam.position.y, flat),
    fov = (cam.fov * Math.PI) / 180,
    head = Math.atan2(root + 1.87 - cam.position.y, flat),
    sole = Math.atan2(root - 0.04 - cam.position.y, flat),
    lo = head - fov * 0.455,
    hi = sole + fov * 0.455;
  cam.rotation.order = "YXZ";
  cam.rotation.set(
    lo < hi ? clamp(mid + fov * (portrait ? 0.035 : 0.11), lo, hi) : mid,
    flat > 0.012 ? Math.atan2(xx, zz) : a,
    0,
  );
  return {
    arm: Math.hypot(flat, cam.position.y - anchorY),
    escape: Math.abs(best.da) > 0.01 || Math.abs(best.el - tilt) > 0.1,
    clearance: cam.position.y - floor.z,
    waterClearance: floor.depth > 0.025 ? cam.position.y - floor.line : null,
  };
}
