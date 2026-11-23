"""Atlas traveller conversion: bake a Quaternius Ultimate Modular People GLB into the
Atlas rig format consumed by art-library.js / traveller.js.

Keeps the historical 62-joint layout (same names, same indices) so gameplay code and
the motion checks need no index changes. Bones absent from the source rig (Body, PTL/PTR,
and the first finger segments the source pack merged away) stay as unskinned shim bones at
their nearest solid parent's bind pose; FK composition always skips them.

Clips are retargeted frame-by-frame in ABSOLUTE atlas space: orientations are transferred
1:1 (both rigs share bind orientation in atlas space), positions are rebuilt by forward
kinematics along the new skeleton with the new bind offsets, and the old root/pelvis
translation deltas are re-applied on top (root delta to Root, pelvis-relative part to Hips).

Usage:
    python3 tools/import-traveller-glb.py --style man --glb /path/Farmer.glb
    python3 tools/import-traveller-glb.py --style woman --glb /path/Casual-woman.glb

Not needed to build or serve the atlas. Inputs are Quaternius pack GLBs (CC0-1.0); do not
commit them. See library/CREDITS.html and library/sources.json.
"""

from pathlib import Path
import argparse, gzip, json, struct, hashlib
import numpy as np
from scipy.spatial.transform import Rotation as Rot

root = Path(__file__).resolve().parents[1]

LAYOUT = [
    "Root", "Body", "Hips", "Abdomen", "Torso", "Chest", "Neck", "Head",
    "ShoulderL", "UpperArmL", "LowerArmL", "WristL",
    "Index1L", "Index2L", "Index3L", "Index4L",
    "Middle1L", "Middle2L", "Middle3L", "Middle4L",
    "Ring1L", "Ring2L", "Ring3L", "Ring4L",
    "Pinky1L", "Pinky2L", "Pinky3L", "Pinky4L",
    "Thumb1L", "Thumb2L", "Thumb3L",
    "ShoulderR", "UpperArmR", "LowerArmR", "WristR",
    "Index1R", "Index2R", "Index3R", "Index4R",
    "Middle1R", "Middle2R", "Middle3R", "Middle4R",
    "Ring1R", "Ring2R", "Ring3R", "Ring4R",
    "Pinky1R", "Pinky2R", "Pinky3R", "Pinky4R",
    "Thumb1R", "Thumb2R", "Thumb3R",
    "UpperLegL", "LowerLegL", "UpperLegR", "LowerLegR",
    "FootL", "PTL", "FootR", "PTR",
]
N = len(LAYOUT)
NAME2IDX = {n: i for i, n in enumerate(LAYOUT)}

def glb_convert(name):
    return name.replace(".", "").replace("Hand", "Wrist")

def fk_parents(solid):
    """Parent map over non-shim bones (FK composes against solid joints only)."""
    PARENT = {}
    def put(child, parent):
        PARENT[NAME2IDX[child]] = NAME2IDX[parent]
    put("Hips", "Root"); put("Abdomen", "Hips"); put("Torso", "Abdomen"); put("Chest", "Torso")
    put("Neck", "Chest"); put("Head", "Neck")
    for s in "LR":
        put("Shoulder" + s, "Chest"); put("UpperArm" + s, "Shoulder" + s)
        put("LowerArm" + s, "UpperArm" + s); put("Wrist" + s, "LowerArm" + s)
        for n in ["Index", "Middle", "Ring", "Pinky", "Thumb"]:
            prev = NAME2IDX["Wrist" + s]
            for i in [n + str(k) + s for k in range(1, 5)]:
                if i not in NAME2IDX:
                    continue
                PARENT[NAME2IDX[i]] = prev
                if NAME2IDX[i] in solid:
                    prev = NAME2IDX[i]
        put("UpperLeg" + s, "Hips"); put("LowerLeg" + s, "UpperLeg" + s); put("Foot" + s, "LowerLeg" + s)
    # shims: static bind leaves (never FK parents)
    PARENT[NAME2IDX["Body"]] = NAME2IDX["Root"]
    for s in "LR":
        i = NAME2IDX["PT" + s]
        if i not in solid:
            PARENT[i] = NAME2IDX["Foot" + s]
    return PARENT

def read_glb(path):
    b = Path(path).read_bytes()
    assert b[:4] == b"glTF"
    jl = struct.unpack_from("<I", b, 12)[0]
    g = json.loads(b[20 : 20 + jl])
    off = 20 + jl
    bl = struct.unpack_from("<I", b, off)[0]
    return g, b[off + 8 : off + 8 + bl]

CTYPE = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NCOLS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}

def acc(g, buf, i):
    a = g["accessors"][i]
    view = g["bufferViews"][a["bufferView"]]
    cols = NCOLS[a["type"]]
    dt = CTYPE[a["componentType"]]
    offset = view.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = view.get("byteStride")
    esize = np.dtype(dt).itemsize
    if stride and stride != esize * cols:
        raw = np.frombuffer(buf, np.uint8)
        out = np.empty((a["count"], cols), dtype=dt)
        for k in range(a["count"]):
            out[k] = np.frombuffer(raw[offset + k * stride : offset + k * stride + esize * cols], dt)
        return out
    return np.frombuffer(buf, dt, a["count"] * cols, offset).reshape(-1, cols)

