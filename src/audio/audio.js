// Procedural audio: every sound is synthesized with WebAudio (oscillators,
// filtered noise, envelopes), spatialized with HRTF panners. Ambience beds
// crossfade by biome, time of day, weather and distance to water.
import * as THREE from 'three';

const NOISE_LEN = 2;
export class Audio {
  constructor(game) {
    this.name = 'audio';
    this.game = game;
    this.ctx = null;
    this.ready = false;
    this.vol = { master: 0.8, music: 0.5, sfx: 1, amb: 0.8, voice: 1 };
    this.loops = new Map();
    this.lastPlay = new Map();
    this._lp = new THREE.Vector3(); this._lf = new THREE.Vector3(); this._lu = new THREE.Vector3();
    const unlock = () => { this.init(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    if (game) game.audio = this;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); } catch { return; }
    const c = this.ctx;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.003; this.comp.release.value = 0.25;
    this.master = c.createGain(); this.master.gain.value = this.vol.master;
    this.master.connect(this.comp).connect(c.destination);
    this.bus = {};
    for (const k of ['sfx', 'amb', 'music', 'voice']) { const g = c.createGain(); g.gain.value = this.vol[k]; g.connect(this.master); this.bus[k] = g; }
    // reverb-ish send for big outdoor sounds
    this.verb = c.createConvolver();
    this.verb.buffer = this.makeImpulse(2.2, 2.5);
    this.verbGain = c.createGain(); this.verbGain.gain.value = 0.22;
    this.verb.connect(this.verbGain).connect(this.master);
    // noise buffers
    const mk = (fn) => { const b = c.createBuffer(1, c.sampleRate * NOISE_LEN, c.sampleRate); const d = b.getChannelData(0); fn(d); return b; };
    this.white = mk((d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
    this.pink = mk((d) => { let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; } });
    this.brown = mk((d) => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
    this.ready = true;
    this.startAmbience();
    this.game?.events.emit('audioReady', this);
  }
  makeImpulse(dur, decay) {
    const c = this.ctx, len = c.sampleRate * dur;
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  setVolumes(v) { Object.assign(this.vol, v); if (!this.ready) return; this.master.gain.value = this.vol.master; for (const k of Object.keys(this.bus)) this.bus[k].gain.value = this.vol[k] ?? 1; }

  // ---------------------------------------------------------------- primitives
  now() { return this.ctx.currentTime; }
  out(opt = {}) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = (opt.vol ?? 1);
    let node = g;
    if (opt.pos) {
      const p = c.createPanner();
      p.panningModel = opt.hrtf === false ? 'equalpower' : 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = opt.ref ?? 3;
      p.maxDistance = opt.max ?? 200;
      p.rolloffFactor = opt.rolloff ?? 1.1;
      p.positionX.value = opt.pos.x; p.positionY.value = opt.pos.y; p.positionZ.value = opt.pos.z;
      g.connect(p);
      p.connect(opt.bus ?? this.bus.sfx);
      if (opt.verb) { const s = c.createGain(); s.gain.value = opt.verb; p.connect(s).connect(this.verb); }
      node.panner = p;
    } else {
      g.connect(opt.bus ?? this.bus.sfx);
      if (opt.verb) { const s = c.createGain(); s.gain.value = opt.verb; g.connect(s).connect(this.verb); }
    }
    return g;
  }
  env(param, t, a, d, peak = 1, sustain = 0, rel = 0.05, hold = 0) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + a);
    if (hold) param.setValueAtTime(peak, t + a + hold);
    param.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + hold + d);
    if (sustain) param.exponentialRampToValueAtTime(0.0001, t + a + hold + d + rel);
  }
  osc(dest, type, f0, f1, t, dur, vol = 1, opt = {}) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur * (opt.sweepFrac ?? 1));
    if (opt.detune) o.detune.value = opt.detune;
    const g = c.createGain();
    this.env(g.gain, t, opt.a ?? 0.005, dur, vol, 0, 0.05, opt.hold ?? 0);
    o.connect(g);
    if (opt.filter) { const f = c.createBiquadFilter(); f.type = opt.filter.type; f.frequency.value = opt.filter.f; f.Q.value = opt.filter.q ?? 1; g.connect(f); f.connect(dest); } else g.connect(dest);
    if (opt.vibrato) { const l = c.createOscillator(); l.frequency.value = opt.vibrato[0]; const lg = c.createGain(); lg.gain.value = opt.vibrato[1]; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 0.2); }
    o.start(t); o.stop(t + (opt.a ?? 0.005) + (opt.hold ?? 0) + dur + 0.1);
    return o;
  }
  noise(dest, t, dur, vol = 1, opt = {}) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = opt.color === 'pink' ? this.pink : opt.color === 'brown' ? this.brown : this.white;
    s.loop = true;
    s.playbackRate.value = opt.rate ?? 1;
    const f = c.createBiquadFilter();
    f.type = opt.type ?? 'bandpass'; f.Q.value = opt.q ?? 1;
    f.frequency.setValueAtTime(opt.f ?? 1000, t);
    if (opt.f1) f.frequency.exponentialRampToValueAtTime(opt.f1, t + dur);
    const g = c.createGain();
    this.env(g.gain, t, opt.a ?? 0.003, dur, vol, 0, 0.05, opt.hold ?? 0);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + (opt.a ?? 0.003) + (opt.hold ?? 0) + dur + 0.1);
    return { s, f, g };
  }

  // ---------------------------------------------------------------- sound library
  play(name, opt = {}) {
    if (!this.ready) return;
    const fn = SOUNDS[name];
    if (!fn) return;
    const nowMs = performance.now();
    const minGap = opt.gap ?? 25;
    if (nowMs - (this.lastPlay.get(name) ?? 0) < minGap) return;
    this.lastPlay.set(name, nowMs);
    try {
      const o = this.out({ ...opt, verb: opt.verb ?? (opt.pos ? 0.12 : 0) });
      fn(this, o, this.now(), opt.rate ?? (0.94 + Math.random() * 0.12), opt);
    } catch (e) { console.warn('audio', name, e); }
  }

  // ---------------------------------------------------------------- looping beds
  startAmbience() {
    const c = this.ctx;
    const bed = (name, setup) => {
      const g = c.createGain(); g.gain.value = 0; g.connect(this.bus.amb);
      const parts = setup(g);
      this.loops.set(name, { g, parts, target: 0 });
    };
    const noiseLoop = (dest, color, type, f, q, vol = 1, rate = 1) => {
      const s = c.createBufferSource(); s.buffer = this[color]; s.loop = true; s.playbackRate.value = rate;
      const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = c.createGain(); g.gain.value = vol;
      s.connect(fl).connect(g).connect(dest); s.start(0, Math.random());
      return { s, fl, g };
    };
    bed('wind', (g) => { const a = noiseLoop(g, 'pink', 'bandpass', 420, 0.6, 0.9); const b = noiseLoop(g, 'pink', 'bandpass', 1400, 2, 0.25); return { a, b }; });
    bed('rain', (g) => { const a = noiseLoop(g, 'white', 'lowpass', 2800, 0.5, 0.5); const b = noiseLoop(g, 'pink', 'highpass', 5000, 0.5, 0.25); return { a, b }; });
    bed('river', (g) => { const a = noiseLoop(g, 'brown', 'lowpass', 700, 0.7, 1.2); const b = noiseLoop(g, 'white', 'bandpass', 2200, 0.8, 0.12); return { a, b }; });
    bed('rapids', (g) => { const a = noiseLoop(g, 'white', 'bandpass', 1700, 0.7, 0.55); const b = noiseLoop(g, 'brown', 'lowpass', 600, 0.6, 1.1); const lfo = c.createOscillator(); lfo.frequency.value = 0.7; const lg = c.createGain(); lg.gain.value = 0.18; lfo.connect(lg).connect(a.g.gain); lfo.start(); return { a, b, lfo }; });
    bed('falls', (g) => { const a = noiseLoop(g, 'brown', 'lowpass', 900, 0.4, 1.8); const b = noiseLoop(g, 'pink', 'bandpass', 1500, 0.4, 0.5); return { a, b }; });
    bed('ocean', (g) => { const a = noiseLoop(g, 'brown', 'lowpass', 500, 0.6, 1.2); const lfo = c.createOscillator(); lfo.frequency.value = 0.09; const lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg).connect(a.g.gain); lfo.start(); return { a, lfo }; });
    bed('insects', (g) => {
      // cicada-like buzzing: high bandpassed noise amplitude-modulated by a fast LFO
      const a = noiseLoop(g, 'white', 'bandpass', 5200, 6, 0.0);
      const lfo = c.createOscillator(); lfo.frequency.value = 42; const lg = c.createGain(); lg.gain.value = 0.22; lfo.connect(lg).connect(a.g.gain); lfo.start();
      const slow = c.createOscillator(); slow.frequency.value = 0.13; const sg = c.createGain(); sg.gain.value = 0.12; slow.connect(sg).connect(a.g.gain); slow.start();
      return { a, lfo, slow };
    });
    bed('crickets', (g) => {
      const o = c.createOscillator(); o.frequency.value = 4700; o.type = 'sine';
      const am = c.createGain(); am.gain.value = 0;
      const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 18; const lg = c.createGain(); lg.gain.value = 0.06;
      lfo.connect(lg).connect(am.gain);
      const chirp = c.createOscillator(); chirp.type = 'square'; chirp.frequency.value = 1.3; const cg = c.createGain(); cg.gain.value = 0.05; chirp.connect(cg).connect(am.gain);
      o.connect(am).connect(g); o.start(); lfo.start(); chirp.start();
      return { o, lfo, chirp };
    });
    bed('lava', (g) => { const a = noiseLoop(g, 'brown', 'lowpass', 220, 0.5, 1.4); return { a }; });
    this.nextCritter = 3;
    this.nextMusic = 40;
  }
  setBed(name, v) { const l = this.loops.get(name); if (l) l.target = v; }

  update(dt) {
    if (!this.ready) return;
    const g = this.game, c = this.ctx;
    // listener follows the camera
    const cam = g.engine.camera;
    const L = c.listener;
    cam.getWorldDirection(this._lf);
    this._lu.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const t = c.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(cam.position.x, t, 0.02); L.positionY.setTargetAtTime(cam.position.y, t, 0.02); L.positionZ.setTargetAtTime(cam.position.z, t, 0.02);
      L.forwardX.setTargetAtTime(this._lf.x, t, 0.02); L.forwardY.setTargetAtTime(this._lf.y, t, 0.02); L.forwardZ.setTargetAtTime(this._lf.z, t, 0.02);
      L.upX.setTargetAtTime(this._lu.x, t, 0.02); L.upY.setTargetAtTime(this._lu.y, t, 0.02); L.upZ.setTargetAtTime(this._lu.z, t, 0.02);
    } else { L.setPosition(cam.position.x, cam.position.y, cam.position.z); L.setOrientation(this._lf.x, this._lf.y, this._lf.z, this._lu.x, this._lu.y, this._lu.z); }
    // ambience targets
    const p = g.local.pos;
    const wx = g.weather.cur;
    const night = g.time.isNight;
    const biome = g.sampler.biomeAt(p.x, p.z);
    const lush = [2, 3, 4, 5, 12].includes(biome) ? 1 : 0.35;
    const indoors = g.isCameraSheltered?.() ? 0.45 : 1;
    this.setBed('wind', (0.12 + wx.wind * 0.12 + Math.max(0, (p.y - 60) / 200)) * indoors);
    this.setBed('rain', wx.rain * 0.55 * (indoors < 1 ? 0.7 : 1));
    this.setBed('insects', night ? 0 : lush * 0.5 * (1 - wx.rain) * indoors);
    this.setBed('crickets', night ? lush * 0.6 * (1 - wx.rain * 0.8) : 0);
    // water proximity (sampled sparsely)
    this._wT = (this._wT ?? 0) - dt;
    if (this._wT <= 0) {
      this._wT = 0.5;
      let river = 99, fallD = 999, sea = 99;
      const s = g.sampler;
      for (let a = 0; a < 8; a++) for (const r of [4, 12, 30]) {
        const x = p.x + Math.cos(a * 0.785) * r, z = p.z + Math.sin(a * 0.785) * r;
        const wl = s.waterAt(x, z);
        if (wl > -999) { if (wl > 0.3) river = Math.min(river, r); else sea = Math.min(sea, r); }
      }
      const pool = g.world.pool;
      if (pool) fallD = Math.hypot(p.x - pool.x, p.z - pool.z);
      this._river = river; this._fall = fallD; this._sea = sea;
      const lava = g.world.layout?.volcano ? Math.hypot(p.x - g.world.layout.volcano.x, p.z - g.world.layout.volcano.z) : 999;
      this.setBed('lava', Math.max(0, 1 - lava / 120) * 0.6);
    }
    this.setBed('river', this._river < 99 ? 0.5 * (1 - this._river / 40) : 0);
    this.setBed('falls', Math.max(0, 1 - this._fall / 160) ** 1.6 * 1.1);
    this.setBed('rapids', g.rapids?.loud ?? 0);
    this.setBed('ocean', this._sea < 99 ? 0.6 * (1 - this._sea / 40) : 0);
    for (const l of this.loops.values()) l.g.gain.setTargetAtTime(l.target, t, 0.6);
    // random critters + distant dino calls
    this.nextCritter -= dt;
    if (this.nextCritter <= 0) {
      this.nextCritter = 4 + Math.random() * 9;
      const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 120;
      const pos = new THREE.Vector3(p.x + Math.cos(a) * d, p.y + 5, p.z + Math.sin(a) * d);
      if (night) this.play(Math.random() < 0.5 ? 'frog' : 'owlbeast', { pos, vol: 0.6, ref: 20 });
      else if (lush > 0.5) this.play(['critter', 'frog', 'distant_honk', 'distant_roar'][Math.floor(Math.random() * (Math.random() < 0.85 ? 3 : 4))], { pos, vol: 0.55, ref: 25 });
    }
    // little generative music cues when calm
    this.nextMusic -= dt;
    if (this.nextMusic <= 0) { this.nextMusic = 70 + Math.random() * 90; if (!g.danger) this.motif(night ? 'night' : 'day'); }
    // war drums while something big is hunting you (fade in fast, out slow)
    const want = g.danger ?? 0, cur = this.dangerLvl ?? 0;
    this.dangerLvl = cur + (want - cur) * Math.min(1, dt * (want > cur ? 1.5 : 0.25));
    if (this.dangerLvl > 0.04) this.drums();
    else this.beatT = 0;
  }
  // tribal drums + a stalking bass line, scheduled a little ahead of time
  drums() {
    const c = this.ctx, bus = this.bus.music, L = this.dangerLvl;
    const BEAT = 0.42;
    if (!this.beatT || this.beatT < c.currentTime) { this.beatT = c.currentTime + 0.05; this.beatN = 0; }
    const BASS = [110, 110, 130.8, 110, 82.4, 110, 98, 87.3];
    while (this.beatT < c.currentTime + 0.25) {
      const t = this.beatT, n = this.beatN++, k = n % 4;
      if (k === 0 || k === 2 || (L > 0.7 && n % 8 === 7)) { this.osc(bus, 'sine', 130, 38, t, 0.32, 0.42 * L, { sweepFrac: 0.6 }); this.noise(bus, t, 0.05, 0.12 * L, { type: 'lowpass', f: 900 }); }
      if (k === 1 || k === 3) this.osc(bus, 'triangle', 196 * (k === 3 ? 0.89 : 1), 120, t, 0.22, 0.28 * L, { sweepFrac: 0.5 });
      if (L > 0.45) { this.noise(bus, t + BEAT / 2, 0.04, 0.06 * L, { type: 'highpass', f: 5200 }); this.noise(bus, t, 0.03, 0.04 * L, { type: 'highpass', f: 6500 }); }
      const f = BASS[n % 8];
      this.osc(bus, 'sawtooth', f, f, t, BEAT * 0.9, 0.07 * L, { a: 0.01, filter: { type: 'lowpass', f: 420, q: 4 } });
      this.beatT += BEAT;
    }
  }

  motif(kind) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now() + 0.05;
    const bus = this.bus.music;
    const scale = kind === 'night' ? [220, 261.6, 293.7, 349.2, 392, 440] : [293.7, 329.6, 392, 440, 493.9, 587.3, 659.3];
    const n = 5 + Math.floor(Math.random() * 4);
    const delay = c.createDelay(); delay.delayTime.value = 0.36; const fb = c.createGain(); fb.gain.value = 0.35; const wet = c.createGain(); wet.gain.value = 0.35;
    delay.connect(fb).connect(delay); delay.connect(wet).connect(bus);
    let idx = Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      idx = Math.max(0, Math.min(scale.length - 1, idx + [-1, 1, 2, -2, 0][Math.floor(Math.random() * 5)]));
      const f = scale[idx] * (Math.random() < 0.2 ? 2 : 1);
      const tt = t + i * 0.42 + (Math.random() < 0.3 ? 0.21 : 0);
      const g = c.createGain(); g.gain.value = 0.11; g.connect(bus); g.connect(delay);
      this.osc(g, 'triangle', f, f, tt, 0.9, 0.9, { a: 0.01 });
      this.osc(g, 'sine', f * 2, f * 2, tt, 0.4, 0.25, { a: 0.005 });
    }
  }
  jingle(kind) {
    if (!this.ready) return;
    const t = this.now() + 0.02, bus = this.out({ bus: this.bus.music, vol: 0.5 });
    const seqs = {
      discover: [[523.3, 0], [659.3, 0.11], [784, 0.22], [1046.5, 0.33]],
      tame: [[392, 0], [523.3, 0.14], [659.3, 0.28], [784, 0.42], [1046.5, 0.6], [784, 0.75], [1046.5, 0.9]],
      research: [[440, 0], [554.4, 0.09], [659.3, 0.18], [880, 0.27], [1108.7, 0.36]],
      chapter: [[293.7, 0], [440, 0.2], [587.3, 0.4], [740, 0.6], [880, 0.95]],
      fail: [[392, 0], [349.2, 0.18], [311.1, 0.36], [261.6, 0.6]],
      night: [[220, 0], [207.7, 0.6], [164.8, 1.2]],
      dawn: [[392, 0], [493.9, 0.3], [587.3, 0.6], [784, 1.0]],
      boss: [[146.8, 0], [155.6, 0.22], [146.8, 0.44], [196, 0.7], [185, 0.95], [138.6, 1.25]],
    };
    for (const [f, dt] of seqs[kind] ?? seqs.discover) { this.osc(bus, 'square', f, f, t + dt, 0.18, 0.18, { filter: { type: 'lowpass', f: 2600 } }); this.osc(bus, 'triangle', f / 2, f / 2, t + dt, 0.3, 0.3); }
  }
}

