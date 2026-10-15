// Procedural animation for the sculpted creatures. A gait system moves each
// foot through stance and swing (walk, trot, gallop, pronk, biped walk/run,
// hop) and plants it on the terrain with two-bone IK plus a level foot; the
// body bobs, rolls, leans into turns and follows slopes; the neck and head
// look at things and stay steady; springs give ears, tails, cheeks and fluff
// their follow-through. A face layer blends expressions into the shader eyes
// (lids, gaze, pupils, cartoon marks), the jaw, tongue, ears and blush.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _k = new THREE.Vector3(), _a = new THREE.Vector3(), _t = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _e = new THREE.Euler();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sstep = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const fract = (x) => x - Math.floor(x);
const angWrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));

// ---------------------------------------------------------------- faces
// top/bot: lid edge heights (eye-space y), tilt: angry slant, curve: lid arc,
// pupil: size, mode: 0 open 1 happy 2 asleep 3 X 4 swirl 5 heart 6 squeeze,
// jaw: 0..1, ears: -1 back/down .. 1 up, blush, tongue
const N = { top: 0.84, bot: -0.86, tilt: 0, curve: 0.16, pupil: 1, mode: 0, jaw: 0, ears: 0, blush: 0, tongue: 0, look: 1 };
export const CREATURE_EXPR = {
  neutral: { ...N },
  content: { ...N, top: 0.52, bot: -0.7, curve: 0.12 },
  happy: { ...N, mode: 1, jaw: 0.3, ears: 0.35, blush: 1 },
  excited: { ...N, top: 1.0, bot: -0.9, pupil: 1.2, jaw: 0.55, ears: 0.8, blush: 0.6 },
  alert: { ...N, top: 0.98, bot: -0.88, pupil: 0.85, ears: 0.8 },
  scared: { ...N, top: 1.1, bot: -0.95, pupil: 0.5, tilt: -0.16, curve: 0.05, ears: -0.9, jaw: 0.22 },
  angry: { ...N, top: 0.42, bot: -0.66, tilt: 0.42, curve: 0.02, pupil: 0.72, ears: -0.45, jaw: 0.14 },
  rage: { ...N, top: 0.36, bot: -0.62, tilt: 0.55, pupil: 0.6, ears: -0.7, jaw: 0.75 },
  sus: { ...N, top: 0.32, bot: -0.42, tilt: 0.05, curve: 0.02, pupil: 0.9 },
  sleepy: { ...N, top: 0.02, bot: -0.55, tilt: -0.1, ears: -0.45 },
  sleep: { ...N, mode: 2, ears: -0.6 },
  ko: { ...N, mode: 4, jaw: 0.4, tongue: 1, ears: -1, look: 0 },
  dead: { ...N, mode: 3, jaw: 0.3, tongue: 0.8, ears: -1, look: 0 },
  hurt: { ...N, mode: 6, jaw: 0.35, ears: -0.7 },
  eat: { ...N, top: 0.4, bot: -0.66, curve: 0.1, ears: -0.1 },
  love: { ...N, mode: 5, jaw: 0.25, blush: 1, ears: 0.3 },
  roar: { ...N, top: 0.62, bot: -0.7, tilt: 0.32, pupil: 0.62, jaw: 1, ears: -0.6 },
  derp: { ...N, top: 0.9, bot: -0.85, pupil: 0.8, jaw: 0.35, tongue: 0.6, ears: 0.2 },
  yawn: { ...N, top: -0.02, bot: -0.3, jaw: 1, ears: -0.5 },
};
const FACE_KEYS = ['top', 'bot', 'tilt', 'curve', 'pupil', 'jaw', 'ears', 'blush', 'tongue', 'look'];

// ---------------------------------------------------------------- gaits (phase offsets per leg)
const GAITS = {
  walk: { HL: 0, FL: 0.25, HR: 0.5, FR: 0.75, duty: 0.66 },
  trot: { FL: 0, HR: 0, FR: 0.5, HL: 0.5, duty: 0.5 },
  gallop: { HL: 0, HR: 0.12, FL: 0.48, FR: 0.6, duty: 0.4 },
  pronk: { HL: 0, HR: 0.02, FL: 0.04, FR: 0.06, duty: 0.32 },
  bwalk: { L: 0, R: 0.5, duty: 0.62 },
  brun: { L: 0, R: 0.5, duty: 0.38 },
  hop: { L: 0, R: 0.02, duty: 0.38 },
  paddle: { HL: 0, FL: 0.5, HR: 0.5, FR: 0, L: 0, R: 0.5, duty: 0.5 },
};

// damped angular spring with sub-stepping
class Spring {
  constructor(k = 120, c = 12) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  step(target, dt, force = 0) {
    const n = Math.max(1, Math.ceil(dt / (1 / 90)));
    const h = dt / n;
    for (let i = 0; i < n; i++) { this.v += ((target - this.x) * this.k - this.v * this.c + force) * h; this.x += this.v * h; }
    return this.x;
  }
}

