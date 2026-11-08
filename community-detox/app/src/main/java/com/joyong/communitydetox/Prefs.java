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
    private static final String K_ADMIN_SETUP = "admin_setup_until";
    private static final String K_PAUSE_UNTIL = "pause_until";
    private static final String K_PAUSE_USED = "pause_used";
    private static final String K_INAPP_ALL = "inapp_block_all";
    private static final String K_VPN = "vpn_on";

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

    /** Locks until {@code untilMs}. A running lock can only be extended, never shortened. */
    static void lockUntilAtLeast(Context c, long untilMs) {
        long until = Math.max(lockUntil(c), untilMs);
        SharedPreferences.Editor e = sp(c).edit().putLong(K_LOCK_UNTIL, until).putBoolean(K_MASTER, true);
        if (!isLocked(c)) {
            // A brand-new focus detox gets a fresh one-time pause.
            e.putBoolean(K_PAUSE_USED, false).putLong(K_PAUSE_UNTIL, 0);
        }
        e.commit();
    }

    // ---- one-time pause during a focus lock ----

    static long pauseUntil(Context c) {
        return sp(c).getLong(K_PAUSE_UNTIL, 0);
    }

    static boolean isPaused(Context c) {
        return isLocked(c) && System.currentTimeMillis() < pauseUntil(c);
    }

    static boolean pauseUsed(Context c) {
        return sp(c).getBoolean(K_PAUSE_USED, false);
    }

    /**
     * Turns blocking off for {@code durationMs}. The focus timer stops meanwhile, so the end time
     * moves back by the same amount. Allowed once per focus detox.
     */
    static boolean startPause(Context c, long durationMs) {
        if (!isLocked(c) || pauseUsed(c) || isPaused(c)) return false;
        long now = System.currentTimeMillis();
        sp(c).edit()
                .putLong(K_PAUSE_UNTIL, now + durationMs)
                .putLong(K_LOCK_UNTIL, lockUntil(c) + durationMs)
                .putBoolean(K_PAUSE_USED, true)
                .commit();
        return true;
    }

    /** Ends the pause early; the unused pause time is taken back off the end time. */
    static void endPauseNow(Context c) {
        if (!isPaused(c)) return;
        long now = System.currentTimeMillis();
        long unused = pauseUntil(c) - now;
        sp(c).edit()
                .putLong(K_PAUSE_UNTIL, now)
                .putLong(K_LOCK_UNTIL, lockUntil(c) - unused)
                .commit();
    }

    /** Focus time left; frozen while paused. */
    static long lockRemaining(Context c) {
        long now = System.currentTimeMillis();
        return Math.max(0, lockUntil(c) - Math.max(now, isPaused(c) ? pauseUntil(c) : now));
    }

    /** Opens a 2-minute window in which the device-admin activation screen isn't closed by the guard. */
    static void allowAdminSetup(Context c) {
        sp(c).edit().putLong(K_ADMIN_SETUP, System.currentTimeMillis() + 2 * 60 * 1000).apply();
    }

    static boolean adminSetupAllowed(Context c) {
        return System.currentTimeMillis() < sp(c).getLong(K_ADMIN_SETUP, 0);
    }

    static boolean isBlockingActive(Context c) {
        return (isMasterOn(c) || isLocked(c)) && !isPaused(c);
    }

    // ---- what is blocked ----

    /** Network-level (DNS / VPN) blocking. The VR app's main method (on by default); optional on phones. */
    static boolean isVpnOn(Context c) {
        return sp(c).getBoolean(K_VPN, BuildConfig.IS_VR);
    }

    // ---- VPN also blocks this app (모아읽기) — free to change at any time ----

    private static final String K_SELF_BLOCK = "vpn_blocks_self";

    /** When on, the VPN doesn't exempt this app, so 모아읽기 can't reach the blocked sites either. */
    static boolean isSelfBlocked(Context c) {
        return sp(c).getBoolean(K_SELF_BLOCK, false);
    }

    static void setSelfBlocked(Context c, boolean on) {
        sp(c).edit().putBoolean(K_SELF_BLOCK, on).commit();
    }

    // ---- community app installs ----

    private static final String K_INSTALL_BLOCK = "install_block_on";

    /** Block installing the block list's community apps (store pages closed, fresh installs prompt removal). */
    static boolean isInstallBlockOn(Context c) {
        return sp(c).getBoolean(K_INSTALL_BLOCK, true);
    }

    static void setInstallBlockOn(Context c, boolean on) {
        sp(c).edit().putBoolean(K_INSTALL_BLOCK, on).apply();
    }

    private static final String K_TOSS_INVEST = "toss_invest_block";

    /** Block the securities (증권) part of the Toss app, and tossinvest.com. */
    static boolean isTossInvestBlocked(Context c) {
        return sp(c).getBoolean(K_TOSS_INVEST, false);
    }

    static void setTossInvestBlocked(Context c, boolean on) {
        sp(c).edit().putBoolean(K_TOSS_INVEST, on).apply();
    }

    private static final String K_BROWSER_ALL = "browser_block_all";

    /** Block browser apps entirely (VR: the Meta Quest Browser can't be opened at all). */
    static boolean isBrowserBlockAll(Context c) {
        return sp(c).getBoolean(K_BROWSER_ALL, false);
    }

    static void setBrowserBlockAll(Context c, boolean on) {
        sp(c).edit().putBoolean(K_BROWSER_ALL, on).apply();
    }

    static void setVpnOn(Context c, boolean on) {
        sp(c).edit().putBoolean(K_VPN, on).apply();
    }

    /** Close every page KakaoTalk opens in its in-app browser (not only blocked communities). */
    static boolean isInAppBlockAll(Context c) {
        return sp(c).getBoolean(K_INAPP_ALL, false);
    }

    static void setInAppBlockAll(Context c, boolean on) {
        sp(c).edit().putBoolean(K_INAPP_ALL, on).apply();
    }

    /** Built-in communities that existed before the list was expanded (version 1.1.12). */
    private static final String[] FIRST_PRESETS = {
            "dcinside", "fmkorea", "theqoo", "ruliweb", "clien", "ppomppu", "instiz", "natepann", "bobae", "mlbpark",
            "todayhumor", "82cook", "humoruniv", "inven", "arca", "dogdrip", "ilbe", "slrclub", "etoland", "ygosu",
            "damoang", "quasarzone", "everytime", "blind", "reddit", "x", "instagram", "facebook", "threads", "tiktok",
            "4chan", "9gag", "navercafe", "daumcafe", "discord", "youtube"};
    private static final String K_KNOWN_PRESETS = "known_presets";

    static Set<String> enabledPresets(Context c) {
        SharedPreferences p = sp(c);
        Set<String> stored = p.getStringSet(K_PRESETS, null);
        if (stored != null) {
            // Communities added to the built-in list later are switched on for existing users too
            // (if they are on by default); ones the user already knew about keep the user's choice.
            Set<String> known = p.getStringSet(K_KNOWN_PRESETS, null);
            if (known == null) known = new HashSet<>(java.util.Arrays.asList(FIRST_PRESETS));
            Set<String> result = new HashSet<>(stored);
            Set<String> allIds = new HashSet<>();
            boolean changed = false;
            for (Catalog.Entry e : Catalog.ALL) {
                allIds.add(e.id);
                if (!known.contains(e.id) && e.defaultOn && result.add(e.id)) changed = true;
            }
            if (changed || !known.containsAll(allIds)) {
                p.edit().putStringSet(K_PRESETS, new HashSet<>(result)).putStringSet(K_KNOWN_PRESETS, allIds).apply();
            }
            return result;
        }
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
        Set<String> allIds = new HashSet<>();
        for (Catalog.Entry e : Catalog.ALL) allIds.add(e.id);
        sp(c).edit().putStringSet(K_PRESETS, s).putStringSet(K_KNOWN_PRESETS, allIds).apply();
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
        /** page-title keyword -> display name (checked in in-app browser headers) */
        final Map<String, String> titleKeywords = new HashMap<>();
        /** normalized community app name / nickname -> community name (app store pages) */
        final Map<String, String> storeKeywords = new HashMap<>();
        boolean inAppBlockAll;

        /** Returns the community name if the text contains one of its page-title keywords, or null. */
        String matchTitle(CharSequence text) {
            if (text == null || text.length() == 0) return null;
            String t = text.toString();
            for (Map.Entry<String, String> e : titleKeywords.entrySet()) {
                if (t.contains(e.getKey())) return e.getValue();
            }
            return null;
        }

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
            for (String k : e.titleKeywords()) r.titleKeywords.put(k, e.name);
        }
        r.inAppBlockAll = isInAppBlockAll(c);
        for (String d : customDomains(c)) r.domains.put(d, d);
        if (isTossInvestBlocked(c)) r.domains.put("tossinvest.com", "토스증권");
        if (isInstallBlockOn(c)) {
            for (Catalog.Entry e : Catalog.ALL) {
                if (!on.contains(e.id)) continue;   // same communities as the block list
                for (String part : e.name.split("[()]")) {
                    String n = StoreSearch.normalize(part);
                    if (!n.isEmpty()) r.storeKeywords.put(n, e.name);   // also one-letter names like "X", matched exactly
                }
                for (String k : e.searchKeywords()) r.storeKeywords.put(StoreSearch.normalize(k), e.name);
            }
        }
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
