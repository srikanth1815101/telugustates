import * as T from "../vendor/three.module.min.js";
import { basis, localPoint } from "./metres.js";
import { roomPlan } from "./home-volume.js";
import { fittings } from "./room-fittings.js";

const shade = (hex, k) => new T.Color(hex).offsetHSL(0, 0, k);

function renderDeckPiece(o, wood, clay, green, paint) {
  const F = o.floor,
    { W: w, D: d, angle, sc } = o,
    co = Math.cos(angle),
    si = Math.sin(angle);
  const b = (x, y, z, W, H, D, c, shape = "slab") =>
    paint(
      "fitting",
      shape,
      o.x + co * x * w + si * z * d,
      F + y * sc,
      o.z - si * x * w + co * z * d,
      W * w,
      H * sc,
      D * d,
      c,
      angle,
    );
  if (o.kind === "plantpot") {
    b(0, 0.19, 0, 0.72, 0.38, 0.72, clay, "pot");
    b(0, 0.39, 0, 0.8, 0.06, 0.8, shade(clay, 0.05), "disc");
    b(0, 0.58, 0, 0.88, 0.42, 0.88, green, "orb");
    b(0.14, 0.72, -0.08, 0.56, 0.32, 0.56, shade(green, 0.06), "orb");
  } else if (o.kind === "bench") {
    for (const sx of [-0.4, 0.4])
      for (const sz of [-0.36, 0.36])
        b(sx, 0.22, sz, 0.09, 0.44, 0.11, wood);
    b(0, 0.45, 0, 0.98, 0.07, 0.94, wood);
    b(0, 0.72, -0.4, 0.96, 0.36, 0.08, shade(wood, 0.04));
  } else {
    // Low teak stool / chowki
    for (const sx of [-0.36, 0.36])
      for (const sz of [-0.36, 0.36])
        b(sx, 0.19, sz, 0.12, 0.38, 0.12, wood);
    b(0, 0.4, 0, 0.96, 0.07, 0.96, shade(wood, 0.04));
  }
}

function renderWallSpan(w, u0, u1, yLo, yHi, outerCol, innerCol, trimCol, paint) {
  const len = u1 - u0,
    ht = yHi - yLo;
  if (len <= 0.015 || ht <= 0.015) return;
  const mid = (u0 + u1) * 0.5,
    ym = (yLo + yHi) * 0.5,
    t = w.thick;

  if (!w.exterior) {
    // Interior partition wall (warm limewash on both sides + timber baseboard)
    if (w.axis === "x") {
      paint("inner-wall", "slab", mid, ym, w.pos, len, ht, t, innerCol);
      if (yLo <= w.floor + 0.05)
        paint("skirting", "slab", mid, w.floor + 0.055, w.pos, len, 0.11, t + 0.018, trimCol);
    } else {
      paint("inner-wall", "slab", w.pos, ym, mid, t, ht, len, innerCol);
      if (yLo <= w.floor + 0.05)
        paint("skirting", "slab", w.pos, w.floor + 0.055, mid, t + 0.018, 0.11, len, trimCol);
    }
    return;
  }

  // Exterior wall: outer half uses exterior weather coat, inner half uses room limewash
  const halfT = t * 0.5,
    outSign = w.exterior === "+z" || w.exterior === "+x" ? 1 : -1;
  if (w.axis === "x") {
    paint(
      "room-wall",
      "slab",
      mid,
      ym,
      w.pos + outSign * halfT * 0.5,
      len,
      ht,
      halfT,
      outerCol,
    );
    paint(
      "inner-wall",
      "slab",
      mid,
      ym,
      w.pos - outSign * halfT * 0.5,
      len,
      ht,
      halfT,
      innerCol,
    );
  } else {
    paint(
      "room-wall",
      "slab",
      w.pos + outSign * halfT * 0.5,
      ym,
      mid,
      halfT,
      ht,
      len,
      outerCol,
    );
    paint(
      "inner-wall",
      "slab",
      w.pos - outSign * halfT * 0.5,
      ym,
      mid,
      halfT,
      ht,
      len,
      innerCol,
    );
  }
}

