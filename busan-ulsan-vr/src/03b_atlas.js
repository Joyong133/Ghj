// ---------------------------------------------------------------------------
// 건물 외벽 아틀라스: 한국 도시에서 흔한 외벽 16종을 캔버스로 그린다.
// 한 칸 = 가로 unit m × 한 층 높이. 셰이더가 정점의 style 값으로 칸을 고른다.
// ---------------------------------------------------------------------------
const FACADE = {
  APT_A: 0, APT_B: 1, APT_SIDE: 2, OFFICE_GLASS: 3, OFFICE_GRID: 4, STOREFRONT: 5, VILLA: 6, HOUSE: 7,
  INDUSTRIAL: 8, HOTEL: 9, SCHOOL: 10, TEMPLE: 11, PARKING: 12, PLAIN: 13, STATION: 14, SHOP_UPPER: 15,
};
// [가로 m, 층 높이 m]
const FACADE_UNIT = [[6, 2.8], [6, 2.9], [5, 2.8], [3.2, 3.8], [3.6, 3.6], [5, 4.5], [4, 2.7], [5, 2.8], [4, 6], [3.2, 3.4], [4.5, 3.6], [2.6, 3.2], [5, 3], [4, 3], [4, 4.5], [4.5, 3.3]];

const Atlas = {
  build() {
    const N = 4, S = 256;
    const c = document.createElement('canvas'); c.width = c.height = N * S;
    const e = document.createElement('canvas'); e.width = e.height = N * S;
    const g = c.getContext('2d'), ge = e.getContext('2d');
    ge.fillStyle = '#000'; ge.fillRect(0, 0, N * S, N * S);
    const rnd = mulberry32(7);
    const cells = [
      this.aptA, this.aptB, this.aptSide, this.officeGlass, this.officeGrid, this.storefront, this.villa, this.house,
      this.industrial, this.hotel, this.school, this.temple, this.parking, this.plain, this.station, this.shopUpper,
    ];
    cells.forEach((fn, i) => {
      const x = (i % N) * S, y = Math.floor(i / N) * S;
      g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, S, S); g.clip();
      ge.save(); ge.translate(x, y); ge.beginPath(); ge.rect(0, 0, S, S); ge.clip();
      fn.call(this, g, ge, S, rnd);
      // 미세한 얼룩
      for (let k = 0; k < 500; k++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.035})`; g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 3, 2 + rnd() * 3); }
      g.restore(); ge.restore();
    });
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const lit = new THREE.CanvasTexture(e); lit.colorSpace = THREE.SRGBColorSpace;
    return { tex, lit };
  },
  glass(g, x, y, w, h, top = '#c8dae6', bot = '#4f6e86') {
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, top); gr.addColorStop(1, bot);
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(x, y + h * 0.7); g.lineTo(x + w * 0.35, y); g.lineTo(x + w * 0.55, y); g.lineTo(x, y + h); g.fill();
  },
  light(ge, x, y, w, h, col = '#ffd9a0') { ge.fillStyle = col; ge.fillRect(x, y, w, h); },
  frame(g, x, y, w, h, col, t = 4) { g.strokeStyle = col; g.lineWidth = t; g.strokeRect(x + t / 2, y + t / 2, w - t, h - t); },

  // 아파트 베란다면: 흰 벽, 층 슬래브 띠, 확장형 베란다 유리창 둘, 난간
  aptA(g, ge, S) {
    g.fillStyle = '#efebe3'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#dcd5c8'; g.fillRect(0, S - 26, S, 26);
    for (const x of [12, 134]) {
      this.glass(g, x, 34, 110, 168, '#d4e2ea', '#5c7c94');
      g.fillStyle = '#f6f4f0'; for (const dx of [36, 73]) g.fillRect(x + dx, 34, 4, 168);
      this.frame(g, x, 34, 110, 168, '#f6f4f0', 5);
      g.fillStyle = 'rgba(240,240,236,0.9)'; g.fillRect(x, 150, 110, 5);
      for (let k = 0; k < 11; k++) g.fillRect(x + 4 + k * 10, 150, 2, 52);
      this.light(ge, x + 6, 40, 98, 108);
    }
    g.fillStyle = '#c8c0b4'; g.fillRect(124, 0, 8, S - 26);
  },
  // 새 아파트: 베이지 판넬, 큰 유리, 진한 창틀, 세로 강조띠
  aptB(g, ge, S) {
    g.fillStyle = '#d8d1c4'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#9f978b'; g.fillRect(0, 0, 18, S); g.fillRect(S - 18, 0, 18, S);
    g.fillStyle = '#c4bcae'; g.fillRect(0, S - 22, S, 22);
    this.glass(g, 30, 24, 196, 186, '#cfe0ea', '#4e6a80');
    g.fillStyle = '#3e444c'; for (const dx of [64, 130]) g.fillRect(30 + dx, 24, 5, 186);
    this.frame(g, 30, 24, 196, 186, '#3e444c', 6);
    g.fillStyle = 'rgba(210,225,235,0.35)'; g.fillRect(30, 140, 196, 70);
    this.light(ge, 36, 30, 184, 110);
  },
  // 아파트 옆면: 거의 막힌 벽, 작은 창 하나와 배관
  aptSide(g, ge, S) {
    g.fillStyle = '#ece7de'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#ddd6ca'; g.fillRect(0, S - 18, S, 18);
    this.glass(g, 104, 70, 48, 64, '#b8c8d4', '#55687a'); this.frame(g, 104, 70, 48, 64, '#f4f2ee', 4);
    g.fillStyle = '#c8c2b8'; g.fillRect(200, 0, 10, S);
    this.light(ge, 108, 74, 40, 56, '#ffe2b0');
  },
  // 유리 커튼월
  officeGlass(g, ge, S) {
    const gr = g.createLinearGradient(0, 0, S, S); gr.addColorStop(0, '#5e8496'); gr.addColorStop(0.5, '#2e4c5c'); gr.addColorStop(1, '#456c80');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(0, 180); g.lineTo(150, 0); g.lineTo(200, 0); g.lineTo(0, 240); g.fill();
    g.fillStyle = '#1f2f38'; g.fillRect(0, S - 36, S, 36);
    g.fillStyle = '#a8b4bc'; for (const x of [0, 127]) g.fillRect(x, 0, 4, S); g.fillRect(0, S - 38, S, 3);
    // 밤: 천장 형광등 줄이 밝고 아래로 갈수록 어두운 사무실 실내
    for (const x of [6, 134]) {
      const lg = ge.createLinearGradient(0, 8, 0, S - 42); lg.addColorStop(0, '#e4eefc'); lg.addColorStop(0.25, '#9fb2c8'); lg.addColorStop(1, '#4a5868');
      ge.fillStyle = lg; ge.fillRect(x, 8, 116, S - 50);
      ge.fillStyle = '#f4f8ff'; ge.fillRect(x + 8, 12, 100, 5);
      ge.fillStyle = 'rgba(10,14,20,0.55)'; ge.fillRect(x + 20, 120, 30, 60); ge.fillRect(x + 70, 130, 26, 50); // 칸막이·사람 그림자
    }
  },
  // 콘크리트 격자 사무실
  officeGrid(g, ge, S) {
    g.fillStyle = '#bdb8ae'; g.fillRect(0, 0, S, S);
    for (const x of [24, 140]) {
      this.glass(g, x, 40, 92, 150, '#a8b8c4', '#2e3a46');
      const lg = ge.createLinearGradient(0, 40, 0, 190); lg.addColorStop(0, '#eef2fc'); lg.addColorStop(0.3, '#a8b4c4'); lg.addColorStop(1, '#505a66');
      ge.fillStyle = lg; ge.fillRect(x, 40, 92, 150);
    }
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(24, 40, 92, 8); g.fillRect(140, 40, 92, 8);
  },
  // 1층 상가: 간판 자리, 큰 유리문, 따뜻한 실내
  storefront(g, ge, S) {
    g.fillStyle = '#2e3238'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#44484e'; g.fillRect(0, 0, S, 52);
    const gr = g.createLinearGradient(0, 60, 0, 236); gr.addColorStop(0, '#e8dcc4'); gr.addColorStop(1, '#a89a84');
    g.fillStyle = gr; g.fillRect(10, 62, 236, 176);
    g.fillStyle = 'rgba(120,150,170,0.35)'; g.fillRect(10, 62, 236, 176);
    g.fillStyle = '#2a2a2a'; for (const x of [10, 84, 164, 242]) g.fillRect(x, 62, 6, 176); g.fillRect(10, 140, 236, 4);
    g.fillStyle = '#8a8a8a'; g.fillRect(0, 238, S, 18);
    // 밤: 따뜻한 실내, 위쪽 조명이 밝고 진열대 그림자와 창틀이 보이게
    const lg = ge.createLinearGradient(0, 64, 0, 236); lg.addColorStop(0, '#ffeccc'); lg.addColorStop(0.5, '#e0bc8c'); lg.addColorStop(1, '#a07850');
    ge.fillStyle = lg; ge.fillRect(12, 64, 232, 172);
    ge.fillStyle = 'rgba(40,24,10,0.5)'; ge.fillRect(30, 170, 40, 66); ge.fillRect(110, 180, 36, 56); ge.fillRect(186, 160, 44, 76);
    ge.fillStyle = '#000'; for (const x of [10, 84, 164, 242]) ge.fillRect(x, 62, 6, 176); ge.fillRect(10, 140, 236, 4);
  },
  // 빌라(다세대): 붉은 벽돌, 작은 창과 방범창
  villa(g, ge, S, rnd) {
    g.fillStyle = '#8c4c38'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 16) { for (let x = (y / 16) % 2 ? -16 : 0; x < S; x += 32) { g.fillStyle = `rgb(${130 + rnd() * 25},${66 + rnd() * 18},${48 + rnd() * 14})`; g.fillRect(x + 1, y + 1, 30, 14); } }
    g.fillStyle = '#d8d0c4'; g.fillRect(0, S - 20, S, 20);
    this.glass(g, 70, 56, 116, 110, '#b4c4d0', '#3c4a58');
    g.fillStyle = '#f2efe8'; g.fillRect(70, 56, 116, 6); g.fillRect(70, 160, 116, 8);
    g.fillStyle = 'rgba(40,40,40,0.85)'; for (let k = 0; k < 10; k++) g.fillRect(74 + k * 12, 56, 3, 110); g.fillRect(70, 100, 116, 3);
    this.light(ge, 74, 62, 108, 98);
  },
  // 단독주택: 회반죽 벽, 작은 창
  house(g, ge, S) {
    g.fillStyle = '#e4d8c2'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#cbbda4'; g.fillRect(0, S - 30, S, 30);
    this.glass(g, 84, 70, 88, 90, '#c0ccd4', '#46586a'); this.frame(g, 84, 70, 88, 90, '#6a4a32', 6);
    g.fillStyle = '#6a4a32'; g.fillRect(126, 70, 5, 90);
    this.light(ge, 90, 76, 76, 78);
  },
  // 공장: 골함석
  industrial(g, ge, S) {
    g.fillStyle = '#aab6be'; g.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 12) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, 0, 4, S); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 6, 0, 2, S); }
    g.fillStyle = '#5a7a9a'; g.fillRect(0, 20, S, 40);
    this.glass(g, 0, 26, S, 28, '#c8d4dc', '#7a8a96');
    this.light(ge, 0, 26, S, 28, '#e8f0ff');
  },
  // 호텔·주상복합 타워: 어두운 유리와 흰 띠
  hotel(g, ge, S) {
    g.fillStyle = '#1e2c38'; g.fillRect(0, 0, S, S);
    this.glass(g, 0, 0, S, S - 30, '#4c6c80', '#1a2834');
    g.fillStyle = '#e8eaec'; g.fillRect(0, S - 30, S, 30);
    g.fillStyle = '#c8ccd0'; g.fillRect(126, 0, 4, S - 30);
    this.light(ge, 0, 6, S, S - 40, '#ffe4b8');
  },
  // 학교: 크림색 벽, 큰 창 셋
  school(g, ge, S) {
    g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#d0c2a4'; g.fillRect(0, S - 24, S, 24);
    for (const x of [14, 96, 178]) { this.glass(g, x, 50, 64, 140, '#c8d8e0', '#4a6070'); this.frame(g, x, 50, 64, 140, '#f4f0e8', 5); g.fillStyle = '#f4f0e8'; g.fillRect(x, 118, 64, 4); this.light(ge, x + 4, 54, 56, 132, '#f0f4ff'); }
  },
  // 한옥(사찰): 붉은 기둥, 흰 벽, 창살문
  temple(g, ge, S) {
    g.fillStyle = '#efe8da'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#8c3a28'; g.fillRect(0, 0, 26, S); g.fillRect(S - 26, 0, 26, S);
    g.fillStyle = '#2f6a58'; g.fillRect(0, 0, S, 26);
    g.fillStyle = '#c8a24a'; for (let x = 6; x < S; x += 20) g.fillRect(x, 8, 10, 10);
    g.fillStyle = '#e6d6b4'; g.fillRect(40, 44, 176, 168);
    g.strokeStyle = '#6a4a32'; g.lineWidth = 3;
    for (let x = 40; x <= 216; x += 22) { g.beginPath(); g.moveTo(x, 44); g.lineTo(x, 212); g.stroke(); }
    for (let y = 44; y <= 212; y += 21) { g.beginPath(); g.moveTo(40, y); g.lineTo(216, y); g.stroke(); }
    g.fillStyle = '#7a5a3a'; g.fillRect(0, S - 30, S, 30);
    this.light(ge, 42, 46, 172, 164, '#ffcf8a');
  },
  // 주차빌딩: 콘크리트와 뚫린 띠
  parking(g, ge, S) {
    g.fillStyle = '#b4b0a8'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#2a2c2e'; g.fillRect(0, 60, S, 120);
    g.fillStyle = '#9a968e'; for (const x of [0, 124, 250]) g.fillRect(x, 60, 8, 120);
    g.fillStyle = '#d8d4cc'; g.fillRect(0, 150, S, 6);
    this.light(ge, 0, 64, S, 30, '#fff4dc');
  },
  // 일반 콘크리트 건물
  plain(g, ge, S) {
    g.fillStyle = '#cdc8be'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#bab4a8'; g.fillRect(0, S - 18, S, 18);
    this.glass(g, 66, 60, 124, 110, '#b8c6d0', '#40505e'); this.frame(g, 66, 60, 124, 110, '#e8e6e0', 5);
    g.fillStyle = '#e8e6e0'; g.fillRect(126, 60, 4, 110);
    this.light(ge, 70, 64, 116, 102);
  },
  // 역사·공공건물: 흰 판넬과 유리띠
  station(g, ge, S) {
    g.fillStyle = '#eef0f2'; g.fillRect(0, 0, S, S);
    this.glass(g, 0, 90, S, 110, '#cfe0ea', '#5a7a90');
    g.fillStyle = '#d4d8dc'; for (const x of [0, 85, 170]) g.fillRect(x, 90, 5, 110);
    g.fillStyle = '#c8ccd0'; g.fillRect(0, 0, S, 8);
    this.light(ge, 0, 92, S, 106, '#f4f8ff');
  },
  // 상가 건물 위층: 타일 벽, 띠창
  shopUpper(g, ge, S) {
    g.fillStyle = '#d6cdbd'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 12) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, y, S, 1); }
    this.glass(g, 12, 50, 232, 120, '#bccad4', '#3a4856');
    g.fillStyle = '#5a5e64'; for (const x of [12, 88, 166, 240]) g.fillRect(x, 50, 5, 120);
    g.fillStyle = '#bfb4a2'; g.fillRect(0, S - 20, S, 20);
    this.light(ge, 16, 54, 226, 112, '#f4f6ff');
  },

  // 간판 아틀라스 (타일마다 하나): 512×96 칸, 4열 × 21행
  signCanvas() { const c = document.createElement('canvas'); c.width = 2048; c.height = 2016; return c; },
  drawSign(c, idx, text, kind) {
    const cols = 4, W = 512, H = 96;
    if (idx >= cols * 21) return null;
    const x = (idx % cols) * W, y = Math.floor(idx / cols) * H;
    const g = c.getContext('2d');
    const style = this.signStyle(text, kind);
    g.fillStyle = style.bg; g.fillRect(x, y, W, H);
    g.fillStyle = style.edge; g.fillRect(x, y, W, 8); g.fillRect(x, y + H - 8, W, 8);
    let size = 58;
    g.font = `800 ${size}px "Gothic A1", "Apple SD Gothic Neo", sans-serif`;
    while (g.measureText(text).width > W - 40 && size > 22) { size -= 4; g.font = `800 ${size}px "Gothic A1", "Apple SD Gothic Neo", sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = style.fg;
    g.fillText(text, x + W / 2, y + H / 2 + 2);
    const tw = Math.min(W - 40, g.measureText(text).width);
    return { u0: x / c.width, u1: (x + W) / c.width, v0: 1 - (y + H) / c.height, v1: 1 - y / c.height, aspect: Math.max(2.2, (tw + 60) / H) };
  },
  signStyle(t, kind) {
    if (kind === 'aptno') return { bg: '#ebe6dd', fg: '#2a4a7a', edge: '#ebe6dd' };
    const brand = [[/GS25/, '#1aa0d8', '#fff'], [/CU|씨유/, '#6a3a9a', '#b8e04a'], [/세븐일레븐|7-?Eleven/i, '#f26a1b', '#fff'], [/이마트24|emart24/i, '#ffd200', '#222'], [/스타벅스|Starbucks/i, '#00704a', '#fff'], [/이디야/, '#1a2a5a', '#fff'], [/파리바게|Paris/, '#1a3a7a', '#fff'], [/올리브영/, '#9ac83a', '#fff'], [/다이소/, '#d8202a', '#fff'], [/맥도날드|McDonald/i, '#da291c', '#ffc72c'], [/롯데리아/, '#d8202a', '#fff'], [/우리은행/, '#0a6ac0', '#fff'], [/국민은행|KB/, '#ffbc00', '#4a4038'], [/신한/, '#0a46a0', '#fff'], [/부산은행|BNK/, '#d8202a', '#fff'], [/약국/, '#2a9a5a', '#fff']];
    for (const [re, bg, fg] of brand) if (re.test(t)) return { bg, fg, edge: 'rgba(255,255,255,0.35)' };
    const pal = { restaurant: ['#c8321e', '#fff8e0'], fast_food: ['#e85a1a', '#fff'], cafe: ['#4a3426', '#f4e8d0'], bar: ['#2a1a3a', '#ff7ae0'], pub: ['#2a1a3a', '#ffd24a'], bank: ['#1a4a9a', '#fff'], pharmacy: ['#2a9a5a', '#fff'], clinic: ['#ffffff', '#1a6ac8'], dentist: ['#ffffff', '#1a8ac8'], convenience: ['#1aa0d8', '#fff'], academy: ['#ffffff', '#1a3a8a'], karaoke: ['#3a1a6a', '#ffe84a'], beauty: ['#f0e0ea', '#a02a6a'], estate: ['#ffffff', '#c82a2a'] };
    const p = pal[kind] || [['#1a3a6a', '#fff'], ['#ffffff', '#222'], ['#d8202a', '#fff'], ['#f4c400', '#222'], ['#1a6a4a', '#fff'], ['#222428', '#f4d24a']][hashStr(t) % 6];
    return { bg: p[0], fg: p[1], edge: 'rgba(0,0,0,0.25)' };
  },
};

