"""Short terrain-derived walks, not real-world trail directions; no global path-grid construction."""

import math, heapq, json
from functools import lru_cache
from atlas import Atlas, ROOT
from settlement_paths import U, rnd


def trails(root=ROOT):
    at = Atlas(root)
    stops = json.loads((root / "site/static/ecology/stops.json").read_bytes())
    lock = json.loads((root / "data/residents.lock.json").read_bytes())
    used = {tuple(v["cell"]) for v in lock["houses"].values()}
    res = []

    @lru_cache(maxsize=24000)
    def cell(pt):
        x, y = pt
        if f"{x // 256}_{y // 256}" not in at.ts:
            return None
        t = at.tile(x // 256, y // 256)
        i = y % 256 * 256 + x % 256
        if not t.d[i] or t.cls[i] in (3, 4, 5) or t.slope[i] > 24 or pt in used:
            return None
        return (t.z[(y % 256 // 2) * 128 + x % 256 // 2], t.slope[i], t.f[i])

    for st in stops:
        x, y = st["cell"]
        cand = [
            (x + i, y + j)
            for i in range(-17, 18)
            for j in range(-17, 18)
            if i * i + j * j <= 17**2 and cell((x + i, y + j))
        ]
        if not cand:
            continue
        start = min(
            cand, key=lambda v: ((v[0] - x) ** 2 + (v[1] - y) ** 2, cell(v)[1], v)
        )
        data = set(cand)
        cost = {start: 0}
        parent = {}
        q = [(0, start)]
        while q:
            g, v = heapq.heappop(q)
            if g != cost[v]:
                continue
            for i, j in [
                (1, 0),
                (-1, 0),
                (0, 1),
                (0, -1),
                (1, 1),
                (-1, 1),
                (1, -1),
                (-1, -1),
            ]:
                w = v[0] + i, v[1] + j
                if (
                    w not in data
                    or i * j
                    and ((v[0] + i, v[1]) not in data or (v[0], v[1] + j) not in data)
                ):
                    continue
                l = math.hypot(i, j) * U
                grade = abs(cell(v)[0] - cell(w)[0]) / l
                if grade > 0.25:
                    continue
                z = g + l * (
                    1 + grade * 10 + (cell(w)[1] / 24) ** 2 * 1.4 + rnd(w, 10) * 0.1
                )
                if z < cost.get(w, 1e12):
                    cost[w] = z
                    parent[w] = v
                    heapq.heappush(q, (z, w))
        options = [v for v in cost if 5 <= math.dist(v, start) <= 16]
        if not options:
            continue
        high = max(
            options, key=lambda v: (cell(v)[0] - 0.15 * cell(v)[1] - 0.002 * cost[v], v)
        )
        far = [v for v in options if math.dist(high, v) >= 5]
        ends = [high] + (
            [
                max(
                    far,
                    key=lambda v: (cell(v)[2] * 0.4 - cell(v)[1] - 0.001 * cost[v], v),
                )
            ]
            if far
            else []
        )
        taken = set()
        for t, end in enumerate(ends):
            pts = [end]
            v = end
            while v != start and v not in taken:
                v = parent[v]
                pts.append(v)
            taken.update(pts)
            pts.reverse()
            if len(pts) < 2:
                continue
            hill = max(cell(v)[1] for v in pts) > 10
            kind = (
                "forest"
                if sum(cell(v)[2] for v in pts) / len(pts) > 40
                else "hill"
                if hill
                else "earth"
            )
            xy = [[i + 0.5, j + 0.5] for i, j in pts]
            grade = max(
                abs(cell(v)[0] - cell(w)[0]) / (U * math.dist(v, w))
                for v, w in zip(pts, pts[1:])
            )
            res.append(
                {
                    "id": st["id"] + "-" + str(t),
                    "place": st["id"],
                    "goal": "lookout" if t == 0 else "clearing",
                    "type": kind,
                    "w": 0.9 if kind == "forest" else 1.15,
                    "xy": xy,
                    "ll": [[round(v, 6) for v in at.coords(*pt)] for pt in xy],
                    "maxGrade": round(grade, 5),
                    "source": "Copernicus DEM / frozen land-water mask / ESA WorldCover",
                    "head": list(cell(pts[0])),
                    "end": list(cell(end)),
                }
            )
    return res
