/* 동사·형용사 활용 엔진 */
(function (G) {
  'use strict';
  const A = { 'う':'わ','く':'か','ぐ':'が','す':'さ','つ':'た','ぬ':'な','ぶ':'ば','む':'ま','る':'ら' };
  const I = { 'う':'い','く':'き','ぐ':'ぎ','す':'し','つ':'ち','ぬ':'に','ぶ':'び','む':'み','る':'り' };
  const E = { 'う':'え','く':'け','ぐ':'げ','す':'せ','つ':'て','ぬ':'ね','ぶ':'べ','む':'め','る':'れ' };
  const O = { 'う':'お','く':'こ','ぐ':'ご','す':'そ','つ':'と','ぬ':'の','ぶ':'ぼ','む':'も','る':'ろ' };
  const TE = { 'う':'って','つ':'って','る':'って','く':'いて','ぐ':'いで','す':'して','ぬ':'んで','ぶ':'んで','む':'んで' };
  const HONOR = ['いらっしゃる','くださる','なさる','おっしゃる','ござる'];

  // 활용형 정의: id, 이름, 설명
  const FORMS = [
    { id: 'masu', n: 'ます형 (정중)', ko: '~합니다', lv: 1 },
    { id: 'masen', n: 'ません (정중 부정)', ko: '~하지 않습니다', lv: 1 },
    { id: 'mashita', n: 'ました (정중 과거)', ko: '~했습니다', lv: 1 },
    { id: 'masendeshita', n: 'ませんでした (정중 과거 부정)', ko: '~하지 않았습니다', lv: 1 },
    { id: 'mashou', n: 'ましょう (권유)', ko: '~합시다', lv: 1 },
    { id: 'tai', n: 'たい (희망)', ko: '~하고 싶다', lv: 1 },
    { id: 'te', n: 'て형', ko: '~하고/~해서', lv: 2 },
    { id: 'ta', n: 'た형 (과거)', ko: '~했다', lv: 2 },
    { id: 'nai', n: 'ない형 (부정)', ko: '~하지 않는다', lv: 2 },
    { id: 'nakatta', n: 'なかった (과거 부정)', ko: '~하지 않았다', lv: 2 },
    { id: 'teiru', n: 'ている (진행·상태)', ko: '~하고 있다', lv: 2 },
    { id: 'pot', n: '가능형', ko: '~할 수 있다', lv: 3 },
    { id: 'vol', n: '의지형', ko: '~하자/~해야지', lv: 3 },
    { id: 'ba', n: 'ば 조건형', ko: '~하면', lv: 3 },
    { id: 'tara', n: 'たら 조건형', ko: '~하면/~했더니', lv: 3 },
    { id: 'imp', n: '명령형', ko: '~해라', lv: 4 },
    { id: 'pass', n: '수동형', ko: '~당하다/~되다', lv: 4 },
    { id: 'caus', n: '사역형', ko: '~하게 하다', lv: 4 },
    { id: 'causpass', n: '사역수동형', ko: '(억지로) ~하게 되다', lv: 4 },
    { id: 'nakereba', n: 'なければならない (의무)', ko: '~해야 한다', lv: 4 }
  ];
  const AFORMS = [
    { id: 'neg', n: '부정형', ko: '~지 않다', lv: 1 },
    { id: 'past', n: '과거형', ko: '~었다', lv: 1 },
    { id: 'negpast', n: '과거 부정형', ko: '~지 않았다', lv: 2 },
    { id: 'te', n: 'て형 (연결)', ko: '~고/~어서', lv: 2 },
    { id: 'adv', n: '부사형', ko: '~게', lv: 2 },
    { id: 'ba', n: '조건형', ko: '~면', lv: 3 },
    { id: 'sou', n: 'そう (양태)', ko: '~해 보인다', lv: 3 },
    { id: 'naru', n: '~なる (변화)', ko: '~해지다', lv: 3 }
  ];

  function last(s) { return s.slice(-1); }
  function stem(s) { return s.slice(0, -1); }

  function vf(s, cls, form, dict) {
    const isIku = /(^|[^き])行く$|^いく$|^ゆく$/.test(dict) || dict === 'いく';
    const isAru = dict === 'ある' || dict === '有る';
    const honor = HONOR.indexOf(s) >= 0 || /(いらっしゃ|くださ|なさ|おっしゃ)る$/.test(s);
    if (cls === 'v1') {
      const b = stem(s);
      switch (form) {
        case 'masu': return b + 'ます'; case 'masen': return b + 'ません'; case 'mashita': return b + 'ました';
        case 'masendeshita': return b + 'ませんでした'; case 'mashou': return b + 'ましょう'; case 'tai': return b + 'たい';
        case 'te': return b + 'て'; case 'ta': return b + 'た'; case 'nai': return b + 'ない'; case 'nakatta': return b + 'なかった';
        case 'teiru': return b + 'ている'; case 'pot': return b + 'られる'; case 'vol': return b + 'よう'; case 'ba': return b + 'れば';
        case 'tara': return b + 'たら'; case 'imp': return b + 'ろ'; case 'pass': return b + 'られる'; case 'caus': return b + 'させる';
        case 'causpass': return b + 'させられる'; case 'nakereba': return b + 'なければならない'; case 'dict': return s;
      }
    }
    // 5단
    const u = last(s), b = stem(s);
    const iStem = honor ? b + 'い' : b + I[u];
    let te = TE[u];
    if (isIku) te = 'って';
    switch (form) {
      case 'masu': return iStem + 'ます'; case 'masen': return iStem + 'ません'; case 'mashita': return iStem + 'ました';
      case 'masendeshita': return iStem + 'ませんでした'; case 'mashou': return iStem + 'ましょう'; case 'tai': return b + I[u] + 'たい';
      case 'te': return b + te; case 'ta': return b + te.replace(/て$/, 'た').replace(/で$/, 'だ');
      case 'nai': return isAru ? 'ない' : b + A[u] + 'ない';
      case 'nakatta': return isAru ? 'なかった' : b + A[u] + 'なかった';
      case 'teiru': return b + te + 'いる';
      case 'pot': return b + E[u] + 'る'; case 'vol': return b + O[u] + 'う'; case 'ba': return b + E[u] + 'ば';
      case 'tara': return b + te.replace(/て$/, 'たら').replace(/で$/, 'だら');
      case 'imp': return honor ? b + 'い' : b + E[u];
      case 'pass': return b + A[u] + 'れる'; case 'caus': return b + A[u] + 'せる';
      case 'causpass': return u === 'す' ? b + 'さ' + 'せられる' : b + A[u] + 'される';
      case 'nakereba': return isAru ? 'なければならない' : b + A[u] + 'なければならない';
      case 'dict': return s;
    }
    return s;
  }
  function suru(form) {
    return {
      masu: 'します', masen: 'しません', mashita: 'しました', masendeshita: 'しませんでした', mashou: 'しましょう', tai: 'したい',
      te: 'して', ta: 'した', nai: 'しない', nakatta: 'しなかった', teiru: 'している', pot: 'できる', vol: 'しよう', ba: 'すれば',
      tara: 'したら', imp: 'しろ', pass: 'される', caus: 'させる', causpass: 'させられる', nakereba: 'しなければならない', dict: 'する'
    }[form];
  }
  function kuru(form) {
    return {
      masu: 'きます', masen: 'きません', mashita: 'きました', masendeshita: 'きませんでした', mashou: 'きましょう', tai: 'きたい',
      te: 'きて', ta: 'きた', nai: 'こない', nakatta: 'こなかった', teiru: 'きている', pot: 'こられる', vol: 'こよう', ba: 'くれば',
      tara: 'きたら', imp: 'こい', pass: 'こられる', caus: 'こさせる', causpass: 'こさせられる', nakereba: 'こなければならない', dict: 'くる'
    }[form];
  }

  // 来る 표기: 来ます(きます)/来ない(こない) - 표기는 '来' + 나머지
  function kuruW(form) { const r = kuru(form); return '来' + r.slice(1); }

  function verb(word, reading, cls, form) {
    if (cls === 'vk') {
      const r = kuru(form);
      if (/^来る$/.test(word)) return { w: kuruW(form), r: r };
      const pw = word.replace(/来る$/, ''), pr = reading.replace(/くる$/, '');
      return { w: pw + (/来る$/.test(word) ? kuruW(form) : r), r: pr + r };
    }
    if (cls === 'vs') {
      const pre = word.replace(/する$/, ''), rpre = reading.replace(/する$/, '');
      const r = suru(form);
      return { w: pre + r, r: rpre + r };
    }
    return { w: vf(word, cls, form, word), r: vf(reading, cls, form, word) };
  }

  function adj(word, reading, cls, form) {
    if (cls === 'ai') {
      const isIi = /(^|[^぀-ゟ])いい$|^いい$|良い$/.test(word) && /いい$|よい$/.test(reading);
      let bw = stem(word), br = stem(reading);
      if (isIi) { bw = word.replace(/いい$/, 'よ').replace(/良い$/, '良'); br = reading.replace(/いい$|よい$/, 'よ'); }
      const suf = { neg: 'くない', past: 'かった', negpast: 'くなかった', te: 'くて', adv: 'く', ba: 'ければ', sou: 'そう', naru: 'くなる' }[form];
      if (form === 'sou' && isIi) return { w: bw + 'さそう', r: br + 'さそう' };
      if (form === 'sou') return { w: stem(word) + 'そう', r: stem(reading) + 'そう' };
      return { w: bw + suf, r: br + suf };
    }
    // na 형용사
    const suf = { neg: 'じゃない', past: 'だった', negpast: 'じゃなかった', te: 'で', adv: 'に', ba: 'なら', sou: 'そう', naru: 'になる' }[form];
    return { w: word + suf, r: reading + suf };
  }

  // 힌트용: 동사·형용사 모든 활용 → 원형 매핑
  function allForms(word, reading, cls) {
    const out = [];
    if (/^v/.test(cls)) {
      FORMS.forEach(function (f) { try { const x = verb(word, reading, cls, f.id); out.push({ w: x.w, r: x.r, f: f.n }); } catch (e) { /* */ } });
      ['masu', 'te', 'ta', 'nai'].forEach(function () { /* already */ });
      // 추가: ています/ていました/てください
      const te = verb(word, reading, cls, 'te');
      [['います', 'ている(정중)'], ['いました', 'ていた(정중)'], ['ください', 'てください(부탁)'], ['いない', 'ていない'], ['も いい', 'てもいい']].forEach(function (p) {
        out.push({ w: te.w + p[0].replace(' ', ''), r: te.r + p[0].replace(' ', ''), f: p[1] });
      });
      const nai = verb(word, reading, cls, 'nai');
      out.push({ w: nai.w.replace(/ない$/, 'ないで'), r: nai.r.replace(/ない$/, 'ないで'), f: 'ないで' });
      if (nai.w !== 'ない') {
        out.push({ w: nai.w.replace(/ない$/, ''), r: nai.r.replace(/ない$/, ''), f: 'ない형 어간' });
        const zu = cls === 'vs' ? { w: nai.w.replace(/しない$/, 'せず'), r: nai.r.replace(/しない$/, 'せず') } : { w: nai.w.replace(/ない$/, 'ず'), r: nai.r.replace(/ない$/, 'ず') };
        out.push({ w: zu.w, r: zu.r, f: 'ず (~하지 않고)' });
        out.push({ w: zu.w + 'に', r: zu.r + 'に', f: 'ずに (~하지 않고)' });
      }
      const masu = verb(word, reading, cls, 'masu');
      out.push({ w: masu.w.replace(/ます$/, 'ませんか'), r: masu.r.replace(/ます$/, 'ませんか'), f: 'ませんか(권유)' });
      out.push({ w: masu.w.replace(/ます$/, ''), r: masu.r.replace(/ます$/, ''), f: 'ます형 어간' });
    } else if (cls === 'ai' || cls === 'an') {
      AFORMS.forEach(function (f) { const x = adj(word, reading, cls, f.id); out.push({ w: x.w, r: x.r, f: f.n }); });
      if (cls === 'ai') {
        const n = adj(word, reading, cls, 'neg');
        out.push({ w: n.w.replace(/ない$/, 'ないです'), r: n.r.replace(/ない$/, 'ないです'), f: '정중 부정' });
        const p = adj(word, reading, cls, 'past');
        out.push({ w: p.w + 'です', r: p.r + 'です', f: '정중 과거' });
      } else {
        out.push({ w: word + 'な', r: reading + 'な', f: '명사 수식형' });
        out.push({ w: word + 'です', r: reading + 'です', f: '정중형' });
        out.push({ w: word + 'でした', r: reading + 'でした', f: '정중 과거' });
        out.push({ w: word + 'じゃありません', r: reading + 'じゃありません', f: '정중 부정' });
        out.push({ w: word + 'ではない', r: reading + 'ではない', f: '부정(문어)' });
      }
    }
    return out;
  }

  G.CONJ = { FORMS: FORMS, AFORMS: AFORMS, verb: verb, adj: adj, allForms: allForms };
})(window);
