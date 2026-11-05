package com.joyong.mutetimer;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.NumberPicker;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {

    private NumberPicker hourPicker;
    private NumberPicker minutePicker;
    private CheckBox pauseAppsBox;
    private TextView statusText;
    private Button stopButton;
    private SharedPreferences prefs;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private final Runnable refresh = new Runnable() {
        @Override
        public void run() {
            updateStatus();
            handler.postDelayed(this, 1000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        prefs = getSharedPreferences(MuteService.PREFS, MODE_PRIVATE);

        hourPicker = findViewById(R.id.hourPicker);
        minutePicker = findViewById(R.id.minutePicker);
        pauseAppsBox = findViewById(R.id.pauseApps);
        statusText = findViewById(R.id.statusText);
        stopButton = findViewById(R.id.stopButton);

        hourPicker.setMinValue(0);
        hourPicker.setMaxValue(23);
        minutePicker.setMinValue(0);
        minutePicker.setMaxValue(59);
        minutePicker.setFormatter(v -> String.format(java.util.Locale.US, "%02d", v));
        hourPicker.setValue(0);
        minutePicker.setValue(30);

        bindPreset(R.id.preset10, 10);
        bindPreset(R.id.preset30, 30);
        bindPreset(R.id.preset60, 60);
        bindPreset(R.id.preset120, 120);

        findViewById(R.id.startButton).setOnClickListener(v -> startBlock());
        stopButton.setOnClickListener(v -> stopBlock());

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    private void bindPreset(int id, int minutes) {
        findViewById(id).setOnClickListener(v -> {
            hourPicker.setValue(minutes / 60);
            minutePicker.setValue(minutes % 60);
        });
    }

    private void startBlock() {
        int minutes = hourPicker.getValue() * 60 + minutePicker.getValue();
        if (minutes <= 0) {
            Toast.makeText(this, R.string.need_time, Toast.LENGTH_SHORT).show();
            return;
        }
        Intent i = new Intent(this, MuteService.class)
                .setAction(MuteService.ACTION_START)
                .putExtra(MuteService.EXTRA_MINUTES, minutes)
                .putExtra(MuteService.EXTRA_PAUSE_APPS, pauseAppsBox.isChecked());
        startForegroundService(i);
        Toast.makeText(this, getString(R.string.started_fmt, minutes), Toast.LENGTH_SHORT).show();
        handler.postDelayed(this::updateStatus, 200);
    }

    private void stopBlock() {
        Intent i = new Intent(this, MuteService.class).setAction(MuteService.ACTION_STOP);
        startForegroundService(i);
        handler.postDelayed(this::updateStatus, 200);
    }

    private void updateStatus() {
        long endAt = prefs.getLong(MuteService.KEY_END_AT, 0);
        long remaining = endAt - System.currentTimeMillis();
        if (endAt > 0 && remaining > 0) {
            statusText.setText(getString(R.string.status_on_fmt, MuteService.formatDuration(remaining)));
            statusText.setActivated(true);
            stopButton.setVisibility(View.VISIBLE);
        } else {
            statusText.setText(R.string.status_off);
            statusText.setActivated(false);
            stopButton.setVisibility(View.GONE);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        handler.post(refresh);
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(refresh);
        super.onPause();
    }
}
