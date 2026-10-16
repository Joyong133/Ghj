// ---------------------------------------------------------------------------
// 도시: OSM 타일 데이터를 건물·도로·다리·철길·정류장으로 만든다.
// 각 길·건물은 중심점이 들어 있는 타일 하나에서만 만든다(타일 간 중복 방지).
// ---------------------------------------------------------------------------
const City = {
  tiles: new Map(),      // z15 key -> { b, group, cols, bridges, names, stops }
  buildQueue: [], building: false,
  names: [],             // 이름 있는 지점 (명소 보정, 안내)
  stops: [],             // 버스 정류장
  runways: [],
  status: { loaded: 0, failed: 0 },

  query(b) {
    const bb = `${b.s.toFixed(6)},${b.w.toFixed(6)},${b.n.toFixed(6)},${b.e.toFixed(6)}`;
    return `[out:json][timeout:60];(
way["building"](${bb});
relation["building"]["type"="multipolygon"](${bb});
way["building:part"](${bb});
way["highway"](${bb});
way["railway"~"^(rail|subway|light_rail|tram|monorail|narrow_gauge)$"](${bb});
way["aeroway"~"^(runway|taxiway)$"](${bb});
way["man_made"~"^(pier|breakwater)$"](${bb});
node["highway"="bus_stop"](${bb});
node["name"]["tourism"](${bb});
node["name"]["railway"="station"](${bb});
way["name"]["tourism"](${bb});
way["name"]["amenity"~"^(university|college|school|hospital|marketplace|place_of_worship)$"](${bb});
way["name"]["leisure"~"^(park|stadium|garden)$"](${bb});
way["name"]["building"]["building"!~"^(yes|house|apartments|residential)$"](${bb});
node["name"]["amenity"~"^(university|college|marketplace)$"](${bb});
node["name"]["leisure"~"^(park|stadium)$"](${bb});
node["name"]["natural"~"^(peak|beach|cape)$"](${bb});
way["name"]["natural"~"^(beach)$"](${bb});
);out geom qt;`;
  },

  requestTile(t) {
    const rec = { t, b: t.b, k: t.k, dead: false, group: null };
    this.tiles.set(t.k, rec);
    const sig = {};
    rec.sig = sig;
    Net.overpass('t15/' + t.x + '/' + t.y, this.query(t.b), () => Terrain.rectDist(Player.pos.x, Player.pos.z, t.b), { signal: sig })
      .then((data) => { if (!rec.dead) { this.buildQueue.push({ rec, data }); this.pumpBuild(); } })
      .catch(() => { if (!rec.dead) this.status.failed++; });
  },
  unloadTile(t) {
    const rec = this.tiles.get(t.k);
    if (!rec) return;
    rec.dead = true;
    if (rec.sig && rec.sig.cancel) rec.sig.cancel();
    if (rec.group) { World0.disposeGroup(rec.group); }
    this.names = this.names.filter((n) => n.tile !== t.k);
    this.stops = this.stops.filter((n) => n.tile !== t.k);
    this.runways = this.runways.filter((n) => n.tile !== t.k);
    Traffic.removeTile(t.k);
    this.tiles.delete(t.k);
  },
  async pumpBuild() {
    if (this.building) return;
    this.building = true;
    while (this.buildQueue.length) {
      // 가까운 타일부터
      this.buildQueue.sort((a, b) => Terrain.rectDist(Player.pos.x, Player.pos.z, a.rec.b) - Terrain.rectDist(Player.pos.x, Player.pos.z, b.rec.b));
      const job = this.buildQueue.shift();
      if (job.rec.dead) continue;
      try { this.buildTile(job.rec, job.data); this.status.loaded++; } catch (e) { console.warn('tile build', e); this.status.failed++; }
      await new Promise((r) => requestAnimationFrame(() => r()));
    }
    this.building = false;
  },

  // ---------------------------------------------------------------- 타일 만들기
  buildTile(rec, data) {
    const b = rec.b, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const inTile = (x, z) => x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1;
    const els = data.elements || [];
    const group = new THREE.Group(); group.position.set(cx, 0, cz);
    rec.group = group; rec.cx = cx; rec.cz = cz;
    rec.cols = new Map(); rec.bridges = [];
    const W = new GeoBuf(), Rf = new GeoBuf(); // 벽, 지붕
    const roads = new GeoBuf(), paths = new GeoBuf(), rails = new GeoBuf(), decks = new GeoBuf();
    const piers = [];
    const parts = [];
    const outlines = [];
    for (const el of els) {
      const tg = el.tags || {};
      if (el.type === 'node') {
        const x = GEO.x(el.lon), z = GEO.z(el.lat);
        if (!inTile(x, z)) continue;
        if (tg.highway === 'bus_stop') this.stops.push({ tile: rec.k, id: el.id, name: tg.name || '정류장', x, z });
        if (tg.name) this.names.push({ tile: rec.k, name: tg.name, nameKo: tg['name:ko'] || '', x, z, kind: tg.tourism || tg.amenity || tg.leisure || tg.natural || tg.railway || '' });
        continue;
      }
      const rings = this.rings(el);
      if (!rings.length) continue;
      const c = centroid(rings[0]);
      if (el.type === 'way' && tg.name && (tg.tourism || tg.amenity || tg.leisure || tg.natural || (tg.building && !/^(yes|house|apartments|residential)$/.test(tg.building)))) {
        if (inTile(c.x, c.z)) this.names.push({ tile: rec.k, name: tg.name, nameKo: tg['name:ko'] || '', x: c.x, z: c.z, kind: tg.tourism || tg.amenity || tg.leisure || tg.natural || 'building' });
      }
      if (tg['building:part']) { if (inTile(c.x, c.z)) parts.push({ el, rings, c }); continue; }
      if (tg.building && (el.type === 'relation' || isClosed(el))) { if (inTile(c.x, c.z)) outlines.push({ el, rings, c }); continue; }
      if (el.type !== 'way') continue;
      // 길·철길은 중심점 타일에서만
      if (!inTile(c.x, c.z)) { if (tg.highway && !tg.tunnel) Traffic.addWay(rec.k, el, null); continue; }
      const pts = rings[0];
      if (tg.highway) {
        if (tg.tunnel === 'yes' || tg.tunnel === 'building_passage' || tg.area === 'yes') continue;
        const prof = this.profile(pts, tg);
        const w = roadWidth(tg);
        const foot = /^(footway|path|steps|pedestrian|cycleway|track|bridleway|corridor)$/.test(tg.highway);
        ribbon(foot ? paths : roads, pts, prof, w, cx, cz, !foot);
        if (prof.bridge) { this.addDeck(decks, piers, pts, prof, w, cx, cz); rec.bridges.push({ pts, h: prof.h, w }); }
        if (!foot) Traffic.addWay(rec.k, el, prof);
      } else if (tg.railway) {
        if (tg.tunnel === 'yes') continue;
        const prof = this.profile(pts, tg);
        ribbon(rails, pts, prof, tg.railway === 'rail' ? 4 : 3.2, cx, cz, false);
        if (prof.bridge) this.addDeck(decks, piers, pts, prof, 4, cx, cz);
      } else if (tg.aeroway) {
        const prof = this.profile(pts, tg);
        ribbon(roads, pts, prof, tg.aeroway === 'runway' ? 45 : 18, cx, cz, false);
        if (tg.aeroway === 'runway') this.runways.push({ tile: rec.k, a: pts[0], b: pts[pts.length - 1], ref: tg.ref || '' });
      } else if (tg.man_made) {
        const prof = { h: pts.map((p) => Math.max(Terrain.heightAt(p.x, p.z), 0) + 1.6), bridge: false };
        ribbon(paths, pts, prof, 6, cx, cz, false);
      }
    }
    // 부분(building:part)이 들어 있는 외곽선은 건너뛴다
    const partGrid = new SpatialGrid(30);
    for (const p of parts) partGrid.add(p.c.x, p.c.z, p);
    for (const o of outlines) {
      const bb = bbox(o.rings[0]);
      const inside = partGrid.queryRect(bb).some((p) => pointInRing(p.c.x, p.c.z, o.rings[0]));
      if (inside) { this.addCollider(rec, o.rings[0], bb); continue; }
      this.extrude(W, Rf, o, cx, cz, false);
      this.addCollider(rec, o.rings[0], bb);
    }
    for (const p of parts) this.extrude(W, Rf, p, cx, cz, true);
    const add = (buf, mat, shadow) => { const g = buf.build(); if (!g) return null; const m = new THREE.Mesh(g, mat); group.add(m); return m; };
    add(W, Mats.wall); add(Rf, Mats.roof);
    add(roads, Mats.road); add(paths, Mats.path); add(rails, Mats.rail); add(decks, Mats.bridge);
    if (piers.length) {
      const pg = new THREE.CylinderGeometry(1, 1, 1, 8); pg.translate(0, 0.5, 0);
      const im = new THREE.InstancedMesh(pg, Mats.bridge, piers.length);
      const m = new THREE.Matrix4();
      piers.forEach((p, i) => { m.compose(new THREE.Vector3(p.x, p.y0, p.z), new THREE.Quaternion(), new THREE.Vector3(p.r, Math.max(0.5, p.y1 - p.y0), p.r)); im.setMatrixAt(i, m); });
      group.add(im);
    }
    // 정류장 표지
    for (const s of this.stops.filter((s) => s.tile === rec.k)) {
      const sign = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), Mats.bridge); pole.position.y = 1.3; sign.add(pole);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.05), new THREE.MeshStandardMaterial({ color: 0x1e64c8, emissive: 0x0a2a60, emissiveIntensity: 0.6 })); plate.position.y = 2.5; sign.add(plate);
      const shelter = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 1.4), new THREE.MeshStandardMaterial({ color: 0x9aa8b4, transparent: true, opacity: 0.8 })); shelter.position.set(1.2, 2.4, 0.4); sign.add(shelter);
      sign.position.set(s.x - cx, Terrain.heightAt(s.x, s.z), s.z - cz);
      group.add(sign);
    }
    R.world.add(group);
    Places.onNames();
  },

  // way/relation → 좌표 고리 배열 (첫 번째가 외곽)
  rings(el) {
    const conv = (g) => g.map((p) => ({ x: GEO.x(p.lon), z: GEO.z(p.lat) }));
    if (el.type === 'way') return el.geometry && el.geometry.length > 1 ? [conv(el.geometry)] : [];
    if (el.type === 'relation' && el.members) {
      const outer = [], inner = [];
      for (const m of el.members) { if (m.type !== 'way' || !m.geometry) continue; (m.role === 'inner' ? inner : outer).push(conv(m.geometry)); }
      const o = joinRings(outer), i = joinRings(inner);
      if (!o.length) return [];
      o.sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
      return [o[0], ...i.filter((r) => r.length > 3)];
    }
    return [];
  },

  // 높이 단면: 다리는 양 끝 높이 사이를 띄운다
  profile(pts, tg) {
    const g = pts.map((p) => Math.max(Terrain.heightAt(p.x, p.z), 0));
    const bridge = tg.bridge && tg.bridge !== 'no';
    if (!bridge) return { h: g.map((v) => v + 0.3), bridge: false };
    const layer = parseInt(tg.layer || '1', 10) || 1;
    const major = /^(motorway|trunk|primary|secondary)/.test(tg.highway || '') || !!tg.railway;
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const L = len[len.length - 1] || 1;
    const h0 = g[0], h1 = g[g.length - 1];
    const h = pts.map((p, i) => {
      const t = len[i] / L, base = lerp(h0, h1, t);
      const water = Terrain.heightAt(p.x, p.z) < 1;
      const want = g[i] + (water ? (major ? 24 : 10) : 6.5) + Math.max(0, layer - 1) * 7;
      const ramp = base + 0.6 + Math.min(len[i], L - len[i]) * 0.1;
      return Math.max(base + 0.4, Math.min(want, ramp));
    });
    // 부드럽게
    const s = h.slice();
    for (let k = 0; k < 3; k++) for (let i = 1; i < s.length - 1; i++) s[i] = (s[i - 1] + s[i] * 2 + s[i + 1]) / 4;
    return { h: s, bridge: true };
  },
  addDeck(buf, piers, pts, prof, w, cx, cz) {
    // 상판 옆면과 아랫면
    const thick = 1.4;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l * w / 2, nz = dx / l * w / 2;
      const ha = prof.h[i] - 0.25, hb = prof.h[i + 1] - 0.25;
      for (const s of [-1, 1]) {
        const ax = a.x + nx * s - cx, az = a.z + nz * s - cz, bx = b.x + nx * s - cx, bz = b.z + nz * s - cz;
        buf.quad([ax, ha, az], [bx, hb, bz], [bx, hb - thick, bz], [ax, ha - thick, az], 0x9a9ea4, true);
      }
      buf.quad([a.x - nx - cx, ha - thick, a.z - nz - cz], [b.x - nx - cx, hb - thick, b.z - nz - cz], [b.x + nx - cx, hb - thick, b.z + nz - cz], [a.x + nx - cx, ha - thick, a.z + nz - cz], 0x7a7e84, true);
    }
    // 교각: 35m마다
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z);
      for (let d = 35 - acc; d < l; d += 35) {
        const t = d / l, x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t);
        const top = lerp(prof.h[i], prof.h[i + 1], t) - 1.5, ground = Terrain.heightAt(x, z);
        if (top - ground > 3) piers.push({ x: x - cx, z: z - cz, y0: Math.min(ground, -1), y1: top, r: w > 10 ? 1.6 : 0.9 });
      }
      acc = (acc + l) % 35;
    }
  },

  buildingHeight(tg, area, isPart) {
    let h = parseFloat(tg.height), minH = parseFloat(tg.min_height) || 0;
    const lv = parseFloat(tg['building:levels']), minLv = parseFloat(tg['building:min_level']);
    if (!minH && minLv) minH = minLv * 3.1;
    if (!(h > 0)) {
      if (lv > 0) h = lv * 3.1 + (tg['roof:levels'] ? parseFloat(tg['roof:levels']) * 2.5 : 0);
      else {
        const t = tg.building || tg['building:part'] || 'yes';
        const j = (hashStr(String(Math.round(area))) % 100) / 100;
        const D = { apartments: 38 + j * 18, residential: 12 + j * 6, house: 6 + j * 2, detached: 6 + j * 2, terrace: 8, commercial: 16 + j * 12, retail: 9 + j * 5, office: 28 + j * 22, hotel: 36 + j * 20, industrial: 11 + j * 5, warehouse: 9 + j * 4, school: 15, university: 18, college: 16, hospital: 24 + j * 10, church: 14, temple: 8, train_station: 14, transportation: 12, garage: 4, garages: 3.5, roof: 4, shed: 3, kiosk: 3, hut: 3, stadium: 30, parking: 12 };
        h = D[t] ?? (area > 3000 ? 20 + j * 10 : area > 800 ? 11 + j * 6 : 6 + j * 5);
      }
    }
    if (tg.building === 'roof' || tg['building:part'] === 'roof') minH = Math.max(minH, h - 1.5);
    return { h: Math.max(h, minH + 2), minH };
  },
  wallColor(tg, seed) {
    const c = tg['building:colour'] || tg.colour;
    if (c) { try { return new THREE.Color(c.trim()).getHex(); } catch (e) { /* 이름을 모르는 색 */ } }
    const t = tg.building || tg['building:part'] || 'yes';
    const pal = /apartments|residential/.test(t) ? [0xf0ede6, 0xe8e2d6, 0xdedad0, 0xf4f0ea, 0xd8d4cc]
      : /commercial|office|hotel|retail/.test(t) ? [0x9fb2c2, 0xb8c2cc, 0x8a9cac, 0xc8ccd0, 0xa8b8c8]
        : /industrial|warehouse/.test(t) ? [0xb4b0a6, 0xa8b0b4, 0xc0bcb0]
          : /house|detached|terrace/.test(t) ? [0xd8c8b0, 0xc8b8a0, 0xe0d4c0, 0xb8a890, 0xe8dcc8]
            : [0xd0ccc4, 0xc4c0b8, 0xdcd8d0, 0xb8b4ac, 0xe0dcd4];
    return pal[seed % pal.length];
  },
  roofColor(tg, seed) {
    const c = tg['roof:colour'];
    if (c) { try { return new THREE.Color(c.trim()).getHex(); } catch (e) { /* 무시 */ } }
    const pal = [0x8a8e92, 0x6e7a6a, 0x9a8a7a, 0x5a6a7a, 0xa0a4a8, 0x7a6a5e];
    return pal[(seed >> 3) % pal.length];
  },
  extrude(W, Rf, o, cx, cz, isPart) {
    const tg = o.el.tags || {};
    const outer = o.rings[0];
    if (outer.length < 4) return;
    const area = Math.abs(ringArea(outer));
    if (area < 6) return;
    const { h, minH } = this.buildingHeight(tg, area, isPart);
    let base = Infinity;
    for (const p of outer) base = Math.min(base, Terrain.heightAt(p.x, p.z));
    if (!isFinite(base)) base = 0;
    base = Math.max(base, -1);
    const y0 = base + minH - (minH ? 0 : 1.5), y1 = base + h;
    const seed = hashStr(String(o.el.id));
    const wc = this.wallColor(tg, seed), rc = this.roofColor(tg, seed);
    const rings = o.rings.map((r, i) => { const rr = r.slice(); if (rr.length > 1 && rr[0].x === rr[rr.length - 1].x && rr[0].z === rr[rr.length - 1].z) rr.pop(); const a = ringArea(rr); if ((i === 0 && a < 0) || (i > 0 && a > 0)) rr.reverse(); return rr; });
    for (const ring of rings) {
      let u = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const l = Math.hypot(b.x - a.x, b.z - a.z);
        W.wall(a.x - cx, a.z - cz, b.x - cx, b.z - cz, y0, y1, u / 8, (u + l) / 8, (y0 - base) / 3.2, (y1 - base) / 3.2, wc);
        u += l;
      }
    }
    // 지붕
    try {
      const contour = rings[0].map((p) => new THREE.Vector2(p.x - cx, p.z - cz));
      const holes = rings.slice(1).map((r) => r.map((p) => new THREE.Vector2(p.x - cx, p.z - cz)));
      const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
      const all = contour.concat(...holes);
      for (const [a, b, c] of tris) Rf.tri(all[a], all[b], all[c], y1, rc);
    } catch (e) { /* 꼬인 다각형 */ }
  },
  addCollider(rec, ring, bb) {
    const cell = 25;
    for (let gx = Math.floor(bb.x0 / cell); gx <= Math.floor(bb.x1 / cell); gx++) for (let gz = Math.floor(bb.z0 / cell); gz <= Math.floor(bb.z1 / cell); gz++) {
      const k = gx + ',' + gz; let a = rec.cols.get(k); if (!a) { a = []; rec.cols.set(k, a); } a.push(ring);
    }
  },
  tileAt(x, z) {
    const [tx, ty] = GEO.tileOfWorld(x, z, 15);
    return this.tiles.get('15/' + tx + '/' + ty);
  },
  // 건물 안이면 그 건물 외곽 고리를 돌려준다
  insideBuilding(x, z) {
    const rec = this.tileAt(x, z);
    if (!rec || !rec.cols) return null;
    const a = rec.cols.get(Math.floor(x / 25) + ',' + Math.floor(z / 25));
    if (!a) return null;
    for (const r of a) if (pointInRing(x, z, r)) return r;
    return null;
  },
  // 다리 위라면 상판 높이
  deckAt(x, z, y) {
    const rec = this.tileAt(x, z);
    let best = null;
    const check = (r) => {
      if (!r || !r.bridges) return;
      for (const br of r.bridges) {
        const p = br.pts;
        for (let i = 0; i < p.length - 1; i++) {
          const ax = p[i].x, az = p[i].z, bx = p[i + 1].x, bz = p[i + 1].z;
          const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
          const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
          const qx = ax + dx * t, qz = az + dz * t;
          if (Math.hypot(x - qx, z - qz) > br.w / 2 + 0.3) continue;
          const h = lerp(br.h[i], br.h[i + 1], t);
          if (y !== undefined && y < h - 3) continue;
          if (best === null || h > best) best = h;
        }
      }
    };
    check(rec);
    if (best === null) for (const r of this.tiles.values()) { if (r !== rec && Terrain.rectDist(x, z, r.b) < 40) check(r); }
    return best;
  },
  findName(qs, x, z, radius) {
    let best = null, bd = radius;
    for (const n of this.names) {
      const nm = normName(n.name), nk = normName(n.nameKo);
      if (!qs.some((q) => { const nq = normName(q); return nm === nq || nk === nq || (nq.length >= 3 && (nm.includes(nq) || nk.includes(nq))); })) continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  },
};

