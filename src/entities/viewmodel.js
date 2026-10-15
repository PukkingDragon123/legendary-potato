// First-person viewmodel: your own suit sleeves and gloves in front of the
// camera (the character's mesh, cut down to each arm, with fingers that curl
// around what they hold). The right hand holds whatever is in your tool slot
// or pockets and swings, chops, eats and pokes with it; the left wrist carries
// the CHRONO-LINK gadget, which you raise to project the hologram screens (a
// beam of light fans out from it). Bobs, sways and lags as you move.
import * as THREE from 'three';
import { buildItemModel } from '../gfx/itemModels.js';
import { ITEMS } from '../data/items.js';
import { buildFPArm } from './humanModel.js';
import { BEAN } from './humanDesign.js';
import { handQuat, HANDS } from './character.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

// the projector beam: a soft fan of light from the gadget towards the screen
function beamMesh() {
  const g = new THREE.CylinderGeometry(0.42, 0.012, 1, 24, 1, true);
  g.translate(0, -0.5, 0); g.rotateX(-Math.PI / 2); // narrow end at the origin, opening along -Z
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uK: { value: 0 }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uK, uT;
      void main(){
        float along = 1.0 - vUv.y;
        float lines = 0.55 + 0.45 * sin(vUv.x * 120.0 + uT * 3.0) * sin(along * 40.0 - uT * 9.0);
        float a = uK * smoothstep(0.0, 0.08, along) * (1.0 - smoothstep(0.55, 1.0, along)) * lines * 0.22;
        gl_FragColor = vec4(vec3(0.35, 0.92, 1.0) * a, a);
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.renderOrder = 8;
  return mesh;
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
    this.raise = 0; // 0 = arm at your side, 1 = wrist up, projecting the hologram
    this.heldId = undefined;
    this.beam = beamMesh(); this.inner.add(this.beam);
    this.build();
  }
  build() {
    const ch = this.g.local.char;
    this.charRef = ch;
    if (this.R) for (const H of [this.R, this.L]) { this.inner.remove(H.root); H.arm.mesh.removeFromParent(); H.B['forearm' + H.n].removeFromParent(); H.B['upperArm' + H.n].removeFromParent(); }
    this.R = this.makeHand(ch, 1);
    this.L = this.makeHand(ch, -1);
    this.inner.add(this.R.root, this.L.root);
    // where the gadget's screen sits on the left forearm (rest pose, relative to the elbow)
    const G = ch.H.D.anim.gadget;
    this.gadget = G ? { off: new THREE.Vector3(G.c[0] - G.el[0], G.c[1] - G.el[1], G.c[2] - G.el[2]), up: new THREE.Vector3(...G.up) } : null;
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
    // grip), knuckles to the front-left, thumb on top. Left: a relaxed hand, back of the wrist up.
    const A = BEAN.armAngle;
    const d0 = new THREE.Vector3(side * Math.sin(A), -Math.cos(A), 0), t0 = new THREE.Vector3(0, 0, -1);
    const t1 = side > 0 ? new THREE.Vector3(0.06, 0.88, -0.48).normalize() : new THREE.Vector3(0.1, 0.55, -0.83).normalize();
    const d1 = side > 0 ? new THREE.Vector3(-0.95, 0.12, -0.32) : new THREE.Vector3(0.9, -0.1, -0.4);
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
    // ---- wrist up to project the hologram
    const want = g.device?.raised ? 1 : 0;
    this.raise += (want - this.raise) * Math.min(1, dt * 9);
    const r = this.raise;
    // ---- pose the hands
    const act = p.action;
    const R = this.R, L = this.L;
    // rest: right low right, left relaxed low left (mostly below the screen edge)
    R.pos.set(0.21, -0.19, -0.42); R.rot.set(-0.15, 0.05, 0.1);
    L.pos.set(-0.24, -0.27, -0.4); L.rot.set(-0.2, 0.2, 0.1);
    if (innerHeight < 520) { L.pos.set(-0.27, -0.3, -0.42); R.pos.set(0.24, -0.25, -0.42); }
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
    // the wrist comes up across the bottom of the view, gadget towards you, to project the screen
    if (r > 0.001) {
      L.pos.lerp(_v.set(-0.07, -0.2, -0.34), r);
      L.rot.set(L.rot.x * (1 - r) + 0.55 * r, L.rot.y * (1 - r) - 0.25 * r, L.rot.z * (1 - r) - 0.35 * r);
      R.pos.lerp(_v.set(0.26, -0.3, -0.38), r * 0.9);
    }
    // fingers: a fist round whatever is held, open for waves and pokes; the projecting hand opens flat
    const busy = act?.name;
    const fR = busy === 'interact' || busy === 'pet' ? (busy === 'pet' ? HANDS.open : HANDS.point) : emo === 'wave' ? HANDS.open : this.held || busy ? HANDS.grip : HANDS.rest;
    const fL = r > 0.5 ? HANDS.open : act?.name === 'carry' ? HANDS.claw : HANDS.rest;
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
    // the projector beam fans out of the gadget towards the middle of the view
    const B = this.beam;
    B.material.uniforms.uK.value = Math.max(0, (r - 0.4) / 0.6) * (0.85 + 0.15 * Math.sin(t * 31));
    B.material.uniforms.uT.value = t;
    B.visible = r > 0.4 && !!this.gadget;
    if (B.visible) {
      const fb = L.B['forearmL'];
      const o = _v.copy(this.gadget.off).applyQuaternion(fb.quaternion).add(fb.position);
      B.position.copy(o);
      _a.set(0, 0.02, -1.1).sub(o).normalize();
      B.quaternion.setFromUnitVectors(_b.set(0, 0, -1), _a);
      B.scale.set(1, 1, 1.15);
    }
    // with the screen up, nothing in the right hand gets in the way
    if (this.held) this.held.visible = r < 0.6;
    void cam;
  }
}
const _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

export async function install(g) {
  const V = new Viewmodel(g);
  g.viewmodel = V;
  g.addSystem(V);
  return V;
}
