package com.joyong.applock;

import java.util.Locale;
import java.util.Map;

/** Matching app names / typed text against community names and nicknames. Pure Java, testable. */
final class Keywords {

    /** Words that contain a keyword but mean something else ("인벤토리" contains "인벤"). */
    private static final String[] NOT_A_MATCH = {"인벤토리", "inventory"};

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
        java.util.Set<String> words = null;
        for (Map.Entry<String, String> e : keywords.entrySet()) {
            String k = e.getKey();
            if (k.length() < 2) continue;
            if (k.length() < 6 && k.matches("[a-z0-9]+")) {
                // Short English words only as whole words: "clien" must not match "client", "inven" not "inventory".
                if (words == null) words = words(typed);
                if (words.contains(k)) return e.getValue();
            } else if (q.contains(k)) {
                return e.getValue();
            }
        }
        return null;
    }

    private static java.util.Set<String> words(CharSequence text) {
        java.util.Set<String> out = new java.util.HashSet<>();
        for (String w : text.toString().toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+")) {
            if (!w.isEmpty()) out.add(w);
        }
        return out;
    }

    private Keywords() {
    }
}
