# Ten villages • two destinations per household

**7.14.0. This is a replacement roster.** The earlier demo houses, their owner-specific trails and their published pages are not part of this edition. All 61 districts remain on the map, but only the ten below have seed households. Five districts per state were drawn with fixed seed `0x714cc`. These are fictional households, not real Instagram accounts or property titles.

| District | State | Households & individually assigned fields | Residential acres | Planned capacity |
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

### Where to go

Start with `@palnadu_demo01` or `@medak_demo08`. Search opens the named home. Its porch is **not** on its agricultural acre. **Settings • Home • Land** share the top row in 3D, including local orbit. Both destinations open a small north-up sketch and offer **Walk there** or **Teleport**. In a scenic visit with no active resident, choose a household on the card. Walking shows the next junction and distance; move with the stick or WASD. Teleport moves directly to that porch or just inside that field. `#/u/<handle>`, `#/acre/<handle>`, `#/plot/<handle>` and `/houses/<handle>/` refer to the new roster. Districts without households still have geographic records.

### What occupies the square

Reserve the square first. A 3 × 3 block of acre cells is 9 acres; a 4 × 4 block is 16. The ledger stores its integer southwest corner, side and street orientation. Each holding has one rotated yard in the square and one complete buildable cell **outside** it. The area of an individual field is 63.615 m × 63.615 m (4,046.87 m²). Four survey stones mark its corners, shared where two owners meet. There are no placeholder houses, duplicate fields or fences dividing the residential square into farm acres.

The high street bends; shorter arms and private front paths join at actual vertices. One lane leaves the village for a group of holdings. Outside the square it follows the boundaries; only a short field entry steps inside the owner's cell. Shared segments are stored once. Soil colour and shallow tread cuts live on the terrain, not a raised tan road ribbon. The shade tree and common are separate from the home sites. House centres in this publication are at least 23.39 m apart; the minimum nominal wall-to-wall gap is 9.86 m. Courtyard footprints span 186.92–274.81 m². A gate-to-field walk is 157–511 m, median 260 m; that is path distance, not radius.

### Publishing another household

1. Give it a unique `content/houses/<handle>.md` and a district. Use `record_kind: demo` only for fiction. Accept the planner’s available exterior field, or supply an explicitly available field in the village's surveyed belt. Do not copy another owner's cell or home pin.
2. Run `node tools/settle.mjs` in the project, then review the changed Markdown **and** `data/settlements.json`. Commit them together. A normal Hugo build rejects an unpinned house or a conflicting pair. The planner appends occupied sites and needed path segments; previously published pins, square, common and paths stay fixed. Capacity is a planning limit, not a promise that an arbitrarily large house will fit or a call to fill the vacancies.
3. Run `node tools/check-villages.mjs`, `node tools/check-homes.mjs`, `node tools/check-growth.mjs` and `node tools/check-content.mjs --tiles`. The village audit checks oriented yard containment, distinct field cells, shared tread vertices, boundary access, slopes and dry routes. The growth test adds two batches only in a disposable copy. No simulated join is distributed in the atlas.
