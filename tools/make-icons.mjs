#!/usr/bin/env node
// Build the game icon sprite from the vendored Iconify packs.
//
// Sources (both on npm, license-checked):
//   @iconify-json/lucide       ISC   — UI chrome (stroke icons)
//   @iconify-json/game-icons   CC-BY-3.0 — gameplay mechanics (filled)
//
// Emits Hugo-Project/static/icons/sprite.svg with one <symbol id="ico-…">
// per entry below. Fails (exit 1) when a requested icon is missing so CI
// can gate the set. Run: node tools/make-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const lucide = (await import("@iconify-json/lucide/icons.json", { with: { type: "json" } })).default;
const gameIcons = (await import("@iconify-json/game-icons/icons.json", { with: { type: "json" } })).default;

/** sprite id → [source, icon name in that source] */
const ICONS = {
  // --- UI chrome (lucide, ISC) ---
  settings: ["lucide", "settings"],
  home: ["lucide", "house"],
  layers: ["lucide", "layers"],
  backpack: ["lucide", "backpack"],
  coins: ["lucide", "coins"],
  calendar: ["lucide", "calendar"],
  clock: ["lucide", "clock"],
  sun: ["lucide", "sun"],
  cloud: ["lucide", "cloud"],
  rain: ["lucide", "cloud-rain"],
  "partly-cloudy": ["lucide", "cloud-sun"],
  journal: ["lucide", "scroll-text"],
  store: ["lucide", "store"],
  close: ["lucide", "x"],
  play: ["lucide", "play"],
  pause: ["lucide", "pause"],
  sound: ["lucide", "volume-2"],
  language: ["lucide", "languages"],
  download: ["lucide", "download"],
  save: ["lucide", "save"],
  next: ["lucide", "chevron-right"],
  "trend-up": ["lucide", "arrow-up"],
  "trend-down": ["lucide", "arrow-down"],
  check: ["lucide", "check"],
  info: ["lucide", "info"],
  help: ["lucide", "circle-question-mark"],
  map: ["lucide", "map"],
  compass: ["lucide", "compass"],
  gauge: ["lucide", "gauge"],
  fuel: ["lucide", "fuel"],
  enter: ["lucide", "log-in"],
  exit: ["lucide", "log-out"],
  walk: ["lucide", "person-standing"],
  sprint: ["game", "run"],
  jump: ["lucide", "move-up"],
  cart: ["lucide", "shopping-cart"],
  "trend-flat": ["lucide", "refresh-cw"],
  rotate: ["lucide", "rotate-ccw"],
  plus: ["lucide", "plus"],
  minus: ["lucide", "minus"],
  trash: ["lucide", "trash"],
  target: ["lucide", "target"],
  package: ["lucide", "package"],
  utensils: ["lucide", "utensils"],
  heart: ["lucide", "heart"],
  zap: ["lucide", "zap"],
  navigation: ["lucide", "navigation"],
  tractor: ["lucide", "tractor"],
  bike: ["lucide", "bike"],
  ship: ["lucide", "ship"],
  sunset: ["lucide", "sunset"],
  wind: ["lucide", "wind"],
  wheel: ["game", "steering-wheel"],
  // --- gameplay mechanics (game-icons, CC-BY-3.0) ---
  sow: ["game", "seedling"],
  water: ["game", "watering-can"],
  harvest: ["game", "sickle"],
  fish: ["game", "fishing"],
  rod: ["game", "hook"],
  build: ["lucide", "hammer"],
  fence: ["lucide", "fence"],
  shed: ["lucide", "warehouse"],
  well: ["game", "well"],
  barn: ["game", "barn"],
  cot: ["game", "bed"],
  threshing: ["game", "wheelbarrow"],
  cow: ["game", "cow"],
  goat: ["game", "goat"],
  chicken: ["game", "chicken"],
  bull: ["game", "bull"],
  egg: ["lucide", "egg"],
  milk: ["lucide", "milk"],
  carrot: ["game", "carrot"],
  wheat: ["lucide", "wheat"],
  rupee: ["game", "rupee"],
  shop: ["game", "shop"],
  pen: ["game", "wooden-fence"],
  torch: ["game", "torch"],
  buggy: ["lucide", "car"],
  hoe: ["lucide", "shovel"],
  pet: ["lucide", "paw-print"],
};

const packs = { lucide, game: gameIcons };
const seen = new Set();
const missing = [];
const parts = [];

for (const [id, [src, name]] of Object.entries(ICONS)) {
  const pack = packs[src];
  const icon = pack?.icons?.[name];
  if (!icon) {
    missing.push(`${id} (${src}/${name})`);
    continue;
  }
  if (seen.has(id)) continue;
  seen.add(id);
  const viewBox =
    icon.body.includes("512") || pack.width === 512 ? "0 0 512 512" : "0 0 24 24";
  // game-icons bodies already carry fill="currentColor"; lucide bodies carry
  // their own stroke attributes — the symbol only needs the viewBox.
  parts.push(
    `<symbol id="ico-${id}" viewBox="${viewBox}">${icon.body}</symbol>`,
  );
}

if (missing.length) {
  console.error(`Missing icons:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">` +
  parts.join("") +
  `</svg>\n`;

const outDir = join(root, "Hugo-Project/static/icons");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "sprite.svg");
writeFileSync(outFile, svg);

const sha = createHash("sha256").update(svg).digest("hex");
console.log(
  `sprite.svg: ${seen.size} icons, ${svg.length} bytes, sha256 ${sha.slice(0, 16)}…`,
);