def mat_of(n):
    t = np.array(n.get("translation", [0, 0, 0]), float)
    s = np.array(n.get("scale", [1, 1, 1]), float)
    q = n.get("rotation", [0, 0, 0, 1])
    M = np.eye(4)
    M[:3, :3] = Rot.from_quat(q).as_matrix() @ np.diag(s)
    M[:3, 3] = t
    return M

def node_world(g):
    ns = g["nodes"]
    parent = {}
    for i, n in enumerate(ns):
        for c in n.get("children", []):
            parent[c] = i
    world = {}
    def visit(i):
        M = mat_of(ns[i])
        world[i] = world[parent[i]] @ M if i in parent else M
        for c in ns[i].get("children", []):
            visit(c)
    for i in range(len(ns)):
        if i not in parent:
            visit(i)
    return world

AXIS = np.diag([-1.0, 1.0, -1.0])
AXIS_Q = Rot.from_euler("y", np.pi)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--style", choices=["man", "woman"], required=True)
    ap.add_argument("--glb", required=True)
    args = ap.parse_args()
    style = args.style
    model = root / "static/library/models" / f"traveller-{style}.model.gz"
    cur = json.loads(gzip.decompress(model.read_bytes()))
    old_bind = np.array([b["p"] for b in cur["bones"]])
    cur_pts = np.array(cur["p"]).reshape(-1, 3)
    cur_min = cur_pts.min(0)
    cur_geom_max_y = float(cur_pts.max(0)[1])

    g, buf = read_glb(args.glb)
    world = node_world(g)
    joints = g["skins"][0]["joints"]
    jnames = [g["nodes"][j]["name"] for j in joints]
    lay = np.empty(len(jnames), dtype=np.int64)
    for gi, nm in enumerate(jnames):
        conv = glb_convert(nm)
        assert conv in NAME2IDX, f"Unmappable joint {nm!r} in {args.glb}"
        lay[gi] = NAME2IDX[conv]
    solid = set(int(v) for v in lay)
    PARENT = fk_parents(solid)
    assert set(PARENT) == set(range(1, N))

    # ---- bake geometry into the joint bind space ---------------------------
    P, Nn, Cc, J, W, IX = [], [], [], [], [], []
    voffset = 0
    geom_min = np.full(3, np.inf)
    geom_max = np.full(3, -np.inf)
    for index, n in enumerate(g["nodes"]):
        if "mesh" not in n:
            continue
        mw = world[index]
        m3 = mw[:3, :3]
        nmat = np.linalg.inv(m3).T
        for prim in g["meshes"][n["mesh"]]["primitives"]:
            a = prim["attributes"]
            pos = acc(g, buf, a["POSITION"]).astype(np.float64)
            nrm = acc(g, buf, a["NORMAL"]).astype(np.float64)
            jp = lay[acc(g, buf, a["JOINTS_0"]).astype(np.int64)]
            wt = acc(g, buf, a["WEIGHTS_0"]).astype(np.float64)
            idx = acc(g, buf, prim["indices"]).astype(np.int64).ravel()
            mat = g["materials"][prim["material"]]
            factor = np.array(mat["pbrMetallicRoughness"]["baseColorFactor"][:3], float)
            pw = (m3 @ pos.T).T + mw[:3, 3]
            nw = (nmat @ nrm.T).T
            nw /= np.linalg.norm(nw, axis=1, keepdims=True)
            geom_min = np.minimum(geom_min, pw.min(0))
            geom_max = np.maximum(geom_max, pw.max(0))
            P.append(pw); Nn.append(nw); Cc.append(np.tile(factor, (len(pw), 1)))
            J.append(jp); W.append(wt); IX.append(idx + voffset)
            voffset += len(pw)
    P = np.concatenate(P); Nn = np.concatenate(Nn); Cc = np.concatenate(Cc)
    J = np.concatenate(J); W = np.concatenate(W); IX = np.concatenate(IX)

    # ---- atlas normalization: metres, half turn, height matched to source ---
    Pa = P @ AXIS.T
    s = cur_geom_max_y / geom_max[1]
    Pa *= s
    def raw_joint(l):
        return world[joints[list(lay).index(NAME2IDX[l])]][:3, 3]
    pa_l = AXIS @ (s * raw_joint("FootL"))
    pa_r = AXIS @ (s * raw_joint("FootR"))
    foot_z = 0.5 * (float(pa_l[2]) + float(pa_r[2]))
    yoff = -float(Pa.min(0)[1])
    t = np.array([0.0, yoff, -foot_z])

    def xf(v):
        return AXIS @ (s * v) + t

    P = Pa + t
    bbox_min, bbox_max = P.min(0), P.max(0)
    assert abs(bbox_min[1]) < 1e-9

    bones = []
    new_bind = np.zeros((N, 3))
    new_bind_q = [None] * N
    lay_of = {int(v): gi for gi, v in enumerate(lay)}
    for i in range(N):
        if i in lay_of:
            gi = lay_of[i]
            M = world[joints[gi]]
            pos = xf(M[:3, 3])
            m3 = M[:3, :3] / np.cbrt(abs(np.linalg.det(M[:3, :3])))
            qgl = Rot.from_matrix(m3)
            qat = AXIS_Q * qgl * AXIS_Q.inv()
        else:
            # shim: sit on its nearest solid parent's bind
            pos = new_bind[PARENT[i]].copy()
            qat = new_bind_q[PARENT[i]] if new_bind_q[PARENT[i]] is not None else Rot.identity()
        new_bind[i] = pos
        new_bind_q[i] = qat
        bones.append({"name": LAYOUT[i], "p": [round(float(v), 5) for v in pos]})

    Nn = (Nn @ AXIS.T)
    Nn /= np.linalg.norm(Nn, axis=1, keepdims=True)

    # ---- clips: orientation copy, FK positions, pelvis/root deltas ----------
    old_bind_root, old_bind_hips = old_bind[0], old_bind[2]
    new_hips_y = new_bind[NAME2IDX["Hips"]][1] - bbox_min[1]
    hip_scale = new_hips_y / (old_bind_hips[1] - cur_min[1])

    clips_out = {}
    for name, clip in cur["clips"].items():
        frames = np.array(clip["poses"], dtype=np.float64).reshape(-1, N, 7)
        out_frames = []
        for pose in frames:
            p_old = pose[:, :3]
            q_old = Rot.from_quat(pose[:, 3:])
            root_delta = (p_old[0] - old_bind_root) * hip_scale
            hip_delta = (p_old[2] - old_bind_hips) * hip_scale
            p_new = np.zeros((N, 3))
            q_new = list(q_old)
            p_new[0] = new_bind[0] + root_delta
            for i in range(1, N):
                if i not in lay_of:
                    p_new[i] = new_bind[i]
                    q_new[i] = new_bind_q[i]
                    continue
                par = PARENT[i]
                off = new_bind[i] - new_bind[par]
                p_new[i] = p_new[par] + q_new[par].apply(off)
                if i == NAME2IDX["Hips"]:
                    p_new[i] = p_new[i] + hip_delta - root_delta
            frame = np.zeros((N, 7))
            frame[:, :3] = p_new
            frame[:, 3:] = np.array([q.as_quat() for q in q_new])
            out_frames.append(frame.round(5).flatten().tolist())
        meta = {k: v for k, v in clip.items() if k != "poses"}
        clips_out[name] = {**meta, "poses": out_frames}

    # ---- soless: sole outline in the bone's bind translation frame ----------
    # The atlas runtime binds with identity rotation (bones carry translation + pose
    # quaternion only), so sole points are stored relative to the bind translation in
    # world-aligned coordinates — no rotation of any bind frame is involved.
    soless = []
    for side, foot in [("L", NAME2IDX["FootL"]), ("R", NAME2IDX["FootR"])]:
        fpos = new_bind[foot]
        mask = J[:, 0] == foot
        local = P[mask] - fpos
        low = local[:, 1].min()
        pts = local[local[:, 1] < low + 0.055]
        if len(pts) > 48:
            ang = np.arctan2(pts[:, 2] - pts[:, 2].mean(), pts[:, 0] - pts[:, 0].mean())
            order = np.argsort(ang, kind="stable")
            pts = pts[order[np.linspace(0, len(order) - 1, 48).astype(int)]]
        pts = np.unique(pts.round(5), axis=0)
        soless.append([[round(float(c), 5) for c in v] for v in pts])

    out = {
        "v": 2, "type": "rig", "id": f"traveller-{style}",
        "p": P.round(5).flatten().tolist(),
        "n": Nn.round(5).flatten().tolist(),
        "c": Cc.round(5).flatten().tolist(),
        "ix": IX.astype(np.int64).tolist(),
        "j": J.astype(np.int64).flatten().tolist(),
        "w": W.round(5).flatten().tolist(),
        "bones": bones,
        "clips": clips_out,
        "height": round(float(bbox_max[1] - bbox_min[1]), 4),
        "hip": 2,
        "hipHeight": round(float(new_hips_y), 5),
        "legs": [[54, 55, 58], [56, 57, 60]],
        "soless": soless,
    }
    data = json.dumps(out, separators=(",", ":")).encode()
    model.write_bytes(gzip.compress(data, compresslevel=9, mtime=0))
    raw, gz = len(data), model.stat().st_size
    print(f"{style}: verts {len(P)} bones {N} raw {raw/1e6:.2f} MB gz {gz/1e6:.2f} MB sha256 {hashlib.sha256(model.read_bytes()).hexdigest()}")
    print(f"   bbox y [{bbox_min[1]:.4f}, {bbox_max[1]:.4f}] hipHeight {out['hipHeight']} hipScale {hip_scale:.4f}")
    print(f"   footBindQ L {new_bind_q[58].as_quat().round(4)} R {new_bind_q[60].as_quat().round(4)} soless {[len(s_) for s_ in soless]}")

if __name__ == "__main__":
    main()
