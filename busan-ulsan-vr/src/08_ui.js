// ---------------------------------------------------------------------------
// UI: 위치 안내, 미니맵, 명소 카드, 탑승 안내판, 메뉴(화면·VR), 전체 지도, 터치
// ---------------------------------------------------------------------------
const DISTRICTS = [
  ['부산 중구', 35.106, 129.032], ['부산 서구', 35.098, 129.019], ['부산 동구', 35.129, 129.045], ['부산 영도구', 35.088, 129.068], ['부산 부산진구', 35.163, 129.053],
  ['부산 동래구', 35.205, 129.084], ['부산 남구', 35.130, 129.090], ['부산 북구', 35.205, 129.005], ['부산 해운대구', 35.170, 129.165], ['부산 사하구', 35.095, 128.975],
  ['부산 금정구', 35.250, 129.092], ['부산 강서구', 35.150, 128.900], ['부산 연제구', 35.180, 129.080], ['부산 수영구', 35.150, 129.112], ['부산 사상구', 35.155, 128.990],
  ['부산 기장군', 35.270, 129.220], ['울산 중구', 35.572, 129.330], ['울산 남구', 35.530, 129.320], ['울산 동구', 35.505, 129.420], ['울산 북구', 35.610, 129.370],
  ['울산 울주군', 35.520, 129.170], ['울산 울주군', 35.400, 129.300], ['김해시', 35.235, 128.880], ['양산시', 35.340, 129.035],
].map(([n, lat, lon]) => ({ n, ...GEO.toWorld(lat, lon) }));

