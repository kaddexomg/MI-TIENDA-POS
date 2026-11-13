package com.mitienda.admin;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.concurrent.atomic.AtomicInteger;

public class MtpAlertService extends Service {

    private static final String CHANNEL_SERVICE = "mtp_service_channel";
    private static final String CHANNEL_ALERTS = "mtp_alerts_channel";
    private static final int FOREGROUND_ID = 1001;
    private static final AtomicInteger NOTIF_SEQ = new AtomicInteger(2000);

    private volatile boolean running = false;
    private Thread workerThread = null;
    private HttpURLConnection activeConn = null;

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannels(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences prefs = getSharedPreferences(MainActivity.PREFS_NAME, MODE_PRIVATE);
        String storeName = prefs.getString(MainActivity.KEY_STORE_NAME, "MI TIENDA POS");
        Notification fg = buildForegroundNotification(storeName);

        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(FOREGROUND_ID, fg, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(FOREGROUND_ID, fg);
        }

        startWorkerIfNeeded();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        if (activeConn != null) {
            try { activeConn.disconnect(); } catch (Exception ignored) {}
        }
        if (workerThread != null) {
            workerThread.interrupt();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void startWorkerIfNeeded() {
        if (running && workerThread != null && workerThread.isAlive()) return;
        running = true;
        workerThread = new Thread(new Runnable() {
            @Override
            public void run() {
                listenLoop();
            }
        }, "MtpSseAlertThread");
        workerThread.start();
    }

    private void listenLoop() {
        while (running) {
            SharedPreferences prefs = getSharedPreferences(MainActivity.PREFS_NAME, MODE_PRIVATE);
            String serverUrl = prefs.getString(MainActivity.KEY_SERVER_URL, "").replaceAll("/+$", "");
            String token = prefs.getString(MainActivity.KEY_TOKEN, "");

            if (serverUrl.isEmpty() || token.isEmpty()) {
                sleepQuietly(8000);
                continue;
            }

            BufferedReader reader = null;
            try {
                String streamUrl = serverUrl + "/api/v1/stream?token=" + URLEncoder.encode(token, "UTF-8");
                URL url = new URL(streamUrl);
                activeConn = (HttpURLConnection) url.openConnection();
                activeConn.setRequestMethod("GET");
                activeConn.setRequestProperty("Accept", "text/event-stream");
                activeConn.setConnectTimeout(10000);
                activeConn.setReadTimeout(65000);
                activeConn.connect();

                int code = activeConn.getResponseCode();
                if (code == 401) {
                    sleepQuietly(20000);
                    continue;
                }
                if (code != 200) {
                    sleepQuietly(7000);
                    continue;
                }

                reader = new BufferedReader(new InputStreamReader(activeConn.getInputStream(), "UTF-8"));
                String line;
                String currentEvent = "";
                StringBuilder dataBuf = new StringBuilder();

                while (running && (line = reader.readLine()) != null) {
                    if (line.isEmpty()) {
                        if ("state_event".equals(currentEvent) && dataBuf.length() > 0) {
                            handleSseJson(dataBuf.toString());
                        }
                        currentEvent = "";
                        dataBuf.setLength(0);
                    } else if (line.startsWith("event:")) {
                        currentEvent = line.substring(6).trim();
                    } else if (line.startsWith("data:")) {
                        if (dataBuf.length() > 0) dataBuf.append('\n');
                        dataBuf.append(line.substring(5).trim());
                    }
                }
            } catch (Exception ignored) {
            } finally {
                if (reader != null) {
                    try { reader.close(); } catch (Exception ignored) {}
                }
                if (activeConn != null) {
                    try { activeConn.disconnect(); } catch (Exception ignored) {}
                    activeConn = null;
                }
            }

            sleepQuietly(6000);
        }
    }

    private void handleSseJson(String jsonText) {
        try {
            JSONObject meta = new JSONObject(jsonText);
            String type = meta.optString("type", "");
            JSONObject sum = meta.optJSONObject("summary");
            if (sum == null) sum = new JSONObject();

            if ("SALE_CREATED".equals(type)) {
                String order = sum.optString("orderNumber", "");
                double totalUsd = sum.optDouble("totalUsd", 0);
                boolean hasPm = sum.optBoolean("hasPendingPagoMovil", false);

                if (hasPm) {
                    double pmBs = sum.optDouble("pendingPmBs", 0);
                    String pmRef = sum.optString("pendingPmRef", "—");
                    postStandardNotification(
                        this,
                        "📲 Pago Móvil por verificar",
                        String.format("Orden #%s · Bs %.2f · Ref #%s", order, pmBs, pmRef),
                        "pagomovil",
                        NOTIF_SEQ.incrementAndGet()
                    );
                } else {
                    postStandardNotification(
                        this,
                        "🧾 Venta registrada #" + order,
                        String.format("Total cobrado: $%.2f", totalUsd),
                        "live",
                        NOTIF_SEQ.incrementAndGet()
                    );
                }

                JSONArray lowArr = sum.optJSONArray("lowStockAlerts");
                if (lowArr != null && lowArr.length() > 0) {
                    JSONObject first = lowArr.optJSONObject(0);
                    if (first != null) {
                        postStandardNotification(
                            this,
                            "🚨 Inventario bajo / crítico",
                            first.optString("name", "Producto") + ": quedan " + first.optDouble("stock", 0) + " " + first.optString("unit", "und"),
                            "inventory",
                            NOTIF_SEQ.incrementAndGet()
                        );
                    }
                }
            } else if ("PAGO_MOVIL_STATUS_CHANGED".equals(type)) {
                String st = sum.optString("newStatus", "");
                String ref = sum.optString("paymentRef", "");
                if ("RECHAZADO".equals(st)) {
                    postStandardNotification(
                        this,
                        "⚠ Pago Móvil observado",
                        "Revisar referencia #" + ref,
                        "pagomovil",
                        NOTIF_SEQ.incrementAndGet()
                    );
                }
            }
        } catch (Exception ignored) {
        }
    }

    private Notification buildForegroundNotification(String storeName) {
        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new Notification.Builder(this, CHANNEL_SERVICE)
            .setContentTitle(storeName + " · Admin Activo")
            .setContentText("Escuchando ventas, Pago Móvil e inventario en segundo plano")
            .setSmallIcon(R.drawable.ic_notif)
            .setContentIntent(pi)
            .setOngoing(true)
            .build();
    }

    public static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        NotificationChannel svcCh = new NotificationChannel(
            CHANNEL_SERVICE,
            "Conexión en segundo plano",
            NotificationManager.IMPORTANCE_LOW
        );
        svcCh.setDescription("Mantiene conectadas las alertas del negocio");
        nm.createNotificationChannel(svcCh);

        NotificationChannel alertCh = new NotificationChannel(
            CHANNEL_ALERTS,
            "Ventas, Pago Móvil e Inventario",
            NotificationManager.IMPORTANCE_HIGH
        );
        alertCh.setDescription("Notificaciones importantes de ventas, Pagos Móviles por verificar y stock crítico");
        alertCh.enableVibration(true);
        nm.createNotificationChannel(alertCh);
    }

    public static void postStandardNotification(Context ctx, String title, String body, String tab, int notifId) {
        ensureChannels(ctx);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Intent openIntent = new Intent(ctx, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (tab != null && !tab.isEmpty()) {
            openIntent.putExtra("extra_tab", tab);
        }

        PendingIntent pi = PendingIntent.getActivity(
            ctx, notifId, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notif = new Notification.Builder(ctx, CHANNEL_ALERTS)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setSmallIcon(R.drawable.ic_notif)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build();

        nm.notify(notifId, notif);
    }

    private void sleepQuietly(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ignored) {
        }
    }
}
