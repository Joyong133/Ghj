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
            "com.android.browser", "org.chromium.chrome", "com.google.android.googlequicksearchbox",
            "com.oculus.browser"));

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
    private long lastGuardCheck;
    private String myLabel;
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
        keepVpnAlive();
        android.content.IntentFilter f = new android.content.IntentFilter(Intent.ACTION_PACKAGE_ADDED);
        f.addDataScheme("package");
        try {
            if (android.os.Build.VERSION.SDK_INT >= 33) registerReceiver(packageAdded, f, RECEIVER_NOT_EXPORTED);
            else registerReceiver(packageAdded, f);
        } catch (RuntimeException ignored) {
        }
    }

    private long lastVpnCheck;

    /** Restarts network blocking if it should be on but isn't (e.g. switched off during a focus lock). */
    private void keepVpnAlive() {
        long now = SystemClock.uptimeMillis();
        if (now - lastVpnCheck < 15_000) return;
        lastVpnCheck = now;
        if (Prefs.isVpnOn(this) && !DetoxVpnService.running) DetoxVpnService.start(this);
    }

    @Override
    public void onDestroy() {
        try {
            unregisterReceiver(packageAdded);
        } catch (RuntimeException ignored) {
        }
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
        keepVpnAlive();

        // 0) During a focus lock, don't let the app be uninstalled, force-stopped or switched off.
        if (Prefs.isLocked(this) && isSystemGuardPackage(pkg) && guardSelf(event, pkg)) return;

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

        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && event.getClassName() != null) {
            lastClassByPkg.put(pkg, event.getClassName().toString());
        }

        // 1a) App stores: a community app's install page is closed.
        if (STORES.contains(pkg)) {
            if (!r.storeKeywords.isEmpty()) checkStoreInstall(event, pkg, r);
            return;
        }

        // 1b) A blocked screen inside an allowed app (Toss: only the securities part).
        if (AppScreens.TOSS.equals(pkg) && Prefs.isTossInvestBlocked(this)) {
            checkTossInvest(event);
            return;
        }

        // 2) An in-app browser (KakaoTalk link, etc.) showing a blocked site.
        if (!isBrowser(pkg) && isInAppBrowserHost(pkg)) {
            checkInAppBrowser(event, pkg, r);
            return;
        }

        // 3a) "Block the browser entirely" (VR): the browser itself can't be opened.
        if (Prefs.isBrowserBlockAll(this) && isBrowser(pkg)) {
            if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || isFrontApp(pkg)) {
                block("browser:" + pkg, "브라우저", false);
            }
            return;
        }

        // 3) A browser showing a blocked site.
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
            return;
        }
        if (!lastSawAddress) {
            // No readable address bar: use the tab titles / page titles the browser shows outside the page.
            String name = scanBrowserTexts(root, r);
            if (name != null) block("web:" + pkg + ":" + name, name, true);
        }
    }

    /** True if the last check found an address bar or an editable address field. */
    private boolean lastSawAddress;

    /**
     * Looks at the browser's own texts (tab titles, title bar), not inside the web page,
     * for a blocked address or a community's page-title keyword. Returns the community name.
     */
    private static String scanBrowserTexts(AccessibilityNodeInfo root, Prefs.Rules r) {
        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        int visited = 0;
        while (!queue.isEmpty() && visited < 600) {
            AccessibilityNodeInfo n = queue.poll();
            visited++;
            CharSequence cls = n.getClassName();
            if (cls != null && cls.toString().contains("WebView")) continue; // skip the page itself
            for (CharSequence t : new CharSequence[]{n.getText(), n.getContentDescription()}) {
                if (t == null || t.length() == 0) continue;
                String d = r.matchUrlText(t);
                if (d != null) return r.domains.get(d) != null ? r.domains.get(d) : d;
                String title = r.matchTitle(t);
                if (title != null) return title;
            }
            for (int i = 0; i < n.getChildCount(); i++) {
                AccessibilityNodeInfo child = n.getChild(i);
                if (child != null) queue.add(child);
            }
        }
        return null;
    }

    // ------------------------------------------------------------------ community app installs

    /** Play Store, Galaxy Store, ONE store. */
    static final Set<String> STORES = new HashSet<>(Arrays.asList(
            "com.android.vending", "com.sec.android.app.samsungapps", "com.skt.skaf.A000Z00040"));

    private long lastStoreCheck;

    /** Closes a store page that offers to install a blocked community app. */
    private void checkStoreInstall(AccessibilityEvent event, String pkg, Prefs.Rules r) {
        long now = SystemClock.uptimeMillis();
        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED && now - lastStoreCheck < CHECK_INTERVAL_MS) {
            return;
        }
        lastStoreCheck = now;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || root.getPackageName() == null || !pkg.equals(root.getPackageName().toString())) return;
        String name = StoreSearch.matchAppPage(screenTexts(root, 0.45f), r.storeKeywords);
        if (name != null) block("install:" + name, name, true); // BACK leaves the app's page
    }

    /** Fresh installs from anywhere (APK files, other stores): ask to remove a blocked community app. */
    private final android.content.BroadcastReceiver packageAdded = new android.content.BroadcastReceiver() {
        @Override
        public void onReceive(android.content.Context context, Intent intent) {
            if (intent.getData() == null || intent.getBooleanExtra(Intent.EXTRA_REPLACING, false)) return;
            String added = intent.getData().getSchemeSpecificPart();
            Prefs.Rules r = rules;
            if (added == null || !Prefs.isInstallBlockOn(context) || !Prefs.isBlockingActive(context)
                    || !r.packages.containsKey(added)) {
                return;
            }
            String name = r.packages.get(added);
            Prefs.recordBlock(context);
            android.widget.Toast.makeText(context, Ui.topic(name != null ? name : appLabel(added))
                    + " 설치할 수 없어요. 삭제 화면을 열게요 🌿", android.widget.Toast.LENGTH_LONG).show();
            try {
                startActivity(new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + added))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (RuntimeException ignored) {
            }
        }
    };

    // ------------------------------------------------------------------ screens inside apps

    private long lastScreenCheck;

    private void checkTossInvest(AccessibilityEvent event) {
        long now = SystemClock.uptimeMillis();
        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
                && now - lastScreenCheck < CHECK_INTERVAL_MS) {
            return;
        }
        lastScreenCheck = now;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || root.getPackageName() == null || !AppScreens.TOSS.equals(root.getPackageName().toString())) {
            return;
        }
        if (AppScreens.isTossInvest(screenTexts(root))) {
            block("screen:toss-invest", "토스증권", true); // BACK leaves the securities screen, Toss stays open
        }
    }

    /** Every text on screen with whether it is selected and whether it sits in the title or tab bar. */
    private List<AppScreens.ScreenText> screenTexts(AccessibilityNodeInfo root) {
        return screenTexts(root, 0.18f);
    }

    private List<AppScreens.ScreenText> screenTexts(AccessibilityNodeInfo root, float topFraction) {
        int h = getResources().getDisplayMetrics().heightPixels;
        int topLimit = (int) (h * topFraction), bottomLimit = (int) (h * 0.85f);
        List<AppScreens.ScreenText> out = new java.util.ArrayList<>();
        android.graphics.Rect b = new android.graphics.Rect();
        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        ArrayDeque<Boolean> selectedParent = new ArrayDeque<>();
        queue.add(root);
        selectedParent.add(false);
        int visited = 0;
        while (!queue.isEmpty() && visited < 800) {
            AccessibilityNodeInfo n = queue.poll();
            boolean selected = selectedParent.poll() || n.isSelected() || n.isChecked();
            visited++;
            n.getBoundsInScreen(b);
            for (CharSequence t : new CharSequence[]{n.getText(), n.getContentDescription()}) {
                if (t != null && t.length() > 0) {
                    out.add(new AppScreens.ScreenText(t.toString(), selected, b.top < topLimit, b.top >= bottomLimit));
                }
            }
            for (int i = 0; i < n.getChildCount(); i++) {
                AccessibilityNodeInfo child = n.getChild(i);
                if (child != null) {
                    queue.add(child);
                    selectedParent.add(selected);
                }
            }
        }
        return out;
    }

    // ------------------------------------------------------------------ in-app browsers

    static final String KAKAOTALK = "com.kakao.talk";

    /** Apps that open links in their own built-in browser. */
    private static final Set<String> IN_APP_HOSTS = new HashSet<>(Arrays.asList(
            KAKAOTALK, "com.kakao.story", "jp.naver.line.android", "org.telegram.messenger",
            "com.facebook.orca", "com.nhn.android.band", "com.nhn.android.navercafe", "net.daum.android.cafe",
            "com.nhn.android.blog", "com.discord", "com.everytime.v2", "com.teamblind.blind",
            "com.google.android.gm", "com.samsung.android.messaging", "com.google.android.apps.messaging"));

    private final java.util.Map<String, String> lastClassByPkg = new java.util.HashMap<>();
    private long lastInAppCheck;

    private boolean isInAppBrowserHost(String pkg) {
        return IN_APP_HOSTS.contains(pkg) || classLooksLikeBrowser(pkg);
    }

    private boolean classLooksLikeBrowser(String pkg) {
        String cls = lastClassByPkg.get(pkg);
        if (cls == null) return false;
        cls = cls.toLowerCase(Locale.ROOT);
        return cls.contains("browser") || cls.contains("webview") || cls.contains("webactivity");
    }

    private void checkInAppBrowser(AccessibilityEvent event, String pkg, Prefs.Rules r) {
        boolean blockAllHere = r.inAppBlockAll && KAKAOTALK.equals(pkg);
        if (r.domains.isEmpty() && r.titleKeywords.isEmpty() && !blockAllHere) return;
        long now = SystemClock.uptimeMillis();
        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
                && now - lastInAppCheck < CHECK_INTERVAL_MS) {
            return;
        }
        lastInAppCheck = now;

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || root.getPackageName() == null || !pkg.equals(root.getPackageName().toString())) {
            return;
        }

        // Walk the screen, but not into web page content: only the app's own header
        // (title / address shown above the page) is checked, so a chat message or page text
        // that merely mentions a community does not trigger a block.
        int headerBottom = (int) (getResources().getDisplayMetrics().heightPixels * 0.22f);
        boolean hasWebView = false;
        boolean headerHasAddress = false;
        String hit = null;
        android.graphics.Rect bounds = new android.graphics.Rect();
        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        int visited = 0;
        while (!queue.isEmpty() && visited < 600) {
            AccessibilityNodeInfo n = queue.poll();
            visited++;
            CharSequence cls = n.getClassName();
            if (cls != null && cls.toString().contains("WebView")) {
                hasWebView = true;
                continue; // don't look inside the page
            }
            n.getBoundsInScreen(bounds);
            if (bounds.top < headerBottom && bounds.bottom > 0) {
                for (CharSequence t : new CharSequence[]{n.getText(), n.getContentDescription()}) {
                    if (t == null || t.length() == 0) continue;
                    String d = r.matchUrlText(t);
                    if (d != null && hit == null) hit = r.domains.get(d) != null ? r.domains.get(d) : d;
                    String title = r.matchTitle(t);
                    if (title != null && hit == null) hit = title;
                    if (!headerHasAddress) {
                        for (String token : t.toString().split("\\s+")) {
                            if (looksLikeDomain(Prefs.hostOf(token))) {
                                headerHasAddress = true;
                                break;
                            }
                        }
                    }
                }
            }
            for (int i = 0; i < n.getChildCount(); i++) {
                AccessibilityNodeInfo child = n.getChild(i);
                if (child != null) queue.add(child);
            }
        }

        boolean browserScreen = hasWebView || classLooksLikeBrowser(pkg);
        if (!browserScreen) return;

        if (hit != null) {
            block("inapp:" + pkg + ":" + hit, hit, true);
        } else if (blockAllHere && (classLooksLikeBrowser(pkg) || (hasWebView && headerHasAddress))) {
            block("inapp:" + pkg, "카카오톡 인앱 브라우저", true);
        }
    }

    /** "gall.dcinside.com" yes; "3.5" or "v1.2" no. */
    static boolean looksLikeDomain(String host) {
        if (host == null) return false;
        String tld = host.substring(host.lastIndexOf('.') + 1);
        if (tld.length() < 2) return false;
        for (int i = 0; i < tld.length(); i++) {
            if (!Character.isLetter(tld.charAt(i))) return false;
        }
        return true;
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
        lastSawAddress = sawUrlBar;
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
                lastSawAddress = true;
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

    /** Settings screens and the package installer, where the app could be removed or turned off. */
    private static boolean isSystemGuardPackage(String pkg) {
        return pkg.equals("com.android.settings")
                || pkg.contains("settings")             // e.g. com.samsung.android.settings, settings search
                || pkg.contains("packageinstaller")     // uninstall confirmation dialogs
                || pkg.equals("com.samsung.accessibility")
                || pkg.contains("securitycenter")       // Xiaomi app management
                || pkg.contains("safecenter");          // OPPO / OnePlus app management
    }

    private static final String[] UNINSTALL_WORDS = {"삭제", "제거", "uninstall", "Uninstall", "UNINSTALL"};
    /** The force-stop button only appears on an app-info page (every app-info page has it). */
    private static final String[] APP_INFO_WORDS = {"강제 중지", "강제 종료", "강제종료", "Force stop", "FORCE STOP"};
    /** Buttons on our VPN's page in Settings (network blocking). */
    private static final String[] VPN_WORDS = {"연결 해제", "연결 끊기", "VPN 삭제", "VPN 해제", "Disconnect", "Forget VPN", "DISCONNECT"};
    /** Words next to our service name on its own on/off switch or "stop service?" dialog. */
    private static final String[] TOGGLE_WORDS = {"사용", "중지", "끄", "Use ", "Stop", "Turn off"};

    /**
     * Decides whether a settings / installer screen is one that could switch this app off or remove it.
     * Only these are blocked during a focus lock:
     *  - this app's uninstall dialog,
     *  - this app's app-info page (force stop / uninstall / clear data),
     *  - this app's accessibility page or "stop service?" dialog,
     *  - the page that turns off this app's uninstall protection (device admin).
     * Lists that merely show this app among others (e.g. the accessibility list with other apps'
     * services) stay usable.
     */
    static boolean shouldGuard(List<String> texts, boolean installer, String appLabel, String serviceLabel,
                               String serviceDesc, String adminDesc) {
        boolean mentionsUs = false;
        for (String t : texts) {
            if (t.contains(appLabel)) {
                mentionsUs = true;
                break;
            }
        }
        if (!mentionsUs) return false;

        if (installer) {
            // Uninstall dialog (install / update dialogs are allowed so the app can be updated).
            return anyOtherTextContains(texts, appLabel, UNINSTALL_WORDS);
        }
        for (String t : texts) {
            // Our accessibility detail page / device-admin page show our own description.
            if (!serviceDesc.isEmpty() && t.contains(serviceDesc)) return true;
            if (!adminDesc.isEmpty() && t.contains(adminDesc)) return true;
            // "Digital Detox 차단 사용" switch, "Digital Detox 차단을(를) 중지할까요?" dialog.
            if (t.contains(serviceLabel) && !t.trim().equals(serviceLabel)) {
                for (String w : TOGGLE_WORDS) {
                    if (t.contains(w)) return true;
                }
            }
        }
        // App-info page of this app, or this app's VPN page (disconnect / forget).
        return anyOtherTextContains(texts, appLabel, APP_INFO_WORDS) || anyOtherTextContains(texts, appLabel, VPN_WORDS);
    }

    /** True if a text that is not our own name contains one of the words. */
    private static boolean anyOtherTextContains(List<String> texts, String appLabel, String[] words) {
        for (String t : texts) {
            if (t.contains(appLabel)) continue;
            for (String w : words) {
                if (t.contains(w)) return true;
            }
        }
        return false;
    }

    private boolean guardSelf(AccessibilityEvent event, String pkg) {
        long now = SystemClock.uptimeMillis();
        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
                && now - lastGuardCheck < CHECK_INTERVAL_MS) {
            return false;
        }
        lastGuardCheck = now;

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || root.getPackageName() == null || !pkg.equals(root.getPackageName().toString())) {
            return false;
        }
        List<AccessibilityNodeInfo> mine = root.findAccessibilityNodeInfosByText(myLabel());
        if (mine == null || mine.isEmpty()) return false;

        // The "activate device admin" screen opened from our own app is allowed for a short while,
        // so protection can be turned on during a lock (only while it's not active yet).
        if (Prefs.adminSetupAllowed(this) && !isAdminActive() && containsAny(root, ADMIN_WORDS)) return false;

        boolean installer = pkg.contains("packageinstaller");
        if (!shouldGuard(collectTexts(root), installer, myLabel(), stringRes("service_label"),
                snippet(stringRes("accessibility_desc")), snippet(stringRes("admin_desc")))) {
            return false;
        }

        long guardNow = SystemClock.uptimeMillis();
        if ("guard".equals(lastBlockedKey) && guardNow - lastBlockedAt < 800) return true;
        lastBlockedKey = "guard";
        lastBlockedAt = guardNow;

        // Uninstall dialog: BACK cancels it. Settings page: go home (BACK may land on another page about us).
        performGlobalAction(installer ? GLOBAL_ACTION_BACK : GLOBAL_ACTION_HOME);
        handler.postDelayed(() -> {
            try {
                startActivity(new Intent(this, BlockedActivity.class)
                        .putExtra(BlockedActivity.EXTRA_REASON, BlockedActivity.REASON_PROTECT)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP));
            } catch (RuntimeException ignored) {
            }
        }, 250);
        return true;
    }

    private static List<String> collectTexts(AccessibilityNodeInfo root) {
        List<String> out = new java.util.ArrayList<>();
        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
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

    private String stringRes(String name) {
        int id = getResources().getIdentifier(name, "string", getPackageName());
        return id == 0 ? "" : getString(id);
    }

    /** The first words of a long description: enough to recognise it even if Settings shortens it. */
    private static String snippet(String s) {
        return s.length() > 18 ? s.substring(0, 18) : s;
    }

    private static boolean containsAny(AccessibilityNodeInfo root, String[] words) {
        for (String w : words) {
            List<AccessibilityNodeInfo> found = root.findAccessibilityNodeInfosByText(w);
            if (found != null && !found.isEmpty()) return true;
        }
        return false;
    }

    private static final String[] ADMIN_WORDS = {"관리자", "admin", "Admin"};

    private boolean isAdminActive() {
        android.app.admin.DevicePolicyManager dpm =
                (android.app.admin.DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);
        return dpm != null && dpm.isAdminActive(new android.content.ComponentName(this, DetoxAdminReceiver.class));
    }

    private String myLabel() {
        String brand = stringRes("brand");
        if (!brand.isEmpty()) return brand;
        if (myLabel == null) myLabel = getApplicationInfo().loadLabel(getPackageManager()).toString();
        return myLabel;
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
