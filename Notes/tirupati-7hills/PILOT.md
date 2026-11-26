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

## How to run

```sh
cd Hugo-Project
hugo server     # Hugo 0.147.8 (same as .github/workflows/hugo.yml)
```

Open http://localhost:1313/, search **Tirumala** or click the new place pins, or press the search
icon in the world's top bar. Suggested tour: `tirupati` → `alipiri` → walk the trail up (Sprint on
the stairway sections) → `galigopuram` → `mokalla` → `tirumala`.

A ready-made preview (the compiled site extracted from the committed APK, with this branch's JS
and the new catalog entries patched in) lives in `Hugo-Project/preview/` (gitignored) — serve it
with any static server. It exists only for sandbox demonstrations; the authoritative build is Hugo.

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
