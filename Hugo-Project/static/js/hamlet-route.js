import { ACRE as M } from "./metres.js";
const id = (p) => p.map((n) => n.toFixed(7)).join("/"),
  d = (a, b) => M * Math.hypot(a[0] - b[0], a[1] - b[1]),
  lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function subdivide(a, b, stepM = 3.2) {
  const len = d(a, b),
    n = Math.max(1, Math.ceil(len / stepM)),
    out = [];
  for (let i = 0; i <= n; i++) out.push(i === 0 ? a : i === n ? b : lerp(a, b, i / n));
  return out;
}

function withCum(xy) {
  const cum = [0];
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + d(xy[i - 1], xy[i]));
  return cum;
}

// Dijkstra over surveyed lanes, plus obstacle-aware direct join & forward shortcutting for live walks.
export function pathTo(paths, end, from, canWalk = null) {
  if (canWalk && from && end && d(from, end) > 0.2 && canWalk(from, end)) {
    const xy = subdivide(from, end, 3.0),
      cum = withCum(xy);
    return { xy, cum, metres: cum.at(-1) };
  }
  const nodes = new Map(),
    segs = [],
    node = (p) => {
      const k = id(p);
      if (!nodes.has(k)) nodes.set(k, { p, next: [], cost: Infinity });
      return nodes.get(k);
    };
  for (const l of paths) {
    let a;
    for (const p of l.xy) {
      const b = node(p);
      if (a && a !== b) {
        const m = d(a.p, p);
        a.next.push([b, m]);
        b.next.push([a, m]);
        segs.push([a, b, m]);
      }
      a = b;
    }
  }
  let goal = nodes.get(id(end));
  if (!goal) {
    let bestD = Infinity;
    for (const n of nodes.values()) {
      const distEnd = d(n.p, end);
      if (distEnd < bestD) {
        bestD = distEnd;
        goal = n;
      }
    }
  }
  if (!goal) return null;
  const queue = [goal];
  goal.cost = 0;
  while (queue.length) {
    let i = 0;
    for (let j = 1; j < queue.length; j++)
      if (queue[j].cost < queue[i].cost) i = j;
    const a = queue.splice(i, 1)[0];
    if (a.done) continue;
    a.done = true;
    for (const [b, m] of a.next) {
      if (a.cost + m >= b.cost) continue;
      b.cost = a.cost + m;
      b.onward = a;
      queue.push(b);
    }
  }

  let nearestNode = null,
    nearNodeD = Infinity;
  for (const a of nodes.values()) {
    if (!a.done) continue;
    const n = d(a.p, from);
    if (n < nearNodeD) {
      nearNodeD = n;
      nearestNode = a;
    }
  }
  if (!nearestNode) return null;

  // Exact vertex start (e.g. gate / hub survey queries) preserves exact endpoint identity.
  if (!canWalk && nearNodeD < 0.05) {
    const xy = [];
    for (let p = nearestNode; p; p = p.onward) xy.push(p.p);
    return { xy, cum: withCum(xy), metres: nearestNode.cost + nearNodeD };
  }

  // Project `from` onto reachable segments and minimize total distance (join + onward), never walking backward.
  let minJoinD = nearNodeD;
  const candidates = [];
  for (const [a, b, len] of segs) {
    if (!a.done || !b.done || len < 1e-6) continue;
    const vx = b.p[0] - a.p[0],
      vy = b.p[1] - a.p[1],
      t = Math.max(
        0,
        Math.min(
          1,
          ((from[0] - a.p[0]) * vx + (from[1] - a.p[1]) * vy) /
            (vx * vx + vy * vy || 1),
        ),
      ),
      proj = t <= 0 ? a.p : t >= 1 ? b.p : lerp(a.p, b.p, t),
      dj = d(from, proj),
      viaB = (1 - t) * len + b.cost,
      viaA = t * len + a.cost,
      rem = Math.min(viaB, viaA),
      next = viaB <= viaA ? b : a;
    if (dj < minJoinD) minJoinD = dj;
    candidates.push({ proj, dj, rem, total: dj + rem, next });
  }

  let chosen = null;
  for (const c of candidates) {
    const allowed = canWalk
      ? c.dj <= minJoinD + 1.8 || canWalk(from, c.proj)
      : c.dj <= minJoinD + 6.5;
    if (!allowed) continue;
    if (!chosen || c.total < chosen.total) chosen = c;
  }
  if (!chosen) {
    const xy = [];
    for (let p = nearestNode; p; p = p.onward) xy.push(p.p);
    return { xy, cum: withCum(xy), metres: nearestNode.cost + nearNodeD };
  }

  let raw = [];
  if (chosen.dj > 0.35) {
    const joinPts = subdivide(from, chosen.proj, 3.0);
    raw.push(...joinPts.slice(0, -1));
  }
  if (d(chosen.proj, chosen.next.p) > 0.2) raw.push(chosen.proj);
  for (let p = chosen.next; p; p = p.onward) raw.push(p.p);

  // Forward visibility shortcutting so live walks skip unnecessary lane wiggles when ground ahead is open & safe.
  if (canWalk && raw.length > 2) {
    const rcum = withCum(raw),
      pulled = [raw[0]];
    let i = 0;
    while (i < raw.length - 1) {
      let best = i + 1;
      for (let j = raw.length - 1; j > i + 1; j--) {
        const direct = d(raw[i], raw[j]),
          along = rcum[j] - rcum[i];
        if (along - direct > 2.0 && canWalk(raw[i], raw[j])) {
          best = j;
          break;
        }
      }
      if (best > i + 1) {
        pulled.push(...subdivide(raw[i], raw[best], 3.0).slice(1));
      } else {
        pulled.push(raw[best]);
      }
      i = best;
    }
    raw = pulled;
  }

  const cum = withCum(raw);
  return { xy: raw, cum, metres: cum.at(-1) };
}

