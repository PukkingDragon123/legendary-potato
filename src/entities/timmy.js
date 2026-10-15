// Timmy: your floating ball robot. A glossy white shell with an orange
// equator band, one big camera eye on a little screen (it squints, smiles,
// widens, worries and scans), an antenna with a blinking bulb, two ear
// thrusters and a jet underneath, and a hologram projector lens. He follows
// you around on a soft spring, comes to the front to talk, flies off to scan
// things you point at (R or the middle mouse button) and can be scripted by
// the cinematic and the tutorial (fly to a spot, look at something, point).
import * as THREE from 'three';
import { patchMaterial } from '../gfx/shaderlib.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ the eye screen
export function drawEye(ctx, S, o) {
  const { expr = 'normal', blink = 0, lx = 0, ly = 0, t = 0 } = o;
  ctx.clearRect(0, 0, S, S);
  const c = S / 2;
  ctx.fillStyle = '#04121a'; ctx.beginPath(); ctx.arc(c, c, c, 0, 7); ctx.fill();
  // scanlines and a faint grid in the screen
  ctx.fillStyle = 'rgba(80, 220, 255, 0.07)';
  for (let y = 0; y < S; y += 4) ctx.fillRect(0, y, S, 1);
  const col = expr === 'angry' ? '#ff5a4a' : expr === 'love' ? '#ff7ab8' : expr === 'scan' ? '#7affa0' : '#4ee8ff';
  const ex = c + lx * S * 0.12, ey = c + ly * S * 0.1;
  ctx.shadowColor = col; ctx.shadowBlur = S * 0.08;
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round';
  const lid = Math.max(blink, expr === 'sleepy' ? 0.55 : 0);
  if (expr === 'happy') {
    ctx.lineWidth = S * 0.09;
    ctx.beginPath(); ctx.arc(ex, ey + S * 0.1, S * 0.24, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  } else if (lid > 0.85) {
    ctx.lineWidth = S * 0.07;
    ctx.beginPath(); ctx.moveTo(ex - S * 0.24, ey); ctx.lineTo(ex + S * 0.24, ey); ctx.stroke();
  } else {
    const r = S * (expr === 'surprised' ? 0.3 : 0.26);
    ctx.lineWidth = S * 0.07;
    ctx.beginPath(); ctx.arc(ex, ey, r, 0, 7); ctx.stroke();
    ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(ex, ey, r * 0.72, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    if (expr === 'love') {
      ctx.beginPath(); const hx = ex, hy = ey + S * 0.02, k = S * 0.11;
      ctx.moveTo(hx, hy + k); ctx.bezierCurveTo(hx - k * 1.6, hy - k * 0.2, hx - k * 0.7, hy - k * 1.4, hx, hy - k * 0.5); ctx.bezierCurveTo(hx + k * 0.7, hy - k * 1.4, hx + k * 1.6, hy - k * 0.2, hx, hy + k); ctx.fill();
    } else {
      ctx.fillStyle = '#eaffff'; ctx.beginPath(); ctx.arc(ex, ey, r * (expr === 'surprised' ? 0.28 : 0.42), 0, 7); ctx.fill();
      ctx.fillStyle = '#04121a'; ctx.beginPath(); ctx.arc(ex + lx * S * 0.03, ey + ly * S * 0.03, r * (expr === 'surprised' ? 0.14 : 0.22), 0, 7); ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(ex - r * 0.45, ey - r * 0.5, r * 0.13, 0, 7); ctx.fill();
    // lids: worried tilts the top up at the middle, angry drops it there, sleepy halfway
    const cut = Math.max(lid, expr === 'worried' || expr === 'angry' ? 0.32 : 0);
    if (cut > 0.01) {
      ctx.fillStyle = '#04121a';
      const tilt = expr === 'angry' ? 0.18 : expr === 'worried' ? -0.18 : 0;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(S, 0); ctx.lineTo(S, ey - r + cut * r * 2 - tilt * S); ctx.lineTo(0, ey - r + cut * r * 2 + tilt * S); ctx.closePath(); ctx.fill();
    }
  }
  ctx.shadowBlur = 0;
  if (expr === 'scan') { const y = (t * S * 1.6) % S; ctx.fillStyle = 'rgba(120,255,160,0.85)'; ctx.fillRect(S * 0.1, y, S * 0.8, S * 0.025); }
}

// ------------------------------------------------------------------ the model
let _shared = null;
function shared() {
  if (_shared) return _shared;
  const shell = patchMaterial(new THREE.MeshPhysicalMaterial({ color: 0xeef2f4, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.2 }), {});
  const band = patchMaterial(new THREE.MeshPhysicalMaterial({ color: 0xf07a2a, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 }), {});
  const metal = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x8a96a0, roughness: 0.3, metalness: 0.9 }), {});
  const dark = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x1a242b, roughness: 0.45, metalness: 0.4 }), {});
  const glow = new THREE.MeshBasicMaterial({ color: 0x5ef2ff });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, transparent: true, opacity: 0.18, clearcoat: 1, depthWrite: false });
  return (_shared = { shell, band, metal, dark, glow, glass });
}
function flameMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uK: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uT, uK;
      void main(){ float a = (1.0 - vUv.y) * (0.6 + 0.4 * sin(uT * 40.0 + vUv.y * 20.0)) * uK; gl_FragColor = vec4(vec3(0.4, 0.9, 1.0) * a, a * 0.8); }`,
  });
}
export function buildTimmy() {
  const M = shared();
  const root = new THREE.Group(); root.name = 'timmy';
  const body = new THREE.Group(); root.add(body); // tilts and bobs
  const R = 0.16;
  const mesh = (g, m, cast = true) => { const x = new THREE.Mesh(g, m); x.castShadow = cast; x.receiveShadow = true; return x; };
  body.add(mesh(new THREE.SphereGeometry(R, 48, 32), M.shell));
  // equator band with panel grooves
  const bandG = new THREE.CylinderGeometry(R * 1.015, R * 1.015, R * 0.26, 48, 1, true);
  body.add(mesh(bandG, M.band));
  for (const y of [-0.13, 0.13]) { const ring = mesh(new THREE.TorusGeometry(R * 1.012, 0.0035, 6, 48), M.dark, false); ring.rotation.x = Math.PI / 2; ring.position.y = y * R; body.add(ring); }
  const seam = mesh(new THREE.TorusGeometry(R * 1.002, 0.0022, 6, 48), M.dark, false); body.add(seam); // a vertical seam ring (front to back)
  seam.rotation.y = Math.PI / 2;
  // the eye: a dark bezel, a glowing screen and a glass dome
  const eyeC = document.createElement('canvas'); eyeC.width = eyeC.height = 128;
  const eyeT = new THREE.CanvasTexture(eyeC); eyeT.colorSpace = THREE.SRGBColorSpace;
  const eyeM = new THREE.MeshStandardMaterial({ map: eyeT, emissiveMap: eyeT, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.2 });
  const eyeHolder = new THREE.Group(); eyeHolder.position.set(0, R * 0.12, -R * 0.86); body.add(eyeHolder);
  const bezel = mesh(new THREE.TorusGeometry(R * 0.5, R * 0.09, 12, 40), M.dark, false); eyeHolder.add(bezel);
  const screen = mesh(new THREE.CircleGeometry(R * 0.47, 40), eyeM, false); screen.rotation.y = Math.PI; screen.position.z = -0.002; eyeHolder.add(screen);
  const dome = mesh(new THREE.SphereGeometry(R * 0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.glass, false); dome.rotation.x = -Math.PI / 2; dome.scale.set(1, 1, 0.45); dome.position.z = -0.002; eyeHolder.add(dome);
  // projector lens under the eye
  const lens = mesh(new THREE.CylinderGeometry(R * 0.08, R * 0.1, R * 0.06, 16), M.metal, false); lens.rotation.x = Math.PI / 2; lens.position.set(0, -R * 0.42, -R * 0.9); body.add(lens);
  const lensGlow = mesh(new THREE.CircleGeometry(R * 0.055, 16), M.glow, false); lensGlow.rotation.y = Math.PI; lensGlow.position.set(0, -R * 0.42, -R * 0.935); body.add(lensGlow);
  // antenna with a bulb
  const ant = mesh(new THREE.CylinderGeometry(0.004, 0.006, R * 0.7, 8), M.metal); ant.position.set(R * 0.25, R * 1.25, 0); ant.rotation.z = -0.25; body.add(ant);
  const bulbM = new THREE.MeshBasicMaterial({ color: 0xffc040 });
  const bulb = mesh(new THREE.SphereGeometry(0.012, 12, 8), bulbM, false); bulb.position.set(R * 0.34, R * 1.58, 0); body.add(bulb);
  // ear thrusters with glowing rings, a jet underneath
  const ears = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(sx * R * 0.98, 0, 0); body.add(e);
    const can = mesh(new THREE.CylinderGeometry(R * 0.26, R * 0.3, R * 0.22, 20), M.metal); can.rotation.z = Math.PI / 2; e.add(can);
    const ring = mesh(new THREE.TorusGeometry(R * 0.2, R * 0.035, 8, 20), M.glow, false); ring.rotation.y = Math.PI / 2; ring.position.x = sx * R * 0.12; e.add(ring);
    ears.push(e);
  }
  const jet = mesh(new THREE.CylinderGeometry(R * 0.18, R * 0.24, R * 0.14, 20), M.dark); jet.position.y = -R * 0.98; body.add(jet);
  const flameM = flameMaterial();
  const flame = new THREE.Mesh(new THREE.ConeGeometry(R * 0.16, R * 1.2, 16, 1, true), flameM);
  flame.rotation.x = Math.PI; flame.position.y = -R * 1.65; flame.renderOrder = 6; body.add(flame);
  // the scan beam (a cone from the eye along -Z, scaled to the target)
  const beamM = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uK: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uT, uK;
      void main(){ float along = 1.0 - vUv.y; float sweep = smoothstep(0.06, 0.0, abs(fract(along * 1.0 - uT * 0.9) - 0.5) - 0.44);
        float a = uK * (0.18 + 0.5 * sweep) * smoothstep(0.0, 0.1, along) * (0.7 + 0.3 * sin(vUv.x * 60.0 + uT * 10.0));
        gl_FragColor = vec4(vec3(0.45, 1.0, 0.7) * a, a); }`,
  });
  const beamG = new THREE.ConeGeometry(0.5, 1, 24, 1, true); beamG.translate(0, -0.5, 0); beamG.rotateX(-Math.PI / 2);
  const beam = new THREE.Mesh(beamG, beamM); beam.frustumCulled = false; beam.visible = false; beam.renderOrder = 7;
  eyeHolder.add(beam);
  root.traverse((o) => { if (o.isMesh) o.userData.timmy = true; });
  return { root, body, eye: { canvas: eyeC, ctx: eyeC.getContext('2d'), tex: eyeT, mat: eyeM }, eyeHolder, bulb, ears, flame, beam, R };
}

