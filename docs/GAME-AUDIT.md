# Game audit — Phase 0

**Build:** commit `2e3d3cf` (`arena/40b813ab-telugustates`), Hugo 0.147.8, static
output `Hugo-Project/public`.
**Date:** 2026-11-28.
**Method:** this environment has no Android device, so the audit combines

1. **two real-phone screenshots** taken by the owner (marked *phone*),
2. **nine emulated-phone captures** from `e2e/audit-shots.mjs` — headless
   Chromium + SwiftShader, mobile UA and touch, at the three master-prompt
   viewports: **412×915**, **360×800**, **800×360 (landscape)** — written to
   `docs/audit/`,
3. **code reading** of `Hugo-Project/static/js/` (100 modules) and the Hugo
   layouts.

Reproduce with: `npm run build && node e2e/audit-shots.mjs`.
Screens that do not exist (inventory, journal, market, pause, loading,
title) cannot be captured — their absence *is* a finding.

---

## 1. Screenshot inventory

| File | Viewport | Shows |
|---|---|---|
| `01-title-home-412x915.png` | 412×915 | Home page: header nav, hero card, treasury metrics, regional map teaser — a **website**, not a title screen |
| `02-hud-walk-412x915.png` | 412×915 | Walking HUD in daylight: 3 round nav buttons, square minimap, text time/weather chip, joystick, 4 round action buttons |
| `03-life-panel-412x915.png` | 412×915 | "Life" modal — route market text list, build chips, livestock, buggy, quests |
| `04-sow-context-412x915.png` | 412×915 | After sowing ragi at the feet: contextual button shows crop stage (`🌿 0/4`) |
| `05-vehicle-spawn-412x915.png` | 412×915 | Buggy spawned — **landed upside-down**, wheels pointing up, player beside it |
| `06-vehicle-rider-412x915.png` | 412×915 | Drive mode engaged: player **standing on the chassis** (no seat, no sit pose) |
| `07-hud-walk-360x800.png` | 360×800 | Same HUD at the smaller portrait size (rider still engaged — see §3.B) |
| `08-hud-landscape-800x360.png` | 800×360 | Landscape HUD |
| `09-life-panel-landscape-800x360.png` | 800×360 | Life panel in landscape — panel is a right-side card, world washed out behind |
| *phone* `Screenshot_…19-15-30` | real device | Buggy wedged into a signboard, wheels oversized and detached, player standing on it in a **jump pose** (arms up) |
| *phone* `Screenshot_…19-16-18` | real device | Life panel as the player sees it: cream modal, monospace headers, `Go` buttons, no art |

Emoji note: `02`/`04` show **blank glyph slots** where icons should be — the
HUD relies on emoji (`🎒 🌱 🏃`), which headless Chromium (and some Android
WebView builds) do not render. Icons must become SVG.

---

## 2. Findings against the master prompt's acceptance criteria

### A. Vehicle — "works" but does not feel like a vehicle

*Evidence: both phone shots, `05`, `06`, `07`.*

- **No enter/exit.** The only interaction is a menu toggle
  (`Drive (joystick)`) that snaps the walker onto the chassis every frame.
  There is no seat node, no approach-and-sit move, no exit, no free-spot
  search, no camera change, no vehicle HUD (speed/fuel), no engine sound.
- **Character never sits.** The walker keeps its standing/jump pose on top
  of the buggy (phone shot: arms up mid-jump). No drive/sit animation state
  exists (no `AnimationMixer` anywhere in game code — the character is
  procedurally posed).
- **Model is a placeholder.** Chassis = one box (1.1×0.4×2.3), wheels =
  four untextured black cylinders that read as oversized because the body
  is smaller than the wheel diameter (0.68 m). No hub, no axles, no
  steering visual, wheels do not spin or steer.
- **Spawn is unreliable.** `05` shows the buggy flipped upside-down after
  being dropped 0.9 m above the terrain; the phone shot shows it jammed
  into a signboard. Rapier `DynamicRayCastVehicleController` settles it
  only sometimes.
- Physics underneath are real (4 raycast wheels, suspension, engine,
  steering — `check-physics` green), so the gap is **presentation and
  interaction, not simulation**.

### B. UI feels like a website

*Evidence: `01`, `03`, `09`, phone Life-panel shot, `02`.*

