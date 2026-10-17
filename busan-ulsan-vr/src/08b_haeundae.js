// ---------------------------------------------------------------------------
// 해운대 아파트: 해수욕장 앞 45층 타워의 38층 집. 1층 입구에서 엘리베이터로 올라가 집 안을 구경한다.
// 집 안(벽, 가구, 조명, 조작, 인형집, 투어 등)은 apartment/ 코드(Apt)가 만들고,
// 여기서는 타워 겉모습, 자리, 들어가고 나오기, 시간대 연결을 맡는다.
// 집 좌표: x 동쪽, z 남쪽, 집 바닥이 y=0. 남쪽(+z) 통창이 해변을 본다.
// ---------------------------------------------------------------------------
const HAE_APT = { lat: 35.1600, lon: 129.1585, floor: 38, floors: 45, floorH: 3.05, ground: 4 };

const AptHost = {
  p: GEO.toWorld(HAE_APT.lat, HAE_APT.lon),
  base: HAE_APT.ground + (HAE_APT.floor - 1) * HAE_APT.floorH,
  tower: null, upper: null, entry: null, saved: null, busy: false,

  origin() { return new THREE.Vector3(this.p.x, this.base, this.p.z); },
  // 타워가 차지하는 땅 (걸어서 못 들어간다)
  blocks(x, z) { const lx = x - this.p.x, lz = z - this.p.z; return lx > -6.5 && lx < 6.5 && lz > -6.3 && lz < 4.95; },
  // OSM 건물이 이 자리와 겹치면 짓지 않는다
  overlaps(bb) { return bb.x1 > this.p.x - 10 && bb.x0 < this.p.x + 10 && bb.z1 > this.p.z - 10 && bb.z0 < this.p.z + 9; },
  entrance() { return { x: this.p.x + 0.4, z: this.p.z + 5.9 }; },

  // ---------------- 타워 겉모습 (가까이 오면 한 번 만든다)
  facadeTex() {
    const W = 512, H = 1024, c = document.createElement('canvas'), e = document.createElement('canvas');
    c.width = e.width = W; c.height = e.height = H;
    const g = c.getContext('2d'), ge = e.getContext('2d'), rnd = mulberry32(38);
    ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
    const floors = 8, bays = 4, fh = H / floors, bw = W / bays;
    for (let f = 0; f < floors; f++) {
      const y = f * fh;
      g.fillStyle = '#e9e6df'; g.fillRect(0, y, W, fh);
      g.fillStyle = '#d4cfc6'; g.fillRect(0, y + fh - 14, W, 14); // 층 띠
      for (let b = 0; b < bays; b++) {
        const x = b * bw + 8, w = bw - 16;
        const gr = g.createLinearGradient(0, y + 10, 0, y + fh - 16); gr.addColorStop(0, '#7f9cb2'); gr.addColorStop(1, '#3d5468');
        g.fillStyle = gr; g.fillRect(x, y + 10, w, fh - 28);
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x, y + 10, w, 3);
        g.fillStyle = '#2b2f33'; g.fillRect(x + w / 2 - 2, y + 10, 4, fh - 28);
        g.fillStyle = 'rgba(240,240,236,0.85)'; g.fillRect(x, y + fh * 0.62, w, 3); // 난간
        if (rnd() < 0.45) { ge.fillStyle = rnd() < 0.75 ? `rgb(255,${200 + rnd() * 30},${130 + rnd() * 50})` : '#cfe0ff'; ge.fillRect(x, y + 10, w, fh - 28); }
      }
    }
    const t = new THREE.CanvasTexture(c), te = new THREE.CanvasTexture(e);
    for (const x of [t, te]) { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.colorSpace = THREE.SRGBColorSpace; x.anisotropy = 4; }
    return { t, te };
  },
  buildTower() {
    const g = new THREE.Group(); g.position.set(this.p.x, 0, this.p.z);
    const { t, te } = this.facadeTex();
    const mk = (floorsTall) => { const m = new THREE.MeshStandardMaterial({ map: t.clone(), emissiveMap: te.clone(), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6, metalness: 0.15 }); m.map.repeat.set(3, floorsTall / 8); m.emissiveMap.repeat.set(3, floorsTall / 8); m.map.needsUpdate = m.emissiveMap.needsUpdate = true; return m; };
    const W = 12.4, D = 10.7, cz = -0.65, B = this.base, top = HAE_APT.ground + HAE_APT.floors * HAE_APT.floorH;
    // 아래층 (땅속 8m부터: 지형 높이가 조금 달라도 뜨지 않게)
    const lowH = B - 0.4 + 8;
    this.lowMat = mk(HAE_APT.floor - 1);
    const low = new THREE.Mesh(new THREE.BoxGeometry(W, lowH, D), this.lowMat); low.position.set(0, -8 + lowH / 2, cz); low.castShadow = low.receiveShadow = true; g.add(low);
    const concrete = new THREE.MeshStandardMaterial({ color: 0xc9c4bb, roughness: 0.85 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, 0.4, D), concrete); slab.position.set(0, B - 0.2, cz); slab.receiveShadow = true; g.add(slab);
    // 우리 집 층: 벽 위 2.4~2.62m 띠 (천장 안쪽이 밖에서 보이지 않게)
    const band = new THREE.Group(); g.add(band);
    for (const [w, d, x, z] of [[W, 0.3, 0, 4.7], [W, 0.3, 0, -6.0], [0.3, D, 6.2, cz], [0.3, D, -6.2, cz]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.24, d), concrete); m.position.set(x, B + 2.51, z); band.add(m); }
    // 위층과 옥상 (인형집 뷰에서는 걷어 낸다)
    const upH = top - (B + 2.62);
    this.upMat = mk(HAE_APT.floors - HAE_APT.floor);
    const up = new THREE.Group(); g.add(up);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(W, upH, D), this.upMat); upper.position.set(0, B + 2.62 + upH / 2, cz); upper.castShadow = true; up.add(upper);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 6, D * 0.6), concrete); crown.position.set(0, top + 3, cz); up.add(crown);
    this.crownLed = new THREE.Mesh(new THREE.BoxGeometry(W * 0.72, 0.4, D * 0.62), new THREE.MeshBasicMaterial({ color: 0xd8b27c }));
    this.crownLed.position.set(0, top + 5.6, cz); up.add(this.crownLed);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), Decor.aviationMat()); beacon.position.set(0, top + 6.5, cz); up.add(beacon);
    band.userData.doll = true; this.upper = up;
    // 1층 입구 (남쪽, 해변 쪽): 캐노피, 유리문, 이름판
    const entry = new THREE.Group(); g.add(entry);
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.5, metalness: 0.4 });
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(5, 0.25, 2.4), dark); canopy.position.set(0.4, 3.4, 5.9); entry.add(canopy);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 0.06), new THREE.MeshStandardMaterial({ color: 0x9fc0d4, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.55, emissive: 0xffd9a0, emissiveIntensity: 0.2 }));
    glass.position.set(0.4, 1.3, 4.72); entry.add(glass);
    for (const x of [-1.2, 2.0]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.4, 0.18), dark); p.position.set(x, 1.7, 7.0); entry.add(p); }
    const sc = document.createElement('canvas'); sc.width = 512; sc.height = 96; const sg = sc.getContext('2d');
    sg.fillStyle = '#1f1d1b'; sg.fillRect(0, 0, 512, 96); sg.fillStyle = '#d8b27c'; sg.font = '700 46px "Nanum Myeongjo", serif'; sg.textAlign = 'center'; sg.textBaseline = 'middle'; sg.fillText('해운대 아파트', 256, 50);
    const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), new THREE.MeshBasicMaterial({ map: st })); sign.position.set(0.4, 3.4, 7.11); entry.add(sign);
    this.entry = entry;
    R.scene.add(g);
    this.tower = g;
  },
  setDoll(on) { if (this.upper) this.upper.visible = !on; },

  // ---------------- 매 프레임 (상태와 관계없이)
  tick(dt) {
    if (!this.tower) { if (Math.hypot(Player.pos.x - this.p.x, Player.pos.z - this.p.z) < 4000) this.buildTower(); return; }
    const n = R.nightU.value;
    this.lowMat.emissiveIntensity = this.upMat.emissiveIntensity = n > 0.3 ? 1.2 : 0;
    this.crownLed.material.color.setHSL(0.09, 0.5, n > 0.3 ? 0.62 : 0.35);
    this.groundT = (this.groundT || 0) - dt;
    if (this.groundT <= 0) { this.groundT = 2; this.entry.position.y = Math.max(Terrain.heightAt(this.p.x, this.p.z + 6), 0); }
  },
  // 입구 앞에서 E
  action(x, z) {
    if (!this.tower) return null;
    const e = this.entrance();
    if (Math.hypot(x - e.x, z - e.z) > 5) return null;
    return { label: '해운대 아파트 38층 · 집 구경하기', short: '집 구경', fn: () => this.enter() };
  },

  // ---------------- 들어가고 나오기 (검은 화면으로 바꾸는 동안 처리)
  fade(on, then) {
    if (G.xr) VRFade.set(on, 2.6); // VR에서는 화면 요소가 안 보이므로 눈앞을 가린다
    if (!this.fadeEl) { const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:60;transition:opacity .45s'; document.body.appendChild(d); this.fadeEl = d; }
    this.fadeEl.style.opacity = on ? '1' : '0';
    if (then) setTimeout(then, 480);
  },
  enter() {
    if (this.busy || G.state === 'apt' || Ride.active) return;
    this.busy = true;
    UI.banner('해운대 아파트', '엘리베이터로 38층에 올라갑니다', 2400);
    this.fade(true, () => {
      try {
        Apt.build();
        const sc = R.sun.shadow.camera;
        this.saved = { near: R.camera.near, exp: R.renderer.toneMappingExposure, sc: [sc.left, sc.right, sc.top, sc.bottom, sc.near, sc.far], bias: R.sun.shadow.normalBias };
        G.state = 'apt'; UI.show(false); if (UI.vr) UI.vr.mesh.visible = false;
        for (const p of PLACES) if (p.label) p.label.visible = false;
        R.camera.near = 0.05; R.camera.updateProjectionMatrix();
        R.renderer.toneMappingExposure = 1.08;
        // 햇빛 그림자를 집 둘레로 좁혀 창틀 그림자가 또렷하게
        sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 900; sc.far = 1100; sc.updateProjectionMatrix(); R.sun.shadow.normalBias = 0.03;
        Apt.enter();
      } catch (e) { console.error(e); UI.toast('집을 짓지 못했습니다: ' + e.message, '#ff8a6a'); G.state = 'play'; UI.show(true); }
      this.fade(false); this.busy = false;
    });
  },
  exit() {
    if (this.busy || G.state !== 'apt') return;
    this.busy = true;
    this.fade(true, () => {
      Apt.exit();
      R.scene.add(R.rig); // 카메라 받침을 다시 월드로
      const s = this.saved, sc = R.sun.shadow.camera;
      R.camera.near = s.near; R.camera.updateProjectionMatrix(); R.renderer.toneMappingExposure = s.exp;
      [sc.left, sc.right, sc.top, sc.bottom, sc.near, sc.far] = s.sc; sc.updateProjectionMatrix(); R.sun.shadow.normalBias = s.bias;
      G.state = 'play'; Player.mode = 'walk';
      const e = this.entrance();
      Player.teleport(e.x, e.z + 2.5, { x: e.x, z: e.z + 40 }); // 해변을 보며 선다
      UI.show(true); UI.modebar();
      UI.banner('해운대 아파트', '1층 로비로 나왔습니다', 2200);
      this.fade(false); this.busy = false;
    });
  },
  // 집 안에 있는 동안: 집 코드를 돌리고, 지도 불러오기·해 위치가 따라오도록 플레이어 위치를 맞춘다
  update(dt) {
    Apt.update(dt);
    const lp = Apt.player();
    Player.pos.set(this.p.x + lp.x, this.base + lp.y, this.p.z + lp.z);
    Player.groundY = Math.max(Terrain.heightAt(this.p.x, this.p.z), 0);
  },
};

