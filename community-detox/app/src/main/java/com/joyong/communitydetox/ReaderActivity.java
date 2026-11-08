package com.joyong.communitydetox;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * 모아읽기: the popular posts of a few boards (펨코 해외축구·롤, 디시 특갤, 아카 나무 실검) with comments,
 * readable only inside this app. The screen is local HTML served from
 * https://appassets.androidplatform.net/reader/ (never from the internet); its /api/* requests are
 * answered by {@link ReaderBackend}. Nothing else can be loaded, and links in posts don't navigate.
 */
public class ReaderActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/reader/index.html";
    private static final String CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
            + "connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

    private WebView ui;
    private ReaderBackend backend;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FrameLayout root = new FrameLayout(this);

        // Hidden page loader: full screen size (pages that load things only when they come into view
        // need a real viewport), sitting behind the reader screen so it's never seen.
        WebView fetcher = new WebView(this);
        root.addView(fetcher, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        backend = new ReaderBackend(fetcher);

        ui = new WebView(this);
        ui.setBackgroundColor(new Ui(this).bg); // opaque, so the page loader behind never shows through
        WebSettings s = ui.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        ui.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !HOST.equals(request.getUrl().getHost()); // links never leave the reader
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return serve(request.getUrl());
            }
        });
        root.addView(ui, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        new Ui(this).applySystemBarPadding(this, root, 0);
        setContentView(root);
        ui.loadUrl(HOME);
    }

    /** Runs on a WebView background thread. */
    private WebResourceResponse serve(Uri u) {
        if (!HOST.equals(u.getHost())) return text(403, "text/plain", "blocked"); // nothing from the internet
        String path = u.getPath() == null ? "" : u.getPath();
        try {
            if (path.startsWith("/reader/") && !path.contains("..")) {
                InputStream in = getAssets().open(path.substring(1));
                String type = path.endsWith(".css") ? "text/css" : path.endsWith(".js") ? "application/javascript" : "text/html";
                return withHeaders(new WebResourceResponse(type, "utf-8", in));
            }
            int board = clamp(u.getQueryParameter("board"), 0, 3);
            int page = clamp(u.getQueryParameter("page"), 1, 9999);
            long no = postNumber(u.getQueryParameter("no"));
            switch (path) {
                case "/api/list":
                    return json(backend.list(board, page));
                case "/api/post":
                    return json(backend.post(board, no));
                case "/api/comments":
                    return json(backend.comments(board, no, page));
                case "/img":
                    WebResourceResponse img = ReaderBackend.image(u.getQueryParameter("u"));
                    return img != null ? img : text(404, "text/plain", "");
                default:
                    return text(404, "text/plain", "not found");
            }
        } catch (Exception e) {
            try {
                return json(new JSONObject().put("ok", false).put("message",
                        e.getMessage() != null ? e.getMessage() : "불러오지 못했어요"));
            } catch (Exception ignored) {
                return text(500, "text/plain", "error");
            }
        }
    }

    private static int clamp(String v, int min, int max) {
        try {
            return Math.max(min, Math.min(max, Integer.parseInt(v)));
        } catch (Exception e) {
            return min;
        }
    }

    private static long postNumber(String v) {
        if (v == null || !v.matches("[1-9][0-9]{0,11}")) return 0;
        return Long.parseLong(v);
    }

    private static WebResourceResponse json(JSONObject o) {
        return text(200, "application/json", o.toString());
    }

    private static WebResourceResponse text(int code, String type, String body) {
        WebResourceResponse r = new WebResourceResponse(type, "utf-8",
                new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
        r.setStatusCodeAndReasonPhrase(code, code == 200 ? "OK" : "Error");
        return withHeaders(r);
    }

    private static WebResourceResponse withHeaders(WebResourceResponse r) {
        Map<String, String> h = new HashMap<>();
        h.put("Content-Security-Policy", CSP);
        h.put("Cache-Control", "no-store");
        h.put("X-Content-Type-Options", "nosniff");
        r.setResponseHeaders(h);
        return r;
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // Inside a post: back to the list. On the list: leave the reader.
        ui.evaluateJavascript("window.Reader?Reader.back():false", v -> {
            if (!"true".equals(v)) finish();
        });
    }

    @Override
    protected void onDestroy() {
        if (ui != null) ui.destroy();
        super.onDestroy();
    }
}
