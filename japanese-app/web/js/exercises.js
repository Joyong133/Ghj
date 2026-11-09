/* 문제 생성기 + 렌더러 */
(function (G) {
  'use strict';
  const U = G.U, h = U.h;
  const EX = {};
  function S() { return G.APP.state.settings; }
  function furi() { return S().furi; }
  const PRAISE = ['훌륭해요!', '정답!', '잘했어요!', '완벽해요!', '대단해요!', '멋져요!', '바로 그거예요!', 'すごい！', 'いいね！', '좋아요!'];

  /* ---------- 표시 헬퍼 ---------- */
  EX.wordHtml = function (w, forceFuri) {
    return '<span class="jp">' + U.wordRuby(w.w, w.r, forceFuri === undefined ? furi() : forceFuri) + '</span>';
  };
  EX.sentHtml = function (s, tappable) {
    const toks = s.j.split(/\s+/).filter(Boolean);
    return '<span class="jp">' + toks.map(function (t) {
      const p = U.plain(t).replace(/[。、！？!?「」]/g, '');
      const html = U.ruby(t, furi());
      if (!tappable || !p) return html;
      return '<span class="tok" data-t="' + U.esc(p) + '">' + html + '</span>';
    }).join('') + '</span>' + (S().romaji ? '<div class="small muted" style="width:100%">' + U.esc(U.romaji(U.readingOf(s.j).replace(/[。、！？]/g, ' '))) + '</div>' : '');
  };
  EX.bindHints = function (root) {
    U.$$('.tok', root).forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        const t = el.getAttribute('data-t');
        const r = G.COURSE.lookup(t);
        U.tts.speak(t);
        showHint(el, t, r);
      });
    });
  };
  function showHint(anchor, t, res) {
    closeHint();
    const pop = h('div', { class: 'hint-pop' });
    if (res && res.length) {
      pop.innerHTML = res.map(function (x) {
        return '<div><b class="jp">' + U.esc(t) + '</b>' + (x.r && x.r !== t ? ' <span class="muted jp">(' + U.esc(x.r) + ')</span>' : '') + '<br>' + U.esc(x.m) + (x.f ? '<br><span class="small muted">' + U.esc(x.f) + '</span>' : '') + '</div>';
      }).join('<hr style="border:none;border-top:1px solid var(--line);margin:6px 0">');
    } else {
      pop.innerHTML = '<b class="jp">' + U.esc(t) + '</b><br><span class="muted small">' + U.esc(U.romaji(t)) + '</span>';
    }
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left + r.width / 2 - pw / 2)) + 'px';
    pop.style.top = (r.bottom + 8) + 'px';
    setTimeout(function () { document.addEventListener('click', closeHint, { once: true }); }, 0);
  }
  function closeHint() { U.$$('.hint-pop').forEach(function (p) { p.remove(); }); }
  EX.closeHint = closeHint;

  function spkBtn(text, slow, cls) {
    return h('button', { class: 'spk' + (slow ? ' slow' : '') + (cls ? ' ' + cls : ''), onclick: function (e) { e.stopPropagation(); U.tts.speak(text, slow); }, html: slow ? '🐢' : '🔊' });
  }
  EX.spkBtn = spkBtn;
  function title(t, badge) {
    return h('div', null, badge ? h('div', { class: 'ex-badge ' + (badge.c || ''), text: badge.t }) : null, h('div', { class: 'ex-title', text: t }));
  }

  /* ---------- 생성기 ---------- */
  function distinct(pool, item, key, n) {
    const seen = {}; seen[item[key]] = 1; const out = [];
    U.shuffle(pool).forEach(function (x) { if (out.length < n && !seen[x[key]]) { seen[x[key]] = 1; out.push(x); } });
    return out;
  }
  function samePosFirst(pool, w) {
    const same = pool.filter(function (x) { return x.p === w.p; });
    return same.length >= 6 ? same : pool;
  }

  EX.introWord = function (w) { return { type: 'intro_word', w: w, items: [w.id] }; };
  EX.introKana = function (c) { return { type: 'intro_kana', c: c, items: [c.id] }; };
  EX.introKanji = function (k) { return { type: 'intro_kanji', k: k, items: [k.id] }; };

  EX.meaningMC = function (w, pool) {
    const ds = distinct(samePosFirst(pool, w), w, 'm', 3);
    const opts = U.shuffle([w].concat(ds));
    return { type: 'mc', skill: 'read', items: [w.id], title: '알맞은 뜻을 고르세요', promptWord: w, audio: w.r,
      opts: opts.map(function (o) { return { html: U.esc(o.m), ok: o === w }; }), answer: U.esc(w.m) };
  };
  EX.wordMC = function (w, pool) {
    const ds = distinct(samePosFirst(pool, w), w, 'w', 3);
    const opts = U.shuffle([w].concat(ds));
    const cards = opts.every(function (o) { return o.e; });
    return { type: 'mc', skill: 'read', items: [w.id], title: cards ? '"' + w.m + '"에 해당하는 것은?' : '"' + w.m + '"을(를) 일본어로?', layout: cards ? 'cards' : 'grid',
      opts: opts.map(function (o) { return { html: EX.wordHtml(o), em: cards ? o.e : '', ok: o === w, say: o.r }; }), answer: EX.wordHtml(w) + ' — ' + U.esc(w.m) };
  };
  EX.listenMC = function (w, pool) {
    const ds = distinct(pool, w, 'r', 3);
    const opts = U.shuffle([w].concat(ds));
    return { type: 'mc', skill: 'listen', items: [w.id], title: '들리는 단어를 고르세요', audioOnly: w.r, layout: 'grid',
      opts: opts.map(function (o) { return { html: EX.wordHtml(o, false), ok: o === w }; }), answer: EX.wordHtml(w) + ' — ' + U.esc(w.m) };
  };
  EX.listenMeaning = function (w, pool) {
    const ds = distinct(pool, w, 'm', 3);
    const opts = U.shuffle([w].concat(ds));
    return { type: 'mc', skill: 'listen', items: [w.id], title: '듣고 뜻을 고르세요', audioOnly: w.r,
      opts: opts.map(function (o) { return { html: U.esc(o.m), ok: o === w }; }), answer: EX.wordHtml(w) + ' — ' + U.esc(w.m) };
  };
  EX.match = function (ws) {
    const uniq = []; const sm = {}, sw = {};
    ws.forEach(function (w) { if (!sm[w.m] && !sw[w.w] && uniq.length < 5) { sm[w.m] = sw[w.w] = 1; uniq.push(w); } });
    return { type: 'match', skill: 'read', items: uniq.map(function (w) { return w.id; }), title: '짝을 맞추세요',
      pairs: uniq.map(function (w) { return { a: EX.wordHtml(w), b: U.esc(w.m), say: w.r }; }) };
  };
  EX.typeReading = function (w) {
    if (U.hasKanji(w.w)) {
      return { type: 'type', skill: 'write', items: [w.id], title: '읽는 법을 입력하세요', promptHtml: '<span class="jp" style="font-size:40px">' + U.esc(w.w) + '</span><div class="muted" style="width:100%;font-size:15px">' + U.esc(w.m) + '</div>',
        mode: 'kana', answers: [w.r], answer: '<span class="jp">' + U.esc(w.r) + '</span>', say: w.r };
    }
    return { type: 'type', skill: 'write', items: [w.id], title: '일본어로 쓰세요', promptHtml: '<span style="font-size:24px;font-weight:700">' + U.esc(w.m) + '</span>',
      mode: 'kana', answers: [w.r, w.w], answer: '<span class="jp">' + U.esc(w.w) + '</span>', say: w.r };
  };
  EX.listenType = function (w) {
    return { type: 'type', skill: 'listen', items: [w.id], title: '들은 단어를 입력하세요', audioOnly: w.r, mode: 'kana', answers: [w.r, w.w], answer: EX.wordHtml(w, true) + ' — ' + U.esc(w.m), say: w.r };
  };

  function jaTiles(tokens) { return tokens.map(function (t) { return { html: U.ruby(t.raw.replace(/[。、！？!?「」]/g, ''), furi()), p: t.p, say: t.p }; }); }
  function koTiles(arr) { return arr.map(function (t) { return { html: U.esc(t), p: t }; }); }
  function poolTokens(pool, exclude) {
    const set = {}; exclude.forEach(function (t) { set[t] = 1; });
    const out = [];
    U.shuffle(pool).forEach(function (s) { G.COURSE.tokens(s).forEach(function (t) { if (!set[t.p]) { set[t.p] = 1; out.push(t); } }); });
    return out;
  }
  function poolKo(pool, exclude) {
    const set = {}; exclude.forEach(function (t) { set[t] = 1; });
    const out = [];
    U.shuffle(pool).forEach(function (s) { G.COURSE.koTokens(s.k).forEach(function (t) { if (!set[t]) { set[t] = 1; out.push(t); } }); });
    return out;
  }
  EX.transJK = function (s, pool) {
    const tg = G.COURSE.koTokens(s.k);
    const nd = Math.min(6, Math.max(3, Math.ceil(tg.length * 0.8)));
    const ds = poolKo(pool.filter(function (x) { return x !== s; }), tg).slice(0, nd);
    return { type: 'build', skill: 'read', lang: 'ko', items: [s.id], title: '이 문장을 번역하세요', sent: s, audio: U.plain(s.j),
      target: tg.join(''), alts: s.alt, bank: U.shuffle(koTiles(tg).concat(koTiles(ds))), answer: U.esc(s.k) };
  };
  EX.transKJ = function (s, pool) {
    const tk = G.COURSE.tokens(s);
    const nd = Math.min(6, Math.max(3, Math.ceil(tk.length * 0.7)));
    const ds = poolTokens(pool.filter(function (x) { return x !== s; }), tk.map(function (t) { return t.p; })).slice(0, nd);
    return { type: 'build', skill: 'write', lang: 'ja', items: [s.id], title: '일본어로 번역하세요', promptKo: s.k, sent: s,
      target: tk.map(function (t) { return t.p; }).join(''), bank: U.shuffle(jaTiles(tk).concat(jaTiles(ds))), answer: EX.sentHtml(s, false) };
  };
  EX.listenBuild = function (s, pool) {
    const tk = G.COURSE.tokens(s);
    const ds = poolTokens(pool.filter(function (x) { return x !== s; }), tk.map(function (t) { return t.p; })).slice(0, Math.min(5, Math.max(2, tk.length >> 1)));
    return { type: 'build', skill: 'listen', lang: 'ja', items: [s.id], title: '들은 내용을 입력하세요', audioOnly: U.plain(s.j), sent: s,
      target: tk.map(function (t) { return t.p; }).join(''), bank: U.shuffle(jaTiles(tk).concat(jaTiles(ds))), answer: EX.sentHtml(s, false) + '<div class="small">' + U.esc(s.k) + '</div>' };
  };
  const PART_SET = ['は', 'が', 'を', 'に', 'で', 'へ', 'と', 'も', 'の', 'から', 'まで', 'や', 'より', 'か', 'ね', 'よ'];
  EX.fill = function (s, pool, unitWords) {
    const tk = G.COURSE.tokens(s);
    if (tk.length < 2) return null;
    let idx = -1;
    const parts = tk.map(function (t, i) { return PART_SET.indexOf(t.p) >= 0 ? i : -1; }).filter(function (i) { return i >= 0; });
    const vocab = tk.map(function (t, i) { return (unitWords || []).some(function (w) { return w.w === t.p || w.r === t.p; }) ? i : -1; }).filter(function (i) { return i >= 0; });
    if (vocab.length && (Math.random() < 0.5 || !parts.length)) idx = U.pick(vocab);
    else if (parts.length) idx = U.pick(parts);
    else idx = U.rand(tk.length);
    const ans = tk[idx];
    let ds;
    if (PART_SET.indexOf(ans.p) >= 0) ds = U.sample(PART_SET.filter(function (p) { return p !== ans.p && ['か', 'ね', 'よ'].indexOf(p) < 0; }), 3);
    else {
      ds = poolTokens(pool.filter(function (x) { return x !== s; }), [ans.p]).filter(function (t) { return PART_SET.indexOf(t.p) < 0 && t.p.length > 0; }).slice(0, 3).map(function (t) { return t.p; });
      if (ds.length < 2) ds = ds.concat(U.sample((unitWords || []).map(function (w) { return w.w; }).filter(function (x) { return x !== ans.p; }), 3 - ds.length));
    }
    const opts = U.shuffle([ans.p].concat(ds.slice(0, 3)));
    return { type: 'fill', skill: 'read', items: [s.id], title: '빈칸을 채우세요', sent: s, tokens: tk, blank: idx,
      opts: opts.map(function (o) { return { html: '<span class="jp">' + U.esc(o) + '</span>', ok: o === ans.p }; }), answer: EX.sentHtml(s, false) };
  };
  EX.sentMC = function (s, pool) {
    const others = U.sample(pool.filter(function (x) { return x !== s && x.k !== s.k; }), 2);
    if (others.length < 2) return null;
    const opts = U.shuffle([s].concat(others));
    return { type: 'mc', skill: 'read', items: [s.id], title: '알맞은 뜻을 고르세요', promptSent: s, audio: U.plain(s.j),
      opts: opts.map(function (o) { return { html: U.esc(o.k), ok: o === s }; }), answer: U.esc(s.k) };
  };
  EX.sentJaMC = function (s, pool) {
    const others = U.sample(pool.filter(function (x) { return x !== s && U.plain(x.j) !== U.plain(s.j); }), 2);
    if (others.length < 2) return null;
    const opts = U.shuffle([s].concat(others));
    return { type: 'mc', skill: 'read', items: [s.id], title: '"' + s.k + '"', subtitle: '알맞은 일본어 문장을 고르세요',
      opts: opts.map(function (o) { return { html: EX.sentHtml(o, false), ok: o === s, say: U.plain(o.j) }; }), answer: EX.sentHtml(s, false) };
  };
  EX.speak = function (s) {
    return { type: 'speak', skill: 'speak', items: [s.id], title: '소리 내어 읽어 보세요', sent: s, answer: EX.sentHtml(s, false) };
  };
  EX.speakWord = function (w) {
    return { type: 'speak', skill: 'speak', items: [w.id], title: '소리 내어 읽어 보세요', word: w, answer: EX.wordHtml(w, true) };
  };

  // 가나
  EX.kanaMC = function (c, pool) {
    const ds = distinct(pool, c, 'r', 3);
    const opts = U.shuffle([c].concat(ds));
    return { type: 'mc', skill: 'read', items: [c.id], title: '이 글자의 소리는?', bigChar: c.c, audio: c.c, layout: 'grid',
      opts: opts.map(function (o) { return { html: '<b>' + o.r + '</b> <span class="small muted">' + o.ko + '</span>', ok: o === c }; }), answer: c.c + ' = ' + c.r + ' (' + c.ko + ')' };
  };
  EX.romajiMC = function (c, pool) {
    const ds = distinct(pool, c, 'c', 3);
    const opts = U.shuffle([c].concat(ds));
    return { type: 'mc', skill: 'read', items: [c.id], title: '"' + c.r + '" (' + c.ko + ')에 해당하는 글자는?', layout: 'grid', big: true,
      opts: opts.map(function (o) { return { html: '<span class="jp" style="font-size:34px">' + o.c + '</span>', ok: o === c, say: o.c }; }), answer: c.c };
  };
  EX.kanaListen = function (c, pool) {
    const ds = distinct(pool, c, 'c', 3).filter(function (x) { return x.r !== c.r; });
    const opts = U.shuffle([c].concat(ds));
    return { type: 'mc', skill: 'listen', items: [c.id], title: '들리는 글자를 고르세요', audioOnly: c.c, layout: 'grid', big: true,
      opts: opts.map(function (o) { return { html: '<span class="jp" style="font-size:34px">' + o.c + '</span>', ok: o === c }; }), answer: c.c + ' (' + c.r + ')' };
  };
  EX.kanaMatch = function (cs) {
    const u = []; const seen = {};
    cs.forEach(function (c) { if (!seen[c.r] && u.length < 5) { seen[c.r] = 1; u.push(c); } });
    return { type: 'match', skill: 'read', items: u.map(function (c) { return c.id; }), title: '짝을 맞추세요',
      pairs: u.map(function (c) { return { a: '<span class="jp" style="font-size:26px">' + c.c + '</span>', b: c.r, say: c.c }; }) };
  };
  EX.kanaTrace = function (c) { return { type: 'trace', skill: 'write', items: [c.id], title: '따라 써 보세요', ch: c.c, sub: c.r + ' · ' + c.ko, say: c.c }; };
  EX.kanaWordRead = function (w, pool) {
    const ds = distinct(pool, w, 'w', 3);
    const opts = U.shuffle([w].concat(ds));
    return { type: 'mc', skill: 'read', items: [w.id], title: '이 단어의 읽는 법은?', promptWord: w, audio: w.r, layout: 'grid',
      opts: opts.map(function (o) { return { html: '<b>' + U.esc(U.romaji(o.w)) + '</b>', ok: o === w }; }), answer: U.esc(w.w) + ' = ' + U.esc(U.romaji(w.w)) + ' (' + U.esc(w.m) + ')' };
  };
  EX.kanaType = function (c) {
    return { type: 'type', skill: 'write', items: [c.id], title: '로마자로 입력하세요', promptHtml: '<span class="jp" style="font-size:64px">' + c.c + '</span>', mode: 'romaji', answers: [c.r], answer: c.r, say: c.c };
  };

  // 한자
  EX.kanjiMeaning = function (k, pool) {
    const ds = distinct(pool, k, 'hm', 3);
    const opts = U.shuffle([k].concat(ds));
    return { type: 'mc', skill: 'read', items: [k.id], title: '이 한자의 훈음은?', bigChar: k.c, layout: 'grid',
      opts: opts.map(function (o) { return { html: '<b>' + U.esc(o.hm) + '</b>', ok: o === k }; }), answer: k.c + ' = ' + U.esc(k.hm) };
  };
  EX.kanjiFromMeaning = function (k, pool) {
    const ds = distinct(pool, k, 'c', 3);
    const opts = U.shuffle([k].concat(ds));
    return { type: 'mc', skill: 'read', items: [k.id], title: '"' + k.hm + '"에 해당하는 한자는?', layout: 'grid', big: true,
      opts: opts.map(function (o) { return { html: '<span class="jp" style="font-size:38px">' + o.c + '</span>', ok: o === k }; }), answer: k.c };
  };
  EX.kanjiReading = function (k, pool) {
    const rd = (k.on[0] || k.kun[0] || '').replace(/\..*$/, '');
    const others = U.uniq(U.shuffle(pool).map(function (x) { return (x.on[0] || x.kun[0] || '').replace(/\..*$/, ''); }).filter(function (x) { return x && x !== rd; })).slice(0, 3);
    const opts = U.shuffle([rd].concat(others));
    return { type: 'mc', skill: 'read', items: [k.id], title: '이 한자의 대표 읽기는?', bigChar: k.c, layout: 'grid',
      opts: opts.map(function (o) { return { html: '<span class="jp" style="font-size:22px">' + U.esc(o) + '</span>', ok: o === rd }; }), answer: k.c + ' : 음독 ' + U.esc(k.on.join('·') || '-') + ' / 훈독 ' + U.esc(k.kun.join('·') || '-') };
  };
  EX.kanjiTrace = function (k) { return { type: 'trace', skill: 'write', items: [k.id], title: '따라 써 보세요', ch: k.c, sub: k.hm, say: (k.kun[0] || k.on[0] || '').replace(/\./g, '') }; };
  EX.kanjiMatch = function (ks) {
    const u = U.sample(ks, 5);
    return { type: 'match', skill: 'read', items: u.map(function (k) { return k.id; }), title: '짝을 맞추세요',
      pairs: u.map(function (k) { return { a: '<span class="jp" style="font-size:28px">' + k.c + '</span>', b: U.esc(k.hm) }; }) };
  };

  /* ---------- 렌더러 ---------- */
  EX.render = function (ex, body, ctl) {
    body.innerHTML = '';
    closeHint();
    const R = RENDER[ex.type];
    R(ex, body, ctl);
  };

  const RENDER = {};

  RENDER.intro_word = function (ex, body, ctl) {
    const w = ex.w;
    const ex1 = (G.COURSE.sents || []).find(function (s) { return s.u === w.u && U.plain(s.j).indexOf(w.w) >= 0; });
    body.appendChild(h('div', { class: 'ex-badge new', text: '새 단어' }));
    const card = h('div', { class: 'intro-card' },
      w.e ? h('div', { class: 'em', text: w.e }) : null,
      h('div', { class: 'word jp', html: U.wordRuby(w.w, w.r, true) }),
      h('div', { class: 'rd' }, U.hasKanji(w.w) ? h('span', { class: 'jp', text: w.r + '  ' }) : null, h('span', { text: U.romaji(w.r) })),
      h('div', { class: 'mean', text: w.m }),
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '14px', gap: '12px' } }, [spkBtn(w.r, false, 'mid'), spkBtn(w.r, true)]),
      ex1 ? h('div', { class: 'ex' }, h('div', { class: 'jp', html: U.ruby(ex1.j.replace(/\s+/g, ''), furi()) }), h('div', { class: 'small muted', text: ex1.k })) : null
    );
    body.appendChild(card);
    if (S().autoplay) setTimeout(function () { U.tts.speak(w.r); }, 250);
    ctl.intro();
  };
  RENDER.intro_kana = function (ex, body, ctl) {
    const c = ex.c;
    body.appendChild(h('div', { class: 'ex-badge new', text: '새 글자' }));
    body.appendChild(h('div', { class: 'intro-card' },
      h('div', { class: 'kana-big jp', text: c.c }),
      h('div', { class: 'mean', text: c.r + '  ·  ' + c.ko }),
      h('div', { class: 'rd' }, h('span', { class: 'jp', text: (c.o ? '짝꿍: ' + c.o : '') })),
      c.mn ? h('div', { class: 'mn', text: '💡 ' + c.mn }) : null,
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '14px', gap: '12px' } }, [spkBtn(c.c, false, 'mid'), spkBtn(c.c, true)])
    ));
    if (S().autoplay) setTimeout(function () { U.tts.speak(c.c); }, 250);
    ctl.intro();
  };
  RENDER.intro_kanji = function (ex, body, ctl) {
    const k = ex.k;
    body.appendChild(h('div', { class: 'ex-badge new', text: '새 한자' }));
    body.appendChild(h('div', { class: 'intro-card' },
      h('div', { class: 'kana-big jp', text: k.c }),
      h('div', { class: 'mean', text: k.hm }),
      h('div', { class: 'rd', html: '음독 <b class="jp">' + U.esc(k.on.join('・') || '-') + '</b> · 훈독 <b class="jp">' + U.esc(k.kun.join('・') || '-') + '</b>' }),
      k.ex.length ? h('div', { class: 'ex' }, k.ex.map(function (e) {
        return h('div', { class: 'row', style: { justifyContent: 'space-between', margin: '6px 0' } }, h('span', { class: 'jp', style: { fontSize: '18px', flex: 'none' }, html: U.wordRuby(e.w, e.r, true) }), h('span', { class: 'small muted', style: { textAlign: 'right' }, text: e.m }), spkBtn(e.r));
      })) : null
    ));
    ctl.intro();
  };

  RENDER.mc = function (ex, body, ctl) {
    body.appendChild(title(ex.title, ex.badge));
    if (ex.subtitle) body.appendChild(h('div', { class: 'muted', style: { marginTop: '-8px', marginBottom: '12px' }, text: ex.subtitle }));
    if (ex.subtitleHtml) body.appendChild(h('div', { class: 'bubble', style: { justifyContent: 'center', textAlign: 'center', marginBottom: '16px', flexDirection: 'column' }, html: ex.subtitleHtml }));
    if (ex.audioOnly) {
      body.appendChild(h('div', { class: 'listen-row' }, spkBtn(ex.audioOnly, false, 'big'), spkBtn(ex.audioOnly, true, 'mid')));
      setTimeout(function () { U.tts.speak(ex.audioOnly); }, 300);
    } else if (ex.bigChar) {
      body.appendChild(h('div', { class: 'center', style: { margin: '0 0 18px' } }, h('div', { class: 'kana-big jp', text: ex.bigChar }), ex.audio ? spkBtn(ex.audio) : null));
    } else if (ex.promptWord || ex.promptSent) {
      const b = h('div', { class: 'bubble' });
      b.innerHTML = ex.promptWord ? '<span style="font-size:30px">' + EX.wordHtml(ex.promptWord) + '</span>' : EX.sentHtml(ex.promptSent, true);
      body.appendChild(h('div', { class: 'prompt-row' }, h('div', { class: 'char', text: G.APP.mascotFor(ex) }), b, ex.audio ? spkBtn(ex.audio) : null));
      EX.bindHints(b);
      if (ex.audio && S().autoplay) setTimeout(function () { U.tts.speak(ex.audio); }, 300);
    }
    const box = h('div', { class: 'opts' + (ex.layout === 'grid' || ex.layout === 'cards' ? ' grid' : '') });
    let sel = -1;
    ex.opts.forEach(function (o, i) {
      const b = h('button', { class: 'opt' + (ex.layout === 'cards' ? ' card' : '') + (ex.big ? ' big-jp' : '') });
      if (ex.layout === 'cards') { b.appendChild(h('div', { class: 'em', text: o.em })); b.appendChild(h('div', { class: 'lb', html: o.html })); }
      else { if (ex.layout !== 'grid') b.appendChild(h('span', { class: 'num', text: String(i + 1) })); b.appendChild(h('span', { html: o.html })); }
      b.addEventListener('click', function () {
        if (ctl.locked()) return;
        U.$$('.opt', box).forEach(function (x) { x.classList.remove('sel'); });
        b.classList.add('sel'); sel = i; U.sfx('tap');
        if (o.say) U.tts.speak(o.say);
        ctl.ready(true);
      });
      box.appendChild(b);
    });
    body.appendChild(box);
    ex.check = function () {
      const ok = sel >= 0 && ex.opts[sel].ok;
      const btns = U.$$('.opt', box);
      btns.forEach(function (b, i) { if (ex.opts[i].ok) b.classList.add('right'); else if (i === sel) b.classList.add('wrong'); });
      return { ok: ok, answer: ex.answer };
    };
  };

  RENDER.match = function (ex, body, ctl) {
    body.appendChild(title(ex.title, ex.badge));
    const left = U.shuffle(ex.pairs.map(function (p, i) { return { i: i, html: p.a, say: p.say }; }));
    const right = U.shuffle(ex.pairs.map(function (p, i) { return { i: i, html: p.b }; }));
    const wrap = h('div', { class: 'match' });
    const L = h('div', { class: 'mcol' }), R = h('div', { class: 'mcol' });
    let selL = null, selR = null, done = 0, mistakes = 0;
    function mk(item, side) {
      const b = h('button', { class: 'opt', html: item.html });
      b._i = item.i; b._side = side;
      b.addEventListener('click', function () {
        if (b.classList.contains('gone')) return;
        if (side === 'L') { if (selL) selL.classList.remove('sel'); selL = b; if (item.say) U.tts.speak(item.say); }
        else { if (selR) selR.classList.remove('sel'); selR = b; }
        b.classList.add('sel'); U.sfx('tap');
        if (selL && selR) {
          const a = selL, c = selR; selL = selR = null;
          if (a._i === c._i) {
            a.classList.remove('sel'); c.classList.remove('sel'); a.classList.add('right'); c.classList.add('right');
            setTimeout(function () { a.classList.remove('right'); c.classList.remove('right'); a.classList.add('gone'); c.classList.add('gone'); }, 350);
            done++;
            if (done === ex.pairs.length) setTimeout(function () { ctl.done(mistakes === 0 || mistakes <= 1, { answer: mistakes ? '실수 ' + mistakes + '회' : '' , soft: true }); }, 400);
          } else {
            mistakes++; U.sfx('bad'); U.vibrate(40);
            a.classList.add('wrong'); c.classList.add('wrong');
            setTimeout(function () { a.classList.remove('wrong', 'sel'); c.classList.remove('wrong', 'sel'); }, 450);
          }
        }
      });
      return b;
    }
    left.forEach(function (x) { L.appendChild(mk(x, 'L')); });
    right.forEach(function (x) { R.appendChild(mk(x, 'R')); });
    wrap.appendChild(L); wrap.appendChild(R);
    body.appendChild(wrap);
    ctl.hideCheck();
  };

  RENDER.build = function (ex, body, ctl) {
    body.appendChild(title(ex.title, ex.badge));
    if (ex.audioOnly) {
      body.appendChild(h('div', { class: 'listen-row' }, spkBtn(ex.audioOnly, false, 'big'), spkBtn(ex.audioOnly, true, 'mid')));
      setTimeout(function () { U.tts.speak(ex.audioOnly); }, 300);
    } else {
      const b = h('div', { class: 'bubble' });
      if (ex.lang === 'ko') { b.innerHTML = EX.sentHtml(ex.sent, true); EX.bindHints(b); }
      else b.innerHTML = '<span style="font-size:19px">' + U.esc(ex.promptKo) + '</span>';
      body.appendChild(h('div', { class: 'prompt-row' }, h('div', { class: 'char', text: G.APP.mascotFor(ex) }), b, ex.audio ? spkBtn(ex.audio) : null));
      if (ex.audio && S().autoplay) setTimeout(function () { U.tts.speak(ex.audio); }, 300);
    }
    const line = h('div', { class: 'answer-line' });
    const bank = h('div', { class: 'bank' });
    const chosen = [];
    ex.bank.forEach(function (t, i) {
      const tb = h('button', { class: 'tile' + (ex.lang === 'ja' ? ' tile jp' : ''), html: t.html });
      tb.addEventListener('click', function () {
        if (ctl.locked() || tb.classList.contains('used')) return;
        tb.classList.add('used'); U.sfx('tap');
        if (ex.lang === 'ja' && t.say) U.tts.speak(t.say);
        const placed = h('button', { class: 'tile' + (ex.lang === 'ja' ? ' jp' : ''), html: t.html });
        placed.addEventListener('click', function () {
          if (ctl.locked()) return;
          const k = chosen.indexOf(i); if (k >= 0) chosen.splice(k, 1);
          placed.remove(); tb.classList.remove('used');
          ctl.ready(chosen.length > 0);
        });
        line.appendChild(placed); chosen.push(i);
        ctl.ready(true);
      });
      bank.appendChild(tb);
    });
    body.appendChild(line); body.appendChild(bank);
    ex.check = function () {
      const ans = chosen.map(function (i) { return ex.bank[i].p; }).join('');
      let ok;
      if (ex.lang === 'ko') {
        const n = U.normKo(ans);
        ok = n === U.normKo(ex.target) || (ex.alts || []).some(function (a) { return U.normKo(a) === n; });
      } else {
        ok = U.norm(ans) === U.norm(ex.target);
      }
      return { ok: ok, answer: ex.answer };
    };
  };

  RENDER.fill = function (ex, body, ctl) {
    body.appendChild(title(ex.title, ex.badge));
    const b = h('div', { class: 'bubble', style: { fontSize: '22px' } });
    const parts = ex.tokens.map(function (t, i) {
      if (i === ex.blank) return '<span class="blank" style="display:inline-block;min-width:56px;border-bottom:3px solid var(--blue);text-align:center;color:var(--blue-d)">&nbsp;</span>';
      return '<span class="tok" data-t="' + U.esc(t.p) + '">' + U.ruby(t.raw.replace(/[。、！？!?]/g, ''), furi()) + '</span>';
    });
    b.innerHTML = '<span class="jp">' + parts.join('') + '</span><div class="small muted" style="width:100%">' + U.esc(ex.sent.k) + '</div>';
    body.appendChild(h('div', { class: 'prompt-row' }, h('div', { class: 'char', text: G.APP.mascotFor(ex) }), b));
    EX.bindHints(b);
    const box = h('div', { class: 'opts grid' });
    let sel = -1;
    ex.opts.forEach(function (o, i) {
      const bt = h('button', { class: 'opt', html: o.html });
      bt.addEventListener('click', function () {
        if (ctl.locked()) return;
        U.$$('.opt', box).forEach(function (x) { x.classList.remove('sel'); });
        bt.classList.add('sel'); sel = i; U.sfx('tap');
        const bl = U.$('.blank', b); bl.innerHTML = o.html;
        ctl.ready(true);
      });
      box.appendChild(bt);
    });
    body.appendChild(box);
    ex.check = function () {
      const ok = sel >= 0 && ex.opts[sel].ok;
      U.$$('.opt', box).forEach(function (bt, i) { if (ex.opts[i].ok) bt.classList.add('right'); else if (i === sel) bt.classList.add('wrong'); });
      U.tts.speak(U.plain(ex.sent.j));
      return { ok: ok, answer: ex.answer };
    };
  };

  RENDER.type = function (ex, body, ctl) {
    body.appendChild(title(ex.title, ex.badge));
    if (ex.audioOnly) {
      body.appendChild(h('div', { class: 'listen-row' }, spkBtn(ex.audioOnly, false, 'big'), spkBtn(ex.audioOnly, true, 'mid')));
      setTimeout(function () { U.tts.speak(ex.audioOnly); }, 300);
    } else {
      body.appendChild(h('div', { class: 'bubble', style: { justifyContent: 'center', textAlign: 'center', marginBottom: '16px', flexDirection: 'column' }, html: ex.promptHtml }));
    }
    const ta = h('textarea', { class: 'type-area', placeholder: ex.mode === 'romaji' ? '로마자 입력 (예: ka)' : ex.mode === 'num' ? '숫자 입력' : '로마자 또는 가나로 입력 (예: taberu → たべる)', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
    const pv = h('div', { class: 'type-preview jp' });
    ta.addEventListener('input', function () {
      const v = ta.value;
      if (ex.mode === 'kana' && /[a-zA-Z]/.test(v)) pv.textContent = '→ ' + U.kanaInput(v, false);
      else pv.textContent = '';
      ctl.ready(v.trim().length > 0);
    });
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (ta.value.trim()) ctl.submit(); } });
    body.appendChild(ta); body.appendChild(pv);
    if (ex.mode === 'kana') body.appendChild(h('div', { class: 'kbd-note', text: '💡 일본어 키보드가 없어도 로마자로 입력하면 자동 변환돼요. (ん = nn, っ = 자음 두 번, ー = -)' }));
    setTimeout(function () { try { ta.focus(); } catch (e) { /* */ } }, 350);
    ex.check = function () {
      const v = ta.value.trim();
      ta.blur();
      let ok;
      if (ex.mode === 'romaji') {
        const n = v.toLowerCase().replace(/[^a-z]/g, '');
        const alt = { shi: ['si'], chi: ['ti'], tsu: ['tu'], fu: ['hu'], ji: ['zi', 'di'], zu: ['du'], wo: ['o'], n: ['nn'], sha: ['sya'], shu: ['syu'], sho: ['syo'], cha: ['tya', 'cya'], chu: ['tyu'], cho: ['tyo'], ja: ['zya', 'jya'], ju: ['zyu', 'jyu'], jo: ['zyo', 'jyo'] };
        ok = ex.answers.some(function (a) { return n === a || (alt[a] || []).indexOf(n) >= 0; });
      } else {
        const kv = U.norm(U.kanaInput(v, true));
        ok = ex.answers.some(function (a) { return U.norm(a) === kv || U.norm(a) === U.norm(v); });
      }
      if (ex.say) U.tts.speak(ex.say);
      return { ok: ok, answer: ex.answer };
    };
  };

  RENDER.speak = function (ex, body, ctl) {
    body.appendChild(title(ex.title, ex.badge));
    const text = ex.sent ? U.plain(ex.sent.j) : ex.word.w;
    const reading = ex.sent ? U.readingOf(ex.sent.j) : ex.word.r;
    const b = h('div', { class: 'bubble' });
    b.innerHTML = ex.sent ? EX.sentHtml(ex.sent, true) + '<div class="small muted" style="width:100%">' + U.esc(ex.sent.k) + '</div>' : '<span style="font-size:30px">' + EX.wordHtml(ex.word, true) + '</span><div class="small muted" style="width:100%">' + U.esc(ex.word.m) + '</div>';
    body.appendChild(h('div', { class: 'prompt-row' }, h('div', { class: 'char', text: G.APP.mascotFor(ex) }), b, spkBtn(text)));
    EX.bindHints(b);
    const heard = h('div', { class: 'center muted', style: { minHeight: '48px', marginTop: '6px' } });
    let best = 0;
    const mic = h('button', { class: 'mic', html: '🎤' });
    mic.addEventListener('click', function () {
      if (ctl.locked()) return;
      if (!U.speech.available()) { heard.textContent = '이 기기에서는 음성 인식을 사용할 수 없어요. 건너뛰기를 눌러 주세요.'; return; }
      mic.classList.add('on'); heard.textContent = '듣는 중…';
      U.speech.listen(function (res) {
        mic.classList.remove('on');
        if (res === null) { heard.textContent = '음성 인식 앱을 찾을 수 없어요. (Google 앱 필요)'; return; }
        if (!res.length) { heard.textContent = '잘 들리지 않았어요. 다시 시도해 보세요.'; return; }
        const nt = U.norm(text), nr = U.norm(reading);
        best = 0; let bestTxt = res[0];
        res.forEach(function (r) {
          const s = Math.max(U.similar(U.norm(r), nt), U.similar(U.norm(r), nr));
          if (s > best) { best = s; bestTxt = r; }
        });
        heard.innerHTML = '인식된 문장: <b class="jp">' + U.esc(bestTxt) + '</b><br>정확도 ' + Math.round(best * 100) + '%';
        ctl.ready(true);
        if (best >= 0.6) ctl.submit();
      });
    });
    body.appendChild(mic); body.appendChild(heard);
    ctl.allowSkip('지금은 말할 수 없어요');
    ex.check = function () { return { ok: best >= 0.6, answer: ex.answer }; };
  };

  RENDER.trace = function (ex, body, ctl) {
    body.appendChild(title(ex.title, ex.badge));
    body.appendChild(h('div', { class: 'center muted', style: { marginTop: '-8px', marginBottom: '10px' } }, h('span', { text: ex.sub + '  ' }), spkBtn(ex.say || ex.ch)));
    const wrap = h('div', { class: 'trace-wrap' });
    const bg = h('canvas'); const cv = h('canvas');
    wrap.appendChild(h('div', { class: 'grid' })); wrap.appendChild(bg); wrap.appendChild(cv);
    body.appendChild(wrap);
    const tools = h('div', { class: 'trace-tools' });
    const clr = h('button', { class: 'btn ghost sm', text: '↺ 지우기' });
    const hide = h('button', { class: 'btn ghost sm gray', text: '👁 가이드 숨기기' });
    tools.appendChild(clr); tools.appendChild(hide); body.appendChild(tools);
    const res = h('div', { class: 'center small muted', style: { marginTop: '8px' } });
    body.appendChild(res);
    let strokes = [], cur = null, size = 0, dpr = window.devicePixelRatio || 1;
    const ctx = cv.getContext('2d'), bctx = bg.getContext('2d');
    function font(px) { return '500 ' + px + 'px "Noto Sans JP","Noto Sans CJK JP","IPAGothic",sans-serif'; }
    function drawGuide(c, s, color) {
      c.clearRect(0, 0, s, s); c.fillStyle = color; c.font = font(s * 0.78); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(ex.ch, s / 2, s / 2 + s * 0.03);
    }
    function setup() {
      size = wrap.clientWidth;
      [bg, cv].forEach(function (c) { c.width = size * dpr; c.height = size * dpr; });
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawGuide(bctx, size, getComputedStyle(document.documentElement).getPropertyValue('--line2') || '#ccc');
      redraw();
    }
    function redraw() {
      ctx.clearRect(0, 0, size, size);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1cb0f6'; ctx.lineWidth = size * 0.055;
      strokes.forEach(function (st) {
        ctx.beginPath(); st.forEach(function (p, i) { if (i) ctx.lineTo(p[0] * size, p[1] * size); else ctx.moveTo(p[0] * size, p[1] * size); });
        if (st.length === 1) ctx.lineTo(st[0][0] * size + 0.1, st[0][1] * size);
        ctx.stroke();
      });
    }
    function pos(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }
    cv.addEventListener('pointerdown', function (e) { if (ctl.locked()) return; cv.setPointerCapture(e.pointerId); cur = [pos(e)]; strokes.push(cur); redraw(); });
    cv.addEventListener('pointermove', function (e) { if (!cur) return; cur.push(pos(e)); redraw(); });
    function end() { if (cur) { cur = null; ctl.ready(strokes.length > 0); } }
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    clr.addEventListener('click', function () { strokes = []; redraw(); ctl.ready(false); res.textContent = ''; });
    function toggleGuide() { const hid = bg.style.visibility !== 'hidden'; bg.style.visibility = hid ? 'hidden' : 'visible'; hide.textContent = hid ? '👁 가이드 보기' : '👁 가이드 숨기기'; }
    hide.addEventListener('click', toggleGuide);
    if (ex.noGuide) toggleGuide();
    setTimeout(setup, 30);
    ex.check = function () {
      const N = 96;
      const g = document.createElement('canvas'); g.width = g.height = N; const gc = g.getContext('2d');
      drawGuide(gc, N, '#000');
      const gd = gc.getImageData(0, 0, N, N).data;
      // 굵은 가이드(허용범위)
      const g2 = document.createElement('canvas'); g2.width = g2.height = N; const g2c = g2.getContext('2d');
      drawGuide(g2c, N, '#000'); g2c.lineWidth = N * 0.09; g2c.strokeStyle = '#000'; g2c.font = font(N * 0.78); g2c.textAlign = 'center'; g2c.textBaseline = 'middle'; g2c.strokeText(ex.ch, N / 2, N / 2 + N * 0.03);
      const g2d = g2c.getImageData(0, 0, N, N).data;
      function userMask(lw) {
        const u = document.createElement('canvas'); u.width = u.height = N; const uc = u.getContext('2d');
        uc.lineCap = 'round'; uc.lineJoin = 'round'; uc.strokeStyle = '#000'; uc.lineWidth = lw;
        strokes.forEach(function (st) { uc.beginPath(); st.forEach(function (p, i) { if (i) uc.lineTo(p[0] * N, p[1] * N); else uc.moveTo(p[0] * N, p[1] * N); }); if (st.length === 1) uc.lineTo(st[0][0] * N + 0.1, st[0][1] * N); uc.stroke(); });
        return uc.getImageData(0, 0, N, N).data;
      }
      const uThick = userMask(N * 0.10), uThin = userMask(N * 0.04);
      let gN = 0, gHit = 0, uN = 0, uIn = 0;
      for (let i = 3; i < gd.length; i += 4) {
        if (gd[i] > 100) { gN++; if (uThick[i] > 100) gHit++; }
        if (uThin[i] > 100) { uN++; if (g2d[i] > 100) uIn++; }
      }
      const cover = gN ? gHit / gN : 0, prec = uN ? uIn / uN : 0;
      const score = Math.round((Math.min(1, cover / 0.8) * 0.6 + prec * 0.4) * 100);
      const ok = cover >= 0.6 && prec >= 0.65;
      res.textContent = '일치도 ' + score + '점';
      if (ex.say) U.tts.speak(ex.say);
      return { ok: ok, answer: '<span class="jp" style="font-size:30px">' + ex.ch + '</span> (일치도 ' + score + '점' + (ok ? ')' : ' — 가이드를 따라 더 꼼꼼히 써 보세요)'), soft: true };
    };
  };

  EX.praise = function () { return U.pick(PRAISE); };
  G.EX = EX;
})(window);
