// ---------------------------------------------------------------------------
// 거리 시설(보도, 가로등, 가로수, 횡단보도, 신호등), 옥상 시설, 항만(컨테이너, 크레인),
// 탑과 등대, 다리 주탑과 케이블, 바다의 배, 보행자, 갈매기
// ---------------------------------------------------------------------------
const Decor = {
  geo: {},
  newInst() { return { boxes: [], tanks: [], crosses: [], piers: [], stops: [], lights: [], trees: [], stripes: [], signals: [], containers: [], cranes: [], lamps: [], oil: [] }; },

  // ---------------- 공유 지오메트리
  merged(parts) {
    const p = [], c = [];
    for (const [g, col] of parts) {
      const n = g.index ? g.toNonIndexed() : g;
      p.push(...n.attributes.position.array);
      const cc = new THREE.Color(col);
      for (let i = 0; i < n.attributes.position.count; i++) c.push(cc.r, cc.g, cc.b);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    out.computeVertexNormals();
    out.userData.shared = true;
    return out;
  },
  box(w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; },
  cyl(r1, r2, h, x = 0, y = 0, z = 0, seg = 8) { const g = new THREE.CylinderGeometry(r1, r2, h, seg); g.translate(x, y + h / 2, z); return g; },
  G(name) {
    if (this.geo[name]) return this.geo[name];
    let g;
    switch (name) {
      case 'unitBox': g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); break;
      case 'unitCyl': g = new THREE.CylinderGeometry(1, 1, 1, 12); g.translate(0, 0.5, 0); break;
      case 'pier': g = new THREE.CylinderGeometry(1, 1, 1, 8); g.translate(0, 0.5, 0); break;
      // 가로등: 기둥 + 도로 쪽(+x) 팔
      case 'lightPole': g = this.merged([[this.cyl(0.09, 0.13, 8.5), 0x6a7078], [this.box(2.2, 0.12, 0.12, 1.05, 8.4, 0), 0x6a7078]]); break;
      case 'lightHead': g = new THREE.BoxGeometry(0.7, 0.18, 0.32); g.translate(2.05, 8.3, 0); break;
      case 'trunk': g = new THREE.CylinderGeometry(0.12, 0.18, 3.4, 5, 1, true); g.translate(0, 1.7, 0); break;
      case 'crown': {
        // 잎 덩어리 셋(큰 것은 면 80개, 작은 것은 20개)을 겹치고 꼭짓점을 흔든다. 법선은 덩어리 중심에서 바깥으로(부드럽게),
        // 잎 무늬 텍스처를 입히고 아래쪽은 조금 어둡게. 한 그루 120면
        const rnd = mulberry32(31), P = [], N = [], U = [];
        for (const [x, y, z, r, det] of [[0, 5.0, 0, 1.8, 1], [0.9, 4.3, 0.4, 1.3, 0], [-0.75, 4.4, -0.5, 1.35, 0]]) {
          let b = new THREE.IcosahedronGeometry(r, det); if (b.index) b = b.toNonIndexed();
          const pa = b.attributes.position, ua = b.attributes.uv;
          const jit = new Map(); // 같은 꼭짓점은 같은 만큼 흔들어 틈이 생기지 않게
          for (let i = 0; i < pa.count; i++) {
            const px = pa.getX(i), py = pa.getY(i), pz = pa.getZ(i), key = `${px.toFixed(3)},${py.toFixed(3)},${pz.toFixed(3)}`;
            if (!jit.has(key)) jit.set(key, 1 + (rnd() - 0.5) * 0.3);
            const k = jit.get(key), l = Math.hypot(px, py, pz) || 1;
            P.push(px * k + x, py * k * 1.1 + y, pz * k + z); N.push(px / l, py / l, pz / l); U.push(ua.getX(i) * 3, ua.getY(i) * 2);
          }
        }
        g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
        const col = new Float32Array(P.length);
        for (let i = 0; i < P.length; i += 3) { const v = clamp(0.62 + (P[i + 1] - 3) * 0.14, 0.62, 1.05); col[i] = col[i + 1] = col[i + 2] = v; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        break;
      }
      case 'stripe': g = new THREE.PlaneGeometry(0.5, 3.0); g.rotateX(-Math.PI / 2); g.translate(0, 0.03, 0); break;
      case 'signal': g = this.merged([[this.cyl(0.11, 0.13, 6.2), 0x55595e], [this.box(5, 0.16, 0.16, 2.4, 6.0, 0), 0x55595e], [this.box(1.3, 0.42, 0.38, 4.2, 5.7, 0), 0x22262a], [this.box(0.3, 0.3, 0.05, 3.8, 5.7, 0.2), 0xff3a2a], [this.box(0.3, 0.3, 0.05, 4.2, 5.7, 0.2), 0x705a20], [this.box(0.3, 0.3, 0.05, 4.6, 5.7, 0.2), 0x206a3a]]); break;
      case 'stop': g = this.merged([[this.cyl(0.05, 0.05, 2.6), 0x8a9098], [this.box(0.7, 0.45, 0.05, 0, 2.45, 0), 0x1e64c8], [this.box(3.2, 0.1, 1.5, 1.4, 2.5, 0.5), 0x9aa8b4], [this.box(3.2, 1.8, 0.05, 1.4, 1.5, 1.2), 0xa8c0d0], [this.box(2.6, 0.08, 0.4, 1.4, 0.45, 0.95), 0x5a6068]]); break;
      case 'crossTower': g = this.merged([[this.box(1.2, 5, 1.2, 0, 2.5, 0), 0xe8e4dc], [this.cyl(0.3, 0.1, 1.2, 0, 5, 0), 0x9a9890]]); break;
      case 'cross': g = this.merged([[this.box(0.35, 3.2, 0.35, 0, 7.6, 0), 0xffffff], [this.box(1.8, 0.35, 0.35, 0, 8.4, 0), 0xffffff]]); break;
      case 'container': g = new THREE.BoxGeometry(12.2, 2.55, 2.45); g.translate(0, 1.275, 0); break;
      case 'crane': {
        // 안벽 컨테이너 크레인: 다리 넷, 위쪽 들보, 바다로 뻗은 붐(+z)
        const col = 0xd8402a, white = 0xe8e8e4;
        const P = [];
        for (const sx of [-8, 8]) for (const sz of [-10, 10]) P.push([this.box(1.6, 44, 1.6, sx, 22, sz), col]);
        for (const sz of [-10, 10]) P.push([this.box(18, 2, 1.8, 0, 44, sz), col]);
        for (const sx of [-8, 8]) P.push([this.box(1.8, 2, 22, sx, 30, 0), col]);
        P.push([this.box(6, 3.5, 90, 0, 48, 25), col]);
        P.push([this.box(4, 3, 5, 0, 44, 12), white]);
        P.push([this.box(8, 8, 8, 0, 54, -8), white]);
        for (const sx of [-2.5, 2.5]) P.push([this.box(0.4, 0.4, 60, sx, 66, 8, 0.3, 0, 0), col]);
        P.push([this.box(1.2, 18, 1.2, 0, 60, -6), col]);
        g = this.merged(P); break;
      }
    }
    g.userData.shared = true;
    this.geo[name] = g;
    return g;
  },

  // ---------------- 거리
  street(I, walks, curbs, el, pts, prof, w, tg, cx, cz, urban, nodeUse) {
    const hw = tg.highway;
    if (/motorway/.test(hw)) return;
    const major = /^(trunk|primary|secondary)/.test(hw), tert = /^tertiary/.test(hw), res = /^(residential|unclassified|living_street)$/.test(hw);
    const L = (pts.length > 1) ? pts.reduce((a, p, i) => (i ? a + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0), 0) : 0;
    if (L < 8) return;
    const walk = urban && (major || tert || (res && w >= 6));
    if (walk) {
      for (const side of [1, -1]) {
        const off = offsetLine(pts, side * (w / 2 + 1.3));
        ribbon(walks, off, { bridge: false, h: [] }, 2.6, cx, cz, false, 0.45, 2.6);
        const edge = offsetLine(pts, side * (w / 2));
        // 연석: 지형을 따라가도록 12m 이하 조각으로 나누고, 차도 쪽을 보는 면만 만든다
        for (let i = 0; i < edge.length - 1; i++) {
          const e0 = edge[i], e1 = edge[i + 1], n = Math.max(1, Math.ceil(Math.hypot(e1.x - e0.x, e1.z - e0.z) / 12));
          for (let k = 0; k < n; k++) {
            const a = { x: lerp(e0.x, e1.x, k / n), z: lerp(e0.z, e1.z, k / n) }, b = { x: lerp(e0.x, e1.x, (k + 1) / n), z: lerp(e0.z, e1.z, (k + 1) / n) };
            const ha = Math.max(Terrain.heightAt(a.x, a.z), 0), hb = Math.max(Terrain.heightAt(b.x, b.z), 0);
            const at = [a.x - cx, ha + 0.46, a.z - cz], bt = [b.x - cx, hb + 0.46, b.z - cz], bb = [b.x - cx, hb + 0.25, b.z - cz], ab = [a.x - cx, ha + 0.25, a.z - cz];
            if (side > 0) curbs.quad(at, bt, bb, ab, 0xb8b4ac); else curbs.quad(bt, at, ab, bb, 0xb8b4ac);
          }
        }
      }
    }
    const okSpot = (x, z) => !City.insideBuilding(x, z) && Terrain.heightAt(x, z) > 0.2;
    // 가로등 (지그재그)
    if (major || tert) {
      const sp = major ? 30 : 40;
      for (const side of [1, -1]) {
        for (const s of alongLine(offsetLine(pts, side * (w / 2 + 0.7)), sp * 2, side > 0 ? sp * 0.5 : sp * 1.5)) {
          if (!okSpot(s.x, s.z)) continue;
          const tox = side * s.dz, toz = -side * s.dx; // 도로 중심 쪽
          I.lights.push({ x: s.x, z: s.z, y: Math.max(Terrain.heightAt(s.x, s.z), 0) + 0.4, yaw: Math.atan2(-toz, tox) });
        }
      }
    }
    // 가로수
    if (major || tert || (urban && res && w >= 6)) {
      for (const side of [1, -1]) for (const s of alongLine(offsetLine(pts, side * (w / 2 + (walk ? 2.0 : 1.6))), 13, 5 + (side > 0 ? 0 : 6.5))) {
        if (!okSpot(s.x, s.z)) continue;
        I.trees.push({ x: s.x, z: s.z, y: Math.max(Terrain.heightAt(s.x, s.z), 0) + 0.3, s: 0.85 + ((s.x * 7.3 + s.z * 3.1) % 1 + 1) % 1 * 0.4 });
      }
    }
    // 교차로: 횡단보도와 신호등
    if (el.nodes && (major || tert || res)) {
      const nodes = el.nodes;
      for (let k = 0; k < nodes.length && k < pts.length; k++) {
        if ((nodeUse.get(nodes[k]) || 0) < 2) continue;
        for (const dir of [1, -1]) {
          const q = pointAlong(pts, k, dir, 7 + w * 0.2);
          if (!q) continue;
          const y = Math.max(Terrain.heightAt(q.x, q.z), 0) + 0.31;
          const n = Math.max(2, Math.floor(w / 1.0));
          const rx = -q.dz, rz = q.dx;
          for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 1.0; I.stripes.push({ x: q.x + rx * o, z: q.z + rz * o, y, yaw: Math.atan2(q.dx, q.dz) }); }
          if (major && dir === 1) {
            // 다가오는 차의 오른쪽 길가
            const ax = -q.dx * dir, az = -q.dz * dir; // 접근 방향
            const sx = -az, sz = ax; // 접근 방향 기준 오른쪽
            const px = q.x + sx * (w / 2 + 0.7), pz = q.z + sz * (w / 2 + 0.7);
            if (okSpot(px, pz)) I.signals.push({ x: px, z: pz, y: Math.max(Terrain.heightAt(px, pz), 0) + 0.4, yaw: Math.atan2(sz, -sx) });
          }
        }
      }
    }
  },

  // ---------------- 항만: 컨테이너 더미와 안벽 크레인
  portYard(I, ring, rec) {
    const bb = bbox(ring);
    let longest = 0, ax = 1, az = 0;
    for (let i = 0; i < ring.length - 1; i++) { const a = ring[i], b = ring[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z); if (l > longest) { longest = l; ax = (b.x - a.x) / l; az = (b.z - a.z) / l; } }
    const rnd = mulberry32(hashStr(rec.k + ring.length));
    const cols = [0x1a5aa8, 0xc8321e, 0xe8902a, 0x2a8a4a, 0x8a8e92, 0xe8e4dc, 0x6a2a8a, 0x0a7a8a, 0xb8a020, 0x7a3a2a];
    const ctr = centroid(ring), R0 = Math.hypot(bb.x1 - bb.x0, bb.z1 - bb.z0) / 2;
    const yaw = Math.atan2(-az, ax); // 컨테이너 긴 변(로컬 x)을 줄 방향으로
    // 먼저 놓을 자리를 모두 모은 뒤, 개수 상한(2600)에 맞춰 쌓는 높이를 정한다 (한쪽에 몰리지 않게)
    const slots = [];
    for (let u = -R0; u < R0; u += 14) for (let v = -R0; v < R0; v += 3.0) {
      if (Math.floor((v + R0) / 3) % 7 === 6) continue; // 통로
      const x = ctr.x + ax * u - az * v, z = ctr.z + az * u + ax * v;
      if (x < rec.b.x0 || x >= rec.b.x1 || z < rec.b.z0 || z >= rec.b.z1) continue;
      if (!pointInRing(x, z, ring)) continue;
      const gy = Terrain.heightAt(x, z);
      if (gy < 0.5 || rnd() < 0.25) continue;
      slots.push({ x, z, gy });
    }
    const per = slots.length ? 2600 / slots.length : 0;
    for (const sl of slots) {
      if (per < 1 && rnd() > per) continue;
      const stack = per < 1 ? 1 : 1 + Math.floor(rnd() * Math.min(5, per * 2 - 1));
      for (let s = 0; s < stack; s++) I.containers.push({ x: sl.x, z: sl.z, y: sl.gy + s * 2.6, yaw, c: cols[Math.floor(rnd() * cols.length)] });
    }
    // 바다에 맞닿은 안벽에 크레인
    let cranes = 0;
    for (let i = 0; i < ring.length - 1 && cranes < 10; i++) {
      const a = ring[i], b = ring[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z);
      if (l < 60) continue;
      const dx = (b.x - a.x) / l, dz = (b.z - a.z) / l;
      for (let d = 30; d < l - 20 && cranes < 10; d += 75) {
        const x = a.x + dx * d, z = a.z + dz * d;
        if (x < rec.b.x0 || x >= rec.b.x1 || z < rec.b.z0 || z >= rec.b.z1) continue;
        for (const s of [1, -1]) {
          const ox = dz * s, oz = -dx * s;
          if (Terrain.isWater(x + ox * 40, z + oz * 40) && Terrain.heightAt(x - ox * 20, z - oz * 20) > 0.5) { I.cranes.push({ x: x - ox * 12, z: z - oz * 12, yaw: Math.atan2(ox, oz) }); cranes++; break; }
        }
      }
    }
  },

  // ---------------- 탑·등대
  tower(group, lx, lz, tg) {
    const wx = lx + group.position.x, wz = lz + group.position.z;
    const gy = Math.max(Terrain.heightAt(wx, wz), 0);
    const g = new THREE.Group(); g.position.set(lx, gy, lz);
    const nm = tg.name || '';
    const mat = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6 }, o));
    if (tg.man_made === 'lighthouse') {
      const red = /red|빨/.test(tg['seamark:light:colour'] || tg.colour || '') || hashStr(nm + lx) % 2;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 14, 16), mat(red ? 0xd8302a : 0xf2f2ee)); body.position.y = 7; g.add(body);
      const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2, 12), Decor.beaconMat()); lantern.position.y = 15; g.add(lantern);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.6, 12), mat(0x3a3e44)); cap.position.y = 16.8; g.add(cap);
    } else if (/부산타워|Busan Tower/i.test(nm) || tg['tower:type'] === 'observation') {
      const H = parseFloat(tg.height) || 120;
      const white = mat(0xf4f4f0, { metalness: 0.2 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 4.2, H * 0.78, 20), white); shaft.position.y = H * 0.39; g.add(shaft);
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 6, 9, 24), white); deck.position.y = H * 0.8; g.add(deck);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(8.7, 8.7, 4, 24), mat(0x4a6a80, { emissive: 0xffd8a0, emissiveIntensity: 0, metalness: 0.5, roughness: 0.2 })); glass.position.y = H * 0.8 + 1; g.add(glass);
      Mats.lampMats.push(glass.material);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 3, H * 0.14, 16), white); top.position.y = H * 0.91; g.add(top);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.4, 10, 8), mat(0xd8302a)); ant.position.y = H + 4; g.add(ant);
    } else {
      const H = parseFloat(tg.height) || 45;
      for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6 + (6 - i) * 0.15, 0.75 + (6 - i) * 0.15, H / 6, 8), mat(i % 2 ? 0xf2f2ee : 0xd8302a)); m.position.y = H / 12 + i * H / 6; g.add(m); }
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    group.add(g);
  },
  // ---------------- 굴뚝과 플레어 스택 (울산·온산 석유화학단지)
  stack(group, lx, lz, tg, r0 = 0) {
    const wx = lx + group.position.x, wz = lz + group.position.z;
    const g = new THREE.Group(); g.position.set(lx, Math.max(Terrain.heightAt(wx, wz), 0), lz);
    const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
    if (tg.man_made === 'flare') {
      const H = parseFloat(tg.height) || 60;
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, H, 8), mat(0x8a8e92)); pipe.position.y = H / 2; g.add(pipe);
      for (let y = 8; y < H; y += 12) { const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.4, 8), mat(0x6a6e72)); ring.position.y = y; g.add(ring); }
      const flame = new THREE.Mesh(new THREE.ConeGeometry(2.6, 13, 8, 1, true), this.flameMat()); flame.position.y = H + 6; g.add(flame);
      // 멀리서도 보이는 불빛 번짐
      const glow = new THREE.Sprite(this.glowMat()); glow.geometry.userData.shared = true; glow.position.y = H + 6; glow.scale.set(40, 40, 1); g.add(glow);
    } else {
      // 굴뚝: 아래는 콘크리트, 꼭대기는 빨강·흰 띠, 항공 장애등
      const H = parseFloat(tg.height) || 80, r = clamp(r0 || H / 30, 1.5, 6);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, H * 0.75, 14), mat(0xc8c4bc)); body.position.y = H * 0.375; g.add(body);
      for (let i = 0; i < 5; i++) { const k = 0.75 + i * 0.05, m = new THREE.Mesh(new THREE.CylinderGeometry(r * (0.7 - (i + 1) * 0.01), r * (0.7 - i * 0.01), H * 0.05, 14), mat(i % 2 ? 0xf2f0ea : 0xd8302a)); m.position.y = H * (k + 0.025); g.add(m); }
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), this.aviationMat()); lamp.position.y = H + 0.4; g.add(lamp);
    }
    g.traverse((o) => { if (o.isMesh && o.material !== this._flame) o.castShadow = true; });
    group.add(g);
  },
  // 원유·석유 저장탱크: 넓고 낮은 원통 + 지붕
  addTank(I, ring, tg, cx, cz) {
    const c = centroid(ring), area = Math.abs(ringArea(ring));
    const r = Math.sqrt(area / Math.PI);
    if (r < 1.5) return;
    const silo = tg.man_made === 'silo';
    const h = parseFloat(tg.height) || (silo ? clamp(r * 4, 12, 40) : clamp(r * 0.65, 6, 24));
    const y = Math.max(Terrain.heightAt(c.x, c.z), 0);
    const col = silo ? 0xd8d8d0 : [0xf0f0ec, 0xe8e8e2, 0xdedcd4, 0xd8e0d0, 0xe8e0cc][hashStr(String(tg.name || '') + Math.round(c.x)) % 5];
    I.oil.push({ x: c.x - cx, z: c.z - cz, y, r, h, c: col });
    I.oil.push({ x: c.x - cx, z: c.z - cz, y: y + h, r: r * 0.96, h: silo ? r * 0.4 : 0.25, c: silo ? 0xb8b8b0 : 0x9a9ea2 }); // 지붕
    // 공단 야경: 탱크 꼭대기 테두리와 계단참의 조명
    const n = r > 12 ? 6 : 3, a0 = (c.x * 0.37) % TAU;
    for (let k = 0; k < n; k++) { const a = a0 + (k / n) * TAU; I.lamps.push({ x: c.x - cx + Math.cos(a) * (r + 0.5), z: c.z - cz + Math.sin(a) * (r + 0.5), y: y + h + 0.8 }); }
    I.lamps.push({ x: c.x - cx + Math.cos(a0) * (r + 0.8), z: c.z - cz + Math.sin(a0) * (r + 0.8), y: y + h * 0.5 });
  },
  // ---------------- 조선소: 바다에 닿은 도크마다 골리앗 크레인, 건조 중인 배, 안벽 크레인
  shipyard(I, group, ring, rec) {
    const bb = bbox(ring), rnd = mulberry32(hashStr(rec.k + 'yard'));
    // 바다에 닿은 땅을 전역 40m 격자에서 찾고, 350m 칸마다 하나씩 고른다. 옆 타일도 같은 결과가 나오도록
    // 타일보다 800m 넓게 계산한 뒤, 고른 자리가 이 타일 안에 있을 때만 세운다
    const M = 800, x0 = Math.max(bb.x0, rec.b.x0 - M), x1 = Math.min(bb.x1, rec.b.x1 + M), z0 = Math.max(bb.z0, rec.b.z0 - M), z1 = Math.min(bb.z1, rec.b.z1 + M);
    const CELL = 350, cells = new Map();
    for (let x = Math.ceil(x0 / 40) * 40; x < x1; x += 40) for (let z = Math.ceil(z0 / 40) * 40; z < z1; z += 40) {
      if (!pointInRing(x, z, ring) || Terrain.heightAt(x, z, -9) < 0.5) continue;
      let sx = 0, sz = 0, n = 0;
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, dx = Math.cos(a), dz = Math.sin(a); if (Terrain.isWater(x + dx * 140, z + dz * 140)) { sx += dx; sz += dz; n++; } }
      if (n < 3 || n > 9) continue;
      const key = Math.floor(x / CELL) + ',' + Math.floor(z / CELL), sc = Math.abs(n - 6) + (((x * 7 + z * 13) % 997 + 997) % 997) / 1e4;
      const cur = cells.get(key);
      if (!cur || sc < cur.sc) { const l = Math.hypot(sx, sz) || 1; cells.set(key, { x, z, dx: sx / l, dz: sz / l, sc }); }
    }
    const all = [...cells.values()];
    const sites = all.filter((c) => c.x >= rec.b.x0 && c.x < rec.b.x1 && c.z >= rec.b.z0 && c.z < rec.b.z1
      && !all.some((o) => o !== c && Math.hypot(o.x - c.x, o.z - c.z) < 320 && (o.sc < c.sc || (o.sc === c.sc && o.x < c.x))));
    for (const s of sites) {
      const px = -s.dz, pz = s.dx; // 해안선 방향
      // 도크 안의 배(바다 쪽을 향해), 그 위를 가로지르는 골리앗 크레인
      const hx = s.x - s.dx * 60, hz = s.z - s.dz * 60;
      this.hull(group, hx - group.position.x, hz - group.position.z, Math.atan2(s.dx, s.dz), rnd);
      this.goliath(group, hx - s.dx * 20 - group.position.x, hz - s.dz * 20 - group.position.z, Math.atan2(-s.dx, -s.dz), 170);
      // 안벽을 따라 지브 크레인
      for (const o of [-150, -80, 80, 150]) {
        const x = s.x + px * o + s.dx * 30, z = s.z + pz * o + s.dz * 30;
        if (Terrain.heightAt(x, z, -9) < 0.5 || City.insideBuilding(x, z)) continue;
        this.jibCrane(group, x - group.position.x, z - group.position.z, Math.atan2(s.dx, s.dz) + (rnd() - 0.5) * 1.2, rnd);
      }
      // 마당의 강철 블록
      for (let k = 0; k < 24; k++) {
        const u = (rnd() - 0.5) * 300, v = -100 - rnd() * 200, x = s.x + px * u + s.dx * v, z = s.z + pz * u + s.dz * v;
        if (!pointInRing(x, z, ring) || Terrain.heightAt(x, z, -9) < 0.5 || City.insideBuilding(x, z)) continue;
        if (x < rec.b.x0 || x >= rec.b.x1 || z < rec.b.z0 || z >= rec.b.z1) continue;
        I.boxes.push({ x: x - rec.cx, z: z - rec.cz, y: Terrain.heightAt(x, z), sx: 10 + rnd() * 14, sy: 5 + rnd() * 8, sz: 8 + rnd() * 10, yaw: Math.atan2(px, pz), c: rnd() < 0.5 ? 0x8a3a2e : 0x7a8086 });
      }
    }
  },
  // 건조 중인 배: 선체만 있고 아래는 붉은 방오 도장, 위는 회색 프라이머
  hull(group, lx, lz, yaw, rnd) {
    const g = new THREE.Group();
    g.position.set(lx, Math.max(Terrain.heightAt(lx + group.position.x, lz + group.position.z), 0), lz); g.rotation.y = yaw;
    const L = 240 + rnd() * 60, B = 44, D = 24;
    const red = new THREE.MeshStandardMaterial({ color: 0x9a3428, roughness: 0.8 }), grey = new THREE.MeshStandardMaterial({ color: 0x7c8288, roughness: 0.75 });
    const low = new THREE.Mesh(new THREE.BoxGeometry(B, D * 0.55, L - 30), red); low.position.y = D * 0.275 + 1.5; g.add(low);
    const up = new THREE.Mesh(new THREE.BoxGeometry(B, D * 0.45, L - 30), grey); up.position.y = D * 0.775 + 1.5; g.add(up);
    for (const [m, y0, hh] of [[red, 1.5, D * 0.55], [grey, 1.5 + D * 0.55, D * 0.45]]) {
      // 반원기둥을 앞쪽(+z)으로 돌리고 길이 방향(로컬 x → 앞)으로 늘린 뱃머리
      const bow = new THREE.Mesh(new THREE.CylinderGeometry(B / 2, B / 2, hh, 12, 1, false, 0, Math.PI), m); bow.rotation.y = -Math.PI / 2; bow.scale.set(30 / (B / 2), 1, 1); bow.position.set(0, y0 + hh / 2, (L - 30) / 2); g.add(bow);
    }
    // 아직 얹지 않은 블록 자리와 받침목
    const blk = new THREE.Mesh(new THREE.BoxGeometry(B * 0.8, 10, 26), grey); blk.position.set(0, D + 6.5, -L / 2 + 40); g.add(blk);
    const lp = []; for (let z = -L / 2 + 20; z < L / 2 - 30; z += 22) lp.push(B / 2 - 1, D + 2.5, z, -B / 2 + 1, D + 2.5, z);
    g.add(this.lampPoints(lp));
    for (let z = -L / 2 + 20; z < L / 2 - 20; z += 18) { const k = new THREE.Mesh(new THREE.BoxGeometry(B * 0.6, 1.5, 2), new THREE.MeshStandardMaterial({ color: 0x5a5048 })); k.position.set(0, 0.75, z); g.add(k); }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.add(g);
  },
  // 골리앗 크레인: 다리 둘과 거대한 들보(로컬 x 방향으로 span m)
  goliath(group, lx, lz, yaw, span) {
    const g = new THREE.Group();
    g.position.set(lx, Math.max(Terrain.heightAt(lx + group.position.x, lz + group.position.z), 0), lz); g.rotation.y = yaw;
    const H = 95, white = new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.6, metalness: 0.2 }), blue = new THREE.MeshStandardMaterial({ color: 0x1e4f9a, roughness: 0.6 });
    for (const sx of [-span / 2, span / 2]) {
      for (const sz of [-9, 9]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(4, H, 4), white); leg.position.set(sx, H / 2, sz * 0.4); leg.rotation.x = sz > 0 ? -0.09 : 0.09; g.add(leg); }
      const foot = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 30), white); foot.position.set(sx, 2, 0); g.add(foot);
    }
    const girder = new THREE.Mesh(new THREE.BoxGeometry(span + 24, 14, 10), white); girder.position.y = H + 7; g.add(girder);
    const band = new THREE.Mesh(new THREE.BoxGeometry(span + 24.2, 3, 10.2), blue); band.position.y = H + 4; g.add(band);
    for (const tx of [-span * 0.2, span * 0.15]) { const trolley = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 14), blue); trolley.position.set(tx, H - 3.5, 0); g.add(trolley); const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 50, 4), white); rope.position.set(tx, H - 32, 0); g.add(rope); }
    for (const sx of [-span / 2 - 12, span / 2 + 12]) { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), this.aviationMat()); lamp.position.set(sx, H + 14.6, 0); g.add(lamp); }
    // 밤 작업등: 들보 아래와 다리를 따라
    const lp = [];
    for (let x = -span / 2; x <= span / 2; x += 14) lp.push(x, H - 0.5, 5.5, x, H - 0.5, -5.5);
    for (const sx of [-span / 2, span / 2]) for (let y = 12; y < H; y += 20) lp.push(sx + 2.5, y, 0);
    g.add(this.lampPoints(lp));
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    group.add(g);
  },
  // 안벽 지브 크레인: 기둥 + 비스듬한 지브 + 균형추
  jibCrane(group, lx, lz, yaw, rnd) {
    const g = new THREE.Group();
    g.position.set(lx, Math.max(Terrain.heightAt(lx + group.position.x, lz + group.position.z), 0), lz); g.rotation.y = yaw;
    const col = new THREE.MeshStandardMaterial({ color: rnd() < 0.5 ? 0xe8b020 : 0x2a6ab0, roughness: 0.6 });
    const portal = new THREE.Mesh(new THREE.BoxGeometry(10, 12, 10), col); portal.position.y = 6; g.add(portal);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(3.5, 32, 3.5), col); tower.position.y = 28; g.add(tower);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 8), new THREE.MeshStandardMaterial({ color: 0xf0f0ea })); cab.position.set(0, 44, -2); g.add(cab);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 50), col); jib.position.set(0, 58, 20); jib.rotation.x = -0.5; g.add(jib);
    const cw = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 6), new THREE.MeshStandardMaterial({ color: 0x4a4e52 })); cw.position.set(0, 46, -9); g.add(cw);
    g.add(this.lampPoints([0, 13, 5.5, 0, 41, 2, 0, 66, 40]));
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    group.add(g);
  },
  // 플레어 불꽃 (더해지는 빛, 깜박임은 Decor.update에서)
  flameMat() {
    if (!this._flame) { this._flame = new THREE.MeshBasicMaterial({ color: 0xffa040, fog: false, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); this._flame.userData.shared = true; }
    return this._flame;
  },
  // 저장탱크: 밤에는 투광등을 받은 듯 은은하게 밝아진다
  tankMat() {
    if (!this._tank) { this._tank = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.25, emissive: 0xffd9a8, emissiveIntensity: 0 }); this._tank.userData.shared = true; }
    return this._tank;
  },
  lampPointMat() {
    if (!this._lampPts) {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.25, 'rgba(255,215,150,0.8)'); gr.addColorStop(1, 'rgba(255,180,90,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.shared = true;
      this._lampPts = new THREE.PointsMaterial({ map: t, size: 7, sizeAttenuation: true, fog: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      this._lampPts.userData.shared = true;
    }
    return this._lampPts;
  },
  lampPoints(arr) {
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const p = new THREE.Points(pg, this.lampPointMat()); p.frustumCulled = false;
    return p;
  },
  glowMat() {
    if (!this._glow) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,200,120,1)'); gr.addColorStop(0.3, 'rgba(255,140,40,0.45)'); gr.addColorStop(1, 'rgba(255,100,20,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.shared = true;
      this._glow = new THREE.SpriteMaterial({ map: t, fog: false, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
      this._glow.userData.shared = true;
    }
    return this._glow;
  },
  // 높은 구조물 꼭대기의 빨간 항공 장애등 (밤에 깜박임)
  aviationMat() {
    if (!this._avi) { this._avi = new THREE.MeshStandardMaterial({ color: 0x601010, emissive: 0xff2020, emissiveIntensity: 0.5 }); this._avi.userData.shared = true; }
    return this._avi;
  },
  // 밤낮·시간에 따라 깜박이는 것들
  update(t, night) {
    if (this._beacon) this._beacon.emissiveIntensity = night > 0.15 ? (Math.sin(t * 2.2) > 0.6 ? 4 : 0.3) : 0.4;
    if (this._avi) this._avi.emissiveIntensity = night > 0.15 ? (Math.sin(t * 3.1) > 0 ? 3 : 0.2) : 0.5;
    if (this._glow) this._glow.opacity = 0.25 + 0.75 * night;
    if (this._lampPts) this._lampPts.opacity = night > 0.15 ? night : 0;
    if (this._tank) this._tank.emissiveIntensity = night > 0.15 ? 0.06 * night : 0;
    if (this._flame) { this._flame.opacity = 0.7 + 0.25 * Math.sin(t * 13) * Math.sin(t * 7.3); this._flame.color.setHSL(0.07 + 0.02 * Math.sin(t * 5), 1, 0.55 + 0.1 * night); }
  },
  beaconMat() {
    if (!this._beacon) { this._beacon = new THREE.MeshStandardMaterial({ color: 0xfff4c0, emissive: 0xfff0a0, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 }); this._beacon.userData.shared = true; }
    return this._beacon;
  },

  // ---------------- 목록을 인스턴스 메시로
  flush(I, group, rec) {
    const cx = rec.cx, cz = rec.cz;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const inst = (geo, mat, list, f, cast = true) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => { const o = f(it); q.setFromAxisAngle(up, o.yaw || 0); m4.compose(v.set(o.x, o.y, o.z), q, sc.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1)); im.setMatrixAt(i, m4); if (o.c !== undefined) im.setColorAt(i, new THREE.Color(o.c)); });
      im.castShadow = cast; im.receiveShadow = true;
      group.add(im); return im;
    };
    const W = (it) => ({ x: it.x - cx, z: it.z - cz });
    inst(this.G('pier'), Mats.bridge, I.piers, (p) => ({ x: p.x, y: p.y0, z: p.z, sx: p.r, sy: Math.max(0.5, p.y1 - p.y0), sz: p.r }));
    inst(this.G('stop'), Mats.solid, I.stops, (s) => ({ x: s.x, y: s.y, z: s.z }));
    inst(this.G('unitBox'), this.propMat(), I.boxes, (b) => ({ x: b.x, y: b.y, z: b.z, sx: b.sx, sy: b.sy, sz: b.sz, yaw: b.yaw, c: b.c }));
    inst(this.G('unitCyl'), this.propMat(), I.tanks, (b) => ({ x: b.x, y: b.y, z: b.z, sx: b.r, sy: b.h, sz: b.r, c: b.c }));
    inst(this.G('unitCyl'), this.tankMat(), I.oil, (b) => ({ x: b.x, y: b.y, z: b.z, sx: b.r, sy: b.h, sz: b.r, c: b.c }));
    // 밤 조명: 점 스프라이트(가까울수록 크게)
    if (I.lamps.length) {
      group.add(this.lampPoints(I.lamps.flatMap((l) => [l.x, l.y, l.z])));
    }
    inst(this.G('crossTower'), Mats.solid, I.crosses, (b) => ({ x: b.x, y: b.y, z: b.z }));
    inst(this.G('cross'), Mats.cross, I.crosses, (b) => ({ x: b.x, y: b.y, z: b.z }), false);
    inst(this.G('lightPole'), Mats.solid, I.lights, (l) => ({ ...W(l), y: l.y, yaw: l.yaw }));
    inst(this.G('lightHead'), Mats.lamp, I.lights, (l) => ({ ...W(l), y: l.y, yaw: l.yaw }), false);
    // 가로수는 타일당 1800그루까지, 넘으면 고르게 솎아 낸다
    if (I.trees.length > 1800) { const k = I.trees.length / 1800; I.trees = Array.from({ length: 1800 }, (_, i) => I.trees[Math.floor(i * k)]); }
    const se = season();
    const rnd = mulberry32(hashStr(rec.k) ^ 0x7ee);
    inst(this.G('trunk'), this.trunkMat(), I.trees, (t) => ({ ...W(t), y: t.y, sx: t.s, sy: t.s, sz: t.s }));
    inst(this.G('crown'), this.crownMat(), I.trees, (t) => {
      let c, s = t.s;
      const r = rnd();
      if (se === 'autumn') c = r < 0.7 ? new THREE.Color().setHSL(0.13 + r * 0.03, 0.8, 0.5) : new THREE.Color().setHSL(0.05 + r * 0.04, 0.7, 0.45);
      else if (se === 'blossom') c = r < 0.6 ? new THREE.Color().setHSL(0.93, 0.55, 0.85) : new THREE.Color().setHSL(0.28, 0.45, 0.4);
      else if (se === 'winter') { c = new THREE.Color(0x7a6a5a); s *= 0.55; }
      else c = new THREE.Color().setHSL(0.27 + r * 0.06, 0.45, 0.32 + r * 0.1);
      return { ...W(t), y: t.y, sx: s, sy: s, sz: s, c };
    });
    inst(this.G('stripe'), Mats.white, I.stripes, (s) => ({ ...W(s), y: s.y, yaw: s.yaw }), false);
    inst(this.G('signal'), Mats.solid, I.signals, (s) => ({ ...W(s), y: s.y, yaw: s.yaw }));
    inst(this.G('container'), this.propMat(), I.containers, (c) => ({ ...W(c), y: c.y, yaw: c.yaw, c: c.c }));
    inst(this.G('crane'), Mats.solid, I.cranes, (c) => ({ ...W(c), y: Math.max(Terrain.heightAt(c.x, c.z), 0), yaw: c.yaw }));
  },
  propMat() { if (!this._prop) { this._prop = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.15 }); this._prop.userData.shared = true; } return this._prop; },
  // 가로수 잎: 잎 무늬 캔버스 텍스처(흰 바탕이라 인스턴스 색으로 물든다)
  crownMat() {
    if (this._crown) return this._crown;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), rnd = mulberry32(5);
    g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const v = Math.floor(120 + rnd() * 135), x = rnd() * 128, y = rnd() * 128, a = rnd() * Math.PI;
      g.fillStyle = `rgb(${v},${v},${v})`;
      for (const [dx, dy] of [[0, 0], [128, 0], [-128, 0], [0, 128], [0, -128]]) { g.beginPath(); g.ellipse(x + dx, y + dy, 2.2 + rnd() * 2, 1.2 + rnd(), a, 0, TAU); g.fill(); }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    this._crown = new THREE.MeshStandardMaterial({ vertexColors: true, map: t, roughness: 0.92 });
    this._crown.userData.shared = true;
    return this._crown;
  },
  trunkMat() { if (!this._trunk) { this._trunk = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.95 }); this._trunk.userData.shared = true; } return this._trunk; },
};
// 선의 k번째 점에서 dir 방향으로 dist만큼 간 곳
function pointAlong(pts, k, dir, dist) {
  let i = k, rem = dist;
  while (true) {
    const j = i + dir;
    if (j < 0 || j >= pts.length) return null;
    const a = pts[i], b = pts[j], l = Math.hypot(b.x - a.x, b.z - a.z);
    if (l >= rem) { const t = rem / l; return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), dx: (b.x - a.x) / l * dir, dz: (b.z - a.z) / l * dir }; }
    rem -= l; i = j;
  }
}

