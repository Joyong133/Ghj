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
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
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
import java.util.List;
import java.util.Locale;

/**
 * 채널을 재생하는 화면.
 * - 유튜브 라이브 등 웹 페이지는 WebView로 보여 줍니다.
 * - m3u8/mp4 같은 스트림 주소는 ExoPlayer로 직접 재생합니다.
 * 화면 꺼짐 방지, 가로 화면 꽉 채우기, 작은 화면(PIP), 끊기면 자동 재연결을 지원합니다.
 */
@OptIn(markerClass = UnstableApi.class)
public class PlayerActivity extends AppCompatActivity {
    public static final String EXTRA_CHANNEL_ID = "channel_id";

    private static final long FIRST_RETRY_MS = 3_000L;
    private static final long MAX_RETRY_MS = 30_000L;

    private static final String JS_PAUSE =
            "document.querySelectorAll('video,audio').forEach(function(v){try{v.pause();}catch(e){}});";
    private static final String JS_PLAY =
            "document.querySelectorAll('video').forEach(function(v){try{if(v.paused){v.play();}}catch(e){}});";

    public static void start(Context context, String channelId) {
        Intent i = new Intent(context, PlayerActivity.class);
        i.putExtra(EXTRA_CHANNEL_ID, channelId);
        context.startActivity(i);
    }

    private Prefs prefs;
    private View normalContent;
    private View topBar;
    private View errorBox;
    private View btnPip;
    private TextView titleView;
    private TextView errorText;
    private WebView webView;
    private PlayerView playerView;
    private ProgressBar loading;
    private FrameLayout fullscreenContainer;

