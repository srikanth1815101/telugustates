# ARCHITECTURE — Telugu States by CSRGO

Baseline: **7.15.0 / versionCode 71500** (Notes still describe 7.14.0 — the repo is newer than the handover notes; the repo governs).
Written for Phase 0 of the studio-grade upgrade plan. **No behaviour is described here that is not in the code.**

---

## 1. How a page load works

```
GitHub Pages / Android WebView  (static files only — no server, no CDN)
        │
        ▼
layouts/_default/baseof.html
  └── <script type="module" src="/js/entry.js">
        │
        ▼
static/js/entry.js           primes audio unlock, stamps body classes
        │  (dynamic import — the 3D engine is not in the initial page load)
        ▼
static/js/public-home.js     home page shell: district board, handle search
        │                    (SHA-256 hash on device, never stored), dialogs,
        │                    2D SVG map (map.js), the hash router route()
        │                    (#/u/ #/acre/ #/plot/ #/field/<place> #/at/lat,lon)
        ▼
static/js/world.js  expedition()     ← the entire 3D world (~4 000 lines)
        │  WebGL2 renderer, quality governor, input, camera, tile streaming,
        │  HUD, audio, weather, world calendar; exposes window.atlasWalk
        ▼
80 sibling ES modules under static/js/  (import graph, no bundler)
```

* **Build:** Hugo 0.147.8 renders Markdown content → HTML + `catalog.json` +
  `app-version.json`. Runtime JS is served **as-is** from `static/js/` — native
  ES modules, no npm dependencies, no bundler, no runtime network beyond local
  files fetched by `grid.js get()`.
* **Deploy:** `.github/workflows/hugo.yml` (push to `main` → gh-pages,
  CNAME `telugustates.csrgo.com`). `.github/workflows/build-android.yml`
  (manual/scheduled: runs all checks, then builds the offline APK).
* **Android:** `android/` is the current WebView host (7.15.0) with a local
  asset router; the site inside is the same Hugo output. `Android/` holds the
  field-test checks and verification notes.
* **Local admin:** `node admin.mjs` → visual editor on :4173 writing straight
  into `Hugo-Project/content` (Node stdlib only).

## 2. Invariants that every change must respect

1. **No servers.** Everything is static; player progress is device-local.
2. **No runtime network.** All terrain, water, art and i18n are bundled.
3. **Privacy:** real Instagram usernames are hashed one-way on device
   (`resident-id.js`, 4 096 rounds of domain-separated SHA-256) and never
   appear in files, catalogs, URLs or signboards.
4. **Metres are conserved:** `metres.js` — one atlas cell (`ACRE`) = 63.615 m;
   every system (terrain, walking, roads, buildings) shares this.
5. **The frozen tiles are immutable** (`static/frozen/`, format in
   `static/frozen/TILE-FORMAT.md`); checks pin 1 193 terrain hashes.
6. **Checks must pass:** the 17 `tools/check-*.mjs` listed in §5.

## 3. `static/js/` — file catalogue (81 files)

### Entry, shell and data plumbing

