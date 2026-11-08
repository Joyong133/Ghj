package com.ghj.questblack;

import android.annotation.SuppressLint;
import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.util.Collections;

/**
 * WebView로 유튜브를 재생하면서 0.15초마다 자막을 읽어, 지금 보여 줄 글자를 알려 줍니다.
 * VR 화면과 미리보기 화면이 함께 씁니다.
 */
final class CaptionFeed {
    interface Listener {
        /** 보여 줄 글자. dim=true면 안내 문구(흐리게). 빈 글자면 숨김. */
        void onCaption(String text, boolean dim);

        /** 진단 정보 한 줄 (미리보기 화면용). */
        default void onDiagnostics(String line) {
        }
    }

    private static final String TAG = "QuestBlack";
    private static final long POLL_MS = 150;
    private static final long NO_CAPTION_NOTICE_MS = 5000;
    private static final long SHOW_DIAG_AFTER_MS = 8000;

    private final Context context;
    private final WebView web;
    private final Listener listener;
    private final String pollScript;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private boolean running;
    private boolean inFlight;
    private boolean everPlayed;
    private long firstPlayAt = -1;
    private long noCaptionSince = -1;
    private String currentVid = "";
    private boolean captionFoundForVid;

    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            if (!inFlight) {
                inFlight = true;
                web.evaluateJavascript(pollScript, result -> {
                    inFlight = false;
                    onResult(result);
                });
            }
            handler.postDelayed(this, POLL_MS);
        }
    };

    CaptionFeed(Context context, WebView web, String lang, boolean translate, Listener listener) {
        this.context = context;
        this.web = web;
        this.listener = listener;
        this.pollScript = YouTubeScripts.pollScript(context, lang, translate);
    }

    @SuppressLint("SetJavaScriptEnabled")
    void start(String url) {
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
            WebViewCompat.addDocumentStartJavaScript(web, YouTubeScripts.loadAsset(context, "hook.js"),
                    Collections.singleton("https://www.youtube.com"));
        } else {
            Log.w(TAG, "document start script not supported");
        }
        web.loadUrl(url);
        listener.onCaption(context.getString(R.string.vr_loading), true);
        running = true;
        handler.postDelayed(poll, 500);
    }

    void stop() {
        running = false;
        handler.removeCallbacks(poll);
    }

    private void onResult(String result) {
        if (!running || result == null || "null".equals(result)) return;
        try {
            Object v = new JSONTokener(result).nextValue();
            if (!(v instanceof String)) return;
            JSONObject o = new JSONObject((String) v);
            if (o.has("err")) Log.w(TAG, "poll error: " + o.optString("err"));
            if (o.optBoolean("loading")) {
                listener.onDiagnostics(context.getString(R.string.vr_loading));
                return;
            }

            long now = SystemClock.elapsedRealtime();
            boolean playing = o.optBoolean("playing");
            boolean ad = o.optBoolean("ad");
            boolean noCaptions = o.optBoolean("nocc");
            boolean hasSource = o.optBoolean("has");
            String text = o.optString("t", "");
            String vid = o.optString("vid", "");
            String diag = o.optString("d", "");
            String src = o.optString("src", "");

            if (!vid.equals(currentVid)) {
                currentVid = vid;
                captionFoundForVid = false;
                noCaptionSince = -1;
            }
            if (hasSource) captionFoundForVid = true;
            if (playing && !everPlayed) {
                everPlayed = true;
                firstPlayAt = now;
            }
            listener.onDiagnostics(diag + (src.isEmpty() ? "" : " · 사용: " + src));

            if (!text.isEmpty()) {
                listener.onCaption(text, false);
            } else if (!everPlayed) {
                listener.onCaption(context.getString(R.string.vr_loading), true);
            } else if (ad) {
                listener.onCaption(context.getString(R.string.vr_ad), true);
            } else if (noCaptions) {
                if (noCaptionSince < 0) noCaptionSince = now;
                listener.onCaption(now - noCaptionSince < NO_CAPTION_NOTICE_MS
                        ? context.getString(R.string.vr_no_captions) : "", true);
            } else if (!captionFoundForVid && now - firstPlayAt > SHOW_DIAG_AFTER_MS) {
                // 자막을 아직 하나도 못 찾았으면, 어디서 막혔는지 흐리게 보여 줍니다.
                listener.onCaption(context.getString(R.string.vr_searching) + "\n" + diag, true);
            } else {
                listener.onCaption("", false);
            }
        } catch (Exception e) {
            Log.w(TAG, "bad poll result", e);
        }
    }
}
