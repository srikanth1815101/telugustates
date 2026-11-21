# TELUGU STATES BY CSRGO — CONSOLIDATED MASTER BUILD PROMPT (v6 + v7)

**Project:** Telugu States by CSRGO  
**Website:** `telugustates.csrgo.com`  
**Instagram:** `@telugustates.csrgo`  
**Purpose:** One self-contained implementation specification for the coding agent. This replaces the need to paste v6 and v7 separately.

> **Priority:** All v6 requirements are retained unless superseded here by v7. This document resolves those conflicts explicitly. Read `AGENTS.md`, `NOTES.md`, and `REPORT.md` before doing any work. Respect existing higher-priority workspace rules.

## 0. WORKFLOW, ACCEPTANCE, AND NON-NEGOTIABLE RULES

1. **No silent descoping.** Existing houses, real-scale acre plots, corner stones, animals, vegetation, working navigation, sound, weather, testing and resident records must not disappear. Never claim completion for unimplemented work. If blocked, record **Not done and why** in `REPORT.md` and stop rather than skipping ahead.
2. **Plan and execute sequentially:** implement Parts A through O in order. Before each part, inspect the code and state the files to change, plan and tests. After each part run tests, fix failures, capture screenshots, update `NOTES.md` and `REPORT.md`, commit, and only then proceed. Follow any existing `AGENTS.md` rule requiring owner approval for designated decisions.
3. **Static deployment:** no permanent runtime server, no browser-side API secrets, no new runtime third-party requests for fonts, audio, models or other assets. Bundle assets locally. Authorized Instagram metrics can be ingested at build time or via verified manual import.
4. **Accuracy:** use genuine geographic data for terrain, coastline, elevation, hydrology and place names. Generated crops, vegetation, trails, houses, animals, weather and infrastructure are stylized simulations; explain that clearly in About/Data documentation, not with persistent overlays. Do not invent geographic features or engagement statistics.
5. **Existing data contracts:** preserve one Markdown file per resident house, Instagram username search, deep links, stable plot assignments, corner stones, true metric scale (1 world unit = 1 metre; acre square side approximately **63.615 m**), `check_plots.py`, existing test suites and reproducible site preparation. Migrate demo plots only if needed, preserving referential integrity and documenting changes.
6. **Mobile target:** at least 30 fps on mid-range Android where feasible, with Auto/Low/Medium/High/Battery Saver tiers. Battery Saver caps to 30 fps and disables expensive shadows, reflections and particles. Record measured results, device and methodology; never fabricate performance numbers.
7. **Licenses:** third-party assets only CC0 or CC-BY with attribution. No NC, editorial, unclear or redistribution-prohibited assets. Register every third-party model, sound, music track and relevant texture in `assets/LICENSES.json` with name, author, source URL, license and retrieval date; expose Credits in-app.
8. **Added asset budget:** target **35 MB maximum** across the work: models ≤8 MB, audio ≤15 MB, other assets ≤12 MB. Report actual bytes and compression; obtain approval before increasing budgets.
9. **Language:** all user-facing strings in `i18n/en.json` and `i18n/te.json`; report Telugu strings requiring native review. Plain, friendly English/Telugu wording. Documentation and reports should be understandable to a non-developer.
10. **Never erase persistent community state during rebuilds.** Version state and migration tools; transactions must be auditable and replayable.

### Resolved v6/v7 conflicts (authoritative)

| Topic | Final instruction |
|---|---|
| “Atlas” vs immersive | User-facing **Immersive Mode**; **Back to map** button. “Atlas” may remain an internal code name. |
| Home map vs full 3D | Keep lightweight interactive 2D regional map on home; **Explore in 3D** opens full-screen/edge-to-edge immersive 3D. |
| Roads | **Natural footpaths only** at first; replace v6's 3.5–5 m vehicle roads. Do not impose a visually rigid street grid. Existing reserved road-cell/plot connectivity invariants may remain internally if necessary, but render and route narrow organic trails. No road inside allocated plots. |
| Electric poles | **Not along every trail**; install only in developed village sections after resource-funded upgrades. Service lines only where electricity exists. |
| Houses | Keep all 12 v6 archetypes, but early settlements are predominantly modest rural homes; modern multistorey structures are rare until development. |
| Time | Default **shared 4-hour simulated day**; optional 2 h, 6 h, Live and Manual. Real local clock must never be misrepresented as simulated time. |
| Seasons | Shared simulated year = **28 real days**, with regionally appropriate seasonal probabilities. |
| Economy food time | **One food per occupied house per real calendar day by default**, not per accelerated visual day. Configurable, with idempotent accrual and consumption. |
| Weather | Shared, seeded, season-aware simulated weather; not a live forecast. Weather starts and stops naturally. |
| Agriculture | Regional cultivated landscapes are part of nature; crops appear only on suitable land, with simulated growth stages. |
| Drought | Only call a crisis “drought” when simulated environmental dryness accompanies a food shortage; otherwise say “Food shortage.” |
| Economy data | Verified official/authorized or manually verified Instagram metrics only; never invent likes/comments/shares. |

