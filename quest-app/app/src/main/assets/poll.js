// 0.15초마다 실행됩니다. 마지막 식의 값(JSON 문자열)이 앱으로 돌아갑니다.
// 실행 전에 앱이 window.__vrCfg = {lang:'ko', translate:true} 를 넣어 줍니다.
//
// 자막을 찾는 순서
//   1) 플레이어가 화면에 그린 자막 글자
//   2) 플레이어가 받아 온 자막 파일 (hook.js가 가로챈 것)
//   3) 이 스크립트가 직접 받은 자막 파일 (영상 정보의 자막 주소 + 인증값)
//   4) 유튜브 '스크립트 표시'(대본) 데이터
// 2~4는 영상 재생 시간에 맞춰 지금 나올 줄을 고릅니다.
(function () {
  var cfg = window.__vrCfg || { lang: 'ko', translate: true };
  var S = window.__vr;
  if (!S) {
    S = window.__vr = { vid: null, started: Date.now(), own: {}, tr: {}, cc: {}, tries: 0, q: false };
  }
  if (!window.__vrHook) window.__vrHook = {};

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

  function cueAt(list, now) {
    var hit = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i][0] <= now && now < list[i][1]) hit.push(list[i][2]);
    }
    return hit.slice(-2).join('\n');
  }

  function findAll(obj, key, out, depth) {
    if (!obj || typeof obj !== 'object' || depth > 60) return out;
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) findAll(obj[i], key, out, depth + 1);
      return out;
    }
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      if (k === key) out.push(obj[k]);
      else findAll(obj[k], key, out, depth + 1);
    }
    return out;
  }

  function cfgGet(name) {
    var y = window.ytcfg;
    try { if (y && typeof y.get === 'function') return y.get(name); } catch (e) { /* 무시 */ }
    return y && y.data_ ? y.data_[name] : undefined;
  }

  function playerResponse(p, vid) {
    var pr = null;
    try { pr = p.getPlayerResponse && p.getPlayerResponse(); } catch (e) { /* 무시 */ }
    var ok = pr && pr.videoDetails && pr.videoDetails.videoId === vid;
    if (!ok) {
      var init = window.ytInitialPlayerResponse;
      if (init && init.videoDetails && init.videoDetails.videoId === vid) pr = init;
      else if (!pr || !pr.videoDetails) pr = null;
    }
    return pr;
  }

  function captionTracks(pr) {
    var tl = pr && pr.captions && pr.captions.playerCaptionsTracklistRenderer;
    return (tl && tl.captionTracks) || [];
  }

  // 원하는 언어 자막 고르기: 한국어(직접) → 한국어(자동 생성) → 다른 언어를 한국어로 번역 → 아무거나
  function pick(tracks, lang, translate, kindOf) {
    var i;
    for (i = 0; i < tracks.length; i++) if (tracks[i].languageCode === lang && kindOf(tracks[i]) !== 'asr') return { t: tracks[i] };
    for (i = 0; i < tracks.length; i++) if (tracks[i].languageCode === lang) return { t: tracks[i] };
    var base = null;
    for (i = 0; i < tracks.length; i++) if (kindOf(tracks[i]) !== 'asr') { base = tracks[i]; break; }
    base = base || tracks[0];
    if (!base) return null;
    return translate ? { t: base, tlang: lang } : { t: base };
  }

  // 플레이어의 자막 켜기 (화면에 자막을 그리게 하고, 플레이어가 자막 파일을 받게 함)
  function ensureCaptionsOn(p, vid) {
    if (S.cc[vid]) return;
    try { p.loadModule('captions'); } catch (e) { /* 무시 */ }
    var list = [];
    try { list = p.getOption('captions', 'tracklist', { includeAsr: true }) || []; } catch (e) { /* 무시 */ }
    if (list.length) {
      var c = pick(list, cfg.lang, cfg.translate, function (t) { return t.kind; });
      if (c) {
        var track = c.tlang
          ? Object.assign({}, c.t, { translationLanguage: { languageCode: c.tlang, languageName: c.tlang } })
          : c.t;
        try { p.setOption('captions', 'track', track); } catch (e) { /* 무시 */ }
      }
      S.cc[vid] = true;
      return;
    }
    S.tries++;
    var btn = document.querySelector('.ytp-subtitles-button');
    if (btn && btn.getAttribute('aria-pressed') === 'false' && S.tries % 10 === 1) {
      try { btn.click(); } catch (e) { /* 무시 */ }
    }
  }

  // 3) 자막 파일 직접 받기
  function fetchOwn(p, vid) {
    var st = S.own[vid];
    if (st && (st.state === 'pending' || typeof st.state === 'number')) return;
    if (st && st.state === 'empty' && (!window.__vrPot || st.usedPot)) return;
    if (st && (st.state === 'none' || st.state === 'error') && st.at && Date.now() - st.at < 15000) return;
    var tracks = captionTracks(playerResponse(p, vid));
    if (!tracks.length) {
      S.own[vid] = { state: 'none', at: Date.now() };
      return;
    }
    var c = pick(tracks, cfg.lang, cfg.translate, function (t) { return t.kind; });
    var url = c.t.baseUrl;
    if (!/^https?:/.test(url)) url = location.origin + url;
    var u = new URL(url);
    u.searchParams.set('fmt', 'json3');
    if (c.tlang && c.t.languageCode !== c.tlang) u.searchParams.set('tlang', c.tlang);
    var pot = window.__vrPot;
    if (pot) { u.searchParams.set('pot', pot); u.searchParams.set('potc', '1'); u.searchParams.set('c', 'WEB'); }
    S.own[vid] = { state: 'pending', usedPot: !!pot };
    fetch(u.toString(), { credentials: 'include', __vrOwn: true })
      .then(function (r) { return r.text(); })
      .then(function (body) {
        var cues = body && body.trim() ? parseJson3(body) : [];
        S.own[vid] = cues.length ? { state: cues.length, cues: cues } : { state: 'empty', usedPot: !!pot };
      })
      .catch(function () { S.own[vid] = { state: 'error', at: Date.now() }; });
  }

  // 4) 스크립트(대본) 받기
  function transcriptParams(vid) {
    var d = window.ytInitialData;
    try {
      var cur = d && d.currentVideoEndpoint && d.currentVideoEndpoint.watchEndpoint;
      if (cur && cur.videoId === vid) {
        var eps = findAll(d, 'getTranscriptEndpoint', [], 0);
        if (eps.length && eps[0].params) return Promise.resolve(eps[0].params);
      }
    } catch (e) { /* 무시 */ }
    return fetch('/watch?v=' + encodeURIComponent(vid), { credentials: 'include' })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var m = html.match(/"getTranscriptEndpoint":\{"params":"([^"]+)"/);
        return m ? m[1] : null;
      });
  }

  function fetchTranscript(vid) {
    var st = S.tr[vid];
    if (st && (st.state !== 'error' || Date.now() - st.at < 20000)) return;
    S.tr[vid] = { state: 'pending' };
    transcriptParams(vid).then(function (params) {
      if (!params) { S.tr[vid] = { state: 'none' }; return null; }
      var key = cfgGet('INNERTUBE_API_KEY');
      var headers = { 'Content-Type': 'application/json' };
      var cn = cfgGet('INNERTUBE_CONTEXT_CLIENT_NAME');
      var cv = cfgGet('INNERTUBE_CONTEXT_CLIENT_VERSION');
      if (cn) headers['X-Youtube-Client-Name'] = String(cn);
      if (cv) headers['X-Youtube-Client-Version'] = String(cv);
      return fetch('/youtubei/v1/get_transcript?prettyPrint=false' + (key ? '&key=' + key : ''), {
        method: 'POST',
        credentials: 'include',
        headers: headers,
        body: JSON.stringify({ context: cfgGet('INNERTUBE_CONTEXT') || {}, params: params })
      }).then(function (r) { return r.json(); }).then(function (j) {
        var segs = findAll(j, 'transcriptSegmentRenderer', [], 0);
        var cues = [];
        segs.forEach(function (s) {
          var runs = (s.snippet && s.snippet.runs) || [];
          var t = runs.map(function (x) { return x.text || ''; }).join('').trim();
          var a = parseInt(s.startMs, 10);
          var b = parseInt(s.endMs, 10);
          if (t && !isNaN(a) && !isNaN(b)) cues.push([a / 1000, b / 1000, t]);
        });
        S.tr[vid] = cues.length ? { state: cues.length, cues: cues } : { state: 'empty' };
      });
    }).catch(function () { S.tr[vid] = { state: 'error', at: Date.now() }; });
  }

  // 1) 화면에 뜬 자막 읽기
  function readDom() {
    var out = [];
    var lines = document.querySelectorAll('#movie_player .caption-visual-line');
    for (var i = 0; i < lines.length; i++) {
      var s = (lines[i].textContent || '').trim();
      if (s) out.push(s);
    }
    if (!out.length) {
      var segs = document.querySelectorAll('#movie_player .ytp-caption-segment');
      var parts = [];
      for (var k = 0; k < segs.length; k++) {
        var s2 = (segs[k].textContent || '').trim();
        if (s2) parts.push(s2);
      }
      if (parts.length) out.push(parts.join(' '));
    }
    return out.join('\n');
  }

  function stateText(st) {
    if (!st) return '-';
    return String(st.state);
  }

  var r = {};
  try {
    var p = document.getElementById('movie_player');
    var v = document.querySelector('#movie_player video') || document.querySelector('video');
    if (!p || !v || typeof p.getVideoData !== 'function') {
      r.loading = true;
      return JSON.stringify(r);
    }
    r.playing = !v.paused && !v.ended && v.readyState > 2;
    r.ad = p.classList.contains('ad-showing');

    // 처음 20초 동안은 멈춰 있으면 재생, 소리 켜기, 화질 최저(데이터·배터리 절약)
    if (v.paused && !v.ended && Date.now() - S.started < 20000) { try { p.playVideo(); } catch (e) { /* 무시 */ } }
    try { if (p.isMuted && p.isMuted()) p.unMute(); } catch (e) { /* 무시 */ }
    if (!S.q) { S.q = true; try { p.setPlaybackQualityRange('tiny', 'tiny'); } catch (e) { /* 무시 */ } }

    var vid = '';
    try { vid = p.getVideoData().video_id || ''; } catch (e) { /* 무시 */ }
    if (vid !== S.vid) { S.vid = vid; S.tries = 0; }
    r.vid = vid;

    if (vid && !r.ad) {
      ensureCaptionsOn(p, vid);
      fetchOwn(p, vid);
      fetchTranscript(vid);
    }

    var text = readDom();
    var src = text ? 'dom' : '';
    if (!text && !r.ad && vid) {
      var sources = [
        ['hook', window.__vrHook[vid]],
        ['own', S.own[vid] && S.own[vid].cues],
        ['tr', S.tr[vid] && S.tr[vid].cues]
      ];
      for (var i = 0; i < sources.length; i++) {
        var list = sources[i][1];
        if (list && list.length) {
          text = cueAt(list, v.currentTime);
          src = sources[i][0];
          break;
        }
      }
    }
    r.t = text;
    r.src = src;
    r.has = !!src;

    var tracks = captionTracks(playerResponse(p, vid));
    var ownSt = S.own[vid];
    var trSt = S.tr[vid];
    var hookN = (window.__vrHook[vid] || []).length;
    r.nocc = !tracks.length && ownSt && ownSt.state === 'none' && trSt && (trSt.state === 'none' || trSt.state === 'empty') && !hookN && S.tries > 60;
    r.d = '트랙 ' + tracks.length +
      ' · 화면 ' + (document.querySelector('#movie_player .ytp-caption-segment') ? '있음' : '없음') +
      ' · 플레이어 ' + hookN +
      ' · 직접 ' + stateText(ownSt) +
      ' · 대본 ' + stateText(trSt) +
      ' · ' + document.visibilityState;
  } catch (e) {
    r.err = String(e);
  }
  return JSON.stringify(r);
})();
