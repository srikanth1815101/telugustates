// Real frame intervals, not the rAF request count. Software detection sets the initial ceiling.
export function deviceTier(renderer) {
  const gl = renderer.getContext(),
    ext = gl.getExtension("WEBGL_debug_renderer_info"),
    name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "";
  return /swiftshader|llvmpipe|software|softpipe/i.test(name)
    ? 0
    : matchMedia("(max-width:700px),(pointer:coarse)").matches
      ? 1
      : 2;
}
export class Governor {
  constructor(cap) {
    this.cap = cap;
    this.tier = cap;
    this.trial = false;
    this.log = [];
    this.sample = null;
    this.reset();
  }
  reset() {
    this.times = [];
    this.cooldown = 0.3;
  }
  change(n, reason) {
    if (n === this.tier) return false;
    this.log.push({ from: this.tier, to: n, reason });
    this.tier = n;
    this.reset();
    return true;
  }
  audition() {
    this.trial = true;
    this.sample = { frames: 0, seconds: 0, people: 0, grass: 0, intervals: [] };
    return this.change(2, "opt-in rich detail sample");
  }
  observe(dt, people, grass) {
    if (dt <= 0) return false;
    if (this.trial) {
      const s = this.sample;
      s.frames++;
      s.seconds += dt;
      s.intervals.push(dt * 1000);
      s.people = Math.max(s.people, people);
      s.grass = Math.max(s.grass, grass);
      if (s.frames >= 20 && (s.seconds >= 2 || s.frames >= 120)) {
        s.fps = s.frames / s.seconds;
        const sorted = [...s.intervals].sort((a, b) => a - b);
        s.p95ms = sorted[Math.ceil(0.95 * sorted.length) - 1];
        this.trial = false;
        const slow = s.fps < 30;
        return this.change(
          Math.min(this.cap, slow ? 1 : 2),
          slow
            ? "rich sample exceeded frame budget"
            : "return to detected device tier",
        );
      }
    } else if (this.tier > 0) {
      this.cooldown -= dt;
      if (this.cooldown > 0) return false;
      this.times.push(dt);
      if (this.times.length > 7) this.times.shift();
      if (
        this.times.length >= 5 &&
        this.times.filter((t) => t > 1 / 28).length >= 5
      )
        return this.change(this.tier - 1, "five recent frames exceeded 36 ms");
    }
    return false;
  }
}
// Budget fragments by AREA. A rotated display should not suddenly shade four times as many pixels.
export function fieldRatio(w, h, dpr, tier, orbit, pixels) {
  const cap =
    tier === 2
      ? 1.35
      : tier === 1
        ? 0.85
        : orbit
          ? Math.min(1, 750 / w)
          : Math.min(0.95, Math.sqrt(pixels / (w * h)));
  return Math.min(dpr, cap);
}
