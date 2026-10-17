// ---------------------------------------------------------------------------
// 화면: 방 정보 카드, 평면도, 하단 기능 막대와 패널, 자막, 알림, 줄자, 가구 옮기기,
// 사진, 도움말, VR 손목 메뉴
// ---------------------------------------------------------------------------
const UI = {
  panelKey: null, lastRoom: null, dim: 1, temp: 'warm',

  init() {
    for (const b of $('dock').querySelectorAll('.dk')) b.addEventListener('click', (e) => { e.stopPropagation(); b.blur(); Sound.init(); this.dock(b.dataset.k); }); // 포커스를 남기면 걷는 중 Space·Enter가 버튼을 누른다
    $('plan-size').addEventListener('click', (e) => { e.stopPropagation(); $('plan').classList.toggle('big'); $('plan-size').textContent = $('plan').classList.contains('big') ? '작게' : '크게'; this.drawPlan(); });
    $('planc').addEventListener('click', (e) => this.planClick(e));
    $('help-close').addEventListener('click', () => { $('help').hidden = true; });
    $('help-t').innerHTML = [
      ['이동', 'WASD 또는 방향키 · Shift 빠르게 · 터치는 왼쪽 원'],
      ['둘러보기', '화면을 누르면 마우스로 시점 고정 · 터치는 화면 끌기'],
      ['조작', '가운데 점을 문·스위치·커튼·가전에 맞추고 클릭 또는 E'],
      ['앉기', 'C (소파·침대 높이 눈높이로)'],
      ['인형집 뷰', 'V 또는 아래 막대의 인형집 · 끌어서 돌리기, 휠 확대, 바닥을 누르면 그곳으로 이동'],
      ['평면도', '오른쪽 위 평면도를 누르면 그 자리로 이동'],
      ['가이드 투어', 'T · 11곳을 차례로 소개 · Esc로 멈춤'],
      ['줄자', 'M · 두 점을 차례로 눌러 거리 재기 · 우클릭이나 Esc로 끝내기'],
      ['가구 옮기기', 'G · 가구를 눌러 들고, 놓을 곳을 눌러 내려놓기 · Q/E 또는 휠로 회전 · R 원래대로'],
      ['스타일·시간', '1~4 인테리어 스타일 · 5~8 아침·낮·노을·밤'],
      ['사진', 'P · 지금 보이는 장면을 PNG로 저장'],
      ['VR', '왼쪽 스틱 걷기 · 오른쪽 스틱 좌우 30° 회전, 앞으로 밀었다 놓으면 순간이동 · 트리거로 조작 · A/X 메뉴 · B 불 켜기/끄기'],
    ].map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
    this.planBase = null;
  },
  show(on) { $('hud').hidden = !on; if (G.touch) $('touch').hidden = !on; if (HOST) $('ui').hidden = !on; },

  toast(text) {
    const d = document.createElement('div'); d.className = 'toast'; d.textContent = text;
    $('toasts').prepend(d);
    while ($('toasts').children.length > 4) $('toasts').lastChild.remove();
    setTimeout(() => { d.style.transition = 'opacity .5s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 500); }, 3800);
  },
  flash(color = '#fff', dur = 0.35) {
    const f = $('flash'); f.style.background = color; f.style.transition = 'none'; f.style.opacity = '1';
    requestAnimationFrame(() => { f.style.transition = `opacity ${dur}s`; f.style.opacity = '0'; });
  },
  caption(t, d) {
    const c = $('caption');
    if (!t) { c.hidden = true; return; }
    c.hidden = false; $('cap-t').textContent = `${Tour.i + 1} / ${TOUR.length} · ${t}`; $('cap-d').textContent = d;
  },
  captionProgress(k) { $('cap-bar').style.width = `${k * 100}%`; },

  // ---------------- 하단 막대
  dock(k) {
    if (k === 'doll') { G.state === 'doll' ? Doll.exit() : (Tour.stop(), Doll.enter()); this.closePanel(); return; }
    if (k === 'tour') { Tour.active ? Tour.stop() : Tour.start(); this.closePanel(); return; }
    if (k === 'measure') { Tools.setMode(G.mode === 'measure' ? null : 'measure'); this.closePanel(); return; }
    if (k === 'edit') { Tools.setMode(G.mode === 'edit' ? null : 'edit'); this.closePanel(); return; }
    if (k === 'photo') { Tools.photo(); return; }
    if (k === 'vr') { HOST ? HOST.enterVR() : Game.enterVR(); return; }
    if (k === 'exit') { HOST.exit(); return; }
    if (k === 'help') { $('help').hidden = false; if (document.pointerLockElement) document.exitPointerLock(); return; }
    if (this.panelKey === k) { this.closePanel(); return; }
    this.openPanel(k);
  },
  closePanel() { this.panelKey = null; $('panel').hidden = true; this.markDock(); },
  markDock() {
    for (const b of $('dock').querySelectorAll('.dk')) {
      const k = b.dataset.k;
      b.classList.toggle('on', k === this.panelKey || (k === 'doll' && (G.state === 'doll')) || (k === 'tour' && Tour.active) || (k === 'measure' && G.mode === 'measure') || (k === 'edit' && G.mode === 'edit') || (k === 'sound' && this.panelKey === 'sound'));
    }
  },
  openPanel(k) {
    this.panelKey = k; const p = $('panel'); p.hidden = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.renderPanel();
    this.markDock();
  },
  renderPanel() {
    const k = this.panelKey, p = $('panel'); if (!k) return;
    const tile = (label, sub, on, fn, extra = '') => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tile' + (on ? ' on' : ''); b.innerHTML = `${extra}<span></span><small></small>`; b.querySelector('span').textContent = label; b.querySelector('small').textContent = sub || ''; b.addEventListener('click', (e) => { e.stopPropagation(); fn(); this.renderPanel(); }); return b; };
    p.innerHTML = '';
    const head = (t, s) => { const h = document.createElement('h3'); h.textContent = t; p.appendChild(h); if (s) { const d = document.createElement('p'); d.className = 'sub'; d.textContent = s; p.appendChild(d); } };
    const grid = () => { const g = document.createElement('div'); g.className = 'grid2'; p.appendChild(g); return g; };
    if (k === 'style') {
      head('인테리어 스타일', '마감재, 가구 색, 조명 색온도가 함께 바뀝니다. 키보드 1~4.');
      const g = grid();
      for (const key of STYLE_KEYS) { const s = STYLES[key]; g.appendChild(tile(s.name, s.desc, G.style === key, () => Game.setStyle(key), `<div class="sw">${s.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</div>`)); }
    } else if (k === 'time') {
      head('시간대', '해의 방향과 높이, 하늘색, 창밖 야경이 바뀝니다. 키보드 5~8.');
      const g = grid();
      const sub = { morning: '동쪽에서 낮게 드는 햇살', day: '남쪽 높이 뜬 해', sunset: '서쪽 하늘이 붉게', night: '단지 불빛과 별' };
      for (const key of TOD_KEYS) g.appendChild(tile(TOD[key].name, sub[key], G.tod === key, () => Game.setTime(key)));
    } else if (k === 'light') {
      head('조명', '방마다 켜고 끄거나, 밝기와 색온도를 바꿉니다. 벽 스위치를 눌러도 됩니다.');
      const row = document.createElement('div'); row.className = 'row';
      const allOn = Object.values(Build.lights).every((l) => l.on);
      const b1 = document.createElement('button'); b1.className = 'btn'; b1.type = 'button'; b1.textContent = allOn ? '모두 끄기' : '모두 켜기'; b1.onclick = (e) => { e.stopPropagation(); for (const z of Object.keys(ZONES)) Build.setZone(z, !allOn); this.renderPanel(); };
      row.appendChild(b1);
      const lab = document.createElement('label'); lab.className = 'row'; lab.innerHTML = '<small style="color:var(--muted)">밝기</small>';
      const sl = document.createElement('input'); sl.type = 'range'; sl.min = 20; sl.max = 100; sl.value = Math.round(this.dim * 100);
      sl.oninput = () => { this.dim = sl.value / 100; for (const [z, L] of Object.entries(Build.lights)) { L.dim = this.dim; if (L.on) Build.setZone(z, true); } };
      lab.appendChild(sl); row.appendChild(lab); p.appendChild(row);
      const temps = [['warm', '전구색 2700K', 0xffc890], ['neutral', '주백색 4000K', 0xffe8cc], ['cool', '주광색 6000K', 0xe8f0ff]];
      const tg = grid();
      for (const [key, name, col] of temps) tg.appendChild(tile(name, '', this.temp === key, () => { this.temp = key; Game.setLightColor(col); }));
      const sep = document.createElement('div'); sep.className = 'sep'; p.appendChild(sep);
      const g = grid();
      for (const [z, Z] of Object.entries(ZONES)) g.appendChild(tile(Z.name, Build.lights[z].on ? '켜짐' : '꺼짐', Build.lights[z].on, () => Build.setZone(z, !Build.lights[z].on)));
    } else if (k === 'home') {
      head('스마트홈', '월패드처럼 장면 모드를 고르거나 가전을 하나씩 켭니다.');
      const g = grid();
      const scenes = [
        ['귀가 모드', '현관·거실 불, 속커튼, 음악', () => Home.scene('home')], ['영화 모드', '불 끄고 암막, 간접조명, TV', () => Home.scene('movie')],
        ['취침 모드', '모두 끄고 안방 스탠드만', () => Home.scene('sleep')], ['외출 모드', '전부 끄고 로봇청소기 출발', () => Home.scene('away')],
        ['파티 모드', '모든 불과 음악, 색이 바뀌는 간접조명', () => Home.scene('party')], ['아침 모드', '커튼을 모두 걷고 주방 불', () => Home.scene('morning')],
      ];
      for (const [n, s, f] of scenes) g.appendChild(tile(n, s, Home.current === n, () => { f(); Home.current = n; }));
      const sep = document.createElement('div'); sep.className = 'sep'; p.appendChild(sep);
      const g2 = grid();
      const tv = Interior.tvs[0];
      g2.appendChild(tile('TV', tv.userData.on ? '켜짐' : '꺼짐', tv.userData.on, () => Interior.toggleTV(tv)));
      g2.appendChild(tile('에어컨', Interior.ac.userData.on ? '냉방 23°C' : '꺼짐', Interior.ac.userData.on, () => Interior.toggleAC()));
      g2.appendChild(tile('음악', Sound.music ? '재생 중' : '꺼짐', Sound.music, () => Sound.toggleMusic()));
      g2.appendChild(tile('로봇청소기', Interior.robot.on ? '청소 중' : '대기', Interior.robot.on, () => Interior.toggleRobot()));
      const anyClosed = Interior.curtains.some((c) => c.block < 0.5);
      g2.appendChild(tile('커튼 전체', anyClosed ? '닫힘' : '열림', anyClosed, () => anyClosed ? Interior.allCurtains(1, 1) : Interior.allCurtains(0, 0)));
      g2.appendChild(tile('컴퓨터', Interior.pcOn ? '켜짐' : '꺼짐', !!Interior.pcOn, () => Interior.togglePC()));
      const anyOpen = Build.doors.some((d) => d.open && d.id !== 'd-front');
      g2.appendChild(tile('실내 문 전체', anyOpen ? '열림' : '닫힘', anyOpen, () => { for (const d of Build.doors) if (d.id !== 'd-front') Interior.toggleDoor(d, !anyOpen); }));
    } else if (k === 'sound') {
      head('소리', '발소리, 문, 물, 에어컨, 음악까지 모두 브라우저에서 합성한 소리입니다.');
      const row = document.createElement('div'); row.className = 'row';
      const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = G.sound ? '소리 끄기' : '소리 켜기'; b.onclick = (e) => { e.stopPropagation(); G.sound = !G.sound; Sound.init(); Sound.setVolume(); saveSettings(); this.renderPanel(); };
      row.appendChild(b);
      const sl = document.createElement('input'); sl.type = 'range'; sl.min = 0; sl.max = 100; sl.value = Math.round(G.volume * 100); sl.oninput = () => { G.volume = sl.value / 100; Sound.setVolume(); saveSettings(); };
      row.appendChild(sl);
      const m = document.createElement('button'); m.className = 'btn'; m.type = 'button'; m.textContent = Sound.music ? '음악 끄기' : '음악 틀기'; m.onclick = (e) => { e.stopPropagation(); Sound.toggleMusic(); this.renderPanel(); };
      row.appendChild(m); p.appendChild(row);
    }
  },

  // ---------------- 방 정보 카드
  updateRoom() {
    const r = G.state === 'doll' ? null : Player.room();
    if (r === this.lastRoom) return; this.lastRoom = r;
    if (!r) { $('rc-name').textContent = '84㎡ 쓰리룸'; $('rc-area').innerHTML = `실사용 <b>${TOTAL_AREA.toFixed(1)}㎡</b> · 방 3 · 욕실 2`; $('rc-desc').textContent = LABEL.desc; return; }
    $('rc-name').textContent = r.name;
    $('rc-area').innerHTML = `<b>${roomArea(r).toFixed(1)}㎡</b> · ${pyeong(roomArea(r)).toFixed(1)}평 · ${(r.rect[2] - r.rect[0]).toFixed(1)} × ${(r.rect[3] - r.rect[1]).toFixed(1)} m`;
    $('rc-desc').textContent = r.desc;
  },
  updateHint() {
    const h = $('hint'), cr = $('cross');
    let txt = null;
    if (G.mode === 'measure') txt = Tools.measureHint();
    else if (G.mode === 'edit') txt = Tools.editHint();
    else if (Player.hover) txt = Player.hover.hint();
    cr.classList.toggle('hot', !!(Player.hover || (G.mode === 'edit' && Tools.editHover)));
    if (txt) { h.hidden = false; h.innerHTML = `<kbd>${G.touch ? '탭' : 'E'}</kbd>`; h.appendChild(document.createTextNode(txt)); } else h.hidden = true;
    cr.hidden = G.state !== 'walk';
    const m = $('mode');
    if (G.mode === 'measure') { m.hidden = false; m.innerHTML = '<b>줄자</b>두 점을 차례로 누르세요 · Esc로 끝내기'; }
    else if (G.mode === 'edit') { m.hidden = false; m.innerHTML = '<b>가구 옮기기</b>가구를 눌러 들고 놓을 곳을 누르세요 · Q/E 회전 · R 원래대로'; }
    else if (G.state === 'doll') { m.hidden = false; m.innerHTML = '<b>인형집</b>끌어서 돌리기 · 휠 확대 · 바닥을 누르면 그곳으로 · V로 돌아가기'; }
    else if (Tour.active) { m.hidden = false; m.innerHTML = '<b>가이드 투어</b>Esc 또는 이동 키로 멈춤'; }
    else m.hidden = true;
  },
  updateLights() { if (this.panelKey === 'light' || this.panelKey === 'home') this.renderPanel(); },
  onMode() { this.markDock(); this.lastRoom = undefined; },

  // ---------------- 평면도
  planView() { return { x0: -6.4, z0: -6.1, x1: 6.4, z1: 4.9 }; },
  planXY(x, z, W, Hh) { const v = this.planView(), s = Math.min(W / (v.x1 - v.x0), Hh / (v.z1 - v.z0)); return [(x - v.x0) * s + (W - (v.x1 - v.x0) * s) / 2, (z - v.z0) * s + (Hh - (v.z1 - v.z0) * s) / 2, s]; },
  drawPlan() {
    const c = $('planc'), big = $('plan').classList.contains('big');
    const W = big ? 1040 : 520, Hh = big ? 800 : 400;
    if (c.width !== W) { c.width = W; c.height = Hh; this.planBase = null; }
    if (!this.planBase) {
      const b = Tex.canvas(W, Hh), g = b.getContext('2d');
      g.fillStyle = '#16140f'; g.fillRect(0, 0, W, Hh);
      const fill = { wood: '#3b3127', tile: '#2c3236', stone: '#34312c' };
      for (const r of ROOMS) { const [x0, z0, x1, z1] = r.rect; const [a, bb] = this.planXY(x0, z0, W, Hh), [cc, d] = this.planXY(x1, z1, W, Hh); g.fillStyle = fill[r.floor]; g.fillRect(a, bb, cc - a, d - bb); }
      // 가구 윤곽
      g.fillStyle = 'rgba(216,178,124,0.16)'; g.strokeStyle = 'rgba(216,178,124,0.35)'; g.lineWidth = 1;
      for (const bx of Interior.boxes) { const [a, bb] = this.planXY(bx.x0, bx.z0, W, Hh), [cc, d] = this.planXY(bx.x1, bx.z1, W, Hh); g.fillRect(a, bb, cc - a, d - bb); g.strokeRect(a, bb, cc - a, d - bb); }
      // 벽
      g.fillStyle = '#e8e0d4';
      for (const bx of Build.colliders) { const [a, bb] = this.planXY(bx.x0, bx.z0, W, Hh), [cc, d] = this.planXY(bx.x1, bx.z1, W, Hh); g.fillRect(a, bb, Math.max(1, cc - a), Math.max(1, d - bb)); }
      // 창
      g.strokeStyle = '#7fb8e0'; g.lineWidth = big ? 4 : 2.5;
      for (const w of Build.windows) { const { o, alongX, c: cc } = w; const p0 = alongX ? this.planXY(o.s, cc, W, Hh) : this.planXY(cc, o.s, W, Hh), p1 = alongX ? this.planXY(o.e, cc, W, Hh) : this.planXY(cc, o.e, W, Hh); g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke(); }
      // 방 이름
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const r of ROOMS) { if (r.id === 'hall' || r.id === 'corridor') continue; const [x0, z0, x1, z1] = r.rect; const [a, bb] = this.planXY((x0 + x1) / 2, (z0 + z1) / 2, W, Hh); g.fillStyle = '#f4efe8'; g.font = `700 ${big ? 22 : 13}px "Noto Sans KR", sans-serif`; g.fillText(r.name, a, bb - (big ? 10 : 6)); g.fillStyle = '#b8afa4'; g.font = `400 ${big ? 16 : 10}px "Noto Sans KR", sans-serif`; g.fillText(`${roomArea(r).toFixed(1)}㎡`, a, bb + (big ? 14 : 8)); }
      // 방위
      g.fillStyle = '#d8b27c'; g.font = `700 ${big ? 18 : 11}px sans-serif`; g.fillText('N ↑', W - (big ? 40 : 22), big ? 26 : 14);
      this.planBase = b;
    }
    const g = c.getContext('2d');
    g.drawImage(this.planBase, 0, 0);
    // 문 (열림 상태가 바뀌므로 매번)
    g.strokeStyle = '#d8b27c'; g.lineWidth = big ? 2.5 : 1.5;
    for (const d of Build.doors) {
      const { o, alongX, c: cc } = d.info, mid = (o.s + o.e) / 2;
      const [a, bb] = alongX ? this.planXY(mid, cc, W, Hh) : this.planXY(cc, mid, W, Hh);
      g.fillStyle = d.open ? 'rgba(143,214,165,0.9)' : 'rgba(216,178,124,0.9)'; g.beginPath(); g.arc(a, bb, big ? 5 : 3, 0, TAU); g.fill();
    }
    // 나
    const [px, py] = this.planXY(Player.pos.x, Player.pos.z, W, Hh);
    const f = Player.forward(), ang = Math.atan2(f.z, f.x);
    const grd = g.createRadialGradient(px, py, 2, px, py, big ? 90 : 46); grd.addColorStop(0, 'rgba(240,211,164,0.45)'); grd.addColorStop(1, 'rgba(240,211,164,0)');
    g.fillStyle = grd; g.beginPath(); g.moveTo(px, py); g.arc(px, py, big ? 90 : 46, ang - 0.6, ang + 0.6); g.closePath(); g.fill();
    g.fillStyle = '#f0d3a4'; g.strokeStyle = '#16140f'; g.lineWidth = 2; g.beginPath(); g.arc(px, py, big ? 8 : 5, 0, TAU); g.fill(); g.stroke();
    if (Interior.robot.on) { const [rx, ry] = this.planXY(Interior.robot.g.position.x, Interior.robot.g.position.z, W, Hh); g.fillStyle = '#4cd964'; g.beginPath(); g.arc(rx, ry, big ? 5 : 3, 0, TAU); g.fill(); }
  },
  planClick(e) {
    const c = $('planc'), r = c.getBoundingClientRect();
    const sx = (e.clientX - r.left) / r.width * c.width, sy = (e.clientY - r.top) / r.height * c.height;
    const [, , s] = this.planXY(0, 0, c.width, c.height), [ox, oy] = this.planXY(0, 0, c.width, c.height);
    const x = (sx - ox) / s, z = (sy - oy) / s;
    if (!roomAt(x, z) || Physics.blocked(x, z, 0.2)) { this.toast('그 자리에는 설 수 없습니다. 방 안의 빈 곳을 눌러 주세요.'); return; }
    if (Tour.active) Tour.stop();
    if (G.state === 'doll') Doll.exit(x, z); else { Player.teleport(x, z); UI.flash('#000', 0.25); }
  },

  // ---------------- VR 손목 메뉴: 왼손 위 캔버스 판
  toggleVRMenu() {
    const X = Player.xr; X.menu = !X.menu;
    if (!this.vrPanel) {
      const c = Tex.canvas(1024, 768); this.vrCanvas = c; this.vrTex = Tex.tex(c);
      this.vrPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshBasicMaterial({ map: this.vrTex, transparent: true, depthTest: false }));
      this.vrPanel.renderOrder = 40;
    }
    const left = Player.xrHand('left') || X.ctrls[0];
    if (X.menu && left) { left.add(this.vrPanel); this.vrPanel.position.set(0, 0.18, -0.12); this.vrPanel.rotation.set(-0.7, 0, 0); this.vrPanel.visible = true; this.drawVR(); }
    else if (this.vrPanel) this.vrPanel.visible = false;
  },
  vrButtons() {
    const B = [];
    const add = (label, x, y, w, h, on, fn) => B.push({ label, x, y, w, h, on, fn });
    STYLE_KEYS.forEach((k, i) => add(STYLES[k].name, 30 + i * 245, 110, 230, 90, G.style === k, () => Game.setStyle(k)));
    TOD_KEYS.forEach((k, i) => add(TOD[k].name, 30 + i * 245, 270, 230, 90, G.tod === k, () => Game.setTime(k)));
    const allOn = Object.values(Build.lights).every((l) => l.on);
    add(allOn ? '불 모두 끄기' : '불 모두 켜기', 30, 430, 310, 90, allOn, () => { for (const z of Object.keys(ZONES)) Build.setZone(z, !allOn); });
    add('영화 모드', 357, 430, 310, 90, Home.current === '영화 모드', () => { Home.scene('movie'); Home.current = '영화 모드'; });
    add('파티 모드', 684, 430, 310, 90, Home.current === '파티 모드', () => { Home.scene('party'); Home.current = '파티 모드'; });
    add(Sound.music ? '음악 끄기' : '음악 틀기', 30, 560, 310, 90, Sound.music, () => Sound.toggleMusic());
    const anyClosed = Interior.curtains.some((c) => c.block < 0.5);
    add(anyClosed ? '커튼 걷기' : '커튼 치기', 357, 560, 310, 90, anyClosed, () => anyClosed ? Interior.allCurtains(1, 1) : Interior.allCurtains(0, 0));
    add('닫기', 684, 560, 310, 90, false, () => this.toggleVRMenu());
    return B;
  },
  drawVR() {
    const g = this.vrCanvas.getContext('2d');
    g.clearRect(0, 0, 1024, 768);
    g.fillStyle = 'rgba(18,16,14,0.92)'; g.beginPath(); g.roundRect(0, 0, 1024, 768, 40); g.fill();
    g.fillStyle = '#d8b27c'; g.font = '700 30px "Noto Sans KR", sans-serif'; g.textBaseline = 'middle';
    g.fillText('인테리어 스타일', 34, 70); g.fillText('시간대', 34, 232); g.fillText('스마트홈', 34, 394);
    this.vrB = this.vrButtons();
    this.vrB.forEach((b, i) => {
      g.fillStyle = b.on ? '#d8b27c' : this.vrHot === i ? 'rgba(216,178,124,0.35)' : 'rgba(255,255,255,0.08)';
      g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 22); g.fill();
      g.fillStyle = b.on ? '#1b140c' : '#f4efe8'; g.font = '600 34px "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2); g.textAlign = 'left';
    });
    this.vrTex.needsUpdate = true;
  },
  vrHover(uv) {
    const x = uv.x * 1024, y = (1 - uv.y) * 768;
    const i = (this.vrB || []).findIndex((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (i !== this.vrHot) { this.vrHot = i; this.drawVR(); }
  },
  vrMenuSelect() {
    if (!this.vrPanel || !this.vrPanel.visible || this.vrHot < 0 || this.vrHot === undefined) return false;
    const b = this.vrB[this.vrHot]; if (!b) return false;
    Sound.click(); b.fn(); if (this.vrPanel.visible) this.drawVR();
    return true;
  },
  // B 버튼: 지금 있는 방 불 켜기/끄기
  vrQuick() { const r = Player.room(); if (!r) return; const L = Build.lights[r.zone]; Build.setZone(r.zone, !L.on); Sound.click(); },
};

// ---------------------------------------------------------------------------
// 스마트홈 장면 모드
// ---------------------------------------------------------------------------
const Home = {
  current: null, party: false,
  scene(k) {
    this.party = false; Mats.led.color.setHex(STYLES[G.style].led);
    const all = (on) => { for (const z of Object.keys(ZONES)) Build.setZone(z, on); };
    const tv = Interior.tvs[0];
    if (k === 'home') { all(false); Build.setZone('entry', true); Build.setZone('living', true); Build.setZone('kitchen', true); Interior.allCurtains(0, 1); Sound.toggleMusic(true); UI.toast('귀가 모드: 현관과 거실 불을 켜고 음악을 틉니다.'); }
    else if (k === 'movie') { all(false); Interior.allCurtains(0, 0); Interior.toggleTV(tv, true); if (Build.cove) for (const c of Build.cove) c.material = Mats.led; Interior.setLamp(Interior.lamps[0], false); UI.toast('영화 모드: 불을 끄고 암막 커튼을 칩니다.'); }
    else if (k === 'sleep') { all(false); Interior.toggleTV(tv, false); Sound.toggleMusic(false); Interior.allCurtains(0, 0); for (const l of Interior.lamps) Interior.setLamp(l, false); Interior.setLamp(Interior.lamps[1], true); UI.toast('취침 모드: 모든 불을 끄고 안방 협탁 스탠드만 켭니다.'); }
    else if (k === 'away') { all(false); Interior.toggleTV(tv, false); Sound.toggleMusic(false); if (Interior.ac.userData.on) Interior.toggleAC(false); for (const l of Interior.lamps) Interior.setLamp(l, false); Interior.toggleRobot(true); UI.toast('외출 모드: 전원을 내리고 로봇청소기가 출발합니다.'); }
    else if (k === 'party') { all(true); Sound.toggleMusic(true); Interior.allCurtains(1, 1); this.party = true; UI.toast('파티 모드: 간접조명 색이 음악에 맞춰 바뀝니다.'); }
    else if (k === 'morning') { Interior.allCurtains(1, 1); Build.setZone('kitchen', true); UI.toast('아침 모드: 커튼을 모두 걷습니다.'); }
    UI.renderPanel();
  },
  update() {
    if (!this.party) return;
    Mats.led.color.setHSL((G.time * 0.12) % 1, 0.85, 0.6);
  },
};

// ---------------------------------------------------------------------------
// 도구: 줄자, 가구 옮기기, 사진
// ---------------------------------------------------------------------------
const Tools = {
  points: [], marks: [], editHover: null, holding: null,
  setMode(m) {
    if (G.state !== 'walk') { if (G.state === 'doll') Doll.exit(); if (Tour.active) Tour.stop(); }
    if (G.mode === 'measure' && m !== 'measure') this.clearMeasure();
    if (G.mode === 'edit' && m !== 'edit') this.drop(true);
    G.mode = m;
    if (m === 'edit') UI.toast('가구를 눌러 들고, 옮길 곳을 눌러 내려놓으세요. 소파·침대·식탁·화분 등을 옮길 수 있습니다.');
    if (m === 'measure') UI.toast('재고 싶은 두 점을 차례로 누르세요. 벽, 바닥, 가구 어디든 됩니다.');
    UI.markDock();
  },
  // ---- 줄자
  measureHint() { return this.points.length ? '두 번째 점을 누르세요' : '첫 번째 점을 누르세요'; },
  measureClick() {
    const [o, d] = Player.centerRay();
    const h = Player.pick(o, d, 'any'); if (!h) return;
    const p = R.local(h.point);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.015, 12, 8), new THREE.MeshBasicMaterial({ color: 0xf0d3a4, depthTest: false })); dot.position.copy(p); dot.renderOrder = 25; R.root.add(dot); this.marks.push(dot);
    this.points.push(p); Sound.click();
    if (this.points.length === 2) {
      const [a, b] = this.points, dist = a.distanceTo(b);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0xf0d3a4, depthTest: false })); line.renderOrder = 25; R.root.add(line); this.marks.push(line);
      const c = Tex.canvas(320, 96), g = c.getContext('2d'); g.fillStyle = 'rgba(18,16,14,0.88)'; g.beginPath(); g.roundRect(4, 4, 312, 88, 40); g.fill(); g.fillStyle = '#f0d3a4'; g.font = '700 46px "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(dist >= 1 ? `${dist.toFixed(2)} m` : `${Math.round(dist * 100)} cm`, 160, 50);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.tex(c), depthTest: false, transparent: true })); s.position.copy(a).lerp(b, 0.5).add(new THREE.Vector3(0, 0.08, 0)); s.scale.set(0.36, 0.11, 1); s.renderOrder = 26; R.root.add(s); this.marks.push(s);
      UI.toast(`거리 ${dist.toFixed(2)} m (가로 ${Math.abs(a.x - b.x).toFixed(2)} · 세로 ${Math.abs(a.z - b.z).toFixed(2)} · 높이 ${Math.abs(a.y - b.y).toFixed(2)})`);
      this.points = [];
    }
  },
  clearMeasure() { for (const m of this.marks) { m.removeFromParent(); if (m.geometry) m.geometry.dispose(); } this.marks = []; this.points = []; },
  // ---- 가구 옮기기
  movableOf(obj) { while (obj) { const m = Interior.movables.find((q) => q.group === obj && q.name); if (m) return m; obj = obj.parent; } return null; },
  editHint() {
    if (this.holding) return `${this.holding.name} 내려놓기 · Q/E 회전`;
    return this.editHover ? `${this.editHover.name} 들기` : '옮길 가구를 가리키세요';
  },
  updateEdit() {
    if (G.mode !== 'edit') { this.editHover = null; return; }
    const [o, d] = Player.centerRay();
    if (this.holding) {
      // 바닥과 만나는 점으로 따라온다
      const ol = R.local(o), t = -ol.y / d.y;
      if (t > 0 && t < 8) { const p = ol.addScaledVector(d, t); if (roomAt(p.x, p.z)) { this.holding.group.position.x = p.x; this.holding.group.position.z = p.z; } }
      let rot = 0; if (Input.hit('KeyQ')) rot += Math.PI / 12; if (Input.hit('KeyE')) rot -= Math.PI / 12; rot -= Input.wheel * Math.PI / 24;
      this.holding.group.rotation.y += rot;
      return;
    }
    const rc = new THREE.Raycaster(o, d, 0, 6);
    const groups = Interior.movables.filter((m) => m.name).map((m) => m.group);
    const h = rc.intersectObjects(groups, true).find((x) => x.object.material !== Mats.shadow);
    this.editHover = h ? this.movableOf(h.object) : null;
  },
  editClick() {
    if (this.holding) { this.drop(); return; }
    if (!this.editHover) return;
    const m = this.editHover;
    if (!m.orig) m.orig = { x: m.group.position.x, z: m.group.position.z, r: m.group.rotation.y };
    this.holding = m; m.group.position.y += 0.03; Sound.click();
  },
  drop(silent) {
    if (!this.holding) return;
    this.holding.group.position.y -= 0.03; this.holding = null;
    Interior.updateBoxes(); UI.planBase = null;
    if (!silent) Sound.click();
  },
  resetFurniture() {
    for (const m of Interior.movables) if (m.orig) { m.group.position.x = m.orig.x; m.group.position.z = m.orig.z; m.group.rotation.y = m.orig.r; }
    this.holding = null; Interior.updateBoxes(); UI.planBase = null; UI.toast('가구를 원래 자리로 돌려놓았습니다.');
  },
  // ---- 사진
  photo() {
    const hud = $('hud').hidden; Player.hover = null;
    R.renderer.render(R.scene, R.camera);
    try {
      const url = R.renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a'); a.href = url; a.download = `84m2-${STYLES[G.style].name}-${TOD[G.tod].name}-${Date.now()}.png`; document.body.appendChild(a); a.click(); a.remove();
      UI.flash('#fff', 0.5); Sound.shutter(); UI.toast('사진을 저장했습니다.');
    } catch (e) { UI.toast('이 브라우저에서는 사진을 저장할 수 없습니다.'); }
    void hud;
  },
};
