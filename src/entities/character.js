// The explorers are bean scientists in padded space-time suits (the sculpt is
// humanDesign.js, the skin shader humanModel.js). This file holds the outfit
// catalogue and presets, the face library and the animation: a humanoid
// skeleton posed procedurally every frame (walk, run, jump, fall, swim, sit,
// drive, sleep, carried, knocked out, every tool action and emote, idle
// fidgets) with springy secondary motion: the soft bean body leans and
// squashes, the head lags and settles, the chrono pack bounces. Fingers curl
// around whatever the hands hold, and the face blinks, glances, talks and
// pulls expressions with the creatures' shader eyes and a drawn mouth.
// Front is -Z, feet at y = 0.
import * as THREE from 'three';
import { buildHuman, dressHuman, FABRICS } from './humanModel.js';
import { BEAN } from './humanDesign.js';
import { PixelPainter } from '../gfx/pixel.js';

// ------------------------------------------------------------------ outfit catalogue
// colours are free to change; accessories are unlocked through achievements
export const PALETTE = {
  suit: [[0xd8742a, 'Ember'], [0xe8b83a, 'Sunflower'], [0x3a6ea5, 'Chrono blue'], [0x5a8a4a, 'Fern'], [0xb8352a, 'Red giant'], [0x7e54b0, 'Nebula'], [0xe6e1d2, 'Lab white'], [0x2c2e36, 'Midnight'], [0x3aa49c, 'Lagoon'], [0xd8689a, 'Bubblegum'], [0x7a5a3a, 'Mud'], [0x8e9aa6, 'Steel']],
  trim: [[0x2e3440, 'Graphite'], [0xe8c34a, 'Gold'], [0xe9e4d4, 'Bone'], [0xd8742a, 'Ember'], [0x46a0e0, 'Sky'], [0x8ac04a, 'Lime'], [0xc0392b, 'Signal red'], [0x8e5ab8, 'Violet'], [0x1a1a1e, 'Black']],
  gear: [[0x3a3028, 'Espresso'], [0x22252b, 'Black'], [0x7a5434, 'Tan'], [0xd8d2c4, 'Bone'], [0x34506e, 'Navy'], [0x7a2a26, 'Oxblood'], [0x56604a, 'Olive']],
  skin: [[0xf2cfa8, 'Peach'], [0xe0a878, 'Honey'], [0xb87a4e, 'Caramel'], [0x7a4e30, 'Cocoa'], [0x4a3022, 'Espresso'], [0x9ad07a, 'Lime bean'], [0xf0a0b8, 'Pink bean'], [0xf2e07a, 'Lemon bean'], [0x8ac0f0, 'Blueberry'], [0xc8a0f0, 'Grape']],
  eye: [[0x4a7ab0, 'Blue'], [0x5a8a3a, 'Green'], [0x7a4a2a, 'Brown'], [0x2e2e34, 'Black'], [0xa04ac0, 'Violet'], [0xd0902a, 'Amber'], [0x2ab0b0, 'Teal'], [0xc03a3a, 'Ruby']],
  glow: [[0x46e0ff, 'Cyan'], [0xffa83a, 'Amber'], [0x7aff6a, 'Neon'], [0xff4a8a, 'Magenta'], [0xb07aff, 'Violet'], [0xfff06a, 'Solar']],
};
export const TEETH = ['Grin', 'Buck teeth', 'Gap tooth', 'Fangs'];
export const FABRIC_IDS = Object.keys(FABRICS);
export const OPTIONS = { hat: ['none'], back: ['chrono'], face: ['none'], neck: ['none'] };
export const PRESETS = [
  { name: 'Doug', suit: 0xd8742a, trim: 0x2e3440, gear: 0x6a4a30, skin: 0xf2cfa8, eye: 0x4a7ab0, glow: 0x46e0ff, fabric: 'quilted', teeth: 1, hat: 'none', back: 'chrono', face: 'none', neck: 'none' },
  { name: 'Kev', suit: 0x3a6ea5, trim: 0xe8c34a, gear: 0x22252b, skin: 0xb87a4e, eye: 0x7a4a2a, glow: 0xffa83a, fabric: 'ripstop', teeth: 0, hat: 'none', back: 'chrono', face: 'none', neck: 'none' },
  { name: 'Pip', suit: 0xd8689a, trim: 0xe9e4d4, gear: 0xd8d2c4, skin: 0x9ad07a, eye: 0x5a8a3a, glow: 0x7aff6a, fabric: 'puffer', teeth: 2, hat: 'none', back: 'chrono', face: 'none', neck: 'none' },
  { name: 'Dr. Wanda', suit: 0xe6e1d2, trim: 0x7e54b0, gear: 0x34506e, skin: 0xe0a878, eye: 0xa04ac0, glow: 0xb07aff, fabric: 'hex', teeth: 3, hat: 'none', back: 'chrono', face: 'none', neck: 'none' },
];
// old saves carry leather beans: start them from the matching preset, keep anything that still fits
export function normalizeOutfit(o = {}) {
  o = o ?? {};
  const base = PRESETS.find((p) => p.name === o.name) ?? PRESETS[0];
  const out = { ...base };
  const num = (v) => typeof v === 'number' && v >= 0 && v <= 0xffffff;
  for (const k of ['suit', 'trim', 'gear', 'skin', 'eye', 'glow']) if (num(o[k]) && (k !== 'skin' || o[k] > 16)) out[k] = o[k];
  if (FABRICS[o.fabric]) out.fabric = o.fabric;
  if (Number.isInteger(o.teeth)) out.teeth = Math.max(0, Math.min(3, o.teeth));
  else if (Number.isInteger(o.nose)) out.teeth = Math.max(0, Math.min(3, o.nose));
  for (const [k, list] of Object.entries(OPTIONS)) out[k] = list.includes(o[k]) ? o[k] : list[0];
  if (typeof o.name === 'string') out.name = o.name;
  return out;
}

