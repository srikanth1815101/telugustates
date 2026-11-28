#!/usr/bin/env node
// Phase 0 audit: phone-sized screenshots of the current build.
//
// Captures the screens the master prompt asks for (title/home, HUD while
// walking, Life panel, sowing context, vehicle spawn and riding) at
// 412x915, 360x800 and 800x360 (landscape) with a mobile UA + touch.
// Screens that do not exist yet (inventory, market, journal…) are absent
// by definition and are recorded as findings in docs/GAME-AUDIT.md.
//
// Usage:  npm run build && node e2e/audit-shots.mjs
// Output: docs/audit/*.png
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const site = resolve(root, "../Hugo-Project/public");
const out = resolve(root, "../docs/audit");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = normalize(join(site, path));
    if (!file.startsWith(site)) return res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory())
      file = join(file, "index.html");
    if (!existsSync(file)) return res.writeHead(404).end("not found");
    res.writeHead(200, {
      "content-type": MIME[extname(file)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const chromium = (await import("@sparticuz/chromium")).default;
const puppeteer = await import("puppeteer-core");

// Same NSS/NSPR shim as smoke.mjs (sparticuz targets Amazon Linux).
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
    const r = spawnSync(
      "tar",
      ["-xf", tarPath, "-C", libDir, "--strip-components=1", "lib"],
      { encoding: "utf8" },
    );
    if (r.status !== 0) throw new Error(`tar failed: ${r.stderr}`);
  }
  browserEnv = { ...process.env, LD_LIBRARY_PATH: libDir };
} catch {
  /* fall back to ambient libraries */
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

const problems = [];
const note = (m) => console.log(`  · ${m}`);

const page = await browser.newPage();
await page.setUserAgent(
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
);
await page.setViewport({
  width: 412,
  height: 915,
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
page.on("console", (msg) => {
  if (msg.type() === "error") problems.push(`console: ${msg.text().slice(0, 200)}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 300)}`));

await mkdir(out, { recursive: true });
const shot = async (name) => {
  const file = join(out, name);
  await page.screenshot({ path: file });
  note(name);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- 1. title / home at the primary phone size ----------------------------
console.log("\n== title/home 412x915");
await page.goto(`${base}/`, { waitUntil: "networkidle0", timeout: 60_000 });
await page.waitForSelector("#district-grid > *", { timeout: 30_000 });
await shot("01-title-home-412x915.png");

// --- 2. world HUD while walking -------------------------------------------
console.log("\n== world boots (hash route, no perf harness)");
await page.goto(`${base}/#/at/14.2184118,78.4068883`, {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
});
await page.waitForFunction(
  () => window.atlasWalk && window.atlasWalk.snapshot().ready,
  { timeout: 180_000, polling: 500 },
);
// The sim clock boots at night (00:27); force daylight so the audit shots
// show the world, not a dark frame.
await page.evaluate(() => {
  const sel = document.getElementById("light");
  if (sel) {
    sel.value = "day";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
});
// Capture the in-game title screen before dismissing it.
await shot("00-title-game-412x915.png");
await page.evaluate(() => document.getElementById("title-play")?.click());
await sleep(700);
await sleep(2500); // let the first frames settle
await shot("02-hud-walk-412x915.png");

// --- 3. Market screen ------------------------------------------------------
console.log("\n== market screen");
await page.evaluate(() => window.__gameUI?.openScreen("market"));
await sleep(600);
await shot("03-market-screen-412x915.png");
await page.evaluate(() => window.__gameUI?.closeScreens());
await sleep(300);

// --- 4. sowing context (plot at the walker's feet) -------------------------
console.log("\n== sow context");
await page.evaluate(async () => {
  const L = window.atlasLife;
  await L.ready();
  const m = L._motor();
  L.farming.sow(m.x, m.y, "ragi");
});
await sleep(1200);
await shot("04-sow-context-412x915.png");

// --- 5. vehicle spawn ------------------------------------------------------
console.log("\n== vehicle spawn");
await page.evaluate(async () => {
  await window.atlasLife.ready();
  await window.atlasLife.spawnVehicle();
});
await sleep(2000); // let it settle onto its suspension
await shot("05-vehicle-spawn-412x915.png");

// --- 6. riding (drive engaged) --------------------------------------------
console.log("\n== vehicle ride");
await page.evaluate(() => window.__gameUI?.openScreen("build"));
await sleep(500);
const driveBtn = await page.$('#game-screens [data-drive]');
if (driveBtn) {
  await driveBtn.click();
  await page.evaluate(() => window.__gameUI?.closeScreens());
  await sleep(2000); // rider snap + a couple of frames
  await shot("06-vehicle-rider-412x915.png");
} else {
  problems.push("drive button not found in build screen");
  await page.evaluate(() => window.__gameUI?.closeScreens());
}

// --- 7. 360x800 portrait ---------------------------------------------------
console.log("\n== 360x800");
await page.setViewport({
  width: 360,
  height: 800,
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
await sleep(1200);
await shot("07-hud-walk-360x800.png");

// --- 8/9. 800x360 landscape: HUD + panel ----------------------------------
console.log("\n== 800x360 landscape");
await page.setViewport({
  width: 800,
  height: 360,
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
await sleep(1200);
await shot("08-hud-landscape-800x360.png");
await page.evaluate(() => window.__gameUI?.openScreen("inventory"));
await sleep(600);
await shot("09-inventory-landscape-800x360.png");

await browser.close();
server.close();

console.log(`\nScreenshots written to docs/audit/`);
if (problems.length) {
  console.log(`\n${problems.length} page problem(s) observed:`);
  for (const p of [...new Set(problems)].slice(0, 12)) console.log(`  ! ${p}`);
  process.exitCode = 0; // audit still succeeded; findings feed GAME-AUDIT.md
}
