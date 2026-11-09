package com.ghj.japantv;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.widget.EditText;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.checkbox.MaterialCheckBox;
import com.google.android.material.chip.ChipGroup;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.android.material.progressindicator.LinearProgressIndicator;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class MainActivity extends AppCompatActivity {
    private static final int[] GOAL_OPTIONS_MIN = {30, 60, 90, 120, 180, 240};

    private ChannelStore store;
    private Prefs prefs;
    private final List<Channel> channels = new ArrayList<>();
    /** 지금 고른 분류(전체/뉴스/드라마/내 채널)에 맞는 채널만 */
    private final List<Channel> visible = new ArrayList<>();
    private String filter = null;
    private ChannelAdapter adapter;

    private TextView todayText;
    private TextView totalText;
    private TextView streakText;
    private LinearProgressIndicator goalProgress;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        setSupportActionBar(findViewById(R.id.toolbar));

        store = new ChannelStore(this);
        prefs = new Prefs(this);

        todayText = findViewById(R.id.todayText);
        totalText = findViewById(R.id.totalText);
        streakText = findViewById(R.id.streakText);
        goalProgress = findViewById(R.id.goalProgress);

        RecyclerView list = findViewById(R.id.channelList);
        list.setLayoutManager(new LinearLayoutManager(this));
        adapter = new ChannelAdapter(visible, this::play, this::showChannelMenu);
        list.setAdapter(adapter);

        findViewById(R.id.addButton).setOnClickListener(v -> showEditDialog(null));

        channels.addAll(store.load());

        ChipGroup chips = findViewById(R.id.filterChips);
        chips.setOnCheckedStateChangeListener((group, ids) -> {
            int id = ids.isEmpty() ? R.id.chipAll : ids.get(0);
            if (id == R.id.chipNews) filter = Channel.CAT_NEWS;
            else if (id == R.id.chipDrama) filter = Channel.CAT_DRAMA;
            else if (id == R.id.chipCam) filter = Channel.CAT_CAM;
            else if (id == R.id.chipCustom) filter = Channel.CAT_CUSTOM;
            else filter = null;
            refreshList();
        });
        refreshList();

        // 앱을 새로 켰을 때만 마지막 채널을 바로 틀어 줍니다 (TV처럼).
        if (savedInstanceState == null && prefs.isAutoResume()) {
            String last = prefs.getLastChannelId();
            Channel c = find(last);
            if (c != null) play(c);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateStats();
        adapter.setLastId(prefs.getLastChannelId());
        refreshList();
    }

    @SuppressLint("NotifyDataSetChanged")
    private void refreshList() {
        visible.clear();
        for (Channel c : channels) {
            if (filter == null || filter.equals(c.category)) visible.add(c);
        }
        adapter.notifyDataSetChanged();
    }

    private void play(Channel c) {
        PlayerActivity.start(this, c.id);
    }

    @Nullable
    private Channel find(@Nullable String id) {
        if (id == null) return null;
        for (Channel c : channels) {
            if (c.id.equals(id)) return c;
        }
        return null;
    }

    private void updateStats() {
        long today = WatchStats.today(this);
        long goalMs = prefs.getDailyGoalMinutes() * 60_000L;
        todayText.setText(WatchStats.format(today) + "  /  목표 " + WatchStats.format(goalMs));
        goalProgress.setMax(1000);
        goalProgress.setProgress((int) Math.min(1000, today * 1000 / Math.max(1, goalMs)));
        totalText.setText("지금까지 모두 " + WatchStats.format(WatchStats.total(this)) + " 들었어요"
                + (today >= goalMs ? "  ·  오늘 목표 달성! 🎉" : ""));
        int streak = WatchStats.streak(this);
        streakText.setText(streak > 0 ? "🔥 " + streak + "일 연속" : "오늘부터 시작!");
    }

    // ---------------- 메뉴 ----------------

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        getMenuInflater().inflate(R.menu.main_menu, menu);
        return true;
    }

    @Override
    public boolean onPrepareOptionsMenu(Menu menu) {
        menu.findItem(R.id.action_auto_resume).setChecked(prefs.isAutoResume());
        menu.findItem(R.id.action_pip).setChecked(prefs.isPipEnabled());
        return super.onPrepareOptionsMenu(menu);
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        int id = item.getItemId();
        if (id == R.id.action_help) {
            showHelp();
            return true;
        } else if (id == R.id.action_goal) {
            showGoalDialog();
            return true;
        } else if (id == R.id.action_auto_resume) {
            boolean v = !item.isChecked();
            item.setChecked(v);
            prefs.setAutoResume(v);
            toast(v ? "앱을 켜면 마지막 채널이 바로 나와요" : "앱을 켜면 채널 목록부터 보여요");
            return true;
        } else if (id == R.id.action_pip) {
            boolean v = !item.isChecked();
            item.setChecked(v);
            prefs.setPipEnabled(v);
            toast(v ? "홈 버튼을 누르면 작은 화면으로 계속 재생돼요" : "홈 버튼을 누르면 재생이 멈춰요");
            return true;
        } else if (id == R.id.action_restore) {
            int added = store.restoreDefaults(channels);
            refreshList();
            toast(added > 0 ? "기본 채널 " + added + "개를 다시 넣었어요" : "기본 채널이 이미 모두 있어요");
            return true;
        }
        return super.onOptionsItemSelected(item);
    }

    private void showHelp() {
        new MaterialAlertDialogBuilder(this)
                .setTitle("사용법")
                .setMessage(getString(R.string.help_text))
                .setPositiveButton("확인", null)
                .show();
    }

    private void showGoalDialog() {
        String[] labels = new String[GOAL_OPTIONS_MIN.length];
        int checked = 1;
        for (int i = 0; i < GOAL_OPTIONS_MIN.length; i++) {
            labels[i] = WatchStats.format(GOAL_OPTIONS_MIN[i] * 60_000L);
            if (GOAL_OPTIONS_MIN[i] == prefs.getDailyGoalMinutes()) checked = i;
        }
        new MaterialAlertDialogBuilder(this)
                .setTitle("하루 목표 시청 시간")
                .setSingleChoiceItems(labels, checked, (d, which) -> {
                    prefs.setDailyGoalMinutes(GOAL_OPTIONS_MIN[which]);
                    updateStats();
                    d.dismiss();
                })
                .setNegativeButton("취소", null)
                .show();
    }

    // ---------------- 채널 편집 ----------------

    private void showChannelMenu(Channel c) {
        String[] options = {"▶  재생", "✏️  수정", "⬆  위로 옮기기", "⬇  아래로 옮기기", "🗑  삭제"};
        new MaterialAlertDialogBuilder(this)
                .setTitle(c.icon + "  " + c.name)
                .setItems(options, (d, which) -> {
                    switch (which) {
                        case 0:
                            play(c);
                            break;
                        case 1:
                            showEditDialog(c);
                            break;
                        case 2:
                            move(c, -1);
                            break;
                        case 3:
                            move(c, 1);
                            break;
                        default:
                            confirmDelete(c);
                            break;
                    }
                })
                .show();
    }

    private void move(Channel c, int delta) {
        // 보이는 목록에서 바로 옆 채널과 자리를 바꿉니다.
        int vi = visible.indexOf(c);
        int vj = vi + delta;
        if (vi < 0 || vj < 0 || vj >= visible.size()) return;
        int i = channels.indexOf(c);
        int j = channels.indexOf(visible.get(vj));
        if (i < 0 || j < 0) return;
        Collections.swap(channels, i, j);
        store.save(channels);
        refreshList();
    }

    private void confirmDelete(Channel c) {
        new MaterialAlertDialogBuilder(this)
                .setTitle("채널 삭제")
                .setMessage("'" + c.name + "' 채널을 지울까요?"
                        + (c.builtIn ? "\n(기본 채널은 메뉴의 '기본 채널 다시 넣기'로 되살릴 수 있어요)" : ""))
                .setPositiveButton("삭제", (d, w) -> {
                    channels.remove(c);
                    store.save(channels);
                    refreshList();
                })
                .setNegativeButton("취소", null)
                .show();
    }

    private void showEditDialog(@Nullable Channel existing) {
        @SuppressLint("InflateParams")
        View view = getLayoutInflater().inflate(R.layout.dialog_channel, null);
        EditText nameIn = view.findViewById(R.id.inputName);
        EditText urlIn = view.findViewById(R.id.inputUrl);
        EditText descIn = view.findViewById(R.id.inputDesc);
        MaterialCheckBox streamCheck = view.findViewById(R.id.checkStream);
        RadioGroup categoryGroup = view.findViewById(R.id.categoryGroup);
        String startCategory = existing != null ? existing.category : (filter != null ? filter : Channel.CAT_CUSTOM);
        categoryGroup.check(Channel.CAT_NEWS.equals(startCategory) ? R.id.catNews
                : Channel.CAT_DRAMA.equals(startCategory) ? R.id.catDrama
                : Channel.CAT_CAM.equals(startCategory) ? R.id.catCam : R.id.catCustom);

        if (existing != null) {
            nameIn.setText(existing.name);
            urlIn.setText(existing.url);
            descIn.setText(existing.description);
            streamCheck.setChecked(existing.isStream());
        }
        urlIn.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
            }

            @Override
            public void afterTextChanged(Editable s) {
                if (ChannelStore.looksLikeStream(s.toString())) streamCheck.setChecked(true);
            }
        });

        AlertDialog dialog = new MaterialAlertDialogBuilder(this)
                .setTitle(existing == null ? "채널 추가" : "채널 수정")
                .setView(view)
                .setPositiveButton("저장", null)
                .setNegativeButton("취소", null)
                .create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String raw = text(urlIn);
            if (raw.isEmpty()) {
                urlIn.setError("주소를 입력해 주세요");
                return;
            }
            String url = ChannelStore.normalizeUrl(raw);
            String name = text(nameIn);
            if (name.isEmpty()) name = url;
            Channel updated = new Channel(
                    existing != null ? existing.id : "user_" + System.currentTimeMillis(),
                    name,
                    text(descIn),
                    url,
                    streamCheck.isChecked() ? Channel.KIND_STREAM : Channel.KIND_WEB,
                    existing != null ? existing.icon : "📺",
                    existing != null && existing.builtIn,
                    categoryOf(categoryGroup.getCheckedRadioButtonId()));
            int idx = existing != null ? channels.indexOf(existing) : -1;
            if (idx >= 0) channels.set(idx, updated);
            else channels.add(updated);
            store.save(channels);
            refreshList();
            dialog.dismiss();
        }));
        dialog.show();
    }

    private static String categoryOf(int radioId) {
        if (radioId == R.id.catNews) return Channel.CAT_NEWS;
        if (radioId == R.id.catDrama) return Channel.CAT_DRAMA;
        if (radioId == R.id.catCam) return Channel.CAT_CAM;
        return Channel.CAT_CUSTOM;
    }

    private static String text(EditText e) {
        return e.getText() == null ? "" : e.getText().toString().trim();
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }
}
