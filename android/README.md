# Telugu States Atlas · Android 7.14.0 (71400)

**Install:** open `Telugu-States-Atlas.apk` in this folder on Android 8.0 or later. This field build has the same application ID and signing certificate as 7.13.0, with a higher version code. It can be installed over that build without clearing its local data. The application does not request Internet, location, or storage permissions. Use an up-to-date Android System WebView for interactive 3D; the bilingual 2D map is the fallback.

**Files:** `src/` is the native WebView host and local asset router; `res/` contains launcher resources; `console/` is a small offline return-to-map page. The manifest and build scripts are here. All atlas content and terrain are edited in the **other ZIP's `Hugo-Project/`**, not in a duplicate web tree inside this wrapper.

### Try this version

Search **@palnadu_demo01**. The new roster has 133 fictional households and 133 one-acre fields across ten villages; the remaining 51 districts have no seed households. Houses occupy fixed 9- or 16-acre residential squares. Short frontage paths meet shared lanes, and the farm tracks follow holding boundaries. Home and Land are beside Settings even in local orbit. Select either and choose **Walk there** (use the stick/WASD) or **Teleport**. Use `/houses/` for the complete new directory. Old demo house links are intentionally retired.

At **Canopy trail** or **Open meadow**, select Heavy rain, wait around half a minute, then select **Clear** or **Cloudy**. Moving streams on the ground stop immediately, including in the monsoon. The soil can stay dark, and a filled hollow drains instead of vanishing. Choose Light rain, Rain or Heavy rain for active precipitation in any season.

At a house door, tap **Enter house**; **Leave house** or walk back out. A repeat visit keeps the same room arrangement.

At **River bend**, pick one surface fleck and watch it pass a rock. At **Reservoir shallows**, the open basin stays quiet. At **Coastal strand**, watch the edge of the water cover a patch of sand and then uncover it. These motions work on foot and in local orbit, including Battery Saver.

See [Verification.md](Verification.md) for the checks, field pictures and limits of the handset simulation. No reset is needed for an upgrade.

### Build locally

Extract **both ZIPs in the same parent directory**. You should see `Hugo-Project/`, `Android/` and `.github/workflows/build-android.yml`. Install Hugo 0.131.0, Python 3.11+, JDK 11 or 17 and Android SDK Platform 35 + Build Tools 35.0.0. No Gradle, Maven, Node dependency install or running web server is required.

```sh
# Run at the common parent. Set JAVA_HOME and ANDROID_HOME to the installed toolchains.
read -rsp 'Keystore password: ' ATLAS_SIGN_PASS; echo; export ATLAS_SIGN_PASS
python3 Android/build_apk.py --site Hugo-Project \
  --keystore /private/path/atlas-signing.p12 --alias atlas-field \
  --out /tmp/Telugu-States-Atlas.apk
unset ATLAS_SIGN_PASS
```

The script renders Hugo into a temporary directory, compiles Java/resources/DEX, embeds the fresh publication, aligns, signs (v2/v3), verifies the signer and compares every embedded web asset with that render. No pinned old publication or hand-edited hash is required for ordinary Markdown edits. Use a new Android `versionCode` and `versionName` for future releases.

Supply a PKCS12 keystore whose key and store passwords match. For a **new, separately signed installation**, generate your own private key with `keytool -genkeypair -storetype PKCS12 -keystore /private/path/atlas-signing.p12 -alias atlas-field -keyalg RSA -keysize 3072 -validity 10000`. A new key cannot upgrade the distributed APK. Do not uninstall a previous build merely to test a new signer if you need its local data; use a separate test device/profile or application ID. No signing secret is in either ZIP.

### Optional manual workflow

To use Actions, put the extracted `.github/workflows/build-android.yml` at the **repository root**, with `Hugo-Project/` and `Android/` beside `.github/`. Add repository secrets `ATLAS_KEYSTORE_B64` (base64 of your private keystore) and `ATLAS_SIGN_PASS`. If needed, set repository variable `ATLAS_KEY_ALIAS` (default `atlas-field`). Run **Build offline atlas APK** manually. The workflow builds only on request, has read-only repository permissions, uploads one one-day artifact and never deploys or commits binaries. `Android/.gitignore` excludes APKs and signing files. Leave the delivered APK out of source control; use the copy in this ZIP to install now.

### Identify this installer

Application ID `com.csrgo.telugustates.fieldtest`, version code `71400`, minimum Android API 26, target API 35. See [Verification.md](Verification.md) for the exact APK and signer hashes, sizes and clean rebuild result.
