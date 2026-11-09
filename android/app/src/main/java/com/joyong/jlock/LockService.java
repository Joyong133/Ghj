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
import android.provider.Settings;

/**
 * Keeps the study lock armed. When the screen turns off the lock becomes "pending" and the
 * overlay goes up, so it's the first thing seen after the screen comes back on (and after the
 * system PIN, if any). Pending is persisted, so a killed-and-restarted service re-locks.
 */
public class LockService extends Service {
    private static final String CH_SERVICE = "jlock_service";
    private static final String CH_ALERT = "jlock_alert";
    private static final int ID_SERVICE = 1;
    private static final int ID_ALERT = 2;
    private static final long WATCH_MS = 1000;

    private static final Handler main = new Handler(Looper.getMainLooper());
    private static LockService instance;

    private LockOverlay overlay;
    private final Runnable relockTask = () -> requestLock(false);
    private final Runnable watchTask = this::watch;

    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            String a = i.getAction();
            if (Intent.ACTION_SCREEN_OFF.equals(a)) {
                main.removeCallbacks(relockTask);
                requestLock(false);
            } else if (Prefs.isPending(c)) {
                // SCREEN_ON / USER_PRESENT: make sure the pending lock is actually up.
                requestLock(false);
            }
        }
    };

    // ----- static API -----

    static void start(Context c) {
        try {
            c.startForegroundService(new Intent(c, LockService.class));
        } catch (Exception ignored) {
            // Background start not allowed right now; MainActivity/boot will start it later.
        }
    }

    static void stop(Context c) {
        Prefs.setPending(c, false);
        c.stopService(new Intent(c, LockService.class));
    }

    /** "Lock now" from the home screen. */
    static void lockNow(Context c, boolean fromForeground) {
        if (instance != null && Settings.canDrawOverlays(c)) {
            instance.requestLock(true);
        } else {
            launchActivityFallback(c, fromForeground);
        }
    }

    /** The fallback LockActivity was passed. */
    static void passedExternally(Context c) {
        Prefs.setPending(c, false);
        if (instance != null) instance.scheduleRelock();
    }

    /** The fallback LockActivity was left via the emergency exit. */
    static void abandonedExternally(Context c) { Prefs.setPending(c, false); }

    /** Fallback LockActivity, strict mode: the user left it with Home, bring it back. */
    static void relaunchSoon(Context c) {
        Context app = c.getApplicationContext();
        main.postDelayed(() -> launchActivityFallback(app, false), 400);
    }

    // ----- lock state -----

    private void requestLock(boolean force) {
        if (!force && !Prefs.isEnabled(this)) return;
        Prefs.setPending(this, true);
        main.removeCallbacks(watchTask);
        watch();
    }

    /** Keeps the overlay in line with the pending flag; steps aside during calls. */
    private void watch() {
        if (!Prefs.isPending(this)) {
            overlay.hide();
            return;
        }
        if (inCall()) {
            overlay.hide();           // never cover the dialer or an incoming call
        } else if (!overlay.isShowing()) {
            if (!Settings.canDrawOverlays(this) || !overlay.show()) {
                launchActivityFallback(this, false);
                return;
            }
        }
        main.postDelayed(watchTask, WATCH_MS);
    }

    void onLockPassed() {
        Prefs.setPending(this, false);
        main.removeCallbacks(watchTask);
        overlay.hide();
        scheduleRelock();
    }

    void onLockAbandoned() {
        Prefs.setPending(this, false);
        main.removeCallbacks(watchTask);
        overlay.hide();
    }

    private void scheduleRelock() {
        main.removeCallbacks(relockTask);
        int secs = Prefs.relockSeconds(this);
        if (secs > 0 && Prefs.isEnabled(this)) main.postDelayed(relockTask, secs * 1000L);
    }

    private boolean inCall() {
        AudioManager am = getSystemService(AudioManager.class);
        if (am == null) return false;
        int m = am.getMode();
        return m == AudioManager.MODE_IN_CALL || m == AudioManager.MODE_IN_COMMUNICATION
                || m == AudioManager.MODE_RINGTONE;
    }

    // ----- service lifecycle -----

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        overlay = new LockOverlay(this);
        createChannels(this);
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_SCREEN_OFF);
        f.addAction(Intent.ACTION_SCREEN_ON);
        f.addAction(Intent.ACTION_USER_PRESENT);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(screenReceiver, f, RECEIVER_NOT_EXPORTED);
        else registerReceiver(screenReceiver, f);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification n = new Notification.Builder(this, CH_SERVICE)
                .setSmallIcon(R.drawable.ic_stat_lock)
                .setContentTitle("日本語ロック 작동 중")
                .setContentText("화면을 켜면 일본어 학습 잠금이 먼저 나타납니다")
                .setOngoing(true)
                .setContentIntent(PendingIntent.getActivity(this, 0,
                        new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE))
                .build();
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(ID_SERVICE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(ID_SERVICE, n);
            }
        } catch (Exception ignored) {
            // Restarted by the system while foreground starts are restricted; keep running anyway.
        }
        if (!Prefs.isEnabled(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (Prefs.isPending(this)) requestLock(false); // restore a lock that was up before a kill
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        instance = null;
        main.removeCallbacks(relockTask);
        main.removeCallbacks(watchTask);
        overlay.hide();
        try { unregisterReceiver(screenReceiver); } catch (Exception ignored) {}
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }

    // ----- fallback without the overlay permission -----

    private static void launchActivityFallback(Context c, boolean fromForeground) {
        if (LockActivity.showing) return;
        Intent i = new Intent(c, LockActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION);
        if (fromForeground) {
            try {
                c.startActivity(i);
                return;
            } catch (Exception ignored) {
            }
        }
        postFullScreenAlert(c, i);
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
                .setContentText("눌러서 학습 잠금을 해제하세요 ('다른 앱 위에 표시'를 허용하면 자동으로 잠깁니다)")
                .setCategory(Notification.CATEGORY_ALARM)
                .setFullScreenIntent(pi, true)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        c.getSystemService(NotificationManager.class).notify(ID_ALERT, n);
    }
}
