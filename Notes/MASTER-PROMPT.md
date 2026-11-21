# Telugu States by CSRGO — master prompt for continuing the project

**Starting point: the verified 7.14.0 field release · Android version code 71400.** This is a continuation brief for an existing project, not a request to generate a new game. It records the product idea, the decisions that changed it, the implementation that actually ships, and the tests that protect it. It does not assume access to the previous chat.

**Reading guide:** §1 is the instruction for the next chat; §§2–3 explain the idea and history; §§4–6 define the current world and superseded rules; §7 preserves the original roadmap; §§8–10 cover source files, safe changes, release checks and open work. In this workspace, [the chat handover](NEW-CHAT-SETUP.md) is for the owner, and [the milestone history](history/Milestone-evidence.md) contains selected first-party historical excerpts.

## 1. Your first job in the new chat

You are helping me continue **Telugu States by CSRGO**. Work from the repository, branch and commit I give you, or from the unpacked `Hugo-Project/`, `Android/`, `.github/` and `Notes/` folders in my workspace. **Start read-only.** Do not change code, allocate a household, update a balance, run the signing workflow, push anything or deploy a site just because you have read this prompt.

1. Confirm what you can actually read. If Git is available, report the branch and short commit ID; if you only have an uploaded snapshot, say so. A private repository URL by itself is not access. Ask for the files rather than guessing.
2. Read `Hugo-Project/README.md`, `Hugo-Project/Villages.md`, `Hugo-Project/River-current.md`, `Hugo-Project/Rainfall.md`, `Android/README.md`, `Android/Verification.md`, `Android/Checks/Measurements.json` and `.github/workflows/build-android.yml`. Inspect `Android/AndroidManifest.xml`, the roster and the settlement register. Read applicable repository instructions if present. Do **not** assume an old `AGENTS.md`, `site/`, `scripts/check_plots.py` or the original GIS checkout is included or required.
3. Give me a short **baseline receipt**: version, project roots, household/village/district counts, what search and the two destination buttons do, what the Android workflow does, and what has *not* been tested on a handset. Distinguish previous release evidence from tests you personally ran in this chat.
4. If I supplied a next task, relate it to the relevant files and propose a small testable change. Otherwise ask **“What would you like to change first?”** Do not choose an old roadmap item on my behalf.

**If sources disagree:** my latest explicit decision governs what I want; the connected source and the matching release evidence govern what exists. Report discrepancies, especially if the repo is newer or older than 7.14. Never reset a newer checkout to match this prompt. The original v6/v7 brief is preserved unchanged at [`Notes/history/Telugu_States_CSRGO_Master_Prompt_v7_Combined.md`](history/Telugu_States_CSRGO_Master_Prompt_v7_Combined.md). It is the record of the full original ambition, **not an instruction to undo later decisions**.

## 2. What we are making

A mobile-first, bilingual **English / తెలుగు** atlas and walking world for **Telangana and Andhra Pradesh**. A visitor can start on a flat regional map, find a place, zoom into the landscape, walk, swim, enter a village home, and find that household’s farmland. Someone who knows a resident’s Instagram handle should be able to go straight to the right porch and share that location. The experience must also be worth exploring where no one lives.

- **Identity:** Telugu States by CSRGO; intended web identity `telugustates.csrgo.com`, Instagram `@telugustates.csrgo`. These are project references, not evidence that DNS is configured, a website is deployed or any account is connected. The offline app is called Telugu States Atlas.
- **Nature first, community second.** Let the coast, delta, forest, rocky Telangana hills and drier interior feel different. Villages should look inhabited, regionally plausible and walkable, not like houses evenly stamped onto a farm grid. New community development should grow locally without rearranging the existing world.
- **Real geographic base; illustrative life on top.** Boundaries, source elevations, land cover and mapped water have provenance. Houses, occupants, trails, individual trees/animals, crops, weather, water depths, flow speeds and construction are virtual. Do not describe generated scenes as photographic replicas, a property register, a flood prediction or a live weather service.
- **Vocabulary matters.** A *house* is the building in a residential courtyard. A *village* is a cluster of homes on a reserved residential square. An *acre* assigned to a household is a **separate agricultural field** outside that square. A *district* is an actual geographic division; it can have no published households. A handle or an acre in this atlas grants no legal title, financial value or proof of identity.

## 3. How we got here — the decisions, in order