| File | Role |
|---|---|
| `entry.js` | Page bootstrap: audio unlock, body classes, lazy-imports `public-home.js`. |
| `public-home.js` | Home page: district directory, handle lookup (hashing), dialogs, saved-home UI, mounts the 2D map, owns the hash router and boots the 3D world. |
| `world.js` | **The 3D expedition** (`expedition()`): renderer setup, input, camera, scene streaming, HUD wiring, save/position, the frame loop, quality application. Exposes `window.atlasWalk` (snapshot/debug API) and returns `{visit, guide, coordinate, overview, stop, …}`. |
| `edition.js` | `dev` / `edition` flags (single public edition). |
| `messages.js` | Runtime i18n: loads `i18n/{en,te}.json`, `msg()`, `bindMessages()`. |
| `app-sync.js` | In-app update banner for the Android wrapper (APK + live catalog refresh), progress UI. |
| `catalog.js` | Parses `catalog.json` into typed records (houses, roads, trails, places, world config, languages, resources). |
| `grid.js` | Fetch layer `get()`/`url()`, exact WGS84 Albers projection (`ll`/`xy`), tile cache `Tiles`, unzip (gzip / ACP3). |
| `acre-codec.js` | ACP3 lossless decoder for frozen TSA1 archives. |
| `acre-probabilities.js` | Packed cumulative probability tables (acre land-cover rolls). |
| `map.js` | The 2D SVG regional map: pan/zoom, pins, layers, enter-3D transitions. |
| `pocket-map.js` | In-world north-up minimap. |
| `record-kinds.js` | demo / community / unreviewed labels + counts. |
| `position-book.js` | Device-local saved position (localStorage, no GPS, no expiry server). |
| `quality.js` | **`deviceTier()`** (software renderer → 0, coarse pointer → 1, else 2), **`Governor`** (frame-time demotion ladder, rich-detail audition), `fieldRatio()` (per-tier pixel budget). |
| `metres.js` | The single length system: `ACRE = 63.615`, `RELIEF`, `basis`/`localPoint`/`SIDE`. |
| `perf-harness.js` | **Phase 0, opt-in (`?perf=1`)** — frame-time p50/p95, draw calls, triangles, memory at village/river/coast spots. Inert without the flag. |

### Terrain, survey and world base

| File | Role |
|---|---|
| `terrain.js` | `Surface` — the walkable/rendered ground mesh: tile streaming (`streamChunk`), materials, `sample()`/`floor()`/`ground()` queries shared by renderer and motor. |
| `survey.js` | `loadSurvey()`, regional relief mesh, `Annotations`, `horizon()`. |
| `survey-collar.js` | Joins submitted land/water edges to the survey grid (no seams). |
| `survey-water.js` | Distant (outside-walkable) water chart on the relief; 3×3 GPU page window. |
| `hydraulic-inset.js` | Extra bank detail at the local-to-survey join. |
| `hydraulic-stage.js` | HST1 stage data: water head per frozen wet sample. |
| `tread.js` | Path/country-road profiles baked into the land mesh (Kenney profile, no overlay faces). |
| `lane-soil.js` | Single local wear map for village lanes (no overlapping road polygons). |
| `house-ground.js` | Cut-and-fill building terraces; inner rectangle + toe lines agreed with terrain. |
| `bank-mesh.js` | River/reservoir bank geometry against fitted water edges. |
| `catchment.js` | Finite-volume rainfall/runoff solver (m, m³, m³/s) on a shared graph. |
| `rill-sheet.js` | Runoff sheet: branches, hollows that fill/spill/drain, standing water. |
| `rain-ground.js` | Rain-on-land visuals and pond statistics. |
| `moving-water.js` | Whitewater: cascades, falls, feeder channels (bed stones, spray). |
| `river-margin.js` | Bank-margin shader + packet scales (running fresh water only). |
| `surf-zone.js` | Shared beach/swash law for sand, water film and boots. |
| `hydro-shaders.js` | Shared GLSL chunks (drops, surf, shore, margin, noise hooks). |
| `dry-mobile.js` | Cheap clear-weather inland water path for tier 0 / Saver. |
| `current-page.js` | Precomputed velocity chart pages (`velocityAt`), streamed. |
| `current-flecks.js` | Visible drift flecks transported by the current. |
| `ground-weave.js` | Stable hash/simplex GLSL noise fields (no LOD bands). |
| `soil-field.js` | Continuous triangular value noise for geology/catchment warps. |

### Character, camera, input, contact

| File | Role |
|---|---|
| `walk-motor.js` | Kinematic character motor: acceleration, slope traction, gravity, floating spring, river drag in bounded substeps. |
| `walk-camera.js` | Third-person orbit built from the traveller; camera collision against terrain/rocks/houses. |
| `touch-walk.js` | Touch controls: one role per contact, two-thumb look, pointer capture. |
| `standard-pad.js` | W3C gamepad mapping (no replayed jumps on reconnect). |
| `contacts.js` | Collision queries: `passes`, `solidFor`, `clearance`, `support` over terrain + house + rock + cover solids. |
| `walk-icons.js` | Locally drawn 24-unit icon family for the HUD. |
| `field-hud.js` | Accessible localised play controls/sheets (English + Telugu). |
| `treasury-view.js` | World treasury (food/currency/gold) panel. |

