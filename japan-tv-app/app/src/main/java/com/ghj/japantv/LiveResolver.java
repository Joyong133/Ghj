package com.ghj.japantv;

import android.net.Uri;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 유튜브 채널/검색 주소에서 "지금 방송 중인 영상 ID"를 찾습니다.
 * 찾은 ID는 유튜브 공식 임베드 플레이어로 영상만 화면 가득 재생하는 데 씁니다.
 */
final class LiveResolver {
    private static final String DESKTOP_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                    + "Chrome/130.0.0.0 Safari/537.36";
    private static final int MAX_BYTES = 4 * 1024 * 1024;
    private static final int MAX_CANDIDATES = 15;

    private static final Pattern VALID_ID = Pattern.compile("^[A-Za-z0-9_-]{11}$");
    private static final Pattern[] DIRECT = {
            Pattern.compile("[?&]v=([A-Za-z0-9_-]{11})"),
            Pattern.compile("youtu\\.be/([A-Za-z0-9_-]{11})"),
            Pattern.compile("/(?:live|embed|shorts)/([A-Za-z0-9_-]{11})(?:[/?#&]|$)"),
    };
    private static final Pattern CANONICAL = Pattern.compile(
            "rel=\"canonical\"\\s+href=\"https?://(?:www\\.|m\\.)?youtube\\.com/watch\\?v=([A-Za-z0-9_-]{11})");
    private static final Pattern VIDEO_ID = Pattern.compile("\"videoId\":\"([A-Za-z0-9_-]{11})\"");

    private LiveResolver() {
    }

    static boolean isYouTube(String url) {
        try {
            String h = Uri.parse(url).getHost();
            if (h == null) return false;
            h = h.toLowerCase(Locale.ROOT);
            return h.equals("youtu.be") || h.equals("youtube.com") || h.endsWith(".youtube.com");
        } catch (Exception e) {
            return false;
        }
    }

    static boolean isValidId(String id) {
        return id != null && VALID_ID.matcher(id).matches();
    }

    /**
     * 재생할 영상 ID 후보를 돌려줍니다. 비어 있으면 지금 방송 중인 라이브가 없다는 뜻입니다.
     *
     * @throws IOException 인터넷 연결 문제로 페이지를 받지 못했을 때
     */
    static List<String> resolve(String url) throws IOException {
        String direct = directId(url);
        if (direct != null) return Collections.singletonList(direct);

        String pageUrl = url.replaceFirst("(?i)^https?://(?:m\\.|www\\.)?youtube\\.com", "https://www.youtube.com");
        String[] page = fetch(pageUrl);
        String finalUrl = page[0];
        String body = page[1];

        // /live 주소가 영상 페이지로 바로 이동한 경우
        String redirected = directId(finalUrl);
        if (redirected != null) return Collections.singletonList(redirected);

        Matcher c = CANONICAL.matcher(body);
        if (c.find()) return Collections.singletonList(c.group(1));

        // 채널의 /live 인데 영상 페이지가 아니면 지금은 방송이 없는 것입니다.
        String path = Uri.parse(pageUrl).getPath();
        if (path != null && path.replaceAll("/+$", "").endsWith("/live")) return new ArrayList<>();

        // 검색 결과 등: 나온 순서대로 영상 ID를 모읍니다.
        Set<String> ids = new LinkedHashSet<>();
        Matcher m = VIDEO_ID.matcher(body);
        while (m.find() && ids.size() < MAX_CANDIDATES) ids.add(m.group(1));
        return new ArrayList<>(ids);
    }

    private static String directId(String url) {
        if (url == null) return null;
        for (Pattern p : DIRECT) {
            Matcher m = p.matcher(url);
            if (m.find()) return m.group(1);
        }
        return null;
    }

    /** @return {최종 주소, 본문} */
    private static String[] fetch(String url) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        try {
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(15_000);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("User-Agent", DESKTOP_UA);
            conn.setRequestProperty("Accept-Language", "ja-JP,ja;q=0.9,ko;q=0.8");
            // 유럽 등에서 나오는 쿠키 동의 화면을 건너뜁니다.
            conn.setRequestProperty("Cookie", "CONSENT=YES+cb; SOCS=CAI");
            int code = conn.getResponseCode();
            InputStream in = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (in == null) throw new IOException("HTTP " + code);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16 * 1024];
            int n;
            try (InputStream is = in) {
                while ((n = is.read(buf)) != -1 && out.size() < MAX_BYTES) out.write(buf, 0, n);
            }
            if (code >= 400) throw new IOException("HTTP " + code);
            return new String[]{conn.getURL().toString(), new String(out.toByteArray(), StandardCharsets.UTF_8)};
        } finally {
            conn.disconnect();
        }
    }
}
