package com.ghj.aireg

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * 영어 기사 제목을 한국어로 번역합니다 (구글 번역, API 키 불필요).
 * 한 번 번역한 제목은 저장해 두고 다시 요청하지 않습니다.
 * 번역에 실패하면 영어 제목을 그대로 보여 줍니다.
 */
object Translator {
    private const val PREFS = "translations"
    private const val MAX_CACHE = 1500
    private const val BATCH_CHARS = 3000

    /** 저장된 번역만 바로 붙입니다 (네트워크 없음). */
    suspend fun applyCached(ctx: Context, items: List<NewsItem>): List<NewsItem> = withContext(Dispatchers.IO) {
        val cache = loadCache(ctx)
        items.map { if (it.lang == "en" && it.titleKo == null) cache[it.id]?.let { ko -> it.copy(titleKo = ko) } ?: it else it }
    }

    /** 아직 번역되지 않은 영어 제목을 번역해서 붙입니다. */
    suspend fun translate(ctx: Context, items: List<NewsItem>): List<NewsItem> = withContext(Dispatchers.IO) {
        val cache = loadCache(ctx)
        val todo = items.filter { it.lang == "en" && it.titleKo == null && it.id !in cache }
            .distinctBy { it.id }

        if (todo.isNotEmpty()) {
            val batches = mutableListOf<MutableList<NewsItem>>()
            var len = 0
            for (item in todo) {
                if (batches.isEmpty() || len + item.title.length > BATCH_CHARS) {
                    batches += mutableListOf<NewsItem>(); len = 0
                }
                batches.last() += item
                len += item.title.length + 1
            }
            val gate = Semaphore(3)
            val results = coroutineScope {
                batches.map { batch -> async { gate.withPermit { translateBatch(batch) } } }.awaitAll()
            }
            results.forEach { cache.putAll(it) }
            saveCache(ctx, cache)
        }
        items.map { if (it.lang == "en" && it.titleKo == null) cache[it.id]?.let { ko -> it.copy(titleKo = ko) } ?: it else it }
    }

    /** 여러 제목을 줄바꿈으로 이어서 한 번에 번역하고, 줄 수가 안 맞으면 하나씩 다시 번역합니다. */
    private fun translateBatch(batch: List<NewsItem>): Map<String, String> {
        val out = mutableMapOf<String, String>()
        val joined = batch.joinToString("\n") { it.title.replace('\n', ' ') }
        val lines = runCatching { request(joined).split('\n').map { it.trim() } }.getOrNull()
        if (lines != null && lines.size == batch.size) {
            batch.forEachIndexed { i, item -> if (lines[i].isNotBlank()) out[item.id] = lines[i] }
        } else {
            for (item in batch) {
                runCatching { request(item.title).trim() }.getOrNull()
                    ?.takeIf { it.isNotBlank() }
                    ?.let { out[item.id] = it }
            }
        }
        return out
    }

    private fun request(text: String): String {
        val conn = URL("https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t")
            .openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.doOutput = true
        conn.connectTimeout = 15000
        conn.readTimeout = 20000
        conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8")
        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) AIRegRadar/1.0")
        try {
            conn.outputStream.use { it.write(("q=" + URLEncoder.encode(text, "UTF-8")).toByteArray()) }
            if (conn.responseCode !in 200..299) error("HTTP ${conn.responseCode}")
            val body = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            // 응답 형식: [[["번역문","원문",...], ...], ...]
            val segments = JSONArray(body).getJSONArray(0)
            val sb = StringBuilder()
            for (i in 0 until segments.length()) {
                val seg = segments.optJSONArray(i) ?: continue
                if (!seg.isNull(0)) sb.append(seg.getString(0))
            }
            return sb.toString()
        } finally {
            conn.disconnect()
        }
    }

    private fun loadCache(ctx: Context): LinkedHashMap<String, String> {
        val map = LinkedHashMap<String, String>()
        val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("map", null) ?: return map
        runCatching {
            val o = JSONObject(raw)
            o.keys().forEach { k -> map[k] = o.getString(k) }
        }
        return map
    }

    private fun saveCache(ctx: Context, map: LinkedHashMap<String, String>) {
        val keep = map.entries.toList().takeLast(MAX_CACHE)
        val o = JSONObject()
        keep.forEach { (k, v) -> o.put(k, v) }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("map", o.toString()).apply()
    }
}
