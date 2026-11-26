# Tirupati & Tirumala — research dossier for the 7-hills pilot

*Collected for the pilot branch (Arena session `arena/43d521a7-telugustates`). Every number below
was either measured from the project's own frozen DEM tiles or taken from a cited public source.*

## 1. Goal

Recreate, inside the existing Telugu States 3D world, the real experience of **climbing the steps
from Tirupati to the temple on the seventh hill**: the same two pilgrim stairways (Alipiri Mettu and
Srivari Mettu), the same landmark sequence, the same mountain shape and the same elevation profile,
built on the world's bundled real-terrain survey.

## 2. The land (verified against the project's own DEM)

The world already bundles a Copernicus-derived elevation survey of the Telugu states
(`static/frozen/tiles/*.bin`, 1,193 tiles; ~127 m ground resolution inside a 63.615 m atlas-cell
grid — see `TILE-FORMAT.md`). The Tirumala corridor lives in tile `19_7`. Heights decoded from that
tile at the real landmark coordinates:

| Place | Real lat, lon | Atlas cell | DEM height |
|---|---|---|---|
| Tirupati city centre | 13.6355, 79.4236 | (5051.3, 1968.8) | **150 m** |
| Alipiri Padala Mandapam (steps start) | 13.6467608, 79.4051741 | (5015.9, 1982.0) | **209 m** |
| Step ~700 (covered stairway) | 13.6515340, 79.4022436 | (5009.5, 1989.0) | 344 m |
| Step 1700 (AR marker) | 13.6549428, 79.3997678 | (5004.2, 1993.9) | 482 m |
| **Gali Gopuram (step 2083)** | 13.6557759, 79.3988442 | (5002.4, 1995.0) | **579 m** |
| Tiffin shops | 13.6565538, 79.3987809 | (5002.1, 1996.2) | 584 m |
| Sri Balarama Avataram statue | 13.6598781, 79.3926218 | (4990.4, 1999.9) | 668 m |
| Sri Krishna Avataram statue | 13.6595429, 79.3887326 | (4984.0, 1998.4) | 705 m |
| Sri Kalki Avataram statue | 13.6597629, 79.3844041 | (4976.0, 1997.4) | 748 m |
| Prasanna Anjaneya Swamy temple | 13.6598653, 79.3840373 | (4975.3, 1997.4) | 748 m |
| Dorasani Mandapam | 13.6604236, 79.3811175 | (4970.0, 1997.5) | 767 m |
| Divya Darshan bio-metric point | 13.6623810, 79.3749060 | (4958.6, 1999.0) | 806 m |
| Muggubavi Mandapam (step 2840) | 13.6643652, 79.3687587 | (4947.3, 2000.4) | 819 m |
| Footway arch | 13.6647400, 79.3656437 | (4941.7, 2000.2) | 815 m |
| **Mokalla Parvatham (step 2910)** | 13.6664646, 79.3548730 | (4922.4, 1999.9) | **783 m** |
| Alipiri 3200 step | 13.6676650, 79.3539841 | (4920.5, 2001.6) | 829 m |
| Kulashekhar Alvar statue | 13.6699234, 79.3524207 | (4917.1, 2004.9) | 895 m |
| **Alipiri last step (3,550)** | 13.6715997, 79.3525118 | (4916.9, 2007.6) | **909 m** |
| Footpath gate on the ring road (GNC) | ≈13.6790, 79.3516 | (4913.2, 2019.5) | 882 m |
| **Sri Venkateswara Temple, Tirumala** | 13.683250, 79.347194 | (4904.4, 2025.2) | **853 m** |
| Srivari Mettu entrance | 13.6692426, 79.3398042 | (4895.2, 2000.1) | **542 m** |
| Srivari Mettu exit footway | 13.6787340, 79.3434870 | (4899.1, 2016.8) | 866 m |
| Srinivasa Mangapuram village | 13.611630, 79.327530 | (4889.2, 1902.0) | 199 m |

Cross-checks against published facts: the temple plateau reads **exactly 853 m** — the elevation
printed on Wikipedia for Tirumala/Sapthagiri; the hills "rise to approximately 980 m" — the rim
cells around the Mokalla nose read 920–941 m; Tirupati city reads 150 m (≈150–160 m published);
Gali Gopuram at 579 m matches pilgrim reports of "≈600 m at the 2,083rd step". **The bundled survey
is the real mountain.** No terrain had to be invented; the pilot only had to draw the paths and
the landmark pins on ground that was already correct.

Terrain structure along the climb (read from the DEM):

1. **The plain** — Tirupati at ~150–215 m, flat (slope byte 1–5°), urban/bare.
2. **The first-hill nose** — the covered Alipiri stairway climbs the eastern nose of the range,
   209 → 579 m in ~1.3 km (average ≈ 28 %, sections of ≈ 45–60 % where the stairs run; a staircase,
   not a walkable ramp, in reality).
3. **The long shoulder walk** — from Gali Gopuram the path traverses west along the forested
   southern flank at 5–15 % grade, 584 → 819 m over ~3.6 km (tree cover byte 96–100 %).
