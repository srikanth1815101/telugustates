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
  if (v.sea > 0.016 || v.w < -0.056 || d < -0.32 || d > 1.12 || f[2] < 0.08)
    return 0;
  return (
    (0.7 + 0.3 * (1 - ramp(160, 920, range))) *
    (0.36 + 0.64 * ramp(0.08, 0.56, f[2])) *
    ramp(0.08, 0.14, f[2]) *
    (1 - ramp(0.36, 1.12, d)) *
    ramp(-0.056, -0.014, v.w)
  );
}
// Moving tongues plus quicker local bank slosh: neighbouring shoals advance and pull back asynchronously. No common river level oscillation.
function packet(x, z) {
  const u =
    0.55 *
      Math.sin(0.47 * x + 0.26 * z + 0.86 * Math.sin(0.13 * x - 0.28 * z)) +
    0.32 * Math.cos(-0.35 * x + 0.66 * z + 0.99) +
    0.22 * Math.sin(0.85 * x - 0.12 * z - 1.6) +
    0.15 * Math.cos(1.18 * x + 0.74 * z + 0.42);
  return ramp(-0.24, 0.72, u);
}
export function marginLift(x, z, t, vx, vz, g) {
  if (!g) return 0;
  const a = ((t % 10) + 10) % 10,
    b = (a + 5) % 10,
    w = ramp(0.14, 0.86, Math.abs(a - 5) / 5),
    ux = vx * 1.32,
    uz = vz * 1.32,
    push =
      packet(x - ux * a, z - uz * a) * (1 - w) +
      packet(x - ux * b, z - uz * b) * w,
    lap = ramp(
      -0.78,
      0.78,
      0.64 *
        Math.sin(
          0.62 * x -
            0.41 * z -
            t * 1.65 +
            0.85 * Math.sin(0.19 * x + 0.23 * z),
        ) +
        0.36 * Math.cos(-0.29 * x + 0.57 * z - t * 1.08 + 1.3),
    ),
    wave = 0.68 * push + 0.32 * lap,
    site =
      0.34 +
      0.66 *
        ramp(
          -0.64,
          0.42,
          0.65 * Math.cos(0.185 * x + 0.24 * z) +
            0.47 * Math.sin(0.31 * z - 0.11 * x + 0.7),
        );
  return g * site * (0.282 * wave - 0.09);
}
export const marginGLSL = `float marginPulse(vec2 q){float u=.55*sin(dot(q,vec2(.47,.26))+.86*sin(dot(q,vec2(.13,-.28))))+.32*cos(dot(q,vec2(-.35,.66))+.99)+.22*sin(dot(q,vec2(.85,-.12))-1.6)+.15*cos(dot(q,vec2(1.18,.74))+.42);return smoothstep(-.24,.72,u);}
float marginLift(vec2 p,float t,vec2 vel,float g){float a=mod(t,10.),b=mod(a+5.,10.),w=smoothstep(.14,.86,abs(a-5.)*.2);vec2 u=vel*1.32;float push=mix(marginPulse(p-u*a),marginPulse(p-u*b),w);float lap=smoothstep(-.78,.78,.64*sin(dot(p,vec2(.62,-.41))-t*1.65+.85*sin(dot(p,vec2(.19,.23))))+.36*cos(dot(p,vec2(-.29,.57))-t*1.08+1.3));float wave=.68*push+.32*lap;float site=.34+.66*smoothstep(-.64,.42,.65*cos(dot(p,vec2(.185,.24)))+.47*sin(dot(p,vec2(-.11,.31))+.7));return g*site*(.282*wave-.09);}`;
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
