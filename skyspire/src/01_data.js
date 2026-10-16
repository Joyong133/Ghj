// ---------------------------------------------------------------------------
// 게임 데이터: 테마, 몬스터, 무기, 검술, 밸런스 공식
// ---------------------------------------------------------------------------
const MAX_FLOOR = 100;

const THEMES = [
  {
    key: 'meadow', name: '초원', prefix: '들판',
    areas: ['바람의 언덕', '푸른 들판', '양치기의 초지', '해바라기 평원', '노을 언덕'],
    sky: { top: 0x3f7fd2, horizon: 0xc4e4ff, bottom: 0x8fb0cc, cloud: 0xffffff },
    sun: { color: 0xfff1d6, intensity: 2.6, elev: 0.85, az: 0.6 },
    fog: { color: 0xbcdaf2, density: 0.0048 },
    hemi: { sky: 0xd2e8ff, ground: 0x5d6e3c, intensity: 0.85 },
    ground: { low: 0x4b8a33, mid: 0x6ea343, high: 0x93a26a, cliff: 0x7c7466, road: 0xa98f64 },
    terrain: { amp: 16, rough: 5 },
    water: { level: -4, color: 0x3a8ab4, kind: 'water' },
    veg: [['oak', 240], ['bush', 160], ['rock', 70], ['pine', 40]],
    grass: { base: 0x4f8f30, tip: 0xbfe06a, density: 1.0 }, flowers: [0xffe066, 0xff86b0, 0xffffff, 0xa98cff],
    enemies: ['boar', 'wolf', 'slime', 'wasp'], weather: 'pollen',
    dungeon: { wall: 0x7a7468, floor: 0x55504a, torch: 0xffa953, fog: 0x15120f },
    mat: '질긴 가죽', music: { root: 57, scale: 'major' },
    house: { wall: [0xeadfc6, 0xdcccad, 0xf2ead8], roof: [0xa44d34, 0x6f4a8c, 0x3d6c8e] },
  },
  {
    key: 'forest', name: '고목의 숲', prefix: '숲',
    areas: ['이끼 낀 오솔길', '고목 군락', '안개 숲', '사슴 계곡', '거미줄 덤불'],
    sky: { top: 0x3a6e8c, horizon: 0xa9cbb8, bottom: 0x6d8a7a, cloud: 0xe8f2ea },
    sun: { color: 0xffe8c2, intensity: 2.1, elev: 0.7, az: 2.1 },
    fog: { color: 0x8fb09c, density: 0.0085 },
    hemi: { sky: 0xb8d6c4, ground: 0x33402a, intensity: 0.8 },
    ground: { low: 0x2f5a2a, mid: 0x3f6e31, high: 0x5c6a45, cliff: 0x5b5448, road: 0x6e5a3f },
    terrain: { amp: 20, rough: 6 },
    water: { level: -5, color: 0x2d5f5a, kind: 'water' },
    veg: [['pine', 330], ['oak', 220], ['mushroom', 40], ['rock', 60], ['bush', 120]],
    grass: { base: 0x2e5a24, tip: 0x86b04c, density: 1.1 }, flowers: [0xfff2a8, 0xcfe8ff],
    enemies: ['wolf', 'treant', 'wasp', 'kobold'], weather: 'leaves',
    dungeon: { wall: 0x5d6150, floor: 0x3e3f35, torch: 0xffb46a, fog: 0x0e110c },
    mat: '고목 수액', music: { root: 55, scale: 'dorian' },
    house: { wall: [0x9a7b58, 0x8a6c4a, 0xb08c62], roof: [0x3f5a32, 0x5b3e2a, 0x2f4a3a] },
  },
  {
    key: 'canyon', name: '붉은 협곡', prefix: '협곡',
    areas: ['갈라진 대지', '붉은 절벽', '바람 깎인 기둥', '마른 강바닥', '독수리 둥지'],
    sky: { top: 0x3b78c8, horizon: 0xf2d2b0, bottom: 0xc8987a, cloud: 0xfff4e6 },
    sun: { color: 0xffe0b8, intensity: 3.0, elev: 0.95, az: 1.2 },
    fog: { color: 0xe8c4a2, density: 0.0042 },
    hemi: { sky: 0xffe2c4, ground: 0x7a4a30, intensity: 0.9 },
    ground: { low: 0xb0623a, mid: 0xc47a45, high: 0xd69a62, cliff: 0x8e4a30, road: 0xd9b07c },
    terrain: { amp: 30, rough: 9 },
    water: null,
    veg: [['dead', 70], ['cactus', 90], ['rock', 220], ['pillar', 40]],
    grass: { base: 0x9a7a3a, tip: 0xd9c070, density: 0.35 }, flowers: [0xff9a3c],
    enemies: ['lizard', 'boar', 'imp', 'crab'], weather: 'dust',
    dungeon: { wall: 0x8e5a40, floor: 0x5e3e2e, torch: 0xffb070, fog: 0x160d08 },
    mat: '붉은 광석', music: { root: 52, scale: 'phrygian' },
    house: { wall: [0xe0b48a, 0xd8a476, 0xeac8a0], roof: [0x8a3a22, 0x6a4a2a, 0xb05a32] },
  },
  {
    key: 'frost', name: '설원', prefix: '서리',
    areas: ['얼어붙은 호수', '눈보라 고개', '얼음 첨탑', '백야의 들판', '고드름 협곡'],
    sky: { top: 0x5a86c0, horizon: 0xe6f0fa, bottom: 0xb6c6d8, cloud: 0xffffff },
    sun: { color: 0xeef4ff, intensity: 2.4, elev: 0.5, az: 3.6 },
    fog: { color: 0xdbe7f3, density: 0.0068 },
    hemi: { sky: 0xe8f2ff, ground: 0x8a98aa, intensity: 1.0 },
    ground: { low: 0xdfe8f0, mid: 0xeef3f8, high: 0xffffff, cliff: 0x8a96a6, road: 0xb8c2cc },
    terrain: { amp: 22, rough: 7 },
    water: { level: -4, color: 0x9cc8e8, kind: 'ice' },
    veg: [['snowpine', 300], ['rock', 120], ['crystal', 25]],
    grass: { base: 0xc8d4dc, tip: 0xffffff, density: 0.25 }, flowers: [0xbfe4ff],
    enemies: ['wolf', 'golem', 'wraith', 'skeleton'], weather: 'snow',
    dungeon: { wall: 0x8c9cb0, floor: 0x5c6878, torch: 0x9fd8ff, fog: 0x0c1118 },
    mat: '얼음 결정', music: { root: 59, scale: 'minor' },
    house: { wall: [0x6e5a48, 0x5e4a3a, 0x7e6a56], roof: [0xe8eef4, 0xdce6ee, 0xf4f8fb] },
  },
  {
    key: 'mire', name: '독안개 늪', prefix: '늪지',
    areas: ['썩은 나무 다리', '부글대는 웅덩이', '버섯 군락', '갈대밭', '안개 낀 수렁'],
    sky: { top: 0x4a5a6a, horizon: 0xa8b096, bottom: 0x707a62, cloud: 0xc8ccb8 },
    sun: { color: 0xe8e4c0, intensity: 1.7, elev: 0.6, az: 4.4 },
    fog: { color: 0x8c947a, density: 0.0105 },
    hemi: { sky: 0xb4bca0, ground: 0x3a3a28, intensity: 0.85 },
    ground: { low: 0x3c4a2a, mid: 0x4e5a30, high: 0x6a6a44, cliff: 0x4a4436, road: 0x5a4a32 },
    terrain: { amp: 9, rough: 4 },
    water: { level: -0.6, color: 0x4e6a3a, kind: 'poison' },
    veg: [['dead', 200], ['mushroom', 160], ['bush', 120], ['rock', 40]],
    grass: { base: 0x3e4c22, tip: 0x8a9a48, density: 1.2 }, flowers: [0xd8ff6a, 0xb08cff],
    enemies: ['slime', 'lizard', 'treant', 'crab'], weather: 'spores',
    dungeon: { wall: 0x52583e, floor: 0x3a3c2a, torch: 0xc8ff7a, fog: 0x0c0f08 },
    mat: '독샘 주머니', music: { root: 50, scale: 'minor' },
    house: { wall: [0x6a5e44, 0x5a5038, 0x7a6c4e], roof: [0x3a4a2a, 0x4a3a2a, 0x2e3a2e] },
  },
  {
    key: 'dune', name: '황금 사구', prefix: '사막',
    areas: ['끝없는 모래 언덕', '바람의 신전터', '오아시스', '해골 골짜기', '신기루 평원'],
    sky: { top: 0x3c7cd0, horizon: 0xf8e4c0, bottom: 0xd6b88a, cloud: 0xfff8ea },
    sun: { color: 0xfff0d0, intensity: 3.2, elev: 1.1, az: 0.2 },
    fog: { color: 0xf0dcb8, density: 0.0038 },
    hemi: { sky: 0xfff0d8, ground: 0xa0804a, intensity: 1.0 },
    ground: { low: 0xd8b06a, mid: 0xe6c27c, high: 0xf0d698, cliff: 0xb08a52, road: 0xc8a060 },
    terrain: { amp: 18, rough: 3 },
    water: { level: -6, color: 0x3aa0b0, kind: 'water' },
    veg: [['cactus', 140], ['rock', 90], ['pillar', 50], ['dead', 30]],
    grass: { base: 0xb09a52, tip: 0xe8d890, density: 0.25 }, flowers: [0xff6a4a],
    enemies: ['crab', 'lizard', 'wasp', 'skeleton'], weather: 'dust',
    dungeon: { wall: 0xb09060, floor: 0x7a6040, torch: 0xffc070, fog: 0x18120a },
    mat: '사막 갑각', music: { root: 54, scale: 'phrygian' },
    house: { wall: [0xf0e0c0, 0xe6d0a8, 0xf8ecd4], roof: [0xd8c098, 0xc8a878, 0x6a8aa8] },
  },
  {
    key: 'crystal', name: '수정 공동', prefix: '수정',
    areas: ['빛나는 동굴숲', '자수정 골짜기', '메아리 호수', '수정 첨탑', '별빛 균열'],
    sky: { top: 0x1a1640, horizon: 0x5a4a9a, bottom: 0x2a2458, cloud: 0x8a7ad8 },
    sun: { color: 0xc8b8ff, intensity: 1.5, elev: 0.9, az: 1.0 },
    fog: { color: 0x40387a, density: 0.0078 },
    hemi: { sky: 0x9a8aff, ground: 0x2a2440, intensity: 1.0 },
    ground: { low: 0x2c2a48, mid: 0x3a3660, high: 0x524a7a, cliff: 0x262236, road: 0x5a5280 },
    terrain: { amp: 18, rough: 8 },
    water: { level: -3, color: 0x5a7aff, kind: 'water' },
    veg: [['crystal', 260], ['mushroom', 120], ['rock', 80]],
    grass: { base: 0x2a3060, tip: 0x7ad0ff, density: 0.6 }, flowers: [0x7af0ff, 0xd08aff],
    enemies: ['golem', 'slime', 'wraith', 'kobold'], weather: 'sparkle',
    dungeon: { wall: 0x4a4478, floor: 0x2c2848, torch: 0xa08aff, fog: 0x0a0818 },
    mat: '마나 수정', music: { root: 61, scale: 'lydian' },
    house: { wall: [0x8a84b0, 0x7a74a0, 0x9a94c0], roof: [0x3a3470, 0x2a5a80, 0x5a3a80] },
  },
  {
    key: 'ember', name: '잿빛 화산', prefix: '화산',
    areas: ['용암 강', '잿더미 평원', '불꽃 분화구', '흑요석 계단', '타오르는 협로'],
    sky: { top: 0x2a1a1a, horizon: 0xa0583a, bottom: 0x4a2418, cloud: 0x6a4a40 },
    sun: { color: 0xffb080, intensity: 2.0, elev: 0.6, az: 5.2 },
    fog: { color: 0x5a3428, density: 0.0082 },
    hemi: { sky: 0xff9a6a, ground: 0x2a1410, intensity: 0.8 },
    ground: { low: 0x2a2220, mid: 0x3a2e2a, high: 0x524038, cliff: 0x1c1616, road: 0x4a3830 },
    terrain: { amp: 26, rough: 10 },
    water: { level: -2.5, color: 0xff5a1a, kind: 'lava' },
    veg: [['dead', 120], ['rock', 200], ['crystal', 30]],
    grass: { base: 0x2a201a, tip: 0x6a4a30, density: 0.2 }, flowers: [0xff7a2a],
    enemies: ['imp', 'golem', 'lizard', 'skeleton'], weather: 'embers',
    dungeon: { wall: 0x3a2a26, floor: 0x241a18, torch: 0xff6a2a, fog: 0x120604 },
    mat: '화염핵', music: { root: 48, scale: 'phrygian' },
    house: { wall: [0x4a3a34, 0x5a4840, 0x3e302a], roof: [0x8a2a1a, 0x2a2020, 0x6a3a22] },
  },
  {
    key: 'garden', name: '하늘 정원', prefix: '하늘',
    areas: ['벚꽃 회랑', '떠도는 섬', '분수 광장', '구름 테라스', '무지개 다리'],
    sky: { top: 0x5a9ae8, horizon: 0xffe0f0, bottom: 0xd8c0e8, cloud: 0xffffff },
    sun: { color: 0xfff0f4, intensity: 2.5, elev: 0.8, az: 2.8 },
    fog: { color: 0xf4dcec, density: 0.0045 },
    hemi: { sky: 0xffeaf6, ground: 0x7a8a6a, intensity: 0.95 },
    ground: { low: 0x6aa86a, mid: 0x86c078, high: 0xb8d8a0, cliff: 0xc8b8c8, road: 0xe8dcd0 },
    terrain: { amp: 14, rough: 4 },
    water: { level: -3.5, color: 0x6ac8e8, kind: 'water' },
    veg: [['blossom', 260], ['bush', 140], ['pillar', 40], ['oak', 60]],
    grass: { base: 0x5a9a5a, tip: 0xd0f0a0, density: 1.0 }, flowers: [0xffb0d8, 0xffffff, 0xffe8a0, 0xb8a0ff],
    enemies: ['wasp', 'wraith', 'kobold', 'lizard'], weather: 'petals',
    dungeon: { wall: 0xc8b8c0, floor: 0x8a7a84, torch: 0xffc8e8, fog: 0x140c12 },
    mat: '하늘 꽃잎', music: { root: 60, scale: 'major' },
    house: { wall: [0xffffff, 0xf4eef8, 0xfff4f0], roof: [0x5a8ac8, 0xd86a8a, 0x8a6ac8] },
  },
  {
    key: 'abyss', name: '심연의 폐허', prefix: '심연',
    areas: ['무너진 성당', '검은 회랑', '공허의 가장자리', '잊힌 왕좌', '속삭이는 묘역'],
    sky: { top: 0x0c0a18, horizon: 0x4a2a5a, bottom: 0x1a1024, cloud: 0x5a3a6a },
    sun: { color: 0xd8a8ff, intensity: 1.4, elev: 0.7, az: 4.0 },
    fog: { color: 0x2a1a34, density: 0.0095 },
    hemi: { sky: 0x8a6aaa, ground: 0x1a1020, intensity: 0.85 },
    ground: { low: 0x2a2430, mid: 0x3a3240, high: 0x4e4456, cliff: 0x1c1822, road: 0x4a4250 },
    terrain: { amp: 24, rough: 9 },
    water: { level: -3, color: 0x6a2a9a, kind: 'void' },
    veg: [['dead', 160], ['pillar', 120], ['crystal', 70], ['rock', 80]],
    grass: { base: 0x2a2234, tip: 0x6a4a8a, density: 0.5 }, flowers: [0xc87aff],
    enemies: ['wraith', 'skeleton', 'golem', 'imp'], weather: 'motes',
    dungeon: { wall: 0x3a3244, floor: 0x221c2a, torch: 0xc87aff, fog: 0x08060c },
    mat: '공허 파편', music: { root: 49, scale: 'minor' },
    house: { wall: [0x5a5262, 0x4a4252, 0x6a6272], roof: [0x2a2234, 0x3a2a4a, 0x1a1a2a] },
  },
];
function themeForFloor(f) { return THEMES[(f - 1) % THEMES.length]; }
function floorSeed(f) { return hashInt(f * 7919 + 1337); }

