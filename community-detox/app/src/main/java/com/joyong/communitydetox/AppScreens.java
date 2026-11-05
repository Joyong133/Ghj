package com.joyong.communitydetox;

import java.util.List;

/**
 * Recognises specific screens inside an app (not the whole app), e.g. the securities (증권) part
 * of the Toss app. Works on the texts the app exposes to accessibility; pure Java so it can be tested.
 */
final class AppScreens {

    static final String TOSS = "viva.republica.toss";

    /** One piece of text on screen and where / how it appears. */
    static final class ScreenText {
        final String text;
        final boolean selected;  // the node or its container is the selected tab
        final boolean top;       // in the top ~18% of the screen (title bar)
        final boolean bottom;    // in the bottom ~15% of the screen (tab bar)

        ScreenText(String text, boolean selected, boolean top, boolean bottom) {
            this.text = text;
            this.selected = selected;
            this.top = top;
            this.bottom = bottom;
        }
    }

    /**
     * True when the Toss app shows its securities part:
     *  - the "증권" tab in the bottom tab bar is the selected one, or
     *  - the title bar says 토스증권, or
     *  - a stock order screen (both "구매하기" and "판매하기" buttons) is open.
     * A "토스증권" banner or the unselected "증권" tab on the home screen does not count.
     */
    static boolean isTossInvest(List<ScreenText> items) {
        boolean buy = false, sell = false;
        for (ScreenText s : items) {
            String t = s.text.trim();
            if (s.bottom && t.contains("증권") && t.length() <= 20
                    && (s.selected || t.contains("선택됨") || t.contains("selected"))) {
                return true;
            }
            if (s.top && t.startsWith("토스증권")) return true;
            if (t.equals("구매하기")) buy = true;
            if (t.equals("판매하기")) sell = true;
        }
        return buy && sell;
    }

    private AppScreens() {
    }
}