    private ExoPlayer player;
    private List<Channel> channels = new ArrayList<>();
    private Channel current;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private long watchStart;
    private boolean clearHistoryOnLoad;
    private boolean forceHls;
    private long retryDelayMs = FIRST_RETRY_MS;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable retryRunnable = () -> {
        if (current != null && current.isStream()) startStream(current);
    };
    private final Runnable tvModeRunnable = this::applyTvModeCss;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_player);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        prefs = new Prefs(this);

        normalContent = findViewById(R.id.normalContent);
        topBar = findViewById(R.id.topBar);
        titleView = findViewById(R.id.channelTitle);
        webView = findViewById(R.id.webView);
        playerView = findViewById(R.id.playerView);
        loading = findViewById(R.id.loading);
        errorBox = findViewById(R.id.errorBox);
        errorText = findViewById(R.id.errorText);
        fullscreenContainer = findViewById(R.id.fullscreenContainer);
        btnPip = findViewById(R.id.btnPip);

        findViewById(R.id.btnBack).setOnClickListener(v -> finish());
        findViewById(R.id.btnPrev).setOnClickListener(v -> switchChannel(-1));
        findViewById(R.id.btnNext).setOnClickListener(v -> switchChannel(1));
        findViewById(R.id.btnReload).setOnClickListener(v -> {
            if (current != null) play(current);
        });
        findViewById(R.id.btnRetry).setOnClickListener(v -> {
            if (current != null) play(current);
        });
        btnPip.setOnClickListener(v -> enterPip(true));
        if (!pipSupported()) btnPip.setVisibility(View.GONE);

        setupWebView();

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (customView != null) {
                    hideCustomView();
                } else if (webView.getVisibility() == View.VISIBLE && webView.canGoBack()) {
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
        play(target);
    }

    // ---------------- 재생 ----------------

    private void play(Channel ch) {
        current = ch;
        prefs.setLastChannelId(ch.id);
        titleView.setText(ch.icon + "  " + ch.name);
        hideError();
        handler.removeCallbacks(retryRunnable);
        if (customView != null) hideCustomView();

        if (ch.isStream()) {
            webView.stopLoading();
            webView.loadUrl("about:blank");
            webView.setVisibility(View.GONE);
            loading.setVisibility(View.GONE);
            playerView.setVisibility(View.VISIBLE);
            retryDelayMs = FIRST_RETRY_MS;
            forceHls = false;
            startStream(ch);
        } else {
            releasePlayer();
            playerView.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            loading.setVisibility(View.VISIBLE);
            clearHistoryOnLoad = true;
            webView.loadUrl(ch.url);
        }
        applyOrientationUi();
        updatePipParams();
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
        Channel next = channels.get(((idx + delta) % n + n) % n);
        play(next);
        Toast.makeText(this, next.icon + "  " + next.name, Toast.LENGTH_SHORT).show();
    }

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
                    hideError();
                } else if (state == Player.STATE_ENDED) {
                    scheduleRetry("방송이 끝났거나 잠시 끊겼어요.");
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
                scheduleRetry("재생 오류 (" + error.getErrorCodeName() + ")");
            }
        });
        return p;
    }

    private void scheduleRetry(String reason) {
        showError(reason + "\n" + (retryDelayMs / 1000) + "초 뒤에 자동으로 다시 연결해요.");
        handler.removeCallbacks(retryRunnable);
        handler.postDelayed(retryRunnable, retryDelayMs);
        retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_MS);
    }

    private void releasePlayer() {
        handler.removeCallbacks(retryRunnable);
        if (player != null) {
            playerView.setPlayer(null);
            player.release();
            player = null;
        }
    }

    private void showError(String msg) {
        errorText.setText(msg);
        errorBox.setVisibility(View.VISIBLE);
    }

    private void hideError() {
        errorBox.setVisibility(View.GONE);
    }

    // ---------------- WebView ----------------

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportMultipleWindows(false);
        // 일반 모바일 크롬처럼 보이게 해서 유튜브 모바일 페이지가 제대로 나오게 합니다.
        String ua = s.getUserAgentString();
        if (ua != null) {
            s.setUserAgentString(ua.replace("; wv", "").replaceAll("Version/\\d+(\\.\\d+)* ", ""));
        }

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);
        webView.setBackgroundColor(Color.BLACK);

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
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (url != null && !url.startsWith("about:")) {
                    loading.setVisibility(View.VISIBLE);
                    hideError();
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                loading.setVisibility(View.GONE);
                if (clearHistoryOnLoad && url != null && !url.startsWith("about:")) {
                    // 채널을 바꾼 뒤 '뒤로'를 눌러 이전 채널로 돌아가지 않도록 기록을 지웁니다.
                    view.clearHistory();
                    clearHistoryOnLoad = false;
                }
                scheduleTvMode();
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                scheduleTvMode();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    loading.setVisibility(View.GONE);
                    showError("페이지를 불러오지 못했어요.\n(" + error.getDescription() + ")\n인터넷 연결을 확인해 주세요.");
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
                if (newProgress >= 80) loading.setVisibility(View.GONE);
            }

            @Override
            public Bitmap getDefaultVideoPoster() {
                // 영상이 뜨기 전에 회색 재생 아이콘 대신 검은 화면을 보여 줍니다.
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
            }
        });
    }

    /** 유튜브 플레이어의 전체 화면 버튼을 눌렀을 때 */
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
        normalContent.setVisibility(View.GONE);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        applyOrientationUi();
    }

    private void hideCustomView() {
        if (customView == null) return;
        View v = customView;
        WebChromeClient.CustomViewCallback cb = customViewCallback;
        customView = null;
        customViewCallback = null;
        fullscreenContainer.removeView(v);
        fullscreenContainer.setVisibility(View.GONE);
        normalContent.setVisibility(View.VISIBLE);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        if (cb != null) cb.onCustomViewHidden();
        applyOrientationUi();
    }

    private void scheduleTvMode() {
        handler.removeCallbacks(tvModeRunnable);
        applyTvModeCss();
        // 유튜브는 페이지가 뜬 뒤에 플레이어를 만들기 때문에 조금 뒤에 한 번 더 적용합니다.
        handler.postDelayed(tvModeRunnable, 1500);
        handler.postDelayed(tvModeRunnable, 4000);
    }

    /** 가로 화면이나 작은 화면(PIP)일 때 웹 페이지의 영상만 화면 가득 보이게 합니다. */
    private void applyTvModeCss() {
        if (current == null || current.isStream() || webView.getVisibility() != View.VISIBLE) return;
        boolean on = isInPictureInPictureMode() || isLandscape();
        webView.evaluateJavascript(tvModeJs(on), null);
    }

    private static String tvModeJs(boolean on) {
        return "(function(on){"
                + "var id='__jtv_tv';var s=document.getElementById(id);"
                + "if(!on){if(s){s.parentNode.removeChild(s);window.dispatchEvent(new Event('resize'));}return;}"
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
                + "})(" + on + ");";
    }

    // ---------------- 화면 방향 / 전체 화면 ----------------

    private boolean isLandscape() {
        return getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
    }

    private void applyOrientationUi() {
        boolean pip = isInPictureInPictureMode();
        boolean land = isLandscape();
        topBar.setVisibility(pip || land || customView != null ? View.GONE : View.VISIBLE);
        if (!pip) setImmersive(land || customView != null);
        playerView.setUseController(!pip);
        scheduleTvMode();
    }

    private void setImmersive(boolean on) {
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (on) {
            c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            c.hide(WindowInsetsCompat.Type.systemBars());
        } else {
            c.show(WindowInsetsCompat.Type.systemBars());
        }
    }

    @Override
    public void onConfigurationChanged(@NonNull Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyOrientationUi();
    }

    // ---------------- 작은 화면(PIP) ----------------

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
        applyOrientationUi();
    }

    // ---------------- 생명주기 ----------------

    @Override
    protected void onStart() {
        super.onStart();
        watchStart = SystemClock.elapsedRealtime();
        webView.onResume();
        if (current != null && !current.isStream()) webView.evaluateJavascript(JS_PLAY, null);
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
        releasePlayer();
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
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
            default:
                return super.onKeyDown(keyCode, event);
        }
    }
}
