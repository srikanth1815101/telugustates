import * as T from "../vendor/three.module.min.js";
// Vertex lighting on the entry-level path. Meshes and instance transforms still render every frame.
// No foliage deformation, shadows, cloud loop or per-pixel lighting on the software renderer.
export function fieldMaterial(u, grid = false, vertexColors = grid) {
  const mat = new T.ShaderMaterial({
    uniforms: u,
    vertexColors,
    vertexShader: `varying vec3 shade;varying vec2 groundXZ;varying float gridFade;uniform vec3 uSun,uMoon,uHor;uniform float uDay,uLit,uFog;${grid ? "attribute float surveyMask;" : ""}
void main(){vec3 n=normal;vec4 world=vec4(position,1.);vec3 col=vec3(1.);
#ifdef USE_COLOR
col=color.rgb;
#endif
#ifdef USE_INSTANCING
world=instanceMatrix*world;n=normalize(mat3(instanceMatrix)*(normal/vec3(dot(instanceMatrix[0].xyz,instanceMatrix[0].xyz),dot(instanceMatrix[1].xyz,instanceMatrix[1].xyz),dot(instanceMatrix[2].xyz,instanceMatrix[2].xyz))));
#endif
#ifdef USE_INSTANCING_COLOR
col*=instanceColor.rgb;
#endif
groundXZ=world.xz;gridFade=${grid ? "surveyMask" : "0."};float hemi=.69+.24*n.y;float sunI=smoothstep(-.04,.46,uSun.y),moonI=(1.-uDay)*max(0.,uMoon.y)*uLit;shade=col*(hemi*mix(vec3(.48,.55,.69),vec3(.99,.98,.91),uDay)+vec3(.96,.86,.64)*max(0.,dot(n,uSun))*sunI*.56+vec3(.55,.64,.87)*max(0.,dot(n,uMoon))*moonI*.42);vec4 mv=modelViewMatrix*world;float f=clamp(-mv.z*uFog,0.,1.);shade=mix(shade,uHor,f*f*(3.-2.*f));shade=mix(12.92*shade,1.055*pow(max(shade,vec3(0.)),vec3(.4166667))-.055,step(vec3(.0031308),shade));gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 shade;varying vec2 groundXZ;varying float gridFade;uniform float uGrid,uDetail;void main(){if(uDetail<1.&&fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715))*52.9829189)>=uDetail)discard;vec3 c=shade;${grid ? "vec2 p=groundXZ/9.5;float t=step(1.,fract(p.x)+fract(p.y));float face=fract(sin(dot(mod(floor(p),113.),vec2(12.17,7.31))+t*2.1)*4321.7);c*=.965+.07*face;" : ""}gl_FragColor=vec4(c,1.);}`,
  });
  return mat;
}
// Concatenate tile buffers with the same shader on the lowest tier. Never mix water,
// plot stones or survey masks into an unrelated draw. All vertices are in atlas coordinates.
export function combineMeshes(meshes, mat) {
  const g = new T.BufferGeometry(),
    ix = [],
    attrs = {};
  let base = 0;
  for (const m of meshes) {
    const src = m.geometry;
    for (const [k, buf] of Object.entries(src.attributes)) {
      const a = (attrs[k] ??= { size: buf.itemSize, values: [] });
      for (const x of buf.array) a.values.push(x);
    }
    for (const i of src.index.array) ix.push(base + i);
    base += src.attributes.position.count;
  }
  if (!ix.length) return null;
  for (const [k, a] of Object.entries(attrs))
    g.setAttribute(k, new T.Float32BufferAttribute(a.values, a.size));
  g.setIndex(ix);
  g.computeBoundingSphere();
  return new T.Mesh(g, mat);
}
// Software GL still transforms each submitted instance, including offscreen walls.
// Keep the original matrices/indices, but upload a conservative visible subset. The
// stone batch is deliberately untouched so shared plot corners remain inspectable.
export function cropDraws(root, camera) {
  root.updateWorldMatrix(true, true);
  const fr = new T.Frustum().setFromProjectionMatrix(
      new T.Matrix4().multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      ),
    ),
    inside = (x, y, z, r) =>
      fr.planes.every(
        (p) =>
          p.normal.x * x + p.normal.y * y + p.normal.z * z + p.constant >= -r,
      );
  root.traverse((o) => {
    if (
      o.isInstancedMesh &&
      o.userData.role !== "boundary-stone" &&
      (o.userData.shared || o.userData.cullable)
    ) {
      const b = (o.userData.buffer ??= {
        m: o.instanceMatrix.array.slice(),
        c: o.instanceColor?.array.slice(),
        count: o.count,
      });
      let n = 0;
      for (let i = 0; i < b.count; i++) {
        const k = 16 * i,
          m = b.m;
        if (
          !inside(
            m[k + 12] + o.matrixWorld.elements[12],
            m[k + 13] + o.matrixWorld.elements[13],
            m[k + 14] + o.matrixWorld.elements[14],
            Math.max(
              Math.hypot(m[k], m[k + 1], m[k + 2]),
              Math.hypot(m[k + 4], m[k + 5], m[k + 6]),
              Math.hypot(m[k + 8], m[k + 9], m[k + 10]),
            ) *
              1.2 +
              3,
          )
        )
          continue;
        o.instanceMatrix.array.set(m.subarray(k, k + 16), n * 16);
        if (b.c)
          o.instanceColor.array.set(b.c.subarray(i * 3, i * 3 + 3), n * 3);
        n++;
      }
      o.count = n;
      o.instanceMatrix.needsUpdate = true;
      if (b.c) o.instanceColor.needsUpdate = true;
      o.visible = n > 0;
    }
    if (!o.userData.tileBatch) return;
    const g = o.geometry;
    let bin = o.userData.clusters;
    if (!bin) {
      const idx = g.index.array,
        p = g.attributes.position.array,
        ls = new Map();
      for (let k = 0; k < idx.length; k += 3) {
        const j = idx[k] * 3,
          tag =
            Math.floor(p[j] / (o.userData.clusterMetres || 126)) +
            "," +
            Math.floor(p[j + 2] / (o.userData.clusterMetres || 126));
        let box = ls.get(tag);
        if (!box) {
          box = {
            lo: [Infinity, Infinity, Infinity],
            hi: [-Infinity, -Infinity, -Infinity],
            ix: [],
          };
          ls.set(tag, box);
        }
        for (const i of [idx[k], idx[k + 1], idx[k + 2]]) {
          box.ix.push(i);
          for (let d = 0; d < 3; d++) {
            box.lo[d] = Math.min(box.lo[d], p[i * 3 + d]);
            box.hi[d] = Math.max(box.hi[d], p[i * 3 + d]);
          }
        }
      }
      bin = [...ls.values()].map((b) => {
        const c = b.lo.map((v, i) => (v + b.hi[i]) * 0.5),
          r = Math.hypot(...b.hi.map((v, i) => v - c[i]));
        return { c, r: r + 10, ix: new idx.constructor(b.ix) };
      });
      o.userData.clusters = bin;
    }
    let n = 0;
    for (const b of bin)
      if (
        inside(
          b.c[0] + o.matrixWorld.elements[12],
          b.c[1] + o.matrixWorld.elements[13],
          b.c[2] + o.matrixWorld.elements[14],
          b.r,
        )
      ) {
        g.index.array.set(b.ix, n);
        n += b.ix.length;
      }
    g.index.needsUpdate = true;
    g.setDrawRange(0, n);
    o.visible = n > 0;
  });
}
export function restoreDraws(root) {
  root?.traverse((o) => {
    const b = o.userData.buffer;
    if (b) {
      o.instanceMatrix.array.set(b.m);
      o.count = b.count;
      o.instanceMatrix.needsUpdate = true;
      if (b.c) {
        o.instanceColor.array.set(b.c);
        o.instanceColor.needsUpdate = true;
      }
      o.visible = true;
    }
    if (o.userData.clusters) {
      let n = 0;
      for (const v of o.userData.clusters) {
        o.geometry.index.array.set(v.ix, n);
        n += v.ix.length;
      }
      o.geometry.index.needsUpdate = true;
      o.geometry.setDrawRange(0, n);
      o.visible = true;
    }
  });
}