// ------------------------------------------------------------------ expressions
// lu/ll: upper/lower lid closure per eye [left, right] (0 open .. 1 shut), tilt
// (+ angry, - sad), ps pupil size, bias where the eyes look ('look', 'down',
// 'cross', 'none'), brow raise/angle per side, mouth: W half-width, O open,
// S smile, A smirk, P pucker, T teeth, G tongue; mode: cartoon eyes (1 ^^,
// 2 asleep, 4 swirl, 5 hearts, 6 squeezed), blush, fx particles.
const E = (o) => {
  const e = { lu: [0.12, 0.12], ll: [0, 0], tilt: 0, ps: 1, bias: 'look', br: [0, 0], ba: [0, 0], W: 0.11, O: 0.012, S: 0.35, A: 0, P: 0, T: 0.15, G: 0, shake: 0, mode: 0, blush: 0, fx: null, ...o };
  e.W *= 1.3 * 0.42; e.O *= 1.45 * 0.26;
  return e;
};
export const EXPRESSIONS = {
  neutral: E({}),
  happy: E({ ll: [0.32, 0.32], br: [0.25, 0.25], W: 0.15, O: 0.05, S: 1, T: 0.7, blush: 0.35 }),
  grin: E({ ll: [0.25, 0.25], br: [0.35, 0.35], W: 0.19, O: 0.045, S: 1.1, T: 1, blush: 0.2 }),
  laugh: E({ lu: [0.5, 0.5], ll: [0.5, 0.5], br: [0.4, 0.4], W: 0.16, O: 0.12, S: 0.85, T: 0.9, shake: 0.4, mode: 1, blush: 0.5 }),
  sad: E({ lu: [0.38, 0.38], tilt: -0.55, br: [-0.1, -0.1], ba: [-0.8, -0.8], W: 0.09, O: 0.012, S: -0.9, bias: 'down' }),
  cry: E({ lu: [0.5, 0.5], ll: [0.25, 0.25], tilt: -0.6, ba: [-0.9, -0.9], W: 0.12, O: 0.07, S: -0.8, T: 0.4, fx: 'tears', shake: 0.25, blush: 0.45 }),
  angry: E({ lu: [0.42, 0.42], tilt: 0.65, br: [-0.4, -0.4], ba: [1, 1], W: 0.12, O: 0.035, S: -0.55, T: 1 }),
  rage: E({ lu: [0.45, 0.45], tilt: 0.75, br: [-0.5, -0.5], ba: [1.2, 1.2], W: 0.16, O: 0.1, S: -0.6, T: 1, shake: 0.7, fx: 'steam', blush: 0.8 }),
  scared: E({ lu: [0, 0], ll: [0, 0], ps: 0.5, br: [0.8, 0.8], ba: [-0.6, -0.6], W: 0.1, O: 0.07, S: -0.45, T: 0.5, shake: 0.5, fx: 'sweat', bias: 'none' }),
  scream: E({ lu: [0, 0], ps: 0.42, br: [1, 1], ba: [-0.7, -0.7], W: 0.13, O: 0.17, S: -0.25, P: 0.2, T: 0.7, shake: 0.6, bias: 'none' }),
  surprised: E({ lu: [0, 0], ps: 0.75, br: [1, 1], W: 0.07, O: 0.085, P: 0.75 }),
  shock: E({ lu: [0, 0], ps: 0.45, br: [1.1, 1.1], W: 0.11, O: 0.19, S: -0.1, T: 0.4, G: 0.2 }),
  derp: E({ lu: [0.1, 0.45], br: [0.4, -0.1], bias: 'cross', W: 0.12, O: 0.06, S: 0.45, A: 0.35, T: 0.6, G: 1 }),
  smug: E({ lu: [0.5, 0.55], ll: [0.1, 0.1], tilt: 0.2, br: [0.35, -0.05], ba: [0.3, 0.1], W: 0.13, O: 0.006, S: 0.7, A: 0.9, T: 0 }),
  sleepy: E({ lu: [0.72, 0.72], br: [-0.1, -0.1], W: 0.08, O: 0.02, S: 0, bias: 'down' }),
  sleep: E({ lu: [1, 1], ll: [1, 1], W: 0.06, O: 0.03, P: 0.5, S: 0, fx: 'zzz', mode: 2 }),
  ko: E({ lu: [0.35, 0.35], W: 0.12, O: 0.06, S: -0.3, G: 0.8, T: 0.3, fx: 'stars', mode: 4 }),
  hurt: E({ lu: [0.78, 0.78], ll: [0.55, 0.55], br: [-0.3, -0.3], ba: [0.5, 0.5], W: 0.15, O: 0.03, S: -0.6, T: 1, shake: 0.5, mode: 6 }),
  chomp: E({ ll: [0.3, 0.3], W: 0.12, O: 0.05, S: 0.4, T: 0.8, chew: 1 }),
  disgust: E({ lu: [0.5, 0.35], ll: [0.3, 0.2], br: [-0.2, 0.2], ba: [0.4, 0.4], W: 0.11, O: 0.035, S: -0.7, A: -0.45, T: 0.6, G: 0.85 }),
  love: E({ ll: [0.3, 0.3], ps: 1.3, br: [0.4, 0.4], W: 0.12, O: 0.04, S: 1, T: 0.5, fx: 'hearts', mode: 5, blush: 1 }),
  suspicious: E({ lu: [0.62, 0.3], br: [-0.25, 0.3], ba: [0.6, 0.2], W: 0.08, O: 0.006, S: -0.25, A: -0.55, T: 0 }),
  whistle: E({ lu: [0.2, 0.2], br: [0.3, 0.3], W: 0.035, O: 0.035, P: 1, S: 0, T: 0 }),
  puff: E({ lu: [0.3, 0.3], br: [0.3, 0.3], W: 0.05, O: 0.0, P: 0.6, S: 0, T: 0, blush: 0.6 }),
  dizzy: E({ lu: [0.3, 0.3], W: 0.11, O: 0.05, S: 0.2, A: 0.5, T: 0.5, G: 0.4, fx: 'stars', mode: 4 }),
  cold: E({ lu: [0.3, 0.3], br: [-0.2, -0.2], ba: [-0.4, -0.4], W: 0.1, O: 0.02, S: -0.2, T: 1, chatter: 1, shake: 0.6, blush: 0.5 }),
  proud: E({ lu: [0.45, 0.45], ll: [0.2, 0.2], br: [0.3, 0.3], W: 0.14, O: 0.01, S: 0.95, T: 0.3, chin: 0.12, blush: 0.25 }),
  focus: E({ lu: [0.3, 0.3], tilt: 0.25, br: [-0.1, -0.1], ba: [0.4, 0.4], W: 0.07, O: 0.006, S: -0.1, A: 0.3, G: 0.35 }),
};
const PARAMS = ['tilt', 'ps', 'W', 'O', 'S', 'A', 'P', 'T', 'G', 'shake', 'blush'];

