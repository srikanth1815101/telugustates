// Read-only W3C standard mapping. Reconnecting with A already held must not replay a jump.
export class StandardPad {
  constructor() {
    this.reset();
  }
  reset() {
    this.index = null;
    this.held = false;
  }
  poll(pads, enabled) {
    const v = {
      side: 0,
      forward: 0,
      lookX: 0,
      lookY: 0,
      down: false,
      up: false,
      sprint: false,
      active: false,
    };
    const g =
      enabled &&
      [...(pads || [])].find(
        (p) => p && p.connected !== false && p.mapping === "standard",
      );
    if (!g) {
      v.up = this.held;
      this.reset();
      return v;
    }
    const axis = (n) => {
      let x = Number(g.axes?.[n]) || 0;
      return Math.abs(x) <= 0.15
        ? 0
        : Math.sign(x) * Math.min(1, (Math.abs(x) - 0.15) / 0.85);
    };
    v.side = axis(0);
    v.forward = -axis(1);
    v.lookX = axis(2);
    v.lookY = axis(3);
    const held = !!g.buttons?.[0]?.pressed;
    v.down = this.index === g.index && held && !this.held;
    v.up = this.index === g.index && !held && this.held;
    this.index = g.index;
    this.held = held;
    v.sprint = !!(g.buttons?.[4]?.pressed || g.buttons?.[10]?.pressed);
    v.active = !!(
      v.side ||
      v.forward ||
      v.lookX ||
      v.lookY ||
      v.down ||
      v.sprint
    );
    return v;
  }
}
