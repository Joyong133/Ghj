package com.ghj.arena

import android.app.Activity
import android.view.LayoutInflater
import android.widget.EditText
import android.widget.TextView
import com.google.android.material.button.MaterialButtonToggleGroup
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import org.json.JSONObject

/**
 * 답변 분량 설정. 켜 두면 질문을 보낼 때 끝에 분량 지시를 붙입니다.
 * 예) "[분량: 공백 포함 500자 이내로 답해 줘]"
 */
class LengthSettings(private val activity: Activity) {

    private val prefs = activity.getSharedPreferences("length", Activity.MODE_PRIVATE)

    var enabled: Boolean
        get() = prefs.getBoolean("enabled", false)
        set(v) = prefs.edit().putBoolean("enabled", v).apply()

    private var amount: Int
        get() = prefs.getInt("amount", 500)
        set(v) = prefs.edit().putInt("amount", v).apply()

    /** 0 = 글자, 1 = 문장, 2 = 문단 */
    private var unit: Int
        get() = prefs.getInt("unit", 0)
        set(v) = prefs.edit().putInt("unit", v).apply()

    /** 0 = 이내(최대), 1 = 정도(대략) */
    private var mode: Int
        get() = prefs.getInt("mode", 0)
        set(v) = prefs.edit().putInt("mode", v).apply()

    private fun amountText(a: Int, u: Int): String = when (u) {
        1 -> "${a}문장"
        2 -> "${a}문단"
        else -> "공백 포함 ${a}자"
    }

    /** 설정 요약 (목록 화면에 표시) */
    fun summary(): String {
        val what = when (unit) {
            1 -> "${amount}문장"
            2 -> "${amount}문단"
            else -> "${amount}자"
        }
        return if (mode == 0) "$what 이내" else "약 $what"
    }

    /** 질문 끝에 붙일 글 */
    fun instruction(a: Int = amount, u: Int = unit, m: Int = mode): String =
        if (m == 0) "\n\n[분량: ${amountText(a, u)} 이내로 답해 줘]"
        else "\n\n[분량: ${amountText(a, u)} 정도로 답해 줘]"

    /** 페이지 스크립트에 넘길 설정 (끄면 null) */
    fun scriptConfig(): String =
        if (enabled) JSONObject().put("text", instruction()).toString() else "null"

    fun edit(onSaved: () -> Unit) {
        val form = LayoutInflater.from(activity).inflate(R.layout.dialog_length, null)
        val amountInput = form.findViewById<EditText>(R.id.lengthAmount)
        val unitGroup = form.findViewById<MaterialButtonToggleGroup>(R.id.lengthUnit)
        val modeGroup = form.findViewById<MaterialButtonToggleGroup>(R.id.lengthMode)
        val preview = form.findViewById<TextView>(R.id.lengthPreview)

        val unitIds = intArrayOf(R.id.unitChars, R.id.unitSentences, R.id.unitParagraphs)
        val modeIds = intArrayOf(R.id.modeMax, R.id.modeAbout)
        amountInput.setText(amount.toString())
        unitGroup.check(unitIds[unit.coerceIn(0, 2)])
        modeGroup.check(modeIds[mode.coerceIn(0, 1)])

        fun current(): Triple<Int, Int, Int>? {
            val a = amountInput.text.toString().trim().toIntOrNull() ?: return null
            if (a <= 0) return null
            return Triple(a, unitIds.indexOf(unitGroup.checkedButtonId), modeIds.indexOf(modeGroup.checkedButtonId))
        }
        fun refreshPreview() {
            val c = current()
            preview.text = if (c == null) "숫자를 적어 주세요"
            else "보낼 때 붙는 글:" + instruction(c.first, c.second.coerceAtLeast(0), c.third.coerceAtLeast(0))
        }
        refreshPreview()
        unitGroup.addOnButtonCheckedListener { _, _, _ -> refreshPreview() }
        modeGroup.addOnButtonCheckedListener { _, _, _ -> refreshPreview() }
        amountInput.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) = refreshPreview()
        })

        val dialog = MaterialAlertDialogBuilder(activity)
            .setTitle("답변 분량 정하기")
            .setView(form)
            .setNegativeButton("취소", null)
            .setPositiveButton("저장하고 켜기", null)
            .create()
        dialog.setOnShowListener {
            dialog.getButton(android.content.DialogInterface.BUTTON_POSITIVE).setOnClickListener {
                val c = current()
                if (c == null) {
                    amountInput.error = "1 이상의 숫자를 적어 주세요"
                    return@setOnClickListener
                }
                amount = c.first
                unit = c.second.coerceAtLeast(0)
                mode = c.third.coerceAtLeast(0)
                enabled = true
                dialog.dismiss()
                onSaved()
            }
        }
        dialog.show()
    }
}