const UI = {
  stack: [], focus: 0, t: 0, mapT: 0, vr: null,

  init() {
    this.mm = $('minimap').getContext('2d');
    window.addEventListener('keydown', (e) => this.menuKey(e));
    this.modebar();
  },
  show(on) { $('hud').hidden = !on || G.xr; $('touch').hidden = !(on && G.touch && !G.xr); },

  modebar() {
    const P = Player;
    const m = (id, label) => `<span class="m${P.mode === id ? ' on' : ''}">${label}</span>`;
    const keys = G.touch ? '' : P.mode === 'fly' ? ' (F)' : ' (F 비행)';
    $('modebar').innerHTML = P.mode === 'ride' ? '<span class="m on">탑승 중</span><span class="spd">E: 정차 중 내리기</span>'
      : m('walk', '걷기') + m('fly', '비행') + `<span class="spd">${P.mode === 'fly' ? `속도 ${Math.round(P.flySpeed * 3.6)} km/h · 휠로 조절` : 'Shift 달리기' + keys}</span>`;
    const tf = $('t-fly'); if (tf) { tf.textContent = P.mode === 'fly' ? '걷기' : '비행'; $('t-up').hidden = $('t-down').hidden = P.mode !== 'fly'; $('t-run').hidden = P.mode === 'fly'; }
  },

  update(dt) {
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.25;
      const P = Player.pos;
      let dn = DISTRICTS[0], dd = Infinity;
      for (const d of DISTRICTS) { const k = Math.hypot(d.x - P.x, d.z - P.z); if (k < dd) { dd = k; dn = d; } }
      const place = Places.nearest(P.x, P.z, 900);
      this.placeName = place ? place.name : dn.n;
      $('w-place').textContent = this.placeName;
      const st = Transit.ready ? Transit.nearestStation(P.x, P.z, 3000) : null;
      if (st) {
        const d = Math.hypot(st.x - P.x, st.z - P.z);
        const badges = st.lines.map((o) => `<span class="badge" style="background:${o.line.color}">${o.line.short}</span>`).join('');
        $('w-near').innerHTML = `${badges}<span>${st.name}역 ${fmtDist(d)}</span>`;
        this.nearText = `${st.name}역 ${fmtDist(d)}`;
      } else { $('w-near').innerHTML = `<span>${place ? dn.n : Transit.msg || ''}</span>`; this.nearText = dn.n; }
      $('w-alt').textContent = `해발 ${Math.round(Player.pos.y + (Player.mode === 'walk' ? Player.eye : 0))} m`;
      $('w-ll').textContent = `${GEO.lat(P.z).toFixed(4)}, ${GEO.lon(P.x).toFixed(4)}`;
      // 상태
      const pend = Terrain.pending() + Net.queue.length + Net.active + City.buildQueue.length;
      const st2 = $('status');
      if (pend > 0 || Net.lastError) { st2.hidden = false; st2.textContent = Net.lastError ? `${Net.lastError} · 다시 시도 중` : `지도 불러오는 중 · 남은 작업 ${pend}`; }
      else st2.hidden = true;
      // 명소 카드
      const near = Places.nearest(P.x, P.z, 260);
      if (near && Player.mode !== 'ride') {
        $('info').hidden = false;
        $('i-cat').textContent = `${CATS[near.cat].name} · ${near.city}`;
        $('i-name').textContent = near.name;
        $('i-desc').textContent = near.desc;
        const ns = Transit.ready ? Transit.nearestStation(near.wx, near.wz, 2500) : null;
        $('i-meta').innerHTML = ns ? `가까운 역 ${ns.lines.map((o) => `<span class="badge" style="background:${o.line.color}">${o.line.short}</span>`).join('')} ${ns.name} · ${fmtDist(Math.hypot(ns.x - near.wx, ns.z - near.wz))}` : '';
      } else $('info').hidden = true;
      // 상호작용 안내
      const act = Game.actionHere();
      const pr = $('prompt');
      if (act && G.state === 'play') { pr.hidden = G.touch; pr.innerHTML = `<kbd>E</kbd>${act.label}`; $('t-use').hidden = !G.touch; $('t-use').textContent = act.short || '타기'; }
      else { pr.hidden = true; $('t-use').hidden = true; }
    }
    this.mapT -= dt;
    if (this.mapT <= 0) { this.mapT = 0.12; this.drawMinimap(); }
    this.updateVRBanner(dt);
  },

  drawMinimap() {
    const g = this.mm, S = 320, P = Player.pos;
    const scale = Player.mode === 'fly' ? clamp(0.12 * 300 / Math.max(300, Player.alt()), 0.008, 0.12) : 0.32; // px per m
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, TAU); g.clip();
    g.fillStyle = '#082030'; g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    g.rotate(-Player.heading());
    g.scale(scale, scale);
    g.translate(-P.x, -P.z);
    // 도로
    g.strokeStyle = 'rgba(220,230,240,0.55)'; g.lineWidth = 6 / scale * 0.35;
    g.beginPath();
    const lim = S / scale;
    for (const w of Traffic.ways.values()) {
      const a = w.pts[0]; if (Math.abs(a.x - P.x) > lim || Math.abs(a.z - P.z) > lim) continue;
      g.moveTo(a.x, a.z); for (let i = 1; i < w.pts.length; i++) g.lineTo(w.pts[i].x, w.pts[i].z);
    }
    g.stroke();
    // 지하철
    if (Transit.ready) for (const l of Transit.lines) {
      g.strokeStyle = l.color; g.lineWidth = 3.2 / scale; g.beginPath();
      l.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z))); g.stroke();
      g.fillStyle = '#fff';
      for (const s of l.stops) { g.beginPath(); g.arc(s.x, s.z, 3.5 / scale, 0, TAU); g.fill(); }
    }
    for (const p of PLACES) { g.fillStyle = CATS[p.cat].color; g.beginPath(); g.arc(p.wx, p.wz, 5 / scale, 0, TAU); g.fill(); }
    for (const s of City.stops) { if (Math.abs(s.x - P.x) > lim) continue; g.fillStyle = '#3a8aff'; g.fillRect(s.x - 2 / scale, s.z - 2 / scale, 4 / scale, 4 / scale); }
    g.restore();
    g.fillStyle = '#ffb43a'; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(S / 2, S / 2 - 13); g.lineTo(S / 2 + 9, S / 2 + 10); g.lineTo(S / 2, S / 2 + 5); g.lineTo(S / 2 - 9, S / 2 + 10); g.closePath(); g.stroke(); g.fill();
    g.save(); g.translate(S / 2, S / 2); g.rotate(-Player.heading()); g.fillStyle = '#eef4f8'; g.font = '700 24px "Gothic A1", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', 0, -S / 2 + 20); g.restore();
  },

  ride(info) {
    const el = $('ride');
    if (!info) { el.hidden = true; return; }
    el.hidden = false;
    if (info.kind === 'subway') {
      const l = info.line, a = info.a;
      const term = a.dir > 0 ? l.stops[l.stops.length - 1].name : l.stops[0].name;
      const here = a.phase === 'dwell';
      const st = here ? l.stops[a.idx] : l.stops[a.next];
      $('r-top').innerHTML = `<span class="badge" style="background:${l.color}">${l.short}</span><span>${l.name} · ${term} 방면</span>`;
      $('r-next').innerHTML = `${here ? '이번 역' : '다음 역'} ${st ? st.name : ''}<small>${here ? (Ride.canExit() ? 'E로 내리기' : '') : ''}</small>`;
      const strip = $('r-strip'); strip.style.color = l.color;
      const from = Math.max(0, Math.min(a.idx, l.stops.length - 1) - (a.dir > 0 ? 1 : 4)), arr = [];
      for (let k = -2; k <= 4; k++) { const i = a.idx + k * a.dir; if (i < 0 || i >= l.stops.length) continue; arr.push(`<b class="${i === a.idx ? 'here' : ''}" title="${l.stops[i].name}"></b>`); }
      strip.innerHTML = arr.join('<i></i>'); void from;
    } else {
      const r = info.route, a = info.a;
      const st = a.phase === 'dwell' ? r.stops[a.cur ?? r.startStop] : r.stops[a.nextStop];
      $('r-top').innerHTML = `<span class="badge" style="background:${r.colour || '#2a6ad0'}">${r.ref}</span><span>${r.to} 방향</span>`;
      $('r-next').innerHTML = `${a.phase === 'dwell' ? '이번 정류장' : '다음 정류장'} ${st ? st.name : ''}<small>${a.phase === 'dwell' ? 'E로 내리기' : `${Math.round(a.speed * 3.6)} km/h`}</small>`;
      $('r-strip').innerHTML = '';
    }
  },

  toast(text, color) {
    const d = document.createElement('div'); d.className = 'toast'; d.textContent = text; if (color) d.style.borderLeftColor = color;
    $('toasts').prepend(d);
    while ($('toasts').children.length > 5) $('toasts').lastChild.remove();
    setTimeout(() => { d.style.transition = 'opacity .5s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 500); }, 4200);
    if (G.xr) this.vrBanner(text, '', 2500, true);
  },
  banner(t, s, ms = 2500) {
    const b = $('banner'); b.children[0].textContent = t; b.children[1].textContent = s || ''; b.style.opacity = '1';
    clearTimeout(this._bt); this._bt = setTimeout(() => { b.style.opacity = '0'; }, ms);
    if (G.xr) this.vrBanner(t, s, ms);
  },

  // ---------------------------------------------------------------- 메뉴
  openMenu(builder) {
    if (!this.stack.length) this.prev = G.state === 'menu' ? 'play' : G.state;
    this.stack.push(builder); this.focus = 0;
    G.state = 'menu';
    if (document.pointerLockElement) document.exitPointerLock();
    this.render();
  },
  back() { this.stack.pop(); if (!this.stack.length) this.closeMenu(); else this.render(); },
  closeMenu() {
    this.stack = [];
    $('menu').hidden = true;
    if (this.vr) this.vr.mesh.visible = false;
    if (Player.ctrls) for (const c of Player.ctrls) c.userData.ray.visible = false;
    G.state = this.prev === 'title' ? 'title' : 'play';
  },
  refresh() { if (this.stack.length) this.render(true); },
  render(keep) {
    const def = this.stack[this.stack.length - 1]();
    const items = def.items.filter(Boolean);
    this.cur = def; this.items = items;
    if (!keep) { this.focus = items.findIndex((i) => i.onSelect && !i.disabled); if (this.focus < 0) this.focus = 0; }
    if (G.xr) { this.renderVR(def, items); return; }
    $('menu').hidden = false;
    $('menutitle').textContent = def.title; $('menusub').textContent = def.sub || '';
    $('menufoot').textContent = G.touch ? '항목을 누르세요' : '↑↓ 선택 · Enter 확인 · Esc 뒤로';
    const tabs = $('menutabs'); tabs.innerHTML = '';
    tabs.hidden = !def.tabs;
    for (const t of def.tabs || []) { const b = document.createElement('button'); b.type = 'button'; b.textContent = t.label; if (t.on) b.className = 'on'; b.addEventListener('click', () => { t.onSelect(); this.refresh(); }); tabs.appendChild(b); }
    const list = $('menulist'), sc = list.scrollTop; list.innerHTML = '';
    items.forEach((it, i) => {
      if (!it.onSelect) { const p = document.createElement('div'); p.className = 'text' + (it.head ? ' head' : ''); p.textContent = it.text ?? it.label; list.appendChild(p); return; }
      const b = document.createElement('button'); b.type = 'button'; b.className = 'item' + (i === this.focus ? ' focus' : ''); b.id = 'mi' + i; b.disabled = !!it.disabled;
      b.innerHTML = `<span class="ic">${it.icon || ''}</span><span class="l"></span><span class="r"></span>${it.detail ? '<span class="d"></span>' : ''}`;
      b.querySelector('.l').textContent = it.label; b.querySelector('.r').textContent = it.right || '';
      if (it.detail) b.querySelector('.d').textContent = it.detail;
      b.addEventListener('click', () => { this.focus = i; this.select(); });
      b.addEventListener('mouseenter', () => { this.focus = i; this.mark(); });
      list.appendChild(b);
    });
    if (keep) list.scrollTop = sc;
  },
  mark() { document.querySelectorAll('#menulist .item').forEach((b) => b.classList.toggle('focus', b.id === 'mi' + this.focus)); const f = $('mi' + this.focus); if (f) f.scrollIntoView({ block: 'nearest' }); },
  select() { const it = this.items[this.focus]; if (!it || !it.onSelect || it.disabled) return; it.onSelect(); if (this.stack.length && !it.keep) this.refresh(); },
  menuKey(e) {
    if (G.state !== 'menu' || G.xr) return;
    const step = (d) => { let i = this.focus; for (let k = 0; k < this.items.length; k++) { i = (i + d + this.items.length) % this.items.length; if (this.items[i].onSelect && !this.items[i].disabled) break; } this.focus = i; this.mark(); };
    if (e.code === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.code === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.code === 'Enter') { e.preventDefault(); this.select(); }
    else if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); this.back(); }
  },

  // VR 메뉴 패널 (오른손 광선으로 고르고 트리거로 누른다)
  renderVR(def, items) {
    if (!this.vr) {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 860;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.05), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false }));
      mesh.renderOrder = 60; R.scene.add(mesh);
      this.vr = { c, tex, mesh, page: 0, rows: [], hover: -1, nav: [] };
    }
    const V = this.vr;
    if (!V.mesh.visible) {
      const cam = R.renderer.xr.getCamera(); const h = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld); const f = Player.forward();
      V.mesh.position.set(h.x + f[0] * 1.4, h.y - 0.1, h.z + f[1] * 1.4); V.mesh.lookAt(h.x, h.y - 0.1, h.z); V.mesh.visible = true; V.page = 0;
    }
    if (Player.ctrls) for (const c of Player.ctrls) c.userData.ray.visible = true;
    V.def = def; V.items = items; this.drawVR();
  },
  drawVR() {
    const V = this.vr, g = V.c.getContext('2d'), W = 1024, H = 860, per = 8;
    const sel = V.items.filter((i) => i.onSelect || i.head);
    const tabs = V.def.tabs || [];
    const pages = Math.max(1, Math.ceil(sel.length / per)); V.page = clamp(V.page, 0, pages - 1);
    const rows = sel.slice(V.page * per, V.page * per + per);
    g.fillStyle = 'rgba(7,19,30,0.96)'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffb43a'; g.fillRect(0, 0, 12, H);
    g.fillStyle = '#eef4f8'; g.font = '400 48px "Black Han Sans", sans-serif'; g.textBaseline = 'middle'; g.fillText(V.def.title, 40, 52);
    V.rows = []; V.tabs = [];
    let y = 96;
    if (tabs.length) {
      let x = 40; g.font = '600 24px "Gothic A1", sans-serif';
      for (const t of tabs) { const w = g.measureText(t.label).width + 28; const hov = V.hover === 200 + V.tabs.length; g.fillStyle = t.on ? '#ffb43a' : hov ? 'rgba(255,180,58,0.3)' : 'rgba(255,255,255,0.08)'; g.fillRect(x, y, w, 40); g.fillStyle = t.on ? '#06121c' : '#eef4f8'; g.fillText(t.label, x + 14, y + 20); V.tabs.push({ x0: x, x1: x + w, y0: y, y1: y + 40, t }); x += w + 8; if (x > W - 120) break; }
      y += 54;
    }
    for (const it of rows) {
      const h = it.detail ? 78 : 60, idx = V.rows.length;
      if (it.onSelect && !it.disabled && V.hover === idx) { g.fillStyle = 'rgba(255,180,58,0.18)'; g.fillRect(24, y, W - 48, h - 4); }
      g.globalAlpha = it.disabled ? 0.4 : 1;
      g.fillStyle = it.head ? '#ffb43a' : '#eef4f8'; g.font = (it.head ? '700 24px' : '600 30px') + ' "Gothic A1", sans-serif';
      g.fillText(String(it.text ?? it.label).slice(0, 40), 44, y + 26);
      if (it.right) { g.textAlign = 'right'; g.fillStyle = '#ffb43a'; g.font = '600 24px "Gothic A1", sans-serif'; g.fillText(it.right, W - 44, y + 26); g.textAlign = 'left'; }
      if (it.detail) { g.fillStyle = '#93a7b8'; g.font = '400 22px "Gothic A1", sans-serif'; g.fillText(it.detail.slice(0, 56), 44, y + 58); }
      g.globalAlpha = 1;
      V.rows.push({ y0: y, y1: y + h, it: it.onSelect && !it.disabled ? it : null }); y += h;
    }
    const ny = H - 70; V.nav = [];
    const btn = (label, x, w, fn) => { const hov = V.hover === 100 + V.nav.length; g.fillStyle = hov ? 'rgba(255,180,58,0.3)' : 'rgba(255,255,255,0.08)'; g.fillRect(x, ny, w, 54); g.fillStyle = '#eef4f8'; g.font = '600 26px "Gothic A1", sans-serif'; g.textAlign = 'center'; g.fillText(label, x + w / 2, ny + 27); g.textAlign = 'left'; V.nav.push({ x0: x, x1: x + w, fn }); };
    if (pages > 1) { btn('◀ 이전', 30, 200, () => { V.page--; this.drawVR(); }); btn('다음 ▶', 794, 200, () => { V.page++; this.drawVR(); }); }
    btn(this.stack.length > 1 ? '뒤로' : '닫기', 412, 200, () => this.back());
    V.tex.needsUpdate = true;
  },
  updateVRMenu() {
    if (!G.xr || G.state !== 'menu' || !this.vr || !this.vr.mesh.visible) return;
    const c = Player.rightCtrl || (Player.ctrls && Player.ctrls[0]); if (!c) return;
    const o = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld), d = new THREE.Vector3(0, 0, -1).transformDirection(c.matrixWorld);
    const hit = new THREE.Raycaster(o, d).intersectObject(this.vr.mesh)[0];
    let hov = -1;
    if (hit && hit.uv) {
      const px = hit.uv.x * 1024, py = (1 - hit.uv.y) * 860;
      if (py > 860 - 70) this.vr.nav.forEach((n, i) => { if (px >= n.x0 && px <= n.x1) hov = 100 + i; });
      else { this.vr.tabs.forEach((t, i) => { if (px >= t.x0 && px <= t.x1 && py >= t.y0 && py <= t.y1) hov = 200 + i; }); if (hov < 0) this.vr.rows.forEach((r, i) => { if (r.it && py >= r.y0 && py < r.y1) hov = i; }); }
    }
    if (hov !== this.vr.hover) { this.vr.hover = hov; this.drawVR(); }
  },
  vrSelect() {
    const V = this.vr; if (!V || V.hover < 0) return;
    if (V.hover >= 200) { V.tabs[V.hover - 200].t.onSelect(); this.refresh(); return; }
    if (V.hover >= 100) { V.nav[V.hover - 100].fn(); return; }
    const r = V.rows[V.hover]; if (r && r.it) { r.it.onSelect(); if (this.stack.length && !r.it.keep) this.refresh(); }
  },
  vrBanner(t, s, ms, small) {
    if (!this._vb) { this._vb = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })); this._vb.renderOrder = 70; R.scene.add(this._vb); }
    const c = document.createElement('canvas'); c.width = 1024; c.height = 220; const g = c.getContext('2d');
    g.fillStyle = 'rgba(7,19,30,0.8)'; g.fillRect(0, 0, 1024, 220); g.textAlign = 'center'; g.fillStyle = '#fff';
    g.font = (small ? '600 46px' : '400 76px') + (small ? ' "Gothic A1"' : ' "Black Han Sans"') + ', sans-serif'; g.fillText(t.slice(0, 30), 512, small ? 120 : 100);
    if (s) { g.fillStyle = '#ffb43a'; g.font = '600 38px "Gothic A1", sans-serif'; g.fillText(s.slice(0, 40), 512, 178); }
    if (this._vb.material.map) this._vb.material.map.dispose();
    this._vb.material.map = new THREE.CanvasTexture(c); this._vb.material.map.colorSpace = THREE.SRGBColorSpace; this._vb.material.needsUpdate = true;
    this._vb.scale.set(1.6, 0.34, 1); this._vbT = ms / 1000;
  },
  updateVRBanner(dt) {
    if (!this._vb) return;
    this._vbT -= dt; this._vb.visible = G.xr && this._vbT > 0;
    if (this._vb.visible) { const cam = R.renderer.xr.getCamera(); const h = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld); const f = Player.forward(); this._vb.position.set(h.x + f[0] * 2, h.y + 0.3, h.z + f[1] * 2); }
  },

  // ---------------------------------------------------------------- 전체 지도
  map: { cx: 0, cz: 0, scale: 0.05, imgs: new Map(), drag: null },
  openMap() {
    if (G.xr) { Game.openPlaces(); return; }
    G.state = 'map';
    if (document.pointerLockElement) document.exitPointerLock();
    $('map').hidden = false;
    const M = this.map; M.cx = Player.pos.x; M.cz = Player.pos.z; M.scale = Player.mode === 'fly' ? 0.02 : 0.08;
    this.resizeMap(); this.drawMap();
  },
  closeMap() { $('map').hidden = true; G.state = 'play'; },
  resizeMap() { const c = $('mapc'); c.width = innerWidth * Math.min(2, devicePixelRatio || 1); c.height = innerHeight * Math.min(2, devicePixelRatio || 1); },
  initMap() {
    const c = $('mapc'), M = this.map;
    const dpr = () => c.width / innerWidth;
    const toWorld = (sx, sy) => ({ x: M.cx + (sx * dpr() - c.width / 2) / M.scale, z: M.cz + (sy * dpr() - c.height / 2) / M.scale });
    const pts = new Map();
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }); M.moved = false; });
    c.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      if (pts.size === 1) { M.cx -= (e.clientX - p.x) * dpr() / M.scale; M.cz -= (e.clientY - p.y) * dpr() / M.scale; }
      else if (pts.size === 2) { const o = [...pts.values()].find((q) => q !== p); const d0 = Math.hypot(p.x - o.x, p.y - o.y), d1 = Math.hypot(e.clientX - o.x, e.clientY - o.y); if (d0 > 0) M.scale = clamp(M.scale * d1 / d0, 0.002, 2); }
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6) M.moved = true;
      p.x = e.clientX; p.y = e.clientY; this.drawMap();
    });
    const up = (e) => {
      const p = pts.get(e.pointerId); pts.delete(e.pointerId);
      if (p && !M.moved && pts.size === 0) {
        const w = toWorld(e.clientX, e.clientY);
        // 가까운 명소를 눌렀으면 그 명소로
        let best = null, bd = 18 / M.scale * dpr();
        for (const pl of PLACES) { const d = Math.hypot(pl.wx - w.x, pl.wz - w.z); if (d < bd) { bd = d; best = pl; } }
        this.closeMap();
        if (best) Game.goPlace(best); else { Player.teleport(w.x, w.z); UI.toast(`순간이동: ${GEO.lat(w.z).toFixed(4)}, ${GEO.lon(w.x).toFixed(4)}`); }
        if (!G.touch) Game.lockPointer();
      }
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', (e) => pts.delete(e.pointerId));
    c.addEventListener('wheel', (e) => { e.preventDefault(); const before = toWorld(e.clientX, e.clientY); M.scale = clamp(M.scale * (e.deltaY > 0 ? 0.8 : 1.25), 0.002, 2); const after = toWorld(e.clientX, e.clientY); M.cx += before.x - after.x; M.cz += before.z - after.z; this.drawMap(); }, { passive: false });
    $('map-close').addEventListener('click', () => { this.closeMap(); if (!G.touch) Game.lockPointer(); });
    $('map-me').addEventListener('click', () => { M.cx = Player.pos.x; M.cz = Player.pos.z; M.scale = 0.08; this.drawMap(); });
    $('map-busan').addEventListener('click', () => { const p = GEO.toWorld(35.15, 129.06); M.cx = p.x; M.cz = p.z; M.scale = 0.012; this.drawMap(); });
    $('map-ulsan').addEventListener('click', () => { const p = GEO.toWorld(35.53, 129.32); M.cx = p.x; M.cz = p.z; M.scale = 0.012; this.drawMap(); });
    window.addEventListener('resize', () => { if (G.state === 'map') { this.resizeMap(); this.drawMap(); } });
  },
  drawMap() {
    const c = $('mapc'), g = c.getContext('2d'), M = this.map, W = c.width, H = c.height, dpr = W / innerWidth;
    g.fillStyle = '#041019'; g.fillRect(0, 0, W, H);
    // 위성 타일 (화면 축척에 맞는 줌)
    const mPerPx = 1 / M.scale;
    const z = clamp(Math.round(Math.log2((156543 * Math.cos(35.3 * DEG) * 0.82) / mPerPx)), 8, 17);
    const x0 = M.cx - W / 2 / M.scale, x1 = M.cx + W / 2 / M.scale, z0 = M.cz - H / 2 / M.scale, z1 = M.cz + H / 2 / M.scale;
    const tx0 = GEO.tileX(GEO.lon(x0), z), tx1 = GEO.tileX(GEO.lon(x1), z), ty0 = GEO.tileY(GEO.lat(z0), z), ty1 = GEO.tileY(GEO.lat(z1), z);
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) < 120) {
      for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
        const key = `${z}/${tx}/${ty}`;
        let im = M.imgs.get(key);
        if (!im) { im = { ok: false }; M.imgs.set(key, im); Net.image(Net.esri(z, tx, ty)).then((img) => { im.img = img; im.ok = true; if (G.state === 'map') this.drawMap(); }).catch(() => {}); if (M.imgs.size > 400) M.imgs.delete(M.imgs.keys().next().value); }
        if (!im.ok) continue;
        const b = GEO.tileBounds(z, tx, ty);
        g.drawImage(im.img, (b.x0 - M.cx) * M.scale + W / 2, (b.z0 - M.cz) * M.scale + H / 2, (b.x1 - b.x0) * M.scale + 1, (b.z1 - b.z0) * M.scale + 1);
      }
    }
    const sx = (x) => (x - M.cx) * M.scale + W / 2, sy = (zz) => (zz - M.cz) * M.scale + H / 2;
    if (Transit.ready) for (const l of Transit.lines) {
      g.strokeStyle = l.color; g.lineWidth = 4 * dpr; g.beginPath(); l.pts.forEach((p, i) => (i ? g.lineTo(sx(p.x), sy(p.z)) : g.moveTo(sx(p.x), sy(p.z)))); g.stroke();
      if (M.scale > 0.02) for (const s of l.stops) { g.fillStyle = '#fff'; g.strokeStyle = l.color; g.lineWidth = 2 * dpr; g.beginPath(); g.arc(sx(s.x), sy(s.z), 4 * dpr, 0, TAU); g.fill(); g.stroke(); }
    }
    g.textAlign = 'left'; g.textBaseline = 'middle';
    for (const p of PLACES) {
      const x = sx(p.wx), y = sy(p.wz); if (x < -50 || y < -50 || x > W + 50 || y > H + 50) continue;
      g.fillStyle = CATS[p.cat].color; g.strokeStyle = '#000'; g.lineWidth = 2 * dpr;
      g.beginPath(); g.arc(x, y, 6 * dpr, 0, TAU); g.fill(); g.stroke();
      if (M.scale > 0.006) { g.font = `600 ${13 * dpr}px "Gothic A1", sans-serif`; g.lineWidth = 4 * dpr; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.strokeText(p.name, x + 10 * dpr, y); g.fillStyle = '#fff'; g.fillText(p.name, x + 10 * dpr, y); }
    }
    // 내 위치
    const px = sx(Player.pos.x), py = sy(Player.pos.z);
    g.save(); g.translate(px, py); g.rotate(Player.heading()); g.fillStyle = '#ffb43a'; g.strokeStyle = '#000'; g.lineWidth = 2 * dpr;
    g.beginPath(); g.moveTo(0, -14 * dpr); g.lineTo(10 * dpr, 10 * dpr); g.lineTo(0, 4 * dpr); g.lineTo(-10 * dpr, 10 * dpr); g.closePath(); g.fill(); g.stroke(); g.restore();
    // 축척 막대
    const m = Math.pow(10, Math.floor(Math.log10(160 / M.scale / dpr))), len = m * M.scale;
    g.fillStyle = '#fff'; g.fillRect(W - len - 24 * dpr, H - 30 * dpr, len, 4 * dpr); g.font = `600 ${12 * dpr}px "Gothic A1", sans-serif`; g.textAlign = 'right'; g.fillText(fmtDist(m), W - 24 * dpr, H - 42 * dpr);
  },

  // ---------------------------------------------------------------- 터치
  initTouch() {
    const pad = $('tpad'), knob = $('tknob');
    let id = null, cx = 0, cy = 0;
    pad.addEventListener('pointerdown', (e) => { id = e.pointerId; const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; pad.setPointerCapture(id); mv(e); e.preventDefault(); });
    const mv = (e) => { if (e.pointerId !== id) return; let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy), m = 50; if (l > m) { dx = dx / l * m; dy = dy / l * m; } Input.joy.x = dx / m; Input.joy.y = dy / m; knob.style.transform = `translate(${dx}px,${dy}px)`; };
    pad.addEventListener('pointermove', mv);
    const end = (e) => { if (e.pointerId !== id) return; id = null; Input.joy.x = Input.joy.y = 0; knob.style.transform = ''; };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    const view = $('view'); let lid = null, lx = 0, ly = 0;
    view.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' || lid !== null) return; lid = e.pointerId; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('pointermove', (e) => { if (e.pointerId !== lid) return; Input.lookDX += e.clientX - lx; Input.lookDY += e.clientY - ly; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('pointerup', (e) => { if (e.pointerId === lid) lid = null; });
    const bind = (bid, down, up) => { const b = $(bid); b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); down(); }); const u = () => { b.classList.remove('on'); if (up) up(); }; b.addEventListener('pointerup', u); b.addEventListener('pointercancel', u); b.addEventListener('pointerleave', u); };
    bind('t-up', () => { Input.touchUp = true; }, () => { Input.touchUp = false; });
    bind('t-down', () => { Input.touchDown = true; }, () => { Input.touchDown = false; });
    bind('t-run', () => { Input.touchRun = !Input.touchRun; $('t-run').classList.toggle('on', Input.touchRun); });
    bind('t-fly', () => Player.setMode(Player.mode === 'fly' ? 'walk' : 'fly'));
    bind('t-use', () => Game.useAction());
    bind('t-map', () => this.openMap());
    bind('t-menu', () => Game.openMenu());
  },
};

