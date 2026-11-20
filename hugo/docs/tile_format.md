# TSA1 · frozen acre tiles

One gzip member per `data/frozen/tiles/{tx}_{ty}.bin`. Serve it **as bytes**, not as a precompressed HTTP representation. The browser also recognizes already-inflated TSA1 bytes. No special HTTP server configuration is necessary. The manifest hashes the actual file, including its gzip wrapper. Never use a missing tile as zero-elevation land; absent tile = outside.

All integers are little-endian. Row **0 is south**, column **0 is west**. Tiles are 256×256 cells, the elevation plane is 128×128. Byte offsets after decompression:

| Offset | Bytes | Meaning |
|---:|---:|---|
| 0 | 4 | ASCII `TSA1` |
| 4 | 4 | signed 16-bit tx, then ty |
| 8 | 32768 | signed 16-bit elevations; first value in each 128-sample row is absolute, following values are differences, wrapping in int16. Decode via row-wise cumulative sum. −32768 means no in-state data in that 2×2 block. |
| 32776 | 65536 | slope, ceiling of degrees on the **unsmoothed acre DEM**, zero outside |
| 98312 | 65536 | mutually exclusive class: 0 outside, 1 plain, 2 tree cover ≥50%, 3 lake/reservoir/permanent water, 4 river, 5 mine, 6 slope >20° |
| 163848 | 65536 | district ID (0 outside); joins `config/districts.json` |
| 229384 | 65536 | rounded percent tree cover; 255 = unknown, not eligible |
| 294920 | 131072 | uint16 reported river width in metres; 0 = unknown/not applicable, **not** an observation of zero width |
| 425992 | 8192 | buildability bitmap, 1 bit/cell, least significant bit first |
| 434184 | to EOF | UTF-8 JSON array: `[width_m, [x0,y0,x1,y1,…]]` per river centreline. Coordinates are sixteenths of a cell from the tile's SW corner; vertices are clipped to the two-state area and tile. |

For projected metres `(X,Y)`, take `x=floor((X−X0)/63.615)` and `y=floor((Y−Y0)/63.615)`. Tile = `(floor(x/256),floor(y/256))`; local index `i=(y mod 256)*256+(x mod 256)`. Centre uses offsets `(.5,.5)` before inverse projection; corners are SW, SE, NE, NW. Albers origin and CRS are committed in `config/project.json` and are **not per district or per state**. Browser and preparation use the same ellipsoidal equations; tests check them against PROJ.

The elevation block is a rounded mean of valid **in-state** source acre samples, not a survey at the precise pin. Class masks never average away a mapped stream to allow a house. Polygon/line/point burns use all touched cells; water wins over a mine, and either wins over slope/forest/plain. ESA permanent-water percent >0 after integer rounding excludes the cell. Edge-intersecting cells count by centre for area auditing but cannot receive a house. Only class 1 or 2, slope ≤20°, known cover, and no district edge can have bit=1. `stats.json` reports source resolution limitations. A visually interpolated bank or water depth is not another measurement.

The walker blurs elevation only for the mesh, not for the HUD, the lock or buildability. Display Y is `(smoothed_m − local_reference_m) × relief_exaggeration` (v5 default 2.0; adjustable 1–3); horizontal world units are real metres. Village pads are a localized, blended visual modification; they do not change the source elevation or eligibility. At fine LOD, collision height is interpolated on the exact two rendered triangles; the eye is 1.6 units above the foot point. Colour, vegetation models and water animation are visual interpretations.

The separate `basis/` package is for reproducibility and ODbL reuse, not part of a walker tile. Its formats are described in `docs/source-rebuild.md`. The client never has to fetch it.

## LOD1: separate regional display cache (Part 1)

`site/static/survey/overview.bin.gz` is not an acre tile and is never consulted for a reservation. To reproduce it from an existing freeze, run `python scripts/bake_survey.py` with NumPy installed. This is **not** a Pages build step. No raw download or GIS rebuild is involved.

After gzip decompression: ASCII `LOD1`, followed by four little-endian unsigned 16-bit integers: columns (416), rows (392), cell stride (32), reserved (0). Five row-major, south-to-north arrays follow: signed 16-bit mean source height in metres (−32768 outside), byte modal district ID (0 outside), byte mean tree percentage, byte water/river percentage and byte in-state coverage percentage. District, height, tree and water summaries use in-state members of each 32×32 block; coverage uses the whole block. Array index `j * columns + i` is displayed at `((i+.5)*stride, (j+.5)*stride)` in the immutable acre grid. Full district edges use the existing polygon map, and local ground uses TSA1. Never use a majority-district overview pixel for a cadastral or buildability decision.

The optional v5 local terraces and water treatment are described in [Terrain layers](terrain_layers.md); they do not alter the TSA1 format.
