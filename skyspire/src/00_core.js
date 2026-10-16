import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ---------------------------------------------------------------------------
// 공용 유틸리티
// ---------------------------------------------------------------------------
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
const smoothstep = (a, b, v) => { const t = invLerp(a, b, v); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const $ = (id) => document.getElementById(id);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashInt(n) {
  n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16;
  return n >>> 0;
}
class RNG {
  constructor(seed) { this.f = mulberry32(seed >>> 0); }
  next() { return this.f(); }
  range(a, b) { return a + (b - a) * this.f(); }
  int(a, b) { return Math.floor(a + (b - a + 1) * this.f()); }
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
  chance(p) { return this.f() < p; }
  weighted(entries) { // [[value, weight], ...]
    let total = 0; for (const e of entries) total += e[1];
    let r = this.f() * total;
    for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
    return entries[entries.length - 1][0];
  }
}
const rng = new RNG((Date.now() ^ (Math.random() * 1e9)) >>> 0);

function makeNoise2D(seed) {
  const r = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = []; for (let i = 0; i < 256; i++) p.push(i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y) => {
    switch (h & 7) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
      case 4: return x; case 5: return -x; case 6: return y; default: return -y;
    }
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    let X = Math.floor(x), Y = Math.floor(y);
    x -= X; y -= Y; X &= 255; Y &= 255;
    const u = fade(x), v = fade(y);
    const a = perm[X] + Y, b = perm[X + 1] + Y;
    return lerp(lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u),
      lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u), v) * 0.9;
  };
}
function fbm(n, x, y, oct = 4, lac = 2, gain = 0.5) {
  let s = 0, a = 1, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); norm += a; a *= gain; f *= lac; }
  return s / norm;
}
function ridged(n, x, y, oct = 3) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(n(x * f, y * f)); s += v * v * a; a *= 0.5; f *= 2.1; }
  return s;
}

// 저장소 접근은 언제든 실패할 수 있다(사생활 보호 모드, 미리보기 등).
const Store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } },
};
const SAVE_KEY = 'skyspire.save.v1';
const SETTINGS_KEY = 'skyspire.settings.v1';

// ---------------------------------------------------------------------------
// 전역 게임 상태
// ---------------------------------------------------------------------------
const G = {
  state: 'loading', // loading | title | play | menu | dead
  time: 0,
  dt: 0,
  hitStop: 0,
  save: null,       // 영구 저장되는 캐릭터 데이터
  floor: null,      // 현재 층의 런타임 데이터 (World.buildFloor 결과)
  area: 'town',     // town | field | dungeon | boss
  inDungeon: false,
  xr: false,
  touch: false,
  pointerLocked: false,
  settings: {
    volume: 0.8, music: 0.5, sens: 1.0, invertY: false, quality: 'auto', fps: false, ceiling: true,
  },
};

const Input = {
  keys: new Set(),
  pressed: new Set(),   // 이번 프레임에 눌린 키
  mouseDX: 0, mouseDY: 0,
  mouseL: false, mouseR: false, clickL: false,
  joy: { x: 0, y: 0 },  // 터치 조이스틱
  lookDX: 0, lookDY: 0, // 터치 시점 이동
  touchGuard: false,
  down(code) { return this.keys.has(code); },
  hit(code) { return this.pressed.has(code); },
  endFrame() { this.pressed.clear(); this.mouseDX = this.mouseDY = 0; this.lookDX = this.lookDY = 0; this.clickL = false; },
};

function loadSettings() {
  const raw = Store.get(SETTINGS_KEY);
  if (raw) { try { Object.assign(G.settings, JSON.parse(raw)); } catch (e) { /* 무시 */ } }
}
function saveSettings() { Store.set(SETTINGS_KEY, JSON.stringify(G.settings)); }
