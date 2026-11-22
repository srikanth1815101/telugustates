# Telugu States Atlas · Android 7.15.0 (71500)

**Install:** download the latest `Telugu-States-Atlas.apk` from the **Download Android App** button on the Hugo home page (or GitHub Releases `latest`) on Android 8.0 or later. Offline terrain, houses, and 3D assets remain bundled locally, while `INTERNET` permission is used strictly to check `telugustates.csrgo.com` / `telugustates.netlify.app` for live `catalog.json` content updates (applied without requiring an APK update) and engine/model/animation updates (which surface **Update available** inside the installed app). Use an up-to-date Android System WebView for interactive 3D; the bilingual 2D map is the fallback.

**Files:** `src/` is the native WebView host and local asset router; `res/` contains launcher resources; `console/` is a small offline return-to-map page. The manifest and build scripts are here. All atlas content and terrain are edited in the sibling [`Hugo-Project/`](../Hugo-Project/) folder, not in a duplicate web tree inside this wrapper.

### Try this version

Search any registered handle (hashed one-way on device) or pick a household from the district directory. The roster has 133 fictional households and 133 one-acre fields across ten villages; the remaining 51 districts have no seed households. Houses occupy fixed 9- or 16-acre residential squares, and each 3D signboard shows only the household's chosen house or nickname. Short frontage paths meet shared lanes, and the farm tracks follow holding boundaries. Home and Land are beside Settings even in local orbit. Select either and choose **Walk there** (use the stick/WASD) or **Teleport**. Use `/houses/` for the complete directory.

At **Canopy trail** or **Open meadow**, select Heavy rain, wait around half a minute, then select **Clear** or **Cloudy**. Moving streams on the ground stop immediately, including in the monsoon. The soil can stay dark, and a filled hollow drains instead of vanishing. Choose Light rain, Rain or Heavy rain for active precipitation in any season.

At a house door, tap **Enter house**; **Leave house** or walk back out. A repeat visit keeps the same room arrangement.

At **River bend**, pick one surface fleck and watch it pass a rock. At **Reservoir shallows**, the open basin stays quiet. At **Coastal strand**, watch the edge of the water cover a patch of sand and then uncover it. These motions work on foot and in local orbit, including Battery Saver.

See [Verification.md](Verification.md) for the checks, field pictures and limits of the handset simulation. No reset is needed for an upgrade.

### Build locally

Start at the workspace root. `Hugo-Project/`, `Android/` and `.github/workflows/build-android.yml` are already in place; no extraction is needed. Install Hugo 0.131.0, Python 3.11+, JDK 11 or 17 and Android SDK Platform 35 + Build Tools 35.0.0. No Gradle, Maven, Node dependency install or running web server is required.

```sh
# Run at the common parent. Set JAVA_HOME and ANDROID_HOME to the installed toolchains.
read -rsp 'Keystore password: ' ATLAS_SIGN_PASS; echo; export ATLAS_SIGN_PASS
python3 android/build_apk.py --site Hugo-Project \
  --keystore /private/path/atlas-signing.p12 --alias atlas-field \
  --out /tmp/Telugu-States-Atlas.apk
unset ATLAS_SIGN_PASS
```

The script renders Hugo into a temporary directory, compiles Java/resources/DEX, embeds the fresh publication, aligns, signs (v2/v3), verifies the signer and compares every embedded web asset with that render. No pinned old publication or hand-edited hash is required for ordinary Markdown edits. Use a new Android `versionCode` and `versionName` for future releases.

Supply a PKCS12 keystore whose key and store passwords match. For a **new, separately signed installation**, generate your own private key with `keytool -genkeypair -storetype PKCS12 -keystore /private/path/atlas-signing.p12 -alias atlas-field -keyalg RSA -keysize 3072 -validity 10000`. A new key cannot upgrade the distributed APK. Do not uninstall a previous build merely to test a new signer if you need its local data; use a separate test device/profile or application ID. No signing secret is included in this workspace.

### Automated GitHub Actions deployment & two-tier updates

The workflow at [`.github/workflows/build-android.yml`](../.github/workflows/build-android.yml) runs automatically on every push to `main` (and via `workflow_dispatch`):
1. Runs all content, terrain, village, hydrology, and rig verification checks.
2. Computes separate SHA-256 digests via `android/release_meta.py`:
   - **Engine digest (`engineHash`)** — functionality, JS, shaders, 3D models, animations, CSS, layouts, and native Android code. When `engineHash` changes, already-installed apps display **Update available** with a direct link to install the updated APK.
   - **Content digest (`contentHash`)** — houses, settlements, districts, places, trails, treasury resources, and bilingual copy in `catalog.json`. When only content changes, already-installed apps fetch and cache the updated `catalog.json` from `https://telugustates.csrgo.com` (falling back to `https://telugustates.netlify.app`) without requiring an APK update.
3. Publishes `Telugu-States-Atlas.apk` and `app-version.json` to GitHub Releases (`latest`), powering the **Download Android App** button on the Hugo home page. Configure `ATLAS_KEYSTORE_B64` and `ATLAS_SIGN_PASS` secrets (and optional `ATLAS_KEY_ALIAS` variable) to sign with a custom keystore.

### Identify this installer

Application ID `com.csrgo.telugustates.fieldtest`, version code `71400`, minimum Android API 26, target API 35. See [Verification.md](Verification.md) for the exact APK and signer hashes, sizes and clean rebuild result.
