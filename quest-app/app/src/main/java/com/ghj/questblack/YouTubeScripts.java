package com.ghj.questblack;

import android.net.Uri;

import org.json.JSONObject;

/**
 * 유튜브 페이지 안에서 실행하는 자바스크립트들.
 * 앱의 WebView는 유튜브 페이지 자신이므로, 플레이어가 화면에 띄우는 자막 글자를 직접 읽을 수 있습니다.
 */
final class YouTubeScripts {
    private YouTubeScripts() {
    }

    /** PC 화면 유튜브를 받기 위한 브라우저 이름 (자막 표시 구조가 가장 안정적입니다). */
    static final String DESKTOP_UA =
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
                    + "Chrome/131.0.0.0 Safari/537.36";

    /**
     * 페이지가 열리자마자 넣는 스크립트: 플레이어가 받아 오는 자막 파일(timedtext)을 옆에서 함께 보관합니다.
     * 화면 자막을 못 읽을 때 이 목록과 영상 시간으로 자막을 찾습니다.
     */
    static final String HOOK = "(function(){"
            + "if(window.__vrHooked)return;window.__vrHooked=true;"
            + "function take(url,body){try{"
            + " if(!/\\/api\\/timedtext/.test(url))return;"
            + " var j=JSON.parse(body);if(!j||!j.events)return;var out=[];"
            + " j.events.forEach(function(e){if(!e.segs||e.aAppend)return;"
            + "  var t=e.segs.map(function(s){return s.utf8||'';}).join('').trim();if(!t)return;"
            + "  out.push([e.tStartMs/1000,(e.tStartMs+(e.dDurationMs||0))/1000,t]);});"
            + " if(!out.length)return;var v='';try{v=new URL(url,location.href).searchParams.get('v')||'';}catch(e){}"
            + " window.__vrCues=out;window.__vrCuesFor=v;"
            + "}catch(e){}}"
            + "var of=window.fetch;if(of){window.fetch=function(input){"
            + " var url=typeof input==='string'?input:(input&&input.url)||'';var p=of.apply(this,arguments);"
            + " if(/\\/api\\/timedtext/.test(url)){p.then(function(r){r.clone().text().then(function(b){take(url,b);});}).catch(function(){});}"
            + " return p;};}"
            + "var oo=XMLHttpRequest.prototype.open,os=XMLHttpRequest.prototype.send;"
            + "XMLHttpRequest.prototype.open=function(m,u){this.__vrUrl=String(u);return oo.apply(this,arguments);};"
            + "XMLHttpRequest.prototype.send=function(){var x=this;"
            + " if(x.__vrUrl&&/\\/api\\/timedtext/.test(x.__vrUrl)){x.addEventListener('load',function(){"
            + "  try{take(x.__vrUrl,(x.responseType===''||x.responseType==='text')?x.responseText:String(x.response));}catch(e){}});}"
            + " return os.apply(this,arguments);};"
            + "})();";

