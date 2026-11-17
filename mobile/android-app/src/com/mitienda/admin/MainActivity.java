package com.mitienda.admin;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {

    public static final String PREFS_NAME = "mtp_admin_prefs";
    public static final String KEY_SERVER_URL = "server_url";
    public static final String DEFAULT_SERVER_URL = "https://166-0-112-247.sslip.io";
    public static final String KEY_TOKEN = "auth_token";
    public static final String KEY_STORE_NAME = "store_name";
    public static final String KEY_USE_REMOTE_UI = "use_remote_ui";
    public static final String KEY_USER_JSON = "user_json";

    /* Detector bancario de Pago Movil (BankNotificationListenerService) */
    public static final String KEY_BANK_LISTENER_ENABLED = "bank_listener_enabled";
    public static final String KEY_BANK_RECEIVED_COUNT = "bank_received_count";
    public static final String KEY_BANK_LAST_AT = "bank_last_at";
    public static final String KEY_BANK_LAST_TEXT = "bank_last_text";
    public static final String KEY_BANK_LAST_RESULT = "bank_last_result";
    public static final String KEY_BANK_RECENT_HASHES = "bank_recent_hashes";

    /** Paquete del APK dedicado al escaner (sabor Scanner). */
    public static final String SCANNER_PACKAGE = "com.mitienda.scanner";

    private static final int REQ_NOTIF = 1001;
    private static final int REQ_CAMERA = 1002;
    private static final int REQ_FILE_CHOOSER = 1003;
    private static final String LOCAL_APP_HOST = "app.mitienda.local";
    private WebView webView;
    private String pendingTab = "";
    // "remote" = interfaz viva servida por el servidor; "local" = copia dentro del APK.
    private String currentUiSource = "local";
    private boolean fallbackDone = false;
    private volatile boolean remoteLiveReady = false;
    private volatile String cachedRemoteBase = "";
    private PermissionRequest pendingWebPermissionRequest = null;
    private ValueCallback<Uri[]> fileChooserCallback = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (!isScannerFlavor()) {
            requestNotifPermissionIfNeeded();
        }
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
        ws.setMediaPlaybackRequiresUserGesture(false);

        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (request == null) return;
                        String[] resources = request.getResources();
                        boolean wantsCamera = false;
                        if (resources != null) {
                            for (String r : resources) {
                                if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) {
                                    wantsCamera = true;
                                    break;
                                }
                            }
                        }
                        if (!wantsCamera) {
                            request.grant(resources);
                            return;
                        }
                        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                            if (pendingWebPermissionRequest != null) {
                                try { pendingWebPermissionRequest.deny(); } catch (Exception ignored) {}
                            }
                            pendingWebPermissionRequest = request;
                            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                        } else {
                            request.grant(resources);
                        }
                    }
                });
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingWebPermissionRequest == request) {
                    pendingWebPermissionRequest = null;
                }
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (fileChooserCallback != null) {
                    try { fileChooserCallback.onReceiveValue(null); } catch (Exception ignored) {}
                }
                fileChooserCallback = filePathCallback;
                try {
                    Intent intent = fileChooserParams != null ? fileChooserParams.createIntent() : new Intent(Intent.ACTION_GET_CONTENT);
                    if (intent.getType() == null) intent.setType("image/*");
                    startActivityForResult(intent, REQ_FILE_CHOOSER);
                    return true;
                } catch (Exception e) {
                    fileChooserCallback = null;
                    return false;
                }
            }
        });
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

                        // Cáscara viva en Secure Context (http://localhost) cargando archivos desde el servidor
                        if (remoteLiveReady && !fallbackDone && cachedRemoteBase != null && !cachedRemoteBase.isEmpty() && isLiveUiAsset(path)) {
                            WebResourceResponse remoteResp = fetchRemoteAssetResponse(cachedRemoteBase + "/mobile/" + path, path);
                            if (remoteResp != null) {
                                return remoteResp;
                            }
                        }

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
                verifyRemoteUiReady(view);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame()) {
                    handleRemoteFailure();
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                super.onReceivedHttpError(view, request, errorResponse);
                if (request != null && request.isForMainFrame() && errorResponse != null && errorResponse.getStatusCode() >= 400) {
                    handleRemoteFailure();
                }
            }
        });

        loadInitialUi();
    }

    /**
     * Cáscara viva: la interfaz viaja desde el servidor (mobile/) y se actualiza
     * sin reinstalar el APK. Si el servidor no responde, usa la copia guardada.
     */
    private void loadInitialUi() {
        fallbackDone = false;
        remoteLiveReady = false;
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String rawServer = prefs.getString(KEY_SERVER_URL, "").trim();
        if (rawServer.isEmpty() || rawServer.contains("192.168.1.100") || rawServer.equals("http://localhost")) {
            rawServer = DEFAULT_SERVER_URL;
            prefs.edit().putString(KEY_SERVER_URL, DEFAULT_SERVER_URL).apply();
        }
        final String serverUrl = normalizeBase(rawServer);
        boolean useRemote = prefs.getBoolean(KEY_USE_REMOTE_UI, true);

        if (!useRemote || serverUrl.isEmpty()) {
            loadLocalUi();
            return;
        }

        final String probeUrl = serverUrl + "/api/v1/status";
        new Thread(new Runnable() {
            @Override
            public void run() {
                final boolean online = probeServer(probeUrl);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (online) {
                            cachedRemoteBase = serverUrl;
                            remoteLiveReady = true;
                            currentUiSource = "remote";
                            // Mantenemos origen http://localhost (Secure Context) para que getUserMedia/cámara
                            // funcione en LAN HTTP mientras los archivos se cargan vivos del servidor.
                            webView.loadUrl(localStartUrl() + buildTabQuery());
                        } else {
                            loadLocalUi();
                        }
                    }
                });
            }
        }).start();
    }

    private boolean isLiveUiAsset(String path) {
        if ("mobile.css".equals(path) || "barcode-scanner.js".equals(path) || "scanner.html".equals(path)) {
            return true;
        }
        if (isScannerFlavor()) {
            // El APK Escaner no lleva index.html ni mobile.js.
            return false;
        }
        return "index.html".equals(path) || "mobile.js".equals(path);
    }

    private WebResourceResponse fetchRemoteAssetResponse(String targetUrl, String assetPath) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(targetUrl).openConnection();
            conn.setConnectTimeout(2500);
            conn.setReadTimeout(3500);
            conn.setRequestMethod("GET");
            conn.setUseCaches(false);
            int code = conn.getResponseCode();
            if (code != 200) {
                return null;
            }
            InputStream in = conn.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int len;
            while ((len = in.read(buf)) != -1) {
                out.write(buf, 0, len);
            }
            byte[] data = out.toByteArray();
            if (data.length == 0) {
                return null;
            }
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            return new WebResourceResponse(guessMime(assetPath), "UTF-8", 200, "OK", headers, new ByteArrayInputStream(data));
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private String buildTabQuery() {
        if (pendingTab != null && !pendingTab.isEmpty()) {
            String base = localStartUrl();
            String sep = base.indexOf('?') >= 0 ? "&" : "?";
            return sep + "tab=" + Uri.encode(pendingTab);
        }
        return "";
    }

    /**
     * Sabor Scanner (MI TIENDA ESCANER): misma clase con otro applicationId.
     * No enciende alertas de ventas ni el detector bancario.
     */
    private boolean isScannerFlavor() {
        try {
            return SCANNER_PACKAGE.equals(getPackageName());
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Pantalla inicial empaquetada en el APK. Viene del recurso
     * R.string.local_start_url para que cada sabor abra su propia interfaz
     * (index.html en Admin, scanner.html en el Escaner).
     */
    private String localStartUrl() {
        try {
            String url = getString(R.string.local_start_url);
            if (url != null && url.trim().length() > 0) {
                return url.trim();
            }
        } catch (Exception ignored) {
        }
        return "http://localhost/index.html";
    }

    private String normalizeBase(String url) {
        String clean = url == null ? "" : url.trim();
        while (clean.endsWith("/")) {
            clean = clean.substring(0, clean.length() - 1);
        }
        return clean;
    }

    /** Prueba rápida (2,5 s) para no dejar al dueño mirando una pantalla en blanco. */
    private boolean probeServer(String statusUrl) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(statusUrl).openConnection();
            conn.setConnectTimeout(2500);
            conn.setReadTimeout(2500);
            conn.setRequestMethod("GET");
            conn.setUseCaches(false);
            int code = conn.getResponseCode();
            return code > 0 && code < 500;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void loadRemoteUi(String url) {
        currentUiSource = "remote";
        webView.loadUrl(url);
    }

    private void loadLocalUi() {
        remoteLiveReady = false;
        currentUiSource = "local";
        webView.loadUrl(localStartUrl() + buildTabQuery());
    }

    /** Si la interfaz remota no carga, cae una sola vez a la copia del APK. */
    private void handleRemoteFailure() {
        if (!"remote".equals(currentUiSource) || fallbackDone) {
            return;
        }
        fallbackDone = true;
        remoteLiveReady = false;
        loadLocalUi();
    }

    /**
     * La página remota puede abrir pero con su JavaScript roto (un despliegue
     * a medias). mobile.js marca __MTP_MOBILE_READY__ al arrancar; si no está,
     * el APK usa su copia guardada en vez de dejar al dueño con una pantalla muerta.
     */
    private void verifyRemoteUiReady(WebView view) {
        if (!"remote".equals(currentUiSource) || fallbackDone) {
            return;
        }
        view.evaluateJavascript("(window.__MTP_MOBILE_READY__ === true || window.__MTP_IS_SCANNER_APP__ === true)", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (!"true".equals(value)) {
                    handleRemoteFailure();
                }
            }
        });
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
                requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIF);
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_CAMERA && pendingWebPermissionRequest != null) {
            boolean granted = grantResults != null && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            try {
                if (granted) {
                    pendingWebPermissionRequest.grant(pendingWebPermissionRequest.getResources());
                } else {
                    pendingWebPermissionRequest.deny();
                }
            } catch (Exception ignored) {
            } finally {
                pendingWebPermissionRequest = null;
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE_CHOOSER && fileChooserCallback != null) {
            Uri[] result = null;
            try {
                result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            } catch (Exception ignored) {
            }
            fileChooserCallback.onReceiveValue(result);
            fileChooserCallback = null;
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
            String raw = prefs.getString(KEY_SERVER_URL, "").trim();
            if (raw.isEmpty() || raw.contains("192.168.1.100") || raw.equals("http://localhost")) {
                return DEFAULT_SERVER_URL;
            }
            return normalizeBase(raw);
        }

        /** Guarda la dirección apenas el dueño la configura (no espera al login). */
        @JavascriptInterface
        public void setServerUrl(String serverUrl) {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            prefs.edit().putString(KEY_SERVER_URL, normalizeBase(serverUrl)).apply();
        }

        /** "remote" si la interfaz vino del servidor, "local" si es la copia del APK. */
        @JavascriptInterface
        public String getUiSource() {
            return currentUiSource;
        }

        /**
         * La sesión vive en las preferencias nativas para el servicio de alertas.
         * Al pasar a la interfaz remota (otro origen) se reusa para no pedir el PIN
         * una segunda vez; si el token venció, la app vuelve sola al login.
         */
        @JavascriptInterface
        public String getAuthToken() {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            return prefs.getString(KEY_TOKEN, "");
        }

        @JavascriptInterface
        public void setSessionUser(String userJson) {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            prefs.edit().putString(KEY_USER_JSON, userJson != null ? userJson : "").apply();
        }

        @JavascriptInterface
        public String getUserJson() {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            return prefs.getString(KEY_USER_JSON, "");
        }

        /* -----------------------------------------------------------------
           DETECTOR BANCARIO AUTOMATICO (PAGO MOVIL)
           ----------------------------------------------------------------- */

        /** true si Android ya autorizo a esta app a leer notificaciones. */
        @JavascriptInterface
        public boolean isNotificationAccessEnabled() {
            try {
                return BankNotificationListenerService.hasNotificationAccess(MainActivity.this);
            } catch (Throwable t) {
                return false;
            }
        }

        /** Abre la pantalla de Android para conceder el acceso a notificaciones. */
        @JavascriptInterface
        public void openNotificationAccessSettings() {
            try {
                Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception e) {
                try {
                    Intent fallback = new Intent(Settings.ACTION_SETTINGS);
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(fallback);
                } catch (Exception ignored) {
                }
            }
        }

        /** Enciende o apaga el detector sin quitarle el permiso del sistema. */
        @JavascriptInterface
        public void setBankListenerEnabled(boolean enabled) {
            try {
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                prefs.edit().putBoolean(KEY_BANK_LISTENER_ENABLED, enabled).apply();
            } catch (Exception ignored) {
            }
        }

        /**
         * Estado del detector en JSON exacto:
         * {"enabled":true,"access":true,"received":0,"lastAt":0,"lastText":"","lastResult":""}
         */
        @JavascriptInterface
        public String getBankListenerStatus() {
            boolean access = false;
            boolean enabled = false;
            int received = 0;
            long lastAt = 0L;
            String lastText = "";
            String lastResult = "";
            try {
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                access = BankNotificationListenerService.hasNotificationAccess(MainActivity.this);
                enabled = prefs.getBoolean(KEY_BANK_LISTENER_ENABLED, access);
                received = prefs.getInt(KEY_BANK_RECEIVED_COUNT, 0);
                lastAt = prefs.getLong(KEY_BANK_LAST_AT, 0L);
                String storedText = prefs.getString(KEY_BANK_LAST_TEXT, "");
                String storedResult = prefs.getString(KEY_BANK_LAST_RESULT, "");
                lastText = storedText != null ? storedText : "";
                lastResult = storedResult != null ? storedResult : "";
            } catch (Throwable ignored) {
            }
            return "{\"enabled\":" + enabled
                + ",\"access\":" + access
                + ",\"received\":" + received
                + ",\"lastAt\":" + lastAt
                + ",\"lastText\":" + BankNotificationListenerService.jsonQuote(lastText)
                + ",\"lastResult\":" + BankNotificationListenerService.jsonQuote(lastResult)
                + "}";
        }

        /** Recarga la interfaz viva (por ejemplo, después de cambiar de servidor). */
        @JavascriptInterface
        public void reloadUi() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    loadInitialUi();
                }
            });
        }

        @JavascriptInterface
        public void startAlerts(String serverUrl, String token, String storeName) {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            prefs.edit()
                .putString(KEY_SERVER_URL, serverUrl != null ? serverUrl : "")
                .putString(KEY_TOKEN, token != null ? token : "")
                .putString(KEY_STORE_NAME, storeName != null ? storeName : "MI TIENDA POS")
                .apply();

            // El APK Escaner nunca levanta el servicio de alertas de ventas.
            if (isScannerFlavor()) return;

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
            prefs.edit().remove(KEY_TOKEN).remove(KEY_USER_JSON).apply();
            if (isScannerFlavor()) return;
            stopService(new Intent(MainActivity.this, MtpAlertService.class));
        }

        @JavascriptInterface
        public void showTestNotification(String title, String body) {
            if (isScannerFlavor()) return;
            MtpAlertService.postStandardNotification(
                MainActivity.this,
                title != null ? title : "MI TIENDA ADMIN",
                body != null ? body : "Notificación de prueba",
                "live",
                9001
            );
        }

        @JavascriptInterface
        public boolean ensureCameraPermission() {
            if (Build.VERSION.SDK_INT < 23) return true;
            boolean granted = checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
            if (!granted) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                    }
                });
            }
            return granted;
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

        @JavascriptInterface
        public void playScanBeep(final String kind) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        boolean isErr = "err".equalsIgnoreCase(kind) || "warn".equalsIgnoreCase(kind);
                        int sampleRate = 44100;
                        int durationMs = isErr ? 120 : 60;
                        int numSamples = (int) (sampleRate * (durationMs / 1000.0));
                        short[] buffer = new short[numSamples];
                        double freq = isErr ? 350.0 : 2750.0;
                        double angle = 0;
                        double increment = 2.0 * Math.PI * freq / sampleRate;

                        for (int i = 0; i < numSamples; i++) {
                            double tMs = (double) i / sampleRate * 1000.0;
                            double env = 1.0;
                            if (tMs < 1.5) {
                                env = tMs / 1.5;
                            } else if (tMs > (durationMs - 4.0)) {
                                env = Math.max(0.0, (durationMs - tMs) / 4.0);
                            }
                            double sinVal = Math.sin(angle);
                            double squareVal = sinVal >= 0 ? 1.0 : -1.0;
                            double sampleVal = (squareVal * 0.85 + sinVal * 0.15) * 28000.0 * env;
                            buffer[i] = (short) Math.max(-32767, Math.min(32767, (int) sampleVal));
                            angle += increment;
                        }

                        AudioTrack track = new AudioTrack(
                            AudioManager.STREAM_MUSIC,
                            sampleRate,
                            AudioFormat.CHANNEL_OUT_MONO,
                            AudioFormat.ENCODING_PCM_16BIT,
                            numSamples * 2,
                            AudioTrack.MODE_STATIC
                        );
                        track.write(buffer, 0, numSamples);
                        track.play();
                        try {
                            Thread.sleep(durationMs + 20);
                        } catch (InterruptedException ignored) {}
                        track.stop();
                        track.release();
                    } catch (Exception ignored) {
                    }
                }
            }).start();
        }
    }
}