// 몬스터 원형
const ARCH = {
  boar: { name: '멧돼지', hp: 1.0, atk: 1.0, def: 1.0, speed: 5.0, radius: 0.9, height: 1.25, attacks: ['charge', 'melee'], flags: {}, colors: [0x6b4a32, 0x3a2a1e, 0xe8e0c8], bossTitle: '대지의 엄니' },
  wolf: { name: '늑대', hp: 0.8, atk: 0.9, def: 0.8, speed: 7.0, radius: 0.7, height: 1.1, attacks: ['lunge', 'melee'], flags: {}, colors: [0x6a6a70, 0x3a3a40, 0xffcc44], bossTitle: '달빛 늑대왕' },
  slime: { name: '슬라임', hp: 0.9, atk: 0.8, def: 0.6, speed: 3.4, radius: 0.8, height: 1.0, attacks: ['lunge', 'melee'], flags: { splits: true }, colors: [0x5ad06a, 0x2a8a3a, 0x10301a], bossTitle: '군체 여왕' },
  wasp: { name: '거대 말벌', hp: 0.7, atk: 1.0, def: 0.7, speed: 6.0, radius: 0.65, height: 0.9, attacks: ['dive', 'melee'], flags: { flying: true }, colors: [0xe8b020, 0x2a2010, 0xff4a2a], bossTitle: '독침 여제' },
  kobold: { name: '코볼트', hp: 1.1, atk: 1.0, def: 1.3, speed: 4.6, radius: 0.6, height: 1.55, attacks: ['melee', 'heavy'], flags: { shield: true }, colors: [0x8a6a4a, 0x5a4030, 0xff5a3a], bossTitle: '코볼트 대족장' },
  golem: { name: '골렘', hp: 2.0, atk: 1.4, def: 1.8, speed: 2.8, radius: 1.3, height: 2.8, attacks: ['slam', 'melee'], flags: {}, colors: [0x7a7468, 0x4a463e, 0x6ad0ff], bossTitle: '바위 거신' },
  skeleton: { name: '해골 검사', hp: 0.9, atk: 1.2, def: 0.9, speed: 4.8, radius: 0.55, height: 1.8, attacks: ['combo', 'melee'], flags: {}, colors: [0xe8e2d0, 0x9a948a, 0x7affd8], bossTitle: '망자 검성' },
  lizard: { name: '리자드맨', hp: 1.1, atk: 1.1, def: 1.0, speed: 5.4, radius: 0.6, height: 1.9, attacks: ['lunge', 'melee'], flags: { sidestep: true }, colors: [0x4a8a5a, 0x2a5a3a, 0xffd04a], bossTitle: '비늘 군주' },
  treant: { name: '트렌트', hp: 1.6, atk: 1.1, def: 1.4, speed: 2.4, radius: 1.1, height: 3.0, attacks: ['root', 'melee'], flags: {}, colors: [0x5a4430, 0x3a7a34, 0xc8ff6a], bossTitle: '천년 고목' },
  wraith: { name: '망령', hp: 0.9, atk: 1.25, def: 0.7, speed: 4.4, radius: 0.6, height: 2.0, attacks: ['blink', 'melee'], flags: { floating: true }, colors: [0x2a2a3a, 0x14141e, 0x8ae8ff], bossTitle: '통곡하는 망령' },
  crab: { name: '갑각게', hp: 1.3, atk: 1.0, def: 2.0, speed: 3.8, radius: 1.0, height: 1.0, attacks: ['melee', 'charge'], flags: { armorFront: true }, colors: [0xc04a32, 0x7a2a1e, 0x1a1a1a], bossTitle: '강철 집게' },
  imp: { name: '화염 임프', hp: 0.75, atk: 1.1, def: 0.7, speed: 5.0, radius: 0.5, height: 1.2, attacks: ['ranged'], flags: { flying: true, keepAway: true }, colors: [0xb03a2a, 0x5a1a14, 0xffb02a], bossTitle: '불꽃 마왕' },
};

