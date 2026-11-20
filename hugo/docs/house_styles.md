# Editable, road-facing homes

These are **stylized models**, not surveyed buildings or real residences. Defaults use the username, district and state as a stable seed; a region does not imply that a resident really lives in a particular kind of building. All models leave most of the acre as yard. Changing paint, props or a valid size never changes a reservation.

| `archetype` | What distinguishes the silhouette |
|---|---|
| `mud-veranda` | Earth plinth, hipped tile roof, shaded front veranda |
| `pillared-tile` | Broad tiled frontage on four limewashed pillars |
| `thatch-longhouse` | Low, elongated hipped thatch with layered eaves |
| `round-thatch` | Circular/elliptical plaster body, conical thatch, binding rings |
| `rcc-tank` | Flat slab, parapet and banded rooftop water tank |
| `balcony-stair` | Two levels, external stair, balcony and rails |
| `l-court` | Two solid wings opening onto an L-shaped courtyard |
| `sheet-lean-to` | Shallow sloping sheet roof, raised seams |
| `cattle-compound` | Main house plus an open-sided shed and feeding trough |
| `stone-gable` | Dressed corner stones, plinth and gable roof |
| `street-shop` | Street counter, inset opening and striped awning |
| `courtyard-house` | Three wings with an open courtyard entry |

After a rebuild, the public Markdown has editable fields such as:

```yaml
archetype: pillared-tile
wall_color: '#e7c691'
roof_color: '#a45135'
size_m: [12, 10, 4.5]
facing: south
road_side: south
props: [tulsi-planter, woven-cot, kitchen-garden, shade-tree]
```

`size_m` is the covered envelope **width along the street, depth, overall height** in metres. Open verandas/covered sheds count as footprint; empty courtyards do not. The round house uses an elliptical footprint, not its bounding box. Designs must cover 60–200 m² and be 3–7 m high. Quote hexadecimal colours in YAML. Doors face their street; `facing` and `road_side` must agree, and changing both requires an actually reachable edge-adjacent frontage that still passes the road budget. Leave them out on a new file and preparation will choose them. `house_style` is retired.

Supported props: `tulsi-planter`, `clay-pots`, `woven-cot`, `drying-line`, `banana-clump`, `kitchen-garden`, `shade-tree`, `water-urn`, `wood-bench`, `flower-bed`. Specify up to eight without duplicates. Local variations in paint, roof, dimensions, openings, weathering, garden placement and verge planting are deterministic. Distant detail is culled. Geometry/materials are instanced across residents; a lower detail tier does not change the house's reservation, wall footprint or entrance.

A level pad extends past each covered body before an approximately eight-metre terrain transition. The front setback in this edition is 10.3–12.8 m. Gate leaves are open; solid building walls stop the walker. Four rounded stones identify the actual assigned plot corners. Shared corners are drawn only once. No empty-plot grid, mileposts or claim markers are drawn.

The 12 stable archetypes and their existing frontage are carried forward. New rural forms use short compound elements and open approaches, not an estate-scale continuous fence. Modest warm window light is an atmospheric effect; a house is not described as having electric service just because a window glows. Poles, overhead services and lamp pools require the separate village development record.