// 집 코드(apartment/)에 넘겨 주는 손잡이: 렌더러·입력·시각 등
const AptBridge = {
  get renderer() { return R.renderer; }, get scene() { return R.scene; }, get camera() { return R.camera; }, get rig() { return R.rig; },
  Input, get touch() { return G.touch; },
  origin: () => AptHost.origin(),
  night: () => R.nightU.value,
  timeKey: () => { const h = R.hourNow(); return h < 5.5 || h >= 20 ? 'night' : h < 10 ? 'morning' : h < 17.5 ? 'day' : 'sunset'; },
  setTime: (k) => { G.settings.hour = { morning: 7, day: 13, sunset: 18.5, night: 22 }[k]; saveSettings(); R.updateTime(); },
  xr: () => G.xr, vrOk: () => !!Game.vrOk,
  exit: () => AptHost.exit(), enterVR: () => Game.enterVR(), setDoll: (on) => AptHost.setDoll(on),
  labels: {
    top: '해운대 · 38F',
    desc: '해운대 해수욕장 앞 45층 타워의 38층. 남향 통창으로 바다가 보인다.',
    tourLast: { t: '창밖 해운대', d: '38층에서 내려다보는 해운대 해수욕장과 바다. 시간대를 바꾸면 노을과 야경을 볼 수 있습니다.', look: [0.4, 9] },
  },
};
