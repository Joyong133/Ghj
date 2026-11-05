package com.joyong.communitydetox;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Being an active device admin means Android won't uninstall the app until the admin is
 * turned off first. During a focus lock, the accessibility service closes that screen.
 */
public class DetoxAdminReceiver extends DeviceAdminReceiver {

    @Override
    public CharSequence onDisableRequested(Context context, Intent intent) {
        return Prefs.isLocked(context)
                ? "집중 디톡스 중이에요. 끝나기 전에는 삭제 방지를 끌 수 없어요."
                : "삭제 방지를 끄면 Digital Detox를 바로 지울 수 있게 돼요.";
    }
}
