// ---------------------------------------------------------------------------
// 렌더러, 카메라, 하늘, 효과(파편, 불꽃, 검기 잔상, 피해 숫자)
// ---------------------------------------------------------------------------
const R = {
  renderer: null, scene: null, camera: null, rig: null, sun: null, hemi: null,
  sky: null, ceiling: null, timeU: { value: 0 }, envRT: null,
  quality: 'high',

  init() {
    const canvas = $('view');
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      $('loadtext').textContent = 'WebGL을 사용할 수 없습니다. 하드웨어 가속을 켠 최신 브라우저에서 열어 주세요.';
      throw e;
    }
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 1400);
    this.rig = new THREE.Group();
    this.rig.add(this.camera);
    this.scene.add(this.rig);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 260;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    // 플레이어 주변을 은은하게 밝히는 등불 (미궁에서 사용)
    this.lantern = new THREE.PointLight(0xffc890, 0, 16, 1.6);
    this.camera.add(this.lantern);

    this.buildSky();
    this.buildCeiling();
    FX.init(this.scene);
    this.applyQuality();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  },

  detectQuality() {
    const mobile = /Android|iPhone|iPad|Quest|Mobile/i.test(navigator.userAgent);
    return mobile || G.touch ? 'low' : 'high';
  },
  applyQuality() {
    const q = G.settings.quality === 'auto' ? this.detectQuality() : G.settings.quality;
    this.quality = q;
    const pr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1);
    this.renderer.setPixelRatio(pr);
    const size = q === 'high' ? 2048 : q === 'medium' ? 1536 : 1024;
    const shadows = q !== 'low';
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    }
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
  },
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  },

  buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
        cloud: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() },
        time: this.timeU,
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top, horizon, bottom, cloud, sunDir, sunColor; uniform float time; varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
        float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h,0.0,1.0), 0.5)) : mix(horizon, bottom, pow(clamp(-h,0.0,1.0), 0.35));
          float sd = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * (pow(sd, 900.0) * 6.0 + pow(sd, 10.0) * 0.22);
          // 발아래 구름 바다
          if (h < 0.06) {
            vec2 uv = d.xz / (abs(d.y) + 0.05) * 0.35 + vec2(time * 0.006, time * 0.003);
            float c = fbm(uv);
            float m = smoothstep(0.42, 0.75, c) * smoothstep(0.06, -0.12, h);
            col = mix(col, cloud * (0.75 + 0.35 * c), m * 0.92);
          }
          // 높은 구름
          if (h > 0.0) {
            vec2 uv = d.xz / (d.y + 0.25) * 1.2 + vec2(time * 0.01, 0.0);
            float c = fbm(uv * 1.3);
            col = mix(col, cloud, smoothstep(0.55, 0.85, c) * 0.45 * smoothstep(0.0, 0.2, h));
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), mat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  },

  // 위층의 바닥(부유성의 천장). 가장자리로 갈수록 투명해져 하늘이 보인다.
  buildCeiling() {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      uniforms: { rock: { value: new THREE.Color(0x2a2a32) }, tint: { value: new THREE.Color(0x88aacc) }, vein: { value: new THREE.Color(0x88ddff) }, time: this.timeU },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 rock, tint, vein; uniform float time; varying vec2 vP;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
        float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.1; a*=0.5; } return s; }
        void main(){
          float r = length(vP);
          float n = fbm(vP * 0.008);
          float n2 = fbm(vP * 0.03 + 7.0);
          float v = 1.0 - smoothstep(0.0, 0.012, abs(fbm(vP * 0.015 + 3.0) - 0.5));
          vec3 col = mix(rock * (0.55 + n2 * 0.5), tint, 0.55 + n * 0.25);
          col += vein * v * 0.18 * (0.7 + 0.3 * sin(time * 0.6 + r * 0.02));
          float a = (1.0 - smoothstep(260.0, 520.0, r)) * 0.85;
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.ceiling = new THREE.Mesh(new THREE.CircleGeometry(600, 64), mat);
    this.ceiling.rotation.x = Math.PI / 2;
    this.ceiling.position.y = 320;
    this.ceiling.renderOrder = -9;
    this.scene.add(this.ceiling);
  },

  applyTheme(T, indoor) {
    const s = this.sky.material.uniforms;
    s.top.value.setHex(T.sky.top); s.horizon.value.setHex(T.sky.horizon); s.bottom.value.setHex(T.sky.bottom); s.cloud.value.setHex(T.sky.cloud);
    const el = T.sun.elev, az = T.sun.az;
    this.sunDir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
    s.sunDir.value.copy(this.sunDir);
    s.sunColor.value.setHex(T.sun.color);
    const c = this.ceiling.material.uniforms;
    c.tint.value.setHex(T.sky.top).lerp(new THREE.Color(T.fog.color), 0.4);
    c.vein.value.setHex(T.dungeon.torch);
    this.ceiling.visible = !indoor && G.settings.ceiling;
    this.sky.visible = !indoor;
    if (indoor) {
      this.scene.fog = new THREE.Fog(T.dungeon.fog, 10, 60);
      this.scene.background = new THREE.Color(T.dungeon.fog);
      this.hemi.color.setHex(T.hemi.sky).lerp(new THREE.Color(T.dungeon.torch), 0.3); this.hemi.groundColor.setHex(T.dungeon.floor).multiplyScalar(1.4); this.hemi.intensity = 1.05;
      this.renderer.toneMappingExposure = 1.2;
      this.sun.intensity = 0.0; this.sun.castShadow = false;
      this.lantern.intensity = 4.5; this.lantern.distance = 24; this.lantern.color.setHex(T.dungeon.torch).lerp(new THREE.Color(0xffffff), 0.6);
      this.scene.environment = null;
    } else {
      this.scene.fog = new THREE.FogExp2(T.fog.color, T.fog.density);
      this.scene.background = new THREE.Color(T.fog.color);
      this.hemi.color.setHex(T.hemi.sky); this.hemi.groundColor.setHex(T.hemi.ground); this.hemi.intensity = T.hemi.intensity;
      this.sun.color.setHex(T.sun.color); this.sun.intensity = T.sun.intensity; this.sun.castShadow = true;
      this.lantern.intensity = 0;
      this.renderer.toneMappingExposure = 1.0;
      this.makeEnv();
    }
  },

  // 하늘을 환경맵으로 구워 금속 검과 갑옷에 반사가 생기게 한다.
  makeEnv() {
    try {
      const pm = new THREE.PMREMGenerator(this.renderer);
      const sc = new THREE.Scene();
      const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.sky.material);
      sc.add(sky);
      if (this.envRT) this.envRT.dispose();
      this.envRT = pm.fromScene(sc, 0.04);
      this.scene.environment = this.envRT.texture;
      sky.geometry.dispose(); pm.dispose();
    } catch (e) { this.scene.environment = null; }
  },

  followSun(px, pz) {
    if (!this.sunDir) return;
    const d = this.sunDir;
    this.sun.position.set(px + d.x * 120, d.y * 120 + 20, pz + d.z * 120);
    this.sun.target.position.set(px, 0, pz);
  },
};

