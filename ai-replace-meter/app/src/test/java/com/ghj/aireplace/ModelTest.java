package com.ghj.aireplace;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import com.ghj.aireplace.RiskModel.Country;

import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

public class ModelTest {

    @Test
    public void defaultsAreInPlausibleRangeAndKoreaHigherThanJapan() {
        RiskModel.Inputs in = new RiskModel.Inputs();
        double kr = RiskModel.compute(Country.KR, in).probability;
        double jp = RiskModel.compute(Country.JP, in).probability;
        System.out.printf("default KR=%.3f JP=%.3f%n", kr, jp);
        assertTrue(kr > jp);
        assertTrue(kr > 0.25 && kr < 0.6);
        assertTrue(jp > 0.1 && jp < 0.4);
    }

    @Test
    public void monotonicInputs() {
        RiskModel.Inputs in = new RiskModel.Inputs();
        double base = RiskModel.compute(Country.KR, in).probability;
        in.aiPerformance = 95;
        assertTrue(RiskModel.compute(Country.KR, in).probability > base);
        in.aiPerformance = 80;
        in.newsKr = 0.8;
        assertTrue(RiskModel.compute(Country.KR, in).probability > base);
        in.newsKr = 0;
        in.seniority = 2;
        assertTrue(RiskModel.compute(Country.KR, in).probability < base);
        in.seniority = 1;
        in.role = 4; // QA
        assertTrue(RiskModel.compute(Country.KR, in).probability > base);
    }

    @Test
    public void extremesStayInRange() {
        RiskModel.Inputs in = new RiskModel.Inputs();
        in.aiPerformance = 100; in.aiMomentum = 5; in.newsKr = 9; in.role = 99; in.seniority = -3; in.horizon = 9;
        double p = RiskModel.compute(Country.KR, in).probability;
        System.out.printf("max KR=%.3f%n", p);
        assertTrue(p < 1 && p > 0.5);
    }

    @Test
    public void keywordScoring() {
        News.Item a = new News.Item("AI 때문에 신입 개발자 채용 급감… 구조조정 칼바람", "", "", 0);
        News.score(a, News.Feed.KR);
        assertTrue(a.score() > 0);
        News.Item b = new News.Item("AI는 개발자를 대체 불가… 시니어 인력난에 몸값 상승", "", "", 0);
        News.score(b, News.Feed.KR);
        assertTrue("" + b.up + "/" + b.down, b.score() < 0);
        News.Item c = new News.Item("生成AIでエンジニアの仕事が置き換え、人員削減へ", "", "", 0);
        News.score(c, News.Feed.JP);
        assertTrue(c.score() > 0);
        News.Item e = new News.Item("IT人材不足が深刻化、エンジニア採用拡大", "", "", 0);
        News.score(e, News.Feed.JP);
        assertTrue(e.score() < 0);
        News.Item g = new News.Item("New model beats record on SWE-bench", "", "", 0);
        News.score(g, News.Feed.GLOBAL);
        assertTrue(g.score() > 0);
    }

    @Test
    public void parsesGoogleNewsRss() throws Exception {
        String xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><rss version=\"2.0\"><channel><title>x</title>"
                + "<item><title>개발자 감원 확산 - 한국일보</title><link>https://example.com/a</link>"
                + "<pubDate>Sat, 07 Nov 2026 08:00:00 GMT</pubDate><source url=\"https://h.com\">한국일보</source></item>"
                + "<item><title>No source</title><link>https://example.com/b</link></item>"
                + "</channel></rss>";
        List<News.Item> items = News.parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)), 10);
        assertEquals(2, items.size());
        assertEquals("개발자 감원 확산", items.get(0).title);
        assertEquals("한국일보", items.get(0).source);
        assertTrue(items.get(0).publishedAt > 0);
        assertEquals(0, items.get(1).publishedAt);
        for (News.Item it : items) News.score(it, News.Feed.KR);
        double idx = News.index(items, items.get(0).publishedAt);
        assertTrue(idx > 0 && idx <= 1);
    }

    @Test
    public void feedUrlEncodesQuery() {
        String u = News.Feed.JP.url();
        assertTrue(u.startsWith("https://news.google.com/rss/search?q="));
        assertTrue(u.contains("hl=ja&gl=JP&ceid=JP:ja"));
        assertTrue(!u.contains(" "));
    }
}
