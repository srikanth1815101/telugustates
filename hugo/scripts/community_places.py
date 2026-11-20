"""Evaluate reviewed local sites against real masks and occupied access. No settlement by spending alone."""

import math
from atlas import Atlas


def site_register(at, reviewed, villages, locked):
    sites = {}
    for r in reviewed:
        key = r["id"]
        d = r["district"]
        xy = r["xy"]
        x, y = map(math.floor, xy)
        pt = (x, y)
        tile = at.tile(x // 256, y // 256)
        k = y % 256 * 256 + x % 256
        v = villages[d]
        typ = r["type"]
        if (
            key in sites
            or typ not in {"path", "well", "bridge", "lights", "school", "health"}
            or len(xy) != 2
            or not r.get("reviewedBy")
            or not r.get("needEvidence")
        ):
            raise ValueError("missing, duplicate or unsupported site review")
        if not v["homes"] or tile.d[k] != d or pt in locked or tile.cls[k] == 5:
            raise ValueError("site requires occupied village and safe vacant parcel")
        dist = min(
            (math.dist(xy, p) * 63.615 for t in v["paths"] for p in t["xy"]),
            default=math.inf,
        )
        if (
            dist > 60
            or typ == "bridge"
            and tile.cls[k] not in (3, 4)
            or typ != "bridge"
            and (tile.cls[k] in (3, 4) or tile.slope[k] > 10)
        ):
            raise ValueError("site unsuitable for project")
        if typ == "bridge":
            banks = r.get("banks", [])
            if len(banks) != 2 or not 3 <= math.dist(*banks) * 63.615 <= 35:
                raise ValueError("bridge requires two nearby banks")
            for b in banks:
                i, j = map(math.floor, b)
                t = at.tile(i // 256, j // 256)
                idx = j % 256 * 256 + i % 256
                if (
                    t.d[idx] != d
                    or t.cls[idx] in (3, 4, 5)
                    or t.slope[idx] > 12
                    or (i, j) in locked
                ):
                    raise ValueError("unsafe bridge abutment")
            if math.dist([(a + b) / 2 for a, b in zip(*banks)], xy) * 63.615 > 4:
                raise ValueError("not a local crossing")
        sites[key] = {
            "district": d,
            "suitable": [typ],
            "xy": xy,
            **({"banks": r["banks"]} if typ == "bridge" else {}),
        }
    return sites


def stage(n, projects):
    kinds = {p["type"] for p in projects}
    return (
        "natural"
        if not n
        else "developed"
        if kinds & {"health", "school"}
        else "connected"
        if kinds & {"bridge", "lights", "path"}
        else "growing"
    )
