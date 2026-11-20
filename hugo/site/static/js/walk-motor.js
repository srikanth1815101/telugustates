// Small kinematic character motor (metres / seconds). Acceleration, slope traction,
// gravity, floating spring and river drag run in bounded substeps independent of draw rate.
import { ACRE as U } from "./metres.js";
const clamp = (n, l, h) => Math.max(l, Math.min(h, n)),
  ease = (a, b, v) => {
    let t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
export class WalkMotor {
  reset(x, y, s, yaw = 0, H = 0.93) {
    const p = s.sample(x, y);
    Object.assign(this, {
      x,
      y,
      vx: 0,
      vy: 0,
      up: 0,
      grounded: p.depth <= 1.16,
      swim: p.depth > 1.16,
      root: p.depth > 1.16 ? p.line - H - 0.12 : p.z,
      yaw,
      depth: p.depth,
      state: "Stand",
      speed: 0,
      air: 0,
      distance: 0,
      blocked: 0,
      ripples: 0,
      wetTravel: 0,
      clock: 0,
      touch: p,
      grade: 0,
      lastGround: p.depth <= 1.16 ? 0 : -1e8,
      jumpUntil: -1,
      jumpHeld: false,
      jumps: 0,
      lands: 0,
      impact: 0,
      landAge: 10,
      launchAge: 10,
      stepUps: 0,
    });
  }
  recontact(s, H) {
    const p = s.sample(this.x, this.y),
      old = this.touch;
    if (this.swim && p.depth >= 0.99)
      this.root = Math.max(p.z, this.root + p.line - old.line);
    else if (this.grounded || this.swim) {
      this.swim = p.depth > 1.19;
      this.root = this.swim ? Math.max(p.z, p.line - H - 0.13) : p.z;
      this.up = 0;
      this.grounded = !this.swim;
    } else this.root = Math.max(this.root, p.z);
    this.touch = p;
    this.depth = p.depth;
  }
  jump() {
    this.jumpHeld = true;
    this.jumpUntil = this.clock + 0.12;
    this.tryJump();
  }
  releaseJump() {
    this.jumpHeld = false;
    if (this.up > 1.65 && this.launchAge < 0.3) this.up = 1.65;
  }
  tryJump() {
    if (
      this.jumpUntil >= this.clock &&
      !this.swim &&
      this.depth < 0.68 &&
      (this.grounded || this.clock - this.lastGround <= 0.120001)
    ) {
      this.up = 3.75 * (1 - 0.38 * this.depth);
      if (!this.jumpHeld) this.up = Math.min(2.45, this.up);
      this.grounded = false;
      this.lastGround = -1e8;
      this.launchAge = 0;
      this.jumpUntil = -1;
      this.jumps++;
      return true;
    }
    return false;
  }
  advance(dt, axisX, axisY, rate, s, allow, H, onStep = null) {
    const total = clamp(dt, 0, 0.24),
      n = Math.max(1, Math.ceil(total * 72)),
      h = total / n,
      d0 = this.distance;
    const len = Math.hypot(axisX, axisY),
      strength = Math.min(len, 1);

    for (let i = 0; i < n; i++) {
      let X = axisX / (len || 1),
        Y = axisY / (len || 1);
      const m = this.touch,
        oldX = this.x,
        oldY = this.y,
        w = ease(0.045, 0.53, m.depth);
      this.clock += h;
      this.landAge += h;
      this.launchAge += h;
      if (this.grounded) this.lastGround = this.clock;
      this.tryJump();
      if (m.depth > 1.19) this.swim = true;
      else if (m.depth < 0.99) this.swim = false;
      // Tangential gravity and traction on a steep downhill face. Test the actual collision plane, not the district grade class.
      const grad =
          s.gradeAt && this.grounded && !this.swim && strength > 0.02
            ? s.gradeAt(this.x, this.y)
            : null,
        gg = grad ? Math.hypot(grad[0], grad[1]) : 0;
      if (gg > Math.tan((40 * Math.PI) / 180) && strength) {
        const uphill = X * grad[0] - Y * grad[1];
        if (uphill > 0) {
          X -= (uphill * grad[0]) / (gg * gg);
          Y += (uphill * grad[1]) / (gg * gg);
        }
        if (uphill < -0.05) {
          X -= (0.17 * grad[0]) / gg;
          Y += (0.17 * grad[1]) / gg;
        }
      }
      const dryRate = rate * clamp(1 - 0.75 * Math.max(0, this.grade), 0.48, 1),
        pace = this.swim
          ? clamp(rate * 0.76, 0.81, 1.78)
          : dryRate + (Math.max(0.65, rate * 0.6) - dryRate) * w,
        flow = w > 0.1 ? s.current(this.x, this.y, 1) : [0, 0, 0],
        drift = Math.max(0, flow[2]) * 0.33 * w,
        tx = X * strength * pace + flow[0] * drift,
        ty = Y * strength * pace - flow[1] * drift,
        dx = tx - this.vx,
        dy = ty - this.vy,
        D = Math.hypot(dx, dy),
        acc = this.swim
          ? 2.35
          : !this.grounded
            ? 2.8
            : strength
              ? (rate > 2 ? 7.7 : 5.3) * (1 - 0.5 * w)
              : 8.5 * (1 - 0.52 * w),
        k = D ? Math.min(1, (acc * h) / D) : 0;
      this.vx += dx * k;
      this.vy += dy * k;
      let xx = this.x + (this.vx * h) / U,
        yy = this.y + (this.vy * h) / U;
      const permitted = (a, b, ox, oy) => {
        if (!allow(a, b, ox, oy)) return false;
        if (this.swim || m.depth > 0.65) return true;
        const len = Math.hypot(a - ox, b - oy) * U;
        if (len < 1e-8) return true;
        const H = s.sample(a, b).z,
          base = s.sample(ox, oy).z,
          dh = H - base;
        if (dh <= 1e-8 || dh / len <= Math.tan((40 * Math.PI) / 180))
          return true;
        // A riser is followed by level support. An uninterrupted steep ramp is not a flight of tiny steps.
        const xx = (a - ox) / len,
          yy = (b - oy) / len,
          h2 = s.sample(a + xx * 0.4, b + yy * 0.4).z;
        if (dh <= 0.405 && Math.abs(h2 - H) <= 0.085) {
          if (dh > 0.04) this.stepUps++;
          return true;
        }
        return !this.grounded && this.root >= H - 0.015;
      };
      if (Math.abs(this.vx) > 1e-5 && !permitted(xx, this.y, this.x, this.y)) {
        this.vx = 0;
        this.blocked++;
      } else this.x = xx;
      if (Math.abs(this.vy) > 1e-5 && !permitted(this.x, yy, this.x, this.y)) {
        this.vy = 0;
        this.blocked++;
      } else this.y = yy;
      const p = (this.touch = s.sample(this.x, this.y)),
        d = Math.hypot(this.x - oldX, this.y - oldY) * U;
      if (d > 0.0005)
        this.grade +=
          (clamp((p.z - m.z) / d, -1.5, 1.5) - this.grade) *
          (1 - Math.exp(-h * 9));
      if (this.swim) {
        let dest = p.line - H - 0.13 + 0.028 * Math.sin(this.clock * 3.5);
        this.up += (31 * (dest - this.root) - 9 * this.up) * h;
        this.root = Math.max(p.z, this.root + this.up * h);
        this.grounded = false;
      } else if (this.grounded && p.z - m.z >= -0.31 && p.z - m.z <= 0.405) {
        this.root = p.z;
        this.up = 0;
      } else {
        this.up -= 9.81 * h;
        this.root += this.up * h;
        if (this.root <= p.z && this.up <= 0) {
          if (!this.grounded && this.up < -0.4) {
            this.impact = -this.up;
            this.landAge = 0;
            this.lands++;
          }
          this.root = p.z;
          this.up = 0;
          this.grounded = true;
        } else this.grounded = false;
      }
      this.distance += d;
      if (p.depth > 0.07) this.wetTravel += d;
      if (strength > 0.065 && Math.hypot(this.vx, this.vy) > 0.075) {
        const aim = Math.atan2(-X, Y),
          angle = Math.atan2(
            Math.sin(aim - this.yaw),
            Math.cos(aim - this.yaw),
          );
        this.yaw += angle * (1 - Math.exp(-h * (this.swim ? 4.3 : 11.5)));
      }
      this.speed = Math.hypot(this.vx, this.vy);
      this.depth = p.depth;
      this.air = this.swim ? 0 : Math.max(0, this.root - p.z);
      onStep?.(h, this);
    }
    this.depth = this.touch.depth;
    this.air = this.swim ? 0 : Math.max(0, this.root - this.touch.z);
    this.speed = Math.hypot(this.vx, this.vy);
    this.state = this.swim
      ? "Swim"
      : this.air > 0.065
        ? "Jump"
        : this.depth > 0.075
          ? "Wade"
          : this.speed > 3.88
            ? "Run"
            : this.speed > 0.1
              ? "Walk"
              : "Stand";
    return this.distance - d0;
  }
}
