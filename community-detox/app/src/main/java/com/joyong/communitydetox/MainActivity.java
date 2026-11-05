package com.joyong.communitydetox;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

public class MainActivity extends Activity {

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Ui ui;
    private ScrollView scroll;
    private LinearLayout content;
    private TextView lockCountdown;
    private boolean wasLocked;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            boolean locked = Prefs.isLocked(MainActivity.this);
            if (locked != wasLocked) {
                render();
            } else if (locked && lockCountdown != null) {
                lockCountdown.setText("남은 시간  " + Ui.remaining(Prefs.lockUntil(MainActivity.this) - System.currentTimeMillis()));
            }
            handler.postDelayed(this, 1000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ui = new Ui(this);
        content = ui.column();
        scroll = new ScrollView(this);
        scroll.addView(content);
        ui.applySystemBarPadding(this, scroll, ui.dp(16));
        setContentView(scroll);
    }

    @Override
    protected void onResume() {
        super.onResume();
        render();
        handler.post(ticker);
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(ticker);
        super.onPause();
    }

    // ------------------------------------------------------------------ rendering

    private void render() {
        final int y = scroll.getScrollY();
        content.removeAllViews();
        lockCountdown = null;
        wasLocked = Prefs.isLocked(this);

        header();
        permissionCard();
        controlCard();
        focusCard();
        for (String category : Catalog.CATEGORIES) presetCard(category);
        appsCard();
        sitesCard();
        footer();

        scroll.post(() -> scroll.scrollTo(0, y));
    }

    private void header() {
        LinearLayout h = ui.column();
        h.setPadding(ui.dp(4), ui.dp(8), ui.dp(4), ui.dp(16));
        h.addView(ui.text("🌿 커뮤니티 디톡스", 26, ui.text, true));
        h.addView(ui.body("커뮤니티 앱과 사이트를 잠시 멀리하고, 내 시간을 되찾아요."), Ui.wrap(ui.dp(4)));
        content.addView(h);
    }

