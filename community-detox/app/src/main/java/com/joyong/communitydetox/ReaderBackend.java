package com.joyong.communitydetox;

import android.annotation.SuppressLint;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * The reader's "server": loads the four boards' pages in a hidden WebView (so the sites' own
 * browser checks pass, like in a normal browser) and hands the page HTML to the reader screen.
 * Only fixed addresses on the three sites are ever loaded — the screen asks for a board and a post
 * number, never for a URL. This app is excluded from the blocking VPN, so these pages load here
 * while every other app (browsers) stays blocked.
 */
final class ReaderBackend {

    static final String[] BOARDS = {"해외축구", "롤", "특갤", "나무 실검"};
    private static final String[] FM_MID = {"football_world", "lol"};
    private static final String DESKTOP_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
    private static final long TIMEOUT_MS = 30_000;

    private final WebView fetcher;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Object queue = new Object();
    private String expectedHost = "";
    private volatile String loadError;

    @SuppressLint("SetJavaScriptEnabled")
    ReaderBackend(WebView fetcher) {
        this.fetcher = fetcher;
        WebSettings s = fetcher.getSettings();
        s.setJavaScriptEnabled(true);           // the sites' own "please wait" checks need it
        s.setDomStorageEnabled(true);
        s.setUserAgentString(DESKTOP_UA);       // desktop pages = the layouts the parsers know
        s.setLoadsImagesAutomatically(false);
        s.setBlockNetworkImage(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(fetcher, true);
        fetcher.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !allowedSite(request.getUrl().getHost()); // stay on the three sites
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request.isForMainFrame()) loadError = "사이트에 연결하지 못했어요 (" + error.getDescription() + ")";
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String path = request.getUrl().getPath() == null ? "" : request.getUrl().getPath().toLowerCase(Locale.ROOT);
                // Skip heavy files the hidden page doesn't need (faster loading).
                if (path.matches(".*\\.(jpg|jpeg|png|gif|webp|mp4|webm|woff2?|ttf|svg|ico)$")) {
                    return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
                }
                return null;
            }
        });
    }

    static boolean allowedSite(String host) {
        if (host == null) return false;
        host = host.toLowerCase(Locale.ROOT);
        return host.equals("fmkorea.com") || host.endsWith(".fmkorea.com")
                || host.equals("dcinside.com") || host.endsWith(".dcinside.com")
                || host.equals("arca.live") || host.endsWith(".arca.live");
    }

    // ------------------------------------------------------------------ API used by the reader screen

    JSONObject list(int board, int page) throws Exception {
        String url;
        if (board == 0 || board == 1) {
            url = "https://www.fmkorea.com/index.php?mid=" + FM_MID[board] + "&sort_index=pop&order_type=desc&listStyle=list&page=" + page;
        } else if (board == 2) {
            url = "https://gall.dcinside.com/mgallery/board/lists/?id=thesingularity&exception_mode=recommend&page=" + page;
        } else {
            url = "https://arca.live/b/namuhotnow?p=" + page;
        }
        return new JSONObject().put("ok", true).put("html", loadHtml(url, null, null));
    }

    JSONObject post(int board, long no) throws Exception {
        return new JSONObject().put("ok", true).put("no", String.valueOf(no))
                .put("html", loadHtml(postUrl(board, no), null, board < 2 ? WAIT_FM_COMMENTS : null));
    }

    JSONObject comments(int board, long no, int page) throws Exception {
        if (board == 2) {
            // DC loads comments separately: ask from inside the post page, like the page itself does.
            String js = "(function(no,page){try{"
                    + "var e=document.querySelector('input[name=\"e_s_n_o\"]');"
                    + "var body='id=thesingularity&no='+no+'&cmt_id=thesingularity&cmt_no='+no+'&focus_cno=&focus_pno=&e_s_n_o='"
                    + "+encodeURIComponent(e?e.value:'')+'&comment_page='+page+'&sort=D&prevCnt=0&_GALLTYPE_=M&board_type=';"
                    + "var x=new XMLHttpRequest();x.open('POST','/board/comment/',false);"
                    + "x.setRequestHeader('Content-Type','application/x-www-form-urlencoded; charset=UTF-8');"
                    + "x.setRequestHeader('X-Requested-With','XMLHttpRequest');x.send(body);"
                    + "var d=JSON.parse(x.responseText||'{}');"
                    + "var list=(d.comments||[]).filter(function(c){return c&&c.no&&c.nicktype!=='COMMENT_BOY'&&c.del_yn!=='Y';});"
                    + "return JSON.stringify({ok:true,no:String(no),page:page,total:Number(d.total_cnt||list.length),"
                    + "pagination:String(d.pagination||''),comments:list.map(function(c){return {id:String(c.no),"
                    + "name:String(c.name||''),date:String(c.reg_date||''),depth:Number(c.depth||0),memo:String(c.memo||'')};})});"
                    + "}catch(err){return JSON.stringify({ok:false,message:String(err)});}})(" + no + "," + page + ")";
            String json = loadHtml(postUrl(board, no), js, null);
            return new JSONObject(json);
        }
        String url = board == 3
                ? "https://arca.live/b/namuhotnow/" + no + "?cp=" + page
                : "https://www.fmkorea.com/index.php?mid=" + FM_MID[board] + "&document_srl=" + no + "&cpage=" + page;
        return new JSONObject().put("ok", true).put("no", String.valueOf(no))
                .put("html", loadHtml(url, null, board < 2 ? WAIT_FM_COMMENTS : null));
    }

    private static String postUrl(int board, long no) {
        if (board == 2) return "https://gall.dcinside.com/mgallery/board/view/?id=thesingularity&no=" + no;
        if (board == 3) return "https://arca.live/b/namuhotnow/" + no;
        return "https://www.fmkorea.com/" + no;
    }

    /** Images in posts need the site as Referer (they refuse other sites). Only the three sites' image hosts. */
    static WebResourceResponse image(String raw) {
        try {
            if (raw == null) return null;
            if (raw.startsWith("//")) raw = "https:" + raw;
            Uri u = Uri.parse(raw);
            String host = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
            String referer;
            if (host.endsWith("dcinside.co.kr") || host.endsWith("dcinside.com")) referer = "https://gall.dcinside.com/";
            else if (host.endsWith("fmkorea.com")) referer = "https://www.fmkorea.com/";
            else if (host.endsWith("namu.la") || host.endsWith("arca.live")) referer = "https://arca.live/";
            else return null;
            if (!"https".equals(u.getScheme()) && !"http".equals(u.getScheme())) return null;
            HttpURLConnection c = (HttpURLConnection) new URL(raw).openConnection();
            c.setConnectTimeout(10000);
            c.setReadTimeout(20000);
            c.setRequestProperty("Referer", referer);
            c.setRequestProperty("User-Agent", DESKTOP_UA);
            int code = c.getResponseCode();
            if (code != 200) return null;
            String type = c.getContentType() == null ? "image/jpeg" : c.getContentType().split(";")[0];
            if (!type.startsWith("image/")) return null;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (InputStream in = c.getInputStream()) {
                byte[] buf = new byte[16384];
                int n, total = 0;
                while ((n = in.read(buf)) > 0) {
                    total += n;
                    if (total > 12 * 1024 * 1024) return null; // no huge files
                    out.write(buf, 0, n);
                }
            }
            return new WebResourceResponse(type, null, new ByteArrayInputStream(out.toByteArray()));
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    // ------------------------------------------------------------------ hidden page loading

    /**
     * Loads {@code url} in the hidden WebView (one page at a time), waits until the page is really
     * there (not a "please wait" check), then returns its HTML — or the result of {@code script}.
     * Must not be called on the main thread.
     */
    /**
     * 펨코 adds comments after the page has loaded (and only when the comment area comes into view):
     * scroll there and report true once comment rows (or a "no comments" note) are on the page.
     */
    private static final String WAIT_FM_COMMENTS = "(function(){"
            + "var r=document.querySelector('#cmtPosition,.fdb_lst_wrp,.fdb_lst,#comment,#comment_list,.comment_list');"
            + "if(r){r.scrollIntoView();}else{window.scrollTo(0,document.body.scrollHeight);}"
            + "var rows=document.querySelectorAll('.fdb_lst [id^=\"comment_\"],li.fdb_itm,[data-comment-srl],#cmt_list li,#comment_list li').length;"
            + "var t=(r||document.body).innerText.slice(0,3000);"
            + "return rows>0||/등록된 댓글이 없|댓글이 없습니다|댓글 0/.test(t);})()";
    private static final long COMMENT_WAIT_MS = 8_000;

    private String loadHtml(String url, String script, String waitFor) throws Exception {
        synchronized (queue) {
            loadError = null;
            expectedHost = Uri.parse(url).getHost();
            CountDownLatch done = new CountDownLatch(1);
            AtomicReference<String> result = new AtomicReference<>();
            AtomicReference<String> error = new AtomicReference<>();
            long deadline = System.currentTimeMillis() + TIMEOUT_MS;
            main.post(() -> {
                fetcher.stopLoading();
                fetcher.loadUrl(url);
                main.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        if (loadError != null || System.currentTimeMillis() > deadline) {
                            error.set(loadError != null ? loadError : "사이트가 응답하지 않아요");
                            done.countDown();
                            return;
                        }
                        fetcher.evaluateJavascript(READY_CHECK, value -> {
                            boolean ready = false;
                            try {
                                JSONObject st = new JSONObject(unquote(value));
                                ready = "complete".equals(st.optString("rs")) && !st.optBoolean("wait")
                                        && st.optInt("len") > 200 && siteOf(expectedHost).equals(siteOf(st.optString("host")));
                            } catch (Exception ignored) {
                            }
                            if (!ready) {
                                main.postDelayed(this, 700);
                                return;
                            }
                            Runnable grab = () -> fetcher.evaluateJavascript(
                                    script != null ? script : "document.documentElement.outerHTML", v -> {
                                        try {
                                            result.set(unquote(v));
                                        } catch (Exception e) {
                                            error.set("페이지를 읽지 못했어요");
                                        }
                                        done.countDown();
                                    });
                            if (waitFor == null) {
                                grab.run();
                                return;
                            }
                            // Wait (a few seconds at most) for content the page adds later, e.g. comments.
                            long until = System.currentTimeMillis() + COMMENT_WAIT_MS;
                            main.post(new Runnable() {
                                @Override
                                public void run() {
                                    fetcher.evaluateJavascript(waitFor, ok -> {
                                        if ("true".equals(ok) || System.currentTimeMillis() > until) grab.run();
                                        else main.postDelayed(this, 600);
                                    });
                                }
                            });
                        });
                    }
                }, 900);
            });
            if (!done.await(TIMEOUT_MS + 3000, TimeUnit.MILLISECONDS)) throw new IOException("시간이 너무 오래 걸려요");
            if (error.get() != null) throw new IOException(error.get());
            return result.get();
        }
    }

    /** Page state as JSON: ready state, host, text length, and whether it's a "please wait / security check" page. */
    private static final String READY_CHECK = "(function(){var b=document.body,t=(document.title||'')+' '+(b?b.innerText.slice(0,300):'');"
            + "return JSON.stringify({rs:document.readyState,host:location.hostname,len:b?b.innerHTML.length:0,"
            + "wait:/잠시만|Just a moment|보안 시스템|보안 확인|Checking your browser|DDoS|사람인지/i.test(t)});})()";

    /** "gall.dcinside.com" -> "dcinside.com" (www./m. redirects count as the same site). */
    static String siteOf(String host) {
        if (host == null) return "";
        String[] p = host.toLowerCase(Locale.ROOT).split("\\.");
        return p.length < 2 ? host : p[p.length - 2] + "." + p[p.length - 1];
    }

    /** evaluateJavascript returns a JSON value; strings come back quoted. */
    private static String unquote(String v) throws Exception {
        if (v == null || v.equals("null")) return "";
        return new JSONArray("[" + v + "]").getString(0);
    }
}
