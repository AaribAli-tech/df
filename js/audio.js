'use strict';
/* ============================================================
   Audio: procedurally synthesized SFX + looping chiptune music
   ============================================================ */
const Audio_ = {
  ctx: null, master: null, sfxGain: null, musGain: null, sfxVol: 0.8, musVol: 0.5, musicOn: false, musTimer: null, noiseBuf: null,
  lastPlay: {}, musicStep: 0, musicNodes: [],
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.master);
      this.musGain = this.ctx.createGain(); this.musGain.connect(this.master);
      this.setVolumes(this.sfxVol, this.musVol);
      const len = this.ctx.sampleRate * 1.5; this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { console.warn('no audio', e); }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setVolumes(s, m) { this.sfxVol = s; this.musVol = m; if (!this.ctx) return; this.sfxGain.gain.value = s * s; this.musGain.gain.value = m * m * 0.6; },
  /* --- primitives --- */
  tone(freq, dur, type = 'square', vol = 0.3, slide = 0, delay = 0) {
    if (!this.ctx) return; const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.3, filterFreq = 1000, type = 'lowpass', delay = 0, q = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 1;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(filterFreq, t); f.Q.value = q;
    if (type === 'lowpass') f.frequency.exponentialRampToValueAtTime(Math.max(60, filterFreq * 0.15), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxGain); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },
  throttle(key, ms) { const n = performance.now(); if (this.lastPlay[key] && n - this.lastPlay[key] < ms) return false; this.lastPlay[key] = n; return true; },
  /* --- named SFX --- */
  play(name, vol = 1) {
    if (!this.ctx) return;
    switch (name) {
      case 'shoot': if (!this.throttle('shoot', 40)) return; this.noise(0.18, 0.5 * vol, 1400); this.tone(160, 0.14, 'square', 0.18 * vol, -110); this.tone(70, 0.22, 'sine', 0.35 * vol, -40); break;
      case 'enemyShoot': if (!this.throttle('eshoot', 60)) return; this.noise(0.15, 0.3 * vol, 1000); this.tone(130, 0.12, 'square', 0.1 * vol, -80); break;
      case 'sniperShoot': this.noise(0.3, 0.5 * vol, 2500); this.tone(240, 0.25, 'sawtooth', 0.15 * vol, -200); this.tone(60, 0.3, 'sine', 0.35 * vol, -30); break;
      case 'ricochet': if (!this.throttle('ric', 50)) return; this.tone(1800 + Math.random() * 600, 0.12, 'square', 0.12 * vol, -1200); this.noise(0.08, 0.2 * vol, 5000, 'highpass'); break;
      case 'hitWall': if (!this.throttle('wall', 50)) return; this.noise(0.12, 0.25 * vol, 700); break;
      case 'hitTank': if (!this.throttle('hitT', 40)) return; this.noise(0.14, 0.3 * vol, 900); this.tone(220, 0.1, 'square', 0.12 * vol, -120); break;
      case 'explode': if (!this.throttle('boom', 60)) return; this.noise(0.7, 0.7 * vol, 900); this.tone(90, 0.5, 'sawtooth', 0.25 * vol, -70); this.tone(45, 0.7, 'sine', 0.4 * vol, -25); break;
      case 'bigExplode': this.noise(1.4, 0.9 * vol, 700); this.tone(70, 0.9, 'sawtooth', 0.3 * vol, -50); this.tone(38, 1.3, 'sine', 0.5 * vol, -20); this.noise(0.5, 0.4, 3000, 'highpass', 0.1); break;
      case 'playerHit': this.noise(0.25, 0.5 * vol, 600); this.tone(180, 0.2, 'sawtooth', 0.2 * vol, -100); this.tone(60, 0.3, 'sine', 0.3, -20); break;
      case 'coin': if (!this.throttle('coin', 30)) return; { const p = 1 + (this.coinPitch = ((this.coinPitch || 0) + 1) % 6) * 0.06; this.tone(1200 * p, 0.08, 'square', 0.1 * vol); this.tone(1700 * p, 0.14, 'square', 0.1 * vol, 0, 0.06); } break;
      case 'buy': this.tone(520, 0.1, 'square', 0.15); this.tone(660, 0.1, 'square', 0.15, 0, 0.09); this.tone(880, 0.22, 'square', 0.15, 0, 0.18); this.tone(1320, 0.3, 'triangle', 0.12, 0, 0.27); break;
      case 'deny': this.tone(200, 0.15, 'square', 0.15, -60); this.tone(160, 0.2, 'square', 0.15, -60, 0.14); break;
      case 'click': this.tone(700, 0.05, 'square', 0.08); this.tone(1000, 0.06, 'square', 0.06, 0, 0.04); break;
      case 'hover': this.tone(900, 0.03, 'square', 0.03); break;
      case 'bossShoot': this.noise(0.3, 0.6 * vol, 700); this.tone(100, 0.3, 'sawtooth', 0.25 * vol, -60); this.tone(400, 0.15, 'square', 0.1 * vol, -300); break;
      case 'bossHit': if (!this.throttle('bossHit', 50)) return; this.noise(0.15, 0.3, 1500, 'bandpass'); this.tone(300, 0.12, 'square', 0.12, -150); break;
      case 'bossRoar': this.tone(80, 1.2, 'sawtooth', 0.3, 30); this.tone(120, 1.0, 'square', 0.15, -40, 0.1); this.noise(1.0, 0.4, 400); break;
      case 'levelComplete': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'square', 0.15, 0, i * 0.12)); this.tone(1319, 0.6, 'triangle', 0.15, 0, 0.5); break;
      case 'gameOver': [440, 415, 392, 370, 349].forEach((f, i) => this.tone(f, 0.35, 'sawtooth', 0.12, -20, i * 0.22)); this.tone(110, 1.6, 'sawtooth', 0.15, -60, 0.9); break;
      case 'waveStart': this.tone(330, 0.12, 'square', 0.12); this.tone(440, 0.12, 'square', 0.12, 0, 0.12); this.tone(660, 0.3, 'square', 0.12, 0, 0.24); break;
      case 'unlock': [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.15, 0, i * 0.1)); break;
      case 'lowHp': this.tone(880, 0.08, 'square', 0.06); this.tone(880, 0.08, 'square', 0.06, 0, 0.15); break;
      case 'petShoot': if (!this.throttle('pshoot', 60)) return; this.noise(0.12, 0.25 * vol, 1600); this.tone(240, 0.1, 'square', 0.1 * vol, -120); break;
      case 'charge': this.tone(80, 0.8, 'sawtooth', 0.2, 300); this.noise(0.8, 0.3, 300, 'lowpass'); break;
      case 'telegraph': this.tone(1400, 0.08, 'sine', 0.08); break;
    }
  },
  /* --- music: simple looped chiptune, generated with scheduled oscillators --- */
  startMusic(kind = 'menu') {
    if (!this.ctx) return;
    this.stopMusic();
    this.musicOn = true; this.musicKind = kind; this.musicStep = 0;
    this.nextNote = this.ctx.currentTime + 0.05;
    this.schedule();
    this.musTimer = setInterval(() => this.schedule(), 200);
  },
  stopMusic() { this.musicOn = false; if (this.musTimer) clearInterval(this.musTimer); this.musTimer = null; },
  schedule() {
    if (!this.musicOn) return;
    const bpm = this.musicKind === 'boss' ? 150 : this.musicKind === 'battle' ? 128 : 96;
    const stepDur = 60 / bpm / 2; // 8th notes
    while (this.nextNote < this.ctx.currentTime + 0.5) {
      this.playStep(this.musicStep, this.nextNote, stepDur);
      this.nextNote += stepDur; this.musicStep++;
    }
  },
  mnote(freq, t, dur, type, vol) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.musGain); o.start(t); o.stop(t + dur + 0.02);
  },
  mdrum(t, kind) {
    if (kind === 'kick') { const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(g); g.connect(this.musGain); o.start(t); o.stop(t + 0.22); }
    else { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = kind === 'snare' ? 1800 : 6000; const g = this.ctx.createGain(); g.gain.setValueAtTime(kind === 'snare' ? 0.25 : 0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'snare' ? 0.15 : 0.05)); s.connect(f); f.connect(g); g.connect(this.musGain); s.start(t, Math.random()); s.stop(t + 0.2); }
  },
  playStep(step, t, dur) {
    const N = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const kind = this.musicKind;
    if (kind === 'menu') {
      const bass = [45, 45, 48, 48, 43, 43, 50, 50]; const b = bass[Math.floor(step / 8) % 8];
      if (step % 4 === 0) this.mnote(N(b), t, dur * 3.5, 'triangle', 0.35);
      const arp = [0, 7, 12, 7, 3, 7, 12, 15]; this.mnote(N(b + 12 + arp[step % 8]), t, dur * 0.9, 'square', 0.05);
      if (step % 16 === 0) this.mdrum(t, 'kick'); if (step % 16 === 8) this.mdrum(t, 'snare');
      const lead = [-1, -1, 12, 15, 19, -1, 17, 15, -1, 12, -1, -1, 10, 12, -1, -1]; const l = lead[step % 16]; if (l >= 0 && Math.floor(step / 16) % 2 === 1) this.mnote(N(57 + l), t, dur * 1.6, 'square', 0.07);
    } else if (kind === 'battle') {
      const prog = [40, 40, 40, 40, 43, 43, 38, 38, 40, 40, 40, 40, 46, 46, 47, 47]; const b = prog[Math.floor(step / 8) % 16];
      this.mnote(N(b + (step % 2 ? 12 : 0)), t, dur * 0.8, 'sawtooth', step % 2 ? 0.12 : 0.22);
      if (step % 4 === 0) this.mdrum(t, 'kick'); if (step % 8 === 4) this.mdrum(t, 'snare'); if (step % 2 === 1) this.mdrum(t, 'hat');
      const riff = [0, -1, 3, 5, -1, 7, -1, 5, 3, -1, 0, -1, -2, -1, 0, -1]; const r = riff[step % 16]; if (r >= -2 && r !== -1) this.mnote(N(b + 24 + r), t, dur * 1.2, 'square', 0.08);
      if (step % 32 >= 24 && step % 2 === 0) this.mnote(N(b + 31 + (step % 4 ? 2 : 0)), t, dur, 'square', 0.05);
    } else { // boss
      const prog = [38, 38, 38, 38, 41, 41, 37, 37, 38, 38, 38, 38, 44, 44, 45, 45]; const b = prog[Math.floor(step / 8) % 16];
      this.mnote(N(b), t, dur * 0.7, 'sawtooth', step % 4 === 0 ? 0.28 : 0.18); if (step % 2) this.mnote(N(b + 7), t, dur * 0.5, 'square', 0.08);
      if (step % 4 === 0 || step % 16 === 10) this.mdrum(t, 'kick'); if (step % 8 === 4) this.mdrum(t, 'snare'); this.mdrum(t, 'hat');
      const riff = [12, -1, 12, 13, -1, 12, 18, -1, 12, -1, 12, 11, -1, 12, 6, -1]; const r = riff[step % 16]; if (r >= 0) this.mnote(N(b + 12 + r), t, dur * 1.3, 'square', 0.1);
    }
  },
};
