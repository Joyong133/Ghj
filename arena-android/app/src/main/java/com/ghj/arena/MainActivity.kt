package com.ghj.arena

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.res.ColorStateList
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Message
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import com.google.android.material.floatingactionbutton.FloatingActionButton
import org.json.JSONObject
import org.json.JSONTokener
import kotlin.math.abs

/**
 * arena.ai를 브라우저 없이 앱 화면 전체로 보여 주는 액티비티.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val HOME_URL = "https://arena.ai/"
        private const val OFFLINE_URL = "file:///android_asset/offline.html"

        // 앱 안에서 그대로 여는 도메인 (사이트 자체 + 로그인 화면)
        private val IN_APP_HOSTS = listOf(
            "arena.ai",
            "lmarena.ai",
            "accounts.google.com",
            "accounts.youtube.com",
            "appleid.apple.com",
            "github.com",
            "login.microsoftonline.com",
            "challenges.cloudflare.com",
        )

        // arena.ai 입력창(textarea 또는 contenteditable)을 찾는 스크립트
        private const val FIND_INPUT_JS = """
            function __arenaFindInput() {
              function visible(e) { var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
              var a = document.activeElement;
              if (a && visible(a) && (a.tagName === 'TEXTAREA' || a.isContentEditable)) return a;
              var c = [].slice.call(document.querySelectorAll(
                'textarea, [contenteditable="true"], [contenteditable=""]')).filter(function (e) {
                  return visible(e) && !e.disabled && !e.readOnly;
                });
              return c.length ? c[c.length - 1] : null;
            };
        """

        // 입력창 끝에 글을 넣음 (이미 쓴 글이 있으면 줄을 바꿔서 이어 붙임)
        private const val INSERT_JS = FIND_INPUT_JS + """
            (function (t) {
              var el = __arenaFindInput();
              if (!el) return 'none';
              el.focus();
              if (el.isContentEditable) {
                var sel = window.getSelection();
                sel.selectAllChildren(el);
                sel.collapseToEnd();
                var cur = (el.innerText || '').trim();
                document.execCommand('insertText', false, (cur ? '\n' : '') + t);
              } else {
                var cur = el.value || '';
                var next = cur.trim() ? cur.replace(/\s+$/, '') + '\n' + t : t;
                var setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
                setter.call(el, next);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.setSelectionRange(next.length, next.length);
              }
              return 'ok';
            })(__TEXT__)
        """

        // 입력창에 지금 쓰여 있는 글을 읽음
        private const val READ_JS = FIND_INPUT_JS + """
            (function () {
              var el = __arenaFindInput();
              if (!el) return null;
              return el.isContentEditable ? el.innerText : el.value;
            })()
        """

        fun isInAppHost(host: String?): Boolean {
            if (host == null) return false
            return IN_APP_HOSTS.any { host == it || host.endsWith(".$it") }
        }
    }

    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private lateinit var progress: ProgressBar
    private var popupView: WebView? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var promptButton: FloatingActionButton
    private lateinit var promptsSheet: PromptsSheet

    private val fileChooser =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val data = result.data
            val uris: Array<Uri>? = when {
                result.resultCode != RESULT_OK -> null
                data?.clipData != null -> {
                    val clip = data.clipData!!
                    Array(clip.itemCount) { clip.getItemAt(it).uri }
                }
                data?.data != null -> arrayOf(data.data!!)
                else -> null
            }
            fileCallback?.onReceiveValue(uris)
            fileCallback = null
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        root = FrameLayout(this)
        webView = createWebView(isPopup = false)
        root.addView(webView, matchParent())

        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = false
            max = 100
            visibility = View.GONE
        }
        root.addView(
            progress,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3))
        )
        setupPromptButton()
        setContentView(root)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val popup = popupView
                when {
                    popup != null && popup.canGoBack() -> popup.goBack()
                    popup != null -> closePopup()
                    webView.canGoBack() -> webView.goBack()
                    else -> {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                    }
                }
            }
        })

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(linkFrom(intent) ?: HOME_URL)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        linkFrom(intent)?.let {
            closePopup()
            webView.loadUrl(it)
        }
    }

    private fun linkFrom(intent: Intent?): String? {
        val uri = intent?.data ?: return null
        return if (uri.scheme == "https" && isInAppHost(uri.host)) uri.toString() else null
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(isPopup: Boolean): WebView {
        val view = WebView(this)
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            setSupportMultipleWindows(true)
            javaScriptCanOpenWindowsAutomatically = true
            loadWithOverviewMode = true
            useWideViewPort = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            // 구글 로그인 등은 앱 내장 브라우저(WebView) 표시가 있으면 막으므로 일반 Chrome처럼 보이게 함
            userAgentString = userAgentString
                .replace("; wv", "")
                .replace(Regex("Version/\\d+(\\.\\d+)*\\s"), "")
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) {
            WebSettingsCompat.setRequestedWithHeaderOriginAllowList(view.settings, emptySet())
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(view, true)
        }

        view.webViewClient = ArenaWebViewClient(isPopup)
        view.webChromeClient = ArenaChromeClient(isPopup)
        view.setDownloadListener { url, _, _, _, _ ->
            if (url.startsWith("http")) openExternal(Uri.parse(url))
            else toast("이 파일은 앱에서 저장할 수 없어요")
        }
        return view
    }

    private inner class ArenaWebViewClient(private val isPopup: Boolean) : WebViewClient() {

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            return when (uri.scheme) {
                "http", "https" -> {
                    if (isInAppHost(uri.host)) {
                        false
                    } else {
                        openExternal(uri)
                        // 외부 링크용으로만 열린 빈 팝업은 바로 닫음
                        if (isPopup && (view.url == null || view.url == "about:blank")) {
                            view.post { closePopup() }
                        }
                        true
                    }
                }
                "about", "blob", "data", "javascript", "file" -> false
                "intent" -> {
                    openIntentUri(uri.toString())
                    true
                }
                else -> {
                    openExternal(uri)
                    true
                }
            }
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            if (!isPopup) progress.visibility = View.VISIBLE
        }

        override fun onPageFinished(view: WebView, url: String?) {
            if (!isPopup) progress.visibility = View.GONE
            CookieManager.getInstance().flush()
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: WebResourceError
        ) {
            if (!request.isForMainFrame || isPopup) return
            val failed = request.url.toString()
            if (failed.startsWith("file:")) return
            view.loadUrl(OFFLINE_URL + "#" + Uri.encode(failed))
        }
    }

    private inner class ArenaChromeClient(private val isPopup: Boolean) : WebChromeClient() {

        override fun onProgressChanged(view: WebView, newProgress: Int) {
            if (!isPopup) progress.progress = newProgress
        }

        // 로그인 창 같은 팝업은 앱 화면 위에 겹쳐서 띄움
        override fun onCreateWindow(
            view: WebView,
            isDialog: Boolean,
            isUserGesture: Boolean,
            resultMsg: Message
        ): Boolean {
            closePopup()
            val popup = createWebView(isPopup = true)
            popupView = popup
            root.addView(popup, matchParent())
            promptButton.visibility = View.GONE
            val transport = resultMsg.obj as WebView.WebViewTransport
            transport.webView = popup
            resultMsg.sendToTarget()
            return true
        }

        override fun onCloseWindow(window: WebView) {
            if (window == popupView) closePopup()
        }

        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams
        ): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = filePathCallback
            val intent = fileChooserParams.createIntent().apply {
                if (fileChooserParams.mode == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                }
            }
            return try {
                fileChooser.launch(intent)
                true
            } catch (e: ActivityNotFoundException) {
                fileCallback = null
                toast("파일을 고를 수 있는 앱이 없어요")
                false
            }
        }
    }

    private fun closePopup() {
        val popup = popupView ?: return
        popupView = null
        promptButton.visibility = View.VISIBLE
        root.removeView(popup)
        popup.stopLoading()
        popup.destroy()
    }

    // ---- 저장한 프롬프트 ----

    @SuppressLint("ClickableViewAccessibility")
    private fun setupPromptButton() {
        val store = PromptStore(this)
        promptsSheet = PromptsSheet(this, store, ::insertPrompt, ::readInput)
        val prefs = getSharedPreferences("ui", MODE_PRIVATE)
        val bottomMargin = dp(150)

        promptButton = FloatingActionButton(this).apply {
            size = FloatingActionButton.SIZE_MINI
            setImageResource(R.drawable.ic_prompts)
            backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(context, R.color.brand_dot))
            imageTintList = ColorStateList.valueOf(ContextCompat.getColor(context, R.color.brand))
            contentDescription = "저장한 프롬프트"
            alpha = 0.92f
            setOnClickListener { promptsSheet.show() }
        }
        root.addView(promptButton, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.END or Gravity.BOTTOM
        ).apply {
            marginEnd = dp(10)
            this.bottomMargin = bottomMargin
        })

        // 화면 크기 안에서만 움직이도록 위치를 제한
        fun clamp(t: Float): Float {
            val min = dp(16) - (root.height - bottomMargin - promptButton.height).toFloat()
            val max = (bottomMargin - dp(16)).toFloat()
            return if (root.height == 0 || min > max) t else t.coerceIn(min, max)
        }

        // 버튼을 위아래로 끌어서 옮길 수 있음 (위치 기억)
        promptButton.translationY = prefs.getFloat("promptButtonY", 0f)
        root.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
            promptButton.translationY = clamp(promptButton.translationY)
        }
        val slop = ViewConfiguration.get(this).scaledTouchSlop
        var downY = 0f
        var startY = 0f
        var dragging = false
        promptButton.setOnTouchListener { v, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downY = e.rawY
                    startY = v.translationY
                    dragging = false
                    v.isPressed = true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dy = e.rawY - downY
                    if (!dragging && abs(dy) > slop) {
                        dragging = true
                        v.isPressed = false
                    }
                    if (dragging) v.translationY = clamp(startY + dy)
                }
                MotionEvent.ACTION_UP -> {
                    v.isPressed = false
                    if (dragging) {
                        prefs.edit().putFloat("promptButtonY", v.translationY).apply()
                    } else {
                        v.performClick()
                    }
                }
                MotionEvent.ACTION_CANCEL -> v.isPressed = false
            }
            true
        }
    }

    private fun insertPrompt(prompt: Prompt) {
        val js = INSERT_JS.replace("__TEXT__", JSONObject.quote(prompt.text))
        webView.evaluateJavascript(js) { result ->
            if (result?.contains("ok") == true) {
                toast("입력창에 넣었어요")
            } else {
                val cm = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("prompt", prompt.text))
                toast("입력창을 찾지 못해서 복사해 두었어요. 입력창을 길게 눌러 붙여 넣으세요.")
            }
        }
    }

    private fun readInput(callback: (String?) -> Unit) {
        webView.evaluateJavascript(READ_JS) { result ->
            val text = try {
                JSONTokener(result ?: "null").nextValue() as? String
            } catch (e: Exception) {
                null
            }
            callback(text)
        }
    }

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (e: ActivityNotFoundException) {
            toast("이 링크를 열 수 있는 앱이 없어요")
        }
    }

    private fun openIntentUri(url: String) {
        try {
            val intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME).apply {
                addCategory(Intent.CATEGORY_BROWSABLE)
                component = null
                selector = null
            }
            try {
                startActivity(intent)
            } catch (e: ActivityNotFoundException) {
                intent.getStringExtra("browser_fallback_url")?.let { openExternal(Uri.parse(it)) }
            }
        } catch (e: Exception) {
            toast("이 링크를 열 수 없어요")
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        closePopup()
        root.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    private fun matchParent() = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
    )

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
}
