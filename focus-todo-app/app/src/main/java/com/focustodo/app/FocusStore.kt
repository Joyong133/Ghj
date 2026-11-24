package com.focustodo.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

data class Todo(val id: Long, var text: String, var done: Boolean)

/**
 * 반복 집중 시간.
 * startMin/endMin: 하루 중 분(0~1439). end <= start 이면 자정을 넘기는 일정.
 * days: 비트마스크 (bit0=월 … bit6=일), 시작하는 요일 기준.
 */
data class Schedule(
    val id: Long,
    var startMin: Int,
    var endMin: Int,
    var days: Int,
    var enabled: Boolean,
) {
    fun hasDay(index: Int) = days and (1 shl index) != 0
}

class FocusStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("focus_todo", Context.MODE_PRIVATE)

    // ---------- 할 일 ----------
    fun todos(): MutableList<Todo> {
        val arr = JSONArray(prefs.getString(KEY_TODOS, "[]"))
        return MutableList(arr.length()) {
            val o = arr.getJSONObject(it)
            Todo(o.getLong("id"), o.getString("text"), o.getBoolean("done"))
        }
    }

    fun saveTodos(list: List<Todo>) {
        val arr = JSONArray()
        list.forEach { arr.put(JSONObject().put("id", it.id).put("text", it.text).put("done", it.done)) }
        prefs.edit().putString(KEY_TODOS, arr.toString()).apply()
    }

    // ---------- 집중 시간표 ----------
    fun schedules(): MutableList<Schedule> {
        val arr = JSONArray(prefs.getString(KEY_SCHEDULES, "[]"))
        return MutableList(arr.length()) {
            val o = arr.getJSONObject(it)
            Schedule(o.getLong("id"), o.getInt("start"), o.getInt("end"), o.getInt("days"), o.getBoolean("enabled"))
        }
    }

    fun saveSchedules(list: List<Schedule>) {
        val arr = JSONArray()
        list.forEach {
            arr.put(
                JSONObject().put("id", it.id).put("start", it.startMin).put("end", it.endMin)
                    .put("days", it.days).put("enabled", it.enabled)
            )
        }
        prefs.edit().putString(KEY_SCHEDULES, arr.toString()).apply()
    }

    // ---------- 즉시 집중 ----------
    var manualUntil: Long
        get() = prefs.getLong(KEY_MANUAL_UNTIL, 0L)
        set(v) = prefs.edit().putLong(KEY_MANUAL_UNTIL, v).apply()

    // ---------- 추가 허용 앱 ----------
    fun extraAllowed(): Set<String> = prefs.getStringSet(KEY_EXTRA_ALLOWED, emptySet())!!.toSet()

    fun setExtraAllowed(set: Set<String>) = prefs.edit().putStringSet(KEY_EXTRA_ALLOWED, set).apply()

    // ---------- 집중 상태 계산 ----------

    /** 지금 집중 중이면 종료 시각(ms), 아니면 null */
    fun activeUntil(now: Long = System.currentTimeMillis()): Long? {
        val cal = Calendar.getInstance().apply { timeInMillis = now }
        val minuteOfDay = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
        val today = dayIndex(cal)
        val yesterday = (today + 6) % 7

        var end: Long? = manualUntil.takeIf { it > now }
        for (s in schedules()) {
            if (!s.enabled || s.days == 0 || s.startMin == s.endMin) continue
            val e: Long? = if (s.startMin < s.endMin) {
                if (s.hasDay(today) && minuteOfDay >= s.startMin && minuteOfDay < s.endMin) at(cal, 0, s.endMin) else null
            } else {
                when {
                    s.hasDay(today) && minuteOfDay >= s.startMin -> at(cal, 1, s.endMin)
                    s.hasDay(yesterday) && minuteOfDay < s.endMin -> at(cal, 0, s.endMin)
                    else -> null
                }
            }
            if (e != null && (end == null || e > end)) end = e
        }
        return end
    }

    fun isFocusActive(now: Long = System.currentTimeMillis()) = activeUntil(now) != null

    /** 다음 집중 시작 시각(ms), 없으면 null */
    fun nextStart(now: Long = System.currentTimeMillis()): Long? {
        val cal = Calendar.getInstance().apply { timeInMillis = now }
        var best: Long? = null
        for (s in schedules()) {
            if (!s.enabled || s.days == 0 || s.startMin == s.endMin) continue
            for (d in 0..7) {
                val day = Calendar.getInstance().apply { timeInMillis = now; add(Calendar.DAY_OF_YEAR, d) }
                if (!s.hasDay(dayIndex(day))) continue
                val t = at(cal, d, s.startMin)
                if (t > now) {
                    if (best == null || t < best) best = t
                    break
                }
            }
        }
        return best
    }

    companion object {
        private const val KEY_TODOS = "todos"
        private const val KEY_SCHEDULES = "schedules"
        private const val KEY_MANUAL_UNTIL = "manual_until"
        private const val KEY_EXTRA_ALLOWED = "extra_allowed"

        val DAY_NAMES = arrayOf("월", "화", "수", "목", "금", "토", "일")

        /** 월=0 … 일=6 */
        fun dayIndex(cal: Calendar) = (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7

        private fun at(base: Calendar, dayOffset: Int, minuteOfDay: Int): Long =
            (base.clone() as Calendar).apply {
                set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
                add(Calendar.DAY_OF_YEAR, dayOffset)
                add(Calendar.MINUTE, minuteOfDay)
            }.timeInMillis

        fun fmtMin(m: Int) = "%02d:%02d".format(m / 60, m % 60)

        fun fmtDays(days: Int): String {
            if (days == 0b1111111) return "매일"
            if (days == 0b0011111) return "평일"
            if (days == 0b1100000) return "주말"
            return DAY_NAMES.indices.filter { days and (1 shl it) != 0 }.joinToString(" ") { DAY_NAMES[it] }
        }
    }
}
