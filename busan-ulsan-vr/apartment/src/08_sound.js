// ---------------------------------------------------------------------------
// 소리: 모두 Web Audio로 합성한다 (파일 없음). 첫 클릭 뒤에 켜진다.
// 실내 공기음, 발소리, 스위치·문·커튼, 물, 에어컨, 로봇청소기, 잔잔한 음악
// ---------------------------------------------------------------------------
const Sound = {
  ctx: null, master: null, music: false, loops: new Map(), noiseBuf: null,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      this.ctx = new C();
      this.master = this.ctx.createGain(); this.master.gain.value = G.sound ? G.volume : 0; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2, b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0);
      let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.6 + last * 3; }
      this.noiseBuf = b;
      // 실내 공기음 + 먼 도시 소리 (아주 작게)
      this.loop('room', { type: 'noise', freq: 220, q: 0.4, gain: 0.035, filter: 'lowpass' });
    } catch (e) { this.ctx = null; }
  },
  setVolume() { if (this.master) this.master.gain.setTargetAtTime(G.sound ? G.volume : 0, this.ctx.currentTime, 0.05); },
  now() { return this.ctx ? this.ctx.currentTime : 0; },

  // 짧은 잡음 터짐 (필터 종류·주파수·길이)
  burst(freq, dur, gain = 0.3, type = 'bandpass', q = 1, sweepTo) {
    if (!this.ctx) return;
    const t = this.now(), src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.02, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master); src.start(t, Math.random()); src.stop(t + dur + 0.05);
  },
  tone(freq, dur, gain = 0.2, type = 'sine', when = 0, dest = this.master, attack = 0.005) {
    if (!this.ctx) return;
    const t = this.now() + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  },
  click() { this.burst(3200, 0.03, 0.25, 'highpass', 0.7); this.tone(1800, 0.03, 0.05, 'square'); },
  shutter() { this.burst(2400, 0.05, 0.35, 'bandpass', 1.5); setTimeout(() => this.burst(1800, 0.07, 0.3, 'bandpass', 1.2), 70); },
  door(kind, open) {
    if (kind === 'glass2' || kind === 'slide') { this.burst(open ? 500 : 900, 0.6, 0.12, 'bandpass', 0.8, open ? 1400 : 400); if (!open) setTimeout(() => this.burst(160, 0.12, 0.3, 'lowpass'), 560); return; }
    if (kind === 'fridge') { if (open) this.burst(300, 0.15, 0.2, 'lowpass'); else this.burst(120, 0.18, 0.35, 'lowpass'); return; }
    this.burst(2600, 0.05, 0.12, 'bandpass', 3); // 손잡이 걸쇠
    if (open) this.burst(700, 0.35, 0.05, 'bandpass', 6, 520); else setTimeout(() => this.burst(140, 0.16, 0.45, 'lowpass', 0.8), 600);
  },
  swoosh() { this.burst(900, 1.2, 0.09, 'bandpass', 0.6, 2400); },
  step(surface) { if (!this.ctx) return; const tile = surface === 'tile' || surface === 'stone'; this.burst(tile ? 1800 : 380, tile ? 0.06 : 0.09, tile ? 0.06 : 0.11, tile ? 'bandpass' : 'lowpass', tile ? 2 : 0.7); },

  // 계속 나는 소리: 같은 이름이면 한 번만
  loop(name, o) {
    if (!this.ctx || this.loops.has(name)) return;
    const t = this.now(), out = this.ctx.createGain(); out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(o.gain, t + (o.fade || 0.5));
    let nodes = [];
    if (o.type === 'noise') {
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = o.filter || 'bandpass'; f.frequency.value = o.freq; f.Q.value = o.q || 1;
      src.connect(f).connect(out); src.start(); nodes = [src];
      if (o.wobble) { const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain(); lfo.frequency.value = o.wobble; lg.gain.value = o.freq * 0.25; lfo.connect(lg).connect(f.frequency); lfo.start(); nodes.push(lfo); }
    } else {
      for (const fr of o.freqs) { const osc = this.ctx.createOscillator(); osc.type = o.wave || 'sine'; osc.frequency.value = fr; osc.connect(out); osc.start(); nodes.push(osc); }
    }
    out.connect(this.master);
    this.loops.set(name, { out, nodes });
  },
  stopLoop(name, fade = 0.4) {
    const l = this.loops.get(name); if (!l) return;
    this.loops.delete(name);
    const t = this.now(); l.out.gain.cancelScheduledValues(t); l.out.gain.setValueAtTime(l.out.gain.value, t); l.out.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => { for (const n of l.nodes) try { n.stop(); } catch (e) { /* 이미 멈춤 */ } }, fade * 1000 + 100);
  },
  water(dir, key) { if (dir > 0) this.loop('water:' + key, { type: 'noise', freq: key === 'shower' ? 2600 : key === 'tub' ? 900 : 1800, q: 0.5, gain: key === 'shower' ? 0.16 : 0.12, wobble: 3.5 }); else this.stopLoop('water:' + key); },
  ac(on) { if (on) { this.loop('ac', { type: 'noise', freq: 500, q: 0.3, gain: 0.07, filter: 'lowpass', fade: 1.5 }); this.loop('ac2', { freqs: [98, 196.5], wave: 'sine', gain: 0.012, fade: 1.5 }); } else { this.stopLoop('ac', 1.2); this.stopLoop('ac2', 1.2); } },
  robot(on) { if (on) { this.loop('robot', { type: 'noise', freq: 3400, q: 3, gain: 0.03, wobble: 0.7 }); this.loop('robot2', { freqs: [612], wave: 'triangle', gain: 0.006 }); } else { this.stopLoop('robot'); this.stopLoop('robot2'); } },

  // ---------------- 음악: Fmaj7 – Em7 – Dm7 – Cmaj7, 부드러운 로즈 피아노 느낌 + 패드
  toggleMusic(force) {
    this.init();
    this.music = force ?? !this.music;
    if (!this.ctx) return;
    if (this.music) {
      if (!this.musicBus) {
        this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.5;
        const delay = this.ctx.createDelay(1); delay.delayTime.value = 0.36;
        const fb = this.ctx.createGain(); fb.gain.value = 0.32;
        const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
        this.musicBus.connect(lp); lp.connect(this.master); lp.connect(delay); delay.connect(fb).connect(delay); delay.connect(this.master);
      }
      this.musicBus.gain.setTargetAtTime(0.5, this.now(), 0.3);
      this.bar = 0; this.nextBar = this.now() + 0.1;
      clearInterval(this.musicTimer);
      this.musicTimer = setInterval(() => this.schedule(), 200);
    } else {
      clearInterval(this.musicTimer);
      if (this.musicBus) this.musicBus.gain.setTargetAtTime(0, this.now(), 0.4);
    }
  },
  schedule() {
    if (!this.music || !this.ctx) return;
    const chords = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]];
    const beat = 60 / 72;
    const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
    while (this.nextBar < this.now() + 0.6) {
      const c = chords[this.bar % 4], t0 = this.nextBar - this.now();
      for (const n of c) { this.tone(hz(n), beat * 4.2, 0.035, 'sine', t0, this.musicBus, 0.6); this.tone(hz(n) * 1.003, beat * 4.2, 0.02, 'triangle', t0, this.musicBus, 0.8); }
      this.tone(hz(c[0] - 12), beat * 3.5, 0.08, 'sine', t0, this.musicBus, 0.02);
      const arp = [c[1] + 12, c[2] + 12, c[3] + 12, c[2] + 12, c[3] + 12, c[1] + 24, c[3] + 12, c[2] + 12];
      arp.forEach((n, i) => { if ((this.bar + i) % 3 === 2 && i % 2) return; this.tone(hz(n), beat * 1.4, 0.05, 'sine', t0 + i * beat / 2, this.musicBus, 0.004); this.tone(hz(n) * 2, beat * 0.5, 0.012, 'sine', t0 + i * beat / 2, this.musicBus, 0.003); });
      this.nextBar += beat * 4; this.bar++;
    }
  },
};
