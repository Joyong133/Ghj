package com.focustodo.app

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import android.provider.Telephony
import android.telecom.TelecomManager
import android.view.inputmethod.InputMethodManager

/** 집중 중에 열어도 되는 앱 판단 */
object FocusPolicy {

    /** 항상 허용: 시스템 UI(알림창·잠금화면), 전화/통화화면, 문자, 연락처, 긴급전화, 권한 팝업 */
    private val BUILT_IN = setOf(
        "android",
        "com.android.systemui",
        // 전화 / 통화 화면
        "com.android.phone",
        "com.android.server.telecom",
        "com.android.incallui",
        "com.android.dialer",
        "com.google.android.dialer",
        "com.samsung.android.dialer",
        "com.samsung.android.incallui",
        "com.android.emergency",
        // 문자
        "com.android.mms",
        "com.android.messaging",
        "com.google.android.apps.messaging",
        "com.samsung.android.messaging",
        // 연락처
        "com.android.contacts",
        "com.google.android.contacts",
        "com.samsung.android.app.contacts",
        // 권한 요청 팝업
        "com.android.permissioncontroller",
        "com.google.android.permissioncontroller",
    )

    fun dialerPackage(ctx: Context): String? = try {
        (ctx.getSystemService(Context.TELECOM_SERVICE) as TelecomManager).defaultDialerPackage
    } catch (_: Exception) {
        null
    }

    fun smsPackage(ctx: Context): String? = try {
        Telephony.Sms.getDefaultSmsPackage(ctx)
    } catch (_: Exception) {
        null
    }

    fun contactsPackage(ctx: Context): String? = try {
        val i = Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_CONTACTS)
        ctx.packageManager.resolveActivity(i, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName
    } catch (_: Exception) {
        null
    }

    /** 전화·문자·연락처 기본 앱 (사용자가 끌 수 없는 허용 앱) */
    fun coreApps(ctx: Context): Set<String> =
        setOfNotNull(dialerPackage(ctx), smsPackage(ctx), contactsPackage(ctx))

    private fun keyboards(ctx: Context): Set<String> = try {
        (ctx.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
            .enabledInputMethodList.map { it.packageName }.toSet()
    } catch (_: Exception) {
        emptySet()
    }

    fun allowedPackages(ctx: Context): Set<String> =
        BUILT_IN + ctx.packageName + coreApps(ctx) + keyboards(ctx) + FocusStore(ctx).extraAllowed()

    fun isServiceEnabled(ctx: Context): Boolean {
        val enabled = Settings.Secure.getString(
            ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        val me = ComponentName(ctx, FocusAccessibilityService::class.java)
        return enabled.split(':').any { ComponentName.unflattenFromString(it) == me }
    }
}
