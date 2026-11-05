package com.joyong.mutetimer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.database.ContentObserver;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;

/**
 * 설정한 시간 동안 미디어 소리(음악, 게임 BGM, 영상 소리 등)를 막는 포그라운드 서비스.
 *
 * 1) 미디어 볼륨(STREAM_MUSIC)을 음소거하고, 누가 볼륨을 올리면 즉시 다시 음소거한다.
 * 2) (옵션) 오디오 포커스를 가져와서 음악/영상 앱이 재생을 일시정지하게 만든다.
 * 시간이 끝나면 원래 볼륨으로 되돌린다. 전화벨·알람·알림 소리는 건드리지 않는다.
 */
public class MuteService extends Service {

    public static final String ACTION_START = "com.joyong.mutetimer.START";
    public static final String ACTION_STOP = "com.joyong.mutetimer.STOP";
    public static final String EXTRA_MINUTES = "minutes";
    public static final String EXTRA_PAUSE_APPS = "pause_apps";

    public static final String PREFS = "mute_prefs";
    public static final String KEY_END_AT = "end_at";          // System.currentTimeMillis 기준 종료 시각
    private static final String KEY_SAVED_VOLUME = "saved_volume";
    private static final String KEY_PAUSE_APPS = "pause_apps";

    private static final String CHANNEL_RUNNING = "mute_running";
    private static final String CHANNEL_DONE = "mute_done";
    private static final int NOTI_RUNNING = 1;
    private static final int NOTI_DONE = 2;
    private static final int STREAM = AudioManager.STREAM_MUSIC;

