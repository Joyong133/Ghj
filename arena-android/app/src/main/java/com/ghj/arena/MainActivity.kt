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
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.CompoundButton
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.floatingactionbutton.FloatingActionButton
import com.google.android.material.progressindicator.LinearProgressIndicator
import com.google.android.material.slider.Slider
import com.google.android.material.snackbar.Snackbar
import org.json.JSONArray
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
        private const val DIRECT_URL = "https://arena.ai/text/direct"

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
    private lateinit var fabColumn: LinearLayout
    private lateinit var srrBar: View
    private lateinit var srrProgress: LinearProgressIndicator
    private lateinit var srrPlay: MaterialButton
    private var srrActive = false
    private var srrPicking = false
    private var srrSpeed = 25
    private var srrRain = false
    private var srrRainSound = true
    private lateinit var srrViewSheet: SrrViewSheet
    private lateinit var srrTime: TextView
    private var pickSnackbar: Snackbar? = null
    private lateinit var pinButton: FloatingActionButton
    private var lockedModel: String? = null
    private var pendingLock: JSONObject? = null
    private lateinit var promptsSheet: PromptsSheet
    private lateinit var lengthSettings: LengthSettings

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
        setupFloatingButtons()
        setupSrrBar()
        setContentView(root)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val popup = popupView
                when {
                    srrPicking -> cancelPick()
                    srrActive -> closeSrr()
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
            if (isPopup) return
            progress.visibility = View.VISIBLE
            // 새 페이지를 열면 스르륵 화면은 사라지므로 조작 막대도 정리
            if (srrPicking) cancelPick()
            if (srrActive) hideSrrBar()
        }

        override fun onPageFinished(view: WebView, url: String?) {
            if (!isPopup) {
                progress.visibility = View.GONE
                onMainPageFinished(url)
            }
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
            updateFabVisibility()
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
        updateFabVisibility()
        root.removeView(popup)
        popup.stopLoading()
        popup.destroy()
    }

    // ---- 저장한 프롬프트 ----

    @SuppressLint("ClickableViewAccessibility")
    private fun setupFloatingButtons() {
        val store = PromptStore(this)
        lengthSettings = LengthSettings(this)
        promptsSheet = PromptsSheet(this, store, ::insertPrompt, ::readInput, lengthSettings, ::applyLength)
        val prefs = getSharedPreferences("ui", MODE_PRIVATE)
        val bottomMargin = dp(150)

        // 위: 스르륵 버튼, 아래: 저장한 프롬프트 버튼
        val srrButton = FloatingActionButton(this).apply {
            size = FloatingActionButton.SIZE_MINI
            setImageResource(R.drawable.ic_srr)
            backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(context, R.color.brand))
            imageTintList = ColorStateList.valueOf(0xFFFFFFFF.toInt())
            contentDescription = "스르륵 (답변 다시 보기)"
            setOnClickListener { startSrr() }
        }
        val promptButton = FloatingActionButton(this).apply {
            size = FloatingActionButton.SIZE_MINI
            setImageResource(R.drawable.ic_prompts)
            backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(context, R.color.brand_dot))
            imageTintList = ColorStateList.valueOf(ContextCompat.getColor(context, R.color.brand))
            contentDescription = "저장한 프롬프트"
            setOnClickListener { promptsSheet.show() }
        }
        pinButton = FloatingActionButton(this).apply {
            size = FloatingActionButton.SIZE_MINI
            setImageResource(R.drawable.ic_pin)
            imageTintList = ColorStateList.valueOf(0xFFFFFFFF.toInt())
            setOnClickListener { onPinClicked() }
        }
        lockedModel = prefs.getString("lockedModel", null)
        updatePinButton()
        fabColumn = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            alpha = 0.92f
            addView(pinButton)
            addView(srrButton)
            addView(promptButton)
        }
        root.addView(fabColumn, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.END or Gravity.BOTTOM
        ).apply {
            marginEnd = dp(10)
            this.bottomMargin = bottomMargin
        })

        // 화면 크기 안에서만 움직이도록 위치를 제한
        fun clamp(t: Float): Float {
            val min = dp(16) - (root.height - bottomMargin - fabColumn.height).toFloat()
            val max = (bottomMargin - dp(16)).toFloat()
            return if (root.height == 0 || min > max) t else t.coerceIn(min, max)
        }

        // 버튼을 위아래로 끌어서 옮길 수 있음 (두 버튼이 함께 움직이고, 위치를 기억)
        fabColumn.translationY = prefs.getFloat("promptButtonY", 0f)
        root.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
            fabColumn.translationY = clamp(fabColumn.translationY)
        }
        val slop = ViewConfiguration.get(this).scaledTouchSlop
        var downY = 0f
        var startY = 0f
        var dragging = false
        val dragListener = View.OnTouchListener { v, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downY = e.rawY
                    startY = fabColumn.translationY
                    dragging = false
                    v.isPressed = true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dy = e.rawY - downY
                    if (!dragging && abs(dy) > slop) {
                        dragging = true
                        v.isPressed = false
                    }
                    if (dragging) fabColumn.translationY = clamp(startY + dy)
                }
                MotionEvent.ACTION_UP -> {
                    v.isPressed = false
                    if (dragging) {
                        prefs.edit().putFloat("promptButtonY", fabColumn.translationY).apply()
                    } else {
                        v.performClick()
                    }
                }
                MotionEvent.ACTION_CANCEL -> v.isPressed = false
            }
            true
        }
        srrButton.setOnTouchListener(dragListener)
        pinButton.setOnTouchListener(dragListener)
        promptButton.setOnTouchListener(dragListener)
    }

    private fun updateFabVisibility() {
        fabColumn.visibility =
            if (popupView == null && !srrActive && !srrPicking) View.VISIBLE else View.GONE
    }

    // ---- 스르륵 모드 (다 나온 답변을 처음부터 원하는 속도로 다시 보기) ----

    private val srrScript: String by lazy {
        assets.open("srr.js").bufferedReader().use { it.readText() }
    }

    private fun setupSrrBar() {
        srrBar = LayoutInflater.from(this).inflate(R.layout.srr_bar, root, false)
        root.addView(srrBar, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM
        ))
        srrBar.visibility = View.GONE
        srrProgress = srrBar.findViewById(R.id.srrProgress)
        srrPlay = srrBar.findViewById(R.id.srrPlay)

        val prefs = getSharedPreferences("ui", MODE_PRIVATE)
        val slider = srrBar.findViewById<Slider>(R.id.srrSpeed)
        val label = srrBar.findViewById<TextView>(R.id.srrSpeedLabel)
        // 저장된 속도를 슬라이더 눈금(5 단위)에 맞춤
        srrSpeed = ((prefs.getInt("srrSpeed", 25) / 5) * 5).coerceIn(5, 150)
        slider.value = srrSpeed.toFloat()
        label.text = "${srrSpeed}자/초"
        slider.addOnChangeListener { _, value, fromUser ->
            srrSpeed = value.toInt()
            label.text = "${srrSpeed}자/초"
            if (fromUser) {
                webView.evaluateJavascript("window.__srr && __srr.setSpeed($srrSpeed)", null)
                prefs.edit().putInt("srrSpeed", srrSpeed).apply()
            }
        }

        srrPlay.setOnClickListener { webView.evaluateJavascript("window.__srr && __srr.toggle()", null) }

        // 비 내리기 효과 (체크 상태 기억, 재생 중에도 바로 켜고 끔)
        srrRain = prefs.getBoolean("srrRain", false)
        srrRainSound = prefs.getBoolean("srrRainSound", true)
        val soundBox = srrBar.findViewById<CompoundButton>(R.id.srrRainSound)
        srrBar.findViewById<CompoundButton>(R.id.srrRain).apply {
            isChecked = srrRain
            setOnCheckedChangeListener { _, checked ->
                srrRain = checked
                soundBox.isEnabled = checked  // 빗소리는 비가 내릴 때만
                prefs.edit().putBoolean("srrRain", checked).apply()
                webView.evaluateJavascript("window.__srr && __srr.setRain($checked)", null)
            }
        }
        soundBox.apply {
            isChecked = srrRainSound
            isEnabled = srrRain
            setOnCheckedChangeListener { _, checked ->
                srrRainSound = checked
                prefs.edit().putBoolean("srrRainSound", checked).apply()
                webView.evaluateJavascript("window.__srr && __srr.setSound($checked)", null)
            }
        }
        srrBar.findViewById<View>(R.id.srrPick).setOnClickListener {
            closeSrr()
            startPick("다시 볼 답변을 눌러 주세요")
        }
        srrBar.findViewById<View>(R.id.srrClose).setOnClickListener { closeSrr() }

        // 보기 설정 (화면 색, 글자 크기, 줄 간격, 글꼴, 읽는 줄 강조, 커서, 빗소리 크기)
        srrTime = srrBar.findViewById(R.id.srrTime)
        srrViewSheet = SrrViewSheet(this, prefs) { json ->
            webView.evaluateJavascript("window.__srr && __srr.setView($json)", null)
        }
        srrBar.findViewById<View>(R.id.srrView).setOnClickListener { srrViewSheet.show(srrRain && srrRainSound) }

        webView.addJavascriptInterface(SrrBridge(), "ArenaSrr")
        webView.addJavascriptInterface(LockBridge(), "ArenaLock")
    }

    /** 페이지 안의 스르륵 스크립트가 상태를 알려 줄 때 쓰는 통로 */
    private inner class SrrBridge {
        @JavascriptInterface
        fun onState(state: String, percent: Int) {
            runOnUiThread {
                if (!srrActive) return@runOnUiThread
                if (state == "closed") {
                    hideSrrBar()
                    return@runOnUiThread
                }
                srrProgress.setProgressCompat(percent, true)
                srrPlay.setIconResource(if (state == "playing") R.drawable.ic_pause else R.drawable.ic_play)
            }
        }

        // ---- 어디까지 봤는지 저장 (답변마다, 휴대폰 안에) ----

        private val savedSpots = getSharedPreferences("srr_progress", MODE_PRIVATE)

        @JavascriptInterface
        fun getProgress(key: String): Int =
            savedSpots.getString(key, null)?.split('/')?.firstOrNull()?.toIntOrNull() ?: 0

        @JavascriptInterface
        fun saveProgress(key: String, pos: Int, total: Int) {
            val editor = savedSpots.edit().putString(key, "$pos/$total/${System.currentTimeMillis()}")
            // 오래된 기록은 정리 (최근 100개만 보관)
            val all = savedSpots.all
            if (all.size > 100) {
                all.entries
                    .sortedBy { (it.value as? String)?.split('/')?.getOrNull(2)?.toLongOrNull() ?: 0L }
                    .take(all.size - 100)
                    .forEach { editor.remove(it.key) }
            }
            editor.apply()
        }

        @JavascriptInterface
        fun clearProgress(key: String) {
            savedSpots.edit().remove(key).apply()
        }

        /** 지금 속도로 끝까지 남은 시간(초) */
        @JavascriptInterface
        fun onTime(seconds: Int) {
            runOnUiThread {
                srrTime.text = when {
                    seconds <= 0 -> "다 봤어요"
                    seconds < 60 -> "약 ${seconds}초 남음"
                    else -> "약 ${seconds / 60}분 ${seconds % 60}초 남음"
                }
            }
        }

        @JavascriptInterface
        fun onPickedUser() {
            runOnUiThread { toast("내 질문은 스르륵 할 수 없어요. AI 답변을 눌러 주세요") }
        }

        @JavascriptInterface
        fun onPicked() {
            runOnUiThread {
                if (!srrPicking) return@runOnUiThread
                srrPicking = false
                pickSnackbar?.dismiss()
                beginSrr("[0]")
            }
        }
    }

    private fun startSrr() {
        webView.evaluateJavascript(srrScript) {
            webView.evaluateJavascript("__srr.setSpeed($srrSpeed); __srr.find()") { result ->
                val previews = try {
                    JSONArray(JSONTokener(result ?: "null").nextValue() as String)
                } catch (e: Exception) {
                    JSONArray()
                }
                when (previews.length()) {
                    0 -> startPick("답변을 자동으로 찾지 못했어요. 다시 볼 답변을 눌러 주세요")
                    1 -> beginSrr("[0]")
                    else -> chooseAnswer(previews)
                }
            }
        }
    }

    /** 대결 모드처럼 답변이 여러 개면 어느 것을 볼지 물어봄 */
    private fun chooseAnswer(previews: JSONArray) {
        val count = previews.length()
        val items: Array<CharSequence> = (List(count) { i ->
            "답변 ${i + 1}: " + previews.getString(i).take(40)
        } + listOf("모두 차례로 보기", "화면에서 직접 고르기")).toTypedArray()
        MaterialAlertDialogBuilder(this)
            .setTitle("어느 답변을 스르륵 볼까요?")
            .setItems(items) { _, which ->
                when {
                    which < count -> beginSrr("[$which]")
                    which == count -> beginSrr((0 until count).joinToString(",", "[", "]"))
                    else -> startPick("다시 볼 답변을 눌러 주세요")
                }
            }
            .show()
    }

    private fun beginSrr(indices: String) {
        webView.evaluateJavascript("__srr.setSpeed($srrSpeed); __srr.setView(${srrViewSheet.current()}); __srr.setSound($srrRainSound); __srr.setRain($srrRain); __srr.start($indices)") { result ->
            val resumed = Regex("resumed:(\\d+)").find(result.orEmpty())?.groupValues?.get(1)
            if (result?.contains("ok") == true || resumed != null) {
                if (resumed != null) toast("지난번에 본 곳($resumed%)부터 이어서 보여 줘요")
                srrActive = true
                srrProgress.setProgressCompat(0, false)
                srrPlay.setIconResource(R.drawable.ic_pause)
                srrBar.visibility = View.VISIBLE
                updateFabVisibility()
            } else {
                toast("답변을 찾지 못했어요")
            }
        }
    }

    private fun closeSrr() {
        webView.evaluateJavascript("window.__srr && __srr.close()", null)
        hideSrrBar()
    }

    private fun hideSrrBar() {
        srrActive = false
        srrBar.visibility = View.GONE
        updateFabVisibility()
    }

    private fun startPick(message: String) {
        srrPicking = true
        updateFabVisibility()
        webView.evaluateJavascript(srrScript) {
            webView.evaluateJavascript("__srr.pickByTap()", null)
        }
        pickSnackbar = Snackbar.make(root, message, Snackbar.LENGTH_INDEFINITE)
            .setAction("취소") { cancelPick() }
            .also { it.show() }
    }

    private fun cancelPick() {
        srrPicking = false
        pickSnackbar?.dismiss()
        pickSnackbar = null
        webView.evaluateJavascript("window.__srr && __srr.cancelPick()", null)
        updateFabVisibility()
    }

    // ---- 고정 모드 (배틀에서 공개된 AI로 고정해서 계속 대화) ----

    private val lockScript: String by lazy {
        assets.open("lock.js").bufferedReader().use { it.readText() }
    }

    private fun updatePinButton() {
        val color = if (lockedModel != null) R.color.pin_on else R.color.pin_off
        pinButton.backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(this, color))
        pinButton.contentDescription =
            lockedModel?.let { "고정 모드: $it (눌러서 해제)" } ?: "고정 모드 (지금 AI로 고정)"
    }

    private fun setLock(model: String?) {
        lockedModel = model
        getSharedPreferences("ui", MODE_PRIVATE).edit().putString("lockedModel", model).apply()
        updatePinButton()
        webView.evaluateJavascript("window.__lock && __lock.setModel(${JSONObject.quote(model ?: "")})", null)
    }

    /** arena.ai 페이지가 열릴 때마다 고정 스크립트를 넣고, 넘겨받은 일이 있으면 처리 */
    private fun onMainPageFinished(url: String?) {
        if (url == null || !url.startsWith("https://")) return
        if (!isInAppHost(Uri.parse(url).host)) return
        if (lengthSettings.enabled) applyLength()
        if (lockedModel == null && pendingLock == null) return
        webView.evaluateJavascript(lockScript) {
            webView.evaluateJavascript("__lock.setModel(${JSONObject.quote(lockedModel ?: "")})", null)
            val pending = pendingLock
            if (pending != null && url.contains("/text/direct")) {
                pendingLock = null
                webView.evaluateJavascript("__lock.apply($pending)", null)
            }
        }
    }

    private fun onPinClicked() {
        val locked = lockedModel
        if (locked != null) {
            MaterialAlertDialogBuilder(this)
                .setTitle("📌 $locked 고정 중")
                .setItems(arrayOf<CharSequence>("고정 해제", "다른 AI로 바꾸기")) { _, which ->
                    if (which == 0) {
                        setLock(null)
                        toast("고정을 풀었어요")
                    } else {
                        detectForLock()
                    }
                }
                .show()
        } else {
            detectForLock()
        }
    }

    private fun detectForLock() {
        webView.evaluateJavascript(lockScript) {
            webView.evaluateJavascript("__lock.detect()") { result ->
                val info = try {
                    JSONObject(JSONTokener(result ?: "null").nextValue() as String)
                } catch (e: Exception) {
                    null
                }
                if (info == null) {
                    toast("이 화면에서는 고정할 수 없어요")
                    return@evaluateJavascript
                }
                val kind = info.optString("kind")
                val current = info.optString("current")
                val answers = info.optJSONArray("answers") ?: JSONArray()
                when {
                    kind == "battle" && answers.length() > 0 -> chooseBattleAnswer(answers)
                    kind == "direct" && current.isNotBlank() -> confirmLockCurrent(current)
                    else -> toast("배틀 화면에서 답변이 나온 뒤, 또는 다이렉트 대화 화면에서 눌러 주세요")
                }
            }
        }
    }

    private fun confirmLockCurrent(model: String) {
        MaterialAlertDialogBuilder(this)
            .setTitle("📌 $model 로 고정할까요?")
            .setMessage("새 대화를 시작해도 이 모델로 자동으로 맞춰 줘요.")
            .setNegativeButton("취소", null)
            .setPositiveButton("고정") { _, _ ->
                setLock(model)
                toast("$model 로 고정했어요")
            }
            .show()
    }

    private fun chooseBattleAnswer(answers: JSONArray) {
        val count = answers.length()
        val anyRevealed = (0 until count).any { answers.getJSONObject(it).optBoolean("revealed") }
        val items: Array<CharSequence> = Array(count) { i ->
            val a = answers.getJSONObject(i)
            val side = if (count == 2) (if (i == 0) "A" else "B") else "${i + 1}"
            if (a.optBoolean("revealed")) "${a.optString("name")}  (답변 $side)"
            else "답변 $side (이름 비공개): ${a.optString("preview").take(24)}…"
        }
        if (!anyRevealed) toast("아직 모델 이름이 공개되지 않았어요. 투표하면 이름이 나와요. 지금 고르면 모델 목록에서 직접 골라야 해요.")
        MaterialAlertDialogBuilder(this)
            .setTitle("어느 AI로 고정할까요?")
            .setItems(items) { _, which ->
                val a = answers.getJSONObject(which)
                val name = if (a.optBoolean("revealed")) a.optString("name") else null
                askCarryOver(which, name)
            }
            .show()
    }

    private fun askCarryOver(index: Int, model: String?) {
        MaterialAlertDialogBuilder(this)
            .setTitle("이전 대화를 이어갈까요?")
            .setMessage("다이렉트 모드로 옮겨서 ${model ?: "고른 AI"}와 계속 대화해요.\n\n" +
                "'이어가기'를 누르면 지금까지의 질문과 이 AI의 답변을 입력창에 넣어 드려요. " +
                "끝에 이어서 물어볼 내용을 적고 보내면 돼요.")
            .setNegativeButton("새로 시작") { _, _ -> moveToDirect(model, "") }
            .setPositiveButton("이어가기") { _, _ ->
                webView.evaluateJavascript("__lock.transcript($index)") { result ->
                    val text = try {
                        JSONTokener(result ?: "null").nextValue() as? String
                    } catch (e: Exception) {
                        null
                    }
                    moveToDirect(model, text.orEmpty())
                }
            }
            .show()
    }

    private fun moveToDirect(model: String?, transcript: String) {
        if (model != null) setLock(model)
        pendingLock = JSONObject().put("model", model ?: JSONObject.NULL).put("transcript", transcript)
        toast(if (model != null) "$model 로 고정하고 다이렉트 모드로 옮겨요" else "다이렉트 모드에서 모델을 골라 주세요")
        webView.loadUrl(DIRECT_URL)
    }

    /** 고정 스크립트가 결과를 알려 주는 통로 */
    private inner class LockBridge {
        @JavascriptInterface
        fun onEvent(type: String, data: String) {
            runOnUiThread {
                when (type) {
                    "applied" -> if (data == "ok") {
                        toast("${lockedModel ?: "AI"}로 고정했어요. 이어서 질문을 적고 보내세요")
                    } else {
                        toast("모델 목록에서 이어서 쓸 AI를 골라 주세요. 고른 AI로 고정돼요")
                    }
                    "picked", "pickedSame" -> {
                        setLock(data)
                        toast("$data 로 고정했어요")
                    }
                    "reselect" -> if (data == "ok") {
                        toast("고정한 ${lockedModel}로 다시 맞췄어요")
                    } else {
                        toast("고정한 ${lockedModel}을(를) 목록에서 찾지 못했어요")
                    }
                }
            }
        }
    }

    // ---- 답변 분량 ----

    private val lengthScript: String by lazy {
        assets.open("length.js").bufferedReader().use { it.readText() }
    }

    /** 페이지에 분량 스크립트를 넣고 지금 설정(켜짐/꺼짐)을 알려 줌 */
    private fun applyLength() {
        webView.evaluateJavascript(lengthScript) {
            webView.evaluateJavascript("__len.set(${lengthSettings.scriptConfig()})", null)
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
        // 앱을 나가면 스르륵을 멈추고 본 위치를 저장
        if (srrActive) webView.evaluateJavascript("window.__srr && (__srr.pause(), __srr.holdSound(true))", null)
        webView.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onResume() {
        super.onResume()
        if (srrActive) webView.evaluateJavascript("window.__srr && __srr.holdSound(false)", null)
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
