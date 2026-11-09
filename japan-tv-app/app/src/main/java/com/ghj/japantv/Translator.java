package com.ghj.japantv;

import org.json.JSONArray;
import org.json.JSONException;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/** 구글 번역으로 일본어 문장을 한국어로 옮깁니다. */
final class Translator {
    private static final String UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                    + "Chrome/130.0.0.0 Safari/537.36";

    /** 요청이 너무 많아서 구글이 잠시 막았을 때 */
    static final class RateLimitedException extends IOException {
        RateLimitedException(int code) {
            super("HTTP " + code);
        }
    }

    private Translator() {
    }

    static String japaneseToKorean(String text) throws IOException {
        String url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=ko&dt=t&q="
                + URLEncoder.encode(text, "UTF-8");
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        try {
            conn.setConnectTimeout(8_000);
            conn.setReadTimeout(8_000);
            conn.setRequestProperty("User-Agent", UA);
            int code = conn.getResponseCode();
            if (code == 429 || code == 403) throw new RateLimitedException(code);
            if (code != 200) throw new IOException("HTTP " + code);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8 * 1024];
            int n;
            try (InputStream in = conn.getInputStream()) {
                while ((n = in.read(buf)) != -1 && out.size() < 512 * 1024) out.write(buf, 0, n);
            }
            // 응답 모양: [[["번역문","원문",...],["번역문2","원문2",...]],null,"ja",...]
            JSONArray segments = new JSONArray(new String(out.toByteArray(), StandardCharsets.UTF_8)).getJSONArray(0);
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < segments.length(); i++) {
                JSONArray seg = segments.optJSONArray(i);
                if (seg != null && !seg.isNull(0)) sb.append(seg.optString(0));
            }
            return sb.toString().trim();
        } catch (JSONException e) {
            throw new IOException("bad response", e);
        } finally {
            conn.disconnect();
        }
    }
}
