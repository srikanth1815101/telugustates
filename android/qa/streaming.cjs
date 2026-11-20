/* The east gate of demo_user209 coincides with the x=5760 terrain generation seam. Re-enter via that same opening. */
const fs = require("node:fs"),
  path = require("node:path"),
  { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const [apk, out] = process.argv.slice(2),
  src = require("./apk-mount.cjs")(apk);
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
    ],
  });
  try {
    const ctx = await b.newContext({
      viewport: { width: 388, height: 724 },
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true,
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    await ctx.route("**/*", src.mount);
    const p = await ctx.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await p.goto(src.host + "/?dev=1#/u/demo_user209");
    const wait = (f, arg) => p.waitForFunction(f, arg, { timeout: 55000 });
    await wait(
      () =>
        window.atlasWalk?.snapshot().ready &&
        atlasWalk.snapshot().locomotion.rig.resting,
    );
    await p.locator("#world-menu").tap();
    await p.locator("#go-street").tap();
    await wait(
      () => atlasWalk.snapshot().ready && atlasWalk.snapshot().x > 5760,
    );
    await p.keyboard.down("w");
    await wait(() => atlasWalk.snapshot().x < 5759.92);
    await p.keyboard.up("w");
    await wait(
      () =>
        atlasWalk.snapshot().ready &&
        atlasWalk.snapshot().locomotion.rig.resting,
    );
    const start = await p.evaluate(() => {
      const s = atlasWalk.snapshot();
      window.samples = [];
      window.watchSeam = true;
      function tick() {
        const s = atlasWalk.snapshot(),
          m = s.locomotion;
        samples.push([
          s.frames,
          +s.x.toFixed(8),
          s.pending,
          m.grounded,
          +Math.abs(s.ground - m.root).toFixed(6),
          ...s.camera,
          s.jumpHeight,
          s.localOrigin,
          performance.now(),
          s.y,
          s.yaw,
          s.boom.arm,
          m.speed,
          m.bodyYaw,
        ]);
        if (watchSeam) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
      return [s.x, s.y, s.settings.quality, s.stop, s.site];
    });
    assert.equal(Math.floor(start[0]), 5759);
    await p.keyboard.down("s");
    await wait(() => atlasWalk.snapshot().x > 5760.11);
    await p.keyboard.up("s");
    await wait(() => {
      const s = atlasWalk.snapshot();
      return s.ready && s.locomotion.rig.resting;
    });
    const outer = await p.evaluate(() => atlasWalk.snapshot().x);
    await p.keyboard.down("w");
    await wait(() => atlasWalk.snapshot().x < 5759.94);
    await p.keyboard.up("w");
    await wait(() => {
      const s = atlasWalk.snapshot();
      return s.ready && s.locomotion.rig.resting;
    });
    const row = await p.evaluate(() => {
      watchSeam = false;
      let swaps = 0,
        jump = 0,
        maxRoot = 0,
        maxCameraStep = 0;
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1],
          b = samples[i];
        if (a[2] && !b[2]) swaps++;
        jump = Math.max(jump, b[8]);
        maxRoot = Math.max(maxRoot, b[4]);
        maxCameraStep = Math.max(
          maxCameraStep,
          Math.hypot(...a.slice(5, 8).map((v, k) => v - b[5 + k])),
        );
      }
      return {
        swaps,
        peakSpuriousAirM: jump,
        maxRootErrorM: maxRoot,
        maxCameraStepM: maxCameraStep,
        frames: new Set(samples.map((s) => s[0])).size,
        allGrounded: samples.every((s) => s[3]),
        final: atlasWalk.snapshot().x,
      };
    });
    // Save the actual run before asserting, including the worst pair for diagnosing a real contact or camera failure.
    const detailed = await p.evaluate(() => {
      let largest = 0,
        pair = null;
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1],
          b = samples[i],
          d = Math.hypot(...a.slice(5, 8).map((v, k) => v - b[5 + k]));
        if (d > largest) {
          largest = d;
          pair = [a, b];
        }
      }
      return { largest, pair, samples };
    });
    fs.writeFileSync(
      path.join(out, "seam-samples.json"),
      JSON.stringify({ row, ...detailed }),
    );
    console.log("Seam observations", JSON.stringify(row));
    assert(
      row.swaps >= 2 &&
        row.allGrounded &&
        row.peakSpuriousAirM < 0.001 &&
        row.maxRootErrorM < 0.0001 &&
        row.maxCameraStepM < 1,
    );
    console.log(
      "Khammam: crossed x=5760 twice through real gate.",
      JSON.stringify(row),
    );
    const cancel = await p.evaluate(async () => {
      const { recordRun } = await import("/js/field-check.js");
      const r = recordRun(12).then(
        () => null,
        (e) => e.message,
      );
      dispatchEvent(new Event("atlas:host-pause"));
      const error = await r;
      dispatchEvent(new Event("atlas:host-resume"));
      return {
        error,
        counts: JSON.parse(localStorage.getItem("atlas-field-readings") || "[]")
          .length,
      };
    });
    assert(/paused/i.test(cancel.error) && !cancel.counts);
    assert.deepEqual(src.remote, []);
    assert.deepEqual(src.miss, []);
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(out, "streaming.json"),
      JSON.stringify(
        {
          apk: crypto
            .createHash("sha256")
            .update(fs.readFileSync(apk))
            .digest("hex"),
          home: "demo_user209",
          start,
          outer,
          ...row,
          pausedMeasurement: cancel,
          errors,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
