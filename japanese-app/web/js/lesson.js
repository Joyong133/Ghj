/* 레슨 생성기 + 레슨 진행기 */
(function (G) {
  'use strict';
  const U = G.U, h = U.h, EX = G.EX;
  const LG = {};

  /* ---------- 풀(오답 보기) ---------- */
  function wordPool(unit) {
    const C = G.COURSE;
    const sec = unit.secObj.units;
    let pool = [];
    sec.forEach(function (u) { if (u.idx <= unit.idx + 1) pool = pool.concat(u.words); });
    if (pool.length < 12) pool = pool.concat(C.words.slice(0, 200));
    return pool;
  }
  function sentPool(unit) {
    const sec = unit.secObj.units; let pool = [];
    sec.forEach(function (u) { if (Math.abs(u.idx - unit.idx) <= 3) pool = pool.concat(u.sents); });
    if (pool.length < 10) pool = pool.concat(G.COURSE.sents.slice(0, 80));
    return pool;
  }
  function charPool(unit) {
    let pool = [];
    unit.secObj.units.forEach(function (u) { if (u.kind === 'kana' && u.script === unit.script && u.idx <= unit.idx) pool = pool.concat(u.chars); });
    if (pool.length < 8) unit.secObj.units.forEach(function (u) { if (u.kind === 'kana' && u.script === unit.script) pool = pool.concat(u.chars); });
    return pool;
  }
  function kanjiPool(unit) {
    let pool = [];
    unit.secObj.units.forEach(function (u) { if (Math.abs(u.idx - unit.idx) <= 4) pool = pool.concat(u.kanji); });
    return pool;
  }
  function seen(id) { return !!G.APP.state.srs[id]; }
  function push(arr, x) { if (x) arr.push(x); }
  function sentsWith(sents, words) {
    return sents.filter(function (s) { const p = U.plain(s.j); return words.some(function (w) { return p.indexOf(w.w) >= 0; }); });
  }
  function speakOn() { return G.APP.state.settings.speaking && U.speech.available(); }
  function listenOn() { return G.APP.state.settings.listening; }

  LG.nodeLabel = function (unit, k) {
    const base = { learn1: '새 단어 1', learn2: '새 단어 2', chest: '보물상자', sent: '문장 만들기', listen: '듣기·말하기', practice: '종합 연습', test: '유닛 테스트' };
    if (unit.kind === 'kana') return { learn1: '글자 익히기 1', learn2: '글자 익히기 2', chest: '보물상자', sent: '단어 읽기', listen: '듣기', practice: '쓰기 연습', test: '유닛 테스트' }[k];
    if (unit.kind === 'kanji') return { learn1: '한자 익히기 1', learn2: '한자 익히기 2', chest: '보물상자', sent: '한자어 읽기', listen: '듣기', practice: '쓰기 연습', test: '유닛 테스트' }[k];
    return base[k];
  };

  LG.forNode = function (unit, k) {
    if (unit.kind === 'kana') return kanaLesson(unit, k);
    if (unit.kind === 'kanji') return kanjiLesson(unit, k);
    return topicLesson(unit, k);
  };

  function topicLesson(unit, k) {
    const W = unit.words, S = unit.sents, wp = wordPool(unit), sp = sentPool(unit);
    const half = Math.ceil(W.length / 2);
    const out = [];
    if (k === 'learn1' || k === 'learn2') {
      const ws = k === 'learn1' ? W.slice(0, half) : W.slice(half);
      // 3~4개씩 묶어 소개 → 연습
      for (let i = 0; i < ws.length; i += 3) {
        const grp = ws.slice(i, i + 3);
        grp.forEach(function (w) { if (!seen(w.id)) out.push(EX.introWord(w)); });
        grp.forEach(function (w, j) { out.push(j % 2 ? EX.wordMC(w, wp) : EX.meaningMC(w, wp)); });
        if (listenOn() && grp[0]) out.push(EX.listenMC(U.pick(grp), wp));
      }
      out.push(EX.match(U.shuffle(ws).slice(0, 5)));
      const ss = U.shuffle(sentsWith(S, ws)).slice(0, 3);
      ss.forEach(function (s, i) { push(out, i === 0 ? EX.sentMC(s, sp) : EX.transJK(s, sp)); });
      if (k === 'learn2') U.sample(W.slice(0, half), 2).forEach(function (w) { out.push(EX.meaningMC(w, wp)); });
      return finalize(out, 16);
    }
    if (k === 'sent') {
      U.shuffle(S).slice(0, 9).forEach(function (s, i) {
        if (i % 3 === 0) out.push(EX.transJK(s, sp));
        else if (i % 3 === 1) out.push(EX.transKJ(s, sp));
        else push(out, EX.fill(s, sp, W));
      });
      U.sample(W, 2).forEach(function (w) { out.push(EX.wordMC(w, wp)); });
      push(out, EX.sentJaMC(U.pick(S), sp));
      return finalize(U.shuffle(out), 14);
    }
    if (k === 'listen') {
      const ss = U.shuffle(S);
      ss.slice(0, 5).forEach(function (s) { out.push(listenOn() ? EX.listenBuild(s, sp) : EX.transKJ(s, sp)); });
      U.sample(W, 3).forEach(function (w) { out.push(listenOn() ? EX.listenMeaning(w, wp) : EX.meaningMC(w, wp)); });
      if (listenOn()) U.sample(W.filter(function (w) { return w.r.length <= 6; }), 2).forEach(function (w) { out.push(EX.listenType(w)); });
      if (speakOn()) ss.slice(5, 8).forEach(function (s) { out.push(EX.speak(s)); });
      else ss.slice(5, 7).forEach(function (s) { out.push(EX.transJK(s, sp)); });
      return finalize(U.shuffle(out), 14);
    }
    if (k === 'practice') {
      out.push(EX.match(U.sample(W, 5)));
      U.sample(W, 3).forEach(function (w) { out.push(EX.typeReading(w)); });
      const ss = U.shuffle(S);
      ss.slice(0, 3).forEach(function (s) { out.push(EX.transKJ(s, sp)); });
      ss.slice(3, 5).forEach(function (s) { out.push(EX.transJK(s, sp)); });
      ss.slice(5, 7).forEach(function (s) { push(out, EX.fill(s, sp, W)); });
      if (listenOn()) ss.slice(7, 9).forEach(function (s) { out.push(EX.listenBuild(s, sp)); });
      if (speakOn() && ss[9]) out.push(EX.speak(ss[9]));
      return finalize(U.shuffle(out), 15);
    }
    if (k === 'test') {
      const ss = U.shuffle(S);
      ss.slice(0, 4).forEach(function (s) { out.push(EX.transKJ(s, sp)); });
      ss.slice(4, 7).forEach(function (s) { out.push(EX.transJK(s, sp)); });
      ss.slice(7, 9).forEach(function (s) { push(out, EX.fill(s, sp, W)); });
      if (listenOn()) ss.slice(9, 11).forEach(function (s) { out.push(EX.listenBuild(s, sp)); });
      U.sample(W, 4).forEach(function (w, i) { out.push(i % 2 ? EX.typeReading(w) : EX.wordMC(w, wp)); });
      U.sample(W, 2).forEach(function (w) { out.push(listenOn() ? EX.listenMeaning(w, wp) : EX.meaningMC(w, wp)); });
      return finalize(U.shuffle(out), 18);
    }
    return out;
  }

  function kanaLesson(unit, k) {
    const Cs = unit.chars, Ws = unit.words, cp = charPool(unit);
    const wp = Ws.length >= 4 ? Ws : Ws.concat(G.COURSE.unitMap.h1.words);
    const half = Math.ceil(Cs.length / 2);
    const out = [];
    if (!Cs.length) { // 촉음·장음 유닛
      const allH = []; G.COURSE.units.forEach(function (u) { if (u.kind === 'kana' && u.script === 'h') allH.push.apply(allH, u.chars); });
      if (k === 'learn1' || k === 'learn2') {
        const ws = k === 'learn1' ? Ws.slice(0, 6) : Ws.slice(6);
        ws.forEach(function (w) { if (!seen(w.id)) out.push(EX.introWord(w)); out.push(EX.kanaWordRead(w, wp)); });
        out.push(EX.match(ws));
        return finalize(out, 14);
      }
      if (k === 'sent' || k === 'listen') { U.shuffle(Ws).forEach(function (w, i) { out.push(i % 2 ? EX.listenMC(w, wp) : EX.meaningMC(w, wp)); }); return finalize(out, 12); }
      if (k === 'practice') { U.sample(Ws, 6).forEach(function (w) { out.push(EX.typeReading(w)); }); out.push(EX.match(U.sample(Ws, 5))); return finalize(out, 10); }
      U.sample(Ws, 12).forEach(function (w, i) { out.push([EX.kanaWordRead, EX.listenMC, EX.meaningMC][i % 3](w, wp)); });
      U.sample(allH, 4).forEach(function (c) { out.push(EX.kanaMC(c, allH)); });
      return finalize(U.shuffle(out), 16);
    }
    if (k === 'learn1' || k === 'learn2') {
      const cs = k === 'learn1' ? Cs.slice(0, half) : Cs.slice(half);
      for (let i = 0; i < cs.length; i += 2) {
        const grp = cs.slice(i, i + 2);
        grp.forEach(function (c) { if (!seen(c.id)) out.push(EX.introKana(c)); });
        grp.forEach(function (c) { out.push(EX.kanaMC(c, cp)); });
        grp.forEach(function (c) { out.push(EX.romajiMC(c, cp)); });
      }
      out.push(EX.kanaMatch(U.shuffle(cs)));
      if (k === 'learn2') out.push(EX.kanaMatch(U.sample(Cs, 5)));
      return finalize(out, 20);
    }
    if (k === 'sent') {
      U.shuffle(Ws).slice(0, 8).forEach(function (w, i) {
        if (!seen(w.id)) out.push(EX.introWord(w));
        out.push(i % 2 ? EX.kanaWordRead(w, wp) : EX.meaningMC(w, wp));
      });
      out.push(EX.match(U.sample(Ws, 5)));
      return finalize(out, 16);
    }
    if (k === 'listen') {
      U.sample(Cs, 8).forEach(function (c) { out.push(EX.kanaListen(c, cp)); });
      U.sample(Ws, 4).forEach(function (w) { out.push(EX.listenMC(w, wp)); });
      return finalize(U.shuffle(out), 12);
    }
    if (k === 'practice') {
      U.sample(Cs, 4).forEach(function (c) { out.push(EX.kanaTrace(c)); });
      U.sample(Cs, 4).forEach(function (c) { out.push(EX.kanaType(c)); });
      U.sample(Ws, 2).forEach(function (w) { out.push(EX.typeReading(w)); });
      out.push(EX.kanaMatch(U.sample(cp, 5)));
      return finalize(out, 11);
    }
    // test
    U.sample(Cs, 6).forEach(function (c, i) { out.push(i % 2 ? EX.kanaMC(c, cp) : EX.romajiMC(c, cp)); });
    U.sample(Cs, 4).forEach(function (c) { out.push(EX.kanaListen(c, cp)); });
    U.sample(Cs, 3).forEach(function (c) { out.push(EX.kanaType(c)); });
    U.sample(Ws, 4).forEach(function (w) { out.push(EX.kanaWordRead(w, wp)); });
    return finalize(U.shuffle(out), 17);
  }

  function kanjiLesson(unit, k) {
    const K = unit.kanji, W = unit.words, kp = kanjiPool(unit);
    const wp = W.concat(G.COURSE.words.filter(function (w) { return U.hasKanji(w.w); }).slice(0, 150));
    const out = [];
    if (k === 'learn1' || k === 'learn2') {
      const half = Math.ceil(K.length / 2);
      const ks = k === 'learn1' ? K.slice(0, half) : K.slice(half);
      ks.forEach(function (kj) {
        if (!seen(kj.id)) out.push(EX.introKanji(kj));
        out.push(EX.kanjiMeaning(kj, kp));
      });
      U.shuffle(ks).forEach(function (kj) { out.push(EX.kanjiFromMeaning(kj, kp)); });
      out.push(EX.kanjiMatch(ks.length >= 3 ? ks : ks.concat(U.sample(kp.filter(function (x) { return ks.indexOf(x) < 0; }), 3))));
      if (ks.length <= 3) U.sample(ks, 2).forEach(function (kj) { out.push(EX.kanjiReading(kj, kp)); });
      return finalize(out, 16);
    }
    if (k === 'sent') {
      U.sample(W, 10).forEach(function (w, i) { out.push(i % 3 === 2 ? EX.typeReading(w) : EX.meaningMC(w, wp)); });
      U.sample(K, 3).forEach(function (kj) { out.push(EX.kanjiReading(kj, kp)); });
      return finalize(U.shuffle(out), 13);
    }
    if (k === 'listen') {
      U.sample(W, 6).forEach(function (w) { out.push(EX.listenMC(w, wp)); });
      U.sample(W, 4).forEach(function (w) { out.push(EX.listenMeaning(w, wp)); });
      return finalize(U.shuffle(out), 10);
    }
    if (k === 'practice') {
      U.sample(K, 4).forEach(function (kj) { out.push(EX.kanjiTrace(kj)); });
      out.push(EX.kanjiMatch(K));
      U.sample(W, 4).forEach(function (w) { out.push(EX.typeReading(w)); });
      return finalize(out, 9);
    }
    U.sample(K, 5).forEach(function (kj) { out.push(EX.kanjiMeaning(kj, kp)); });
    U.sample(K, 3).forEach(function (kj) { out.push(EX.kanjiFromMeaning(kj, kp)); });
    U.sample(K, 3).forEach(function (kj) { out.push(EX.kanjiReading(kj, kp)); });
    U.sample(W, 5).forEach(function (w, i) { out.push(i % 2 ? EX.typeReading(w) : EX.meaningMC(w, wp)); });
    return finalize(U.shuffle(out), 16);
  }

  function finalize(arr, max) {
    arr = arr.filter(Boolean);
    // 소개 카드는 유지하고 연습문제만 max 로 제한
    let cnt = 0;
    return arr.filter(function (x) { if (/^intro/.test(x.type)) return true; cnt++; return cnt <= max; });
  }

  /* ---------- 복습/연습 세트 ---------- */
  LG.fromWords = function (words, n, opts) {
    opts = opts || {};
    const pool = words.length >= 8 ? words : words.concat(G.COURSE.words.slice(0, 120));
    const out = [];
    U.shuffle(words).slice(0, n).forEach(function (w, i) {
      const kinds = opts.listen ? [EX.listenMC, EX.listenMeaning, EX.listenType] :
        opts.write ? [EX.typeReading] : [EX.meaningMC, EX.wordMC, EX.listenMC, EX.typeReading, EX.meaningMC];
      const f = kinds[i % kinds.length];
      out.push(f === EX.typeReading || f === EX.listenType ? f(w) : f(w, pool));
    });
    if (!opts.listen && !opts.write && words.length >= 5) out.splice(Math.min(4, out.length), 0, EX.match(U.sample(words, 5)));
    return out;
  };
  LG.fromSents = function (sents, n, opts) {
    opts = opts || {};
    const pool = sents.length >= 8 ? sents : sents.concat(G.COURSE.sents.slice(0, 80));
    const out = [];
    U.shuffle(sents).slice(0, n).forEach(function (s, i) {
      if (opts.speak) out.push(EX.speak(s));
      else if (opts.listen) out.push(i % 3 === 2 ? EX.sentMC(s, pool) || EX.listenBuild(s, pool) : EX.listenBuild(s, pool));
      else out.push([EX.transJK, EX.transKJ, EX.fill, EX.listenBuild][i % 4](s, pool, []) || EX.transJK(s, pool));
    });
    return out;
  };

  /* ---------- 진행기 ---------- */
  const L = {};
  let cur = null;
  L.active = function () { return !!cur; };
  L.current = function () { return cur ? cur.ex : null; };
  L.run = function (cfg) {
    const st = G.APP.state;
    const total = cfg.items.length;
    const S = {
      queue: cfg.items.slice(), done: 0, total: total, correct: 0, wrong: 0, combo: 0, maxCombo: 0,
      t0: Date.now(), retried: new Set(), answered: false, ex: null, mode: cfg.mode || 'lesson', mistakesList: []
    };
    cur = S;
    const heartsOn = S.mode === 'lesson' && !st.settings.unlimitedHearts;
    const root = h('div', { class: 'lesson' });
    const x = h('button', { class: 'x', html: '✕', onclick: function () { L.quit(); } });
    const fill = h('div', { class: 'fill', style: { width: '0%' } });
    const hearts = h('div', { class: 'hearts-ind' });
    const comboEl = h('div', { class: 'combo-ind' });
    const body = h('div', { class: 'lesson-body' });
    const foot = h('div', { class: 'lesson-foot' });
    const skipBtn = h('button', { class: 'btn ghost gray hidden', style: { marginBottom: '10px' }, text: '건너뛰기' });
    const checkBtn = h('button', { class: 'btn', text: '확인', disabled: true });
    foot.appendChild(skipBtn); foot.appendChild(checkBtn);
    root.appendChild(h('div', { class: 'lesson-top' }, x, h('div', { class: 'pbar' }, fill), hearts));
    root.appendChild(comboEl); root.appendChild(body); root.appendChild(foot);
    document.body.appendChild(root);
    S.root = root;

    function drawHearts() {
      if (S.mode === 'test') hearts.innerHTML = '❌ ' + S.wrong + '/' + (cfg.maxMistakes || 3);
      else if (heartsOn) hearts.innerHTML = '❤️ ' + G.APP.hearts();
      else hearts.innerHTML = S.mode === 'lesson' ? '❤️ ∞' : '🏋️';
    }
    drawHearts();

    const ctl = {
      ready: function (b) { if (S.answered) return; checkBtn.disabled = !b; checkBtn.classList.toggle('disabled', !b); },
      locked: function () { return S.answered; },
      intro: function () { checkBtn.textContent = '계속'; checkBtn.disabled = false; checkBtn.classList.remove('disabled'); S.isIntro = true; },
      hideCheck: function () { checkBtn.classList.add('hidden'); },
      done: function (ok, info) { result(ok, info || {}); },
      submit: function () { if (!checkBtn.disabled) checkBtn.click(); },
      allowSkip: function (label) { skipBtn.textContent = label || '건너뛰기'; skipBtn.classList.remove('hidden'); }
    };

    function next() {
      EX.closeHint();
      const fb = U.$('.feedback', foot); if (fb) fb.remove();
      if (!S.queue.length) return finish(true);
      S.ex = S.queue.shift(); S.answered = false; S.isIntro = false;
      checkBtn.textContent = '확인'; checkBtn.disabled = true; checkBtn.classList.add('disabled'); checkBtn.classList.remove('hidden');
      skipBtn.classList.add('hidden');
      body.scrollTop = 0;
      if (S.retried.has(S.ex)) S.ex.badge = { t: '이전 실수', c: 'mistake' };
      EX.render(S.ex, body, ctl);
      body.classList.remove('fadein'); void body.offsetWidth; body.classList.add('fadein');
    }
    checkBtn.addEventListener('click', function () {
      if (S.isIntro) {
        (S.ex.items || []).forEach(function (id) { G.APP.srsSeen(id); });
        S.done++; progress(); return next();
      }
      if (S.answered) return next();
      const r = S.ex.check();
      result(r.ok, r);
    });
    skipBtn.addEventListener('click', function () {
      if (S.answered) return;
      S.answered = true; S.done++; progress();
      next();
    });
    function progress() { fill.style.width = Math.min(100, (S.done / S.total) * 100) + '%'; }

    function result(ok, r) {
      S.answered = true;
      const ex = S.ex;
      skipBtn.classList.add('hidden');
      (ex.items || []).forEach(function (id) { G.APP.srsUpdate(id, ok || r.soft); });
      G.APP.track(ex.skill, ok);
      if (ok) {
        S.correct++; S.combo++; S.maxCombo = Math.max(S.maxCombo, S.combo); S.done++;
        U.sfx(S.combo > 0 && S.combo % 5 === 0 ? 'combo' : 'ok'); U.vibrate(15);
        comboEl.textContent = S.combo >= 3 ? '🔥 ' + S.combo + '연속 정답!' : '';
      } else {
        U.sfx('bad'); U.vibrate(120);
        S.combo = 0; comboEl.textContent = '';
        if (!r.soft) {
          S.wrong++;
          S.mistakesList.push(ex);
          (ex.items || []).forEach(function (id) { G.APP.addMistake(id); });
          if (heartsOn) G.APP.loseHeart();
          if (S.mode !== 'test' && !S.retried.has(ex)) { S.retried.add(ex); S.queue.push(ex); }
          else S.done++;
        } else S.done++;
        body.classList.add('shake'); setTimeout(function () { body.classList.remove('shake'); }, 400);
      }
      progress(); drawHearts();
      const fb = h('div', { class: 'feedback ' + (ok ? 'ok' : 'bad') });
      fb.appendChild(h('div', { class: 'fh' }, h('span', { text: ok ? '✅' : (r.soft ? '💡' : '❌') }), h('span', { text: ok ? EX.praise() : (r.soft ? '아쉬워요!' : '오답입니다') })));
      if (r.answer && (!ok || ex.type === 'build' || ex.type === 'fill' || ex.type === 'type' || r.soft)) {
        fb.appendChild(h('div', { class: 'fa', html: (ok ? '' : '정답: ') + r.answer }));
      }
      if (ok && ex.sent && ex.lang !== 'ko' && ex.type !== 'speak') fb.appendChild(h('div', { class: 'fx', text: ex.sent.k }));
      const tools = h('div', { class: 'tools' });
      const say = ex.sent ? U.plain(ex.sent.j) : ex.say || ex.audio || ex.audioOnly || (ex.w && ex.w.r);
      if (say) tools.appendChild(h('button', { text: '🔊 다시 듣기', onclick: function () { U.tts.speak(say); } }));
      if (ex.sent) tools.appendChild(h('button', { text: '📌 문장 저장', onclick: function (e) { G.APP.saveSentence(ex.sent.id); e.target.textContent = '✔ 저장됨'; } }));
      if (tools.childNodes.length) fb.appendChild(tools);
      const cont = h('button', { class: 'btn ' + (ok ? '' : 'red'), text: '계속' });
      cont.addEventListener('click', function () {
        if (heartsOn && G.APP.hearts() <= 0) return outOfHearts();
        if (S.mode === 'test' && S.wrong > (cfg.maxMistakes || 3)) return finish(false);
        next();
      });
      fb.appendChild(cont);
      foot.appendChild(fb);
      if (ok && ex.sent && ex.type !== 'speak' && G.APP.state.settings.autoplay) setTimeout(function () { U.tts.speak(U.plain(ex.sent.j)); }, 150);
    }

    function outOfHearts() {
      U.sfx('fail');
      G.APP.modal({
        icon: '💔', title: '하트를 모두 잃었어요', text: '하트를 충전하거나, 복습으로 하트를 모으세요. 하트는 ' + G.APP.HEART_MIN + '분마다 1개씩 자동 회복돼요.',
        buttons: [
          { t: '💎 ' + G.APP.HEART_COST + '로 충전', c: 'blue', f: function () { if (G.APP.buyHearts()) { drawHearts(); next(); } else { U.toast('보석이 부족해요'); outOfHearts(); } } },
          { t: '무제한 하트 켜기 (설정)', c: 'ghost', f: function () { G.APP.state.settings.unlimitedHearts = true; G.APP.save(); location.reload(); } },
          { t: '레슨 종료', c: 'ghost gray', f: function () { close(); if (cfg.onQuit) cfg.onQuit(); } }
        ]
      });
    }

    function close() { root.remove(); cur = null; EX.closeHint(); U.tts.stop(); }
    L.quit = function () {
      G.APP.modal({
        icon: '😢', title: '정말 그만둘까요?', text: '지금 그만두면 이번 레슨의 진행 상황이 사라져요.',
        buttons: [
          { t: '계속 학습하기', c: '', f: function () { } },
          { t: '레슨 종료', c: 'ghost gray', f: function () { close(); if (cfg.onQuit) cfg.onQuit(); } }
        ]
      });
    };

    function finish(passed) {
      const ms = Date.now() - S.t0;
      const answered = S.correct + S.wrong;
      const acc = answered ? Math.round(S.correct / answered * 100) : 100;
      const res = { passed: passed, correct: S.correct, wrong: S.wrong, acc: acc, ms: ms, perfect: S.wrong === 0, maxCombo: S.maxCombo, mode: S.mode, mistakes: S.mistakesList };
      close();
      const xp = passed ? G.APP.awardLesson(res, cfg) : 0;
      res.xp = xp;
      showResult(res, cfg);
    }
    next();
  };

  function showResult(res, cfg) {
    const r = h('div', { class: 'result' });
    if (res.passed) {
      U.sfx('done');
      confetti();
      r.appendChild(h('div', { class: 'big-em', text: res.perfect ? '🏆' : cfg.mode === 'test' ? '🎖️' : '🎉' }));
      r.appendChild(h('h1', { text: res.perfect ? '완벽한 레슨!' : cfg.mode === 'test' ? '테스트 통과!' : '레슨 완료!' }));
    } else {
      U.sfx('fail');
      r.appendChild(h('div', { class: 'big-em', text: '😵' }));
      r.appendChild(h('h1', { class: 'fail', text: '테스트 실패… 다시 도전해요!' }));
    }
    const sec = Math.round(res.ms / 1000);
    r.appendChild(h('div', { class: 'res-boxes' },
      h('div', { class: 'res-box xp' }, h('div', { class: 'rl', text: '총 XP' }), h('div', { class: 'rv', text: '⚡' + res.xp })),
      h('div', { class: 'res-box acc' }, h('div', { class: 'rl', text: res.acc >= 90 ? '훌륭함' : '정확도' }), h('div', { class: 'rv', text: '🎯' + res.acc + '%' })),
      h('div', { class: 'res-box tm' }, h('div', { class: 'rl', text: '시간' }), h('div', { class: 'rv', text: '⏱' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') }))
    ));
    if (res.bonus) r.appendChild(h('div', { class: 'muted', style: { marginBottom: '14px' }, html: res.bonus }));
    if (res.maxCombo >= 5) r.appendChild(h('div', { class: 'muted', style: { marginBottom: '14px' }, text: '🔥 최대 ' + res.maxCombo + '연속 정답' }));
    const col = h('div', { class: 'col', style: { width: '100%' } });
    if (res.mistakes && res.mistakes.length) {
      col.appendChild(h('button', { class: 'btn ghost', text: '실수 복습하기 (' + res.mistakes.length + ')', onclick: function () {
        r.remove();
        L.run({ title: '실수 복습', items: res.mistakes.map(function (e) { const c = Object.assign({}, e); c.badge = { t: '실수 복습', c: 'mistake' }; return c; }), mode: 'practice', onDone: cfg.onDone });
      } }));
    }
    col.appendChild(h('button', { class: 'btn', text: '계속', onclick: function () { r.remove(); if (cfg.onDone) cfg.onDone(res); } }));
    r.appendChild(col);
    document.body.appendChild(r);
  }
  function confetti() {
    const colors = ['#58cc02', '#1cb0f6', '#ffc800', '#ff4b4b', '#ce82ff', '#ff9600'];
    for (let i = 0; i < 40; i++) {
      const c = h('div', { class: 'confetti', style: { left: Math.random() * 100 + 'vw', background: U.pick(colors), animationDuration: (1.6 + Math.random() * 1.6) + 's', animationDelay: Math.random() * 0.5 + 's', borderRadius: Math.random() < .5 ? '50%' : '2px' } });
      document.body.appendChild(c);
      setTimeout(function () { c.remove(); }, 4000);
    }
  }
  L.showResult = showResult;
  L.confetti = confetti;

  G.LG = LG; G.LESSON = L;
})(window);
