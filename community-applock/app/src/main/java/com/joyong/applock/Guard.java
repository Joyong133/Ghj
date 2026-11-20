package com.joyong.applock;

import java.util.List;

/**
 * During detox time, closes only the screens that could switch this app off or remove it:
 * its uninstall dialog, its app-info page (force stop / uninstall), its accessibility page or
 * "stop?" dialog, the page that turns off its uninstall protection, and its VPN disconnect page.
 * Lists that merely show this app among others (e.g. other apps' accessibility services) stay usable.
 */
final class Guard {

    private static final String[] UNINSTALL_WORDS = {"삭제", "제거", "uninstall", "Uninstall", "UNINSTALL"};
    private static final String[] APP_INFO_WORDS = {"강제 중지", "강제 종료", "강제종료", "Force stop", "FORCE STOP"};
    private static final String[] TOGGLE_WORDS = {"사용", "중지", "끄", "Use ", "Stop", "Turn off"};
    private static final String[] VPN_WORDS = {"연결 해제", "연결 끊기", "VPN 삭제", "VPN 해제", "VPN 잊기",
            "Disconnect", "DISCONNECT", "Forget", "FORGET"};

    static boolean isSettingsPackage(String pkg) {
        return pkg.equals("com.android.settings")
                || pkg.contains("settings")             // e.g. com.samsung.android.settings, settings search
                || pkg.contains("packageinstaller")     // uninstall confirmation dialogs
                || pkg.equals("com.samsung.accessibility")
                || pkg.contains("securitycenter")       // Xiaomi app management
                || pkg.contains("safecenter")           // OPPO / OnePlus app management
                || pkg.contains("vpndialogs")           // the VPN "disconnect?" popup
                || pkg.equals("com.oculus.systemux")    // Meta Quest settings panels
                || pkg.equals("com.oculus.vrshell");
    }

    static boolean shouldClose(List<String> texts, boolean installer, boolean vpnDialog, String appLabel,
                               String serviceDesc, String adminDesc) {
        boolean mentionsUs = false;
        for (String t : texts) {
            if (t.contains(appLabel)) {
                mentionsUs = true;
                break;
            }
        }
        if (!mentionsUs) return false;
        if (installer) return otherTextHas(texts, appLabel, UNINSTALL_WORDS); // updates stay allowed
        if (vpnDialog) return true;
        for (String t : texts) {
            if (!serviceDesc.isEmpty() && t.contains(serviceDesc)) return true; // our accessibility page
            if (!adminDesc.isEmpty() && t.contains(adminDesc)) return true;     // our device-admin page
            if (t.contains(appLabel) && !t.trim().equals(appLabel)) {           // "… 사용" switch, "… 중지할까요?"
                for (String w : TOGGLE_WORDS) {
                    if (t.contains(w)) return true;
                }
            }
        }
        return otherTextHas(texts, appLabel, APP_INFO_WORDS) || otherTextHas(texts, appLabel, VPN_WORDS);
    }

    private static boolean otherTextHas(List<String> texts, String appLabel, String[] words) {
        for (String t : texts) {
            if (t.contains(appLabel)) continue;
            for (String w : words) {
                if (t.contains(w)) return true;
            }
        }
        return false;
    }

    /** The first words of a long description: enough to recognise it even if Settings shortens it. */
    static String snippet(String s) {
        return s.length() > 18 ? s.substring(0, 18) : s;
    }

    private Guard() {
    }
}