---

# PART A — MOBILE CONTROLS, CAMERA, CHARACTER AND CLEAN HUD

## A1. Multitouch controls

- Track touches independently by pointer ID using pointer capture; moving, looking, jumping and sprinting **must all work simultaneously**. On the game canvas use `touch-action: none` and prevent text selection, context menus, double-tap zoom and pull-to-refresh without disabling normal navigation elsewhere.
- Floating movement joystick activates under the left thumb in the left half, fades when idle; reaching its edge starts auto-sprint. Right-half drag orbits camera with configurable sensitivity and optional invert.
- Right-bottom translucent **Jump** and **Sprint** controls, minimum 48 px targets; hold Sprint, double-tap to lock; show context button only for actual interactions. Offer left-handed mirrored layout.
- Honor all four `env(safe-area-inset-*)` values and `viewport-fit=cover`, portrait and landscape, including notches and gesture areas.
- Keyboard: WASD/arrows, Space, Shift; mouse drag to look, wheel to zoom; gamepad if inexpensive. Optional haptic jump/landing, disabled in Battery Saver.

## A2. Third-person camera

- Smooth orbit about the character, distance 3.5–6 m, pinch/wheel zoom, terrain and obstacle collision, slope following without jitter.
- Looking steeply upward must **not remove the character from the frame**. Clamp pitch and adjust camera height/distance and framing; keep avatar visible in lower third. Prevent water-surface clipping and camera entering trees/walls/terrain. Fade avatar only if unavoidable at under 1 m.
- Small shoulder offset; in landscape keep avatar slightly left of center to avoid right controls. Optional auto-recenter behind moving avatar after idle look input.

## A3. Movement and animation

- Kinematic controller: ground snapping, ~40° slope limit, ~0.4 m step-up, gravity, ~120 ms coyote time and jump buffering, variable jump height, air control, acceleration/deceleration and smooth facing.
- True-scale walk ~3 m/s, sprint ~7 m/s, shallow-water speed ~60%; optional Explorer Boost ~30 m/s plus appropriate camera distance; teleport to house/district.
- Blend idle variations, walk, jog, sprint, turns, jump start/air/fall/landing, wading and optional swim. Backpack bounce, turn lean, head gaze. Animate landing crouch on hard impacts.
- Surface-specific contacts: dust on dry ground, wet mud splashes/temporary footprints, water ripples, leaf puffs; no dry dust in rain. Deep water either supports slow swimming or safely blocks with a friendly hint; document the selected behavior. Slide against obstacles, never pass through terrain, fences, trees or house walls.

## A4. Minimal HUD

- Default only: small **Back to map** top-left, **Menu** and compass top-right, single slim place/weather chip top-center, joystick left-bottom, Jump/Sprint right-bottom. No persistent technical overlays or giant status cards.
- Details sheet on chip tap/swipe: district/state, coordinates and copy, elevation, copyable plot code, world/local time explicitly labeled, 1-acre size, data/credits. Default hidden.
- HUD auto-fades after ~4 s inactivity, controls stay faint. Landscape coverage ≤12%, portrait ≤15% excluding transient toasts.
- Short ~2-second toasts for surface/region/weather transitions, not permanent “Wade · Water” or “Stand · Grass”.
- House labels only if in view and within ~60 m; max five, distance fade, overlap avoidance. Tap opens bottom sheet with @username, district, plot code, **Open on Instagram**, **Share this house**, **Walk here**. Remove giant persistent “Visit @...” bar.
- Dismissible first-time three-step tutorial: move, look, jump/sprint; store completion locally. Photo Mode hides HUD, supports free camera, time/weather overrides and Save picture.

## A5. Tests

- Playwright mobile touch at 390×844 and 844×390 with safe-area simulation; hold joystick + sprint + jump + look and assert all register concurrently.
- Maximum upward camera pitch still keeps projected character bounding box fully visible and above minimum pixel size.
- Collision tests with tree, house wall, fence and slopes; HUD coverage, safe areas, no text overlap; record fps while moving.

---

# PART B — RESIDENT HOMES, VILLAGE FOOTPATHS, ELECTRICITY

## B1. Stable plot and settlement layout

