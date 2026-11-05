package com.joyong.communitydetox;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Built-in list of communities that can be blocked with one tap. */
final class Catalog {

    static final class Entry {
        final String id;
        final String name;
        final String category;
        final String[] domains;
        final String[] packages;
        final boolean defaultOn;

        Entry(String id, String name, String category, boolean defaultOn,
              String[] domains, String[] packages) {
            this.id = id;
            this.name = name;
            this.category = category;
            this.defaultOn = defaultOn;
            this.domains = domains;
            this.packages = packages;
        }

        /** Words that appear in this site's page titles, e.g. "... - 디시인사이드". */
        String[] titleKeywords() {
            switch (id) {
                case "x": return new String[]{"트위터", "Twitter"};
                case "instagram": return new String[]{"인스타그램", "Instagram"};
                case "facebook": return new String[]{"페이스북", "Facebook"};
                case "threads": return new String[]{"Threads"};
                case "tiktok": return new String[]{"틱톡", "TikTok"};
                case "youtube": return new String[]{"유튜브", "YouTube"};
                case "discord": return new String[]{"디스코드", "Discord"};
                case "tumblr": return new String[]{"텀블러", "Tumblr"};
                case "bluesky": return new String[]{"블루스카이", "Bluesky"};
                case "mastodon": return new String[]{"마스토돈", "Mastodon"};
                case "snapchat": return new String[]{"스냅챗", "Snapchat"};
                case "band": return new String[]{"네이버 밴드"};
                case "ilbe": return new String[]{"일간베스트", "일베저장소"};
                case "inven": return new String[]{"인벤 |", "| 인벤", "- 인벤"}; // avoid "인벤토리"
                default: return new String[]{name};
            }
        }

        String domainSummary() {
            return String.join(", ", domains);
        }
    }

    static final String KOREAN = "국내 커뮤니티";
    static final String CAMPUS = "학교 · 직장 커뮤니티";
    static final String SOCIAL = "해외 커뮤니티 · SNS";
    static final String CAFE = "카페 · 기타 (기본 꺼짐)";

    static final List<String> CATEGORIES =
            Collections.unmodifiableList(java.util.Arrays.asList(KOREAN, CAMPUS, SOCIAL, CAFE));

    static final List<Entry> ALL;