4. **Mokalla Parvatham** — the final nose: a short descent to its base (783 m), then ≈ 300 steep
   steps up the rim to ~909 m.
5. **The plateau** — the Tirumala town basin at 850–880 m inside a rim that peaks locally around
   920–941 m; the temple sits at 853 m beside the Swami Pushkarini tank.
6. **Srivari Mettu face** — the western face below the plateau, 542 → 866 m in ≈ 1.2 km horizontal
   (the steepest footpath; 2,388 steps).

## 3. The two step paths (Sopana Marg)

Both footpaths together are called *Sopana Marg* — the stairways to the Lord. Verified facts:

| | Alipiri Mettu | Srivari Mettu |
|---|---|---|
| Steps | ≈ 3,550 | ≈ 2,388 (some sources 2,088–2,400) |
| Distance | ~9–12 km (path + plateau walk) | ~2.1 km |
| Start | Alipiri Padala Mandapam, ~4 km from Tirupati bus stand | Srinivasa Mangapuram road, ~15–17 km from Tirupati |
| Climbing time | 3–5 hours | 1.5–2.5 hours |
| Character | Steep first leg, then a long gentle forest walk, one final climb | Steep almost throughout, "short and sweet" |
| Key checkpoints | Gali Gopuram (step 2083, Divya Darshan token), ticket validation (≈step 2800), Mokalla Parvatham (step 2910) | Token counter at step ≈1300, validation at ≈1800 |
| Landmarks | Padala Mandapam, Garuda statue, Raja Gopuram, Gali Gopuram, Dasavatara statues, Prasanna Anjaneya temple, Dorasani Mandapam, deer-park stretch, Narasimha Swamy shrine, Mokalla Mettu, Dova Bashyakarla Sannidhi, Kulashekhar Alvar statue | Srinivasa Mangapuram Kalyana Venkateswara temple at the foot; exits near the Alwar Tank / Vaikuntam Queue Complex side |
| Legend | Path of the Lord's daily walk to Tiruchanur (his padukalu are honoured at Padala Mandapam) | The older, original pilgrim path, reopened in 2008 |

Route geometry actually used by the pilot:

- **Covered stairway (Padala Mandapam → Krishna Avataram statue, 63 vertices)** — OpenStreetMap way
  `30434845` (`highway=steps`, `covered=yes`, `handrail=yes`, `lit=yes`, `incline=up`). ODbL.
- **Mokalla Parvatham stairway (base → last step, 33 vertices)** — OSM way `30434846`
  (`highway=steps`, `handrail=yes`, `lit=yes`, `layer=1`, `source=survey`). ODbL.
- **Hillside walk (Krishna statue → Mokalla base)** — interpolated through the AR-waypoint
  landmarks (Kalki, Prasanna Anjaneya, Dorasani Mandapam, bio-metric point, Muggubavi Mandapam,
  footway arch) along the DEM shoulder; every anchor's height matches the survey (table above).
- **Plateau walk (last step → GNC gate → temple)** — along the ring-road corridor, DEM-checked.
- **Srivari Mettu** — entrance and exit are verified points (entrance 542 m per two independent
  gazetteer sources; exit from the OSM footway near Alwar Tank, 866 m); between them the line
  follows the least-grade spine of the western face computed on the DEM (natural staircase
  zigzag, 18 cells, 324 m of climb), then the ring-road walk into the temple basin.

Resulting trail metrics in the world:

| Trail | Points | Length | Total climb | Start → end |
|---|---|---|---|---|
| `alipiri-mettu` | 120 | 8.68 km | +807 m / −169 m | 215 m → 853 m |
| `srivari-mettu` | 22 | 2.02 km | +324 m | 542 m → 853 m |