| Stage | Problem, decision and consequence |
|---|---|
| Geographic foundation | Freeze the two states, actual administrative polygons, projected acre grid, relief, water, tree cover and mining exclusions. Match district identities to the official directory rather than invent missing district splits. Package local tiles instead of making the visitor fetch a basemap. Separate the geographic cells, buildable cells, allocated holdings and real people; they are not interchangeable counts. |
| First resident atlas | One editable Markdown record per handle; deterministic acreage; plot corners, searchable names, permanent house pages, map locator, English/Telugu and a 3D visit. The first 300 test records were fictional. “Nearest plot to district centre” conflicted with efficient connected access. The approved historical solution kept district centres and favoured safe frontage before distance; it did not move the district geography. **Do not rerun that migration or render its reserved rows as roads.** |
| Landscape and early Android walking builds | Replace generic terrain and repetitive placeholders with evidence-based regional scenery, local licensed field models, skinned travellers, wildlife and material variation. Phone feedback exposed camera clipping, floating feet/trees, discontinuous terrain, touch conflicts and rocks that did not support the player. Judge the view at the reported location, zoom and orientation; make movement and collision agree with what is drawn. |
| Original v6/v7 and integrated 7.0 review | The A–O programme brought together controls, homes, lighting, weather, sound, nature, map/search, trails, world calendar, economy, counters, performance and release QA. An earlier development tree exercised ledger replay and funded development with **private fixtures**. Its 300 test houses, hypothetical funds, old directory layout and old deployment scripts are not the current public state or repo requirements. |
| 7.1 · phone-led nature walk | Return to a map-led entry; zoom where the user points; keep a fixed movement stick, explicit sprint, clean controls, real contacts, local recorded foley, and saved position/camera. Remove park-like decoration, arbitrary landscape-wide farm blocks and duplicate UI. Three isolated sample acres were a temporary policy, later replaced. |
| 7.2–7.3 · portable, editable distribution | Split the handoff into a standalone Hugo source tree and a separate offline Android wrapper/manual workflow. Prove that editing Markdown changes the real scene and rebuilt APK, not just a web card. Move from a sample/review split to **one published catalogue**. Keep physical nameboards, local-orbit navigation, positional sound while stationary, forward swimming versus idle treading, and support on actual rocks. |
| 7.4 | Make rain/runoff travel with the walk across streaming boundaries. Give reservoirs, flowing rivers, the open coast and the mapped Talakona fall different behaviours. Wet clothes, footsteps, jumping and swimming should change appropriately. |
| 7.5–7.6 | Jagged banks at kilometre range were a geometry problem, not a wave-texture problem. Fit land and water to a shared edge; preserve narrow channels and distant coverage. Give standing basins one water level and rivers a descending profile. Correct the moving jump on both rigs and break up repeated ground texture without changing the frozen terrain. |
| 7.7–7.8 | Replace floating house platforms with cut-and-fill terraces; build actual door openings, doors, supported thresholds and furnished ground-floor rooms. Same-style houses need not have the same interior; revisiting the same one must be consistent. Integrate downstream parcels and actual wet–dry beach run-up against the bed. |
| 7.9–7.10 | Rain intensity changes the **width and connectivity** of runoff, not just its colour. Hollows store water, then spill to a lower receiver. Moving land streams stop on the first dry frame; damp soil and stored puddles can remain and drain. Slow the beach’s retreat rather than snapping the wet edge back. Keep permanent river motion independent of rain. |
| 7.11–7.12 | Use travelling folds and reflections instead of a stationary repeated river pattern. Give sea waves a raised shoreward crest distinct from shoreline wash. Increase the legibility of flowing reaches, slow and turn their shallow margins, and let low bank patches cover and clear while nearby patches do something different. Use rock, bank, reservoir and sea controls. Regional research informed the tuning; it did not measure the game’s bend. |
| 7.13 | Separate home and field. This release still preserved the 300 former handles and agricultural cells, forming 63 occupied hamlets. Add walkable routes, corner stones, distinct destinations and room/ground checks. Its old “preserve all 300” instruction was correct **for 7.13 only**. |
| **7.14 · current baseline** | The owner explicitly chose to **remove the old houses** rather than squeeze them into new squares. Select ten districts, five per state, seed 10–15 households per selected district, leave growth room, and use shared lanes out to separate fields. No old owner records or test joins in the new catalogue. Put Home and My Acre next to Settings, with a walk/teleport choice even in local orbit. Address the **332 m river** and **21 m village** feedback at those distances, not just in a close-up. |

## 4. The 7.14 world: protect this state

