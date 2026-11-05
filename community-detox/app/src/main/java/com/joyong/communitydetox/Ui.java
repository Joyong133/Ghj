package com.joyong.communitydetox;

import android.app.Activity;
import android.content.Context;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Tiny code-only UI kit (no XML layouts, no extra libraries). */
final class Ui {

    final Context ctx;
    final int bg, card, text, sub, accent, accentSoft, onAccent, danger, line;

    Ui(Context ctx) {
        this.ctx = ctx;
        boolean night = (ctx.getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        bg = night ? 0xFF0F1512 : 0xFFF4F7F2;
        card = night ? 0xFF1A221D : 0xFFFFFFFF;
        text = night ? 0xFFE6EEE8 : 0xFF1D2A22;
        sub = night ? 0xFF9DB0A3 : 0xFF5B6B60;
        accent = night ? 0xFF6FCF97 : 0xFF2E7D4F;
        accentSoft = night ? 0xFF20352A : 0xFFE3F1E8;
        onAccent = night ? 0xFF0F1512 : 0xFFFFFFFF;
        danger = night ? 0xFFFF8A80 : 0xFFC0392B;
        line = night ? 0xFF2A352E : 0xFFE4EAE5;
    }

    int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v,
                ctx.getResources().getDisplayMetrics()));
    }

    LinearLayout column() {
        LinearLayout l = new LinearLayout(ctx);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    LinearLayout row() {
        LinearLayout l = new LinearLayout(ctx);
        l.setOrientation(LinearLayout.HORIZONTAL);
        l.setGravity(Gravity.CENTER_VERTICAL);
        return l;
    }

    GradientDrawable rounded(int color, float radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radiusDp));
        return g;
    }

    LinearLayout card() {
        LinearLayout c = column();
        c.setBackground(rounded(card, 20));
        c.setPadding(dp(18), dp(16), dp(18), dp(16));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(12);
        c.setLayoutParams(lp);
        return c;
    }

    TextView text(CharSequence s, float sp, int color, boolean bold) {
        TextView t = new TextView(ctx);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setLineSpacing(0, 1.15f);
        if (bold) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return t;
    }

    TextView title(CharSequence s) {
        TextView t = text(s, 17, text, true);
        t.setPadding(0, 0, 0, dp(6));
        return t;
    }

    TextView body(CharSequence s) {
        return text(s, 14, sub, false);
    }

    Button button(CharSequence label, boolean primary, View.OnClickListener onClick) {
        Button b = new Button(ctx);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setTextColor(primary ? onAccent : accent);
        b.setStateListAnimator(null);
        b.setMinHeight(dp(44));
        b.setMinimumHeight(dp(44));
        b.setPadding(dp(14), 0, dp(14), 0);
        b.setBackground(new RippleDrawable(ColorStateList.valueOf(0x33000000),
                rounded(primary ? accent : accentSoft, 14), null));
        b.setOnClickListener(onClick);
        return b;
    }

    View divider() {
        View v = new View(ctx);
        v.setBackgroundColor(line);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, Math.max(1, dp(1) / 2));
        lp.topMargin = dp(6);
        lp.bottomMargin = dp(6);
        v.setLayoutParams(lp);
        return v;
    }

    static LinearLayout.LayoutParams wrap(int topMarginPx) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = topMarginPx;
        return lp;
    }

    static LinearLayout.LayoutParams fill(int topMarginPx) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = topMarginPx;
        return lp;
    }

    static LinearLayout.LayoutParams weight(int leftMarginPx) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        lp.leftMargin = leftMarginPx;
        return lp;
    }

    /** Pads a full-screen root view so content stays clear of the status / navigation bars and keyboard. */
    void applySystemBarPadding(Activity a, View root, int basePx) {
        a.getWindow().getDecorView().setBackgroundColor(bg);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int l, t, r, b;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.ime() | WindowInsets.Type.displayCutout());
                l = i.left; t = i.top; r = i.right; b = i.bottom;
            } else {
                l = insets.getSystemWindowInsetLeft();
                t = insets.getSystemWindowInsetTop();
                r = insets.getSystemWindowInsetRight();
                b = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(basePx + l, basePx + t, basePx + r, basePx + b);
            return insets;
        });
    }

    /** "1일 2시간 3분 4초" style remaining-time text. */
    static String remaining(long ms) {
        long s = Math.max(0, ms / 1000);
        long d = s / 86400, h = (s % 86400) / 3600, m = (s % 3600) / 60, sec = s % 60;
        StringBuilder sb = new StringBuilder();
        if (d > 0) sb.append(d).append("일 ");
        if (d > 0 || h > 0) sb.append(h).append("시간 ");
        sb.append(m).append("분 ").append(sec).append("초");
        return sb.toString();
    }

    /** Korean topic particle: 디시인사이드는 / 블라인드는 / 에브리타임은. */
    static String topic(String word) {
        if (word == null || word.isEmpty()) return "";
        char last = word.charAt(word.length() - 1);
        if (last >= 0xAC00 && last <= 0xD7A3) {
            return word + (((last - 0xAC00) % 28) == 0 ? "는" : "은");
        }
        return word + "은(는)";
    }
}