// 몬스터 공격 정의
const ATTACKS = {
  melee: { range: 2.0, windup: 0.55, recover: 0.6, cd: 1.3, dmg: 1.0, arc: 110 },
  heavy: { range: 2.3, windup: 0.85, recover: 0.8, cd: 2.6, dmg: 1.6, arc: 130 },
  combo: { range: 2.2, windup: 0.45, recover: 0.75, cd: 2.4, dmg: 0.75, arc: 110, hits: 2, gap: 0.3 },
  lunge: { range: 6.5, minRange: 2.4, windup: 0.5, recover: 0.8, cd: 3.0, dmg: 1.1, dash: 12, dashTime: 0.38 },
  charge: { range: 15, minRange: 4, windup: 0.9, recover: 1.4, cd: 5.5, dmg: 1.5, dash: 17, dashTime: 0.85, tele: 'line' },
  slam: { range: 3.2, windup: 1.0, recover: 1.0, cd: 3.6, dmg: 1.7, radius: 3.6, tele: 'circle' },
  dive: { range: 9, minRange: 1.5, windup: 0.6, recover: 0.9, cd: 2.8, dmg: 1.1, dash: 13, dashTime: 0.6 },
  ranged: { range: 18, windup: 0.7, recover: 0.6, cd: 2.4, dmg: 1.0, proj: 14 },
  root: { range: 13, windup: 0.4, recover: 0.6, cd: 4.6, dmg: 1.4, radius: 2.3, delay: 1.1, tele: 'atTarget' },
  blink: { range: 16, minRange: 4.5, windup: 0.35, recover: 0.1, cd: 6.5, dmg: 0 },
  // 보스 전용
  bslam: { range: 5, windup: 1.25, recover: 1.1, cd: 6, dmg: 2.0, radius: 7.5, tele: 'circle' },
  bfan: { range: 30, windup: 0.9, recover: 0.8, cd: 7, dmg: 1.0, proj: 15, count: 7 },
  bwave: { range: 30, windup: 1.0, recover: 1.0, cd: 11, dmg: 1.6, tele: 'circle' },
  bsummon: { range: 40, windup: 1.2, recover: 0.6, cd: 22, dmg: 0 },
  bcharge: { range: 26, minRange: 6, windup: 1.0, recover: 1.6, cd: 8, dmg: 1.8, dash: 22, dashTime: 1.0, tele: 'line' },
};