**133 fictional households and house pages; 133 distinct agricultural acres; 10 villages; 61 geographic districts; 24 trails; 13 authored places.** There are 28 Andhra Pradesh and 33 Telangana districts in this geographic edition. The other 51 districts remain explorable without seed households. Five districts per state were selected with fixed seed `0x714cc`; do not randomize them again during build. The requested seed range was 10–15; the actual counts are 11–15.

| District | State | Occupied homes | Residential acres | Planned home capacity |
|---|---|---:|---:|---:|
| Markapuram | AP | 13 | 9 | 27 |
| Palnadu | AP | 14 | 9 | 25 |
| Sri Potti Sriramulu Nellore | AP | 13 | 16 | 31 |
| West Godavari | AP | 14 | 16 | 34 |
| Y.S.R. Kadapa | AP | 11 | 9 | 29 |
| Mahabubnagar | TG | 11 | 16 | 31 |
| Mancherial | TG | 12 | 16 | 32 |
| Medak | TG | 15 | 16 | 34 |
| Mulugu | TG | 15 | 16 | 33 |
| Vikarabad | TG | 15 | 9 | 22 |
| **Total** | | **133** | **132** | **298** |

**Layout rules.** Four villages use a **3 × 3 block of acre cells = 9 residential acres**; six use **4 × 4 = 16 acres**. That is land for the *whole village*, not nine or sixteen acres per house. Each family has a modest rotated courtyard **inside** the square and one whole buildable field **outside** it. Reserve space first; do not draw fake vacant homes. A common and shade spot are independent of house sites. Short frontage paths meet a bending street and shared lanes at real junctions. Farm tracks run along holding boundaries, with a short entry into the owner’s own field. No tan ribbons floating above the terrain, paved highways, compulsory field fences, or roads through a neighbour’s crop. Four stones mark a field; deduplicate shared corners. Outline only the selected holding.

**Measured, not design guesses.** Published yards span 186.92–274.81 m². Nearest house centres are 23.39–34.23 m apart; nominal nearest wall gaps 9.86–22.48 m. Home-to-field *centre* distance is 119.53–343.20 m (median 198.99); the actual *gate-to-field route* is 157.10–511.30 m (median 260.19). Do not “fix” a valid walking distance by moving a pin to match a straight-line figure. The network has 3,020 distinct segments and about 4,264 m of shared boundary tread. 133 safe porches/routes passed 10,735 dry path samples. Twelve new joins in two disposable batches preserved old pins and path prefixes. A separate disposable 165-join stress test reached all 298 sites in the **same ten squares**. None of the extra households ship; this is not a guarantee that arbitrary future building dimensions will fit.

**Worked example for any future agent.** `@palnadu_demo01` belongs to `v17-01`. Its `homeLocation` is `[5015.1935128,6523.3717638]`; its porch is `[5015.3947358,6523.3560013]`; its field cell is `[5016,6521]`. These are projected grid coordinates, not latitude/longitude. The observed walking-controller replay travelled **199.18 m, 58/58 waypoints, dry, no blocked moves**. `@medak_demo08` is another valid example. `@demo_user20` is a deliberately **retired** negative control; do not restore it to pass an old test.

## 5. User experience and simulation contracts

### Map, search, home and land

- Start on the lightweight regional map. Pan/pinch at the selected geography, enter a continuous local orbit and descend to walking height. On return or resume, preserve the relevant virtual position and camera; explicit new deep links take precedence over unrelated saved state. Provide the bilingual 2D fallback if WebGL2 is unavailable. No phone GPS needed.
- Search a bare handle, `@handle` or a normal Instagram profile URL using the **local published records**. Normalize case; never call Instagram to invent an owner. Unknown names get a helpful not-found result. `/houses/` lists the publication; `/houses/<handle>/` is its permanent page. `#/u/<handle>` goes to the safe home porch; `#/acre/<handle>` to the field; `#/plot/<handle>` locates that field on the paper map.
- **Settings · Home · My Acre** are available in the local 3D view. Each destination card shows a north-up plan and offers **Walk there** or **Teleport**. Walking supplies a next junction and remaining distance; it does *not* secretly move the player. Teleport lands at the named porch or a walkable point just inside the named field. A scenic visit without an active resident has a household picker. The local routes are not statewide pedestrian directions.
- Keep the reference’s clean green/cream map-and-search composition, local place pins and physical house nameboards. Do not duplicate scenic places in extra menus, or plaster floating handles, debug counters, fabricated temperatures or permanent surface labels over the view. Minimal HUD hides the minimap and compact location block together while retaining access to details. Provide usable labels in English and Telugu, safe-area spacing, readable contrast, reduced motion/flashing and portrait/landscape controls.

### Traveller, houses and sound

