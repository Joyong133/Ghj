package com.ghj.aireg

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.card.MaterialCardView
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import com.google.android.material.progressindicator.LinearProgressIndicator
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private lateinit var adapter: NewsAdapter
    private lateinit var swipe: SwipeRefreshLayout
    private lateinit var recycler: RecyclerView
    private lateinit var tvEmpty: TextView
    private lateinit var card: MaterialCardView
    private lateinit var tvLevel: TextView
    private lateinit var tvScore: TextView
    private lateinit var gauge: LinearProgressIndicator
    private lateinit var tvDesc: TextView
    private lateinit var tvCounts: TextView
    private lateinit var tvUpdated: TextView

    private var all: List<NewsItem> = emptyList()
    private var updatedAt = 0L
    private var levelFilter: RiskLevel? = null
    private var langFilter: String? = null
    private var sortByRisk = false
    private var loadJob: Job? = null

    private val prefs by lazy { getSharedPreferences("settings", MODE_PRIVATE) }

    private val askNotify = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) setAlerts(true) else toast("알림 권한이 없어서 위험 알림을 켤 수 없어요")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        setSupportActionBar(findViewById<MaterialToolbar>(R.id.toolbar))

        swipe = findViewById(R.id.swipe)
        recycler = findViewById(R.id.recycler)
        tvEmpty = findViewById(R.id.tvEmpty)
        card = findViewById(R.id.cardGauge)
        tvLevel = findViewById(R.id.tvLevel)
        tvScore = findViewById(R.id.tvScore)
        gauge = findViewById(R.id.gauge)
        tvDesc = findViewById(R.id.tvDesc)
        tvCounts = findViewById(R.id.tvCounts)
        tvUpdated = findViewById(R.id.tvUpdated)

        adapter = NewsAdapter(onClick = ::open, onLongClick = ::share)
        recycler.layoutManager = LinearLayoutManager(this)
        recycler.adapter = adapter

        swipe.setColorSchemeResources(R.color.level_danger, R.color.level_warning, R.color.level_calm)
        swipe.setOnRefreshListener { refresh() }

        findViewById<ChipGroup>(R.id.chipsLevel).setOnCheckedStateChangeListener { _, ids ->
            levelFilter = when (ids.firstOrNull()) {
                R.id.chipDanger -> RiskLevel.DANGER
                R.id.chipWarning -> RiskLevel.WARNING
                R.id.chipWatch -> RiskLevel.WATCH
                R.id.chipCalm -> RiskLevel.CALM
                else -> null
            }
            render()
        }
        findViewById<ChipGroup>(R.id.chipsLang).setOnCheckedStateChangeListener { _, ids ->
            langFilter = when (ids.firstOrNull()) {
                R.id.chipKo -> "ko"
                R.id.chipEn -> "en"
                else -> null
            }
            render()
        }
        findViewById<Chip>(R.id.chipSort).setOnCheckedChangeListener { _, checked ->
            sortByRisk = checked
            render()
            recycler.scrollToPosition(0)
        }

        lifecycleScope.launch {
            val (cached, time) = NewsCache.load(this@MainActivity)
            if (cached.isNotEmpty() && all.isEmpty()) {
                all = cached
                updatedAt = time
                render()
            }
        }
        refresh()
    }

    private fun refresh() {
        if (loadJob?.isActive == true) return
        swipe.isRefreshing = true
        loadJob = lifecycleScope.launch {
            try {
                val items = NewsRepository.fetchAll()
                all = items
                updatedAt = System.currentTimeMillis()
                NewsCache.save(this@MainActivity, items)
                render()
            } catch (e: Exception) {
                if (all.isEmpty()) {
                    tvEmpty.text = "뉴스를 불러오지 못했어요.\n인터넷 연결을 확인하고 아래로 당겨 새로고침해 주세요.\n(${e.message ?: e.javaClass.simpleName})"
                    tvEmpty.visibility = View.VISIBLE
                } else {
                    toast("새로고침 실패 — 저장된 뉴스를 보여 드려요")
                }
            } finally {
                swipe.isRefreshing = false
            }
        }
    }

    private fun render() {
        // ── 상단 위험도 게이지 (전체 기사 기준) ──
        val overall = RiskScorer.overall(all)
        val level = RiskLevel.of(overall)
        val color = ContextCompat.getColor(this, level.colorRes)
        if (all.isEmpty()) {
            tvLevel.text = "불러오는 중…"
            tvScore.text = ""
            tvDesc.text = "AI 규제 뉴스를 모으고 있어요."
            gauge.setProgressCompat(0, false)
        } else {
            tvLevel.text = "${level.emoji} ${level.label}"
            tvLevel.setTextColor(color)
            tvScore.text = "$overall / 100"
            tvDesc.text = level.desc
            gauge.setIndicatorColor(color)
            gauge.setProgressCompat(overall, true)
        }
        card.strokeColor = color
        val counts = RiskLevel.values().reversed().joinToString("  ·  ") { lv ->
            "${lv.emoji} ${lv.label} ${all.count { it.risk.level == lv }}"
        }
        tvCounts.text = counts
        tvUpdated.text = if (updatedAt == 0L) "" else
            "업데이트 ${SimpleDateFormat("M/d HH:mm", Locale.KOREA).format(Date(updatedAt))} · 기사 ${all.size}건 · 최근 3일 상위 5건 평균"

        // ── 목록 ──
        var list = all.asSequence()
        levelFilter?.let { lv -> list = list.filter { it.risk.level == lv } }
        langFilter?.let { lg -> list = list.filter { it.lang == lg } }
        val shown = if (sortByRisk) list.sortedWith(compareByDescending<NewsItem> { it.risk.score }.thenByDescending { it.published }).toList()
        else list.toList()
        adapter.submitList(shown)

        tvEmpty.visibility = if (shown.isEmpty() && all.isNotEmpty()) View.VISIBLE else View.GONE
        if (shown.isEmpty() && all.isNotEmpty()) tvEmpty.text = "이 조건에 맞는 뉴스가 없어요."
        if (all.isEmpty() && !swipe.isRefreshing) tvEmpty.visibility = View.VISIBLE
    }

    private fun open(item: NewsItem) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(item.link)))
        } catch (e: ActivityNotFoundException) {
            toast("기사를 열 수 있는 브라우저가 없어요")
        }
    }

    private fun share(item: NewsItem) {
        val text = "[${item.risk.level.label} ${item.risk.score}점] ${item.title}\n${item.link}"
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
        }, "뉴스 공유"))
    }

    // ── 메뉴 ──
    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main, menu)
        menu.findItem(R.id.action_alerts).isChecked = prefs.getBoolean("alerts", false)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean = when (item.itemId) {
        R.id.action_refresh -> { refresh(); true }
        R.id.action_alerts -> {
            val enable = !item.isChecked
            if (enable && Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) {
                askNotify.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                setAlerts(enable)
            }
            true
        }
        R.id.action_criteria -> { showCriteria(); true }
        else -> super.onOptionsItemSelected(item)
    }

    private fun setAlerts(on: Boolean) {
        prefs.edit().putBoolean("alerts", on).apply()
        if (on) {
            AlertWorker.markSeen(this, all) // 이미 보고 있는 기사로는 알림을 보내지 않아요
            AlertWorker.schedule(this)
            toast("🔴 위험 등급 뉴스가 새로 나오면 알려 드릴게요 (3시간마다 확인)")
        } else {
            AlertWorker.cancel(this)
            toast("위험 알림을 껐어요")
        }
        invalidateOptionsMenu()
    }

    private fun showCriteria() {
        val msg = """
            규제를 싫어하는 입장에서, 규제가 셀수록 점수가 올라가요.
            모든 기사는 기본 25점에서 시작해요.

            🔴 위험 (75점 이상)
            금지·벌금·과징금·본격 시행·법 통과·제재 같은 강한 규제

            🟠 경고 (55~74점)
            의무화·규제 강화·조사·소송 등 규제가 구체화되는 중

            🟡 주의 (35~54점)
            법안 발의·감독 논의 등 아직 논의 단계

            🟢 평상시 (35점 미만)
            일반 소식이거나 규제 완화·유예·폐지·자율 규제 같은 반가운 소식

            ▲ 표시는 점수를 올린 표현, ▼ 표시는 점수를 내린 표현이에요.
            상단 위험도는 최근 3일 기사 중 점수 상위 5건의 평균이에요.

            ※ 제목과 요약의 단어로 자동 판단하므로 실제 기사 내용과 다를 수 있어요.
        """.trimIndent()
        AlertDialog.Builder(this)
            .setTitle("위험도 기준")
            .setMessage(msg)
            .setPositiveButton("확인", null)
            .show()
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()
}
