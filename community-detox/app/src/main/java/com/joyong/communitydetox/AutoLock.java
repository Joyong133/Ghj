package com.joyong.communitydetox;

import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

/** Tells the user an app was locked automatically, and closes it right away if it's open. */
final class AutoLock {

    static void announce(Context c, String pkg, String community, boolean byName) {
        Context app = c.getApplicationContext();
        String label = label(app, pkg);
        new Handler(Looper.getMainLooper()).post(() -> {
            Toast.makeText(app, byName
                    ? "🔒 ‘" + label + "’ 앱은 이름에 " + community + "이(가) 들어 있어 잠갔어요"
                    : "🔒 ‘" + label + "’ 앱이 " + community + "에 접속하려 해서 잠갔어요", Toast.LENGTH_LONG).show();
            DetoxAccessibilityService s = DetoxAccessibilityService.instance;
            if (s != null) s.lockNow(pkg);
        });
    }

    static String label(Context c, String pkg) {
        try {
            PackageManager pm = c.getPackageManager();
            return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (PackageManager.NameNotFoundException e) {
            return pkg;
        }
    }

    private AutoLock() {
    }
}