- Preserve acre-grid allocation, district settlement anchors and stable plot IDs. Existing v6 reserved street row every third row and connector column every twelfth may remain as an **internal routing reservation** where required by existing data/tests, but **must not generate an artificial straight road grid across the landscape**. Adapt the algorithm to narrow organic trail routing and verify all plots have reachable access without encroachment.
- Each occupied plot is reachable from its village center through the trail network. Connect only inhabited branches, pruning unused settlement paths; **natural exploration trails** are a separate network that can exist without houses.
- No paths through allocated plot interiors except the short resident's own entrance path. Existing assignments must remain stable across rebuilds. Rebuild path network deterministically and avoid rerouting established paths unless necessary.
- Plot side ~63.615 m; home footprint generally 60–200 m² (allow test tolerance 40–250 m²), average below 5% of acre area, ≥4 m inside plot edges, faces the nearest trail, level pad, yard entrance path and four corner stones.

## B2. Twelve village home archetypes

1. Mud-brick tile-roof house with veranda.
2. Traditional tiled-roof house.
3. Thatched hut.
4. Round thatched hut where culturally and regionally appropriate.
5. Simple RCC flat-roof home with water tank.
6. Two-storey RCC home with balcony (rare early).
7. L-shaped courtyard home.
8. Tin-sheet roof home.
9. Compound-walled home with cattle shed.
10. Stone-wall house.
11. Small shop-front house (only in sufficiently established villages).
12. Larger old courtyard house.

- Prioritize humble rural styles for new settlements. Deterministic styles from username and region, overrideable in resident Markdown.
- Walls: white, cream, yellow, turquoise, pink, blue, green, orange; roofs: terracotta, brown, grey, golden thatch, restrained colored metal. Include wear, plaster stains, doors, shutters, windows, steps, verandas and parapets.
- Appropriate props: well, shade tree, rope cot, haystack, firewood, cart, clothesline, small shrine platform, bicycle/motorbike, vegetable patch and cattle shed. Avoid uniform clutter.
- Default no continuous plot fences: four corner stones. Some seeded plots get short hedge, low compound wall or partial fence with gate.
- Build Telugu-village geometry procedurally or adapt CC0/CC-BY models; European/fantasy stock houses must not dominate. Target near LOD ~2,000 triangles per house, compressed glTF/meshopt/Draco where appropriate, shared atlases/vertex colors, distance LOD. Document in `docs/house_styles.md`.

## B3. Footpath-first electricity

- **No electric poles on wilderness trails.** Village electric infrastructure is unlocked with community resources and placed only on developed settlement paths.
- Once electrified, poles along selected developed village paths approximately 30–40 m apart, with permissible test range 25–45 m, within designated path verges and outside resident plots. Stable side/spacing, poles at bends, crossarms, insulators, sagging 2–4-wire spans, service connections to electrified houses, occasional transformer and lamps on some poles.
- Wires and poles should be instanced/merged. Do not assert every house is within 60 m of a pole **before** electricity is unlocked; assert this only for electrified homes/settlements.
- Nighttime emissive house windows are allowed as an atmospheric rendering effect before infrastructure unlock, but never falsely label that as installed electrical service.

## B4. Tests and debug views

- No paths inside other residents' plots; every occupied home connected to its village center; no disconnected branches; inspect path length per house and report if v6's ≤0.7 target is infeasible for organic trails (hard failure >1.0 only for comparable normalized metrics).
- House footprints, setbacks, road/trail-facing orientation, ≥8 archetypes and ≥6 wall colors among demo residents.
- Poles only in electrified settlement corridors, outside plots, correct spacing and connected wires; no poles in wild forests.
- Screenshots: village aerial, street-level, three house close-ups, developed electric corridor, village edge. All third-party assets licensed.

---

# PART C — SHARED DAY/NIGHT AND LIGHTING

- Shared authoritative **4-hour visual day** by default; optional 2 h, 6 h, Live device clock and Manual photo mode. The shared clock uses a documented world epoch, deterministic elapsed-time calculation and clock-drift handling. Do not reset on reload or pretend a fixed “12:30” is current time.
- Default 4-hour cycle approximately 2 h 30 min daylight, 30 min combined twilight and dawn, 1 h night, with seasonal/latitude variation. Display “World time” vs “Local time” clearly.
- Move sun/moon across sky. Smooth sunrise, midday, golden hour, dusk, stars, simple moon phases, fog colors, hemisphere lighting and distant ridges. Moving sun changes tree, house and terrain shadows; shadow quality adapts to device.
- Houses: seeded warm window/door glow, optional porch bulbs, occasional TV flicker; dusk on-times staggered, late-night shutoffs. Streetlamps only in electrified villages; emissive halos and ground light decals; ≤4 true nearby point lights. Soft pools and puddle glints, fireflies, moths, crickets, frogs and nocturnal animal behavior.
- Night stays navigable. Honor reduced flashing, smooth transitions and battery saver.
- Tests: correct sun direction, projected shadows change, lit windows above threshold at night, electrified lamps emissive, smooth transition, ≥30 fps target with 100+ lit houses on supported tier; record actual device measurements.

