// ---------------------------------------------------------------------------
// 시작 화면, 입력, 스타일·시간 바꾸기, VR 세션, 메인 루프
// ---------------------------------------------------------------------------
const Game = {
  last: 0, planT: 0,

  init() {
    loadSettings();
    G.touch = matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
    R.init(); Mats.init(); Mats.apply(G.style);
    Build.init(); Interior.init();
    R.setTime(G.tod);
    UI.init();
    this.setupTitle(); this.bindInput(); this.setupXR();
    // 처음 상태: 방문은 열고 욕실·현관·다용도실 문은 닫는다
    for (const id of ['d-room2', 'd-room3', 'd-master', 'd-mbath']) { const d = Interior.doorById(id); d.open = true; d.k = 1; Interior.applyDoor(d); }
    if (TOD[G.tod].night > 0.1) this.autoLights();
    Player.teleport(1.75, 0.95); Player.lookAt(-1.6, 3.6);
    G.state = 'title';
    $('loading').hidden = true; $('title').hidden = false;
    R.renderer.setAnimationLoop((t) => this.frame(t));
  },

  // ---------------- 시작 화면
  setupTitle() {
    const sp = $('specs');
    for (const t of ['84㎡ 타입 · 34평형', `발코니 확장 · 실사용 ${TOTAL_AREA.toFixed(0)}㎡`, '방 3 · 욕실 2', '24층 남향 판상형', '천장 2.4m · 거실 우물천장 2.6m']) { const s = document.createElement('span'); s.textContent = t; sp.appendChild(s); }
    const box = $('t-styles');
    for (const k of STYLE_KEYS) {
      const s = STYLES[k], b = document.createElement('button'); b.type = 'button'; b.className = 'style-card' + (G.style === k ? ' on' : '');
      b.innerHTML = `<div class="sw">${s.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</div><b></b><small></small>`;
      b.querySelector('b').textContent = s.name; b.querySelector('small').textContent = s.desc;
      b.addEventListener('click', () => { this.setStyle(k); box.querySelectorAll('.style-card').forEach((x) => x.classList.remove('on')); b.classList.add('on'); });
      box.appendChild(b);
    }
    const tb = $('t-times');
    for (const k of TOD_KEYS) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (G.tod === k ? ' on' : ''); b.textContent = TOD[k].name;
      b.addEventListener('click', () => { this.setTime(k); tb.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); b.classList.add('on'); });
      tb.appendChild(b);
    }
    $('b-walk').addEventListener('click', () => this.start());
    $('b-doll').addEventListener('click', () => { this.start(true); Doll.enter(); });
    $('b-tour').addEventListener('click', () => { this.start(true); Tour.start(); });
    $('b-vr').addEventListener('click', () => this.enterVR());
  },
  start(noLock) {
    Sound.init();
    $('title').hidden = true; UI.show(true);
    G.state = 'walk';
    Player.teleport(1.75, 0.95); Player.lookAt(-1.6, 3.6); Player.pitch = -0.04;
    Player.applyCamera();
    if (!noLock && !G.touch) this.lockPointer();
    setTimeout(() => UI.toast(G.touch ? '왼쪽 원으로 걷고 화면을 끌어 둘러보세요. 문·스위치·가전을 누르면 조작됩니다.' : 'WASD로 걷고 마우스로 둘러보세요. 가운데 점을 문·스위치·가전에 맞추고 클릭하면 조작됩니다.'), 500);
    setTimeout(() => UI.toast('아래 막대에서 스타일, 시간대, 조명, 인형집 뷰, 투어를 바꿔 보세요.'), 4300);
  },
  titleCam() {
    const t = G.time * 0.05, x = 1.5 + Math.sin(t) * 0.5, z = 0.9 + Math.cos(t * 0.7) * 0.25;
    R.rig.position.set(x, 0, z); R.rig.rotation.set(0, 0, 0);
    R.camera.position.set(0, 1.45, 0);
    R.camera.lookAt(-1.4 + Math.sin(t * 0.8) * 0.8, 1.15, 3.6);
  },

  // ---------------- 스타일·시간·조명 색
  setStyle(k) {
    G.style = k; Mats.apply(k); Interior.restyle();
    for (const [z, L] of Object.entries(Build.lights)) if (L.on) Build.setZone(z, true);
    Home.party = false; saveSettings(); UI.planBase = null;
    if (G.state === 'walk' || G.state === 'doll') UI.toast(`${STYLES[k].name}: ${STYLES[k].desc}`);
    UI.renderPanel();
  },
  setTime(k) {
    const wasNight = TOD[G.tod].night > 0.5;
    R.setTime(k); saveSettings();
    if (TOD[k].night > 0.1 && !wasNight) this.autoLights();
    UI.renderPanel();
  },
  autoLights() { if (Object.values(Build.lights).some((l) => l.on)) return; for (const z of ['living', 'kitchen', 'entry']) Build.setZone(z, true); Interior.setLamp(Interior.lamps[0], true); },
  setLightColor(col) {
    STYLES[G.style].led = col; Mats.led.color.setHex(col); Mats.downOn.color.setHex(col).lerp(new THREE.Color(0xffffff), 0.5);
    for (const [z, L] of Object.entries(Build.lights)) if (L.on) Build.setZone(z, true);
  },

  // ---------------- 입력
  lockPointer() { const c = R.renderer.domElement; if (G.touch || !c.requestPointerLock) return; try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 무시 */ } },
  locked() { return document.pointerLockElement === R.renderer.domElement; },
  escape() {
    if (!$('help').hidden) { $('help').hidden = true; return; }
    if (Tools.holding) { const m = Tools.holding; if (m.orig) { m.group.position.x = m.orig.x; m.group.position.z = m.orig.z; m.group.rotation.y = m.orig.r; } Tools.drop(true); return; }
    if (G.mode) { Tools.setMode(null); return; }
    if (Tour.active) { Tour.stop(); return; }
    if (G.state === 'doll') { Doll.exit(); return; }
    if (UI.panelKey) { UI.closePanel(); return; }
  },
  bindInput() {
    const c = R.renderer.domElement;
    // 바깥 앱 안에서는 그 앱이 키·마우스 이동을 Input에 모아 주므로 여기서는 집 안에 있을 때의 동작만 처리한다
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (!HOST) { if (!e.repeat) Input.pressed.add(e.code); Input.keys.add(e.code); }
      if (!APTSTATE.active || G.state === 'title' || G.xr) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
      if (Tour.active && /^(Key[WASD]|Arrow)/.test(e.code)) { Tour.stop(); return; }
      const k = e.code;
      if (k === 'Escape') this.escape();
      else if (k === 'KeyV') UI.dock('doll');
      else if (k === 'KeyT') UI.dock('tour');
      else if (k === 'KeyM') UI.dock('measure');
      else if (k === 'KeyG') UI.dock('edit');
      else if (k === 'KeyP') Tools.photo();
      else if (k === 'KeyH') UI.dock('help');
      else if (k === 'KeyL') UI.dock('light');
      else if (k === 'KeyC') { Player.sit = !Player.sit; UI.toast(Player.sit ? '앉은 눈높이로 봅니다.' : '선 눈높이로 돌아왔습니다.'); }
      else if (k === 'KeyR' && G.mode === 'edit') Tools.resetFurniture();
      else if (k === 'KeyE' && G.mode !== 'edit') { if (G.mode === 'measure') Tools.measureClick(); else Player.use(); }
      else if (/^Digit[1-8]$/.test(k)) { const n = +k.slice(5); if (n <= 4) this.setStyle(STYLE_KEYS[n - 1]); else this.setTime(TOD_KEYS[n - 5]); }
    });
    if (!HOST) {
      addEventListener('keyup', (e) => Input.keys.delete(e.code));
      addEventListener('blur', () => Input.keys.clear());
      addEventListener('mousemove', (e) => { if (this.locked()) { Input.mouseDX += e.movementX; Input.mouseDY += e.movementY; } });
    }
    c.addEventListener('wheel', (e) => { if (APTSTATE.active && G.state !== 'title') { e.preventDefault(); Input.wheel += Math.sign(e.deltaY); } }, { passive: false });
    c.addEventListener('contextmenu', (e) => { if (!APTSTATE.active) return; e.preventDefault(); if (G.mode) Tools.setMode(null); });
    // 마우스·터치: 끌면 둘러보기(인형집에서는 궤도), 짧게 누르면 조작
    let down = null;
    c.addEventListener('pointerdown', (e) => {
      if (!APTSTATE.active || G.state === 'title' || G.xr) return;
      Sound.init();
      down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), id: e.pointerId, moved: false };
      if (G.state === 'doll') Doll.drag = true;
    });
    addEventListener('pointermove', (e) => {
      if (!down || e.pointerId !== down.id) return;
      const dx = e.clientX - down.lx, dy = e.clientY - down.ly; down.lx = e.clientX; down.ly = e.clientY;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true;
      if (G.state === 'doll') { Doll.az -= dx * 0.006; Doll.el = clamp(Doll.el + dy * 0.004, 0.35, 1.45); }
      else if (G.state === 'walk' && !this.locked()) { Input.lookDX += dx * (G.touch ? 1 : 0.55); Input.lookDY += dy * (G.touch ? 1 : 0.55); }
    });
    addEventListener('pointerup', (e) => {
      if (!down || e.pointerId !== down.id) return;
      const d = down; down = null; Doll.drag = false;
      if (d.moved) return;
      const nx = (e.clientX / innerWidth) * 2 - 1, ny = -(e.clientY / innerHeight) * 2 + 1;
      if (G.state === 'doll') { const p = Doll.floorAt(nx, ny); const f = p && Doll.freeSpot(p.x, p.z); if (f) Doll.exit(f.x, f.z); return; }
      if (G.state !== 'walk') return;
      if (G.mode === 'measure') { Tools.measureClick(); return; }
      if (G.mode === 'edit') { Tools.editClick(); return; }
      if (this.locked()) { Player.use(); return; }
      // 시점이 고정되지 않았으면: 누른 곳의 물건을 조작하고, 없으면 시점 고정
      const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(nx, ny), R.camera);
      const h = Player.pick(rc.ray.origin, rc.ray.direction);
      if (h) { Player.hover = h.object.userData.it; Player.use(); }
      else if (!G.touch) this.lockPointer();
    });
    // 터치 조이스틱
    if (G.touch) {
      $('touch').hidden = false;
      const joy = $('joy'), knob = joy.querySelector('i'); let jid = null, cx = 0, cy = 0;
      joy.addEventListener('pointerdown', (e) => { e.stopPropagation(); jid = e.pointerId; const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; joy.setPointerCapture(jid); mv(e); });
      const mv = (e) => { if (e.pointerId !== jid) return; let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy), m = 48; if (l > m) { dx = dx / l * m; dy = dy / l * m; } Input.joy.x = dx / m; Input.joy.y = dy / m; knob.style.transform = `translate(${dx}px,${dy}px)`; if (Tour.active) Tour.stop(); };
      joy.addEventListener('pointermove', mv);
      const end = (e) => { if (e.pointerId !== jid) return; jid = null; Input.joy.x = Input.joy.y = 0; knob.style.transform = ''; };
      joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
      $('tact').addEventListener('click', (e) => { e.stopPropagation(); if (G.mode === 'measure') Tools.measureClick(); else if (G.mode === 'edit') Tools.editClick(); else if (!Player.use()) UI.toast('가운데 점을 문·스위치·가전에 맞춰 주세요.'); });
    }
  },

  // ---------------- VR
  setupXR() {
    if (!navigator.xr || !navigator.xr.isSessionSupported) return;
    navigator.xr.isSessionSupported('immersive-vr').then((ok) => { if (ok) { $('b-vr').hidden = false; $('dock').querySelector('[data-k="vr"]').hidden = false; } }).catch(() => {});
    const xr = R.renderer.xr;
    xr.addEventListener('sessionstart', () => {
      G.xr = true; Sound.init();
      if (Tour.active) Tour.stop(); if (G.state === 'doll') { Doll.anim = null; for (const c of Build.ceilings) c.visible = true; Doll.showLabels(false); }
      if (G.mode) Tools.setMode(null);
      G.state = 'walk'; $('title').hidden = true; UI.show(false); UI.closePanel();
      Player.initXR();
      R.camera.position.set(0, 0, 0); R.camera.rotation.set(0, 0, 0);
      Player.syncXR();
    });
    xr.addEventListener('sessionend', () => {
      G.xr = false; Player.yaw = R.rig.rotation.y; Player.pitch = 0;
      if (UI.vrPanel) UI.vrPanel.visible = false; Player.xr.menu = false;
      UI.show(true); Player.applyCamera();
    });
  },
  async enterVR() {
    if (G.state === 'title') this.start(true);
    try {
      const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      await R.renderer.xr.setSession(s);
    } catch (e) { UI.toast('VR을 시작하지 못했습니다. 헤드셋 브라우저에서 HTTPS 주소로 열어 주세요.'); }
  },

  // ---------------- 루프
  frame(t) {
    try { this.step(t); } catch (e) { if (!this.err) { this.err = true; console.error(e); UI.toast('오류: ' + e.message); } }
    R.renderer.render(R.scene, R.camera);
  },
  step(t) {
    const now = t / 1000, dt = this.last ? clamp(now - this.last, 0.001, 0.1) : 0.016; this.last = now;
    this.logic(dt);
  },
  logic(dt) {
    G.time += dt; Tweens.update(dt);
    if (G.state === 'title') this.titleCam();
    else if (G.xr) Player.updateXR(dt);
    else {
      Player.update(dt);
      Player.updateHover();
      Tools.updateEdit();
      Doll.update(dt);
      Tour.update(dt);
    }
    Interior.update(dt);
    Home.update();
    if (G.state !== 'title' && !G.xr) {
      UI.updateRoom(); UI.updateHint();
      this.planT -= dt; if (this.planT <= 0) { this.planT = 0.1; UI.drawPlan(); }
    }
    if (!HOST) Input.endFrame(); // 바깥 앱은 자기 프레임 끝에서 비운다
  },

  // ---------------- 바깥 앱(부산·울산 VR) 안에서 쓰는 부분
  hostInit() {
    if (this.built) return;
    this.built = true;
    loadSettings();
    G.touch = HOST.touch;
    if (LABEL.tourLast) Object.assign(TOUR[TOUR.length - 1], LABEL.tourLast);
    R.init(); Mats.init(); Mats.apply(G.style);
    Build.init(); Interior.init();
    R.syncHostTime();
    UI.init();
    $('rc-top').textContent = LABEL.top;
    $('dock').querySelector('[data-k="exit"]').hidden = false;
    this.bindInput();
    for (const id of ['d-room2', 'd-room3', 'd-master', 'd-mbath']) { const d = Interior.doorById(id); d.open = true; d.k = 1; Interior.applyDoor(d); }
    R.setLights(false);
    UI.show(false);
    G.state = 'walk';
  },
  hostEnter() {
    this.hostInit();
    APTSTATE.active = true;
    R.setLights(true);
    R.root.add(R.rig); // 카메라 받침을 집 좌표계로 옮긴다
    R.syncHostTime();
    $('dock').querySelector('[data-k="vr"]').hidden = !HOST.vrOk();
    G.state = 'walk'; G.mode = null;
    Player.teleport(3.3, -3.8); Player.lookAt(3.3, 0); Player.pitch = -0.03; Player.sit = false;
    if (R.night > 0.3) this.autoLights();
    UI.lastRoom = undefined;
    if (G.xr) this.hostXRStart(); else { UI.show(true); Player.applyCamera(); }
    Sound.init();
    setTimeout(() => UI.toast(G.touch ? '문·스위치·가전을 누르면 조작됩니다. 아래 막대에서 스타일, 조명, 인형집 뷰, 투어를 골라 보세요.' : 'WASD로 걷고 클릭이나 E로 문·스위치·가전을 조작하세요. 화면을 누르면 시점이 고정되고, Esc로 풀립니다.'), 600);
  },
  hostExit() {
    if (!APTSTATE.active) return;
    if (Tour.active) Tour.stop();
    if (G.mode) Tools.setMode(null);
    if (G.state === 'doll' || G.state === 'dollout') { Doll.anim = null; for (const c of Build.ceilings) c.visible = true; Doll.showLabels(false); HOST.setDoll(false); G.state = 'walk'; }
    UI.closePanel(); $('help').hidden = true;
    APTSTATE.active = false;
    R.setLights(false);
    Sound.toggleMusic(false); for (const k of [...Sound.loops.keys()]) if (k !== 'room') Sound.stopLoop(k);
    if (Player.xr.ctrls.length) Player.showXRLines(false);
    if (UI.vrPanel) UI.vrPanel.visible = false; Player.xr.menu = false;
    UI.show(false);
  },
  hostXRStart() {
    G.xr = true; Player.initXR(); Player.showXRLines(true); UI.show(false); UI.closePanel();
    if (Tour.active) Tour.stop(); if (G.mode) Tools.setMode(null);
    if (G.state === 'doll' || G.state === 'dollout') { Doll.anim = null; for (const c of Build.ceilings) c.visible = true; Doll.showLabels(false); HOST.setDoll(false); G.state = 'walk'; }
    R.camera.position.set(0, 0, 0); R.camera.rotation.set(0, 0, 0);
    Player.syncXR();
  },
  hostXREnd() {
    G.xr = false; Player.yaw = R.rig.rotation.y; Player.pitch = 0;
    if (UI.vrPanel) UI.vrPanel.visible = false; Player.xr.menu = false; Player.showXRLines(false);
    UI.show(true); Player.applyCamera();
  },
  hostUpdate(dt) {
    if (!APTSTATE.active) return;
    this.timeT = (this.timeT || 0) - dt; if (this.timeT <= 0) { this.timeT = 2; R.syncHostTime(); }
    this.logic(dt);
  },
};

const APT_DEBUG = { THREE, G, R, Mats, Build, Interior, Interact, Player, Doll, Tour, Tools, UI, Home, Sound, Tex, F, STYLES, ROOMS, TOUR, Game, Physics, APTSTATE };
if (location.search.includes('debug')) window.__apt = APT_DEBUG;
// 바깥 앱에 돌려줄 손잡이 (혼자 열 때는 바로 시작)
const APT_API = HOST ? {
  build: () => Game.hostInit(), enter: () => Game.hostEnter(), exit: () => Game.hostExit(), update: (dt) => Game.hostUpdate(dt),
  xrStart: () => Game.hostXRStart(), xrEnd: () => Game.hostXREnd(), get active() { return APTSTATE.active; }, get root() { return R.root; },
  player: () => Player.pos, debug: APT_DEBUG,
} : null;
if (!HOST) Game.init();
