// Phase 2: Rapier heightfield streaming + kinematic character controller,
// and the three-mesh-bvh raycast utility. Fully offline (wasm inlined).
// Run standalone: node Hugo-Project/tools/check-physics.mjs
import assert from "node:assert/strict";
import * as THREE from "three";
import { AtlasPhysics } from "../static/js/physics.js";
import { raycastGeometry, ensureBvh } from "../static/js/raycast.js";

const report = {};

/* ---------------- Rapier: heightfields + character ---------------- */
{
  // Synthetic terrain: gentle ramp along X (1 m per 10 m) with a small hill.
  const heightAt = (x, z) => x * 0.1 + 2 * Math.exp(-((x - 30) ** 2 + z ** 2) / 200);
  const p = await AtlasPhysics.create({ heightAt, tileSize: 100, grid: 32 });
  assert.ok(p.world, "physics world created");

  // Stream the 3×3 tile neighbourhood around the origin.
  const [added] = p.syncTiles(10, 10);
  assert.equal(added, 9, "3×3 tiles streamed in");
  assert.equal(p.tiles.size, 9);
  // Re-sync same cell: no churn.
  const [added2, removed2] = p.syncTiles(10, 10);
  assert.equal(added2 + removed2, 0, "stable tile set");

  // Ground raycast matches the analytic height (heightfield resolution error
  // must stay under one grid cell's slope contribution).
  for (const [x, z] of [
    [10, 10],
    [-40, 20],
    [60, -60],
  ]) {
    const y = p.groundY(x, z);
    assert.ok(y !== null, `ground raycast hits at ${x},${z}`);
    const want = heightAt(x, z);
    assert.ok(
      Math.abs(y - want) < 0.6,
      `ground at ${x},${z}: ray ${y.toFixed(2)} vs analytic ${want.toFixed(2)}`,
    );
  }

  // Streaming out: move far away, old tiles drop, new ones arrive.
  const [ , rem] = p.syncTiles(1500, 1500);
  assert.equal(rem, 9, "old tiles removed on stream-out");
  assert.equal(p.tiles.size, 9, "new neighbourhood present");

  // Character: drop onto the ramp → lands, reports grounded.
  p.syncTiles(10, 10);
  p.flush();
  let pos = { x: 5, y: 8, z: 5 };
  let res = null;
  for (let i = 0; i < 240; i++) {
    res = p.moveCharacter(pos, { x: 0, y: -0.2, z: 0 });
    pos = { x: res.x, y: res.y, z: res.z };
    p.step(1 / 120);
  }
  assert.ok(res.grounded, "character settles grounded on terrain");
  // Feet-level API: pos.y should meet the analytic surface.
  assert.ok(
    Math.abs(pos.y - heightAt(pos.x, pos.z)) < 0.25,
    `capsule rests on terrain (y=${pos.y.toFixed(2)}, terrain ${heightAt(pos.x, pos.z).toFixed(2)})`,
  );

  // Walking +X up the ramp (0.1 grade) for 2 s: gains altitude, stays grounded.
  const y0 = pos.y;
  for (let i = 0; i < 240; i++) {
    res = p.moveCharacter(pos, { x: 0.04, y: -0.02, z: 0 });
    pos = { x: res.x, y: res.y, z: res.z };
    p.step(1 / 120);
  }
  assert.ok(res.grounded, "still grounded while climbing");
  assert.ok(pos.y > y0 + 0.5, `climbed the ramp (Δy=${(pos.y - y0).toFixed(2)})`);
  assert.ok(pos.x > 8, `advanced in +X (x=${pos.x.toFixed(2)})`);

  // A wall blocks horizontal progress but not grounding.
  const wall = p.world.createRigidBody(
    p.R.RigidBodyDesc.fixed().setTranslation(pos.x + 2, pos.y + 1, pos.z),
  );
  p.world.createCollider(p.R.ColliderDesc.cuboid(0.3, 2, 4), wall);
  p.dirty = true;
  p.flush();
  const wallX = pos.x;
  for (let i = 0; i < 120; i++) {
    res = p.moveCharacter(pos, { x: 0.06, y: -0.02, z: 0 });
    pos = { x: res.x, y: res.y, z: res.z };
    p.step(1 / 120);
  }
  assert.ok(
    pos.x < wallX + 1.6,
    `wall stops the capsule (x=${pos.x.toFixed(2)}, start ${wallX.toFixed(2)})`,
  );
  assert.ok(res.collisions > 0, "controller reports wall collisions");

  report.rapier = {
    tiles: p.tiles.size,
    grounded: res.grounded,
    climb: +(pos.y - y0).toFixed(2),
    collisions: res.collisions,
    stepped: p.stepped,
  };
}

/* ---------------- three-mesh-bvh raycast ---------------- */
{
  const box = new THREE.BoxGeometry(10, 10, 10);
  const hit = raycastGeometry(
    box,
    new THREE.Vector3(0, 0, 20),
    new THREE.Vector3(0, 0, -1),
  );
  assert.ok(hit, "ray hits the box");
  assert.ok(Math.abs(hit.distance - 15) < 1e-4, `distance 15, got ${hit.distance}`);
  assert.ok(Math.abs(hit.point.z - 5) < 1e-4, `point z=5, got ${hit.point.z}`);

  const miss = raycastGeometry(
    box,
    new THREE.Vector3(50, 50, 20),
    new THREE.Vector3(0, 0, -1),
  );
  assert.equal(miss, null, "far ray misses");

  // near/far window rejects a hit that exists beyond `far`.
  const clipped = raycastGeometry(
    box,
    new THREE.Vector3(0, 0, 20),
    new THREE.Vector3(0, 0, -1),
    0,
    5,
  );
  assert.equal(clipped, null, "far window clips the hit (needs >15)");

  // Cached BVH is reused; a displaced plane hits at the right height.
  const bvh1 = ensureBvh(box);
  const bvh2 = ensureBvh(box);
  assert.equal(bvh1, bvh2, "boundsTree cached on geometry");

  const plane = new THREE.PlaneGeometry(40, 40, 8, 8);
  const posAttr = plane.attributes.position;
  for (let i = 0; i < posAttr.count; i++)
    posAttr.setZ(i, Math.sin(posAttr.getX(i) * 0.3) * 2); // local Z is plane normal
  plane.computeVertexNormals();
  const down = raycastGeometry(
    plane,
    new THREE.Vector3(0, 0, 30),
    new THREE.Vector3(0, 0, -1),
  );
  assert.ok(down, "ray hits the wavy plane at centre (z≈0)");
  assert.ok(Math.abs(down.point.z) < 0.6, `centre height ≈0, got ${down.point.z}`);

  report.bvh = { boxHit: hit.distance, planeHit: +down.point.z.toFixed(3), cached: true };
}

console.log(
  `check-physics: PASS rapier ${JSON.stringify(report.rapier)} bvh ${JSON.stringify(report.bvh)}`,
);
