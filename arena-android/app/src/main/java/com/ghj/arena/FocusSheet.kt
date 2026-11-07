package com.ghj.arena

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.TextView
import android.widget.Toast
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.dialog.MaterialAlertDialogBuilder

/**
 * 원앱 집중 창 (OneFocus 기능을 Arena에 넣은 것).
 * 끝까지 보기 잠금으로 스르륵을 열면 바로 뜨고, ⏱ 타이머를 누르면 스르륵에 나온 남은 시간만큼 맞춰집니다.
 */
class FocusSheet(private val activity: Activity) {

    private var sheet: BottomSheetDialog? = null
    private var refreshA11y: (() -> Unit)? = null

    /**
     * @param seconds 스르륵에 나온 남은 시간(초)
     * @param onStart 집중 시작 (타이머 = 스르륵 시간)
     * @param onSkip 집중 없이 스르륵만 보기
     */
    fun show(seconds: Int, onStart: () -> Unit, onSkip: () -> Unit) {
        val view = LayoutInflater.from(activity).inflate(R.layout.focus_sheet, null)
        val dialog = BottomSheetDialog(activity)
        dialog.setContentView(view)
        dialog.behavior.state = BottomSheetBehavior.STATE_EXPANDED
        dialog.behavior.skipCollapsed = true
        dialog.setCancelable(false)  // 둘 중 하나를 골라야 함
        sheet = dialog

        // ⏱ 타이머: 누르면 스르륵 시간만큼
        val card = view.findViewById<MaterialCardView>(R.id.timerCard)
        val radio = view.findViewById<RadioButton>(R.id.timerRadio)
        val value = view.findViewById<TextView>(R.id.timerValue)
        val hint = view.findViewById<TextView>(R.id.timerHint)
        val start = view.findViewById<MaterialButton>(R.id.startFocus)
        card.setOnClickListener {
            radio.isChecked = true
            card.isChecked = true
            value.text = format(seconds)
            hint.text = "스르륵에 나온 시간만큼 (멈추면 같이 멈춰요)"
            start.isEnabled = true
        }

        // 집중 중에 열 수 있는 앱
        val list = view.findViewById<LinearLayout>(R.id.allowedList)
        fun render() {
            list.removeAllViews()
            fun row(text: String, onDelete: (() -> Unit)?) {
                val line = LinearLayout(activity).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    minimumHeight = (40 * activity.resources.displayMetrics.density).toInt()
                }
                line.addView(TextView(activity).apply {
                    this.text = text
                    textSize = 14f
                }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                if (onDelete != null) {
                    line.addView(TextView(activity).apply {
                        this.text = "삭제"
                        textSize = 14f
                        setTextColor(0xFFD93025.toInt())
                        val pad = (10 * activity.resources.displayMetrics.density).toInt()
                        setPadding(pad, pad, pad, pad)
                        setOnClickListener { onDelete() }
                    })
                }
                list.addView(line)
            }
            val ctx = activity
            row("📞 전화 (" + (FocusApps.dialer(ctx)?.let { FocusApps.label(ctx, it) } ?: "전화") + " · 연락처)", null)
            row("💬 메시지 (" + (FocusApps.sms(ctx)?.let { FocusApps.label(ctx, it) } ?: "문자") + ")", null)
            if (FocusApps.installed(ctx, FocusApps.KAKAO)) row("💬 카카오톡", null)
            FocusApps.userApps(ctx).sortedBy { FocusApps.label(ctx, it) }.forEach { pkg ->
                row("• " + FocusApps.label(ctx, pkg)) {
                    FocusApps.setUserApps(ctx, FocusApps.userApps(ctx) - pkg)
                    render()
                }
            }
        }
        render()
        view.findViewById<View>(R.id.addAllowed).setOnClickListener { pickApp { render() } }

        // 잠금 기능(접근성) 상태
        val status = view.findViewById<TextView>(R.id.a11yStatus)
        val help = view.findViewById<View>(R.id.a11yHelp)
        val buttons = view.findViewById<View>(R.id.a11yButtons)
        refreshA11y = {
            val on = FocusAccessibilityService.isEnabled(activity)
            status.text = if (on) "✅ 잠금 기능(접근성) 켜짐" else "⚠️ 잠금 기능(접근성)을 켜야 해요"
            help.visibility = if (on) View.GONE else View.VISIBLE
            buttons.visibility = if (on) View.GONE else View.VISIBLE
        }
        refreshA11y?.invoke()
        view.findViewById<View>(R.id.openA11y).setOnClickListener {
            try { activity.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) } catch (e: Exception) { }
        }
        view.findViewById<View>(R.id.openAppInfo).setOnClickListener {
            try {
                activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + activity.packageName)))
            } catch (e: Exception) { }
        }

        start.setOnClickListener {
            if (!FocusAccessibilityService.isEnabled(activity) && !Settings.canDrawOverlays(activity)) {
                Toast.makeText(activity, "잠금 기능(접근성)이 꺼져 있어서, 앱 밖으로 나가는 건 막지 못해요", Toast.LENGTH_LONG).show()
            }
            dialog.dismiss()
            onStart()
        }
        view.findViewById<View>(R.id.skipFocus).setOnClickListener {
            dialog.dismiss()
            onSkip()
        }
        dialog.setOnDismissListener { sheet = null; refreshA11y = null }
        dialog.show()
    }

    /** 접근성 설정에서 돌아왔을 때 상태를 다시 보여 줌 */
    fun onResume() { refreshA11y?.invoke() }

    private fun pickApp(after: () -> Unit) {
        val apps = FocusApps.launchable(activity).filter { it.first !in FocusApps.userApps(activity) }
        MaterialAlertDialogBuilder(activity)
            .setTitle("허용할 앱 추가")
            .setItems(apps.map { it.second as CharSequence }.toTypedArray()) { _, which ->
                FocusApps.setUserApps(activity, FocusApps.userApps(activity) + apps[which].first)
                after()
            }
            .setNegativeButton("닫기", null)
            .show()
    }

    companion object {
        fun format(seconds: Int): String =
            if (seconds >= 60) "${seconds / 60}분 ${seconds % 60}초" else "${seconds}초"
    }
}
