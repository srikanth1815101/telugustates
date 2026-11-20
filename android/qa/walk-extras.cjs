/* Final signed content: second reported location, actual chooser input PNG, bounded contact shaders and six rendered audio signals.
   Intercepted Clipboard/Vibration calls only establish the browser contract; a real Android test is still required. */
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
    physical: false,
    errors: [],
  };
  try {
    const c = await b.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      serviceWorkers: "block",
      deviceScaleFactor: 1,
    });
    await c.route("**/*", src.mount);
    await c.addInitScript(() => {
      window.copied = [];
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: async (t) => window.copied.push(t) },
        configurable: true,
      });
      window.pulses = [];
      Object.defineProperty(navigator, "vibrate", {
        value: (x) => (pulses.push(x), true),
        configurable: true,
      });
    });
    const p = await c.newPage();
    p.on("pageerror", (e) => rep.errors.push(e.message));
    p.on("console", (m) => {
      if (
        m.type() === "error" ||
        /Shader Error|INVALID_OPERATION/.test(m.text())
      )
        rep.errors.push(m.text().slice(0, 120));
    });
    const wait = (f, arg) => p.waitForFunction(f, arg, { timeout: 60000 }),
      ready = () => wait(() => window.atlasWalk?.snapshot().ready),
      snap = () => p.evaluate(() => atlasWalk.snapshot()),
      menu = async () => {
        await p.locator("#world-menu").tap();
        if (
          !(await p
            .locator('summary[data-msg="prefs.title"]')
            .evaluate((n) => n.parentElement.open))
        )
          await p.locator('summary[data-msg="prefs.title"]').tap();
      },
      close = () => p.locator("#hide-sheet").tap();
    await p.goto(src.host + "/#/at/17.408402,81.600647");
    await ready();
    let s = await snap();
    assert.equal(s.source.d, 9);
    assert.deepEqual([Math.floor(s.x), Math.floor(s.y)], [7918, 8693]);
    // The upper Eluru bookmark is in moving shallow water. Compare the first live sample in metres;
    // live coordinates are not expected to stay bit-identical to the input once the current is running.
    const target = await p.evaluate(async () => {
      const { xy } = await import("/js/grid.js"),
        a = await (await fetch("/data/atlas.json")).json();
      return xy(a.project, 81.600647, 17.408402);
    });
    rep.eluru = {
      requested: [81.600647, 17.408402],
      firstLiveLngLat: s.ll,
      cell: [Math.floor(s.x), Math.floor(s.y)],
      source: s.source.z,
      ground: s.ground,
      avatar: s.locomotion.root,
      depth: s.locomotion.depth,
      state: s.locomotion.state,
      speed: s.locomotion.speed,
      displacementMetres:
        Math.hypot(s.x - target[0], s.y - target[1]) * s.metresPerCell,
    };
    assert(
      rep.eluru.source === 77 &&
        rep.eluru.displacementMetres < 2 &&
        rep.eluru.depth > 0.075,
      JSON.stringify(rep.eluru),
    );
    console.log("Actual Eluru waterline sample:", rep.eluru);
    await p.locator(".walk-tip button:last-child").tap();
    // Jump/landing haptic checks require reachable dry support; don't disable water physics for this test.
    await p.goto(src.host + "/#/at/15.991240,80.260022");
    await wait(() => {
      const s = window.atlasWalk?.snapshot();
      return (
        s?.ready &&
        s.source.d === 5 &&
        Math.floor(s.x) === 5901 &&
        Math.floor(s.y) === 6043 &&
        s.locomotion.depth === 0
      );
    });
    await p.locator("#place-chip").tap();
    await p.locator("#copy-gps").tap();
    await p.locator("#copy-plot").tap();
    rep.clipboardPayloads = await p.evaluate(() => copied);
    assert(
      rep.clipboardPayloads.some(
        (x) => x.includes("15.991240") && x.includes("80.260022"),
      ) &&
        rep.clipboardPayloads.some(
          (x) => x.includes("5901") && x.includes("6043"),
        ),
    );
    assert(await p.evaluate(() => atlasWalk.dismissTransient()));
    await menu();
    await p.locator("#walk-haptics").check();
    await p.locator("#walk-invert").check();
    await p.locator("#walk-left").check();
    await p.locator("#look-gain").fill("1.6");
    await close();
    let n = (await snap()).landCount;
    await p.locator("#hop").tap();
    await wait((n) => atlasWalk.snapshot().landCount > n, n);
    rep.hapticAPIRequests = await p.evaluate(() => pulses.slice());
    assert(
      rep.hapticAPIRequests.includes(12) && rep.hapticAPIRequests.includes(16),
    );
    await menu();
    await p.locator("#walk-saver").check();
    await close();
    await ready();
    n = (await snap()).landCount;
    await p.locator("#hop").tap();
    await wait((n) => atlasWalk.snapshot().landCount > n, n);
    const saverState = await snap();
    assert.equal(saverState.tier, 0);
    assert(
      !saverState.shadows &&
        saverState.clouds === 0 &&
        saverState.waterShader === "matte-saver",
    );
    assert.deepEqual(await p.evaluate(() => pulses), rep.hapticAPIRequests);
    await p.reload();
    await ready();
    s = await snap();
    assert(
      s.settings.saver &&
        s.settings.invert &&
        s.settings.haptics &&
        s.settings.left &&
        s.settings.gain === 1.6,
    );
    assert(!(await p.locator(".walk-tip").isVisible()));
    rep.retained = {
      left: s.settings.left,
      invert: s.settings.invert,
      saver: s.settings.saver,
      gain: s.settings.gain,
      lessonDismissed: true,
    };
    await menu();
    await p.locator("#photo-start").tap();
    await p.locator("#photo-options").tap();
    await p.locator("#photo-weather").selectOption("Rain");
    await p.locator("#photo-hour").fill("17.9");
    await p.locator("#photo-lift").fill("2");
    await wait(() => atlasWalk.snapshot().photo);
    rep.photo = await p.evaluate(async () => {
      const s = atlasWalk.snapshot(),
        data = atlasWalk.capturePhoto(),
        im = new Image();
      im.src = data;
      await im.decode();
      const c = document.createElement("canvas");
      c.width = 80;
      c.height = 100;
      const ctx = c.getContext("2d");
      ctx.drawImage(im, 0, 0, 80, 100);
      const a = ctx.getImageData(0, 0, 80, 100).data,
        rgb = new Set();
      for (let k = 0; k < a.length; k += 4)
        rgb.add((a[k] >> 3) * 1024 + (a[k + 1] >> 3) * 32 + (a[k + 2] >> 3));
      return {
        width: im.width,
        height: im.height,
        quantizedColours: rgb.size,
        x: s.x,
        y: s.y,
      };
    });
    assert(
      rep.photo.quantizedColours > 15 && rep.photo.height > rep.photo.width,
    );
    assert(await p.evaluate(() => atlasWalk.dismissTransient()));
    s = await snap();
    assert(!s.photo && s.x === rep.photo.x && s.y === rep.photo.y);
    console.log(
      "Eluru, clipboard payloads, optional haptics calls, saved controls and real photo PNG passed.",
    );
    rep.contacts = await p.evaluate(async () => {
      const T = await import("/vendor/three.module.min.js"),
        { Tracks } = await import("/js/fieldfx.js");
      const scene = new T.Scene(),
        cam = new T.OrthographicCamera(-0.48, 0.48, 0.48, -0.48, 0.01, 8),
        rt = new T.WebGLRenderTarget(128, 128),
        r = new T.WebGLRenderer({ antialias: false });
      r.setSize(128, 128, false);
      r.setRenderTarget(rt);
      r.setClearColor(0xffffff, 1);
      cam.position.set(0, 2, 0.0001);
      cam.lookAt(0, 0, 0);
      const t = new Tracks(scene, false),
        o = new T.Vector3();
      function pix() {
        r.render(scene, cam);
        const a = new Uint8Array(128 * 128 * 4);
        r.readRenderTargetPixels(rt, 0, 0, 128, 128, a);
        let changed = 0,
          dark = 0;
        for (let i = 0; i < a.length; i += 4) {
          let diff = 255 - a[i] + (255 - a[i + 1]) + (255 - a[i + 2]);
          if (diff > 6) changed++;
          dark += diff;
        }
        return { changed, dark };
      }
      t.beat(o, "mud", false, 0.28, true);
      t.update(0.05);
      const strong = pix();
      t.update(4.8);
      const faint = pix();
      t.update(4);
      t.update(0.01);
      const gone = pix();
      t.beat(o, "water", true, 0, true);
      t.update(0.14);
      const splash = pix();
      t.dispose();
      r.dispose();
      rt.dispose();
      const signals = {};
      for (const kind of ["sand", "rock", "grass", "leaves", "mud", "water"]) {
        const ctx = new OfflineAudioContext(1, 11025, 44100),
          t = new Tracks(new T.Scene(), true);
        t.audio = {
          state: "running",
          sampleRate: ctx.sampleRate,
          destination: ctx.destination,
          createBuffer: ctx.createBuffer.bind(ctx),
          createBufferSource: ctx.createBufferSource.bind(ctx),
          createBiquadFilter: ctx.createBiquadFilter.bind(ctx),
          createGain: ctx.createGain.bind(ctx),
        };
        // Render the same Effects → Master routing into the independent offline analyser.
        const effects = ctx.createGain(),
          master = ctx.createGain();
        effects.connect(master).connect(ctx.destination);
        t.mix.graph.Effects = effects;
        t.mix.graph.Master = master;
        t.beat(o, kind);
        const wave = (await ctx.startRendering()).getChannelData(0);
        let sum = 0,
          peak = 0,
          nonzero = 0,
          crossings = 0;
        for (let i = 1; i < wave.length; i++) {
          sum += wave[i] ** 2;
          peak = Math.max(peak, Math.abs(wave[i]));
          if (wave[i] !== 0) nonzero++;
          if (wave[i] * wave[i - 1] < 0) crossings++;
        }
        signals[kind] = { energy: sum, peak, nonzero, crossings };
        t.audio = null;
        t.dispose();
      }
      return { strong, faint, gone, splash, signals };
    });
    const g = rep.contacts;
    assert(
      g.strong.changed > 10 &&
        g.faint.dark < g.strong.dark * 0.8 &&
        g.gone.dark === 0 &&
        g.splash.changed > 10,
      JSON.stringify(g),
    );
    assert(
      Object.values(g.signals).every((v) => v.energy > 0 && v.nonzero > 100),
    );
    assert.equal(
      new Set(Object.values(g.signals).map((v) => v.energy)).size,
      6,
    );
    assert.deepEqual(rep.errors, []);
    assert.deepEqual(src.miss, []);
    assert.deepEqual(src.remote, []);
    console.log(
      "GPU mud fade, water contact pixels, six distinct nonzero synthesized audio buffers passed.",
    );
    rep.pass = true;
  } finally {
    fs.writeFileSync(
      path.join(out, "walk-extras.json"),
      JSON.stringify(rep, null, 2) + "\n",
    );
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
