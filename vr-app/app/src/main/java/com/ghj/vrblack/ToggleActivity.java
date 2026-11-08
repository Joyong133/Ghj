package com.ghj.vrblack;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Toast;

/**
 * 보이지 않는 화면. 타일을 눌렀을 때 앱이 '앞에 있는' 상태에서 검은 화면 서비스를 시작하려고
 * 잠깐 열렸다가 바로 닫힙니다.
 */
public class ToggleActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!Settings.canDrawOverlays(this)) {
            Toast.makeText(this, R.string.need_permission_toast, Toast.LENGTH_LONG).show();
            startActivity(new Intent(this, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } else if (OverlayService.running) {
            OverlayService.stop(this);
        } else {
            OverlayService.start(this, 0);
        }
        finish();
        overridePendingTransition(0, 0);
    }
}