// ---------------------------------------------------------------------------
// 이름난 다리의 주탑과 케이블 (OSM 다리 길을 따라 대략적인 위치에 세운다)
// ---------------------------------------------------------------------------
const BRIDGE_SPECIAL = [
  { re: /광안대교/, type: 'susp', span: 500, towerH: 105, led: true },
  { re: /울산대교/, type: 'susp', span: 1150, towerH: 170, led: false },
  { re: /부산항대교|북항대교/, type: 'stay', span: 540, towerH: 190, led: true },
  { re: /거가대교/, type: 'stay', span: 475, towerH: 150, led: false },
  { re: /남항대교/, type: 'stay', span: 270, towerH: 90, led: true },
];
const BridgeFX = {
  items: new Map(), // name -> {spec, segs:[{pts,h,tile,w}], group}
  add(name, pts, h, tile, w) {
    const spec = BRIDGE_SPECIAL.find((s) => s.re.test(name));
    if (!spec) return;
    const key = spec.re.source;
    let it = this.items.get(key);
    if (!it) { it = { spec, segs: [], group: null }; this.items.set(key, it); }
    it.segs.push({ pts, h, tile, w });
    clearTimeout(it.timer);
    it.timer = setTimeout(() => this.build(it), 300);
  },
  removeTile(tile) {
    for (const [k, it] of this.items) {
      it.segs = it.segs.filter((s) => s.tile !== tile);
      if (!it.segs.length) { if (it.group) World0.disposeGroup(it.group); this.items.delete(k); }
    }
  },
  build(it) {
    if (it.group) { World0.disposeGroup(it.group); it.group = null; }
    const seg = it.segs.reduce((a, s) => (polyLen(s.pts) > polyLen(a.pts) ? s : a), it.segs[0]);
    const pts = seg.pts, L = polyLen(pts);
    // 가장 긴 바다 구간의 가운데
    let best = [0, 0], cur = null;
    // 강 하구는 고도 자료에서 1~3m로 나오기도 해서 3m 아래를 물로 본다
    for (let d = 0; d <= L; d += 10) { const p = polyAt(pts, seg.h, d); const water = Terrain.heightAt(p.x, p.z, 99) < 3; if (water) { if (!cur) cur = [d, d]; cur[1] = d; if (cur[1] - cur[0] > best[1] - best[0]) best = cur.slice(); } else cur = null; }
    let run = best[1] - best[0];
    if (run < 150) { if (L < 300) return; best = [L * 0.2, L * 0.8]; run = L * 0.6; } // 물을 못 찾으면 다리 가운데에
    const mid = (best[0] + best[1]) / 2, span = Math.min(it.spec.span, run * 0.8), H = it.spec.towerH;
    const g = new THREE.Group();
    const towerM = new THREE.MeshStandardMaterial({ color: 0xd8dcdf, roughness: 0.55, metalness: 0.2 });
    const cableM = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.4, metalness: 0.6, emissive: 0x88aaff, emissiveIntensity: 0 });
    it.cableM = cableM;
    const wHalf = Math.max(seg.w, 18) / 2 + 2.5;
    const towers = it.spec.type === 'susp' ? [mid - span / 2, mid + span / 2] : [mid - span / 2, mid + span / 2];
    const tops = [];
    for (const s of towers) {
      const p = polyAt(pts, seg.h, s), rx = -p.dz, rz = p.dx;
      const base = -12;
      for (const side of [-1, 1]) {
        const x = p.x + rx * wHalf * side, z = p.z + rz * wHalf * side;
        const leg = new THREE.Mesh(new THREE.BoxGeometry(4.5, H - base, 5.5), towerM);
        leg.position.set(x, base + (H - base) / 2, z); leg.rotation.y = Math.atan2(p.dx, p.dz); leg.castShadow = true; g.add(leg);
        tops.push({ s, side, x, z, y: H });
      }
      for (const hy of [p.h + 6, H * 0.7, H - 4]) { const beam = new THREE.Mesh(new THREE.BoxGeometry(wHalf * 2 + 4, 3.5, 4), towerM); beam.position.set(p.x, hy, p.z); beam.rotation.y = Math.atan2(rx, rz) + Math.PI / 2; g.add(beam); }
    }
    const tube = (curvePts, r) => { const c = new THREE.CatmullRomCurve3(curvePts); const m = new THREE.Mesh(new THREE.TubeGeometry(c, Math.max(16, curvePts.length * 6), r, 6, false), cableM); g.add(m); };
    const hangerGeo = new THREE.CylinderGeometry(0.12, 0.12, 1, 4); hangerGeo.translate(0, 0.5, 0);
    const hangers = [];
    if (it.spec.type === 'susp') {
      const side0 = Math.min(span * 0.45, best[0] < towers[0] - 50 ? towers[0] - best[0] : span * 0.3);
      for (const side of [-1, 1]) {
        const curve = [];
        const s0 = towers[0] - side0, s3 = towers[1] + side0;
        const cableY = (s) => {
          if (s < towers[0]) { const k = (s - s0) / (towers[0] - s0); return lerp(polyAt(pts, seg.h, s0).h + 4, H, k * k); }
          if (s > towers[1]) { const k = (s3 - s) / (s3 - towers[1]); return lerp(polyAt(pts, seg.h, s3).h + 4, H, k * k); }
          const k = (s - mid) / (span / 2); return polyAt(pts, seg.h, mid).h + 6 + (H - polyAt(pts, seg.h, mid).h - 6) * k * k;
        };
        for (let s = s0; s <= s3; s += 20) { const p = polyAt(pts, seg.h, s), y = cableY(s); curve.push(new THREE.Vector3(p.x - p.dz * wHalf * side, y, p.z + p.dx * wHalf * side)); if (s > s0 + 10 && s < s3 - 10) hangers.push({ x: p.x - p.dz * wHalf * side, z: p.z + p.dx * wHalf * side, y0: p.h, y1: y }); }
        if (curve.length > 3) tube(curve, 0.7);
      }
    } else {
      // 사장교: 탑 꼭대기에서 상판으로 부채꼴 케이블
      for (const t of tops) for (let k = 1; k <= 12; k++) for (const dir of [-1, 1]) {
        const s = t.s + dir * k * (span / 2) / 12.5;
        const p = polyAt(pts, seg.h, s);
        const a = new THREE.Vector3(t.x, H - 6 - k * 1.2, t.z), b = new THREE.Vector3(p.x - p.dz * wHalf * t.side, p.h + 1, p.z + p.dx * wHalf * t.side);
        const d = new THREE.Vector3().subVectors(b, a), len = d.length();
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, len, 4), cableM);
        m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(m);
      }
    }
    if (hangers.length) {
      const im = new THREE.InstancedMesh(hangerGeo, cableM, hangers.length);
      const m4 = new THREE.Matrix4();
      hangers.forEach((h, i) => { m4.compose(new THREE.Vector3(h.x, h.y0, h.z), new THREE.Quaternion(), new THREE.Vector3(1, Math.max(0.5, h.y1 - h.y0), 1)); im.setMatrixAt(i, m4); });
      g.add(im);
    }
    R.world.add(g);
    it.group = g;
  },
  update(t, night) {
    for (const it of this.items.values()) {
      if (!it.cableM) continue;
      it.cableM.emissiveIntensity = night > 0.15 ? 1.6 * night : 0;
      if (it.spec.led) it.cableM.emissive.setHSL((t * 0.03) % 1, 0.8, 0.55);
      else it.cableM.emissive.setHex(0xbfd8ff);
    }
  },
};
function polyLen(p) { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); return l; }
function polyAt(p, h, d) {
  let acc = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const l = Math.hypot(p[i + 1].x - p[i].x, p[i + 1].z - p[i].z);
    if (acc + l >= d || i === p.length - 2) { const t = clamp((d - acc) / (l || 1), 0, 1); return { x: lerp(p[i].x, p[i + 1].x, t), z: lerp(p[i].z, p[i + 1].z, t), h: lerp(h[i], h[i + 1], t), dx: (p[i + 1].x - p[i].x) / (l || 1), dz: (p[i + 1].z - p[i].z) / (l || 1) }; }
    acc += l;
  }
  return { x: p[0].x, z: p[0].z, h: h[0], dx: 1, dz: 0 };
}