---

# PART D — REGIONAL WEATHER, SEASONS, PUDDLES AND RUNOFF

- Shared **28-real-day simulated year**; regional seasonal profiles for summer, southwest monsoon, post-monsoon, winter and transitions. Use data-supported geographic differences, not identical statewide weather.
- State machine: clear, partly cloudy, cloudy, drizzle/light rain, rain, heavy rain, rare thunderstorm, clearing; optionally mist, wind, hot haze and rare regionally appropriate dust. Smooth transitions 20–60 seconds, seeded by region/date/world state; weather starts and stops naturally. Do not stick on “Drizzle.”
- Auto simulated weather by world season; optional manual photo overrides (clear/cloudy/rain/heavy rain). Label **Simulated weather** in Settings. Never imply live forecast or display invented temperatures.
- Monsoon frequent 10–40-minute rain bursts with dry breaks, roughly 35–50% wet time as a configurable initial artistic target; winter mostly clear/misty; summer mostly clear/hazy; post-monsoon intermittent showers. Simulated-time scaling must be explicit.
- Near/mid/far rain layers, wind slant, fog curtains, roof/leaf/ground splashes, water ripples, moving clouds, wet rock/soil/roof materials, bending vegetation, optional subtle lens drops. Lightning rare and non-strobing; “Reduce flashing” on by default; delayed thunder.
- Rain creates puddles in natural depressions and mud-path ruts, with low-cost sky/lamp reflections and ripples. Use terrain flow direction, accumulation and depressions for downhill runoff, path-side gutter flow, rising water and receding water after rain. Shrink puddles over time; dry materials gradually; optional mist/rainbow when plausible. Never fake uphill runoff.
- Wildlife shelters in storms, frogs/insects increase after rain, dark storm afternoons can bring house glow earlier. Waterfalls strengthen only at geographically supported falls.
- Tests: accelerated monsoon simulation includes multiple rain starts/stops (at least two stops in 30 simulated minutes under a designated deterministic test seed), puddles expand and contract, downhill runoff appears and recedes, particles capped, fps measured on Medium rain tier.

---

# PART E — AUDIO, AMBIENCE AND MUSIC

- Web Audio API mixer with Master, Music, Effects, Ambience and Weather buses; positional sounds for rivers, falls, animals, rain on roofs and village events. Audio unlocks only after first user gesture, with friendly **Tap to start sound** prompt. Mute on hidden tab; remember music/mute settings; low music, medium ambience by default.
- Lazy-load per region and context; essential footsteps preloaded; cap mobile voices around 24. Audio budget ≤15 MB, mono SFX ~64–96 kbps, music ~96–128 kbps; compatible AAC/MP3 and Ogg/Opus where necessary. Synthesize procedural wind/rain/ambience if it saves space and is preferable to unlicensed assets.
- 4–6 gentle instrumental loops (morning, daytime, evening, night, rain, exploration) crossfade by time and weather; optionally Telugu/Indian instrumentation where legitimately licensed, no vocals. Duck under heavy weather.
- Surface footsteps: grass, dry grass, mud, wet mud, water, rock, wood bridge, sand, leaf litter; jump/landing synced to animation contacts.
- Nature: wind, leaves, creaking trees; streams, river, lake lapping, falls, splashes and fish ripples; rain light/heavy, on leaves, soil, water, tin roof, thunder near/far, drips.
- Animals: daytime birds, kingfisher, peafowl, parakeets, crows/kites, cows/buffalo, goats, dogs, cats, hens/rooster, monkeys, deer, frogs, crickets, owl, insects/bees. Use regional/temporal filters, not all at once.
- Sparse village: distant voices/vehicle when appropriate, gate creak, well bucket; soft UI taps/menu/toast sounds.
- Tests: gesture unlock, gains, all referenced files exist, permitted license entries, budget and voice cap, surface/time/weather-triggered changes. Document in `docs/audio.md`.

---

# PART F — GEOGRAPHICALLY APPROPRIATE NATURE AND AGRICULTURE

## F1. Regional biomes

- **Coastal Andhra / Bapatla / delta:** flat irrigated paddy patches, coconut/palmyra palms, casuarina near coast, mango groves, ponds, canals, creeks, wet coast mangroves, sand beaches and fishing boats near appropriate shorelines. No default African flat-top umbrella acacia savanna.
- **Interior Telangana:** cotton, maize, chilli, sunflower, paddy where irrigated; black/red soil, neem, tamarind, mango, granite boulder hills, scrub and natural grass.
- **Eastern Ghats / forest:** mixed native forest, bamboo/teak-like trees where appropriate, ferns, mist, supported streams and waterfalls, rocky hill trails.
- **Dry Rayalaseema-like zones:** sparse scrub, thorny trees, exposed rock, rocky hills, golden seasonal grass, dry channels.

