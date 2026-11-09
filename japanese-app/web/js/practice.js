/* 연습 탭: 복습(SRS), 트레이너(활용·숫자·시간·조수사), 플래시카드, 스피드 퀴즈, 스토리, JLPT 모의고사 */
(function (G) {
  'use strict';
  const U = G.U, h = U.h, APP = G.APP, EX = G.EX;
  const P = {};
  G.PRACTICE = P;
  let overlay = null;
  P.activeOverlay = function () { if (overlay) { overlay.close(); return true; } return false; };

  /* ---------- 아이템 조회 ---------- */
  let charMap = null, sentMap = null;
  function maps() {
    if (charMap) return;
    charMap = {}; sentMap = {};
    G.COURSE.units.forEach(function (u) { (u.chars || []).forEach(function (c) { charMap[c.id] = c; }); });
    G.COURSE.sents.forEach(function (s) { sentMap[s.id] = s; });
  }
  P.item = function (id) {
    maps();
    if (id.indexOf('w:') === 0 || id.indexOf('kw:') === 0) return { t: 'w', o: G.COURSE.wordMap[id] };
    if (id.indexOf('kj:') === 0) return { t: 'kj', o: G.COURSE.kanji.find(function (k) { return k.id === id; }) };
    if (id.indexOf('k:') === 0) return { t: 'k', o: charMap[id] };
    if (id.indexOf('s:') === 0) return { t: 's', o: sentMap[id] };
    return null;
  };
  function buildFromIds(ids, n) {
    const out = [];
    const words = [], chars = [], kanji = [], sents = [];
    U.shuffle(ids).forEach(function (id) {
      const it = P.item(id); if (!it || !it.o) return;
      ({ w: words, k: chars, kj: kanji, s: sents })[it.t].push(it.o);
    });
    const allChars = Object.keys(charMap).map(function (k) { return charMap[k]; });
    const wp = words.concat(G.COURSE.words.slice(0, 200));
    words.slice(0, n).forEach(function (w, i) { out.push([EX.meaningMC, EX.wordMC, EX.listenMC, EX.typeReading][i % 4] === EX.typeReading ? EX.typeReading(w) : [EX.meaningMC, EX.wordMC, EX.listenMC][i % 4](w, wp)); });
    chars.slice(0, Math.ceil(n / 2)).forEach(function (c, i) { out.push([EX.kanaMC, EX.romajiMC, EX.kanaListen][i % 3](c, allChars.filter(function (x) { return x.id.slice(0, 4) === c.id.slice(0, 4); }))); });
    kanji.slice(0, Math.ceil(n / 2)).forEach(function (k, i) { out.push([EX.kanjiMeaning, EX.kanjiFromMeaning, EX.kanjiReading][i % 3](k, G.COURSE.kanji)); });
    const sp = sents.concat(G.COURSE.sents.slice(0, 100));
    sents.slice(0, Math.ceil(n / 2)).forEach(function (s, i) { out.push([EX.transJK, EX.transKJ, EX.listenBuild][i % 3](s, sp)); });
    return U.shuffle(out).slice(0, n);
  }
  P.buildFromIds = buildFromIds;

  function run(title, items, xp, mode) {
    if (!items.length) { U.toast('연습할 항목이 없어요. 먼저 레슨을 진행해 주세요!'); return; }
    G.LESSON.run({ title: title, items: items, mode: mode || 'practice', xp: xp, onDone: APP.afterLesson, onQuit: APP.refresh });
  }
  function learnedWords() { return G.COURSE.words.filter(function (w) { return APP.state.srs[w.id]; }); }
  function learnedSents() {
    const done = {}; G.COURSE.units.forEach(function (u) { if ((APP.state.progress[u.id] || 0) >= 3) done[u.id] = 1; });
    return G.COURSE.sents.filter(function (s) { return done[s.u]; });
  }

  /* ---------- 연습 허브 ---------- */
  APP.screens.practice = function (el) {
    const due = APP.dueItems();
    const mist = Object.keys(APP.state.mistakes);
    el.appendChild(h('div', { class: 'h-title', text: '🏋️ 연습장' }));
    el.appendChild(h('div', { class: 'h-sub', text: '복습하면 하트도 1개 회복돼요!' }));
    el.appendChild(h('div', { class: 'card', style: { margin: '0 16px 14px', background: 'var(--blue-l)', borderColor: 'var(--blue)' } },
      h('div', { class: 'row' }, h('div', { style: { fontSize: '44px', flex: 'none' }, text: '🧠' }), h('div', null, h('h3', { text: '오늘의 복습 (간격 반복)' }), h('div', { class: 'small muted', text: due.length ? '복습할 항목 ' + due.length + '개가 기다리고 있어요' : '복습할 항목이 없어요. 새 레슨을 진행해 보세요!' }))),
      h('button', { class: 'btn blue', style: { marginTop: '12px' }, disabled: !due.length, text: due.length ? '복습 시작 (' + Math.min(15, due.length) + '문제)' : '완료!', onclick: function () { run('오늘의 복습', buildFromIds(due, 15), 10, 'review'); } })));
    const g = h('div', { class: 'grid-cards' });
    function add(i, n, d, f, badge) { g.appendChild(h('div', { class: 'gcard', onclick: f }, badge ? h('span', { class: 'badge', text: badge }) : null, h('div', { class: 'gi', text: i }), h('b', { text: n }), h('span', { text: d }))); }
    add('❌', '실수 노트', mist.length + '개 항목', function () { run('실수 노트', buildFromIds(mist.sort(function (a, b) { return APP.state.mistakes[b] - APP.state.mistakes[a]; }).slice(0, 30), 12), 10); }, mist.length ? String(mist.length) : '');
    add('🎧', '듣기 집중', '들리는 대로 받아쓰기', function () { const s = learnedSents(); run('듣기 집중', s.length >= 4 ? G.LG.fromSents(s, 10, { listen: true }) : G.LG.fromWords(learnedWords(), 10, { listen: true }), 10); });
    add('🎤', '말하기 집중', '발음 연습 (음성 인식)', function () { if (!U.speech.available()) { U.toast('이 기기에서 음성 인식을 사용할 수 없어요'); return; } const s = learnedSents(); run('말하기', G.LG.fromSents(s.length ? s : G.COURSE.sents.slice(0, 40), 8, { speak: true }), 10); });
    add('⌨️', '쓰기 집중', '읽는 법 직접 입력', function () { run('쓰기 집중', G.LG.fromWords(learnedWords(), 12, { write: true }), 10); });
    add('🃏', '플래시카드', '단어 카드 넘기기', function () { const w = learnedWords(); P.flash(w.length ? w : G.COURSE.words.slice(0, 60)); });
    add('⚡', '타임 어택', '90초 단어 퀴즈', function () { P.speed('word'); });
    add('🔤', '가나 스피드', '60초 가나 읽기', function () { P.speed('kana'); });
    add('✍️', '쓰기 연습장', '가나·한자 따라 쓰기', function () { APP.push(traceHub, '쓰기 연습장'); });
    add('🔄', '동사 활용', CONJ_COUNT() + '개 동사 × 20가지 활용', function () { APP.push(conjTrainer, '동사 활용 트레이너', 'verb'); });
    add('🎨', '형용사 활용', 'い·な형용사 8가지 활용', function () { APP.push(conjTrainer, '형용사 활용 트레이너', 'adj'); });
    add('🔢', '숫자 트레이너', '0 ~ 1억까지 무한 연습', function () { APP.push(numTrainer, '숫자 트레이너'); });
    add('⏰', '시간·날짜', '時·分·月·日 읽기', function () { APP.push(timeTrainer, '시간·날짜 트레이너'); });
    add('🍡', '조수사', '本·匹·枚·人… 음편', function () { counterRun(); });
    add('📖', '스토리', (G.STORIES || []).length + '편의 회화 이야기', function () { APP.push(storyList, '스토리'); });
    add('📝', 'JLPT 모의고사', 'N5 · N4 · N3', function () { APP.push(jlptHub, 'JLPT 모의고사'); });
    add('🎲', '랜덤 믹스', '배운 내용 전체 섞기', function () {
      const ids = Object.keys(APP.state.srs);
      run('랜덤 믹스', buildFromIds(ids, 15), 10);
    });
    el.appendChild(g);
  };
  function CONJ_COUNT() { return G.COURSE.words.filter(function (w) { return /^v/.test(w.p); }).length; }

  /* ---------- 활용 트레이너 ---------- */
  function conjTrainer(el, kind) {
    const isV = kind === 'verb';
    const forms = isV ? G.CONJ.FORMS : G.CONJ.AFORMS;
    let lv = 1, scope = 'all';
    const body = h('div', { class: 'pad' });
    function draw() {
      body.innerHTML = '';
      body.appendChild(h('b', { text: '난이도' }));
      const seg = h('div', { class: 'seg', style: { margin: '8px 0 14px' } });
      [1, 2, 3, 4].filter(function (l) { return isV || l <= 3; }).forEach(function (l) { seg.appendChild(h('button', { class: lv === l ? 'on' : '', text: 'Lv.' + l, onclick: function () { lv = l; draw(); } })); });
      body.appendChild(seg);
      body.appendChild(h('div', { class: 'small muted', style: { marginBottom: '12px' }, html: '포함 활용: ' + forms.filter(function (f) { return f.lv <= lv; }).map(function (f) { return '<b>' + f.n + '</b>'; }).join(', ') }));
      const seg2 = h('div', { class: 'seg', style: { marginBottom: '16px' } });
      [['all', '전체 ' + (isV ? '동사' : '형용사')], ['learned', '학습한 것만']].forEach(function (o) { seg2.appendChild(h('button', { class: scope === o[0] ? 'on' : '', text: o[1], onclick: function () { scope = o[0]; draw(); } })); });
      body.appendChild(seg2);
      body.appendChild(h('button', { class: 'btn', text: '트레이닝 시작 (15문제)', onclick: function () { conjRun(isV, lv, scope); } }));
      // 표 미리보기
      body.appendChild(h('div', { class: 'sec-label', style: { margin: '20px 0 8px' }, text: '예시' }));
      const sample = isV ? ['食べる', 'たべる', 'v1'] : ['高い', 'たかい', 'ai'];
      const t = h('div', { class: 'guide-body' });
      t.innerHTML = '<table>' + forms.filter(function (f) { return f.lv <= lv; }).map(function (f) { const x = isV ? G.CONJ.verb(sample[0], sample[1], sample[2], f.id) : G.CONJ.adj(sample[0], sample[1], sample[2], f.id); return '<tr><th>' + f.n + '</th><td class="jp">' + x.w + '</td><td class="small">' + f.ko + '</td></tr>'; }).join('') + '</table>';
      body.appendChild(t);
    }
    el.appendChild(body); draw();
  }
  const NO_FORMS = { 'ある': ['pot', 'vol', 'imp', 'pass', 'caus', 'causpass', 'tai', 'mashou', 'teiru'], 'わかる': ['pot', 'pass', 'caus', 'causpass', 'imp'], '分かる': ['pot', 'pass', 'caus', 'causpass', 'imp'], 'できる': ['pot', 'pass', 'caus', 'causpass', 'imp', 'vol'], 'いる': ['pot'] };
  function conjRun(isV, lv, scope) {
    let pool = G.COURSE.words.filter(function (w) { return isV ? /^v(5|1|s|k)$/.test(w.p) : /^a[in]$/.test(w.p); })
      .filter(function (w) { return !/(いらっしゃ|くださ|なさ|おっしゃ|ござ|申す|参る|召し)/.test(w.w); });
    if (scope === 'learned') { const l = pool.filter(function (w) { return APP.state.srs[w.id]; }); if (l.length >= 4) pool = l; else U.toast('학습한 단어가 적어 전체에서 출제해요'); }
    const forms = (isV ? G.CONJ.FORMS : G.CONJ.AFORMS).filter(function (f) { return f.lv <= lv; });
    const seenW = {};
    pool = pool.filter(function (w) { if (seenW[w.w]) return false; seenW[w.w] = 1; return true; });
    const items = [];
    for (let i = 0; i < 15; i++) {
      const w = U.pick(pool);
      let f = U.pick(forms);
      let guard = 0;
      while (NO_FORMS[w.w] && NO_FORMS[w.w].indexOf(f.id) >= 0 && guard++ < 10) f = U.pick(forms);
      const conj = function (fid) { return isV ? G.CONJ.verb(w.w, w.r, w.p, fid) : G.CONJ.adj(w.w, w.r, w.p, fid); };
      const ans = conj(f.id);
      const prompt = '<span class="jp" style="font-size:34px">' + U.wordRuby(w.w, w.r, true) + '</span><div class="muted" style="width:100%">' + U.esc(w.m) + ' · ' + U.esc(APP.POS[w.p] || '') + '</div><div style="width:100%;margin-top:8px;font-size:18px">→ <b style="color:var(--blue-d)">' + U.esc(f.n) + '</b> <span class="small muted">(' + U.esc(f.ko) + ')</span></div>';
      if (i % 2 === 0) {
        items.push({ type: 'type', skill: 'write', items: [w.id], title: '활용형을 입력하세요', promptHtml: prompt, mode: 'kana', answers: [ans.r, ans.w], answer: '<span class="jp">' + U.esc(ans.w) + ' (' + U.esc(ans.r) + ')</span>', say: ans.r });
      } else {
        const others = U.uniq(U.shuffle((isV ? G.CONJ.FORMS : G.CONJ.AFORMS).filter(function (x) { return x.id !== f.id; })).map(function (x) { return conj(x.id).w; })).filter(function (x) { return x !== ans.w; }).slice(0, 3);
        const opts = U.shuffle([ans.w].concat(others));
        items.push({ type: 'mc', skill: 'read', items: [w.id], title: '알맞은 활용형은?', promptWord: null, subtitle: '', bigChar: null, layout: 'list',
          opts: opts.map(function (o) { return { html: '<span class="jp">' + U.esc(o) + '</span>', ok: o === ans.w }; }), answer: '<span class="jp">' + U.esc(ans.w) + '</span>', _prompt: prompt });
      }
    }
    // MC 프롬프트를 버블로 보여주기 위해 subtitle 대신 promptHtml 사용
    items.forEach(function (it) { if (it._prompt) { it.title = '알맞은 활용형은?'; it.subtitleHtml = it._prompt; } });
    APP.state.stats.trainers++;
    run(isV ? '동사 활용' : '형용사 활용', items, 12, 'practice');
  }

  /* ---------- 숫자/시간/조수사 ---------- */
  const HOURS = ['', 'いちじ', 'にじ', 'さんじ', 'よじ', 'ごじ', 'ろくじ', 'しちじ', 'はちじ', 'くじ', 'じゅうじ', 'じゅういちじ', 'じゅうにじ'];
  P.hourJa = function (x) { return HOURS[x]; };
  P.minJa = function (m) {
    if (m === 0) return '';
    const ones = m % 10, tens = Math.floor(m / 10);
    const T = ['', 'じゅう', 'にじゅう', 'さんじゅう', 'よんじゅう', 'ごじゅう'];
    const O = ['', 'いっぷん', 'にふん', 'さんぷん', 'よんぷん', 'ごふん', 'ろっぷん', 'ななふん', 'はっぷん', 'きゅうふん'];
    if (ones === 0) return ['', 'じゅっぷん', 'にじゅっぷん', 'さんじゅっぷん', 'よんじゅっぷん', 'ごじゅっぷん'][tens];
    return T[tens] + O[ones];
  };
  const MONTHS = ['', 'いちがつ', 'にがつ', 'さんがつ', 'しがつ', 'ごがつ', 'ろくがつ', 'しちがつ', 'はちがつ', 'くがつ', 'じゅうがつ', 'じゅういちがつ', 'じゅうにがつ'];
  P.monthJa = function (m) { return MONTHS[m]; };
  const DAYS = ['', 'ついたち', 'ふつか', 'みっか', 'よっか', 'いつか', 'むいか', 'なのか', 'ようか', 'ここのか', 'とおか'];
  P.dayJa = function (d) {
    if (d <= 10) return DAYS[d];
    if (d === 14) return 'じゅうよっか'; if (d === 20) return 'はつか'; if (d === 24) return 'にじゅうよっか';
    const ones = d % 10, tens = Math.floor(d / 10);
    const T = ['', 'じゅう', 'にじゅう', 'さんじゅう'];
    const O = ['', 'いち', 'に', 'さん', 'よっ', 'ご', 'ろく', 'しち', 'はち', 'く'];
    return T[tens] + (ones ? O[ones] : '') + 'にち';
  };
  const CTR = {
    '人': ['ひとり', 'ふたり', 'さんにん', 'よにん', 'ごにん', 'ろくにん', 'ななにん', 'はちにん', 'きゅうにん', 'じゅうにん'],
    '本': ['いっぽん', 'にほん', 'さんぼん', 'よんほん', 'ごほん', 'ろっぽん', 'ななほん', 'はっぽん', 'きゅうほん', 'じゅっぽん'],
    '匹': ['いっぴき', 'にひき', 'さんびき', 'よんひき', 'ごひき', 'ろっぴき', 'ななひき', 'はっぴき', 'きゅうひき', 'じゅっぴき'],
    '杯': ['いっぱい', 'にはい', 'さんばい', 'よんはい', 'ごはい', 'ろっぱい', 'ななはい', 'はっぱい', 'きゅうはい', 'じゅっぱい'],
    '枚': ['いちまい', 'にまい', 'さんまい', 'よんまい', 'ごまい', 'ろくまい', 'ななまい', 'はちまい', 'きゅうまい', 'じゅうまい'],
    '冊': ['いっさつ', 'にさつ', 'さんさつ', 'よんさつ', 'ごさつ', 'ろくさつ', 'ななさつ', 'はっさつ', 'きゅうさつ', 'じゅっさつ'],
    '個': ['いっこ', 'にこ', 'さんこ', 'よんこ', 'ごこ', 'ろっこ', 'ななこ', 'はっこ', 'きゅうこ', 'じゅっこ'],
    '回': ['いっかい', 'にかい', 'さんかい', 'よんかい', 'ごかい', 'ろっかい', 'ななかい', 'はっかい', 'きゅうかい', 'じゅっかい'],
    '階': ['いっかい', 'にかい', 'さんがい', 'よんかい', 'ごかい', 'ろっかい', 'ななかい', 'はっかい', 'きゅうかい', 'じゅっかい'],
    '台': ['いちだい', 'にだい', 'さんだい', 'よんだい', 'ごだい', 'ろくだい', 'ななだい', 'はちだい', 'きゅうだい', 'じゅうだい'],
    'つ': ['ひとつ', 'ふたつ', 'みっつ', 'よっつ', 'いつつ', 'むっつ', 'ななつ', 'やっつ', 'ここのつ', 'とお'],
    '歳': ['いっさい', 'にさい', 'さんさい', 'よんさい', 'ごさい', 'ろくさい', 'ななさい', 'はっさい', 'きゅうさい', 'じゅっさい'],
    '分': ['いっぷん', 'にふん', 'さんぷん', 'よんぷん', 'ごふん', 'ろっぷん', 'ななふん', 'はっぷん', 'きゅうふん', 'じゅっぷん']
  };
  P.counterTable = function (c, n) { return CTR[c][n - 1]; };
  const CTR_ITEMS = [
    ['人', '👤', '사람', '명'], ['本', '✏️', '연필', '자루'], ['本', '🍾', '병', '병'], ['本', '🌂', '우산', '개'], ['匹', '🐱', '고양이', '마리'], ['匹', '🐟', '물고기', '마리'],
    ['杯', '☕', '커피', '잔'], ['杯', '🍺', '맥주', '잔'], ['枚', '📄', '종이', '장'], ['枚', '👕', '셔츠', '장'], ['冊', '📚', '책', '권'], ['個', '🍎', '사과', '개'],
    ['個', '🥚', '달걀', '개'], ['回', '🔁', '횟수', '번'], ['階', '🏢', '층', '층'], ['台', '🚗', '자동차', '대'], ['台', '💻', '컴퓨터', '대'], ['つ', '🍙', '주먹밥', '개'], ['歳', '🎂', '나이', '살'], ['分', '⏱️', '시간(분)', '분']
  ];
  function counterRun() {
    const items = [];
    for (let i = 0; i < 15; i++) {
      const it = U.pick(CTR_ITEMS), n = 1 + U.rand(10);
      const ans = CTR[it[0]][n - 1];
      const alts = [ans];
      if (/じゅっ/.test(ans)) alts.push(ans.replace('じゅっ', 'じっ'));
      if (it[0] === '人' && n === 7) alts.push('しちにん');
      const prompt = '<div style="font-size:46px;width:100%">' + it[1].repeat(Math.min(n, 5)) + (n > 5 ? '…' : '') + '</div><div style="width:100%;font-size:20px">' + it[2] + ' <b>' + n + it[3] + '</b></div><div class="small muted" style="width:100%">조수사: <span class="jp">' + it[0] + '</span></div>';
      if (i % 2 === 0) items.push({ type: 'type', skill: 'write', items: [], title: '읽는 법을 입력하세요', promptHtml: prompt, mode: 'kana', answers: alts, answer: '<span class="jp">' + ans + '</span>', say: ans });
      else {
        const wrong = U.uniq(U.shuffle([CTR[it[0]][(n % 10)], naive(it[0], n), CTR[U.pick(Object.keys(CTR).filter(function (k) { return k !== it[0]; }))][n - 1]]).filter(function (x) { return x && x !== ans; })).slice(0, 3);
        const opts = U.shuffle([ans].concat(wrong));
        items.push({ type: 'mc', skill: 'read', items: [], title: '알맞은 읽기는?', subtitleHtml: prompt, opts: opts.map(function (o) { return { html: '<span class="jp">' + o + '</span>', ok: o === ans, say: o }; }), answer: '<span class="jp">' + ans + '</span>' });
      }
    }
    APP.state.stats.trainers++;
    run('조수사 트레이너', items, 12);
  }
  function naive(c, n) { // 흔한 실수 (음편 미적용)
    const base = ['いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう', 'じゅう'][n - 1];
    const rd = { '人': 'にん', '本': 'ほん', '匹': 'ひき', '杯': 'はい', '枚': 'まい', '冊': 'さつ', '個': 'こ', '回': 'かい', '階': 'かい', '台': 'だい', 'つ': 'つ', '歳': 'さい', '分': 'ふん' }[c];
    return base + rd;
  }
  function numTrainer(el) {
    let lv = 1;
    const box = h('div', { class: 'pad' });
    function draw() {
      box.innerHTML = '';
      box.appendChild(h('b', { text: '범위' }));
      const seg = h('div', { class: 'seg', style: { margin: '8px 0 16px' } });
      [[1, '0~10'], [2, '~100'], [3, '~1만'], [4, '~1억']].forEach(function (o) { seg.appendChild(h('button', { class: lv === o[0] ? 'on' : '', text: o[1], onclick: function () { lv = o[0]; draw(); } })); });
      box.appendChild(seg);
      box.appendChild(h('button', { class: 'btn', text: '읽기 연습 (숫자 → 일본어)', onclick: function () { numRun(lv, 'read'); } }));
      box.appendChild(h('button', { class: 'btn blue', style: { marginTop: '12px' }, text: '듣기 연습 (일본어 → 숫자)', onclick: function () { numRun(lv, 'listen'); } }));
      box.appendChild(h('div', { class: 'card small', style: { marginTop: '18px' }, html: '💡 <b>4</b>는 よん, <b>7</b>은 なな, <b>9</b>는 きゅう가 기본이에요.<br>300 さんびゃく · 600 ろっぴゃく · 800 はっぴゃく<br>3000 さんぜん · 8000 はっせん · 1만 いちまん' }));
    }
    el.appendChild(box); draw();
  }
  function randNum(lv) {
    if (lv === 1) return U.rand(11);
    if (lv === 2) return 11 + U.rand(90);
    if (lv === 3) return U.pick([100 + U.rand(900), 1000 + U.rand(9000), U.pick([300, 600, 800, 3000, 8000, 1000, 100])]);
    return U.pick([10000 + U.rand(90000), 100000 + U.rand(900000), 1000000 + U.rand(9000000), 10000 + U.rand(9990000)]);
  }
  function numRun(lv, mode) {
    const items = [];
    for (let i = 0; i < 12; i++) {
      const n = randNum(lv); const r = U.numJa(n);
      const alts = [r, r.replace(/よん/g, 'し').replace(/なな/g, 'しち'), r.replace(/ぜろ/, 'れい')];
      if (n === 0) alts.push('ぜろ', 'れい');
      if (mode === 'read') items.push({ type: 'type', skill: 'write', items: [], title: '일본어로 읽어 입력하세요', promptHtml: '<span style="font-size:44px;font-weight:800">' + n.toLocaleString() + '</span>', mode: 'kana', answers: alts, answer: '<span class="jp">' + r + '</span>', say: String(n) });
      else items.push({ type: 'type', skill: 'listen', items: [], title: '들은 숫자를 입력하세요 (아라비아 숫자)', audioOnly: r, mode: 'num', answers: [String(n)], answer: n.toLocaleString() + ' (<span class="jp">' + r + '</span>)', say: r });
    }
    APP.state.stats.trainers++;
    run('숫자 트레이너', items, 10);
  }
  function timeTrainer(el) {
    const box = h('div', { class: 'pad col' });
    box.appendChild(h('button', { class: 'btn', text: '⏰ 시각 읽기 (3:15 → さんじじゅうごふん)', onclick: function () { timeRun('time'); } }));
    box.appendChild(h('button', { class: 'btn blue', text: '🗓️ 날짜 읽기 (4월 8일 → しがつようか)', onclick: function () { timeRun('date'); } }));
    box.appendChild(h('button', { class: 'btn purple', text: '🎧 시각 듣기', onclick: function () { timeRun('ltime'); } }));
    box.appendChild(h('button', { class: 'btn ghost', text: '📋 날짜·시간 읽기 표 보기', onclick: function () { APP.pop(); APP.go('library'); } }));
    el.appendChild(box);
  }
  function timeRun(mode) {
    const items = [];
    for (let i = 0; i < 12; i++) {
      if (mode === 'date') {
        const m = 1 + U.rand(12), d = U.pick([1 + U.rand(31), 1 + U.rand(10), 14, 20, 24]);
        const dd = Math.min(d, [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]);
        const r = P.monthJa(m) + P.dayJa(dd);
        items.push({ type: 'type', skill: 'write', items: [], title: '날짜를 일본어로 입력하세요', promptHtml: '<span style="font-size:36px;font-weight:800">' + m + '월 ' + dd + '일</span><div class="jp muted" style="width:100%">' + m + '月' + dd + '日</div>', mode: 'kana', answers: [r], answer: '<span class="jp">' + r + '</span>', say: r });
      } else {
        const hh = 1 + U.rand(12), mm = U.pick([0, 0, 30, 15, 45, 5, 10, 20, U.rand(60), U.rand(60)]);
        const r = P.hourJa(hh) + (mm === 30 && U.rand(2) ? 'はん' : P.minJa(mm));
        const alts = [P.hourJa(hh) + P.minJa(mm)]; if (mm === 30) alts.push(P.hourJa(hh) + 'はん');
        alts.push(alts[0].replace(/じゅっぷん/g, 'じっぷん'));
        if (mode === 'ltime') {
          items.push({ type: 'type', skill: 'listen', items: [], title: '들은 시각을 입력하세요 (예: 3:15)', audioOnly: r, mode: 'num', answers: [hh + ':' + String(mm).padStart(2, '0'), hh + String(mm).padStart(2, '0'), hh + '시' + mm + '분', hh + '시' + (mm ? mm + '분' : '')], answer: hh + ':' + String(mm).padStart(2, '0') + ' (<span class="jp">' + r + '</span>)', say: r });
        } else {
          items.push({ type: 'type', skill: 'write', items: [], title: '시각을 일본어로 입력하세요', promptHtml: '<span style="font-size:44px;font-weight:800">🕒 ' + hh + ':' + String(mm).padStart(2, '0') + '</span>', mode: 'kana', answers: alts, answer: '<span class="jp">' + alts[0] + (mm === 30 ? ' / ' + P.hourJa(hh) + 'はん' : '') + '</span>', say: alts[0] });
        }
      }
    }
    APP.state.stats.trainers++;
    run('시간·날짜', items, 10);
  }

  /* ---------- 쓰기 연습장 ---------- */
  function traceHub(el) {
    const box = h('div', { class: 'pad col' });
    box.appendChild(h('button', { class: 'btn', text: 'あ 히라가나 랜덤 10자', onclick: function () { traceRun('h'); } }));
    box.appendChild(h('button', { class: 'btn blue', text: 'ア 가타카나 랜덤 10자', onclick: function () { traceRun('k'); } }));
    box.appendChild(h('button', { class: 'btn purple', text: '漢 학습한 한자 10자', onclick: function () { traceRun('kj'); } }));
    box.appendChild(h('div', { class: 'small muted', text: '💡 가이드를 따라 손가락으로 써 보세요. "가이드 숨기기"로 기억해서 쓰기도 가능해요.' }));
    el.appendChild(box);
  }
  function traceRun(kind) {
    maps();
    let items;
    if (kind === 'kj') {
      let ks = G.COURSE.kanji.filter(function (k) { return APP.state.srs[k.id]; });
      if (ks.length < 5) ks = G.COURSE.kanji.slice(0, 40);
      items = U.sample(ks, 10).map(EX.kanjiTrace);
    } else {
      const cs = Object.keys(charMap).map(function (k) { return charMap[k]; }).filter(function (c) { return c.id.indexOf('k:' + kind + ':') === 0 && c.c.length === 1; });
      items = U.sample(cs, 10).map(EX.kanaTrace);
    }
    run('쓰기 연습', items, 8);
  }

  /* ---------- 플래시카드 ---------- */
  P.flash = function (words) {
    words = U.shuffle(words).slice(0, 30);
    let i = 0, known = 0;
    const o = h('div', { class: 'lesson' });
    const close = function () { o.remove(); overlay = null; APP.refresh(); };
    overlay = { close: close };
    const fill = h('div', { class: 'fill', style: { width: '0%' } });
    o.appendChild(h('div', { class: 'lesson-top' }, h('button', { class: 'x', html: '✕', onclick: close }), h('div', { class: 'pbar' }, fill), h('div', { class: 'hearts-ind', style: { color: 'var(--text2)' }, text: '🃏' })));
    const body = h('div', { class: 'lesson-body', style: { justifyContent: 'center' } });
    const foot = h('div', { class: 'lesson-foot row' });
    o.appendChild(body); o.appendChild(foot);
    document.body.appendChild(o);
    function draw() {
      if (i >= words.length) {
        body.innerHTML = '';
        body.appendChild(h('div', { class: 'empty-state' }, h('div', { class: 'ei', text: '🎉' }), h('h2', { text: '카드 ' + words.length + '장 완료!' }), h('div', { text: '알고 있음 ' + known + ' / 모름 ' + (words.length - known) })));
        foot.innerHTML = '';
        foot.appendChild(h('button', { class: 'btn', text: '완료 (+' + Math.max(3, Math.round(words.length / 3)) + ' XP)', onclick: function () { APP.addXp(Math.max(3, Math.round(words.length / 3))); close(); } }));
        return;
      }
      const w = words[i];
      fill.style.width = (i / words.length * 100) + '%';
      body.innerHTML = '';
      const card = h('div', { class: 'flash' });
      const inn = h('div', { class: 'flash-in' },
        h('div', { class: 'flash-face' }, w.e ? h('div', { style: { fontSize: '40px' }, text: w.e }) : null, h('div', { class: 'fw jp', html: U.wordRuby(w.w, w.r, false) }), h('div', { class: 'small muted', style: { marginTop: '18px' }, text: '탭해서 뒤집기' })),
        h('div', { class: 'flash-face back' }, h('div', { class: 'fw jp', style: { fontSize: '34px' }, html: U.wordRuby(w.w, w.r, true) }), h('div', { class: 'muted', text: U.romaji(w.r) }), h('div', { class: 'fm', style: { marginTop: '14px' }, text: w.m }), h('div', { class: 'small muted', style: { marginTop: '8px' }, text: APP.POS[w.p] || '' })));
      card.appendChild(inn);
      card.addEventListener('click', function () { card.classList.toggle('flip'); if (card.classList.contains('flip')) U.tts.speak(w.r); });
      body.appendChild(card);
      body.appendChild(h('div', { class: 'center' }, EX.spkBtn(w.r)));
      foot.innerHTML = '';
      foot.appendChild(h('button', { class: 'btn red', text: '😵 몰라요', onclick: function () { APP.srsUpdate(w.id, false); i++; draw(); } }));
      foot.appendChild(h('button', { class: 'btn', text: '😎 알아요', onclick: function () { APP.srsUpdate(w.id, true); known++; i++; draw(); } }));
    }
    draw();
  };

  /* ---------- 스피드 퀴즈 ---------- */
  P.speed = function (kind) {
    maps();
    const dur = kind === 'kana' ? 60 : 90;
    let pool;
    if (kind === 'kana') pool = Object.keys(charMap).map(function (k) { return charMap[k]; });
    else { pool = learnedWords(); if (pool.length < 10) pool = G.COURSE.words.slice(0, 150); }
    let score = 0, miss = 0, t0 = Date.now(), tm = null;
    const o = h('div', { class: 'lesson' });
    const close = function () { clearInterval(tm); o.remove(); overlay = null; APP.refresh(); };
    overlay = { close: close };
    const fill = h('div', { class: 'fill', style: { width: '100%', background: 'var(--orange)' } });
    const sc = h('div', { class: 'hearts-ind', style: { color: 'var(--orange)' }, text: '0' });
    o.appendChild(h('div', { class: 'lesson-top' }, h('button', { class: 'x', html: '✕', onclick: close }), h('div', { class: 'pbar' }, fill), sc));
    const body = h('div', { class: 'lesson-body' });
    o.appendChild(body); document.body.appendChild(o);
    const best = (APP.state.stats['best_' + kind] || 0);
    function q() {
      const it = U.pick(pool);
      body.innerHTML = '';
      const ds = U.sample(pool.filter(function (x) { return kind === 'kana' ? x.r !== it.r : x.m !== it.m; }), 3);
      const opts = U.shuffle([it].concat(ds));
      body.appendChild(h('div', { class: 'center', style: { margin: '20px 0 30px' } }, h('div', { class: 'jp', style: { fontSize: kind === 'kana' ? '110px' : '48px', color: 'var(--title)' }, html: kind === 'kana' ? it.c : U.wordRuby(it.w, it.r, APP.state.settings.furi) })));
      const g = h('div', { class: 'opts grid' });
      opts.forEach(function (op) {
        g.appendChild(h('button', { class: 'opt', style: { justifyContent: 'center', minHeight: '64px' }, html: kind === 'kana' ? '<b>' + op.r + '</b>' : U.esc(op.m), onclick: function (e) {
          if (op === it) { score++; U.sfx('ok'); APP.track('read', true); } else { miss++; U.sfx('bad'); U.vibrate(60); e.currentTarget.classList.add('wrong'); }
          sc.textContent = String(score);
          setTimeout(q, op === it ? 60 : 350);
        } }));
      });
      body.appendChild(g);
      body.appendChild(h('div', { class: 'center muted small', style: { marginTop: '20px' }, text: '최고 기록: ' + best }));
    }
    tm = setInterval(function () {
      const left = dur - (Date.now() - t0) / 1000;
      fill.style.width = Math.max(0, left / dur * 100) + '%';
      if (left <= 0) {
        clearInterval(tm);
        const xp = Math.max(2, Math.round(score / 2));
        if (score > best) APP.state.stats['best_' + kind] = score;
        body.innerHTML = '';
        body.appendChild(h('div', { class: 'empty-state' }, h('div', { class: 'ei', text: score > best ? '🏆' : '⏱️' }), h('h2', { text: '점수: ' + score }), h('div', { text: (score > best ? '신기록! ' : '') + '오답 ' + miss + ' · +' + xp + ' XP' })));
        body.appendChild(h('button', { class: 'btn', style: { marginTop: '20px' }, text: '완료', onclick: function () { APP.addXp(xp); APP.state.stats.trainers++; APP.checkAch(); close(); } }));
        U.sfx('done');
      }
    }, 100);
    q();
  };

  /* ---------- 스토리 ---------- */
  function storyList(el) {
    const list = G.STORIES || [];
    el.appendChild(h('div', { class: 'h-sub', style: { marginTop: '12px' }, text: '실제 상황 회화를 읽고 듣고, 이해도 문제를 풀어요' }));
    let lastLv = null;
    list.forEach(function (s, i) {
      if (s.lv !== lastLv) { lastLv = s.lv; el.appendChild(h('div', { class: 'sec-label', text: s.lv })); }
      const done = APP.state.storiesDone[s.id];
      el.appendChild(h('div', { class: 'li', style: { padding: '12px 16px' }, onclick: function () { P.playStory(s); } },
        h('div', { class: 'lic', style: { background: done ? 'var(--yellow)' : 'var(--bg2)' }, text: s.e }),
        h('div', { class: 'lit' }, h('b', { text: (i + 1) + '. ' + s.t }), h('span', { text: s.d + ' · ' + s.lines.length + '줄' + (done ? ' · 완료 ✓' : '') })), h('span', { class: 'chev', text: '›' })));
    });
  }
  P.playStory = function (s) {
    const chars = s.c || {};
    let i = 0, qi = 0, correct = 0, wrong = 0;
    const qs = (s.q || []).slice().sort(function (a, b) { return a.at - b.at; });
    const o = h('div', { class: 'lesson' });
    const close = function () { o.remove(); overlay = null; U.tts.stop(); APP.refresh(); };
    overlay = { close: close };
    const fill = h('div', { class: 'fill', style: { width: '0%' } });
    o.appendChild(h('div', { class: 'lesson-top' }, h('button', { class: 'x', html: '✕', onclick: close }), h('div', { class: 'pbar' }, fill), h('div', { class: 'hearts-ind', style: { color: 'var(--text2)' }, text: s.e })));
    const body = h('div', { class: 'lesson-body' });
    const foot = h('div', { class: 'lesson-foot' });
    o.appendChild(body); o.appendChild(foot); document.body.appendChild(o);
    body.appendChild(h('div', { class: 'center', style: { margin: '6px 0 10px' } }, h('div', { style: { fontSize: '60px' }, text: s.e }), h('h2', { style: { margin: '4px 0', color: 'var(--title)' }, text: s.t }), h('div', { class: 'muted small', text: s.d })));
    const btn = h('button', { class: 'btn', text: '시작' });
    foot.appendChild(btn);
    btn.addEventListener('click', step);
    function lineEl(ln) {
      const f = ln.split('|');
      const who = f[0], j = f[1], k = f[2] || '';
      const nar = who === 'N';
      const ch = chars[who] || { e: '🙂', n: who };
      const bub = h('div', { class: 'sbub' }, nar ? null : h('div', { class: 'small', style: { fontWeight: '800', color: 'var(--text2)' }, text: ch.n }), h('div', { class: 'sj jp', html: U.ruby(j, APP.state.settings.furi) }));
      const kk = h('div', { class: 'sk', text: k, style: { display: 'none' } });
      bub.appendChild(kk);
      bub.appendChild(h('div', { class: 'row', style: { gap: '6px', marginTop: '6px', justifyContent: 'flex-start' } },
        h('button', { class: 'btn ghost sm', style: { flex: 'none' }, text: '🔊', onclick: function () { U.tts.speak(U.plain(j)); } }),
        h('button', { class: 'btn ghost sm gray', style: { flex: 'none' }, text: '번역', onclick: function () { kk.style.display = kk.style.display === 'none' ? 'block' : 'none'; } })));
      const row = h('div', { class: 'story-line' + (nar ? ' nar' : '') }, h('div', { class: 'sav', text: nar ? '📜' : ch.e }), bub);
      U.tts.speak(U.plain(j));
      return row;
    }
    function step() {
      if (qi < qs.length && qs[qi].at <= i) return ask(qs[qi++]);
      if (i >= s.lines.length) return end();
      const row = lineEl(s.lines[i]); body.appendChild(row); i++;
      fill.style.width = (i / s.lines.length * 100) + '%';
      btn.textContent = '계속';
      setTimeout(function () { row.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 20);
    }
    function ask(q) {
      btn.classList.add('hidden');
      const box = h('div', { class: 'card', style: { margin: '14px 0', borderColor: 'var(--purple)' } }, h('div', { class: 'ex-badge', text: '이해도 확인' }), h('b', { style: { display: 'block', margin: '4px 0 10px', color: 'var(--title)' }, html: q.q }));
      const opts = h('div', { class: 'opts' });
      q.o.forEach(function (op, k) {
        const b = h('button', { class: 'opt', html: op });
        b.addEventListener('click', function () {
          if (box._done) return; box._done = true;
          if (k === q.a) { b.classList.add('right'); correct++; U.sfx('ok'); } else { b.classList.add('wrong'); opts.childNodes[q.a].classList.add('right'); wrong++; U.sfx('bad'); }
          btn.classList.remove('hidden');
        });
        opts.appendChild(b);
      });
      box.appendChild(opts); body.appendChild(box);
      setTimeout(function () { box.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 20);
    }
    function end() {
      foot.innerHTML = '';
      const first = !APP.state.storiesDone[s.id];
      APP.state.storiesDone[s.id] = true; APP.state.stats.stories += first ? 1 : 0;
      foot.appendChild(h('button', { class: 'btn', text: '스토리 완료!', onclick: function () {
        o.remove(); overlay = null;
        const res = { passed: true, correct: correct, wrong: wrong, acc: correct + wrong ? Math.round(correct / (correct + wrong) * 100) : 100, ms: 60000, perfect: wrong === 0, maxCombo: correct, mode: 'story' };
        res.xp = APP.awardLesson(res, { mode: 'story', xp: first ? 15 : 5 });
        G.LESSON.showResult(res, { mode: 'story', onDone: APP.afterLesson });
      } }));
    }
  };

  /* ---------- JLPT 모의고사 ---------- */
  function jlptHub(el) {
    const box = h('div', { class: 'pad' });
    box.appendChild(h('div', { class: 'small muted', style: { marginBottom: '14px' }, text: '코스 데이터로 매번 새롭게 출제되는 실전형 모의고사 (문자·어휘 / 문법 / 청해 / 독해). 60% 이상이면 합격!' }));
    [['N5', [2, 3], 5], ['N4', [4], 4], ['N3', [5], 3]].forEach(function (x) {
      const best = APP.state.jlpt[x[0]];
      box.appendChild(h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { style: { fontSize: '40px', flex: 'none' }, text: x[0] === 'N5' ? '🌱' : x[0] === 'N4' ? '🌿' : '🌳' }),
        h('div', null, h('h3', { text: 'JLPT ' + x[0] + ' 모의고사' }), h('div', { class: 'small muted', text: '30문항 · 최고 점수 ' + (best !== undefined ? best + '점' : '-') }))),
        h('button', { class: 'btn', style: { marginTop: '10px' }, text: '시험 시작', onclick: function () { jlptRun(x[0], x[1], x[2]); } })));
    });
    el.appendChild(box);
  }
  function jlptRun(name, secs, kjLv) {
    const units = G.COURSE.units.filter(function (u) { return secs.indexOf(u.sec) >= 0; });
    const words = [].concat.apply([], units.map(function (u) { return u.words; }));
    const sents = [].concat.apply([], units.map(function (u) { return u.sents; }));
    const kanji = G.COURSE.kanji.filter(function (k) { return k.lv === kjLv; });
    const kw = words.filter(function (w) { return U.hasKanji(w.w); });
    const items = [];
    U.sample(kw, 6).forEach(function (w) { // 한자 읽기
      const ds = U.uniq(U.sample(kw.filter(function (x) { return x.r !== w.r; }), 3).map(function (x) { return x.r; }));
      const opts = U.shuffle([w.r].concat(ds));
      items.push({ type: 'mc', skill: 'read', items: [w.id], title: '문자·어휘: 밑줄 친 단어의 읽기는?', bigChar: null, promptWord: { w: w.w, r: '', m: w.m }, opts: opts.map(function (o) { return { html: '<span class="jp">' + o + '</span>', ok: o === w.r }; }), answer: w.w + ' = ' + w.r });
    });
    U.sample(kanji, 3).forEach(function (k) { items.push(EX.kanjiMeaning(k, kanji)); });
    U.sample(words, 6).forEach(function (w, i) { items.push(i % 2 ? EX.wordMC(w, words) : EX.meaningMC(w, words)); });
    U.sample(sents, 8).forEach(function (s) { const f = EX.fill(s, sents, words); if (f) { f.title = '문법: 빈칸에 들어갈 말은?'; items.push(f); } });
    U.sample(sents, 4).forEach(function (s) { const m = EX.sentMC(s, sents); if (m) { m.title = '독해: 문장의 뜻은?'; items.push(m); } });
    if (APP.state.settings.listening) U.sample(sents, 4).forEach(function (s) {
      const others = U.sample(sents.filter(function (x) { return x !== s; }), 3);
      const opts = U.shuffle([s].concat(others));
      items.push({ type: 'mc', skill: 'listen', items: [s.id], title: '청해: 들은 문장의 뜻은?', audioOnly: U.plain(s.j), opts: opts.map(function (o) { return { html: U.esc(o.k), ok: o === s }; }), answer: EX.sentHtml(s, false) + '<br>' + U.esc(s.k) });
    });
    const list = items.filter(Boolean).slice(0, 30);
    G.LESSON.run({ title: 'JLPT ' + name, items: list, mode: 'practice', xp: 25, onQuit: APP.refresh,
      after: function (res) { const sc = res.acc; APP.state.jlpt[name] = Math.max(APP.state.jlpt[name] || 0, sc); res.bonus = (res.bonus ? res.bonus + ' · ' : '') + (sc >= 60 ? '🎉 ' + name + ' 합격권 (' + sc + '점)' : '😅 ' + name + ' 불합격 (' + sc + '점) — 60점 이상 합격'); },
      onDone: APP.afterLesson });
  }
})(window);
