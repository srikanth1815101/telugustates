# Telugu States Atlas · 7.14.0

## Run the map

In this directory (beside `hugo.toml`), run **Hugo 0.131.0**:

```sh
hugo server
```

Open **http://localhost:1313/**. No npm install, parent repository, remote tiles, map token or Android SDK is needed. To publish a static site, run `hugo --minify` and serve the resulting `public/` directory. Do not open `index.html` with a `file:` URL. The companion Android installer already contains the site and works offline.

## What is on the map?

**Production community roster across all 61 districts, 26 nature trails and 24 places.** All test/demo seed households have been cleared for launch; the live roster opens with the founding community household (`Srikanth` in Hyderabad, `v32-01`) and expands as followers join across Telangana and Andhra Pradesh. Search any recorded username, pick a plot or open `/houses/` for the directory. There is one public catalog; no review switch is needed. The map groups plots at low zoom, shows individual plots up close, and streams nearby houses, courtyards, mud paths, shared shade trees and physical signboards in 3D. A place pin opens its authored location; places are not duplicated in a scenic menu or a guide.

The three shared community resource totals are **food, currency and gold**. Adding a house does not mint currency. Real Instagram usernames are never stored in Markdown files, catalogs, URLs, or signboards: client search hashes the entered username one-way on the device to locate `content/houses/<id>.md`, and each physical 3D signboard displays only the resident's chosen house name or nickname. This release contains no private addresses, GPS feed, live weather feed or remote media player. Terrain follows the bundled geography; houses, vegetation, water depths and weather illustrate the virtual world.

## Try the new rooms and water

- **Pilgrim climb:** search **Tirumala** (or the new search icon beside Settings, My Home and My Acre) and stand before Sri Venkateswara Temple on the seventh hill at the surveyed 853 m. Then try the real ascent: **Alipiri** climbs the covered 3,550-step stairway past Gali Gopuram at 579 m, walks the forest shoulder and finishes up Mokalla Parvatham; **Srivari Mettu** is the shorter, steeper 2,388-step path above Srinivasa Mangapuram. Both trails follow the surveyed mountain — the same +800 m of climb as the real seven hills. See [Notes/tirupati-7hills/RESEARCH.md](../Notes/tirupati-7hills/RESEARCH.md) for every landmark and its measured height.
- **Village walk:** search **@telugustates.csrgo**. Enter its furnished room or choose either destination icon beside Settings. Walk between the home and its acre without leaving the 3D world.
- **River bend:** stand still at the starting rock. Follow one leaf or a patch of reflected sky past it; then look down at the earth beside your boots. In the **332 m** orbit, watch the water near both banks as well as the middle. A thin tongue of water runs along the low bank, covers the dirt, and slips away, often while the next patch is advancing. Pull back to **42 m** to see the stronger middle current. This is permanent river water; leave rain off to see it clearly. **Reservoir shallows** does not get that downstream motion. [Measurements and modelling limits](River-current.md).
- **Coastal strand:** walk down to where the wash reaches your boots. Look beyond the thin edge: the next green face rises, its crest picks up foam, and the ridge travels in from the bay. Then watch the sand. The slower return from 7.10 is unchanged. Wading, the wet sand and the water share a bed and clock. This is illustrative breaking surf and run-up, not a tide forecast.

## Village houses and agricultural acres

Search **@telugustates.csrgo** in Hyderabad. The search opens at the home, not the field. Follow the short courtyard path onto the veranda. Tap **Enter house** (keyboard **E**, standard controller **X / west face button**) at the front door. The leaf opens into a furnished ground-floor room. Walk and drag to look. Tap **Leave house**, press **E**, or walk back through the open doorway. The indoor view is first person; your outdoor camera preference returns when you leave. A saved walk inside reopens in the room. English and Telugu labels are included.

- Every house uses a local cut-and-fill terrace under the full footprint, including its veranda and wings. Its height balances the hillside and the approach from the street. Graded shoulders taper into natural ground, without flattening the whole acre. Boot contact, the visible foundation and the distant terrain use the same terrace faces.
- Select **My Acre → Walk there** for a marked route. Use the stick/WASD; the next turn and remaining path length follow your progress. **Teleport** opens the same acre at its walkable field entrance. Only the selected field is outlined. **My Home** also offers **Walk there** and **Teleport**, including in local orbit.
- All 12 archetypes have a usable primary ground-floor room; stair towers, upstairs, side wings and farm sheds are not additional rooms. These interiors are illustrative, not surveys or floor plans of real homes.

