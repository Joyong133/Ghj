package com.ghj.aireplace;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.SweepGradient;
import android.graphics.Typeface;
import android.view.View;
import android.view.animation.DecelerateInterpolator;

/** 반원형 확률 게이지. */
public class GaugeView extends View {

    private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint needle = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint big = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint small = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF oval = new RectF();
    private float value;      // 0~1 (애니메이션 중 값)
    private String caption = "";
    private ValueAnimator anim;

    public GaugeView(Context c) {
        super(c);
        float d = getResources().getDisplayMetrics().density;
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeCap(Paint.Cap.ROUND);
        track.setColor(0x22FFFFFF);
        arc.setStyle(Paint.Style.STROKE);
        arc.setStrokeCap(Paint.Cap.ROUND);
        needle.setColor(Ui.TEXT);
        needle.setStrokeWidth(3 * d);
        needle.setStrokeCap(Paint.Cap.ROUND);
        big.setColor(Ui.TEXT);
        big.setTextAlign(Paint.Align.CENTER);
        big.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        small.setColor(Ui.SUB);
        small.setTextAlign(Paint.Align.CENTER);
    }

    public void setValue(double target, String caption) {
        this.caption = caption;
        if (anim != null) anim.cancel();
        anim = ValueAnimator.ofFloat(value, (float) target);
        anim.setDuration(700);
        anim.setInterpolator(new DecelerateInterpolator());
        anim.addUpdateListener(a -> {
            value = (float) a.getAnimatedValue();
            invalidate();
        });
        anim.start();
    }

    @Override
    protected void onMeasure(int w, int h) {
        int width = MeasureSpec.getSize(w);
        setMeasuredDimension(width, (int) (width * 0.68f));
    }

    @Override
    protected void onDraw(Canvas cv) {
        float w = getWidth();
        float stroke = w * 0.075f;
        float r = (w - stroke) / 2f - getPaddingLeft();
        float cx = w / 2f;
        float cy = r + stroke / 2f + getPaddingTop();
        oval.set(cx - r, cy - r, cx + r, cy + r);
        track.setStrokeWidth(stroke);
        arc.setStrokeWidth(stroke);

        cv.drawArc(oval, 180, 180, false, track);

        // 각도 0=오른쪽 기준 그라데이션: 왼쪽(180°)=초록, 위(270°)=노랑, 오른쪽(360°)=빨강
        int[] colors = {Ui.RED, Ui.RED, Ui.GREEN, Ui.YELLOW, Ui.RED};
        float[] pos = {0f, 0.02f, 0.5f, 0.75f, 1f};
        SweepGradient g = new SweepGradient(cx, cy, colors, pos);
        arc.setShader(g);
        if (value > 0.001f) cv.drawArc(oval, 180, 180 * value, false, arc);

        double ang = Math.toRadians(180 + 180 * value);
        float nl = r * 0.72f;
        cv.drawLine(cx, cy, cx + (float) (Math.cos(ang) * nl), cy + (float) (Math.sin(ang) * nl), needle);
        needle.setStyle(Paint.Style.FILL);
        cv.drawCircle(cx, cy, stroke * 0.35f, needle);

        big.setTextSize(r * 0.42f);
        big.setColor(Ui.riskColor(value));
        cv.drawText(Math.round(value * 100) + "%", cx, cy - r * 0.22f, big);
        small.setTextSize(r * 0.17f);
        cv.drawText(caption, cx, cy + r * 0.28f, small);
    }

    /** 색상 상수. */
    static final class Ui {
        static final int BG = 0xFF0F1220;
        static final int CARD = 0xFF1A1F35;
        static final int CARD2 = 0xFF232A47;
        static final int TEXT = 0xFFE8EAF6;
        static final int SUB = 0xFF9AA0BF;
        static final int ACCENT = 0xFF7C8CFF;
        static final int GREEN = 0xFF3DDC97;
        static final int YELLOW = 0xFFFFC857;
        static final int RED = 0xFFFF6B6B;
        static final int KR = 0xFF4F8CFF;
        static final int JP = 0xFFFF7AA8;

        static int riskColor(double p) {
            if (p < 0.20) return GREEN;
            if (p < 0.40) return blend(GREEN, YELLOW, (float) ((p - 0.2) / 0.2));
            if (p < 0.60) return blend(YELLOW, RED, (float) ((p - 0.4) / 0.2));
            return RED;
        }

        static int blend(int a, int b, float t) {
            return Color.rgb(
                    (int) (Color.red(a) + (Color.red(b) - Color.red(a)) * t),
                    (int) (Color.green(a) + (Color.green(b) - Color.green(a)) * t),
                    (int) (Color.blue(a) + (Color.blue(b) - Color.blue(a)) * t));
        }

        private Ui() {}
    }
}
