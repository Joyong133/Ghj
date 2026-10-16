// ---------------------------------------------------------------------------
// 지형: 가까운 곳은 z15 타일(약 1km, 위성사진 z16~17), 먼 곳은 z12 타일(약 8km).
// 가까운 타일이 준비되면 먼 타일의 해당 칸을 비워 겹치지 않게 한다.
// ---------------------------------------------------------------------------
const Terrain = {
  NZ: 15, FZ: 12, NG: 40, FG: 32,
  near: new Map(), far: new Map(), elev: new Map(),
  dayColor: new THREE.Color(1, 1, 1),
  treeGeo: null,

  key(z, x, y) { return z + '/' + x + '/' + y; },
  nearRadius() { const q = R.quality; return (q === 'high' ? 1250 : q === 'medium' ? 1000 : 750); },

  // ---------------- 고도
  async getElev(z, x, y) {
    const k = this.key(z, x, y);
    let e = this.elev.get(k);
    if (e) return e;
    const arr = await Net.heights(z, x, y);
    e = { arr, b: GEO.tileBounds(z, x, y), z, x, y };
    this.elev.set(k, e);
    if (this.elev.size > 120) { const first = this.elev.keys().next().value; this.elev.delete(first); }
    return e;
  },
  sampleTile(e, x, z) {
    const b = e.b;
    let u = ((x - b.x0) / (b.x1 - b.x0)) * 256 - 0.5, v = ((z - b.z0) / (b.z1 - b.z0)) * 256 - 0.5;
    u = clamp(u, 0, 254.999); v = clamp(v, 0, 254.999);
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, a = e.arr;
    const h = lerp(lerp(a[j * 256 + i], a[j * 256 + i + 1], fu), lerp(a[(j + 1) * 256 + i], a[(j + 1) * 256 + i + 1], fu), fv);
    return h < 0 ? -3 : h;
  },
  // 게임에서 쓰는 지면 높이 (해수면 아래는 -3)
  heightAt(x, z) {
    const lat = GEO.lat(z), lon = GEO.lon(x);
    for (const zz of [14, 12]) {
      const e = this.elev.get(this.key(zz, GEO.tileX(lon, zz), GEO.tileY(lat, zz)));
      if (e) return this.sampleTile(e, x, z);
    }
    return 0;
  },

  // ---------------- 갱신
  update(px, pz, alt) {
    const lat = GEO.lat(pz), lon = GEO.lon(px);
    // 가까운 타일
    const rn = this.nearRadius() + clamp(alt * 0.6, 0, 700);
    const need = new Set();
    const cx = GEO.tileX(lon, this.NZ), cy = GEO.tileY(lat, this.NZ);
    const span = Math.ceil(rn / 900) + 1;
    for (let dy = -span; dy <= span; dy++) for (let dx = -span; dx <= span; dx++) {
      const x = cx + dx, y = cy + dy;
      const b = GEO.tileBounds(this.NZ, x, y);
      const d = this.rectDist(px, pz, b);
      if (d > rn) continue;
      const k = this.key(this.NZ, x, y);
      need.add(k);
      if (!this.near.has(k)) this.loadNear(x, y, k);
    }
    for (const [k, t] of this.near) {
      if (need.has(k)) continue;
      if (this.rectDist(px, pz, t.b) > rn + 450) this.unloadNear(k, t);
    }
    // 먼 타일
    const rf = 20000 + clamp(alt * 8, 0, 14000);
    const fx = GEO.tileX(lon, this.FZ), fy = GEO.tileY(lat, this.FZ);
    const fspan = Math.ceil(rf / 7000) + 1;
    for (let dy = -fspan; dy <= fspan; dy++) for (let dx = -fspan; dx <= fspan; dx++) {
      const x = fx + dx, y = fy + dy;
      const b = GEO.tileBounds(this.FZ, x, y);
      if (this.rectDist(px, pz, b) > rf) continue;
      if (b.e < REGION.w - 0.4 || b.w > REGION.e + 0.4 || b.n < REGION.s - 0.3 || b.s > REGION.n + 0.3) continue;
      const k = this.key(this.FZ, x, y);
      if (!this.far.has(k)) this.loadFar(x, y, k);
    }
    for (const [k, t] of this.far) if (this.rectDist(px, pz, t.b) > rf + 9000) { this.disposeTile(t); this.far.delete(k); }
  },
  rectDist(px, pz, b) {
    const dx = Math.max(b.x0 - px, 0, px - b.x1), dz = Math.max(b.z0 - pz, 0, pz - b.z1);
    return Math.hypot(dx, dz);
  },
  pending() { let n = 0; for (const t of this.near.values()) if (!t.ready) n++; for (const t of this.far.values()) if (!t.ready) n++; return n; },

  // 격자 메시 (가장자리에 아래로 내린 치마를 붙여 틈을 가린다)
  buildGrid(b, G, sample, drop = 0) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const n = (G + 1) * (G + 1);
    const skirt = 4 * (G + 1);
    const pos = new Float32Array((n + skirt) * 3), uv = new Float32Array((n + skirt) * 2);
    const hs = new Float32Array(n);
    for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
      const k = j * (G + 1) + i;
      const x = lerp(b.x0, b.x1, i / G), z = lerp(b.z0, b.z1, j / G);
      const h = sample(x, z) - drop;
      hs[k] = h;
      pos[k * 3] = x - cx; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z - cz;
      uv[k * 2] = i / G; uv[k * 2 + 1] = 1 - j / G;
    }
    const idx = [];
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const a = j * (G + 1) + i, bb = a + 1, c = a + G + 1, d = c + 1;
      idx.push(a, c, bb, bb, c, d);
    }
    // 치마
    let s = n;
    const edge = [];
    for (let i = 0; i <= G; i++) edge.push(i);
    for (let j = 1; j <= G; j++) edge.push(j * (G + 1) + G);
    for (let i = G - 1; i >= 0; i--) edge.push(G * (G + 1) + i);
    for (let j = G - 1; j >= 1; j--) edge.push(j * (G + 1));
    edge.push(0);
    const sk = new Float32Array((edge.length) * 3), skuv = new Float32Array(edge.length * 2);
    const base = [];
    for (let e = 0; e < edge.length; e++) {
      const k = edge[e];
      sk[e * 3] = pos[k * 3]; sk[e * 3 + 1] = pos[k * 3 + 1] - 25; sk[e * 3 + 2] = pos[k * 3 + 2];
      skuv[e * 2] = uv[k * 2]; skuv[e * 2 + 1] = uv[k * 2 + 1];
      base.push(k);
    }
    const P = new Float32Array(n * 3 + sk.length), U = new Float32Array(n * 2 + skuv.length);
    P.set(pos.subarray(0, n * 3)); P.set(sk, n * 3); U.set(uv.subarray(0, n * 2)); U.set(skuv, n * 2);
    for (let e = 0; e < edge.length - 1; e++) {
      const a = base[e], bb = base[e + 1], c = n + e, d = n + e + 1;
      idx.push(a, bb, c, bb, d, c, a, c, bb, bb, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.userData.mainIndexCount = G * G * 6;
    return { geo, hs, cx, cz };
  },
  makeMaterial() {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
    m.color = this.dayColor; // 모든 지형이 같은 밝기(시간대)를 공유
    return m;
  },

  async loadNear(x, y, k) {
    const b = GEO.tileBounds(this.NZ, x, y);
    const t = { k, x, y, b, ready: false, dead: false };
    this.near.set(k, t);
    const e = await this.getElev(14, x >> 1, y >> 1);
    if (t.dead) return;
    const { geo, hs, cx, cz } = this.buildGrid(b, this.NG, (wx, wz) => this.sampleTile(e, wx, wz));
    t.hs = hs; t.cx = cx; t.cz = cz;
    const mat = this.makeMaterial();
    mat.map = null;
    mat.vertexColors = false;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, 0, cz);
    mesh.visible = false; // 사진이 오기 전에는 숨겨 먼 타일이 보이게
    R.world.add(mesh);
    t.mesh = mesh;
    const d = R.quality === 'high' ? 2 : 1;
    const canvas = await Net.imagery(this.NZ, x, y, d);
    if (t.dead) { mesh.removeFromParent(); geo.dispose(); mat.dispose(); return; }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true;
    mat.map = tex; mat.needsUpdate = true;
    mesh.visible = true;
    t.ready = true;
    this.updateHoles(x >> 3, y >> 3);
    if (canvas.ok) this.plantTrees(t, canvas);
    City.requestTile(t);
  },
  unloadNear(k, t) {
    t.dead = true;
    this.disposeTile(t);
    this.near.delete(k);
    City.unloadTile(t);
    this.updateHoles(t.x >> 3, t.y >> 3);
  },
  disposeTile(t) {
    t.dead = true;
    for (const m of [t.mesh, t.trees]) {
      if (!m) continue;
      m.removeFromParent();
      if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
      if (m.material && m !== t.trees) { if (m.material.map) m.material.map.dispose(); m.material.dispose(); }
    }
  },
  async loadFar(x, y, k) {
    const b = GEO.tileBounds(this.FZ, x, y);
    const t = { k, x, y, b, ready: false, dead: false };
    this.far.set(k, t);
    const e = await this.getElev(this.FZ, x, y);
    if (t.dead) return;
    const { geo } = this.buildGrid(b, this.FG, (wx, wz) => this.sampleTile(e, wx, wz), 0.6);
    const mat = this.makeMaterial();
    const canvas = await Net.imagery(this.FZ, x, y, 1);
    if (t.dead) { geo.dispose(); mat.dispose(); return; }
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    mat.map = tex;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
    mesh.renderOrder = -1;
    R.world.add(mesh);
    t.mesh = mesh; t.ready = true;
    t.fullIndex = geo.index.array.slice();
    this.updateHoles(x, y);
  },
  // 먼 타일에서 가까운 타일이 덮는 칸을 뺀다 (z12 한 칸 = z15 타일 8×8, 격자 32 → z15 타일당 4칸)
  updateHoles(fx, fy) {
    const t = this.far.get(this.key(this.FZ, fx, fy));
    if (!t || !t.mesh) return;
    const G = this.FG, per = G / 8;
    const full = t.fullIndex, main = G * G * 6;
    const out = [];
    for (let cj = 0; cj < G; cj++) for (let ci = 0; ci < G; ci++) {
      const nx = fx * 8 + Math.floor(ci / per), ny = fy * 8 + Math.floor(cj / per);
      const n = this.near.get(this.key(this.NZ, nx, ny));
      if (n && n.ready) continue;
      const o = (cj * G + ci) * 6;
      for (let q = 0; q < 6; q++) out.push(full[o + q]);
    }
    for (let i = main; i < full.length; i++) out.push(full[i]);
    t.mesh.geometry.setIndex(out);
  },

  // 위성 사진에서 짙은 초록 부분에 나무를 심는다
  plantTrees(t, canvas) {
    try {
      if (!this.treeGeo) {
        const parts = [];
        const trunk = new THREE.CylinderGeometry(0.18, 0.28, 2.2, 5).toNonIndexed(); trunk.translate(0, 1.1, 0);
        const crown = new THREE.IcosahedronGeometry(2.2, 0); crown.scale(1, 1.25, 1); crown.translate(0, 4.2, 0);
        const paint = (g, c) => { const col = new Float32Array(g.attributes.position.count * 3); const cc = new THREE.Color(c); for (let i = 0; i < col.length; i += 3) { col[i] = cc.r; col[i + 1] = cc.g; col[i + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); return g; };
        parts.push(paint(trunk, 0x5a4232), paint(crown, 0x3d6a2c));
        const pos = [], nor = [], col = [];
        for (const p of parts) { pos.push(...p.attributes.position.array); col.push(...p.attributes.color.array); }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.computeVertexNormals();
        g.userData.shared = true;
        this.treeGeo = g;
      }
      const W = canvas.width;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      const data = g.getImageData(0, 0, W, W).data;
      const max = R.quality === 'high' ? 1400 : 500;
      const rnd = mulberry32(t.x * 73856093 ^ t.y * 19349663);
      const mats = [];
      const dummy = new THREE.Object3D();
      for (let tries = 0; tries < max * 6 && mats.length < max; tries++) {
        const u = rnd(), v = rnd();
        const px = Math.floor(u * W), py = Math.floor(v * W);
        const o = (py * W + px) * 4, r = data[o], gg = data[o + 1], bb = data[o + 2];
        if (!(gg > r * 1.06 && gg > bb * 1.08 && gg < 150 && r + gg + bb > 60)) continue;
        const x = lerp(t.b.x0, t.b.x1, u), z = lerp(t.b.z0, t.b.z1, v);
        const h = this.heightAt(x, z);
        if (h < 1.5) continue;
        if (City.insideBuilding(x, z)) continue;
        const s = 0.7 + rnd() * 0.8;
        dummy.position.set(x - t.cx, h - 0.2, z - t.cz); dummy.rotation.set(0, rnd() * TAU, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
        mats.push(dummy.matrix.clone());
      }
      if (!mats.length) return;
      const im = new THREE.InstancedMesh(this.treeGeo, Mats.tree, mats.length);
      mats.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, new THREE.Color().setHSL(0.25 + rnd() * 0.08, 0.35 + rnd() * 0.2, 0.55 + rnd() * 0.25)); });
      im.position.set(t.cx, 0, t.cz);
      R.world.add(im);
      t.trees = im;
    } catch (e) { /* CORS 등으로 픽셀을 못 읽으면 나무 없이 */ }
  },
};
