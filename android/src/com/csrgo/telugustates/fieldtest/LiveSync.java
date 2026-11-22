package com.csrgo.telugustates.fieldtest;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.webkit.WebResourceResponse;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import javax.net.ssl.HttpsURLConnection;

/**
 * Offline-first OTA content sync and engine update detector.
 *
 * - Content changes (`contentHash` in catalog.json) are downloaded from the live Hugo site
 *   (trying production `telugustates.csrgo.com` first, then `telugustates.netlify.app`) and
 *   cached on device so new homes, villages, and treasury updates appear without an APK update.
 * - Functionality, animation, 3D model, and native host changes (`engineHash`) surface
 *   `updateAvailable = true` so installed apps prompt the user to install the latest APK.
 */
final class LiveSync {
    static final String APP_ID = "com.csrgo.telugustates.fieldtest";
    static final String DEFAULT_APK_URL =
            "https://github.com/srikanth1815101/telugustates/releases/latest/download/Telugu-States-Atlas.apk";
    private static final String DEFAULT_RELEASE_META_URL =
            "https://github.com/srikanth1815101/telugustates/releases/latest/download/app-version.json";
    private static final int MAX_META_BYTES = 256 * 1024;
    private static final int MAX_CATALOG_BYTES = 16 * 1024 * 1024;

    private final Context context;
    private final Object lock = new Object();
    private JSONObject cachedBundledMeta;
    private String houseTemplateHtml;
    private String houseTemplateSlug;
    private volatile String latestApkUrl = DEFAULT_APK_URL;

    LiveSync(Context context) {
        this.context = context.getApplicationContext();
    }

    private File catalogFile() {
        return new File(context.getFilesDir(), "live-catalog.json");
    }

    private File metaFile() {
        return new File(context.getFilesDir(), "live-meta.json");
    }

    private static byte[] readStream(InputStream in, int maxBytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int total = 0;
        int n;
        while ((n = in.read(buf)) != -1) {
            total += n;
            if (total > maxBytes) throw new IOException("Response exceeds limit");
            out.write(buf, 0, n);
        }
        return out.toByteArray();
    }

    private JSONObject bundledMeta() {
        synchronized (lock) {
            if (cachedBundledMeta != null) return cachedBundledMeta;
            try (InputStream in = context.getAssets().open("atlas/app-version.json", AssetManager.ACCESS_BUFFER)) {
                String text = new String(readStream(in, MAX_META_BYTES), StandardCharsets.UTF_8);
                cachedBundledMeta = new JSONObject(text);
            } catch (IOException | JSONException ignored) {
                cachedBundledMeta = new JSONObject();
            }
            return cachedBundledMeta;
        }
    }

    private JSONObject readLiveMetaLocked(String bundledContentHash) {
        File mf = metaFile();
        File cf = catalogFile();
        if (!mf.isFile() || !cf.isFile() || cf.length() < 512) return null;
        try (InputStream in = new FileInputStream(mf)) {
            JSONObject obj = new JSONObject(new String(readStream(in, MAX_META_BYTES), StandardCharsets.UTF_8));
            if (!bundledContentHash.equals(obj.optString("bundledBaseHash", ""))) {
                // APK was upgraded since this cache was written; fall back to bundled until verified.
                return null;
            }
            return obj;
        } catch (IOException | JSONException ignored) {
            return null;
        }
    }

    InputStream openCatalogIfFresh() {
        synchronized (lock) {
            String bundledHash = bundledMeta().optString("contentHash", "");
            JSONObject liveMeta = readLiveMetaLocked(bundledHash);
            if (liveMeta == null) return null;
            String liveHash = liveMeta.optString("contentHash", "");
            if (liveHash.isEmpty() || liveHash.equals(bundledHash)) return null;
            try {
                return new FileInputStream(catalogFile());
            } catch (IOException ignored) {
                return null;
            }
        }
    }

