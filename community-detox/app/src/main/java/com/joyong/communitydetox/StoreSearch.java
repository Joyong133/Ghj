package com.joyong.communitydetox;

import java.util.Locale;
import java.util.Map;

/** Recognising a blocked community app's page in an app store. Pure Java, testable. */
final class StoreSearch {

    /** Words that contain a keyword but mean something else ("인벤토리" contains "인벤"). */
    private static final String[] NOT_A_MATCH = {"인벤토리"};

    /** Lower case, without spaces or punctuation: "디시 인사이드!" -> "디시인사이드". */
    static String normalize(CharSequence text) {
        if (text == null) return "";
        StringBuilder sb = new StringBuilder();
        String lower = text.toString().toLowerCase(Locale.ROOT);
        for (int i = 0; i < lower.length(); i++) {
            char ch = lower.charAt(i);
            if (Character.isLetterOrDigit(ch)) sb.append(ch);
        }
        return sb.toString();
    }

    /**
     * The original keyword found in the typed text, or null.
     * @param keywords normalized keyword -> keyword as shown to the user
     */
    static String match(CharSequence typed, Map<String, String> keywords) {
        String q = normalize(typed);
        if (q.isEmpty()) return null;
        for (String no : NOT_A_MATCH) q = q.replace(no, " ");
        for (Map.Entry<String, String> e : keywords.entrySet()) {
            if (e.getKey().length() >= 2 && q.contains(e.getKey())) return e.getValue();
        }
        return null;
    }

    /** Buttons that start a download on an app store page. */
    private static final String[] INSTALL_BUTTONS = {"설치", "설치하기", "다운로드", "받기", "Install", "INSTALL", "Get", "GET"};

    /**
     * If the screen is a store page (or list) offering to install a blocked community app, returns the
     * community's name. Needs an install button on screen and the app's name in the upper part.
     * @param keywords normalized name / nickname -> community name
     */
    static String matchAppPage(java.util.List<AppScreens.ScreenText> items, Map<String, String> keywords) {
        boolean install = false;
        for (AppScreens.ScreenText s : items) {
            String t = s.text.trim();
            for (String b : INSTALL_BUTTONS) {
                if (t.equals(b)) {
                    install = true;
                    break;
                }
            }
            if (install) break;
        }
        if (!install) return null;
        for (AppScreens.ScreenText s : items) {
            if (!s.top) continue;
            String n = normalize(s.text);
            if (n.isEmpty() || n.length() > 60) continue;  // app names are short; skip descriptions
            String exact = keywords.get(n);
            if (exact != null) return exact;               // e.g. the app called just "X"
            String hit = match(s.text, keywords);
            if (hit != null) return hit;
        }
        return null;
    }

    private StoreSearch() {
    }
}