- **Life panel is a web modal**: cream card, `<b>Life</b>` + `×`,
  monospace uppercase section headers, text rows with white `Go` pills
  (`Buy 2 cotton @ ₹69 [Go]`), text chips (`fence ₹2`). No icons, no item
  art, no price trend arrows, no press feedback, no count badges.
- **HUD is button-shaped, not game-shaped**: rounded dark-green circles
  (website aesthetic), emoji glyphs (blank in headless), no status cluster
  (rupees/day/stamina never visible outside the menu), no hotbar, no
  world-space prompt bubble above interactables.
- **Minimap is a square** with no compass ring, no player arrow styling,
  no points of interest; **time/weather is a plain text chip**
  (`Sim 12:30 · Clearing`) instead of icon + clock.
- **Screens vs popups:** inventory, journal, market, map, pause, loading,
  credits-as-screen do not exist. Existing surfaces are: the Life modal,
  a `world-sheet` settings drawer (season/light/weather/quality — good
  bones), `#room-notice` toasts, an APK update banner.
- **Feedback:** toasts exist for stage/catch/quest events (added in the
  playability pass) but there are no press animations, haptics, coin
  counters, or quest banners.

### C. Placeholder art everywhere

- Placed structures and animals are boxes/cylinders from
  `life-meshes.js` (explicitly "visual primitives… no art assets needed").
- The buggy is boxes (above). No GLB pipeline: no `gltf-transform`, no
  meshopt/KTX2, no CI validation of models, no `MISSING-ASSETS.md`.
- Crops change colour on the acre grid; there are no growth-stage models.
- The player character is a decent low-poly figure with walk/run/jump
  poses (procedural), but has no tool-use, fish, or sit animations.
- Bright spot: the terrain/world itself (hills, grass tufts, village
  houses, signboards) reads as a coherent low-poly style — the gap is
  **props, vehicles, characters-on-props, and every UI icon**.

### D. Home page and site are ordinary web pages

*Evidence: `01`.*

- Home = header nav + hero card + "Find my home" Instagram form + World
  Treasury counters + district directory. It is a clean **marketing site**,
  not a game title: no live 3D backdrop, no logo-as-title, no
  Play/Continue, no loading progress bar, no language/credits entry as
  part of a title flow.
- Inner pages (districts, houses, economy) share the same card language —
  no in-game Atlas treatment yet.

### E. "Buttons run code, but it is not fun"

- The loops exist (sow→water→tend→harvest, fish, build, buy/sell, quests
  with rewards) and are now *visible* (playability pass `2e3d3cf`), but:
  no sound on actions beyond an ambient mixer, no pickup bursts, no
  economy feedback (rupee count only inside the menu), the market is a
  text list, quests are a text list, and the vehicle — the most
  game-looking object — is broken to interact with.
- No PWA manifest or service worker was found (APK + update banner exist),
  so the **offline-after-first-load** constraint is not yet met for web.

### What already exists and should be reused (do not rebuild)

| Asset | Where | Reuse for |
|---|---|---|
| EN/తెలుగు message system (`data-msg`) | `messages.js` + layouts | every new UI string |
| SVG icon helper + sprite partial | `icon()` in world.js, `layouts/partials/icons.html` | replacing emoji (add game-mechanic icons) |
| Self-hosted OFL fonts: Manrope, Fraunces, NotoTelugu | `static/fonts/` + `atlas.css` | ART-DIRECTION typography (Telugu coverage already solved) |
| Settings sheet (season/light/weather/quality, language, credits link) | `world-sheet` | pause/settings screen base |
| Quality tier system + budgets checks | `quality.js`, `tools/check-budget.mjs` | performance targets |
| Ambient audio mixer | `soundscape.js` | base for SFX layer (Howler later) |
| `LICENSES.json` (134 entries) + `library/CREDITS.html` | `static/assets/`, library | Credits screen generation |
| Checks + Playwright e2e | `Hugo-Project/tools/` (21), `e2e/smoke.mjs`, `e2e/audit-shots.mjs` | gate every phase |
| i18n fonts, safe-area CSS, toasts, contextual `#farm-act` | atlas.css / world.js | HUD redesign |

---

## 3. Prioritised fix list

### P0 — vertical-slice blockers (must be visibly fixed in screenshots)