const WEAPONS = {
  sword: { name: '한손검', atk: 1.0, speed: 1.0, reach: 2.6, arc: 110, crit: 0, len: 0.95, width: 0.075, combo: ['r2l', 'l2r', 'down'] },
  rapier: { name: '세검', atk: 0.84, speed: 1.32, reach: 2.8, arc: 50, crit: 0.08, len: 1.05, width: 0.03, combo: ['thrust', 'thrust', 'r2l'] },
  scimitar: { name: '곡도', atk: 0.93, speed: 1.15, reach: 2.5, arc: 130, crit: 0.03, len: 0.9, width: 0.085, combo: ['r2l', 'l2r', 'up'] },
  greatsword: { name: '양손검', atk: 1.45, speed: 0.72, reach: 3.1, arc: 140, crit: 0, len: 1.4, width: 0.14, combo: ['r2l', 'down', 'l2r'] },
  dagger: { name: '단검', atk: 0.72, speed: 1.6, reach: 2.0, arc: 90, crit: 0.12, len: 0.45, width: 0.055, combo: ['l2r', 'r2l', 'thrust'] },
};
const WEAPON_KEYS = Object.keys(WEAPONS);

const RARITY = [
  { name: '일반', color: '#c9cfd6', hex: 0xc9cfd6, mult: 1.0 },
  { name: '고급', color: '#72d872', hex: 0x72d872, mult: 1.15 },
  { name: '희귀', color: '#57a8ff', hex: 0x57a8ff, mult: 1.32 },
  { name: '영웅', color: '#c682ff', hex: 0xc682ff, mult: 1.55 },
  { name: '전설', color: '#ffb547', hex: 0xffb547, mult: 1.85 },
];