- Fixed touch stick plus independent look, jump and sprint inputs; do not turn every full stick deflection into a sprint. Keep keyboard equivalents, orbit/pan/pinch/wheel controls, first/third-person selection, both travellers, and remembered preferences. Keep the body in frame at high pitch; do not put the camera through terrain, water, roofs, rocks or trunks. These are things to test, not guarantees about every device.
- The walking motor, visible surface, camera collision, bank, terrace, rock top, door and threshold must agree in metres. Keep tap/held moving jumps, ledge grips, dry → wade → forward swim → idle tread → dry, and water/soil-specific feedback. Do not fix an obstacle by disabling collision or clipping the avatar through it. The release uses locally bundled rigs and retargeted performances, not a static character translated over the ground.
- Keep all **12 house archetypes**: mud veranda, pillared tile, thatched longhouse, round thatch, RCC tank, balcony/stair, L-court, sheet lean-to, cattle compound, stone gable, street shop, courtyard house. Fit the *whole* house to a local terrace. All 133 have deterministic, usable ground-floor rooms; there are 11 activity layouts. Two households can occupy one geographic grid cell and still have separate doors/rooms. Enter/leave with the context action or **E**; restore the outdoor camera on exit. Do not promise that every roof, upstairs or farm shed is an explorable room.
- Sound unlocks after a gesture. Keep separate music, ambience, effects and weather under a master mix. Footfalls follow the surface; ambient sound and rain must remain audible when standing still if the chosen mix permits. Centre the score, position shoreline/bird audio relative to the listener, filter rain under cover, and quiet playback on background/pause. Honour saved mute/volume. Test output after gain/panning as well as file presence; do not claim phone speaker quality from a browser signal measurement.

### Land, weather and different kinds of water

| System | Behaviour to retain | A useful test or counterexample |
|---|---|---|
| Regional nature | Use cover, coast distance, soil, slope, elevation, moisture and seasonal evidence. Delta palms/paddy and dry scrub should not look like the same savanna. Do not scatter arbitrary farm blocks over wilderness. Eligible assigned fields may show simulated preparation, planting, growth, maturity, harvest or fallow; keep paths open. No species or crop census claims. | Compare Delta grassland, Granite tors, Canopy trail and Dry scrub. Check roots/boots against rendered triangles and collision against the rotated model, not only its centre. |
| Time and weather | Shared **4-real-hour visual day**, 2 h/6 h options, live clock and lighting/manual overrides; **28-real-day simulated year**. The published calendar defines epoch, seed and `Asia/Kolkata`. Region/season affect simulated weather, sky and lighting. Light rain, Rain and Heavy rain must work as manual choices. Label world time versus local time. | Two clients at the same instant should agree absent overrides. Winter may be manually rainy; monsoon may be clear. Simulated time never debits real-day food. |
| Rain on land | Rain feeds a bounded moving terrain window: infiltration and surface storage first; downhill branches split/join and widen with discharge; hollows fill to their lip, spill and slowly recede. A thicker painted stripe is not a hydrologic change. | Open meadow on the same slope under three intensities. Switch to Clear or Cloudy: **moving land runoff stops on the first dry frame**, while damp ground or a filled hollow may remain. |
| Permanent inland water | Quiet standing basins have a level datum; running reaches have downstream head/velocity and fitted wet edges. The bed, shoreline, boot/wading contact and visible mesh must agree across detail levels. Keep narrow rivers at distant orbit. | Reservoir shallows is a **negative control** for river drift, not a static texture test for all weather. Check the 1.1 km level basin and kilometre-scale fitted banks as well as the close view. |
| River surface and low bank | Carry visible patterns and parcels downstream across the reach, not just near the camera. Shallow margins slow and turn; patches of low bank cover, darken and clear. Travelling wave crests are not the swimmer’s drift speed. The 326 precomputed flow pages preserve the prior bank coverage; prioritize a visible first chunk while its neighbours stream. | At River bend use Clear, a fixed boulder, the on-foot view, the old **42 m** view and the reported **332 m** orbit. Measure actual colour changes near both screen edges and in the interior, not only a vector map or changing uniform. |
| Sea and falls | Show a raised shoreward wave, break, shallow run-up and a gradual drawdown; do not apply that ocean law to inland water. Falls require a mapped site with a plausible drop, not a random steep hill. | Coastal strand: observe fixed sand alternately covered and exposed. Talakona: check feeder, falling sheet and plunge. Neither wave height nor waterfall discharge is a surveyed prediction. |

## 6. Decisions that the old master must not overwrite

