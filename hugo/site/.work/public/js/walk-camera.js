// The orbit is built FROM the traveller, never a free pitch applied at a fixed camera position.
import * as T from "../vendor/three.module.min.js";
import { ACRE as U, inHouse } from "./metres.js";
import { fenceAt } from "./acre-edge.js";
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
    span = boost ? 6 : clamp(distance, 3.5, 6),
    p = clamp(pitch, -1.06, 0.57),
    lift = Math.max(0, p / 0.57),
    tilt = 0.24 - p * 0.88,
    D = Math.max(3.5, span * (1 - 0.19 * lift)),
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
    for (const [ox, oy, r, ht] of objects || [])
      if (
        Math.hypot(gx - ox, gy - oy) < r + 0.1 / U &&
        Y < hit.z + (ht || 2.6) + 0.13
      )
        return true;
    if (Y < hit.z + 1.3 && fenceAt(fences, gx, gy)) return true;
    for (const h of homes || [])
      if (
        Math.hypot(gx - h.centre[0], gy - h.centre[1]) < 0.33 &&
        Y < s.ground(...h.centre) + h.size_m[2] + 0.15 &&
        inHouse(h, gx, gy, 0.43)
      )
        return true;
    return false;
  }
  // Lift the desired endpoint at a bank; sweep the full boom so an intervening ridge or wall cannot be pierced.
  const [gx, gy] = at(dirX, dirZ),
    q = s.sample(gx, gy),
    endY = Math.max(
      anchorY + dy,
      q.z + 0.26,
      q.depth > 0.035 ? q.line + 0.23 : -Infinity,
    ),
    dv = endY - anchorY;
  let t = 1;
  const n = Math.ceil((D + Math.abs(dv)) / 0.22);
  for (let i = 1; i <= n; i++) {
    let k = i / n;
    if (blocked(dirX * k, anchorY + k * dv, dirZ * k)) {
      t = Math.max(0.035, (i - 1) / n);
      break;
    }
  }
  prev.arm =
    reset || !prev.arm
      ? t
      : Math.min(t, lerp(prev.arm, t, 1 - Math.exp(-step * 10)));
  if (Math.abs(t - prev.arm) < 1e-4) prev.arm = t;
  const k = prev.arm,
    Y = anchorY + dv * k;
  cam.position.set(base[0] + dirX * k, Y, base[2] + dirZ * k);
  const floor = s.sample(...at(dirX * k, dirZ * k));
  cam.position.y = Math.max(
    cam.position.y,
    floor.z + 0.17,
    floor.depth > 0.025 ? floor.line + 0.18 : -Infinity,
  );
  // Aim slightly above the body midpoint to leave a view of the horizon. Clamp framing by its physical height.
  const flat = Math.max(0.04, Math.cos(tilt) * D * k),
    fov = (cam.fov * Math.PI) / 180,
    mid = Math.atan2(anchorY - cam.position.y, flat),
    head = Math.atan2(root + 1.85 - cam.position.y, flat),
    sole = Math.atan2(root - 0.04 - cam.position.y, flat),
    low = head - fov * 0.45,
    high = sole + fov * 0.45;
  cam.rotation.order = "YXZ";
  cam.rotation.set(
    low <= high
      ? clamp(mid + fov * (portrait ? 0.045 : 0.165), low, high)
      : mid,
    a,
    0,
  );
  return {
    arm: Math.hypot(dirX * k, dirZ * k, cam.position.y - anchorY),
    clearance: cam.position.y - floor.z,
    waterClearance: floor.depth > 0.025 ? cam.position.y - floor.line : null,
  };
}
