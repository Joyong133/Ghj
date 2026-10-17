// ---------------------------------------------------------------------------
// 가구 모형: 각 함수는 바닥 중심이 원점이고 앞면이 +z인 그룹을 돌려준다
// ---------------------------------------------------------------------------
const F = {
  geoCache: new Map(),
  rgeo(w, h, d, r, seg = 3) { const k = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r}|${seg}`; if (!this.geoCache.has(k)) this.geoCache.set(k, new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001))); return this.geoCache.get(k); },
  mesh(geo, mat, x, y, z, p, cast = true) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; p.add(m); return m; },
  box(p, w, h, d, mat, x, y, z, cast = true) { return this.mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, p, cast); },
  rbox(p, w, h, d, r, mat, x, y, z, cast = true) { return this.mesh(this.rgeo(w, h, d, r), mat, x, y, z, p, cast); },
  cyl(p, r1, r2, h, mat, x, y, z, seg = 24, cast = true) { return this.mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat, x, y, z, p, cast); },
  sph(p, r, mat, x, y, z, seg = 20) { return this.mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2)), mat, x, y, z, p); },
  // 바닥 접지 그림자 (부드러운 타원)
  shadow(p, w, d, k = 1) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.25, d * 1.25), Mats.shadow); m.rotation.x = -Math.PI / 2; m.position.y = 0.004; m.renderOrder = 1; m.material.opacity = 0.5 * k;
    p.add(m); return m;
  },
  legs(p, w, d, h, mat, r = 0.018, inset = 0.06, taper = 0.7) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.cyl(p, r * taper, r, h, mat, sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset), 10);
  },

  // ---------------- 거실
  sofa(w = 2.6, d = 0.98) {
    const g = new THREE.Group(), seatH = 0.42, armW = 0.2, baseH = 0.2;
    this.rbox(g, w, baseH, d, 0.04, Mats.sofa, 0, 0.07 + baseH / 2, 0);
    const n = 3, sw = (w - armW * 2) / n;
    for (let i = 0; i < n; i++) this.rbox(g, sw - 0.012, 0.17, d - 0.26, 0.07, Mats.sofa, -w / 2 + armW + sw * (i + 0.5), 0.07 + baseH + 0.08, 0.1);
    for (let i = 0; i < n; i++) { const c = this.rbox(g, sw - 0.03, 0.46, 0.2, 0.09, Mats.sofa, -w / 2 + armW + sw * (i + 0.5), seatH + 0.25, -d / 2 + 0.2); c.rotation.x = -0.12; }
    this.rbox(g, w, 0.48, 0.16, 0.06, Mats.sofa, 0, 0.07 + 0.42, -d / 2 + 0.08);
    for (const s of [-1, 1]) this.rbox(g, armW, 0.36, d, 0.07, Mats.sofa, s * (w / 2 - armW / 2), 0.07 + 0.36 / 2 + 0.12, 0);
    this.legs(g, w - 0.1, d - 0.1, 0.07, Mats.metal, 0.016, 0.05, 1);
    // 쿠션 둘
    for (const [x, rot] of [[-w / 2 + 0.45, 0.25], [w / 2 - 0.5, -0.2]]) { const c = this.rbox(g, 0.44, 0.42, 0.13, 0.08, Mats.cushion, x, 0.66, -d / 2 + 0.34); c.rotation.set(-0.25, rot, 0.06); }
    const th = this.rbox(g, 0.55, 0.03, 0.75, 0.015, Mats.throw, w / 2 - 0.55, 0.49, 0.06); th.rotation.y = 0.15;
    this.shadow(g, w, d, 1.1);
    return g;
  },
  ottoman() { const g = new THREE.Group(); this.rbox(g, 0.75, 0.38, 0.6, 0.08, Mats.sofa, 0, 0.21, 0); this.legs(g, 0.65, 0.5, 0.03, Mats.metal, 0.015, 0.05, 1); this.shadow(g, 0.75, 0.6); return g; },
  coffeeTable(style) {
    const g = new THREE.Group();
    if (style === 'scandi' || style === 'japandi') {
      this.rbox(g, 1.15, 0.05, 0.62, 0.02, Mats.wood, 0, 0.36, 0);
      this.box(g, 1.0, 0.025, 0.5, Mats.wood, 0, 0.12, 0);
      this.legs(g, 1.08, 0.56, 0.34, Mats.wood, 0.022, 0.05, 0.75);
    } else {
      const top = this.cyl(g, 0.48, 0.48, 0.035, Mats.counter, 0, 0.38, 0, 48);
      this.cyl(g, 0.2, 0.26, 0.36, Mats.metal, 0, 0.18, 0, 32);
      top.scale.set(1.25, 1, 0.85);
      this.cyl(g, 0.24, 0.24, 0.03, Mats.counter, 0.62, 0.3, 0.22, 40);
      this.cyl(g, 0.012, 0.012, 0.29, Mats.metal, 0.62, 0.145, 0.22, 8);
      this.cyl(g, 0.15, 0.15, 0.012, Mats.metal, 0.62, 0.006, 0.22, 24);
    }
    // 소품: 책 두 권과 꽃병
    this.box(g, 0.28, 0.03, 0.2, Mats.paper, -0.18, 0.415, 0.02).rotation.y = 0.2;
    this.box(g, 0.24, 0.025, 0.18, Mats.cushion, -0.17, 0.44, 0.02).rotation.y = 0.05;
    this.cyl(g, 0.045, 0.06, 0.2, Mats.porcelain, 0.22, 0.5, -0.05, 16);
    for (let i = 0; i < 5; i++) { const s = this.cyl(g, 0.003, 0.003, 0.32, Mats.stem, 0.22 + Math.sin(i) * 0.03, 0.72, -0.05 + Math.cos(i * 1.7) * 0.03, 4); s.rotation.z = (i - 2) * 0.12; }
    this.shadow(g, 1.2, 0.8);
    return g;
  },
  tvConsole(w = 2.0) {
    const g = new THREE.Group(), d = 0.4, h = 0.38;
    this.rbox(g, w, h, d, 0.01, Mats.wood, 0, 0.14 + h / 2, 0);
    for (let i = 1; i < 4; i++) this.box(g, 0.004, h - 0.04, 0.005, Mats.black, -w / 2 + (w / 4) * i, 0.14 + h / 2, d / 2 + 0.001, false);
    this.box(g, w - 0.1, 0.02, d - 0.06, Mats.black, 0, 0.13, 0, false);
    this.legs(g, w - 0.1, d - 0.05, 0.13, Mats.metal, 0.012, 0.04, 1);
    // 사운드바, 오브제
    this.rbox(g, 1.0, 0.07, 0.11, 0.02, Mats.black, 0, 0.14 + h + 0.035, 0.05);
    this.cyl(g, 0.07, 0.05, 0.22, Mats.porcelain, -0.75, 0.14 + h + 0.11, 0, 20);
    this.sph(g, 0.08, Mats.metal, 0.75, 0.14 + h + 0.08, 0, 20);
    this.shadow(g, w, d, 0.8);
    return g;
  },
  tv() {
    const g = new THREE.Group(), W = 1.45, Hh = 0.83;
    this.box(g, W, Hh, 0.025, Mats.black, 0, 0, 0.0125);
    const c = Tex.canvas(512, 288), t = Tex.tex(c, { aniso: 4 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.02, Hh - 0.02), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    screen.position.z = 0.026; g.add(screen);
    g.userData = { canvas: c, tex: t, screen, on: false };
    return g;
  },
  rug(w, d) { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), Mats.rug); m.position.y = 0.006; m.receiveShadow = true; g.add(m); return g; },
  arcLamp() {
    const g = new THREE.Group();
    this.box(g, 0.32, 0.05, 0.32, Mats.counter, 0, 0.025, 0);
    const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, 1.9, 0), new THREE.Vector3(0.7, 2.15, 0), new THREE.Vector3(1.15, 1.75, 0));
    this.mesh(new THREE.TubeGeometry(curve, 40, 0.012, 8, false), Mats.metal, 0, 0, 0, g);
    const shade = this.mesh(new THREE.SphereGeometry(0.22, 24, 12, 0, TAU, 0, Math.PI / 2), Mats.metal, 1.15, 1.6, 0, g);
    shade.material = Mats.metal; shade.scale.set(1, 0.7, 1);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), Mats.ledOff); inner.rotation.x = Math.PI / 2; inner.position.set(1.15, 1.6, 0); g.add(inner);
    const light = new THREE.PointLight(0xffd2a0, 0, 4.5, 2); light.position.set(1.15, 1.45, 0); g.add(light);
    g.userData = { light, inner, power: 3.5 };
    this.shadow(g, 0.35, 0.35, 0.6);
    return g;
  },
  plant(kind = 'monstera', h = 1.3) {
    const g = new THREE.Group();
    const potH = 0.42, r = 0.22;
    this.mesh(new THREE.CylinderGeometry(r, r * 0.8, potH, 28), Mats.plantPot, 0, potH / 2, 0, g);
    this.cyl(g, r * 0.95, r * 0.95, 0.02, Mats.soil, 0, potH - 0.02, 0, 20, false);
    const rnd = mulberry32(hashStr(kind + h));
    const n = kind === 'monstera' ? 9 : 16, mat = kind === 'monstera' ? Mats.monstera : Mats.leaf, size = kind === 'monstera' ? 0.42 : 0.24;
    const leafGeo = new THREE.PlaneGeometry(size, size); leafGeo.translate(0, size / 2, 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd() * 0.5, lean = 0.35 + rnd() * 0.6, len = (h - potH) * (0.45 + rnd() * 0.55);
      const stem = this.cyl(g, 0.006, 0.008, len, Mats.stem, 0, 0, 0, 5, false);
      stem.position.set(Math.sin(a) * len * 0.5 * Math.sin(lean), potH + Math.cos(lean) * len / 2, Math.cos(a) * len * 0.5 * Math.sin(lean));
      stem.rotation.set(Math.cos(a) * lean, 0, -Math.sin(a) * lean);
      const tip = new THREE.Vector3(Math.sin(a) * len * Math.sin(lean), potH + Math.cos(lean) * len, Math.cos(a) * len * Math.sin(lean));
      const leaf = new THREE.Mesh(leafGeo, mat); leaf.position.copy(tip); leaf.rotation.set(-0.9 - rnd() * 0.5, a, 0, 'YXZ'); leaf.castShadow = true; g.add(leaf);
    }
    this.shadow(g, 0.5, 0.5, 0.7);
    return g;
  },
  airCon() {
    const g = new THREE.Group(), W = 0.36, Hh = 1.82, D = 0.32;
    this.rbox(g, W, Hh, D, 0.06, Mats.porcelain, 0, Hh / 2, 0);
    // 원형 바람구멍 세 개 (점 패턴 느낌)
    const holeMat = Mats.std({ color: 0xd8d8d8, roughness: 0.6, metalness: 0.1 }, 0.8);
    for (const y of [1.48, 1.18, 0.88]) this.mesh(new THREE.CircleGeometry(0.12, 32), holeMat, 0, y, D / 2 + 0.002, g, false);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.03), new THREE.MeshBasicMaterial({ color: 0x222222 })); disp.position.set(0, 0.62, D / 2 + 0.003); g.add(disp);
    this.shadow(g, W, D, 0.6);
    g.userData = { disp, on: false };
    return g;
  },
  speaker() {
    const g = new THREE.Group();
    this.rbox(g, 0.2, 0.32, 0.2, 0.05, Mats.sofa, 0, 0.16, 0);
    this.cyl(g, 0.09, 0.09, 0.01, Mats.black, 0, 0.325, 0, 24);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.006, 6, 30), new THREE.MeshBasicMaterial({ color: 0x333333 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.332; g.add(ring);
    g.userData = { ring };
    return g;
  },
  frameArt(w, h, matIdx) {
    const g = new THREE.Group();
    this.box(g, w + 0.06, h + 0.06, 0.03, Mats.frame, 0, 0, 0.015);
    this.box(g, w, h, 0.004, Mats.paper, 0, 0, 0.032, false);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.12, h - 0.12), Mats.art[matIdx % 3]); art.position.z = 0.035; g.add(art);
    return g;
  },

  // ---------------- 식당·주방
  diningTable(style) {
    const g = new THREE.Group(), w = 1.9, d = 0.95;
    if (style === 'dark' || style === 'warm') {
      this.rbox(g, w, 0.04, d, 0.01, Mats.counter, 0, 0.73, 0);
      for (const s of [-1, 1]) { this.box(g, 0.05, 0.69, d - 0.2, Mats.metal, s * (w / 2 - 0.25), 0.345, 0); this.box(g, 0.05, 0.02, d - 0.1, Mats.metal, s * (w / 2 - 0.25), 0.01, 0); }
    } else {
      this.rbox(g, w, 0.045, d, 0.015, Mats.wood, 0, 0.73, 0);
      this.legs(g, w, d, 0.71, Mats.wood, 0.03, 0.09, 0.75);
    }
    // 테이블 위 소품
    this.box(g, 1.1, 0.004, 0.32, Mats.throw, 0, 0.754, 0, false);
    this.cyl(g, 0.12, 0.08, 0.06, Mats.porcelain, 0, 0.785, 0, 24);
    for (let i = 0; i < 3; i++) this.sph(g, 0.035, Mats.cushion, -0.03 + i * 0.03, 0.83, (i - 1) * 0.03, 12);
    this.shadow(g, w, d, 0.9);
    return g;
  },
  chair(style) {
    const g = new THREE.Group();
    this.rbox(g, 0.46, 0.06, 0.46, 0.025, Mats.chair, 0, 0.46, 0);
    const back = this.rbox(g, 0.44, 0.36, 0.05, 0.025, Mats.chair, 0, 0.72, -0.21); back.rotation.x = -0.08;
    const legMat = style === 'scandi' || style === 'japandi' ? Mats.wood : Mats.metal;
    this.legs(g, 0.42, 0.42, 0.44, legMat, 0.014, 0.03, 0.8);
    this.shadow(g, 0.5, 0.5, 0.6);
    return g;
  },
  pendant(w = 1.3) {
    const g = new THREE.Group();
    // 선형 펜던트: 가는 줄 두 개 + 슬림 바 + 아래로 빛나는 면
    for (const s of [-1, 1]) this.cyl(g, 0.0015, 0.0015, H - 1.75, Mats.black, s * w * 0.38, (H - 1.75) / 2, 0, 4, false);
    this.rbox(g, w, 0.035, 0.07, 0.015, Mats.metal, 0, 0, 0);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, 0.04), Mats.ledOff); glow.rotation.x = Math.PI / 2; glow.position.y = -0.019; g.add(glow);
    g.userData = { glow };
    return g;
  },
  // 하부장 한 칸 (문 홈 포함). w 폭, 앞면 +z
  baseCab(p, x, z, w, rotY = 0, withTop = true) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; p.add(g);
    this.box(g, w, 0.1, 0.56, Mats.black, 0, 0.05, -0.03, false);
    this.box(g, w, 0.76, 0.58, Mats.cabinet, 0, 0.1 + 0.38, 0);
    const doors = Math.max(1, Math.round(w / 0.6));
    for (let i = 1; i < doors; i++) this.box(g, 0.003, 0.74, 0.004, Mats.black, -w / 2 + (w / doors) * i, 0.48, 0.291, false);
    this.box(g, w - 0.01, 0.003, 0.004, Mats.black, 0, 0.67, 0.291, false);
    if (withTop) this.box(g, w + 0.004, 0.03, 0.62, Mats.counter, 0, 0.88, 0.02);
    return g;
  },
  upperCab(p, x, z, w, rotY = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; p.add(g);
    this.box(g, w, 0.72, 0.34, Mats.cabinet, 0, 1.48 + 0.36, 0);
    const doors = Math.max(1, Math.round(w / 0.5));
    for (let i = 1; i < doors; i++) this.box(g, 0.003, 0.7, 0.004, Mats.black, -w / 2 + (w / doors) * i, 1.84, 0.171, false);
    // 하부 LED 바
    const led = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, 0.02), Mats.ledOff); led.rotation.x = Math.PI / 2; led.position.set(0, 1.479, 0.12); g.add(led);
    return { g, led };
  },
  faucet(p, x, z, rotY = 0) {
    const g = new THREE.Group(); g.position.set(x, 0.895, z); g.rotation.y = rotY; p.add(g);
    this.cyl(g, 0.025, 0.028, 0.06, Mats.metal, 0, 0.03, 0, 16);
    const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, 0.42, 0), new THREE.Vector3(0, 0.42, 0.22), new THREE.Vector3(0, 0.3, 0.22));
    this.mesh(new THREE.TubeGeometry(curve, 24, 0.012, 10, false), Mats.metal, 0, 0, 0, g);
    this.box(g, 0.015, 0.012, 0.08, Mats.metal, 0.035, 0.08, 0.02);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.3, 8, 1, true), Mats.std({ color: 0xcfe6ff, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.1 }, 2));
    water.position.set(0, 0.15, 0.22); water.visible = false; g.add(water);
    g.userData = { water };
    return g;
  },
  fridge() {
    const g = new THREE.Group(), W = 0.92, Hh = 2.25, D = 0.62;
    this.box(g, W, Hh, D, Mats.cabinet, 0, Hh / 2, 0);
    // 안쪽 (문 열면 보인다)
    const inner = Mats.std({ color: 0xf4f6f8, roughness: 0.4 }, 0.6);
    this.box(g, W - 0.08, Hh - 0.3, 0.02, inner, 0, Hh / 2, -D / 2 + 0.06, false);
    for (const y of [0.5, 0.9, 1.3, 1.7]) this.box(g, W - 0.1, 0.01, D - 0.12, Mats.glass, 0, y, 0.02, false);
    const items = [[0xd8402a, -0.25, 0.95, 0.07, 0.18], [0x3a8a3a, 0.05, 0.95, 0.06, 0.14], [0xf2f2f2, 0.25, 1.35, 0.05, 0.24], [0xe8b030, -0.15, 1.35, 0.08, 0.12], [0x6a3a8a, 0.2, 0.55, 0.09, 0.08]];
    for (const [c, x, y, r, h] of items) this.cyl(g, r, r, h, Mats.std({ color: c, roughness: 0.5 }, 0.5), x, y + h / 2, 0.02, 14);
    const light = new THREE.PointLight(0xeef6ff, 0, 1.6, 2); light.position.set(0, 1.8, 0.1); g.add(light);
    // 양문 (경첩은 바깥쪽)
    const doors = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * W / 2, 0, D / 2); g.add(pivot);
      const leaf = new THREE.Group(); pivot.add(leaf);
      this.box(leaf, W / 2 - 0.005, Hh - 0.02, 0.05, Mats.appliance, -s * W / 4, Hh / 2, 0.025);
      this.box(leaf, 0.02, 0.6, 0.03, Mats.metal, -s * (W / 2 - 0.05), 1.15, 0.065);
      for (const y of [0.6, 1.1, 1.6]) this.box(leaf, W / 2 - 0.08, 0.08, 0.1, inner, -s * W / 4, y, -0.06, false);
      doors.push({ pivot, s });
    }
    g.userData = { doors, light, k: 0, open: false };
    return g;
  },
  ovenTower() {
    const g = new THREE.Group(), W = 0.62, Hh = 2.25, D = 0.62;
    this.box(g, W, Hh, D, Mats.cabinet, 0, Hh / 2, 0);
    this.box(g, W - 0.06, 0.58, 0.02, Mats.blackGlass, 0, 1.12, D / 2 + 0.01);
    this.box(g, W - 0.12, 0.02, 0.03, Mats.metal, 0, 1.36, D / 2 + 0.03);
    this.box(g, W - 0.06, 0.42, 0.02, Mats.blackGlass, 0, 1.68, D / 2 + 0.01);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.025), new THREE.MeshBasicMaterial({ color: 0x3ad0ff })); disp.position.set(0, 1.86, D / 2 + 0.022); g.add(disp);
    return g;
  },
  island(style) {
    const g = new THREE.Group(), w = 2.4, d = 0.95, h = 0.9;
    this.box(g, w - 0.08, h - 0.04, d - 0.32, Mats.island, 0, (h - 0.04) / 2, -0.12);
    // 워터폴 상판
    this.box(g, w, 0.04, d, Mats.counter, 0, h - 0.02, 0);
    for (const s of [-1, 1]) this.box(g, 0.04, h - 0.04, d, Mats.counter, s * (w / 2 - 0.02), (h - 0.04) / 2, 0);
    // 의자 쪽 아래 공간에 발판
    this.box(g, w - 0.12, 0.02, 0.02, Mats.metal, 0, 0.22, d / 2 - 0.14);
    this.shadow(g, w, d, 1);
    // 과일 그릇, 꽃
    this.cyl(g, 0.16, 0.1, 0.07, Mats.wood, 0.5, h + 0.035, -0.1, 28);
    for (let i = 0; i < 4; i++) this.sph(g, 0.04, Mats.std({ color: [0xd84a2a, 0xe8b030, 0x9ac040, 0xd84a2a][i], roughness: 0.5 }, 0.5), 0.47 + (i % 2) * 0.06, h + 0.09, -0.12 + Math.floor(i / 2) * 0.05, 12);
    return g;
  },
  stool(style) {
    const g = new THREE.Group();
    this.cyl(g, 0.19, 0.19, 0.06, Mats.chair, 0, 0.66, 0, 28);
    this.cyl(g, 0.02, 0.025, 0.63, Mats.metal, 0, 0.32, 0, 12);
    this.cyl(g, 0.2, 0.2, 0.015, Mats.metal, 0, 0.008, 0, 28);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.008, 6, 28), Mats.metal); ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; g.add(ring);
    this.shadow(g, 0.4, 0.4, 0.6);
    return g;
  },

  // ---------------- 침실
  bed(w = 1.9, l = 2.1, style) {
    const g = new THREE.Group();
    this.rbox(g, w + 0.1, 0.28, l + 0.05, 0.02, Mats.head, 0, 0.16, l / 2);
    this.rbox(g, w, 0.24, l - 0.05, 0.05, Mats.porcelain, 0, 0.42, l / 2);
    // 이불: 위가 부드럽게 둥근 판 + 접힌 부분
    this.rbox(g, w + 0.06, 0.1, l - 0.45, 0.05, Mats.bed, 0, 0.56, l / 2 + 0.2);
    this.rbox(g, w + 0.07, 0.12, 0.3, 0.06, Mats.bed, 0, 0.58, 0.55);
    this.rbox(g, w + 0.04, 0.025, 0.55, 0.012, Mats.throw, 0, 0.63, l - 0.42);
    // 베개
    for (const s of [-1, 1]) { const p = this.rbox(g, w / 2 - 0.12, 0.16, 0.36, 0.08, Mats.bed, s * (w / 4), 0.65, 0.26); p.rotation.x = -0.35; }
    const c = this.rbox(g, 0.45, 0.32, 0.12, 0.06, Mats.cushion, 0, 0.72, 0.42); c.rotation.x = -0.3;
    // 헤드보드 (벽에 붙는 넓은 패널) + 뒤쪽 간접조명
    this.rbox(g, w + 0.9, 1.05, 0.09, 0.03, Mats.head, 0, 0.3 + 0.525, 0.045);
    for (let i = -3; i <= 3; i++) this.box(g, 0.004, 0.95, 0.004, Mats.black, i * (w + 0.9) / 7, 0.825, 0.092, false);
    const led = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.8, 0.02), Mats.ledOff); led.rotation.x = -Math.PI / 2; led.position.set(0, 1.352, 0.045); g.add(led);
    this.shadow(g, w + 0.3, l + 0.2, 1.1).position.z = l / 2;
    g.userData = { led };
    return g;
  },
  nightstand() {
    const g = new THREE.Group();
    this.rbox(g, 0.5, 0.42, 0.4, 0.01, Mats.wood, 0, 0.12 + 0.21, 0);
    this.box(g, 0.46, 0.003, 0.004, Mats.black, 0, 0.33, 0.201, false);
    this.legs(g, 0.44, 0.34, 0.12, Mats.metal, 0.01, 0.03, 1);
    // 스탠드
    this.cyl(g, 0.07, 0.09, 0.02, Mats.metal, -0.08, 0.55, 0, 20);
    this.cyl(g, 0.008, 0.008, 0.3, Mats.metal, -0.08, 0.7, 0, 8);
    const shade = this.cyl(g, 0.11, 0.14, 0.18, Mats.std({ color: 0xf2ece2, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffc890, emissiveIntensity: 0 }, 0.3), -0.08, 0.86, 0, 24);
    const light = new THREE.PointLight(0xffc890, 0, 2.6, 2); light.position.set(-0.08, 0.84, 0); g.add(light);
    this.box(g, 0.14, 0.02, 0.2, Mats.paper, 0.12, 0.555, 0.02).rotation.y = 0.3;
    g.userData = { light, shade, power: 1.4 };
    this.shadow(g, 0.5, 0.4, 0.7);
    return g;
  },
  wardrobe(w, h = 2.32) {
    const g = new THREE.Group(), d = 0.6;
    this.box(g, w, h, d, Mats.trim, 0, h / 2, 0);
    const n = Math.round(w / 0.5);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w / n) * (i + 0.5);
      this.box(g, w / n - 0.006, h - 0.04, 0.02, Mats.cabinet, x, h / 2, d / 2 + 0.01);
      this.box(g, 0.012, 0.32, 0.02, Mats.metal, x + (i % 2 ? -1 : 1) * (w / n / 2 - 0.05), 1.05, d / 2 + 0.03);
    }
    return g;
  },
  desk(w = 1.6, monitors = 1) {
    const g = new THREE.Group(), d = 0.7;
    this.rbox(g, w, 0.035, d, 0.008, Mats.wood, 0, 0.73, 0);
    for (const s of [-1, 1]) { this.box(g, 0.05, 0.71, 0.05, Mats.black, s * (w / 2 - 0.08), 0.355, 0); this.box(g, 0.05, 0.03, d - 0.08, Mats.black, s * (w / 2 - 0.08), 0.015, 0); }
    const screens = [];
    for (let i = 0; i < monitors; i++) {
      const x = monitors === 1 ? 0 : (i - 0.5) * 0.62;
      this.box(g, 0.2, 0.012, 0.16, Mats.black, x, 0.754, -0.18);
      this.box(g, 0.03, 0.3, 0.02, Mats.black, x, 0.9, -0.24);
      const mon = new THREE.Group(); mon.position.set(x, 1.08, -0.22); mon.rotation.y = monitors === 1 ? 0 : -(i - 0.5) * 0.35; g.add(mon);
      this.box(mon, 0.6, 0.36, 0.025, Mats.black, 0, 0, 0);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.33), Mats.screenOff); scr.position.z = 0.0135; mon.add(scr);
      screens.push(scr);
    }
    this.rbox(g, 0.42, 0.015, 0.13, 0.005, Mats.porcelain, 0, 0.754, 0.12);
    this.rbox(g, 0.06, 0.02, 0.1, 0.01, Mats.porcelain, 0.3, 0.756, 0.13);
    this.box(g, 0.8, 0.002, 0.35, Mats.black, 0, 0.749, 0.1, false);
    this.shadow(g, w, d, 0.7);
    g.userData = { screens };
    return g;
  },
  deskChair() {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU, leg = this.box(g, 0.3, 0.025, 0.04, Mats.black, Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15); leg.rotation.y = -a; this.sph(g, 0.025, Mats.black, Math.cos(a) * 0.3, 0.025, Math.sin(a) * 0.3, 8); }
    this.cyl(g, 0.025, 0.025, 0.38, Mats.metal, 0, 0.26, 0, 10);
    this.rbox(g, 0.5, 0.08, 0.48, 0.04, Mats.chair, 0, 0.48, 0);
    const back = this.rbox(g, 0.46, 0.58, 0.06, 0.04, Mats.chair, 0, 0.86, -0.24); back.rotation.x = -0.1;
    for (const s of [-1, 1]) this.box(g, 0.04, 0.2, 0.3, Mats.black, s * 0.27, 0.6, -0.02);
    this.shadow(g, 0.6, 0.6, 0.6);
    return g;
  },
  bookshelf(w, h, d = 0.32) {
    const g = new THREE.Group();
    const rows = Math.floor(h / 0.38);
    for (const s of [-1, 1]) this.box(g, 0.025, h, d, Mats.wood, s * (w / 2 - 0.0125), h / 2, 0);
    for (let i = 0; i <= rows; i++) this.box(g, w, 0.025, d, Mats.wood, 0, 0.02 + i * (h - 0.04) / rows, 0);
    this.box(g, w, h, 0.01, Mats.wood, 0, h / 2, -d / 2 + 0.005);
    // 책 (색이 다른 상자, 하나의 메시로)
    const r = mulberry32(hashStr('books' + w)), geos = [], cols = [0x2a3a5a, 0xa0352a, 0xd9c7a2, 0x3c5a3a, 0x1f1f1f, 0xe8e2d6, 0x8a6a3a, 0x5a4a6a, 0xc9a24a];
    for (let i = 0; i < rows; i++) {
      let x = -w / 2 + 0.04; const y0 = 0.035 + i * (h - 0.04) / rows;
      while (x < w / 2 - 0.08) {
        if (r() < 0.12) { x += 0.12; continue; }
        const bw = 0.02 + r() * 0.035, bh = 0.2 + r() * 0.12, bd = 0.16 + r() * 0.08;
        const bg = new THREE.BoxGeometry(bw, bh, bd); bg.translate(x + bw / 2, y0 + bh / 2, -d / 2 + 0.02 + bd / 2);
        const c = new THREE.Color(cols[Math.floor(r() * cols.length)]), col = [];
        for (let k = 0; k < bg.attributes.position.count; k++) col.push(c.r, c.g, c.b);
        bg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); bg.deleteAttribute('uv');
        geos.push(bg); x += bw + 0.002;
      }
    }
    if (geos.length) { const m = new THREE.Mesh(mergeGeometries(geos), Mats.book); m.castShadow = true; m.receiveShadow = true; g.add(m); }
    return g;
  },
  readingChair() {
    const g = new THREE.Group();
    this.rbox(g, 0.78, 0.18, 0.78, 0.07, Mats.chair, 0, 0.34, 0.02);
    const b = this.rbox(g, 0.74, 0.6, 0.16, 0.07, Mats.chair, 0, 0.66, -0.3); b.rotation.x = -0.18;
    for (const s of [-1, 1]) this.rbox(g, 0.12, 0.24, 0.66, 0.05, Mats.chair, s * 0.36, 0.5, 0);
    this.legs(g, 0.7, 0.7, 0.25, Mats.wood, 0.02, 0.06, 0.7);
    this.shadow(g, 0.8, 0.8, 0.7);
    return g;
  },

  // ---------------- 욕실·현관·다용도실
  vanity(w = 1.0) {
    const g = new THREE.Group(), d = 0.5;
    this.box(g, w, 0.45, d, Mats.wood, 0, 0.6, 0);
    this.box(g, w + 0.01, 0.03, d + 0.02, Mats.counter, 0, 0.84, 0.01);
    const basin = this.rbox(g, 0.46, 0.13, 0.36, 0.06, Mats.porcelain, 0, 0.92, 0.03);
    this.rbox(g, 0.4, 0.02, 0.3, 0.05, Mats.std({ color: 0xdfe3e6, roughness: 0.15 }, 1.2), 0, 0.986, 0.03);
    this.cyl(g, 0.015, 0.015, 0.22, Mats.metal, 0, 0.94, -0.2, 12);
    this.box(g, 0.02, 0.02, 0.12, Mats.metal, 0, 1.05, -0.15);
    // 거울 + 뒤 간접조명
    this.rbox(g, w - 0.1, 0.8, 0.02, 0.01, Mats.mirror, 0, 1.5, -d / 2 + 0.025);
    const led = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, 0.84), Mats.ledOff); led.position.set(0, 1.5, -d / 2 + 0.012); g.add(led);
    this.box(g, 0.1, 0.03, 0.1, Mats.porcelain, w / 2 - 0.12, 0.87, 0.12);
    g.userData = { led, basin };
    return g;
  },
  toilet() {
    const g = new THREE.Group();
    this.rbox(g, 0.36, 0.38, 0.5, 0.12, Mats.porcelain, 0, 0.19, 0.05);
    this.rbox(g, 0.38, 0.04, 0.5, 0.1, Mats.porcelain, 0, 0.41, 0.06);
    this.rbox(g, 0.4, 0.36, 0.2, 0.05, Mats.porcelain, 0, 0.6, -0.22);
    this.box(g, 0.06, 0.012, 0.03, Mats.metal, 0.12, 0.78, -0.22);
    this.shadow(g, 0.4, 0.6, 0.6);
    return g;
  },
  bathtub() {
    const g = new THREE.Group(), w = 1.6, d = 0.74;
    this.rbox(g, w, 0.56, d, 0.04, Mats.porcelain, 0, 0.28, 0);
    this.rbox(g, w - 0.16, 0.05, d - 0.16, 0.12, Mats.std({ color: 0xe8ecef, roughness: 0.12 }, 1.4), 0, 0.535, 0);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, d - 0.2), Mats.std({ color: 0x9cc8e0, transparent: true, opacity: 0.0, roughness: 0.02, metalness: 0.2 }, 3)); water.rotation.x = -Math.PI / 2; water.position.y = 0.4; g.add(water);
    this.cyl(g, 0.012, 0.012, 0.16, Mats.metal, -w / 2 + 0.15, 0.62, -d / 2 + 0.08, 10);
    this.box(g, 0.02, 0.02, 0.12, Mats.metal, -w / 2 + 0.15, 0.7, -d / 2 + 0.13);
    g.userData = { water, level: 0 };
    return g;
  },
  shower(w, d) {
    const g = new THREE.Group();
    this.box(g, w, 0.04, d, Mats.bathFloor, 0, 0.02, 0, false);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(d, 2.0), Mats.glassDoor); gl.rotation.y = Math.PI / 2; gl.position.set(w / 2, 1.04, 0); g.add(gl);
    this.box(g, 0.02, 2.0, 0.02, Mats.frame, w / 2, 1.04, d / 2 - 0.01);
    this.box(g, 0.02, 0.02, d, Mats.frame, w / 2, 2.04, 0);
    // 레인 샤워 헤드
    this.cyl(g, 0.012, 0.012, 0.4, Mats.metal, -w / 2 + 0.06, 2.0, 0, 8).rotation.z = Math.PI / 2;
    this.cyl(g, 0.12, 0.12, 0.015, Mats.metal, -w / 2 + 0.25, 1.98, 0, 32);
    this.cyl(g, 0.012, 0.012, 1.1, Mats.metal, -w / 2 + 0.03, 1.3, 0, 8);
    this.box(g, 0.05, 0.12, 0.08, Mats.metal, -w / 2 + 0.04, 1.05, 0);
    // 물줄기 (켜면 보인다)
    const lines = [];
    for (let i = 0; i < 40; i++) { const a = mulberry32(i)() * TAU, r = mulberry32(i + 99)() * 0.1; lines.push(-w / 2 + 0.25 + Math.cos(a) * r, 1.97, Math.sin(a) * r, -w / 2 + 0.25 + Math.cos(a) * r * 1.4, 0.04, Math.sin(a) * r * 1.4); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    const water = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.45 })); water.visible = false; g.add(water);
    g.userData = { water };
    return g;
  },
  towelBar(w = 0.6) {
    const g = new THREE.Group();
    this.cyl(g, 0.01, 0.01, w, Mats.metal, 0, 1.2, 0.06, 10).rotation.z = Math.PI / 2;
    this.rbox(g, w * 0.7, 0.55, 0.04, 0.015, Mats.bed, 0, 0.95, 0.07);
    return g;
  },
  washer(dryer = false) {
    const g = new THREE.Group();
    this.rbox(g, 0.62, 0.85, 0.66, 0.03, Mats.appliance, 0, 0.425, 0);
    const door = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 10, 32), Mats.chrome); door.position.set(0, 0.42, 0.335); g.add(door);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), Mats.blackGlass); glass.position.set(0, 0.42, 0.33); g.add(glass);
    this.box(g, 0.5, 0.08, 0.01, Mats.blackGlass, 0, 0.77, 0.333);
    if (dryer) this.box(g, 0.08, 0.02, 0.01, Mats.std({ color: 0x40ff90, emissive: 0x40ff90, emissiveIntensity: 1 }), 0.15, 0.77, 0.339);
    return g;
  },
  shoeCabinet(w, h = 2.3) {
    const g = new THREE.Group(), d = 0.4;
    this.box(g, w, h, d, Mats.cabinet, 0, h / 2, 0);
    // 가운데 오픈 선반 + 간접조명
    this.box(g, w - 0.04, 0.32, d - 0.02, Mats.black, 0, 1.1, 0.012, false);
    const led = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, 0.015), Mats.ledOff); led.rotation.x = Math.PI / 2; led.position.set(0, 1.255, 0.05); g.add(led);
    const n = Math.round(w / 0.45);
    for (let i = 1; i < n; i++) { this.box(g, 0.003, 0.9, 0.004, Mats.black, -w / 2 + (w / n) * i, 0.48, d / 2 + 0.001, false); this.box(g, 0.003, 1.0, 0.004, Mats.black, -w / 2 + (w / n) * i, 1.78, d / 2 + 0.001, false); }
    this.box(g, w, 0.08, d - 0.04, Mats.black, 0, 0.04, -0.02, false);
    // 열쇠 그릇
    this.cyl(g, 0.08, 0.05, 0.03, Mats.metal, w / 4, 0.955, 0.04, 20);
    g.userData = { led };
    return g;
  },
  bench(w = 0.9) { const g = new THREE.Group(); this.rbox(g, w, 0.05, 0.36, 0.015, Mats.wood, 0, 0.44, 0); this.rbox(g, w - 0.06, 0.06, 0.3, 0.03, Mats.cushion, 0, 0.495, 0); this.legs(g, w - 0.04, 0.32, 0.42, Mats.metal, 0.012, 0.03, 1); this.shadow(g, w, 0.4, 0.6); return g; },
  console(w = 1.1) {
    const g = new THREE.Group();
    this.rbox(g, w, 0.04, 0.32, 0.01, Mats.counter, 0, 0.8, 0);
    for (const s of [-1, 1]) this.box(g, 0.03, 0.78, 0.28, Mats.metal, s * (w / 2 - 0.05), 0.39, 0);
    this.cyl(g, 0.06, 0.1, 0.32, Mats.porcelain, -w / 4, 0.98, 0, 20);
    this.box(g, 0.2, 0.04, 0.14, Mats.paper, w / 4, 0.84, 0);
    this.shadow(g, w, 0.35, 0.6);
    return g;
  },
  wallPad() {
    const g = new THREE.Group();
    this.rbox(g, 0.24, 0.17, 0.02, 0.008, Mats.black, 0, 0, 0.01);
    const c = Tex.canvas(256, 180), gx = c.getContext('2d');
    gx.fillStyle = '#0b1622'; gx.fillRect(0, 0, 256, 180);
    gx.fillStyle = '#5ac8fa'; gx.font = '700 28px sans-serif'; gx.fillText('HOME', 18, 44);
    gx.fillStyle = '#ffffff'; gx.font = '500 20px sans-serif'; gx.fillText('24°C  습도 45%', 18, 84);
    for (let i = 0; i < 4; i++) { gx.fillStyle = 'rgba(90,200,250,0.18)'; gx.fillRect(18 + i * 58, 110, 50, 50); }
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.145), new THREE.MeshBasicMaterial({ map: Tex.tex(c) })); scr.position.z = 0.021; g.add(scr);
    return g;
  },
  // 벽 스위치 (누르면 표시등 색이 바뀐다)
  lightSwitch() {
    const g = new THREE.Group();
    this.rbox(g, 0.075, 0.12, 0.012, 0.004, Mats.porcelain, 0, 0, 0.006, false);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.005, 12), new THREE.MeshBasicMaterial({ color: 0x40ff90 })); dot.position.set(0, -0.035, 0.0125); g.add(dot);
    this.rbox(g, 0.05, 0.05, 0.01, 0.004, Mats.porcelain, 0, 0.012, 0.016, false);
    g.userData = { dot };
    return g;
  },
  robot() {
    const g = new THREE.Group();
    this.cyl(g, 0.17, 0.17, 0.09, Mats.std({ color: 0xf2f2f2, roughness: 0.35 }, 1), 0, 0.05, 0, 36);
    this.cyl(g, 0.05, 0.05, 0.02, Mats.blackGlass, 0, 0.1, 0.05, 20);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.004, 6, 24), new THREE.MeshBasicMaterial({ color: 0x3ad0ff })); ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.112, 0.05); g.add(ring);
    this.box(g, 0.25, 0.03, 0.02, Mats.black, 0, 0.03, 0.16);
    this.shadow(g, 0.36, 0.36, 0.5);
    g.userData = { ring };
    return g;
  },
  // 커튼: 주름진 면(사인파) 두 장, k=0 닫힘 → 1 열림 (양옆으로 모인다)
  curtain(width, height, mat, folds = 18) {
    const geo = new THREE.PlaneGeometry(1, height, folds * 4, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, Math.sin((x + 0.5) * folds * Math.PI) * 0.035); }
    geo.computeVertexNormals();
    geo.translate(0.5, height / 2, 0);
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
    return m;
  },
};
