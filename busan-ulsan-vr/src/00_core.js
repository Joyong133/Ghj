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
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function fmtDist(m) { return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`; }

// ---------------------------------------------------------------------------
// 지리 좌표 ↔ 월드 좌표 (1 단위 = 1 m, +x 동쪽, -z 북쪽, +y 위)
// 메르카토르를 기준 위도의 축척(cos φ0)으로 줄여 지역 안에서 실제 거리와 맞춘다.
// ---------------------------------------------------------------------------
const GEO = {
  R: 6378137, lat0: 35.3, lon0: 129.15,
  init() {
    this.k = Math.cos(this.lat0 * DEG);
    this.mx0 = this.mx(this.lon0); this.my0 = this.my(this.lat0);
  },
  mx(lon) { return lon * DEG * this.R; },
  my(lat) { return Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2)) * this.R; },
  x(lon) { return (this.mx(lon) - this.mx0) * this.k; },
  z(lat) { return -(this.my(lat) - this.my0) * this.k; },
  toWorld(lat, lon) { return { x: this.x(lon), z: this.z(lat) }; },
  lon(x) { return (x / this.k + this.mx0) / this.R / DEG; },
  lat(z) { return (2 * Math.atan(Math.exp((-z / this.k + this.my0) / this.R)) - Math.PI / 2) / DEG; },
  // 슬리피 타일
  tileX(lon, z) { return Math.floor(((lon + 180) / 360) * (1 << z)); },
  tileY(lat, z) { const r = lat * DEG; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * (1 << z)); },
  tileLon(x, z) { return (x / (1 << z)) * 360 - 180; },
  tileLat(y, z) { const n = Math.PI - (2 * Math.PI * y) / (1 << z); return Math.atan(Math.sinh(n)) / DEG; },
  tileBounds(z, x, y) {
    const w = this.tileLon(x, z), e = this.tileLon(x + 1, z), n = this.tileLat(y, z), s = this.tileLat(y + 1, z);
    return { w, e, n, s, x0: this.x(w), x1: this.x(e), z0: this.z(n), z1: this.z(s) };
  },
  tileOfWorld(x, z, zoom) { return [this.tileX(this.lon(x), zoom), this.tileY(this.lat(z), zoom)]; },
};
GEO.init();

// ---------------------------------------------------------------------------
// IndexedDB 캐시 (실패하면 조용히 캐시 없이 동작)
// ---------------------------------------------------------------------------
const Cache = {
  db: null, maxAge: 1000 * 60 * 60 * 24 * 30,
  async open() {
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open('busan-ulsan-vr', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        setTimeout(() => rej(new Error('timeout')), 3000);
      });
    } catch (e) { this.db = null; }
  },
  get(k) {
    if (!this.db) return Promise.resolve(null);
    return new Promise((res) => {
      try {
        const q = this.db.transaction('kv', 'readonly').objectStore('kv').get(k);
        q.onsuccess = () => { const v = q.result; res(v && Date.now() - v.t < this.maxAge ? v.d : null); };
        q.onerror = () => res(null);
      } catch (e) { res(null); }
    });
  },
  set(k, d) {
    if (!this.db) return;
    try { this.db.transaction('kv', 'readwrite').objectStore('kv').put({ t: Date.now(), d }, k); } catch (e) { /* 용량 초과 등 */ }
  },
};
const Store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } },
};

// ---------------------------------------------------------------------------
// 전역 상태와 입력
// ---------------------------------------------------------------------------
const G = {
  state: 'loading', // loading | title | play | menu | map
  time: 0, xr: false, touch: false, pointerLocked: false,
  settings: { quality: 'auto', hour: 'auto', sens: 1, invertY: false, labels: true, volume: 0.7, traffic: true },
};
const SETTINGS_KEY = 'busan-ulsan-vr.settings';
const POS_KEY = 'busan-ulsan-vr.pos';
function loadSettings() { const r = Store.get(SETTINGS_KEY); if (r) { try { Object.assign(G.settings, JSON.parse(r)); } catch (e) { /* 무시 */ } } }
function saveSettings() { Store.set(SETTINGS_KEY, JSON.stringify(G.settings)); }

const Input = {
  keys: new Set(), pressed: new Set(), mouseDX: 0, mouseDY: 0, wheel: 0,
  joy: { x: 0, y: 0 }, lookDX: 0, lookDY: 0, touchUp: false, touchDown: false, touchRun: false,
  down(c) { return this.keys.has(c); },
  hit(c) { return this.pressed.has(c); },
  endFrame() { this.pressed.clear(); this.mouseDX = this.mouseDY = this.lookDX = this.lookDY = this.wheel = 0; },
};
