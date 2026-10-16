// ---------------------------------------------------------------------------
// UI: HUD, 메뉴(DOM + VR 패널), 알림, 미니맵, 터치 조작
// ---------------------------------------------------------------------------
const UI = {
  stack: [], focus: 0, vr: null, hudT: 0, mapT: 0,

  init() {
    this.el = {
      hud: $('hud'), pname: $('pname'), plevel: $('plevel'), hpbar: $('hpbar'), hpnum: $('hpnum'), colnum: $('colnum'),
      expbar: $('expbar'), buffs: $('buffs'), minimap: $('minimap'), floorname: $('floorname'), areaname: $('areaname'),
      bossbar: $('bossbar'), bossnm: $('bossnm'), bosslv: $('bosslv'), bossbars: $('bossbars'), prompt: $('prompt'),
      skillbar: $('skillbar'), toasts: $('toasts'), banner: $('banner'), vignette: $('vignette'), fps: $('fps'),
      menu: $('menu'), menutitle: $('menutitle'), menusub: $('menusub'), menulist: $('menulist'), menuright: $('menuright'), menuhint: $('menuhint'),
      crosshair: $('crosshair'),
    };
    // 스킬 바
    this.slots = [];
    for (let i = 0; i < 4; i++) {
      const d = document.createElement('div'); d.className = 'slot plate';
      d.innerHTML = `<span class="key">${i + 1}</span><span class="nm"></span><div class="cd"></div><div class="cdt"></div>`;
      this.el.skillbar.appendChild(d); this.slots.push(d);
    }
    const pot = document.createElement('div'); pot.className = 'slot plate potion';
    pot.innerHTML = '<span class="key">R</span><span class="nm">0</span><div class="cd"></div><div class="cdt"></div>';
    this.el.skillbar.appendChild(pot); this.potSlot = pot;
    this.mmCtx = this.el.minimap.getContext('2d');
    window.addEventListener('keydown', (e) => this.menuKey(e));
  },

  // ------------------------------------------------------------------ HUD
  showHUD(on) { this.el.hud.hidden = !on; $('touch').hidden = !(on && G.touch && !G.xr); },
  update(dt) {
    const s = G.save; if (!s) return;
    const P = Player;
    this.hudT -= dt;
    const k = clamp(P.hp / P.maxHp, 0, 1);
    const bar = this.el.hpbar.children;
    bar[1].style.width = (k * 100).toFixed(2) + '%';
    bar[1].style.backgroundColor = k > 0.5 ? 'var(--hp)' : k > 0.2 ? 'var(--hp-mid)' : 'var(--hp-low)';
    bar[0].style.width = (k * 100).toFixed(2) + '%';
    this.el.vignette.style.opacity = Math.max(this.flashV || 0, k < 0.25 && P.alive ? 0.35 + Math.sin(G.time * 5) * 0.15 : 0);
    this.flashV = Math.max(0, (this.flashV || 0) - dt * 2.5);
    if (this.vrFlash) this.vrFlash.material.opacity = Math.max(this.flashV * 0.5, k < 0.25 && P.alive ? 0.12 : 0);
    // 스킬 쿨다운
    for (let i = 0; i < 4; i++) {
      const id = s.slots[i], d = this.slots[i];
      const nm = d.children[1], cd = d.children[2], cdt = d.children[3];
      const label = id ? SKILLS[id].name : '';
      if (nm.textContent !== label) nm.textContent = label;
      const usable = id && skillUsable(id, P.wtype);
      d.classList.toggle('off', !usable);
      const rem = id ? P.skillCd[id] || 0 : 0, max = id ? P.skillCdMax[id] || 1 : 1;
      cd.style.height = (rem > 0 ? (rem / max) * 100 : 0) + '%';
      const tx = rem > 0 ? (rem >= 10 ? Math.ceil(rem) : rem.toFixed(1)) : '';
      if (cdt.textContent !== String(tx)) cdt.textContent = tx;
    }
    const pn = this.potSlot.children[1]; if (pn.textContent !== String(s.potions)) pn.textContent = s.potions;
    this.potSlot.children[2].style.height = (P.potionCd / 2) * 100 + '%';
    if (this.hudT <= 0) {
      this.hudT = 0.15;
      this.el.pname.textContent = s.name + (s.hardcore ? ' ☠' : '');
      this.el.plevel.textContent = 'LV ' + s.level;
      this.el.hpnum.textContent = `${fmt(P.hp)} / ${fmt(P.maxHp)}`;
      this.el.colnum.textContent = `${fmt(s.col)} Col`;
      this.el.expbar.children[0].style.width = clamp(s.exp / BAL.expNext(s.level), 0, 1) * 100 + '%';
      const buffs = [];
      if (P.inSafeZone) buffs.push('안전 지대');
      if (s.statPts > 0) buffs.push(`능력치 포인트 ${s.statPts}`);
      if (P.guarding) buffs.push('방어 중');
      if (P.healLeft > 0) buffs.push('회복 중');
      const bh = buffs.map((b) => `<span>${b}</span>`).join('');
      if (this.el.buffs.innerHTML !== bh) this.el.buffs.innerHTML = bh;
      // 상호작용 안내
      const it = P.interact;
      if (it && G.state === 'play') {
        const key = G.touch ? '' : '<kbd>E</kbd>';
        const html = key + it.label;
        if (this.el.prompt.innerHTML !== html) this.el.prompt.innerHTML = html;
        this.el.prompt.hidden = G.touch;
        $('t-use').hidden = !G.touch; $('t-use').textContent = it.kind === 'npc' ? '대화' : it.kind === 'chest' ? '열기' : '사용';
      } else { this.el.prompt.hidden = true; $('t-use').hidden = true; }
      if (G.settings.fps) { this.el.fps.hidden = false; this.el.fps.textContent = `${Math.round(Game.fps)} FPS · ${R.quality}`; } else this.el.fps.hidden = true;
    }
    this.mapT -= dt;
    if (this.mapT <= 0) { this.mapT = 0.1; this.drawMinimap(); }
    this.updateVRBanner(dt);
  },
  setFloorLabel() {
    const F = G.floor; if (!F) return;
    this.el.floorname.textContent = `제 ${F.f}층`;
    this.el.areaname.textContent = G.area === 'dungeon' || G.area === 'boss' ? '미궁' : G.area === 'town' || Player.inSafeZone ? F.townName : F.areaName;
  },
  drawMinimap() {
    const F = G.floor; if (!F) return;
    const g = this.mmCtx, S = 304, P = Player;
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, TAU); g.clip();
    g.fillStyle = '#05080c'; g.fillRect(0, 0, S, S);
    const f = P.forwardXZ();
    const heading = Math.atan2(f[0], -f[1]); // 위쪽이 바라보는 방향
    g.translate(S / 2, S / 2);
    g.rotate(-heading);
    if (World.active === World.dungeon && World.dungeon) {
      const D = World.dungeon, sc = 3.2;
      g.scale(sc, sc);
      g.translate(-P.pos.x, -P.pos.z);
      g.fillStyle = 'rgba(160,150,130,0.35)';
      for (let j = 0; j < D.H; j++) for (let i = 0; i < D.W; i++) if (D.explored[j][i]) g.fillRect(D.ox + i * D.CS, j * D.CS, D.CS, D.CS);
      g.strokeStyle = 'rgba(230,220,200,0.85)'; g.lineWidth = 0.9;
      g.beginPath();
      for (let j = 0; j <= D.H; j++) for (let i = 0; i < D.W; i++) if (D.hw[j][i] && ((D.explored[j] && D.explored[j][i]) || (D.explored[j - 1] && D.explored[j - 1][i]))) { g.moveTo(D.ox + i * D.CS, j * D.CS); g.lineTo(D.ox + (i + 1) * D.CS, j * D.CS); }
      for (let j = 0; j < D.H; j++) for (let i = 0; i <= D.W; i++) if (D.vw[j][i] && (D.explored[j][i] || D.explored[j][i - 1])) { g.moveTo(D.ox + i * D.CS, j * D.CS); g.lineTo(D.ox + i * D.CS, (j + 1) * D.CS); }
      g.stroke();
      g.strokeStyle = 'rgba(255,90,70,0.8)'; g.beginPath(); g.arc(D.arena.x, D.arena.z, D.arena.r, 0, TAU); g.stroke();
      for (const c of D.chests) if (!c.opened && this.cellExplored(D, c.x, c.z)) { g.fillStyle = '#ffd24a'; g.fillRect(c.x - 1.5, c.z - 1.5, 3, 3); }
      g.lineWidth = 1;
      for (const e of Ents.list) { if (e.dead) continue; g.fillStyle = e.boss ? '#ff3a3a' : '#ff7a6a'; g.beginPath(); g.arc(e.pos.x, e.pos.z, e.boss ? 3 : 1.4, 0, TAU); g.fill(); }
    } else {
      const sc = 1.5;
      g.scale(sc, sc);
      g.translate(-P.pos.x, -P.pos.z);
      g.drawImage(F.minimap, -F.SIZE / 2, -F.SIZE / 2, F.SIZE, F.SIZE);
      for (const sp of F.spawns) if (sp.elite && sp.enemies.length) { g.fillStyle = '#ff3a3a'; g.beginPath(); g.arc(sp.x, sp.z, 4, 0, TAU); g.fill(); }
      for (const e of Ents.list) { if (e.dead) continue; g.fillStyle = e.rare ? '#ffd24a' : e.elite ? '#ff3a3a' : '#ff8a7a'; g.beginPath(); g.arc(e.pos.x, e.pos.z, e.elite ? 3 : 1.6, 0, TAU); g.fill(); }
      for (const n of F.npcs) { g.fillStyle = '#7ad0ff'; g.beginPath(); g.arc(n.group.position.x, n.group.position.z, 1.8, 0, TAU); g.fill(); }
    }
    g.restore();
    // 플레이어 화살표 (항상 위를 향함)
    g.fillStyle = '#ffffff'; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(S / 2, S / 2 - 12); g.lineTo(S / 2 + 8, S / 2 + 9); g.lineTo(S / 2, S / 2 + 4); g.lineTo(S / 2 - 8, S / 2 + 9); g.closePath(); g.stroke(); g.fill();
    // 북쪽 표시
    g.save(); g.translate(S / 2, S / 2); g.rotate(-heading);
    g.fillStyle = '#e3c070'; g.font = '700 22px "Marcellus SC", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', 0, -S / 2 + 18); g.restore();
  },
  cellExplored(D, x, z) { const c = World.dungeonCell(D, x, z); return c && D.explored[c[1]][c[0]]; },
  // 지도 전체 화면 (메뉴 안에 그린다)
  bigMap() {
    const F = G.floor, S = 900, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#05080c'; g.fillRect(0, 0, S, S);
    const P = Player;
    if (World.active === World.dungeon && World.dungeon) {
      const D = World.dungeon, ext = Math.max(D.W * D.CS, D.arena.z + D.arena.r) + 10, sc = S / ext;
      g.translate(S / 2 - 0 * sc, 10); g.scale(sc, sc);
      g.translate(0, 0);
      g.strokeStyle = 'rgba(230,220,200,0.9)'; g.lineWidth = 0.8;
      g.fillStyle = 'rgba(160,150,130,0.3)';
      for (let j = 0; j < D.H; j++) for (let i = 0; i < D.W; i++) if (D.explored[j][i]) g.fillRect(D.ox + i * D.CS, j * D.CS, D.CS, D.CS);
      g.beginPath();
      for (let j = 0; j <= D.H; j++) for (let i = 0; i < D.W; i++) if (D.hw[j][i] && ((D.explored[j] && D.explored[j][i]) || (D.explored[j - 1] && D.explored[j - 1][i]))) { g.moveTo(D.ox + i * D.CS, j * D.CS); g.lineTo(D.ox + (i + 1) * D.CS, j * D.CS); }
      for (let j = 0; j < D.H; j++) for (let i = 0; i <= D.W; i++) if (D.vw[j][i] && (D.explored[j][i] || D.explored[j][i - 1])) { g.moveTo(D.ox + i * D.CS, j * D.CS); g.lineTo(D.ox + i * D.CS, (j + 1) * D.CS); }
      g.stroke();
      g.strokeStyle = '#ff5a4a'; g.beginPath(); g.arc(D.arena.x, D.arena.z, D.arena.r, 0, TAU); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(P.pos.x, P.pos.z, 2.2, 0, TAU); g.fill();
    } else {
      g.drawImage(F.minimap, 0, 0, S, S);
      const toPx = (v) => (v / F.SIZE + 0.5) * S;
      g.font = '600 22px "IBM Plex Sans KR", sans-serif'; g.textAlign = 'center';
      g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 4;
      const label = (t, x, z) => { g.strokeText(t, toPx(x), toPx(z)); g.fillText(t, toPx(x), toPx(z)); };
      label(F.townName, F.town.x, F.town.z - 44);
      label('미궁탑', F.tower.x, F.tower.z - 24);
      for (const sp of F.spawns) if (sp.elite) { g.fillStyle = '#ff3a3a'; g.beginPath(); g.arc(toPx(sp.x), toPx(sp.z), 7, 0, TAU); g.fill(); g.fillStyle = '#fff'; label('네임드', sp.x, sp.z - 9); }
      const f = P.forwardXZ();
      g.save(); g.translate(toPx(P.pos.x), toPx(P.pos.z)); g.rotate(Math.atan2(f[0], -f[1]));
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -14); g.lineTo(10, 10); g.lineTo(0, 4); g.lineTo(-10, 10); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
    return c;
  },

  toast(text, color) {
    const d = document.createElement('div'); d.className = 'toast'; d.textContent = text;
    if (color) d.style.borderLeftColor = color;
    this.el.toasts.prepend(d);
    while (this.el.toasts.children.length > 6) this.el.toasts.lastChild.remove();
    setTimeout(() => { d.style.transition = 'opacity 0.5s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 500); }, 3800);
    if (G.xr) this.vrNote(text, color);
  },
  banner(t, s, ms = 2500) {
    const b = this.el.banner;
    b.children[0].textContent = t; b.children[1].textContent = s || '';
    b.style.opacity = '1';
    clearTimeout(this._bT);
    this._bT = setTimeout(() => { b.style.opacity = '0'; }, ms);
    if (G.xr) this.vrBanner(t, s, ms);
  },
  floatText(text, pos, color = '#ffffff') {
    if (!pos) {
      const f = Player.forwardXZ();
      pos = G.xr ? new THREE.Vector3().setFromMatrixPosition(R.renderer.xr.getCamera().matrixWorld) : Player.pos.clone().setY(Player.pos.y + 1.65);
      pos.x += f[0] * 2.2; pos.z += f[1] * 2.2; pos.y += 0.45;
    }
    FX.text(text, pos, color, 0.42, { life: 1.1, vy: 0.5 });
  },
  callout(text, color) {
    if (G.xr) { this.floatText(text, null, color); return; }
    const c = $('callout');
    c.textContent = text; c.style.color = color;
    c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
  },
  hurtFlash(v = 0.8) { this.flashV = Math.max(this.flashV || 0, v); },
  boss(e) {
    const bb = this.el.bossbar;
    if (!e || e.dead) { bb.hidden = true; this._bossBars = 0; return; }
    bb.hidden = false;
    this.el.bossnm.textContent = e.name;
    this.el.bosslv.textContent = `Lv.${e.level} · ${fmt(Math.max(0, e.hp))} / ${fmt(e.maxHp)}`;
    if (this._bossBars !== e.hpBars) {
      this._bossBars = e.hpBars;
      this.el.bossbars.innerHTML = '';
      for (let i = 0; i < e.hpBars; i++) { const d = document.createElement('div'); d.className = 'bar'; d.innerHTML = '<b></b><i></i>'; this.el.bossbars.appendChild(d); }
    }
    const per = e.maxHp / e.hpBars;
    [...this.el.bossbars.children].forEach((d, i) => {
      const lo = (e.hpBars - 1 - i) * per; // 왼쪽 막대가 마지막에 깎인다
      const k = clamp((e.hp - lo) / per, 0, 1);
      d.children[1].style.width = k * 100 + '%'; d.children[0].style.width = k * 100 + '%';
    });
  },

  // ------------------------------------------------------------------ 메뉴
  openMenu(builder) {
    if (!this.stack.length) { this.prevState = G.state === 'menu' ? 'play' : G.state; }
    this.stack.push(builder);
    this.focus = 0;
    G.state = 'menu';
    if (document.pointerLockElement) document.exitPointerLock();
    this.render();
    Sfx.click();
  },
  replaceMenu(builder) { this.stack.pop(); this.stack.push(builder); this.focus = 0; this.render(); },
  back() {
    const top = this.stack[this.stack.length - 1];
    const def = top && top();
    if (def && def.noBack) return;
    this.stack.pop();
    Sfx.click();
    if (!this.stack.length) this.closeMenu(); else { this.focus = 0; this.render(); }
  },
  closeMenu() {
    this.stack = [];
    this.el.menu.hidden = true;
    if (this.vr) this.vr.mesh.visible = false;
    if (Player.ctrls) for (const c of Player.ctrls) if (c.userData.ray) c.userData.ray.visible = false;
    G.state = this.prevState === 'title' ? 'title' : 'play';
    this.prevState = null;
    if (G.state === 'play' && !G.touch && !G.xr) this.el.crosshair.title = '';
  },
  refresh() { if (this.stack.length) this.render(true); },
  render(keepFocus) {
    const def = this.stack[this.stack.length - 1]();
    this.cur = def;
    const items = def.items.filter(Boolean);
    this.curItems = items;
    if (!keepFocus) { this.focus = items.findIndex((it) => it.onSelect && !it.disabled); if (this.focus < 0) this.focus = 0; }
    if (G.xr) { this.renderVR(def, items); return; }
    const E = this.el;
    E.menu.hidden = false;
    E.menutitle.textContent = def.title;
    E.menusub.textContent = def.sub || '';
    E.menuright.textContent = def.right || '';
    E.menuhint.textContent = G.touch ? '항목을 누르세요' : '↑↓ 선택 · Enter 확인 · Esc 뒤로';
    const scroll = E.menulist.scrollTop;
    E.menulist.innerHTML = '';
    items.forEach((it, i) => {
      if (it.canvas) { it.canvas.style.width = '100%'; it.canvas.style.height = 'auto'; it.canvas.style.display = 'block'; E.menulist.appendChild(it.canvas); return; }
      if (it.textarea !== undefined) {
        const ta = document.createElement('textarea'); ta.id = it.id || 'menu-ta'; ta.value = it.textarea; ta.readOnly = !!it.readOnly; ta.spellcheck = false;
        if (it.readOnly) ta.addEventListener('focus', () => ta.select());
        E.menulist.appendChild(ta); return;
      }
      if (!it.onSelect) {
        const p = document.createElement('div'); p.className = 'text' + (it.head ? ' head' : '');
        p.textContent = it.text ?? it.label; if (it.color) p.style.color = it.color;
        E.menulist.appendChild(p); return;
      }
      const b = document.createElement('button'); b.className = 'item'; b.type = 'button'; b.id = 'mi-' + i;
      b.disabled = !!it.disabled;
      b.innerHTML = '<span class="l"></span><span class="r"></span>' + (it.detail ? '<span class="d"></span>' : '');
      b.children[0].textContent = it.label; if (it.color) b.children[0].style.color = it.color;
      b.children[1].textContent = it.right || '';
      if (it.detail) b.children[2].textContent = it.detail;
      if (i === this.focus) b.classList.add('focus');
      b.addEventListener('click', () => { this.focus = i; this.select(); });
      b.addEventListener('mouseenter', () => { this.focus = i; this.markFocus(); });
      E.menulist.appendChild(b);
    });
    if (keepFocus) E.menulist.scrollTop = scroll;
  },
  markFocus() {
    [...this.el.menulist.querySelectorAll('.item')].forEach((b) => b.classList.toggle('focus', b.id === 'mi-' + this.focus));
    const f = $('mi-' + this.focus); if (f) f.scrollIntoView({ block: 'nearest' });
  },
  select() {
    const it = this.curItems && this.curItems[this.focus];
    if (!it || !it.onSelect || it.disabled) return;
    Sfx.click();
    it.onSelect();
    if (this.stack.length && !it.keep) this.refresh();
  },
  menuKey(e) {
    if (G.state !== 'menu' || G.xr) return;
    if (e.target && e.target.tagName === 'TEXTAREA') { if (e.code === 'Escape') { e.preventDefault(); this.back(); } return; }
    const items = this.curItems || [];
    const step = (d) => {
      let i = this.focus;
      for (let k = 0; k < items.length; k++) { i = (i + d + items.length) % items.length; if (items[i].onSelect && !items[i].disabled) break; }
      this.focus = i; this.markFocus();
    };
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); step(1); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); step(-1); }
    else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.select(); }
    else if (e.code === 'Escape' || e.code === 'Backspace' || e.code === 'Tab') { e.preventDefault(); this.back(); }
  },

  // ------------------------------------------------------------------ VR 메뉴
  ensureVR() {
    if (this.vr) return this.vr;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 820;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.0), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false }));
    mesh.renderOrder = 50; mesh.visible = false;
    R.scene.add(mesh);
    this.vr = { canvas: c, tex, mesh, page: 0, rows: [], hover: -1 };
    return this.vr;
  },
  renderVR(def, items) {
    const V = this.ensureVR();
    if (!V.mesh.visible) {
      const cam = R.renderer.xr.getCamera();
      const head = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
      const f = Player.forwardXZ();
      V.mesh.position.set(head.x + f[0] * 1.4, head.y - 0.1, head.z + f[1] * 1.4);
      V.mesh.lookAt(head.x, head.y - 0.1, head.z);
      V.mesh.visible = true; V.page = 0;
    }
    if (Player.ctrls) for (const c of Player.ctrls) if (c.userData.ray) c.userData.ray.visible = true;
    V.def = def; V.items = items;
    this.drawVR();
  },
  drawVR() {
    const V = this.vr, g = V.canvas.getContext('2d'), W = 1024, H = 820, def = V.def;
    const per = 8;
    const pages = Math.max(1, Math.ceil(V.items.length / per));
    V.page = clamp(V.page, 0, pages - 1);
    const rows = V.items.slice(V.page * per, V.page * per + per);
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(12,17,25,0.96)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(227,192,112,0.7)'; g.lineWidth = 4; g.strokeRect(3, 3, W - 6, H - 6);
    g.fillStyle = '#e8edf4'; g.font = '700 44px "Gowun Batang", serif'; g.textBaseline = 'middle';
    g.fillText(def.title, 34, 50);
    g.fillStyle = '#95a3b4'; g.font = '400 24px "IBM Plex Sans KR", sans-serif';
    g.fillText((def.sub || '').slice(0, 60), 36, 92);
    V.rows = [];
    let y = 128;
    for (const it of rows) {
      const h = it.canvas ? 0 : it.detail ? 78 : 62;
      if (it.canvas) { g.drawImage(it.canvas, 312, y, 400, 400); V.rows.push({ y0: y, y1: y + 400, it: null }); y += 404; continue; }
      const idx = V.rows.length;
      const sel = it.onSelect && !it.disabled;
      if (sel && V.hover === idx) { g.fillStyle = 'rgba(227,192,112,0.18)'; g.fillRect(20, y, W - 40, h - 4); }
      g.globalAlpha = it.disabled ? 0.4 : 1;
      g.fillStyle = it.color || (it.onSelect ? '#e8edf4' : '#95a3b4');
      g.font = (it.onSelect ? '600 30px' : it.head ? '700 24px' : '400 26px') + ' "IBM Plex Sans KR", sans-serif';
      g.fillText(String(it.text ?? it.label ?? '').slice(0, 44), 40, y + 26);
      if (it.right) { g.textAlign = 'right'; g.fillStyle = '#e3c070'; g.font = '600 26px "IBM Plex Sans KR", sans-serif'; g.fillText(it.right, W - 40, y + 26); g.textAlign = 'left'; }
      if (it.detail) { g.fillStyle = '#95a3b4'; g.font = '400 22px "IBM Plex Sans KR", sans-serif'; g.fillText(it.detail.slice(0, 58), 40, y + 58); }
      g.globalAlpha = 1;
      V.rows.push({ y0: y, y1: y + h, it: sel ? it : null });
      y += h;
    }
    // 아래쪽 버튼
    const navY = H - 70;
    V.nav = [];
    const btn = (label, x, w, fn) => { const i = V.nav.length; const hov = V.hover === 100 + i; g.fillStyle = hov ? 'rgba(227,192,112,0.3)' : 'rgba(255,255,255,0.06)'; g.fillRect(x, navY, w, 54); g.fillStyle = '#e8edf4'; g.font = '600 26px "IBM Plex Sans KR", sans-serif'; g.textAlign = 'center'; g.fillText(label, x + w / 2, navY + 27); g.textAlign = 'left'; V.nav.push({ x0: x, x1: x + w, fn }); };
    if (pages > 1) { btn('◀ 이전', 30, 200, () => { V.page--; this.drawVR(); }); btn(`${V.page + 1} / ${pages}`, 412, 200, () => {}); btn('다음 ▶', 794, 200, () => { V.page++; this.drawVR(); }); }
    btn(this.stack.length > 1 ? '뒤로' : '닫기', pages > 1 ? 240 : 412, pages > 1 ? 160 : 200, () => this.back());
    V.tex.needsUpdate = true;
  },
  updateVRMenu() {
    if (!G.xr || G.state !== 'menu' || !this.vr || !this.vr.mesh.visible) return;
    const c = Player.rightCtrl || (Player.ctrls && Player.ctrls[0]); if (!c) return;
    const ray = new THREE.Raycaster();
    const m = c.matrixWorld;
    const o = new THREE.Vector3().setFromMatrixPosition(m), d = new THREE.Vector3(0, 0, -1).transformDirection(m);
    ray.set(o, d);
    const hit = ray.intersectObject(this.vr.mesh)[0];
    let hov = -1;
    if (hit && hit.uv) {
      const px = hit.uv.x * 1024, py = (1 - hit.uv.y) * 820;
      if (py > 820 - 70) { this.vr.nav.forEach((n, i) => { if (px >= n.x0 && px <= n.x1) hov = 100 + i; }); }
      else this.vr.rows.forEach((r, i) => { if (r.it && py >= r.y0 && py < r.y1) hov = i; });
    }
    if (hov !== this.vr.hover) { this.vr.hover = hov; this.drawVR(); }
  },
  vrSelect() {
    const V = this.vr; if (!V || V.hover < 0) return;
    if (V.hover >= 100) { const n = V.nav[V.hover - 100]; if (n) { Sfx.click(); n.fn(); } return; }
    const r = V.rows[V.hover]; if (!r || !r.it) return;
    Sfx.click(); r.it.onSelect();
    if (this.stack.length && !r.it.keep) this.refresh();
  },
  vrBanner(t, s, ms) {
    if (!this._vrB) {
      this._vrB = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
      this._vrB.renderOrder = 60; R.scene.add(this._vrB);
    }
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
    g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '700 84px "Gowun Batang", serif'; g.shadowColor = '#000'; g.shadowBlur = 16;
    g.fillText(t, 512, 110); g.fillStyle = '#e3c070'; g.font = '600 40px "IBM Plex Sans KR", sans-serif'; g.fillText(s || '', 512, 190);
    if (this._vrB.material.map) this._vrB.material.map.dispose();
    this._vrB.material.map = new THREE.CanvasTexture(c); this._vrB.material.map.colorSpace = THREE.SRGBColorSpace; this._vrB.material.needsUpdate = true;
    this._vrB.scale.set(2.4, 0.6, 1);
    this._vrBT = ms / 1000;
  },
  vrNote(text, color) {
    const cam = R.renderer.xr.getCamera();
    const p = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const f = Player.forwardXZ();
    p.x += f[0] * 1.5; p.z += f[1] * 1.5; p.y -= 0.35;
    FX.text(text, p, color || '#e8edf4', 0.09, { life: 3, vy: 0.04 });
  },
  updateVRBanner(dt) {
    if (!this._vrB) return;
    this._vrBT -= dt;
    this._vrB.visible = G.xr && this._vrBT > 0;
    if (this._vrB.visible) {
      const cam = R.renderer.xr.getCamera();
      const p = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
      const f = Player.forwardXZ();
      this._vrB.position.set(p.x + f[0] * 2.5, p.y + 0.35, p.z + f[1] * 2.5);
      this._vrB.material.opacity = Math.min(1, this._vrBT * 2);
    }
  },
  setupVRFlash() {
    if (this.vrFlash) return;
    this.vrFlash = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8), new THREE.MeshBasicMaterial({ color: 0xaa0a0a, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false }));
    this.vrFlash.renderOrder = 70;
    R.camera.add(this.vrFlash);
  },

  // ------------------------------------------------------------------ 터치
  initTouch() {
    const pad = $('tpad'), knob = $('tknob');
    let padId = null, cx = 0, cy = 0;
    const setKnob = (x, y) => { knob.style.transform = `translate(${x}px, ${y}px)`; };
    pad.addEventListener('pointerdown', (e) => { padId = e.pointerId; const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; pad.setPointerCapture(e.pointerId); move(e); e.preventDefault(); });
    const move = (e) => {
      if (e.pointerId !== padId) return;
      let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy), m = 52;
      if (l > m) { dx = dx / l * m; dy = dy / l * m; }
      Input.joy.x = dx / m; Input.joy.y = dy / m; setKnob(dx, dy);
    };
    pad.addEventListener('pointermove', move);
    const end = (e) => { if (e.pointerId !== padId) return; padId = null; Input.joy.x = Input.joy.y = 0; setKnob(0, 0); };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    // 화면 오른쪽 드래그로 시점 이동
    const view = $('view');
    let lookId = null, lx = 0, ly = 0;
    view.addEventListener('pointerdown', (e) => { if (!G.touch || e.pointerType === 'mouse') return; if (lookId === null) { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; } });
    window.addEventListener('pointermove', (e) => { if (e.pointerId !== lookId) return; Input.lookDX += e.clientX - lx; Input.lookDY += e.clientY - ly; lx = e.clientX; ly = e.clientY; });
    const lend = (e) => { if (e.pointerId === lookId) lookId = null; };
    window.addEventListener('pointerup', lend); window.addEventListener('pointercancel', lend);
    const bind = (id, down, up) => {
      const b = $(id);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); Sfx.init(); b.classList.add('on'); down(); });
      const u = (e) => { b.classList.remove('on'); if (up) up(); };
      b.addEventListener('pointerup', u); b.addEventListener('pointercancel', u); b.addEventListener('pointerleave', u);
    };
    bind('t-atk', () => { Input.touchAtk = true; Player.attack(); }, () => { Input.touchAtk = false; });
    for (let i = 0; i < 4; i++) bind('t-s' + (i + 1), () => Player.useSkill(i));
    bind('t-dodge', () => Player.dodge());
    bind('t-guard', () => { Input.touchGuard = true; }, () => { Input.touchGuard = false; });
    bind('t-use', () => { if (Player.interact) Game.interact(Player.interact); });
    bind('t-menu', () => Game.openMainMenu());
    bind('t-pot', () => Player.drinkPotion());
    bind('t-map', () => Game.openMap());
    bind('t-jump', () => { if (Player.onGround && !Player.locked()) { Player.vel.y = 7.2; Player.onGround = false; } });
  },
  updateTouchLabels() {
    const s = G.save; if (!s) return;
    for (let i = 0; i < 4; i++) { const id = s.slots[i]; const b = $('t-s' + (i + 1)); const rem = id ? Player.skillCd[id] || 0 : 0; const t = id ? (rem > 0 ? Math.ceil(rem) + '' : SKILLS[id].name.slice(0, 2)) : '-'; if (b.textContent !== t) b.textContent = t; b.style.opacity = id && skillUsable(id, Player.wtype) ? 1 : 0.4; b.hidden = !id; }
  },
};
