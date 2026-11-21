"""Optional deterministic retargeter; not needed to build or serve the atlas. See README.md and library/CREDITS.html."""

from pathlib import Path
import gzip, json, struct, math, numpy as np, sys, hashlib
from scipy.spatial.transform import Rotation as Rot, Slerp

if len(sys.argv) != 2:
    raise SystemExit(
        "Usage: python3 tools/bake-traveller-actions.py /path/to/AnimationLibrary_Godot_Standard.glb (numpy and scipy required)"
    )
root = Path(__file__).resolve().parents[1]
model = root / "static/library/models"
b = Path(sys.argv[1]).read_bytes()
jl = struct.unpack_from("<I", b, 12)[0]
g = json.loads(b[20 : 20 + jl])
buf = b[28 + jl :]
ns = g["nodes"]
names = {n["name"]: i for i, n in enumerate(ns)}
pr = {c: i for i, n in enumerate(ns) for c in n.get("children", [])}


def acc(i):
    a = g["accessors"][i]
    view = g["bufferViews"][a["bufferView"]]
    cols = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[a["type"]]
    assert a["componentType"] == 5126 and "byteStride" not in view
    return (
        np.frombuffer(
            buf,
            "<f4",
            a["count"] * cols,
            view.get("byteOffset", 0) + a.get("byteOffset", 0),
        )
        .astype(float)
        .reshape(-1, cols)
    )


A = {a["name"]: a for a in g["animations"]}


def curves(name):
    clips = {}
    end = 0
    for ch in A[name]["channels"]:
        t = ch["target"]
        sa = A[name]["samplers"][ch["sampler"]]
        time = acc(sa["input"]).ravel()
        values = acc(sa["output"])
        end = max(end, time[-1])
        assert sa.get("interpolation", "LINEAR") == "LINEAR"
        clips[t["node"], t["path"]] = (
            time,
            values,
            Slerp(time, Rot.from_quat(values))
            if t["path"] == "rotation" and len(time) > 1
            else None,
        )
    return clips, end


order = sorted(
    range(len(ns)),
    key=lambda i: len(
        (lambda f: f(f, i))(lambda s, i: [i] + s(s, pr[i]) if i in pr else [i])
    ),
)


def eval_(cs, t):
    wp = {}
    wq = {}
    ws = {}
    for i in order:
        n = ns[i]
        vals = {}
        for k, d in [
            ("rotation", [0, 0, 0, 1]),
            ("translation", [0, 0, 0]),
            ("scale", [1] * 3),
        ]:
            if (i, k) in cs:
                a, b, sl = cs[i, k]
                tv = np.clip(t, a[0], a[-1])
                vals[k] = (
                    sl(tv)
                    if sl
                    else (
                        Rot.from_quat(b[0])
                        if k == "rotation"
                        else np.array([np.interp(tv, a, z) for z in b.T])
                    )
                )
            else:
                vals[k] = (
                    Rot.from_quat(n.get(k, d))
                    if k == "rotation"
                    else np.array(n.get(k, d))
                )
        p, q, s = vals["translation"], vals["rotation"], vals["scale"]
        j = pr.get(i)
        wp[i], wq[i], ws[i] = (
            (wp[j] + wq[j].apply(ws[j] * p), wq[j] * q, ws[j] * s)
            if j is not None
            else (p, q, s)
        )
    return wp, wq