// 검술(소드 스킬). anim: [동작, 길이(초)] / hits: 시각 t(초)에 판정
const SKILLS = {
  rush: { name: '돌진 베기', lv: 1, types: 'all', cd: 6, color: 0x7fd8ff, desc: '앞으로 돌진하며 강하게 벤다.',
    anim: [['thrust', 0.42]], move: { dist: 7, t0: 0.02, t1: 0.24 }, hits: [{ t: 0.22, mult: 2.2, arc: 80, reach: 0.6 }], post: 0.35 },
  arc3: { name: '삼일월', lv: 3, types: ['sword', 'scimitar', 'greatsword'], cd: 8, color: 0x9fffb0, desc: '초승달 모양으로 세 번 베어 넘긴다.',
    anim: [['r2l', 0.26], ['l2r', 0.26], ['r2l', 0.3]], hits: [{ t: 0.15, mult: 1.15, arc: 150 }, { t: 0.41, mult: 1.15, arc: 150 }, { t: 0.69, mult: 1.4, arc: 150 }], post: 0.4 },
  pierce: { name: '관통 찌르기', lv: 4, types: ['rapier', 'dagger', 'sword'], cd: 7, color: 0xffe28a, desc: '일직선으로 길게 꿰뚫는다.',
    anim: [['thrust', 0.4]], move: { dist: 3, t0: 0.1, t1: 0.22 }, hits: [{ t: 0.2, mult: 2.8, line: { len: 5.5, width: 1.2 } }], post: 0.3 },
  whirl: { name: '선풍', lv: 6, types: 'all', cd: 10, color: 0xb2f0ff, desc: '몸을 돌려 주위를 두 번 휩쓴다.',
    anim: [['spin', 0.62]], hits: [{ t: 0.2, mult: 1.45, arc: 360, reach: 1 }, { t: 0.46, mult: 1.45, arc: 360, reach: 1 }], post: 0.45 },
  flurry: { name: '연섬', lv: 9, types: ['rapier', 'dagger', 'scimitar'], cd: 11, color: 0xff9ad5, desc: '눈으로 좇기 힘든 여섯 번의 연속 공격.',
    anim: [['thrust', 0.12], ['r2l', 0.12], ['thrust', 0.12], ['l2r', 0.12], ['thrust', 0.12], ['down', 0.2]],
    hits: [{ t: 0.07, mult: 0.7 }, { t: 0.19, mult: 0.7 }, { t: 0.31, mult: 0.7 }, { t: 0.43, mult: 0.7 }, { t: 0.55, mult: 0.7 }, { t: 0.72, mult: 1.2 }], post: 0.5 },
  meteor: { name: '유성 낙하', lv: 12, types: ['sword', 'greatsword'], cd: 14, color: 0xffb35a, desc: '뛰어올라 내리찍어 주변을 충격파로 덮는다.',
    anim: [['raise', 0.36], ['down', 0.26]], move: { dist: 4, t0: 0.05, t1: 0.36, leap: true }, hits: [{ t: 0.48, mult: 3.2, aoe: 4.5 }], post: 0.6 },
  cross: { name: '십자 베기', lv: 16, types: 'all', cd: 9, color: 0xa8b8ff, desc: '세로와 가로로 십자를 그려 상대를 경직시킨다.',
    anim: [['down', 0.26], ['r2l', 0.26]], hits: [{ t: 0.15, mult: 1.9, stagger: 1.0 }, { t: 0.41, mult: 1.9, stagger: 1.0 }], post: 0.4 },
  sunder: { name: '대지 가르기', lv: 24, types: ['greatsword', 'sword'], cd: 16, color: 0xffd27a, desc: '땅을 내리쳐 앞으로 뻗는 충격파를 날린다.',
    anim: [['raise', 0.34], ['down', 0.3]], hits: [{ t: 0.48, mult: 3.6, line: { len: 12, width: 2.6 } }], post: 0.6 },
  tempest: { name: '폭풍 연무', lv: 34, types: 'all', cd: 24, color: 0x7affe0, desc: '열 번 몰아친 뒤 마지막 일격으로 끝맺는다.',
    anim: [['r2l', 0.11], ['l2r', 0.11], ['r2l', 0.11], ['l2r', 0.11], ['thrust', 0.11], ['r2l', 0.11], ['l2r', 0.11], ['r2l', 0.11], ['l2r', 0.11], ['thrust', 0.11], ['down', 0.3]],
    move: { dist: 4, t0: 0.0, t1: 1.1 },
    hits: [0.06, 0.17, 0.28, 0.39, 0.5, 0.61, 0.72, 0.83, 0.94, 1.05].map((t) => ({ t, mult: 0.72 })).concat([{ t: 1.25, mult: 2.2, arc: 160, reach: 0.8 }]), post: 0.8 },
  shadow: { name: '그림자 일섬', lv: 44, types: ['dagger', 'rapier', 'scimitar'], cd: 18, color: 0xc59bff, desc: '적 사이를 꿰뚫고 지나가며 경로의 모두를 벤다.',
    anim: [['l2r', 0.32]], move: { dist: 9, t0: 0.04, t1: 0.2, pass: true }, hits: [{ t: 0.2, mult: 3.0, path: true }], post: 0.4 },
};
const SKILL_KEYS = Object.keys(SKILLS);
function skillUsable(id, wtype) { const s = SKILLS[id]; return s && (s.types === 'all' || s.types.includes(wtype)); }

