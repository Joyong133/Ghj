package com.focustodo.app

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent

/**
 * 집중 시간 동안 허용되지 않은 앱이 앞에 나오면 집중 투두 화면으로 되돌린다.
 * - 창 전환 이벤트로 즉시 감지
 * - 1초마다 현재 앞 화면도 확인 (집중 시간이 시작되는 순간 다른 앱을 쓰고 있던 경우 등)
 */
class FocusAccessibilityService : AccessibilityService() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var store: FocusStore

    private var allowed: Set<String> = emptySet()
    private var allowedLoadedAt = 0L
    private var lastRedirectAt = 0L
    private var redirectStreak = 0

    private val tick = object : Runnable {
        override fun run() {
            enforce(null)
            handler.postDelayed(this, 1000)
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        store = FocusStore(this)
        handler.removeCallbacks(tick)
        handler.post(tick)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            event.packageName?.toString()?.let { enforce(it) }
        }
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        super.onDestroy()
    }

    private fun isAllowed(pkg: String): Boolean {
        val now = SystemClock.elapsedRealtime()
        if (now - allowedLoadedAt > 5000 || allowed.isEmpty()) {
            allowed = FocusPolicy.allowedPackages(this)
            allowedLoadedAt = now
        }
        return pkg in allowed
    }

    private fun enforce(eventPkg: String?) {
        if (!::store.isInitialized) return
        if (!store.isFocusActive()) {
            redirectStreak = 0
            return
        }
        val pkg = eventPkg ?: try {
            rootInActiveWindow?.packageName?.toString()
        } catch (_: Exception) {
            null
        } ?: return

        if (isAllowed(pkg)) {
            if (pkg == packageName) redirectStreak = 0
            return
        }

        val now = SystemClock.elapsedRealtime()
        if (now - lastRedirectAt < 700) return
        redirectStreak = if (now - lastRedirectAt < 4000) redirectStreak + 1 else 0
        lastRedirectAt = now

        // 앞으로 가져오기가 계속 실패하면 먼저 홈으로 빠져나온 뒤 다시 띄운다.
        if (redirectStreak >= 2) performGlobalAction(GLOBAL_ACTION_HOME)

        try {
            startActivity(
                Intent(this, MainActivity::class.java)
                    .addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK or
                            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                            Intent.FLAG_ACTIVITY_SINGLE_TOP
                    )
                    .putExtra(MainActivity.EXTRA_BLOCKED, pkg)
            )
        } catch (_: Exception) {
            performGlobalAction(GLOBAL_ACTION_HOME)
        }
    }
}
