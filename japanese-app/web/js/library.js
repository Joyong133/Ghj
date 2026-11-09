/* 도서관(사전) 탭: 가나표, 한자 사전, 단어장, 문법 가이드, 표현집 */
(function (G) {
  'use strict';
  const U = G.U, h = U.h, APP = G.APP;

  APP.screens.library = function (el) {
    const C = G.COURSE;
    el.appendChild(h('div', { class: 'h-title', text: '📚 사전 · 도서관' }));
    el.appendChild(h('div', { class: 'h-sub', text: '모든 학습 자료를 한곳에서 찾아보세요' }));
    const inp = h('input', { class: 'search', placeholder: '🔍 한국어·일본어·로마자로 검색 (예: 먹다, たべる, taberu)' });
    el.appendChild(inp);
    const results = h('div');
    el.appendChild(results);
    const grid = h('div', { class: 'grid-cards' },
      card('あ', '히라가나 표', G.KANA.all.length / 2 + '자 · 발음·쓰기', function () { APP.push(kanaChart, '히라가나', 'h'); }),
      card('ア', '가타카나 표', '외래어 확장음 포함', function () { APP.push(kanaChart, '가타카나', 'k'); }),
      card('漢', '한자 사전', C.kanji.length + '자 · N5~N3 훈음', function () { APP.push(kanjiList, '한자 사전'); }),
      card('📘', '단어장', C.words.length + '개 단어', function () { APP.push(wordList, '단어장'); }),
      card('📗', '문법 가이드', C.tips.length + '개 문법 해설', function () { APP.push(grammarList, '문법 가이드'); }),
      card('💬', '표현집', C.sents.length + '개 예문 + 음성', function () { APP.push(phraseList, '표현집'); }),
      card('📌', '저장한 문장', APP.state.saved.length + '개', function () { APP.push(savedList, '저장한 문장'); }),
      card('🔢', '숫자·조수사 표', '읽기 규칙 정리', function () { APP.push(numberRef, '숫자·조수사'); }),
      card('🔄', '활용표', '동사·형용사 활용 정리', function () { APP.push(conjRef, '활용표'); }),
      card('🗓️', '날짜·시간 표', '月·日·時·分 읽기', function () { APP.push(dateRef, '날짜·시간'); })
    );
    el.appendChild(grid);
    inp.addEventListener('input', function () {
      const q = inp.value.trim();
      results.innerHTML = '';
      grid.classList.toggle('hidden', !!q);
      if (!q) return;
      const kq = U.kanaInput(q, true);
      const hits = C.words.filter(function (w) {
        return w.m.indexOf(q) >= 0 || w.w.indexOf(q) >= 0 || w.r.indexOf(q) >= 0 || (kq !== q && (w.r.indexOf(kq) >= 0)) || U.romaji(w.r).indexOf(q.toLowerCase()) === 0;
      }).slice(0, 60);
      const kh = C.kanji.filter(function (k) { return k.c === q || k.hm.indexOf(q) >= 0 || k.on.join(',').indexOf(U.toKata(kq)) >= 0 && kq.length > 1; }).slice(0, 20);
      if (!hits.length && !kh.length) { results.appendChild(h('div', { class: 'empty-state' }, h('div', { class: 'ei', text: '🔍' }), h('div', { text: '검색 결과가 없어요' }))); return; }
      if (kh.length) {
        results.appendChild(h('div', { class: 'sec-label', text: '한자 ' + kh.length }));
        const g = h('div', { class: 'kanji-grid' });
        kh.forEach(function (k) { g.appendChild(kanjiCell(k)); });
        results.appendChild(g);
      }
      if (hits.length) {
        results.appendChild(h('div', { class: 'sec-label', text: '단어 ' + hits.length }));
        hits.forEach(function (w) { results.appendChild(wordRow(w, true)); });
      }
    });
  };
  function card(i, b, s, f) { return h('div', { class: 'gcard', onclick: f }, h('div', { class: 'gi jp', text: i }), h('b', { text: b }), h('span', { text: s })); }

  function wordRow(w, showUnit) {
    const u = G.COURSE.unitMap[w.u];
    const lv = APP.strength(w.id);
    const fav = APP.state.fav.indexOf(w.id) >= 0;
    const favBtn = h('button', { class: 'wb', text: fav ? '★' : '☆', style: { color: 'var(--yellow-d)' } });
    favBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const i = APP.state.fav.indexOf(w.id);
      if (i >= 0) APP.state.fav.splice(i, 1); else APP.state.fav.push(w.id);
      favBtn.textContent = i >= 0 ? '☆' : '★'; APP.save();
    });
    return h('div', { class: 'word-row' },
      h('span', { class: 'lvl-dot', style: { background: lv === 0 ? 'var(--line)' : lv < 0.4 ? '#ffc24d' : lv < 0.75 ? '#58cc02' : '#1cb0f6' }, title: '숙련도' }),
      h('div', { class: 'wj jp', html: U.wordRuby(w.w, w.r, true) }),
      h('div', { class: 'wm' }, h('span', { text: (w.e ? w.e + ' ' : '') + w.m }), h('small', { text: U.romaji(w.r) + (showUnit && u ? ' · ' + u.t : '') + posName(w.p) })),
      favBtn,
      h('button', { class: 'wb', text: '🔊', onclick: function () { U.tts.speak(w.r); } }));
  }
  const POS = { n: '명사', v5: '5단 동사', v1: '1단 동사', vs: 'する 동사', vk: '来る 동사', ai: 'い형용사', an: 'な형용사', adv: '부사', exp: '표현', pr: '대명사', q: '의문사', ctr: '조수사', num: '숫자', conj: '접속사', par: '조사', interj: '감탄사', suf: '접미사', pre: '접두사' };
  function posName(p) { return POS[p] ? ' · ' + POS[p] : ''; }
  APP.POS = POS;

  /* ---------- 가나표 ---------- */
  function kanaChart(el, script) {
    const K = G.KANA;
    const tabs = [['basic', '기본(청음)'], ['dak', '탁음·반탁음'], ['yoon', '요음'], ['ex', '확장음']].filter(function (t) { return script === 'k' || t[0] !== 'ex'; });
    let cur = 'basic';
    const chips = h('div', { class: 'chips', style: { padding: '12px 16px' } });
    const body = h('div');
    function draw() {
      chips.innerHTML = '';
      tabs.forEach(function (t) { chips.appendChild(h('span', { class: 'chip' + (cur === t[0] ? ' on' : ''), text: t[1], onclick: function () { cur = t[0]; draw(); } })); });
      body.innerHTML = '';
      const rows = { basic: ['a', 'k', 's', 't', 'n', 'h', 'm', 'y', 'r', 'w'], dak: ['g', 'z', 'd', 'b', 'p'], yoon: ['yk', 'ym'], ex: ['ex'] }[cur];
      const three = cur === 'yoon';
      const g = h('div', { class: 'kana-grid' + (three ? ' c3' : '') });
      rows.forEach(function (rk) {
        let list = K.rows[rk].slice();
        if (rk === 'y') list = [list[0], null, list[1], null, list[2]];
        if (rk === 'w') list = [list[0], null, null, null, list[1], list[2], null, null, null, null];
        if (rk === 'ex') { /* 그대로 */ }
        list.forEach(function (r) {
          if (!r) { g.appendChild(h('div', { class: 'kcell empty' })); return; }
          const ch = script === 'h' ? r[0] : r[1];
          const id = 'k:' + script + ':' + r[0];
          const lv = APP.strength(id);
          g.appendChild(h('div', { class: 'kcell', onclick: function () { kanaDetail(ch, r, script); } },
            h('div', { class: 'kc jp', text: ch }), h('div', { class: 'kr', text: r[2] }), h('div', { class: 'kbar' }, h('div', { style: { width: lv * 100 + '%' } }))));
        });
      });
      body.appendChild(g);
      body.appendChild(h('div', { class: 'pad' }, h('button', { class: 'btn', text: '이 표로 퀴즈 풀기', onclick: function () {
        const chars = []; rows.forEach(function (rk) { K.rows[rk].forEach(function (r) { chars.push({ id: 'k:' + script + ':' + r[0], c: script === 'h' ? r[0] : r[1], r: r[2], ko: r[3] }); }); });
        const items = [];
        U.shuffle(chars).slice(0, 15).forEach(function (c, i) { items.push([G.EX.kanaMC, G.EX.romajiMC, G.EX.kanaListen][i % 3](c, chars)); });
        G.LESSON.run({ title: '가나 퀴즈', items: items, mode: 'practice', xp: 8, onDone: APP.afterLesson, onQuit: APP.refresh });
      } })));
    }
    el.appendChild(chips); el.appendChild(body); draw();
  }
  function kanaDetail(ch, r, script) {
    const box = h('div', { class: 'center' });
    box.appendChild(h('div', { class: 'kana-big jp', text: ch }));
    box.appendChild(h('h2', { text: r[2] + ' · ' + r[3] }));
    box.appendChild(h('div', { class: 'sub jp', text: (script === 'h' ? '가타카나: ' + r[1] : '히라가나: ' + r[0]) }));
    if (script === 'h' && G.KANA.mnemo[r[0]]) box.appendChild(h('div', { class: 'card small', style: { marginBottom: '12px' }, text: '💡 ' + G.KANA.mnemo[r[0]] }));
    const ws = G.COURSE.words.filter(function (w) { return w.r.indexOf(script === 'h' ? r[0] : r[1]) >= 0 || w.w.indexOf(script === 'h' ? r[0] : r[1]) >= 0; }).slice(0, 4);
    ws.forEach(function (w) { box.appendChild(h('div', { class: 'word-row', style: { padding: '6px 0' } }, h('div', { class: 'wj jp', html: U.wordRuby(w.w, w.r, true) }), h('div', { class: 'wm', text: w.m }), h('button', { class: 'wb', text: '🔊', onclick: function () { U.tts.speak(w.r); } }))); });
    box.appendChild(h('div', { class: 'row', style: { marginTop: '12px' } },
      h('button', { class: 'btn blue', text: '🔊 듣기', onclick: function () { U.tts.speak(ch); } }),
      h('button', { class: 'btn', text: '✍️ 쓰기', onclick: function () { pop.remove(); G.LESSON.run({ title: '쓰기', items: [G.EX.kanaTrace({ id: 'k:' + script + ':' + r[0], c: ch, r: r[2], ko: r[3] }), G.EX.kanaTrace({ id: 'k:' + script + ':' + r[0], c: ch, r: r[2], ko: r[3] })], mode: 'practice', xp: 2, onDone: APP.refresh, onQuit: APP.refresh }); } })));
    const pop = APP.sheet(box);
    U.tts.speak(ch);
  }

  /* ---------- 한자 ---------- */
  function kanjiCell(k) {
    const lv = APP.strength(k.id);
    return h('div', { class: 'kcell', onclick: function () { kanjiDetail(k); } }, h('div', { class: 'kc jp', text: k.c }), h('div', { class: 'kr', text: k.hm }), h('div', { class: 'kbar' }, h('div', { style: { width: lv * 100 + '%' } })));
  }
  function kanjiList(el) {
    let lv = 5;
    const chips = h('div', { class: 'chips', style: { padding: '12px 16px' } });
    const body = h('div');
    function draw() {
      chips.innerHTML = '';
      [5, 4, 3].forEach(function (l) {
        const n = G.COURSE.kanji.filter(function (k) { return k.lv === l; }).length;
        chips.appendChild(h('span', { class: 'chip' + (lv === l ? ' on' : ''), text: 'N' + l + ' (' + n + ')', onclick: function () { lv = l; draw(); } }));
      });
      body.innerHTML = '';
      const ks = G.COURSE.kanji.filter(function (k) { return k.lv === lv; });
      const learned = ks.filter(function (k) { return APP.state.srs[k.id]; }).length;
      body.appendChild(h('div', { class: 'h-sub', style: { margin: '0 16px 10px' }, text: '학습 ' + learned + ' / ' + ks.length + '자' }));
      const g = h('div', { class: 'kanji-grid' });
      ks.forEach(function (k) { g.appendChild(kanjiCell(k)); });
      body.appendChild(g);
      body.appendChild(h('div', { class: 'pad' }, h('button', { class: 'btn', text: 'N' + lv + ' 한자 랜덤 퀴즈', onclick: function () {
        const items = []; U.shuffle(ks).slice(0, 15).forEach(function (k, i) { items.push([G.EX.kanjiMeaning, G.EX.kanjiFromMeaning, G.EX.kanjiReading][i % 3](k, ks)); });
        G.LESSON.run({ title: '한자 퀴즈', items: items, mode: 'practice', xp: 8, onDone: APP.afterLesson, onQuit: APP.refresh });
      } })));
    }
    el.appendChild(chips); el.appendChild(body); draw();
  }
  function kanjiDetail(k) {
    const box = h('div');
    box.appendChild(h('div', { class: 'center' }, h('div', { class: 'kana-big jp', text: k.c }), h('h2', { text: k.hm }), h('div', { class: 'sub', text: 'JLPT N' + k.lv })));
    box.appendChild(h('div', { class: 'card' }, h('div', { html: '<b>음독</b> <span class="jp">' + U.esc(k.on.join('・') || '-') + '</span>' }), h('div', { html: '<b>훈독</b> <span class="jp">' + U.esc(k.kun.join('・') || '-') + '</span>' })));
    if (k.ex.length) {
      box.appendChild(h('div', { class: 'sec-label', style: { margin: '14px 0 6px' }, text: '예시 단어' }));
      k.ex.forEach(function (e) { box.appendChild(h('div', { class: 'word-row', style: { padding: '8px 0' } }, h('div', { class: 'wj jp', html: U.wordRuby(e.w, e.r, true) }), h('div', { class: 'wm', text: e.m }), h('button', { class: 'wb', text: '🔊', onclick: function () { U.tts.speak(e.r); } }))); });
    }
    const others = G.COURSE.words.filter(function (w) { return w.w.indexOf(k.c) >= 0 && !k.ex.some(function (e) { return e.w === w.w; }); }).slice(0, 6);
    if (others.length) {
      box.appendChild(h('div', { class: 'sec-label', style: { margin: '14px 0 6px' }, text: '코스 속 단어' }));
      others.forEach(function (w) { box.appendChild(h('div', { class: 'word-row', style: { padding: '8px 0' } }, h('div', { class: 'wj jp', html: U.wordRuby(w.w, w.r, true) }), h('div', { class: 'wm', text: w.m }), h('button', { class: 'wb', text: '🔊', onclick: function () { U.tts.speak(w.r); } }))); });
    }
    box.appendChild(h('button', { class: 'btn', style: { marginTop: '14px' }, text: '✍️ 쓰기 연습', onclick: function () { pop.remove(); G.LESSON.run({ title: '쓰기', items: [G.EX.kanjiTrace(k), G.EX.kanjiTrace(k), G.EX.kanjiTrace(k)], mode: 'practice', xp: 3, onDone: APP.refresh, onQuit: APP.refresh }); } }));
    const pop = APP.sheet(box);
  }
  APP.kanjiDetail = kanjiDetail;

  /* ---------- 단어장 ---------- */
  function wordList(el) {
    const C = G.COURSE;
    let filter = 'all';
    const chips = h('div', { class: 'chips', style: { padding: '12px 16px' } });
    const body = h('div');
    const opts = [['all', '전체'], ['learned', '학습함'], ['weak', '약한 단어'], ['fav', '★ 즐겨찾기'], ['verb', '동사'], ['adj', '형용사']];
    function draw() {
      chips.innerHTML = '';
      opts.forEach(function (o) { chips.appendChild(h('span', { class: 'chip' + (filter === o[0] ? ' on' : ''), text: o[1], onclick: function () { filter = o[0]; draw(); } })); });
      body.innerHTML = '';
      const words = C.words.filter(function (w) {
        const s = APP.state.srs[w.id];
        if (filter === 'learned') return !!s;
        if (filter === 'weak') return s && (s.l <= 2 || s.ng > s.ok);
        if (filter === 'fav') return APP.state.fav.indexOf(w.id) >= 0;
        if (filter === 'verb') return /^v/.test(w.p);
        if (filter === 'adj') return /^a[in]$/.test(w.p);
        return true;
      });
      body.appendChild(h('div', { class: 'row', style: { padding: '0 16px 8px' } }, h('div', { class: 'muted small', text: words.length + '개 단어' }),
        words.length >= 4 ? h('button', { class: 'btn sm', style: { flex: 'none' }, text: '이 목록으로 연습', onclick: function () { G.LESSON.run({ title: '단어 연습', items: G.LG.fromWords(words, 15), mode: 'practice', onDone: APP.afterLesson, onQuit: APP.refresh }); } }) : null,
        words.length ? h('button', { class: 'btn sm blue', style: { flex: 'none' }, text: '🃏 카드', onclick: function () { G.PRACTICE.flash(words); } }) : null));
      // 유닛별 그룹
      let lastU = null; let n = 0;
      words.forEach(function (w) {
        if (n > 600) return; n++;
        if (w.u !== lastU) { lastU = w.u; const u = C.unitMap[w.u]; body.appendChild(h('div', { class: 'sec-label', text: u ? (u.secObj.t + ' · ' + u.t) : '' })); }
        body.appendChild(wordRow(w));
      });
      if (words.length > 600) body.appendChild(h('div', { class: 'center muted small pad', text: '상위 600개만 표시 — 검색을 이용하세요' }));
    }
    el.appendChild(chips); el.appendChild(body); draw();
  }

  /* ---------- 문법 ---------- */
  function grammarList(el) {
    const C = G.COURSE;
    const inp = h('input', { class: 'search', style: { marginTop: '12px' }, placeholder: '문법 검색 (예: て형, たい, 조건)' });
    el.appendChild(inp);
    const body = h('div'); el.appendChild(body);
    function draw() {
      body.innerHTML = '';
      const q = inp.value.trim();
      let lastSec = null;
      C.tips.forEach(function (t) {
        const u = C.unitMap[t.u];
        if (q && (t.t + t.b).indexOf(q) < 0) return;
        if (u && u.secObj !== lastSec) { lastSec = u.secObj; body.appendChild(h('div', { class: 'sec-label', text: lastSec.t })); }
        body.appendChild(h('div', { class: 'li', style: { padding: '12px 16px' }, onclick: function () { APP.push(APP.screens.guide, u.t, u); } },
          h('div', { class: 'lic', style: { background: u ? u.color : '#ccc', color: '#fff', fontSize: '22px' }, text: u ? u.e : '📗' }),
          h('div', { class: 'lit' }, h('b', { text: t.t }), h('span', { text: u ? u.t : '' })), h('span', { class: 'chev', text: '›' })));
      });
    }
    inp.addEventListener('input', draw); draw();
  }

  /* ---------- 표현집 ---------- */
  function phraseList(el) {
    const C = G.COURSE;
    const inp = h('input', { class: 'search', style: { marginTop: '12px' }, placeholder: '문장 검색 (한국어/일본어)' });
    el.appendChild(inp);
    const body = h('div'); el.appendChild(body);
    function draw() {
      body.innerHTML = '';
      const q = inp.value.trim(); let lastU = null; let n = 0;
      C.sents.forEach(function (s) {
        if (q && s.k.indexOf(q) < 0 && U.plain(s.j).indexOf(q) < 0 && U.readingOf(s.j).indexOf(q) < 0) return;
        if (n++ > 400) return;
        if (s.u !== lastU) { lastU = s.u; body.appendChild(h('div', { class: 'sec-label', text: C.unitMap[s.u].t })); }
        body.appendChild(sentRow(s));
      });
    }
    inp.addEventListener('input', draw); draw();
  }
  function sentRow(s) {
    const saved = APP.state.saved.indexOf(s.id) >= 0;
    const sv = h('button', { class: 'wb', text: saved ? '📌' : '📍', title: '저장' });
    sv.addEventListener('click', function () { const i = APP.state.saved.indexOf(s.id); if (i >= 0) APP.state.saved.splice(i, 1); else APP.state.saved.push(s.id); sv.textContent = i >= 0 ? '📍' : '📌'; APP.save(); });
    return h('div', { class: 'ex-line', style: { padding: '10px 16px' } }, G.EX.spkBtn(U.plain(s.j)),
      h('div', { style: { flex: '1' } }, h('div', { class: 'exj jp', html: U.ruby(s.j.replace(/\s+/g, ''), APP.state.settings.furi) }), h('div', { class: 'exk', text: s.k })), sv);
  }
  function savedList(el) {
    const C = G.COURSE;
    const ss = APP.state.saved.map(function (id) { return C.sents.find(function (s) { return s.id === id; }); }).filter(Boolean);
    if (!ss.length) { el.appendChild(h('div', { class: 'empty-state' }, h('div', { class: 'ei', text: '📌' }), h('div', { text: '레슨 중 정답 화면에서 "문장 저장"을 누르거나, 표현집에서 📍를 눌러 저장하세요.' }))); return; }
    el.appendChild(h('div', { class: 'pad' }, h('button', { class: 'btn', text: '저장한 문장으로 연습 (' + ss.length + ')', onclick: function () { G.LESSON.run({ title: '저장 문장', items: G.LG.fromSents(ss, 12), mode: 'practice', onDone: APP.afterLesson, onQuit: APP.refresh }); } })));
    ss.forEach(function (s) { el.appendChild(sentRow(s)); });
  }

  /* ---------- 참고표 ---------- */
  function numberRef(el) {
    const b = h('div', { class: 'pad guide-body' });
    let t = '<h4>기본 숫자</h4><table><tr><th>숫자</th><th>읽기</th><th>숫자</th><th>읽기</th></tr>';
    const nums = [[0, 'ゼロ/れい'], [1, 'いち'], [2, 'に'], [3, 'さん'], [4, 'よん/し'], [5, 'ご'], [6, 'ろく'], [7, 'なな/しち'], [8, 'はち'], [9, 'きゅう/く'], [10, 'じゅう'], [100, 'ひゃく'], [1000, 'せん'], [10000, 'いちまん']];
    for (let i = 0; i < nums.length; i += 2) t += '<tr><td>' + nums[i][0] + '</td><td class="jp">' + nums[i][1] + '</td><td>' + nums[i + 1][0] + '</td><td class="jp">' + nums[i + 1][1] + '</td></tr>';
    t += '</table><div class="pt">⚠️ 음편 주의: 300 さんびゃく, 600 ろっぴゃく, 800 はっぴゃく, 3000 さんぜん, 8000 はっせん</div>';
    t += '<h4>고유어 수사 (~개)</h4><table><tr><th>1</th><td class="jp">ひとつ</td><th>6</th><td class="jp">むっつ</td></tr><tr><th>2</th><td class="jp">ふたつ</td><th>7</th><td class="jp">ななつ</td></tr><tr><th>3</th><td class="jp">みっつ</td><th>8</th><td class="jp">やっつ</td></tr><tr><th>4</th><td class="jp">よっつ</td><th>9</th><td class="jp">ここのつ</td></tr><tr><th>5</th><td class="jp">いつつ</td><th>10</th><td class="jp">とお</td></tr></table>';
    t += '<h4>주요 조수사</h4><table><tr><th></th><th>人 (사람)</th><th>本 (긴 것)</th><th>匹 (작은 동물)</th><th>杯 (잔)</th></tr>';
    const CT = G.PRACTICE ? G.PRACTICE.counterTable : null;
    if (CT) for (let n = 1; n <= 10; n++) t += '<tr><th>' + n + '</th><td class="jp">' + CT('人', n) + '</td><td class="jp">' + CT('本', n) + '</td><td class="jp">' + CT('匹', n) + '</td><td class="jp">' + CT('杯', n) + '</td></tr>';
    t += '</table><table><tr><th></th><th>枚 (얇은 것)</th><th>冊 (책)</th><th>個 (개)</th><th>回 (회)</th><th>階 (층)</th></tr>';
    if (CT) for (let n = 1; n <= 10; n++) t += '<tr><th>' + n + '</th><td class="jp">' + CT('枚', n) + '</td><td class="jp">' + CT('冊', n) + '</td><td class="jp">' + CT('個', n) + '</td><td class="jp">' + CT('回', n) + '</td><td class="jp">' + CT('階', n) + '</td></tr>';
    t += '</table><div class="pt">조수사는 연습 탭 → <b>조수사 트레이너</b>에서 무한 연습할 수 있어요.</div>';
    b.innerHTML = t; el.appendChild(b);
  }
  function dateRef(el) {
    const b = h('div', { class: 'pad guide-body' });
    const P = G.PRACTICE;
    let t = '<h4>월 (がつ)</h4><table>';
    for (let m = 1; m <= 12; m += 3) t += '<tr>' + [m, m + 1, m + 2].map(function (x) { return '<th>' + x + '월</th><td class="jp">' + P.monthJa(x) + '</td>'; }).join('') + '</tr>';
    t += '</table><div class="pt">4월 しがつ, 7월 しちがつ, 9월 くがつ 주의!</div><h4>일 (にち)</h4><table>';
    for (let d = 1; d <= 31; d += 3) t += '<tr>' + [d, d + 1, d + 2].filter(function (x) { return x <= 31; }).map(function (x) { return '<th>' + x + '일</th><td class="jp">' + P.dayJa(x) + '</td>'; }).join('') + '</tr>';
    t += '</table><div class="pt">1~10일, 14일, 20일, 24일은 고유어 읽기를 써요.</div><h4>시 (じ)</h4><table>';
    for (let hh = 1; hh <= 12; hh += 3) t += '<tr>' + [hh, hh + 1, hh + 2].map(function (x) { return '<th>' + x + '시</th><td class="jp">' + P.hourJa(x) + '</td>'; }).join('') + '</tr>';
    t += '</table><h4>분 (ふん/ぷん)</h4><table>';
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 30].forEach(function (m, i) { if (i % 3 === 0) t += '<tr>'; t += '<th>' + m + '분</th><td class="jp">' + P.minJa(m) + '</td>'; if (i % 3 === 2) t += '</tr>'; });
    t += '</table><h4>요일</h4><table><tr><th>월</th><td class="jp">げつようび</td><th>화</th><td class="jp">かようび</td></tr><tr><th>수</th><td class="jp">すいようび</td><th>목</th><td class="jp">もくようび</td></tr><tr><th>금</th><td class="jp">きんようび</td><th>토</th><td class="jp">どようび</td></tr><tr><th>일</th><td class="jp">にちようび</td><th></th><td></td></tr></table>';
    b.innerHTML = t; el.appendChild(b);
  }
  function conjRef(el) {
    const b = h('div', { class: 'pad guide-body' });
    const ex = [['書く', 'かく', 'v5', '쓰다'], ['話す', 'はなす', 'v5', '말하다'], ['待つ', 'まつ', 'v5', '기다리다'], ['飲む', 'のむ', 'v5', '마시다'], ['買う', 'かう', 'v5', '사다'], ['行く', 'いく', 'v5', '가다'], ['食べる', 'たべる', 'v1', '먹다'], ['見る', 'みる', 'v1', '보다'], ['する', 'する', 'vs', '하다'], ['来る', 'くる', 'vk', '오다']];
    let t = '<h4>동사의 3그룹</h4><p><b>1그룹(5단)</b>: る로 끝나지 않거나, る 앞이 あ·う·お단 (書く, 話す, 分かる)<br><b>2그룹(1단)</b>: る 앞이 い·え단 (食べる, 見る) — 예외: 帰る, 入る, 走る, 知る는 1그룹!<br><b>3그룹(불규칙)</b>: する, 来る</p>';
    G.CONJ.FORMS.forEach(function (f) {
      t += '<h4>' + f.n + ' <span class="muted small">' + f.ko + '</span></h4><table>';
      ex.forEach(function (e, i) { if (i % 2 === 0) t += '<tr>'; t += '<td class="jp">' + e[0] + '</td><td class="jp"><b>' + G.CONJ.verb(e[0], e[1], e[2], f.id).w + '</b></td>'; if (i % 2 === 1) t += '</tr>'; });
      t += '</table>';
    });
    t += '<h4>い형용사 (高い 비싸다 / いい 좋다)</h4><table>';
    G.CONJ.AFORMS.forEach(function (f) { t += '<tr><th>' + f.n + '</th><td class="jp">' + G.CONJ.adj('高い', 'たかい', 'ai', f.id).w + '</td><td class="jp">' + G.CONJ.adj('いい', 'いい', 'ai', f.id).w + '</td></tr>'; });
    t += '</table><h4>な형용사 (静か 조용하다)</h4><table>';
    G.CONJ.AFORMS.forEach(function (f) { t += '<tr><th>' + f.n + '</th><td class="jp">' + G.CONJ.adj('静か', 'しずか', 'an', f.id).w + '</td></tr>'; });
    t += '</table>';
    b.innerHTML = t; el.appendChild(b);
  }
})(window);