| Earlier idea or prototype | Governing decision now |
|---|---|
| Hide demos in production, or expose only three sample houses behind a mode switch | **One normal catalogue** of all published house records, including the current 133 clearly fictional/demo records. “Houses” is a publication count, not verified Instagram followers, approved residents, funded projects or real homes. Keep actual classification and consent distinct. |
| Each house stands inside its own farm acre; rails around whole acres; Home instantly jumps | The home and agricultural acre are **different pins**. Residential squares, open shared field boundaries, four stones, two explicit destination actions. No silently relocated records. |
| Wide roads, regular street reservations as visible roads, poles on every route | Narrow organic footpaths and shared agricultural boundaries. Internal historical grid metadata is not a rendering instruction. Utility hardware belongs only on appropriate, authorised developed village corridors, never on wilderness trails merely for decoration. Emissive windows do not prove electrical service. |
| Large CTAs, multiple scenic lists, floating labels or a game dashboard over the walk | Map/search/place pins and physical wayfinding first; details on demand. The newer top-row destination controls are intentional. Do not recreate old mockups at the expense of the working phone walk. |
| Old Python prep tree, separate approved/demo JSON stores, production Pages automation | The delivered **standalone Hugo project** generates its catalogue; the Android wrapper consumes a fresh render. The supplied action is **manual APK build only**. Do not invent an extra source tree, review gate or deployment workflow. |
| Fully automatic Instagram economy implied by the concept | Current balances are authored in Markdown: **food 0, currency 0, gold 0**; fourth counter **houses 133**. No live social API, real campaign, automatic debit, or funded project is established by this release. Adding a household does not mint resources. |

## 7. Original ideas worth retaining, without claiming they all shipped

Use the original A–O brief for details if work on a corresponding feature is requested. Treat its numerical targets, mockups and filenames as historical where the current implementation differs.

- **A, B:** accessible simultaneous controls, avatar framing, clean HUD; regionally appropriate homes, trail access and eventual funded electrical service. Original targets included ≥48 px touch targets and a low-overlap HUD. The later fixed-stick, real rooms and village/field decisions take precedence over early sketches.
- **C, D, K:** shared changing sky, season and regional weather; navigable nights, appropriate house lighting, rain that starts *and stops*, retained puddles and downhill runoff. Keep the accelerated visual clock separate from civil time and accounting.
- **E, F, H:** locally licensed music/foley, regional flora and wildlife, a nature-first world before settlement. The older ambition included 4–6 themed instrumental loops, surface-specific footsteps, subdued storm sounds, crop suitability and a geotagged visual gallery. Do not claim a particular track count, species identification or gallery exists without inspecting the connected build.
- **G, I, J:** clear bilingual copy, privacy/credits, map-to-immersive-to-map continuity, safe search arrivals, good scenic starting places, natural exploration routes independent of households, local village evolution rather than statewide instant development.
- **L, M — if I commission the fuller economy:** verified new likes → food, comments → currency, verified shares → gold. Default illustrative conversion is 1:1 per new verified engagement. Manual verification or authorised build-time import only; unknown shares are unavailable and earn zero. No scraping private endpoints, credentials in the app, fabricated interactions, double-crediting a cumulative snapshot or rewarding spam. Maintain one auditable shared treasury for the two states unless evidence and owner direction support a split.
- **Accounting design, not a running 7.14 service:** dated approved campaign snapshots, append-only transactions, monotonic processing/high-water marks, explicit correction entries, replayable balances, no duplicate daily closes or overspending. Proposed default: **1 food per occupied eligible residential household per real calendar day**, once in the canonical zone, not once per four-hour day and not an automatic charge to these demo homes. No division by zero, loss of houses or denial of access when funds run out. “Drought” also requires environmental dryness, otherwise say “Food shortage.” Gold conversion is explicit (original proposal 1 gold : 10 currency); wells, paths, bridges, lamps, schools and health centres require sufficient verified balance and an inhabited, suitable site. All costs/thresholds are proposals until approved. Before production, model 0/10/100/1,000/10,000 occupied homes over 30 real days. If restoring historical ledger tools, **ask first** and reconcile with the current Markdown balance contract. Never insert pretend transactions to demonstrate a UI.
- **N, O:** static delivery, streamed chunks and bounded memory, quality tiers, regional and mobile regression tests, accessibility, licence register, actual screenshots and frame measurements. The original *added-asset* target was ≤35 MB across that work (models ≤8 MB, audio ≤15 MB, other ≤12 MB), **not** a 35 MB cap on the entire installer including the pre-existing geography. Measure each new change against its actual base, report positive added bytes and net compressed APK change, and ask before exceeding an agreed budget.

