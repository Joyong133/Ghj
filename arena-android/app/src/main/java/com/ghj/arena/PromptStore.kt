package com.ghj.arena

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class Prompt(val id: String, val title: String, val text: String) {
    /** 제목이 비어 있으면 내용의 첫 줄을 제목으로 보여 줌 */
    val displayTitle: String
        get() = title.ifBlank {
            text.lineSequence().firstOrNull { it.isNotBlank() }?.trim()?.take(60) ?: "(빈 프롬프트)"
        }
}

/** 저장한 프롬프트를 휴대폰 안(SharedPreferences)에 보관 */
class PromptStore(context: Context) {

    private val prefs = context.getSharedPreferences("prompts", Context.MODE_PRIVATE)

    fun all(): MutableList<Prompt> {
        val raw = prefs.getString(KEY, null) ?: return seed()
        return try {
            val arr = JSONArray(raw)
            MutableList(arr.length()) { i ->
                val o = arr.getJSONObject(i)
                Prompt(o.getString("id"), o.optString("title"), o.optString("text"))
            }
        } catch (e: Exception) {
            mutableListOf()
        }
    }

    fun save(list: List<Prompt>) {
        val arr = JSONArray()
        list.forEach {
            arr.put(JSONObject().put("id", it.id).put("title", it.title).put("text", it.text))
        }
        prefs.edit().putString(KEY, arr.toString()).apply()
    }

    /** 새 프롬프트는 맨 위에, 수정한 프롬프트는 제자리에 저장 */
    fun upsert(id: String?, title: String, text: String) {
        val list = all()
        val index = list.indexOfFirst { it.id == id }
        if (index >= 0) {
            list[index] = list[index].copy(title = title, text = text)
        } else {
            list.add(0, Prompt(UUID.randomUUID().toString(), title, text))
        }
        save(list)
    }

    fun delete(id: String) = save(all().filterNot { it.id == id })

    fun moveToTop(id: String) {
        val list = all()
        val item = list.firstOrNull { it.id == id } ?: return
        list.remove(item)
        list.add(0, item)
        save(list)
    }

    /** 처음 실행할 때 예시 프롬프트 몇 개를 넣어 둠 (지워도 됨) */
    private fun seed(): MutableList<Prompt> {
        val list = mutableListOf(
            Prompt(UUID.randomUUID().toString(), "한국어로 간결하게",
                "앞으로 모든 답변은 한국어로, 핵심부터 간결하게 써 줘."),
            Prompt(UUID.randomUUID().toString(), "쉽게 설명해 줘",
                "다음 내용을 중학생도 이해할 수 있게 예시를 들어 쉽게 설명해 줘:\n"),
            Prompt(UUID.randomUUID().toString(), "3줄 요약",
                "다음 글을 핵심만 3줄로 요약해 줘. 중요한 숫자와 이름은 빠뜨리지 마:\n"),
            Prompt(UUID.randomUUID().toString(), "코드 검토",
                "아래 코드에서 버그와 고칠 점을 찾아서, 고친 코드와 함께 설명해 줘:\n"),
        )
        save(list)
        return list
    }

    companion object {
        private const val KEY = "list"
    }
}
