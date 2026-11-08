package com.ghj.aireplace;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.View;

import com.ghj.aireplace.GaugeView.Ui;

import java.util.ArrayList;
import java.util.List;

/** 작은 차트 뷰들. */
final class ChartViews {

    private ChartViews() {}

    /** 0을 중심으로 좌(완화, 초록)·우(위험, 빨강)로 뻗는 기여도 막대. */
    static final class ContributionBar extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private double v;
        private static final double RANGE = 1.2;

        ContributionBar(Context c) {
            super(c);
        }

        void set(double v) {
            this.v = v;
            invalidate();
        }

        @Override
        protected void onDraw(Canvas c) {
            float w = getWidth(), h = getHeight(), mid = w / 2f;
            p.setColor(0x22FFFFFF);
            c.drawRoundRect(0, h * 0.3f, w, h * 0.7f, h, h, p);
            float len = (float) (Math.min(1, Math.abs(v) / RANGE) * mid);
            p.setColor(v >= 0 ? Ui.RED : Ui.GREEN);
            if (v >= 0) c.drawRoundRect(mid, h * 0.2f, mid + len, h * 0.8f, h, h, p);
            else c.drawRoundRect(mid - len, h * 0.2f, mid, h * 0.8f, h, h, p);
            p.setColor(Ui.SUB);
            c.drawRect(mid - 1, 0, mid + 1, h, p);
        }
    }

    /** 새로고침 이력에 따른 두 나라 확률 추이. */
    static final class Sparkline extends View {
        private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint grid = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint label = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final List<double[]> series = new ArrayList<>(); // [kr, jp]
        private final float d;

        Sparkline(Context c) {
            super(c);
            d = getResources().getDisplayMetrics().density;
            line.setStyle(Paint.Style.STROKE);
            line.setStrokeWidth(2.5f * d);
            line.setStrokeJoin(Paint.Join.ROUND);
            grid.setColor(0x18FFFFFF);
            grid.setStrokeWidth(d);
            label.setColor(Ui.SUB);
            label.setTextSize(10 * d);
        }

        void set(List<double[]> data) {
            series.clear();
            series.addAll(data);
            invalidate();
        }

        @Override
        protected void onDraw(Canvas c) {
            float w = getWidth(), h = getHeight();
            float left = 30 * d, top = 8 * d, bottom = h - 8 * d;
            for (int pct = 0; pct <= 100; pct += 25) {
                float y = bottom - (bottom - top) * pct / 100f;
                c.drawLine(left, y, w, y, grid);
                c.drawText(pct + "%", 0, y + 4 * d, label);
            }
            if (series.isEmpty()) {
                c.drawText("새로고침할 때마다 기록됩니다", left + 8 * d, h / 2f, label);
                return;
            }
            drawSeries(c, 0, Ui.KR, left, top, bottom, w);
            drawSeries(c, 1, Ui.JP, left, top, bottom, w);
        }

        private void drawSeries(Canvas c, int idx, int color, float left, float top, float bottom, float w) {
            int n = series.size();
            Path path = new Path();
            line.setColor(color);
            Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
            dot.setColor(color);
            for (int i = 0; i < n; i++) {
                float x = n == 1 ? (left + w) / 2f : left + (w - left - 6 * d) * i / (n - 1f) + 3 * d;
                float y = bottom - (bottom - top) * (float) series.get(i)[idx];
                if (i == 0) path.moveTo(x, y);
                else path.lineTo(x, y);
                if (i == n - 1) c.drawCircle(x, y, 3.5f * d, dot);
            }
            c.drawPath(path, line);
        }
    }
}