    private AudioManager audioManager;
    private NotificationManager notificationManager;
    private SharedPreferences prefs;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private AudioFocusRequest focusRequest;
    private ContentObserver volumeObserver;
    private long endAt;
    private boolean pauseApps;
    private boolean engaged;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            long remaining = endAt - System.currentTimeMillis();
            if (remaining <= 0) {
                finishBlock(false);
                return;
            }
            enforceMute();
            notificationManager.notify(NOTI_RUNNING, buildRunningNotification(remaining));
            handler.postDelayed(this, 1000);
        }
    };

    private final Runnable regainFocus = this::requestFocus;

    private final AudioManager.OnAudioFocusChangeListener focusListener = change -> {
        // 다른 앱이 재생을 시작하며 포커스를 영구히 가져가면, 잠시 후 다시 빼앗아 그 앱을 멈춘다.
        if (change == AudioManager.AUDIOFOCUS_LOSS && engaged && pauseApps) {
            handler.removeCallbacks(regainFocus);
            handler.postDelayed(regainFocus, 700);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        createChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;

        if (ACTION_STOP.equals(action)) {
            // startForegroundService 로 불렸을 수 있으므로 먼저 포그라운드 진입 후 종료
            safeStartForeground(0);
            finishBlock(true);
            return START_NOT_STICKY;
        }

        if (ACTION_START.equals(action)) {
            int minutes = intent.getIntExtra(EXTRA_MINUTES, 0);
            pauseApps = intent.getBooleanExtra(EXTRA_PAUSE_APPS, true);
            endAt = System.currentTimeMillis() + minutes * 60_000L;
            SharedPreferences.Editor e = prefs.edit()
                    .putLong(KEY_END_AT, endAt)
                    .putBoolean(KEY_PAUSE_APPS, pauseApps);
            if (!prefs.contains(KEY_SAVED_VOLUME)) {
                // 처음 차단을 시작할 때만 원래 볼륨을 기억 (연장/재시작 시에는 유지)
                e.putInt(KEY_SAVED_VOLUME, audioManager.getStreamVolume(STREAM));
            }
            e.apply();
        } else {
            // 시스템이 서비스를 재시작한 경우: 저장된 상태로 이어서 진행
            endAt = prefs.getLong(KEY_END_AT, 0);
            pauseApps = prefs.getBoolean(KEY_PAUSE_APPS, true);
        }

        long remaining = endAt - System.currentTimeMillis();
        if (!safeStartForeground(Math.max(remaining, 0))) {
            finishBlock(false);
            return START_NOT_STICKY;
        }
        if (remaining <= 0) {
            finishBlock(false);
            return START_NOT_STICKY;
        }

        engage();
        handler.removeCallbacks(tick);
        handler.post(tick);
        return START_STICKY;
    }

    private boolean safeStartForeground(long remaining) {
        try {
            Notification n = buildRunningNotification(remaining);
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTI_RUNNING, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTI_RUNNING, n);
            }
            return true;
        } catch (RuntimeException ex) {
            return false;
        }
    }

    private void engage() {
        if (!engaged) {
            engaged = true;
            volumeObserver = new ContentObserver(handler) {
                @Override
                public void onChange(boolean selfChange) {
                    enforceMute();
                }
            };
            getContentResolver().registerContentObserver(Settings.System.CONTENT_URI, true, volumeObserver);
        }
        if (pauseApps) {
            requestFocus();
        } else {
            abandonFocus();
        }
        enforceMute();
    }

    private void enforceMute() {
        if (!engaged) return;
        try {
            if (!audioManager.isStreamMute(STREAM)) {
                audioManager.adjustStreamVolume(STREAM, AudioManager.ADJUST_MUTE, 0);
            }
            if (audioManager.getStreamVolume(STREAM) > 0) {
                audioManager.setStreamVolume(STREAM, 0, 0);
            }
        } catch (SecurityException ignored) {
            // 일부 기기에서 방해금지 모드 중 볼륨 변경이 거부될 수 있음
        }
    }

    private void requestFocus() {
        if (!engaged || !pauseApps) return;
        if (focusRequest == null) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build();
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(attrs)
                    .setWillPauseWhenDucked(true)
                    .setOnAudioFocusChangeListener(focusListener, handler)
                    .build();
        }
        audioManager.requestAudioFocus(focusRequest);
    }

    private void abandonFocus() {
        handler.removeCallbacks(regainFocus);
        if (focusRequest != null) {
            audioManager.abandonAudioFocusRequest(focusRequest);
            focusRequest = null;
        }
    }

    private void finishBlock(boolean byUser) {
        handler.removeCallbacksAndMessages(null);
        engaged = false;
        if (volumeObserver != null) {
            getContentResolver().unregisterContentObserver(volumeObserver);
            volumeObserver = null;
        }
        abandonFocus();

        int saved = prefs.getInt(KEY_SAVED_VOLUME, -1);
        try {
            audioManager.adjustStreamVolume(STREAM, AudioManager.ADJUST_UNMUTE, 0);
            if (saved > 0) {
                audioManager.setStreamVolume(STREAM, saved, 0);
            }
        } catch (SecurityException ignored) {
        }
        prefs.edit().remove(KEY_END_AT).remove(KEY_SAVED_VOLUME).remove(KEY_PAUSE_APPS).apply();

        stopForeground(STOP_FOREGROUND_REMOVE);
        Notification done = new Notification.Builder(this, CHANNEL_DONE)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle(getString(byUser ? R.string.noti_stopped : R.string.noti_done))
                .setContentText(getString(R.string.noti_restored))
                .setContentIntent(openAppIntent())
                .setAutoCancel(true)
                .build();
        notificationManager.notify(NOTI_DONE, done);
        stopSelf();
    }

    private Notification buildRunningNotification(long remaining) {
        Intent stop = new Intent(this, MuteService.class).setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, 1, stop,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Action stopAction = new Notification.Action.Builder(
                null, getString(R.string.stop_now), stopPi).build();

        return new Notification.Builder(this, CHANNEL_RUNNING)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle(getString(R.string.noti_running))
                .setContentText(getString(R.string.remaining_fmt, formatDuration(remaining)))
                .setContentIntent(openAppIntent())
                .addAction(stopAction)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setCategory(Notification.CATEGORY_SERVICE)
                .build();
    }

    private PendingIntent openAppIntent() {
        Intent open = new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void createChannels() {
        NotificationChannel running = new NotificationChannel(CHANNEL_RUNNING,
                getString(R.string.channel_running), NotificationManager.IMPORTANCE_LOW);
        running.setShowBadge(false);
        NotificationChannel done = new NotificationChannel(CHANNEL_DONE,
                getString(R.string.channel_done), NotificationManager.IMPORTANCE_DEFAULT);
        done.setSound(null, null);
        notificationManager.createNotificationChannel(running);
        notificationManager.createNotificationChannel(done);
    }

    public static String formatDuration(long millis) {
        long total = (millis + 999) / 1000;
        long h = total / 3600, m = (total % 3600) / 60, s = total % 60;
        return h > 0
                ? String.format(java.util.Locale.US, "%d:%02d:%02d", h, m, s)
                : String.format(java.util.Locale.US, "%02d:%02d", m, s);
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (volumeObserver != null) {
            getContentResolver().unregisterContentObserver(volumeObserver);
            volumeObserver = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
