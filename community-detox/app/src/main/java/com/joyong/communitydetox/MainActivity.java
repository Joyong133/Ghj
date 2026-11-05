package com.joyong.communitydetox;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.app.TimePickerDialog;
import android.app.admin.DevicePolicyManager;
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
import android.widget.NumberPicker;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;

public class MainActivity extends Activity {

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Ui ui;
    private ScrollView scroll;
    private LinearLayout content;
    private TextView lockCountdown;
    private TextView pauseCountdown;
    private String lastState;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            if (!lockState().equals(lastState)) {
                render();
            } else {
                if (lockCountdown != null) {
                    lockCountdown.setText("남은 시간  " + Ui.remaining(Prefs.lockRemaining(MainActivity.this)));
                }
                if (pauseCountdown != null) {
                    pauseCountdown.setText("⏸ 일시정지 남은 시간  "
                            + Ui.remaining(Prefs.pauseUntil(MainActivity.this) - System.currentTimeMillis()));
                }
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

    /** Changes when the lock starts/ends or a pause starts/ends, so the screen is rebuilt. */
    private String lockState() {
        return Prefs.isLocked(this) + "/" + Prefs.isPaused(this);
    }

    private void render() {
        final int y = scroll.getScrollY();
        content.removeAllViews();
        lockCountdown = null;
        pauseCountdown = null;
        lastState = lockState();

        header();
        permissionCard();
        controlCard();
        focusCard();
        protectCard();
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

    private static final long MINUTE = 60L * 1000;
    private static final long HOUR = 60 * MINUTE;
    private static final long DAY = 24 * HOUR;
    private static final int MAX_DAYS = 99;

    private void focusCard() {
        LinearLayout c = ui.card();
        if (Prefs.isLocked(this)) {
            long until = Prefs.lockUntil(this);
            c.setBackground(ui.rounded(ui.accentSoft, 20));
            boolean paused = Prefs.isPaused(this);
            c.addView(ui.title(paused ? "⏸ 집중 디톡스 일시정지 중" : "🔒 집중 디톡스 진행 중"));
            lockCountdown = ui.text("남은 시간  " + Ui.remaining(Prefs.lockRemaining(this)),
                    20, ui.accent, true);
            c.addView(lockCountdown);
            c.addView(ui.body("끝나는 시각: " + formatTime(until)), Ui.wrap(ui.dp(4)));
            c.addView(ui.body("끝날 때까지 차단을 끄거나 목록에서 뺄 수 없어요. 새로 추가하는 건 언제든 가능해요."),
                    Ui.wrap(ui.dp(6)));
            pauseSection(c);
            c.addView(ui.text("연장하기", 14, ui.text, true), Ui.wrap(ui.dp(14)));
            buttonGrid(c, new String[]{"+10분", "+30분", "+1시간", "+3시간", "+1일", "+3일"},
                    new long[]{10 * MINUTE, 30 * MINUTE, HOUR, 3 * HOUR, DAY, 3 * DAY}, true);
            c.addView(ui.button("⏱ 연장 시간 직접 정하기", true, v -> showCustomLockDialog(true)), Ui.fill(ui.dp(8)));
            content.addView(c);
            return;
        }
        c.addView(ui.title("🔒 집중 디톡스"));
        c.addView(ui.body("정한 시간 동안은 차단을 끄거나 목록에서 뺄 수 없게 잠가요. 의지가 약해지는 순간을 막아 줘요."));
        buttonGrid(c, new String[]{"30분", "1시간", "3시간", "6시간", "하루", "7일"},
                new long[]{30 * MINUTE, HOUR, 3 * HOUR, 6 * HOUR, DAY, 7 * DAY}, false);
        c.addView(ui.button("⏱ 시간 직접 정하기", true, v -> showCustomLockDialog(false)), Ui.fill(ui.dp(8)));
        content.addView(c);
    }

    /** One-time pause per focus detox: blocking off for a while, focus timer stopped meanwhile. */
    private void pauseSection(LinearLayout c) {
        c.addView(ui.divider(), Ui.fill(ui.dp(10)));
        if (Prefs.isPaused(this)) {
            pauseCountdown = ui.text("⏸ 일시정지 남은 시간  "
                    + Ui.remaining(Prefs.pauseUntil(this) - System.currentTimeMillis()), 16, ui.text, true);
            c.addView(pauseCountdown);
            c.addView(ui.body("지금은 커뮤니티가 차단되지 않아요. 일시정지 동안 디톡스 시간은 멈춰 있어요."),
                    Ui.wrap(ui.dp(4)));
            c.addView(ui.button("▶ 지금 바로 다시 시작", true, v -> {
                Prefs.endPauseNow(this);
                Toast.makeText(this, "다시 시작했어요 🌿", Toast.LENGTH_SHORT).show();
                render();
            }), Ui.fill(ui.dp(10)));
            return;
        }
        if (Prefs.pauseUsed(this)) {
            c.addView(ui.body("⏸ 일시정지는 이번 집중 디톡스에서 이미 사용했어요."));
            return;
        }
        c.addView(ui.text("⏸ 일시정지 (1회)", 14, ui.text, true));
        c.addView(ui.body("이번 집중 디톡스에서 딱 한 번, 잠깐 차단을 풀 수 있어요. 그동안 디톡스 시간은 멈춰요."),
                Ui.wrap(ui.dp(4)));
        String[] labels = {"5분", "10분", "15분", "30분"};
        long[] durations = {5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE};
        LinearLayout r = ui.row();
        for (int i = 0; i < labels.length; i++) {
            final String l = labels[i];
            final long d = durations[i];
            r.addView(ui.button(l, false, v -> confirmPause(l, d)), Ui.weight(i == 0 ? 0 : ui.dp(6)));
        }
        c.addView(r, Ui.fill(ui.dp(10)));
    }

    private void confirmPause(String label, long durationMs) {
        new AlertDialog.Builder(this)
                .setTitle(label + " 일시정지")
                .setMessage("일시정지는 이번 집중 디톡스에서 1번만 쓸 수 있어요.\n"
                        + label + " 동안 차단이 풀리고, 디톡스 끝나는 시각도 " + label + " 늦춰져요.\n"
                        + "(삭제 방지는 계속 켜져 있어요)\n\n정말 쉬어 갈까요?")
                .setPositiveButton("일시정지", (d, w) -> {
                    if (Prefs.startPause(this, durationMs)) {
                        Toast.makeText(this, label + " 동안 쉬어 가요 ⏸", Toast.LENGTH_SHORT).show();
                    }
                    render();
                })
                .setNegativeButton("취소", null)
                .show();
    }

    private void protectCard() {
        boolean locked = Prefs.isLocked(this);
        boolean admin = isAdminActive();
        LinearLayout c = ui.card();
        c.addView(ui.title("🛡️ 삭제 방지"));
        c.addView(ui.body("켜 두면 이 앱을 바로 지울 수 없어요. 집중 디톡스 중에는 앱 삭제, 강제 중지, "
                + "접근성 끄기, 삭제 방지 끄기 화면이 열리면 바로 닫아요."));
        if (!admin) {
            c.addView(ui.button("삭제 방지 켜기", true, v -> {
                Prefs.allowAdminSetup(this);
                Intent i = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
                        .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent())
                        .putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                                "켜 두면 커뮤니티 디톡스를 바로 지울 수 없어요. 기기를 잠그거나 지우는 등 다른 권한은 쓰지 않아요.");
                try {
                    startActivity(i);
                } catch (RuntimeException e) {
                    Toast.makeText(this, "이 기기에서는 삭제 방지를 켤 수 없어요", Toast.LENGTH_SHORT).show();
                }
            }), Ui.fill(ui.dp(12)));
            if (locked) {
                c.addView(ui.body("집중 디톡스 중에도 접근성 감시가 이 앱의 삭제 화면을 막고 있어요."), Ui.wrap(ui.dp(8)));
            }
        } else {
            TextView on = ui.text("✅ 삭제 방지가 켜져 있어요", 15, ui.accent, true);
            c.addView(on, Ui.wrap(ui.dp(10)));
            if (locked) {
                c.addView(ui.body("집중 디톡스가 끝나면 끌 수 있어요."), Ui.wrap(ui.dp(4)));
            } else {
                c.addView(ui.body("앱을 지우려면 먼저 아래 버튼으로 삭제 방지를 끄세요."), Ui.wrap(ui.dp(4)));
                c.addView(ui.button("삭제 방지 끄기", false, v -> new AlertDialog.Builder(this)
                        .setTitle("삭제 방지를 끌까요?")
                        .setMessage("끄면 이 앱을 바로 지울 수 있게 돼요.")
                        .setPositiveButton("끄기", (d, w) -> {
                            DevicePolicyManager dpm = (DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);
                            dpm.removeActiveAdmin(adminComponent());
                            Toast.makeText(this, "삭제 방지를 껐어요", Toast.LENGTH_SHORT).show();
                            handler.postDelayed(this::render, 500);
                        })
                        .setNegativeButton("취소", null)
                        .show()), Ui.fill(ui.dp(10)));
            }
        }
        content.addView(c);
    }

