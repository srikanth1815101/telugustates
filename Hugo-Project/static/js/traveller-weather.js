import * as T from "../vendor/three.module.min.js";
// Mask these two authored palettes, not every material in the scene. Preserve the dry/skin colours.
export function wornWeather(R, mat, style) {
  const { geometry: g } = R.mesh;
  if (!g.getAttribute("clothWeight")) {
    const c = g.getAttribute("color"),
      p = g.getAttribute("position"),
      a = new Float32Array(c.count);
    for (let i = 0; i < a.length; i++) {
      const r = c.getX(i),
        y = p.getY(i),
        skin = Math.abs(r - (style === "man" ? 0.6172 : 0.4938)) < 0.003,
        hair = r < 0.06 && y > 1.4;
      a[i] = skin ? 0.14 : hair ? 0.53 : r > 0.57 && r < 0.61 ? 0.42 : 1;
    }
    g.setAttribute("clothWeight", new T.BufferAttribute(a, 1));
  }
  const u = {
    upperWet: { value: 0 },
    lowerWet: { value: 0 },
    shower: { value: 0 },
    dripTime: { value: 0 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader =
      "attribute float clothWeight;varying float fabric;varying vec3 restPoint;\n" +
      sh.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nfabric=clothWeight;restPoint=position;",
      );
    sh.fragmentShader =
      "uniform float upperWet,lowerWet,shower,dripTime;varying float fabric;varying vec3 restPoint;\n" +
      sh.fragmentShader
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
 float soak=mix(lowerWet,upperWet,smoothstep(.38,1.3,restPoint.y));float cloth=fabric*soak;float mott=.87+.13*sin(restPoint.y*13.+2.3*cos(restPoint.x*19.+restPoint.z*12.));diffuseColor.rgb*=mix(vec3(1.),vec3(.43,.49,.53),cloth*mott);
 float seam=sin(restPoint.x*91.+restPoint.z*103.+1.7*sin(restPoint.y*11.));float bead=pow(max(0.,seam),28.)*pow(max(0.,sin(restPoint.y*32.+dripTime*6.+restPoint.x*17.)),8.);diffuseColor.rgb+=vec3(.058,.080,.087)*bead*shower*fabric;`,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          "#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.36,cloth);",
        );
  };
  mat.customProgramCacheKey = () => "field-wet-cloth-v1";
  const count = 30,
    pts = new T.BufferGeometry(),
    pos = new Float32Array(3 * count);
  pts.setAttribute(
    "position",
    new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage),
  );
  const splat = new T.Points(
    pts,
    new T.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      vertexShader: `uniform float dripTime,shower;varying float alpha;void main(){float id=float(gl_VertexID),s=fract(sin(id*78.19+1.)*2439.22),a=fract(dripTime*(2.3+.8*s)+s*21.);vec3 p=position;float az=6.283*s;p.xz+=vec2(cos(az),sin(az))*(.026+.15*a);p.y+=.19*a-.30*a*a;vec4 eye=modelViewMatrix*vec4(p,1.);alpha=(1.-a)*smoothstep(s-.12,s+.15,shower);gl_PointSize=clamp(8./max(1.,-eye.z),1.,3.);gl_Position=projectionMatrix*eye;}`,
      fragmentShader: `varying float alpha;void main(){float d=length(gl_PointCoord-.5);if(d>.49)discard;gl_FragColor=vec4(.78,.89,.94,alpha*(1.-smoothstep(.16,.49,d))*.83);}`,
    }),
  );
  splat.userData.role = "traveller-rain-contact";
  splat.frustumCulled = false;
  R.g.add(splat);
  splat.visible = false;
  return {
    update(rain, depth, swim, dt, time, visible) {
      const exposure = Math.min(1.0, rain * 1.25),
        upper = Math.max(swim ? 1 : 0, exposure),
        lower = Math.max(Math.min(1, depth / 0.56), upper * 0.89);
      for (const [q, target] of [
        [u.upperWet, upper],
        [u.lowerWet, lower],
      ]) {
        const rate = target > q.value ? (swim ? 0.96 : 0.27) : 0.012;
        q.value += (target - q.value) * (1 - Math.exp(-Math.min(1, dt) * rate));
      }
      u.shower.value = rain;
      u.dripTime.value = time;
      splat.visible = visible && !swim && rain > 0.055;
      if (splat.visible) {
        for (let i = 0; i < count; i++) {
          const which = i % 5,
            b = R.bones[[7, 9, 32, 10, 33][which]].position;
          pos[i * 3] = b.x + 0.024 * Math.cos(i * 1.72);
          pos[i * 3 + 1] =
            b.y +
            (which === 0 ? (style === "man" ? 0.204 : 0.189) : 0.03) +
            0.012 * Math.sin(i);
          pos[i * 3 + 2] = b.z + 0.029 * Math.sin(i * 1.88);
        }
        pts.attributes.position.needsUpdate = true;
      }
    },
    restore(v) {
      u.upperWet.value = T.MathUtils.clamp(v.upper, 0, 1);
      u.lowerWet.value = T.MathUtils.clamp(v.hem, 0, 1);
    },
    read: () => ({
      upper: u.upperWet.value,
      hem: u.lowerWet.value,
      impacts: splat.visible ? count : 0,
      rain: u.shower.value,
    }),
    dispose() {
      splat.removeFromParent();
      pts.dispose();
      splat.material.dispose();
    },
  };
}
