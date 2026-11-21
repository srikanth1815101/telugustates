import { buildRoom } from "./home-interior.js";
import { wallHeight } from "./home-volume.js";
// Stylized buildings only. Envelopes, entries, road sides and paint come from the resident Markdown.
import * as T from "../vendor/three.module.min.js";
import { ACRE, basis, localPoint, GATE_POST_OFFSET } from "./metres.js";
export function addForms(g) {
  function folded(hip) {
    // smooth, convex roof surfaces; generous eaves and a softly clipped ridge
    const p = [],
      ix = [],
      tiers = hip
        ? [
            [0.5, 0.5, 0],
            [0.492, 0.491, 0.07],
            [0.27, 0.13, 0.84],
            [0.21, 0.022, 1],
          ]
        : [
            [0.5, 0.5, 0],
            [0.493, 0.491, 0.08],
            [0.483, 0.048, 0.965],
            [0.478, 0.018, 1],
          ];
    for (const [w, d, y] of tiers)
      p.push(-w, y, -d, w, y, -d, w, y, d, -w, y, d);
    for (let k = 0; k < tiers.length - 1; k++)
      for (let a = 0; a < 4; a++) {
        let b = (a + 1) % 4,
          i = 4 * k;
        ix.push(i + a, i + 4 + a, i + b, i + b, i + 4 + a, i + 4 + b);
      }
    const k = p.length / 3 - 4;
    ix.push(k, k + 3, k + 1, k + 3, k + 2, k + 1, 0, 1, 2, 0, 2, 3);
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(p, 3));
    geo.setIndex(ix);
    geo.computeVertexNormals();
    return geo;
  }
  g.gabled = folded(false);
  g.hipped = folded(true);
  g.thatchHips = g.hipped;
  g.cone = new T.ConeGeometry(0.5, 1, 18);
  g.pot = new T.LatheGeometry(
    [
      new T.Vector2(0.25, -0.5),
      new T.Vector2(0.43, -0.33),
      new T.Vector2(0.5, -0.07),
      new T.Vector2(0.45, 0.18),
      new T.Vector2(0.26, 0.36),
      new T.Vector2(0.28, 0.48),
      new T.Vector2(0.23, 0.5),
    ],
    12,
  );
  g.slab = new T.BoxGeometry(1, 1, 1);
  g["round-floor"] = new T.CylinderGeometry(0.5, 0.5, 1, 16);
  g["round-floor"].rotateY(Math.PI / 16);
  g.leanFill = g.slab.clone();
  const wedge = g.leanFill.attributes.position;
  for (let i = 0; i < wedge.count; i++)
    wedge.setY(i, wedge.getY(i) > 0 ? 0.5 - wedge.getZ(i) : 0);
  g.leanFill.computeVertexNormals();
  g.roundStone = new T.SphereGeometry(0.5, 7, 4);
  g.canopy = new T.IcosahedronGeometry(0.5, 1);
  g.canopy.deleteAttribute("normal");
  const pa = g.canopy.attributes.position,
    na = new Float32Array(pa.array);
  for (let k = 0; k < na.length; k += 3) {
    const l = Math.hypot(na[k], na[k + 1], na[k + 2]);
    for (let j = 0; j < 3; j++) na[k + j] /= l;
  }
  g.canopy.setAttribute("normal", new T.BufferAttribute(na, 3));
}
const earth = "#a77c58",
  lime = "#eee0b9",
  wood = "#77523b",
  teak = "#624333",
  shade = "#554b3f",
  sill = "#d8cda5",
  night = "#314c50",
  brass = "#b39a69";