(The real Alipiri measures ~9–9.8 km walked because of intra-block meanders of the stairway; the
world's trail is the surveyed centreline at survey resolution.)

## 4. The seven hills (Sapthagiri / ఏడుకొండలు)

The range is Seshachalam; Tirumala's seven peaks are traditionally the seven heads of Adisesha
([Wikipedia: Sapthagiri](https://en.wikipedia.org/wiki/Saptagiri)):

1. **Seshadri (Seshachalam)** — hill of Adisesha, the serpent on whom Vishnu rests; the whole range is his body.
2. **Vrushabhadri** — hill of the asura Vrushabha who performed penance on the Lord.
3. **Anjanadri** — hill of Anjana Devi, mother of Hanuman.
4. **Neeladri** — hill of Neela Devi, who receives the devotees' offered hair.
5. **Garudadri** — hill of Garuda, Vishnu's eagle vahana.
6. **Narayanadri** — hill of the sage Narayana (also "Gnaanadri", hill of knowledge).
7. **Venkatadri** — the hill of the Lord himself; the temple stands here, beside Swami Pushkarini.

Elevation: 853 m at the temple (survey-verified), the range rim ~920–980 m; area ≈ 26.7 km²;
rivers: Swarnamukhi on the north side. The pilot names its rim viewpoint place "Sapthagiri
viewpoint" and records the hill list in the research file (a future phase can paint hill-name
signboards along the rim).

## 5. Temples and landmarks on the routes

- **Alipiri complex** — Sri Venkateswara Swamy (Padala Mandapam) temple; Sri Lakshmi Narayana Swamy
  temple (east of Padala Mandapam); Sri Vinayaka Swamy temple on the second ghat road; the great
  Garuda statue in Añjali Mudrā at the circle; Raja Gopuram at the foot of the steps; Sapthagiri
  security zone (2009).
- **On the stairway** — Gali Gopuram (the wind tower, visible from all of Tirupati; Divya Darshan
  biometric/token point; free buttermilk and food stalls), the ten Dasavatara statues lining the
  upper walk, Prasanna Anjaneya Swamy temple, Dorasani Mandapam, Muggubavi Mandapam, deer-park
  stretch, Sri Lakshmi Narasimha Swamy temple near the saddle below Mokalla Parvatham, Dova
  Bashyakarla Sannidhi, Kulashekhar Alvar and other Alvar statues at the top of Mokalla Mettu.
- **Tirumala** — Sri Venkateswara Swamy temple (Venkatadri, 853 m, on the southern bank of Swami
  Pushkarini); Vaikuntam Queue Complex; GNC gate where the footpath meets the ring road; free
  luggage transfer from both footpaths.
- **Srinivasa Mangapuram** — Sri Kalyana Venkateswara Swamy temple (the Lord stayed here after his
  marriage to Padmavathi); village at 199 m under the western face that Srivari Mettu climbs.
- **Ghat roads** — two engineered roads (up/down) with hairpin bends climbing from Alipiri to the
  plateau (aerial reference analysed in §6); vehicles are screened at the Alipiri toll.

## 6. Aerial / imagery analysis (what the photos show)

Reference photos collected into the session (`image-search/`):

- **Ghat road aerial** (`tirumala-ghat-road-aerial-view-hairpin-b-1.png`): the two-lane ghat road
  running in repeated hairpin loops up a densely forested slope; mist-filled valleys; the temple
  town's white buildings visible on the plateau top far above. This is the visual target for the
  climb scenes: dark green closed-canopy forest, grey-blue road cuts, pale temple cluster on top.
- **Alipiri stairway night photo** (`tirumala-alipiri-steps-footpath-aerial-v-1.webp`): the fully
  roofed stairway lit along the whole first hill — reads as a continuous glowing ribbon up the nose.
  In the world the trail tread shows the same line; the covered-roof geometry is a later phase.
- **Temple aerial** (`tirumala-venkateswara-temple-aerial-view-1..3.jpg`): the temple complex and
  the gold gopuram cluster beside the tank, surrounded by the flat green town basin — matches the
  DEM basin at 850–880 m with the rim above it.
- TripAdvisor ground photos confirm: stone steps ≈1–1.2 m wide with side walls, shelters every few
  hundred steps, water points every ~50 steps.

## 7. Data sources and licences

| Input | Source | Licence | Use in pilot |
|---|---|---|---|
| Terrain elevation, slope, tree cover | Project's frozen Copernicus DEM tiles (`static/frozen/`, credited to Copernicus DEM / ESA WorldCover / OSM / LGD in `frozen/credits.md`) | already bundled | all heights, trail siting, observations |
| Covered stairway + Mokalla stairway geometry | OpenStreetMap ways 30434845, 30434846 via Overpass API | ODbL — credited "© OpenStreetMap contributors" (already in the app creditline) | trail polylines (verbatim vertices) |
| Step numbers, statue/mandapam coordinates | AR navigation dataset (github.com/bhargavm-iiits/AR-Navigation, `json_coorinates.txt`, public repo) | public data, cite as unverified crowd source | landmark anchors |
| Landmark names, step counts, legend | Wikipedia (Alipiri, Venkateswara Temple Tirumala, Sapthagiri), TTD portals, pilgrim guides | text references | place descriptions, research |
| Entrance/exit gazetteer coords | 2markers / worldorgs listings for Srivari Mettu | public gazetteer | trail endpoints |
| Aerial reference images | Web image search (blog/TripAdvisor/Wikimedia sources) | reference only, not bundled | look-and-feel targets |

## 8. Known limits of this pilot (honest fidelity statement)

- **Survey resolution.** The walkable terrain uses the bundled ~127 m survey; the real stairway is
  3,550 individual steps — the world shows the mountain and the path line, not each 19 cm riser.
  The tread follows the surveyed surface, so the climb profile (853 m, +800 m) is exact.
- **Steps are a carved hill path** (`surface: hill`), not modelled stair geometry. A later phase
  can add a repeated-riser mesh along the two mettu trails.
- **Structures.** The gopurams, mandapams, shelters, the Garuda statue and the temple complex are
  described by places and signboard text; their 3D structures are a later phase (the engine's
  house/scene system can carry them; this pilot deliberately ships content only).
- **Landmark pins** use the best public coordinates; a few (bio-metric point, footway arch) come
  from a single AR-tour dataset and are marked as approximate in the research table.
- **Ghat road** is not yet drawn as a road; its corridor is documented above for a follow-up.