export function guideStep(route, x, y) {
  const p = [x, y],
    xy = route.xy,
    cum = (route.cum ??= withCum(xy)),
    total = cum.at(-1) || 0;
  if (xy.length < 2) {
    const remain = xy.length ? d(p, xy[0]) : 0;
    return { remain, point: xy[0] || p, progress: 0 };
  }
  let cur = route.i || 0,
    lo = Math.max(0, cur - 2),
    hi = Math.min(xy.length - 2, cur + 20),
    bestK = cur,
    bestT = 0,
    bestD = Infinity;
  const scan = (a, b) => {
    for (let k = a; k <= b; k++) {
      const A = xy[k],
        B = xy[k + 1],
        vx = B[0] - A[0],
        vy = B[1] - A[1],
        t = Math.max(
          0,
          Math.min(
            1,
            ((x - A[0]) * vx + (y - A[1]) * vy) / (vx * vx + vy * vy || 1),
          ),
        ),
        proj = lerp(A, B, t),
        distP = d(p, proj);
      if (distP < bestD) {
        bestD = distP;
        bestK = k;
        bestT = t;
      }
    }
  };
  scan(lo, hi);
  if (bestD > 12) {
    bestD = Infinity;
    scan(0, xy.length - 2);
  }
  route.i = Math.min(xy.length - 1, bestT > 0.85 ? bestK + 1 : bestK);
  const progress =
    cum[bestK] + bestT * (cum[bestK + 1] - cum[bestK]);
  const targetArc = Math.min(total, progress + 4.8);
  let point = xy.at(-1);
  for (let k = bestK; k < xy.length - 1; k++) {
    if (cum[k + 1] >= targetArc) {
      const seg = Math.max(1e-6, cum[k + 1] - cum[k]);
      point = lerp(xy[k], xy[k + 1], Math.max(0, Math.min(1, (targetArc - cum[k]) / seg)));
      break;
    }
  }
  const remain = bestD + Math.max(0, total - progress);
  return { remain, point, progress };
}

// North-up pocket survey of this resident only: real footpath geometry and surveyed corners, never a made-up straight line.
export function drawHolding(canvas, rows, paths, r, square = null) {
  const c = canvas.getContext("2d"),
    w = (canvas.width = 400),
    h = (canvas.height = 186),
    R = pathTo(paths, r.court.land, r.house.gate),
    homes = rows.filter((z) => z[5].villageId === r.villageId),
    corners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map(([x, y]) => [r.c[0] + x, r.c[1] + y]),
    reserve = square
      ? [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ].map(([x, y]) => [
          square.sw[0] + x * square.side,
          square.sw[1] + y * square.side,
        ])
      : [],
    pts = [
      ...reserve,
      ...corners,
      ...(R?.xy || []),
      ...homes.map((z) => z[5].centre),
    ],
    X = Math.min(...pts.map((p) => p[0])),
    Y = Math.min(...pts.map((p) => p[1])),
    xx = Math.max(...pts.map((p) => p[0])),
    yy = Math.max(...pts.map((p) => p[1])),
    sc = Math.min(
      (w - 48) / Math.max(0.1, xx - X),
      (h - 32) / Math.max(0.1, yy - Y),
    ),
    pt = (p) => [
      (p[0] - (X + xx) / 2) * sc + w / 2,
      h / 2 - (p[1] - (Y + yy) / 2) * sc,
    ];
  c.fillStyle = "#e8e9d6";
  c.fillRect(0, 0, w, h);
  function stroke(a, color, l) {
    c.strokeStyle = color;
    c.lineWidth = l;
    c.lineJoin = "round";
    c.lineCap = "round";
    c.beginPath();
    a.forEach((p, i) => (i ? c.lineTo(...pt(p)) : c.moveTo(...pt(p))));
    c.stroke();
  }
  if (reserve.length) {
    const [a, b] = pt(reserve[3]);
    c.fillStyle = "#e6dcc0";
    c.fillRect(a, b, square.side * sc, square.side * sc);
    c.setLineDash([3, 3]);
    stroke([...reserve, reserve[0]], "#a48c64", 1.3);
    c.setLineDash([]);
  }
  for (const path of paths) stroke(path.xy, "#c3b79c", 1.3);
  const [a, b] = pt(corners[3]);
  c.fillStyle = "#b9cc92";
  c.fillRect(a, b, sc, sc);
  stroke([...corners, corners[0]], "#527148", 2.2);
  for (const p of corners) {
    const [x, y] = pt(p);
    c.fillStyle = "#50624c";
    c.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  if (R) stroke(R.xy, "#ac682d", 3.4);
  for (const z of homes) {
    const p = pt(z[5].centre),
      W = Math.max(3, (z[5].size_m[0] / M) * sc),
      D = Math.max(3, (z[5].size_m[1] / M) * sc);
    c.fillStyle = z[2] === r.u ? "#883f26" : "#a38867";
    c.save();
    c.translate(...p);
    c.rotate(-(z[5].yard?.a || 0));
    c.fillRect(-W / 2, -D / 2, W, D);
    c.restore();
  }
  const [x, y] = pt(r.house.centre);
  c.beginPath();
  c.arc(x, y, 6.6, 0, Math.PI * 2);
  c.strokeStyle = "#863b24";
  c.lineWidth = 2.4;
  c.stroke();
  c.font = "bold 14px sans-serif";
  c.fillStyle = "#334f3b";
  c.fillText("N", 11, 21);
  c.fillRect(11, h - 13, (50 / M) * sc, 2);
  c.font = "12px sans-serif";
  c.fillText("50 m", 11, h - 17);
  return R;
}