## 8. Repo map: edit the source that actually owns the value

Paths are relative to the repository root. The source folders are **already side by side**; nothing needs to be unpacked. `Notes/MASTER-PROMPT.md`, `Notes/NEW-CHAT-SETUP.md` and `Notes/history/` are handoff documents, not runtime imports.

```text
repo-root/
  Notes/
    START-HERE.md   MASTER-PROMPT.md   NEW-CHAT-SETUP.md   history/
  .gitignore
  .github/workflows/build-android.yml
  Hugo-Project/
    hugo.toml   README.md   Villages.md   Rainfall.md   River-current.md
    content/{houses,districts,roads,trails,places,resources,languages,world}/
    data/settlements.json
    layouts/   static/   tools/
  Android/
    AndroidManifest.xml   README.md   Verification.md   Checks/
    build_apk.py   verify_web.py   src/   res/   console/
```

| Where to look | What it owns / what not to duplicate |
|---|---|
| `Hugo-Project/content/houses/<handle>.md` + `data/settlements.json` inside that project | The authored record (username, classification, district, building, note) and the durable village survey (square, occupied site, gate, porch, field entrance, hub, shade and lane vertices). `cell`/`acreLocation` = integer southwest field corner; `homeLocation` = fractional house centre; `villageId` = actual village, not the district road ID. |
| `Hugo-Project/layouts/partials/catalog.html`, `layouts/index.catalog.json`, `static/js/catalog.js`, `grid.js` | Hugo emits `catalog.json`; the client derives search shards, scene records, district views and locations from it. Some `get('data/search/…')` and `living/public/…` paths are **logical views**, not files to upload. A bare virtual shard URL returning 404 is not a valid search regression test. Do not hand-edit generated JSON or keep a second owner list. |
| `content/districts/`, `roads/`, `trails/`, `places/` under `Hugo-Project/` | District metadata/available cell inputs, authored paths and utility records, independent exploration trails, and editable named map stops with optional safe viewpoints. The appended village network lives in the settlement register. Public map, pages, lookup and world must agree. |
| `content/resources/{food,currency,gold}.md`, `content/languages/{en,te}.md`, `content/world/{calendar,ecology,models}.md` | Authoritative balances, bilingual message dictionaries, regional settings, time configuration and model assignments. Preserve keys/placeholders in both languages. There is no second live Treasury API. |
| `static/data/atlas.json`, `static/frozen/`, `static/ecology/`, `static/survey/`, `static/hydraulics/`, `static/current/` | Grid parameters, lossless original terrain observations, ecological inputs, overview, water levels and velocities. `static/js/` streams these; ordinary house/content edits must **not** trigger a geographic rebake or quality-reducing resample. |
| `static/js/` under `Hugo-Project/` | Map/walk: `public-home.js`, `map.js`, `world.js`, `touch-walk.js`, `walk-motor.js`, `walk-camera.js`, `position-book.js`. Homes/lanes: `resident-design.js`, `home-volume.js`, `room-layout.js`, `house-ground.js`, `hamlet-route.js`, `lane-soil.js`. Land/water: `terrain.js`, `bank-mesh.js`, `hydraulic-stage.js`, `current-page.js`, `hydro-shaders.js`, `river-margin.js`, `rain-ground.js`, `dry-mobile.js`. Inspect callers before changing shared units or contact logic. |
| `Android/src/com/csrgo/telugustates/fieldtest/`, `Android/build_apk.py`, `.github/workflows/build-android.yml` | Local WebView host and asset routing, fresh Hugo render, Java/resources/DEX packaging, alignment, signing, verification. There is no separate Android copy of the world to edit and no need for Gradle, Maven, a running server or an npm dependency install for the standard build. |
| `Android/Verification.md`, `Android/Checks/` | The **7.14-specific** evidence: machine-readable measurements, `Village-homes-and-their-fields.jpg`, `My-acre-in-Telugu.png`, `River-at-332m.mp4`. These are QA evidence, not required APK assets. Read the methodology, not just the headline numbers. |

### Geographic and licensing rules

