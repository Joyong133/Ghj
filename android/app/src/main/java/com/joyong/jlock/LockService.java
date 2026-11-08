package com.joyong.jlock;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;

/**
 * Keeps the study lock armed: shows it whenever the screen turns off (so it is waiting when
 * the screen wakes) and on the relock timer while the phone is in use.
 */
public class LockService extends Service {
    private static final String CH_SERVICE = "jlock_service";
    private static final String CH_ALERT = "jlock_alert";
    private static final int ID_SERVICE = 1;
    private static final int ID_ALERT = 2;

    private static final Handler main = new Handler(Looper.getMainLooper());
    private static LockService instance;
    private static final Runnable relockTask = () -> {
        if (instance != null) instance.lockIfAppropriate(true);
    };

    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            if (Intent.ACTION_SCREEN_OFF.equals(i.getAction())) {
                main.removeCallbacks(relockTask);
                lockIfAppropriate(false);
            }
        }
    };

    // ----- static API used by activities -----

    static void start(Context c) {
        Intent i = new Intent(c, LockService.class);
        c.startForegroundService(i);
    }

    static void stop(Context c) {
        main.removeCallbacks(relockTask);
        c.stopService(new Intent(c, LockService.class));
    }

    /** After a successful unlock, schedule the next lock if relock is on. */
    static void scheduleRelock(Context c) {
        main.removeCallbacks(relockTask);
        int secs = Prefs.relockSeconds(c);
        if (secs > 0 && Prefs.isEnabled(c)) main.postDelayed(relockTask, secs * 1000L);
    }

    /** Strict mode: the user left the unsolved lock with Home, bring it back. */
    static void relaunchSoon(Context c) {
        Context app = c.getApplicationContext();
        main.postDelayed(() -> launchLock(app, false), 400);
    }

    /**
     * @param fromForeground true when called from a visible activity (always allowed to start
     *                       activities); background starts need "display over other apps".
     */
    static void launchLock(Context c, boolean fromForeground) {
        if (LockActivity.showing) return;
        Intent i = new Intent(c, LockActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION);
        // A blocked background start fails silently, so without the overlay permission
        // use a full-screen notification instead.
        if (fromForeground || Settings.canDrawOverlays(c)) {
            try {
                c.startActivity(i);
                return;
            } catch (Exception ignored) {
            }
        }
        postFullScreenAlert(c, i);
    }

    // ----- service lifecycle -----

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createChannels(this);
        IntentFilter f = new IntentFilter(Intent.ACTION_SCREEN_OFF);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(screenReceiver, f, RECEIVER_NOT_EXPORTED);
        else registerReceiver(screenReceiver, f);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification n = new Notification.Builder(this, CH_SERVICE)
                .setSmallIcon(R.drawable.ic_stat_lock)
                .setContentTitle("日本語ロック 작동 중")
                .setContentText("화면을 켤 때마다 일본어 학습 잠금이 나타납니다")
                .setOngoing(true)
                .setContentIntent(PendingIntent.getActivity(this, 0,
                        new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE))
                .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(ID_SERVICE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(ID_SERVICE, n);
        }
        if (!Prefs.isEnabled(this)) stopSelf();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        instance = null;
        main.removeCallbacks(relockTask);
        try { unregisterReceiver(screenReceiver); } catch (Exception ignored) {}
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }

    // ----- helpers -----

    private void lockIfAppropriate(boolean needScreenOn) {
        if (!Prefs.isEnabled(this)) return;
        if (inCall()) return; // never cover an ongoing phone/VoIP call
        if (needScreenOn) {
            PowerManager pm = getSystemService(PowerManager.class);
            if (pm != null && !pm.isInteractive()) return; // screen-off path will handle it
        }
        launchLock(this, false);
    }

    private boolean inCall() {
        AudioManager am = getSystemService(AudioManager.class);
        if (am == null) return false;
        int m = am.getMode();
        return m == AudioManager.MODE_IN_CALL || m == AudioManager.MODE_IN_COMMUNICATION
                || m == AudioManager.MODE_RINGTONE;
    }

    private static void createChannels(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel svc = new NotificationChannel(CH_SERVICE, "잠금 서비스",
                NotificationManager.IMPORTANCE_MIN);
        svc.setShowBadge(false);
        NotificationChannel alert = new NotificationChannel(CH_ALERT, "학습 잠금 알림",
                NotificationManager.IMPORTANCE_HIGH);
        nm.createNotificationChannel(svc);
        nm.createNotificationChannel(alert);
    }

    private static void postFullScreenAlert(Context c, Intent lock) {
        createChannels(c);
        PendingIntent pi = PendingIntent.getActivity(c, 1, lock,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(c, CH_ALERT)
                .setSmallIcon(R.drawable.ic_stat_lock)
                .setContentTitle("📚 일본어 학습 시간")
                .setContentText("눌러서 학습 잠금을 해제하세요")
                .setCategory(Notification.CATEGORY_ALARM)
                .setFullScreenIntent(pi, true)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        c.getSystemService(NotificationManager.class).notify(ID_ALERT, n);
    }
}
