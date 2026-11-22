package com.csrgo.telugustates.fieldtest;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.WebResourceResponse;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipFile;
import javax.net.ssl.HttpsURLConnection;

/**
 * Downloads the latest APK directly inside the app, verifies package identity, version, and
 * signing certificate compatibility, installs via PackageInstaller.Session without opening a
 * browser, and coordinates automatic app relaunch on completion.
 */
final class ApkUpdater {
    static final String PREFS = "atlas_updater";
    static final String KEY_RELAUNCH_DEADLINE = "relaunch_deadline_ms";
    static final String ACTION_INSTALL_STATUS = "com.csrgo.telugustates.fieldtest.APK_INSTALL_STATUS";
    private static final long MAX_APK_BYTES = 220L * 1024L * 1024L;

    private static ApkUpdater instance;

    static synchronized ApkUpdater get(Context context) {
        if (instance == null) {
            instance = new ApkUpdater(context.getApplicationContext());
        }
        return instance;
    }

    private final Context appContext;
    private final Object lock = new Object();

    private String state = "idle";
    private String message = "";
    private long downloadedBytes = 0L;
    private long totalBytes = 0L;
    private int percent = 0;
    private boolean running = false;
    private boolean waitingPermission = false;

    private ApkUpdater(Context appContext) {
        this.appContext = appContext;
    }

    private File updateDir() {
        return new File(appContext.getCacheDir(), "updates");
    }

    File readyApkFile() {
        return new File(updateDir(), "Telugu-States-Update.apk");
    }

    private File partApkFile() {
        return new File(updateDir(), "Telugu-States-Update.apk.part");
    }

    WebResourceResponse startResponse(String apkUrl, long installedVersionCode) {
        startUpdate(apkUrl, installedVersionCode);
        return statusResponse();
    }

    WebResourceResponse statusResponse() {
        JSONObject obj = new JSONObject();
        synchronized (lock) {
            try {
                obj.put("state", state);
                obj.put("message", message);
                obj.put("downloadedBytes", downloadedBytes);
                obj.put("totalBytes", totalBytes);
                obj.put("percent", percent);
            } catch (JSONException ignored) {}
        }
        byte[] bytes = obj.toString().getBytes(StandardCharsets.UTF_8);
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        headers.put("X-Content-Type-Options", "nosniff");
        return new WebResourceResponse(
                "application/json",
                "UTF-8",
                200,
                "OK",
                headers,
                new ByteArrayInputStream(bytes));
    }

    void startUpdate(final String requestedUrl, final long installedVersionCode) {
        final String targetUrl = (requestedUrl != null && LiveSync.trustedApkUrl(requestedUrl))
                ? requestedUrl
                : LiveSync.DEFAULT_APK_URL;
        synchronized (lock) {
            if (running) return;
            File existing = readyApkFile();
            if (waitingPermission && existing.isFile() && existing.length() > 1024 * 1024) {
                if (canInstallPackages()) {
                    waitingPermission = false;
                    running = true;
                    state = "installing";
                    percent = 100;
                    message = "Installing update…";
                    Thread t = new Thread(new Runnable() {
                        @Override public void run() {
                            installReadyApk(existing, installedVersionCode);
                        }
                    }, "atlas-apk-install");
                    t.setDaemon(true);
                    t.start();
                } else {
                    promptUnknownSourcesSettings();
                }
                return;
            }
            running = true;
            waitingPermission = false;
            state = "downloading";
            downloadedBytes = 0L;
            totalBytes = 0L;
            percent = 0;
            message = "Downloading update…";
        }

        Thread worker = new Thread(new Runnable() {
            @Override public void run() {
                downloadAndInstall(targetUrl, installedVersionCode);
            }
        }, "atlas-apk-updater");
        worker.setDaemon(true);
        worker.start();
    }