### Settlements, houses, acres

| File | Role |
|---|---|
| `resident-id.js` | One-way resident identity (SHA-256 × 4 096, domain-separated), house labels, shard keys. |
| `resident-design.js` | The single model catalogue (archetype names → model ids). |
| `resident-forms.js` | The 12 archetypes' exterior meshes from Markdown front matter. |
| `resident-scene.js` | Streams nearby resident exteriors, terraces, doors, nameboards. |
| `home-index.js` | Spatial index of pads/courtyards (a cell holds buildings, never an owner). |
| `home-volume.js` | Room/door/floor plan in local metres — one plan feeds visuals + collision. |
| `home-interior.js` | Interior shell and door leaves from the same plan. |
| `room-layout.js` | Deterministic furniture layout per visit (seeded, stable). |
| `room-fittings.js` | Low-poly furniture/joinery meshes. |
| `nameboard.js` | Physical wayside signboards (house name only, never a handle). |
| `acre-edge.js` | Historic field-entry pose + generic rail collision. |
| `hamlet-scene.js` | Village commons: clearing, shade platform, shared spots. |
| `hamlet-route.js` | Walking guide: path-to, guide steps, holding outlines. |
| `path-right-of-way.js` | Exact capsule/line path intersections in metres. |
| `landworks.js` | Village works data (lanes, commons) + their meshes. |
| `timber-yard.js` | Survey features, wayside stones (acres are not fenced). |
| `agriculture.js` | Field-type/crop visuals for assigned acres. |
| `contacts.js`, `metres.js` | (see above) |

### Nature, ecology, art

| File | Role |
|---|---|
| `habitats.js` | Pure versioned placement policy (no RNG/wall clock/network). |
| `placement-worker.js` | Runs `habitats.generate()` in a Web Worker. |
| `ecodata.js` | Ecology assignment loader (cover/soil/rock/rain keys). |
| `ecoscene.js` | Builds the ecology scene: trees, plants, rocks, animals placement. |
| `field-extras.js` | Per-field extras: drift, rock water, falls, cascade details. |
| `foot-cover.js` | Ground cover near the player (courtyards, clearances). |
| `nature-materials.js` | Shared nature materials incl. dry-mobile shader wiring. |
| `art-library.js` | Offline model library: cached by model id (not per instance). |
| `current-flecks.js` | (see above) |

### Sky, weather, time, audio, traveller

| File | Role |
|---|---|
| `sky.js` | Atmosphere, sun direction, true north, shared `smooth()`. |
| `regional-weather.js` | Region/season weather cycles from the shared calendar. |
| `world-calendar.js` | Display time: 4-real-hour day modes, 28-real-day year, `Asia/Kolkata`. |
| `fieldfx.js` | `WeatherFX` (cloud cards + matching shadow ellipses, rain particles) and `Tracks` (footstep dust marks + the field audio mixer: footstep/blip cues, unlock, pause). |
| `traveller.js` | Both skinned traveller rigs, retargeted performances, terrain IK. |
| `traveller-weather.js` | Wet/dry fabric masking for the two authored palettes. |
| `soundscape.js` | Web Audio mixer: ambient/effects/music/weather buses, positional sources, meter. |
| `lightweight.js` | Tier-0 path: `combineMeshes`, `cropDraws`/`restoreDraws` (vertex lighting, no shadows). |
| `curves.js` | C1 waypoint interpolation for authored paths. |

## 4. `tools/` — file catalogue (32 files)

### Authoring / content pipeline (Node 20+, no npm deps)

| File | Role |
|---|---|
| `add-house.mjs` | Create/update one privacy-preserving house record (hashes the handle, writes Markdown + settlements together). |
| `add-houses-batch.mjs` | Onboard a day's follower list in one pass. |
| `settle.mjs` | The settlement planner: reserves squares/parcels/fields, cut/fill-safe joins; production builds refuse unpinned records. |
| `settle-without-hugo.mjs` | Runs Hugo-dependent tools when Hugo is not installed. |
| `catalog-without-hugo.mjs` | Publish `catalog.json` without Hugo. |
| `style-neighbours.mjs` | Give every house a distinct look judged by its actual surroundings. |

