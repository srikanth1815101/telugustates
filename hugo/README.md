# Telugu States by CSRGO · Hugo site (7.1.0 / 70100)

A static, offline-first website for a community land atlas of Telangana and Andhra Pradesh.
The Android app is built from this site — see [`../android/README.md`](../android/README.md).

## Run locally

PowerShell, from this folder:

```powershell
$env:PATH = "C:\Users\csr85\AppData\Local\Programs\Python\Python311;" + $env:PATH
$env:PYTHONUTF8 = "1"

hugo serve -s site --bind 127.0.0.1 --port 1313 --renderToMemory
```

Open **http://127.0.0.1:1313/**. Uses Hugo 0.131.0 (the tested version).

To build a static site for GitHub Pages instead of serving it:

```powershell
hugo --minify -s site -d public
```

`site/static/CNAME` already points at `telugustates.csrgo.com`, so push `public/` to a Pages branch.

## Build pipeline

```powershell
python -S scripts/prepare_site.py --check      # validates 300 houses, 0 changes
python -S scripts/prepare_living.py --check    # 133 derived files, 0 changed
hugo --minify -s site -d /path/to/public
python -S scripts/pack_transport.py --public /path/to/public   # libdeflate repack (Linux)
```

`prepare_release.sh` runs all four steps. `update_economy.py --check` is part of the
release pipeline too; it imports `fcntl`, so it only runs on Linux/macOS.

## Layout

| Folder | Purpose |
|---|---|
| `site/` | Hugo config, layouts, static assets |
| `content/` | 300 resident Markdown records |
| `data/` | Frozen terrain (1,193 tiles), economy, residents |
| `scripts/` | Site preparation and economy tooling |
| `docs/` | Build, controls, nature, economy documentation |
| `config/` | Record cohorts, house style config |