export class CreatureRig {
  constructor(rig, sp) {
    this.r = rig; this.sp = sp; this.D = rig.D;
    const D = this.D, A = D.anim;
    this.A = A;
    this.t = Math.random() * 10;
    this.phase = Math.random();
    this.speedS = 0; this.turn = 0; this.prevYaw = null; this.prevSpeed = 0;
    this.lie = 0; this.ko = 0; this.koSide = 1; this.puff = 0; this.lodNow = 0;
    this.face = { ...N }; this.expr = 'neutral'; this.exprHold = 0;
    this.mode = 0; this.modeK = 0; this.blink = 0; this.nextBlink = 1 + Math.random() * 3;
    this.idleT = 2 + Math.random() * 4; this.idleLook = { yaw: 0, pitch: 0 }; this.idleExpr = null; this.idleExprT = 0;
    this.lookYaw = 0; this.lookPitch = 0; this.jaw = 0; this.chew = 0; this.tongue = 0;
    this.base = {};
    for (const [k, b] of Object.entries(rig.bones)) this.base[k] = b.position.clone();
    // legs: rest data for IK
    this.legs = D.legs.map((l) => this.prepLeg(l));
    this.legLen = this.legs.length ? this.legs.reduce((a, l) => a + l.l1 + l.l2 + l.l3, 0) / this.legs.length : 0.5;
    this.gaitOff = {}; this.gaitName = null;
    // springs
    this.sp_tail = (D.roles.tail ?? []).map(() => ({ y: new Spring(70, 9), x: new Spring(70, 9) }));
    this.sp_ears = (D.roles.ears ?? []).map(() => ({ a: new Spring(160, 11), b: new Spring(160, 11) }));
    this.sp_jig = (D.springs ?? []).map(() => ({ x: new Spring(220, 10), z: new Spring(220, 10) }));
    this.sp_body = new Spring(90, 14);
    this.accF = 0; this.accL = 0; this.bobV = 0; this.prevBob = 0;
    this.restHipY = rig.bonePos[rig.idx[D.roles.hips ?? 'hips']]?.y ?? 0.5;
    this.wingT = 0; this.fold = 1;
    this.groundBias = 0; this.vy = 0; this.ay = 0; this.prevHipY = null;
  }
  prepLeg(l) {
    const R = this.r;
    const [nu, nl, nf] = l.bones;
    const P = (n) => R.bonePos[R.idx[n]].clone();
    const H0 = P(nu), K0 = P(nl), A0 = P(nf), T0 = new THREE.Vector3(...l.toe);
    const l1 = H0.distanceTo(K0), l2 = K0.distanceTo(A0), l3 = A0.distanceTo(T0);
    const bend = l.bend ?? (l.front ? -1 : 1);
    const r1 = K0.clone().sub(H0).normalize(), r2 = A0.clone().sub(K0).normalize(), r3 = T0.clone().sub(A0).normalize();
    const poleV = l.pole ? new THREE.Vector3(...l.pole) : new THREE.Vector3(l.side * 0.12, 0, -bend);
    const pole0 = poleV.clone(); pole0.addScaledVector(r1, -pole0.dot(r1)).normalize();
    const side0 = new THREE.Vector3().crossVectors(r1, pole0).normalize();
    const frame = (dir, side) => { const xs = side.clone().addScaledVector(dir, -side.dot(dir)).normalize(); const zs = new THREE.Vector3().crossVectors(xs, dir); return new THREE.Matrix4().makeBasis(xs, dir, zs); };
    const F1 = frame(r1, side0), F2 = frame(r2, side0), F3 = frame(r3, side0);
    const key = (l.front ? 'F' : 'H') + (l.side > 0 ? 'R' : 'L');
    const bkey = l.side > 0 ? 'R' : 'L';
    const parent = R.bones[nu].parent;
    return {
      ...l, nu, nl, nf, H0, K0, A0, T0, l1, l2, l3, bend, F1i: F1.clone().transpose(), F2i: F2.clone().transpose(), F3i: F3.clone().transpose(),
      foot0: T0.clone().sub(A0), key, bkey, parentName: parent.name, poleV,
      plant: new THREE.Vector3(), lift: 0, prevP: 0,
    };
  }

