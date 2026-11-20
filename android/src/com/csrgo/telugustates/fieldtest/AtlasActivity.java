package com.csrgo.telugustates.fieldtest;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** A local, hardware-accelerated Android host. No listening socket, JS bridge, or INTERNET permission. */
public final class AtlasActivity extends Activity {
    private static final int PINE = Color.rgb(25,60,50), PAPER = Color.rgb(244,242,232);
    private FrameLayout root;
    private WebView atlas;
    private static final String HOME = AssetRoute.ORIGIN + "/";
    private String last = HOME;
    private android.webkit.WebMessagePort hapticPort;
    private long lastPulse;
    private void immersive(boolean walk) {
        if(Build.VERSION.SDK_INT>=30){android.view.WindowInsetsController c=getWindow().getInsetsController();if(c==null)return;
            c.setSystemBarsBehavior(android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            if(walk)c.hide(WindowInsets.Type.systemBars());else c.show(WindowInsets.Type.systemBars());
        }else {int flags=View.SYSTEM_UI_FLAG_LAYOUT_STABLE|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
            if(walk)flags|=View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
            getWindow().getDecorView().setSystemUiVisibility(flags);}
        if(root!=null)root.requestApplyInsets();
    }
    // Permission-free, origin-bound channel for haptics and immersive system bars; no user data. Respect system haptic settings.
    private void closeHapticPort() {
        if (hapticPort != null) { try {hapticPort.close();} catch(RuntimeException ignored) {} hapticPort=null; }
    }
    private void wireHaptics(final WebView w) {
        closeHapticPort();
        w.evaluateJavascript("(function(){if(window.__atlasPadListener)return;window.__atlasPadListener=true;addEventListener('message',function(e){if(e.data!=='atlas-field-feedback' || e.ports.length!==1)return;var p=e.ports[0];window.__atlasPulse=function(k){if(k==='jump' || k==='land')p.postMessage(k)};var bars=function(){p.postMessage(document.body.classList.contains('walking')?'walk-bars':'map-bars')};new MutationObserver(bars).observe(document.body,{attributes:true,attributeFilter:['class']});bars();});})()", ignored -> {
            if (w != atlas || !safeLocal(w.getUrl()) || hub(w.getUrl()) || isFinishing()) return;
            try {
                final android.webkit.WebMessagePort[] ports=w.createWebMessageChannel();
                final android.webkit.WebMessagePort input=ports[0];hapticPort=input;
                input.setWebMessageCallback(new android.webkit.WebMessagePort.WebMessageCallback(){
                    @Override public void onMessage(android.webkit.WebMessagePort port,android.webkit.WebMessage message){
                        if (w!=atlas || input!=hapticPort || !w.hasWindowFocus() || !w.isShown() || !safeLocal(w.getUrl()) || hub(w.getUrl()))return;
                        String k=message.getData();if("walk-bars".equals(k)||"map-bars".equals(k)){immersive("walk-bars".equals(k));return;}if(!"jump".equals(k)&&!"land".equals(k))return;
                        long now=android.os.SystemClock.elapsedRealtime();if(now-lastPulse<80)return;lastPulse=now;
                        w.performHapticFeedback("land".equals(k)&&Build.VERSION.SDK_INT>=30 ? android.view.HapticFeedbackConstants.CONFIRM : android.view.HapticFeedbackConstants.VIRTUAL_KEY);
                    }
                });
                w.postWebMessage(new android.webkit.WebMessage("atlas-field-feedback",new android.webkit.WebMessagePort[]{ports[1]}),Uri.parse(AssetRoute.ORIGIN));
            } catch (RuntimeException ignoredPort) {closeHapticPort();}
        });
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        root = new FrameLayout(this);
        root.setBackgroundColor(PINE);
        // Render the camera under the cutout. Only HUD / keyboard safe bounds are inset.
        if (Build.VERSION.SDK_INT >= 28) {
            android.view.WindowManager.LayoutParams attr=getWindow().getAttributes();
            attr.layoutInDisplayCutoutMode=Build.VERSION.SDK_INT>=30?3:1;
            getWindow().setAttributes(attr);
        }
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        if(Build.VERSION.SDK_INT>=29)getWindow().setNavigationBarContrastEnforced(false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);getWindow().setNavigationBarColor(Color.TRANSPARENT);
        root.setOnApplyWindowInsetsListener((v,in)->{
            if(Build.VERSION.SDK_INT>=30){android.graphics.Insets a=in.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());safe=new int[]{a.top,a.right,a.bottom,a.left};}
            else {safe=new int[]{in.getSystemWindowInsetTop(),in.getSystemWindowInsetRight(),in.getSystemWindowInsetBottom(),in.getSystemWindowInsetLeft()};if(Build.VERSION.SDK_INT>=28&&in.getDisplayCutout()!=null){android.view.DisplayCutout c=in.getDisplayCutout();safe[0]=Math.max(safe[0],c.getSafeInsetTop());safe[1]=Math.max(safe[1],c.getSafeInsetRight());safe[2]=Math.max(safe[2],c.getSafeInsetBottom());safe[3]=Math.max(safe[3],c.getSafeInsetLeft());}}
            publishInsets();return in;
        });
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::back);
        }
        String saved = state == null ? null : state.getString("atlas-route");
        start(safeLocal(saved) ? saved : HOME);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void start(String address) {
        discard();
        root.removeAllViews();
        try {
            WebView.setWebContentsDebuggingEnabled(false);
            final WebView w = new WebView(this);
            atlas = w;
            w.setBackgroundColor(PAPER);
            WebSettings s = w.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setUseWideViewPort(true);
            s.setLoadWithOverviewMode(false);
            s.setSupportZoom(false); // the atlas handles two-finger gestures itself
            s.setBuiltInZoomControls(false);
            s.setDisplayZoomControls(false);
            s.setAllowFileAccess(false);
            s.setAllowContentAccess(false);
            s.setAllowFileAccessFromFileURLs(false);
            s.setAllowUniversalAccessFromFileURLs(false);
            s.setBlockNetworkLoads(true);
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            s.setGeolocationEnabled(false);
            s.setJavaScriptCanOpenWindowsAutomatically(false);
            s.setSupportMultipleWindows(false);
            CookieManager.getInstance().setAcceptThirdPartyCookies(w, false);
            w.setWebChromeClient(new WebChromeClient() {
                @Override public void onPermissionRequest(PermissionRequest req) { req.deny(); }
            });
            w.setWebViewClient(new Client());
            root.addView(w, new FrameLayout.LayoutParams(-1,-1));
            last = address;
            w.loadUrl(address);
        } catch (RuntimeException | LinkageError e) {
            failure("Android System WebView is unavailable",
                "Enable or update Android System WebView (or Chrome, on phones that use it), then reopen the atlas.");
        }
    }

    private static boolean local(Uri u) {
        return u != null && AssetRoute.origin(u.getScheme(), u.getHost(), u.getPort(), u.getUserInfo());
    }
    private static boolean safeLocal(String url) {
        if (url == null) return false;
        Uri u = Uri.parse(url);
        return local(u) && AssetRoute.key(u.getPath()) != null;
    }
    private static boolean hub(String url) {
        if (!safeLocal(url)) return false;
        String p = Uri.parse(url).getPath();
        return AssetRoute.HUB_PATH.equals(p) || "/_field/".equals(p);
    }
    private static WebResourceResponse response(int code, String reason, String mime, InputStream stream) {
        Map<String,String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        headers.put("X-Content-Type-Options", "nosniff");
        return new WebResourceResponse(mime, AssetRoute.text(mime) ? "UTF-8" : null, code, reason, headers, stream);
    }
    private static WebResourceResponse status(int code, String reason) {
        return response(code, reason, "text/plain", new ByteArrayInputStream(reason.getBytes(StandardCharsets.UTF_8)));
    }
    private final class Client extends WebViewClient {
        @Override public WebResourceResponse shouldInterceptRequest(WebView w, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!local(u)) return status(403,"Offline atlas only");
            if (!"GET".equals(req.getMethod()) && !"HEAD".equals(req.getMethod())) return status(405,"Method not allowed");
            String key = AssetRoute.key(u.getPath());
            if (key == null) return status(404,"Not found");
            try {
                InputStream in = getAssets().open(key, AssetManager.ACCESS_STREAMING);
                if ("HEAD".equals(req.getMethod())) { in.close(); in = new ByteArrayInputStream(new byte[0]); }
                return response(200,"OK",AssetRoute.mime(key), in);
            } catch (IOException notFound) { return status(404,"Not found"); }
        }
        @Override public boolean shouldOverrideUrlLoading(WebView w, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (local(u)) {
                if("/_field/resident".equals(u.getPath())){String n=u.getQueryParameter("name");if(req.isForMainFrame()&&req.hasGesture()&&safeLocal(w.getUrl())&&!hub(w.getUrl())&&n!=null&&n.matches("[a-z0-9._]{1,30}")){try{startActivity(Intent.createChooser(new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,"@"+n+" · Telugu States\nhttps://telugustates.csrgo.com/#/u/"+n),"Share virtual house"));}catch(RuntimeException e){toast("No sharing app available.");}}return true;}
                if("/_field/photo".equals(u.getPath())){if(req.isForMainFrame()&&req.hasGesture()&&safeLocal(w.getUrl())&&!hub(w.getUrl()))savePhoto(w);return true;}
                if ("/_field/share".equals(u.getPath())) {
                    if (req.isForMainFrame() && req.hasGesture() && safeLocal(w.getUrl())) share(w);
                    return true;
                }
                return AssetRoute.key(u.getPath()) == null;
            }
            if (req.isForMainFrame() && req.hasGesture() && u.getHost() != null && u.getUserInfo() == null
                    && ("https".equals(u.getScheme()) || "http".equals(u.getScheme()))) {
                new AlertDialog.Builder(AtlasActivity.this).setTitle("Leave the offline atlas?")
                    .setMessage("Open " + u.getHost() + " in your browser? This external link may need internet.")
                    .setNegativeButton("Stay here", null).setPositiveButton("Open browser", (d,id) -> {
                        try { startActivity(new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE)); }
                        catch (RuntimeException e) { toast("No browser is available."); }
                    }).show();
            }
            return true;
        }
        @Override public void doUpdateVisitedHistory(WebView w, String url, boolean reload) {
            if (w == atlas && safeLocal(url)) last = url;
        }
        @Override public void onPageFinished(WebView w, String url) {
            if (w != atlas || !safeLocal(url)) return;
            last=url;if(hub(url))immersive(false);publishInsets(); if(!hub(url))wireHaptics(w);else closeHapticPort();
            if (hub(url)) {
                w.clearHistory();
                String detail = Build.MODEL + " · Android " + Build.VERSION.RELEASE + " · WebView " + provider();
                w.evaluateJavascript("window.showAtlasDevice && window.showAtlasDevice(" + JSONObject.quote(detail) + ")", null);
            }
        }
        @Override public boolean onRenderProcessGone(WebView w, RenderProcessGoneDetail detail) {
            if (w == atlas) failure("The graphics view stopped", "Return to the test launcher and try the map. If it happens during a walk, note the scene and your phone model.");
            return true;
        }
        @Override public void onReceivedError(WebView w, WebResourceRequest r, WebResourceError e) {
            if (r.isForMainFrame() && w == atlas && local(r.getUrl()) && e.getErrorCode() != WebViewClient.ERROR_UNKNOWN) {
                w.post(() -> { if (w == atlas) failure("Could not open this atlas view", "The atlas is installed locally. Retry from the test launcher or update Android System WebView."); });
            }
        }
    }
    private int[] safe={0,0,0,0};private byte[] photoBytes;
    private void publishInsets(){WebView w=atlas;if(w==null||!safeLocal(w.getUrl()))return;
        String js="(function(){var r=document.documentElement;if(!r)return;var k=['t','r','b','l'],v=["+safe[0]+","+safe[1]+","+safe[2]+","+safe[3]+ "];k.forEach(function(x,i){r.style.setProperty('--native-'+x,(v[i]/(devicePixelRatio||1))+'px')})})()";
        w.evaluateJavascript(js,null);
    }
    // Save only a local canvas image, through the user's document picker; no storage permission.
    private void savePhoto(final WebView w){w.evaluateJavascript("window.atlasWalk?.capturePhoto?.() || null",value->{
        if(w!=atlas||!safeLocal(w.getUrl())||value==null||value.length()>12000000||!value.startsWith("\"data:image/png;base64,"))return;
        try{photoBytes=android.util.Base64.decode(value.substring(23,value.length()-1),android.util.Base64.DEFAULT);
            startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/png").putExtra(Intent.EXTRA_TITLE,"Telugu-States-landscape.png"),82);
        }catch(RuntimeException e){photoBytes=null;toast("Unable to open the picture picker.");}
    });}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request!=82)return;byte[] bytes=photoBytes;photoBytes=null;if(result!=RESULT_OK||bytes==null||data==null||data.getData()==null)return;try(java.io.OutputStream out=getContentResolver().openOutputStream(data.getData(),"w")){if(out==null)throw new IOException();out.write(bytes);toast("Picture saved.");}catch(Exception e){toast("The picture could not be saved.");}}
    private String provider() {
        try {
            PackageInfo p = WebView.getCurrentWebViewPackage();
            return p == null ? "unknown" : p.versionName;
        } catch (RuntimeException e) { return "unknown"; }
    }
    private void share(final WebView w) {
        if (w != atlas || !hub(w.getUrl())) return;
        w.evaluateJavascript("(function(){try{var a=JSON.parse(localStorage.getItem('atlas-field-readings')||'[]');return Array.isArray(a)?a.slice(-12):[]}catch(e){return []}})()", value -> {
            if (w != atlas || !hub(w.getUrl()) || isFinishing()) return;
            try {
                if (value == null || value.length() > 131072) throw new IllegalArgumentException();
                JSONArray readings = new JSONArray(value);
                if (readings.length() == 0) { toast("Measure a walk before sharing."); return; }
                JSONObject result = new JSONObject().put("app", "Telugu States Atlas 7.1.0")
                        .put("device", Build.MANUFACTURER + " " + Build.MODEL).put("android", Build.VERSION.RELEASE)
                        .put("webView", provider()).put("walks", readings);
                Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain")
                        .putExtra(Intent.EXTRA_SUBJECT, "Telugu States Atlas · phone field test")
                        .putExtra(Intent.EXTRA_TEXT, result.toString(2));
                startActivity(Intent.createChooser(send, "Share atlas readings"));
            } catch (Exception e) { toast("Unable to share. The atlas menu also shows the measurement text."); }
        });
    }
    private void toast(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); }
    private void back() {
        final WebView w = atlas;
        if (w == null || hub(w.getUrl())) { finish(); return; }
        ValueCallback<String> result = value -> {
            if (w != atlas || isFinishing()) return;
            if ("true".equals(value)) {
                new AlertDialog.Builder(this).setTitle("Leave this measurement?")
                    .setMessage("The current walk has not finished. Completed readings will stay on this phone.")
                    .setNegativeButton("Keep measuring", null).setPositiveButton("Leave walk", (d,i) -> w.loadUrl(HOME)).show();
            } else if(!"2".equals(value)){ if("1".equals(value))return; if(HOME.equals(w.getUrl())|| (HOME+"index.html").equals(w.getUrl()))finish();else w.loadUrl(HOME); }
        };
        w.evaluateJavascript("(function(){var b=document.getElementById('record-field');if(b&&b.disabled)return true;if(window.atlasWalk?.dismissTransient?.())return 2;if(document.body.classList.contains('walking')){(document.querySelector('#leave-world')||document.querySelector('.world-back'))?.click();return 1}if(document.querySelector('dialog[open]')){document.querySelector('dialog[open]').close();return 1}return false})()",result);
    }
    @Override public void onBackPressed() { back(); }
    @Override public void onSaveInstanceState(Bundle b) {
        String url = atlas == null ? null : atlas.getUrl();
        b.putString("atlas-route", safeLocal(url) ? url : last);
        super.onSaveInstanceState(b);
    }
    @Override public void onPause() {
        if (atlas != null) { if(safeLocal(atlas.getUrl())) atlas.evaluateJavascript("dispatchEvent(new Event('atlas:host-pause'))",null); atlas.onPause(); }
        super.onPause();
    }
    @Override public void onResume() {
        super.onResume();
        if (atlas != null) { atlas.onResume(); if(safeLocal(atlas.getUrl())) atlas.evaluateJavascript("dispatchEvent(new Event('atlas:host-resume'))",null); }
    }
    @Override public void onDestroy() { discard(); super.onDestroy(); }
    private void discard() {
        closeHapticPort();
        WebView old = atlas;
        atlas = null;
        if (old != null) {
            if (old.getParent() instanceof ViewGroup) ((ViewGroup)old.getParent()).removeView(old);
            old.destroy();
        }
    }
    private void failure(String title, String message) {
        discard(); root.removeAllViews();
        int pad = Math.round(24 * getResources().getDisplayMetrics().density);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL); box.setGravity(Gravity.CENTER_VERTICAL);
        box.setPadding(pad,pad,pad,pad); box.setBackgroundColor(PAPER);
        TextView t = new TextView(this); t.setText(title); t.setTextSize(24); t.setTextColor(PINE); box.addView(t);
        TextView body = new TextView(this); body.setText(message); body.setTextSize(16); body.setPadding(0,pad/2,0,pad); box.addView(body);
        Button retry = new Button(this); retry.setText("Open map"); retry.setOnClickListener(v -> start(HOME)); box.addView(retry);
        Button close = new Button(this); close.setText("Close app"); close.setOnClickListener(v -> finish()); box.addView(close);
        root.addView(box, new FrameLayout.LayoutParams(-1,-1));
    }
}
