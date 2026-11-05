package com.ghj.aireg

import android.content.Context
import android.text.Html
import android.util.Xml
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import org.xmlpull.v1.XmlPullParser
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Locale

data class NewsItem(
    val id: String,
    val title: String,
    val link: String,
    val source: String,
    val published: Long,
    val summary: String,
    val lang: String, // "ko" 또는 "en"
    val titleKo: String? = null, // 영어 기사의 한국어 번역 제목
) {
    // 점수는 원문 제목으로 매깁니다 (영어 키워드 규칙이 원문 기준이라서)
    val risk: RiskResult = RiskScorer.score(title, summary)

    /** 화면에 보여 줄 제목: 번역이 있으면 한국어, 없으면 원문 */
    val displayTitle: String get() = titleKo ?: title
}

object NewsRepository {
    private data class Feed(val url: String, val lang: String)

    private fun google(q: String, ko: Boolean): Feed {
        val query = URLEncoder.encode("$q when:14d", "UTF-8")
        val loc = if (ko) "&hl=ko&gl=KR&ceid=KR:ko" else "&hl=en-US&gl=US&ceid=US:en"
        return Feed("https://news.google.com/rss/search?q=$query$loc", if (ko) "ko" else "en")
    }

    private fun bing(q: String, ko: Boolean): Feed {
        val query = URLEncoder.encode(q, "UTF-8")
        val mkt = if (ko) "ko-KR" else "en-US"
        return Feed("https://www.bing.com/news/search?format=rss&q=$query&mkt=$mkt", if (ko) "ko" else "en")
    }

    private val feeds = listOf(
        google("AI 규제", true),
        google("인공지능 기본법", true),
        google("AI 법안 OR AI법 시행", true),
        google("AI 과징금 OR AI 금지", true),
        bing("AI 규제", true),
        google("AI regulation", false),
        google("\"AI Act\"", false),
        google("AI law OR AI bill", false),
        google("AI ban OR AI fine", false),
        bing("AI regulation", false),
    )

    private const val MAX_AGE_MS = 30L * 24 * 3600 * 1000

    /** 모든 피드를 동시에 받아서 중복을 없애고 최신순으로 돌려줍니다. */
    suspend fun fetchAll(): List<NewsItem> = coroutineScope {
        val results = feeds.map { feed ->
            async(Dispatchers.IO) { runCatching { fetch(feed) } }
        }.awaitAll()

        val items = results.mapNotNull { it.getOrNull() }.flatten()
        if (items.isEmpty()) {
            throw results.firstNotNullOfOrNull { it.exceptionOrNull() }
                ?: IllegalStateException("뉴스를 찾지 못했어요")
        }
        val now = System.currentTimeMillis()
        items.filter { now - it.published <= MAX_AGE_MS && RiskScorer.isAiRelated(it.title + " " + it.summary) }
            .distinctBy { it.id }
            .sortedByDescending { it.published }
            .take(300)
    }

