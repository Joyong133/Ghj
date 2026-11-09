package com.joyong.jlock;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;

/** Home screen: stats, settings, permission setup, and turning the lock service on/off. */
public class MainActivity extends Activity implements Bridge.Host {
    private WebView web;
    private Speaker speaker;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        speaker = new Speaker(this);
        web = WebHost.create(this, new Bridge(this, this, speaker, this), "home", true);
        setContentView(web);
        if (Prefs.isEnabled(this)) LockService.start(this);
    }

    @Override
    protected void onResume() {
        super.onResume();
        WebHost.notifyResume(web);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        WebHost.notifyResume(web);
    }

    // Unlock/emergency are lock-screen events; on the home screen there is nothing to dismiss.
    @Override public void onUnlocked() {}
    @Override public void onEmergencyExit() {}

    @Override
    protected void onDestroy() {
        speaker.shutdown();
        web.destroy();
        super.onDestroy();
    }
}
