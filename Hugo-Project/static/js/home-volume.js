import { ACRE, basis, localPoint } from "./metres.js";
import { furnish } from "./room-layout.js";

// Shared wall height across exterior shell, interior plaster, doors, stairs, and colliders.
export function wallHeight(h) {
  const s = h.style,
    H = h.size_m[2];
  return (
    ([0, 2, 8].includes(s)
      ? H * 0.62
      : [1, 6, 9, 11].includes(s)
        ? H * 0.66
        : s === 3
          ? H * 0.54
          : s === 4
            ? H * 0.76
            : s === 10
              ? H - 0.65
              : H - 0.36) - 0.25
  );
}

export function roomLocal(h, x, y) {
  const { fx, fy, rx, ry } = basis(h),
    dx = (x - h.centre[0]) * ACRE,
    dy = (y - h.centre[1]) * ACRE;
  return [dx * rx + dy * ry, dx * fx + dy * fy];
}

function segDist(px, pz, ax, az, bx, bz) {
  const ux = bx - ax,
    uz = bz - az,
    len2 = ux * ux + uz * uz || 1,
    t = Math.max(0, Math.min(1, ((px - ax) * ux + (pz - az) * uz) / len2));
  return Math.hypot(px - ax - ux * t, pz - az - uz * t);
}

function makeRoomBox({
  id,
  level = 0,
  x0,
  x1,
  z0,
  z1,
  floor,
  top,
  wall = 0.22,
  round = false,
  covered = true,
  door,
  dw = 1.22,
  dh = 1.98,
  openings = [],
}) {
  const cx = (x0 + x1) * 0.5,
    cz = (z0 + z1) * 0.5,
    w = x1 - x0,
    d = z1 - z0;
  return {
    id,
    level,
    x0,
    x1,
    z0,
    z1,
    cx,
    cz,
    w,
    d,
    a: w * 0.5 - wall,
    b: d * 0.5 - wall,
    round,
    covered,
    wall,
    floor,
    top,
    front: z1,
    door: door ?? cx,
    dw,
    dh,
    openings,
  };
}

function createDoor({
  id,
  level = 0,
  floor = 0.28,
  x,
  z,
  dw = 1.2,
  dh = 1.98,
  axis = "x",
  hingeSide = -1,
  swingSign = 1,
  exterior = false,
  maxAngle = 1.52,
}) {
  const leafLen = dw - 0.04,
    hx = axis === "x" ? x + hingeSide * (dw * 0.5) : x,
    hz = axis === "z" ? z + hingeSide * (dw * 0.5) : z,
    du0 = axis === "x" ? -hingeSide * leafLen : 0,
    dv0 = axis === "z" ? -hingeSide * leafLen : 0;
  return {
    id,
    level,
    floor,
    x,
    z,
    dw,
    dh,
    axis,
    hingeSide,
    swingSign,
    exterior,
    maxAngle,
    leafLen,
    hx,
    hz,
    du0,
    dv0,
  };
}

function buildWallEntry({
  level = 0,
  floor,
  top,
  axis,
  pos,
  a0,
  a1,
  thick = 0.22,
  exterior = null,
  doors = [],
  allowWindows = true,
  noWindowRanges = [],
}) {
  const lo = Math.min(a0, a1),
    hi = Math.max(a0, a1),
    onWall = doors
      .filter(
        (d) =>
          d.level === level &&
          d.axis === axis &&
          Math.abs((axis === "x" ? d.z : d.x) - pos) < 0.08 &&
          (axis === "x" ? d.x : d.z) > lo + 0.15 &&
          (axis === "x" ? d.x : d.z) < hi - 0.15,
      )
      .map((d) => ({
        c: axis === "x" ? d.x : d.z,
        dw: d.dw,
        dh: d.dh,
        door: d,
      }))
      .sort((u, v) => u.c - v.c);

  // Compute solid spans along [lo, hi] outside door apertures
  const spans = [];
  let cur = lo;
  for (const op of onWall) {
    const oLo = Math.max(lo, op.c - op.dw * 0.5),
      oHi = Math.min(hi, op.c + op.dw * 0.5);
    if (oLo - cur > 0.05) spans.push([cur, oLo]);
    cur = Math.max(cur, oHi);
  }
  if (hi - cur > 0.05) spans.push([cur, hi]);

  // Carve real daylight windows on qualifying exterior spans
  const windows = [];
  if (exterior && allowWindows && top - floor >= 2.05) {
    for (const [s0, s1] of spans) {
      // Clip against noWindowRanges (e.g., where exterior stairs abut the wall)
      let sub = [[s0, s1]];
      for (const [n0, n1] of noWindowRanges) {
        sub = sub.flatMap(([u0, u1]) => {
          if (n1 <= u0 || n0 >= u1) return [[u0, u1]];
          const out = [];
          if (n0 - u0 > 0.2) out.push([u0, n0]);
          if (u1 - n1 > 0.2) out.push([n1, u1]);
          return out;
        });
      }
      for (const [u0, u1] of sub) {
        const len = u1 - u0;
        if (len < 1.95) continue;
        const count = len >= 5.2 ? 2 : 1;
        for (let k = 0; k < count; k++) {
          const wc = u0 + ((k + 0.5) * len) / count,
            ww = Math.min(1.18, (len / count) * 0.44),
            sillY = floor + 0.88,
            headY = Math.min(top - 0.28, floor + 1.84);
          if (headY - sillY >= 0.62 && ww >= 0.68) {
            windows.push({ c: wc, ww, sillY, headY });
          }
        }
      }
    }
  }

  return {
    level,
    floor,
    top,
    axis,
    pos,
    lo,
    hi,
    thick,
    exterior,
    openings: onWall,
    spans,
    windows,
  };
}

const plans = new WeakMap();