## F2. Evidence-based placement

- Use land cover, rainfall, soils, elevation, slope, coast distance, moisture and hydrology. Tree species/height/density vary by biome and natural clusters; no uniform repeated patterns. Keep earlier requirements for varied fruit trees, plants, animals, butterflies and fish.
- Cultivation is part of the landscape, **not necessarily resident-owned**. Only put fields on suitable land. Model prepared soil, planting, growing, mature, harvest and fallow stages. Paddy may be flooded/green/golden/stubble according to simulated agricultural season. Label crop types and crop stages as simulated in docs; do not claim precise real field-level accuracy.
- Preserve supported hills, ridges, reservoirs, rivers, coastline, forests and natural viewpoints. Never invent major waterfalls, rivers or mountains for visual interest.
- Maintain 10+ geo-tagged screenshots in `debug/gallery/` spanning coast, delta, reservoir, forest, rocky hill, village, farm and dry scrub. Include coordinates, dataset references and candid notes on mismatches.

---

# PART G — PRODUCTION COPY, HOME, SETTINGS AND DATA

## G1. User language

- Glossary: **acre** = virtual land square; **house** = home on it; **village** = group of homes. Say **Find your house**, **Your acre**, **Back to map**, **Immersive Mode**.
- Remove developer jargon: “FIELD WALK Survey”, “Wade · Water”, “Stand · Grass”, “0.5 m · acre side 63.615 m”, bracketed acre coordinates, “source elevation / WGS 84” in the HUD. Use small scale bar “10 m”; details sheet “Plot 7918-8693”, “Elevation 77 m” with terrain source info.
- Never show fixed “12:30” as current time; no fabricated temperature; “Drizzle” in user copy becomes **Light rain**.
- Production flag hides `demo_` labels, debug counters and fake resident counts. Demo mode available only via developer flag or `?dev=1`; production shows real counts and **Be one of the first residents** if empty.
- Standard not found: “We couldn't find @name. Follow @telugustates.csrgo on Instagram and comment your district to get your acre.” Adapt if the actual claim process differs. Loading: “Preparing your corner of the world…” with genuine progress. Friendly Retry on offline/errors; empty district: “No houses here yet. Be the first.”
- Footer/About: **Virtual acres; not land ownership.** Houses, trails, crops, wildlife and development are generated/stylized, not records of actual property or land use. Link Data/Credits, Privacy, Remove my house, Instagram, website. Long technical notes belong on About/Data pages.

## G2. Home and settings

- Preserve clean green/cream identity. Home should show hero, lightweight interactive map, Explore in 3D, Find your house, short three-step How it works (follow, comment district, get acre), Instagram CTA, economy summary, featured scenic places, recent real residents when available, About/footer.
- Settings: English/తెలుగు; Auto/Low/Medium/High/Battery Saver; sound buses/mute/music; sensitivity, invert, left-handed, tutorial; world time mode (2 h/4 h/6 h/Live/Manual), weather Auto/Manual, season, relief exaggeration, name labels, Photo Mode, Credits, About, reduced motion and reduce flashing.
- Sharing uses `#/u/username`, previews generated at build time where possible, Instagram link. Accessible labels, sufficient contrast, text scaling and Telugu glyph coverage. Optional PWA manifest/offline page without indiscriminate large tile caching.

## G3. Tests

- No banned jargon in production; no `demo_` labels or debug text. All English/Telugu i18n keys present; glyph rendering verified.
- Portrait/landscape screenshot overlap and safe-area checks; ≤5 visible labels with overlap avoidance. Record initial load bytes, interactive time and accessibility checks.

---

# PART H — NATURE-FIRST WORLD DESIGN

- The world must be attractive **before any resident arrives**. Nature is foundational; settlement and development grow gradually. No repetitive empty grass plane, generic European forest, savanna, uniform fenced acre grid or modern vehicle-road network.
- Build layered local vegetation, seasonal grass, irregular crops, water features and wildlife from regional data; vary species, sizes, spacing and densities. Preserve terrain identity.
- Natural points of interest: safe hills, forest clearings, stream crossings, viewpoints and shorelines. Avoid invented major landmarks.
- Farming scenery is regionally appropriate, deterministic and seasonal, not automatically on every acre. Use documented artistic approximations.
- Screenshots should show beautiful coastal paddy, rocky Telangana, forest and dry scrub, with correct local flora.

---

# PART I — IMMERSIVE MODE, SEARCH AND FEATURED LANDSCAPES

## I1. Map-to-world experience

