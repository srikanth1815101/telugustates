"""Build the offline field APK with stock Android SDK tools; no Maven/Gradle or web server required.

Python 3.11+, JDK 11+, SDK Platform 35 and Build Tools 35.0.0. Set ANDROID_HOME,
JAVA_HOME and ATLAS_SIGN_PASS. Supply your own signing keystore; none is distributed.
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
for _extra in (ROOT, ROOT.parent / "Android"):
    if _extra.is_dir() and str(_extra) not in sys.path:
        sys.path.insert(0, str(_extra))

from release_meta import (  # noqa: E402
    APP_ID,
    DEFAULT_APK_URL,
    DEFAULT_DOMAINS,
    DEFAULT_RELEASE_META_URL,
    compute_engine_hash,
    patch_manifest_version,
    read_manifest_version,
)
from verify_web import verify  # noqa: E402


def files(p):
    return sorted(
        (f for f in p.rglob("*") if f.is_file()),
        key=lambda f: f.relative_to(p).as_posix(),
    )


TEXT_EXTENSIONS = {
    ".css",
    ".js",
    ".mjs",
    ".html",
    ".svg",
    ".json",
    ".csv",
    ".md",
    ".txt",
}


def tree(p):
    h = hashlib.sha256()
    n = size = 0
    for f in files(p):
        with f.open("rb") as src:
            digest = hashlib.file_digest(src, "sha256").digest()
        h.update(f.relative_to(p).as_posix().encode() + b"\0" + digest)
        n += 1
        size += f.stat().st_size
    return {"sha256": h.hexdigest(), "files": n, "bytes": size}


def run(args, **kwargs):
    subprocess.run(list(map(str, args)), check=True, **kwargs)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--site",
        type=Path,
        default=ROOT.parent / "Hugo-Project",
        help="Extracted main Hugo project (not an old publication)",
    )
    ap.add_argument("--keystore", type=Path, required=True)
    ap.add_argument("--alias", default="atlas-field")
    ap.add_argument("--version-code", type=int, default=None)
    ap.add_argument("--version-name", default=None)
    ap.add_argument("--meta-out", type=Path, default=None)
    ap.add_argument("--out", type=Path, default=ROOT / "Telugu-States-Atlas.apk")
    ap.add_argument(
        "--app-id",
        default=None,
        help="Override applicationId to build a separate app that installs side by side",
    )
    ap.add_argument(
        "--app-name",
        default=None,
        help="Override the launcher label (res/values/atlas.xml app_name)",
    )
    ap.add_argument(
        "--pine-color",
        default=None,
        help="Override the pine accent color so the pilot launcher icon is visually distinct",
    )
    args = ap.parse_args()
    site = args.site.resolve()
    out = args.out.resolve()
    app_id = args.app_id or APP_ID
    app_name = args.app_name or "Telugu States"
    pine_color = args.pine_color or "#193C32"
    if not (site / "hugo.toml").is_file() or not (site / "content" / "houses").is_dir():
        raise SystemExit("Pass --site /path/to/extracted/Hugo-Project")
    sdk = Path(os.environ["ANDROID_HOME"])
    bt = sdk / "build-tools/35.0.0"
    api = sdk / "platforms/android-35/android.jar"
    java = Path(os.environ["JAVA_HOME"]) / "bin"
    os.environ["PATH"] = str(java) + os.pathsep + os.environ["PATH"]
    if not os.environ.get("ATLAS_SIGN_PASS"):
        raise SystemExit("Set ATLAS_SIGN_PASS. Do not commit signing credentials.")

    manifest_src = ROOT / "AndroidManifest.xml"
    default_code, default_name = read_manifest_version(manifest_src)
    version_code = args.version_code if args.version_code is not None else default_code
    version_name = args.version_name if args.version_name else default_name
    engine_hash = compute_engine_hash(site.parent)

    with tempfile.TemporaryDirectory(prefix="atlas-android-build-") as td:
        w = Path(td)
        web = w / "publication"
        run(["hugo", "--source", site, "--destination", web, "--minify"])
        catalog_bytes = (web / "catalog.json").read_bytes()
        catalog = json.loads(catalog_bytes)
        rows = catalog["houses"]
        uids = [r["u"] for r in rows]
        cells = [tuple(r["c"]) for r in rows]
        assert len(set(uids)) == len(uids) and len(set(cells)) == len(cells), (
            "Duplicate resident or reserved acre"
        )
        homes = {tuple(r["homeLocation"]) for r in rows}
        assert len(homes) == len(rows) and all(
            r["acreLocation"] == r["c"]
            and r["villageId"]
            and r["court"]["c"] == r["c"]
            for r in rows
        ), "Incomplete or conflicting village assignments"

        meta_path = web / "app-version.json"
        hugo_meta = (
            json.loads(meta_path.read_bytes()) if meta_path.is_file() else {}
        )
        content_hash = hugo_meta.get("contentHash") or hashlib.sha256(
            catalog_bytes
        ).hexdigest()
        release_meta = {
            **hugo_meta,
            "appId": app_id,
            "versionCode": version_code,
            "versionName": version_name,
            "engineHash": engine_hash,
            "contentHash": content_hash,
            "houses": len(rows),
            "apkUrl": hugo_meta.get("apkUrl") or DEFAULT_APK_URL,
            "releaseMetaUrl": hugo_meta.get("releaseMetaUrl")
            or DEFAULT_RELEASE_META_URL,
            "domains": hugo_meta.get("domains") or DEFAULT_DOMAINS,
            "catalogPath": "/catalog.json",
        }
        meta_bytes = json.dumps(
            release_meta, separators=(",", ":"), ensure_ascii=False
        ).encode("utf-8")
        meta_path.write_bytes(meta_bytes)
        if args.meta_out is not None:
            args.meta_out.resolve().parent.mkdir(parents=True, exist_ok=True)
            args.meta_out.resolve().write_bytes(
                json.dumps(release_meta, indent=2, ensure_ascii=False).encode("utf-8")
                + b"\n"
            )

        manifest_patched = w / "AndroidManifest.xml"
        manifest_text = manifest_src.read_text(encoding="utf-8")
        if app_id != APP_ID:
            manifest_text, pkg_swaps = re.subn(
                r'\bpackage="[^"]+"', f'package="{app_id}"', manifest_text, count=1
            )
            if pkg_swaps != 1:
                raise ValueError("Could not patch AndroidManifest.xml package attribute")
        manifest_patched.write_text(
            patch_manifest_version(
                manifest_text,
                version_code,
                version_name,
            ),
            encoding="utf-8",
        )

        source = tree(web)
        # Separate-app variant: rebrand a private copy of the host sources and resources.
        src_dir = ROOT / "src"
        res_dir = ROOT / "res"
        if app_id != APP_ID or app_name != "Telugu States" or pine_color != "#193C32":
            src_dir = w / "src-variant"
            res_dir = w / "res-variant"
            shutil.copytree(ROOT / "src", src_dir)
            shutil.copytree(ROOT / "res", res_dir)
            if app_id != APP_ID:
                for f in sorted(src_dir.rglob("*.java")):
                    text = f.read_text(encoding="utf-8")
                    if APP_ID in text:
                        f.write_text(text.replace(APP_ID, app_id), encoding="utf-8")
            atlas_xml = res_dir / "values" / "atlas.xml"
            text = atlas_xml.read_text(encoding="utf-8")
            text, name_swaps = re.subn(
                r'(<string name="app_name">)[^<]*(</string>)',
                rf"\g<1>{app_name}\g<2>",
                text,
                count=1,
            )
            text, pine_swaps = re.subn(
                r'(<color name="pine">)#[0-9a-fA-F]{6,8}(</color>)',
                rf"\g<1>{pine_color}\g<2>",
                text,
                count=1,
            )
            if name_swaps != 1 or pine_swaps != 1:
                raise ValueError("Could not patch res/values/atlas.xml app_name/pine")
            atlas_xml.write_text(text, encoding="utf-8")
        cl = w / "classes"
        dx = w / "dex"
        cl.mkdir()
        dx.mkdir()
        raw = w / "unsigned.apk"
        run([bt / "aapt2", "compile", "--dir", res_dir, "-o", w / "res.zip"])
        run(
            [
                bt / "aapt2",
                "link",
                "-o",
                raw,
                "--manifest",
                manifest_patched,
                "-I",
                api,
                w / "res.zip",
                "--min-sdk-version",
                "26",
                "--target-sdk-version",
                "35",
            ]
        )
        run(
            [
                java / "javac",
                "-encoding",
                "UTF-8",
                "-g:none",
                "-source",
                "8",
                "-target",
                "8",
                "-bootclasspath",
                str(bt / "core-lambda-stubs.jar") + os.pathsep + str(api),
                "-d",
                cl,
                *sorted(src_dir.rglob("*.java")),
            ]
        )
        run([java / "jar", "cf", w / "app.jar", "-C", cl, "."])
        run(
            [
                bt / "d8",
                "--release",
                "--min-api",
                "26",
                "--lib",
                api,
                "--output",
                dx,
                w / "app.jar",
            ]
        )
        with zipfile.ZipFile(raw, "a", zipfile.ZIP_STORED, allowZip64=False) as z:
            z.write(dx / "classes.dex", "classes.dex")
            for folder, pre in [
                (web, "assets/atlas/"),
                (ROOT / "console", "assets/console/"),
            ]:
                for f in files(folder):
                    name = f.relative_to(folder).as_posix()
                    if folder == web and name in (".nojekyll", "CNAME"):
                        continue
                    compress = (
                        zipfile.ZIP_DEFLATED
                        if f.suffix.lower() in TEXT_EXTENSIONS
                        else zipfile.ZIP_STORED
                    )
                    z.write(
                        f,
                        pre + name,
                        compress_type=compress,
                        compresslevel=9 if compress == zipfile.ZIP_DEFLATED else None,
                    )
        run([bt / "zipalign", "-f", "4", raw, w / "aligned.apk"])
        out.parent.mkdir(parents=True, exist_ok=True)
        run(
            [
                bt / "apksigner",
                "sign",
                "--ks",
                args.keystore.resolve(),
                "--ks-key-alias",
                args.alias,
                "--ks-pass",
                "env:ATLAS_SIGN_PASS",
                "--key-pass",
                "env:ATLAS_SIGN_PASS",
                "--v1-signing-enabled",
                "false",
                "--v2-signing-enabled",
                "true",
                "--v3-signing-enabled",
                "true",
                "--v4-signing-enabled",
                "false",
                "--out",
                w / "signed.apk",
                w / "aligned.apk",
            ]
        )
        run(
            [bt / "apksigner", "verify", "--verbose", "--print-certs", w / "signed.apk"]
        )
        run([bt / "zipalign", "-c", "4", w / "signed.apk"])
        receipt = verify(w / "signed.apk", web)
        shutil.copyfile(w / "signed.apk", out)
    print(
        json.dumps(
            {
                "versionCode": version_code,
                "versionName": version_name,
                "engineHash": engine_hash,
                "contentHash": content_hash,
                "publication": source,
                **receipt,
                "apk": out.name,
                "bytes": out.stat().st_size,
                "sha256": hashlib.sha256(out.read_bytes()).hexdigest(),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