// ---------------------------------------------------------------------------
// 바다의 배: 컨테이너선, 여객선, 어선
// ---------------------------------------------------------------------------
const Ships = {
  list: [], t: 0,
  model(type) {
    const g = new THREE.Group();
    const m = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.2 });
    if (type === 'container') {
      const L = 220, B = 32;
      const hull = new THREE.Mesh(new THREE.BoxGeometry(B, 14, L), m(0x2a2a30)); hull.position.y = 3; g.add(hull);
      const red = new THREE.Mesh(new THREE.BoxGeometry(B + 0.3, 4, L + 0.3), m(0x8a2a22)); red.position.y = -2; g.add(red);
      const bow = new THREE.Mesh(new THREE.CylinderGeometry(B / 2, B / 2, 14, 3, 1, false, 0, Math.PI), m(0x2a2a30)); bow.rotation.y = -Math.PI / 2; bow.scale.set(1.6, 1, 1); bow.position.set(0, 3, L / 2); g.add(bow);
      const cols = [0x1a5aa8, 0xc8321e, 0xe8902a, 0x2a8a4a, 0x8a8e92, 0xe8e4dc, 0x0a7a8a];
      for (let z = -L / 2 + 30; z < L / 2 - 20; z += 13) { const h = 2.6 * (2 + Math.floor(Math.random() * 4)); const b = new THREE.Mesh(new THREE.BoxGeometry(B - 2, h, 12.2), m(cols[Math.floor(Math.random() * cols.length)])); b.position.set(0, 10 + h / 2, z); g.add(b); }
      const br = new THREE.Mesh(new THREE.BoxGeometry(B - 4, 18, 12), m(0xf0f0ea)); br.position.set(0, 19, -L / 2 + 16); g.add(br);
      const fun = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 5), m(0xd8302a)); fun.position.set(0, 30, -L / 2 + 8); g.add(fun);
    } else if (type === 'tanker') {
      // 유조선: 낮고 긴 선체, 갑판 위 배관, 뒤쪽 흰 선교
      const L = 250, B = 44;
      const hull = new THREE.Mesh(new THREE.BoxGeometry(B, 12, L), m(0x1e2226)); hull.position.y = 2; g.add(hull);
      const red = new THREE.Mesh(new THREE.BoxGeometry(B + 0.3, 3, L + 0.3), m(0x8a2a22)); red.position.y = -2.5; g.add(red);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(B - 1, 0.6, L - 4), m(0x7a3a30)); deck.position.y = 8.3; g.add(deck);
      const bow = new THREE.Mesh(new THREE.CylinderGeometry(B / 2, B / 2, 12, 3, 1, false, 0, Math.PI), m(0x1e2226)); bow.rotation.y = -Math.PI / 2; bow.scale.set(1.4, 1, 1); bow.position.set(0, 2, L / 2); g.add(bow);
      for (const x of [-6, 0, 6]) { const pipe = new THREE.Mesh(new THREE.BoxGeometry(1, 1, L * 0.7), m(0xd8d0b0)); pipe.position.set(x, 9.2, 10); g.add(pipe); }
      const br = new THREE.Mesh(new THREE.BoxGeometry(B - 8, 16, 16), m(0xf0f0ea)); br.position.set(0, 16.5, -L / 2 + 18); g.add(br);
      const fun = new THREE.Mesh(new THREE.BoxGeometry(5, 9, 6), m(0x2a2e34)); fun.position.set(0, 28, -L / 2 + 10); g.add(fun);
    } else if (type === 'carcarrier') {
      // 자동차 운반선: 높은 상자형 선체
      const L = 200, B = 32;
      const hull = new THREE.Mesh(new THREE.BoxGeometry(B, 34, L), m(0xf0f0ec)); hull.position.y = 14; g.add(hull);
      const blue = new THREE.Mesh(new THREE.BoxGeometry(B + 0.3, 6, L + 0.3), m(0x1e3f7a)); blue.position.y = -1; g.add(blue);
      const nose = new THREE.Mesh(new THREE.CylinderGeometry(B / 2, B / 2, 34, 12, 1, false, 0, Math.PI), m(0xf0f0ec)); nose.rotation.y = -Math.PI / 2; nose.scale.set(0.5, 1, 1); nose.position.set(0, 14, L / 2); g.add(nose);
      const br = new THREE.Mesh(new THREE.BoxGeometry(B - 2, 3, 8), m(0x1a2a3a)); br.position.set(0, 29, L / 2 - 14); g.add(br);
    } else if (type === 'ferry') {
      const L = 120, B = 20;
      const hull = new THREE.Mesh(new THREE.BoxGeometry(B, 10, L), m(0xf4f4f0)); hull.position.y = 3; g.add(hull);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(B + 0.2, 2, L + 0.2), m(0x1a5aa8)); stripe.position.y = 1; g.add(stripe);
      for (let k = 0; k < 3; k++) { const d = new THREE.Mesh(new THREE.BoxGeometry(B - 2 - k * 3, 4, L * (0.7 - k * 0.15)), m(0xf8f8f6)); d.position.set(0, 10 + k * 4, -5); g.add(d); const w = new THREE.Mesh(new THREE.BoxGeometry(B - 1.9 - k * 3, 1.2, L * (0.7 - k * 0.15) - 2), m(0x1a2a3a)); w.position.set(0, 10.5 + k * 4, -5); g.add(w); }
    } else {
      const L = 22, B = 6;
      const hull = new THREE.Mesh(new THREE.BoxGeometry(B, 3, L), m(0x2a5a9a)); hull.position.y = 1; g.add(hull);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(B - 1, 3.5, 6), m(0xf4f4f0)); cab.position.set(0, 4, -4); g.add(cab);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 6), m(0xd8d8d0)); mast.position.set(0, 7, 3); g.add(mast);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  },
  // 배 길이를 생각해 주변 250m가 모두 바다인 곳만
  isSea(x, z) { for (let k = 0; k < 9; k++) { const a = (k / 8) * TAU, r = k === 8 ? 0 : 250; if (!Terrain.isWater(x + Math.cos(a) * r, z + Math.sin(a) * r)) return false; } return true; },
  update(dt) {
    const P = Player.pos;
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 1.5;
      const want = R.quality === 'high' ? 16 : 8;
      for (let tries = 0; tries < 6 && this.list.length < want; tries++) {
        const a = Math.random() * TAU, d = 900 + Math.random() * 6500;
        const x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
        if (!this.isSea(x, z)) continue;
        const lat = GEO.lat(z), lon = GEO.lon(x);
        // 정박지: 부산 남쪽 앞바다(화물선), 울산항 앞바다(유조선·자동차 운반선)
        const ulsan = lat > 35.3;
        const anchorage = ulsan ? lat > 35.39 && lat < 35.49 && lon > 129.39 : lat < 35.075 && lon > 128.98 && lon < 129.16;
        const r = Math.random();
        const type = ulsan
          ? (anchorage ? (r < 0.7 ? 'tanker' : 'carcarrier') : r < 0.3 ? 'tanker' : r < 0.5 ? 'carcarrier' : r < 0.6 ? 'container' : 'fishing')
          : (anchorage ? 'container' : r < 0.3 ? 'container' : r < 0.45 ? 'ferry' : 'fishing');
        const s = { g: this.model(type), type, x, z, yaw: Math.random() * TAU, v: anchorage ? 0 : type === 'fishing' ? 3 : type === 'ferry' ? 8 : 4.5, bob: Math.random() * 10 };
        R.world.add(s.g); this.list.push(s);
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      if (Math.hypot(s.x - P.x, s.z - P.z) > 10000) { World0.disposeGroup(s.g); this.list.splice(i, 1); continue; }
      if (s.v) {
        const ax = s.x + Math.sin(s.yaw) * 250, az = s.z + Math.cos(s.yaw) * 250;
        if (!Terrain.isWater(ax, az)) s.yaw += dt * 0.25;
        s.x += Math.sin(s.yaw) * s.v * dt; s.z += Math.cos(s.yaw) * s.v * dt;
      }
      s.bob += dt;
      s.g.position.set(s.x, Math.sin(s.bob * 0.8) * (s.type === 'fishing' ? 0.25 : 0.1), s.z);
      s.g.rotation.set(Math.sin(s.bob * 0.6) * (s.type === 'fishing' ? 0.03 : 0.006), s.yaw, Math.sin(s.bob * 0.7) * (s.type === 'fishing' ? 0.04 : 0.008));
    }
  },
};

