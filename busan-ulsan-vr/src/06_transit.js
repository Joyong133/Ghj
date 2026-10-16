// ---------------------------------------------------------------------------
// 교통: 도시철도(노선 생성, 운행 시뮬레이션, 탑승), 버스 노선 탑승, 도로 위 차량, 공항 비행기
// ---------------------------------------------------------------------------
const TRANSIT_BBOX = { s: 35.02, w: 128.85, n: 35.56, e: 129.30 };

const Transit = {
  ready: false, failed: false, lines: [], stations: [], msg: '노선 데이터를 기다리는 중',
  trains: new Map(), // 화면에 보이는 열차 그룹 (key line:k)

  async load() {
    const b = TRANSIT_BBOX, bb = `${b.s},${b.w},${b.n},${b.e}`;
    const q = `[out:json][timeout:180];(node["railway"~"^(station|halt)$"](${bb});node["public_transport"="station"](${bb});way["railway"~"^(subway|light_rail|rail|monorail)$"](${bb}););out geom qt;`;
    try {
      this.msg = '도시철도 노선을 불러오는 중';
      const data = await Net.overpass('transit-v1', q, () => -1, { timeout: 180 });
      this.build(data);
      this.ready = true;
      this.msg = '';
      UI.toast(`지하철·전철 ${this.lines.length}개 노선, 역 ${this.lines.reduce((a, l) => a + l.stops.length, 0)}곳을 불러왔습니다.`);
    } catch (e) {
      this.failed = true; this.msg = '노선 데이터를 불러오지 못했습니다';
    }
  },

  build(data) {
    const els = data.elements || [];
    const sts = [];
    const nodes = new Map(); // id -> {x,z,adj:[{to, len, type, tunnel, bridge}]}
    for (const el of els) {
      if (el.type === 'node' && el.tags && el.tags.name) {
        sts.push({ name: el.tags.name, ko: el.tags['name:ko'] || '', x: GEO.x(el.lon), z: GEO.z(el.lat), tags: el.tags, id: el.id });
      } else if (el.type === 'way' && el.geometry && el.nodes) {
        const tg = el.tags || {};
        const type = tg.railway, tunnel = tg.tunnel === 'yes', bridge = !!tg.bridge && tg.bridge !== 'no';
        for (let i = 0; i < el.nodes.length; i++) {
          const id = el.nodes[i], g = el.geometry[i];
          if (!g) continue;
          let n = nodes.get(id);
          if (!n) { n = { id, x: GEO.x(g.lon), z: GEO.z(g.lat), adj: [] }; nodes.set(id, n); }
          if (i > 0) {
            const p = nodes.get(el.nodes[i - 1]);
            if (!p) continue;
            const len = Math.hypot(n.x - p.x, n.z - p.z);
            n.adj.push({ to: p.id, len, type, tunnel, bridge });
            p.adj.push({ to: id, len, type, tunnel, bridge });
          }
        }
      }
    }
    this.nodeMap = nodes;
    // 노드 공간 색인
    const grid = new SpatialGrid(300);
    for (const n of nodes.values()) grid.add(n.x, n.z, n);
    const nearestNode = (x, z, types) => {
      let best = null, bd = 450;
      for (const n of grid.queryRect({ x0: x - 450, x1: x + 450, z0: z - 450, z1: z + 450 })) {
        if (!n.adj.some((e) => types.includes(e.type))) continue;
        const d = Math.hypot(n.x - x, n.z - z);
        if (d < bd) { bd = d; best = n; }
      }
      return best;
    };
    const byName = new Map();
    for (const s of sts) for (const nm of [normName(s.name), normName(s.ko)]) { if (!nm) continue; if (!byName.has(nm)) byName.set(nm, []); byName.get(nm).push(s); }
    const findCands = (name) => {
      const nn = normName(name);
      let c = byName.get(nn);
      if (!c) { c = []; for (const [k, v] of byName) if (k.startsWith(nn) || nn.startsWith(k) && k.length >= 2) c.push(...v); }
      return c;
    };
    const lines = [];
    for (const L of LINES) {
      const cands = L.stations.map((n) => findCands(n));
      const chosen = [];
      for (let i = 0; i < L.stations.length; i++) {
        const c = cands[i];
        if (!c.length) { chosen.push(null); continue; }
        // 이전 역과 가장 가까운 후보 (첫 역은 다음 역 기준)
        let ref = null;
        for (let j = i - 1; j >= 0 && !ref; j--) ref = chosen[j];
        if (!ref) for (let j = i + 1; j < cands.length && !ref; j++) if (cands[j].length) ref = cands[j][0];
        const typed = c.filter((s) => this.stationFits(s, L));
        const pool = typed.length ? typed : c;
        let best = pool[0], bd = Infinity;
        if (ref) for (const s of pool) { const d = Math.hypot(s.x - ref.x, s.z - ref.z); if (d < bd) { bd = d; best = s; } }
        if (ref && bd > 9000) { chosen.push(null); continue; }
        chosen.push({ name: L.stations[i], x: best.x, z: best.z });
      }
      const stops = chosen.filter(Boolean);
      if (stops.length < 2) continue;
      // 역 사이 경로
      const pts = [], tunnel = [], bridge = [], stopAt = [];
      for (let i = 0; i < stops.length; i++) {
        if (i === 0) { pts.push({ x: stops[0].x, z: stops[0].z }); tunnel.push(L.rail[0] === 'subway'); bridge.push(false); stopAt.push(0); continue; }
        const a = stops[i - 1], b = stops[i];
        const na = nearestNode(a.x, a.z, L.rail), nb = nearestNode(b.x, b.z, L.rail);
        let path = null;
        if (na && nb) path = this.dijkstra(na, nb, L.rail, Math.hypot(a.x - b.x, a.z - b.z) * 3 + 2000);
        if (path && path.length > 1) {
          for (let k = 1; k < path.length; k++) { pts.push({ x: path[k].x, z: path[k].z }); tunnel.push(path[k].tunnel); bridge.push(path[k].bridge); }
          pts[pts.length - 1] = { x: b.x, z: b.z };
        } else {
          pts.push({ x: b.x, z: b.z }); tunnel.push(L.rail[0] === 'subway'); bridge.push(L.rail.includes('light_rail'));
        }
        stopAt.push(pts.length - 1);
      }
      const dist = [0];
      for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
      const line = { ...L, stops, pts, tunnel, bridge, dist, stopD: stopAt.map((i) => dist[i]), len: dist[dist.length - 1] };
      line.speed = L.id === 'DH' ? 24 : L.id === 'L4' || L.id === 'BGL' ? 15 : 19;
      line.dwell = 22;
      this.schedule(line);
      lines.push(line);
    }
    this.lines = lines.concat(this.lines.filter((l) => l.ktx));
    this.rebuildStations();
  },
  // KTX처럼 따로 불러오는 노선을 더한다
  addLine(line) {
    this.lines = this.lines.filter((l) => l.id !== line.id).concat([line]);
    this.rebuildStations();
  },
  // 역 목록: 같은 이름("부산역"과 "부산")이 800m 안에 있으면 한 역으로 묶는다
  rebuildStations() {
    this.stations = [];
    for (const l of this.lines) for (let i = 0; i < l.stops.length; i++) {
      const s = l.stops[i], key = normName(s.name);
      let st = this.stations.find((q) => normName(q.name) === key && Math.hypot(q.x - s.x, q.z - s.z) < 800);
      if (!st) { st = { name: s.name, x: s.x, z: s.z, lines: [] }; this.stations.push(st); }
      if (l.ktx) st.ktx = true;
      st.lines.push({ line: l, idx: i });
    }
  },
  // 노선 모양이 바뀌면(KTX 구간 철길 도착) 타고 있는 열차의 위치를 같은 구간 비율로 옮긴다
  remap(l, oldStopD) {
    const a = Ride.active;
    if (!a || a.line !== l) return;
    if (a.phase === 'move') {
      const i = a.idx, j = a.next, o0 = oldStopD[i], o1 = oldStopD[j];
      const f = o1 !== o0 ? (a.d - o0) / (o1 - o0) : 0;
      a.from = l.stopD[i]; a.to = l.stopD[j]; a.d = lerp(a.from, a.to, clamp(f, 0, 1));
    } else a.d = l.stopD[a.idx];
  },
  stationFits(s, L) {
    const t = s.tags || {};
    const st = t.station || '', ops = (t.network || '') + (t.operator || '') + (t.line || '');
    if (L.id === 'DH') return st === 'train' || /코레일|Korail|동해/.test(ops) || (!st && t.railway === 'station' && !/도시철도|교통공사/.test(ops));
    if (L.id === 'BGL') return st === 'light_rail' || /경전철|김해/.test(ops);
    return st === 'subway' || st === 'light_rail' || /도시철도|교통공사|Metro/i.test(ops);
  },
  dijkstra(a, b, types, maxLen, nodeMap = this.nodeMap, maxNodes = 80000) {
    // 이진 힙 다익스트라
    const dist = new Map([[a.id, 0]]), prev = new Map(), done = new Set();
    const heap = [[0, a.id]];
    const push = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
      const [d, id] = pop();
      if (done.has(id)) continue;
      done.add(id);
      if (id === b.id) break;
      if (d > maxLen || done.size > maxNodes) return null;
      const n = nodeMap.get(id);
      for (const e of n.adj) {
        if (!types.includes(e.type)) continue;
        const nd = d + e.len;
        if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, { id, e }); push([nd, e.to]); }
      }
    }
    if (!prev.has(b.id) && a.id !== b.id) return null;
    const out = [];
    let cur = b.id;
    while (cur !== undefined) { const n = nodeMap.get(cur); const p = prev.get(cur); out.push({ x: n.x, z: n.z, tunnel: p ? p.e.tunnel : false, bridge: p ? p.e.bridge : false }); cur = p ? p.id : undefined; }
    return out.reverse();
  },
  // 왕복 운행표. 구간 시간 = 거리/속도 + 가감속 손실
  schedule(l) {
    const seg = [];
    if (l.ktx) { l.dwell = 90; l.speed = 60; }
    for (let i = 0; i < l.stopD.length - 1; i++) { const d = l.stopD[i + 1] - l.stopD[i]; seg.push(l.ktx ? trapTime(d, l.segV[i] || 40) : d / l.speed + 14); }
    l.seg = seg;
    const one = seg.reduce((a, b) => a + b, 0) + l.dwell * (l.stopD.length - 1);
    l.turn = l.ktx ? 900 : 90;
    l.period = 2 * (one + l.turn);
    l.one = one;
    l.headway = l.ktx ? l.headway : l.id === 'DH' ? 900 : l.id === 'L4' || l.id === 'BGL' ? 420 : 330;
    l.count = Math.max(2, Math.round(l.period / l.headway));
  },
  // i번째 역에서 j번째 역까지 걸리는 시간(초, 중간 역 정차 포함)
  travelTime(l, i, j) {
    let t = 0;
    for (let k = Math.min(i, j); k < Math.max(i, j); k++) t += l.seg[k] + l.dwell;
    return Math.max(0, t - l.dwell);
  },
  // i번째 역에서 dir 방향 종착역까지 걸리는 시간(초)
  timeToEnd(l, i, dir) {
    let t = 0;
    for (let k = i; dir > 0 ? k < l.stops.length - 1 : k > 0; k += dir) t += l.seg[dir > 0 ? k : k - 1] + l.dwell;
    return Math.max(0, t - l.dwell);
  },
  // 시각 t의 열차 위치: {d(노선 위 거리), dir(+1/-1), stopIdx(정차 중이면), next}
  stateAt(l, t) {
    let ph = ((t % l.period) + l.period) % l.period;
    let dir = 1;
    if (ph >= l.one + l.turn) { ph -= l.one + l.turn; dir = -1; }
    if (ph >= l.one) return { d: dir > 0 ? l.len : 0, dir, stop: dir > 0 ? l.stopD.length - 1 : 0, terminal: true };
    const n = l.stopD.length;
    for (let i = 0; i < n - 1; i++) {
      const a = dir > 0 ? i : n - 1 - i, b = dir > 0 ? i + 1 : n - 2 - i;
      if (ph < l.dwell) return { d: l.stopD[a], dir, stop: a, next: b };
      ph -= l.dwell;
      const st = l.seg[dir > 0 ? i : n - 2 - i];
      if (ph < st) {
        const k = ph / st;
        if (l.ktx) { const D = Math.abs(l.stopD[b] - l.stopD[a]); return { d: lerp(l.stopD[a], l.stopD[b], D ? trapPos(ph, D, l.segV[Math.min(a, b)] || 40) / D : 1), dir, next: b, from: a, k }; }
        const e = k * k * (3 - 2 * k); return { d: lerp(l.stopD[a], l.stopD[b], e), dir, next: b, from: a, k };
      }
      ph -= st;
    }
    return { d: dir > 0 ? l.len : 0, dir, stop: dir > 0 ? n - 1 : 0 };
  },
  pointAt(l, d) {
    d = clamp(d, 0, l.len);
    let lo = 0, hi = l.dist.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (l.dist[m] <= d) lo = m; else hi = m; }
    const a = l.pts[lo], b = l.pts[hi], seg = l.dist[hi] - l.dist[lo] || 1, t = (d - l.dist[lo]) / seg;
    const x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t);
    const tunnel = l.tunnel[hi], bridge = l.bridge[hi];
    const g = Math.max(Terrain.heightAt(x, z), 0);
    return { x, z, yaw: Math.atan2(b.x - a.x, b.z - a.z), tunnel, bridge, y: g + (bridge ? 9 : 0.5) };
  },
  // 이 역에 다음 열차가 오기까지 남은 시간(초)
  eta(l, idx, dir, t) {
    let best = Infinity;
    for (let k = 0; k < l.count; k++) {
      const off = (k * l.period) / l.count;
      // 앞으로 한 주기 안에서 그 역에 정차를 시작하는 시각 찾기 (5초 단위 탐색)
      for (let s = 0; s < l.period; s += l.ktx ? 30 : 5) {
        const st = this.stateAt(l, t + off + s);
        if (st.stop === idx && st.dir === dir) { best = Math.min(best, s); break; }
        if (s > best) break;
      }
    }
    return best;
  },

  // ---------------------------------------------------------------- 운행 열차 그리기
  carModel(color, short) {
    const g = new THREE.Group();
    const len = short ? 12 : 17.5;
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.4, len), new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.5, roughness: 0.35 }));
    body.position.y = 1.9; g.add(body);
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.84, 0.35, len - 0.4), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2 }));
    band.position.y = 1.1; g.add(band);
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.86, 1.0, len - 1.2), new THREE.MeshStandardMaterial({ color: 0x1a2430, emissive: 0xffe0b0, emissiveIntensity: 0 }));
    win.position.y = 2.4; g.add(win);
    g.userData.win = win.material;
    g.userData.len = len;
    return g;
  },
  updateTrains(now) {
    if (!this.lines.length) return;
    const P = Player.pos, keep = new Set();
    for (const l of this.lines) {
      const short = l.id === 'L4' || l.id === 'BGL';
      const cars = l.ktx ? l.cars : short ? 2 : l.id === 'DH' ? 4 : 6;
      for (let k = 0; k < l.count; k++) {
        const st = this.stateAt(l, now + (k * l.period) / l.count);
        const head = this.pointAt(l, st.d);
        if (head.tunnel || Math.hypot(head.x - P.x, head.z - P.z) > 3000) continue;
        const key = l.id + ':' + k;
        keep.add(key);
        let tr = this.trains.get(key);
        if (!tr) {
          tr = new THREE.Group();
          for (let c = 0; c < cars; c++) tr.add(l.ktx ? KTX.carModel(l, c) : this.carModel(new THREE.Color(l.color).getHex(), short));
          R.world.add(tr); this.trains.set(key, tr);
        }
        const L = tr.children[0].userData.len + 0.6;
        tr.children.forEach((car, c) => {
          const p = this.pointAt(l, st.d - st.dir * c * L);
          car.position.set(p.x, p.y, p.z);
          car.rotation.y = p.yaw + (l.ktx && st.dir < 0 ? Math.PI : 0); // KTX는 머리가 가는 쪽을 보게
          car.userData.win.emissiveIntensity = R.nightU.value * 0.8;
          car.visible = !p.tunnel;
        });
      }
    }
    for (const [k, tr] of this.trains) if (!keep.has(k)) { World0.disposeGroup(tr); this.trains.delete(k); }
  },
  nearestStation(x, z, max = 80) {
    let best = null, bd = Infinity;
    for (const s of this.stations) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd && d < (s.ktx ? Math.max(max, 160) : max)) { bd = d; best = s; } }
    return best;
  },
};

