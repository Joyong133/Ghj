package com.joyong.applock;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Browsers, messengers, system apps — and whether an app may be locked automatically. */
final class Kinds {

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

    /** Open other people's links or make link previews — never locked automatically. */
    static final Set<String> NEVER = new HashSet<>(Arrays.asList(
            "com.kakao.talk", "com.kakao.story", "jp.naver.line.android", "org.telegram.messenger",
            "org.thunderdog.challegram", "com.whatsapp", "com.facebook.orca", "com.nhn.android.band",
            "com.google.android.gm", "com.samsung.android.messaging", "com.google.android.apps.messaging",
            "com.Slack", "com.microsoft.teams", "com.nhn.android.mail", "net.daum.android.mail",
            "com.google.android.apps.docs", "com.google.android.keep", "com.samsung.android.app.notes",
            "com.google.android.youtube",
            // Digital Detox itself (its own 모아읽기 reads communities on purpose)
            "com.joyong.communitydetox", "com.joyong.communitydetox.vr"));

    /** Meta Quest's own home, shell and lock screen. */
    static final Set<String> QUEST_SYSTEM = new HashSet<>(Arrays.asList(
            "com.oculus.vrshell", "com.oculus.shellenv", "com.oculus.systemux", "com.oculus.systemdriver",
            "com.oculus.os.vrlockscreen"));

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
            browsers = found;
            browsersAt = now;
        }
        return browsers.contains(pkg);
    }

    static boolean isSystem(Context c, String pkg) {
        try {
            ApplicationInfo ai = c.getPackageManager().getApplicationInfo(pkg, 0);
            return (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0 || ai.uid < 10000;
        } catch (PackageManager.NameNotFoundException e) {
            return true;
        }
    }

    static boolean mayLock(Context c, String pkg) {
        return !pkg.equals(c.getPackageName()) && !NEVER.contains(pkg) && !QUEST_SYSTEM.contains(pkg)
                && !isBrowser(c, pkg) && !isSystem(c, pkg) && !Store.allowed(c).contains(pkg);
    }

    /** Community the app is named after (label or package), or null. */
    static String namedCommunity(String label, String pkg, Map<String, String> keywords) {
        String hit = Keywords.match(label, keywords);
        if (hit != null) return hit;
        return Keywords.match(pkg.replace('.', ' ').replace('_', ' '), keywords);
    }

    static List<ResolveInfo> launchable(Context c) {
        PackageManager pm = c.getPackageManager();
        List<ResolveInfo> list = new ArrayList<>(pm.queryIntentActivities(
                new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0));
        list.addAll(pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory("com.oculus.intent.category.VR"), 0));
        return list;
    }

    static String label(Context c, String pkg) {
        try {
            PackageManager pm = c.getPackageManager();
            return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (PackageManager.NameNotFoundException e) {
            return pkg;
        }
    }

    private Kinds() {
    }
}
