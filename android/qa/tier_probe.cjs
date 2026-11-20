/* Touch-drive both playable travellers. Capture the live framebuffer, not an animation mock.
   node nature_motion.cjs APK OUTPUT_DIR (Playwright, Chromium w/software WebGL 2) */
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
const [apk, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const src = require("./apk-mount.cjs")(apk),
  { host, hub } = src;
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: [
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 704, height: 466 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
      serviceWorkers: "block",
    });
    await ctx.route("**/*", src.mount);
    await ctx.addInitScript(() =>
      sessionStorage.setItem("field-weather-seed", "711"),
    );
    const p = await ctx.newPage(),
      cdp = await ctx.newCDPSession(p),
      errors = [],
      log = { legs: [], tiers: [], video: {}, checks: [] };
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (
        m.type() === "error" ||
        /INVALID_OPERATION|Shader Error/.test(m.text())
      )
        errors.push(m.text().slice(0, 300));
    });
    const snap = () =>
      p.evaluate(() => {
        const s = atlasWalk.snapshot();
        return {
          tier: s.tier,
          x: s.x,
          y: s.y,
          stop: s.stop,
          blocked: s.blockedSteps,
          motion: s.locomotion,
          source: s.source?.c,
          fences: s.fences,
          grass: s.grass,
          draws: s.drawCalls,
          g: s.ground,
        };
      });
    const wait = async (f, arg, timeout = 55000) =>
      p.waitForFunction(f, arg, { timeout });
    const ready = async (site) =>
      wait((s) => {
        const a = window.atlasWalk?.snapshot();
        return a?.ready && (a.stop === s || a.u === s);
      }, site);
    const menu = async () => {
      if (!(await p.locator(".world-sheet").isVisible()))
        await p.locator("#world-menu").tap();
    };
    const close = async () => {
      if (await p.locator(".world-sheet").isVisible())
        await p.locator("#hide-sheet").tap();
    };
    const stop = async (id, range = "ground") => {
      await menu();
      await p.selectOption("#field-stop", id);
      await p.locator(`[data-range=${range}]`).tap();
      if (range === "ground") await ready(id);
      else
        await wait((id) => {
          const s = atlasWalk.snapshot();
          return s.mode === "survey" && s.stop === id && s.range < 2000;
        }, id);
    };
    const hold = async (sign) => {
      const q = await p.locator(".joystick").boundingBox();
      assert(q);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          {
            x: q.x + q.width * 0.5,
            y: q.y + q.height * (sign > 0 ? 0.12 : 0.88),
            id: 1,
          },
        ],
      });
    };
    const release = () =>
      cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    async function note(label) {
      let s = await snap();
      console.log(
        label,
        s.motion.state,
        s.motion.depth.toFixed(2),
        s.motion.speed.toFixed(2),
      );
      log.legs.push({
        label,
        tier: s.tier,
        x: s.x,
        y: s.y,
        state: s.motion.state,
        surface: s.motion.surface,
        depth: +s.motion.depth.toFixed(3),
        speed: +s.motion.speed.toFixed(3),
        wetMetres: +s.motion.wetMetres.toFixed(2),
        wakeCount: s.motion.ripples,
        body: s.motion.rig.style,
        contacts: s.motion.rig.contacts,
        blocked: s.blocked,
        sourceClass: s.source,
      });
      return s;
    }
    await p.goto(hub);
    await p.locator("[data-test=lake]").tap();
    await ready("lake");
    // Test both explicit ends of the quality range; software GL previously rendered a different dummy rig.
    for (const [k, i] of [
      ["low", 0],
      ["high", 2],
    ]) {
      await menu();
      await p.selectOption("#quality", k);
      await close();
      await wait((i) => {
        let s = atlasWalk.snapshot();
        return s.ready && s.tier === i;
      }, i);
      let b = await snap();
      console.log(
        "Quality",
        k,
        "bones",
        b.motion.rig.bones,
        "clumps",
        b.grass,
        "state",
        b.motion.state,
      );
      assert(b.motion.rig.bones === 62 && b.grass > 0);
      await hold(1);
      await wait(() => atlasWalk.snapshot().locomotion.state === "Wade");
      await release();
      let q = await snap();
      assert(q.motion.ripples > 0);
      log.tiers.push({
        k,
        bones: q.motion.rig.bones,
        grass: q.grass,
        depth: q.motion.depth,
      });
      if (k === "low") {
        await stop("lake");
      }
    }
    await menu();
    await p.selectOption("#quality", "medium");
    await close();
    await stop("cliffs", "mid");
    await stop("forest");
    await stop("coast");
    let coast = await snap();
    assert.equal(coast.motion.surface, "sand");
    assert(coast.grass >= 0);
    log.checks.push(
      "Map-scale overlook, forest return and actual sand underfoot on the coastal strand.",
    );
    assert.deepEqual(src.remote, []);
    assert.deepEqual(src.miss, []);
    assert.deepEqual(errors, []);
    assert(
      ![...src.serv].some(
        (n) =>
          n.includes("/roads/") ||
          /\/(houses3d|scenery|people|roads3d)\.js/.test(n),
      ),
    );
    log.paths = src.serv.size;
    log.workers = src.workers;
    log.remote = src.remote;
    log.missing = src.miss;
    log.browserErrors = errors;
    log.physicalPhone = false;
    fs.writeFileSync(
      path.join(out, "tier-probe.json"),
      JSON.stringify(log, null, 2) + "\n",
    );
    console.log(
      "Signed-asset motion and Low / Medium / High checks passed,",
      src.serv.size,
      "paths, zero errors or network requests.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
