// 고정 모드: 배틀에서 공개된 AI(또는 다이렉트에서 쓰던 AI)로 고정해서 계속 대화.
// 앱(MainActivity)이 페이지에 넣고 window.__lock 으로 조작합니다.
// arena.ai 구조: 다이렉트 모드의 모델 선택 버튼은 main button[aria-haspopup="dialog"],
// 모델 목록은 [role="dialog"] 안의 [role="option"](data-value = 모델 이름),
// 대화 목록은 최신 글이 DOM 맨 앞(flex-col-reverse), 내 질문 줄에는 justify-end.
(function () {
  if (window.__lock) return;

  var BODY = '.prose, [class*="markdown"], [class*="Markdown"], [data-message-author-role="assistant"]';
  var st = { model: null, tried: {}, busy: false, waitPick: false, waitPickFrom: '' };

  function q(s) { return document.querySelector(s); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function norm(s) { return (s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function textOf(e) { return (e.innerText || e.textContent || '').trim(); }
  function visible(e) { var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function notify(type, data) {
    try { window.ArenaLock && window.ArenaLock.onEvent(type, data == null ? '' : String(data)); } catch (e) {}
  }
  async function waitFor(fn, ms) {
    var t = Date.now();
    while (Date.now() - t < ms) {
      var v = fn();
      if (v) return v;
      await sleep(200);
    }
    return null;
  }

  function modelButton() { return q('main button[aria-haspopup="dialog"]'); }
  function currentModel() {
    var b = modelButton();
    return b ? (b.innerText || '').split('\n').map(function (s) { return s.trim(); })
      .filter(Boolean)[0] || '' : '';
  }
  function modeLabel() {
    var c = q('main button[role="combobox"]');
    return c ? textOf(c) : '';
  }

  function isUserMessage(e) {
    for (var n = e; n && n !== document.body; n = n.parentElement) {
      if (n.matches && n.matches('[data-message-author-role="user"], [data-role="user"]')) return true;
      if (n.matches && n.matches('[data-message-author-role="assistant"], [data-role="assistant"]')) return false;
      var p = n.parentElement;
      if (p && (p.tagName === 'OL' || p.tagName === 'UL')) return n.classList.contains('justify-end');
    }
    return false;
  }

  // 대화 글 상자들을 화면 순서대로, 같은 줄(대결 답변 A/B)끼리 묶어서 돌려줌
  function rows() {
    var all = [].slice.call(document.querySelectorAll(BODY)).filter(function (e) {
      return !e.closest('#__srr') && visible(e) && textOf(e).length > 0;
    });
    all = all.filter(function (e) {
      return !all.some(function (o) { return o !== e && o.contains(e); });
    });
    all.sort(function (a, b) { return a.getBoundingClientRect().top - b.getBoundingClientRect().top; });
    var out = [];
    all.forEach(function (e) {
      var top = e.getBoundingClientRect().top;
      var user = isUserMessage(e);
      var last = out[out.length - 1];
      if (last && !user && !last.user && Math.abs(last.top - top) < 120) last.items.push(e);
      else out.push({ top: top, user: user, items: [e] });
    });
    out.forEach(function (r) {
      r.items.sort(function (a, b) { return a.getBoundingClientRect().left - b.getBoundingClientRect().left; });
    });
    return out;
  }

  // 답변 위쪽 머리말의 첫 줄 = 모델 이름 (배틀에서는 투표 전엔 "Assistant A" 같은 이름)
  function headerName(body) {
    var bt = textOf(body).slice(0, 30);
    for (var a = body.parentElement, i = 0; a && a !== document.body && i < 8; a = a.parentElement, i++) {
      if (a.querySelectorAll(BODY).length > 1) break;
      var full = a.innerText || '';
      var k = bt ? full.indexOf(bt) : -1;
      if (k > 0) {
        var lines = full.slice(0, k).split('\n').map(function (s) { return s.trim(); })
          .filter(function (l) {
            return l && l.length <= 80 &&
              !/^(response provided by|generating|thinking|thought|copy|복사|생각)/i.test(l);
          });
        if (lines.length) return lines[0];
      }
    }
    return '';
  }
  function isRevealed(name) {
    return !!name && !/^(assistant|model|모델|어시스턴트|응답|answer)\s*[ab12]?$|^[ab]$/i.test(name.trim());
  }

  // 지금 화면이 배틀(비교) 화면인지, 다이렉트 화면인지
  function pageKind() {
    var p = location.pathname, label = modeLabel();
    if (/^\/text\/(battle|side-by-side|arena)/.test(p)) return 'battle';
    if (/^\/text\/direct/.test(p)) return 'direct';
    if (/direct/i.test(label)) return 'direct';
    if (/battle|side|배틀|비교/i.test(label)) return 'battle';
    if (p === '/' || /^\/c\//.test(p) || /^\/text\//.test(p)) return modelButton() ? 'direct' : 'battle';
    return 'other';
  }

  function detect() {
    var r = rows().filter(function (x) { return !x.user; });
    var latest = r.length ? r[r.length - 1].items : [];
    return JSON.stringify({
      kind: pageKind(),
      current: currentModel(),
      answers: latest.map(function (e) {
        var n = headerName(e);
        return { name: n, revealed: isRevealed(n), preview: textOf(e).replace(/\s+/g, ' ').slice(0, 40) };
      })
    });
  }

  // 지금까지의 대화를 글로 정리 (답변은 고른 쪽(index)만)
  function transcript(index, maxLen) {
    var lines = [];
    rows().forEach(function (r) {
      if (r.user) lines.push('나: ' + textOf(r.items[0]));
      else lines.push('AI: ' + textOf(r.items[index] || r.items[0]));
    });
    var body = lines.join('\n\n');
    maxLen = maxLen || 8000;
    if (body.length > maxLen) body = '…\n' + body.slice(body.length - maxLen);
    if (!body) return '';
    return '아래는 지금까지 나눈 대화야. 이 흐름을 이어서 대답해 줘.\n\n' + body +
      '\n\n---\n이어서 질문: ';
  }

  function setValue(input, v) {
    var setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set;
    setter.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function insertText(text) {
    var ta = q('textarea[name="message"]') || q('form textarea');
    if (!ta) return false;
    ta.focus();
    setValue(ta, text);
    ta.setSelectionRange(text.length, text.length);
    ta.scrollTop = ta.scrollHeight;
    return true;
  }

  function findOption(name) {
    var n = norm(name);
    var opts = [].slice.call(document.querySelectorAll('[role="dialog"] [role="option"]'));
    function label(o) { return norm((o.innerText || '').split('\n')[0]); }
    return opts.find(function (o) { return norm(o.getAttribute('data-value')) === n || label(o) === n; }) ||
      opts.find(function (o) {
        var l = label(o), v = norm(o.getAttribute('data-value'));
        return (l && (l.indexOf(n) >= 0 || (l.length > 3 && n.indexOf(l) >= 0))) || (v && v.indexOf(n) >= 0);
      });
  }

  // 다이렉트 모드의 모델 목록에서 name 모델을 고름
  async function selectModel(name) {
    var b = await waitFor(modelButton, 15000);
    if (!b) return 'nobutton';
    if (norm(currentModel()) === norm(name)) return 'ok';
    b.click();
    var d = await waitFor(function () { return q('[role="dialog"]'); }, 4000);
    if (!d) return 'nodialog';
    var o = await waitFor(function () { return findOption(name); }, 800);
    if (!o) {
      var s = d.querySelector('input');
      if (s) {
        s.focus();
        setValue(s, name);
        o = await waitFor(function () { return findOption(name); }, 2500);
      }
    }
    if (!o) return 'notfound'; // 목록은 열어 둔 채로 사용자가 고르게 함
    o.click();
    await sleep(500);
    return 'ok';
  }

  // 배틀에서 넘어온 뒤 다이렉트 화면에서 모델을 고르고 이전 대화를 입력창에 넣음
  async function apply(p) {
    var result = 'manual';
    if (p.model) result = await selectModel(p.model);
    if (result !== 'ok') {
      if (!q('[role="dialog"]')) {
        var b = await waitFor(modelButton, 15000);
        if (b) b.click();
      }
      st.waitPick = true;
      st.waitPickFrom = currentModel();
    }
    if (p.transcript) {
      await waitFor(function () { return q('textarea[name="message"]') || q('form textarea'); }, 15000);
      insertText(p.transcript);
    }
    notify('applied', result);
    return result;
  }

  // 고정 중이면, 새 대화를 열어도 고정한 모델로 다시 맞춤
  function tick() {
    if (st.waitPick) {
      if (!q('[role="dialog"]')) {
        var c = currentModel();
        st.waitPick = false;
        if (c && c !== st.waitPickFrom) notify('picked', c);
        else if (c) notify('pickedSame', c);
      }
      return;
    }
    if (location.pathname !== st.lastPath) { st.lastPath = location.pathname; st.tried = {}; }
    if (!st.model || st.busy || pageKind() !== 'direct') return;
    var cur = currentModel();
    var key = location.pathname;
    if (cur && norm(cur) !== norm(st.model) && !st.tried[key]) {
      st.tried[key] = true;
      st.busy = true;
      selectModel(st.model).then(function (r) {
        st.busy = false;
        if (r === 'notfound' && q('[role="dialog"]')) {
          var esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
          document.activeElement && document.activeElement.dispatchEvent(esc);
        }
        notify('reselect', r);
      });
    }
  }
  setInterval(tick, 1500);

  window.__lock = {
    detect: detect,
    transcript: transcript,
    apply: apply,
    current: currentModel,
    setModel: function (m) { st.model = m || null; st.tried = {}; }
  };
})();
