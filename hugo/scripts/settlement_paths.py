"""Compile display trails from stable frontage reservations, never redistribute an acre."""

import math, hashlib, json

U = 63.615


def rnd(p, salt):
    return (
        int.from_bytes(
            hashlib.sha256(f"{p[0]}:{p[1]}:{salt}".encode()).digest()[:4], "big"
        )
        / 2**32
    )


def node(p):
    return [p[i] + 0.5 + (rnd(p, i) - 0.5) * 0.12 for i in range(2)]


def branch(a, b):
    x, y = node(a)
    X, Y = node(b)
    d = math.hypot(X - x, Y - y)
    am = (rnd(min(a, b), 10) - 0.5) * 0.17
    return [
        [
            round(x + (X - x) * t - (Y - y) / d * am * math.sin(math.pi * t), 6),
            round(y + (Y - y) * t + (X - x) / d * am * math.sin(math.pi * t), 6),
        ]
        for t in [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]
    ]


def compile_paths(road, homes, lights=False):
    root = tuple(road["root"])
    parents = {tuple(q): tuple(p) for p, q in road["edges"]}
    needed = set()
    paths = []
    poles = {}
    spans = []
    services = []
    for u, h in sorted(homes.items()):
        p = tuple(h["frontage"])
        seen = set()
        while p != root:
            if p in seen or p not in parents:
                raise ValueError("unreachable " + u)
            seen.add(p)
            needed.add((parents[p], p))
            p = parents[p]
        paths.extend(
            [
                {
                    "type": "entrance",
                    "owner": u,
                    "w": 0.9,
                    "xy": [h["door"], h["entry"], h["gate"]],
                },
                {
                    "type": "footpath",
                    "w": 1.4,
                    "xy": [h["gate"], node(tuple(h["frontage"]))],
                },
            ]
        )

    def pole(pt):
        xy = [round(pt[0] + 0.028, 6), round(pt[1] + 0.024, 6)]
        k = tuple(xy)
        if k not in poles:
            poles[k] = len(poles)
        return poles[k]

    for a, b in sorted(needed):
        line = branch(a, b)
        paths.append({"type": "village", "w": 1.85 + 0.45 * rnd(b, 61), "xy": line})
        if (
            lights is True
            or lights
            and any(math.dist(line[4], pt) <= 1.65 for pt in lights)
        ):
            i, j, k = map(pole, [line[0], line[4], line[8]])
            spans.extend([[i, j], [j, k]])
    if (
        lights
        and homes
        and not poles
        and (lights is True or any(math.dist(node(root), pt) <= 1.65 for pt in lights))
    ):
        pole(node(root))
    pts = list(map(list, poles))
    if pts:
        for u, h in sorted(homes.items()):
            i = min(range(len(pts)), key=lambda i: math.dist(pts[i], h["gate"]))
            dst = h["entry"]
            if math.dist(pts[i], dst) * U < 60:
                services.append([i, dst, u])
    return {
        "v": 1,
        "root": list(root),
        "homes": len(homes),
        "paths": paths,
        "poles": pts,
        "spans": spans,
        "services": services,
        "lit": bool(pts),
        "cellsPerHome": (len(needed) + 1) / len(homes) if homes else 0,
    }
