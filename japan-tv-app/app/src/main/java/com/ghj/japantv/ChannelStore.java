package com.ghj.japantv;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** 채널 목록을 휴대폰에 저장하고 불러옵니다. */
public final class ChannelStore {
    private static final String PREFS = "channels";
    private static final String KEY = "list_v1";
    private static final String VERSION_KEY = "defaults_version";
    /**
     * 기본 채널 목록이 바뀔 때마다 올립니다.
     * 2: 드라마 채널, 3: 드라마 모아 틀기·DMM TV, 4: 24시간 채널만 남김
     */
    private static final int DEFAULTS_VERSION = 4;
    /** 드라마 24시간(모아 틀기)이 영상을 가져오는 공식 드라마 채널 */
    public static final List<String> DRAMA_MIX_SOURCES = Collections.unmodifiableList(Arrays.asList(
            "https://m.youtube.com/channel/UCCJge2nWVQwnJj9BxQMecWg/videos", // 日テレドラマ公式
            "https://m.youtube.com/@tbspr/videos",                            // TBS公式 YouTuboo
            youtubeSearch("テレ東公式 ドラマチャンネル"),                       // テレ東 ドラマ
            youtubeSearch("東映特撮YouTube Official 第1話"),                    // 東映特撮
            "https://m.youtube.com/@dmmtv-drama/videos"                        // DMM TV ドラマ
    ));
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
        // 앱을 업데이트하면 그 뒤로 새로 생긴 기본 채널만 목록에 넣어 줍니다.
        int stored = sp.getInt(VERSION_KEY, 1);
        if (stored < DEFAULTS_VERSION) {
            out = migrate(out, stored);
            save(out);
            sp.edit().putInt(VERSION_KEY, DEFAULTS_VERSION).apply();
        }
        return out;
    }

    /**
     * 앱을 업데이트했을 때 저장된 목록을 새 기본 목록에 맞춥니다.
     * - 24시간 방송이 아닌 옛 기본 채널은 지웁니다.
     * - 그 사이에 새로 생긴 기본 채널은 넣습니다. (예전에 사용자가 지운 기본 채널은 되살리지 않습니다.)
     * - 기본 채널은 기본 순서대로, 직접 추가한 채널은 그 뒤에 원래 순서대로 둡니다.
     */
    private static List<Channel> migrate(List<Channel> old, int stored) {
        List<Channel> result = new ArrayList<>();
        for (Channel d : defaults()) {
            int i = indexOf(old, d.id);
            if (i >= 0) {
                result.add(old.get(i)); // 사용자가 고친 이름·주소는 그대로
            } else if (sinceVersion(d.id) > stored) {
                result.add(d);
            }
        }
        for (Channel c : old) {
            if (indexOf(result, c.id) >= 0) continue;
            if (c.builtIn) continue; // 기본 목록에서 빠진 옛 기본 채널
            result.add(c);
        }
        return result;
    }

    /** 그 기본 채널이 몇 번째 목록 버전에서 생겼는지 */
    private static int sinceVersion(String id) {
        switch (id) {
            case "drama_mix":
                return 3;
            case "news24":
            case "shopping":
            case "live24":
            case "cam_shibuya":
            case "cam_fuji":
                return 4;
            default:
                return 1;
        }
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
        // ---- 24시간 생방송 (일본어) ----
        l.add(new Channel("wni", "ウェザーニュースLiVE",
                "24시간 날씨 생방송 · 말이 또박또박해서 입문자에게 추천",
                "https://m.youtube.com/@weathernews/live", Channel.KIND_WEB, "☀️", true, Channel.CAT_NEWS));
        l.add(new Channel("ntv", "日テレNEWS24",
                "니혼TV 24시간 뉴스 라이브",
                "https://m.youtube.com/channel/UCuTAXTexrhetbOe3zgskJBQ/live", Channel.KIND_WEB, "📰", true,
                Channel.CAT_NEWS));
        l.add(new Channel("news24", "24시간 뉴스 라이브 찾기",
                "지금 24시간 방송 중인 일본 뉴스 라이브 · 메뉴의 \'다른 라이브\'로 바꾸기",
                youtubeLiveSearch("ニュース 24時間 ライブ"), Channel.KIND_WEB, "🔴", true, Channel.CAT_NEWS));
        l.add(new Channel("shopping", "QVC 홈쇼핑 생방송",
                "일본 24시간 홈쇼핑 생방송 · 쉬지 않고 일본어로 말해요",
                youtubeLiveSearch("QVC ジャパン 生放送"), Channel.KIND_WEB, "🛍️", true, Channel.CAT_NEWS));
        l.add(new Channel("live24", "24시간 라이브 둘러보기",
                "유튜브에서 지금 24시간 방송 중인 일본 라이브를 찾아서 틀어 줘요",
                youtubeLiveSearch("24時間 ライブ 公式 日本"), Channel.KIND_WEB, "📡", true, Channel.CAT_NEWS));

        // ---- 드라마: 공식 드라마 채널 영상을 섞어서 쉬지 않고 틀어 줍니다 ----
        l.add(new Channel("drama_mix", "드라마 24시간 (모아 틀기)",
                "일본 방송국 공식 드라마 채널 영상을 섞어서 쉬지 않고 이어서 틀어 줘요",
                Channel.MIX_PREFIX + Channel.CAT_DRAMA, Channel.KIND_WEB, "📺", true, Channel.CAT_DRAMA));

        // ---- 24시간 라이브캠 ----
        l.add(new Channel("cam_shibuya", "도쿄 시부야 라이브캠",
                "시부야 스크램블 교차로 24시간 라이브 카메라",
                youtubeLiveSearch("渋谷 スクランブル交差点 ライブカメラ"), Channel.KIND_WEB, "🚦", true, Channel.CAT_CAM));
        l.add(new Channel("cam_fuji", "후지산 라이브캠",
                "후지산 24시간 라이브 카메라",
                youtubeLiveSearch("富士山 ライブカメラ"), Channel.KIND_WEB, "🗻", true, Channel.CAT_CAM));
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
