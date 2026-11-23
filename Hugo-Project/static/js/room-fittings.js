// Original low-poly joinery. Furniture bounds in room-layout include the visible legs, seat, shelves and their contents.
export function fittings(p, paint) {
  const v = p.design,
    [ink, dye, wood, floor, plaster, ceil] = v.palette,
    F = p.floor,
    cream = "#f1dfb3",
    iron = "#4e5551",
    clay = "#ad6642",
    brass = "#c39c38";
  const draw = (
      g,
      x,
      y,
      z,
      w,
      h,
      d,
      c,
      rot = 0,
      rx = 0,
      rz = 0,
      k = "fitting",
    ) => paint(k, g, x, y, z, w, h, d, c, rot, rx, rz),
    box = (...x) => draw("slab", ...x),
    disc = (...x) => draw("disc", ...x),
    pot = (...x) => draw("pot", ...x);
  // Lamps, ceiling rhythm, floor coverings and the wall finish vary independently of the activity furniture.
  const X = v.lampX,
    Z = v.lampZ,
    L = p.top - 0.42;
  box(X, p.top - 0.14, Z, 0.035, 0.28, 0.035, wood);
  if (v.lamp === 0) {
    draw(
      "pot",
      X,
      L,
      Z,
      0.43,
      0.27,
      0.43,
      dye,
      0,
      0,
      0,
      "window-" + p.styleGlow,
    );
    disc(X, L - 0.12, Z, 0.34, 0.025, 0.34, cream);
  } else if (v.lamp === 1) {
    box(X, L, Z, 0.79, 0.09, 0.17, wood);
    for (const s of [-1, 1])
      draw(
        "orb",
        X + s * 0.29,
        L - 0.12,
        Z,
        0.15,
        0.22,
        0.15,
        cream,
        0,
        0,
        0,
        "window-" + p.styleGlow,
      );
  } else if (v.lamp === 2) {
    draw("disc", X, L + 0.1, Z, 0.52, 0.09, 0.52, wood);
    draw(
      "pot",
      X,
      L - 0.06,
      Z,
      0.29,
      0.29,
      0.29,
      cream,
      0,
      0,
      0,
      "window-" + p.styleGlow,
    );
  } else {
    disc(X, L, Z, 0.23, 0.18, 0.23, wood);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3 + 0.34;
      box(
        X + Math.cos(a) * 0.26,
        L,
        Z - Math.sin(a) * 0.26,
        0.52,
        0.035,
        0.13,
        wood,
        a,
      );
    }
    draw(
      "orb",
      X,
      L - 0.13,
      Z,
      0.17,
      0.14,
      0.17,
      cream,
      0,
      0,
      0,
      "window-" + p.styleGlow,
    );
  }
  if (v.beam !== 2) {
    for (const t of [-0.29, 0, 0.29]) {
      const scale = p.round ? 0.73 : 0.98;
      v.beam
        ? box(p.cx + t * p.w, p.top - 0.1, p.cz, 0.1, 0.12, p.d * scale, wood)
        : box(p.cx, p.top - 0.1, p.cz + t * p.d, p.w * scale, 0.13, 0.11, wood);
    }
  }
  const rx = v.matX,
    rz = v.matZ,
    W = v.matW,
    D = v.matD,
    y = F + 0.008;
  if (v.rug === 0) {
    disc(rx, y, rz, Math.min(W, D), 0.016, Math.min(W, D), dye);
    disc(
      rx,
      y + 0.009,
      rz,
      Math.min(W, D) * 0.78,
      0.008,
      Math.min(W, D) * 0.78,
      ink,
    );
    disc(rx, y + 0.014, rz, W * 0.17, 0.005, W * 0.17, cream);
  } else if (v.rug < 4) {
    const len = v.rug === 3 ? W * 0.52 : W;
    box(rx, y, rz, len, 0.015, D, ink);
    for (let i = 0; i < (v.rug === 1 ? 8 : 4); i++) {
      const t = (i + 0.5) / (v.rug === 1 ? 8 : 4) - 0.5;
      box(
        rx,
        F + 0.018,
        rz + t * D,
        len * 0.97,
        0.007,
        D * (i % 2 ? 0.032 : 0.06),
        i % 2 ? cream : dye,
      );
    }
    for (const s of [-1, 1])
      box(
        rx + s * (len * 0.5 - 0.055),
        F + 0.019,
        rz,
        0.032,
        0.006,
        D * 0.96,
        cream,
      );
  } else {
    for (let i = -2; i <= 2; i++) {
      box(rx + i * 0.19, F + 0.009, rz, 0.13, 0.014, 0.13, cream, Math.PI / 4);
      if (i % 2 === 0)
        for (const s of [-1, 1])
          box(
            rx + i * 0.19,
            F + 0.01,
            rz + s * 0.21,
            0.067,
            0.015,
            0.067,
            dye,
            Math.PI / 4,
          );
    }
  }
  for (const o of p.furniture) {
    const { W: w, D: d, angle, sc } = o,
      co = Math.cos(angle),
      si = Math.sin(angle),
      seed = o.seed;
    const item = (g, x, y, z, W, H, D, c, rot = 0, rx = 0, rz = 0) =>
        draw(
          g,
          o.x + co * x * w + si * z * d,
          F + y * sc,
          o.z - si * x * w + co * z * d,
          W * w,
          H * sc,
          D * d,
          c,
          angle + rot,
          rx,
          rz,
        ),
      b = (...a) => item("slab", ...a),
      c = (...a) => item("disc", ...a),
      j = (...a) => item("pot", ...a),
      orb = (...a) => item("orb", ...a);
    const legs = (H, x = 0.4, z = 0.37) => {
        for (const A of [-x, x])
          for (const B of [-z, z]) b(A, H * 0.5, B, 0.08, H, 0.095, wood);
      },
      shelf = (yy) => b(0, yy, 0, 0.98, 0.065, 0.93, wood),
      uprights = (H) => {
        for (const x of [-0.455, 0.455])
          b(x, H / 2, -0.02, 0.07, H, 0.89, wood);
      };
    switch (o.kind) {
      case "charpoy":
        legs(0.39);
        shelf(0.4);
        b(0, 0.48, 0, 0.94, 0.11, 0.95, "#ceb370");
        for (let i = 0; i < 9; i++)
          b((i - 4) * 0.1, 0.542, 0, 0.019, 0.012, 0.9, dye);
        b(-0.3, 0.61, 0, 0.23, 0.14, 0.75, cream);
        b(0.3, 0.56, 0, 0.26, 0.074, 0.96, ink);
        break;
      case "bookcase":
      case "spices":
      case "yarns":
      case "potrack": {
        const H = o.kind === "spices" ? 1.48 : 1.68;
        uprights(H);
        b(0, H * 0.5, -0.41, 0.9, H, 0.09, o.kind === "bookcase" ? ink : wood);
        for (let k = 0; k < 3; k++) {
          const Y = 0.12 + k * (H / 3.25);
          shelf(Y);
          let N = o.kind === "bookcase" ? 7 : 4;
          for (let i = 0; i < N; i++) {
            const x = ((i + 0.5) / N) * 0.84 - 0.42,
              ht = 0.23 + ((seed + 17 * i + 7 * k) % 11) * 0.019,
              col = [ink, clay, cream, dye, "#667c69"][(i + k + seed) % 5];
            if (o.kind === "bookcase") {
              b(x, Y + ht / 2 + 0.037, -0.03, 0.085, ht, 0.62, col);
              b(x, Y + 0.12, 0.282, 0.06, 0.017, 0.014, brass);
            } else if (o.kind === "yarns") {
              for (let l = 0; l < 2; l++)
                b(
                  x,
                  Y + 0.09 + l * 0.11,
                  -0.04,
                  0.185,
                  0.102,
                  0.68,
                  l ? col : dye,
                );
            } else {
              j(
                x,
                Y + ht / 2 + 0.035,
                0,
                0.18,
                ht,
                0.61,
                o.kind === "spices" ? col : clay,
              );
              if (o.kind === "spices")
                c(x, Y + 0.04 + ht, 0, 0.14, 0.033, 0.49, brass);
            }
          }
        }
        shelf(H);
        break;
      }
      case "hearth":
        b(0, 0.24, 0, 0.95, 0.46, 0.93, clay);
        b(0, 0.21, 0.47, 0.37, 0.27, 0.02, "#543d31");
        b(0, 0.49, 0, 0.99, 0.1, 0.96, "#7b5846");
        for (const [x, sz] of [
          [-0.26, 0.39],
          [0.21, 0.28],
        ]) {
          c(x, 0.555, 0, sz, 0.045, 0.7, iron);
          j(x, 0.7, 0, sz, 0.3, 0.62, x > 0 ? brass : "#63594b");
          c(x, 0.86, 0, sz * 0.7, 0.035, 0.45, iron);
        }
        break;
      case "loom": {
        const len = Math.hypot(0.59, (d * 0.51) / sc),
          ang = -Math.atan2((d * 0.51) / sc, 0.59);
        for (const x of [-0.43, 0.43]) {
          b(x, 0.73, -0.29, 0.065, 1.46, 0.12, wood);
          b(x, 0.395, 0.29, 0.065, 0.79, 0.12, wood);
          b(x, 0.085, 0.015, 0.13, 0.14, 0.94, wood);
          b(x, 0.59, 0.02, 0.052, 0.08, 0.66, dye);
        }
        b(0, 1.4, -0.29, 0.92, 0.105, 0.16, wood);
        b(0, 0.81, 0.22, 0.89, 0.12, 0.18, wood);
        b(0, 0.4, -0.26, 0.89, 0.078, 0.11, wood);
        // The warp slopes from the high back roller down towards the weaver. Throw a shuttle across the partly woven cloth.
        b(0, 1.1, -0.035, 0.7, len, 0.035, ink, 0, ang);
        for (let i = 0; i < 14; i++)
          b(
            (i - 6.5) * 0.049,
            1.11,
            -0.012,
            0.012,
            len * 0.95,
            0.017,
            i % 4 ? cream : dye,
            0,
            ang,
          );
        b(0, 0.84, 0.25, 0.75, 0.17, 0.08, ink);
        b(0.055, 0.9, 0.212, 0.45, 0.048, 0.1, brass, -0.12);
        for (const x of [-0.15, 0.15]) b(x, 0.19, 0.12, 0.1, 0.06, 0.47, wood);
        break;
      }
      case "desk":
      case "workbench":
      case "lowtable":
      case "counter":
      case "clothcounter": {
        const H =
          o.kind === "lowtable"
            ? 0.36
            : o.kind.includes("ounter")
              ? 0.91
              : 0.75;
        legs(H);
        shelf(H);
        if (o.kind.includes("ounter"))
          b(0, H * 0.5, 0.34, 0.9, H * 0.88, 0.1, ink);
        if (o.kind === "workbench") {
          j(-0.21, H + 0.18, 0, 0.25, 0.3, 0.46, clay);
          for (let i = 0; i < 3; i++)
            b(0.19 + i * 0.075, H + 0.12, 0.01, 0.034, 0.18, 0.48, wood);
        } else if (o.kind === "clothcounter") {
          for (let i = 0; i < 4; i++)
            b(
              (i - 1.5) * 0.205,
              H + 0.095,
              0,
              0.19,
              0.13,
              0.73,
              [ink, dye, cream, clay][i],
            );
        } else if (o.kind === "desk") {
          b(-0.17, H + 0.07, 0.09, 0.41, 0.075, 0.48, dye, 0.11);
          b(-0.18, H + 0.112, 0.09, 0.37, 0.014, 0.44, cream, 0.11);
          c(0.25, H + 0.12, -0.05, 0.11, 0.18, 0.17, brass);
        } else {
          c(-0.15, H + 0.074, 0, 0.29, 0.051, 0.57, brass);
          j(0.21, H + 0.19, -0.07, 0.18, 0.29, 0.33, clay);
        }
        break;
      }
      case "wheel":
        c(0, 0.15, 0, 0.64, 0.28, 0.64, wood);
        c(0, 0.34, 0, 0.16, 0.37, 0.16, iron);
        c(0, 0.55, 0, 0.94, 0.09, 0.94, "#826e3c");
        j(0, 0.76, 0, 0.4, 0.37, 0.4, clay);
        break;
      case "instrument": {
        legs(0.24);
        shelf(0.24);
        for (const x of [-0.25, 0.17]) {
          j(x, 0.53, 0.02, 0.3, 0.5, 0.64, x < 0 ? dye : wood);
          b(x, 0.97, -0.005, 0.067, 0.9, 0.12, wood);
          for (const a of [-1, 1])
            b(x + a * 0.044, 1.35, 0, 0.038, 0.065, 0.16, brass);
          b(x, 1.03, 0.073, 0.018, 0.75, 0.025, cream);
        }
        break;
      }
      case "drums":
        for (const [x, H] of [
          [-0.24, 0.6],
          [0.21, 0.43],
        ]) {
          j(x, H * 0.5, 0, 0.44, H, 0.79, wood);
          c(x, H, 0, 0.43, 0.06, 0.78, cream);
          c(x, H + 0.033, 0, 0.15, 0.014, 0.28, iron);
        }
        break;
      case "chest":
        b(0, 0.33, 0, 0.92, 0.6, 0.91, ink);
        b(0, 0.65, 0, 0.98, 0.085, 0.97, wood);
        for (const x of [-0.29, 0.29])
          b(x, 0.35, 0.463, 0.068, 0.55, 0.02, brass);
        b(0, 0.48, 0.48, 0.11, 0.115, 0.04, brass);
        break;
      case "bench":
      case "settee":
        legs(0.35);
        b(0, 0.4, 0, 0.97, 0.14, 0.95, wood);
        b(0, 0.72, -0.36, 0.94, 0.6, 0.12, wood);
        for (const x of [-0.23, 0.23]) {
          b(x, 0.5, 0.045, 0.43, 0.11, 0.76, ink);
          if (o.kind === "settee") b(x, 0.72, -0.22, 0.36, 0.35, 0.25, dye);
        }
        break;
      case "jarstand":
        legs(0.27);
        shelf(0.28);
        for (const [x, H] of [
          [-0.23, 0.52],
          [0.24, 0.32],
        ]) {
          j(x, 0.31 + H / 2, 0, 0.4, H, 0.84, clay);
          c(x, 0.31 + H, 0, 0.24, 0.04, 0.53, brass);
        }
        break;
      case "plants":
      case "plantpot": {
        const N = o.kind === "plants" ? 3 : 1;
        for (let i = 0; i < N; i++) {
          const x = (i - (N - 1) / 2) * 0.32,
            H = 0.31 + 0.16 * ((i + seed) % 3);
          j(x, 0.2, 0, 0.84 / N, 0.4, 0.72, clay);
          b(x, 0.43 + H * 0.35, 0, 0.035, 0.2 + H * 0.65, 0.05, wood);
          for (let k = 0; k < 3; k++)
            orb(
              x + (Math.sin(k * 2.1) * 0.095) / N,
              0.48 + H * 0.36 + k * 0.095,
              0.04 * Math.cos(k),
              0.81 / N,
              H * 0.48,
              0.67,
              ["#4b794c", "#7e9151", "#629780"][(i + k) % 3],
            );
        }
        break;
      }
      default:
        legs(0.35);
        c(0, 0.4, 0, 0.97, 0.12, 0.97, dye);
    }
  }
  // Mount a different focal display on an actual solid section, not across a window (round walls included).
  const back = p.faces
    .filter((f) => f.kind === "wall" && f.len > 0.64)
    .sort(
      (a, b) =>
        a.z + Math.abs(a.x - p.cx) * 0.3 - (b.z + Math.abs(b.x - p.cx) * 0.3),
    )[0];
  if (!back) return;
  const norm = [Math.sin(back.rot), Math.cos(back.rot)],
    sg = (p.cx - back.x) * norm[0] + (p.cz - back.z) * norm[1] >= 0 ? 1 : -1,
    A = back.rot + (sg < 0 ? Math.PI : 0),
    width = Math.min(1.72, back.len * 0.77),
    Y = F + (p.top - F) * 0.69;
  const art = (g, x, y, z, w, h, d, c, tw = 0) =>
    draw(
      g,
      back.x + Math.cos(A) * x + Math.sin(A) * (z + 0.11),
      Y + y,
      back.z - Math.sin(A) * x + Math.cos(A) * (z + 0.11),
      w,
      h,
      d,
      c,
      A,
      0,
      tw,
    );
  if (["reading", "book-shop", "gathering"].includes(v.style)) {
    for (let i = 0; i < 2 + (v.motif % 2); i++) {
      const x = (i - (1 + (v.motif % 2)) / 2) * width * 0.32;
      art("slab", x, 0, 0, width * 0.28, 0.46, 0.046, wood);
      art("slab", x, 0, 0.03, width * 0.235, 0.39, 0.023, cream);
      art("slab", x, -0.066, 0.047, width * 0.16, 0.073, 0.012, ink);
      art(
        "slab",
        x + 0.022,
        0.033,
        0.049,
        width * 0.095,
        0.095,
        0.014,
        dye,
        0.785,
      );
    }
  } else if (["weaving", "cloth-shop", "sleeping"].includes(v.style)) {
    art("slab", 0, 0.35, 0, width, 0.055, 0.1, wood);
    art("slab", 0, -0.03, 0, width * 0.83, 0.69, 0.045, ink);
    for (let i = 0; i < 4; i++)
      art(
        "slab",
        0,
        -0.31 + i * 0.17,
        0.036,
        width * 0.79,
        0.035,
        0.02,
        i % 2 ? cream : dye,
      );
  } else if (["kitchen", "spice-shop", "pottery"].includes(v.style)) {
    art("slab", 0, 0.13, 0, width, 0.058, 0.1, wood);
    for (let i = -1; i <= 1; i++) {
      art("slab", i * width * 0.3, -0.021, 0.03, 0.037, 0.25, 0.04, brass);
      art(
        "orb",
        i * width * 0.3,
        -0.19,
        0.04,
        0.23,
        0.25,
        0.07,
        i % 2 ? clay : brass,
      );
    }
  } else {
    for (let i = -1; i <= 1; i++)
      art(
        "slab",
        i * width * 0.23,
        0.04 - Math.abs(i) * 0.12,
        0.028,
        0.13,
        0.37,
        0.04,
        i ? dye : ink,
        0.45 * i,
      );
  }
}
