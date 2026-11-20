package com.joyong.applock;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.net.VpnService;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
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

/** 커뮤니티 앱 잠금: locks community apps made by anyone (by name, and optionally by connection). */
public class MainActivity extends Activity {

    private static final int REQ_VPN = 7;
    private static final String ANDROID_SETTINGS = "com.android.settings";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Ui ui;
    private ScrollView scroll;
    private LinearLayout content;

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
    }

    private void render() {
        final int y = scroll.getScrollY();
        content.removeAllViews();

        LinearLayout h = ui.column();
        h.setPadding(ui.dp(4), ui.dp(8), ui.dp(4), ui.dp(16));
        h.addView(ui.text("🔒 커뮤니티 앱 잠금", 26, ui.text, true));
        h.addView(ui.body("누가 만든 앱이든, 앱의 웹사이트나 이름이 커뮤니티와 맞으면 잠가요."), Ui.wrap(ui.dp(4)));
        content.addView(h);

        accessibilityCard();
        lockedCard();
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
            Button x = ui.button("풀기", false, v -> {
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
