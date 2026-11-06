package com.joyong.communitydetox;

import java.util.Locale;
import java.util.Map;

/** Matching typed search text against blocked keywords (app stores). Pure Java, testable. */
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

    private StoreSearch() {
    }
}
