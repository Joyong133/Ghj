package com.joyong.communitydetox;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Which apps are which: browsers, messengers, system apps — and whether an unknown app counts as a
 * "community app" that should be locked (it reaches a blocked community, or is named after one).
 */
final class AppKinds {

    /** Browsers we know about even if they are not the default "open link" handler. */
    static final Set<String> KNOWN_BROWSERS = new HashSet<>(Arrays.asList(
            "com.android.chrome", "com.chrome.beta", "com.chrome.dev", "com.chrome.canary",
            "com.sec.android.app.sbrowser", "com.sec.android.app.sbrowser.beta",
            "com.naver.whale", "com.nhn.android.search", "net.daum.android.daum",
            "com.microsoft.emmx", "org.mozilla.firefox", "org.mozilla.firefox_beta", "org.mozilla.focus",
            "com.opera.browser", "com.opera.mini.native", "com.opera.gx",
            "com.brave.browser", "com.duckduckgo.mobile.android", "com.vivaldi.browser",
            "com.kiwibrowser.browser", "com.UCMobile.intl", "com.mi.globalbrowser",
            "com.android.browser", "org.chromium.chrome", "com.google.android.googlequicksearchbox",
            "com.oculus.browser"));

    /**
     * Apps that open other people's links or make link previews (messengers, mail, portals): they may
     * touch a community address without being a community app, so they're never auto-locked.
     * (Their in-app browsers are checked separately.)
     */
    static final Set<String> NEVER_AUTO = new HashSet<>(Arrays.asList(
            "com.kakao.talk", "com.kakao.story", "jp.naver.line.android", "org.telegram.messenger",
            "org.thunderdog.challegram", "com.whatsapp", "com.facebook.orca", "com.nhn.android.band",
            "com.google.android.gm", "com.samsung.android.messaging", "com.google.android.apps.messaging",
            "com.Slack", "com.microsoft.teams", "com.nhn.android.mail", "net.daum.android.mail",
            "com.google.android.apps.docs", "com.google.android.keep", "com.samsung.android.app.notes",
            "com.google.android.youtube", "com.instagram.android"));

    private static Set<String> browsers;
    private static long browsersAt;

    static synchronized boolean isBrowser(Context c, String pkg) {
        if (KNOWN_BROWSERS.contains(pkg)) return true;
        long now = System.currentTimeMillis();
        if (browsers == null || now - browsersAt > 10 * 60 * 1000) {
            Set<String> found = new HashSet<>();
            try {
                Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com"))
                        .addCategory(Intent.CATEGORY_BROWSABLE);
                for (ResolveInfo ri : c.getPackageManager().queryIntentActivities(view, PackageManager.MATCH_ALL)) {
                    if (ri.activityInfo != null) found.add(ri.activityInfo.packageName);
                }
            } catch (RuntimeException ignored) {
            }
            found.remove(c.getPackageName());
            browsers = found;
            browsersAt = now;
        }
        return browsers.contains(pkg);
    }

    /** Preinstalled system apps (not ones the user installed or updated as a regular app). */
    static boolean isSystem(Context c, String pkg) {
        try {
            ApplicationInfo ai = c.getPackageManager().getApplicationInfo(pkg, 0);
            return (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0 || ai.uid < 10000;
        } catch (PackageManager.NameNotFoundException e) {
            return true;
        }
    }

    /** Could this app be auto-locked at all? (Not us, a browser, a messenger, a system app, or one the user allowed.) */
    static boolean mayAutoLock(Context c, String pkg) {
        return !pkg.equals(c.getPackageName()) && !NEVER_AUTO.contains(pkg) && !isBrowser(c, pkg)
                && !isSystem(c, pkg) && !Prefs.autoAllowed(c).contains(pkg);
    }

    /**
     * An app named after a blocked community: its name or package mentions one, e.g. "Reddit is Fun",
     * "Infinity for Reddit", "○○ 디시 뷰어". Returns the community name, or null.
     */
    static String namedCommunity(String label, String pkg, Map<String, String> keywords) {
        String hit = StoreSearch.match(label, keywords);
        if (hit != null) return hit;
        // package words: "com.andrewshu.android.reddit" -> "com andrewshu android reddit"
        return StoreSearch.match(pkg.replace('.', ' ').replace('_', ' '), keywords);
    }

    /** All apps that have a launcher icon (phones and Meta Quest). */
    static List<ResolveInfo> launchable(Context c) {
        PackageManager pm = c.getPackageManager();
        List<ResolveInfo> list = new java.util.ArrayList<>(pm.queryIntentActivities(
                new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0));
        list.addAll(pm.queryIntentActivities(
                new Intent(Intent.ACTION_MAIN).addCategory("com.oculus.intent.category.VR"), 0));
        return list;
    }

    private AppKinds() {
    }
}
