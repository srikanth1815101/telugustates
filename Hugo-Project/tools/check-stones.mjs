import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { catalog, loadModel, staticModel } from "../static/js/art-library.js";
import { meshShape, solidFor, support, passes } from "../static/js/contacts.js";
import { WalkMotor } from "../static/js/walk-motor.js";
import { ACRE as U } from "../static/js/metres.js";
import * as T from "../static/vendor/three.module.min.js";
const root = fileURLToPath(new URL("../", import.meta.url)),
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-rock-"));
try {
  execFileSync("hugo", ["--source", root, "--destination", tmp, "--minify"]);
  globalThis.fetch = async (u) =>
    new Response(
      await fs.readFile(
        path.join(
          tmp,
          path.relative(path.join(root, "static"), fileURLToPath(u)),
        ),
      ),
    );
  const index = await catalog(),
    rows = [];
  for (const [name, scale, angle] of [
    ["Strata shelf", 1.1, 0.42],
    ["Split boulder", 1.15, -0.33],
    ["Granite pile", 1.23, 0.18],
    ["Balanced tor", 1.45, 0.31],
  ])
    for (const held of [false, true]) {
      await loadModel(index.rock[name]);
      const geo = staticModel("rock", name, { trees: {}, plants: {} }, 0, 0),
        mesh = new T.Mesh(geo, new T.MeshBasicMaterial({ side: T.DoubleSide }));
      mesh.rotation.y = angle;
      mesh.scale.setScalar(scale);
      mesh.updateMatrixWorld();
      const shape = solidFor(
          {
            x: 0,
            y: 0,
            rotation: angle,
            scale,
            kind: "rock",
            world: [0, 0, 0],
            meshShape: meshShape(geo, "rock", scale),
          },
          {},
        ),
        R = new T.Raycaster(),
        maxX = shape[2] * U;
      const s = {
        sample: () => ({ z: 0, drawn: true, depth: 0, line: 0 }),
        traversable: () => true,
        current: () => [0, 0, 0],
      };
      s.floor = (x, y) => support(s, x, y, [shape]);
      const allow = (...p) => passes(s, [], [shape], [], ...p);
      const hit = (x, z = 0) => {
        R.set(new T.Vector3(x, 10, z), new T.Vector3(0, -1, 0));
        return R.intersectObject(mesh)[0]?.point.y;
      };
      let edge = null;
      for (let x = -maxX; x < maxX; x += 0.02)
        if (hit(x) > 0.01) {
          edge = x;
          break;
        }
      assert(edge !== null);
      const m = new WalkMotor();
      m.reset((edge - 1.6) / U, 0, s, 0, 0.89);
      let jumped = false,
        on = false,
        walk = 0,
        err = 0,
        off = false,
        peak = 0,
        rest = false;
      let still = 0;
      let samples = [];
      for (let x = edge + 0.04; x < maxX; x += 0.04) {
        const y = hit(x);
        if (y > 0.03) samples.push([x, y]);
      }
      const high = Math.max(...samples.map((p) => p[1]));
      const goal = samples.filter((p) => p[1] > 0.86 * high).map((p) => p[0]);
      const target = goal.length ? goal[Math.floor(goal.length / 2)] : 0;

      for (let i = 0; i < 550; i++) {
        if (!jumped && m.x * U >= edge - 0.85) {
          m.jump();
          jumped = true;
          if (!held) m.releaseJump();
        }
        const stop = on && !rest;
        if (stop && ++still > 28) rest = true;
        let a = m.x;
        m.advance(
          1 / 60,
          stop
            ? 0
            : jumped && !on
              ? Math.max(-1, Math.min(1, (target - m.x * U) * 4.2))
              : 1,
          0,
          1.9,
          s,
          allow,
          0.89,
        );
        const z = hit(m.x * U, -m.y * U);
        if (
          jumped &&
          m.lands &&
          m.grounded &&
          m.touch.support === "rock" &&
          Number.isFinite(z)
        ) {
          on = true;
          err = Math.max(err, Math.abs(m.root - z));
          peak = Math.max(peak, m.root);
          if (rest) walk += Math.abs(m.x - a) * U;
        }
        if (
          rest &&
          walk > 0.12 &&
          m.x * U > maxX &&
          m.grounded &&
          m.touch.support !== "rock"
        ) {
          off = true;
          break;
        }
      }
      rows.push({
        name,
        held,
        endX: m.x * U,
        target,
        maxX,
        edge,
        topM: +peak.toFixed(3),
        walkedOnTopM: +walk.toFixed(3),
        maxMeshGapM: err,
        climbs: m.climbs,
        jumps: m.jumps,
        lands: m.lands,
        off,
      });
      mesh.material.dispose();
    }
  // Negative control: even a running, held jump must not scale a sheer seven-metre face.
  const tallGeo = new T.BoxGeometry(2, 7, 2).translate(0, 3.5, 0),
    solid = solidFor(
      {
        x: 0,
        y: 0,
        rotation: 0,
        scale: 1,
        kind: "rock",
        world: [0, 0, 0],
        meshShape: meshShape(tallGeo, "rock", 1),
      },
      {},
    ),
    floor = {
      sample: () => ({ z: 0, drawn: true, depth: 0, line: 0 }),
      traversable: () => true,
      current: () => [0, 0, 0],
    };
  floor.floor = (x, y) => support(floor, x, y, [solid]);
  const blocker = (...p) => passes(floor, [], [solid], [], ...p),
    driver = new WalkMotor();
  driver.reset(-3 / U, 0, floor);
  for (let i = 0; i < 280; i++) {
    if (i === 28) driver.jump();
    driver.advance(1 / 60, 1, 0, 3.4, floor, blocker, 0.89);
  }
  assert(
    driver.x * U < -0.99 &&
      driver.blocked > 40 &&
      driver.jumps === 1 &&
      driver.lands === 1 &&
      !driver.climbs,
    "Too-tall face was scaled",
  );
  console.log(JSON.stringify(rows, null, 2));
  assert(
    rows.every(
      (r) => r.off && r.jumps === 1 && r.topM > 0.15 && r.maxMeshGapM < 0.001,
    ),
    "Not every mesh traversal landed, crossed and dismounted cleanly",
  );
} finally {
  await fs.rm(tmp, { force: true, recursive: true });
}
