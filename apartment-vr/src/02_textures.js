// ---------------------------------------------------------------------------
// 텍스처: 원목 마루(헤링본·일자), 대리석, 포세린 타일, 패브릭, 페인트, 석회, 루버,
// 러그, 그림, 화분 잎, 바깥 건물 창문을 캔버스로 그린다. 높이 그림에서 노멀맵도 만든다.
// ---------------------------------------------------------------------------
const Tex = {
  cache: new Map(),
  canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
  tex(c, { srgb = true, repeat = null, aniso = 8, rot = 0 } = {}) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    if (rot) { t.rotation = rot; t.center.set(0.5, 0.5); }
    return t;
  },
  memo(key, fn) { if (!this.cache.has(key)) this.cache.set(key, fn()); return this.cache.get(key); },

  // ---------------- 값 노이즈 (반복되는 격자, period 칸마다 이어진다)
  noiseGen(seed, period = 256) {
    const r = mulberry32(seed), P = new Float32Array(period * period);
    for (let i = 0; i < P.length; i++) P[i] = r();
    const at = (x, y) => P[((y % period + period) % period) * period + ((x % period + period) % period)];
    const n = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return lerp(lerp(at(xi, yi), at(xi + 1, yi), u), lerp(at(xi, yi + 1), at(xi + 1, yi + 1), u), v); };
    n.fbm = (x, y, o = 4) => { let s = 0, a = 0.5, f = 1, t = 0; for (let i = 0; i < o; i++) { s += a * n(x * f, y * f); t += a; a *= 0.5; f *= 2; } return s / t; };
    return n;
  },
  // 높이(0~1, Float32Array) → 노멀맵 캔버스
  normalMap(h, w, hh, strength = 2) {
    const c = this.canvas(w, hh), g = c.getContext('2d'), img = g.createImageData(w, hh), d = img.data;
    const H = (x, y) => h[((y + hh) % hh) * w + ((x + w) % w)];
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  },
  hex(c) { const v = new THREE.Color(c); return [v.r * 255, v.g * 255, v.b * 255]; },

  // ---------------- 원목 마루
  // pattern: 'herring'(헤링본, 길이 = 폭 x n) 또는 'plank'(일자). 한 장 = size m
  wood(o) {
    return this.memo('wood:' + JSON.stringify(o), () => {
      const S = 1024, img = new ImageData(S, S), d = img.data, h = new Float32Array(S * S);
      const N = this.noiseGen(o.seed || 3), base = this.hex(o.base), dark = this.hex(o.dark), light = this.hex(o.light);
      const n = o.n || 4, tile = 2 * n; // 헤링본 반복 = 2n x 2n 칸 (칸 = 판 폭)
      const rows = o.rows || 8, len = o.len || 3; // 일자: 한 장에 판 rows줄, 판 길이 = 장의 1/len
      const tones = new Map(), offs = new Map();
      const toneOf = (id) => { let t = tones.get(id); if (!t) { const r = mulberry32(id * 2654435761 >>> 0); t = [r() - 0.5, r()]; tones.set(id, t); } return t; };
      const offOf = (row) => { let t = offs.get(row); if (t === undefined) { t = mulberry32(row * 977 + 13)() * len; offs.set(row, t); } return t; };
      for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
        let u, v, id;
        if (o.pattern === 'herring') {
          const x = px / S * tile, y = py / S * tile, k = Math.floor(y), dx = ((x - k) % tile + tile) % tile;
          if (dx < n) { u = dx / n; v = y - k; id = k * 31 + Math.floor((x - k) / tile + 10) * 7; }
          else { const j0 = Math.floor(x) - n, dy = ((y - (j0 + 1 - n)) % tile + tile) % tile; u = dy / n; v = x - Math.floor(x); id = 1000 + j0 * 17 + Math.floor((y - j0) / tile + 10) * 5; }
        } else {
          const y = py / S * rows, row = Math.floor(y), off = offOf(row);
          const x = px / S * len + off, col = Math.floor(x);
          u = x - col; v = y - row; id = row * 131 + ((col % len) + len) % len * 17;
        }
        const [tone, tone2] = toneOf(id);
        const gx = o.pattern === 'herring' ? u * 3 : u * 5, gy = v * 1.6 + id * 0.37;
        const grain = N.fbm(gx * 2 + tone2 * 50, gy * 14, 4);
        const fleck = N(gx * 40 + id, gy * 90);
        let t = clamp(0.5 + tone * 0.32 + (grain - 0.5) * 0.75, 0, 1);
        const c = t < 0.5 ? [lerp(dark[0], base[0], t * 2), lerp(dark[1], base[1], t * 2), lerp(dark[2], base[2], t * 2)] : [lerp(base[0], light[0], t * 2 - 1), lerp(base[1], light[1], t * 2 - 1), lerp(base[2], light[2], t * 2 - 1)];
        const knot = fleck > 0.93 ? 0.85 : 1;
        // 판 사이 틈
        const ex = Math.min(u, 1 - u) * (o.pattern === 'herring' ? n : 1 / len * 8), ey = Math.min(v, 1 - v);
        const gap = Math.min(ex, ey) < 0.035 ? 0.55 : 1;
        const i = (py * S + px) * 4;
        d[i] = c[0] * knot * gap; d[i + 1] = c[1] * knot * gap; d[i + 2] = c[2] * knot * gap; d[i + 3] = 255;
        h[py * S + px] = (gap < 1 ? 0.2 : 1) - grain * 0.08;
      }
      const c = this.canvas(S); c.getContext('2d').putImageData(img, 0, 0);
      return { map: c, normal: this.normalMap(h, S, S, 3) };
    });
  },

  // ---------------- 대리석 (base 바탕, vein 굵은 결, vein2 가는 결)
  marble(o) {
    return this.memo('marble:' + JSON.stringify(o), () => {
      const S = 512, img = new ImageData(S, S), d = img.data, N = this.noiseGen(o.seed || 11, 64);
      const b = this.hex(o.base), v1 = this.hex(o.vein), v2 = this.hex(o.vein2 || o.vein);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S * 64, w = y / S * 64; // 64 주기라 이어진다
        const warp = N.fbm(u * 0.06, w * 0.06, 5) * 9;
        const a = Math.abs(Math.sin((u * 0.09 + w * 0.05) * 3.2 + warp));
        const thin = Math.abs(Math.sin((u * 0.05 - w * 0.11) * 5 + N.fbm(u * 0.12 + 20, w * 0.12, 4) * 12));
        const cloud = N.fbm(u * 0.25, w * 0.25, 3);
        const k1 = Math.pow(1 - a, 14) * (o.strength || 0.85), k2 = Math.pow(1 - thin, 40) * 0.55;
        const i = (y * S + x) * 4;
        for (let ch = 0; ch < 3; ch++) {
          let c = b[ch] * (0.94 + cloud * 0.1);
          c = lerp(c, v1[ch], k1); c = lerp(c, v2[ch], k2);
          d[i + ch] = c;
        }
        d[i + 3] = 255;
      }
      const c = this.canvas(S); c.getContext('2d').putImageData(img, 0, 0);
      return c;
    });
  },

  // ---------------- 포세린 타일 (tw x th m, 장 = 1.2m), 결이 옅은 대리석 무늬 + 줄눈
  tiles(o) {
    return this.memo('tiles:' + JSON.stringify(o), () => {
      const m = this.marble({ base: o.base, vein: o.vein, vein2: o.vein, seed: o.seed || 5, strength: o.strength || 0.35 });
      const S = 1024, c = this.canvas(S), g = c.getContext('2d');
      g.drawImage(m, 0, 0, S, S);
      const cols = Math.round(1.2 / o.tw), rows = Math.round(1.2 / o.th), h = new Float32Array(S * S).fill(1);
      g.fillStyle = o.grout;
      const gw = Math.max(2, S * 0.003 / 1.2);
      for (let i = 0; i <= cols; i++) { const x = i * S / cols; g.fillRect(x - gw / 2, 0, gw, S); for (let y = 0; y < S; y++) for (let k = -gw; k < gw; k++) { const xx = Math.round(x + k); if (xx >= 0 && xx < S) h[y * S + xx] = 0.3; } }
      for (let j = 0; j <= rows; j++) { const y = j * S / rows; g.fillRect(0, y - gw / 2, S, gw); for (let x = 0; x < S; x++) for (let k = -gw; k < gw; k++) { const yy = Math.round(y + k); if (yy >= 0 && yy < S) h[yy * S + x] = 0.3; } }
      return { map: c, normal: this.normalMap(h, S, S, 2) };
    });
  },

  // ---------------- 무채색 세부 무늬 (재질 색으로 물든다)
  fabric(kind = 'weave') {
    return this.memo('fabric:' + kind, () => {
      const S = 256, img = new ImageData(S, S), d = img.data, h = new Float32Array(S * S), N = this.noiseGen(kind.length * 7 + 1, 32);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        let v;
        if (kind === 'boucle') v = 0.78 + N.fbm(x / 6, y / 6, 3) * 0.3 + (N(x / 1.6, y / 1.6) - 0.5) * 0.18;
        else if (kind === 'leather') v = 0.86 + (N.fbm(x / 10, y / 10, 4) - 0.5) * 0.18 + (N(x / 2, y / 2) - 0.5) * 0.05;
        else if (kind === 'velvet') v = 0.8 + N.fbm(x / 30, y / 30, 3) * 0.25;
        else if (kind === 'jute') { const a = Math.sin(x / 2.2) * Math.sin(y / 2.2); v = 0.72 + a * 0.18 + (N(x / 3, y / 3) - 0.5) * 0.2; }
        else { const wx = Math.sin(x * Math.PI / 2) * 0.5 + 0.5, wy = Math.sin(y * Math.PI / 2) * 0.5 + 0.5; v = 0.82 + ((x >> 1) + (y >> 1)) % 2 * 0.06 * (wx + wy) + (N(x / 3, y / 3) - 0.5) * 0.12; }
        const i = (y * S + x) * 4, c = clamp(v, 0, 1) * 255;
        d[i] = d[i + 1] = d[i + 2] = c; d[i + 3] = 255; h[y * S + x] = v;
      }
      const c = this.canvas(S); c.getContext('2d').putImageData(img, 0, 0);
      return { map: c, normal: this.normalMap(h, S, S, kind === 'velvet' ? 0.8 : 2.5) };
    });
  },
  // 페인트(아주 옅은 얼룩), 석회 마감(구름 같은 얼룩)
  wallpaint(kind = 'paint') {
    return this.memo('paint:' + kind, () => {
      const S = 512, img = new ImageData(S, S), d = img.data, N = this.noiseGen(kind === 'lime' ? 21 : 9, 64);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const v = kind === 'lime' ? 0.86 + N.fbm(x / 40, y / 40, 5) * 0.2 + (N(x / 3, y / 3) - 0.5) * 0.03 : 0.96 + (N.fbm(x / 20, y / 20, 3) - 0.5) * 0.04 + (N(x / 1.5, y / 1.5) - 0.5) * 0.02;
        const i = (y * S + x) * 4, c = clamp(v, 0, 1) * 255; d[i] = d[i + 1] = d[i + 2] = c; d[i + 3] = 255;
      }
      const c = this.canvas(S); c.getContext('2d').putImageData(img, 0, 0);
      return c;
    });
  },
  // 원목 루버(세로 살) : 한 장 = 0.6m 폭에 살 12개
  slats(o) {
    return this.memo('slats:' + JSON.stringify(o), () => {
      const W = 512, Hh = 512, img = new ImageData(W, Hh), d = img.data, h = new Float32Array(W * Hh), N = this.noiseGen(31, 64);
      const b = this.hex(o.base), dk = this.hex(o.dark);
      for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
        const s = x / W * 12, f = s - Math.floor(s), id = Math.floor(s);
        const groove = f > 0.72;
        const grain = N.fbm(x / 8 + id * 9, y / 70, 4), t = clamp(0.5 + (grain - 0.5) * 1.2 + (mulberry32(id + 5)() - 0.5) * 0.25, 0, 1);
        const i = (y * W + x) * 4;
        for (let ch = 0; ch < 3; ch++) d[i + ch] = groove ? dk[ch] * 0.35 : lerp(dk[ch], b[ch], t);
        d[i + 3] = 255; h[y * W + x] = groove ? 0 : 1 - Math.pow(Math.abs(f / 0.72 - 0.5) * 2, 6) * 0.3;
      }
      const c = this.canvas(W, Hh); c.getContext('2d').putImageData(img, 0, 0);
      return { map: c, normal: this.normalMap(h, W, Hh, 4) };
    });
  },
  // 가구용 원목 무늬 (세로 결)
  veneer(o) {
    return this.memo('veneer:' + JSON.stringify(o), () => {
      const S = 512, img = new ImageData(S, S), d = img.data, N = this.noiseGen(41, 64), b = this.hex(o.base), dk = this.hex(o.dark), lt = this.hex(o.light || o.base);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        // 곧게 뻗은 결: 가로로 촘촘하고 세로로 길게, 약하게만 휘게
        const g = N.fbm(x / 5 + N.fbm(x / 90, y / 160, 2) * 2.2, y / 220, 4), fine = N(x / 1.3, y / 30);
        const t = clamp(0.5 + (g - 0.5) * 0.85 + (fine - 0.5) * 0.12, 0, 1);
        const i = (y * S + x) * 4;
        for (let ch = 0; ch < 3; ch++) d[i + ch] = t < 0.5 ? lerp(dk[ch], b[ch], t * 2) : lerp(b[ch], lt[ch], t * 2 - 1);
        d[i + 3] = 255;
      }
      const c = this.canvas(S); c.getContext('2d').putImageData(img, 0, 0);
      return c;
    });
  },
  // 러그
  rug(kind, a, b, c3) {
    return this.memo(`rug:${kind}:${a}:${b}:${c3}`, () => {
      const W = 1024, Hh = 768, c = this.canvas(W, Hh), g = c.getContext('2d');
      g.fillStyle = a; g.fillRect(0, 0, W, Hh);
      if (kind === 'lines') {
        g.strokeStyle = b; g.lineWidth = 10; g.globalAlpha = 0.65;
        for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(W * 0.2 + i * 90, Hh * 0.8, 260 + i * 30, 200 + i * 26, -0.4, 0, TAU); g.stroke(); }
        g.globalAlpha = 1; g.strokeStyle = c3; g.lineWidth = 18; g.strokeRect(36, 36, W - 72, Hh - 72);
      } else if (kind === 'diamond') {
        g.strokeStyle = b; g.lineWidth = 6;
        for (let x = -Hh; x < W + Hh; x += 96) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + Hh, Hh); g.stroke(); g.beginPath(); g.moveTo(x, Hh); g.lineTo(x + Hh, 0); g.stroke(); }
        g.strokeStyle = c3; g.lineWidth = 26; g.strokeRect(20, 20, W - 40, Hh - 40);
      } else if (kind === 'border') {
        g.strokeStyle = b; g.lineWidth = 8; g.strokeRect(60, 60, W - 120, Hh - 120); g.strokeRect(84, 84, W - 168, Hh - 168);
        g.fillStyle = c3; for (let i = 0; i < 4; i++) { g.save(); g.translate(W / 2, Hh / 2); g.rotate(i * Math.PI / 2 + 0.785); g.fillRect(-12, -150, 24, 300); g.restore(); }
      } else {
        const N = this.noiseGen(55, 32);
        const img = g.getImageData(0, 0, W, Hh), d = img.data;
        for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { const v = 0.85 + Math.sin(x / 3) * Math.sin(y / 3) * 0.08 + (N(x / 4, y / 4) - 0.5) * 0.12; const i = (y * W + x) * 4; d[i] *= v; d[i + 1] *= v; d[i + 2] *= v; }
        g.putImageData(img, 0, 0);
        g.strokeStyle = b; g.lineWidth = 22; g.strokeRect(30, 30, W - 60, Hh - 60);
      }
      // 실 느낌의 잡음
      const img = g.getImageData(0, 0, W, Hh), d = img.data, r = mulberry32(7);
      for (let i = 0; i < d.length; i += 4) { const v = 0.92 + r() * 0.12; d[i] *= v; d[i + 1] *= v; d[i + 2] *= v; }
      g.putImageData(img, 0, 0);
      return c;
    });
  },
  // 추상화 (팔레트, 구도 번호)
  art(seed, pal) {
    return this.memo(`art:${seed}:${pal.join()}`, () => {
      const W = 600, Hh = 800, c = this.canvas(W, Hh), g = c.getContext('2d'), r = mulberry32(seed);
      g.fillStyle = pal[0]; g.fillRect(0, 0, W, Hh);
      const kind = seed % 3;
      if (kind === 0) {
        g.fillStyle = pal[1]; g.beginPath(); g.arc(W * 0.55, Hh * 0.42, W * 0.3, 0, TAU); g.fill();
        g.fillStyle = pal[2]; g.fillRect(0, Hh * 0.62, W, Hh * 0.38);
        g.fillStyle = pal[3]; g.beginPath(); g.arc(W * 0.3, Hh * 0.62, W * 0.18, Math.PI, 0); g.fill();
      } else if (kind === 1) {
        for (let i = 0; i < 5; i++) { g.fillStyle = pal[1 + (i % 3)]; g.globalAlpha = 0.85; g.beginPath(); g.ellipse(W * (0.2 + r() * 0.6), Hh * (0.15 + i * 0.17), W * (0.25 + r() * 0.2), Hh * 0.07, (r() - 0.5) * 0.6, 0, TAU); g.fill(); }
        g.globalAlpha = 1;
      } else {
        g.strokeStyle = pal[1]; g.lineWidth = 14; g.lineCap = 'round';
        for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(W * 0.15, Hh * (0.2 + i * 0.18)); g.bezierCurveTo(W * 0.4, Hh * (0.1 + i * 0.2), W * 0.6, Hh * (0.35 + i * 0.15), W * 0.85, Hh * (0.25 + i * 0.18)); g.stroke(); }
        g.fillStyle = pal[2]; g.fillRect(W * 0.62, Hh * 0.08, W * 0.22, W * 0.22);
        g.fillStyle = pal[3]; g.beginPath(); g.arc(W * 0.3, Hh * 0.82, W * 0.1, 0, TAU); g.fill();
      }
      // 캔버스 결
      const img = g.getImageData(0, 0, W, Hh), d = img.data;
      for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { const v = 0.95 + ((x + y) % 4 < 2 ? 0.03 : 0) + r() * 0.03; const i = (y * W + x) * 4; d[i] *= v; d[i + 1] *= v; d[i + 2] *= v; }
      g.putImageData(img, 0, 0);
      return c;
    });
  },
  // 화분 잎 (알파)
  leaf(kind = 'broad') {
    return this.memo('leaf:' + kind, () => {
      const S = 256, c = this.canvas(S), g = c.getContext('2d');
      g.translate(S / 2, S);
      const grd = g.createLinearGradient(0, 0, 0, -S); grd.addColorStop(0, '#2f5a2a'); grd.addColorStop(1, '#4f8a3c');
      g.fillStyle = grd;
      if (kind === 'monstera') {
        g.beginPath(); g.moveTo(0, -10); g.bezierCurveTo(-120, -40, -118, -200, 0, -246); g.bezierCurveTo(118, -200, 120, -40, 0, -10); g.fill();
        g.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 5; i++) for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * (50 + i * 4), -60 - i * 36, 32, 7, s * 0.5, 0, TAU); g.fill(); }
        g.globalCompositeOperation = 'source-over';
      } else { g.beginPath(); g.moveTo(0, -4); g.bezierCurveTo(-60, -60, -46, -200, 0, -250); g.bezierCurveTo(46, -200, 60, -60, 0, -4); g.fill(); }
      g.strokeStyle = 'rgba(200,230,170,0.5)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -6); g.lineTo(0, -236); g.stroke();
      return c;
    });
  },
  // 바깥 아파트 외벽 (map) + 밤 창문 불빛(emissive)
  facade() {
    return this.memo('facade', () => {
      const W = 256, Hh = 512, c = this.canvas(W, Hh), e = this.canvas(W, Hh), g = c.getContext('2d'), ge = e.getContext('2d'), r = mulberry32(77);
      g.fillStyle = '#d9d6cf'; g.fillRect(0, 0, W, Hh); ge.fillStyle = '#000'; ge.fillRect(0, 0, W, Hh);
      const cols = 8, rows = 24, cw = W / cols, rh = Hh / rows;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const px = x * cw + 3, py = y * rh + 4, w = cw - 6, h = rh - 7;
        g.fillStyle = '#5d6b78'; g.fillRect(px, py, w, h);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(px, py, w, 2);
        g.fillStyle = '#c9c5bd'; g.fillRect(px, py + h - 3, w, 3);
        if (r() < 0.42) { const warm = r() < 0.7; ge.fillStyle = warm ? `rgba(255,${190 + r() * 40},${120 + r() * 50},1)` : 'rgba(200,225,255,1)'; ge.fillRect(px, py, w, h - 3); }
      }
      return { map: c, emissive: e };
    });
  },
};
