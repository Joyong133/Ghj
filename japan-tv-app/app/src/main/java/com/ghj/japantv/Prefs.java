package com.ghj.japantv;

import android.content.Context;
import android.content.SharedPreferences;

/** 앱 설정 */
public final class Prefs {
    private final SharedPreferences sp;

    public Prefs(Context context) {
        sp = context.getApplicationContext().getSharedPreferences("settings", Context.MODE_PRIVATE);
    }

    /** 앱을 켜면 마지막에 보던 채널을 바로 재생 */
    public boolean isAutoResume() {
        return sp.getBoolean("auto_resume", true);
    }

    public void setAutoResume(boolean v) {
        sp.edit().putBoolean("auto_resume", v).apply();
    }

    /** 홈 버튼을 누르면 작은 화면(PIP)으로 계속 재생 */
    public boolean isPipEnabled() {
        return sp.getBoolean("pip", true);
    }

    public void setPipEnabled(boolean v) {
        sp.edit().putBoolean("pip", v).apply();
    }

    public int getDailyGoalMinutes() {
        return sp.getInt("daily_goal_min", 60);
    }

    public void setDailyGoalMinutes(int v) {
        sp.edit().putInt("daily_goal_min", v).apply();
    }

    public String getLastChannelId() {
        return sp.getString("last_channel", null);
    }

    public void setLastChannelId(String id) {
        sp.edit().putString("last_channel", id).apply();
    }
}