    private ComponentName adminComponent() {
        return new ComponentName(this, DetoxAdminReceiver.class);
    }

    private boolean isAdminActive() {
        DevicePolicyManager dpm = (DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);
        return dpm != null && dpm.isAdminActive(adminComponent());
    }

    /** Rows of 3 quick buttons. Each starts (or extends) the lock by its duration. */
    private void buttonGrid(LinearLayout parent, String[] labels, long[] durations, boolean extending) {
        LinearLayout r = null;
        for (int i = 0; i < labels.length; i++) {
            if (i % 3 == 0) {
                r = ui.row();
                parent.addView(r, Ui.fill(ui.dp(i == 0 ? 10 : 8)));
            }
            final long d = durations[i];
            Button b = ui.button(labels[i], false, v -> confirmLock(baseTime(extending) + d, extending));
            r.addView(b, Ui.weight(i % 3 == 0 ? 0 : ui.dp(8)));
        }
    }

    /** Extensions add on top of the current end time; new locks start now. */
    private long baseTime(boolean extending) {
        long now = System.currentTimeMillis();
        return extending ? Math.max(now, Prefs.lockUntil(this)) : now;
    }

    /** Pick days / hours / minutes, or an exact end date and time. */
    private void showCustomLockDialog(boolean extending) {
        LinearLayout box = ui.column();
        box.setPadding(ui.dp(20), ui.dp(8), ui.dp(20), 0);

        LinearLayout pickers = ui.row();
        pickers.setGravity(Gravity.CENTER);
        NumberPicker days = numberPicker(0, MAX_DAYS, 0);
        NumberPicker hours = numberPicker(0, 23, extending ? 1 : 2);
        NumberPicker minutes = numberPicker(0, 59, 0);
        pickers.addView(pickerColumn(days, "일"));
        pickers.addView(pickerColumn(hours, "시간"));
        pickers.addView(pickerColumn(minutes, "분"));
        box.addView(pickers);

        TextView preview = ui.text("", 15, ui.accent, true);
        preview.setGravity(Gravity.CENTER);
        box.addView(preview, Ui.fill(ui.dp(8)));

        final long[] exactUntil = {0}; // set when an exact date/time is chosen
        Runnable update = () -> {
            long until = exactUntil[0] > 0 ? exactUntil[0] : baseTime(extending)
                    + days.getValue() * DAY + hours.getValue() * HOUR + minutes.getValue() * MINUTE;
            long added = until - baseTime(extending);
            preview.setText(added <= 0 ? "시간을 정해 주세요"
                    : (extending ? "+" + Ui.duration(added) + " 연장" : Ui.duration(added) + " 동안")
                    + "\n끝나는 시각: " + formatTime(until));
        };
        NumberPicker.OnValueChangeListener onChange = (p, o, n) -> {
            exactUntil[0] = 0;
            update.run();
        };
        days.setOnValueChangedListener(onChange);
        hours.setOnValueChangedListener(onChange);
        minutes.setOnValueChangedListener(onChange);
        update.run();

        box.addView(ui.button("📅 끝나는 날짜·시각으로 정하기", false, v -> pickExactTime(extending, until -> {
            exactUntil[0] = until;
            update.run();
        })), Ui.fill(ui.dp(12)));

        new AlertDialog.Builder(this)
                .setTitle(extending ? "연장 시간 정하기" : "집중 디톡스 시간 정하기")
                .setView(box)
                .setPositiveButton("다음", (d, w) -> {
                    long until = exactUntil[0] > 0 ? exactUntil[0] : baseTime(extending)
                            + days.getValue() * DAY + hours.getValue() * HOUR + minutes.getValue() * MINUTE;
                    if (until - baseTime(extending) < MINUTE) {
                        Toast.makeText(this, extending ? "지금 끝나는 시각보다 뒤로 정해 주세요" : "1분 이상으로 정해 주세요",
                                Toast.LENGTH_SHORT).show();
                        return;
                    }
                    confirmLock(until, extending);
                })
                .setNegativeButton("취소", null)
                .show();
    }

