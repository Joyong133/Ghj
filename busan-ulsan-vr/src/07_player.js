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
    if (Ride.active) { const before = this.yaw; this.lookInput(); this.rideOffset += this.yaw - before; return; }
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
      const run = Input.down('ShiftLeft') || Input.down('ShiftRight') || Input.touchRun;
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
      if (City.insideBuilding(x, z)) return false;
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
        if (e.data.handedness === 'right') this.rightCtrl = c; else { this.leftCtrl = c; this.buildWrist(g); }
      });
      c.addEventListener('selectstart', () => { if (G.state === 'menu') UI.vrSelect(); });
      const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -5)]), new THREE.LineBasicMaterial({ color: 0xffb43a }));
      ray.visible = false; c.add(ray); c.userData.ray = ray;
      // 손 표시
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe8eef4 }));
      g.add(hand);
      this.ctrls.push(c);
    }
  },
  buildWrist(grip) {
    if (this.wrist) return;
    const c = document.createElement('canvas'); c.width = 512; c.height = 288;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1125), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.position.set(0, 0.035, 0.06); m.rotation.x = -1.0; grip.add(m);
    this.wrist = { c, tex, t: 0 };
  },
  updateWrist(dt) {
    const w = this.wrist; if (!w) return;
    w.t -= dt; if (w.t > 0) return; w.t = 0.25;
    const g = w.c.getContext('2d');
    g.fillStyle = 'rgba(7,19,30,0.92)'; g.fillRect(0, 0, 512, 288);
    g.fillStyle = '#ffb43a'; g.fillRect(0, 0, 10, 288);
    g.fillStyle = '#eef4f8'; g.font = '700 38px "Gothic A1", sans-serif'; g.fillText(UI.placeName || '부산', 28, 58);
    g.fillStyle = '#93a7b8'; g.font = '500 26px "Gothic A1", sans-serif';
    g.fillText(UI.nearText || '', 28, 104);
    g.fillText(`${this.mode === 'fly' ? '비행' : this.mode === 'ride' ? '탑승 중' : '걷기'} · 고도 ${Math.round(this.pos.y)} m`, 28, 148);
    g.fillText('A: 타기·사용  B: 메뉴  Y: 비행', 28, 200);
    g.fillText('X: 명소로 이동  오른쪽 스틱: 회전·상하', 28, 244);
    w.tex.needsUpdate = true;
  },
  gp(hand) { const c = hand === 'right' ? this.rightCtrl : this.leftCtrl; return c && c.userData.gamepad; },
  btn(hand, i) { const g = this.gp(hand); return !!(g && g.buttons[i] && g.buttons[i].pressed); },
  btnDown(hand, i) { const k = hand + i, now = this.btn(hand, i), was = this.btnPrev[k]; this.btnPrev[k] = now; return now && !was; },
  axes(hand) { const g = this.gp(hand); if (!g) return [0, 0]; const a = g.axes; return a.length >= 4 ? [a[2], a[3]] : [a[0] || 0, a[1] || 0]; },
  inputXR(dt) {
    const [lx, ly] = this.axes('left'), [rx, ry] = this.axes('right');
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    this.xrMove = [dz(lx), -dz(ly)];
    if (Math.abs(rx) > 0.7 && !this.snapLatch) { this.snapLatch = true; this.snapTurn(rx > 0 ? -Math.PI / 6 : Math.PI / 6); }
    if (Math.abs(rx) < 0.3) this.snapLatch = false;
    this.xrVert = this.mode === 'fly' ? -dz(ry) : 0;
    if (this.btnDown('left', 3) || this.btnDown('right', 3)) { this.flySpeed = clamp(this.flySpeed * 1.6, 4, 600); if (this.flySpeed >= 599) this.flySpeed = 10; UI.modebar(); }
    if (G.state !== 'play') return;
    if (this.btnDown('right', 4)) Game.useAction();
    if (this.btnDown('right', 5)) Game.openMenu();
    if (this.btnDown('left', 5)) this.setMode(this.mode === 'fly' ? 'walk' : 'fly');
    if (this.btnDown('left', 4)) Game.openPlaces();
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
    if (!City.insideBuilding(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
  },
};
