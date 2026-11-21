import { ACRE as M } from "./metres.js";
const id = (p) => p.map((n) => n.toFixed(7)).join("/"),
  d = (a, b) => M * Math.hypot(a[0] - b[0], a[1] - b[1]);
// The pins are the shared vertices of physical lanes. Dijkstra never connects two close-looking paths across a wall.
export function pathTo(paths, end, from) {
  const nodes = new Map(),
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
      }
      a = b;
    }
  }
  const goal = nodes.get(id(end));
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
  let start,
    near = Infinity;
  for (const a of nodes.values()) {
    if (!a.done) continue;
    const n = d(a.p, from);
    if (n < near) {
      near = n;
      start = a;
    }
  }
  const xy = [];
  for (let p = start; p; p = p.onward) xy.push(p.p);
  return { xy, metres: (start?.cost || 0) + near };
}
export function guideStep(route, x, y) {
  let i = route.i || 0,
    p = [x, y],
    xy = route.xy;
  while (i + 1 < xy.length && d(p, xy[i]) < 2.7) i++;
  route.i = i;
  let remain = d(p, xy[i]);
  for (let k = i + 1; k < xy.length; k++) remain += d(xy[k - 1], xy[k]);
  return { remain, point: xy[i] };
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
