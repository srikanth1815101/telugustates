# Move Telugu States Atlas 7.14 into a repository and start the next chat

You need **no Android SDK, signing key, GitHub Actions run or deployed website** to give the next chat the editable project. The two numbered software ZIPs remain the original tested release. The third, small ZIP is documentation only.

## 1. Assemble the folder

1. Keep your original `01-Hugo-Project.zip` and `02-Android-Workflow-and-APK.zip` somewhere safe. They are also your copy of the signed installer and the rollback baseline. Download `03-New-Chat-Handoff.zip`.
2. Create a new folder, for example `telugu-states-atlas`. Extract **the contents of all three archives into that same folder**. Some archive apps create an extra folder named after each ZIP. If so, move the inner contents up one level, including hidden files. For an existing repo, use a new branch and compare before copying over files; do not replace its `.git/` directory or erase its history.
3. Confirm you can see the files below. On a device that hides dotfiles, enable **Show hidden files**. The action will not appear if `.github/` sits inside `Android/` or inside an extra wrapper directory.

```text
telugu-states-atlas/                 ← repository root
├── .github/workflows/build-android.yml
├── .gitignore
├── Hugo-Project/                    ← editable atlas; keep ALL source and bundled data
│   ├── hugo.toml
│   ├── content/houses/              ← 133 published household files
│   ├── data/settlements.json
│   ├── layouts/  static/  tools/
│   └── README.md
├── Android/                         ← editable wrapper, not another web project
│   ├── AndroidManifest.xml           ← 7.14.0 / 71400
│   ├── build_apk.py  verify_web.py
│   ├── src/  res/  console/  Checks/
│   ├── README.md  Verification.md
│   └── Telugu-States-Atlas.apk       ← local installer; NOT a source commit
├── MASTER-PROMPT.md                  ← the next chat's main instructions
├── NEW-CHAT-SETUP.md                 ← this guide
└── docs/history/                    ← original brief and selected historical evidence
```

**Commit:** `.github/`, root `.gitignore`, `Hugo-Project/`, `Android/` source and checks, and the handoff documents. Keep all *tracked source data*: the small binary tiles, `.gz` charts, locally licensed art/audio/fonts and the JSON registers are needed for offline operation. Do not exclude every binary file.

**Do not commit:** the signed `.apk`, any of the ZIP downloads, `Hugo-Project/public/`, `Hugo-Project/resources/`, `node_modules/`, private keystores (`.p12`, `.jks`, `.keystore`, etc.), passwords, tokens or local secret files. The release already provides root/project/Android ignore rules. Keep `03-New-Chat-Handoff.zip` itself outside the repo. If uploading by a method that bypasses Git ignore rules, first move the installer out of the upload folder. Do not delete your only installer backup.

## 2. Publish the source, not a pair of opaque ZIP files

**Easiest on a computer:** use GitHub Desktop or your usual Git client. Create a new repository at this folder (or add it as a local repository after `git init`). Inspect the changed files, commit the import, then publish to your chosen repository. Keep it private unless you deliberately want to make it public. This avoids manually dragging nearly 5,000 files through a browser upload form. No new workflow for deploying a website is needed.

**Command-line alternative for a NEW, empty remote repository:** create the empty repository in your own GitHub account first. From the assembled local folder, use the following. Replace `YOUR_REPOSITORY_URL` with the remote URL; use your normal authenticated Git client, never a token pasted into chat. If the remote already has commits, **clone it and work on a branch instead**; do not force-push this recipe over existing history.

```sh
git init -b main
git check-ignore -v Android/Telugu-States-Atlas.apk
git add -- .gitignore .github Hugo-Project Android MASTER-PROMPT.md NEW-CHAT-SETUP.md docs/history
git diff --cached --shortstat
git diff --cached --name-only -- '*.apk' '*.zip' '*.p12' '*.pfx' '*.jks' '*.keystore' '*.idsig'
# That last command should print NOTHING. Also review the staged files for credentials.
git commit -m "Import verified Telugu States Atlas 7.14.0 source and handoff"
git remote add origin YOUR_REPOSITORY_URL
git push -u origin main
git rev-parse HEAD
```

Copy your **actual repository URL, branch and commit SHA**. Open the repo in a browser. Verify that `Hugo-Project/hugo.toml`, `Android/AndroidManifest.xml`, `.github/workflows/build-android.yml` and `MASTER-PROMPT.md` open as files without downloading and unzipping anything. These steps upload source, **not** the live site and **not** an app-store release.

## 3. Give the new chat access

Use a chat or client that supports a GitHub repository connector. Grant it access to **this repository only** if possible; read access is sufficient to start. Select/attach the repository in the new conversation. A GitHub account connection alone does not necessarily grant access to a particular private repo. If the client cannot read it, upload the two software ZIPs and `MASTER-PROMPT.md` directly. Do not make a private repository public or share a credential just to fix access.

**Copy this as your first message** (fill the first line with your details):

```text
Repository: [owner/repo or URL] · Branch: [branch] · Commit: [SHA]
Continue my existing Telugu States by CSRGO project. Start read-only. Read the root MASTER-PROMPT.md, Hugo-Project/README.md, Hugo-Project/Villages.md, Android/Verification.md and .github/workflows/build-android.yml. Inspect the actual project and manifest, not just this message. The handoff baseline is 7.14.0 / 71400; if this commit differs, tell me before changing anything. In your first reply, identify the version, household/village counts, what is measured versus untested, and which files govern homes, water and the Android build. Do not reseed villages, restore the 300 retired accounts, change balances, sign, push or deploy. Then ask what I want to change next.
```

If you already have a specific bug or feature, add: **“My next task is: … First show the relevant files, what must stay unchanged, and how you will verify it.”** For visual problems, attach the screenshot or clip, the place/handle, camera distance, phone model, Android/System WebView version, and quality/saver settings if known. A 332 m river complaint should not be closed with a 42 m screenshot.

## 4. Signing is a separate decision

Do **not** configure secrets just to connect the repo to a chat. Only if you later want to run the included manual build, read `Android/README.md`. The workflow expects repository **secrets** `ATLAS_KEYSTORE_B64` and `ATLAS_SIGN_PASS`, and optionally repository **variable** `ATLAS_KEY_ALIAS`. Use the hosting service's secret settings; never put the values in a file, prompt, commit or issue. The historic release key is not in these downloads. A new signer can make a separate test install but cannot update the distributed signed app in place. `Android/Checks/` and `Android/Verification.md` document what was already verified locally; a fresh repo has no hosted workflow success merely by being uploaded.