// ---------------------------------------------------------------------------
// 탑승 (지하철·버스 공용): 실내 모형 안에 카메라를 두고 경로를 따라 움직인다
// ---------------------------------------------------------------------------
const Ride = {
  active: null, // {kind:'subway'|'bus', ...}
  interior: null, tunnel: null,

  buildInterior(kind, color) {
    if (this.interior) World0.disposeGroup(this.interior);
    if (kind === 'ktx') return this.buildKTXInterior(color);
    const g = new THREE.Group();
    const subway = kind === 'subway';
    const L = subway ? 17.5 : 11, Wd = subway ? 2.7 : 2.4, H = subway ? 2.3 : 2.2;
    const wallM = new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.6, side: THREE.DoubleSide });
    const floorM = new THREE.MeshStandardMaterial({ color: subway ? 0x8a8478 : 0x5a5e66, roughness: 0.9 });
    const seatM = new THREE.MeshStandardMaterial({ color: subway ? new THREE.Color(color).getHex() : 0x2a5aa8, roughness: 0.7 });
    const poleM = new THREE.MeshStandardMaterial({ color: 0xd0d4d8, metalness: 0.9, roughness: 0.25 });
    const glassM = new THREE.MeshStandardMaterial({ color: 0x9ac0d8, transparent: true, opacity: 0.12, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
    const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
    box(Wd, 0.1, L, floorM, 0, -0.05, 0);
    box(Wd, 0.08, L, wallM, 0, H, 0);
    // 옆벽: 아래쪽 벽 + 창문 + 위쪽 벽
    for (const s of [-1, 1]) {
      box(0.06, 0.85, L, wallM, s * Wd / 2, 0.42, 0);
      box(0.06, 0.4, L, wallM, s * Wd / 2, H - 0.2, 0);
      box(0.04, H - 1.25, L, glassM, s * Wd / 2, 0.85 + (H - 1.25) / 2, 0);
      for (let z = -L / 2 + 1; z < L / 2; z += subway ? 3.5 : 1.6) box(0.08, H - 1.25, 0.12, wallM, s * Wd / 2, 0.85 + (H - 1.25) / 2, z);
      if (subway) { box(0.45, 0.45, L - 4, seatM, s * (Wd / 2 - 0.3), 0.22, 0); box(0.08, 0.5, L - 4, seatM, s * (Wd / 2 - 0.08), 0.6, 0); }
    }
    if (subway) { for (let z = -L / 2 + 2; z < L / 2 - 1; z += 3) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, H, 8), poleM); p.position.set(0, H / 2, z); g.add(p); } box(0.03, 0.03, L, poleM, 0.6, H - 0.35, 0); box(0.03, 0.03, L, poleM, -0.6, H - 0.35, 0); }
    else { for (let z = -L / 2 + 2.5; z < L / 2 - 1; z += 1.1) for (const s of [-1, 1]) { box(0.85, 0.45, 0.5, seatM, s * 0.65, 0.25, z); box(0.85, 0.6, 0.08, seatM, s * 0.65, 0.75, z + 0.25); } box(Wd, H, 0.05, glassM, 0, H / 2, -L / 2); }
    // 천장 조명
    const lightM = new THREE.MeshBasicMaterial({ color: 0xfff6e8 });
    for (const s of [-0.7, 0.7]) box(0.18, 0.03, L - 1, lightM, s, H - 0.06, 0);
    const lamp = new THREE.PointLight(0xfff2e0, 3, 12, 1.5); lamp.position.set(0, H - 0.3, 0); g.add(lamp);
    // 바깥 몸체 (밖에서 보이도록)
    const shell = new THREE.Mesh(new THREE.BoxGeometry(Wd + 0.2, H + 1.0, L + 0.3), new THREE.MeshStandardMaterial({ color: subway ? 0xd8dde2 : 0x2a6ad0, side: THREE.BackSide, transparent: true, opacity: 0.0 }));
    shell.position.y = H / 2; g.add(shell);
    R.scene.add(g);
    this.interior = g;
    g.userData.L = L;
  },
  // KTX 객실: 앞을 보는 2+2 좌석, 선반, 앞쪽 벽의 안내 화면(다음 역·속도)
  buildKTXInterior(color) {
    const g = new THREE.Group();
    const L = 18.7, Wd = 2.9, H = 2.3;
    const wallM = new THREE.MeshStandardMaterial({ color: 0xece8e0, roughness: 0.6, side: THREE.DoubleSide });
    const floorM = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.95 });
    const seatM = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 0.8 });
    const coverM = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.7 });
    const glassM = new THREE.MeshStandardMaterial({ color: 0x9ac0d8, transparent: true, opacity: 0.1, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
    const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
    box(Wd, 0.1, L, floorM, 0, -0.05, 0);
    box(Wd, 0.08, L, wallM, 0, H, 0);
    for (const sd of [-1, 1]) {
      box(0.06, 0.8, L, wallM, sd * Wd / 2, 0.4, 0);
      box(0.06, 0.55, L, wallM, sd * Wd / 2, H - 0.27, 0);
      box(0.04, H - 1.35, L, glassM, sd * Wd / 2, 0.8 + (H - 1.35) / 2, 0);
      for (let z = -L / 2 + 0.5; z < L / 2; z += 1.0) box(0.1, H - 1.35, 0.35, wallM, sd * (Wd / 2 - 0.02), 0.8 + (H - 1.35) / 2, z);
      box(0.45, 0.05, L - 1, wallM, sd * (Wd / 2 - 0.3), H - 0.45, 0); // 선반
      // 앞을 보는 좌석 둘씩
      for (let z = -L / 2 + 1.6; z < L / 2 - 1.2; z += 1.0) for (const x of [0.56, 1.06]) {
        box(0.46, 0.12, 0.48, seatM, sd * x, 0.45, z);
        box(0.46, 0.64, 0.1, seatM, sd * x, 0.82, z - 0.25); // 등받이 위가 눈높이보다 낮아 앞쪽 안내 화면이 보이게
        box(0.3, 0.1, 0.03, coverM, sd * x, 1.06, z - 0.31);
      }
    }
    // 앞쪽 벽과 안내 화면
    box(Wd, H, 0.08, wallM, 0, H / 2, L / 2);
    box(Wd, H, 0.08, wallM, 0, H / 2, -L / 2);
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: tex }));
    disp.position.set(0, H - 0.25, L / 2 - 0.06); disp.rotation.y = Math.PI; g.add(disp);
    this.disp = { c, tex, last: '' };
    const lightM = new THREE.MeshBasicMaterial({ color: 0xfff6e8 });
    for (const sd of [-0.5, 0.5]) box(0.25, 0.03, L - 1, lightM, sd, H - 0.06, 0);
    const lamp = new THREE.PointLight(0xfff2e0, 3, 14, 1.5); lamp.position.set(0, H - 0.3, 0); g.add(lamp);
    R.scene.add(g);
    this.interior = g;
    g.userData.L = L;
  },
  // 객실 앞 안내 화면
  drawDisplay(top, bottom) {
    const D = this.disp; if (!D) return;
    const key = top + '|' + bottom; if (key === D.last) return; D.last = key;
    const g = D.c.getContext('2d');
    g.fillStyle = '#06080c'; g.fillRect(0, 0, 512, 128);
    g.font = '700 46px "Gothic A1", sans-serif'; g.textBaseline = 'middle';
    g.fillStyle = '#ffb43a'; g.fillText(top, 18, 40);
    g.font = '600 36px "Gothic A1", sans-serif'; g.fillStyle = '#7fd0ff'; g.fillText(bottom, 18, 96);
    D.tex.needsUpdate = true;
  },
  buildTunnel() {
    if (this.tunnel) return;
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const gx = c.getContext('2d'); gx.fillStyle = '#2a2a2c'; gx.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 400; i++) { gx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; gx.fillRect(Math.random() * 64, Math.random() * 256, 3, 3); }
    gx.fillStyle = '#ffe9b8'; gx.fillRect(28, 0, 8, 18);
    gx.fillStyle = '#444'; gx.fillRect(0, 120, 64, 6);
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(6, 80); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 1600, 16, 1, true), mat);
    m.rotation.x = Math.PI / 2;
    this.tunnel = m; this.tunnelTex = tex;
    m.visible = false;
    R.scene.add(m);
  },

  // ---------------- 지하철
  // dest: 내릴 역 번호(KTX 여행). 그 역에 닿으면 잠시 뒤 자동으로 내린다
  startSubway(line, idx, dir, dest = null) {
    this.buildInterior(line.ktx ? 'ktx' : 'subway', line.color);
    this.buildTunnel();
    this.active = { kind: 'subway', line, idx, dir, t: 0, phase: 'dwell', stopT: line.ktx ? line.dwell - 20 : 0, d: line.stopD[idx], next: idx + dir, seat: new THREE.Vector3(0, 0, 0), v: 0, ts: 1, dest };
    G.riding = true;
    Player.enterRide(line.ktx ? 'ktx' : 'subway');
    const term = dir > 0 ? line.stops[line.stops.length - 1].name : line.stops[0].name;
    if (dest !== null) UI.banner(`${line.name}`, `${stationLabel(line.stops[idx].name)} → ${stationLabel(line.stops[dest].name)} · 약 ${fmtDur(Transit.travelTime(line, idx, dest))}`, 3200);
    else UI.banner(`${line.name}`, `${term} 방면 · ${line.stops[idx].name}에서 출발`, 2600);
    this.announce(`이 열차는 ${term} 방면 열차입니다.`);
  },
  // ---------------- 버스
  startBus(route) {
    this.buildInterior('bus', '#2a6ad0');
    this.active = { kind: 'bus', route, d: route.startD, phase: 'dwell', stopT: 0, nextStop: route.startStop + 1, speed: 0 };
    G.riding = true;
    Player.enterRide('bus');
    UI.banner(`${route.ref}번 버스`, route.name, 2600);
    this.announce(`${route.ref}번 버스입니다. 다음 정류장은 ${route.stops[route.startStop + 1].name}입니다.`);
  },
  announce(text) {
    if (!G.settings.voice || !window.speechSynthesis) return;
    try { const u = new SpeechSynthesisUtterance(text); u.lang = 'ko-KR'; u.rate = 1.0; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); } catch (e) { /* 무시 */ }
  },
  stop(placeAt) {
    const a = this.active; if (!a) return;
    this.active = null; G.riding = false; G.inTunnel = false; G.fastRide = false; this.disp = null;
    if (this.interior) { World0.disposeGroup(this.interior); this.interior = null; }
    if (this.tunnel) this.tunnel.visible = false;
    R.world.visible = true; R.sea.visible = true;
    Player.exitRide(placeAt);
    UI.ride(null);
  },
  update(dt) {
    const a = this.active; if (!a) return;
    let p, yaw;
    if (a.kind === 'subway' && a.line.ktx) {
      p = this.updateKTX(dt);
      if (!p) return;
      yaw = p.yaw + (a.dir < 0 ? Math.PI : 0);
    } else if (a.kind === 'subway') {
      const l = a.line;
      if (a.phase === 'dwell') {
        a.stopT += dt;
        if (a.stopT > l.dwell) {
          if (a.next < 0 || a.next >= l.stops.length) { UI.toast('종착역입니다. 내립니다.'); this.stop(l.stops[a.idx]); return; }
          a.phase = 'move'; a.from = l.stopD[a.idx]; a.to = l.stopD[a.next]; a.segT = 0; a.segDur = Math.abs(a.to - a.from) / l.speed + 14;
          this.announce(`다음 역은 ${l.stops[a.next].name}입니다.`);
        }
      } else {
        a.segT += dt;
        const k = clamp(a.segT / a.segDur, 0, 1), e = k * k * (3 - 2 * k);
        a.d = lerp(a.from, a.to, e);
        if (k >= 1) { a.idx = a.next; a.next += a.dir; a.phase = 'dwell'; a.stopT = 0; this.announce(`이번 역은 ${l.stops[a.idx].name}, ${l.stops[a.idx].name}역입니다.`); }
      }
      p = Transit.pointAt(l, a.d);
      yaw = p.yaw + (a.dir < 0 ? Math.PI : 0);
      const spd = a.phase === 'move' ? Math.abs(a.to - a.from) / a.segDur * 1.5 * Math.sin(Math.PI * clamp(a.segT / a.segDur, 0, 1)) : 0;
      // 터널
      const inTunnel = p.tunnel;
      G.inTunnel = inTunnel;
      this.tunnel.visible = inTunnel;
      R.world.visible = !inTunnel; R.sea.visible = !inTunnel;
      if (inTunnel) { this.tunnel.position.set(p.x, p.y + 1.6, p.z); this.tunnel.rotation.order = 'YXZ'; this.tunnel.rotation.set(Math.PI / 2, yaw, 0); this.tunnelTex.offset.y -= spd * dt / 20; }
      UI.ride({ kind: 'subway', line: l, a });
    } else {
      const r = a.route;
      if (a.phase === 'dwell') {
        a.stopT += dt; a.speed = 0;
        if (a.stopT > 8) {
          if (a.nextStop >= r.stops.length) { UI.toast('종점입니다. 내립니다.'); this.stop(r.stops[r.stops.length - 1]); return; }
          a.phase = 'move';
          this.announce(`다음 정류장은 ${r.stops[a.nextStop].name}입니다.`);
        }
      } else {
        const target = r.stopD[a.nextStop];
        const remain = target - a.d;
        const want = remain < 40 ? Math.max(2, remain * 0.3) : 11;
        a.speed = lerp(a.speed, want, Math.min(1, dt * 0.8));
        a.d += a.speed * dt;
        if (remain < 1) { a.d = target; a.phase = 'dwell'; a.stopT = 0; this.announce(`${r.stops[a.nextStop].name} 정류장입니다.`); a.cur = a.nextStop; a.nextStop++; }
      }
      p = Bus.pointAt(r, a.d);
      yaw = p.yaw;
      UI.ride({ kind: 'bus', route: r, a });
    }
    this.interior.position.set(p.x, p.y, p.z);
    this.interior.rotation.set(0, yaw, 0);
    Player.followRide(this.interior, a.kind === 'subway' && a.line.ktx ? 'ktx' : a.kind);
  },
  // KTX: 가속-정속-감속으로 달리고, 시간 흐름 배속(a.ts)을 적용한다
  updateKTX(dt) {
    const a = this.active, l = a.line, sdt = dt * a.ts;
    if (a.phase === 'dwell') {
      a.stopT += sdt; a.v = 0;
      if (a.arrived) {
        a.arriveT = (a.arriveT || 0) + dt;
        if (a.arriveT > 4) { UI.toast(`${stationLabel(l.stops[a.idx].name)}에서 내렸습니다.`); this.stop(l.stops[a.idx]); return null; }
      } else if (a.stopT > l.dwell) {
        if (a.next < 0 || a.next >= l.stops.length) { UI.toast('종착역입니다. 내립니다.'); this.stop(l.stops[a.idx]); return null; }
        a.phase = 'move';
        this.announce(`다음 역은 ${stationLabel(l.stops[a.next].name)}입니다.`);
      }
    } else {
      a.from = l.stopD[a.idx]; a.to = l.stopD[a.next];
      const vmax = l.segV[Math.min(a.idx, a.next)] || 40;
      const rem = (a.to - a.d) * a.dir;
      if (rem <= a.v * a.v / (2 * KTX_DEC) + a.v * sdt * 0.5) a.v = Math.max(1.5, a.v - KTX_DEC * sdt);
      else a.v = Math.min(vmax, a.v + KTX_ACC * sdt);
      const step = a.v * sdt;
      if (step >= rem) {
        a.d = a.to; a.idx = a.next; a.next += a.dir; a.phase = 'dwell'; a.stopT = 0; a.v = 0;
        const nm = stationLabel(l.stops[a.idx].name);
        if (a.dest === a.idx) { a.arrived = true; a.ts = 1; this.announce(`${nm}에 도착했습니다. 내리실 때 잊으신 물건이 없는지 확인하세요.`); UI.banner(nm, `${l.name} · 도착했습니다. 곧 내립니다`, 3500); }
        else { this.announce(`이번 역은 ${nm}입니다.`); UI.banner(nm, `${l.name} · E로 내리기`, 2500); }
      } else a.d += a.dir * step;
    }
    const p = Transit.pointAt(l, a.d);
    // 빨리 달리는 동안에는 가까운 도시를 짓지 않는다 (지형과 위성 사진만)
    G.fastRide = a.v * a.ts > 45;
    const inTunnel = p.tunnel;
    G.inTunnel = inTunnel;
    this.tunnel.visible = inTunnel;
    R.world.visible = !inTunnel; R.sea.visible = !inTunnel;
    const yaw = p.yaw + (a.dir < 0 ? Math.PI : 0);
    if (inTunnel) { this.tunnel.position.set(p.x, p.y + 2, p.z); this.tunnel.rotation.order = 'YXZ'; this.tunnel.rotation.set(Math.PI / 2, yaw, 0); this.tunnelTex.offset.y -= a.v * a.ts * dt / 20; }
    const st = a.phase === 'dwell' ? l.stops[a.idx] : l.stops[a.next];
    this.drawDisplay(`${a.phase === 'dwell' ? '이번 역' : '다음 역'} ${stationLabel(st.name)}`, `${Math.round(a.v * 3.6)} km/h${a.ts > 1 ? `   ×${a.ts}` : ''}`);
    UI.ride({ kind: 'subway', line: l, a });
    return p;
  },
  isKTX() { const a = this.active; return !!(a && a.kind === 'subway' && a.line.ktx); },
  // 시간 흐름 1 → 10 → 60배
  cycleSpeed() {
    if (!this.isKTX()) return;
    const a = this.active; a.ts = a.ts === 1 ? 10 : a.ts === 10 ? 60 : 1;
    UI.toast(a.ts === 1 ? '보통 속도로 갑니다.' : `시간을 ${a.ts}배 빠르게 흘려 보냅니다. 열차가 빠르면 도시는 멈췄을 때 지어집니다.`);
  },
  // 다음 역 바로 앞으로 건너뛰기 (감속을 시작하는 지점)
  skipNext() {
    if (!this.isKTX()) return;
    const a = this.active, l = a.line;
    if (a.phase === 'dwell') { if (a.next < 0 || a.next >= l.stops.length) return; a.stopT = l.dwell; a.phase = 'move'; }
    a.from = l.stopD[a.idx]; a.to = l.stopD[a.next];
    const vmax = l.segV[Math.min(a.idx, a.next)] || 40;
    const left = Math.min(Math.abs(a.to - a.d), vmax * vmax / (2 * KTX_DEC));
    a.d = a.to - a.dir * left; a.v = Math.min(vmax, Math.sqrt(2 * KTX_DEC * left));
    UI.toast(`${stationLabel(l.stops[a.next].name)} 앞으로 건너뛰었습니다.`);
  },
  canExit() { const a = this.active; return a && a.phase === 'dwell'; },
  exitHere() {
    const a = this.active; if (!a) return;
    if (a.kind === 'subway') this.stop(a.line.stops[a.idx]);
    else { const s = a.route.stops[Math.max(0, (a.cur ?? a.route.startStop))]; this.stop(s); }
  },
};

