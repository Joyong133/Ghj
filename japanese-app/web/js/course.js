/* 코스 구성: 데이터 파싱, 섹션/유닛/노드, 사전(힌트) */
(function (G) {
  'use strict';
  const U = G.U;
  const C = { sections: [], units: [], unitMap: {}, words: [], wordMap: {}, sents: [], kanji: [], kanjiMap: {}, dict: {}, tips: [] };

  const PARTICLES = {
    'は': '~은/는 (주제)', 'が': '~이/가 (주어)', 'を': '~을/를 (목적어)', 'に': '~에/~에게 (장소·시간·대상)', 'で': '~에서/~로 (장소·수단)',
    'へ': '~(으)로 (방향)', 'と': '~와/과, ~라고', 'も': '~도', 'の': '~의, ~것', 'から': '~부터, ~에서, ~니까', 'まで': '~까지', 'や': '~이랑, ~나',
    'か': '~까? (의문)', 'ね': '~네요, ~지요 (동의)', 'よ': '~요 (알림·강조)', 'より': '~보다', 'しか': '~밖에', 'だけ': '~만, ~뿐', 'ほど': '~정도, ~만큼',
    'です': '~입니다', 'でした': '~이었습니다', 'だ': '~이다', 'だった': '~이었다', 'ます': '~합니다', 'ません': '~하지 않습니다', 'ました': '~했습니다',
    'ませんでした': '~하지 않았습니다', 'じゃありません': '~이/가 아닙니다', 'ではありません': '~이/가 아닙니다', 'ましょう': '~합시다', 'ませんか': '~하지 않을래요?',
    'ください': '~주세요', 'たい': '~하고 싶다', 'たいです': '~하고 싶습니다', 'けど': '~지만', 'けれど': '~지만', 'でも': '하지만, ~라도', 'ので': '~이므로',
    'のに': '~인데도', 'ながら': '~하면서', 'たら': '~하면', 'ば': '~하면', 'なら': '~라면', 'って': '~래, ~라는', 'かな': '~일까', 'わ': '~요(여성어)', 'ぞ': '~다(강조)',
    'ごろ': '~쯤 (시각)', 'ぐらい': '~정도', 'くらい': '~정도', 'など': '~등', 'ずつ': '~씩', 'でしょう': '~겠지요', 'だろう': '~겠지', 'という': '~라는',
    'ている': '~하고 있다', 'ています': '~하고 있습니다', 'てください': '~해 주세요', 'さん': '~씨', 'ちゃん': '~짱(애칭)', 'くん': '~군', 'さま': '~님',
    'じゃない': '~가 아니다', 'ない': '없다/~지 않다', 'あります': '있습니다(사물)', 'います': '있습니다(사람·동물)', 'ありません': '없습니다', 'いません': '없습니다',
    'こと': '~것(일)', 'もの': '~것(물건)', 'とき': '~때', 'ため': '~위해', 'ように': '~하도록', 'そう': '~해 보인다', 'みたい': '~같다', 'らしい': '~답다/~라고 한다'
  };

  /* ---------- 파싱 ---------- */
  function lines(s) { return String(s || '').split('\n').map(function (x) { return x.trim(); }).filter(function (x) { return x && x[0] !== '#'; }); }

  function parseWords(text, uid) {
    return lines(text).map(function (ln, i) {
      const f = ln.split('|');
      const w = f[0].trim(); const r = (f[1] || '').trim() || w;
      return { id: 'w:' + w + ':' + r, w: w, r: r, m: (f[2] || '').trim(), p: (f[3] || 'n').trim(), e: (f[4] || '').trim(), u: uid, i: i };
    });
  }
  function parseSents(text, uid) {
    return lines(text).map(function (ln, i) {
      const f = ln.split('|');
      return { id: 's:' + uid + ':' + i, j: f[0].trim(), k: (f[1] || '').trim(), alt: (f[2] || '').split(';').map(function (x) { return x.trim(); }).filter(Boolean), u: uid, i: i };
    });
  }
  C.tokens = function (sent) {
    return sent.j.split(/\s+/).filter(Boolean).map(function (t) {
      const p = U.plain(t).replace(/[。、！？!?「」]/g, '');
      return { raw: t, p: p, r: U.readingOf(t).replace(/[。、！？!?「」]/g, '') };
    }).filter(function (t) { return t.p; });
  };
  C.koTokens = function (k) {
    return k.split(/\s+/).map(function (t) { return t.replace(/[.,!?。]+$/g, ''); }).filter(Boolean);
  };

  function addDict(key, val) {
    if (!key) return;
    if (!C.dict[key]) C.dict[key] = [];
    if (C.dict[key].length < 3 && !C.dict[key].some(function (x) { return x.m === val.m && x.f === val.f; })) C.dict[key].push(val);
  }
  C.lookup = function (surface) {
    const s = U.plain(surface).replace(/[。、！？!?「」]/g, '');
    if (C.dict[s]) return C.dict[s];
    if (PARTICLES[s]) return [{ m: PARTICLES[s] }];
    // 앞부분부터 가장 긴 사전 단어
    for (let L = s.length - 1; L >= 1; L--) {
      const a = s.slice(0, L), b = s.slice(L);
      if (C.dict[a] && (PARTICLES[b] || C.dict[b])) {
        return [{ m: C.dict[a][0].m + ' + ' + (PARTICLES[b] || C.dict[b][0].m), r: C.dict[a][0].r }];
      }
    }
    return null;
  };
  C.PARTICLES = PARTICLES;

  /* ---------- 섹션/유닛 구성 ---------- */
  const SEC_META = [
    { id: 1, t: '문자 마스터', st: '히라가나 · 가타카나', color: '#58cc02', dark: '#46a302', cefr: '시작' },
    { id: 2, t: '입문', st: '첫걸음 · 기초 표현 (JLPT N5)', color: '#ce82ff', dark: '#a568cc', cefr: 'N5' },
    { id: 3, t: '초급', st: '일상 회화 · 동사 활용 (JLPT N5)', color: '#00cd9c', dark: '#00a57d', cefr: 'N5+' },
    { id: 4, t: '초중급', st: '복합 문법 · 경어 (JLPT N4)', color: '#1cb0f6', dark: '#1899d6', cefr: 'N4' },
    { id: 5, t: '중급', st: '사회 · 문화 · 고급 문형 (JLPT N3)', color: '#ff9600', dark: '#e08600', cefr: 'N3' },
    { id: 6, t: '한자 트랙', st: '한자 훈음 · 음독 · 훈독 (N5~N3)', color: '#ff4b4b', dark: '#ea2b2b', cefr: '漢字', free: true }
  ];
  const UNIT_COLORS = ['#58cc02', '#ce82ff', '#00cd9c', '#1cb0f6', '#ff9600', '#ff4b4b', '#ff86d0', '#2bdbc2', '#a56644', '#7c83fd'];

  C.NODES = [
    { k: 'learn1', ic: '⭐', n: '새 단어 1' },
    { k: 'learn2', ic: '📖', n: '새 단어 2' },
    { k: 'chest', ic: '🎁', n: '보물상자' },
    { k: 'sent', ic: '💬', n: '문장 만들기' },
    { k: 'listen', ic: '🎧', n: '듣기·말하기' },
    { k: 'practice', ic: '🏋️', n: '종합 연습' },
    { k: 'test', ic: '🏆', n: '유닛 테스트' }
  ];

  C.build = function () {
    C.sections = SEC_META.map(function (s) { return Object.assign({ units: [] }, s); });
    const secMap = {}; C.sections.forEach(function (s) { secMap[s.id] = s; });
    let colorIdx = 0;

    // 1) 가나 유닛
    const K = G.KANA;
    K.units.forEach(function (ku) {
      const chars = [];
      ku.rows.forEach(function (rk) { K.rows[rk].forEach(function (r) { chars.push({ id: 'k:' + ku.script + ':' + r[0], c: ku.script === 'h' ? r[0] : r[1], o: ku.script === 'h' ? r[1] : r[0], r: r[2], ko: r[3], mn: ku.script === 'h' ? (K.mnemo[r[0]] || '') : '' }); }); });
      const words = (K.words[ku.id] || []).map(function (x, i) { return { id: 'kw:' + x[0], w: x[0], r: x[0], m: x[1], p: 'n', e: '', u: ku.id, i: i }; });
      const unit = { id: ku.id, kind: 'kana', sec: 1, t: (ku.script === 'h' ? '히라가나 ' : '가타카나 ') + ku.t, e: ku.script === 'h' ? 'あ' : 'ア', chars: chars, words: words, sents: [], script: ku.script, color: UNIT_COLORS[colorIdx++ % UNIT_COLORS.length] };
      unit.tip = kanaTip(ku, chars);
      push(unit);
    });

    // 2) 주제 유닛
    (G.UNITS || []).forEach(function (raw) {
      const unit = { id: raw.id, kind: 'topic', sec: raw.sec, t: raw.t, e: raw.e || '📘', color: UNIT_COLORS[colorIdx++ % UNIT_COLORS.length] };
      unit.words = parseWords(raw.w, raw.id);
      unit.sents = parseSents(raw.s, raw.id);
      unit.tip = raw.tip || null;
      if (unit.tip) unit.tip.u = raw.id;
      push(unit);
    });

    // 3) 한자 유닛
    const KJ = (G.KANJI_DATA || '').split('\n').map(function (x) { return x.trim(); }).filter(function (x) { return x && x[0] !== '#'; });
    const byLv = {};
    KJ.forEach(function (ln, i) {
      const f = ln.split('|');
      const ex = (f[5] || '').split(';').filter(Boolean).map(function (e) {
        const m = e.match(/^(.+?)\((.+?)\)=?(.*)$/);
        return m ? { w: m[1], r: m[2], m: m[3] } : null;
      }).filter(Boolean);
      const k = { id: 'kj:' + f[0], c: f[0], hm: f[1], on: (f[2] || '').split(',').filter(Boolean), kun: (f[3] || '').split(',').filter(Boolean), lv: +(f[4] || 5), ex: ex, i: i };
      C.kanji.push(k); C.kanjiMap[k.c] = k;
      (byLv[k.lv] = byLv[k.lv] || []).push(k);
    });
    [5, 4, 3].forEach(function (lv) {
      const arr = byLv[lv] || [];
      for (let i = 0; i < arr.length; i += 10) {
        const chunk = arr.slice(i, i + 10);
        const n = Math.floor(i / 10) + 1;
        const unit = { id: 'kj' + lv + '-' + n, kind: 'kanji', sec: 6, t: 'N' + lv + ' 한자 ' + n + ': ' + chunk.slice(0, 5).map(function (k) { return k.c; }).join(''), e: chunk[0].c, kanji: chunk, words: [], sents: [], color: UNIT_COLORS[colorIdx++ % UNIT_COLORS.length], lv: lv };
        chunk.forEach(function (k) {
          k.ex.forEach(function (e, j) { unit.words.push({ id: 'w:' + e.w + ':' + e.r, w: e.w, r: e.r, m: e.m, p: 'n', e: '', u: unit.id, i: j, kj: k.c }); });
        });
        push(unit);
      }
    });

    function push(unit) {
      const sec = secMap[unit.sec]; if (!sec) return;
      unit.idx = sec.units.length; unit.secObj = sec;
      sec.units.push(unit); C.units.push(unit); C.unitMap[unit.id] = unit;
      if (unit.tip) C.tips.push(unit.tip);
      unit.words.forEach(function (w) {
        if (!C.wordMap[w.id]) { C.wordMap[w.id] = w; C.words.push(w); }
      });
      unit.sents.forEach(function (s) { C.sents.push(s); });
    }

    // 사전 (탭 힌트)
    C.words.forEach(function (w) {
      addDict(w.w, { m: w.m, r: w.r });
      if (w.r !== w.w) addDict(w.r, { m: w.m, r: w.r });
      if (/^v|^a[in]$/.test(w.p)) {
        G.CONJ.allForms(w.w, w.r, w.p).forEach(function (f) {
          addDict(f.w, { m: w.m, r: f.r, f: w.w + ' · ' + f.f });
        });
      }
    });
    C.kanji.forEach(function (k) { if (!C.dict[k.c]) addDict(k.c, { m: k.hm, r: (k.kun[0] || k.on[0] || '').replace(/\./g, '') }); });
    return C;
  };

  function kanaTip(ku, chars) {
    const name = ku.script === 'h' ? '히라가나' : '가타카나';
    let b = '';
    if (ku.id === 'h1') b += '<p><b>히라가나</b>는 일본어의 기본 문자입니다. 조사·어미·고유어를 쓸 때 사용하고, 모든 한자의 읽기(후리가나)도 히라가나로 적습니다.</p><p>일본어 모음은 <b>あ(a) い(i) う(u) え(e) お(o)</b> 다섯 개뿐! 한국어보다 단순해요. 단, う는 입술을 둥글게 내밀지 않고 "우"와 "으"의 중간처럼 발음합니다.</p>';
    if (ku.id === 'h6') b += '<p>글자 오른쪽 위의 점 두 개(<b>゛ 탁점</b>)는 소리를 탁하게 만듭니다. か→が, さ→ざ, た→だ, は→ば</p><div class="pt">じ와 ぢ, ず와 づ는 발음이 같아요. 보통 じ·ず를 쓰고, ぢ·づ는 はなぢ(코피), つづく(계속되다) 같은 특정 단어에서만 씁니다.</div>';
    if (ku.id === 'h7') b += '<p>동그라미(<b>゜ 반탁점</b>)는 は행에만 붙어서 p 소리를 만듭니다: ぱ ぴ ぷ ぺ ぽ</p>';
    if (ku.id === 'h8') b += '<p>い단 글자(き, し, ち…) 뒤에 <b>작은 ゃ ゅ ょ</b>를 붙이면 한 박자로 합쳐 읽습니다. き+ゃ = きゃ(kya, 캬)</p><div class="pt">きや(ki-ya, 2박) 와 きゃ(kya, 1박)는 다른 소리예요! 크기에 주의하세요.</div>';
    if (ku.id === 'h9') b += '<h4>촉음 っ (작은 つ)</h4><p>작은 っ는 다음 자음을 한 박자 끊어 발음합니다. 한국어 받침 ㄱ·ㅅ·ㅂ과 비슷해요. きって(킷테, 우표), がっこう(각코-, 학교)</p><h4>장음 (길게 늘이기)</h4><p>모음을 한 박자 더 길게 발음합니다.</p><table><tr><th>앞 글자</th><th>장음 표기</th><th>예</th></tr><tr><td>あ단</td><td>+あ</td><td>おかあさん</td></tr><tr><td>い단</td><td>+い</td><td>おにいさん</td></tr><tr><td>う단</td><td>+う</td><td>すうがく</td></tr><tr><td>え단</td><td>+い/え</td><td>せんせい, おねえさん</td></tr><tr><td>お단</td><td>+う/お</td><td>がっこう, とおい</td></tr></table><div class="pt">가타카나에서는 장음을 <b>ー</b>로 표시합니다: コーヒー, ケーキ</div>';
    if (ku.id === 'k1') b += '<p><b>가타카나</b>는 외래어(コーヒー 커피), 외국 이름, 의성어, 강조 표현에 사용합니다. 히라가나와 소리는 같고 모양만 다릅니다. 직선적이고 각진 모양이 특징이에요.</p><div class="pt">장음은 <b>ー</b>(장음 부호)로 표시합니다. ケーキ = け+え(길게)+き</div>';
    if (ku.id === 'k3') b += '<div class="pt">헷갈리기 쉬운 글자: <b>シ(shi)</b>와 <b>ツ(tsu)</b>, <b>ソ(so)</b>와 <b>ン(n)</b>. シ·ン은 획이 아래에서 위로, ツ·ソ는 위에서 아래로 향합니다.</div>';
    if (ku.id === 'k9') b += '<p>원래 일본어에 없는 외국어 소리를 표기하기 위해 작은 ァ ィ ゥ ェ ォ를 조합합니다. ファ(fa), ティ(ti), ウィ(wi), ヴ(vu)…</p>';
    b += '<h4>이번 유닛의 ' + name + '</h4><table><tr><th>글자</th><th>로마자</th><th>발음</th></tr>' + chars.map(function (c) { return '<tr><td class="jp" style="font-size:22px">' + c.c + '</td><td>' + c.r + '</td><td>' + c.ko + '</td></tr>'; }).join('') + '</table>';
    return { t: name + ' ' + ku.t, b: b, ex: [], u: ku.id };
  }

  C.secOf = function (u) { return u.secObj; };
  G.COURSE = C;
})(window);
