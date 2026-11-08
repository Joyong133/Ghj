package com.ghj.aireplace;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;

/** Google 뉴스 RSS 수집 + 헤드라인 키워드 점수화. 안드로이드 의존성 없음. */
public final class News {

    private News() {}

    public enum Feed {
        KR("AI 개발자 대체 OR AI 개발자 채용 OR AI 코딩 일자리 OR 개발자 구조조정 AI", "ko", "KR", "KR:ko"),
        JP("AI エンジニア 代替 OR 生成AI プログラマー 雇用 OR AI 開発者 仕事 OR IT人材 AI", "ja", "JP", "JP:ja"),
        GLOBAL("AI coding agent benchmark OR SWE-bench OR AI software engineer model", "en-US", "US", "US:en");

        final String query;
        final String hl;
        final String gl;
        final String ceid;

        Feed(String query, String hl, String gl, String ceid) {
            this.query = query;
            this.hl = hl;
            this.gl = gl;
            this.ceid = ceid;
        }

        public String url() {
            try {
                return "https://news.google.com/rss/search?q="
                        + URLEncoder.encode(query + " when:14d", "UTF-8")
                        + "&hl=" + hl + "&gl=" + gl + "&ceid=" + ceid;
            } catch (java.io.UnsupportedEncodingException e) {
                throw new IllegalStateException(e);
            }
        }
    }

    public static final class Item {
        public final String title;
        public final String source;
        public final String link;
        public final long publishedAt; // epoch ms, 0 = 알 수 없음
        public int up;   // 위험 증가 키워드 수
        public int down; // 위험 감소 키워드 수

        public Item(String title, String source, String link, long publishedAt) {
            this.title = title;
            this.source = source;
            this.link = link;
            this.publishedAt = publishedAt;
        }

        public int score() {
            return Math.max(-2, Math.min(2, up - down));
        }
    }

    // ── 키워드 사전 ──────────────────────────────────────────────────────

    private static final String[] KR_UP = {
            "대체", "해고", "감원", "구조조정", "채용 축소", "채용축소", "채용 감소", "채용 급감",
            "일자리 감소", "일자리 위협", "사라질", "사라진다", "사라지", "실직", "칼바람",
            "감축", "줄인다", "줄어", "급감", "필요 없", "불필요", "위기", "밀려"
    };
    private static final String[] KR_DOWN = {
            "인력 부족", "인력난", "구인난", "품귀", "채용 확대", "채용확대", "수요 증가", "수요 급증",
            "몸값", "연봉 상승", "한계", "오류", "보안 취약", "협업", "보조", "생산성",
            "새로운 일자리", "일자리 창출", "증원", "모셔", "부족"
    };
    private static final String[] JP_UP = {
            "代替", "置き換え", "奪う", "奪われ", "リストラ", "人員削減", "削減", "解雇",
            "不要", "失業", "消える", "危機", "採用縮小", "採用抑制", "減少", "淘汰"
    };
    private static final String[] JP_DOWN = {
            "人材不足", "人手不足", "不足", "需要", "採用拡大", "争奪", "年収アップ", "年収上昇",
            "限界", "誤り", "脆弱性", "協働", "支援", "生産性", "新たな雇用", "増員", "育成"
    };
    /** 부정 표현 ("대체 불가" 등): 위험 감소로 세고, 위험 증가 키워드 검사 전에 제거한다. */
    private static final String[] KR_NEG = {
            "대체 불가", "대체불가", "대체 못", "대체할 수 없", "대체하지 못", "대체 안 ", "못 대체", "대체 어렵"
    };
    private static final String[] JP_NEG = {
            "代替できない", "代替不可", "置き換えられない", "奪われない", "代替は難しい", "代替困難"
    };
    private static final String[] GL_NEG = {
            "can't replace", "cannot replace", "won't replace", "not replace"
    };
    private static final String[] GL_UP = {
            "record", "beats", "outperform", "state-of-the-art", "sota", "surpass", "breakthrough",
            "autonomous", "launch", "tops", "new model", "leap", "best-ever", "human-level"
    };
    private static final String[] GL_DOWN = {
            "plateau", "stall", "fails", "failure", "hallucinat", "limits", "struggle", "bug",
            "slowdown", "overhyped", "hype", "flawed", "contaminat", "security risk"
    };