// ------------------------------------------------------------------ behaviour
export class Timmy {
  constructor(game) {
    this.name = 'timmy';
    this.g = game;
    this.m = buildTimmy();
    game.engine.scene.add(this.m.root);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.tilt = new THREE.Vector2();
    this.t = Math.random() * 10;
    this.face = { expr: 'normal', blink: 0, blinkT: 2, lx: 0, ly: 0 };
    this.mode = 'follow'; // follow | talk | scan | goto | hold
    this.goal = null; // { pos, look, speed, onArrive }
    this.scan = null;
    this.placed = false;
    this.eyeT = 0;
    this.offset = new THREE.Vector3(-1.1, 0.6, 0.35); // relative to the player (in their frame): beside the shoulder, just behind, out of a first-person view
    this.idleT = 3;
  }
  // scripted moves for the cinematic and tutorial
  flyTo(pos, opt = {}) { this.mode = 'goto'; this.goal = { pos: pos.clone(), look: opt.look?.clone?.() ?? null, speed: opt.speed ?? 6, onArrive: opt.onArrive, hold: !!opt.hold }; }
  lookAt(p) { this.lookTarget = p ? p.clone() : null; }
  release() { this.mode = 'follow'; this.goal = null; this.lookTarget = null; }
  // the tutorial points at things: he hovers between you and it (or right over it when you are close)
  guide(p) { if (!p) { this.guidePos = null; return; } (this.guidePos ??= new THREE.Vector3()).copy(p); }
  celebrate(dur = 1.5) { if (this.mode === 'follow' || this.mode === 'celebrate') { this.mode = 'celebrate'; this.celebT = dur; } this.setExpr('happy', dur + 0.5); }
  setExpr(e, hold = 2) { this.face.expr = e; this.face.hold = hold; }
  teleport(p) { this.pos.copy(p); this.vel.set(0, 0, 0); this.placed = true; }
  // scan: fly to a point near the target and sweep it with the beam, then call done()
  startScan(point, done, opt = {}) {
    const p = this.g.local.pos;
    const away = _v.copy(point).sub(p).setY(0);
    const dist = away.length();
    away.normalize();
    const hover = point.clone().addScaledVector(away, -Math.min(1.6, Math.max(0.8, dist * 0.35))).add(_w.set(0, 0.7, 0));
    this.scan = { point: point.clone(), hover, t: 0, dur: opt.dur ?? 1.3, done, started: false };
    this.mode = 'scan';
    this.setExpr('scan', 3);
  }
  update(dt) {
    const g = this.g, M = this.m;
    this.t += dt;
    const t = this.t;
    const pl = g.local;
    const visible = !g.titleMode || g.timmyInTitle;
    M.root.visible = visible;
    if (!visible || !pl) return;
    const py = pl.yaw;
    const fwd = _v.set(-Math.sin(py), 0, -Math.cos(py));
    const right = _w.set(-fwd.z, 0, fwd.x);
    // where he wants to be
    let target = null, look = null, speed = 5;
    if (this.mode === 'goto' && this.goal) { target = this.goal.pos; look = this.goal.look; speed = this.goal.speed; }
    else if (this.mode === 'scan' && this.scan) { target = this.scan.hover; look = this.scan.point; speed = 7; }
    else if (this.guidePos && !g.holo?.line && pl.pos.distanceTo(this.guidePos) > 2.2) {
      // lead the way: out ahead of you towards the thing, a little above head height
      const gp = this.guidePos;
      const dx = gp.x - pl.pos.x, dz = gp.z - pl.pos.z, d = Math.hypot(dx, dz) || 1;
      const k = d > 7 ? Math.min(4.5, d * 0.45) : Math.max(1.2, d - 1.4);
      target = new THREE.Vector3(pl.pos.x + dx / d * k, Math.max(pl.pos.y, gp.y) + 1.55, pl.pos.z + dz / d * k);
      look = gp; speed = 6;
    } else {
      const talking = g.holo?.line;
      // when he talks he comes round in front of you, a couple of metres out, so you can see his face
      const o = talking ? new THREE.Vector3(-0.85, 0.75, -2.1) : this.offset;
      target = pl.pos.clone().addScaledVector(right, o.x).addScaledVector(fwd, -o.z).add(new THREE.Vector3(0, o.y + 0.35, 0));
      // wander a little when idle
      this.idleT -= dt;
      if (this.idleT <= 0) { this.idleT = 3 + Math.random() * 4; this.offset.set((Math.random() < 0.5 ? -1 : 1) * (0.95 + Math.random() * 0.4), 0.45 + Math.random() * 0.4, 0.15 + Math.random() * 0.5); }
      look = talking ? g.engine.camera.position : this.lookTarget ?? pl.pos.clone().add(new THREE.Vector3(0, 0.9, 0)).addScaledVector(fwd, 2.5);
    }
    if (!this.placed) { this.teleport(target); }
    // keep above the ground and out of the water
    const gy = Math.max(g.sampler.heightAt(target.x, target.z), g.sampler.waterAt(target.x, target.z));
    if (target.y < gy + 0.45) target.y = gy + 0.45;
    // spring towards the target (critically damped, capped speed)
    const k = Math.min(60, speed * 2.2), c = 2 * Math.sqrt(k);
    _v.copy(target).sub(this.pos).multiplyScalar(k).addScaledVector(this.vel, -c);
    this.vel.addScaledVector(_v, dt);
    if (this.vel.length() > speed * 2) this.vel.setLength(speed * 2);
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.distanceTo(target) > 40) this.teleport(target);
    // arrival callbacks
    if (this.mode === 'goto' && this.goal && this.pos.distanceTo(this.goal.pos) < 0.25) {
      const cb = this.goal.onArrive; this.goal.onArrive = null;
      if (!this.goal.hold) this.release();
      cb?.();
    }
    // scanning
    let beamK = 0;
    if (this.mode === 'scan' && this.scan) {
      const S = this.scan;
      if (this.pos.distanceTo(S.hover) < 0.6 || S.started) {
        S.started = true; S.t += dt; beamK = Math.min(1, S.t * 4) * (S.t > S.dur ? Math.max(0, 1 - (S.t - S.dur) * 5) : 1);
        if (Math.random() < 0.4) g.fx?.sprite('ring', S.point.x, S.point.y, S.point.z, { color: 0x60ffb0, size: 0.25 + Math.random() * 0.3, life: 0.35, alpha: 0.6, grow: 1.5 });
        if (S.t > S.dur + 0.2) { this.scan = null; this.release(); this.setExpr('happy', 1.5); S.done?.(); }
      } else if (S.t > -5) { S.t -= dt; if (S.t < -4) { this.scan = null; this.release(); } }
    }
    // face the look target (yaw only for the body, the eye tilts a little more)
    if (look) {
      _v.copy(look).sub(this.pos);
      const wantYaw = Math.atan2(-_v.x, -_v.z);
      let d = wantYaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 6);
      const flat = Math.hypot(_v.x, _v.z);
      this.pitch = (this.pitch ?? 0) + (Math.atan2(_v.y, flat) * 0.6 - (this.pitch ?? 0)) * Math.min(1, dt * 5);
    }
    // bank into the motion and bob
    const lv = _w.copy(this.vel);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const side = lv.x * cy - lv.z * sy, ahead = -(lv.x * sy + lv.z * cy);
    this.tilt.x += ((-ahead * 0.08) - this.tilt.x) * Math.min(1, dt * 5);
    this.tilt.y += ((-side * 0.1) - this.tilt.y) * Math.min(1, dt * 5);
    M.root.position.copy(this.pos);
    M.root.rotation.set(0, this.yaw, 0);
    M.body.position.y = Math.sin(t * 2.3) * 0.03;
    M.body.rotation.set(this.tilt.x + (this.pitch ?? 0) * 0.5, 0, this.tilt.y + Math.sin(t * 1.7) * 0.04);
    if (this.mode === 'celebrate') {
      M.body.rotation.y = t * 9; M.body.position.y += Math.abs(Math.sin(t * 9)) * 0.12;
      this.celebT -= dt; if (this.celebT <= 0) { this.mode = 'follow'; M.body.rotation.y = 0; }
      if (Math.random() < dt * 8) g.fx?.stars?.(this.pos.clone().add(_w.set(0, 0.2, 0)), 1);
    }
    // thrusters and jet flicker
    M.flame.material.uniforms.uT.value = t;
    M.flame.material.uniforms.uK.value = 0.6 + Math.min(1, this.vel.length() * 0.2);
    M.flame.scale.y = 0.8 + Math.sin(t * 37) * 0.1 + Math.min(0.8, this.vel.length() * 0.15);
    for (const [i, e] of M.ears.entries()) e.rotation.x = Math.sin(t * 3 + i) * 0.15 - ahead * 0.06;
    M.bulb.material.color.setHex(Math.sin(t * 4) > 0.2 ? 0xffc040 : 0x6a4a10);
    // beam
    M.beam.visible = beamK > 0.01;
    if (M.beam.visible && this.scan) {
      M.eyeHolder.updateWorldMatrix(true, false);
      const L = M.eyeHolder.worldToLocal(_v.copy(this.scan.point));
      const len = L.length();
      M.beam.quaternion.setFromUnitVectors(_w.set(0, 0, -1), L.normalize());
      M.beam.scale.set(0.5 + len * 0.25, 0.5 + len * 0.25, len);
      M.beam.material.uniforms.uK.value = beamK;
      M.beam.material.uniforms.uT.value = t;
    }
    // the eye follows the holo dialogue face when he talks
    const F = this.face;
    if (g.holo?.line && !this.scan) F.expr = g.holo.face.expr;
    else if (F.hold > 0) { F.hold -= dt; if (F.hold <= 0) F.expr = 'normal'; }
    F.blinkT -= dt; if (F.blinkT <= 0) { F.blink = 1; F.blinkT = 2 + Math.random() * 3.5; }
    F.blink = Math.max(0, F.blink - dt * 7);
    F.lx = Math.sin(t * 0.8) * 0.5; F.ly = Math.sin(t * 0.55) * 0.3;
    this.eyeT -= dt;
    if (this.eyeT <= 0) { this.eyeT = 1 / 15; drawEye(M.eye.ctx, 128, { expr: F.expr, blink: F.blink > 0.5 ? 1 : 0, lx: F.lx, ly: F.ly, t }); M.eye.tex.needsUpdate = true; }
    void _q; void _m; void UP;
  }
}

