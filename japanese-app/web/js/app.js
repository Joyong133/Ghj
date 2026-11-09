/* 메인 앱: 상태, 게임화, 내비게이션, 학습 경로, 리그, 퀘스트, 프로필, 상점, 설정 */
(function (G) {
  'use strict';
  const U = G.U, h = U.h;
  const APP = {};
  G.APP = APP;
  const KEY = 'nihongo_master_v1';
  APP.HEART_MIN = 20; APP.HEART_COST = 300; APP.MAX_HEARTS = 5;
  const SRS_DAYS = [0, 1, 2, 4, 7, 14, 30, 60, 120];
  const LEAGUES = [
    { n: '브론즈', i: '🥉', c: '#cd7f32' }, { n: '실버', i: '🥈', c: '#9ba6ad' }, { n: '골드', i: '🥇', c: '#ffc800' }, { n: '사파이어', i: '💠', c: '#1cb0f6' },
    { n: '루비', i: '♦️', c: '#ff4b4b' }, { n: '에메랄드', i: '💚', c: '#58cc02' }, { n: '자수정', i: '🔮', c: '#ce82ff' }, { n: '진주', i: '🦪', c: '#ff86d0' },
    { n: '흑요석', i: '🖤', c: '#4b4b4b' }, { n: '다이아몬드', i: '💎', c: '#2bdbc2' }
  ];
  APP.LEAGUES = LEAGUES;
  const AVATARS = ['🦊', '🐱', '🐶', '🐼', '🐰', '🐻', '🐯', '🦁', '🐸', '🐧', '🦉', '🐨', '🐹', '🦄', '🐙', '🐳', '🦋', '🌸', '🍙', '🍣', '⛩️', '🗻', '🎌', '🎎'];
  APP.AVATARS = AVATARS;

  function defState() {
    return {
      v: 3, name: '학습자', avatar: '🦊', created: U.dayNum(), xp: 0, gems: 500, hearts: 5, heartTs: Date.now(),
      streak: 0, longest: 0, lastDay: null, freeze: 0, daily: {}, progress: {}, jumped: {}, srs: {}, mistakes: {}, saved: [], fav: [],
      stats: { lessons: 0, perfect: 0, listen: 0, speak: 0, write: 0, read: 0, correct: 0, wrong: 0, stories: 0, tests: 0, trainers: 0, maxCombo: 0, reviews: 0, ms: 0, chests: 0 },
      quests: null, league: null, ach: {}, storiesDone: {}, boostUntil: 0, onboarded: false, maxTier: 0, jlpt: {},
      settings: { furi: true, romaji: false, ttsRate: 0.9, sound: true, vibrate: true, unlimitedHearts: true, autoplay: true, listening: true, speaking: true, dark: 'auto', goal: 20, unlockAll: false }
    };
  }
  APP.load = function () {
    const d = defState();
    const s = U.store.get(KEY, null);
    if (s && typeof s === 'object') {
      for (const k in d) if (s[k] === undefined) s[k] = d[k];
      for (const k in d.settings) if (s.settings[k] === undefined) s.settings[k] = d.settings[k];
      for (const k in d.stats) if (s.stats[k] === undefined) s.stats[k] = d.stats[k];
      APP.state = s;
      if (!s.v || s.v < 2) { // v1(7노드) → v2(8노드: 심화 추가)
        for (const id in s.progress) { if (s.progress[id] >= 7) s.progress[id] = 8; }
        s.v = 2;
      }
      if (s.v < 3) { // v3: 무제한 하트를 기본으로 (한 번만 적용, 이후엔 설정 존중)
        s.settings.unlimitedHearts = true;
        s.v = 3;
      }
    } else APP.state = d;
  };
  let saveT = null;
  APP.save = function () { clearTimeout(saveT); saveT = setTimeout(APP.saveNow, 120); };
  APP.saveNow = function () { U.store.set(KEY, APP.state); };
  G.__onPause = function () { APP.saveNow(); };

  /* ---------- SRS ---------- */
  APP.today = function () { return U.dayNum(); };
  APP.srsSeen = function (id) {
    const s = APP.state.srs;
    if (!s[id]) { s[id] = { l: 1, due: APP.today() + 1, ok: 0, ng: 0, t: APP.today() }; APP._newToday = (APP._newToday || 0) + 1; questProg('words', 1); }
  };
  APP.srsUpdate = function (id, ok) {
    const s = APP.state.srs; const t = APP.today();
    let it = s[id];
    if (!it) { APP.srsSeen(id); it = s[id]; }
    if (ok) { it.ok++; if (it.due <= t) { it.l = Math.min(8, it.l + 1); it.due = t + SRS_DAYS[it.l]; } }
    else { it.ng++; it.l = Math.max(1, it.l - 2); it.due = t; }
    APP.save();
  };
  APP.dueItems = function () {
    const t = APP.today(), s = APP.state.srs, out = [];
    for (const id in s) if (s[id].due <= t) out.push(id);
    return out;
  };
  APP.addMistake = function (id) { const m = APP.state.mistakes; m[id] = (m[id] || 0) + 1; };
  APP.saveSentence = function (id) { if (APP.state.saved.indexOf(id) < 0) APP.state.saved.push(id); APP.save(); };
  APP.learnedCount = function (prefix) {
    let n = 0; for (const id in APP.state.srs) if (id.indexOf(prefix) === 0) n++; return n;
  };
  APP.strength = function (id) { const it = APP.state.srs[id]; return it ? it.l / 8 : 0; };

  /* ---------- 하트/보석 ---------- */
  APP.hearts = function () {
    const st = APP.state;
    if (st.hearts < APP.MAX_HEARTS) {
      const gain = Math.floor((Date.now() - st.heartTs) / (APP.HEART_MIN * 60000));
      if (gain > 0) { st.hearts = Math.min(APP.MAX_HEARTS, st.hearts + gain); st.heartTs += gain * APP.HEART_MIN * 60000; if (st.hearts >= APP.MAX_HEARTS) st.heartTs = Date.now(); }
    } else st.heartTs = Date.now();
    return st.hearts;
  };
  APP.loseHeart = function () { APP.hearts(); if (APP.state.hearts >= APP.MAX_HEARTS) APP.state.heartTs = Date.now(); APP.state.hearts = Math.max(0, APP.state.hearts - 1); APP.save(); };
  APP.gainHeart = function (n) { APP.state.hearts = Math.min(APP.MAX_HEARTS, APP.hearts() + (n || 1)); APP.save(); };
  APP.buyHearts = function () {
    if (APP.state.gems < APP.HEART_COST) return false;
    APP.state.gems -= APP.HEART_COST; APP.state.hearts = APP.MAX_HEARTS; APP.save(); return true;
  };
  APP.addGems = function (n) { APP.state.gems += n; APP.save(); };

  /* ---------- 연속 학습 ---------- */
  APP.checkStreak = function () {
    const st = APP.state, t = APP.today();
    if (st.lastDay === null || st.lastDay === undefined) return;
    const gap = t - st.lastDay;
    if (gap > 1) {
      const miss = gap - 1;
      if (st.freeze >= miss) { st.freeze -= miss; st.lastDay = t - 1; U.toast('🧊 스트릭 프리즈 ' + miss + '개가 연속 학습을 지켰어요!'); }
      else { if (st.streak > 0) APP._lostStreak = st.streak; st.streak = 0; }
      APP.save();
    }
  };
  function touchStreak() {
    const st = APP.state, t = APP.today();
    if (st.lastDay === t) return false;
    if (st.lastDay === t - 1) st.streak++;
    else st.streak = 1;
    st.lastDay = t; st.longest = Math.max(st.longest, st.streak);
    return true;
  }
  APP.todayXp = function () { return APP.state.daily[APP.today()] || 0; };

  /* ---------- XP / 보상 ---------- */
  APP.addXp = function (n) {
    const st = APP.state;
    if (Date.now() < st.boostUntil) n *= 2;
    const t = APP.today();
    const before = st.daily[t] || 0;
    st.xp += n; st.daily[t] = before + n;
    leagueSync(); st.league.xp += n;
    questProg('xp', n);
    const newStreak = touchStreak();
    if (before < st.settings.goal && before + n >= st.settings.goal) APP._goalHit = true;
    if (newStreak) APP._streakUp = true;
    APP.save();
    return n;
  };
  APP.track = function (skill, ok) {
    const s = APP.state.stats;
    if (ok) { s.correct++; if (skill && s[skill] !== undefined) s[skill]++; if (skill === 'listen') questProg('listen', 1); if (skill === 'speak') questProg('speak', 1); }
    else s.wrong++;
  };
  APP.awardLesson = function (res, cfg) {
    const st = APP.state, s = st.stats;
    let base = { lesson: 10, test: 20, practice: 8, story: 15, trainer: 0, review: 10 }[cfg.mode || 'lesson'] || 10;
    if (cfg.xp !== undefined) base = cfg.xp;
    let xp = base;
    const bonus = [];
    if (res.perfect && (cfg.mode === 'lesson' || cfg.mode === 'test' || !cfg.mode)) { xp += 5; bonus.push('완벽 보너스 +5'); }
    const cb = Math.floor(res.maxCombo / 5); if (cb) { xp += cb; bonus.push('콤보 보너스 +' + cb); }
    if (Date.now() < st.boostUntil) bonus.push('⚡ 2배 부스트 적용');
    res.bonus = bonus.join(' · ');
    s.ms += res.ms; s.maxCombo = Math.max(s.maxCombo, res.maxCombo);
    if (cfg.mode === 'lesson' || !cfg.mode) s.lessons++;
    if (cfg.mode === 'test') s.tests++;
    if (cfg.mode === 'practice' || cfg.mode === 'review') { s.reviews++; questProg('review', 1); APP.gainHeart(1); }
    if (res.perfect) { s.perfect++; questProg('perfect', 1); }
    if (res.acc >= 90) questProg('acc', 1);
    questProg('lessons', 1);
    questProg('combo', res.maxCombo, true);
    // 진행
    if (cfg.unit && cfg.nodeIdx !== undefined) {
      const p = st.progress[cfg.unit.id] || 0;
      if (cfg.nodeIdx >= p) st.progress[cfg.unit.id] = cfg.nodeIdx + 1;
      if (cfg.nodeIdx === G.COURSE.LAST) { // 유닛 완료
        APP._unitDone = cfg.unit;
      }
    }
    if (cfg.after) cfg.after(res);
    const got = APP.addXp(xp);
    checkAch();
    APP.save();
    return got;
  };

  /* ---------- 퀘스트 ---------- */
  const QUESTS = [
    { k: 'xp', t: function (n) { return 'XP ' + n + ' 획득하기'; }, n: [20, 30, 50, 80], i: '⚡' },
    { k: 'lessons', t: function (n) { return '레슨 ' + n + '개 완료하기'; }, n: [2, 3, 4, 5], i: '📘' },
    { k: 'perfect', t: function (n) { return '실수 없이 레슨 ' + n + '개 끝내기'; }, n: [1, 2], i: '🎯' },
    { k: 'listen', t: function (n) { return '듣기 문제 ' + n + '개 맞히기'; }, n: [8, 12, 15], i: '🎧' },
    { k: 'combo', t: function (n) { return n + '문제 연속 정답 달성'; }, n: [8, 10, 15], i: '🔥' },
    { k: 'words', t: function (n) { return '새 단어·글자 ' + n + '개 배우기'; }, n: [5, 10, 15], i: '🌱' },
    { k: 'acc', t: function (n) { return '정확도 90% 이상 레슨 ' + n + '개'; }, n: [1, 2, 3], i: '💯' },
    { k: 'review', t: function () { return '복습/연습 세션 1회 완료'; }, n: [1], i: '🔁' },
    { k: 'speak', t: function (n) { return '말하기 문제 ' + n + '개 성공'; }, n: [3, 5], i: '🎤' }
  ];
  APP.quests = function () {
    const st = APP.state, t = APP.today();
    if (!st.quests || st.quests.day !== t) {
      const rnd = U.seeded(t * 7 + 13);
      let pool = QUESTS.filter(function (q) { return q.k !== 'speak' || (st.settings.speaking && U.speech.available()); });
      const xpQ = pool[0]; pool = pool.slice(1);
      const picks = [xpQ];
      while (picks.length < 3) { const q = pool.splice(Math.floor(rnd() * pool.length), 1)[0]; picks.push(q); }
      st.quests = { day: t, list: picks.map(function (q, i) { const n = q.n[Math.floor(rnd() * q.n.length)]; return { k: q.k, n: n, p: 0, done: false, claimed: false, r: 10 + i * 5 + Math.floor(rnd() * 10) }; }) };
      APP.save();
    }
    return st.quests.list;
  };
  function questProg(k, n, isMax) {
    const list = APP.quests();
    list.forEach(function (q) {
      if (q.k !== k || q.done) return;
      q.p = isMax ? Math.max(q.p, n) : q.p + n;
      if (q.p >= q.n) { q.p = q.n; q.done = true; APP._questDone = (APP._questDone || 0) + 1; }
    });
  }
  APP.questProg = questProg;
  APP.questMeta = function (k) { return QUESTS.find(function (q) { return q.k === k; }); };

  /* ---------- 리그 ---------- */
  const BOT_NAMES = ['하루토', '유이', '민준', '서연', 'Sakura', '지호', 'Ken', '수아', '도윤', '하은', 'Yuki', '레오', '지우', 'Mio', '시우', '채원', 'Ren', '윤서', 'Aoi', '준서', '나나', '태윤', 'Hina', '예준', '소율', 'Sora', '건우', '다인', 'Riku', '아린', '은우', 'Kaito', '유나', '주원', '세아', 'Mei', '현우', '지안', '토모', '하린'];
  function leagueSync() {
    const st = APP.state, w = U.weekNum();
    if (!st.league) st.league = { week: w, tier: 0, xp: 0, last: null };
    if (st.league.week !== w) {
      const L = st.league;
      if (L.week === w - 1 && L.xp > 0) {
        const board = leagueBoard(L.week, L.tier, L.xp, 7);
        const rank = board.findIndex(function (r) { return r.me; }) + 1;
        let res = 'stay';
        if (rank <= 7 && L.tier < LEAGUES.length - 1) { L.tier++; res = 'up'; }
        else if (rank >= 26 && L.tier > 0) { L.tier--; res = 'down'; }
        const reward = rank === 1 ? 100 : rank <= 3 ? 50 : rank <= 10 ? 20 : 0;
        if (reward) st.gems += reward;
        L.last = { rank: rank, res: res, tier: L.tier, reward: reward };
      } else if (L.week < w - 1) L.last = null;
      L.week = w; L.xp = 0;
      st.maxTier = Math.max(st.maxTier || 0, L.tier);
      APP.save();
    }
    return st.league;
  }
  APP.leagueSync = leagueSync;
  function leagueBoard(week, tier, myXp, dayFrac) {
    const rnd = U.seeded(U.hash('L' + week + ':' + tier));
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7; // 월=0
    const elapsed = dayFrac !== undefined ? dayFrac : dayOfWeek + (now.getHours() * 60 + now.getMinutes()) / 1440;
    const rows = [];
    const names = U.shuffle(BOT_NAMES).slice(0, 29);
    for (let i = 0; i < 29; i++) {
      const r1 = rnd(), r2 = rnd(), r3 = rnd();
      const daily = (15 + tier * 12) * (0.25 + r1 * 1.6) * (r2 < 0.15 ? 0.1 : 1);
      let xp = 0;
      for (let d = 0; d < 7; d++) {
        const portion = Math.max(0, Math.min(1, elapsed - d));
        const dr = U.seeded(U.hash(week + ':' + tier + ':' + i + ':' + d))();
        xp += Math.round(daily * (0.3 + dr * 1.4) * portion);
      }
      rows.push({ n: BOT_NAMES[Math.floor(r3 * BOT_NAMES.length)], a: AVATARS[Math.floor(rnd() * AVATARS.length)], xp: xp, bg: ['#ffe1a6', '#ddf4ff', '#d7ffb8', '#ffdfe0', '#f1dcff'][i % 5] });
    }
    rows.forEach(function (r, i) { r.n = names[i] || r.n; });
    rows.push({ n: APP.state.name + ' (나)', a: APP.state.avatar, xp: myXp, me: true, bg: '#ddf4ff' });
    rows.sort(function (a, b) { return b.xp - a.xp || (a.me ? -1 : 1); });
    return rows;
  }
  APP.leagueBoard = function () { const L = leagueSync(); return leagueBoard(L.week, L.tier, L.xp); };

  /* ---------- 업적 ---------- */
  const ACH = [
    { id: 'streak', n: '불꽃의 의지', d: '연속 학습 {n}일', i: '🔥', c: '#ff9600', t: [3, 7, 14, 30, 60, 100, 365], v: function (s) { return s.longest; } },
    { id: 'xp', n: '현자', d: '총 {n} XP 획득', i: '🦉', c: '#58cc02', t: [100, 500, 1000, 2500, 5000, 10000, 25000], v: function (s) { return s.xp; } },
    { id: 'words', n: '어휘왕', d: '단어 {n}개 학습', i: '📚', c: '#1cb0f6', t: [25, 50, 100, 250, 500, 1000, 1500, 2500, 3500], v: function () { return APP.learnedCount('w:'); } },
    { id: 'kanji', n: '한자 박사', d: '한자 {n}자 학습', i: '🈷️', c: '#ff4b4b', t: [10, 50, 100, 200, 300, 400, 600, 800], v: function () { return APP.learnedCount('kj:'); } },
    { id: 'kana', n: '가나 마스터', d: '가나 {n}자 학습', i: 'あ', c: '#ce82ff', t: [20, 46, 100, 200], v: function () { return APP.learnedCount('k:'); } },
    { id: 'perfect', n: '완벽주의자', d: '실수 없는 레슨 {n}개', i: '🎯', c: '#ffc800', t: [1, 5, 10, 25, 50, 100], v: function (s) { return s.stats.perfect; } },
    { id: 'listen', n: '귀가 트였다', d: '듣기 문제 {n}개 정답', i: '🎧', c: '#2bdbc2', t: [25, 100, 250, 500, 1000], v: function (s) { return s.stats.listen; } },
    { id: 'speak', n: '수다쟁이', d: '말하기 {n}회 성공', i: '🎤', c: '#ff86d0', t: [5, 25, 50, 100, 250], v: function (s) { return s.stats.speak; } },
    { id: 'write', n: '서예가', d: '쓰기·입력 {n}회 성공', i: '🖌️', c: '#a56644', t: [10, 50, 100, 250, 500], v: function (s) { return s.stats.write; } },
    { id: 'units', n: '정복자', d: '유닛 {n}개 완료', i: '🏯', c: '#7c83fd', t: [1, 5, 10, 25, 50, 100, 150, 200, 250, 300], v: function () { return APP.unitsDone(); } },
    { id: 'stories', n: '이야기꾼', d: '스토리 {n}편 완료', i: '📖', c: '#00cd9c', t: [1, 5, 10, 20, 30], v: function (s) { return Object.keys(s.storiesDone).length; } },
    { id: 'combo', n: '콤보 장인', d: '{n}연속 정답', i: '⚡', c: '#ff9600', t: [10, 20, 30, 50], v: function (s) { return s.stats.maxCombo; } },
    { id: 'league', n: '챔피언', d: '{n} 리그 도달', i: '🏆', c: '#ffc800', t: [1, 2, 3, 5, 7, 9], v: function (s) { return s.maxTier || 0; }, label: function (n) { return LEAGUES[n].n; } },
    { id: 'trainer', n: '트레이닝 마니아', d: '트레이너 {n}회 완료', i: '🏋️', c: '#1cb0f6', t: [5, 20, 50, 100], v: function (s) { return s.stats.trainers; } },
    { id: 'tests', n: '시험의 달인', d: '유닛 테스트 {n}회 통과', i: '📝', c: '#ce82ff', t: [1, 5, 10, 30, 60], v: function (s) { return s.stats.tests; } },
    { id: 'saved', n: '수집가', d: '문장 {n}개 저장', i: '📌', c: '#ff4b4b', t: [5, 20, 50, 100], v: function (s) { return s.saved.length; } },
    { id: 'night', n: '시간 투자', d: '총 {n}분 학습', i: '⏳', c: '#4b4b4b', t: [30, 120, 600, 1500, 3000], v: function (s) { return Math.floor(s.stats.ms / 60000); } }
  ];
  APP.ACH = ACH;
  function checkAch() {
    const st = APP.state;
    ACH.forEach(function (a) {
      const v = a.v(st); const got = st.ach[a.id] || 0;
      let lvl = 0; a.t.forEach(function (th, i) { if (v >= th) lvl = i + 1; });
      if (lvl > got) {
        st.ach[a.id] = lvl; st.gems += 20 * (lvl - got);
        APP._achNew = (APP._achNew || []).concat([{ a: a, lvl: lvl }]);
      }
    });
  }
  APP.checkAch = checkAch;

  /* ---------- 진행/잠금 ---------- */
  APP.unitDone = function (u) { return (APP.state.progress[u.id] || 0) > G.COURSE.LAST; };
  APP.unitsDone = function () { return G.COURSE.units.filter(APP.unitDone).length; };
  APP.secDone = function (sec) { return sec.units.every(APP.unitDone); };
  APP.secUnlocked = function (sec) {
    const st = APP.state;
    if (st.settings.unlockAll || !sec.req || !sec.req.length || st.jumped['s' + sec.id]) return true;
    return sec.req.every(function (id) {
      const r = G.COURSE.sections.find(function (x) { return x.id === id; });
      return !r || APP.secDone(r) || (st.jumped['s' + (id + 1)] && r.track === 'main' && sec.track !== 'main');
    });
  };
  APP.unitUnlocked = function (u) {
    const st = APP.state;
    if (!APP.secUnlocked(u.secObj)) return false;
    if (st.settings.unlockAll || u.idx === 0 || st.jumped['u' + u.id]) return true;
    return APP.unitDone(u.secObj.units[u.idx - 1]);
  };
  APP.currentUnit = function () {
    // 메인 코스 기준 (점프한 섹션이 있으면 그 이후부터)
    let minSec = 1;
    for (const k in APP.state.jumped) if (k[0] === 's') { const id = +k.slice(1); if (id <= 6) minSec = Math.max(minSec, id); }
    const mains = G.COURSE.sections.filter(function (x) { return x.track === 'main'; });
    for (const sec of mains) {
      if (sec.id < minSec) continue;
      for (const u of sec.units) if (APP.unitUnlocked(u) && !APP.unitDone(u)) return u;
    }
    for (const sec of G.COURSE.sections) {
      for (const u of sec.units) if (APP.unitUnlocked(u) && !APP.unitDone(u)) return u;
    }
    return G.COURSE.units[0];
  };

  /* ---------- 공용 UI ---------- */
  APP.modal = function (o) {
    const pop = h('div', { class: 'pop centered' });
    const sh = h('div', { class: 'sheet center' });
    if (o.icon) sh.appendChild(h('div', { style: { fontSize: '64px' }, text: o.icon }));
    if (o.title) sh.appendChild(h('h2', { text: o.title }));
    if (o.text) sh.appendChild(h('div', { class: 'sub', html: o.text }));
    if (o.body) sh.appendChild(o.body);
    const col = h('div', { class: 'col', style: { marginTop: '10px' } });
    (o.buttons || [{ t: '확인', c: '' }]).forEach(function (b) {
      col.appendChild(h('button', { class: 'btn ' + (b.c || ''), text: b.t, onclick: function () { pop.remove(); if (b.f) b.f(); } }));
    });
    sh.appendChild(col); pop.appendChild(sh);
    if (!o.noDismiss) pop.addEventListener('click', function (e) { if (e.target === pop) pop.remove(); });
    document.body.appendChild(pop);
    return pop;
  };
  APP.sheet = function (content, onClose) {
    const pop = h('div', { class: 'pop' });
    const sh = h('div', { class: 'sheet' });
    sh.appendChild(content); pop.appendChild(sh);
    pop.addEventListener('click', function (e) { if (e.target === pop) { pop.remove(); if (onClose) onClose(); } });
    document.body.appendChild(pop);
    return pop;
  };
  APP.mascotFor = function (ex) {
    const list = ['🦊', '👧', '👦', '🐱', '👩‍🏫', '👨‍🍳', '🧑‍🎓', '👵', '🐼', '👨‍💼'];
    const id = (ex.items && ex.items[0]) || ex.title || '';
    return list[U.hash(id) % list.length];
  };

  /* ---------- 화면/내비게이션 ---------- */
  const TABS = [
    { id: 'learn', i: '🏠', n: '학습' },
    { id: 'practice', i: '🏋️', n: '연습' },
    { id: 'library', i: '📚', n: '사전' },
    { id: 'league', i: '🏆', n: '리그' },
    { id: 'quests', i: '🎯', n: '퀘스트' },
    { id: 'profile', i: '👤', n: '프로필' }
  ];
  APP.tab = 'learn';
  APP.stack = [];
  let screenEl, topEl, tabEl;
  APP.screens = {};

  APP.init = function () {
    APP.load();
    APP.applyTheme();
    G.COURSE.build();
    APP.hearts(); APP.checkStreak(); leagueSync(); APP.quests();
    const app = U.$('#app'); app.innerHTML = '';
    topEl = h('div', { class: 'topbar' }); screenEl = h('div', { class: 'screen' }); tabEl = h('div', { class: 'tabbar' });
    app.appendChild(topEl); app.appendChild(screenEl); app.appendChild(tabEl);
    TABS.forEach(function (t) {
      tabEl.appendChild(h('button', { 'data-tab': t.id, onclick: function () { APP.go(t.id); } }, h('span', { class: 'ti', text: t.i }), h('span', { text: t.n })));
    });
    G.__androidBack = APP.back;
    APP.go('learn');
    if (!APP.state.onboarded) APP.onboarding();
    else if (APP._lostStreak) { APP.modal({ icon: '💧', title: '연속 학습이 끊겼어요', text: APP._lostStreak + '일 연속 기록이 초기화됐어요. 오늘 다시 시작해 볼까요? 상점에서 스트릭 프리즈를 준비해 두면 기록을 지킬 수 있어요.' }); APP._lostStreak = 0; }
    setInterval(function () { if (APP.tab && !G.LESSON.active()) drawTop(); }, 60000);
    document.addEventListener('visibilitychange', function () { if (document.hidden) APP.saveNow(); });
  };
  APP.applyTheme = function () {
    const m = APP.state.settings.dark;
    let sys = G.matchMedia && G.matchMedia('(prefers-color-scheme: dark)').matches;
    if (U.hasBridge && G.Android.isNightMode) { try { sys = G.Android.isNightMode(); } catch (e) { /* */ } }
    const dark = m === 'on' || (m === 'auto' && sys);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  };
  function drawTop() {
    const st = APP.state; const hv = APP.hearts();
    topEl.innerHTML = '';
    const studiedToday = st.lastDay === APP.today();
    topEl.appendChild(h('div', { class: 'stat', onclick: function () { APP.push(APP.screens.courseOverview, '코스 개요'); } }, h('span', { class: 'flag', text: '🇯🇵' })));
    topEl.appendChild(h('div', { class: 'stat streak' + (studiedToday ? '' : ' off'), onclick: APP.showStreak }, h('span', { class: 'ico', text: '🔥' }), String(st.streak)));
    topEl.appendChild(h('div', { class: 'stat gems', onclick: function () { APP.push(APP.screens.shop, '상점'); } }, h('span', { class: 'ico', text: '💎' }), String(st.gems)));
    topEl.appendChild(h('div', { class: 'stat hearts', onclick: APP.showHearts }, h('span', { class: 'ico', text: '❤️' }), st.settings.unlimitedHearts ? '∞' : String(hv)));
  }
  APP.drawTop = drawTop;
  APP.go = function (tab) {
    APP.tab = tab; APP.stack = [];
    U.$$('.tabbar button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === tab); });
    drawTop();
    topEl.classList.remove('hidden');
    screenEl.innerHTML = ''; screenEl.scrollTop = 0;
    APP.screens[tab](screenEl);
  };
  APP.refresh = function () {
    if (APP.stack.length) { const top = APP.stack[APP.stack.length - 1]; renderSub(top); return; }
    const y = screenEl.scrollTop; APP.go(APP.tab); screenEl.scrollTop = y;
  };
  // 하위 페이지
  APP.push = function (fn, title, arg) {
    const entry = { fn: fn, title: title, arg: arg, y: screenEl.scrollTop };
    APP.stack.push(entry); renderSub(entry); screenEl.scrollTop = 0;
  };
  function renderSub(e) {
    screenEl.innerHTML = '';
    const head = h('div', { class: 'topbar', style: { position: 'sticky', top: '0', justifyContent: 'flex-start', gap: '10px' } },
      h('button', { class: 'btn flat sm', style: { fontSize: '22px', padding: '2px 8px' }, text: '←', onclick: APP.pop }),
      h('b', { style: { fontSize: '17px', color: 'var(--title)', flex: '1' }, text: e.title }));
    screenEl.appendChild(head);
    const box = h('div'); screenEl.appendChild(box);
    e.fn(box, e.arg, head);
  }
  APP.pop = function () {
    const e = APP.stack.pop();
    if (!APP.stack.length) { APP.go(APP.tab); if (e) screenEl.scrollTop = e.y; }
    else { renderSub(APP.stack[APP.stack.length - 1]); }
  };
  APP.back = function () {
    if (U.$('.hint-pop')) { G.EX.closeHint(); return true; }
    const pops = U.$$('.pop'); if (pops.length) { pops[pops.length - 1].remove(); return true; }
    const res = U.$('.result'); if (res) { const b = res.querySelector('.btn:last-child'); if (b) b.click(); return true; }
    if (G.LESSON.active()) { G.LESSON.quit(); return true; }
    if (G.PRACTICE && G.PRACTICE.activeOverlay && G.PRACTICE.activeOverlay()) return true;
    if (APP.stack.length) { APP.pop(); return true; }
    if (APP.tab !== 'learn') { APP.go('learn'); return true; }
    return false;
  };

  /* ---------- 레슨 시작/완료 처리 ---------- */
  APP.startNode = function (unit, nodeIdx, replay) {
    const node = G.COURSE.NODES[nodeIdx];
    if (node.k === 'chest') {
      const g = 15 + U.rand(21);
      APP.state.gems += g; APP.state.stats.chests++;
      APP.state.progress[unit.id] = Math.max(APP.state.progress[unit.id] || 0, nodeIdx + 1);
      APP.save(); U.sfx('chest'); G.LESSON.confetti();
      APP.modal({ icon: '🎁', title: '보물상자를 열었어요!', text: '💎 보석 <b>' + g + '</b>개를 받았어요.', buttons: [{ t: '좋아요', f: APP.refresh }] });
      return;
    }
    if (!replay && !APP.state.settings.unlimitedHearts && APP.hearts() <= 0 && node.k !== 'test') {
      APP.showHearts(); return;
    }
    const items = G.LG.forNode(unit, node.k);
    if (!items.length) { U.toast('이 레슨에는 아직 문제가 없어요'); return; }
    G.LESSON.run({
      title: unit.t, items: items, mode: node.k === 'test' ? 'test' : replay ? 'practice' : 'lesson', maxMistakes: 3,
      unit: unit, nodeIdx: nodeIdx, xp: replay ? 5 : undefined,
      onDone: APP.afterLesson, onQuit: APP.refresh
    });
  };
  APP.afterLesson = function (res) {
    const queue = [];
    if (APP._unitDone && res && res.passed) {
      const u = APP._unitDone; APP._unitDone = null;
      queue.push(function (nx) { G.LESSON.confetti(); U.sfx('chest'); APP.addGems(30); APP.modal({ icon: '🏅', title: '유닛 완료!', text: '<b>' + U.esc(u.t) + '</b> 유닛을 정복했어요! 보너스 💎30', buttons: [{ t: '계속', f: nx }] }); });
    }
    if (APP._streakUp) {
      APP._streakUp = false;
      queue.push(function (nx) { APP.modal({ icon: '🔥', title: APP.state.streak + '일 연속 학습!', text: APP.state.streak === 1 ? '오늘부터 연속 학습 시작! 내일도 와서 불꽃을 지켜주세요.' : '대단해요! 매일 조금씩이 실력을 만듭니다.', buttons: [{ t: '계속', c: 'orange', f: nx }] }); });
    }
    if (APP._goalHit) {
      APP._goalHit = false;
      queue.push(function (nx) { APP.addGems(10); APP.modal({ icon: '🎯', title: '오늘의 목표 달성!', text: '일일 목표 ' + APP.state.settings.goal + ' XP를 채웠어요. 보너스 💎10', buttons: [{ t: '계속', f: nx }] }); });
    }
    if (APP._questDone) {
      APP._questDone = 0;
      queue.push(function (nx) { APP.modal({ icon: '📜', title: '퀘스트 완료!', text: '퀘스트 탭에서 보상을 받으세요.', buttons: [{ t: '보상 받으러 가기', c: 'purple', f: function () { APP.go('quests'); nx(); } }, { t: '나중에', c: 'ghost gray', f: nx }] }); });
    }
    if (APP._achNew && APP._achNew.length) {
      const list = APP._achNew; APP._achNew = [];
      list.forEach(function (x) {
        queue.push(function (nx) { APP.modal({ icon: x.a.i, title: '업적 달성: ' + x.a.n, text: '레벨 ' + x.lvl + ' — ' + x.a.d.replace('{n}', x.a.label ? x.a.label(x.a.t[x.lvl - 1]) : x.a.t[x.lvl - 1]) + '<br>보상 💎20', buttons: [{ t: '멋져요!', f: nx }] }); });
      });
    }
    function run() { const f = queue.shift(); if (f) f(run); else APP.refresh(); }
    run();
  };

  /* ---------- 상단 팝업 ---------- */
  APP.showStreak = function () {
    const st = APP.state;
    const box = h('div');
    box.appendChild(h('div', { class: 'center' }, h('div', { style: { fontSize: '70px' }, text: '🔥' }), h('h2', { text: st.streak + '일 연속 학습' }),
      h('div', { class: 'sub', text: st.lastDay === APP.today() ? '오늘 학습 완료! 내일도 만나요.' : '오늘 레슨을 하나 완료하면 연속 기록이 이어져요.' })));
    // 이번 달 달력
    const now = new Date(), y = now.getFullYear(), m = now.getMonth();
    const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
    box.appendChild(h('div', { class: 'sec-label', style: { margin: '10px 0 6px' }, text: y + '년 ' + (m + 1) + '월' }));
    const grid = h('div', { class: 'heat', style: { padding: '0' } });
    ['월', '화', '수', '목', '금', '토', '일'].forEach(function (d) { grid.appendChild(h('div', { style: { background: 'none' }, text: d })); });
    const off = (first.getDay() + 6) % 7;
    for (let i = 0; i < off; i++) grid.appendChild(h('div', { style: { background: 'none' } }));
    for (let d = 1; d <= days; d++) {
      const dn = U.dayNum(new Date(y, m, d)); const xp = st.daily[dn] || 0;
      grid.appendChild(h('div', { class: (xp >= 50 ? 'l3' : xp >= 20 ? 'l2' : xp > 0 ? 'l1' : '') + (dn === APP.today() ? ' today' : ''), text: String(d) }));
    }
    box.appendChild(grid);
    box.appendChild(h('div', { class: 'row', style: { marginTop: '14px' } },
      h('div', { class: 'sbox' }, h('span', { class: 'si', text: '🏅' }), h('div', null, h('b', { text: String(st.longest) }), h('span', { text: '최장 기록' }))),
      h('div', { class: 'sbox' }, h('span', { class: 'si', text: '🧊' }), h('div', null, h('b', { text: String(st.freeze) }), h('span', { text: '스트릭 프리즈' })))));
    box.appendChild(h('button', { class: 'btn', style: { marginTop: '16px' }, text: '닫기', onclick: function () { U.$('.pop').remove(); } }));
    APP.sheet(box);
  };
  APP.showHearts = function () {
    const hv = APP.hearts(), st = APP.state;
    const mins = hv >= APP.MAX_HEARTS ? 0 : Math.max(1, Math.ceil((APP.HEART_MIN * 60000 - (Date.now() - st.heartTs)) / 60000));
    APP.modal({
      icon: '❤️', title: st.settings.unlimitedHearts ? '무제한 하트 사용 중' : '하트 ' + hv + '/' + APP.MAX_HEARTS,
      text: st.settings.unlimitedHearts ? '설정에서 무제한 하트를 끌 수 있어요.' : (hv >= APP.MAX_HEARTS ? '하트가 가득 찼어요!' : '다음 하트까지 약 ' + mins + '분. 연습 탭에서 복습하면 하트를 1개씩 얻을 수 있어요.'),
      buttons: hv >= APP.MAX_HEARTS || st.settings.unlimitedHearts ? [{ t: '확인' }] : [
        { t: '💎 ' + APP.HEART_COST + ' 으로 가득 채우기', c: 'blue', f: function () { if (APP.buyHearts()) { U.toast('하트를 가득 채웠어요!'); drawTop(); } else U.toast('보석이 부족해요'); } },
        { t: '복습해서 하트 얻기', c: 'ghost', f: function () { APP.go('practice'); } },
        { t: '닫기', c: 'ghost gray' }
      ]
    });
  };

  /* ---------- 온보딩 ---------- */
  APP.onboarding = function () {
    const st = APP.state;
    const o = h('div', { class: 'onb' });
    let step = 0;
    const goals = [{ x: 10, n: '가볍게', d: '하루 5분' }, { x: 20, n: '보통', d: '하루 10분' }, { x: 30, n: '진지하게', d: '하루 15분' }, { x: 50, n: '열정적으로', d: '하루 20분+' }];
    function draw() {
      o.innerHTML = '';
      const c = h('div', { class: 'oc' });
      if (step === 0) {
        c.appendChild(h('div', { class: 'logo', text: '🦊' }));
        c.appendChild(h('h1', { class: 'center', text: 'こんにちは! 니홍고 마스터' }));
        c.appendChild(h('p', { class: 'center muted', html: '히라가나부터 JLPT N2까지 · 15개 섹션<br><b>' + G.COURSE.units.length + '개 유닛 · ' + (G.COURSE.units.length * G.COURSE.LAST) + '개 레슨 · 단어 ' + G.COURSE.words.length + '개 · 한자 ' + G.COURSE.kanji.length + '자 · 문장 ' + G.COURSE.sents.length + '개</b><br>완전 무료 · 광고 없음 · 오프라인 지원' }));
      } else if (step === 1) {
        c.appendChild(h('h1', { text: '일본어를 얼마나 알고 있나요?' }));
        [['🌱', '처음이에요', '히라가나부터 시작', 1], ['🔤', '가나는 읽을 수 있어요', '입문(N5) 섹션부터 시작', 2], ['🗣️', '기초 회화는 할 수 있어요', '초급 섹션부터 시작', 3], ['📗', 'N4 정도예요', '초중급 섹션부터 시작', 4], ['📕', 'N3 정도예요', '중급 섹션부터 시작', 5], ['🏯', 'N2에 도전하고 싶어요', '상급(N2) 섹션부터 시작', 6]].forEach(function (x) {
          c.appendChild(h('button', { class: 'opt', style: { marginBottom: '10px' }, onclick: function () {
            for (let s = 2; s <= x[3]; s++) st.jumped['s' + s] = true;
            step = 2; draw();
          } }, h('span', { style: { fontSize: '28px' }, text: x[0] }), h('span', null, h('b', { text: x[1] }), h('div', { class: 'small muted', text: x[2] }))));
        });
      } else if (step === 2) {
        c.appendChild(h('h1', { text: '하루 목표를 정해요' }));
        goals.forEach(function (g) {
          c.appendChild(h('button', { class: 'opt' + (st.settings.goal === g.x ? ' sel' : ''), style: { marginBottom: '10px', justifyContent: 'space-between' }, onclick: function () { st.settings.goal = g.x; draw(); } },
            h('b', { text: g.n + ' (' + g.d + ')' }), h('span', { class: 'muted', text: g.x + ' XP' })));
        });
      } else if (step === 3) {
        c.appendChild(h('h1', { text: '이름과 캐릭터를 골라요' }));
        const inp = h('input', { class: 'search', style: { margin: '0 0 14px', width: '100%' }, value: st.name === '학습자' ? '' : st.name, placeholder: '닉네임', maxlength: '12' });
        inp.addEventListener('input', function () { st.name = inp.value.trim() || '학습자'; });
        c.appendChild(inp);
        const g = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '8px' } });
        AVATARS.forEach(function (a) { g.appendChild(h('button', { class: 'opt' + (st.avatar === a ? ' sel' : ''), style: { fontSize: '26px', padding: '8px', justifyContent: 'center' }, text: a, onclick: function () { st.avatar = a; draw(); } })); });
        c.appendChild(g);
        if (!U.tts.available()) c.appendChild(h('div', { class: 'card', style: { marginTop: '14px' }, html: '🔈 <b>일본어 음성(TTS)</b>이 설치되어 있지 않을 수 있어요. 설정 → 일본어 음성 설치를 눌러 Google 음성 데이터(일본어)를 받으면 모든 문제를 들을 수 있어요.' }));
      }
      o.appendChild(c);
      o.appendChild(h('button', { class: 'btn', text: step === 3 ? '학습 시작!' : '계속', onclick: function () {
        if (step === 1) { step = 2; draw(); return; }
        if (step < 3) { step++; draw(); return; }
        st.onboarded = true; APP.save(); o.remove(); openSec = null; APP._scrolled = false; APP.go('learn');
        if (U.hasBridge && !U.tts.available()) setTimeout(function () { U.toast('설정에서 일본어 음성을 설치할 수 있어요'); }, 1500);
      } }));
    }
    draw();
    document.body.appendChild(o);
  };

  /* ---------- 학습 경로 ---------- */
  const OFFS = [0, 44, 70, 44, 0, -44, -70, -44];
  let openSec = null;
  APP.screens.learn = function (el) {
    const C = G.COURSE;
    const cu = APP.currentUnit();
    if (openSec === null) openSec = cu.sec;
    // 오늘의 목표 + 오늘의 단어
    const tx = APP.todayXp(), goal = APP.state.settings.goal;
    const pool = C.words.filter(function (w) { return w.e && w.u && C.unitMap[w.u] && C.unitMap[w.u].kind === 'topic'; });
    const wod = pool[U.hash('wod' + APP.today()) % pool.length];
    const daily = h('div', { class: 'card', style: { margin: '12px 14px 0', display: 'flex', gap: '12px', alignItems: 'center', padding: '10px 12px' } },
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('div', { class: 'small', style: { fontWeight: '800', color: 'var(--text2)' }, text: (tx >= goal ? '🎉 오늘의 목표 달성!' : '⚡ 오늘의 목표') + '  ' + tx + '/' + goal + ' XP' }),
        h('div', { class: 'prog', style: { margin: '6px 0 8px' } }, h('div', { style: { width: Math.min(100, tx / goal * 100) + '%' } })),
        wod ? h('div', { class: 'small', style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, html: '📅 오늘의 단어: <b class="jp" style="font-size:16px;color:var(--title)">' + U.esc(wod.w) + '</b> <span class="jp muted">' + (wod.r !== wod.w ? U.esc(wod.r) : '') + '</span> — ' + U.esc(wod.m) }) : null),
      wod ? h('button', { class: 'spk', style: { flex: 'none' }, html: wod.e || '🔊', onclick: function () { U.tts.speak(wod.r); } }) : null);
    el.appendChild(daily);
    let lastTrack = null;
    C.sections.forEach(function (sec) {
      if (sec.track !== lastTrack) { lastTrack = sec.track; el.appendChild(h('div', { class: 'sec-label', style: { margin: '22px 16px 0' }, text: C.TRACKS[sec.track] || '' })); }
      const unlocked = APP.secUnlocked(sec);
      const done = sec.units.filter(APP.unitDone).length;
      const head = h('div', { class: 'section-head', style: { background: unlocked ? sec.color : '#afafaf', boxShadow: '0 4px 0 ' + (unlocked ? sec.dark : '#8f8f8f'), cursor: 'pointer' }, onclick: function () { openSec = openSec === sec.id ? -1 : sec.id; APP.refresh(); } },
        h('div', null, h('div', { class: 'st', text: '섹션 ' + sec.id + ' · ' + sec.cefr }), h('div', { class: 'sn', text: (unlocked ? '' : '🔒 ') + sec.t }), h('div', { class: 'sp', text: sec.st + ' · ' + done + '/' + sec.units.length + ' 유닛' })),
        h('div', { style: { fontSize: '26px' }, text: openSec === sec.id ? '▾' : '▸' }));
      el.appendChild(head);
      if (openSec !== sec.id) return;
      if (!unlocked) {
        el.appendChild(h('div', { class: 'card', style: { margin: '12px 14px' } },
          h('h3', { text: '이 섹션은 잠겨 있어요' }),
          h('div', { class: 'muted small', style: { marginBottom: '10px' }, text: '이전 섹션을 완료하거나, 점프 테스트를 통과하면 바로 시작할 수 있어요.' }),
          h('button', { class: 'btn blue', text: '점프 테스트 보기', onclick: function () { APP.jumpTest(sec); } })));
      }
      sec.units.forEach(function (u) { el.appendChild(renderUnit(u, cu)); });
    });
    el.appendChild(h('div', { class: 'center muted small', style: { padding: '24px' }, text: '🗾 계속 확장되는 코스 — 총 ' + C.units.length + '개 유닛' }));
    // 현재 노드로 스크롤
    setTimeout(function () { const c = U.$('.node.cur', el); if (c && !APP._scrolled) { c.scrollIntoView({ block: 'center' }); APP._scrolled = true; } }, 50);
  };
  function renderUnit(u, cu) {
    const wrap = h('div');
    const unlocked = APP.unitUnlocked(u);
    const p = APP.state.progress[u.id] || 0;
    const banner = h('div', { class: 'unit-banner' + (unlocked ? '' : ' locked'), style: { background: u.color } },
      h('div', { style: { minWidth: '0' } }, h('div', { class: 'ul', text: '유닛 ' + (u.idx + 1) + (APP.unitDone(u) ? ' · 완료 ✓' : '') }), h('div', { class: 'ut', text: u.t })),
      h('button', { class: 'guide', text: '📖 가이드', onclick: function () { APP.push(APP.screens.guide, u.t, u); } }));
    wrap.appendChild(banner);
    const path = h('div', { class: 'path' });
    G.COURSE.NODES.forEach(function (n, i) {
      const isDone = i < p, isCur = unlocked && i === p;
      const cls = isDone ? 'done' : isCur ? 'cur' : 'lock';
      const nw = h('div', { class: 'node-wrap' });
      const btn = h('button', { class: 'node ' + cls + (n.k === 'chest' ? ' chest' : n.k === 'test' ? ' trophy' : ''), style: { transform: 'translateX(' + OFFS[(i + u.idx * 3) % OFFS.length] + 'px)', background: isCur ? shade(u.color) : '' } });
      const face = h('div', { class: 'face', style: { background: isCur ? u.color : '' }, text: isDone && n.k !== 'chest' ? (n.k === 'test' ? '👑' : '✔') : n.k === 'chest' && isDone ? '📭' : n.ic });
      btn.appendChild(face);
      if (isCur) btn.appendChild(h('div', { class: 'start-bubble', style: { left: '50%', transform: 'translateX(-50%)', color: u.color }, text: p === 0 ? '시작' : n.k === 'chest' ? '열기' : '계속' }));
      btn.addEventListener('click', function () { nodeTap(u, i, cls); });
      nw.appendChild(btn);
      if (i === 3 && u.idx % 2 === 0) nw.appendChild(h('div', { class: 'mascot', style: { left: '12%', top: '10px' }, text: u.kind === 'kanji' ? '🐼' : u.kind === 'kana' ? '🦊' : U.pick(['🦊', '🐱', '🐶', '🐰']) }));
      path.appendChild(nw);
    });
    wrap.appendChild(path);
    return wrap;
  }
  function shade(hex) {
    const n = parseInt(hex.slice(1), 16); const r = Math.max(0, (n >> 16) - 40), g = Math.max(0, ((n >> 8) & 255) - 40), b = Math.max(0, (n & 255) - 40);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function nodeTap(u, i, cls) {
    const n = G.COURSE.NODES[i];
    const label = G.LG.nodeLabel(u, n.k);
    const box = h('div');
    if (cls === 'lock') {
      box.appendChild(h('h2', { text: '🔒 ' + label }));
      if (!APP.unitUnlocked(u) && i === 0) {
        box.appendChild(h('div', { class: 'sub', text: '이 유닛을 이미 알고 있다면 건너뛰기 테스트로 바로 열 수 있어요.' }));
        box.appendChild(h('button', { class: 'btn blue', text: '유닛 건너뛰기 테스트', onclick: function () { pop.remove(); APP.unitJump(u); } }));
      } else box.appendChild(h('div', { class: 'sub', text: '먼저 앞의 레슨을 모두 완료하세요!' }));
      box.appendChild(h('button', { class: 'btn ghost', style: { marginTop: '10px' }, text: '📖 가이드북 보기', onclick: function () { pop.remove(); APP.push(APP.screens.guide, u.t, u); } }));
    } else {
      box.appendChild(h('div', { class: 'ex-badge', text: u.t }));
      box.appendChild(h('h2', { text: n.ic + ' ' + label }));
      const desc = { learn1: '새로운 내용을 배워요', learn2: '새로운 내용을 더 배워요', chest: '보석이 들어 있어요!', sent: '문장을 만들고 번역해요', listen: '듣고 말하는 연습', practice: '배운 내용을 총정리', hard: '보기 없이 직접 입력·받아쓰기·쓰기로 실력 굳히기', test: '실수 3번까지! 통과하면 유닛 완료 + 왕관' }[n.k];
      box.appendChild(h('div', { class: 'sub', text: cls === 'done' ? '완료한 레슨이에요. 다시 연습하면 XP를 조금 더 받아요.' : desc }));
      box.appendChild(h('button', { class: 'btn', text: cls === 'done' ? (n.k === 'chest' ? '이미 열었어요' : '다시 연습 +5 XP') : n.k === 'chest' ? '열기' : '시작하기 +' + (n.k === 'test' ? 20 : 10) + ' XP', onclick: function () {
        pop.remove();
        if (cls === 'done' && n.k === 'chest') return;
        APP.startNode(u, i, cls === 'done');
      } }));
    }
    const pop = APP.sheet(box);
  }
  APP.unitJump = function (u) {
    const items = G.LG.forNode(u, 'test').filter(function (x) { return !/^intro/.test(x.type); });
    G.LESSON.run({ title: '건너뛰기', items: items, mode: 'test', maxMistakes: 2, xp: 10, onQuit: APP.refresh,
      after: function (res) { if (res.passed) { const sec = u.secObj; for (let i = 0; i <= u.idx; i++) { const x = sec.units[i]; if (i < u.idx) APP.state.progress[x.id] = Math.max(APP.state.progress[x.id] || 0, G.COURSE.LAST + 1); } APP.state.jumped['u' + u.id] = true; } },
      onDone: APP.afterLesson });
  };
  APP.jumpTest = function (sec) {
    const reqId = (sec.req && sec.req[0]) || sec.id - 1;
    const prev = G.COURSE.sections.find(function (s) { return s.id === reqId; });
    const units = prev ? prev.units : sec.units;
    let items = [];
    U.sample(units, 6).forEach(function (u) { items = items.concat(G.LG.forNode(u, 'test').filter(function (x) { return !/^intro/.test(x.type); }).slice(0, 3)); });
    items = U.shuffle(items).slice(0, 18);
    G.LESSON.run({ title: '점프 테스트', items: items, mode: 'test', maxMistakes: 3, xp: 20, onQuit: APP.refresh,
      after: function (res) { if (res.passed) { APP.state.jumped['s' + sec.id] = true; openSec = sec.id; } },
      onDone: APP.afterLesson });
  };

  /* ---------- 가이드북 ---------- */
  APP.screens.guide = function (el, u) {
    const tip = u.tip;
    const box = h('div', { class: 'pad' });
    box.appendChild(h('div', { class: 'h-title', style: { margin: '4px 0 10px' }, text: tip ? tip.t : u.t }));
    if (tip) {
      box.appendChild(h('div', { class: 'guide-body', html: tip.b }));
      if (tip.ex && tip.ex.length) {
        box.appendChild(h('h4', { style: { color: 'var(--title)' }, text: '예문' }));
        tip.ex.forEach(function (e) {
          const f = e.split('|');
          box.appendChild(h('div', { class: 'ex-line' }, G.EX.spkBtn(U.plain(f[0])), h('div', null, h('div', { class: 'exj jp', html: U.ruby(f[0], APP.state.settings.furi) }), h('div', { class: 'exk', text: f[1] || '' }))));
        });
      }
    }
    if (u.words && u.words.length) {
      box.appendChild(h('h4', { style: { color: 'var(--title)', marginTop: '18px' }, text: (u.kind === 'kana' ? '연습 단어' : '핵심 단어') + ' (' + u.words.length + ')' }));
      u.words.forEach(function (w) {
        box.appendChild(h('div', { class: 'word-row', style: { padding: '8px 0' } }, h('div', { class: 'wj jp', html: U.wordRuby(w.w, w.r, true) }), h('div', { class: 'wm' }, h('span', { text: (w.e ? w.e + ' ' : '') + w.m }), h('small', { text: U.romaji(w.r) })), h('button', { class: 'wb', text: '🔊', onclick: function () { U.tts.speak(w.r); } })));
      });
    }
    if (u.kanji) {
      u.kanji.forEach(function (k) {
        box.appendChild(h('div', { class: 'card', style: { marginTop: '10px' } }, h('div', { class: 'row', style: { alignItems: 'flex-start' } }, h('div', { class: 'jp', style: { fontSize: '44px', flex: 'none', color: 'var(--title)' }, text: k.c }),
          h('div', { style: { flex: '1' } }, h('b', { text: k.hm }), h('div', { class: 'small', html: '음 <span class="jp">' + U.esc(k.on.join('・') || '-') + '</span> · 훈 <span class="jp">' + U.esc(k.kun.join('・') || '-') + '</span>' }),
            h('div', { class: 'small muted jp', text: k.ex.map(function (e) { return e.w + '(' + e.r + ') ' + e.m; }).join(' / ') })))));
      });
    }
    if (u.sents && u.sents.length) {
      box.appendChild(h('h4', { style: { color: 'var(--title)', marginTop: '18px' }, text: '핵심 문장 (' + u.sents.length + ')' }));
      u.sents.forEach(function (s) {
        box.appendChild(h('div', { class: 'ex-line' }, G.EX.spkBtn(U.plain(s.j)), h('div', null, h('div', { class: 'exj jp', html: U.ruby(s.j.replace(/\s+/g, ''), APP.state.settings.furi) }), h('div', { class: 'exk', text: s.k }))));
      });
    }
    el.appendChild(box);
  };

  /* ---------- 코스 개요 ---------- */
  APP.screens.courseOverview = function (el) {
    const C = G.COURSE;
    el.appendChild(h('div', { class: 'h-title', text: '🇯🇵 일본어 코스 (한국어 화자용)' }));
    el.appendChild(h('div', { class: 'stat-grid' },
      sbox('🗂️', C.units.length, '유닛'), sbox('🧩', C.units.length * C.LAST, '레슨'), sbox('📚', C.words.length, '단어'), sbox('🈷️', C.kanji.length, '한자'),
      sbox('💬', C.sents.length, '예문'), sbox('📗', C.tips.length, '문법 가이드'), sbox('📖', (G.STORIES || []).length, '스토리'), sbox('🔤', G.KANA.all.length, '가나')));
    C.sections.forEach(function (sec) {
      const done = sec.units.filter(APP.unitDone).length;
      el.appendChild(h('div', { class: 'card', style: { margin: '12px 16px 0' } }, h('h3', { text: '섹션 ' + sec.id + ' · ' + sec.t + ' (' + sec.cefr + ')' }), h('div', { class: 'small muted', style: { marginBottom: '8px' }, text: sec.st + ' — ' + sec.units.length + '개 유닛' }),
        h('div', { class: 'prog green' }, h('div', { style: { width: (done / sec.units.length * 100) + '%' } })), h('div', { class: 'small muted', style: { marginTop: '4px' }, text: done + '/' + sec.units.length + ' 완료' })));
    });
  };
  function sbox(i, v, l) { return h('div', { class: 'sbox' }, h('span', { class: 'si', text: i }), h('div', null, h('b', { text: String(v) }), h('span', { text: l }))); }
  APP.sbox = sbox;

  /* ---------- 리그 ---------- */
  APP.screens.league = function (el) {
    const L = leagueSync();
    const lg = LEAGUES[L.tier];
    el.appendChild(h('div', { class: 'league-head' },
      h('div', { class: 'league-badges' }, LEAGUES.map(function (x, i) { return h('span', { class: i === L.tier ? 'on' : '', text: x.i }); })),
      h('h2', { text: lg.n + ' 리그' }),
      h('div', { class: 'muted small', text: '상위 7명은 다음 리그로 승급! 하위 5명은 강등돼요. · ' + leftText() })));
    if (L.last) {
      const t = L.last.res === 'up' ? '🎉 지난주 ' + L.last.rank + '위로 ' + LEAGUES[L.last.tier].n + ' 리그 승급!' : L.last.res === 'down' ? '😢 지난주 ' + L.last.rank + '위로 강등됐어요' : '지난주 ' + L.last.rank + '위로 리그 유지';
      el.appendChild(h('div', { class: 'card', style: { margin: '0 16px 10px' }, html: t + (L.last.reward ? ' · 보상 💎' + L.last.reward : '') }));
    }
    const board = APP.leagueBoard();
    board.forEach(function (r, i) {
      if (i === 7 && L.tier < LEAGUES.length - 1) el.appendChild(h('div', { class: 'zone up', text: '▲ 승급권 ▲' }));
      if (i === 25 && L.tier > 0) el.appendChild(h('div', { class: 'zone down', text: '▼ 강등권 ▼' }));
      el.appendChild(h('div', { class: 'rank-row' + (r.me ? ' me' : '') },
        h('div', { class: 'rk' + (i === 0 ? ' g' : i === 1 ? ' s' : i === 2 ? ' b' : ''), text: i < 3 ? ['🥇', '🥈', '🥉'][i] : String(i + 1) }),
        h('div', { class: 'av', style: { background: r.bg }, text: r.a }), h('div', { class: 'nm', text: r.n }), h('div', { class: 'xp', text: r.xp + ' XP' })));
    });
  };
  function leftText() {
    const now = new Date(); const dow = (now.getDay() + 6) % 7;
    const left = 7 - dow - 1;
    return left > 0 ? left + '일 ' + (24 - now.getHours()) + '시간 남음' : (24 - now.getHours()) + '시간 남음';
  }

  /* ---------- 퀘스트 ---------- */
  APP.screens.quests = function (el) {
    const list = APP.quests();
    el.appendChild(h('div', { class: 'h-title', text: '🎯 일일 퀘스트' }));
    const now = new Date(); const hl = 24 - now.getHours();
    el.appendChild(h('div', { class: 'h-sub', text: '매일 새로운 퀘스트 · ' + hl + '시간 후 초기화' }));
    const card = h('div', { class: 'card', style: { margin: '0 16px', padding: '0' } });
    list.forEach(function (q) {
      const m = APP.questMeta(q.k);
      card.appendChild(h('div', { class: 'quest' + (q.done ? ' done' : '') },
        h('div', { class: 'qi', text: m.i }),
        h('div', { class: 'qt' }, h('b', { text: m.t(q.n) }), h('div', { class: 'prog' }, h('div', { style: { width: (q.p / q.n * 100) + '%' } })), h('div', { class: 'small muted', style: { marginTop: '3px' }, text: q.p + ' / ' + q.n })),
        q.claimed ? h('div', { class: 'qr', text: '✅' }) : q.done ? h('button', { class: 'btn yellow sm', text: '💎' + q.r + ' 받기', onclick: function () { q.claimed = true; APP.addGems(q.r); U.sfx('chest'); G.LESSON.confetti(); APP.refresh(); } }) : h('div', { class: 'qr', style: { filter: 'grayscale(1)', opacity: '.6' }, text: '🎁' })));
    });
    el.appendChild(card);
    // 일일 목표
    const tx = APP.todayXp(), goal = APP.state.settings.goal;
    el.appendChild(h('div', { class: 'sec-label', text: '오늘의 목표' }));
    el.appendChild(h('div', { class: 'card', style: { margin: '0 16px' } }, h('h3', { text: '⚡ ' + tx + ' / ' + goal + ' XP' }), h('div', { class: 'prog' }, h('div', { style: { width: Math.min(100, tx / goal * 100) + '%' } })),
      h('div', { class: 'small muted', style: { marginTop: '6px' }, text: tx >= goal ? '오늘 목표 달성! 🎉' : '목표까지 ' + (goal - tx) + ' XP 남았어요' })));
    // 주간 XP
    el.appendChild(h('div', { class: 'sec-label', text: '최근 7일 XP' }));
    el.appendChild(xpChart());
    // 업적 미리보기
    el.appendChild(h('div', { class: 'sec-label', text: '업적' }));
    el.appendChild(h('div', { class: 'pad', style: { paddingTop: '0' } }, h('button', { class: 'btn ghost', text: '🏅 업적 전체 보기 (' + Object.keys(APP.state.ach).length + '/' + ACH.length + ')', onclick: function () { APP.push(APP.screens.achievements, '업적'); } })));
  };
  function xpChart() {
    const t = APP.today(); const days = []; let max = 10;
    for (let i = 6; i >= 0; i--) { const v = APP.state.daily[t - i] || 0; days.push({ d: t - i, v: v }); max = Math.max(max, v); }
    const names = ['일', '월', '화', '수', '목', '금', '토'];
    return h('div', { class: 'chart' }, days.map(function (x) {
      const dt = new Date(); dt.setDate(dt.getDate() - (t - x.d));
      return h('div', { class: 'bar' + (x.d === t ? ' today' : '') }, h('span', { text: String(x.v) }), h('div', { style: { height: (x.v / max * 100) + '%' } }), h('span', { text: names[dt.getDay()] }));
    }));
  }
  APP.xpChart = xpChart;

  /* ---------- 업적 ---------- */
  APP.screens.achievements = function (el) {
    const st = APP.state;
    ACH.forEach(function (a) {
      const lvl = st.ach[a.id] || 0, v = a.v(st);
      const nextT = a.t[Math.min(lvl, a.t.length - 1)];
      const maxed = lvl >= a.t.length;
      el.appendChild(h('div', { class: 'ach' + (lvl ? '' : ' locked') },
        h('div', { class: 'ai', style: { background: a.c } }, h('span', { text: a.i }), h('small', { text: 'LV ' + lvl })),
        h('div', { class: 'at' }, h('b', { text: a.n }), h('span', { text: a.d.replace('{n}', a.label ? a.label(nextT) : nextT) + (maxed ? ' (최고 레벨!)' : '') }),
          h('div', { class: 'prog' }, h('div', { style: { width: Math.min(100, v / nextT * 100) + '%' } })), h('div', { class: 'small muted', style: { marginTop: '2px' }, text: (a.label ? a.label(v) : v) + ' / ' + (a.label ? a.label(nextT) : nextT) }))));
    });
  };

  /* ---------- 프로필 ---------- */
  APP.screens.profile = function (el) {
    const st = APP.state;
    const days = APP.today() - st.created + 1;
    el.appendChild(h('div', { class: 'prof-head' },
      h('div', { class: 'avatar', text: st.avatar, onclick: function () { APP.push(APP.screens.editProfile, '프로필 편집'); } }),
      h('div', { style: { flex: '1' } }, h('div', { class: 'pn', text: st.name }), h('div', { class: 'small muted', text: '학습 ' + days + '일째 · ' + LEAGUES[(st.league || { tier: 0 }).tier].n + ' 리그' })),
      h('button', { class: 'btn ghost sm', text: '⚙️', onclick: function () { APP.push(APP.screens.settings, '설정'); } })));
    el.appendChild(h('div', { class: 'sec-label', text: '통계' }));
    const s = st.stats;
    const acc = s.correct + s.wrong ? Math.round(s.correct / (s.correct + s.wrong) * 100) : 0;
    el.appendChild(h('div', { class: 'stat-grid' },
      sbox('🔥', st.streak, '연속 학습'), sbox('⚡', st.xp, '총 XP'), sbox('📚', APP.learnedCount('w:'), '학습한 단어'), sbox('🈷️', APP.learnedCount('kj:'), '학습한 한자'),
      sbox('🔤', APP.learnedCount('k:'), '학습한 가나'), sbox('🏯', APP.unitsDone(), '완료 유닛'), sbox('🎯', acc + '%', '전체 정확도'), sbox('⏱', Math.floor(s.ms / 60000) + '분', '총 학습 시간'),
      sbox('📘', s.lessons, '완료 레슨'), sbox('💯', s.perfect, '완벽한 레슨'), sbox('🎧', s.listen, '듣기 정답'), sbox('🎤', s.speak, '말하기 성공')));
    el.appendChild(h('div', { class: 'sec-label', text: '최근 7일' }));
    el.appendChild(xpChart());
    el.appendChild(h('div', { class: 'sec-label', text: '학습 달력 (최근 10주)' }));
    const heat = h('div', { class: 'heat' });
    const t = APP.today(); const startDay = t - 69 - ((new Date().getDay() + 6) % 7) + 6;
    for (let d = startDay; d <= startDay + 69; d++) {
      const v = st.daily[d] || 0;
      heat.appendChild(h('div', { class: (v >= 50 ? 'l3' : v >= 20 ? 'l2' : v > 0 ? 'l1' : '') + (d === t ? ' today' : ''), title: String(v) }));
    }
    el.appendChild(heat);
    el.appendChild(h('div', { class: 'sec-label', text: '실력 분석' }));
    el.appendChild(skillCard());
    el.appendChild(h('div', { class: 'pad col' },
      h('button', { class: 'btn ghost', text: '🏅 업적', onclick: function () { APP.push(APP.screens.achievements, '업적'); } }),
      h('button', { class: 'btn ghost', text: '🛍️ 상점', onclick: function () { APP.push(APP.screens.shop, '상점'); } }),
      h('button', { class: 'btn ghost', text: '⚙️ 설정', onclick: function () { APP.push(APP.screens.settings, '설정'); } }),
      U.hasBridge ? h('button', { class: 'btn ghost', text: '📤 친구에게 공유', onclick: function () { G.Android.share('니홍고 마스터로 일본어 ' + st.streak + '일 연속 공부 중! 🔥 총 ' + st.xp + ' XP, 단어 ' + APP.learnedCount('w:') + '개 학습'); } }) : null));
  };
  function skillCard() {
    const C = G.COURSE;
    const rows = C.sections.map(function (sec) {
      const done = sec.units.filter(APP.unitDone).length; const part = sec.units.reduce(function (a, u) { return a + Math.min(7, APP.state.progress[u.id] || 0); }, 0);
      return { n: sec.t, p: part / (sec.units.length * 7), c: sec.color, d: done + '/' + sec.units.length };
    });
    return h('div', { class: 'card', style: { margin: '0 16px' } }, rows.map(function (r) {
      return h('div', { style: { marginBottom: '10px' } }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', { class: 'small', text: r.n }), h('span', { class: 'small muted', style: { textAlign: 'right' }, text: Math.round(r.p * 100) + '% · ' + r.d })),
        h('div', { class: 'prog' }, h('div', { style: { width: r.p * 100 + '%', background: r.c } })));
    }));
  }
  APP.screens.editProfile = function (el) {
    const st = APP.state;
    const box = h('div', { class: 'pad' });
    const inp = h('input', { class: 'search', style: { margin: '0 0 16px', width: '100%' }, value: st.name, maxlength: '12' });
    inp.addEventListener('input', function () { st.name = inp.value.trim() || '학습자'; APP.save(); });
    box.appendChild(h('b', { text: '닉네임' })); box.appendChild(inp);
    box.appendChild(h('b', { text: '캐릭터' }));
    const g = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '8px', marginTop: '8px' } });
    AVATARS.forEach(function (a) { g.appendChild(h('button', { class: 'opt' + (st.avatar === a ? ' sel' : ''), style: { fontSize: '26px', padding: '8px', justifyContent: 'center' }, text: a, onclick: function () { st.avatar = a; APP.save(); APP.refresh(); } })); });
    box.appendChild(g); el.appendChild(box);
  };

  /* ---------- 상점 ---------- */
  APP.screens.shop = function (el) {
    const st = APP.state;
    el.appendChild(h('div', { class: 'h-title', text: '💎 ' + st.gems + ' 보석' }));
    el.appendChild(h('div', { class: 'h-sub', text: '레슨·퀘스트·업적·보물상자로 보석을 모아요' }));
    const items = [
      { i: '❤️', n: '하트 가득 채우기', d: '하트를 5개로 채워요', p: APP.HEART_COST, ok: function () { return APP.hearts() < APP.MAX_HEARTS; }, f: function () { st.hearts = APP.MAX_HEARTS; } },
      { i: '🧊', n: '스트릭 프리즈', d: '하루 빠져도 연속 기록을 지켜줘요 (최대 5개 보유) · 보유 ' + st.freeze, p: 200, ok: function () { return st.freeze < 5; }, f: function () { st.freeze++; } },
      { i: '⚡', n: 'XP 2배 부스트 (15분)', d: '15분 동안 모든 XP가 2배!', p: 150, ok: function () { return true; }, f: function () { st.boostUntil = Math.max(Date.now(), st.boostUntil) + 15 * 60000; } },
      { i: '🚀', n: 'XP 2배 부스트 (1시간)', d: '1시간 동안 모든 XP가 2배!', p: 450, ok: function () { return true; }, f: function () { st.boostUntil = Math.max(Date.now(), st.boostUntil) + 60 * 60000; } }
    ];
    if (Date.now() < st.boostUntil) el.appendChild(h('div', { class: 'card', style: { margin: '0 16px 10px' }, text: '⚡ 부스트 활성 중: ' + Math.ceil((st.boostUntil - Date.now()) / 60000) + '분 남음' }));
    items.forEach(function (it) {
      el.appendChild(h('div', { class: 'li', style: { padding: '14px 16px' } }, h('div', { class: 'lic', text: it.i }), h('div', { class: 'lit' }, h('b', { text: it.n }), h('span', { text: it.d })),
        h('button', { class: 'btn sm ' + (st.gems >= it.p && it.ok() ? 'blue' : ''), disabled: !(st.gems >= it.p && it.ok()), text: '💎' + it.p, onclick: function () {
          if (st.gems < it.p || !it.ok()) return;
          st.gems -= it.p; it.f(); APP.save(); U.sfx('chest'); U.toast(it.n + ' 구매 완료!'); APP.refresh();
        } })));
    });
  };

  /* ---------- 설정 ---------- */
  APP.screens.settings = function (el) {
    const st = APP.state, s = st.settings;
    function sw(key, title, sub, after) {
      const inp = h('input', { type: 'checkbox' }); inp.checked = !!s[key];
      inp.addEventListener('change', function () { s[key] = inp.checked; APP.save(); if (after) after(); });
      return h('div', { class: 'set-row' }, h('div', null, h('b', { text: title }), sub ? h('small', { text: sub }) : null), h('label', { class: 'switch' }, inp, h('span')));
    }
    function seg(key, title, opts, after) {
      const box = h('div', { class: 'seg' });
      opts.forEach(function (o) { box.appendChild(h('button', { class: s[key] === o[0] ? 'on' : '', text: o[1], onclick: function () { s[key] = o[0]; APP.save(); if (after) after(); APP.refresh(); } })); });
      return h('div', { class: 'set-row', style: { flexDirection: 'column', alignItems: 'stretch' } }, h('b', { text: title }), box);
    }
    el.appendChild(h('div', { class: 'sec-label', text: '학습' }));
    el.appendChild(seg('goal', '일일 목표 XP', [[10, '10'], [20, '20'], [30, '30'], [50, '50'], [100, '100']]));
    el.appendChild(sw('furi', '후리가나 표시', '한자 위에 읽는 법을 표시'));
    el.appendChild(sw('romaji', '로마자 표시', '문장 아래 로마자 발음 표시'));
    el.appendChild(sw('listening', '듣기 문제', '끄면 듣기 문제가 다른 문제로 대체'));
    el.appendChild(sw('speaking', '말하기 문제', '음성 인식(마이크) 문제'));
    el.appendChild(sw('unlimitedHearts', '무제한 하트', '실수해도 하트가 줄지 않아요', drawTop));
    el.appendChild(sw('unlockAll', '모든 유닛 잠금 해제', '원하는 유닛부터 자유롭게 학습'));
    el.appendChild(h('div', { class: 'sec-label', text: '소리' }));
    el.appendChild(sw('autoplay', '음성 자동 재생', '문제와 정답을 자동으로 읽어줘요'));
    el.appendChild(sw('sound', '효과음'));
    el.appendChild(sw('vibrate', '진동'));
    el.appendChild(seg('ttsRate', '음성 속도', [[0.6, '느리게'], [0.8, '조금 느리게'], [0.9, '보통'], [1.1, '빠르게']]));
    el.appendChild(h('div', { class: 'set-row' }, h('div', null, h('b', { text: '음성 테스트' }), h('small', { text: U.tts.available() ? '일본어 음성 사용 가능 ✓' : '일본어 음성을 찾을 수 없어요' })),
      h('button', { class: 'btn sm blue', text: '▶ 재생', onclick: function () { U.tts.speak('こんにちは。日本語を勉強しましょう。'); } })));
    if (U.hasBridge) el.appendChild(h('div', { class: 'set-row' }, h('div', null, h('b', { text: '일본어 음성 설치' }), h('small', { text: '소리가 안 나면 Google TTS 일본어 데이터를 설치하세요' })),
      h('button', { class: 'btn sm ghost', text: '열기', onclick: function () { G.Android.installTts(); } })));
    el.appendChild(h('div', { class: 'sec-label', text: '화면' }));
    el.appendChild(seg('dark', '다크 모드', [['auto', '시스템'], ['off', '라이트'], ['on', '다크']], APP.applyTheme));
    el.appendChild(h('div', { class: 'sec-label', text: '데이터' }));
    el.appendChild(h('div', { class: 'pad col' },
      h('button', { class: 'btn ghost', text: '📋 학습 기록 백업 (복사)', onclick: function () {
        const data = JSON.stringify(st);
        const ta = h('textarea', { class: 'type-area', style: { fontSize: '11px', height: '160px' } }); ta.value = data;
        APP.modal({ title: '백업 데이터', text: '아래 내용을 복사해 안전한 곳에 보관하세요.', body: ta, buttons: [{ t: '복사', f: function () { ta.select(); try { document.execCommand('copy'); U.toast('복사됨'); } catch (e) { /* */ } } }, { t: '닫기', c: 'ghost gray' }] });
      } }),
      h('button', { class: 'btn ghost', text: '📥 학습 기록 복원', onclick: function () {
        const ta = h('textarea', { class: 'type-area', style: { fontSize: '11px', height: '160px' }, placeholder: '백업 데이터를 붙여넣으세요' });
        APP.modal({ title: '기록 복원', body: ta, buttons: [{ t: '복원', f: function () { try { const d = JSON.parse(ta.value); if (!d || !d.settings) throw 0; U.store.set(KEY, d); location.reload(); } catch (e) { U.toast('올바른 백업 데이터가 아니에요'); } } }, { t: '취소', c: 'ghost gray' }] });
      } }),
      h('button', { class: 'btn red', text: '🗑 모든 학습 기록 초기화', onclick: function () {
        APP.modal({ icon: '⚠️', title: '정말 초기화할까요?', text: '모든 진행 상황, XP, 보석, 연속 학습 기록이 삭제됩니다.', buttons: [{ t: '초기화', c: 'red', f: function () { U.store.remove(KEY); location.reload(); } }, { t: '취소', c: 'ghost gray' }] });
      } })));
    el.appendChild(h('div', { class: 'center small muted', style: { padding: '10px 16px 30px' }, html: '니홍고 마스터 v1.1.1<br>유닛 ' + G.COURSE.units.length + ' · 단어 ' + G.COURSE.words.length + ' · 한자 ' + G.COURSE.kanji.length + ' · 예문 ' + G.COURSE.sents.length }));
  };

  document.addEventListener('DOMContentLoaded', function () {
    try { APP.init(); } catch (e) { document.body.innerHTML = '<pre style="padding:16px;white-space:pre-wrap">오류: ' + U.esc(e.stack || e) + '</pre>'; }
  });
})(window);