    void resumeIfPermitted(final long installedVersionCode) {
        final File ready;
        synchronized (lock) {
            if (running || !waitingPermission) return;
            if (!canInstallPackages()) return;
            ready = readyApkFile();
            if (!ready.isFile() || ready.length() < 1024 * 1024) {
                waitingPermission = false;
                state = "idle";
                return;
            }
            waitingPermission = false;
            running = true;
            state = "installing";
            percent = 100;
            message = "Installing update…";
        }
        Thread t = new Thread(new Runnable() {
            @Override public void run() {
                installReadyApk(ready, installedVersionCode);
            }
        }, "atlas-apk-install-resume");
        t.setDaemon(true);
        t.start();
    }

    private boolean canInstallPackages() {
        if (Build.VERSION.SDK_INT >= 26) {
            return appContext.getPackageManager().canRequestPackageInstalls();
        }
        return true;
    }

    private void promptUnknownSourcesSettings() {
        if (Build.VERSION.SDK_INT < 26) return;
        Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + appContext.getPackageName()));
        AtlasActivity act = AtlasActivity.currentActivity();
        try {
            if (act != null && !act.isFinishing()) {
                act.startActivityForResult(intent, AtlasActivity.REQ_INSTALL_PERMISSION);
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                appContext.startActivity(intent);
            }
        } catch (RuntimeException ignored) {}
    }

    private void downloadAndInstall(String urlString, long installedVersionCode) {
        File dir = updateDir();
        if (!dir.exists() && !dir.mkdirs()) {
            fail("error", "Could not allocate temporary storage for update.");
            return;
        }
        File part = partApkFile();
        File ready = readyApkFile();
        //noinspection ResultOfMethodCallIgnored
        part.delete();

        try {
            downloadHttpsToFile(urlString, part);
            synchronized (lock) {
                state = "verifying";
                percent = 100;
                message = "Verifying update package…";
            }
            String verifyErr = verifyArchive(part, installedVersionCode);
            if (verifyErr != null) {
                //noinspection ResultOfMethodCallIgnored
                part.delete();
                if (verifyErr.startsWith("CONFLICT:")) {
                    fail("conflict", verifyErr.substring("CONFLICT:".length()));
                } else if (verifyErr.startsWith("UPTODATE:")) {
                    synchronized (lock) {
                        running = false;
                        state = "up_to_date";
                        message = verifyErr.substring("UPTODATE:".length());
                    }
                } else {
                    fail("error", verifyErr);
                }
                return;
            }
            //noinspection ResultOfMethodCallIgnored
            ready.delete();
            if (!part.renameTo(ready)) {
                copyFile(part, ready);
                //noinspection ResultOfMethodCallIgnored
                part.delete();
            }
            installReadyApk(ready, installedVersionCode);
        } catch (IOException e) {
            //noinspection ResultOfMethodCallIgnored
            part.delete();
            fail("error", "Download interrupted (" + e.getMessage() + "). Tap Update to retry.");
        } catch (RuntimeException e) {
            //noinspection ResultOfMethodCallIgnored
            part.delete();
            fail("error", "Update failed: " + e.getMessage());
        }
    }

    private void downloadHttpsToFile(String urlString, File dest) throws IOException {
        URL current = new URL(urlString);
        for (int hop = 0; hop < 8; hop++) {
            if (!"https".equalsIgnoreCase(current.getProtocol())
                    || current.getUserInfo() != null
                    || !LiveSync.allowedHost(current.getHost())) {
                throw new IOException("Untrusted update host");
            }
            HttpsURLConnection conn = (HttpsURLConnection) current.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(25000);
            conn.setUseCaches(false);
            conn.setRequestProperty("Accept", "application/vnd.android.package-archive,application/octet-stream,*/*");
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
                long contentLen = Build.VERSION.SDK_INT >= 24
                        ? conn.getContentLengthLong()
                        : (long) conn.getContentLength();
                if (contentLen > MAX_APK_BYTES) {
                    throw new IOException("APK exceeds size limit");
                }
                synchronized (lock) {
                    totalBytes = contentLen > 0 ? contentLen : 0L;
                    downloadedBytes = 0L;
                    percent = 0;
                }
                try (InputStream in = conn.getInputStream();
                     FileOutputStream out = new FileOutputStream(dest)) {
                    byte[] buf = new byte[32768];
                    long readTotal = 0L;
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        readTotal += n;
                        if (readTotal > MAX_APK_BYTES) {
                            throw new IOException("APK exceeds size limit");
                        }
                        out.write(buf, 0, n);
                        synchronized (lock) {
                            downloadedBytes = readTotal;
                            if (contentLen > 0) {
                                percent = (int) Math.min(99L, (readTotal * 100L) / contentLen);
                            }
                        }
                    }
                    out.getFD().sync();
                    if (contentLen > 0 && readTotal != contentLen) {
                        throw new IOException("Incomplete download");
                    }
                    if (readTotal < 1024 * 1024) {
                        throw new IOException("Invalid APK size");
                    }
                }
                return;
            } finally {
                conn.disconnect();
            }
        }
        throw new IOException("Too many redirects");
    }

    @SuppressWarnings("deprecation")
    private String verifyArchive(File apkFile, long installedVersionCode) {
        try (ZipFile zf = new ZipFile(apkFile)) {
            if (zf.getEntry("AndroidManifest.xml") == null || zf.getEntry("classes.dex") == null) {
                return "Downloaded package is incomplete. Tap Update to retry.";
            }
        } catch (IOException e) {
            return "Downloaded package is corrupted. Tap Update to retry.";
        }

        PackageManager pm = appContext.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28
                ? PackageManager.GET_SIGNING_CERTIFICATES
                : PackageManager.GET_SIGNATURES;
        PackageInfo arch = pm.getPackageArchiveInfo(apkFile.getAbsolutePath(), flags);
        if (arch == null) {
            return "Could not read update package metadata.";
        }
        if (!LiveSync.APP_ID.equals(arch.packageName)) {
            return "Update package ID mismatch (" + arch.packageName + ").";
        }
        long archiveCode = Build.VERSION.SDK_INT >= 28 ? arch.getLongVersionCode() : arch.versionCode;
        if (archiveCode < installedVersionCode) {
            return "UPTODATE:Installed version is already newer.";
        }

        try {
            PackageInfo inst = pm.getPackageInfo(appContext.getPackageName(), flags);
            List<String> instDigests = signerDigests(inst);
            List<String> archDigests = signerDigests(arch);
            if (!instDigests.isEmpty() && !archDigests.isEmpty()) {
                boolean match = false;
                for (String d : archDigests) {
                    if (instDigests.contains(d)) {
                        match = true;
                        break;
                    }
                }
                if (!match) {
                    return "CONFLICT:This phone has an older test-signed build installed. Uninstall the old app once, then install the official release so all future updates install seamlessly.";
                }
            }
        } catch (Exception ignored) {}

        return null;
    }

    @SuppressWarnings("deprecation")
    private static List<String> signerDigests(PackageInfo info) {
        List<String> out = new ArrayList<>();
        if (info == null) return out;
        Signature[] sigs = null;
        if (Build.VERSION.SDK_INT >= 28) {
            SigningInfo si = info.signingInfo;
            if (si != null) {
                sigs = si.hasMultipleSigners()
                        ? si.getApkContentsSigners()
                        : si.getSigningCertificateHistory();
            }
        } else {
            sigs = info.signatures;
        }
        if (sigs == null) return out;
        for (Signature s : sigs) {
            if (s == null) continue;
            try {
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                byte[] digest = md.digest(s.toByteArray());
                StringBuilder sb = new StringBuilder(digest.length * 2);
                for (byte b : digest) {
                    sb.append(String.format("%02x", b & 0xff));
                }
                out.add(sb.toString());
            } catch (Exception ignored) {}
        }
        return out;
    }

    private void installReadyApk(File apkFile, long installedVersionCode) {
        if (!canInstallPackages()) {
            synchronized (lock) {
                running = false;
                waitingPermission = true;
                state = "permission";
                percent = 100;
                message = "Allow updates from Telugu States in settings to finish installing.";
            }
            promptUnknownSourcesSettings();
            return;
        }

        PackageInstaller installer = appContext.getPackageManager().getPackageInstaller();
        for (PackageInstaller.SessionInfo old : installer.getMySessions()) {
            try {
                installer.abandonSession(old.getSessionId());
            } catch (Exception ignored) {}
        }

        PackageInstaller.Session session = null;
        try {
            PackageInstaller.SessionParams params =
                    new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setAppPackageName(LiveSync.APP_ID);
            params.setSize(apkFile.length());
            if (Build.VERSION.SDK_INT >= 31) {
                params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
            }
            if (Build.VERSION.SDK_INT >= 34) {
                params.setRequestUpdateOwnership(true);
            }

            int sessionId = installer.createSession(params);
            session = installer.openSession(sessionId);
            try (InputStream in = new FileInputStream(apkFile);
                 OutputStream out = session.openWrite("Telugu-States-Update.apk", 0, apkFile.length())) {
                byte[] buf = new byte[32768];
                int n;
                while ((n = in.read(buf)) != -1) {
                    out.write(buf, 0, n);
                }
                session.fsync(out);
            }

            SharedPreferences sp = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            sp.edit().putLong(KEY_RELAUNCH_DEADLINE, System.currentTimeMillis() + 300_000L).commit();

            Intent callback = new Intent(appContext, ApkInstallReceiver.class);
            callback.setAction(ACTION_INSTALL_STATUS);
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) {
                piFlags |= PendingIntent.FLAG_MUTABLE;
            }
            PendingIntent pending = PendingIntent.getBroadcast(appContext, 7150, callback, piFlags);

            synchronized (lock) {
                running = false;
                state = "installing";
                percent = 100;
                message = "Installing update & restarting…";
            }
            session.commit(pending.getIntentSender());
            session.close();
            session = null;
        } catch (IOException | SecurityException e) {
            if (session != null) {
                try { session.abandon(); } catch (Exception ignored) {}
            }
            fail("error", "Could not start installer: " + e.getMessage());
        } finally {
            if (session != null) {
                try { session.close(); } catch (Exception ignored) {}
            }
        }
    }

    void onInstallPendingConfirmation() {
        synchronized (lock) {
            running = false;
            state = "installing";
            percent = 100;
            message = "Confirm update to install and restart…";
        }
    }

    void onInstallSuccess() {
        //noinspection ResultOfMethodCallIgnored
        readyApkFile().delete();
        synchronized (lock) {
            running = false;
            waitingPermission = false;
            state = "installed";
            percent = 100;
            message = "Update installed. Restarting…";
        }
        relaunchApp(appContext);
    }

    void onInstallFailure(int status, String extraMessage) {
        synchronized (lock) {
            running = false;
            waitingPermission = false;
            if (status == PackageInstaller.STATUS_FAILURE_ABORTED) {
                state = "idle";
                message = "";
                return;
            }
            if (status == PackageInstaller.STATUS_FAILURE_CONFLICT) {
                //noinspection ResultOfMethodCallIgnored
                readyApkFile().delete();
                state = "conflict";
                message = "Existing installation uses a different signing key. Uninstall the old build once and install the latest release.";
                return;
            }
            if (status == PackageInstaller.STATUS_FAILURE_STORAGE) {
                state = "error";
                message = "Not enough free storage space to install update.";
                return;
            }
            state = "error";
            message = extraMessage != null && !extraMessage.isEmpty()
                    ? "Install failed: " + extraMessage
                    : "Install could not complete. Tap Update to retry.";
        }
    }

    static void relaunchApp(Context context) {
        Context app = context.getApplicationContext();
        SharedPreferences sp = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        sp.edit().putLong(KEY_RELAUNCH_DEADLINE, 0L).apply();
        Intent launch = new Intent(app, AtlasActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        try {
            app.startActivity(launch);
        } catch (RuntimeException ignored) {}
    }

    private void fail(String errState, String msg) {
        synchronized (lock) {
            running = false;
            waitingPermission = false;
            state = errState;
            message = msg;
        }
    }

    private static void copyFile(File src, File dst) throws IOException {
        try (InputStream in = new FileInputStream(src);
             FileOutputStream out = new FileOutputStream(dst)) {
            byte[] buf = new byte[32768];
            int n;
            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
            }
            out.getFD().sync();
        }
    }
}
