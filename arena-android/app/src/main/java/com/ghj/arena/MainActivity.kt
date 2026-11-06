package com.ghj.arena

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Message
import android.view.View
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
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature

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
        root.removeView(popup)
        popup.stopLoading()
        popup.destroy()
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