export async function install(g) {
  const T = new Timmy(g);
  g.timmy = T;
  g.addSystem(T);
  // R or the middle mouse button: Timmy scans what you are looking at
  g.addSystem({
    name: 'timmyScan',
    update() {
      const inp = g.input, R = g.research;
      if (!R || g.uiOpen || g.titleMode || g.building?.active || !g.local) return;
      const held = g.inventory?.heldDef?.();
      const gun = held && ['rifle', 'sling', 'blowgun'].includes(held.tool?.kind);
      if (!(inp.pressed('scan') && !gun)) return;
      if (T.scan || R.scanJob) return;
      const tgt = g.interaction?.scan?.(30) ?? g.interaction?.target;
      const d = tgt ? R.describe(tgt) : null;
      if (!d) { g.holo?.say('Nothing to scan there, boss. Point me at a plant, a rock or a creature.', { expr: 'worried' }); return; }
      const point = g.interaction.aimPoint(tgt.dist ?? 3);
      g.audio?.play('scan', { pos: point, vol: 0.7 });
      T.startScan(point, () => { R.finishScan({ d, point, tgt }); g.events.emit('timmyScanned', { d, tgt }); }, { dur: d.key === R.lastKey ? 0.6 : 1.3 });
    },
  });
  return T;
}
