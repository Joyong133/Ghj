package com.joyong.communitydetox;

import android.content.Context;
import android.content.SharedPreferences;

import java.text.SimpleDateFormat;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** All persisted settings and stats. Everything stays on the device. */
final class Prefs {

    private static final String FILE = "detox";
    private static final String K_MASTER = "master_on";
    private static final String K_LOCK_UNTIL = "lock_until";
    private static final String K_PRESETS = "presets";
    private static final String K_DOMAINS = "custom_domains";
    private static final String K_PACKAGES = "custom_packages";
    private static final String K_TOTAL = "total_blocks";
    private static final String K_DAY = "day";
    private static final String K_DAY_COUNT = "day_count";
    private static final String K_STARTED = "started_at";

    static SharedPreferences sp(Context c) {
        return c.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    // ---- on / off / focus lock ----

    static boolean isMasterOn(Context c) {
        return sp(c).getBoolean(K_MASTER, true);
    }

    static void setMasterOn(Context c, boolean on) {
        sp(c).edit().putBoolean(K_MASTER, on).apply();
    }

    static long lockUntil(Context c) {
        return sp(c).getLong(K_LOCK_UNTIL, 0L);
    }

    static boolean isLocked(Context c) {
        return System.currentTimeMillis() < lockUntil(c);
    }

    static void startLock(Context c, long durationMs) {
        long until = Math.max(lockUntil(c), System.currentTimeMillis()) + durationMs;
        sp(c).edit().putLong(K_LOCK_UNTIL, until).putBoolean(K_MASTER, true).apply();
    }

    static boolean isBlockingActive(Context c) {
        return isMasterOn(c) || isLocked(c);
    }

    // ---- what is blocked ----

    static Set<String> enabledPresets(Context c) {
        Set<String> stored = sp(c).getStringSet(K_PRESETS, null);
        if (stored != null) return new HashSet<>(stored);
        Set<String> defaults = new HashSet<>();
        for (Catalog.Entry e : Catalog.ALL) {
            if (e.defaultOn) defaults.add(e.id);
        }
        return defaults;
    }

    static void setPresetsEnabled(Context c, Set<String> ids, boolean on) {
        Set<String> s = enabledPresets(c);
        if (on) s.addAll(ids);
        else s.removeAll(ids);
        sp(c).edit().putStringSet(K_PRESETS, s).apply();
    }

    static Set<String> customDomains(Context c) {
        return new HashSet<>(sp(c).getStringSet(K_DOMAINS, Collections.<String>emptySet()));
    }

    static void addCustomDomain(Context c, String domain) {
        Set<String> s = customDomains(c);
        s.add(domain);
        sp(c).edit().putStringSet(K_DOMAINS, s).apply();
    }

    static void removeCustomDomain(Context c, String domain) {
        Set<String> s = customDomains(c);
        s.remove(domain);
        sp(c).edit().putStringSet(K_DOMAINS, s).apply();
    }

    static Set<String> customPackages(Context c) {
        return new HashSet<>(sp(c).getStringSet(K_PACKAGES, Collections.<String>emptySet()));
    }

    static void setCustomPackages(Context c, Set<String> pkgs) {
        sp(c).edit().putStringSet(K_PACKAGES, new HashSet<>(pkgs)).apply();
    }

    // ---- stats ----

    private static String today() {
        return new SimpleDateFormat("yyyyMMdd", Locale.ROOT).format(new Date());
    }

    static void recordBlock(Context c) {
        SharedPreferences p = sp(c);
        String day = today();
        int dayCount = day.equals(p.getString(K_DAY, "")) ? p.getInt(K_DAY_COUNT, 0) : 0;
        p.edit()
                .putString(K_DAY, day)
                .putInt(K_DAY_COUNT, dayCount + 1)
                .putLong(K_TOTAL, p.getLong(K_TOTAL, 0) + 1)
                .apply();
    }

    static int todayBlocks(Context c) {
        SharedPreferences p = sp(c);
        return today().equals(p.getString(K_DAY, "")) ? p.getInt(K_DAY_COUNT, 0) : 0;
    }

    static long totalBlocks(Context c) {
        return sp(c).getLong(K_TOTAL, 0);
    }

    /** Day number of the detox, starting at 1 on the day the app was first opened. */
    static long detoxDay(Context c) {
        SharedPreferences p = sp(c);
        long started = p.getLong(K_STARTED, 0);
        if (started == 0) {
            started = System.currentTimeMillis();
            p.edit().putLong(K_STARTED, started).apply();
        }
        return (System.currentTimeMillis() - started) / (24L * 60 * 60 * 1000) + 1;
    }

    // ---- compiled rules used by the blocking service ----

    static final class Rules {
        /** domain -> display name */
        final Map<String, String> domains = new HashMap<>();
        /** package -> display name (null = look up the app label) */
        final Map<String, String> packages = new HashMap<>();

        /** Returns the matching blocked domain for the text in an address bar, or null. */
        String matchUrlText(CharSequence text) {
            if (text == null || text.length() == 0) return null;
            for (String token : text.toString().trim().toLowerCase(Locale.ROOT).split("\\s+")) {
                String host = hostOf(token);
                if (host == null) continue;
                String hit = matchHost(host);
                if (hit != null) return hit;
            }
            return null;
        }

        String matchHost(String host) {
            // Walk up the labels: gall.m.dcinside.com -> m.dcinside.com -> dcinside.com -> com
            String h = host;
            while (true) {
                if (domains.containsKey(h)) return h;
                int dot = h.indexOf('.');
                if (dot < 0) return null;
                h = h.substring(dot + 1);
            }
        }
    }

    static Rules rules(Context c) {
        Rules r = new Rules();
        Set<String> on = enabledPresets(c);
        for (Catalog.Entry e : Catalog.ALL) {
            if (!on.contains(e.id)) continue;
            for (String d : e.domains) r.domains.put(d, e.name);
            for (String p : e.packages) r.packages.put(p, e.name);
        }
        for (String d : customDomains(c)) r.domains.put(d, d);
        for (String p : customPackages(c)) {
            if (!r.packages.containsKey(p)) r.packages.put(p, null);
        }
        return r;
    }

    /** "https://www.Example.com/path?q" -> "example.com"; returns null if it doesn't look like a host. */
    static String hostOf(String raw) {
        if (raw == null) return null;
        String s = raw.trim().toLowerCase(Locale.ROOT);
        int scheme = s.indexOf("://");
        if (scheme >= 0) s = s.substring(scheme + 3);
        int at = s.indexOf('@');
        int slash = s.indexOf('/');
        if (at >= 0 && (slash < 0 || at < slash)) s = s.substring(at + 1);
        int end = s.length();
        for (char ch : new char[]{'/', '?', '#', ':'}) {
            int i = s.indexOf(ch);
            if (i >= 0 && i < end) end = i;
        }
        s = s.substring(0, end);
        while (s.endsWith(".")) s = s.substring(0, s.length() - 1);
        if (s.startsWith("www.")) s = s.substring(4);
        if (s.indexOf('.') <= 0 || s.length() > 253) return null;
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            boolean ok = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '.'
                    || Character.isLetter(ch); // allow IDN (e.g. 한글.com)
            if (!ok) return null;
        }
        return s;
    }

    private Prefs() {
    }
}