## Walk, swim and listen

- Pinch or scroll over the 2D map to zoom towards that point. Continue through the 3D overview to walking height; pull back to return. In orbit, one drag rotates/tilts, two fingers or Shift + drag pan. The camera-distance slider is continuous.
- On foot, use the movement stick or WASD and drag to look. Use Sprint/Shift to run; use Jump/Space while moving towards a rock. A tap jumps; holding adds lift. Reachable ledges can be pulled onto. Release movement to stand on the stone, then move across or off it. Cliffs above reach and solid walls still block movement.
- Walk into progressively deeper water to wade, then swim. Moving drives a forward stroke; let go to tread. Both travellers use the same actions retargeted to their own limbs. Foot placement and the return to walking follow the local bottom. In first person the traveller's body is not drawn.
- In Settings, the minimal-HUD icon hides **both** the minimap and the compact location block. The location-pin icon opens details even in minimal mode. The eye/person-camera and male/female buttons change the view and traveller. Choices stay on this device. In the world, a house name is painted on its board; it is not drawn again over the house or avatar.
- Sound starts after a tap or keypress. Rain, woodland/wind and water do **not** depend on footfalls. Shore and bird sounds use the camera's position and bearing. A covered spot filters the rain. Leaving the walk or suspending the app quiets playback. On an upgrade a saved mute or low volume is respected. For an audible baseline, open **Settings → Sound and music → Restore recommended mix**, choose **Heavy rain**, and stand still. On Android check the device's **media** volume and audio output, not its ringer. Rain is silent in Clear weather.

## Level water, moving legs and ungridded ground

At the **1.1 km orbit** the fitted shoreline now has a height independent of the bank DEM: a lake uses one fixed datum and a river has stations along its course. The boot-contact mesh, water surface and bank meet at that line. Distant relief uses a coarser version of the same stages. Dam operation, tides and measured bathymetry are not simulated.

In third person, press Jump while moving. Both rigs use a retargeted non-looping model performance: the knees fold, the feet extend for the strike, and the body compresses on contact. The motor supplies the trajectory; grounded leg support releases in flight. Wading, rock grips and swimming remain separate.

Full detail blends the five original surface photographs at irregular, rotated, map-fixed positions. The mobile dry-land shader uses a lighter photo blend. Smooth material weights replace the old single-tile choice in Saver. Far ground uses nonperiodic large-scale colour. On cliffs the material is sampled on the vertical planes as well as the ground plane, so a patch does not stretch into a column up the bank. Rain darkens the same surface; the small runoff network follows local downhill connections and drops are scattered afresh, not drawn in square rows.

## Rivers from a distance

Open **Escarpment walk** and pull back to **3.0 km** to follow the bend, or try the coves at **Reservoir shallows**. The shoreline is built separately from the spacing of the distant hills. Where the water meets land, both meshes use the same fitted edge; walking and swimming query those same faces. Narrow reaches are checked even when all four corners of a coarse cell are dry. Saver spends detail here instead of carrying a boot-sized grid into the distant orbit.

Beyond the walkable area, the horizon and regional relief use a filtered, one-acre water chart derived from the bundled lake/river classifications and river paths. A transition strip joins the two terrain resolutions. This preserves the shape on the survey; it does **not** extend the walkable or swimmable mesh into the horizon. Real inlets, headlands and sharp bends have not been rounded away. Widths without a mapped value and the local water depths remain illustrative.

## Rain and moving water

Open **Open meadow**, choose **Light rain** in the scenery menu and tilt the camera down. Follow one thread across the grass. Switch to **Rain**, then **Heavy rain** and give each setting about 45–60 seconds. New tributaries should appear and existing ones should widen; rain on a bare bank drains into the permanent water rather than stopping a strip short of it. Choose **Clear** or **Cloudy**: moving water disappears from the slope as soon as precipitation stops, even in the monsoon. A patch of soil can stay darker and an actual hollow can hold still water and gradually drain. Neither is drawn as a moving stream.

Water balance is kept on a moving, connected patch of land. Soil uptake and a thin retained film come first. Remaining water travels toward lower neighbours, can diverge at shallow divides, and combines at junctions. The water carried by **each branch** sets its cross-section. Dry heads and soaking tails taper to zero. The signed distance to all the active threads is combined before shading the original ground: there are no separate overlapping translucent strips. Standing water has its own level surface. It rises with stored volume and spills over the lowest available sill when the downstream head permits it. [Runoff model and research notes](Rainfall.md).

