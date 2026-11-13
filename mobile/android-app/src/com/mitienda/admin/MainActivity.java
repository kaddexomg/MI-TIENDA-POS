package com.mitienda.admin;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {

    public static final String PREFS_NAME = "mtp_admin_prefs";
    public static final String KEY_SERVER_URL = "server_url";
    public static final String KEY_TOKEN = "auth_token";
    public static final String KEY_STORE_NAME = "store_name";

    private static final String LOCAL_APP_HOST = "app.mitienda.local";
    private WebView webView;
    private String pendingTab = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        requestNotifPermissionIfNeeded();
        extractIntentTab(getIntent());

        webView = new WebView(this);
        webView.setOverScrollMode(android.view.View.OVER_SCROLL_NEVER);
        webView.setHorizontalScrollBarEnabled(false);
        setContentView(webView);

        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setAllowContentAccess(true);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        ws.setCacheMode(WebSettings.LOAD_NO_CACHE);

        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null && (LOCAL_APP_HOST.equalsIgnoreCase(uri.getHost()) || "localhost".equalsIgnoreCase(uri.getHost()))) {
                    // Solo interceptar archivos de nuestra UI local cuando no tienen puerto (el servidor local usa :7070)
                    if (uri.getPort() == -1) {
                        String path = uri.getPath();
                        if (path == null || path.equals("/") || path.isEmpty()) {
                            path = "index.html";
                        }
                        if (path.startsWith("/")) path = path.substring(1);
                        if (path.startsWith("mobile/")) path = path.substring("mobile/".length());
                        if (path.isEmpty()) path = "index.html";

                        try {
                            InputStream is = getAssets().open(path);
                            String mime = guessMime(path);
                            Map<String, String> headers = new HashMap<>();
                            headers.put("Cache-Control", "no-store");
                            return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, is);
                        } catch (Exception e) {
                            String errHtml = "<html><body style='background:#0B1120;color:#F8FAFC;font-family:sans-serif;padding:24px'>" +
                                "<h3>No se encontró recurso local: " + path + "</h3></body></html>";
                            return new WebResourceResponse(
                                "text/html",
                                "UTF-8",
                                404,
                                "Not Found",
                                new HashMap<String, String>(),
                                new ByteArrayInputStream(errHtml.getBytes(StandardCharsets.UTF_8))
                            );
                        }
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                dispatchPendingTab();
            }
        });

        String startUrl = "http://localhost/index.html";
        if (pendingTab != null && !pendingTab.isEmpty()) {
            startUrl += "?tab=" + Uri.encode(pendingTab);
        }
        webView.loadUrl(startUrl);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        extractIntentTab(intent);
        dispatchPendingTab();
    }

    private void extractIntentTab(Intent intent) {
        if (intent != null && intent.hasExtra("extra_tab")) {
            String t = intent.getStringExtra("extra_tab");
            if (t != null && !t.trim().isEmpty()) {
                pendingTab = t.trim();
            }
        }
    }

    private void dispatchPendingTab() {
        if (webView != null && pendingTab != null && !pendingTab.isEmpty()) {
            final String tab = pendingTab.replaceAll("[^a-zA-Z0-9_-]", "");
            pendingTab = "";
            webView.post(new Runnable() {
                @Override
                public void run() {
                    webView.evaluateJavascript("window.openMobileTab && window.openMobileTab('" + tab + "');", null);
                }
            });
        }
    }

    private void requestNotifPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 1001);
            }
        }
    }

    private String guessMime(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".js")) return "application/javascript";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            moveTaskToBack(true);
        }
    }

    public class AndroidBridge {
        @JavascriptInterface
        public String getServerUrl() {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            return prefs.getString(KEY_SERVER_URL, "");
        }

        @JavascriptInterface
        public void startAlerts(String serverUrl, String token, String storeName) {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            prefs.edit()
                .putString(KEY_SERVER_URL, serverUrl != null ? serverUrl : "")
                .putString(KEY_TOKEN, token != null ? token : "")
                .putString(KEY_STORE_NAME, storeName != null ? storeName : "MI TIENDA POS")
                .apply();

            Intent svc = new Intent(MainActivity.this, MtpAlertService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(svc);
            } else {
                startService(svc);
            }
        }

        @JavascriptInterface
        public void stopAlerts() {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            prefs.edit().remove(KEY_TOKEN).apply();
            stopService(new Intent(MainActivity.this, MtpAlertService.class));
        }

        @JavascriptInterface
        public void showTestNotification(String title, String body) {
            MtpAlertService.postStandardNotification(
                MainActivity.this,
                title != null ? title : "MI TIENDA ADMIN",
                body != null ? body : "Notificación de prueba",
                "live",
                9001
            );
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            try {
                Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v.vibrate(VibrationEffect.createOneShot(Math.max(15, ms), VibrationEffect.DEFAULT_AMPLITUDE));
                    } else {
                        v.vibrate(Math.max(15, ms));
                    }
                }
            } catch (Exception ignored) {
            }
        }
    }
}
