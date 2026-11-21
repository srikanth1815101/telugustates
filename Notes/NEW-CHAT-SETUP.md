# Hand this workspace to the next chat

**Baseline: Telugu States by CSRGO · 7.14.0 / 71400.** The workspace is already laid out as a repository. There are no release ZIPs to find or unpack. You do not need an Android SDK, signing key, hosted workflow run or deployed website to continue the project.

## 1. Identify the folder to share

Use the folder that directly contains **`Hugo-Project/`, `Android/`, `Notes/`, `.github/` and `.gitignore`** as the repository root. Turn on **Show hidden files** if you cannot see `.github/` or `.gitignore`. Do not use only `Hugo-Project/` as the repository root: that would leave the Android wrapper, workflow and notes behind.

| Confirm this file is present | Why it matters |
|---|---|
| [`Hugo-Project/hugo.toml`](../Hugo-Project/hugo.toml) | The complete editable, offline Hugo source is here. Keep its source data, bundled media and licences. |
| [`Hugo-Project/content/houses/palnadu_demo01.md`](../Hugo-Project/content/houses/palnadu_demo01.md) | One of 133 current fictional house records. [`data/settlements.json`](../Hugo-Project/data/settlements.json) assigns these homes to 10 villages. |
| [`Android/AndroidManifest.xml`](../Android/AndroidManifest.xml) | The wrapper identifies the field release as 7.14.0 / 71400. Its Java source, resources, build scripts and release checks are in the same folder. |
| [`.github/workflows/build-android.yml`](../.github/workflows/build-android.yml) | The **manual Android build**, not a website deployment. `.github/` must remain at the repository root, not under `Android/`. |
| [`Notes/MASTER-PROMPT.md`](MASTER-PROMPT.md) | The next chat’s project brief: purpose, decisions, current behaviour, evidence and limits. [`Notes/history/`](history/) holds past decisions and the original owner brief. |

If you only want to work in the current workspace, **stop here**. Open the files directly. The remaining steps are for an owner who chooses to put the source in a new chat via a repository.

## 2. Put the source in your repository, if you want to

- **Include:** `.github/`, root `.gitignore`, `Hugo-Project/`, `Android/` source and checks, and `Notes/`. Keep the frozen terrain tiles, compressed water data and locally licensed media. They are source inputs for an offline atlas.
- **Keep locally; do not commit:** `Android/Telugu-States-Atlas.apk` is the signed installer, not source. Git ignores it. If you upload with a tool that bypasses Git ignore rules, exclude the APK explicitly; keep your local copy.
- **Never include:** private signing keys, passwords or tokens, generated `Hugo-Project/public/` or `resources/`, dependency folders or old project downloads. Do not upload a retired tree over this one: a merge can leave old `demo_user…` records in place. Back up any separate edits before comparing trees.

On a computer, you can use a Git client to create a local repository at this folder, review the proposed import and publish to a new private repository in your account. A Git client is simpler than selecting thousands of individual files in a browser. If you already have a repository with commits, **clone it, work on a new branch and review the differences**. Do not overwrite `.git/`, erase its history or force-push.

**Command-line option for a new, empty remote only.** In your own account, create an empty repository. Run from the workspace root on your computer; replace `YOUR_REPOSITORY_URL`. Authenticate with your normal Git client, never by pasting a token into chat.

```sh
git init -b main
git check-ignore -v Android/Telugu-States-Atlas.apk
git add -- .gitignore .github Hugo-Project Android Notes
git diff --cached --shortstat
git diff --cached --name-only -- '*.apk' '*.zip' '*.p12' '*.pfx' '*.jks' '*.keystore' '*.idsig'
# That last command should print nothing. Also review the actual staged files.
git commit -m "Import Telugu States Atlas 7.14.0 source and handover"
git remote add origin YOUR_REPOSITORY_URL
git push -u origin main
git rev-parse HEAD
```

Save the **actual repository URL, branch and commit SHA**. In your repository browser, confirm the five paths in the table above exist as files. This imports source; it does not publish a website or release an app.

## 3. Start the new chat

Use a client that supports a repository connection. Grant access to this repository only if possible; read access is enough to start. Select the repository in the new conversation. If it cannot be read, fix the repository selection or supply the source folders in a supported workspace; a private URL alone does not grant access. Do not make a private project public or share credentials to work around that.

**Copy and paste this first message**. Fill in the first line if using a repository; otherwise write “Source: the attached workspace folders.”

```text
Repository: [owner/repo or URL] · Branch: [branch] · Commit: [SHA]
Continue my Telugu States by CSRGO project from the files you can actually read. Start read-only. Read Notes/MASTER-PROMPT.md, Hugo-Project/README.md, Hugo-Project/Villages.md, Android/Verification.md and .github/workflows/build-android.yml. Check Android/AndroidManifest.xml, the actual house files and the settlement register. The baseline is 7.14.0 / 71400. If the source differs, tell me before changing anything. In your first reply, identify the version, household and village counts, what was measured versus untested, and which files govern homes, water and the Android build. Do not reseed villages, restore the 300 retired handles, change balances, sign, push or deploy. Then ask what I want to change next.
```

For a specific next task, add: **“My next task is: … First identify the relevant files, what must stay unchanged, and how you will verify the result.”** For a visual bug, include the place or handle, camera distance, quality/saver settings and a screenshot or clip. For phone performance, include the phone model and Android/System WebView version if known.

## 4. Signing is separate from handing over the source

Do not set signing secrets to give a chat read access. If you later choose to build, follow [`Android/README.md`](../Android/README.md). The manual workflow expects repository **secrets** `ATLAS_KEYSTORE_B64` and `ATLAS_SIGN_PASS`, with optional repository **variable** `ATLAS_KEY_ALIAS`. Set their values privately in the hosting service, not in files, chat, issues or commits. The release signing key is not in this workspace. A different signer cannot update the distributed signed app in place. The prior local checks in [`Android/Verification.md`](../Android/Verification.md) are not a hosted Actions run or a handset test.
