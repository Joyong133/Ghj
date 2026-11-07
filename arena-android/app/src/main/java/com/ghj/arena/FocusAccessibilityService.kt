package com.ghj.arena

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.widget.Toast

/**
 * 원앱 집중 잠금 (접근성): 집중 중에 허용하지 않은 앱이 화면에 뜨면 바로 Arena로 돌아옵니다.
 * 홈 화면, 최근 앱, 다른 앱 실행이 모두 여기에 걸립니다. 전화·메시지·연락처·카카오톡과
 * 직접 허용한 앱, 시스템 화면(알림창 등)과 키보드는 그대로 쓸 수 있습니다.
 */
class FocusAccessibilityService : AccessibilityService() {

    companion object {
        fun isEnabled(ctx: Context): Boolean {
            val me = ComponentName(ctx, FocusAccessibilityService::class.java).flattenToString()
            val list = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
            return list.split(':').any { it.equals(me, ignoreCase = true) }
        }
    }

    private var allowed: Set<String> = emptySet()
    private var allowedAt = 0L
    private var lastBounce = 0L

    override fun onServiceConnected() {
        super.onServiceConnected()
        allowed = FocusApps.allowed(this)
        allowedAt = System.currentTimeMillis()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        if (!LockGuardService.guardActive) return
        val pkg = event.packageName?.toString() ?: return
        val now = System.currentTimeMillis()
        if (now - allowedAt > 10_000) {  // 허용 목록을 가끔 새로 읽음
            allowed = FocusApps.allowed(this)
            allowedAt = now
        }
        // 앱마다 확인: 전화·메시지·허용한 앱만 통과. (📞·💬 버튼의 '잠깐 허용'은 여기서는 쓰지 않음 —
        // 쓰면 그 사이에 홈·최근 앱으로 빠져나갈 수 있음)
        // 시스템 화면(알림창 등)은 허용하지만, 최근 앱 화면은 막음 (최근 앱이 시스템 화면 소속인 휴대폰이 있음)
        val cls = event.className?.toString().orEmpty()
        val recents = pkg == "com.android.systemui" &&  // 전화 앱의 '최근 기록' 같은 화면은 건드리지 않음
            (cls.contains("recent", ignoreCase = true) || cls.contains("overview", ignoreCase = true))
        if (pkg in allowed && !recents) return
        if (now - lastBounce < 400) return
        lastBounce = now
        try {
            startActivity(
                Intent(this, MainActivity::class.java)
                    .putExtra(MainActivity.EXTRA_BROUGHT_BACK, true)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            )
        } catch (e: Exception) {
            performGlobalAction(GLOBAL_ACTION_BACK)
        }
        Toast.makeText(this, "「Arena」 말고는 쓸 수 없어요. 다 읽으면 풀려요", Toast.LENGTH_SHORT).show()
    }

    override fun onInterrupt() {}
}