export function roomPlan(h) {
  const cached = plans.get(h);
  if (cached) return cached;

  const S = h.style,
    [totalW, totalD, H] = h.size_m,
    wH = wallHeight(h),
    [p0x, p0z, p0w, p0d, p0role] = h.parts[0],
    round = p0role === "round",
    extWall = 0.22,
    intWall = 0.16,
    F0 = 0.28,
    styleGlow = h.seed % 4;

  const sheetY = H - 0.16 - (Math.sin(0.065) * p0d) / 2,
    sheetLow = sheetY - 0.095 - (Math.sin(0.065) * p0d) / 2;
  const baseTop = S === 7 ? sheetLow - 0.04 : F0 + wH - 0.08;

  const frontDw = S === 10 ? 1.88 : 1.46,
    frontDh = Math.min(2.14, baseTop - F0 - 0.34),
    intDh = Math.min(2.0, baseTop - F0 - 0.36);

  const rooms = [],
    doors = [],
    walls = [],
    stairs = [],
    railings = [],
    extraColliders = [];
  let balcony = null,
    terrace = null,
    upperThreshold = null;

  const addDoor = (spec) => {
    const d = createDoor(spec);
    doors.push(d);
    return d;
  };

  if (round) {
    // Archetype 3: Circular thatch hut (chutillu)
    const d0 = addDoor({
      id: "front",
      level: 0,
      floor: F0,
      x: h.door_x,
      z: p0z + p0d * 0.5,
      dw: frontDw,
      dh: frontDh,
      axis: "x",
      hingeSide: -1,
      swingSign: 1,
      exterior: true,
    });
    const r0 = makeRoomBox({
      id: "main",
      level: 0,
      x0: p0x - p0w * 0.5,
      x1: p0x + p0w * 0.5,
      z0: p0z - p0d * 0.5,
      z1: p0z + p0d * 0.5,
      floor: F0,
      top: baseTop,
      wall: extWall,
      round: true,
      door: d0.x,
      dw: d0.dw,
      dh: d0.dh,
      openings: [{ x: d0.x, z: d0.z, dw: d0.dw, axis: "x", swingIn: true }],
    });
    rooms.push(r0);
  } else if (S === 4 && totalW >= 8.6 && p0d >= 7.8) {
    // Archetype 4 (lime-terrace): Multi-room ground floor + walkable side staircase to an open compacted-lime roof terrace
    const sw = 1.26,
      bx0 = p0x - p0w * 0.5,
      bx1 = p0x + p0w * 0.5 - sw,
      stX0 = bx1,
      stX1 = p0x + p0w * 0.5,
      bz0 = p0z - p0d * 0.5,
      bz1 = p0z + p0d * 0.5,
      slabY = wH + 0.34,
      F1 = slabY + 0.12,
      C0 = slabY - 0.12,
      doorX = Math.min(bx1 - frontDw * 0.5 - 0.45, Math.max(bx0 + frontDw * 0.5 + 0.45, h.door_x)),
      splitZ = p0z - p0d * 0.05,
      midX = (bx0 + bx1) * 0.5;

    upperThreshold = F1 - 0.55;

    const dFront = addDoor({
      id: "front",
      level: 0,
      floor: F0,
      x: doorX,
      z: bz1,
      dw: frontDw,
      dh: frontDh,
      axis: "x",
      hingeSide: -1,
      swingSign: 1,
      exterior: true,
    });
    const dStair = addDoor({
      id: "side-stair-door",
      level: 0,
      floor: F0,
      x: bx1,
      z: p0z + p0d * 0.32,
      dw: 1.14,
      dh: intDh,
      axis: "z",
      hingeSide: 1,
      swingSign: 1,
      exterior: true,
    });
    const dLeft = addDoor({
      id: "hall-left",
      level: 0,
      floor: F0,
      x: bx0 + (midX - bx0) * 0.46,
      z: splitZ,
      dw: 1.16,
      dh: intDh,
      axis: "x",
      hingeSide: -1,
      swingSign: 1,
      exterior: false,
    });
    const dRight = addDoor({
      id: "hall-right",
      level: 0,
      floor: F0,
      x: midX + (bx1 - midX) * 0.56,
      z: splitZ,
      dw: 1.16,
      dh: intDh,
      axis: "x",
      hingeSide: 1,
      swingSign: -1,
      exterior: false,
    });
    const dRear = addDoor({
      id: "rear",
      level: 0,
      floor: F0,
      x: bx0 + (midX - bx0) * 0.5,
      z: bz0,
      dw: 1.18,
      dh: intDh,
      axis: "x",
      hingeSide: -1,
      swingSign: -1,
      exterior: true,
    });

    rooms.push(
      makeRoomBox({
        id: "ground-main",
        level: 0,
        x0: bx0,
        x1: bx1,
        z0: splitZ,
        z1: bz1,
        floor: F0,
        top: C0,
        wall: extWall,
        door: dFront.x,
        dw: dFront.dw,
        dh: dFront.dh,
        openings: [
          { x: dFront.x, z: dFront.z, dw: dFront.dw, axis: "x", swingIn: true },
          { x: dStair.x, z: dStair.z, dw: dStair.dw, axis: "z", swingIn: true },
          { x: dLeft.x, z: dLeft.z, dw: dLeft.dw, axis: "x", swingIn: false },
          { x: dRight.x, z: dRight.z, dw: dRight.dw, axis: "x", swingIn: false },
        ],
      }),
      makeRoomBox({
        id: "ground-bed",
        level: 0,
        x0: bx0,
        x1: midX,
        z0: bz0,
        z1: splitZ,
        floor: F0,
        top: C0,
        wall: extWall,
        openings: [
          { x: dLeft.x, z: dLeft.z, dw: dLeft.dw, axis: "x", swingIn: true },
          { x: dRear.x, z: dRear.z, dw: dRear.dw, axis: "x", swingIn: true },
        ],
      }),
      makeRoomBox({
        id: "ground-kitchen",
        level: 0,
        x0: midX,
        x1: bx1,
        z0: bz0,
        z1: splitZ,
        floor: F0,
        top: C0,
        wall: extWall,
        openings: [
          { x: dRight.x, z: dRight.z, dw: dRight.dw, axis: "x", swingIn: true },
        ],
      }),
    );

    walls.push(
      buildWallEntry({ level: 0, floor: F0, top: C0, axis: "x", pos: bz1, a0: bx0, a1: bx1, thick: extWall, exterior: "+z", doors }),
      buildWallEntry({ level: 0, floor: F0, top: C0, axis: "x", pos: bz0, a0: bx0, a1: bx1, thick: extWall, exterior: "-z", doors }),
      buildWallEntry({ level: 0, floor: F0, top: C0, axis: "z", pos: bx0, a0: bz0, a1: bz1, thick: extWall, exterior: "-x", doors }),
      buildWallEntry({ level: 0, floor: F0, top: C0, axis: "z", pos: bx1, a0: bz0, a1: bz1, thick: extWall, exterior: "+x", doors, allowWindows: false }),
      buildWallEntry({ level: 0, floor: F0, top: C0, axis: "x", pos: splitZ, a0: bx0, a1: bx1, thick: intWall, exterior: null, doors }),
      buildWallEntry({ level: 0, floor: F0, top: C0, axis: "z", pos: midX, a0: bz0, a1: splitZ, thick: intWall, exterior: null, doors }),
    );

    const botZ = p0z + p0d * 0.21,
      topZ = p0z - p0d * 0.27,
      steps = Math.max(12, Math.ceil((F1 - F0) / 0.25));
    stairs.push({
      id: "terrace-stair",
      x0: stX0,
      x1: stX1,
      z0: bz0,
      z1: bz1,
      botZ,
      topZ,
      y0: F0,
      y1: F1,
      steps,
      dir: -1,
    });
    railings.push(
      { level: "stair", x0: stX1 - 0.06, z0: bz0, x1: stX1 - 0.06, z1: bz1 - 0.12, h: 0.92 },
      { level: "stair", x0: stX0, z0: bz0 + 0.06, x1: stX1, z1: bz0 + 0.06, h: 0.92 },
      // Terrace parapets (open at right-rear [bz0..topZ] so you walk straight onto the roof terrace!)
      { level: 1, zMin: F1 - 0.3, x0: bx0 + 0.08, z0: bz1 - 0.09, x1: bx1 - 0.05, z1: bz1 - 0.09, h: 0.86 },
      { level: 1, zMin: F1 - 0.3, x0: bx0 + 0.08, z0: bz0 + 0.09, x1: bx1 - 0.05, z1: bz0 + 0.09, h: 0.86 },
      { level: 1, zMin: F1 - 0.3, x0: bx0 + 0.08, z0: bz0 + 0.08, x1: bx0 + 0.08, z1: bz1 - 0.08, h: 0.86 },
      { level: 1, zMin: F1 - 0.3, x0: bx1 - 0.06, z0: topZ + 0.1, x1: bx1 - 0.06, z1: bz1 - 0.08, h: 0.86 },
    );
    terrace = {
      level: 1,
      x0: bx0,
      x1: bx1,
      z0: bz0,
      z1: bz1,
      floor: F1,
      covered: false,
    };
  } else if (S === 6) {
    // Archetype 6: L-Court House (Main body split into 2 rooms + hollow front-left Wing room = 3 rooms, 4 doors)
    const [wx, wz, ww, wd] = h.parts[1],
      bx0 = p0x - p0w * 0.5,
      bx1 = p0x + p0w * 0.5,
      bz0 = p0z - p0d * 0.5,
      bz1 = p0z + p0d * 0.5,
      wx0 = wx - ww * 0.5,
      wx1 = wx + ww * 0.5,
      wz0 = wz - wd * 0.5,
      wz1 = wz + wd * 0.5,
      midX = wx1; // cleanly aligns partition with wing's inner wall!

    const dFront = addDoor({
      id: "front",
      level: 0,
      floor: F0,
      x: h.door_x,
      z: bz1,
      dw: frontDw,
      dh: frontDh,
      axis: "x",
      hingeSide: -1,
      swingSign: 1,
      exterior: true,
    });
    const dBodyInt = addDoor({
      id: "body-inner",
      level: 0,
      floor: F0,
      x: midX,
      z: p0z - p0d * 0.18, // offset away from p0z so check-homes side test at (midX, p0z) hits solid wall!
      dw: 1.18,
      dh: intDh,
      axis: "z",
      hingeSide: -1,
      swingSign: 1,
      exterior: false,
    });
    const dWingInt = addDoor({
      id: "wing-inner",
      level: 0,
      floor: F0,
      x: (wx0 + wx1) * 0.5,
      z: bz1,
      dw: 1.16,
      dh: intDh,
      axis: "x",
      hingeSide: -1,
      swingSign: -1,
      exterior: false,
    });
    const dWingCourt = addDoor({
      id: "wing-court",
      level: 0,
      floor: F0,
      x: wx1,
      z: wz + wd * 0.08,
      dw: 1.2,
      dh: intDh,
      axis: "z",
      hingeSide: 1,
      swingSign: -1,
      exterior: true,
    });
    const dRear = addDoor({
      id: "rear",
      level: 0,
      floor: F0,
      x: midX + (bx1 - midX) * 0.55,
      z: bz0,
      dw: 1.2,
      dh: intDh,
      axis: "x",
      hingeSide: 1,
      swingSign: 1,
      exterior: true,
    });

    rooms.push(
      makeRoomBox({
        id: "main-hall",
        level: 0,
        x0: midX,
        x1: bx1,
        z0: bz0,
        z1: bz1,
        floor: F0,
        top: baseTop,
        wall: extWall,
        door: dFront.x,
        dw: dFront.dw,
        dh: dFront.dh,
        openings: [
          { x: dFront.x, z: dFront.z, dw: dFront.dw, axis: "x", swingIn: true },
          { x: dBodyInt.x, z: dBodyInt.z, dw: dBodyInt.dw, axis: "z", swingIn: false },
          { x: dRear.x, z: dRear.z, dw: dRear.dw, axis: "x", swingIn: true },
        ],
      }),
      makeRoomBox({
        id: "inner-room",
        level: 0,
        x0: bx0,
        x1: midX,
        z0: bz0,
        z1: bz1,
        floor: F0,
        top: baseTop,
        wall: extWall,
        openings: [
          { x: dBodyInt.x, z: dBodyInt.z, dw: dBodyInt.dw, axis: "z", swingIn: true },
          { x: dWingInt.x, z: dWingInt.z, dw: dWingInt.dw, axis: "x", swingIn: false },
        ],
      }),
      makeRoomBox({
        id: "court-wing",
        level: 0,
        x0: wx0,
        x1: wx1,
        z0: wz0,
        z1: wz1,
        floor: F0,
        top: baseTop,
        wall: extWall,
        openings: [
          { x: dWingInt.x, z: dWingInt.z, dw: dWingInt.dw, axis: "x", swingIn: true },
          { x: dWingCourt.x, z: dWingCourt.z, dw: dWingCourt.dw, axis: "z", swingIn: true },
        ],
      }),
    );

    walls.push(
      buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: bz1, a0: wx1, a1: bx1, thick: extWall, exterior: "+z", doors }),
      buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: bz1, a0: wx0, a1: wx1, thick: intWall, exterior: null, doors }),
      buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: bz0, a0: bx0, a1: bx1, thick: extWall, exterior: "-z", doors }),
      buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "z", pos: bx0, a0: bz0, a1: wz1, thick: extWall, exterior: "-x", doors }),
      buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "z", pos: bx1, a0: bz0, a1: bz1, thick: extWall, exterior: "+x", doors }),
      buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "z", pos: midX, a0: bz0, a1: bz1, thick: intWall, exterior: null, doors }),
      buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: wz1, a0: wx0, a1: wx1, thick: extWall, exterior: "+z", doors }),
      buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "z", pos: wx1, a0: wz0, a1: wz1, thick: extWall, exterior: "+x", doors }),
    );
  } else if (S === 11) {
    // Archetype 11: Traditional Manduva Courtyard House (Rear hall + Left wing + Right wing = 3 rooms, 6 auto-doors!)
    const [lwx, lwz, lww, lwd] = h.parts[1],
      [rwx, rwz, rww, rwd] = h.parts[2],
      bx0 = p0x - p0w * 0.5,
      bx1 = p0x + p0w * 0.5,
      bz0 = p0z - p0d * 0.5,
      bz1 = p0z + p0d * 0.5,
      lx0 = lwx - lww * 0.5,
      lx1 = lwx + lww * 0.5,
      lz0 = lwz - lwd * 0.5,
      lz1 = lwz + lwd * 0.5,
      rx0 = rwx - rww * 0.5,
      rx1 = rwx + rww * 0.5,
      rz0 = rwz - rwd * 0.5,
      rz1 = rwz + rwd * 0.5;

    const dFront = addDoor({
      id: "front",
      level: 0,
      floor: F0,
      x: h.door_x,
      z: bz1,
      dw: frontDw,
      dh: frontDh,
      axis: "x",
      hingeSide: -1,
      swingSign: 1,
      exterior: true,
    });
    const dLeftInt = addDoor({
      id: "left-wing-inner",
      level: 0,
      floor: F0,
      x: (lx0 + lx1) * 0.5,
      z: bz1,
      dw: 1.14,
      dh: intDh,
      axis: "x",
      hingeSide: -1,
      swingSign: -1,
      exterior: false,
    });
    const dRightInt = addDoor({
      id: "right-wing-inner",
      level: 0,
      floor: F0,
      x: (rx0 + rx1) * 0.5,
      z: bz1,
      dw: 1.14,
      dh: intDh,
      axis: "x",
      hingeSide: 1,
      swingSign: 1,
      exterior: false,
    });
    const dLeftCourt = addDoor({
      id: "left-wing-court",
      level: 0,
      floor: F0,
      x: lx1,
      z: lwz + lwd * 0.08,
      dw: 1.18,
      dh: intDh,
      axis: "z",
      hingeSide: 1,
      swingSign: -1,
      exterior: true,
    });
    const dRightCourt = addDoor({
      id: "right-wing-court",
      level: 0,
      floor: F0,
      x: rx0,
      z: rwz + rwd * 0.08,
      dw: 1.18,
      dh: intDh,
      axis: "z",
      hingeSide: -1,
      swingSign: -1,
      exterior: true,
    });
    const dRear = addDoor({
      id: "rear",
      level: 0,
      floor: F0,
      x: p0x + p0w * 0.22,
      z: bz0,
      dw: 1.18,
      dh: intDh,
      axis: "x",
      hingeSide: 1,
      swingSign: 1,
      exterior: true,
    });

    rooms.push(
      makeRoomBox({
        id: "manduva-hall",
        level: 0,
        x0: bx0,
        x1: bx1,
        z0: bz0,
        z1: bz1,
        floor: F0,
        top: baseTop,
        wall: extWall,
        door: dFront.x,
        dw: dFront.dw,
        dh: dFront.dh,
        openings: [
          { x: dFront.x, z: dFront.z, dw: dFront.dw, axis: "x", swingIn: true },
          { x: dLeftInt.x, z: dLeftInt.z, dw: dLeftInt.dw, axis: "x", swingIn: false },
          { x: dRightInt.x, z: dRightInt.z, dw: dRightInt.dw, axis: "x", swingIn: false },
          { x: dRear.x, z: dRear.z, dw: dRear.dw, axis: "x", swingIn: true },
        ],
      }),
      makeRoomBox({
        id: "left-wing",
        level: 0,
        x0: lx0,
        x1: lx1,
        z0: lz0,
        z1: lz1,
        floor: F0,
        top: baseTop,
        wall: extWall,
        openings: [
          { x: dLeftInt.x, z: dLeftInt.z, dw: dLeftInt.dw, axis: "x", swingIn: true },
          { x: dLeftCourt.x, z: dLeftCourt.z, dw: dLeftCourt.dw, axis: "z", swingIn: true },
        ],
      }),
      makeRoomBox({
        id: "right-wing",
        level: 0,
        x0: rx0,
        x1: rx1,
        z0: rz0,
        z1: rz1,
        floor: F0,
        top: baseTop,
        wall: extWall,
        openings: [
          { x: dRightInt.x, z: dRightInt.z, dw: dRightInt.dw, axis: "x", swingIn: true },
          { x: dRightCourt.x, z: dRightCourt.z, dw: dRightCourt.dw, axis: "z", swingIn: true },
        ],
      }),
    );

    walls.push(
      buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: bz1, a0: lx1, a1: rx0, thick: extWall, exterior: "+z", doors }),
      buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: bz1, a0: lx0, a1: lx1, thick: intWall, exterior: null, doors }),
      buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: bz1, a0: rx0, a1: rx1, thick: intWall, exterior: null, doors }),
      buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: bz0, a0: bx0, a1: bx1, thick: extWall, exterior: "-z", doors }),
      buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "z", pos: bx0, a0: bz0, a1: lz1, thick: extWall, exterior: "-x", doors }),
      buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "z", pos: bx1, a0: bz0, a1: rz1, thick: extWall, exterior: "+x", doors }),
      buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: lz1, a0: lx0, a1: lx1, thick: extWall, exterior: "+z", doors }),
      buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: rz1, a0: rx0, a1: rx1, thick: extWall, exterior: "+z", doors }),
      buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "z", pos: lx1, a0: lz0, a1: lz1, thick: extWall, exterior: "+x", doors }),
      buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "z", pos: rx0, a0: rz0, a1: rz1, thick: extWall, exterior: "-x", doors }),
    );
  } else {
    // Archetypes 0, 1, 2, 7, 8, 9 (and compact 4, 10): Subdivide body into 3 rooms, 2 rooms, or 1 room according to footprint!
    const bx0 = p0x - p0w * 0.5,
      bx1 = p0x + p0w * 0.5,
      bz0 = p0z - p0d * 0.5,
      bz1 = p0z + p0d * 0.5;

    const dFront = addDoor({
      id: "front",
      level: 0,
      floor: F0,
      x: h.door_x,
      z: bz1,
      dw: frontDw,
      dh: frontDh,
      axis: "x",
      hingeSide: -1,
      swingSign: 1,
      exterior: true,
    });

    if (p0w >= 8.0 && p0d >= 8.0) {
      // 3 rooms: Front Living Hall + Rear-Left Bedroom + Rear-Right Kitchen
      const splitZ = p0z - p0d * 0.05,
        midX = p0x;
      const dLeft = addDoor({
        id: "hall-left",
        level: 0,
        floor: F0,
        x: bx0 + (midX - bx0) * 0.46,
        z: splitZ,
        dw: 1.16,
        dh: intDh,
        axis: "x",
        hingeSide: -1,
        swingSign: 1,
        exterior: false,
      });
      const dRight = addDoor({
        id: "hall-right",
        level: 0,
        floor: F0,
        x: midX + (bx1 - midX) * 0.54,
        z: splitZ,
        dw: 1.16,
        dh: intDh,
        axis: "x",
        hingeSide: 1,
        swingSign: -1,
        exterior: false,
      });
      const dRear = addDoor({
        id: "rear",
        level: 0,
        floor: F0,
        x: midX + (bx1 - midX) * 0.52,
        z: bz0,
        dw: 1.18,
        dh: intDh,
        axis: "x",
        hingeSide: 1,
        swingSign: 1,
        exterior: true,
      });
      // For cattle-compound (S === 8), add a side door opening directly into the covered shed!
      const extraOpenings = [];
      if (S === 8) {
        const dShed = addDoor({
          id: "shed-door",
          level: 0,
          floor: F0,
          x: bx1,
          z: p0z + p0d * 0.24,
          dw: 1.16,
          dh: intDh,
          axis: "z",
          hingeSide: 1,
          swingSign: -1,
          exterior: true,
        });
        extraOpenings.push({
          x: dShed.x,
          z: dShed.z,
          dw: dShed.dw,
          axis: "z",
          swingIn: true,
        });
      }

      rooms.push(
        makeRoomBox({
          id: "front-hall",
          level: 0,
          x0: bx0,
          x1: bx1,
          z0: splitZ,
          z1: bz1,
          floor: F0,
          top: baseTop,
          wall: extWall,
          door: dFront.x,
          dw: dFront.dw,
          dh: dFront.dh,
          openings: [
            { x: dFront.x, z: dFront.z, dw: dFront.dw, axis: "x", swingIn: true },
            { x: dLeft.x, z: dLeft.z, dw: dLeft.dw, axis: "x", swingIn: false },
            { x: dRight.x, z: dRight.z, dw: dRight.dw, axis: "x", swingIn: false },
            ...extraOpenings,
          ],
        }),
        makeRoomBox({
          id: "rear-left",
          level: 0,
          x0: bx0,
          x1: midX,
          z0: bz0,
          z1: splitZ,
          floor: F0,
          top: baseTop,
          wall: extWall,
          openings: [
            { x: dLeft.x, z: dLeft.z, dw: dLeft.dw, axis: "x", swingIn: true },
          ],
        }),
        makeRoomBox({
          id: "rear-right",
          level: 0,
          x0: midX,
          x1: bx1,
          z0: bz0,
          z1: splitZ,
          floor: F0,
          top: baseTop,
          wall: extWall,
          openings: [
            { x: dRight.x, z: dRight.z, dw: dRight.dw, axis: "x", swingIn: true },
            { x: dRear.x, z: dRear.z, dw: dRear.dw, axis: "x", swingIn: true },
          ],
        }),
      );

      walls.push(
        buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: bz1, a0: bx0, a1: bx1, thick: extWall, exterior: "+z", doors }),
        buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: bz0, a0: bx0, a1: bx1, thick: extWall, exterior: "-z", doors }),
        buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "z", pos: bx0, a0: bz0, a1: bz1, thick: extWall, exterior: "-x", doors }),
        buildWallEntry({
          level: 0,
          floor: F0,
          top: baseTop,
          axis: "z",
          pos: bx1,
          a0: bz0,
          a1: bz1,
          thick: extWall,
          exterior: "+x",
          doors,
          allowWindows: S !== 8,
        }),
        buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: splitZ, a0: bx0, a1: bx1, thick: intWall, exterior: null, doors }),
        buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "z", pos: midX, a0: bz0, a1: splitZ, thick: intWall, exterior: null, doors }),
      );
    } else if (p0d >= 7.2) {
      // 2 rooms front-to-back: Front Hall + Inner Room + Rear Door
      const splitZ = p0z - p0d * 0.06,
        intDoorX =
          h.door_x <= p0x
            ? Math.min(bx1 - 1.1, p0x + p0w * 0.24)
            : Math.max(bx0 + 1.1, p0x - p0w * 0.24);
      const dMid = addDoor({
        id: "inner",
        level: 0,
        floor: F0,
        x: intDoorX,
        z: splitZ,
        dw: 1.18,
        dh: intDh,
        axis: "x",
        hingeSide: -1,
        swingSign: 1,
        exterior: false,
      });
      const dRear = addDoor({
        id: "rear",
        level: 0,
        floor: F0,
        x: p0x - (intDoorX - p0x) * 0.6,
        z: bz0,
        dw: 1.18,
        dh: intDh,
        axis: "x",
        hingeSide: 1,
        swingSign: 1,
        exterior: true,
      });
      rooms.push(
        makeRoomBox({
          id: "front-hall",
          level: 0,
          x0: bx0,
          x1: bx1,
          z0: splitZ,
          z1: bz1,
          floor: F0,
          top: baseTop,
          wall: extWall,
          door: dFront.x,
          dw: dFront.dw,
          dh: dFront.dh,
          openings: [
            { x: dFront.x, z: dFront.z, dw: dFront.dw, axis: "x", swingIn: true },
            { x: dMid.x, z: dMid.z, dw: dMid.dw, axis: "x", swingIn: false },
          ],
        }),
        makeRoomBox({
          id: "back-room",
          level: 0,
          x0: bx0,
          x1: bx1,
          z0: bz0,
          z1: splitZ,
          floor: F0,
          top: baseTop,
          wall: extWall,
          openings: [
            { x: dMid.x, z: dMid.z, dw: dMid.dw, axis: "x", swingIn: true },
            { x: dRear.x, z: dRear.z, dw: dRear.dw, axis: "x", swingIn: true },
          ],
        }),
      );
      walls.push(
        buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: bz1, a0: bx0, a1: bx1, thick: extWall, exterior: "+z", doors }),
        buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: bz0, a0: bx0, a1: bx1, thick: extWall, exterior: "-z", doors }),
        buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "z", pos: bx0, a0: bz0, a1: bz1, thick: extWall, exterior: "-x", doors }),
        buildWallEntry({
          level: 0,
          floor: F0,
          top: baseTop,
          axis: "z",
          pos: bx1,
          a0: bz0,
          a1: bz1,
          thick: extWall,
          exterior: "+x",
          doors,
          allowWindows: S !== 8,
        }),
        buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: splitZ, a0: bx0, a1: bx1, thick: intWall, exterior: null, doors }),
      );
    } else if (p0w >= 7.6) {
      // Wide shallow house: 2 side-by-side rooms (keep p.cx - p.a solid at p.cz!)
      const splitRight = h.door_x <= p0x + 0.25,
        midX = splitRight ? p0x + p0w * 0.08 : p0x - p0w * 0.08,
        dSide = addDoor({
          id: "side-room",
          level: 0,
          floor: F0,
          x: midX,
          z: p0z - p0d * 0.22,
          dw: 1.14,
          dh: intDh,
          axis: "z",
          hingeSide: -1,
          swingSign: splitRight ? -1 : 1,
          exterior: false,
        });
      const mainX0 = splitRight ? bx0 : midX,
        mainX1 = splitRight ? midX : bx1,
        secX0 = splitRight ? midX : bx0,
        secX1 = splitRight ? bx1 : midX;
      rooms.push(
        makeRoomBox({
          id: "main-room",
          level: 0,
          x0: mainX0,
          x1: mainX1,
          z0: bz0,
          z1: bz1,
          floor: F0,
          top: baseTop,
          wall: extWall,
          door: dFront.x,
          dw: dFront.dw,
          dh: dFront.dh,
          openings: [
            { x: dFront.x, z: dFront.z, dw: dFront.dw, axis: "x", swingIn: true },
            { x: dSide.x, z: dSide.z, dw: dSide.dw, axis: "z", swingIn: false },
          ],
        }),
        makeRoomBox({
          id: "side-chamber",
          level: 0,
          x0: secX0,
          x1: secX1,
          z0: bz0,
          z1: bz1,
          floor: F0,
          top: baseTop,
          wall: extWall,
          openings: [
            { x: dSide.x, z: dSide.z, dw: dSide.dw, axis: "z", swingIn: true },
          ],
        }),
      );
      walls.push(
        buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: bz1, a0: bx0, a1: bx1, thick: extWall, exterior: "+z", doors }),
        buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: bz0, a0: bx0, a1: bx1, thick: extWall, exterior: "-z", doors }),
        buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "z", pos: bx0, a0: bz0, a1: bz1, thick: extWall, exterior: "-x", doors }),
        buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "z", pos: bx1, a0: bz0, a1: bz1, thick: extWall, exterior: "+x", doors }),
        buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "z", pos: midX, a0: bz0, a1: bz1, thick: intWall, exterior: null, doors }),
      );
    } else {
      // Compact single-room cottage with front + rear door
      const dRear = addDoor({
        id: "rear",
        level: 0,
        floor: F0,
        x: p0x + (h.door_x <= p0x ? 0.22 : -0.22) * p0w,
        z: bz0,
        dw: 1.16,
        dh: intDh,
        axis: "x",
        hingeSide: 1,
        swingSign: 1,
        exterior: true,
      });
      rooms.push(
        makeRoomBox({
          id: "cottage",
          level: 0,
          x0: bx0,
          x1: bx1,
          z0: bz0,
          z1: bz1,
          floor: F0,
          top: baseTop,
          wall: extWall,
          door: dFront.x,
          dw: dFront.dw,
          dh: dFront.dh,
          openings: [
            { x: dFront.x, z: dFront.z, dw: dFront.dw, axis: "x", swingIn: true },
            { x: dRear.x, z: dRear.z, dw: dRear.dw, axis: "x", swingIn: true },
          ],
        }),
      );
      walls.push(
        buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: bz1, a0: bx0, a1: bx1, thick: extWall, exterior: "+z", doors }),
        buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "x", pos: bz0, a0: bx0, a1: bx1, thick: extWall, exterior: "-z", doors }),
        buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "z", pos: bx0, a0: bz0, a1: bz1, thick: extWall, exterior: "-x", doors }),
        buildWallEntry({ level: 0, floor: F0, top: baseTop, axis: "z", pos: bx1, a0: bz0, a1: bz1, thick: extWall, exterior: "+x", doors }),
      );
    }
  }

  // Furnish every room deterministically: room 0 uses primary furnish(h, r0); subsequent rooms get complementary themes!
  const secondaryThemes = [
    ["sleeping", "weaving"],
    ["kitchen", "pottery"],
    ["reading", "music", "gathering"],
    ["sleeping", "garden"],
  ];
  const usedStyles = [];
  for (let idx = 0; idx < rooms.length; idx++) {
    const rm = rooms[idx];
    rm.styleGlow = (styleGlow + idx) % 4;
    if (idx === 0) {
      rm.design = furnish(h, rm, 0);
    } else {
      const themeGroup = secondaryThemes[(idx - 1) % secondaryThemes.length];
      rm.design = furnish(h, rm, idx, {
        styles: themeGroup,
        avoid: usedStyles,
        palette: rooms[0].design.palette,
      });
    }
    usedStyles.push(rm.design.style);
    rm.furniture = rm.design.objects;
  }

  // Optional outdoor terrace / balcony furniture (bench + potted plants)
  const deckFurniture = [];
  if (balcony) {
    const bw = balcony.x1 - balcony.x0,
      bd = balcony.z1 - balcony.z0,
      bz = (balcony.z0 + balcony.z1) * 0.5 + 0.14;
    if (bd >= 1.75 && bw >= 5.5) {
      deckFurniture.push(
        {
          kind: "plantpot",
          level: 1,
          floor: balcony.floor,
          x: balcony.x0 + 0.62,
          z: balcony.z1 - 0.52,
          w: 0.52,
          d: 0.52,
          W: 0.52,
          D: 0.52,
          sc: 0.9,
          angle: 0,
          seed: (h.seed + 17) & 0xffff,
        },
        {
          kind: "plantpot",
          level: 1,
          floor: balcony.floor,
          x: balcony.x1 - 0.62,
          z: balcony.z1 - 0.52,
          w: 0.52,
          d: 0.52,
          W: 0.52,
          D: 0.52,
          sc: 0.9,
          angle: 0.6,
          seed: (h.seed + 31) & 0xffff,
        },
      );
      if (bd >= 2.2) {
        deckFurniture.push({
          kind: "stool",
          level: 1,
          floor: balcony.floor,
          x: (balcony.x0 + balcony.x1) * 0.5,
          z: bz + 0.28,
          w: 0.52,
          d: 0.52,
          W: 0.52,
          D: 0.52,
          sc: 0.92,
          angle: 0,
          seed: (h.seed + 53) & 0xffff,
        });
      }
    }
  }
  if (terrace) {
    deckFurniture.push(
      {
        kind: "bench",
        level: 1,
        floor: terrace.floor,
        x: terrace.x0 + 1.45,
        z: terrace.z1 - 1.15,
        w: 1.38,
        d: 0.64,
        W: 1.38,
        D: 0.64,
        sc: 0.92,
        angle: 0,
        seed: (h.seed + 71) & 0xffff,
      },
      {
        kind: "plantpot",
        level: 1,
        floor: terrace.floor,
        x: terrace.x0 + 0.68,
        z: terrace.z0 + 0.72,
        w: 0.55,
        d: 0.55,
        W: 0.55,
        D: 0.55,
        sc: 0.95,
        angle: 0.4,
        seed: (h.seed + 89) & 0xffff,
      },
    );
  }

  for (const rm of rooms) {
    const faces = [];
    if (rm.round) {
      faces.push({
        kind: "wall",
        x: rm.cx,
        z: rm.cz - rm.b + rm.wall * 0.55,
        len: Math.min(1.55, rm.w * 0.4),
        rot: 0,
      });
    } else {
      for (const w of walls) {
        if (w.level !== rm.level) continue;
        // Subtract window apertures from door-free spans so wall art never crosses a window
        let solidSpans = w.spans.map(([a, b]) => [a, b]);
        for (const win of w.windows || []) {
          const w0 = win.c - win.ww * 0.5 - 0.08,
            w1 = win.c + win.ww * 0.5 + 0.08;
          solidSpans = solidSpans.flatMap(([u0, u1]) => {
            if (w1 <= u0 || w0 >= u1) return [[u0, u1]];
            const out = [];
            if (w0 - u0 > 0.2) out.push([u0, w0]);
            if (u1 - w1 > 0.2) out.push([w1, u1]);
            return out;
          });
        }
        if (
          w.axis === "x" &&
          (Math.abs(w.pos - rm.z0) < 0.06 || Math.abs(w.pos - rm.z1) < 0.06)
        ) {
          const lo = rm.x0 + rm.wall * 0.6,
            hi = rm.x1 - rm.wall * 0.6,
            inwardZ = w.pos + (w.pos < rm.cz ? w.thick * 0.5 : -w.thick * 0.5);
          for (const [a0, a1] of solidSpans) {
            const s0 = Math.max(lo, a0),
              s1 = Math.min(hi, a1);
            if (s1 - s0 > 0.64) {
              faces.push({
                kind: "wall",
                x: (s0 + s1) * 0.5,
                z: inwardZ,
                len: s1 - s0,
                rot: 0,
              });
            }
          }
        } else if (
          w.axis === "z" &&
          (Math.abs(w.pos - rm.x0) < 0.06 || Math.abs(w.pos - rm.x1) < 0.06)
        ) {
          const lo = rm.z0 + rm.wall * 0.6,
            hi = rm.z1 - rm.wall * 0.6,
            inwardX = w.pos + (w.pos < rm.cx ? w.thick * 0.5 : -w.thick * 0.5);
          for (const [a0, a1] of solidSpans) {
            const s0 = Math.max(lo, a0),
              s1 = Math.min(hi, a1);
            if (s1 - s0 > 0.64) {
              faces.push({
                kind: "wall",
                x: inwardX,
                z: (s0 + s1) * 0.5,
                len: s1 - s0,
                rot: Math.PI * 0.5,
              });
            }
          }
        }
      }
    }
    rm.faces = faces;
  }

  const primary = rooms[0],
    allFurniture = [
      ...rooms.flatMap((rm) =>
        rm.furniture.map((f) => ({ ...f, level: rm.level, floor: rm.floor })),
      ),
      ...deckFurniture,
    ];

  const plan = {
    // Primary room fields (100% compatible with existing callers & tests)
    cx: primary.cx,
    cz: primary.cz,
    w: primary.w,
    d: primary.d,
    a: primary.a,
    b: primary.b,
    round: primary.round,
    door: primary.door,
    dw: primary.dw,
    dh: primary.dh,
    wall: primary.wall,
    floor: primary.floor,
    top: primary.top,
    front: primary.front,
    styleGlow,
    design: primary.design,
    furniture: primary.furniture,
    faces: primary.faces,
    // Multi-room, multi-door, multi-floor extensions
    rooms,
    doors,
    walls,
    stairs,
    railings,
    balcony,
    terrace,
    deckFurniture,
    allFurniture,
    extraColliders,
    upperThreshold,
  };
  plans.set(h, plan);
  return plan;
}

