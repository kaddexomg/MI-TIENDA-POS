package com.mitienda.admin;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * Detector Bancario Automatico (Pago Movil).
 *
 * Escucha las notificaciones del telefono, filtra las que parecen un pago
 * recibido (Pago Movil, transferencia o abono) y las envia al servidor para
 * conciliar el cobro en Caja sin que el cajero tenga que revisar capturas.
 *
 * Reglas de seguridad:
 * - Solo se envia un texto si trae MONTO y una senal de pago.
 * - El mismo texto no se envia dos veces (hash SHA-256 de los ultimos 20).
 * - El envio va en un hilo aparte: nunca se bloquea el listener.
 * - Nunca se envia la notificacion completa del telefono, solo el texto del
 *   banco, el paquete de origen y la hora.
 */
public class BankNotificationListenerService extends NotificationListenerService {

    /** Cantidad de hashes recordados para evitar reenvios. */
    private static final int MAX_RECENT_HASHES = 20;

    /**
     * Palabras clave bancarias. Si el titulo + texto no trae ninguna, la
     * notificacion se descarta antes de tocar la red.
     */
    private static final String[] BANK_KEYWORDS = new String[] {
        "pago movil", "pagomovil", "pago móvil", "recibido", "recibiste", "abono",
        "transferencia", "referencia", "ref", "banesco", "mercantil", "bdv",
        "banco de venezuela", "venezuela", "provincial", "bnc", "bancamiga",
        "bancaribe", "banplus", "bicentenario", "sofitasa", "tesoro", "exterior",
        "plaza", "activo", "bfc"
    };

    /**
     * Senal real de pago. Es la lista anterior sin la palabra generica "ref",
     * que por si sola no prueba que haya entrado dinero.
     */
    private static final String[] PAYMENT_SIGNALS = new String[] {
        "pago movil", "pagomovil", "pago móvil", "recibido", "recibiste", "abono",
        "transferencia", "referencia", "banesco", "mercantil", "bdv",
        "banco de venezuela", "venezuela", "provincial", "bnc", "bancamiga",
        "bancaribe", "banplus", "bicentenario", "sofitasa", "tesoro", "exterior",
        "plaza", "activo", "bfc"
    };

    /**
     * Monto en Bolivares. Acepta 1.250,50 / 1250.50 / 1,250.50 y tambien
     * "Bs 1250" sin centavos.
     */
    private static final Pattern AMOUNT_PATTERN = Pattern.compile(
        "\\d{1,3}(?:[.,\\s]\\d{3})*[.,]\\d{2}"
        + "|\\d+[.,]\\d{2}"
        + "|(?:bs|bss|bolivares|bolívares)\\s*:?\\s*\\d{3,}"
    );

    private static final ExecutorService SEND_POOL = Executors.newSingleThreadExecutor();

    /* ---------------------------------------------------------------------
       CONSULTAS PUBLICAS (tambien las usa MainActivity.AndroidBridge)
       --------------------------------------------------------------------- */

