using System.Collections.Generic;
using System.Linq;

namespace CommunityDetox
{
    /// <summary>Built-in list of communities (same list as the Android app).</summary>
    internal sealed class Entry
    {
        public string Id, Name, Category;
        public bool DefaultOn;
        public string[] Domains;
        /// <summary>Extra sub-domains to put in the hosts file (hosts files can't use wildcards).</summary>
        public string[] ExtraHosts = new string[0];
        /// <summary>Desktop program process names (without .exe).</summary>
        public string[] Processes = new string[0];
        public string[] TitleKeywords;

        public string DomainSummary => string.Join(", ", Domains);
    }

    internal static class Catalog
    {
        public const string Korean = "국내 커뮤니티";
        public const string Campus = "학교 · 직장 커뮤니티";
        public const string Social = "해외 커뮤니티 · SNS";
        public const string Cafe = "카페 · 기타 (기본 꺼짐)";
        public static readonly string[] Categories = { Korean, Campus, Social, Cafe };

        public static readonly List<Entry> All = new List<Entry>
        {
            E("dcinside", "디시인사이드", Korean, true, D("dcinside.com", "dcinside.co.kr"), X("gall.dcinside.com", "search.dcinside.com", "game.dcinside.com")),
            E("fmkorea", "에펨코리아", Korean, true, D("fmkorea.com")),
            E("theqoo", "더쿠", Korean, true, D("theqoo.net")),
            E("ruliweb", "루리웹", Korean, true, D("ruliweb.com"), X("bbs.ruliweb.com", "mypi.ruliweb.com")),
            E("clien", "클리앙", Korean, true, D("clien.net")),
            E("ppomppu", "뽐뿌", Korean, true, D("ppomppu.co.kr")),
            E("instiz", "인스티즈", Korean, true, D("instiz.net")),
            E("natepann", "네이트판", Korean, true, D("pann.nate.com")),
            E("bobae", "보배드림", Korean, true, D("bobaedream.co.kr")),
            E("mlbpark", "엠엘비파크", Korean, true, D("mlbpark.donga.com")),
            E("todayhumor", "오늘의유머", Korean, true, D("todayhumor.co.kr")),
            E("82cook", "82쿡", Korean, true, D("82cook.com")),
            E("humoruniv", "웃긴대학", Korean, true, D("humoruniv.com"), X("web.humoruniv.com")),
            E("inven", "인벤", Korean, true, D("inven.co.kr"), X("lol.inven.co.kr", "maple.inven.co.kr", "lostark.inven.co.kr", "fifa.inven.co.kr", "wow.inven.co.kr", "hs.inven.co.kr", "it.inven.co.kr", "webzine.inven.co.kr"),
                kw: new[] { "인벤 |", "| 인벤", "- 인벤" }),
            E("arca", "아카라이브", Korean, true, D("arca.live")),
            E("dogdrip", "개드립", Korean, true, D("dogdrip.net")),
            E("ilbe", "일간베스트", Korean, true, D("ilbe.com"), kw: new[] { "일간베스트", "일베저장소" }),
            E("slrclub", "SLR클럽", Korean, true, D("slrclub.com")),
            E("etoland", "이토랜드", Korean, true, D("etoland.co.kr")),
            E("ygosu", "와이고수", Korean, true, D("ygosu.com")),
            E("damoang", "다모앙", Korean, true, D("damoang.net")),
            E("quasarzone", "퀘이사존", Korean, true, D("quasarzone.com")),

            E("everytime", "에브리타임", Campus, true, D("everytime.kr")),
            E("blind", "블라인드", Campus, true, D("teamblind.com")),

            E("reddit", "Reddit", Social, true, D("reddit.com", "redd.it"), X("old.reddit.com", "new.reddit.com", "i.redd.it", "v.redd.it")),
            E("x", "X (트위터)", Social, true, D("x.com", "twitter.com"), X("mobile.twitter.com", "mobile.x.com"), kw: new[] { "트위터", "Twitter", "/ X" }),
            E("instagram", "인스타그램", Social, true, D("instagram.com"), kw: new[] { "인스타그램", "Instagram" }),
            E("facebook", "페이스북", Social, true, D("facebook.com", "fb.com"), X("web.facebook.com"), kw: new[] { "페이스북", "Facebook" }),
            E("threads", "스레드", Social, true, D("threads.net", "threads.com"), kw: new[] { "Threads" }),
            E("tiktok", "틱톡", Social, true, D("tiktok.com"), X("vt.tiktok.com"), kw: new[] { "틱톡", "TikTok" }),
            E("4chan", "4chan", Social, true, D("4chan.org", "4channel.org"), X("boards.4chan.org", "boards.4channel.org")),
            E("9gag", "9GAG", Social, true, D("9gag.com")),

            E("navercafe", "네이버 카페", Cafe, false, D("cafe.naver.com")),
            E("daumcafe", "다음 카페", Cafe, false, D("cafe.daum.net")),
            E("discord", "디스코드", Cafe, false, D("discord.com", "discord.gg"), X("ptb.discord.com", "canary.discord.com"),
                proc: new[] { "Discord", "DiscordPTB", "DiscordCanary" }, kw: new[] { "디스코드", "Discord" }),
            E("youtube", "유튜브", Cafe, false, D("youtube.com", "youtu.be"), X("music.youtube.com"), kw: new[] { "유튜브", "YouTube" }),
        };

        public static IEnumerable<Entry> InCategory(string c) => All.Where(e => e.Category == c);

        private static Entry E(string id, string name, string cat, bool on, string[] domains, string[] extra = null,
                               string[] proc = null, string[] kw = null) =>
            new Entry
            {
                Id = id, Name = name, Category = cat, DefaultOn = on, Domains = domains,
                ExtraHosts = extra ?? new string[0], Processes = proc ?? new string[0],
                TitleKeywords = kw ?? new[] { name },
            };

        private static string[] D(params string[] s) => s;
        private static string[] X(params string[] s) => s;
    }
}
