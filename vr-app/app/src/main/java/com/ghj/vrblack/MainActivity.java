package com.ghj.vrblack;

import android.Manifest;
import android.app.Activity;
import android.app.StatusBarManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {

    private TextView permStatus;
    private Button permButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        permStatus = findViewById(R.id.perm_status);
        permButton = findViewById(R.id.perm_button);
        Button addTile = findViewById(R.id.add_tile);
        Button startNow = findViewById(R.id.start_now);
        Button startDelayed = findViewById(R.id.start_delayed);

        permButton.setOnClickListener(v -> openOverlaySettings());

        if (Build.VERSION.SDK_INT >= 33) {
            addTile.setOnClickListener(v -> requestAddTile());
        } else {
            addTile.setVisibility(View.GONE);
        }

        startNow.setOnClickListener(v -> {
            if (ensurePermission()) {
                OverlayService.start(this, 0);
            }
        });

        startDelayed.setOnClickListener(v -> {
            if (ensurePermission()) {
                OverlayService.start(this, 10_000);
                Toast.makeText(this, R.string.delayed_toast, Toast.LENGTH_LONG).show();
                moveTaskToBack(true);
            }
        });

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        boolean granted = Settings.canDrawOverlays(this);
        permStatus.setText(granted ? R.string.perm_ok : R.string.perm_needed);
        permButton.setVisibility(granted ? View.GONE : View.VISIBLE);
    }

    private boolean ensurePermission() {
        if (Settings.canDrawOverlays(this)) {
            return true;
        }
        Toast.makeText(this, R.string.need_permission_toast, Toast.LENGTH_SHORT).show();
        openOverlaySettings();
        return false;
    }

    private void openOverlaySettings() {
        Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getPackageName()));
        try {
            startActivity(intent);
        } catch (RuntimeException e) {
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION));
        }
    }

    private void requestAddTile() {
        if (Build.VERSION.SDK_INT < 33) {
            return;
        }
        StatusBarManager sbm = getSystemService(StatusBarManager.class);
        sbm.requestAddTileService(
                new ComponentName(this, BlackTileService.class),
                getString(R.string.tile_label),
                Icon.createWithResource(this, R.drawable.ic_tile),
                getMainExecutor(),
                result -> { });
    }
}
