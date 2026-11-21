# Earlier decisions — selected evidence

This is an archive, **not current build instructions**. It preserves short excerpts from the project’s own reports to explain why the later choices were made. Counts, gates, example names and folder paths in these quotations belong to the named edition. Do not resurrect them in 7.14. These are documented decisions and observations, not a word-for-word transcript of every conversation.

Current authority: `../../MASTER-PROMPT.md`, `../../Hugo-Project/Villages.md`, `../../Android/Verification.md`, and the matching repository commit. The companion historical v6/v7 brief is the unmodified owner-supplied file, SHA-256 `a444c0776314859f2a53d76318dd2bc31529793216b74078c3acf13bc28d5f4e`.

## The original two-state geographic freeze

From **build report · Sources and licence decisions / frozen defaults** (historical):

> One shared southwest origin of the projected two-state bounding box: X0 = −5,451,447.126942766 m, Y0 = 2,709,891.1363760256 m. Index each axis with `floor((coordinate − origin) / 63.615)`.

> No GADM. No real cities, roads, or buildings were imported into the product. The date-stamped PBF naturally contains other features during intake; the selection code discards them. Source-specific attribution and derivative notices appear in the site credits, linked from the footer and the 3D menu.

## Why nearest-first allocation was rejected

From **development notes · Decision history** (historical):

> Ranking eligible plots by straight-line distance from the existing projected district centre and then by y, x is incompatible with a maximum of one connected drawn road cell per home.

> **A — keep the centres; fill frontage first (recommended).** Rank by the smallest number of additional cells on the fixed spanning tree, then the largest number of currently free legal plots at the candidate frontage, then the original squared centre distance and y, x. Break a frontage tie by y, x. Actual trial: **164 cells, 0.547/home; no hard failures**, four soft-target exceptions.

## The integrated A–O version was a review build

From **7.0 integrated Android review · 70001** (historical):

> **Decision: one signed, offline build for an integrated phone evaluation. Not a production launch or handset sign-off.** Start on the regional map, enter a featured landscape, then return to the map and resume the same walk. The 300 historical virtual acres and their owners remain in the developer fixture. There are **zero published residents and no funded public projects**.

> No campaign reel, owner-approved observation or share metric was provided. Food **0**, currency **0**, gold **0**; shares **unavailable**, last verified **none**. No charges for zero occupied homes; no depletion for every simulated day.

## Phone feedback changed the interface and farm presentation

From **7.1 nature-walk notes · 70100** (historical):

> Phone feedback overrides the previous edition's CTA, hidden examples, button layout, auto-sprint, synthetic bird bed, and generated farm blocks.

> Restore the reference's map/search/field-guide composition; zoom enters at the selected geography. Three explicit sample acres only, isolated from real accounts and treasury. Remove generated fields, strip park-like set dressing, cut worn treads into the shared ground mesh, and fit obstacles to the rendered models.

## 7.2.0 — Standalone source and editable scene

From **7.2.0 Android/Verification.md** (historical):

> **Content edit proof.** In the test copy we renamed `demo_user1` to `atlas_indigo`, changed the courtyard house to `round-thatch`, set its dimensions to 10.4 × 9.2 × 5.9 m, changed the wall to `#4974bd`, and bent an entrance road and a trail. Both the live Hugo render and a separately rebuilt signed test APK drew the new coloured drum walls (10.4 × 9.2 m plan), showed `@atlas_indigo` on the physical board, and put tread at the edited points. The original release showed neither new tread there.

## 7.3.0 — One public catalogue

From **7.3.0 Android/Verification.md** (historical):

> The public catalog, district totals, search directory and map now include all 300 unique acres; the opening map's cluster totals also summed to 300. All 300 are labelled as demo plots, not real resident counts. There are 61 district records, 61 road-network records with **703** authored paths, **27** trails and **12** places.

## 7.4.0 — Moving rain and distinct water classes