export function buildRoom(h, paint, detail = true) {
  const p = roomPlan(h),
    [, , wood, floorCol, plaster, ceilingCol] = p.design.palette,
    outer = h.wall_color,
    plinth = shade(outer, -0.15),
    sillCol = "#d8cda5",
    brass = "#b39a69",
    clay = "#ab6648",
    green = "#5d874b";

  // Round thatch hut (Archetype 3)
  if (p.round) {
    const rm = p.rooms[0],
      F = rm.floor;
    paint("room-floor", "round-floor", rm.cx, F * 0.5, rm.cz, rm.w + 0.08, F, rm.d + 0.08, "#a77c58");
    paint("inner-floor", "round-floor", rm.cx, F - 0.015, rm.cz, rm.w - rm.wall * 1.5, 0.035, rm.d - rm.wall * 1.5, floorCol);
    paint("ceiling", "round-floor", rm.cx, rm.top + 0.055, rm.cz, rm.w - 0.16, 0.11, rm.d - 0.16, ceilingCol);
    const n = 16,
      rx = rm.w * 0.5 - rm.wall * 0.5,
      rz = rm.d * 0.5 - rm.wall * 0.5,
      gap = Math.atan2(rm.dw * 0.5 + 0.08, rz);
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * Math.PI * 2 - Math.PI,
        x = rm.cx + Math.sin(a) * rx,
        z = rm.cz + Math.cos(a) * rz,
        seg = (2 * Math.PI * Math.max(rx, rz)) / n + 0.07,
        open = Math.abs(a) < gap,
        isWin = detail && (i === 4 || i === 11);
      if (open) {
        paint("room-wall", "slab", x, F + rm.dh + (rm.top - F - rm.dh) * 0.5, z, seg, rm.top - F - rm.dh, rm.wall, outer, a);
      } else if (isWin) {
        paint("room-wall", "slab", x, (F + 0.92) * 0.5, z, seg, F + 0.92, rm.wall, outer, a);
        paint("room-wall", "slab", x, (rm.top + 1.78) * 0.5, z, seg, rm.top - 1.78, rm.wall, outer, a);
        paint("window-frame", "slab", x, 1.35, z, seg * 0.88, 0.06, rm.wall + 0.04, wood, a);
      } else {
        paint("room-wall", "slab", x, (rm.top + F) * 0.5, z, seg, rm.top - F, rm.wall, outer, a);
        paint("inner-wall", "slab", rm.cx + Math.sin(a) * (rx - 0.08), (rm.top + F) * 0.5, rm.cz + Math.cos(a) * (rz - 0.08), seg * 0.92, rm.top - F - 0.06, 0.06, plaster, a);
      }
    }
    for (const s of [-1, 1])
      paint("door-frame", "slab", rm.door + s * (rm.dw * 0.5 + 0.04), F + rm.dh * 0.5, rm.cz + rz, 0.09, rm.dh, rm.wall + 0.08, wood);
    paint("door-step", "slab", rm.door, 0.14, rm.front + 0.24, rm.dw + 0.64, 0.28, 0.48, plinth);
    paint("door-step", "slab", rm.door, 0.07, rm.front + 0.68, rm.dw + 0.9, 0.14, 0.44, shade(plinth, -0.04));
    if (detail) fittings(rm, paint);
    return;
  }

  // 1. Multi-room floors, ceilings, and interior furniture across all levels
  for (const rm of p.rooms) {
    const [, , , rmFloorCol, , rmCeilCol] = rm.design.palette;
    if (rm.level === 0) {
      paint("room-floor", "slab", rm.cx, rm.floor * 0.5, rm.cz, rm.w, rm.floor, rm.d, plinth);
      paint("inner-floor", "slab", rm.cx, rm.floor - 0.012, rm.cz, rm.w - 0.16, 0.032, rm.d - 0.16, rmFloorCol);
    } else {
      paint("upper-floor", "slab", rm.cx, rm.floor - 0.065, rm.cz, rm.w, 0.13, rm.d, sillCol);
      paint("inner-floor", "slab", rm.cx, rm.floor - 0.008, rm.cz, rm.w - 0.16, 0.028, rm.d - 0.16, rmFloorCol);
    }
    if (rm.covered !== false) {
      paint("ceiling", "slab", rm.cx, rm.top + 0.055, rm.cz, rm.w - 0.06, 0.11, rm.d - 0.06, rmCeilCol);
    }
    if (detail) fittings(rm, paint);
  }

  // 2. Covered Balcony & Open Roof Terrace floor slabs + outdoor furniture
  if (p.balcony) {
    const b = p.balcony,
      bcx = (b.x0 + b.x1) * 0.5,
      bcz = (b.z0 + b.z1) * 0.5,
      bw = b.x1 - b.x0,
      bd = b.z1 - b.z0;
    paint("balcony-slab", "slab", bcx, b.floor - 0.07, bcz, bw, 0.14, bd, sillCol);
    paint("balcony-tile", "slab", bcx, b.floor - 0.006, bcz, bw - 0.16, 0.022, bd - 0.16, shade(floorCol, -0.04));
  }
  if (p.terrace) {
    const t = p.terrace,
      tcx = (t.x0 + t.x1) * 0.5,
      tcz = (t.z0 + t.z1) * 0.5,
      tw = t.x1 - t.x0,
      td = t.z1 - t.z0;
    paint("terrace-slab", "slab", tcx, t.floor - 0.12, tcz, tw, 0.24, td, h.roof_color || sillCol);
    paint("terrace-tile", "slab", tcx, t.floor - 0.006, tcz, tw - 0.22, 0.02, td - 0.22, shade(sillCol, -0.05));
  }
  if (detail && p.deckFurniture.length) {
    for (const item of p.deckFurniture)
      renderDeckPiece(item, wood, clay, green, paint);
  }

  // 3. Exterior & Interior Walls with Real Doorway Lintels/Frames & See-Through Daylight Windows
  for (const w of p.walls) {
    // Ground-level plinth band under exterior ground walls
    if (w.level === 0 && w.exterior) {
      for (const [s0, s1] of w.spans) {
        const len = s1 - s0,
          mid = (s0 + s1) * 0.5;
        if (w.axis === "x")
          paint("plinth", "slab", mid, 0.15, w.pos, len + 0.04, 0.3, w.thick + 0.05, plinth);
        else
          paint("plinth", "slab", w.pos, 0.15, mid, w.thick + 0.05, 0.3, len + 0.04, plinth);
      }
    }

    // Solid spans, sliced around real window openings
    for (const [s0, s1] of w.spans) {
      const spanWins = w.windows
        .filter((wn) => wn.c - wn.ww * 0.5 >= s0 - 0.01 && wn.c + wn.ww * 0.5 <= s1 + 0.01)
        .sort((a, b) => a.c - b.c);

      let cur = s0;
      for (const wn of spanWins) {
        const wLo = wn.c - wn.ww * 0.5,
          wHi = wn.c + wn.ww * 0.5;
        if (wLo - cur > 0.02)
          renderWallSpan(w, cur, wLo, w.floor, w.top, outer, plaster, wood, paint);
        // Below window sill & above window lintel (leaving the window aperture open to real sunlight!)
        renderWallSpan(w, wLo, wHi, w.floor, wn.sillY, outer, plaster, wood, paint);
        renderWallSpan(w, wLo, wHi, wn.headY, w.top, outer, plaster, wood, paint);

        // Window sill, teak frame, and brass grill bars
        const wh = wn.headY - wn.sillY,
          wy = (wn.sillY + wn.headY) * 0.5,
          ft = w.thick + 0.045;
        if (w.axis === "x") {
          paint("win-sill", "slab", wn.c, wn.sillY - 0.03, w.pos, wn.ww + 0.18, 0.065, ft + 0.1, sillCol);
          paint("win-head", "slab", wn.c, wn.headY + 0.035, w.pos, wn.ww + 0.16, 0.07, ft + 0.04, wood);
          for (const sgn of [-1, 1])
            paint("win-jamb", "slab", wn.c + sgn * (wn.ww * 0.5 - 0.03), wy, w.pos, 0.065, wh, ft, wood);
          if (detail) {
            for (const bar of [-0.24, 0, 0.24])
              paint("win-bar", "slab", wn.c + bar * wn.ww, wy, w.pos, 0.024, wh - 0.06, 0.024, brass);
            paint("win-bar", "slab", wn.c, wy, w.pos, wn.ww - 0.06, 0.024, 0.024, brass);
          }
        } else {
          paint("win-sill", "slab", w.pos, wn.sillY - 0.03, wn.c, ft + 0.1, 0.065, wn.ww + 0.18, sillCol);
          paint("win-head", "slab", w.pos, wn.headY + 0.035, wn.c, ft + 0.04, 0.07, wn.ww + 0.16, wood);
          for (const sgn of [-1, 1])
            paint("win-jamb", "slab", w.pos, wy, wn.c + sgn * (wn.ww * 0.5 - 0.03), ft, wh, 0.065, wood);
          if (detail) {
            for (const bar of [-0.24, 0, 0.24])
              paint("win-bar", "slab", w.pos, wy, wn.c + bar * wn.ww, 0.024, wh - 0.06, 0.024, brass);
            paint("win-bar", "slab", w.pos, wy, wn.c, 0.024, 0.024, wn.ww - 0.06, brass);
          }
        }
        cur = wHi;
      }
      if (s1 - cur > 0.02)
        renderWallSpan(w, cur, s1, w.floor, w.top, outer, plaster, wood, paint);
    }

    // Doorway lintels and carved teak doorframes
    for (const op of w.openings) {
      const oLo = op.c - op.dw * 0.5,
        oHi = op.c + op.dw * 0.5,
        lintelLo = w.floor + op.dh;
      if (w.top - lintelLo > 0.02)
        renderWallSpan(w, oLo, oHi, lintelLo, w.top, outer, plaster, wood, paint);
      const ft = w.thick + 0.055;
      if (w.axis === "x") {
        paint("door-frame", "slab", op.c, lintelLo + 0.04, w.pos, op.dw + 0.16, 0.09, ft, wood);
        for (const sgn of [-1, 1])
          paint("door-frame", "slab", op.c + sgn * (op.dw * 0.5 + 0.035), w.floor + op.dh * 0.5, w.pos, 0.075, op.dh, ft, wood);
      } else {
        paint("door-frame", "slab", w.pos, lintelLo + 0.04, op.c, ft, 0.09, op.dw + 0.16, wood);
        for (const sgn of [-1, 1])
          paint("door-frame", "slab", w.pos, w.floor + op.dh * 0.5, op.c + sgn * (op.dw * 0.5 + 0.035), ft, op.dh, 0.075, wood);
      }
    }
  }

  // 4. Exterior entrance steps for ground-floor exterior doors
  for (const d of p.doors) {
    if (d.level !== 0 || !d.exterior) continue;
    // Skip steps where a staircase landing or covered veranda already provides flush 0.28m support
    const onStair = p.stairs.some(
      (st) => d.x >= st.x0 - 0.2 && d.x <= st.x1 + 0.2 && d.z >= st.z0 - 0.2 && d.z <= st.z1 + 0.2,
    );
    if (onStair) continue;
    if (d.axis === "x") {
      const outDir = d.z >= p.cz ? 1 : -1;
      const inVeranda = h.parts.some(
        ([cx, cz, bw, bd, role]) =>
          ["veranda", "awning", "shed"].includes(role) &&
          Math.abs(d.x - cx) <= bw * 0.5 &&
          Math.abs(d.z + outDir * 0.35 - cz) <= bd * 0.5,
      );
      if (inVeranda) continue;
      paint("door-step", "slab", d.x, 0.14, d.z + outDir * 0.22, d.dw + 0.56, 0.28, 0.44, plinth);
      paint("door-step", "slab", d.x, 0.07, d.z + outDir * 0.64, d.dw + 0.82, 0.14, 0.42, shade(plinth, -0.04));
    } else {
      const outDir = d.x >= p.cx ? 1 : -1;
      paint("door-step", "slab", d.x + outDir * 0.22, 0.14, d.z, 0.44, 0.28, d.dw + 0.56, plinth);
      paint("door-step", "slab", d.x + outDir * 0.64, 0.07, d.z, 0.42, 0.14, d.dw + 0.82, shade(plinth, -0.04));
    }
  }
}

