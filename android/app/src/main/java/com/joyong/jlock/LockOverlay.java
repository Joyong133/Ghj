package com.joyong.jlock;

import android.content.Context;
import android.graphics.PixelFormat;
import android.os.Build;
import android.view.ContextThemeWrapper;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.FrameLayout;

/**
 * The study lock as a full-screen overlay window above every app. Unlike an Activity,
 * Home and Recents don't dismiss it — they only change what's underneath — and adding it
 * isn't subject to background-activity-start limits. Needs "display over other apps".
 */
final class LockOverlay implements Bridge.Host {
    private final LockService svc;
    private final WindowManager wm;
    private FrameLayout root;
    private WebView web;
    private Speaker speaker;

    LockOverlay(LockService svc) {
        this.svc = svc;
        this.wm = svc.getSystemService(WindowManager.class);
    }

    boolean isShowing() { return root != null; }

    /** @return false if the window could not be added (e.g. the overlay permission was revoked). */
    boolean show() {
        if (root != null) return true;
        Context c = new ContextThemeWrapper(svc, R.style.AppTheme);
        root = new FrameLayout(c) {
            @Override
            public boolean dispatchKeyEvent(KeyEvent e) {
                if (e.getKeyCode() == KeyEvent.KEYCODE_BACK) {
                    if (e.getAction() == KeyEvent.ACTION_UP && web != null) {
                        WebHost.toast(web, "🔒 학습을 완료해야 나갈 수 있어요");
                    }
                    return true;
                }
                return super.dispatchKeyEvent(e);
            }
        };
        root.setBackgroundColor(0xFF0B1021);
        speaker = new Speaker(svc);
        web = WebHost.create(c, new Bridge(c, null, speaker, this), "lock", true);
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
                PixelFormat.OPAQUE);
        lp.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
        if (Build.VERSION.SDK_INT >= 28) {
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        if (Build.VERSION.SDK_INT >= 30) lp.setFitInsetsTypes(0); // cover the whole screen; page pads itself

        try {
            wm.addView(root, lp);
            return true;
        } catch (Exception e) {
            release();
            return false;
        }
    }

    void hide() {
        if (root == null) return;
        try { wm.removeViewImmediate(root); } catch (Exception ignored) {}
        release();
    }

    private void release() {
        if (web != null) web.destroy();
        if (speaker != null) speaker.shutdown();
        web = null;
        speaker = null;
        root = null;
    }

    @Override public void onUnlocked() { svc.onLockPassed(); }

    @Override public void onEmergencyExit() { svc.onLockAbandoned(); }
}
