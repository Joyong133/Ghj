// ---------------------------------------------------------------------------
// 인테리어 스타일 4종과 공용 재질. 스타일을 바꾸면 재질의 색·텍스처만 바꾼다(메시는 그대로).
// ---------------------------------------------------------------------------
const STYLES = {
  warm: {
    name: '모던 웜', desc: '헤링본 오크 마루, 화이트 대리석 아트월, 그레이지 주방과 브라스 포인트.',
    swatch: ['#a87b52', '#efebe4', '#cfc5b6', '#c9a46a'],
    floor: { pattern: 'herring', n: 4, base: '#b58e66', dark: '#93704f', light: '#cfae88', size: 0.72, rot: Math.PI / 4 },
    wall: '#ece6dd', wallTex: 'paint', ceil: '#f2eee8', trim: '#e6dfd5',
    accent: { kind: 'marble', base: '#efebe4', vein: '#8f8a82', vein2: '#c8b79a', size: 1.6 },
    cabinet: '#cfc5b6', counter: { base: '#f1eee9', vein: '#9b968e', vein2: '#cdbfa6' }, island: 'wood',
    wood: { base: '#b89a76', dark: '#9a7b58', light: '#ccb08e' }, door: 'wood',
    metal: { color: '#c9a46a', metal: 1, rough: 0.28 }, frame: '#3a3632',
    sofa: { color: '#e7dfd2', tex: 'boucle' }, cushion: '#b88f63', chair: '#d8cbb6',
    curtain: '#d9cdbb', rug: ['lines', '#e2d6c3', '#c4ae8d', '#b89a74'], bed: '#f3efe8', throw: '#c9a27a', head: '#cbb79c',
    bathFloor: { base: '#cfc8bd', vein: '#a59d92' }, bathWall: { base: '#eeebe5', vein: '#c9c2b6' }, stone: { base: '#d8d2c8', vein: '#aaa298' },
    led: 0xffcf9a, art: [['#e9dfd0', '#c58a5c', '#7d8c79', '#2f3a3a'], ['#efe7da', '#d9b38a', '#8a6a52', '#e4c9a5'], ['#e6ddd0', '#3d4a52', '#c79868', '#e9d7bd']],
    appliance: '#d8d2c8',
  },
  scandi: {
    name: '스칸디 화이트', desc: '밝은 애쉬 일자 마루, 화이트 벽, 원목 루버와 블랙 포인트.',
    swatch: ['#d4bc97', '#f3f3f1', '#cfae84', '#1d1d1d'],
    floor: { pattern: 'plank', rows: 8, len: 2, base: '#d6c19f', dark: '#c0a985', light: '#e6d6ba', size: 1.6, rot: 0 },
    wall: '#f3f3f1', wallTex: 'paint', ceil: '#f7f7f5', trim: '#f2f2f0',
    accent: { kind: 'slats', base: '#cfae84', dark: '#8a6a45', size: 0.6 },
    cabinet: '#f2f2ef', counter: { base: '#f4f3f0', vein: '#d6d4d0', vein2: '#e6e4e0' }, island: 'wood',
    wood: { base: '#d8c3a1', dark: '#c2ab88', light: '#e6d6ba' }, door: 'white',
    metal: { color: '#1d1d1d', metal: 0.4, rough: 0.45 }, frame: '#f1f1ef',
    sofa: { color: '#c6cacf', tex: 'weave' }, cushion: '#e7c26e', chair: '#e9e5dc',
    curtain: '#e9e7e2', rug: ['diamond', '#dcdcdc', '#b3b6b9', '#8f9398'], bed: '#ffffff', throw: '#9aa7b3', head: '#d8d8d4',
    bathFloor: { base: '#d9d9d6', vein: '#bcbcb8' }, bathWall: { base: '#f6f6f4', vein: '#e2e2df' }, stone: { base: '#e2e1dd', vein: '#c4c3bf' },
    led: 0xfff0dc, art: [['#f4f1ea', '#1f2a36', '#e3b23c', '#c94f3d'], ['#f2efe9', '#90a8b8', '#2b3a48', '#e8d8c0'], ['#f5f3ee', '#d47b4a', '#3b5b52', '#e9c46a']],
    appliance: '#f2f2f0',
  },
  dark: {
    name: '다크 럭셔리', desc: '월넛 헤링본, 네로 마르퀴나 대리석, 블랙 주방과 골드 포인트.',
    swatch: ['#5b3c27', '#121212', '#2f4a3f', '#d4af6a'],
    floor: { pattern: 'herring', n: 4, base: '#5e4130', dark: '#46301f', light: '#785640', size: 0.72, rot: Math.PI / 4 },
    wall: '#6e6861', wallTex: 'paint', ceil: '#d6d0c7', trim: '#2a2826',
    accent: { kind: 'marble', base: '#141414', vein: '#d9d4c9', vein2: '#b08d57', size: 1.6 },
    cabinet: '#1f1f20', counter: { base: '#151515', vein: '#d8d2c6', vein2: '#a8874f' }, island: 'wood',
    wood: { base: '#5a3e2b', dark: '#45301f', light: '#70503a' }, door: 'wood',
    metal: { color: '#d4af6a', metal: 1, rough: 0.25 }, frame: '#151515',
    sofa: { color: '#2f4a3f', tex: 'velvet' }, cushion: '#b08d57', chair: '#3b2a1f',
    curtain: '#3a3f48', rug: ['border', '#1d2433', '#b08d57', '#9a7a46'], bed: '#2d2d30', throw: '#8a6a3a', head: '#3a332d',
    bathFloor: { base: '#3b3a38', vein: '#77736d' }, bathWall: { base: '#181818', vein: '#cfc8bb' }, stone: { base: '#2f2e2c', vein: '#6e6a64' },
    led: 0xffc48a, art: [['#151515', '#b08d57', '#6b2d2d', '#d9d4c9'], ['#1c1c1c', '#c9a46a', '#2f4a3f', '#e0d6c4'], ['#202020', '#7a1f2b', '#c2a26a', '#3b3b3b']],
    appliance: '#2a2a2b',
  },
  japandi: {
    name: '재패니', desc: '넓은 오크 마루와 석회 벽, 세이지 주방, 리넨과 황마의 차분한 결.',
    swatch: ['#c9ad85', '#e3d9ca', '#9aa08a', '#2b2a28'],
    floor: { pattern: 'plank', rows: 6, len: 1, base: '#c8ae8a', dark: '#b09574', light: '#d9c4a4', size: 1.6, rot: 0 },
    wall: '#e4dacb', wallTex: 'lime', ceil: '#efe9df', trim: '#d8ccb9',
    accent: { kind: 'lime', base: '#d8ccbb', size: 2.0 },
    cabinet: '#9ca18b', counter: { base: '#ddd0ba', vein: '#b8a688', vein2: '#cbbb9e' }, island: 'cabinet',
    wood: { base: '#c8ad87', dark: '#b29672', light: '#d8c2a0' }, door: 'wood',
    metal: { color: '#2b2a28', metal: 0.4, rough: 0.5 }, frame: '#2b2a28',
    sofa: { color: '#d3c4ab', tex: 'weave' }, cushion: '#8b8f7a', chair: '#c9b897',
    curtain: '#cdbfa6', rug: ['jute', '#c7ad83', '#8f7754', '#8f7754'], bed: '#e9e2d6', throw: '#8b8f7a', head: '#bfae93',
    bathFloor: { base: '#c9bca7', vein: '#a99a82' }, bathWall: { base: '#e6dccd', vein: '#cdbfa8' }, stone: { base: '#cbbfab', vein: '#a99c86' },
    led: 0xffcd96, art: [['#e8dfd0', '#2b2a28', '#a35d3d', '#8b8f7a'], ['#ece4d7', '#6f7560', '#c9a77a', '#3b3a36'], ['#e4dccf', '#b07a52', '#45483c', '#d6c3a4']],
    appliance: '#d9d1c4',
  },
};
const STYLE_KEYS = ['warm', 'scandi', 'dark', 'japandi'];

