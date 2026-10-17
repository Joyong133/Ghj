// ---------------------------------------------------------------------------
// 플레이어: 걷기·달리기, 비행, 탑승 중 시점, 건물 충돌, VR 컨트롤러
// ---------------------------------------------------------------------------
const Player = {
  pos: new THREE.Vector3(), yaw: 0, pitch: 0, vel: new THREE.Vector3(),
  mode: 'walk', flySpeed: 40, eye: 1.65, groundY: 0, rideYaw: 0,
  xrInit: false, btnPrev: {}, snapLatch: false,

  alt() { return this.pos.y - this.groundY; },
  forward() {
    if (G.xr) { const d = R.camera.getWorldDirection(new THREE.Vector3()); const l = Math.hypot(d.x, d.z) || 1; return [d.x / l, d.z / l]; }
    return [-Math.sin(this.yaw), -Math.cos(this.yaw)];
  },
  heading() { const f = this.forward(); return Math.atan2(f[0], -f[1]); }, // 북=0, 동=+π/2

  teleport(x, z, yawToward) {
    const g = this.ground(x, z, 9999);
    this.pos.set(x, g, z);
    this.vel.set(0, 0, 0);
    if (this.mode === 'fly') { this.pos.y = g + 60; }
    if (yawToward) this.yaw = Math.atan2(-(yawToward.x - x), -(yawToward.z - z));
    this.pitch = this.mode === 'fly' ? -0.25 : 0;
    this.settle = 3; // 지형이 들어오는 동안 높이를 다시 맞춘다
    if (G.xr) this.syncRigXR(true);
    Store.set(POS_KEY, JSON.stringify({ x, z }));
  },
  ground(x, z, y) {
    let g = Math.max(Terrain.heightAt(x, z), 0);
    const deck = City.deckAt(x, z, y);
    if (deck !== null && (y === undefined || y > deck - 3)) g = Math.max(g, deck);
    return g;
  },
  setMode(m) {
    if (Ride.active) return;
    this.mode = m;
    if (m === 'fly' && this.alt() < 5) this.pos.y += 25;
    UI.modebar();
  },

  update(dt) {
    if (Ride.active) {
      if (G.xr) { this.inputXR(dt); return; } // VR: 탑승 중에도 버튼(내리기·메뉴)과 고개 돌리기
      const before = this.yaw; this.lookInput(); this.rideOffset += this.yaw - before; return;
    }
    if (G.xr) this.inputXR(dt); else this.lookInput();
    const f = this.forward(), r = [-f[1], f[0]];
    let ix = (Input.down('KeyD') || Input.down('ArrowRight') ? 1 : 0) - (Input.down('KeyA') || Input.down('ArrowLeft') ? 1 : 0) + Input.joy.x;
    let iz = (Input.down('KeyW') || Input.down('ArrowUp') ? 1 : 0) - (Input.down('KeyS') || Input.down('ArrowDown') ? 1 : 0) - Input.joy.y;
    if (G.xr && this.xrMove) { ix = this.xrMove[0]; iz = this.xrMove[1]; }
    const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
    if (Input.wheel) { this.flySpeed = clamp(this.flySpeed * (Input.wheel > 0 ? 0.8 : 1.25), 4, 600); UI.modebar(); }
    if (Input.hit('Equal') || Input.hit('NumpadAdd')) { this.flySpeed = clamp(this.flySpeed * 1.5, 4, 600); UI.modebar(); }
    if (Input.hit('Minus') || Input.hit('NumpadSubtract')) { this.flySpeed = clamp(this.flySpeed / 1.5, 4, 600); UI.modebar(); }
    if (this.mode === 'fly') {
      const sp = this.flySpeed * (Input.down('ShiftLeft') || Input.down('ShiftRight') ? 3 : 1);
      const cp = Math.cos(this.pitch), sp2 = Math.sin(this.pitch);
      let vx = (f[0] * iz * (G.xr ? 1 : cp) + r[0] * ix) * sp, vz = (f[1] * iz * (G.xr ? 1 : cp) + r[1] * ix) * sp;
      let vy = (G.xr ? (this.xrVert || 0) : sp2 * iz) * sp;
      if (Input.down('Space') || Input.touchUp) vy += sp * 0.7;
      if (Input.down('KeyC') || Input.down('ControlLeft') || Input.touchDown) vy -= sp * 0.7;
      this.vel.lerp(new THREE.Vector3(vx, vy, vz), Math.min(1, dt * 4));
      this.pos.addScaledVector(this.vel, dt);
      this.groundY = this.ground(this.pos.x, this.pos.z, this.pos.y);
      this.pos.y = clamp(this.pos.y, this.groundY + 1.5, 4000);
    } else {
      const run = Input.down('ShiftLeft') || Input.down('ShiftRight') || Input.touchRun || (G.xr && this.btn('left', 1)); // VR: 왼쪽 그립을 쥐면 달리기
      const sp = run ? 6 : 1.8;
      const wx = (f[0] * iz + r[0] * ix) * sp, wz = (f[1] * iz + r[1] * ix) * sp;
      this.vel.x = lerp(this.vel.x, wx, Math.min(1, dt * 8)); this.vel.z = lerp(this.vel.z, wz, Math.min(1, dt * 8));
      this.tryMove(this.vel.x * dt, this.vel.z * dt);
      const g = this.ground(this.pos.x, this.pos.z, this.pos.y);
      this.groundY = g;
      if (this.settle > 0) { this.settle -= dt; this.pos.y = g; }
      // 계단·언덕은 부드럽게, 떨어질 때는 중력
      if (this.pos.y > g + 0.05) { this.vel.y -= 20 * dt; this.pos.y = Math.max(g, this.pos.y + this.vel.y * dt); }
      else { this.pos.y = lerp(this.pos.y, g, Math.min(1, dt * 12)); this.vel.y = 0; }
      if (Input.hit('Space') && this.pos.y <= g + 0.1) { this.vel.y = 4.5; this.pos.y += 0.05; }
    }
    if (G.xr) this.syncRigXR(false);
  },
  tryMove(dx, dz) {
    const can = (x, z) => {
      if (City.insideBuilding(x, z) || AptHost.blocks(x, z)) return false;
      const deck = City.deckAt(x, z, this.pos.y);
      if (deck === null && Terrain.heightAt(x, z) < 0.1 && Terrain.heightAt(this.pos.x, this.pos.z) >= 0.1) return false; // 바다로는 못 걸어 들어간다
      return true;
    };
    const nx = this.pos.x + dx, nz = this.pos.z + dz;
    if (can(nx, nz)) { this.pos.x = nx; this.pos.z = nz; return; }
    if (can(nx, this.pos.z)) { this.pos.x = nx; return; }
    if (can(this.pos.x, nz)) { this.pos.z = nz; }
  },
  lookInput() {
    if (G.xr) return;
    const s = 0.0022 * G.settings.sens;
    this.yaw -= (Input.mouseDX + Input.lookDX * 2.4) * s;
    this.pitch -= (Input.mouseDY + Input.lookDY * 2.4) * s * (G.settings.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.5, 1.5);
  },
  updateCamera() {
    if (G.xr) return;
    if (Ride.active) return; // followRide에서 처리
    R.rig.position.set(this.pos.x, this.pos.y, this.pos.z);
    R.rig.rotation.set(0, this.yaw, 0);
    const bob = this.mode === 'walk' ? Math.sin(G.time * 9) * 0.02 * Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 2) : 0;
    R.camera.position.set(0, this.mode === 'walk' ? this.eye + bob : 0, 0);
    R.camera.rotation.set(this.pitch, 0, 0, 'YXZ');
  },

  // ---------------- 탑승
  enterRide(kind) { this.modeBefore = this.mode; this.mode = 'ride'; this.rideOffset = kind === 'subway' ? Math.PI / 2 : Math.PI; this.pitch = -0.05; UI.modebar(); },
  exitRide(place) {
    this.mode = this.modeBefore === 'fly' ? 'walk' : (this.modeBefore || 'walk');
    if (G.xr) { R.rig.rotation.set(0, R.rig.rotation.y, 0); }
    if (place) this.teleport(place.x + 3, place.z + 3);
    UI.modebar();
  },
  followRide(interior, kind) {
    // 지하철은 옆을 보는 긴 의자, KTX는 앞을 보는 창가 자리, 버스는 앞쪽 자리
    const seat = kind === 'subway' ? new THREE.Vector3(0.9, 0, 2) : kind === 'ktx' ? new THREE.Vector3(-1.06, 0, 0.1) : new THREE.Vector3(0.65, 0, -2);
    const w = interior.localToWorld(seat.clone());
    this.pos.copy(w);
    this.groundY = w.y;
    this.yaw = interior.rotation.y + this.rideOffset;
    if (G.xr) {
      R.rig.position.copy(w);
      R.rig.rotation.y = this.yaw;
      return;
    }
    R.rig.position.copy(w);
    R.rig.rotation.set(0, this.yaw, 0);
    R.camera.position.set(0, kind === 'subway' ? 1.25 : 1.2, 0);
    R.camera.rotation.set(this.pitch, 0, 0, 'YXZ');
  },

  // ---------------- VR
  // 컨트롤러 객체는 시작할 때 미리 만들어 'connected'를 놓치지 않게 한다(VR 세션 전에 불러야 한다).
  // 버튼·스틱은 그때그때 세션의 입력 장치에서 손(left/right)으로 찾아 읽는다.
  initXR() {
    if (this.xrInit) return;
    this.xrInit = true;
    const xr = R.renderer.xr;
    this.ctrls = [];
    for (let i = 0; i < 2; i++) {
      const c = xr.getController(i), g = xr.getControllerGrip(i);
      R.rig.add(c); R.rig.add(g);
      c.addEventListener('connected', (e) => {
        c.userData.gamepad = e.data.gamepad; c.userData.hand = e.data.handedness;
        if (e.data.handedness === 'right') this.rightCtrl = c; else if (e.data.handedness === 'left') { this.leftCtrl = c; this.buildWrist(g); }
      });
      c.addEventListener('disconnected', () => { c.userData.gamepad = null; if (this.rightCtrl === c) this.rightCtrl = null; if (this.leftCtrl === c) this.leftCtrl = null; c.userData.hand = null; });
      // 트리거: 메뉴에서는 고르기, 걷는 중에는 A와 같이 타기·사용
      c.addEventListener('selectstart', () => {
        if (!G.xr) return;
        if (G.state === 'menu') { UI.vrSelect(c); this.buzz(c.userData.hand, 0.25, 25); }
        else if (G.state === 'play') { if (Game.actionHere()) this.buzz(c.userData.hand, 0.4, 40); Game.useAction(); }
      });
      const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -5)]), new THREE.LineBasicMaterial({ color: 0xffb43a }));
      ray.visible = false; c.add(ray); c.userData.ray = ray;
      // 손 표시
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe8eef4 }));
      g.add(hand);
      this.ctrls.push(c);
    }
    // 걷기 순간이동: 포물선과 바닥 고리
    this.tpArc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(new Array(40).fill(0).map(() => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0xffb43a }));
    this.tpArc.frustumCulled = false; this.tpArc.visible = false; R.scene.add(this.tpArc);
    this.tpRing = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 32), new THREE.MeshBasicMaterial({ color: 0xffb43a, side: THREE.DoubleSide, depthTest: false }));
    this.tpRing.rotation.x = -Math.PI / 2; this.tpRing.visible = false; this.tpRing.renderOrder = 50; R.scene.add(this.tpRing);
  },
  buildWrist(grip) {
    if (this.wrist) return;
    const c = document.createElement('canvas'); c.width = 512; c.height = 288;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1125), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.position.set(0, 0.035, 0.06); m.rotation.x = -1.0; grip.add(m);
    this.wrist = { c, tex, t: 0, m };
  },
  updateWrist(dt) {
    const w = this.wrist; if (!w) return;
    w.m.visible = G.state !== 'apt';
    w.t -= dt; if (w.t > 0) return; w.t = 0.25;
    const g = w.c.getContext('2d');
    g.fillStyle = 'rgba(7,19,30,0.92)'; g.fillRect(0, 0, 512, 288);
    g.fillStyle = '#ffb43a'; g.fillRect(0, 0, 10, 288);
    g.fillStyle = '#eef4f8'; g.font = '700 38px "Gothic A1", sans-serif'; g.fillText(UI.placeName || '부산', 28, 58);
    g.fillStyle = '#93a7b8'; g.font = '500 26px "Gothic A1", sans-serif';
    g.fillText(UI.nearText || '', 28, 104);
    g.fillText(`${this.mode === 'fly' ? '비행' : this.mode === 'ride' ? '탑승 중' : '걷기'} · 고도 ${Math.round(this.pos.y)} m`, 28, 148);
    if (this.mode === 'ride') { g.fillText('트리거·A: 정차 중 내리기  B: 메뉴', 28, 200); g.fillText('오른쪽 스틱 좌우: 고개 돌리기', 28, 244); }
    else if (this.mode === 'fly') { g.fillText('트리거·A: 사용  B: 메뉴  Y: 걷기로', 28, 200); g.fillText('오른쪽 스틱 위아래: 오르내리기', 28, 244); }
    else { g.fillText('트리거·A: 타기·사용  B: 메뉴  Y: 비행', 28, 200); g.fillText('오른쪽 스틱 앞으로: 순간이동  X: 명소', 28, 244); }
    w.tex.needsUpdate = true;
  },
  // 손으로 입력 장치 찾기 (connected 이벤트를 놓쳐도 동작하게 세션에서 바로 읽는다)
  gp(hand) {
    const s = R.renderer.xr.getSession && R.renderer.xr.getSession();
    if (s) for (const src of s.inputSources) if (src.handedness === hand && src.gamepad) return src.gamepad;
    const c = hand === 'right' ? this.rightCtrl : this.leftCtrl; return c && c.userData.gamepad;
  },
  // 손에 짧은 진동 (지원하는 컨트롤러만)
  buzz(hand, k = 0.3, ms = 30) {
    const g = this.gp(hand || 'right'), h = g && g.hapticActuators && g.hapticActuators[0];
    try { if (h && h.pulse) h.pulse(k, ms); } catch (e) { /* 진동 없음 */ }
  },
  ctrl(hand) { return (hand === 'right' ? this.rightCtrl : this.leftCtrl) || (this.ctrls && this.ctrls.find((c) => c.userData.hand === hand)) || (this.ctrls && this.ctrls[hand === 'right' ? 1 : 0]); },
  btn(hand, i) { const g = this.gp(hand); return !!(g && g.buttons[i] && g.buttons[i].pressed); },
  btnDown(hand, i) { const k = hand + i, now = this.btn(hand, i), was = this.btnPrev[k]; this.btnPrev[k] = now; return now && !was; },
  axes(hand) { const g = this.gp(hand); if (!g) return [0, 0]; const a = g.axes; return a.length >= 4 ? [a[2], a[3]] : [a[0] || 0, a[1] || 0]; },
  inputXR(dt) {
    const [lx, ly] = this.axes('left'), [rx, ry] = this.axes('right');
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    // 오른쪽 스틱 좌우: 30° 돌기 (탑승 중에는 차 안에서 고개 방향만)
    if (Math.abs(rx) > 0.7 && !this.snapLatch) { this.snapLatch = true; const a = rx > 0 ? -Math.PI / 6 : Math.PI / 6; if (Ride.active) this.rideOffset += a; else this.snapTurn(a); }
    if (Math.abs(rx) < 0.3) this.snapLatch = false;
    const useA = this.btnDown('right', 4), menuB = this.btnDown('right', 5), modeY = this.btnDown('left', 5), placesX = this.btnDown('left', 4), stickL = this.btnDown('left', 3), stickR = this.btnDown('right', 3), stick = stickL || stickR;
    if (Ride.active) {
      this.xrMove = [0, 0]; this.xrVert = 0;
      if (useA) Game.useAction();
      if (menuB) Game.openMenu();
      return;
    }
    this.xrMove = [dz(lx), -dz(ly)];
    this.xrVert = this.mode === 'fly' ? -dz(ry) : 0;
    if (stick) { this.flySpeed = clamp(this.flySpeed * 1.6, 4, 600); if (this.flySpeed >= 599) this.flySpeed = 10; UI.modebar(); UI.toast(`비행 속도 ${Math.round(this.flySpeed * 3.6)} km/h`); }
    // 걷는 중 오른쪽 스틱을 앞으로 밀면 순간이동 조준, 놓으면 이동
    if (this.mode === 'walk') {
      if (ry < -0.6 && Math.abs(rx) < 0.6) { this.tpAiming = true; this.aimTeleport(); }
      else if (this.tpAiming && ry > -0.3) { this.tpAiming = false; this.tpArc.visible = this.tpRing.visible = false; if (this.tpTarget) this.doTeleport(this.tpTarget); }
    } else if (this.tpAiming) { this.tpAiming = false; this.tpArc.visible = this.tpRing.visible = false; }
    if (G.state !== 'play') return;
    if (useA) Game.useAction();
    if (menuB) Game.openMenu();
    if (modeY) this.setMode(this.mode === 'fly' ? 'walk' : 'fly');
    if (placesX) Game.openPlaces();
  },
  // 메뉴가 열려 있는 동안: B는 뒤로, 오른쪽 스틱 좌우는 쪽 넘기기. (버튼 이전 상태도 여기서 갱신)
  menuInputXR() {
    const bR = this.btnDown('right', 5), bL = this.btnDown('left', 5), back = bR || bL;
    this.btnDown('right', 4); this.btnDown('left', 4); this.btnDown('left', 3); this.btnDown('right', 3);
    const [rx] = this.axes('right');
    if (Math.abs(rx) > 0.7 && !this.snapLatch) { this.snapLatch = true; UI.vrPage(rx > 0 ? 1 : -1); }
    if (Math.abs(rx) < 0.3) this.snapLatch = false;
    if (back) UI.back();
  },
  // 포물선 조준: 오른손에서 초속 10m로 던진 공이 떨어지는 곳
  aimTeleport() {
    const c = this.ctrl('right'); if (!c) return;
    const o = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld), d = new THREE.Vector3(0, 0, -1).transformDirection(c.matrixWorld);
    const v = d.clone().multiplyScalar(10), p = o.clone(), pts = [];
    let hit = null;
    for (let i = 0; i < 40; i++) {
      pts.push(p.clone());
      const np = p.clone().addScaledVector(v, 0.05); v.y -= 9.8 * 0.05;
      const g = this.ground(np.x, np.z, np.y);
      if (np.y <= g) { hit = new THREE.Vector3(np.x, g, np.z); pts.push(hit.clone()); break; }
      p.copy(np);
    }
    while (pts.length < 40) pts.push(pts[pts.length - 1].clone());
    this.tpArc.geometry.setFromPoints(pts); this.tpArc.visible = true;
    const ok = hit && !City.insideBuilding(hit.x, hit.z) && !AptHost.blocks(hit.x, hit.z) && (Terrain.heightAt(hit.x, hit.z) >= 0.1 || City.deckAt(hit.x, hit.z, hit.y + 2) !== null);
    this.tpTarget = ok ? hit : null;
    this.tpRing.visible = !!ok; if (ok) this.tpRing.position.set(hit.x, hit.y + 0.05, hit.z);
    this.tpArc.material.color.setHex(ok ? 0xffb43a : 0xff5a4a);
  },
  doTeleport(t) {
    this.pos.set(t.x, t.y, t.z); this.vel.set(0, 0, 0); this.settle = 0.5;
    VRFade.blink(); this.buzz('right', 0.3, 30);
  },
  snapTurn(a) {
    const cam = R.renderer.xr.getCamera();
    const head = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const rp = R.rig.position, dx = rp.x - head.x, dz = rp.z - head.z, c = Math.cos(a), s = Math.sin(a);
    rp.x = head.x + dx * c + dz * s; rp.z = head.z - dx * s + dz * c;
    R.rig.rotation.y += a;
  },
  // VR에서는 머리 위치가 곧 플레이어 위치. 이동 결과만큼 rig를 옮긴다.
  syncRigXR(hard) {
    const cam = R.renderer.xr.getCamera();
    const e = cam.matrixWorld.elements;
    if (!hard && e[13] !== 0) {
      const hx = e[12], hz = e[14];
      R.rig.position.x += this.pos.x - hx; R.rig.position.z += this.pos.z - hz;
    } else { R.rig.position.x = this.pos.x; R.rig.position.z = this.pos.z; }
    R.rig.position.y = this.mode === 'fly' ? this.pos.y - 1.6 : this.pos.y;
  },
  // VR 프레임 시작: 실제로 걸어 움직인 만큼 플레이어 위치를 갱신
  beginXRFrame() {
    if (Ride.active) return;
    const cam = R.renderer.xr.getCamera();
    const e = cam.matrixWorld.elements;
    if (e[13] === 0) return;
    const nx = e[12], nz = e[14];
    if (!City.insideBuilding(nx, nz) && !AptHost.blocks(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
  },
};

// ---------------------------------------------------------------------------
// VR 화면 가리개: 순간이동·건물 출입 때 잠깐 어둡게 (머리에 붙은 검은 구)
// ---------------------------------------------------------------------------
const VRFade = {
  mesh: null, k: 0, target: 0, speed: 6,
  init() {
    if (this.mesh) return;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 8), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
    this.mesh.renderOrder = 999; this.mesh.frustumCulled = false; this.mesh.visible = false;
    R.camera.add(this.mesh);
  },
  set(on, speed = 6) { this.init(); this.target = on ? 1 : 0; this.speed = speed; },
  blink() { this.init(); this.k = 1; this.target = 0; this.speed = 5; },
  update(dt) {
    if (!this.mesh) return;
    this.k += clamp(this.target - this.k, -this.speed * dt, this.speed * dt);
    this.mesh.material.opacity = this.k;
    this.mesh.visible = G.xr && this.k > 0.001;
  },
};
