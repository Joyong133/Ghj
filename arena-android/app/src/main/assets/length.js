// 답변 분량 지시: 보내기를 누르면 입력창 글 끝에 분량 지시를 붙인 뒤 보냄.
// 앱(MainActivity)이 페이지에 넣고 window.__len.set({ text }) 로 켜고 끕니다.
(function () {
  if (window.__len) return;

  var cfg = null;    // { text: '\n\n[분량: …]' } 또는 null(끔)
  var resending = false;

  function composer() {
    return document.querySelector('textarea[name="message"]') || document.querySelector('form textarea');
  }
  function setValue(input, v) {
    var setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set;
    setter.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // 입력창 끝에 분량 지시를 붙임. 붙였으면 true (이미 붙어 있거나 빈 글이면 false)
  function addInstruction() {
    var ta = composer();
    if (!ta || !cfg) return false;
    var v = ta.value || '';
    if (!v.trim() || v.indexOf(cfg.text.trim()) >= 0) return false;
    setValue(ta, v.replace(/\s+$/, '') + cfg.text);
    return true;
  }

  function sendButtonOf(target) {
    var b = target && target.closest ? target.closest('button') : null;
    var ta = composer();
    if (!b || !ta) return null;
    if (b.type === 'submit' && ta.form && b.form === ta.form) return b;
    if (/send|보내기|전송/i.test(b.getAttribute('aria-label') || '')) return b;
    return null;
  }
  function submitButton() {
    var ta = composer();
    var f = ta && ta.form;
    return f ? f.querySelector('button[type="submit"]') : null;
  }

  // 글을 바꾼 뒤 화면(React)이 새 글을 받아들일 시간을 조금 주고 다시 보냄
  function resend(button) {
    setTimeout(function () {
      var b = button && button.isConnected ? button : submitButton();
      if (!b) return;
      resending = true;
      try { b.click(); } finally { resending = false; }
    }, 80);
  }

  document.addEventListener('click', function (e) {
    if (resending || !cfg) return;
    var b = sendButtonOf(e.target);
    if (!b || b.disabled) return;
    if (addInstruction()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      resend(b);
    }
  }, true);

  document.addEventListener('keydown', function (e) {
    if (resending || !cfg) return;
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
    if (e.target !== composer()) return;
    if (addInstruction()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      resend(submitButton());
    }
  }, true);

  document.addEventListener('submit', function (e) {
    if (resending || !cfg) return;
    var ta = composer();
    if (!ta || e.target !== ta.form) return;
    if (addInstruction()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      resend(submitButton());
    }
  }, true);

  window.__len = {
    set: function (c) { cfg = c && c.text ? c : null; }
  };
})();