// ---------------------------------------------------------------------------
// 보행자: 보도를 따라 걷는 사람들
// ---------------------------------------------------------------------------
const People = {
  list: [], mesh: null, MAX: 0,
  init() {
    this.MAX = R.quality === 'high' ? 160 : 60;
    const skin = 0xe8c4a0, hair = 0x1e1a18;
    // 옷(몸통)은 인스턴스 색으로 물들이고, 얼굴·머리·다리는 따로 그려 색이 섞이지 않게
    const body = Decor.cyl(0.2, 0.17, 0.62, 0, 0.82, 0, 8);
    const rest = Decor.merged([
      [Decor.box(0.13, 0.82, 0.16, -0.09, 0.41, 0), 0x2a3040], [Decor.box(0.13, 0.82, 0.16, 0.09, 0.41, 0), 0x2a3040],
      [new THREE.SphereGeometry(0.12, 10, 8).translate(0, 1.58, 0), skin], [new THREE.SphereGeometry(0.125, 10, 6, 0, TAU, 0, Math.PI / 2).translate(0, 1.6, -0.01), hair],
    ]);
    const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, this.MAX); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false; m.castShadow = true; R.scene.add(m); return m; };
    this.mesh = mk(body, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
    this.mesh2 = mk(rest, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  },
  update(dt) {
    if (!this.mesh) this.init();
    const P = Player.pos;
    if (Ride.active || Player.alt() > 60) { this.mesh.count = this.mesh2.count = 0; return; }
    this.tSpawn = (this.tSpawn || 0) - dt;
    if (this.list.length < this.MAX && this.tSpawn <= 0) {
      this.tSpawn = 0.3;
      // 가까이 지나가는 길(꼭짓점이 200m 안)과 그 지점의 거리값
      const near = [];
      for (const w of Traffic.ways.values()) {
        if (!w.width || w.total < 25) continue;
        let bi = -1, bd = 200;
        for (let i = 0; i < w.pts.length; i++) { const d = Math.hypot(w.pts[i].x - P.x, w.pts[i].z - P.z); if (d < bd) { bd = d; bi = i; } }
        if (bi >= 0) near.push({ w, at: w.len[bi] });
      }
      for (let k = 0; k < 4 && near.length && this.list.length < this.MAX; k++) {
        const { w, at } = near[Math.floor(Math.random() * near.length)];
        const cols = [0x2a3a5a, 0xe8e4dc, 0x8a2a2a, 0x3a5a3a, 0x1a1a1a, 0xc8a070, 0x6a8ab8, 0xd8c8e0, 0x9a6a3a];
        this.list.push({ w, d: clamp(at + (Math.random() - 0.5) * 160, 0, w.total), dir: Math.random() < 0.5 ? 1 : -1, side: Math.random() < 0.5 ? 1 : -1, v: 1.1 + Math.random() * 0.5, ph: Math.random() * 10, c: new THREE.Color(cols[Math.floor(Math.random() * cols.length)]), s: 0.92 + Math.random() * 0.16 });
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3();
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (!Traffic.ways.has(p.w.id)) { this.list.splice(i, 1); continue; }
      p.d += p.v * p.dir * dt; p.ph += dt * p.v * 5;
      if (p.d < 0 || p.d > p.w.total) { p.dir *= -1; p.d = clamp(p.d, 0, p.w.total); }
      const w = p.w;
      let lo = 0, hi = w.len.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (w.len[m] <= p.d) lo = m; else hi = m; }
      const a = w.pts[lo], b = w.pts[hi], t = (p.d - w.len[lo]) / ((w.len[hi] - w.len[lo]) || 1);
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      const off = (w.width / 2 + 1.4) * p.side;
      const x = lerp(a.x, b.x, t) - dz / l * off, z = lerp(a.z, b.z, t) + dx / l * off;
      if (Math.abs(x - P.x) > 300 || Math.abs(z - P.z) > 300) { this.list.splice(i, 1); continue; }
      if (City.insideBuilding(x, z)) continue;
      const y = Math.max(Terrain.heightAt(x, z), 0) + 0.45 + Math.abs(Math.sin(p.ph)) * 0.04;
      q.setFromAxisAngle(up, Math.atan2(dx * p.dir, dz * p.dir));
      m4.compose(new THREE.Vector3(x, y, z), q, sc.set(p.s, p.s, p.s));
      this.mesh.setMatrixAt(n, m4); this.mesh2.setMatrixAt(n, m4); this.mesh.setColorAt(n, p.c); n++;
      if (n >= this.MAX) break;
    }
    this.mesh.count = this.mesh2.count = n;
    this.mesh2.instanceMatrix.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  },
};

