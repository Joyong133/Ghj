package com.focustodo.app

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Paint
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.BaseAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import android.widget.Toast
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : Activity() {

    companion object {
        const val EXTRA_BLOCKED = "blocked_package"
        private val DURATIONS = intArrayOf(15, 25, 30, 45, 60, 90, 120, 180)
    }

    private lateinit var store: FocusStore
    private lateinit var todos: MutableList<Todo>
    private val adapter = TodoAdapter()
    private val handler = Handler(Looper.getMainLooper())
    private var lastFocusState: Boolean? = null

    private lateinit var statusCard: LinearLayout
    private lateinit var statusTitle: TextView
    private lateinit var statusSub: TextView
    private lateinit var btnFocusNow: Button
    private lateinit var permCard: View
    private lateinit var quickScroll: HorizontalScrollView
    private lateinit var quickRow: LinearLayout
    private lateinit var progressText: TextView
    private lateinit var emptyText: TextView
    private lateinit var btnSchedule: Button
    private lateinit var btnAllowed: Button

    private val ticker = object : Runnable {
        override fun run() {
            refreshStatus()
            handler.postDelayed(this, 1000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        store = FocusStore(this)
        todos = store.todos()

        statusCard = findViewById(R.id.statusCard)
        statusTitle = findViewById(R.id.statusTitle)
        statusSub = findViewById(R.id.statusSub)
        btnFocusNow = findViewById(R.id.btnFocusNow)
        permCard = findViewById(R.id.permCard)
        quickScroll = findViewById(R.id.quickScroll)
        quickRow = findViewById(R.id.quickRow)
        progressText = findViewById(R.id.progressText)
        emptyText = findViewById(R.id.emptyText)
        btnSchedule = findViewById(R.id.btnSchedule)
        btnAllowed = findViewById(R.id.btnAllowed)

        findViewById<ListView>(R.id.todoList).adapter = adapter

        val input = findViewById<EditText>(R.id.inputTodo)
        val add = {
            val text = input.text.toString().trim()
            if (text.isNotEmpty()) {
                todos.add(0, Todo(System.currentTimeMillis(), text, false))
                saveTodos()
                input.setText("")
            }
        }
        findViewById<Button>(R.id.btnAdd).setOnClickListener { add() }
        input.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) { add(); true } else false
        }

        btnFocusNow.setOnClickListener { askManualFocus() }
        findViewById<Button>(R.id.btnEnable).setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }
        btnSchedule.setOnClickListener { startActivity(Intent(this, ScheduleActivity::class.java)) }
        btnAllowed.setOnClickListener { startActivity(Intent(this, AllowedAppsActivity::class.java)) }

        handleBlocked(intent)
        refreshTodos()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleBlocked(intent)
    }

    override fun onResume() {
        super.onResume()
        permCard.visibility = if (FocusPolicy.isServiceEnabled(this)) View.GONE else View.VISIBLE
        lastFocusState = null
        handler.post(ticker)
    }

    override fun onPause() {
        handler.removeCallbacks(ticker)
        super.onPause()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (store.isFocusActive()) {
            Toast.makeText(this, "집중 시간이에요. 끝날 때까지 나갈 수 없어요 💪", Toast.LENGTH_SHORT).show()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    private fun handleBlocked(intent: Intent?) {
        val pkg = intent?.getStringExtra(EXTRA_BLOCKED) ?: return
        intent.removeExtra(EXTRA_BLOCKED)
        val label = try {
            packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
        } catch (_: Exception) {
            "그 앱"
        }
        Toast.makeText(this, "🔒 집중 시간에는 '$label'을(를) 쓸 수 없어요", Toast.LENGTH_SHORT).show()
    }

    // ---------------- 상태 표시 ----------------

    private fun refreshStatus() {
        val now = System.currentTimeMillis()
        val until = store.activeUntil(now)
        val active = until != null
        val timeFmt = SimpleDateFormat("HH:mm", Locale.KOREA)

        if (active) {
            val left = (until!! - now) / 1000
            statusTitle.text = "🎯 집중 중 · %d:%02d:%02d 남음".format(left / 3600, (left % 3600) / 60, left % 60)
            statusSub.text = "${timeFmt.format(Date(until))}까지 이 앱과 허용된 앱만 쓸 수 있어요."
            btnFocusNow.text = "집중 시간 연장하기"
        } else {
            statusTitle.text = "😌 자유 시간"
            val next = store.nextStart(now)
            statusSub.text = if (next != null) {
                "다음 집중: " + SimpleDateFormat("M/d(E) HH:mm", Locale.KOREA).format(Date(next))
            } else {
                "등록된 집중 시간이 없어요. ⏰ 집중 시간표에서 추가하세요."
            }
            btnFocusNow.text = "지금 바로 집중 시작"
        }

        if (lastFocusState != active) {
            lastFocusState = active
            statusCard.setBackgroundResource(if (active) R.drawable.focus_card_bg else R.drawable.card_bg)
            statusTitle.setTextColor(getColor(if (active) android.R.color.white else R.color.text))
            statusSub.setTextColor(if (active) 0xFFC7D2FE.toInt() else getColor(R.color.text_sub))
            btnSchedule.text = if (active) "🔒 집중 시간표" else "⏰ 집중 시간표"
            btnAllowed.text = if (active) "🔒 허용 앱" else "✅ 허용 앱"
            quickScroll.visibility = if (active) View.VISIBLE else View.GONE
            if (active) buildQuickLaunch()
        }
    }

    /** 집중 중에는 홈 화면을 못 쓰므로, 허용된 앱을 여기서 바로 열 수 있게 한다 */
    private fun buildQuickLaunch() {
        quickRow.removeAllViews()
        fun addButton(label: String, intentProvider: () -> Intent?) {
            val b = Button(this)
            b.text = label
            b.isAllCaps = false
            b.setOnClickListener {
                val i = intentProvider()
                try {
                    if (i == null) throw IllegalStateException()
                    startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } catch (_: Exception) {
                    Toast.makeText(this, "앱을 열 수 없어요", Toast.LENGTH_SHORT).show()
                }
            }
            quickRow.addView(b)
        }
        addButton("📞 전화") { Intent(Intent.ACTION_DIAL) }
        addButton("💬 문자") {
            FocusPolicy.smsPackage(this)?.let { packageManager.getLaunchIntentForPackage(it) }
                ?: Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_MESSAGING)
        }
        addButton("👤 연락처") {
            Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_CONTACTS)
        }
        val core = FocusPolicy.coreApps(this)
        for (pkg in store.extraAllowed() - core) {
            val launch = packageManager.getLaunchIntentForPackage(pkg) ?: continue
            val label = try {
                packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
            } catch (_: Exception) {
                continue
            }
            addButton(label) { launch }
        }
    }

    // ---------------- 즉시 집중 ----------------

    private fun askManualFocus() {
        if (!FocusPolicy.isServiceEnabled(this)) {
            Toast.makeText(this, "먼저 접근성에서 '집중 투두'를 켜 주세요", Toast.LENGTH_LONG).show()
            return
        }
        val labels = DURATIONS.map { if (it < 60) "${it}분" else if (it % 60 == 0) "${it / 60}시간" else "${it / 60}시간 ${it % 60}분" }
        AlertDialog.Builder(this)
            .setTitle(if (store.isFocusActive()) "얼마나 더 집중할까요?" else "얼마나 집중할까요?")
            .setItems(labels.toTypedArray()) { _, which ->
                val minutes = DURATIONS[which]
                AlertDialog.Builder(this)
                    .setTitle("${labels[which]} 집중 시작")
                    .setMessage("시작하면 끝날 때까지 중간에 멈출 수 없어요.\n전화·문자·허용한 앱만 쓸 수 있어요.")
                    .setPositiveButton("시작") { _, _ ->
                        val now = System.currentTimeMillis()
                        val base = maxOf(now, store.activeUntil(now) ?: now)
                        store.manualUntil = maxOf(store.manualUntil, base + minutes * 60_000L)
                        lastFocusState = null
                        refreshStatus()
                    }
                    .setNegativeButton("취소", null)
                    .show()
            }
            .show()
    }

    // ---------------- 할 일 ----------------

    private fun saveTodos() {
        store.saveTodos(todos)
        refreshTodos()
    }

    private fun refreshTodos() {
        adapter.notifyDataSetChanged()
        val done = todos.count { it.done }
        progressText.text = if (todos.isEmpty()) "" else "완료 $done / ${todos.size}" +
            if (done == todos.size) "  🎉 모두 끝!" else ""
        emptyText.visibility = if (todos.isEmpty()) View.VISIBLE else View.GONE
    }

    private inner class TodoAdapter : BaseAdapter() {
        override fun getCount() = todos.size
        override fun getItem(position: Int) = todos[position]
        override fun getItemId(position: Int) = todos[position].id

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val v = convertView ?: layoutInflater.inflate(R.layout.item_todo, parent, false)
            val t = todos[position]
            val check = v.findViewById<CheckBox>(R.id.todoCheck)
            val text = v.findViewById<TextView>(R.id.todoText)

            check.setOnCheckedChangeListener(null)
            check.isChecked = t.done
            text.text = t.text
            text.paintFlags = if (t.done) text.paintFlags or Paint.STRIKE_THRU_TEXT_FLAG
            else text.paintFlags and Paint.STRIKE_THRU_TEXT_FLAG.inv()
            text.alpha = if (t.done) 0.45f else 1f

            check.setOnCheckedChangeListener { _, isChecked ->
                t.done = isChecked
                // 완료한 항목은 아래로
                todos.remove(t)
                if (isChecked) todos.add(t) else todos.add(0, t)
                saveTodos()
            }
            v.findViewById<ImageButton>(R.id.todoDelete).setOnClickListener {
                todos.remove(t)
                saveTodos()
            }
            return v
        }
    }
}
