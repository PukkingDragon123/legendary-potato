// Proximity voice chat: WebRTC mesh between all players (signalled through
// the game server), each friend's voice positioned in 3D at their head with
// distance falloff. Holding a walkie-talkie sends your voice island-wide with
// a crunchy radio filter. Push-to-talk (V) by default; mouths move with the
// audio level.
import * as THREE from 'three';

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

export class Voice {
  constructor(game, net) {
    this.g = game; this.net = net;
    this.peers = new Map(); // id -> { pc, audio, src, panner, gain, radio, analyser, buf }
    this.mic = null; this.micTrack = null; this.enabled = false; this.talking = false;
    this.level = 0;
    this._v = new THREE.Vector3();
  }
  get ctx() { return this.g.audio?.ctx; }
  async ensureMic() {
    if (this.mic) return true;
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      this.micTrack = this.mic.getAudioTracks()[0];
      this.micTrack.enabled = false;
      // local level meter for our own talking animation
      if (this.ctx) { const s = this.ctx.createMediaStreamSource(this.mic); this.micAn = this.ctx.createAnalyser(); this.micAn.fftSize = 512; s.connect(this.micAn); this.micBuf = new Uint8Array(this.micAn.fftSize); }
      for (const [id, P] of this.peers) { P.pc.addTrack(this.micTrack, this.mic); this.renegotiate(id); }
      return true;
    } catch (e) {
      this.g.ui?.toast('Microphone not available: ' + (e.message ?? e), 'warn');
      this.micDenied = true;
      return false;
    }
  }
  // the newer player calls everyone already in the room
  connectTo(id) { if (!this.peers.has(id)) this.makePeer(id, true); }
  makePeer(id, initiator) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const P = { pc, id, initiator };
    this.peers.set(id, P);
    if (this.micTrack) pc.addTrack(this.micTrack, this.mic);
    pc.onicecandidate = (e) => { if (e.candidate) this.net.sendTo(id, 'rtc', { ice: e.candidate }); };
    pc.ontrack = (e) => this.attach(P, e.streams[0]);
    pc.onnegotiationneeded = () => { if (P.initiator || P.ready) this.renegotiate(id); };
    if (initiator) this.renegotiate(id);
    return P;
  }
  async renegotiate(id) {
    const P = this.peers.get(id);
    if (!P) return;
    try { const offer = await P.pc.createOffer(); await P.pc.setLocalDescription(offer); this.net.sendTo(id, 'rtc', { sdp: P.pc.localDescription }); } catch (e) { console.warn('rtc offer', e); }
  }
  async onSignal(from, d) {
    let P = this.peers.get(from);
    if (!P) P = this.makePeer(from, false);
    try {
      if (d.sdp) {
        await P.pc.setRemoteDescription(d.sdp);
        if (d.sdp.type === 'offer') { const ans = await P.pc.createAnswer(); await P.pc.setLocalDescription(ans); this.net.sendTo(from, 'rtc', { sdp: P.pc.localDescription }); }
        P.ready = true;
      } else if (d.ice) await P.pc.addIceCandidate(d.ice);
    } catch (e) { console.warn('rtc signal', e); }
  }
  attach(P, stream) {
    const ctx = this.ctx;
    if (!ctx || P.src) return;
    // Chrome only feeds WebRTC audio into WebAudio when it is also attached to an element
    P.audio = document.createElement('audio'); P.audio.srcObject = stream; P.audio.muted = true; P.audio.play().catch(() => {});
    P.src = ctx.createMediaStreamSource(stream);
    P.analyser = ctx.createAnalyser(); P.analyser.fftSize = 512; P.buf = new Uint8Array(P.analyser.fftSize);
    P.panner = ctx.createPanner(); P.panner.panningModel = 'HRTF'; P.panner.distanceModel = 'inverse'; P.panner.refDistance = 3; P.panner.rolloffFactor = 1.6; P.panner.maxDistance = 60;
    P.gain = ctx.createGain();
    // radio path for walkie-talkies
    P.radio = ctx.createGain(); P.radio.gain.value = 0;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 1.2;
    const sh = ctx.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3); } sh.curve = curve;
    P.src.connect(P.analyser);
    P.src.connect(P.gain).connect(P.panner).connect(this.g.audio.bus.voice);
    P.src.connect(bp).connect(sh).connect(P.radio).connect(this.g.audio.bus.voice);
  }
  drop(id) { const P = this.peers.get(id); if (!P) return; try { P.pc.close(); } catch { /* ignore */ } P.audio?.remove?.(); this.peers.delete(id); }
  close() { for (const id of [...this.peers.keys()]) this.drop(id); if (this.mic) for (const t of this.mic.getTracks()) t.stop(); this.mic = null; }
  update(dt) {
    const g = this.g, inp = g.input;
    // connect to every remote player we know about (lower id initiates to avoid glare)
    for (const p of g.players.values()) if (!p.local && !this.peers.has(p.id) && String(g.local.id) > String(p.id)) this.connectTo(p.id);
    const ptt = g.settings?.pushToTalk !== false;
    const want = ptt ? inp.down('voice') && !g.ui?.chatInput : true;
    if (want && !this.mic && !this.micDenied && !this._asking) { this._asking = true; this.ensureMic().finally(() => (this._asking = false)); }
    if (this.micTrack) this.micTrack.enabled = want;
    this.talking = want && !!this.micTrack;
    // our own mouth
    if (this.micAn && this.talking) { this.micAn.getByteTimeDomainData(this.micBuf); let s = 0; for (const v of this.micBuf) s += ((v - 128) / 128) ** 2; this.level = Math.sqrt(s / this.micBuf.length); g.local.talk = Math.min(1, this.level * 6); }
    else if (this.micAn && !g.local.talk) g.local.talk = 0;
    // position remote voices + walkie radio + lip flap
    const t = this.ctx?.currentTime ?? 0;
    const meWalkie = g.inventory.count('walkie') > 0;
    for (const [id, P] of this.peers) {
      const p = g.players.get(id);
      if (!p || !P.panner) continue;
      p.headPos(this._v);
      P.panner.positionX.setTargetAtTime(this._v.x, t, 0.05); P.panner.positionY.setTargetAtTime(this._v.y, t, 0.05); P.panner.positionZ.setTargetAtTime(this._v.z, t, 0.05);
      const radio = p.walkie && meWalkie;
      P.radio.gain.setTargetAtTime(radio ? 0.9 : 0, t, 0.05);
      P.gain.gain.setTargetAtTime(radio ? 0.25 : 1, t, 0.05);
      P.analyser.getByteTimeDomainData(P.buf);
      let s = 0; for (const v of P.buf) s += ((v - 128) / 128) ** 2;
      const lvl = Math.sqrt(s / P.buf.length);
      p.talk = Math.min(1, lvl * 6);
      p.voiceT = lvl > 0.02 ? 0.5 : Math.max(0, (p.voiceT ?? 0) - dt);
    }
  }
}
