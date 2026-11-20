"""Seeded, editable model-space envelopes and a single footprint/door contract for JS and QA."""

import hashlib, math, re
from village import DIRECTIONS

STYLES = [
    "mud-veranda",
    "pillared-tile",
    "thatch-longhouse",
    "round-thatch",
    "rcc-tank",
    "balcony-stair",
    "l-court",
    "sheet-lean-to",
    "cattle-compound",
    "stone-gable",
    "street-shop",
    "courtyard-house",
]
WALL = [
    "#e7c691",
    "#95c3b0",
    "#d89971",
    "#eadbbe",
    "#83afb8",
    "#cdabbf",
    "#e5b978",
    "#c6d0ae",
    "#dcae9a",
    "#a6b9ca",
    "#e8db98",
    "#c0a994",
]
ROOF = [
    ["#a45135", "#bc6540", "#96523c"],
    ["#a78348", "#ba9956", "#927447"],
    ["#a7b4ae", "#8d9da5", "#9aafa2"],
    ["#7c989c", "#8193a1", "#a37156"],
]
PROPS = [
    "tulsi-planter",
    "clay-pots",
    "woven-cot",
    "drying-line",
    "banana-clump",
    "kitchen-garden",
    "shade-tree",
    "water-urn",
    "wood-bench",
    "flower-bed",
]


def design(m, u, d, at, slot, net):
    x, y = slot["cell"]
    fx, fy = slot["frontage"]
    s = hashlib.sha256((d["state"] + "|" + d["name"] + "|" + u).encode()).digest()
    base = next(k for k, (dx, dy) in DIRECTIONS.items() if (x + dx, y + dy) == (fx, fy))
    side = m.get("road_side", m.get("facing", base))
    face = m.get("facing", side)
    if side not in DIRECTIONS or face != side:
        raise ValueError("facing must match road_side (north / east / south / west)")
    dx, dy = DIRECTIONS[side]
    front = (x + dx, y + dy)
    if not net.contains(front, net.roads):
        raise ValueError(f"{side} does not share a side with a safe reachable road")
    style = m.get("archetype", STYLES[(s[0] + d["id"] * 3) % 12])
    if style not in STYLES:
        raise ValueError("unknown archetype; see docs/house_styles.md")
    i = STYLES.index(style)
    w = round(10.2 + s[1] % 41 / 10, 1)
    depth = round(9.9 + s[2] % 29 / 10, 1)
    h = round((5.7 if i in (4, 5) else 3.5) + (s[3] % 12) / 10, 1)
    if i == 2:
        w, depth = round(w * 1.12, 1), round(depth * 0.84, 1)
    dims = m.get("size_m", [w, depth, h])
    if (
        not isinstance(dims, list)
        or len(dims) != 3
        or any(type(v) not in (int, float) or not math.isfinite(v) for v in dims)
    ):
        raise ValueError("size_m must be [width, depth, height] in metres")
    w, depth, h = dims
    if not (5 <= w <= 21 and 5 <= depth <= 21 and 3 <= h <= 7):
        raise ValueError("size_m: widths/depths 5–21 m; heights 3–7 m")
    # Normalized [x,z,width,depth,role]. z increases toward the street; covered verandas count as footprint.
    rect = {
        0: [[0, -0.105, 1, 0.79, "body"], [0, 0.395, 1, 0.21, "veranda"]],
        1: [[0, -0.15, 1, 0.70, "body"], [0, 0.35, 1, 0.30, "veranda"]],
        3: [[0, 0, 1, 1, "round"]],
        5: [[-0.07, 0, 0.86, 1, "body"], [0.43, 0, 0.14, 1, "stairs"]],
        6: [[0, -0.20, 1, 0.60, "body"], [-0.305, 0.30, 0.39, 0.4, "wing"]],
        8: [[-0.20, 0, 0.60, 1, "body"], [0.34, -0.14, 0.32, 0.72, "shed"]],
        10: [[0, -0.09, 1, 0.82, "body"], [0, 0.41, 1, 0.18, "awning"]],
        11: [
            [0, -0.32, 1, 0.36, "body"],
            [-0.34, 0.18, 0.32, 0.64, "wing"],
            [0.34, 0.18, 0.32, 0.64, "wing"],
        ],
    }.get(i, [[0, 0, 1, 1, "body"]])
    parts = [
        [round(a * w, 3), round(b * depth, 3), round(c * w, 3), round(e * depth, 3), r]
        for a, b, c, e, r in rect
    ]
    area = round(
        sum(q[2] * q[3] * (math.pi / 4 if q[4] == "round" else 1) for q in parts), 2
    )
    if not 60 <= area <= 200:
        raise ValueError(f"size_m: covered footprint {area} m²; expected 60–200 m²")
    wall = m.get("wall_color", WALL[(s[4] + d["id"]) % len(WALL)])
    fam = 1 if i in (2, 3) else 2 if i in (4, 5) else 3 if i in (7, 10) else 0
    roof = m.get("roof_color", ROOF[fam][s[5] % 3])
    if not all(
        isinstance(c, str) and re.fullmatch("#[0-9a-fA-F]{6}", c) for c in (wall, roof)
    ):
        raise ValueError("wall_color and roof_color must be quoted #rrggbb colours")
    props = m.get(
        "props",
        list(
            dict.fromkeys(
                [PROPS[s[k] % len(PROPS)] for k in (6, 7, 8)]
                + [["shade-tree", "kitchen-garden", "banana-clump"][s[22] % 3]]
            )
        ),
    )
    if (
        not isinstance(props, list)
        or len(props) > 8
        or len(set(props)) != len(props)
        or any(v not in PROPS for v in props)
    ):
        raise ValueError("props must be up to eight distinct supported items")
    setback = round(10.3 + (s[9] % 26) / 10, 1)
    lateral = round((s[10] / 255 - 0.5) * 8, 2)
    S = at.cell
    r = (-dy, dx)
    cx = x + 0.5 + (dx * (S / 2 - setback - depth / 2) + r[0] * lateral) / S
    cy = y + 0.5 + (dy * (S / 2 - setback - depth / 2) + r[1] * lateral) / S

    def ll2(lx, lz):
        return [
            round(cx + (r[0] * lx + dx * lz) / S, 7),
            round(cy + (r[1] * lx + dy * lz) / S, 7),
        ]

    main = parts[0]
    door_x = main[0] + (0.18 * w if i == 6 else 0)
    door_z = main[1] + main[3] / 2
    door = ll2(door_x, door_z)
    gate = ll2(door_x, depth / 2 + setback)
    entry = ll2(door_x, depth / 2 + setback - 1.4)
    fields = dict(
        archetype=style,
        wall_color=wall.lower(),
        roof_color=roof.lower(),
        size_m=list(dims),
        facing=face,
        road_side=side,
        props=props,
    )
    return fields, {
        **fields,
        "centre": ll2(0, 0),
        "door": door,
        "gate": gate,
        "entry": entry,
        "frontage": list(front),
        "parts": parts,
        "door_x": round(door_x, 3),
        "setback_m": setback,
        "footprint_m2": area,
        "path_width_m": round(1.2 + (s[11] % 7) / 10, 1),
        "weathering": round(0.12 + s[12] / 255 * 0.55, 3),
        "seed": int.from_bytes(s[13:17], "little"),
        "style": i,
    }
