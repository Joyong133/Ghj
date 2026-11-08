package com.joyong.jlock;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Builds the WebView that hosts the shared study UI from the APK's assets. */
final class WebHost {
    private WebHost() {}

    @SuppressLint("SetJavaScriptEnabled")
    static WebView create(Activity act, Bridge bridge, String mode, boolean padForSystemBars) {
        WebView wv = new WebView(act);
        wv.setBackgroundColor(0xFF0B1021);
        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowContentAccess(false);
        wv.setWebViewClient(new WebViewClient());
        wv.setWebChromeClient(new WebChromeClient());
        wv.setOverScrollMode(View.OVER_SCROLL_NEVER);
        wv.addJavascriptInterface(bridge, "JLock");

        if (padForSystemBars) {
            // targetSdk 35 draws edge-to-edge; keep the page clear of the status/navigation bars.
            wv.setOnApplyWindowInsetsListener((v, insets) -> {
                int l, t, r, b;
                if (Build.VERSION.SDK_INT >= 30) {
                    android.graphics.Insets i = insets.getInsets(
                            WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                    l = i.left; t = i.top; r = i.right; b = i.bottom;
                } else {
                    l = insets.getSystemWindowInsetLeft(); t = insets.getSystemWindowInsetTop();
                    r = insets.getSystemWindowInsetRight(); b = insets.getSystemWindowInsetBottom();
                }
                v.setPadding(l, t, r, b);
                return insets;
            });
        }

        wv.loadUrl("file:///android_asset/index.html#" + mode);
        return wv;
    }

    /** Lets the page refresh permission/status info when the activity comes back. */
    static void notifyResume(WebView wv) {
        wv.evaluateJavascript("window.onNativeResume && window.onNativeResume()", null);
    }

    static void toast(WebView wv, String msg) {
        String safe = msg.replace("\\", "\\\\").replace("'", "\\'");
        wv.evaluateJavascript("window.nativeToast && window.nativeToast('" + safe + "')", null);
    }
}
