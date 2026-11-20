"""Dependency-free reader of the frozen acre grid. Coordinates are always (longitude, latitude)."""

from pathlib import Path
from functools import lru_cache
import hashlib, json, gzip, struct, math, heapq
from math import sin, cos, sqrt, log, atan2, asin, radians, degrees

ROOT = Path(__file__).resolve().parents[1]
S = 256
N = S * S
H = 128 * 128
A = 6378137.0
E2 = 1 - (1 - 1 / 298.257223563) ** 2
E = sqrt(E2)


def q(t):
    s = sin(t)
    return (1 - E2) * (s / (1 - E2 * s * s) - log((1 - E * s) / (1 + E * s)) / (2 * E))


def m2(t):
    return cos(t) ** 2 / (1 - E2 * sin(t) ** 2)


u, v = map(radians, (7, -32))
n = (m2(u) - m2(v)) / (q(v) - q(u))
C = m2(u) + n * q(u)


def rho(t):
    return A * sqrt(C - n * q(t)) / n


R0 = rho(radians(-15))


def forward(lon, lat):
    r = rho(radians(lat))
    t = n * radians(lon - 125)
    return r * sin(t), R0 - r * cos(t)


def inverse(x, y):
    v = R0 - y
    r = math.hypot(x, v)
    sign = -1 if n < 0 else 1
    t = atan2(sign * x, sign * v)
    Q = (C - (r * n / A) ** 2) / n
    p = asin(max(-1, min(1, Q / 2)))
    for _ in range(5):
        p -= (q(p) - Q) * (1 - E2 * sin(p) ** 2) ** 2 / (2 * (1 - E2) * cos(p))
    return 125 + degrees(t / n), degrees(p)


def read(p):
    return json.loads(p.read_text())


def jsonbytes(x):
    return (
        json.dumps(x, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"
    ).encode()


class Tile:
    def __init__(self, b, tx, ty):
        raw = gzip.decompress(b)
        assert raw[:8] == b"TSA1" + struct.pack("<hh", tx, ty), "invalid tile identity"
        i = 8
        self.z = list(struct.unpack_from("<16384h", raw, i))
        i += H * 2
        for a in range(H):
            if a % 128:
                self.z[a] = ((self.z[a] + self.z[a - 1] + 32768) & 65535) - 32768
        self.slope, self.cls, self.d, self.f = [
            raw[i + k * N : i + (k + 1) * N] for k in range(4)
        ]
        i += N * 4
        self.width = memoryview(raw)[i : i + N * 2]
        i += N * 2
        self.ok = raw[i : i + N // 8]
        self.paths = json.loads(raw[i + N // 8 :])

    def eligible(self, i):
        return bool((self.ok[i // 8] >> (i % 8)) & 1)


class Atlas:
    def __init__(self, root=ROOT):
        self.root = Path(root)
        self.f = self.root / "data/frozen"
        self.cfg = read(self.root / "config/project.json")
        self.ds = read(self.root / "config/districts.json")
        self.ts = read(self.f / "manifest.json")["tiles"]
        self.X, self.Y = self.cfg["origin"]
        self.cell = self.cfg["cell_m"]
        self.identity = hashlib.sha256(
            jsonbytes(self.cfg) + (self.f / "manifest.json").read_bytes()
        ).hexdigest()

    def coords(self, x, y):
        return inverse(self.X + x * self.cell, self.Y + y * self.cell)

    def cell_at(self, lon, lat):
        X, Y = forward(lon, lat)
        return math.floor((X - self.X) / self.cell), math.floor(
            (Y - self.Y) / self.cell
        )

    @lru_cache(maxsize=20)
    def tile(self, tx, ty):
        key = f"{tx}_{ty}"
        b = (self.f / "tiles" / (key + ".bin")).read_bytes()
        if hashlib.sha256(b).hexdigest() != self.ts[key]["sha256"]:
            raise ValueError("Corrupt frozen tile " + key)
        return Tile(b, tx, ty)

    def info(self, x, y):
        if f"{x // S}_{y // S}" not in self.ts:
            raise ValueError("cell outside the atlas")
        t = self.tile(x // S, y // S)
        i = (y % S) * S + x % S
        return t.d[i], t.eligible(i), t.z[(y % S // 2) * 128 + x % S // 2]

    def nearest(self, d, k, taken):
        """Exact branch-and-bound: unopened tile lower bounds must exceed the kth result's squared distance."""
        X, Y = d["centre_xy"]
        cx = (X - self.X) / self.cell - 0.5
        cy = (Y - self.Y) / self.cell - 0.5
        ranked = []
        for key, m in self.ts.items():
            if d["id"] not in m["districts"]:
                continue
            tx, ty = map(int, key.split("_"))
            x = tx * S
            y = ty * S
            dx = max(x - cx, 0, cx - (x + S - 1))
            dy = max(y - cy, 0, cy - (y + S - 1))
            ranked.append((dx * dx + dy * dy, tx, ty))
        best = []
        for lower, tx, ty in sorted(ranked):
            if len(best) == k and lower > -best[0][0]:
                break
            t = self.tile(tx, ty)
            xb = tx * S
            yb = ty * S
            for i, did in enumerate(t.d):
                if did != d["id"] or not t.eligible(i):
                    continue
                x = xb + i % S
                y = yb + i // S
                v = (-((x - cx) ** 2 + (y - cy) ** 2), -y, -x)
                if len(best) == k and v <= best[0] or (x, y) in taken:
                    continue
                if len(best) < k:
                    heapq.heappush(best, v)
                else:
                    heapq.heapreplace(best, v)
        if len(best) < k:
            raise ValueError(f"Not enough eligible cells in {d['name']}")
        return [(-x, -y) for _, y, x in sorted(best, reverse=True)]
