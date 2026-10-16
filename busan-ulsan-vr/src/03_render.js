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
        void main(){
          vec3 d = normalize(vD); float h = d.y;
          vec3 col = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.45));
          if (h < 0.0) col = horizon * 0.9;
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
  init() {
    // 건물 벽: 층마다 창문 줄이 있는 텍스처. UV는 (가로 m/8, 세로 m/3.2) → 한 칸이 창 2개 × 1층
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#d8d8d4'; g.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 2; i++) { g.fillStyle = '#2a3440'; g.fillRect(8 + i * 64, 14, 48, 34); g.fillStyle = 'rgba(160,190,220,0.35)'; g.fillRect(8 + i * 64, 14, 48, 12); }
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 60, 128, 4);
    this.windowTex = new THREE.CanvasTexture(c); this.windowTex.wrapS = this.windowTex.wrapT = THREE.RepeatWrapping; this.windowTex.colorSpace = THREE.SRGBColorSpace; this.windowTex.anisotropy = 4;
    // 밤 창문 불빛 마스크
    const e = document.createElement('canvas'); e.width = 128; e.height = 64;
    const ge = e.getContext('2d'); ge.fillStyle = '#000'; ge.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 2; i++) { ge.fillStyle = '#ffd9a0'; ge.fillRect(8 + i * 64, 14, 48, 34); }
    this.lightTex = new THREE.CanvasTexture(e); this.lightTex.wrapS = this.lightTex.wrapT = THREE.RepeatWrapping; this.lightTex.colorSpace = THREE.SRGBColorSpace;
    this.wall = new THREE.MeshStandardMaterial({ vertexColors: true, map: this.windowTex, emissiveMap: this.lightTex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85, metalness: 0.05 });
    // 밤에는 건물마다 불 켜진 창의 비율이 다르도록 (정점 색 알파 대신 UV.y 해시)
    this.wall.onBeforeCompile = (sh) => {
      sh.uniforms.night = R.nightU;
      sh.fragmentShader = 'uniform float night;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `
        #ifdef USE_EMISSIVEMAP
          vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
          vec2 cell = floor(vEmissiveMapUv * vec2(2.0, 1.0));
          float rnd = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          float on = step(0.62, rnd) * (0.55 + 0.45 * fract(rnd * 7.31));
          totalEmissiveRadiance = emissiveColor.rgb * on * night * 0.9;
        #endif`);
    };
    this.wall.customProgramCacheKey = () => 'wall-v1';
    this.roof = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    // 도로
    const rc = document.createElement('canvas'); rc.width = 64; rc.height = 256;
    const gr = rc.getContext('2d');
    gr.fillStyle = '#3a3c40'; gr.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 900; i++) { gr.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},255,${Math.random() * 0.05})`; gr.fillRect(Math.random() * 64, Math.random() * 256, 2, 2); }
    gr.fillStyle = '#e8e8e0'; gr.fillRect(1, 0, 2, 256); gr.fillRect(61, 0, 2, 256);
    gr.fillStyle = '#f0c040'; gr.fillRect(30, 0, 4, 256);
    this.roadTex = new THREE.CanvasTexture(rc); this.roadTex.wrapS = this.roadTex.wrapT = THREE.RepeatWrapping; this.roadTex.colorSpace = THREE.SRGBColorSpace; this.roadTex.anisotropy = 8;
    this.road = new THREE.MeshStandardMaterial({ map: this.roadTex, roughness: 0.95, });
    this.path = new THREE.MeshStandardMaterial({ color: 0xb8ae9c, roughness: 1, });
    this.rail = new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 1, });
    this.bridge = new THREE.MeshStandardMaterial({ color: 0x9a9ea4, roughness: 0.8 });
    this.tree = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
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
