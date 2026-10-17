// ---------------------------------------------------------------------------
// 흐름: 시작 화면, 메인 루프, 상호작용(지하철·버스), 메뉴, 입력, VR 세션
// ---------------------------------------------------------------------------
const Game = {
  last: 0, startId: 'busanstn', tTerrain: 0, tTrain: 0, tPlaces: 0, tTime: 0, tSave: 0, placeTab: 'all',
  clock() { return Date.now() / 1000; }, // 실제 시각 기준이라 다시 열어도 열차 위치가 이어진다

  async init() {
    loadSettings();
    G.touch = window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
    if (G.touch) document.body.classList.add('touch');
    try { R.init(); } catch (e) { console.error(e); return; }
    Mats.init(); Places.init(); UI.init(); UI.initMap();
    if (G.touch) UI.initTouch();
    await Cache.open();
    this.bindInput();
    this.setupTitle();
    this.setupXR();
    R.updateTime();
    // 시작 화면 배경: 광안대교 앞바다 위에서 천천히 돈다
    const bg = GEO.toWorld(35.147, 129.128);
    this.titleCenter = new THREE.Vector3(bg.x, 0, bg.z);
    Player.pos.set(bg.x, 300, bg.z);
    G.state = 'title';
    $('title').hidden = false;
    $('loading').hidden = true;
    R.renderer.setAnimationLoop((t) => this.frame(t));
    Transit.load();
    KTX.load();
  },

  setupTitle() {
    const box = $('starts');
    let saved = null; try { saved = JSON.parse(Store.get(POS_KEY) || 'null'); } catch (e) { saved = null; }
    const opts = [];
    if (saved && isFinite(saved.x)) opts.push({ id: 'saved', name: '마지막 위치', sub: '지난번에 있던 곳', x: saved.x, z: saved.z });
    for (const id of STARTS) { const p = placeById(id); opts.push({ id, name: p.name, sub: `${p.city} · ${CATS[p.cat].name}`, p }); }
    for (const id of ['busan-gangneung', 'busan-seoul']) { const t = KTX_TRIPS.find((q) => q.id === id); opts.push({ id: 'trip-' + id, name: `KTX ${t.name}`, sub: `${t.sub} · 바로 탑승`, trip: t }); }
    this.startOpt = opts[0];
    for (const o of opts) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'start' + (o === this.startOpt ? ' on' : '');
      b.innerHTML = `<b></b><span></span>`; b.children[0].textContent = o.name; b.children[1].textContent = o.sub;
      b.addEventListener('click', () => { this.startOpt = o; box.querySelectorAll('.start').forEach((x) => x.classList.remove('on')); b.classList.add('on'); });
      box.appendChild(b);
    }
    $('b-start').addEventListener('click', () => this.start());
    $('b-help').addEventListener('click', () => UI.openMenu(() => this.helpMenu()));
    $('b-vr').addEventListener('click', () => this.enterVR());
  },
  start() {
    $('title').hidden = true;
    G.state = 'play';
    UI.show(true);
    Player.mode = 'walk';
    const o = this.startOpt;
    if (o.trip) this.startTrip(o.trip);
    else if (o.p) this.goPlace(o.p, true); else Player.teleport(o.x, o.z);
    UI.modebar();
    if (!G.touch && !G.xr) this.lockPointer();
    setTimeout(() => UI.toast(G.touch ? '왼쪽 원으로 걷고, 화면을 끌어 둘러보세요. 비행 버튼으로 하늘을 날 수 있습니다.' : 'WASD 이동 · 마우스 시점 · F 비행 · M 지도 · T 명소 · E 타기', '#ffb43a'), 800);
    setTimeout(() => UI.toast('역이나 버스 정류장 가까이 가면 지하철·버스를 탈 수 있습니다.'), 4500);
  },
  goPlace(p, quiet) {
    if (Ride.active) Ride.stop();
    // 해운대 아파트: 1층 입구 앞(해변 쪽)에 서서 타워를 올려다본다
    if (p.id === 'haeapt') { const e = AptHost.entrance(); Player.teleport(e.x, e.z + 9, { x: e.x, z: e.z }); this.pendingPlace = p; UI.banner(p.name, '입구로 걸어가 E를 누르면 38층 집으로 올라갑니다', 3200); return; }
    // 명소 바로 앞(남쪽 60m)에 내려 명소를 바라보게
    let x = p.wx, z = p.wz + 60;
    if (p.cat === 'beach') z = p.wz + 20;
    Player.teleport(x, z, { x: p.wx, z: p.wz });
    this.pendingPlace = p;
    if (!quiet || true) UI.banner(p.name, `${p.city} · ${CATS[p.cat].name}`, 2600);
  },
  // 건물 안에 서 있게 되면 가장 가까운 바깥으로 옮긴다
  unstick() {
    if (Player.mode !== 'walk' || Ride.active) return;
    if (!City.insideBuilding(Player.pos.x, Player.pos.z) && !AptHost.blocks(Player.pos.x, Player.pos.z)) return;
    for (let r = 3; r < 200; r += 3) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU, x = Player.pos.x + Math.cos(a) * r, z = Player.pos.z + Math.sin(a) * r;
      if (!City.insideBuilding(x, z)) { Player.pos.x = x; Player.pos.z = z; Player.settle = 1; return; }
    }
  },

  // KTX 여행: 출발역으로 옮겨 바로 타고, 도착역에서 자동으로 내린다. KTX 노선이 아직이면 잠시 기다린다
  startTrip(t, tries = 0) {
    const l = Transit.lines.find((q) => q.id === t.line);
    const KL = KTX_LINES.find((q) => q.id === t.line), s0 = KL.stations.find((q) => q[0] === t.from);
    if (!l) {
      if (tries === 0) { if (Ride.active) Ride.stop(); const w = GEO.toWorld(s0[1], s0[2]); Player.setMode('walk'); Player.teleport(w.x + 3, w.z + 3); UI.toast('KTX 노선을 만드는 중입니다. 잠시 뒤 탑니다.'); }
      if (tries < 120) setTimeout(() => this.startTrip(t, tries + 1), 500);
      return;
    }
    const i = l.stops.findIndex((q) => q.name === t.from), j = l.stops.findIndex((q) => q.name === t.to);
    if (i < 0 || j < 0 || i === j) return;
    if (Ride.active) Ride.stop();
    Player.setMode('walk');
    Player.teleport(l.stops[i].x + 3, l.stops[i].z + 3);
    Ride.startSubway(l, i, Math.sign(j - i), j);
    if (!G.touch && !G.xr && G.state === 'play') this.lockPointer();
  },
  tripsMenu() {
    return {
      title: 'KTX 여행', sub: '고르면 출발역으로 옮겨 바로 탑니다. 도착역에서 자동으로 내립니다. 탑승 중 G: 빨리 가기, N: 다음 역 앞까지.',
      items: KTX_TRIPS.map((t) => {
        const l = Transit.lines.find((q) => q.id === t.line);
        const dur = l ? Transit.travelTime(l, l.stops.findIndex((q) => q.name === t.from), l.stops.findIndex((q) => q.name === t.to)) : 0;
        const KL = KTX_LINES.find((q) => q.id === t.line);
        return { icon: `<span class="badge" style="background:${KL.color}">${KL.short}</span>`, label: t.name, detail: `${t.sub}${l ? ` · 약 ${fmtDur(dur)}` : ' · 노선 준비 중'}`, right: '타기', disabled: !l, onSelect: () => { UI.closeMenu(); this.startTrip(t); }, keep: true };
      }),
    };
  },

  // ---------------------------------------------------------------- 상호작용
  actionHere() {
    if (Ride.active) return Ride.canExit() ? { label: '여기서 내리기', short: '내리기', fn: () => Ride.exitHere() } : null;
    if (Player.mode === 'fly' && Player.alt() > 8) return null;
    const P = Player.pos;
    const home = AptHost.action(P.x, P.z); if (home) return home;
    if (Transit.ready) { const st = Transit.nearestStation(P.x, P.z, 70); if (st) { const what = st.ktx ? (st.lines.some((o) => !o.line.ktx) ? '지하철·KTX' : 'KTX') : '지하철'; return { label: `${stationLabel(st.name)} · ${what} 타기`, short: st.ktx ? 'KTX' : '지하철', fn: () => UI.openMenu(() => this.stationMenu(st)) }; } }
    let bs = null, bd = 20;
    for (const s of City.stops) { const d = Math.hypot(s.x - P.x, s.z - P.z); if (d < bd) { bd = d; bs = s; } }
    if (bs) return { label: `${bs.name} 정류장 · 버스 타기`, short: '버스', fn: () => this.openBus(bs) };
    return null;
  },
  useAction() { const a = this.actionHere(); if (a && G.state === 'play') a.fn(); },
  stationMenu(st) {
    const now = this.clock();
    const items = [];
    for (const { line, idx } of st.lines) {
      for (const dir of [1, -1]) {
        const nx = idx + dir; if (nx < 0 || nx >= line.stops.length) continue;
        const term = dir > 0 ? line.stops[line.stops.length - 1].name : line.stops[0].name;
        const detail = line.ktx
          ? `${line.name} · 다음 역 ${line.stops[nx].name} · ${term}까지 약 ${fmtDur(Transit.timeToEnd(line, idx, dir))}`
          : (() => { const eta = Transit.eta(line, idx, dir, now); return `${line.name} · 다음 역 ${line.stops[nx].name} · 다음 열차 ${isFinite(eta) ? Math.ceil(eta / 60) + '분 후' : '곧'}`; })();
        items.push({ icon: `<span class="badge" style="background:${line.color}">${line.short}</span>`, label: `${term} 방면`, detail, right: '타기', onSelect: () => { UI.closeMenu(); Ride.startSubway(line, idx, dir); if (!G.touch && !G.xr) this.lockPointer(); }, keep: true });
      }
    }
    // 이 역에 안 서는 KTX는 가까운 역으로 옮겨 타기 (부산역 → 부전역의 강릉행 등)
    for (const x of KTX_TRANSFERS) {
      if (!st.lines.some((o) => o.line.stops[o.idx].name === x.at && o.line.ktx) || st.lines.some((o) => o.line.id === x.line)) continue;
      const t = KTX_TRIPS.find((q) => q.id === x.trip), l = Transit.lines.find((q) => q.id === x.line);
      if (!l) continue;
      const dur = Transit.travelTime(l, l.stops.findIndex((q) => q.name === t.from), l.stops.findIndex((q) => q.name === t.to));
      items.push({ icon: `<span class="badge" style="background:${l.color}">${l.short}</span>`, label: x.label, detail: `${x.note} · ${t.to}까지 약 ${fmtDur(dur)}`, right: `${t.from}역에서 타기`, onSelect: () => { UI.closeMenu(); this.startTrip(t); }, keep: true });
    }
    return { title: stationLabel(st.name), sub: st.ktx ? '탈 방향을 고르세요. 바로 출발하는 열차에 탑니다. KTX 안에서는 G로 시간을 빨리 흘리고 N으로 다음 역 앞까지 건너뛸 수 있습니다.' : '탈 방향을 고르세요. 바로 출발하는 열차에 탑니다.', items: items.length ? items : [{ text: '이 역의 노선 정보를 만들지 못했습니다.' }] };
  },
  openBus(stop) {
    let state = { loading: true, routes: [], err: false };
    UI.openMenu(() => {
      if (state.loading) return { title: `${stop.name}`, sub: '이 정류장을 지나는 노선을 불러오는 중…', items: [{ text: 'OpenStreetMap에서 버스 노선 정보를 받고 있습니다.' }, { label: '닫기', onSelect: () => UI.closeMenu(), keep: true }] };
      if (state.err || !state.routes.length) return { title: `${stop.name}`, sub: state.err ? '노선 정보를 불러오지 못했습니다.' : 'OSM에 이 정류장을 지나는 노선 정보가 없습니다.', items: [{ text: '다른 정류장을 찾아보거나 지하철을 이용해 보세요. OSM에 노선이 등록된 정류장에서만 탈 수 있습니다.' }, { label: '닫기', onSelect: () => UI.closeMenu(), keep: true }] };
      return { title: `${stop.name}`, sub: '탈 버스를 고르세요.', items: state.routes.map((r) => ({ icon: `<span class="badge" style="background:${r.colour || '#2a6ad0'}">${r.ref}</span>`, label: `${r.to} 방향`, detail: `${r.name} · 남은 정류장 ${r.stops.length - 1 - r.startStop}곳`, right: '타기', onSelect: () => { UI.closeMenu(); Ride.startBus(r); if (!G.touch && !G.xr) this.lockPointer(); }, keep: true })) };
    });
    Bus.routesAt(stop).then((routes) => { state = { loading: false, routes }; UI.refresh(); }).catch(() => { state = { loading: false, routes: [], err: true }; UI.refresh(); });
  },

  // ---------------------------------------------------------------- 메뉴
  openMenu() {
    if (G.state !== 'play') return;
    UI.openMenu(() => ({
      title: '메뉴', sub: `${UI.placeName || ''} · ${GEO.lat(Player.pos.z).toFixed(4)}, ${GEO.lon(Player.pos.x).toFixed(4)}`,
      items: [
        { label: '계속하기', onSelect: () => { UI.closeMenu(); if (!G.touch && !G.xr) this.lockPointer(); }, keep: true },
        { label: '명소로 이동', detail: `부산·울산 명소와 대학교 ${PLACES.length}곳`, onSelect: () => UI.openMenu(() => this.placesMenu()), keep: true },
        { label: '지도 열기', detail: '위성 지도에서 원하는 곳을 눌러 이동', onSelect: () => { UI.closeMenu(); UI.openMap(); }, keep: true, disabled: G.xr },
        { label: 'KTX 여행', detail: KTX.ready ? '부산 → 강릉, 부산 → 서울 등 골라서 바로 타기' : 'KTX 노선을 만드는 중', disabled: !KTX.ready, onSelect: () => UI.openMenu(() => this.tripsMenu()), keep: true },
        { label: '철도 노선 (지하철·KTX)', detail: Transit.ready ? `${Transit.lines.length}개 노선 · 역으로 바로 이동` : Transit.msg, disabled: !Transit.ready, onSelect: () => UI.openMenu(() => this.linesMenu()), keep: true },
        Ride.isKTX() ? { label: `빨리 가기: ×${Ride.active.ts}`, detail: '고르면 시간 흐름이 1배 → 10배 → 60배로 바뀝니다 (G)', onSelect: () => Ride.cycleSpeed() } : null,
        Ride.isKTX() ? { label: '다음 역 앞까지 건너뛰기', detail: '열차가 다음 역 앞에서 속도를 줄이기 시작하는 곳으로 갑니다 (N)', onSelect: () => { Ride.skipNext(); UI.closeMenu(); if (!G.touch && !G.xr) this.lockPointer(); }, keep: true } : null,
        { label: Player.mode === 'fly' ? '걷기로 바꾸기' : '비행으로 바꾸기', disabled: !!Ride.active, onSelect: () => { Player.setMode(Player.mode === 'fly' ? 'walk' : 'fly'); UI.closeMenu(); if (!G.touch && !G.xr) this.lockPointer(); }, keep: true },
        { label: '시간대', right: this.hourLabel(), onSelect: () => UI.openMenu(() => this.timeMenu()), keep: true },
        { label: '설정', onSelect: () => UI.openMenu(() => this.settingsMenu()), keep: true },
        { label: '조작법', onSelect: () => UI.openMenu(() => this.helpMenu()), keep: true },
        { label: '데이터와 한계', onSelect: () => UI.openMenu(() => this.aboutMenu()), keep: true },
        Ride.active ? { label: '탑승 그만두기', onSelect: () => { Ride.exitHere(); UI.closeMenu(); }, keep: true } : null,
        { label: '시작 화면으로', onSelect: () => { UI.closeMenu(); if (Ride.active) Ride.stop(); G.state = 'title'; UI.show(false); $('title').hidden = false; }, keep: true },
      ],
    }));
  },
  openPlaces() { if (G.state === 'play') UI.openMenu(() => this.placesMenu()); },
  placesMenu() {
    const P = Player.pos;
    const tabs = [['all', '전체'], ['부산', '부산'], ['울산', '울산'], ['수도권', '서울·경기'], ['충청', '충청·대전'], ['대구·경북', '대구·경북'], ['강원', '강원'], ['uni', '대학교'], ['transit', '교통'], ['beach', '해변'], ['culture', '문화']];
    const list = PLACES.filter((p) => this.placeTab === 'all' || CITY_GROUP[p.city] === this.placeTab || p.cat === this.placeTab)
      .map((p) => ({ p, d: Math.hypot(p.wx - P.x, p.wz - P.z) })).sort((a, b) => (this.placeTab === 'all' ? a.d - b.d : a.p.name.localeCompare(b.p.name, 'ko')));
    return {
      title: '명소로 이동', sub: '고르면 그 앞으로 순간이동합니다.',
      tabs: tabs.map(([k, l]) => ({ label: l, on: this.placeTab === k, onSelect: () => { this.placeTab = k; } })),
      items: list.map(({ p, d }) => ({ icon: `<span class="badge" style="background:${CATS[p.cat].color};color:#06121c">${CATS[p.cat].name}</span>`, label: p.name, detail: p.desc, right: fmtDist(d), onSelect: () => { UI.closeMenu(); this.goPlace(p); if (!G.touch && !G.xr) this.lockPointer(); }, keep: true })),
    };
  },
  linesMenu() {
    return { title: '철도 노선', sub: '역을 고르면 그 역으로 이동합니다.', items: Transit.lines.map((l) => ({ icon: `<span class="badge" style="background:${l.color}">${l.short}</span>`, label: l.name, detail: `${l.stops[0].name} ↔ ${l.stops[l.stops.length - 1].name} · ${l.stops.length}개 역 · ${(l.len / 1000).toFixed(1)} km${l.ktx ? ` · 약 ${fmtDur(l.one)}` : ''}`, onSelect: () => UI.openMenu(() => this.lineStations(l)), keep: true })) };
  },
  lineStations(l) {
    return { title: l.name, sub: `역 ${l.stops.length}곳`, items: l.stops.map((s, i) => ({ icon: `<span class="badge" style="background:${l.color}">${i + 1}</span>`, label: s.name, onSelect: () => { UI.closeMenu(); if (Ride.active) Ride.stop(); Player.setMode('walk'); Player.teleport(s.x + 8, s.z + 8); UI.banner(stationLabel(s.name), l.name, 2200); if (!G.touch && !G.xr) this.lockPointer(); }, keep: true })) };
  },
  hourLabel() { const h = G.settings.hour; return h === 'auto' ? '실제 시각' : { 7: '아침', 13: '낮', 18.5: '노을', 22: '밤' }[h] || `${h}시`; },
  timeMenu() {
    const set = (h) => { G.settings.hour = h; saveSettings(); R.updateTime(); };
    return { title: '시간대', sub: '밤에는 창문과 다리 불빛이 켜집니다.', items: [['auto', '실제 시각 (한국)'], [7, '아침'], [13, '낮'], [18.5, '노을'], [22, '밤']].map(([h, l]) => ({ label: l, right: G.settings.hour === h ? '선택됨' : '', onSelect: () => set(h) })) };
  },
  settingsMenu() {
    const S = G.settings, tog = (k) => { S[k] = !S[k]; saveSettings(); };
    const qn = { auto: '자동', low: '낮음', medium: '보통', high: '높음' };
    return {
      title: '설정', items: [
        { label: `그래픽 품질: ${qn[S.quality]}`, detail: '높음은 위성 사진이 더 선명하고 멀리까지 불러옵니다. 새로 불러오는 지역부터 적용됩니다.', onSelect: () => { const o = ['auto', 'low', 'medium', 'high']; S.quality = o[(o.indexOf(S.quality) + 1) % o.length]; saveSettings(); R.applyQuality(); } },
        { label: `명소 이름표: ${S.labels ? '켬' : '끔'}`, onSelect: () => tog('labels') },
        { label: `도로 위 차량: ${S.traffic ? '켬' : '끔'}`, onSelect: () => tog('traffic') },
        { label: `안내 방송(음성): ${S.voice ? '켬' : '끔'}`, detail: '지하철·버스에서 역 이름을 읽어 줍니다. 기기에 한국어 음성이 있어야 합니다.', onSelect: () => tog('voice') },
        { label: `마우스 감도: ${S.sens.toFixed(2)}`, onSelect: () => { const o = [0.5, 0.75, 1, 1.25, 1.5, 2]; S.sens = o[(o.indexOf(S.sens) + 1) % o.length] || 1; saveSettings(); } },
        { label: `세로 시점 반전: ${S.invertY ? '켬' : '끔'}`, onSelect: () => tog('invertY') },
      ],
    };
  },
  helpMenu() {
    return {
      title: '조작법', items: [
        { text: '키보드·마우스', head: true },
        { text: '화면 클릭: 마우스 고정 · WASD: 이동 · Shift: 달리기(비행 중에는 가속) · Space: 점프(비행 중 상승) · C: 비행 중 하강\nF: 걷기/비행 전환 · 마우스 휠 또는 +/−: 비행 속도 · E: 지하철·KTX·버스 타기, 내리기\nKTX 안에서: G 시간 빨리(1·10·60배) · N 다음 역 앞까지 건너뛰기\nM: 지도 · T: 명소 목록 · Esc: 메뉴' },
        { text: '터치', head: true },
        { text: '왼쪽 원: 이동 · 화면 드래그: 둘러보기 · 비행/위로/아래로 · 달리기 · 지도 · 메뉴 · 타기 버튼' },
        { text: 'VR (WebXR)', head: true },
        { text: '왼쪽 스틱: 이동 · 오른쪽 스틱 좌우: 30° 회전, 위아래: 비행 중 상승·하강\nA: 지하철·버스 타기/내리기 · B: 메뉴 · X: 명소 목록 · Y: 걷기/비행 · 스틱 누르기: 비행 속도\n메뉴는 오른손 광선으로 가리키고 트리거로 고릅니다. 왼손목에 현재 위치가 보입니다.' },
        { text: '이동 요령', head: true },
        { text: '역이나 정류장 가까이 가면 화면에 "타기" 안내가 나옵니다. 탑승 중에는 정차할 때 E로 내릴 수 있습니다. 먼 곳은 지도나 명소 목록으로 순간이동하세요.\nKTX는 부산역·부전역·울산역·태화강역 등에서 탈 수 있습니다. 서울까지 실제처럼 2시간 넘게 걸리니, 메뉴의 "빨리 가기"나 "다음 역 앞까지 건너뛰기"를 쓰세요. 터치·VR에서는 메뉴에서 고릅니다.' },
      ],
    };
  },
  aboutMenu() {
    return {
      title: '데이터와 한계', items: [
        { text: '지도 데이터', head: true },
        { text: '건물·도로·철도·역·정류장·버스 노선: © OpenStreetMap 기여자 (ODbL), Overpass API로 실시간 조회\n위성 사진: Esri World Imagery (Esri, Maxar, Earthstar Geographics)\n지형 고도: Mapzen Terrain Tiles (AWS Open Data)' },
        { text: '알아 둘 점', head: true },
        { text: '건물은 OSM 윤곽과 높이에 종류(아파트, 빌라, 상가, 사무실, 학교, 절 등)별 외벽과 지붕을 입힌 것입니다. 실제 외관 사진은 아닙니다.\n상가 간판은 OSM에 등록된 가게 이름을 쓰고, 이름이 없는 곳은 흔한 가게 이름을 꾸며 넣습니다.\n광안대교·부산항대교·울산대교 등 이름난 다리의 주탑과 케이블은 대략적인 위치와 크기로 세운 것입니다.\n울산 조선소의 골리앗 크레인과 건조 중인 배는 해안선을 따라 자동으로 놓은 것이라 실제 도크 위치와 다를 수 있습니다.\n지하철과 KTX 운행은 실제 시간표가 아니라 노선 길이로 계산한 모의 운행입니다. KTX 정차역은 경부선(서울~부산)과 동해선 KTX-이음(부전~강릉)의 주요 정차역을 따랐고, 열차마다 다른 정차 패턴은 넣지 않았습니다.\n위경도를 미터로 바꾸는 축척을 부산·울산에 맞춰서, 북쪽으로 갈수록 조금씩 크게 보입니다(대구 약 1%, 서울·강릉 약 3%).\n버스는 OSM에 노선이 등록된 정류장에서만 탈 수 있습니다.\n비행기는 활주로 방향으로 착륙·이륙을 반복하는 연출입니다.\n명소 위치는 주변 OSM 이름과 맞춰 자동으로 보정하지만, 몇십 m 어긋날 수 있습니다.' },
      ],
    };
  },

  // ---------------------------------------------------------------- 입력
  lockPointer() { const c = $('view'); if (G.touch || !c.requestPointerLock) return; try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 무시 */ } },
  bindInput() {
    const c = $('view');
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (!e.repeat) Input.pressed.add(e.code);
      Input.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code) && G.state === 'play') e.preventDefault();
      if (G.state === 'play') {
        if (e.code === 'Escape' || e.code === 'Tab') this.openMenu();
        else if (e.code === 'KeyM') UI.openMap();
        else if (e.code === 'KeyT') this.openPlaces();
        else if (e.code === 'KeyF') Player.setMode(Player.mode === 'fly' ? 'walk' : 'fly');
        else if (e.code === 'KeyE') this.useAction();
        else if (e.code === 'KeyG') Ride.cycleSpeed();
        else if (e.code === 'KeyN') Ride.skipNext();
      } else if (G.state === 'map' && (e.code === 'Escape' || e.code === 'KeyM')) { UI.closeMap(); }
    });
    window.addEventListener('keyup', (e) => Input.keys.delete(e.code));
    window.addEventListener('blur', () => Input.keys.clear());
    c.addEventListener('mousedown', () => { if (G.state === 'play' && !G.pointerLocked && !G.touch) this.lockPointer(); });
    window.addEventListener('mousemove', (e) => { if (G.pointerLocked) { Input.mouseDX += e.movementX; Input.mouseDY += e.movementY; } });
    c.addEventListener('wheel', (e) => { if (G.state === 'play') { e.preventDefault(); Input.wheel += Math.sign(e.deltaY); } }, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { G.pointerLocked = document.pointerLockElement === c; });
    // 마우스 고정이 안 되는 환경: 드래그로 둘러보기
    let drag = null;
    c.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && !G.pointerLocked) drag = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('pointermove', (e) => { if (drag && e.pointerType === 'mouse' && !G.pointerLocked && G.state === 'play') { Input.mouseDX += e.clientX - drag.x; Input.mouseDY += e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; } });
    window.addEventListener('pointerup', () => { drag = null; });
    document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') Store.set(POS_KEY, JSON.stringify({ x: Player.pos.x, z: Player.pos.z })); });
  },

  // ---------------------------------------------------------------- VR
  setupXR() {
    if (!navigator.xr || !navigator.xr.isSessionSupported) return;
    navigator.xr.isSessionSupported('immersive-vr').then((ok) => { if (ok) { $('b-vr').hidden = false; this.vrOk = true; } }).catch(() => {});
    const xr = R.renderer.xr;
    xr.addEventListener('sessionstart', () => {
      if (G.state === 'apt') { G.xr = true; Player.initXR(); Apt.xrStart(); return; } // 해운대 아파트 안
      G.xr = true; Player.initXR(); UI.show(false);
      R.camera.position.set(0, 0, 0); R.camera.rotation.set(0, 0, 0);
      R.rig.rotation.set(0, Player.yaw, 0);
      Player.syncRigXR(true);
      UI.banner(UI.placeName || '부산', '왼쪽 스틱으로 걷고 Y로 하늘을 나세요', 4000);
    });
    xr.addEventListener('sessionend', () => {
      if (G.state === 'apt') { G.xr = false; Apt.xrEnd(); return; }
      G.xr = false; Player.yaw = R.rig.rotation.y; R.rig.rotation.set(0, 0, 0);
      if (UI.vr) UI.vr.mesh.visible = false;
      if (G.state !== 'title') UI.show(true);
    });
  },
  async enterVR() {
    if (G.state === 'title') this.start();
    try {
      const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
      await R.renderer.xr.setSession(s);
    } catch (e) { UI.toast('VR을 시작하지 못했습니다. 헤드셋 브라우저에서 HTTPS 주소로 열어 주세요.', '#ff8a6a'); }
  },

  // ---------------------------------------------------------------- 루프
  frame(t) {
    try { this.step(t); } catch (e) { if (!this.errShown) { this.errShown = true; console.error(e); UI.toast('오류: ' + e.message, '#ff8a6a'); } }
    R.renderer.render(R.scene, R.camera);
  },
  step(t) {
    const now = t / 1000;
    const dt = this.last ? clamp(now - this.last, 0.001, 0.1) : 0.016;
    this.last = now;
    this.logic(dt);
  },
  logic(dt) {
    G.time += dt; R.timeU.value = G.time;
    const clock = this.clock();
    if (G.state === 'title') {
      const a = G.time * 0.04, c = this.titleCenter;
      Player.pos.set(c.x + Math.cos(a) * 1800, 380, c.z + Math.sin(a) * 1800);
      R.rig.position.copy(Player.pos); R.rig.rotation.set(0, 0, 0);
      R.camera.position.set(0, 0, 0); R.camera.lookAt(c.x, 40, c.z);
      Player.groundY = 0;
    } else if (G.state === 'apt') {
      AptHost.update(dt); // 해운대 아파트 안: 집 코드가 카메라와 화면을 맡는다
    } else {
      if (G.xr && G.state === 'play') Player.beginXRFrame();
      if (G.state === 'play') Player.update(dt);
      if (G.state === 'play' || G.state === 'menu') Ride.update(G.state === 'play' ? dt : 0);
      Player.updateCamera();
      if (G.xr) { UI.updateVRMenu(); Player.updateWrist(dt); }
      this.tPlaces -= dt; if (this.tPlaces <= 0) { this.tPlaces = 0.25; Places.update(); this.unstick(); }
      UI.update(dt);
      this.tSave -= dt; if (this.tSave <= 0) { this.tSave = 10; if (!Ride.active) Store.set(POS_KEY, JSON.stringify({ x: Player.pos.x, z: Player.pos.z })); }
    }
    // 지도 불러오기 (지하 터널 안에서는 멈춘다)
    this.tTerrain -= dt;
    if (this.tTerrain <= 0 && R.world.visible) { this.tTerrain = 0.35; Terrain.update(Player.pos.x, Player.pos.z, Player.alt()); }
    this.tTrain -= dt; if (this.tTrain <= 0) { this.tTrain = 0.033; Transit.updateTrains(clock); }
    Traffic.update(dt);
    AptHost.tick(dt);
    Planes.update(clock);
    this.tTime -= dt; if (this.tTime <= 0) { this.tTime = 2; R.updateTime(); }
    const n = R.nightU.value;
    Terrain.dayColor.setScalar(1 - 0.78 * n);
    Mats.wall.emissiveIntensity = n > 0.05 ? 1 : 0;
    Mats.updateNight(n);
    BridgeFX.update(G.time, n);
    Decor.update(G.time, n);
    if (G.state !== 'title') { People.update(dt); Gulls.update(dt); }
    Ships.update(dt);
    const cam = R.camera.getWorldPosition(new THREE.Vector3());
    R.follow(cam);
    R.setFogForAltitude(cam.y - Player.groundY);
    Input.endFrame();
  },
};

if (location.search.includes('debug')) window.__buvr = { PLACES, LINES, G, Game, Player, Terrain, City, Transit, Traffic, Planes, Ride, Bus, UI, R, Net, GEO, Places, Mats, Atlas, Decor, BridgeFX, KTX, Apt, AptHost, Ships, People, Gulls, THREE };
Game.init();
