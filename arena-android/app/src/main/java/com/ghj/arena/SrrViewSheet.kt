package com.ghj.arena

import android.app.Activity
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.LayoutInflater
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.button.MaterialButtonToggleGroup
import com.google.android.material.materialswitch.MaterialSwitch
import com.google.android.material.slider.Slider
import org.json.JSONObject

/**
 * 스르륵 보기 설정 (화면 색, 글자 크기, 줄 간격, 글꼴, 읽는 줄 강조, 커서, 빗소리 크기).
 * 바꿀 때마다 바로 [apply]로 페이지에 알려 주고, 설정은 기억합니다.
 */
class SrrViewSheet(
    private val activity: Activity,
    private val prefs: SharedPreferences,
    private val apply: (String) -> Unit,
) {
    /** 화면 색: 이름, 배경색, 글자색 (srr.js의 THEMES와 같은 색) */
    private data class Theme(val key: String, val label: String, val bg: Int, val fg: Int)

    private val themes = listOf(
        Theme("site", "기본", Color.WHITE, Color.DKGRAY),
        Theme("night", "밤", 0xFF0F1115.toInt(), 0xFFD6D8DE.toInt()),
        Theme("paper", "종이", 0xFFF4ECD8.toInt(), 0xFF3B3125.toInt()),
        Theme("forest", "숲", 0xFF13201A.toInt(), 0xFFCFE3D4.toInt()),
        Theme("ocean", "바다", 0xFF0D1A2B.toInt(), 0xFFCFE0F5.toInt()),
        Theme("sunset", "노을", 0xFF2B1A22.toInt(), 0xFFF4DAD3.toInt()),
        Theme("mint", "민트", 0xFFEEF7F3.toInt(), 0xFF20352B.toInt()),
        Theme("contrast", "고대비", Color.BLACK, Color.YELLOW),
    )
    private val lineHeights = doubleArrayOf(0.0, 1.6, 1.9, 2.3)
    private val fonts = arrayOf("site", "gothic", "serif")

    private fun defaults() = JSONObject()
        .put("theme", "site").put("scale", 1.0).put("lh", 0.0).put("font", "site")
        .put("focus", false).put("caret", false).put("volume", 0.9)

    /** 지금 설정 (JSON) */
    fun current(): JSONObject {
        val saved = prefs.getString("srrView", null) ?: return defaults()
        return try {
            val o = JSONObject(saved)
            val d = defaults()
            d.keys().forEach { k -> if (!o.has(k)) o.put(k, d.get(k)) }
            o
        } catch (e: Exception) {
            defaults()
        }
    }

    private fun save(o: JSONObject) {
        prefs.edit().putString("srrView", o.toString()).apply()
        apply(o.toString())
    }

    fun show(rainSoundOn: Boolean) {
        val view = LayoutInflater.from(activity).inflate(R.layout.srr_view_sheet, null)
        val sheet = BottomSheetDialog(activity)
        sheet.setContentView(view)
        sheet.behavior.state = BottomSheetBehavior.STATE_EXPANDED
        sheet.behavior.skipCollapsed = true
        sheet.window?.setDimAmount(0.12f)  // 뒤의 스르륵 화면이 잘 보이게 살짝만 어둡게

        val o = current()
        val density = activity.resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()

        // 화면 색 견본
        val row = view.findViewById<LinearLayout>(R.id.themeRow)
        val swatches = mutableListOf<Pair<String, FrameLayout>>()
        fun paintSwatches() {
            val sel = o.optString("theme")
            swatches.forEach { (key, frame) ->
                val t = themes.first { it.key == key }
                val bg = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    if (key == "site") {
                        colors = intArrayOf(Color.WHITE, 0xFF2A2B30.toInt())
                        orientation = GradientDrawable.Orientation.TL_BR
                    } else {
                        setColor(t.bg)
                    }
                    setStroke(if (key == sel) dp(3) else dp(1), if (key == sel) 0xFF2E7D32.toInt() else 0x33000000)
                }
                frame.background = bg
            }
        }
        themes.forEach { t ->
            val frame = FrameLayout(activity).apply {
                addView(TextView(activity).apply {
                    text = "가"
                    textSize = 16f
                    setTextColor(if (t.key == "site") 0xFF888888.toInt() else t.fg)
                    gravity = Gravity.CENTER
                }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                contentDescription = "화면 색: ${t.label}"
                setOnClickListener {
                    o.put("theme", t.key)
                    paintSwatches()
                    save(o)
                }
            }
            swatches += t.key to frame
            row.addView(LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                setPadding(dp(4), 0, dp(4), 0)
                addView(frame, LinearLayout.LayoutParams(dp(46), dp(46)))
                addView(TextView(activity).apply {
                    text = t.label
                    textSize = 12f
                    gravity = Gravity.CENTER
                    setPadding(0, dp(4), 0, 0)
                })
            })
        }
        paintSwatches()

        // 글자 크기
        val sizeValue = view.findViewById<TextView>(R.id.sizeValue)
        fun showSize() { sizeValue.text = "${Math.round(o.optDouble("scale", 1.0) * 100)}%" }
        fun changeSize(delta: Double?) {
            val next = if (delta == null) 1.0 else (o.optDouble("scale", 1.0) + delta).coerceIn(0.8, 2.0)
            o.put("scale", Math.round(next * 10) / 10.0)
            showSize()
            save(o)
        }
        showSize()
        view.findViewById<android.view.View>(R.id.sizeMinus).setOnClickListener { changeSize(-0.1) }
        view.findViewById<android.view.View>(R.id.sizePlus).setOnClickListener { changeSize(0.1) }
        view.findViewById<android.view.View>(R.id.sizeReset).setOnClickListener { changeSize(null) }

        // 줄 간격
        val lhIds = intArrayOf(R.id.lh0, R.id.lh1, R.id.lh2, R.id.lh3)
        val lhGroup = view.findViewById<MaterialButtonToggleGroup>(R.id.lhGroup)
        fun checkLh() {
            val cur = o.optDouble("lh", 0.0)
            val i = lineHeights.indices.minByOrNull { Math.abs(lineHeights[it] - cur) } ?: 0
            lhGroup.check(lhIds[i])
        }
        checkLh()
        lhGroup.addOnButtonCheckedListener { _, id, checked ->
            if (!checked) return@addOnButtonCheckedListener
            val i = lhIds.indexOf(id)
            if (i >= 0 && o.optDouble("lh", 0.0) != lineHeights[i]) {
                o.put("lh", lineHeights[i])
                save(o)
            }
        }

        // 글꼴
        val fontIds = intArrayOf(R.id.fontSite, R.id.fontGothic, R.id.fontSerif)
        val fontGroup = view.findViewById<MaterialButtonToggleGroup>(R.id.fontGroup)
        fun checkFont() { fontGroup.check(fontIds[fonts.indexOf(o.optString("font")).coerceAtLeast(0)]) }
        checkFont()
        fontGroup.addOnButtonCheckedListener { _, id, checked ->
            if (!checked) return@addOnButtonCheckedListener
            val f = fonts[fontIds.indexOf(id).coerceAtLeast(0)]
            if (o.optString("font") != f) {
                o.put("font", f)
                save(o)
            }
        }

        // 읽는 줄 강조, 커서
        val focus = view.findViewById<MaterialSwitch>(R.id.focusSwitch)
        val caret = view.findViewById<MaterialSwitch>(R.id.caretSwitch)
        focus.isChecked = o.optBoolean("focus")
        caret.isChecked = o.optBoolean("caret")
        focus.setOnCheckedChangeListener { _, c -> o.put("focus", c); save(o) }
        caret.setOnCheckedChangeListener { _, c -> o.put("caret", c); save(o) }

        // 빗소리 크기
        val volume = view.findViewById<Slider>(R.id.volumeSlider)
        val volumeLabel = view.findViewById<TextView>(R.id.volumeLabel)
        fun showVolume() {
            val v = Math.round(o.optDouble("volume", 0.9) * 100)
            volumeLabel.text = if (rainSoundOn) "빗소리 크기  ${v}%" else "빗소리 크기  ${v}% (빗소리를 켜면 들려요)"
        }
        volume.value = ((Math.round(o.optDouble("volume", 0.9) * 10) * 10).toInt()).coerceIn(0, 150).toFloat()
        showVolume()
        volume.addOnChangeListener { _, v, fromUser ->
            if (!fromUser) return@addOnChangeListener
            o.put("volume", v / 100.0)
            showVolume()
            save(o)
        }

        // 모두 기본값으로
        view.findViewById<android.view.View>(R.id.resetAll).setOnClickListener {
            val d = defaults()
            d.keys().forEach { k -> o.put(k, d.get(k)) }
            paintSwatches(); showSize(); checkLh(); checkFont()
            focus.isChecked = false
            caret.isChecked = false
            volume.value = 90f
            showVolume()
            save(o)
        }

        sheet.show()
    }
}
