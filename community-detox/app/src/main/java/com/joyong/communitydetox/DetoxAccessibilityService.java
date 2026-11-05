package com.joyong.communitydetox;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Watches which app is in front. If it is a blocked community app, or a browser whose
 * address bar shows a blocked site, it leaves that screen and shows {@link BlockedActivity}.
 * Nothing is stored or sent anywhere: only the package name and the address-bar text are read.
 */
public class DetoxAccessibilityService extends AccessibilityService {

    /** Browsers we know about even if they are not the default "open link" handler. */
    private static final Set<String> KNOWN_BROWSERS = new HashSet<>(Arrays.asList(
            "com.android.chrome", "com.chrome.beta", "com.chrome.dev", "com.chrome.canary",
            "com.sec.android.app.sbrowser", "com.sec.android.app.sbrowser.beta",
            "com.naver.whale", "com.nhn.android.search", "net.daum.android.daum",
            "com.microsoft.emmx", "org.mozilla.firefox", "org.mozilla.firefox_beta", "org.mozilla.focus",
            "com.opera.browser", "com.opera.mini.native", "com.opera.gx",
            "com.brave.browser", "com.duckduckgo.mobile.android", "com.vivaldi.browser",
            "com.kiwibrowser.browser", "com.UCMobile.intl", "com.mi.globalbrowser",
            "com.android.browser", "org.chromium.chrome", "com.google.android.googlequicksearchbox"));

    /** Address-bar view ids used by popular browsers (without the "package:id/" prefix). */
    private static final String[] URL_BAR_IDS = {
            "url_bar", "location_bar_edit_text", "url_field", "url_edittext", "url",
            "mozac_browser_toolbar_url_view", "omnibarTextInput", "address_bar_edit_text",
            "search_box", "addressbar_url", "et_search_title"};

    private static final long CHECK_INTERVAL_MS = 350;
    private static final long REBLOCK_GUARD_MS = 1500;
    private static final long BROWSER_REFRESH_MS = 10 * 60 * 1000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Set<String> browsers = new HashSet<>();
    private volatile Prefs.Rules rules = new Prefs.Rules();
    private long browsersLoadedAt;
    private long lastBrowserCheck;
    private String lastBlockedKey;
    private long lastBlockedAt;

    private final SharedPreferences.OnSharedPreferenceChangeListener prefsListener =
            (sp, key) -> rules = Prefs.rules(DetoxAccessibilityService.this);

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        rules = Prefs.rules(this);
        Prefs.sp(this).registerOnSharedPreferenceChangeListener(prefsListener);
        loadBrowsers();
    }

    @Override
    public void onDestroy() {
        Prefs.sp(this).unregisterOnSharedPreferenceChangeListener(prefsListener);
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        String pkg = event.getPackageName().toString();
        if (pkg.equals(getPackageName()) || pkg.equals("com.android.systemui")) return;
        if (!Prefs.isBlockingActive(this)) return;

        Prefs.Rules r = rules;

        // 1) A blocked app came to the front.
        if (r.packages.containsKey(pkg)) {
            if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || isFrontApp(pkg)) {
                String name = r.packages.get(pkg);
                block("app:" + pkg, name != null ? name : appLabel(pkg), false);
            }
            return;
        }

        // 2) A browser showing a blocked site.
        if (r.domains.isEmpty() || !isBrowser(pkg)) return;
        long now = SystemClock.uptimeMillis();
        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
                && now - lastBrowserCheck < CHECK_INTERVAL_MS) {
            return;
        }
        lastBrowserCheck = now;

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || root.getPackageName() == null || !pkg.equals(root.getPackageName().toString())) {
            return;
        }
        String hit = findBlockedDomain(root, pkg, r);
        if (hit != null) {
            String name = r.domains.get(hit);
            block("web:" + pkg + ":" + hit, name != null ? name : hit, true);
        }
    }

    private boolean isFrontApp(String pkg) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        return root != null && root.getPackageName() != null && pkg.equals(root.getPackageName().toString());
    }

    private String findBlockedDomain(AccessibilityNodeInfo root, String pkg, Prefs.Rules r) {
        // Fast path: the browser's own address bar.
        boolean sawUrlBar = false;
        for (String id : URL_BAR_IDS) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId(pkg + ":id/" + id);
            if (nodes == null) continue;
            for (AccessibilityNodeInfo n : nodes) {
                sawUrlBar = true;
                String hit = r.matchUrlText(n.getText());
                if (hit != null) return hit;
            }
        }
        if (sawUrlBar) return null;

        // Fallback for browsers with unknown ids: look at editable / url-like fields only,
        // so that a page merely mentioning a site name is not blocked.
        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        int visited = 0;
        while (!queue.isEmpty() && visited < 400) {
            AccessibilityNodeInfo n = queue.poll();
            visited++;
            if (looksLikeAddressField(n)) {
                String hit = r.matchUrlText(n.getText());
                if (hit != null) return hit;
            }
            for (int i = 0; i < n.getChildCount(); i++) {
                AccessibilityNodeInfo child = n.getChild(i);
                if (child != null) queue.add(child);
            }
        }
        return null;
    }

    private static boolean looksLikeAddressField(AccessibilityNodeInfo n) {
        if (n.getText() == null) return false;
        if (n.isEditable()) return true;
        CharSequence cls = n.getClassName();
        if (cls != null && cls.toString().endsWith("EditText")) return true;
        String id = n.getViewIdResourceName();
        if (id == null) return false;
        id = id.toLowerCase(Locale.ROOT);
        return id.contains("url") || id.contains("address") || id.contains("omnibar") || id.contains("location_bar");
    }

    private void block(String key, String label, boolean browser) {
        long now = SystemClock.uptimeMillis();
        if (key.equals(lastBlockedKey) && now - lastBlockedAt < REBLOCK_GUARD_MS) return;
        lastBlockedKey = key;
        lastBlockedAt = now;

        // Browser: go back off the blocked page. App: leave it for the home screen.
        performGlobalAction(browser ? GLOBAL_ACTION_BACK : GLOBAL_ACTION_HOME);
        Prefs.recordBlock(this);

        handler.postDelayed(() -> {
            Intent i = new Intent(this, BlockedActivity.class)
                    .putExtra(BlockedActivity.EXTRA_LABEL, label)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            try {
                startActivity(i);
            } catch (RuntimeException ignored) {
                // Some ROMs refuse background starts; the global action above already did the job.
            }
        }, 250);
    }

    private boolean isBrowser(String pkg) {
        if (SystemClock.uptimeMillis() - browsersLoadedAt > BROWSER_REFRESH_MS) loadBrowsers();
        return browsers.contains(pkg);
    }

    private void loadBrowsers() {
        browsersLoadedAt = SystemClock.uptimeMillis();
        Set<String> found = new HashSet<>(KNOWN_BROWSERS);
        try {
            Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com"))
                    .addCategory(Intent.CATEGORY_BROWSABLE);
            List<ResolveInfo> list = getPackageManager().queryIntentActivities(view, PackageManager.MATCH_ALL);
            for (ResolveInfo ri : list) {
                if (ri.activityInfo != null) found.add(ri.activityInfo.packageName);
            }
        } catch (RuntimeException ignored) {
        }
        found.remove(getPackageName());
        browsers.clear();
        browsers.addAll(found);
    }

    private String appLabel(String pkg) {
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
            return pm.getApplicationLabel(ai).toString();
        } catch (PackageManager.NameNotFoundException e) {
            return pkg;
        }
    }
}
