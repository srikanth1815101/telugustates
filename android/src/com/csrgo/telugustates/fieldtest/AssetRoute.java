package com.csrgo.telugustates.fieldtest;

import java.util.Locale;

/** Exact mapping of the one synthetic HTTPS origin onto the two packaged asset trees. No disk paths. */
public final class AssetRoute {
    public static final String HOST = "appassets.androidplatform.net";
    public static final String ORIGIN = "https://" + HOST;
    public static final String HUB_PATH = "/_field/index.html";
    public static final String HUB = ORIGIN + HUB_PATH;
    private AssetRoute() {}

    public static boolean origin(String scheme, String host, int port, String userInfo) {
        return "https".equalsIgnoreCase(scheme) && HOST.equalsIgnoreCase(host)
                && (port == -1 || port == 443) && userInfo == null;
    }

    /** Receives the URI's already-decoded path. Empty directory requests are real Hugo index pages. */
    public static String key(String path) {
        if (path == null || !path.startsWith("/") || path.startsWith("//") || path.length() > 4096)
            return null;
        for (int i = 0; i < path.length(); ++i) {
            char c = path.charAt(i);
            if (c < 32 || c == 127 || c == '\\' || c == ':' || c == '%' || c == 0) return null;
        }
        for (String part : path.split("/", -1)) {
            if ("..".equals(part) || ".".equals(part)) return null;
        }
        if (path.contains("//")) return null;
        if (path.endsWith("/")) path += "index.html";
        if (path.equals("/_field/share")||path.equals("/_field/photo")||path.equals("/_field/resident")||path.equals("/_field/sync")) return null; // native action, not an asset
        if (path.startsWith("/_field/")) return "console/" + path.substring(8);
        return "atlas/" + path.substring(1);
    }

    public static String mime(String key) {
        String p = key.toLowerCase(Locale.ROOT);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".ogg")) return "audio/ogg";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".md") || p.endsWith(".txt")) return "text/plain";
        if (p.endsWith(".csv")) return "text/csv";
        return "application/octet-stream"; // TSA1 and .gz MUST remain raw bytes. JS handles decompression.
    }
    public static boolean text(String mime) {
        return mime.startsWith("text/") || mime.equals("application/json") || mime.equals("image/svg+xml");
    }
}
