// ---------------------------------------------------------------------------
// 렌더러, 하늘과 시간대, 바다, 공용 재질(건물 창문), 글자 스프라이트
// ---------------------------------------------------------------------------
const R = {
  renderer: null, scene: null, camera: null, rig: null, sun: null, hemi: null, sky: null, sea: null,
  timeU: { value: 0 }, nightU: { value: 0 }, quality: 'high',
  world: null, // 지도 객체를 담는 그룹

  init() {
    const canvas = $('view');
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
    } catch (e) {
      $('loadtext').textContent = 'WebGL을 쓸 수 없습니다. 하드웨어 가속이 켜진 최신 브라우저에서 열어 주세요.';
      throw e;
    }
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.3, 60000);
    this.rig = new THREE.Group(); this.rig.add(this.camera); this.scene.add(this.rig);
    this.world = new THREE.Group(); this.scene.add(this.world);
    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x5a5a48, 1.0); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.4); this.scene.add(this.sun); this.scene.add(this.sun.target);
    const sc = this.sun.shadow.camera; sc.left = -170; sc.right = 170; sc.top = 170; sc.bottom = -170; sc.near = 50; sc.far = 2600;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.6;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.buildSky();
    this.buildSea();
    this.applyQuality();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  },
  detectQuality() { return /Android|iPhone|iPad|Quest|Mobile/i.test(navigator.userAgent) || G.touch ? 'low' : 'high'; },
  applyQuality() {
    const q = G.settings.quality === 'auto' ? this.detectQuality() : G.settings.quality;
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'high' ? 1.75 : q === 'medium' ? 1.4 : 1));
    const shadows = q !== 'low';
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    }
    this.sun.castShadow = shadows;
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
  },
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  },

  buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: this.nightU, time: this.timeU },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform vec3 top, horizon, sunDir, sunCol; uniform float night, time; varying vec3 vD;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f); return mix(mix(h2(i), h2(i+vec2(1,0)), u.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), u.x), u.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p *= 2.05; a *= 0.5; } return s; }
        void main(){
          vec3 d = normalize(vD); float h = d.y;
          vec3 col = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.45));
          if (h < 0.0) col = horizon * 0.9;
          // clouds
          if (h > 0.01) {
            vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(time * 0.004, time * 0.002);
            float c = smoothstep(0.52, 0.82, fbm(uv));
            vec3 cc = mix(vec3(1.0, 0.98, 0.95), horizon * 1.1, 0.35) * (1.0 - night * 0.85);
            col = mix(col, cc, c * 0.85 * smoothstep(0.01, 0.12, h));
          }
          float sd = max(dot(d, normalize(sunDir)), 0.0);
          col += sunCol * (pow(sd, 1200.0) * 8.0 + pow(sd, 12.0) * 0.35) * (1.0 - night * 0.8);
          if (night > 0.3 && h > 0.05) { vec3 cell = floor(d * 400.0); float s = step(0.9975, hash(cell)); col += vec3(s) * (night - 0.3) * 1.2; }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(50000, 32, 16), mat);
    this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  },

  // 해수면(0 m). 플레이어를 따라다니는 큰 판.
  buildSea() {
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { deep: { value: new THREE.Color(0x0d3a55) }, shallow: { value: new THREE.Color(0x2b7a9a) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sky: { value: new THREE.Color(0xa8d0ec) } }]);
    uniforms.time = this.timeU; uniforms.night = this.nightU;
    const mat = new THREE.ShaderMaterial({
      uniforms, fog: true, transparent: true, depthWrite: false,
      vertexShader: `varying vec3 vW;
        #include <common>
        #include <fog_pars_vertex>
        #include <logdepthbuf_pars_vertex>
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform vec3 deep, shallow, sunDir, sky; uniform float time, night; varying vec3 vW;
        #include <common>
        #include <fog_pars_fragment>
        #include <logdepthbuf_pars_fragment>
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
        void main(){
          #include <logdepthbuf_fragment>
          vec2 p = vW.xz;
          float n = noise(p * 0.08 + time * 0.25) * 0.5 + noise(p * 0.21 - time * 0.4) * 0.3 + noise(p * 0.6 + time * 0.7) * 0.2;
          vec3 nrm = normalize(vec3((n - 0.5) * 0.6, 1.0, (noise(p * 0.11 + 5.0 + time * 0.3) - 0.5) * 0.6));
          vec3 v = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(dot(nrm, v), 0.0), 3.0);
          vec3 col = mix(deep, shallow, n * 0.6);
          col = mix(col, sky, clamp(fres * 0.8, 0.0, 0.85));
          vec3 hv = normalize(normalize(sunDir) + v);
          col += vec3(1.0, 0.95, 0.85) * pow(max(dot(nrm, hv), 0.0), 180.0) * 2.0 * (1.0 - night);
          gl_FragColor = vec4(col, 0.93);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(120000, 120000, 1, 1), mat);
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.y = 0.05;
    this.sea.renderOrder = 1;
    this.scene.add(this.sea);
  },

  // 시간대: 0~24시. 'auto'면 실제 한국 시간.
  hourNow() {
    if (G.settings.hour !== 'auto') return G.settings.hour;
    const d = new Date(); const utc = d.getUTCHours() + d.getUTCMinutes() / 60;
    return (utc + 9) % 24;
  },
  updateTime() {
    const h = this.hourNow();
    // 태양: 6시 동쪽에서 떠서 18시 서쪽으로 진다(대략)
    const t = (h - 6) / 12; // 0..1 낮
    const el = Math.sin(t * Math.PI) * 62 * DEG;
    const az = Math.PI * (0.5 + t); // 동(0.5π) → 남 → 서
    const sd = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();
    if (t < 0 || t > 1) sd.set(0.3, -0.4, 0.2).normalize();
    this.sunDir = sd;
    const day = clamp(Math.sin(clamp(t, 0, 1) * Math.PI) * 2.2, 0, 1);
    const dusk = clamp(1 - Math.abs(t - 0.0) * 6, 0, 1) + clamp(1 - Math.abs(t - 1.0) * 6, 0, 1);
    const night = 1 - day;
    this.nightU.value = clamp(night * 1.15 - 0.1, 0, 1);
    const top = new THREE.Color(0x2f72c4).lerp(new THREE.Color(0x05080f), night);
    const hor = new THREE.Color(0xbfdcf2).lerp(new THREE.Color(0xff9a5a), clamp(dusk, 0, 1) * 0.8).lerp(new THREE.Color(0x0c1420), night * 0.95);
    const u = this.sky.material.uniforms;
    u.top.value.copy(top); u.horizon.value.copy(hor); u.sunDir.value.copy(sd);
    u.sunCol.value.set(0xfff0d8).lerp(new THREE.Color(0xff8a40), clamp(dusk, 0, 1));
    this.sun.color.copy(u.sunCol.value);
    this.sun.intensity = 2.6 * day + 0.05;
    this.hemi.intensity = 0.25 + 0.85 * day;
    this.hemi.color.set(0xdfefff).lerp(new THREE.Color(0x6a7a9a), night);
    this.scene.fog = this.scene.fog || new THREE.FogExp2(0xbfdcf2, 0.00012);
    this.scene.fog.color.copy(hor);
    this.scene.background = hor.clone();
    const su = this.sea.material.uniforms;
    su.sunDir.value.copy(sd); su.sky.value.copy(hor).lerp(top, 0.3);
    su.deep.value.set(0x0d3a55).lerp(new THREE.Color(0x02080e), night * 0.9);
    su.shallow.value.set(0x2b7a9a).lerp(new THREE.Color(0x061620), night * 0.9);
    this.renderer.toneMappingExposure = 1.0 + night * 0.3;
  },
  setFogForAltitude(alt) {
    if (!this.scene.fog) return;
    if (G.inTunnel) { this.scene.fog.density = 0.02; this.scene.fog.color.set(0x060606); return; }
    // 높이 올라갈수록 시야를 넓힌다
    this.scene.fog.density = lerp(0.00022, 0.000035, smoothstep(10, 1500, alt));
  },
  follow(pos) {
    this.sky.position.copy(pos);
    this.sea.position.x = pos.x; this.sea.position.z = pos.z;
    if (this.sunDir) { this.sun.position.set(pos.x + this.sunDir.x * 1000, pos.y + this.sunDir.y * 1000, pos.z + this.sunDir.z * 1000); this.sun.target.position.copy(pos); }
  },
};

// ---------------------------------------------------------------------------
// 공용 재질과 텍스처
// ---------------------------------------------------------------------------
const Mats = {
  signMats: [], lampMats: [],
  init() {
    const A = Atlas.build();
    this.facadeTex = A.tex; this.facadeLit = A.lit;
    this.facadeTex.wrapS = this.facadeTex.wrapT = THREE.ClampToEdgeWrapping;
    // 건물 벽: 정점 속성 style의 정수부로 아틀라스 칸을, 소수부(건물 씨앗)로 밤 창문 무늬를 고른다.
    // 셰이더(GLSL) 안에는 한글 주석을 넣지 않는다(일부 드라이버가 ASCII 밖 문자를 거부).
    // - atlas: 아틀라스 칸 안 좌표. 아래 emissivemap에서도 같은 변수를 쓴다(벽 재질은 map이 늘 있다)
    // - 사무실은 창 4칸씩 묶어 켜고, 멀어서 창이 한 픽셀보다 작아지면 평균 밝기로 바꿔 반짝임을 막는다
    // - 상가 1층(style 5)은 늘 켠다
    this.wall = new THREE.MeshStandardMaterial({ vertexColors: true, map: this.facadeTex, emissiveMap: this.facadeLit, emissive: 0xffffff, roughness: 0.82, metalness: 0.05 });
    this.wall.onBeforeCompile = (sh) => {
      sh.uniforms.night = R.nightU;
      sh.vertexShader = 'attribute float style;\nvarying float vStyle;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvStyle = style;');
      const atlas = `
        float sid = floor(vStyle + 0.002), bseed = fract(vStyle + 0.002) * 250.0;
        vec2 cellXY = vec2(mod(sid, 4.0), floor(sid / 4.0 + 0.001));
        vec2 fr = fract(vMapUv);
        vec2 auv = vec2((cellXY.x + 0.01 + fr.x * 0.98) / 4.0, 1.0 - (cellXY.y + 0.01 + (1.0 - fr.y) * 0.98) / 4.0);
        vec2 gx = dFdx(vMapUv) * 0.245, gy = dFdy(vMapUv) * 0.245;`;
      sh.fragmentShader = 'uniform float night;\nvarying float vStyle;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `#ifdef USE_MAP
          ${atlas}
          vec4 sampledDiffuseColor = textureGrad( map, auv, gx, gy );
          diffuseColor *= sampledDiffuseColor;
        #endif`)
        .replace('#include <emissivemap_fragment>', `#ifdef USE_EMISSIVEMAP
          vec4 emissiveColor = textureGrad( emissiveMap, auv, gx, gy );
          vec2 cell = floor(vMapUv);
          bool office = (sid > 2.5 && sid < 4.5) || sid > 14.5;
          vec2 key = (office ? vec2(floor(cell.x / 4.0), cell.y) : cell) + bseed;
          float rnd = fract(sin(dot(key + sid * 17.0, vec2(12.9898, 78.233))) * 43758.5453);
          float rnd2 = fract(sin(dot(cell + bseed, vec2(39.3468, 11.135))) * 24634.6345);
          float on = step(office ? 0.6 : 0.55, rnd) * (0.55 + 0.45 * rnd2) * (office ? 0.75 : 1.0);
          vec2 dc = fwidth(vMapUv);
          on = mix(on, office ? 0.22 : 0.34, smoothstep(0.3, 1.1, max(dc.x, dc.y)));
          if (sid > 4.5 && sid < 5.5) on = 0.8;
          totalEmissiveRadiance = emissiveColor.rgb * on * night * 0.75;
        #endif`);
    };
    this.wall.customProgramCacheKey = () => 'wall-atlas-v5';
    this.roof = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    this.solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 });
    // 도로: 아스팔트와 차선
    const road = (lanes) => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = '#3c3e42'; g.fillRect(0, 0, 128, 256);
      for (let i = 0; i < 2500; i++) { const v = Math.random() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.06})`; g.fillRect(Math.random() * 128, Math.random() * 256, 2, 2); }
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(Math.random() * 128, Math.random() * 256, 30, 6); }
      g.fillStyle = '#e8e8e0'; g.fillRect(3, 0, 3, 256); g.fillRect(122, 0, 3, 256);
      if (lanes) {
        g.fillStyle = '#f0c040'; g.fillRect(60, 0, 3, 256); g.fillRect(65, 0, 3, 256);
        g.fillStyle = '#e8e8e0'; for (const x of [32, 95]) for (let y = 0; y < 256; y += 64) g.fillRect(x, y, 3, 32);
      }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      return t;
    };
    this.road = new THREE.MeshStandardMaterial({ map: road(true), roughness: 0.95 });
    this.road2 = new THREE.MeshStandardMaterial({ map: road(false), roughness: 0.95 });
    // 보도블록
    const sc = document.createElement('canvas'); sc.width = sc.height = 128;
    const sg = sc.getContext('2d');
    // 보도블록: 회색 바탕에 붉은 블록이 드문드문 (한 장 = 보도 폭 2.6m)
    sg.fillStyle = '#6e6c68'; sg.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) { const r = Math.random(), v = 150 + Math.random() * 18; sg.fillStyle = r < 0.07 ? '#94625a' : `rgb(${v},${v - 2},${v - 6})`; sg.fillRect(x * 16 + 1, y * 8 + 1, 14, 6); }
    const st = new THREE.CanvasTexture(sc); st.wrapS = st.wrapT = THREE.RepeatWrapping; st.colorSpace = THREE.SRGBColorSpace;
    this.sidewalk = new THREE.MeshStandardMaterial({ map: st, roughness: 0.95 });
    this.curb = new THREE.MeshStandardMaterial({ color: 0xb8b4ac, roughness: 0.9 });
    this.path = new THREE.MeshStandardMaterial({ color: 0xb8ae9c, roughness: 1 });
    this.rail = new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 1 });
    this.bridge = new THREE.MeshStandardMaterial({ color: 0x9a9ea4, roughness: 0.8 });
    this.white = new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.8 });
    this.metal = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.5, metalness: 0.6 });
    this.lamp = new THREE.MeshStandardMaterial({ color: 0xf4f0e0, emissive: 0xffd8a0, emissiveIntensity: 0 });
    this.redLight = new THREE.MeshStandardMaterial({ color: 0x601010, emissive: 0xff2020, emissiveIntensity: 0.4 });
    this.cross = new THREE.MeshStandardMaterial({ color: 0x802020, emissive: 0xff1a1a, emissiveIntensity: 0 });
    this.lampMats.push(this.lamp);
  },
  // 밤낮에 따라 빛나는 재질 갱신
  updateNight(n) {
    this.lamp.emissiveIntensity = n > 0.15 ? 2.2 * n : 0;
    this.cross.emissiveIntensity = n > 0.15 ? 2.5 * n : 0;
    for (const m of this.signMats) m.emissiveIntensity = 0.12 + 1.1 * n;
    for (const m of this.lampMats) if (m !== this.lamp) m.emissiveIntensity = n > 0.15 ? 1.4 * n : 0;
  },
};

// 글자 스프라이트 (명소 이름표 등)
const Label = {
  make(text, color = '#ffffff', sub = '', bg = 'rgba(6,16,26,0.78)') {
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    const f1 = '700 44px "Gothic A1", system-ui, sans-serif', f2 = '500 28px "Gothic A1", system-ui, sans-serif';
    g.font = f1; const w1 = g.measureText(text).width;
    g.font = f2; const w2 = sub ? g.measureText(sub).width : 0;
    const W = Math.ceil(Math.max(w1, w2) + 48), H = sub ? 112 : 72;
    c.width = W; c.height = H + 18;
    g.fillStyle = bg;
    const r = 18; g.beginPath(); g.moveTo(r, 0); g.lineTo(W - r, 0); g.quadraticCurveTo(W, 0, W, r); g.lineTo(W, H - r); g.quadraticCurveTo(W, H, W - r, H); g.lineTo(W / 2 + 12, H); g.lineTo(W / 2, H + 16); g.lineTo(W / 2 - 12, H); g.lineTo(r, H); g.quadraticCurveTo(0, H, 0, H - r); g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0); g.fill();
    g.fillStyle = color; g.fillRect(0, 0, 8, H);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = f1; g.fillStyle = '#ffffff'; g.fillText(text, W / 2 + 4, sub ? 38 : H / 2 + 2);
    if (sub) { g.font = f2; g.fillStyle = '#a8bccc'; g.fillText(sub, W / 2 + 4, 82); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true, sizeAttenuation: false }));
    sp.center.set(0.5, 0);
    sp.userData.aspect = c.width / c.height;
    sp.renderOrder = 30;
    return sp;
  },
  // 화면 높이 대비 크기로 표시 (sizeAttenuation false)
  size(sp, h) { sp.scale.set(h * sp.userData.aspect, h, 1); },
};