  // ======================================================================== frame
  // s: { speed, yaw, state, ai, action:{name,t}, look:{yaw,pitch}, alert, mood, swim, fly, glide,
  //      pitch, pos, scale, ground(x,z), puff, flash, lod, crouch, expr }
  update(dt, s) {
    dt = Math.min(0.1, Math.max(1e-4, dt));
    const R = this.r, B = R.bones, D = this.D, A = this.A, roles = D.roles;
    this.t += dt;
    const t = this.t;
    const st = s.state ?? 'idle';
    const dead = st === 'dead', ko = st === 'ko' || dead, sleeping = st === 'sleep' || this.forceSleep;
    const act = s.action;
    // ---- level of detail
    const lod = s.lod ?? 0;
    if (lod !== this.lodNow && R.lods.length > 1) { this.lodNow = lod; R.lods[0].visible = lod === 0; R.lods[1].visible = lod !== 0; }
    // ---- motion signals
    const speed = Math.abs(s.speed ?? 0);
    if (this.prevYaw === null) this.prevYaw = s.yaw ?? 0;
    const dyaw = angWrap((s.yaw ?? 0) - this.prevYaw); this.prevYaw = s.yaw ?? 0;
    this.turn += (clamp(dyaw / dt, -4, 4) - this.turn) * Math.min(1, dt * 6);
    this.speedS += (speed - this.speedS) * Math.min(1, dt * 8);
    const accF = (this.speedS - this.prevSpeed) / dt; this.prevSpeed = this.speedS;
    this.accF += (clamp(accF, -20, 20) - this.accF) * Math.min(1, dt * 10);
    this.accL += (clamp(this.speedS * this.turn, -20, 20) - this.accL) * Math.min(1, dt * 10);
    this.lie += ((sleeping || ko ? 1 : 0) - this.lie) * Math.min(1, dt * (ko ? 4 : 1.6));
    this.ko += ((ko ? 1 : 0) - this.ko) * Math.min(1, dt * 3.5);
    if (s.koSide) this.koSide = s.koSide;
    this.puff += (clamp(s.puff ?? 0, 0, 1) - this.puff) * Math.min(1, dt * ((s.puff ?? 0) > this.puff ? 7 : 1.5));
    // ---- face
    this.updateFace(dt, s, { dead, ko, sleeping, act });
    // ---- gait
    const walkV = this.sp.stats?.speed ?? 2, runV = this.sp.stats?.run ?? 6;
    const amp = clamp(this.speedS / Math.max(0.3, walkV * 0.35), 0, 1) * (1 - this.lie);
    const biped = !D.quad;
    let gname;
    if (s.swim) gname = 'paddle';
    else if (biped) gname = A.hop ? 'hop' : this.speedS > walkV * 1.35 ? 'brun' : 'bwalk';
    else if (this.puff > 0.5 && A.pronk) gname = 'pronk';
    else gname = this.speedS > runV * 0.72 ? 'gallop' : this.speedS > walkV * 1.25 ? 'trot' : 'walk';
    const G = GAITS[gname];
    if (this.gaitName === null) { for (const l of this.legs) this.gaitOff[l.key] = G[l.key] ?? G[l.bkey] ?? 0; this.gaitName = gname; this.duty = G.duty; }
    for (const l of this.legs) { const tgt = G[l.key] ?? G[l.bkey] ?? 0; const cur = this.gaitOff[l.key]; this.gaitOff[l.key] = cur + angWrap((tgt - cur) * Math.PI * 2) / (Math.PI * 2) * Math.min(1, dt * 5); }
    this.duty += (G.duty - this.duty) * Math.min(1, dt * 5);
    this.gaitName = gname;
    const duty = this.duty;
    const runK = clamp((this.speedS - walkV) / Math.max(0.5, runV - walkV), 0, 1);
    const sweep = this.legLen * (A.stride ?? 0.55) * (0.7 + runK * 0.9) * (s.swim ? 0.6 : 1);
    const cycle = sweep / Math.max(0.2, duty);
    if (amp > 0.01) this.phase = fract(this.phase + (this.speedS / Math.max(0.05, cycle)) * dt);
    const ph = this.phase;
    // ---- body
    const hipsN = roles.hips ?? 'hips';
    const hips = B[hipsN];
    hips.position.copy(this.base[hipsN]);
    hips.quaternion.identity();
    let bob = 0, pitchOsc = 0, roll = 0;
    if (gname === 'pronk' || gname === 'hop') {
      const p = fract(ph);
      if (p > duty) { const u = (p - duty) / (1 - duty); bob = Math.sin(Math.PI * u) * this.legLen * (gname === 'pronk' ? 0.55 : 0.4) * amp; }
      else bob = -Math.sin(Math.PI * (p / duty)) * this.legLen * 0.12 * amp;
      pitchOsc = gname === 'hop' ? Math.sin(ph * Math.PI * 2) * 0.12 * amp : 0;
    } else if (gname === 'gallop') {
      bob = Math.sin(ph * Math.PI * 2) * this.legLen * 0.1 * amp;
      pitchOsc = Math.cos(ph * Math.PI * 2) * 0.09 * amp;
    } else {
      bob = -Math.abs(Math.cos(ph * Math.PI * 2)) * this.legLen * (A.bob ?? 0.05) * amp * (1 + runK);
      roll = Math.sin(ph * Math.PI * 2) * (biped ? 0.06 : 0.035) * amp;
    }
    const bobVel = (bob - this.prevBob) / dt; this.prevBob = bob;
    this.bobV += (bobVel - this.bobV) * Math.min(1, dt * 12);
    // breathing
    const breathe = Math.sin(t * (sleeping ? 1.3 : 2.4)) * (sleeping ? 0.012 : 0.006) * this.restHipY;
    // lying down: sleep tucks, KO rolls onto its side
    const lieY = this.restHipY - Math.max(R.br * 0.9, this.legLen * 0.18);
    const koY = Math.max(R.br * 0.8, this.restHipY * 0.4);
    const lieDrop = (this.restHipY - lieY) * this.lie * (1 - this.ko) + (this.restHipY - koY) * this.ko;
    hips.position.y += bob + breathe - lieDrop + (s.swim ? -this.restHipY * 0.15 : 0) + this.puff * this.legLen * 0.18;
    hips.position.y += (s.crouch ?? 0) * -this.legLen * 0.25;
    // terrain: settle the body between the feet
    hips.position.y += this.groundBias * (1 - this.lie);
    // vertical velocity/acceleration of the body drive the jiggle
    if (this.prevHipY === null) this.prevHipY = hips.position.y;
    const vy = (hips.position.y - this.prevHipY) / dt; this.prevHipY = hips.position.y;
    this.ay += (clamp((vy - this.vy) / dt, -60, 60) - this.ay) * Math.min(1, dt * 20); this.vy = vy;
    const bodyPitch = clamp(s.pitch ?? 0, -0.6, 0.6) * (1 - this.lie) + pitchOsc;
    const lean = clamp(-this.turn * this.speedS * 0.025, -0.25, 0.25) * (1 - this.lie);
    _e.set(bodyPitch, 0, roll + lean + this.ko * 1.4 * this.koSide, 'YXZ');
    hips.quaternion.setFromEuler(_e);
    // spine bend into turns and with the gait
    const spineN = roles.spine ?? [];
    const bendY = clamp(this.turn * 0.12, -0.35, 0.35) * (1 - this.lie);
    for (const [i, n] of spineN.entries()) {
      const b = B[n]; b.position.copy(this.base[n]);
      _e.set(-pitchOsc * 0.6 + (s.swim ? Math.sin(t * 3 + i) * 0.05 : 0), bendY / Math.max(1, spineN.length) + Math.sin(ph * Math.PI * 2) * 0.02 * amp, 0);
      b.quaternion.setFromEuler(_e);
    }
    // ---- actions shape the neck/head/body
    let neckP = 0, headP = 0, headY = 0, headR = 0, jawAdd = 0, chestDrop = 0, bodyShake = 0, tailLift = 0, tailWag = 0, hop = 0, rear = 0, lunge = 0, twist = 0;
    if (act) {
      const p = clamp(act.t ?? 0, 0, 1), k = Math.sin(p * Math.PI);
      switch (act.name) {
        case 'eat': case 'drink': case 'eatcorpse': neckP = -1.0 * k; headP = -0.35 * k; chestDrop = 0.12 * k; this.chew += dt * (act.name === 'drink' ? 6 : 9); break;
        case 'roar': case 'call': neckP = 0.35 * k; headP = 0.35 * k; jawAdd = 1 * k; tailLift = 0.25 * k; bodyShake = act.name === 'roar' ? 0.02 * k : 0; break;
        case 'howl': neckP = 0.75 * k; headP = 0.6 * k; jawAdd = 0.8 * k; tailLift = 0.2 * k; break;
        case 'bite': lunge = Math.sin(Math.min(1, p * 1.6) * Math.PI) * 0.5; neckP = -0.15 * k; headP = -0.25 * k; jawAdd = p < 0.45 ? 1 : Math.max(0, 1 - (p - 0.45) * 6); break;
        case 'headbutt': neckP = -0.5 * k; headP = -0.55 * k; lunge = p > 0.4 ? Math.sin((p - 0.4) / 0.6 * Math.PI) * 0.8 : -0.25 * Math.sin(p / 0.4 * Math.PI); chestDrop = 0.1 * k; break;
        case 'tailwhip': case 'sweep': twist = Math.sin(p * Math.PI * 2) * 0.45; tailWag = Math.sin(p * Math.PI * 2) * 1.2; break;
        case 'sniff': neckP = -0.45 * k; headP = -0.2 * k + Math.sin(t * 22) * 0.04 * k; headY = Math.sin(t * 5) * 0.15 * k; break;
        case 'shake': bodyShake = 0.22 * k; break;
        case 'happy': hop = Math.abs(Math.sin(p * Math.PI * 3)) * 0.25 * k; headP = 0.15 * k; tailWag = Math.sin(t * 22) * 0.6 * k; break;
        case 'spit': neckP = (p < 0.5 ? 0.3 : -0.2) * k; headP = (p < 0.5 ? 0.35 : -0.25) * k; jawAdd = 0.9 * k; break;
        case 'stomp': rear = p < 0.55 ? Math.sin((p / 0.55) * Math.PI / 2) : Math.max(0, 1 - (p - 0.55) / 0.12); jawAdd = 0.8 * k; neckP = 0.3 * rear; break;
        case 'pounce': { const c = p < 0.35 ? Math.sin((p / 0.35) * Math.PI / 2) : 0; chestDrop = 0.25 * c; lunge = p > 0.35 ? Math.sin((p - 0.35) / 0.65 * Math.PI) * 1.2 : 0; jawAdd = p > 0.35 ? 1 : 0; tailLift = 0.3 * k; break; }
        case 'dive': neckP = -0.3 * k; break;
        case 'yawn': neckP = 0.25 * k; headP = 0.3 * k; jawAdd = 1 * k; break;
        default: break;
      }
    }
    if (hop) hips.position.y += hop * this.legLen;
    if (bodyShake) { _q1.setFromAxisAngle(_v.set(0, 0, 1), Math.sin(t * 34) * bodyShake * 3); hips.quaternion.multiply(_q1); }
    if (rear) { _q1.setFromAxisAngle(X, rear * (D.quad ? 0.45 : 0.25)); hips.quaternion.multiply(_q1); hips.position.y += rear * this.legLen * 0.25; }
    if (twist) { _q1.setFromAxisAngle(Y, twist); hips.quaternion.multiply(_q1); }
    if (lunge) hips.position.z -= lunge * this.legLen * 0.35;
    if (sleeping) { neckP += -0.55 * this.lie; headP += -0.2 * this.lie; headY += 0.35 * this.lie; }
    if (s.alert > 0.5 && !act && !ko) { neckP += 0.2; headP += 0.08; }
    const chestN = roles.chest;
    if (chestN && !spineN.includes(chestN)) {
      const c = B[chestN]; c.position.copy(this.base[chestN]);
      _e.set(-pitchOsc * 0.4, bendY * 0.5, 0); c.quaternion.setFromEuler(_e);
    }
    if (chestDrop && chestN) { const c = B[chestN]; c.position.y -= chestDrop * this.legLen; }
    // ---- head look
    const lookK = this.face.look * (1 - this.lie * 0.7);
    let ly = clamp((s.look?.yaw ?? 0) + this.idleLook.yaw, -1.3, 1.3) * lookK, lp = clamp((s.look?.pitch ?? 0) + this.idleLook.pitch, -0.7, 0.7) * lookK;
    this.lookYaw += (ly - this.lookYaw) * Math.min(1, dt * 5);
    this.lookPitch += (lp - this.lookPitch) * Math.min(1, dt * 5);
    const necks = roles.neck ?? [];
    const nN = Math.max(1, necks.length);
    // keep the head steady against the body's pitch and bob
    const stab = -(bodyPitch + pitchOsc * 0.5) * (A.stabilize ?? 0.6);
    for (const [i, n] of necks.entries()) {
      const b = B[n]; b.position.copy(this.base[n]);
      _e.set((neckP + this.lookPitch * 0.4 + stab * 0.5) / nN + Math.sin(ph * Math.PI * 4 + i) * 0.03 * amp, (this.lookYaw * 0.5 + headY * 0.5) / nN, 0, 'YXZ');
      b.quaternion.setFromEuler(_e);
    }
    const headN = roles.head;
    if (headN) {
      const hb = B[headN]; hb.position.copy(this.base[headN]);
      const derpTilt = this.expr === 'derp' ? Math.sin(t * 2.2) * 0.25 : 0;
      _e.set(headP + this.lookPitch * 0.6 + stab * 0.5 + (necks.length ? 0 : neckP), this.lookYaw * 0.5 + headY * 0.5, headR + derpTilt + this.ko * 0.4 * this.koSide + (sleeping ? 0.25 * this.lie : 0), 'YXZ');
      hb.quaternion.setFromEuler(_e);
      if (bodyShake) { _q1.setFromAxisAngle(Y, Math.sin(t * 34 + 1) * bodyShake * 2.5); hb.quaternion.multiply(_q1); }
      // babies have big heads
      hb.scale.setScalar(R.baby ? 1.28 : 1);
    }
    // ---- jaw + tongue
    const jawMax = A.jaw ?? 0.45;
    let jawT = Math.max(this.face.jaw, jawAdd);
    if (act && (act.name === 'eat' || act.name === 'drink' || act.name === 'eatcorpse')) jawT = Math.max(jawT, (0.5 + 0.5 * Math.sin(this.chew)) * 0.55);
    this.jaw += (jawT - this.jaw) * Math.min(1, dt * 16);
    if (roles.jaw) {
      const jb = B[roles.jaw]; jb.position.copy(this.base[roles.jaw]);
      const side = A.chew === 'side' && act && (act.name === 'eat' || act.name === 'eatcorpse') ? Math.sin(this.chew * 0.5) * 0.12 : 0;
      _e.set(-this.jaw * jawMax, side, 0); jb.quaternion.setFromEuler(_e);
    }
    const tongue = R.parts.tongue;
    if (tongue) {
      this.tongue += (this.face.tongue - this.tongue) * Math.min(1, dt * 6);
      const h = tongue.userData.holder;
      h.rotation.x = -this.tongue * 0.5;
      tongue.position.z = -this.tongue * tongue.userData.len * 1.6;
      tongue.position.y = -this.tongue * tongue.userData.len * 0.3;
      tongue.visible = this.jaw > 0.05 || this.tongue > 0.05;
    }
    // ---- legs
    this.solveLegs(dt, s, { ph, duty, sweep, amp, gname, sleeping, ko, dead });
    // arms for bipeds
    for (const a of roles.arms ?? []) {
      const b = B[a.b]; if (!b) continue;
      const sw = Math.sin((ph + (a.side > 0 ? 0.5 : 0)) * Math.PI * 2) * 0.35 * amp;
      const flail = (this.expr === 'scared' ? Math.sin(t * 18 + a.side) * 0.5 : 0) + (act?.name === 'happy' ? Math.sin(t * 16 + a.side) * 0.6 : 0);
      _e.set((a.rest?.[0] ?? 0) + sw + flail * 0.5 - this.ko * 0.8, a.rest?.[1] ?? 0, (a.rest?.[2] ?? 0) * a.side + (flail * 0.4 + this.ko * 0.6) * a.side); b.quaternion.setFromEuler(_e);
      if (a.lower && B[a.lower]) { _e.set((a.bendRest ?? -0.6) - amp * 0.2, 0, 0); B[a.lower].quaternion.setFromEuler(_e); }
    }
    // ---- tail
    const tails = roles.tail ?? [];
    const happyWag = (this.expr === 'happy' || this.expr === 'excited' || this.expr === 'love') ? 1 : 0;
    const scared = this.expr === 'scared' ? 1 : 0;
    for (const [i, n] of tails.entries()) {
      const b = B[n]; const S = this.sp_tail[i];
      const k2 = (i + 1) / tails.length;
      const sway = Math.sin(t * (1.2 + happyWag * 9) + i * 0.7) * (0.08 + happyWag * 0.35) + Math.sin(ph * Math.PI * 2 + i) * 0.08 * amp + tailWag * (1 - k2 * 0.3);
      const ty = S.y.step(-this.turn * 0.18 + sway - this.accL * 0.01, dt);
      const tx = S.x.step((A.tailUp ?? 0) + tailLift * 0.6 - scared * 0.45 - this.lie * 0.12, dt, (this.ay * 1.5 - this.accF * 1.5) * k2);
      _e.set(-tx, ty / tails.length * 1.6, 0); b.quaternion.setFromEuler(_e);
    }
    // ---- ears
    for (const [i, e] of (roles.ears ?? []).entries()) {
      const b = B[e.b]; if (!b) continue;
      const S = this.sp_ears[i];
      const tgt = this.face.ears + (e.droop ?? 0) * (sleeping ? 1 : 0);
      const flick = this.earFlick && this.earFlick.i === i ? Math.sin(this.earFlick.t * 40) * 0.5 * Math.max(0, 1 - this.earFlick.t * 4) : 0;
      const a1 = S.a.step(tgt, dt, -this.ay * 3.5 * (e.jig ?? 1) - this.accF * 2);
      const a2 = S.b.step(flick, dt, this.accL * 0.4 * e.side);
      const up = e.up ?? [0, 0, 0.5], back = e.back ?? [0.6, 0, 0];
      const kU = Math.max(0, a1), kD = Math.max(0, -a1);
      const dn = e.down ?? back;
      _e.set((up[0] * kU + dn[0] * kD) + a2 * 0.5, (up[1] * kU + dn[1] * kD) * e.side, (up[2] * kU + dn[2] * kD) * e.side + a2 * 0.3 * e.side, 'XYZ');
      b.quaternion.setFromEuler(_e);
    }
    // ---- jiggly bits (cheeks, crests, antennae)
    for (const [i, j] of (D.springs ?? []).entries()) {
      const b = B[j.b]; if (!b) continue;
      const S = this.sp_jig[i];
      const g = j.gain ?? 1;
      const rx = S.x.step(j.rest?.[0] ?? 0, dt, (this.ay * 5 - this.accF * 3) * g);
      const rz = S.z.step(j.rest?.[2] ?? 0, dt, (this.accL * 1.2 * (j.side ?? 1) + Math.sin(t * 30) * bodyShake * 40) * g);
      _e.set(rx, 0, rz); b.quaternion.setFromEuler(_e);
    }
    // ---- fleece puff (wool bone inflates)
    if (roles.fleece) {
      const f = B[roles.fleece], p = this.puff;
      const jig = this.sp_body.step(0, dt, -this.ay * 1.2);
      f.scale.set(1 + p * 0.55 + jig * 0.04, 1 + p * 0.5 - jig * 0.06, 1 + p * 0.2);
      f.position.copy(this.base[roles.fleece]); f.position.y += p * 0.02;
    }
    // ---- wings
    const wings = roles.wings ?? [];
    if (wings.length) {
      const flying = !!s.fly;
      this.fold += ((flying ? 0 : 1) - this.fold) * Math.min(1, dt * 4);
      this.wingT += dt * (flying ? (s.glide ? 1.5 : 7) : 0);
      for (const w of wings) {
        const b = B[w.b]; if (!b) continue;
        const flap = flying ? Math.sin(this.wingT + (w.lag ?? 0)) * (s.glide ? 0.15 : 0.8) : 0;
        const fold = w.fold ?? [0, 0.9, 0.9];
        // roll the wing on edge, then swing it back along the body (folded); flap about the long axis
        _e.set(fold[0] * this.fold, fold[1] * this.fold * w.side, (flap + fold[2] * this.fold - (scared && !flying ? Math.abs(Math.sin(t * 20)) * 0.6 * (1 - this.fold) : 0)) * w.side, 'YXZ');
        b.quaternion.setFromEuler(_e);
      }
    }
    // ---- a frill flares when cross (and while spitting)
    if (roles.frill) {
      const want = ['angry', 'rage', 'roar', 'alert'].includes(this.expr) || act?.name === 'spit' ? 1 : 0;
      this.frillK = (this.frillK ?? 0.3) + ((want ? 1 : 0.32) - (this.frillK ?? 0.3)) * Math.min(1, dt * (want ? 8 : 2));
      const f = B[roles.frill];
      f.scale.setScalar(this.frillK);
      _e.set(Math.sin(t * 9) * 0.04 * want, 0, Math.sin(t * 13) * 0.05 * want); f.quaternion.setFromEuler(_e);
    }
    // ---- elemental flames shrink when knocked out or asleep
    for (const f of R.parts.flames) f.scale.setScalar(Math.max(0.05, 1 - this.ko * 0.9 - (sleeping ? 0.45 : 0)));
    // ---- material
    const u = R.mats.skin.userData.u;
    u.uFlash.value.w = clamp(s.flash ?? 0, 0, 1) * 0.9;
    u.uBlush.value.w = this.face.blush;
  }

