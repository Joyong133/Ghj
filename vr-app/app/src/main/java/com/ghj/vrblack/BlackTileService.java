package com.ghj.vrblack;

import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/** 알림창 빠른 설정의 '검은 화면' 타일. 누르면 켜고, 다시 누르면 끕니다. */
public class BlackTileService extends TileService {

    @Override
    public void onStartListening() {
        updateTile();
    }

    @Override
    public void onClick() {
        if (OverlayService.running) {
            OverlayService.stop(this);
            updateTile();
            return;
        }
        // 투명한 화면을 잠깐 열어서 켭니다. 투명 화면이라 아래 유튜브는 멈추지 않습니다.
        Intent intent = new Intent(this, ToggleActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        launch(intent);
    }

    @SuppressLint("StartActivityAndCollapseDeprecated")
    @SuppressWarnings("deprecation")
    private void launch(Intent intent) {
        if (Build.VERSION.SDK_INT >= 34) {
            PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            startActivityAndCollapse(pi);
        } else {
            startActivityAndCollapse(intent);
        }
    }

    private void updateTile() {
        Tile tile = getQsTile();
        if (tile == null) {
            return;
        }
        tile.setState(OverlayService.running ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        tile.updateTile();
    }
}
