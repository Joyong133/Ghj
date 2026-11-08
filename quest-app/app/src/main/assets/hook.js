// 페이지가 열리자마자 실행됩니다.
// 유튜브 플레이어가 받아 오는 자막 파일(timedtext)을 옆에서 함께 보관하고,
// 자막 요청에 붙는 인증값(pot)도 기억해 두었다가 직접 받을 때 씁니다.
(function () {
  if (window.__vrHooked) return;
  window.__vrHooked = true;
  window.__vrHook = {};

  function parseJson3(body) {
    var j = JSON.parse(body);
    var out = [];
    if (!j || !j.events) return out;
    j.events.forEach(function (e) {
      if (!e.segs || e.aAppend) return;
      var t = e.segs.map(function (s) { return s.utf8 || ''; }).join('').trim();
      if (t) out.push([e.tStartMs / 1000, (e.tStartMs + (e.dDurationMs || 0)) / 1000, t]);
    });
    return out;
  }

  function take(url, body) {
    try {
      var u = new URL(url, location.href);
      if (u.pathname.indexOf('/api/timedtext') < 0) return;
      var pot = u.searchParams.get('pot');
      if (pot) window.__vrPot = pot;
      var cues = parseJson3(body);
      var v = u.searchParams.get('v') || '';
      if (cues.length && v) window.__vrHook[v] = cues;
    } catch (e) { /* 무시 */ }
  }

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var p = origFetch.apply(this, arguments);
      if (/\/api\/timedtext/.test(url) && !(arguments[1] && arguments[1].__vrOwn)) {
        p.then(function (r) { r.clone().text().then(function (b) { take(url, b); }); }).catch(function () {});
      }
      return p;
    };
  }

  var open = XMLHttpRequest.prototype.open;
  var send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__vrUrl = String(u);
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var x = this;
    if (x.__vrUrl && /\/api\/timedtext/.test(x.__vrUrl)) {
      x.addEventListener('load', function () {
        try {
          take(x.__vrUrl, (x.responseType === '' || x.responseType === 'text') ? x.responseText : String(x.response));
        } catch (e) { /* 무시 */ }
      });
    }
    return send.apply(this, arguments);
  };
})();
