// ---------------------------------------------------------------------------
// 실내 배치와 조작: 방마다 가구를 놓고, 문·스위치·커튼·TV·냉장고·수전·에어컨·
// 스피커·스탠드·샤워·욕조·로봇청소기를 눌러서 쓸 수 있게 등록한다
// ---------------------------------------------------------------------------
const Interact = {
  items: [],
  // root 아래 모든 메시를 하나의 조작 대상으로 묶는다. hint: () => 문구, act: () => 실행
  add(root, o) {
    const it = Object.assign({ root }, o);
    root.traverse((m) => { if (m.isMesh || m.isLineSegments) m.userData.it = it; });
    this.items.push(it);
    return it;
  },
  meshes() { const out = []; for (const it of this.items) it.root.traverse((m) => { if (m.isMesh && m.userData.it === it && m.visible !== false) out.push(m); }); return out; },
};

const Interior = {
  group: null, movables: [], boxes: [], curtains: [], zoneAccents: {}, tvs: [], screens: [], lamps: [],
  place(obj, x, z, rotY = 0, y = 0, opts = {}) {
    obj.position.set(x, y, z); obj.rotation.y = rotY; this.group.add(obj);
    if (opts.move) this.movables.push({ group: obj, name: opts.move, block: opts.block !== false, room: roomAt(x, z), styled: opts.styled });
    else if (opts.block) this.movables.push({ group: obj, name: null, block: true, fixed: true });
    return obj;
  },
  // 스타일마다 모양이 다른 가구(테이블, 의자 등)를 새 스타일로 다시 만든다. 위치와 방향은 그대로
  restyle() {
    for (const m of this.movables) {
      if (!m.styled) continue;
      const old = m.group, g = m.styled(G.style);
      g.position.copy(old.position); g.rotation.copy(old.rotation); g.scale.copy(old.scale);
      old.parent.add(g); old.removeFromParent();
      old.traverse((o) => { if (o.geometry && !F.geoCache.has(o.geometry)) o.geometry.dispose(); });
      m.group = g;
    }
    this.updateBoxes();
  },
  accent(zone, mesh) { (this.zoneAccents[zone] ||= []).push(mesh); },

  init() {
    this.group = new THREE.Group(); R.scene.add(this.group);
    this.living(); this.kitchen(); this.master(); this.bedrooms(); this.baths(); this.entry();
    this.switches(); this.doorsInteract(); this.curtainsBuild();
    this.robotInit();
    this.updateBoxes();
  },

  // ---------------- 거실
  living() {
    const st = G.style;
    this.place(F.rug(3.1, 2.3), -0.45, 2.55, 0, 0);
    this.place(F.sofa(2.6, 0.98), -2.03, 2.55, Math.PI / 2, 0, { move: '소파' });
    this.place(F.coffeeTable(st), -0.5, 2.55, Math.PI / 2, 0, { move: '커피 테이블', styled: (s) => F.coffeeTable(s) });
    this.place(F.tvConsole(2.0), 2.11, 2.55, -Math.PI / 2, 0, { move: 'TV 장' });
    const tv = this.place(F.tv(), 2.315, 2.55, -Math.PI / 2, 1.32);
    // 화면 빛 (처음부터 만들어 두어야 켤 때 셰이더를 다시 만들지 않는다)
    tv.userData.glow = new THREE.PointLight(0x8ab4ff, 0, 4, 2); tv.userData.glow.position.set(0, 0, 0.6); tv.add(tv.userData.glow);
    this.tvs.push(tv);
    Interact.add(tv, { name: 'TV', hint: () => (tv.userData.on ? 'TV 끄기' : 'TV 켜기'), act: () => this.toggleTV(tv) });
    const lamp = this.place(F.arcLamp(), -2.3, 1.15, -0.81, 0, { move: '아크 플로어 램프', block: false });
    this.lampInteract(lamp, '플로어 램프');
    this.place(F.plant('monstera', 1.5), -2.22, 4.12, 0.6, 0, { move: '몬스테라', block: false });
    const ac = this.place(F.airCon(), 2.08, 4.16, -2.4, 0, { move: '스탠드 에어컨' });
    this.ac = ac;
    Interact.add(ac, { name: '에어컨', hint: () => (ac.userData.on ? '에어컨 끄기' : '에어컨 켜기 (냉방 23°C)'), act: () => this.toggleAC() });
    const sp = this.place(F.speaker(), 2.08, 3.78, -Math.PI / 2, 0, { move: '스피커', block: false });
    this.speaker = sp;
    Interact.add(sp, { name: '스피커', hint: () => (Sound.music ? '음악 끄기' : '음악 틀기'), act: () => { Sound.toggleMusic(); UI.toast(Sound.music ? '잔잔한 음악을 틉니다.' : '음악을 껐습니다.'); } });
    // 소파 위 그림 두 점
    const a1 = F.frameArt(0.62, 0.82, 0); this.place(a1, -2.535, 2.05, Math.PI / 2, 1.52);
    const a2 = F.frameArt(0.62, 0.82, 1); this.place(a2, -2.535, 3.05, Math.PI / 2, 1.52);
    // 식당
    this.place(F.diningTable(st), -0.35, -0.45, 0, 0, { move: '식탁', styled: (s) => F.diningTable(s) });
    for (const x of [-1.0, -0.35, 0.3]) {
      this.place(F.chair(st), x, -1.08, 0, 0, { move: '식탁 의자', block: false, styled: (s) => F.chair(s) });
      this.place(F.chair(st), x, 0.18, Math.PI, 0, { move: '식탁 의자', block: false, styled: (s) => F.chair(s) });
    }
    const pend = this.place(F.pendant(1.3), -0.35, -0.45, 0, 1.75);
    this.accent('kitchen', pend.userData.glow);
  },

  // ---------------- 주방·다용도실
  kitchen() {
    const g = this.group, z = -4.065;
    const cabs = [[-1.25, 0.6], [-0.65, 0.8], [0.15, 0.35], [0.5, 0.9], [1.4, 0.3]];
    for (const [x0, w] of cabs) F.baseCab(g, x0 + w / 2, z, w, 0);
    this.movables.push({ group: null, box: { x0: -1.25, x1: 1.7, z0: -4.4, z1: -3.74 }, block: true, fixed: true });
    // 인덕션
    const cook = new THREE.Group(); cook.position.set(-0.25, 0.896, z + 0.02); g.add(cook);
    F.box(cook, 0.6, 0.006, 0.52, Mats.blackGlass, 0, 0, 0, false);
    const rings = [];
    for (const [x, zz, r] of [[-0.15, -0.1, 0.1], [0.15, -0.1, 0.08], [0, 0.12, 0.09]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.006, r, 40), new THREE.MeshBasicMaterial({ color: 0x3a3a3a })); ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.004, zz); cook.add(ring);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(r - 0.008, 40), new THREE.MeshBasicMaterial({ color: 0xff3a10, transparent: true, opacity: 0 })); glow.rotation.x = -Math.PI / 2; glow.position.set(x, 0.0045, zz); cook.add(glow);
      rings.push(glow);
    }
    cook.userData = { rings, on: false };
    Interact.add(cook, { name: '인덕션', hint: () => (cook.userData.on ? '인덕션 끄기' : '인덕션 켜기'), act: () => { cook.userData.on = !cook.userData.on; Sound.click(); UI.toast(cook.userData.on ? '인덕션을 켰습니다. 화구가 붉게 달아오릅니다.' : '인덕션을 껐습니다.'); } });
    this.cook = cook;
    // 후드
    F.box(g, 0.8, 0.5, 0.42, Mats.cabinet, -0.25, 1.95, -4.165);
    F.box(g, 0.76, 0.02, 0.38, Mats.metal, -0.25, 1.69, -4.15, false);
    // 개수대
    F.box(g, 0.62, 0.012, 0.42, Mats.std({ color: 0x3a3c3e, roughness: 0.35, metalness: 0.6 }, 1.2), 0.95, 0.897, z + 0.03, false);
    const faucet = F.faucet(g, 0.95, -4.3, 0);
    Interact.add(faucet, { name: '주방 수전', hint: () => (faucet.userData.water.visible ? '물 잠그기' : '물 틀기'), act: () => this.toggleWater(faucet) });
    // 상부장 + 아래 조명
    const u = F.upperCab(g, -0.95, -4.205, 0.6, 0); this.accent('kitchen', u.led);
    // 창가 허브 화분
    this.place(F.plant('broad', 0.9), 1.55, -4.22, 0, 0.9).scale.setScalar(0.42);
    // 냉장고와 오븐장 (현관 쪽 벽)
    const fr = this.place(F.fridge(), 2.03, -3.89, -Math.PI / 2, 0, { block: true });
    this.fridge = fr;
    Interact.add(fr, { name: '냉장고', hint: () => (fr.userData.open ? '냉장고 문 닫기' : '냉장고 문 열기'), act: () => this.toggleFridge() });
    this.place(F.ovenTower(), 2.03, -3.12, -Math.PI / 2, 0, { block: true });
    // 아일랜드와 의자
    this.place(F.island(G.style), -0.35, -2.45, 0, 0, { move: '아일랜드', block: true });
    for (const x of [-1.05, -0.35, 0.35]) this.place(F.stool(G.style), x, -1.78, 0, 0, { move: '바 스툴', block: false, styled: (s) => F.stool(s) });
    // 다용도실
    this.place(F.washer(false), -2.1, -5.34, 0, 0, { block: true });
    this.place(F.washer(true), -2.1, -5.34, 0, 0.86);
    F.baseCab(g, -1.05, -5.36, 0.6, 0);
    const uf = F.faucet(g, -1.05, -5.6, 0);
    Interact.add(uf, { name: '다용도실 수전', hint: () => (uf.userData.water.visible ? '물 잠그기' : '물 틀기'), act: () => this.toggleWater(uf) });
  },

  // ---------------- 안방·드레스룸
  master() {
    const bed = this.place(F.bed(1.9, 2.1, G.style), 2.49, 2.55, Math.PI / 2, 0, { move: '킹 침대' });
    this.accent('master', bed.userData.led);
    for (const z of [1.32, 3.78]) { const ns = this.place(F.nightstand(), 2.79, z, Math.PI / 2, 0, { move: '협탁', block: false }); this.lampInteract(ns, '협탁 스탠드'); }
    this.place(F.bench(1.2), 4.85, 2.55, Math.PI / 2, 0, { move: '침대 벤치' });
    this.place(F.rug(2.6, 3.1), 3.9, 2.55, 0, 0);
    this.place(F.readingChair(), 5.35, 3.85, -2.35, 0, { move: '라운지 체어' });
    this.place(F.plant('broad', 1.2), 5.6, 1.15, 0, 0, { move: '화분', block: false });
    // 드레스룸: 동쪽 벽 옷장(오픈), 서쪽 벽 전신 거울
    const closet = new THREE.Group();
    const W = 2.15, Hh = 2.3, D = 0.55;
    F.box(closet, W, 0.03, D, Mats.wood, 0, 1.82, 0); F.box(closet, W, 0.03, D, Mats.wood, 0, 2.28, 0); F.box(closet, W, 0.03, D, Mats.wood, 0, 0.42, 0);
    for (const x of [-W / 2, -W / 6, W / 6, W / 2]) F.box(closet, 0.025, Hh, D, Mats.wood, x, Hh / 2, 0);
    F.box(closet, W, Hh, 0.01, Mats.wood, 0, Hh / 2, -D / 2);
    F.cyl(closet, 0.012, 0.012, W - 0.05, Mats.metal, 0, 1.72, 0, 8).rotation.z = Math.PI / 2;
    const r = mulberry32(5), geos = [], cols = [0xf2efe8, 0x2a3a5a, 0xc9b79c, 0x1f1f1f, 0x8a9aa8, 0xe8dcc8, 0x6a3a3a, 0xd8d0c4];
    for (let x = -W / 2 + 0.06; x < W / 2 - 0.06; x += 0.045 + r() * 0.03) {
      if (Math.abs(x + W / 6) < 0.02 || Math.abs(x - W / 6) < 0.02) continue;
      const h = 0.7 + r() * 0.35, bg = new THREE.BoxGeometry(0.03, h, 0.42); bg.translate(x, 1.7 - h / 2, 0);
      const c = new THREE.Color(cols[Math.floor(r() * cols.length)]), col = []; for (let k = 0; k < bg.attributes.position.count; k++) col.push(c.r, c.g, c.b);
      bg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); bg.deleteAttribute('uv'); geos.push(bg);
    }
    for (let i = 0; i < 6; i++) { const bg = new THREE.BoxGeometry(0.3, 0.1, 0.3); bg.translate(-W / 2 + 0.25 + i * 0.33, 1.9, 0); const c = new THREE.Color(cols[i]), col = []; for (let k = 0; k < bg.attributes.position.count; k++) col.push(c.r, c.g, c.b); bg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); bg.deleteAttribute('uv'); geos.push(bg); }
    const clothes = new THREE.Mesh(mergeGeometries(geos), Mats.book); clothes.castShadow = true; closet.add(clothes);
    const shelfLed = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.06, 0.015), Mats.ledOff); shelfLed.rotation.x = Math.PI / 2; shelfLed.position.set(0, 1.8, 0.2); closet.add(shelfLed);
    this.accent('master', shelfLed);
    this.place(closet, 5.6, -0.6, -Math.PI / 2, 0, { block: true });
    const mir = new THREE.Group(); F.rbox(mir, 0.7, 1.8, 0.03, 0.01, Mats.frame, 0, 1.0, 0.015); F.box(mir, 0.64, 1.74, 0.005, Mats.mirror, 0, 1.0, 0.032, false);
    this.place(mir, 4.265, -0.7, Math.PI / 2, 0);
  },

  // ---------------- 침실2, 침실3(서재)
  bedrooms() {
    // 침실2
    const bed = this.place(F.bed(1.4, 2.0, G.style), -2.67, 2.75, -Math.PI / 2, 0, { move: '더블 침대' });
    this.accent('room2', bed.userData.led);
    const ns = this.place(F.nightstand(), -2.97, 3.85, -Math.PI / 2, 0, { move: '협탁', block: false }); this.lampInteract(ns, '협탁 스탠드');
    this.place(F.wardrobe(2.4), -5.575, 1.95, Math.PI / 2, 0, { block: true });
    const d2 = this.place(F.desk(1.3, 1), -4.85, 4.025, Math.PI, 0, { move: '책상' });
    this.screens.push(...d2.userData.screens);
    this.place(F.deskChair(), -5.0, 3.45, 0, 0, { move: '의자', block: false });
    this.place(F.rug(2.0, 2.6), -3.9, 2.75, 0, 0);
    // 침실3 (서재)
    const d3 = this.place(F.desk(2.0, 2), -4.3, -4.025, 0, 0, { move: '듀얼 모니터 책상' });
    this.screens.push(...d3.userData.screens);
    for (const scr of d3.userData.screens) Interact.add(scr, { name: '모니터', hint: () => (this.pcOn ? '컴퓨터 끄기' : '컴퓨터 켜기'), act: () => this.togglePC() });
    for (const scr of d2.userData.screens) Interact.add(scr, { name: '모니터', hint: () => (this.pcOn ? '컴퓨터 끄기' : '컴퓨터 켜기'), act: () => this.togglePC() });
    this.place(F.deskChair(), -4.3, -3.35, Math.PI, 0, { move: '책상 의자', block: false });
    this.place(F.bookshelf(1.9, 2.2), -5.715, -2.35, Math.PI / 2, 0, { block: true });
    this.place(F.readingChair(), -3.25, -3.55, -2.2, 0, { move: '라운지 체어' });
    this.place(F.plant('broad', 1.1), -2.95, -4.12, 0, 0, { move: '화분', block: false });
    this.place(F.rug(2.2, 1.8), -4.1, -2.8, 0, 0);
    const a3 = F.frameArt(0.9, 0.6, 2); this.place(a3, -2.665, -2.6, -Math.PI / 2, 1.55);
  },

  // ---------------- 욕실 둘
  baths() {
    // 부부욕실
    const tub = this.place(F.bathtub(), 5.07, -4.0, 0, 0, { block: true });
    Interact.add(tub, { name: '욕조', hint: () => (tub.userData.filling || tub.userData.level > 0.5 ? '욕조 물 빼기' : '욕조에 물 받기'), act: () => this.toggleTub(tub) });
    this.tub = tub;
    const v1 = this.place(F.vanity(1.0), 5.625, -2.75, -Math.PI / 2, 0, { block: true }); this.accent('mbath', v1.userData.led);
    this.place(F.toilet(), 4.56, -3.0, Math.PI / 2, 0, { block: true });
    this.place(F.towelBar(0.6), 4.265, -2.3, Math.PI / 2, 0);
    // 공용욕실
    const sh = this.place(F.shower(0.92, 1.68), -5.41, -0.3, 0, 0, { block: true });
    Interact.add(sh, { name: '샤워기', hint: () => (sh.userData.water.visible ? '샤워기 잠그기' : '샤워기 틀기'), act: () => { const w = sh.userData.water; w.visible = !w.visible; Sound.water(w.visible ? 1 : -1, 'shower'); } });
    this.shower = sh;
    const v2 = this.place(F.vanity(0.9), -4.45, 0.29, Math.PI, 0, { block: true }); this.accent('bath', v2.userData.led);
    this.place(F.toilet(), -4.65, -0.84, 0, 0, { block: true });
  },

  // ---------------- 현관·복도
  entry() {
    const sc = this.place(F.shoeCabinet(1.85, 2.42), 2.66, -3.44, Math.PI / 2, -FOYER_STEP.drop, { block: true });
    this.accent('entry', sc.userData.led);
    this.place(F.bench(0.8), 3.96, -2.95, -Math.PI / 2, 0, { move: '현관 벤치' });
    const mir = new THREE.Group(); F.rbox(mir, 0.6, 1.0, 0.025, 0.3, Mats.metal, 0, 1.45, 0.012); F.mesh(new THREE.CircleGeometry(0.28, 40), Mats.mirror, 0, 1.45, 0.026, mir, false).scale.set(1, 1.65, 1);
    this.place(mir, 4.135, -2.95, -Math.PI / 2, 0);
    this.place(F.console(1.1), 3.98, -0.6, -Math.PI / 2, 0, { move: '콘솔' });
    const art = F.frameArt(0.7, 0.9, 1); this.place(art, 4.135, -0.6, -Math.PI / 2, 1.5);
    const pad = this.place(F.wallPad(), 4.135, -1.35, -Math.PI / 2, 1.45);
    Interact.add(pad, { name: '월패드', hint: () => '월패드 열기 (스마트홈)', act: () => UI.openPanel('home') });
  },

  // ---------------- 스위치
  switches() {
    for (const [k, z] of Object.entries(ZONES)) {
      const s = F.lightSwitch(), n = z.sw.n;
      s.position.set(z.sw.x, 1.2, z.sw.z); s.rotation.y = Math.atan2(n[0], n[1]); this.group.add(s);
      z.switch = s;
      Interact.add(s, { name: `${z.name} 스위치`, hint: () => `${z.name} 불 ${Build.lights[k].on ? '끄기' : '켜기'}`, act: () => { Build.setZone(k, !Build.lights[k].on); Sound.click(); } });
    }
  },
  onZone(k, on) {
    for (const m of this.zoneAccents[k] || []) m.material = on ? Mats.led : Mats.ledOff;
    const z = ZONES[k]; if (z && z.switch) z.switch.userData.dot.material.color.setHex(on ? 0xffb040 : 0x40ff90);
    UI.updateLights && UI.updateLights();
  },
  onTime() {},

  // ---------------- 문
  doorsInteract() {
    for (const d of Build.doors) {
      const root = d.leaf || d.group;
      const it = Interact.add(d.leaves ? d.group : root, { name: d.name, hint: () => `${d.name} ${d.open ? '닫기' : '열기'}`, act: () => this.toggleDoor(d) });
      // 문틀은 누르지 않게: 문짝 메시만 남긴다
      if (d.hitMeshes) d.group.traverse((m) => { if (m.userData.it === it && !d.hitMeshes.includes(m)) delete m.userData.it; });
    }
  },
  toggleDoor(d, force) {
    const open = force ?? !d.open;
    if (open === d.open) return;
    d.open = open;
    const from = d.k, to = open ? 1 : 0;
    Sound.door(d.kind, open);
    Tweens.add(d.kind === 'glass2' ? 0.9 : 0.75, (k) => { d.k = lerp(from, to, ease(k)); this.applyDoor(d); });
  },
  applyDoor(d) {
    if (d.kind === 'hinge') d.pivot.rotation.y = d.sign * d.k * Math.PI * 0.5 * 0.95;
    else if (d.kind === 'slide') d.leaf.position.x = d.k * (d.slideLen - 0.08);
    else if (d.kind === 'glass2') for (const l of d.leaves) l.position.x = l.userData.base + l.userData.dir * d.k * (d.info.len / 2 - 0.12);
  },
  doorById(id) { return Build.doors.find((d) => d.id === id); },

  // ---------------- 커튼 (거실 통창, 안방 두 창, 침실2 창): 속커튼 + 암막
  curtainsBuild() {
    for (const w of Build.windows) {
      const room = w.room; if (!room || !['living', 'master', 'room2'].includes(room.id)) continue;
      const { o, alongX, c, w: wall } = w, inward = w.inward;
      const face = c + inward * (wall.t / 2 + 0.004);
      const s = o.s - 0.15, e = o.e + 0.15, len = e - s, height = H - 0.06;
      const grp = new THREE.Group();
      if (alongX) { grp.position.set(s, 0.02, face + inward * 0.12); grp.rotation.y = 0; }
      else { grp.position.set(face + inward * 0.12, 0.02, e); grp.rotation.y = Math.PI / 2; }
      this.group.add(grp);
      // 커튼 레일
      F.box(grp, len, 0.03, 0.08, Mats.trim, len / 2, height + 0.015, 0, false);
      const layers = [];
      for (const [mat, dz, folds] of [[Mats.sheer, -inward * (alongX ? 0.035 : -0.035), 26], [Mats.curtain, inward * (alongX ? 0.035 : -0.035), 20]]) {
        const L = F.curtain(1, height, mat, folds), Rr = F.curtain(1, height, mat, folds);
        L.position.set(0, 0, dz); Rr.position.set(len, 0, dz); Rr.scale.x = -1;
        grp.add(L, Rr);
        layers.push({ L, Rr, len });
      }
      const cur = { grp, layers, room: room.id, sheer: 0.35, block: 1, len, name: `${room.name} 커튼` };
      this.curtains.push(cur);
      this.setCurtain(cur, 1, 1, true);
      Interact.add(grp, { name: cur.name, hint: () => (cur.block < 0.5 ? '암막 커튼 치기' : cur.sheer < 0.5 ? '커튼 모두 걷기' : '속커튼만 치기'), act: () => this.cycleCurtain(cur) });
    }
  },
  // sheer, block: 0 = 닫힘(창을 가림), 1 = 열림(양옆으로 모임)
  setCurtain(cur, sheer, block, now) {
    const apply = (layer, k) => { const half = cur.len / 2, open = 0.16; const w = lerp(half + 0.02, open, k); layer.L.scale.x = w; layer.Rr.scale.x = -w; };
    if (now) { cur.sheer = sheer; cur.block = block; apply(cur.layers[0], sheer); apply(cur.layers[1], block); return; }
    const s0 = cur.sheer, b0 = cur.block;
    Sound.swoosh();
    Tweens.add(1.4, (k) => { const e = ease(k); cur.sheer = lerp(s0, sheer, e); cur.block = lerp(b0, block, e); apply(cur.layers[0], cur.sheer); apply(cur.layers[1], cur.block); });
  },
  cycleCurtain(cur) {
    if (cur.block < 0.5) this.setCurtain(cur, 1, 1); // 다 닫힘 → 모두 걷기
    else if (cur.sheer > 0.5) this.setCurtain(cur, 0, 1); // 모두 걷힘 → 속커튼
    else this.setCurtain(cur, 0, 0); // 속커튼 → 암막
  },
  allCurtains(sheer, block) { for (const c of this.curtains) this.setCurtain(c, sheer, block); },

  // ---------------- 가전
  toggleTV(tv, force) {
    const on = force ?? !tv.userData.on; tv.userData.on = on;
    tv.userData.screen.material = on ? new THREE.MeshBasicMaterial({ map: tv.userData.tex }) : new THREE.MeshBasicMaterial({ color: 0x050505 });
    tv.userData.glow.intensity = on ? 1.2 : 0;
    Sound.click();
  },
  drawTV(tv, t) {
    const c = tv.userData.canvas, g = c.getContext('2d'), W = c.width, Hh = c.height;
    // 풍경 채널: 해 질 녘 바다 위 파도와 구름
    const sky = g.createLinearGradient(0, 0, 0, Hh * 0.6); sky.addColorStop(0, '#1d2b5a'); sky.addColorStop(0.6, '#e2725b'); sky.addColorStop(1, '#ffc27a');
    g.fillStyle = sky; g.fillRect(0, 0, W, Hh * 0.6);
    g.fillStyle = '#ffe1a8'; g.beginPath(); g.arc(W * 0.62, Hh * 0.55, 34, Math.PI, 0); g.fill();
    for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(255,220,200,${0.25 - i * 0.04})`; const x = ((t * (8 + i * 4) + i * 140) % (W + 200)) - 100; g.beginPath(); g.ellipse(x, 40 + i * 22, 90, 10, 0, 0, TAU); g.fill(); }
    const sea = g.createLinearGradient(0, Hh * 0.6, 0, Hh); sea.addColorStop(0, '#3a3f6a'); sea.addColorStop(1, '#0d1430');
    g.fillStyle = sea; g.fillRect(0, Hh * 0.6, W, Hh * 0.4);
    for (let y = Hh * 0.62; y < Hh; y += 6) { g.strokeStyle = `rgba(255,190,140,${0.35 * (1 - (y - Hh * 0.6) / (Hh * 0.4))})`; g.beginPath(); for (let x = 0; x <= W; x += 16) g.lineTo(x, y + Math.sin(x * 0.04 + t * 2 + y) * 1.5); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = '600 14px sans-serif'; g.fillText('CH 7  LIVE · OCEAN', 16, 22);
    tv.userData.tex.needsUpdate = true;
  },
  toggleAC(force) {
    const ac = this.ac, on = force ?? !ac.userData.on; ac.userData.on = on;
    ac.userData.disp.material.color.setHex(on ? 0x3ad0ff : 0x222222);
    Sound.ac(on); Sound.click();
    UI.toast(on ? '에어컨을 켰습니다. 23°C 냉방, 바람이 위쪽으로 나옵니다.' : '에어컨을 껐습니다.');
  },
  toggleFridge() {
    const fr = this.fridge.userData; fr.open = !fr.open;
    const from = fr.k, to = fr.open ? 1 : 0;
    Sound.door('fridge', fr.open);
    Tweens.add(0.8, (k) => { fr.k = lerp(from, to, ease(k)); for (const d of fr.doors) d.pivot.rotation.y = d.s * fr.k * 1.9; fr.light.intensity = fr.k * 1.5; });
  },
  toggleWater(f) { const w = f.userData.water; w.visible = !w.visible; Sound.water(w.visible ? 1 : -1, f.uuid); },
  toggleTub(tub) {
    const u = tub.userData;
    if (u.level > 0.5 || u.filling) { u.filling = false; u.draining = true; Sound.water(-1, 'tub'); UI.toast('욕조 물을 뺍니다.'); }
    else { u.filling = true; u.draining = false; Sound.water(1, 'tub'); UI.toast('욕조에 따뜻한 물을 받습니다.'); }
  },
  lampInteract(lamp, name) {
    const u = lamp.userData; u.on = false;
    Interact.add(lamp, { name, hint: () => `${name} ${u.on ? '끄기' : '켜기'}`, act: () => this.setLamp(lamp, !u.on) });
    this.lamps.push(lamp);
  },
  setLamp(lamp, on) {
    const u = lamp.userData; u.on = on;
    u.light.intensity = on ? u.power : 0;
    if (u.inner) u.inner.material = on ? Mats.led : Mats.ledOff;
    if (u.shade) u.shade.material.emissiveIntensity = on ? 0.9 : 0;
    Sound.click();
  },
  togglePC(force) {
    this.pcOn = force ?? !this.pcOn;
    if (!this.pcMat) {
      const c = Tex.canvas(512, 288), g = c.getContext('2d');
      const bg = g.createLinearGradient(0, 0, 512, 288); bg.addColorStop(0, '#0f2027'); bg.addColorStop(0.5, '#203a43'); bg.addColorStop(1, '#2c5364'); g.fillStyle = bg; g.fillRect(0, 0, 512, 288);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 262, 512, 26);
      g.fillStyle = '#fff'; g.font = '300 64px sans-serif'; g.fillText('09:41', 30, 110); g.font = '400 20px sans-serif'; g.fillText('10월 17일 금요일', 34, 145);
      for (let i = 0; i < 6; i++) { g.fillStyle = ['#5ac8fa', '#ffcc00', '#ff6b6b', '#4cd964', '#af52de', '#ff9500'][i]; g.fillRect(150 + i * 36, 268, 22, 16); }
      this.pcMat = new THREE.MeshBasicMaterial({ map: Tex.tex(c) });
    }
    for (const s of this.screens) s.material = this.pcOn ? this.pcMat : Mats.screenOff;
    Sound.click();
  },

  // ---------------- 로봇청소기: 거실·식당을 돌아다닌다
  robotInit() {
    const r = F.robot(); r.position.set(1.4, 0, 0.95); this.group.add(r);
    this.robot = { g: r, on: false, dir: 0.6, turn: 0, dock: new THREE.Vector3(1.4, 0, 0.95) };
    Interact.add(r, { name: '로봇청소기', hint: () => (this.robot.on ? '청소 멈추기' : '청소 시작'), act: () => this.toggleRobot() });
  },
  toggleRobot(force) {
    const rb = this.robot; rb.on = force ?? !rb.on;
    rb.g.userData.ring.material.color.setHex(rb.on ? 0x4cd964 : 0x3ad0ff);
    Sound.robot(rb.on);
    UI.toast(rb.on ? '로봇청소기가 거실 청소를 시작합니다.' : '로봇청소기를 멈췄습니다.');
  },
  updateRobot(dt) {
    const rb = this.robot; if (!rb.on) return;
    const p = rb.g.position, sp = 0.28;
    const nx = p.x + Math.sin(rb.dir) * sp * dt, nz = p.z + Math.cos(rb.dir) * sp * dt;
    const hit = (x, z) => x < -2.35 || x > 2.15 || z < -1.3 || z > 4.2 || Physics.blocked(x, z, 0.19, true);
    if (hit(nx, nz)) { rb.dir += Math.PI * (0.5 + Math.random() * 0.8); }
    else { p.x = nx; p.z = nz; rb.dir += (Math.random() - 0.5) * 0.3 * dt; }
    rb.g.rotation.y = rb.dir;
  },

  // ---------------- 충돌 상자 (막는 가구)
  updateBoxes() {
    this.boxes = [];
    const b = new THREE.Box3();
    for (const m of this.movables) {
      if (!m.block) continue;
      if (m.box) { this.boxes.push(m.box); continue; }
      m.group.updateMatrixWorld(true);
      b.makeEmpty();
      m.group.traverse((o) => { if (o.isMesh && o.material !== Mats.shadow && o.geometry) { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); if (bb.max.y > 0.12) b.union(bb); } });
      if (b.isEmpty()) continue;
      this.boxes.push({ x0: b.min.x + 0.04, x1: b.max.x - 0.04, z0: b.min.z + 0.04, z1: b.max.z - 0.04, item: m });
    }
  },

  // ---------------- 매 프레임
  update(dt) {
    for (const tv of this.tvs) if (tv.userData.on) { tv.userData.acc = (tv.userData.acc || 0) + dt; if (tv.userData.acc > 0.08) { tv.userData.acc = 0; this.drawTV(tv, G.time); } tv.userData.glow.intensity = 1.0 + Math.sin(G.time * 3) * 0.25; }
    if (this.cook.userData.on) for (const r of this.cook.userData.rings) r.material.opacity = Math.min(0.85, r.material.opacity + dt * 0.5) * (0.92 + Math.sin(G.time * 6) * 0.04);
    else for (const r of this.cook.userData.rings) r.material.opacity = Math.max(0, r.material.opacity - dt * 0.4);
    const u = this.tub.userData;
    if (u.filling) { u.level = Math.min(1, u.level + dt / 20); if (u.level >= 1) { u.filling = false; Sound.water(-1, 'tub'); UI.toast('욕조에 물이 다 찼습니다.'); } }
    if (u.draining) { u.level = Math.max(0, u.level - dt / 12); if (u.level <= 0) { u.draining = false; Sound.water(-1, 'tub'); } }
    u.water.material.opacity = u.level > 0.01 ? 0.55 : 0; u.water.position.y = 0.1 + u.level * 0.38;
    if (this.shower.userData.water.visible) this.shower.userData.water.position.y = -((G.time * 3) % 0.1);
    this.speaker.userData.ring.material.color.setHex(Sound.music ? (Math.sin(G.time * 4) > 0 ? 0xffb043 : 0xd8902a) : 0x333333);
    this.updateRobot(dt);
  },
};
