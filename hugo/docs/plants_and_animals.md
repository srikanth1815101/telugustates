# Plants and animals · what to look for

**Stylized placement, not a species survey.** The same place, season, time preset and quality tier start from the same seeded plan. A walker changes what an animal does next. The exact pose in a screenshot is not meant to repeat after a different walk. No live species records, copied models or external services are required. Every preset shares a small original geometry builder rather than carrying a model download.

Garden and orchard trees cluster near occupied homes; forest canopy, drier scrub, tall wetland grasses and coastal forms are biased by the stored observations. A cone-shaped tree requires a wet, high forest cell above 1,000 m; the coastal casuarina uses a swept, branching silhouette, not a cone. Crops require sufficient real mapped cropland, a mild slope, and an unoccupied, non-road cell. Neighbouring parcels share row headings. Row colours and foliage tints change with the season; these are not crop or harvest predictions.

Domestic animals stay within about 100 m of homes; wildlife starts at least 30 m from house centres, avoids the rendered pads, and generally moves away inside 25 m. Dry-land life does not walk into rivers or lakes. Shore animals remain next to water. Fish schools and surface shadows need a mapped open-water mask; the deeper treatment additionally needs positive lake-mean data and measured clearance to the **rendered** bed. Small wings, hovering, idle/graze phases, return and shared group drift give the scene motion. Domestic animals move toward cover in persistent rain. No attacks, capture or hunting. Cart and coracle are small scenery details, not working vehicles.

| Quality | Detailed planting radius | Max larger animals | Max insects / small flyers | Appearance |
|---|---:|---:|---:|---|
| Low | 7 acres outward (~445 m) | 7 | 12 | Fewer clumps; simple crowns, no wind, no real-time cloud shadows |
| Medium | 13 (~827 m) | 24 | 68 | Moving foliage, field details, local weather, simple distant copse silhouettes |
| High | 18 (~1.15 km) | 40 | 145 | Wider and denser stands, more animals, particles and shadow maps |

These are ceilings, not density promises. Life is local to roughly 250 m. The ``Show nearby life`` panel is off initially and lists camera-visible candidates, not a census of the district. There is no audio download or autoplay. Reduced-motion preferences stop the wind, animal stepping and motes. Auto starts with a conservative device profile and measures early walking frame intervals to reduce expensive layers. Explicit Medium stays pinned for a repeatable test.

**Trees and woody plants (28).** Mango, Tamarind, Coconut palm, Banana, Neem, Banyan, Jackfruit, Guava, Papaya, Drumstick, Palmyra, Curry leaf, Hibiscus, Jasmine, Teak, Bamboo, Mixed canopy, Acacia, Flame tree, Golden shower, Silk cotton, Casuarina, Eucalyptus, Mangrove, Cashew, Cocoa, Hill spire, Rock fig.

**Grasses, flowers, litter and aquatic plants (16).** Short grass, Golden plume, Shore reed, Marsh sedge, Pink asters, Indigo bells, Ivory daisies, Marigold, Red balsam, Lotus, Water lily, Water hyacinth, Gully fern, Agave, Mushroom, Leaf litter.

**Crop treatments (9).** Paddy, Cotton, Chilli, Maize, Sugarcane, Sunflower, Groundnut, Turmeric, Fallow.

**Animal / insect presets (47).** Village dog, Yard cat, Cow, Bullock, Buffalo, Goat, Sheep, Hen, Chick, Spotted deer, Sambar, Wild boar, Langur, Bonnet macaque, Peafowl, Jungle fowl, Squirrel, Mongoose, Jackal, Leopard, Nilgai, Blackbuck, Hare, Lapwing, Egret, Heron, Kingfisher, Duck, Cormorant, Stork, Frog, Kite, Eagle, Parakeet, Crow, Bat, Gull, Tern, Sand crab, Shoal fish, Reservoir fish, Turtle, Butterfly, Dragonfly, Bee, Firefly, Moth.

**Limitations.** The fish effect is rendered at the water surface to remain visible through opaque water. Local depths are not known; see `terrain_layers.md`. Not every listed type is present on a given route. Fruit and leaf details simplify quickly with distance, and the cap deliberately leaves some landscapes quiet.
