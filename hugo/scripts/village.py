"""Dependency-free frontage-first village allocation and generated road geometry.
The full component masks are built offline; the canonical tree's parent never depends on houses.
"""

import gzip, hashlib, json, math, struct
from collections import defaultdict, deque

DIRECTIONS = {"south": (0, -1), "west": (-1, 0), "east": (1, 0), "north": (0, 1)}
OFF = list(DIRECTIONS.values())


def neighbours(p):
    return [(p[0] + dx, p[1] + dy) for dx, dy in OFF]


def reserved(p):
    return p[1] % 3 == 0 or p[0] % 12 == 0


def network_index(at):
    b = (at.f / "village/network.json").read_bytes()
    cfg = at.cfg["village_layout"]
    if hashlib.sha256(b).hexdigest() != cfg["network_sha256"]:
        raise ValueError("Frozen village network index has changed")
    doc = json.loads(b)
    if (
        hashlib.sha256((at.f / "manifest.json").read_bytes()).hexdigest()
        != doc["terrain_sha256"]
    ):
        raise ValueError("Frozen terrain differs from the village network basis")
    return doc["districts"]


class Network:
    def __init__(self, at, d, index):
        self.at = at
        self.d = d
        self.meta = m = index[str(d["id"])]
        b = (at.f / "village" / f"{d['id']}.bin.gz").read_bytes()
        if hashlib.sha256(b).hexdigest() != m["sha256"]:
            raise ValueError(f"{d['name']}: village mask checksum mismatch")
        raw = gzip.decompress(b)
        sig, self.ox, self.oy, self.h, self.w = struct.unpack_from("<4s4i", raw)
        size = (self.h * self.w + 7) // 8
        if sig != b"VIL1" or len(raw) != 20 + 2 * size:
            raise ValueError("Bad village mask format")
        self.roads = memoryview(raw)[20 : 20 + size]
        self.plots = memoryview(raw)[20 + size :]
        self.root = p = tuple(m["road_root"])
        self.cx, self.cy = [
            (val - origin) / at.cell - 0.5
            for val, origin in zip(d["centre_xy"], at.cfg["origin"])
        ]
        self.parent = {p: None}
        self.depth = {p: 0}
        self.q = deque([p])
        self.children = defaultdict(list)
        self.drawn = {p}
        self.taken = set()

    def contains(self, p, mask):
        x, y = p[0] - self.ox, p[1] - self.oy
        if not (0 <= x < self.w and 0 <= y < self.h):
            return False
        i = y * self.w + x
        return bool((mask[i >> 3] >> (i & 7)) & 1)

    def layer(self):
        if not self.q:
            return
        depth = self.depth[self.q[0]]
        while self.q and self.depth[self.q[0]] == depth:
            p = self.q.popleft()
            for v in neighbours(p):
                if v not in self.parent and self.contains(v, self.roads):
                    self.parent[v] = p
                    self.depth[v] = depth + 1
                    self.q.append(v)
                    self.children[p].append(v)

    def walk_back(self, v, cells):
        while v not in cells:
            cells.add(v)
            v = self.parent[v]

    def next_slot(self, u):
        if len(self.taken) >= self.meta["capacity"]:
            raise ValueError(
                f"{u}: {self.d['name']} has reached its connected capacity of {self.meta['capacity']}; no plot was moved"
            )
        layer = list(self.drawn)
        while layer:
            best = None
            for v in layer:
                free = [
                    q
                    for q in neighbours(v)
                    if q not in self.taken and self.contains(q, self.plots)
                ]
                for x, y in free:
                    val = (
                        -len(free),
                        (x - self.cx) ** 2 + (y - self.cy) ** 2,
                        y,
                        x,
                        v[1],
                        v[0],
                    )
                    best = min(best, val) if best is not None else val
            if best:
                _, _, y, x, fy, fx = best
                p = (x, y)
                v = (fx, fy)
                self.walk_back(v, self.drawn)
                self.taken.add(p)
                return {
                    "cell": [x, y],
                    "frontage": [fx, fy],
                    "seq": len(self.taken),
                    "district_id": self.d["id"],
                }
            max_d = max(self.depth[u] for u in layer)
            while self.q and self.depth[self.q[0]] <= max_d:
                self.layer()
            layer = [v for p in layer for v in self.children[p] if v not in self.drawn]
        raise ValueError(
            f"{u}: frozen capacity and reachable road topology disagree in {self.d['name']}"
        )

    def path(self, v, cells):
        if not self.contains(v, self.roads):
            raise ValueError("road side is not on a safe connected street")
        while v not in self.parent and self.q:
            self.layer()
        self.walk_back(v, cells)

    def roads_file(self, homes):
        """Trace actual (not retired) house paths. Collapse degree-two runs to rounded polylines."""
        cells = {self.root} if homes else set()
        for u, house in homes.items():
            try:
                self.path(tuple(house["frontage"]), cells)
            except ValueError as e:
                raise ValueError(f"{u}: {e}") from e
        graph = {p: [] for p in cells}
        edges = []
        for p in sorted(cells):
            q = self.parent[p]
            if q is not None:
                graph[p].append(q)
                graph[q].append(p)
                edges.append([q, p])
        chains = []
        if len(cells) == 1:
            x, y = self.root
            dx, dy = (1, 0) if y % 3 == 0 else (0, 1)
            chains.append(
                [
                    (x + 0.5 - 0.32 * dx, y + 0.5 - 0.32 * dy),
                    (x + 0.5 + 0.32 * dx, y + 0.5 + 0.32 * dy),
                ]
            )
        else:
            seen = set()
            for p, ns in sorted(graph.items()):
                if len(ns) == 2:
                    continue
                for q in sorted(ns):
                    if tuple(sorted((p, q))) in seen:
                        continue
                    line = [p, q]
                    seen.add(tuple(sorted((p, q))))
                    while len(graph[line[-1]]) == 2:
                        v = next(u for u in graph[line[-1]] if u != line[-2])
                        seen.add(tuple(sorted((line[-1], v))))
                        line.append(v)
                    pts = [(x + 0.5, y + 0.5) for x, y in line]
                    # Keep both end centres and continue a short way into their own cells.
                    for k, j, atend in [(0, 1, False), (-1, -2, True)]:
                        if len(graph[line[k]]) == 1:
                            x, y = pts[k]
                            a, b = pts[j]
                            d = math.hypot(x - a, y - b)
                            end = (x + 0.24 * (x - a) / d, y + 0.24 * (y - b) / d)
                            if atend:
                                pts.append(end)
                            else:
                                pts.insert(0, end)
                    chains.append(pts)
        curves = []
        total = 0
        for ci, pts in enumerate(chains):
            pts = rounded(pts, ci + self.d["id"])
            latlon = []
            for x, y in pts:
                lon, lat = self.at.coords(x, y)
                latlon.append([round(lat, 7), round(lon, 7)])
            width = round(3.75 + 0.95 * ((self.d["id"] * 7 + 3 * ci) % 13) / 12, 2)
            total += sum(math.dist(a, b) * self.at.cell for a, b in zip(pts, pts[1:]))
            curves.append({"width_m": width, "xy": pts, "latlon": latlon})
        # End each access on the actual drawn centreline, including turns. The straight
        # line from its plot gate to this join must stay inside that one convex road cell.
        segments = defaultdict(list)
        for curve in curves:
            for a, b in zip(curve["xy"], curve["xy"][1:]):
                for cx in range(
                    math.floor(min(a[0], b[0])), math.floor(max(a[0], b[0])) + 1
                ):
                    for cy in range(
                        math.floor(min(a[1], b[1])), math.floor(max(a[1], b[1])) + 1
                    ):
                        segments[cx, cy].append((a, b))
        joins = {}
        for u, house in homes.items():
            cell = tuple(house["frontage"])
            dx, dy = DIRECTIONS[house["facing"]]
            target = (house["gate"][0] + dx / 2, house["gate"][1] + dy / 2)
            best = None
            for a, b in segments[cell]:
                ux, uy = b[0] - a[0], b[1] - a[1]
                t = max(
                    0.0,
                    min(
                        1.0,
                        ((target[0] - a[0]) * ux + (target[1] - a[1]) * uy)
                        / (ux * ux + uy * uy),
                    ),
                )
                px, py = a[0] + ux * t, a[1] + uy * t
                if (math.floor(px), math.floor(py)) == cell:
                    candidate = ((px - target[0]) ** 2 + (py - target[1]) ** 2, px, py)
                    if best is None or candidate < best:
                        best = candidate
            if best is None:
                raise ValueError(
                    f"{u}: no drawn centreline on its declared frontage {cell}"
                )
            joins[u] = [round(best[1], 7), round(best[2], 7)]
        return {
            "version": 2,
            "access_joins": joins,
            "district_id": self.d["id"],
            "generated": True,
            "root": self.root,
            "capacity": self.meta["capacity"],
            "houses": len(homes),
            "cut_off_plots": self.meta["cut_off_plots"],
            "cells": sorted(cells, key=lambda p: (p[1], p[0])),
            "edges": edges,
            "curves": curves,
            "centreline_length_m": round(total, 2),
            "cells_per_house": round(len(cells) / len(homes), 4) if homes else 0,
        }


