"""Build the offline field APK with stock Android SDK tools; no Maven/Gradle or web server required.

Python 3.11+, JDK 11+, SDK Platform 35 and Build Tools 35.0.0. Set ANDROID_HOME,
JAVA_HOME and ATLAS_SIGN_PASS. A private review keystore is required; none is distributed.
"""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EXPECTED = {
    "sha256": "a631d39b6c3cdd36c18b16ea6c73be71b33d8dd39874ca4f79724d7fcb9961ce",
    "files": 2041,
    "bytes": 77605082
}


def files(p):
    return sorted(
        (f for f in p.rglob("*") if f.is_file()),
        key=lambda f: f.relative_to(p).as_posix(),
    )


# Desktop-only authoring inputs and static-host markers. Do NOT filter terrain tiles, scene modules, licences, or home pages.
# Keep the machine-readable ODbL district/state geometry and both the geography and ecology source receipts.
EXACT_OMISSIONS = {"CNAME", ".nojekyll"}
AUTHORING_PREFIXES = ("frozen/basis/", "frozen/village/", "data/roads/")
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


def mobile_includes(name):
    return name not in EXACT_OMISSIONS and not name.startswith(AUTHORING_PREFIXES)


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
    ap.add_argument("--public", type=Path, required=True)
    ap.add_argument("--keystore", type=Path, required=True)
    ap.add_argument("--alias", default="atlas-field")
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    web = args.public.resolve()
    out = args.out.resolve()
    source = tree(web)
    if source != EXPECTED:
        raise SystemExit(f"Wrong input publication: {source!r}")
    sdk = Path(os.environ["ANDROID_HOME"])
    bt = sdk / "build-tools/35.0.0"
    api = sdk / "platforms/android-35/android.jar"
    java = Path(os.environ["JAVA_HOME"]) / "bin"
    os.environ["PATH"] = str(java) + os.pathsep + os.environ["PATH"]
    if not os.environ.get("ATLAS_SIGN_PASS"):
        raise SystemExit("Set ATLAS_SIGN_PASS. Do not commit signing credentials.")
    with tempfile.TemporaryDirectory(prefix="atlas-android-build-") as td:
        w = Path(td)
        cl = w / "classes"
        dx = w / "dex"
        cl.mkdir()
        dx.mkdir()
        raw = w / "unsigned.apk"
        run([bt / "aapt2", "compile", "--dir", ROOT / "res", "-o", w / "res.zip"])
        run(
            [
                bt / "aapt2",
                "link",
                "-o",
                raw,
                "--manifest",
                ROOT / "AndroidManifest.xml",
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
                *sorted((ROOT / "src").rglob("*.java")),
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
                    if folder == web and not mobile_includes(name):
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
        shutil.copyfile(w / "signed.apk", out)
    print(
        json.dumps(
            {
                "publication": source,
                "apk": out.name,
                "bytes": out.stat().st_size,
                "sha256": hashlib.sha256(out.read_bytes()).hexdigest(),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