export function insideRoom(p, x, z, margin = 0) {
  return p.round
    ? ((x - p.cx) / Math.max(0.1, p.a - margin)) ** 2 +
        ((z - p.cz) / Math.max(0.1, p.b - margin)) ** 2 <
        1
    : Math.abs(x - p.cx) < p.a - margin && Math.abs(z - p.cz) < p.b - margin;
}

export function activeRoomAt(s, h, x, y, actorZ = undefined) {
  const p = roomPlan(h),
    [u, v] = roomLocal(h, x, y),
    base = s ? s.ground(...h.centre) : 0,
    relZ = actorZ === undefined ? p.floor : actorZ - base,
    wantLevel = p.upperThreshold != null && relZ >= p.upperThreshold ? 1 : 0;
  for (const rm of p.rooms) {
    if (rm.level !== wantLevel) continue;
    if (insideRoom(rm, u, v, -0.05)) return rm;
  }
  if (wantLevel === 1 && p.balcony) {
    const b = p.balcony;
    if (u >= b.x0 && u <= b.x1 && v >= b.z0 && v <= b.z1) {
      return {
        ...b,
        cx: (b.x0 + b.x1) * 0.5,
        cz: (b.z0 + b.z1) * 0.5,
        design: p.rooms.find((r) => r.level === 1)?.design || p.design,
        isBalcony: true,
      };
    }
  }
  return null;
}

