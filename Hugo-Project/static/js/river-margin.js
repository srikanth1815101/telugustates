// Running freshwater only. Heights are an illustrative local response of a fitted bank, not a surveyed flood stage.
// Packet scales are in metres/seconds. Translate a 2-D envelope before sampling; never rotate a regional coordinate by a local tangent.
const ramp = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
export function runPace(grade) {
  return Math.min(
    2.1,
    0.32 +
      1.29 * ramp(0.00005, 0.0038, grade) +
      4.9 * Math.sqrt(Math.min(0.25, grade)),
  );
}
export function shelfDepth(v) {
  return v.w < 0
    ? Math.min(v.line - v.z, 5.3 * v.w)
    : Math.max(0, v.line - v.z);
}
export function bankGain(s, v, f, range) {
  const d = shelfDepth(v);
  if (
    s.surveyGrid ||
    v.sea > 0.016 ||
    range >= 204 ||
    v.w < -0.043 ||
    d < -0.27 ||
    d > 1.0 ||
    f[2] < 0.45
  )
    return 0;
  return (
    (1 - ramp(133, 204, range)) *
    ramp(0.45, 0.88, f[2]) *
    (1 - ramp(0.32, 1.0, d)) *
    ramp(-0.043, -0.017, v.w)
  );
}
// A few moving tongues at once: neighbouring shoals receive different fronts and have different exposure. No common river level oscillation.
function packet(x, z) {
  const u =
    0.6 * Math.sin(0.47 * x + 0.26 * z + 0.83 * Math.sin(0.13 * x - 0.28 * z)) +
    0.35 * Math.cos(-0.35 * x + 0.66 * z + 0.99) +
    0.22 * Math.sin(0.85 * x - 0.12 * z - 1.6);
  return ramp(-0.19, 0.76, u);
}
export function marginLift(x, z, t, vx, vz, g) {
  if (!g) return 0;
  const a = ((t % 18) + 18) % 18,
    b = (a + 9) % 18,
    w = ramp(0.14, 0.86, Math.abs(a - 9) / 9);
  const push =
    packet(x - vx * a, z - vz * a) * (1 - w) +
    packet(x - vx * b, z - vz * b) * w;
  const site =
    0.27 +
    0.73 *
      ramp(
        -0.64,
        0.42,
        0.65 * Math.cos(0.185 * x + 0.24 * z) +
          0.47 * Math.sin(0.31 * z - 0.11 * x + 0.7),
      );
  return g * site * (0.168 * push - 0.032);
}
export const marginGLSL = `float marginPulse(vec2 q){float u=.60*sin(dot(q,vec2(.47,.26))+.83*sin(dot(q,vec2(.13,-.28))))+.35*cos(dot(q,vec2(-.35,.66))+.99)+.22*sin(dot(q,vec2(.85,-.12))-1.6);return smoothstep(-.19,.76,u);}
float marginLift(vec2 p,float t,vec2 vel,float g){float a=mod(t,18.),b=mod(a+9.,18.),w=smoothstep(.14,.86,abs(a-9.)/9.);float push=mix(marginPulse(p-vel*a),marginPulse(p-vel*b),w);float site=.27+.73*smoothstep(-.64,.42,.65*cos(dot(p,vec2(.185,.24)))+.47*sin(dot(p,vec2(-.11,.31))+.7));return g*site*(.168*push-.032);}`;
// Barycentric, just like the *actual* production vertex sheet. Tests exercise both drawn/collidable faces, landward of the mean contour too.
export function bankMix(a, b, c, u, v) {
  return a.margin || b.margin || c.margin
    ? [a.margin, b.margin, c.margin, u, v]
    : null;
}
export function contactLift(m, t) {
  const h = (k) => (k ? marginLift(k[0], k[1], t, k[2], k[3], k[4]) : 0),
    [a, b, c, u, v] = m;
  return (1 - u - v) * h(a) + u * h(b) + v * h(c);
}