    private interface TimeChosen {
        void onChosen(long untilMs);
    }

    private void pickExactTime(boolean extending, TimeChosen done) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(baseTime(extending) + HOUR);
        DatePickerDialog dp = new DatePickerDialog(this, (view, y, m, d) -> {
            cal.set(y, m, d);
            new TimePickerDialog(this, (tv, h, min) -> {
                cal.set(Calendar.HOUR_OF_DAY, h);
                cal.set(Calendar.MINUTE, min);
                cal.set(Calendar.SECOND, 0);
                cal.set(Calendar.MILLISECOND, 0);
                if (cal.getTimeInMillis() - baseTime(extending) < MINUTE) {
                    Toast.makeText(this, extending ? "지금 끝나는 시각보다 뒤로 정해 주세요" : "지금보다 뒤의 시각을 골라 주세요",
                            Toast.LENGTH_SHORT).show();
                    return;
                }
                done.onChosen(cal.getTimeInMillis());
            }, cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE), false).show();
        }, cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH));
        dp.getDatePicker().setMinDate(System.currentTimeMillis() - 1000);
        dp.getDatePicker().setMaxDate(System.currentTimeMillis() + MAX_DAYS * DAY);
        dp.show();
    }

    private NumberPicker numberPicker(int min, int max, int value) {
        NumberPicker p = new NumberPicker(this);
        p.setMinValue(min);
        p.setMaxValue(max);
        p.setValue(value);
        p.setWrapSelectorWheel(false);
        p.setDescendantFocusability(NumberPicker.FOCUS_BLOCK_DESCENDANTS);
        return p;
    }

    private LinearLayout pickerColumn(NumberPicker p, String unit) {
        LinearLayout col = ui.column();
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        col.setPadding(ui.dp(10), 0, ui.dp(10), 0);
        col.addView(p);
        col.addView(ui.text(unit, 14, ui.sub, true));
        return col;
    }

    private static String formatTime(long ms) {
        return new SimpleDateFormat("M월 d일 (E) a h:mm", Locale.KOREAN).format(new Date(ms));
    }

    private void confirmLock(long untilMs, boolean extending) {
        long added = untilMs - baseTime(extending);
        String what = extending ? Ui.duration(added) + " 연장" : Ui.duration(added) + " 집중 디톡스";
        new AlertDialog.Builder(this)
                .setTitle(what)
                .setMessage("끝나는 시각: " + formatTime(untilMs) + "\n\n그때까지 차단을 끄거나 목록에서 뺄 수 없어요.\n"
                        + (extending ? "연장할까요?" : "정말 시작할까요?"))
                .setPositiveButton(extending ? "연장" : "시작", (d, w) -> {
                    Prefs.lockUntilAtLeast(this, untilMs);
                    Toast.makeText(this, extending ? "연장했어요 · " + formatTime(untilMs) + "까지"
                            : "집중 디톡스를 시작했어요 🌿", Toast.LENGTH_SHORT).show();
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
        t.setPadding(ui.dp(4), ui.dp(4), ui.dp(4), ui.dp(16));
        content.addView(t);

        LinearLayout c = ui.card();
        c.addView(ui.title("⬇️ 앱 업데이트"));
        c.addView(ui.body("지금 버전: " + versionName() + "\n"
                + "버튼을 누르면 최신 APK를 받아요. 받은 파일을 열어 설치하면 설정과 기록을 그대로 둔 채 업데이트돼요."));
        c.addView(ui.button("최신 버전 받기", false, v -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(UPDATE_URL)));
            } catch (RuntimeException e) {
                Toast.makeText(this, "브라우저를 열 수 없어요", Toast.LENGTH_SHORT).show();
            }
        }), Ui.fill(ui.dp(12)));
        LinearLayout.LayoutParams lp = Ui.fill(0);
        lp.bottomMargin = ui.dp(24);
        content.addView(c, lp);
    }

    private static final String UPDATE_URL =
            "https://github.com/Joyong133/Ghj/releases/download/community-detox-latest/CommunityDetox.apk";

    private String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "?";
        }
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
