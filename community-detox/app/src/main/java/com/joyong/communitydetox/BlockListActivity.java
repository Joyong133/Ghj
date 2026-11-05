package com.joyong.communitydetox;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Bundle;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;

/** "차단 목록" menu: every blocked community, custom site and app, with search. */
public class BlockListActivity extends Activity {

    private Ui ui;
    private ScrollView scroll;
    private LinearLayout content;
    private TextView summary;
    private String query = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ui = new Ui(this);
        LinearLayout root = ui.column();

        LinearLayout bar = ui.row();
        Button back = ui.button("←", false, v -> finish());
        bar.addView(back);
        LinearLayout.LayoutParams tlp = Ui.weight(ui.dp(12));
        bar.addView(ui.text("📋 차단 목록", 22, ui.text, true), tlp);
        root.addView(bar);

        summary = ui.text("", 14, ui.accent, true);
        root.addView(summary, Ui.fill(ui.dp(10)));

        EditText search = new EditText(this);
        search.setHint("🔍 커뮤니티 이름이나 주소로 찾기");
        search.setSingleLine(true);
        search.setTextColor(ui.text);
        search.setHintTextColor(ui.sub);
        search.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void afterTextChanged(Editable s) {
                query = s.toString().trim().toLowerCase(Locale.ROOT);
                render();
            }
        });
        root.addView(search, Ui.fill(ui.dp(6)));

        content = ui.column();
        scroll = new ScrollView(this);
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        ui.applySystemBarPadding(this, root, ui.dp(16));
        setContentView(root);
    }

    @Override
    protected void onResume() {
        super.onResume();
        render();
    }

    private void render() {
        final int y = scroll.getScrollY();
        content.removeAllViews();
        updateSummary();
        if (Prefs.isLocked(this)) {
            LinearLayout c = ui.card();
            c.setBackground(ui.rounded(ui.accentSoft, 20));
            c.addView(ui.text("🔒 집중 디톡스 중에는 목록에서 뺄 수 없어요. 추가는 언제든 돼요.", 14, ui.accent, true));
            content.addView(c, Ui.fill(ui.dp(8)));
        }
        appScreensCard();
        for (String category : Catalog.CATEGORIES) presetCard(category);
        appsCard();
        sitesCard();
        if (content.getChildCount() == 0 || (Prefs.isLocked(this) && content.getChildCount() == 1)) {
            TextView none = ui.body("'" + query + "'에 맞는 항목이 없어요. 아래 '사이트 직접 추가'로 넣을 수 있어요.");
            none.setGravity(Gravity.CENTER);
            content.addView(none, Ui.fill(ui.dp(24)));
        }
        scroll.post(() -> scroll.scrollTo(0, y));
    }

    private void updateSummary() {
        Set<String> on = Prefs.enabledPresets(this);
        int presets = 0;
        for (Catalog.Entry e : Catalog.ALL) if (on.contains(e.id)) presets++;
        summary.setText("지금 차단 중: 커뮤니티 " + presets + "곳 + 직접 추가 " + Prefs.customDomains(this).size()
                + "곳 · 앱 " + Prefs.customPackages(this).size() + "개");
    }

    /** Screens inside apps that are otherwise allowed (Toss → only 토스증권). */
    private void appScreensCard() {
        if (!matches("토스증권 토스 증권 주식", "tossinvest.com")) return;
        boolean locked = Prefs.isLocked(this);
        boolean on = Prefs.isTossInvestBlocked(this);
        LinearLayout c = ui.card();
        c.addView(ui.title("📱 앱 속 화면 막기"));
        LinearLayout r = ui.row();
        LinearLayout texts = ui.column();
        texts.addView(ui.text("토스 앱의 토스증권 막기", 15, ui.text, true));
        texts.addView(ui.text("증권 탭·주식 화면만 막고, 송금·결제 등은 그대로 · tossinvest.com 포함", 12, ui.sub, false));
        r.addView(texts, Ui.weight(0));
        android.widget.Switch sw = new android.widget.Switch(this);
        sw.setChecked(on);
        sw.setEnabled(!(locked && on)); // during a focus lock it can be turned on, not off
        sw.setOnCheckedChangeListener((b, checked) -> {
            if (!checked && Prefs.isLocked(this)) {
                b.setChecked(true);
                lockedToast();
                return;
            }
            Prefs.setTossInvestBlocked(this, checked);
            Toast.makeText(this, checked ? "토스증권을 막아요" : "토스증권 막기를 껐어요", Toast.LENGTH_SHORT).show();
        });
        r.addView(sw);
        c.addView(r, Ui.fill(ui.dp(8)));
        content.addView(c);
    }

    /** Matches the search text against a name and its addresses. */
    private boolean matches(String name, String detail) {
        if (query.isEmpty()) return true;
        return name.toLowerCase(Locale.ROOT).contains(query)
                || (detail != null && detail.toLowerCase(Locale.ROOT).contains(query));
    }

    private void lockedToast() {
        Toast.makeText(this, "집중 디톡스 중에는 뺄 수 없어요 🔒", Toast.LENGTH_SHORT).show();
    }

    private void presetCard(String category) {
        boolean locked = Prefs.isLocked(this);
        Set<String> on = Prefs.enabledPresets(this);
        List<Catalog.Entry> entries = new ArrayList<>();
        for (Catalog.Entry e : Catalog.inCategory(category)) if (matches(e.name, e.domainSummary())) entries.add(e);
        if (entries.isEmpty()) return;
        Set<String> ids = new HashSet<>();
        for (Catalog.Entry e : entries) ids.add(e.id);

        LinearLayout c = ui.card();
        LinearLayout head = ui.row();
        int count = 0;
        for (Catalog.Entry e : entries) if (on.contains(e.id)) count++;
        head.addView(ui.text(category + "  " + count + "/" + entries.size(), 17, ui.text, true), Ui.weight(0));
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
                updateSummary();
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
            if (!matches(appLabel(pm, p), p)) continue;
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
        List<ResolveInfo> infos = new ArrayList<>(pm.queryIntentActivities(launcher, 0));
        // VR games / apps on Meta Quest are listed under their own launcher category.
        infos.addAll(pm.queryIntentActivities(
                new Intent(Intent.ACTION_MAIN).addCategory("com.oculus.intent.category.VR"), 0));
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
            if (!matches(d, "")) continue;
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

}
