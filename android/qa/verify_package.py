"""Verify every included public byte, the precise omission list and local web targets inside the APK."""

import argparse
import hashlib
import json
import re
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []

    def handle_starttag(self, tag, attrs):
        for k, v in attrs:
            if k in ("href", "src", "poster") and v:
                self.refs.append(v)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("apk", type=Path)
    ap.add_argument("public", type=Path)
    a = ap.parse_args()
    root = a.public
    apk = a.apk
    prefix = "assets/atlas/"
    base = "https://appassets.androidplatform.net/"
    checklinks = 0
    with zipfile.ZipFile(apk) as z:
        assert z.testzip() is None
        entries = {
            p.filename[len(prefix) :]: p
            for p in z.infolist()
            if p.filename.startswith(prefix)
        }
        assert len(z.namelist()) == len(set(z.namelist()))
        assert all(not p.startswith("lib/") for p in z.namelist())
        assert z.read("classes.dex").startswith(b"dex\n")
        allf = {
            p.relative_to(root).as_posix(): p for p in root.rglob("*") if p.is_file()
        }
        omitted = {
            k
            for k in allf
            if k in ("CNAME", ".nojekyll")
            or k.startswith(("frozen/basis/", "frozen/village/", "data/roads/"))
        }
        assert len(omitted) == 128
        assert set(entries) == set(allf) - omitted

        def localref(name, v):
            nonlocal checklinks
            if not v or v.startswith(("#", "data:", "blob:", "mailto:", "tel:")):
                return
            u = urlparse(urljoin(base + name, v))
            if u.hostname != "appassets.androidplatform.net":
                return
            n = unquote(u.path.lstrip("/"))
            assert (
                n in entries
                or (n.rstrip("/") + "/" if n else "") + "index.html" in entries
            ), (name, v, n)
            checklinks += 1

        h = hashlib.sha256()
        total = 0
        for k, e in sorted(entries.items()):
            b = z.read(e)
            assert b == allf[k].read_bytes(), k
            h.update(k.encode() + b"\0" + hashlib.sha256(b).digest())
            total += len(b)
            if k.endswith(".html"):
                l = Links()
                l.feed(b.decode())
                for v in l.refs:
                    localref(k, v)
            if k.endswith(".css"):
                for _, v in re.findall(
                    r"""url\(\s*(['"]?)([^)'"]+)\1\s*\)""", b.decode()
                ):
                    localref(k, v)
            if k.endswith((".js", ".mjs")):
                for v in re.findall(
                    r"""(?:from\s*|import\s*\(|new URL\(\s*)["'](\.\.?/[^"']+)["']""",
                    b.decode(),
                ):
                    localref(k, v)
        assert {
            "frozen/credits.md",
            "frozen/SOURCES.json",
            "frozen/districts.geojson.gz",
            "frozen/states.geojson.gz",
            "ecology/sources.json",
            "frozen/manifest.json",
        } <= entries.keys()
        atlas = json.loads(z.read(prefix + "data/atlas.json"))
        assert all(f"frozen/tiles/{k}.bin" in entries for k in atlas["tiles"])
        assert (
            len(atlas["districts"]) == 61
            and len(atlas["tiles"]) == 1193
            and atlas["total"] == 300
        )
        assert (
            sum(
                k.startswith("houses/")
                and k.endswith("/index.html")
                and k != "houses/index.html"
                for k in entries
            )
            == 300
        )
        nst = len(json.loads(z.read(prefix + "ecology/stops.json")))
        assert nst == 12 and len(entries) == len(allf)-len(omitted) and checklinks >= 3600
        lib=json.loads(z.read(prefix+'library/sources.json')); assignments=json.loads(z.read(prefix+'library/assignments.json'))
        rigids={};surfaces=[]
        for art in lib['files']:
            content=z.read(prefix+'library/'+art['file']);assert hashlib.sha256(content).hexdigest()==art['sha256'];assert art['author'] and art['license']
            if art['file'].startswith('models/'):
                import gzip
                model=json.loads(gzip.decompress(content));assert model['v']==2 and model['id']==art['id'];rigids[art['id']]=model['type']
            else:surfaces.append(art['id'])
        assert {v for tab in assignments.values() for v in tab.values()}|{'traveller-man','traveller-woman'}==set(rigids)
        assert set(surfaces)=={'leafy_grass','brown_mud','coast_sand_02','forest_ground_04','rock_face_03'}
        assert 'js/field-models.js' not in entries and 'library/CREDITS.html' in entries
        with apk.open("rb") as src:
            apksha = hashlib.file_digest(src, "sha256").hexdigest()
        print(
            json.dumps(
                {
                    "file": apk.name,
                    "apk_sha256": apksha,
                    "apk_bytes": apk.stat().st_size,
                    "prior_apk_bytes": 73591948,
                    "model_files": len(rigids), "skinned_models": list(rigids.values()).count("rig"), "surface_photos":len(surfaces),
                    "asset_paths": len(entries),
                    "uncompressed_asset_bytes": total,
                    "mobile_asset_tree_sha256": h.hexdigest(),
                    "districts": len(atlas["districts"]),
                    "tiles": len(atlas["tiles"]),
                    "assigned_acres": atlas["total"],
                    "stops": nst,
                    "local_links_checked": checklinks,
                    "omitted_desktop_files": len(omitted),
                    "omitted_raw_bytes": sum(allf[k].stat().st_size for k in omitted),
                    "filters": [
                        "CNAME",
                        ".nojekyll",
                        "frozen/basis/",
                        "frozen/village/",
                        "data/roads/",
                    ],
                    "all_included_web_files": "byte-identical to pinned walking-test publication after ZIP decompression",
                    "tested_on_physical_phone": False,
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
