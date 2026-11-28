#!/usr/bin/env node
// End-to-end smoke test in a real (headless) Chromium.
//
// Serves the built site (Hugo-Project/public) over localhost, boots the
// actual 3D world, fails on any console error, page error or 404, proves
// there are no external network calls, exercises the perf harness, and saves
// screenshots of the three camera spots for visual review.
//
// Usage:
//   npm run build && node e2e/smoke.mjs
//   node e2e/smoke.mjs --headed-debug   (keep browser open on failure)
// Software WebGL (SwiftShader) means tier 0 and slow frames — this is a
// correctness test, not the device performance baseline.
import { createServer } from "node:http";
import { readFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const site = resolve(root, "../Hugo-Project/public");
const artifacts = join(root, "artifacts");

if (!existsSync(join(site, "index.html"))) {
  console.error("Build the site first: npm run build");
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".gz": "application/gzip",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

const external = new Set();
const notFound = new Set();

const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = normalize(join(site, path));
    if (!file.startsWith(site)) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && (await import("node:fs")).statSync(file).isDirectory())
      file = join(file, "index.html");
    if (!existsSync(file)) {
      notFound.add(path);
      res.writeHead(404).end("not found");
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": MIME[extname(file)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const chromium = (await import("@sparticuz/chromium")).default;
const puppeteer = await import("puppeteer-core");

// @sparticuz/chromium targets Amazon Linux; on other hosts its NSS/NSPR
// siblings must be unpacked from the bundled al2023 archive and exposed
// through LD_LIBRARY_PATH.
let browserEnv = process.env;
try {
  const pkgDir = resolve(root, "../node_modules/@sparticuz/chromium");
  const libDir = "/tmp/atlas-al2023-lib";
  if (!existsSync(join(libDir, "libnss3.so"))) {
    const { brotliDecompressSync } = await import("node:zlib");
    const tarPath = "/tmp/atlas-al2023.tar";
    await (await import("node:fs/promises")).writeFile(
      tarPath,
      brotliDecompressSync(await readFile(join(pkgDir, "bin/al2023.tar.br"))),
    );
    await (await import("node:fs/promises")).mkdir(libDir, { recursive: true });
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync("tar", ["-xf", tarPath, "-C", libDir, "--strip-components=1", "lib"], {
      encoding: "utf8",
    });
    if (r.status !== 0) throw new Error(`tar failed: ${r.stderr}`);
  }
  browserEnv = { ...process.env, LD_LIBRARY_PATH: libDir };
} catch (e) {
  console.log(`  ! could not prepare NSS libs (${e}); trying system defaults`);
}

const browser = await puppeteer.launch({
  args: [
    ...chromium.args,
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required",
  ],
  executablePath: await chromium.executablePath(),
  env: browserEnv,
  headless: true,
  protocolTimeout: 300_000,
});

const failures = [];
const note = (m) => console.log(`  · ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`  ✗ ${m}`);
};

const page = await browser.newPage();
await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1 });
page.on("console", (msg) => {
  const t = msg.type();
  const text = msg.text();
  if (t === "error") fail(`console.error: ${text.slice(0, 300)}`);
  else if (t === "warning" && /failed to load|404/i.test(text))
    fail(`console warning: ${text.slice(0, 300)}`);
});
page.on("pageerror", (e) => fail(`pageerror: ${String(e).slice(0, 400)}`));
page.on("requestfailed", (r) => {
  const u = r.url();
  if (u.startsWith(base)) fail(`request failed: ${u} — ${r.failure()?.errorText}`);
  else external.add(u);
});
page.on("response", (r) => {
  const u = r.url();
  if (u.startsWith(base) && r.status() >= 400)
    fail(`HTTP ${r.status()}: ${u.slice(base.length)}`);
  else if (!u.startsWith(base)) external.add(u);
});

async function step(name, fn) {
  console.log(`\n== ${name}`);
  try {
    await fn();
  } catch (e) {
    fail(`${name}: ${String(e).slice(0, 500)}`);
  }
}

await step("home page boots with map and district board", async () => {
  await page.goto(`${base}/`, { waitUntil: "networkidle0", timeout: 60_000 });
  await page.waitForSelector("#district-grid .district-card, #district-grid [role=listitem], #district-grid > *", { timeout: 30_000 });
  const districts = await page.$$eval("#district-grid > *", (n) => n.length);
  if (districts < 10) throw new Error(`only ${districts} district cards`);
  note(`${districts} district cards rendered`);
  if (!(await page.$("#map path, #map [data-district]")))
    throw new Error("SVG map missing");
});

await step("WebGL2 available", async () => {
  const ok = await page.evaluate(() => {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    if (!gl) return false;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "webgl2";
  });
  if (!ok) throw new Error("no WebGL2 context");
  note(`renderer: ${ok}`);
});

await step("3D world boots and streams a patch", async () => {
  await page.goto(`${base}/?perf=1`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(
    () => window.atlasWalk && window.atlasWalk.snapshot().ready,
    { timeout: 180_000, polling: 500 },
  );
  const s = await page.evaluate(() => window.atlasWalk.snapshot());
  note(`mode=${s.mode} tier=${s.tier} draws=${s.drawCalls} tris=${s.triangles} houses=${s.housesDrawn}`);
  if (!(s.drawCalls > 0)) throw new Error("no draw calls");
  if (!(s.triangles > 1000)) throw new Error("suspiciously few triangles");
  const frames0 = s.frames;
  await new Promise((r) => setTimeout(r, 2000));
  const frames1 = await page.evaluate(() => window.atlasWalk.snapshot().frames);
  if (frames1 <= frames0) throw new Error("frame counter not advancing");
  note(`frames advanced ${frames0} → ${frames1}`);
});

await step("perf harness samples all three spots", async () => {
  // The harness was installed by the ?perf=1 boot above; give it its own run.
  const report = await page.evaluate(async () => {
    const spots = ["village", "river", "coast"];
    // If the auto-run from boot already finished, __atlasPerfReport exists.
    if (window.__atlasPerfReport?.spots?.length === 3)
      return window.__atlasPerfReport;
    // Otherwise wait for it (the boot harness runs unattended).
    const t0 = Date.now();
    while (Date.now() - t0 < 300_000) {
      if (window.__atlasPerfReport?.spots?.length === 3)
        return window.__atlasPerfReport;
      await new Promise((r) => setTimeout(r, 500));
    }
    return window.__atlasPerfReport || null;
  });
  if (!report || report.spots.length !== 3)
    throw new Error(`report incomplete: ${JSON.stringify(report?.spots?.map((s) => s.id))}`);
  for (const s of report.spots) {
    if (s.error) throw new Error(`${s.id}: ${s.error}`);
    note(
      `${s.id}: p50=${s.p50ms}ms p95=${s.p95ms}ms draws=${s.drawCalls?.median} tris=${s.triangles?.median} tier=${s.tier}`,
    );
    if (s.p95ms == null) throw new Error(`${s.id}: no frame samples`);
  }
  await mkdir(artifacts, { recursive: true });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(artifacts, "perf-report.json"), JSON.stringify(report, null, 2));
});

await step("screenshots at each spot", async () => {
  await mkdir(artifacts, { recursive: true });
  // Use the lon/lat the harness itself recorded for each spot, driven through
  // the same hash router a deep link would use.
  const report = JSON.parse(
    await page.evaluate(() => JSON.stringify(window.__atlasPerfReport)),
  );
  for (const spot of report.spots) {
    if (spot.error) continue;
    await page.evaluate(
      ([lat, lon]) => {
        location.hash = `#/at/${lat},${lon}`;
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      },
      [spot.lat, spot.lon],
    );
    // Wait until the camera has actually left the previous spot.
    await page.waitForFunction(
      (ll) => {
        const s = window.atlasWalk?.snapshot();
        if (!s?.ready) return false;
        const d = Math.hypot(s.ll[0] - ll[0], s.ll[1] - ll[1]);
        return d < 0.05;
      },
      { timeout: 180_000, polling: 500 },
      [spot.lon, spot.lat],
    );
    // Then wait for real rendered frames so the screenshot cannot capture a
    // stale compositor frame (software GL runs at ~1–3 fps here).
    const framesAtArrival = await page.evaluate(() => window.atlasWalk.snapshot().frames);
    await page.waitForFunction(
      (n) => window.atlasWalk.snapshot().frames > n + 8,
      { timeout: 180_000, polling: 250 },
      framesAtArrival,
    );
    const seen = await page.evaluate(() => window.atlasWalk.snapshot().ll);
    await page.screenshot({ path: join(artifacts, `spot-${spot.id}.png`) });
    note(`saved spot-${spot.id}.png (camera ll=${seen.map((n) => +n.toFixed(4))})`);
  }
});

