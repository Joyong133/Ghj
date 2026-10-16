// ---------------------------------------------------------------------------
// 도시: OSM 타일 데이터를 건물·간판·도로·보도·가로시설·다리·항만으로 만든다.
// 각 길·건물은 중심점이 들어 있는 타일 하나에서만 만든다(타일 간 중복 방지).
// ---------------------------------------------------------------------------
const City = {
  tiles: new Map(),
  buildQueue: [], building: false,
  names: [], stops: [], runways: [],
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
way["man_made"~"^(pier|breakwater|crane|tower|lighthouse)$"](${bb});
node["man_made"~"^(crane|tower|lighthouse)$"](${bb});
way["landuse"~"^(port|harbour)$"](${bb});
way["landuse"="industrial"]["name"](${bb});
way["natural"="beach"](${bb});
node["highway"="bus_stop"](${bb});
node["shop"]["name"](${bb});
node["amenity"~"^(restaurant|cafe|fast_food|bank|pharmacy|bar|pub|clinic|dentist|ice_cream|food_court|hospital)$"]["name"](${bb});
node["name"]["tourism"](${bb});
node["name"]["railway"="station"](${bb});
way["name"]["tourism"](${bb});
way["name"]["amenity"~"^(university|college|school|hospital|marketplace|place_of_worship)$"](${bb});
way["name"]["leisure"~"^(park|stadium|garden)$"](${bb});
node["name"]["amenity"~"^(university|college|marketplace)$"](${bb});
node["name"]["leisure"~"^(park|stadium)$"](${bb});
node["name"]["natural"~"^(peak|beach|cape)$"](${bb});
);out geom qt;`;
  },

  requestTile(t) {
    const rec = { t, b: t.b, k: t.k, dead: false, group: null };
    this.tiles.set(t.k, rec);
    const sig = {};
    rec.sig = sig;
    Net.overpass('t15v2/' + t.x + '/' + t.y, this.query(t.b), () => Terrain.rectDist(Player.pos.x, Player.pos.z, t.b), { signal: sig })
      .then((data) => { if (!rec.dead) { this.buildQueue.push({ rec, data }); this.pumpBuild(); } })
      .catch(() => { if (!rec.dead) this.status.failed++; });
  },
  unloadTile(t) {
    const rec = this.tiles.get(t.k);
    if (!rec) return;
    rec.dead = true;
    if (rec.sig && rec.sig.cancel) rec.sig.cancel();
    if (rec.group) {
      rec.group.traverse((o) => { const i = o.material ? Mats.lampMats.indexOf(o.material) : -1; if (i > 0) Mats.lampMats.splice(i, 1); });
      World0.disposeGroup(rec.group);
    }
    if (rec.signMat) { const i = Mats.signMats.indexOf(rec.signMat); if (i >= 0) Mats.signMats.splice(i, 1); }
    this.names = this.names.filter((n) => n.tile !== t.k);
    this.stops = this.stops.filter((n) => n.tile !== t.k);
    this.runways = this.runways.filter((n) => n.tile !== t.k);
    Traffic.removeTile(t.k);
    BridgeFX.removeTile(t.k);
    this.tiles.delete(t.k);
  },
  async pumpBuild() {
    if (this.building) return;
    this.building = true;
    while (this.buildQueue.length) {
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
    const I = Decor.newInst(); // 인스턴스로 그릴 소품 목록
    const W = new GeoBuf(), Rf = new GeoBuf(), Solid = new GeoBuf();
    const roads = new GeoBuf(), roads2 = new GeoBuf(), walks = new GeoBuf(), curbs = new GeoBuf(), paths = new GeoBuf(), rails = new GeoBuf(), decks = new GeoBuf(), sand = new GeoBuf();
    const piers = [], parts = [], outlines = [], shops = [], ports = [];
    const edges = new SpatialGrid(20); // 간판 붙일 벽
    // 교차로 찾기: 모든 차도 노드가 몇 개의 길에 쓰이는지
    const nodeUse = new Map();
    for (const el of els) if (el.type === 'way' && el.tags && Traffic.DRIVE.test(el.tags.highway || '') && el.nodes) for (const n of el.nodes) nodeUse.set(n, (nodeUse.get(n) || 0) + 1);
    let dense = 0;
    for (const el of els) if (el.tags && el.tags.building) dense++;
    const urban = dense > 40;

    for (const el of els) {
      const tg = el.tags || {};
      if (el.type === 'node') {
        const x = GEO.x(el.lon), z = GEO.z(el.lat);
        if (!inTile(x, z)) continue;
        if (tg.highway === 'bus_stop') this.stops.push({ tile: rec.k, id: el.id, name: tg.name || '정류장', x, z });
        if (tg.shop || (tg.amenity && !/^(university|college|marketplace)$/.test(tg.amenity))) { if (tg.name) shops.push({ name: tg.name, kind: tg.amenity || tg.shop, x, z }); continue; }
        if (tg.man_made === 'crane') { I.cranes.push({ x, z, yaw: 0 }); continue; }
        if (tg.man_made === 'tower' || tg.man_made === 'lighthouse') { Decor.tower(group, x - cx, z - cz, tg); }
        if (tg.name) this.names.push({ tile: rec.k, name: tg.name, nameKo: tg['name:ko'] || '', x, z, kind: tg.tourism || tg.amenity || tg.leisure || tg.natural || tg.railway || tg.man_made || '' });
        continue;
      }
      const rings = this.rings(el);
      if (!rings.length) continue;
      const c = centroid(rings[0]);
      const here = inTile(c.x, c.z);
      if (el.type === 'way' && tg.name && (tg.tourism || tg.amenity || tg.leisure || tg.natural) && here) this.names.push({ tile: rec.k, name: tg.name, nameKo: tg['name:ko'] || '', x: c.x, z: c.z, kind: tg.tourism || tg.amenity || tg.leisure || tg.natural });
      if (tg['building:part']) { if (here) parts.push({ el, rings, c }); continue; }
      if (tg.building && (el.type === 'relation' || isClosed(el))) {
        if (here) { outlines.push({ el, rings, c }); if (tg.name && !/^(yes|house|apartments|residential)$/.test(tg.building)) this.names.push({ tile: rec.k, name: tg.name, nameKo: tg['name:ko'] || '', x: c.x, z: c.z, kind: 'building' }); }
        continue;
      }
      if (el.type !== 'way') continue;
      if (!here) { if (tg.highway && tg.tunnel !== 'yes') Traffic.addWay(rec.k, el, null); continue; }
      const pts = rings[0];
      if (tg.highway) {
        if (tg.tunnel === 'yes' || tg.tunnel === 'building_passage' || tg.area === 'yes') continue;
        const prof = this.profile(pts, tg);
        const w = roadWidth(tg);
        const foot = /^(footway|path|steps|pedestrian|cycleway|track|bridleway|corridor)$/.test(tg.highway);
        const wide = !foot && (w >= 9 || /^(primary|secondary|trunk|motorway)/.test(tg.highway));
        ribbon(foot ? paths : wide ? roads : roads2, pts, prof, w, cx, cz, !foot);
        if (prof.bridge) {
          this.addDeck(decks, piers, pts, prof, w, cx, cz); rec.bridges.push({ pts, h: prof.h, w });
          if (tg.name) BridgeFX.add(tg.name, pts, prof.h, rec.k, w);
        } else if (!foot) Decor.street(I, walks, curbs, el, pts, prof, w, tg, cx, cz, urban, nodeUse);
        if (!foot) Traffic.addWay(rec.k, el, prof, w);
      } else if (tg.railway) {
        if (tg.tunnel === 'yes') continue;
        const prof = this.profile(pts, tg);
        ribbon(rails, pts, prof, tg.railway === 'rail' ? 4 : 3.2, cx, cz, false);
        if (prof.bridge) this.addDeck(decks, piers, pts, prof, 4, cx, cz);
      } else if (tg.aeroway) {
        const prof = this.profile(pts, tg);
        ribbon(roads2, pts, prof, tg.aeroway === 'runway' ? 45 : 18, cx, cz, false);
        if (tg.aeroway === 'runway') this.runways.push({ tile: rec.k, a: pts[0], b: pts[pts.length - 1], ref: tg.ref || '' });
      } else if (tg.man_made === 'crane') {
        const a = pts[0], z2 = pts[pts.length - 1];
        I.cranes.push({ x: (a.x + z2.x) / 2, z: (a.z + z2.z) / 2, yaw: Math.atan2(z2.x - a.x, z2.z - a.z) });
      } else if (tg.man_made === 'tower' || tg.man_made === 'lighthouse') {
        Decor.tower(group, c.x - cx, c.z - cz, tg);
      } else if (tg.man_made) {
        const prof = { h: pts.map((p) => Math.max(Terrain.heightAt(p.x, p.z), 0) + 1.6), bridge: false };
        ribbon(paths, pts, prof, 6, cx, cz, false);
      } else if (tg.landuse) {
        if (tg.landuse !== 'industrial' || /부두|터미널|항만|컨테이너|port|terminal/i.test(tg.name || '')) ports.push(rings[0]);
      } else if (tg.natural === 'beach') {
        this.sandPatch(sand, rings, cx, cz);
      }
    }
    // 건물
    const partGrid = new SpatialGrid(30);
    for (const p of parts) partGrid.add(p.c.x, p.c.z, p);
    let signN = 0;
    const signs = [];
    const signCanvas = Atlas.signCanvas();
    const addSign = (text, kind, a, bb, t, y, h) => {
      const cell = Atlas.drawSign(signCanvas, signN, text, kind);
      if (!cell) return false;
      signN++;
      signs.push({ cell, a, b: bb, t, y, h });
      return true;
    };
    const signable = [];
    for (const o of outlines) {
      const bb = bbox(o.rings[0]);
      const inside = partGrid.queryRect(bb).some((p) => pointInRing(p.c.x, p.c.z, o.rings[0]));
      this.addCollider(rec, o.rings[0], bb);
      if (inside) continue;
      const info = this.extrude(W, Rf, Solid, I, o, cx, cz, false, addSign);
      if (info) { signable.push(info); for (const e of info.edges) edges.add((e.a.x + e.b.x) / 2, (e.a.z + e.b.z) / 2, e); }
    }
    for (const p of parts) this.extrude(W, Rf, Solid, I, p, cx, cz, true, addSign);
    // 실제 상호 간판 (가장 가까운 벽에)
    shops.sort((a, b) => a.name.length - b.name.length);
    const used = new Map();
    for (const s of shops) {
      let best = null, bd = 16, bt = 0;
      for (const e of edges.queryRect({ x0: s.x - 20, x1: s.x + 20, z0: s.z - 20, z1: s.z + 20 })) {
        const dx = e.b.x - e.a.x, dz = e.b.z - e.a.z, l2 = dx * dx + dz * dz; if (l2 < 9) continue;
        const t = clamp(((s.x - e.a.x) * dx + (s.z - e.a.z) * dz) / l2, 0.1, 0.9);
        const d = Math.hypot(s.x - (e.a.x + dx * t), s.z - (e.a.z + dz * t));
        if (d < bd) { bd = d; best = e; bt = t; }
      }
      if (!best) continue;
      const k = used.get(best) || 0; used.set(best, k + 1);
      if (k > 3) continue;
      if (!addSign(s.name, s.kind, best.a, best.b, bt, best.base + (best.store ? 3.5 : 3.0) + k * 1.2, 0.95)) break;
    }
    // 장식 간판: 상가 1층과 위층 (업종 단어)
    const rnd = mulberry32(hashStr(rec.k));
    for (const info of signable) {
      if (!info.store && !info.upper) continue;
      for (const e of info.edges) {
        const l = Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z);
        if (l < 6 || used.has(e)) continue;
        if (info.store && rnd() < 0.75) { const [w, k] = GENERIC_SIGNS.ground[Math.floor(rnd() * GENERIC_SIGNS.ground.length)]; addSign(w, k, e.a, e.b, 0.3 + rnd() * 0.4, e.base + 3.5, 0.95); }
        if (info.upper && l > 8) for (let f = 1; f < Math.min(info.floors, 5); f++) { if (rnd() < 0.45) { const [w, k] = GENERIC_SIGNS.upper[Math.floor(rnd() * GENERIC_SIGNS.upper.length)]; addSign(w, k, e.a, e.b, 0.25 + rnd() * 0.5, e.base + 4.5 + f * 3.3 + 1.2, 0.85); } }
      }
    }
    if (signs.length) {
      const sb = new GeoBuf();
      for (const s of signs) {
        const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
        const nx = uz, nz = -ux; // 바깥쪽
        const w = Math.min(l * 0.85, s.h * s.cell.aspect);
        const mx = s.a.x + dx * s.t + nx * 0.1, mz = s.a.z + dz * s.t + nz * 0.1;
        const p1 = [mx - ux * w / 2 - cx, s.y, mz - uz * w / 2 - cz], p2 = [mx + ux * w / 2 - cx, s.y, mz + uz * w / 2 - cz];
        const p3 = [p2[0], s.y + s.h, p2[2]], p4 = [p1[0], s.y + s.h, p1[2]];
        const { u0, u1, v0, v1 } = s.cell;
        // 바깥에서 보면 왼쪽(p2)이 글자 시작이 되도록
        sb.push(p2, 0xffffff, [u0, v0]); sb.push(p1, 0xffffff, [u1, v0]); sb.push(p4, 0xffffff, [u1, v1]);
        sb.push(p2, 0xffffff, [u0, v0]); sb.push(p4, 0xffffff, [u1, v1]); sb.push(p3, 0xffffff, [u0, v1]);
      }
      const tex = new THREE.CanvasTexture(signCanvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.12 + 1.1 * R.nightU.value, roughness: 0.6 });
      Mats.signMats.push(mat); rec.signMat = mat;
      const g = sb.build(); if (g) group.add(new THREE.Mesh(g, mat));
    }
    // 항만
    for (const ring of ports) Decor.portYard(I, ring, rec);
    const add = (buf, mat, cast, recv = true) => { const g = buf.build(); if (!g) return null; const m = new THREE.Mesh(g, mat); m.castShadow = cast; m.receiveShadow = recv; group.add(m); return m; };
    add(W, Mats.wall, true); add(Rf, Mats.roof, true); add(Solid, Mats.solid, true);
    add(roads, Mats.road, false); add(roads2, Mats.road2, false); add(walks, Mats.sidewalk, false); add(curbs, Mats.curb, false);
    add(paths, Mats.path, false); add(rails, Mats.rail, false); add(decks, Mats.bridge, true); add(sand, Mats.sand || (Mats.sand = new THREE.MeshStandardMaterial({ color: 0xe2cfa6, roughness: 1 })), false);
    for (const p of piers) I.piers.push(p);
    // 정류장 표지
    for (const s of this.stops.filter((s) => s.tile === rec.k)) I.stops.push({ x: s.x - cx, z: s.z - cz, y: Terrain.heightAt(s.x, s.z) });
    Decor.flush(I, group, rec);
    R.world.add(group);
    Places.onNames();
  },

  sandPatch(buf, rings, cx, cz) {
    try {
      const contour = rings[0].map((p) => new THREE.Vector2(p.x - cx, p.z - cz));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      for (const [a, b, c] of tris) {
        const pts = [contour[a], contour[b], contour[c]];
        const cr = (pts[1].x - pts[0].x) * (pts[2].y - pts[0].y) - (pts[1].y - pts[0].y) * (pts[2].x - pts[0].x);
        const order = cr > 0 ? [0, 2, 1] : [0, 1, 2];
        for (const k of order) { const p = pts[k]; buf.push([p.x, Math.max(Terrain.heightAt(p.x + cx, p.y + cz), 0) + 0.12, p.y], 0xffffff, [p.x / 8, p.y / 8]); }
      }
    } catch (e) { /* 꼬인 다각형 */ }
  },

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
    const s = h.slice();
    for (let k = 0; k < 3; k++) for (let i = 1; i < s.length - 1; i++) s[i] = (s[i - 1] + s[i] * 2 + s[i + 1]) / 4;
    return { h: s, bridge: true };
  },
  addDeck(buf, piers, pts, prof, w, cx, cz) {
    const thick = 1.4;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l * w / 2, nz = dx / l * w / 2;
      const ha = prof.h[i] - 0.25, hb = prof.h[i + 1] - 0.25;
      for (const s of [-1, 1]) {
        const ax = a.x + nx * s - cx, az = a.z + nz * s - cz, bx = b.x + nx * s - cx, bz = b.z + nz * s - cz;
        buf.quad([ax, ha, az], [bx, hb, bz], [bx, hb - thick, bz], [ax, ha - thick, az], 0x9a9ea4, true);
        buf.quad([ax, ha + 1.0, az], [bx, hb + 1.0, bz], [bx, hb, bz], [ax, ha, az], 0xc8ccd0, true); // 난간
      }
      buf.quad([a.x - nx - cx, ha - thick, a.z - nz - cz], [b.x - nx - cx, hb - thick, b.z - nz - cz], [b.x + nx - cx, hb - thick, b.z + nz - cz], [a.x + nx - cx, ha - thick, a.z + nz - cz], 0x7a7e84, true);
    }
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

  buildingHeight(tg, area) {
    let h = parseFloat(tg.height), minH = parseFloat(tg.min_height) || 0;
    const lv = parseFloat(tg['building:levels']), minLv = parseFloat(tg['building:min_level']);
    if (!minH && minLv) minH = minLv * 3.1;
    if (!(h > 0)) {
      if (lv > 0) h = lv * 3.0 + (tg['roof:levels'] ? parseFloat(tg['roof:levels']) * 2.5 : 0);
      else {
        const t = tg.building || tg['building:part'] || 'yes';
        const j = (hashStr(String(Math.round(area))) % 100) / 100;
        const D = { apartments: 38 + j * 18, residential: 11 + j * 5, house: 6 + j * 2, detached: 6 + j * 2, terrace: 8, commercial: 14 + j * 12, retail: 9 + j * 6, office: 28 + j * 22, hotel: 36 + j * 20, industrial: 11 + j * 5, warehouse: 9 + j * 4, school: 15, university: 18, college: 16, kindergarten: 8, hospital: 24 + j * 10, church: 14, temple: 8, train_station: 14, transportation: 12, garage: 4, garages: 3.5, roof: 4, shed: 3, kiosk: 3, hut: 3, stadium: 30, parking: 12 };
        h = D[t] ?? (area > 3000 ? 18 + j * 10 : area > 700 ? 11 + j * 8 : area > 200 ? 8 + j * 7 : 6 + j * 4);
      }
    }
    if (tg.building === 'roof' || tg['building:part'] === 'roof') minH = Math.max(minH, h - 1.5);
    return { h: Math.max(h, minH + 2), minH };
  },
  // 건물 종류 → 외벽 양식
  styleOf(tg, h, area, seed) {
    const t = tg.building || tg['building:part'] || 'yes';
    const hanok = tg.religion === 'buddhist' || /^(temple|shrine)$/.test(t) || tg.historic || tg['building:architecture'] === 'hanok';
    if (hanok) return { kind: 'temple', main: FACADE.TEMPLE };
    if (t === 'apartments' || (t === 'residential' && h > 20)) return { kind: 'apt', main: seed % 3 ? FACADE.APT_A : FACADE.APT_B, side: FACADE.APT_SIDE };
    if (/^(house|detached|bungalow|semidetached_house|farm)$/.test(t)) return { kind: 'house', main: FACADE.HOUSE };
    if (t === 'residential' || (t === 'yes' && h <= 15 && area < 450 && seed % 3 === 0)) return { kind: 'villa', main: seed % 4 ? FACADE.VILLA : FACADE.HOUSE };
    if (t === 'hotel') return { kind: 'tower', main: FACADE.HOTEL };
    if (t === 'office' || h > 55) return { kind: 'tower', main: seed % 3 ? FACADE.OFFICE_GLASS : FACADE.OFFICE_GRID };
    if (/^(industrial|warehouse|manufacture|hangar)$/.test(t)) return { kind: 'industrial', main: FACADE.INDUSTRIAL };
    if (/^(school|university|college|kindergarten)$/.test(t) || /school|university|college|kindergarten/.test(tg.amenity || '')) return { kind: 'school', main: FACADE.SCHOOL };
    if (t === 'parking' || tg.amenity === 'parking') return { kind: 'parking', main: FACADE.PARKING };
    if (/^(train_station|transportation|public|civic|government|hospital)$/.test(t)) return { kind: 'public', main: FACADE.STATION };
    if (/^(commercial|retail|mixed_use)$/.test(t) || (t === 'yes' && h >= 7 && h <= 32 && area > 80 && area < 2500 && seed % 5 < 3)) return { kind: 'shop', main: FACADE.SHOP_UPPER, store: true };
    return { kind: 'plain', main: seed % 2 ? FACADE.PLAIN : FACADE.SHOP_UPPER };
  },
  wallTint(tg, kind, seed) {
    const c = tg['building:colour'] || tg.colour;
    if (c) { try { const col = new THREE.Color(c.trim()); return col.lerp(new THREE.Color(1, 1, 1), 0.35).getHex(); } catch (e) { /* 모르는 색 이름 */ } }
    const pal = { apt: [0xffffff, 0xfaf6ee, 0xf4f0e6, 0xfffaf2], villa: [0xffffff, 0xf0e8e0, 0xe8e0d8], house: [0xffffff, 0xf4ecdc, 0xe8e4dc], shop: [0xffffff, 0xf2eee8, 0xe8ecf0, 0xf8f0e4] };
    const p = pal[kind] || [0xffffff, 0xf0f0ec, 0xe8e8e4];
    return p[seed % p.length];
  },
  extrude(W, Rf, Solid, I, o, cx, cz, isPart, addSign) {
    const tg = o.el.tags || {};
    const outer = o.rings[0];
    if (outer.length < 4) return null;
    const area = Math.abs(ringArea(outer));
    if (area < 6) return null;
    const { h, minH } = this.buildingHeight(tg, area);
    let base = Infinity;
    for (const p of outer) base = Math.min(base, Terrain.heightAt(p.x, p.z));
    if (!isFinite(base)) base = 0;
    base = Math.max(base, -1);
    const seed = hashStr(String(o.el.id));
    const st = this.styleOf(tg, h, area, seed);
    const y0 = base + minH - (minH ? 0 : 1.5), y1 = base + h;
    const tint = this.wallTint(tg, st.kind, seed);
    const rings = o.rings.map((r, i) => { const rr = r.slice(); if (rr.length > 1 && rr[0].x === rr[rr.length - 1].x && rr[0].z === rr[rr.length - 1].z) rr.pop(); const a = ringArea(rr); if ((i === 0 && a < 0) || (i > 0 && a > 0)) rr.reverse(); return rr; });
    const storeTop = st.store && !minH && h > 6 ? base + 4.5 : null;
    W.seed = (seed % 1000) / 1000 * 0.4;
    const edges = [];
    for (let ri = 0; ri < rings.length; ri++) {
      const ring = rings[ri];
      let u = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const l = Math.hypot(b.x - a.x, b.z - a.z);
        if (l < 0.05) continue;
        let style = st.main;
        if (st.kind === 'apt' && l < 14) style = st.side;
        const unit = FACADE_UNIT[style];
        const ax = a.x - cx, az = a.z - cz, bx = b.x - cx, bz = b.z - cz;
        if (storeTop) {
          const su = FACADE_UNIT[FACADE.STOREFRONT];
          W.wall(ax, az, bx, bz, y0, storeTop, u / su[0], (u + l) / su[0], (y0 - base) / su[1], 1, tint, FACADE.STOREFRONT);
          W.wall(ax, az, bx, bz, storeTop, y1, u / unit[0], (u + l) / unit[0], 0, (y1 - storeTop) / unit[1], tint, style);
        } else {
          W.wall(ax, az, bx, bz, y0, y1, u / unit[0], (u + l) / unit[0], (y0 - base) / unit[1], (y1 - base) / unit[1], tint, style);
        }
        if (ri === 0 && !isPart && l > 3) edges.push({ a, b, base, store: !!storeTop });
        u += l;
      }
    }
    // 지붕
    const ctr = centroid(rings[0]);
    let longest = 0, axisYaw = 0;
    for (let i = 0; i < rings[0].length; i++) { const a = rings[0][i], b = rings[0][(i + 1) % rings[0].length]; const l = Math.hypot(b.x - a.x, b.z - a.z); if (l > longest) { longest = l; axisYaw = Math.atan2(b.x - a.x, b.z - a.z); } }
    const shape = tg['roof:shape'];
    const pitched = st.kind === 'temple' || shape === 'gabled' || shape === 'hipped' || shape === 'pyramidal' || (st.kind === 'house' && seed % 3 !== 0) || (st.kind === 'villa' && h < 9 && seed % 4 === 0);
    if (pitched && rings.length === 1 && rings[0].length <= 12 && (area < 450 || st.kind === 'temple' || shape)) {
      const roofCol = st.kind === 'temple' ? 0x3c4044 : [0xb0483a, 0x3a5a8a, 0x4a6a4a, 0x6a4a3a, 0x8a3a3a][seed % 5];
      this.pitchedRoof(Rf, rings[0], cx, cz, y1, st.kind === 'temple' ? 1.6 : 0.5, roofCol, st.kind === 'temple');
    } else {
      let rc = 0x9a9890;
      if (st.kind === 'villa' || st.kind === 'house' || (st.kind === 'shop' && area < 700) || (st.kind === 'plain' && area < 600)) rc = seed % 5 < 3 ? [0x5f9a74, 0x6aa07a, 0x58906c][seed % 3] : 0x9a9890; // 옥상 초록 방수 페인트
      else if (st.kind === 'industrial') rc = seed % 5 < 3 ? 0x3a6aa8 : 0x8a949c;
      else if (st.kind === 'apt') rc = 0xa8a49a;
      try {
        const contour = rings[0].map((p) => new THREE.Vector2(p.x - cx, p.z - cz));
        const holes = rings.slice(1).map((r) => r.map((p) => new THREE.Vector2(p.x - cx, p.z - cz)));
        const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
        const all = contour.concat(...holes);
        for (const [a, b, c] of tris) Rf.tri(all[a], all[b], all[c], y1, rc);
      } catch (e) { /* 꼬인 다각형 */ }
      // 난간과 옥상 시설
      if (!isPart && h > 7) {
        const par = st.kind === 'apt' ? 1.4 : 0.9;
        for (let i = 0; i < rings[0].length; i++) { const a = rings[0][i], b = rings[0][(i + 1) % rings[0].length]; Solid.quad([a.x - cx, y1 + par, a.z - cz], [b.x - cx, y1 + par, b.z - cz], [b.x - cx, y1, b.z - cz], [a.x - cx, y1, a.z - cz], 0xd8d4cc, true); }
        if (st.kind === 'apt' && area > 200) I.boxes.push({ x: ctr.x - cx, z: ctr.z - cz, y: y1, sx: Math.min(9, longest * 0.25), sy: 3.4, sz: 5, yaw: axisYaw, c: 0xe8e4dc });
        else if (area > 60 && area < 3000 && h < 50) {
          const rnd = mulberry32(seed);
          const bb = bbox(rings[0]);
          for (let k = 0; k < 1 + Math.floor(area / 400) && k < 4; k++) {
            const x = lerp(bb.x0, bb.x1, 0.2 + rnd() * 0.6), z = lerp(bb.z0, bb.z1, 0.2 + rnd() * 0.6);
            if (!pointInRing(x, z, rings[0])) continue;
            if (rnd() < 0.45) I.tanks.push({ x: x - cx, z: z - cz, y: y1, r: 0.9 + rnd() * 0.6, h: 1.6 + rnd(), c: [0x4a7ab8, 0xd8d8d0, 0x5a9a6a][Math.floor(rnd() * 3)] });
            else I.boxes.push({ x: x - cx, z: z - cz, y: y1, sx: 1 + rnd() * 1.5, sy: 0.9 + rnd() * 0.8, sz: 0.8 + rnd(), yaw: axisYaw, c: 0xc8ccd0 });
          }
        }
      }
    }
    // 교회 첨탑과 빨간 십자가
    if ((tg.religion === 'christian' || tg.building === 'church' || tg.building === 'chapel') && !isPart) I.crosses.push({ x: ctr.x - cx, z: ctr.z - cz, y: y1 });
    // 아파트 동 번호
    const nm = tg.name || tg['addr:housenumber'] || '';
    const m = nm.match(/(\d{2,4})\s*동/) || (st.kind === 'apt' && nm.match(/^(\d{3,4})$/));
    if (m && st.kind === 'apt' && addSign && !isPart) {
      const ends = edges.map((e) => ({ e, l: Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z) })).sort((a, b) => a.l - b.l).slice(0, 2);
      for (const { e, l } of ends) if (l > 6) addSign(`${m[1]}동`, 'aptno', e.a, e.b, 0.5, y1 - 7, 3.2);
    }
    const floors = Math.max(1, Math.round(h / 3.2));
    return { edges, store: !!storeTop, upper: st.kind === 'shop' && floors >= 3, floors };
  },
  // 경사 지붕: 사각형이면 용마루가 있는 우진각, 아니면 사방 지붕. hanok이면 처마를 내밀고 끝을 들어 올린다
  pitchedRoof(Rf, ring, cx, cz, y1, over, color, hanok) {
    const c = centroid(ring);
    const pts = ring.map((p) => { const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz) || 1; return { x: p.x + dx / d * over, z: p.z + dz / d * over }; });
    let minD = Infinity; for (const p of ring) minD = Math.min(minD, Math.hypot(p.x - c.x, p.z - c.z));
    // 지붕 높이는 집 크기에 맞추되 너무 높아지지 않게 (주택 2~4m, 절집 6m까지)
    const rise = clamp(minD * (hanok ? 0.55 : 0.4), 1.2, hanok ? 6 : 4);
    const eave = y1 + (hanok ? 0.2 : 0.05);
    const corner = (i) => eave + (hanok ? 0.6 : 0);
    const T = (p, y) => new THREE.Vector3(p.x - cx, y, p.z - cz);
    const col = new THREE.Color(color);
    const tri = (a, b, c2) => {
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c2, a));
      const v = n.y < 0 ? [a, c2, b] : [a, b, c2];
      for (const q of v) Rf.push([q.x, q.y, q.z], col, [0, 0]);
    };
    if (pts.length === 4) {
      // 긴 변 방향으로 용마루
      const l01 = Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z), l12 = Math.hypot(pts[2].x - pts[1].x, pts[2].z - pts[1].z);
      const [a, b, cc, d] = l01 >= l12 ? pts : [pts[1], pts[2], pts[3], pts[0]];
      const m1 = { x: (a.x + d.x) / 2, z: (a.z + d.z) / 2 }, m2 = { x: (b.x + cc.x) / 2, z: (b.z + cc.z) / 2 };
      const k = Math.min(0.35, (Math.min(l01, l12) / Math.max(l01, l12)) * 0.5);
      const r1 = { x: lerp(m1.x, m2.x, k), z: lerp(m1.z, m2.z, k) }, r2 = { x: lerp(m2.x, m1.x, k), z: lerp(m2.z, m1.z, k) };
      const top = eave + rise;
      const A = T(a, corner()), B = T(b, corner()), C = T(cc, corner()), D = T(d, corner()), R1 = T(r1, top), R2 = T(r2, top);
      tri(A, B, R2); tri(A, R2, R1); tri(C, D, R1); tri(C, R1, R2); tri(B, C, R2); tri(D, A, R1);
    } else {
      const apex = T(c, eave + rise);
      for (let i = 0; i < pts.length; i++) tri(T(pts[i], corner()), T(pts[(i + 1) % pts.length], corner()), apex);
    }
  },
  addCollider(rec, ring, bb) {
    const cell = 25;
    for (let gx = Math.floor(bb.x0 / cell); gx <= Math.floor(bb.x1 / cell); gx++) for (let gz = Math.floor(bb.z0 / cell); gz <= Math.floor(bb.z1 / cell); gz++) {
      const k = gx + ',' + gz; let a = rec.cols.get(k); if (!a) { a = []; rec.cols.set(k, a); } a.push(ring);
    }
  },
  tileAt(x, z) { const [tx, ty] = GEO.tileOfWorld(x, z, 15); return this.tiles.get('15/' + tx + '/' + ty); },
  insideBuilding(x, z) {
    const rec = this.tileAt(x, z);
    if (!rec || !rec.cols) return null;
    const a = rec.cols.get(Math.floor(x / 25) + ',' + Math.floor(z / 25));
    if (!a) return null;
    for (const r of a) if (pointInRing(x, z, r)) return r;
    return null;
  },
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
  constructor() { this.p = []; this.c = []; this.u = []; this.s = []; }
  push(v, color, uv, style = 0) { this.p.push(v[0], v[1], v[2]); const c = color instanceof THREE.Color ? color : new THREE.Color(color); this.c.push(c.r, c.g, c.b); this.u.push(uv ? uv[0] : 0, uv ? uv[1] : 0); this.s.push(style); }
  quad(a, b, c, d, color, both) {
    const tri = (p, q, r) => { this.push(p, color); this.push(q, color); this.push(r, color); };
    tri(a, b, c); tri(a, c, d);
    if (both) { tri(a, c, b); tri(a, d, c); }
  }
  // 벽 한 면. 아래쪽은 살짝 어둡게(땅에 닿는 그늘)
  // style 소수부에 건물마다 다른 씨앗(0~0.4)을 실어 밤 창문 무늬를 건물마다 다르게 한다
  wall(ax, az, bx, bz, y0, y1, u0, u1, v0, v1, color, style) {
    style += this.seed || 0;
    const top = new THREE.Color(color), bot = top.clone().multiplyScalar(0.78);
    const mid = y1 - y0 > 6 ? top : top.clone().lerp(bot, 0.4);
    const b1 = [ax, y0, az], b2 = [bx, y0, bz], t1 = [ax, y1, az], t2 = [bx, y1, bz];
    this.push(b1, bot, [u0, v0], style); this.push(t2, mid, [u1, v1], style); this.push(b2, bot, [u1, v0], style);
    this.push(b1, bot, [u0, v0], style); this.push(t1, mid, [u0, v1], style); this.push(t2, mid, [u1, v1], style);
  }
  tri(a, b, c, y, color) {
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
    g.setAttribute('style', new THREE.Float32BufferAttribute(this.s, 1));
    g.computeVertexNormals();
    return g;
  }
}
// 선을 왼쪽(+)/오른쪽(-)으로 d만큼 평행 이동
function offsetLine(pts, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    out.push({ x: pts[i].x - dz / l * d, z: pts[i].z + dx / l * d });
  }
  return out;
}
// 선을 따라 일정 간격으로 점 찍기
function alongLine(pts, spacing, start = spacing / 2) {
  const out = [];
  let next = start, acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z);
    if (l < 1e-3) continue;
    while (next <= acc + l) { const t = (next - acc) / l; out.push({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), dx: (b.x - a.x) / l, dz: (b.z - a.z) / l }); next += spacing; }
    acc += l;
  }
  return out;
}
function ribbon(buf, pts, prof, w, cx, cz, lanes, lift = 0.3, vlen = lanes ? 14 : 6) {
  const P = [], H = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(l / 12));
    for (let k = 0; k < n; k++) {
      const t = k / n, x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t);
      P.push({ x, z });
      H.push(prof.bridge ? lerp(prof.h[i], prof.h[i + 1], t) + (lift - 0.3) : Math.max(Terrain.heightAt(x, z), 0) + lift);
    }
  }
  P.push(pts[pts.length - 1]); H.push(prof.bridge ? prof.h[prof.h.length - 1] + (lift - 0.3) : Math.max(Terrain.heightAt(pts[pts.length - 1].x, pts[pts.length - 1].z), 0) + lift);
  if (P.length < 2) return;
  let v = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l * w / 2, nz = dx / l * w / 2;
    const v1 = v + l / vlen;
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
    const shared = new Set(Object.values(Mats));
    g.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.material && !shared.has(o.material) && !o.material.userData.shared) { if (o.material.map && !o.material.map.userData.shared) o.material.map.dispose(); o.material.dispose(); } });
    g.removeFromParent();
  },
};
