package com.joyong.jlock;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

/** Native-side settings. The study config is stored as the JSON blob the web UI writes. */
final class Prefs {
    private static final String FILE = "jlock";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_CONFIG = "config";

    private Prefs() {}

    private static SharedPreferences sp(Context c) {
        return c.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static boolean isEnabled(Context c) { return sp(c).getBoolean(KEY_ENABLED, false); }

    static void setEnabled(Context c, boolean on) { sp(c).edit().putBoolean(KEY_ENABLED, on).apply(); }

    /** A lock is due and has not been passed yet (survives the service being killed). */
    static boolean isPending(Context c) { return sp(c).getBoolean("pending", false); }

    static void setPending(Context c, boolean on) { sp(c).edit().putBoolean("pending", on).apply(); }

    static String getConfig(Context c) { return sp(c).getString(KEY_CONFIG, ""); }

    static void setConfig(Context c, String json) { sp(c).edit().putString(KEY_CONFIG, json).apply(); }

    private static JSONObject configJson(Context c) {
        try {
            String s = getConfig(c);
            return s.isEmpty() ? new JSONObject() : new JSONObject(s);
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    /** Seconds after an unlock before the study lock comes back while the phone is in use (0 = off). */
    static int relockSeconds(Context c) { return configJson(c).optInt("relock", 0); }

    /** "strict" relaunches the lock if the user leaves it with Home; "warn"/"off" do not. */
    static String guard(Context c) { return configJson(c).optString("guard", "strict"); }
}