    InputStream openDynamicHousePage(String assetKey) {
        if (assetKey == null || !assetKey.startsWith("atlas/houses/") || !assetKey.endsWith("/index.html")) {
            return null;
        }
        String slug = assetKey.substring("atlas/houses/".length(), assetKey.length() - "/index.html".length());
        if (!slug.matches("[a-z0-9._]{1,30}") || slug.contains("..")) return null;
        synchronized (lock) {
            if (houseTemplateHtml == null) {
                try {
                    String[] list = context.getAssets().list("atlas/houses");
                    if (list != null) {
                        for (String candidate : list) {
                            if (candidate != null && candidate.matches("[a-z0-9._]{1,30}")) {
                                try (InputStream in = context.getAssets().open("atlas/houses/" + candidate + "/index.html")) {
                                    houseTemplateHtml = new String(readStream(in, MAX_META_BYTES), StandardCharsets.UTF_8);
                                    houseTemplateSlug = candidate;
                                    break;
                                } catch (IOException ignoredInner) {}
                            }
                        }
                    }
                } catch (IOException ignored) {}
            }
            if (houseTemplateHtml == null || houseTemplateSlug == null) return null;
            String rendered = houseTemplateHtml
                    .replace("data-record=\"" + houseTemplateSlug + "\"", "data-record=\"" + slug + "\"")
                    .replace("@" + houseTemplateSlug, "@" + slug)
                    .replace("/u/" + houseTemplateSlug, "/u/" + slug)
                    .replace("/acre/" + houseTemplateSlug, "/acre/" + slug)
                    .replace("/plot/" + houseTemplateSlug, "/plot/" + slug);
            return new ByteArrayInputStream(rendered.getBytes(StandardCharsets.UTF_8));
        }
    }

    static boolean trustedApkUrl(String rawUrl) {
        if (rawUrl == null) return false;
        try {
            URL u = new URL(rawUrl);
            if (!"https".equalsIgnoreCase(u.getProtocol()) || u.getUserInfo() != null) return false;
            String host = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
            String path = u.getPath() == null ? "" : u.getPath();
            if ("github.com".equals(host) && path.startsWith("/srikanth1815101/telugustates/releases/")) {
                return true;
            }
            if (("telugustates.csrgo.com".equals(host) || "telugustates.netlify.app".equals(host))
                    && path.toLowerCase(Locale.ROOT).endsWith(".apk")) {
                return true;
            }
        } catch (IOException ignored) {}
        return false;
    }

    static boolean allowedHost(String host) {
        if (host == null) return false;
        String h = host.toLowerCase(Locale.ROOT);
        return "telugustates.csrgo.com".equals(h)
                || "telugustates.netlify.app".equals(h)
                || "github.com".equals(h)
                || h.endsWith(".githubusercontent.com");
    }

    String resolvedApkUrl() {
        return latestApkUrl != null && !latestApkUrl.isEmpty() ? latestApkUrl : DEFAULT_APK_URL;
    }

    private static byte[] fetchHttps(String urlString, int maxBytes) throws IOException {
        URL current = new URL(urlString);
        for (int hop = 0; hop < 6; hop++) {
            if (!"https".equalsIgnoreCase(current.getProtocol())
                    || current.getUserInfo() != null
                    || !allowedHost(current.getHost())) {
                throw new IOException("Blocked host: " + current.getHost());
            }
            HttpsURLConnection conn = (HttpsURLConnection) current.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(3500);
            conn.setReadTimeout(6500);
            conn.setUseCaches(false);
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("Cache-Control", "no-cache");
            try {
                int code = conn.getResponseCode();
                if (code == HttpURLConnection.HTTP_MOVED_PERM
                        || code == HttpURLConnection.HTTP_MOVED_TEMP
                        || code == HttpURLConnection.HTTP_SEE_OTHER
                        || code == 307
                        || code == 308) {
                    String loc = conn.getHeaderField("Location");
                    if (loc == null || loc.isEmpty()) throw new IOException("Empty redirect");
                    current = new URL(current, loc);
                    continue;
                }
                if (code != HttpURLConnection.HTTP_OK) {
                    throw new IOException("HTTP " + code);
                }
                try (InputStream in = conn.getInputStream()) {
                    return readStream(in, maxBytes);
                }
            } finally {
                conn.disconnect();
            }
        }
        throw new IOException("Too many redirects");
    }

    private static JSONObject fetchValidMeta(String urlString) {
        try {
            byte[] raw = fetchHttps(urlString, MAX_META_BYTES);
            JSONObject obj = new JSONObject(new String(raw, StandardCharsets.UTF_8));
            if (!APP_ID.equals(obj.optString("appId", ""))) return null;
            return obj;
        } catch (IOException | JSONException ignored) {
            return null;
        }
    }