// ------------------------------------------------------------------ rig helpers
const A0 = BEAN.armAngle;
const AXIS_Z = new THREE.Vector3(0, 0, 1);
// elbow hinges (perpendicular to the A-posed upper arm and to the front)
const ELBOW = { R: new THREE.Vector3(Math.cos(A0), Math.sin(A0), 0), L: new THREE.Vector3(Math.cos(A0), -Math.sin(A0), 0) };
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _e = new THREE.Euler();
const _w = new THREE.Vector3(), _v = new THREE.Vector3(), _a = new THREE.Vector3();
const L1 = 0.175, L2 = 0.17, LEG = L1 + L2; // thigh, shin
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const fract = (x) => x - Math.floor(x);
// a rotation given in the canonical hand frame (fingers down, palm to -X, thumb forward), for one side
export function handQuat(sd, rx, ry, rz, out) {
  const th = sd * A0;
  _e.set(rx, sd * ry, sd * rz, 'YXZ');
  _q2.setFromEuler(_e);
  _q3.setFromAxisAngle(AXIS_Z, th);
  out.copy(_q3).multiply(_q2);
  _q3.invert();
  return out.multiply(_q3);
}
export const HANDS = {
  rest: { c1: 0.3, c2: 0.42, ix: 0.24, ix2: 0.32, tx: -0.18, ty: 0.15 },
  grip: { c1: 1.42, c2: 1.5, ix: 1.32, ix2: 1.42, tx: -0.72, ty: 0.62 },
  fist: { c1: 1.55, c2: 1.75, ix: 1.55, ix2: 1.75, tx: -0.9, ty: 0.7 },
  open: { c1: 0.04, c2: 0.06, ix: 0.02, ix2: 0.04, tx: 0.05, ty: -0.12 },
  point: { c1: 1.5, c2: 1.6, ix: 0.0, ix2: 0.02, tx: -0.6, ty: 0.55 },
  claw: { c1: 0.8, c2: 0.9, ix: 0.8, ix2: 0.9, tx: -0.3, ty: 0.3 },
  type: { c1: 0.5, c2: 0.7, ix: 0.42, ix2: 0.5, tx: -0.25, ty: 0.25 },
};

// ------------------------------------------------------------------ the character
export class Character {
  constructor(outfit = PRESETS[0], opt = {}) {
    this.outfit = normalizeOutfit(outfit);
    this.isLocal = !!opt.local;
    this.H = buildHuman(this.outfit);
    this.root = new THREE.Group(); this.root.name = 'character';
    this.body = new THREE.Group(); this.body.name = 'pose'; // tilts in the character's own frame
    this.root.add(this.body); this.body.add(this.H.root);
    this.B = this.H.bones; this.rest = this.H.rest;
    this.handR = this.H.grips.R; this.handL = this.H.grips.L;
    this.eyes = this.H.eyes; this.brows = this.H.brows;
    this.mat = this.H.mat;
    this.headMesh = this.H.lods[0];
    this.t = Math.random() * 10; this.phase = Math.random();
    this.lean = new THREE.Vector2(); this.leanV = new THREE.Vector2();
    this.lag = new THREE.Vector2(); this.lagV = new THREE.Vector2();
    this.squash = 0; this.squashV = 0; this.packX = 0; this.packV = 0;
    this.prevPos = null; this.vel = new THREE.Vector3(); this.acc = new THREE.Vector3();
    this.prevYaw = null; this.prevGrounded = true; this.airTime = 0;
    this.blink = 0; this.blinkT = 1 + Math.random() * 3;
    this.fidget = { name: null, t: 0, next: 5 + Math.random() * 8 };
    this.glance = { yaw: 0, pitch: 0, t: 1.5 };
    this.expr = 'neutral'; this.face = {}; this.faceV = {}; this.talk = 0;
    this.mode = 0; this.modeK = 0;
    this.pose = {}; this.fxT = 0; this.flash = 0; this.lod = 0;
    this.heldGroup = null;
    this.root.traverse((m) => { if (m.isMesh) m.userData.charPart = true; });
  }
  dispose() { this.H.dispose(); }
  // recolour in place (menus, the lab wardrobe)
  setOutfit(o) { this.outfit = normalizeOutfit(o); dressHuman(this.H, this.outfit); }
  setLod(i) {
    if (i === this.lod || this.H.lods.length < 2) return;
    this.lod = i;
    this.H.lods[0].visible = i === 0; this.H.lods[1].visible = i !== 0;
  }
  // attach a held-item mesh to the right fist
  setHeld(obj) {
    if (this.heldGroup) this.handR.remove(this.heldGroup);
    this.heldGroup = obj;
    if (obj) this.handR.add(obj);
  }
  // something hit the bean: it jiggles, the head snaps and the face flinches
  hit(k = 1) {
    this.leanV.x += (Math.random() - 0.5) * 3 * k; this.leanV.y += (Math.random() - 0.5) * 3 * k;
    this.lagV.x += (Math.random() - 0.5) * 6 * k; this.lagV.y += (Math.random() * 0.5 + 0.5) * 5 * k;
    this.squashV -= 1.5 * k;
    this.flash = Math.max(this.flash, 0.5 * Math.min(1, k));
  }