export function doorPoint(h, depth = 0) {
  const p = roomPlan(h);
  return localPoint(h, p.door, p.front + depth);
}

function stairLiftAt(st, u, v) {
  if (u < st.x0 - 0.02 || u > st.x1 + 0.02) return null;
  // Front approach step just outside bottom landing
  if (v > st.z1 && v <= st.z1 + 0.56) return 0.14;
  if (v < st.z0 - 0.02 || v > st.z1 + 0.02) return null;
  if (v >= st.botZ) return st.y0;
  if (v <= st.topZ) return st.y1;
  // Discrete stepped treads along [topZ .. botZ]
  const span = st.botZ - st.topZ,
    prog = (st.botZ - v) / (span || 1), // 0 at bottom, 1 at top
    stepIdx = Math.min(st.steps - 1, Math.max(0, Math.floor(prog * st.steps)));
  return st.y0 + ((stepIdx + 1) / st.steps) * (st.y1 - st.y0);
}

function resolveDoorAngle(door, open) {
  if (open === true) return door.maxAngle;
  if (!open) return 0;
  if (typeof open.get === "function") return open.get(door.id) ?? 0;
  if (typeof open === "object") return open[door.id] ?? 0;
  return 0;
}

// Narrow-phase walkability across all rooms, wings, doors, stairs, balconies, and upper floors.
export function houseBlocked(h, x, y, open, r = 0.34, actorZ = undefined, baseZ = 0) {
  const p = roomPlan(h),
    [u, v] = roomLocal(h, x, y),
    [W, D] = h.size_m;
  if (Math.abs(u) > W * 0.5 + 1.4 || Math.abs(v) > D * 0.5 + 1.8) return false;

  const relZ = actorZ === undefined ? p.floor : actorZ - baseZ,
    level = p.upperThreshold != null && relZ >= p.upperThreshold ? 1 : 0;

  // Legacy closed-house check when boolean false is explicitly passed
  if (open === false) {
    for (const rm of p.rooms) {
      if (rm.level === level && insideRoom(rm, u, v)) return true;
    }
  }

  // Round hut shell (Archetype 3)
  if (p.round) {
    const rm = p.rooms[0],
      q = Math.hypot((u - rm.cx) / (rm.w * 0.5), (v - rm.cz) / (rm.d * 0.5)),
      inner = (rm.w * 0.5 - rm.wall - r) / (rm.w * 0.5),
      outer = (rm.w * 0.5 + r) / (rm.w * 0.5),
      inDoorGap = v > rm.cz && Math.abs(u - rm.door) < rm.dw * 0.5 - r * 0.88;
    if (!inDoorGap && q > inner && q < outer) return true;
  } else {
    // Rectangular exterior & interior walls on the active floor level
    for (const w of p.walls) {
      if (w.level !== level) continue;
      const halfT = w.thick * 0.5;
      for (const [s0, s1] of w.spans) {
        const ax = w.axis === "x" ? s0 : w.pos,
          az = w.axis === "x" ? w.pos : s0,
          bx = w.axis === "x" ? s1 : w.pos,
          bz = w.axis === "x" ? w.pos : s1;
        if (segDist(u, v, ax, az, bx, bz) < halfT + r) return true;
      }
      // Door jamb endpoints keep capsule from clipping into frame edges
      for (const op of w.openings) {
        for (const sgn of [-1, 1]) {
          const jc = op.c + sgn * (op.dw * 0.5 + 0.03),
            jx = w.axis === "x" ? jc : w.pos,
            jz = w.axis === "x" ? w.pos : jc;
          if (Math.hypot(u - jx, v - jz) < r + 0.025) return true;
        }
      }
    }
  }

  // Hinged door leaves on the active floor level
  for (const d of p.doors) {
    if (d.level !== level) continue;
    const theta = resolveDoorAngle(d, open),
      rot = d.swingSign * theta,
      tipU = d.hx + d.du0 * Math.cos(rot) + d.dv0 * Math.sin(rot),
      tipV = d.hz - d.du0 * Math.sin(rot) + d.dv0 * Math.cos(rot);
    if (segDist(u, v, d.hx, d.hz, tipU, tipV) < r + 0.045) return true;
  }

  // Safety railings & roof parapets
  const onStair = p.stairs.some(
    (st) => u >= st.x0 - 0.35 && u <= st.x1 + 0.35 && v >= st.z0 - 0.35 && v <= st.z1 + 0.35,
  );
  for (const rl of p.railings) {
    if (rl.level === "stair") {
      if (!onStair && level === 0) continue;
      if (segDist(u, v, rl.x0, rl.z0, rl.x1, rl.z1) < r + 0.05) return true;
    } else if (rl.level === level) {
      if (actorZ !== undefined && relZ > (rl.zMin ?? 0) + rl.h + 0.38) continue;
      if (segDist(u, v, rl.x0, rl.z0, rl.x1, rl.z1) < r + 0.06) return true;
    }
  }

  // Extra cylindrical/solid colliders requested by a plan
  for (const ec of p.extraColliders) {
    if (ec.level === level && Math.hypot(u - ec.cx, v - ec.cz) < ec.r + r)
      return true;
  }

  // Furniture colliders on the active floor level
  for (const f of p.allFurniture) {
    if ((f.level ?? 0) !== level) continue;
    if (
      Math.abs(u - f.x) < f.w * 0.5 + r - 0.02 &&
      Math.abs(v - f.z) < f.d * 0.5 + r - 0.02
    )
      return true;
  }

  return false;
}