// ------------------------------------------------------------------ recipes
const S = {};
S.ui_click = (A, o, t) => A.osc(o, 'square', 1250, 1250, t, 0.025, 0.12);
S.ui_tick = (A, o, t) => A.osc(o, 'square', 1900, 1900, t, 0.012, 0.08);
S.pda_open = (A, o, t) => { A.osc(o, 'square', 660, 660, t, 0.05, 0.12); A.osc(o, 'square', 990, 990, t + 0.06, 0.07, 0.12); };
S.pda_close = (A, o, t) => { A.osc(o, 'square', 990, 990, t, 0.05, 0.12); A.osc(o, 'square', 660, 660, t + 0.06, 0.07, 0.12); };
S.box_open = (A, o, t) => { A.noise(o, t, 0.12, 0.5, { f: 900, q: 2, f1: 400 }); A.osc(o, 'sine', 180, 110, t, 0.1, 0.4); };
S.box_close = (A, o, t) => { A.osc(o, 'sine', 140, 70, t, 0.12, 0.7); A.noise(o, t, 0.06, 0.4, { f: 1200, q: 1 }); };
S.loot = (A, o, t) => { A.osc(o, 'sine', 1320, 1320, t, 0.12, 0.25); A.osc(o, 'sine', 1980, 1980, t + 0.05, 0.14, 0.18); };
S.pickup = (A, o, t, r) => { A.osc(o, 'square', 520 * r, 780 * r, t, 0.06, 0.15, { filter: { type: 'lowpass', f: 3000 } }); A.osc(o, 'square', 780 * r, 1170 * r, t + 0.06, 0.06, 0.12, { filter: { type: 'lowpass', f: 3000 } }); };
S.jump = (A, o, t, r) => { A.osc(o, 'triangle', 280 * r, 420 * r, t, 0.08, 0.35); A.noise(o, t, 0.06, 0.15, { f: 900 }); };
S.land = (A, o, t, r, opt) => { A.osc(o, 'sine', 110 * r, 50, t, 0.12, 0.8); A.noise(o, t, 0.1, 0.4, { f: 600, type: 'lowpass' }); };
S.hurt = (A, o, t, r) => { A.osc(o, 'sawtooth', 240 * r, 150 * r, t, 0.2, 0.3, { filter: { type: 'bandpass', f: 850, q: 3 } }); A.osc(o, 'sawtooth', 360 * r, 210 * r, t, 0.18, 0.14, { filter: { type: 'bandpass', f: 1600, q: 4 } }); };
S.whoosh = (A, o, t, r) => A.noise(o, t, 0.2 / r, 0.35, { f: 450, f1: 2200, q: 1.5 });
S.throw = (A, o, t) => A.noise(o, t, 0.22, 0.45, { f: 600, f1: 2600, q: 2 });
S.chop = (A, o, t, r) => { A.osc(o, 'sine', 190 * r, 85 * r, t, 0.14, 0.9); A.noise(o, t, 0.09, 0.8, { f: 1300 * r, q: 1.6 }); A.noise(o, t, 0.02, 0.6, { f: 4200, type: 'highpass' }); };
S.punch_wood = (A, o, t, r) => { A.osc(o, 'sine', 140 * r, 70, t, 0.1, 0.7); A.noise(o, t, 0.05, 0.3, { f: 800 }); };
S.thunk = (A, o, t, r) => { A.osc(o, 'sine', 160 * r, 80, t, 0.12, 0.8); A.noise(o, t, 0.07, 0.5, { f: 1000 }); };
S.clink = (A, o, t, r) => { for (const [f, v] of [[1820, 0.35], [2740, 0.22], [4130, 0.14], [5600, 0.08]]) A.osc(o, 'sine', f * r, f * r * 0.98, t, 0.32, v); A.noise(o, t, 0.04, 0.6, { f: 3500, q: 0.8 }); A.osc(o, 'sine', 120, 60, t, 0.08, 0.5); };
S.thud = (A, o, t, r) => { A.osc(o, 'sine', 90 * r, 45, t, 0.16, 1); A.noise(o, t, 0.12, 0.5, { type: 'lowpass', f: 500 }); };
S.rustle = (A, o, t, r) => { const n = A.noise(o, t, 0.32, 0.5, { f: 3800 * r, q: 0.9, a: 0.04 }); const l = A.ctx.createOscillator(); l.frequency.value = 22; const lg = A.ctx.createGain(); lg.gain.value = 0.3; l.connect(lg).connect(n.g.gain); l.start(t); l.stop(t + 0.4); };
S.pluck = (A, o, t, r) => { A.noise(o, t, 0.12, 0.5, { f: 2500 * r, q: 1.2 }); A.osc(o, 'triangle', 600 * r, 300, t, 0.06, 0.2); };
S.munch = (A, o, t, r) => { for (let i = 0; i < 3; i++) A.noise(o, t + i * 0.11, 0.06, 0.55, { f: (1500 + Math.random() * 900) * r, q: 1.2 }); };
S.drink = (A, o, t, r) => { for (let i = 0; i < 3; i++) A.osc(o, 'sine', 320 * r, 150 * r, t + i * 0.22, 0.12, 0.45); };
S.fill = (A, o, t) => A.noise(o, t, 0.6, 0.4, { f: 700, f1: 1600, q: 2 });
S.heal = (A, o, t) => { for (const [f, d] of [[660, 0], [880, 0.08], [1320, 0.16]]) A.osc(o, 'sine', f, f, t + d, 0.25, 0.2); };
S.break = (A, o, t) => { A.noise(o, t, 0.25, 0.8, { f: 2000, q: 0.7, f1: 600 }); A.osc(o, 'square', 300, 80, t, 0.2, 0.2); };
S.clack = (A, o, t, r) => { A.noise(o, t, 0.03, 0.6, { f: 2600 * r, q: 2 }); A.osc(o, 'sine', 400 * r, 200, t, 0.04, 0.3); };
S.swim = (A, o, t, r) => A.noise(o, t, 0.35, 0.5, { f: 900 * r, f1: 400, q: 1, a: 0.05 });
S.splash = (A, o, t, r) => { A.noise(o, t, 0.5, 0.9, { f: 1200 * r, f1: 300, q: 0.8 }); A.osc(o, 'sine', 300, 90, t, 0.15, 0.4); };
S.step_grass = (A, o, t, r) => { A.noise(o, t, 0.07, 0.35, { f: 3000 * r, q: 1.2 }); A.osc(o, 'sine', 90, 60, t, 0.04, 0.25); };
S.step_dirt = (A, o, t, r) => { A.noise(o, t, 0.06, 0.5, { f: 1300 * r, q: 1.5 }); A.osc(o, 'sine', 100, 60, t, 0.05, 0.3); };
S.step_sand = (A, o, t, r) => A.noise(o, t, 0.12, 0.4, { f: 1800 * r, q: 0.6, type: 'lowpass' });
S.step_stone = (A, o, t, r) => { A.noise(o, t, 0.025, 0.4, { f: 4000 * r, type: 'highpass' }); A.osc(o, 'sine', 130, 80, t, 0.04, 0.3); };
S.step_wood = (A, o, t, r) => { A.osc(o, 'sine', 150 * r, 80, t, 0.08, 0.6); A.noise(o, t, 0.02, 0.3, { f: 3000, type: 'highpass' }); };
S.step_water = (A, o, t, r) => A.noise(o, t, 0.18, 0.5, { f: 1100 * r, f1: 500, q: 1 });
S.step_snow = (A, o, t, r) => { A.noise(o, t, 0.1, 0.45, { f: 2400 * r, q: 2.5 }); A.noise(o, t + 0.03, 0.06, 0.3, { f: 3200 * r, q: 3 }); };
S.step_metal = (A, o, t, r) => { A.osc(o, 'sine', 900 * r, 700, t, 0.1, 0.12); A.osc(o, 'sine', 140, 90, t, 0.05, 0.4); };
S.step_mud = (A, o, t, r) => { A.noise(o, t, 0.14, 0.5, { f: 500 * r, f1: 300, q: 1.5 }); A.osc(o, 'sine', 140, 90, t, 0.1, 0.3); };
S.step_big = (A, o, t, r) => { A.osc(o, 'sine', 55 * r, 30, t, 0.35, 1.2); A.noise(o, t, 0.25, 0.6, { type: 'lowpass', f: 300 }); };
S.thunder = (A, o, t) => { A.noise(o, t, 0.15, 1.2, { f: 2500, q: 0.4 }); A.noise(o, t + 0.05, 4.5, 1.6, { color: 'brown', type: 'lowpass', f: 260, a: 0.3 }); A.noise(o, t + 0.4, 3, 0.8, { color: 'brown', type: 'lowpass', f: 120, a: 0.5 }); };
S.craft_start = (A, o, t) => { A.osc(o, 'square', 440, 440, t, 0.05, 0.1); };
S.craft_tick = (A, o, t, r) => { A.noise(o, t, 0.03, 0.5, { f: 2400 * r, q: 2 }); A.osc(o, 'sine', 880 * r, 700, t, 0.05, 0.2); };
S.craft_done = (A, o, t) => { for (const [f, d] of [[523.3, 0], [659.3, 0.08], [784, 0.16], [1046.5, 0.26]]) A.osc(o, 'square', f, f, t + d, 0.1, 0.12, { filter: { type: 'lowpass', f: 3000 } }); };
S.sizzle = (A, o, t) => { A.noise(o, t, 0.9, 0.35, { f: 5000, type: 'highpass', a: 0.1 }); for (let i = 0; i < 6; i++) A.noise(o, t + Math.random() * 0.8, 0.02, 0.4, { f: 3000 + Math.random() * 2000, q: 3 }); };
S.crackle = (A, o, t) => { for (let i = 0; i < 3; i++) A.noise(o, t + Math.random() * 0.3, 0.015, 0.5, { f: 1500 + Math.random() * 3000, q: 2 }); };
S.fire_whoosh = (A, o, t) => A.noise(o, t, 0.8, 0.6, { f: 300, f1: 900, q: 0.7, a: 0.1, color: 'pink' });
S.creak = (A, o, t, r) => { A.osc(o, 'sawtooth', 90 * r, 55 * r, t, 1.3, 0.28, { a: 0.2, filter: { type: 'bandpass', f: 600, q: 6 }, vibrato: [7, 9] }); A.osc(o, 'sawtooth', 130 * r, 70, t + 0.2, 1.0, 0.18, { a: 0.2, filter: { type: 'bandpass', f: 900, q: 8 }, vibrato: [11, 6] }); };
S.quake = (A, o, t) => { A.osc(o, 'sine', 60, 24, t, 0.9, 1.6); A.osc(o, 'triangle', 90, 40, t, 0.35, 0.8); A.noise(o, t, 1.6, 1.3, { color: 'brown', type: 'lowpass', f: 380, f1: 90 }); for (let i = 0; i < 8; i++) A.noise(o, t + 0.05 + Math.random() * 0.6, 0.06, 0.35, { f: 900 + Math.random() * 1600, q: 1.2 }); };
S.tree_crash = (A, o, t) => { A.osc(o, 'sine', 70, 30, t, 0.7, 1.6); A.noise(o, t, 1.4, 1.2, { color: 'brown', type: 'lowpass', f: 700, f1: 200 }); for (let i = 0; i < 10; i++) A.noise(o, t + Math.random() * 0.8, 0.05, 0.4, { f: 1500 + Math.random() * 2500, q: 1.5 }); };
S.timber = (A, o, t) => { A.osc(o, 'sawtooth', 300, 220, t, 0.35, 0.3, { filter: { type: 'bandpass', f: 900, q: 3 } }); A.osc(o, 'sawtooth', 340, 250, t + 0.32, 0.5, 0.3, { filter: { type: 'bandpass', f: 900, q: 3 } }); };
// gravity gun: a rising charged sweep on grab, a falling one on release
S.grav_on = (A, o, t, r) => { A.osc(o, 'sawtooth', 160 * r, 640 * r, t, 0.22, 0.12, { filter: { type: 'lowpass', f: 1800 } }); A.osc(o, 'sine', 320 * r, 1280 * r, t, 0.2, 0.18); A.noise(o, t, 0.18, 0.12, { f: 2400, f1: 5200, q: 3 }); };
S.grav_off = (A, o, t, r) => { A.osc(o, 'sine', 900 * r, 180 * r, t, 0.18, 0.14); A.noise(o, t, 0.1, 0.08, { f: 3000, f1: 800, q: 2 }); };
S.rack = (A, o, t, r) => { A.osc(o, 'square', 660 * r, 660 * r, t, 0.05, 0.1, { filter: { type: 'lowpass', f: 3000 } }); A.osc(o, 'square', 990 * r, 990 * r, t + 0.07, 0.07, 0.1, { filter: { type: 'lowpass', f: 3000 } }); A.osc(o, 'sine', 120 * r, 60, t, 0.14, 0.4); };
S.scan = (A, o, t) => { A.osc(o, 'square', 1200, 1200, t, 0.04, 0.12, { filter: { type: 'lowpass', f: 4000 } }); };
S.scan_done = (A, o, t) => { for (const [f, d] of [[880, 0], [1175, 0.07], [1760, 0.14]]) A.osc(o, 'square', f, f, t + d, 0.08, 0.13, { filter: { type: 'lowpass', f: 4000 } }); };
S.beep = (A, o, t, r) => A.osc(o, 'square', 880 * r, 880 * r, t, 0.08, 0.15, { filter: { type: 'lowpass', f: 3500 } });
S.boop = (A, o, t, r) => A.osc(o, 'square', 440 * r, 440 * r, t, 0.1, 0.15, { filter: { type: 'lowpass', f: 2500 } });
S.error = (A, o, t) => { A.osc(o, 'square', 220, 220, t, 0.12, 0.15); A.osc(o, 'square', 165, 165, t + 0.14, 0.18, 0.15); };
S.degauss = (A, o, t) => { A.osc(o, 'sine', 70, 50, t, 0.9, 0.9, { vibrato: [12, 25] }); A.noise(o, t, 0.08, 0.5, { f: 800, q: 1 }); A.osc(o, 'sine', 15700, 15700, t + 0.1, 1.5, 0.02); };
S.crt_on = (A, o, t) => { A.noise(o, t, 0.05, 0.4, { f: 3000 }); A.osc(o, 'sine', 50, 50, t, 0.5, 0.4); A.osc(o, 'sine', 15600, 15600, t, 2, 0.015, { a: 0.3 }); };
S.switch = (A, o, t, r) => { A.noise(o, t, 0.015, 0.7, { f: 3500 * r, q: 3 }); A.osc(o, 'square', 200, 120, t, 0.02, 0.3); };
S.spark = (A, o, t) => { for (let i = 0; i < 8; i++) A.noise(o, t + Math.random() * 0.25, 0.01, 0.6, { f: 4000 + Math.random() * 4000, type: 'highpass' }); A.osc(o, 'sawtooth', 120, 120, t, 0.25, 0.08, { filter: { type: 'bandpass', f: 2400, q: 6 } }); };
S.zap = (A, o, t) => { A.osc(o, 'sawtooth', 2000, 80, t, 0.35, 0.4, { filter: { type: 'bandpass', f: 1500, q: 1 } }); A.noise(o, t, 0.3, 0.5, { f: 3000, q: 0.7 }); };
S.horn = (A, o, t) => { for (const d of [0, 0.32]) { A.osc(o, 'square', 330, 330, t + d, 0.22, 0.2, { hold: 0.05, filter: { type: 'lowpass', f: 1800 } }); A.osc(o, 'square', 415, 415, t + d, 0.22, 0.18, { hold: 0.05, filter: { type: 'lowpass', f: 1800 } }); } };
S.door_open = (A, o, t) => { A.osc(o, 'sawtooth', 220, 330, t, 0.35, 0.12, { filter: { type: 'bandpass', f: 1200, q: 5 } }); A.noise(o, t + 0.3, 0.08, 0.6, { f: 1500 }); };
S.door_slam = (A, o, t) => { A.osc(o, 'sine', 120, 50, t, 0.2, 1); A.noise(o, t, 0.15, 0.8, { f: 900, q: 0.6 }); A.osc(o, 'sine', 1200, 1100, t, 0.3, 0.06); };
S.van_slide = (A, o, t) => { A.noise(o, t, 0.6, 0.6, { f: 600, f1: 1400, q: 2, a: 0.05 }); A.osc(o, 'sine', 100, 60, t + 0.6, 0.15, 0.9); };
S.engine_start = (A, o, t) => { for (let i = 0; i < 4; i++) { A.osc(o, 'sawtooth', 60, 70, t + i * 0.18, 0.12, 0.35, { filter: { type: 'lowpass', f: 400 } }); } A.osc(o, 'sawtooth', 40, 90, t + 0.8, 0.6, 0.5, { filter: { type: 'lowpass', f: 500 } }); };
S.engine_fail = (A, o, t) => { for (let i = 0; i < 5; i++) A.osc(o, 'sawtooth', 55, 50, t + i * 0.2, 0.12, 0.35, { filter: { type: 'lowpass', f: 350 } }); A.noise(o, t + 1, 0.4, 0.3, { f: 300, type: 'lowpass' }); };
S.ratchet = (A, o, t, r) => { for (let i = 0; i < 5; i++) A.noise(o, t + i * 0.05, 0.015, 0.5, { f: 3000 * r, q: 4 }); };
S.wrench = (A, o, t, r) => { A.osc(o, 'sine', 1400 * r, 1300, t, 0.15, 0.18); A.noise(o, t, 0.04, 0.4, { f: 2500, q: 2 }); };
S.time_charge = (A, o, t) => { A.osc(o, 'sawtooth', 60, 900, t, 3, 0.25, { a: 0.5, filter: { type: 'lowpass', f: 2000 } }); A.osc(o, 'sine', 120, 1800, t, 3, 0.25, { a: 0.5 }); };
S.time_boom = (A, o, t) => { A.noise(o, t, 2.5, 1.5, { color: 'brown', type: 'lowpass', f: 800, f1: 100 }); A.osc(o, 'sine', 400, 30, t, 2, 1.2); for (const f of [523, 659, 784, 1046]) A.osc(o, 'triangle', f, f * 2, t, 1.5, 0.15); };
// creatures
S.roar = (A, o, t, r) => { const d = 1.6; A.osc(o, 'sawtooth', 95 * r, 62 * r, t, d, 0.6, { a: 0.12, filter: { type: 'bandpass', f: 420, q: 1.8 }, vibrato: [9, 6] }); A.osc(o, 'sawtooth', 142 * r, 88 * r, t, d, 0.35, { a: 0.15, filter: { type: 'bandpass', f: 1100, q: 3 }, vibrato: [7, 9] }); A.noise(o, t, d, 0.7, { color: 'pink', f: 700, q: 0.8, a: 0.15 }); A.osc(o, 'sine', 45, 35, t, d, 0.6, { a: 0.2 }); };
S.gasp = (A, o, t, r) => { A.noise(o, t, 0.45, 0.6, { color: 'pink', f: 900 * r, f1: 2600 * r, q: 1.6, a: 0.04 }); A.noise(o, t + 0.5, 0.3, 0.3, { color: 'pink', f: 1400 * r, f1: 700 * r, q: 1.2 }); };
S.baa = (A, o, t, r) => { const d = 0.75; A.osc(o, 'sawtooth', 360 * r, 330 * r, t, d, 0.32, { a: 0.04, filter: { type: 'bandpass', f: 1100, q: 2.4 }, vibrato: [7.5, 22] }); A.osc(o, 'square', 720 * r, 660 * r, t, d, 0.06, { a: 0.04, filter: { type: 'bandpass', f: 2400, q: 3 }, vibrato: [7.5, 40] }); };
S.puff = (A, o, t, r) => { A.noise(o, t, 0.35, 0.7, { color: 'pink', f: 400 * r, f1: 2400 * r, q: 0.8, a: 0.02 }); A.osc(o, 'sine', 140 * r, 320 * r, t, 0.25, 0.35); };
S.howl = (A, o, t, r) => { A.osc(o, 'sine', 420 * r, 760 * r, t, 0.7, 0.3, { a: 0.15, vibrato: [5, 12], sweepFrac: 0.6 }); A.osc(o, 'sine', 760 * r, 520 * r, t + 0.7, 0.9, 0.3, { vibrato: [5, 14] }); A.osc(o, 'triangle', 840 * r, 1500 * r, t, 0.7, 0.06, { a: 0.15 }); };
S.yip = (A, o, t, r) => { for (let i = 0; i < 2; i++) A.osc(o, 'sawtooth', 900 * r, 1400 * r, t + i * 0.12, 0.08, 0.18, { filter: { type: 'bandpass', f: 1800, q: 2 } }); };
S.growl = (A, o, t, r) => { A.osc(o, 'sawtooth', 70 * r, 60 * r, t, 0.9, 0.4, { a: 0.1, filter: { type: 'lowpass', f: 500 }, vibrato: [18, 6] }); A.noise(o, t, 0.9, 0.3, { color: 'brown', type: 'lowpass', f: 400, a: 0.1 }); };
S.honk = (A, o, t, r) => { A.osc(o, 'sawtooth', 150 * r, 140 * r, t, 0.9, 0.45, { a: 0.06, hold: 0.25, filter: { type: 'bandpass', f: 620, q: 3 } }); A.osc(o, 'square', 300 * r, 290 * r, t, 0.9, 0.12, { a: 0.06, hold: 0.25, filter: { type: 'bandpass', f: 1200, q: 4 } }); };
S.chirp = (A, o, t, r) => { for (let i = 0; i < 3; i++) A.osc(o, 'sine', 2200 * r, 3300 * r, t + i * 0.09, 0.05, 0.25); };
S.squeak = (A, o, t, r) => A.osc(o, 'square', 1500 * r, 2400 * r, t, 0.12, 0.15, { filter: { type: 'lowpass', f: 4000 } });
S.screech = (A, o, t, r) => { A.osc(o, 'sawtooth', 900 * r, 1500 * r, t, 0.5, 0.25, { a: 0.03, filter: { type: 'bandpass', f: 2000, q: 2 }, vibrato: [30, 60] }); A.noise(o, t, 0.4, 0.2, { f: 3000, q: 1 }); };
S.hiss = (A, o, t, r) => A.noise(o, t, 0.6, 0.4, { f: 5000 * r, type: 'highpass', a: 0.05 });
S.squawk = (A, o, t, r) => { A.osc(o, 'sawtooth', 600 * r, 850 * r, t, 0.35, 0.3, { filter: { type: 'bandpass', f: 1400, q: 2 }, vibrato: [25, 40] }); };
S.bellow = (A, o, t, r) => { A.osc(o, 'sawtooth', 48 * r, 40 * r, t, 2.4, 0.6, { a: 0.4, filter: { type: 'lowpass', f: 300 } }); A.osc(o, 'sine', 96 * r, 80 * r, t, 2.4, 0.3, { a: 0.4 }); };
S.grunt = (A, o, t, r) => A.osc(o, 'sawtooth', 120 * r, 85 * r, t, 0.25, 0.4, { filter: { type: 'bandpass', f: 500, q: 2 } });
S.snore = (A, o, t, r) => { A.noise(o, t, 1.0, 0.25, { color: 'pink', f: 350 * r, q: 2, a: 0.4 }); };
S.bite = (A, o, t, r) => { A.noise(o, t, 0.05, 0.9, { f: 1800, q: 1 }); A.osc(o, 'sine', 160, 60, t, 0.08, 0.8); };
S.tailwhip = (A, o, t) => { A.noise(o, t, 0.25, 0.5, { f: 500, f1: 2400, q: 2 }); A.osc(o, 'sine', 90, 45, t + 0.22, 0.15, 1); };
S.happy_dino = (A, o, t, r) => { A.osc(o, 'triangle', 600 * r, 900 * r, t, 0.12, 0.3); A.osc(o, 'triangle', 900 * r, 1200 * r, t + 0.12, 0.15, 0.3); };
S.eat_dino = (A, o, t, r) => { for (let i = 0; i < 4; i++) A.noise(o, t + i * 0.16, 0.08, 0.5, { f: 700 * r + Math.random() * 300, q: 1.4 }); };
S.critter = (A, o, t, r) => { const f = 1800 + Math.random() * 1500; for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) A.osc(o, 'sine', f * r, f * 1.4 * r, t + i * 0.13, 0.07, 0.15); };
S.frog = (A, o, t, r) => { for (let i = 0; i < 2; i++) A.osc(o, 'square', 140 * r, 120 * r, t + i * 0.2, 0.09, 0.15, { filter: { type: 'lowpass', f: 900 } }); };
S.owlbeast = (A, o, t, r) => { A.osc(o, 'sine', 380 * r, 340 * r, t, 0.5, 0.2, { a: 0.1 }); A.osc(o, 'sine', 380 * r, 300 * r, t + 0.7, 0.6, 0.18, { a: 0.1 }); };
S.distant_honk = (A, o, t, r) => S.honk(A, o, t, r * 0.9);
S.distant_roar = (A, o, t, r) => S.roar(A, o, t, r * 0.85);
S.bonk = (A, o, t, r) => { A.osc(o, 'sine', 600 * r, 300 * r, t, 0.1, 0.5); A.osc(o, 'square', 1200 * r, 900, t, 0.05, 0.1); A.noise(o, t, 0.05, 0.5, { f: 1200, q: 1 }); };
S.ko = (A, o, t) => { for (const [f, d] of [[880, 0], [660, 0.12], [440, 0.24], [330, 0.4]]) A.osc(o, 'triangle', f, f * 0.95, t + d, 0.2, 0.25); };
S.bola = (A, o, t) => { for (let i = 0; i < 4; i++) A.noise(o, t + i * 0.09, 0.07, 0.4, { f: 700 + i * 150, q: 2 }); };
S.dart = (A, o, t) => { A.noise(o, t, 0.08, 0.6, { f: 1800, q: 1.2, f1: 900 }); A.osc(o, 'sine', 900, 500, t, 0.05, 0.15); };
S.rifle = (A, o, t) => { A.noise(o, t, 0.25, 1, { f: 900, q: 0.5, f1: 200 }); A.osc(o, 'sine', 160, 40, t, 0.2, 1); };
S.whistle = (A, o, t) => { A.osc(o, 'sine', 1900, 2300, t, 0.15, 0.3, { vibrato: [30, 40] }); A.osc(o, 'sine', 2300, 1700, t + 0.18, 0.2, 0.3, { vibrato: [30, 40] }); };
S.build = (A, o, t, r) => { A.osc(o, 'sine', 180 * r, 90, t, 0.12, 0.9); A.noise(o, t, 0.08, 0.6, { f: 1500 * r, q: 1 }); A.noise(o, t + 0.12, 0.04, 0.4, { f: 2500, q: 2 }); };
S.build_fail = (A, o, t) => A.osc(o, 'square', 180, 140, t, 0.15, 0.15);
S.demolish = (A, o, t) => { A.noise(o, t, 0.5, 0.9, { f: 1200, q: 0.5, f1: 300 }); A.osc(o, 'sine', 120, 40, t, 0.3, 0.9); };
S.sleep = (A, o, t) => { for (const [f, d] of [[392, 0], [329.6, 0.4], [261.6, 0.8]]) A.osc(o, 'sine', f, f, t + d, 0.6, 0.18, { a: 0.05 }); };
S.rooster = (A, o, t) => S.jingleDawn?.(A, o, t);
S.revive = (A, o, t) => { for (const [f, d] of [[523, 0], [659, 0.1], [784, 0.2], [1046, 0.3]]) A.osc(o, 'sine', f, f, t + d, 0.25, 0.22); };
S.downed = (A, o, t) => { for (const [f, d] of [[440, 0], [415, 0.25], [392, 0.5], [370, 0.75]]) A.osc(o, 'triangle', f, f * 0.97, t + d, 0.3, 0.25); };
S.coffee = (A, o, t) => { A.noise(o, t, 1.4, 0.35, { f: 900, q: 3, a: 0.2 }); for (let i = 0; i < 6; i++) A.osc(o, 'sine', 400 + Math.random() * 300, 200, t + 0.2 + i * 0.18, 0.08, 0.2); };
const SOUNDS = S;
export { SOUNDS };
