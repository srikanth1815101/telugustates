"""Retarget Quaternius' Casual character Jump onto both existing skinned travellers, keeping the target bone lengths. Motor owns translation; this clip owns articulation. Optional --extract DIR reads converted Casual_Male/Female.glb; otherwise uses bundled CC0 sampled motion."""

from pathlib import Path
from scipy.spatial.transform import Rotation as R
import json, gzip, numpy as np, runpy, sys, hashlib

D = Path(__file__).resolve().parent
I = D / "casual-jump-tracks.json.gz"
names = ["Hips", "Torso", "Neck", "Head"] + [
    p + s
    for s in "LR"
    for p in [
        "UpperLeg",
        "LowerLeg",
        "Foot",
        "Shoulder",
        "UpperArm",
        "LowerArm",
        "Fist",
    ]
]
ex = len(sys.argv) > 1 and sys.argv[1] == "--extract"
tracks = {}
if ex:
    inputs = Path(sys.argv[2])
    for st, name in [("man", "Male"), ("woman", "Female")]:
        file = inputs / ("Casual_" + name + ".glb")
        sys.argv = ["glb-reader", str(file)]
        f = runpy.run_path(str(D / "bake-traveller-actions.py"))
        c, t = f["curves"]("Jump")
        frames = []
        for u in np.linspace(0, 1, 101):
            p, q = f["eval_"](c, u * t)
            frames.append([np.round(p[f["names"][k]], 6).tolist() for k in names])
        tracks[st] = {
            "sourceFile": file.name,
            "sourceGLBSha256": hashlib.sha256(file.read_bytes()).hexdigest(),
            "clip": "Jump",
            "license": "CC0 1.0",
            "frames": frames,
        }
    I.write_bytes(
        gzip.compress(json.dumps(tracks, separators=(",", ":")).encode(), mtime=0)
    )
else:
    tracks = json.loads(gzip.decompress(I.read_bytes()))
axis = R.from_euler("y", np.pi)
unit = lambda v: v / max(np.linalg.norm(v), 1e-12)
for st, data in tracks.items():
    p = D.parent / "static/library/models" / ("traveller-" + st + ".model.gz")
    d = json.loads(gzip.decompress(p.read_bytes()))
    ix = {b["name"]: i for i, b in enumerate(d["bones"])}
    ref = np.array(d["clips"]["stand"]["poses"][3]).reshape(-1, 7)
    src = np.array(data["frames"])

    def sample(t):
        t = np.clip(t, 0, 1) * 100
        i = min(int(t), 99)
        return dict(zip(names, axis.apply(src[i] * (1 - t + i) + src[i + 1] * (t - i))))

    for name, lo, hi, dur in [
        ("trail-vault", 0.172, 0.619, 1.16),
        ("trail-recover", 0.619, 1, 0.40),
    ]:
        poses = []
        for phase in np.linspace(0, 1, 37 if name == "trail-vault" else 22):
            tt = lo + (hi - lo) * phase
            air = name == "trail-vault"
            z = sample(tt)
            arr = ref.copy()

            def aim(ids, i, j, target, gain=1):
                before = unit(arr[j, :3] - arr[i, :3])
                after = unit(before * (1 - gain) + unit(target) * gain)
                e = np.cross(before, after)
                r = R.from_rotvec(
                    unit(e) * np.arctan2(np.linalg.norm(e), np.dot(before, after))
                )
                centre = arr[i, :3].copy()
                arr[ids, :3] = centre + r.apply(arr[ids, :3] - centre)
                arr[ids, 3:] = (r * R.from_quat(arr[ids, 3:])).as_quat()

            aim(list(range(3, 54)), ix["Hips"], ix["Neck"], z["Neck"] - z["Hips"], 0.78)
            for s, sg in [("L", 1), ("R", -1)]:
                Z = sample(
                    tt + (sg * 0.034 * np.sin(np.pi * phase) ** 1.1 if air else 0)
                )
                u, l, e, k = [ix[b + s] for b in ["UpperLeg", "LowerLeg", "Foot", "PT"]]
                a, b, w = [ix[b + s] for b in ["UpperArm", "LowerArm", "Wrist"]]

                def v(m, n):
                    return Z[n + s] - Z[m + s]

                aim([u, l, e, k], u, l, v("UpperLeg", "LowerLeg"), 0.98)
                aim([l, e, k], l, e, v("LowerLeg", "Foot"), 0.97)
                # The source has ankle IK goals; don't let lower-leg rotation turn shoes vertically into the floor. Pitch the shoe as the knee folds, then level it for the strike.
                bend = np.arccos(
                    np.dot(
                        unit(v("UpperLeg", "LowerLeg")), unit(v("LowerLeg", "Foot"))
                    ).clip(-1, 1)
                )
                toe = R.from_euler(
                    "x", -0.23 * bend * (np.sin(phase * np.pi) if air else 0)
                )
                arr[e, 3:] = (toe * R.from_quat(ref[e, 3:])).as_quat()
                fingers = list(range(w + 1, 31 if s == "L" else 54))
                aim([a, b, w] + fingers, a, b, v("UpperArm", "LowerArm"), 0.80)
                aim([b, w] + fingers, b, w, v("LowerArm", "Fist"), 0.84)
            if not air:
                arr[:, 1] += (
                    ref[[ix["FootL"], ix["FootR"]], 1]
                    - arr[[ix["FootL"], ix["FootR"]], 1]
                ).mean()
            poses.append(arr.round(5).flatten().tolist())
        d["clips"][name] = {
            "src": "Jump / " + data["sourceFile"],
            "source": "Quaternius, Ultimate Animated Character Pack (CC0); atlas directional retarget and contact timing",
            "loop": False,
            "seconds": dur,
            "poses": poses,
        }
    # Keep the separate grab action. Remove the superseded small hop/recovery, not unrelated locomotion.
    for k in ["field-hop", "field-absorb"]:
        d["clips"].pop(k, None)
    p.write_bytes(gzip.compress(json.dumps(d, separators=(",", ":")).encode(), mtime=0))
    print(st, p.stat().st_size)