    public static void score(Item it, Feed feed) {
        String t = it.title.toLowerCase(Locale.ROOT);
        String[] up, down, neg;
        switch (feed) {
            case KR: up = KR_UP; down = KR_DOWN; neg = KR_NEG; break;
            case JP: up = JP_UP; down = JP_DOWN; neg = JP_NEG; break;
            default: up = GL_UP; down = GL_DOWN; neg = GL_NEG; break;
        }
        int negHits = 0;
        for (String n : neg) {
            String k = n.toLowerCase(Locale.ROOT);
            int idx;
            while ((idx = t.indexOf(k)) >= 0) {
                negHits++;
                t = t.substring(0, idx) + " " + t.substring(idx + k.length());
            }
        }
        it.up = countHits(t, up);
        it.down = countHits(t, down) + negHits;
    }

    /** 사전 순서대로 매칭하고, 이미 맞은 구간과 겹치는 짧은 키워드는 다시 세지 않는다. */
    private static int countHits(String text, String[] words) {
        boolean[] used = new boolean[text.length()];
        int hits = 0;
        for (String w : words) {
            String k = w.toLowerCase(Locale.ROOT);
            int from = 0;
            int idx;
            while ((idx = text.indexOf(k, from)) >= 0) {
                boolean overlap = false;
                for (int i = idx; i < idx + k.length(); i++) {
                    if (used[i]) { overlap = true; break; }
                }
                if (!overlap) {
                    for (int i = idx; i < idx + k.length(); i++) used[i] = true;
                    hits++;
                }
                from = idx + k.length();
            }
        }
        return hits;
    }

    /** 기사들의 평균 점수를 -1~1 지수로 변환. 최근 기사일수록 가중치가 크다. */
    public static double index(List<Item> items, long now) {
        if (items == null || items.isEmpty()) return 0;
        double sum = 0, wsum = 0;
        for (Item it : items) {
            double ageDays = it.publishedAt > 0 ? Math.max(0, (now - it.publishedAt) / 86_400_000.0) : 7;
            double w = Math.exp(-ageDays / 7.0);
            sum += w * it.score();
            wsum += w;
        }
        if (wsum == 0) return 0;
        return Math.tanh(1.5 * sum / wsum);
    }

    // ── 수집 ─────────────────────────────────────────────────────────────

    public static List<Item> fetch(Feed feed, int max) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(feed.url()).openConnection();
        c.setConnectTimeout(10_000);
        c.setReadTimeout(15_000);
        c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) AIReplaceMeter/1.0");
        try {
            int code = c.getResponseCode();
            if (code != 200) throw new java.io.IOException("HTTP " + code);
            try (InputStream in = c.getInputStream()) {
                List<Item> items = parse(in, max);
                for (Item it : items) score(it, feed);
                return items;
            }
        } finally {
            c.disconnect();
        }
    }

    public static List<Item> parse(InputStream in, int max) throws Exception {
        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        trySetFeature(f, "http://apache.org/xml/features/disallow-doctype-decl", true);
        trySetFeature(f, "http://xml.org/sax/features/external-general-entities", false);
        trySetFeature(f, "http://xml.org/sax/features/external-parameter-entities", false);
        DocumentBuilder b = f.newDocumentBuilder();
        Document doc = b.parse(in);
        NodeList nodes = doc.getElementsByTagName("item");
        List<Item> out = new ArrayList<>();
        for (int i = 0; i < nodes.getLength() && out.size() < max; i++) {
            Element e = (Element) nodes.item(i);
            String title = text(e, "title");
            String source = text(e, "source");
            String link = text(e, "link");
            if (title.isEmpty()) continue;
            if (!source.isEmpty() && title.endsWith(" - " + source)) {
                title = title.substring(0, title.length() - source.length() - 3).trim();
            }
            out.add(new Item(title, source, link, parseDate(text(e, "pubDate"))));
        }
        return out;
    }

    private static void trySetFeature(DocumentBuilderFactory f, String name, boolean value) {
        try {
            f.setFeature(name, value);
        } catch (Exception ignored) {
            // 일부 안드로이드 파서는 기능 설정을 지원하지 않는다.
        }
    }

    private static String text(Element parent, String tag) {
        NodeList l = parent.getElementsByTagName(tag);
        if (l.getLength() == 0) return "";
        Node n = l.item(0);
        String s = n.getTextContent();
        return s == null ? "" : s.trim();
    }

    static long parseDate(String s) {
        if (s == null || s.isEmpty()) return 0;
        try {
            SimpleDateFormat f = new SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss zzz", Locale.US);
            Date d = f.parse(s);
            return d == null ? 0 : d.getTime();
        } catch (Exception e) {
            return 0;
        }
    }
}
