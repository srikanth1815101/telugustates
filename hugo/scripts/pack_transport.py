"""Losslessly repack gzip containers in a Hugo publication, NEVER the freeze. Same input bytes → same heights/masks/IDs.
Build-time only: Debian libdeflate 1.23; use the pinned publication hash for release reproduction.
"""

import argparse, ctypes as C, ctypes.util, gzip, hashlib, json, zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
F = ROOT / "data/frozen"


def packed():
    lib = C.CDLL(ctypes.util.find_library("deflate") or "libdeflate.so.0")
    fn = lib.libdeflate_alloc_compressor
    fn.argtypes = [C.c_int]
    fn.restype = C.c_void_p
    ptr = fn(12)
    comp = lib.libdeflate_deflate_compress
    comp.argtypes = [C.c_void_p, C.c_void_p, C.c_size_t, C.c_void_p, C.c_size_t]
    comp.restype = C.c_size_t

    def encode(b):
        raw = gzip.decompress(b)
        buf = C.create_string_buffer(len(raw) + 65536)
        n = comp(ptr, raw, len(raw), buf, len(buf))
        assert n
        new = b[:10] + buf.raw[:n] + b[-8:]
        assert gzip.decompress(new) == raw
        return min([b, new], key=len)

    return encode


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--public", type=Path, required=True)
    p.add_argument("--cache", type=Path)
    args = p.parse_args()
    out = args.public.resolve()
    assert (
        (out / "index.html").is_file()
        and ROOT not in (out, F)
        and not out.is_relative_to(F)
    )
    d = out / "frozen/tiles"
    encode = packed()
    manifest = json.loads((F / "manifest.json").read_bytes())
    total = 0
    final = 0
    for k, v in sorted(manifest["tiles"].items()):
        b = (F / "tiles" / (k + ".bin")).read_bytes()
        assert hashlib.sha256(b).hexdigest() == v["sha256"]
        c = (args.cache / (v["sha256"] + ".bin")) if args.cache else None
        if c and c.exists():
            tr = c.read_bytes()
            assert gzip.decompress(tr) == gzip.decompress(b)
        else:
            tr = encode(b)
            if c:
                c.parent.mkdir(parents=True, exist_ok=True)
                c.write_bytes(tr)
        dest = d / (k + ".bin")
        assert not dest.samefile(F / "tiles" / (k + ".bin"))
        dest.write_bytes(tr)
        v.update(
            frozen_sha256=v["sha256"],
            sha256=hashlib.sha256(tr).hexdigest(),
            bytes=len(tr),
        )
        total += len(b)
        final += len(tr)
    (out / "frozen/manifest.json").write_text(
        json.dumps(manifest, separators=(",", ":"), sort_keys=True) + "\n"
    )
    print(
        "Identical uncompressed data in",
        len(manifest["tiles"]),
        "terrain tiles;",
        total,
        "→",
        final,
        "gzip bytes; saved",
        total - final,
    )
