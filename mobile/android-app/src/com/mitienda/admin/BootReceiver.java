package com.mitienda.admin;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        SharedPreferences prefs = context.getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE);
        String url = prefs.getString(MainActivity.KEY_SERVER_URL, "");
        String tok = prefs.getString(MainActivity.KEY_TOKEN, "");
        if (url != null && !url.isEmpty() && tok != null && !tok.isEmpty()) {
            Intent svc = new Intent(context, MtpAlertService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(svc);
            } else {
                context.startService(svc);
            }
        }
    }
}
