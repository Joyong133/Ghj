package com.joyong.communitydetox;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.Random;

/** The calm "you're on a detox" screen shown instead of a blocked community. */
public class BlockedActivity extends Activity {

    static final String EXTRA_LABEL = "label";
    static final String EXTRA_REASON = "reason";
    static final String REASON_PROTECT = "protect";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextView stats;
    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            updateStats();
            handler.postDelayed(this, 1000);
        }
    };

    private static final String[] IDEAS = {
            "물 한 잔 마시기 💧",
            "창문 열고 심호흡 다섯 번 🌬️",
            "5분 동안 동네 한 바퀴 걷기 🚶",
            "어깨·목 가볍게 스트레칭 🙆",
            "읽던 책 두 페이지 읽기 📖",
            "좋아하는 노래 한 곡 듣기 🎧",
            "미뤄 둔 일 하나만 끝내기 ✅",
            "친구에게 안부 문자 보내기 💌",
            "눈 감고 1분 쉬기 😌",
            "책상 위 3분 정리하기 🧹",
            "오늘 고마웠던 일 하나 적어 보기 📝",
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        render(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        render(intent);
    }

    private void render(Intent intent) {
        Ui ui = new Ui(this);
        String label = intent.getStringExtra(EXTRA_LABEL);
        if (label == null) label = "이 커뮤니티";

        LinearLayout col = ui.column();
        col.setGravity(Gravity.CENTER);

        TextView leaf = ui.text("🌿", 64, ui.text, false);
        leaf.setGravity(Gravity.CENTER);
        col.addView(leaf, Ui.wrap(ui.dp(24)));

        boolean protect = REASON_PROTECT.equals(intent.getStringExtra(EXTRA_REASON));
        if (protect) leaf.setText("🛡️");

        TextView title = ui.text(protect ? "지금은 지우거나 끌 수 없어요" : "잠깐, 디톡스 중이에요", 24, ui.text, true);
        title.setGravity(Gravity.CENTER);
        col.addView(title, Ui.wrap(ui.dp(12)));

        TextView msg = ui.text(protect
                ? "집중 디톡스가 끝날 때까지 커뮤니티 디톡스를\n삭제·강제 중지하거나 접근성·삭제 방지를 끌 수 없어요.\n조금만 더 힘내요!"
                : Ui.topic(label) + " 지금 차단되어 있어요.\n습관처럼 열었다면, 잘 알아챘어요.", 16, ui.sub, false);
        msg.setGravity(Gravity.CENTER);
        col.addView(msg, Ui.wrap(ui.dp(10)));

        LinearLayout idea = ui.card();
        idea.setBackground(ui.rounded(ui.accentSoft, 20));
        idea.addView(ui.text("대신 이건 어때요?", 14, ui.accent, true));
        TextView ideaText = ui.text(IDEAS[new Random().nextInt(IDEAS.length)], 18, ui.text, true);
        idea.addView(ideaText, Ui.wrap(ui.dp(6)));
        idea.setOnClickListener(v -> ideaText.setText(IDEAS[new Random().nextInt(IDEAS.length)]));
        col.addView(idea, Ui.fill(ui.dp(28)));

        stats = ui.text("", 14, ui.sub, false);
        stats.setGravity(Gravity.CENTER);
        col.addView(stats, Ui.wrap(ui.dp(4)));
        updateStats();

        col.addView(ui.button("홈 화면으로", true, v -> goHome()), Ui.fill(ui.dp(28)));
        col.addView(ui.button("디톡스 설정 열기", false, v -> {
            startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            finish();
        }), Ui.fill(ui.dp(10)));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(col);
        ui.applySystemBarPadding(this, scroll, ui.dp(24));
        setContentView(scroll);
    }

    private void updateStats() {
        if (stats == null) return;
        String text = "오늘 " + Prefs.todayBlocks(this) + "번 참았어요 💪 · 디톡스 " + Prefs.detoxDay(this) + "일째";
        if (Prefs.isLocked(this)) {
            text += "\n🔒 집중 디톡스 남은 시간: " + Ui.remaining(Prefs.lockUntil(this) - System.currentTimeMillis());
        }
        stats.setText(text);
    }

    @Override
    protected void onResume() {
        super.onResume();
        handler.post(ticker);
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(ticker);
        super.onPause();
    }

    private void goHome() {
        startActivity(new Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_HOME)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        finish();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        goHome();
    }
}