- The snapshot uses **ESRI:102028**, WGS84, a fixed southwest origin, 256 × 256-cell tiles and **63.615 m** per cell side (4,046.87 m² per virtual acre). +x is east and +y north on the projected grid; do not mix grid, world-Z, metres or lat/lon. Source height is distinct from visual relief exaggeration.
- The freeze has **1,193 tiles**, 67,989,460 in-state cell centres and 61,414,158 terrain-eligible cells. These are **not** the number of published holdings, the ten villages’ capacity, or real property available. Respect exclusion masks for water, mines, edge cells and unsuitable slopes. The 7.14 change did not redraw the district geography.
- LGD identifies districts; OSM supplies matched administrative geometry, Telugu names and mapped rivers/mining features; Copernicus GLO-30 supplies terrain; ESA WorldCover supplies cover/water; HydroLAKES supplies lake inputs. Ecology also uses regional climate/soil/lithology/coast sources. Older polygon sets that lacked districts were not silently patched; HydroRIVERS was not redistributed, and GADM is not the production source. Never import household addresses or represent a generated lane as a real street.
- Keep all source-specific attribution, derivative notices, licences and hashes: `static/frozen/credits.md`, `static/frozen/SOURCES.json`, `static/ecology/sources.json`, `static/library/CREDITS.html`, `static/library/sources.json`, `static/assets/LICENSES.json` (all under `Hugo-Project/`). New third-party creative media: CC0 or CC-BY with documented redistribution rights and attribution. This does **not** relicense existing geographic databases, software or fonts as CC0. Bundle assets and fonts locally; no runtime CDN, remote tiles or paid API keys.

## 9. Process for future changes and releases

**On a normal content edit:** keep one Markdown file per household. For a *new* owner, give a unique handle and an explicit district; run `node tools/settle.mjs` **inside `Hugo-Project/`**. Review and commit the changed Markdown and `data/settlements.json` together. It is an authoring action, not a routine startup command. If a lot/acre is unavailable, report the conflict; never shift an existing family to make a test pass. Keep old path IDs/vertex prefixes, door/field pins, shade and square stable. No test households or balances in the release. The 7.14 reset was a one-time explicit exception, not a general permission to reset.

**Run locally.** Hugo **0.131.0**, Node **20+** for checks, Python **3.11+** for Android packaging. From the common repo root:

```sh
# Preview the editable project; no Android setup or npm install required.
hugo server --source Hugo-Project
# Build the static publication (generated output is ignored by Git).
hugo --source Hugo-Project --minify
# Core baseline checks; run only with the required tools available.
node Hugo-Project/tools/check-content.mjs --tiles
node Hugo-Project/tools/check-villages.mjs
node Hugo-Project/tools/check-growth.mjs
node Hugo-Project/tools/check-homes.mjs
node Hugo-Project/tools/check-current-pages.mjs
```

For a release, use the **full preflight in the checked-in workflow**, not only these five commands. Its additional checks include `check-motion`, `check-stones`, `check-swim`, `check-river-margin`, `check-banks`, `check-stages`, `check-jump-cycle`, `check-rain-state`, `check-runoff`, `check-water`, `check-littoral` and `check-scene-contact` (all `.mjs` under `Hugo-Project/tools/`). Never report a test as passed because you merely found the script. A read-only connector may not provide a checkout capable of running it.

**Android:** `com.csrgo.telugustates.fieldtest`; 7.14.0 / 71400; min API 26 (Android 8), target 35, v2/v3 signed, no requested permissions. The hardware-accelerated WebView serves bundled files from its local HTTPS asset origin; there is a map fallback. A user-initiated external link/share is different from a runtime dependency. No INTERNET/location/storage permission is needed for the atlas. Do not replace this with a WebView pointing at a live website.

For a separately authorised Android build, use `Android/README.md`, JDK 11 or 17, Android SDK Platform 35 + Build Tools 35.0.0. The checked-in **Build offline atlas APK** action uses manual `workflow_dispatch`, read-only repository permissions and a one-day artifact. It does **not** deploy Pages, publish an app, or write back to the repo. Secret names are `ATLAS_KEYSTORE_B64` and `ATLAS_SIGN_PASS`; optional **variable** `ATLAS_KEY_ALIAS` defaults to `atlas-field`. The owner supplies secrets privately through the hosting service if they choose to build. **Do not request keys, passwords or tokens in chat.** The private signing key is not in this workspace and cannot be recovered from a certificate fingerprint. A different signer cannot be an in-place update to this APK. Do not tell someone to uninstall and lose their data as a workaround.