From **7.4.0 Android/Verification.md** (historical):

> **Talakona waterfall:** the editable map pin opens a mapped site. The shader-drawn feeder/curtain, plunge foam and spray were all submitted. The tested virtual lip-to-toe drop was 8.41 rendered metres, not a claim about the real waterfall's height.

## 7.5.0 — Fit the shore geometry

From **7.5.0 Android/Verification.md** (historical):

> **What changed:** the rendering used to cut the water sheet against the widely spaced corners of the distant land mesh. This update places the banks on the continuous water contour and stitches the land and water triangles together. It does not rely on changing the waves or hiding corners with foam.

## 7.6.0 — Separate water level from terrain; use a performed jump

From **7.6.0 Android/Verification.md** (historical):

> The old implementation sampled nearby terrain to infer a water height at each location. This could put a different height at opposite ends of the *same* pool. The new layer stores one datum for standing basins. River stations follow the channel length, and narrow mapped channels share their centreline height across a section.

## 7.7.0 — Foundations and reachable rooms

From **7.7.0 Android/Verification.md** (historical):

> The original near terrain grid did not follow the foundation. The new parcel terrace covers the entire oriented envelope, including verandas and wings; its cut/fill height is constrained by the front approach. Shoulders tie back into the hill. Coarse terrain is split **only** where it intersects a terrace, using stitched edges shared with the land mesh.

## 7.8.0 — Revisitable interiors and marine run-up

From **7.8.0 Android/Verification.md** (historical):

> Each resident’s existing seed selects fittings, arrangement, orientation, dye/wood/paint, lamps, wall displays and floor treatment. The layout reserves the entry path and room centre, keeps each footprint within the walls and uses the same dimensions for contact. The architectural model no longer dictates the contents.

## 7.9.0 — Make shower intensity change channel geometry

From **7.9.0 Android/Verification.md** (historical):

> The old build changed colour and animated glints without rebuilding rain-dependent branch sections. On the same Open meadow camera, 7.8.0 Light and Heavy produced the same 46,438 ribbon vertices and the same reported channel-width range (0.390–0.792 m). In 7.9 there are no overlapping translucent runoff strips.

## 7.10.0 — Stop moving land streams in dry weather

From **7.10.0 Android/Verification.md** (historical):

> In 7.10.0, droplets, the stream-map publication and the time-dependent wet-land shader all require actual precipitation. Rock wet streaks no longer use stored moisture as a motion signal. Ground colour may remain damp and fade; hollow water is still present after rainfall.

## 7.11.0 — River motion distinct from breaking surf

From **7.11.0 Android/Verification.md** (historical):

> The earlier build was moving downstream, but its bright, similarly sized curved marks filled most of the orbit view. We used the two supplied phone views to choose a near-bank camera and an actual **42 m orbit range**, not the previous 93 m test. The exact handset location, lighting and settings were not known.

## 7.12.0 — Measure actually wetting the bank

From **7.12.0 Android/Verification.md** (historical):

> Nine bank-normal sections, spaced 3 m along the bend, were measured for 24 s at 0.12 s intervals and 4 cm cross-bank spacing. 7.11's contact line stayed still. In 7.12 the **median of the nine stations' maximum landward reaches** was 1.04 m past the mean line; the greatest was 1.96 m on a low shelf.

## 7.13.0 — Two destinations, earlier 300-owner migration

From **7.13.0 Android/Verification.md** (historical):

> Compared the old and new publications by username, not by array position. All **300** usernames, permalinks, acre cells, corners, original building specifications, approval/classification fields and district IDs survived. No resident was invented.

## 7.14.0 — where the archive ends

The owner subsequently approved a replacement, not another migration of the 300 accounts. The release-source tree has the current ten-village register, 133 household pages and the proof for controls, growth, water and performance. Read the actual 7.14 reports rather than borrowing a figure or test name from an earlier edition.
