package com.joyong.applock;

import android.accessibilityservice.AccessibilityService;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import android.widget.Toast;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Closes locked apps when they come to the front (phones, and Meta Quest side panels), and finds
 * community apps by name and website links: on start and whenever a new app is installed.
 * During detox time it also closes the Settings screens that would switch this app off or remove it
 * (only Settings / installer screens are read, and only to find this app's own pages).
 */
public class LockService extends AccessibilityService {

    static volatile LockService instance;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private String lastKey;
    private long lastAt, lastWindowsCheck;

    private final BroadcastReceiver installs = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent.getData() == null || intent.getBooleanExtra(Intent.EXTRA_REPLACING, false)) return;
            String pkg = intent.getData().getSchemeSpecificPart();
            if (pkg == null) return;
            if (!checkName(context, pkg, Kinds.label(context, pkg))) checkSites(context, pkg);
        }
    };

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        IntentFilter f = new IntentFilter(Intent.ACTION_PACKAGE_ADDED);
        f.addDataScheme("package");
        try {
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(installs, f, RECEIVER_NOT_EXPORTED);
            else registerReceiver(installs, f);
        } catch (RuntimeException ignored) {
        }
        new Thread(() -> scanNames(this), "NamedApps").start();
        if (Store.isVpnOn(this) && !FinderVpn.running) FinderVpn.start(this);
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        try {
            unregisterReceiver(installs);
        } catch (RuntimeException ignored) {
        }
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override
    public void onInterrupt() {
    }

    /** Looks at every installed app's name and website links. Returns how many were newly locked. Off the main thread. */
    static int scanNames(Context c) {
        int n = 0;
        Set<String> seen = new HashSet<>();
        for (ResolveInfo ri : Kinds.launchable(c)) {
            String p = ri.activityInfo.packageName;
            if (seen.add(p) && checkName(c, p, ri.loadLabel(c.getPackageManager()).toString())) n++;
        }
        n += checkSites(c, null);
        return n;
    }

    /** Apps that open a community's website links get locked. {@code onlyPkg} null = all apps. */
    static int checkSites(Context c, String onlyPkg) {
        int n = 0;
        for (java.util.Map.Entry<String, String> e : Kinds.siteApps(c, onlyPkg).entrySet()) {
            String p = e.getKey();
            if (Store.isLocked(c, p) || !Kinds.mayLock(c, p)) continue;
            if (Store.lock(c, p, e.getValue(), Store.BY_SITE)) {
                announce(c, p, e.getValue(), Store.BY_SITE);
                n++;
            }
        }
        return n;
    }

    /** An app named after a community gets locked. Returns true if newly locked. */
    static boolean checkName(Context c, String pkg, String label) {
        if (Store.isLocked(c, pkg) || !Kinds.mayLock(c, pkg)) return false;
        String community = Kinds.namedCommunity(label, pkg, Store.keywords());
        if (community == null || !Store.lock(c, pkg, community, Store.BY_NAME)) return false;
        announce(c, pkg, community, Store.BY_NAME);
        return true;
    }

    /** Tell the user, and close the app if it's open right now. */
    static void announce(Context c, String pkg, String community, String way) {
        Context app = c.getApplicationContext();
        String label = Kinds.label(app, pkg);
        String why = new Store.Locked(pkg, community, way).reason();
        new Handler(Looper.getMainLooper()).post(() -> {
            Toast.makeText(app, "🔒 ‘" + label + "’ 앱을 잠갔어요 — " + why, Toast.LENGTH_LONG).show();
            LockService s = instance;
            if (s != null) {
                s.lastWindowsCheck = 0;
                s.checkWindows();
            }
        });
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        int type = event.getEventType();
        if (type == AccessibilityEvent.TYPE_WINDOWS_CHANGED) {
            checkWindows();
            return;
        }
        if (event.getPackageName() == null) return;
        String pkg = event.getPackageName().toString();
        if (Store.isDetox(this) && Guard.isSettingsPackage(pkg) && guard(type, pkg)) return;
        if (type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && Store.isLocked(this, pkg)) close(pkg);
    }

    private long lastGuardCheck, lastGuardAt;

    /** Detox time: close this app's uninstall / app-info / accessibility / protection / VPN screens. */
    private boolean guard(int type, String pkg) {
        long now = SystemClock.uptimeMillis();
        if (type == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED && now - lastGuardCheck < 350) return false;
        lastGuardCheck = now;
        AccessibilityNodeInfo root = rootOf(pkg);
        if (root == null) return false;
        String me = getString(R.string.app_name);
        List<AccessibilityNodeInfo> mine = root.findAccessibilityNodeInfosByText(me);
        if (mine == null || mine.isEmpty()) return false;
        // The "turn on uninstall protection" screen opened from this app stays usable for a moment.
        if (Store.adminSetupAllowed(this) && !isAdminActive(this) && hasAny(root, "관리자", "admin", "Admin")) return false;
        boolean installer = pkg.contains("packageinstaller");
        if (!Guard.shouldClose(texts(root), installer, pkg.contains("vpndialogs"), me,
                Guard.snippet(getString(R.string.service_desc)), Guard.snippet(getString(R.string.admin_desc)))) {
            return false;
        }
        if (now - lastGuardAt < 800) return true;
        lastGuardAt = now;
        performGlobalAction(installer || pkg.contains("vpndialogs") ? GLOBAL_ACTION_BACK : GLOBAL_ACTION_HOME);
        handler.postDelayed(() -> {
            try {
                startActivity(new Intent(this, LockedActivity.class)
                        .putExtra(LockedActivity.EXTRA_PROTECT, true)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP));
            } catch (RuntimeException ignored) {
            }
        }, 250);
        return true;
    }

    private AccessibilityNodeInfo rootOf(String pkg) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root != null && root.getPackageName() != null && pkg.equals(root.getPackageName().toString())) return root;
        try {
            for (AccessibilityWindowInfo w : getWindows()) { // Quest: settings may be a side panel
                AccessibilityNodeInfo r = w.getRoot();
                if (r != null && r.getPackageName() != null && pkg.equals(r.getPackageName().toString())) return r;
            }
        } catch (RuntimeException ignored) {
        }
        return null;
    }

    private static boolean hasAny(AccessibilityNodeInfo root, String... words) {
        for (String w : words) {
            List<AccessibilityNodeInfo> found = root.findAccessibilityNodeInfosByText(w);
            if (found != null && !found.isEmpty()) return true;
        }
        return false;
    }

    private static List<String> texts(AccessibilityNodeInfo root) {
        List<String> out = new java.util.ArrayList<>();
        java.util.ArrayDeque<AccessibilityNodeInfo> queue = new java.util.ArrayDeque<>();
        queue.add(root);
        int visited = 0;
        while (!queue.isEmpty() && visited < 800) {
            AccessibilityNodeInfo n = queue.poll();
            visited++;
            if (n.getText() != null && n.getText().length() > 0) out.add(n.getText().toString());
            if (n.getContentDescription() != null && n.getContentDescription().length() > 0) {
                out.add(n.getContentDescription().toString());
            }
            for (int i = 0; i < n.getChildCount(); i++) {
                AccessibilityNodeInfo child = n.getChild(i);
                if (child != null) queue.add(child);
            }
        }
        return out;
    }

    static boolean isAdminActive(Context c) {
        android.app.admin.DevicePolicyManager dpm =
                (android.app.admin.DevicePolicyManager) c.getSystemService(DEVICE_POLICY_SERVICE);
        return dpm != null && dpm.isAdminActive(new android.content.ComponentName(c, AdminReceiver.class));
    }

    /** Every app window on screen (Quest shows several side by side). */
    private void checkWindows() {
        long now = SystemClock.uptimeMillis();
        if (now - lastWindowsCheck < 300) return;
        lastWindowsCheck = now;
        List<AccessibilityWindowInfo> windows;
        try {
            windows = getWindows();
        } catch (RuntimeException e) {
            return;
        }
        for (AccessibilityWindowInfo w : windows) {
            if (w.getType() != AccessibilityWindowInfo.TYPE_APPLICATION) continue;
            AccessibilityNodeInfo root = w.getRoot();
            if (root == null || root.getPackageName() == null) continue;
            String p = root.getPackageName().toString();
            if (Store.isLocked(this, p)) {
                close(p);
                return;
            }
        }
    }

    private void close(String pkg) {
        long now = SystemClock.uptimeMillis();
        if (pkg.equals(lastKey) && now - lastAt < 1500) return;
        lastKey = pkg;
        lastAt = now;
        performGlobalAction(GLOBAL_ACTION_HOME);
        Store.countBlock(this);
        handler.postDelayed(() -> {
            try {
                startActivity(new Intent(this, LockedActivity.class)
                        .putExtra(LockedActivity.EXTRA_PKG, pkg)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP));
            } catch (RuntimeException ignored) {
            }
        }, 250);
    }
}