// ---------------------------------------------------------------------------
// 기하 도우미
// ---------------------------------------------------------------------------
class GeoBuf {
  constructor() { this.p = []; this.n = []; this.c = []; this.u = []; }
  push(v, color, uv) { this.p.push(v[0], v[1], v[2]); const c = new THREE.Color(color); this.c.push(c.r, c.g, c.b); this.u.push(uv ? uv[0] : 0, uv ? uv[1] : 0); }
  quad(a, b, c, d, color, both) {
    const tri = (p, q, r, uvs) => { this.push(p, color, uvs && uvs[0]); this.push(q, color, uvs && uvs[1]); this.push(r, color, uvs && uvs[2]); };
    tri(a, b, c); tri(a, c, d);
    if (both) { tri(a, c, b); tri(a, d, c); }
  }
  wall(ax, az, bx, bz, y0, y1, u0, u1, v0, v1, color) {
    const b1 = [ax, y0, az], b2 = [bx, y0, bz], t1 = [ax, y1, az], t2 = [bx, y1, bz];
    this.push(b1, color, [u0, v0]); this.push(t2, color, [u1, v1]); this.push(b2, color, [u1, v0]);
    this.push(b1, color, [u0, v0]); this.push(t1, color, [u0, v1]); this.push(t2, color, [u1, v1]);
  }
  tri(a, b, c, y, color) {
    // 위를 향하도록 감는 방향 보정
    const cr = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const pts = cr > 0 ? [a, c, b] : [a, b, c];
    for (const p of pts) this.push([p.x, y, p.y], color, [p.x / 10, p.y / 10]);
  }
  ribbonTri(p, q, r, uvp, uvq, uvr) { this.push(p, 0xffffff, uvp); this.push(q, 0xffffff, uvq); this.push(r, 0xffffff, uvr); }
  build() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.computeVertexNormals();
    return g;
  }
}
// 길 리본: 점마다 높이(prof.h)를 따라 폭 w로 깐다
function ribbon(buf, pts, prof, w, cx, cz, lanes) {
  // 12m 간격으로 잘게 나눠 지형을 따라가게
  const P = [], H = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(l / 12));
    for (let k = 0; k < n; k++) {
      const t = k / n, x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t);
      P.push({ x, z });
      H.push(prof.bridge ? lerp(prof.h[i], prof.h[i + 1], t) : Math.max(Terrain.heightAt(x, z), 0) + 0.3);
    }
  }
  P.push(pts[pts.length - 1]); H.push(prof.h[prof.h.length - 1]);
  if (P.length < 2) return;
  let v = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l * w / 2, nz = dx / l * w / 2;
    const v1 = v + l / (lanes ? 14 : 6);
    const A = [a.x + nx - cx, H[i], a.z + nz - cz], B = [a.x - nx - cx, H[i], a.z - nz - cz];
    const C = [b.x - nx - cx, H[i + 1], b.z - nz - cz], D = [b.x + nx - cx, H[i + 1], b.z + nz - cz];
    buf.ribbonTri(A, C, B, [0, v], [1, v1], [1, v]);
    buf.ribbonTri(A, D, C, [0, v], [0, v1], [1, v1]);
    v = v1;
  }
}
function roadWidth(tg) {
  const w = parseFloat(tg.width); if (w > 1 && w < 60) return w;
  const lanes = parseInt(tg.lanes, 10);
  const base = { motorway: 14, trunk: 13, primary: 12, secondary: 10, tertiary: 8, unclassified: 6, residential: 6, living_street: 5, service: 4, motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 6, tertiary_link: 6, pedestrian: 6, footway: 2, path: 1.6, steps: 2, cycleway: 2, track: 3 }[tg.highway] ?? 5;
  return lanes > 0 && lanes < 12 ? Math.max(base * 0.6, lanes * 3.3) : base;
}
function isClosed(el) { const g = el.geometry; return g && g.length > 3 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon; }
function ringArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p.x * q.z - q.x * p.z; } return a / 2; }
function centroid(r) { let x = 0, z = 0; for (const p of r) { x += p.x; z += p.z; } return { x: x / r.length, z: z / r.length }; }
function bbox(r) { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const p of r) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); } return { x0, x1, z0, z1 }; }
function pointInRing(x, z, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
// 여러 조각난 선을 끝점끼리 이어 고리로 만든다
function joinRings(segs) {
  const out = [], pool = segs.map((s) => s.slice());
  const same = (a, b) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.z - b.z) < 0.01;
  while (pool.length) {
    let cur = pool.shift();
    let guard = 0;
    while (!same(cur[0], cur[cur.length - 1]) && guard++ < 500) {
      const end = cur[cur.length - 1];
      const i = pool.findIndex((s) => same(s[0], end) || same(s[s.length - 1], end));
      if (i < 0) break;
      let s = pool.splice(i, 1)[0];
      if (!same(s[0], end)) s = s.reverse();
      cur = cur.concat(s.slice(1));
    }
    if (cur.length > 3) out.push(cur);
  }
  return out;
}
class SpatialGrid {
  constructor(cell) { this.cell = cell; this.m = new Map(); }
  add(x, z, v) { const k = Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell); let a = this.m.get(k); if (!a) { a = []; this.m.set(k, a); } a.push(v); }
  queryRect(b) { const out = []; for (let gx = Math.floor(b.x0 / this.cell); gx <= Math.floor(b.x1 / this.cell); gx++) for (let gz = Math.floor(b.z0 / this.cell); gz <= Math.floor(b.z1 / this.cell); gz++) { const a = this.m.get(gx + ',' + gz); if (a) out.push(...a); } return out; }
}
const World0 = {
  disposeGroup(g) {
    g.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.material && !Object.values(Mats).includes(o.material)) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    g.removeFromParent();
  },
};