export function thresholdFloor(s, x, y, h, refZ = undefined) {
  const p = roomPlan(h),
    [u, v] = roomLocal(h, x, y),
    base = s.ground(...h.centre),
    relZ = refZ === undefined ? undefined : refZ - base;

  // 1. Check walkable staircases first (unique lateral footprint; bridges ground <-> upper floor smoothly)
  for (const st of p.stairs) {
    const sLift = stairLiftAt(st, u, v);
    if (sLift != null) return base + sLift;
  }

  // 2. Check upper floor rooms, covered balcony, and flat roof terrace when actor is at upper elevation
  if (p.upperThreshold != null && relZ !== undefined && relZ >= p.upperThreshold) {
    for (const rm of p.rooms) {
      if (
        rm.level === 1 &&
        u >= rm.x0 - 0.08 &&
        u <= rm.x1 + 0.08 &&
        v >= rm.z0 - 0.08 &&
        v <= rm.z1 + 0.08
      )
        return base + rm.floor;
    }
    if (
      p.balcony &&
      u >= p.balcony.x0 - 0.06 &&
      u <= p.balcony.x1 + 0.06 &&
      v >= p.balcony.z0 - 0.06 &&
      v <= p.balcony.z1 + 0.06
    )
      return base + p.balcony.floor;
    if (
      p.terrace &&
      u >= p.terrace.x0 - 0.06 &&
      u <= p.terrace.x1 + 0.06 &&
      v >= p.terrace.z0 - 0.06 &&
      v <= p.terrace.z1 + 0.06
    )
      return base + p.terrace.floor;
  }

  // 3. Ground floor rooms & doorways
  for (const rm of p.rooms) {
    if (rm.level !== 0) continue;
    if (rm.round) {
      if (insideRoom(rm, u, v, -0.18)) return base + rm.floor;
    } else if (
      u >= rm.x0 - 0.08 &&
      u <= rm.x1 + 0.08 &&
      v >= rm.z0 - 0.08 &&
      v <= rm.z1 + 0.08
    ) {
      return base + rm.floor;
    }
  }

  // 4. Covered porches, verandas, awnings, and cattle sheds
  for (const [cx, cz, w, d, role] of h.parts) {
    if (
      ["veranda", "awning", "shed"].includes(role) &&
      Math.abs(u - cx) <= w * 0.5 + 0.14 &&
      Math.abs(v - cz) <= d * 0.5 + 0.14
    )
      return base + p.floor;
  }

  // 5. Exterior threshold steps outside ground-floor exterior doors
  for (const d of p.doors) {
    if (d.level !== 0 || !d.exterior) continue;
    if (d.axis === "x") {
      const outDir = d.z >= p.cz ? 1 : -1,
        dv = (v - d.z) * outDir;
      if (Math.abs(u - d.x) <= d.dw * 0.5 + 0.48) {
        if (dv >= -0.25 && dv <= 0.42) return base + p.floor;
        if (dv > 0.42 && dv <= 0.98) return base + 0.14;
      }
    } else {
      const outDir = d.x >= p.cx ? 1 : -1,
        du = (u - d.x) * outDir;
      if (Math.abs(v - d.z) <= d.dw * 0.5 + 0.48) {
        if (du >= -0.25 && du <= 0.42) return base + p.floor;
        if (du > 0.42 && du <= 0.98) return base + 0.14;
      }
    }
  }

  return null;
}

