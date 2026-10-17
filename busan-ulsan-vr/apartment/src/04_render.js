// ---------------------------------------------------------------------------
// 렌더러, 카메라, 하늘, 창밖 도시(24층 높이에서 보이는 단지·강·산), 시간대
// ---------------------------------------------------------------------------
const TOD = {
  morning: { name: '아침', az: 108, el: 16, sun: 0xffd2a6, sunI: 3.4, hemiSky: 0xc4d6ee, hemiGround: 0x8a7a66, hemiI: 0.75, bounce: 0xf0dcc4, bounceI: 0.55, top: '#5f8fcf', hor: '#f4d8bc', env: 0.55, night: 0, exposure: 1.1 },
  day: { name: '낮', az: 172, el: 50, sun: 0xfff6ea, sunI: 3.8, hemiSky: 0xcfe2ff, hemiGround: 0x9a8a74, hemiI: 0.95, bounce: 0xf4e6d4, bounceI: 0.7, top: '#3c76c6', hor: '#cfe1f1', env: 0.65, night: 0, exposure: 1.12 },
  sunset: { name: '노을', az: 252, el: 6, sun: 0xff9050, sunI: 3.0, hemiSky: 0xd9a587, hemiGround: 0x6a5040, hemiI: 0.55, bounce: 0xf0c2a0, bounceI: 0.45, top: '#38467a', hor: '#ff9a62', env: 0.45, night: 0.2, exposure: 1.1 },
  night: { name: '밤', az: 200, el: 38, sun: 0x8aa2d6, sunI: 0.3, hemiSky: 0x2a3a5c, hemiGround: 0x15120f, hemiI: 0.12, bounce: 0x40342a, bounceI: 0.15, top: '#04060d', hor: '#1a2236', env: 0.14, night: 1, exposure: 1.1 },
};
const TOD_KEYS = ['morning', 'day', 'sunset', 'night'];
const GROUND_Y = -72; // 24층