**Release discipline:** make the smallest scoped change; use a branch/PR if authorised. Keep a recoverable baseline. Test from a clean render/extraction, then exercise the actual signed app assets, not a stale dev server. Compare every embedded web file and every uncompressed rebuilt APK entry; timestamps/signatures can change the outer APK hash. For the working handover, keep the folders unpacked: `Hugo-Project/` for the editable web source, `Android/` for the wrapper, installer and verification, `.github/workflows/` for the manual build, and `Notes/` for continuity. The two ZIPs identified below were the original release packaging; do not require them to use this workspace. Keep binary installers, outer ZIPs, generated `public/`, keystores and credentials out of source control. Do not push, merge, dispatch a workflow, publish a release, configure DNS or deploy without my direction.

## 10. Acceptance baseline, limits and next work

**The two screenshot distances are regression fixtures.** Measurements below are short still-camera runs from signed APK assets, Chromium 156 / SwiftShader **software WebGL2**, 390 × 844 touch viewport, actual 203 × 441 raster, Low + Battery Saver, reduced motion, clear winter day. They are **not** measurements from an Android GPU. The village comparison is at the same distance/settings but not the same settlement: 17 drawn homes in 7.13 versus 14 in Palnadu in 7.14.

| Scene | Game renders/s, 7.13 → 7.14 | First local draw, old → new | Nine-chunk ready, old → new | p95 frame interval, old → new |
|---|---:|---:|---:|---:|
| River bend, 332 m | 3.16 → **15.43** | 7.67 → **5.88 s** | 9.16 → **8.25 s** | 352.6 → **71.8 ms** |
| Village, 21 m | 1.81 → **9.75** | 9.55 → **3.85 s** | 10.11 → **5.57 s** | 590.1 → **151.0 ms** |

- **Motion is not just a vector field.** At 332 m, actual fixed-camera rendering changed 98.81% of the sampled water pixels and 95.86% of the 2–10 px wet margin by ≥7/255 over 4.75 s. In a separate stepped-time normal-colour tracking test, 99.65% of the whole-reach tracks and 98.67% of near-edge tracks had a downstream component. In a separate cold-navigation capture, the first two submitted water frames already differed while the wider patch was loading. Do **not** translate this into “instant startup,” a measured real river speed, or guaranteed motion in every pixel on every phone. Use the timed film, fixed camera and quiet-reservoir/active-coast controls.
- **Build evidence:** 4,750 embedded web files and 2,132 local links verified; original decoded hashes matched for 1,193 terrain tiles. A local independent execution of the manual workflow’s preflight and build/sign steps reproduced all **4,756 uncompressed APK entries**. That is not a hosted Actions run or a physical install.
- **Still open:** the software tests did not reach the 30 FPS phone objective. Cold-start main-thread stalls around 1.2–1.4 s remained in the two samples. Physical-device install/update, sustained walking FPS/p95, heat/battery, Android cutouts/back/audio, touch comfort and native Telugu wording need actual device or speaker review. Public domain deployment, operator onboarding, live verified engagement and store distribution are not established by these release files.
- **Recommended next evidence, if I want performance work:** record phone model, Android/System WebView version, orientation, quality/saver, cold versus warm start, camera range, scene and exact action. Compare a still and a moving walk; keep player, clock, season and camera matched when measuring a rendering change. Time first visible local water/terrain separately from ready; retain median, p95, worst stall and draw/triangle counts. A still screenshot, a `requestAnimationFrame` callback count or a shader clock alone is not a passing performance/motion test.

### Original delivery fingerprints (historical packaging; the workspace is unpacked)

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `01-Hugo-Project.zip` | 61,193,009 | `3dd2ddbce363eed97d73227486c8c9aca645295a6b2fe56fd099ed5b652756ec` |
| `02-Android-Workflow-and-APK.zip` | 60,112,476 | `87da56ab67a2bbbd08b5c5ce94cb435d41fa3bdc80c74506a0aaa8d61ac4f68a` |
| `Android/Telugu-States-Atlas.apk` (unchanged installer) | 60,496,810 | `5fac6087dda197e49a4f29991a6c60de95402dbcb997f646d5cfd1a8df166b5e` |

APK growth over 7.13 was **6,674,692 bytes**. Positive-only embedded asset growth was 7,779,085 bytes, including 6,663,503 bytes of compressed current pages. The signer certificate SHA-256 is `3962f6574ff35e591c1d8da315e89de04071cfb462a07b47435b2f528be04b8c`. These identify previous test evidence, not a new build or a Git commit. If the owner supplies only the extracted source, the intentionally ignored installer need not be present.

**When handing work back to me:** say what changed and why, which original behaviour was protected, what I can try by handle/place, exactly what ran against which artifact, and what did not run. Include the actual paths or downloadable deliverables. Do not declare the entire historical master complete on the strength of one release or one test. If the next task has not been specified, stop after the baseline receipt.