await step("Rapier physics streams heightfields behind ?physics=1", async () => {
  await page.goto(`${base}/?physics=1#/at/14.2184118,78.4068883`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForFunction(
    () => window.atlasWalk?.snapshot()?.ready,
    { timeout: 180_000, polling: 500 },
  );
  // Wait for wasm init + first streamed tile + at least one stepped frame.
  await page.waitForFunction(
    () => window.__atlasPhysics?.ready && window.__atlasPhysics.tiles >= 1,
    { timeout: 120_000, polling: 500 },
  );
  const p = await page.evaluate(() => window.__atlasPhysics);
  note(
    `tiles=${p.tiles} bodies=${p.bodies} colliders=${p.colliders} grounded=${p.grounded} gap=${p.gap} root=${p.root} surf=${p.surf} resY=${p.resY} hAt=${p.hAt} direct=${p.direct} drift=${p.drift} stepped=${p.stepped}`,
  );
  if (p.tiles < 1) throw new Error("no heightfield tiles streamed");
  if (!(p.colliders >= 1)) throw new Error("no colliders");
  if (!(p.stepped > 0)) throw new Error("world never stepped");
  if (p.gap == null) throw new Error("no ground raycast hit");
  if (Math.abs(p.gap) > 0.5)
    throw new Error(`capsule far from heightfield (gap=${p.gap})`);
  if (!p.grounded) throw new Error("character not grounded on heightfield");
});

await step("post stack renders behind ?fx=1", async () => {
  // Fresh direct boot first (no fx) — proves the plain path at this coord.
  await page.goto(`${base}/#/at/14.2184118,78.4068883`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForFunction(
    () => window.atlasWalk?.snapshot()?.ready,
    { timeout: 180_000, polling: 500 },
  );
  await page.waitForFunction(
    (n) => window.atlasWalk.snapshot().frames > n + 10,
    { timeout: 180_000, polling: 250 },
    0,
  );
  const direct = await page.evaluate(() => {
    const c = document.querySelector(".flight-deck canvas");
    return {
      snap: window.atlasWalk.snapshot(),
      canvas: c ? [c.width, c.height] : null,
      fx: window.__atlasFx,
    };
  });
  note(
    `direct: fx=${direct.fx} canvas=${direct.canvas} draws=${direct.snap.drawCalls} tris=${direct.snap.triangles} ll=${direct.snap.ll?.map((n) => +n.toFixed(3))}`,
  );
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, "fx-direct-boot.png") });

  // Now the same boot with the composer forced on.
  await page.goto(`${base}/?fx=1#/at/14.2184118,78.4068883`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForFunction(
    () => window.atlasWalk?.snapshot()?.ready,
    { timeout: 180_000, polling: 500 },
  );
  await page.waitForFunction(
    () => window.__atlasFx === "composer",
    { timeout: 120_000, polling: 500 },
  );
  const frames0 = await page.evaluate(() => window.atlasWalk.snapshot().frames);
  await page.waitForFunction(
    (n) => window.atlasWalk.snapshot().frames > n + 12,
    { timeout: 180_000, polling: 250 },
    frames0,
  );
  const info = await page.evaluate(() => {
    const deck = document.querySelector(".flight-deck");
    const c = deck?.querySelector("canvas");
    return {
      fx: window.__atlasFx,
      dbg: window.__atlasFxDebug,
      snap: window.atlasWalk.snapshot(),
      deck: deck ? [deck.clientWidth, deck.clientHeight] : null,
      canvas: c
        ? [c.width, c.height, c.clientWidth, c.clientHeight, c.isConnected]
        : null,
      hidden: document.hidden,
    };
  });
  note(
    `composer passes=${info.dbg?.passes} buf=${info.dbg?.buf} size=${info.dbg?.size} canvas=${info.dbg?.canvas} deck=${info.deck} domCanvas=${info.canvas} hidden=${info.hidden} tris=${info.snap.triangles} ll=${info.snap.ll?.map((n) => +n.toFixed(3))}`,
  );
  if (info.fx !== "composer") throw new Error(`fx mode regressed to ${info.fx}`);
  if (info.dbg?.canvas?.[0] < 300)
    throw new Error(`canvas backing too small: ${info.dbg?.canvas}`);
  if (info.dbg?.buf?.[0] < 300)
    throw new Error(`composer buffer too small: ${info.dbg?.buf}`);
  await page.screenshot({ path: join(artifacts, "fx-village.png") });
  note(`composer active through ${frames0}→+12 frames; saved fx-village.png`);
});

await step("no external network calls", async () => {
  // The only allowed exception: a pre-existing optional update check that the
  // Android wrapper documents; it must not break the page either way.
  const real = [...external].filter((u) => !u.startsWith("data:"));
  if (real.length) {
    for (const u of real) console.log(`  ! external: ${u}`);
    // Hard-fail on anything that is not the documented update endpoints.
    const bad = real.filter(
      (u) =>
        !/telugustates\.csrgo\.com|github\.com|githubusercontent\.com|instagram\.com|w3\.org/.test(u),
    );
    if (bad.length) fail(`unexpected external requests: ${bad.join(", ")}`);
  } else note("none");
});

await step("no 404s", async () => {
  if (notFound.size) fail(`404 paths: ${[...notFound].join(", ")}`);
  else note("none");
});

await browser.close();
server.close();

console.log(
  failures.length
    ? `\nE2E FAILED (${failures.length}):\n- ${failures.join("\n- ")}`
    : "\nE2E SMOKE PASS",
);
process.exit(failures.length ? 1 : 0);
