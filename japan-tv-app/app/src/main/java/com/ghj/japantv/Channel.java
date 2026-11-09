package com.ghj.japantv;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Locale;

/** 채널 하나. 웹 페이지(유튜브 라이브 등)이거나, m3u8 같은 동영상 스트림 주소입니다. */
public final class Channel {
    public static final int KIND_WEB = 0;
    public static final int KIND_STREAM = 1;

    public static final String CAT_NEWS = "news";
    public static final String CAT_DRAMA = "drama";
    public static final String CAT_CUSTOM = "custom";
    /** 같은 분류의 채널 영상을 모아서 쉬지 않고 틀어 주는 채널 (예: jtv://mix/drama) */
    public static final String MIX_PREFIX = "jtv://mix/";

    public final String id;
    public final String name;
    public final String description;
    public final String url;
    public final int kind;
    public final String icon;
    public final boolean builtIn;
    /** 뉴스 / 드라마 / 내 채널 */
    public final String category;

    public Channel(String id, String name, String description, String url, int kind, String icon, boolean builtIn,
                   String category) {
        this.id = id;
        this.name = name;
        this.description = description == null ? "" : description;
        this.url = url;
        this.kind = kind;
        this.icon = (icon == null || icon.isEmpty()) ? "📺" : icon;
        this.builtIn = builtIn;
        this.category = (category == null || category.isEmpty()) ? (builtIn ? CAT_NEWS : CAT_CUSTOM) : category;
    }

    public boolean isStream() {
        return kind == KIND_STREAM;
    }

    /** 생방송 채널인지 (아니면 영상을 차례로 틀어 주는 드라마/동영상 채널) */
    public boolean isLiveSource() {
        String u = url.toLowerCase(Locale.ROOT);
        return u.matches(".*/live/?([?#].*)?$") || u.contains("egjaaq");
    }

    public boolean isMix() {
        return url.startsWith(MIX_PREFIX);
    }

    public String typeLabel() {
        if (isMix()) return "24시간";
        if (isStream()) return "스트림";
        String u = url.toLowerCase(Locale.ROOT);
        if (u.contains("youtube.com") || u.contains("youtu.be")) return "YouTube";
        return "웹";
    }

    JSONObject toJson() throws JSONException {
        JSONObject o = new JSONObject();
        o.put("id", id);
        o.put("name", name);
        o.put("description", description);
        o.put("url", url);
        o.put("kind", isStream() ? "stream" : "web");
        o.put("icon", icon);
        o.put("builtIn", builtIn);
        o.put("category", category);
        return o;
    }

    static Channel fromJson(JSONObject o) {
        return new Channel(
                o.optString("id"),
                o.optString("name"),
                o.optString("description"),
                o.optString("url"),
                "stream".equals(o.optString("kind")) ? KIND_STREAM : KIND_WEB,
                o.optString("icon", "📺"),
                o.optBoolean("builtIn"),
                o.optString("category", ""));
    }
}
