package com.ghj.aireg

/**
 * 기사 제목·요약에 나오는 표현으로 "규제가 얼마나 센가"를 0~100점으로 매깁니다.
 * 규제를 싫어하는 입장 기준이라, 금지·벌금·시행처럼 강한 규제일수록 점수가 올라가고
 * 완화·유예·폐지 같은 소식은 점수를 내립니다.
 */
enum class RiskLevel(val label: String, val emoji: String, val min: Int, val colorRes: Int, val desc: String) {
    CALM("평상시", "🟢", 0, R.color.level_calm, "평상시 수준이에요. 크게 신경 쓸 규제 움직임은 없어요."),
    WATCH("주의", "🟡", 35, R.color.level_watch, "규제 논의가 오가는 중이에요. 흐름만 지켜보면 돼요."),
    WARNING("경고", "🟠", 55, R.color.level_warning, "규제가 구체화되고 있어요. 영향이 생길 수 있어요."),
    DANGER("위험", "🔴", 75, R.color.level_danger, "금지·벌금·시행 같은 강한 규제가 감지됐어요!");

    companion object {
        fun of(score: Int): RiskLevel = values().last { score >= it.min }
    }
}

data class RiskResult(val score: Int, val reasons: List<String>, val region: String?) {
    val level: RiskLevel get() = RiskLevel.of(score)
}

object RiskScorer {
    private const val BASE = 25

    private class Rule(val label: String, val weight: Int, ko: List<String>, en: List<String>) {
        val regex: Regex = run {
            val parts = mutableListOf<String>()
            if (ko.isNotEmpty()) parts += ko.joinToString("|") { Regex.escape(it) }
            // 영어 단어는 앞뒤가 알파벳이 아닐 때만 매칭 (예: "ban"이 "urban"에 걸리지 않게)
            if (en.isNotEmpty()) parts += "(?<![A-Za-z])(?:" + en.joinToString("|") + ")(?![A-Za-z])"
            Regex(parts.joinToString("|"), RegexOption.IGNORE_CASE)
        }
    }

    private val rules = listOf(
        // ── 강한 규제 (+) ──
        Rule("금지", 30,
            listOf("금지", "사용 중단 명령", "퇴출"),
            listOf("ban", "bans", "banned", "banning", "prohibit", "prohibits", "prohibited", "prohibition", "outlaws?", "outlawed")),
        Rule("벌금·과징금", 30,
            listOf("벌금", "과징금", "과태료", "형사처벌", "처벌", "징역"),
            listOf("fined", "fines", "fine of", "penalty", "penalties", "criminal charges?", "jail")),
        Rule("본격 시행", 22,
            listOf("본격 시행", "전면 시행", "시행 돌입", "시행에 들어", "시행된다", "효력 발생", "발효"),
            listOf("takes? effect", "took effect", "comes? into force", "came into force", "enters? into force",
                "in force", "enforcement begins", "goes into effect", "went into effect")),
        Rule("법 통과", 22,
            listOf("통과", "가결", "공포", "제정"),
            listOf("passed", "passes", "signed into law", "signs? (?:the )?(?:bill|law)", "enacted", "enacts")),
        Rule("제재·단속", 20,
            listOf("제재", "단속", "시정명령", "철퇴", "규제 폭탄"),
            listOf("sanctions?", "sanctioned", "crackdown", "cracks? down", "enforcement action")),
        Rule("의무화", 18,
            listOf("의무화", "의무 부과", "강제"),
            listOf("mandatory", "mandates?", "mandated", "must comply", "required to")),
        Rule("조사·소송", 15,
            listOf("조사 착수", "조사에 착수", "압수수색", "소송", "고발", "수사"),
            listOf("investigation", "investigates", "investigating", "probes?", "lawsuits?", "sued", "sues", "antitrust")),
        // ── 중간 (+) ──
        Rule("규제 강화", 15,
            listOf("규제 강화", "규제강화", "처벌 강화", "감독 강화", "엄격", "고삐"),
            listOf("tighten", "tightens", "tightening", "stricter", "strict rules", "tougher")),
        Rule("법안·입법", 10,
            listOf("법안", "입법", "발의", "개정안", "시행령", "기본법", "규제법"),
            listOf("bills?", "legislation", "legislative", "lawmakers", "AI Act", "draft law", "proposed rules?")),
        Rule("감독·인허가", 10,
            listOf("감독", "감시", "인허가", "허가제", "신고제", "등록제", "감사"),
            listOf("oversight", "audits?", "licensing", "watchdog", "regulators?")),
        Rule("책임·의무 규정", 10,
            listOf("고영향", "고위험", "책임", "표시 의무", "워터마크", "투명성 의무", "저작권"),
            listOf("liability", "high-risk", "transparency requirements?", "disclosure", "watermark", "watermarking", "copyright")),
        // ── 규제 완화 (−) ──
        Rule("폐지·철회", -25,
            listOf("폐지", "철회", "백지화", "폐기"),
            listOf("repeal", "repeals", "repealed", "revoke", "revokes", "revoked", "rescind", "rescinds", "rescinded",
                "scrap", "scraps", "scrapped", "withdraws?", "withdrawn")),
        Rule("규제 완화", -22,
            listOf("완화", "규제 개선", "규제 혁신", "규제 해소", "규제 풀", "네거티브 규제"),
            listOf("deregulation", "deregulate", "deregulatory", "loosen", "loosens", "eases? rules", "light-touch",
                "rolls? back", "rolled back", "rollback")),
        Rule("유예·연기", -20,
            listOf("유예", "연기", "보류", "늦춰"),
            listOf("delay", "delays", "delayed", "postpone", "postpones", "postponed", "pause", "pauses", "paused",
                "grace period", "stop the clock")),
        Rule("무산·부결", -20,
            listOf("무산", "부결", "거부권", "위헌"),
            listOf("veto", "vetoes", "vetoed", "rejected", "rejects", "struck down", "strikes down", "preempts?", "preemption")),
        Rule("면제·간소화", -15,
            listOf("면제", "간소화", "예외"),
            listOf("exempt", "exempts", "exemptions?", "simplify", "simplifies", "simplification", "omnibus", "streamline")),
        Rule("자율·가이드라인", -10,
            listOf("자율", "가이드라인", "권고", "지침"),
            listOf("voluntary", "guidelines?", "guidance", "code of practice", "self-regulation")),
        Rule("진흥·지원", -10,
            listOf("진흥", "육성", "지원", "샌드박스", "활성화"),
            listOf("innovation", "pro-innovation", "sandbox", "investment", "boost")),
    )

