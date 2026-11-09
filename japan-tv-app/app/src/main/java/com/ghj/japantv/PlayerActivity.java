package com.ghj.japantv;

import android.annotation.SuppressLint;
import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Rational;
import android.view.GestureDetector;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.lifecycle.Lifecycle;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 채널 재생 화면. 영상만 검은 화면에 꽉 차게 보여 줍니다.
 * <ul>
 *   <li>유튜브 채널: 지금 방송 중인 라이브를 찾아서 유튜브 공식 임베드 플레이어로 영상만 재생</li>
 *   <li>임베드가 막힌 영상이나 일반 웹 페이지: 페이지를 열고 영상 부분만 화면 가득 보이게 함</li>
 *   <li>m3u8/mp4 스트림: ExoPlayer로 직접 재생</li>
 * </ul>
 * 화면을 한 번 누르면 메뉴가 나오고, 좌우로 밀면 채널이 바뀝니다.
 */
@OptIn(markerClass = UnstableApi.class)
public class PlayerActivity extends AppCompatActivity {
    public static final String EXTRA_CHANNEL_ID = "channel_id";

    private static final int MODE_NONE = 0;
    private static final int MODE_EMBED = 1;
    private static final int MODE_PAGE = 2;
    private static final int MODE_STREAM = 3;

    private static final long OVERLAY_MS = 4_000L;
    private static final long STALL_MS = 25_000L;
    private static final long TOUCH_PASSTHROUGH_MS = 10_000L;
    private static final long FIRST_RETRY_MS = 3_000L;
    private static final long MAX_RETRY_MS = 30_000L;
    private static final long CACHE_MS = 10 * 60_000L;

    /** 채널 주소 → 찾아 둔 영상 ID (채널을 다시 열 때 빨리 시작하려고) */
    private static final Map<String, CachedIds> CACHE = new HashMap<>();
    /** 임베드가 막혀 있는 영상 ID */
    private static final Set<String> NO_EMBED = new HashSet<>();

    private static final String JS_PAUSE =
            "try{if(window.jtvPlayer&&jtvPlayer.pauseVideo){jtvPlayer.pauseVideo();}}catch(e){}"
                    + "document.querySelectorAll('video,audio').forEach(function(v){try{v.pause();}catch(e){}});";
    private static final String JS_PLAY =
            "try{if(window.jtvPlayer&&jtvPlayer.playVideo){jtvPlayer.playVideo();}}catch(e){}"
                    + "document.querySelectorAll('video').forEach(function(v){try{if(v.paused){v.play();}}catch(e){}});";
    private static final String JS_UNMUTE =
            "try{if(window.jtvPlayer&&jtvPlayer.unMute){jtvPlayer.unMute();jtvPlayer.setVolume(100);}}catch(e){}"
                    + "document.querySelectorAll('video').forEach(function(v){try{v.muted=false;}catch(e){}});";

    public static void start(Context context, String channelId) {
        Intent i = new Intent(context, PlayerActivity.class);
        i.putExtra(EXTRA_CHANNEL_ID, channelId);
        context.startActivity(i);
    }

    private static final class CachedIds {
        final List<String> ids;
        final long at;

        CachedIds(List<String> ids, long at) {
            this.ids = ids;
            this.at = at;
        }
    }

    private Prefs prefs;
    private WebView webView;
    private PlayerView playerView;
    private View touchLayer;
    private View overlay;
    private View statusBox;
    private View statusProgress;
    private View statusButtons;
    private View btnMenu;
    private View btnPip;
    private TextView titleView;
    private TextView statusText;
    private TextView hintText;
    private TextView btnCc;
    private TextView btnAlt;
    private TextView btnPage;
    private TextView btnTouch;
    private FrameLayout fullscreenContainer;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private ExoPlayer player;
    private List<Channel> channels = new ArrayList<>();
    private Channel current;
    private int mode = MODE_NONE;
    /** 채널을 바꾸거나 영상을 다시 불러올 때마다 올라가서, 늦게 도착한 이전 결과를 무시합니다. */
    private int token;
    private List<String> candidates = new ArrayList<>();
    private int candidateIdx;
    private boolean candidatesFromCache;
    private boolean embedBroken;
    private boolean mutedAutoplay;
    private boolean everPlayed;
    private boolean clearHistoryOnLoad;
    private boolean forceHls;
    private long retryDelayMs = FIRST_RETRY_MS;
    private long watchStart;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;

