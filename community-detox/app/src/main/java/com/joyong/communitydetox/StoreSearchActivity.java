package com.joyong.communitydetox;

import android.app.Activity;
import android.os.Bundle;
import android.text.InputType;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * "플레이스토어 검색 막기" settings. Unlike the block list, everything here can be changed freely,
 * also during a focus lock.
 */
public class StoreSearchActivity extends Activity {

    private Ui ui;
    private ScrollView scroll;
    private LinearLayout content;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ui = new Ui(this);
        LinearLayout root = ui.column();

        LinearLayout bar = ui.row();
        bar.addView(ui.button("←", false, v -> finish()));
        bar.addView(ui.text("🔍 플레이스토어 검색 막기", 20, ui.text, true), Ui.weight(ui.dp(12)));
        root.addView(bar);

        content = ui.column();
        scroll = new ScrollView(this);
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        ui.applySystemBarPadding(this, root, ui.dp(16));
        setContentView(root);
    }

    @Override
    protected void onResume() {
        super.onResume();
        render();
    }

    private void render() {
        final int y = scroll.getScrollY();
        content.removeAllViews();
        boolean on = Prefs.isStoreSearchOn(this);

        // on / off
        LinearLayout top = ui.card();
        if (on) top.setBackground(ui.rounded(ui.accentSoft, 20));
        LinearLayout r = ui.row();
        LinearLayout texts = ui.column();
        texts.addView(ui.text("검색 막기 켜기", 16, ui.text, true));
        texts.addView(ui.text(on ? "✅ 켜져 있어요" : "꺼져 있어요", 12, ui.sub, false));
        r.addView(texts, Ui.weight(0));
        Switch sw = new Switch(this);
        sw.setChecked(on);
        sw.setOnCheckedChangeListener((b, checked) -> {
            Prefs.setStoreSearchOn(this, checked);
            render();
        });
        r.addView(sw);
        top.addView(r);
        top.addView(ui.body("체크한 커뮤니티의 이름·별명(예: 디시, 펨코, 에타, reddit)을 검색창에 쓰면 바로 지워지고, "
                + "검색 결과 화면은 닫혀요. 플레이스토어·갤럭시 스토어·원스토어에 적용돼요.\n"
                + "이 화면의 설정은 집중 디톡스 중에도 자유롭게 바꿀 수 있어요."), Ui.wrap(ui.dp(8)));
        content.addView(top);

        wordsCard();

        // quick selection
        LinearLayout quick = ui.card();
        quick.addView(ui.title("커뮤니티 고르기"));
        Set<String> picked = Prefs.storeSelected(this);
        quick.addView(ui.body(picked.size() + "곳 체크됨 · 처음에는 차단 목록과 같아요"));
        LinearLayout qr = ui.row();
        qr.addView(ui.button("차단 목록과 같게", false, v -> {
            Prefs.resetStoreSelected(this);
            render();
        }));
        LinearLayout.LayoutParams lp = Ui.wrap(0);
        lp.leftMargin = ui.dp(6);
        qr.addView(ui.button("전체 체크", false, v -> {
            Set<String> all = new HashSet<>();
            for (Catalog.Entry e : Catalog.ALL) all.add(e.id);
            Prefs.setStoreSelected(this, all);
            render();
        }), lp);
        LinearLayout.LayoutParams lp2 = Ui.wrap(0);
        lp2.leftMargin = ui.dp(6);
        qr.addView(ui.button("전체 해제", false, v -> {
            Prefs.setStoreSelected(this, new HashSet<>());
            render();
        }), lp2);
        quick.addView(qr, Ui.fill(ui.dp(10)));
        content.addView(quick);

        for (String category : Catalog.CATEGORIES) categoryCard(category, picked);
        scroll.post(() -> scroll.scrollTo(0, y));
    }

    private void wordsCard() {
        LinearLayout c = ui.card();
        c.addView(ui.title("✏️ 직접 넣은 단어"));
        c.addView(ui.body("목록에 없는 단어도 막을 수 있어요. 예: 토스증권, 주식, 코인"));
        LinearLayout r = ui.row();
        EditText input = new EditText(this);
        input.setHint("막을 단어");
        input.setSingleLine(true);
        input.setTextColor(ui.text);
        input.setHintTextColor(ui.sub);
        input.setInputType(InputType.TYPE_CLASS_TEXT);
        input.setImeOptions(EditorInfo.IME_ACTION_DONE);
        r.addView(input, Ui.weight(0));
        Runnable add = () -> {
            String w = input.getText().toString().trim();
            if (StoreSearch.normalize(w).length() < 2) {
                Toast.makeText(this, "두 글자 이상 넣어 주세요", Toast.LENGTH_SHORT).show();
                return;
            }
            Prefs.addStoreWord(this, w);
            render();
        };
        input.setOnEditorActionListener((v, id, ev) -> {
            add.run();
            return true;
        });
        LinearLayout.LayoutParams lp = Ui.wrap(0);
        lp.leftMargin = ui.dp(8);
        r.addView(ui.button("추가", true, v -> add.run()), lp);
        c.addView(r, Ui.fill(ui.dp(8)));

        List<String> words = new ArrayList<>(Prefs.storeWords(this));
        Collections.sort(words);
        for (String w : words) {
            LinearLayout row = ui.row();
            row.setBackground(ui.rounded(ui.accentSoft, 12));
            row.setPadding(ui.dp(12), ui.dp(4), ui.dp(4), ui.dp(4));
            row.addView(ui.text(w, 15, ui.text, true), Ui.weight(0));
            Button x = ui.button("✕", false, v -> {
                Prefs.removeStoreWord(this, w);
                render();
            });
            x.setBackground(null);
            row.addView(x);
            c.addView(row, Ui.fill(ui.dp(6)));
        }
        content.addView(c);
    }

    private void categoryCard(String category, Set<String> picked) {
        LinearLayout c = ui.card();
        c.addView(ui.text(category, 16, ui.text, true));
        for (Catalog.Entry e : Catalog.inCategory(category)) {
            CheckBox cb = new CheckBox(this);
            String words = String.join(", ", e.searchKeywords());
            android.text.SpannableString s = new android.text.SpannableString(e.name + "\n" + words);
            s.setSpan(new android.text.style.ForegroundColorSpan(ui.sub), e.name.length() + 1, s.length(), 0);
            s.setSpan(new android.text.style.RelativeSizeSpan(0.82f), e.name.length() + 1, s.length(), 0);
            cb.setText(s);
            cb.setTextColor(ui.text);
            cb.setTextSize(15);
            cb.setPadding(ui.dp(8), ui.dp(6), 0, ui.dp(6));
            cb.setChecked(picked.contains(e.id));
            cb.setOnCheckedChangeListener((b, checked) -> {
                Set<String> now = Prefs.storeSelected(this);
                if (checked) now.add(e.id);
                else now.remove(e.id);
                Prefs.setStoreSelected(this, now);
            });
            c.addView(cb, Ui.fill(ui.dp(4)));
        }
        content.addView(c);
    }
}
