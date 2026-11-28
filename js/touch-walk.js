// Each contact owns one role from down until up/cancel. Only two *look* contacts pinch.
// Pointer capture stays with the original DOM node, even when a thumb drifts across the screen.
export function touchWalk(host, canvas, joy, jump, sprint, on, api) {
  const live = new Map(),
    stats = { moves: 0, looks: 0, jumps: 0, sprints: 0, simultaneous: 0 };
  let stick = [0, 0],
    locked = false,
    lastLook = -1e6;
  const cap = (x, l, h) => Math.max(l, Math.min(h, x)),
    now = () => performance.now(),
    is = (role) => [...live.values()].some((v) => v.role === role);
  const endJoy = () => {
    stick = [0, 0];
    joy.removeAttribute("style");
    joy.firstElementChild.style.transform = "";
    joy.classList.remove("tracking");
  };
  function begin(e, role) {
    if (!api.active() || live.has(e.pointerId)) return false;
    let from = e.currentTarget;
    if (from === canvas && e.pointerType === "mouse" && e.button !== 0)
      return false;
    const rec = {
      role,
      x: e.clientX,
      y: e.clientY,
      ox: e.clientX,
      oy: e.clientY,
      at: e.timeStamp,
      el: from,
    };
    if (role === "move" && is("move")) return false;
    live.set(e.pointerId, rec);
    e.preventDefault();
    from.setPointerCapture?.(e.pointerId);
    api.wake();
    api.audio();
    if (role === "move") {
      const box = joy.getBoundingClientRect();
      rec.ox = box.x + box.width / 2;
      rec.oy = box.y + box.height / 2;
      joy.classList.add("tracking");
      move(e);
    } else if (role === "jump") {
      stats.jumps++;
      api.jump();
    } else if (role === "sprint") {
      stats.sprints++;
    } else lastLook = rec.at;
    stats.simultaneous = Math.max(
      stats.simultaneous,
      new Set([...live.values()].map((v) => v.role)).size,
    );
    return true;
  }
  function move(e) {
    const p = live.get(e.pointerId);
    if (!p) return false;
    e.preventDefault();
    api.wake();
    const dx = e.clientX - p.x,
      dy = e.clientY - p.y;
    if (p.role === "move") {
      let u = (e.clientX - p.ox) / 29,
        v = (p.oy - e.clientY) / 29,
        k = Math.hypot(u, v),
        gain = k > 0.105 ? Math.min(1, (k - 0.105) / 0.895) / k : 0;
      stick = [u * gain, v * gain];
      joy.firstElementChild.style.transform = `translate(${stick[0] * 19}px,${-stick[1] * 19}px)`;
      if (k > 0.105) {
        stats.moves++;
        api.lesson("move");
      }
    }
    if (p.role === "look") {
      const other = [...live.values()].find(
        (v) => v !== p && v.role === "look",
      );
      if (other) {
        const ratio =
          Math.hypot(e.clientX - other.x, e.clientY - other.y) /
          Math.max(1, Math.hypot(p.x - other.x, p.y - other.y));
        api.zoom(cap(ratio, 0.5, 2));
      } else if (dx || dy) {
        api.turn(dx, dy);
        api.lesson("look");
        stats.looks++;
      }
      lastLook = now();
    }
    p.x = e.clientX;
    p.y = e.clientY;
    return true;
  }
  function end(e) {
    const p = live.get(e.pointerId);
    if (!p) return;
    live.delete(e.pointerId);
    if (p.role === "move") endJoy();
    if (p.role === "jump") api.jumpEnd();
    if (p.role === "sprint") {
      if (
        e.type === "pointerup" &&
        Math.hypot(e.clientX - p.ox, e.clientY - p.oy) < 26
      ) {
        locked = !locked;
        api.sprint(locked);
      }
    }
    if (p.role === "look") lastLook = now();
    try {
      if (p.el.hasPointerCapture(e.pointerId))
        p.el.releasePointerCapture(e.pointerId);
    } catch {}
  }
  const reset = () => {
    for (const [id] of [...live]) end({ pointerId: id });
    locked = false;

    api.sprint(false);
    endJoy();
  };
  for (const [el, role] of [
    [canvas, null],
    [joy, "move"],
    [jump, "jump"],
    [sprint, "sprint"],
  ]) {
    on(
      el,
      "pointerdown",
      (e) => {
        if (!api.active()) return;
        begin(e, role || "look");
      },
      { passive: false },
    );
    on(el, "pointermove", move, { passive: false });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
      on(el, name, end);
    on(el, "contextmenu", (e) => e.preventDefault());
  }
  // Keyboard activation from a screen reader is not a second synthetic touch press.
  on(jump, "click", (e) => {
    if (e.detail === 0 && api.active()) {
      api.jump();
      api.jumpEnd();
    }
  });
  on(sprint, "click", (e) => {
    if (e.detail === 0 && api.active()) {
      locked = !locked;
      api.sprint(locked);
    }
  });
  return {
    reset,
    stick: () => stick,
    sprint: () => locked,
    roles: () => [...live.values()].map((v) => v.role),
    stats,
    lastLook: () => lastLook,
    isLooking: () => is("look"),
  };
}
