// ---------------------------------------------------------------------------
// 공통: three.js 불러오기, 작은 도구 함수, 전역 상태, 입력
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2, DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const fmtM = (m) => `${m.toFixed(2)} m`;
const pyeong = (m2) => m2 / 3.3058;

// 전역 상태
const G = {
  state: 'loading', // loading | title | walk | doll | tour | menu
  time: 0, xr: false, touch: false, pointerLocked: false,
  style: 'warm', tod: 'day',
  mode: null, // null | 'measure' | 'edit'
  sound: true, volume: 0.6,
  quality: 'high',
};
const SETTINGS_KEY = 'apt84-settings-v1';
function loadSettings() {
  try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); if (s.style) G.style = s.style; if (s.tod) G.tod = s.tod; if (typeof s.sound === 'boolean') G.sound = s.sound; if (typeof s.volume === 'number') G.volume = s.volume; } catch (e) { /* 저장소를 못 쓰면 기본값 */ }
}
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ style: G.style, tod: G.tod, sound: G.sound, volume: G.volume })); } catch (e) { /* 무시 */ } }

// 입력
const Input = {
  keys: new Set(), pressed: new Set(), mouseDX: 0, mouseDY: 0, wheel: 0,
  joy: { x: 0, y: 0 }, lookDX: 0, lookDY: 0,
  endFrame() { this.pressed.clear(); this.mouseDX = this.mouseDY = this.wheel = 0; this.lookDX = this.lookDY = 0; },
  down(c) { return this.keys.has(c); },
  hit(c) { return this.pressed.has(c); },
};

// 순서대로 실행되는 짧은 애니메이션 (문, 커튼 등)
const Tweens = {
  list: [],
  add(dur, fn, done) { const t = { t: 0, dur, fn, done }; this.list.push(t); return t; },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i]; tw.t += dt;
      const k = clamp(tw.t / tw.dur, 0, 1);
      tw.fn(k);
      if (k >= 1) { this.list.splice(i, 1); if (tw.done) tw.done(); }
    }
  },
};
