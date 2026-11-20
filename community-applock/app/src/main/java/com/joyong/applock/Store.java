package com.joyong.applock;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Settings and the list of locked apps. Everything stays on the device. */
final class Store {

    private static final String K_LOCKED = "locked";       // entries "package\tcommunity\tway"
    private static final String K_ALLOWED = "allowed";     // packages the user unlocked
    private static final String K_VPN = "vpn_on";
    private static final String K_COUNT = "count";

    static SharedPreferences sp(Context c) {
        return c.getApplicationContext().getSharedPreferences("applock", Context.MODE_PRIVATE);
    }

    /** How an app was found. */
    static final String BY_NAME = "name", BY_SITE = "site", BY_CONNECTION = "net";

    /** One locked app. */
    static final class Locked {
        final String pkg, community, way;

        Locked(String pkg, String community, String way) {
            this.pkg = pkg;
            this.community = community;
            this.way = way;
        }

        /** "이름에 디시인사이드", "디시인사이드 웹사이트를 여는 앱", "디시인사이드 접속" */
        String reason() {
            if (BY_CONNECTION.equals(way)) return community + "에 접속하려 했어요";
            if (BY_SITE.equals(way)) return community + " 웹사이트를 여는 앱이에요";
            return "이름에 " + community + "이(가) 들어 있어요";
        }
    }

    static Map<String, Locked> locked(Context c) {
        Map<String, Locked> m = new HashMap<>();
        for (String e : sp(c).getStringSet(K_LOCKED, Collections.<String>emptySet())) {
            String[] p = e.split("\t");
            if (p.length >= 3) m.put(p[0], new Locked(p[0], p[1], p[2]));
        }
        return m;
    }

    static boolean isLocked(Context c, String pkg) {
        for (String e : sp(c).getStringSet(K_LOCKED, Collections.<String>emptySet())) {
            if (e.startsWith(pkg + "\t")) return true;
        }
        return false;
    }

    /** Returns true if newly locked. */
    static synchronized boolean lock(Context c, String pkg, String community, String way) {
        if (isLocked(c, pkg) || allowed(c).contains(pkg)) return false;
        Set<String> s = new HashSet<>(sp(c).getStringSet(K_LOCKED, Collections.<String>emptySet()));
        s.add(pkg + "\t" + community + "\t" + way);
        sp(c).edit().putStringSet(K_LOCKED, s).apply();
        return true;
    }

    /** Unlock; it won't be locked automatically again. */
    static synchronized void unlock(Context c, String pkg) {
        Set<String> s = new HashSet<>();
        for (String e : sp(c).getStringSet(K_LOCKED, Collections.<String>emptySet())) {
            if (!e.startsWith(pkg + "\t")) s.add(e);
        }
        Set<String> a = allowed(c);
        a.add(pkg);
        sp(c).edit().putStringSet(K_LOCKED, s).putStringSet(K_ALLOWED, a).apply();
    }

    static Set<String> allowed(Context c) {
        return new HashSet<>(sp(c).getStringSet(K_ALLOWED, Collections.<String>emptySet()));
    }

    static boolean isVpnOn(Context c) {
        return sp(c).getBoolean(K_VPN, false);
    }

    static void setVpnOn(Context c, boolean on) {
        sp(c).edit().putBoolean(K_VPN, on).apply();
    }

    static void countBlock(Context c) {
        sp(c).edit().putLong(K_COUNT, sp(c).getLong(K_COUNT, 0) + 1).apply();
    }

    static long blocks(Context c) {
        return sp(c).getLong(K_COUNT, 0);
    }

    // ---- what counts as a community (the built-in list's default communities) ----

    private static Map<String, String> keywords;
    private static Map<String, String> domains;

    /** normalized name / nickname -> community name. */
    static synchronized Map<String, String> keywords() {
        if (keywords == null) {
            Map<String, String> k = new HashMap<>();
            for (Catalog.Entry e : Catalog.ALL) {
                if (!e.defaultOn) continue;
                for (String part : e.name.split("[()]")) {
                    String n = Keywords.normalize(part);
                    if (!n.isEmpty()) k.put(n, e.name);
                }
                for (String w : e.searchKeywords()) k.put(Keywords.normalize(w), e.name);
            }
            keywords = k;
        }
        return keywords;
    }

    /** domain -> community name. */
    static synchronized Map<String, String> domains() {
        if (domains == null) {
            Map<String, String> d = new HashMap<>();
            for (Catalog.Entry e : Catalog.ALL) {
                if (!e.defaultOn) continue;
                for (String x : e.domains) d.put(x, e.name);
            }
            domains = d;
        }
        return domains;
    }

    /** The blocked community for a host ("gall.dcinside.com" -> 디시인사이드), or null. */
    static String communityOfHost(String host) {
        Map<String, String> d = domains();
        String h = host;
        while (true) {
            String n = d.get(h);
            if (n != null) return n;
            int dot = h.indexOf('.');
            if (dot < 0) return null;
            h = h.substring(dot + 1);
        }
    }

    private Store() {
    }
}
