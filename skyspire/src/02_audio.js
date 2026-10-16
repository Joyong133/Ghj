// ---------------------------------------------------------------------------
// 소리: 전부 Web Audio로 즉석 합성한다(외부 파일 없음).
// ---------------------------------------------------------------------------
const Sfx = {
  ctx: null, master: null, sfx: null, music: null, noiseBuf: null,
  musicState: { mode: null, timer: 0, chord: 0, nodes: [], nextNote: 0, beat: 0 },

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.connect(this.master);
    // 리버브(짧은 잡음 임펄스)
    const len = c.sampleRate * 1.8;
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    this.reverb = c.createConvolver(); this.reverb.buffer = ir;
    this.revGain = c.createGain(); this.revGain.gain.value = 0.25;
    this.reverb.connect(this.revGain); this.revGain.connect(this.master);
    this.music.connect(this.reverb);
    const nb = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate);
    const nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    this.applyVolume();
  },
  applyVolume() {
    if (!this.ctx) return;
    this.master.gain.value = G.settings.volume;
    this.music.gain.value = G.settings.music * 0.55;
  },
  now() { return this.ctx ? this.ctx.currentTime : 0; },
  pan(p) {
    if (!this.ctx.createStereoPanner) return this.sfx;
    const n = this.ctx.createStereoPanner(); n.pan.value = clamp(p, -1, 1); n.connect(this.sfx); return n;
  },
  noise(dur, o = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = this.now() + (o.delay || 0);
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.gain || 0.3, t + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.pan !== undefined ? this.pan(o.pan) : this.sfx);
    if (o.rev) g.connect(this.reverb);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  },
  tone(freq, dur, o = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = this.now() + (o.delay || 0);
    const osc = c.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.gain || 0.2, t + (o.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o.pan !== undefined ? this.pan(o.pan) : (o.dest || this.sfx));
    if (o.rev) g.connect(this.reverb);
    osc.start(t); osc.stop(t + dur + 0.05);
  },
  swing(power = 1) { this.noise(0.2 + 0.08 * power, { freq: 600, to: 2400 + 800 * power, q: 1.2, gain: 0.16 * power, attack: 0.05 }); },
  hit(crit, pan = 0) {
    this.noise(0.12, { freq: 1800, to: 500, q: 0.8, gain: 0.5, pan });
    this.tone(crit ? 180 : 120, 0.14, { type: 'triangle', to: 50, gain: 0.5, pan });
    if (crit) this.tone(1800, 0.25, { type: 'square', to: 900, gain: 0.08, pan, rev: true });
  },
  block() { this.tone(900, 0.18, { type: 'square', to: 600, gain: 0.12 }); this.noise(0.1, { freq: 3000, gain: 0.25 }); },
  parry() { this.tone(1500, 0.5, { type: 'triangle', gain: 0.25, rev: true }); this.tone(2250, 0.5, { type: 'sine', gain: 0.15, rev: true }); },
  hurt() { this.tone(160, 0.25, { type: 'sawtooth', to: 70, gain: 0.25 }); this.noise(0.18, { freq: 500, gain: 0.35 }); },
  shatter(pan = 0) {
    for (let i = 0; i < 5; i++) this.tone(1200 + Math.random() * 2600, 0.35 + Math.random() * 0.4, { type: 'triangle', gain: 0.06, delay: i * 0.03, pan, rev: true });
    this.noise(0.5, { freq: 5000, to: 9000, q: 0.5, gain: 0.2, pan, rev: true });
  },
  skill(color = 0) {
    const base = 400 + (color % 7) * 60;
    this.tone(base, 0.4, { type: 'sawtooth', to: base * 2.5, gain: 0.08, rev: true });
    this.noise(0.35, { freq: 1500, to: 6000, q: 2, gain: 0.15 });
  },
  levelUp() { [0, 4, 7, 12, 16].forEach((s, i) => this.tone(440 * Math.pow(2, s / 12), 0.6, { type: 'triangle', gain: 0.16, delay: i * 0.09, rev: true })); },
  pickup() { this.tone(880, 0.12, { type: 'sine', gain: 0.12 }); this.tone(1320, 0.18, { type: 'sine', gain: 0.1, delay: 0.06 }); },
  click() { this.tone(660, 0.06, { type: 'square', gain: 0.05 }); },
  error() { this.tone(200, 0.2, { type: 'square', gain: 0.08 }); },
  portal() { this.tone(220, 1.4, { type: 'sine', to: 880, gain: 0.15, rev: true }); this.noise(1.2, { freq: 400, to: 4000, q: 3, gain: 0.12, rev: true }); },
  roar() { this.tone(90, 1.2, { type: 'sawtooth', to: 45, gain: 0.35 }); this.noise(1.0, { freq: 300, to: 120, q: 0.7, gain: 0.4 }); },
  step() { this.noise(0.07, { freq: 300 + Math.random() * 200, q: 1, gain: 0.05, type: 'lowpass' }); },
  enemyWindup(pan = 0) { this.tone(300, 0.3, { type: 'sawtooth', to: 500, gain: 0.04, pan }); },
  coin() { this.tone(1600, 0.08, { type: 'square', gain: 0.04 }); this.tone(2400, 0.12, { type: 'square', gain: 0.03, delay: 0.05 }); },
  enhance(ok) { if (ok) { this.tone(700, 0.3, { type: 'triangle', gain: 0.2 }); this.tone(1400, 0.6, { type: 'triangle', gain: 0.2, delay: 0.12, rev: true }); } else { this.noise(0.4, { freq: 800, to: 200, gain: 0.3 }); this.tone(150, 0.4, { type: 'square', gain: 0.1 }); } },

  // 배경 음악: 층 테마의 음계로 화음 패드와 짧은 아르페지오를 만든다.
  SCALES: { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11] },
  setMusic(mode, theme) {
    const m = this.musicState;
    const key = mode + (theme ? theme.key : '');
    if (m.key === key) return;
    m.key = key; m.mode = mode; m.theme = theme; m.timer = 0; m.chord = 0; m.nextNote = 0; m.beat = 0;
    this.stopPad();
  },
  stopPad() {
    const m = this.musicState;
    if (!this.ctx) { m.nodes = []; return; }
    const t = this.now();
    for (const n of m.nodes) { try { n.g.gain.cancelScheduledValues(t); n.g.gain.setTargetAtTime(0.0001, t, 0.6); n.o.stop(t + 3); } catch (e) { /* 무시 */ } }
    m.nodes = [];
  },
  midi(n) { return 440 * Math.pow(2, (n - 69) / 12); },
  updateMusic(dt) {
    if (!this.ctx || G.settings.music <= 0) return;
    const m = this.musicState;
    if (!m.mode || !m.theme) return;
    const sc = this.SCALES[m.theme.music.scale] || this.SCALES.major;
    let root = m.theme.music.root;
    if (m.mode === 'dungeon') root -= 5;
    const prog = m.mode === 'boss' ? [0, 5, 3, 4] : m.mode === 'town' ? [0, 3, 4, 0] : [0, 5, 3, 4];
    const chordLen = m.mode === 'boss' ? 3.4 : 7;
    m.timer -= dt;
    if (m.timer <= 0) {
      m.timer = chordLen;
      this.stopPad();
      const deg = prog[m.chord % prog.length]; m.chord++;
      const notes = [0, 2, 4].map((k) => { const i = deg + k; return root + sc[i % 7] + 12 * Math.floor(i / 7); });
      notes.push(notes[0] - 12);
      const c = this.ctx, t = this.now();
      for (const n of notes) {
        for (const det of [-6, 6]) {
          const o = c.createOscillator(); o.type = m.mode === 'boss' ? 'sawtooth' : 'triangle';
          o.frequency.value = this.midi(n); o.detune.value = det;
          const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = m.mode === 'boss' ? 900 : 700;
          const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.setTargetAtTime(m.mode === 'boss' ? 0.03 : 0.035, t, 1.2);
          o.connect(f); f.connect(g); g.connect(this.music); o.start(t);
          m.nodes.push({ o, g });
        }
      }
      m.chordNotes = notes;
    }
    // 아르페지오 / 보스전 북소리
    m.nextNote -= dt;
    if (m.nextNote <= 0 && m.chordNotes) {
      if (m.mode === 'boss') {
        m.nextNote = 0.21; m.beat++;
        const n = m.chordNotes[m.beat % 3] + 12;
        this.tone(this.midi(n), 0.18, { type: 'square', gain: 0.03, dest: this.music });
        if (m.beat % 4 === 0) this.tone(60, 0.25, { type: 'sine', to: 35, gain: 0.35, dest: this.music });
        if (m.beat % 4 === 2) this.noiseTo(this.music, 0.12, 2500, 0.12);
      } else {
        m.nextNote = m.mode === 'town' ? 0.45 + Math.random() * 0.5 : 0.9 + Math.random() * 1.4;
        if (Math.random() < 0.75) {
          const i = Math.floor(Math.random() * 7);
          const n = root + 12 + sc[i];
          this.tone(this.midi(n), 1.6, { type: 'sine', gain: m.mode === 'dungeon' ? 0.025 : 0.04, dest: this.music, attack: 0.02 });
        }
      }
    }
  },
  noiseTo(dest, dur, freq, gain) {
    const c = this.ctx, t = this.now();
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest); src.start(t); src.stop(t + dur + 0.05);
  },
};
