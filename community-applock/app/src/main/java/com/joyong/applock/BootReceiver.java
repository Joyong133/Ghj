package com.joyong.applock;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Turns "find by connection" back on after a restart or an update. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Store.isVpnOn(context)) FinderVpn.start(context);
    }
}