    private final Runnable hideOverlayRunnable = this::hideOverlay;
    private final Runnable stallRunnable = () -> onEmbedFailed(-1);
    private final Runnable retryRunnable = () -> {
        if (current != null) play(current, false);
    };
    private final Runnable streamRetryRunnable = () -> {
        if (current != null && current.isStream()) startStream(current);
    };
    private final Runnable videoOnlyRunnable = this::applyVideoOnlyCss;
    private final Runnable restoreTouchRunnable = this::updateModeUi;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_player);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        prefs = new Prefs(this);

        webView = findViewById(R.id.webView);
        playerView = findViewById(R.id.playerView);
        touchLayer = findViewById(R.id.touchLayer);
        overlay = findViewById(R.id.overlay);
        statusBox = findViewById(R.id.statusBox);
        statusProgress = findViewById(R.id.statusProgress);
        statusButtons = findViewById(R.id.statusButtons);
        statusText = findViewById(R.id.statusText);
        hintText = findViewById(R.id.hintText);
        titleView = findViewById(R.id.channelTitle);
        btnMenu = findViewById(R.id.btnMenu);
        btnPip = findViewById(R.id.btnPip);
        btnCc = findViewById(R.id.btnCc);
        btnAlt = findViewById(R.id.btnAlt);
        btnPage = findViewById(R.id.btnPage);
        btnTouch = findViewById(R.id.btnTouch);
        fullscreenContainer = findViewById(R.id.fullscreenContainer);

        findViewById(R.id.btnBack).setOnClickListener(v -> finish());
        findViewById(R.id.btnPrev).setOnClickListener(v -> switchChannel(-1));
        findViewById(R.id.btnNext).setOnClickListener(v -> switchChannel(1));
        findViewById(R.id.btnReload).setOnClickListener(v -> reload());
        findViewById(R.id.btnRotate).setOnClickListener(v -> toggleRotation());
        findViewById(R.id.btnStatusRetry).setOnClickListener(v -> reload());
        findViewById(R.id.btnStatusNext).setOnClickListener(v -> switchChannel(1));
        btnPip.setOnClickListener(v -> enterPip(true));
        btnCc.setOnClickListener(v -> toggleCaptions());
        btnAlt.setOnClickListener(v -> nextCandidate());
        btnPage.setOnClickListener(v -> togglePageMode());
        btnTouch.setOnClickListener(v -> allowDirectTouch());
        btnMenu.setOnClickListener(v -> toggleOverlay());
        if (!pipSupported()) btnPip.setVisibility(View.GONE);

        applyOrientationLock();
        hideSystemBars();
        setupWebView();
        setupTouchLayer();

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (customView != null) {
                    hideCustomView();
                } else if (mode == MODE_PAGE && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    finish();
                }
            }
        });

        handleIntent(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        channels = new ChannelStore(this).load();
        String id = intent != null ? intent.getStringExtra(EXTRA_CHANNEL_ID) : null;
        Channel target = null;
        for (Channel c : channels) {
            if (c.id.equals(id)) {
                target = c;
                break;
            }
        }
        if (target == null && !channels.isEmpty()) target = channels.get(0);
        if (target == null) {
            finish();
            return;
        }
        play(target, true);
    }

    // ================= 채널 재생 =================

    private void play(Channel ch, boolean showMenu) {
        token++;
        current = ch;
        prefs.setLastChannelId(ch.id);
        titleView.setText(ch.icon + "  " + ch.name);
        handler.removeCallbacks(stallRunnable);
        handler.removeCallbacks(retryRunnable);
        handler.removeCallbacks(streamRetryRunnable);
        handler.removeCallbacks(restoreTouchRunnable);
        if (customView != null) hideCustomView();
        mutedAutoplay = false;
        everPlayed = false;
        hintText.setVisibility(View.GONE);
        candidates = new ArrayList<>();
        candidateIdx = 0;

        if (ch.isStream()) {
            webView.stopLoading();
            webView.loadUrl("about:blank");
            webView.setVisibility(View.GONE);
            playerView.setVisibility(View.VISIBLE);
            mode = MODE_STREAM;
            retryDelayMs = FIRST_RETRY_MS;
            forceHls = false;
            showStatus("불러오는 중…", true, false);
            startStream(ch);
        } else {
            releasePlayer();
            playerView.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            if (LiveResolver.isYouTube(ch.url)) {
                resolveAndPlay(ch);
            } else {
                loadPage(ch.url);
            }
        }
        updateModeUi();
        if (showMenu) showOverlay();
        updatePipParams();
    }

    private void reload() {
        if (current == null) return;
        CACHE.remove(current.url);
        embedBroken = false;
        play(current, true);
    }

    private void switchChannel(int delta) {
        if (channels.isEmpty()) return;
        int idx = 0;
        for (int i = 0; i < channels.size(); i++) {
            if (current != null && channels.get(i).id.equals(current.id)) {
                idx = i;
                break;
            }
        }
        int n = channels.size();
        play(channels.get(((idx + delta) % n + n) % n), true);
    }

    // ---------- 유튜브: 라이브 찾기 → 임베드 플레이어 ----------

    private void resolveAndPlay(Channel ch) {
        mode = MODE_NONE;
        webView.loadUrl("about:blank");
        showStatus("채널 연결 중…", true, false);

        CachedIds cached = CACHE.get(ch.url);
        if (cached != null && !cached.ids.isEmpty() && SystemClock.elapsedRealtime() - cached.at < CACHE_MS) {
            candidatesFromCache = true;
            startCandidates(cached.ids);
            return;
        }
        candidatesFromCache = false;
        final int t = token;
        final String url = ch.url;
        executor.execute(() -> {
            List<String> ids;
            boolean failed = false;
            try {
                ids = LiveResolver.resolve(url);
            } catch (Exception e) {
                ids = new ArrayList<>();
                failed = true;
            }
            final List<String> result = ids;
            final boolean networkFailed = failed;
            runOnUiThread(() -> {
                if (t != token || isFinishing() || isDestroyed()) return;
                if (result.isEmpty()) {
                    mode = MODE_NONE;
                    updateModeUi();
                    if (networkFailed) {
                        showStatus("방송을 찾지 못했어요. 인터넷 연결을 확인해 주세요.\n잠시 뒤에 자동으로 다시 시도해요.", false, true);
                        handler.postDelayed(retryRunnable, 15_000L);
                    } else {
                        showStatus("지금 이 채널은 라이브 방송을 하고 있지 않아요.", false, true);
                    }
                    return;
                }
                CACHE.put(url, new CachedIds(result, SystemClock.elapsedRealtime()));
                startCandidates(result);
            });
        });
    }

    private void startCandidates(List<String> ids) {
        candidates = new ArrayList<>(ids);
        candidateIdx = 0;
        // 임베드가 막힌 영상은 건너뜁니다.
        while (candidateIdx < candidates.size() - 1 && NO_EMBED.contains(candidates.get(candidateIdx))) {
            candidateIdx++;
        }
        String id = candidates.get(candidateIdx);
        if (embedBroken || NO_EMBED.contains(id)) {
            loadPage(watchUrl(id));
        } else {
            loadEmbed();
        }
    }

    private void loadEmbed() {
        token++;
        mode = MODE_EMBED;
        everPlayed = false;
        mutedAutoplay = false;
        hintText.setVisibility(View.GONE);
        updateModeUi();
        showStatus("불러오는 중…", true, false);
        String id = candidates.get(candidateIdx);
        // 앱 패키지 이름을 출처(Referer)로 보내야 유튜브 임베드가 정상 재생됩니다.
        webView.loadDataWithBaseURL("https://" + getPackageName() + "/",
                embedHtml(id, prefs.isCaptions(), token), "text/html", "utf-8", null);
        handler.removeCallbacks(stallRunnable);
        handler.postDelayed(stallRunnable, STALL_MS);
    }

    private static String embedHtml(String videoId, boolean captions, int tok) {
        if (!LiveResolver.isValidId(videoId)) videoId = "";
        return "<!DOCTYPE html><html><head><meta charset='utf-8'>"
                + "<meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no'>"
                + "<style>html,body{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden}"
                + "#p,iframe{position:absolute;top:0;left:0;width:100%!important;height:100%!important;border:0}</style>"
                + "</head><body><div id='p'></div><script>"
                + "var T=" + tok + ",jtvPlayer=null,started=false;"
                + "function onYouTubeIframeAPIReady(){"
                + "jtvPlayer=new YT.Player('p',{width:'100%',height:'100%',videoId:'" + videoId + "',"
                + "playerVars:{autoplay:1,playsinline:1,controls:0,disablekb:1,fs:0,rel:0,iv_load_policy:3,"
                + (captions ? "cc_load_policy:1,cc_lang_pref:'ja',hl:'ja'," : "")
                + "origin:location.origin,widget_referrer:location.href},"
                + "events:{"
                + "onReady:function(e){e.target.playVideo();"
                + "setTimeout(function(){try{var s=e.target.getPlayerState();"
                + "if(!started&&(s===-1||s===5)){e.target.mute();e.target.playVideo();JTV.onMuted(T);}}catch(x){}},3500);},"
                + "onStateChange:function(e){if(e.data===1){started=true;}JTV.onState(T,e.data);},"
                + "onError:function(e){JTV.onError(T,e.data);}"
                + "}});}"
                + "</script><script src='https://www.youtube.com/iframe_api'></script></body></html>";
    }

    private static String watchUrl(String id) {
        return "https://m.youtube.com/watch?v=" + id;
    }

    /** 임베드 플레이어에서 오는 신호 (자바스크립트 → 앱) */
    private final class Bridge {
        @JavascriptInterface
        public void onState(int t, int state) {
            runOnUiThread(() -> {
                if (t == token) onEmbedState(state);
            });
        }

        @JavascriptInterface
        public void onError(int t, int code) {
            runOnUiThread(() -> {
                if (t == token) onEmbedFailed(code);
            });
        }

        @JavascriptInterface
        public void onMuted(int t) {
            runOnUiThread(() -> {
                if (t != token) return;
                mutedAutoplay = true;
                hintText.setVisibility(View.VISIBLE);
            });
        }
    }

    private void onEmbedState(int state) {
        if (mode != MODE_EMBED) return;
        if (state == 1) { // 재생 중
            everPlayed = true;
            handler.removeCallbacks(stallRunnable);
            retryDelayMs = FIRST_RETRY_MS;
            hideStatus();
        } else if (state == 0) { // 방송 종료
            showStatus("방송이 끝났어요. 새 방송을 찾는 중…", true, false);
            if (current != null) CACHE.remove(current.url);
            handler.removeCallbacks(retryRunnable);
            handler.postDelayed(retryRunnable, 5_000L);
        } else if (state == 3 && !everPlayed) { // 버퍼링
            showStatus("불러오는 중…", true, false);
        }
    }

    private void onEmbedFailed(int code) {
        if (mode != MODE_EMBED || candidates.isEmpty()) return;
        handler.removeCallbacks(stallRunnable);
        String id = candidates.get(candidateIdx);
        if (code == 152 || code == 153) embedBroken = true;
        if (code == 101 || code == 150) NO_EMBED.add(id);

        if (!embedBroken && candidateIdx + 1 < candidates.size()) {
            candidateIdx++;
            loadEmbed();
            return;
        }
        if (candidatesFromCache && current != null) {
            // 예전에 찾아 둔 영상이 끝났을 수 있으니 새로 찾습니다.
            CACHE.remove(current.url);
            play(current, false);
            return;
        }
        // 임베드로 볼 수 없는 영상 → 유튜브 페이지를 열고 영상만 보이게 합니다.
        loadPage(watchUrl(candidates.get(0)));
    }

    private void nextCandidate() {
        if (candidates.size() < 2) return;
        candidateIdx = (candidateIdx + 1) % candidates.size();
        loadEmbed();
        toast("다른 라이브 (" + (candidateIdx + 1) + "/" + candidates.size() + ")");
        showOverlay();
    }

    private void toggleCaptions() {
        boolean on = !prefs.isCaptions();
        prefs.setCaptions(on);
        if (mode == MODE_EMBED) loadEmbed();
        toast(on ? "일본어 자막을 켰어요 (자막이 없는 방송도 있어요)" : "자막을 껐어요");
        updateModeUi();
        showOverlay();
    }

    private void togglePageMode() {
        if (candidates.isEmpty()) return;
        String id = candidates.get(candidateIdx);
        if (mode == MODE_EMBED) {
            loadPage(watchUrl(id));
        } else if (mode == MODE_PAGE) {
            embedBroken = false;
            NO_EMBED.remove(id);
            loadEmbed();
        }
        showOverlay();
    }

    /** 잠깐 동안 영상 화면을 직접 누를 수 있게 합니다 (광고 건너뛰기 등). */
    private void allowDirectTouch() {
        hideOverlay();
        touchLayer.setVisibility(View.GONE);
        handler.removeCallbacks(restoreTouchRunnable);
        handler.postDelayed(restoreTouchRunnable, TOUCH_PASSTHROUGH_MS);
        toast("10초 동안 영상 화면을 직접 누를 수 있어요 (광고 건너뛰기 등)");
    }

    // ---------- 웹 페이지 (영상만 보이게) ----------

    private void loadPage(String url) {
        token++;
        mode = MODE_PAGE;
        handler.removeCallbacks(stallRunnable);
        updateModeUi();
        showStatus("불러오는 중…", true, false);
        clearHistoryOnLoad = true;
        webView.loadUrl(url);
    }

    private void scheduleVideoOnly() {
        handler.removeCallbacks(videoOnlyRunnable);
        applyVideoOnlyCss();
        // 유튜브는 페이지가 뜬 뒤에 플레이어를 만들기 때문에 조금 뒤에 몇 번 더 적용합니다.
        handler.postDelayed(videoOnlyRunnable, 1_500L);
        handler.postDelayed(videoOnlyRunnable, 4_000L);
        handler.postDelayed(videoOnlyRunnable, 8_000L);
    }

    private void applyVideoOnlyCss() {
        if (mode != MODE_PAGE) return;
        webView.evaluateJavascript(VIDEO_ONLY_JS, null);
    }

    /** 페이지에서 영상 플레이어만 화면 가득 보이게 하는 스타일 */
    private static final String VIDEO_ONLY_JS = "(function(){"
            + "var id='__jtv_tv';var s=document.getElementById(id);"
            + "var sel=document.getElementById('movie_player')?'#movie_player':"
            + "(document.querySelector('.html5-video-player')?'.html5-video-player':"
            + "(document.querySelector('video')?'video':null));"
            + "if(!sel){if(s){s.parentNode.removeChild(s);}return;}"
            + "if(!s){s=document.createElement('style');s.id=id;(document.head||document.documentElement).appendChild(s);}"
            + "var full='position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;"
            + "width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;"
            + "margin:0!important;z-index:2147483646!important;background:#000!important;transform:none!important;';"
            + "var css='html,body{overflow:hidden!important;background:#000!important;}'+sel+'{'+full+'}';"
            + "if(sel!=='video'){css+=sel+' video{width:100vw!important;height:100vh!important;left:0!important;"
            + "top:0!important;object-fit:contain!important;}';}"
            + "else{css+='video{object-fit:contain!important;}';}"
            + "if(s.textContent!==css){s.textContent=css;window.dispatchEvent(new Event('resize'));}"
            + "})();";

    // ---------- 스트림 (ExoPlayer) ----------

    private void startStream(Channel ch) {
        if (player == null) {
            player = buildPlayer();
            playerView.setPlayer(player);
        }
        MediaItem.Builder b = new MediaItem.Builder().setUri(ch.url);
        String lower = ch.url.toLowerCase(Locale.ROOT);
        if (lower.contains(".m3u8") || forceHls) {
            b.setMimeType(MimeTypes.APPLICATION_M3U8);
        } else if (lower.contains(".mpd")) {
            b.setMimeType(MimeTypes.APPLICATION_MPD);
        }
        player.setMediaItem(b.build());
        player.prepare();
        player.setPlayWhenReady(true);
    }

    private ExoPlayer buildPlayer() {
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setAllowCrossProtocolRedirects(true)
                .setUserAgent("Mozilla/5.0 (Linux; Android " + Build.VERSION.RELEASE + ") JapanTV/1.0");
        DefaultDataSource.Factory data = new DefaultDataSource.Factory(this, http);
        final ExoPlayer p = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(this).setDataSourceFactory(data))
                .build();
        p.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY) {
                    retryDelayMs = FIRST_RETRY_MS;
                    everPlayed = true;
                    hideStatus();
                } else if (state == Player.STATE_BUFFERING && !everPlayed) {
                    showStatus("불러오는 중…", true, false);
                } else if (state == Player.STATE_ENDED) {
                    scheduleStreamRetry("방송이 끝났거나 잠시 끊겼어요.");
                }
            }

            @Override
            public void onPlayerError(@NonNull PlaybackException error) {
                if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
                    p.seekToDefaultPosition();
                    p.prepare();
                    return;
                }
                boolean formatError = error.errorCode == PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED
                        || error.errorCode == PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED;
                if (formatError && !forceHls && current != null
                        && !current.url.toLowerCase(Locale.ROOT).contains(".mpd")) {
                    // 확장자가 없는 HLS 주소일 수 있으니 HLS로 한 번 더 시도합니다.
                    forceHls = true;
                    startStream(current);
                    return;
                }
                scheduleStreamRetry("재생 오류 (" + error.getErrorCodeName() + ")");
            }
        });
        return p;
    }

    private void scheduleStreamRetry(String reason) {
        showStatus(reason + "\n" + (retryDelayMs / 1000) + "초 뒤에 자동으로 다시 연결해요.", false, true);
        handler.removeCallbacks(streamRetryRunnable);
        handler.postDelayed(streamRetryRunnable, retryDelayMs);
        retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_MS);
    }

    private void releasePlayer() {
        handler.removeCallbacks(streamRetryRunnable);
        if (player != null) {
            playerView.setPlayer(null);
            player.release();
            player = null;
        }
    }

    // ================= 화면 표시 =================

    private void updateModeUi() {
        boolean pip = isInPictureInPictureMode();
        boolean youtube = current != null && !current.isStream() && LiveResolver.isYouTube(current.url);
        touchLayer.setVisibility(mode == MODE_PAGE ? View.GONE : View.VISIBLE);
        btnMenu.setVisibility(mode == MODE_PAGE && !pip ? View.VISIBLE : View.GONE);
        btnCc.setVisibility(mode == MODE_EMBED ? View.VISIBLE : View.GONE);
        btnCc.setText(prefs.isCaptions() ? "자막 켜짐" : "자막 꺼짐");
        btnAlt.setVisibility(mode == MODE_EMBED && candidates.size() > 1 ? View.VISIBLE : View.GONE);
        btnPage.setVisibility(youtube && !candidates.isEmpty() && (mode == MODE_EMBED || mode == MODE_PAGE)
                ? View.VISIBLE : View.GONE);
        btnPage.setText(mode == MODE_PAGE ? "영상만 보기" : "유튜브 화면으로");
        btnTouch.setVisibility(mode == MODE_EMBED ? View.VISIBLE : View.GONE);
        if (mode == MODE_PAGE) scheduleVideoOnly();
    }

    private void showStatus(String text, boolean progress, boolean buttons) {
        statusText.setText(text);
        statusProgress.setVisibility(progress ? View.VISIBLE : View.GONE);
        statusButtons.setVisibility(buttons ? View.VISIBLE : View.GONE);
        statusBox.setVisibility(View.VISIBLE);
    }

    private void hideStatus() {
        statusBox.setVisibility(View.GONE);
    }

    private void showOverlay() {
        if (isInPictureInPictureMode()) return;
        overlay.setVisibility(View.VISIBLE);
        handler.removeCallbacks(hideOverlayRunnable);
        handler.postDelayed(hideOverlayRunnable, OVERLAY_MS);
    }

    private void hideOverlay() {
        handler.removeCallbacks(hideOverlayRunnable);
        overlay.setVisibility(View.GONE);
    }

    private void toggleOverlay() {
        if (overlay.getVisibility() == View.VISIBLE) hideOverlay();
        else showOverlay();
    }

    private void onScreenTap() {
        if (mutedAutoplay) {
            webView.evaluateJavascript(JS_UNMUTE, null);
            mutedAutoplay = false;
            hintText.setVisibility(View.GONE);
            return;
        }
        toggleOverlay();
    }

    @SuppressLint("ClickableViewAccessibility")
    private void setupTouchLayer() {
        final float minSwipe = 80 * getResources().getDisplayMetrics().density;
        final GestureDetector detector = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onDown(MotionEvent e) {
                return true;
            }

            @Override
            public boolean onSingleTapConfirmed(MotionEvent e) {
                onScreenTap();
                return true;
            }

            @Override
            public boolean onFling(MotionEvent e1, MotionEvent e2, float velocityX, float velocityY) {
                if (e1 == null || e2 == null) return false;
                float dx = e2.getX() - e1.getX();
                float dy = e2.getY() - e1.getY();
                if (Math.abs(dx) > minSwipe && Math.abs(dx) > Math.abs(dy) * 1.5f) {
                    switchChannel(dx < 0 ? 1 : -1);
                    return true;
                }
                return false;
            }
        });
        touchLayer.setOnTouchListener((v, ev) -> {
            detector.onTouchEvent(ev);
            return true;
        });
    }

    private void applyOrientationLock() {
        setRequestedOrientation(prefs.isLandscapeLock()
                ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
    }

    private void toggleRotation() {
        boolean lock = !prefs.isLandscapeLock();
        prefs.setLandscapeLock(lock);
        applyOrientationLock();
        toast(lock ? "가로 화면으로 고정했어요" : "휴대폰 방향을 따라 화면이 돌아가요");
        showOverlay();
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.systemBars());
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    public void onConfigurationChanged(@NonNull Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        hideSystemBars();
        if (mode == MODE_PAGE) scheduleVideoOnly();
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    // ================= WebView =================

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void setupWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportMultipleWindows(false);
        // 일반 모바일 크롬처럼 보이게 해서 유튜브 페이지가 제대로 나오게 합니다.
        String ua = s.getUserAgentString();
        if (ua != null) {
            s.setUserAgentString(ua.replace("; wv", "").replaceAll("Version/\\d+(\\.\\d+)* ", ""));
        }

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);
        webView.setBackgroundColor(Color.BLACK);
        webView.addJavascriptInterface(new Bridge(), "JTV");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                if (scheme == null) return true;
                scheme = scheme.toLowerCase(Locale.ROOT);
                // intent://, vnd.youtube: 처럼 다른 앱을 여는 주소는 무시하고 이 앱 안에서 계속 봅니다.
                return !(scheme.equals("http") || scheme.equals("https") || scheme.equals("about")
                        || scheme.equals("data") || scheme.equals("blob") || scheme.equals("javascript"));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (mode == MODE_PAGE) {
                    hideStatus();
                    if (clearHistoryOnLoad && url != null && !url.startsWith("about:")) {
                        // 채널을 바꾼 뒤 '뒤로'를 눌러 이전 채널로 돌아가지 않도록 기록을 지웁니다.
                        view.clearHistory();
                        clearHistoryOnLoad = false;
                    }
                    scheduleVideoOnly();
                }
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                if (mode == MODE_PAGE) scheduleVideoOnly();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && mode == MODE_PAGE) {
                    showStatus("페이지를 불러오지 못했어요.\n인터넷 연결을 확인해 주세요.", false, true);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                showCustomView(view, callback);
            }

            @Override
            public void onHideCustomView() {
                hideCustomView();
            }

            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (mode == MODE_PAGE && newProgress >= 80) hideStatus();
            }

            @Override
            public Bitmap getDefaultVideoPoster() {
                // 영상이 뜨기 전에 회색 재생 아이콘 대신 검은 화면을 보여 줍니다.
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
            }
        });
    }

    /** 웹 페이지 영상의 전체 화면 버튼을 눌렀을 때 */
    private void showCustomView(View view, WebChromeClient.CustomViewCallback callback) {
        if (customView != null) {
            if (callback != null) callback.onCustomViewHidden();
            return;
        }
        customView = view;
        customViewCallback = callback;
        fullscreenContainer.addView(view, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        fullscreenContainer.setVisibility(View.VISIBLE);
    }

    private void hideCustomView() {
        if (customView == null) return;
        View v = customView;
        WebChromeClient.CustomViewCallback cb = customViewCallback;
        customView = null;
        customViewCallback = null;
        fullscreenContainer.removeView(v);
        fullscreenContainer.setVisibility(View.GONE);
        if (cb != null) cb.onCustomViewHidden();
    }

    // ================= 작은 화면(PIP) =================

    private boolean pipSupported() {
        return getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }

    private PictureInPictureParams buildPipParams() {
        PictureInPictureParams.Builder b = new PictureInPictureParams.Builder()
                .setAspectRatio(new Rational(16, 9));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            b.setAutoEnterEnabled(prefs.isPipEnabled());
        }
        return b.build();
    }

    private void updatePipParams() {
        if (!pipSupported()) return;
        try {
            setPictureInPictureParams(buildPipParams());
        } catch (Exception ignored) {
        }
    }

    private void enterPip(boolean fromButton) {
        if (!pipSupported()) return;
        boolean ok;
        try {
            ok = enterPictureInPictureMode(buildPipParams());
        } catch (Exception e) {
            ok = false;
        }
        if (!ok && fromButton) {
            Toast.makeText(this, "작은 화면(PIP)을 쓸 수 없어요. 휴대폰 설정 > 앱 > 일본TV > '화면 속 화면'을 허용해 주세요.",
                    Toast.LENGTH_LONG).show();
        }
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        // 안드로이드 12 이상은 setAutoEnterEnabled 로 자동 전환됩니다.
        if (prefs.isPipEnabled() && Build.VERSION.SDK_INT < Build.VERSION_CODES.S && !isFinishing()) {
            enterPip(false);
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPip, @NonNull Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPip, newConfig);
        if (!isInPip && getLifecycle().getCurrentState() == Lifecycle.State.CREATED) {
            // 사용자가 작은 화면을 닫았습니다.
            finishAndRemoveTask();
            return;
        }
        if (isInPip) {
            hideOverlay();
            hintText.setVisibility(View.GONE);
        }
        updateModeUi();
    }

    // ================= 생명주기 =================

    @Override
    protected void onStart() {
        super.onStart();
        watchStart = SystemClock.elapsedRealtime();
        webView.onResume();
        if (mode == MODE_EMBED || mode == MODE_PAGE) webView.evaluateJavascript(JS_PLAY, null);
        if (player != null) player.play();
    }

    @Override
    protected void onStop() {
        super.onStop();
        flushWatchTime();
        if (!isInPictureInPictureMode()) {
            webView.evaluateJavascript(JS_PAUSE, null);
            webView.onPause();
            if (player != null) player.pause();
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        executor.shutdownNow();
        releasePlayer();
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.removeJavascriptInterface("JTV");
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) parent.removeView(webView);
            webView.destroy();
        }
        super.onDestroy();
    }

    private void flushWatchTime() {
        if (watchStart > 0) {
            WatchStats.add(this, SystemClock.elapsedRealtime() - watchStart);
            watchStart = 0;
        }
    }

    /** 리모컨/블루투스 키보드의 채널·미디어 버튼으로 채널 넘기기 */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_CHANNEL_UP:
            case KeyEvent.KEYCODE_MEDIA_NEXT:
                switchChannel(1);
                return true;
            case KeyEvent.KEYCODE_CHANNEL_DOWN:
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                switchChannel(-1);
                return true;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
                if (mode != MODE_PAGE && overlay.getVisibility() != View.VISIBLE) {
                    showOverlay();
                    return true;
                }
                return super.onKeyDown(keyCode, event);
            default:
                return super.onKeyDown(keyCode, event);
        }
    }
}
