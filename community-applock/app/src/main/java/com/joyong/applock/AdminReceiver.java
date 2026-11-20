package com.joyong.applock;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Being an active device admin means Android won't uninstall the app until the admin is turned off
 * first. During detox time the lock service also closes the screen that turns it off.
 */
public class AdminReceiver extends DeviceAdminReceiver {

    @Override
    public CharSequence onDisableRequested(Context context, Intent intent) {
        return Store.isDetox(context)
                ? "디톡스 시간이에요. 끝나기 전에는 삭제 방지를 끌 수 없어요."
                : "삭제 방지를 끄면 커뮤니티 앱 잠금을 바로 지울 수 있게 돼요.";
    }
}