// ---------------------------------------------------------------------------
// 갈매기: 바닷가 근처에서 원을 그리며 난다
// ---------------------------------------------------------------------------
const Gulls = {
  mesh: null, birds: [], t: 0, center: null,
  init() {
    const g = new THREE.BufferGeometry();
    // V자 날개 (끝이 위로 올라간 상태를 y 배율로 접었다 편다)
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, -0.75, 0.3, -0.05, 0, 0, -0.2, 0, 0, 0.25, 0, 0, -0.2, 0.75, 0.3, -0.05], 3));
    g.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0xf4f4f2, side: THREE.DoubleSide, roughness: 0.8 }), 24);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.count = 0; this.mesh.frustumCulled = false;
    R.scene.add(this.mesh);
    for (let i = 0; i < 24; i++) this.birds.push({ r: 25 + Math.random() * 60, a: Math.random() * TAU, h: 12 + Math.random() * 35, v: 0.25 + Math.random() * 0.25, ph: Math.random() * 10, s: 0.8 + Math.random() * 0.5 });
  },
  update(dt) {
    if (!this.mesh) this.init();
    const P = Player.pos;
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 3;
      this.center = null;
      if (!Ride.active && Player.alt() < 150) for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU, x = P.x + Math.cos(a) * 250, z = P.z + Math.sin(a) * 250; if (Terrain.isWater(x, z)) { this.center = { x: lerp(P.x, x, 0.6), z: lerp(P.z, z, 0.6) }; break; } }
    }
    if (!this.center) { this.mesh.count = 0; return; }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    this.birds.forEach((b, i) => {
      b.a += b.v * dt * (i % 2 ? 1 : -1); b.ph += dt * 7;
      const x = this.center.x + Math.cos(b.a) * b.r, z = this.center.z + Math.sin(b.a) * b.r;
      e.set(0, b.a + (i % 2 ? 0 : Math.PI), Math.sin(b.ph * 0.3) * 0.3); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, b.h + Math.sin(b.ph * 0.2) * 2, z), q, new THREE.Vector3(b.s, b.s * Math.sin(b.ph) * 1.2, b.s));
      this.mesh.setMatrixAt(i, m4);
    });
    this.mesh.count = this.birds.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  },
};
