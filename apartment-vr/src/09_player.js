// ---------------------------------------------------------------------------
// 움직임: 충돌, 걷기(키보드·마우스·터치), 인형집 뷰 궤도 카메라, 가이드 투어, VR
// ---------------------------------------------------------------------------
const Physics = {
  // 반지름 r인 원이 벽·닫힌 문·가구와 겹치는가
  blocked(x, z, r = 0.22, furnitureOnly = false) {
    const hit = (b) => x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1;
    for (const b of Interior.boxes) if (hit(b)) return true;
    if (furnitureOnly) return false;
    for (const b of Build.colliders) if (hit(b)) return true;
    for (const b of Build.doorBlockers()) if (hit(b)) return true;
    return !roomAt(x, z);
  },
  // 미끄러지며 움직이기
  move(p, dx, dz, r) {
    if (!this.blocked(p.x + dx, p.z + dz, r)) { p.x += dx; p.z += dz; return; }
    if (!this.blocked(p.x + dx, p.z, r)) p.x += dx;
    else if (!this.blocked(p.x, p.z + dz, r)) p.z += dz;
  },
};

const Player = {
  pos: new THREE.Vector3(0.6, 0, 3.0), yaw: Math.PI * 0.75, pitch: -0.05, eye: 1.62, sit: false, vel: new THREE.Vector3(),
  stepAcc: 0, bob: 0,
  ray: new THREE.Raycaster(), hover: null, hoverPoint: null,

  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); },
  teleport(x, z, yaw) { this.pos.set(x, Build.floorY(x, z), z); if (yaw !== undefined) this.yaw = yaw; if (G.xr) this.syncXR(); },
  lookAt(x, z) { this.yaw = Math.atan2(-(x - this.pos.x), -(z - this.pos.z)); },
  room() { return roomAt(this.pos.x, this.pos.z); },

  // ---------------- 데스크톱·터치 걷기
  update(dt) {
    if (G.state !== 'walk') return;
    const s = 0.0022;
    this.yaw -= (Input.mouseDX + Input.lookDX * 1.8) * s;
    this.pitch = clamp(this.pitch - (Input.mouseDY + Input.lookDY * 1.8) * s, -1.35, 1.35);
    let mx = 0, mz = 0;
    if (Input.down('KeyW') || Input.down('ArrowUp')) mz -= 1;
    if (Input.down('KeyS') || Input.down('ArrowDown')) mz += 1;
    if (Input.down('KeyA') || Input.down('ArrowLeft')) mx -= 1;
    if (Input.down('KeyD') || Input.down('ArrowRight')) mx += 1;
    mx += Input.joy.x; mz += Input.joy.y;
    const len = Math.hypot(mx, mz);
    const speed = (Input.down('ShiftLeft') || Input.down('ShiftRight') ? 2.6 : 1.45) * (this.sit ? 0.5 : 1);
    const want = new THREE.Vector3();
    if (len > 0.05) { const k = Math.min(1, len) / len; const f = this.forward(), r = new THREE.Vector3(-f.z, 0, f.x); want.addScaledVector(f, -mz * k * speed).addScaledVector(r, mx * k * speed); }
    this.vel.lerp(want, 1 - Math.exp(-dt * 10));
    const before = this.pos.clone();
    Physics.move(this.pos, this.vel.x * dt, this.vel.z * dt, 0.22);
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    this.pos.y = lerp(this.pos.y, Build.floorY(this.pos.x, this.pos.z), 1 - Math.exp(-dt * 14));
    // 발소리와 걸음 흔들림
    this.bob += moved * 7.5; this.stepAcc += moved;
    if (this.stepAcc > 0.68) { this.stepAcc = 0; const r = this.room(); Sound.step(r ? r.floor : 'wood'); }
    this.applyCamera(moved / Math.max(dt, 1e-3));
  },
  applyCamera(v = 0) {
    const eye = this.sit ? 1.12 : this.eye;
    R.rig.position.copy(this.pos); R.rig.rotation.set(0, this.yaw, 0);
    const bob = Math.sin(this.bob) * 0.012 * clamp(v / 1.4, 0, 1);
    R.camera.position.set(0, eye + bob, 0);
    R.camera.rotation.set(this.pitch, 0, 0, 'YXZ');
  },

  // ---------------- 조작 대상 찾기 (화면 가운데 또는 VR 컨트롤러 광선)
  pick(origin, dir, filter) {
    this.ray.set(origin, dir); this.ray.far = 3.2;
    const targets = filter === 'any' ? [Build.group, Interior.group] : Interact.meshes();
    const hits = this.ray.intersectObjects(targets, true);
    for (const h of hits) {
      if (!h.object.visible || h.object.material === Mats.shadow || h.object.material === Mats.glass) continue;
      if (filter === 'any') return h;
      // 앞에 벽이 가리면 안 된다
      const wall = this.ray.intersectObject(Build.group, true).find((w) => w.object.material !== Mats.glass && w.object.material !== Mats.glassDoor && !w.object.userData.it);
      if (wall && wall.distance < h.distance - 0.02) return null;
      return h;
    }
    return null;
  },
  centerRay() {
    const o = new THREE.Vector3(), d = new THREE.Vector3();
    R.camera.getWorldPosition(o); R.camera.getWorldDirection(d);
    return [o, d];
  },
  updateHover() {
    if (G.state !== 'walk' || G.xr || G.mode) { this.hover = null; return; }
    const [o, d] = this.centerRay();
    const h = this.pick(o, d);
    this.hover = h ? h.object.userData.it : null;
  },
  use() {
    if (!this.hover) return false;
    Sound.init();
    this.hover.act();
    return true;
  },

  // ---------------- VR
  xr: { ctrls: [], turnLatch: false, aiming: false, tpTarget: null, btn: {}, menu: false },
  initXR() {
    const X = this.xr, r = R.renderer;
    if (X.ctrls.length) return;
    for (let i = 0; i < 2; i++) {
      const c = r.xr.getController(i);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xf0d3a4, transparent: true, opacity: 0.7 }));
      line.scale.z = 3; c.add(line);
      const grip = r.xr.getControllerGrip(i);
      const body = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.03, 0.12, 2, 0.012), new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.4 }));
      body.position.z = 0.02; grip.add(body);
      R.rig.add(c); R.rig.add(grip);
      c.userData = { line, idx: i };
      c.addEventListener('connected', (e) => { c.userData.hand = e.data.handedness; c.userData.src = e.data; });
      c.addEventListener('disconnected', () => { c.userData.src = null; });
      c.addEventListener('selectstart', () => this.xrSelect(c));
      X.ctrls.push(c);
    }
    // 순간이동 표시: 포물선과 바닥 고리
    X.arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(new Array(30).fill(0).map(() => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0xd8b27c }));
    X.arc.visible = false; R.scene.add(X.arc);
    X.ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.24, 32), new THREE.MeshBasicMaterial({ color: 0xd8b27c, side: THREE.DoubleSide }));
    X.ringMesh.rotation.x = -Math.PI / 2; X.ringMesh.visible = false; R.scene.add(X.ringMesh);
    // 조작 안내 글씨 (광선이 닿은 곳)
    const c = Tex.canvas(512, 96); X.hintCanvas = c; X.hintTex = Tex.tex(c);
    X.hint = new THREE.Sprite(new THREE.SpriteMaterial({ map: X.hintTex, depthTest: false, transparent: true }));
    X.hint.scale.set(0.42, 0.08, 1); X.hint.visible = false; X.hint.renderOrder = 20; R.scene.add(X.hint);
  },
  xrHand(h) { return this.xr.ctrls.find((c) => c.userData.hand === h); },
  syncXR() { R.rig.position.set(this.pos.x, this.pos.y, this.pos.z); R.rig.rotation.set(0, this.yaw, 0); },
  xrSelect(c) {
    Sound.init();
    if (this.xr.menu && UI.vrMenuSelect(c)) return;
    const it = c.userData.hoverIt;
    if (it) it.act();
  },
  updateXR(dt) {
    const X = this.xr;
    this.yaw = R.rig.rotation.y;
    // 머리 위치 (방 안에서 실제로 걸어 다닌 만큼 포함)
    const head = new THREE.Vector3(); R.camera.getWorldPosition(head);
    let hoverAny = null;
    for (const c of X.ctrls) {
      const src = c.userData.src; if (!src) continue;
      const gp = src.gamepad, hand = c.userData.hand;
      // 광선 조준
      const o = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld), d = new THREE.Vector3(0, 0, -1).transformDirection(c.matrixWorld);
      let len = 3;
      const mh = X.menu && UI.vrPanel && UI.vrPanel.visible && UI.vrPanel.parent !== c ? new THREE.Raycaster(o, d, 0, 2).intersectObject(UI.vrPanel)[0] : null;
      if (mh) { len = mh.distance; UI.vrHover(mh.uv); c.userData.hoverIt = null; }
      else {
        const h = this.pick(o, d);
        c.userData.hoverIt = h ? h.object.userData.it : null;
        if (h) { len = h.distance; if (hand === 'right' || !hoverAny) hoverAny = { it: h.object.userData.it, p: h.point }; }
      }
      c.userData.line.scale.z = len;
      if (!gp) continue;
      const ax = gp.axes[2] || 0, ay = gp.axes[3] || 0;
      const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const edge = (i) => { const k = hand + i, now = b(i), was = X.btn[k]; X.btn[k] = now; return now && !was; };
      if (hand === 'left') {
        // 왼쪽 스틱: 머리가 보는 쪽 기준으로 걷기
        if (Math.hypot(ax, ay) > 0.15) {
          const f = new THREE.Vector3(); R.camera.getWorldDirection(f); f.y = 0; f.normalize();
          const rgt = new THREE.Vector3(-f.z, 0, f.x), sp = 1.5 * dt;
          const mv = new THREE.Vector3().addScaledVector(f, -ay * sp).addScaledVector(rgt, ax * sp);
          const hp = { x: head.x, z: head.z }; Physics.move(hp, mv.x, mv.z, 0.2);
          R.rig.position.x += hp.x - head.x; R.rig.position.z += hp.z - head.z;
        }
        const y = edge(5), x = edge(4);
        if (y || x) UI.toggleVRMenu();
      } else {
        // 오른쪽 스틱: 좌우 30° 회전, 앞으로 밀면 순간이동 조준
        if (Math.abs(ax) > 0.7 && !X.turnLatch) { X.turnLatch = true; this.snapTurn(ax > 0 ? -Math.PI / 6 : Math.PI / 6); }
        if (Math.abs(ax) < 0.3) X.turnLatch = false;
        if (ay < -0.6) { X.aiming = true; this.aimTeleport(o, d); }
        else if (X.aiming) { X.aiming = false; X.arc.visible = X.ringMesh.visible = false; if (X.tpTarget) this.xrTeleport(X.tpTarget); }
        if (edge(4)) UI.toggleVRMenu();
        if (edge(5)) UI.vrQuick();
      }
    }
    // 광선이 닿은 조작 대상 이름
    if (hoverAny && !X.menu) {
      const txt = hoverAny.it.hint();
      if (txt !== X.lastHint) { X.lastHint = txt; const g = X.hintCanvas.getContext('2d'); g.clearRect(0, 0, 512, 96); g.fillStyle = 'rgba(20,18,16,0.85)'; g.beginPath(); g.roundRect(8, 10, 496, 76, 38); g.fill(); g.fillStyle = '#f0d3a4'; g.font = '600 34px "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('트리거 · ' + txt, 256, 50); X.hintTex.needsUpdate = true; }
      X.hint.visible = true; X.hint.position.copy(hoverAny.p).add(new THREE.Vector3(0, 0.12, 0));
    } else X.hint.visible = false;
    // 바닥 높이 (현관 단차)
    R.rig.position.y = lerp(R.rig.position.y, Build.floorY(head.x, head.z), 1 - Math.exp(-dt * 10));
    this.pos.set(head.x, R.rig.position.y, head.z);
  },
  snapTurn(a) {
    // 머리 위치를 축으로 돈다
    const head = new THREE.Vector3(); R.camera.getWorldPosition(head);
    const off = new THREE.Vector3().subVectors(R.rig.position, head).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    R.rig.position.copy(head).add(off); R.rig.position.y = this.pos.y;
    R.rig.rotation.y += a;
  },
  aimTeleport(o, d) {
    const X = this.xr, pts = [], v = d.clone().multiplyScalar(6), p = o.clone(), g = new THREE.Vector3(0, -9.8, 0);
    let hit = null;
    for (let i = 0; i < 30; i++) {
      pts.push(p.clone());
      const np = p.clone().addScaledVector(v, 0.03); v.addScaledVector(g, 0.03);
      if (np.y <= Build.floorY(np.x, np.z) + 0.01) { hit = new THREE.Vector3(np.x, Build.floorY(np.x, np.z), np.z); break; }
      p.copy(np);
    }
    while (pts.length < 30) pts.push(pts[pts.length - 1].clone());
    X.arc.geometry.setFromPoints(pts); X.arc.visible = true;
    const ok = hit && !Physics.blocked(hit.x, hit.z, 0.2);
    X.tpTarget = ok ? hit : null;
    X.ringMesh.visible = !!ok; if (ok) X.ringMesh.position.set(hit.x, hit.y + 0.01, hit.z);
    X.arc.material.color.setHex(ok ? 0xd8b27c : 0xff6a5a);
  },
  xrTeleport(t) {
    const head = new THREE.Vector3(); R.camera.getWorldPosition(head);
    R.rig.position.x += t.x - head.x; R.rig.position.z += t.z - head.z;
    UI.flash('#000', 0.18);
  },
};

