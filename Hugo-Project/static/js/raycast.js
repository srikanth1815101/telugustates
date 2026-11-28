// BVH raycast utility (Phase 2) over vendored three-mesh-bvh: O(log n)
// first-hit queries against any geometry — used for placement snapping,
// line-of-sight probes and vehicle/ground queries without scene Raycaster
// sweeps. Import three as a bare specifier so node tests, the unbundled
// build (importmap) and the Vite bundle all share one THREE instance.
// @ts-check
import * as THREE from "three";
import { MeshBVH } from "../vendor/three-mesh-bvh.module.js";

/**
 * Build (once) and cache a MeshBVH on a geometry.
 * @param {THREE.BufferGeometry} geometry
 * @returns {any} the MeshBVH instance
 */
export function ensureBvh(geometry) {
  const g = /** @type {any} */ (geometry);
  if (!g.boundsTree) g.boundsTree = new MeshBVH(geometry);
  return g.boundsTree;
}

/**
 * First intersection of a ray with a geometry (local space).
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.Vector3} origin
 * @param {THREE.Vector3} direction normalised
 * @param {number} [near]
 * @param {number} [far]
 * @returns {{point: THREE.Vector3, distance: number, faceIndex: number} | null}
 */
export function raycastGeometry(geometry, origin, direction, near = 0, far = Infinity) {
  const bvh = ensureBvh(geometry);
  const ray = new THREE.Ray(origin, direction);
  const hit = bvh.raycastFirst(ray, THREE.DoubleSide, near, far);
  if (!hit) return null;
  return {
    point: hit.point.clone(),
    distance: hit.distance,
    faceIndex: hit.faceIndex ?? -1,
  };
}