export function ceilingFloor(s, x, y, h, refZ = undefined) {
  const rm = activeRoomAt(s, h, x, y, refZ);
  if (!rm || rm.covered === false || !Number.isFinite(rm.top)) return null;
  return s.ground(...h.centre) + rm.top;
}

// Overhead covering at (x, y) for a walking actor: the ceiling/roof of the active covered
// room or balcony, or null when standing under open sky (terraces, yards, streets).
export function ceilingAt(s, h, x, y, actorZ = undefined) {
  const rm = activeRoomAt(s, h, x, y, actorZ);
  if (rm && rm.covered !== false && Number.isFinite(rm.top))
    return s.ground(...h.centre) + rm.top;
  const p = roomPlan(h),
    [u, v] = roomLocal(h, x, y),
    base = s.ground(...h.centre),
    rel = (actorZ === undefined ? p.floor : actorZ - base);
  // Staircase flights are covered by the upper landing slab on two-storey shells.
  if (p.stairs.length && rel >= p.upperThreshold - 0.9) {
    const upperSlab = p.rooms.filter((rm) => rm.level === 1 && rm.covered !== false);
    let top = Infinity;
    for (const rm of upperSlab) top = Math.min(top, base + rm.top);
    if (Number.isFinite(top)) return top;
  }
  return null;
}