    /** True si Android ya le dio acceso a notificaciones a esta aplicacion. */
    public static boolean hasNotificationAccess(Context ctx) {
        if (ctx == null) return false;
        try {
            // "enabled_notification_listeners" es el nombre de la preferencia
            // segura de Android (Settings.Secure.ENABLED_NOTIFICATION_LISTENERS).
            String flat = Settings.Secure.getString(
                ctx.getContentResolver(),
                "enabled_notification_listeners"
            );
            if (flat == null || flat.length() == 0) return false;
            String pkg = ctx.getPackageName();
            String[] parts = flat.split(":");
            for (int i = 0; i < parts.length; i++) {
                ComponentName cn = ComponentName.unflattenFromString(parts[i]);
                if (cn != null && pkg != null && pkg.equals(cn.getPackageName())) {
                    return true;
                }
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    /**
     * Interruptor del dueño. Si nunca lo toco, queda encendido en cuanto el
     * acceso a notificaciones este concedido.
     */
    public static boolean isBankListenerEnabled(Context ctx) {
        if (ctx == null) return false;
        try {
            SharedPreferences prefs = ctx.getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE);
            boolean access = hasNotificationAccess(ctx);
            return prefs.getBoolean(MainActivity.KEY_BANK_LISTENER_ENABLED, access);
        } catch (Exception ignored) {
            return false;
        }
    }

    /** Cadena JSON segura (comillas, saltos de linea y controles escapados). */
    public static String jsonQuote(String value) {
        if (value == null) return "\"\"";
        StringBuilder sb = new StringBuilder(value.length() + 2);
        sb.append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format(Locale.US, "\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append('"');
        return sb.toString();
    }

    /* ---------------------------------------------------------------------
       LISTENER
       --------------------------------------------------------------------- */

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            handleNotification(sbn);
        } catch (Throwable ignored) {
            // Un listener jamas debe caer: Android lo desactivaria.
        }
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
    }

    private void handleNotification(StatusBarNotification sbn) {
        if (sbn == null) return;
        if (sbn.isOngoing()) return;

        String sourcePackage = sbn.getPackageName();
        if (sourcePackage == null || sourcePackage.length() == 0) return;
        // Nunca escucharse a si mismo (evita bucles de notificaciones propias).
        if (sourcePackage.equals(getPackageName())) return;

        if (!isBankListenerEnabled(this)) return;

        Notification notif = sbn.getNotification();
        if (notif == null) return;
        Bundle extras = notif.extras;
        if (extras == null) return;

        String title = readExtra(extras, Notification.EXTRA_TITLE);
        String subText = readExtra(extras, Notification.EXTRA_SUB_TEXT);
        String text = readExtra(extras, Notification.EXTRA_TEXT);
        String bigText = readExtra(extras, Notification.EXTRA_BIG_TEXT);

        String body = joinNonEmpty(subText, bigText.length() > 0 ? bigText : text);
        if (title.length() == 0 && body.length() == 0) return;

        String haystack = (title + " " + body).toLowerCase(Locale.ROOT);

        if (!containsAny(haystack, BANK_KEYWORDS)) return;
        if (!containsAny(haystack, PAYMENT_SIGNALS)) return;
        if (!AMOUNT_PATTERN.matcher(haystack).find()) return;

        String hash = sha256Hex(normalizeForHash(sourcePackage + "|" + title + "|" + body));
        if (!rememberHash(hash)) return;

        long postedAt = sbn.getPostTime();
        if (postedAt <= 0) postedAt = System.currentTimeMillis();

        SharedPreferences prefs = getSharedPreferences(MainActivity.PREFS_NAME, MODE_PRIVATE);
        int received = prefs.getInt(MainActivity.KEY_BANK_RECEIVED_COUNT, 0) + 1;
        prefs.edit()
            .putInt(MainActivity.KEY_BANK_RECEIVED_COUNT, received)
            .putLong(MainActivity.KEY_BANK_LAST_AT, postedAt)
            .putString(MainActivity.KEY_BANK_LAST_TEXT, body.length() > 0 ? body : title)
            .apply();

        String serverUrl = normalizeBase(prefs.getString(MainActivity.KEY_SERVER_URL, ""));
        String token = prefs.getString(MainActivity.KEY_TOKEN, "");
        if (token == null) token = "";
        token = token.trim();

        if (serverUrl.length() == 0 || token.length() == 0) {
            saveLastResult("Sin sesion configurada");
            return;
        }

        String sourceApp = resolveAppLabel(sourcePackage);
        sendToServer(serverUrl, token, sourcePackage, sourceApp, title, body, postedAt);
    }

    /* ---------------------------------------------------------------------
       ENVIO AL SERVIDOR
       --------------------------------------------------------------------- */

    private void sendToServer(final String serverUrl, final String token,
                              final String sourcePackage, final String sourceApp,
                              final String title, final String text, final long postedAt) {
        final Context appCtx = getApplicationContext();
        SEND_POOL.execute(new Runnable() {
            @Override
            public void run() {
                String result;
                HttpURLConnection conn = null;
                try {
                    StringBuilder json = new StringBuilder();
                    json.append('{');
                    json.append("\"clientApp\":\"mobile-bank-listener\",");
                    json.append("\"sourcePackage\":").append(jsonQuote(sourcePackage)).append(',');
                    json.append("\"sourceApp\":").append(jsonQuote(sourceApp)).append(',');
                    json.append("\"title\":").append(jsonQuote(title)).append(',');
                    json.append("\"text\":").append(jsonQuote(text)).append(',');
                    json.append("\"postedAt\":").append(postedAt);
                    json.append('}');

                    byte[] payload = json.toString().getBytes(StandardCharsets.UTF_8);
                    URL url = new URL(normalizeBase(serverUrl) + "/api/v1/pagomovil/incoming");
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(8000);
                    conn.setDoOutput(true);
                    conn.setUseCaches(false);
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    conn.setRequestProperty("Accept", "application/json");
                    conn.setRequestProperty("Authorization", "Bearer " + token);
                    conn.setFixedLengthStreamingMode(payload.length);

                    OutputStream out = conn.getOutputStream();
                    out.write(payload);
                    out.flush();
                    out.close();

                    int code = conn.getResponseCode();
                    if (code >= 200 && code < 300) {
                        result = "Enviado";
                    } else {
                        result = "Error HTTP " + code;
                    }
                } catch (Exception e) {
                    String msg = e.getMessage();
                    result = (msg != null && msg.length() > 0) ? msg : e.getClass().getSimpleName();
                } finally {
                    if (conn != null) {
                        try { conn.disconnect(); } catch (Exception ignored) {}
                    }
                }
                saveLastResult(appCtx, result);
            }
        });
    }

    private void saveLastResult(String result) {
        saveLastResult(getApplicationContext(), result);
    }

    private static void saveLastResult(Context ctx, String result) {
        if (ctx == null) return;
        try {
            SharedPreferences prefs = ctx.getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit()
                .putString(MainActivity.KEY_BANK_LAST_RESULT, result != null ? result : "")
                .apply();
        } catch (Exception ignored) {
        }
    }

    /* ---------------------------------------------------------------------
       UTILIDADES INTERNAS
       --------------------------------------------------------------------- */

    private static String readExtra(Bundle extras, String key) {
        try {
            CharSequence value = extras.getCharSequence(key);
            if (value == null) return "";
            return value.toString().trim();
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String joinNonEmpty(String first, String second) {
        String a = first != null ? first.trim() : "";
        String b = second != null ? second.trim() : "";
        if (a.length() == 0) return b;
        if (b.length() == 0) return a;
        if (a.equals(b)) return a;
        return a + " · " + b;
    }

    private static boolean containsAny(String haystack, String[] needles) {
        if (haystack == null) return false;
        for (int i = 0; i < needles.length; i++) {
            if (haystack.indexOf(needles[i]) >= 0) return true;
        }
        return false;
    }

    private static String normalizeForHash(String value) {
        if (value == null) return "";
        return value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
    }

    private static String normalizeBase(String url) {
        String clean = url == null ? "" : url.trim();
        while (clean.endsWith("/")) {
            clean = clean.substring(0, clean.length() - 1);
        }
        return clean;
    }

    private static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(bytes.length * 2);
            for (int i = 0; i < bytes.length; i++) {
                String hex = Integer.toHexString(bytes[i] & 0xFF);
                if (hex.length() == 1) sb.append('0');
                sb.append(hex);
            }
            return sb.toString();
        } catch (Exception e) {
            return "h" + value.hashCode();
        }
    }

    /**
     * Recuerda el hash. Devuelve false si ese texto ya se proceso antes
     * (los ultimos 20 se guardan en SharedPreferences, sin base de datos).
     */
    private boolean rememberHash(String hash) {
        SharedPreferences prefs = getSharedPreferences(MainActivity.PREFS_NAME, MODE_PRIVATE);
        String raw = prefs.getString(MainActivity.KEY_BANK_RECENT_HASHES, "");
        List<String> recent = new ArrayList<String>();
        if (raw != null && raw.length() > 0) {
            String[] parts = raw.split("\n");
            for (int i = 0; i < parts.length; i++) {
                String h = parts[i].trim();
                if (h.length() > 0) recent.add(h);
            }
        }
        if (recent.contains(hash)) return false;

        recent.add(0, hash);
        while (recent.size() > MAX_RECENT_HASHES) {
            recent.remove(recent.size() - 1);
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < recent.size(); i++) {
            if (i > 0) sb.append('\n');
            sb.append(recent.get(i));
        }
        prefs.edit().putString(MainActivity.KEY_BANK_RECENT_HASHES, sb.toString()).apply();
        return true;
    }

    /** Nombre visible de la app que emitio la notificacion (Banesco, BDV...). */
    private String resolveAppLabel(String packageName) {
        try {
            PackageManager pm = getPackageManager();
            if (pm != null) {
                ApplicationInfo info = pm.getApplicationInfo(packageName, 0);
                CharSequence label = pm.getApplicationLabel(info);
                if (label != null && label.length() > 0) {
                    return label.toString();
                }
            }
        } catch (Exception ignored) {
        }
        return packageName;
    }
}
