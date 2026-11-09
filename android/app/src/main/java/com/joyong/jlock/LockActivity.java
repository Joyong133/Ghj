package com.joyong.jlock;

import android.app.Activity;
import android.app.KeyguardManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebView;
import android.window.OnBackInvokedDispatcher;

/**
 * Fallback study lock used only when "display over other apps" is not granted (normally the
 * overlay in {@link LockOverlay} is used). Finishes after the quiz is passed or the emergency
 * exit is held. The system lock (PIN/pattern) stays in place either way.
 */
public class LockActivity extends Activity implements Bridge.Host {
    static volatile boolean showing;

    private WebView web;
    private Speaker speaker;
    private boolean done;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        showing = true;
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        speaker = new Speaker(this);
        web = WebHost.create(this, new Bridge(this, this, speaker, this), "lock", false);
        setContentView(web);
        hideSystemBars();

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_OVERLAY, this::blockBack);
        }
    }

    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void blockBack() {
        WebHost.toast(web, "🔒 학습을 완료해야 나갈 수 있어요");
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        blockBack();
    }

    /** Home / app switch while the quiz is unsolved: strict mode brings the lock straight back. */
    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (!done && "strict".equals(Prefs.guard(this)) && !isDeviceLocked()) {
            LockService.relaunchSoon(this);
        }
    }

    private boolean isDeviceLocked() {
        KeyguardManager km = getSystemService(KeyguardManager.class);
        return km != null && km.isKeyguardLocked();
    }

    @Override
    protected void onResume() {
        super.onResume();
        WebHost.notifyResume(web);
    }

    @Override
    public void onUnlocked() {
        done = true;
        LockService.passedExternally(this);
        finishAndRemoveTask();
    }

    @Override
    public void onEmergencyExit() {
        done = true;
        LockService.abandonedExternally(this);
        finishAndRemoveTask();
    }

    @Override
    protected void onDestroy() {
        showing = false;
        speaker.shutdown();
        web.destroy();
        super.onDestroy();
    }
}
