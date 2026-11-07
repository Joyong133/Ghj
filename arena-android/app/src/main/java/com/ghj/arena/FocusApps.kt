package com.ghj.arena

import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.telecom.TelecomManager
import android.view.inputmethod.InputMethodManager

/** 원앱 집중 중에 열 수 있는 앱 (전화·메시지·연락처·카카오톡 + 직접 추가한 앱) */
object FocusApps {
    private const val PREFS = "ui"
    private const val KEY = "focusAllowed"

    private val CONTACTS = listOf("com.samsung.android.app.contacts", "com.android.contacts", "com.google.android.contacts")
    private val CALL_UI = listOf(
        "com.samsung.android.incallui", "com.android.incallui", "com.android.server.telecom", "com.android.phone",
        "com.samsung.android.dialer", "com.google.android.dialer", "com.android.dialer", "com.skt.prod.dialer", "com.skt.prod.phone"
    )
    private val MESSAGES = listOf("com.samsung.android.messaging", "com.google.android.apps.messaging", "com.android.mms")
    const val KAKAO = "com.kakao.talk"

    fun dialer(ctx: Context): String? = try {
        (ctx.getSystemService(Context.TELECOM_SERVICE) as TelecomManager).defaultDialerPackage
    } catch (e: Exception) { null }

    fun sms(ctx: Context): String? = try { Telephony.Sms.getDefaultSmsPackage(ctx) } catch (e: Exception) { null }

    fun contacts(ctx: Context): String? = CONTACTS.firstOrNull { installed(ctx, it) }

    fun installed(ctx: Context, pkg: String) = ctx.packageManager.getLaunchIntentForPackage(pkg) != null

    fun label(ctx: Context, pkg: String): String = try {
        val pm = ctx.packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
    } catch (e: Exception) { pkg }

    /** 직접 추가한 앱 */
    fun userApps(ctx: Context): Set<String> =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getStringSet(KEY, emptySet())!!.toSet()

    fun setUserApps(ctx: Context, apps: Set<String>) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putStringSet(KEY, apps).apply()
    }

    /** 집중 중에 화면에 떠도 되는 모든 앱 (시스템 화면·키보드 포함) */
    fun allowed(ctx: Context): Set<String> {
        val set = mutableSetOf(ctx.packageName, "android", "com.android.systemui")
        set += CALL_UI
        set += MESSAGES
        set += CONTACTS
        set += KAKAO
        dialer(ctx)?.let { set += it }
        sms(ctx)?.let { set += it }
        set += userApps(ctx)
        try {  // 키보드
            val imm = ctx.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            imm.enabledInputMethodList.forEach { set += it.packageName }
        } catch (e: Exception) { }
        return set
    }

    /** 실행할 수 있는 앱 목록 (허용할 앱 추가용) */
    fun launchable(ctx: Context): List<Pair<String, String>> {
        val pm = ctx.packageManager
        val main = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        return pm.queryIntentActivities(main, 0)
            .map { it.activityInfo.packageName to it.loadLabel(pm).toString() }
            .filter { it.first != ctx.packageName }
            .distinctBy { it.first }
            .sortedBy { it.second }
    }
}
