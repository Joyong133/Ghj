package com.ghj.questblack;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.Toast;

/**
 * 몰입형(VR) 화면. 시야 전체는 C++(OpenXR) 쪽이 검게 그리고,
 * 여기서는 보이지 않는 WebView로 유튜브를 재생하면서 자막 글자를 읽어 와 넘겨줍니다.
 */
public class VrActivity extends Activity {
    static final String EXTRA_URL = "url";
    static final String EXTRA_LANG = "lang";
    static final String EXTRA_TRANSLATE = "translate";
    static final String EXTRA_CAPTION_WIDTH = "caption_width";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final CaptionImage captionImage = new CaptionImage();
    private WebView web;
    private CaptionFeed feed;
    private boolean nativeStarted;
    private String shownText;
    private boolean shownDim;

    private final Runnable exitCheck = new Runnable() {
        @Override
        public void run() {
            if (NativeBridge.consumeExitRequest()) {
                finish();
                return;
            }
            if (nativeStarted && NativeBridge.status() < 0) {
                nativeStarted = false;
                Toast.makeText(VrActivity.this, R.string.vr_failed, Toast.LENGTH_LONG).show();
            }
            handler.postDelayed(this, 200);
        }
    };

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

        // 유튜브를 재생하는 WebView. VR 화면에서는 보이지 않지만 소리와 자막은 여기서 나옵니다.
        web = new WebView(this);
        FrameLayout root = new FrameLayout(this);
        root.addView(web, new FrameLayout.LayoutParams(1280, 720));
        setContentView(root, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        NativeBridge.start(this, captionWidth);
        nativeStarted = true;

        feed = new CaptionFeed(this, web, lang, translate, this::showCaption);
        feed.start(url);
        handler.postDelayed(exitCheck, 200);
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
        handler.removeCallbacks(exitCheck);
        if (feed != null) feed.stop();
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