const tint = (c, v) => new T.Color(c).offsetHSL(0, 0, v);
export function makeHouse(s, h, u, distance, tier, put) {
  if (!h) return;
  const { yaw } = basis(h),
    [w, d, H] = h.size_m,
    S = h.style,
    cell = s.t.at(...h.centre),
    z = s.ground(...h.centre),
    seed = h.seed,
    near = distance < (tier ? 108 : 72),
    mid = distance < (tier ? 310 : 155),
    hi = near || (tier > 0 && distance < 210);
  const [cx, , cz] = s.xyz(...h.centre, z),
    cc = Math.cos(yaw),
    ss = Math.sin(yaw),
    wall = h.wall_color,
    roof = h.roof_color;
  const paint = (k, g, x, y, b, sx, sy, sz, col, rot = 0, rx = 0, rz = 0) =>
    put(
      k,
      g,
      cx + x * cc + b * ss,
      z + y,
      cz - x * ss + b * cc,
      sx,
      sy,
      sz,
      col,
      undefined,
      yaw + rot,
      rx,
      rz,
    );
  const box = (...a) => paint("built", "slab", ...a),
    soft = (...a) => paint("rounded", "wall", ...a),
    drum = (...a) => paint("turned", "disc", ...a),
    oval = (...a) => paint("rounded-leaf", "orb", ...a);
  const foundation = 0.23;
  const wallH = wallHeight(h);
  const top = foundation + wallH;
  const clad = (x, b, bw, bd, roofStyle, base, ht, colour) => {
    paint(
      "roof-shell",
      S === 2 && roofStyle === "hipped" ? "thatchHips" : roofStyle,
      x,
      base,
      b,
      bw,
      ht,
      bd,
      colour,
    );
    if (hi && roofStyle === "hipped") {
      box(x, base + 0.02, b, bw * 1.006, 0.16, bd, tint(colour, -0.105));
      box(x, base + ht + 0.035, b, bw * 0.42, 0.12, 0.23, tint(colour, 0.066));
    }
    if (hi && roofStyle === "gabled") {
      box(x, base + ht + 0.025, b, bw * 0.95, 0.085, 0.16, tint(colour, 0.06));
      for (let j = -1; j <= 1; j += 2)
        box(
          x,
          base + 0.09,
          b + j * bd * 0.48,
          bw * 0.99,
          0.17,
          0.13,
          tint(colour, -0.06),
        );
    }
  };
  let first = true;
  for (const [px, pz, bw, bd, role] of h.parts) {
    const covered = role === "veranda" || role === "awning" || role === "shed";
    const sheetY = H - 0.16 - (Math.sin(0.065) * bd) / 2,
      sheetLow = sheetY - 0.095 - (Math.sin(0.065) * bd) / 2;
    const coreH =
      role === "shed" ? wallH * 0.83 : S === 7 ? sheetLow - foundation : wallH;
    if (role === "stairs") {
      if (hi) {
        for (let k = 0; k < 9; k++) {
          const sy = (wallH * 0.48 * (k + 1)) / 9;
          box(
            px,
            sy / 2,
            pz + bd / 2 - ((k + 0.5) * bd) / 9,
            bw,
            sy,
            bd / 9 + 0.012,
            sill,
          );
        }
      } else box(px, wallH * 0.18, pz, bw, wallH * 0.36, bd, sill);
      continue;
    }
    const hollow = first && mid;
    if (!mid && !covered && role !== "round")
      box(px, 0.095, pz, bw, 0.31, bd, tint(wall, -0.14));
    if (hollow) buildRoom(h, paint);
    if (role === "round") {
      if (!hollow) drum(px, foundation + coreH / 2, pz, bw, coreH, bd, wall);
      if (!hollow) drum(px, 0.16, pz, bw + 0.04, 0.3, bd + 0.04, earth);
      paint(
        "thatch-cap",
        "cone",
        px,
        top + (H - top) * 0.5,
        pz,
        bw,
        H - top,
        bd,
        roof,
      );
      if (hi) {
        for (let k = 0; k < 3; k++)
          drum(
            px,
            top + (H - top) * k * 0.15,
            pz,
            bw * (1 - k * 0.15),
            0.14,
            bd * (1 - k * 0.15),
            tint(roof, k % 2 ? -0.04 : 0.045),
          );
        paint(
          "thatch-finial",
          "orb",
          0,
          H - 0.02,
          0,
          0.36,
          0.22,
          0.36,
          "#816341",
        );
      }
    } else if (covered) {
      box(px, 0.14, pz, bw, 0.28, bd, tint(wall, -0.13));
      let pH = role === "shed" ? coreH : coreH * 0.84;
      if (mid) {
        let posts = role === "veranda" && S === 1 ? 4 : 2;
        for (let k = 0; k < posts; k++) {
          let xx = px - bw * 0.435 + (bw * 0.87 * k) / (posts - 1);
          if (S === 1) {
            drum(
              xx,
              pH * 0.49 + 0.22,
              pz + bd * 0.35,
              0.29,
              pH * 0.97,
              0.29,
              lime,
            );
            box(xx, 0.55, pz + bd * 0.35, 0.47, 0.69, 0.47, tint(wall, -0.1));
            box(xx, pH + 0.06, pz + bd * 0.35, 0.48, 0.21, 0.48, lime);
          } else box(xx, pH / 2 + 0.19, pz + bd * 0.35, 0.17, pH, 0.17, wood);
        }
      }
      if (role === "shed") {
        clad(px, pz, bw, bd, "hipped", pH, 0.85, roof);
        if (hi) {
          for (let j = 0; j < 2; j++)
            box(
              px,
              0.75 + j * 0.43,
              pz + bd * 0.45,
              bw - 0.22,
              0.12,
              0.12,
              wood,
            );
          box(px, 0.39, pz - 0.6, bw * 0.6, 0.78, 0.78, "#9d9982");
        }
      } else {
        paint(
          "porch-roof",
          "slab",
          px,
          pH + 0.25,
          pz,
          bw,
          0.23,
          bd,
          role === "awning" ? "#d9ae72" : roof,
          0,
          0.105,
        );
        if (role === "awning" && hi) {
          for (let k = 0; k < 7; k++) {
            let xx = px - bw / 2 + ((k + 0.5) * bw) / 7;
            paint(
              "stripe",
              "slab",
              xx,
              pH + 0.39,
              pz,
              bw / 7,
              0.044,
              bd,
              k % 2 ? lime : "#a35448",
              0,
              0.105,
            );
            box(
              xx,
              pH + 0.06,
              pz + bd * 0.48,
              bw / 7,
              0.32,
              0.085,
              k % 2 ? lime : "#a35448",
            );
          }
        }
      }
    } else {
      if (S === 5) {
        // Keep the balcony INSIDE the covered footprint: recess the upper floor,
        // rather than burying a railing in a full-height box.
        const f = wallH * 0.5 + 0.13,
          cut = bd * 0.22;
        if (!hollow)
          (hi ? soft : box)(
            px,
            (f + foundation) / 2,
            pz,
            bw - 0.1,
            f - foundation,
            bd - 0.1,
            wall,
          );
        (hi ? soft : box)(
          px,
          (H - 0.48 + f) / 2,
          pz - cut / 2,
          bw - 0.12,
          H - 0.48 - f,
          bd - cut - 0.12,
          tint(wall, 0.024),
        );
      } else if (!hollow)
        (hi ? soft : box)(
          px,
          foundation + coreH / 2,
          pz,
          bw - 0.1,
          coreH,
          bd - 0.1,
          role === "wing" ? tint(wall, -0.025) : wall,
        );
      if (mid && !hollow) {
        box(px, 0.2, pz, bw, 0.4, bd, tint(wall, -0.2));
        if (S !== 5 && S !== 7)
          box(px, top - 0.11, pz, bw, 0.2, bd, tint(wall, 0.08));
      }
      if (S === 4 || S === 5 || S === 10) {
        const slabY = S === 5 ? H - 0.36 : coreH + 0.34;
        box(px, slabY, pz, bw, 0.24, bd, roof);
        if (mid) {
          for (let side of [-1, 1])
            box(
              px,
              slabY + 0.19,
              pz + side * (bd / 2 - 0.1),
              bw,
              0.34,
              0.18,
              lime,
            );
        }
        if (S === 4 && first) {
          let tank = H - slabY - 0.23;
          drum(
            px + bw * 0.21,
            slabY + 0.14 + tank / 2,
            pz - bd * 0.17,
            2.38,
            tank,
            2.38,
            "#657776",
          );
          if (hi)
            for (const k of [0.13, 0.52, 0.87])
              drum(
                px + bw * 0.21,
                slabY + 0.14 + tank * k,
                pz - bd * 0.17,
                2.44,
                0.1,
                2.44,
                "#82918a",
              );
        }
        if (S === 5 && first) {
          const f = wallH * 0.5 + 0.13,
            front = pz + bd / 2,
            back = front - bd * 0.22;
          box(px, f, front - bd * 0.11, bw, 0.21, bd * 0.22, sill);
          if (mid)
            for (const side of [-1, 1])
              box(
                px + side * (bw / 2 - 0.16),
                (slabY + f - 0.08) / 2,
                front - 0.15,
                0.23,
                slabY - f - 0.08,
                0.23,
                tint(wall, 0.08),
              );
          if (mid) {
            box(px, f + 0.95, front - 0.095, bw, 0.09, 0.12, wood);
            box(px, f + 0.47, front - 0.095, bw, 0.09, 0.09, lime);
            for (const side of [-1, 1])
              box(
                px + side * (bw / 2 - 0.075),
                f + 0.95,
                front - bd * 0.11,
                0.13,
                0.11,
                bd * 0.22,
                wood,
              );
            for (let j = 0; j < (hi ? 9 : 4); j++)
              box(
                px + bw * (-0.47 + (0.94 * j) / (hi ? 8 : 3)),
                f + 0.46,
                front - 0.095,
                0.082,
                0.93,
                0.082,
                lime,
              );
            box(px - bw * 0.18, f + 0.95, back + 0.02, 1.04, 1.9, 0.13, teak);
            box(px + bw * 0.2, f + 1.23, back + 0.03, 1.58, 1.1, 0.13, lime);
            box(px + bw * 0.2, f + 1.23, back + 0.12, 1.37, 0.9, 0.09, night);
          }
        }
      } else if (S === 7) {
        paint(
          "lean-fascia",
          "leanFill",
          px,
          sheetLow - 0.012,
          pz,
          bw - 0.07,
          bd * Math.sin(0.065) + 0.024,
          bd - 0.07,
          wall,
        );
        paint(
          "lean-sheet",
          "slab",
          px,
          sheetY,
          pz,
          bw,
          0.19,
          bd,
          roof,
          0,
          0.065,
        );
        if (hi)
          for (let k = 0; k < 9; k++)
            paint(
              "seam",
              "slab",
              px - bw * 0.46 + k * bw * 0.115,
              sheetY + 0.116,
              pz,
              0.095,
              0.08,
              bd,
              tint(roof, 0.13),
              0,
              0.065,
            );
      } else {
        const g = [0, 2, 8].includes(S) ? "hipped" : "gabled";
        clad(px, pz, bw, bd, g, top, H - top, roof);
        if (S === 2 && hi)
          for (let k = 0; k < 3; k++) {
            let f = 1 - k * 0.106;
            box(
              px,
              top + 0.08 + k * 0.18,
              pz + bd * 0.47 * f,
              bw * f,
              0.17,
              0.13,
              tint(roof, -0.04 + k * 0.025),
            );
          }
      }
    }
    if (!hollow && !covered && role !== "stairs" && mid) {
      const front = pz + bd / 2,
        ww = Math.min(0.98 + (seed % 53) * 0.01, bw * 0.24),
        sh = near ? 0.08 : 0.05;
      for (let side of [-1, 1]) {
        let wx = px + side * bw * 0.29;
        if (S === 3) {
          if (hi) {
            const theta = side * 0.96,
              wx = bw * 0.5 * Math.sin(theta),
              wz = bd * 0.5 * Math.cos(theta);
            box(px + wx, 1.63, pz + wz, 0.87, 0.94, 0.16, lime, theta);
            box(
              px + wx + Math.sin(theta) * 0.08,
              1.63,
              pz + wz + Math.cos(theta) * 0.08,
              0.67,
              0.68,
              0.16,
              night,
              theta,
            );
          }
          continue;
        }
        box(wx, 1.76, front, ww + 0.18, 1.12, 0.12, lime);
        paint(
          "window-" + (seed % 4),
          "slab",
          wx,
          1.78,
          front + 0.075,
          ww,
          0.91,
          0.12,
          night,
        );
        if (hi) {
          box(wx, 1.78, front + 0.16, 0.075, 0.93, 0.07, brass);
          box(wx, 1.69, front + 0.16, ww, 0.065, 0.07, brass);
          for (let j of [-1, 1])
            box(
              wx + j * (ww / 2 + 0.15),
              1.78,
              front + 0.07,
              0.22,
              1.04,
              0.12,
              tint(wall, -0.2),
            );
          box(wx, 1.2, front + 0.13, ww + 0.31, 0.12, 0.32, sill);
        }
      }
      if (hi && S !== 3) {
        for (let j of [-1, 1]) {
          box(
            px + bw * 0.495,
            1.67,
            pz + j * bd * 0.23,
            0.12,
            1.02,
            Math.min(1.3, bd * 0.26),
            teak,
          );
          box(
            px + bw * 0.506,
            1.66,
            pz + j * bd * 0.23,
            0.09,
            0.73,
            Math.min(1.02, bd * 0.2),
            "#70938f",
          );
        }
      }
      if (hi && S === 9)
        for (let k = 0; k < 6; k++)
          for (let side of [-1, 1])
            box(
              px + side * (bw * 0.5 - 0.36),
              0.55 + k * 0.43,
              front + 0.04,
              0.53 + (k % 2) * 0.23,
              0.35,
              0.16,
              k % 2 ? "#a0957a" : "#c2b897",
            );
    }
    if (hi && !covered && role !== "stairs" && role !== "round") {
      const pat = tint(wall, -0.018 - h.weathering * 0.12),
        side = seed % 2 ? 1 : -1,
        faceZ = pz + bd / 2 + 0.009;
      for (let j = 0; j < 2 + (seed % 3); j++)
        box(
          px + side * (bw * 0.39 - j * 0.28),
          0.47 + j * 0.095,
          faceZ,
          0.29 + ((seed >>> (j + 3)) % 9) * 0.064,
          0.15,
          0.04,
          pat,
        );
    }
    first = false;
  }
  // Only yard features named in this house record are added to its timber-fenced plot.
  if (!mid) return;
  function fixture(
    k,
    g,
    lx,
    lz,
    y,
    wid,
    ht,
    dep,
    col,
    rot = 0,
    rx = 0,
    rz = 0,
  ) {
    let [x, yy] = localPoint(h, lx, lz);
    const [X, H, Z] = s.xyz(x, yy, s.ground(x, yy));
    put(k, g, X, H + y, Z, wid, ht, dep, col, undefined, yaw + rot, rx, rz);
  }
  // Every arrangement has rear yard space; do not plant on a house, on the gate, or on a road.
  const plots = [
    [-w * 0.5 - 3.2, d * 0.05],
    [w * 0.5 + 3.4, d * 0.13],
    [-w * 0.37, -d * 0.5 - 4.8],
    [w * 0.35, -d * 0.5 - 7.4],
    [-w * 0.5 - 4, -d * 0.52],
    [w * 0.5 + 4, -d * 0.5 - 4.6],
    [0, -d * 0.5 - 12],
  ];
  for (const [j, prop] of h.props.entries()) {
    let [lx, lz] = plots[(j + (seed % 3)) % plots.length];
    const nearYard = localPoint(h, lx, lz);
    if (s.ways && !s.ways.clear(...nearYard, 1.98)) continue;
    const obj = (g, a, b, y, sw, sh, sd, col, rot = 0, rx = 0, rz = 0) =>
      fixture("yard-" + g, g, lx + a, lz + b, y, sw, sh, sd, col, rot, rx, rz);
    if (prop === "shade-tree" || prop === "banana-clump") {
      const banana = prop === "banana-clump",
        ht = banana ? 3.8 : 5.4 + (seed % 4);
      obj(
        "trunk",
        0,
        0,
        ht * 0.32,
        banana ? 0.43 : 0.64,
        ht * 0.64,
        banana ? 0.43 : 0.64,
        "#927953",
      );
      let count = banana ? 6 : 4;
      for (let k = 0; k < count; k++) {
        let a = k * 2.4 + (seed % 32) * 0.1,
          rad = banana ? 0.75 : 1.11,
          col = ["#669053", "#749b54", "#568154", "#92a65e"][k % 4];
        obj(
          "canopy",
          Math.sin(a) * rad,
          Math.cos(a) * rad,
          ht * 0.76 + k * 0.08,
          banana ? 0.92 : 3.5,
          banana ? 0.49 : 2.66,
          banana ? 3.3 : 3.7,
          col,
          a,
          banana ? 0.37 : 0,
        );
      }
      continue;
    }
    if (!near && !tier) continue;
    if (
      prop === "clay-pots" ||
      prop === "water-urn" ||
      prop === "tulsi-planter"
    ) {
      for (let k = 0; k < (prop === "clay-pots" ? 3 : 1); k++) {
        obj(
          prop === "tulsi-planter" ? "wall" : "pot",
          k * 0.71,
          0,
          0.44,
          0.73,
          0.88,
          0.7,
          prop === "tulsi-planter" ? lime : "#a8694c",
        );
        if (prop !== "water-urn")
          obj("canopy", k * 0.71, 0, 1.03, 0.54, 0.58, 0.49, "#6d8e52");
      }
    } else if (prop === "woven-cot" || prop === "wood-bench") {
      obj(
        "slab",
        0,
        0,
        0.56,
        1.96,
        0.14,
        0.84,
        prop === "woven-cot" ? "#b18e5b" : wood,
      );
      for (let a of [-0.79, 0.79])
        for (let b of [-0.32, 0.32])
          obj("slab", a, b, 0.27, 0.1, 0.54, 0.1, wood);
    } else if (prop === "drying-line") {
      for (let a of [-1.7, 1.7])
        obj("trunk", a, 0, 1.22, 0.15, 2.44, 0.15, wood);
      obj("slab", 0, 0, 2.29, 3.45, 0.034, 0.036, teak);
      for (let k = 0; k < 3; k++)
        obj(
          "slab",
          k * 0.85 - 0.85,
          0,
          1.82,
          0.69,
          0.92,
          0.052,
          [lime, "#ad7f77", "#7f9da3"][k],
        );
    } else {
      obj("slab", 0, 0, 0.055, 3.4, 0.11, 2.65, "#987951");
      for (let k = 0; k < 9; k++)
        obj(
          "canopy",
          ((k % 3) - 1) * 0.9,
          (Math.floor(k / 3) - 1) * 0.64,
          0.28,
          0.69,
          0.49,
          0.61,
          prop === "flower-bed" && k % 3 === 0 ? "#bd8c7f" : "#7a9658",
        );
    }
  }
}