- **Reservoir shallows:** watch raindrops make expanding rings on otherwise quiet water. Swim slowly or stop to distinguish your own wake from the rain.
- **River bend:** stand still on the bank and watch a reflection or floating leaf pass the boulder. These are transported by the same current that carries the swimmer, not by wind or the rain controls. A quiet open reservoir has no drifting river parcels. Shallow boulders split the flow; foam and spray are placed at the intersection of the waterline and the rotated rock mesh.
- **Talakona waterfall:** walk up to the falling sheet and look at the spray where it meets the slope. Cascades are placed at mapped waterfall sites with a usable local drop. Neither their heights nor flow rates are surveyed measurements.
- **Coastal strand:** pick a fixed patch of sand. The leading edge takes roughly five seconds to cover it and roughly five to draw back in the example transect. Lake/river/sea motion and rain rings remain available in Battery Saver. Reduced motion softens surface glints and limits idle repaint frequency without changing the downstream direction or freezing the shoreline.
- On either traveller, rain darkens the fabric gradually, with drops on the head and sleeves. Wading wets the hem first; leaving rain or water lets the clothing dry. The everyday jump bends both knees under the hips, follows vertical speed through the apex and softens on landing. Rock grips and swimming remain separate actions.

## Add or edit content

Hugo builds `catalog.json` from the Markdown via `layouts/partials/catalog.html`. Search, district totals, the map layer and the world use the same data. There is no second user list, scenery JSON, allowlist or sample flag to edit. Save and reload the page after a rebuild to start a fresh scene. If you change the source, rebuild the APK to carry the change to Android.

### A new house

Create `content/houses/river_studio.md`:

```yaml
---
title: River studio
district_id: 17
archetype: round-thatch
wall_color: '#789798'
---
A note to display on the house page.
```

The lowercase filename supplies the handle unless `username` is specified. Use an explicit district. Keep the newly published handles, filenames, URLs and acre cells stable. Run **`node tools/settle.mjs`** (Node 20+ and Hugo on PATH), then rebuild Hugo. Commit the changed Markdown **and** `data/settlements.json` together; no network, package installation or backend is used. A production build refuses an unpinned record or conflicting coordinates.

- `cell` / `acreLocation` are the immutable integer southwest field corner. `homeLocation` is the fractional centre of the house; `villageId` is a stable settlement, **not** a district road bundle. Search and `/houses/<username>/` remain the same. `#/u/<username>` visits the home, `#/acre/<username>` visits the land, and the existing `#/plot/<username>` locates the acre on the paper map.
- The planner reserves growth space without vacant buildings, favours the occupied village where safe space remains, checks actual cut/fill terrain and permanent water, and joins new lane branches to existing stored vertices. Previously published doors, courtyards, field entries, common shade spots and path polylines do not move. The original fields remain whole; a walking right of way does not transfer ownership. Failures are reported, not solved by moving an old resident. See **[Village layout](Villages.md)** for coordinate conventions and measured checks.
- `archetype`, `size_m`, wall/roof colours, `props` and sign are the resident’s building design. The facing and depth of the front yard come from the fixed residential parcel. If changing the footprint, review the parcel and rerun geometry checks; do not move a neighbour to make it fit. A seed still determines furnishings. No profile lookup or private address is required.

### Other content

| Edit | Authoritative input | Result |
|---|---|---|
| Road/frontage and utilities | `content/roads/*.md` | `district_id` groups records. Each `paths` item has `type`, width `w` (metres), and `xy` control points. Owned `snap_ends: true` entrances join the door to the gate. The `network` block carries poles, wires and services. |
| Walking trail | `content/trails/*.md` | `id`, `points`, `width_m` and `surface` define the map trace and the walkable terrain tread. |
| Named place | `content/places/*.md` | Set page `title`; put `cell: [x,y]`, optional fractional `point`, `title_te`, `district` and heading `yaw` (radians) inside `place`. Defaults to the filename for `id` and the cell centre for `point`. Optional `bank`, `ground_view`, `mid_view` and `default_view` change framing. |
| District and suggested acres | `content/districts/*.md` | District metadata in front matter and rows `[x,y,elevation]` in the YAML body. These refer to the bundled geography, not newly drawn administrative boundaries. |
| Balances | `content/resources/{food,currency,gold}.md` | Set `balance`; all resource views use the same value. The house count is derived. |
| Interface copy | `content/languages/{en,te}.md` | Bilingual runtime dictionaries (JSON in the body). The homepage intro is in `content/_index.md`. |
| Seasonal clock, ecology and model assignments | `content/world/{calendar,ecology,models}.md` | YAML in the body, read by the simulator and the renderer. |

