// ---------------------------------------------------------------------------
// KTX: 역 위치를 OSM에서 찾고, 역 사이 철길을 구간마다 불러와 노선을 만든다.
// 처음에는 역을 잇는 직선으로 바로 쓰고, 구간 철길이 도착하면 그 구간을 바꾼다.
// ---------------------------------------------------------------------------
const KTX_ACC = 0.45, KTX_DEC = 0.6; // m/s²

// 가속-정속-감속 운행: 거리 D를 최고 속도 v로 갈 때 걸리는 시간
function trapTime(D, v, a = KTX_ACC, b = KTX_DEC) {
  const dAB = v * v / (2 * a) + v * v / (2 * b);
  if (D >= dAB) return v / a + v / b + (D - dAB) / v;
  const vp = Math.sqrt(2 * D * a * b / (a + b));
  return vp / a + vp / b;
}
// 출발하고 t초 뒤에 간 거리
function trapPos(t, D, v, a = KTX_ACC, b = KTX_DEC) {
  const dAB = v * v / (2 * a) + v * v / (2 * b);
  let vp = v, cruise = 0;
  if (D < dAB) vp = Math.sqrt(2 * D * a * b / (a + b)); else cruise = (D - dAB) / v;
  const t1 = vp / a, t2 = t1 + cruise, T = t2 + vp / b;
  if (t <= 0) return 0;
  if (t < t1) return 0.5 * a * t * t;
  const d1 = 0.5 * a * t1 * t1;
  if (t < t2) return d1 + vp * (t - t1);
  if (t < T) { const u = t - t2; return d1 + vp * cruise + vp * u - 0.5 * b * u * u; }
  return D;
}
function fmtDur(sec) { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : m >= 1 ? `${m}분` : '1분 미만'; }
// 역 이름 비교용: 괄호 속 글자는 남기고 공백·괄호·'역'만 뺀다 ("김천(구미)역" → "김천구미")
function ktxKey(s) { return (s || '').replace(/[\s()·.\-]/g, '').replace(/역$/, ''); }