1. **Vehicle interaction done properly** (master Phase 3): model with
   named nodes (`chassis/wheel_*/seat/steering`), wheels sized from the
   model, enter prompt → smooth seat attach + sit pose, exit to a raycast
   free spot, vehicle HUD (speed), flip-safe spawn (spawn upright on
   ground; no drop), camera spring-arm, engine sound by RPM.
2. **HUD system** (master Phase 1): status cluster (rupees + day/weather
   icons), round minimap with compass, one contextual action button
   (SVG icon + label), tool hotbar, world-space prompt bubbles; kill
   emoji-as-icons; 48 dp targets, safe-area insets.
3. **Screens, not modals**: rebuild Life content as tabbed screens —
   Market (grid + trend arrows + item art), Build (ghost preview, rotate,
   validity tint, cost chip), Quests (journal rows), Inventory (grid) —
   on a shared component kit (panel/tab/slot/toast) with press animation.
4. **Title screen** (master Phase 0.4 + 1): live golden-hour 3D backdrop
   with slow orbit, logo, Play/Continue, Settings, Credits, language
   toggle, loading bar with real tile progress + tips; keep the crawlable
   fallback (existing markup stays for SEO in a `noscript`/reduced path).
5. **Icon set**: pick Lucide (ISC) as primary UI family, fill gameplay
   gaps from Kenney Game Icons (CC0), recoloured to the palette; sprite it.

### P1 — the slice must feel alive

6. Item art pipeline: bake icons from the 3D models (offscreen render →
   WebP) at build time; CI check that every inventory kind has an icon.
7. Feedback pass: press/haptic on every button, animated coin counter,
   quest-complete banner, pickup toasts with icons, build ghost preview.
8. Sound: Howler + CC0 SFX (Kenney audio / Freesound CC0 filter), engine
   loop, footsteps by surface; record in `LICENSES.json`.
9. Market stall as a physical interactable with vendor NPC opening the
   buy/sell screen; prices from `economy.js` with trend arrows.
10. First-run tutorial as guided prompts (contextual bubble on the exact
    interactable) instead of the quest text list.

### P2 — after the slice feels right

11. GLB pipeline: gltf-transform (meshopt + KTX2), CI validation
    (node names, scale, tri budget, licence entry), `MISSING-ASSETS.md`
    for gaps (charpoy, bullock cart, mud well, auto-rickshaw…).
12. Character animation state machine (idle/walk/run/jump/sit/tool/fish)
    on `AnimationMixer`; retarget a rigged CC0 character.
13. Other vehicles (tractor, bicycle, boat, bullock cart), livestock
    polish, Ink dialogue/journal, fishing tension mini-game.
14. PWA (manifest + service worker, offline after first load), Android
    WebView pass, golden screenshots at all three viewports, on-device
    perf (30 fps mid-range target), accessibility pass.

---

## 4. Vertical-slice scope (targets for Phases 1–3)

**One slice, polished:** *title → walk → sow to harvest → sell → drive.*

In scope:

- Title screen (live 3D backdrop, Play/Continue, settings, credits,
  language) and a real loading screen.
- HUD: status cluster, round minimap, contextual action button, hotbar
  (hoe/seeds/watering can/sickle/rod/hammer), joystick + keyboard.
- One vehicle: the **buggy** — enter, drive (touch + keyboard), exit,
  speed HUD, flip-safe spawn, dust feedback.
- Farming end-to-end on the existing acre: sow → water → tend (stage
  models as simple GLBs or harmonised primitives) → harvest burst →
  pickups into a grid inventory.
- One market screen reachable from a physical stall, selling the harvest
  with trend arrows and animated coin feedback.
- First-run tutorial quest (`first-sowing`) delivered as guided prompts.
- Settings sheet (existing) promoted to pause screen; Credits generated
  from `LICENSES.json`.

Explicitly out of scope until the slice feels right: other vehicles,
fishing polish, livestock pens expansion, building mode polish, Ink
dialogue, music, district/economy web pages re-skin.

**Definition of done for the slice** (checked in screenshots at all three
viewports): the five acceptance criteria in §2 are each visibly fixed;
`npm run build`, all 21 `tools/check-*.mjs`, `e2e/smoke.mjs` and
`e2e/audit-shots.mjs` green; performance no worse than `check-budget`
budgets; every new asset in `LICENSES.json`.
