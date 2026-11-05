package com.joyong.communitydetox;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Turns network blocking back on after the device restarts or the app is updated. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Prefs.isVpnOn(context)) DetoxVpnService.start(context);
    }
}