// ---------------------------------------------------------------------------
// 버스: 정류장을 지나는 실제 노선(OSM route=bus)을 받아 경로를 만든다
// ---------------------------------------------------------------------------
const Bus = {
  async routesAt(stop) {
    const q = `[out:json][timeout:60];node(${stop.id})->.s;rel(bn.s)["route"="bus"]->.r;.r out geom;node(r.r)["name"];out;`;
    const data = await Net.overpass('bus2/' + stop.id, q, () => -2, { timeout: 60 });
    const named = new Map();
    for (const el of data.elements || []) if (el.type === 'node' && el.tags) named.set(el.id, el.tags.name);
    const routes = [];
    for (const el of data.elements || []) {
      if (el.type !== 'relation') continue;
      const r = this.makeRoute(el, named, stop);
      if (r) routes.push(r);
    }
    routes.sort((a, b) => String(a.ref).localeCompare(String(b.ref), 'ko', { numeric: true }));
    return routes;
  },
  makeRoute(rel, named, stop) {
    const tg = rel.tags || {};
    const ways = rel.members.filter((m) => m.type === 'way' && m.geometry && !/platform/.test(m.role)).map((m) => m.geometry.map((g) => ({ x: GEO.x(g.lon), z: GEO.z(g.lat) })));
    if (!ways.length) return null;
    // 순서대로 잇기 (방향이 뒤집힌 조각은 뒤집는다)
    let pts = ways[0].slice();
    const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) < 3;
    if (ways.length > 1) { const n1 = ways[1]; if (near(pts[0], n1[0]) || near(pts[0], n1[n1.length - 1])) pts.reverse(); }
    for (let i = 1; i < ways.length; i++) {
      let w = ways[i];
      const end = pts[pts.length - 1];
      if (near(w[w.length - 1], end) && !near(w[0], end)) w = w.slice().reverse();
      pts = pts.concat(near(w[0], end) ? w.slice(1) : w);
    }
    const dist = [0];
    for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const proj = (x, z) => { let best = 0, bd = Infinity; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1; const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1); const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)); if (d < bd) { bd = d; best = dist[i] + Math.sqrt(l2) * t; } } return [best, bd]; };
    const stops = [];
    for (const m of rel.members) {
      if (m.type !== 'node' || !/stop|platform/.test(m.role) || m.lat === undefined) continue;
      const x = GEO.x(m.lon), z = GEO.z(m.lat);
      const [d, off] = proj(x, z);
      if (off > 80) continue;
      const name = named.get(m.ref) || '정류장';
      const last = stops[stops.length - 1];
      if (last && (Math.abs(last.d - d) < 25 || last.name === name && Math.abs(last.d - d) < 120)) continue;
      stops.push({ name, x, z, d, id: m.ref });
    }
    stops.sort((a, b) => a.d - b.d);
    if (stops.length < 2) return null;
    let si = 0, sd = Infinity;
    stops.forEach((s, i) => { const dd = Math.hypot(s.x - stop.x, s.z - stop.z); if (dd < sd) { sd = dd; si = i; } });
    if (si >= stops.length - 1) return null; // 종점에서는 탈 수 없다
    return { ref: tg.ref || '?', name: tg.name || `${tg.from || ''} → ${tg.to || ''}`, to: tg.to || stops[stops.length - 1].name, pts, dist, len: dist[dist.length - 1], stops, stopD: stops.map((s) => s.d), startStop: si, startD: stops[si].d, colour: tg.colour };
  },
  pointAt(r, d) {
    d = clamp(d, 0, r.len);
    let lo = 0, hi = r.dist.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.dist[m] <= d) lo = m; else hi = m; }
    const a = r.pts[lo], b = r.pts[hi], t = (d - r.dist[lo]) / ((r.dist[hi] - r.dist[lo]) || 1);
    const x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t);
    const deck = City.deckAt(x, z);
    const y = deck !== null ? deck : Math.max(Terrain.heightAt(x, z), 0) + 0.3;
    // 오른쪽 차로로 1.7m
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    return { x: x - Math.cos(yaw) * 1.7, z: z + Math.sin(yaw) * 1.7, y, yaw };
  },
};