// ---------------------------------------------------------------------------
// 밸런스. 숫자를 바꾸면 전체 진행 속도가 바뀐다.
// ---------------------------------------------------------------------------
const BAL = {
  rec: (f) => Math.round(2 + f * 1.6),             // 층별 권장 레벨
  enemyHP: (L) => 30 * (1 + 0.35 * L) * Math.pow(1.045, L) * (1 + 0.006 * L),
  enemyAtk: (L) => 10 * (1 + 0.3 * L) * Math.pow(1.04, L) * (1 + 0.004 * L),
  enemyDef: (L) => 4 * (1 + 0.3 * L) * Math.pow(1.045, L),
  enemyExp: (L) => 10 * (1 + 0.5 * L) * Math.pow(1.05, L),
  enemyCol: (L) => 5 * (1 + 0.4 * L) * Math.pow(1.045, L),
  expNext: (lv) => 50 * (1 + 0.6 * lv) * Math.pow(1.072, lv),
  playerHP: (lv) => 100 * (1 + 0.3 * lv) * Math.pow(1.04, lv),
  weaponAtk: (il) => 12 * (1 + 0.3 * il) * Math.pow(1.045, il),
  armorDef: (il) => 6 * (1 + 0.3 * il) * Math.pow(1.045, il),
  statPerLevel: 2,
  bossHP: 24, bossAtk: 1.5, bossDef: 1.3,
  eliteHP: 9, eliteAtk: 1.5,
  dropGear: 0.06, dropMat: 0.4, dropOre: 0.08,
  rarityWeights: [[0, 600], [1, 260], [2, 110], [3, 25], [4, 5]],
  enhanceRate: [1, 0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2], // +1..+10
};
// 공격력 대비 방어력으로 받는 피해를 줄인다.
function mitigate(atk, def) { return atk * (1.5 * atk) / (1.5 * atk + def); }