### Baked data (offline; outputs live under `static/`)

| File | Role |
|---|---|
| `bake-current.mjs` | River velocity/coverage chart (never changes surveyed levels). |
| `bake-survey-colours.mjs` | Survey colour rasters from the frozen tiles. |
| `bake-survey-water.mjs` | Distant water coverage chart from the same frozen tiles. |
| `bake-water-stages.py` | Hydraulic stage derivation (numpy/scipy/shapely/rasterio/pyproj). |
| `bake-vector-heads.py` | Fills centreline-only river branches from stage stations. |
| `bake-field-jump.py` | Bakes sagittal jump tracks from each traveller's neutral stance. |
| `bake-model-jump.py` | Retargets the Casual Jump clip onto both rigs. |
| `bake-traveller-actions.py` | Optional deterministic action retargeter (not needed to serve). |
| `read-water-samples.mjs` | Extracts authoritative wet cells/heights/river chains for bakes. |
| `casual-jump-tracks.json.gz`, `hydrolakes-id-footprints.geojson.gz` | Fixture inputs for the bakes/checks. |

### Regression checks (the CI gate — 17 checks)

| File | Verifies |
|---|---|
| `check-content.mjs --tiles` | Public lookup, geometry inputs, pages, counts, 1 193 terrain hashes. |
| `check-villages.mjs` | Every home, parcel, shareable junction, dry route. |
| `check-growth.mjs` | Two growth batches in a disposable copy; original pins/lanes cannot move. |
| `check-homes.mjs` | Full terraces, hollow rooms, four surveyed corners, rail jumps. |
| `check-motion.mjs` | Controller, rigs, camera, water/terrain regressions (JSON fixture out). |
| `check-stones.mjs` | Tap/held jumps, visible-mesh tops, crossing/off, too-high control. |
| `check-swim.mjs` | Both rigs: forward reach, treading, return to land, skin palette. |
| `check-jump-cycle.mjs` | Complete input-driven jump cycle on both skinned rigs. |
| `check-river-margin.mjs` | Fixed shallow-bed transects along connected wet edges. |
| `check-banks.mjs` | Bank contour/seam/centreline + distant-water pages. |
| `check-current-pages.mjs` | Published velocity chart vs original coverage, byte-for-byte. |
| `check-stages.mjs` | Submitted water triangles vs submitted levels. |
| `check-littoral.mjs` | Marine apron, wet/dry sweep, downstream tracks, quiet reservoir. |
| `check-rain-state.mjs` | Antecedent wetness must not carry moving rain in Cloudy. |
| `check-runoff.mjs` | Same solver/centreline the game submits; no renderer needed. |
| `check-water.mjs` | Shipped static water geometry, offline. |
| `check-scene-contact.mjs` | Independent vertical intersections against indexed buffers. |

Run all of them exactly as CI does:

```sh
export PATH="$HOME/.local/bin:$PATH"   # hugo 0.147.8 on PATH
cd Hugo-Project
node tools/check-content.mjs --tiles
node tools/check-villages.mjs && node tools/check-growth.mjs && node tools/check-homes.mjs
node tools/check-motion.mjs && node tools/check-stones.mjs && node tools/check-swim.mjs
node tools/check-river-margin.mjs && node tools/check-banks.mjs && node tools/check-current-pages.mjs
node tools/check-stages.mjs && node tools/check-jump-cycle.mjs && node tools/check-rain-state.mjs
node tools/check-runoff.mjs && node tools/check-water.mjs && node tools/check-littoral.mjs
node tools/check-scene-contact.mjs
```

## 5. Rest of the repository

