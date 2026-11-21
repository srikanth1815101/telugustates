"""Offline hydraulic stage derivation (metres, not live reservoir levels or a navigation chart).
Usage: python3 tools/bake-water-stages.py [scratch directory]. Requires Node 20, numpy, scipy, shapely, rasterio, pyproj, scikit-image.
Frozen wet observations and mapped lake IDs are authoritative inputs. One still-water datum per pool, longitudinal stations for moving reaches.
"""

from pathlib import Path
import numpy as np, scipy.ndimage as ndi, json, gzip, sys, subprocess, tempfile
from scipy.sparse import coo_matrix, csr_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from scipy.spatial import cKDTree
from skimage.morphology import skeletonize
from shapely.geometry import shape, box
from shapely.ops import transform
from shapely import STRtree
from rasterio.features import rasterize
from affine import Affine
from pyproj import Transformer

root = Path(__file__).resolve().parents[1]
S = root / "static"
dest = S / "hydraulics"
dest.mkdir(exist_ok=True)
tmp = tempfile.TemporaryDirectory() if len(sys.argv) < 2 else None
K = Path(tmp.name if tmp else sys.argv[1])
K.mkdir(exist_ok=True, parents=True)
subprocess.run(["node", root / "tools/read-water-samples.mjs", K], check=True) if not (
    K / "wet.bin"
).exists() or tmp else None
P = json.loads((S / "data/atlas.json").read_text())["project"]
W = P["cols"]
M = P["cell_m"]
Ox, Oy = P["origin"]
wet = np.fromfile(
    K / "wet.bin", dtype=[("id", "<i4"), ("z", "<i2"), ("type", "u1"), ("_", "u1")]
)
wet.sort(order="id")
idx = wet["id"].copy()
x = idx % W
y = idx // W
h = wet["z"].copy()
kind = wet["type"].copy()
del wet
n = len(idx)
geom = json.loads(
    gzip.decompress((root / "tools/hydrolakes-id-footprints.geojson.gz").read_bytes())
)["features"]
project = Transformer.from_crs("EPSG:4326", P["crs"], always_xy=True).transform
polys = [transform(project, shape(f["geometry"])) for f in geom]
tree = STRtree(polys)
pool = np.zeros(n, "i4")


def groups(values):
    order = values.argsort(kind="stable")
    b = np.r_[0, np.flatnonzero(np.diff(values[order])) + 1, len(order)]
    return (order[l:r] for l, r in zip(b[:-1], b[1:]))


