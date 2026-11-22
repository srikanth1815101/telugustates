"""Deterministic engine vs. content release metadata for the Telugu States Android APK.

Separates two update classes:
1. Engine updates (`engineHash`): functionality, JS, shaders, 3D models, animations, CSS,
   Hugo templates, binary terrain/water tiles, or native Android host code -> prompts
   already-installed apps with "Update available".
2. Content updates (`contentHash`): houses, settlements, districts, places, trails, roads,
   treasury resources, world presets, and bilingual copy in `catalog.json` -> fetched live
   by already-installed apps without requiring an APK update.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path

ANDROID_DIR = Path(__file__).resolve().parent
REPO_ROOT = ANDROID_DIR.parent
APP_ID = "com.csrgo.telugustates.fieldtest"
REPO_SLUG = "srikanth1815101/telugustates"
APK_FILENAME = "Telugu-States-Atlas.apk"
DEFAULT_APK_URL = (
    f"https://github.com/{REPO_SLUG}/releases/latest/download/{APK_FILENAME}"
)
DEFAULT_RELEASE_META_URL = (
    f"https://github.com/{REPO_SLUG}/releases/latest/download/app-version.json"
)
DEFAULT_DOMAINS = [
    "https://telugustates.csrgo.com",
]

ENGINE_PATHS = [
    "Hugo-Project/layouts",
    "Hugo-Project/static/atlas.css",
    "Hugo-Project/static/living.css",
    "Hugo-Project/static/js",
    "Hugo-Project/static/vendor",
    "Hugo-Project/static/library",
    "Hugo-Project/static/assets",
    "Hugo-Project/static/art",
    "Hugo-Project/static/fonts",
    "Hugo-Project/static/data",
    "Hugo-Project/static/frozen",
    "Hugo-Project/static/current",
    "Hugo-Project/static/hydraulics",
    "Hugo-Project/static/survey",
    "Hugo-Project/static/ecology",
    "android/src",
    "android/res",
    "android/console",
    "android/AndroidManifest.xml",
]


def _iter_files(p: Path):
    if p.is_file():
        yield p
        return
    if p.is_dir():
        yield from sorted(
            (f for f in p.rglob("*") if f.is_file()),
            key=lambda f: f.as_posix(),
        )


def _normalize_manifest(raw: bytes) -> bytes:
    text = raw.decode("utf-8")
    text = re.sub(r'\bandroid:versionCode="[^"]*"', 'android:versionCode=""', text)
    text = re.sub(r'\bandroid:versionName="[^"]*"', 'android:versionName=""', text)
    return text.encode("utf-8")


def compute_engine_hash(repo_root: Path = REPO_ROOT) -> str:
    root = repo_root.resolve()
    h = hashlib.sha256()
    for rel in ENGINE_PATHS:
        target = root / rel
        for f in _iter_files(target):
            rel_posix = f.relative_to(root).as_posix()
            if rel_posix == "android/AndroidManifest.xml":
                digest = hashlib.sha256(_normalize_manifest(f.read_bytes())).digest()
            else:
                with f.open("rb") as src:
                    digest = hashlib.file_digest(src, "sha256").digest()
            h.update(rel_posix.encode("utf-8") + b"\0" + digest)
    return h.hexdigest()


def read_manifest_version(manifest_path: Path = ANDROID_DIR / "AndroidManifest.xml"):
    text = manifest_path.read_text(encoding="utf-8")
    code_m = re.search(r'\bandroid:versionCode="(\d+)"', text)
    name_m = re.search(r'\bandroid:versionName="([^"]+)"', text)
    if not code_m or not name_m:
        raise ValueError(f"Missing version attributes in {manifest_path}")
    return int(code_m.group(1)), name_m.group(1)


def patch_manifest_version(text: str, version_code: int, version_name: str) -> str:
    out, n1 = re.subn(
        r'\bandroid:versionCode="\d+"',
        f'android:versionCode="{version_code}"',
        text,
        count=1,
    )
    out, n2 = re.subn(
        r'\bandroid:versionName="[^"]+"',
        f'android:versionName="{version_name}"',
        out,
        count=1,
    )
    if n1 != 1 or n2 != 1:
        raise ValueError("Could not patch AndroidManifest.xml version attributes")
    return out


def plan_release(
    repo_root: Path = REPO_ROOT,
    prev_meta_path: Path | None = None,
    run_number: int = 0,
) -> dict:
    manifest_code, manifest_name = read_manifest_version(
        repo_root / "android" / "AndroidManifest.xml"
    )
    engine_hash = compute_engine_hash(repo_root)
    prev = None
    if prev_meta_path and prev_meta_path.is_file():
        try:
            prev = json.loads(prev_meta_path.read_text(encoding="utf-8"))
        except Exception:
            prev = None

    prev_code = int(prev.get("versionCode", 0)) if isinstance(prev, dict) else 0
    prev_engine = str(prev.get("engineHash", "")) if isinstance(prev, dict) else ""

    next_code = max(manifest_code + max(run_number, 0), prev_code + 1)
    parts = manifest_name.split(".")
    if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
        patch = max(next_code - manifest_code, 0)
        next_name = (
            manifest_name if patch == 0 else f"{parts[0]}.{parts[1]}.{patch}"
        )
    else:
        next_name = f"{manifest_name}.{next_code}"

    change_kind = (
        "engine" if (not prev_engine or prev_engine != engine_hash) else "content"
    )
    return {
        "version_code": next_code,
        "version_name": next_name,
        "engine_hash": engine_hash,
        "change_kind": change_kind,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("engine-hash")

    sync_p = sub.add_parser("sync-data")
    sync_p.add_argument(
        "--out",
        type=Path,
        default=REPO_ROOT / "Hugo-Project" / "data" / "app_release.json",
    )

    plan_p = sub.add_parser("plan")
    plan_p.add_argument("--prev", type=Path, default=None)
    plan_p.add_argument(
        "--run-number",
        type=int,
        default=int(os.environ.get("GITHUB_RUN_NUMBER", "0") or "0"),
    )
    plan_p.add_argument("--github-output", type=Path, default=None)

    args = ap.parse_args()
    if args.cmd == "engine-hash":
        print(compute_engine_hash(REPO_ROOT))
    elif args.cmd == "sync-data":
        code, name = read_manifest_version()
        payload = {
            "appId": APP_ID,
            "versionCode": code,
            "versionName": name,
            "engineHash": compute_engine_hash(REPO_ROOT),
            "apkUrl": DEFAULT_APK_URL,
            "releaseMetaUrl": DEFAULT_RELEASE_META_URL,
            "domains": DEFAULT_DOMAINS,
        }
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(payload, indent=2))
    elif args.cmd == "plan":
        plan = plan_release(REPO_ROOT, args.prev, args.run_number)
        if args.github_output:
            with args.github_output.open("a", encoding="utf-8") as fh:
                for k, v in plan.items():
                    fh.write(f"{k}={v}\n")
        print(json.dumps(plan, indent=2))


if __name__ == "__main__":
    main()
