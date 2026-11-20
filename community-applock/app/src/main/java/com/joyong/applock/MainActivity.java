package com.joyong.applock;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.net.VpnService;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.widget.EditText;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/** 커뮤니티 앱 잠금: locks community apps made by anyone (website, name, optionally connection), with detox time. */
public class MainActivity extends Activity {

    private static final int REQ_VPN = 7;
    private static final String ANDROID_SETTINGS = "com.android.settings";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Ui ui;
    private ScrollView scroll;
    private LinearLayout content;
    private TextView detoxLeft;
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (detoxLeft != null) {
                if (Store.isDetox(MainActivity.this)) {
                    detoxLeft.setText("남은 시간 " + Ui.remaining(Store.detoxLeft(MainActivity.this)));
                } else {
                    render(); // detox time just ended
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
        handler.removeCallbacks(tick);
        handler.postDelayed(tick, 1000);
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(tick);
        super.onPause();
    }

    private void render() {
        final int y = scroll.getScrollY();
        content.removeAllViews();
        detoxLeft = null;

        LinearLayout h = ui.column();
        h.setPadding(ui.dp(4), ui.dp(8), ui.dp(4), ui.dp(16));
        h.addView(ui.text("🔒 커뮤니티 앱 잠금", 26, ui.text, true));
        h.addView(ui.body("누가 만든 앱이든, 앱의 웹사이트나 이름이 커뮤니티와 맞으면 잠가요."), Ui.wrap(ui.dp(4)));
        content.addView(h);

        accessibilityCard();
        detoxCard();
        lockedCard();
        protectCard();
        vpnCard();

        TextView t = ui.body("ℹ️ 웹사이트로 찾기: 커뮤니티 웹사이트 링크(예: reddit.com, gall.dcinside.com)를 여는 앱이면 잠가요 "
                + "(모든 사이트를 여는 브라우저는 빼요).\n"
                + "이름으로 찾기: 앱 이름이나 패키지에 커뮤니티 이름·별명(디시, 펨코, 에타, reddit …)이 들어 있으면 잠가요. "
                + "짧은 영어 단어는 낱말 단위로만 비교해요 (client, inventory 같은 이름은 안 걸려요).\n"
                + "브라우저·메신저·시스템 앱과 Digital Detox는 잠그지 않아요. 어떤 정보도 외부로 보내지 않아요.");
        t.setTextSize(12);
        t.setPadding(ui.dp(4), ui.dp(4), ui.dp(4), ui.dp(24));
        content.addView(t);
        scroll.post(() -> scroll.scrollTo(0, y));
    }

    // ------------------------------------------------------------------ accessibility (locking)

    private void accessibilityCard() {
        boolean on = isServiceEnabled();
        LinearLayout c = ui.card();
        if (on) c.setBackground(ui.rounded(ui.accentSoft, 20));
        c.addView(ui.title("① 잠금 켜기 (접근성)"));
        c.addView(ui.text(on ? "✓ 잠금 서비스 켜짐 — 잠긴 앱은 열리자마자 닫혀요"
                : "⚠ 잠금 서비스가 꺼져 있어요", 14, on ? ui.accent : ui.danger, true));
        if (!on) {
            c.addView(ui.body("아래 버튼 → '설치된 앱/서비스' → '커뮤니티 앱 잠금' 켜기. "
                    + "회색으로 막혀 있으면 '앱 정보' → 오른쪽 위 ⋮ → '제한된 설정 허용' 후 다시 켜세요."), Ui.wrap(ui.dp(6)));
            LinearLayout r = ui.row();
            r.addView(ui.button("접근성 설정 열기", true, v -> openAccessibility()), Ui.weight(0));
            r.addView(ui.button("앱 정보 (제한된 설정 허용)", false, v -> openAppInfo()), Ui.weight(ui.dp(8)));
            c.addView(r, Ui.fill(ui.dp(10)));
        }
        content.addView(c);
    }

    /** Android's own Settings app, hidden on Meta Quest but still there (same order as Quest App Hider). */
    private void openAccessibility() {
        if (tryOpen(new Intent().setClassName(ANDROID_SETTINGS, ANDROID_SETTINGS + ".Settings$AccessibilitySettingsActivity"))
                || tryOpen(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).setPackage(ANDROID_SETTINGS))) {
            toast("'설치된 앱/서비스' → '커뮤니티 앱 잠금'을 켜 주세요");
        } else if (tryOpen(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                || tryOpen(new Intent().setClassName(ANDROID_SETTINGS, ANDROID_SETTINGS + ".Settings"))) {
            toast("안드로이드 설정에서 '접근성' → '커뮤니티 앱 잠금'을 찾아 켜세요");
        } else {
            toast("접근성 설정을 열 수 없어요");
        }
    }

    private void openAppInfo() {
        Uri pkg = Uri.parse("package:" + getPackageName());
        if (tryOpen(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg).setPackage(ANDROID_SETTINGS))
                || tryOpen(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg))) {
            toast("오른쪽 위 ⋮ → '제한된 설정 허용'을 누른 뒤 접근성을 다시 켜 주세요");
        } else if (tryOpen(new Intent().setClassName(ANDROID_SETTINGS, ANDROID_SETTINGS + ".Settings"))) {
            toast("'앱' → '커뮤니티 앱 잠금' → ⋮ → '제한된 설정 허용'");
        } else {
            toast("설정 화면을 열 수 없어요");
        }
    }

    private boolean tryOpen(Intent i) {
        try {
            startActivity(i);
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    private boolean isServiceEnabled() {
        String enabled = Settings.Secure.getString(getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabled == null) return false;
        ComponentName me = new ComponentName(this, LockService.class);
        for (String s : enabled.split(":")) {
            if (me.equals(ComponentName.unflattenFromString(s))) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ locked apps

    private void lockedCard() {
        Map<String, Store.Locked> locked = Store.locked(this);
        boolean detox = Store.isDetox(this);
        LinearLayout c = ui.card();
        c.addView(ui.title("🔒 잠긴 앱 " + locked.size() + "개"));
        if (locked.isEmpty()) {
            c.addView(ui.body("아직 잠긴 앱이 없어요. 커뮤니티 웹사이트를 열거나 커뮤니티 이름이 들어간 앱이 설치되거나, "
                    + "'접속으로 찾기'를 켠 뒤 커뮤니티에 접속하는 앱이 있으면 여기에 나와요."));
        }
        List<String> pkgs = new ArrayList<>(locked.keySet());
        Collections.sort(pkgs);
        for (String p : pkgs) {
            Store.Locked l = locked.get(p);
            String label = Kinds.label(this, p);
            LinearLayout row = ui.row();
            row.setBackground(ui.rounded(ui.accentSoft, 12));
            row.setPadding(ui.dp(12), ui.dp(6), ui.dp(6), ui.dp(6));
            LinearLayout texts = ui.column();
            texts.addView(ui.text(label, 15, ui.text, true));
            texts.addView(ui.text(l.reason() + " · " + p, 12, ui.sub, false));
            row.addView(texts, Ui.weight(0));
            Button x = ui.button(detox ? "⏳" : "풀기", false, v -> {
                if (Store.isDetox(this)) {
                    toast("디톡스 시간이 끝나면 풀 수 있어요");
                    return;
                }
                Store.unlock(this, p);
                toast("‘" + label + "’ 잠금을 풀었어요 (다시 자동으로 잠그지 않아요)");
                render();
            });
            row.addView(x);
            c.addView(row, Ui.fill(ui.dp(6)));
        }
        c.addView(ui.button("설치된 앱 다시 찾기", false, v -> new Thread(() -> {
            int n = LockService.scanNames(this);
            handler.post(() -> {
                toast(n > 0 ? n + "개 앱을 새로 잠갔어요" : "새로 찾은 앱이 없어요");
                render();
            });
        }).start()), Ui.fill(ui.dp(10)));
        content.addView(c);
    }

    // ------------------------------------------------------------------ detox time

    private static final long MIN = 60_000L, HOUR = 60 * MIN, DAY = 24 * HOUR;

    private void detoxCard() {
        boolean on = Store.isDetox(this);
        LinearLayout c = ui.card();
        if (on) c.setBackground(ui.rounded(ui.accentSoft, 20));
        c.addView(ui.title("⏳ 디톡스 시간"));
        if (on) {
            c.addView(ui.text("디톡스 중 — " + new java.text.SimpleDateFormat("M월 d일 HH:mm", java.util.Locale.KOREA)
                    .format(new java.util.Date(Store.detoxUntil(this))) + "까지", 15, ui.accent, true));
            detoxLeft = ui.text("남은 시간 " + Ui.remaining(Store.detoxLeft(this)), 14, ui.text, false);
            c.addView(detoxLeft, Ui.wrap(ui.dp(4)));
            c.addView(ui.body("끝날 때까지 잠긴 앱을 풀 수 없고, 이 앱을 끄거나(접근성·강제 중지) 지울 수 없어요. "
                    + "시간은 늘릴 수만 있어요."), Ui.wrap(ui.dp(6)));
        } else {
            c.addView(ui.body("시작하면 정한 시간 동안 잠긴 앱을 풀 수 없고, 이 앱을 끄거나 지울 수 없어요. "
                    + "중간에 멈출 수 없으니 신중하게 고르세요."));
        }
        String[] labels = {"1시간", "3시간", "6시간", "12시간", "1일", "3일", "7일", "14일", "30일"};
        long[] times = {HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY};
        LinearLayout r = null;
        for (int i = 0; i < labels.length; i++) {
            if (i % 3 == 0) {
                r = ui.row();
                c.addView(r, Ui.fill(ui.dp(8)));
            }
            final long ms = times[i];
            r.addView(ui.button((on ? "+" : "") + labels[i], !on && i == 4, v -> confirmDetox(ms)), Ui.weight(i % 3 == 0 ? 0 : ui.dp(6)));
        }

        // custom: days / hours / minutes
        LinearLayout custom = ui.row();
        EditText d = number("일"), h = number("시간"), m = number("분");
        custom.addView(d, Ui.weight(0));
        custom.addView(h, Ui.weight(ui.dp(6)));
        custom.addView(m, Ui.weight(ui.dp(6)));
        custom.addView(ui.button(on ? "늘리기" : "시작", true, v -> {
            long ms = value(d) * DAY + value(h) * HOUR + value(m) * MIN;
            if (ms < MIN) {
                toast("시간을 입력해 주세요");
                return;
            }
            if (ms > 365 * DAY) {
                toast("최대 365일까지 정할 수 있어요");
                return;
            }
            confirmDetox(ms);
        }), Ui.weight(ui.dp(6)));
        c.addView(ui.text("직접 정하기", 13, ui.sub, true), Ui.wrap(ui.dp(12)));
        c.addView(custom, Ui.fill(ui.dp(4)));
        if (!isAdminActive()) {
            c.addView(ui.text("💡 아래 ‘삭제 방지’도 켜 두면 디톡스 중에 앱을 지울 수 없어요", 12, ui.danger, false), Ui.wrap(ui.dp(10)));
        }
        content.addView(c);
    }

    private EditText number(String hint) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setInputType(InputType.TYPE_CLASS_NUMBER);
        e.setSingleLine(true);
        e.setTextSize(15);
        e.setTextColor(ui.text);
        e.setHintTextColor(ui.sub);
        e.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(4)});
        return e;
    }

    private static long value(EditText e) {
        try {
            return Long.parseLong(e.getText().toString().trim());
        } catch (NumberFormatException ex) {
            return 0;
        }
    }

    private void confirmDetox(long ms) {
        boolean on = Store.isDetox(this);
        String what = Ui.duration(ms);
        new AlertDialog.Builder(this)
                .setTitle(on ? "디톡스 시간을 " + what + " 늘릴까요?" : what + " 동안 디톡스할까요?")
                .setMessage("그동안 잠긴 앱을 풀 수 없고, 이 앱을 끄거나 지울 수 없어요. 중간에 멈출 수 없어요.")
                .setPositiveButton(on ? "늘리기" : "시작", (dlg, w) -> {
                    Store.addDetox(this, ms);
                    toast(on ? "디톡스 시간을 " + what + " 늘렸어요" : "디톡스 시작! " + what + " 동안이에요 🌿");
                    render();
                })
                .setNegativeButton("취소", null)
                .show();
    }

    // ------------------------------------------------------------------ uninstall protection

    private ComponentName admin() {
        return new ComponentName(this, AdminReceiver.class);
    }

    private boolean isAdminActive() {
        DevicePolicyManager dpm = (DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);
        return dpm != null && dpm.isAdminActive(admin());
    }

    private void protectCard() {
        boolean on = isAdminActive();
        LinearLayout c = ui.card();
        if (on) c.setBackground(ui.rounded(ui.accentSoft, 20));
        c.addView(ui.title("🛡️ 삭제 방지"));
        c.addView(ui.text(on ? "✓ 켜짐 — 이 앱을 바로 지울 수 없어요" : "꺼져 있어요", 14, on ? ui.accent : ui.sub, true));
        c.addView(ui.body("켜 두면 이 앱을 바로 지울 수 없어요. 디톡스 시간에는 삭제 방지도 끌 수 없어요. "
                + "디톡스 중에는 이 앱의 삭제 창·앱 정보(강제 중지)·접근성 끄기·삭제 방지 끄기 화면만 닫아요. "
                + "다른 앱 설정은 그대로 쓸 수 있어요."), Ui.wrap(ui.dp(6)));
        if (!on) {
            c.addView(ui.button("삭제 방지 켜기", true, v -> {
                Store.allowAdminSetup(this);
                Intent i = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
                        .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, admin())
                        .putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                                "켜 두면 커뮤니티 앱 잠금을 바로 지울 수 없어요. 기기를 잠그거나 지우는 등 다른 권한은 쓰지 않아요.");
                if (!tryOpen(i)) toast("이 기기에서는 삭제 방지를 켤 수 없어요");
            }), Ui.fill(ui.dp(10)));
        } else {
            c.addView(ui.button("삭제 방지 끄기", false, v -> {
                if (Store.isDetox(this)) {
                    toast("디톡스 시간이 끝나면 끌 수 있어요");
                    return;
                }
                new AlertDialog.Builder(this)
                        .setTitle("삭제 방지를 끌까요?")
                        .setMessage("끄면 이 앱을 바로 지울 수 있게 돼요.")
                        .setPositiveButton("끄기", (dlg, w) -> {
                            DevicePolicyManager dpm = (DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);
                            try {
                                dpm.removeActiveAdmin(admin());
                            } catch (RuntimeException ignored) {
                            }
                            handler.postDelayed(this::render, 500);
                        })
                        .setNegativeButton("취소", null)
                        .show();
            }), Ui.fill(ui.dp(10)));
        }
        content.addView(c);
    }

    // ------------------------------------------------------------------ find by connection (VPN)

    private void vpnCard() {
        boolean on = Store.isVpnOn(this);
        LinearLayout c = ui.card();
        c.addView(ui.title("🌐 접속으로 찾기 (선택 · VPN)"));
        c.addView(ui.body("켜면 커뮤니티 주소에 접속하려는 앱을 찾아서 잠가요. 이름이 커뮤니티와 전혀 달라도 잡혀요. "
                + "커뮤니티 사이트도 모든 앱·브라우저에서 열리지 않아요.\n"
                + "⚠ 안드로이드는 VPN을 하나만 켤 수 있어요. 켜면 Digital Detox의 '네트워크 차단(VPN)'은 꺼지고, "
                + "Digital Detox 모아읽기도 막혀요."));
        LinearLayout r = ui.row();
        LinearLayout texts = ui.column();
        texts.addView(ui.text("접속으로 찾기", 15, ui.text, true));
        texts.addView(ui.text(!on ? "꺼져 있어요" : FinderVpn.running ? "✅ 작동 중" : "켜는 중…", 12, ui.sub, false));
        r.addView(texts, Ui.weight(0));
        Switch sw = new Switch(this);
        sw.setChecked(on);
        sw.setOnCheckedChangeListener((b, checked) -> {
            if (checked) {
                Intent consent = VpnService.prepare(this);
                if (consent != null) {
                    try {
                        startActivityForResult(consent, REQ_VPN);
                    } catch (RuntimeException e) {
                        b.setChecked(false);
                        toast("VPN 허용 창을 열 수 없어요");
                    }
                    return;
                }
                Store.setVpnOn(this, true);
                FinderVpn.start(this);
            } else {
                if (Store.isDetox(this)) {
                    b.setChecked(true);
                    toast("디톡스 시간에는 끌 수 없어요");
                    return;
                }
                Store.setVpnOn(this, false);
                FinderVpn.stop(this);
            }
            handler.postDelayed(this::render, 800);
        });
        r.addView(sw);
        c.addView(r, Ui.fill(ui.dp(10)));
        content.addView(c);
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_VPN) return;
        if (resultCode == RESULT_OK) {
            Store.setVpnOn(this, true);
            FinderVpn.start(this);
        } else {
            toast("VPN 연결을 허용해야 켤 수 있어요");
        }
        handler.postDelayed(this::render, 800);
    }

    private void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_LONG).show();
    }
}
