// Shared expression for the beach, water film and boots. d is signed bed depth in metres, negative on the beach.
// Waves travel from larger to smaller d. Grouping and an oblique along-shore phase split the front into uneven tongues.
// Close to the drying contour the phase is nearly independent of bed depth. A strong phase gradient there compressed the retreat into ~1.5 s.
const shore =
  "-.614*t+.35*sin(.021*x+.032*z)+.24*sin(-.028*x+.014*z)-.075*d-.66*max(0.,d-.72)";
export const shoreGLSL = `float swashPhase(vec2 p,float t,float bed){float x=p.x,z=p.y,d=max(-.62,bed);return ${shore};}`;
// x/z are metres in the map frame. The first 0.88 m of bed depth is EXACTLY the old swash law.
// Outside it a shoaling front shortens against the local bed. In open water two bay-bound trains cross in loose groups.
// The second harmonic leans the tall side of each front toward shore. Neither a foam texture nor the wet-sand clock moves the mesh.
export const surfGLSL = `${shoreGLSL}
float windSwell(float a){return sin(a)-.18*cos(2.*a+.49);}
float bore(float a){return sin(a)-.245*cos(2.*a+.60)-.051*sin(3.*a+.80);}
float seaLift(vec2 p,float t,float depth){float x=p.x,z=p.y,d=max(-.62,depth),a=swashPhase(p,t,d);
 float nearLift=(.93+.07*cos(.031*z+.14*t+.7*sin(.019*x)))*(.541*sin(a)-.009*sin(3.*a))+.040*sin(.024*x-.022*z-.31*t);
 if(d<=.88)return nearLift;
 float sh=a-2.96*max(0.,d-.64)+.43*sin(.039*x+.057*z-.105*t);
 float shore=(.83+.16*cos(.035*x+.023*z-.091*t)+.062*sin(.061*z-.025*x+.11*t))*bore(sh);
 float h=mix(nearLift,shore,smoothstep(.88,1.57,d));if(d<=2.26)return h;
 float bay=dot(p,vec2(-.938,.347))*.198-.85*t+.71*sin(.033*x+.048*z)+.39*sin(-.043*x+.024*z-.125*t);
 float height=(.755+.19*cos(.023*x-.018*z-.115*t)+.087*sin(.037*x+.029*z+.083*t))*windSwell(bay)
       +(.224+.064*cos(.024*z-.13*t))*sin(-.116*x-.105*z-.695*t+.37*sin(.038*x+.057*z));
 return mix(h,height,smoothstep(2.26,3.26,d));}`;
// Explicit companion for the offline controller (no eval); tests sample the same signed transect at rendering vertices and boots.
const ramp = (lo, hi, x) => {
  const f = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return f * f * (3 - 2 * f);
};
export function seaLift(x, z, t, depth) {
  const { sin, cos, max } = Math,
    d = max(-0.62, depth),
    a =
      -0.614 * t +
      0.35 * sin(0.021 * x + 0.032 * z) +
      0.24 * sin(-0.028 * x + 0.014 * z) -
      0.075 * d -
      0.66 * max(0, d - 0.72);
  const near =
    (0.93 + 0.07 * cos(0.031 * z + 0.14 * t + 0.7 * sin(0.019 * x))) *
      (0.541 * sin(a) - 0.009 * sin(3 * a)) +
    0.04 * sin(0.024 * x - 0.022 * z - 0.31 * t);
  if (d <= 0.88) return near;
  const sh =
      a -
      2.96 * max(0, d - 0.64) +
      0.43 * sin(0.039 * x + 0.057 * z - 0.105 * t),
    shore =
      (0.83 +
        0.16 * cos(0.035 * x + 0.023 * z - 0.091 * t) +
        0.062 * sin(0.061 * z - 0.025 * x + 0.11 * t)) *
      (sin(sh) - 0.245 * cos(2 * sh + 0.6) - 0.051 * sin(3 * sh + 0.8)),
    h = near + (shore - near) * ramp(0.88, 1.57, d);
  if (d <= 2.26) return h;
  const bay =
      (-0.938 * x + 0.347 * z) * 0.198 -
      0.85 * t +
      0.71 * sin(0.033 * x + 0.048 * z) +
      0.39 * sin(-0.043 * x + 0.024 * z - 0.125 * t),
    height =
      (0.755 +
        0.19 * cos(0.023 * x - 0.018 * z - 0.115 * t) +
        0.087 * sin(0.037 * x + 0.029 * z + 0.083 * t)) *
        (sin(bay) - 0.18 * cos(2 * bay + 0.49)) +
      (0.224 + 0.064 * cos(0.024 * z - 0.13 * t)) *
        sin(
          -0.116 * x -
            0.105 * z -
            0.695 * t +
            0.37 * sin(0.038 * x + 0.057 * z),
        );
  return h + (height - h) * ramp(2.26, 3.26, d);
}
export function tidalBed(v, seaDatum) {
  return v.w < 0 ? Math.min(v.w * 7.5, seaDatum - v.z) : seaDatum - v.z;
}
// Fit only the missing landward side. The original inland water polygons, ground triangles and mean shoreline survive unchanged.
export function beachFace(a, b, c) {
  return (
    Math.max(a.sea, b.sea, c.sea) > 0.17 &&
    Math.min(a.w, b.w, c.w) < 0 &&
    Math.max(a.w, b.w, c.w) > -0.142 &&
    Math.min(a.w, b.w, c.w) <= 0 &&
    Math.max(a.w, b.w, c.w) <= 1e-8
  );
}