// ---------------------------------------------------------------------------
// 명소: 월드 좌표 계산, 3D 이름표, OSM 이름으로 위치 보정
// ---------------------------------------------------------------------------
const Places = {
  init() {
    for (const p of PLACES) { const w = GEO.toWorld(p.lat, p.lon); p.wx = w.x; p.wz = w.z; p.snapped = false; }
  },
  nearest(x, z, max) { let best = null, bd = max; for (const p of PLACES) { const d = Math.hypot(p.wx - x, p.wz - z); if (d < bd) { bd = d; best = p; } } return best; },
  onNames() {
    for (const p of PLACES) {
      if (p.snapped) continue;
      const n = City.findName(p.q, p.wx, p.wz, 2200);
      if (n) { p.wx = n.x; p.wz = n.z; p.snapped = true; if (p.label) p.label.userData.y = null; }
    }
  },
  update() {
    const P = Player.pos;
    const show = G.settings.labels && !(Ride.active && R.world.visible === false);
    for (const p of PLACES) {
      const d = Math.hypot(p.wx - P.x, p.wz - P.z);
      const vis = show && d < (Player.mode === 'fly' ? 25000 : 5000) && (d > 160 || Player.alt() > 60);
      if (vis && !p.label) { p.label = Label.make(p.name, CATS[p.cat].color, CATS[p.cat].name); R.scene.add(p.label); }
      if (!p.label) continue;
      p.label.visible = vis;
      if (!vis) continue;
      const gy = Math.max(Terrain.heightAt(p.wx, p.wz), 0);
      p.label.position.set(p.wx, gy + 18 + Math.min(d * 0.02, 120), p.wz);
      Label.size(p.label, clamp(0.06 - d / 200000, 0.025, 0.06) * (G.xr ? 0.6 : 1));
    }
  },
};
