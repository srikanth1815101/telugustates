// Device-local virtual position only: no device GPS, timestamp expiry, server or economy writes.
const key = "atlas-nature-position-v1";
export function readPosition(a) {
  try {
    const p = JSON.parse(localStorage.getItem(key));
    if (
      !p ||
      p.schema !== 1 ||
      !["ground", "mid", "far"].includes(p.level) ||
      ![p.x, p.y, p.yaw, p.pitch, p.follow, p.tilt, p.range].every(
        Number.isFinite,
      ) ||
      p.x < 0 ||
      p.y < 0 ||
      p.x >= a.project.cols ||
      p.y >= a.project.rows ||
      p.follow < 3 ||
      p.follow > 7 ||
      p.range < 0.025 ||
      p.range > 3500 ||
      Math.abs(p.pitch) > 1.5 ||
      p.tilt < 0 ||
      p.tilt > 1.6 ||
      typeof p.route !== "string" ||
      !/^#\/(?:field\/[a-z-]+\/(?:ground|mid|far|bank|grove)|u\/[a-z0-9_.]{1,30}|at\/-?[\d.]+,-?[\d.]+)$/.test(
        p.route,
      )
    )
      return null;
    return p;
  } catch {
    return null;
  }
}
export function writePosition(p) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...p, schema: 1 }));
  } catch {}
}