// ---------------------------------------------------------------------------
// 텍스처 도우미
// ---------------------------------------------------------------------------
const Tex = {
  cache: new Map(),
  canvas(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
    t.anisotropy = 4;
    return t;
  },
  grain(seed = 1) {
    const r = mulberry32(seed);
    return this.canvas(256, 256, (g, w, h) => {
      const img = g.createImageData(w, h);
      const n = makeNoise2D(seed);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = 0.82 + 0.12 * fbm(n, x / 32, y / 32, 3) + (r() - 0.5) * 0.1;
        const i = (y * w + x) * 4; const c = clamp(v * 255, 0, 255);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = c; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    });
  },
  stone(base = '#8a8478', seed = 3) {
    const r = mulberry32(seed);
    return this.canvas(256, 256, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      const rows = 8, rh = h / rows;
      for (let y = 0; y < rows; y++) {
        let x = (y % 2) * -24;
        while (x < w) {
          const bw = 36 + r() * 30; const l = 0.78 + r() * 0.3;
          g.fillStyle = `rgba(${Math.floor(255 * l * 0.55)},${Math.floor(255 * l * 0.53)},${Math.floor(255 * l * 0.5)},0.55)`;
          g.fillRect(x + 2, y * rh + 2, bw - 4, rh - 4);
          x += bw;
        }
      }
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
      for (let y = 0; y <= rows; y++) { g.beginPath(); g.moveTo(0, y * rh); g.lineTo(w, y * rh); g.stroke(); }
      for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.12})`; g.fillRect(r() * w, r() * h, 2, 2); }
    });
  },
  tiles(base = '#5a564e', seed = 5) {
    const r = mulberry32(seed);
    return this.canvas(256, 256, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      const n = 4, s = w / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const l = 0.8 + r() * 0.35;
        g.fillStyle = `rgba(255,255,255,${(l - 0.8) * 0.25})`; g.fillRect(x * s + 3, y * s + 3, s - 6, s - 6);
        g.fillStyle = `rgba(0,0,0,${0.1 + r() * 0.15})`; g.fillRect(x * s, y * s, s, 3); g.fillRect(x * s, y * s, 3, s);
      }
      for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.1})`; g.fillRect(r() * w, r() * h, 2, 2); }
    });
  },
  // 이름표·피해 숫자용 글자 텍스처
  text(str, color = '#ffffff', size = 48, stroke = true) {
    const key = str + '|' + color + '|' + size;
    let t = this.cache.get(key);
    if (t) return t;
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    g.font = `700 ${size}px "IBM Plex Sans KR", system-ui, sans-serif`;
    const w = Math.ceil(g.measureText(str).width + size * 0.6), h = Math.ceil(size * 1.35);
    c.width = w; c.height = h;
    g.font = `700 ${size}px "IBM Plex Sans KR", system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (stroke) { g.lineWidth = size * 0.16; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(str, w / 2, h / 2); }
    g.fillStyle = color; g.fillText(str, w / 2, h / 2);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.userData = { w, h };
    if (this.cache.size > 400) { for (const [k, v] of this.cache) { v.dispose(); this.cache.delete(k); if (this.cache.size < 300) break; } }
    this.cache.set(key, t);
    return t;
  },
};

// ---------------------------------------------------------------------------
// 효과
// ---------------------------------------------------------------------------
const FX = {
  scene: null,
  init(scene) {
    this.scene = scene;
    this.initSparks();
    this.initShards();
    this.initWeather();
    this.texts = [];
    this.decals = [];
    this.rings = [];
    this.pillars = [];
  },

  // 불꽃 입자 (Points + 가산 혼합)
  initSparks() {
    const N = 900;
    this.spN = N; this.spI = 0;
    this.spPos = new Float32Array(N * 3); this.spVel = new Float32Array(N * 3);
    this.spCol = new Float32Array(N * 3); this.spLife = new Float32Array(N); this.spMax = new Float32Array(N); this.spSize = new Float32Array(N);
    this.spGrav = new Float32Array(N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.spPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.spCol, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.spSize, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { scale: { value: 600 } },
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; uniform float scale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = pow(max(1.0 - r, 0.0), 2.2); if (a < 0.01) discard; gl_FragColor = vec4(vC * a * 1.6, a); }`,
    });
    this.sparks = new THREE.Points(geo, mat);
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
  },
  burst(pos, color, count = 16, speed = 6, size = 0.18, life = 0.6, grav = 9) {
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.spI; this.spI = (this.spI + 1) % this.spN;
      this.spPos[i * 3] = pos.x; this.spPos[i * 3 + 1] = pos.y; this.spPos[i * 3 + 2] = pos.z;
      const u = Math.random() * 2 - 1, th = Math.random() * TAU, s = speed * (0.35 + Math.random() * 0.65);
      const rr = Math.sqrt(1 - u * u);
      this.spVel[i * 3] = rr * Math.cos(th) * s; this.spVel[i * 3 + 1] = u * s + speed * 0.3; this.spVel[i * 3 + 2] = rr * Math.sin(th) * s;
      const l = 0.7 + Math.random() * 0.6;
      this.spCol[i * 3] = c.r * l; this.spCol[i * 3 + 1] = c.g * l; this.spCol[i * 3 + 2] = c.b * l;
      this.spLife[i] = this.spMax[i] = life * (0.6 + Math.random() * 0.6);
      this.spSize[i] = size * (0.6 + Math.random() * 0.8);
      this.spGrav[i] = grav;
    }
  },
  rise(pos, color, count, radius, height, life = 1.4) {
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.spI; this.spI = (this.spI + 1) % this.spN;
      const a = Math.random() * TAU, r = Math.random() * radius;
      this.spPos[i * 3] = pos.x + Math.cos(a) * r; this.spPos[i * 3 + 1] = pos.y + Math.random() * 0.5; this.spPos[i * 3 + 2] = pos.z + Math.sin(a) * r;
      this.spVel[i * 3] = 0; this.spVel[i * 3 + 1] = height / life * (0.5 + Math.random()); this.spVel[i * 3 + 2] = 0;
      this.spCol[i * 3] = c.r; this.spCol[i * 3 + 1] = c.g; this.spCol[i * 3 + 2] = c.b;
      this.spLife[i] = this.spMax[i] = life * (0.5 + Math.random() * 0.5);
      this.spSize[i] = 0.12 + Math.random() * 0.12; this.spGrav[i] = 0;
    }
  },
  updateSparks(dt) {
    const N = this.spN;
    for (let i = 0; i < N; i++) {
      if (this.spLife[i] <= 0) { if (this.spSize[i] !== 0) this.spSize[i] = 0; continue; }
      this.spLife[i] -= dt;
      const t = Math.max(this.spLife[i], 0) / this.spMax[i];
      this.spVel[i * 3 + 1] -= this.spGrav[i] * dt;
      this.spVel[i * 3] *= 0.97; this.spVel[i * 3 + 2] *= 0.97;
      this.spPos[i * 3] += this.spVel[i * 3] * dt; this.spPos[i * 3 + 1] += this.spVel[i * 3 + 1] * dt; this.spPos[i * 3 + 2] += this.spVel[i * 3 + 2] * dt;
      if (this.spLife[i] <= 0) this.spSize[i] = 0;
      else this.spSize[i] *= 0.985 + 0.015 * t;
    }
    const g = this.sparks.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
    this.sparks.material.uniforms.scale.value = R.renderer.domElement.height * 0.45;
  },

  // 몬스터가 쓰러질 때 빛나는 다각형 조각으로 흩어지는 효과
  initShards() {
    const N = 600;
    const geo = new THREE.TetrahedronGeometry(0.16);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.shards = new THREE.InstancedMesh(geo, mat, N);
    this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shards.frustumCulled = false;
    this.shardData = [];
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < N; i++) {
      this.shards.setMatrixAt(i, m);
      this.shards.setColorAt(i, new THREE.Color(1, 1, 1));
      this.shardData.push({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), s: 1 });
    }
    this.shI = 0;
    this.scene.add(this.shards);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._e = new THREE.Euler();
  },
  shatter(center, radius, height, color, count = 50) {
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.shI; this.shI = (this.shI + 1) % this.shardData.length;
      const d = this.shardData[i];
      d.p.set(center.x + (Math.random() - 0.5) * radius * 1.6, center.y + Math.random() * height, center.z + (Math.random() - 0.5) * radius * 1.6);
      d.v.set(d.p.x - center.x, (Math.random() * 0.8 + 0.4) * 2, d.p.z - center.z).normalize().multiplyScalar(2 + Math.random() * 5);
      d.w.set(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4);
      d.q.random();
      d.life = d.max = 0.9 + Math.random() * 0.8;
      d.s = (0.6 + Math.random() * 1.2) * Math.max(0.7, radius * 0.8);
      const l = 0.7 + Math.random() * 0.6;
      this.shards.setColorAt(i, new THREE.Color(c.r * l + 0.2, c.g * l + 0.2, c.b * l + 0.25));
    }
    this.shards.instanceColor.needsUpdate = true;
  },
  updateShards(dt) {
    let any = false;
    for (let i = 0; i < this.shardData.length; i++) {
      const d = this.shardData[i];
      if (d.life <= 0) continue;
      any = true;
      d.life -= dt;
      d.v.y -= 2.5 * dt; d.v.multiplyScalar(0.985);
      d.p.addScaledVector(d.v, dt);
      this._e.set(d.w.x * dt, d.w.y * dt, d.w.z * dt); this._q.setFromEuler(this._e); d.q.multiply(this._q);
      const t = Math.max(d.life, 0) / d.max;
      this._s.setScalar(d.life > 0 ? d.s * t : 0);
      this._m.compose(d.p, d.q, this._s);
      this.shards.setMatrixAt(i, this._m);
    }
    if (any || this._shardDirty) { this.shards.instanceMatrix.needsUpdate = true; this._shardDirty = any; }
  },

  // 검기 잔상(리본)
  makeTrail(color) {
    const SEG = 16;
    const pos = new Float32Array(SEG * 2 * 3);
    const alpha = new Float32Array(SEG * 2);
    const idx = [];
    for (let i = 0; i < SEG - 1; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(color) }, strength: { value: 0 } },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 color; uniform float strength; varying float vA; void main(){ gl_FragColor = vec4(color * vA * strength, vA * strength); }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    this.scene.add(mesh);
    return { mesh, SEG, pts: [], strength: 0 };
  },
  updateTrail(tr, base, tip, active, dt) {
    tr.pts.unshift([base.clone(), tip.clone()]);
    if (tr.pts.length > tr.SEG) tr.pts.length = tr.SEG;
    tr.strength = active ? Math.min(1, tr.strength + dt * 12) : Math.max(0, tr.strength - dt * 5);
    const pos = tr.mesh.geometry.attributes.position.array, al = tr.mesh.geometry.attributes.alpha.array;
    for (let i = 0; i < tr.SEG; i++) {
      const p = tr.pts[Math.min(i, tr.pts.length - 1)];
      pos.set([p[0].x, p[0].y, p[0].z], i * 6); pos.set([p[1].x, p[1].y, p[1].z], i * 6 + 3);
      const a = Math.pow(1 - i / tr.SEG, 2.0) * 0.55;
      al[i * 2] = 0; al[i * 2 + 1] = a;
    }
    tr.mesh.geometry.attributes.position.needsUpdate = true; tr.mesh.geometry.attributes.alpha.needsUpdate = true;
    tr.mesh.material.uniforms.strength.value = tr.strength;
    tr.mesh.visible = tr.strength > 0.01;
  },

  // 떠오르는 글자 (피해 숫자 등)
  text(str, pos, color = '#ffffff', size = 0.5, opts = {}) {
    const tex = Tex.text(str, color, 64);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    const asp = tex.userData.w / tex.userData.h;
    sp.scale.set(size * asp, size, 1);
    sp.position.copy(pos);
    sp.renderOrder = 20;
    this.scene.add(sp);
    this.texts.push({ sp, life: opts.life || 0.9, max: opts.life || 0.9, vy: opts.vy ?? 1.6, vx: (Math.random() - 0.5) * 0.8, base: size });
    if (this.texts.length > 60) { const t = this.texts.shift(); this.scene.remove(t.sp); t.sp.material.dispose(); }
  },
  updateTexts(dt) {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.sp.position.y += t.vy * dt; t.sp.position.x += t.vx * dt; t.vy *= 0.95;
      const k = t.life / t.max;
      t.sp.material.opacity = Math.min(1, k * 2.5);
      const pop = 1 + Math.max(0, (k - 0.8)) * 2;
      const asp = t.sp.material.map.userData.w / t.sp.material.map.userData.h;
      t.sp.scale.set(t.base * pop * asp, t.base * pop, 1);
      if (t.life <= 0) { this.scene.remove(t.sp); t.sp.material.dispose(); this.texts.splice(i, 1); }
    }
  },

  // 바닥 경고 표시 (원, 선, 지정 위치)
  decal(type, opts) {
    let geo;
    if (type === 'circle') geo = new THREE.RingGeometry(0, 1, 48);
    else geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4,
      uniforms: { prog: { value: 0 }, color: { value: new THREE.Color(opts.color || 0xff3a2a) }, kind: { value: type === 'circle' ? 0 : 1 } },
      vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float prog; uniform vec3 color; uniform float kind; varying vec2 vUv; varying vec3 vP;
        void main(){
          float d = kind < 0.5 ? length(vP.xy) : vUv.y;
          float edge = kind < 0.5 ? smoothstep(0.9, 1.0, d) : (smoothstep(0.04, 0.0, vUv.x) + smoothstep(0.96, 1.0, vUv.x) + smoothstep(0.97, 1.0, vUv.y));
          float fill = step(d, prog) * 0.35;
          float a = clamp(edge * 0.8 + fill + 0.12, 0.0, 0.85);
          gl_FragColor = vec4(color, a);
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 3;
    if (type === 'circle') { m.scale.set(opts.radius, opts.radius, 1); }
    else {
      // 선: 시작점에서 진행 방향으로 len, 폭 width
      m.geometry.translate(0, 0.5, 0);
      m.scale.set(opts.width, opts.len, 1);
      // yaw는 (sin, cos) 방향 규약. X축 -90° 회전 뒤 로컬 +Y가 그 방향을 향하도록.
      m.rotation.z = opts.yaw + Math.PI;
    }
    m.position.set(opts.x, opts.y + 0.08, opts.z);
    this.scene.add(m);
    const d = { m, t: 0, dur: opts.dur, followGround: opts.followGround };
    this.decals.push(d);
    return d;
  },
  removeDecal(d) {
    if (!d) return;
    const i = this.decals.indexOf(d); if (i >= 0) this.decals.splice(i, 1);
    this.scene.remove(d.m); d.m.geometry.dispose(); d.m.material.dispose();
  },
  updateDecals(dt) {
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.t += dt;
      d.m.material.uniforms.prog.value = clamp(d.t / d.dur, 0, 1);
      if (d.t > d.dur + 0.15) this.removeDecal(d);
    }
  },

  // 퍼지는 충격파 고리
  ring(pos, color, maxR = 5, dur = 0.5, y = 0.15) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, pos.y + y, pos.z);
    this.scene.add(m);
    this.rings.push({ m, t: 0, dur, maxR });
  },
  // 레벨 업 빛기둥
  pillar(pos, color) {
    const g = new THREE.CylinderGeometry(0.9, 0.9, 30, 24, 1, true); g.translate(0, 15, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(pos);
    this.scene.add(m);
    this.pillars.push({ m, t: 0, dur: 1.6 });
  },
  updateMisc(dt) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt; const k = r.t / r.dur;
      r.m.scale.setScalar(0.2 + r.maxR * easeOut(Math.min(k, 1)));
      r.m.material.opacity = 0.9 * (1 - k);
      if (k >= 1) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    for (let i = this.pillars.length - 1; i >= 0; i--) {
      const p = this.pillars[i]; p.t += dt; const k = p.t / p.dur;
      p.m.scale.set(1 + k * 0.6, 1, 1 + k * 0.6);
      p.m.material.opacity = 0.55 * (1 - k);
      if (k >= 1) { this.scene.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); this.pillars.splice(i, 1); }
    }
  },

  // 날씨: 플레이어 주위를 감싸는 입자 상자
  initWeather() {
    const N = 1400;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = Math.random() * 60 - 30; pos[i * 3 + 1] = Math.random() * 30; pos[i * 3 + 2] = Math.random() * 60 - 30; seed[i] = Math.random(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.weatherMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { time: R.timeU, center: { value: new THREE.Vector3() }, color: { value: new THREE.Color(1, 1, 1) }, fall: { value: 1 }, drift: { value: 0.5 }, size: { value: 0.1 }, scale: { value: 600 }, additive: { value: 0 } },
      vertexShader: `attribute float seed; uniform float time, fall, drift, size, scale; uniform vec3 center; varying float vA;
        void main(){
          vec3 p = position;
          p.y = mod(p.y - time * fall * (0.6 + seed * 0.8), 30.0);
          p.x += sin(time * 0.7 + seed * 40.0) * drift * 2.0;
          p.z += cos(time * 0.5 + seed * 30.0) * drift * 2.0;
          vec3 w = vec3(mod(p.x - center.x + 30.0, 60.0) - 30.0 + center.x, p.y + center.y - 10.0, mod(p.z - center.z + 30.0, 60.0) - 30.0 + center.z);
          vec4 mv = modelViewMatrix * vec4(w, 1.0);
          vA = smoothstep(32.0, 6.0, -mv.z) * (0.5 + seed * 0.5);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform vec3 color; varying float vA; void main(){ float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(color, a); }`,
    });
    this.weather = new THREE.Points(geo, this.weatherMat);
    this.weather.frustumCulled = false;
    this.scene.add(this.weather);
  },
  setWeather(kind, indoor) {
    const u = this.weatherMat.uniforms;
    const W = {
      pollen: [0xfff6c0, 0.3, 0.6, 0.06, false], leaves: [0xc8a040, 1.2, 1.0, 0.12, false], dust: [0xe8c8a0, 0.4, 1.6, 0.07, false],
      snow: [0xffffff, 2.0, 0.6, 0.1, false], spores: [0xd0ff80, 0.25, 0.4, 0.08, true], sparkle: [0x9ae8ff, 0.2, 0.3, 0.07, true],
      embers: [0xff7a2a, -1.2, 0.8, 0.08, true], petals: [0xffb8d8, 0.9, 1.2, 0.11, false], motes: [0xc890ff, -0.3, 0.4, 0.07, true],
      dungeon: [0xffd0a0, 0.15, 0.2, 0.05, true],
    };
    const w = W[indoor ? 'dungeon' : kind] || W.pollen;
    u.color.value.setHex(w[0]); u.fall.value = w[1]; u.drift.value = w[2]; u.size.value = w[3];
    this.weatherMat.blending = w[4] ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.weatherMat.needsUpdate = true;
  },

  update(dt) {
    this.updateSparks(dt);
    this.updateShards(dt);
    this.updateTexts(dt);
    this.updateDecals(dt);
    this.updateMisc(dt);
    const cp = R.camera.getWorldPosition(this._tmpV || (this._tmpV = new THREE.Vector3()));
    this.weatherMat.uniforms.center.value.copy(cp);
    this.weatherMat.uniforms.scale.value = R.renderer.domElement.height * 0.9;
  },
  clearTransient() {
    for (const d of [...this.decals]) this.removeDecal(d);
    for (const t of this.texts) { this.scene.remove(t.sp); t.sp.material.dispose(); }
    this.texts = [];
  },
};

