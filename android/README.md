# Telugu States by CSRGO · Android APK build (7.1.0 / 70100)

Builds the signed offline APK from the Hugo site in [`../hugo/`](../hugo/).
Package `com.csrgo.telugustates.fieldtest`, Android 8.0+ (min 26, target 35), v2/v3 signed,
no declared permissions, no server, no network at runtime.

The signed installer for 7.1.0 (70100) is in this folder: `Telugu-States-Atlas.apk`
(SHA-256 `e4374bedbf734119b4d6ba5a1750527af47a59435cea9232f2e605cd8b97ca53`).

## Prerequisites

- Python 3.11+
- JDK 11 (`JAVA_HOME`)
- Android SDK: platform 35 + build tools 35.0.0 (`ANDROID_HOME`)
- A private keystore of your own — **none is distributed**
- Signing password via `ATLAS_SIGN_PASS` env var

## Build

```sh
# 1. Build the Hugo site (from ../hugo)
cd ../hugo
hugo --minify -s site -d /absolute/new-public

# 2. Build the APK
cd ../android
python build_apk.py \
  --public /absolute/new-public \
  --keystore /path/to/your.keystore \
  --alias atlas-field \
  --out Telugu-States-Atlas.apk
```

`build_apk.py` refuses input unless the public tree matches the pinned hash
(2,041 files / 77,605,082 B). A different signing identity cannot update the
existing installation in place.

## Verify

```sh
python qa/verify_package.py Telugu-States-Atlas.apk /absolute/new-public
python qa/record_index.py Telugu-States-Atlas.apk
```

These check every included public byte, the omission list and local web targets.
They take no network input.

## Layout

| Folder | Purpose |
|---|---|
| `build_apk.py` | aapt2 → javac → dex → zipalign → apksigner pipeline |
| `AndroidManifest.xml` | package, SDK versions, permissions (none) |
| `src/` | Java sources for the wrapper |
| `res/` | Icons, drawables, values |
| `console/` | Bundled web console assets |
| `qa/` | APK verification and browser-level test scripts |
