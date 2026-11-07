package com.ghj.arena

import android.accessibilityservice.AccessibilityService
import android.animation.ObjectAnimator
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.animation.LinearInterpolator
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView

/**
 * 원앱 집중 잠금 (접근성): 집중 중에 허용하지 않은 화면(홈, 최근 앱, 다른 앱)이 뜨면
 * OneFocus처럼 화면 전체에 "집중하는 중이에요"를 띄우고, 잠시 후 자동으로 Arena로 돌아갑니다.
 * 전화·메시지·연락처·카카오톡과 직접 허용한 앱, 시스템 화면(알림창 등)과 키보드는 그대로 쓸 수 있습니다.
 */
class FocusAccessibilityService : AccessibilityService() {

    companion object {
        /** 막는 화면을 보여 주는 시간 (진행 막대가 다 차면 돌아감) */
        private const val BLOCK_MS = 1500L

        fun isEnabled(ctx: Context): Boolean {
            val me = ComponentName(ctx, FocusAccessibilityService::class.java).flattenToString()
            val list = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
            return list.split(':').any { it.equals(me, ignoreCase = true) }
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var allowed: Set<String> = emptySet()
    private var allowedAt = 0L
    private var blocker: View? = null
    private var shownAt = 0L
    private var timeText: TextView? = null

    private val goBack = Runnable { returnToArena() }
    private val tickTime = object : Runnable {
        override fun run() {
            timeText?.text = remainingText()
            if (blocker != null) handler.postDelayed(this, 500)
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        allowed = FocusApps.allowed(this)
        allowedAt = System.currentTimeMillis()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val pkg = event.packageName?.toString() ?: return
        if (!LockGuardService.guardActive) {
            hideBlocker()
            return
        }
        val now = System.currentTimeMillis()
        val cls = event.className?.toString().orEmpty()
        if (pkg == packageName) {
            // Arena 화면이 앞에 오면 막는 화면을 걷음 (막는 화면 자신이 뜨면서 생기는 신호는 무시)
            if (cls.contains("Activity") || now - shownAt > 500) hideBlocker()
            return
        }
        if (now - allowedAt > 10_000) {  // 허용 목록을 가끔 새로 읽음
            allowed = FocusApps.allowed(this)
            allowedAt = now
        }
        // 시스템 화면(알림창 등)은 허용하지만, 최근 앱 화면은 막음 (최근 앱이 시스템 화면 소속인 휴대폰이 있음)
        val recents = pkg == "com.android.systemui" &&  // 전화 앱의 '최근 기록' 같은 화면은 건드리지 않음
            (cls.contains("recent", ignoreCase = true) || cls.contains("overview", ignoreCase = true))
        // 앱마다 확인: 전화·메시지·허용한 앱만 통과
        if (pkg in allowed && !recents) {
            // 막는 화면이 떠 있는 동안 시스템 화면 신호로는 걷지 않음 (곧 Arena로 돌아감)
            if (blocker != null && (pkg == "com.android.systemui" || pkg == "android")) return
            hideBlocker()
            return
        }
        showBlocker()
    }

    private fun remainingText(): String {
        val t = LockGuardService.timerSeconds
        return if (t > 0) "남은 시간 %d:%02d".format(t / 60, t % 60) else ""
    }

    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    /** OneFocus처럼 화면 전체를 덮는 "집중하는 중이에요" */
    private fun showBlocker() {
        if (blocker != null) return  // 이미 떠 있으면 그대로 (곧 돌아감)
        val wm = getSystemService(WindowManager::class.java)

        val title = TextView(this).apply {
            text = "집중하는 중이에요"
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
            paint.isFakeBoldText = true
            gravity = Gravity.CENTER
        }
        val message = TextView(this).apply {
            text = "「Arena」 말고는 쓸 수 없어요.\n잠시 후 자동으로 돌아갑니다."
            setTextColor(0xCCFFFFFF.toInt())
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            gravity = Gravity.CENTER
            setLineSpacing(0f, 1.25f)
        }
        val time = TextView(this).apply {
            text = remainingText()
            setTextColor(0xFFF5B942.toInt())
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            gravity = Gravity.CENTER
        }
        timeText = time
        val progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 1000
            progress = 0
            progressTintList = android.content.res.ColorStateList.valueOf(0xFFF5B942.toInt())
            progressBackgroundTintList = android.content.res.ColorStateList.valueOf(0x33FFFFFF)
        }
        val back = Button(this).apply {
            text = "「Arena」(으)로 돌아가기"
            isAllCaps = false
            setTextColor(0xFF1D1E2C.toInt())
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            background = GradientDrawable().apply {
                cornerRadius = dp(28).toFloat()
                setColor(0xFFF5B942.toInt())
            }
            setPadding(dp(24), dp(12), dp(24), dp(12))
            setOnClickListener { returnToArena() }
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(0xF2121318.toInt())
            setPadding(dp(32), dp(32), dp(32), dp(32))
            isClickable = true  // 뒤의 홈 화면·다른 앱을 누르지 못하게
            addView(TextView(this@FocusAccessibilityService).apply {
                text = "🎯"
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 44f)
                gravity = Gravity.CENTER
            })
            addView(title, lp(top = 12))
            addView(message, lp(top = 12))
            addView(time, lp(top = 10))
            addView(progress, LinearLayout.LayoutParams(dp(220), dp(6)).apply { topMargin = dp(22) })
            addView(back, lp(top = 28))
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        )
        try {
            wm.addView(root, params)
        } catch (e: Exception) {
            returnToArena()  // 화면을 못 띄우면 바로 돌아감
            return
        }
        blocker = root
        shownAt = System.currentTimeMillis()
        ObjectAnimator.ofInt(progress, "progress", 0, 1000).apply {
            duration = BLOCK_MS
            interpolator = LinearInterpolator()
            start()
        }
        handler.removeCallbacks(goBack)
        handler.postDelayed(goBack, BLOCK_MS)
        handler.post(tickTime)
    }

    private fun lp(top: Int) = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
    ).apply { topMargin = dp(top) }

    private fun hideBlocker() {
        handler.removeCallbacks(goBack)
        handler.removeCallbacks(tickTime)
        val v = blocker ?: return
        blocker = null
        timeText = null
        try { getSystemService(WindowManager::class.java).removeView(v) } catch (e: Exception) { }
    }

    private fun returnToArena() {
        handler.removeCallbacks(goBack)
        try {
            startActivity(
                Intent(this, MainActivity::class.java)
                    .putExtra(MainActivity.EXTRA_BROUGHT_BACK, true)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            )
        } catch (e: Exception) {
            performGlobalAction(GLOBAL_ACTION_BACK)
        }
        // Arena가 앞에 뜨면 이벤트로 걷히지만, 혹시 몰라 조금 뒤에 걷음
        handler.postDelayed({ hideBlocker() }, 700)
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        hideBlocker()
        super.onDestroy()
    }
}
