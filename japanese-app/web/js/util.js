/* 공통 유틸리티 */
(function (G) {
  'use strict';
  const U = {};

  /* ---------- 저장소 (Android SharedPreferences ↔ localStorage) ---------- */
  const hasBridge = !!(G.Android && G.Android.getItem);
  U.hasBridge = hasBridge;
  U.store = {
    get: function (k, def) {
      try {
        const v = hasBridge ? G.Android.getItem(k) : G.localStorage.getItem(k);
        if (v === null || v === undefined || v === '') return def;
        return JSON.parse(v);
      } catch (e) { return def; }
    },
    set: function (k, v) {
      const s = JSON.stringify(v);
      try { if (hasBridge) G.Android.setItem(k, s); else G.localStorage.setItem(k, s); } catch (e) { /* ignore */ }
    },
    remove: function (k) {
      try { if (hasBridge) G.Android.removeItem(k); else G.localStorage.removeItem(k); } catch (e) { /* ignore */ }
    }
  };

  /* ---------- 난수 ---------- */
  U.rand = function (n) { return Math.floor(Math.random() * n); };
  U.pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  U.shuffle = function (a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  };
  U.sample = function (a, n, exclude) {
    const pool = exclude ? a.filter(function (x) { return exclude.indexOf(x) < 0; }) : a;
    return U.shuffle(pool).slice(0, n);
  };
  U.seeded = function (seed) {
    let s = seed >>> 0;
    return function () {
      s += 0x6D2B79F5; let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  U.hash = function (str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  U.uniq = function (a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); };

  /* ---------- 날짜 ---------- */
  U.dayKey = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  U.dayNum = function (d) { // 로컬 기준 일 번호
    d = d || new Date();
    return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  };
  U.weekNum = function (d) { // 월요일 시작 주 번호
    return Math.floor((U.dayNum(d) + 3) / 7);
  };

  /* ---------- DOM ---------- */
  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  U.h = function (tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v);
      }
    }
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x !== null && x !== undefined && x !== false) el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
      else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return el;
  };
  U.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };

  /* ---------- 가나 변환 ---------- */
  U.toKata = function (s) {
    return s.replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); });
  };
  U.toHira = function (s) {
    return s.replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });
  };
  U.isKanji = function (c) { return /[㐀-鿿豈-﫿々〆ヶ]/.test(c); };
  U.hasKanji = function (s) { return /[㐀-鿿豈-﫿々〆]/.test(s); };
  U.isKana = function (s) { return /^[぀-ヿー・\s]+$/.test(s); };

  // 가나 → 로마자 (헵번식)
  const K2R = {};
  (function () {
    const base = {
      'あ':'a','い':'i','う':'u','え':'e','お':'o','か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko','さ':'sa','し':'shi','す':'su','せ':'se','そ':'so',
      'た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to','な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no','は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
      'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo','や':'ya','ゆ':'yu','よ':'yo','ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro','わ':'wa','を':'wo','ん':'n',
      'が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go','ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo','だ':'da','ぢ':'ji','づ':'zu','で':'de','ど':'do',
      'ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo','ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po','ゔ':'vu',
      'ぁ':'a','ぃ':'i','ぅ':'u','ぇ':'e','ぉ':'o','ゃ':'ya','ゅ':'yu','ょ':'yo','ゎ':'wa'
    };
    for (const k in base) K2R[k] = base[k];
    const yo = { 'き':'ky','ぎ':'gy','に':'ny','ひ':'hy','び':'by','ぴ':'py','み':'my','り':'ry' };
    for (const k in yo) { K2R[k + 'ゃ'] = yo[k] + 'a'; K2R[k + 'ゅ'] = yo[k] + 'u'; K2R[k + 'ょ'] = yo[k] + 'o'; }
    const sp = { 'し':'sh','ち':'ch','じ':'j','ぢ':'j' };
    for (const k in sp) { K2R[k + 'ゃ'] = sp[k] + 'a'; K2R[k + 'ゅ'] = sp[k] + 'u'; K2R[k + 'ょ'] = sp[k] + 'o'; K2R[k + 'ぇ'] = sp[k] + 'e'; }
    Object.assign(K2R, {
      'ふぁ':'fa','ふぃ':'fi','ふぇ':'fe','ふぉ':'fo','てぃ':'ti','でぃ':'di','とぅ':'tu','どぅ':'du','うぃ':'wi','うぇ':'we','うぉ':'wo',
      'ゔぁ':'va','ゔぃ':'vi','ゔぇ':'ve','ゔぉ':'vo','つぁ':'tsa','いぇ':'ye'
    });
  })();
  U.romaji = function (s) {
    s = U.toHira(s);
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i], two = s.substr(i, 2);
      if (c === 'っ') {
        const nx = K2R[s.substr(i + 1, 2)] || K2R[s[i + 1]] || '';
        out += nx ? (nx.slice(0, 2) === 'ch' ? 't' : nx[0]) : '';
        continue;
      }
      if (c === 'ー') { const m = out.match(/[aeiou](?!.*[aeiou])/); out += m ? m[0] : '-'; continue; }
      if (K2R[two]) { out += K2R[two]; i++; continue; }
      if (K2R[c]) {
        if (c === 'ん' && /^[aiueoy]/.test(K2R[s.substr(i + 1, 2)] || K2R[s[i + 1]] || '')) out += "n'";
        else out += K2R[c];
        continue;
      }
      out += c;
    }
    return out;
  };

  // 로마자 → 히라가나 (입력기)
  const R2K = {};
  (function () {
    for (const k in K2R) { if (!R2K[K2R[k]] || k.length < R2K[K2R[k]].length || k === 'を') { if (k !== 'ぢ' && k !== 'づ' && !/^[ぁぃぅぇぉゃゅょゎ]$/.test(k)) R2K[K2R[k]] = k; } }
    R2K['wo'] = 'を'; R2K['ji'] = 'じ'; R2K['zu'] = 'ず'; R2K['ja'] = 'じゃ'; R2K['ju'] = 'じゅ'; R2K['jo'] = 'じょ';
    Object.assign(R2K, {
      'si':'し','ti':'ち','tu':'つ','hu':'ふ','zi':'じ','di':'ぢ','du':'づ','sya':'しゃ','syu':'しゅ','syo':'しょ','tya':'ちゃ','tyu':'ちゅ','tyo':'ちょ',
      'cya':'ちゃ','cyu':'ちゅ','cyo':'ちょ','zya':'じゃ','zyu':'じゅ','zyo':'じょ','jya':'じゃ','jyu':'じゅ','jyo':'じょ','dya':'ぢゃ','dyu':'ぢゅ','dyo':'ぢょ',
      'xa':'ぁ','xi':'ぃ','xu':'ぅ','xe':'ぇ','xo':'ぉ','la':'ぁ','li':'ぃ','lu':'ぅ','le':'ぇ','lo':'ぉ','xya':'ゃ','xyu':'ゅ','xyo':'ょ','lya':'ゃ','lyu':'ゅ','lyo':'ょ',
      'xtu':'っ','ltu':'っ','xtsu':'っ','ltsu':'っ','nn':'ん',"n'":'ん','-':'ー','ca':'か','cu':'く','co':'こ','qa':'くぁ','va':'ゔぁ','vi':'ゔぃ','vu':'ゔ','ve':'ゔぇ','vo':'ゔぉ',
      'thi':'てぃ','dhi':'でぃ','twu':'とぅ','dwu':'どぅ','whi':'うぃ','whe':'うぇ','who':'うぉ','she':'しぇ','che':'ちぇ','je':'じぇ','ye':'いぇ',
      ',':'、','.':'。','?':'？','!':'！'
    });
  })();
  U.kanaInput = function (str, final) {
    // final=true 이면 끝의 n 을 ん 으로
    let s = str.toLowerCase(), out = '', i = 0;
    while (i < s.length) {
      const c = s[i];
      if (!/[a-z'\-,.?!]/.test(c)) { out += c; i++; continue; }
      // 촉음
      if (i + 1 < s.length && c === s[i + 1] && /[bcdfghjklmpqrstvwxyz]/.test(c) && c !== 'n') { out += 'っ'; i++; continue; }
      if (c === 'n') {
        const nx = s[i + 1];
        if (nx === undefined) { out += final ? 'ん' : 'n'; i++; continue; }
        if (nx === 'n') { out += 'ん'; i += 2; continue; }
        if (nx === "'") { out += 'ん'; i += 2; continue; }
        if (!/[aiueoy]/.test(nx)) { out += 'ん'; i++; continue; }
      }
      let matched = false;
      for (let L = 4; L >= 1; L--) {
        const seg = s.substr(i, L);
        if (R2K[seg] && !(seg === 'n')) { out += R2K[seg]; i += L; matched = true; break; }
      }
      if (!matched) {
        // 미완성 (예: 'ky') — 그대로 두기
        out += c; i++;
      }
    }
    return out;
  };

  /* ---------- 후리가나 ---------- */
  // "私[わたし]は 学生[がくせい]です" 형식 파싱
  const FURI_RE = /([㐀-鿿豈-﫿々〆ヶ0-9０-９]+)\[([^\]]+)\]/g;
  U.plain = function (s) { return String(s).replace(FURI_RE, '$1').replace(/\s+/g, ''); };
  U.plainSpaced = function (s) { return String(s).replace(FURI_RE, '$1'); };
  U.readingOf = function (s) { return String(s).replace(FURI_RE, '$2').replace(/\s+/g, ''); };
  U.ruby = function (s, show) {
    const parts = []; let last = 0; s = String(s);
    s.replace(FURI_RE, function (m, k, r, off) {
      if (off > last) parts.push(U.esc(s.slice(last, off)));
      parts.push(show ? '<ruby>' + U.esc(k) + '<rt>' + U.esc(r) + '</rt></ruby>' : U.esc(k));
      last = off + m.length; return m;
    });
    if (last < s.length) parts.push(U.esc(s.slice(last)));
    return parts.join('');
  };
  // 단어+읽기 → 후리가나 HTML (오쿠리가나 정렬)
  U.wordRuby = function (word, reading, show) {
    if (!show || !reading || !U.hasKanji(word)) return U.esc(word);
    const segs = word.match(/[㐀-鿿豈-﫿々〆ヶ]+|[^㐀-鿿豈-﫿々〆ヶ]+/g) || [word];
    const re = new RegExp('^' + segs.map(function (sg) {
      return U.hasKanji(sg) || /[々〆ヶ]/.test(sg) ? '(.+?)' : '(' + U.toHira(sg).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')';
    }).join('') + '$');
    const m = U.toHira(reading).match(re);
    if (!m) return '<ruby>' + U.esc(word) + '<rt>' + U.esc(reading) + '</rt></ruby>';
    return segs.map(function (sg, i) {
      return (U.hasKanji(sg) || /[々〆ヶ]/.test(sg)) ? '<ruby>' + U.esc(sg) + '<rt>' + U.esc(m[i + 1]) + '</rt></ruby>' : U.esc(sg);
    }).join('');
  };

  /* ---------- 한국어 조사 ---------- */
  U.batchim = function (w) {
    const s = String(w).replace(/[)\]）」』\s.!?]+$/, '');
    const c = s.charCodeAt(s.length - 1);
    if (c >= 0xAC00 && c <= 0xD7A3) return (c - 0xAC00) % 28;
    if (/[0-9]$/.test(s)) return [1, 1, 0, 1, 0, 0, 1, 1, 1, 0][+s[s.length - 1]] ? 1 : 0; // 영일삼육칠팔 → 받침
    return 0;
  };
  U.josa = function (w, pair) { // pair: '은/는', '이/가', '을/를', '과/와', '으로/로', '이에요/예요'
    const p = pair.split('/'); const b = U.batchim(w);
    if (pair === '으로/로') return w + (b && b !== 8 ? p[0] : p[1]);
    return w + (b ? p[0] : p[1]);
  };

  /* ---------- 비교 ---------- */
  U.norm = function (s) {
    return U.toHira(String(s).toLowerCase())
      .replace(/[\s、。，．,.!?！？「」『』（）()〜~・…"'"“”‘’:：;；\-]/g, '')
      .replace(/ー/g, 'ー');
  };
  U.normKo = function (s) { return String(s).replace(/[\s.,!?~"'()·…:;]/g, '').replace(/[()]/g, ''); };
  U.lev = function (a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = new Array(n + 1), cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      const t = prev; prev = cur; cur = t;
    }
    return prev[n];
  };
  U.similar = function (a, b) { const L = Math.max(a.length, b.length) || 1; return 1 - U.lev(a, b) / L; };

  /* ---------- 숫자 → 일본어 읽기 ---------- */
  U.numJa = function (n) {
    if (n === 0) return 'ぜろ';
    const d = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'];
    function under1e4(x) {
      let s = '';
      const th = Math.floor(x / 1000), hu = Math.floor(x / 100) % 10, te = Math.floor(x / 10) % 10, on = x % 10;
      if (th) s += th === 1 ? 'せん' : th === 3 ? 'さんぜん' : th === 8 ? 'はっせん' : d[th] + 'せん';
      if (hu) s += hu === 1 ? 'ひゃく' : hu === 3 ? 'さんびゃく' : hu === 6 ? 'ろっぴゃく' : hu === 8 ? 'はっぴゃく' : d[hu] + 'ひゃく';
      if (te) s += te === 1 ? 'じゅう' : d[te] + 'じゅう';
      if (on) s += d[on];
      return s;
    }
    let s = '';
    const oku = Math.floor(n / 1e8), man = Math.floor(n / 1e4) % 1e4, rest = n % 1e4;
    if (oku) s += under1e4(oku) + 'おく';
    if (man) s += under1e4(man) + 'まん';
    s += under1e4(rest);
    return s;
  };
  U.numKo = function (n) { return n.toLocaleString('ko-KR'); };

  /* ---------- 음성 (TTS) ---------- */
  let jaVoice = null;
  function findVoice() {
    if (!G.speechSynthesis) return null;
    const vs = G.speechSynthesis.getVoices() || [];
    jaVoice = vs.find(function (v) { return /ja[-_]JP/i.test(v.lang); }) || vs.find(function (v) { return /^ja/i.test(v.lang); }) || null;
    return jaVoice;
  }
  if (G.speechSynthesis) { findVoice(); G.speechSynthesis.onvoiceschanged = findVoice; }
  U.tts = {
    available: function () {
      if (hasBridge && G.Android.ttsAvailable) { try { return G.Android.ttsAvailable(); } catch (e) { return false; } }
      return !!(G.speechSynthesis && (jaVoice || findVoice()));
    },
    speak: function (text, slow) {
      const st = G.APP && G.APP.state ? G.APP.state.settings : null;
      const base = st ? st.ttsRate : 1;
      const rate = slow ? base * 0.6 : base;
      text = U.plain(text);
      if (hasBridge && G.Android.speak) { try { G.Android.speak(text, rate); } catch (e) { /* */ } return; }
      if (!G.speechSynthesis) return;
      try {
        G.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ja-JP'; u.rate = rate; if (jaVoice || findVoice()) u.voice = jaVoice;
        G.speechSynthesis.speak(u);
      } catch (e) { /* */ }
    },
    stop: function () {
      if (hasBridge && G.Android.stopSpeak) { try { G.Android.stopSpeak(); } catch (e) { /* */ } return; }
      if (G.speechSynthesis) G.speechSynthesis.cancel();
    }
  };

  /* ---------- 음성 인식 ---------- */
  U.speech = {
    available: function () {
      return (hasBridge && !!G.Android.listen) || !!(G.SpeechRecognition || G.webkitSpeechRecognition);
    },
    listen: function (cb) {
      if (hasBridge && G.Android.listen) {
        G.__onSpeech = function (txt) { G.__onSpeech = null; cb(txt === null ? null : String(txt || '').split('\u0001').filter(Boolean)); };
        G.Android.listen('일본어로 말해 보세요');
        return;
      }
      const SR = G.SpeechRecognition || G.webkitSpeechRecognition;
      if (!SR) { cb(null); return; }
      const r = new SR(); r.lang = 'ja-JP'; r.maxAlternatives = 5; r.interimResults = false;
      let done = false;
      r.onresult = function (e) { done = true; const out = []; for (let i = 0; i < e.results[0].length; i++) out.push(e.results[0][i].transcript); cb(out); };
      r.onerror = function () { if (!done) { done = true; cb([]); } };
      r.onend = function () { if (!done) { done = true; cb([]); } };
      try { r.start(); } catch (e) { cb(null); }
    }
  };

  /* ---------- 효과음 ---------- */
  let actx = null;
  function ctx() {
    if (!actx) { const AC = G.AudioContext || G.webkitAudioContext; if (AC) actx = new AC(); }
    return actx;
  }
  function tone(freq, start, dur, type, vol) {
    const c = ctx(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, c.currentTime + start);
    g.gain.linearRampToValueAtTime(vol || 0.18, c.currentTime + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.05);
  }
  U.sfx = function (name) {
    const st = G.APP && G.APP.state ? G.APP.state.settings : null;
    if (st && !st.sound) return;
    try {
      const c = ctx(); if (c && c.state === 'suspended') c.resume();
      if (name === 'ok') { tone(784, 0, 0.12, 'sine'); tone(1175, 0.09, 0.22, 'sine'); }
      else if (name === 'bad') { tone(220, 0, 0.18, 'square', 0.08); tone(185, 0.12, 0.25, 'square', 0.08); }
      else if (name === 'tap') { tone(600, 0, 0.05, 'triangle', 0.08); }
      else if (name === 'done') { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.11, 0.3, 'triangle', 0.15); }); }
      else if (name === 'combo') { [880, 1109, 1319].forEach(function (f, i) { tone(f, i * 0.06, 0.15, 'sine', 0.12); }); }
      else if (name === 'fail') { [392, 330, 262].forEach(function (f, i) { tone(f, i * 0.18, 0.3, 'sawtooth', 0.07); }); }
      else if (name === 'chest') { [659, 784, 988, 1319, 1568].forEach(function (f, i) { tone(f, i * 0.08, 0.25, 'sine', 0.13); }); }
    } catch (e) { /* */ }
  };
  U.vibrate = function (ms) {
    const st = G.APP && G.APP.state ? G.APP.state.settings : null;
    if (st && !st.vibrate) return;
    if (hasBridge && G.Android.vibrate) { try { G.Android.vibrate(ms); } catch (e) { /* */ } }
    else if (G.navigator && G.navigator.vibrate) G.navigator.vibrate(ms);
  };
  U.toast = function (msg) {
    let t = U.$('#toast');
    if (!t) { t = U.h('div', { id: 'toast' }); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._tm); t._tm = setTimeout(function () { t.classList.remove('show'); }, 2200);
  };

  G.U = U;
})(window);