- Home opens on fast interactive regional 2D map, with clear **Explore in 3D** and fullscreen controls. 3D loads lazily only when needed.
- On Explore in 3D, transition to full-viewport **Immersive Mode**, request browser fullscreen if supported/permitted, otherwise use edge-to-edge fallback. Hide home navigation and use minimal game HUD. No reload; preserve player/camera state switching to overhead map and back.
- Overhead map supports pan, zoom, house markers, natural trails, featured places, search and teleport. Show labels only at suitable zoom levels.

## I2. Username search

- Resolve Instagram username against resident Markdown/compiled index. On success, stream target terrain/collisions, teleport to a **safe spot outside the correct house**, frame home and landscape, then show Explore, Share house and View Instagram. Never spawn in water, inside walls or before collision data loads.
- On failure, show friendly instructions and no fabricated house.

## I3. Featured landscapes

- Section title **Explore Beautiful Places** with high-quality verified screenshots or clearly identified representative images, place/district/state and short description. Suggested places subject to dataset verification: Araku Valley, Papikondalu, Lambasingi, Nagarjuna Sagar, Srisailam hills/forest, Ananthagiri Hills, Kuntala Falls, Horsley Hills, Godavari delta, Bapatla coast, Nallamala forest, Gandikota.
- Each **Explore** opens immersive view at a safe, terrain-verified spawn. Do not imply generated 3D scenes are photographic replicas.

---

# PART J — ORGANIC TRAILS AND VILLAGE EVOLUTION

- Generate a **separate natural trail network before houses exist**, connecting real/verified useful natural destinations: viewpoints, clearings, stream crossings, natural passes and settlement candidates.
- Trail width targets: forest 0.6–1.2 m; hill 0.6–1.5 m; village footpath 1.2–2.0 m; main village mud path 1.8–2.5 m; house entrance 0.6–1.2 m.
- Route by terrain-aware pathfinding, slope penalties and contours; use switchbacks on hills, safe shallow crossings/bridges, no dangerous cliff traverses or deep water. Visually use compacted earth, worn grass, stones and natural erosion; no straight grid of mud roads.
- When a resident is added: keep stable acre, choose appropriate home position and orientation, connect entrance to nearest reachable path, add only needed branches, update village graph deterministically without disrupting existing houses or nature.
- Development stages: natural world → growing villages (small houses, footpaths, wells) → connected communities (improved paths, bridges, school, lighting) → developed communities (health centers, public space). Stages apply **locally** based on resources and need, not globally at once.
- Do not build large vehicle roads without future explicit approval. Electrification is a funded village upgrade, not wilderness decoration.

---

# PART K — PERSISTENT WORLD CLOCK, SEASONS AND WEATHER

- One shared visual clock: default 4-hour day, optional 2 h/6 h/Live/Manual; world epoch configured at build, deterministic elapsed time. All visitors should see approximately same simulated date, daylight, season and regional weather. Clearly label manual/live override.
- Shared 28-real-day simulated year, with local season patterns, vegetation/crop response, water levels, wind and rainfall. Do not reset on reload.
- Sun/moon position, length/direction of shadows, sky, stars, fog and house lighting change smoothly. Maintain mobile performance via shadow quality tiers.
- Seeded regional weather fronts with smooth transitions, natural rainy/dry intervals and correct biome/season frequencies. Rain darkens paths, grows puddles, causes downhill runoff and roof/ground/leaf sounds; dries after rain.
- Persistent **visual** time is separate from **economy consumption** time; accelerated day/night must not accelerate food loss.
- Build-generated versioned world config plus deterministic client calculations; no runtime secret or required server. Document clock drift and reproducibility.

---

# PART L — INSTAGRAM-POWERED COMMUNITY ECONOMY

## L1. Resource model

| Verified latest designated reel engagement | Virtual resource | Initial conversion |
|---|---|---|
| 1 like | Food | +1 food |
| 1 comment | Currency | +1 currency |
| 1 share | Gold | +1 gold **only if verified share metric available** |

- Conversion rates configurable. These are virtual game resources only, not redeemable money, investment or ownership rights.
- Do not assume arbitrary Instagram reel metrics can be read publicly in-browser. Prefer authorized official access at **build time**; otherwise manually verify metrics. Never scrape private endpoints or store credentials in client bundle. If shares are unavailable, display **Unavailable / Not verified**, credit zero, and explain.

## L2. Required files and ingestion

- `data/economy/config.json`: conversion rates, food/day, thresholds, exchange rate, project costs, eligible campaign reel IDs, update policy.
- `data/economy/engagement.json`: per-reel verified cumulative snapshots, reporting time, source, verification status and supported metrics.
- `data/economy/ledger.json`: append-only unique transactions for new engagement, conversions, daily consumption and development spending.
- `data/economy/state.json`: reproducible published balances, last processed daily boundary and world/development snapshot.
- `scripts/update_economy.py`: validates snapshots, computes nonnegative **new** verified deltas, writes idempotent ledger entries, recalculates state, rejects invalid input and produces an audit report.
- `docs/economy.md`: plain-language workflow, source limitations and manual verification procedure.
- Do not count total cumulative engagement repeatedly. Example previous likes 1,000, new likes 1,250 → credit **250 food only**. Handle decreases/corrections via audit adjustment rules, never silently double count or erase history.
- No fabricated initial treasury; if no verified data, balances start at zero and update status explains why.