const Mats = {
  all: [],
  texCache: new Map(),
  std(o = {}, envK = 1) { const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.8, envMap: R.envTex }, o)); m.userData.envK = envK; this.all.push(m); return m; },
  phys(o = {}, envK = 1) { const m = new THREE.MeshPhysicalMaterial(Object.assign({ envMap: R.envTex }, o)); m.userData.envK = envK; this.all.push(m); return m; },
  t(key, canvasFn, opts) { if (!this.texCache.has(key)) this.texCache.set(key, Tex.tex(canvasFn(), opts)); return this.texCache.get(key); },

  init() {
    const white = Tex.canvas(4); white.getContext('2d').fillStyle = '#fff'; white.getContext('2d').fillRect(0, 0, 4, 4);
    this.whiteTex = Tex.tex(white);
    const S = (o, k) => this.std(o, k);
    this.floor = S({ map: this.whiteTex, normalMap: this.whiteTex, roughness: 0.42, normalScale: new THREE.Vector2(0.6, 0.6) }, 1.2);
    this.bathFloor = S({ map: this.whiteTex, normalMap: this.whiteTex, roughness: 0.3 }, 1.4);
    this.bathWall = S({ map: this.whiteTex, normalMap: this.whiteTex, roughness: 0.18 }, 1.6);
    this.stone = S({ map: this.whiteTex, normalMap: this.whiteTex, roughness: 0.25 }, 1.4);
    this.wall = S({ map: this.whiteTex, roughness: 0.92 }, 0.4);
    this.ceil = S({ map: this.whiteTex, roughness: 0.95 }, 0.3);
    this.accent = S({ map: this.whiteTex, normalMap: this.whiteTex, roughness: 0.3 }, 1.4);
    this.trim = S({ roughness: 0.5 }, 0.8);
    this.door = S({ map: this.whiteTex, roughness: 0.55 }, 0.8);
    this.cabinet = S({ roughness: 0.6 }, 0.8);
    this.counter = S({ map: this.whiteTex, roughness: 0.18 }, 1.6);
    this.island = S({ map: this.whiteTex, roughness: 0.55 }, 0.8);
    this.wood = S({ map: this.whiteTex, roughness: 0.55 }, 0.8);
    this.metal = S({ metalness: 1, roughness: 0.3 }, 2);
    this.chrome = S({ color: 0xeeeeee, metalness: 1, roughness: 0.08 }, 2);
    this.black = S({ color: 0x161616, roughness: 0.5, metalness: 0.2 }, 0.8);
    this.blackGlass = S({ color: 0x050505, roughness: 0.08, metalness: 0.4 }, 2);
    this.frame = S({ roughness: 0.4, metalness: 0.5 }, 1);
    this.glass = S({ color: 0xbfd6e4, transparent: true, opacity: 0.12, roughness: 0.02, metalness: 0.2, depthWrite: false }, 2.5);
    this.glassDoor = S({ color: 0xd8e4ea, transparent: true, opacity: 0.22, roughness: 0.15, metalness: 0.1, depthWrite: false }, 2);
    this.mirror = S({ color: 0xffffff, metalness: 1, roughness: 0.02 }, 3);
    this.porcelain = S({ color: 0xf7f7f5, roughness: 0.12 }, 1.6);
    this.sofa = S({ map: this.whiteTex, normalMap: this.whiteTex, roughness: 0.95 }, 0.3);
    this.cushion = S({ map: this.whiteTex, normalMap: this.whiteTex, roughness: 0.95 }, 0.3);
    this.chair = S({ map: this.whiteTex, normalMap: this.whiteTex, roughness: 0.9 }, 0.3);
    this.rug = S({ map: this.whiteTex, roughness: 1 }, 0.1);
    this.bed = S({ map: this.whiteTex, normalMap: this.whiteTex, roughness: 0.95 }, 0.2);
    this.throw = S({ map: this.whiteTex, normalMap: this.whiteTex, roughness: 0.95 }, 0.2);
    this.head = S({ map: this.whiteTex, normalMap: this.whiteTex, roughness: 0.9 }, 0.3);
    this.appliance = S({ roughness: 0.35, metalness: 0.3 }, 1.4);
    this.curtain = S({ map: this.whiteTex, normalMap: this.whiteTex, side: THREE.DoubleSide, roughness: 1 }, 0.2);
    this.sheer = S({ color: 0xfbf8f2, transparent: true, opacity: 0.5, side: THREE.DoubleSide, roughness: 1, depthWrite: false }, 0.2);
    this.plantPot = S({ color: 0xe9e4dc, roughness: 0.6 }, 0.8);
    this.soil = S({ color: 0x3b2c22, roughness: 1 }, 0);
    this.leaf = S({ map: Tex.tex(Tex.leaf('broad')), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }, 0.4);
    this.monstera = S({ map: Tex.tex(Tex.leaf('monstera')), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }, 0.4);
    this.stem = S({ color: 0x3e5a2c, roughness: 0.8 }, 0.2);
    this.book = S({ vertexColors: true, roughness: 0.8 }, 0.3);
    this.paper = S({ color: 0xf4f1ea, roughness: 0.9 }, 0.2);
    this.screenOff = S({ color: 0x0b0b0c, roughness: 0.1, metalness: 0.5 }, 2);
    this.shadow = new THREE.MeshBasicMaterial({ map: Tex.tex(this.blobCanvas(), { srgb: false }), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.55 });
    // 빛나는 재질 (간접조명, 다운라이트, 스위치 표시)
    this.led = new THREE.MeshBasicMaterial({ color: 0xffd8a8 });
    this.ledOff = new THREE.MeshStandardMaterial({ color: 0xdedad2, roughness: 0.4, envMap: R.envTex });
    this.downOn = new THREE.MeshBasicMaterial({ color: 0xfff1dc });
    this.art = [0, 1, 2].map(() => S({ map: this.whiteTex, roughness: 0.85 }, 0.2));
  },
  blobCanvas() {
    const c = Tex.canvas(128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return c;
  },

  // 스타일 적용
  apply(key) {
    const s = STYLES[key];
    const rep = (tex, size) => { tex.repeat.set(1 / size, 1 / size); return tex; };
    // 마루
    const f = s.floor, wood = Tex.wood(f);
    this.floor.map = rep(this.t('fw:' + key, () => wood.map, { rot: f.rot }), f.size);
    this.floor.normalMap = rep(this.t('fn:' + key, () => wood.normal, { srgb: false, rot: f.rot }), f.size);
    // 욕실·현관 타일
    const bf = Tex.tiles({ base: s.bathFloor.base, vein: s.bathFloor.vein, grout: '#8f8a84', tw: 0.6, th: 0.6, seed: 4 });
    this.bathFloor.map = rep(this.t('bf:' + key, () => bf.map), 1.2); this.bathFloor.normalMap = rep(this.t('bfn:' + key, () => bf.normal, { srgb: false }), 1.2);
    const bw = Tex.tiles({ base: s.bathWall.base, vein: s.bathWall.vein, grout: '#b8b2aa', tw: 0.6, th: 1.2, seed: 8, strength: 0.6 });
    this.bathWall.map = rep(this.t('bw:' + key, () => bw.map), 1.2); this.bathWall.normalMap = rep(this.t('bwn:' + key, () => bw.normal, { srgb: false }), 1.2);
    const st = Tex.tiles({ base: s.stone.base, vein: s.stone.vein, grout: '#8a857e', tw: 0.6, th: 1.2, seed: 9 });
    this.stone.map = rep(this.t('st:' + key, () => st.map), 1.2); this.stone.normalMap = rep(this.t('stn:' + key, () => st.normal, { srgb: false }), 1.2);
    // 벽·천장
    this.wall.color.set(s.wall); this.wall.map = rep(this.t('wp:' + s.wallTex, () => Tex.wallpaint(s.wallTex)), s.wallTex === 'lime' ? 2.4 : 1.5);
    this.ceil.color.set(s.ceil); this.ceil.map = rep(this.t('wp:paint', () => Tex.wallpaint('paint')), 1.5);
    this.trim.color.set(s.trim);
    // 아트월
    const a = s.accent;
    this.accent.color.set(0xffffff); this.accent.roughness = 0.3; this.accent.normalMap = this.whiteTex; this.accent.normalScale.set(1, 1);
    if (a.kind === 'marble') this.accent.map = rep(this.t('acm:' + key, () => Tex.marble({ base: a.base, vein: a.vein, vein2: a.vein2, seed: 17 })), a.size);
    else if (a.kind === 'slats') { const sl = Tex.slats(a); this.accent.map = rep(this.t('acs:' + key, () => sl.map), a.size); this.accent.normalMap = rep(this.t('acsn:' + key, () => sl.normal, { srgb: false }), a.size); this.accent.roughness = 0.65; }
    else { this.accent.map = rep(this.t('wp:lime', () => Tex.wallpaint('lime')), a.size); this.accent.color.set(a.base); this.accent.roughness = 0.95; }
    this.accent.needsUpdate = true;
    // 원목 가구, 문
    const vt = this.t('vn:' + key, () => Tex.veneer(s.wood));
    this.wood.map = rep(vt, 1.2);
    this.door.map = s.door === 'wood' ? vt : this.whiteTex; this.door.color.set(s.door === 'wood' ? 0xffffff : 0xf4f4f2);
    this.cabinet.color.set(s.cabinet);
    this.counter.map = rep(this.t('ct:' + key, () => Tex.marble({ base: s.counter.base, vein: s.counter.vein, vein2: s.counter.vein2, seed: 23 })), 1.4);
    if (s.island === 'wood') { this.island.map = vt; this.island.color.set(0xffffff); } else { this.island.map = this.whiteTex; this.island.color.set(s.cabinet); }
    this.metal.color.set(s.metal.color); this.metal.metalness = s.metal.metal; this.metal.roughness = s.metal.rough;
    this.frame.color.set(s.frame);
    // 패브릭
    const fab = (mat, color, kind, size) => { const t = Tex.fabric(kind); mat.color.set(color); mat.map = rep(this.t('fb:' + kind, () => t.map), size); mat.normalMap = rep(this.t('fbn:' + kind, () => t.normal, { srgb: false }), size); };
    fab(this.sofa, s.sofa.color, s.sofa.tex, 0.25); this.sofa.roughness = s.sofa.tex === 'velvet' ? 0.75 : 0.95;
    fab(this.cushion, s.cushion, 'weave', 0.2); fab(this.chair, s.chair, key === 'dark' ? 'leather' : 'weave', 0.3); this.chair.roughness = key === 'dark' ? 0.55 : 0.9;
    fab(this.curtain, s.curtain, 'weave', 0.3);
    fab(this.bed, s.bed, 'weave', 0.2); fab(this.throw, s.throw, 'boucle', 0.2); fab(this.head, s.head, key === 'dark' ? 'leather' : 'weave', 0.3);
    this.rug.map = this.t('rug:' + key, () => Tex.rug(...s.rug));
    this.appliance.color.set(s.appliance);
    s.art.forEach((pal, i) => { this.art[i].map = this.t(`art:${key}:${i}`, () => Tex.art(hashStr(key) % 97 * 3 + i, pal)); });
    // 조명 색
    this.led.color.setHex(s.led);
    this.downOn.color.setHex(s.led).lerp(new THREE.Color(0xffffff), 0.5);
    for (const m of this.all) m.needsUpdate = true;
  },
  // 시간대에 따른 주변 반사 세기
  setEnv(k) { for (const m of this.all) m.envMapIntensity = k * (m.userData.envK ?? 1); },
};