| Path | Role |
|---|---|
| `Hugo-Project/content/` | Layer-1 authored content: `districts/` (61), `houses/` (one Markdown per resident), `roads/`, `trails/`, `places/`, `resources/` (food/currency/gold balances), `world/` (calendar, ecology, models), `languages/` (en/te JSON copy). |
| `Hugo-Project/layouts/` | Hugo templates; `partials/catalog.html` compiles all content into `catalog.json` (single source for map, search and 3D). |
| `Hugo-Project/data/` | `settlements.json` (village squares, pins, paths — written only by `settle.mjs`), `app_release.json` (7.15.0). |
| `Hugo-Project/static/frozen/` | Immutable terrain tiles + `TILE-FORMAT.md`, boundaries, relief, districts. |
| `Hugo-Project/static/hydraulics/`, `current/`, `survey/`, `ecology/` | Baked water stages, flow pages, survey rasters, ecology assignments. |
| `Hugo-Project/static/library/` | Model library (walk props, animations, surfaces, credits). |
| `Hugo-Project/static/vendor/` | Three.js r177 (MIT), fflate, fzstd + license files. No CDN, ever. |
| `Hugo-Project/static/assets/LICENSES.json` | Every dependency and its license (Phase 1+ additions go here). |
| `admin/` | Local visual world editor (`node admin.mjs` → :4173, stdlib only). |
| `android/` | Current offline WebView APK host, build scripts, release metadata. |
| `Android/` | Field-test checks, `Verification.md`, screenshot/video evidence. |
| `Notes/` | Owner briefs and history (`MASTER-PROMPT.md`, `START-HERE.md`, …). |
| `.github/workflows/` | `hugo.yml` (Pages deploy), `build-android.yml` (checks + APK). |

## 6. Performance architecture (what exists today)

* **Device tiers** (`quality.js`): 0 = software renderer, 1 = phone (coarse
  pointer / ≤700 px), 2 = desktop. Every subsystem branches on `gov.tier`.
* **Governor:** rolling frame-time window; five recent frames > 36 ms →
  demote one tier. Optional rich-detail audition re-samples at tier 2 and
  returns to the cap if p95 is out of budget.
* **Pixel budgets:** `fieldRatio()` caps effective DPR per tier and orientation
  (a rotated phone must not suddenly shade 4× the pixels).
* **Streaming:** terrain tiles (`Tiles`/`streamChunk`), houses and ecology are
  prepared per patch around the player; placement runs in a Worker
  (`placement-worker.js`).
* **Tier 0 path:** vertex lighting, combined meshes, cheap water
  (`lightweight.js`, `dry-mobile.js`), no shadows, 30 fps battery-saver gate.
* **Shadows:** PCF shadow map only on tier 2 and not in Saver.
* **What is not yet measured:** draw calls / triangles / texture memory /
  JS heap at fixed spots — that is what `perf-harness.js` (§7) records.

## 7. Perf harness (Phase 0)

Open the site with `?perf=1`; it boots into the 3D world and samples three
fixed camera spots (village, river, coast — cells authored in
`content/places/`), recording per spot:

* rendered-frame intervals → **p50 / p95 / max / mean**, median FPS
* **draw calls** and **triangles** (min/median/max per window)
* GPU resources: textures, geometries, programs; **JS heap** where exposed
* device tier, tier transitions, quality/saver settings, canvas size, DPR

Options: `&tier=1|2` forces a tier and freezes the governor (controlled A/B),
`&spot=village|river|coast` runs one spot, `&ms=` / `&settle=` tune windows.
Results: on-screen panel, `console.log`, and `window.__atlasPerfReport`
(with a copy-to-clipboard button).

Run it once on a mid-range phone (tier 1) and once on a desktop (tier 2);
keep both JSON reports as the Phase 0 baseline. The harness adds no network
requests, no storage writes, and does nothing without `?perf=1`.

## 8. Known constraints for upcoming phases

* `world.js` is ~4 000 lines: split it **gradually** (renderer/input/camera/
  streaming/HUD/save/loop), re-running all 17 checks after every split.
* No bundler yet: introducing Vite must keep the no-CDN, no-runtime-network
  guarantee and emit into Hugo's `static/`.
* Physics is hand-rolled today (`walk-motor.js` + `contacts.js`); a physics
  engine (Rapier, WASM) must reproduce the existing feel — keep a toggle and
  `check-motion/stones/swim` as the acceptance gate.
* Resident IDs, public URLs and the save format are frozen: ask the owner
  before changing any of them.