// ---------------------------------------------------------------------------
// 도로 위 차량: 불러온 도로 연결망을 따라 무작위로 달린다
// ---------------------------------------------------------------------------
const Traffic = {
  ways: new Map(), nodeWays: new Map(), cars: [], carMesh: null, busMesh: null, MAX: 0,
  DRIVE: /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|living_street)$/,

  addWay(tileKey, el, prof, width) {
    const tg = el.tags || {};
    if (!this.DRIVE.test(tg.highway || '') || tg.tunnel === 'yes' || !el.nodes) return;
    let w = this.ways.get(el.id);
    if (!w) {
      const pts = el.geometry.map((g) => ({ x: GEO.x(g.lon), z: GEO.z(g.lat) }));
      const len = [0]; for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
      w = { id: el.id, pts, len, total: len[len.length - 1], nodes: el.nodes, oneway: tg.oneway === 'yes' || /motorway/.test(tg.highway) || tg.junction === 'roundabout', speed: { motorway: 24, trunk: 20, primary: 15, secondary: 13, tertiary: 11 }[tg.highway.replace('_link', '')] || 8, tiles: new Set(), h: null };
      this.ways.set(el.id, w);
      for (const n of [el.nodes[0], el.nodes[el.nodes.length - 1]]) { let a = this.nodeWays.get(n); if (!a) { a = []; this.nodeWays.set(n, a); } a.push(w); }
    }
    if (prof && prof.bridge) w.h = prof.h;
    if (width) w.width = width;
    w.tiles.add(tileKey);
  },
  removeTile(tileKey) {
    for (const [id, w] of this.ways) {
      if (!w.tiles.delete(tileKey) || w.tiles.size) continue;
      this.ways.delete(id);
      for (const n of [w.nodes[0], w.nodes[w.nodes.length - 1]]) { const a = this.nodeWays.get(n); if (a) { const i = a.indexOf(w); if (i >= 0) a.splice(i, 1); if (!a.length) this.nodeWays.delete(n); } }
    }
    this.cars = this.cars.filter((c) => this.ways.has(c.w.id));
  },
  initMeshes() {
    this.MAX = R.quality === 'high' ? 260 : 90;
    const paint = (g, c) => { const col = []; const cc = new THREE.Color(c); for (let i = 0; i < g.attributes.position.count; i++) col.push(cc.r, cc.g, cc.b); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return g; };
    const merge = (list) => { const p = [], c = []; for (const g of list) { const n = g.toNonIndexed(); p.push(...n.attributes.position.array); c.push(...paint(n, g.userData.c).attributes.color.array); } const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); out.computeVertexNormals(); return out; };
    const part = (w, h, d, x, y, z, c) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); g.userData.c = c; return g; };
    const carGeo = merge([part(1.8, 0.7, 4.4, 0, 0.55, 0, 0xffffff), part(1.6, 0.6, 2.2, 0, 1.15, -0.2, 0x9ab0c0), part(1.9, 0.5, 0.6, 0, 0.35, 2.0, 0x222222), part(1.9, 0.5, 0.6, 0, 0.35, -2.0, 0x222222)]);
    const busGeo = merge([part(2.5, 2.6, 11, 0, 1.75, 0, 0xffffff), part(2.52, 1.0, 10.2, 0, 2.2, 0, 0x22303c), part(2.55, 0.5, 11.05, 0, 0.55, 0, 0x333333)]);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 });
    this.carMesh = new THREE.InstancedMesh(carGeo, mat, this.MAX);
    this.busMesh = new THREE.InstancedMesh(busGeo, mat, Math.ceil(this.MAX / 6));
    for (const m of [this.carMesh, this.busMesh]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false; R.scene.add(m); }
  },
  spawn() {
    const P = Player.pos;
    const near = [];
    for (const w of this.ways.values()) { const p = w.pts[Math.floor(w.pts.length / 2)]; if (Math.abs(p.x - P.x) < 700 && Math.abs(p.z - P.z) < 700 && w.total > 20) near.push(w); }
    if (!near.length) return;
    const w = near[Math.floor(Math.random() * near.length)];
    const bus = Math.random() < 0.12;
    const cols = [0xf4f4f4, 0x1a1a1a, 0x8a929a, 0xc8ccd0, 0x2a3a5a, 0x8a1a1a, 0x3a5a8a, 0xe8e0c8];
    this.cars.push({ w, d: Math.random() * w.total, dir: w.oneway ? 1 : Math.random() < 0.5 ? 1 : -1, v: w.speed * (0.7 + Math.random() * 0.4), bus, color: new THREE.Color(bus ? (Math.random() < 0.5 ? 0x2a6ad0 : 0x3aa05a) : cols[Math.floor(Math.random() * cols.length)]) });
  },
  update(dt) {
    if (!this.carMesh) this.initMeshes();
    const on = G.settings.traffic && !Ride.active;
    if (!on) { this.carMesh.count = this.busMesh.count = 0; return; }
    const P = Player.pos;
    if (Player.alt() > 400) { this.carMesh.count = this.busMesh.count = 0; return; }
    for (let i = 0; i < 6 && this.cars.length < this.MAX; i++) this.spawn();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    let ci = 0, bi = 0;
    for (let k = this.cars.length - 1; k >= 0; k--) {
      const c = this.cars[k];
      c.d += c.v * c.dir * dt;
      if (c.d < 0 || c.d > c.w.total) {
        // 다음 길 고르기
        const atEnd = c.d > c.w.total;
        const node = atEnd ? c.w.nodes[c.w.nodes.length - 1] : c.w.nodes[0];
        const opts = (this.nodeWays.get(node) || []).filter((w) => w !== c.w && (!w.oneway || w.nodes[0] === node));
        if (!opts.length) { if (c.w.oneway) { this.cars.splice(k, 1); continue; } c.dir *= -1; c.d = clamp(c.d, 0, c.w.total); continue; }
        const nw = opts[Math.floor(Math.random() * opts.length)];
        c.w = nw; c.dir = nw.nodes[0] === node ? 1 : -1; c.d = c.dir > 0 ? 0 : nw.total;
      }
      const w = c.w;
      let lo = 0, hi = w.len.length - 1;
      while (hi - lo > 1) { const mm = (lo + hi) >> 1; if (w.len[mm] <= c.d) lo = mm; else hi = mm; }
      const a = w.pts[lo], b = w.pts[hi], t = (c.d - w.len[lo]) / ((w.len[hi] - w.len[lo]) || 1);
      let x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t);
      if (Math.abs(x - P.x) > 950 || Math.abs(z - P.z) > 950) { this.cars.splice(k, 1); continue; }
      let yaw = Math.atan2(b.x - a.x, b.z - a.z) + (c.dir < 0 ? Math.PI : 0);
      if (!w.oneway) { x -= Math.cos(yaw) * 1.8; z += Math.sin(yaw) * 1.8; }
      const y = w.h ? lerp(w.h[lo], w.h[hi], t) : Math.max(Terrain.heightAt(x, z), 0) + 0.3;
      q.setFromAxisAngle(up, yaw);
      m.compose(new THREE.Vector3(x, y, z), q, s);
      if (c.bus) { if (bi < this.busMesh.instanceMatrix.count) { this.busMesh.setMatrixAt(bi, m); this.busMesh.setColorAt(bi, c.color); bi++; } }
      else if (ci < this.MAX) { this.carMesh.setMatrixAt(ci, m); this.carMesh.setColorAt(ci, c.color); ci++; }
    }
    this.carMesh.count = ci; this.busMesh.count = bi;
    for (const mm of [this.carMesh, this.busMesh]) { mm.instanceMatrix.needsUpdate = true; if (mm.instanceColor) mm.instanceColor.needsUpdate = true; }
  },
};

