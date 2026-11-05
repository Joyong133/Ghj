package com.ghj.aireg

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/** 3시간마다 뉴스를 확인해서 새 "위험" 등급 기사가 있으면 알림을 보냅니다. */
class AlertWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val fetched = try {
            NewsRepository.fetchAll()
        } catch (e: Exception) {
            return Result.retry()
        }
        val items = runCatching { Translator.translate(applicationContext, fetched) }.getOrDefault(fetched)
        NewsCache.save(applicationContext, items)

        val seen = seenIds(applicationContext)
        val now = System.currentTimeMillis()
        val fresh = items.filter {
            it.risk.level == RiskLevel.DANGER && it.id !in seen && now - it.published < 2L * 24 * 3600 * 1000
        }
        if (fresh.isNotEmpty()) notify(applicationContext, fresh)
        markSeen(applicationContext, items)
        return Result.success()
    }

    companion object {
        private const val WORK = "danger_alerts"
        private const val CHANNEL = "danger"

        fun schedule(ctx: Context) {
            val req = PeriodicWorkRequestBuilder<AlertWorker>(3, TimeUnit.HOURS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, req)
        }

        fun cancel(ctx: Context) = WorkManager.getInstance(ctx).cancelUniqueWork(WORK)

        private fun seenIds(ctx: Context): Set<String> =
            ctx.getSharedPreferences("alerts", Context.MODE_PRIVATE).getStringSet("seen", emptySet()) ?: emptySet()

        fun markSeen(ctx: Context, items: List<NewsItem>) {
            val ids = (seenIds(ctx) + items.filter { it.risk.level == RiskLevel.DANGER }.map { it.id }).toList().takeLast(500)
            ctx.getSharedPreferences("alerts", Context.MODE_PRIVATE).edit().putStringSet("seen", HashSet(ids)).apply()
        }

        private fun notify(ctx: Context, fresh: List<NewsItem>) {
            if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) return

            if (Build.VERSION.SDK_INT >= 26) {
                val ch = NotificationChannel(CHANNEL, "위험 등급 규제 뉴스", NotificationManager.IMPORTANCE_HIGH)
                ch.description = "강한 AI 규제 소식이 새로 나오면 알려 드려요"
                ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
            }
            val pi = PendingIntent.getActivity(
                ctx, 0,
                Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val top = fresh.maxBy { it.risk.score }
            val style = NotificationCompat.InboxStyle()
            fresh.take(5).forEach { style.addLine("${it.risk.score}점 · ${it.displayTitle}") }
            val n = NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_alert)
                .setContentTitle("🔴 위험 등급 AI 규제 뉴스 ${fresh.size}건")
                .setContentText(top.displayTitle)
                .setStyle(style)
                .setColor(ContextCompat.getColor(ctx, R.color.level_danger))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build()
            NotificationManagerCompat.from(ctx).notify(1, n)
        }
    }
}
