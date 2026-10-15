// First-person viewmodel: your own suit sleeves and gloves in front of the
// camera (the character's mesh, cut down to each arm, with fingers that curl
// around what they hold). The right hand holds whatever is on your hotbar and
// swings, chops, eats and pokes with it; the left hand holds the Pocket Prof
// (the egg-shaped professor gadget) with its live little screen, and brings
// it up in front of you when you use it. Bobs, sways and lags as you move.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { patchMaterial } from '../gfx/shaderlib.js';
import { buildItemModel } from '../gfx/itemModels.js';
import { ITEMS } from '../data/items.js';
import { paintSet, sstep, rgb, mix3, mul3 } from '../gfx/paint.js';
import { tileFbm } from '../core/rng.js';
import { buildFPArm } from './humanModel.js';
import { BEAN } from './humanDesign.js';
import { handQuat, HANDS } from './character.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const mesh = (g, m) => { const x = new THREE.Mesh(g, m); x.castShadow = false; x.receiveShadow = true; return x; };
const mats = new Map();
const M = (key, make) => { if (!mats.has(key)) mats.set(key, patchMaterial(make(), {})); return mats.get(key); };

// ------------------------------------------------------------------ the Pocket Prof
// An egg of glossy mint bakelite with a cream face plate, a chrome-ringed
// green phosphor screen, three fat buttons, an antenna with a bulb, a speaker
// grille, a little signal needle gauge and a keyring loop.
export const LCD_W = 160, LCD_H = 120;
function bakelite() {
  return paintSet(256, 256, (u, v) => {
    const n = tileFbm(u * 6, v * 6, 6, 4, 77), n2 = tileFbm(u * 24, v * 24, 24, 2, 78);
    // mottled bakelite swirls
    const sw = 0.5 + 0.5 * Math.sin((u * 9 + n * 3.5) * Math.PI);
    const c = mix3(rgb(0x6fbf9e), rgb(0x8fd8b8), sw * 0.35 + n * 0.25);
    return { c: mul3(c, 0.94 + n2 * 0.08), h: n2 * 0.1, r: 0.3 };
  }, { normal: 0.6, rough: 0.3 });
}
function plate() {
  return paintSet(256, 256, (u, v) => {
    const n = tileFbm(u * 5, v * 5, 5, 3, 79);
    let c = mul3(rgb(0xf0e4c4), 0.95 + n * 0.08);
    // a printed brand strip with a cartoon atom above the buttons + rivets
    const ax = u - 0.5, ay = v - 0.23;
    const ring = (rx, ry, rot) => { const c2 = Math.cos(rot), s2 = Math.sin(rot); const x = ax * c2 + ay * s2, y = -ax * s2 + ay * c2; return Math.abs(Math.hypot(x / rx, y / ry) - 1); };
    if (Math.min(ring(0.09, 0.03, 0), ring(0.09, 0.03, 1.05), ring(0.09, 0.03, -1.05)) < 0.12) c = rgb(0xd8502e);
    if (Math.hypot(ax, ay) < 0.012) c = rgb(0xd8502e);
    for (const [rx, ry] of [[0.12, 0.08], [0.88, 0.08], [0.12, 0.92], [0.88, 0.92]]) { const d = Math.hypot(u - rx, v - ry); if (d < 0.02) c = mix3(rgb(0x9a9a92), rgb(0xe8e8e0), sstep(0.02, 0.0, d)); }
    return { c, h: n * 0.1, r: 0.45 };
  }, { normal: 0.5, rough: 0.45 });
}
export function buildDevice() {
  const g = new THREE.Group();
  const bk = bakelite(), pl = plate();
  const shell = M('dev:shell', () => new THREE.MeshPhysicalMaterial({ map: bk.map, normalMap: bk.normalMap, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 }));
  const face = M('dev:face', () => new THREE.MeshPhysicalMaterial({ map: pl.map, normalMap: pl.normalMap, roughness: 0.45, clearcoat: 0.4 }));
  const chrome = M('dev:chrome', () => new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.18, metalness: 1 }));
  // egg body: a flattened, top-narrow ellipsoid
  const eg = new THREE.SphereGeometry(1, 40, 28);
  const p = eg.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 - y * 0.1; p.setXYZ(i, x * 0.074 * k, y * 0.09, z * 0.032); }
  eg.computeVertexNormals();
  const body = mesh(eg, shell); g.add(body);
  // the cream face plate on the front (+Z faces the player)
  const fp = mesh(new THREE.CircleGeometry(1, 40).scale(0.066, 0.08, 1), face); fp.position.z = 0.0295; g.add(fp);
  // screen bezel + the screen itself
  const SW = 0.084, SH = 0.063, SY = 0.014;
  const bez = mesh(new RoundedBoxGeometry(SW + 0.012, SH + 0.012, 0.008, 3, 0.005), chrome); bez.position.set(0, SY, 0.031); g.add(bez);
  const canvas = document.createElement('canvas'); canvas.width = LCD_W; canvas.height = LCD_H;
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  // the phosphor glows a bit (emissive) so it reads at night
  const scrMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.25 });
  patchMaterial(scrMat, {});
  const scr = mesh(new THREE.PlaneGeometry(SW, SH), scrMat); scr.position.set(0, SY, 0.0355); g.add(scr);
  const glass = mesh(new THREE.PlaneGeometry(SW, SH), M('dev:glass', () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.02, clearcoat: 1, depthWrite: false })));
  glass.position.set(0, SY, 0.0365); glass.renderOrder = 4; g.add(glass);
  // three fat buttons
  const btns = [];
  for (const [i, col] of [[0, 0xd8402e], [1, 0xe8b830], [2, 0x4aa85a]]) {
    const b = mesh(new THREE.CylinderGeometry(0.0085, 0.009, 0.007, 18).rotateX(Math.PI / 2), M('dev:btn' + col, () => new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.3, clearcoat: 0.8 })));
    b.position.set((i - 1) * 0.022, -0.05 + (i === 1 ? -0.004 : 0), 0.031); g.add(b); btns.push(b);
  }
  // antenna with a bulb, a keyring loop, a speaker grille and a little needle gauge
  const ant = mesh(new THREE.CylinderGeometry(0.0018, 0.0025, 0.05, 6), chrome); ant.position.set(0.034, 0.098, 0); ant.rotation.z = -0.35; g.add(ant);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0x501010, emissive: 0xff3020, emissiveIntensity: 0.2, roughness: 0.3 });
  patchMaterial(bulbMat, {});
  const bulb = mesh(new THREE.SphereGeometry(0.0055, 10, 8), bulbMat); bulb.position.set(0.043, 0.122, 0); g.add(bulb);
  const loop = mesh(new THREE.TorusGeometry(0.009, 0.0022, 6, 14), chrome); loop.position.set(-0.02, 0.092, 0); g.add(loop);
  for (let k = 0; k < 9; k++) { const h = mesh(new THREE.CircleGeometry(0.0018, 6), M('dev:hole', () => new THREE.MeshStandardMaterial({ color: 0x1a1a18, roughness: 0.9 }))); h.position.set(-0.05 + (k % 3) * 0.0055, -0.052 + Math.floor(k / 3) * 0.0055, 0.0302); g.add(h); }
  const gauge = mesh(new THREE.CircleGeometry(0.009, 16), M('dev:gauge', () => new THREE.MeshStandardMaterial({ color: 0xfff6dc, roughness: 0.5 }))); gauge.position.set(0.05, -0.048, 0.0305); g.add(gauge);
  const needle = mesh(new THREE.PlaneGeometry(0.0012, 0.008).translate(0, 0.004, 0), M('dev:needle', () => new THREE.MeshBasicMaterial({ color: 0xc02a1a }))); needle.position.set(0.05, -0.051, 0.0309); g.add(needle);
  g.userData.device = { canvas, ctx: canvas.getContext('2d'), tex, scr, btns, bulb, needle, SW, SH, screenZ: 0.0355, screenY: SY };
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}