    static {
        List<Entry> l = new ArrayList<>();
        // 국내 커뮤니티
        l.add(e("dcinside", "디시인사이드", KOREAN, true, d("dcinside.com", "dcinside.co.kr"), p("com.dcinside.app.android", "com.dcinside.app")));
        l.add(e("fmkorea", "에펨코리아", KOREAN, true, d("fmkorea.com"), p()));
        l.add(e("theqoo", "더쿠", KOREAN, true, d("theqoo.net"), p()));
        l.add(e("ruliweb", "루리웹", KOREAN, true, d("ruliweb.com"), p()));
        l.add(e("clien", "클리앙", KOREAN, true, d("clien.net"), p()));
        l.add(e("ppomppu", "뽐뿌", KOREAN, true, d("ppomppu.co.kr"), p()));
        l.add(e("instiz", "인스티즈", KOREAN, true, d("instiz.net"), p()));
        l.add(e("natepann", "네이트판", KOREAN, true, d("pann.nate.com"), p()));
        l.add(e("bobae", "보배드림", KOREAN, true, d("bobaedream.co.kr"), p()));
        l.add(e("mlbpark", "엠엘비파크", KOREAN, true, d("mlbpark.donga.com"), p()));
        l.add(e("todayhumor", "오늘의유머", KOREAN, true, d("todayhumor.co.kr"), p()));
        l.add(e("82cook", "82쿡", KOREAN, true, d("82cook.com"), p()));
        l.add(e("humoruniv", "웃긴대학", KOREAN, true, d("humoruniv.com"), p()));
        l.add(e("inven", "인벤", KOREAN, true, d("inven.co.kr"), p()));
        l.add(e("arca", "아카라이브", KOREAN, true, d("arca.live"), p()));
        l.add(e("dogdrip", "개드립", KOREAN, true, d("dogdrip.net"), p()));
        l.add(e("ilbe", "일간베스트", KOREAN, true, d("ilbe.com"), p()));
        l.add(e("slrclub", "SLR클럽", KOREAN, true, d("slrclub.com"), p()));
        l.add(e("etoland", "이토랜드", KOREAN, true, d("etoland.co.kr"), p()));
        l.add(e("ygosu", "와이고수", KOREAN, true, d("ygosu.com"), p()));
        l.add(e("damoang", "다모앙", KOREAN, true, d("damoang.net"), p()));
        l.add(e("quasarzone", "퀘이사존", KOREAN, true, d("quasarzone.com"), p()));
        l.add(e("orbi", "오르비", KOREAN, true, d("orbi.kr"), p()));
        l.add(e("jjang0u", "짱공유", KOREAN, true, d("jjang0u.com"), p()));
        l.add(e("gasengi", "가생이닷컴", KOREAN, true, d("gasengi.com"), p()));
        l.add(e("hygall", "해연갤", KOREAN, true, d("hygall.com"), p()));
        l.add(e("coolenjoy", "쿨엔조이", KOREAN, true, d("coolenjoy.net"), p()));
        l.add(e("ddanzi", "딴지일보", KOREAN, true, d("ddanzi.com"), p()));
        l.add(e("thisisgame", "디스이즈게임", KOREAN, true, d("thisisgame.com"), p()));
        l.add(e("dvdprime", "DVD프라임", KOREAN, true, d("dvdprime.com"), p()));

        // 학교 · 직장
        l.add(e("everytime", "에브리타임", CAMPUS, true, d("everytime.kr"), p("com.everytime.v2")));
        l.add(e("blind", "블라인드", CAMPUS, true, d("teamblind.com"), p("com.teamblind.blind")));
        l.add(e("snulife", "스누라이프", CAMPUS, true, d("snulife.com"), p()));
        l.add(e("koreapas", "고파스", CAMPUS, true, d("koreapas.com"), p()));

        // 해외 · SNS
        l.add(e("reddit", "Reddit", SOCIAL, true, d("reddit.com", "redd.it"), p("com.reddit.frontpage")));
        l.add(e("x", "X (트위터)", SOCIAL, true, d("x.com", "twitter.com"), p("com.twitter.android")));
        l.add(e("instagram", "인스타그램", SOCIAL, true, d("instagram.com"), p("com.instagram.android", "com.instagram.lite")));
        l.add(e("facebook", "페이스북", SOCIAL, true, d("facebook.com", "fb.com"), p("com.facebook.katana", "com.facebook.lite")));
        l.add(e("threads", "스레드", SOCIAL, true, d("threads.net", "threads.com"), p("com.instagram.barcelona")));
        l.add(e("tiktok", "틱톡", SOCIAL, true, d("tiktok.com"), p("com.zhiliaoapp.musically", "com.ss.android.ugc.trill")));
        l.add(e("4chan", "4chan", SOCIAL, true, d("4chan.org", "4channel.org"), p()));
        l.add(e("9gag", "9GAG", SOCIAL, true, d("9gag.com"), p("com.ninegag.android.app")));
        l.add(e("tumblr", "텀블러", SOCIAL, true, d("tumblr.com"), p("com.tumblr")));
        l.add(e("bluesky", "블루스카이", SOCIAL, true, d("bsky.app", "bsky.social"), p("xyz.blueskyweb.app")));
        l.add(e("mastodon", "마스토돈", SOCIAL, true, d("mastodon.social", "mastodon.online", "joinmastodon.org"), p("org.joinmastodon.android")));
        l.add(e("snapchat", "스냅챗", SOCIAL, true, d("snapchat.com"), p("com.snapchat.android")));
        l.add(e("quora", "Quora", SOCIAL, true, d("quora.com"), p("com.quora.android")));
        l.add(e("hackernews", "Hacker News", SOCIAL, true, d("news.ycombinator.com"), p()));
        l.add(e("imgur", "Imgur", SOCIAL, true, d("imgur.com"), p("com.imgur.mobile")));
        l.add(e("lemmy", "Lemmy", SOCIAL, true, d("lemmy.world", "lemmy.ml"), p()));

        // 카페 · 기타 (기본 꺼짐: 업무/공부에 쓰는 사람이 많아서)
        l.add(e("navercafe", "네이버 카페", CAFE, false, d("cafe.naver.com"), p("com.nhn.android.navercafe")));
        l.add(e("daumcafe", "다음 카페", CAFE, false, d("cafe.daum.net"), p("net.daum.android.cafe")));
        l.add(e("discord", "디스코드", CAFE, false, d("discord.com", "discord.gg"), p("com.discord")));
        l.add(e("youtube", "유튜브", CAFE, false, d("youtube.com", "youtu.be"), p("com.google.android.youtube")));
        l.add(e("band", "네이버 밴드", CAFE, false, d("band.us"), p("com.nhn.android.band")));
        ALL = Collections.unmodifiableList(l);
    }

    private static Entry e(String id, String name, String category, boolean on, String[] domains, String[] pkgs) {
        return new Entry(id, name, category, on, domains, pkgs);
    }

    private static String[] d(String... s) {
        return s;
    }

    private static String[] p(String... s) {
        return s;
    }

    static List<Entry> inCategory(String category) {
        List<Entry> out = new ArrayList<>();
        for (Entry entry : ALL) {
            if (entry.category.equals(category)) out.add(entry);
        }
        return out;
    }

    private Catalog() {
    }
}