const R = {
  init() {
    if (HOST) return this.initHost();
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    r.setSize(innerWidth, innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.xr.enabled = true; r.xr.setReferenceSpaceType('local-floor');
    $('app').appendChild(r.domElement);
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.04, 6000);
    this.rig = new THREE.Group(); this.rig.add(this.camera); this.scene.add(this.rig);
    const pm = new THREE.PMREMGenerator(r);
    this.envTex = pm.fromScene(new RoomEnvironment(r), 0.04).texture;
    this.scene.environment = this.envTex;
    // 집 전체를 담는 그룹 (혼자 열면 원점, 바깥 앱 안에서는 그 앱이 정한 자리)
    this.root = new THREE.Group(); this.scene.add(this.root);
    // 빛
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03; this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x887766, 1);
    this.scene.add(this.hemi);
    // 실내 반사광 흉내: 바닥에서 튄 빛이 천장과 벽을 밝힌다 (아래에서 위로 비추는 약한 빛)
    this.bounce = new THREE.HemisphereLight(0x000000, 0xffffff, 0.6);
    this.scene.add(this.bounce);
    this.scene.fog = new THREE.Fog(0xcfe1f1, 700, 5200);
    this.buildSky();
    this.buildCity();
    addEventListener('resize', () => this.resize());
  },
  // 바깥 앱 안: 렌더러·장면·카메라를 빌려 쓰고, 하늘·도시·해는 바깥 앱 것을 쓴다
  initHost() {
    this.renderer = HOST.renderer; this.scene = HOST.scene; this.camera = HOST.camera; this.rig = HOST.rig;
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.envTex = pm.fromScene(new RoomEnvironment(this.renderer), 0.04).texture; pm.dispose();
    this.root = new THREE.Group(); this.root.position.copy(HOST.origin()); this.scene.add(this.root);
    this.bounce = new THREE.HemisphereLight(0x000000, 0xffffff, 0.6); this.root.add(this.bounce);
    this.night = 0;
  },
  // 월드 좌표 → 집 좌표 (그룹은 옮기기만 하고 돌리지 않는다)
  local(v) { return v.clone().sub(this.root.position); },
  // 집 안 조명(점광원, 반사광)을 장면에서 빼거나 넣는다. 바깥 앱의 도시를 그릴 때 부담이 되지 않게
  setLights(on) { this.root.traverse((o) => { if (o.isLight) o.visible = on; }); },
  // 바깥 앱의 시각을 따라 실내 반사와 반사광을 맞춘다
  syncHostTime() {
    const n = HOST.night(); this.night = n; G.tod = HOST.timeKey();
    Mats.setEnv(lerp(0.65, 0.14, n));
    this.bounce.groundColor.set(0xf4e6d4).lerp(new THREE.Color(0x40342a), n); this.bounce.intensity = lerp(0.7, 0.15, n);
  },
  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); },

  // ---------------- 하늘: 위·지평선 색, 해 번짐, 밤의 별
  buildSky() {
    this.skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top, hor, sunCol, sunDir; uniform float night; varying vec3 vDir;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
        void main(){
          float y = clamp(vDir.y, -0.2, 1.0);
          vec3 c = mix(hor, top, pow(max(y, 0.0), 0.55));
          c = mix(c, hor * 0.7, smoothstep(0.0, -0.2, y));
          float s = max(dot(vDir, sunDir), 0.0);
          c += sunCol * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.35 + pow(s, 3.0) * 0.12) * (1.0 - night * 0.7);
          if (night > 0.5 && y > 0.05) { vec3 q = floor(vDir * 420.0); float st = step(0.9975, h(q)); c += vec3(st) * (0.6 + 0.4 * h(q + 3.0)) * night * smoothstep(0.05, 0.3, y); }
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(4800, 32, 16), m);
    this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  },

  // ---------------- 창밖: 아파트 단지, 강, 다리, 산
  buildCity() {
    const g = new THREE.Group(); this.city = g;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshStandardMaterial({ color: 0x4f5a47, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND_Y; g.add(ground);
    // 남쪽 600m 앞을 흐르는 강
    this.riverMat = new THREE.MeshStandardMaterial({ color: 0x395a72, roughness: 0.08, metalness: 0.6 });
    const river = new THREE.Mesh(new THREE.PlaneGeometry(12000, 520), this.riverMat);
    river.rotation.x = -Math.PI / 2; river.position.set(0, GROUND_Y + 0.5, 900); g.add(river);
    // 강변 공원
    const park = new THREE.Mesh(new THREE.PlaneGeometry(12000, 60), new THREE.MeshStandardMaterial({ color: 0x55703f, roughness: 1 }));
    park.rotation.x = -Math.PI / 2; park.position.set(0, GROUND_Y + 0.3, 610); g.add(park);
    // 도로
    const road = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.9 });
    for (const z of [-260, 120, 560]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(12000, 22), road); m.rotation.x = -Math.PI / 2; m.position.set(0, GROUND_Y + 0.4, z); g.add(m); }
    for (const x of [-420, 180, 760]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(18, 1200), road); m.rotation.x = -Math.PI / 2; m.position.set(x, GROUND_Y + 0.42, 0); g.add(m); }
    // 다리
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(26, 3, 560), new THREE.MeshStandardMaterial({ color: 0x8c8f93, roughness: 0.7 }));
    bridge.position.set(180, GROUND_Y + 14, 900); g.add(bridge);
    for (let z = 660; z <= 1140; z += 80) { const p = new THREE.Mesh(new THREE.BoxGeometry(6, 14, 6), bridge.material); p.position.set(180, GROUND_Y + 7, z); g.add(p); }
    // 아파트 동: 판상형 덩어리 (인스턴스)
    const fac = Tex.facade();
    const mapT = Tex.tex(fac.map); mapT.repeat.set(3, 3);
    const emT = Tex.tex(fac.emissive); emT.repeat.set(3, 3);
    this.towerMat = new THREE.MeshStandardMaterial({ map: mapT, emissiveMap: emT, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.8 });
    const r = mulberry32(2024), list = [];
    const ok = (x, z, w, d) => !(Math.abs(x) < 130 && Math.abs(z) < 110) && !(z > 560 && z < 1180) && Math.abs(x - 180) > 30;
    // 단지들 (행렬 배치) + 흩어진 동
    for (let cx = -1600; cx <= 1600; cx += 230) for (let cz = -1500; cz <= 2200; cz += 210) {
      if (r() < 0.25) continue;
      const rot = (r() < 0.75 ? 0 : 0.35) + (r() - 0.5) * 0.08, n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const w = 32 + r() * 22, d = 12 + r() * 4, hgt = 45 + r() * 70 + (Math.hypot(cx, cz) > 900 ? r() * 40 : 0);
        const x = cx + (k % 2) * 70 - 35 + (r() - 0.5) * 20, z = cz + Math.floor(k / 2) * 80 - 40 + (r() - 0.5) * 20;
        if (!ok(x, z, w, d)) continue;
        list.push({ x, z, w, d, h: hgt, rot });
      }
    }
    // 우리 동 옆 이웃 동 (가깝게)
    list.push({ x: -150, z: 20, w: 40, d: 13, h: 80, rot: 0 }, { x: 160, z: -30, w: 40, d: 13, h: 76, rot: 0 }, { x: 10, z: -230, w: 70, d: 13, h: 84, rot: 0 });
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.towerMat, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    list.forEach((b, i) => { q.setFromAxisAngle(up, b.rot); m4.compose(new THREE.Vector3(b.x, GROUND_Y + b.h / 2, b.z), q, new THREE.Vector3(b.w, b.h, b.d)); im.setMatrixAt(i, m4); });
    g.add(im);
    // 옥상 구조물
    const roofs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xbfb9ae, roughness: 0.9 }), list.length);
    list.forEach((b, i) => { q.setFromAxisAngle(up, b.rot); m4.compose(new THREE.Vector3(b.x, GROUND_Y + b.h + 2.5, b.z), q, new THREE.Vector3(b.w * 0.25, 5, b.d * 0.6)); roofs.setMatrixAt(i, m4); });
    g.add(roofs);
    // 단지 사이 나무
    const treeGeo = new THREE.IcosahedronGeometry(1, 0); treeGeo.scale(1, 1.25, 1);
    const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ color: 0x4d6b3c, roughness: 1, flatShading: true }), 900);
    let tn = 0;
    for (let i = 0; i < 4000 && tn < 900; i++) {
      const x = (r() - 0.5) * 3400, z = -1400 + r() * 2000, sc = 4 + r() * 4;
      if ((z > 540 && z < 1200) || (Math.abs(x) < 70 && Math.abs(z) < 60)) continue;
      if (list.some((b) => Math.abs(b.x - x) < b.w / 2 + sc && Math.abs(b.z - z) < b.d / 2 + sc)) continue;
      m4.compose(new THREE.Vector3(x, GROUND_Y + sc * 1.1, z), q.identity(), new THREE.Vector3(sc, sc, sc)); trees.setMatrixAt(tn++, m4);
    }
    trees.count = tn; g.add(trees);
    // 강 건너 유리 빌딩
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x6f8fa8, roughness: 0.15, metalness: 0.8, emissive: 0x8fb4ff, emissiveIntensity: 0 });
    this.glassTowerMat = glassMat;
    for (let i = 0; i < 14; i++) { const w = 30 + r() * 30, hgt = 120 + r() * 160; const t = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, w * (0.7 + r() * 0.5)), glassMat); t.position.set(-1300 + i * 190 + r() * 60, GROUND_Y + hgt / 2, 1400 + r() * 500); g.add(t); }
    // 먼 산 (능선)
    const mtn = new THREE.MeshStandardMaterial({ color: 0x5f7360, roughness: 1, flatShading: true });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + r() * 0.1, dist = 3000 + r() * 900, h = 260 + r() * 420;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(500 + r() * 400, h, 7, 1), mtn);
      cone.position.set(Math.sin(a) * dist, GROUND_Y + h / 2 - 20, -Math.cos(a) * dist); cone.rotation.y = r() * 3; g.add(cone);
    }
    // 우리 집 바닥판과 바깥 벽 (인형집 뷰에서 보이는 건물 덩어리)
    const slab = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.35, 9.6), new THREE.MeshStandardMaterial({ color: 0xbab4aa, roughness: 0.9 }));
    slab.position.set(0, -0.2, 0); g.add(slab);
    const slab2 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 1.6), slab.material); slab2.position.set(-1.5, -0.2, -5.15); g.add(slab2);
    // 우리 동의 아래층들 (인형집 뷰와 창밖 아래를 내려다볼 때 보인다)
    const ownMap = Tex.tex(fac.map); ownMap.repeat.set(2, 3); const ownEm = Tex.tex(fac.emissive); ownEm.repeat.set(2, 3);
    this.ownMat = new THREE.MeshStandardMaterial({ map: ownMap, emissiveMap: ownEm, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(13.2, -GROUND_Y - 0.4, 10.2), this.ownMat); body.position.set(0, GROUND_Y / 2 - 0.2, -0.2); g.add(body);
    // 바깥 재질도 시간대에 맞춰 주변 반사를 줄인다 (밤에 밝게 뜨지 않게)
    this.cityMats = [];
    g.traverse((o) => { if (o.material && o.material.isMeshStandardMaterial && !this.cityMats.includes(o.material)) this.cityMats.push(o.material); });
    this.scene.add(g);
  },

  // ---------------- 시간대 적용
  setTime(key) {
    if (HOST) { HOST.setTime(key); this.syncHostTime(); return; }
    const t = TOD[key]; G.tod = key;
    const dir = new THREE.Vector3(Math.sin(t.az * DEG) * Math.cos(t.el * DEG), Math.sin(t.el * DEG), -Math.cos(t.az * DEG) * Math.cos(t.el * DEG));
    this.sunDir = dir;
    this.sun.position.copy(dir).multiplyScalar(40).add(new THREE.Vector3(0, 1, 0));
    this.sun.target.position.set(0, 1, 0);
    this.sun.color.setHex(t.sun); this.sun.intensity = t.sunI;
    this.hemi.color.setHex(t.hemiSky); this.hemi.groundColor.setHex(t.hemiGround); this.hemi.intensity = t.hemiI;
    this.bounce.groundColor.setHex(t.bounce); this.bounce.intensity = t.bounceI;
    this.skyU.top.value.set(t.top); this.skyU.hor.value.set(t.hor); this.skyU.sunDir.value.copy(dir); this.skyU.sunCol.value.setHex(t.sun); this.skyU.night.value = t.night;
    this.scene.fog.color.set(t.hor).multiplyScalar(t.night > 0.5 ? 0.6 : 0.95);
    this.towerMat.emissiveIntensity = t.night > 0.5 ? 1.4 : t.night > 0.1 ? 0.35 : 0;
    this.ownMat.emissiveIntensity = this.towerMat.emissiveIntensity;
    this.glassTowerMat.emissiveIntensity = t.night > 0.5 ? 0.25 : 0;
    this.riverMat.color.set(t.night > 0.5 ? 0x101826 : 0x395a72);
    this.renderer.toneMappingExposure = t.exposure;
    Mats.setEnv(t.env);
    for (const m of this.cityMats) m.envMapIntensity = t.env * 0.8;
    this.night = t.night;
    if (typeof Interior !== 'undefined') Interior.onTime();
  },
};