  // ---------------------------------------------------------------- animation
  // s: { speed, grounded, vy, crouch, sprint, swim, underwater, action:{name,t,side}, talk, expr, downed, carried,
  //      sitting, ride, drive, sleeping, lookPitch, lookYaw, yaw, holding, panic, lod, hand }
  update(dt, s = {}) {
    dt = Math.min(Math.max(dt, 1e-4), 0.05);
    this.t += dt;
    const t = this.t;
    if (s.lod !== undefined) this.setLod(s.lod);
    const speed = s.speed ?? 0;
    const grounded = s.grounded ?? true;
    const ease = (cur, target, k) => cur + (target - cur) * Math.min(1, dt * k);
    // ---- how the bean moves through the world
    const wp = this.root.getWorldPosition(_w);
    if (!this.prevPos) this.prevPos = wp.clone();
    const nv = _v.copy(wp).sub(this.prevPos).divideScalar(dt);
    if (nv.lengthSq() > 400) nv.set(0, 0, 0);
    this.prevPos.copy(wp);
    this.acc.lerp(_a.copy(nv).sub(this.vel).divideScalar(dt), Math.min(1, dt * 12));
    this.vel.copy(nv);
    const yaw = s.yaw ?? 0;
    if (this.prevYaw === null) this.prevYaw = yaw;
    let dyaw = yaw - this.prevYaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    this.prevYaw = yaw;
    const turn = clamp(dyaw / dt, -12, 12);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    // acceleration in the bean's frame (x right, z back)
    const ax = clamp(this.acc.x * cy - this.acc.z * sy, -30, 30), az = clamp(this.acc.x * sy + this.acc.z * cy, -30, 30);
    // ---- springs: the soft body lags behind acceleration and overshoots
    const L = this.lean, LV = this.leanV;
    LV.x += (-L.x * 120 - LV.x * 9 - ax * 0.012 + turn * speed * 0.0025) * dt;
    LV.y += (-L.y * 120 - LV.y * 9 - az * 0.012) * dt;
    L.addScaledVector(LV, dt); L.clampLength(0, 0.3);
    const G = this.lag, GV = this.lagV;
    GV.x += (-G.x * 90 - GV.x * 8 - turn * 0.06) * dt;
    GV.y += (-G.y * 90 - GV.y * 8 + clamp((this.acc.y ?? 0) * 0.004, -0.4, 0.4)) * dt;
    G.addScaledVector(GV, dt); G.clampLength(0, 0.5);
    if (grounded && !this.prevGrounded && this.airTime > 0.12) { this.squashV -= Math.min(4.5, 1.2 + this.airTime * 3); this.lagV.y -= 2 + this.airTime * 2; this.packV += 3; }
    if (!grounded && this.prevGrounded && (s.vy ?? 0) > 2) { this.squashV += 2.2; this.packV -= 2; }
    this.airTime = grounded ? 0 : this.airTime + dt;
    this.prevGrounded = grounded;

    // ---- gait: fast little legs, a duty cycle and a planted-foot sweep
    const moving = Math.min(1, speed / 1.2);
    const runK = clamp((speed - 3) / 3, 0, 1);
    const cad = 1.6 + speed * 0.62;
    this.phase += cad * dt * (grounded && !s.swim ? 1 : 0.6);
    const ph = this.phase;
    let expr = s.expr ?? 'neutral';
    if (!EXPRESSIONS[expr]) expr = 'neutral';
    // pose targets (arm/leg numbers in the old convention: arms [left, right], x < 0 raises
    // forward, z = out from the body; legs x > 0 swings back, knee > 0 bends)
    let rootRX = 0, rootRZ = 0, rootY = 0, hipY = 0, hipRX = 0, hipRY = 0, hipRZ = 0;
    let spRX = 0, spRY = 0, spRZ = 0, chRX = 0, chRY = 0, chRZ = 0, hdRX = 0, hdRY = 0, hdRZ = 0;
    let lookYaw = s.lookYaw ?? 0, lookPitch = s.lookPitch ?? 0;
    const arm = [{ x: 0.06, z: 0.52, elbow: -0.28 }, { x: 0.06, z: -0.52, elbow: -0.28 }];
    const leg = [{ x: 0, knee: 0.06, ankle: null, z: 0 }, { x: 0, knee: 0.06, ankle: null, z: 0 }];
    const hand = [HANDS.rest, HANDS.rest];
    let plant = grounded && !s.swim && !s.sitting && !s.sleeping && !s.downed && !s.carried;
    // breathing
    const br = Math.sin(t * 1.9);
    chRX += br * 0.012; arm[0].z += br * 0.015; arm[1].z -= br * 0.015;
    if (plant) {
      const duty = 0.62 - runK * 0.22;
      const stride = speed / Math.max(cad, 0.1);
      const amp = Math.min(0.68, Math.asin(Math.min(0.95, (stride * duty) / (2 * LEG * 0.95)))) * moving;
      for (let i = 0; i < 2; i++) {
        const p = fract(ph + (i ? 0.5 : 0));
        let x, knee, ank;
        if (p < duty) {
          const u = p / duty;
          x = -amp + 2 * amp * u;
          knee = (0.1 + 0.25 * runK) * Math.sin(Math.PI * u) * moving + 0.05;
          ank = null; // flat on the ground
        } else {
          const u = (p - duty) / (1 - duty);
          x = amp - 2 * amp * smooth(u);
          knee = (0.9 + runK * 0.9) * Math.sin(Math.PI * Math.min(1, u * 1.15)) * moving + 0.05;
          ank = -0.35 * Math.sin(Math.PI * u) * moving + 0.25 * (1 - u) * moving;
        }
        leg[i].x = x; leg[i].knee = knee; leg[i].ankle = ank;
      }
      // the pelvis turns into each step, the shoulders turn against it
      const sw = Math.sin(ph * Math.PI * 2);
      hipRY = sw * (0.16 + runK * 0.08) * moving;
      chRY = -hipRY * 1.25;
      hipRZ = Math.cos(ph * Math.PI * 4) * 0.035 * moving;
      spRX = -(0.06 * moving + 0.2 * runK); chRX -= 0.04 * moving + 0.08 * runK;
      hdRX += 0.06 * moving + 0.18 * runK; // keep looking ahead
      const k = 0.85 + runK * 0.6;
      arm[0].x = leg[1].x * k + 0.06; arm[1].x = leg[0].x * k + 0.06;
      arm[0].elbow = arm[1].elbow = -0.32 - moving * 0.25 - runK * 1.0;
      arm[0].z = 0.54 + runK * 0.08; arm[1].z = -0.54 - runK * 0.08;
      if (s.panic) { arm[0].x = -2.7 + Math.sin(t * 22) * 0.6; arm[1].x = -2.7 + Math.cos(t * 22) * 0.6; arm[0].z = 0.4; arm[1].z = -0.4; arm[0].elbow = arm[1].elbow = -0.3; hand[0] = hand[1] = HANDS.open; expr = 'scream'; }
    }
    if (s.crouch) { hipY -= 0.05; leg[0].x -= 0.75; leg[1].x -= 0.75; leg[0].knee += 1.4; leg[1].knee += 1.4; spRX -= 0.18; chRX -= 0.12; hdRX += 0.22; this.squash = Math.min(this.squash, -0.03); }
    if (!grounded && !s.swim && !s.carried && !s.sitting) {
      const fall = (s.vy ?? 0) < -2;
      const flail = this.airTime > 0.8 && fall;
      leg[0].x = -0.6; leg[1].x = 0.35; leg[0].knee = 1.1; leg[1].knee = 0.7; leg[0].ankle = 0.2; leg[1].ankle = 0.1;
      arm[0].x = -1.2; arm[1].x = -1.2; arm[0].z = 1.05; arm[1].z = -1.05; arm[0].elbow = arm[1].elbow = -0.5;
      hand[0] = hand[1] = HANDS.open;
      if (flail) { arm[0].x = -2.6 + Math.sin(t * 25) * 0.7; arm[1].x = -2.6 + Math.cos(t * 23) * 0.7; leg[0].x = Math.sin(t * 20) * 0.8; leg[1].x = -Math.sin(t * 20) * 0.8; expr = 'scream'; }
      else if (this.airTime > 0.25 && expr === 'neutral') expr = 'surprised';
    }
    if (s.swim) {
      rootRX = -1.15; rootY = -0.28;
      const sp = t * 4.2;
      arm[0].x = -2.4 + Math.sin(sp) * 0.9; arm[1].x = -2.4 + Math.sin(sp) * 0.9;
      arm[0].z = 0.75 + Math.cos(sp) * 0.65; arm[1].z = -0.75 - Math.cos(sp) * 0.65;
      arm[0].elbow = arm[1].elbow = -0.4 - Math.max(0, Math.cos(sp)) * 0.8;
      leg[0].x = Math.sin(sp * 1.3) * 0.6; leg[1].x = -Math.sin(sp * 1.3) * 0.6; leg[0].knee = leg[1].knee = 0.3;
      hand[0] = hand[1] = HANDS.open;
      hdRX += 0.9; lookPitch += 0.2;
      if (s.underwater) expr = 'puff';
    }
    if (s.sitting) {
      hipY = -0.13; leg[0].x = -1.45; leg[1].x = -1.45; leg[0].knee = 1.45; leg[1].knee = 1.45; leg[0].ankle = 0; leg[1].ankle = 0;
      if (s.ride) { leg[0].x = -1.2; leg[1].x = -1.2; leg[0].z = 0.45; leg[1].z = 0.45; }
      arm[0].x = -0.7; arm[1].x = -0.7; arm[0].elbow = -0.9; arm[1].elbow = -0.9;
      if (s.drive !== undefined && s.drive !== null) {
        const st = s.drive;
        arm[0].x = -1.25 - st * 0.25; arm[1].x = -1.25 + st * 0.25; arm[0].elbow = -0.55; arm[1].elbow = -0.55; arm[0].z = 0.3; arm[1].z = -0.3;
        chRZ += st * 0.12; hdRZ -= st * 0.06;
        hand[0] = hand[1] = HANDS.grip;
      }
    }
    if (s.sleeping) { rootRX = Math.PI / 2; rootY = 0.26; expr = 'sleep'; leg[0].x = 0.1; leg[1].knee = 0.4; arm[0].z = 0.8; arm[1].z = -0.7; arm[0].elbow = -0.6; hand[0] = hand[1] = HANDS.open; this.squash += Math.sin(t * 1.2) * 0.002; plant = false; }
    if (s.downed) { rootRX = Math.PI / 2 - 0.05; rootRZ = 0.2; rootY = 0.26; expr = 'ko'; arm[0].z = 1.6 + Math.sin(t * 9) * 0.06 * (Math.sin(t * 1.3) > 0.8 ? 1 : 0); arm[1].z = -1.4; leg[0].x = 0.3; leg[1].x = -0.2; leg[1].knee = 0.5; hand[0] = hand[1] = HANDS.open; hdRY = 0.4; plant = false; }
    if (s.carried) { rootRX = -Math.PI / 2.1; arm[0].x = -Math.PI * 0.9 + Math.sin(t * 3) * 0.2; arm[1].x = -Math.PI * 0.9 + Math.cos(t * 3) * 0.2; leg[0].x = Math.sin(t * 7) * 0.6; leg[1].x = -Math.sin(t * 7) * 0.6; hand[0] = hand[1] = HANDS.open; expr = s.downed ? 'ko' : 'angry'; plant = false; }

    // ---- actions (upper body)
    const act = s.action;
    if (s.holding) hand[1] = HANDS.grip;
    if (act && act.name) {
      const p = act.t ?? 0;
      const R = arm[1], Lh = arm[0];
      const lean = (x, y = 0) => { spRX += x * 0.4; chRX += x * 0.6; spRY += y * 0.4; chRY += y * 0.6; };
      switch (act.name) {
        case 'chop': case 'mine': case 'swing': case 'club': {
          const k = p < 0.45 ? p / 0.45 : p < 0.6 ? 1 - (p - 0.45) / 0.15 : 0;
          const strike = p >= 0.45 && p < 0.7 ? Math.sin(((p - 0.45) / 0.25) * Math.PI) : 0;
          R.x = -2.8 * k + 0.7 * strike - 0.3; R.elbow = -1.1 * k - 0.2; R.z = -0.2;
          Lh.x = -2.3 * k + 0.6 * strike - 0.2; Lh.elbow = -1.0 * k - 0.3; Lh.z = 0.3;
          lean(0.25 * k - 0.45 * strike, -0.25 * k);
          hand[1] = HANDS.grip; hand[0] = HANDS.fist;
          if (strike > 0.5) this.leanV.y -= 1.2 * dt;
          if (k > 0.5) expr = 'focus';
          break;
        }
        case 'crank': { const a = t * 10; R.x = -1.3 + Math.sin(a) * 0.4; R.elbow = -0.6 + Math.cos(a) * 0.4; Lh.x = -0.5; Lh.elbow = -0.8; lean(0, Math.sin(a) * 0.1); hand[1] = HANDS.grip; expr = 'rage'; break; }
        case 'wrench': { const a = Math.sin(t * 11); R.x = -1.4; R.elbow = -0.5; R.z = -0.25 + a * 0.3; Lh.x = -1.2; Lh.elbow = -0.6; Lh.z = 0.35; lean(-0.25); hand[1] = HANDS.grip; hand[0] = HANDS.claw; expr = 'focus'; break; }
        case 'hammer': { const k = Math.sin(p * Math.PI * 2) * 0.5 + 0.5; R.x = -1.3 - k * 0.9; R.elbow = -1.2 + k * 0.6; R.z = -0.3; hand[1] = HANDS.grip; expr = 'focus'; break; }
        case 'punch': { const k = Math.sin(Math.min(1, p * 2) * Math.PI); const side = act.side ? Lh : R; side.x = -1.6 * k - 0.2; side.elbow = -1.5 + 1.4 * k; side.z = (act.side ? 0.3 : -0.3); lean(-0.1 * k, (act.side ? -0.45 : 0.45) * k); hand[act.side ? 0 : 1] = HANDS.fist; expr = 'angry'; break; }
        case 'throw': { const k = p < 0.5 ? p / 0.5 : 1 - (p - 0.5) / 0.5; R.x = p < 0.5 ? -2.7 * k : -2.7 + 3.3 * (1 - k); R.elbow = -0.9; lean(0, p < 0.5 ? -0.5 * k : 0.5 * (1 - k)); hand[1] = p < 0.55 ? HANDS.grip : HANDS.open; expr = 'focus'; break; }
        case 'aim': R.x = -1.5 - lookPitch; R.elbow = -0.2; R.z = -0.05; Lh.x = -1.35 - lookPitch; Lh.elbow = -0.5; Lh.z = 0.35; hand[1] = HANDS.grip; hand[0] = HANDS.claw; expr = 'suspicious'; break;
        case 'eat': { const k = Math.sin(Math.min(1, p) * Math.PI); R.x = -1.9 * k - 0.2; R.elbow = -1.9 * k; R.z = -0.5 * k - 0.1; hand[1] = HANDS.grip; expr = 'chomp'; break; }
        case 'drink': { hipY -= 0.06; leg[0].knee += 1.2; leg[1].knee += 1.2; leg[0].x -= 0.8; leg[1].x -= 0.8; lean(-0.5); R.x = -1; Lh.x = -1; hand[0] = hand[1] = HANDS.open; expr = 'puff'; break; }
        case 'interact': { const k = Math.sin(Math.min(1, p) * Math.PI); R.x = -1.5 * k; R.elbow = -0.3; lean(-0.15 * k); hand[1] = HANDS.point; break; }
        case 'pickup': { const k = Math.sin(Math.min(1, p) * Math.PI); hipY -= 0.08 * k; lean(-0.6 * k); R.x = -1.0 * k; leg[0].knee += 0.9 * k; leg[1].knee += 0.9 * k; leg[0].x -= 0.55 * k; leg[1].x -= 0.55 * k; hand[1] = k > 0.6 ? HANDS.grip : HANDS.open; break; }
        case 'carry': R.x = -3.0; Lh.x = -3.0; R.elbow = -0.6; Lh.elbow = -0.6; R.z = -0.3; Lh.z = 0.3; hand[0] = hand[1] = HANDS.claw; expr = 'hurt'; break;
        case 'wave': R.x = -2.6; R.z = -0.55 + Math.sin(t * 12) * 0.45; R.elbow = -0.5; hand[1] = HANDS.open; expr = 'grin'; break;
        case 'point': R.x = -1.6 - lookPitch; R.elbow = 0; R.z = -0.05; hand[1] = HANDS.point; expr = 'surprised'; break;
        case 'dance': { hipY += Math.abs(Math.sin(t * 7)) * 0.05; chRZ += Math.sin(t * 7) * 0.25; hipRZ -= Math.sin(t * 7) * 0.12; R.x = -2.5 + Math.sin(t * 7) * 0.6; Lh.x = -2.5 - Math.sin(t * 7) * 0.6; R.z = -0.5; Lh.z = 0.5; hand[0] = hand[1] = HANDS.point; this.squash += Math.sin(t * 14) * 0.01; expr = 'laugh'; break; }
        case 'scream': R.x = -2.9 + Math.sin(t * 30) * 0.2; Lh.x = -2.9 + Math.cos(t * 30) * 0.2; hand[0] = hand[1] = HANDS.open; expr = 'scream'; this.talk = Math.max(this.talk, 0.5); break;
        case 'cheer': R.x = -3.0; Lh.x = -3.0; R.z = -0.7; Lh.z = 0.7; hipY += Math.abs(Math.sin(t * 9)) * 0.06; hand[0] = hand[1] = HANDS.fist; expr = 'grin'; break;
        case 'derp': expr = 'derp'; R.x = -0.4 + Math.sin(t * 6) * 0.4; Lh.x = -0.4 - Math.sin(t * 6) * 0.4; chRZ += Math.sin(t * 3) * 0.15; hand[0] = hand[1] = HANDS.open; break;
        case 'laugh': expr = 'laugh'; R.x = -1.2; Lh.x = -1.2; R.z = -1.0; Lh.z = 1.0; R.elbow = Lh.elbow = -1.4; hipY += Math.abs(Math.sin(t * 16)) * 0.025; lean(Math.sin(t * 16) * 0.05 - 0.1); break;
        case 'cry': expr = 'cry'; R.x = -2.2; Lh.x = -2.2; R.elbow = -2; Lh.elbow = -2; R.z = 0.15; Lh.z = -0.15; hand[0] = hand[1] = HANDS.fist; lean(-0.2); break;
        case 'rage': expr = 'rage'; R.x = -1.0 + Math.sin(t * 20) * 0.3; Lh.x = -1.0 - Math.sin(t * 20) * 0.3; R.elbow = -1.6; Lh.elbow = -1.6; hipY += Math.abs(Math.sin(t * 20)) * 0.02; hand[0] = hand[1] = HANDS.fist; break;
        case 'scan': R.x = -1.5 - lookPitch * 0.8; R.elbow = -0.5; R.z = 0.15; Lh.x = -1.1; Lh.elbow = -1.0; Lh.z = 0.45; hand[1] = HANDS.grip; expr = 'focus'; break;
        case 'pet': R.x = -1.2 + Math.sin(t * 8) * 0.2; R.elbow = -0.4; lean(-0.25); hand[1] = HANDS.open; expr = 'love'; break;
        case 'type': { const a = t * 13; R.x = -1.15 + Math.sin(a) * 0.05; Lh.x = -1.15 + Math.cos(a * 1.3) * 0.05; R.elbow = Lh.elbow = -1.05; R.z = -0.2; Lh.z = 0.2; lean(-0.18); hdRX -= 0.25; hand[0] = hand[1] = HANDS.type; break; }
        case 'tpose': R.x = 0; Lh.x = 0; R.z = -1.57; Lh.z = 1.57; R.elbow = 0; Lh.elbow = 0; hand[0] = hand[1] = HANDS.open; expr = 'smug'; break;
        default: break;
      }
    }
    if (s.holding && (!act || !act.name)) { arm[1].x = Math.min(arm[1].x, -0.35); arm[1].elbow = Math.min(arm[1].elbow, -0.75); }
    // ---- fidgets
    if (speed < 0.2 && grounded && !act?.name && !s.sitting && !s.sleeping && !s.downed && !s.carried && !s.swim) {
      this.fidget.next -= dt;
      if (!this.fidget.name && this.fidget.next <= 0) { this.fidget.name = ['scratch', 'look', 'stretch', 'tap', 'derp', 'whistle', 'bounce', 'gadget'][Math.floor(Math.random() * 8)]; this.fidget.t = 0; }
      if (this.fidget.name) {
        const f = this.fidget; f.t += dt;
        const dur = f.name === 'gadget' ? 2.6 : 1.8;
        const k = Math.sin(Math.min(1, f.t / dur) * Math.PI);
        if (f.name === 'scratch') { arm[1].x = -2.6 * k; arm[1].elbow = -2.1 * k; arm[1].z = -0.7 * k + Math.sin(t * 20) * 0.08 * k; hand[1] = HANDS.claw; hdRZ -= 0.15 * k; }
        if (f.name === 'look') lookYaw += Math.sin(f.t * 2.2) * 1.0 * k;
        if (f.name === 'stretch') { arm[0].x = -3.0 * k; arm[1].x = -3.0 * k; arm[0].z = 0.5; arm[1].z = -0.5; hand[0] = hand[1] = HANDS.open; spRX += 0.15 * k; this.squash += 0.06 * k; if (k > 0.6) expr = 'sleepy'; }
        if (f.name === 'tap') leg[1].ankle = -0.3 + Math.abs(Math.sin(t * 9)) * 0.45 * k;
        if (f.name === 'derp' && k > 0.2) expr = 'derp';
        if (f.name === 'whistle' && k > 0.2) expr = 'whistle';
        if (f.name === 'bounce') { this.squash += Math.sin(f.t * 12) * 0.04 * k; hipY += Math.abs(Math.sin(f.t * 6)) * 0.04 * k; expr = 'happy'; }
        if (f.name === 'gadget') { arm[0].x = -1.25 * k; arm[0].elbow = -1.7 * k; arm[0].z = 0.25 + 0.3 * (1 - k); hdRX -= 0.4 * k; hdRY -= 0.3 * k; if (k > 0.5) { expr = 'focus'; hand[1] = HANDS.point; arm[1].x = -0.9 * k; arm[1].elbow = -1.6 * k; arm[1].z = -0.1; } }
        if (f.t > dur) { f.name = null; f.next = 6 + Math.random() * 10; }
      }
    } else this.fidget.name = null;

    // ---- squash spring (steps, landings, jumps)
    const stepBounce = plant ? Math.abs(Math.sin(ph * Math.PI * 2)) * 0.03 * moving : 0;
    const sqT = (grounded ? -stepBounce : clamp((s.vy ?? 0) * 0.015, -0.05, 0.1)) + br * 0.006;
    this.squashV += ((sqT - this.squash) * 240 - this.squashV * 10) * dt;
    this.squash = clamp(this.squash + this.squashV * dt, -0.22, 0.18);

    // ---- apply (smoothed)
    const P = this.pose;
    const sm = (name, v, k = 14) => { P[name] = P[name] === undefined ? v : ease(P[name], v, k); return P[name]; };
    const B = this.B, rest = this.rest;
    this.body.rotation.set(sm('rootRX', rootRX, 8), 0, sm('rootRZ', rootRZ, 8));
    this.body.position.y = sm('rootY', rootY, 8);
    // jelly: lean and lag ride on top of the pose
    const lx = L.x / 0.5, lz = L.y / 0.5;
    B.spine.rotation.set(sm('spRX', spRX) + lz * 0.4, sm('spRY', spRY), sm('spRZ', spRZ) - lx * 0.4);
    B.chest.rotation.set(sm('chRX', chRX) + lz * 0.6, sm('chRY', chRY), sm('chRZ', chRZ) - lx * 0.6);
    const sq = this.squash;
    B.spine.scale.set(1 / Math.sqrt(Math.max(0.5, 1 + sq)), 1 + sq, 1 / Math.sqrt(Math.max(0.5, 1 + sq)));
    B.chest.scale.set(1 / B.spine.scale.x, 1 / B.spine.scale.y, 1 / B.spine.scale.z);
    // head: what the body does not turn, the head does (and the eyes do the rest)
    const shake = (this.face.shake ?? 0) * 0.04 * Math.sin(t * 43);
    const hy = clamp(lookYaw * 0.55, -0.75, 0.75), hp = clamp(lookPitch * 0.45, -0.5, 0.45);
    B.head.rotation.set(sm('hdRX', hdRX + hp, 10) + G.y * 0.6 + (this.face.chin ?? 0) * 0.5, sm('hdRY', hdRY + hy, 10) + G.x * 0.5 + shake, sm('hdRZ', hdRZ, 10) + shake * 0.5);
    // hips: bob to keep the lower foot on the ground, plus the pose's own drop
    B.hips.rotation.set(sm('hipRX', hipRX), sm('hipRY', hipRY), sm('hipRZ', hipRZ));
    for (let i = 0; i < 2; i++) {
      const n = i ? 'R' : 'L', sd = i ? 1 : -1;
      const ar = arm[i];
      B['upperArm' + n].rotation.set(-sm('ax' + i, ar.x), 0, -sm('az' + i, ar.z) - sd * A0);
      B['forearm' + n].quaternion.setFromAxisAngle(ELBOW[n], -sm('ae' + i, ar.elbow));
      const lr = leg[i];
      const lx2 = sm('lx' + i, lr.x), lk = sm('lk' + i, lr.knee), lzz = sm('lz' + i, lr.z ?? 0);
      B['thigh' + n].rotation.set(-lx2, 0, sd * lzz * 0.3);
      B['shin' + n].rotation.x = -lk;
      // feet stay flat on the ground while planted
      B['foot' + n].rotation.x = sm('la' + i, lr.ankle === null ? lx2 + lk : -(lr.ankle - lk * 0.5), 18);
      // fingers
      const h = hand[i];
      const c1 = sm('c1' + i, h.c1, 16), c2 = sm('c2' + i, h.c2, 16), ix = sm('ix' + i, h.ix, 16), ix2 = sm('ix2' + i, h.ix2, 16);
      const tx = sm('tx' + i, h.tx, 16), ty = sm('ty' + i, h.ty, 16);
      handQuat(sd, 0, 0, -c1, B['fng1' + n].quaternion);
      handQuat(sd, 0, 0, -c2, B['fng2' + n].quaternion);
      handQuat(sd, 0, 0, -ix, B['idx1' + n].quaternion);
      handQuat(sd, 0, 0, -ix2, B['idx2' + n].quaternion);
      handQuat(sd, tx, ty, 0, B['thb1' + n].quaternion);
      handQuat(sd, tx * 0.6, 0, 0, B['thb2' + n].quaternion);
    }
    // planted feet: drop the hips by however much the stance leg is shorter than straight
    let hipDrop = 0;
    if (plant) {
      let reach = 0;
      for (let i = 0; i < 2; i++) { const a = P['lx' + i], k = P['lk' + i]; reach = Math.max(reach, L1 * Math.cos(a) + L2 * Math.cos(a + k)); }
      hipDrop = reach - LEG;
    } else if (s.sitting) hipDrop = 0;
    B.hips.position.y = rest.hips.p.y + sm('hipY', hipY, 12) + (plant ? hipDrop : 0);
    // the chrono pack bounces on its mount
    this.packV += (-this.packX * 160 - this.packV * 7 + (plant ? Math.cos(ph * Math.PI * 4) * 6 * moving : 0) - az * 0.05) * dt;
    this.packX += this.packV * dt;
    B.pack.rotation.x = clamp(this.packX, -0.25, 0.25);

    // ---- face
    this.updateFace(dt, s, expr, lookYaw - hy, lookPitch - hp);
    // hit flash
    this.flash = Math.max(0, this.flash - dt * 3);
    const fl = this.mat.userData.u.uFlash.value; fl.set(1, 0.35, 0.3, this.flash);
  }

