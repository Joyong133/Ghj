// ---------------------------------------------------------------------------
// 플레이어: 이동, 1인칭 검, 공격·검술, 회피·방어, 피해, 성장, VR 조작
// ---------------------------------------------------------------------------
// 선분-선분 최단거리의 제곱 (VR 칼날 vs 몬스터 몸통 판정)
function segSegDist2(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a <= 1e-8 && e <= 1e-8) return r.dot(r);
  if (a <= 1e-8) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-8) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const c1 = p1.clone().addScaledVector(d1, s), c2 = p2.clone().addScaledVector(d2, t);
  return c1.distanceToSquared(c2);
}

// 1인칭 검 동작의 자세 (카메라 기준). rot = [yaw, pitch, roll], 순서 YXZ
const POSES = {
  idle: { p: [0.32, -0.22, -0.58], r: [0.25, 0.65, -0.15] },
  guard: { p: [0.2, -0.18, -0.5], r: [1.35, 0.15, 1.57] },
  r2l: { s: { p: [0.4, -0.2, -0.45], r: [-0.95, 0.15, 0] }, e: { p: [-0.3, -0.28, -0.5], r: [0.95, -0.05, 0] } },
  l2r: { s: { p: [-0.3, -0.18, -0.45], r: [0.95, 0.15, 0] }, e: { p: [0.4, -0.3, -0.5], r: [-0.95, -0.05, 0] } },
  down: { s: { p: [0.14, 0.1, -0.42], r: [-0.05, 1.35, 1.57] }, e: { p: [0.05, -0.3, -0.6], r: [0, -0.4, 1.57] } },
  up: { s: { p: [0.08, -0.32, -0.55], r: [0.1, -0.45, 1.57] }, e: { p: [0.18, 0.08, -0.42], r: [-0.15, 1.25, 1.57] } },
  thrust: { s: { p: [0.2, -0.2, -0.4], r: [0.05, 0.04, 0] }, e: { p: [0.06, -0.15, -0.72], r: [0, 0, 0] } },
  spin: { s: { p: [0.45, -0.2, -0.38], r: [-1.45, 0.1, 0] }, e: { p: [-0.42, -0.26, -0.42], r: [1.5, -0.05, 0] } },
  raise: { s: { p: [0.32, -0.22, -0.58], r: [0.25, 0.65, -0.15] }, e: { p: [0.18, 0.1, -0.38], r: [-0.1, 1.35, 1.57] } },
};
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
function poseQuat(r, out) { _e.set(r[1], r[0], r[2], 'YXZ'); return out.setFromEuler(_e); }

