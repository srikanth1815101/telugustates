# Telugu States by CSRGO (7.1.0 / 70100)

Two folders:

- **`hugo/`** — the static website (GitHub Pages-ready). Serve it locally or push to a Pages branch.
- **`android/`** — the signed APK and the build script that produces it.

## Run the site locally

PowerShell, from this folder:

```powershell
$env:PATH = "C:\Users\csr85\AppData\Local\Programs\Python\Python311;" + $env:PATH
$env:PYTHONUTF8 = "1"

hugo serve -s hugo/site --bind 127.0.0.1 --port 1313 --renderToMemory
```

Open **http://127.0.0.1:1313/**. Uses Hugo 0.131.0.

To build a static site instead of serving it:

```powershell
hugo --minify -s hugo/site -d public
```

and push `public/` to a GitHub Pages branch — `hugo/site/static/CNAME` already points at
`telugustates.csrgo.com`.

## Build the APK

```sh
cd android
# 1. Build the Hugo site first
hugo --minify -s ../hugo/site -d /absolute/new-public
# 2. Build the APK (needs JDK 11, Android SDK platform 35 + build tools 35.0.0, your own keystore)
python build_apk.py --public /absolute/new-public --keystore your.keystore --out Telugu-States-Atlas.apk
```

The signed 7.1.0 installer is in `android/Telugu-States-Atlas.apk`.

## Layout

| Folder | Purpose |
|---|---|
| `hugo/site/` | Hugo config, layouts, static assets |
| `hugo/content/` | 300 resident Markdown records |
| `hugo/data/` | Frozen terrain (1,193 tiles), economy, residents |
| `hugo/scripts/` | Site preparation and economy tooling |
| `hugo/docs/`, `hugo/config/` | Documentation and config |
| `android/build_apk.py` | aapt2 → javac → dex → zipalign → apksigner |
| `android/src/`, `res/`, `console/`, `qa/` | Wrapper sources, resources, bundled console, verification |