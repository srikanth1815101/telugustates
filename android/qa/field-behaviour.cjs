/* The exact upper-bank bookmark, idle, contact and controls are exercised on final, unchanged APK bytes. */
const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const [apk, out] = process.argv.slice(2),
  src = require("./apk-mount.cjs")(apk);
fs.mkdirSync(out, { recursive: true });
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
  const rep = {
    apk: crypto.createHash("sha256").update(fs.readFileSync(apk)).digest("hex"),
    platform:
      "Chromium WebGL2 with SwiftShader; actual embedded app via local-origin interception; not an Android installation",
    checks: [],
    crossing: [],
    errors: [],
  };
  const log = (name, detail) => {
    rep.checks.push({ name, detail });
    console.log(name, detail ?? "OK");
    fs.writeFileSync(
      path.join(out, "field-behaviour.json"),
      JSON.stringify(rep, null, 2) + "\n",
    );
  };
  try {
    const c = await b.newContext({
      viewport: { width: 390, height: 824 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
      serviceWorkers: "block",
    });
    await c.route("**/*", src.mount);
    const p = await c.newPage(),
      cdp = await c.newCDPSession(p);
    p.on("pageerror", (e) => rep.errors.push(e.message));
    p.on("console", (m) => {
      if (
        m.type() === "error" ||
        /INVALID_OPERATION|Shader Error/.test(m.text())
      )
        rep.errors.push(m.text().slice(0, 300));
    });
    const wait = (f, a, timeout = 65000) =>
      p.waitForFunction(f, a, { timeout });
    const snap = () => p.evaluate(() => atlasWalk.snapshot()),
      ready = (k) =>
        wait(
          (k) =>
            window.atlasWalk?.snapshot().ready &&
            atlasWalk.snapshot().site === k,
          k,
        ),
      menu = async () => {
        if (!(await p.locator(".world-sheet").isVisible()))
          await p.locator("#world-menu").tap();
      },
      close = async () => {
        if (await p.locator(".world-sheet").isVisible())
          await p.locator("#hide-sheet").tap();
      };
    const option = async (id, value) => {
      await menu();
      await p.selectOption(id, value);
      await close();
    };
    const stick = async (f, r = 0) => {
        const q = await p.locator(".joystick").boundingBox();
        assert(q);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [
            {
              id: 1,
              x: q.x + q.width * (0.5 + r * 0.36),
              y: q.y + q.height * (0.5 - f * 0.36),
            },
          ],
        });
      },
      up = () =>
        cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
    const frame = async (n) => {
      const t = await p.evaluate(() => atlasWalk.renderedFrames);
      await wait(([t, n]) => atlasWalk.renderedFrames >= t + n, [t, n]);
    };
    await p.goto(src.hub);
    await p.locator("[data-walker=man]").tap();
    await p.locator("[data-bank]").tap();
    await ready("lake-bank");
    assert.equal((await snap()).locomotion.rig.style, "man");
    const init = await snap();
    assert(
      Math.abs(init.ll[0] - 78.371004) < 1e-7 &&
        Math.abs(init.ll[1] - 16.038845) < 1e-7,
    );
    assert.deepEqual([Math.floor(init.x), Math.floor(init.y)], [2550, 5571]);
    log("Exact screenshot location in acre [2550,5571]", init.ll);
    for (const [qual, tier] of [
      ["medium", 1],
      ["high", 2],
      ["low", 0],
    ]) {
      await option("#quality", qual);
      await wait((k) => {
        const s = atlasWalk.snapshot();
        return s.ready && s.tier === k && s.locomotion.rig.resting;
      }, tier);
      let s = await snap(),
        audit = await p.evaluate(() => atlasWalk.auditTerrain());
      assert.equal(audit.missing, 0);
      assert(audit.trees > 0);
      assert(Math.abs(s.ground - init.ground) < 0.002);
      if (qual === "medium") {
        await frame(4);
        await p.screenshot({ path: path.join(out, "upper-bank-man.png") });
      }
      let idle = await p.evaluate(async () => {
        const check = () => {
          const s = atlasWalk.snapshot();
          return {
            f: s.frames,
            p: [s.x, s.y, s.locomotion.root, ...s.camera],
            rig: JSON.stringify(s.locomotion.rig),
            speed: s.locomotion.speed,
          };
        };
        let start = check(),
          max = 0,
          diff = 0,
          n = 0,
          last = start.f;
        while (n < 24) {
          await new Promise(requestAnimationFrame);
          let q = check();
          if (q.f === last) continue;
          last = q.f;
          n++;
          diff += q.rig !== start.rig;
          max = Math.max(max, ...q.p.map((v, i) => Math.abs(v - start.p[i])));
          if (q.speed !== 0) throw Error("idle creep");
        }
        return { frames: n, maxComponentDrift: max, rigTelemetryChanges: diff };
      });
      assert.equal(idle.maxComponentDrift, 0);
      assert.equal(idle.rigTelemetryChanges, 0);
      log("Rest and roots / " + qual, { ...idle, ...audit });
      if (qual === "medium")
        await p.screenshot({
          path: path.join(out, "upper-bank-man-later.png"),
        });
    }
    await stick(0.035);
    await frame(7);
    await up();
    let s = await snap();
    assert.equal(s.x, init.x);
    assert.equal(s.y, init.y);
    log("Touch-centre dead zone, no drift");
    await p.evaluate(() => {
      window.peak = 0;
      window.doneJump = false;
      function track() {
        let m = atlasWalk.snapshot().jumpHeight;
        window.peak = Math.max(peak, m);
        if (peak > 0.1 && m === 0) window.doneJump = true;
        else requestAnimationFrame(track);
      }
      requestAnimationFrame(track);
    });
    await p.keyboard.down("Space");
    await wait(() => window.peak > 0.45);
    await p.keyboard.up("Space");
    await wait(() => window.doneJump);
    const peak = await p.evaluate(() => peak);
    assert(peak > 0.56 && peak < 0.77);
    log("Held jump and ground landing", { peakM: peak });
    await stick(1.29);
    await wait(() => atlasWalk.snapshot().locomotion.state === "Run");
    await frame(3);
    s = await snap();
    assert(s.locomotion.speed > 3.88);
    await p.evaluate(() => dispatchEvent(new Event("atlas:host-pause")));
    let pause = await snap();
    await p.waitForTimeout(350);
    assert.equal((await snap()).frames, pause.frames);
    await up();
    await p.evaluate(() => dispatchEvent(new Event("atlas:host-resume")));
    await wait(() => atlasWalk.snapshot().locomotion.rig.resting);
    const rest = await snap();
    await frame(5);
    assert.equal(rest.x, (await snap()).x);
    log("Run, host pause/resume and release without stuck input", {
      speedBeforePause: s.locomotion.speed,
      stoppedSpeed: rest.locomotion.speed,
    });
    await menu();
    await p.locator("#camera-mode").tap();
    await close();
    await frame(1);
    assert.equal((await snap()).people, 0);
    await menu();
    await p.locator("#camera-mode").tap();
    await p.selectOption("#walker-style", "woman");
    await p.locator("#view-walker").tap();
    await frame(2);
    assert.equal((await snap()).locomotion.rig.style, "woman");
    assert.equal((await snap()).people, 1);
    log("First person, third person, portrait and traveller switch");
    await menu();
    await p.locator("#nearby-life").check();
    await close();
    await p.locator("#place-chip").tap();
    await p.locator("#life-read").waitFor({ state: "visible" });
    await p.locator(".read-close").tap();
    const settings = [];
    for (const [id, v] of [
      ["#season", "summer"],
      ["#light", "dusk"],
      ["#season", "monsoon"],
      ["#light", "live"],
      ["#light", "golden"],
      ["#season", "winter"],
      ["#light", "day"],
    ]) {
      await option(id, v);
      await ready("lake-bank");
      const s = await snap();
      settings.push([id, v, s.settings[id === "#season" ? "season" : "time"]]);
      assert.equal(settings.at(-1)[2], v);
    }
    for (const [key, k] of [
      ["Home", 1],
      ["End", 3],
    ]) {
      await menu();
      await p.locator("#relief").focus();
      await p.locator("#relief").press(key);
      await close();
      await wait((q) => {
        const s = atlasWalk.snapshot();
        return s.ready && s.exaggeration === q && s.locomotion.grounded;
      }, k);
      s = await snap();
      assert(Math.abs(s.locomotion.root - s.ground) < 0.001);
    }
    await menu();
    await p.locator("#relief").evaluate((el) => {
      el.value = 2;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await close();
    await ready("lake-bank");
    log("Season, light, relief extremes and nearby-life display", settings);
    await p.setViewportSize({ width: 740, height: 412 });
    await p.evaluate(() => (location.hash = "/field/lake/ground"));
    await ready("lake");
    await option("#travel-mode", "walk");
    await option("#quality", "medium");
    await ready("lake");
    const note = async (label) => {
      let s = await snap(),
        m = s.locomotion;
      rep.crossing.push({
        label,
        state: m.state,
        depth: m.depth,
        root: m.root,
        source: s.source.c,
        ripples: m.ripples,
        body: m.rig.style,
        speed: m.speed,
      });
    };
    await note("dry");
    await stick(1);
    await wait(() => atlasWalk.snapshot().locomotion.state === "Wade");
    await note("wade-in");
    await wait(() => {
      let s = atlasWalk.snapshot();
      return (
        s.locomotion.state === "Swim" &&
        s.locomotion.rig.swimBlend > 0.9 &&
        [3, 4].includes(s.source.c)
      );
    });
    await note("swim");
    await p.screenshot({ path: path.join(out, "swimming.jpg"), quality: 87 });
    await up();
    await stick(-1);
    await wait(() => atlasWalk.snapshot().locomotion.state === "Wade");
    await note("wade-out");
    await wait(() => {
      let m = atlasWalk.snapshot().locomotion;
      return m.depth === 0 && m.grounded;
    });
    await up();
    await note("dry-again");
    assert(rep.crossing[2].ripples > 0);
    log(
      "Unrestricted real reservoir round trip",
      rep.crossing.map((r) => r.state),
    );
    await p.evaluate(() => (location.hash = "/u/demo_user1"));
    await ready("demo_user1");
    const vis = await snap();
    assert.equal(vis.fences.openings > 0, true);
    await menu();
    await p.selectOption("#go-district", "1");
    await p.locator("#jump").tap();
    await ready("district-1");
    await menu();
    await p.locator("#go-street").tap();
    await ready("demo_user1");
    let g = await snap();
    assert.equal(Math.floor(g.y), 7773);
    assert.equal(Math.floor(g.x), 2355);
    assert(Math.hypot(g.x - vis.x, g.y - vis.y) * 63.615 < 35);
    await stick(1);
    await wait(() => {
      let s = atlasWalk.snapshot();
      return Math.floor(s.x) === 2355 && Math.floor(s.y) === 7774;
    });
    await up();
    log("Remote district → remembered fence opening → walk through the gate");
    await menu();
    await p.locator("[data-lang]").last().tap();
    await close();
    assert.equal(await p.locator("html").getAttribute("lang"), "te");
    await menu();
    await p.locator(".sheet-foot [data-open]").tap();
    assert(await p.locator("dialog").isVisible());
    await p.locator("#close-dialog").tap();
    await close();
    await p.locator("#world [data-view=map]").tap();
    await p.locator("[data-plot=demo_user1] circle").first().waitFor();
    await p.locator("[data-plot=demo_user1] circle").first().tap();
    await ready("demo_user1");
    log("Telugu, credits, 2D plot pin to same real acre");
    await p.evaluate(() =>
      document
        .querySelector("#world canvas")
        .getContext("webgl2")
        .getExtension("WEBGL_lose_context")
        .loseContext(),
    );
    await p.locator("#restore-graphics").waitFor();
    await p.locator("#restore-graphics").tap();
    await ready("demo_user1");
    assert.equal((await snap()).source.d, vis.source.d);
    log("Recoverable WebGL loss → map → same visitor");
    rep.distinctPaths = src.serv.size;
    rep.missing = src.miss;
    rep.offOrigin = src.remote;
    assert.deepEqual(rep.errors, []);
    assert.deepEqual(src.miss, []);
    assert.deepEqual(src.remote, []);
    log("No unexpected runtime, missing-asset or remote requests");
  } finally {
    fs.writeFileSync(
      path.join(out, "field-behaviour.json"),
      JSON.stringify(rep, null, 2) + "\n",
    );
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
