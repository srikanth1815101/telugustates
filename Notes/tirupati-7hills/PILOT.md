# 7-hills pilot — what was built on this branch

Branch: `arena/43d521a7-telugustates` (branched from `main` at 72b34e0; `main` untouched; no PR).

## Content (Hugo source)

**11 new places** (`Hugo-Project/content/places/`) — every one carries real coordinates, the
atlas cell, a view yaw, survey observations (elevation / slope / tree cover decoded from the
frozen tiles) and bilingual titles:

| id | title | z (survey) |
|---|---|---|
| `tirupati` | Tirupati city | 150 m |
| `alipiri` | Alipiri Padala Mandapam (start of 3,550 steps) | 209 m |
| `galigopuram` | Gali Gopuram, the 2,083rd step + mid orbit view | 579 m |
| `anjaneya` | Prasanna Anjaneya Swamy temple on the hillside walk | 748 m |
| `dorasani` | Dorasani Mandapam | 767 m |
| `mokalla` | Mokalla Parvatham, the final 300-step climb | 783 m |
| `srivari` | Srivari Mettu entrance (2,388 steps) | 542 m |
| `srinivasa-mangapuram` | Kalyana Venkateswara temple village | 199 m |
| `tirumala` | Sri Venkateswara Temple on Venkatadri + mid view | 853 m |
| `sapthagiri-view` | rim viewpoint above the last steps | 914 m |
| `gnc-gate` | footpath gate on the Tirumala ring road | 882 m |

**2 new walkable trails** (`Hugo-Project/content/trails/`) — carved into the terrain by the
existing `Tread` engine (width 1.15 m, `hill` surface), so the climb is walked, not just drawn:

- `alipiri-mettu` — 120 points, 8.68 km, +807 m: Padala Mandapam → covered stairway (verbatim
  OpenStreetMap surveyed vertices) → Gali Gopuram → Dasavatara/Anjaneya/Dorasani walk → bio-metric
  point → Muggubavi Mandapam → Mokalla Parvatham stairway (verbatim OSM vertices) → last step →
  GNC gate → temple.
- `srivari-mettu` — 22 points, 2.0 km, +324 m: entrance above Srinivasa Mangapuram → staircase
  spine up the western face → exit footway → ring road → temple.

**Search in the world top bar** (`Hugo-Project/static/js/world.js`, `static/living.css`,
`content/languages/{en,te}.md`) — a magnifier button beside Settings / My Home / My Acre opens a
dialog that searches **all mapped places and districts** (English + Telugu, instant filtering) and
**resident homes** via the one-way username shards (`@username` + Enter). Enter / Go picks the
first match. Choosing a place walks you there (same `#/field/…` route the map pins use); choosing
a district flies the overview camera to it; choosing a resident opens the Walk there / Teleport
destination card. Fully bilingual (`search.*` keys added to both dictionaries; key sets verified
identical).

## Android test app (7-Hills Pilot APK)

A separate Android app is built from this branch so it installs **side by side** with the
production app without conflict:

| | Production app | 7-Hills pilot app |
|---|---|---|
| Package | `com.csrgo.telugustates.fieldtest` | `com.csrgo.telugustates.pilot` |
| Launcher label | Telugu States | **7Hills Pilot** |
| Icon accent | pine `#193C32` | terracotta `#7A3B1E` |
| Content | production catalog | pilot catalog (24 places, 26 trails incl. both mettu stairways) |

`android/build_apk.py` gained `--app-id / --app-name / --pine-color`, which rebrand private copies
of the manifest, host sources and resources before `aapt2`/`javac` compile them. Because every
remote release/site metadata file carries the production `appId`, the pilot's `LiveSync` rejects
them all — so the pilot never overwrites its bundled catalog with production content and never
prompts to "update" itself into the main app. The workflow copy on this branch builds
`Telugu-States-Pilot.apk` on `workflow_dispatch` and uploads the `Telugu-States-7Hills-Pilot-APK`
artifact; the GitHub Releases publish step stays gated to `refs/heads/main`.

**The APK is never kept in git** (it would blow the workspace download budget). The single copy
lives at `downloads/Telugu-States-Pilot.apk` (gitignored via the repo-wide `*.apk` rule), with a
symlink in the preview web root for HTTP download. CI delivers it two ways on `workflow_dispatch`:

1. **`pilot-apk` prerelease** — the APK is attached to the `pilot-apk` prerelease (never marked
   `latest`, production releases untouched). Download in a normal browser from the repo's
   Releases page, or `gh release download pilot-apk`.
2. **Transient branch commit** — the runner also commits the APK to the branch tip
   (`CI: 7-Hills pilot APK (run N)`, amend-and-replace so history stays lean). This exists only
   so sandbox tooling can fetch it with `git show <commit>:android/Telugu-States-Pilot.apk`
   (Actions-artifact and release-asset CDNs are unreachable from the sandbox). After pickup the
   commit is force-replaced off the branch and the blob is pruned, so git stays APK-free.

Refresh flow after changes:

```sh
gh workflow run build-android.yml --ref arena/43d521a7-telugustates
# wait for success, then
git fetch origin && git show origin/arena/43d521a7-telugustates:android/Telugu-States-Pilot.apk \
  > downloads/Telugu-States-Pilot.apk   # while the CI commit is still the branch tip
git push --force-with-lease origin <pre-CI-commit>:refs/heads/arena/43d521a7-telugustates
git reflog expire --expire=now --all && git gc --prune=now
```

If `downloads/` is empty (e.g. after a sandbox reset), rebuild the same way, or download from the
`pilot-apk` prerelease.

## How to run

```sh
cd Hugo-Project
hugo server     # Hugo 0.147.8 (same as .github/workflows/hugo.yml)
```

Open http://localhost:1313/, search **Tirumala** or click the new place pins, or press the search
icon in the world's top bar. Suggested tour: `tirupati` → `alipiri` → walk the trail up (Sprint on
the stairway sections) → `galigopuram` → `mokalla` → `tirumala`.

A ready-made preview (the compiled site extracted from the committed APK, with this branch's JS
and the new catalog entries patched in) is served on sandbox port 8123 from `/tmp/preview`
(deliberately outside the repository so the heavy site does not count against the workspace
download budget; rebuild it the same way after a sandbox reset). The authoritative build is Hugo.

## Checks run on this branch

- All 24 place + 26 trail records parse (front-matter YAML schema, id uniqueness, route shapes,
  goal/surface enums) — pilot validation script, mirroring the `errorf` rules of
  `layouts/partials/catalog.html`.
- `content/languages/en.md` and `te.md`: JSON valid, key sets identical (the invariant
  `tools/check-content.mjs` asserts).
- `node --check static/js/world.js`.
- DEM cross-check script (projection round-trip, landmark heights, trail profiles) — numbers in
  [RESEARCH.md](RESEARCH.md).
- Full `node tools/check-content.mjs` needs the Hugo binary, which this offline sandbox cannot
  fetch; run it locally after `hugo` is on PATH.

## Suggested next phases

1. **Structures** — gopuram/mandapam scene meshes at the landmark cells (the house-archetype
   system can be reused with temple archetypes), signboards with the Telugu names.
2. **Stair geometry** — repeated-riser tread style for the two mettu trails.
3. **Ghat road** — draw the two hairpin roads as district-24 road paths (corridor documented).
4. **Covered stairway** — the roofed corridor ribbon over the first 2 km of Alipiri Mettu.
5. **Audio** — devotional soundscape switch when inside the Tirumala cluster.