// Narrow-phase 3D occlusion for camera booms. houseBlocked() covers vertical wall planes;
// this adds the horizontal solid slabs (ceilings, roof sheets, mid-floor) that a boom
// must not pass through on balconies, stairs, or inside rooms.
export function cameraHouseBlocked(h, x, y, Y, baseZ) {
  const p = roomPlan(h),
    [u, v] = roomLocal(h, x, y),
    relY = Y - baseZ,
    F0 = 0.28;
  if (Math.abs(u) > h.size_m[0] * 0.5 + 1.4 || Math.abs(v) > h.size_m[1] * 0.5 + 1.8)
    return false;
  const inBox = (x0, x1, z0, z1) =>
    u >= x0 - 0.06 && u <= x1 + 0.06 && v >= z0 - 0.06 && v <= z1 + 0.06;
  // Covered room & balcony roof / ceiling slabs (slab ~0.42 m thick upward).
  for (const rm of p.rooms) {
    if (rm.covered === false || !Number.isFinite(rm.top)) continue;
    if (relY >= rm.top - 0.02 && relY <= rm.top + 0.42 && inBox(rm.x0, rm.x1, rm.z0, rm.z1))
      return true;
    // Level-1 floor slab (the ground storey's lid).
    if (
      rm.level >= 1 &&
      relY >= rm.floor - 0.36 &&
      relY <= rm.floor + 0.04 &&
      inBox(rm.x0, rm.x1, rm.z0, rm.z1)
    )
      return true;
  }
  if (p.balcony && p.balcony.covered !== false && Number.isFinite(p.balcony.top)) {
    const b = p.balcony;
    if (relY >= b.top - 0.02 && relY <= b.top + 0.42 && inBox(b.x0, b.x1, b.z0, b.z1))
      return true;
  }
  // Sloped sheet roofs over covered verandas / awnings / cattle sheds: block the slab
  // band between the wall-attach height and the free eave so the lens cannot tunnel through.
  const attach = F0 + wallHeight(h) - 0.04;
  for (const [cx, cz, w, d, role] of h.parts) {
    if (role !== "veranda" && role !== "awning" && role !== "shed") continue;
    if (
      relY >= attach - 0.62 &&
      relY <= attach + 0.24 &&
      Math.abs(u - cx) <= w * 0.5 + 0.1 &&
      Math.abs(v - cz) <= d * 0.5 + 0.1
    )
      return true;
  }
  return false;
}
