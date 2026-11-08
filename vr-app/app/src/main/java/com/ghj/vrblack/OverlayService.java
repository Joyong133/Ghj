package com.ghj.vrblack;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.service.quicksettings.TileService;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;

/**
 * 다른 앱 위에 화면 전체를 덮는 검은 창을 띄웁니다.
 * 창은 화면만 가릴 뿐 소리는 건드리지 않고, 아래에 있는 유튜브 같은 앱은 화면에 보이는
 * 상태로 남아 있어서 재생이 계속됩니다. 화면이 저절로 꺼지지 않도록 켜진 상태를 유지합니다.
 */
public class OverlayService extends Service {

    public static final String ACTION_START = "com.ghj.vrblack.START";
    public static final String ACTION_STOP = "com.ghj.vrblack.STOP";
    public static final String EXTRA_DELAY_MS = "delay_ms";

    private static final String CHANNEL_ID = "overlay";
    private static final int NOTIFICATION_ID = 1;

    /** 서비스가 켜져 있는지(검은 화면이 켜져 있거나 켜지기를 기다리는 중). 타일 표시에 씁니다. */
    static volatile boolean running;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable showRunnable = this::showOverlay;
    private WindowManager windowManager;
    private View overlay;

    public static void start(Context context, long delayMs) {
        Intent intent = new Intent(context, OverlayService.class)
                .setAction(ACTION_START)
                .putExtra(EXTRA_DELAY_MS, delayMs);
        context.startForegroundService(intent);
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, OverlayService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        long delay = intent != null ? intent.getLongExtra(EXTRA_DELAY_MS, 0) : 0;
        startInForeground(delay > 0 && overlay == null);
        running = true;
        refreshTile();

        handler.removeCallbacks(showRunnable);
        if (delay > 0 && overlay == null) {
            handler.postDelayed(showRunnable, delay);
        } else {
            showOverlay();
        }
        return START_NOT_STICKY;
    }

    private void showOverlay() {
        if (overlay != null) {
            return;
        }
        if (!Settings.canDrawOverlays(this)) {
            stopSelf();
            return;
        }
        // 기다리던 상태에서 켜진 상태로 알림 문구를 바꿉니다.
        startInForeground(false);

        windowManager = getSystemService(WindowManager.class);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        TextView hint = new TextView(this);
        hint.setText(R.string.overlay_hint);
        hint.setTextColor(0xFF6E6E78);
        hint.setTextSize(16);
        root.addView(hint, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER));
        hint.animate().alpha(0f).setStartDelay(2500).setDuration(800).start();

        GestureDetector detector = new GestureDetector(this,
                new GestureDetector.SimpleOnGestureListener() {
                    @Override
                    public boolean onDown(MotionEvent e) {
                        return true;
                    }

                    @Override
                    public boolean onDoubleTap(MotionEvent e) {
                        stopSelf();
                        return true;
                    }
                });
        // 터치는 모두 여기서 받아서, 검은 화면 아래 유튜브가 실수로 눌리지 않게 합니다.
        root.setOnTouchListener((v, event) -> {
            detector.onTouchEvent(event);
            return true;
        });

        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                        | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                        | WindowManager.LayoutParams.FLAG_FULLSCREEN,
                PixelFormat.OPAQUE);
        lp.gravity = Gravity.TOP | Gravity.START;
        // 화면 밝기를 최저로 내려 배터리를 아낍니다. 창이 사라지면 원래 밝기로 돌아갑니다.
        lp.screenBrightness = 0f;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        try {
            windowManager.addView(root, lp);
            overlay = root;
        } catch (RuntimeException e) {
            stopSelf();
        }
    }

    private void hideOverlay() {
        if (overlay != null && windowManager != null) {
            try {
                windowManager.removeView(overlay);
            } catch (RuntimeException ignored) {
                // 이미 사라진 창
            }
        }
        overlay = null;
    }

    private void startInForeground(boolean waiting) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, getString(R.string.channel_name),
                    NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            nm.createNotificationChannel(channel);
        }

        PendingIntent stopIntent = PendingIntent.getService(this, 0,
                new Intent(this, OverlayService.class).setAction(ACTION_STOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification notification = new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_tile)
                .setContentTitle(getString(waiting ? R.string.notif_waiting : R.string.notif_on))
                .setContentText(getString(R.string.notif_text))
                .setContentIntent(stopIntent)
                .addAction(new Notification.Action.Builder(
                        null, getString(R.string.notif_stop), stopIntent).build())
                .setOngoing(true)
                .setShowWhen(false)
                .build();

        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void refreshTile() {
        try {
            TileService.requestListeningState(this,
                    new ComponentName(this, BlackTileService.class));
        } catch (RuntimeException ignored) {
            // 타일을 추가하지 않은 경우 등
        }
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(showRunnable);
        hideOverlay();
        running = false;
        refreshTile();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