for sel in groups((y // 512) * 100 + (x // 512)):
    X = (x[sel[0]] // 512) * 512
    Y = (y[sel[0]] // 512) * 512
    pad = 4
    tr = Affine(M, 0, Ox + (X - pad) * M, 0, M, Oy + (Y - pad) * M)
    q = tree.query(box(*(tr * (0, 0)), *(tr * (520, 520))))
    if not len(q):
        continue
    ras = rasterize(
        [(polys[j], int(j) + 1) for j in sorted(q)],
        out_shape=(520, 520),
        transform=tr,
        all_touched=True,
        dtype="int32",
    )
    if not ras.any():
        continue
    dist, nb = ndi.distance_transform_edt(ras == 0, return_indices=True)
    nearest = ras[tuple(nb)]
    nearest[dist > 2.25] = 0
    pool[sel] = nearest[y[sel] - Y + pad, x[sel] - X + pad]
print("classify", n, "wet;", np.sum(pool > 0), "body-constrained", flush=True)


# Work sparsely; do not allocate a statewide full-resolution label image. Connect across file edges before assigning a level.
def pairs(ids):
    for dx, dy in [(1, 0), (0, 1), (-1, 1), (1, 1)]:
        target = ids + dx + dy * W
        z = np.searchsorted(ids, target).clip(0, len(ids) - 1)
        (a,) = np.nonzero((ids[z] == target) & (np.abs(ids % W - ids[z] % W) <= 1))
        yield a.astype("i4"), z[a].astype("i4")


rest = np.flatnonzero(pool == 0).astype("i4")
p0 = idx[rest]
edges = list(pairs(p0))
a, b = [np.concatenate(v) for v in zip(*edges)]
del edges
C = coo_matrix((np.ones(len(a), "u1"), (a, b)), shape=(len(rest), len(rest))).tocsr()
nc, comp = connected_components(C, directed=False)
del a, b, C, p0
owner = np.zeros(n, "i4")
known = np.unique(pool[pool > 0])
npool = len(known)
owner[pool > 0] = np.searchsorted(known, pool[pool > 0])
isPool = [True] * npool
stations = []
nextid = npool
# Map each river cross section to the same medial station. The centreline is derived from the entire connected wet footprint, not from a hillside gradient.
for chunk in groups(comp):
    sel = rest[chunk]
    nr = len(sel)
    xi = x[sel]
    yi = y[sel]
    x0, x1 = int(xi.min()), int(xi.max())
    y0, y1 = int(yi.min()), int(yi.max())
    L = max(x1 - x0, y1 - y0)
    running = nr >= 7 and L >= 4 and (kind[sel] == 4).any()
    if not running:
        owner[sel] = nextid
        isPool.append(True)
        nextid += 1
        continue
    step = 2 if L < 340 else 3
    X = (xi - x0) // step
    Y = (yi - y0) // step
    mask = np.zeros((Y.max() + 3, X.max() + 3), bool)
    mask[Y + 1, X + 1] = True
    sk = skeletonize(mask)
    sy, sx = np.nonzero(sk)
    m = len(sx)
    if not m:
        raise ValueError("empty river skeleton")
    pos = np.column_stack(
        ((sx - 1) * step + x0 + step * 0.5, (sy - 1) * step + y0 + step * 0.5)
    )
    dist, k = cKDTree(pos).query(np.column_stack((xi + 0.5, yi + 0.5)))
    owner[sel] = nextid + k
    isPool.extend([False] * m)
    nextid += m
print("bodies / stations", nextid, sum(isPool), flush=True)
isPool = np.array(isPool, bool)
count = np.bincount(owner, minlength=nextid)
w = count.clip(1)
X = np.bincount(owner, x, minlength=nextid) / w
Y = np.bincount(owner, y, minlength=nextid) / w
# Median wet elevation, robust to high bank pixels. Small, extreme local dips must not lower an entire network.
sort = np.lexsort((h, owner))
starts = np.r_[0, count.cumsum()[:-1]]
raw = h[sort[(starts + (count * 0.48).astype(int)).clip(0, n - 1)]].astype("f8")
raw[count == 0] = 0
raw[raw == -32768] = 0
del sort, comp, rest
ls = []
for a, b in pairs(idx):
    i = owner[a]
    j = owner[b]
    v = i != j
    lo = np.minimum(i[v], j[v]).astype("i8")
    hi = np.maximum(i[v], j[v])
    ls.append(np.unique(lo * nextid + hi))
keys = np.unique(np.concatenate(ls))
i = (keys // nextid).astype("i4")
j = (keys % nextid).astype("i4")
del keys, ls
L = M * np.hypot(X[i] - X[j], Y[i] - Y[j]).clip(0.4, 9)
L[isPool[i] | isPool[j]] = M * 1.6
A = np.r_[i, j]
B = np.r_[j, i]
net = csr_matrix((np.r_[L, L], (A, B)), shape=(nextid, nextid))
ng, cc = connected_components(net, directed=False)
s = raw.copy()
deg = np.bincount(A, minlength=nextid)
for _ in range(7):
    mean = np.bincount(A, s[B], minlength=nextid) / deg.clip(1)
    m = ~isPool & (deg > 0)
    s[m] += 0.39 * (mean[m] - s[m])
# Make lake observations hard constraints. An outlet below a dam must NEVER pull its upstream pool down to the tailwater. Diffuse noisy elevations along medial stations, not across valley walls.
from scipy.optimize import isotonic_regression

for _ in range(18):
    avg = np.bincount(A, s[B], minlength=nextid) / deg.clip(1)
    m = (~isPool) & (deg > 0)
    s[m] += 0.48 * (avg[m] - s[m]) + 0.025 * (raw[m] - s[m])
# On a reach between junctions the ordered profile is monotone. Split only at actual branches / standing bodies, not tile edges.
ends = (deg != 2) | isPool
visited = np.zeros(nextid, bool)
adj = net.indices
off = net.indptr
for v0 in np.flatnonzero(ends & (deg > 0)):
    for v in adj[off[v0] : off[v0 + 1]]:
        if ends[v] or visited[v]:
            continue
        a = int(v0)
        run = []
        while not ends[v] and not visited[v]:
            run.append(v)
            visited[v] = True
            b = adj[off[v] : off[v + 1]]
            a, v = v, (b[1] if b[0] == a else b[0])
        if run:
            low, high = sorted([s[v0], s[v]])
            s[run] = np.clip(
                isotonic_regression(s[run], increasing=s[v] >= s[v0]).x, low, high
            )
# Prefer a gentle ordinary grade, within a limited correction of the longitudinal observations. In steep headwaters retain the observed fall rather than excavating hundreds of metres to enforce a universal gradient.
up = np.where(s[i] > s[j], i, j)
down = np.where(up == i, j, i)
cap = 0.008
floor = min(-100, float(s.min() - 2))
N = nextid
u = np.r_[up, down, np.full(N, N)]
v = np.r_[down, up, np.arange(N)]
cost = np.r_[np.zeros(len(L)), L * cap, s - floor]
G = csr_matrix((cost, (u, v)), shape=(N + 1, N + 1))
stage = np.maximum(
    s - np.where(isPool, 0, 2.4), dijkstra(G, indices=N, directed=True)[:N] + floor
)
stage[isPool] = raw[isPool]
ord = s.argsort(kind="stable")
for k in ord:
    if isPool[k]:
        continue
    ne = adj[off[k] : off[k + 1]]
    lower = ne[s[ne] < s[k]]
    stage[k] = max(stage[k], stage[lower].max(initial=-1e8))
assert np.max(np.abs(stage[isPool] - raw[isPool])) == 0
vals = np.rint((stage[owner] + 64) * 16).astype("u2")
assert vals.max() < 32768
vals |= isPool[owner].astype("u2") << 15
# Decoded order is the existing tile's row-major wet cells; no duplicate footprint, coordinates or DEM in the APK.
files = 0
size = 0
for sel in groups((y // 256) * 100 + (x // 256)):
    tx = x[sel[0]] // 256
    ty = y[sel[0]] // 256
    b = gzip.compress(vals[sel].astype("<u2").tobytes(), compresslevel=9, mtime=0)
    (dest / f"{tx}_{ty}.bin.gz").write_bytes(b)
    files += 1
    size += len(b)
# A compact display-resolution stage field is also used when the camera sees beyond the streamed terrain.
far = dest / "survey"
far.mkdir(exist_ok=True)
farKeys = []
for sel in groups((y // 512) * 100 + (x // 512)):
    tx = x[sel[0]] // 512
    ty = y[sel[0]] // 512
    ix = (x[sel] & 511) // 4
    iy = (y[sel] & 511) // 4
    tag = iy * 128 + ix
    si = np.lexsort((stage[owner[sel]], tag))
    tags, st, ct = np.unique(tag[si], return_index=True, return_counts=True)
    out = np.zeros(128 * 128, "<u2")
    out[tags] = vals[sel[si[st + ct // 2]]]
    b = gzip.compress(out.tobytes(), compresslevel=9, mtime=0)
    name = f"{tx}_{ty}"
    (far / (name + ".bin.gz")).write_bytes(b)
    farKeys.append(name)
meta = {
    "version": "HST1",
    "wetCells": n,
    "stageStepMetres": 1 / 16,
    "headOffsetMetres": 64,
    "stageTiles": files,
    "stageBytesGzip": size,
    "hydrolakesBodies": int(npool),
    "standingNodes": int(isPool.sum()),
    "runningStations": int((~isPool).sum()),
    "graphEdges": len(i),
    "preferredLowlandGrade": cap,
    "surveyStep": 4,
    "surveyPages": farKeys,
    "notes": "Fixed, illustrative potential solved over the frozen water network; not live levels, bathymetry, or dam data.",
}
(dest / "sources.json").write_text(json.dumps(meta, indent=1) + "\n")
print({k: v for k, v in meta.items() if k != "surveyPages"}, flush=True)
np.savez(
    K / "audit.npz",
    idx=idx,
    body=pool,
    owner=owner,
    stage=stage,
    raw=raw,
    still=isPool,
    up=up,
    down=down,
    length=L,
    count=count,
)
subprocess.run([sys.executable, root / "tools/bake-vector-heads.py", K], check=True)