// ---------------------------------------------------------------------------
// 지오메트리 병합 도우미: 여러 부품을 하나로 합치고 부품별 정점 색을 굽는다.
// ---------------------------------------------------------------------------
function mergeParts(parts) {
  // parts: [{geo, color, matrix}] -> 비색인 지오메트리 하나
  let total = 0;
  const prepared = parts.map((p) => {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    if (p.matrix) g.applyMatrix4(p.matrix);
    total += g.attributes.position.count;
    return { g, color: new THREE.Color(p.color), emissive: p.emissive || 0, top: p.topColor ? new THREE.Color(p.topColor) : null };
  });
  const pos = new Float32Array(total * 3), col = new Float32Array(total * 3), em = new Float32Array(total);
  let o = 0;
  for (const p of prepared) {
    const a = p.g.attributes.position;
    let minY = Infinity, maxY = -Infinity;
    if (p.top) for (let i = 0; i < a.count; i++) { minY = Math.min(minY, a.getY(i)); maxY = Math.max(maxY, a.getY(i)); }
    for (let i = 0; i < a.count; i++) {
      pos[(o + i) * 3] = a.getX(i); pos[(o + i) * 3 + 1] = a.getY(i); pos[(o + i) * 3 + 2] = a.getZ(i);
      let c = p.color;
      if (p.top) { const k = (a.getY(i) - minY) / Math.max(1e-4, maxY - minY); c = p.color.clone().lerp(p.top, smoothstep(0.55, 0.95, k)); }
      col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b;
      em[o + i] = p.emissive;
    }
    o += a.count;
    p.g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('emissiveMask', new THREE.BufferAttribute(em, 1));
  geo.computeVertexNormals();
  return geo;
}
function M4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return m;
}
// 정점별 emissiveMask 속성으로 일부만 빛나게 하는 재질
function glowMaterial(params = {}, glowColor = 0xffffff, glowStrength = 1.5) {
  const mat = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.85, metalness: 0.0, flatShading: true }, params));
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.glowColor = { value: new THREE.Color(glowColor) };
    sh.uniforms.glowStrength = { value: glowStrength };
    sh.uniforms.uTime = R.timeU;
    sh.vertexShader = 'attribute float emissiveMask;\nvarying float vEm;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvEm = emissiveMask;');
    sh.fragmentShader = 'uniform vec3 glowColor;\nuniform float glowStrength;\nuniform float uTime;\nvarying float vEm;\n' +
      sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vEm * glowStrength * (0.85 + 0.15 * sin(uTime * 2.0));');
  };
  return mat;
}
