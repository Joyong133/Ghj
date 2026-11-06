// 스르륵 모드: 다 나온 답변을 처음부터 원하는 속도로 한 글자씩 다시 보여 줌.
// 앱(MainActivity)이 페이지에 넣고 window.__srr 로 조작합니다.
(function () {
  if (window.__srr) return;

  // 답변 본문으로 보이는 요소들
  var SEL = '.prose, [class*="markdown"], [class*="Markdown"], ' +
    '[data-message-author-role="assistant"], [class*="message-content"]';
  var REMOVE = 'button, [role="button"], script, input, textarea, select, #__srr';

  function bridge() {
    return window.ArenaSrr ||
      { onState: function () {}, onPicked: function () {}, onPickedUser: function () {},
        getProgress: function () { return 0; }, saveProgress: function () {}, clearProgress: function () {} };
  }

  var cands = [];   // 고를 수 있는 답변 요소
  var lastSel = []; // 지금 재생 중인 원본 요소
  var box = null;   // 화면을 덮는 재생 영역
  var texts = [];   // { node, full, start, len }
  var els = [];     // { el, at, style }
  var total = 0, pos = 0, ci = 0, ei = 0;
  var playing = false, follow = true, speed = 25;
  var raf = 0, lastT = 0, lastReport = 0, followTimer = 0;
  var pickHandler = null;
  var key = '', lastSave = 0;
  var rainOn = false, rain = null;  // 비 내리기 효과
  var soundOn = true, snd = null, soundHold = false;  // 빗소리 (soundHold: 앱이 뒤로 갔을 때 잠시 멈춤)

  // ---- 보기 설정 (화면 색, 글자 크기, 줄 간격, 글꼴, 글 폭, 읽는 줄 강조, 커서, 빗소리 크기) ----
  var view = { theme: 'site', scale: 1, lh: 0, font: 'site', width: 820, focus: false, caret: false, volume: 0.9 };
  var THEMES = {
    night:    { bg: '#0f1115', fg: '#d6d8de', head: '#ffffff', accent: '#8ab4f8', code: '#1b1e25', line: '#2c303a' },
    paper:    { bg: '#f4ecd8', fg: '#3b3125', head: '#24190f', accent: '#9a5b20', code: '#ebe0c4', line: '#d6c7a3' },
    forest:   { bg: '#13201a', fg: '#cfe3d4', head: '#effaf1', accent: '#7fd1a0', code: '#1b2b22', line: '#2c4236' },
    ocean:    { bg: '#0d1a2b', fg: '#cfe0f5', head: '#eef5ff', accent: '#7cc4ff', code: '#15263d', line: '#253b58' },
    sunset:   { bg: '#2b1a22', fg: '#f4dad3', head: '#fff1ec', accent: '#ffab91', code: '#3a2430', line: '#4c3142' },
    mint:     { bg: '#eef7f3', fg: '#20352b', head: '#0f2419', accent: '#16865a', code: '#dcefe5', line: '#c2dfd1' },
    contrast: { bg: '#000000', fg: '#ffff00', head: '#ffffff', accent: '#00ffff', code: '#141414', line: '#777777' }
  };
  var FONTS = {
    gothic: '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic","맑은 고딕",sans-serif',
    serif: '"Noto Serif KR","Noto Serif CJK KR","Nanum Myeongjo","Batang","바탕","AppleMyungjo",serif'
  };
  var BLOCKS = 'p,h1,h2,h3,h4,h5,h6,pre,blockquote,td,th,li';
  var viewSheet = null, viewStyleEl = null, caretEl = null, curBlock = null;

  // 보기 설정을 CSS로 만들어 문서에 붙임 (CSSOM이라 페이지 보안 정책에 막히지 않음)
  function viewCss() {
    var S = '#__srr', css = [];
    var t = THEMES[view.theme];
    if (t) {
      css.push(S + '{background:' + t.bg + '!important;color:' + t.fg + '!important}');
      css.push(S + ' *:not(canvas){color:inherit!important;border-color:' + t.line + '!important}');
      css.push(S + ' :is(h1,h2,h3,h4,h5,h6,strong,b,th){color:' + t.head + '!important}');
      css.push(S + ' a{color:' + t.accent + '!important}');
      css.push(S + ' :is(pre,code,pre *){background-color:' + t.code + '!important}');
      css.push(S + ' :is(div,section,article,table,tr,td,th,ul,ol,li,p,blockquote):not(.__srr_caret){background-color:transparent!important}');
    }
    css.push(S + ' > :not(canvas):not(.__srr_caret){zoom:' + view.scale + ';max-width:min(100%,' + view.width + 'px)!important}');
    if (view.lh > 0) css.push(S + ' *:not(canvas){line-height:' + view.lh + '!important}');
    if (FONTS[view.font]) css.push(S + ' *:not(canvas):not(pre):not(code):not(pre *){font-family:' + FONTS[view.font] + '!important}');
    // 안쪽 문단만 흐리게 (목록 안 문단처럼 겹치면 두 번 흐려지지 않게)
    css.push(S + '[data-srr-focus]:not([data-srr-done]) :is(' + BLOCKS + '):not(:has(' + BLOCKS + ')):not([data-srr-cur]){opacity:.3}');
    css.push(S + ' :is(' + BLOCKS + '){transition:opacity .35s}');
    css.push('.__srr_caret{position:absolute;width:2px;border-radius:1px;z-index:2;pointer-events:none;' +
      'background:' + (t ? t.accent : 'currentColor') + '!important;animation:__srr_blink 1s steps(1) infinite}');
    css.push('@keyframes __srr_blink{50%{opacity:0}}');
    return css.join('\n');
  }
  function applyView() {
    var css = viewCss();
    try {
      if (!viewSheet) {
        viewSheet = new CSSStyleSheet();
        document.adoptedStyleSheets = document.adoptedStyleSheets.concat([viewSheet]);
      }
      viewSheet.replaceSync(css);
    } catch (e) {  // 오래된 브라우저: <style>로
      if (!viewStyleEl) {
        viewStyleEl = document.createElement('style');
        document.head.appendChild(viewStyleEl);
      }
      viewStyleEl.textContent = css;
    }
    if (box) {
      if (view.focus) box.setAttribute('data-srr-focus', ''); else box.removeAttribute('data-srr-focus');
      if (rain) { stopRain(); startRain(); }  // 화면 색이 바뀌면 빗줄기 색도 다시
      updateCaret();
      if (follow && ci < texts.length) scrollTo(texts[ci].node);
    }
    if (snd) snd.master.gain.setTargetAtTime(view.volume, snd.ctx.currentTime, 0.1);
  }
  function setView(v) {
    for (var k in v) if (k in view) view[k] = v[k];
    view.scale = Math.min(2.2, Math.max(0.7, +view.scale || 1));
    view.volume = Math.min(1.5, Math.max(0, +view.volume));
    applyView();
  }

  // 지금 나오는 글자 자리에 깜빡이는 커서
  function updateCaret() {
    if (!box) return;
    var node = ci < texts.length ? texts[ci].node : null;
    if (!view.caret || !node || !node.nodeValue || pos >= total) {
      if (caretEl) caretEl.style.display = 'none';
      return;
    }
    if (!caretEl || caretEl.parentNode !== box) {
      caretEl = document.createElement('div');
      caretEl.className = '__srr_caret';
      box.appendChild(caretEl);
    }
    var r = document.createRange();
    r.selectNodeContents(node);
    var rects = r.getClientRects();
    if (!rects.length) { caretEl.style.display = 'none'; return; }
    var last = rects[rects.length - 1], br = box.getBoundingClientRect();
    caretEl.style.display = 'block';
    caretEl.style.left = (last.right - br.left + box.scrollLeft + 1) + 'px';
    caretEl.style.top = (last.top - br.top + box.scrollTop) + 'px';
    caretEl.style.height = last.height + 'px';
  }
  // 읽는 줄 강조: 지금 나오는 문단 표시
  function markBlock(node) {
    var b = node && node.parentElement ? node.parentElement.closest(BLOCKS) : null;
    if (b && !box.contains(b)) b = null;
    if (b === curBlock) return;
    if (curBlock) curBlock.removeAttribute('data-srr-cur');
    curBlock = b;
    if (b) b.setAttribute('data-srr-cur', '');
  }

  // 답변 내용으로 이름표를 만듦 (같은 답변이면 앱을 다시 켜도 같은 이름표)
  function keyOf(sel) {
    var s = sel.map(textOf).join('\u0001');
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return 'srr_' + (h >>> 0).toString(36) + '_' + s.length;
  }

  // 본 위치를 앱에 저장 (끝까지 봤으면 기록을 지움)
  function save(force) {
    if (!key || !box || !total) return;
    var now = Date.now();
    if (!force && now - lastSave < 1500) return;
    lastSave = now;
    try {
      if (pos >= total || pos < 1) bridge().clearProgress(key);
      else bridge().saveProgress(key, Math.floor(pos), total);
    } catch (e) {}
  }

  function visible(e) {
    var r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function textOf(e) { return (e.innerText || e.textContent || '').trim(); }

  // 내가 보낸 질문인지 판단.
  // arena.ai는 질문 줄(ol의 바로 아래 칸)에 justify-end(오른쪽 정렬)가 붙고, 답변 줄에는 없음.
  function isUserMessage(e) {
    for (var n = e; n && n !== document.body; n = n.parentElement) {
      if (n.matches && n.matches('[data-message-author-role="user"], [data-role="user"]')) return true;
      if (n.matches && n.matches('[data-message-author-role="assistant"], [data-role="assistant"]')) return false;
      var parent = n.parentElement;
      if (parent && (parent.tagName === 'OL' || parent.tagName === 'UL')) {
        return n.classList.contains('justify-end');
      }
    }
    return false;
  }

  // 가장 최근 AI 답변(대결 모드면 나란히 있는 답변들)을 찾음.
  // arena.ai의 대화 목록은 최신 글이 DOM 맨 앞에 오므로(flex-col-reverse) 화면 위치로 순서를 정함.
  function find() {
    var all = [].slice.call(document.querySelectorAll(SEL)).filter(function (e) {
      return !e.closest('#__srr') && visible(e) && textOf(e).length > 0;
    });
    all = all.filter(function (e) {
      return !all.some(function (o) { return o !== e && o.contains(e); });
    });
    var answers = all.filter(function (e) { return !isUserMessage(e); });
    if (!answers.length) { cands = []; return '[]'; }
    var latest = answers.reduce(function (a, b) {
      return b.getBoundingClientRect().top > a.getBoundingClientRect().top ? b : a;
    });
    var lt = latest.getBoundingClientRect().top;
    cands = answers.filter(function (e) {
      return Math.abs(e.getBoundingClientRect().top - lt) < 120;
    }).sort(function (a, b) {
      return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
    });
    return JSON.stringify(cands.map(function (e) {
      return textOf(e).replace(/\s+/g, ' ').slice(0, 80);
    }));
  }

  // 사용자가 화면에서 답변을 눌러 고르는 모드
  function pickByTap() {
    cancelPick();
    pickHandler = function (ev) {
      var t = ev.target && ev.target.nodeType === 1 ? ev.target : ev.target.parentElement;
      if (!t || t.closest('#__srr') || t.closest('[data-arena-ui]')) return;
      ev.preventDefault();
      ev.stopPropagation();
      var m = t.closest(SEL);
      if (!m) {
        m = t;
        while (m.parentElement && m.parentElement !== document.body && textOf(m).length < 40) {
          m = m.parentElement;
        }
      }
      // 내 질문을 누르면 고르지 않고 계속 기다림
      if (isUserMessage(m)) {
        try { bridge().onPickedUser(); } catch (e) {}
        return;
      }
      cancelPick();
      cands = [m];
      bridge().onPicked();
    };
    document.addEventListener('click', pickHandler, true);
  }
  function cancelPick() {
    if (pickHandler) document.removeEventListener('click', pickHandler, true);
    pickHandler = null;
  }

  function backgroundOf(e) {
    for (var n = e; n && n.nodeType === 1; n = n.parentElement) {
      var c = getComputedStyle(n).backgroundColor;
      if (c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c)) return c;
    }
    return matchMedia('(prefers-color-scheme: dark)').matches ? '#121212' : '#ffffff';
  }

  function start(indices) {
    var sel = (indices || [0]).map(function (i) { return cands[i]; }).filter(Boolean);
    if (!sel.length) return 'none';
    if (box) close(true);          // 보던 답변이 있으면 그 위치를 먼저 저장
    key = keyOf(sel);
    var saved = 0;
    try { saved = +bridge().getProgress(key) || 0; } catch (e) {}
    lastSel = sel;
    build();
    var result = 'ok';
    if (saved > 0 && saved < total) {
      // 지난번에 멈춘 곳까지 바로 펼쳐 놓고 거기서부터 이어서 보여 줌
      pos = saved;
      render();
      save(true);
      result = 'resumed:' + Math.round(saved * 100 / total);
    }
    play();
    return result;
  }

  function build() {
    close(true);
    var first = lastSel[0];
    var cs = getComputedStyle(first);
    box = document.createElement('div');
    box.id = '__srr';
    box.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'bottom:0', 'z-index:2147483646',
      'overflow-y:auto', 'overflow-x:hidden', '-webkit-overflow-scrolling:touch',
      'box-sizing:border-box', 'padding:20px 16px 240px',
      'background:' + backgroundOf(first), 'color:' + cs.color,
      'font-family:' + cs.fontFamily, 'font-size:' + cs.fontSize, 'line-height:' + cs.lineHeight
    ].join(';');

    lastSel.forEach(function (orig, i) {
      if (lastSel.length > 1) {
        var label = document.createElement('div');
        label.textContent = '답변 ' + (i + 1);
        label.style.cssText = 'font-weight:700;opacity:.6;max-width:820px;margin:' + (i ? '28px' : '0') +
          ' auto 8px;position:relative;z-index:1';
        box.appendChild(label);
      }
      var clone = orig.cloneNode(true);
      [].slice.call(clone.querySelectorAll(REMOVE)).forEach(function (n) { n.remove(); });
      clone.removeAttribute('id');
      clone.style.maxWidth = 'min(100%, 820px)';
      clone.style.margin = '0 auto';
      clone.style.position = 'relative';
      clone.style.zIndex = '1';
      box.appendChild(clone);
    });

    // 링크를 눌러도 이동하지 않게
    box.addEventListener('click', function (ev) { ev.preventDefault(); }, true);

    // 손으로 스크롤하는 동안은 자동 따라가기를 잠시 멈춤, 짧게 톡 누르면 재생/일시정지
    var tx = 0, ty = 0, tt = 0;
    box.addEventListener('touchstart', function (ev) {
      follow = false;
      clearTimeout(followTimer);
      var p = ev.touches[0];
      tx = p.clientX; ty = p.clientY; tt = Date.now();
    }, { passive: true });
    box.addEventListener('touchend', function (ev) {
      var p = ev.changedTouches[0];
      var moved = Math.abs(p.clientX - tx) + Math.abs(p.clientY - ty);
      if (moved < 10 && Date.now() - tt < 300) {
        follow = true;
        toggle();
      } else {
        followTimer = setTimeout(function () { follow = true; }, 2500);
      }
    }, { passive: true });

    // 글자와 요소를 모두 숨겨 두고, 순서대로 하나씩 보여 줌
    texts = []; els = []; total = 0;
    var walker = document.createTreeWalker(box, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())) {
      if (n.nodeType === 3) {
        var full = n.nodeValue;
        var inPre = n.parentElement && n.parentElement.closest('pre');
        var len = (!inPre && !/\S/.test(full)) ? 0 : full.length;
        texts.push({ node: n, full: full, start: total, len: len });
        total += len;
        n.nodeValue = '';
      } else {
        els.push({ el: n, at: texts.length, style: n.getAttribute('style') });
        n.style.setProperty('display', 'none', 'important');
      }
    }
    pos = 0; ci = 0; ei = 0;
    follow = true;
    curBlock = null;
    caretEl = null;
    document.body.appendChild(box);
    applyView();
    if (rainOn) startRain();
    updateSound();
    report(true);
  }

  // ---- 비 내리기 효과: 글 뒤에 캔버스를 깔고 비를 그림 ----
  // 원근감 있는 3겹 빗줄기(잔상), 바람, 바닥에 튀는 물방울, 유리창 물방울, 물안개
  var LAYERS = [
    { per: 9000, len: [7, 13], v: [330, 470], w: 1.0, a: 0.24, wind: 0.8 },                // 멀리
    { per: 17000, len: [14, 24], v: [580, 780], w: 1.4, a: 0.40, wind: 1.0 },              // 중간
    { per: 42000, len: [28, 46], v: [950, 1250], w: 2.1, a: 0.62, wind: 1.15, splash: true } // 가까이
  ];
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rainColor() {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(box).backgroundColor || '');
    var lum = m ? (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) : 255;
    return lum < 128 ? { rgb: '182,204,234', dark: true, k: 1 } : { rgb: '58,84,132', dark: false, k: 0.8 };
  }
  // 빗줄기 모양을 미리 그려 둠 (꼬리는 투명, 끝은 진하게)
  function streakSprite(layer, col, dpr) {
    var L = layer.len[1], pad = 2, W = layer.w + pad * 2;
    var c = document.createElement('canvas');
    c.width = Math.ceil(W * dpr);
    c.height = Math.ceil(L * dpr);
    var x = c.getContext('2d');
    x.scale(dpr, dpr);
    var a = layer.a * col.k;
    var g = x.createLinearGradient(0, 0, 0, L);
    g.addColorStop(0, 'rgba(' + col.rgb + ',0)');
    g.addColorStop(0.65, 'rgba(' + col.rgb + ',' + (a * 0.55).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + col.rgb + ',' + a.toFixed(3) + ')');
    x.strokeStyle = g;
    x.lineWidth = layer.w;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(W / 2, layer.w);
    x.lineTo(W / 2, L - layer.w / 2);
    x.stroke();
    return { img: c, w: W };
  }
  // 유리창 물방울 모양 (테두리는 진하고 가운데는 맑게, 위쪽에 반짝임)
  function beadSprite(col, dpr) {
    var R = 16, c = document.createElement('canvas');
    c.width = c.height = Math.ceil(R * 2 * dpr);
    var x = c.getContext('2d');
    x.scale(dpr, dpr);
    var rim = col.dark ? '200,220,245' : '50,75,120';
    var g = x.createRadialGradient(R * 0.85, R * 0.8, R * 0.1, R, R, R);
    g.addColorStop(0, 'rgba(' + rim + ',0.02)');
    g.addColorStop(0.7, 'rgba(' + rim + ',' + (col.dark ? 0.10 : 0.08) + ')');
    g.addColorStop(0.92, 'rgba(' + rim + ',' + (col.dark ? 0.38 : 0.28) + ')');
    g.addColorStop(1, 'rgba(' + rim + ',0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(R, R, R, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,' + (col.dark ? 0.55 : 0.85) + ')';
    x.beginPath();
    x.ellipse(R * 0.68, R * 0.58, R * 0.22, R * 0.14, -0.6, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = 'rgba(0,0,0,' + (col.dark ? 0.18 : 0.07) + ')';
    x.beginPath();
    x.ellipse(R * 1.08, R * 1.55, R * 0.55, R * 0.16, 0, 0, Math.PI * 2);
    x.fill();
    return c;
  }
  function newDrop(L, anywhere) {
    return {
      L: L, x: rnd(-120, rain.w + 60), y: anywhere ? rnd(-40, rain.h) : rnd(-rain.h * 0.25, -20),
      len: rnd(L.len[0], L.len[1]), v: rnd(L.v[0], L.v[1]), o: rnd(0.65, 1),
      ground: rain.h * rnd(0.84, 0.99)
    };
  }
  function newBead(r) {
    return {
      x: rnd(0, rain.w), y: rnd(0, rain.h * 0.92), r: r || rnd(1.6, 6.5), grow: 0,
      life: rnd(8, 20), age: 0, vy: 0, slide: false, wait: rnd(1, 9), trail: [], wob: rnd(0, 6)
    };
  }
  function sizeRain() {
    if (!rain) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    rain.dpr = dpr;
    rain.w = window.innerWidth;
    rain.h = window.innerHeight;
    rain.canvas.width = Math.round(rain.w * dpr);
    rain.canvas.height = Math.round(rain.h * dpr);
    var area = rain.w * rain.h;
    rain.sprites = LAYERS.map(function (L) { return streakSprite(L, rain.color, dpr); });
    rain.bead = beadSprite(rain.color, dpr);
    rain.drops = [];
    LAYERS.forEach(function (L) {
      var n = Math.round(Math.min(160, Math.max(12, area / L.per)));
      for (var i = 0; i < n; i++) rain.drops.push(newDrop(L, true));
    });
    rain.maxBeads = Math.round(Math.min(40, Math.max(12, area / 22000)));
    rain.beads = [];
    for (var j = 0; j < rain.maxBeads * 0.6; j++) rain.beads.push(newBead());
    rain.fx = [];
  }
  // 바람: 세기가 천천히 바뀜
  function windAt(t) {
    return 0.13 + 0.08 * Math.sin(t * 0.23) + 0.05 * Math.sin(t * 0.71 + 1.3) + 0.02 * Math.sin(t * 2.1);
  }
  function splash(x, y, near) {
    rain.fx.push({ k: 'ring', x: x, y: y, t: 0, life: rnd(0.35, 0.6), r: rnd(5, 12) });
    var n = 2 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) {
      rain.fx.push({ k: 'dot', x: x, y: y, vx: rnd(-70, 70) + near * 20, vy: -rnd(70, 190), t: 0, life: rnd(0.25, 0.45), r: rnd(0.7, 1.4) });
    }
  }
  function rainFrame(t) {
    if (!rain) return;
    var dt = rain.last ? Math.min(t - rain.last, 50) / 1000 : 0;
    rain.last = t;
    rain.time += dt;
    var ctx = rain.ctx, dpr = rain.dpr, col = rain.color;
    var wind = windAt(rain.time);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, rain.canvas.width, rain.canvas.height);

    // 1) 유리창 물방울 (맨 뒤)
    if (rain.beads.length < rain.maxBeads && Math.random() < dt * 3) rain.beads.push(newBead());
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (var b = rain.beads.length - 1; b >= 0; b--) {
      var bd = rain.beads[b];
      bd.age += dt;
      bd.grow = Math.min(1, bd.grow + dt * 2.5);
      if (!bd.slide && bd.r > 4.6 && bd.age > bd.wait) bd.slide = true;
      if (bd.slide) {
        bd.vy = Math.min(bd.vy + dt * rnd(40, 120), 95);
        if (Math.random() < dt * 2) bd.vy *= 0.3;  // 걸렸다가 다시 흘러내림
        bd.y += bd.vy * dt;
        bd.x += Math.sin(bd.age * 3 + bd.wob) * dt * 6;
        var last = bd.trail[bd.trail.length - 1];
        if (!last || bd.y - last.y > 4) {
          bd.trail.push({ x: bd.x, y: bd.y - bd.r * 0.6, t: rain.time });
          if (bd.trail.length > 60) bd.trail.shift();
          if (Math.random() < 0.06 && rain.beads.length < rain.maxBeads + 10) {
            var left = newBead(rnd(0.9, 1.8));
            left.x = bd.x; left.y = bd.y - bd.r; left.wait = 999; left.life = rnd(4, 9);
            rain.beads.push(left);
          }
        }
      }
      var fade = bd.slide ? 1 : Math.max(0, Math.min(1, (bd.life - bd.age) / 1.5));
      if (bd.y - bd.r > rain.h || fade <= 0) { rain.beads.splice(b, 1); continue; }
      if (bd.trail.length > 1) {  // 흘러내린 물자국
        ctx.lineWidth = Math.max(0.7, bd.r * 0.42);
        ctx.lineCap = 'round';
        for (var q = 1; q < bd.trail.length; q++) {
          var age = rain.time - bd.trail[q].t;
          var al = Math.max(0, 0.12 - age * 0.025) * (col.dark ? 1 : 0.8);
          if (al <= 0) continue;
          ctx.strokeStyle = 'rgba(' + col.rgb + ',' + al.toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(bd.trail[q - 1].x, bd.trail[q - 1].y);
          ctx.lineTo(bd.trail[q].x, bd.trail[q].y);
          ctx.stroke();
        }
      }
      var rr = bd.r * (0.4 + 0.6 * bd.grow);
      ctx.globalAlpha = fade;
      ctx.drawImage(rain.bead, bd.x - rr, bd.y - rr * (bd.slide ? 1.15 : 1), rr * 2, rr * 2 * (bd.slide ? 1.15 : 1));
      ctx.globalAlpha = 1;
    }

    // 2) 빗줄기 (먼 것부터)
    for (var i = 0; i < rain.drops.length; i++) {
      var d = rain.drops[i], L = d.L, wl = wind * L.wind;
      d.y += d.v * dt;
      d.x += d.v * dt * wl;
      if (L.splash && d.y >= d.ground) {
        splash(d.x, d.ground, wl);
        rain.drops[i] = d = newDrop(L, false);
      } else if (d.y - d.len > rain.h || d.x - d.len > rain.w + 40) {
        rain.drops[i] = d = newDrop(L, false);
      }
      var phi = Math.atan(wl), cs = Math.cos(phi), sn = Math.sin(phi);
      var sp = rain.sprites[LAYERS.indexOf(L)];
      ctx.setTransform(dpr * cs, -dpr * sn, dpr * sn, dpr * cs, d.x * dpr, d.y * dpr);
      ctx.globalAlpha = d.o;
      ctx.drawImage(sp.img, -sp.w / 2, -d.len, sp.w, d.len);
    }
    ctx.globalAlpha = 1;

    // 3) 바닥에 튀는 물방울과 물결
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (var f = rain.fx.length - 1; f >= 0; f--) {
      var e = rain.fx[f];
      e.t += dt;
      var p = e.t / e.life;
      if (p >= 1) { rain.fx.splice(f, 1); continue; }
      if (e.k === 'ring') {
        var rad = e.r * (0.2 + p);
        ctx.strokeStyle = 'rgba(' + col.rgb + ',' + (0.45 * (1 - p) * col.k).toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, rad, rad * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        e.vy += 900 * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        ctx.fillStyle = 'rgba(' + col.rgb + ',' + (0.7 * (1 - p) * col.k).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    rain.raf = requestAnimationFrame(rainFrame);
  }
  function startRain() {
    if (!box || rain) return;
    var c = document.createElement('canvas');
    c.id = '__srr_rain';
    var col = rainColor();
    // 물안개: 화면 아래쪽이 옅게 뿌옇게 (CSS 배경이라 그릴 때 부담 없음)
    c.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;' +
      'background:linear-gradient(to bottom, rgba(' + col.rgb + ',0) 55%, rgba(' + col.rgb + ',' +
      (col.dark ? 0.10 : 0.07) + ') 100%)';
    box.insertBefore(c, box.firstChild);
    rain = { canvas: c, ctx: c.getContext('2d'), drops: [], beads: [], fx: [], raf: 0, last: 0, time: rnd(0, 100), color: col };
    sizeRain();
    window.addEventListener('resize', sizeRain);
    rain.raf = requestAnimationFrame(rainFrame);
  }
  function stopRain() {
    if (!rain) return;
    cancelAnimationFrame(rain.raf);
    rain.canvas.remove();
    window.removeEventListener('resize', sizeRain);
    rain = null;
  }
  function setRain(on) {
    rainOn = !!on;
    if (box) {
      if (rainOn) startRain(); else stopRain();
    }
    updateSound();
  }

  // ---- 빗소리: 음원 파일 없이 Web Audio로 직접 만듦 ----
  // 쏴아 하는 소리(높은 소리) + 낮게 울리는 소리 + 여기저기 떨어지는 빗방울 소리
  function noiseBuffer(ctx, seconds) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return buf;
  }
  function loopNoise(ctx, buf, offset) {
    var src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start(0, offset);
    return src;
  }
  function filter(ctx, type, freq, q) {
    var f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q) f.Q.value = q;
    return f;
  }
  function startSound() {
    if (snd) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var ctx;
    try { ctx = new AC(); } catch (e) { return; }
    var master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    var bed = noiseBuffer(ctx, 3);

    // 쏴아 하는 빗소리
    var hiss = ctx.createGain();
    hiss.gain.value = 0.22;
    loopNoise(ctx, bed, 0).connect(filter(ctx, 'highpass', 350)).connect(filter(ctx, 'lowpass', 5200)).connect(hiss);
    hiss.connect(master);
    // 소리 크기가 천천히 오르내리게 (자연스럽게)
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain).connect(hiss.gain);
    lfo.start();

    // 낮게 울리는 소리
    var rumble = ctx.createGain();
    rumble.gain.value = 0.2;
    loopNoise(ctx, bed, 1.37).connect(filter(ctx, 'lowpass', 420)).connect(rumble);
    rumble.connect(master);

    // 빗방울 소리: 짧은 소리를 무작위로, 좌우로 퍼지게
    var drop = noiseBuffer(ctx, 0.08);
    function plink(at) {
      var src = ctx.createBufferSource();
      src.buffer = drop;
      var bp = filter(ctx, 'bandpass', 1400 + Math.random() * 4200, 1.4 + Math.random() * 2);
      var g = ctx.createGain();
      var peak = 0.025 + Math.random() * 0.07;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.02 + Math.random() * 0.05);
      var node = src.connect(bp).connect(g);
      if (ctx.createStereoPanner) {
        var pan = ctx.createStereoPanner();
        pan.pan.value = Math.random() * 1.6 - 0.8;
        node = node.connect(pan);
      }
      node.connect(master);
      src.start(at);
      src.stop(at + 0.09);
    }
    var timer = setInterval(function () {
      if (ctx.state !== 'running') return;
      var now = ctx.currentTime;
      var n = Math.random() < 0.5 ? 1 : 2;  // 1초에 40개쯤
      for (var i = 0; i < n; i++) plink(now + 0.05 + Math.random() * 0.04);
    }, 40);

    master.gain.setTargetAtTime(view.volume, ctx.currentTime, 0.5);  // 천천히 커지며 시작
    if (ctx.state === 'suspended') ctx.resume();
    snd = { ctx: ctx, master: master, timer: timer };
  }
  function stopSound() {
    if (!snd) return;
    var s = snd;
    snd = null;
    clearInterval(s.timer);
    try { s.master.gain.setTargetAtTime(0, s.ctx.currentTime, 0.15); } catch (e) {}
    setTimeout(function () { try { s.ctx.close(); } catch (e) {} }, 700);  // 부드럽게 줄인 뒤 끔
  }
  // 스르륵 화면이 열려 있고, 비가 켜져 있고, 빗소리가 켜져 있을 때만 소리를 냄
  function updateSound() {
    if (box && rainOn && soundOn && !soundHold && !document.hidden) startSound();
    else stopSound();
  }
  function setSound(on) { soundOn = !!on; updateSound(); }
  function holdSound(on) { soundHold = !!on; updateSound(); }
  document.addEventListener('visibilitychange', function () { updateSound(); });

  function revealElements(upTo) {
    while (ei < els.length && els[ei].at <= upTo) {
      var e = els[ei++];
      if (e.style === null) e.el.removeAttribute('style');
      else e.el.style.cssText = e.style;
    }
  }

  function render() {
    var p = Math.floor(pos);
    while (ci < texts.length && p >= texts[ci].start + texts[ci].len) {
      revealElements(ci);
      texts[ci].node.nodeValue = texts[ci].full;
      ci++;
    }
    if (ci < texts.length) {
      revealElements(ci);
      var t = texts[ci];
      var cut = p - t.start;
      var code = t.full.charCodeAt(cut - 1);
      if (code >= 0xD800 && code <= 0xDBFF) cut++;
      t.node.nodeValue = t.full.slice(0, cut);
      if (/\S/.test(t.full)) markBlock(t.node);
      if (follow) scrollTo(t.node);
    } else {
      revealElements(Infinity);
      if (follow && texts.length) scrollTo(texts[texts.length - 1].node);
    }
    if (box) {
      if (pos >= total) box.setAttribute('data-srr-done', ''); else box.removeAttribute('data-srr-done');
    }
    updateCaret();
  }

  function scrollTo(node) {
    if (!box || !node.nodeValue) return;
    var r = document.createRange();
    r.selectNodeContents(node);
    var rects = r.getClientRects();
    if (!rects.length) return;
    var bottom = rects[rects.length - 1].bottom;
    var limit = box.clientHeight * 0.6;
    if (bottom > limit) box.scrollTop += bottom - limit;
  }

  function frame(t) {
    raf = 0;
    if (!playing || !box) return;
    var dt = lastT ? Math.min(t - lastT, 200) : 0;
    lastT = t;
    pos = Math.min(total, pos + speed * dt / 1000);
    render();
    if (pos >= total) {
      playing = false;
      report(true);
      save(true);
      return;
    }
    report(false);
    raf = requestAnimationFrame(frame);
  }

  function report(force) {
    var now = Date.now();
    if (!force && now - lastReport < 200) return;
    lastReport = now;
    var state = !box ? 'closed' : (pos >= total ? 'done' : (playing ? 'playing' : 'paused'));
    var pct = total ? Math.round(pos * 100 / total) : 100;
    try { bridge().onState(state, pct); } catch (e) {}
    try { if (bridge().onTime) bridge().onTime(Math.ceil(Math.max(0, total - pos) / Math.max(1, speed))); } catch (e) {}
    save(false);
  }

  function play() {
    if (!box) return;
    if (pos >= total) { build(); }
    playing = true;
    follow = true;
    lastT = 0;
    if (!raf) raf = requestAnimationFrame(frame);
    report(true);
  }
  function stopLoop() {
    playing = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function pause() {
    stopLoop();
    report(true);
    save(true);
  }
  function toggle() { if (playing) pause(); else play(); }
  function restart() {
    if (!lastSel.length) return;
    build();
    save(true);
    play();
  }
  function finish() {
    if (!box) return;
    stopLoop();
    pos = total;
    render();
    report(true);
    save(true);
  }
  function setSpeed(v) {
    speed = Math.max(1, +v || 25);
    if (box) report(true);
  }
  function close(silent) {
    stopLoop();
    save(true);
    stopRain();
    stopSound();
    if (box) box.remove();
    box = null;
    if (!silent) report(true);
  }

  window.__srr = {
    find: find, pickByTap: pickByTap, cancelPick: cancelPick, start: start,
    play: play, pause: pause, toggle: toggle, restart: restart, finish: finish,
    setSpeed: setSpeed, setRain: setRain, setSound: setSound, holdSound: holdSound,
    setView: setView, getView: function () { return JSON.stringify(view); },
    soundPlaying: function () { return !!snd; },
    close: function () { close(false); }
  };
})();