    private fun fetch(feed: Feed): List<NewsItem> {
        val conn = URL(feed.url).openConnection() as HttpURLConnection
        conn.connectTimeout = 15000
        conn.readTimeout = 15000
        conn.instanceFollowRedirects = true
        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) AIRegRadar/1.0")
        conn.setRequestProperty("Accept", "application/rss+xml, application/xml, text/xml")
        try {
            if (conn.responseCode !in 200..299) error("HTTP ${conn.responseCode}")
            return conn.inputStream.use { parse(it, feed.lang) }
        } finally {
            conn.disconnect()
        }
    }

    private fun parse(stream: InputStream, lang: String): List<NewsItem> {
        val parser = Xml.newPullParser()
        parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
        parser.setInput(stream, null)

        val out = mutableListOf<NewsItem>()
        var inItem = false
        var title = ""; var link = ""; var date = ""; var desc = ""; var source = ""

        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            if (event == XmlPullParser.START_TAG) {
                val name = parser.name
                if (name == "item") {
                    inItem = true
                    title = ""; link = ""; date = ""; desc = ""; source = ""
                } else if (inItem) {
                    when (name) {
                        "title" -> title = parser.nextText().trim()
                        "link" -> link = parser.nextText().trim()
                        "pubDate" -> date = parser.nextText().trim()
                        "description" -> desc = parser.nextText()
                        "source", "News:Source" -> source = parser.nextText().trim()
                    }
                }
            } else if (event == XmlPullParser.END_TAG && parser.name == "item") {
                inItem = false
                build(title, link, date, desc, source, lang)?.let { out += it }
            }
            event = parser.next()
        }
        return out
    }

    private fun build(rawTitle: String, link: String, date: String, desc: String, rawSource: String, lang: String): NewsItem? {
        if (rawTitle.isBlank() || link.isBlank()) return null
        var title = rawTitle
        var source = rawSource
        // 구글 뉴스 제목은 "제목 - 언론사" 형태라서 언론사 부분을 떼어냅니다.
        val dash = title.lastIndexOf(" - ")
        if (dash > 0) {
            val tail = title.substring(dash + 3).trim()
            if (source.isBlank() || tail == source) {
                if (source.isBlank()) source = tail
                title = title.substring(0, dash).trim()
            }
        }
        var summary = cleanHtml(desc)
        if (summary.startsWith(title)) summary = "" // 구글 뉴스 요약은 제목 반복이라 버립니다
        return NewsItem(
            id = keyOf(title),
            title = title,
            link = link,
            source = source.ifBlank { "알 수 없음" },
            published = parseDate(date),
            summary = summary.take(300),
            lang = lang,
        )
    }

    private fun cleanHtml(s: String): String =
        Html.fromHtml(s, Html.FROM_HTML_MODE_LEGACY).toString()
            .replace('￼', ' ')
            .replace(Regex("\\s+"), " ")
            .trim()

    /** 같은 기사가 여러 피드에 나와도 한 번만 보이도록 제목으로 키를 만듭니다. */
    private fun keyOf(title: String): String =
        title.lowercase().replace(Regex("[^\\p{L}\\p{N}]"), "").take(40)

    private fun parseDate(s: String): Long {
        val patterns = listOf("EEE, dd MMM yyyy HH:mm:ss zzz", "EEE, dd MMM yyyy HH:mm:ss Z", "EEE, d MMM yyyy HH:mm:ss zzz")
        for (p in patterns) {
            try {
                val d = SimpleDateFormat(p, Locale.US).parse(s)
                if (d != null) return d.time
            } catch (_: Exception) {
            }
        }
        return System.currentTimeMillis()
    }
}

/** 마지막으로 받은 뉴스를 저장해 두었다가 앱을 열 때 바로 보여 줍니다. */
object NewsCache {
    private const val PREFS = "news_cache"

    suspend fun save(ctx: Context, items: List<NewsItem>) = withContext(Dispatchers.IO) {
        val arr = JSONArray()
        for (it in items) {
            arr.put(JSONObject().apply {
                put("id", it.id); put("title", it.title); put("link", it.link); put("source", it.source)
                put("published", it.published); put("summary", it.summary); put("lang", it.lang)
                if (it.titleKo != null) put("titleKo", it.titleKo)
            })
        }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("items", arr.toString())
            .putLong("updated", System.currentTimeMillis())
            .apply()
    }

    suspend fun load(ctx: Context): Pair<List<NewsItem>, Long> = withContext(Dispatchers.IO) {
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val raw = prefs.getString("items", null) ?: return@withContext emptyList<NewsItem>() to 0L
        val list = runCatching {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                NewsItem(
                    o.getString("id"), o.getString("title"), o.getString("link"), o.getString("source"),
                    o.getLong("published"), o.optString("summary"), o.optString("lang", "ko"),
                    if (o.has("titleKo")) o.getString("titleKo") else null,
                )
            }
        }.getOrDefault(emptyList())
        list to prefs.getLong("updated", 0L)
    }
}
