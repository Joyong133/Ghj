package com.ghj.nihongo;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Vibrator;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.Locale;

/**
 * 웹 기반 학습 엔진(assets/www)을 감싸는 네이티브 셸.
 * - 일본어 TTS (TextToSpeech) 브리지
 * - 음성 인식 (RecognizerIntent) 브리지
 * - SharedPreferences 영구 저장 브리지
 * - 진동, 뒤로가기 처리
 */
public class MainActivity extends Activity implements TextToSpeech.OnInitListener {

    private static final int REQ_SPEECH = 4242;
    private static final String PREFS = "nihongo_store";

    private WebView web;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private boolean ttsJapanese = false;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 21) {
            w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            w.setStatusBarColor(Color.parseColor("#58CC02"));
            w.setNavigationBarColor(Color.parseColor("#FFFFFF"));
        }
        if (Build.VERSION.SDK_INT >= 26) {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.WHITE);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "Android");
        setContentView(web);

        tts = new TextToSpeech(this, this);
        web.loadUrl("file:///android_asset/www/index.html");
    }

    private static final String GOOGLE_TTS = "com.google.android.tts";
    private boolean triedGoogle = false;

    private boolean hasGoogleTts() {
        try {
            if (tts == null) return false;
            for (TextToSpeech.EngineInfo e : tts.getEngines()) if (GOOGLE_TTS.equals(e.name)) return true;
        } catch (Exception ignored) { }
        return false;
    }

    @Override
    public void onInit(int status) {
        if (tts == null) return;
        boolean ok = false;
        if (status == TextToSpeech.SUCCESS) {
            int r = tts.setLanguage(Locale.JAPANESE);
            ok = !(r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED);
        }
        // 기본 엔진(예: 삼성 TTS)이 일본어를 지원하지 않으면 Google TTS 로 재시도
        if (!ok && !triedGoogle && hasGoogleTts() && !GOOGLE_TTS.equals(tts.getDefaultEngine())) {
            triedGoogle = true;
            try { tts.shutdown(); } catch (Exception ignored) { }
            tts = new TextToSpeech(this, this, GOOGLE_TTS);
            return;
        }
        ttsJapanese = ok;
        ttsReady = status == TextToSpeech.SUCCESS;
    }

    @Override
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript("(window.__androidBack && window.__androidBack()) ? '1' : '0'",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if (value == null || !value.contains("1")) {
                            finish();
                        }
                    }
                });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_SPEECH) {
            String text = "";
            if (resultCode == RESULT_OK && data != null) {
                ArrayList<String> res = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (res != null && !res.isEmpty()) {
                    StringBuilder sb = new StringBuilder();
                    for (int i = 0; i < res.size(); i++) {
                        if (i > 0) sb.append('\u0001');
                        sb.append(res.get(i));
                    }
                    text = sb.toString();
                }
            }
            final String js = "window.__onSpeech && window.__onSpeech(" + quote(text) + ")";
            web.post(new Runnable() {
                @Override
                public void run() { web.evaluateJavascript(js, null); }
            });
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.evaluateJavascript("window.__onPause && window.__onPause()", null);
    }

    @Override
    protected void onDestroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); }
        if (web != null) { web.destroy(); }
        super.onDestroy();
    }

    private static String quote(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                default:
                    if (c < 0x20 || c == 0x2028 || c == 0x2029) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.append('"').toString();
    }

    /** JavaScript 에서 window.Android 로 접근 */
    public class Bridge {
        @JavascriptInterface
        public boolean ttsAvailable() { return ttsReady && ttsJapanese; }

        @JavascriptInterface
        public void speak(String text, float rate) {
            if (tts == null || !ttsReady) return;
            tts.setSpeechRate(rate <= 0 ? 1.0f : rate);
            if (Build.VERSION.SDK_INT >= 21) {
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "u" + System.nanoTime());
            } else {
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null);
            }
        }

        @JavascriptInterface
        public void stopSpeak() { if (tts != null) tts.stop(); }

        @JavascriptInterface
        public boolean isNightMode() {
            int m = getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK;
            return m == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        }

        @JavascriptInterface
        public String appVersion() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
        }

        @JavascriptInterface
        public void installTts() {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    try {
                        Intent i = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA);
                        startActivity(i);
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "TTS 설정을 열 수 없습니다", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void listen(final String prompt) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ja-JP");
                    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "ja-JP");
                    i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
                    i.putExtra(RecognizerIntent.EXTRA_PROMPT, prompt == null ? "일본어로 말해 보세요" : prompt);
                    try {
                        startActivityForResult(i, REQ_SPEECH);
                    } catch (ActivityNotFoundException e) {
                        web.evaluateJavascript("window.__onSpeech && window.__onSpeech(null)", null);
                    }
                }
            });
        }

        @JavascriptInterface
        public String getItem(String key) { return prefs.getString(key, null); }

        @JavascriptInterface
        public void setItem(String key, String value) { prefs.edit().putString(key, value).apply(); }

        @JavascriptInterface
        public void removeItem(String key) { prefs.edit().remove(key).apply(); }

        @JavascriptInterface
        public void vibrate(int ms) {
            try {
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null) v.vibrate(ms);
            } catch (Exception ignored) { }
        }

        @JavascriptInterface
        public void toast(final String msg) {
            runOnUiThread(new Runnable() {
                @Override public void run() { Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show(); }
            });
        }

        @JavascriptInterface
        public void share(final String text) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType("text/plain");
                    i.putExtra(Intent.EXTRA_TEXT, text);
                    startActivity(Intent.createChooser(i, "공유하기"));
                }
            });
        }

        @JavascriptInterface
        public void exitApp() { runOnUiThread(new Runnable() { @Override public void run() { finish(); } }); }
    }
}