Grid coordinates are **[x,y] in fractional atlas cells**, not lat/lon. One cell has 63.615 m sides; +x east, +y north in the atlas projection. Supply two or more points per route. Keep authored paths clear of buildings, stones and the commons. `publication` and `sample_home` on historical data do not hide it. Pre-existing regional raster/vector geography lives under `static/frozen/`, `static/survey/` and `static/ecology/`.

## Optional local checks and credits

With Node 20+ and Hugo on the path (no npm dependencies):

```sh
node tools/check-content.mjs --tiles    # Public lookup, geometry inputs, pages, counts and 1,193 original terrain hashes
node tools/check-growth.mjs             # Two batches in a disposable copy; original pins and lanes cannot move
node tools/check-villages.mjs           # Every home, parcel, shareable junction and dry route
node tools/check-homes.mjs              # Full terraces, hollow rooms, four surveyed corners and synthetic rail jumps
node tools/check-motion.mjs             # Controller, rigs, camera and water/terrain regressions
node tools/check-stones.mjs             # Tap/held jumps, visible-mesh tops, crossing/off and a too-high negative control
node tools/check-swim.mjs               # Both rigs: forward reach, moving wrists, upright treading, return to land
node tools/check-stages.mjs             # Submitted surface levels and channel cross-sections
node tools/check-jump-cycle.mjs         # Tap/held jumps with both skinned rigs
node tools/check-banks.mjs              # Bank contour, seam, centreline and shared bed checks; verifies the distant-water pages
node tools/check-littoral.mjs           # Signed dry-side apron, wet/dry sweep, downstream tracks and a quiet reservoir
node tools/check-rain-state.mjs         # Automatic and manual showers, clear/cloudy intervals and retained dampness
node tools/check-runoff.mjs             # Same slope, three storms; sequential potholes, recession and water budget
node tools/check-water.mjs              # Stream while moving, grade/current, bed contacts, swells, fall, jump and wet cloth
node tools/check-scene-contact.mjs      # Slower: independent intersections for actual land, trees and boots
```

`static/library/CREDITS.html`, `static/library/sources.json`, `static/assets/LICENSES.json` and `static/frozen/credits.md` record providers, licences, changes and hashes. The stand/walk/run performances are retained. Swimming and treading use Quaternius's CC0 **Universal Animation Library, Standard**. Both travellers' everyday jump and recovery use Quaternius’ CC0 **Jump** from the Ultimate Animated Character Pack (`trail-vault` and `trail-recover`); the ledge grip is the separate Atlas `field-ledge`. `python3 tools/bake-model-jump.py` retargets the bundled sampled joint tracks; the optional `--extract DIR` accepts the converted Casual_Male.glb and Casual_Female.glb. Both sets of baked clips are already included. To rebake after editing them, install Python, NumPy and SciPy, then run `python3 tools/bake-traveller-actions.py /path/to/AnimationLibrary_Godot_Standard.glb` using the original Standard pack. Use the included recordings as-is for deployment. No runtime download is needed. `static/frozen/TILE-FORMAT.md` documents the lossless terrain transport.

The prebuilt coverage pages are under `static/survey/banks/`. You do not need to regenerate them when editing content. If you replace the underlying geography, `node tools/bake-survey-water.mjs` rebuilds the pages from the frozen acre tiles without external data or npm packages.

For the optional hydraulic rebuild, run `python3 tools/bake-water-stages.py /path/to/empty-scratch` (Python, NumPy, SciPy 1.12+, shapely 2, pyproj, rasterio and scikit-image; Node 20). This includes the vector and far-stage bake. The prepared data and its layout are in `static/hydraulics/`; the source-only tracks and clipped HydroLAKES geometries are not downloaded by the app.

For the offline Android wrapper and manual build, open the sibling [`Android/README.md`](../Android/README.md). The [build workflow](../.github/workflows/build-android.yml) is already in place. The [handover guide](../Notes/NEW-CHAT-SETUP.md) explains repository import. Do not commit the generated site, APKs or signing secrets to your source repository.

**7.14 distant current:** `static/current/` stores the bank coverage and signed east/south velocity; `node tools/bake-current.mjs` can rebuild it from the frozen inputs. `node tools/bake-survey-colours.mjs` regenerates the two pixel-equivalent overview colour charts. No request to an external map service is made. Pool levels, vector profiles, coastal surf and survey geometry are not replaced with a flat moving overlay.
