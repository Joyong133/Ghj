// ---------------------------------------------------------------------------
// 월드: 층(필드) 생성, 마을, 미궁탑, 미궁 내부, 충돌
// ---------------------------------------------------------------------------
class ColGrid {
  constructor(cell = 8) { this.cell = cell; this.map = new Map(); this.q = 0; }
  key(ix, iz) { return (ix + 2048) * 4096 + (iz + 2048); }
  add(c) {
    const r = c.type === 'c' ? c.r : Math.hypot(c.hx, c.hz);
    const x0 = Math.floor((c.x - r) / this.cell), x1 = Math.floor((c.x + r) / this.cell);
    const z0 = Math.floor((c.z - r) / this.cell), z1 = Math.floor((c.z + r) / this.cell);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = this.key(ix, iz); let a = this.map.get(k); if (!a) { a = []; this.map.set(k, a); } a.push(c);
    }
    return c;
  }
  circle(x, z, r, data) { return this.add({ type: 'c', x, z, r, data }); }
  // meshRotY: three.js 메시의 rotation.y 값
  box(x, z, hx, hz, meshRotY = 0, data) { const a = -meshRotY; return this.add({ type: 'b', x, z, hx, hz, c: Math.cos(a), s: Math.sin(a), data }); }
  query(x, z, r, out) {
    out.length = 0; this.q++;
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell);
    const z0 = Math.floor((z - r) / this.cell), z1 = Math.floor((z + r) / this.cell);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const a = this.map.get(this.key(ix, iz)); if (!a) continue;
      for (const c of a) { if (c._q !== this.q) { c._q = this.q; out.push(c); } }
    }
    return out;
  }
  // 원(반지름 r)을 충돌체 밖으로 밀어낸다. 부딪혔으면 true
  resolve(pos, r) {
    const list = this.query(pos.x, pos.z, r + 2, this._tmp || (this._tmp = []));
    let hit = false;
    for (const c of list) {
      if (c.off) continue;
      if (c.type === 'c') {
        const dx = pos.x - c.x, dz = pos.z - c.z, rr = r + c.r, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1e-4; const p = rr - d; pos.x += (dx / d) * p; pos.z += (dz / d) * p; hit = true; }
      } else {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        let lx = dx * c.c + dz * c.s, lz = -dx * c.s + dz * c.c;
        const cx = clamp(lx, -c.hx, c.hx), cz = clamp(lz, -c.hz, c.hz);
        const ex = lx - cx, ez = lz - cz, d2 = ex * ex + ez * ez;
        if (d2 < r * r) {
          if (d2 > 1e-8) { const d = Math.sqrt(d2), p = r - d; lx += (ex / d) * p; lz += (ez / d) * p; }
          else { const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz); if (px < pz) lx = Math.sign(lx || 1) * (c.hx + r); else lz = Math.sign(lz || 1) * (c.hz + r); }
          pos.x = c.x + lx * c.c - lz * c.s; pos.z = c.z + lx * c.s + lz * c.c; hit = true;
        }
      }
    }
    return hit;
  }
  // 선분이 충돌체에 막히는지 (시야/돌진 판정용, 대략)
  blocked(x0, z0, x1, z1) {
    const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.8);
    const p = { x: 0, z: 0 };
    for (let i = 1; i <= steps; i++) {
      const t = i / steps; p.x = lerp(x0, x1, t); p.z = lerp(z0, z1, t);
      const ox = p.x, oz = p.z;
      if (this.resolve(p, 0.2) && Math.hypot(p.x - ox, p.z - oz) > 0.05) return true;
    }
    return false;
  }
}

