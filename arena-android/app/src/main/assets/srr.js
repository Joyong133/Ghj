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
  var key = '', lastSave = 0;  // 어디까지 봤는지 저장할 때 쓰는 답변 이름표

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
        label.style.cssText = 'font-weight:700;opacity:.6;max-width:820px;margin:' + (i ? '28px' : '0') + ' auto 8px';
        box.appendChild(label);
      }
      var clone = orig.cloneNode(true);
      [].slice.call(clone.querySelectorAll(REMOVE)).forEach(function (n) { n.remove(); });
      clone.removeAttribute('id');
      clone.style.maxWidth = 'min(100%, 820px)';
      clone.style.margin = '0 auto';
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
    document.body.appendChild(box);
    report(true);
  }

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
      if (follow) scrollTo(t.node);
    } else {
      revealElements(Infinity);
      if (follow && texts.length) scrollTo(texts[texts.length - 1].node);
    }
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
  function setSpeed(v) { speed = Math.max(1, +v || 25); }
  function close(silent) {
    stopLoop();
    save(true);
    if (box) box.remove();
    box = null;
    if (!silent) report(true);
  }

  window.__srr = {
    find: find, pickByTap: pickByTap, cancelPick: cancelPick, start: start,
    play: play, pause: pause, toggle: toggle, restart: restart, finish: finish,
    setSpeed: setSpeed, close: function () { close(false); }
  };
})();