    private void permissionCard() {
        LinearLayout c = ui.card();
        if (isServiceEnabled()) {
            c.setBackground(ui.rounded(ui.accentSoft, 20));
            c.addView(ui.text("✅ 차단 서비스가 켜져 있어요", 15, ui.accent, true));
            content.addView(c);
            return;
        }
        c.addView(ui.title("먼저 접근성 권한을 켜 주세요"));
        c.addView(ui.body("설정 → 접근성 → 설치된 앱(설치된 서비스) → ‘커뮤니티 디톡스 차단’을 켜면 차단이 시작돼요.\n\n"
                + "지금 열린 앱 이름과 브라우저 주소창만 기기 안에서 확인하며, 아무것도 저장하거나 외부로 보내지 않아요."));
        c.addView(ui.button("접근성 설정 열기", true,
                v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))), Ui.fill(ui.dp(12)));
        TextView hint = ui.body("‘제한된 설정’이라며 켜지지 않나요? (Android 13 이상)\n"
                + "아래 버튼 → 오른쪽 위 ⋮ 메뉴 → ‘제한된 설정 허용’을 누른 뒤 다시 켜 보세요.");
        hint.setTextSize(13);
        c.addView(hint, Ui.wrap(ui.dp(14)));
        c.addView(ui.button("앱 정보 열기", false, v -> startActivity(
                new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())))),
                Ui.fill(ui.dp(8)));
        content.addView(c);
    }

    private void controlCard() {
        boolean locked = Prefs.isLocked(this);
        LinearLayout c = ui.card();

        LinearLayout r = ui.row();
        TextView label = ui.text("차단 켜기", 17, ui.text, true);
        r.addView(label, Ui.weight(0));
        Switch sw = new Switch(this);
        sw.setChecked(Prefs.isBlockingActive(this));
        sw.setEnabled(!locked);
        sw.setOnCheckedChangeListener((b, on) -> {
            Prefs.setMasterOn(this, on);
            Toast.makeText(this, on ? "차단을 켰어요" : "차단을 껐어요", Toast.LENGTH_SHORT).show();
        });
        r.addView(sw);
        c.addView(r);

        if (locked) c.addView(ui.body("집중 디톡스 중에는 끌 수 없어요."), Ui.wrap(ui.dp(2)));

        c.addView(ui.divider());
        LinearLayout stats = ui.row();
        stats.addView(stat(String.valueOf(Prefs.todayBlocks(this)), "오늘 참은 횟수"), Ui.weight(0));
        stats.addView(stat(String.valueOf(Prefs.totalBlocks(this)), "누적"), Ui.weight(ui.dp(8)));
        stats.addView(stat(Prefs.detoxDay(this) + "일째", "디톡스"), Ui.weight(ui.dp(8)));
        c.addView(stats, Ui.fill(ui.dp(4)));
        content.addView(c);
    }

    private LinearLayout stat(String value, String caption) {
        LinearLayout s = ui.column();
        s.setGravity(Gravity.CENTER_HORIZONTAL);
        s.addView(ui.text(value, 22, ui.accent, true));
        s.addView(ui.text(caption, 12, ui.sub, false));
        return s;
    }

    private void focusCard() {
        LinearLayout c = ui.card();
        if (Prefs.isLocked(this)) {
            c.setBackground(ui.rounded(ui.accentSoft, 20));
            c.addView(ui.title("🔒 집중 디톡스 진행 중"));
            lockCountdown = ui.text("남은 시간  " + Ui.remaining(Prefs.lockUntil(this) - System.currentTimeMillis()),
                    20, ui.accent, true);
            c.addView(lockCountdown);
            c.addView(ui.body("끝날 때까지 차단을 끄거나 목록에서 뺄 수 없어요. 새로 추가하는 건 언제든 가능해요."),
                    Ui.wrap(ui.dp(6)));
            c.addView(ui.button("1시간 더 연장", false, v -> confirmLock("1시간", 60L * 60 * 1000)), Ui.fill(ui.dp(12)));
            content.addView(c);
            return;
        }
        c.addView(ui.title("🔒 집중 디톡스"));
        c.addView(ui.body("정한 시간 동안은 차단을 끄거나 목록에서 뺄 수 없게 잠가요. 의지가 약해지는 순간을 막아 줘요."));
        String[] labels = {"1시간", "3시간", "6시간", "하루", "3일", "7일"};
        long hour = 60L * 60 * 1000;
        long[] durations = {hour, 3 * hour, 6 * hour, 24 * hour, 72 * hour, 168 * hour};
        LinearLayout r = null;
        for (int i = 0; i < labels.length; i++) {
            if (i % 3 == 0) {
                r = ui.row();
                c.addView(r, Ui.fill(ui.dp(i == 0 ? 12 : 8)));
            }
            final String l = labels[i];
            final long d = durations[i];
            Button b = ui.button(l, i == 0, v -> confirmLock(l, d));
            r.addView(b, Ui.weight(i % 3 == 0 ? 0 : ui.dp(8)));
        }
        content.addView(c);
    }

    private void confirmLock(String label, long durationMs) {
        new AlertDialog.Builder(this)
                .setTitle(label + " 집중 디톡스")
                .setMessage("시작하면 " + label + " 동안 차단을 끄거나 목록에서 뺄 수 없어요.\n정말 시작할까요?")
                .setPositiveButton("시작", (d, w) -> {
                    Prefs.startLock(this, durationMs);
                    Toast.makeText(this, "집중 디톡스를 시작했어요 🌿", Toast.LENGTH_SHORT).show();
                    render();
                })
                .setNegativeButton("취소", null)
                .show();
    }

    private void presetCard(String category) {
        boolean locked = Prefs.isLocked(this);
        Set<String> on = Prefs.enabledPresets(this);
        List<Catalog.Entry> entries = Catalog.inCategory(category);
        Set<String> ids = new HashSet<>();
        for (Catalog.Entry e : entries) ids.add(e.id);

        LinearLayout c = ui.card();
        LinearLayout head = ui.row();
        head.addView(ui.text(category, 17, ui.text, true), Ui.weight(0));
        Button all = ui.button("전체 켜기", false, v -> {
            Prefs.setPresetsEnabled(this, ids, true);
            render();
        });
        head.addView(all);
        if (!locked) {
            Button none = ui.button("전체 끄기", false, v -> {
                Prefs.setPresetsEnabled(this, ids, false);
                render();
            });
            LinearLayout.LayoutParams lp = Ui.wrap(0);
            lp.leftMargin = ui.dp(6);
            head.addView(none, lp);
        }
        c.addView(head);

        for (Catalog.Entry e : entries) {
            CheckBox cb = checkRow(e.name, e.domainSummary());
            cb.setChecked(on.contains(e.id));
            cb.setOnCheckedChangeListener((b, checked) -> {
                if (!checked && Prefs.isLocked(this)) {
                    b.setChecked(true);
                    lockedToast();
                    return;
                }
                Prefs.setPresetsEnabled(this, Collections.singleton(e.id), checked);
            });
            c.addView(cb, Ui.fill(ui.dp(4)));
        }
        content.addView(c);
    }

    private CheckBox checkRow(String name, String detail) {
        CheckBox cb = new CheckBox(this);
        cb.setTextColor(ui.text);
        cb.setTextSize(15);
        cb.setPadding(ui.dp(8), ui.dp(6), 0, ui.dp(6));
        android.text.SpannableString s = new android.text.SpannableString(name + "\n" + detail);
        s.setSpan(new android.text.style.ForegroundColorSpan(ui.sub), name.length() + 1, s.length(), 0);
        s.setSpan(new android.text.style.RelativeSizeSpan(0.82f), name.length() + 1, s.length(), 0);
        cb.setText(s);
        return cb;
    }

    // ------------------------------------------------------------------ installed apps

    private void appsCard() {
        boolean locked = Prefs.isLocked(this);
        LinearLayout c = ui.card();
        c.addView(ui.title("📱 설치된 앱 직접 차단"));
        c.addView(ui.body("목록에 없는 커뮤니티 앱도 골라서 막을 수 있어요."));
        PackageManager pm = getPackageManager();
        List<String> pkgs = new ArrayList<>(Prefs.customPackages(this));
        Collections.sort(pkgs);
        for (String p : pkgs) {
            c.addView(removableRow(appLabel(pm, p), p, locked, () -> {
                Set<String> s = Prefs.customPackages(this);
                s.remove(p);
                Prefs.setCustomPackages(this, s);
                render();
            }), Ui.fill(ui.dp(6)));
        }
        c.addView(ui.button("앱 고르기", true, v -> pickApps()), Ui.fill(ui.dp(12)));
        content.addView(c);
    }

    private void pickApps() {
        PackageManager pm = getPackageManager();
        Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> infos = pm.queryIntentActivities(launcher, 0);
        TreeSet<String> seen = new TreeSet<>();
        List<String[]> apps = new ArrayList<>(); // {label, package}
        for (ResolveInfo ri : infos) {
            String p = ri.activityInfo.packageName;
            if (p.equals(getPackageName()) || !seen.add(p)) continue;
            apps.add(new String[]{ri.loadLabel(pm).toString(), p});
        }
        Collections.sort(apps, (a, b) -> a[0].compareToIgnoreCase(b[0]));

        Set<String> current = Prefs.customPackages(this);
        String[] labels = new String[apps.size()];
        boolean[] checked = new boolean[apps.size()];
        for (int i = 0; i < apps.size(); i++) {
            labels[i] = apps.get(i)[0];
            checked[i] = current.contains(apps.get(i)[1]);
        }
        new AlertDialog.Builder(this)
                .setTitle("차단할 앱 고르기")
                .setMultiChoiceItems(labels, checked, (d, which, isChecked) -> checked[which] = isChecked)
                .setPositiveButton("저장", (d, w) -> {
                    Set<String> next = new HashSet<>();
                    for (int i = 0; i < apps.size(); i++) if (checked[i]) next.add(apps.get(i)[1]);
                    if (Prefs.isLocked(this) && !next.containsAll(current)) {
                        next.addAll(current);
                        lockedToast();
                    }
                    Prefs.setCustomPackages(this, next);
                    render();
                })
                .setNegativeButton("취소", null)
                .show();
    }

    private static String appLabel(PackageManager pm, String pkg) {
        try {
            return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (PackageManager.NameNotFoundException e) {
            return pkg;
        }
    }

    // ------------------------------------------------------------------ custom sites

    private void sitesCard() {
        boolean locked = Prefs.isLocked(this);
        LinearLayout c = ui.card();
        c.addView(ui.title("🌐 사이트 직접 추가"));
        c.addView(ui.body("주소를 넣으면 하위 주소까지 함께 막아요. 예: example.com → m.example.com도 차단"));

        LinearLayout r = ui.row();
        EditText input = new EditText(this);
        input.setHint("예: example.com");
        input.setSingleLine(true);
        input.setTextColor(ui.text);
        input.setHintTextColor(ui.sub);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setImeOptions(EditorInfo.IME_ACTION_DONE);
        r.addView(input, Ui.weight(0));
        Runnable add = () -> {
            String host = Prefs.hostOf(input.getText().toString());
            if (host == null) {
                Toast.makeText(this, "올바른 주소를 입력해 주세요 (예: example.com)", Toast.LENGTH_SHORT).show();
                return;
            }
            Prefs.addCustomDomain(this, host);
            Toast.makeText(this, host + " 차단 목록에 추가했어요", Toast.LENGTH_SHORT).show();
            render();
        };
        input.setOnEditorActionListener((v, id, ev) -> {
            add.run();
            return true;
        });
        LinearLayout.LayoutParams lp = Ui.wrap(0);
        lp.leftMargin = ui.dp(8);
        r.addView(ui.button("추가", true, v -> add.run()), lp);
        c.addView(r, Ui.fill(ui.dp(8)));

        List<String> domains = new ArrayList<>(Prefs.customDomains(this));
        Collections.sort(domains);
        for (String d : domains) {
            c.addView(removableRow(d, null, locked, () -> {
                Prefs.removeCustomDomain(this, d);
                render();
            }), Ui.fill(ui.dp(6)));
        }
        content.addView(c);
    }

    private LinearLayout removableRow(String name, String detail, boolean locked, Runnable onRemove) {
        LinearLayout r = ui.row();
        r.setBackground(ui.rounded(ui.accentSoft, 12));
        r.setPadding(ui.dp(12), ui.dp(6), ui.dp(6), ui.dp(6));
        LinearLayout texts = ui.column();
        texts.addView(ui.text(name, 15, ui.text, true));
        if (detail != null) texts.addView(ui.text(detail, 12, ui.sub, false));
        r.addView(texts, Ui.weight(0));
        Button x = ui.button("✕", false, v -> {
            if (Prefs.isLocked(this)) {
                lockedToast();
                return;
            }
            onRemove.run();
        });
        x.setBackground(null);
        x.setAlpha(locked ? 0.35f : 1f);
        r.addView(x);
        return r;
    }

    private void footer() {
        TextView t = ui.body("ℹ️ 크롬, 삼성 인터넷, 웨일, 엣지, 파이어폭스, 오페라, 브레이브 등 브라우저의 주소창을 확인해 차단해요. "
                + "다른 앱 속에 열리는 내장 브라우저는 막히지 않을 수 있어요.\n\n"
                + "스스로를 돕는 도구예요. 휴대폰 설정에서 접근성 권한을 끄면 차단도 멈춰요.");
        t.setTextSize(12);
        t.setPadding(ui.dp(4), ui.dp(4), ui.dp(4), ui.dp(24));
        content.addView(t);
    }

    // ------------------------------------------------------------------ helpers

    private void lockedToast() {
        Toast.makeText(this, "집중 디톡스 중에는 뺄 수 없어요 🔒", Toast.LENGTH_SHORT).show();
    }

    private boolean isServiceEnabled() {
        String enabled = Settings.Secure.getString(getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabled == null) return false;
        ComponentName me = new ComponentName(this, DetoxAccessibilityService.class);
        for (String s : enabled.split(":")) {
            ComponentName cn = ComponentName.unflattenFromString(s);
            if (me.equals(cn)) return true;
        }
        return false;
    }
}