// ---------------------------------------------------------------------------
// 인형집 뷰: 천장을 걷고 위에서 비스듬히 내려다본다. 끌어서 돌리고 휠로 확대
// ---------------------------------------------------------------------------
const Doll = {
  az: -0.55, el: 0.92, dist: 17, target: new THREE.Vector3(0, 0, -0.4), anim: null, drag: null, labels: [],
  enter() {
    if (G.state === 'doll') return;
    G.prev = G.state; G.state = 'doll';
    this.from = this.camPose();
    for (const c of Build.ceilings) c.visible = false;
    this.showLabels(true);
    this.anim = { t: 0, dur: 1.3, from: this.from, to: () => this.orbitPose() };
    if (document.pointerLockElement) document.exitPointerLock();
    UI.onMode();
  },
  exit(toX, toZ) {
    if (G.state !== 'doll') return;
    if (toX !== undefined) { Player.teleport(toX, toZ); }
    const target = (() => { const p = Player.pos.clone(); const cam = new THREE.Vector3(p.x, p.y + Player.eye, p.z); const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Player.pitch, Player.yaw, 0, 'YXZ')); return { p: cam, q }; });
    this.anim = { t: 0, dur: 1.1, from: this.camPose(), to: target, done: () => { for (const c of Build.ceilings) c.visible = true; this.showLabels(false); G.state = 'walk'; Player.applyCamera(); UI.onMode(); } };
    G.state = 'dollout';
  },
  camPose() { const p = new THREE.Vector3(), q = new THREE.Quaternion(); R.camera.getWorldPosition(p); R.camera.getWorldQuaternion(q); return { p, q }; },
  orbitPose() {
    const p = new THREE.Vector3(Math.sin(this.az) * Math.cos(this.el), Math.sin(this.el), Math.cos(this.az) * Math.cos(this.el)).multiplyScalar(this.dist).add(this.target);
    const m = new THREE.Matrix4().lookAt(p, this.target, new THREE.Vector3(0, 1, 0));
    return { p, q: new THREE.Quaternion().setFromRotationMatrix(m) };
  },
  setCam(pose) {
    R.rig.position.set(0, 0, 0); R.rig.rotation.set(0, 0, 0);
    R.camera.position.copy(pose.p); R.camera.quaternion.copy(pose.q);
  },
  update(dt) {
    if (this.anim) {
      const a = this.anim; a.t += dt;
      const k = ease(clamp(a.t / a.dur, 0, 1)), to = a.to();
      this.setCam({ p: a.from.p.clone().lerp(to.p, k), q: a.from.q.clone().slerp(to.q, k) });
      if (a.t >= a.dur) { this.anim = null; if (a.done) a.done(); }
      return;
    }
    if (G.state !== 'doll') return;
    this.az += (Input.down('KeyA') || Input.down('ArrowLeft') ? 1 : Input.down('KeyD') || Input.down('ArrowRight') ? -1 : 0) * dt * 0.8;
    this.dist = clamp(this.dist * (1 + Input.wheel * 0.08), 7, 30);
    if (!this.drag) this.az += dt * 0.025;
    this.setCam(this.orbitPose());
    // 방 이름표 크기
    const lh = this.dist * 0.045; for (const l of this.labels) l.scale.set(lh * l.userData.w, lh, 1);
  },
  showLabels(on) {
    if (!this.labels.length) {
      for (const r of ROOMS) {
        if (r.id === 'hall' || r.id === 'corridor') continue;
        const c = Tex.canvas(512, 160), g = c.getContext('2d');
        g.font = '800 64px "Nanum Myeongjo", serif'; const w = Math.max(260, g.measureText(r.name).width + 70);
        c.width = w; const g2 = c.getContext('2d');
        g2.fillStyle = 'rgba(18,16,14,0.78)'; g2.beginPath(); g2.roundRect(4, 8, w - 8, 144, 30); g2.fill();
        g2.fillStyle = '#f4efe8'; g2.font = '800 60px "Nanum Myeongjo", serif'; g2.textAlign = 'center'; g2.fillText(r.name, w / 2, 76);
        g2.fillStyle = '#d8b27c'; g2.font = '500 36px "Noto Sans KR", sans-serif'; g2.fillText(`${roomArea(r).toFixed(1)}㎡`, w / 2, 126);
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.tex(c), depthTest: false, transparent: true }));
        const [x0, z0, x1, z1] = r.rect; s.position.set((x0 + x1) / 2, 2.9, (z0 + z1) / 2); s.renderOrder = 30; s.userData.w = w / 160;
        R.scene.add(s); this.labels.push(s);
      }
    }
    for (const l of this.labels) l.visible = on;
  },
  // 누른 곳이 가구 위면 같은 방 안에서 가장 가까운 빈자리
  freeSpot(x, z) {
    const room = roomAt(x, z);
    for (let r = 0; r < 2.5; r += 0.1) for (let k = 0; k < (r ? 16 : 1); k++) {
      const a = (k / 16) * TAU, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (roomAt(px, pz) === room && !Physics.blocked(px, pz, 0.22)) return { x: px, z: pz };
    }
    return null;
  },
  // 화면 좌표의 바닥 지점
  floorAt(nx, ny) {
    const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(nx, ny), R.camera);
    const t = -rc.ray.origin.y / rc.ray.direction.y; if (!(t > 0)) return null;
    const p = rc.ray.origin.clone().addScaledVector(rc.ray.direction, t);
    return roomAt(p.x, p.z) ? p : null;
  },
};

