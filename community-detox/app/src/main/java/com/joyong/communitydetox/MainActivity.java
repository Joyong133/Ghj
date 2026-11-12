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
        ensureVpn();
        if (installAfterPermission && AppUpdater.canInstall(this)) {
            installAfterPermission = false;
            installUpdate();
        } else if (System.currentTimeMillis() - lastUpdateCheck > 6 * 60 * 60 * 1000L) {
            checkUpdate(false); // quietly look for a new version a few times a day
        }
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
        updateCard(true);
        if (BuildConfig.IS_VR) {
            readerCard();   // 모아읽기: read a few boards only here
            vpnCard();      // VR: VPN is the way it blocks
            vrSetupCard();
        } else {
            permissionCard();
            vpnCard();      // phones: optional extra
        }
        controlCard();
        if (!BuildConfig.IS_VR) readerCard(); // 모아읽기 on phones too
        blockListCard();
        installBlockCard();
        focusCard();
        protectCard();
        inAppCard();
        footer();

        scroll.post(() -> scroll.scrollTo(0, y));
    }

    private void header() {
        LinearLayout h = ui.column();
        h.setPadding(ui.dp(4), ui.dp(8), ui.dp(4), ui.dp(16));
        h.addView(ui.text("🌿 Digital Detox", 26, ui.text, true));
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
        c.addView(ui.body("설정 → 접근성 → 설치된 앱(설치된 서비스) → ‘Digital Detox 차단’을 켜면 차단이 시작돼요.\n\n"
                + "지금 열린 앱 이름과 브라우저 주소창만 기기 안에서 확인하며, 아무것도 저장하거나 외부로 보내지 않아요."));
        c.addView(ui.button("접근성 설정 열기", true, v -> openAccessibilitySettings()), Ui.fill(ui.dp(12)));
        TextView hint = ui.body("‘제한된 설정’이라며 켜지지 않나요? (Android 13 이상)\n"
                + "아래 버튼 → 오른쪽 위 ⋮ 메뉴 → ‘제한된 설정 허용’을 누른 뒤 다시 켜 보세요.");
        hint.setTextSize(13);
        c.addView(hint, Ui.wrap(ui.dp(14)));
        c.addView(ui.button("앱 정보 열기", false, v -> openAppInfo()), Ui.fill(ui.dp(8)));
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

    // ------------------------------------------------------------------ network (VPN / DNS) blocking

    private static final int REQ_VPN = 41;
    private boolean vpnAsked;

    /** If network blocking should be on but isn't running, start it — asking for VPN permission first if needed. */
    private void ensureVpn() {
        if (!Prefs.isVpnOn(this) || DetoxVpnService.running) return;
        Intent consent = android.net.VpnService.prepare(this);
        if (consent == null) {
            DetoxVpnService.start(this);
            handler.postDelayed(this::render, 1200);
        } else if (!vpnAsked) {
            vpnAsked = true; // once per visit, so declining doesn't loop
            requestVpnPermission(consent);
        }
    }

    private void requestVpnPermission(Intent consent) {
        try {
            startActivityForResult(consent, REQ_VPN); // Android asks once: "allow this VPN connection?"
        } catch (RuntimeException e) {
            if (!BuildConfig.IS_VR) Prefs.setVpnOn(this, false);
            Toast.makeText(this, BuildConfig.IS_VR
                    ? "VPN 허용 창을 열 수 없어요. 아래 '허용 창이 안 뜨면' 명령을 한 번 실행해 주세요"
                    : "이 기기에서는 VPN 허용 창을 열 수 없어서 네트워크 차단을 쓸 수 없어요", Toast.LENGTH_LONG).show();
            render();
        }
    }

    private void vpnCard() {
        boolean locked = Prefs.isLocked(this);
        boolean on = Prefs.isVpnOn(this);
        LinearLayout c = ui.card();
        c.addView(ui.title(BuildConfig.IS_VR ? "🌐 커뮤니티 차단 (VPN)" : "🌐 네트워크 차단 (VPN 방식) · 선택"));
        c.addView(ui.body("기기 전체에서 커뮤니티 주소를 찾지 못하게 막아요. 모든 브라우저"
                + (BuildConfig.IS_VR ? "(퀘스트 브라우저 포함)" : "") + ", 카카오톡 인앱 브라우저, 다른 앱 속 링크까지 적용돼요.\n"
                + "주소 확인(DNS)만 이 기능을 거치고 다른 인터넷 통신은 그대로예요. 기록하거나 외부로 보내지 않아요."));

        LinearLayout r = ui.row();
        LinearLayout texts = ui.column();
        texts.addView(ui.text("네트워크 차단 켜기", 15, ui.text, true));
        boolean needsPermission = on && !DetoxVpnService.running && android.net.VpnService.prepare(this) != null;
        String state = !on ? "꺼져 있어요"
                : DetoxVpnService.running ? "✅ 작동 중 (상단에 열쇠 아이콘이 보여요)"
                : needsPermission ? "⚠️ VPN 연결을 허용해야 작동해요" : "켜는 중…";
        texts.addView(ui.text(state, 12, ui.sub, false));
        r.addView(texts, Ui.weight(0));
        Switch sw = new Switch(this);
        sw.setChecked(on);
        sw.setEnabled(!(locked && on));
        sw.setOnCheckedChangeListener((b, checked) -> {
            if (!checked && Prefs.isLocked(this)) {
                b.setChecked(true);
                lockedToast();
                return;
            }
            if (checked) {
                Intent consent = android.net.VpnService.prepare(this);
                if (consent != null) {
                    requestVpnPermission(consent);
                    return;
                }
                Prefs.setVpnOn(this, true);
                DetoxVpnService.start(this);
            } else {
                Prefs.setVpnOn(this, false);
                DetoxVpnService.stop(this);
            }
            handler.postDelayed(this::render, 800);
        });
        r.addView(sw);
        c.addView(r, Ui.fill(ui.dp(12)));
        if (needsPermission) {
            c.addView(ui.button("VPN 연결 허용하기", true, v -> {
                Intent consent = android.net.VpnService.prepare(this);
                if (consent != null) requestVpnPermission(consent);
                else ensureVpn();
            }), Ui.fill(ui.dp(10)));
        }
        if (on) {
            // Settings guard: this app's VPN can't be switched off from system settings. Free on/off.
            boolean guard = Prefs.isVpnGuardOn(this);
            LinearLayout gr = ui.row();
            LinearLayout gt = ui.column();
            gt.addView(ui.text("설정에서 이 앱의 VPN 끄기 막기", 15, ui.text, true));
            gt.addView(ui.text(guard ? "🛡️ 켜짐 · 설정의 이 앱 VPN 화면·연결 해제 창이 바로 닫혀요" : "꺼짐 · 설정에서 VPN을 끌 수 있어요",
                    12, ui.sub, false));
            gr.addView(gt, Ui.weight(0));
            Switch gsw = new Switch(this);
            gsw.setChecked(guard);
            gsw.setOnCheckedChangeListener((b, checked) -> {
                Prefs.setVpnGuardOn(this, checked);
                render();
            });
            gr.addView(gsw);
            c.addView(gr, Ui.fill(ui.dp(12)));
            if (guard && !isServiceEnabled()) {
                c.addView(ui.body("※ 이 기능은 접근성 권한이 켜져 있어야 작동해요."), Ui.wrap(ui.dp(4)));
            }
        }
        c.addView(ui.body("다른 VPN 앱과는 함께 쓸 수 없어요. 휴대폰 설정의 '비공개 DNS'가 특정 주소로 지정돼 있으면 꺼 주세요."),
                Ui.wrap(ui.dp(8)));
        content.addView(c);
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_VPN) return;
        if (resultCode == RESULT_OK) {
            Prefs.setVpnOn(this, true);
            DetoxVpnService.start(this);
            Toast.makeText(this, "네트워크 차단을 켰어요 🌐", Toast.LENGTH_SHORT).show();
        } else if (!Prefs.isLocked(this)) {
            Prefs.setVpnOn(this, false);
            Toast.makeText(this, "VPN 연결을 허용해야 켤 수 있어요", Toast.LENGTH_SHORT).show();
        }
        handler.postDelayed(this::render, 800);
    }

    // ------------------------------------------------------------------ VR headset setup

    private void vrSetupCard() {
        String pkg = getPackageName();
        LinearLayout c = ui.card();
        c.addView(ui.title("🥽 퀘스트에서 쓰는 법"));
        c.addView(ui.body("1) 위의 '커뮤니티 차단 (VPN)'을 켜고 'VPN 연결 허용'을 누르면 끝이에요.\n"
                + "   퀘스트 브라우저를 포함한 모든 앱에서 커뮤니티 주소가 열리지 않아요. 헤드셋을 껐다 켜도 자동으로 다시 켜져요.\n\n"
                + "2) 허용 창이 안 뜨면: 헤드셋을 PC(SideQuest) 또는 휴대폰(Bugjaeger 앱)에 연결해 아래 명령을 한 번 실행하고 이 앱을 다시 여세요."));
        addCommand(c, "adb shell appops set " + pkg + " ACTIVATE_VPN allow");
        c.addView(ui.body("3) VR 앱 차단·삭제 방지·브라우저 아예 막기는 '접근성' 권한이 있어야 해요 (선택). "
                + "먼저 아래 버튼으로 헤드셋 안에서 켜 보고, 안 열리거나 목록에 없으면 그 아래 명령을 실행하세요."),
                Ui.wrap(ui.dp(10)));
        boolean serviceOn = isServiceEnabled();
        c.addView(ui.text(serviceOn ? "✓ 접근성(차단 서비스) 켜짐"
                : "⚠ 접근성(차단 서비스)이 꺼져 있어요", 14, serviceOn ? ui.accent : ui.danger, true), Ui.wrap(ui.dp(8)));
        LinearLayout open = ui.row();
        open.addView(ui.button("① 접근성 설정 열기", true, v -> openAccessibilitySettings()), Ui.weight(0));
        open.addView(ui.button("앱 정보 (제한된 설정 허용)", false, v -> openAppInfo()), Ui.weight(ui.dp(8)));
        c.addView(open, Ui.fill(ui.dp(8)));
        c.addView(ui.body("① 버튼 → '설치된 앱/서비스' → 'Digital Detox 차단' 켜기. "
                + "회색으로 막혀 있으면 '앱 정보' → 오른쪽 위 ⋮ → '제한된 설정 허용' 후 다시 켜세요."), Ui.wrap(ui.dp(6)));
        addCommand(c, "adb shell settings put secure enabled_accessibility_services "
                + pkg + "/com.joyong.communitydetox.DetoxAccessibilityService\n"
                + "adb shell settings put secure accessibility_enabled 1\n"
                + "adb shell dpm set-active-admin " + pkg + "/com.joyong.communitydetox.DetoxAdminReceiver");
        content.addView(c);

        // Needs accessibility: the browser itself can't be opened.
        boolean locked = Prefs.isLocked(this);
        LinearLayout bc = ui.card();
        bc.addView(ui.title("🚫 퀘스트 브라우저 아예 막기 (선택 · 접근성 필요)"));
        bc.addView(ui.body("켜면 브라우저가 열리자마자 닫혀요. 접근성 권한이 켜져 있을 때만 작동해요."));
        LinearLayout r = ui.row();
        r.addView(ui.text("브라우저 아예 막기", 15, ui.text, true), Ui.weight(0));
        Switch sw = new Switch(this);
        boolean on = Prefs.isBrowserBlockAll(this);
        sw.setChecked(on);
        sw.setEnabled(!(locked && on));
        sw.setOnCheckedChangeListener((b, checked) -> {
            if (!checked && Prefs.isLocked(this)) {
                b.setChecked(true);
                lockedToast();
                return;
            }
            Prefs.setBrowserBlockAll(this, checked);
        });
        r.addView(sw);
        bc.addView(r, Ui.fill(ui.dp(10)));
        content.addView(bc);
    }

    private static final String ANDROID_SETTINGS = "com.android.settings";

    /**
     * Opens Android's own Settings app (com.android.settings), which Meta Quest hides from its menus but
     * still contains — the same way Quest App Hider does. Tries, and shows the first that opens:
     *  1. Settings' accessibility screen, by name
     *  2. the "accessibility settings" request, sent only to Android Settings
     *  3. the same request with no target (the device picks; may be Quest's own settings)
     *  4. Android Settings' first screen
     * For 3 and 4 the user has to find '접근성' themselves, so we say how.
     */
    private void openAccessibilitySettings() {
        String service = getString(R.string.service_label);
        if (tryOpen(new Intent().setClassName(ANDROID_SETTINGS, ANDROID_SETTINGS + ".Settings$AccessibilitySettingsActivity"))
                || tryOpen(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).setPackage(ANDROID_SETTINGS))) {
            Toast.makeText(this, "'설치된 앱/서비스' → '" + service + "'을 켜 주세요", Toast.LENGTH_LONG).show();
        } else if (tryOpen(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                || tryOpen(new Intent().setClassName(ANDROID_SETTINGS, ANDROID_SETTINGS + ".Settings"))) {
            Toast.makeText(this, "안드로이드 설정에서 '접근성' → '" + service + "'을 찾아 켜세요", Toast.LENGTH_LONG).show();
        } else {
            Toast.makeText(this, "이 기기는 접근성 설정을 열 수 없어요. 아래 명령을 써 주세요.", Toast.LENGTH_LONG).show();
        }
    }

    /** This app's info page in Android Settings — where "제한된 설정 허용" is (top-right ⋮ menu). */
    private void openAppInfo() {
        Uri pkg = Uri.parse("package:" + getPackageName());
        if (tryOpen(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg).setPackage(ANDROID_SETTINGS))
                || tryOpen(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg))) {
            Toast.makeText(this, "오른쪽 위 ⋮ → '제한된 설정 허용'을 누른 뒤 접근성을 다시 켜 주세요", Toast.LENGTH_LONG).show();
        } else if (tryOpen(new Intent().setClassName(ANDROID_SETTINGS, ANDROID_SETTINGS + ".Settings"))) {
            Toast.makeText(this, "'앱' → '" + getString(R.string.app_name) + "' → ⋮ → '제한된 설정 허용'", Toast.LENGTH_LONG).show();
        } else {
            Toast.makeText(this, "설정 화면을 열 수 없어요", Toast.LENGTH_LONG).show();
        }
    }

    /** Just try to open it: on Quest, "does this screen exist?" checks can say no for screens that open fine. */
    private boolean tryOpen(Intent i) {
        try {
            startActivity(i);
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    private void addCommand(LinearLayout card, String cmd) {
        TextView code = ui.text(cmd, 11, ui.text, false);
        code.setTypeface(android.graphics.Typeface.MONOSPACE);
        code.setTextIsSelectable(true);
        code.setBackground(ui.rounded(ui.accentSoft, 10));
        code.setPadding(ui.dp(10), ui.dp(8), ui.dp(10), ui.dp(8));
        card.addView(code, Ui.fill(ui.dp(8)));
        card.addView(ui.button("명령 복사", false, v -> {
            android.content.ClipboardManager cb = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            cb.setPrimaryClip(android.content.ClipData.newPlainText("adb", cmd));
            Toast.makeText(this, "복사했어요", Toast.LENGTH_SHORT).show();
        }), Ui.fill(ui.dp(6)));
    }

    private void inAppCard() {
        boolean locked = Prefs.isLocked(this);
        LinearLayout c = ui.card();
        c.addView(ui.title("💬 카카오톡 인앱 브라우저"));
        c.addView(ui.body("카카오톡 등에서 링크를 눌러 앱 안에서 열린 페이지도 확인해요. "
                + "차단 목록의 커뮤니티면 자동으로 닫고 대화방으로 돌아가요."));

        LinearLayout r = ui.row();
        LinearLayout texts = ui.column();
        texts.addView(ui.text("카카오톡 인앱 브라우저 아예 막기", 15, ui.text, true));
        texts.addView(ui.text("카톡 안에서 열리는 링크를 모두 닫아요", 12, ui.sub, false));
        r.addView(texts, Ui.weight(0));
        Switch sw = new Switch(this);
        boolean on = Prefs.isInAppBlockAll(this);
        sw.setChecked(on);
        sw.setEnabled(!(locked && on)); // during a focus lock it can be turned on, not off
        sw.setOnCheckedChangeListener((b, checked) -> {
            if (!checked && Prefs.isLocked(this)) {
                b.setChecked(true);
                lockedToast();
                return;
            }
            Prefs.setInAppBlockAll(this, checked);
            Toast.makeText(this, checked ? "카톡 인앱 브라우저를 막아요" : "차단 목록의 커뮤니티만 막아요",
                    Toast.LENGTH_SHORT).show();
        });
        r.addView(sw);
        c.addView(r, Ui.fill(ui.dp(12)));
        content.addView(c);
    }

    private void protectCard() {
        boolean locked = Prefs.isLocked(this);
        boolean admin = isAdminActive();
        LinearLayout c = ui.card();
        c.addView(ui.title("🛡️ 삭제 방지"));
        c.addView(ui.body("켜 두면 이 앱을 바로 지울 수 없어요. 집중 디톡스 중에는 이 앱의 삭제 확인창, 앱 정보(강제 중지), "
                + "접근성 끄기, 삭제 방지 끄기 화면만 닫아요. 다른 앱의 접근성 설정은 그대로 쓸 수 있어요."));
        if (!admin) {
            c.addView(ui.button("삭제 방지 켜기", true, v -> {
                Prefs.allowAdminSetup(this);
                Intent i = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
                        .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent())
                        .putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                                "켜 두면 Digital Detox를 바로 지울 수 없어요. 기기를 잠그거나 지우는 등 다른 권한은 쓰지 않아요.");
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

    // ------------------------------------------------------------------ block list (summary; the list has its own screen)

    private void installBlockCard() {
        boolean locked = Prefs.isLocked(this);
        boolean on = Prefs.isInstallBlockOn(this);
        LinearLayout c = ui.card();
        LinearLayout r = ui.row();
        LinearLayout texts = ui.column();
        texts.addView(ui.text("📵 커뮤니티 앱 설치 막기", 16, ui.text, true));
        texts.addView(ui.text(on ? "✅ 차단 목록의 커뮤니티 앱을 설치할 수 없어요" : "꺼져 있어요", 12, ui.sub, false));
        r.addView(texts, Ui.weight(0));
        Switch sw = new Switch(this);
        sw.setChecked(on);
        sw.setEnabled(!(locked && on)); // during a focus lock it can be turned on, not off
        sw.setOnCheckedChangeListener((b, checked) -> {
            if (!checked && Prefs.isLocked(this)) {
                b.setChecked(true);
                lockedToast();
                return;
            }
            Prefs.setInstallBlockOn(this, checked);
            render();
        });
        r.addView(sw);
        c.addView(r);
        c.addView(ui.body("플레이스토어·갤럭시 스토어·원스토어에서 커뮤니티 앱의 설치 화면이 열리면 바로 닫아요. "
                + "APK 파일 등 다른 방법으로 설치돼도 곧바로 삭제 화면을 띄워요."), Ui.wrap(ui.dp(8)));
        content.addView(c);
    }

    /** 모아읽기 (merged from the MoaReader app): the boards are blocked in browsers but readable here. */
    private void readerCard() {
        LinearLayout c = ui.card();
        c.setBackground(ui.rounded(ui.accentSoft, 20));
        c.addView(ui.title("📖 모아읽기"));
        c.addView(ui.body("브라우저에서는 막혀 있는 펨코 해외축구·롤 인기글, 디시 특갤 개념글, 아카 나무 실검을 "
                + "이 앱 안에서만 댓글까지 읽어요. "
                + (BuildConfig.IS_VR ? "VPN은 이 앱 하나로 충분해요 (예전 모아읽기 앱은 지워도 돼요)."
                                     : "예전 모아읽기 앱은 지워도 돼요. (두 앱의 VPN은 동시에 켤 수 없어요)")));
        c.addView(ui.button("읽으러 가기", true, v -> startActivity(new Intent(this, ReaderActivity.class))),
                Ui.fill(ui.dp(10)));
        content.addView(c);
    }

    private void blockListCard() {
        Set<String> on = Prefs.enabledPresets(this);
        int presets = 0;
        for (Catalog.Entry e : Catalog.ALL) if (on.contains(e.id)) presets++;
        int sites = Prefs.customDomains(this).size();
        int apps = Prefs.customPackages(this).size();
        LinearLayout c = ui.card();
        c.addView(ui.title("📋 차단 목록"));
        c.addView(ui.text("커뮤니티 " + (presets + sites) + "곳 · 앱 " + apps + "개 차단 중", 20, ui.accent, true));
        c.addView(ui.body("기본 목록 " + Catalog.ALL.size() + "곳 중 " + presets + "곳 켜짐 · 직접 추가한 사이트 " + sites
                + "곳 · 직접 차단한 앱 " + apps + "개"), Ui.wrap(ui.dp(4)));
        c.addView(ui.button("차단 목록 보기 · 편집", true,
                v -> startActivity(new Intent(this, BlockListActivity.class))), Ui.fill(ui.dp(12)));
        content.addView(c);
    }

    private void footer() {
        TextView t = ui.body("ℹ️ 크롬, 삼성 인터넷, 웨일, 엣지, 파이어폭스, 오페라, 브레이브 등 브라우저의 주소창을 확인해 차단해요. "
                + "카카오톡·라인·텔레그램·밴드 등 앱 속 인앱 브라우저는 화면 위쪽의 주소와 제목으로 확인해요. "
                + "앱 버전에 따라 일부는 막히지 않을 수 있어요.\n\n"
                + "스스로를 돕는 도구예요. 휴대폰 설정에서 접근성 권한을 끄면 차단도 멈춰요.");
        t.setTextSize(12);
        t.setPadding(ui.dp(4), ui.dp(4), ui.dp(4), ui.dp(16));
        content.addView(t);

        updateCard(false);
    }

    // ------------------------------------------------------------------ in-app update

    private static long lastUpdateCheck;          // per app run
    private static AppUpdater.Latest newer;       // a newer version that was found
    private String updateStatus;                  // "확인하는 중…" etc.
    private boolean installAfterPermission;

    private void updateCard(boolean banner) {
        if (banner && newer == null) return;
        LinearLayout c = ui.card();
        if (newer != null) c.setBackground(ui.rounded(ui.accentSoft, 20));
        if (banner) {
            c.addView(ui.text("✨ 새 버전 " + newer.versionName + "이 있어요", 16, ui.accent, true));
            c.addView(ui.button("지금 업데이트", true, v -> installUpdate()), Ui.fill(ui.dp(10)));
            content.addView(c);
            return;
        }
        c.addView(ui.title("⬇️ 앱 업데이트"));
        c.addView(ui.body("지금 버전: " + versionName()));
        if (newer != null) {
            c.addView(ui.text("✨ 새 버전 " + newer.versionName + "이 있어요", 15, ui.accent, true), Ui.wrap(ui.dp(6)));
            c.addView(ui.button("지금 업데이트", true, v -> installUpdate()), Ui.fill(ui.dp(10)));
        } else {
            c.addView(ui.button("업데이트 확인", false, v -> checkUpdate(true)), Ui.fill(ui.dp(10)));
        }
        if (updateStatus != null) c.addView(ui.text(updateStatus, 13, ui.sub, false), Ui.wrap(ui.dp(6)));
        c.addView(ui.body("버튼을 누르면 앱이 새 버전을 직접 받아서 바로 설치해요. 설정과 기록은 그대로예요. "
                + "처음 한 번은 Android가 '이 앱에서 설치 허용'과 '업데이트할까요?'를 물어봐요."), Ui.wrap(ui.dp(8)));
        LinearLayout.LayoutParams lp = Ui.fill(0);
        lp.bottomMargin = ui.dp(24);
        content.addView(c, lp);
    }

    /** Downloads the latest build in the background; if it is newer, offers (or, if asked, starts) the update. */
    private void checkUpdate(boolean userAsked) {
        lastUpdateCheck = System.currentTimeMillis();
        updateStatus = "확인하는 중…";
        if (userAsked) render();
        new Thread(() -> {
            String error = null;
            AppUpdater.Latest l = null;
            try {
                l = AppUpdater.download(this);
            } catch (Exception e) {
                error = e.getMessage();
            }
            final AppUpdater.Latest found = l;
            final String err = error;
            handler.post(() -> {
                updateStatus = null;
                if (found != null && found.versionCode > AppUpdater.currentVersionCode(this)) {
                    newer = found;
                    if (userAsked) installUpdate();
                } else if (userAsked) {
                    Toast.makeText(this, err != null ? "업데이트를 확인하지 못했어요. 인터넷 연결을 확인해 주세요."
                            : "이미 최신 버전이에요 🌿", Toast.LENGTH_SHORT).show();
                }
                render();
            });
        }).start();
    }

    private void installUpdate() {
        if (newer == null) return;
        if (!AppUpdater.canInstall(this)) {
            // Android asks once per installing app.
            installAfterPermission = true;
            Toast.makeText(this, "'이 출처 허용'을 켜고 돌아오면 바로 업데이트해요", Toast.LENGTH_LONG).show();
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
            } catch (RuntimeException e) {
                openDownloadPage();
            }
            return;
        }
        updateStatus = "설치하는 중… 잠깐 기다려 주세요";
        render();
        final AppUpdater.Latest l = newer;
        new Thread(() -> {
            try {
                AppUpdater.install(this, l.file);
            } catch (Exception e) {
                handler.post(() -> {
                    updateStatus = null;
                    Toast.makeText(this, "업데이트하지 못했어요. 다운로드 페이지를 열게요.", Toast.LENGTH_LONG).show();
                    openDownloadPage();
                    render();
                });
            }
        }).start();
    }

    private void openDownloadPage() {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(UPDATE_URL)));
        } catch (RuntimeException e) {
            Toast.makeText(this, "브라우저를 열 수 없어요", Toast.LENGTH_SHORT).show();
        }
    }

    private static final String UPDATE_URL = BuildConfig.UPDATE_URL;

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