  updateFace(dt, s, expr, gazeYaw, gazePitch) {
    const t = this.t;
    const ease = (cur, target, k) => cur + (target - cur) * Math.min(1, dt * k);
    this.expr = expr;
    const target = EXPRESSIONS[expr];
    const F = this.face, FV = this.faceV;
    for (const k of PARAMS) {
      const tv = target[k] ?? 0;
      if (F[k] === undefined) { F[k] = tv; FV[k] = 0; }
      FV[k] += (tv - F[k]) * 220 * dt; FV[k] *= Math.exp(-15 * dt); F[k] += FV[k] * dt;
    }
    for (const k of ['chatter', 'chew', 'chin']) F[k] = ease(F[k] ?? 0, target[k] ?? 0, 10);
    for (const k of ['lu', 'll', 'br', 'ba']) { F[k] = F[k] ?? [...target[k]]; for (let i = 0; i < 2; i++) F[k][i] = ease(F[k][i], target[k][i], k === 'lu' || k === 'll' ? 22 : 12); }
    // cartoon eye marks fade out before the next fades in
    if (target.mode !== this.mode) { this.modeK -= dt * 9; if (this.modeK <= 0) { this.modeK = 0; this.mode = target.mode; } }
    else if (this.mode) this.modeK = Math.min(1, this.modeK + dt * 9);
    // blinks, glances
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.13; this.blinkT = 1.8 + Math.random() * 4 + (Math.random() < 0.15 ? -1.5 : 0); }
    this.blink = Math.max(0, this.blink - dt);
    const bk = this.blink > 0 ? Math.sin((this.blink / 0.13) * Math.PI) : 0;
    this.glance.t -= dt;
    if (this.glance.t <= 0) { this.glance.t = 0.8 + Math.random() * 2.8; const r = Math.random(); this.glance.yaw = r < 0.5 ? (Math.random() - 0.5) * 0.8 : 0; this.glance.pitch = r < 0.5 ? (Math.random() - 0.5) * 0.4 : 0; }
    const talkTarget = Math.max(s.talk ?? 0, expr === 'scream' ? 0.4 : 0);
    this.talk = ease(this.talk, talkTarget, 18);
    // eyes
    const bias = target.bias;
    let gx = clamp(-gazeYaw * 0.35 + this.glance.yaw * 0.4, -0.45, 0.45), gy = clamp(gazePitch * 0.35 + this.glance.pitch * 0.4, -0.4, 0.4);
    if (bias === 'down') gy = -0.3; else if (bias === 'look') gy -= 0.04;
    const jit = bias === 'none' ? Math.sin(t * 50) * 0.02 : 0;
    this.eyes.forEach((e, i) => {
      const u = this.H.eyeMats[i].userData.u;
      const side = e.userData.side; // +1 right eye, -1 left
      const k = side > 0 ? 1 : 0; // expression arrays are [left, right]
      const top = 0.98 - F.lu[k] * 1.06, bot = -0.95 + F.ll[k] * 0.87;
      u.uLid.value.set(top + (-0.1 - top) * bk, bot + (-0.1 - bot) * bk, F.tilt * 0.6, 0.16);
      let lx = gx * side;
      if (bias === 'cross') lx = side > 0 ? -0.34 : 0.18;
      u.uLook.value.x = clamp(lx + jit, -0.45, 0.45);
      u.uLook.value.y = gy;
      u.uLook.value.z = F.ps;
      u.uMode.value.set(this.mode, this.modeK, t, 0);
    });
    // brows: raise along the face, tilt in its plane (angry = inner ends down)
    this.brows.forEach((b) => {
      const side = b.userData.side, k = side > 0 ? 1 : 0;
      b.userData.bar.position.y = F.br[k] * 0.011 + (F.lu[k] > 0.5 ? -0.004 : 0);
      b.userData.bar.rotation.z = F.ba[k] * 0.32 * -side;
    });
    // mouth
    const u = this.mat.userData.u;
    const chatter = (F.chatter ?? 0) > 0.05 ? Math.abs(Math.sin(t * 38)) * 0.005 * F.chatter : 0;
    const chew = (F.chew ?? 0) > 0.05 ? (0.5 + 0.5 * Math.sin(t * 13)) * 0.013 * F.chew : 0;
    const W = Math.max(0.008, F.W * (1 - F.P * 0.6) * (1 + this.talk * 0.08));
    const O = Math.max(0, F.O + this.talk * 0.018 * (0.6 + 0.4 * Math.sin(t * 29) * Math.sin(t * 17)) + chatter + chew);
    u.uMouthA.value.set(W, O, F.S, F.A);
    u.uMouthB.value.set(F.P, F.T, F.G, this.outfit.teeth ?? 0);
    u.uFace.value.z = clamp(F.blush, 0, 1);
    // particles for some faces
    this.fxT -= dt;
    if (target.fx && this.fx && this.fxT <= 0) this.emitFaceFx(target.fx);
  }
  emitFaceFx(kind) {
    const fx = this.fx;
    const eye = this.eyes[Math.random() < 0.5 ? 0 : 1];
    eye.getWorldPosition(_w);
    const r = BEAN.eyeR;
    if (kind === 'tears') { this.fxT = 0.18; fx.sprite('drop', _w.x, _w.y - r * 0.6, _w.z, { vy: 0.4, vx: (Math.random() - 0.5) * 1.2, vz: (Math.random() - 0.5) * 1.2, grav: 7, life: 0.8, size: 0.05, color: 0x9ad8ff }); }
    else if (kind === 'sweat') { this.fxT = 0.5; fx.sprite('drop', _w.x + (Math.random() - 0.5) * 0.3, _w.y + 0.1, _w.z, { vy: 0.6, grav: 6, life: 0.7, size: 0.045, color: 0xc8eaff }); }
    else if (kind === 'zzz') { this.fxT = 1.4; fx.sprite('zzz', _w.x, _w.y + 0.25, _w.z, { vy: 0.35, vx: 0.15, life: 2.2, size: 0.16, color: 0xffffff, drag: 0.5 }); }
    else if (kind === 'stars') { this.fxT = 0.3; const a = this.t * 4; fx.sprite('star', _w.x + Math.cos(a) * 0.22, _w.y + 0.26, _w.z + Math.sin(a) * 0.22, { life: 0.6, size: 0.09, color: 0xffe060 }); }
    else if (kind === 'hearts') { this.fxT = 0.7; fx.sprite('heart', _w.x, _w.y + 0.22, _w.z, { vy: 0.5, life: 1.2, size: 0.11, color: 0xff6a8a, drag: 0.6 }); }
    else if (kind === 'steam') { this.fxT = 0.12; fx.sprite('smoke', _w.x + (Math.random() - 0.5) * 0.2, _w.y + 0.28, _w.z, { vy: 1.2, life: 0.9, size: 0.11, grow: 0.4, alpha: 0.5, color: 0xffffff }); }
  }
}

// Render a character's head and shoulders to a small canvas for UI portraits.
export function portrait(renderer, outfit, size = 64) {
  const c = new Character(outfit);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
  const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(1, 2, -3); scene.add(d);
  scene.add(c.root);
  c.root.rotation.y = Math.PI;
  c.update(0.016, { expr: 'happy' });
  c.root.updateMatrixWorld(true);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 10);
  cam.position.set(0.25, 0.95, 1.6); cam.lookAt(0, 0.86, 0);
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam); renderer.setRenderTarget(null);
  renderer.setClearColor(0x000000, 1);
  const buf = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
  rt.dispose(); c.dispose();
  const p = new PixelPainter(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const k = ((size - 1 - y) * size + x) * 4; p.data.set(buf.subarray(k, k + 4), (y * size + x) * 4); }
  return p;
}
