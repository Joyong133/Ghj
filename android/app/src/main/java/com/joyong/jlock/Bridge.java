package com.joyong.jlock;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

/** Methods exposed to the study UI as window.JLock. */
class Bridge {
    interface Host {
        void onUnlocked();
        void onEmergencyExit();
    }

    private final Activity act;
    private final Speaker speaker;
    private final Host host;

    Bridge(Activity act, Speaker speaker, Host host) {
        this.act = act;
        this.speaker = speaker;
        this.host = host;
    }

    @JavascriptInterface public String getConfig() { return Prefs.getConfig(act); }

    @JavascriptInterface public void saveConfig(String json) {
        Prefs.setConfig(act, json);
    }

    @JavascriptInterface public String version() { return BuildConfigHolder.VERSION; }

    @JavascriptInterface public boolean ttsReady() { return speaker.isReady(); }

    @JavascriptInterface public void speak(String text) { speaker.speak(text); }

    @JavascriptInterface public void vibrate(int ms) {
        Vibrator v = act.getSystemService(Vibrator.class);
        if (v == null || !v.hasVibrator()) return;
        v.vibrate(VibrationEffect.createOneShot(Math.max(1, Math.min(ms, 1000)),
                VibrationEffect.DEFAULT_AMPLITUDE));
    }

    // ----- lock service -----

    @JavascriptInterface public boolean isEnabled() { return Prefs.isEnabled(act); }

    @JavascriptInterface public void setEnabled(boolean on) {
        Prefs.setEnabled(act, on);
        if (on) LockService.start(act); else LockService.stop(act);
    }

    @JavascriptInterface public void lockNow() {
        act.runOnUiThread(() -> LockService.launchLock(act, true));
    }

    @JavascriptInterface public void unlocked() { act.runOnUiThread(host::onUnlocked); }

    @JavascriptInterface public void emergencyExit() { act.runOnUiThread(host::onEmergencyExit); }

    // ----- permissions -----

    @JavascriptInterface public boolean hasOverlay() { return Settings.canDrawOverlays(act); }

    @JavascriptInterface public void openOverlaySettings() {
        act.runOnUiThread(() -> act.startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + act.getPackageName()))));
    }

    @JavascriptInterface public boolean hasNotif() {
        return Build.VERSION.SDK_INT < 33
                || act.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    @JavascriptInterface public void requestNotif() {
        if (Build.VERSION.SDK_INT >= 33) {
            act.runOnUiThread(() -> act.requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1));
        }
    }

    @JavascriptInterface public void openBatterySettings() {
        act.runOnUiThread(() -> {
            try {
                act.startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Exception e) {
                act.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + act.getPackageName())));
            }
        });
    }
}