// ---------------------------------------------------------------------------
// 가이드 투어: 정해진 자리마다 천천히 다가가며 자막을 보여 준다. 사이에는 어둡게 바뀐다
// ---------------------------------------------------------------------------
const Tour = {
  i: -1, t: 0, per: 7.5, active: false,
  start() {
    if (G.state === 'doll') { Doll.anim = null; for (const c of Build.ceilings) c.visible = true; Doll.showLabels(false); }
    for (const d of Build.doors) if (d.id !== 'd-front' && d.id !== 'd-util') Interior.toggleDoor(d, true);
    G.state = 'tour'; this.active = true; this.i = -1; this.next();
    if (document.pointerLockElement) document.exitPointerLock();
    UI.onMode();
  },
  stop() {
    if (!this.active) return;
    this.active = false; G.state = 'walk';
    const s = TOUR[Math.max(0, this.i)];
    Player.teleport(this.cur.x, this.cur.z); Player.lookAt(s.look[0], s.look[1]); Player.pitch = -0.05;
    UI.caption(null); UI.onMode();
  },
  next() {
    this.i++;
    if (this.i >= TOUR.length) { this.stop(); UI.toast('투어를 마쳤습니다. 이제 자유롭게 둘러보세요.'); return; }
    const s = TOUR[this.i];
    UI.flash('#000', 0.45);
    setTimeout(() => {
      const room = roomAt(s.p[0], s.p[1]);
      if (room && Build.lights[room.zone] && TOD[G.tod].night > 0.1) Build.setZone(room.zone, true);
      this.t = 0; UI.caption(s.t, s.d);
    }, 220);
    this.t = -0.25;
  },
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const s = TOUR[this.i]; if (!s) return;
    const k = clamp(this.t / this.per, 0, 1);
    // 바라보는 쪽으로 40cm 다가가며 살짝 돌아본다
    const dx = s.look[0] - s.p[0], dz = s.look[1] - s.p[1], l = Math.hypot(dx, dz) || 1;
    const x = s.p[0] + dx / l * 0.4 * smooth(k), z = s.p[1] + dz / l * 0.4 * smooth(k);
    this.cur = { x, z };
    const yaw = Math.atan2(-dx, -dz) + Math.sin(k * Math.PI) * 0.12 - 0.06;
    R.rig.position.set(x, Build.floorY(x, z), z); R.rig.rotation.set(0, yaw, 0);
    R.camera.position.set(0, 1.58, 0); R.camera.rotation.set(-0.06 + Math.sin(k * Math.PI) * 0.02, 0, 0, 'YXZ');
    Player.pos.set(x, Build.floorY(x, z), z); Player.yaw = yaw;
    UI.captionProgress(k);
    if (this.t > this.per) this.next();
  },
};