const Player = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, groundY: 0, onGround: true,
  hp: 100, maxHp: 100, alive: true,
  atk: 10, def: 0, crit: 0.05, cdr: 0, moveMul: 1, atkSpeed: 1, wtype: 'sword',
  dodgeT: 0, dodgeCd: 0, dodgeDir: [0, 0], iframe: 0, guarding: false, guardT: 0,
  act: null, comboStep: 0, comboTimer: 0, queued: false,
  skillCd: {}, skillCdMax: {}, potionCd: 0, healLeft: 0, combatT: 0,
  shakeAmt: 0, bobPhase: 0, inSafeZone: false, interact: null,
  sword: null, trail: null, skillSel: 0, xrInit: false,
  _q1: new THREE.Quaternion(), _q2: new THREE.Quaternion(), _v: new THREE.Vector3(), _v2: new THREE.Vector3(),

  level() { return G.save ? G.save.level : 1; },
  weapon() { const s = G.save; return s ? s.inv.find((i) => i.uid === s.equip.weapon) : null; },
  armor() { const s = G.save; return s ? s.inv.find((i) => i.uid === s.equip.armor) : null; },
  distTo(x, z) { return Math.hypot(this.pos.x - x, this.pos.z - z); },
  forwardXZ() {
    if (G.xr) { const d = R.camera.getWorldDirection(this._v2); const l = Math.hypot(d.x, d.z) || 1; return [d.x / l, d.z / l]; }
    return [-Math.sin(this.yaw), -Math.cos(this.yaw)];
  },
  shake(a) { this.shakeAmt = Math.min(1, this.shakeAmt + a); },
  locked() { return !this.alive || (this.act && (this.act.kind === 'skill' || this.act.t < this.act.dur * 0.75)) || this.dodgeT > 0; },

  recalc() {
    const s = G.save; if (!s) return;
    const w = this.weapon(), a = this.armor();
    const wAtk = w ? itemAtk(w) : 8;
    this.atk = wAtk * (1 + s.str * 0.008) * (1 + s.level * 0.01);
    this.def = a ? itemDef(a) : 0;
    this.maxHp = Math.round(BAL.playerHP(s.level) * (1 + s.vit * 0.008) * (1 + ((a && a.hpB) || 0)));
    this.crit = Math.min(0.6, 0.05 + s.agi * 0.002 + (w ? WEAPONS[w.type].crit + (w.critB || 0) : 0));
    this.cdr = Math.min(0.35, s.agi * 0.0015);
    this.moveMul = 1 + Math.min(0.3, s.agi * 0.001);
    this.atkSpeed = (w ? WEAPONS[w.type].speed : 1) * (1 + Math.min(0.3, s.agi * 0.0008));
    const nt = w ? w.type : 'sword';
    const changed = nt !== this.wtype || !this.sword || this.swordUid !== (w && w.uid + ':' + w.plus);
    this.wtype = nt;
    if (this.hp > this.maxHp) this.hp = this.maxHp;
    if (changed) this.buildSword(w);
  },

  // ------------------------------------------------------------------ 검 모델
  buildSword(item) {
    if (this.sword) { this.sword.pivot.removeFromParent(); this.sword.pivot.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    const type = item ? item.type : 'sword', W = WEAPONS[type];
    const rar = item ? RARITY[item.r] : RARITY[0];
    this.swordUid = item ? item.uid + ':' + item.plus : 'none';
    const pivot = new THREE.Group();
    const g = new THREE.Group(); pivot.add(g);
    const steel = new THREE.MeshStandardMaterial({ color: item && item.r === 4 ? 0xf0d8a0 : 0xc4cad2, metalness: 0.92, roughness: 0.26, envMapIntensity: 1.0, emissive: 0x000000 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.8 });
    const goldM = new THREE.MeshStandardMaterial({ color: item && item.r >= 3 ? 0xffcf5a : 0x8a8f99, metalness: 0.9, roughness: 0.3 });
    const len = W.len, wd = W.width;
    const addBlade = (L, x0, z0, ang) => {
      const geo = new THREE.BoxGeometry(wd, 0.014, L, 1, 1, 4);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const z = p.getZ(i); const t = (z + L / 2) / L; p.setX(i, p.getX(i) * (0.55 + 0.45 * t)); }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, steel); m.position.set(x0, 0, z0 - L / 2); m.rotation.y = ang; g.add(m); return m;
    };
    if (type === 'scimitar') {
      let z = -0.04, x = 0; const segs = 4, L = len / segs;
      for (let i = 0; i < segs; i++) { const ang = -i * 0.09; const b = addBlade(L + 0.01, x, z, ang); void b; z -= Math.cos(ang) * L; x -= Math.sin(ang) * L; }
      this._tipLocal = new THREE.Vector3(x, 0, z - 0.05);
    } else {
      addBlade(len, 0, -0.04, 0);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(wd * 0.55 * 0.72, wd * 1.4, 4), steel);
      tip.rotation.x = -Math.PI / 2; tip.rotation.y = Math.PI / 4; tip.scale.set(1, 1, 0.2); tip.position.z = -0.04 - len - wd * 0.6;
      g.add(tip);
      this._tipLocal = new THREE.Vector3(0, 0, -0.06 - len - wd);
    }
    // 홈(풀러)
    if (type !== 'dagger' && type !== 'rapier') { const f = new THREE.Mesh(new THREE.BoxGeometry(wd * 0.18, 0.016, len * 0.7), new THREE.MeshStandardMaterial({ color: 0x8a96a8, metalness: 1, roughness: 0.3 })); f.position.z = -0.04 - len * 0.38; if (type !== 'scimitar') g.add(f); }
    // 날 끝 빛 (희귀 이상)
    const glowCol = new THREE.Color(rar.hex);
    this.edge = new THREE.Mesh(new THREE.BoxGeometry(wd * 1.25, 0.004, len * 0.96), new THREE.MeshBasicMaterial({ color: glowCol, transparent: true, opacity: item && item.r >= 2 ? 0.35 : 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.edge.position.z = -0.04 - len * 0.5;
    if (type !== 'scimitar') g.add(this.edge);
    const guardW = type === 'rapier' ? 0.16 : type === 'greatsword' ? 0.42 : type === 'dagger' ? 0.12 : 0.26;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(guardW, 0.035, 0.05), goldM); guard.position.z = 0; g.add(guard);
    if (type === 'rapier') { const cup = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 6, 0, TAU, 0, Math.PI / 2), goldM); cup.rotation.x = -Math.PI / 2; cup.position.z = 0.0; g.add(cup); }
    const gripL = type === 'greatsword' ? 0.32 : type === 'dagger' ? 0.1 : 0.18;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, gripL, 8), dark); grip.rotation.x = Math.PI / 2; grip.position.z = gripL / 2 + 0.02; g.add(grip);
    const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.032, 0), goldM); pom.position.z = gripL + 0.04; g.add(pom);
    g.position.z = gripL * 0.35; // 손잡이 가운데를 쥔다
    // 장갑 낀 손과 소매
    const glove = new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 0.75, flatShading: true });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x2a3446, roughness: 0.9, flatShading: true });
    const hand = new THREE.Group(); hand.position.z = gripL * 0.35 + 0.02;
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.1), glove); fist.position.set(0.012, -0.004, 0); hand.add(fist);
    for (let i = 0; i < 4; i++) { const k = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.026, 0.022), glove); k.position.set(-0.03, 0.012 - i * 0.004, -0.036 + i * 0.024); hand.add(k); }
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.024, 0.05), glove); thumb.position.set(-0.026, 0.045, -0.02); thumb.rotation.x = 0.4; hand.add(thumb);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.05, 0.07, 8), glove); cuff.rotation.x = Math.PI / 2; cuff.position.set(0.012, -0.01, 0.08); hand.add(cuff);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.12, 8), cloth); sleeve.rotation.x = Math.PI / 2; sleeve.position.set(0.012, -0.01, 0.17); hand.add(sleeve);
    pivot.add(hand);
    g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    this._baseLocal = new THREE.Vector3(0, 0, -0.06 - len * 0.45);
    this.sword = { pivot, blade: g, steel, tipLocal: this._tipLocal.clone().add(new THREE.Vector3(0, 0, g.position.z)), baseLocal: this._baseLocal.clone().add(new THREE.Vector3(0, 0, g.position.z)) };
    if (!this.trail) this.trail = FX.makeTrail(0xffffff);
    this.attachSword();
  },
  attachSword() {
    if (!this.sword) return;
    const piv = this.sword.pivot;
    piv.removeFromParent();
    if (G.xr && this.rightGrip) {
      this.rightGrip.add(piv);
      piv.scale.setScalar(1);
      piv.position.set(0, -0.01, 0.03);
      piv.quaternion.identity(); // 주먹을 관통하는 축(-Z)이 칼날 방향
    } else {
      R.camera.add(piv);
      piv.scale.setScalar(0.8);
      const id = POSES.idle; piv.position.set(...id.p); poseQuat(id.r, piv.quaternion);
    }
  },
  swordTip(out) { return this.sword.pivot.localToWorld(out.copy(this.sword.tipLocal)); },
  swordBase(out) { return this.sword.pivot.localToWorld(out.copy(this.sword.baseLocal)); },

  // ------------------------------------------------------------------ 입장/배치
  placeAt(x, z, yaw) {
    this.pos.set(x, World.ground(x, z), z);
    this.vel.set(0, 0, 0);
    if (yaw !== undefined) { const f = [Math.cos(yaw), Math.sin(yaw)]; this.yaw = Math.atan2(-f[0], -f[1]); }
    this.pitch = 0;
    if (G.xr) {
      const cam = R.renderer.xr.getCamera();
      const head = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
      R.rig.position.x += x - head.x; R.rig.position.z += z - head.z;
      R.rig.position.y = this.pos.y;
    }
  },

  // ------------------------------------------------------------------ 매 프레임
  update(dt) {
    const s = G.save;
    if (!s) return;
    this.iframe = Math.max(0, this.iframe - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.potionCd = Math.max(0, this.potionCd - dt);
    this.combatT = Math.max(0, this.combatT - dt);
    this.comboTimer -= dt; if (this.comboTimer <= 0) this.comboStep = 0;
    for (const k in this.skillCd) this.skillCd[k] = Math.max(0, this.skillCd[k] - dt);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.8);

    if (this.alive) {
      if (G.xr) this.inputXR(dt); else this.inputDesktop(dt);
      this.updateAct(dt);
      this.move(dt);
      this.regen(dt);
      this.findInteract();
    }
    this.updateCamera(dt);
    this.updateSwordPose(dt);
    if (G.xr) { this.updateXRHits(dt); this.updateWrist(dt); }
  },

  inputDesktop(dt) {
    const sens = 0.0022 * G.settings.sens;
    this.yaw -= (Input.mouseDX + Input.lookDX * 2.2) * sens;
    this.pitch -= (Input.mouseDY + Input.lookDY * 2.2) * sens * (G.settings.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.45, 1.45);
    if (Input.clickL || (Input.mouseL && !this.act && G.pointerLocked) || (Input.touchAtk && !this.act)) this.attack();
    for (let i = 0; i < 4; i++) if (Input.hit('Digit' + (i + 1))) this.useSkill(i);
    if (Input.hit('KeyQ') || Input.hit('KeyC') || Input.hit('ControlLeft')) this.dodge();
    if (Input.hit('Space') && this.onGround && !this.locked()) { this.vel.y = 7.2; this.onGround = false; }
    if (Input.hit('KeyR')) this.drinkPotion();
    if (Input.hit('KeyE') && this.interact) Game.interact(this.interact);
    const g = (Input.mouseR || Input.touchGuard) && !this.act && this.dodgeT <= 0;
    if (g && !this.guarding) this.guardT = 0;
    this.guarding = g;
    if (g) this.guardT += dt;
  },

  wishDir() {
    if (G.xr) return this.xrMove || [0, 0];
    let ix = (Input.down('KeyD') ? 1 : 0) - (Input.down('KeyA') ? 1 : 0) + Input.joy.x;
    let iz = (Input.down('KeyW') ? 1 : 0) - (Input.down('KeyS') ? 1 : 0) - Input.joy.y;
    if (Input.down('ArrowUp')) iz += 1; if (Input.down('ArrowDown')) iz -= 1;
    if (Input.down('ArrowLeft')) ix -= 1; if (Input.down('ArrowRight')) ix += 1;
    const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
    const f = this.forwardXZ(), r = [-f[1], f[0]];
    return [f[0] * iz + r[0] * ix, f[1] * iz + r[1] * ix];
  },

  move(dt) {
    const wish = this.wishDir();
    const liquid = World.liquidAt(this.pos.x, this.pos.z);
    const sprint = (Input.down('ShiftLeft') || Input.down('ShiftRight') || (G.touch && Math.hypot(Input.joy.x, Input.joy.y) > 0.92)) && !this.guarding && !this.act;
    let speed = (sprint ? 8.8 : 5.4) * this.moveMul;
    if (this.act) speed *= this.act.kind === 'skill' ? 0 : 0.4;
    if (this.guarding) speed *= 0.45;
    if (liquid && liquid.kind !== 'ice') speed *= 0.55;
    this.sprinting = sprint && Math.hypot(wish[0], wish[1]) > 0.1;
    let vx, vz;
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      vx = this.dodgeDir[0] * 13; vz = this.dodgeDir[1] * 13;
    } else if (this.act && this.act.kind === 'skill' && this.act.S.move && !this.act.vr) {
      const m = this.act.S.move, t = this.act.t;
      if (t >= m.t0 && t <= m.t1) { const sp = m.dist / (m.t1 - m.t0); vx = this.act.dir[0] * sp; vz = this.act.dir[1] * sp; if (m.leap && !this.act.leapt) { this.act.leapt = true; this.vel.y = 6.5; this.onGround = false; } }
      else { vx = this.vel.x * 0.8; vz = this.vel.z * 0.8; }
    } else {
      const k = Math.min(1, dt * (this.onGround ? 12 : 3));
      vx = lerp(this.vel.x, wish[0] * speed, k); vz = lerp(this.vel.z, wish[1] * speed, k);
    }
    this.vel.x = vx; this.vel.z = vz;
    // 수평 이동 + 충돌
    let nx = this.pos.x + vx * dt, nz = this.pos.z + vz * dt;
    if (!World.passable(nx, nz)) {
      if (World.passable(nx, this.pos.z)) nz = this.pos.z;
      else if (World.passable(this.pos.x, nz)) nx = this.pos.x;
      else { nx = this.pos.x; nz = this.pos.z; }
    }
    const p = { x: nx, z: nz };
    if (World.active) World.active.colliders.resolve(p, 0.42);
    this.pos.x = p.x; this.pos.z = p.z;
    // 수직
    const gy = World.ground(this.pos.x, this.pos.z);
    this.groundY = gy;
    if (G.xr) { this.pos.y = gy; this.onGround = true; this.vel.y = 0; }
    else {
      this.vel.y -= 22 * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= gy || (this.onGround && this.pos.y - gy < 0.35 && this.vel.y <= 0)) {
        if (!this.onGround && this.vel.y < -9) { this.shake(0.15); Sfx.step(); }
        this.pos.y = gy; this.vel.y = 0; this.onGround = true;
      } else this.onGround = false;
    }
    // 액체 피해
    if (liquid && this.pos.y - gy < 0.3) {
      if (liquid.kind === 'lava' || liquid.kind === 'void') this.trueDamage(this.maxHp * 0.06 * dt, liquid.kind === 'lava' ? '용암' : '공허');
      else if (liquid.kind === 'poison') this.trueDamage(this.maxHp * 0.015 * dt, '독');
    }
    // 안전 지대(마을)
    this.inSafeZone = G.area === 'town' || (G.area === 'field' && G.floor && Math.hypot(this.pos.x - G.floor.town.x, this.pos.z - G.floor.town.z) < 33);
    // 발소리
    const hs = Math.hypot(vx, vz);
    if (this.onGround && hs > 1) {
      const prev = this.bobPhase;
      this.bobPhase += dt * hs * 1.25;
      if (Math.floor(prev / Math.PI) !== Math.floor(this.bobPhase / Math.PI)) Sfx.step();
    }
  },

  regen(dt) {
    if (this.healLeft > 0) { const h = Math.min(this.healLeft, this.maxHp * 0.3 * dt); this.healLeft -= h; this.hp = Math.min(this.maxHp, this.hp + h); }
    const rate = this.inSafeZone ? 0.1 : this.combatT <= 0 ? 0.02 : 0;
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * rate * dt);
  },

  findInteract() {
    let best = null, bd = 1e9;
    const lists = [World.active ? World.active.interactables : []];
    for (const list of lists) for (const it of list) {
      if (it.hidden) continue;
      if (it.kind === 'chest' && it.chest.opened) continue;
      if (it.kind === 'bossdoor' && World.dungeon && World.dungeon.doorOpen) continue;
      const d = Math.hypot(it.x - this.pos.x, it.z - this.pos.z);
      if (d < it.r && d < bd) { bd = d; best = it; }
    }
    this.interact = best;
  },

  // ------------------------------------------------------------------ 공격
  attack() {
    if (!this.alive || G.xr) return;
    if (this.act) { if (this.act.kind === 'combo' && this.act.t > this.act.dur * 0.35) this.queued = true; return; }
    if (this.dodgeT > 0) return;
    const W = WEAPONS[this.wtype];
    const step = this.comboStep % 3;
    const dur = (0.48 / this.atkSpeed) * (step === 2 ? 1.2 : 1);
    this.act = { kind: 'combo', anims: [[W.combo[step], dur]], t: 0, dur, hitAt: dur * 0.42, hitDone: false, mult: step === 2 ? 1.35 : 1, color: 0xffffff };
    this.comboStep++;
    this.comboTimer = dur + 0.55;
    this.guarding = false;
    setTimeout(() => Sfx.swing(this.wtype === 'greatsword' ? 1.4 : 1), dur * 250);
  },
  useSkill(slot) {
    const id = G.save.slots[slot];
    if (!id || !this.alive) return;
    const S = SKILLS[id];
    if (!skillUsable(id, this.wtype)) { UI.toast(`${S.name}은(는) ${WEAPONS[this.wtype].name}으로 쓸 수 없습니다.`, '#ff9a8a'); Sfx.error(); return; }
    if ((this.skillCd[id] || 0) > 0) return;
    if (this.act && this.act.kind === 'skill') return;
    if (this.dodgeT > 0) return;
    const lv = (G.save.skills[id] && G.save.skills[id].lv) || 1;
    const cd = S.cd * (1 - 0.03 * (lv - 1)) * (1 - this.cdr);
    this.skillCd[id] = cd; this.skillCdMax[id] = cd;
    const total = S.anim.reduce((a, b) => a + b[1], 0);
    this.act = { kind: 'skill', id, S, t: 0, dur: total + S.post, total, anims: S.anim, done: new Array(S.hits.length).fill(false), dir: this.forwardXZ(), start: this.pos.clone(), mult: 1 + 0.06 * (lv - 1), hitAny: false, vr: G.xr };
    this.guarding = false;
    this.comboStep = 0;
    this.trail.mesh.material.uniforms.color.value.setHex(S.color);
    Sfx.skill(slot);
    UI.callout(S.name, '#' + new THREE.Color(S.color).getHexString());
    if (this.sword) this.sword.steel.emissive.setHex(S.color);
  },
  updateAct(dt) {
    const a = this.act; if (!a) return;
    a.t += dt;
    if (a.kind === 'combo') {
      if (!a.hitDone && a.t >= a.hitAt) { a.hitDone = true; const W = WEAPONS[this.wtype]; this.sweep({ arc: W.arc, reach: 0, mult: a.mult }); }
      if (a.t >= a.dur) { this.act = null; if (this.queued) { this.queued = false; this.attack(); } }
      return;
    }
    // 검술
    const S = a.S;
    for (let i = 0; i < S.hits.length; i++) {
      if (a.done[i] || a.t < S.hits[i].t) continue;
      a.done[i] = true;
      const h = S.hits[i];
      const W = WEAPONS[this.wtype];
      const n = this.sweep({ arc: h.arc || W.arc + 20, reach: h.reach || 0, mult: h.mult * a.mult, skill: true, stagger: h.stagger, line: h.line, aoe: h.aoe, path: h.path, color: S.color, skillId: a.id });
      if (n) a.hitAny = true;
      if (h.aoe) { const c = this.pos.clone().addScaledVector(new THREE.Vector3(a.dir[0], 0, a.dir[1]), 1.6); c.y = World.ground(c.x, c.z); FX.ring(c, S.color, h.aoe, 0.45); FX.burst(c.clone().setY(c.y + 0.3), S.color, 50, 9, 0.3, 0.7); this.shake(0.45); Sfx.hit(true); }
      if (h.line) { this.lineFX(h.line, S.color); this.shake(0.3); }
      if (h.arc === 360) FX.ring(this.pos, S.color, (WEAPONS[this.wtype].reach + (h.reach || 0)), 0.3, 1.0);
    }
    if (a.t >= a.dur) {
      this.act = null;
      if (this.sword) this.sword.steel.emissive.setHex(0x000000);
      if (a.hitAny) this.addSkillXp(a.id, 1);
    }
  },
  lineFX(line, color) {
    const f = this.forwardXZ();
    for (let d = 1; d < line.len; d += 0.7) {
      const x = this.pos.x + f[0] * d, z = this.pos.z + f[1] * d;
      FX.burst(new THREE.Vector3(x, World.ground(x, z) + 0.3, z), color, 3, 3, 0.25, 0.5);
    }
  },
  // 범위 안의 몬스터를 찾아 공격 판정
  sweep(o) {
    const f = this.forwardXZ(), px = this.pos.x, pz = this.pos.z;
    const W = WEAPONS[this.wtype];
    let hits = 0;
    for (const e of Ents.list) {
      if (e.dead) continue;
      const dx = e.pos.x - px, dz = e.pos.z - pz, d = Math.hypot(dx, dz);
      const dy = e.center.y - (this.pos.y + 1.2);
      if (Math.abs(dy) > e.height * 0.5 + 2.8) continue;
      let hit = false;
      if (o.aoe) {
        const cx = px + f[0] * 1.6, cz = pz + f[1] * 1.6;
        hit = Math.hypot(e.pos.x - cx, e.pos.z - cz) - e.radius <= o.aoe;
      } else if (o.line) {
        const along = dx * f[0] + dz * f[1], perp = Math.abs(dx * f[1] - dz * f[0]);
        hit = along > -0.5 && along < o.line.len + e.radius && perp < o.line.width / 2 + e.radius;
      } else if (o.path && this.act) {
        const sx = this.act.start.x, sz = this.act.start.z;
        const ax = px - sx, az = pz - sz, l2 = ax * ax + az * az || 1;
        const t = clamp(((e.pos.x - sx) * ax + (e.pos.z - sz) * az) / l2, 0, 1);
        hit = Math.hypot(e.pos.x - (sx + ax * t), e.pos.z - (sz + az * t)) < 1.8 + e.radius;
      } else {
        const reach = W.reach + (o.reach || 0);
        if (d - e.radius > reach) continue;
        if (o.arc >= 360) hit = true;
        else {
          const ang = Math.acos(clamp((dx * f[0] + dz * f[1]) / (d || 1), -1, 1)) / DEG;
          const allow = o.arc / 2 + Math.atan2(e.radius, Math.max(d, 0.1)) / DEG;
          hit = d < e.radius + 0.3 || ang <= allow;
        }
      }
      if (hit && World.active && !o.aoe && World.active.colliders.blocked(px, pz, e.pos.x, e.pos.z)) hit = false;
      if (hit) { this.hitEnemy(e, o.mult, o); hits++; }
    }
    if (hits && !G.xr) G.hitStop = Math.max(G.hitStop, o.skill ? 0.05 : 0.04);
    return hits;
  },
  hitEnemy(e, mult, o = {}) {
    let dmg = this.atk * mult;
    const crit = Math.random() < this.crit;
    if (crit) dmg *= 1.65;
    dmg *= clamp(1 - (e.level - this.level()) * 0.03, 0.4, 1.3);
    dmg = mitigate(dmg, e.def) * (0.92 + Math.random() * 0.16);
    const res = e.damage(dmg, { crit, skill: !!o.skill, stagger: o.stagger });
    if (!res) return;
    const c = e.center.clone();
    const toP = this._v.copy(this.pos).setY(c.y).sub(c).normalize();
    c.addScaledVector(toP, e.radius * 0.8);
    FX.burst(c, crit ? 0xffd24a : o.color || 0xfff2e0, crit ? 26 : 14, crit ? 8 : 6, 0.2, 0.45);
    const numPos = c.clone(); numPos.y += 0.5;
    if (res.blocked) { FX.text('막힘', numPos, '#9aa4b0', 0.4); Sfx.block(); }
    FX.text(fmt(res.amount), numPos, crit ? '#ffd24a' : o.skill ? '#' + new THREE.Color(o.color).getHexString() : '#ffffff', crit ? 0.7 : 0.5);
    Sfx.hit(crit, e.panToPlayer());
    this.shake(crit ? 0.12 : 0.06);
    this.combatT = 6;
    this.haptic('right', crit ? 0.9 : 0.6, 60);
  },
  addSkillXp(id, n) {
    const sk = G.save.skills[id]; if (!sk || sk.lv >= 10) return;
    sk.xp += n;
    const need = Math.round(20 * Math.pow(sk.lv, 1.6));
    if (sk.xp >= need) { sk.xp -= need; sk.lv++; UI.toast(`검술 숙련: ${SKILLS[id].name} ${sk.lv}단계`, '#9fe8ff'); Sfx.pickup(); Game.checkAch(); }
  },
  dodge() {
    if (!this.alive || this.dodgeCd > 0 || (this.act && this.act.kind === 'skill' && this.act.t < this.act.total)) return;
    const w = this.wishDir();
    let dx = w[0], dz = w[1];
    if (Math.hypot(dx, dz) < 0.1) { const f = this.forwardXZ(); dx = -f[0]; dz = -f[1]; }
    const l = Math.hypot(dx, dz); this.dodgeDir = [dx / l, dz / l];
    this.dodgeT = 0.3; this.iframe = 0.3; this.dodgeCd = 0.75;
    this.act = null; this.guarding = false;
    Sfx.swing(0.6);
  },
  drinkPotion() {
    const s = G.save;
    if (!this.alive || this.potionCd > 0) return;
    if (s.potions <= 0) { UI.toast('회복 물약이 없습니다. 마을 잡화상에서 살 수 있습니다.', '#ff9a8a'); Sfx.error(); return; }
    if (this.hp >= this.maxHp) { UI.toast('체력이 가득합니다.'); return; }
    s.potions--; this.potionCd = 2; this.healLeft += this.maxHp * 0.45;
    FX.rise(this.pos, 0x7aff9a, 30, 0.8, 2.2, 1.2);
    Sfx.pickup();
  },

  // ------------------------------------------------------------------ 피해
  hurt(raw, src, o = {}) {
    if (!this.alive || G.state !== 'play') return 'none';
    if (this.iframe > 0) { FX.text('회피', this.textPos(), '#9ad8ff', 0.4); return 'dodged'; }
    const lvMul = src ? clamp(1 + (src.level - this.level()) * 0.04, 0.6, 2.2) : 1;
    let dmg = mitigate(raw * lvMul, this.def) * (0.9 + Math.random() * 0.2);
    const from = o.from || (src && src.pos);
    if (this.guarding && from) {
      const f = this.forwardXZ(); const dx = from.x - this.pos.x, dz = from.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
      const ang = Math.acos(clamp((f[0] * dx + f[1] * dz) / d, -1, 1));
      if (ang < 1.35) {
        if (this.guardT < 0.25 && src && !o.proj) {
          Sfx.parry(); FX.text('패리!', this.textPos(), '#9ae8ff', 0.6);
          FX.burst(this.swordTip(new THREE.Vector3()), 0xbfeeff, 30, 7, 0.22, 0.5);
          if (src.interrupt) src.interrupt(src.boss ? 0.8 : 1.4);
          G.hitStop = 0.09; this.haptic('right', 1, 80);
          return 'parried';
        }
        dmg *= 0.25;
        Sfx.block(); FX.burst(this.swordTip(new THREE.Vector3()), 0xffe0a0, 12, 4, 0.18, 0.35);
        this.shake(0.12);
        this.applyDamage(dmg);
        return 'blocked';
      }
    }
    if (from) { const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1; const k = o.knock ?? 3; this.vel.x += dx / d * k; this.vel.z += dz / d * k; }
    this.applyDamage(dmg);
    this.shake(0.35);
    Sfx.hurt();
    this.haptic('left', 0.8, 120); this.haptic('right', 0.5, 80);
    UI.hurtFlash();
    return 'hit';
  },
  textPos() { const f = this.forwardXZ(); return new THREE.Vector3(this.pos.x + f[0] * 1.6, this.pos.y + 1.5, this.pos.z + f[1] * 1.6); },
  applyDamage(dmg) {
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg; this.combatT = 6;
    if (this.hp <= 0) { this.hp = 0; this.die(); }
  },
  trueDamage(n, why) {
    if (!this.alive) return;
    this.hp -= n; this.combatT = Math.max(this.combatT, 2);
    if (Math.random() < 0.05) UI.hurtFlash(0.4);
    if (this.hp <= 0) { this.hp = 0; this.deathCause = why; this.die(); }
  },
  die() {
    if (!this.alive) return;
    this.alive = false; this.act = null;
    FX.shatter(this.pos.clone().setY(this.pos.y + 0.2), 0.5, 1.8, 0x9ae8ff, 120);
    Sfx.shatter();
    Game.onPlayerDeath();
  },

  gainExp(n) {
    const s = G.save;
    s.exp += Math.round(n);
    let up = false;
    while (s.exp >= BAL.expNext(s.level)) {
      s.exp -= Math.round(BAL.expNext(s.level));
      s.level++; s.statPts += BAL.statPerLevel; up = true;
      for (const id of SKILL_KEYS) {
        if (SKILLS[id].lv <= s.level && !s.skills[id]) {
          s.skills[id] = { lv: 1, xp: 0 };
          const free = s.slots.indexOf(null);
          if (free >= 0 && skillUsable(id, this.wtype)) s.slots[free] = id;
          UI.toast(`새 검술 습득: ${SKILLS[id].name}`, '#9fe8ff');
        }
      }
    }
    if (up) {
      this.recalc(); this.hp = this.maxHp;
      FX.pillar(this.pos, 0xffe8a0); FX.rise(this.pos, 0xffe8a0, 60, 1.2, 4, 1.6);
      Sfx.levelUp();
      UI.banner('LEVEL UP', `레벨 ${s.level} · 능력치 포인트 +${BAL.statPerLevel}`, 2200);
      Game.checkAch();
      Game.autosave();
    }
  },

  // ------------------------------------------------------------------ 카메라와 검 자세
  updateCamera(dt) {
    if (G.xr) return;
    const cam = R.camera;
    R.rig.position.copy(this.pos);
    R.rig.rotation.set(0, this.yaw, 0);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const bob = this.onGround ? Math.sin(this.bobPhase * 2) * 0.035 * Math.min(1, hs / 6) : 0;
    const sh = this.shakeAmt * this.shakeAmt;
    const t = G.time * 40;
    cam.position.set(Math.sin(t * 1.1) * sh * 0.08 + Math.cos(this.bobPhase) * 0.02 * Math.min(1, hs / 6), 1.65 + bob + Math.sin(t * 1.3) * sh * 0.08, 0);
    cam.rotation.set(this.pitch + Math.sin(t * 0.9) * sh * 0.02, 0, Math.sin(t * 0.7) * sh * 0.03, 'YXZ');
    const fov = 72 + (this.sprinting ? 6 : 0) + (this.dodgeT > 0 ? 8 : 0);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = lerp(cam.fov, fov, Math.min(1, dt * 8)); cam.updateProjectionMatrix(); }
  },
  updateSwordPose(dt) {
    if (!this.sword) return;
    const piv = this.sword.pivot;
    const tip = this.swordTip(this._v), base = this.swordBase(this._v2);
    let active = false;
    if (!G.xr) {
      const a = this.act;
      let tp = POSES.idle.p, tq = poseQuat(POSES.idle.r, this._q1);
      let pos = new THREE.Vector3(...tp);
      if (this.guarding) { pos.set(...POSES.guard.p); poseQuat(POSES.guard.r, tq); }
      if (a && a.anims) {
        // 지금 재생 중인 동작 찾기
        let acc = 0, idx = a.anims.length - 1, local = 1;
        for (let i = 0; i < a.anims.length; i++) { const d = a.anims[i][1]; if (a.t < acc + d) { idx = i; local = (a.t - acc) / d; break; } acc += d; }
        const P = POSES[a.anims[idx][0]];
        const last = idx === a.anims.length - 1;
        const inSkill = a.kind === 'skill';
        const wEnd = inSkill ? 0.15 : 0.25, sEnd = inSkill ? 0.85 : 0.6;
        const overAll = a.t >= (a.total || a.dur);
        if (overAll && inSkill) { local = 1; }
        if (local < wEnd) { const k = easeOut(local / wEnd); pos.lerp(new THREE.Vector3(...P.s.p), k); tq.slerp(poseQuat(P.s.r, this._q2), k); }
        else if (local < sEnd || !last) { const k = easeInOut(clamp((local - wEnd) / (sEnd - wEnd), 0, 1)); pos.set(...P.s.p).lerp(new THREE.Vector3(...P.e.p), k); poseQuat(P.s.r, tq).slerp(poseQuat(P.e.r, this._q2), k); active = true; }
        else { const rk = inSkill && overAll ? clamp((a.t - a.total) / Math.max(0.05, a.S.post), 0, 1) : (local - sEnd) / (1 - sEnd); const k = easeInOut(clamp(rk, 0, 1)); pos.set(...P.e.p).lerp(new THREE.Vector3(...POSES.idle.p), k); poseQuat(P.e.r, tq).slerp(poseQuat(POSES.idle.r, this._q2), k); }
      } else {
        // 걷는 동안 살짝 흔들림
        const hs = Math.hypot(this.vel.x, this.vel.z);
        pos.x += Math.cos(this.bobPhase) * 0.012 * Math.min(1, hs / 5);
        pos.y += Math.abs(Math.sin(this.bobPhase)) * 0.015 * Math.min(1, hs / 5);
        pos.y += Math.sin(G.time * 1.6) * 0.004;
      }
      const k = Math.min(1, dt * (a ? 30 : 14));
      piv.position.lerp(pos, k);
      piv.quaternion.slerp(tq, k);
    } else {
      const sp = this._lastTip ? tip.distanceTo(this._lastTip) / Math.max(dt, 1e-3) : 0;
      active = sp > 2.2 || (this.act && this.act.kind === 'skill');
    }
    if (this.trail) FX.updateTrail(this.trail, base, tip, active || (this.act && this.act.kind === 'skill' && this.act.t < this.act.total), dt);
    if (!this.act && this.trail) this.trail.mesh.material.uniforms.color.value.setHex(0xffffff);
    if (this.edge && this.sword) this.edge.material.opacity = (this.weapon() && this.weapon().r >= 2 ? 0.3 : 0) + (this.act && this.act.kind === 'skill' ? 0.5 : 0);
  },

  // ------------------------------------------------------------------ VR
  initXR() {
    if (this.xrInit) return;
    this.xrInit = true;
    const xr = R.renderer.xr;
    this.ctrls = [];
    for (let i = 0; i < 2; i++) {
      const c = xr.getController(i), g = xr.getControllerGrip(i);
      R.rig.add(c); R.rig.add(g);
      c.userData.grip = g;
      c.addEventListener('connected', (e) => {
        c.userData.hand = e.data.handedness; c.userData.gamepad = e.data.gamepad; g.userData.hand = e.data.handedness;
        if (e.data.handedness === 'right') { this.rightCtrl = c; this.rightGrip = g; this.attachSword(); }
        else { this.leftCtrl = c; this.leftGrip = g; this.buildLeftHand(); }
      });
      c.addEventListener('disconnected', () => { c.userData.gamepad = null; });
      c.addEventListener('selectstart', () => { if (G.state === 'menu') UI.vrSelect(); });
      this.ctrls.push(c);
      // 메뉴용 광선
      const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -4)]), new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.7 }));
      ray.visible = false; c.add(ray); c.userData.ray = ray;
    }
    this.btnPrev = {};
  },
  buildLeftHand() {
    if (!this.leftGrip || this.wrist) return;
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 1), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.6, roughness: 0.3 }));
    this.leftGrip.add(orb);
    const c = document.createElement('canvas'); c.width = 512; c.height = 288;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1125), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    panel.position.set(0, 0.035, 0.06); panel.rotation.x = -1.0;
    this.leftGrip.add(panel);
    // 방어용 빛 방패
    const shield = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    shield.position.set(0, 0, -0.08); this.leftGrip.add(shield);
    this.wrist = { canvas: c, tex, panel, t: 0, shield };
  },
  updateWrist(dt) {
    const w = this.wrist; if (!w) return;
    w.shield.material.opacity = this.guarding ? 0.35 : 0;
    w.t -= dt; if (w.t > 0) return; w.t = 0.2;
    const g = w.canvas.getContext('2d'), s = G.save;
    g.clearRect(0, 0, 512, 288);
    g.fillStyle = 'rgba(12,17,25,0.85)'; g.fillRect(0, 0, 512, 288);
    g.strokeStyle = 'rgba(227,192,112,0.6)'; g.lineWidth = 3; g.strokeRect(2, 2, 508, 284);
    g.fillStyle = '#e8edf4'; g.font = '700 34px "IBM Plex Sans KR", sans-serif'; g.fillText(`${s.name}  Lv.${s.level}`, 22, 50);
    g.fillStyle = '#000'; g.fillRect(22, 70, 468, 30);
    const k = this.hp / this.maxHp; g.fillStyle = k > 0.5 ? '#5fd27a' : k > 0.2 ? '#e4c64a' : '#e0554a'; g.fillRect(22, 70, 468 * k, 30);
    g.fillStyle = '#fff'; g.font = '600 22px sans-serif'; g.fillText(`${fmt(this.hp)} / ${fmt(this.maxHp)}`, 30, 93);
    g.fillStyle = '#7cc4ff'; g.fillRect(22, 108, 468 * clamp(s.exp / BAL.expNext(s.level), 0, 1), 8);
    const id = s.slots[this.skillSel];
    const cd = id ? this.skillCd[id] || 0 : 0;
    g.fillStyle = '#e3c070'; g.font = '700 28px "IBM Plex Sans KR", sans-serif';
    g.fillText(`검술: ${id ? SKILLS[id].name : '-'} ${cd > 0 ? '(' + cd.toFixed(1) + ')' : ''}`, 22, 160);
    g.fillStyle = '#95a3b4'; g.font = '500 24px "IBM Plex Sans KR", sans-serif';
    g.fillText(`물약 ${s.potions}  ·  ${fmt(s.col)} Col  ·  제 ${G.floor ? G.floor.f : 1}층`, 22, 205);
    g.fillText('트리거+휘두르기: 검술 · Y: 검술 바꾸기', 22, 250);
    w.tex.needsUpdate = true;
  },
  gp(hand) { const c = hand === 'right' ? this.rightCtrl : this.leftCtrl; return c && c.userData.gamepad; },
  btn(hand, i) { const g = this.gp(hand); return !!(g && g.buttons[i] && g.buttons[i].pressed); },
  btnDown(hand, i) { const k = hand + i, now = this.btn(hand, i), was = this.btnPrev[k]; this.btnPrev[k] = now; return now && !was; },
  haptic(hand, v, ms) {
    if (!G.xr) return;
    const g = this.gp(hand);
    const h = g && g.hapticActuators && g.hapticActuators[0];
    if (h && h.pulse) { try { h.pulse(v, ms); } catch (e) { /* 무시 */ } }
  },
  inputXR(dt) {
    const L = this.gp('left'), Rg = this.gp('right');
    // 왼쪽 스틱: 이동 (머리 방향 기준)
    let mx = 0, my = 0;
    if (L && L.axes.length >= 4) { mx = L.axes[2]; my = L.axes[3]; } else if (L && L.axes.length >= 2) { mx = L.axes[0]; my = L.axes[1]; }
    if (Math.hypot(mx, my) < 0.15) { mx = 0; my = 0; }
    const f = this.forwardXZ(), r = [-f[1], f[0]];
    this.xrMove = [f[0] * -my + r[0] * mx, f[1] * -my + r[1] * mx];
    // 오른쪽 스틱: 스냅 회전
    let rx = 0; if (Rg && Rg.axes.length >= 4) rx = Rg.axes[2]; else if (Rg && Rg.axes.length >= 2) rx = Rg.axes[0];
    if (Math.abs(rx) > 0.7 && !this.snapLatch) { this.snapLatch = true; this.snapTurn(rx > 0 ? -Math.PI / 6 : Math.PI / 6); }
    if (Math.abs(rx) < 0.3) this.snapLatch = false;
    if (G.state !== 'play') return;
    // 버튼: xr-standard 매핑 (0 트리거, 1 그립, 4 A/X, 5 B/Y)
    if (this.btnDown('right', 4) && this.interact) Game.interact(this.interact);
    if (this.btnDown('right', 5)) Game.openMainMenu();
    if (this.btnDown('left', 4)) this.drinkPotion();
    if (this.btnDown('left', 5)) { this.skillSel = (this.skillSel + 1) % 4; Sfx.click(); this.wrist && (this.wrist.t = 0); }
    if (this.btnDown('left', 1)) this.dodge();
    const g = this.btn('left', 0);
    if (g && !this.guarding) this.guardT = 0;
    this.guarding = g; if (g) this.guardT += dt;
    // 오른쪽 트리거 + 빠른 휘두르기 = 검술
    const trig = this.btn('right', 0);
    if (trig && this.swingSpeed > 3 && !(this.act && this.act.kind === 'skill')) this.useSkill(this.skillSel);
  },
  snapTurn(a) {
    const cam = R.renderer.xr.getCamera();
    const head = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const rp = R.rig.position;
    const dx = rp.x - head.x, dz = rp.z - head.z, c = Math.cos(a), s = Math.sin(a);
    rp.x = head.x + dx * c + dz * s; rp.z = head.z - dx * s + dz * c;
    R.rig.rotation.y += a;
  },
  // VR: 머리 위치를 플레이어 위치로 삼고, 이동 결과만큼 rig를 옮긴다
  syncXRBefore() {
    const cam = R.renderer.xr.getCamera();
    if (cam.matrixWorld.elements[13] === 0) { this._xrHead = null; return; } // 아직 첫 자세를 받지 못함
    const head = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const p = { x: head.x, z: head.z };
    if (World.active) World.active.colliders.resolve(p, 0.3);
    if (!World.passable(p.x, p.z)) { p.x = this.pos.x; p.z = this.pos.z; }
    R.rig.position.x += p.x - head.x; R.rig.position.z += p.z - head.z;
    this.pos.x = p.x; this.pos.z = p.z;
    this._xrHead = new THREE.Vector3(p.x, 0, p.z);
  },
  syncXRAfter() {
    if (!this._xrHead) return;
    const head = this._xrHead;
    const dx = this.pos.x - head.x, dz = this.pos.z - head.z;
    R.rig.position.x += dx; R.rig.position.z += dz;
    R.rig.position.y = this.pos.y;
    this._xrHead = null;
  },
  updateXRHits(dt) {
    if (!this.sword || !this.rightGrip) return;
    const tip = this.swordTip(new THREE.Vector3()), base = this.swordBase(new THREE.Vector3());
    const sp = this._lastTip ? tip.distanceTo(this._lastTip) / Math.max(dt, 1e-3) : 0;
    this.swingSpeed = lerp(this.swingSpeed || 0, sp, 0.5);
    this._lastTip = tip.clone();
    if (G.state !== 'play' || !this.alive) return;
    if (sp > 2.2) {
      if (!this._swingSnd || G.time - this._swingSnd > 0.35) { this._swingSnd = G.time; Sfx.swing(clamp(sp / 5, 0.6, 1.4)); }
      for (const e of Ents.list) {
        if (e.dead) continue;
        if (e.pos.distanceTo(this.pos) > 6 + e.radius) continue;
        if (e.lastHitBy.vr && G.time - e.lastHitBy.vr < 0.35) continue;
        const hv = e._hv || 0;
        const a = this._v.set(e.pos.x, e.pos.y + 0.2 + hv, e.pos.z);
        const b = this._v2.set(e.pos.x, e.pos.y + e.height - 0.1 + hv, e.pos.z);
        const r = e.radius + 0.12;
        if (segSegDist2(base, tip, a, b) < r * r) {
          e.lastHitBy.vr = G.time;
          const skill = this.act && this.act.kind === 'skill';
          const mult = clamp(sp / 5, 0.6, 1.5) * (skill ? 1.3 : 1);
          this.hitEnemy(e, mult, { skill, color: skill ? this.act.S.color : 0xffffff });
        }
      }
    }
  },
};
