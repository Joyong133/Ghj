package com.ghj.questblack;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.RadioGroup;
import android.widget.Toast;

/** 처음 화면: 유튜브 주소와 자막 설정을 고르고 VR 검은 화면을 시작합니다. */
public class LauncherActivity extends Activity {
    private static final String PREFS = "settings";

    private EditText url;
    private CheckBox translate;
    private RadioGroup size;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_launcher);

        url = findViewById(R.id.url);
        translate = findViewById(R.id.translate);
        size = findViewById(R.id.size);
        Button paste = findViewById(R.id.paste);
        Button start = findViewById(R.id.start);

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        url.setText(prefs.getString("url", ""));
        translate.setChecked(prefs.getBoolean("translate", true));
        size.check(sizeIdFor(prefs.getString("size", "m")));

        handleShare(getIntent());

        paste.setOnClickListener(v -> {
            ClipboardManager cm = getSystemService(ClipboardManager.class);
            ClipData clip = cm == null ? null : cm.getPrimaryClip();
            if (clip != null && clip.getItemCount() > 0) {
                CharSequence t = clip.getItemAt(0).coerceToText(this);
                if (t != null) url.setText(t.toString().trim());
            }
        });

        start.setOnClickListener(v -> startVr());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleShare(intent);
    }

    /** 퀘스트 브라우저 등에서 "공유"로 보낸 유튜브 주소를 받습니다. */
    private void handleShare(Intent intent) {
        if (intent != null && Intent.ACTION_SEND.equals(intent.getAction())) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null) url.setText(text.trim());
        }
    }

    private void startVr() {
        String text = url.getText().toString().trim();
        String watch = YouTubeScripts.toWatchUrl(text);
        if (watch == null) {
            Toast.makeText(this, R.string.bad_url, Toast.LENGTH_LONG).show();
            return;
        }
        String sizeKey = sizeKeyFor(size.getCheckedRadioButtonId());
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putString("url", text)
                .putBoolean("translate", translate.isChecked())
                .putString("size", sizeKey)
                .apply();

        Intent intent = new Intent(this, VrActivity.class)
                .putExtra(VrActivity.EXTRA_URL, watch)
                .putExtra(VrActivity.EXTRA_LANG, "ko")
                .putExtra(VrActivity.EXTRA_TRANSLATE, translate.isChecked())
                .putExtra(VrActivity.EXTRA_CAPTION_WIDTH, widthFor(sizeKey))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
    }

    private static float widthFor(String key) {
        switch (key) {
            case "s": return 1.2f;
            case "l": return 2.1f;
            default: return 1.6f;
        }
    }

    private static int sizeIdFor(String key) {
        switch (key) {
            case "s": return R.id.size_s;
            case "l": return R.id.size_l;
            default: return R.id.size_m;
        }
    }

    private static String sizeKeyFor(int id) {
        if (id == R.id.size_s) return "s";
        if (id == R.id.size_l) return "l";
        return "m";
    }
}