const KTX = {
  ready: false,

  async load() {
    let found = new Map();
    try {
      const names = new Set();
      for (const L of KTX_LINES) for (const s of L.stations) { names.add(s[0]); for (const a of s[4] || []) names.add(a.replace(/\(.*$/, '')); }
      const K = KOREA;
      const q = `[out:json][timeout:120];node["railway"~"^(station|halt)$"]["name"~"^(${[...names].join('|')})"](${K.s},${K.w},${K.n},${K.e});out;`;
      const data = await Net.overpass('ktx-st-v1', q, () => -0.5, { timeout: 120 });
      found = this.matchStations(data.elements || []);
    } catch (e) { /* 역 검색이 안 되면 대략 좌표로 */ }
    for (const L of KTX_LINES) this.makeLine(L, found);
    this.ready = true;
    Transit.ready = true;
    UI.toast(`KTX ${KTX_LINES.length}개 노선(${KTX_LINES.map((l) => l.name).join(', ')})을 만들었습니다. KTX 역에서 E를 눌러 타세요.`, '#2a8fd0');
    // 구간 철길은 가까운 지도보다 늦게, 하나씩
    for (const l of Transit.lines) if (l.ktx) for (let i = 0; i < l.stops.length - 1; i++) this.loadSegment(l, i);
  },

  // 노선마다 역 이름에 맞는 OSM 역 지점 (대략 좌표에서 5km 안, 지하철역 제외)
  matchStations(els) {
    const out = new Map();
    for (const L of KTX_LINES) for (const [name, lat, lon, , alt] of L.stations) {
      if (out.has(name)) continue;
      const keys = new Set([ktxKey(name), ...(alt || []).map(ktxKey)]);
      const ref = GEO.toWorld(lat, lon);
      let best = null, bd = 5000;
      for (const el of els) {
        const t = el.tags || {};
        if (!keys.has(ktxKey(t.name)) && !keys.has(ktxKey(t['name:ko']))) continue;
        if (/subway|light_rail|monorail/.test(t.station || '')) continue;
        const x = GEO.x(el.lon), z = GEO.z(el.lat), d = Math.hypot(x - ref.x, z - ref.z) - (t.station === 'train' ? 300 : 0);
        if (d < bd) { bd = d; best = { x, z }; }
      }
      if (best) out.set(name, best);
    }
    return out;
  },

  makeLine(L, found) {
    const stops = L.stations.map(([name, lat, lon, v]) => { const w = found.get(name) || GEO.toWorld(lat, lon); return { name, x: w.x, z: w.z, v: v || 0 }; });
    const line = {
      id: L.id, name: L.name, short: L.short, color: L.color, ktx: true, model: L.model, cars: L.cars, headway: L.headway, rail: ['rail'],
      stops, segV: stops.slice(0, -1).map((s) => s.v),
      // 구간마다 점 목록 (처음에는 두 역을 잇는 직선)
      segs: stops.slice(0, -1).map((a, i) => this.straight(a, stops[i + 1])),
    };
    this.setGeometry(line);
    Transit.addLine(line);
  },
  straight(a, b) {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 250)), pts = [];
    for (let k = 0; k <= n; k++) pts.push({ x: lerp(a.x, b.x, k / n), z: lerp(a.z, b.z, k / n), tunnel: false, bridge: false });
    return pts;
  },
  // 구간들을 이어 노선 전체의 점·거리·역 위치를 다시 계산하고 운행표를 만든다
  setGeometry(l) {
    const pts = [], tunnel = [], bridge = [], stopAt = [0];
    l.segs.forEach((seg, i) => {
      seg.forEach((p, k) => { if (i > 0 && k === 0) return; pts.push({ x: p.x, z: p.z }); tunnel.push(!!p.tunnel); bridge.push(!!p.bridge); });
      stopAt.push(pts.length - 1);
    });
    const dist = [0];
    for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    Object.assign(l, { pts, tunnel, bridge, dist, stopD: stopAt.map((i) => dist[i]), len: dist[dist.length - 1] });
    Transit.schedule(l);
  },

  // 두 역 사이 철길: 그 사이 사각형 안의 본선 철도(측선·차량기지 제외)를 받아 최단 경로를 찾는다.
  // 고속선(highspeed=yes)을 조금 더 짧게 쳐서 나란히 가는 일반선보다 고른다
  async loadSegment(l, i) {
    const a = l.stops[i], b = l.stops[i + 1];
    const m = 0.025;
    const s = Math.min(GEO.lat(a.z), GEO.lat(b.z)) - m, n = Math.max(GEO.lat(a.z), GEO.lat(b.z)) + m;
    const w = Math.min(GEO.lon(a.x), GEO.lon(b.x)) - m, e = Math.max(GEO.lon(a.x), GEO.lon(b.x)) + m;
    const q = `[out:json][timeout:120];way["railway"="rail"][!"service"](${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)});out geom qt;`;
    let data;
    try { data = await Net.overpass(`ktx-seg-v1/${l.id}/${i}`, q, () => 6000 + i * 10, { timeout: 120 }); } catch (err) { return; }
    const nodes = new Map();
    for (const el of data.elements || []) {
      if (el.type !== 'way' || !el.geometry || !el.nodes) continue;
      const tg = el.tags || {}, tunnel = !!tg.tunnel && tg.tunnel !== 'no', bridge = !!tg.bridge && tg.bridge !== 'no', hs = tg.highspeed === 'yes';
      for (let k = 0; k < el.nodes.length; k++) {
        const id = el.nodes[k], g = el.geometry[k]; if (!g) continue;
        let nd = nodes.get(id);
        if (!nd) { nd = { id, x: GEO.x(g.lon), z: GEO.z(g.lat), adj: [] }; nodes.set(id, nd); }
        if (k > 0) {
          const p = nodes.get(el.nodes[k - 1]); if (!p) continue;
          const len = Math.hypot(nd.x - p.x, nd.z - p.z) * (hs ? 0.8 : 1);
          nd.adj.push({ to: p.id, len, type: 'rail', tunnel, bridge }); p.adj.push({ to: id, len, type: 'rail', tunnel, bridge });
        }
      }
    }
    const near = (pt) => { let best = null, bd = 900; for (const nd of nodes.values()) { const d = Math.hypot(nd.x - pt.x, nd.z - pt.z); if (d < bd) { bd = d; best = nd; } } return best; };
    const na = near(a), nb = near(b);
    if (!na || !nb) return;
    const straightLen = Math.hypot(b.x - a.x, b.z - a.z);
    const path = Transit.dijkstra(na, nb, ['rail'], straightLen * 2.2 + 3000, nodes, 400000);
    if (!path || path.length < 2) return;
    let plen = 0; for (let k = 1; k < path.length; k++) plen += Math.hypot(path[k].x - path[k - 1].x, path[k].z - path[k - 1].z);
    if (plen > straightLen * 2.2 + 3000) return;
    path[0] = { ...path[0], x: a.x, z: a.z }; path[path.length - 1] = { ...path[path.length - 1], x: b.x, z: b.z };
    const old = l.stopD.slice();
    l.segs[i] = path;
    this.setGeometry(l);
    Transit.remap(l, old);
  },

  // ---------------- 차량 모형 (흰 차체, 노선 색 띠, 앞뒤 차량은 유선형 머리)
  carModel(l, idx) {
    const g = new THREE.Group();
    const len = 19, n = l.cars;
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, metalness: 0.35, roughness: 0.35 });
    const band = new THREE.MeshStandardMaterial({ color: new THREE.Color(l.color), metalness: 0.3, roughness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.8 });
    const win = new THREE.MeshStandardMaterial({ color: 0x18222e, metalness: 0.5, roughness: 0.2, emissive: 0xffe6c0, emissiveIntensity: 0 });
    const box = (w, h, d, m, y, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(0, y, z); g.add(o); return o; };
    const head = idx === 0, tail = idx === n - 1;
    const bodyLen = head || tail ? len - 6 : len, off = head ? -3 : tail ? 3 : 0;
    box(2.95, 3.4, bodyLen, white, 2.15, off);
    // 둥근 지붕과 팬터그래프(가운데 차량 하나)
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.475, 1.475, bodyLen, 14, 1, false, -Math.PI / 2, Math.PI), white);
    roof.rotation.x = -Math.PI / 2; roof.scale.set(1, 1, 0.22); roof.position.set(0, 3.85, off); g.add(roof);
    if (idx === Math.floor(n / 2)) { const pm = box(0.1, 0.9, 1.6, dark, 4.55, 2); pm.rotation.x = 0.5; box(1.6, 0.06, 0.2, dark, 4.95, 2.3); }
    box(2.97, 0.42, bodyLen, band, 1.2, off);
    box(2.97, 0.12, bodyLen, band, 3.55, off);
    box(2.6, 0.8, len - 2, dark, 0.5);
    const w = box(2.99, 0.7, bodyLen - 2, win, 2.5, off);
    for (const [isHead, dir] of [[head, 1], [tail, -1]]) {
      if (!isHead) continue;
      // 유선형 머리: 반타원체를 앞으로 길게 늘인다
      const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, TAU, 0, Math.PI / 2), white);
      nose.rotation.x = dir * Math.PI / 2; nose.scale.set(1.47, l.model === 'eum' ? 5.2 : 6.5, 1.7);
      nose.position.set(0, 2.15, dir * (len / 2 - 6)); g.add(nose);
      const cab = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI / 2), win);
      cab.rotation.x = dir * Math.PI / 2; cab.scale.set(1.15, 2.6, 0.75);
      cab.position.set(0, 2.95, dir * (len / 2 - 5.2)); g.add(cab);
      const stripe = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 6, 0, TAU, 0, Math.PI / 2), band);
      stripe.rotation.x = dir * Math.PI / 2; stripe.scale.set(1.49, l.model === 'eum' ? 4.6 : 5.8, 0.35);
      stripe.position.set(0, 1.25, dir * (len / 2 - 6)); g.add(stripe);
    }
    g.userData.win = w.material;
    g.userData.len = len;
    return g;
  },
};