def rounded(pts, seed):
    # A shallow bend is entirely contained within its reserved intersection cell.
    path = [pts[0]]
    for a, b, c in zip(pts, pts[1:], pts[2:]):
        u = [v - w for v, w in zip(a, b)]
        v = [i - j for i, j in zip(c, b)]
        nu = math.hypot(*u)
        nv = math.hypot(*v)
        if abs(u[0] * v[1] - u[1] * v[0]) < 1e-8:
            path.append(b)
            continue
        p = [b[i] + 0.13 * u[i] / nu for i in (0, 1)]
        q = [b[i] + 0.13 * v[i] / nv for i in (0, 1)]
        path.append(p)
        for t in (0.25, 0.5, 0.75, 1):
            path.append(
                [
                    p[i] * (1 - t) ** 2 + 2 * t * (1 - t) * b[i] + q[i] * t * t
                    for i in (0, 1)
                ]
            )
    path.append(pts[-1])
    out = []
    for k, (a, b) in enumerate(zip(path, path[1:])):
        dx, dy = b[0] - a[0], b[1] - a[1]
        l = math.hypot(dx, dy)
        if not l:
            continue
        n = max(1, math.ceil(l * 12))
        for j in range(n):
            f = j / n
            wave = 0.008 * math.sin(math.pi * f) ** 2 * math.sin(seed * 1.54 + k * 1.28)
            out.append(
                [
                    round(a[0] + dx * f - wave * dy / l, 7),
                    round(a[1] + dy * f + wave * dx / l, 7),
                ]
            )
    out.append([round(x, 7) for x in pts[-1]])
    return out
