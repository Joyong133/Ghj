package com.ghj.questblack;

import android.content.Context;
import android.net.Uri;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * 유튜브 관련 도우미. 페이지 안에서 실행하는 스크립트는 assets/hook.js, assets/poll.js에 있습니다.
 * 앱의 WebView는 유튜브 페이지 자신이므로, 같은 출처로 자막 정보에 접근할 수 있습니다.
 */
final class YouTubeScripts {
    private YouTubeScripts() {
    }

    /** PC 화면 유튜브를 받기 위한 브라우저 이름 (자막 표시 구조가 가장 안정적입니다). */
    static final String DESKTOP_UA =
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
                    + "Chrome/131.0.0.0 Safari/537.36";

    /** assets 폴더의 스크립트 파일을 읽습니다. */
    static String loadAsset(Context context, String name) {
        try (InputStream in = context.getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (IOException e) {
            throw new IllegalStateException("missing asset " + name, e);
        }
    }

    /** 매번 실행할 자막 읽기 스크립트 (언어 설정을 앞에 붙입니다). */
    static String pollScript(Context context, String lang, boolean translate) {
        return "window.__vrCfg={lang:" + JSONObject.quote(lang) + ",translate:" + translate + "};\n"
                + loadAsset(context, "poll.js");
    }

    /** 유튜브 주소(또는 공유된 글)에서 PC 유튜브 재생 주소를 만듭니다. 못 알아보면 null. */
    static String toWatchUrl(String text) {
        if (text == null) return null;
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("(https?://)?([\\w-]+\\.)?(youtube\\.com|youtu\\.be|youtube-nocookie\\.com)/[^\\s]*")
                .matcher(text);
        String id = null;
        String list = null;
        if (m.find()) {
            String raw = m.group();
            if (!raw.startsWith("http")) raw = "https://" + raw;
            Uri u = Uri.parse(raw);
            String host = u.getHost() == null ? "" : u.getHost();
            list = u.getQueryParameter("list");
            java.util.List<String> seg = u.getPathSegments();
            if (host.endsWith("youtu.be")) {
                if (!seg.isEmpty()) id = seg.get(0);
            } else if (u.getQueryParameter("v") != null) {
                id = u.getQueryParameter("v");
            } else if (seg.size() >= 2 && (seg.get(0).equals("shorts") || seg.get(0).equals("live")
                    || seg.get(0).equals("embed") || seg.get(0).equals("v"))) {
                id = seg.get(1);
            }
        } else if (text.trim().matches("[\\w-]{11}")) {
            id = text.trim();
        }
        if (id != null && !id.matches("[\\w-]{11}")) id = null;
        if (id == null && list == null) return null;
        StringBuilder sb = new StringBuilder("https://www.youtube.com/watch?");
        if (id != null) sb.append("v=").append(id);
        if (list != null) sb.append(id != null ? "&" : "").append("list=").append(Uri.encode(list));
        return sb.toString();
    }
}
