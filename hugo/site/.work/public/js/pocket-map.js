import { ACRE } from "./metres.js";
// North-up local chart in the frozen grid. The pointer rotates with the viewer, not the terrain.
export class PocketMap {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = canvas.height = 112;
    this.ctx = canvas.getContext("2d");
    this.last = "";
  }
  draw(L, x, y, yaw, r) {
    if (!this.ctx || !L || this.canvas.offsetWidth === 0) return;
    const span = r < 50 ? 3.1 : r < 500 ? 10 : 36,
      key = [
        L.id,
        Math.round(x * 100),
        Math.round(y * 100),
        Math.round(yaw * 14),
        span,
      ].join("/");
    if (key === this.last) return;
    this.last = key;
    const c = this.ctx,
      N = 28,
      w = 112,
      k = w / span,
      point = (X, Y) => [56 + (X - x) * k, 56 - (Y - y) * k];
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const X = x + ((i + 0.5 - N / 2) * span) / N,
          Y = y + ((N / 2 - j - 0.5) * span) / N,
          t = L.s.t.at(X, Y);
        let color = "#c9d6ba";
        if (t) {
          if ([3, 4].includes(t.c)) color = "#609f9e";
          else if (t.f > 48) color = "#839d75";
          else if (t.s > 12) color = "#b2ad91";
          else color = t.f > 15 ? "#a1b18c" : "#c4c59b";
        }
        c.fillStyle = color;
        c.fillRect(i * 4, j * 4, 4, 4);
      }
    c.lineWidth = 1.6;
    c.strokeStyle = "#8d754c";
    for (const v of L.villages)
      for (const path of v.paths) {
        c.beginPath();
        for (const [i, p] of path.xy.entries()) {
          const q = point(...p);
          if (!i) c.moveTo(...q);
          else c.lineTo(...q);
        }
        c.stroke();
      }
    for (const row of L.all) {
      let [X, Y, , , , h] = row;
      if (!h) continue;
      const a = point(X, Y + 1);
      c.strokeStyle = "#6d7152";
      c.strokeRect(...a, k, k);
      const p = point(...h.centre);
      c.fillStyle = "#9b6349";
      c.fillRect(p[0] - 2.5, p[1] - 2.5, 5, 5);
    }
    c.save();
    c.translate(56, 56);
    c.rotate(-yaw);
    c.lineWidth = 2.5;
    c.fillStyle = "#1d513d";
    c.strokeStyle = "#fcfae8";
    c.beginPath();
    c.moveTo(0, -8);
    c.lineTo(5, 6);
    c.lineTo(0, 3);
    c.lineTo(-5, 6);
    c.closePath();
    c.stroke();
    c.fill();
    c.restore();
    c.font = "bold 10px sans-serif";
    c.fillStyle = "#294c3a";
    c.fillText("N", 6, 13);
    c.fillStyle = "#3e5845";
    c.fillRect(7, 103, Math.min(32, (k * 50) / ACRE), 2);
  }
}
