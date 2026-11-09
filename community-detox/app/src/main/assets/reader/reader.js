'use strict';
/* 모아읽기 screen for Digital Detox. Pages come from the app (/api/*), are parsed inertly with
   Feeds (sources.js) and rebuilt from a small set of safe tags — no scripts, styles, frames or
   links from the sites ever run or navigate. Images go through the app (/img). */
(() => {
  const $ = id => document.getElementById(id);
  const S = { board: 0, page: 1, rows: [], mode: 'list', selected: null, listY: 0, cPage: 1, cMax: 1, seq: 0 };

  const READ_KEY = 'moa-read-v1', BOARD_KEY = 'moa-board-v1';
  let read = {};
  try { read = JSON.parse(localStorage.getItem(READ_KEY) || '{}') || {}; } catch (_) {}
  try { const b = Number(localStorage.getItem(BOARD_KEY)); if (b >= 0 && b <= 3) S.board = b; } catch (_) {}
  function saveRead() {
    const keys = Object.keys(read);
    if (keys.length > 1500) keys.sort((a, b) => read[a] - read[b]).slice(0, keys.length - 1500).forEach(k => delete read[k]);
    try { localStorage.setItem(READ_KEY, JSON.stringify(read)); } catch (_) {}
  }
  const key = no => S.board + ':' + no;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  async function api(path) {
    const r = await fetch(path, { cache: 'no-store' });
    let d;
    try { d = await r.json(); } catch (_) { throw new Error('응답을 읽지 못했어요'); }
    if (!d.ok) throw new Error(d.message || '불러오지 못했어요');
    return d;
  }

  const parseDoc = html => new DOMParser().parseFromString(String(html || ''), 'text/html');

  // ---------------------------------------------------------------- safe rebuild of site HTML
  const KEEP = new Set(['P', 'BR', 'DIV', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'DEL', 'UL', 'OL', 'LI', 'BLOCKQUOTE',
    'PRE', 'CODE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'HR', 'SMALL', 'SUB', 'SUP', 'FIGURE', 'FIGCAPTION']);
  const HEADINGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
  const DROP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA',
    'OBJECT', 'EMBED', 'LINK', 'META', 'SVG', 'CANVAS', 'HEAD', 'TITLE', 'MATH']);

  function imageUrl(n) {
    for (const a of ['data-originalurl', 'data-original', 'data-src', 'src']) {
      let v = (n.getAttribute(a) || '').trim();
      if (!v) continue;
      if (v.startsWith('//')) v = 'https:' + v;
      if (/^https?:\/\//i.test(v)) return v;
    }
    return null;
  }

  function sanitize(source) {
    const out = document.createDocumentFragment();
    let count = 0;
    (function walk(node, parent, depth) {
      if (!node || depth > 60) return;
      for (const c of Array.from(node.childNodes)) {
        if (++count > 30000) return;
        if (c.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(c.nodeValue)); continue; }
        if (c.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = c.tagName.toUpperCase();
        if (DROP.has(tag)) continue;
        if (tag === 'IMG') {
          const u = imageUrl(c);
          if (!u) continue;
          const img = el('img', 'post-img');
          img.loading = 'lazy';
          img.alt = '';
          img.addEventListener('error', () => img.replaceWith(el('span', 'media-note', '이미지를 불러오지 못했어요')), { once: true });
          img.src = '/img?u=' + encodeURIComponent(u);
          parent.append(img);
          continue;
        }
        if (tag === 'VIDEO' || tag === 'IFRAME' || tag === 'AUDIO') {
          parent.append(el('div', 'media-note', '영상·외부 미디어는 표시하지 않아요'));
          continue;
        }
        let n;
        if (tag === 'A') n = el('span', 'link');                // text only: links don't go anywhere
        else if (HEADINGS.has(tag)) n = el('b', 'heading');
        else if (KEEP.has(tag)) n = document.createElement(tag.toLowerCase());
        else n = document.createElement('span');
        walk(c, n, depth + 1);
        parent.append(n);
      }
    })(source, out, 0);
    return out;
  }

  // ---------------------------------------------------------------- views
  function show(mode) {
    S.mode = mode;
    $('listView').hidden = mode !== 'list';
    $('postView').hidden = mode !== 'post';
    $('backBtn').hidden = mode !== 'post';
  }

  function status(kind, message, retry) {
    const box = $('listStatus');
    if (!kind) { box.hidden = true; return; }
    box.hidden = false;
    box.replaceChildren(el('div', null, kind === 'loading' ? '불러오는 중… (처음엔 몇 초 걸릴 수 있어요)'
      : kind === 'empty' ? '표시할 글이 없어요' : '불러오지 못했어요: ' + message));
    if (retry) {
      const b = el('button', null, '다시 시도');
      b.type = 'button';
      b.onclick = retry;
      box.append(b);
    }
  }

  function drawBoards() {
    $('boards').replaceChildren(...Feeds.names.map((name, i) => {
      const b = el('button', null, name + ' ' + Feeds.kinds[i]);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(i === S.board));
      b.onclick = () => {
        if (S.board === i && S.mode === 'list') return;
        S.board = i;
        try { localStorage.setItem(BOARD_KEY, String(i)); } catch (_) {}
        drawBoards();
        loadList(1);
      };
      return b;
    }));
  }

  const count = v => String(v || '').replace(/[\[\]()]/g, '').trim();

  function drawRows() {
    $('rows').replaceChildren(...S.rows.map(r => {
      const b = el('button', 'row' + (read[key(r.no)] ? ' read' : ''));
      b.type = 'button';
      b.append(el('div', 'row-title', r.title));
      const meta = [r.writer, r.date, count(r.recommends) && '추천 ' + count(r.recommends),
        count(r.comments) && '댓글 ' + count(r.comments)].filter(Boolean).join(' · ');
      b.append(el('div', 'row-meta', meta));
      b.onclick = () => openPost(r);
      return b;
    }));
    $('pageLabel').textContent = S.page + ' 페이지';
    $('prev').disabled = S.page <= 1;
  }

  async function loadList(page) {
    const seq = ++S.seq;
    S.page = page;
    show('list');
    $('rows').replaceChildren();
    status('loading');
    window.scrollTo(0, 0);
    try {
      const d = await api('/api/list?board=' + S.board + '&page=' + page);
      if (seq !== S.seq) return;
      S.rows = Feeds.parseList({ html: d.html }, S.board);
      drawRows();
      status(S.rows.length ? null : 'empty', '', () => loadList(page));
    } catch (e) {
      if (seq !== S.seq) return;
      status('error', e.message, () => loadList(page));
    }
  }

  async function openPost(row) {
    const seq = ++S.seq;
    S.selected = row;
    S.listY = window.scrollY;
    show('post');
    window.scrollTo(0, 0);
    $('postTitle').textContent = row.title;
    $('postMeta').textContent = [row.writer, row.date].filter(Boolean).join(' · ');
    $('postBody').replaceChildren(el('div', 'loading', '본문을 불러오는 중…'));
    $('comments').replaceChildren();
    $('cTotal').textContent = '';
    $('cStatus').textContent = '';
    $('cPager').hidden = true;
    try {
      const d = await api('/api/post?board=' + S.board + '&no=' + row.no);
      if (seq !== S.seq) return;
      const a = Feeds.article(parseDoc(d.html), S.board, row);
      if (!a.body) throw new Error('본문 형식을 읽지 못했어요');
      $('postTitle').textContent = a.title || row.title;
      $('postMeta').textContent = [a.writer || row.writer, a.date || row.date, count(row.views) && '조회 ' + count(row.views),
        count(row.recommends) && '추천 ' + count(row.recommends)].filter(Boolean).join(' · ');
      $('postBody').replaceChildren(sanitize(a.body));
      read[key(row.no)] = Date.now();
      saveRead();
      // 펨코·아카: the first comment page is already in the post page. 디시: comments come separately.
      const first = S.board !== 2 ? Feeds.articleComments({ html: d.html }, S.board) : null;
      if (first) paintComments(first, 1);
      else loadComments(1);
    } catch (e) {
      if (seq !== S.seq) return;
      const box = el('div', 'status', '본문을 불러오지 못했어요: ' + e.message);
      const b = el('button', null, '다시 시도');
      b.type = 'button';
      b.onclick = () => openPost(row);
      box.append(el('br'), b);
      $('postBody').replaceChildren(box);
    }
  }

  async function loadComments(page) {
    const row = S.selected, seq = S.seq;
    if (!row) return;
    $('cStatus').textContent = '댓글을 불러오는 중…';
    try {
      const d = await api('/api/comments?board=' + S.board + '&no=' + row.no + '&page=' + page);
      if (seq !== S.seq || S.selected !== row) return;
      paintComments(Feeds.commentResult(d, S.board, page), page);
    } catch (e) {
      if (seq !== S.seq) return;
      $('cStatus').textContent = '댓글을 불러오지 못했어요: ' + e.message;
    }
  }

  function paintComments(result, page) {
    S.cPage = page;
    S.cMax = Math.max(1, Number(result.max) || 1);
    $('comments').replaceChildren(...result.items.map(c => {
      const card = el('div', 'comment' + (c.reply ? ' reply' : ''));
      const meta = el('div', 'c-meta');
      meta.append(el('b', 'c-name', (c.reply ? '↳ ' : '') + c.name), el('span', 'c-date', c.date));
      const body = el('div', 'c-body');
      body.append(sanitize(c.content));
      card.append(meta, body);
      return card;
    }));
    const total = Number(result.total);
    $('cTotal').textContent = String(Number.isFinite(total) && total >= result.items.length ? total : result.items.length);
    $('cStatus').textContent = result.items.length ? '' : '댓글이 없어요';
    $('cPager').hidden = S.cMax <= 1;
    $('cPageLabel').textContent = page + ' / ' + S.cMax;
    $('cPrev').disabled = page <= 1;
    $('cNext').disabled = page >= S.cMax;
  }

  function back() {
    if (S.mode !== 'post') return false;
    S.seq++;
    S.selected = null;
    show('list');
    drawRows();
    window.scrollTo(0, S.listY);
    return true;
  }

  // ---------------------------------------------------------------- wiring
  $('prev').onclick = () => S.page > 1 && loadList(S.page - 1);
  $('next').onclick = () => loadList(S.page + 1);
  $('refresh').onclick = () => loadList(S.page);
  $('backBtn').onclick = back;
  $('toList').onclick = back;
  $('cPrev').onclick = () => S.cPage > 1 && loadComments(S.cPage - 1);
  $('cNext').onclick = () => S.cPage < S.cMax && loadComments(S.cPage + 1);

  window.Reader = Object.freeze({ back });
  drawBoards();
  loadList(1);
})();
