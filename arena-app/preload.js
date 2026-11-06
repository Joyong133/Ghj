// arena.ai 페이지 위에 앱 기능(저장한 프롬프트, 답변 분량, 스르륵, 고정 모드)을 얹는 스크립트.
// 페이지와 분리된 공간(isolated world)에서 돌고, 화면은 Shadow DOM 안에 그려서 사이트 모양과 섞이지 않습니다.
// 재생·고정·분량 스크립트(web/*.js)는 안드로이드 앱과 같은 파일을 씁니다.
const { ipcRenderer } = require('electron');

const ARENA_HOSTS = ['arena.ai', 'lmarena.ai'];
const isArena = (h) => ARENA_HOSTS.some((x) => h === x || h.endsWith('.' + x));

if (isArena(location.hostname)) setup();

function setup() {
  const DIRECT_URL = 'https://arena.ai/text/direct';

  // ---- 저장소 (앱 데이터 폴더의 JSON 파일, main.js가 관리) ----
  const store = {
    get(key, fallback) {
      const v = ipcRenderer.sendSync('store-get', key);
      return v === undefined || v === null ? fallback : v;
    },
    set(key, value) { ipcRenderer.sendSync('store-set', key, value); },
  };
  const copyText = (text) => ipcRenderer.send('copy-text', text);

  // ---- 공용 스크립트가 앱에 알려 주는 통로 ----
  window.ArenaSrr = {
    onState: (state, pct) => srrOnState(state, pct),
    onPicked: () => srrOnPicked(),
    onPickedUser: () => toast('내 질문은 스르륵 할 수 없어요. AI 답변을 눌러 주세요'),
    getProgress: (key) => {
      const p = store.get('srrProgress', {})[key];
      return p ? p.pos : 0;
    },
    saveProgress: (key, pos, total) => {
      const all = store.get('srrProgress', {});
      all[key] = { pos, total, t: Date.now() };
      const keys = Object.keys(all);
      if (keys.length > 100) {
        keys.sort((a, b) => all[a].t - all[b].t).slice(0, keys.length - 100).forEach((k) => delete all[k]);
      }
      store.set('srrProgress', all);
    },
    clearProgress: (key) => {
      const all = store.get('srrProgress', {});
      if (key in all) {
        delete all[key];
        store.set('srrProgress', all);
      }
    },
  };
  window.ArenaLock = { onEvent: (type, data) => lockOnEvent(type, data) };

  require('./web/srr.js');
  require('./web/lock.js');
  require('./web/length.js');
  const srr = window.__srr;
  const lock = window.__lock;
  const len = window.__len;

  // ---- 화면 도우미 ----
  const NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    pin: 'M16,9V4l1,0c0.55,0 1,-0.45 1,-1v0c0,-0.55 -0.45,-1 -1,-1H7C6.45,2 6,2.45 6,3v0c0,0.55 0.45,1 1,1l1,0v5c0,1.66 -1.34,3 -3,3h0v2h5.97v7l1,1l1,-1v-7H19v-2h0C17.34,12 16,10.66 16,9z',
    srr: 'M4,6h10v2H4zM4,10h10v2H4zM4,14h6v2H4zM14,13v8l6,-4z',
    prompts: 'M17,3H7c-1.1,0 -1.99,0.9 -1.99,2L5,21l7,-3 7,3V5c0,-1.1 -0.9,-2 -2,-2z',
    play: 'M8,5v14l11,-7z',
    pause: 'M6,19h4V5H6v14zM14,5v14h4V5h-4z',
    close: 'M19,6.41L17.59,5 12,10.59 6.41,5 5,6.41 10.59,12 5,17.59 6.41,19 12,13.41 17.59,19 19,17.59 13.41,12z',
    touch: 'M9,11.24V7.5C9,6.12 10.12,5 11.5,5S14,6.12 14,7.5v3.74c1.21,-0.81 2,-2.18 2,-3.74C16,5.01 13.99,3 11.5,3S7,5.01 7,7.5c0,1.56 0.79,2.93 2,3.74zM18.84,15.87l-4.54,-2.26c-0.17,-0.07 -0.35,-0.11 -0.54,-0.11H13v-6C13,6.67 12.33,6 11.5,6S10,6.67 10,7.5v10.74l-3.43,-0.72c-0.08,-0.01 -0.15,-0.03 -0.24,-0.03 -0.31,0 -0.59,0.13 -0.79,0.33l-0.79,0.8 4.94,4.94c0.27,0.27 0.65,0.44 1.06,0.44h6.79c0.75,0 1.33,-0.55 1.44,-1.28l0.75,-5.27c0.01,-0.07 0.02,-0.14 0.02,-0.2 0,-0.62 -0.38,-1.16 -0.91,-1.38z',
    more: 'M12,8c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM12,10c-1.1,0 -2,0.9 -2,2s0.9,2 2,2 2,-0.9 2,-2 -0.9,-2 -2,-2zM12,16c-1.1,0 -2,0.9 -2,2s0.9,2 2,2 2,-0.9 2,-2 -0.9,-2 -2,-2z',
  };
  function icon(name, size = 22) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', ICONS[name]);
    p.setAttribute('fill', 'currentColor');
    svg.append(p);
    return svg;
  }
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (v == null) continue;
      if (k === 'class') e.className = v;
      else if (k === 'value') e.value = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k in e && typeof v !== 'string') e[k] = v;
      else e.setAttribute(k, v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) e.append(c); });
    return e;
  }

  const CSS = `
    :host { all: initial; --bg:#fff; --fg:#1c1b1f; --muted:#5f6068; --line:#dcdce4; --soft:#f1f1f6;
      --accent:#1D1E2C; --accent-fg:#fff; --brand:#1D1E2C; --gold:#F5B942; --pin:#5B5D70; --pin-on:#2E7D32; }
    @media (prefers-color-scheme: dark) {
      :host { --bg:#232428; --fg:#ececf1; --muted:#a6a7b0; --line:#3a3b42; --soft:#2e2f34;
        --accent:#C9CAE0; --accent-fg:#1D1E2C; }
    }
    * { box-sizing: border-box; font-family: system-ui, "Segoe UI", "Malgun Gothic", sans-serif; }
    button { font: inherit; }
    .fabs { position: fixed; right: 18px; bottom: 140px; display: flex; flex-direction: column; gap: 10px;
      z-index: 2147483647; touch-action: none; }
    .fab { width: 44px; height: 44px; border-radius: 50%; border: 0; display: grid; place-items: center;
      cursor: pointer; color: #fff; box-shadow: 0 3px 10px rgba(0,0,0,.28); opacity: .93; transition: transform .1s; }
    .fab:hover { opacity: 1; transform: scale(1.06); }
    .fab.pin { background: var(--pin); } .fab.pin.on { background: var(--pin-on); }
    .fab.srr { background: var(--brand); } .fab.prompts { background: var(--gold); color: var(--brand); }
    .hidden { display: none !important; }
    .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.38); display: flex; align-items: center;
      justify-content: center; z-index: 2147483647; }
    .card { background: var(--bg); color: var(--fg); border-radius: 16px; box-shadow: 0 12px 40px rgba(0,0,0,.3);
      width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 64px); display: flex; flex-direction: column; overflow: hidden; }
    .card h2 { font-size: 18px; font-weight: 700; margin: 0; padding: 20px 22px 4px; }
    .card .body { padding: 6px 22px 8px; overflow: auto; font-size: 14px; line-height: 1.5; }
    .card .actions { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px 18px; }
    .btn { font-size: 14px; border-radius: 999px; padding: 8px 16px; border: 1px solid var(--line);
      background: transparent; color: var(--fg); cursor: pointer; }
    .btn:hover { background: var(--soft); }
    .btn.primary { background: var(--accent); color: var(--accent-fg); border-color: transparent; }
    .btn.tonal { background: var(--soft); border-color: transparent; }
    .btn.primary:hover, .btn.tonal:hover { filter: brightness(.94); }
    .hint { font-size: 12px; color: var(--muted); margin: 2px 0 8px; }
    .two { display: flex; gap: 8px; margin: 8px 0; } .two .btn { flex: 1; }
    .row { display: flex; align-items: center; gap: 8px; padding: 10px 8px; border-radius: 10px; cursor: pointer; }
    .row:hover { background: var(--soft); }
    .row .main { flex: 1; min-width: 0; }
    .row .t { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row .p { font-size: 12px; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2;
      -webkit-box-orient: vertical; overflow: hidden; }
    .item { padding: 11px 10px; border-radius: 10px; cursor: pointer; font-size: 14px; }
    .item:hover { background: var(--soft); }
    .iconbtn { border: 0; background: transparent; color: var(--muted); width: 34px; height: 34px; border-radius: 50%;
      display: grid; place-items: center; cursor: pointer; flex: none; }
    .iconbtn:hover { background: var(--soft); color: var(--fg); }
    input[type=text], input[type=number], input[type=search], textarea { font-size: 14px; width: 100%;
      padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg);
      color: var(--fg); outline: none; font-family: inherit; }
    input:focus, textarea:focus { border-color: var(--accent); }
    textarea { min-height: 140px; resize: vertical; line-height: 1.5; }
    label.f { display: block; font-size: 12px; color: var(--muted); margin: 12px 0 4px; }
    .err { color: #d93025; font-size: 12px; min-height: 16px; margin-top: 4px; }
    .switch { appearance: none; width: 42px; height: 24px; border-radius: 12px; background: var(--line);
      position: relative; cursor: pointer; flex: none; margin: 0; transition: background .15s; }
    .switch::before { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px;
      border-radius: 50%; background: #fff; transition: left .15s; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
    .switch:checked { background: var(--accent); } .switch:checked::before { left: 21px; }
    @media (prefers-color-scheme: dark) { .switch:checked::before { background: #1D1E2C; } }
    .seg { display: flex; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; margin-top: 8px; }
    .seg button { flex: 1; border: 0; background: transparent; color: var(--fg); padding: 8px; font-size: 13px; cursor: pointer; }
    .seg button + button { border-left: 1px solid var(--line); }
    .seg button.on { background: var(--accent); color: var(--accent-fg); }
    .preview { white-space: pre-wrap; background: var(--soft); border-radius: 10px; padding: 8px 10px;
      font-size: 12px; color: var(--muted); margin-top: 12px; }
    .empty { text-align: center; color: var(--muted); padding: 28px 0; white-space: pre-line; }
    .toast { position: fixed; left: 50%; bottom: 36px; transform: translateX(-50%); background: #323232; color: #fff;
      padding: 10px 16px; border-radius: 10px; font-size: 14px; max-width: min(560px, 90vw);
      box-shadow: 0 4px 16px rgba(0,0,0,.3); z-index: 2147483647; pointer-events: none; }
    .snack { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); background: #323232; color: #fff;
      padding: 6px 6px 6px 16px; border-radius: 10px; display: flex; gap: 12px; align-items: center; font-size: 14px;
      box-shadow: 0 4px 16px rgba(0,0,0,.3); z-index: 2147483647; }
    .snack button { color: var(--gold); background: transparent; border: 0; font-weight: 700; cursor: pointer; padding: 8px 12px; }
    .bar { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); width: min(560px, calc(100vw - 24px));
      background: var(--bg); color: var(--fg); border-radius: 20px; box-shadow: 0 6px 24px rgba(0,0,0,.28);
      padding: 12px 18px 10px; z-index: 2147483647; }
    .prog { height: 4px; background: var(--soft); border-radius: 2px; overflow: hidden; }
    .prog i { display: block; height: 100%; width: 0; background: var(--accent); transition: width .2s; }
    .speed { display: flex; align-items: center; gap: 12px; margin: 8px 0 4px; font-size: 13px; font-weight: 600; }
    .speed input { flex: 1; accent-color: var(--accent); }
    .speed span:last-child { min-width: 64px; text-align: right; }
    .ctl { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; }
    .ctl .btns { display: flex; align-items: center; gap: 28px; }
    .check { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; cursor: pointer;
      user-select: none; justify-self: start; }
    .check input { width: 17px; height: 17px; margin: 0; accent-color: var(--accent); cursor: pointer; }
    .ctl .play { width: 50px; height: 50px; background: var(--accent); color: var(--accent-fg); }
    .ctl .play:hover { background: var(--accent); filter: brightness(.94); }
  `;

  let root = null;  // shadow root
  let fabs, pinFab, toastEl, toastTimer, bar, barProg, barPlay, snackEl;
  const dialogs = [];  // 열린 대화상자 (Esc로 맨 위부터 닫음)

  function toast(text, ms = 2600) {
    if (!root) return;
    if (!toastEl) {
      toastEl = h('div', { class: 'toast' });
      root.append(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
  }

  /** 대화상자. content는 노드 또는 글, actions는 [{label, primary, onClick → false면 안 닫힘}] */
  function dialog({ title, content, actions = [], items = null, wide = false }) {
    const close = () => {
      backdrop.remove();
      const i = dialogs.indexOf(close);
      if (i >= 0) dialogs.splice(i, 1);
    };
    const body = h('div', { class: 'body' });
    if (typeof content === 'string') body.append(h('div', { text: content }));
    else if (content) body.append(content);
    if (items) {
      items.forEach((it) => body.append(h('div', {
        class: 'item', text: it.label,
        onclick: () => { close(); it.onClick(); },
      })));
    }
    const card = h('div', { class: 'card' },
      title ? h('h2', { text: title }) : null,
      body,
      actions.length ? h('div', { class: 'actions' }, actions.map((a) => h('button', {
        class: 'btn' + (a.primary ? ' primary' : ''), text: a.label,
        onclick: () => { if (!a.onClick || a.onClick() !== false) close(); },
      }))) : null);
    if (wide) card.style.width = 'min(620px, calc(100vw - 32px))';
    const backdrop = h('div', { class: 'backdrop', onmousedown: (e) => { if (e.target === backdrop) close(); } }, card);
    root.append(backdrop);
    dialogs.push(close);
    return close;
  }

  // ---- 입력창 다루기 ----
  function findInput() {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const named = document.querySelector('textarea[name="message"]');
    if (named && vis(named)) return named;
    const c = [...document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""]')]
      .filter((e) => vis(e) && !e.disabled && !e.readOnly && !e.closest('[data-arena-ui]'));
    return c.length ? c[c.length - 1] : null;
  }
  function insertIntoInput(text) {
    const el = findInput();
    if (!el) return false;
    el.focus();
    if (el.isContentEditable) {
      const sel = window.getSelection();
      sel.selectAllChildren(el);
      sel.collapseToEnd();
      const cur = (el.innerText || '').trim();
      document.execCommand('insertText', false, (cur ? '\n' : '') + text);
    } else {
      const cur = el.value || '';
      const next = cur.trim() ? cur.replace(/\s+$/, '') + '\n' + text : text;
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, next);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.setSelectionRange(next.length, next.length);
    }
    return true;
  }
  function readInput() {
    const el = findInput();
    if (!el) return '';
    return el.isContentEditable ? el.innerText : el.value;
  }

  // ---- 저장한 프롬프트 ----
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const SEED = [
    ['한국어로 간결하게', '앞으로 모든 답변은 한국어로, 핵심부터 간결하게 써 줘.'],
    ['쉽게 설명해 줘', '다음 내용을 중학생도 이해할 수 있게 예시를 들어 쉽게 설명해 줘:\n'],
    ['3줄 요약', '다음 글을 핵심만 3줄로 요약해 줘. 중요한 숫자와 이름은 빠뜨리지 마:\n'],
    ['코드 검토', '아래 코드에서 버그와 고칠 점을 찾아서, 고친 코드와 함께 설명해 줘:\n'],
  ];
  function prompts() {
    let list = store.get('prompts', null);
    if (!list) {
      list = SEED.map(([title, text]) => ({ id: newId(), title, text }));
      store.set('prompts', list);
    }
    return list;
  }
  const savePrompts = (list) => store.set('prompts', list);
  const displayTitle = (p) => p.title.trim() ||
    (p.text.split('\n').find((l) => l.trim()) || '(빈 프롬프트)').trim().slice(0, 60);

  function pickPrompt(p) {
    if (insertIntoInput(p.text)) toast('입력창에 넣었어요');
    else {
      copyText(p.text);
      toast('입력창을 찾지 못해서 복사해 두었어요. 입력창에 Ctrl+V로 붙여 넣으세요.');
    }
  }

  function openPrompts() {
    let query = '';
    const list = h('div');
    const search = h('input', { type: 'search', placeholder: '검색', class: 'hidden',
      oninput: () => { query = search.value.trim(); render(); } });
    const lenSwitch = h('input', { type: 'checkbox', class: 'switch', title: '답변 분량 켜기/끄기' });
    const lenSummary = h('div', { class: 'p' });
    const showLength = () => {
      const L = lengthCfg();
      lenSwitch.checked = L.enabled;
      lenSummary.textContent = L.enabled ? `켜짐 · ${lengthSummary(L)} (보낼 때 질문 끝에 붙여요)`
        : '꺼짐 · 눌러서 분량을 정하세요';
    };
    lenSwitch.addEventListener('click', (e) => e.stopPropagation());
    lenSwitch.addEventListener('change', () => {
      const L = lengthCfg();
      L.enabled = lenSwitch.checked;
      saveLength(L);
      showLength();
      toast(L.enabled ? `답변 분량 ${lengthSummary(L)}을(를) 켰어요` : '답변 분량을 껐어요');
    });
    const lengthRow = h('div', { class: 'row', onclick: () => editLength(showLength) },
      h('div', { class: 'main' }, h('div', { class: 't', text: '답변 분량 정하기' }), lenSummary), lenSwitch);
    showLength();

    const content = h('div', null,
      h('div', { class: 'hint', text: '누르면 입력창에 바로 들어가요. ⋮ 또는 오른쪽 클릭으로 수정·삭제할 수 있어요.' }),
      lengthRow,
      h('div', { class: 'two' },
        h('button', { class: 'btn tonal', text: '새 프롬프트', onclick: () => editPrompt(null, '', render) }),
        h('button', { class: 'btn', text: '입력창 내용 저장', onclick: () => {
          const t = readInput();
          if (!t.trim()) toast('입력창이 비어 있어요. 먼저 내용을 적어 주세요.');
          else editPrompt(null, t, render);
        } })),
      search, list);

    function render() {
      const all = prompts();
      search.classList.toggle('hidden', !(all.length >= 6 || query));
      const shown = query ? all.filter((p) => (p.title + '\n' + p.text).toLowerCase().includes(query.toLowerCase())) : all;
      list.replaceChildren();
      if (!shown.length) {
        list.append(h('div', { class: 'empty', text: all.length ? `'${query}'에 맞는 프롬프트가 없어요.`
          : '아직 저장한 프롬프트가 없어요.\n자주 쓰는 문장을 저장해 보세요.' }));
      }
      shown.forEach((p) => {
        const more = h('button', { class: 'iconbtn', title: '더 보기' }, icon('more', 20));
        const row = h('div', { class: 'row', onclick: () => { close(); pickPrompt(p); } },
          h('div', { class: 'main' }, h('div', { class: 't', text: displayTitle(p) }),
            h('div', { class: 'p', text: p.text.trim().replace(/\s+/g, ' ') })), more);
        const menu = (e) => { e.preventDefault(); e.stopPropagation(); promptMenu(p, render); };
        more.addEventListener('click', menu);
        row.addEventListener('contextmenu', menu);
        list.append(row);
      });
    }
    render();
    const close = dialog({ title: '저장한 프롬프트', content, actions: [{ label: '닫기' }] });
  }

  function promptMenu(p, after) {
    dialog({ title: displayTitle(p), items: [
      { label: '수정', onClick: () => editPrompt(p, p.text, after) },
      { label: '복사', onClick: () => { copyText(p.text); toast('복사했어요'); } },
      { label: '맨 위로', onClick: () => {
        const list = prompts().filter((x) => x.id !== p.id);
        list.unshift(p);
        savePrompts(list);
        after();
      } },
      { label: '삭제', onClick: () => dialog({
        title: '프롬프트 삭제', content: `'${displayTitle(p)}'을(를) 지울까요?`,
        actions: [{ label: '취소' }, { label: '삭제', primary: true, onClick: () => {
          savePrompts(prompts().filter((x) => x.id !== p.id));
          after();
        } }],
      }) },
    ] });
  }

  function editPrompt(p, text, after) {
    const title = h('input', { type: 'text', value: p ? p.title : '' });
    const body = h('textarea', { value: text });
    const err = h('div', { class: 'err' });
    dialog({
      title: p ? '프롬프트 수정' : '새 프롬프트',
      content: h('div', null,
        h('label', { class: 'f', text: '제목 (비워 두면 첫 줄로 표시)' }), title,
        h('label', { class: 'f', text: '프롬프트 내용' }), body, err),
      actions: [{ label: '취소' }, { label: '저장', primary: true, onClick: () => {
        if (!body.value.trim()) { err.textContent = '내용을 적어 주세요'; return false; }
        const list = prompts();
        const i = p ? list.findIndex((x) => x.id === p.id) : -1;
        const item = { id: p ? p.id : newId(), title: title.value.trim(), text: body.value };
        if (i >= 0) list[i] = item; else list.unshift(item);
        savePrompts(list);
        toast(p ? '수정했어요' : '저장했어요');
        after && after();
        return true;
      } }],
    });
    setTimeout(() => { body.focus(); body.setSelectionRange(body.value.length, body.value.length); }, 0);
  }

  // ---- 답변 분량 ----
  const lengthCfg = () => Object.assign({ enabled: false, amount: 500, unit: 0, mode: 0 }, store.get('length', {}));
  function lengthSummary(L) {
    const what = L.unit === 1 ? `${L.amount}문장` : L.unit === 2 ? `${L.amount}문단` : `${L.amount}자`;
    return L.mode === 0 ? `${what} 이내` : `약 ${what}`;
  }
  function lengthInstruction(L) {
    const amt = L.unit === 1 ? `${L.amount}문장` : L.unit === 2 ? `${L.amount}문단` : `공백 포함 ${L.amount}자`;
    return L.mode === 0 ? `\n\n[분량: ${amt} 이내로 답해 줘]` : `\n\n[분량: ${amt} 정도로 답해 줘]`;
  }
  function applyLength() {
    const L = lengthCfg();
    len.set(L.enabled ? { text: lengthInstruction(L) } : null);
  }
  function saveLength(L) { store.set('length', L); applyLength(); }

  function editLength(after) {
    const L = lengthCfg();
    const amount = h('input', { type: 'number', min: '1', value: String(L.amount) });
    const preview = h('div', { class: 'preview' });
    const err = h('div', { class: 'err' });
    const seg = (labels, value, onPick) => {
      const box = h('div', { class: 'seg' });
      labels.forEach((label, i) => box.append(h('button', {
        class: i === value ? 'on' : '', text: label,
        onclick: () => { [...box.children].forEach((b, j) => b.classList.toggle('on', j === i)); onPick(i); },
      })));
      return box;
    };
    let unit = L.unit, mode = L.mode;
    const refresh = () => {
      const a = parseInt(amount.value, 10);
      preview.textContent = a > 0 ? '보낼 때 붙는 글:' + lengthInstruction({ amount: a, unit, mode }) : '숫자를 적어 주세요';
    };
    amount.addEventListener('input', refresh);
    dialog({
      title: '답변 분량 정하기',
      content: h('div', null,
        h('label', { class: 'f', text: '분량 (숫자)' }), amount,
        seg(['글자', '문장', '문단'], unit, (i) => { unit = i; refresh(); }),
        seg(['이내 (최대)', '정도 (대략)'], mode, (i) => { mode = i; refresh(); }),
        preview, err,
        h('div', { class: 'hint', text: 'AI는 글자 수를 정확히 세지 못해서 대략 맞춰요. 문장·문단 수가 더 잘 지켜져요.' })),
      actions: [{ label: '취소' }, { label: '저장하고 켜기', primary: true, onClick: () => {
        const a = parseInt(amount.value, 10);
        if (!(a > 0)) { err.textContent = '1 이상의 숫자를 적어 주세요'; return false; }
        const next = { enabled: true, amount: a, unit, mode };
        saveLength(next);
        toast(`답변 분량 ${lengthSummary(next)}로 정했어요`);
        after && after();
        return true;
      } }],
    });
    refresh();
    setTimeout(() => amount.focus(), 0);
  }

  // ---- 스르륵 ----
  let srrActive = false, srrPicking = false;
  let srrSpeed = store.get('srrSpeed', 25);
  let srrRain = store.get('srrRain', false);

  function buildBar() {
    barProg = h('i');
    const label = h('span', { text: `${srrSpeed}자/초` });
    const slider = h('input', { type: 'range', min: '5', max: '150', step: '5', value: String(srrSpeed),
      title: '스르륵 속도',
      oninput: () => {
        srrSpeed = parseInt(slider.value, 10);
        label.textContent = `${srrSpeed}자/초`;
        srr.setSpeed(srrSpeed);
        store.set('srrSpeed', srrSpeed);
      } });
    barPlay = h('button', { class: 'iconbtn play', title: '재생 / 일시정지 (스페이스)', onclick: () => srr.toggle() }, icon('pause', 28));
    // 비 내리기 효과 (체크 상태 기억, 재생 중에도 바로 켜고 끔)
    const rainBox = h('input', { type: 'checkbox', checked: srrRain, onchange: () => {
      srrRain = rainBox.checked;
      store.set('srrRain', srrRain);
      srr.setRain(srrRain);
    } });
    bar = h('div', { class: 'bar hidden' },
      h('div', { class: 'prog' }, barProg),
      h('div', { class: 'speed' }, h('span', { text: '속도' }), slider, label),
      h('div', { class: 'ctl' },
        h('label', { class: 'check', title: '스르륵 화면에 비가 내리게 해요' }, rainBox, h('span', { text: '비 내리기' })),
        h('div', { class: 'btns' },
          h('button', { class: 'iconbtn', title: '다른 답변 고르기', onclick: () => {
            closeSrr();
            startPick('다시 볼 답변을 눌러 주세요');
          } }, icon('touch', 24)),
          barPlay,
          h('button', { class: 'iconbtn', title: '스르륵 닫기 (Esc)', onclick: () => closeSrr() }, icon('close', 24))),
        h('span')));
    root.append(bar);
  }

  function updateFabs() {
    fabs.classList.toggle('hidden', srrActive || srrPicking);
  }

  function startSrr() {
    srr.setSpeed(srrSpeed);
    let previews = [];
    try { previews = JSON.parse(srr.find()); } catch (e) { previews = []; }
    if (!previews.length) startPick('답변을 자동으로 찾지 못했어요. 다시 볼 답변을 눌러 주세요');
    else if (previews.length === 1) beginSrr([0]);
    else {
      dialog({ title: '어느 답변을 스르륵 볼까요?', items: [
        ...previews.map((p, i) => ({ label: `답변 ${i + 1}: ${p.slice(0, 50)}`, onClick: () => beginSrr([i]) })),
        { label: '모두 차례로 보기', onClick: () => beginSrr(previews.map((_, i) => i)) },
        { label: '화면에서 직접 고르기', onClick: () => startPick('다시 볼 답변을 눌러 주세요') },
      ] });
    }
  }

  function beginSrr(indices) {
    srr.setSpeed(srrSpeed);
    srr.setRain(srrRain);
    const result = srr.start(indices);
    const resumed = /resumed:(\d+)/.exec(result || '');
    if (result === 'ok' || resumed) {
      if (resumed) toast(`지난번에 본 곳(${resumed[1]}%)부터 이어서 보여 줘요`);
      srrActive = true;
      barProg.style.width = (resumed ? resumed[1] : 0) + '%';
      bar.classList.remove('hidden');
      updateFabs();
    } else {
      toast('답변을 찾지 못했어요');
    }
  }

  function srrOnState(state, pct) {
    if (!srrActive) return;
    if (state === 'closed') { hideBar(); return; }
    barProg.style.width = pct + '%';
    barPlay.replaceChildren(icon(state === 'playing' ? 'pause' : 'play', 28));
  }
  function hideBar() {
    srrActive = false;
    bar.classList.add('hidden');
    updateFabs();
  }
  function closeSrr() {
    srr.close();
    hideBar();
  }

  function startPick(message) {
    srrPicking = true;
    updateFabs();
    srr.pickByTap();
    if (snackEl) snackEl.remove();
    snackEl = h('div', { class: 'snack' }, h('span', { text: message }),
      h('button', { text: '취소', onclick: () => cancelPick() }));
    root.append(snackEl);
  }
  function cancelPick() {
    srrPicking = false;
    if (snackEl) snackEl.remove();
    snackEl = null;
    srr.cancelPick();
    updateFabs();
  }
  function srrOnPicked() {
    if (!srrPicking) return;
    srrPicking = false;
    if (snackEl) snackEl.remove();
    snackEl = null;
    beginSrr([0]);
  }

  // ---- 고정 모드 ----
  let lockedModel = store.get('lockedModel', null);

  function updatePin() {
    pinFab.classList.toggle('on', !!lockedModel);
    pinFab.title = lockedModel ? `고정 모드: ${lockedModel} (눌러서 해제)` : '고정 모드 (지금 AI로 고정)';
  }
  function setLock(model) {
    lockedModel = model || null;
    store.set('lockedModel', lockedModel);
    lock.setModel(lockedModel || '');
    updatePin();
  }

  function onPinClicked() {
    if (lockedModel) {
      dialog({ title: `📌 ${lockedModel} 고정 중`, items: [
        { label: '고정 해제', onClick: () => { setLock(null); toast('고정을 풀었어요'); } },
        { label: '다른 AI로 바꾸기', onClick: detectForLock },
      ] });
    } else {
      detectForLock();
    }
  }

  function detectForLock() {
    let info = null;
    try { info = JSON.parse(lock.detect()); } catch (e) { info = null; }
    if (!info) { toast('이 화면에서는 고정할 수 없어요'); return; }
    const answers = info.answers || [];
    if (info.kind === 'battle' && answers.length) chooseBattleAnswer(answers);
    else if (info.kind === 'direct' && info.current) {
      dialog({ title: `📌 ${info.current} 로 고정할까요?`,
        content: '새 대화를 시작해도 이 모델로 자동으로 맞춰 줘요.',
        actions: [{ label: '취소' }, { label: '고정', primary: true, onClick: () => {
          setLock(info.current);
          toast(`${info.current} 로 고정했어요`);
        } }] });
    } else {
      toast('배틀 화면에서 답변이 나온 뒤, 또는 다이렉트 대화 화면에서 눌러 주세요', 3500);
    }
  }

  function chooseBattleAnswer(answers) {
    const count = answers.length;
    if (!answers.some((a) => a.revealed)) {
      toast('아직 모델 이름이 공개되지 않았어요. 투표하면 이름이 나와요. 지금 고르면 모델 목록에서 직접 골라야 해요.', 5000);
    }
    dialog({ title: '어느 AI로 고정할까요?', items: answers.map((a, i) => {
      const side = count === 2 ? (i === 0 ? 'A' : 'B') : String(i + 1);
      return {
        label: a.revealed ? `${a.name}  (답변 ${side})` : `답변 ${side} (이름 비공개): ${a.preview.slice(0, 30)}…`,
        onClick: () => askCarryOver(i, a.revealed ? a.name : null),
      };
    }) });
  }

  function askCarryOver(index, model) {
    dialog({
      title: '이전 대화를 이어갈까요?',
      content: `다이렉트 모드로 옮겨서 ${model || '고른 AI'}와 계속 대화해요.\n\n` +
        "'이어가기'를 누르면 지금까지의 질문과 이 AI의 답변을 입력창에 넣어 드려요. 끝에 이어서 물어볼 내용을 적고 보내면 돼요.",
      actions: [
        { label: '새로 시작', onClick: () => moveToDirect(model, '') },
        { label: '이어가기', primary: true, onClick: () => moveToDirect(model, lock.transcript(index) || '') },
      ],
    });
  }

  function moveToDirect(model, transcript) {
    if (model) setLock(model);
    store.set('pendingLock', { model: model || null, transcript });
    toast(model ? `${model} 로 고정하고 다이렉트 모드로 옮겨요` : '다이렉트 모드에서 모델을 골라 주세요');
    location.href = DIRECT_URL;
  }

  function lockOnEvent(type, data) {
    if (type === 'applied') {
      toast(data === 'ok' ? `${lockedModel || 'AI'}로 고정했어요. 이어서 질문을 적고 보내세요`
        : '모델 목록에서 이어서 쓸 AI를 골라 주세요. 고른 AI로 고정돼요', 4000);
    } else if (type === 'picked' || type === 'pickedSame') {
      setLock(data);
      toast(`${data} 로 고정했어요`);
    } else if (type === 'reselect') {
      toast(data === 'ok' ? `고정한 ${lockedModel}로 다시 맞췄어요` : `고정한 ${lockedModel}을(를) 목록에서 찾지 못했어요`);
    }
  }

  // ---- 떠 있는 버튼 (위아래로 끌어서 옮기기) ----
  function buildFabs() {
    pinFab = h('button', { class: 'fab pin' }, icon('pin'));
    const srrFab = h('button', { class: 'fab srr', title: '스르륵 (답변 다시 보기)  Ctrl+J' }, icon('srr'));
    const promptFab = h('button', { class: 'fab prompts', title: '저장한 프롬프트  Ctrl+P' }, icon('prompts'));
    fabs = h('div', { class: 'fabs' }, pinFab, srrFab, promptFab);
    root.append(fabs);
    updatePin();

    let offset = store.get('fabOffset', 0);
    const clamp = (y) => {
      const r = fabs.getBoundingClientRect();
      const baseTop = r.top - offset;
      const min = 12 - baseTop;
      const max = window.innerHeight - 12 - (baseTop + r.height);
      return Math.min(Math.max(y, min), max);
    };
    const place = () => { fabs.style.transform = `translateY(${offset}px)`; };
    place();
    requestAnimationFrame(() => { offset = clamp(offset); place(); });
    window.addEventListener('resize', () => { offset = clamp(offset); place(); });

    const actions = new Map([[pinFab, onPinClicked], [srrFab, startSrr], [promptFab, openPrompts]]);
    actions.forEach((action, btn) => {
      let downY = 0, start = 0, dragging = false;
      btn.addEventListener('pointerdown', (e) => {
        downY = e.clientY; start = offset; dragging = false;
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      });
      btn.addEventListener('pointermove', (e) => {
        if (!btn.hasPointerCapture(e.pointerId)) return;
        const dy = e.clientY - downY;
        if (!dragging && Math.abs(dy) > 5) dragging = true;
        if (dragging) { offset = clamp(start + dy); place(); }
      });
      btn.addEventListener('pointerup', (e) => {
        if (btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
        if (dragging) store.set('fabOffset', offset);
        else action();
      });
    });
  }

  // ---- 키보드 ----
  function onKey(e) {
    if (!root) return;
    if (e.key === 'Escape') {
      if (dialogs.length) dialogs[dialogs.length - 1]();
      else if (srrPicking) cancelPick();
      else if (srrActive) closeSrr();
      else return;
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === ' ' && srrActive && !dialogs.length) {
      const t = e.composedPath()[0];
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      e.stopPropagation();
      srr.toggle();
    }
  }

  // ---- 메뉴(도구)에서 오는 명령 ----
  ipcRenderer.on('ui-action', (_e, name) => {
    if (!root || dialogs.length) return;
    if (name === 'prompts') openPrompts();
    else if (name === 'srr') { if (srrActive) closeSrr(); else if (!srrPicking) startSrr(); }
    else if (name === 'lock') onPinClicked();
    else if (name === 'length') editLength();
  });

  function init() {
    if (root) return;
    const host = h('div', { id: 'arena-app-ui', 'data-arena-ui': '' });
    root = host.attachShadow({ mode: 'open' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];
    // 앱 화면에서 누른 키가 사이트 단축키로 넘어가지 않게
    ['keydown', 'keyup', 'keypress'].forEach((t) => host.addEventListener(t, (e) => e.stopPropagation()));
    document.documentElement.append(host);
    buildFabs();
    buildBar();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && srrActive) srr.pause();  // 창을 내리면 멈추고 본 위치 저장
    });

    applyLength();
    lock.setModel(lockedModel || '');
    const pending = store.get('pendingLock', null);
    if (pending && location.pathname.startsWith('/text/direct')) {
      store.set('pendingLock', null);
      lock.apply(pending);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}
