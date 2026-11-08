package com.ghj.questblack;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.TextView;

/**
 * VR 없이 확인하는 화면: 유튜브 화면을 그대로 보여 주고, 앱이 읽은 자막과 진단 정보를 위에 겹쳐 보여 줍니다.
 * 자막이 안 나올 때 어디서 막히는지 확인하는 용도입니다.
 */
public class PreviewActivity extends Activity {
    private WebView web;
    private CaptionFeed feed;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_preview);

        Intent intent = getIntent();
        String url = intent.getStringExtra(VrActivity.EXTRA_URL);
        if (url == null) {
            finish();
            return;
        }
        String lang = intent.getStringExtra(VrActivity.EXTRA_LANG);
        if (lang == null) lang = "ko";
        boolean translate = intent.getBooleanExtra(VrActivity.EXTRA_TRANSLATE, true);

        web = findViewById(R.id.web);
        TextView caption = findViewById(R.id.caption);
        TextView diag = findViewById(R.id.diag);

        feed = new CaptionFeed(this, web, lang, translate, new CaptionFeed.Listener() {
            @Override
            public void onCaption(String text, boolean dim) {
                caption.setText(text);
                caption.setTextColor(dim ? 0xFF9A9AA8 : 0xFFFFFFFF);
            }

            @Override
            public void onDiagnostics(String line) {
                diag.setText(line);
            }
        });
        feed.start(url);
    }

    @Override
    protected void onDestroy() {
        if (feed != null) feed.stop();
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