## L3. Food consumption and balance

- **Default: 1 food per occupied residential house per real calendar day**, not per simulated 4-hour day. Use a configured canonical calendar boundary/time zone, document it and process each day **once**, even if build runs multiple times. Do not double-charge during redeployments. New houses join consumption on a documented date.
- `daily_food_need = occupied_residential_houses × food_per_house_per_day`.
- `food_days = available_food / daily_food_need`; if zero occupied houses, display “No food consumption yet” instead of division by zero.
- Thresholds: >10 days Healthy; 5–10 Stable; 2–<5 Low supplies; <2 Food shortage; 0 Food crisis. Only use **Drought** if simulated environment is also dry. State clearly whether numbers are projections or verified balances.
- Low food gently reduces optional community activity/development, not house ownership, safety or access. Never delete residents or houses. Recovery occurs when verified resources arrive. Do not punish residents for low engagement.
- **Important balance check:** before production, simulate 0, 10, 100, 1,000 and 10,000 occupied homes over 30 real days with realistic engagement scenarios; report sustainability. Permit configurable food rate, non-Instagram simulated agriculture or other clearly documented balancing only after owner approval; do not secretly fabricate engagement food.

## L4. Currency and gold

- Comments fund virtual development. Initial illustrative prices: path improvement 100; community well 250; small bridge 400; village lights 500; small school 1,500; health center 2,000 currency. These are fictional configurable values, not actual costs.
- Shares add gold reserve. Initial exchange **1 gold = 10 currency**, configurable; only explicit approved conversion, ledgered atomically, no automatic liquidation. Gold may support rare large community projects/emergency reserves.
- Spending requires sufficient verified balance and a project that meets actual local need and geographic suitability. No random school in uninhabited forest or bridge across nothing.

## L5. Community treasury and fairness

- Home summary **Our States. Our Resources.** shows food, currency, gold, occupied acres, houses/residents, food days, condition and **last verified update**. Separate Economy page can show history, balance chart, development projects and verification limitations.
- Shared treasury across both states by default. Do not attribute reel engagement to one state without credible state-level evidence; if later splitting, document transparent allocation rules.
- Friendly messaging: “Your likes help feed our villages”; “Your comments help our communities grow”; “Your shares strengthen our gold reserve.” Do not incentivize spam, repetitive comments or claim Instagram sponsors the project.

## L6. Persistence, correctness and security

- Every ledger entry has stable unique ID, timestamp, resource, signed amount, reason, source, related reel or project and resulting balance; all published balances replay from ledger.
- No negative spending, duplicate imports, duplicate daily charges or race-condition double allocation. Include rollback/recovery procedures and reconciliation tests.
- Community state is **published at build time**; do not imply immediate live Instagram updates. Show last-update timestamp. Browser state is display-only and cannot change authoritative treasury.

---

# PART M — ACCURATE WORLD COUNTERS AND DEVELOPMENT

- Show **real** resident count, occupied acres, houses built, villages, food reserve, currency and gold. Production counts exclude demos. Recent-residents strip appears only with real records.
- Separate five distinct geographic statistics: (1) total real geographic area, (2) total generated acre grid cells, (3) eligible claimable acres, (4) allocated acres, (5) remaining eligible acres. Never divide total state area by 1 acre and call it claimable capacity. Account for water, protected/unsuitable terrain, plot rules and reservations.
- Each village record: ID, district, state, house count, occupied acres, development stage, connected trails, unlocked infrastructure. All computed from source data.
- Community projects unlock in suitable inhabited places after resources and needs checks. Stable placement, no sudden regeneration of houses/forests. Show local before/after progress and ledgered costs.

---

# PART N — STATIC ARCHITECTURE, PERFORMANCE AND STATE

- Keep resident Markdown, generated indexes, terrain chunks, static JSON, versioned world state, build-time Instagram import and client-side WebGL. No permanent backend or browser-exposed credentials.
- Chunk-stream enormous two-state world; terrain LOD, instanced vegetation, shared materials, occlusion/frustum culling, low-poly props, caching and unload on distance. Never instantiate every acre/tree simultaneously.
- Render priority: controls → camera → correct terrain → nearby homes/trails → time lighting → weather → nearby vegetation/wildlife → distant scenery → decorative effects.
- Track first-load JS/data bytes, streaming load times, memory growth, shader cost, fps per quality tier, night/rain performance and asset budgets. Do not trade core playability for visual effects.
- Authoritative economy and permanent village development use published versioned files; weather/time may be deterministically derived client-side. Client-side mutations must never change shared published balances.