// ---------------------------------------------------------------------------
// 공항 비행기: 활주로 방향으로 착륙과 이륙을 되풀이한다
// ---------------------------------------------------------------------------
const Planes = {
  list: [],
  model() {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, metalness: 0.3, roughness: 0.4 });
    const tailC = new THREE.MeshStandardMaterial({ color: [0x1a4a9a, 0xc82a3a, 0x0a7a8a, 0x2a2a6a][Math.floor(Math.random() * 4)], roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.6 });
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 36, 14), white); fus.rotation.x = Math.PI / 2; g.add(fus);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(2, 14, 8, 0, TAU, 0, Math.PI / 2), white); nose.rotation.x = Math.PI / 2; nose.position.z = 18; g.add(nose);
    const tailcone = new THREE.Mesh(new THREE.ConeGeometry(2, 7, 14), white); tailcone.rotation.x = -Math.PI / 2; tailcone.position.z = -21.5; g.add(tailcone);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(34, 0.5, 5), white); wing.position.set(0, -0.8, 1); g.add(wing);
    const stab = new THREE.Mesh(new THREE.BoxGeometry(12, 0.4, 3), white); stab.position.set(0, 0.6, -21); g.add(stab);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 5), tailC); fin.position.set(0, 4.2, -21); g.add(fin);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 4, 12), dark); e.rotation.x = Math.PI / 2; e.position.set(s * 6, -2, 3); g.add(e); }
    const win = new THREE.Mesh(new THREE.BoxGeometry(4.04, 0.35, 28), new THREE.MeshStandardMaterial({ color: 0x1a2028, emissive: 0xffe0a0, emissiveIntensity: 0 })); win.position.set(0, 0.8, 0); g.add(win);
    g.userData.win = win.material;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); beacon.position.set(0, 2.2, 0); g.add(beacon);
    g.userData.beacon = beacon;
    return g;
  },
  runway(code) {
    const A = AIRPORTS[code];
    const c = GEO.toWorld(A.lat, A.lon);
    const rw = City.runways.find((r) => Math.hypot((r.a.x + r.b.x) / 2 - c.x, (r.a.z + r.b.z) / 2 - c.z) < 3000);
    if (rw) { const dx = rw.b.x - rw.a.x, dz = rw.b.z - rw.a.z, l = Math.hypot(dx, dz); return { cx: (rw.a.x + rw.b.x) / 2, cz: (rw.a.z + rw.b.z) / 2, ux: dx / l, uz: dz / l, len: l }; }
    const h = A.heading * DEG; // 방위각: 북=0, 동=90 → 월드 (sin, -cos)
    return { cx: c.x, cz: c.z, ux: Math.sin(h), uz: -Math.cos(h), len: A.length };
  },
  update(now) {
    const P = Player.pos;
    for (const code of Object.keys(AIRPORTS)) {
      const rw = this.runway(code);
      const near = Math.hypot(rw.cx - P.x, rw.cz - P.z) < 30000;
      for (const kind of ['land', 'takeoff']) {
        const key = code + kind;
        let pl = this.list.find((p) => p.key === key);
        if (!near) { if (pl) { World0.disposeGroup(pl.g); this.list.splice(this.list.indexOf(pl), 1); } continue; }
        if (!pl) { pl = { key, g: this.model() }; R.world.add(pl.g); this.list.push(pl); }
        const cycle = 160, t = ((now + (kind === 'land' ? 0 : 80) + hashStr(code) % 60) % cycle);
        const gy = Math.max(Terrain.heightAt(rw.cx, rw.cz), 0) + 2.6;
        let along, alt, pitch = 0;
        if (kind === 'land') {
          // 0~70초: 접근(시속 약 260km), 70~95초: 활주 감속, 이후 숨김
          if (t < 70) { const k = t / 70; along = -rw.len / 2 - 14000 * (1 - k); alt = Math.max(0, (-rw.len / 2 - along) * Math.tan(3 * DEG)); pitch = -0.03; }
          else if (t < 95) { const k = (t - 70) / 25; along = -rw.len / 2 + rw.len * 0.75 * (1 - (1 - k) * (1 - k)); alt = 0; }
          else { pl.g.visible = false; continue; }
        } else {
          if (t < 40) { const k = t / 40; along = -rw.len / 2 + rw.len * 0.7 * k * k; alt = 0; }
          else if (t < 110) { const k = (t - 40) / 70; along = rw.len * 0.2 + 15000 * k; alt = 15000 * k * Math.tan(8 * DEG); pitch = 0.14; }
          else { pl.g.visible = false; continue; }
        }
        pl.g.visible = true;
        pl.g.position.set(rw.cx + rw.ux * along, gy + alt, rw.cz + rw.uz * along);
        pl.g.rotation.set(0, Math.atan2(rw.ux, rw.uz), 0);
        pl.g.rotateX(-pitch);
        pl.g.userData.win.emissiveIntensity = R.nightU.value;
        pl.g.userData.beacon.visible = Math.sin(now * 6) > 0.3;
      }
    }
  },
};
