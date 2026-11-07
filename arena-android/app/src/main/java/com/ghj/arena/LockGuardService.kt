package com.ghj.arena

import android.app.AppOpsManager
import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.Process
import android.provider.Settings
import android.provider.Telephony
import android.telecom.TelecomManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * 앱 밖으로 못 나가게: 스르륵을 끝까지 보기 전에 다른 앱으로 가면 1~2초 뒤에 이 앱을 다시 앞으로 불러옵니다.
 * 전화(걸려 오는 중·통화 중, 보이스톡 같은 인터넷 통화 포함)와 전화·문자·카카오톡 앱은 그대로 쓸 수 있습니다.
 *
 * - 다시 불러오려면 '다른 앱 위에 표시' 권한이 필요합니다 (안드로이드가 뒤에서 화면 띄우기를 막기 때문).
 * - 지금 쓰는 앱이 문자·카카오톡인지 알려면 '사용 정보 접근' 권한이 필요합니다.
 *   없으면 앱 안의 📞·💬 버튼으로 연 뒤 5분 동안만 밖에 있을 수 있습니다.
 */
class LockGuardService : Service() {

    companion object {
        /** 지금 잠금 감시가 필요한지 (MainActivity가 정함) */
        @Volatile var guardActive = false
        /** 이 앱 화면이 지금 앞에 있는지 */
        @Volatile var appInForeground = false
        /** 📞·💬 버튼으로 다른 앱을 연 경우, 이 시각까지는 불러오지 않음 */
        @Volatile var allowUntil = 0L

        private const val CHANNEL = "reading_lock"
        private const val NOTIFY_ID = 7001
        private const val GRACE_MS = 1500L

        // 써도 되는 앱 (전화·문자·메신저)
        private val ALWAYS_ALLOWED = setOf(
            "com.kakao.talk",
            "com.samsung.android.messaging", "com.google.android.apps.messaging", "com.android.mms",
            "com.samsung.android.dialer", "com.google.android.dialer", "com.android.dialer",
            "com.samsung.android.incallui", "com.android.incallui", "com.android.server.telecom",
            "com.android.phone", "com.skt.prod.dialer", "com.skt.prod.phone", "com.lguplus.phone"
        )

        fun canDrawOverlays(ctx: Context) = Settings.canDrawOverlays(ctx)

        fun hasUsageAccess(ctx: Context): Boolean {
            val ops = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            val mode = if (Build.VERSION.SDK_INT >= 29) {
                ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
            } else {
                @Suppress("DEPRECATION")
                ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
            }
            return mode == AppOpsManager.MODE_ALLOWED
        }

        fun start(ctx: Context) {
            guardActive = true
            try {
                ctx.startForegroundService(Intent(ctx, LockGuardService::class.java))
            } catch (e: Exception) {
                // 뒤에서는 시작할 수 없는 경우 등: 다음에 앞에 왔을 때 다시 시도
            }
        }

        fun stop(ctx: Context) {
            guardActive = false
            ctx.stopService(Intent(ctx, LockGuardService::class.java))
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var awaySince = 0L
    private val allowedApps = mutableSetOf<String>()

    private val tick = object : Runnable {
        override fun run() {
            if (!guardActive) {
                stopSelf()
                return
            }
            check()
            handler.postDelayed(this, 700)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        allowedApps += ALWAYS_ALLOWED
        allowedApps += packageName
        try {
            Telephony.Sms.getDefaultSmsPackage(this)?.let { allowedApps += it }
        } catch (e: Exception) { }
        try {
            (getSystemService(Context.TELECOM_SERVICE) as TelecomManager).defaultDialerPackage?.let { allowedApps += it }
        } catch (e: Exception) { }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "스르륵 끝까지 보기", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val n: Notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_lock)
            .setContentTitle("스르륵을 끝까지 보는 중이에요")
            .setContentText("다 볼 때까지 앱 밖으로 나갈 수 없어요 · 전화와 메시지는 쓸 수 있어요")
            .setOngoing(true)
            .setContentIntent(open)
            .build()
        ServiceCompat.startForeground(
            this, NOTIFY_ID, n,
            if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
        )
        handler.removeCallbacks(tick)
        handler.post(tick)
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        super.onDestroy()
    }

    /** 최근 앱 목록에서 앱을 밀어서 닫아도 다시 엶 */
    override fun onTaskRemoved(rootIntent: Intent?) {
        if (guardActive) bringBack()
        super.onTaskRemoved(rootIntent)
    }

    private fun check() {
        if (appInForeground) {
            awaySince = 0
            return
        }
        val now = System.currentTimeMillis()
        if (screenOffOrLocked() || inCall() || now < allowUntil || inAllowedApp()) {
            awaySince = 0
            return
        }
        if (awaySince == 0L) awaySince = now
        if (now - awaySince >= GRACE_MS) {
            awaySince = 0
            bringBack()
        }
    }

    /** 화면이 꺼졌거나 잠금 화면이면 다른 앱으로 간 게 아님 */
    private fun screenOffOrLocked(): Boolean {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        return !pm.isInteractive || km.isKeyguardLocked
    }

    /** 전화가 오는 중이거나 통화 중 (인터넷 통화 포함) */
    private fun inCall(): Boolean {
        val mode = (getSystemService(Context.AUDIO_SERVICE) as AudioManager).mode
        return mode == AudioManager.MODE_RINGTONE || mode == AudioManager.MODE_IN_CALL ||
            mode == AudioManager.MODE_IN_COMMUNICATION ||
            (Build.VERSION.SDK_INT >= 30 && mode == AudioManager.MODE_CALL_SCREENING)
    }

    /** 지금 앞에 있는 앱이 전화·문자·메신저인지 ('사용 정보 접근' 권한이 있을 때만 알 수 있음) */
    private fun inAllowedApp(): Boolean {
        if (!hasUsageAccess(this)) return false
        val usm = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val end = System.currentTimeMillis()
        val events = usm.queryEvents(end - 10 * 60 * 1000, end)
        var top: String? = null
        val e = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(e)
            // ACTIVITY_RESUMED(29+)와 예전 MOVE_TO_FOREGROUND는 같은 값(1)
            if (e.eventType == 1) top = e.packageName
        }
        return top != null && top in allowedApps
    }

    private fun bringBack() {
        if (!canDrawOverlays(this)) return  // 권한이 없으면 안드로이드가 막음
        try {
            startActivity(
                Intent(this, MainActivity::class.java)
                    .putExtra(MainActivity.EXTRA_BROUGHT_BACK, true)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            )
        } catch (e: Exception) { }
    }
}
