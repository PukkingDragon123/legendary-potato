// Continuous van sounds: engine (rpm-driven saw stack with firing pulses),
// hand-crank dynamo whirr, CRT hum and the dashboard radio, which plays
// procedurally composed 80s synth-pop through an "AM radio" filter chain.
import { RNG } from '../core/rng.js';

export const STATIONS = [
  { name: 'K-REX 66.6', tempo: 112, key: 0, style: 'pop' },
  { name: 'JURASSIC JAMS', tempo: 96, key: 5, style: 'funk' },
  { name: 'LATE CRETACEOUS', tempo: 78, key: 9, style: 'slow' },
  { name: 'STATIC FM', tempo: 60, key: 2, style: 'static' },
];
const PROG = [[0, 7, 9, 5], [9, 5, 0, 7], [0, 5, 7, 5], [2, 7, 0, 9], [0, 9, 5, 7]];
const MAJ = [0, 2, 4, 5, 7, 9, 11];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class VanAudio {
  constructor(game) { this.g = game; this.ok = false; this.station = -1; this.song = null; this.radioGain = 0; }
  get A() { return this.g.audio; }
  ensure() {
    const A = this.A;
    if (this.ok) return true;
    if (!A?.ready) return false;
    const c = A.ctx;
    const pan = (ref = 4) => { const p = c.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 1.2; p.maxDistance = 300; p.connect(A.bus.sfx); return p; };
    // ---------------- engine
    this.engPan = pan(5);
    this.eng = c.createGain(); this.eng.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 2;
    this.engLP = lp;
    const am = c.createGain(); am.gain.value = 0.6; // firing pulses modulate this
    this.engAM = am;
    const o1 = c.createOscillator(); o1.type = 'sawtooth';
    const o2 = c.createOscillator(); o2.type = 'square'; o2.detune.value = -1200;
    const o3 = c.createOscillator(); o3.type = 'sawtooth'; o3.detune.value = 9;
    const g1 = c.createGain(); g1.gain.value = 0.35; const g2 = c.createGain(); g2.gain.value = 0.25; const g3 = c.createGain(); g3.gain.value = 0.25;
    o1.connect(g1).connect(am); o2.connect(g2).connect(am); o3.connect(g3).connect(am);
    const lfo = c.createOscillator(); lfo.type = 'square';
    const lfoG = c.createGain(); lfoG.gain.value = 0.4;
    lfo.connect(lfoG).connect(am.gain);
    this.engOsc = [o1, o2, o3]; this.engLfo = lfo;
    // rumble noise
    const ns = c.createBufferSource(); ns.buffer = A.brown; ns.loop = true;
    const ng = c.createGain(); ng.gain.value = 0.5; ns.connect(ng).connect(am);
    this.engNoise = ng;
    am.connect(lp).connect(this.eng).connect(this.engPan);
    for (const o of [o1, o2, o3, lfo]) o.start();
    ns.start();
    // ---------------- crank dynamo whirr
    this.crankPan = pan(3);
    this.crank = c.createGain(); this.crank.gain.value = 0;
    const co = c.createOscillator(); co.type = 'sawtooth'; co.frequency.value = 80;
    const cbp = c.createBiquadFilter(); cbp.type = 'bandpass'; cbp.frequency.value = 900; cbp.Q.value = 3;
    co.connect(cbp).connect(this.crank).connect(this.crankPan);
    co.start();
    this.crankOsc = co; this.crankBP = cbp;
    // ---------------- CRT hum + whine
    this.humPan = pan(2);
    this.hum = c.createGain(); this.hum.gain.value = 0;
    const h1 = c.createOscillator(); h1.frequency.value = 60; const h2 = c.createOscillator(); h2.frequency.value = 120; h2.type = 'triangle';
    const hw = c.createOscillator(); hw.frequency.value = 7860;
    const hwG = c.createGain(); hwG.gain.value = 0.04;
    const hG = c.createGain(); hG.gain.value = 0.5;
    h1.connect(hG); h2.connect(hG); hw.connect(hwG).connect(this.hum); hG.connect(this.hum);
    this.hum.connect(this.humPan);
    for (const o of [h1, h2, hw]) o.start();
    // ---------------- radio: music bus -> AM filter -> panner
    this.radPan = pan(3);
    this.radio = c.createGain(); this.radio.gain.value = 0;
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.2) * 0.8; }
    shaper.curve = curve;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280;
    const rl = c.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 3600;
    const peak = c.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 1500; peak.gain.value = 5;
    this.radIn = c.createGain(); this.radIn.gain.value = 0.5;
    this.radIn.connect(shaper).connect(hp).connect(peak).connect(rl).connect(this.radio).connect(this.radPan);
    // static layer
    const st = c.createBufferSource(); st.buffer = A.white; st.loop = true;
    const stF = c.createBiquadFilter(); stF.type = 'bandpass'; stF.frequency.value = 2400; stF.Q.value = 0.6;
    this.staticG = c.createGain(); this.staticG.gain.value = 0.0;
    st.connect(stF).connect(this.staticG).connect(this.radio);
    st.start();
    this.ok = true;
    this.nextT = 0;
    return true;
  }

  setPos(p, which = 'all') {
    if (!this.ok) return;
    const t = this.A.ctx.currentTime;
    const set = (pn, q) => { pn.positionX.setTargetAtTime(q.x, t, 0.03); pn.positionY.setTargetAtTime(q.y, t, 0.03); pn.positionZ.setTargetAtTime(q.z, t, 0.03); };
    if (which === 'all' || which === 'engine') set(this.engPan, p.engine ?? p);
    if (which === 'all' || which === 'crank') set(this.crankPan, p.crank ?? p);
    if (which === 'all' || which === 'hum') set(this.humPan, p.hum ?? p);
    if (which === 'all' || which === 'radio') set(this.radPan, p.radio ?? p);
  }

  // rpm 0..1 (0 = off), load 0..1, sputter 0..1
  engine(on, rpm, load, sputter = 0) {
    if (!this.ensure()) return;
    const t = this.A.ctx.currentTime;
    const f = 22 + rpm * 95;
    for (const [i, o] of this.engOsc.entries()) o.frequency.setTargetAtTime(f * (i === 2 ? 1.005 : 1), t, 0.08);
    this.engLfo.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.engLP.frequency.setTargetAtTime(220 + rpm * 900 + load * 500, t, 0.1);
    let v = on ? 0.22 + rpm * 0.25 + load * 0.15 : 0;
    if (sputter > 0 && Math.random() < sputter * 0.5) v *= 0.15;
    this.eng.gain.setTargetAtTime(v, t, on ? 0.05 : 0.25);
  }
  crankSpeed(s) {
    if (!this.ensure()) return;
    const t = this.A.ctx.currentTime;
    this.crankOsc.frequency.setTargetAtTime(50 + s * 260, t, 0.06);
    this.crankBP.frequency.setTargetAtTime(500 + s * 1500, t, 0.06);
    this.crank.gain.setTargetAtTime(s > 0.02 ? 0.12 + s * 0.12 : 0, t, 0.08);
  }
  humLevel(v) { if (!this.ensure()) return; this.hum.gain.setTargetAtTime(v * 0.05, this.A.ctx.currentTime, 0.3); }

  // ---------------------------------------------------------------- radio
  tune(i) {
    if (!this.ensure()) return;
    const c = this.A.ctx, t = c.currentTime;
    this.station = i;
    if (i < 0) { this.radio.gain.setTargetAtTime(0, t, 0.05); this.song = null; return; }
    // tuning sweep burst
    this.staticG.gain.cancelScheduledValues(t);
    this.staticG.gain.setValueAtTime(0.35, t);
    this.staticG.gain.setTargetAtTime(STATIONS[i].style === 'static' ? 0.16 : 0.012, t + 0.4, 0.15);
    this.radio.gain.setTargetAtTime(0.55, t, 0.05);
    this.newSong(t + 0.6);
  }
  newSong(t0) {
    const st = STATIONS[this.station];
    const seed = Math.floor(Math.random() * 1e9);
    const r = new RNG(seed);
    const prog = r.pick(PROG);
    const root = 48 + st.key + r.int(-2, 2);
    const mel = [];
    // a 2-bar motif, repeated with variation
    for (let i = 0; i < 16; i++) mel.push(r.chance(0.62) ? r.pick([0, 2, 4, 4, 7, 9, 7, 11]) : null);
    this.song = { st, r, prog, root, mel, bar: 0, step: 0, t: t0, bars: 24 + r.int(0, 8) * 2, beat: 60 / (st.tempo + r.int(-6, 6)) / 2, swing: st.style === 'funk' ? 0.12 : 0 };
  }
  update() {
    if (!this.ok || !this.song) return;
    const c = this.A.ctx;
    const S = this.song;
    while (S.t < c.currentTime + 0.25) {
      this.scheduleStep(S, S.t);
      const sw = S.step % 2 === 1 ? S.swing : -S.swing;
      S.t += S.beat * (1 + sw);
      S.step++;
      if (S.step >= 8) { S.step = 0; S.bar++; }
      if (S.bar >= S.bars) { this.dj(S.t); this.newSong(S.t + 1.6); return; }
    }
  }
  dj(t) {
    // static chirp + "wub" station ident between songs
    const A = this.A;
    A.noise(this.radIn, t, 0.6, 0.5, { f: 2000, q: 0.5 });
    A.osc(this.radIn, 'square', 880, 1320, t + 0.7, 0.12, 0.3);
    A.osc(this.radIn, 'square', 1320, 660, t + 0.85, 0.18, 0.3);
  }
  scheduleStep(S, t) {
    const A = this.A, out = this.radIn, st = S.st;
    if (st.style === 'static') {
      // eerie whale-ish tones in the hiss
      if (S.step === 0 && S.bar % 2 === 0) A.osc(out, 'sine', mtof(S.root + 24 + S.r.pick([0, 3, 7, 10])), mtof(S.root + 22), t, 2.2, 0.25, { a: 0.6 });
      return;
    }
    const chord = S.prog[Math.floor(S.bar / 2) % 4];
    const rootN = S.root + chord;
    const third = MAJ.includes((chord + 4) % 12) ? 4 : 3;
    const beatInBar = S.step;
    const intro = S.bar < 2, outro = S.bar >= S.bars - 2;
    // drums
    if (!intro || S.bar === 1) {
      if (beatInBar % 4 === 0 || (st.style === 'funk' && beatInBar === 3)) { A.osc(out, 'sine', 140, 45, t, 0.18, 0.9, { sweepFrac: 0.6 }); }
      if (beatInBar === 2 || beatInBar === 6) A.noise(out, t, 0.12, 0.45, { type: 'bandpass', f: 1800, q: 0.8 });
      if (st.style !== 'slow' || beatInBar % 2 === 0) A.noise(out, t, 0.03, 0.18, { type: 'highpass', f: 7000 });
    }
    // bass (8ths, octave pops)
    if (!outro || beatInBar < 4) {
      const bn = rootN - 12 + (beatInBar % 4 === 3 ? 12 : 0);
      A.osc(out, st.style === 'slow' ? 'triangle' : 'square', mtof(bn), mtof(bn), t, S.beat * 0.8, 0.22, { filter: { type: 'lowpass', f: 600 } });
    }
    // pad chord on bar start
    if (beatInBar === 0) for (const iv of [0, third, 7]) A.osc(out, 'sawtooth', mtof(rootN + 12 + iv), mtof(rootN + 12 + iv), t, S.beat * 7, 0.05, { a: 0.08, filter: { type: 'lowpass', f: 1400 } });
    // lead melody (motif over chords, skip the intro)
    if (!intro) {
      const m = S.mel[(S.bar % 2) * 8 + beatInBar];
      if (m !== null && m !== undefined) {
        const note = S.root + 24 + chord + m - (m > 7 && chord > 5 ? 12 : 0);
        A.osc(out, 'square', mtof(note), mtof(note), t, S.beat * 0.9, 0.12, { vibrato: [5.5, 4], filter: { type: 'lowpass', f: 2600 } });
      }
    }
  }
  stopAll() {
    if (!this.ok) return;
    const t = this.A.ctx.currentTime;
    for (const g of [this.eng, this.crank, this.hum, this.radio]) g.gain.setTargetAtTime(0, t, 0.1);
    this.song = null;
  }
}