    /**
     * 0.15초마다 실행: 재생을 시작하고, 자막을 켜고(원하는 언어 고르기), 지금 화면에 뜬 자막 글자를 돌려줍니다.
     * 결과는 JSON 문자열: {t: 자막, playing, ad, nocc, loading}
     */
    static String poll(String lang, boolean translate) {
        return "(function(LANG,TRANSLATE){var r={};try{"
                + "var p=document.getElementById('movie_player');"
                + "var v=document.querySelector('#movie_player video')||document.querySelector('video');"
                + "if(!p||!v||typeof p.getVideoData!=='function'){r.loading=true;return JSON.stringify(r);}"
                + "r.playing=!v.paused&&!v.ended&&v.readyState>2;"
                + "r.ad=p.classList.contains('ad-showing');"
                // 처음 한 번: 재생 시작, 소리 켜기, 화질 최저(데이터·배터리 절약)
                + "if(!window.__vrStarted){window.__vrStarted=Date.now();}"
                + "if(v.paused&&!v.ended&&Date.now()-window.__vrStarted<20000){try{p.playVideo();}catch(e){}}"
                + "try{if(p.isMuted&&p.isMuted())p.unMute();}catch(e){}"
                + "if(!window.__vrQ){window.__vrQ=1;try{p.setPlaybackQualityRange('tiny','tiny');}catch(e){}}"
                // 영상마다 자막 켜기
                + "var vid='';try{vid=p.getVideoData().video_id||'';}catch(e){}"
                + "if(vid&&!r.ad&&window.__vrCcVid!==vid){"
                + " try{p.loadModule('captions');}catch(e){}"
                + " var list=[];try{list=p.getOption('captions','tracklist',{includeAsr:true})||[];}catch(e){}"
                + " if(list.length){var pick=null,i;"
                + "  for(i=0;i<list.length;i++)if(list[i].languageCode===LANG&&list[i].kind!=='asr'){pick=list[i];break;}"
                + "  if(!pick)for(i=0;i<list.length;i++)if(list[i].languageCode===LANG){pick=list[i];break;}"
                + "  if(!pick&&TRANSLATE){var base=null;for(i=0;i<list.length;i++)if(list[i].kind!=='asr'){base=list[i];break;}"
                + "   base=base||list[0];pick=Object.assign({},base,{translationLanguage:{languageCode:LANG,languageName:LANG}});}"
                + "  if(!pick){for(i=0;i<list.length;i++)if(list[i].kind!=='asr'){pick=list[i];break;}pick=pick||list[0];}"
                + "  try{p.setOption('captions','track',pick);}catch(e){}"
                + "  window.__vrCcVid=vid;window.__vrCcTries=0;"
                + " }else{"
                + "  window.__vrCcTries=(window.__vrCcTries||0)+1;"
                + "  var btn=document.querySelector('.ytp-subtitles-button');"
                + "  if(btn&&btn.getAttribute('aria-pressed')==='false'&&window.__vrCcTries%10===1){try{btn.click();}catch(e){}}"
                + "  if(window.__vrCcTries>70&&r.playing)r.nocc=true;"
                + " }"
                + "}"
                // 화면에 뜬 자막 읽기
                + "var out=[],i2,lines=document.querySelectorAll('#movie_player .caption-visual-line');"
                + "for(i2=0;i2<lines.length;i2++){var s=(lines[i2].textContent||'').trim();if(s)out.push(s);}"
                + "if(!out.length){var segs=document.querySelectorAll('#movie_player .ytp-caption-segment'),parts=[];"
                + " for(i2=0;i2<segs.length;i2++){var s2=(segs[i2].textContent||'').trim();if(s2)parts.push(s2);}"
                + " if(parts.length)out.push(parts.join(' '));}"
                + "r.t=out.join('\\n');"
                // 화면 자막이 없으면, 받아 둔 자막 목록과 영상 시간으로 찾기
                + "if(!r.t&&!r.ad&&window.__vrCues&&window.__vrCuesFor===vid){var now=v.currentTime,hit=[];"
                + " window.__vrCues.forEach(function(c){if(c[0]<=now&&now<c[1])hit.push(c[2]);});"
                + " r.t=hit.slice(-2).join('\\n');}"
                + "}catch(e){r.err=String(e);}return JSON.stringify(r);})("
                + JSONObject.quote(lang) + "," + translate + ")";
    }

    /** 유튜브 주소(또는 공유된 글)에서 PC 유튜브 재생 주소를 만듭니다. 못 알아보면 null. */
    static String toWatchUrl(String text) {
        if (text == null) return null;
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("(https?://)?([\\w-]+\\.)?(youtube\\.com|youtu\\.be|youtube-nocookie\\.com)/[^\\s]*")
                .matcher(text);
        String id = null;
        String list = null;
        if (m.find()) {
            String raw = m.group();
            if (!raw.startsWith("http")) raw = "https://" + raw;
            Uri u = Uri.parse(raw);
            String host = u.getHost() == null ? "" : u.getHost();
            list = u.getQueryParameter("list");
            java.util.List<String> seg = u.getPathSegments();
            if (host.endsWith("youtu.be")) {
                if (!seg.isEmpty()) id = seg.get(0);
            } else if (u.getQueryParameter("v") != null) {
                id = u.getQueryParameter("v");
            } else if (seg.size() >= 2 && (seg.get(0).equals("shorts") || seg.get(0).equals("live")
                    || seg.get(0).equals("embed") || seg.get(0).equals("v"))) {
                id = seg.get(1);
            }
        } else if (text.trim().matches("[\\w-]{11}")) {
            id = text.trim();
        }
        if (id != null && !id.matches("[\\w-]{11}")) id = null;
        if (id == null && list == null) return null;
        StringBuilder sb = new StringBuilder("https://www.youtube.com/watch?");
        if (id != null) sb.append("v=").append(id);
        if (list != null) sb.append(id != null ? "&" : "").append("list=").append(Uri.encode(list));
        return sb.toString();
    }
}