    private class Region(val name: String, val regex: Regex)

    private fun region(name: String, ko: String, en: String, caseSensitiveEn: String? = null): Region {
        val p = buildString {
            append(ko)
            append("|(?i:(?<![A-Za-z])(?:").append(en).append(")(?![A-Za-z]))")
            if (caseSensitiveEn != null) append("|(?<![A-Za-z])(?:").append(caseSensitiveEn).append(")(?![A-Za-z])")
        }
        return Region(name, Regex(p))
    }

    private val regions = listOf(
        region("🇰🇷 한국", "한국|국내|국회|대한민국|과기정통부|과기부|방통위|개인정보위|공정위|AI 기본법|AI기본법|인공지능 기본법|인공지능기본법", "Korea|Korean|Seoul"),
        region("🇪🇺 EU", "EU|유럽|이탈리아|프랑스|독일|네덜란드|스페인", "European|Europe|Brussels|Italy|Italian|France|French|Germany|German|Dutch|Spain|Spanish", "EU"),
        region("🇺🇸 미국", "미국|트럼프|백악관|캘리포니아|뉴욕주|연방", "America|American|federal|White House|Trump|Congress|California|Colorado|Texas|New York", "US|U\\.S\\."),
        region("🇨🇳 중국", "중국", "China|Chinese|Beijing"),
        region("🇬🇧 영국", "영국", "Britain|British", "UK|U\\.K\\."),
        region("🇯🇵 일본", "일본", "Japan|Japanese"),
    )

    /** 이 표현이 하나도 없으면 AI 관련 기사가 아니라고 보고 걸러냅니다. */
    private val aiRegex = Regex(
        "인공지능|생성형|챗GPT|딥페이크|알고리즘|(?i:(?<![A-Za-z])(?:ChatGPT|OpenAI|LLM|deepfakes?|algorithms?|chatbots?|GPT|Gemini|Anthropic|artificial intelligence)(?![A-Za-z]))|(?<![A-Za-z])AI(?![A-Za-z])"
    )

    fun isAiRelated(text: String): Boolean = aiRegex.containsMatchIn(text)

    fun score(title: String, summary: String): RiskResult {
        val text = "$title $summary"
        var score = BASE
        val reasons = mutableListOf<String>()
        for (rule in rules) {
            if (rule.regex.containsMatchIn(text)) {
                score += rule.weight
                reasons += (if (rule.weight > 0) "▲" else "▼") + rule.label
            }
        }
        return RiskResult(score.coerceIn(0, 100), reasons, detectRegion(title) ?: detectRegion(summary))
    }

    private fun detectRegion(text: String): String? =
        regions.mapNotNull { r -> r.regex.find(text)?.let { it.range.first to r.name } }
            .minByOrNull { it.first }?.second

    /** 최근 3일 기사 중 점수 상위 5개의 평균을 "현재 위험도"로 봅니다. */
    fun overall(items: List<NewsItem>, now: Long = System.currentTimeMillis()): Int {
        if (items.isEmpty()) return 0
        val recent = items.filter { now - it.published <= 3L * 24 * 3600 * 1000 }
        val pool = if (recent.size >= 3) recent else items
        return pool.map { it.risk.score }.sortedDescending().take(5).average().toInt()
    }
}