# Each exported field joint is an absolute, bind-to-pose rigid transform. Map world rotation deltas
# through the half-turn between GLTF and the atlas, then compose using the traveller's own bind lengths.
if __name__ == "__main__":
    ref, rq = eval_(curves("A_TPose")[0], 0)
    axis = Rot.from_euler("y", np.pi)
    hip = names["DEF-hips"]
    cachepose = {}
    clips = {
        "swim": "Swim_Fwd_Loop",
        "tread": "Swim_Idle_Loop",
        "launch": "Jump_Start",
        "jump": "Jump_Loop",
        "land": "Jump_Land",
    }
    for k, nm in clips.items():
        cs, end = curves(nm)
        loop = nm.endswith("Loop")
        N = max(12, int(np.ceil(end * 22)))
        dur = float(end)
        time = np.linspace(0, dur, N, endpoint=not loop)
        frames = []
        for t in time:
            p, q = eval_(cs, t)
            frames.append(
                (
                    axis.apply(p[hip] - ref[hip]),
                    {k: axis * v * rq[k].inv() * axis.inv() for k, v in q.items()},
                )
            )
        cachepose[k] = (dur, loop, frames)
    for style in ["man", "woman"]:
        p = model / ("traveller-" + style + ".model.gz")
        d = json.loads(gzip.decompress(p.read_bytes()))
        bn = d["bones"]
        N = len(bn)
        rest = np.array([o["p"] for o in bn])
        nsT = {o["name"]: i for i, o in enumerate(bn)}
        parents = {}
        mapping = {}

        def bone(n, src, par):
            mapping[nsT[n]] = names["DEF-" + src] if src else None
            parents[nsT[n]] = None if par is None else nsT[par]

        prev = None
        for n, src in [
            ("Root", None),
            ("Body", None),
            ("Hips", "hips"),
            ("Abdomen", "spine.001"),
            ("Torso", "spine.002"),
            ("Chest", "spine.003"),
            ("Neck", "neck"),
            ("Head", "head"),
        ]:
            bone(n, src, prev)
            prev = n
        for s in "LR":
            prev = "Chest"
            for n, src in [
                ("Shoulder", "shoulder"),
                ("UpperArm", "upper_arm"),
                ("LowerArm", "forearm"),
                ("Wrist", "hand"),
            ]:
                bone(n + s, src + "." + s, prev)
                prev = n + s
            for n, src in [
                ("Index", "f_index"),
                ("Middle", "f_middle"),
                ("Pinky", "f_pinky"),
                ("Ring", "f_ring"),
                ("Thumb", "thumb"),
            ]:
                prev = "Wrist" + s
                for i in range(1, 5):
                    n0 = n + str(i) + s
                    if n0 in nsT:
                        bone(n0, src + ".%02d." % min(i, 3) + s, prev)
                        prev = n0
            prev = "Hips"
            for n, src in [
                ("UpperLeg", "thigh"),
                ("LowerLeg", "shin"),
                ("Foot", "foot"),
            ]:
                bone(n + s, src + "." + s, prev)
                prev = n + s
            bone("PT" + s, "shin." + s, "LowerLeg" + s)
        assert len(mapping) == N, (
            len(mapping),
            N,
            set(nsT) - set(bn[i]["name"] for i in mapping),
        )
        scale = (rest[7, 1] - rest[2, 1]) / (ref[names["DEF-head"]][1] - ref[hip][1])
        ident = Rot.identity()
        for key, (end, loop, frames) in cachepose.items():
            poses = []
            mouths = []
            head = nsT["Head"]
            mouth = np.array([0, d["height"] * 0.91, -0.077]) - rest[head]
            for off, rots in frames:
                pose = np.zeros((N, 7))
                qs = {}
                for i in parents:
                    j = parents[i]
                    q = rots[mapping[i]] if mapping[i] != None else ident
                    qs[i] = q
                    pose[i, 3:] = q.as_quat()
                    pose[i, :3] = (
                        rest[i]
                        if j is None
                        else pose[j, :3] + qs[j].apply(rest[i] - rest[j])
                    )
                    if i == 2:
                        pose[i, :3] += off * scale
                mouths.append(pose[head, 1] + qs[head].apply(mouth)[1])
                poses.append(pose)
            if key in ["swim", "tread"]:
                offset = (
                    d["hipHeight"]
                    + 0.13
                    + (0.065 if key == "tread" else 0.045)
                    - np.mean(mouths)
                )
                for pose in poses:
                    pose[:, 1] += offset
            d["clips"][key] = {
                "src": clips[key],
                "source": "Quaternius / Universal Animation Library (Standard), CC0",
                "loop": loop,
                "seconds": round(end, 6),
                "poses": [f.round(5).flatten().tolist() for f in poses],
            }
            print(
                style,
                key,
                len(poses),
                end,
                "mean mouth rel.water",
                round(float(np.mean(mouths) + offset - d["hipHeight"] - 0.13), 3)
                if key in ["swim", "tread"]
                else "-",
                flush=True,
            )
        p.write_bytes(
            gzip.compress(
                json.dumps(d, separators=(",", ":")).encode(), compresslevel=9, mtime=0
            )
        )
