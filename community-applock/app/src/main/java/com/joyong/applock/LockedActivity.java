package com.joyong.applock;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Shown instead of a locked app. */
public class LockedActivity extends Activity {

    static final String EXTRA_PKG = "pkg";
    static final String EXTRA_PROTECT = "protect";

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
        if (intent.getBooleanExtra(EXTRA_PROTECT, false)) {
            renderProtect(ui);
            return;
        }
        String pkg = intent.getStringExtra(EXTRA_PKG);
        Store.Locked info = pkg == null ? null : Store.locked(this).get(pkg);
        String label = pkg == null ? "이 앱" : Kinds.label(this, pkg);

        LinearLayout col = ui.column();
        col.setGravity(Gravity.CENTER);
        TextView icon = ui.text("🔒", 60, ui.text, false);
        icon.setGravity(Gravity.CENTER);
        col.addView(icon, Ui.wrap(ui.dp(24)));
        TextView title = ui.text(Ui.topic(label) + " 잠겨 있어요", 22, ui.text, true);
        title.setGravity(Gravity.CENTER);
        col.addView(title, Ui.wrap(ui.dp(12)));
        String why = info == null ? "커뮤니티 앱이라 잠갔어요." : info.reason() + ".";
        TextView msg = ui.text(why + "\n"
                + (Store.isDetox(this) ? "디톡스 시간이 끝나면 ‘커뮤니티 앱 잠금’ 앱에서 풀 수 있어요."
                : "잠금은 ‘커뮤니티 앱 잠금’ 앱에서 풀 수 있어요."), 15, ui.sub, false);
        msg.setGravity(Gravity.CENTER);
        col.addView(msg, Ui.wrap(ui.dp(10)));
        col.addView(ui.button("홈 화면으로", true, v -> goHome()), Ui.fill(ui.dp(28)));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(col);
        ui.applySystemBarPadding(this, scroll, ui.dp(24));
        setContentView(scroll);
    }

    private void renderProtect(Ui ui) {
        LinearLayout col = ui.column();
        col.setGravity(Gravity.CENTER);
        TextView icon = ui.text("⏳", 60, ui.text, false);
        icon.setGravity(Gravity.CENTER);
        col.addView(icon, Ui.wrap(ui.dp(24)));
        TextView title = ui.text("디톡스 시간이에요", 22, ui.text, true);
        title.setGravity(Gravity.CENTER);
        col.addView(title, Ui.wrap(ui.dp(12)));
        TextView msg = ui.text("끝날 때까지 커뮤니티 앱 잠금을 끄거나 지울 수 없어요.\n남은 시간: "
                + Ui.duration(Store.detoxLeft(this)), 15, ui.sub, false);
        msg.setGravity(Gravity.CENTER);
        col.addView(msg, Ui.wrap(ui.dp(10)));
        col.addView(ui.button("홈 화면으로", true, v -> goHome()), Ui.fill(ui.dp(28)));
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(col);
        ui.applySystemBarPadding(this, scroll, ui.dp(24));
        setContentView(scroll);
    }

    private void goHome() {
        startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        finish();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        goHome();
    }
}
