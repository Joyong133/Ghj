package com.joyong.jlock;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

/**
 * Methods exposed to the study UI as window.JLock. Works from an Activity (home screen)
 * or from the lock overlay owned by the service (act == null).
 */
class Bridge {
    interface Host {
        void onUnlocked();
        void onEmergencyExit();
    }

    private final Context ctx;
    private final Activity act;
    private final Speaker speaker;
    private final Host host;
    private final Handler main = new Handler(Looper.getMainLooper());

    Bridge(Context ctx, Activity act, Speaker speaker, Host host) {
        this.ctx = ctx;
        this.act = act;
        this.speaker = speaker;
        this.host = host;
    }

    private void open(Intent i) {
        if (act == null) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        (act != null ? act : ctx).startActivity(i);
    }

    @JavascriptInterface public String getConfig() { return Prefs.getConfig(ctx); }

    @JavascriptInterface public void saveConfig(String json) { Prefs.setConfig(ctx, json); }

    @JavascriptInterface public String version() { return BuildConfigHolder.VERSION; }

    @JavascriptInterface public boolean ttsReady() { return speaker.isReady(); }

    @JavascriptInterface public void speak(String text) { speaker.speak(text); }

    @JavascriptInterface public void vibrate(int ms) {
        Vibrator v = ctx.getSystemService(Vibrator.class);
        if (v == null || !v.hasVibrator()) return;
        v.vibrate(VibrationEffect.createOneShot(Math.max(1, Math.min(ms, 1000)),
                VibrationEffect.DEFAULT_AMPLITUDE));
    }

    // ----- lock service -----

    @JavascriptInterface public boolean isEnabled() { return Prefs.isEnabled(ctx); }

    @JavascriptInterface public void setEnabled(boolean on) {
        main.post(() -> {
            Prefs.setEnabled(ctx, on);
            if (on) LockService.start(ctx); else LockService.stop(ctx);
        });
    }

    @JavascriptInterface public void lockNow() {
        main.post(() -> LockService.lockNow(ctx, act != null));
    }

    @JavascriptInterface public void unlocked() { main.post(host::onUnlocked); }

    @JavascriptInterface public void emergencyExit() { main.post(host::onEmergencyExit); }

    // ----- permissions -----

    @JavascriptInterface public boolean hasOverlay() { return Settings.canDrawOverlays(ctx); }

    @JavascriptInterface public void openOverlaySettings() {
        main.post(() -> open(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + ctx.getPackageName()))));
    }

    @JavascriptInterface public boolean hasNotif() {
        return Build.VERSION.SDK_INT < 33
                || ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    @JavascriptInterface public void requestNotif() {
        if (Build.VERSION.SDK_INT >= 33 && act != null) {
            main.post(() -> act.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1));
        }
    }

    @JavascriptInterface public boolean hasBatteryExemption() {
        PowerManager pm = ctx.getSystemService(PowerManager.class);
        return pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
    }

    /** Asks directly to be exempt from battery optimization (so the lock service isn't killed). */
    @JavascriptInterface public void openBatterySettings() {
        main.post(() -> {
            try {
                open(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:" + ctx.getPackageName())));
            } catch (Exception e) {
                try {
                    open(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                } catch (Exception ignored) {
                }
            }
        });
    }
}
