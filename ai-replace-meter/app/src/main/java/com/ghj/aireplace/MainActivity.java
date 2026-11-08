package com.ghj.aireplace;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

import com.ghj.aireplace.GaugeView.Ui;
import com.ghj.aireplace.RiskModel.Country;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.IntConsumer;

public class MainActivity extends Activity {

    private static final long AUTO_REFRESH_MS = 30 * 60 * 1000L;
    private static final int MAX_NEWS = 25;
    private static final int MAX_HISTORY = 30;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final RiskModel.Inputs inputs = new RiskModel.Inputs();
    private final Map<News.Feed, List<News.Item>> news = new EnumMap<>(News.Feed.class);
    private SharedPreferences prefs;
    private Country selected = Country.KR;
    private boolean loading;
    private long lastFetch;
    private String lastError;

    private final Map<Country, GaugeView> gauges = new EnumMap<>(Country.class);
    private final Map<Country, LinearLayout> gaugeCards = new EnumMap<>(Country.class);
    private TextView status, refreshBtn, aiLabel, detailTitle, newsTitle, momentumText;
    private LinearLayout factorList, newsList;
    private ChartViews.Sparkline sparkline;
    private float d;

    private final Runnable autoRefresh = new Runnable() {
        @Override
        public void run() {
            refresh();
            main.postDelayed(this, AUTO_REFRESH_MS);
        }
    };

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        d = getResources().getDisplayMetrics().density;
        prefs = getSharedPreferences("meter", MODE_PRIVATE);
        loadState();
        setContentView(buildUi());
        render();
    }

    @Override
    protected void onResume() {
        super.onResume();
        long wait = Math.max(0, lastFetch + AUTO_REFRESH_MS - System.currentTimeMillis());
        main.postDelayed(autoRefresh, wait);
    }

    @Override
    protected void onPause() {
        super.onPause();
        main.removeCallbacks(autoRefresh);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        io.shutdownNow();
    }

    // ── UI 구성 ──────────────────────────────────────────────────────────

    private View buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Ui.BG);
        scroll.setFillViewport(true);
        LinearLayout root = vbox();
        root.setPadding(dp(16), dp(20), dp(16), dp(32));
        scroll.addView(root);

        // 헤더
        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout titles = vbox();
        titles.addView(text("개발자 AI 대체 확률", 22, Ui.TEXT, true));
        titles.addView(text("실시간 뉴스 × AI 성능 가정 기반 추정", 13, Ui.SUB, false));
        header.addView(titles, new LinearLayout.LayoutParams(0, -2, 1));
        refreshBtn = text("새로고침", 14, Ui.TEXT, true);
        refreshBtn.setPadding(dp(14), dp(8), dp(14), dp(8));
        refreshBtn.setBackground(round(0x557C8CFF, 20, 0));
        refreshBtn.setOnClickListener(v -> refresh());
        header.addView(refreshBtn);
        root.addView(header);

        status = text("", 12, Ui.SUB, false);
        status.setPadding(0, dp(8), 0, dp(12));
        root.addView(status);

        // 두 나라 게이지
        LinearLayout row = new LinearLayout(this);
        for (Country c : Country.values()) {
            LinearLayout card = vbox();
            card.setPadding(dp(10), dp(12), dp(10), dp(10));
            card.setGravity(Gravity.CENTER_HORIZONTAL);
            TextView name = text(c.flag + " " + c.label + " 개발자", 15, Ui.TEXT, true);
            name.setGravity(Gravity.CENTER);
            card.addView(name);
            GaugeView g = new GaugeView(this);
            g.setPadding(dp(4), dp(8), dp(4), 0);
            card.addView(g, new LinearLayout.LayoutParams(-1, -2));
            card.setOnClickListener(v -> {
                selected = c;
                prefs.edit().putString("country", c.name()).apply();
                render();
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1);
            lp.setMargins(c == Country.KR ? 0 : dp(6), 0, c == Country.KR ? dp(6) : 0, 0);
            row.addView(card, lp);
            gauges.put(c, g);
            gaugeCards.put(c, card);
        }
        root.addView(row);
        TextView tip = text("카드를 누르면 아래에 해당 국가의 상세 분석이 표시됩니다", 11, Ui.SUB, false);
        tip.setGravity(Gravity.CENTER);
        tip.setPadding(0, dp(6), 0, 0);
        root.addView(tip);

        // 조건 설정
        LinearLayout settings = card(root, "조건 설정");
        settings.addView(label("직군"));
        settings.addView(chips(RiskModel.ROLES, inputs.role, i -> { inputs.role = i; saveInputs(); renderScores(); }));
        settings.addView(label("경력"));
        settings.addView(chips(RiskModel.SENIORITY, inputs.seniority, i -> { inputs.seniority = i; saveInputs(); renderScores(); }));
        settings.addView(label("기간"));
        settings.addView(chips(RiskModel.HORIZON, inputs.horizon, i -> { inputs.horizon = i; saveInputs(); renderScores(); }));
        aiLabel = label("");
        settings.addView(aiLabel);
        SeekBar seek = new SeekBar(this);
        seek.setMax(70); // 30~100
        seek.setProgress(inputs.aiPerformance - 30);
        seek.setProgressTintList(ColorStateList.valueOf(Ui.ACCENT));
        seek.setThumbTintList(ColorStateList.valueOf(Ui.ACCENT));
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean user) {
                inputs.aiPerformance = 30 + p;
                renderScores();
            }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) { saveInputs(); }
        });
        settings.addView(seek);
        settings.addView(text("AI가 실제 소프트웨어 이슈(SWE-bench Verified 류)를 스스로 해결하는 비율을 가정합니다. "
                + "최신 모델 발표에 맞춰 직접 조정하세요.", 11, Ui.SUB, false));
        momentumText = text("", 11, Ui.SUB, false);
        momentumText.setPadding(0, dp(4), 0, 0);
        settings.addView(momentumText);

        // 요인 분석
        LinearLayout detail = card(root, "");
        detailTitle = (TextView) detail.getChildAt(0);
        TextView legend = text("막대: 오른쪽(빨강)은 확률을 올리고, 왼쪽(초록)은 낮추는 요인", 11, Ui.SUB, false);
        legend.setPadding(0, 0, 0, dp(6));
        detail.addView(legend);
        factorList = vbox();
        detail.addView(factorList);

        // 추이
        LinearLayout trend = card(root, "확률 추이 (새로고침 기록)");
        LinearLayout legendRow = new LinearLayout(this);
        legendRow.addView(text("● 한국  ", 12, Ui.KR, true));
        legendRow.addView(text("● 일본", 12, Ui.JP, true));
        trend.addView(legendRow);
        sparkline = new ChartViews.Sparkline(this);
        trend.addView(sparkline, new LinearLayout.LayoutParams(-1, dp(130)));
        trend.addView(text("기록된 뉴스 지수를 현재 조건으로 다시 계산한 값입니다.", 11, Ui.SUB, false));

        // 뉴스
        LinearLayout newsCard = card(root, "");
        newsTitle = (TextView) newsCard.getChildAt(0);
        newsList = vbox();
        newsCard.addView(newsList);

        // 안내
        LinearLayout about = card(root, "계산 방식 / 주의");
        about.addView(text(
                "• 확률 = 시그모이드(기본값 + Σ 요인 기여도)인 로지스틱 모형입니다.\n"
                        + "• 실시간 요소: Google 뉴스 RSS에서 최근 2주 한국어·일본어·영어 기사를 가져와 "
                        + "헤드라인의 위험/완화 키워드를 세고, 최근 기사에 더 큰 가중치를 줍니다.\n"
                        + "• 국가별 도입 속도·인력 부족도·고용 보호 값과 가중치는 공개 통계의 경향을 반영한 가정입니다.\n"
                        + "• '대체'는 해당 조건의 개발자 일자리 상당 부분이 AI로 대체되거나 채용이 크게 줄어드는 상황을 뜻합니다.\n"
                        + "• 재미와 참고용 지표이며, 실제 미래를 예측하지 않습니다.",
                12, Ui.SUB, false));

        return scroll;
    }

    private LinearLayout card(LinearLayout parent, String title) {
        LinearLayout c = vbox();
        c.setPadding(dp(16), dp(14), dp(16), dp(14));
        c.setBackground(round(Ui.CARD, 16, 0));
        TextView t = text(title, 16, Ui.TEXT, true);
        t.setPadding(0, 0, 0, dp(8));
        c.addView(t);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.topMargin = dp(14);
        parent.addView(c, lp);
        return c;
    }

    private View chips(String[] labels, int initial, IntConsumer onPick) {
        HorizontalScrollView hs = new HorizontalScrollView(this);
        hs.setHorizontalScrollBarEnabled(false);
        LinearLayout row = new LinearLayout(this);
        List<TextView> all = new ArrayList<>();
        for (int i = 0; i < labels.length; i++) {
            final int idx = i;
            TextView chip = text(labels[i], 13, Ui.TEXT, false);
            chip.setPadding(dp(12), dp(7), dp(12), dp(7));
            chip.setOnClickListener(v -> {
                for (int j = 0; j < all.size(); j++) styleChip(all.get(j), j == idx);
                onPick.accept(idx);
            });
            styleChip(chip, i == initial);
            all.add(chip);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
            lp.rightMargin = dp(6);
            row.addView(chip, lp);
        }
        hs.addView(row);
        return hs;
    }

    private void styleChip(TextView chip, boolean on) {
        chip.setBackground(round(on ? Ui.ACCENT : Ui.CARD2, 18, 0));
        chip.setTextColor(on ? 0xFF0F1220 : Ui.TEXT);
        chip.setTypeface(null, on ? Typeface.BOLD : Typeface.NORMAL);
    }

    // ── 렌더링 ───────────────────────────────────────────────────────────

    private void render() {
        renderScores();
        renderNews();
        renderStatus();
    }

    private void renderScores() {
        Map<Country, RiskModel.Result> results = new EnumMap<>(Country.class);
        for (Country c : Country.values()) {
            RiskModel.Result r = RiskModel.compute(c, inputs);
            results.put(c, r);
            gauges.get(c).setValue(r.probability, "위험도 " + RiskModel.level(r.probability));
            gaugeCards.get(c).setBackground(round(Ui.CARD, 16,
                    c == selected ? (c == Country.KR ? Ui.KR : Ui.JP) : 0));
        }

        aiLabel.setText("AI 코딩 성능 가정: " + inputs.aiPerformance + "%");
        momentumText.setText(String.format(Locale.KOREA,
                "글로벌 AI 성능 뉴스 모멘텀 %+.2f → 반영 성능 %d%%",
                inputs.aiMomentum, Math.round(RiskModel.effectiveAi(inputs) * 100)));

        RiskModel.Result r = results.get(selected);
        detailTitle.setText(selected.flag + " " + selected.label + " · 요인 분석 (" + r.percent() + "%)");
        factorList.removeAllViews();
        for (RiskModel.Factor f : r.factors) factorList.addView(factorRow(f));
        renderHistory();
    }

    private View factorRow(RiskModel.Factor f) {
        LinearLayout box = vbox();
        box.setPadding(0, dp(6), 0, dp(6));
        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        TextView name = text(f.name, 14, Ui.TEXT, true);
        top.addView(name, new LinearLayout.LayoutParams(dp(104), -2));
        ChartViews.ContributionBar bar = new ChartViews.ContributionBar(this);
        bar.set(f.contribution);
        top.addView(bar, new LinearLayout.LayoutParams(0, dp(14), 1));
        TextView val = text(f.value, 13, Ui.TEXT, false);
        val.setGravity(Gravity.END);
        top.addView(val, new LinearLayout.LayoutParams(dp(92), -2));
        box.addView(top);
        box.addView(text(f.note, 11, Ui.SUB, false));
        return box;
    }

    private void renderNews() {
        News.Feed feed = selected == Country.KR ? News.Feed.KR : News.Feed.JP;
        List<News.Item> items = news.get(feed);
        double idx = selected == Country.KR ? inputs.newsKr : inputs.newsJp;
        newsTitle.setText(String.format(Locale.KOREA, "%s %s 실시간 뉴스 (지수 %+.2f)",
                selected.flag, selected.label, idx));
        newsList.removeAllViews();
        if (items == null || items.isEmpty()) {
            newsList.addView(text(loading ? "불러오는 중…" : "기사를 불러오지 못했습니다. 새로고침을 눌러 주세요.",
                    13, Ui.SUB, false));
            return;
        }
        int up = 0, down = 0;
        for (News.Item it : items) {
            if (it.score() > 0) up++;
            else if (it.score() < 0) down++;
        }
        newsList.addView(text("위험 신호 " + up + "건 · 완화 신호 " + down + "건 · 중립 " + (items.size() - up - down) + "건",
                12, Ui.SUB, false));
        long now = System.currentTimeMillis();
        for (News.Item it : items) {
            LinearLayout row = vbox();
            row.setPadding(0, dp(10), 0, dp(10));
            TextView t = text(it.title, 14, Ui.TEXT, false);
            t.setMaxLines(3);
            t.setEllipsize(TextUtils.TruncateAt.END);
            row.addView(t);
            LinearLayout meta = new LinearLayout(this);
            meta.setGravity(Gravity.CENTER_VERTICAL);
            String src = (it.source.isEmpty() ? "" : it.source + " · ") + ago(it.publishedAt, now);
            meta.addView(text(src, 11, Ui.SUB, false), new LinearLayout.LayoutParams(0, -2, 1));
            int s = it.score();
            TextView tag = text(s > 0 ? "위험 +" + s : s < 0 ? "완화 " + s : "중립", 11,
                    s > 0 ? Ui.RED : s < 0 ? Ui.GREEN : Ui.SUB, true);
            tag.setPadding(dp(8), dp(2), dp(8), dp(2));
            tag.setBackground(round(0x14FFFFFF, 10, 0));
            meta.addView(tag);
            row.addView(meta);
            if (!it.link.isEmpty()) {
                row.setOnClickListener(v -> {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(it.link)));
                    } catch (Exception ignored) {
                        // 브라우저 없음
                    }
                });
            }
            newsList.addView(row);
            View div = new View(this);
            div.setBackgroundColor(0x14FFFFFF);
            newsList.addView(div, new LinearLayout.LayoutParams(-1, 1));
        }
    }

    private void renderHistory() {
        List<double[]> pts = new ArrayList<>();
        String hist = prefs.getString("history", "");
        RiskModel.Inputs tmp = copyInputs();
        for (String e : hist.split(";")) {
            String[] p = e.split(",");
            if (p.length < 4) continue;
            try {
                tmp.newsKr = Double.parseDouble(p[1]);
                tmp.newsJp = Double.parseDouble(p[2]);
                tmp.aiMomentum = Double.parseDouble(p[3]);
            } catch (NumberFormatException ex) {
                continue;
            }
            pts.add(new double[]{
                    RiskModel.compute(Country.KR, tmp).probability,
                    RiskModel.compute(Country.JP, tmp).probability});
        }
        sparkline.set(pts);
    }

    private void renderStatus() {
        refreshBtn.setText(loading ? "불러오는 중…" : "새로고침");
        refreshBtn.setEnabled(!loading);
        StringBuilder sb = new StringBuilder();
        if (lastFetch > 0) {
            sb.append("마지막 업데이트 ")
                    .append(new SimpleDateFormat("M/d HH:mm", Locale.KOREA).format(new Date(lastFetch)));
            int n = 0;
            for (List<News.Item> l : news.values()) n += l.size();
            sb.append(" · 기사 ").append(n).append("건 분석");
        } else {
            sb.append("아직 뉴스를 불러오지 않았습니다 (기본값으로 계산 중)");
        }
        if (lastError != null) sb.append("\n⚠ ").append(lastError);
        status.setText(sb);
    }

    // ── 데이터 ───────────────────────────────────────────────────────────

    private void refresh() {
        if (loading) return;
        loading = true;
        lastError = null;
        render();
        io.execute(() -> {
            Map<News.Feed, List<News.Item>> got = new EnumMap<>(News.Feed.class);
            List<String> failed = new ArrayList<>();
            for (News.Feed f : News.Feed.values()) {
                try {
                    got.put(f, News.fetch(f, MAX_NEWS));
                } catch (Exception e) {
                    failed.add(f == News.Feed.KR ? "한국" : f == News.Feed.JP ? "일본" : "글로벌");
                }
            }
            main.post(() -> onFetched(got, failed));
        });
    }

    private void onFetched(Map<News.Feed, List<News.Item>> got, List<String> failed) {
        if (isFinishing() || isDestroyed()) return;
        loading = false;
        long now = System.currentTimeMillis();
        if (!got.isEmpty()) {
            news.putAll(got);
            if (got.containsKey(News.Feed.KR)) inputs.newsKr = News.index(got.get(News.Feed.KR), now);
            if (got.containsKey(News.Feed.JP)) inputs.newsJp = News.index(got.get(News.Feed.JP), now);
            if (got.containsKey(News.Feed.GLOBAL)) inputs.aiMomentum = News.index(got.get(News.Feed.GLOBAL), now);
            lastFetch = now;
            appendHistory(now);
            saveNews();
        }
        if (!failed.isEmpty()) {
            lastError = TextUtils.join(", ", failed) + " 뉴스를 불러오지 못했습니다"
                    + (got.isEmpty() ? " (인터넷 연결 확인)" : "");
        }
        render();
    }

    private void appendHistory(long now) {
        String entry = String.format(Locale.US, "%d,%.4f,%.4f,%.4f",
                now, inputs.newsKr, inputs.newsJp, inputs.aiMomentum);
        String hist = prefs.getString("history", "");
        List<String> list = new ArrayList<>();
        for (String e : hist.split(";")) if (!e.isEmpty()) list.add(e);
        list.add(entry);
        while (list.size() > MAX_HISTORY) list.remove(0);
        prefs.edit().putString("history", TextUtils.join(";", list)).apply();
    }

    private void loadState() {
        inputs.role = prefs.getInt("role", 0);
        inputs.seniority = prefs.getInt("seniority", 1);
        inputs.horizon = prefs.getInt("horizon", 1);
        inputs.aiPerformance = prefs.getInt("ai", 80);
        inputs.newsKr = prefs.getFloat("newsKr", 0);
        inputs.newsJp = prefs.getFloat("newsJp", 0);
        inputs.aiMomentum = prefs.getFloat("momentum", 0);
        lastFetch = prefs.getLong("lastFetch", 0);
        try {
            selected = Country.valueOf(prefs.getString("country", "KR"));
        } catch (IllegalArgumentException e) {
            selected = Country.KR;
        }
        try {
            JSONObject o = new JSONObject(prefs.getString("news", "{}"));
            for (News.Feed f : News.Feed.values()) {
                JSONArray a = o.optJSONArray(f.name());
                if (a == null) continue;
                List<News.Item> l = new ArrayList<>();
                for (int i = 0; i < a.length(); i++) {
                    JSONObject j = a.getJSONObject(i);
                    News.Item it = new News.Item(j.optString("t"), j.optString("s"), j.optString("l"), j.optLong("p"));
                    News.score(it, f);
                    l.add(it);
                }
                news.put(f, l);
            }
        } catch (Exception ignored) {
            // 캐시 손상 시 무시
        }
    }

    private void saveInputs() {
        prefs.edit()
                .putInt("role", inputs.role)
                .putInt("seniority", inputs.seniority)
                .putInt("horizon", inputs.horizon)
                .putInt("ai", inputs.aiPerformance)
                .apply();
    }

    private void saveNews() {
        try {
            JSONObject o = new JSONObject();
            for (Map.Entry<News.Feed, List<News.Item>> e : news.entrySet()) {
                JSONArray a = new JSONArray();
                for (News.Item it : e.getValue()) {
                    a.put(new JSONObject().put("t", it.title).put("s", it.source)
                            .put("l", it.link).put("p", it.publishedAt));
                }
                o.put(e.getKey().name(), a);
            }
            prefs.edit()
                    .putString("news", o.toString())
                    .putFloat("newsKr", (float) inputs.newsKr)
                    .putFloat("newsJp", (float) inputs.newsJp)
                    .putFloat("momentum", (float) inputs.aiMomentum)
                    .putLong("lastFetch", lastFetch)
                    .apply();
        } catch (Exception ignored) {
            // 저장 실패는 치명적이지 않음
        }
    }

    private RiskModel.Inputs copyInputs() {
        RiskModel.Inputs c = new RiskModel.Inputs();
        c.aiPerformance = inputs.aiPerformance;
        c.role = inputs.role;
        c.seniority = inputs.seniority;
        c.horizon = inputs.horizon;
        return c;
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────

    private static String ago(long t, long now) {
        if (t <= 0) return "";
        long m = Math.max(0, (now - t) / 60_000);
        if (m < 60) return m + "분 전";
        if (m < 60 * 24) return (m / 60) + "시간 전";
        return (m / 60 / 24) + "일 전";
    }

    private LinearLayout vbox() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setLineSpacing(0, 1.15f);
        return t;
    }

    private TextView label(String s) {
        TextView t = text(s, 13, Ui.SUB, true);
        t.setPadding(0, dp(10), 0, dp(6));
        return t;
    }

    private GradientDrawable round(int color, int radiusDp, int strokeColor) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radiusDp));
        if (strokeColor != 0) g.setStroke(dp(2), strokeColor);
        return g;
    }

    private int dp(float v) {
        return Math.round(v * d);
    }
}
