package com.ghj.japantv;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Locale;

/** 채널 하나. 웹 페이지(유튜브 라이브 등)이거나, m3u8 같은 동영상 스트림 주소입니다. */
public final class Channel {
    public static final int KIND_WEB = 0;
    public static final int KIND_STREAM = 1;

    public final String id;
    public final String name;
    public final String description;
    public final String url;
    public final int kind;
    public final String icon;
    public final boolean builtIn;

    public Channel(String id, String name, String description, String url, int kind, String icon, boolean builtIn) {
        this.id = id;
        this.name = name;
        this.description = description == null ? "" : description;
        this.url = url;
        this.kind = kind;
        this.icon = (icon == null || icon.isEmpty()) ? "📺" : icon;
        this.builtIn = builtIn;
    }

    public boolean isStream() {
        return kind == KIND_STREAM;
    }

    public String typeLabel() {
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
                o.optBoolean("builtIn"));
    }
}