const World = {
  field: null,     // 필드 데이터
  dungeon: null,   // 미궁 데이터 (입장 시 생성)
  active: null,    // 지금 쓰는 충돌/높이 정보 (field 또는 dungeon)
  geoCache: {},

  ground(x, z) { return this.active ? this.active.ground(x, z) : 0; },
  liquidAt(x, z) {
    const a = this.active; if (!a || !a.water) return null;
    const h = a.ground(x, z);
    return h < a.water.level - 0.15 ? a.water : null;
  },
  passable(x, z) {
    const a = this.active; if (!a) return true;
    if (a.bounds && !a.bounds(x, z)) return false;
    if (a.water && a.water.kind === 'water') { if (a.ground(x, z) < a.water.level - 1.3) return false; }
    return true;
  },

  dispose(group) {
    if (!group) return;
    group.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (m.userData.shared) continue; if (m.map && !m.map.userData.shared) m.map.dispose(); m.dispose(); } }
    });
    group.removeFromParent();
  },

  // -------------------------------------------------------------------------
  // 필드
  // -------------------------------------------------------------------------
  buildFloor(f) {
    const T = themeForFloor(f), seed = floorSeed(f), r = new RNG(seed);
    const n1 = makeNoise2D(seed), n2 = makeNoise2D(seed ^ 0x5555), n3 = makeNoise2D(seed ^ 0x9999);
    const q = R.quality;
    const SIZE = 420, RI = 185;
    const SEG = q === 'high' ? 210 : q === 'medium' ? 170 : 130;
    const cell = SIZE / SEG, N = SEG + 1;
    const wl = T.water ? T.water.level : -999;

    const townAng = r.range(0, TAU);
    const town = { x: Math.cos(townAng) * 92, z: Math.sin(townAng) * 92 };
    const towerAng = townAng + Math.PI + r.range(-0.6, 0.6);
    const tower = { x: Math.cos(towerAng) * 122, z: Math.sin(towerAng) * 122 };

    // 마을에서 미궁탑까지 굽은 길
    const road = [];
    const curve = r.range(-45, 45);
    const rdx = tower.x - town.x, rdz = tower.z - town.z, rlen = Math.hypot(rdx, rdz);
    const px = -rdz / rlen, pz = rdx / rlen;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, s = Math.sin(t * Math.PI);
      const off = s * curve + n3(t * 3.1, 0.5) * 12 * s;
      road.push({ x: lerp(town.x, tower.x, t) + px * off, z: lerp(town.z, tower.z, t) + pz * off, t });
    }
    const roadDist = (x, z) => {
      let best = 1e9, bt = 0;
      for (let i = 0; i < road.length - 1; i++) {
        const a = road[i], b = road[i + 1];
        const abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz;
        const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / l2, 0, 1);
        const cx = a.x + abx * t, cz = a.z + abz * t, d = (x - cx) * (x - cx) + (z - cz) * (z - cz);
        if (d < best) { best = d; bt = lerp(a.t, b.t, t); }
      }
      return [Math.sqrt(best), bt];
    };

    const amp = T.terrain.amp, rough = T.terrain.rough;
    const rawH = (x, z) => fbm(n1, x * 0.0042, z * 0.0042, 5) * amp * 1.7 + ridged(n2, x * 0.011, z * 0.011, 3) * rough - rough * 0.35;
    const townH = Math.max(rawH(town.x, town.z), wl + 3);
    const towerH = Math.max(rawH(tower.x, tower.z), wl + 3);
    const heights = new Float32Array(N * N), roadK = new Float32Array(N * N);
    let minH = 1e9, maxH = -1e9;
    for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
      const x = -SIZE / 2 + ix * cell, z = -SIZE / 2 + iz * cell;
      let h = rawH(x, z);
      const [dr, tr] = roadDist(x, z);
      const k = 1 - smoothstep(3.5, 13, dr);
      const rb = lerp(townH, towerH, tr);
      h = lerp(h, Math.max(lerp(h, rb, 0.75), wl + 1.0), k);
      const dt = Math.hypot(x - town.x, z - town.z); h = lerp(townH, h, smoothstep(37, 54, dt));
      const dw = Math.hypot(x - tower.x, z - tower.z); h = lerp(towerH, h, smoothstep(24, 40, dw));
      const d = Math.hypot(x, z); const e = smoothstep(RI - 32, RI + 6, d);
      h = h * (1 - e * 0.4) - e * e * 75;
      heights[iz * N + ix] = h;
      roadK[iz * N + ix] = dt < 30 ? 0 : 1 - smoothstep(2.5, 5.5, dr);
      if (d < RI) { minH = Math.min(minH, h); maxH = Math.max(maxH, h); }
    }
    const ground = (x, z) => {
      const fx = clamp((x + SIZE / 2) / cell, 0, SEG - 0.001), fz = clamp((z + SIZE / 2) / cell, 0, SEG - 0.001);
      const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
      const a = heights[iz * N + ix], b = heights[iz * N + ix + 1], c = heights[(iz + 1) * N + ix], d = heights[(iz + 1) * N + ix + 1];
      return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
    };

    const group = new THREE.Group();
    group.name = 'field';
    const colliders = new ColGrid(8);

    // 지형 메시
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, heights[i]);
    geo.computeVertexNormals();
    const nor = geo.attributes.normal;
    const cols = new Float32Array(pos.count * 3);
    const C = (h) => new THREE.Color(h);
    const gl = C(T.ground.low), gm = C(T.ground.mid), gh = C(T.ground.high), gc = C(T.ground.cliff), gr = C(T.ground.road);
    const shore = C(T.ground.road).lerp(C(T.ground.low), 0.4).multiplyScalar(0.9);
    const tmp = new THREE.Color();
    const grassDensity = new Float32Array(N * N);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = heights[i];
      const hn = invLerp(minH, maxH, h);
      tmp.copy(gl).lerp(gm, smoothstep(0.2, 0.5, hn)).lerp(gh, smoothstep(0.6, 0.92, hn));
      const v = fbm(n3, x * 0.045, z * 0.045, 2);
      tmp.multiplyScalar(0.88 + v * 0.3);
      let grass = 1;
      if (T.water && h < wl + 1.4) { const k = smoothstep(wl + 1.4, wl + 0.2, h); tmp.lerp(shore, k); grass *= 1 - k; }
      const ny = nor.getY(i);
      const cliff = smoothstep(0.86, 0.66, ny);
      tmp.lerp(gc, cliff); grass *= 1 - cliff;
      const rk = roadK[i] * (0.8 + 0.2 * v);
      tmp.lerp(gr, rk * 0.9); grass *= 1 - roadK[i];
      const dt = Math.hypot(x - town.x, z - town.z);
      if (dt < 36) grass *= smoothstep(31, 36, dt);
      if (Math.hypot(x - tower.x, z - tower.z) < 22) { tmp.lerp(gc, 0.3); grass *= 0.3; }
      if (Math.hypot(x, z) > RI - 6) { tmp.lerp(gc, smoothstep(RI - 6, RI + 4, Math.hypot(x, z))); grass = 0; }
      cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
      grassDensity[i] = clamp(grass * (0.55 + 0.45 * fbm(n2, x * 0.02, z * 0.02, 2) + 0.2), 0, 1) * T.grass.density;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const grain = Tex.grain(seed & 0xffff); grain.repeat.set(SIZE / 6, SIZE / 6); grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 0.95, metalness: 0 }));
    terrain.receiveShadow = true;
    group.add(terrain);

    // 섬 밑동(구름 바다 위에 떠 있는 바위)
    const under = new THREE.Mesh(new THREE.ConeGeometry(RI + 8, 140, 40, 6, true), new THREE.MeshStandardMaterial({ color: T.ground.cliff, roughness: 1, flatShading: true }));
    const up = under.geometry.attributes.position;
    for (let i = 0; i < up.count; i++) { const x = up.getX(i), z = up.getZ(i), y = up.getY(i); const k = 1 + n1(x * 0.05, z * 0.05 + y * 0.03) * 0.12; up.setX(i, x * k); up.setZ(i, z * k); }
    under.geometry.computeVertexNormals();
    under.rotation.x = Math.PI; under.position.y = -70 - 40;
    group.add(under);

    // 물/용암
    let water = null;
    if (T.water) {
      water = { level: wl, kind: T.water.kind, color: T.water.color };
      const wm = this.liquidMesh(T.water, RI + 4);
      wm.position.y = wl;
      group.add(wm);
    }

    // 높이 텍스처 (풀 셰이더가 지형을 따라가도록)
    const htData = new Float32Array(N * N * 4);
    for (let i = 0; i < N * N; i++) { htData[i * 4] = heights[i]; htData[i * 4 + 1] = grassDensity[i]; }
    const heightTex = new THREE.DataTexture(htData, N, N, THREE.RGBAFormat, THREE.FloatType);
    heightTex.needsUpdate = true;

    const F = {
      f, T, seed, SIZE, RI, SEG, cell, heights, ground, colliders, group, water, town, tower, townH, towerH, road,
      townAng, towerAng, heightTex, spawns: [], npcs: [], interactables: [], animated: [], minH, maxH,
      bounds: (x, z) => Math.hypot(x, z) < RI - 4,
    };
    F.townName = makeName(new RNG(seed ^ 0x77), SYL_TOWN, 2, 3) + ' ' + new RNG(seed ^ 0x78).pick(TOWN_SUFFIX);
    F.areaName = r.pick(T.areas);

    this.addGrass(F, group);
    this.scatter(F, r, n2, group);
    this.buildTown(F, r, group);
    this.buildTower(F, group);
    this.makeSpawns(F, r);
    F.minimap = this.renderMinimap(F, cols);
    return F;
  },

  liquidMesh(W, radius) {
    const kinds = { water: 0, ice: 1, poison: 2, lava: 3, void: 4 };
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { color: { value: new THREE.Color(W.color) }, kind: { value: kinds[W.kind] || 0 } }]);
    uniforms.time = R.timeU;
    const mat = new THREE.ShaderMaterial({
      transparent: W.kind !== 'lava', fog: true, depthWrite: W.kind === 'lava' || W.kind === 'ice', uniforms,
      vertexShader: `varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){
          vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
          vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform vec3 color; uniform float kind; uniform float time; varying vec3 vW;
        #include <fog_pars_fragment>
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
        float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.0; a*=0.5; } return s; }
        void main(){
          vec2 p = vW.xz;
          vec3 col = color; float a = 0.78;
          if (kind < 0.5) { float n = fbm(p * 0.25 + vec2(time * 0.15, time * 0.1)) + fbm(p * 0.6 - vec2(time * 0.2, 0.0)) * 0.5;
            col = mix(color * 0.7, color * 1.35 + 0.08, smoothstep(0.6, 1.1, n)); a = 0.72; }
          else if (kind < 1.5) { float n = fbm(p * 0.15); col = mix(color, vec3(0.95,0.98,1.0), n * 0.6); float crack = smoothstep(0.02, 0.0, abs(fbm(p * 0.3) - 0.5)); col *= 1.0 - crack * 0.25; a = 0.95; }
          else if (kind < 2.5) { float n = fbm(p * 0.3 + time * 0.05); col = color * (0.6 + n * 0.7); float b = step(0.985, hash(floor(p * 2.0) + floor(time * 2.0))); col += vec3(0.4,0.6,0.2) * b; a = 0.88; }
          else if (kind < 3.5) { float n = fbm(p * 0.18 + vec2(time * 0.04, time * 0.03)); float v = smoothstep(0.35, 0.75, n);
            col = mix(vec3(0.25,0.03,0.0), color * 2.2 + vec3(0.6,0.3,0.0), v); a = 1.0; }
          else { float n = fbm(p * 0.2 - time * 0.05); col = mix(vec3(0.03,0.0,0.06), color * 1.6, smoothstep(0.4, 0.9, n)); a = 0.92; }
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 72), mat);
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 1;
    return m;
  },

  // 플레이어 주변을 빽빽하게 덮는 풀. 정점 셰이더가 높이 텍스처를 읽어 지형에 붙인다.
  addGrass(F, group) {
    const T = F.T, q = R.quality;
    const count = Math.round((q === 'high' ? 20000 : q === 'medium' ? 11000 : 5000) * Math.min(1, T.grass.density + 0.2));
    const W = q === 'low' ? 46 : 64;
    const blade = new THREE.BufferGeometry();
    const bp = [], bh = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI + Math.random() * 0.4;
      const ox = (Math.random() - 0.5) * 0.12, oz = (Math.random() - 0.5) * 0.12;
      const cx = Math.cos(a) * 0.028, cz = Math.sin(a) * 0.028;
      const h = 0.32 + Math.random() * 0.16, lean = (Math.random() - 0.5) * 0.18;
      bp.push(ox - cx, 0, oz - cz, ox + cx, 0, oz + cz, ox + lean, h, oz + lean * 0.5); bh.push(0, 0, 1);
    }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    blade.setAttribute('hgt', new THREE.Float32BufferAttribute(bh, 1));
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = null;
    ig.setAttribute('position', blade.attributes.position);
    ig.setAttribute('hgt', blade.attributes.hgt);
    const offs = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { offs[i * 4] = Math.random() * W; offs[i * 4 + 1] = Math.random() * W; offs[i * 4 + 2] = Math.random(); offs[i * 4 + 3] = 0.7 + Math.random() * 0.6; }
    ig.setAttribute('offs', new THREE.InstancedBufferAttribute(offs, 4));
    ig.instanceCount = count;
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      htex: { value: F.heightTex }, N: { value: F.SEG + 1 }, SIZE: { value: F.SIZE }, W: { value: W }, center: { value: new THREE.Vector3() },
      base: { value: new THREE.Color(T.grass.base) }, tip: { value: new THREE.Color(T.grass.tip) }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunCol: { value: new THREE.Color(T.sun.color).multiplyScalar(0.35 * T.sun.intensity) }, amb: { value: new THREE.Color(T.hemi.sky).multiplyScalar(0.55 * T.hemi.intensity) },
    }]);
    uniforms.time = R.timeU;
    uniforms.htex.value = F.heightTex;
    const mat = new THREE.ShaderMaterial({
      uniforms, fog: true, side: THREE.DoubleSide,
      vertexShader: `
        precision highp float; precision highp sampler2D;
        uniform sampler2D htex; uniform float N, SIZE, W, time; uniform vec3 center;
        attribute float hgt; attribute vec4 offs; varying float vH; varying float vFade;
        #include <fog_pars_vertex>
        vec2 samp(vec2 xz){
          vec2 f = clamp((xz + SIZE * 0.5) / SIZE * (N - 1.0), vec2(0.0), vec2(N - 1.001));
          ivec2 i = ivec2(floor(f)); vec2 t = fract(f);
          vec4 a = texelFetch(htex, i, 0), b = texelFetch(htex, i + ivec2(1,0), 0), c = texelFetch(htex, i + ivec2(0,1), 0), d = texelFetch(htex, i + ivec2(1,1), 0);
          return mix(mix(a.xy, b.xy, t.x), mix(c.xy, d.xy, t.x), t.y);
        }
        void main(){
          vec2 wp = center.xz + mod(offs.xy - center.xz + W * 0.5, W) - W * 0.5;
          vec2 hd = samp(wp);
          float dens = hd.y;
          float dist = length(wp - center.xz);
          vFade = smoothstep(W * 0.5, W * 0.5 - 10.0, dist);
          float s = offs.w * step(offs.z, dens) * vFade;
          vec3 p = position * s;
          float sway = sin(time * 1.8 + wp.x * 0.33 + wp.y * 0.27) * 0.12 + sin(time * 3.1 + wp.x) * 0.03;
          p.x += sway * hgt * s; p.z += sway * 0.6 * hgt * s;
          vec3 world = vec3(wp.x, hd.x, wp.y) + p;
          vH = hgt;
          vec4 mvPosition = viewMatrix * vec4(world, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform vec3 base, tip, sunCol, amb; varying float vH; varying float vFade;
        #include <fog_pars_fragment>
        void main(){
          vec3 c = mix(base * 0.7, tip, vH);
          vec3 lit = c * (amb + sunCol * (0.6 + 0.4 * vH));
          gl_FragColor = vec4(lit, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(ig, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
    F.grass = mesh;
    // 꽃: 같은 방식, 더 적게
    if (T.flowers && T.flowers.length) {
      const fc = Math.round(count * 0.06);
      const fg = new THREE.InstancedBufferGeometry();
      const sp = new THREE.OctahedronGeometry(0.07, 0);
      sp.translate(0, 0.42, 0);
      const stem = []; const pa = sp.attributes.position.array;
      for (let i = 0; i < pa.length; i++) stem.push(pa[i]);
      stem.push(-0.01, 0, 0, 0.01, 0, 0, 0, 0.4, 0);
      fg.setAttribute('position', new THREE.Float32BufferAttribute(stem, 3));
      const hg = new Float32Array(stem.length / 3).fill(1); hg[hg.length - 3] = 0; hg[hg.length - 2] = 0;
      fg.setAttribute('hgt', new THREE.BufferAttribute(hg, 1));
      const fo = new Float32Array(fc * 4);
      for (let i = 0; i < fc; i++) { fo[i * 4] = Math.random() * W; fo[i * 4 + 1] = Math.random() * W; fo[i * 4 + 2] = Math.random() * 0.8; fo[i * 4 + 3] = 0.8 + Math.random() * 0.6; }
      fg.setAttribute('offs', new THREE.InstancedBufferAttribute(fo, 4));
      const fcol = new Float32Array(fc * 3);
      for (let i = 0; i < fc; i++) { const c = new THREE.Color(T.flowers[i % T.flowers.length]); fcol[i * 3] = c.r; fcol[i * 3 + 1] = c.g; fcol[i * 3 + 2] = c.b; }
      fg.setAttribute('fcol', new THREE.InstancedBufferAttribute(fcol, 3));
      fg.instanceCount = fc;
      const fmat = mat.clone();
      fmat.uniforms = uniforms; // 같은 유니폼 공유
      fmat.vertexShader = mat.vertexShader.replace('attribute float hgt;', 'attribute float hgt; attribute vec3 fcol; varying vec3 vCol;').replace('vH = hgt;', 'vH = hgt; vCol = fcol;');
      fmat.fragmentShader = mat.fragmentShader.replace('varying float vH;', 'varying float vH; varying vec3 vCol;').replace('vec3 c = mix(base * 0.7, tip, vH);', 'vec3 c = mix(base * 0.7, vCol * 1.4, vH);');
      const fm = new THREE.Mesh(fg, fmat);
      fm.frustumCulled = false;
      group.add(fm);
    }
  },

  // 나무·바위 같은 지형지물
  vegGeo(type) {
    if (this.geoCache[type]) return this.geoCache[type];
    const P = [];
    const trunk = 0x6b4a32, leaf = 0x4f8a35;
    const add = (geo, color, m, extra = {}) => P.push(Object.assign({ geo, color, matrix: m }, extra));
    switch (type) {
      case 'oak': case 'blossom': {
        add(new THREE.CylinderGeometry(0.22, 0.36, 2.6, 6), trunk, M4(0, 1.3, 0));
        add(new THREE.CylinderGeometry(0.08, 0.12, 1.2, 5), trunk, M4(0.45, 2.3, 0, 0, 0, -0.8));
        const lc = type === 'blossom' ? 0xffb6d5 : leaf;
        add(new THREE.IcosahedronGeometry(1.7, 0), lc, M4(0, 3.6, 0));
        add(new THREE.IcosahedronGeometry(1.2, 0), lc, M4(1.0, 3.0, 0.4, 0.4));
        add(new THREE.IcosahedronGeometry(1.3, 0), lc, M4(-0.8, 3.2, -0.5, 0.2, 0.5));
        add(new THREE.IcosahedronGeometry(1.0, 0), lc, M4(0.2, 4.6, 0.3));
        break;
      }
      case 'pine': case 'snowpine': {
        add(new THREE.CylinderGeometry(0.18, 0.3, 1.8, 6), trunk, M4(0, 0.9, 0));
        const lc = 0x2f6a3a, top = type === 'snowpine' ? 0xffffff : null;
        add(new THREE.ConeGeometry(2.0, 2.8, 7), lc, M4(0, 2.8, 0), { topColor: top });
        add(new THREE.ConeGeometry(1.55, 2.4, 7), lc, M4(0, 4.1, 0, 0, 0.4), { topColor: top });
        add(new THREE.ConeGeometry(1.0, 2.0, 7), lc, M4(0, 5.3, 0, 0, 0.8), { topColor: top });
        break;
      }
      case 'dead': {
        add(new THREE.CylinderGeometry(0.15, 0.32, 3.4, 5), 0x4a3c30, M4(0, 1.7, 0, 0.05, 0, 0.06));
        add(new THREE.CylinderGeometry(0.05, 0.12, 1.6, 4), 0x4a3c30, M4(0.55, 2.8, 0, 0, 0, -0.9));
        add(new THREE.CylinderGeometry(0.05, 0.1, 1.3, 4), 0x4a3c30, M4(-0.45, 2.4, 0.2, 0.3, 0, 0.9));
        add(new THREE.CylinderGeometry(0.04, 0.08, 1.0, 4), 0x4a3c30, M4(0.1, 3.6, -0.3, -0.6, 0, 0.2));
        break;
      }
      case 'cactus': {
        add(new THREE.CylinderGeometry(0.32, 0.36, 3.0, 8), 0x4a8a46, M4(0, 1.5, 0));
        add(new THREE.SphereGeometry(0.32, 8, 4, 0, TAU, 0, Math.PI / 2), 0x4a8a46, M4(0, 3.0, 0));
        add(new THREE.CylinderGeometry(0.2, 0.2, 1.0, 7), 0x4a8a46, M4(0.55, 1.6, 0, 0, 0, Math.PI / 2));
        add(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 7), 0x4a8a46, M4(0.95, 2.1, 0));
        add(new THREE.CylinderGeometry(0.18, 0.18, 0.8, 7), 0x4a8a46, M4(-0.45, 1.2, 0, 0, 0, Math.PI / 2));
        add(new THREE.CylinderGeometry(0.18, 0.18, 0.9, 7), 0x4a8a46, M4(-0.8, 1.6, 0));
        break;
      }
      case 'mushroom': {
        add(new THREE.CylinderGeometry(0.22, 0.32, 1.8, 7), 0xe8dcc8, M4(0, 0.9, 0));
        add(new THREE.SphereGeometry(1.2, 10, 6, 0, TAU, 0, Math.PI / 2), 0xb04a6a, M4(0, 1.75, 0, 0, 0, 0, 1, 0.6, 1));
        for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; add(new THREE.IcosahedronGeometry(0.13, 0), 0xfff4b0, M4(Math.cos(a) * 0.75, 2.2, Math.sin(a) * 0.75), { emissive: 1 }); }
        break;
      }
      case 'crystal': {
        const cc = 0x8ad8ff;
        add(new THREE.OctahedronGeometry(0.6, 0), cc, M4(0, 1.4, 0, 0, 0, 0, 0.7, 2.6, 0.7), { emissive: 0.8 });
        add(new THREE.OctahedronGeometry(0.45, 0), cc, M4(0.6, 0.8, 0.2, 0, 0, -0.5, 0.7, 2.0, 0.7), { emissive: 0.8 });
        add(new THREE.OctahedronGeometry(0.4, 0), cc, M4(-0.5, 0.7, -0.3, 0.3, 0, 0.6, 0.7, 1.8, 0.7), { emissive: 0.8 });
        add(new THREE.DodecahedronGeometry(0.6, 0), 0x3a3a4a, M4(0, 0.1, 0, 0, 0, 0, 1.3, 0.5, 1.3));
        break;
      }
      case 'pillar': {
        add(new THREE.BoxGeometry(2.0, 0.6, 2.0), 0xb8b0a0, M4(0, 0.3, 0));
        add(new THREE.CylinderGeometry(0.6, 0.65, 3.6, 10), 0xd8d0c0, M4(0, 2.4, 0));
        add(new THREE.CylinderGeometry(0.6, 0.6, 0.5, 10), 0xd8d0c0, M4(0.15, 4.5, 0, 0.25, 0, 0.15));
        add(new THREE.BoxGeometry(0.9, 0.5, 0.6), 0xc8c0b0, M4(1.4, 0.25, 0.6, 0, 0.6, 0.2));
        break;
      }
      case 'rock': {
        const g = new THREE.DodecahedronGeometry(1, 1);
        const p = g.attributes.position; const n = makeNoise2D(42);
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + n(x * 1.7 + z, y * 1.7) * 0.35; p.setXYZ(i, x * k, y * k * 0.7, z * k); }
        add(g, 0x8a8478, M4(0, 0.35, 0));
        break;
      }
      case 'bush': {
        add(new THREE.IcosahedronGeometry(0.8, 0), 0x3f7a30, M4(0, 0.5, 0));
        add(new THREE.IcosahedronGeometry(0.6, 0), 0x4a8a38, M4(0.6, 0.4, 0.2));
        add(new THREE.IcosahedronGeometry(0.55, 0), 0x3a7030, M4(-0.5, 0.35, -0.2));
        break;
      }
    }
    const geo = mergeParts(P);
    geo.userData.shared = true;
    this.geoCache[type] = geo;
    return geo;
  },
  scatter(F, r, n2, group) {
    const T = F.T, q = R.quality;
    const mult = q === 'high' ? 1 : q === 'medium' ? 0.75 : 0.5;
    const leafTint = new THREE.Color(T.grass.base).lerp(new THREE.Color(T.grass.tip), 0.25);
    const rockTint = new THREE.Color(T.ground.cliff).lerp(new THREE.Color(0xffffff), 0.25);
    const colR = { oak: 0.5, blossom: 0.5, pine: 0.45, snowpine: 0.45, dead: 0.35, cactus: 0.45, mushroom: 0.45, crystal: 0.7, pillar: 0.8, rock: 1.0, bush: 0 };
    const dummy = new THREE.Object3D();
    for (const [type, baseCount] of T.veg) {
      const count = Math.round(baseCount * mult);
      const glow = type === 'crystal' || type === 'mushroom';
      const mat = glow ? glowMaterial({ roughness: 0.4 }, 0xffffff, type === 'crystal' ? 1.3 : 1.0) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
      if (type !== 'rock' && type !== 'pillar' && type !== 'crystal') {
        mat.onBeforeCompile = ((prev) => (sh) => {
          if (prev) prev(sh);
          sh.uniforms.uTime = R.timeU;
          sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
            #ifdef USE_INSTANCING
              vec4 ip = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
              float sw = sin(uTime * 1.3 + ip.x * 0.2 + ip.z * 0.17) * 0.06 * max(position.y - 1.5, 0.0);
              transformed.x += sw; transformed.z += sw * 0.5;
            #endif`);
        })(mat.onBeforeCompile && glow ? mat.onBeforeCompile : null);
      }
      mat.customProgramCacheKey = () => 'veg-' + type;
      const im = new THREE.InstancedMesh(this.vegGeo(type), mat, count);
      im.castShadow = type !== 'bush';
      im.receiveShadow = true;
      let placed = 0;
      for (let tries = 0; tries < count * 4 && placed < count; tries++) {
        const a = r.range(0, TAU), d = Math.sqrt(r.next()) * (F.RI - 10);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (Math.hypot(x - F.town.x, z - F.town.z) < 44) continue;
        if (Math.hypot(x - F.tower.x, z - F.tower.z) < 30) continue;
        const h = F.ground(x, z);
        if (F.water && h < F.water.level + 0.6) continue;
        const slope = Math.abs(F.ground(x + 1.5, z) - h) + Math.abs(F.ground(x, z + 1.5) - h);
        if (type !== 'rock' && slope > 1.6) continue;
        // 길 위에는 두지 않는다
        let onRoad = false;
        for (let i = 0; i < F.road.length; i += 1) { if (Math.hypot(F.road[i].x - x, F.road[i].z - z) < 7) { onRoad = true; break; } }
        if (onRoad) continue;
        // 숲 덩어리처럼 모이게: 노이즈 값이 낮으면 일부 버린다
        if (type !== 'rock' && type !== 'pillar' && fbm(n2, x * 0.012 + 7, z * 0.012, 2) < -0.15 && r.chance(0.7)) continue;
        const s = type === 'rock' ? r.range(0.5, 2.6) : r.range(0.75, 1.45);
        dummy.position.set(x, h - (type === 'rock' ? s * 0.2 : 0.05), z);
        dummy.rotation.set(type === 'rock' ? r.range(-0.3, 0.3) : 0, r.range(0, TAU), 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        im.setMatrixAt(placed, dummy.matrix);
        const tint = new THREE.Color(1, 1, 1);
        if (type === 'oak' || type === 'pine' || type === 'bush') tint.copy(leafTint).multiplyScalar(1.6).lerp(new THREE.Color(1, 1, 1), 0.35);
        if (type === 'rock' || type === 'pillar') tint.copy(rockTint);
        if (type === 'crystal') tint.setHex(T.dungeon.torch).lerp(new THREE.Color(0xffffff), 0.3);
        tint.multiplyScalar(0.85 + r.next() * 0.3);
        im.setColorAt(placed, tint);
        if (colR[type]) F.colliders.circle(x, z, colR[type] * s);
        placed++;
      }
      im.count = placed;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      group.add(im);
    }
  },

  // 마을: 성벽, 집, 광장, 전이문, NPC
  buildTown(F, r, group) {
    const T = F.T, tc = F.town, H = F.townH;
    const toTower = Math.atan2(F.tower.z - tc.z, F.tower.x - tc.x);
    const P = [];
    const add = (geo, color, m, extra = {}) => P.push(Object.assign({ geo, color, matrix: m }, extra));
    const stone = 0xa8a090;
    // 광장 포장
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(17, 48), new THREE.MeshStandardMaterial({ map: Tex.tiles('#8c867a', F.seed & 0xff), roughness: 0.9 }));
    plaza.material.map.wrapS = plaza.material.map.wrapT = THREE.RepeatWrapping; plaza.material.map.repeat.set(6, 6);
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(tc.x, H + 0.04, tc.z); plaza.receiveShadow = true;
    group.add(plaza);
    // 성벽
    const WR = 34, segs = 28;
    const gates = [toTower, toTower + Math.PI];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * TAU;
      if (gates.some((g) => Math.abs(angDiff(a, g)) < 0.2)) continue;
      const x = tc.x + Math.cos(a) * WR, z = tc.z + Math.sin(a) * WR;
      const len = (TAU * WR) / segs + 0.4;
      add(new THREE.BoxGeometry(1.6, 5.5, len), stone, M4(x, H + 2.5, z, 0, -a, 0));
      add(new THREE.BoxGeometry(2.0, 0.6, len), 0x8a8274, M4(x, H + 5.4, z, 0, -a, 0));
      for (let k = -1; k <= 1; k += 2) add(new THREE.BoxGeometry(0.6, 0.9, 1.2), 0x8a8274, M4(x + Math.cos(a) * 0.6, H + 6.1, z + Math.sin(a) * 0.6 + 0, 0, -a, 0, 1, 1, 1).premultiply(new THREE.Matrix4().makeTranslation(-Math.sin(a) * k * len * 0.25, 0, Math.cos(a) * k * len * 0.25)));
      for (let k = 0; k < 4; k++) { const t = (k / 4 - 0.375) * len; F.colliders.circle(x - Math.sin(a) * t, z + Math.cos(a) * t, 1.4); }
      if (i % 4 === 0) {
        add(new THREE.CylinderGeometry(2.3, 2.6, 9, 10), stone, M4(x, H + 4.5, z));
        add(new THREE.ConeGeometry(2.9, 3.4, 10), r.pick(T.house.roof), M4(x, H + 10.6, z));
        F.colliders.circle(x, z, 2.7);
      }
    }
    // 문 기둥
    for (const g of gates) {
      for (const s of [-1, 1]) {
        const a = g + s * 0.2;
        const x = tc.x + Math.cos(a) * WR, z = tc.z + Math.sin(a) * WR;
        add(new THREE.CylinderGeometry(1.6, 1.8, 8, 8), stone, M4(x, H + 4, z));
        add(new THREE.ConeGeometry(2.0, 2.6, 8), T.house.roof[0], M4(x, H + 9.3, z));
        F.colliders.circle(x, z, 1.9);
      }
      // 아치 위 깃발 대신 등불
      const x = tc.x + Math.cos(g) * WR, z = tc.z + Math.sin(g) * WR;
      add(new THREE.BoxGeometry(1.2, 0.8, 9.5), 0x7a7266, M4(x, H + 7.4, z, 0, -g, 0));
      add(new THREE.IcosahedronGeometry(0.35, 0), 0xffd890, M4(x, H + 6.6, z), { emissive: 1.2 });
    }
    // 집
    const npcAngles = [toTower + 0.9, toTower - 0.9, toTower + Math.PI + 0.9, toTower + Math.PI - 0.9];
    let placed = 0;
    for (let tries = 0; tries < 80 && placed < 13; tries++) {
      const a = r.range(0, TAU), d = r.range(21, 28);
      if (gates.some((g) => Math.abs(angDiff(a, g)) < 0.32)) continue;
      const x = tc.x + Math.cos(a) * d, z = tc.z + Math.sin(a) * d;
      const w = r.range(5, 7.5), dep = r.range(4.5, 6), h = r.range(3.6, 5.2);
      // 겹치지 않게
      const tmpP = { x, z };
      if (F.colliders.query(x, z, Math.max(w, dep) * 0.75, []).some((c) => c.data === 'house')) continue;
      const rot = -a + Math.PI / 2; // 광장을 바라보도록
      const wall = r.pick(T.house.wall), roof = r.pick(T.house.roof);
      const m = (lx, ly, lz) => { const c = Math.cos(rot), s = Math.sin(rot); return [x + lx * c + lz * s, H + ly, z - lx * s + lz * c]; };
      add(new THREE.BoxGeometry(w, h, dep), wall, M4(x, H + h / 2, z, 0, rot, 0));
      add(new THREE.BoxGeometry(w + 0.3, 0.4, dep + 0.3), 0x6a5a4a, M4(x, H + 0.2, z, 0, rot, 0));
      // 지붕(삼각기둥)
      const roofGeo = new THREE.CylinderGeometry(dep * 0.62, dep * 0.62, w + 0.8, 3, 1);
      add(roofGeo, roof, M4(...m(0, h + dep * 0.28, 0), 0, rot, 0).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(1, 1, 0.75)));
      // 문과 창 (광장 방향 = 로컬 -z... 회전 rot 기준 +z가 바깥)
      const fz = -dep / 2 - 0.02;
      add(new THREE.BoxGeometry(1.1, 2.0, 0.1), 0x4a3424, M4(...m(0, 1.0, fz), 0, rot, 0));
      for (const wx of [-w * 0.3, w * 0.3]) add(new THREE.BoxGeometry(0.9, 0.8, 0.1), 0xffcf7a, M4(...m(wx, h * 0.6, fz), 0, rot, 0), { emissive: 0.9 });
      add(new THREE.BoxGeometry(0.6, 1.6, 0.6), 0x8a7a6a, M4(...m(w * 0.3, h + dep * 0.4, dep * 0.15), 0, rot, 0));
      F.colliders.box(x, z, w / 2 + 0.1, dep / 2 + 0.1, rot, 'house');
      placed++;
    }
    // 가로등
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      const x = tc.x + Math.cos(a) * 15.5, z = tc.z + Math.sin(a) * 15.5;
      add(new THREE.CylinderGeometry(0.08, 0.12, 3.4, 6), 0x3a3a3a, M4(x, H + 1.7, z));
      add(new THREE.OctahedronGeometry(0.28, 0), 0xffe0a0, M4(x, H + 3.5, z), { emissive: 1.4 });
      F.colliders.circle(x, z, 0.25);
    }
    // 광장 테두리 화단
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      if (gates.some((g) => Math.abs(angDiff(a, g)) < 0.3)) continue;
      add(new THREE.BoxGeometry(0.8, 0.5, 3.6), 0x8a8274, M4(tc.x + Math.cos(a) * 18, H + 0.25, tc.z + Math.sin(a) * 18, 0, -a, 0));
      add(new THREE.IcosahedronGeometry(0.6, 0), new THREE.Color(T.grass.base).getHex(), M4(tc.x + Math.cos(a) * 18, H + 0.8, tc.z + Math.sin(a) * 18));
    }
    const geo = mergeParts(P);
    const mesh = new THREE.Mesh(geo, glowMaterial({ roughness: 0.85 }, 0xffffff, 1.2));
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);

    // 전이문 (광장 중앙)
    const gate = new THREE.Group();
    gate.position.set(tc.x, H, tc.z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 0.6, 24), new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.6, metalness: 0.1 }));
    base.position.y = 0.3; base.receiveShadow = true; gate.add(base);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xc8b070, metalness: 0.85, roughness: 0.3 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.22, 10, 40), ringMat);
    ring.position.y = 3.2; ring.castShadow = true; gate.add(ring);
    const portalMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { time: R.timeU, color: { value: new THREE.Color(T.dungeon.torch).lerp(new THREE.Color(0x88ccff), 0.6) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float time; uniform vec3 color; varying vec2 vUv;
        void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
          float sw = sin(a * 5.0 + time * 2.0 - r * 10.0) * 0.5 + 0.5;
          float v = smoothstep(1.0, 0.2, r) * (0.35 + 0.65 * sw);
          gl_FragColor = vec4(color * v * 1.4, v); }`,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.25, 40), portalMat);
    disc.position.y = 3.2; gate.add(disc);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: 0xaee8ff, emissive: 0x4ab8ff, emissiveIntensity: 1.4, roughness: 0.15, metalness: 0.2, flatShading: true }));
    crystal.position.y = 6.4; crystal.scale.set(1, 1.6, 1); gate.add(crystal);
    group.add(gate);
    F.colliders.circle(tc.x, tc.z, 3.2);
    F.animated.push((t) => { crystal.rotation.y = t * 0.8; crystal.position.y = 6.4 + Math.sin(t * 1.5) * 0.25; ring.rotation.y = t * 0.3; disc.rotation.y = t * 0.3; });
    if (R.quality !== 'low') { const pl = new THREE.PointLight(0x9ad8ff, 30, 22, 2); pl.position.set(tc.x, H + 5, tc.z); group.add(pl); }
    F.interactables.push({ kind: 'gate', x: tc.x, z: tc.z, r: 5.2, label: '전이문 사용' });

    // NPC
    NPC_ROLES.forEach((role, i) => {
      const a = npcAngles[i];
      const x = tc.x + Math.cos(a) * 10, z = tc.z + Math.sin(a) * 10;
      const npc = Ents.makeNPC(role, x, H, z, Math.atan2(tc.x - x, tc.z - z));
      group.add(npc.group);
      F.npcs.push(npc);
      // 가판대
      const stall = new THREE.Group(); stall.position.set(x, H, z); stall.rotation.y = Math.atan2(tc.x - x, tc.z - z);
      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 0.8), new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 }));
      counter.position.set(0, 0.5, 1.0); counter.castShadow = true; stall.add(counter);
      const awn = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 2.2), new THREE.MeshStandardMaterial({ color: role.color, roughness: 0.8 }));
      awn.position.set(0, 2.8, 0.4); awn.rotation.x = 0.25; awn.castShadow = true; stall.add(awn);
      for (const sx of [-1.4, 1.4]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 5), counter.material); pole.position.set(sx, 1.4, 1.3); stall.add(pole); }
      group.add(stall);
      F.colliders.circle(x, z, 0.9);
      F.colliders.box(x + Math.sin(stall.rotation.y) * 1.0, z + Math.cos(stall.rotation.y) * 1.0, 1.3, 0.4, stall.rotation.y);
      F.interactables.push({ kind: 'npc', role: role.role, x: x + Math.sin(stall.rotation.y) * 2.3, z: z + Math.cos(stall.rotation.y) * 2.3, r: 2.8, label: `${role.name}와 대화`, npc });
    });
    F.spawnPoint = { x: tc.x + Math.cos(toTower) * 7, z: tc.z + Math.sin(toTower) * 7, yaw: toTower };
  },

  // 미궁탑: 천장까지 뻗은 거대한 탑
  buildTower(F, group) {
    const T = F.T, tw = F.tower, H = F.towerH;
    const toTown = Math.atan2(F.town.z - tw.z, F.town.x - tw.x);
    const P = [];
    const add = (geo, color, m, extra = {}) => P.push(Object.assign({ geo, color, matrix: m }, extra));
    const stone = new THREE.Color(T.ground.cliff).lerp(new THREE.Color(0x9a9aa0), 0.6).getHex();
    add(new THREE.CylinderGeometry(14, 16, 340, 28, 1, false), stone, M4(tw.x, H + 165, tw.z));
    for (let y = 18; y < 320; y += 36) add(new THREE.TorusGeometry(14.6 - y * 0.002, 0.9, 6, 32), 0x7a7a80, M4(tw.x, H + y, tw.z, Math.PI / 2));
    add(new THREE.CylinderGeometry(19, 21, 3, 28), 0x6a6a70, M4(tw.x, H + 1.0, tw.z));
    // 입구 아치
    const ex = tw.x + Math.cos(toTown) * 15.4, ez = tw.z + Math.sin(toTown) * 15.4;
    add(new THREE.BoxGeometry(5.0, 8.0, 1.6), 0x0a0a10, M4(ex, H + 4.5, ez, 0, -toTown + Math.PI / 2, 0));
    add(new THREE.BoxGeometry(6.4, 0.7, 2.0), 0xd8c890, M4(ex, H + 8.8, ez, 0, -toTown + Math.PI / 2, 0), { emissive: 0.8 });
    for (const s of [-1, 1]) {
      const sx = ex + Math.cos(toTown + Math.PI / 2) * 3.0 * s, sz = ez + Math.sin(toTown + Math.PI / 2) * 3.0 * s;
      add(new THREE.BoxGeometry(0.8, 8.6, 2.0), 0xd8c890, M4(sx, H + 4.6, sz, 0, -toTown + Math.PI / 2, 0), { emissive: 0.5 });
    }
    // 빛나는 문양 띠
    for (let y = 30; y < 320; y += 36) add(new THREE.CylinderGeometry(14.25, 14.25, 0.5, 28, 1, true), T.dungeon.torch, M4(tw.x, H + y, tw.z), { emissive: 1.0 });
    const mesh = new THREE.Mesh(mergeParts(P), glowMaterial({ roughness: 0.8 }, 0xffffff, 1.4));
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    F.colliders.circle(tw.x, tw.z, 16.3);
    const dx = tw.x + Math.cos(toTown) * 18, dz = tw.z + Math.sin(toTown) * 18;
    F.interactables.push({ kind: 'tower', x: dx, z: dz, r: 4, label: '미궁으로 들어가기' });
    F.towerDoor = { x: dx, z: dz, yaw: toTown };
  },

  makeSpawns(F, r) {
    const T = F.T;
    const base = Math.max(1, BAL.rec(F.f) - 3);
    const tt = Math.hypot(F.tower.x - F.town.x, F.tower.z - F.town.z);
    const pts = [];
    for (let tries = 0; tries < 900 && pts.length < 48; tries++) {
      const a = r.range(0, TAU), d = Math.sqrt(r.next()) * (F.RI - 16);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const dTown = Math.hypot(x - F.town.x, z - F.town.z);
      if (dTown < 55 || Math.hypot(x - F.tower.x, z - F.tower.z) < 30) continue;
      if (F.water && F.ground(x, z) < F.water.level + 0.5) continue;
      if (pts.some((p) => Math.hypot(p.x - x, p.z - z) < 14)) continue;
      const zone = clamp(dTown / tt, 0, 1.25);
      const arch = r.pick(T.enemies);
      const pack = arch === 'wolf' ? r.int(2, 3) : r.chance(0.25) ? 2 : 1;
      pts.push({ x, z, level: base + Math.round(zone * 3) + r.int(0, 1), arch, pack, enemies: [], timer: 0 });
    }
    F.spawns = pts;
    // 네임드 몬스터
    let best = null, bd = 0;
    for (const p of pts) { const d = Math.hypot(p.x - F.town.x, p.z - F.town.z); if (d > bd && Math.hypot(p.x - F.tower.x, p.z - F.tower.z) > 45) { bd = d; best = p; } }
    if (best) {
      best.elite = true; best.pack = 1; best.level += 2;
      best.eliteName = makeName(new RNG(F.seed ^ 0xe11e), SYL_BOSS, 2, 3);
    }
  },

  renderMinimap(F, cols) {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'); const img = g.createImageData(S, S);
    const N = F.SEG + 1;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const wx = (x / S - 0.5) * F.SIZE, wz = (y / S - 0.5) * F.SIZE;
      const ix = Math.round((wx + F.SIZE / 2) / F.cell), iz = Math.round((wz + F.SIZE / 2) / F.cell);
      const i = clamp(iz, 0, N - 1) * N + clamp(ix, 0, N - 1);
      let rr = cols[i * 3], gg = cols[i * 3 + 1], bb = cols[i * 3 + 2];
      const h = F.heights[i];
      if (F.water && h < F.water.level) { const wc = new THREE.Color(F.water.color); rr = wc.r; gg = wc.g; bb = wc.b; }
      const shade = 0.75 + clamp((h - F.minH) / (F.maxH - F.minH + 1e-3), 0, 1) * 0.45;
      const o = (y * S + x) * 4;
      const out = Math.hypot(wx, wz) > F.RI;
      img.data[o] = out ? 10 : Math.pow(rr, 1 / 2.2) * 255 * shade; img.data[o + 1] = out ? 14 : Math.pow(gg, 1 / 2.2) * 255 * shade; img.data[o + 2] = out ? 22 : Math.pow(bb, 1 / 2.2) * 255 * shade; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const toPx = (v) => (v / F.SIZE + 0.5) * S;
    g.strokeStyle = 'rgba(255,240,200,0.9)'; g.lineWidth = 2; g.beginPath(); g.arc(toPx(F.town.x), toPx(F.town.z), (34 / F.SIZE) * S, 0, TAU); g.stroke();
    g.fillStyle = '#d8c890'; g.beginPath(); g.arc(toPx(F.tower.x), toPx(F.tower.z), (16 / F.SIZE) * S, 0, TAU); g.fill();
    return c;
  },

  // -------------------------------------------------------------------------
  // 미궁
  // -------------------------------------------------------------------------
  buildDungeon(f) {
    const T = themeForFloor(f), seed = floorSeed(f) ^ 0xd00d, r = new RNG(seed);
    const W = clamp(6 + Math.floor(f / 10), 6, 14), H = W, CS = 10;
    const ox = -W * CS / 2;
    const cellC = (i, j) => ({ x: ox + (i + 0.5) * CS, z: (j + 0.5) * CS });
    // 벽 배열: h[j][i] = (i,j) 셀의 남쪽 벽(j=0..H), v[j][i] = 서쪽 벽(i=0..W)
    const hw = [], vw = [];
    for (let j = 0; j <= H; j++) { hw.push(new Array(W).fill(true)); }
    for (let j = 0; j < H; j++) { vw.push(new Array(W + 1).fill(true)); }
    const visited = []; for (let j = 0; j < H; j++) visited.push(new Array(W).fill(false));
    const start = { i: Math.floor(W / 2), j: 0 };
    const stack = [start]; visited[0][start.i] = true;
    while (stack.length) {
      const c = stack[stack.length - 1];
      const nb = [];
      if (c.j > 0 && !visited[c.j - 1][c.i]) nb.push([c.i, c.j - 1, 'S']);
      if (c.j < H - 1 && !visited[c.j + 1][c.i]) nb.push([c.i, c.j + 1, 'N']);
      if (c.i > 0 && !visited[c.j][c.i - 1]) nb.push([c.i - 1, c.j, 'W']);
      if (c.i < W - 1 && !visited[c.j][c.i + 1]) nb.push([c.i + 1, c.j, 'E']);
      if (!nb.length) { stack.pop(); continue; }
      const [ni, nj, d] = r.pick(nb);
      if (d === 'S') hw[c.j][c.i] = false; if (d === 'N') hw[c.j + 1][c.i] = false;
      if (d === 'W') vw[c.j][c.i] = false; if (d === 'E') vw[c.j][c.i + 1] = false;
      visited[nj][ni] = true; stack.push({ i: ni, j: nj });
    }
    // 고리와 넓은 방을 만들어 덜 답답하게
    for (let j = 1; j < H; j++) for (let i = 0; i < W; i++) if (hw[j][i] && r.chance(0.12)) hw[j][i] = false;
    for (let j = 0; j < H; j++) for (let i = 1; i < W; i++) if (vw[j][i] && r.chance(0.12)) vw[j][i] = false;
    for (let k = 0; k < 2 + Math.floor(W / 5); k++) {
      const i = r.int(0, W - 2), j = r.int(1, H - 2);
      vw[j][i + 1] = false; vw[j + 1][i + 1] = false; hw[j + 1][i] = false; hw[j + 1][i + 1] = false;
    }
    hw[0][start.i] = false; // 입구
    // BFS로 가장 먼 북쪽 셀에 보스방
    const dist = []; for (let j = 0; j < H; j++) dist.push(new Array(W).fill(-1));
    const qq = [[start.i, 0]]; dist[0][start.i] = 0;
    while (qq.length) {
      const [i, j] = qq.shift(); const d = dist[j][i];
      const tryGo = (ni, nj, open) => { if (open && ni >= 0 && nj >= 0 && ni < W && nj < H && dist[nj][ni] < 0) { dist[nj][ni] = d + 1; qq.push([ni, nj]); } };
      tryGo(i, j - 1, j > 0 && !hw[j][i]); tryGo(i, j + 1, j < H - 1 && !hw[j + 1][i]);
      tryGo(i - 1, j, !vw[j][i]); tryGo(i + 1, j, !vw[j][i + 1]);
    }
    let bossI = 0, bd = -1;
    for (let i = 0; i < W; i++) if (dist[H - 1][i] > bd) { bd = dist[H - 1][i]; bossI = i; }
    hw[H][bossI] = false;
    const arena = { x: ox + (bossI + 0.5) * CS, z: H * CS + 5 + 17, r: 17 };

    const group = new THREE.Group(); group.name = 'dungeon';
    const colliders = new ColGrid(8);
    const wallTex = Tex.stone('#' + new THREE.Color(T.dungeon.wall).getHexString(), seed & 0xff);
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(2, 1);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
    const walls = [];
    for (let j = 0; j <= H; j++) for (let i = 0; i < W; i++) if (hw[j][i]) walls.push([ox + (i + 0.5) * CS, j * CS, 0]);
    for (let j = 0; j < H; j++) for (let i = 0; i <= W; i++) if (vw[j][i]) walls.push([ox + i * CS, (j + 0.5) * CS, Math.PI / 2]);
    const wallH = 7.5;
    const wallGeo = new THREE.BoxGeometry(CS + 1, wallH, 1.2);
    const wim = new THREE.InstancedMesh(wallGeo, wallMat, walls.length);
    const dm = new THREE.Object3D();
    walls.forEach(([x, z, rot], k) => {
      dm.position.set(x, wallH / 2, z); dm.rotation.set(0, rot, 0); dm.updateMatrix(); wim.setMatrixAt(k, dm.matrix);
      colliders.box(x, z, (CS + 1) / 2, 0.6, rot);
    });
    wim.receiveShadow = true;
    group.add(wim);
    // 기둥
    const pillars = [];
    for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) pillars.push([ox + i * CS, j * CS]);
    const pim = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, wallH + 0.6, 1.8), new THREE.MeshStandardMaterial({ map: wallTex, color: 0xcfcfcf, roughness: 0.9 }), pillars.length);
    pillars.forEach(([x, z], k) => { dm.position.set(x, (wallH + 0.6) / 2, z); dm.rotation.set(0, 0, 0); dm.updateMatrix(); pim.setMatrixAt(k, dm.matrix); });
    group.add(pim);
    // 바닥과 천장
    const floorTex = Tex.tiles('#' + new THREE.Color(T.dungeon.floor).getHexString(), seed & 0x7f);
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(W * 2.5, (H + 5) * 2.5);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * CS + 2, (H + 5) * CS), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (H + 5) * CS / 2 - 2); floor.receiveShadow = true;
    group.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W * CS + 2, H * CS + 7), new THREE.MeshStandardMaterial({ color: new THREE.Color(T.dungeon.wall).multiplyScalar(0.4), roughness: 1 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, wallH, (H * CS + 7) / 2 - 1.5);
    group.add(ceil);
    // 보스방
    const ag = new THREE.Group(); ag.position.set(arena.x, 0, arena.z);
    const arenaWall = new THREE.Mesh(new THREE.CylinderGeometry(arena.r + 0.5, arena.r + 0.5, 14, 40, 1, true), new THREE.MeshStandardMaterial({ map: wallTex, side: THREE.BackSide, roughness: 0.9 }));
    arenaWall.position.y = 7; ag.add(arenaWall);
    const arenaCeil = new THREE.Mesh(new THREE.CircleGeometry(arena.r + 0.6, 40), ceil.material);
    arenaCeil.rotation.x = Math.PI / 2; arenaCeil.position.y = 14; ag.add(arenaCeil);
    const sigil = new THREE.Mesh(new THREE.RingGeometry(arena.r * 0.55, arena.r * 0.6, 48), new THREE.MeshBasicMaterial({ color: T.dungeon.torch, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    sigil.rotation.x = -Math.PI / 2; sigil.position.y = 0.03; ag.add(sigil);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU; if (Math.abs(angDiff(a, -Math.PI / 2)) < 0.4) continue;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 14, 10), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 }));
      p.position.set(Math.cos(a) * (arena.r - 1.5), 7, Math.sin(a) * (arena.r - 1.5)); p.castShadow = true; ag.add(p);
      colliders.circle(arena.x + Math.cos(a) * (arena.r - 1.5), arena.z + Math.sin(a) * (arena.r - 1.5), 1.1);
    }
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * TAU; if (Math.abs(angDiff(a, -Math.PI / 2)) < 0.17) continue;
      colliders.circle(arena.x + Math.cos(a) * (arena.r + 1.2), arena.z + Math.sin(a) * (arena.r + 1.2), 1.4);
    }
    group.add(ag);
    // 보스방 통로와 문
    const corrZ0 = H * CS, corrZ1 = arena.z - arena.r + 0.5;
    for (const s of [-1, 1]) {
      const x = arena.x + s * 3.2;
      const cw = new THREE.Mesh(new THREE.BoxGeometry(1.2, wallH, corrZ1 - corrZ0 + 1), wallMat);
      cw.position.set(x, wallH / 2, (corrZ0 + corrZ1) / 2); group.add(cw);
      colliders.box(x, (corrZ0 + corrZ1) / 2, 0.6, (corrZ1 - corrZ0 + 1) / 2, 0);
    }
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.6, metalness: 0.3, emissive: T.dungeon.torch, emissiveIntensity: 0.15 });
    const doorL = new THREE.Mesh(new THREE.BoxGeometry(2.6, 6.2, 0.4), doorMat), doorR = doorL.clone();
    doorL.position.set(arena.x - 1.3, 3.1, corrZ0 + 1.5); doorR.position.set(arena.x + 1.3, 3.1, corrZ0 + 1.5);
    group.add(doorL, doorR);
    const doorCol = colliders.box(arena.x, corrZ0 + 1.5, 2.6, 0.4, 0, 'door');
    // 출구(입구 바깥쪽)
    const sc = cellC(start.i, 0);
    const exitPortal = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    exitPortal.position.set(sc.x, 2.6, 0.7); group.add(exitPortal);
    colliders.box(sc.x, 0, 4, 0.6, 0);

    // 횃불
    const torchPos = [];
    const flameMat = new THREE.SpriteMaterial({ map: Tex.text('●', '#ffffff', 64, false), color: T.dungeon.torch, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    walls.forEach(([x, z, rot]) => {
      if (!r.chance(0.35)) return;
      const side = r.chance(0.5) ? 1 : -1;
      const nx = rot === 0 ? 0 : side, nz = rot === 0 ? side : 0;
      const tx = x + nx * 0.75, tz = z + nz * 0.75;
      if (tx < ox + 0.2 || tx > -ox - 0.2 || tz < 0.2 || tz > H * CS - 0.2) return;
      torchPos.push(new THREE.Vector3(tx, 3.4, tz));
    });
    const bracket = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.14, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x2a2420 }), Math.max(1, torchPos.length));
    torchPos.forEach((p, k) => { dm.position.set(p.x, p.y - 0.35, p.z); dm.rotation.set(0, 0, 0); dm.updateMatrix(); bracket.setMatrixAt(k, dm.matrix); });
    bracket.count = torchPos.length; group.add(bracket);
    const flames = [];
    for (const p of torchPos) { const s = new THREE.Sprite(flameMat); s.position.copy(p); s.scale.set(0.5, 0.7, 1); group.add(s); flames.push(s); }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; const p = new THREE.Vector3(arena.x + Math.cos(a) * (arena.r - 3.2), 4, arena.z + Math.sin(a) * (arena.r - 3.2)); const s = new THREE.Sprite(flameMat); s.position.copy(p); s.scale.set(0.8, 1.1, 1); group.add(s); flames.push(s); torchPos.push(p); }
    const lights = [];
    const nL = R.quality === 'low' ? 3 : 6;
    for (let k = 0; k < nL; k++) { const l = new THREE.PointLight(T.dungeon.torch, 0, 18, 1.6); group.add(l); lights.push(l); }

    // 상자와 몬스터
    const chests = [];
    const deadEnds = [];
    for (let j = 1; j < H; j++) for (let i = 0; i < W; i++) {
      const wallsN = (hw[j][i] ? 1 : 0) + (hw[j + 1] && hw[j + 1][i] ? 1 : 0) + (vw[j][i] ? 1 : 0) + (vw[j][i + 1] ? 1 : 0);
      if (wallsN >= 3 && !(j === H - 1 && i === bossI)) deadEnds.push([i, j]);
    }
    const nChest = Math.min(deadEnds.length, 2 + Math.floor(f / 15));
    for (let k = 0; k < nChest; k++) {
      const [i, j] = deadEnds.splice(r.int(0, deadEnds.length - 1), 1)[0];
      const c = cellC(i, j);
      const chest = Ents.makeChest(c.x, 0, c.z);
      group.add(chest.group);
      colliders.box(c.x, c.z, 0.7, 0.5, 0);
      chests.push(chest);
    }
    const spawns = [];
    const lvl = BAL.rec(f);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (j <= 1 && Math.abs(i - start.i) <= 1) continue;
      if (!r.chance(0.42)) continue;
      const c = cellC(i, j);
      spawns.push({ x: c.x + r.range(-2, 2), z: c.z + r.range(-2, 2), level: lvl + r.int(0, 2), arch: r.pick(T.enemies), pack: r.chance(0.3) ? 2 : 1, enemies: [], timer: 0, noRespawn: true });
    }
    const D = {
      f, T, group, colliders, W, H, CS, ox, hw, vw, start, bossI, arena, walls, spawns, chests, flames, torchPos, lights,
      doorL, doorR, doorCol, doorOpen: false, explored: [],
      ground: () => 0,
      bounds: (x, z) => z > -1 && z < arena.z + arena.r + 2 && Math.abs(x) < W * CS / 2 + 2,
      entry: { x: sc.x, z: 4, yaw: Math.PI / 2 },
      exit: { x: sc.x, z: 1.6 },
      interactables: [],
      animated: [],
      water: null,
    };
    for (let j = 0; j < H; j++) D.explored.push(new Array(W).fill(false));
    D.interactables.push({ kind: 'exit', x: sc.x, z: 2.2, r: 2.6, label: '미궁에서 나가기' });
    D.interactables.push({ kind: 'bossdoor', x: arena.x, z: corrZ0 - 1.5, r: 3.2, label: '보스방 문 열기' });
    for (const c of chests) D.interactables.push({ kind: 'chest', x: c.x, z: c.z, r: 2.4, label: '상자 열기', chest: c });
    D.animated.push((t) => {
      for (let k = 0; k < flames.length; k++) { const s = flames[k]; const f2 = 0.85 + Math.sin(t * 13 + k * 7.1) * 0.08 + Math.sin(t * 7.3 + k) * 0.07; s.scale.set(0.5 * f2 * (k >= flames.length - 8 ? 1.6 : 1), 0.7 * f2 * (k >= flames.length - 8 ? 1.6 : 1), 1); }
      sigil.material.opacity = 0.35 + Math.sin(t * 1.5) * 0.15;
      exitPortal.material.opacity = 0.45 + Math.sin(t * 2) * 0.15;
      if (D.doorOpen) { doorL.position.x = lerp(doorL.position.x, arena.x - 3.9, 0.05); doorR.position.x = lerp(doorR.position.x, arena.x + 3.9, 0.05); }
    });
    return D;
  },
  // 가장 가까운 횃불로 점광원을 옮긴다
  updateDungeonLights(D, px, pz) {
    if (!D || !D.lights.length) return;
    const sorted = D.torchPos.map((p) => [p, (p.x - px) ** 2 + (p.z - pz) ** 2]).sort((a, b) => a[1] - b[1]);
    D.lights.forEach((l, k) => {
      const s = sorted[k];
      if (!s || s[1] > 30 * 30) { l.intensity = 0; return; }
      l.position.copy(s[0]); l.position.y -= 0.2;
      l.intensity = 16 * (0.9 + Math.sin(G.time * 11 + k * 3) * 0.1);
    });
  },
  dungeonCell(D, x, z) {
    const i = Math.floor((x - D.ox) / D.CS), j = Math.floor(z / D.CS);
    if (i < 0 || j < 0 || i >= D.W || j >= D.H) return null;
    return [i, j];
  },
};
