package com.ghj.japantv;

import android.content.Context;
import android.content.SharedPreferences;

import java.time.LocalDate;

/** 일본 방송을 본 시간(듣기 노출 시간)을 날짜별로 기록합니다. */
public final class WatchStats {
    private static final long MIN_FOR_STREAK_MS = 60_000L;

    private WatchStats() {
    }

    private static SharedPreferences sp(Context c) {
        return c.getApplicationContext().getSharedPreferences("stats", Context.MODE_PRIVATE);
    }

    private static String key(LocalDate d) {
        return "day_" + d;
    }

    public static void add(Context c, long ms) {
        if (ms <= 0) return;
        // 비정상적으로 긴 값(시계 문제 등)은 하루치로 자릅니다.
        ms = Math.min(ms, 24L * 60 * 60 * 1000);
        SharedPreferences s = sp(c);
        String k = key(LocalDate.now());
        s.edit()
                .putLong(k, s.getLong(k, 0) + ms)
                .putLong("total", s.getLong("total", 0) + ms)
                .apply();
    }

    public static long today(Context c) {
        return sp(c).getLong(key(LocalDate.now()), 0);
    }

    public static long total(Context c) {
        return sp(c).getLong("total", 0);
    }

    /** 며칠 연속으로 봤는지 (오늘 아직 안 봤으면 어제까지 기준) */
    public static int streak(Context c) {
        SharedPreferences s = sp(c);
        LocalDate d = LocalDate.now();
        if (s.getLong(key(d), 0) < MIN_FOR_STREAK_MS) d = d.minusDays(1);
        int n = 0;
        while (n < 3650 && s.getLong(key(d), 0) >= MIN_FOR_STREAK_MS) {
            n++;
            d = d.minusDays(1);
        }
        return n;
    }

    public static String format(long ms) {
        long min = ms / 60_000L;
        long h = min / 60;
        long m = min % 60;
        if (h > 0) return m > 0 ? h + "시간 " + m + "분" : h + "시간";
        return m + "분";
    }
}
