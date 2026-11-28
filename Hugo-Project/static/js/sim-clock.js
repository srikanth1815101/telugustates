// Fixed-timestep accumulator (Phase 1). The simulation advances in exact
// STEP-sized slices; leftover time carries to the next frame so a slow or
// irregular render frame can never stretch a tick. Catch-up beyond
// maxCatchUp is dropped (and counted) instead of spiralling.
//
// Rendering stays variable-rate: each render frame simply observes the
// state after however many ticks it consumed — the same pattern the walk
// motor already used internally, made explicit and shared by every system
// that ticks (motor, physics, crops, economy).
export class SimClock {
  constructor(step = 1 / 120, maxCatchUp = 0.1) {
    this.step = step;
    this.maxCatchUp = maxCatchUp;
    this.acc = 0;
    this.ticks = 0;
    this.dropped = 0;
    this.frames = 0;
  }

  /**
   * Feed one frame's elapsed seconds; `tick(step)` runs 0..n times with the
   * fixed step. Returns how many ticks ran.
   */
  advance(dt, tick) {
    this.frames++;
    const before = this.acc;
    this.acc = Math.min(this.acc + Math.max(0, dt), this.maxCatchUp);
    if (before + Math.max(0, dt) > this.maxCatchUp)
      this.dropped += before + dt - this.acc;
    let n = 0;
    while (this.acc >= this.step) {
      tick(this.step);
      this.acc -= this.step;
      this.ticks++;
      n++;
    }
    return n;
  }

  /** Fraction of the step already banked (0..1) — useful for render interpolation. */
  get alpha() {
    return this.acc / this.step;
  }

  report() {
    return {
      step: this.step,
      ticks: this.ticks,
      frames: this.frames,
      dropped: +this.dropped.toFixed(6),
      alpha: +this.alpha.toFixed(4),
    };
  }
}