const MATERIAL_TIERS = [[1, '녹슨'], [6, '철제'], [14, '강철'], [26, '은빛'], [40, '미스릴'], [58, '흑요석'], [78, '용린'], [100, '성광'], [125, '천공'], [150, '영원']];
const ARMOR_NAMES = ['코트', '흉갑', '갑옷', '망토', '경갑'];
const LEGEND_WEAPON = ['새벽의 맹세', '고요한 별빛', '잿불 송곳니', '은하수 가르개', '폭풍의 노래', '겨울왕의 비탄', '첫 번째 날개', '영원의 서약', '달그림자', '하늘 꿰뚫기', '심연 걷는 자', '황금 갈기'];
const LEGEND_ARMOR = ['별무리 외투', '용의 비늘옷', '새벽의 갑주', '바람결 망토', '성흔의 흉갑', '은하 수호복'];
function tierName(il) { let n = MATERIAL_TIERS[0][1]; for (const [l, s] of MATERIAL_TIERS) if (il >= l) n = s; return n; }

const SYL_TOWN = ['아르', '벨', '토', '린', '카', '세', '온', '미', '라', '우', '델', '하', '스', '엔', '로', '니', '바', '츠', '레', '포', '시', '움', '헤', '나'];
const TOWN_SUFFIX = ['마을', '마을', '시', '요새', '항구', '촌'];
const SYL_BOSS = ['그', '라', '브', '락', '즈', '오', '칼', '베', '로', '스', '타', '쿠', '드', '렉', '모', '르', '가', '네', '자', '굴'];

function makeName(r, syl, min, max) { const n = r.int(min, max); let s = ''; for (let i = 0; i < n; i++) s += r.pick(syl); return s; }

let uidCounter = 1;
function newUid() { return Date.now().toString(36) + (uidCounter++).toString(36) + Math.floor(Math.random() * 1e4).toString(36); }