// ------------------------------------------------------------------ the viewmodel
export class Viewmodel {
  constructor(game) {
    this.name = 'viewmodel';
    this.g = game;
    this.group = new THREE.Group(); this.group.name = 'viewmodel';
    game.engine.scene.add(this.group);
    this.inner = new THREE.Group(); this.group.add(this.inner); // sway / bob
    this.t = 0; this.phase = 0;
    this.sway = new THREE.Vector2(); this.swayV = new THREE.Vector2();
    this.dip = 0; this.dipV = 0;
    this.prevYaw = null; this.prevPitch = 0;
    this.raise = 0; // 0 = device at your side, 1 = up in front of you
    this.heldId = undefined;
    this.device = buildDevice();
    this.build();
  }
  build() {
    const ch = this.g.local.char;
    this.charRef = ch;
    if (this.R) for (const H of [this.R, this.L]) { this.inner.remove(H.root); H.arm.mesh.removeFromParent(); H.B['forearm' + H.n].removeFromParent(); H.B['upperArm' + H.n].removeFromParent(); }
    this.R = this.makeHand(ch, 1);
    this.L = this.makeHand(ch, -1);
    this.inner.add(this.R.root, this.L.root);
    this.L.grip.add(this.device);
    this.device.position.set(0.012, 0.05, 0.02); this.device.rotation.set(0, 0, 0);
    this.heldId = undefined;
  }
  // a sleeve and glove (the character's own mesh) whose fist sits at the hand group's origin;
  // grip = where things are held, in the same frame the old mittens used
  makeHand(ch, side) {
    const n = side > 0 ? 'R' : 'L';
    const root = new THREE.Group();
    const hand = new THREE.Group(); root.add(hand);
    const arm = buildFPArm(ch.H, n, ch.mat);
    const B = arm.bones;
    // the glove in the hand frame. Right: a fist round a handle that leans forward (the old tool
    // grip), knuckles to the front-left, thumb on top. Left: cradling the gadget from below.
    const A = BEAN.armAngle;
    const d0 = new THREE.Vector3(side * Math.sin(A), -Math.cos(A), 0), t0 = new THREE.Vector3(0, 0, -1);
    const t1 = side > 0 ? new THREE.Vector3(0.06, 0.88, -0.48).normalize() : new THREE.Vector3(0.45, 0.85, 0.25).normalize();
    const d1 = side > 0 ? new THREE.Vector3(-0.95, 0.12, -0.32) : new THREE.Vector3(0.25, -0.15, -1);
    d1.addScaledVector(t1, -d1.dot(t1)).normalize();
    const m0 = new THREE.Matrix4().makeBasis(d0, t0, d0.clone().cross(t0));
    const m1 = new THREE.Matrix4().makeBasis(d1, t1, d1.clone().cross(t1));
    const Q0 = new THREE.Quaternion().setFromRotationMatrix(m1.multiply(m0.transpose()));
    const ph = ch.H.grips[n].position.clone().applyQuaternion(Q0).negate();
    B['hand' + n].position.copy(ph); B['hand' + n].quaternion.copy(Q0);
    hand.add(B['hand' + n]);
    this.inner.add(B['forearm' + n], B['upperArm' + n], arm.mesh);
    const grip = new THREE.Group(); hand.add(grip);
    return { root, hand, grip, side, n, arm, B, Q0, ph, pos: new THREE.Vector3(), rot: new THREE.Euler(), fist: {} };
  }
  setHeld(id) {
    if (id === this.heldId) return;
    this.heldId = id;
    if (this.held) { this.R.grip.remove(this.held); this.held = null; }
    if (!id || !ITEMS[id]) return;
    const d = ITEMS[id];
    const m = buildItemModel(d);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
    const g = new THREE.Group(); g.add(m);
    const tool = d.cat === 'tool' || d.cat === 'weapon';
    if (tool) { m.position.y = -0.04; g.rotation.set(-0.5, Math.PI, 0.15); }
    else { m.scale.setScalar(0.85); g.rotation.set(-0.2, Math.PI * 0.8, 0); g.position.set(0, 0.02, -0.03); }
    if (['scanner', 'flashlight', 'walkie', 'binoculars'].includes(d.tool?.kind)) { g.rotation.set(-1.35, Math.PI, 0); m.position.set(0, -0.02, 0); }
    this.held = g;
    this.R.grip.add(g);
  }
  visible() {
    const g = this.g, p = g.local, rig = g.rig;
    return !!((rig.firstPerson || g.forceFirstPerson) && !g.titleMode && !rig.override && !p.sitting && !p.downed && !p.carriedBy && !p.sleeping && !g.cameraOverride?.());
  }
  lateUpdate(dt) {
    const g = this.g, p = g.local, cam = g.engine.camera;
    const vis = this.visible();
    this.group.visible = vis;
    if (!vis) return;
    if (this.charRef !== p.char) this.build();
    this.setHeld(p.heldId);
    this.t += dt;
    const t = this.t;
    this.group.position.copy(cam.position);
    this.group.quaternion.copy(cam.quaternion);
    // ---- sway (hands lag behind where you look) + bob + landing dip
    const yaw = g.rig.yaw, pitch = g.rig.pitch;
    if (this.prevYaw === null) { this.prevYaw = yaw; this.prevPitch = pitch; }
    let dy = yaw - this.prevYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const dp = pitch - this.prevPitch;
    this.prevYaw = yaw; this.prevPitch = pitch;
    this.swayV.x += (-this.sway.x * 160 - this.swayV.x * 13) * dt + dy * 2.2;
    this.swayV.y += (-this.sway.y * 160 - this.swayV.y * 13) * dt - dp * 2.2;
    this.sway.addScaledVector(this.swayV, dt);
    this.sway.clampLength(0, 0.08);
    const hs = Math.hypot(p.vel.x, p.vel.z);
    const moving = p.grounded && !p.swim ? Math.min(1, hs / 3.6) : 0;
    this.phase += hs * dt * (p.sprint ? 1.9 : 2.3);
    const ph = this.phase;
    const amp = moving * (p.sprint ? 1.7 : 1);
    if (p.grounded && !this.wasGrounded && this.airT > 0.15) this.dipV -= 1.2 + Math.min(2, this.airT * 2);
    this.airT = p.grounded ? 0 : (this.airT ?? 0) + dt;
    this.wasGrounded = p.grounded;
    this.dipV += (-this.dip * 180 - this.dipV * 11) * dt;
    this.dip += this.dipV * dt;
    const calm = 1 - this.raise;
    this.inner.position.set((this.sway.x * 0.6 + Math.sin(ph) * 0.012 * amp) * calm, (-Math.abs(Math.cos(ph)) * 0.018 * amp + this.dip * 0.06 + this.sway.y * 0.6 + Math.sin(t * 1.6) * 0.003) * calm, 0);
    this.inner.rotation.set(this.sway.y * 1.2 * calm, this.sway.x * 1.5 * calm, Math.sin(ph) * 0.03 * amp * calm);
    // ---- device raise
    const want = g.device?.raised ? 1 : g.device?.peek ? 0.45 : 0;
    this.raise += (want - this.raise) * Math.min(1, dt * 9);
    const r = this.raise;
    if (r < 0.001) this.device.scale.setScalar(1);
    // ---- pose the hands
    const act = p.action;
    const R = this.R, L = this.L;
    // rest: right low right, left holding the device low left with its screen tipped up at you
    R.pos.set(0.21, -0.19, -0.42); R.rot.set(-0.15, 0.05, 0.1);
    L.pos.set(-0.21, -0.23, -0.4); L.rot.set(-0.5, 0.35, 0.15);
    // short landscape phone screens: keep the gadget lower and out of the way
    if (innerHeight < 520) { L.pos.set(-0.26, -0.27, -0.42); R.pos.set(0.24, -0.25, -0.42); }
    if (p.sprint && moving > 0.3) { const k = Math.sin(ph); R.pos.y += k * 0.04; R.pos.z += k * 0.05; L.pos.y -= k * 0.03; R.rot.x -= 0.3; }
    if (p.swim) { const k = Math.sin(t * 4.5); R.pos.set(0.18 + k * 0.08, -0.2, -0.5 + Math.cos(t * 4.5) * 0.08); L.pos.set(-0.18 - k * 0.08, -0.22, -0.5 + Math.cos(t * 4.5) * 0.08); R.rot.set(0.3, 0, 0.6); }
    if (act) {
      const k = Math.min(1, act.t ?? 0);
      const S = Math.sin(k * Math.PI);
      switch (act.name) {
        case 'chop': case 'mine': case 'swing': case 'club': {
          // wind up over the shoulder, strike down across, recover
          const wind = k < 0.45 ? k / 0.45 : k < 0.62 ? 1 - (k - 0.45) / 0.17 : 0;
          const strike = k >= 0.45 && k < 0.75 ? Math.sin(((k - 0.45) / 0.3) * Math.PI) : 0;
          R.pos.set(0.2 + wind * 0.1 - strike * 0.18, -0.22 + wind * 0.2 - strike * 0.12, -0.42 + wind * 0.08 - strike * 0.12);
          R.rot.set(-0.15 + wind * 1.1 - strike * 1.5, 0.05 + wind * 0.3, 0.1 + wind * 0.4 - strike * 0.6);
          break;
        }
        case 'hammer': { const h = Math.abs(Math.sin(k * Math.PI * 2)); R.pos.y += h * 0.12; R.rot.x += h * 1.0 - 0.3; break; }
        case 'punch': { const H = act.side ? L : R; H.pos.z -= S * 0.25; H.pos.x += (act.side ? 0.12 : -0.12) * S; H.rot.x += S * 0.2; break; }
        case 'throw': { const wind = k < 0.5 ? k / 0.5 : 1 - (k - 0.5) / 0.5; if (k < 0.5) { R.pos.set(0.26, -0.08, -0.25); R.rot.set(1.0 * wind, 0.3, 0.3); } else { R.pos.set(0.1, -0.2, -0.65 + wind * 0.2); R.rot.set(-0.8, 0, 0); } break; }
        case 'aim': R.pos.set(0.07, -0.17, -0.42); R.rot.set(0.0, 0.02, 0); L.pos.set(-0.05, -0.22, -0.48); break;
        case 'eat': { R.pos.set(0.05 + (1 - S) * 0.15, -0.16 - (1 - S) * 0.06, -0.24 - (1 - S) * 0.18); R.rot.set(0.6 * S, 0.3, 0.2); R.pos.y += Math.abs(Math.sin(t * 13)) * 0.015 * S; break; }
        case 'drink': { R.pos.set(0.04, -0.12, -0.25); R.rot.set(1.1 * S, 0.2, 0.2); break; }
        case 'interact': case 'pet': { R.pos.set(0.14, -0.16, -0.42 - S * 0.2); R.rot.set(-0.4 * S, 0, 0); if (act.name === 'pet') R.pos.y += Math.sin(t * 9) * 0.03; break; }
        case 'pickup': { R.pos.y -= S * 0.22; R.pos.z -= S * 0.12; R.rot.x -= S * 0.5; break; }
        case 'crank': { R.pos.set(0.12 + Math.cos(t * 10) * 0.06, -0.2 + Math.sin(t * 10) * 0.06, -0.5); break; }
        case 'wrench': { R.pos.set(0.1, -0.18, -0.5); R.rot.set(-0.2, 0, Math.sin(t * 11) * 0.5); break; }
        case 'scan': R.pos.set(0.1, -0.17, -0.44); R.rot.set(-0.05, 0, 0); break;
        case 'carry': R.pos.set(0.24, 0.12, -0.4); L.pos.set(-0.24, 0.12, -0.4); R.rot.set(0.9, 0, 0.3); L.rot.set(0.9, 0, -0.3); break;
        default: break;
      }
    }
    const emo = p.emote;
    if (emo === 'wave' || emo === 'cheer' || emo === 'dance') { R.pos.set(0.24, 0.02 + Math.sin(t * 10) * 0.03, -0.5); R.rot.set(0.2, 0, 0.6 + Math.sin(t * 12) * 0.4); if (emo !== 'wave') { L.pos.set(-0.24, 0.02 + Math.cos(t * 10) * 0.03, -0.5); } }
    // the device comes up in front of you
    if (r > 0.001) {
      // put the screen in the middle of the view, big enough to read (bigger on small screens)
      const s = 1 + r * 0.65;
      this.device.scale.setScalar(s);
      const frac = innerHeight < 520 ? 0.82 : 0.66;
      const ta = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * frac;
      const D0 = this.device.userData.device;
      const dist = Math.max(0.085, (D0.SH * s) / 2 / ta);
      const dpos = _v.set(-0.012, -0.07 - D0.screenY * s, -dist + 0.01 - D0.screenZ * s);
      L.pos.lerp(dpos, r);
      L.rot.set(L.rot.x * (1 - r) + 0.02 * r, L.rot.y * (1 - r), L.rot.z * (1 - r));
      R.pos.lerp(_v.set(0.11, -0.13, -0.3), r * 0.9);
      R.rot.set(R.rot.x * (1 - r) - 0.3 * r, R.rot.y * (1 - r) - 0.3 * r, R.rot.z * (1 - r));
    }
    // fingers: a fist round whatever is held, open for waves and pokes, the left cradles the gadget
    const busy = act?.name;
    const fR = busy === 'interact' || busy === 'pet' ? (busy === 'pet' ? HANDS.open : HANDS.point) : emo === 'wave' ? HANDS.open : this.held || busy ? HANDS.grip : HANDS.rest;
    const fL = HANDS.claw;
    for (const H of [R, L]) {
      const k = Math.min(1, dt * 16);
      H.hand.position.lerp(H.pos, k);
      _q.setFromEuler(H.rot);
      H.hand.quaternion.slerp(_q, k);
      const sd = H.side, n = H.n, B = H.B, f = H.fist, want = sd > 0 ? fR : fL;
      for (const key of ['c1', 'c2', 'ix', 'ix2', 'tx', 'ty']) f[key] = f[key] === undefined ? want[key] : f[key] + (want[key] - f[key]) * Math.min(1, dt * 14);
      handQuat(sd, 0, 0, -f.c1, B['fng1' + n].quaternion); handQuat(sd, 0, 0, -f.c2, B['fng2' + n].quaternion);
      handQuat(sd, 0, 0, -f.ix, B['idx1' + n].quaternion); handQuat(sd, 0, 0, -f.ix2, B['idx2' + n].quaternion);
      handQuat(sd, f.tx, f.ty, 0, B['thb1' + n].quaternion); handQuat(sd, f.tx * 0.6, 0, 0, B['thb2' + n].quaternion);
      // the sleeve runs from the wrist toward a shoulder below the screen edge (the wrist bends to suit)
      H.hand.updateMatrix();
      const wrist = _v.copy(H.ph).applyMatrix4(H.hand.matrix);
      _q2.copy(H.hand.quaternion).multiply(H.Q0);
      const back = _a.copy(H.arm.wristToElbow).normalize().applyQuaternion(_q2);
      const toSh = _b.set(sd * 0.3, -0.72, 0.12).sub(wrist).normalize();
      _q3.setFromUnitVectors(back, toSh).multiply(_q2);
      _q3.slerp(_q2, 0.18);
      for (const [bn, off] of [['forearm', H.arm.wristToElbow], ['upperArm', H.arm.wristToShoulder]]) {
        const bone = B[bn + n];
        bone.quaternion.copy(_q3);
        bone.position.copy(off).applyQuaternion(_q3).add(wrist);
      }
    }
    // with the device up, nothing in the right hand gets in the way
    if (this.held) this.held.visible = r < 0.6;
    // device bits
    const D = this.device.userData.device;
    D.bulb.material.emissiveIntensity = g.device?.alert ? (Math.sin(t * 9) > 0 ? 3 : 0.3) : 0.25;
    D.needle.rotation.z = Math.sin(t * 0.7) * 0.4 + Math.sin(t * 5.3) * 0.08 + (g.device?.signal ?? 0.6) - 0.8;
    void _e;
  }
  // where the device screen corners are on screen (for lining up the HTML screen)
  screenQuad(out = []) {
    const D = this.device.userData.device, cam = this.g.engine.camera;
    this.device.updateWorldMatrix(true, false);
    const w = D.SW / 2, h = D.SH / 2;
    const pts = [[-w, h], [w, h], [w, -h], [-w, -h]];
    out.length = 0;
    for (const [x, y] of pts) {
      _v.set(x, D.screenY + y, D.screenZ + 0.0015).applyMatrix4(this.device.matrixWorld).project(cam);
      out.push([(_v.x * 0.5 + 0.5) * innerWidth, (-_v.y * 0.5 + 0.5) * innerHeight]);
    }
    return out;
  }
}
const _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

export async function install(g) {
  const V = new Viewmodel(g);
  g.viewmodel = V;
  g.addSystem(V);
  return V;
}