    private List<String> siteDomains(JSONObject bundled) {
        List<String> list = new ArrayList<>();
        JSONArray arr = bundled.optJSONArray("domains");
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                String d = arr.optString(i, "").trim();
                if (d.startsWith("https://")) {
                    while (d.endsWith("/")) d = d.substring(0, d.length() - 1);
                    if (!list.contains(d)) list.add(d);
                }
            }
        }
        if (!list.contains("https://telugustates.csrgo.com")) list.add("https://telugustates.csrgo.com");
        if (!list.contains("https://telugustates.netlify.app")) list.add("https://telugustates.netlify.app");
        return list;
    }

    private boolean downloadAndStoreCatalog(String domain, String expectedContentHash, String bundledContentHash) {
        try {
            byte[] bytes = fetchHttps(domain + "/catalog.json?h=" + expectedContentHash, MAX_CATALOG_BYTES);
            if (bytes.length < 512) return false;
            JSONObject parsed = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            if (parsed.optJSONArray("houses") == null || parsed.optJSONArray("districts") == null) {
                return false;
            }
            synchronized (lock) {
                File dir = context.getFilesDir();
                if (!dir.exists() && !dir.mkdirs()) return false;
                File tmp = new File(dir, "live-catalog.json.tmp");
                try (FileOutputStream out = new FileOutputStream(tmp)) {
                    out.write(bytes);
                    out.getFD().sync();
                }
                File dst = catalogFile();
                if (!tmp.renameTo(dst)) {
                    try (FileOutputStream out = new FileOutputStream(dst)) {
                        out.write(bytes);
                        out.getFD().sync();
                    }
                    //noinspection ResultOfMethodCallIgnored
                    tmp.delete();
                }
                JSONObject meta = new JSONObject();
                meta.put("contentHash", expectedContentHash);
                meta.put("bundledBaseHash", bundledContentHash);
                meta.put("sourceDomain", domain);
                meta.put("syncedAt", System.currentTimeMillis());
                try (FileOutputStream mout = new FileOutputStream(metaFile())) {
                    mout.write(meta.toString().getBytes(StandardCharsets.UTF_8));
                    mout.getFD().sync();
                }
                return true;
            }
        } catch (IOException | JSONException ignored) {
            return false;
        }
    }

    private static final String SYNC_PREFS = "atlas_sync_cache";

    WebResourceResponse cachedSyncResponse(long installedVersionCode, String installedVersionName) {
        JSONObject bundled = bundledMeta();
        String bundledEngineHash = bundled.optString("engineHash", "");
        String defaultApk = bundled.optString("apkUrl", DEFAULT_APK_URL);
        SharedPreferences sp = context.getSharedPreferences(SYNC_PREFS, Context.MODE_PRIVATE);
        long cachedCode = sp.getLong("latestVersionCode", 0L);
        String cachedName = sp.getString("latestVersionName", "");
        String cachedEngine = sp.getString("remoteEngineHash", "");
        String cachedApk = sp.getString("apkUrl", defaultApk);

        boolean updateAvailable = false;
        if (cachedCode > installedVersionCode
                && cachedEngine != null && !cachedEngine.isEmpty()
                && !bundledEngineHash.isEmpty()
                && !cachedEngine.equals(bundledEngineHash)) {
            updateAvailable = true;
            if (cachedApk != null && trustedApkUrl(cachedApk)) {
                latestApkUrl = cachedApk;
            }
        } else if (cachedCode > 0L && cachedCode <= installedVersionCode) {
            sp.edit().clear().apply();
        }

        JSONObject reply = new JSONObject();
        try {
            reply.put("inApp", true);
            reply.put("cached", true);
            reply.put("installedVersionCode", installedVersionCode);
            reply.put("installedVersionName", installedVersionName);
            reply.put("updateAvailable", updateAvailable);
            reply.put("latestVersionCode", updateAvailable ? cachedCode : installedVersionCode);
            reply.put("latestVersionName", updateAvailable ? cachedName : installedVersionName);
            reply.put("apkUrl", (cachedApk != null && !cachedApk.isEmpty()) ? cachedApk : defaultApk);
        } catch (JSONException ignored) {}

        byte[] payload = reply.toString().getBytes(StandardCharsets.UTF_8);
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        headers.put("X-Content-Type-Options", "nosniff");
        return new WebResourceResponse(
                "application/json",
                "UTF-8",
                200,
                "OK",
                headers,
                new ByteArrayInputStream(payload));
    }

    WebResourceResponse syncResponse(long installedVersionCode, String installedVersionName) {
        JSONObject bundled = bundledMeta();
        String bundledContentHash = bundled.optString("contentHash", "");
        String bundledEngineHash = bundled.optString("engineHash", "");

        String activeContentHash;
        synchronized (lock) {
            JSONObject liveMeta = readLiveMetaLocked(bundledContentHash);
            activeContentHash = liveMeta != null
                    ? liveMeta.optString("contentHash", bundledContentHash)
                    : bundledContentHash;
        }

        long stamp = System.currentTimeMillis() / 30000L;
        JSONObject siteMeta = null;
        String activeDomain = "";
        for (String domain : siteDomains(bundled)) {
            JSONObject candidate = fetchValidMeta(domain + "/app-version.json?t=" + stamp);
            if (candidate != null) {
                siteMeta = candidate;
                activeDomain = domain;
                break;
            }
        }

        boolean contentUpdated = false;
        if (siteMeta != null) {
            String remoteContentHash = siteMeta.optString("contentHash", "");
            if (!remoteContentHash.isEmpty() && !remoteContentHash.equals(activeContentHash)) {
                if (remoteContentHash.equals(bundledContentHash)) {
                    synchronized (lock) {
                        //noinspection ResultOfMethodCallIgnored
                        catalogFile().delete();
                        //noinspection ResultOfMethodCallIgnored
                        metaFile().delete();
                    }
                    activeContentHash = bundledContentHash;
                    contentUpdated = true;
                } else if (downloadAndStoreCatalog(activeDomain, remoteContentHash, bundledContentHash)) {
                    activeContentHash = remoteContentHash;
                    contentUpdated = true;
                }
            }
        }

        String releaseMetaUrl = bundled.optString("releaseMetaUrl", DEFAULT_RELEASE_META_URL);
        JSONObject releaseMeta = fetchValidMeta(releaseMetaUrl + "?t=" + stamp);
        JSONObject engineSource = releaseMeta != null ? releaseMeta : siteMeta;

        boolean updateAvailable = false;
        long latestVersionCode = installedVersionCode;
        String latestVersionName = installedVersionName;
        String apkUrl = bundled.optString("apkUrl", DEFAULT_APK_URL);

        if (engineSource != null) {
            String remoteEngineHash = engineSource.optString("engineHash", "");
            long remoteCode = engineSource.optLong("versionCode", installedVersionCode);
            String remoteName = engineSource.optString("versionName", installedVersionName);
            String remoteApk = engineSource.optString("apkUrl", apkUrl);
            if (!remoteApk.isEmpty()) apkUrl = remoteApk;
            SharedPreferences sp = context.getSharedPreferences(SYNC_PREFS, Context.MODE_PRIVATE);
            if (!remoteEngineHash.isEmpty()
                    && !bundledEngineHash.isEmpty()
                    && !remoteEngineHash.equals(bundledEngineHash)
                    && remoteCode > installedVersionCode) {
                updateAvailable = true;
                latestVersionCode = remoteCode;
                latestVersionName = remoteName;
                sp.edit()
                        .putLong("latestVersionCode", remoteCode)
                        .putString("latestVersionName", remoteName)
                        .putString("remoteEngineHash", remoteEngineHash)
                        .putString("apkUrl", apkUrl)
                        .apply();
            } else {
                sp.edit().clear().apply();
            }
        }

        if (!apkUrl.isEmpty() && trustedApkUrl(apkUrl)) {
            latestApkUrl = apkUrl;
        }

        JSONObject reply = new JSONObject();
        try {
            reply.put("inApp", true);
            reply.put("installedVersionCode", installedVersionCode);
            reply.put("installedVersionName", installedVersionName);
            reply.put("updateAvailable", updateAvailable);
            reply.put("latestVersionCode", latestVersionCode);
            reply.put("latestVersionName", latestVersionName);
            reply.put("apkUrl", apkUrl);
            reply.put("contentUpdated", contentUpdated);
            reply.put("contentHash", activeContentHash);
            reply.put("sourceDomain", activeDomain);
        } catch (JSONException ignored) {}

        byte[] payload = reply.toString().getBytes(StandardCharsets.UTF_8);
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        headers.put("X-Content-Type-Options", "nosniff");
        return new WebResourceResponse(
                "application/json",
                "UTF-8",
                200,
                "OK",
                headers,
                new ByteArrayInputStream(payload));
    }
}
