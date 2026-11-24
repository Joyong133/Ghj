package com.focustodo.app

import android.app.Activity
import android.app.AlertDialog
import android.app.TimePickerDialog
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast

class ScheduleActivity : Activity() {

    private lateinit var store: FocusStore
    private lateinit var schedules: MutableList<Schedule>
    private val adapter = ScheduleAdapter()
    private lateinit var lockedBanner: TextView
    private lateinit var emptyText: TextView
    private lateinit var btnAdd: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_schedule)
        store = FocusStore(this)
        schedules = store.schedules()
        lockedBanner = findViewById(R.id.lockedBanner)
        emptyText = findViewById(R.id.scheduleEmpty)
        btnAdd = findViewById(R.id.btnAddSchedule)
        findViewById<ListView>(R.id.scheduleList).adapter = adapter
        btnAdd.setOnClickListener { if (checkUnlocked()) showEditor() }
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun locked() = store.isFocusActive()

    private fun checkUnlocked(): Boolean {
        if (locked()) {
            Toast.makeText(this, "🔒 집중 중에는 시간표를 바꿀 수 없어요", Toast.LENGTH_SHORT).show()
            refresh()
            return false
        }
        return true
    }

    private fun save() {
        store.saveSchedules(schedules)
        refresh()
    }

    private fun refresh() {
        val l = locked()
        lockedBanner.visibility = if (l) View.VISIBLE else View.GONE
        btnAdd.isEnabled = !l
        emptyText.visibility = if (schedules.isEmpty()) View.VISIBLE else View.GONE
        adapter.notifyDataSetChanged()
    }

    private fun showEditor() {
        if (!FocusPolicy.isServiceEnabled(this)) {
            Toast.makeText(this, "참고: 접근성에서 '집중 투두'를 켜야 실제로 차단돼요", Toast.LENGTH_LONG).show()
        }
        var start = 9 * 60
        var end = 12 * 60
        val view = layoutInflater.inflate(R.layout.dialog_schedule, null)
        val btnStart = view.findViewById<Button>(R.id.dlgStart)
        val btnEnd = view.findViewById<Button>(R.id.dlgEnd)
        val daysRow = view.findViewById<LinearLayout>(R.id.dlgDays)

        fun updateButtons() {
            btnStart.text = "시작 ${FocusStore.fmtMin(start)}"
            btnEnd.text = "종료 ${FocusStore.fmtMin(end)}"
        }
        updateButtons()
        btnStart.setOnClickListener {
            TimePickerDialog(this, { _, h, m -> start = h * 60 + m; updateButtons() }, start / 60, start % 60, true).show()
        }
        btnEnd.setOnClickListener {
            TimePickerDialog(this, { _, h, m -> end = h * 60 + m; updateButtons() }, end / 60, end % 60, true).show()
        }

        val checks = FocusStore.DAY_NAMES.mapIndexed { i, name ->
            CheckBox(this).apply {
                text = name
                isChecked = i < 5 // 기본: 평일
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                textSize = 12f
            }
        }
        checks.forEach { daysRow.addView(it) }

        AlertDialog.Builder(this)
            .setTitle("집중 시간 추가")
            .setView(view)
            .setPositiveButton("저장") { _, _ ->
                var days = 0
                checks.forEachIndexed { i, c -> if (c.isChecked) days = days or (1 shl i) }
                when {
                    days == 0 -> Toast.makeText(this, "요일을 하나 이상 골라 주세요", Toast.LENGTH_SHORT).show()
                    start == end -> Toast.makeText(this, "시작과 종료 시간이 같아요", Toast.LENGTH_SHORT).show()
                    !checkUnlocked() -> {}
                    else -> {
                        schedules.add(Schedule(System.currentTimeMillis(), start, end, days, true))
                        schedules.sortBy { it.startMin }
                        save()
                        if (store.isFocusActive()) {
                            Toast.makeText(this, "🎯 지금이 집중 시간이에요. 바로 시작합니다!", Toast.LENGTH_LONG).show()
                        }
                    }
                }
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private inner class ScheduleAdapter : BaseAdapter() {
        override fun getCount() = schedules.size
        override fun getItem(position: Int) = schedules[position]
        override fun getItemId(position: Int) = schedules[position].id

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val v = convertView ?: layoutInflater.inflate(R.layout.item_schedule, parent, false)
            val s = schedules[position]
            val overnight = if (s.endMin <= s.startMin) " (다음날)" else ""
            v.findViewById<TextView>(R.id.schTime).text =
                "${FocusStore.fmtMin(s.startMin)} ~ ${FocusStore.fmtMin(s.endMin)}$overnight"
            v.findViewById<TextView>(R.id.schDays).text = FocusStore.fmtDays(s.days)

            val l = locked()
            val sw = v.findViewById<Switch>(R.id.schSwitch)
            sw.setOnCheckedChangeListener(null)
            sw.isChecked = s.enabled
            sw.isEnabled = !l
            sw.setOnCheckedChangeListener { _, checked ->
                if (checkUnlocked()) {
                    s.enabled = checked
                    save()
                }
            }
            val del = v.findViewById<ImageButton>(R.id.schDelete)
            del.isEnabled = !l
            del.alpha = if (l) 0.3f else 1f
            del.setOnClickListener {
                if (checkUnlocked()) {
                    schedules.remove(s)
                    save()
                }
            }
            return v
        }
    }
}