---

# PART O — FINAL UI, VALIDATION, DOCUMENTATION AND DELIVERY

## O1. Home page order

1. Hero: **Telugu States** with short nature/community introduction.
2. Lightweight interactive Telangana–Andhra Pradesh regional map.
3. **Explore in 3D** / fullscreen immersive action.
4. **Find your house** Instagram username search.
5. How it works: Follow → Comment district → Get your acre (only if claim process really follows this).
6. **Our States. Our Resources.** compact verified economy.
7. **Explore Beautiful Places** featured scenic destinations.
8. Recent real residents if available.
9. About, Data/Credits, Privacy, Remove my house and Instagram links.

## O2. Required tests

- **Mobile:** simultaneous joystick/jump/sprint/look, portrait/landscape safe areas, avatar visibility at maximum pitch, collision and HUD coverage.
- **Houses:** all stable plot mappings, Markdown records, acre geometry, setbacks, 12 archetypes, colors, plot corner stones, no default continuous fences.
- **Trails:** connected safe natural trails, walkable gradients or switchbacks, no deep-water crossings without bridge, each occupied home connected, no path through other plots, no generated vehicle highways, no wild-trail poles.
- **Electricity:** only unlocked settlement corridors have poles/wires/lights; proper spacing and connections; no false electrification claims.
- **Nature:** regional biome evidence, coastal Andhra no savanna defaults, crop suitability, water feature fidelity, vegetation variety, 10-place gallery.
- **Immersive:** fullscreen/fallback, map-to-3D transitions, user search opens correct house, safe landmark spawns, preserve state.
- **Clock/weather:** persistent synchronized world time, correct sun/shadows/night lighting, regional seasons, multiple rain start/stops, growing/shrinking puddles, downhill runoff.
- **Audio:** user gesture unlock, sliders, surface triggers, weather/day changes, asset existence, CC0/CC-BY credits, voice and size caps.
- **Economy:** verified likes/comments/shares conversion, unavailable share handling, idempotent imports, negative/corrected snapshots, no double charges, food thresholds/zero houses, treasury replay, gold conversion, affordable project spending, zero food never deletes houses.
- **Production:** no demos/debug/banned jargon, i18n completeness and Telugu glyphs, accessible controls, screenshots and actual performance metrics.

## O3. Documentation deliverables

Create or update in plain language:

- `docs/controls.md`
- `docs/audio.md`
- `docs/weather.md`
- `docs/village_layout.md`
- `docs/house_styles.md`
- `docs/copy_deck.md`
- `docs/nature.md`
- `docs/biomes.md`
- `docs/trails.md`
- `docs/immersive_mode.md`
- `docs/world_clock.md`
- `docs/seasons.md`
- `docs/economy.md`
- `docs/community_development.md`
- `docs/world_state.md`
- `assets/LICENSES.json`
- `NOTES.md`
- `REPORT.md`

## O4. Required screenshots and reporting

- Home regional map; immersive portrait and landscape; coastal paddy; rocky Telangana; forest trail; hill climbing trail; village aerial/street; three house closeups; electrified settlement path; village night; rainy puddles/runoff; featured scenic place; economy; village before/after upgrade.
- `REPORT.md` must show changes per part, screenshots, HUD coverage, test commands and real results, measured fps by quality tier/device, initial load metrics, added asset sizes by category, license table, Telugu translations needing review, economic balancing scenarios, and explicit **Not done and why**.
- Include short phone instructions: how to walk in portrait/landscape, visit your house, open scenic locations, switch time/season/weather, find night village, hear sound and inspect economy.

## O5. Definition of done

**Do not declare the project finished** until all Parts A–O pass their applicable tests, screenshots demonstrate clean controls, geographically appropriate nature, homes connected by trails, safe immersive exploration, visible day/night transitions, rain that starts and stops with puddles/runoff, working audio after user gesture, and a verified auditable community economy. Report every incomplete requirement transparently.

---

# PRODUCT VISION

**Nature comes first. People bring the world to life.**

Telugu States by CSRGO is a living, explorable virtual interpretation of Telangana and Andhra Pradesh: authentic regional terrain, forests, hills, rivers, coastal agriculture and seasonal weather; a shared changing sky; real-scale virtual acres where Instagram residents have village-style homes; organic walking trails; and a transparent virtual economy in which verified Instagram likes contribute food, comments contribute currency and shares contribute gold. Communities grow gradually, funding appropriate bridges, wells, schools, health centers and lighting while protecting the landscape. The experience must remain welcoming, visually beautiful and navigable even when the community is small or engagement is low.
