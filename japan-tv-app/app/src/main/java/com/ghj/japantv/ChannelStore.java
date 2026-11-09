package com.ghj.japantv;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONException;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** 채널 목록을 휴대폰에 저장하고 불러옵니다. */
public final class ChannelStore {
    private static final String PREFS = "channels";
    private static final String KEY = "list_v1";
    private static final String VERSION_KEY = "defaults_version";
    /** 기본 채널 목록이 바뀔 때마다 올립니다. (2: 드라마 채널 추가) */
    private static final int DEFAULTS_VERSION = 2;
    /** 유튜브 검색의 '실시간' 필터 */
    private static final String LIVE_FILTER = "&sp=EgJAAQ%253D%253D";
    private static final Pattern STREAM_EXT = Pattern.compile(
            "\\.(m3u8|mpd|mp4|m4v|webm|mkv|ts|mp3|aac|m4a)(\\?|#|$)", Pattern.CASE_INSENSITIVE);

    private final SharedPreferences sp;

    public ChannelStore(Context context) {
        sp = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public List<Channel> load() {
        String raw = sp.getString(KEY, null);
        if (raw == null) {
            List<Channel> d = defaults();
            save(d);
            sp.edit().putInt(VERSION_KEY, DEFAULTS_VERSION).apply();
            return d;
        }
        List<Channel> out = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                Channel c = Channel.fromJson(arr.getJSONObject(i));
                if (!c.id.isEmpty() && !c.url.isEmpty()) out.add(c);
            }
        } catch (JSONException e) {
            return defaults();
        }
        // 앱을 업데이트하면 새로 생긴 기본 채널(드라마)을 목록에 넣어 줍니다.
        if (sp.getInt(VERSION_KEY, 1) < 2) {
            for (Channel d : defaults()) {
                if (Channel.CAT_DRAMA.equals(d.category) && indexOf(out, d.id) < 0) out.add(d);
            }
            save(out);
        }
        if (sp.getInt(VERSION_KEY, 1) < DEFAULTS_VERSION) {
            sp.edit().putInt(VERSION_KEY, DEFAULTS_VERSION).apply();
        }
        return out;
    }

    private static int indexOf(List<Channel> list, String id) {
        for (int i = 0; i < list.size(); i++) {
            if (list.get(i).id.equals(id)) return i;
        }
        return -1;
    }

    public void save(List<Channel> list) {
        JSONArray arr = new JSONArray();
        try {
            for (Channel c : list) arr.put(c.toJson());
        } catch (JSONException ignored) {
        }
        sp.edit().putString(KEY, arr.toString()).apply();
    }

    /** 지운 기본 채널을 다시 넣습니다. 추가한 개수를 돌려줍니다. */
    public int restoreDefaults(List<Channel> list) {
        int added = 0;
        for (Channel d : defaults()) {
            boolean exists = false;
            for (Channel c : list) {
                if (c.id.equals(d.id)) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                list.add(d);
                added++;
            }
        }
        save(list);
        return added;
    }

    /**
     * 기본 채널: 일본 방송사가 유튜브에 무료로 공개하는 공식 라이브입니다.
     * 채널 주소 뒤의 /live 는 그 채널에서 지금 방송 중인 라이브로 바로 이동합니다.
     */
    public static List<Channel> defaults() {
        List<Channel> l = new ArrayList<>();
        l.add(new Channel("wni", "ウェザーニュースLiVE",
                "24시간 날씨 생방송 · 말이 또박또박해서 입문자에게 추천",
                "https://m.youtube.com/@weathernews/live", Channel.KIND_WEB, "☀️", true, Channel.CAT_NEWS));
        l.add(new Channel("ntv", "日テレNEWS24",
                "니혼TV 24시간 뉴스 라이브",
                "https://m.youtube.com/channel/UCuTAXTexrhetbOe3zgskJBQ/live", Channel.KIND_WEB, "📰", true, Channel.CAT_NEWS));
        l.add(new Channel("tbs", "TBS NEWS DIG",
                "TBS·JNN 뉴스 라이브 (방송이 없을 땐 채널 화면이 열려요)",
                "https://m.youtube.com/channel/UC6AG81pAkf6Lbi_1VC5NmPA/live", Channel.KIND_WEB, "📺", true, Channel.CAT_NEWS));
        l.add(new Channel("ann", "ANNnewsCH",
                "테레비아사히(ANN) 뉴스 라이브",
                "https://m.youtube.com/channel/UCGCZAYq5Xxojl_tSXcVJhiQ/live", Channel.KIND_WEB, "🗾", true, Channel.CAT_NEWS));
        l.add(new Channel("fnn", "FNNプライムオンライン",
                "후지TV(FNN) 뉴스 · 지금 방송 중인 라이브 목록",
                youtubeLiveSearch("FNNプライムオンライン"), Channel.KIND_WEB, "🎙️", true, Channel.CAT_NEWS));
        l.add(new Channel("live_news", "지금 방송 중인 일본 뉴스",
                "유튜브에서 실시간으로 방송 중인 일본 뉴스 찾기",
                youtubeLiveSearch("ニュース ライブ 日本"), Channel.KIND_WEB, "🔴", true, Channel.CAT_NEWS));

        // ---- 드라마 (공식 채널의 영상을 차례로 틀어 줍니다) ----
        l.add(new Channel("ntv_drama", "日テレドラマ公式",
                "니혼TV 드라마 공식 채널 · 명장면·하이라이트·특별 영상",
                "https://m.youtube.com/channel/UCCJge2nWVQwnJj9BxQMecWg/videos", Channel.KIND_WEB, "🎭", true,
                Channel.CAT_DRAMA));
        l.add(new Channel("tbs_drama", "TBS公式 YouTuboo",
                "TBS 공식 · 드라마·예능 영상",
                "https://m.youtube.com/@tbspr/videos", Channel.KIND_WEB, "🎬", true, Channel.CAT_DRAMA));
        l.add(new Channel("tx_drama", "テレ東 ドラマ",
                "테레비도쿄 드라마 공식 영상",
                youtubeSearch("テレ東公式 ドラマチャンネル"), Channel.KIND_WEB, "📼", true, Channel.CAT_DRAMA));
        l.add(new Channel("toei", "東映特撮 (仮面ライダー・戦隊)",
                "토에이 공식 · 가면라이더·전대 무료 공개 에피소드",
                youtubeSearch("東映特撮YouTube Official 第1話"), Channel.KIND_WEB, "🦸", true, Channel.CAT_DRAMA));
        return l;
    }

    public static String youtubeSearch(String query) {
        return "https://m.youtube.com/results?search_query=" + Uri.encode(query);
    }

    public static String youtubeLiveSearch(String query) {
        return "https://m.youtube.com/results?search_query=" + Uri.encode(query) + LIVE_FILTER;
    }

    /** 사용자가 넣은 주소를 열 수 있는 형태로 고칩니다. "@핸들"은 그 유튜브 채널의 라이브로 바꿉니다. */
    public static String normalizeUrl(String input) {
        String s = input.trim();
        if (s.startsWith("@") && !s.contains("/") && !s.contains(" ")) {
            return "https://m.youtube.com/" + s + "/live";
        }
        if (!s.matches("(?i)^[a-z][a-z0-9+.-]*://.*")) s = "https://" + s;
        return s;
    }

    public static boolean looksLikeStream(String url) {
        return STREAM_EXT.matcher(url).find() || url.toLowerCase(Locale.ROOT).contains("m3u8");
    }
}
