# Field verification · Telugu States Atlas 7.14.0 (71400)

[Village photograph and land plan](Checks/Village-homes-and-their-fields.jpg) · [Two actual river views](Checks/River-at-332m.mp4) · [Orbit controls in Telugu](Checks/My-acre-in-Telugu.png) · [Full measurements](Checks/Measurements.json)

## Find one household; reach its two places

Search **@palnadu_demo01**. Home opens at the porch, not in the field. **Home** and **My Acre** sit beside Settings in the local orbit and on foot. Each has a small north-up plan and two choices: **Walk there** marks the lanes without moving you; **Teleport** takes you directly. Move with the stick or WASD to follow a walk. From a scenic orbit without a resident, choose a household first. Use Teleport for a distant village: the marked lanes are a local network, not a statewide footpath planner.

- A mixed-case profile URL submitted through the search form opened the right home. Its temporary highlight cleared. We opened both destination cards from the ground, moved using the guidance, teleported inside the correct exterior acre, and returned to the same porch. Starting from orbit, My Acre → Teleport worked in Telugu and Home → Walk there resumed walking at the existing location. A separate test picked **@medak_demo08** at River bend and teleported to that porch.
- The game’s movement controller, using the live terrain/contact readers, replayed **58/58 waypoints, 199.18 m**, dry with no blocked moves. This replay is separate from the real button and keyboard input tests. The household card measures gate-to-field distance; walking from the porch can be slightly shorter.
- The published house page showed resolved coordinates/elevation and all three links. Its map link highlighted the exterior field; the retired **@demo_user20** did not resolve. The two neighbours **@palnadu_demo01** and **@palnadu_demo02** share a grid cell but enter and leave different rooms. Final interaction and four-site motion runs had no missing assets, off-origin asset requests or page errors.

## Replacement villages, not additional demo records

The old 300 usernames and their owner-specific records are retired. There are **133 new fictional households, 133 unique exterior one-acre fields, ten villages** (five districts per state), and no growth-test accounts. All 61 district records remain. See `Hugo-Project/Villages.md` for the complete table, selection seed and publishing steps. The atlas still has 24 trails, 13 places and the original community balances.

Four residential squares are **9 acres** and six are **16 acres**. Each contains 11–15 real occupied house sites in this publication. The ten plans allow up to 298 sites in total. Each family has a 186.92–274.81 m² courtyard, plus a separate 4,046.87 m² field. Nearest house centres: 23.39–34.23 m; nominal wall gaps: 9.86–22.48 m. There are no rows of fake houses occupying the reserve. Fences do not bisect the fields: four stones mark a holding, with shared corners deduplicated.

Gate-to-field routes are **157–511 m** (median **260 m**); centre-to-centre distances are **120–343 m**. The network contains 3,020 distinct path segments; shared segments are stored once. 126 fields have an entry on a shared boundary and 4,264 m of boundary tread is used by multiple holdings. All 133 porches and routes passed, including 10,735 dry path samples and checks for walls, the shade tree and real junctions. The 95th percentile grade was 0.07 rise/run; short maximum 0.28. These are game measurements, not real property or accessibility surveys.

Two small unpublished batches added 12 households without moving the published pins, square or existing path vertices. A no-op repeat was byte-identical and conflicting coordinates were rejected. In a separate stress test we requested **165 additional households**. All ten original squares reached their planned counts, with no extra village. All **298** resulting routes passed on **19,062** dry samples; original homes, fields and path prefixes were unchanged. Only the original 133 ship.

## River bend at the reported 332 m

The regional water chart carries a downstream vector on connected mapped running water, rather than applying a ripple only near the focus. The 326 flow pages retain **all 85,458,944 original coverage samples**. The bake assigned flow to 1,097,409 of 1,097,515 running-class samples; it does not give still pools and open sea a made-up river direction. The close mesh retains the terrain-fitted bank, bathymetry and slower near-bank advection. The more visible travelling surface crests are not a change in downstream swimmer or floating-leaf speed. Reservoirs and surf use their own behaviours.

At a fixed camera, our **first two submitted normal water frames** already differed while the rest of the terrain was loading: 6.841 and 7.279 s after navigation in an instrumented readback run. Same water geometry and camera; **72.6%** of the water and **57.2%** of the wet margin changed by ≥3/255 in at least one channel. Interior non-water control: 0.0%. That is motion at first water appearance, **not** an instant app startup.

