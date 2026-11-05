package com.ghj.aireg

import android.content.res.ColorStateList
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView

class NewsAdapter(
    private val onClick: (NewsItem) -> Unit,
    private val onLongClick: (NewsItem) -> Unit,
) : ListAdapter<NewsItem, NewsAdapter.Holder>(Diff) {

    class Holder(v: View) : RecyclerView.ViewHolder(v) {
        val bar: View = v.findViewById(R.id.levelBar)
        val badge: TextView = v.findViewById(R.id.tvBadge)
        val score: TextView = v.findViewById(R.id.tvItemScore)
        val region: TextView = v.findViewById(R.id.tvRegion)
        val title: TextView = v.findViewById(R.id.tvTitle)
        val meta: TextView = v.findViewById(R.id.tvMeta)
        val reasons: TextView = v.findViewById(R.id.tvReasons)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder =
        Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_news, parent, false))

    override fun onBindViewHolder(h: Holder, position: Int) {
        val item = getItem(position)
        val ctx = h.itemView.context
        val level = item.risk.level
        val color = ContextCompat.getColor(ctx, level.colorRes)

        h.bar.setBackgroundColor(color)
        h.badge.text = "${level.emoji} ${level.label}"
        h.badge.backgroundTintList = ColorStateList.valueOf(color)
        h.score.text = "${item.risk.score}점"
        h.score.setTextColor(color)

        val region = item.risk.region
        h.region.visibility = if (region == null) View.GONE else View.VISIBLE
        h.region.text = region ?: ""

        h.title.text = item.title
        h.meta.text = "${item.source} · ${TimeText.ago(item.published)}"
        h.reasons.text = if (item.risk.reasons.isEmpty()) "특별한 규제 신호 없음"
        else item.risk.reasons.joinToString("  ")

        h.itemView.setOnClickListener { onClick(item) }
        h.itemView.setOnLongClickListener { onLongClick(item); true }
    }

    private object Diff : DiffUtil.ItemCallback<NewsItem>() {
        override fun areItemsTheSame(a: NewsItem, b: NewsItem) = a.id == b.id
        override fun areContentsTheSame(a: NewsItem, b: NewsItem) = a == b
    }
}

object TimeText {
    fun ago(t: Long, now: Long = System.currentTimeMillis()): String {
        val m = ((now - t) / 60000).coerceAtLeast(0)
        return when {
            m < 1 -> "방금"
            m < 60 -> "${m}분 전"
            m < 60 * 24 -> "${m / 60}시간 전"
            m < 60 * 24 * 30 -> "${m / (60 * 24)}일 전"
            else -> "${m / (60 * 24 * 30)}달 전"
        }
    }
}