function makeWeapon(il, r, type, legendName) {
  type = type || WEAPON_KEYS[Math.floor(Math.random() * WEAPON_KEYS.length)];
  const it = { uid: newUid(), kind: 'weapon', type, il: Math.max(1, Math.round(il)), r, plus: 0 };
  it.name = legendName || (r === 4 ? LEGEND_WEAPON[Math.floor(Math.random() * LEGEND_WEAPON.length)] : `${tierName(it.il)} ${WEAPONS[type].name}`);
  if (r >= 3) it.critB = r === 4 ? 0.06 : 0.03;
  return it;
}
function makeArmor(il, r) {
  const it = { uid: newUid(), kind: 'armor', il: Math.max(1, Math.round(il)), r, plus: 0 };
  it.name = r === 4 ? LEGEND_ARMOR[Math.floor(Math.random() * LEGEND_ARMOR.length)] : `${tierName(it.il)} ${ARMOR_NAMES[Math.floor(Math.random() * ARMOR_NAMES.length)]}`;
  if (r >= 3) it.hpB = r === 4 ? 0.1 : 0.05;
  return it;
}
function itemAtk(it) { return Math.round(BAL.weaponAtk(it.il) * WEAPONS[it.type].atk * RARITY[it.r].mult * (1 + 0.07 * it.plus)); }
function itemDef(it) { return Math.round(BAL.armorDef(it.il) * RARITY[it.r].mult * (1 + 0.07 * it.plus)); }
function itemPower(it) { return it.kind === 'weapon' ? itemAtk(it) : itemDef(it); }
function itemPrice(it) { return Math.round(BAL.enemyCol(it.il) * 6 * Math.pow(RARITY[it.r].mult, 3) * (1 + 0.15 * it.plus)); }
function itemLabel(it) { return `${it.name}${it.plus ? ' +' + it.plus : ''}`; }
function rollRarity(bonus = 0) {
  const w = BAL.rarityWeights.map(([r, wt]) => [r, r === 0 ? Math.max(50, wt - bonus * 10) : wt * (1 + bonus * 0.25 * r)]);
  return rng.weighted(w);
}
function potionPrice(lv) { return Math.max(10, Math.round(BAL.enemyCol(lv) * 2.5)); }
function orePrice(lv) { return Math.max(60, Math.round(BAL.enemyCol(lv) * 14)); }

// 층마다 고정된 퀘스트 3개
function floorQuests(f) {
  const r = new RNG(floorSeed(f) ^ 0xabc);
  const T = themeForFloor(f);
  const arch = r.pick(T.enemies);
  return [
    { id: `${f}-k`, type: 'kill', arch, count: r.int(8, 14) + Math.floor(f / 12), title: `${T.prefix} ${ARCH[arch].name} 토벌` },
    { id: `${f}-c`, type: 'collect', mat: T.mat, count: r.int(5, 9) + Math.floor(f / 15), title: `${T.mat} 모으기` },
    { id: `${f}-e`, type: 'elite', count: 1, title: '네임드 몬스터 처치' },
  ];
}

const ACHIEVEMENTS = [
  ['kill1', '첫 사냥', '몬스터 1마리 처치', (s) => s.stats.kills >= 1],
  ['kill100', '사냥꾼', '몬스터 100마리 처치', (s) => s.stats.kills >= 100],
  ['kill1000', '학살자', '몬스터 1,000마리 처치', (s) => s.stats.kills >= 1000],
  ['kill10000', '살아 있는 전설', '몬스터 10,000마리 처치', (s) => s.stats.kills >= 10000],
  ['floor1', '첫 계단', '제 1층 보스 처치', (s) => s.cleared >= 1],
  ['floor10', '열 번째 문', '제 10층 돌파', (s) => s.cleared >= 10],
  ['floor25', '사분의 일', '제 25층 돌파', (s) => s.cleared >= 25],
  ['floor50', '반환점', '제 50층 돌파', (s) => s.cleared >= 50],
  ['floor75', '구름 위의 구름', '제 75층 돌파', (s) => s.cleared >= 75],
  ['floor100', '정상', '제 100층 돌파', (s) => s.cleared >= 100],
  ['lv10', '성장', '레벨 10 달성', (s) => s.level >= 10],
  ['lv50', '숙련 검사', '레벨 50 달성', (s) => s.level >= 50],
  ['lv100', '검성', '레벨 100 달성', (s) => s.level >= 100],
  ['lv150', '하늘에 닿은 자', '레벨 150 달성', (s) => s.level >= 150],
  ['plus10', '장인의 손', '장비 +10 강화 성공', (s) => s.stats.maxPlus >= 10],
  ['legend', '전설과의 만남', '전설 장비 획득', (s) => s.stats.legendaries >= 1],
  ['rare10', '황금 사냥꾼', '황금 몬스터 10마리 처치', (s) => s.stats.rareKills >= 10],
  ['elite20', '네임드 헌터', '네임드 몬스터 20마리 처치', (s) => s.stats.eliteKills >= 20],
  ['rich', '부호', '100만 Col 보유', (s) => s.col >= 1e6],
  ['codex', '도감 수집가', '도감 40종 등록', (s) => Object.keys(s.codex).length >= 40],
  ['mastery', '한 길의 끝', '검술 하나를 숙련도 10까지', (s) => Object.values(s.skills).some((k) => k.lv >= 10)],
];

const NPC_ROLES = [
  { role: 'shop', name: '잡화상', color: 0x4a7ac8 },
  { role: 'smith', name: '대장장이', color: 0xb05a32 },
  { role: 'quest', name: '의뢰 게시판', color: 0x8a6a3a },
  { role: 'inn', name: '여관 주인', color: 0x6a9a5a },
];
