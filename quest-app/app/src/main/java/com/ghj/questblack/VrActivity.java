package com.ghj.questblack;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.util.Collections;

/**
 * 몰입형(VR) 화면. 시야 전체는 C++(OpenXR) 쪽이 검게 그리고,
 * 여기서는 보이지 않는 WebView로 유튜브를 재생하면서 자막 글자를 읽어 와 넘겨줍니다.
 */
public class VrActivity extends Activity {
    static final String EXTRA_URL = "url";
    static final String EXTRA_LANG = "lang";
    static final String EXTRA_TRANSLATE = "translate";
    static final String EXTRA_CAPTION_WIDTH = "caption_width";

    private static final String TAG = "QuestBlack";
    private static final long POLL_MS = 150;
    private static final long NO_CAPTION_NOTICE_MS = 5000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final CaptionImage captionImage = new CaptionImage();
    private WebView web;
    private String pollScript;
    private boolean pollInFlight;
    private boolean nativeStarted;
    private boolean everPlayed;
    private long noCaptionSince = -1;
    private String shownText;
    private boolean shownDim;

    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            if (NativeBridge.consumeExitRequest()) {
                finish();
                return;
            }
            if (NativeBridge.status() < 0 && nativeStarted) {
                nativeStarted = false;
                Toast.makeText(VrActivity.this, R.string.vr_failed, Toast.LENGTH_LONG).show();
            }
            if (!pollInFlight && web != null) {
                pollInFlight = true;
                web.evaluateJavascript(pollScript, result -> {
                    pollInFlight = false;
                    onPollResult(result);
                });
            }
            handler.postDelayed(this, POLL_MS);
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        Intent intent = getIntent();
        String url = intent.getStringExtra(EXTRA_URL);
        if (url == null) {
            startActivity(new Intent(this, LauncherActivity.class));
            finish();
            return;
        }
        String lang = intent.getStringExtra(EXTRA_LANG);
        if (lang == null) lang = "ko";
        boolean translate = intent.getBooleanExtra(EXTRA_TRANSLATE, true);
        float captionWidth = intent.getFloatExtra(EXTRA_CAPTION_WIDTH, 1.6f);
        pollScript = YouTubeScripts.poll(lang, translate);

        // 유튜브를 재생하는 WebView. VR 화면에서는 보이지 않지만 소리와 자막 글자는 여기서 나옵니다.
        web = new WebView(this);
        FrameLayout root = new FrameLayout(this);
        root.addView(web, new FrameLayout.LayoutParams(1280, 720));
        setContentView(root, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(YouTubeScripts.DESKTOP_UA);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportMultipleWindows(false);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // 유튜브 앱이나 다른 앱으로 넘어가지 않게 http(s)만 허용합니다.
                Uri u = request.getUrl();
                String scheme = u.getScheme();
                return !("https".equals(scheme) || "http".equals(scheme));
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(web, YouTubeScripts.HOOK,
                    Collections.singleton("https://www.youtube.com"));
        }
        web.loadUrl(url);

        showCaption(getString(R.string.vr_loading), true);
        NativeBridge.start(this, captionWidth);
        nativeStarted = true;
        handler.postDelayed(poll, 500);
    }

    private void onPollResult(String result) {
        if (result == null || "null".equals(result)) return;
        try {
            Object v = new JSONTokener(result).nextValue();
            if (!(v instanceof String)) return;
            JSONObject o = new JSONObject((String) v);
            boolean playing = o.optBoolean("playing");
            boolean ad = o.optBoolean("ad");
            boolean noCaptions = o.optBoolean("nocc");
            String text = o.optString("t", "");
            if (o.has("err")) Log.w(TAG, "poll error: " + o.optString("err"));

            if (playing) everPlayed = true;
            if (!text.isEmpty()) {
                showCaption(text, false);
            } else if (!everPlayed) {
                showCaption(getString(R.string.vr_loading), true);
            } else if (ad) {
                showCaption(getString(R.string.vr_ad), true);
            } else if (noCaptions) {
                long now = SystemClock.elapsedRealtime();
                if (noCaptionSince < 0) noCaptionSince = now;
                showCaption(now - noCaptionSince < NO_CAPTION_NOTICE_MS
                        ? getString(R.string.vr_no_captions) : "", true);
            } else {
                noCaptionSince = -1;
                showCaption("", false);
            }
        } catch (Exception e) {
            Log.w(TAG, "bad poll result", e);
        }
    }

    private void showCaption(String text, boolean dim) {
        if (text.equals(shownText) && dim == shownDim) return;
        shownText = text;
        shownDim = dim;
        NativeBridge.setCaption(captionImage.render(text, dim), CaptionImage.WIDTH, CaptionImage.HEIGHT,
                !text.isEmpty());
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(poll);
        if (nativeStarted) {
            NativeBridge.stop();
            nativeStarted = false;
        }
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