With the full 332 m patch loaded, **98.81%** of 44,117 sampled water pixels and **95.86%** of the 9,083-pixel wet margin changed by ≥7/255 over 4.75 s of normal rendering. Screen-left/right margin halves: 91.74% / 98.27%. These are screen-space tests, not geographic left/right banks.

For direction, we separately advanced the water shader’s time at a fixed camera and tracked features in its normal colour output. Of 14,332 track observations, **99.65%** had a downstream component; median speed **3.80 render px/s**, versus 2.02 in 7.13 at the same pose. Near the silhouette (≤12 px), median **2.65** vs 1.76 px/s, **98.67%** downstream. The previous edition also moved here; the results show more legible, faster-travelling features, not a transition from zero flow. The on-foot view also moved. The open reservoir control had zero river vector/transport; the coast still changed with swash, with zero river vector. The film uses actual normal frames timed by their capture timestamps, **not** phase stepping, tweening or a time-lapse. Film readback adds overhead; use the separate benchmark below for frame rate.

## Matched-range performance and limits

| Scene | Release | First local draw / 9-chunk ready | Game renders/s | Median / p95 interval | Calls / triangles |
|---|---|---:|---:|---:|---:|
| River bend, 332 m | 7.13 | 7.67 / 9.16 s | 3.16 | 311.3 / 352.6 ms | 32 / 215,307 |
| River bend, 332 m | 7.14 | 5.88 / 8.25 s | 15.43 | 66.6 / 71.8 ms | 28 / 28,588 |
| Village, 21 m | 7.13 | 9.55 / 10.11 s | 1.81 | 536.8 / 590.1 ms | 61 / 399,346 |
| Village, 21 m | 7.14 | 3.85 / 5.57 s | 9.75 | 82.4 / 151.0 ms | 42 / 105,097 |

Short still-camera measurements using Chromium 156, WebGL2 via SwiftShader, 390 × 844 CSS-pixel touch viewport, actual 203 × 441 render buffer, Low + Battery Saver + reduced motion, Clear winter daytime. Fresh browser context; served the exact Android assets at the Android virtual origin. Not physical handset FPS. 7.13 village: 17 homes at the old @demo_user20. 7.14: 14 in Palnadu. Matched distance and settings, not identical villages. The counts measure game draws, not just browser callbacks. The app draws the focus chunk while neighbours stream, samples precomputed overview colours and uses a cheaper dry-ground/river shader at the medium-distance inland orbit. Fine tread, furnishing and vegetation detail is bounded on Low. Ground collision and doorway checks remain in use. Largest observed pre-ready main-thread tasks on 7.14: **1434 ms** (river), **1168 ms** (village). The software renderer did **not** reach 30 fps. This is not a physical-device, battery, or hitch-free guarantee.

## Installer and clean build

- `com.csrgo.telugustates.fieldtest` · **7.14.0 / 71400** · Android 8+ (min API 26), target API 35. Zip alignment, manifest, no requested permissions, and v2/v3 signing verified. Same certificate as 7.13; SHA-256 `3962f6574ff35e591c1d8da315e89de04071cfb462a07b47435b2f528be04b8c`.
- **60,496,810 bytes** for the installer, **+6,674,692 bytes** over 7.13. Positive-only additions/growth among embedded assets: 7,779,085 bytes, of which 6,663,503 are the compressed flow pages. The QA movie and plan are outside the APK. Installer SHA-256: `5fac6087dda197e49a4f29991a6c60de95402dbcb997f646d5cfd1a8df166b5e`.
- Verified all **4,750** embedded site files against a fresh Hugo render, checked **2,132** local links and **1,193** original decoded tile hashes. The 4,078 inherited frozen/ecology/survey/hydraulics/field-art files compared with 7.13 are byte-identical. The independent preflight includes rooms, terraces, growth, moving jumps, swimming, precipitation/runoff, fitted shore contact, river margins and descending stages. The 79 river cross-sections still span an 18.758 m model drop; the reservoir has no model drop.
- In a separate extraction of both downloads we ran the manual workflow's preflight, build, sign and verify steps locally with the pinned tools. **All 4,756 uncompressed APK entries match byte-for-byte.** The signed container hashes can differ between build invocations; see Measurements.json. All non-report files in the final ZIPs were compared against the inputs to this rebuild. No signing key or password is included. No hosted workflow or physical Android install was run.
