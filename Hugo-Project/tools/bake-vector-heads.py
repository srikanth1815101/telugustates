"""Fill thin mapped centreline-only branches using stations from the preceding bake-water-stages.py SCRATCH_DIRECTORY run. No sideways terrain samples."""

import numpy as np, json, sys, gzip
from pathlib import Path
from scipy.spatial import cKDTree
from scipy.ndimage import median_filter, gaussian_filter1d

K = Path(sys.argv[1])
D = Path(__file__).resolve().parents[1] / "static"
W = json.loads((D / "data/atlas.json").read_text())["project"]["cols"]
a = np.load(K / "audit.npz")
idx = a["idx"]
xy = np.column_stack((idx % W + 0.5, idx // W + 0.5))
z = a["stage"][a["owner"]]
tree = cKDTree(xy, leafsize=24)
paths = json.load(gzip.open(K / "chains.json.gz"))
rows = {}
stats = []
for X, Y, t, wd, p in paths:
    pos = np.array(p).reshape(-1, 2) / 16 + np.array([X, Y]) * 256
    dist, j = tree.query(pos)
    h = z[j]
    l = np.r_[0, np.cumsum(np.linalg.norm(pos[1:] - pos[:-1], axis=1))]
    known = dist <= 2.4
    if known.any():
        h = np.interp(l, l[known], h[known])
    h = (
        gaussian_filter1d(
            median_filter(h, size=3, mode="nearest"), 1.45, mode="nearest"
        )
        if len(h) > 3
        else h
    )
    stats.extend(dist.tolist())
    rows.setdefault(f"{X}_{Y}", {})[str(t)] = (
        np.rint((h + 64) * 16).astype("u2").tolist()
    )
(D / "hydraulics/paths").mkdir(exist_ok=True)
nb = 0
for k, v in rows.items():
    b = gzip.compress(json.dumps(v, separators=(",", ":")).encode(), mtime=0)
    nb += len(b)
    (D / "hydraulics/paths" / (k + ".json.gz")).write_bytes(b)
print(
    "chain node distances to wet cells (acre-lengths)",
    np.percentile(stats, [0, 50, 95, 99, 100]),
    "path stage bytes",
    nb,
    flush=True,
)
# Correct broad lakes on the pre-existing 32-acre far relief too; do not project the full state map at local resolution.
import struct

buf = gzip.decompress((D / "survey/overview.bin.gz").read_bytes())
cols, rows, step = struct.unpack_from("<HHH", buf, 4)
tag = (idx // W // step) * cols + (idx % W // step)
sort = np.lexsort((z, tag))
tags, starts, ct = np.unique(tag[sort], return_index=True, return_counts=True)
out = np.zeros(cols * rows, "<u2")
sel = ct >= step**2 * 0.12
out[tags[sel]] = np.rint((z[sort[starts[sel] + ct[sel] // 2]] + 64) * 16).astype("u2")
(D / "hydraulics/survey-base.gz").write_bytes(gzip.compress(out.tobytes(), mtime=0))