// Hinged 3D wooden door leaves for ALL exterior & interior doors across all floors of house `h`.
export function doorLeaf(s, h, u) {
  const p = roomPlan(h),
    { yaw } = basis(h),
    root = new T.Group(),
    baseZ = s.ground(...h.centre);

  root.position.set(...s.xyz(...h.centre, baseZ));
  root.rotation.y = yaw;

  const boxGeo = new T.BoxGeometry(),
    teakMat = new T.MeshLambertMaterial({ color: "#654433" }),
    panelMat = new T.MeshLambertMaterial({ color: "#79543d" }),
    intMat = new T.MeshLambertMaterial({ color: "#805a42" }),
    brassMat = new T.MeshLambertMaterial({ color: "#c29c5c" });

  const doorEntries = [];

  for (let idx = 0; idx < p.doors.length; idx++) {
    const d = p.doors[idx],
      anchor = new T.Group(),
      hinge = new T.Group();
    anchor.position.set(d.hx, d.floor, d.hz);
    anchor.add(hinge);
    root.add(anchor);

    const leafH = d.dh - 0.03,
      alongX = d.axis === "x",
      cx = alongX ? d.du0 * 0.5 : 0,
      cz = alongX ? 0 : d.dv0 * 0.5,
      sx = alongX ? Math.abs(d.du0) : 0.055,
      sz = alongX ? 0.055 : Math.abs(d.dv0),
      mainMat = d.exterior ? teakMat : intMat;

    const slab = new T.Mesh(boxGeo, mainMat);
    slab.position.set(cx, leafH * 0.5 + 0.015, cz);
    slab.scale.set(sx, leafH, sz);
    hinge.add(slab);

    // Carved upper & lower recessed/raised panels
    for (const [fy, fh] of [
      [0.27, 0.32],
      [0.71, 0.36],
    ]) {
      const pnl = new T.Mesh(boxGeo, panelMat);
      pnl.position.set(cx, leafH * fy + 0.015, cz);
      pnl.scale.set(
        alongX ? sx * 0.76 : 0.072,
        leafH * fh,
        alongX ? 0.072 : sz * 0.76,
      );
      hinge.add(pnl);
    }

    // Brass latch handle near free edge of door leaf
    const handleFrac = 0.84,
      hxOff = alongX ? d.du0 * handleFrac : 0,
      hzOff = alongX ? 0 : d.dv0 * handleFrac,
      handle = new T.Mesh(boxGeo, brassMat);
    handle.position.set(hxOff, Math.min(1.02, leafH * 0.52), hzOff);
    handle.scale.set(alongX ? 0.045 : 0.11, 0.14, alongX ? 0.11 : 0.045);
    hinge.add(handle);

    const [gx, gy] = localPoint(h, d.x, d.z);
    doorEntries.push({
      id: d.id,
      door: d,
      hinge,
      gx,
      gy,
      floor: d.floor,
      swingSign: d.swingSign,
      maxAngle: d.maxAngle,
      angle: 0,
    });
  }

  root.userData = {
    role: "hinged-front-door",
    owner: u,
    hinge: doorEntries[0]?.hinge,
    doors: doorEntries,
    cleanup() {
      boxGeo.dispose();
      teakMat.dispose();
      panelMat.dispose();
      intMat.dispose();
      brassMat.dispose();
    },
  };
  return root;
}