  // ======================================================================== faces
  pickExpr(s, f) {
    const act = f.act, ai = s.ai;
    if (s.expr) return s.expr;
    if (f.dead) return 'dead';
    if (f.ko) return 'ko';
    if (f.sleeping) return 'sleep';
    if ((s.hurt ?? 0) > 0) return 'hurt';
    if (act) {
      const m = { roar: 'roar', howl: 'roar', call: 'excited', bite: 'rage', headbutt: 'angry', spit: 'rage', stomp: 'rage', pounce: 'rage', eat: 'eat', eatcorpse: 'eat', drink: 'eat', happy: 'happy', sniff: 'sus', shake: 'content', yawn: 'yawn', tailwhip: 'angry', sweep: 'angry' }[act.name];
      if (m) return m;
    }
    if ((s.love ?? 0) > 0) return 'love';
    if (ai === 'flee' || this.puff > 0.4) return 'scared';
    if (ai === 'chase' || ai === 'charge' || ai === 'warn' || ai === 'attack') return s.mood === 'angry' || ai === 'chase' ? 'angry' : 'alert';
    if (ai === 'stalk' || ai === 'hunt') return 'sus';
    if (s.mood === 'angry') return 'angry';
    if (s.mood === 'happy') return 'happy';
    if ((s.alert ?? 0) > 0.6) return 'alert';
    if (ai === 'graze') return 'content';
    if (this.idleExpr) return this.idleExpr;
    return s.tamed ? 'content' : 'neutral';
  }
  updateFace(dt, s, f) {
    const R = this.r, t = this.t;
    // idle personality: glance around, flick an ear, make a face
    this.idleT -= dt;
    if (this.idleT <= 0) {
      this.idleT = 2 + Math.random() * 5;
      const r = Math.random();
      if (r < 0.45) this.idleLook = { yaw: (Math.random() - 0.5) * 1.6, pitch: (Math.random() - 0.4) * 0.5 };
      else if (r < 0.6) this.idleLook = { yaw: 0, pitch: 0 };
      if (Math.random() < 0.35) this.earFlick = { i: Math.floor(Math.random() * Math.max(1, (this.D.roles.ears ?? []).length)), t: 0 };
      if (Math.random() < 0.18) { this.idleExpr = ['derp', 'content', 'sus', 'happy', 'sleepy'][Math.floor(Math.random() * 5)]; this.idleExprT = 1.2 + Math.random() * 1.5; }
    }
    if (this.earFlick) { this.earFlick.t += dt; if (this.earFlick.t > 0.4) this.earFlick = null; }
    if (this.idleExprT > 0) { this.idleExprT -= dt; if (this.idleExprT <= 0) this.idleExpr = null; }
    const name = this.pickExpr(s, f);
    if (name !== this.expr) { this.expr = name; }
    const T = CREATURE_EXPR[this.expr] ?? CREATURE_EXPR.neutral;
    const k = Math.min(1, dt * 10);
    const fb = this.D.faceBias;
    for (const key of FACE_KEYS) this.face[key] += ((T[key] ?? N[key]) + (fb?.[key] ?? 0) * (T.mode ? 0 : 1) - this.face[key]) * k;
    // cartoon marks fade out before the next one fades in
    if (T.mode !== this.mode) { this.modeK -= dt * 9; if (this.modeK <= 0) { this.modeK = 0; this.mode = T.mode; } }
    else if (this.mode) this.modeK = Math.min(1, this.modeK + dt * 9);
    // blinking
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) { this.blink = 0.13; this.nextBlink = 1.6 + Math.random() * 4.5; if (Math.random() < 0.15) this.nextBlink = 0.25; }
    this.blink = Math.max(0, this.blink - dt);
    const bk = this.blink > 0 ? Math.sin((this.blink / 0.13) * Math.PI) : 0;
    const F = this.face;
    const top = F.top + (-0.1 - F.top) * bk, bot = F.bot + (-0.1 - F.bot) * bk;
    const scaredJit = this.expr === 'scared' ? Math.sin(t * 50) * 0.012 : 0;
    // gaze: what the head can't turn to, the eyes do (derp goes cross-eyed)
    const gy = clamp((s.look?.yaw ?? 0) + this.idleLook.yaw - this.lookYaw, -1.2, 1.2) * 0.35 * F.look;
    const gp = clamp((s.look?.pitch ?? 0) + this.idleLook.pitch - this.lookPitch, -1, 1) * 0.35 * F.look;
    for (const [i, e] of R.parts.eyes.entries()) {
      const u = R.mats.eyes[i].userData.u;
      const side = e.userData.side ?? (i ? -1 : 1);
      let gx = -gy * side;
      if (this.expr === 'derp') gx = side > 0 ? -0.34 : 0.18;
      u.uLid.value.set(top, bot, F.tilt, F.curve);
      u.uLook.value.x = clamp(gx + scaredJit, -0.45, 0.45);
      u.uLook.value.y = clamp(gp, -0.4, 0.4);
      u.uLook.value.z = F.pupil * (this.expr === 'derp' && i ? 0.6 : 1);
      u.uMode.value.set(this.mode, this.modeK, t, 0);
    }
  }

  // ======================================================================== legs
  solveLegs(dt, s, g) {
    const R = this.r, B = R.bones;
    if (!this.legs.length) return;
    // model matrices of the leg parents (built from the local transforms we just set)
    const mats = {};
    const modelOf = (name) => {
      if (mats[name]) return mats[name];
      const b = B[name];
      const m = new THREE.Matrix4().compose(b.position, b.quaternion, b.scale);
      const par = b.parent;
      if (par && par.isBone) m.premultiply(modelOf(par.name));
      mats[name] = m;
      return m;
    };
    const yaw = s.yaw ?? 0, sc = s.scale ?? 1, pos = s.pos;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const ground = s.ground && pos && (s.lod ?? 0) === 0 && !s.swim && !s.fly ? s.ground : null;
    let bias = 0, nb = 0;
    const stiff = this.ko;
    for (const L of this.legs) {
      const Mp = modelOf(L.parentName);
      _m1.copy(Mp).invert();
      const p = fract(g.ph + this.gaitOff[L.key]);
      // ---- toe target in model space
      _t.copy(L.T0);
      let lift = 0, curl = 0;
      if (s.fly) {
        // tucked under while flying
        _t.y = L.T0.y + this.legLen * 0.45; _t.z += (L.front ? -1 : 1) * this.legLen * 0.25;
      } else if (s.swim) {
        const a = p * Math.PI * 2;
        _t.z += Math.cos(a) * g.sweep * 0.5; _t.y += (Math.sin(a) * 0.5 + 0.6) * this.legLen * 0.35;
      } else if (g.amp > 0.001) {
        if (p < g.duty) { const u = p / g.duty; _t.z += g.sweep * (u - 0.5) * g.amp; }
        else {
          const u = (p - g.duty) / (1 - g.duty), e = sstep(u);
          _t.z += g.sweep * (0.5 - e) * g.amp;
          lift = Math.pow(Math.sin(Math.PI * u), 0.85) * this.legLen * (this.A.lift ?? 0.16) * (0.7 + g.amp * 0.6) * g.amp;
          curl = Math.sin(Math.PI * u) * 0.6 * g.amp;
        }
        // step sideways a little into turns
        _t.x += -this.turn * this.legLen * 0.05 * (L.front ? 1 : -1);
      }
      // sleeping: fold the legs under the belly
      if (this.lie > 0.01 && !g.ko) {
        const k = this.lie * (1 - this.ko);
        _t.x += (L.T0.x * 0.7 - L.T0.x) * k;
        _t.z += (L.front ? -1 : 1) * this.legLen * 0.25 * k;
        _t.y += R.br * 0.25 * k;
      }
      // ---- terrain under the foot
      let gyM = 0;
      if (ground) {
        const mx = _t.x * sc, mz = _t.z * sc;
        const wx = pos.x + mx * cy + mz * sy, wz = pos.z - mx * sy + mz * cy;
        gyM = clamp((ground(wx, wz) - pos.y) / sc, -this.legLen * 0.5, this.legLen * 0.5);
        bias += Math.min(0, gyM); nb++;
      }
      _t.y += gyM * (1 - this.lie) + lift;
      // ---- into the parent's space
      _a.copy(_t).applyMatrix4(_m1);
      const T = _a; // toe target (parent space)
      _q1.setFromRotationMatrix(_m1); // rotation part of the inverse
      // the foot keeps its world orientation (curls up a bit while swinging)
      _v.copy(L.foot0);
      if (curl) _v.applyAxisAngle(X, curl * (L.front ? -1 : 1) * (this.A.footCurl ?? 1));
      _v.applyQuaternion(_q1);
      const Ap = _w.copy(T).sub(_v); // ankle target
      const H = B[L.nu].position;
      // ---- two-bone IK H -> A
      _u.copy(Ap).sub(H);
      let d = _u.length();
      const maxD = (L.l1 + L.l2) * 0.999, minD = Math.abs(L.l1 - L.l2) + 1e-4;
      if (d < 1e-6) { _u.set(0, -1, 0); d = minD; }
      _u.divideScalar(d);
      if (d > maxD) { Ap.copy(H).addScaledVector(_u, maxD); d = maxD; }
      d = Math.max(d, minD);
      const cosA = clamp((L.l1 * L.l1 + d * d - L.l2 * L.l2) / (2 * L.l1 * d), -1, 1);
      const sinA = Math.sqrt(1 - cosA * cosA);
      // bend plane from the pole (forward knees / backward elbows, a touch outward)
      _p.copy(L.poleV).applyQuaternion(_q1);
      _p.addScaledVector(_u, -_p.dot(_u));
      if (_p.lengthSq() < 1e-8) _p.set(0, 0, -L.bend);
      _p.normalize();
      _k.copy(H).addScaledVector(_u, L.l1 * cosA).addScaledVector(_p, L.l1 * sinA); // knee
      const side1 = _s.crossVectors(_u, _p).normalize();
      // segment directions
      const d1 = _v.copy(_k).sub(H).normalize();
      const q1 = this.aim(d1, side1, L.F1i, _q1);
      const d2 = _v.copy(Ap).sub(_k).normalize();
      const q2 = this.aim(d2, side1, L.F2i, _q2);
      const d3 = _v.copy(T).sub(Ap).normalize();
      const q3 = this.aim(d3, side1, L.F3i, _q3);
      // locals: upper = q1, lower = q1^-1 q2, foot = q2^-1 q3, with KO stiffness towards the rest pose
      const bu = B[L.nu], bl = B[L.nl], bf = B[L.nf];
      bu.quaternion.copy(q1);
      bl.quaternion.copy(_qi.copy(q1).invert().multiply(q2));
      bf.quaternion.copy(_qi.copy(q2).invert().multiply(q3));
      if (stiff > 0.01) {
        const twitch = g.dead ? 0 : Math.sin(this.t * 9 + L.side * 2 + (L.front ? 1 : 0)) * 0.12;
        _q1.setFromAxisAngle(_v.set(0, 0, 1), (0.35 + twitch) * L.side);
        bu.quaternion.slerp(_q1, stiff);
        bl.quaternion.slerp(_qi.identity(), stiff);
        bf.quaternion.slerp(_qi, stiff);
      }
    }
    // lower the body when the ground under the feet drops away
    const tgt = nb ? clamp(bias / nb, -this.legLen * 0.35, 0) : 0;
    this.groundBias += (tgt - this.groundBias) * Math.min(1, dt * 8);
  }
  // rotation taking a rest segment frame onto (dir, side)
  aim(dir, side, F0i, out) {
    _p.copy(side).addScaledVector(dir, -side.dot(dir)).normalize();
    _t.crossVectors(_p, dir);
    _m2.makeBasis(_p, dir, _t).multiply(F0i);
    return out.setFromRotationMatrix(_m2);
  }
}