// 간판에 쓰는 업종 단어 (실제 상호가 없는 상가 건물에 장식으로 단다)
const GENERIC_SIGNS = {
  ground: [['편의점', 'convenience'], ['카페', 'cafe'], ['약국', 'pharmacy'], ['분식', 'fast_food'], ['돼지국밥', 'restaurant'], ['밀면', 'restaurant'], ['치킨', 'fast_food'], ['부동산', 'estate'], ['안경', 'shop'], ['미용실', 'beauty'], ['횟집', 'restaurant'], ['어묵', 'fast_food'], ['정육점', 'shop'], ['빵집', 'cafe'], ['꽃집', 'shop'], ['세탁소', 'shop'], ['휴대폰', 'shop'], ['떡볶이', 'fast_food'], ['곱창', 'restaurant'], ['씨앗호떡', 'fast_food']],
  upper: [['수학학원', 'academy'], ['영어학원', 'academy'], ['피아노', 'academy'], ['태권도', 'academy'], ['PC방', 'karaoke'], ['노래연습장', 'karaoke'], ['당구장', 'karaoke'], ['치과', 'dentist'], ['한의원', 'clinic'], ['내과', 'clinic'], ['정형외과', 'clinic'], ['피부과', 'clinic'], ['필라테스', 'beauty'], ['헬스', 'academy'], ['법무사', 'estate'], ['세무회계', 'estate'], ['스터디카페', 'cafe'], ['네일', 'beauty'], ['안과', 'clinic'], ['독서실', 'academy']],
};

// 계절: 한국 시각 기준 월로 가로수 색을 정한다
function season() {
  const d = new Date(Date.now() + 9 * 3600e3);
  const m = d.getUTCMonth() + 1, day = d.getUTCDate();
  if ((m === 3 && day >= 25) || (m === 4 && day <= 15)) return 'blossom';
  if (m >= 4 && m <= 9) return 'summer';
  if (m === 10 || m === 11) return 'autumn';
  return 'winter';
}
